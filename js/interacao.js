// =============================================================================
// interacao.js — traduz mouse e toque em ações no mapa:
//   • arrastar o fundo (ou com o botão do meio) → mover o mapa;
//   • arrastar um card → mover o card e seus descendentes (com Alt, só o
//     card); no modo somente leitura, arrastar um card move o mapa;
//   • clicar no "+N" / "−" de um card pai → expandir / recolher os filhos;
//   • arrastar a alça ○ embaixo de um card até outro card → nova conexão;
//   • arrastar a alça do canto inferior direito de um card → mudar o tamanho
//     dele e dos descendentes (duplo clique nela: tamanho normal);
//   • clicar num card → selecionar (modo foco); clicar no fundo → desmarcar;
//   • clicar no texto de uma conexão → abrir o editor da conexão;
//   • clicar nos ícones do card → abrir a animação ou o link do Docs;
//   • duplo clique no card → abrir o painel; no fundo → criar um card ali;
//   • dois dedos numa tela sensível ao toque → pinça (zoom).
// Ao arrastar um card ou uma conexão perto da borda da tela, o mapa anda
// sozinho naquela direção. A roda do mouse e o touchpad ficam em camera.js.
// =============================================================================

import {
  abrirLinkDocs, alternarRecolhido, criarCard, criarConexao, definirEscalaDoCard, expandirCards,
} from './acoes.js';
import { toast } from './avisos.js';
import { aoMudarCamera, areaUtil, moverPor, telaParaMundo, zoomNoPonto } from './camera.js';
import { marcarAlvoDeConexao, marcarArrastando, marcarRedimensionando } from './cards.js';
import { apagarRascunho, desenharRascunho } from './conexoes.js';
import { abrirEditorConexao } from './editor-conexao.js';
import {
  alterarDuranteGesto, buscarCard, cancelarGesto, concluirGesto, geometria, iniciarGesto,
  obterDados, podeEditar, selecionar,
} from './estado.js';
import { descendentes } from './hierarquia.js';
import { abrirAnimacaoDoCard } from './janela-animacao.js';
import {
  definirPosicaoAbsoluta, ESCALA_CARD_MAX, ESCALA_CARD_MIN, normalizarEscala, posicaoAbsoluta,
} from './modelo.js';
import { abrirPainel, fecharPainel, painelAberto } from './painel.js';

const LIMIAR_ARRASTO = 4;        // pixels de movimento até um clique virar arrasto
const MARGEM_AUTO_PAN = 40;      // faixa junto à borda da tela em que o mapa anda sozinho
const VELOCIDADE_AUTO_PAN = 16;  // pixels por quadro, bem na borda

const ponteiros = new Map();     // ponteiros pressionados: id → { x, y }
let palco = null;
let acao = null;                 // o que o gesto atual está fazendo
let ultimoPonteiro = null;       // posição mais recente do cursor durante um arrasto
const autoPan = { vx: 0, vy: 0, quadro: null };

export function iniciarInteracao(elementoPalco) {
  palco = elementoPalco;
  palco.addEventListener('pointerdown', aoPressionar);
  palco.addEventListener('pointermove', aoMover);
  palco.addEventListener('pointerup', aoSoltar);
  palco.addEventListener('pointercancel', aoCancelarPonteiro);
  palco.addEventListener('dblclick', aoDuploClique);
  palco.addEventListener('click', aoClicar);
  // Se a câmera mudar durante um arrasto (roda do mouse, mapa andando
  // sozinho), o card ou a linha provisória continuam embaixo do cursor.
  aoMudarCamera(() => {
    if (!ultimoPonteiro) return;
    if (acao?.tipo === 'arrastando-card') atualizarArrasto(ultimoPonteiro);
    else if (acao?.tipo === 'criando-conexao') atualizarCriacaoDeConexao(ultimoPonteiro);
  });
}

/**
 * Cancela o arrasto de card (devolvendo-o ao lugar) ou a criação de conexão
 * em andamento (tecla Esc). Devolve true se havia algo para cancelar.
 */
export function cancelarGestoAtual() {
  if (acao?.tipo === 'arrastando-card') {
    marcarArrastando(acao.id, false);
    acao = null;
    encerrarArrasto();
    cancelarGesto();
    return true;
  }
  if (acao?.tipo === 'criando-conexao') {
    const terminado = acao;
    acao = null;
    finalizarCriacaoDeConexao(terminado, false);
    return true;
  }
  if (acao?.tipo === 'redimensionando-card') {
    marcarRedimensionando(acao.id, null);
    acao = null;
    encerrarArrasto();
    cancelarGesto();
    return true;
  }
  return false;
}

function distancia(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pontoMedio(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function encerrarArrasto() {
  ultimoPonteiro = null;
  pararAutoPan();
  palco.classList.remove('panoramica', 'arrastando', 'conectando', 'redimensionando');
}

/**
 * Faz o #palco continuar recebendo o movimento mesmo se o cursor sair dele.
 * Se o ponteiro já tiver sido solto nesse instante, o navegador recusa; o
 * gesto continua funcionando sem a captura.
 */
function capturarPonteiro(ponteiro) {
  try {
    palco.setPointerCapture(ponteiro);
  } catch {
    /* ponteiro já solto: nada a fazer */
  }
}

// --- Pressionar / mover / soltar ---------------------------------------------------

function aoPressionar(evento) {
  if (evento.button === 2) return;                                                    // botão direito: menu do navegador
  if (evento.target.closest('.card-acao, .rotulo-conexao, .card-recolher')) return;  // tratados no clique
  ponteiros.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });

  if (ponteiros.size === 2) {
    iniciarPinca();
    return;
  }
  if (ponteiros.size > 2) return;

  const ponto = { x: evento.clientX, y: evento.clientY };
  const editavel = evento.button === 0 && podeEditar();
  const alcaTamanho = editavel ? evento.target.closest('.alca-tamanho') : null;
  if (alcaTamanho) {
    iniciarRedimensionamento(evento.pointerId, alcaTamanho.closest('.card').dataset.id, ponto);
    return;
  }
  const alca = editavel ? evento.target.closest('.alca') : null;
  if (alca) {
    iniciarCriacaoDeConexao(evento.pointerId, alca.closest('.card').dataset.id, ponto);
    return;
  }
  const elementoCard = evento.button === 0 ? evento.target.closest('.card') : null; // botão do meio: sempre move o mapa
  if (elementoCard) {
    acao = { tipo: 'card-pressionado', id: elementoCard.dataset.id, inicio: ponto, ponteiro: evento.pointerId };
  } else {
    iniciarPanoramica(evento.pointerId, ponto, ponto, false);
  }
}

function iniciarPanoramica(ponteiro, inicio, ultimo, moveu) {
  acao = { tipo: 'panoramica', ponteiro, inicio, ultimo, moveu };
  capturarPonteiro(ponteiro);
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
      iniciarArrastoDeCard(evento.pointerId, ponto, evento.altKey);
    } else {
      // Somente leitura: arrastar um card move o mapa.
      const inicio = acao.inicio;
      iniciarPanoramica(evento.pointerId, inicio, ponto, true);
      moverPor(ponto.x - inicio.x, ponto.y - inicio.y);
    }
  } else if (acao.tipo === 'arrastando-card') {
    atualizarArrasto(ponto);
  } else if (acao.tipo === 'criando-conexao') {
    atualizarCriacaoDeConexao(ponto);
  } else if (acao.tipo === 'redimensionando-card') {
    atualizarRedimensionamento(ponto);
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
  palco.classList.remove('panoramica');

  if (terminado.tipo === 'card-pressionado') {
    selecionar(terminado.id);                    // clique simples num card: modo foco
    const aberto = painelAberto();
    if (aberto && aberto !== terminado.id) abrirPainel(terminado.id); // o painel acompanha a seleção
  } else if (terminado.tipo === 'arrastando-card') {
    finalizarArrasto(terminado);
  } else if (terminado.tipo === 'criando-conexao') {
    finalizarCriacaoDeConexao(terminado, true);
  } else if (terminado.tipo === 'redimensionando-card') {
    finalizarRedimensionamento(terminado);
  } else if (terminado.tipo === 'panoramica' && !terminado.moveu) {
    selecionar(null);                            // clique simples no fundo: sai do modo foco
    fecharPainel();
  }
}

function aoCancelarPonteiro(evento) {
  ponteiros.delete(evento.pointerId);
  if (acao?.ponteiro === evento.pointerId) {
    if (acao.tipo === 'arrastando-card') finalizarArrasto(acao);
    else if (acao.tipo === 'criando-conexao') finalizarCriacaoDeConexao(acao, false);
    else if (acao.tipo === 'redimensionando-card') finalizarRedimensionamento(acao);
  }
  if (acao?.tipo !== 'pinca' || ponteiros.size === 0) acao = null;
  encerrarArrasto();
}

// --- Arrastar cards ------------------------------------------------------------------

function iniciarArrastoDeCard(ponteiro, ponto, soOCard) {
  const id = acao.id;
  const card = buscarCard(id);
  if (!card || !iniciarGesto('Mover card')) {
    acao = null;
    return;
  }
  const geo = geometria();
  // Os descendentes (filhos, netos…, mesmo escondidos) vão junto, a não ser
  // que a tecla Alt esteja pressionada.
  const ids = soOCard ? [id] : [id, ...descendentes(id)];
  const origens = new Map(ids.map((i) => [i, posicaoAbsoluta(buscarCard(i), geo)]));
  acao = {
    tipo: 'arrastando-card', id, ids, origens, ponteiro,
    inicioNoMundo: telaParaMundo(acao.inicio.x, acao.inicio.y),
  };
  capturarPonteiro(ponteiro);
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
  avaliarAutoPan(ponto);
}

function finalizarArrasto(terminado) {
  marcarArrastando(terminado.id, false);
  encerrarArrasto();
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

// --- Criar conexões (arrastando uma alça) ---------------------------------------------

function iniciarCriacaoDeConexao(ponteiro, idDe, ponto) {
  acao = { tipo: 'criando-conexao', de: idDe, alvo: null, ponteiro };
  capturarPonteiro(ponteiro);
  palco.classList.add('conectando');
  atualizarCriacaoDeConexao(ponto);
}

function atualizarCriacaoDeConexao(ponto) {
  ultimoPonteiro = ponto;
  // O card embaixo do cursor (se não for o de origem) é o alvo.
  const elemento = document.elementFromPoint(ponto.x, ponto.y)?.closest('.card');
  const alvo = elemento && elemento.dataset.id !== acao.de ? elemento.dataset.id : null;
  if (alvo !== acao.alvo) {
    if (acao.alvo) marcarAlvoDeConexao(acao.alvo, false);
    if (alvo) marcarAlvoDeConexao(alvo, true);
    acao.alvo = alvo;
  }
  desenharRascunho(acao.de, telaParaMundo(ponto.x, ponto.y), alvo);
  avaliarAutoPan(ponto);
}

function finalizarCriacaoDeConexao(terminado, criar) {
  apagarRascunho();
  if (terminado.alvo) marcarAlvoDeConexao(terminado.alvo, false);
  encerrarArrasto();
  if (!criar || !terminado.alvo) return;
  const id = criarConexao(terminado.de, terminado.alvo);
  if (id) abrirEditorConexao(id, { nova: true });
}

// --- Mudar o tamanho de um card (arrastando a alça do canto) ---------------------------

function iniciarRedimensionamento(ponteiro, id, ponto) {
  const card = buscarCard(id);
  if (!card || !iniciarGesto('Mudar tamanho do card')) return;
  const centro = posicaoAbsoluta(card, geometria());
  const p = telaParaMundo(ponto.x, ponto.y);
  acao = {
    tipo: 'redimensionando-card', id, ponteiro, centro,
    // O card cresce em volta do centro: o tamanho acompanha a distância do
    // cursor até o centro, e o canto arrastado fica embaixo do cursor.
    distanciaInicial: Math.max(1, Math.hypot(p.X - centro.X, p.Y - centro.Y)),
    escalaInicial: card.escala ?? 1,
    escalaAtual: card.escala ?? 1,
  };
  capturarPonteiro(ponteiro);
  palco.classList.add('redimensionando');
  marcarRedimensionando(id, `${Math.round(acao.escalaAtual * 100)}%`);
  selecionar(id);
}

function atualizarRedimensionamento(ponto) {
  const p = telaParaMundo(ponto.x, ponto.y);
  const fator = Math.hypot(p.X - acao.centro.X, p.Y - acao.centro.Y) / acao.distanciaInicial;
  const nova = normalizarEscala(acao.escalaInicial * fator, ESCALA_CARD_MIN, ESCALA_CARD_MAX);
  if (nova === acao.escalaAtual) return;
  acao.escalaAtual = nova;
  const { id } = acao;
  alterarDuranteGesto((dados) => {
    const card = dados.cards.find((c) => c.id === id);
    if (card) card.escala = nova;
  });
  marcarRedimensionando(id, `${Math.round(nova * 100)}%`);
}

function finalizarRedimensionamento(terminado) {
  marcarRedimensionando(terminado.id, null);
  encerrarArrasto();
  concluirGesto();
}

// --- O mapa anda sozinho perto da borda --------------------------------------------

function avaliarAutoPan(ponto) {
  const area = areaUtil();
  const forca = (distanciaDaBorda) => Math.min(1, Math.max(0, 1 - distanciaDaBorda / MARGEM_AUTO_PAN));
  autoPan.vx = VELOCIDADE_AUTO_PAN * (forca(ponto.x - area.x) - forca(area.x + area.largura - ponto.x));
  autoPan.vy = VELOCIDADE_AUTO_PAN * (forca(ponto.y - area.y) - forca(area.y + area.altura - ponto.y));
  if ((autoPan.vx || autoPan.vy) && autoPan.quadro === null) autoPan.quadro = requestAnimationFrame(passoDoAutoPan);
}

function passoDoAutoPan() {
  autoPan.quadro = null;
  const arrastando = acao?.tipo === 'arrastando-card' || acao?.tipo === 'criando-conexao';
  if (!arrastando || (!autoPan.vx && !autoPan.vy)) return;
  moverPor(autoPan.vx, autoPan.vy); // a câmera avisa, e o arrasto acompanha
  autoPan.quadro = requestAnimationFrame(passoDoAutoPan);
}

function pararAutoPan() {
  autoPan.vx = 0;
  autoPan.vy = 0;
  if (autoPan.quadro !== null) cancelAnimationFrame(autoPan.quadro);
  autoPan.quadro = null;
}

// --- Pinça (tela sensível ao toque) ------------------------------------------------

function iniciarPinca() {
  if (acao?.tipo === 'arrastando-card') finalizarArrasto(acao);
  else if (acao?.tipo === 'criando-conexao') finalizarCriacaoDeConexao(acao, false);
  else if (acao?.tipo === 'redimensionando-card') finalizarRedimensionamento(acao);
  encerrarArrasto();
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

// --- Cliques: duplo clique, ícones dos cards e textos das conexões --------------------

function aoDuploClique(evento) {
  const alvo = document.elementFromPoint(evento.clientX, evento.clientY);
  if (!alvo || !palco.contains(alvo) || alvo.closest('.card-acao, .rotulo-conexao, .alca, .card-recolher')) return;
  // Duplo clique na alça de tamanho: o card volta ao tamanho normal.
  const alcaTamanho = alvo.closest('.alca-tamanho');
  if (alcaTamanho) {
    const id = alcaTamanho.closest('.card').dataset.id;
    if (podeEditar() && (buscarCard(id)?.escala ?? 1) !== 1) {
      definirEscalaDoCard(id, 1);
      toast('Card no tamanho normal. Ctrl+Z desfaz.', { duracao: 2400 });
    }
    return;
  }
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

function aoClicar(evento) {
  const rotulo = evento.target.closest('.rotulo-conexao');
  if (rotulo) {
    evento.stopPropagation();
    if (rotulo.dataset.expandir) {
      // "3 conexões" de cards escondidos: expande quem os esconde.
      expandirCards(rotulo.dataset.expandir.split(','));
    } else if (rotulo.dataset.id) {
      abrirEditorConexao(rotulo.dataset.id);
    }
    return;
  }
  const recolher = evento.target.closest('.card-recolher');
  if (recolher) {
    evento.stopPropagation();
    const id = recolher.closest('.card')?.dataset.id;
    if (id) alternarRecolhido(id);
    return;
  }
  const botao = evento.target.closest('.card-acao');
  if (!botao) return;
  evento.stopPropagation();
  const id = botao.closest('.card')?.dataset.id;
  if (!id || !obterDados()) return;
  if (botao.dataset.acao === 'docs') abrirLinkDocs(id);
  else if (botao.dataset.acao === 'animacao') abrirAnimacaoDoCard(id);
}
