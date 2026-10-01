// =============================================================================
// efeitos.js — liga e desliga os efeitos animados, e marca o ritmo deles.
//
// Efeitos animados:
//   • partículas de vento solar e a coroa do Sol, desenhadas no canvas do
//     fundo (js/fundo.js e js/ceu.js);
//   • a flutuação dos cards, feita só com CSS (css/estilo.css), pela classe
//     "efeitos-ligados" no <body>.
// As estrelas são estáticas e ficam sempre visíveis.
//
// A escolha fica guardada no navegador (localStorage), fora do arquivo de
// dados. Com os efeitos desligados, nada roda em segundo plano: o fundo só é
// redesenhado quando a câmera ou os dados mudam, como antes.
// =============================================================================

import { animacaoAberta } from './janela-animacao.js';
import { local, PREFIXO_LOCAL } from './util.js';

const CHAVE = PREFIXO_LOCAL + 'efeitos';
// Os efeitos do fundo andam a 30 passos por segundo: o movimento é lento, e
// assim eles gastam metade do que gastariam acompanhando a tela.
const INTERVALO_MS = 1000 / 30;

let ligados = false;
let tempo = 0;              // relógio dos efeitos, em segundos (para quando eles param)
let anterior = 0;
let quadro = null;
const aoPassar = [];        // chamadas a cada passo do relógio
const aoMudar = [];         // chamadas quando os efeitos são ligados ou desligados

/** Lê a escolha guardada e começa (ou não) os efeitos. */
export function iniciarEfeitos() {
  const salvo = local.ler(CHAVE);
  // Sem escolha guardada: ligados, a não ser que o sistema esteja configurado
  // para reduzir animações (no Windows: "Efeitos de animação" desligado).
  const menosMovimento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  ligados = typeof salvo === 'boolean' ? salvo : !menosMovimento;
  aplicar();
}

export function efeitosLigados() {
  return ligados;
}

/** Tempo decorrido com os efeitos ligados, em segundos. */
export function tempoDosEfeitos() {
  return tempo;
}

/** Liga ou desliga os efeitos e guarda a escolha neste navegador. */
export function definirEfeitos(valor) {
  const novo = Boolean(valor);
  if (novo === ligados) return;
  ligados = novo;
  local.gravar(CHAVE, ligados);
  aplicar();
  for (const funcao of aoMudar) funcao(ligados);
}

/** Registra uma função chamada a cada passo do relógio dos efeitos. */
export function aoPassoDosEfeitos(funcao) {
  aoPassar.push(funcao);
}

/** Registra uma função chamada quando os efeitos são ligados ou desligados. */
export function aoMudarEfeitos(funcao) {
  aoMudar.push(funcao);
}

function aplicar() {
  document.body.classList.toggle('efeitos-ligados', ligados);
  if (ligados && quadro === null) {
    anterior = performance.now();
    quadro = requestAnimationFrame(passo);
  }
}

function passo(agora) {
  if (!ligados) {
    quadro = null; // desligados: o laço termina aqui
    return;
  }
  quadro = requestAnimationFrame(passo);
  if (animacaoAberta()) {
    anterior = agora; // a janela de animação cobre o mapa: nada a animar atrás dela
    return;
  }
  if (agora - anterior < INTERVALO_MS - 2) return;
  // Depois de uma pausa (aba escondida), o relógio não dá um salto.
  tempo += Math.min((agora - anterior) / 1000, 0.1);
  anterior = agora;
  for (const funcao of aoPassar) funcao();
}
