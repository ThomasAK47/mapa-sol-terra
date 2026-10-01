// =============================================================================
// painel.js — painel lateral com os detalhes de um card.
//   • Modo de edição: campos editáveis. Cada alteração entra no desfazer e é
//     salva sozinha (não há botão "salvar").
//   • Modo somente leitura: só o conteúdo, sem campos.
// O painel também mostra a família do card (card pai e filhos, com o botão
// de recolher/expandir) e lista as conexões; um clique abre cada uma.
// O campo "Animação" oferece as animações de animacoes/manifesto.json.
// =============================================================================

import {
  abrirLinkDocs, alternarRecolhido, centralizarCard, definirAnimacao, definirPai, descartarSeVazio,
  excluirCard, expandirAte, moverCardParaZona,
} from './acoes.js';
import { aoMudarManifesto, infoDaAnimacao, manifestoAtual } from './animacoes.js';
import { areaUtil, definirMargemDireita, mundoParaTela } from './camera.js';
import { abrirEditorConexao } from './editor-conexao.js';
import {
  alterar, assinar, buscarCard, encerrarAgrupamento, geometria, obterDados, podeEditar, selecionar,
} from './estado.js';
import { descendentes, estaRecolhido, hierarquia } from './hierarquia.js';
import { abrirAnimacaoDoCard } from './janela-animacao.js';
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
  // A lista de animações mudou (manifesto editado): atualiza o campo.
  aoMudarManifesto(() => {
    if (idAberto) sincronizar();
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
  if (!card || !hierarquia().visiveis.has(card.id)) {
    // Excluído, ou escondido dentro de um pai recolhido.
    if (!card) idRecemCriado = null;
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
  if (ativo !== campos.pai) preencherSeletorDePai(campos.pai, card.id);
  preencherFilhos(campos.filhos, card.id);
  campos.tags.desenhar(card.tags);
  const link = card.linkDocs ?? '';
  if (ativo !== campos.link && campos.link.value.trim() !== link) {
    campos.link.value = link;
    atualizarDicaDoLink(link, campos.dicaLink, campos.abrirLink);
  }
  preencherCampoAnimacao(campos.animacao, card);
  preencherConexoes(campos.conexoes, card.id);
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

  const pai = el('select', { id: 'painel-pai', class: 'entrada' });
  preencherSeletorDePai(pai, id);
  pai.addEventListener('change', () => {
    // Se não deu para mudar (ex.: formaria um ciclo), volta ao valor atual.
    if (!definirPai(id, pai.value || null)) pai.value = buscarCard(id)?.pai ?? '';
  });

  const filhos = el('div', { class: 'campo' });
  preencherFilhos(filhos, id);

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

  const animacao = construirCampoAnimacao(id);
  preencherCampoAnimacao(animacao, card);

  const conexoes = el('div', { class: 'campo' });
  preencherConexoes(conexoes, id);

  const datas = el('div', { class: 'painel-meta' });
  preencherDatas(datas, card);

  campos = {
    titulo, descricao, contador, zona, pai, filhos, tags, link, dicaLink, abrirLink, animacao, conexoes, datas,
    assinaturaZonas: assinaturaDasZonas(),
  };

  return [
    el('div', { class: 'painel-cabecalho' },
      el('span', { class: 'painel-rotulo' }, 'Card'),
      botaoFechar(),
    ),
    el('div', { class: 'painel-corpo' },
      el('div', { class: 'campo' }, el('label', { class: 'campo-rotulo', for: 'painel-titulo' }, 'Título'), titulo),
      el('div', { class: 'campo' }, el('label', { class: 'campo-rotulo', for: 'painel-descricao' }, 'Descrição'), descricao, contador),
      el('div', { class: 'campo' }, el('label', { class: 'campo-rotulo', for: 'painel-zona' }, 'Zona'), zona),
      el('div', { class: 'campo' }, el('label', { class: 'campo-rotulo', for: 'painel-pai' }, 'Card pai'), pai),
      filhos,
      el('div', { class: 'campo' }, el('span', { class: 'campo-rotulo' }, 'Tags'), tags.caixa),
      el('div', { class: 'campo' },
        el('label', { class: 'campo-rotulo', for: 'painel-link' }, 'Link do Google Docs'),
        el('div', { class: 'linha' }, link, abrirLink),
        dicaLink,
      ),
      animacao.caixa,
      conexoes,
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

// --- Animação ---------------------------------------------------------------------

/** Campo "Animação": a lista do manifesto e o botão para abrir. */
function construirCampoAnimacao(id) {
  const seletor = el('select', { id: 'painel-animacao', class: 'entrada' });
  seletor.addEventListener('change', () => definirAnimacao(id, seletor.value || null));
  const abrir = el('button', {
    class: 'botao botao-contorno botao-pequeno', type: 'button', title: 'Abrir a animação',
    onclick: () => abrirAnimacaoDoCard(id),
  }, icone('animacao'), 'Abrir');
  const dica = el('div', { class: 'dica' });
  const avisos = el('div', { class: 'avisos-manifesto' });
  const caixa = el('div', { class: 'campo' },
    el('label', { class: 'campo-rotulo', for: 'painel-animacao' }, 'Animação'),
    el('div', { class: 'linha' }, seletor, abrir),
    dica,
    avisos,
  );
  return { caixa, seletor, abrir, dica, avisos, assinatura: null };
}

/**
 * Preenche o campo com as animações do manifesto. A animação atual do card
 * continua na lista mesmo que tenha saído do manifesto (nada some sem aviso).
 */
function preencherCampoAnimacao(campo, card) {
  const manifesto = manifestoAtual();
  const atual = card.animacao ?? '';
  // Só refaz a lista quando algo mudou (a cada tecla digitada no painel, esta
  // função é chamada de novo).
  const assinatura = `${atual}\u0001${manifesto ? JSON.stringify([manifesto.lista, manifesto.avisos, manifesto.erro]) : ''}`;
  if (assinatura === campo.assinatura) return;
  campo.assinatura = assinatura;

  const lista = manifesto?.lista ?? [];
  const noManifesto = Boolean(atual && manifesto?.porArquivo.has(atual));
  const listaConfiavel = Boolean(manifesto && !manifesto.erro);
  const opcoes = [el('option', { value: '' }, '(nenhuma)')];
  for (const item of lista) {
    opcoes.push(el('option', { value: item.arquivo, title: item.descricao || null }, item.titulo));
  }
  if (atual && !noManifesto) {
    opcoes.push(el('option', { value: atual }, listaConfiavel ? `${atual} (fora do manifesto)` : atual));
  }
  campo.seletor.replaceChildren(...opcoes);
  campo.seletor.value = atual;
  campo.abrir.disabled = !atual;

  campo.dica.textContent = noManifesto
    ? manifesto.porArquivo.get(atual).descricao
    : atual && listaConfiavel ? 'Esta animação não está em animacoes/manifesto.json.' : '';
  campo.dica.hidden = !campo.dica.textContent;

  // Problemas do manifesto (ex.: erro de formatação), para a pessoa corrigir.
  const problemas = !manifesto ? ['Carregando a lista de animações…']
    : manifesto.erro ? [manifesto.erro]
    : lista.length === 0 ? ['Nenhuma animação no manifesto ainda (veja animacoes/CONTRATO.md).']
    : [];
  if (manifesto) problemas.push(...manifesto.avisos);
  campo.avisos.replaceChildren(...problemas.map((texto) => el('div', { class: 'dica' }, texto)));
  campo.avisos.hidden = problemas.length === 0;
}

// --- Família (card pai e cards filhos) -----------------------------------------------

/**
 * Opções do campo "Card pai": nenhum, ou qualquer card que não seja ele mesmo
 * nem um descendente dele (isso formaria um ciclo), agrupados por zona.
 */
function preencherSeletorDePai(seletor, id) {
  const dados = obterDados();
  const proibidos = new Set([id, ...descendentes(id)]);
  const grupos = geometria().lista.map((zona) => {
    const candidatos = dados.cards
      .filter((c) => c.zona === zona.id && !proibidos.has(c.id))
      .sort((a, b) => (a.titulo.trim() || 'sem título').localeCompare(b.titulo.trim() || 'sem título', 'pt-BR'));
    return candidatos.length
      ? el('optgroup', { label: zona.nome }, candidatos.map((c) => el('option', { value: c.id }, c.titulo.trim() || 'sem título')))
      : null;
  });
  seletor.replaceChildren(el('option', { value: '' }, '(nenhum: card de nível mais alto)'), ...grupos.filter(Boolean));
  seletor.value = buscarCard(id)?.pai ?? '';
}

/** Lista os cards filhos, com o botão de recolher/expandir. */
function preencherFilhos(caixa, id) {
  const filhos = hierarquia().filhos.get(id) ?? [];
  caixa.hidden = filhos.length === 0;
  if (filhos.length === 0) {
    caixa.replaceChildren();
    return;
  }
  const recolhido = estaRecolhido(buscarCard(id));
  caixa.replaceChildren(
    el('div', { class: 'linha-rotulo' },
      el('span', { class: 'campo-rotulo' }, `Cards filhos (${filhos.length})`),
      el('button', {
        class: 'botao botao-contorno botao-pequeno', type: 'button',
        title: recolhido ? 'Mostrar os cards filhos no mapa' : 'Esconder os cards filhos no mapa',
        onclick: () => alternarRecolhido(id),
      }, recolhido ? 'Expandir' : 'Recolher'),
    ),
    el('div', { class: 'lista-familia' }, filhos.map((filho) => botaoDeCard(filho))),
  );
}

/** Botão com o título de um card; o clique abre o painel dele. */
function botaoDeCard(id) {
  const card = buscarCard(id);
  return el('button', {
    class: 'chip chip-botao', type: 'button', title: 'Abrir este card',
    onclick: () => abrirCardDaFamilia(id),
  }, card?.titulo.trim() || 'sem título');
}

/** Abre o painel de um parente (expandindo quem o esconde, se preciso). */
function abrirCardDaFamilia(id) {
  if (!buscarCard(id)) return;
  if (!hierarquia().visiveis.has(id)) expandirAte(id);
  abrirPainel(id);
  centralizarCard(id);
}

/** Lista as conexões do card: sentido, card do outro lado e o porquê. */
function preencherConexoes(caixa, id) {
  const doCard = obterDados().conexoes.filter((k) => k.de === id || k.para === id);
  const itens = doCard.map((conexao) => {
    const saindo = conexao.de === id;
    const outro = buscarCard(saindo ? conexao.para : conexao.de);
    const sentido = !conexao.direcional ? '—' : saindo ? '→' : '←';
    const texto = conexao.texto.trim();
    return el('button', {
      class: 'item-conexao', type: 'button', title: 'Abrir esta conexão',
      onclick: () => abrirEditorConexao(conexao.id),
    },
    el('span', { class: 'sentido', 'aria-hidden': 'true' }, sentido),
    el('span', { class: 'outro' }, outro?.titulo.trim() || 'sem título'),
    el('span', { class: `texto${texto ? '' : ' vazio'}` }, texto || 'sem explicação'),
    );
  });
  const vazio = podeEditar()
    ? 'Nenhuma conexão ainda. Passe o mouse sobre o card e arraste a bolinha de baixo até outro card.'
    : 'Nenhuma conexão.';
  caixa.replaceChildren(
    el('span', { class: 'campo-rotulo' }, doCard.length ? `Conexões (${doCard.length})` : 'Conexões'),
    itens.length ? el('div', { class: 'lista-conexoes' }, itens) : el('p', { class: 'dica' }, vazio),
  );
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
      card.animacao && animacaoDaLeitura(card),
      card.pai && buscarCard(card.pai) && el('div', { class: 'campo' },
        el('span', { class: 'campo-rotulo' }, 'Card pai'),
        el('div', { class: 'lista-familia' }, botaoDeCard(card.pai)),
      ),
      filhosDaLeitura(card.id),
      conexoesDaLeitura(card.id),
      el('div', { class: 'painel-meta' }, `Atualizado em ${formatarDataHora(card.atualizadoEm)}`),
    ),
  ];
}

/** Botão "Abrir a animação", com o título e a descrição do manifesto. */
function animacaoDaLeitura(card) {
  const info = infoDaAnimacao(card.animacao);
  return el('div', { class: 'campo' },
    el('div', {},
      el('button', { class: 'botao botao-contorno', type: 'button', onclick: () => abrirAnimacaoDoCard(card.id) },
        icone('animacao'), 'Abrir a animação'),
    ),
    info && el('div', { class: 'dica' }, info.descricao ? `${info.titulo}: ${info.descricao}` : info.titulo),
  );
}

function filhosDaLeitura(id) {
  const caixa = el('div', { class: 'campo' });
  preencherFilhos(caixa, id);
  return caixa;
}

function conexoesDaLeitura(id) {
  const caixa = el('div', { class: 'campo' });
  preencherConexoes(caixa, id);
  return caixa;
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
