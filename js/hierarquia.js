// =============================================================================
// hierarquia.js — cards pai e filho.
//
//   • Nível: 0 para quem não tem pai, 1 para os filhos, 2 para os netos…
//     Cards de nível mais alto são desenhados maiores (escalaDoNivel).
//   • Recolher: um pai recolhido esconde todos os descendentes e mostra um
//     contador ("+4"). O "representante" de um card escondido é o ancestral
//     recolhido visível que o esconde; as conexões dele passam a sair do
//     representante (tracejadas, em js/conexoes.js).
//   • Na vitrine (somente leitura), recolher/expandir vale só para quem está
//     olhando: nada é salvo. A busca também pode expandir pais
//     temporariamente para mostrar um resultado.
//
// Tudo é recalculado a partir dos dados, e o resultado fica em cache até a
// próxima mudança (versaoDosDados).
// =============================================================================

import { obterDados, podeEditar, versaoDosDados } from './estado.js';

/** Tamanho relativo de cada nível: 100%, 85%, 72% e 62% (nível 3 em diante). */
const ESCALAS_DOS_NIVEIS = [1, 0.85, 0.72, 0.62];

export function escalaDoNivel(nivel) {
  return ESCALAS_DOS_NIVEIS[Math.min(Math.max(nivel, 0), ESCALAS_DOS_NIVEIS.length - 1)];
}

// Recolhimentos da vitrine e expansões da busca: ficam só na memória.
const recolhimentoLocal = new Map();      // id → true/false (somente leitura)
const expansoesTemporarias = new Set();   // ids expandidos pela busca
let versaoLocal = 0;

let cache = null;
let chaveDoCache = null;

/** O card está recolhido, considerando vitrine e busca? */
export function estaRecolhido(card) {
  if (!card) return false;
  if (expansoesTemporarias.has(card.id)) return false;
  if (!podeEditar() && recolhimentoLocal.has(card.id)) return recolhimentoLocal.get(card.id);
  return card.recolhido === true;
}

/**
 * A estrutura da hierarquia (em cache):
 *   filhos             id → [ids dos filhos]
 *   nivel              id → 0, 1, 2…
 *   representante      id → id do card visível que o representa (ele mesmo, se visível)
 *   visiveis           Set com os ids visíveis
 *   totalDescendentes  id → quantos descendentes (filhos, netos…) ele tem
 */
export function hierarquia() {
  const chave = `${versaoDosDados()}:${versaoLocal}:${podeEditar()}`;
  if (cache && chaveDoCache === chave) return cache;
  cache = calcular(obterDados());
  chaveDoCache = chave;
  return cache;
}

function calcular(dados) {
  const porId = new Map(dados.cards.map((card) => [card.id, card]));
  const filhos = new Map();
  for (const card of dados.cards) {
    if (card.pai && porId.has(card.pai) && card.pai !== card.id) {
      if (!filhos.has(card.pai)) filhos.set(card.pai, []);
      filhos.get(card.pai).push(card.id);
    }
  }

  const nivel = new Map();
  const representante = new Map();
  const visitados = new Set();
  // Percorre a árvore a partir das raízes (cards sem pai válido). "rep" é o
  // ancestral recolhido visível que esconde o card (null se ele está visível).
  const pilha = dados.cards
    .filter((card) => !card.pai || !porId.has(card.pai))
    .map((card) => ({ id: card.id, n: 0, rep: null }));
  while (pilha.length) {
    const { id, n, rep } = pilha.pop();
    if (visitados.has(id)) continue;
    visitados.add(id);
    nivel.set(id, n);
    representante.set(id, rep ?? id);
    const repDosFilhos = rep ?? (estaRecolhido(porId.get(id)) && filhos.has(id) ? id : null);
    for (const filho of filhos.get(id) ?? []) pilha.push({ id: filho, n: n + 1, rep: repDosFilhos });
  }
  // Segurança: um ciclo de parentesco (que a normalização e o painel impedem)
  // deixaria cards sem visita. Eles são tratados como raízes.
  for (const card of dados.cards) {
    if (!visitados.has(card.id)) {
      nivel.set(card.id, 0);
      representante.set(card.id, card.id);
    }
  }

  const visiveis = new Set();
  for (const [id, rep] of representante) if (rep === id) visiveis.add(id);

  const totalDescendentes = new Map();
  for (const card of dados.cards) {
    let pai = card.pai;
    for (let passos = 0; pai && porId.has(pai) && passos < 1000; passos++) {
      totalDescendentes.set(pai, (totalDescendentes.get(pai) ?? 0) + 1);
      pai = porId.get(pai).pai;
    }
  }

  return { porId, filhos, nivel, representante, visiveis, totalDescendentes };
}

/** Todos os descendentes (filhos, netos…) de um card. */
export function descendentes(id) {
  const { filhos } = hierarquia();
  const resultado = [];
  const fila = [...(filhos.get(id) ?? [])];
  const vistos = new Set([id]);
  while (fila.length) {
    const atual = fila.shift();
    if (vistos.has(atual)) continue;
    vistos.add(atual);
    resultado.push(atual);
    fila.push(...(filhos.get(atual) ?? []));
  }
  return resultado;
}

/** Pode "candidato" ser pai de "id"? (Nem ele mesmo, nem um descendente dele.) */
export function podeSerPai(id, candidato) {
  if (!candidato) return true;
  if (candidato === id) return false;
  return !descendentes(id).includes(candidato);
}

/** Ancestrais recolhidos que escondem o card (do mais próximo ao mais distante). */
export function ancestraisRecolhidos(id) {
  const { porId } = hierarquia();
  const resultado = [];
  let pai = porId.get(id)?.pai;
  for (let passos = 0; pai && porId.has(pai) && passos < 1000; passos++) {
    if (estaRecolhido(porId.get(pai))) resultado.push(pai);
    pai = porId.get(pai).pai;
  }
  return resultado;
}

// --- Mudanças que não vão para o arquivo ----------------------------------------

/** Vitrine: recolhe/expande só para quem está olhando. */
export function definirRecolhimentoLocal(id, recolhido) {
  recolhimentoLocal.set(id, recolhido);
  versaoLocal++;
}

/** Busca: expande estes cards até a busca ser limpa. */
export function expandirTemporariamente(ids) {
  let mudou = false;
  for (const id of ids) {
    if (!expansoesTemporarias.has(id)) {
      expansoesTemporarias.add(id);
      mudou = true;
    }
  }
  if (mudou) versaoLocal++;
  return mudou;
}

/** Desfaz as expansões temporárias da busca. Devolve true se havia alguma. */
export function limparExpansoesTemporarias() {
  if (expansoesTemporarias.size === 0) return false;
  expansoesTemporarias.clear();
  versaoLocal++;
  return true;
}

/** Remove a expansão temporária de um card (quando a pessoa o recolhe de propósito). */
export function esquecerExpansaoTemporaria(id) {
  if (expansoesTemporarias.delete(id)) versaoLocal++;
}
