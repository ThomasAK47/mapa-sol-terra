// =============================================================================
// editor-conexao.js — janelinha para ler e editar uma conexão.
//
// Abre ao clicar no texto de uma conexão (ou logo depois de criá-la, com o
// campo de texto pronto para digitar). Fica presa ao meio da curva, mesmo
// que o mapa se mova.
//   • Modo de edição: texto, inverter a direção, com/sem seta, excluir.
//     Enter confirma; Esc numa conexão recém-criada cancela a criação.
//   • Modo somente leitura: o texto completo.
// =============================================================================

import {
  definirDirecional, descartarConexaoNova, editarTextoDaConexao, excluirConexao, inverterConexao,
} from './acoes.js';
import { aoMudarCamera, areaUtil, irPara, mundoParaTela, obterCamera } from './camera.js';
import { renderizarAgora } from './cards.js';
import { pontoDoRotulo } from './conexoes.js';
import {
  assinar, buscarCard, buscarConexao, definirConexaoAberta, encerrarAgrupamento, podeEditar,
} from './estado.js';
import { el, icone, limitar } from './util.js';

let raiz = null;
let idAberto = null;
let nova = false;         // conexão recém-criada (Esc cancela)
let campos = null;        // campos do modo de edição

export function iniciarEditorConexao(elemento) {
  raiz = elemento;
  raiz.addEventListener('keydown', aoTeclar);
  assinar((mudanca) => {
    if (idAberto && mudanca.tipo !== 'gesto' && mudanca.tipo !== 'selecao') sincronizar();
  });
  aoMudarCamera(posicionar);
  // Clicar fora fecha (mas não ao clicar numa janela de confirmação ou no
  // texto de outra conexão, que abre o editor dela).
  document.addEventListener('pointerdown', (evento) => {
    if (!idAberto || raiz.contains(evento.target)) return;
    if (evento.target.closest?.('#dialogo, .rotulo-conexao')) return;
    fecharEditorConexao();
  }, true);
}

/** Id da conexão aberta no editor (ou null). */
export function editorDeConexaoAberto() {
  return idAberto;
}

export function abrirEditorConexao(id, { nova: ehNova = false } = {}) {
  if (!buscarConexao(id)) return;
  if (idAberto && idAberto !== id) fecharEditorConexao();
  idAberto = id;
  nova = ehNova;
  definirConexaoAberta(id);       // modo foco na conexão
  construir();
  raiz.hidden = false;
  renderizarAgora();              // garante que o meio da curva já foi calculado
  garantirVisivel();
  posicionar();
  if (campos) {
    campos.texto.focus();
    campos.texto.setSelectionRange(campos.texto.value.length, campos.texto.value.length);
  }
}

/** Fecha o editor. Com "cancelar", uma conexão recém-criada é descartada. */
export function fecharEditorConexao({ cancelar = false } = {}) {
  if (!idAberto) return;
  const id = idAberto;
  const eraNova = nova;
  idAberto = null;
  nova = false;
  campos = null;
  raiz.hidden = true;
  raiz.replaceChildren();
  if (cancelar && eraNova) descartarConexaoNova(id);
  encerrarAgrupamento();
  definirConexaoAberta(null);
}

function aoTeclar(evento) {
  if (evento.key !== 'Escape') return;
  evento.preventDefault();
  evento.stopPropagation(); // o Esc não deve também fechar o painel ou desmarcar o card
  fecharEditorConexao({ cancelar: true });
}

// --- Conteúdo -------------------------------------------------------------------

function tituloDoCard(id) {
  return buscarCard(id)?.titulo.trim() || 'sem título';
}

function cabecalho(conexao) {
  return el('div', { class: 'editor-conexao-cabecalho' },
    el('strong', { title: tituloDoCard(conexao.de) }, tituloDoCard(conexao.de)),
    el('span', { class: 'sentido', 'aria-label': conexao.direcional ? 'para' : 'e' }, conexao.direcional ? '→' : '—'),
    el('strong', { title: tituloDoCard(conexao.para) }, tituloDoCard(conexao.para)),
  );
}

function construir() {
  const conexao = buscarConexao(idAberto);
  campos = null;
  if (!conexao) return;
  if (!podeEditar()) {
    const texto = conexao.texto.trim();
    raiz.replaceChildren(
      cabecalho(conexao),
      texto
        ? el('p', { class: 'editor-conexao-texto' }, texto)
        : el('p', { class: 'leitura-vazia' }, 'Sem explicação.'),
      el('div', { class: 'editor-conexao-acoes' },
        el('span', { class: 'espaco' }),
        el('button', { class: 'botao botao-contorno botao-pequeno', type: 'button', onclick: () => fecharEditorConexao() }, 'Fechar'),
      ),
    );
    return;
  }

  const id = conexao.id;
  const texto = el('textarea', {
    class: 'entrada', rows: 3, maxlength: 2000, 'aria-label': 'Texto da conexão',
    placeholder: 'Por que estes assuntos se relacionam?',
  });
  texto.value = conexao.texto;
  texto.addEventListener('input', () => editarTextoDaConexao(id, texto.value, { nova }));
  texto.addEventListener('change', () => {
    const aparado = texto.value.trim();
    if (aparado !== texto.value) {
      texto.value = aparado;
      editarTextoDaConexao(id, aparado, { nova });
    }
  });
  texto.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter' && !evento.shiftKey) { // Shift+Enter quebra a linha
      evento.preventDefault();
      fecharEditorConexao();
    }
  });

  const seta = el('input', { type: 'checkbox' });
  seta.checked = conexao.direcional;
  seta.addEventListener('change', () => definirDirecional(id, seta.checked, { nova }));

  const inverter = el('button', {
    class: 'botao botao-contorno botao-pequeno', type: 'button', title: 'Trocar o sentido da seta',
    onclick: () => inverterConexao(id, { nova }),
  }, icone('inverter'), 'Inverter');
  inverter.disabled = !conexao.direcional;

  const titulo = el('div', {});
  titulo.append(cabecalho(conexao));

  raiz.replaceChildren(
    titulo,
    texto,
    el('div', { class: 'editor-conexao-acoes' },
      el('label', { class: 'interruptor', title: 'Com seta, a conexão tem direção (de → para)' }, seta, 'Com seta'),
      inverter,
      el('span', { class: 'espaco' }),
      el('button', {
        class: 'botao botao-contorno botao-pequeno', type: 'button', title: 'Excluir esta conexão',
        'aria-label': 'Excluir conexão', onclick: aoExcluir,
      }, icone('lixeira')),
      el('button', { class: 'botao botao-principal botao-pequeno', type: 'button', onclick: () => fecharEditorConexao() }, 'OK'),
    ),
  );
  campos = { titulo, texto, seta, inverter };
}

async function aoExcluir() {
  const id = idAberto;
  if (nova) {
    fecharEditorConexao({ cancelar: true }); // recém-criada: só descarta
    return;
  }
  if (await excluirConexao(id)) fecharEditorConexao();
}

/** Atualiza o editor quando os dados mudam por fora (ex.: desfazer). */
function sincronizar() {
  const conexao = buscarConexao(idAberto);
  if (!conexao) {
    fecharEditorConexao();
    return;
  }
  if (!campos) {
    construir();
    posicionar();
    return;
  }
  campos.titulo.replaceChildren(cabecalho(conexao));
  if (document.activeElement !== campos.texto && campos.texto.value !== conexao.texto) campos.texto.value = conexao.texto;
  campos.seta.checked = conexao.direcional;
  campos.inverter.disabled = !conexao.direcional;
  posicionar();
}

// --- Posição ----------------------------------------------------------------------

/** Se o meio da conexão estiver fora da tela, leva a câmera até lá. */
function garantirVisivel() {
  const ponto = pontoDoRotulo(idAberto);
  if (!ponto) return;
  const tela = mundoParaTela(ponto.X, ponto.Y);
  const area = areaUtil();
  const folga = 60;
  const visivel = tela.x > area.x + folga && tela.x < area.x + area.largura - folga &&
                  tela.y > area.y + folga && tela.y < area.y + area.altura - folga;
  if (!visivel) irPara(ponto, obterCamera().escala);
}

/**
 * Coloca a janelinha logo abaixo (ou acima) do meio da conexão. Uma conexão
 * sem linha na tela (entre cards escondidos no mesmo grupo recolhido) abre
 * no alto da área visível.
 */
function posicionar() {
  if (!idAberto) return;
  const ponto = pontoDoRotulo(idAberto);
  const area = areaUtil();
  const tela = ponto ? mundoParaTela(ponto.X, ponto.Y) : { x: area.x + area.largura / 2, y: area.y + area.altura * 0.25 };
  const largura = raiz.offsetWidth;
  const altura = raiz.offsetHeight;
  let x = tela.x - largura / 2;
  let y = tela.y + 18;
  if (y + altura > area.y + area.altura - 8) y = tela.y - altura - 18; // sem espaço embaixo: vai para cima
  x = limitar(x, area.x + 8, Math.max(area.x + 8, area.x + area.largura - largura - 8));
  y = limitar(y, area.y + 8, Math.max(area.y + 8, area.y + area.altura - altura - 8));
  raiz.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}
