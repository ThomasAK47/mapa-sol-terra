// =============================================================================
// cards.js — desenha os cards no mapa.
//
// Cada card é um <div class="card"> dentro de #camada-cards. As propriedades
// left/top recebem a posição do CENTRO do card no mundo (o CSS desloca metade
// do tamanho). A cada mudança nos dados, renderizar() compara a tela com os
// dados e só altera o necessário.
//
// Hierarquia: cards de nível mais alto são maiores (classes nivel-1, nivel-2,
// nivel-3 reduzem a escala); cards dentro de um pai recolhido ficam
// escondidos, e o pai mostra um contador "+N" (que também é o botão de
// expandir). Busca e modo foco viram classes nos cards e no #palco.
// A flutuação dos cards (efeitos) é feita em CSS; aqui só se define o ritmo
// de cada um.
// =============================================================================

import { aoMudarCamera } from './camera.js';
import { resultadosDaBusca } from './busca.js';
import { assinar, geometria, obterDados, ui } from './estado.js';
import { focoAtual } from './foco.js';
import { escalaDoNivel, estaRecolhido, hierarquia } from './hierarquia.js';
import { posicaoAbsoluta } from './modelo.js';
import { el, icone, plural } from './util.js';

const LIMITE_DESCRICAO = 240; // o card mostra só o começo da descrição
const TAMANHO_PADRAO = { largura: 220, altura: 76 };

const itens = new Map();     // id → { id, raiz, titulo, descricao, icones, recolher, … }
const tamanhos = new Map();  // id → { largura, altura } medidos (sem a escala do nível)
const aposRenderizar = [];   // funções chamadas depois de cada renderização
let camada = null;
let palco = null;
let renderPendente = false;
let nivelDeDetalhe = null;
const estadoDoPalco = { 'modo-foco': false, 'modo-busca': false };

export function iniciarCards(elementoCamada, elementoPalco) {
  camada = elementoCamada;
  palco = elementoPalco;
  assinar(agendarRender);
  aoMudarCamera(atualizarNivelDeDetalhe);
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

    if (atualizarConteudo(item, card)) paraMedir.push(item);
    const { X, Y } = posicaoAbsoluta(card, geo);
    if (item.X !== X) {
      item.raiz.style.left = `${X}px`;
      item.X = X;
    }
    if (item.Y !== Y) {
      item.raiz.style.top = `${Y}px`;
      item.Y = Y;
    }

    const nivel = Math.min(h.nivel.get(card.id) ?? 0, 3);
    if (item.nivel !== nivel) {
      if (item.nivel) item.raiz.classList.remove(`nivel-${item.nivel}`);
      if (nivel) item.raiz.classList.add(`nivel-${nivel}`);
      item.nivel = nivel;
    }
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
  // offsetWidth/offsetHeight ignoram o zoom e a escala do nível: o resultado
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
  // Alça de conexão, no meio da borda de baixo: arrastá-la até outro card cria
  // uma conexão. (A linha sai do lado que aponta para o outro card, seja qual
  // for o ponto de partida; por isso basta uma alça.)
  const alca = el('span', { class: 'alca', title: 'Arraste até outro card para criar uma conexão' });
  const raiz = el('div', { class: 'card', 'data-id': id },
    el('div', { class: 'card-corpo' }, titulo, descricao, icones, recolher, alca),
  );
  definirRitmoDaFlutuacao(raiz, id);
  return {
    id, raiz, titulo, descricao, icones, recolher,
    assinatura: null, X: null, Y: null, nivel: 0, oculto: false, estadoRecolher: null, classes: {},
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
  const assinatura = [card.titulo, card.descricao, card.linkDocs ? 1 : 0, card.animacao ? 1 : 0].join('\u0001');
  if (assinatura === item.assinatura) return false;
  item.assinatura = assinatura;

  const titulo = card.titulo.trim();
  item.titulo.textContent = titulo || 'sem título';
  item.titulo.classList.toggle('vazio', !titulo);

  const descricao = card.descricao.trim();
  item.descricao.textContent = descricao.length > LIMITE_DESCRICAO ? `${descricao.slice(0, LIMITE_DESCRICAO)}…` : descricao;
  item.descricao.hidden = !descricao;

  const botoes = [];
  if (card.animacao) botoes.push(botaoDeAcao('animacao', 'animacao', 'Abrir a animação'));
  if (card.linkDocs) botoes.push(botaoDeAcao('docs', 'documento', 'Abrir no Google Docs'));
  item.icones.replaceChildren(...botoes);
  item.icones.hidden = botoes.length === 0;
  return true;
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
 * Faixa de zoom, usada pelo CSS: esconde a descrição quando o zoom está
 * longe (o texto ficaria ilegível) e ajusta o tamanho das alças.
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

/** Tamanho do card em unidades do mundo (já com a escala do nível). */
export function tamanhoDoCard(id) {
  const tamanho = tamanhos.get(id) ?? TAMANHO_PADRAO;
  const escala = escalaDoNivel(itens.get(id)?.nivel ?? 0);
  return { largura: tamanho.largura * escala, altura: tamanho.altura * escala };
}

/** Marca visualmente o card que está sendo arrastado. */
export function marcarArrastando(id, sim) {
  itens.get(id)?.raiz.classList.toggle('arrastando', sim);
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
