// =============================================================================
// acoes.js — operações que a interface dispara (criar, excluir, mudar de zona,
// enquadrar…). As que mudam dados passam por estado.alterar(), então entram
// no desfazer e disparam o salvamento automático.
// =============================================================================

import { confirmar, toast } from './avisos.js';
import { enquadrar, irPara, obterCamera } from './camera.js';
import { limitesDosCards } from './cards.js';
import {
  alterar, buscarCard, descartarUltimaSe, geometria, obterDados, selecionar, ui,
} from './estado.js';
import { SOL, TERRA } from './fundo.js';
import { definirPosicaoAbsoluta, novoCard, posicaoAbsoluta } from './modelo.js';
import { agoraISO, gerarId, limitar, linkSeguro, plural } from './util.js';

/** Cria um card vazio com o centro em (X, Y) do mundo. Devolve o id. */
export function criarCard(X, Y) {
  const dados = obterDados();
  const id = gerarId('c', new Set(dados.cards.map((card) => card.id)));
  const ok = alterar('Criar card', (d) => {
    const card = novoCard(id, agoraISO());
    definirPosicaoAbsoluta(card, Math.round(X), Math.round(Y), geometria());
    card.x = Math.round(card.x);
    d.cards.push(card);
  }, { marca: `criar:${id}` });
  if (!ok) return null;
  selecionar(id);
  return id;
}

/** true se o card não tem nada escrito. */
function cardVazio(card) {
  return !card.titulo.trim() && !card.descricao.trim() && card.tags.length === 0 && !card.linkDocs;
}

/**
 * Descarta um card recém-criado que ficou vazio (ex.: um duplo clique sem
 * querer). Só funciona se a criação foi a última ação.
 */
export function descartarSeVazio(id) {
  const card = buscarCard(id);
  if (!card || !cardVazio(card)) return false;
  if (descartarUltimaSe(`criar:${id}`)) {
    toast('Card vazio descartado.');
    return true;
  }
  return false;
}

/** Pede confirmação e exclui o card (as conexões dele vão junto). */
export async function excluirCard(id) {
  const card = buscarCard(id);
  if (!card) return false;
  const dados = obterDados();
  const nConexoes = dados.conexoes.filter((k) => k.de === id || k.para === id).length;
  const nFilhos = dados.cards.filter((c) => c.pai === id).length;
  const detalhes = [];
  if (nConexoes) detalhes.push(`${plural(nConexoes, 'conexão será excluída', 'conexões serão excluídas')} junto.`);
  if (nFilhos) detalhes.push(`${plural(nFilhos, 'card filho sobe', 'cards filhos sobem')} um nível.`);
  detalhes.push('Dá para desfazer com Ctrl+Z.');

  const ok = await confirmar({
    titulo: `Excluir o card “${card.titulo.trim() || 'sem título'}”?`,
    mensagem: detalhes.join('\n'),
    botaoOk: 'Excluir',
    perigo: true,
  });
  if (!ok) return false;

  alterar('Excluir card', (d) => {
    const alvo = d.cards.find((c) => c.id === id);
    if (!alvo) return;
    d.cards = d.cards.filter((c) => c.id !== id);
    d.conexoes = d.conexoes.filter((k) => k.de !== id && k.para !== id);
    // Os filhos sobem um nível: passam a ter como pai o pai do card excluído.
    for (const c of d.cards) if (c.pai === id) c.pai = alvo.pai ?? null;
  });
  if (ui.selecionado === id) selecionar(null);
  toast('Card excluído. Ctrl+Z desfaz.');
  return true;
}

/** Leva o card para outra zona, mantendo a posição relativa dentro dela. */
export function moverCardParaZona(id, zonaId) {
  const geo = geometria();
  const zona = geo.porId.get(zonaId);
  const card = buscarCard(id);
  if (!zona || !card || card.zona === zonaId) return;
  alterar('Mudar zona', (d) => {
    const c = d.cards.find((item) => item.id === id);
    const margem = Math.min(140, zona.largura / 2);
    c.zona = zonaId;
    c.x = Math.round(limitar(c.x, margem, zona.largura - margem));
  });
  centralizarCard(id);
}

/** Leva a câmera até o card, sem mudar o zoom. */
export function centralizarCard(id, { animar = true } = {}) {
  const card = buscarCard(id);
  if (!card) return;
  irPara(posicaoAbsoluta(card, geometria()), obterCamera().escala, { animar });
}

/** Enquadra todos os cards, o Sol e a Terra. */
export function enquadrarTudo({ animar = true } = {}) {
  const geo = geometria();
  let minX = geo.inicio - SOL.raio * 0.6;
  let maxX = geo.fim + TERRA.raio * 1.3;
  let minY = -SOL.raio * 0.8;
  let maxY = SOL.raio * 0.8;
  const cards = limitesDosCards();
  if (cards) {
    minX = Math.min(minX, cards.x);
    maxX = Math.max(maxX, cards.x + cards.largura);
    minY = Math.min(minY, cards.y);
    maxY = Math.max(maxY, cards.y + cards.altura);
  }
  enquadrar({ x: minX, y: minY, largura: maxX - minX, altura: maxY - minY }, { animar });
}

/** Abre o link do Google Docs do card numa nova aba. */
export function abrirLinkDocs(id) {
  const card = buscarCard(id);
  const url = linkSeguro(card?.linkDocs);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
  else toast('O link do Docs deste card não é válido (ele precisa começar com https://).');
}
