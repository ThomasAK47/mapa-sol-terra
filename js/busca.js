// =============================================================================
// busca.js — o campo de busca da barra de ferramentas.
//
// Filtra os cards pelo título, pela descrição e pelas tags, sem diferenciar
// acentos nem maiúsculas. Com várias palavras, todas precisam aparecer.
// Os resultados ficam em destaque (o resto esmaece) e a câmera vai até o
// primeiro. Enter (ou ↓) vai ao próximo, Shift+Enter (ou ↑) ao anterior e
// Esc limpa. Os resultados seguem a ordem do mapa, do Sol para a Terra.
//
// Se um resultado estiver dentro de um pai recolhido, o pai é expandido só
// temporariamente: ao limpar a busca, ele volta a ficar recolhido (a busca
// nunca altera o arquivo).
// =============================================================================

import { irPara, obterCamera } from './camera.js';
import { assinar, avisarMudancaVisual, geometria, obterDados } from './estado.js';
import { ancestraisRecolhidos, expandirTemporariamente, limparExpansoesTemporarias } from './hierarquia.js';
import { posicaoAbsoluta } from './modelo.js';
import { semAcentos } from './util.js';

const ESPERA_MS = 120;              // pausa na digitação antes de buscar
const ZOOM_MINIMO_PARA_LER = 0.7;   // abaixo disso, a câmera aproxima ao mostrar um resultado

let entrada = null;
let contador = null;
let termo = '';
let resultados = [];                // ids, na ordem do mapa
let atual = -1;
let temporizador = null;

export function iniciarBusca(elementoEntrada, elementoContador) {
  entrada = elementoEntrada;
  contador = elementoContador;
  entrada.addEventListener('input', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => buscar(entrada.value), ESPERA_MS);
  });
  entrada.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter' || evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
      evento.preventDefault();
      clearTimeout(temporizador);
      if (semAcentos(entrada.value).trim() !== semAcentos(termo)) buscar(entrada.value); // Enter antes da pausa
      else andar(evento.key === 'ArrowUp' || (evento.key === 'Enter' && evento.shiftKey) ? -1 : 1);
    } else if (evento.key === 'Escape') {
      evento.preventDefault();
      evento.stopPropagation(); // o Esc da busca não deve também fechar o painel
      limparBusca();
      entrada.blur();
    }
  });
  // Se os dados mudarem durante a busca, os resultados são refeitos (sem mover a câmera).
  assinar((mudanca) => {
    if (termo && (mudanca.tipo === 'dados' || mudanca.tipo === 'tudo')) recalcular();
  });
}

/**
 * Os ids dos cards que contêm todas as palavras do texto (em título,
 * descrição ou tags). Função pura: não mexe na tela.
 */
export function filtrarCards(cards, texto) {
  const palavras = semAcentos(texto).split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return [];
  return cards
    .filter((card) => {
      const alvo = semAcentos(`${card.titulo}\n${card.descricao}\n${card.tags.join('\n')}`);
      return palavras.every((palavra) => alvo.includes(palavra));
    })
    .map((card) => card.id);
}

/** true enquanto há algo digitado na busca. */
export function buscaAtiva() {
  return termo !== '';
}

/** Para destacar na tela: { ids: Set, atual: id|null }, ou null sem busca. */
export function resultadosDaBusca() {
  if (!termo) return null;
  return { ids: new Set(resultados), atual: atual >= 0 ? resultados[atual] : null };
}

/** Coloca o cursor no campo de busca (atalho Ctrl+F). */
export function focarCampoDeBusca() {
  entrada.focus();
  entrada.select();
}

export function limparBusca() {
  clearTimeout(temporizador);
  const tinhaBusca = termo !== '';
  termo = '';
  resultados = [];
  atual = -1;
  if (entrada) entrada.value = '';
  atualizarContador();
  const recolheuDeNovo = limparExpansoesTemporarias();
  if (tinhaBusca || recolheuDeNovo) avisarMudancaVisual();
}

// -----------------------------------------------------------------------------

function ordenarPeloMapa(ids) {
  const dados = obterDados();
  const geo = geometria();
  const porId = new Map(dados.cards.map((card) => [card.id, card]));
  return ids
    .map((id) => ({ id, p: posicaoAbsoluta(porId.get(id), geo) }))
    .sort((a, b) => a.p.X - b.p.X || a.p.Y - b.p.Y)
    .map((item) => item.id);
}

function buscar(texto) {
  const novo = texto.trim();
  if (!novo) {
    limparBusca();
    return;
  }
  termo = novo;
  limparExpansoesTemporarias(); // expansões da busca anterior não valem mais
  resultados = ordenarPeloMapa(filtrarCards(obterDados().cards, termo));
  atual = resultados.length ? 0 : -1;
  atualizarContador();
  if (atual >= 0) mostrarAtual();
  avisarMudancaVisual();
}

/** Refaz a lista depois de uma alteração nos dados, mantendo o resultado atual. */
function recalcular() {
  const idAtual = resultados[atual];
  resultados = ordenarPeloMapa(filtrarCards(obterDados().cards, termo));
  atual = resultados.indexOf(idAtual);
  if (atual < 0) atual = resultados.length ? 0 : -1;
  atualizarContador();
}

function andar(passo) {
  if (!termo || resultados.length === 0) return;
  atual = (atual + passo + resultados.length) % resultados.length;
  atualizarContador();
  mostrarAtual();
  avisarMudancaVisual();
}

/** Leva a câmera ao resultado atual (expandindo pais recolhidos, se preciso). */
function mostrarAtual() {
  const id = resultados[atual];
  const card = obterDados().cards.find((c) => c.id === id);
  if (!card) return;
  expandirTemporariamente(ancestraisRecolhidos(id));
  const escala = obterCamera().escala;
  irPara(posicaoAbsoluta(card, geometria()), escala >= ZOOM_MINIMO_PARA_LER ? escala : 0.9);
}

function atualizarContador() {
  if (!contador) return;
  if (!termo) contador.textContent = '';
  else if (resultados.length === 0) contador.textContent = 'nenhum';
  else contador.textContent = `${atual + 1} de ${resultados.length}`;
}
