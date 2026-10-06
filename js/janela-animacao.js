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
// Nenhuma outra mensagem vinda da animação é aceita. Detalhes em
// animacoes/CONTRATO.md.
// =============================================================================

import {
  aoMudarManifesto, arquivoDeAnimacaoValido, enderecoDaAnimacao, infoDaAnimacao,
} from './animacoes.js';
import { buscarCard } from './estado.js';
import { el, icone } from './util.js';

let janela = null;          // o <dialog>
let titulo = null;
let subtitulo = null;
let partes = null;          // os botões 1, 2, 3… (só com mais de uma animação)
let area = null;
let mensagem = null;
let iframe = null;
let aberta = null;          // { lista, indice, cardId, focoAnterior } enquanto a janela está aberta
let geracao = 0;            // muda a cada abertura/fechamento (descarta respostas atrasadas)

export function iniciarJanelaAnimacao(elemento) {
  janela = elemento;
  titulo = el('strong', { id: 'janela-animacao-titulo', class: 'janela-animacao-titulo' });
  subtitulo = el('span', { class: 'janela-animacao-subtitulo' });
  partes = el('div', { class: 'janela-animacao-partes', role: 'group', 'aria-label': 'Animações deste card', hidden: true });
  mensagem = el('div', { class: 'janela-animacao-mensagem', hidden: true });
  area = el('div', { class: 'janela-animacao-area' }, mensagem);
  janela.replaceChildren(
    el('div', { class: 'janela-animacao-cabecalho' },
      icone('animacao', 'ico janela-animacao-ico'),
      el('div', { class: 'janela-animacao-textos' }, titulo, subtitulo),
      partes,
      el('button', {
        class: 'botao icone', type: 'button', title: 'Recomeçar a animação',
        'aria-label': 'Recomeçar a animação', onclick: carregar,
      }, icone('recarregar')),
      el('button', {
        class: 'botao icone', type: 'button', title: 'Fechar (Esc)', 'aria-label': 'Fechar a animação',
        onclick: () => fecharAnimacao(),
      }, icone('fechar')),
    ),
    area,
  );

  // Esc com o foco na janela (fora da animação).
  janela.addEventListener('keydown', (evento) => {
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
function mostrarParte(indice) {
  if (!aberta || indice === aberta.indice || indice < 0 || indice >= aberta.lista.length) return;
  aberta.indice = indice;
  atualizarCabecalho();
  // Os botões foram refeitos: o foco volta para o que acabou de ser clicado
  // (assim o teclado continua dentro da janela).
  partes.children[indice]?.focus({ preventScroll: true });
  carregar();
}

/** Nome do arquivo da animação que está na tela. */
function arquivoAtual() {
  return aberta.lista[aberta.indice];
}

/** Fecha a janela e descarrega a animação. */
export function fecharAnimacao() {
  if (!aberta) return;
  const { focoAnterior } = aberta;
  aberta = null;
  geracao++;
  removerIframe();
  mensagem.hidden = true;
  if (janela.open) janela.close();
  if (focoAnterior?.isConnected && focoAnterior !== document.body) focoAnterior.focus({ preventScroll: true });
}

// --- Por dentro ------------------------------------------------------------------

/** (Re)carrega a animação aberta. Também é o botão "Recomeçar". */
async function carregar() {
  if (!aberta) return;
  const minhaVez = ++geracao;
  const arquivo = arquivoAtual();
  removerIframe();

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

  // "sandbox" vem antes de "src": o isolamento já vale no primeiro carregamento.
  iframe = el('iframe', {
    sandbox: 'allow-scripts',
    src: endereco,
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

/** Aceita só o pedido de fechar, e só da animação que está aberta. */
function aoReceberMensagem(evento) {
  if (!iframe || evento.source !== iframe.contentWindow) return;
  if (evento.data?.tipo === 'fechar-animacao') fecharAnimacao();
}
