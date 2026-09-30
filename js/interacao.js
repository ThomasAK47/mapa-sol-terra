// =============================================================================
// interacao.js — traduz mouse e toque em ações no mapa:
//   • arrastar o fundo (ou com o botão do meio) → mover o mapa;
//   • arrastar um card → mover o card (no modo somente leitura, move o mapa);
//   • clicar num card → selecionar; clicar no fundo → desmarcar;
//   • duplo clique no card → abrir o painel; no fundo → criar um card ali;
//   • dois dedos numa tela sensível ao toque → pinça (zoom).
// A roda do mouse e o touchpad ficam em js/camera.js.
// =============================================================================

import { abrirLinkDocs, criarCard } from './acoes.js';
import { toast } from './avisos.js';
import { aoMudarCamera, moverPor, telaParaMundo, zoomNoPonto } from './camera.js';
import { marcarArrastando } from './cards.js';
import {
  alterarDuranteGesto, buscarCard, cancelarGesto, concluirGesto, geometria, iniciarGesto,
  obterDados, podeEditar, selecionar,
} from './estado.js';
import { definirPosicaoAbsoluta, posicaoAbsoluta } from './modelo.js';
import { abrirPainel, fecharPainel, painelAberto } from './painel.js';

const LIMIAR_ARRASTO = 4;      // pixels de movimento até um clique virar arrasto

const ponteiros = new Map();   // ponteiros pressionados: id → { x, y }
let palco = null;
let acao = null;               // o que o gesto atual está fazendo
let ultimoPonteiro = null;     // posição mais recente (para acompanhar a câmera)

export function iniciarInteracao(elementoPalco) {
  palco = elementoPalco;
  palco.addEventListener('pointerdown', aoPressionar);
  palco.addEventListener('pointermove', aoMover);
  palco.addEventListener('pointerup', aoSoltar);
  palco.addEventListener('pointercancel', aoCancelarPonteiro);
  palco.addEventListener('dblclick', aoDuploClique);
  palco.addEventListener('click', aoClicarEmAcaoDoCard);
  // Se a câmera mudar durante um arrasto (ex.: roda do mouse), o card
  // continua embaixo do cursor.
  aoMudarCamera(() => {
    if (acao?.tipo === 'arrastando-card' && ultimoPonteiro) atualizarArrasto(ultimoPonteiro);
  });
}

/** true enquanto um card está sendo arrastado. */
export function arrastandoCard() {
  return acao?.tipo === 'arrastando-card';
}

/** Cancela o arrasto em andamento e devolve o card ao lugar (tecla Esc). */
export function cancelarArrasto() {
  if (acao?.tipo !== 'arrastando-card') return false;
  marcarArrastando(acao.id, false);
  palco.classList.remove('arrastando');
  acao = null;
  cancelarGesto();
  return true;
}

function distancia(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pontoMedio(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// --- Pressionar / mover / soltar ---------------------------------------------------

function aoPressionar(evento) {
  if (evento.button === 2) return;                     // botão direito: menu do navegador
  if (evento.target.closest('.card-acao')) return;     // ícones clicáveis dentro do card
  ponteiros.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });

  if (ponteiros.size === 2) {
    iniciarPinca();
    return;
  }
  if (ponteiros.size > 2) return;

  const ponto = { x: evento.clientX, y: evento.clientY };
  const elementoCard = evento.button === 0 ? evento.target.closest('.card') : null; // botão do meio: sempre move o mapa
  if (elementoCard) {
    acao = { tipo: 'card-pressionado', id: elementoCard.dataset.id, inicio: ponto, ponteiro: evento.pointerId };
  } else {
    iniciarPanoramica(evento.pointerId, ponto, ponto, false);
  }
}

function iniciarPanoramica(ponteiro, inicio, ultimo, moveu) {
  acao = { tipo: 'panoramica', ponteiro, inicio, ultimo, moveu };
  palco.setPointerCapture(ponteiro);
  palco.classList.add('panoramica');
}

function aoMover(evento) {
  if (!ponteiros.has(evento.pointerId)) return;
  const ponto = { x: evento.clientX, y: evento.clientY };
  ponteiros.set(evento.pointerId, ponto);

  if (acao?.tipo === 'pinca') {
    atualizarPinca();
    return;
  }
  if (!acao || acao.ponteiro !== evento.pointerId) return;

  if (acao.tipo === 'panoramica') {
    moverPor(ponto.x - acao.ultimo.x, ponto.y - acao.ultimo.y);
    acao.ultimo = ponto;
    if (distancia(acao.inicio, ponto) > LIMIAR_ARRASTO) acao.moveu = true;
  } else if (acao.tipo === 'card-pressionado') {
    if (distancia(acao.inicio, ponto) <= LIMIAR_ARRASTO) return;
    if (podeEditar()) {
      iniciarArrastoDeCard(evento.pointerId, ponto);
    } else {
      // Somente leitura: arrastar um card move o mapa.
      const inicio = acao.inicio;
      iniciarPanoramica(evento.pointerId, inicio, ponto, true);
      moverPor(ponto.x - inicio.x, ponto.y - inicio.y);
    }
  } else if (acao.tipo === 'arrastando-card') {
    atualizarArrasto(ponto);
  }
}

function aoSoltar(evento) {
  if (!ponteiros.has(evento.pointerId)) return;
  ponteiros.delete(evento.pointerId);

  if (acao?.tipo === 'pinca') {
    if (ponteiros.size === 0) acao = null;
    return;
  }
  if (!acao || acao.ponteiro !== evento.pointerId) return;
  const terminado = acao;
  acao = null;
  palco.classList.remove('panoramica', 'arrastando');

  if (terminado.tipo === 'card-pressionado') {
    selecionar(terminado.id);                    // clique simples num card
    const aberto = painelAberto();
    if (aberto && aberto !== terminado.id) abrirPainel(terminado.id); // painel acompanha a seleção
  } else if (terminado.tipo === 'arrastando-card') {
    finalizarArrasto(terminado);
  } else if (terminado.tipo === 'panoramica' && !terminado.moveu) {
    selecionar(null);                            // clique simples no fundo
    fecharPainel();
  }
}

function aoCancelarPonteiro(evento) {
  ponteiros.delete(evento.pointerId);
  if (acao?.tipo === 'arrastando-card' && acao.ponteiro === evento.pointerId) finalizarArrasto(acao);
  if (acao?.tipo !== 'pinca' || ponteiros.size === 0) acao = null;
  palco.classList.remove('panoramica', 'arrastando');
}

// --- Arrastar cards ------------------------------------------------------------------

function iniciarArrastoDeCard(ponteiro, ponto) {
  const id = acao.id;
  const card = buscarCard(id);
  if (!card || !iniciarGesto('Mover card')) {
    acao = null;
    return;
  }
  const geo = geometria();
  // (Fase 3: os cards filhos também entrarão nesta lista.)
  const ids = [id];
  const origens = new Map(ids.map((i) => [i, posicaoAbsoluta(buscarCard(i), geo)]));
  acao = {
    tipo: 'arrastando-card', id, ids, origens, ponteiro,
    inicioNoMundo: telaParaMundo(acao.inicio.x, acao.inicio.y),
  };
  palco.setPointerCapture(ponteiro);
  palco.classList.add('arrastando');
  marcarArrastando(id, true);
  selecionar(id);
  atualizarArrasto(ponto);
}

function atualizarArrasto(ponto) {
  ultimoPonteiro = ponto;
  const agora = telaParaMundo(ponto.x, ponto.y);
  const dX = agora.X - acao.inicioNoMundo.X;
  const dY = agora.Y - acao.inicioNoMundo.Y;
  const geo = geometria();
  const { ids, origens } = acao;
  alterarDuranteGesto((dados) => {
    for (const id of ids) {
      const card = dados.cards.find((c) => c.id === id);
      const origem = origens.get(id);
      if (card && origem) definirPosicaoAbsoluta(card, origem.X + dX, origem.Y + dY, geo);
    }
  });
}

function finalizarArrasto(terminado) {
  ultimoPonteiro = null;
  marcarArrastando(terminado.id, false);
  palco.classList.remove('arrastando');
  // Ao soltar, as posições são arredondadas (números inteiros no arquivo).
  concluirGesto((dados) => {
    for (const id of terminado.ids) {
      const card = dados.cards.find((c) => c.id === id);
      if (!card) continue;
      card.x = Math.round(card.x);
      card.y = Math.round(card.y);
    }
  });
}

// --- Pinça (tela sensível ao toque) ------------------------------------------------

function iniciarPinca() {
  if (acao?.tipo === 'arrastando-card') finalizarArrasto(acao);
  palco.classList.remove('panoramica', 'arrastando');
  const [a, b] = [...ponteiros.values()];
  acao = { tipo: 'pinca', distancia: distancia(a, b), centro: pontoMedio(a, b) };
}

function atualizarPinca() {
  if (ponteiros.size < 2) return;
  const [a, b] = [...ponteiros.values()];
  const dist = distancia(a, b);
  const centro = pontoMedio(a, b);
  moverPor(centro.x - acao.centro.x, centro.y - acao.centro.y);
  if (acao.distancia > 0) zoomNoPonto(centro.x, centro.y, dist / acao.distancia);
  acao.distancia = dist;
  acao.centro = centro;
}

// --- Duplo clique e ícones dos cards -----------------------------------------------

function aoDuploClique(evento) {
  const alvo = document.elementFromPoint(evento.clientX, evento.clientY);
  if (!alvo || !palco.contains(alvo) || alvo.closest('.card-acao')) return;
  const elementoCard = alvo.closest('.card');
  if (elementoCard) {
    abrirPainel(elementoCard.dataset.id);
    return;
  }
  if (!podeEditar()) return;
  const { X, Y } = telaParaMundo(evento.clientX, evento.clientY);
  const id = criarCard(X, Y);
  if (id) abrirPainel(id, { novo: true });
}

function aoClicarEmAcaoDoCard(evento) {
  const botao = evento.target.closest('.card-acao');
  if (!botao) return;
  evento.stopPropagation();
  const id = botao.closest('.card')?.dataset.id;
  if (!id || !obterDados()) return;
  if (botao.dataset.acao === 'docs') abrirLinkDocs(id);
  else if (botao.dataset.acao === 'animacao') toast('As animações chegam na Fase 4.');
}
