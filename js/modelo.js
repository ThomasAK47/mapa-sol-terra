// =============================================================================
// modelo.js — o formato dos dados do mapa.
//
// Aqui ficam:
//   • a VERSÃO atual do formato e as zonas padrão;
//   • a MIGRAÇÃO, que converte arquivos de versões antigas;
//   • a NORMALIZAÇÃO, que repara arquivos incompletos ou editados à mão;
//   • a GEOMETRIA das zonas (onde cada zona começa e termina no eixo x);
//   • a EDIÇÃO das zonas (largura, zona nova, união com a vizinha).
//
// Regra de posição: o x de um card é medido a partir do INÍCIO da zona dele,
// e (x, y) é o CENTRO do card. As zonas ficam lado a lado, na ordem do campo
// "ordem", começando em x = 0 do mundo. Por isso, alargar uma zona no JSON
// empurra as zonas seguintes (e seus cards) sem trocar ninguém de zona.
// =============================================================================

import { agoraISO, gerarId, limitar, plural, semAcentos } from './util.js';

/** Versão atual do formato. Ao mudar o formato: some 1 e crie a migração. */
export const VERSAO_ATUAL = 1;

export const LARGURA_ZONA_PADRAO = 1200;
export const LARGURA_ZONA_MINIMA = 300;

/**
 * Tamanhos (1 = normal). "escala" de um card vale para ele e seus
 * descendentes; "escalaDosCards", na raiz do arquivo, vale para todos.
 */
export const ESCALA_CARD_MIN = 0.5;
export const ESCALA_CARD_MAX = 3;
export const ESCALA_GERAL_MIN = 0.5;
export const ESCALA_GERAL_MAX = 2;

/** Um tamanho válido dentro dos limites, com duas casas (ex.: 1.25); senão, 1. */
export function normalizarEscala(valor, minimo, maximo) {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) return 1;
  return Math.round(limitar(valor, minimo, maximo) * 100) / 100;
}

/** Zonas iniciais (as mesmas do data/estudos.json de exemplo). */
export const ZONAS_PADRAO = Object.freeze([
  { id: 'sol', nome: 'Sol', detalhe: 'interior e superfície', ordem: 1, largura: 1200 },
  { id: 'atmosfera-solar', nome: 'Atmosfera solar e eventos', detalhe: 'coroa, flares, CMEs, buracos coronais', ordem: 2, largura: 1200 },
  { id: 'meio-interplanetario', nome: 'Meio interplanetário', detalhe: 'vento solar, campo magnético interplanetário', ordem: 3, largura: 1200 },
  { id: 'magnetosfera', nome: 'Magnetosfera', detalhe: '', ordem: 4, largura: 1200 },
  { id: 'ionosfera-termosfera', nome: 'Ionosfera e termosfera', detalhe: '', ordem: 5, largura: 1200 },
  { id: 'superficie-terrestre', nome: 'Superfície terrestre e efeitos', detalhe: '', ordem: 6, largura: 1200 },
]);

/** Dados de um mapa vazio (usado quando data/estudos.json não existe). */
export function dadosVazios() {
  return { versao: VERSAO_ATUAL, escalaDosCards: 1, zonas: structuredClone(ZONAS_PADRAO), cards: [], conexoes: [] };
}

/** Um card novo, com todos os campos na ordem padrão do arquivo. */
export function novoCard(id, agora = agoraISO()) {
  return {
    id, titulo: '', descricao: '', zona: '', x: 0, y: 0,
    pai: null, recolhido: false, escala: 1, tags: [],
    animacao: null, linkDocs: null,
    criadoEm: agora, atualizadoEm: agora,
  };
}

// -----------------------------------------------------------------------------
// Migração
// -----------------------------------------------------------------------------
// Cada entrada converte os dados da versão N para a N+1. Uma futura versão 2
// seria registrada assim:
//
//   1: (dados) => {
//     for (const card of dados.cards) card.novoCampo = null;
//     dados.versao = 2;
//   },
//
// Um arquivo antigo passa por todas as conversões em sequência, e nenhum dado
// se perde quando o formato muda.
const MIGRACOES = {};

/** Erro para arquivos gravados por uma versão mais nova do app. */
export class ErroVersaoFutura extends Error {
  constructor(versao) {
    super(`O arquivo usa o formato versão ${versao}, mais novo que o deste app (versão ${VERSAO_ATUAL}).`);
    this.name = 'ErroVersaoFutura';
    this.versao = versao;
  }
}

/** Converte dados de versões antigas para a versão atual (modifica e devolve). */
export function migrar(dados) {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    throw new Error('O conteúdo não é um objeto { ... } com os dados do mapa.');
  }
  if (!Number.isInteger(dados.versao) || dados.versao < 1) dados.versao = 1;
  if (dados.versao > VERSAO_ATUAL) throw new ErroVersaoFutura(dados.versao);
  while (dados.versao < VERSAO_ATUAL) {
    const passo = MIGRACOES[dados.versao];
    if (!passo) throw new Error(`Falta a migração da versão ${dados.versao} para a ${dados.versao + 1}.`);
    passo(dados);
  }
  return dados;
}

// -----------------------------------------------------------------------------
// Normalização (reparo)
// -----------------------------------------------------------------------------

const comoTexto = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const comoNumero = (v, padrao) => (typeof v === 'number' && Number.isFinite(v) ? v : padrao);
const comoData = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);
const comoTextoOuNulo = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

function normalizarTags(tags) {
  if (!Array.isArray(tags)) return [];
  const vistas = new Set();
  const resultado = [];
  for (const valor of tags) {
    const tag = comoTexto(valor).trim().replace(/\s+/g, ' ');
    const chave = semAcentos(tag);
    if (tag && !vistas.has(chave)) {
      vistas.add(chave);
      resultado.push(tag);
    }
  }
  return resultado;
}

/**
 * Confere e repara os dados (já migrados). Devolve { dados, avisos }, onde
 * "avisos" lista em português tudo o que precisou ser consertado.
 * Campos desconhecidos (acrescentados à mão) são preservados.
 */
export function normalizar(bruto) {
  const avisos = [];
  const agora = agoraISO();
  const { versao: _versao, escalaDosCards, zonas, cards, conexoes, ...extrasRaiz } = bruto ?? {};

  // --- zonas ---
  const zonasOk = [];
  const idsZonas = new Set();
  let zonasAjustadas = 0;
  (Array.isArray(zonas) ? zonas : []).forEach((zona, indice) => {
    if (!zona || typeof zona !== 'object') return;
    const { id, nome, detalhe, ordem, largura, ...extras } = zona;
    const base = comoTexto(id).trim() || `zona-${indice + 1}`;
    let idOk = base;
    for (let n = 2; idsZonas.has(idOk); n++) idOk = `${base}-${n}`;
    idsZonas.add(idOk);
    let larguraOk = comoNumero(largura, LARGURA_ZONA_PADRAO);
    if (larguraOk < LARGURA_ZONA_MINIMA) {
      larguraOk = LARGURA_ZONA_MINIMA;
      zonasAjustadas++;
    }
    zonasOk.push({
      id: idOk,
      nome: comoTexto(nome).trim() || idOk,
      detalhe: comoTexto(detalhe),
      ordem: comoNumero(ordem, indice + 1),
      largura: Math.round(larguraOk),
      ...extras,
    });
  });
  if (zonasOk.length === 0) {
    zonasOk.push(...structuredClone(ZONAS_PADRAO));
    avisos.push('O arquivo não tinha zonas; foram usadas as 6 zonas padrão.');
  }
  zonasOk.sort((a, b) => a.ordem - b.ordem);
  if (zonasAjustadas) {
    avisos.push(`${plural(zonasAjustadas, 'zona ficou', 'zonas ficaram')} com a largura mínima (${LARGURA_ZONA_MINIMA}).`);
  }

  // --- cards ---
  const indiceDaZona = new Map(zonasOk.map((zona, i) => [zona.id, i]));
  const idsCards = new Set();
  const cardsOk = [];
  const conta = { idNovo: 0, semZona: 0, paiInvalido: 0, ciclo: 0, foraDaZona: 0 };
  for (const card of Array.isArray(cards) ? cards : []) {
    if (!card || typeof card !== 'object') continue;
    const {
      id, titulo, descricao, zona, x, y, pai, recolhido, escala, tags,
      animacao, linkDocs, criadoEm, atualizadoEm, ...extras
    } = card;
    let idOk = comoTexto(id).trim();
    if (!idOk || idsCards.has(idOk)) {
      idOk = gerarId('c', idsCards);
      conta.idNovo++;
    }
    idsCards.add(idOk);
    let zonaOk = comoTexto(zona);
    if (!indiceDaZona.has(zonaOk)) {
      zonaOk = zonasOk[0].id;
      conta.semZona++;
    }
    const criado = comoData(criadoEm) ?? agora;
    cardsOk.push({
      id: idOk,
      titulo: comoTexto(titulo),
      descricao: comoTexto(descricao),
      zona: zonaOk,
      x: Math.round(comoNumero(x, 0)),
      y: Math.round(comoNumero(y, 0)),
      pai: comoTextoOuNulo(pai),
      recolhido: recolhido === true,
      escala: normalizarEscala(escala, ESCALA_CARD_MIN, ESCALA_CARD_MAX),
      tags: normalizarTags(tags),
      animacao: comoTextoOuNulo(animacao),
      linkDocs: comoTextoOuNulo(linkDocs),
      criadoEm: criado,
      atualizadoEm: comoData(atualizadoEm) ?? criado,
      ...extras,
    });
  }

  // Card pai precisa existir e não pode ser o próprio card.
  for (const card of cardsOk) {
    if (card.pai && (!idsCards.has(card.pai) || card.pai === card.id)) {
      card.pai = null;
      conta.paiInvalido++;
    }
  }
  // Ciclos (A é pai de B e B é pai de A): subindo pelos pais, se um card
  // reaparece, o ciclo é desfeito ali.
  const porId = new Map(cardsOk.map((card) => [card.id, card]));
  for (const card of cardsOk) {
    const visitados = new Set([card.id]);
    let atual = card;
    while (atual.pai) {
      if (visitados.has(atual.pai)) {
        atual.pai = null;
        conta.ciclo++;
        break;
      }
      visitados.add(atual.pai);
      atual = porId.get(atual.pai);
    }
  }
  // O card precisa caber na largura da sua zona (a primeira zona pode ter
  // cards à esquerda, sobre o Sol; a última, à direita, além da Terra).
  for (const card of cardsOk) {
    const i = indiceDaZona.get(card.zona);
    const minimo = i === 0 ? -Infinity : 0;
    const maximo = i === zonasOk.length - 1 ? Infinity : zonasOk[i].largura;
    const xOk = limitar(card.x, minimo, maximo);
    if (xOk !== card.x) {
      card.x = xOk;
      conta.foraDaZona++;
    }
  }

  // --- conexões ---
  const idsConexoes = new Set();
  const conexoesOk = [];
  let conexoesInvalidas = 0;
  let conexoesIdNovo = 0;
  for (const conexao of Array.isArray(conexoes) ? conexoes : []) {
    if (!conexao || typeof conexao !== 'object') continue;
    const { id, de, para, texto, direcional, criadoEm, atualizadoEm, ...extras } = conexao;
    if (!idsCards.has(de) || !idsCards.has(para) || de === para) {
      conexoesInvalidas++;
      continue;
    }
    let idOk = comoTexto(id).trim();
    if (!idOk || idsConexoes.has(idOk)) {
      idOk = gerarId('x', idsConexoes);
      conexoesIdNovo++;
    }
    idsConexoes.add(idOk);
    const criado = comoData(criadoEm) ?? agora;
    conexoesOk.push({
      id: idOk,
      de,
      para,
      texto: comoTexto(texto),
      direcional: direcional !== false,
      criadoEm: criado,
      atualizadoEm: comoData(atualizadoEm) ?? criado,
      ...extras,
    });
  }

  // --- avisos legíveis ---
  if (conta.idNovo) avisos.push(`${plural(conta.idNovo, 'card recebeu', 'cards receberam')} um id novo (estava vazio ou repetido).`);
  if (conta.semZona) avisos.push(`${plural(conta.semZona, 'card sem zona válida foi colocado', 'cards sem zona válida foram colocados')} na primeira zona.`);
  if (conta.paiInvalido) avisos.push(`${plural(conta.paiInvalido, 'card apontava', 'cards apontavam')} para um card pai inexistente e ${conta.paiInvalido === 1 ? 'ficou' : 'ficaram'} sem pai.`);
  if (conta.ciclo) avisos.push(`${plural(conta.ciclo, 'ciclo de parentesco foi desfeito', 'ciclos de parentesco foram desfeitos')} (um card não pode ser ancestral de si mesmo).`);
  if (conta.foraDaZona) avisos.push(`${plural(conta.foraDaZona, 'card foi reposicionado', 'cards foram reposicionados')} para caber na largura da zona.`);
  if (conexoesInvalidas) {
    avisos.push(conexoesInvalidas === 1
      ? '1 conexão inválida foi removida (ela ligava um card inexistente, ou um card a ele mesmo).'
      : `${conexoesInvalidas} conexões inválidas foram removidas (ligavam cards inexistentes, ou um card a ele mesmo).`);
  }
  if (conexoesIdNovo) avisos.push(`${plural(conexoesIdNovo, 'conexão recebeu', 'conexões receberam')} um id novo (estava vazio ou repetido).`);

  return {
    dados: {
      versao: VERSAO_ATUAL,
      escalaDosCards: normalizarEscala(escalaDosCards, ESCALA_GERAL_MIN, ESCALA_GERAL_MAX),
      zonas: zonasOk, cards: cardsOk, conexoes: conexoesOk, ...extrasRaiz,
    },
    avisos,
  };
}

// -----------------------------------------------------------------------------
// Geometria das zonas
// -----------------------------------------------------------------------------

/**
 * Calcula onde cada zona começa e termina no eixo x do mundo.
 * Devolve { lista, porId, inicio, fim }.
 */
export function geometriaZonas(zonas) {
  const lista = [];
  const porId = new Map();
  let inicio = 0;
  zonas.forEach((zona, indice) => {
    const g = {
      id: zona.id, nome: zona.nome, detalhe: zona.detalhe, indice,
      inicio, fim: inicio + zona.largura, largura: zona.largura,
    };
    lista.push(g);
    porId.set(zona.id, g);
    inicio = g.fim;
  });
  return { lista, porId, inicio: 0, fim: inicio };
}

/** A zona em que cai a posição X do mundo (antes da 1ª → 1ª; depois da última → última). */
export function zonaNoX(geo, X) {
  for (const zona of geo.lista) if (X < zona.fim) return zona;
  return geo.lista[geo.lista.length - 1];
}

// -----------------------------------------------------------------------------
// Edição das zonas (as operações mexem direto em "dados"; quem chama é
// js/acoes.js e js/zonas.js, sempre por dentro de estado.alterar ou de um gesto)
// -----------------------------------------------------------------------------

export const LARGURA_ZONA_MAXIMA = 20000;
const FOLGA_DO_CARD_NA_ZONA = 10; // o centro do card não fica colado no limite

function renumerarZonas(dados) {
  dados.zonas.forEach((zona, indice) => {
    zona.ordem = indice + 1;
  });
}

/**
 * A menor largura que a zona pode ter sem deixar nenhum card dela de fora.
 * (Na última zona os cards podem passar da largura, para além da Terra.)
 */
export function larguraMinimaDaZona(dados, idZona) {
  const indice = dados.zonas.findIndex((zona) => zona.id === idZona);
  let minima = LARGURA_ZONA_MINIMA;
  if (indice === dados.zonas.length - 1) return minima;
  for (const card of dados.cards) {
    if (card.zona === idZona) minima = Math.max(minima, Math.ceil(card.x) + FOLGA_DO_CARD_NA_ZONA);
  }
  return minima;
}

/** A largura pedida, ajustada aos limites da zona (número inteiro). */
export function larguraPermitidaDaZona(dados, idZona, largura) {
  const minima = larguraMinimaDaZona(dados, idZona);
  return Math.round(limitar(largura, minima, Math.max(LARGURA_ZONA_MAXIMA, minima)));
}

/**
 * Muda a largura de uma zona, dentro dos limites. As zonas seguintes (e os
 * cards delas) se deslocam junto, porque o x de cada card é medido a partir do
 * início da zona dele. Devolve a largura aplicada (ou null se a zona não existe).
 */
export function definirLarguraDaZona(dados, idZona, largura) {
  const zona = dados.zonas.find((z) => z.id === idZona);
  if (!zona) return null;
  zona.largura = larguraPermitidaDaZona(dados, idZona, largura);
  return zona.largura;
}

/**
 * Insere uma zona logo depois de "idAnterior". Se a anterior era a última, os
 * cards dela que estavam além da largura (à direita da Terra) passam para a
 * zona nova, sem sair do lugar. Devolve a zona criada (ou null).
 */
export function inserirZonaDepois(dados, idAnterior, { id, nome, detalhe = '', largura = LARGURA_ZONA_PADRAO }) {
  const indice = dados.zonas.findIndex((zona) => zona.id === idAnterior);
  if (indice < 0) return null;
  const anterior = dados.zonas[indice];
  const nova = { id, nome, detalhe, ordem: 0, largura };
  if (indice === dados.zonas.length - 1) {
    for (const card of dados.cards) {
      if (card.zona === anterior.id && card.x > anterior.largura) {
        card.zona = nova.id;
        card.x -= anterior.largura;
      }
    }
  }
  dados.zonas.splice(indice + 1, 0, nova);
  renumerarZonas(dados);
  return nova;
}

/**
 * Exclui uma zona unindo-a à vizinha: a da esquerda (ou a da direita, se ela
 * for a primeira). A vizinha fica com o espaço e com os cards, e nenhum card
 * sai do lugar. Devolve o id da vizinha (ou null se não deu: zona inexistente
 * ou a única do mapa).
 */
export function unirZonaComVizinha(dados, idZona) {
  const indice = dados.zonas.findIndex((zona) => zona.id === idZona);
  if (indice < 0 || dados.zonas.length < 2) return null;
  const zona = dados.zonas[indice];
  let vizinha;
  if (indice > 0) {
    vizinha = dados.zonas[indice - 1];
    for (const card of dados.cards) {
      if (card.zona === zona.id) {
        card.zona = vizinha.id;
        card.x += vizinha.largura;
      }
    }
  } else {
    vizinha = dados.zonas[1];
    for (const card of dados.cards) {
      if (card.zona === vizinha.id) card.x += zona.largura;
      else if (card.zona === zona.id) card.zona = vizinha.id;
    }
  }
  vizinha.largura += zona.largura;
  dados.zonas.splice(indice, 1);
  renumerarZonas(dados);
  return vizinha.id;
}

/** Posição do centro do card no mundo. */
export function posicaoAbsoluta(card, geo) {
  const zona = geo.porId.get(card.zona) ?? geo.lista[0];
  return { X: zona.inicio + card.x, Y: card.y };
}

/** Coloca o centro do card na posição (X, Y) do mundo, atualizando a zona. */
export function definirPosicaoAbsoluta(card, X, Y, geo) {
  const zona = zonaNoX(geo, X);
  card.zona = zona.id;
  card.x = X - zona.inicio;
  card.y = Y;
}
