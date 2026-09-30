// =============================================================================
// persistencia.js — ler e gravar os dados.
//
//   • Leitura: data/estudos.json (e a descoberta do modo: se o servidor local
//     responde em api/status, dá para editar; senão, só leitura).
//   • Salvamento automático: ~1 s depois da última alteração, a página envia
//     tudo para o servidor (POST api/salvar), que grava no arquivo.
//   • Reserva: se o servidor estiver fechado, as alterações ficam guardadas
//     no navegador (localStorage) e são reenviadas quando ele voltar.
//   • Conflito: se o arquivo mudou por fora (outra aba, edição à mão, git),
//     o servidor recusa gravar e o app pergunta qual versão manter.
//   • Exportar / importar JSON.
// =============================================================================

import { alertar, confirmar, escolher, mostrarFaixa, removerFaixa, toast } from './avisos.js';
import { obterDados, substituirTudo, ui } from './estado.js';
import { ErroVersaoFutura, migrar, normalizar } from './modelo.js';
import { baixarArquivo, carimboParaArquivo, formatarDataHora, local, plural, PREFIXO_LOCAL } from './util.js';

const ESPERA_SALVAR_MS = 1000;
const CHAVE_RESERVA = PREFIXO_LOCAL + 'reserva';

let versaoArquivo = null;      // versão (resumo) do arquivo que esta página conhece
let pendente = false;          // há alterações ainda não gravadas
let salvando = false;
let salvarDeNovo = false;
let bloqueado = false;         // conflito sendo resolvido: não salvar
let emFalha = false;           // a última tentativa falhou
let mensagemDaFalha = null;
let motivoBackup = null;       // pede ao servidor um backup antes da próxima gravação
let recarregando = false;
let temporizadorSalvar = null;
let temporizadorNovaTentativa = null;
let esperaNovaTentativa = 3000;
let indicador = () => {};

// --- Leitura ------------------------------------------------------------------------

/** true se o servidor local do mapa (iniciar.py) está respondendo. */
export async function detectarServidor() {
  try {
    const resposta = await fetch('api/status', { cache: 'no-store' });
    if (!resposta.ok) return false;
    const conteudo = await resposta.json();
    return conteudo?.app === 'mapa-sol-terra';
  } catch {
    return false;
  }
}

/**
 * Lê data/estudos.json. Devolve um objeto com "tipo":
 *   'ok' (com bruto e versao), 'inexistente', 'json-invalido' (com linha e
 *   coluna), 'falha-rede' ou 'falha-http'.
 */
export async function lerArquivoDeDados() {
  let resposta;
  try {
    resposta = await fetch('data/estudos.json', { cache: 'no-store' });
  } catch (erro) {
    return { tipo: 'falha-rede', erro };
  }
  if (resposta.status === 404) return { tipo: 'inexistente' };
  if (!resposta.ok) return { tipo: 'falha-http', status: resposta.status };
  const texto = await resposta.text();
  const versao = resposta.headers.get('X-Versao-Arquivo');
  try {
    return { tipo: 'ok', bruto: JSON.parse(texto), versao };
  } catch (erro) {
    return { tipo: 'json-invalido', ...localizarErroJson(texto, erro) };
  }
}

/** Descobre linha e coluna de um erro de JSON (as mensagens variam por navegador). */
export function localizarErroJson(texto, erro) {
  const mensagem = String(erro?.message ?? erro);
  let encontrado = mensagem.match(/line (\d+) column (\d+)/i);
  if (encontrado) return { linha: Number(encontrado[1]), coluna: Number(encontrado[2]), mensagem };
  encontrado = mensagem.match(/position (\d+)/i);
  if (encontrado) {
    const posicao = Number(encontrado[1]);
    const antes = texto.slice(0, posicao);
    return { linha: antes.split('\n').length, coluna: posicao - antes.lastIndexOf('\n'), mensagem };
  }
  return { linha: null, coluna: null, mensagem };
}

/** Guarda a versão do arquivo que foi carregado ('novo' se ele não existia). */
export function definirVersaoArquivo(versao) {
  versaoArquivo = versao;
}

/** Pede ao servidor uma cópia de segurança antes da próxima gravação. */
export function pedirBackupAntesDaProximaGravacao(motivo) {
  motivoBackup = motivo;
}

// --- Indicador "salvo / salvando… / erro ao salvar" -----------------------------------

/** A barra de ferramentas registra aqui a função que mostra o estado. */
export function definirIndicador(funcao) {
  indicador = funcao;
  atualizarIndicador();
}

export function atualizarIndicador() {
  if (ui.modo === 'teste') indicador('teste');
  else if (ui.modo !== 'edicao') indicador('leitura');
  else if (bloqueado) indicador('conflito');
  else if (emFalha) indicador('erro');
  else if (pendente || salvando) indicador('salvando');
  else indicador('salvo');
}

// --- Salvamento automático ----------------------------------------------------------

export function iniciarPersistencia() {
  window.addEventListener('beforeunload', (evento) => {
    if (ui.modo !== 'edicao' || recarregando) return;
    if (pendente || salvando) {
      gravarReserva();          // garante que nada se perde
      evento.preventDefault();  // pede ao navegador para confirmar a saída
      evento.returnValue = '';
    }
  });
  const tentarAgora = () => {
    if (ui.modo === 'edicao' && pendente && !salvando && !bloqueado) salvarAgora();
  };
  window.addEventListener('online', tentarAgora);
  window.addEventListener('focus', tentarAgora);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tentarAgora();
    else if (pendente && ui.modo === 'edicao') gravarReserva();
  });
}

/** Chamado pelo estado a cada alteração: agenda a gravação. */
export function marcarAlterado() {
  if (ui.modo !== 'edicao') {
    atualizarIndicador();
    return;
  }
  pendente = true;
  atualizarIndicador();
  if (bloqueado) return;
  clearTimeout(temporizadorSalvar);
  temporizadorSalvar = setTimeout(salvarAgora, ESPERA_SALVAR_MS);
}

/** Envia os dados ao servidor agora (também usado pelo Ctrl+S). */
export async function salvarAgora() {
  clearTimeout(temporizadorSalvar);
  if (ui.modo !== 'edicao' || bloqueado) return;
  if (salvando) {
    salvarDeNovo = true;
    return;
  }
  if (!pendente) {
    atualizarIndicador();
    return;
  }
  salvando = true;
  pendente = false;
  salvarDeNovo = false;
  atualizarIndicador();

  const cabecalhos = { 'Content-Type': 'application/json', 'X-Versao-Base': versaoArquivo ?? 'novo' };
  if (motivoBackup) cabecalhos['X-Backup-Antes'] = motivoBackup;
  let resposta = null;
  let conteudo = {};
  try {
    resposta = await fetch('api/salvar', { method: 'POST', headers: cabecalhos, body: JSON.stringify(obterDados()) });
    conteudo = await resposta.json().catch(() => ({}));
  } catch {
    resposta = null; // servidor fechado ou inalcançável
  }
  salvando = false;

  if (resposta?.ok && conteudo.ok) {
    versaoArquivo = conteudo.versao;
    motivoBackup = null;
    local.apagar(CHAVE_RESERVA);
    sairDaFalha();
    if (pendente || salvarDeNovo) {
      clearTimeout(temporizadorSalvar);
      temporizadorSalvar = setTimeout(salvarAgora, 250);
    }
    atualizarIndicador();
    return;
  }

  pendente = true;
  if (resposta?.status === 409) {
    await resolverConflito();
    return;
  }
  entrarEmFalha(resposta ? (conteudo.mensagem || `O servidor respondeu com o erro ${resposta.status}.`) : null);
}

function gravarReserva() {
  if (ui.modo !== 'edicao' || !obterDados()) return false;
  return local.gravar(CHAVE_RESERVA, { dados: obterDados(), versaoBase: versaoArquivo, em: new Date().toISOString() });
}

function entrarEmFalha(mensagemDoServidor) {
  const guardou = gravarReserva();
  const primeiraVez = !emFalha;
  emFalha = true;
  atualizarIndicador();
  const mensagem = [
    mensagemDoServidor ?? 'Para religá-lo, dê dois cliques em iniciar.bat e deixe a janela preta aberta.',
    guardou
      ? 'Suas alterações estão guardadas neste navegador e serão enviadas assim que for possível.'
      : 'Não consegui guardar uma reserva neste navegador: use "Exportar JSON" para não perder nada.',
  ].join(' ');
  if (primeiraVez || mensagem !== mensagemDaFalha) {
    mensagemDaFalha = mensagem;
    mostrarFaixa('falha-salvar', {
      titulo: mensagemDoServidor ? 'Erro ao salvar.' : 'O servidor está desligado.',
      mensagem,
      tipo: 'erro',
      fechavel: false,
      acoes: [
        { rotulo: 'Tentar agora', aoClicar: () => salvarAgora() },
        { rotulo: 'Exportar JSON', aoClicar: exportar },
      ],
    });
  }
  clearTimeout(temporizadorNovaTentativa);
  temporizadorNovaTentativa = setTimeout(() => {
    if (pendente && !salvando) salvarAgora();
  }, esperaNovaTentativa);
  esperaNovaTentativa = Math.min(esperaNovaTentativa * 1.5, 30_000);
}

function sairDaFalha() {
  if (!emFalha) return;
  emFalha = false;
  mensagemDaFalha = null;
  esperaNovaTentativa = 3000;
  clearTimeout(temporizadorNovaTentativa);
  removerFaixa('falha-salvar');
  toast('Servidor de volta: tudo salvo no arquivo.');
}

function recarregarPagina() {
  recarregando = true;
  setTimeout(() => location.reload(), 900); // dá tempo de o download começar
}

async function resolverConflito() {
  if (bloqueado) return;
  bloqueado = true;
  clearTimeout(temporizadorSalvar);
  gravarReserva();
  atualizarIndicador();
  const escolha = await escolher({
    titulo: 'O arquivo de dados mudou fora desta aba',
    mensagem: 'Depois que esta página abriu, o arquivo data/estudos.json foi alterado por outra aba, ' +
              'por uma edição à mão ou pelo git. Qual versão você quer manter?',
    vertical: true,
    cancelavel: false,
    opcoes: [
      { id: 'pagina', rotulo: 'Manter a versão desta aba', detalhe: 'A versão atual do arquivo é guardada antes em data/backups.', estilo: 'principal' },
      { id: 'arquivo', rotulo: 'Usar a versão do arquivo', detalhe: 'As alterações desta aba são baixadas como .json, por segurança, e a página recarrega.' },
    ],
  });
  if (escolha === 'pagina') {
    bloqueado = false;
    versaoArquivo = 'forcar';
    pendente = true;
    await salvarAgora();
  } else {
    baixarArquivo(`mapa-sol-terra-alteracoes-desta-aba-${carimboParaArquivo()}.json`, `${JSON.stringify(obterDados(), null, 2)}\n`);
    local.apagar(CHAVE_RESERVA);
    recarregarPagina();
  }
}

// --- Reserva ao abrir a página --------------------------------------------------------

/**
 * Se houver alterações guardadas no navegador que não chegaram ao arquivo,
 * recupera. "dadosDoArquivo" são os dados já normalizados do arquivo.
 */
export async function verificarReserva(dadosDoArquivo) {
  const reserva = local.ler(CHAVE_RESERVA);
  if (!reserva || typeof reserva !== 'object' || !reserva.dados) return;
  let dadosDaReserva;
  try {
    dadosDaReserva = normalizar(migrar(structuredClone(reserva.dados))).dados;
  } catch {
    local.apagar(CHAVE_RESERVA);
    return;
  }
  if (JSON.stringify(dadosDaReserva) === JSON.stringify(dadosDoArquivo)) {
    local.apagar(CHAVE_RESERVA); // a reserva já tinha chegado ao arquivo
    return;
  }
  const quando = formatarDataHora(reserva.em);

  if (reserva.versaoBase === versaoArquivo) {
    // O arquivo não mudou desde então: a reserva é a continuação dele.
    substituirTudo(dadosDaReserva, 'Recuperar alterações guardadas');
    toast(`Recuperei as alterações de ${quando} que não tinham chegado ao arquivo.`, { duracao: 6000 });
    return;
  }

  const escolha = await escolher({
    titulo: 'Há alterações guardadas neste navegador',
    mensagem: `Alterações feitas em ${quando} não chegaram ao arquivo, e o arquivo data/estudos.json ` +
              'mudou depois disso. Qual versão você quer usar?',
    vertical: true,
    cancelavel: false,
    opcoes: [
      { id: 'reserva', rotulo: 'Usar as alterações guardadas', detalhe: 'A versão atual do arquivo é guardada antes em data/backups.', estilo: 'principal' },
      { id: 'arquivo', rotulo: 'Usar o arquivo', detalhe: 'As alterações guardadas são baixadas como .json, por segurança.' },
    ],
  });
  if (escolha === 'reserva') {
    versaoArquivo = 'forcar';
    substituirTudo(dadosDaReserva, 'Recuperar alterações guardadas');
  } else {
    baixarArquivo(`mapa-sol-terra-alteracoes-guardadas-${carimboParaArquivo()}.json`, `${JSON.stringify(dadosDaReserva, null, 2)}\n`);
    local.apagar(CHAVE_RESERVA);
  }
}

// --- Exportar e importar --------------------------------------------------------------

/** Baixa uma cópia do mapa atual como .json. */
export function exportar() {
  const dados = obterDados();
  if (!dados) return;
  baixarArquivo(`mapa-sol-terra-${carimboParaArquivo()}.json`, `${JSON.stringify(dados, null, 2)}\n`);
  toast('Cópia do mapa baixada.');
}

/** Substitui o mapa pelo conteúdo de um arquivo .json (com confirmação). */
export async function importar(arquivo) {
  let texto;
  try {
    texto = await arquivo.text();
  } catch {
    await alertar({ titulo: 'Não consegui ler o arquivo', mensagem: 'Tente de novo ou escolha outro arquivo.' });
    return;
  }
  let bruto;
  try {
    bruto = JSON.parse(texto);
  } catch (erro) {
    const onde = localizarErroJson(texto, erro);
    await alertar({
      titulo: 'Este arquivo não é um JSON válido',
      mensagem: onde.linha ? `O problema está perto da linha ${onde.linha}, coluna ${onde.coluna}.` : onde.mensagem,
    });
    return;
  }
  let resultado;
  try {
    resultado = normalizar(migrar(bruto));
  } catch (erro) {
    await alertar({
      titulo: 'Não dá para importar este arquivo',
      mensagem: erro instanceof ErroVersaoFutura ? `${erro.message} Atualize o app antes de importar.` : erro.message,
    });
    return;
  }

  const { dados, avisos } = resultado;
  const atual = obterDados();
  const resumo = (d) => `${plural(d.cards.length, 'card', 'cards')} e ${plural(d.conexoes.length, 'conexão', 'conexões')}`;
  const ok = await confirmar({
    titulo: `Importar “${arquivo.name}”?`,
    mensagem: `O mapa atual (${resumo(atual)}) será substituído pelo do arquivo (${resumo(dados)}).\n` +
              (ui.modo === 'edicao' ? 'O arquivo atual é guardado antes em data/backups, e ' : '') +
              'dá para desfazer com Ctrl+Z.',
    botaoOk: 'Importar',
  });
  if (!ok) return;

  motivoBackup = 'antes-de-importar';
  substituirTudo(dados, 'Importar JSON');
  toast('Arquivo importado.');
  if (avisos.length) {
    mostrarFaixa('avisos-importacao', { titulo: 'O arquivo importado precisou de ajustes:', detalhes: avisos, tipo: 'info' });
  }
}
