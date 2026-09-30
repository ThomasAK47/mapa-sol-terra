// =============================================================================
// painel.js — painel lateral com os detalhes de um card.
//   • Modo de edição: campos editáveis. Cada alteração entra no desfazer e é
//     salva sozinha (não há botão "salvar").
//   • Modo somente leitura: só o conteúdo, sem campos.
// (O campo "card pai" chega na Fase 3 e o de animação, na Fase 4.)
// =============================================================================

import { abrirLinkDocs, centralizarCard, descartarSeVazio, excluirCard, moverCardParaZona } from './acoes.js';
import { areaUtil, definirMargemDireita, mundoParaTela } from './camera.js';
import {
  alterar, assinar, buscarCard, encerrarAgrupamento, geometria, obterDados, podeEditar, selecionar,
} from './estado.js';
import { posicaoAbsoluta } from './modelo.js';
import { agoraISO, el, formatarDataHora, icone, linkSeguro, semAcentos } from './util.js';

const LIMITE_SUAVE_DESCRICAO = 300; // a partir daqui o contador sugere usar o Docs

let raiz = null;
let idAberto = null;
let idRecemCriado = null;   // card criado agora (descartado se ficar vazio)
let campos = null;          // referências aos campos do modo de edição

export function iniciarPainel(elemento) {
  raiz = elemento;
  assinar((mudanca) => {
    if (!idAberto || mudanca.tipo === 'gesto' || mudanca.tipo === 'selecao') return;
    sincronizar();
  });
}

/** Id do card aberto no painel (ou null). */
export function painelAberto() {
  return idAberto;
}

export function abrirPainel(id, { novo = false } = {}) {
  if (!buscarCard(id)) return;
  if (idAberto && idAberto !== id) liberarCardAnterior();
  if (novo) idRecemCriado = id;
  else if (idRecemCriado !== id) idRecemCriado = null;
  idAberto = id;
  construir();
  raiz.classList.add('aberto');
  raiz.setAttribute('aria-hidden', 'false');
  definirMargemDireita(raiz.offsetWidth);
  selecionar(id);
  garantirVisivel(id);
  if (novo) campos?.titulo.focus();
}

export function fecharPainel() {
  if (!idAberto) return;
  const id = idAberto;
  idAberto = null;
  campos = null;
  raiz.classList.remove('aberto');
  raiz.setAttribute('aria-hidden', 'true');
  definirMargemDireita(0);
  if (raiz.contains(document.activeElement)) document.activeElement.blur();
  encerrarAgrupamento();
  if (idRecemCriado === id) {
    idRecemCriado = null;
    descartarSeVazio(id);
  }
  setTimeout(() => {
    if (!idAberto) raiz.replaceChildren(); // limpa depois da animação de saída
  }, 250);
}

function liberarCardAnterior() {
  const anterior = idAberto;
  encerrarAgrupamento();
  if (idRecemCriado === anterior) {
    idRecemCriado = null;
    descartarSeVazio(anterior);
  }
}

function construir() {
  const card = buscarCard(idAberto);
  if (!card) {
    fecharPainel();
    return;
  }
  campos = null;
  raiz.replaceChildren(...(podeEditar() ? construirEdicao(card) : construirLeitura(card)));
}

/** Atualiza os campos quando os dados mudam por fora (ex.: desfazer). */
function sincronizar() {
  const card = buscarCard(idAberto);
  if (!card) {
    idRecemCriado = null;
    fecharPainel();
    return;
  }
  if (!campos || campos.assinaturaZonas !== assinaturaDasZonas()) {
    construir();
    return;
  }
  const ativo = document.activeElement;
  if (ativo !== campos.titulo && campos.titulo.value !== card.titulo) campos.titulo.value = card.titulo;
  if (ativo !== campos.descricao && campos.descricao.value !== card.descricao) {
    campos.descricao.value = card.descricao;
    atualizarContador(campos.contador, card.descricao);
  }
  if (campos.zona.value !== card.zona) campos.zona.value = card.zona;
  campos.tags.desenhar(card.tags);
  const link = card.linkDocs ?? '';
  if (ativo !== campos.link && campos.link.value.trim() !== link) {
    campos.link.value = link;
    atualizarDicaDoLink(link, campos.dicaLink, campos.abrirLink);
  }
  preencherDatas(campos.datas, card);
}

// --- Modo de edição -----------------------------------------------------------

function construirEdicao(card) {
  const id = card.id;

  const titulo = el('input', {
    id: 'painel-titulo', class: 'entrada entrada-titulo', type: 'text', maxlength: 200,
    placeholder: 'Título do card', autocomplete: 'off', value: card.titulo,
  });
  titulo.addEventListener('input', () => editarCampo(id, 'titulo', titulo.value, 'Editar título'));
  titulo.addEventListener('change', () => aparar(titulo, id, 'titulo', 'Editar título'));
  titulo.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') {
      evento.preventDefault();
      descricao.focus();
    }
  });

  const descricao = el('textarea', {
    id: 'painel-descricao', class: 'entrada', rows: 5,
    placeholder: 'Descrição curta. Os detalhes ficam no Google Docs.',
  });
  descricao.value = card.descricao;
  const contador = el('div', { class: 'contador', 'aria-live': 'polite' });
  atualizarContador(contador, card.descricao);
  descricao.addEventListener('input', () => {
    editarCampo(id, 'descricao', descricao.value, 'Editar descrição');
    atualizarContador(contador, descricao.value);
  });
  descricao.addEventListener('change', () => aparar(descricao, id, 'descricao', 'Editar descrição'));

  const zona = el('select', { id: 'painel-zona', class: 'entrada' },
    geometria().lista.map((z) => el('option', { value: z.id }, z.nome)),
  );
  zona.value = card.zona;
  zona.addEventListener('change', () => moverCardParaZona(id, zona.value));

  const tags = construirTags(id, card.tags);

  const link = el('input', {
    id: 'painel-link', class: 'entrada', type: 'url', autocomplete: 'off',
    placeholder: 'https://docs.google.com/…', value: card.linkDocs ?? '',
  });
  const abrirLink = el('button', {
    class: 'botao botao-contorno botao-pequeno', type: 'button', title: 'Abrir o link numa nova aba',
    onclick: () => abrirLinkDocs(id),
  }, icone('externo'), 'Abrir');
  const dicaLink = el('div', { class: 'dica' });
  atualizarDicaDoLink(card.linkDocs ?? '', dicaLink, abrirLink);
  link.addEventListener('input', () => {
    editarCampo(id, 'linkDocs', link.value.trim() || null, 'Editar link do Docs');
    atualizarDicaDoLink(link.value, dicaLink, abrirLink);
  });

  const datas = el('div', { class: 'painel-meta' });
  preencherDatas(datas, card);

  campos = { titulo, descricao, contador, zona, tags, link, dicaLink, abrirLink, datas, assinaturaZonas: assinaturaDasZonas() };

  return [
    el('div', { class: 'painel-cabecalho' },
      el('span', { class: 'painel-rotulo' }, 'Card'),
      botaoFechar(),
    ),
    el('div', { class: 'painel-corpo' },
      el('div', { class: 'campo' }, el('label', { class: 'campo-rotulo', for: 'painel-titulo' }, 'Título'), titulo),
      el('div', { class: 'campo' }, el('label', { class: 'campo-rotulo', for: 'painel-descricao' }, 'Descrição'), descricao, contador),
      el('div', { class: 'campo' }, el('label', { class: 'campo-rotulo', for: 'painel-zona' }, 'Zona'), zona),
      el('div', { class: 'campo' }, el('span', { class: 'campo-rotulo' }, 'Tags'), tags.caixa),
      el('div', { class: 'campo' },
        el('label', { class: 'campo-rotulo', for: 'painel-link' }, 'Link do Google Docs'),
        el('div', { class: 'linha' }, link, abrirLink),
        dicaLink,
      ),
      datas,
    ),
    el('div', { class: 'painel-rodape' },
      el('button', { class: 'botao botao-perigo botao-pequeno', type: 'button', onclick: () => excluirCard(id) },
        icone('lixeira'), 'Excluir card'),
    ),
  ];
}

/** Grava o valor de um campo do card (digitação seguida vira uma ação só). */
function editarCampo(id, campo, valor, rotulo) {
  const card = buscarCard(id);
  if (!card || card[campo] === valor) return;
  alterar(rotulo, (d) => {
    const alvo = d.cards.find((c) => c.id === id);
    if (!alvo) return;
    alvo[campo] = valor;
    alvo.atualizadoEm = agoraISO();
  }, { agrupar: `${campo}:${id}` });
}

/** Ao sair do campo, tira espaços sobrando no começo e no fim. */
function aparar(entrada, id, campo, rotulo) {
  const aparado = entrada.value.trim();
  if (aparado !== entrada.value) {
    entrada.value = aparado;
    editarCampo(id, campo, aparado, rotulo);
  }
  encerrarAgrupamento();
}

function atualizarContador(contador, texto) {
  const n = texto.trim().length;
  const longo = n > LIMITE_SUAVE_DESCRICAO;
  contador.classList.toggle('longo', longo);
  contador.textContent = longo
    ? `${n} caracteres: descrições longas ficam melhor no Docs`
    : n >= 200 ? `${n} caracteres` : '';
}

function atualizarDicaDoLink(valor, dica, botaoAbrir) {
  const texto = String(valor ?? '').trim();
  const valido = Boolean(linkSeguro(texto));
  dica.textContent = texto && !valido ? 'O link precisa começar com https://' : '';
  botaoAbrir.disabled = !valido;
}

function preencherDatas(caixa, card) {
  caixa.replaceChildren(
    el('div', {}, `Criado em ${formatarDataHora(card.criadoEm)}`),
    el('div', {}, `Atualizado em ${formatarDataHora(card.atualizadoEm)}`),
  );
}

function assinaturaDasZonas() {
  return geometria().lista.map((z) => `${z.id}|${z.nome}`).join('\n');
}

// --- Tags -------------------------------------------------------------------------

function construirTags(id, tagsIniciais) {
  const sugestoes = el('datalist', { id: 'painel-tags-sugestoes' });
  const entrada = el('input', {
    type: 'text', placeholder: 'adicionar tag…', 'aria-label': 'Nova tag',
    list: 'painel-tags-sugestoes', maxlength: 60, autocomplete: 'off',
  });
  const lista = el('span', { style: 'display: contents' });
  const caixa = el('div', { class: 'chips' }, lista, entrada, sugestoes);

  const desenhar = (tags) => {
    lista.replaceChildren(...tags.map((tag) => el('span', { class: 'chip' },
      tag,
      el('button', {
        type: 'button', title: `Remover a tag “${tag}”`, 'aria-label': `Remover a tag ${tag}`,
        onclick: () => removerTag(id, tag),
      }, icone('fechar')),
    )));
    sugestoes.replaceChildren(...sugestoesDeTags(tags).map((tag) => el('option', { value: tag })));
  };

  entrada.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter' || evento.key === ',') {
      evento.preventDefault();
      adicionarTag(id, entrada.value);
      entrada.value = '';
    } else if (evento.key === 'Backspace' && !entrada.value) {
      const ultima = buscarCard(id)?.tags.at(-1);
      if (ultima) removerTag(id, ultima);
    }
  });
  entrada.addEventListener('blur', () => {
    if (entrada.value.trim()) {
      adicionarTag(id, entrada.value);
      entrada.value = '';
    }
  });
  caixa.addEventListener('click', (evento) => {
    if (evento.target === caixa) entrada.focus();
  });

  desenhar(tagsIniciais);
  return { caixa, desenhar };
}

/** Tags já usadas em outros cards (para completar enquanto digita). */
function sugestoesDeTags(tagsDoCard) {
  const usadas = new Set(tagsDoCard.map(semAcentos));
  const todas = new Map();
  for (const card of obterDados().cards) {
    for (const tag of card.tags) {
      const chave = semAcentos(tag);
      if (!usadas.has(chave) && !todas.has(chave)) todas.set(chave, tag);
    }
  }
  return [...todas.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function adicionarTag(id, texto) {
  const tag = texto.trim().replace(/\s+/g, ' ').replace(/,+$/, '').trim();
  const card = buscarCard(id);
  if (!tag || !card || card.tags.some((t) => semAcentos(t) === semAcentos(tag))) return;
  alterar('Adicionar tag', (d) => {
    const alvo = d.cards.find((c) => c.id === id);
    alvo.tags.push(tag);
    alvo.atualizadoEm = agoraISO();
  });
}

function removerTag(id, tag) {
  alterar('Remover tag', (d) => {
    const alvo = d.cards.find((c) => c.id === id);
    alvo.tags = alvo.tags.filter((t) => t !== tag);
    alvo.atualizadoEm = agoraISO();
  });
}

// --- Modo somente leitura ---------------------------------------------------------

function construirLeitura(card) {
  const zona = geometria().porId.get(card.zona);
  const descricao = card.descricao.trim();
  const link = linkSeguro(card.linkDocs);
  return [
    el('div', { class: 'painel-cabecalho' },
      el('span', { class: 'painel-rotulo' }, zona?.nome ?? 'Card'),
      botaoFechar(),
    ),
    el('div', { class: 'painel-corpo' },
      el('h2', { class: 'leitura-titulo' }, card.titulo.trim() || 'sem título'),
      descricao
        ? el('p', { class: 'leitura-descricao' }, descricao)
        : el('p', { class: 'leitura-vazia' }, 'Sem descrição.'),
      card.tags.length > 0 && el('div', { class: 'chips-leitura' }, card.tags.map((tag) => el('span', { class: 'chip' }, tag))),
      link && el('div', {},
        el('a', { class: 'botao botao-contorno', href: link, target: '_blank', rel: 'noopener noreferrer' },
          icone('documento'), 'Abrir no Google Docs', icone('externo')),
      ),
      el('div', { class: 'painel-meta' }, `Atualizado em ${formatarDataHora(card.atualizadoEm)}`),
    ),
  ];
}

// --- Auxiliares -------------------------------------------------------------------

function botaoFechar() {
  return el('button', {
    class: 'botao icone', type: 'button', title: 'Fechar (Esc)', 'aria-label': 'Fechar painel',
    onclick: fecharPainel,
  }, icone('fechar'));
}

/** Se o card estiver escondido atrás do painel ou fora da tela, leva a câmera até ele. */
function garantirVisivel(id) {
  const card = buscarCard(id);
  if (!card) return;
  const { X, Y } = posicaoAbsoluta(card, geometria());
  const ponto = mundoParaTela(X, Y);
  const area = areaUtil();
  const folga = 80;
  const visivel = ponto.x > area.x + folga && ponto.x < area.x + area.largura - folga &&
                  ponto.y > area.y + folga && ponto.y < area.y + area.altura - folga;
  if (!visivel) centralizarCard(id);
}
