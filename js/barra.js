// =============================================================================
// barra.js — barra de ferramentas, indicador de salvamento, menu de opções e
// atalhos de teclado.
// =============================================================================

import { criarCard, enquadrarTudo, excluirCard } from './acoes.js';
import { janelaAberta, toast } from './avisos.js';
import { areaUtil, definirModoRoda, obterModoRoda, telaParaMundo } from './camera.js';
import { editorDeConexaoAberto, fecharEditorConexao } from './editor-conexao.js';
import {
  assinar, desfazer, podeDesfazer, podeEditar, podeRefazer, refazer, selecionar, ui,
} from './estado.js';
import { cancelarGestoAtual } from './interacao.js';
import { abrirPainel, fecharPainel, painelAberto } from './painel.js';
import { definirIndicador, exportar, importar, salvarAgora } from './persistencia.js';
import { digitandoEmCampo, icone } from './util.js';

const TEXTOS_DO_STATUS = {
  salvo: 'salvo',
  salvando: 'salvando…',
  erro: 'erro ao salvar',
  conflito: 'conflito ao salvar',
  teste: 'teste: nada é salvo',
  leitura: '',
};

const DICAS_DO_STATUS = {
  salvo: 'Tudo gravado em data/estudos.json',
  salvando: 'Gravando em data/estudos.json…',
  erro: 'A última gravação falhou. As alterações estão guardadas neste navegador e serão reenviadas.',
  conflito: 'O arquivo mudou fora desta aba. Escolha qual versão manter.',
  teste: 'Modo de teste: os dados são fictícios e nada é gravado.',
  leitura: '',
};

const NOMES_DO_MODO_DA_RODA = {
  auto: 'automático (roda do mouse = zoom, dois dedos = mover)',
  zoom: 'sempre zoom',
  mover: 'sempre mover (zoom com pinça ou Ctrl + roda)',
};

let status = null;
let textoStatus = null;
let botaoDesfazer = null;
let botaoRefazer = null;
let menuOpcoes = null;
let botaoOpcoes = null;
let novosNoCentro = 0;

export function iniciarBarra() {
  for (const botao of document.querySelectorAll('[data-icone]')) botao.prepend(icone(botao.dataset.icone));

  status = document.getElementById('status-salvamento');
  textoStatus = status.querySelector('.status-texto');
  botaoDesfazer = document.getElementById('bt-desfazer');
  botaoRefazer = document.getElementById('bt-refazer');
  menuOpcoes = document.getElementById('menu-opcoes');
  botaoOpcoes = document.getElementById('bt-opcoes');

  document.getElementById('bt-novo').addEventListener('click', criarCardNoCentro);
  document.getElementById('bt-enquadrar').addEventListener('click', () => enquadrarTudo());
  botaoDesfazer.addEventListener('click', executarDesfazer);
  botaoRefazer.addEventListener('click', executarRefazer);
  document.getElementById('bt-exportar').addEventListener('click', exportar);

  const entradaImportar = document.getElementById('entrada-importar');
  document.getElementById('bt-importar').addEventListener('click', () => entradaImportar.click());
  entradaImportar.addEventListener('change', async () => {
    const arquivo = entradaImportar.files?.[0];
    entradaImportar.value = ''; // permite escolher o mesmo arquivo de novo
    if (arquivo) await importar(arquivo);
  });

  // Menu de opções.
  botaoOpcoes.addEventListener('click', () => alternarMenu());
  document.addEventListener('pointerdown', (evento) => {
    if (!menuOpcoes.hidden && !menuOpcoes.contains(evento.target) && !botaoOpcoes.contains(evento.target)) alternarMenu(false);
  });
  for (const opcao of menuOpcoes.querySelectorAll('input[name="roda"]')) {
    opcao.checked = opcao.value === obterModoRoda();
    opcao.addEventListener('change', () => {
      definirModoRoda(opcao.value);
      toast(`Roda do mouse e touchpad: ${NOMES_DO_MODO_DA_RODA[opcao.value]}.`);
    });
  }

  definirIndicador(mostrarStatus);
  assinar(atualizarBotoesDoHistorico);
  atualizarBotoesDoHistorico();
  document.addEventListener('keydown', aoTeclar);
}

function mostrarStatus(estado) {
  status.dataset.estado = estado;
  textoStatus.textContent = TEXTOS_DO_STATUS[estado] ?? estado;
  status.title = DICAS_DO_STATUS[estado] ?? '';
}

function atualizarBotoesDoHistorico() {
  botaoDesfazer.disabled = !podeDesfazer();
  botaoRefazer.disabled = !podeRefazer();
}

function alternarMenu(abrir = menuOpcoes.hidden) {
  menuOpcoes.hidden = !abrir;
  botaoOpcoes.setAttribute('aria-expanded', String(abrir));
}

function criarCardNoCentro() {
  const area = areaUtil();
  const { X, Y } = telaParaMundo(area.x + area.largura / 2, area.y + area.altura / 2);
  const deslocamento = (novosNoCentro++ % 5) * 28; // cliques seguidos não empilham cards
  const id = criarCard(X + deslocamento, Y + deslocamento);
  if (id) abrirPainel(id, { novo: true });
}

function executarDesfazer() {
  const rotulo = desfazer();
  toast(rotulo ? `Desfeito: ${rotulo}` : 'Nada para desfazer.', { duracao: 2200 });
}

function executarRefazer() {
  const rotulo = refazer();
  toast(rotulo ? `Refeito: ${rotulo}` : 'Nada para refazer.', { duracao: 2200 });
}

// --- Atalhos de teclado ---------------------------------------------------------

function aoTeclar(evento) {
  if (janelaAberta()) return; // a janela de confirmação cuida das próprias teclas
  const tecla = evento.key;
  const letra = tecla.length === 1 ? tecla.toLowerCase() : '';
  const ctrl = evento.ctrlKey || evento.metaKey;

  if (ctrl && letra === 's') {
    evento.preventDefault(); // impede o "Salvar página como" do navegador
    salvarAgora();
    return;
  }
  if (tecla === 'Escape') {
    aoApertarEsc();
    return;
  }
  if (digitandoEmCampo()) return; // dentro de um campo, Ctrl+Z desfaz o texto

  if (ctrl && letra === 'z' && !evento.shiftKey) {
    evento.preventDefault();
    executarDesfazer();
    return;
  }
  if (ctrl && ((letra === 'z' && evento.shiftKey) || letra === 'y')) {
    evento.preventDefault();
    executarRefazer();
    return;
  }
  if (ctrl || evento.altKey) return;

  // Teclas simples não valem quando o foco está num botão ou link (o Enter
  // ali já "clica" no botão), nem com o editor de conexão aberto.
  if (evento.target instanceof Element && evento.target.closest('button, a, [role="button"]')) return;
  if (editorDeConexaoAberto()) return;

  if ((tecla === 'Delete' || tecla === 'Backspace') && ui.selecionado && podeEditar()) {
    evento.preventDefault();
    excluirCard(ui.selecionado);
  } else if (tecla === 'Enter' && ui.selecionado) {
    evento.preventDefault();
    abrirPainel(ui.selecionado);
  } else if (letra === 'f') {
    evento.preventDefault();
    enquadrarTudo();
  }
}

function aoApertarEsc() {
  if (cancelarGestoAtual()) return;
  if (editorDeConexaoAberto()) {
    fecharEditorConexao({ cancelar: true });
    return;
  }
  if (!menuOpcoes.hidden) {
    alternarMenu(false);
    return;
  }
  if (digitandoEmCampo()) document.activeElement.blur();
  if (painelAberto()) {
    fecharPainel();
    return;
  }
  if (ui.selecionado) selecionar(null);
}
