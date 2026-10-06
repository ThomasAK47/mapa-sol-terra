// =============================================================================
// cards.js — desenha os cards no mapa.
//
// Cada card é um <div class="card"> dentro de #camada-cards. As propriedades
// left/top recebem a posição do CENTRO do card no mundo (o CSS desloca metade
// do tamanho). A cada mudança nos dados, renderizar() compara a tela com os
// dados e só altera o necessário.
//
// Tamanho: cada card é ampliado ou reduzido conforme o nível hierárquico, o
// tamanho próprio dele e dos ancestrais e o tamanho geral (a conta fica em
// js/hierarquia.js). A alça no canto inferior direito muda o tamanho próprio.
// Hierarquia: cards dentro de um pai recolhido ficam escondidos, e o pai
// mostra um contador "+N" (que também é o botão de expandir). Busca e modo
// foco viram classes nos cards e no #palco.
// A flutuação dos cards (efeitos) é feita em CSS; aqui só se define o ritmo
// de cada um.
//
// Legibilidade: o que o card mostra depende do tamanho REAL dele na tela
// (zoom × tamanho do card), e não só do zoom. Um card grande continua
// completo com o zoom mais afastado:
//   • faixa "completo": título, descrição e o ícone do Docs;
//   • faixa "compacto": a descrição ficaria pequena demais para ler, e o card
//     mostra só o título. O título cresce dentro do card para continuar com
//     uns TITULO.alvoNaTela px na tela, até o maior tamanho que cabe na
//     largura do card sem quebrar palavras (tamanhoMaximoDoTitulo); daí em
//     diante, ele diminui com o zoom, como o resto do mapa.
// O botão ▶ (animações) fica no alto do card, em qualquer zoom, e não fica
// menor que BOTAO_ANIMACAO.minimoNaTela px na tela.
// Desempenho: esses ajustes mudam o tamanho dos cards (é preciso medi-los de
// novo e redesenhar as conexões) e obrigam o navegador a repintar o mapa.
// Por isso eles NÃO acontecem durante o movimento: são feitos uma vez, quando
// o zoom para (ESPERA_PARA_AJUSTAR ms sem mudar). Durante o gesto, os cards
// só acompanham o zoom, como antes.
// =============================================================================

import { aoMudarCamera, obterCamera } from './camera.js';
import { resultadosDaBusca } from './busca.js';
import { assinar, geometria, obterDados, ui } from './estado.js';
import { focoAtual } from './foco.js';
import { estaRecolhido, hierarquia } from './hierarquia.js';
import { posicaoAbsoluta } from './modelo.js';
import { el, icone, plural } from './util.js';

const LIMITE_DESCRICAO = 240; // o card mostra só o começo da descrição
const TAMANHO_PADRAO = { largura: 220, altura: 76 };

// Faixas de detalhe de cada card, pela escala dele na tela (zoom × tamanho do
// card; 1 = tamanho normal). Abaixo de COMPLETO_A_PARTIR_DE, a descrição
// (12,5 px no tamanho normal) ficaria com menos de ~9 px na tela, e o card
// passa para a faixa "compacto".
const COMPLETO_A_PARTIR_DE = 0.7;

// Título (tamanhos em px, no tamanho normal do card). Na faixa "compacto" ele
// vai de "normal" até, no máximo, "maximo" (ou menos, se uma palavra não
// couber inteira em "larguraUtil", ou se o título passar de "linhas" linhas).
// Os números acompanham o CSS (.card-corpo e .card-titulo).
const TITULO = { normal: 15, alvoNaTela: 12, maximo: 26, linhas: 3, larguraUtil: 220 - 2 * 13 - 4 };

// Botão ▶ das animações: 24 px no tamanho normal do card; com o zoom
// afastado, ele cresce para continuar com pelo menos 20 px na tela.
const BOTAO_ANIMACAO = { base: 24, minimoNaTela: 20 };

// Tempo sem mudança de zoom até os cards se ajustarem (faixa, título, botão ▶).
const ESPERA_PARA_AJUSTAR = 300;

const itens = new Map();     // id → { id, raiz, titulo, descricao, icones, recolher, animacao, … }
const tamanhos = new Map();  // id → { largura, altura } medidos (em tamanho normal, sem escala)
const aposRenderizar = [];   // funções chamadas depois de cada renderização
let camada = null;
let palco = null;
let renderPendente = false;
let nivelDeDetalhe = null;
let regua = null;            // contexto de canvas usado para medir os títulos
let familiaDosTitulos = '';
let zoomDosAjustes = null;   // zoom usado no último ajuste dos cards
let temporizadorAjuste = null;
const estadoDoPalco = { 'modo-foco': false, 'modo-busca': false };

export function iniciarCards(elementoCamada, elementoPalco) {
  camada = elementoCamada;
  palco = elementoPalco;
  assinar(agendarRender);
  aoMudarCamera(atualizarNivelDeDetalhe);
  aoMudarCamera(acompanharZoom);
  // Quando a fonte Inter termina de carregar, o tamanho dos cards muda.
  document.fonts?.ready.then(() => {
    for (const item of itens.values()) item.assinatura = null;
    agendarRender();
  });
}

export function agendarRender() {
  if (renderPendente) return;
  renderPendente = true;
  requestAnimationFrame(() => {
    renderPendente = false;
    renderizarAgora();
  });
}

/**
 * Registra uma função chamada logo depois de cada renderização dos cards
 * (as conexões usam isto: elas dependem da posição e do tamanho dos cards).
 */
export function aoRenderizarCards(funcao) {
  aposRenderizar.push(funcao);
}

function marcarPalco(classe, sim) {
  if (estadoDoPalco[classe] !== sim) {
    estadoDoPalco[classe] = sim;
    palco.classList.toggle(classe, sim);
  }
}

/** Liga/desliga uma classe no card, só tocando no DOM quando muda. */
function marcar(item, classe, sim) {
  if ((item.classes[classe] ?? false) !== sim) {
    item.classes[classe] = sim;
    item.raiz.classList.toggle(classe, sim);
  }
}

/** Atualiza a tela para refletir os dados (pode ser chamado a qualquer hora). */
export function renderizarAgora() {
  const dados = obterDados();
  if (!dados || !camada) return;
  const geo = geometria();
  const h = hierarquia();
  const foco = focoAtual();
  const busca = resultadosDaBusca();
  const zoom = obterCamera().escala;
  zoomDosAjustes = zoom;
  const presentes = new Set();
  const paraMedir = [];

  marcarPalco('modo-foco', Boolean(foco));
  marcarPalco('modo-busca', Boolean(busca));
  // Pais recolhidos que escondem algum resultado da busca.
  const contemResultado = new Set();
  if (busca) {
    for (const id of busca.ids) {
      const rep = h.representante.get(id);
      if (rep && rep !== id) contemResultado.add(rep);
    }
  }

  for (const card of dados.cards) {
    presentes.add(card.id);
    let item = itens.get(card.id);
    if (!item) {
      item = criarItem(card.id);
      itens.set(card.id, item);
      camada.append(item.raiz);
    }

    const visivel = h.visiveis.has(card.id);
    if (item.oculto !== !visivel) {
      item.oculto = !visivel;
      item.raiz.hidden = !visivel;
    }
    if (!visivel) continue; // escondido dentro de um pai recolhido

    const conteudoMudou = atualizarConteudo(item, card);
    const { X, Y } = posicaoAbsoluta(card, geo);
    if (item.X !== X) {
      item.raiz.style.left = `${X}px`;
      item.X = X;
    }
    if (item.Y !== Y) {
      item.raiz.style.top = `${Y}px`;
      item.Y = Y;
    }

    // Tamanho final (nível × tamanho próprio × ancestrais × geral), aplicado em
    // volta do centro do card, que continua em left/top.
    const escala = Number((h.escala.get(card.id) ?? 1).toFixed(4));
    if (item.escala !== escala) {
      item.raiz.style.transform = escala === 1 ? '' : `translate(-50%, -50%) scale(${escala})`;
      item.escala = escala;
    }
    // A faixa muda o tamanho do card (a descrição aparece ou some): medir de novo.
    const faixaMudou = aplicarFaixa(item, zoom);
    if (conteudoMudou || faixaMudou) paraMedir.push(item);
    ajustarBotaoAnimacao(item, zoom);
    atualizarBotaoRecolher(item, card, h);

    marcar(item, 'selecionado', ui.selecionado === card.id);
    marcar(item, 'em-foco', Boolean(foco?.cards.has(card.id)));
    marcar(item, 'resultado-busca', Boolean(busca?.ids.has(card.id)));
    marcar(item, 'resultado-atual', busca?.atual === card.id);
    marcar(item, 'contem-resultado', contemResultado.has(card.id));
  }

  for (const [id, item] of itens) {
    if (!presentes.has(id)) {
      item.raiz.remove();
      itens.delete(id);
      tamanhos.delete(id);
    }
  }

  // Mede depois de todas as mudanças (uma única leitura de layout).
  // offsetWidth/offsetHeight ignoram o zoom e a escala do card: o resultado
  // está em unidades do mundo, para o card em tamanho normal.
  for (const item of paraMedir) {
    tamanhos.set(item.id, { largura: item.raiz.offsetWidth, altura: item.raiz.offsetHeight });
  }

  for (const funcao of aposRenderizar) funcao();
}

function criarItem(id) {
  const titulo = el('div', { class: 'card-titulo' });
  const descricao = el('div', { class: 'card-descricao' });
  const icones = el('div', { class: 'card-icones' });
  // Botão no canto: "+N" num pai recolhido (expande); "−" num pai expandido (recolhe).
  const recolher = el('button', { class: 'card-recolher', type: 'button', hidden: true });
  // Botão ▶ na borda de cima, à esquerda: abre as animações do card (com o
  // número delas quando são várias). O clique é tratado em js/interacao.js.
  const animacao = el('button', { class: 'card-acao card-animacao', type: 'button', 'data-acao': 'animacao', hidden: true });
  // Alça de conexão, no meio da borda de baixo: arrastá-la até outro card cria
  // uma conexão. (A linha sai do lado que aponta para o outro card, seja qual
  // for o ponto de partida; por isso basta uma alça.)
  const alca = el('span', { class: 'alca', title: 'Arraste até outro card para criar uma conexão' });
  // Alça de tamanho, no canto inferior direito: arrastá-la aumenta ou diminui
  // este card (e os descendentes dele, na mesma proporção).
  const alcaTamanho = el('span', {
    class: 'alca-tamanho',
    title: 'Arraste para mudar o tamanho do card (os filhos acompanham). Duplo clique: tamanho normal.',
  });
  const raiz = el('div', { class: 'card', 'data-id': id },
    el('div', { class: 'card-corpo' }, titulo, descricao, icones, recolher, animacao, alca, alcaTamanho),
  );
  definirRitmoDaFlutuacao(raiz, id);
  return {
    id, raiz, titulo, descricao, icones, recolher, animacao,
    assinatura: null, X: null, Y: null, escala: 1, oculto: false, estadoRecolher: null, classes: {},
    faixa: null, tituloCompacto: null, tituloMaximo: TITULO.normal, temAnimacao: false, escalaDoBotao: '',
  };
}

/**
 * Flutuação (com os efeitos ligados, o card sobe e desce alguns pixels; veja
 * css/estilo.css). Aqui só se define o ritmo de cada card: duração, ponto de
 * partida e direção saem do id, então os vizinhos não se movem juntos e o
 * ritmo de um card é sempre o mesmo. A posição salva nunca muda.
 */
function definirRitmoDaFlutuacao(raiz, id) {
  let numero = 2166136261;
  for (let i = 0; i < id.length; i++) numero = Math.imul(numero ^ id.charCodeAt(i), 16777619) >>> 0;
  // Duração de uma subida (ou descida): de 4,0 a 7,0 s. O "atraso" negativo faz
  // cada card começar num ponto diferente do vaivém.
  raiz.style.setProperty('--flut-duracao', `${(4 + (numero % 31) / 10).toFixed(1)}s`);
  raiz.style.setProperty('--flut-atraso', `${(-((numero >>> 8) % 140) / 10).toFixed(1)}s`);
  raiz.classList.add(['flut-a', 'flut-b', 'flut-c'][(numero >>> 16) % 3]);
}

/** Atualiza o texto do card. Devolve true se algo mudou (precisa medir). */
function atualizarConteudo(item, card) {
  const assinatura = [card.titulo, card.descricao, card.linkDocs ? 1 : 0, card.animacoes.length].join('\u0001');
  if (assinatura === item.assinatura) return false;
  item.assinatura = assinatura;

  const titulo = card.titulo.trim();
  item.titulo.textContent = titulo || 'sem título';
  item.titulo.classList.toggle('vazio', !titulo);
  item.tituloMaximo = tamanhoMaximoDoTitulo(titulo || 'sem título');

  const descricao = card.descricao.trim();
  item.descricao.textContent = descricao.length > LIMITE_DESCRICAO ? `${descricao.slice(0, LIMITE_DESCRICAO)}…` : descricao;
  item.descricao.hidden = !descricao;

  const botoes = [];
  if (card.linkDocs) botoes.push(botaoDeAcao('docs', 'documento', 'Abrir no Google Docs'));
  item.icones.replaceChildren(...botoes);
  item.icones.hidden = botoes.length === 0;

  // Botão ▶: com várias animações, mostra quantas são.
  const n = card.animacoes.length;
  item.temAnimacao = n > 0;
  item.animacao.hidden = n === 0;
  item.animacao.replaceChildren(icone('tocar'));
  if (n > 1) item.animacao.append(el('span', { class: 'card-animacao-numero' }, String(n)));
  item.animacao.classList.toggle('varias', n > 1);
  const dica = n > 1 ? `Abrir as ${n} animações deste card` : 'Abrir a animação';
  item.animacao.title = dica;
  item.animacao.setAttribute('aria-label', dica);
  return true;
}

/**
 * Maior tamanho do título na faixa "compacto" (em px, no tamanho normal do
 * card): até TITULO.maximo, sem quebrar nenhuma palavra e em no máximo
 * TITULO.linhas linhas. A largura de um texto é proporcional ao tamanho da
 * letra, então basta medir cada palavra uma vez (a 100 px) e testar os
 * tamanhos com uma conta.
 */
function tamanhoMaximoDoTitulo(texto) {
  if (!regua) {
    regua = document.createElement('canvas').getContext('2d');
    familiaDosTitulos = getComputedStyle(document.body).fontFamily; // Inter, com as reservas do sistema
  }
  // Definida a cada vez: assim a medida usa a Inter assim que ela termina de carregar.
  regua.font = `600 100px ${familiaDosTitulos}`;
  const palavras = texto.split(/\s+/).filter(Boolean).map((p) => regua.measureText(p).width);
  const espaco = regua.measureText(' ').width;
  const { maximo, normal: minimo, linhas, larguraUtil } = TITULO;
  for (let tamanho = maximo; tamanho > minimo; tamanho--) {
    const f = tamanho / 100;
    if (palavras.some((largura) => largura * f > larguraUtil)) continue;
    let linhasUsadas = 1;
    let ocupado = 0;
    for (const largura of palavras) {
      if (ocupado === 0) ocupado = largura * f;
      else if (ocupado + (espaco + largura) * f <= larguraUtil) ocupado += (espaco + largura) * f;
      else {
        linhasUsadas++;
        ocupado = largura * f;
      }
    }
    if (linhasUsadas <= linhas) return tamanho;
  }
  return minimo;
}

/**
 * Faixa de detalhe que o card deve ter neste zoom, pela escala dele na tela,
 * e o tamanho do título na faixa "compacto" (null na faixa "completo"): o que
 * deixa o título com TITULO.alvoNaTela px na tela, dentro dos limites.
 */
function alvoNoZoom(item, zoom) {
  const naTela = zoom * item.escala;
  if (naTela >= COMPLETO_A_PARTIR_DE) return { faixa: 'completo', titulo: null };
  const ideal = Math.round(TITULO.alvoNaTela / naTela);
  return { faixa: 'compacto', titulo: Math.min(Math.max(ideal, TITULO.normal), item.tituloMaximo) };
}

/**
 * Aplica a faixa (atributo data-faixa, usado pelo CSS) e o tamanho do título.
 * Devolve true se algo mudou (o card precisa ser medido de novo).
 */
function aplicarFaixa(item, zoom) {
  const alvo = alvoNoZoom(item, zoom);
  if (alvo.faixa === item.faixa && alvo.titulo === item.tituloCompacto) return false;
  if (alvo.faixa !== item.faixa) {
    item.faixa = alvo.faixa;
    item.raiz.dataset.faixa = alvo.faixa;
  }
  if (alvo.titulo !== item.tituloCompacto) {
    item.tituloCompacto = alvo.titulo;
    item.titulo.style.fontSize = alvo.titulo === null ? '' : `${alvo.titulo}px`;
  }
  return true;
}

/** Aumenta o botão ▶ quando ele ficaria pequeno demais na tela. */
function ajustarBotaoAnimacao(item, zoom) {
  if (!item.temAnimacao) return;
  const naTela = BOTAO_ANIMACAO.base * zoom * item.escala;
  const valor = naTela >= BOTAO_ANIMACAO.minimoNaTela ? '' : (BOTAO_ANIMACAO.minimoNaTela / naTela).toFixed(3);
  if (valor !== item.escalaDoBotao) {
    item.escalaDoBotao = valor;
    item.animacao.style.scale = valor;
  }
}

/**
 * A cada mudança da câmera: se o zoom mudou, os cards se ajustam (faixa,
 * título, botão ▶) quando ele parar de mudar. Mover o mapa sem zoom não muda
 * nada.
 */
function acompanharZoom(camera) {
  clearTimeout(temporizadorAjuste);
  // Só o mapa se moveu (ou o zoom voltou ao do último ajuste): nada a ajustar.
  if (camera.escala !== zoomDosAjustes) temporizadorAjuste = setTimeout(agendarRender, ESPERA_PARA_AJUSTAR);
}

function botaoDeAcao(acao, nomeIcone, dica) {
  return el('button', { class: 'card-acao', type: 'button', 'data-acao': acao, title: dica, 'aria-label': dica }, icone(nomeIcone));
}

/** Contador "+N" (pai recolhido) ou botão "−" (pai expandido). */
function atualizarBotaoRecolher(item, card, h) {
  const nFilhos = h.filhos.get(card.id)?.length ?? 0;
  const recolhido = nFilhos > 0 && estaRecolhido(card);
  const escondidos = recolhido ? (h.totalDescendentes.get(card.id) ?? 0) : 0;
  const estado = nFilhos === 0 ? '' : recolhido ? `+${escondidos}` : `-${nFilhos}`;
  if (item.estadoRecolher === estado) return;
  item.estadoRecolher = estado;

  const botao = item.recolher;
  botao.hidden = nFilhos === 0;
  if (nFilhos === 0) return;
  botao.classList.toggle('recolhido', recolhido);
  botao.classList.toggle('expandido', !recolhido);
  if (recolhido) {
    botao.textContent = `+${escondidos}`;
    botao.title = `Expandir (${plural(escondidos, 'card escondido', 'cards escondidos')})`;
  } else {
    botao.replaceChildren(icone('menos'));
    botao.title = nFilhos === 1 ? 'Recolher o card filho' : `Recolher os ${nFilhos} cards filhos`;
  }
  botao.setAttribute('aria-label', botao.title);
}

/**
 * Faixa de zoom do mapa todo (data-detalhe no #palco), usada pelo CSS para as
 * alças, os textos das conexões e a flutuação. (O conteúdo de cada card segue
 * a faixa do próprio card: veja aplicarFaixa.)
 */
function atualizarNivelDeDetalhe(camera) {
  const e = camera.escala;
  const nivel = e < 0.25 ? 'baixo' : e < 0.5 ? 'medio' : e < 1.5 ? 'alto' : 'perto';
  if (nivel !== nivelDeDetalhe) {
    nivelDeDetalhe = nivel;
    palco.dataset.detalhe = nivel;
  }
}

// --- Consultas usadas por outros módulos -----------------------------------------

/** Tamanho do card em unidades do mundo (já com o tamanho final aplicado). */
export function tamanhoDoCard(id) {
  const tamanho = tamanhos.get(id) ?? TAMANHO_PADRAO;
  const escala = itens.get(id)?.escala ?? 1;
  return { largura: tamanho.largura * escala, altura: tamanho.altura * escala };
}

/** Marca visualmente o card que está sendo arrastado. */
export function marcarArrastando(id, sim) {
  itens.get(id)?.raiz.classList.toggle('arrastando', sim);
}

/**
 * Marca o card cujo tamanho está sendo mudado e mostra o valor ao lado dele
 * (ex.: "125%"). Com "texto" nulo, tira a marca.
 */
export function marcarRedimensionando(id, texto) {
  const raiz = itens.get(id)?.raiz;
  if (!raiz) return;
  raiz.classList.toggle('redimensionando', texto !== null);
  if (texto === null) delete raiz.dataset.tamanho;
  else raiz.dataset.tamanho = texto;
}

/** Marca visualmente o card que vai receber a conexão sendo criada. */
export function marcarAlvoDeConexao(id, sim) {
  itens.get(id)?.raiz.classList.toggle('alvo-conexao', sim);
}

/** Retângulo que contém todos os cards visíveis (ou null se não há nenhum). */
export function limitesDosCards() {
  const dados = obterDados();
  if (!dados) return null;
  const { visiveis } = hierarquia();
  const geo = geometria();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const card of dados.cards) {
    if (!visiveis.has(card.id)) continue;
    const { X, Y } = posicaoAbsoluta(card, geo);
    const { largura, altura } = tamanhoDoCard(card.id);
    minX = Math.min(minX, X - largura / 2);
    maxX = Math.max(maxX, X + largura / 2);
    minY = Math.min(minY, Y - altura / 2);
    maxY = Math.max(maxY, Y + altura / 2);
  }
  if (minX === Infinity) return null;
  return { x: minX, y: minY, largura: maxX - minX, altura: maxY - minY };
}
