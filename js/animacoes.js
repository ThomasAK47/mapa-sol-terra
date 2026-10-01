// =============================================================================
// animacoes.js — a lista de animações (animacoes/manifesto.json).
//
// Cada animação é um arquivo HTML autossuficiente na pasta animacoes/. O
// manifesto lista as disponíveis (arquivo, título e descrição curta); o
// painel do card oferece essa lista, e o card guarda só o nome do arquivo.
//
// O manifesto é lido ao abrir o mapa e de novo sempre que a janela do
// navegador volta ao foco: depois de acrescentar uma animação (em outro
// programa), basta voltar ao mapa para ela aparecer na lista.
//
// Regras para criar uma animação e registrá-la: animacoes/CONTRATO.md.
// A janela onde a animação roda fica em js/janela-animacao.js.
// =============================================================================

import { localizarErroJson } from './util.js';

const PASTA = 'animacoes/';
const ARQUIVO_MANIFESTO = `${PASTA}manifesto.json`;

/**
 * Regra do nome do arquivo: letras minúsculas sem acento, números, "-" e "_",
 * terminando em ".html", sem começar com "_" (reservado ao _modelo.html).
 * Um nome assim funciona igual no Windows e no GitHub Pages (que diferencia
 * maiúsculas) e nunca aponta para fora da pasta animacoes/.
 */
const PADRAO_ARQUIVO = /^[a-z0-9][a-z0-9_-]*\.html$/;

let manifesto = null;         // { lista, porArquivo, avisos, erro } ou null (ainda não lido)
let assinatura = null;        // para saber se o manifesto mudou entre duas leituras
let leituraEmAndamento = null;
const ouvintes = [];

/** true se o nome segue a regra (e pode virar um endereço com segurança). */
export function arquivoDeAnimacaoValido(nome) {
  return typeof nome === 'string' && nome.length <= 100 && PADRAO_ARQUIVO.test(nome);
}

/** Endereço relativo do arquivo (só para nomes válidos). */
export function enderecoDaAnimacao(arquivo) {
  return PASTA + arquivo;
}

/**
 * Confere o conteúdo do manifesto, já convertido de JSON. Aceita
 * { "animacoes": [ … ] } ou só a lista [ … ]. Itens com problema ficam de
 * fora, cada um com um aviso em português.
 * Devolve { lista: [{ arquivo, titulo, descricao }], avisos: [texto] }.
 */
export function validarManifesto(bruto) {
  const itens = Array.isArray(bruto) ? bruto : bruto?.animacoes;
  if (!Array.isArray(itens)) {
    return { lista: [], avisos: ['O manifesto precisa ter a lista "animacoes": [ … ].'] };
  }
  const lista = [];
  const avisos = [];
  const vistos = new Set();
  itens.forEach((item, indice) => {
    const n = indice + 1;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      avisos.push(`Item ${n} do manifesto: não está no formato { "arquivo": …, "titulo": …, "descricao": … }.`);
      return;
    }
    const arquivo = typeof item.arquivo === 'string' ? item.arquivo.trim() : '';
    if (!arquivo) {
      avisos.push(`Item ${n} do manifesto: falta o campo "arquivo".`);
      return;
    }
    if (!arquivoDeAnimacaoValido(arquivo)) {
      avisos.push(`Item ${n} do manifesto (“${arquivo}”): o nome do arquivo deve ter só letras minúsculas ` +
                  'sem acento, números, - ou _ (sem começar com _) e terminar em .html.');
      return;
    }
    if (vistos.has(arquivo)) {
      avisos.push(`Item ${n} do manifesto: “${arquivo}” aparece mais de uma vez (vale a primeira).`);
      return;
    }
    vistos.add(arquivo);
    const titulo = typeof item.titulo === 'string' && item.titulo.trim() ? item.titulo.trim() : arquivo;
    const descricao = typeof item.descricao === 'string' ? item.descricao.trim() : '';
    lista.push({ arquivo, titulo, descricao });
  });
  return { lista, avisos };
}

/** Começa a ler o manifesto e o relê sempre que a janela volta ao foco. */
export function iniciarAnimacoes() {
  window.addEventListener('focus', () => carregarManifesto());
  return carregarManifesto();
}

/** O manifesto lido por último (ou null, se ainda não chegou). */
export function manifestoAtual() {
  return manifesto;
}

/** Título e descrição de uma animação, se ela estiver no manifesto. */
export function infoDaAnimacao(arquivo) {
  return manifesto?.porArquivo.get(arquivo) ?? null;
}

/** Registra uma função chamada sempre que o manifesto muda. */
export function aoMudarManifesto(funcao) {
  ouvintes.push(funcao);
}

/** Lê (de novo) o manifesto. Se nada mudou, ninguém é avisado. */
export function carregarManifesto() {
  if (!leituraEmAndamento) {
    leituraEmAndamento = lerManifesto().then((novo) => {
      leituraEmAndamento = null;
      if (!novo) return manifesto; // sem conexão: fica o que já se sabia
      const nova = JSON.stringify(novo);
      if (nova !== assinatura) {
        assinatura = nova;
        manifesto = { ...novo, porArquivo: new Map(novo.lista.map((item) => [item.arquivo, item])) };
        for (const funcao of ouvintes) funcao(manifesto);
      }
      return manifesto;
    });
  }
  return leituraEmAndamento;
}

/**
 * Busca e confere o arquivo. Devolve { lista, avisos, erro } ou null quando
 * não houve resposta (ex.: servidor fechado), para não apagar a lista que
 * já estava na tela.
 */
async function lerManifesto() {
  const semLista = (erro) => ({ lista: [], avisos: [], erro });
  let resposta;
  let texto;
  try {
    // "no-cache": no GitHub Pages, confere se há versão nova antes de usar a guardada.
    resposta = await fetch(ARQUIVO_MANIFESTO, { cache: 'no-cache' });
    texto = await resposta.text();
  } catch {
    return manifesto ? null : semLista('Não consegui ler animacoes/manifesto.json (sem conexão).');
  }
  if (resposta.status === 404) return semLista('O arquivo animacoes/manifesto.json não foi encontrado.');
  if (!resposta.ok) return semLista(`Não consegui ler animacoes/manifesto.json (erro ${resposta.status}).`);
  let bruto;
  try {
    bruto = JSON.parse(texto);
  } catch (erro) {
    const { linha, coluna } = localizarErroJson(texto, erro);
    const onde = linha ? ` perto da linha ${linha}, coluna ${coluna}` : '';
    return semLista(`O arquivo animacoes/manifesto.json tem um erro de formatação${onde}. ` +
                    'Veja o exemplo em animacoes/CONTRATO.md.');
  }
  return { ...validarManifesto(bruto), erro: null };
}
