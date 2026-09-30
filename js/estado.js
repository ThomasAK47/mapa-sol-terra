// =============================================================================
// estado.js — os dados em memória e o ÚNICO caminho para alterá-los.
//
// Toda alteração passa por alterar() (ou pelo trio iniciarGesto /
// alterarDuranteGesto / concluirGesto, usado ao arrastar). A cada alteração:
//   1. uma cópia do estado anterior vai para o histórico (desfazer);
//   2. quem desenha a tela é avisado (assinar);
//   3. o salvamento automático é agendado (definirAoAlterar).
//
// Importante: não guarde referências a cards ou conexões por muito tempo.
// Depois de um desfazer, os objetos são outros. Guarde o id e procure de novo.
// =============================================================================

import { geometriaZonas } from './modelo.js';

const LIMITE_HISTORICO = 100;          // ações guardadas para desfazer
const JANELA_AGRUPAMENTO_MS = 1500;    // digitação contínua vira uma só ação

let dados = null;
const pilhaDesfazer = [];              // itens: { dados, rotulo, marca }
const pilhaRefazer = [];
let ultimoGrupo = null;
let ultimoInstante = 0;
let gesto = null;                      // { copia, rotulo, mudou } durante um arrasto
const ouvintes = new Set();
let aoAlterar = () => {};

let geometriaEmCache = null;
let zonasDoCache = null;

/** Estado da interface: não é salvo e não entra no desfazer. */
export const ui = {
  modo: 'edicao',       // 'edicao' | 'leitura' | 'teste'
  selecionado: null,    // id do card selecionado (ou null)
  conexaoAberta: null,  // id da conexão aberta no editor (ou null)
};

/** Os dados atuais. Leia sempre por aqui (o objeto muda após desfazer). */
export function obterDados() {
  return dados;
}

/** true se o modo atual permite editar. */
export function podeEditar() {
  return ui.modo === 'edicao' || ui.modo === 'teste';
}

/** Procura um card pelo id. */
export function buscarCard(id, fonte = dados) {
  return fonte?.cards.find((card) => card.id === id) ?? null;
}

/** Geometria das zonas (recalculada só quando as zonas mudam). */
export function geometria() {
  if (!geometriaEmCache || zonasDoCache !== dados.zonas) {
    geometriaEmCache = geometriaZonas(dados.zonas);
    zonasDoCache = dados.zonas;
  }
  return geometriaEmCache;
}

/**
 * Registra uma função chamada a cada mudança. Ela recebe { tipo, rotulo },
 * onde tipo é 'tudo' (dados trocados), 'dados' (alteração comum),
 * 'gesto' (arrasto em andamento) ou 'selecao'.
 */
export function assinar(ouvinte) {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

function notificar(mudanca) {
  for (const ouvinte of ouvintes) {
    try {
      ouvinte(mudanca);
    } catch (erro) {
      console.error('Erro ao atualizar a tela:', erro);
    }
  }
}

/** Define quem é avisado quando algo precisa ser salvo (a persistência). */
export function definirAoAlterar(funcao) {
  aoAlterar = funcao;
}

/** Começa a trabalhar com um conjunto de dados (zera o histórico). */
export function iniciar(novosDados) {
  dados = novosDados;
  pilhaDesfazer.length = 0;
  pilhaRefazer.length = 0;
  ultimoGrupo = null;
  gesto = null;
  corrigirSelecao();
  notificar({ tipo: 'tudo' });
}

function empilhar(pilha, item) {
  pilha.push(item);
  if (pilha.length > LIMITE_HISTORICO) pilha.shift();
}

/**
 * Aplica uma alteração nos dados.
 *   rotulo  — nome da ação, mostrado ao desfazer ("Mover card").
 *   mutacao — função que recebe os dados e os modifica.
 *   agrupar — alterações seguidas com o mesmo valor aqui (ex.: digitar no
 *             mesmo campo) viram uma única ação no desfazer.
 *   agruparSemPrazo — junta mesmo depois de uma pausa longa (usado enquanto
 *             uma conexão recém-criada está sendo escrita).
 *   marca   — identificação opcional da ação (ver descartarUltimaSe).
 */
export function alterar(rotulo, mutacao, { agrupar = null, agruparSemPrazo = false, marca = null } = {}) {
  if (!podeEditar() || !dados) return false;
  if (gesto) concluirGesto();
  const agora = performance.now();
  const juntar = agrupar !== null && agrupar === ultimoGrupo &&
                 (agruparSemPrazo || agora - ultimoInstante < JANELA_AGRUPAMENTO_MS);
  const copia = juntar ? null : structuredClone(dados);
  try {
    mutacao(dados);
  } catch (erro) {
    if (copia) dados = copia; // desfaz a alteração pela metade
    notificar({ tipo: 'tudo' });
    throw erro;
  }
  if (copia) empilhar(pilhaDesfazer, { dados: copia, rotulo, marca });
  pilhaRefazer.length = 0;
  ultimoGrupo = agrupar;
  ultimoInstante = agora;
  corrigirSelecao();
  notificar({ tipo: 'dados', rotulo });
  aoAlterar();
  return true;
}

/** A próxima alteração não se junta à anterior no desfazer. */
export function encerrarAgrupamento() {
  ultimoGrupo = null;
}

// --- Gestos (arrastar): uma única ação no desfazer, salva só ao soltar ------

export function iniciarGesto(rotulo) {
  if (!podeEditar() || !dados) return false;
  if (gesto) concluirGesto();
  gesto = { copia: structuredClone(dados), rotulo, mudou: false };
  return true;
}

export function emGesto() {
  return gesto !== null;
}

export function alterarDuranteGesto(mutacao) {
  if (!gesto) return;
  mutacao(dados);
  gesto.mudou = true;
  notificar({ tipo: 'gesto' });
}

/** Termina o gesto. "finalizacao" (opcional) faz um último ajuste nos dados. */
export function concluirGesto(finalizacao = null) {
  if (!gesto) return;
  const g = gesto;
  gesto = null;
  if (!g.mudou) return;
  if (finalizacao) finalizacao(dados);
  empilhar(pilhaDesfazer, { dados: g.copia, rotulo: g.rotulo, marca: null });
  pilhaRefazer.length = 0;
  ultimoGrupo = null;
  notificar({ tipo: 'dados', rotulo: g.rotulo });
  aoAlterar();
}

/** Cancela o gesto e volta tudo como estava antes dele (tecla Esc). */
export function cancelarGesto() {
  if (!gesto) return;
  dados = gesto.copia;
  gesto = null;
  corrigirSelecao();
  notificar({ tipo: 'tudo' });
}

// --- Desfazer / refazer --------------------------------------------------------

export function podeDesfazer() {
  return podeEditar() && pilhaDesfazer.length > 0;
}

export function podeRefazer() {
  return podeEditar() && pilhaRefazer.length > 0;
}

/** Desfaz a última ação. Devolve o nome dela (ou null se não havia). */
export function desfazer() {
  if (!podeEditar() || gesto || pilhaDesfazer.length === 0) return null;
  const item = pilhaDesfazer.pop();
  empilhar(pilhaRefazer, { dados, rotulo: item.rotulo, marca: item.marca });
  dados = item.dados;
  ultimoGrupo = null;
  corrigirSelecao();
  notificar({ tipo: 'tudo', rotulo: item.rotulo });
  aoAlterar();
  return item.rotulo;
}

/** Refaz a última ação desfeita. Devolve o nome dela (ou null). */
export function refazer() {
  if (!podeEditar() || gesto || pilhaRefazer.length === 0) return null;
  const item = pilhaRefazer.pop();
  empilhar(pilhaDesfazer, { dados, rotulo: item.rotulo, marca: item.marca });
  dados = item.dados;
  ultimoGrupo = null;
  corrigirSelecao();
  notificar({ tipo: 'tudo', rotulo: item.rotulo });
  aoAlterar();
  return item.rotulo;
}

/** Troca todos os dados de uma vez (importar), podendo desfazer. */
export function substituirTudo(novosDados, rotulo) {
  if (!podeEditar()) return false;
  if (gesto) concluirGesto();
  empilhar(pilhaDesfazer, { dados, rotulo, marca: null });
  pilhaRefazer.length = 0;
  dados = novosDados;
  ultimoGrupo = null;
  corrigirSelecao();
  notificar({ tipo: 'tudo', rotulo });
  aoAlterar();
  return true;
}

/**
 * Se a última ação tiver esta marca, ela é apagada do histórico como se nunca
 * tivesse acontecido (usado para descartar um card criado e deixado vazio).
 */
export function descartarUltimaSe(marca) {
  const ultima = pilhaDesfazer[pilhaDesfazer.length - 1];
  if (!ultima || ultima.marca !== marca || gesto) return false;
  pilhaDesfazer.pop();
  dados = ultima.dados;
  ultimoGrupo = null;
  corrigirSelecao();
  notificar({ tipo: 'tudo' });
  aoAlterar();
  return true;
}

// --- Seleção ------------------------------------------------------------------

export function selecionar(id) {
  if (ui.selecionado === id) return;
  ui.selecionado = id;
  notificar({ tipo: 'selecao' });
}

/** Marca qual conexão está aberta no editor (entra no modo foco). */
export function definirConexaoAberta(id) {
  if (ui.conexaoAberta === id) return;
  ui.conexaoAberta = id;
  notificar({ tipo: 'selecao' });
}

/** Procura uma conexão pelo id. */
export function buscarConexao(id, fonte = dados) {
  return fonte?.conexoes.find((conexao) => conexao.id === id) ?? null;
}

function corrigirSelecao() {
  if (ui.selecionado && !buscarCard(ui.selecionado)) ui.selecionado = null;
  if (ui.conexaoAberta && !buscarConexao(ui.conexaoAberta)) ui.conexaoAberta = null;
}
