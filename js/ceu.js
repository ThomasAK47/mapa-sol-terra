// =============================================================================
// ceu.js — o céu atrás do mapa: estrelas e partículas de vento solar.
//
// É só decoração: um desenho estilizado, que não representa medidas nem um
// modelo físico.
//   • Estrelas: pontos fixos, que não piscam. Ficam sempre visíveis. Quando o
//     mapa é arrastado, elas andam bem pouco (4% do movimento), o que dá uma
//     sensação de profundidade.
//   • Vento solar: riscos claros e discretos que se afastam do Sol em todas
//     as direções. Perto da Terra, eles não entram na região do primeiro
//     anel do campo (a linha de campo mais externa): escorregam por fora
//     dele e seguem adiante. Só aparecem com os efeitos ligados.
// Quem chama estas funções é js/fundo.js, que desenha tudo no mesmo canvas do
// Sol e da Terra.
// =============================================================================

const PARALAXE_DAS_ESTRELAS = 0.04;
const AREA_POR_ESTRELA = 5200;        // pixels de tela para cada estrela
const MAXIMO_DE_ESTRELAS = 900;
const BRILHOS = [0.14, 0.26, 0.42, 0.66];   // opacidade de cada grupo de estrelas

const AREA_POR_PARTICULA = 17000;     // pixels de tela para cada partícula
const MAXIMO_DE_PARTICULAS = 300;
const MARGEM_DO_VENTO = 40;           // as partículas vivem até um pouco fora da tela
const TEMPO_PARA_SURGIR = 0.5;        // segundos até a partícula aparecer por inteiro
const TEMPO_PARA_SUMIR = 0.8;         // segundos finais, em que ela vai apagando
const PARTE_QUE_NASCE_NO_SOL = 0.3;   // fração das partículas que nasce na borda do Sol (com ele na tela)
const FAIXA_DE_DESVIO = 1.07;         // a partícula começa a desviar um pouco antes de tocar o anel
const OPACIDADES_DO_VENTO = [0.045, 0.08, 0.12, 0.16, 0.2];

/** Gerador de números "aleatórios" que se repete: o céu é igual a cada visita. */
function sorteador(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Resto da divisão que nunca é negativo (para dar a volta na tela). */
const voltar = (valor, tamanho) => ((valor % tamanho) + tamanho) % tamanho;

// --- Estrelas -------------------------------------------------------------------

// Posições sorteadas uma única vez, em frações da tela (0 a 1).
const estrelas = [];
{
  const sorte = sorteador(20251);
  for (let i = 0; i < MAXIMO_DE_ESTRELAS; i++) {
    const brilho = sorte();
    estrelas.push({
      u: sorte(),
      v: sorte(),
      // A maioria é pequena e fraca; poucas são maiores e mais claras.
      tamanho: brilho > 0.93 ? 1.8 : brilho > 0.7 ? 1.3 : 1,
      grupo: brilho > 0.93 ? 3 : brilho > 0.7 ? 2 : brilho > 0.35 ? 1 : 0,
    });
  }
}

// Quanto o mapa já foi arrastado (só arrastos: o zoom não desloca as estrelas).
let arrastoX = 0;
let arrastoY = 0;
let ultimaCamera = null;

/** Anota o movimento da câmera desde o último desenho. */
export function acompanharCamera(camera) {
  if (ultimaCamera && ultimaCamera.escala === camera.escala) {
    arrastoX += camera.tx - ultimaCamera.tx;
    arrastoY += camera.ty - ultimaCamera.ty;
  }
  ultimaCamera = { tx: camera.tx, ty: camera.ty, escala: camera.escala };
}

/** Estrelas: quadradinhos de 1 a 2 pixels, alinhados aos pixels da tela. */
export function desenharEstrelas(contexto, largura, altura, pixelRatio) {
  const quantidade = Math.min(MAXIMO_DE_ESTRELAS, Math.round((largura * altura) / AREA_POR_ESTRELA));
  const dx = arrastoX * PARALAXE_DAS_ESTRELAS;
  const dy = arrastoY * PARALAXE_DAS_ESTRELAS;
  for (let grupo = 0; grupo < BRILHOS.length; grupo++) {
    contexto.fillStyle = `rgba(255, 255, 255, ${BRILHOS[grupo]})`;
    for (let i = 0; i < quantidade; i++) {
      const estrela = estrelas[i];
      if (estrela.grupo !== grupo) continue;
      const x = Math.round(voltar(estrela.u * largura + dx, largura) * pixelRatio) / pixelRatio;
      const y = Math.round(voltar(estrela.v * altura + dy, altura) * pixelRatio) / pixelRatio;
      contexto.fillRect(x, y, estrela.tamanho, estrela.tamanho);
    }
  }
}

// --- Vento solar ----------------------------------------------------------------
//
// As partículas vivem no espaço do MAPA (acompanham pan e zoom). Cada uma anda
// em linha reta, afastando-se do centro do Sol, e some depois de alguns
// segundos; outra nasce em algum ponto da tela ou na borda do Sol. Assim a
// quantidade na tela é sempre parecida, em qualquer zoom, e a conta por
// quadro é pequena (no máximo 300 partículas).
//
// O "escudo" é a região do primeiro anel do campo da Terra, aproximada por
// meia elipse do lado do Sol (o "nariz") seguida de duas retas horizontais:
//
//          ____________________ →  y = +B
//        /
//   nariz (      Terra •           (X, Y) é o centro da Terra;
//        \ ____________________ →  y = −B     a elipse tem centro em X + xm,
//                                             meio eixo A (horizontal) e B.

const particulas = [];   // { X, Y, dirX, dirY, idade, vida, rapidez, comprimento, opacidade }
let instanteAnterior = 0;
// Listas reaproveitadas a cada quadro (uma por nível de opacidade): x, y, dx, dy.
const riscos = OPACIDADES_DO_VENTO.map(() => []);

/** O ponto (X, Y) do mapa está dentro do escudo? */
function dentroDoEscudo(X, Y, escudo) {
  const px = X - escudo.X;
  const py = Y - escudo.Y;
  if (px >= escudo.xm) return Math.abs(py) < escudo.B;
  const u = (px - escudo.xm) / escudo.A;
  const v = py / escudo.B;
  return u * u + v * v < 1;
}

/** Sorteia vida, velocidade e aparência de uma partícula. */
function sortearAparencia(p) {
  const rapidez = Math.random();
  p.vida = 3.5 + Math.random() * 5;          // segundos
  p.rapidez = 16 + rapidez * 44;             // pixels de tela por segundo
  p.comprimento = 6 + rapidez * 12;          // pixels de tela
  p.opacidade = 0.08 + Math.random() * 0.14;
}

/**
 * Faz a partícula nascer: na borda do Sol (se ele aparece na tela) ou num
 * ponto qualquer da tela. Se o ponto sorteado cair dentro do Sol ou do
 * escudo, ela fica para o próximo quadro.
 */
function nascer(p, camera, largura, altura, cena) {
  p.idade = 0;
  p.vida = 0; // "morta" até achar um lugar
  let X;
  let Y;
  let achou = false;
  const raioNaTela = cena.sol.raio * camera.escala;
  const solX = cena.sol.X * camera.escala + camera.tx;
  const solY = cena.sol.Y * camera.escala + camera.ty;
  const solNaTela = solX + raioNaTela > 0 && solX - raioNaTela < largura && solY + raioNaTela > 0 && solY - raioNaTela < altura;
  if (solNaTela && Math.random() < PARTE_QUE_NASCE_NO_SOL) {
    for (let tentativa = 0; tentativa < 4 && !achou; tentativa++) {
      const angulo = Math.random() * Math.PI * 2;
      X = cena.sol.X + Math.cos(angulo) * cena.sol.raio * 1.02;
      Y = cena.sol.Y + Math.sin(angulo) * cena.sol.raio * 1.02;
      const x = X * camera.escala + camera.tx;
      const y = Y * camera.escala + camera.ty;
      achou = x > 0 && x < largura && y > 0 && y < altura;
    }
  }
  if (!achou) {
    X = (Math.random() * largura - camera.tx) / camera.escala;
    Y = (Math.random() * altura - camera.ty) / camera.escala;
    if (Math.hypot(X - cena.sol.X, Y - cena.sol.Y) < cena.sol.raio) return;
  }
  if (cena.escudo && dentroDoEscudo(X, Y, cena.escudo)) return;
  p.X = X;
  p.Y = Y;
  sortearAparencia(p);
}

/**
 * Avança uma partícula por "passo" unidades do mapa: em linha reta para longe
 * do Sol ou, junto ao escudo, escorregando por fora dele.
 */
function avancar(p, passo, cena) {
  let dx = p.X - cena.sol.X;
  let dy = p.Y - cena.sol.Y;
  const distancia = Math.hypot(dx, dy) || 1;
  dx /= distancia;
  dy /= distancia;

  const escudo = cena.escudo;
  if (escudo) {
    const px = p.X - escudo.X;
    const py = p.Y - escudo.Y;
    // "q" vale 1 em cima do anel, menos que 1 dentro e mais que 1 fora.
    // (nx, ny) aponta para fora do escudo.
    let q;
    let nx;
    let ny;
    if (px < escudo.xm) {
      const u = (px - escudo.xm) / escudo.A;
      const v = py / escudo.B;
      q = u * u + v * v;
      nx = u / escudo.A;
      ny = v / escudo.B;
    } else {
      const v = py / escudo.B;
      q = v * v;
      nx = 0;
      ny = v;
    }
    if (q < FAIXA_DE_DESVIO) {
      const tamanho = Math.hypot(nx, ny) || 1;
      nx /= tamanho;
      ny /= tamanho;
      const paraDentro = dx * nx + dy * ny;
      if (paraDentro < 0) {
        // Tira do movimento a parte que entraria no escudo: sobra a parte
        // que corre ao longo dele.
        dx -= paraDentro * nx;
        dy -= paraDentro * ny;
        let sobra = Math.hypot(dx, dy);
        if (sobra < 0.35) {
          // Quase de frente para o nariz: escorrega para o lado em que está.
          const lado = py < 0 ? -1 : 1;
          dx = lado * ny;
          dy = -lado * nx;
          sobra = 1;
        }
        dx /= sobra;
        dy /= sobra;
      }
    }
  }

  p.X += dx * passo;
  p.Y += dy * passo;
  p.dirX = dx;
  p.dirY = dy;

  // Se mesmo assim entrou, volta para cima do anel.
  if (escudo && dentroDoEscudo(p.X, p.Y, escudo)) {
    const px = p.X - escudo.X;
    const py = p.Y - escudo.Y;
    if (px >= escudo.xm) {
      p.Y = escudo.Y + (py < 0 ? -escudo.B : escudo.B);
    } else {
      const u = (px - escudo.xm) / escudo.A;
      const v = py / escudo.B;
      const q = Math.sqrt(u * u + v * v) || 1;
      p.X = escudo.X + escudo.xm + (u / q) * escudo.A;
      p.Y = escudo.Y + (v / q) * escudo.B;
    }
  }
}

/**
 * Atualiza e desenha o vento solar.
 *   camera — { tx, ty, escala }
 *   cena   — { sol: { X, Y, raio }, escudo: { X, Y, xm, A, B } ou null }, em
 *            unidades do mapa
 */
export function desenharVento(contexto, camera, largura, altura, cena) {
  const agora = performance.now();
  // Depois de uma pausa longa (efeitos desligados, aba escondida), o vento
  // continua de onde parou, sem dar um salto.
  const intervalo = agora - instanteAnterior > 500 ? 0 : Math.min((agora - instanteAnterior) / 1000, 0.1);
  instanteAnterior = agora;

  const quantidade = Math.min(MAXIMO_DE_PARTICULAS, Math.max(24, Math.round((largura * altura) / AREA_POR_PARTICULA)));
  while (particulas.length < quantidade) {
    // As primeiras já começam em idades diferentes, para não sumirem todas juntas.
    const p = { X: 0, Y: 0, dirX: 1, dirY: 0, idade: 0, vida: 0, rapidez: 0, comprimento: 0, opacidade: 0 };
    nascer(p, camera, largura, altura, cena);
    p.idade = Math.random() * p.vida;
    particulas.push(p);
  }
  particulas.length = quantidade;

  for (const lista of riscos) lista.length = 0;
  for (const p of particulas) {
    p.idade += intervalo;
    let x = p.X * camera.escala + camera.tx;
    let y = p.Y * camera.escala + camera.ty;
    const fora = x < -MARGEM_DO_VENTO || x > largura + MARGEM_DO_VENTO || y < -MARGEM_DO_VENTO || y > altura + MARGEM_DO_VENTO;
    if (p.idade >= p.vida || fora) {
      nascer(p, camera, largura, altura, cena);
      if (p.vida === 0) continue; // não achou lugar neste quadro
      x = p.X * camera.escala + camera.tx;
      y = p.Y * camera.escala + camera.ty;
    }
    // A velocidade é constante na TELA: com o zoom afastado, a partícula anda
    // mais unidades do mapa por segundo.
    if (intervalo > 0) {
      avancar(p, (p.rapidez * intervalo) / camera.escala, cena);
      x = p.X * camera.escala + camera.tx;
      y = p.Y * camera.escala + camera.ty;
    }

    const opacidade = p.opacidade *
      Math.min(1, p.idade / TEMPO_PARA_SURGIR) * Math.min(1, (p.vida - p.idade) / TEMPO_PARA_SUMIR);
    // Escolhe o nível de opacidade mais próximo (para desenhar em poucos traços).
    let nivel = 0;
    while (nivel < OPACIDADES_DO_VENTO.length - 1 && opacidade > (OPACIDADES_DO_VENTO[nivel] + OPACIDADES_DO_VENTO[nivel + 1]) / 2) nivel++;
    if (nivel === 0 && opacidade < OPACIDADES_DO_VENTO[0] / 2) continue; // quase invisível
    riscos[nivel].push(x, y, p.dirX * p.comprimento, p.dirY * p.comprimento);
  }

  contexto.save();
  contexto.lineWidth = 1;
  contexto.lineCap = 'round';
  for (let nivel = 0; nivel < riscos.length; nivel++) {
    const lista = riscos[nivel];
    if (lista.length === 0) continue;
    contexto.strokeStyle = `rgba(255, 255, 255, ${OPACIDADES_DO_VENTO[nivel]})`;
    contexto.beginPath();
    for (let i = 0; i < lista.length; i += 4) {
      contexto.moveTo(lista[i], lista[i + 1]);
      contexto.lineTo(lista[i] - lista[i + 2], lista[i + 1] - lista[i + 3]);
    }
    contexto.stroke();
  }
  contexto.restore();
}

/** Para testes e depuração: uma cópia das partículas vivas (posições no mapa). */
export function particulasDoVento() {
  return particulas.filter((p) => p.vida > 0).map((p) => ({ X: p.X, Y: p.Y, dirX: p.dirX, dirY: p.dirY }));
}
