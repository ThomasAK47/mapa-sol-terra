// =============================================================================
// janela-animacao.js — a janela grande onde uma animação roda.
//
// A animação (um arquivo da pasta animacoes/) roda dentro de um
// <iframe sandbox="allow-scripts">: o código dela funciona, mas ela não
// enxerga o app (dados, armazenamento do navegador, servidor). O iframe é
// criado ao abrir a janela e removido ao fechar, então nada da animação fica
// rodando escondido.
//
// Um card pode ter várias animações (uma série, por exemplo). Nesse caso o
// cabeçalho mostra botões numerados (1, 2, 3…) para trocar de uma para outra;
// cada troca descarrega a animação anterior e carrega a nova.
//
// Fechar: botão ×, Esc, clique fora da janela, ou um pedido da própria
// animação (é assim que o Esc funciona quando o foco está dentro dela):
//     parent.postMessage({ tipo: 'fechar-animacao' }, '*')
// No modo de edição, o botão "Editar textos" abre ao lado o editor dos textos
// da animação (js/editor-textos.js). Para ele, a animação também conta onde
// está ({ tipo: 'animacao-esta-em', perto, passo }) e quais textos do desenho
// estão na tela ({ tipo: 'textos-na-tela', chaves }). Nenhuma outra mensagem
// vinda da animação é aceita. Detalhes em animacoes/CONTRATO.md.
// =============================================================================

import {
  aoMudarManifesto, arquivoDeAnimacaoValido, enderecoDaAnimacao, infoDaAnimacao,
} from './animacoes.js';
import {
  abrirEditorTextos, aoMudarLugar, aoReceberTextosNaTela, editorTextosAberto, fecharEditorTextos,
  iniciarEditorTextos, perguntarSeDescarta, salvarTextos, temMudancasNaoSalvas, textosDaPrevia,
} from './editor-textos.js';
import { buscarCard, ui } from './estado.js';
import { el, icone } from './util.js';

let janela = null;          // o <dialog>
let titulo = null;
let subtitulo = null;
let partes = null;          // os botões 1, 2, 3… (só com mais de uma animação)
let area = null;
let mensagem = null;
let iframe = null;
let botaoEditar = null;     // "Editar textos" (só no modo de edição)
let aberta = null;          // { lista, indice, cardId, focoAnterior } enquanto a janela está aberta
let geracao = 0;            // muda a cada abertura/fechamento (descarta respostas atrasadas)
let ondeEsta = null;        // { perto, passo, parte }: o que a animação contou por último (a prévia volta para lá)

export function iniciarJanelaAnimacao(elemento) {
  janela = elemento;
  titulo = el('strong', { id: 'janela-animacao-titulo', class: 'janela-animacao-titulo' });
  subtitulo = el('span', { class: 'janela-animacao-subtitulo' });
  partes = el('div', { class: 'janela-animacao-partes', role: 'group', 'aria-label': 'Animações deste card', hidden: true });
  mensagem = el('div', { class: 'janela-animacao-mensagem', hidden: true });
  area = el('div', { class: 'janela-animacao-area' }, mensagem);
  botaoEditar = el('button', {
    class: 'botao janela-animacao-editar', type: 'button', title: 'Editar os textos desta animação',
    'aria-pressed': 'false', hidden: true, onclick: alternarEditor,
  }, icone('editar'), el('span', { class: 'rotulo' }, 'Editar textos'));
  const editor = iniciarEditorTextos({
    recarregar: ({ manterLugar = false } = {}) => carregar({ manterLugar }),
    perguntar: (dados) => iframe?.contentWindow?.postMessage(dados, '*'),
    ondeEsta: () => ondeEsta,
    aoMudarAberto: (aberto) => botaoEditar.setAttribute('aria-pressed', String(aberto)),
  });
  janela.replaceChildren(
    el('div', { class: 'janela-animacao-cabecalho' },
      icone('animacao', 'ico janela-animacao-ico'),
      el('div', { class: 'janela-animacao-textos' }, titulo, subtitulo),
      partes,
      botaoEditar,
      el('button', {
        class: 'botao icone', type: 'button', title: 'Recomeçar a animação',
        'aria-label': 'Recomeçar a animação', onclick: () => carregar(),
      }, icone('recarregar')),
      el('button', {
        class: 'botao icone', type: 'button', title: 'Fechar (Esc)', 'aria-label': 'Fechar a animação',
        onclick: () => fecharAnimacao(),
      }, icone('fechar')),
    ),
    el('div', { class: 'janela-animacao-corpo' }, area, editor),
  );

  // Esc com o foco na janela (fora da animação). Com o editor de textos
  // aberto, Ctrl+S grava os textos (e não os dados do mapa).
  janela.addEventListener('keydown', (evento) => {
    if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 's' && editorTextosAberto()) {
      evento.preventDefault();
      evento.stopPropagation();
      salvarTextos();
      return;
    }
    if (evento.key !== 'Escape') return;
    evento.preventDefault();
    evento.stopPropagation(); // o Esc fecha só a animação, não o painel do card
    fecharAnimacao();
  });
  janela.addEventListener('cancel', (evento) => {
    evento.preventDefault();
    fecharAnimacao();
  });

  // Clique no fundo escurecido fecha. Só conta se o clique também COMEÇOU
  // fora: arrastar um controle da animação e soltar fora não fecha nada.
  let comecouFora = false;
  janela.addEventListener('pointerdown', (evento) => {
    comecouFora = foraDaJanela(evento);
  });
  janela.addEventListener('click', (evento) => {
    if (comecouFora && foraDaJanela(evento)) fecharAnimacao();
    comecouFora = false;
  });

  window.addEventListener('message', aoReceberMensagem);
  aoMudarManifesto(() => {
    if (aberta) atualizarCabecalho();
  });
}

/** true enquanto a janela de animação está aberta. */
export function animacaoAberta() {
  return aberta !== null;
}

/**
 * Abre as animações de um card, começando pela da posição "indice"
 * (0 = a primeira). Com mais de uma, a janela mostra os botões 1, 2, 3…
 */
export function abrirAnimacaoDoCard(cardId, indice = 0) {
  const card = buscarCard(cardId);
  if (!card || card.animacoes.length === 0) return;
  abrirLista([...card.animacoes], Math.min(Math.max(indice, 0), card.animacoes.length - 1), cardId);
}

/** Abre a janela com a animação "arquivo" (nome de um arquivo em animacoes/). */
export function abrirAnimacao(arquivo, { cardId = null } = {}) {
  abrirLista([arquivo], 0, cardId);
}

function abrirLista(lista, indice, cardId) {
  if (!janela) return;
  const focoAnterior = aberta?.focoAnterior ?? document.activeElement;
  aberta = { lista, indice, cardId, focoAnterior };
  atualizarCabecalho();
  if (!janela.open) janela.showModal();
  // O foco fica na própria janela (não no primeiro botão): assim o Esc
  // funciona logo, e um Enter distraído não aperta nada.
  janela.focus();
  carregar();
}

/** Troca para outra animação do mesmo card (botões 1, 2, 3… do cabeçalho). */
async function mostrarParte(indice) {
  if (!aberta || indice === aberta.indice || indice < 0 || indice >= aberta.lista.length) return;
  if (!(await perguntarSeDescarta()) || !aberta) return;     // textos editados e não salvos
  aberta.indice = indice;
  atualizarCabecalho();
  // Os botões foram refeitos: o foco volta para o que acabou de ser clicado
  // (assim o teclado continua dentro da janela).
  partes.children[indice]?.focus({ preventScroll: true });
  if (editorTextosAberto()) {
    await fecharEditorTextos({ semPerguntar: true });
    carregar();
    abrirEditorTextos(arquivoAtual());
  } else {
    carregar();
  }
}

/** Botão "Editar textos": abre ou fecha o editor ao lado da animação. */
function alternarEditor() {
  if (!aberta) return;
  if (editorTextosAberto()) fecharEditorTextos();
  else abrirEditorTextos(arquivoAtual());
}

/** Nome do arquivo da animação que está na tela. */
function arquivoAtual() {
  return aberta.lista[aberta.indice];
}

/**
 * Fecha a janela e descarrega a animação. Com textos editados e não salvos,
 * pergunta antes (a não ser com "forcar").
 */
export function fecharAnimacao({ forcar = false } = {}) {
  if (!aberta) return;
  if (!forcar && temMudancasNaoSalvas()) {
    perguntarSeDescarta().then((descartar) => {
      if (descartar) fecharAnimacao({ forcar: true });
    });
    return;
  }
  const { focoAnterior } = aberta;
  aberta = null;
  geracao++;
  fecharEditorTextos({ semPerguntar: true });
  removerIframe();
  mensagem.hidden = true;
  if (janela.open) janela.close();
  if (focoAnterior?.isConnected && focoAnterior !== document.body) focoAnterior.focus({ preventScroll: true });
}

// --- Por dentro ------------------------------------------------------------------

/**
 * (Re)carrega a animação aberta. Também é o botão "Recomeçar". Com o editor de
 * textos aberto, a animação recebe a prévia dos textos no endereço (depois do
 * #); com "manterLugar", volta à visão e ao passo em que estava.
 */
async function carregar({ manterLugar = false } = {}) {
  if (!aberta) return;
  const minhaVez = ++geracao;
  const arquivo = arquivoAtual();
  removerIframe();
  const lugar = manterLugar ? ondeEsta : null;
  if (!manterLugar) ondeEsta = null;

  if (!arquivoDeAnimacaoValido(arquivo)) {
    mostrarMensagem(`O nome da animação deste card (“${arquivo}”) não é válido. ` +
                    'Escolha a animação de novo no painel do card.');
    return;
  }

  const endereco = enderecoDaAnimacao(arquivo);
  mostrarMensagem('Carregando a animação…', { carregando: true });
  // Confere antes se o arquivo existe: dentro do iframe, a falta dele
  // apareceria como uma página de erro sem explicação.
  let existe = true;
  try {
    const resposta = await fetch(endereco, { method: 'HEAD', cache: 'no-store' });
    existe = resposta.status !== 404;
  } catch {
    /* sem resposta: tenta carregar assim mesmo */
  }
  if (minhaVez !== geracao) return; // a janela fechou ou recomeçou nesse meio-tempo
  if (!existe) {
    mostrarMensagem(`O arquivo animacoes/${arquivo} não foi encontrado. Confira se ele está na pasta ` +
                    'animacoes/ com exatamente esse nome (letras minúsculas, sem acento).');
    return;
  }

  // A prévia dos textos e o lugar vão depois do #: a animação lê dali (veja CONTRATO.md).
  const extras = new URLSearchParams();
  const previa = editorTextosAberto() ? textosDaPrevia() : null;
  if (previa) extras.set('textos', JSON.stringify(previa));
  if (lugar?.perto) {
    extras.set('perto', '1');
    extras.set('passo', String(lugar.passo));
    if (lugar.parte > 0) extras.set('parte', String(lugar.parte));
  }
  const fragmento = extras.toString();

  // "sandbox" vem antes de "src": o isolamento já vale no primeiro carregamento.
  iframe = el('iframe', {
    sandbox: 'allow-scripts',
    src: fragmento ? `${endereco}#${fragmento}` : endereco,
    class: 'janela-animacao-iframe',
    title: `Animação: ${titulo.textContent}`,
    referrerpolicy: 'no-referrer',
  });
  iframe.addEventListener('load', () => {
    if (minhaVez === geracao) mensagem.hidden = true;
  }, { once: true });
  area.append(iframe);
}

function removerIframe() {
  if (!iframe) return;
  iframe.remove(); // descarrega a animação: o código dela para de rodar
  iframe = null;
}

function atualizarCabecalho() {
  const { lista, indice, cardId } = aberta;
  const tituloDe = (arquivo) => infoDaAnimacao(arquivo)?.titulo ?? arquivo;
  titulo.textContent = tituloDe(arquivoAtual());
  const card = cardId ? buscarCard(cardId) : null;
  const nomeDoCard = card ? `card “${card.titulo.trim() || 'sem título'}”` : '';
  const posicao = lista.length > 1 ? `animação ${indice + 1} de ${lista.length}` : '';
  subtitulo.textContent = [nomeDoCard, posicao].filter(Boolean).join(' · ');
  if (iframe) iframe.title = `Animação: ${titulo.textContent}`;
  // Editar os textos grava no arquivo da animação: só com o servidor local.
  botaoEditar.hidden = ui.modo !== 'edicao';

  // Botões 1, 2, 3… (o da animação na tela fica aceso).
  partes.hidden = lista.length < 2;
  partes.replaceChildren(...(lista.length < 2 ? [] : lista.map((arquivo, i) => {
    const nome = `${i + 1}. ${tituloDe(arquivo)}`;
    return el('button', {
      class: 'janela-animacao-parte', type: 'button', title: nome, 'aria-label': `Animação ${nome}`,
      'aria-current': i === indice ? 'true' : null,
      onclick: () => mostrarParte(i),
    }, String(i + 1));
  })));
}

function mostrarMensagem(texto, { carregando = false } = {}) {
  mensagem.replaceChildren(el('p', {}, texto));
  mensagem.classList.toggle('carregando', carregando);
  mensagem.hidden = false;
}

/** true se o ponteiro está no fundo escurecido (fora do retângulo da janela). */
function foraDaJanela(evento) {
  if (evento.target !== janela) return false;
  const r = janela.getBoundingClientRect();
  return evento.clientX < r.left || evento.clientX > r.right || evento.clientY < r.top || evento.clientY > r.bottom;
}

/**
 * Aceita só três mensagens, e só da animação que está aberta: o pedido de
 * fechar, onde ela está (visão e passo) e quais textos do desenho estão na tela.
 */
function aoReceberMensagem(evento) {
  if (!iframe || evento.source !== iframe.contentWindow) return;
  const dados = evento.data;
  if (dados?.tipo === 'fechar-animacao') {
    fecharAnimacao();
  } else if (dados?.tipo === 'animacao-esta-em') {
    const passo = Number.isInteger(dados.passo) && dados.passo >= 0 && dados.passo < 100 ? dados.passo : 0;
    const parte = Number.isInteger(dados.parte) && dados.parte >= 0 && dados.parte < 100 ? dados.parte : 0;
    ondeEsta = { perto: dados.perto === true, passo, parte };
    aoMudarLugar();
  } else if (dados?.tipo === 'textos-na-tela' && Array.isArray(dados.chaves)) {
    aoReceberTextosNaTela(dados.chaves.filter((chave) => typeof chave === 'string').slice(0, 2000));
  }
}
