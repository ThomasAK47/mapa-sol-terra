// =============================================================================
// zonas.js — edição das zonas (as faixas verticais do mapa), no modo de edição.
//
//   • Clicar no nome de uma zona, no alto da tela, abre uma janelinha para
//     mudar o nome e a descrição, criar uma zona à direita ou excluir a zona.
//   • Arrastar a marca que fica no alto de cada limite muda a largura da zona
//     à esquerda dele. As zonas seguintes (com seus cards e a Terra) se
//     deslocam junto; nenhum card troca de zona.
//
// Os nomes e as marcas são criados e posicionados por js/fundo.js; aqui ficam
// só os cliques e os arrastos. Toda mudança passa por estado.alterar (ou por
// um gesto), então entra no desfazer e é salva sozinha.
// =============================================================================

import { criarZonaDepoisDe, editarZona, excluirZona } from './acoes.js';
import { aoMudarCamera, areaUtil, irPara, obterCamera, telaParaMundo } from './camera.js';
import {
  alterarDuranteGesto, assinar, cancelarGesto, concluirGesto, encerrarAgrupamento, geometria, iniciarGesto,
  obterDados, podeEditar,
} from './estado.js';
import { larguraPermitidaDaZona } from './modelo.js';
import { el, icone, limitar } from './util.js';

let camadaRotulos = null;   // #rotulos-zonas (onde ficam os nomes e as marcas)
let raiz = null;            // a janelinha do editor
let idAberto = null;        // id da zona aberta no editor (ou null)
let campos = null;          // { nome, detalhe, excluir }
let arrasto = null;         // { id, alca, ponteiro, larguraInicial, xInicial } durante um arrasto de largura

export function iniciarZonas(elementoRotulos, elementoEditor) {
  camadaRotulos = elementoRotulos;
  raiz = elementoEditor;

  camadaRotulos.addEventListener('click', (evento) => {
    const rotulo = evento.target.closest('.rotulo-zona');
    if (rotulo && podeEditar()) abrirEditorDeZona(rotulo.dataset.zona);
  });
  camadaRotulos.addEventListener('keydown', (evento) => {
    const rotulo = evento.target.closest('.rotulo-zona');
    if (!rotulo || !podeEditar() || (evento.key !== 'Enter' && evento.key !== ' ')) return;
    evento.preventDefault();
    abrirEditorDeZona(rotulo.dataset.zona);
  });
  // Um duplo clique num nome não deve criar um card (o que o duplo clique no
  // fundo do mapa faz).
  camadaRotulos.addEventListener('dblclick', (evento) => {
    if (podeEditar() && evento.target.closest('.rotulo-zona, .alca-zona')) evento.stopPropagation();
  });
  camadaRotulos.addEventListener('pointerdown', aoPressionarMarca);
  camadaRotulos.addEventListener('pointermove', aoMoverMarca);
  camadaRotulos.addEventListener('pointerup', aoSoltarMarca);
  camadaRotulos.addEventListener('pointercancel', aoSoltarMarca);
  // Esc durante o arrasto devolve a largura de antes.
  document.addEventListener('keydown', (evento) => {
    if (!arrasto || evento.key !== 'Escape') return;
    evento.stopPropagation();
    encerrarArrasto();
    cancelarGesto();
  }, true);

  raiz.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Escape') return;
    evento.stopPropagation(); // fecha só esta janelinha
    fecharEditorDeZona();
  });
  // Clicar fora fecha (menos numa janela de confirmação, noutro nome de zona
  // ou numa marca de largura).
  document.addEventListener('pointerdown', (evento) => {
    if (!idAberto || raiz.contains(evento.target)) return;
    if (evento.target.closest?.('#dialogo, .rotulo-zona, .alca-zona')) return;
    fecharEditorDeZona();
  }, true);

  assinar((mudanca) => {
    if (!idAberto || mudanca.tipo === 'selecao') return;
    sincronizar();
  });
  aoMudarCamera(() => {
    if (idAberto) posicionar();
  });
}

/** Id da zona aberta no editor (ou null). */
export function editorDeZonaAberto() {
  return idAberto;
}

// --- Janelinha: nome, descrição, zona nova, excluir -----------------------------------

export function abrirEditorDeZona(id) {
  const zona = obterDados()?.zonas.find((z) => z.id === id);
  if (!zona || !podeEditar()) return;
  if (idAberto && idAberto !== id) fecharEditorDeZona();
  idAberto = id;

  const nome = el('input', {
    id: 'zona-nome', class: 'entrada', type: 'text', maxlength: 60, autocomplete: 'off', value: zona.nome,
  });
  nome.addEventListener('input', () => {
    // Um nome vazio não é gravado (o nome é o que se clica para editar a zona).
    if (nome.value.trim()) editarZona(id, 'nome', nome.value);
  });
  nome.addEventListener('change', () => {
    const atual = obterDados().zonas.find((z) => z.id === id);
    const aparado = nome.value.trim();
    if (!aparado) nome.value = atual?.nome ?? '';
    else if (aparado !== nome.value) {
      nome.value = aparado;
      editarZona(id, 'nome', aparado);
    }
    encerrarAgrupamento();
  });
  nome.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') {
      evento.preventDefault();
      detalhe.focus();
    }
  });

  const detalhe = el('input', {
    id: 'zona-detalhe', class: 'entrada', type: 'text', maxlength: 120, autocomplete: 'off',
    placeholder: 'Aparece ao passar o mouse sobre o nome', value: zona.detalhe,
  });
  detalhe.addEventListener('input', () => editarZona(id, 'detalhe', detalhe.value));
  detalhe.addEventListener('change', () => {
    if (detalhe.value.trim() !== detalhe.value) {
      detalhe.value = detalhe.value.trim();
      editarZona(id, 'detalhe', detalhe.value);
    }
    encerrarAgrupamento();
  });
  detalhe.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') {
      evento.preventDefault();
      fecharEditorDeZona();
    }
  });

  const excluir = el('button', {
    class: 'botao icone botao-pequeno', type: 'button', 'aria-label': 'Excluir esta zona',
    title: 'Excluir esta zona (o espaço e os cards passam para a zona vizinha)',
    onclick: async () => {
      if (await excluirZona(id)) fecharEditorDeZona();
    },
  }, icone('lixeira'));

  campos = { nome, detalhe, excluir };
  raiz.replaceChildren(
    el('div', { class: 'editor-zona-cabecalho' },
      el('span', { class: 'painel-rotulo' }, 'Zona'),
      el('button', {
        class: 'botao icone botao-pequeno', type: 'button', title: 'Fechar (Esc)', 'aria-label': 'Fechar',
        onclick: fecharEditorDeZona,
      }, icone('fechar')),
    ),
    el('div', { class: 'campo' }, el('label', { class: 'campo-rotulo', for: 'zona-nome' }, 'Nome'), nome),
    el('div', { class: 'campo' }, el('label', { class: 'campo-rotulo', for: 'zona-detalhe' }, 'Descrição'), detalhe),
    el('div', { class: 'editor-zona-acoes' },
      el('button', {
        class: 'botao botao-contorno botao-pequeno', type: 'button',
        title: 'Criar uma zona logo à direita desta (as seguintes se deslocam)',
        onclick: () => criarZonaAoLado(id),
      }, icone('mais'), 'Nova zona à direita'),
      el('span', { class: 'espaco' }),
      excluir,
    ),
    el('p', { class: 'dica' }, 'Para mudar a largura, arraste a marca no alto do limite direito da zona.'),
  );
  excluir.disabled = obterDados().zonas.length < 2;
  raiz.hidden = false;
  marcarRotulo();
  posicionar();
  nome.focus();
  nome.select();
}

export function fecharEditorDeZona() {
  if (!idAberto) return;
  idAberto = null;
  campos = null;
  if (raiz.contains(document.activeElement)) document.activeElement.blur();
  raiz.hidden = true;
  raiz.replaceChildren();
  encerrarAgrupamento();
  marcarRotulo();
}

/** Cria a zona, leva a tela até ela e abre o editor já com o nome selecionado. */
function criarZonaAoLado(idAnterior) {
  const novo = criarZonaDepoisDe(idAnterior);
  if (!novo) return;
  const zona = geometria().porId.get(novo);
  const area = areaUtil();
  const centroY = telaParaMundo(area.x + area.largura / 2, area.y + area.altura / 2).Y;
  irPara({ X: (zona.inicio + zona.fim) / 2, Y: centroY }, obterCamera().escala, { animar: false });
  // Os nomes das zonas são refeitos no próximo quadro; o editor abre depois.
  requestAnimationFrame(() => abrirEditorDeZona(novo));
}

/** Atualiza os campos quando os dados mudam por fora (ex.: desfazer). */
function sincronizar() {
  const zona = obterDados().zonas.find((z) => z.id === idAberto);
  if (!zona) {
    fecharEditorDeZona();
    return;
  }
  const ativo = document.activeElement;
  if (ativo !== campos.nome && campos.nome.value !== zona.nome) campos.nome.value = zona.nome;
  if (ativo !== campos.detalhe && campos.detalhe.value !== zona.detalhe) campos.detalhe.value = zona.detalhe;
  campos.excluir.disabled = obterDados().zonas.length < 2;
  // Os nomes são refeitos por js/fundo.js no próximo quadro; depois disso, a
  // janelinha se reposiciona embaixo do nome certo.
  requestAnimationFrame(() => {
    if (!idAberto) return;
    marcarRotulo();
    posicionar();
  });
}

function rotuloDaZona(id) {
  for (const rotulo of camadaRotulos.querySelectorAll('.rotulo-zona')) {
    if (rotulo.dataset.zona === id) return rotulo;
  }
  return null;
}

/** Destaca o nome da zona que está aberta no editor. */
function marcarRotulo() {
  for (const rotulo of camadaRotulos.querySelectorAll('.rotulo-zona')) {
    rotulo.classList.toggle('editando', rotulo.dataset.zona === idAberto);
  }
}

/** A janelinha fica logo abaixo do nome da zona (ou no alto da tela, se ele não aparece). */
function posicionar() {
  const rotulo = rotuloDaZona(idAberto);
  const area = areaUtil();
  const largura = raiz.offsetWidth;
  let centro = area.x + area.largura / 2;
  let topo = area.y + 40;
  if (rotulo && !rotulo.classList.contains('oculto')) {
    const r = rotulo.getBoundingClientRect();
    centro = r.left + r.width / 2;
    topo = r.bottom + 10;
  }
  const esquerda = limitar(centro - largura / 2, 8, Math.max(8, window.innerWidth - largura - 8));
  raiz.style.transform = `translate(${Math.round(esquerda)}px, ${Math.round(topo)}px)`;
}

// --- Largura: arrastar a marca do limite ----------------------------------------------

function aoPressionarMarca(evento) {
  if (!podeEditar() || !evento.target.closest('.rotulo-zona, .alca-zona')) return;
  // O mapa (js/interacao.js) não deve tratar isto como um clique no fundo.
  evento.stopPropagation();
  const alca = evento.target.closest('.alca-zona');
  if (!alca || evento.button !== 0) return;
  const id = alca.dataset.zona;
  const zona = obterDados().zonas.find((z) => z.id === id);
  if (!zona || !iniciarGesto('Mudar largura da zona')) return;
  evento.preventDefault();
  arrasto = { id, alca, ponteiro: evento.pointerId, larguraInicial: zona.largura, xInicial: telaParaMundo(evento.clientX, 0).X };
  try {
    alca.setPointerCapture(evento.pointerId);
  } catch {
    /* ponteiro já solto: o arrasto segue sem a captura */
  }
  alca.classList.add('arrastando');
  document.body.classList.add('redimensionando-zona');
}

function aoMoverMarca(evento) {
  if (!arrasto || evento.pointerId !== arrasto.ponteiro) return;
  // O início da zona não se mexe enquanto ela muda de largura; por isso a
  // diferença em X do cursor, no mundo, é a diferença de largura.
  const pedida = arrasto.larguraInicial + (telaParaMundo(evento.clientX, 0).X - arrasto.xInicial);
  const { id } = arrasto;
  const dados = obterDados();
  const nova = larguraPermitidaDaZona(dados, id, pedida);
  // Sem mudança de fato (ex.: já no limite), nada é alterado.
  if (nova === dados.zonas.find((z) => z.id === id)?.largura) return;
  alterarDuranteGesto((d) => {
    const zona = d.zonas.find((z) => z.id === id);
    if (zona) zona.largura = nova;
  });
}

function aoSoltarMarca(evento) {
  if (!arrasto || evento.pointerId !== arrasto.ponteiro) return;
  encerrarArrasto();
  concluirGesto(); // se a largura não mudou, nada entra no desfazer
}

function encerrarArrasto() {
  arrasto.alca.classList.remove('arrastando');
  document.body.classList.remove('redimensionando-zona');
  arrasto = null;
}
