// =============================================================================
// editor-textos.js — "Editar textos": trocar os textos de uma animação sem
// mexer no código dela (botão do cabeçalho da janela da animação).
//
// Cada animação guarda, num bloco
//     <script type="application/json" id="textos-editados">
// só os textos trocados; o texto original continua no código. São três tipos:
//   painel  — textos fixos do painel, marcados com data-texto="nome";
//   gerados — textos do painel montados pelo script, escritos como H_`…`;
//   desenho — textos do desenho (canvas), escritos como T_`…`.
// Dentro de H_`…` e T_`…`, cada ${…} vira um marcador {0}, {1}…: é onde entram os
// números que a animação calcula. As fórmulas e as contas não aparecem aqui.
//
// O editor lê o arquivo da animação, monta a lista de textos e mostra uma
// prévia: a janela recarrega a animação com as trocas no endereço (depois do
// #), no mesmo passo em que ela estava. "Salvar" manda as trocas ao servidor
// (POST api/textos-da-animacao), que grava só o bloco, depois de guardar uma
// cópia do arquivo em data/backups/animacoes/. Só existe no modo de edição.
// Detalhes em animacoes/CONTRATO.md ("Textos editáveis").
// =============================================================================

import { enderecoDaAnimacao } from './animacoes.js';
import { alertar, confirmar, escolher, toast } from './avisos.js';
import { el, icone } from './util.js';

const ESPERA_DA_PREVIA = 900;       // ms sem digitar antes de atualizar a prévia
const INTERVALO_DO_NA_TELA = 1000;  // ms entre as perguntas "o que está na tela?"
const PARTES = ['painel', 'gerados', 'desenho'];

let painel = null;          // o <aside> do editor, dentro da janela da animação
let lista = null;
let campoBusca = null;
let caixaNaTela = null;
let textoDoEstado = null;
let botaoSalvar = null;
let botaoDescartar = null;
let ganchos = null;         // funções da janela (veja iniciarEditorTextos)

let sessao = null;          // { arquivo, salvos, itens } enquanto há textos carregados
let geracao = 0;            // descarta leituras atrasadas
let salvando = false;
let pergunta = null;        // a pergunta "descartar as mudanças?" que está aberta
let temporizadorDaPrevia = null;
let temporizadorDoNaTela = null;
let previaNaTela = '';      // as trocas que a animação na tela está mostrando (em ordem)
let naTela = null;          // textos do desenho que a animação disse estarem na tela

// --- Ligação com a janela da animação ------------------------------------------------

/**
 * Cria o painel do editor. "ganchos" são funções da janela da animação:
 *   recarregar({ manterLugar })  recarrega a animação (a prévia usa textosDaPrevia());
 *   perguntar(mensagem)          envia uma mensagem à animação aberta;
 *   ondeEsta()                   { perto, passo } que a animação contou por último, ou null;
 *   aoMudarAberto(aberto)        o editor abriu ou fechou (o botão do cabeçalho acende).
 */
export function iniciarEditorTextos(funcoes) {
  ganchos = funcoes;
  campoBusca = el('input', {
    type: 'search', class: 'entrada editor-textos-busca', placeholder: 'Procurar um texto…',
    'aria-label': 'Procurar um texto', oninput: aplicarFiltro,
  });
  caixaNaTela = el('input', { type: 'checkbox', onchange: alternarNaTela });
  lista = el('div', { class: 'editor-textos-lista' });
  textoDoEstado = el('span', { class: 'editor-textos-estado', role: 'status' });
  botaoDescartar = el('button', {
    class: 'botao botao-pequeno', type: 'button', title: 'Voltar aos textos salvos no arquivo', onclick: descartar,
  }, 'Descartar');
  botaoSalvar = el('button', {
    class: 'botao botao-pequeno botao-principal', type: 'button', title: 'Gravar os textos no arquivo da animação (Ctrl+S)',
    onclick: () => salvarTextos(),
  }, 'Salvar');
  painel = el('aside', { class: 'editor-textos', hidden: true, 'aria-label': 'Textos da animação' },
    el('div', { class: 'editor-textos-topo' },
      el('strong', {}, 'Textos da animação'),
      el('button', {
        class: 'botao botao-pequeno icone', type: 'button', title: 'Fechar o editor de textos', 'aria-label': 'Fechar o editor de textos',
        onclick: () => fecharEditorTextos(),
      }, icone('fechar')),
    ),
    el('div', { class: 'editor-textos-ferramentas' },
      campoBusca,
      el('label', { class: 'editor-textos-na-tela', title: 'Mostra só os textos do desenho que estão na tela e o painel do passo aberto' },
        caixaNaTela, 'Só o que está na tela'),
    ),
    el('p', { class: 'editor-textos-ajuda' },
      'As fórmulas e as contas ficam de fora. Os marcadores ', el('code', {}, '{0}'), ', ', el('code', {}, '{1}'),
      '… são onde entram os números: mantenha-os. A animação mostra a prévia do que você escrever.'),
    lista,
    el('div', { class: 'editor-textos-rodape' }, textoDoEstado, botaoDescartar, botaoSalvar),
  );
  return painel;
}

/** true enquanto o painel do editor está aberto. */
export function editorTextosAberto() {
  return Boolean(painel && !painel.hidden);
}

/** Abre o editor com os textos da animação "arquivo" (ou relê, se já estiver aberto). */
export function abrirEditorTextos(arquivo) {
  painel.hidden = false;
  ganchos.aoMudarAberto(true);
  if (sessao?.arquivo !== arquivo) carregarTextos(arquivo);
}

/**
 * Fecha o editor. Com mudanças não salvas, pergunta antes (a não ser com
 * "semPerguntar"). Resolve com true se fechou.
 */
export async function fecharEditorTextos({ semPerguntar = false } = {}) {
  if (!painel || painel.hidden) return true;
  if (!semPerguntar && !(await perguntarSeDescarta())) return false;
  const mostravaPrevia = previaNaTela !== '' && sessao && previaNaTela !== emOrdem(sessao.salvos);
  painel.hidden = true;
  sessao = null;
  geracao++;
  pararNaTela();
  caixaNaTela.checked = false;
  naTela = null;
  campoBusca.value = '';
  clearTimeout(temporizadorDaPrevia);
  ganchos.aoMudarAberto(false);
  // A animação mostrava uma prévia que não foi salva: volta aos textos do arquivo.
  if (mostravaPrevia && !semPerguntar) ganchos.recarregar({ manterLugar: true });
  return true;
}

/** true se há textos mudados e ainda não salvos. */
export function temMudancasNaoSalvas() {
  return Boolean(sessao) && emOrdem(trocasAtuais()) !== emOrdem(sessao.salvos);
}

/**
 * Pergunta se as mudanças não salvas podem ser descartadas (true se não há
 * nenhuma). Duas perguntas ao mesmo tempo viram uma só.
 */
export function perguntarSeDescarta() {
  if (!temMudancasNaoSalvas()) return Promise.resolve(true);
  if (!pergunta) {
    pergunta = confirmar({
      titulo: 'Descartar os textos não salvos?',
      mensagem: 'Há textos mudados nesta animação que ainda não foram gravados no arquivo.',
      botaoOk: 'Descartar', botaoCancelar: 'Continuar editando', perigo: true,
    }).finally(() => { pergunta = null; });
  }
  return pergunta;
}

/**
 * As trocas para a prévia (vão no endereço da animação), ou null se a
 * animação deve mostrar só o que está salvo no arquivo.
 */
export function textosDaPrevia() {
  if (!sessao || !temMudancasNaoSalvas()) {
    previaNaTela = sessao ? emOrdem(sessao.salvos) : '';
    return null;
  }
  const trocas = trocasAtuais();
  previaNaTela = emOrdem(trocas);
  return trocas;
}

/** A animação respondeu quais textos do desenho estão na tela. */
export function aoReceberTextosNaTela(chaves) {
  if (!caixaNaTela?.checked) return;
  naTela = new Set(chaves);
  aplicarFiltro();
}

/** A animação contou onde está (mudou de passo ou de visão). */
export function aoMudarLugar() {
  if (caixaNaTela?.checked) aplicarFiltro();
}

// --- Leitura dos textos de uma animação ------------------------------------------------

async function carregarTextos(arquivo) {
  const minhaVez = ++geracao;
  sessao = null;
  lista.replaceChildren(el('p', { class: 'editor-textos-vazio' }, 'Lendo os textos da animação…'));
  atualizarRodape();
  let fonte = null;
  try {
    const resposta = await fetch(enderecoDaAnimacao(arquivo), { cache: 'no-store' });
    if (resposta.ok) fonte = await resposta.text();
  } catch {
    /* sem resposta: avisado abaixo */
  }
  if (minhaVez !== geracao) return;
  if (fonte === null) {
    lista.replaceChildren(el('p', { class: 'editor-textos-vazio' },
      `Não consegui ler o arquivo animacoes/${arquivo}. Confira se a janela do servidor está aberta.`));
    return;
  }
  const lido = lerTextosDaAnimacao(fonte);
  if (!lido) {
    lista.replaceChildren(el('p', { class: 'editor-textos-vazio' },
      'Esta animação ainda não tem textos editáveis. Peça ao Claude para prepará-la ' +
      '(veja "Textos editáveis" em animacoes/CONTRATO.md).'));
    return;
  }
  sessao = { arquivo, ...lido };
  previaNaTela = emOrdem(sessao.salvos);
  desenharLista();
}

/**
 * Lê o HTML de uma animação: as trocas já salvas e a lista de textos
 * editáveis. Devolve null se a animação não tem o bloco de textos editados.
 */
export function lerTextosDaAnimacao(fonte) {
  const doc = new DOMParser().parseFromString(fonte, 'text/html');   // documento inerte: nada roda
  const bloco = doc.getElementById('textos-editados');
  if (!bloco) return null;
  let salvos;
  try {
    salvos = normalizarTrocas(JSON.parse(bloco.textContent));
  } catch {
    salvos = normalizarTrocas({});
  }

  const itens = [];
  const vistos = new Set();
  const acrescentar = (item) => {
    const id = `${item.parte}:${item.chave}`;
    if (vistos.has(id)) return;
    vistos.add(id);
    itens.push(item);
  };

  // 1. Os textos fixos do painel.
  for (const elemento of doc.querySelectorAll('[data-texto]')) {
    const chave = elemento.dataset.texto;
    const passo = elemento.closest('[data-passo]');
    let grupo;
    if (passo) {
      const numero = Number(passo.dataset.passo) + 1;
      const tituloDoPasso = passo.querySelector('.passo-titulo [data-texto]') ?? passo.querySelector('.passo-titulo');
      const nome = (tituloDoPasso?.textContent ?? '').replace(/^\s*\d+\s*/, '').replace(/\s+/g, ' ').trim();
      grupo = { id: `passo-${numero}`, titulo: `Passo ${numero}${nome ? ` · ${nome}` : ''}`, ordem: 10 + numero, passo: numero - 1 };
    } else if (chave.startsWith('controle-')) {
      grupo = { id: 'controles', titulo: 'Controles embaixo do desenho', ordem: 80 };
    } else {
      grupo = { id: 'longe', titulo: 'Cabeçalho, visão de longe e dica', ordem: 1 };
    }
    acrescentar({ parte: 'painel', chave, original: limparEnfeites(elemento.innerHTML), grupo, rotulo: rotuloDoPainel(chave) });
  }

  // 2. Os textos do script: H_`…` (painel) e T_`…` (desenho), na ordem do código.
  const script = [...doc.querySelectorAll('script:not([type])')].pop()?.textContent ?? '';
  const secoes = [];
  for (const { marca, chave, secao } of acharTextosNoScript(script)) {
    if (marca === 'H_') {
      acrescentar({ parte: 'gerados', chave, original: limparEnfeites(chave), grupo: { id: 'gerados', titulo: 'Painel: textos que mudam com os números', ordem: 90 } });
    } else {
      if (!secoes.includes(secao)) secoes.push(secao);
      const titulo = secao ? `Desenho · ${secao}` : 'Desenho';
      acrescentar({ parte: 'desenho', chave, original: chave, grupo: { id: `desenho:${secao}`, titulo, ordem: 100 + secoes.indexOf(secao) } });
    }
  }

  // O valor de cada texto: o salvo no arquivo, se houver; senão, o original.
  for (const item of itens) {
    const salvo = salvos[item.parte][item.chave];
    item.valor = typeof salvo === 'string' ? (item.parte === 'desenho' ? salvo : limparEnfeites(salvo)) : item.original;
    item.valido = true;
  }

  // Trocas salvas de textos que a animação não usa mais (o código mudou).
  for (const parte of PARTES) {
    for (const [chave, valor] of Object.entries(salvos[parte])) {
      if (vistos.has(`${parte}:${chave}`)) continue;
      itens.push({
        parte, chave, original: parte === 'painel' ? `(texto “${chave}” do painel)` : chave, valor, valido: true, orfao: true,
        grupo: { id: 'orfaos', titulo: 'Guardados, mas a animação não usa mais', ordem: 1000 },
      });
    }
  }
  return { salvos, itens };
}

/** { painel, gerados, desenho } só com textos (o que vier diferente disso é ignorado). */
function normalizarTrocas(bruto) {
  const trocas = { versao: 1, painel: {}, gerados: {}, desenho: {} };
  for (const parte of PARTES) {
    const origem = bruto && typeof bruto === 'object' ? bruto[parte] : null;
    if (!origem || typeof origem !== 'object') continue;
    for (const [chave, valor] of Object.entries(origem)) {
      if (typeof valor === 'string') trocas[parte][chave] = valor;
    }
  }
  return trocas;
}

/** As trocas em ordem fixa, para comparar dois conjuntos. */
function emOrdem(trocas) {
  return JSON.stringify(PARTES.map((parte) => Object.entries(trocas[parte] ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))));
}

/** As trocas que valem agora: cada texto diferente do original (os com aviso ficam com o último valor bom). */
function trocasAtuais() {
  const trocas = { versao: 1, painel: {}, gerados: {}, desenho: {} };
  for (const item of sessao.itens) {
    if (item.orfao) {
      if (!item.tirado) trocas[item.parte][item.chave] = item.valor;
    } else if (item.valor !== item.original) {
      trocas[item.parte][item.chave] = item.valor;
    }
  }
  return trocas;
}

function rotuloDoPainel(chave) {
  const regras = [
    [/^titulo-complemento/, () => 'Título (depois do nome da animação)'],
    [/^resumo-titulo/, () => 'Título do resumo'],
    [/^resumo-texto/, () => 'Texto do resumo'],
    [/^leitura-/, () => 'Nome de uma leitura'],
    [/^passo-\d+-titulo/, () => 'Título do passo'],
    [/^passo-\d+-explicacao/, () => 'Explicação'],
    [/^passo-\d+-item-(\d+)/, (m) => `Item ${m[1]} da lista`],
    [/^passo-\d+-legenda/, () => 'Legenda da fórmula'],
    [/^dica/, () => 'Dica'],
    [/^botao-ver-de-perto/, () => 'Botão “Ver de perto”'],
    [/^controle-/, () => 'Nome de um controle'],
  ];
  for (const [regra, rotulo] of regras) {
    const m = regra.exec(chave);
    if (m) return rotulo(m);
  }
  return 'Texto do painel';
}

// --- Leitor do script: acha os textos T_`…` e H_`…` -----------------------------------

const PALAVRAS_ANTES_DE_REGEX = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete',
  'void', 'throw', 'instanceof', 'yield', 'await']);

/**
 * Percorre o código da animação e devolve [{ marca: 'T_' | 'H_', chave, secao }],
 * na ordem em que aparecem. Pula comentários, textos entre aspas e expressões
 * regulares; entra nos ${…} dos templates (um H_`…` pode estar dentro de outro
 * texto). A chave é o texto como a animação o vê, com {0}, {1}… no lugar de
 * cada ${…}. A seção é o último título de seção ("// 8. …") antes do texto.
 */
export function acharTextosNoScript(codigo) {
  const achados = [];
  let i = 0;
  let secao = '';

  // Lê código até o "}" que fecha um ${…} (dentroDeTemplate) ou até o fim.
  function lerCodigo(dentroDeTemplate) {
    let profundidade = 0;
    let anterior = '';      // o último pedaço: 'nome:xxx', 'valor' ou um sinal
    while (i < codigo.length) {
      const c = codigo[i];
      const proximo = codigo[i + 1];
      if (c === '/' && proximo === '/') {
        let fim = codigo.indexOf('\n', i);
        if (fim < 0) fim = codigo.length;
        const titulo = /^\/\/\s*(\d+)\.\s+(.+)$/.exec(codigo.slice(i, fim).trim());
        if (titulo && !dentroDeTemplate) secao = `${titulo[1]}. ${titulo[2].split(/\.\s/)[0].replace(/\.$/, '')}`;
        i = fim;
        continue;
      }
      if (c === '/' && proximo === '*') {
        const fim = codigo.indexOf('*/', i + 2);
        i = fim < 0 ? codigo.length : fim + 2;
        continue;
      }
      if (c === '"' || c === "'") {
        i = fimDaString(codigo, i);
        anterior = 'valor';
        continue;
      }
      if (c === '`') {
        const marca = anterior === 'nome:T_' || anterior === 'nome:H_' ? anterior.slice(5) : null;
        const partes = lerTemplate();
        if (marca) achados.push({ marca, chave: partes.reduce((chave, parte, k) => chave + (k ? `{${k - 1}}` : '') + parte, ''), secao });
        anterior = 'valor';
        continue;
      }
      if (c === '/') {
        const regex = anterior === '' || (anterior.startsWith('nome:')
          ? PALAVRAS_ANTES_DE_REGEX.has(anterior.slice(5))
          : !['valor', ')', ']', '}'].includes(anterior));
        if (regex) {
          i = fimDaRegex(codigo, i);
          anterior = 'valor';
        } else {
          i++;
          anterior = '/';
        }
        continue;
      }
      if (/[A-Za-z_$À-￿]/.test(c)) {
        let fim = i + 1;
        while (fim < codigo.length && /[\w$À-￿]/.test(codigo[fim])) fim++;
        anterior = `nome:${codigo.slice(i, fim)}`;
        i = fim;
        continue;
      }
      if (/\d/.test(c)) {
        let fim = i + 1;
        while (fim < codigo.length && /[\w.]/.test(codigo[fim])) fim++;
        anterior = 'valor';
        i = fim;
        continue;
      }
      if (/\s/.test(c)) {
        i++;
        continue;
      }
      if (c === '{') profundidade++;
      if (c === '}') {
        if (profundidade === 0 && dentroDeTemplate) {
          i++;
          return;
        }
        profundidade--;
      }
      // "?." e "=>" contam como um sinal só; o resto, caractere por caractere.
      anterior = c;
      i++;
    }
  }

  // Lê um template (com o i no acento grave de abertura). Devolve as partes de
  // texto, já com as sequências de escape resolvidas, como a animação as recebe.
  function lerTemplate() {
    i++;
    const partes = [''];
    while (i < codigo.length) {
      const c = codigo[i];
      if (c === '\\') {
        partes[partes.length - 1] += codigo.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (c === '`') {
        i++;
        return partes.map(resolverEscapes);
      }
      if (c === '$' && codigo[i + 1] === '{') {
        i += 2;
        lerCodigo(true);
        partes.push('');
        continue;
      }
      partes[partes.length - 1] += c;
      i++;
    }
    return partes.map(resolverEscapes);
  }

  lerCodigo(false);
  return achados;
}

function fimDaString(codigo, i) {
  const aspas = codigo[i];
  let j = i + 1;
  while (j < codigo.length && codigo[j] !== aspas && codigo[j] !== '\n') j += codigo[j] === '\\' ? 2 : 1;
  return j + 1;
}

function fimDaRegex(codigo, i) {
  let j = i + 1;
  let naClasse = false;
  while (j < codigo.length && codigo[j] !== '\n') {
    const c = codigo[j];
    if (c === '\\') { j += 2; continue; }
    if (c === '[') naClasse = true;
    else if (c === ']') naClasse = false;
    else if (c === '/' && !naClasse) break;
    j++;
  }
  j++;
  while (j < codigo.length && /[a-z]/i.test(codigo[j])) j++;   // as letras depois da barra (g, i, u…)
  return j;
}

/** Resolve as sequências de escape de um pedaço de template (\n, \`, ²…). */
function resolverEscapes(texto) {
  return texto.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|\r\n|[\s\S])/g, (todo, s) => {
    if (s[0] === 'u') return String.fromCodePoint(parseInt(s[1] === '{' ? s.slice(2, -1) : s.slice(1), 16));
    if (s[0] === 'x') return String.fromCharCode(parseInt(s.slice(1), 16));
    if (s === 'n') return '\n';
    if (s === 't') return '\t';
    if (s === 'r') return '\r';
    if (s === '\n' || s === '\r\n') return '';
    return s;
  });
}

// --- Enfeites permitidos ----------------------------------------------------------------

const ENFEITES = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', SUP: 'sup', SUB: 'sub', SMALL: 'small', BR: 'br', SPAN: 'span' };
const CLASSE_PERMITIDA = /^[a-z][a-z0-9-]*( [a-z][a-z0-9-]*)*$/;
const BLOCOS = new Set(['DIV', 'P', 'LI']);     // viram quebra de linha (o Enter de alguns navegadores cria <div>)

/** Copia de "origem" para "destino" só os enfeites permitidos (o resto vira texto). */
function copiarPermitidos(origem, destino, doc) {
  for (const no of origem.childNodes) {
    if (no.nodeType === Node.TEXT_NODE) {
      destino.append(doc.createTextNode(no.nodeValue));
      continue;
    }
    if (no.nodeType !== Node.ELEMENT_NODE || no.tagName === 'SCRIPT' || no.tagName === 'STYLE') continue;
    if (BLOCOS.has(no.tagName)) {
      if (destino.childNodes.length) destino.append(doc.createElement('br'));
      copiarPermitidos(no, destino, doc);
      continue;
    }
    const nome = ENFEITES[no.tagName];
    if (!nome) {
      copiarPermitidos(no, destino, doc);
      continue;
    }
    const novo = doc.createElement(nome);
    const classe = no.getAttribute('class');
    if (classe && CLASSE_PERMITIDA.test(classe)) novo.className = classe;     // longo, curto, cores…
    copiarPermitidos(no, novo, doc);
    destino.append(novo);
  }
}

/** Junta espaços repetidos e tira os das pontas e a quebra de linha que sobra no fim. */
function arrumarEspacos(caixa) {
  const andar = (no) => {
    for (const filho of [...no.childNodes]) {
      if (filho.nodeType === Node.TEXT_NODE) filho.nodeValue = filho.nodeValue.replace(/[ \t\r\n]+/g, ' ');
      else andar(filho);
    }
  };
  andar(caixa);
  while (caixa.lastChild?.nodeName === 'BR') caixa.lastChild.remove();
  const primeiro = caixa.firstChild;
  if (primeiro?.nodeType === Node.TEXT_NODE) primeiro.nodeValue = primeiro.nodeValue.replace(/^ +/, '');
  const ultimo = caixa.lastChild;
  if (ultimo?.nodeType === Node.TEXT_NODE) ultimo.nodeValue = ultimo.nodeValue.replace(/ +$/, '');
}

/** O texto com só os enfeites permitidos, como HTML (sem nenhum outro atributo). */
export function limparEnfeites(html) {
  const inerte = document.implementation.createHTMLDocument('');
  const origem = new DOMParser().parseFromString(`<!doctype html><body>${html}`, 'text/html').body;
  const caixa = inerte.createElement('div');
  copiarPermitidos(origem, caixa, inerte);
  arrumarEspacos(caixa);
  return caixa.innerHTML;     // leitura (não escreve nada na página)
}

/** Põe um texto com enfeites dentro de um campo do editor (sem usar innerHTML). */
function preencherCampoRico(campo, html) {
  const origem = new DOMParser().parseFromString(`<!doctype html><body>${html}`, 'text/html').body;
  const fragmento = document.createDocumentFragment();
  copiarPermitidos(origem, fragmento, document);
  campo.replaceChildren(fragmento);
}

/** Os marcadores {0}, {1}… de um texto. */
function marcadores(texto) {
  return new Set(texto.match(/\{\d+\}/g) ?? []);
}

// --- A lista na tela ---------------------------------------------------------------------

function desenharLista() {
  const grupos = new Map();
  for (const item of sessao.itens) {
    if (!grupos.has(item.grupo.id)) grupos.set(item.grupo.id, { ...item.grupo, itens: [] });
    grupos.get(item.grupo.id).itens.push(item);
  }
  const lugar = ganchos.ondeEsta();
  const grupoDoLugar = lugar?.perto ? `passo-${lugar.passo + 1}` : 'longe';
  const elementos = [...grupos.values()].sort((a, b) => a.ordem - b.ordem).map((grupo) => {
    grupo.contagem = el('span', { class: 'grupo-textos-contagem' });
    grupo.elemento = el('details', { class: 'grupo-textos', open: grupo.id === grupoDoLugar },
      el('summary', {}, el('span', { class: 'grupo-textos-titulo' }, grupo.titulo), grupo.contagem),
      grupo.itens.map(criarItem));
    // Num grupo fechado, os campos do desenho não têm altura: ela é medida ao abrir.
    grupo.elemento.addEventListener('toggle', () => {
      if (grupo.elemento.open) for (const item of grupo.itens) if (item.parte === 'desenho' && !item.orfao) ajustarAltura(item.campo);
    });
    return grupo;
  });
  sessao.grupos = elementos;
  lista.replaceChildren(...elementos.map((grupo) => grupo.elemento));
  if (sessao.itens.length === 0) lista.append(el('p', { class: 'editor-textos-vazio' }, 'Esta animação não tem textos editáveis.'));
  for (const item of sessao.itens) marcarItem(item);
  aplicarFiltro();
  atualizarRodape();
}

function criarItem(item) {
  if (item.orfao) {
    item.elemento = el('div', { class: 'texto-editavel orfao', 'data-parte': item.parte, 'data-chave': item.chave },
      el('div', { class: 'texto-editavel-cabeca' },
        el('span', { class: 'texto-editavel-nome' }, item.parte === 'desenho' ? 'Desenho' : 'Painel'),
        el('button', {
          class: 'botao-mini', type: 'button', title: 'Tirar esta troca do arquivo (ao salvar)',
          onclick: () => { item.tirado = true; item.elemento.hidden = true; aoMudarAlgo(); },
        }, 'Tirar'),
      ),
      el('p', { class: 'texto-editavel-orfao-original' }, 'Original: ', item.original),
      el('p', { class: 'texto-editavel-orfao-valor' }, 'Trocado por: ', item.valor));
    return item.elemento;
  }

  const rico = item.parte !== 'desenho';
  if (rico) {
    item.campo = el('div', {
      class: 'texto-campo rico', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true',
      spellcheck: 'true', lang: 'pt-BR', 'aria-label': item.rotulo ?? 'Texto do painel',
    });
    preencherCampoRico(item.campo, item.valor);
    item.campo.addEventListener('input', () => aoEditar(item));
    item.campo.addEventListener('keydown', (evento) => {
      if (evento.key !== 'Enter') return;
      evento.preventDefault();
      document.execCommand('insertLineBreak');      // Enter = quebra de linha (nada de <div>)
    });
    // Colar e soltar: só o texto, sem a formatação de onde ele veio.
    item.campo.addEventListener('paste', (evento) => {
      evento.preventDefault();
      const texto = evento.clipboardData?.getData('text/plain') ?? '';
      document.execCommand('insertText', false, texto.replace(/\s*\r?\n\s*/g, ' '));
    });
    item.campo.addEventListener('drop', (evento) => evento.preventDefault());
  } else {
    item.campo = el('textarea', {
      class: 'texto-campo', rows: '1', spellcheck: 'true', lang: 'pt-BR', 'aria-label': 'Texto do desenho', value: item.valor,
    });
    item.campo.addEventListener('input', () => {
      if (/[\r\n]/.test(item.campo.value)) item.campo.value = item.campo.value.replace(/\s*[\r\n]+\s*/g, ' ');
      ajustarAltura(item.campo);
      aoEditar(item);
    });
    item.campo.addEventListener('keydown', (evento) => {
      if (evento.key === 'Enter') evento.preventDefault();     // o texto do desenho tem uma linha só
    });
  }

  item.botaoOriginal = el('button', {
    class: 'botao-mini', type: 'button', title: 'Voltar ao texto original', onclick: () => voltarAoOriginal(item),
  }, 'Original');
  item.aviso = el('p', { class: 'texto-editavel-aviso', hidden: true });
  item.textoOriginal = el('p', { class: 'texto-editavel-original', hidden: true });
  item.elemento = el('div', { class: 'texto-editavel', 'data-parte': item.parte, 'data-chave': item.chave },
    el('div', { class: 'texto-editavel-cabeca' },
      el('span', { class: 'texto-editavel-nome' }, item.rotulo ?? (rico ? 'Painel' : 'Desenho')),
      rico && el('span', { class: 'texto-ferramentas' },
        botaoDeEnfeite('bold', 'B', 'Negrito'),
        botaoDeEnfeite('italic', 'I', 'Itálico'),
        botaoDeEnfeite('superscript', 'x²', 'Sobrescrito (expoente)'),
        botaoDeEnfeite('subscript', 'x₂', 'Subscrito (índice)')),
      item.botaoOriginal,
    ),
    item.campo,
    item.aviso,
    item.textoOriginal,
  );
  if (!rico) requestAnimationFrame(() => ajustarAltura(item.campo));
  return item.elemento;
}

function botaoDeEnfeite(comando, rotulo, nome) {
  return el('button', {
    class: `botao-mini enfeite enfeite-${comando}`, type: 'button', title: nome, 'aria-label': nome,
    // mousedown sem efeito: o campo continua com o foco e a seleção.
    onmousedown: (evento) => evento.preventDefault(),
    onclick: (evento) => {
      const campo = evento.currentTarget.closest('.texto-editavel')?.querySelector('.texto-campo');
      if (!campo || !campo.contains(document.getSelection()?.anchorNode)) campo?.focus();
      document.execCommand(comando);
    },
  }, rotulo);
}

function ajustarAltura(campo) {
  if (!campo.isConnected || campo.offsetParent === null) return;
  campo.style.height = 'auto';
  campo.style.height = `${campo.scrollHeight + 2}px`;
}

function lerCampo(item) {
  return item.parte === 'desenho' ? item.campo.value : limparEnfeites(item.campo.innerHTML);
}

/** O que há de errado com um texto novo (ou null): os marcadores precisam continuar lá. */
function problemaDoTexto(item, valor) {
  if (item.parte === 'painel' || valor.trim() === '') return null;   // vazio = tirar o texto
  const pedidos = marcadores(item.chave);
  const usados = marcadores(valor);
  const faltam = [...pedidos].filter((marca) => !usados.has(marca));
  const sobram = [...usados].filter((marca) => !pedidos.has(marca));
  if (faltam.length) {
    return `Falta ${faltam.join(', ')}: é onde entra um número que a animação calcula. ` +
           'Escreva de novo, com as chaves (ou use “Original”).';
  }
  if (sobram.length) return `${sobram.join(', ')} não existe neste texto: os marcadores deste são ${[...pedidos].join(', ') || 'nenhum'}.`;
  return null;
}

function aoEditar(item) {
  const valor = lerCampo(item);
  const problema = problemaDoTexto(item, valor);
  item.valido = !problema;
  if (!problema) item.valor = valor;
  item.aviso.textContent = problema ?? '';
  item.aviso.hidden = !problema;
  marcarItem(item);
  aoMudarAlgo();
}

function voltarAoOriginal(item) {
  item.valor = item.original;
  item.valido = true;
  if (item.parte === 'desenho') {
    item.campo.value = item.original;
    ajustarAltura(item.campo);
  } else {
    preencherCampoRico(item.campo, item.original);
  }
  item.aviso.hidden = true;
  marcarItem(item);
  aoMudarAlgo();
}

/** Mostra se o texto está trocado (e qual era o original) e se ainda não foi salvo. */
function marcarItem(item) {
  if (item.orfao || !item.elemento) return;
  const trocado = item.valor !== item.original;
  const salvo = sessao.salvos[item.parte][item.chave];
  const valorSalvo = typeof salvo === 'string' ? (item.parte === 'desenho' ? salvo : limparEnfeites(salvo)) : item.original;
  item.elemento.classList.toggle('trocado', trocado);
  item.elemento.classList.toggle('nao-salvo', item.valor !== valorSalvo || !item.valido);
  item.elemento.classList.toggle('com-aviso', !item.valido);
  item.botaoOriginal.hidden = !trocado && item.valido;
  item.textoOriginal.hidden = !trocado;
  if (trocado) {
    if (item.parte === 'desenho') item.textoOriginal.replaceChildren('Original: ', item.original);
    else {
      const original = el('span', {});
      preencherCampoRico(original, item.original);
      item.textoOriginal.replaceChildren('Original: ', original);
    }
  }
}

function aoMudarAlgo() {
  atualizarRodape();
  clearTimeout(temporizadorDaPrevia);
  temporizadorDaPrevia = setTimeout(atualizarPrevia, ESPERA_DA_PREVIA);
}

/** Recarrega a animação com os textos de agora (se mudaram desde a última prévia). */
function atualizarPrevia() {
  if (!sessao) return;
  const agora = temMudancasNaoSalvas() ? emOrdem(trocasAtuais()) : emOrdem(sessao.salvos);
  if (agora === previaNaTela) return;
  ganchos.recarregar({ manterLugar: true });
}

function atualizarRodape() {
  if (!botaoSalvar) return;
  const mudou = temMudancasNaoSalvas();
  const comAviso = Boolean(sessao?.itens.some((item) => !item.valido));
  botaoSalvar.disabled = !sessao || !mudou || salvando;
  botaoDescartar.disabled = !sessao || !mudou || salvando;
  if (!sessao) textoDoEstado.textContent = '';
  else if (salvando) textoDoEstado.textContent = 'Salvando…';
  else if (comAviso) textoDoEstado.textContent = 'Há um texto com aviso';
  else if (mudou) textoDoEstado.textContent = 'Mudanças não salvas';
  else {
    const n = PARTES.reduce((soma, parte) => soma + Object.keys(sessao.salvos[parte]).length, 0);
    textoDoEstado.textContent = n ? `Salvo · ${n} ${n === 1 ? 'texto trocado' : 'textos trocados'}` : 'Nenhum texto trocado';
  }
  textoDoEstado.dataset.estado = comAviso ? 'aviso' : mudou ? 'mudou' : 'salvo';
  for (const grupo of sessao?.grupos ?? []) {
    const trocados = grupo.itens.filter((item) => !item.orfao && item.valor !== item.original).length;
    grupo.contagem.textContent = trocados ? `${trocados} de ${grupo.itens.length}` : String(grupo.itens.length);
    grupo.elemento.classList.toggle('tem-trocas', trocados > 0);
  }
}

// --- Procurar e "só o que está na tela" ---------------------------------------------------

const semAcentos = (texto) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function aplicarFiltro() {
  if (!sessao?.grupos) return;
  const procura = semAcentos(campoBusca.value.trim());
  const soNaTela = caixaNaTela.checked;
  const lugar = ganchos.ondeEsta();
  const grupoDoLugar = lugar?.perto ? `passo-${lugar.passo + 1}` : 'longe';
  for (const grupo of sessao.grupos) {
    let visiveis = 0;
    for (const item of grupo.itens) {
      if (item.tirado) continue;
      let mostrar = true;
      if (procura) {
        const texto = semAcentos(`${textoSimples(item.original)} ${textoSimples(item.valor)} ${item.rotulo ?? ''}`);
        mostrar = texto.includes(procura);
      }
      if (mostrar && soNaTela) {
        if (item.parte === 'desenho') mostrar = Boolean(naTela?.has(item.chave));
        else if (item.parte === 'painel') mostrar = grupo.id === grupoDoLugar || grupo.id === 'controles';
        else mostrar = false;
      }
      item.elemento.hidden = !mostrar;
      if (mostrar) visiveis++;
    }
    grupo.elemento.hidden = visiveis === 0;
    if ((procura || soNaTela) && visiveis) grupo.elemento.open = true;
  }
  // Os campos que acabaram de aparecer ganham a altura certa.
  for (const item of sessao.itens) if (item.parte === 'desenho' && !item.orfao) ajustarAltura(item.campo);
}

function textoSimples(html) {
  return html.replace(/<[^>]*>/g, '');
}

function alternarNaTela() {
  pararNaTela();
  if (caixaNaTela.checked) {
    naTela = new Set();
    const perguntarAgora = () => ganchos.perguntar({ tipo: 'quais-textos-na-tela' });
    perguntarAgora();
    temporizadorDoNaTela = setInterval(perguntarAgora, INTERVALO_DO_NA_TELA);
  } else {
    naTela = null;
  }
  aplicarFiltro();
}

function pararNaTela() {
  clearInterval(temporizadorDoNaTela);
  temporizadorDoNaTela = null;
}

// --- Salvar e descartar --------------------------------------------------------------------

async function enviar(textos, forcar) {
  return fetch('api/textos-da-animacao', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ arquivo: sessao.arquivo, antes: sessao.salvos, textos, forcar }),
  });
}

/** Grava as trocas no arquivo da animação (botão "Salvar" e Ctrl+S). */
export async function salvarTextos() {
  if (!sessao || salvando) return;
  if (sessao.itens.some((item) => !item.valido)) {
    toast('Há um texto com aviso (falta um marcador como {0}). Corrija ou use “Original” antes de salvar.');
    return;
  }
  if (!temMudancasNaoSalvas()) {
    toast('Nenhum texto mudou desde a última gravação.');
    return;
  }
  const minhaSessao = sessao;
  const textos = trocasAtuais();
  salvando = true;
  atualizarRodape();
  try {
    let resposta = await enviar(textos, false);
    if (resposta.status === 409) {
      const escolha = await escolher({
        titulo: 'Os textos mudaram fora desta janela',
        mensagem: 'Os textos salvos nesta animação foram mudados depois que o editor abriu (em outra janela, ou à mão).',
        opcoes: [
          { id: 'forcar', rotulo: 'Gravar os meus por cima', detalhe: 'o arquivo de antes fica nos backups', estilo: 'perigo' },
          { id: 'recarregar', rotulo: 'Ler os textos do arquivo', detalhe: 'as suas mudanças não salvas se perdem' },
          { id: 'cancelar', rotulo: 'Cancelar' },
        ],
        vertical: true,
      });
      if (escolha === 'recarregar' && sessao === minhaSessao) {
        const arquivo = sessao.arquivo;
        sessao = null;
        carregarTextos(arquivo);
        ganchos.recarregar({ manterLugar: true });
        return;
      }
      if (escolha !== 'forcar') return;
      resposta = await enviar(textos, true);
    }
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok || !dados.ok) {
      const mensagem = resposta.status === 404 && dados.erro === 'rota-inexistente'
        ? 'A janela do servidor aberta é de uma versão anterior do app. Feche a janela do servidor e abra de novo ' +
          '(iniciar.bat no Windows ou iniciar.command no Mac).'
        : dados.mensagem ?? `O servidor respondeu com o código ${resposta.status}.`;
      await alertar({ titulo: 'Os textos não foram salvos', mensagem });
      return;
    }
    if (sessao !== minhaSessao) return;
    sessao.salvos = normalizarTrocas(dados.textos);
    // As trocas tiradas da lista de "não usa mais" saíram do arquivo.
    sessao.itens = sessao.itens.filter((item) => !(item.orfao && item.tirado));
    for (const item of sessao.itens) marcarItem(item);
    toast(`Textos salvos em animacoes/${sessao.arquivo}.`);
  } catch {
    await alertar({
      titulo: 'Os textos não foram salvos',
      mensagem: 'O servidor não respondeu. Confira se a janela do servidor (iniciar) continua aberta e tente de novo.',
    });
  } finally {
    salvando = false;
    atualizarRodape();
  }
}

async function descartar() {
  if (!sessao || !temMudancasNaoSalvas()) return;
  const ok = await confirmar({
    titulo: 'Descartar as mudanças?',
    mensagem: 'Os textos voltam ao que está salvo no arquivo da animação.',
    botaoOk: 'Descartar', perigo: true,
  });
  if (!ok || !sessao) return;
  for (const item of sessao.itens) {
    if (item.orfao) {
      item.tirado = false;
      continue;
    }
    const salvo = sessao.salvos[item.parte][item.chave];
    item.valor = typeof salvo === 'string' ? (item.parte === 'desenho' ? salvo : limparEnfeites(salvo)) : item.original;
    item.valido = true;
  }
  desenharLista();
  atualizarPrevia();
}
