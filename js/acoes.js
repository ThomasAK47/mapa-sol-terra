// =============================================================================
// acoes.js — operações que a interface dispara (criar, excluir, mudar de zona,
// enquadrar…). As que mudam dados passam por estado.alterar(), então entram
// no desfazer e disparam o salvamento automático.
// =============================================================================

import { confirmar, toast } from './avisos.js';
import { enquadrar, irPara, obterCamera } from './camera.js';
import { limitesDosCards } from './cards.js';
import {
  alterar, avisarMudancaVisual, buscarCard, buscarConexao, descartarUltimaSe, geometria, obterDados,
  podeEditar, selecionar, ui,
} from './estado.js';
import { SOL, TERRA } from './fundo.js';
import {
  ancestraisRecolhidos, definirRecolhimentoLocal, descendentes, esquecerExpansaoTemporaria,
  estaRecolhido, hierarquia, podeSerPai,
} from './hierarquia.js';
import {
  definirPosicaoAbsoluta, ESCALA_CARD_MAX, ESCALA_CARD_MIN, ESCALA_GERAL_MAX, ESCALA_GERAL_MIN,
  inserirZonaDepois, LARGURA_ZONA_PADRAO, normalizarEscala, novoCard, posicaoAbsoluta, unirZonaComVizinha,
} from './modelo.js';
import { agoraISO, gerarId, limitar, linkSeguro, plural } from './util.js';

/** Cria um card vazio com o centro em (X, Y) do mundo. Devolve o id. */
export function criarCard(X, Y) {
  const dados = obterDados();
  const id = gerarId('c', new Set(dados.cards.map((card) => card.id)));
  const ok = alterar('Criar card', (d) => {
    const card = novoCard(id, agoraISO());
    definirPosicaoAbsoluta(card, Math.round(X), Math.round(Y), geometria());
    card.x = Math.round(card.x);
    d.cards.push(card);
  }, { marca: `criar:${id}` });
  if (!ok) return null;
  selecionar(id);
  return id;
}

/** true se o card não tem nada escrito. */
function cardVazio(card) {
  return !card.titulo.trim() && !card.descricao.trim() && card.tags.length === 0 && !card.linkDocs &&
    card.animacoes.length === 0;
}

/**
 * Descarta um card recém-criado que ficou vazio (ex.: um duplo clique sem
 * querer). Só funciona se a criação foi a última ação.
 */
export function descartarSeVazio(id) {
  const card = buscarCard(id);
  if (!card || !cardVazio(card)) return false;
  if (descartarUltimaSe(`criar:${id}`)) {
    toast('Card vazio descartado.');
    return true;
  }
  return false;
}

/** Pede confirmação e exclui o card (as conexões dele vão junto). */
export async function excluirCard(id) {
  const card = buscarCard(id);
  if (!card) return false;
  const dados = obterDados();
  const nConexoes = dados.conexoes.filter((k) => k.de === id || k.para === id).length;
  const nFilhos = dados.cards.filter((c) => c.pai === id).length;
  const detalhes = [];
  if (nConexoes) detalhes.push(`${plural(nConexoes, 'conexão será excluída', 'conexões serão excluídas')} junto.`);
  if (nFilhos) detalhes.push(`${plural(nFilhos, 'card filho sobe', 'cards filhos sobem')} um nível.`);
  detalhes.push('Dá para desfazer com Ctrl+Z.');

  const ok = await confirmar({
    titulo: `Excluir o card “${card.titulo.trim() || 'sem título'}”?`,
    mensagem: detalhes.join('\n'),
    botaoOk: 'Excluir',
    perigo: true,
  });
  if (!ok) return false;

  alterar('Excluir card', (d) => {
    const alvo = d.cards.find((c) => c.id === id);
    if (!alvo) return;
    d.cards = d.cards.filter((c) => c.id !== id);
    d.conexoes = d.conexoes.filter((k) => k.de !== id && k.para !== id);
    // Os filhos sobem um nível: passam a ter como pai o pai do card excluído.
    for (const c of d.cards) if (c.pai === id) c.pai = alvo.pai ?? null;
  });
  if (ui.selecionado === id) selecionar(null);
  toast('Card excluído. Ctrl+Z desfaz.');
  return true;
}

/** Leva o card para outra zona, mantendo a posição relativa dentro dela. */
export function moverCardParaZona(id, zonaId) {
  const geo = geometria();
  const zona = geo.porId.get(zonaId);
  const card = buscarCard(id);
  if (!zona || !card || card.zona === zonaId) return;
  alterar('Mudar zona', (d) => {
    const c = d.cards.find((item) => item.id === id);
    const margem = Math.min(140, zona.largura / 2);
    c.zona = zonaId;
    c.x = Math.round(limitar(c.x, margem, zona.largura - margem));
  });
  centralizarCard(id);
}

/** Leva a câmera até o card, sem mudar o zoom. */
export function centralizarCard(id, { animar = true } = {}) {
  const card = buscarCard(id);
  if (!card) return;
  irPara(posicaoAbsoluta(card, geometria()), obterCamera().escala, { animar });
}

/** Enquadra todos os cards, o Sol e a Terra. */
export function enquadrarTudo({ animar = true } = {}) {
  const geo = geometria();
  let minX = geo.inicio - SOL.raio * 0.6;
  let maxX = geo.fim + TERRA.raio * 1.3;
  let minY = -SOL.raio * 0.8;
  let maxY = SOL.raio * 0.8;
  const cards = limitesDosCards();
  if (cards) {
    minX = Math.min(minX, cards.x);
    maxX = Math.max(maxX, cards.x + cards.largura);
    minY = Math.min(minY, cards.y);
    maxY = Math.max(maxY, cards.y + cards.altura);
  }
  enquadrar({ x: minX, y: minY, largura: maxX - minX, altura: maxY - minY }, { animar });
}

/**
 * Define o tamanho próprio de um card (1 = normal). Os descendentes dele
 * acompanham na mesma proporção; os outros cards não mudam.
 */
export function definirEscalaDoCard(id, escala) {
  const card = buscarCard(id);
  const valor = normalizarEscala(escala, ESCALA_CARD_MIN, ESCALA_CARD_MAX);
  if (!card || (card.escala ?? 1) === valor) return;
  alterar('Mudar tamanho do card', (d) => {
    const alvo = d.cards.find((c) => c.id === id);
    if (alvo) alvo.escala = valor;
  });
}

/** Define o tamanho de todos os cards de uma vez (1 = normal). */
export function definirEscalaDosCards(escala) {
  const valor = normalizarEscala(escala, ESCALA_GERAL_MIN, ESCALA_GERAL_MAX);
  if ((obterDados().escalaDosCards ?? 1) === valor) return;
  // Arrastar a barra gera muitas mudanças seguidas: viram uma só no desfazer.
  alterar('Mudar tamanho de todos os cards', (d) => {
    d.escalaDosCards = valor;
  }, { agrupar: 'escala-dos-cards' });
}

// Animações do card: uma lista de nomes de arquivo da pasta animacoes/, na
// ordem em que aparecem na janela (1, 2, 3…).

/** Acrescenta uma animação no fim da lista do card (se ainda não estiver nela). */
export function acrescentarAnimacao(id, arquivo) {
  const card = buscarCard(id);
  if (!card || !arquivo || card.animacoes.includes(arquivo)) return;
  alterar('Acrescentar animação', (d) => {
    const alvo = d.cards.find((c) => c.id === id);
    if (!alvo) return;
    alvo.animacoes.push(arquivo);
    alvo.atualizadoEm = agoraISO();
  });
}

/** Tira do card a animação da posição "indice" (0 = a primeira). */
export function removerAnimacao(id, indice) {
  const card = buscarCard(id);
  if (!card || indice < 0 || indice >= card.animacoes.length) return;
  alterar('Remover animação', (d) => {
    const alvo = d.cards.find((c) => c.id === id);
    if (!alvo) return;
    alvo.animacoes.splice(indice, 1);
    alvo.atualizadoEm = agoraISO();
  });
}

/** Troca a animação da posição "indice" com a de cima (indice − 1). */
export function subirAnimacao(id, indice) {
  const card = buscarCard(id);
  if (!card || indice < 1 || indice >= card.animacoes.length) return;
  alterar('Mudar a ordem das animações', (d) => {
    const alvo = d.cards.find((c) => c.id === id);
    if (!alvo) return;
    const lista = alvo.animacoes;
    [lista[indice - 1], lista[indice]] = [lista[indice], lista[indice - 1]];
    alvo.atualizadoEm = agoraISO();
  });
}

/** Abre o link do Google Docs do card numa nova aba. */
export function abrirLinkDocs(id) {
  const card = buscarCard(id);
  const url = linkSeguro(card?.linkDocs);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
  else toast('O link do Docs deste card não é válido (ele precisa começar com https://).');
}

// --- Zonas ----------------------------------------------------------------------------

/** Muda o nome ou a descrição ("detalhe") de uma zona. */
export function editarZona(id, campo, valor) {
  if (campo !== 'nome' && campo !== 'detalhe') return;
  const zona = obterDados().zonas.find((z) => z.id === id);
  if (!zona || zona[campo] === valor) return;
  // Digitação seguida no mesmo campo vira uma só ação no desfazer.
  alterar(campo === 'nome' ? 'Renomear zona' : 'Editar descrição da zona', (d) => {
    const alvo = d.zonas.find((z) => z.id === id);
    if (alvo) alvo[campo] = valor;
  }, { agrupar: `zona:${id}:${campo}` });
}

/**
 * Cria uma zona logo à direita de "idAnterior". As zonas seguintes (e a Terra)
 * se deslocam para dar lugar. Devolve o id da zona nova (ou null).
 */
export function criarZonaDepoisDe(idAnterior) {
  const dados = obterDados();
  if (!dados.zonas.some((z) => z.id === idAnterior)) return null;
  const id = gerarId('z', new Set(dados.zonas.map((z) => z.id)));
  const ok = alterar('Criar zona', (d) => {
    inserirZonaDepois(d, idAnterior, { id, nome: 'Nova zona', largura: LARGURA_ZONA_PADRAO });
  });
  return ok ? id : null;
}

/**
 * Pede confirmação e exclui a zona, unindo-a à vizinha: o espaço e os cards
 * passam para a zona ao lado, e nada sai do lugar.
 */
export async function excluirZona(id) {
  const dados = obterDados();
  const indice = dados.zonas.findIndex((z) => z.id === id);
  if (indice < 0) return false;
  if (dados.zonas.length < 2) {
    toast('O mapa precisa ter pelo menos uma zona.');
    return false;
  }
  const zona = dados.zonas[indice];
  const vizinha = dados.zonas[indice > 0 ? indice - 1 : 1];
  const nCards = dados.cards.filter((card) => card.zona === id).length;
  const ok = await confirmar({
    titulo: `Excluir a zona “${zona.nome}”?`,
    mensagem: `O espaço dela passa para a zona “${vizinha.nome}”.\n` +
      (nCards ? `${plural(nCards, 'card muda', 'cards mudam')} para lá, sem sair do lugar.\n` : '') +
      'Dá para desfazer com Ctrl+Z.',
    botaoOk: 'Excluir zona',
    perigo: true,
  });
  if (!ok) return false;
  alterar('Excluir zona', (d) => {
    unirZonaComVizinha(d, id);
  });
  toast('Zona excluída. Ctrl+Z desfaz.');
  return true;
}

// --- Hierarquia (pai e filhos) ------------------------------------------------------

/**
 * Recolhe (esconde os descendentes) ou expande um card pai. No modo de edição
 * isso é salvo e entra no desfazer; na vitrine, vale só para quem está vendo.
 */
export function alternarRecolhido(id) {
  const card = buscarCard(id);
  if (!card || !hierarquia().filhos.get(id)?.length) return;
  const recolher = !estaRecolhido(card);
  esquecerExpansaoTemporaria(id); // a pessoa decidiu: vale mais que a busca
  if (!podeEditar()) {
    definirRecolhimentoLocal(id, recolher);
    avisarMudancaVisual();
  } else if (card.recolhido === recolher) {
    avisarMudancaVisual(); // só desfez uma expansão temporária da busca
  } else {
    alterar(recolher ? 'Recolher filhos' : 'Expandir filhos', (d) => {
      const alvo = d.cards.find((c) => c.id === id);
      if (alvo) alvo.recolhido = recolher;
    });
  }
  // Se o card selecionado ficou escondido, a seleção passa para o pai.
  if (recolher && ui.selecionado && descendentes(id).includes(ui.selecionado)) selecionar(id);
}

/** Expande estes cards (ex.: ao clicar em "3 conexões" de cards escondidos). */
export function expandirCards(ids) {
  const alvo = ids.filter((id) => estaRecolhido(buscarCard(id)));
  if (alvo.length === 0) return;
  for (const id of alvo) esquecerExpansaoTemporaria(id);
  if (!podeEditar()) {
    for (const id of alvo) definirRecolhimentoLocal(id, false);
    avisarMudancaVisual();
    return;
  }
  alterar('Expandir filhos', (d) => {
    for (const card of d.cards) if (alvo.includes(card.id)) card.recolhido = false;
  });
}

/** Mostra um card escondido, expandindo os pais recolhidos que o escondem. */
export function expandirAte(id) {
  expandirCards(ancestraisRecolhidos(id));
}

/**
 * Define o card pai (ou nenhum). Impede ciclos (um card não pode ser pai de
 * um ancestral seu) e expande o novo pai se ele estiver recolhido, para o
 * card não sumir da tela.
 */
export function definirPai(id, idPai) {
  const card = buscarCard(id);
  const novoPai = idPai || null;
  if (!card || card.pai === novoPai) return false;
  if (novoPai && !podeSerPai(id, novoPai)) {
    toast('Esse card não pode ser o pai: ele é descendente deste (formaria um ciclo).');
    return false;
  }
  const aExpandir = novoPai
    ? [novoPai, ...ancestraisRecolhidos(novoPai)].filter((p) => estaRecolhido(buscarCard(p)))
    : [];
  alterar('Mudar card pai', (d) => {
    const alvo = d.cards.find((c) => c.id === id);
    if (!alvo) return;
    alvo.pai = novoPai;
    alvo.atualizadoEm = agoraISO();
    for (const c of d.cards) if (aExpandir.includes(c.id)) c.recolhido = false;
  });
  for (const p of aExpandir) esquecerExpansaoTemporaria(p);
  return true;
}

// --- Conexões ---------------------------------------------------------------------
//
// Enquanto uma conexão recém-criada está aberta no editor ("nova"), tudo o
// que se faz com ela (digitar, inverter, tirar a seta) entra na mesma ação do
// desfazer que a criou. Assim, um Ctrl+Z depois desfaz a conexão inteira, e o
// Esc no editor a descarta como se nunca tivesse existido.

function agrupamento(id, nova, tipo = null) {
  if (nova) return { agrupar: `conexao-nova:${id}`, agruparSemPrazo: true };
  return { agrupar: tipo ? `${tipo}:${id}` : null };
}

function alterarConexao(id, rotulo, mudanca, opcoes) {
  alterar(rotulo, (d) => {
    const conexao = d.conexoes.find((k) => k.id === id);
    if (!conexao) return;
    mudanca(conexao);
    conexao.atualizadoEm = agoraISO();
  }, opcoes);
}

/** Cria uma conexão (direcional, sem texto) de um card para outro. Devolve o id. */
export function criarConexao(de, para) {
  if (de === para || !buscarCard(de) || !buscarCard(para)) return null;
  const id = gerarId('x', new Set(obterDados().conexoes.map((k) => k.id)));
  const agora = agoraISO();
  const ok = alterar('Criar conexão', (d) => {
    d.conexoes.push({ id, de, para, texto: '', direcional: true, criadoEm: agora, atualizadoEm: agora });
  }, { marca: `criar-conexao:${id}`, ...agrupamento(id, true) });
  return ok ? id : null;
}

export function editarTextoDaConexao(id, texto, { nova = false } = {}) {
  if (buscarConexao(id)?.texto === texto) return;
  alterarConexao(id, 'Editar texto da conexão', (k) => { k.texto = texto; }, agrupamento(id, nova, 'texto-conexao'));
}

/** Troca o sentido da seta (de ↔ para). */
export function inverterConexao(id, { nova = false } = {}) {
  alterarConexao(id, 'Inverter conexão', (k) => { [k.de, k.para] = [k.para, k.de]; }, agrupamento(id, nova));
}

/** Liga ou desliga a seta (conexão com ou sem direção). */
export function definirDirecional(id, direcional, { nova = false } = {}) {
  if (buscarConexao(id)?.direcional === direcional) return;
  alterarConexao(id, direcional ? 'Pôr seta na conexão' : 'Tirar seta da conexão',
    (k) => { k.direcional = direcional; }, agrupamento(id, nova));
}

/** Descarta uma conexão recém-criada (Esc no editor). */
export function descartarConexaoNova(id) {
  if (descartarUltimaSe(`criar-conexao:${id}`)) return;
  // Se outra ação aconteceu no meio, remove do jeito comum (pode ser desfeito).
  if (buscarConexao(id)) alterar('Cancelar conexão', (d) => { d.conexoes = d.conexoes.filter((k) => k.id !== id); });
}

/** Pede confirmação e exclui a conexão. */
export async function excluirConexao(id) {
  const conexao = buscarConexao(id);
  if (!conexao) return false;
  const titulo = (idCard) => buscarCard(idCard)?.titulo.trim() || 'sem título';
  const texto = conexao.texto.trim();
  const linhas = [`${titulo(conexao.de)} ${conexao.direcional ? '→' : '—'} ${titulo(conexao.para)}`];
  if (texto) linhas.push(`“${texto.length > 140 ? `${texto.slice(0, 140)}…` : texto}”`);
  linhas.push('Dá para desfazer com Ctrl+Z.');
  const ok = await confirmar({ titulo: 'Excluir esta conexão?', mensagem: linhas.join('\n'), botaoOk: 'Excluir', perigo: true });
  if (!ok) return false;
  alterar('Excluir conexão', (d) => { d.conexoes = d.conexoes.filter((k) => k.id !== id); });
  toast('Conexão excluída. Ctrl+Z desfaz.');
  return true;
}
