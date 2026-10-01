// =============================================================================
// janela-animacao.js — a janela grande onde uma animação roda.
//
// A animação (um arquivo da pasta animacoes/) roda dentro de um
// <iframe sandbox="allow-scripts">: o código dela funciona, mas ela não
// enxerga o app (dados, armazenamento do navegador, servidor). O iframe é
// criado ao abrir a janela e removido ao fechar, então nada da animação fica
// rodando escondido.
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
let area = null;
let mensagem = null;
let iframe = null;
let aberta = null;          // { arquivo, cardId, focoAnterior } enquanto a janela está aberta
let geracao = 0;            // muda a cada abertura/fechamento (descarta respostas atrasadas)

export function iniciarJanelaAnimacao(elemento) {
  janela = elemento;
  titulo = el('strong', { id: 'janela-animacao-titulo', class: 'janela-animacao-titulo' });
  subtitulo = el('span', { class: 'janela-animacao-subtitulo' });
  mensagem = el('div', { class: 'janela-animacao-mensagem', hidden: true });
  area = el('div', { class: 'janela-animacao-area' }, mensagem);
  janela.replaceChildren(
    el('div', { class: 'janela-animacao-cabecalho' },
      icone('animacao', 'ico janela-animacao-ico'),
      el('div', { class: 'janela-animacao-textos' }, titulo, subtitulo),
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

/** Abre a animação associada a um card. */
export function abrirAnimacaoDoCard(cardId) {
  const card = buscarCard(cardId);
  if (card?.animacao) abrirAnimacao(card.animacao, { cardId });
}

/** Abre a janela com a animação "arquivo" (nome de um arquivo em animacoes/). */
export function abrirAnimacao(arquivo, { cardId = null } = {}) {
  if (!janela) return;
  const focoAnterior = aberta?.focoAnterior ?? document.activeElement;
  aberta = { arquivo, cardId, focoAnterior };
  atualizarCabecalho();
  if (!janela.open) janela.showModal();
  // O foco fica na própria janela (não no primeiro botão): assim o Esc
  // funciona logo, e um Enter distraído não aperta nada.
  janela.focus();
  carregar();
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
  const { arquivo } = aberta;
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
  const { arquivo, cardId } = aberta;
  titulo.textContent = infoDaAnimacao(arquivo)?.titulo ?? arquivo;
  const card = cardId ? buscarCard(cardId) : null;
  subtitulo.textContent = card ? `card “${card.titulo.trim() || 'sem título'}”` : '';
  if (iframe) iframe.title = `Animação: ${titulo.textContent}`;
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
