// =============================================================================
// foco.js — o "modo foco".
//
// Ao clicar num card, ficam em destaque: ele, suas conexões diretas (com os
// cards do outro lado), seu card pai e seus filhos. O resto é esmaecido.
// Ao abrir o editor de uma conexão, o destaque vai para ela e para os dois
// cards que ela liga. Esc (ou um clique no fundo) sai do modo foco.
//
// Cards escondidos (dentro de um pai recolhido) são representados pelo pai
// recolhido. Enquanto há uma busca ativa, o destaque da busca vale mais e o
// modo foco fica suspenso.
// =============================================================================

import { buscaAtiva } from './busca.js';
import { buscarCard, obterDados, ui } from './estado.js';
import { hierarquia } from './hierarquia.js';

/**
 * O que está em destaque agora, ou null se nada estiver em foco:
 *   cards    — ids dos cards em destaque;
 *   conexoes — ids das conexões em destaque;
 *   familia  — ids dos filhos cuja linha pai → filho fica em destaque.
 */
export function focoAtual() {
  const dados = obterDados();
  if (!dados || buscaAtiva()) return null;
  const { representante, visiveis, filhos } = hierarquia();
  const visivel = (id) => representante.get(id) ?? id;

  if (ui.conexaoAberta) {
    const conexao = dados.conexoes.find((k) => k.id === ui.conexaoAberta);
    if (conexao) {
      return {
        cards: new Set([visivel(conexao.de), visivel(conexao.para)]),
        conexoes: new Set([conexao.id]),
        familia: new Set(),
      };
    }
  }

  const selecionado = ui.selecionado;
  if (!selecionado || !visiveis.has(selecionado)) return null;
  const cards = new Set([selecionado]);
  const conexoes = new Set();
  for (const conexao of dados.conexoes) {
    const a = visivel(conexao.de);
    const b = visivel(conexao.para);
    if (a === b) continue; // dentro de um grupo recolhido
    if (a === selecionado || b === selecionado) {
      conexoes.add(conexao.id);
      cards.add(a);
      cards.add(b);
    }
  }

  const familia = new Set();
  const pai = buscarCard(selecionado)?.pai;
  if (pai && visiveis.has(pai)) {
    cards.add(pai);
    familia.add(selecionado);
  }
  for (const filho of filhos.get(selecionado) ?? []) {
    if (visiveis.has(filho)) {
      cards.add(filho);
      familia.add(filho);
    }
  }
  return { cards, conexoes, familia };
}
