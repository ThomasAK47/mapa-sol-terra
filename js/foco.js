// =============================================================================
// foco.js — o "modo foco".
//
// Ao clicar num card, ele e suas conexões diretas (com os cards do outro
// lado) ficam em destaque, e o resto é esmaecido. Ao abrir o editor de uma
// conexão, o destaque vai para ela e para os dois cards que ela liga.
// Esc (ou um clique no fundo) sai do modo foco.
// =============================================================================

import { obterDados, ui } from './estado.js';

/**
 * O que está em destaque agora: { cards: Set, conexoes: Set }, ou null se
 * nada estiver em foco.
 */
export function focoAtual() {
  const dados = obterDados();
  if (!dados) return null;

  if (ui.conexaoAberta) {
    const conexao = dados.conexoes.find((k) => k.id === ui.conexaoAberta);
    if (conexao) return { cards: new Set([conexao.de, conexao.para]), conexoes: new Set([conexao.id]) };
  }

  if (!ui.selecionado) return null;
  const cards = new Set([ui.selecionado]);
  const conexoes = new Set();
  for (const conexao of dados.conexoes) {
    if (conexao.de === ui.selecionado || conexao.para === ui.selecionado) {
      conexoes.add(conexao.id);
      cards.add(conexao.de);
      cards.add(conexao.para);
    }
  }
  return { cards, conexoes };
}
