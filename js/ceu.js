// =============================================================================
// ceu.js — o céu atrás do mapa: estrelas e partículas de vento solar.
//
// É só decoração: não representa medidas nem um modelo físico.
//   • Estrelas: pontos fixos, que não piscam. Ficam sempre visíveis. Quando o
//     mapa é arrastado, elas andam bem pouco (4% do movimento), o que dá uma
//     sensação de profundidade.
//   • Vento solar: riscos claros e discretos que andam da esquerda para a
//     direita, a partir do Sol. Só aparecem com os efeitos ligados.
// Quem chama estas funções é js/fundo.js, que desenha tudo no mesmo canvas do
// Sol e da Terra.
// =============================================================================

const PARALAXE_DAS_ESTRELAS = 0.04;
const AREA_POR_ESTRELA = 5200;        // pixels de tela para cada estrela
const MAXIMO_DE_ESTRELAS = 900;
const BRILHOS = [0.14, 0.26, 0.42, 0.66];   // opacidade de cada grupo de estrelas

const AREA_POR_PARTICULA = 17000;     // pixels de tela para cada partícula
const MAXIMO_DE_PARTICULAS = 300;
const MARGEM_DO_VENTO = 40;           // as partículas entram e saem um pouco fora da tela
const SURGIMENTO = 260;               // distância do Sol em que a partícula termina de aparecer
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

// Posições sorteadas uma única vez, em frações da tela (0 a 1).
const estrelas = [];
const particulas = [];
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
  for (let i = 0; i < MAXIMO_DE_PARTICULAS; i++) {
    const rapidez = sorte();
    particulas.push({
      u: sorte(),
      v: sorte(),
      velocidade: 16 + rapidez * 44,          // pixels de tela por segundo
      comprimento: 6 + rapidez * 12,
      opacidade: 0.08 + sorte() * 0.14,
    });
  }
}

// Quanto o mapa já foi arrastado (só arrastos: o zoom não desloca o céu).
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

// Listas reaproveitadas a cada quadro (uma por nível de opacidade).
const riscos = OPACIDADES_DO_VENTO.map(() => []);

/**
 * Vento solar no instante "tempo" (segundos). As partículas só aparecem à
 * direita de "xDoSol" (a posição do centro do Sol na tela) e surgem aos
 * poucos, como se saíssem dele.
 */
export function desenharVento(contexto, largura, altura, pixelRatio, tempo, xDoSol) {
  if (xDoSol > largura) return; // o Sol está à direita da tela: nada a mostrar
  const quantidade = Math.min(MAXIMO_DE_PARTICULAS, Math.round((largura * altura) / AREA_POR_PARTICULA));
  const percurso = largura + 2 * MARGEM_DO_VENTO;
  for (const lista of riscos) lista.length = 0;

  for (let i = 0; i < quantidade; i++) {
    const p = particulas[i];
    const x = voltar(p.u * percurso + p.velocidade * tempo + arrastoX, percurso) - MARGEM_DO_VENTO;
    const distancia = x - xDoSol;
    if (distancia <= 0) continue;
    // A altura é alinhada ao meio de um pixel da tela, para o risco sair nítido.
    const y = (Math.floor(voltar(p.v * altura + arrastoY, altura) * pixelRatio) + 0.5) / pixelRatio;
    const opacidade = p.opacidade * Math.min(1, distancia / SURGIMENTO);
    // Escolhe o nível de opacidade mais próximo (para desenhar em poucos traços).
    let nivel = 0;
    while (nivel < OPACIDADES_DO_VENTO.length - 1 && opacidade > (OPACIDADES_DO_VENTO[nivel] + OPACIDADES_DO_VENTO[nivel + 1]) / 2) nivel++;
    if (nivel === 0 && opacidade < OPACIDADES_DO_VENTO[0] / 2) continue; // ainda invisível
    riscos[nivel].push(x, y, Math.min(p.comprimento, distancia));
  }

  contexto.save();
  contexto.lineWidth = 1;
  contexto.lineCap = 'round';
  for (let nivel = 0; nivel < riscos.length; nivel++) {
    const lista = riscos[nivel];
    if (lista.length === 0) continue;
    contexto.strokeStyle = `rgba(255, 255, 255, ${OPACIDADES_DO_VENTO[nivel]})`;
    contexto.beginPath();
    for (let i = 0; i < lista.length; i += 3) {
      contexto.moveTo(lista[i], lista[i + 1]);
      contexto.lineTo(lista[i] - lista[i + 2], lista[i + 1]);
    }
    contexto.stroke();
  }
  contexto.restore();
}
