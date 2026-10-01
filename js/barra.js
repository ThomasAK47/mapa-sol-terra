// =============================================================================
// barra.js — barra de ferramentas, indicador de salvamento, menu de opções e
// atalhos de teclado.
// =============================================================================

import { criarCard, definirEscalaDosCards, enquadrarTudo, excluirCard } from './acoes.js';
import { janelaAberta, toast } from './avisos.js';
import { focarCampoDeBusca } from './busca.js';
import { areaUtil, definirModoRoda, obterModoRoda, telaParaMundo } from './camera.js';
import { editorDeConexaoAberto, fecharEditorConexao } from './editor-conexao.js';
import { aoMudarEfeitos, definirEfeitos, efeitosLigados } from './efeitos.js';
import {
  assinar, desfazer, encerrarAgrupamento, obterDados, podeDesfazer, podeEditar, podeRefazer, refazer,
  selecionar, ui,
} from './estado.js';
import { hierarquia } from './hierarquia.js';
import { cancelarGestoAtual } from './interacao.js';
import { animacaoAberta, fecharAnimacao } from './janela-animacao.js';
import { abrirPainel, fecharPainel, painelAberto } from './painel.js';
import { definirIndicador, exportar, importar, salvarAgora } from './persistencia.js';
import { digitandoEmCampo, icone } from './util.js';
import { editorDeZonaAberto, fecharEditorDeZona } from './zonas.js';

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

  // Barra do tamanho de todos os cards (o valor fica gravado no mapa).
  const barraTamanho = document.getElementById('tamanho-cards');
  const valorTamanho = document.getElementById('tamanho-cards-valor');
  const botaoTamanhoNormal = document.getElementById('tamanho-cards-normal');
  const mostrarTamanho = () => {
    const porcento = Math.round((obterDados()?.escalaDosCards ?? 1) * 100);
    if (Number(barraTamanho.value) !== porcento) barraTamanho.value = String(porcento);
    valorTamanho.textContent = `${porcento}%`;
    botaoTamanhoNormal.disabled = porcento === 100;
  };
  barraTamanho.addEventListener('input', () => definirEscalaDosCards(Number(barraTamanho.value) / 100));
  barraTamanho.addEventListener('change', encerrarAgrupamento);
  botaoTamanhoNormal.addEventListener('click', () => {
    encerrarAgrupamento();
    definirEscalaDosCards(1);
    encerrarAgrupamento();
  });
  assinar((mudanca) => {
    if (mudanca.tipo !== 'selecao' && mudanca.tipo !== 'gesto') mostrarTamanho();
  });

  // Botão dos efeitos animados (vento solar, coroa do Sol, flutuação dos cards).
  const botaoEfeitos = document.getElementById('bt-efeitos');
  const mostrarEfeitos = () => {
    const ligados = efeitosLigados();
    botaoEfeitos.replaceChildren(icone(ligados ? 'efeitos' : 'efeitos-desligados'));
    botaoEfeitos.setAttribute('aria-pressed', String(ligados));
    botaoEfeitos.title = ligados
      ? 'Efeitos animados ligados (vento solar, brilho do Sol e flutuação dos cards). Clique para desligar e deixar o mapa mais leve.'
      : 'Efeitos animados desligados. Clique para ligar.';
  };
  botaoEfeitos.addEventListener('click', () => {
    definirEfeitos(!efeitosLigados());
    toast(efeitosLigados() ? 'Efeitos animados ligados.' : 'Efeitos animados desligados: o mapa fica mais leve.', { duracao: 2600 });
  });
  aoMudarEfeitos(mostrarEfeitos);
  mostrarEfeitos();

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
  if (animacaoAberta()) {
    // Com a animação aberta, os atalhos do mapa ficam desligados (um Delete
    // não pode excluir o card que ficou selecionado atrás da janela).
    if (tecla === 'Escape') fecharAnimacao();
    return;
  }
  if (ctrl && letra === 'f') {
    evento.preventDefault(); // usa a busca do mapa, e não a do navegador
    focarCampoDeBusca();
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

  if ((tecla === 'Delete' || tecla === 'Backspace') && ui.selecionado && podeEditar() &&
      hierarquia().visiveis.has(ui.selecionado)) {
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
  if (editorDeZonaAberto()) {
    fecharEditorDeZona();
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
