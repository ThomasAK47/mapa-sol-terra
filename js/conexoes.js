// =============================================================================
// conexoes.js — desenha as conexões entre os cards.
//
// Cada conexão é uma curva SVG dentro de #mundo (acompanha pan e zoom), com um
// texto curto no meio. Regras do desenho:
//   • várias conexões entre o mesmo par de cards viram curvas separadas,
//     abertas em leque (uma só conexão fica reta);
//   • a seta aparece quando a conexão é direcional;
//   • as pontas param alguns pixels antes da borda dos cards (assim a
//     flutuação dos cards, na Fase 5, não "encosta" nas setas);
//   • a espessura das linhas e o tamanho das setas ficam constantes na tela,
//     em qualquer zoom: o atributo stroke-width do <svg> (herdado por todas
//     as linhas; as setas acompanham a espessura) é ajustado quando o zoom
//     muda o suficiente. Mexer só nele é bem mais leve do que mexer num
//     estilo herdado pelo mapa inteiro.
//
// As conexões são redesenhadas logo depois dos cards (elas dependem da
// posição e do tamanho deles), e só o que mudou é tocado.
// =============================================================================

import { aoMudarCamera, obterCamera } from './camera.js';
import { aoRenderizarCards, tamanhoDoCard } from './cards.js';
import { geometria, obterDados, podeEditar } from './estado.js';
import { focoAtual } from './foco.js';
import { posicaoAbsoluta } from './modelo.js';
import { el } from './util.js';

const SVG = 'http://www.w3.org/2000/svg';
const ESPACO_ENTRE_CURVAS = 56;  // distância entre curvas do mesmo par (unidades do mundo)
const FOLGA_INICIO = 4;          // entre a borda do card e o começo da linha
const FOLGA_SETA = 10;           // entre a borda do card e a ponta da seta
const LIMITE_TEXTO = 60;         // caracteres mostrados sobre a linha
const ESPESSURA_LINHA = 1.15;    // em pixels da tela
const ESPESSURA_RASCUNHO = 1.4;

const itens = new Map();             // id → { caminho, rotulo, d, classes, x, y, texto, emFoco }
const pontosDosRotulos = new Map();  // id → { X, Y }: meio da curva (usado pelo editor)
let svg = null;
let grupoLinhas = null;
let rascunho = null;
let camadaRotulos = null;
let inversaAplicada = 1;
let temporizadorInversa = null;

export function iniciarConexoes({ elementoLinhas, elementoRascunho, elementoRotulos }) {
  grupoLinhas = elementoLinhas;
  svg = elementoLinhas.ownerSVGElement;
  rascunho = elementoRascunho;
  camadaRotulos = elementoRotulos;
  aoRenderizarCards(renderizarConexoes);
  aoMudarCamera(atualizarEscalaInversa);
  inversaAplicada = null;
  aplicarEscalaInversa(1 / obterCamera().escala);
}

/** Ponto do mundo onde fica o texto da conexão (meio da curva). */
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
 * Curva de uma conexão (Bézier quadrática: origem → controle → destino).
 * O "deslocamento" afasta o ponto de controle para o lado; ele é medido
 * sempre a partir do card de referência do par ("idReferencia"), para que
 * as curvas de ida e de volta entre os mesmos cards não se sobreponham.
 */
function geometriaDaConexao(conexao, centros, deslocamento, idReferencia) {
  const idOutro = conexao.de === idReferencia ? conexao.para : conexao.de;
  const a = centros.get(idReferencia);
  const b = centros.get(idOutro);
  const dx = b.X - a.X;
  const dy = b.Y - a.Y;
  const distancia = Math.hypot(dx, dy) || 1;
  const controle = {
    X: (a.X + b.X) / 2 - (dy / distancia) * deslocamento,
    Y: (a.Y + b.Y) / 2 + (dx / distancia) * deslocamento,
  };
  const inicio = pontoNaBorda(centros.get(conexao.de), tamanhoDoCard(conexao.de), controle, FOLGA_INICIO);
  const fim = pontoNaBorda(centros.get(conexao.para), tamanhoDoCard(conexao.para), controle,
    conexao.direcional ? FOLGA_SETA : FOLGA_INICIO);
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
  const foco = focoAtual();

  const centros = new Map();
  for (const card of dados.cards) centros.set(card.id, posicaoAbsoluta(card, geo));

  // Agrupa as conexões por par de cards, sem importar a direção.
  const pares = new Map();
  for (const conexao of dados.conexoes) {
    if (!centros.has(conexao.de) || !centros.has(conexao.para)) continue;
    const [a, b] = conexao.de < conexao.para ? [conexao.de, conexao.para] : [conexao.para, conexao.de];
    const chave = `${a}|${b}`;
    if (!pares.has(chave)) pares.set(chave, { idReferencia: a, lista: [] });
    pares.get(chave).lista.push(conexao);
  }

  const presentes = new Set();
  for (const { idReferencia, lista } of pares.values()) {
    lista.sort((k1, k2) => (k1.id < k2.id ? -1 : k1.id > k2.id ? 1 : 0));
    lista.forEach((conexao, indice) => {
      // 1 conexão: reta; 2: duas curvas simétricas; 3: uma reta e duas curvas…
      const deslocamento = (indice - (lista.length - 1) / 2) * ESPACO_ENTRE_CURVAS;
      desenharConexao(conexao, geometriaDaConexao(conexao, centros, deslocamento, idReferencia), foco);
      presentes.add(conexao.id);
    });
  }

  for (const [id, item] of itens) {
    if (!presentes.has(id)) {
      item.caminho.remove();
      item.rotulo.remove();
      itens.delete(id);
      pontosDosRotulos.delete(id);
    }
  }
}

function criarItem(id) {
  const caminho = document.createElementNS(SVG, 'path');
  caminho.dataset.id = id;
  grupoLinhas.append(caminho);
  const rotulo = el('button', { class: 'rotulo-conexao', type: 'button', 'data-id': id });
  camadaRotulos.append(rotulo);
  const item = { caminho, rotulo, d: null, classes: null, x: null, y: null, texto: null, emFoco: false };
  itens.set(id, item);
  return item;
}

function desenharConexao(conexao, curva, foco) {
  const item = itens.get(conexao.id) ?? criarItem(conexao.id);
  const { inicio, controle, fim, meio } = curva;

  const d = `M${arredondar(inicio.X)} ${arredondar(inicio.Y)}` +
            `Q${arredondar(controle.X)} ${arredondar(controle.Y)} ${arredondar(fim.X)} ${arredondar(fim.Y)}`;
  if (item.d !== d) {
    item.caminho.setAttribute('d', d);
    item.d = d;
  }

  const emFoco = Boolean(foco?.conexoes.has(conexao.id));
  const classes = `linha-conexao${conexao.direcional ? ' direcional' : ''}${emFoco ? ' em-foco' : ''}`;
  if (item.classes !== classes) {
    item.caminho.setAttribute('class', classes);
    item.classes = classes;
  }

  // Texto no meio da curva.
  pontosDosRotulos.set(conexao.id, meio);
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
  const texto = conexao.texto.trim();
  if (item.texto !== texto) {
    item.texto = texto;
    item.rotulo.textContent = !texto ? '?' : texto.length > LIMITE_TEXTO ? `${texto.slice(0, LIMITE_TEXTO)}…` : texto;
    item.rotulo.classList.toggle('vazio', !texto);
    item.rotulo.title = texto || (podeEditar() ? 'Conexão sem explicação: clique para escrever' : 'Conexão sem explicação');
  }
  if (item.emFoco !== emFoco) {
    item.emFoco = emFoco;
    item.rotulo.classList.toggle('em-foco', emFoco);
    ajustarTamanhoDoRotulo(item);
  }
}

/**
 * Textos em destaque ficam legíveis mesmo com o zoom afastado: são
 * aumentados na proporção inversa do zoom (só eles, que são poucos).
 */
function ajustarTamanhoDoRotulo(item) {
  const aumento = item.emFoco ? Math.max(1, inversaAplicada * 0.8) : 1;
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
  rascunho.setAttribute('stroke-width', (ESPESSURA_RASCUNHO * inversa).toFixed(3));
  rascunho.setAttribute('stroke-dasharray', `${(6 * inversa).toFixed(2)} ${(5 * inversa).toFixed(2)}`);
  for (const item of itens.values()) {
    if (item.emFoco) ajustarTamanhoDoRotulo(item);
  }
}
