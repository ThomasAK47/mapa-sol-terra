// =============================================================================
// avisos.js — mensagens para a pessoa usuária:
//   • toast(): aviso rápido que some sozinho (embaixo da tela);
//   • mostrarFaixa(): aviso que fica no topo até ser resolvido ou fechado;
//   • confirmar() / escolher() / alertar(): janelas que esperam uma resposta.
// =============================================================================

import { el, icone } from './util.js';

let caixaToasts = null;
let caixaFaixas = null;
let dialogo = null;
let filaDeJanelas = Promise.resolve(); // uma janela por vez

export function iniciarAvisos() {
  caixaToasts = document.getElementById('toasts');
  caixaFaixas = document.getElementById('faixas');
  dialogo = document.getElementById('dialogo');
}

/** Aviso rápido (some sozinho). */
export function toast(mensagem, { duracao = 3500 } = {}) {
  const item = el('div', { class: 'toast', role: 'status' }, mensagem);
  caixaToasts.append(item);
  while (caixaToasts.children.length > 3) caixaToasts.firstElementChild.remove();
  requestAnimationFrame(() => item.classList.add('visivel'));
  setTimeout(() => {
    item.classList.remove('visivel');
    setTimeout(() => item.remove(), 250);
  }, duracao);
}

/**
 * Mostra (ou substitui) uma faixa identificada por "id".
 *   tipo     — 'info' | 'aviso' | 'erro'
 *   detalhes — lista de linhas extras (opcional)
 *   acoes    — botões: [{ rotulo, aoClicar }]
 */
export function mostrarFaixa(id, { titulo = '', mensagem = '', detalhes = [], tipo = 'aviso', acoes = [], fechavel = true }) {
  removerFaixa(id);
  const faixa = el('div', { class: `faixa faixa-${tipo}`, 'data-id': id, role: tipo === 'erro' ? 'alert' : 'status' },
    icone(tipo === 'info' ? 'info' : 'alerta', 'ico faixa-ico'),
    el('div', { class: 'faixa-texto' },
      titulo && el('strong', {}, titulo),
      titulo && mensagem ? ' ' : null,
      mensagem,
      detalhes.length > 0 && el('ul', { class: 'faixa-detalhes' }, detalhes.map((linha) => el('li', {}, linha))),
    ),
    el('div', { class: 'faixa-acoes' },
      acoes.map((acao) => el('button', { class: 'botao botao-contorno botao-pequeno', type: 'button', onclick: acao.aoClicar }, acao.rotulo)),
      fechavel && el('button', {
        class: 'botao icone botao-pequeno', type: 'button', 'aria-label': 'Fechar aviso', title: 'Fechar aviso',
        onclick: () => removerFaixa(id),
      }, icone('fechar')),
    ),
  );
  caixaFaixas.append(faixa);
  return faixa;
}

export function removerFaixa(id) {
  for (const faixa of caixaFaixas.querySelectorAll('.faixa')) {
    if (faixa.dataset.id === id) faixa.remove();
  }
}

/** true se há uma janela de confirmação aberta. */
export function janelaAberta() {
  return Boolean(dialogo?.open);
}

/**
 * Janela com opções. Resolve com o id da opção escolhida, ou null se a
 * pessoa fechar a janela (Esc) quando "cancelavel" for true.
 *   opcoes — [{ id, rotulo, detalhe?, estilo? ('principal' | 'perigo') }]
 *   vertical — empilha as opções (bom quando elas têm "detalhe")
 */
export function escolher({ titulo, mensagem = '', opcoes, cancelavel = true, vertical = false }) {
  const abrir = () => new Promise((resolver) => {
    // A resposta é entregue direto no clique (ou no Esc). Não dependemos do
    // evento "close" da janela, que alguns navegadores atrasam.
    let concluido = false;
    const concluir = (resposta) => {
      if (concluido) return;
      concluido = true;
      dialogo.removeEventListener('keydown', aoTeclar);
      dialogo.removeEventListener('cancel', aoCancelar);
      dialogo.removeEventListener('close', aoFechar);
      if (dialogo.open) dialogo.close();
      resolver(resposta);
    };
    const aoTeclar = (evento) => {
      if (evento.key !== 'Escape') return;
      evento.preventDefault();
      evento.stopPropagation(); // o Esc da janela não deve também fechar o painel
      if (cancelavel) concluir(null);
    };
    const aoCancelar = (evento) => {
      evento.preventDefault();
      if (cancelavel) concluir(null);
    };
    const aoFechar = () => concluir(null); // fechada por outro meio

    const botoes = opcoes.map((opcao) => el('button', {
      class: `botao botao-contorno${opcao.estilo ? ` botao-${opcao.estilo}` : ''}`,
      type: 'button',
      onclick: () => concluir(opcao.id),
    }, opcao.rotulo, opcao.detalhe && el('small', {}, opcao.detalhe)));

    dialogo.replaceChildren(
      el('div', { class: 'dialogo-corpo' },
        el('h2', { class: 'dialogo-titulo' }, titulo),
        mensagem && el('p', { class: 'dialogo-mensagem' }, mensagem),
        el('div', { class: `dialogo-acoes${vertical ? ' vertical' : ''}` }, botoes),
      ),
    );
    dialogo.addEventListener('keydown', aoTeclar);
    dialogo.addEventListener('cancel', aoCancelar);
    dialogo.addEventListener('close', aoFechar);
    dialogo.showModal();
    // Foco inicial: a opção principal; em janelas de perigo, a primeira
    // opção (normalmente "Cancelar"), para um Enter distraído não apagar nada.
    (dialogo.querySelector('.botao-principal') ?? botoes[0])?.focus();
  });

  const promessa = filaDeJanelas.then(abrir);
  filaDeJanelas = promessa.catch(() => {});
  return promessa;
}

/** Pergunta sim/não. Resolve com true (confirmou) ou false. */
export async function confirmar({ titulo, mensagem = '', botaoOk = 'OK', botaoCancelar = 'Cancelar', perigo = false }) {
  const resposta = await escolher({
    titulo,
    mensagem,
    opcoes: [
      { id: 'cancelar', rotulo: botaoCancelar },
      { id: 'ok', rotulo: botaoOk, estilo: perigo ? 'perigo' : 'principal' },
    ],
  });
  return resposta === 'ok';
}

/** Mostra uma mensagem e espera a pessoa fechar. */
export async function alertar({ titulo, mensagem = '', botao = 'Entendi' }) {
  await escolher({ titulo, mensagem, opcoes: [{ id: 'ok', rotulo: botao, estilo: 'principal' }] });
}
