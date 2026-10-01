// =============================================================================
// principal.js — ponto de partida do app. Liga os módulos na ordem certa:
//   1. prepara a tela (câmera, fundo, cards, painel, barra…);
//   2. descobre o modo:
//        • edição       — o servidor local (iniciar.py) está respondendo;
//        • leitura      — sem servidor (ex.: GitHub Pages) ou arquivo com erro;
//        • teste        — endereço com ?teste (dados fictícios, nada é salvo);
//   3. carrega os dados (e recupera alterações guardadas, se houver);
//   4. posiciona a câmera.
// =============================================================================

import * as acoes from './acoes.js';
import * as animacoes from './animacoes.js';
import { iniciarAvisos, mostrarFaixa, toast } from './avisos.js';
import { iniciarBarra } from './barra.js';
import * as busca from './busca.js';
import * as camera from './camera.js';
import { iniciarCards, renderizarAgora } from './cards.js';
import { iniciarConexoes } from './conexoes.js';
import * as editorConexao from './editor-conexao.js';
import * as estado from './estado.js';
import { iniciarFundo } from './fundo.js';
import * as hierarquia from './hierarquia.js';
import { iniciarInteracao } from './interacao.js';
import * as janelaAnimacao from './janela-animacao.js';
import { dadosVazios, ErroVersaoFutura, migrar, normalizar, VERSAO_ATUAL } from './modelo.js';
import { iniciarPainel } from './painel.js';
import * as persistencia from './persistencia.js';
import { gerarDadosDeTeste, iniciarMedidorDeQuadros, medirPanZoom } from './teste.js';
import { limitar } from './util.js';

async function iniciarApp() {
  const parametros = new URLSearchParams(location.search);
  const quantidadeTeste = parametros.has('teste')
    ? limitar(Number.parseInt(parametros.get('teste'), 10) || 150, 1, 3000)
    : null;

  // 1. Tela
  const palco = document.getElementById('palco');
  iniciarAvisos();
  camera.iniciarCamera(palco, document.getElementById('mundo'), { guardarPosicao: quantidadeTeste === null });
  iniciarFundo(document.getElementById('fundo'), document.getElementById('rotulos-zonas'));
  iniciarCards(document.getElementById('camada-cards'), palco);
  iniciarConexoes({
    elementoFamilia: document.getElementById('linhas-familia'),
    elementoLinhas: document.getElementById('linhas-conexoes'),
    elementoRedirecionadas: document.getElementById('linhas-redirecionadas'),
    elementoRascunho: document.getElementById('rascunho-conexao'),
    elementoRotulos: document.getElementById('camada-rotulos-conexoes'),
  });
  iniciarInteracao(palco);
  iniciarPainel(document.getElementById('painel'));
  editorConexao.iniciarEditorConexao(document.getElementById('editor-conexao'));
  janelaAnimacao.iniciarJanelaAnimacao(document.getElementById('janela-animacao'));
  busca.iniciarBusca(document.getElementById('campo-busca'), document.getElementById('contador-busca'));
  iniciarBarra();
  persistencia.iniciarPersistencia();
  estado.definirAoAlterar(persistencia.marcarAlterado);
  animacoes.iniciarAnimacoes(); // lê animacoes/manifesto.json sem esperar (o mapa não depende dele)

  // Ferramentas para investigar problemas pelo console do navegador (F12).
  window.mapaDepuracao = {
    estado, camera, persistencia, acoes, editorConexao, hierarquia, busca, animacoes, janelaAnimacao, medirPanZoom,
  };

  // 2 e 3. Modo e dados
  let dados;
  let avisos = [];
  if (quantidadeTeste !== null) {
    definirModo('teste');
    dados = gerarDadosDeTeste(quantidadeTeste);
    iniciarMedidorDeQuadros();
    mostrarFaixa('modo-teste', {
      titulo: 'Modo de teste.',
      mensagem: `${quantidadeTeste} cards e ${quantidadeTeste * 2} conexões fictícios; nada é salvo. ` +
                'Para voltar ao seu mapa, tire "?teste" do endereço.',
      tipo: 'info',
    });
  } else {
    definirModo((await persistencia.detectarServidor()) ? 'edicao' : 'leitura');
    ({ dados, avisos } = await carregarDados());
  }

  estado.iniciar(dados);
  renderizarAgora();

  // 4. Câmera: volta para onde estava na última visita ou enquadra tudo.
  if (!camera.restaurarCamera()) acoes.enquadrarTudo({ animar: false });

  window.__mapaIniciado = true;
  document.body.classList.remove('carregando');
  setTimeout(() => document.getElementById('tela-inicial')?.remove(), 400);

  if (avisos.length) {
    const linhas = [...avisos];
    if (estado.ui.modo === 'edicao') {
      linhas.push('O arquivo original será guardado em data/backups antes da próxima gravação.');
      persistencia.pedirBackupAntesDaProximaGravacao('antes-de-reparo');
    }
    mostrarFaixa('avisos-arquivo', { titulo: 'O arquivo de dados precisou de ajustes:', detalhes: linhas, tipo: 'info' });
  }
  if (estado.ui.modo === 'edicao') await persistencia.verificarReserva(dados);
}

function definirModo(modo) {
  estado.ui.modo = modo;
  document.body.classList.toggle('somente-leitura', modo === 'leitura');
  document.body.classList.toggle('modo-teste', modo === 'teste');
  persistencia.atualizarIndicador();
}

/** Lê e prepara data/estudos.json. Devolve { dados, avisos }. */
async function carregarDados() {
  const lido = await persistencia.lerArquivoDeDados();

  if (lido.tipo === 'ok') {
    const versaoOriginal = lido.bruto?.versao;
    try {
      const resultado = normalizar(migrar(lido.bruto));
      persistencia.definirVersaoArquivo(lido.versao);
      if (Number.isInteger(versaoOriginal) && versaoOriginal < VERSAO_ATUAL) {
        persistencia.pedirBackupAntesDaProximaGravacao('antes-de-migrar');
      }
      return resultado;
    } catch (erro) {
      if (erro instanceof ErroVersaoFutura) {
        definirModo('leitura');
        mostrarFaixa('versao-futura', {
          titulo: 'Arquivo de uma versão mais nova do app.',
          mensagem: `${erro.message} O mapa abriu só para leitura, para não gravar por cima num formato ` +
                    'antigo. Atualize os arquivos do app (por exemplo, com git pull).',
          tipo: 'erro',
          fechavel: false,
        });
        try {
          return { dados: normalizar(lido.bruto).dados, avisos: [] }; // melhor esforço, só para ver
        } catch {
          return { dados: dadosVazios(), avisos: [] };
        }
      }
      bloquear(`O arquivo data/estudos.json não tem o formato do mapa (${erro.message}).`);
      return { dados: dadosVazios(), avisos: [] };
    }
  }

  if (lido.tipo === 'inexistente') {
    persistencia.definirVersaoArquivo('novo');
    if (estado.ui.modo === 'edicao') {
      toast('Ainda não existe data/estudos.json: ele será criado na primeira alteração.', { duracao: 6000 });
    } else {
      mostrarFaixa('sem-dados', { titulo: 'Sem dados.', mensagem: 'O arquivo data/estudos.json não foi encontrado.' });
    }
    return { dados: dadosVazios(), avisos: [] };
  }

  if (lido.tipo === 'json-invalido') {
    const onde = lido.linha ? ` perto da linha ${lido.linha}, coluna ${lido.coluna}` : '';
    bloquear(`O arquivo data/estudos.json tem um erro de formatação${onde}. Corrija o arquivo (ou copie ` +
             'de volta uma versão de data/backups) e recarregue a página. Até lá, nada será salvo.');
    return { dados: dadosVazios(), avisos: [] };
  }

  bloquear('Não consegui ler o arquivo data/estudos.json. Recarregue a página; se continuar, feche e abra ' +
           'de novo o iniciar.bat. Até lá, nada será salvo.');
  return { dados: dadosVazios(), avisos: [] };
}

/** Abre só para leitura, com um aviso que não pode ser fechado. */
function bloquear(mensagem) {
  definirModo('leitura');
  mostrarFaixa('erro-leitura', {
    titulo: 'O mapa abriu só para leitura.',
    mensagem,
    tipo: 'erro',
    fechavel: false,
    acoes: [{ rotulo: 'Recarregar', aoClicar: () => location.reload() }],
  });
}

iniciarApp().catch((erro) => {
  console.error(erro);
  window.__mapaIniciado = true;
  const mensagem = `Algo deu errado ao iniciar o mapa: ${erro?.message ?? erro}. Recarregue a página (F5).`;
  if (document.body.classList.contains('carregando')) {
    const caixa = document.getElementById('tela-inicial-texto');
    if (caixa) caixa.textContent = mensagem;
    document.body.classList.add('falha-ao-iniciar');
  } else {
    mostrarFaixa('erro-fatal', { titulo: 'Erro.', mensagem, tipo: 'erro' });
  }
});
