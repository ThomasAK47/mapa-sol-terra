// =============================================================================
// camera.js — a "câmera" do mapa: deslocamento (pan) e zoom.
//
// Um ponto do mundo (X, Y) aparece na tela em:
//     x = X · escala + tx        y = Y · escala + ty
// O elemento #mundo recebe essa mesma transformação via CSS, então tudo que
// está dentro dele (cards, conexões) acompanha pan e zoom de uma só vez.
// O canvas de fundo (js/fundo.js) é redesenhado com a mesma câmera.
//
// Também trata a roda do mouse, o touchpad e a pinça do Safari.
// =============================================================================

import { limitar, local, PREFIXO_LOCAL } from './util.js';

export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 3;

// Quanto o zoom responde a cada tipo de gesto. Para deixar um deles mais (ou
// menos) sensível, aumente (ou diminua) o número correspondente.
const SENSIBILIDADE_RODA = 0.0015;    // roda do mouse: passos grandes (~100 por "clique")
const SENSIBILIDADE_TOUCHPAD = 0.01;  // dois dedos no touchpad, no modo "sempre zoom"
const GANHO_DA_PINCA = 1.5;           // pinça no touchpad: 50% mais sensível que o padrão

const CHAVE_CAMERA = PREFIXO_LOCAL + 'camera';
const CHAVE_RODA = PREFIXO_LOCAL + 'roda';

const camera = { tx: 0, ty: 0, escala: 1 };
const ouvintes = [];
let palco = null;
let mundo = null;
let quadroPendente = false;
let animacao = null;            // transição suave em andamento
let margemDireita = 0;          // largura ocupada pelo painel lateral
let guardarPosicao = true;      // false no modo de teste
let temporizadorGuardar = null;
let temporizadorMovendo = null;
let modoRoda = local.ler(CHAVE_RODA, 'auto');   // 'auto' | 'zoom' | 'mover'
let sequenciaRoda = { ate: 0, tipo: null };
let escalaNoInicioDoGesto = 1;
let tamanhoAnterior = null;     // tamanho da tela no último quadro desenhado

export function iniciarCamera(elementoPalco, elementoMundo, opcoes = {}) {
  palco = elementoPalco;
  mundo = elementoMundo;
  guardarPosicao = opcoes.guardarPosicao !== false;
  palco.addEventListener('wheel', aoRodar, { passive: false });
  // Safari (macOS): a pinça no trackpad chega como "gesture events".
  palco.addEventListener('gesturestart', aoIniciarGestoSafari);
  palco.addEventListener('gesturechange', aoMudarGestoSafari);
  palco.addEventListener('gestureend', (evento) => evento.preventDefault());
  window.addEventListener('resize', aoRedimensionar);
  agendarQuadro();
}

/** Quando a janela muda de tamanho, o mesmo ponto do mapa continua no centro. */
function aoRedimensionar() {
  if (tamanhoAnterior) {
    const X = (tamanhoAnterior.largura / 2 - camera.tx) / camera.escala;
    const Y = (tamanhoAnterior.altura / 2 - camera.ty) / camera.escala;
    camera.tx = palco.clientWidth / 2 - X * camera.escala;
    camera.ty = palco.clientHeight / 2 - Y * camera.escala;
  }
  agendarQuadro();
}

/** A câmera atual ({ tx, ty, escala }). Não modifique diretamente. */
export function obterCamera() {
  return camera;
}

/**
 * Registra uma função chamada sempre que a câmera muda. Ela roda dentro do
 * mesmo quadro de animação que move os cards, para tudo andar junto.
 */
export function aoMudarCamera(funcao) {
  ouvintes.push(funcao);
}

function agendarQuadro() {
  if (quadroPendente) return;
  quadroPendente = true;
  requestAnimationFrame(aplicar);
}

function aplicar() {
  quadroPendente = false;
  tamanhoAnterior = { largura: palco.clientWidth, altura: palco.clientHeight };
  mundo.style.transform = `translate(${camera.tx}px, ${camera.ty}px) scale(${camera.escala})`;
  for (const funcao of ouvintes) funcao(camera);
  if (guardarPosicao) {
    clearTimeout(temporizadorGuardar);
    temporizadorGuardar = setTimeout(guardar, 400);
  }
}

/** Durante pan/zoom o #palco ganha a classe "movendo" (ver estilo.css). */
function sinalizarMovimento() {
  palco.classList.add('movendo');
  clearTimeout(temporizadorMovendo);
  temporizadorMovendo = setTimeout(() => palco.classList.remove('movendo'), 180);
}

// --- Conversões e área útil -------------------------------------------------

export function telaParaMundo(x, y) {
  return { X: (x - camera.tx) / camera.escala, Y: (y - camera.ty) / camera.escala };
}

export function mundoParaTela(X, Y) {
  return { x: X * camera.escala + camera.tx, y: Y * camera.escala + camera.ty };
}

/** O painel lateral avisa quanto espaço ocupa à direita. */
export function definirMargemDireita(pixels) {
  margemDireita = pixels;
}

/** Parte da tela realmente visível (sem a barra do topo e sem o painel). */
export function areaUtil() {
  const topo = document.getElementById('barra')?.offsetHeight ?? 0;
  return {
    x: 0,
    y: topo,
    largura: Math.max(100, palco.clientWidth - margemDireita),
    altura: Math.max(100, palco.clientHeight - topo),
  };
}

// --- Movimentos -----------------------------------------------------------------

export function moverPor(dx, dy) {
  if (!dx && !dy) return;
  pararAnimacao();
  camera.tx += dx;
  camera.ty += dy;
  sinalizarMovimento();
  agendarQuadro();
}

/** Zoom mantendo fixo o ponto da tela (x, y), ex.: onde está o cursor. */
export function zoomNoPonto(x, y, fator) {
  const novaEscala = limitar(camera.escala * fator, ZOOM_MIN, ZOOM_MAX);
  const f = novaEscala / camera.escala;
  if (f === 1) return;
  pararAnimacao();
  camera.tx = x - (x - camera.tx) * f;
  camera.ty = y - (y - camera.ty) * f;
  camera.escala = novaEscala;
  sinalizarMovimento();
  agendarQuadro();
}

/** Centraliza o ponto (X, Y) do mundo na área útil, com a escala dada. */
export function irPara(centro, escala = camera.escala, { animar = true } = {}) {
  const area = areaUtil();
  const escalaFinal = limitar(escala, ZOOM_MIN, ZOOM_MAX);
  const destino = {
    escala: escalaFinal,
    tx: area.x + area.largura / 2 - centro.X * escalaFinal,
    ty: area.y + area.altura / 2 - centro.Y * escalaFinal,
  };
  if (animar) animarPara(destino);
  else {
    pararAnimacao();
    Object.assign(camera, destino);
    agendarQuadro();
  }
}

/** Ajusta a câmera para um retângulo do mundo caber na área útil. */
export function enquadrar(retangulo, { margem = 60, animar = true, zoomMaximo = 1 } = {}) {
  const area = areaUtil();
  const escalaX = (area.largura - 2 * margem) / Math.max(1, retangulo.largura);
  const escalaY = (area.altura - 2 * margem) / Math.max(1, retangulo.altura);
  const escala = limitar(Math.min(escalaX, escalaY), ZOOM_MIN, zoomMaximo);
  irPara({ X: retangulo.x + retangulo.largura / 2, Y: retangulo.y + retangulo.altura / 2 }, escala, { animar });
}

/** Transição suave (o zoom é interpolado em escala logarítmica). */
function animarPara(destino, duracao = 380) {
  pararAnimacao();
  const area = areaUtil();
  const cx = area.x + area.largura / 2;
  const cy = area.y + area.altura / 2;
  const inicio = { escala: camera.escala, centro: telaParaMundo(cx, cy) };
  const fim = { escala: destino.escala, centro: { X: (cx - destino.tx) / destino.escala, Y: (cy - destino.ty) / destino.escala } };
  const t0 = performance.now();
  const passo = (agora) => {
    const p = Math.min(1, (agora - t0) / duracao);
    const e = 1 - Math.pow(1 - p, 3); // desacelera no fim
    const escala = Math.exp(Math.log(inicio.escala) + (Math.log(fim.escala) - Math.log(inicio.escala)) * e);
    const X = inicio.centro.X + (fim.centro.X - inicio.centro.X) * e;
    const Y = inicio.centro.Y + (fim.centro.Y - inicio.centro.Y) * e;
    camera.escala = escala;
    camera.tx = cx - X * escala;
    camera.ty = cy - Y * escala;
    sinalizarMovimento();
    agendarQuadro();
    animacao = p < 1 ? requestAnimationFrame(passo) : null;
  };
  animacao = requestAnimationFrame(passo);
}

function pararAnimacao() {
  if (animacao !== null) {
    cancelAnimationFrame(animacao);
    animacao = null;
  }
}

// --- Roda do mouse, touchpad e pinça -----------------------------------------

export function obterModoRoda() {
  return modoRoda;
}

export function definirModoRoda(modo) {
  modoRoda = ['auto', 'zoom', 'mover'].includes(modo) ? modo : 'auto';
  local.gravar(CHAVE_RODA, modoRoda);
}

/**
 * Tenta distinguir a roda de um mouse do deslizar de dois dedos no touchpad
 * (o navegador entrega os dois como o mesmo tipo de evento).
 */
function pareceRodaDeMouse(evento) {
  // (ler deltaMode antes de deltaY é importante no Firefox)
  if (evento.deltaMode !== 0) return true;         // Firefox: roda conta em "linhas"
  if (evento.deltaX !== 0) return false;           // movimento lateral: touchpad
  const passo = evento.wheelDeltaY;                // não padronizado, mas bem suportado
  if (typeof passo === 'number' && passo !== 0) return passo % 120 === 0; // roda: múltiplos de 120
  return Number.isInteger(evento.deltaY) && Math.abs(evento.deltaY) >= 50;
}

function classificarRoda(evento) {
  if (evento.ctrlKey || evento.metaKey) return 'zoom'; // pinça no touchpad ou Ctrl + roda
  if (modoRoda === 'zoom' || modoRoda === 'mover') return modoRoda;
  const agora = performance.now();
  let tipo = pareceRodaDeMouse(evento) ? 'zoom' : 'mover';
  // Numa mesma sequência de eventos (sem pausa), quem começou como touchpad
  // continua touchpad, mesmo se um evento isolado parecer de mouse.
  if (agora < sequenciaRoda.ate && sequenciaRoda.tipo === 'mover') tipo = 'mover';
  sequenciaRoda = { ate: agora + 250, tipo };
  return tipo;
}

function aoRodar(evento) {
  evento.preventDefault(); // impede o navegador de rolar ou dar zoom na página
  const acao = classificarRoda(evento);
  const porUnidade = evento.deltaMode === 1 ? 33 : evento.deltaMode === 2 ? palco.clientHeight : 1;
  const dx = evento.deltaX * porUnidade;
  const dy = evento.deltaY * porUnidade;
  if (acao === 'mover') {
    moverPor(-dx, -dy);
  } else {
    // Roda do mouse: passos grandes (~100) → sensibilidade menor.
    // Touchpad: passos pequenos e frequentes → sensibilidade maior. A pinça
    // chega como "roda com Ctrl" e ganha um reforço.
    const sensibilidade = pareceRodaDeMouse(evento) ? SENSIBILIDADE_RODA
      : evento.ctrlKey ? SENSIBILIDADE_TOUCHPAD * GANHO_DA_PINCA
        : SENSIBILIDADE_TOUCHPAD;
    const fator = Math.exp(-limitar(dy, -120, 120) * sensibilidade);
    zoomNoPonto(evento.clientX, evento.clientY, fator);
  }
}

function aoIniciarGestoSafari(evento) {
  evento.preventDefault();
  escalaNoInicioDoGesto = camera.escala;
}

function aoMudarGestoSafari(evento) {
  evento.preventDefault();
  // O mesmo reforço da pinça, aplicado à abertura dos dedos informada pelo Safari.
  const alvo = escalaNoInicioDoGesto * Math.pow(evento.scale, GANHO_DA_PINCA);
  zoomNoPonto(evento.clientX, evento.clientY, alvo / camera.escala);
}

// --- Guardar e restaurar a posição --------------------------------------------

function guardar() {
  const area = areaUtil();
  const centro = telaParaMundo(area.x + area.largura / 2, area.y + area.altura / 2);
  local.gravar(CHAVE_CAMERA, { X: Math.round(centro.X), Y: Math.round(centro.Y), escala: Number(camera.escala.toFixed(4)) });
}

/** Volta para onde a câmera estava na última visita. Devolve false se não havia. */
export function restaurarCamera() {
  if (!guardarPosicao) return false;
  const salvo = local.ler(CHAVE_CAMERA);
  if (!salvo || ![salvo.X, salvo.Y, salvo.escala].every(Number.isFinite)) return false;
  irPara({ X: salvo.X, Y: salvo.Y }, salvo.escala, { animar: false });
  return true;
}
