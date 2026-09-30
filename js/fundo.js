// =============================================================================
// fundo.js — o fundo do mapa, desenhado num <canvas>:
//   • o Sol, à esquerda (centro no início da primeira zona);
//   • a Terra com linhas de campo estilizadas, à direita (centro no fim da
//     última zona);
//   • as linhas tracejadas entre as zonas.
// Também posiciona os nomes das zonas, presos ao topo da tela.
//
// Tudo é redesenhado a cada movimento da câmera, no mesmo quadro que move os
// cards. (Estrelas, vento solar e a coroa animada chegam na Fase 5.)
// =============================================================================

import { aoMudarCamera, obterCamera } from './camera.js';
import { assinar, geometria, obterDados } from './estado.js';
import { el, limitar } from './util.js';

/** Tamanhos em unidades do mundo (um card tem 220 de largura). */
export const SOL = Object.freeze({ raio: 500 });
export const TERRA = Object.freeze({ raio: 150 });

const VOLTA = Math.PI * 2;

let canvas = null;
let contexto = null;
let camadaRotulos = null;
let pixelRatio = 1;
let largura = 0;
let altura = 0;
let desenhoPendente = false;
let rotulos = [];               // [{ zona, elemento, largura, oculto }]
let assinaturaZonas = '';
let linhasDeCampo = null;       // pontos relativos ao centro da Terra
let limitesLinhasDeCampo = null;

export function iniciarFundo(elementoCanvas, elementoRotulos) {
  canvas = elementoCanvas;
  contexto = canvas.getContext('2d');
  camadaRotulos = elementoRotulos;
  linhasDeCampo = calcularLinhasDeCampo(TERRA.raio);
  limitesLinhasDeCampo = calcularLimites(linhasDeCampo);

  new ResizeObserver(redimensionar).observe(canvas);
  aoMudarCamera(desenharFundo);                 // já estamos dentro do quadro
  assinar((mudanca) => {
    if (mudanca.tipo === 'tudo') agendarDesenho(); // zonas podem ter mudado
  });
  document.fonts?.ready.then(() => {
    medirRotulos();
    agendarDesenho();
  });
  redimensionar();
}

function redimensionar() {
  pixelRatio = window.devicePixelRatio || 1;
  largura = canvas.clientWidth;
  altura = canvas.clientHeight;
  canvas.width = Math.max(1, Math.round(largura * pixelRatio));
  canvas.height = Math.max(1, Math.round(altura * pixelRatio));
  desenharFundo();
}

export function agendarDesenho() {
  if (desenhoPendente) return;
  desenhoPendente = true;
  requestAnimationFrame(() => {
    desenhoPendente = false;
    desenharFundo();
  });
}

/** Desenha tudo com a câmera atual. */
export function desenharFundo() {
  if (!contexto || !obterDados()) return;
  const cam = obterCamera();
  const geo = geometria();
  atualizarRotulosSeZonasMudaram(geo);

  contexto.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  contexto.clearRect(0, 0, largura, altura);
  desenharSol(cam, geo.inicio);
  desenharTerra(cam, geo.fim);
  desenharLimitesDasZonas(cam, geo);
  posicionarRotulos(cam);
}

// --- Sol ---------------------------------------------------------------------

function desenharSol(cam, X) {
  const cx = X * cam.escala + cam.tx;
  const cy = cam.ty;
  const r = SOL.raio * cam.escala;
  const rBrilho = r * 1.75;
  if (cx + rBrilho < 0 || cx - rBrilho > largura || cy + rBrilho < 0 || cy - rBrilho > altura) return;

  // Brilho ao redor (a coroa, que será animada na Fase 5).
  let gradiente = contexto.createRadialGradient(cx, cy, r * 0.95, cx, cy, rBrilho);
  gradiente.addColorStop(0, 'rgba(255, 176, 80, 0.30)');
  gradiente.addColorStop(0.3, 'rgba(255, 150, 60, 0.10)');
  gradiente.addColorStop(1, 'rgba(255, 130, 40, 0)');
  contexto.fillStyle = gradiente;
  contexto.beginPath();
  contexto.arc(cx, cy, rBrilho, 0, VOLTA);
  contexto.fill();

  // Disco: mais claro no centro e mais escuro na borda.
  gradiente = contexto.createRadialGradient(cx, cy, 0, cx, cy, r);
  gradiente.addColorStop(0, '#fff6dc');
  gradiente.addColorStop(0.5, '#ffd98a');
  gradiente.addColorStop(0.82, '#ffb04a');
  gradiente.addColorStop(1, '#f07a22');
  contexto.fillStyle = gradiente;
  contexto.beginPath();
  contexto.arc(cx, cy, r, 0, VOLTA);
  contexto.fill();
}

// --- Terra --------------------------------------------------------------------

function desenharTerra(cam, X) {
  const cx = X * cam.escala + cam.tx;
  const cy = cam.ty;
  const e = cam.escala;
  const lim = limitesLinhasDeCampo;
  const fora = cx + lim.maxX * e < 0 || cx + lim.minX * e > largura ||
               cy + lim.maxY * e < 0 || cy + lim.minY * e > altura;
  if (fora) return;

  // Linhas de campo (desenhadas antes, para ficarem atrás do disco).
  contexto.save();
  contexto.strokeStyle = 'rgba(255, 255, 255, 0.17)';
  contexto.lineWidth = 1;
  contexto.beginPath();
  for (const linha of linhasDeCampo) {
    contexto.moveTo(cx + linha[0] * e, cy + linha[1] * e);
    for (let i = 2; i < linha.length; i += 2) contexto.lineTo(cx + linha[i] * e, cy + linha[i + 1] * e);
  }
  contexto.stroke();
  contexto.restore();

  const r = TERRA.raio * e;
  // Atmosfera: um halo claro e fino.
  const halo = contexto.createRadialGradient(cx, cy, r, cx, cy, r * 1.14);
  halo.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
  halo.addColorStop(1, 'rgba(255, 255, 255, 0)');
  contexto.fillStyle = halo;
  contexto.beginPath();
  contexto.arc(cx, cy, r * 1.14, 0, VOLTA);
  contexto.fill();

  // Disco em cinza: lado voltado para o Sol (esquerda) iluminado.
  const luz = contexto.createLinearGradient(cx - r, cy, cx + r, cy);
  luz.addColorStop(0, '#f0f0f0');
  luz.addColorStop(0.42, '#bababa');
  luz.addColorStop(0.6, '#4a4a4a');
  luz.addColorStop(1, '#232323');
  contexto.fillStyle = luz;
  contexto.beginPath();
  contexto.arc(cx, cy, r, 0, VOLTA);
  contexto.fill();
  contexto.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  contexto.lineWidth = 1;
  contexto.stroke();
}

/**
 * Linhas de campo estilizadas (não é um modelo físico, só um desenho):
 * laços de dipolo r = L·R·sen²θ, achatados do lado do Sol e esticados do
 * lado da noite, mais algumas linhas abertas formando a cauda.
 * Devolve listas de coordenadas [x0, y0, x1, y1, …] relativas ao centro.
 */
function calcularLinhasDeCampo(R) {
  const linhas = [];
  const Ls = [2.4, 3.8, 6, 9.5, 14.5, 22];
  const Lmax = Ls[Ls.length - 1];
  const pontosPorLinha = 72;

  for (const L of Ls) {
    const t = L / Lmax;
    const achatamento = 1 - 0.2 * t;             // lado do Sol (esquerda)
    const estiramento = 1 + 1.7 * Math.pow(t, 1.4); // lado da noite (direita)
    const inicio = Math.asin(Math.sqrt(1 / L));  // onde a linha toca a superfície
    for (const lado of [-1, 1]) {
      const fator = lado < 0 ? achatamento : estiramento;
      const linha = [];
      for (let i = 0; i <= pontosPorLinha; i++) {
        const theta = inicio + (Math.PI - 2 * inicio) * (i / pontosPorLinha);
        const r = L * R * Math.sin(theta) ** 2;
        linha.push(lado * r * Math.sin(theta) * fator, -r * Math.cos(theta));
      }
      linhas.push(linha);
    }
  }

  // Cauda: linhas que saem perto dos polos e se estendem para a direita.
  for (const [angulo, alturaFinal] of [[0.34, 9.5], [0.26, 11.5], [0.19, 13.5]]) {
    for (const sinal of [-1, 1]) {
      const p0 = [R * Math.sin(angulo), sinal * R * Math.cos(angulo)];
      const c1 = [R * 1.2, sinal * R * (alturaFinal * 0.75)];
      const c2 = [R * 9, sinal * R * alturaFinal];
      const p3 = [R * 70, sinal * R * (alturaFinal * 0.8)];
      const linha = [];
      for (let i = 0; i <= pontosPorLinha; i++) {
        const u = i / pontosPorLinha;
        const a = (1 - u) ** 3, b = 3 * (1 - u) ** 2 * u, c = 3 * (1 - u) * u ** 2, d = u ** 3;
        linha.push(a * p0[0] + b * c1[0] + c * c2[0] + d * p3[0], a * p0[1] + b * c1[1] + c * c2[1] + d * p3[1]);
      }
      linhas.push(linha);
    }
  }
  return linhas;
}

function calcularLimites(linhas) {
  const lim = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const linha of linhas) {
    for (let i = 0; i < linha.length; i += 2) {
      lim.minX = Math.min(lim.minX, linha[i]);
      lim.maxX = Math.max(lim.maxX, linha[i]);
      lim.minY = Math.min(lim.minY, linha[i + 1]);
      lim.maxY = Math.max(lim.maxY, linha[i + 1]);
    }
  }
  return lim;
}

// --- Limites e nomes das zonas ----------------------------------------------

function desenharLimitesDasZonas(cam, geo) {
  const periodo = 14; // traço + espaço, em pixels
  contexto.save();
  contexto.strokeStyle = 'rgba(255, 255, 255, 0.13)';
  contexto.lineWidth = 1;
  contexto.setLineDash([5, periodo - 5]);
  contexto.lineDashOffset = -(cam.ty % periodo); // o tracejado acompanha o pan vertical
  contexto.beginPath();
  // Só os limites ENTRE zonas: as bordas externas são os centros do Sol e da Terra.
  for (let i = 0; i < geo.lista.length - 1; i++) {
    const x = Math.round(geo.lista[i].fim * cam.escala + cam.tx) + 0.5;
    if (x < -1 || x > largura + 1) continue;
    contexto.moveTo(x, 0);
    contexto.lineTo(x, altura);
  }
  contexto.stroke();
  contexto.restore();
}

function atualizarRotulosSeZonasMudaram(geo) {
  const assinatura = geo.lista.map((z) => `${z.id}|${z.nome}|${z.detalhe}`).join('\n');
  if (assinatura === assinaturaZonas) return;
  assinaturaZonas = assinatura;
  camadaRotulos.replaceChildren();
  rotulos = geo.lista.map((zona) => {
    const elemento = el('div', { class: 'rotulo-zona', title: zona.detalhe ? `${zona.nome}: ${zona.detalhe}` : zona.nome },
      el('span', { class: 'nome' }, zona.nome),
      zona.detalhe && el('span', { class: 'detalhe' }, zona.detalhe),
    );
    camadaRotulos.append(elemento);
    return { zona, elemento, largura: 0, oculto: false, limite: '' };
  });
  medirRotulos();
}

function medirRotulos() {
  for (const rotulo of rotulos) rotulo.largura = rotulo.elemento.querySelector('.nome').offsetWidth;
}

/**
 * Cada nome fica centrado na parte visível da sua zona. Se não couber, é
 * abreviado com "…"; se a zona estiver estreita demais na tela, some.
 */
function posicionarRotulos(cam) {
  for (const rotulo of rotulos) {
    const inicio = rotulo.zona.inicio * cam.escala + cam.tx;
    const fim = rotulo.zona.fim * cam.escala + cam.tx;
    const visivelInicio = Math.max(inicio, 0);
    const visivelFim = Math.min(fim, largura);
    const disponivel = visivelFim - visivelInicio - 24; // 12 px de folga de cada lado
    const cabe = disponivel >= 44;
    if (cabe === rotulo.oculto) {
      rotulo.oculto = !cabe;
      rotulo.elemento.classList.toggle('oculto', !cabe);
    }
    if (!cabe) continue;
    const larguraMostrada = Math.min(rotulo.largura, disponivel);
    const limite = larguraMostrada < rotulo.largura ? `${Math.floor(disponivel)}px` : '';
    if (rotulo.limite !== limite) {
      rotulo.limite = limite;
      rotulo.elemento.style.maxWidth = limite;
    }
    const meia = larguraMostrada / 2 + 12;
    const centro = limitar((inicio + fim) / 2, visivelInicio + meia, visivelFim - meia);
    rotulo.elemento.style.transform = `translateX(${Math.round(centro)}px) translateX(-50%)`;
  }
}
