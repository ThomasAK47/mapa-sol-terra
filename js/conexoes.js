// =============================================================================
// conexoes.js — desenha as linhas do mapa.
//
//   • Conexões entre cards: curvas SVG dentro de #mundo (acompanham pan e
//     zoom), com um texto curto no meio e, se forem direcionais, uma seta.
//     Várias conexões entre o mesmo par de cards viram curvas separadas,
//     abertas em leque (uma só conexão fica reta).
//   • Linhas pai → filho: retas, finas e mais escuras, sem texto nem seta,
//     com um pontinho no lado do pai.
//   • Conexões de cards escondidos (dentro de um pai recolhido) passam a sair
//     do pai recolhido, tracejadas. Se forem várias entre os mesmos dois
//     cards visíveis, viram uma linha só, com a contagem ("3 conexões");
//     clicar nela expande os pais que escondem os cards.
//   • Conexões entre dois cards escondidos sob o mesmo pai recolhido somem.
//
// As pontas param alguns pixels antes da borda dos cards (assim a flutuação,
// na Fase 5, não "encosta" nas setas). A espessura das linhas e o tamanho das
// setas ficam constantes na tela em qualquer zoom: os atributos stroke-width
// do <svg> e dos grupos (herdados pelas linhas; as setas acompanham) são
// ajustados quando o zoom muda o suficiente.
//
// Tudo é redesenhado logo depois dos cards (depende da posição e do tamanho
// deles), e só o que mudou é tocado.
// =============================================================================

import { aoMudarCamera, obterCamera } from './camera.js';
import { aoRenderizarCards, tamanhoDoCard } from './cards.js';
import { geometria, obterDados, podeEditar } from './estado.js';
import { focoAtual } from './foco.js';
import { ancestraisRecolhidos, hierarquia } from './hierarquia.js';
import { posicaoAbsoluta } from './modelo.js';
import { el } from './util.js';

const SVG = 'http://www.w3.org/2000/svg';
const ESPACO_ENTRE_CURVAS = 56;  // distância entre curvas do mesmo par (unidades do mundo)
const FOLGA_INICIO = 4;          // entre a borda do card e o começo da linha
const FOLGA_SETA = 10;           // entre a borda do card e a ponta da seta
const FOLGA_FAMILIA = 4;         // linhas pai → filho (as linhas não flutuam com os cards; a folga cobre o movimento)
const LIMITE_TEXTO = 60;         // caracteres mostrados sobre a linha
const ESPESSURA_LINHA = 1.15;    // em pixels da tela
const ESPESSURA_FAMILIA = 0.9;
const ESPESSURA_RASCUNHO = 1.4;

// Cada linha desenhada tem uma chave: o id da conexão (conexão direta),
// "r:A|B" (conexões redirecionadas entre os cards visíveis A e B) ou
// "h:<id do filho>" (linha pai → filho).
const itens = new Map();             // chave → { caminho, rotulo, d, classes, x, y, … }
const pontosDosRotulos = new Map();  // id da conexão → { X, Y }: meio da linha que a mostra
let svg = null;
let grupoFamilia = null;
let grupoLinhas = null;
let grupoRedirecionadas = null;
let rascunho = null;
let camadaRotulos = null;
let inversaAplicada = null;
let temporizadorInversa = null;

export function iniciarConexoes({ elementoFamilia, elementoLinhas, elementoRedirecionadas, elementoRascunho, elementoRotulos }) {
  grupoFamilia = elementoFamilia;
  grupoLinhas = elementoLinhas;
  grupoRedirecionadas = elementoRedirecionadas;
  svg = elementoLinhas.ownerSVGElement;
  rascunho = elementoRascunho;
  camadaRotulos = elementoRotulos;
  aoRenderizarCards(renderizarConexoes);
  aoMudarCamera(atualizarEscalaInversa);
  aplicarEscalaInversa(1 / obterCamera().escala);
}

/**
 * Ponto do mundo onde fica o texto da conexão (meio da linha que a mostra),
 * ou null se ela não está desenhada (ex.: dentro de um grupo recolhido).
 */
export function pontoDoRotulo(id) {
  return pontosDosRotulos.get(id) ?? null;
}

// --- Geometria -----------------------------------------------------------------

const arredondar = (valor) => Math.round(valor * 10) / 10;

/**
 * Onde a reta que sai do centro do card em direção a "alvo" cruza a borda
 * do card (aumentada de "folga").
 */
function pontoNaBorda(centro, tamanho, alvo, folga) {
  const dx = alvo.X - centro.X;
  const dy = alvo.Y - centro.Y;
  if (dx === 0 && dy === 0) return { X: centro.X, Y: centro.Y };
  const meiaLargura = tamanho.largura / 2 + folga;
  const meiaAltura = tamanho.altura / 2 + folga;
  const t = 1 / Math.max(Math.abs(dx) / meiaLargura, Math.abs(dy) / meiaAltura);
  return { X: centro.X + dx * t, Y: centro.Y + dy * t };
}

/**
 * Curva de uma linha (Bézier quadrática: origem → controle → destino).
 * O "deslocamento" afasta o ponto de controle para o lado; ele é medido
 * sempre a partir do card de referência do par ("idReferencia"), para que
 * as curvas de ida e de volta entre os mesmos cards não se sobreponham.
 */
function geometriaDaCurva(faixa, centros, deslocamento, idReferencia) {
  const idOutro = faixa.de === idReferencia ? faixa.para : faixa.de;
  const a = centros.get(idReferencia);
  const b = centros.get(idOutro);
  const dx = b.X - a.X;
  const dy = b.Y - a.Y;
  const distancia = Math.hypot(dx, dy) || 1;
  const controle = {
    X: (a.X + b.X) / 2 - (dy / distancia) * deslocamento,
    Y: (a.Y + b.Y) / 2 + (dx / distancia) * deslocamento,
  };
  const inicio = pontoNaBorda(centros.get(faixa.de), tamanhoDoCard(faixa.de), controle, FOLGA_INICIO);
  const fim = pontoNaBorda(centros.get(faixa.para), tamanhoDoCard(faixa.para), controle,
    faixa.direcional ? FOLGA_SETA : FOLGA_INICIO);
  const meio = {
    X: 0.25 * inicio.X + 0.5 * controle.X + 0.25 * fim.X,
    Y: 0.25 * inicio.Y + 0.5 * controle.Y + 0.25 * fim.Y,
  };
  return { inicio, controle, fim, meio };
}

// --- Desenho ---------------------------------------------------------------------

function renderizarConexoes() {
  const dados = obterDados();
  if (!dados || !grupoLinhas) return;
  const geo = geometria();
  const h = hierarquia();
  const foco = focoAtual();

  const centros = new Map();
  for (const card of dados.cards) {
    if (h.visiveis.has(card.id)) centros.set(card.id, posicaoAbsoluta(card, geo));
  }
  const presentes = new Set();
  pontosDosRotulos.clear();

  // 1. Linhas pai → filho (só quando os dois estão visíveis).
  for (const card of dados.cards) {
    if (!card.pai || !centros.has(card.id) || !centros.has(card.pai)) continue;
    const chave = `h:${card.id}`;
    desenharLinhaDeFamilia(chave, card.pai, card.id, centros, Boolean(foco?.familia.has(card.id)));
    presentes.add(chave);
  }

  // 2. Conexões, agrupadas pelo par de cards VISÍVEIS que elas ligam.
  const pares = new Map();
  for (const conexao of dados.conexoes) {
    const de = h.representante.get(conexao.de);
    const para = h.representante.get(conexao.para);
    if (!de || !para || de === para) continue; // dentro de um grupo recolhido: some
    const [a, b] = de < para ? [de, para] : [para, de];
    const chave = `${a}|${b}`;
    if (!pares.has(chave)) pares.set(chave, { idReferencia: a, diretas: [], redirecionadas: [] });
    const par = pares.get(chave);
    if (de === conexao.de && para === conexao.para) par.diretas.push(conexao);
    else par.redirecionadas.push({ conexao, de, para });
  }

  for (const [chavePar, par] of pares) {
    const faixas = par.diretas.map((conexao) => ({
      tipo: 'direta', chave: conexao.id, de: conexao.de, para: conexao.para,
      direcional: conexao.direcional, membros: [conexao],
    }));
    if (par.redirecionadas.length) faixas.push(faixaRedirecionada(chavePar, par.redirecionadas));
    faixas.sort((f1, f2) => (f1.chave < f2.chave ? -1 : f1.chave > f2.chave ? 1 : 0));
    faixas.forEach((faixa, indice) => {
      // 1 linha: reta; 2: duas curvas simétricas; 3: uma reta e duas curvas…
      const deslocamento = (indice - (faixas.length - 1) / 2) * ESPACO_ENTRE_CURVAS;
      const curva = geometriaDaCurva(faixa, centros, deslocamento, par.idReferencia);
      desenharFaixa(faixa, curva, foco, h);
      presentes.add(faixa.chave);
      for (const conexao of faixa.membros) pontosDosRotulos.set(conexao.id, curva.meio);
    });
  }

  for (const [chave, item] of itens) {
    if (!presentes.has(chave)) {
      item.caminho.remove();
      item.rotulo?.remove();
      itens.delete(chave);
    }
  }
}

/** Junta as conexões redirecionadas de um par numa linha só. */
function faixaRedirecionada(chavePar, lista) {
  const primeira = lista[0];
  // Seta só se todas apontam para o mesmo lado.
  const mesmoSentido = lista.every((r) => r.de === primeira.de && r.conexao.direcional);
  return {
    tipo: 'redirecionada', chave: `r:${chavePar}`, de: primeira.de, para: primeira.para,
    direcional: mesmoSentido, membros: lista.map((r) => r.conexao),
  };
}

function criarItem(chave, grupo, comRotulo) {
  const caminho = document.createElementNS(SVG, 'path');
  grupo.append(caminho);
  const rotulo = comRotulo ? el('button', { class: 'rotulo-conexao', type: 'button' }) : null;
  if (rotulo) camadaRotulos.append(rotulo);
  const item = { caminho, rotulo, d: null, classes: null, x: null, y: null, rotuloAssinatura: null, emFoco: false };
  itens.set(chave, item);
  return item;
}

function atualizarCaminho(item, d, classes) {
  if (item.d !== d) {
    item.caminho.setAttribute('d', d);
    item.d = d;
  }
  if (item.classes !== classes) {
    item.caminho.setAttribute('class', classes);
    item.classes = classes;
  }
}

function desenharLinhaDeFamilia(chave, idPai, idFilho, centros, emFoco) {
  const item = itens.get(chave) ?? criarItem(chave, grupoFamilia, false);
  const centroPai = centros.get(idPai);
  const centroFilho = centros.get(idFilho);
  const inicio = pontoNaBorda(centroPai, tamanhoDoCard(idPai), centroFilho, FOLGA_FAMILIA);
  const fim = pontoNaBorda(centroFilho, tamanhoDoCard(idFilho), centroPai, FOLGA_FAMILIA);
  const d = `M${arredondar(inicio.X)} ${arredondar(inicio.Y)}L${arredondar(fim.X)} ${arredondar(fim.Y)}`;
  atualizarCaminho(item, d, `linha-familia${emFoco ? ' em-foco' : ''}`);
}

function desenharFaixa(faixa, curva, foco, h) {
  const redirecionada = faixa.tipo === 'redirecionada';
  const item = itens.get(faixa.chave) ?? criarItem(faixa.chave, redirecionada ? grupoRedirecionadas : grupoLinhas, true);
  const { inicio, controle, fim, meio } = curva;
  const d = `M${arredondar(inicio.X)} ${arredondar(inicio.Y)}` +
            `Q${arredondar(controle.X)} ${arredondar(controle.Y)} ${arredondar(fim.X)} ${arredondar(fim.Y)}`;
  const emFoco = Boolean(foco) && faixa.membros.some((conexao) => foco.conexoes.has(conexao.id));
  atualizarCaminho(item, d,
    `linha-conexao${redirecionada ? ' redirecionada' : ''}${faixa.direcional ? ' direcional' : ''}${emFoco ? ' em-foco' : ''}`);

  // Texto no meio da linha.
  const x = arredondar(meio.X);
  const y = arredondar(meio.Y);
  if (item.x !== x) {
    item.rotulo.style.left = `${x}px`;
    item.x = x;
  }
  if (item.y !== y) {
    item.rotulo.style.top = `${y}px`;
    item.y = y;
  }
  atualizarRotulo(item, faixa, h);
  if (item.emFoco !== emFoco) {
    item.emFoco = emFoco;
    item.rotulo.classList.toggle('em-foco', emFoco);
    ajustarTamanhoDoRotulo(item);
  }
}

function atualizarRotulo(item, faixa, h) {
  const redirecionada = faixa.tipo === 'redirecionada';
  const unica = faixa.membros.length === 1 ? faixa.membros[0] : null;
  let texto;
  let dica;
  let idConexao = '';
  let expandir = '';
  if (unica) {
    const conteudo = unica.texto.trim();
    texto = !conteudo ? '?' : conteudo.length > LIMITE_TEXTO ? `${conteudo.slice(0, LIMITE_TEXTO)}…` : conteudo;
    dica = conteudo || (podeEditar() ? 'Conexão sem explicação: clique para escrever' : 'Conexão sem explicação');
    if (redirecionada) dica += '\n(sai de um card escondido dentro de um card recolhido)';
    idConexao = unica.id;
  } else {
    // Várias conexões de cards escondidos: clicar expande quem os esconde.
    const aExpandir = new Set();
    for (const conexao of faixa.membros) {
      for (const ponta of [conexao.de, conexao.para]) {
        if (!h.visiveis.has(ponta)) for (const id of ancestraisRecolhidos(ponta)) aExpandir.add(id);
      }
    }
    texto = `${faixa.membros.length} conexões`;
    dica = `${faixa.membros.length} conexões de cards escondidos: clique para expandir e ver cada uma`;
    expandir = [...aExpandir].join(',');
  }
  const assinatura = [texto, dica, idConexao, expandir, redirecionada ? 1 : 0].join('\u0001');
  if (item.rotuloAssinatura === assinatura) return;
  item.rotuloAssinatura = assinatura;
  const rotulo = item.rotulo;
  rotulo.textContent = texto;
  rotulo.title = dica;
  if (idConexao) rotulo.dataset.id = idConexao;
  else delete rotulo.dataset.id;
  if (expandir) rotulo.dataset.expandir = expandir;
  else delete rotulo.dataset.expandir;
  rotulo.classList.toggle('vazio', texto === '?');
  rotulo.classList.toggle('redirecionado', redirecionada);
  rotulo.classList.toggle('agregado', !unica);
}

/**
 * Textos em destaque ficam legíveis mesmo com o zoom afastado: são
 * aumentados na proporção inversa do zoom (só eles, que são poucos).
 */
function ajustarTamanhoDoRotulo(item) {
  const aumento = item.emFoco ? Math.max(1, (inversaAplicada ?? 1) * 0.8) : 1;
  item.rotulo.style.transform = aumento > 1 ? `translate(-50%, -50%) scale(${aumento.toFixed(3)})` : '';
}

// --- Linha provisória (enquanto a conexão está sendo criada) ----------------------

/**
 * Desenha a linha que segue o cursor ao arrastar uma alça. "pontoMundo" é a
 * posição do cursor no mundo; "idAlvo", o card embaixo dele (se houver).
 */
export function desenharRascunho(idDe, pontoMundo, idAlvo) {
  const dados = obterDados();
  const geo = geometria();
  const cardDe = dados.cards.find((c) => c.id === idDe);
  if (!cardDe) return;
  const centroDe = posicaoAbsoluta(cardDe, geo);
  let destino = pontoMundo;
  let fim = pontoMundo;
  const cardAlvo = idAlvo ? dados.cards.find((c) => c.id === idAlvo) : null;
  if (cardAlvo) {
    destino = posicaoAbsoluta(cardAlvo, geo);
    fim = pontoNaBorda(destino, tamanhoDoCard(idAlvo), centroDe, FOLGA_SETA);
  }
  const inicio = pontoNaBorda(centroDe, tamanhoDoCard(idDe), destino, FOLGA_INICIO);
  rascunho.setAttribute('d', `M${arredondar(inicio.X)} ${arredondar(inicio.Y)}L${arredondar(fim.X)} ${arredondar(fim.Y)}`);
  rascunho.classList.add('visivel');
}

export function apagarRascunho() {
  rascunho.classList.remove('visivel');
  rascunho.setAttribute('d', 'M0 0');
}

// --- Espessura constante na tela ---------------------------------------------------

function atualizarEscalaInversa(camera) {
  const inversa = 1 / camera.escala;
  const razao = inversaAplicada ? inversa / inversaAplicada : Infinity;
  // Durante o zoom, atualiza só a cada ~15% de mudança (cada atualização
  // redesenha todas as linhas); quando o zoom para, acerta o valor exato.
  if (razao > 1.15 || razao < 0.87) aplicarEscalaInversa(inversa);
  clearTimeout(temporizadorInversa);
  temporizadorInversa = setTimeout(() => aplicarEscalaInversa(1 / obterCamera().escala), 200);
}

function aplicarEscalaInversa(inversa) {
  if (inversa === inversaAplicada) return;
  inversaAplicada = inversa;
  svg.setAttribute('stroke-width', (ESPESSURA_LINHA * inversa).toFixed(3));
  grupoFamilia.setAttribute('stroke-width', (ESPESSURA_FAMILIA * inversa).toFixed(3));
  grupoRedirecionadas.setAttribute('stroke-dasharray', `${(5 * inversa).toFixed(2)} ${(4 * inversa).toFixed(2)}`);
  rascunho.setAttribute('stroke-width', (ESPESSURA_RASCUNHO * inversa).toFixed(3));
  rascunho.setAttribute('stroke-dasharray', `${(6 * inversa).toFixed(2)} ${(5 * inversa).toFixed(2)}`);
  for (const item of itens.values()) {
    if (item.emFoco && item.rotulo) ajustarTamanhoDoRotulo(item);
  }
}
