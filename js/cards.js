// =============================================================================
// cards.js — desenha os cards no mapa.
//
// Cada card é um <div class="card"> dentro de #camada-cards. As propriedades
// left/top recebem a posição do CENTRO do card no mundo (o CSS desloca metade
// do tamanho). A cada mudança nos dados, renderizar() compara a tela com os
// dados e só altera o necessário.
// =============================================================================

import { aoMudarCamera } from './camera.js';
import { assinar, geometria, obterDados, ui } from './estado.js';
import { focoAtual } from './foco.js';
import { posicaoAbsoluta } from './modelo.js';
import { el, icone } from './util.js';

const LIMITE_DESCRICAO = 240; // o card mostra só o começo da descrição
const TAMANHO_PADRAO = { largura: 220, altura: 76 };
const LADOS_DAS_ALCAS = ['topo', 'direita', 'base', 'esquerda'];

const itens = new Map();     // id → { id, raiz, titulo, descricao, icones, assinatura, X, Y, … }
const tamanhos = new Map();  // id → { largura, altura } em unidades do mundo
const aposRenderizar = [];   // funções chamadas depois de cada renderização
let camada = null;
let palco = null;
let renderPendente = false;
let nivelDeDetalhe = null;
let emModoFoco = false;

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

/** Atualiza a tela para refletir os dados (pode ser chamado a qualquer hora). */
export function renderizarAgora() {
  const dados = obterDados();
  if (!dados || !camada) return;
  const geo = geometria();
  const foco = focoAtual();
  const presentes = new Set();
  const paraMedir = [];

  if (Boolean(foco) !== emModoFoco) {
    emModoFoco = Boolean(foco);
    palco.classList.toggle('modo-foco', emModoFoco);
  }

  for (const card of dados.cards) {
    presentes.add(card.id);
    let item = itens.get(card.id);
    if (!item) {
      item = criarItem(card.id);
      itens.set(card.id, item);
      camada.append(item.raiz);
    }
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
    const selecionado = ui.selecionado === card.id;
    if (item.selecionado !== selecionado) {
      item.selecionado = selecionado;
      item.raiz.classList.toggle('selecionado', selecionado);
    }
    const emFoco = Boolean(foco?.cards.has(card.id));
    if (item.emFoco !== emFoco) {
      item.emFoco = emFoco;
      item.raiz.classList.toggle('em-foco', emFoco);
    }
  }

  for (const [id, item] of itens) {
    if (!presentes.has(id)) {
      item.raiz.remove();
      itens.delete(id);
      tamanhos.delete(id);
    }
  }

  // Mede depois de todas as mudanças (uma única leitura de layout).
  // offsetWidth/offsetHeight ignoram o zoom: o resultado já está em
  // unidades do mundo.
  for (const item of paraMedir) {
    tamanhos.set(item.id, { largura: item.raiz.offsetWidth, altura: item.raiz.offsetHeight });
  }

  for (const funcao of aposRenderizar) funcao();
}

function criarItem(id) {
  const titulo = el('div', { class: 'card-titulo' });
  const descricao = el('div', { class: 'card-descricao' });
  const icones = el('div', { class: 'card-icones' });
  // Alças nas bordas: arrastar uma delas até outro card cria uma conexão.
  const alcas = LADOS_DAS_ALCAS.map((lado) => el('span', {
    class: `alca alca-${lado}`,
    title: 'Arraste até outro card para criar uma conexão',
  }));
  const raiz = el('div', { class: 'card', 'data-id': id },
    el('div', { class: 'card-corpo' }, titulo, descricao, icones, alcas),
  );
  return { id, raiz, titulo, descricao, icones, assinatura: null, X: null, Y: null, selecionado: false, emFoco: false };
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

/** Tamanho do card em unidades do mundo. */
export function tamanhoDoCard(id) {
  return tamanhos.get(id) ?? TAMANHO_PADRAO;
}

/** Marca visualmente o card que está sendo arrastado. */
export function marcarArrastando(id, sim) {
  itens.get(id)?.raiz.classList.toggle('arrastando', sim);
}

/** Marca visualmente o card que vai receber a conexão sendo criada. */
export function marcarAlvoDeConexao(id, sim) {
  itens.get(id)?.raiz.classList.toggle('alvo-conexao', sim);
}

/** Retângulo que contém todos os cards (ou null se não há cards). */
export function limitesDosCards() {
  const dados = obterDados();
  if (!dados || dados.cards.length === 0) return null;
  const geo = geometria();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const card of dados.cards) {
    const { X, Y } = posicaoAbsoluta(card, geo);
    const { largura, altura } = tamanhoDoCard(card.id);
    minX = Math.min(minX, X - largura / 2);
    maxX = Math.max(maxX, X + largura / 2);
    minY = Math.min(minY, Y - altura / 2);
    maxY = Math.max(maxY, Y + altura / 2);
  }
  return { x: minX, y: minY, largura: maxX - minX, altura: maxY - minY };
}
