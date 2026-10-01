// =============================================================================
// fundo.js — o fundo do mapa, desenhado num <canvas>, nesta ordem:
//   • as estrelas (js/ceu.js);
//   • a coroa do Sol (o brilho em volta dele);
//   • o vento solar (js/ceu.js), só com os efeitos ligados;
//   • o Sol, à esquerda (centro no início da primeira zona);
//   • a Terra com linhas de campo estilizadas, à direita (centro no fim da
//     última zona);
//   • as linhas tracejadas entre as zonas.
// Também posiciona, presos ao topo da tela, os nomes das zonas e as marcas de
// arrasto dos limites (clicar num nome ou arrastar uma marca edita a zona;
// quem cuida disso é js/zonas.js).
//
// Tudo é redesenhado a cada movimento da câmera, no mesmo quadro que move os
// cards. Com os efeitos ligados (js/efeitos.js), o fundo também é redesenhado
// cerca de 30 vezes por segundo, para a coroa "respirar" e o vento andar.
// =============================================================================

import { aoMudarCamera, obterCamera } from './camera.js';
import { acompanharCamera, desenharEstrelas, desenharVento } from './ceu.js';
import { aoMudarEfeitos, aoPassoDosEfeitos, efeitosLigados, tempoDosEfeitos } from './efeitos.js';
import { assinar, geometria, obterDados, podeEditar } from './estado.js';
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
let ultimoDesenho = 0;          // instante (ms) do último desenho
let rotulos = [];               // [{ id, elemento, alca, largura, oculto, limite, alcaOculta }]
let assinaturaZonas = '';
let assinaturaLarguras = '';    // para redesenhar quando uma zona muda de largura
let linhasDeCampo = null;       // pontos relativos ao centro da Terra
let limitesLinhasDeCampo = null;
let primeiroAnel = null;        // forma do anel mais externo do campo, do lado do Sol ({ xm, A, B })

export function iniciarFundo(elementoCanvas, elementoRotulos) {
  canvas = elementoCanvas;
  contexto = canvas.getContext('2d');
  camadaRotulos = elementoRotulos;
  linhasDeCampo = calcularLinhasDeCampo(TERRA.raio);
  limitesLinhasDeCampo = calcularLimites(linhasDeCampo);
  primeiroAnel = calcularPrimeiroAnel(linhasDeCampo);

  new ResizeObserver(redimensionar).observe(canvas);
  aoMudarCamera(desenharFundo);                 // já estamos dentro do quadro
  assinar((mudanca) => {
    if (mudanca.tipo === 'selecao' || !obterDados()) return;
    // As zonas podem ter mudado (nome, largura, zona nova, desfazer…).
    const larguras = obterDados().zonas.map((zona) => `${zona.id}:${zona.largura}`).join('|');
    if (mudanca.tipo === 'tudo' || larguras !== assinaturaLarguras || assinaturaDosRotulos(geometria()) !== assinaturaZonas) {
      assinaturaLarguras = larguras;
      agendarDesenho();
    }
  });
  // Efeitos: a cada passo do relógio, redesenha. Se a câmera acabou de
  // desenhar (mapa em movimento), este passo é dispensado.
  aoPassoDosEfeitos(() => {
    if (performance.now() - ultimoDesenho >= 25) desenharFundo();
  });
  aoMudarEfeitos(agendarDesenho);
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
  ultimoDesenho = performance.now();
  acompanharCamera(cam);
  // Com os efeitos desligados, o relógio fica parado e a coroa não se mexe.
  const tempo = tempoDosEfeitos();

  contexto.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  contexto.clearRect(0, 0, largura, altura);
  desenharEstrelas(contexto, largura, altura, pixelRatio);
  desenharCoroa(cam, geo.inicio, tempo);
  if (efeitosLigados()) {
    // O vento sai do Sol em todas as direções e contorna o primeiro anel do
    // campo da Terra (o "escudo"), sem entrar nele.
    desenharVento(contexto, cam, largura, altura, {
      sol: { X: geo.inicio, Y: 0, raio: SOL.raio },
      escudo: { X: geo.fim, Y: 0, ...primeiroAnel },
    });
  }
  desenharSol(cam, geo.inicio);
  desenharTerra(cam, geo.fim);
  desenharLimitesDasZonas(cam, geo);
  posicionarRotulos(cam, geo);
}

// --- Sol ---------------------------------------------------------------------

const ALCANCE_DA_COROA = 1.9;      // até onde o brilho pode chegar, em raios do Sol
// Manchas de brilho suave em volta do disco. Cada uma tem a sua posição
// (ângulo, em radianos), um giro muito lento, um tamanho (em raios do Sol) e
// o seu próprio ritmo de crescer e encolher.
const LOBOS_DA_COROA = [
  { angulo: 0.3, giro: 0.010, tamanho: 0.62, ritmo: 0.31, fase: 0.0 },
  { angulo: 1.5, giro: -0.008, tamanho: 0.50, ritmo: 0.23, fase: 1.9 },
  { angulo: 2.6, giro: 0.013, tamanho: 0.58, ritmo: 0.27, fase: 3.1 },
  { angulo: 3.9, giro: -0.011, tamanho: 0.46, ritmo: 0.36, fase: 4.4 },
  { angulo: 5.2, giro: 0.007, tamanho: 0.66, ritmo: 0.19, fase: 5.6 },
];

/**
 * A coroa: o brilho em volta do Sol. É um desenho, não um modelo físico.
 * Ela "respira" bem devagar: um halo redondo que cresce e encolhe um pouco,
 * e manchas de brilho que mudam de tamanho e de lugar aos poucos.
 */
function desenharCoroa(cam, X, tempo) {
  const cx = X * cam.escala + cam.tx;
  const cy = cam.ty;
  const r = SOL.raio * cam.escala;
  const alcance = r * ALCANCE_DA_COROA;
  if (cx + alcance < 0 || cx - alcance > largura || cy + alcance < 0 || cy - alcance > altura) return;

  // Duas ondas de períodos diferentes (uns 13 s e 30 s), para a respiração
  // não parecer um pisca-pisca regular. O resultado fica entre 0 e 1.
  const respiro = 0.5 + 0.3 * Math.sin(tempo * 0.48) + 0.2 * Math.sin(tempo * 0.21 + 1.7);

  // Halo redondo.
  const rHalo = r * (1.66 + 0.16 * respiro);
  let gradiente = contexto.createRadialGradient(cx, cy, r * 0.95, cx, cy, rHalo);
  gradiente.addColorStop(0, `rgba(255, 176, 80, ${(0.25 + 0.07 * respiro).toFixed(3)})`);
  gradiente.addColorStop(0.3, 'rgba(255, 150, 60, 0.10)');
  gradiente.addColorStop(1, 'rgba(255, 130, 40, 0)');
  contexto.fillStyle = gradiente;
  contexto.beginPath();
  contexto.arc(cx, cy, rHalo, 0, VOLTA);
  contexto.fill();

  // Manchas de brilho: círculos esfumados com o centro na borda do disco. A
  // metade de dentro fica escondida atrás do Sol, desenhado depois.
  for (const lobo of LOBOS_DA_COROA) {
    const angulo = lobo.angulo + lobo.giro * tempo;
    const cresce = 0.5 + 0.5 * Math.sin(tempo * lobo.ritmo + lobo.fase); // entre 0 e 1
    const raio = r * lobo.tamanho * (0.8 + 0.35 * cresce);
    const x = cx + r * 0.96 * Math.cos(angulo);
    const y = cy + r * 0.96 * Math.sin(angulo);
    gradiente = contexto.createRadialGradient(x, y, 0, x, y, raio);
    gradiente.addColorStop(0, `rgba(255, 184, 100, ${(0.15 + 0.07 * cresce).toFixed(3)})`);
    gradiente.addColorStop(0.55, 'rgba(255, 160, 70, 0.06)');
    gradiente.addColorStop(1, 'rgba(255, 140, 50, 0)');
    contexto.fillStyle = gradiente;
    contexto.beginPath();
    contexto.arc(x, y, raio, 0, VOLTA);
    contexto.fill();
  }
}

function desenharSol(cam, X) {
  const cx = X * cam.escala + cam.tx;
  const cy = cam.ty;
  const r = SOL.raio * cam.escala;
  if (cx + r < 0 || cx - r > largura || cy + r < 0 || cy - r > altura) return;

  // Disco: mais claro no centro e mais escuro na borda.
  let gradiente = contexto.createRadialGradient(cx, cy, 0, cx, cy, r);
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

/**
 * A forma do primeiro anel do campo (a linha mais externa) do lado do Sol,
 * para o vento solar contorná-lo (js/ceu.js). Do ponto mais próximo do Sol
 * (o "nariz") até o ponto mais alto, o anel é quase meia elipse:
 *   xm — posição x do ponto mais alto (centro da elipse), relativa à Terra;
 *   A  — distância horizontal do nariz até xm;
 *   B  — altura máxima do anel.
 */
function calcularPrimeiroAnel(linhas) {
  let anel = linhas[0];
  let nariz = Infinity;
  for (const linha of linhas) {
    for (let i = 0; i < linha.length; i += 2) {
      if (linha[i] < nariz) {
        nariz = linha[i];
        anel = linha;
      }
    }
  }
  let B = 0;
  let xm = 0;
  for (let i = 0; i < anel.length; i += 2) {
    if (Math.abs(anel[i + 1]) > B) {
      B = Math.abs(anel[i + 1]);
      xm = anel[i];
    }
  }
  return { xm, A: xm - nariz, B };
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

/** Muda quando os rótulos precisam ser refeitos (zonas, textos ou modo). */
function assinaturaDosRotulos(geo) {
  return `${podeEditar() ? 'edicao' : 'leitura'}\n${geo.lista.map((z) => `${z.id}|${z.nome}|${z.detalhe}`).join('\n')}`;
}

function atualizarRotulosSeZonasMudaram(geo) {
  const assinatura = assinaturaDosRotulos(geo);
  if (assinatura === assinaturaZonas) return;
  assinaturaZonas = assinatura;
  const editavel = podeEditar();
  camadaRotulos.replaceChildren();
  rotulos = geo.lista.map((zona) => {
    const dica = zona.detalhe ? `${zona.nome}: ${zona.detalhe}` : zona.nome;
    // No modo de edição, o nome é um botão (abre o editor da zona) e cada
    // zona tem, no limite da direita, uma marca para arrastar a largura.
    const elemento = el('div', {
      class: 'rotulo-zona', 'data-zona': zona.id,
      title: editavel ? `${dica}\n(clique para editar esta zona)` : dica,
      role: editavel ? 'button' : null, tabindex: editavel ? 0 : null,
    },
    el('span', { class: 'nome' }, zona.nome),
    zona.detalhe && el('span', { class: 'detalhe' }, zona.detalhe),
    );
    const alca = editavel
      ? el('div', {
        class: 'alca-zona', 'data-zona': zona.id,
        title: `Arraste para alargar ou estreitar a zona “${zona.nome}”`,
      })
      : null;
    camadaRotulos.append(elemento);
    if (alca) camadaRotulos.append(alca);
    return { id: zona.id, elemento, alca, largura: 0, oculto: false, limite: '', alcaOculta: false };
  });
  medirRotulos();
}

function medirRotulos() {
  for (const rotulo of rotulos) rotulo.largura = rotulo.elemento.querySelector('.nome').offsetWidth;
}

/**
 * Cada nome fica centrado na parte visível da sua zona. Se não couber, é
 * abreviado com "…"; se a zona estiver estreita demais na tela, some.
 * As marcas de arrasto ficam sobre o limite direito de cada zona.
 */
function posicionarRotulos(cam, geo) {
  for (const rotulo of rotulos) {
    const zona = geo.porId.get(rotulo.id);
    if (!zona) continue;
    const inicio = zona.inicio * cam.escala + cam.tx;
    const fim = zona.fim * cam.escala + cam.tx;
    if (rotulo.alca) {
      const fora = fim < -8 || fim > largura + 8;
      if (fora !== rotulo.alcaOculta) {
        rotulo.alcaOculta = fora;
        rotulo.alca.classList.toggle('oculta', fora);
      }
      if (!fora) rotulo.alca.style.transform = `translateX(${Math.round(fim)}px)`;
    }
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
