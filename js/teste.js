// =============================================================================
// teste.js — modo de teste de desempenho: abra  index.html?teste=150
//
// Gera cards e conexões fictícios (NUNCA salvos) para conferir se pan e zoom
// continuam fluidos com o volume pedido na especificação: 150 cards e 300
// conexões. Mostra no canto da tela um medidor de quadros por segundo.
// =============================================================================

import { areaUtil, moverPor, zoomNoPonto } from './camera.js';
import { dadosVazios, geometriaZonas, novoCard } from './modelo.js';
import { agoraISO, el, gerarId } from './util.js';

/** Dados fictícios: "quantidade" cards e o dobro de conexões. */
export function gerarDadosDeTeste(quantidade = 150) {
  const dados = dadosVazios();
  const geo = geometriaZonas(dados.zonas);
  const agora = agoraISO();

  // Sorteio com semente fixa: as posições são sempre as mesmas.
  let semente = 20250;
  const sortear = () => {
    semente = (semente * 1664525 + 1013904223) % 4294967296;
    return semente / 4294967296;
  };

  const idsCards = new Set();
  for (let i = 0; i < quantidade; i++) {
    const zona = geo.lista[i % geo.lista.length];
    const id = gerarId('c', idsCards);
    idsCards.add(id);
    const card = novoCard(id, agora);
    card.titulo = `[teste] Card ${i + 1}`;
    card.descricao = i % 3 === 0 ? '' : 'Texto de teste para medir o desempenho do mapa com muitos cards.';
    card.zona = zona.id;
    card.x = Math.round(130 + sortear() * (zona.largura - 260));
    card.y = Math.round((sortear() - 0.5) * 3200);
    if (i % 7 === 0) card.linkDocs = 'https://docs.google.com/';
    if (i % 11 === 0) card.animacao = 'demonstracao.html';
    if (i % 4 === 0) card.tags = ['teste'];
    dados.cards.push(card);
  }

  // Conexões ligando cada card a vizinhos próximos na lista.
  const idsConexoes = new Set();
  for (let k = 0; k < quantidade * 2 && quantidade > 1; k++) {
    const a = k % quantidade;
    let b = (a + 1 + Math.floor(sortear() * 12)) % quantidade;
    if (b === a) b = (a + 1) % quantidade;
    const id = gerarId('x', idsConexoes);
    idsConexoes.add(id);
    dados.conexoes.push({
      id, de: dados.cards[a].id, para: dados.cards[b].id,
      texto: `[teste] conexão ${k + 1}`, direcional: k % 5 !== 0,
      criadoEm: agora, atualizadoEm: agora,
    });
  }
  return dados;
}

/** Medidor de quadros por segundo (qps) no canto inferior direito. */
export function iniciarMedidorDeQuadros() {
  const caixa = el('div', { id: 'medidor-quadros' }, '… qps');
  document.body.append(caixa);
  let quadros = 0;
  let inicioJanela = performance.now();
  let anterior = inicioJanela;
  let pior = 0;
  const laco = (agora) => {
    quadros++;
    pior = Math.max(pior, agora - anterior);
    anterior = agora;
    if (agora - inicioJanela >= 1000) {
      caixa.textContent = `${Math.round((quadros * 1000) / (agora - inicioJanela))} qps · pior quadro ${Math.round(pior)} ms`;
      quadros = 0;
      pior = 0;
      inicioJanela = agora;
    }
    requestAnimationFrame(laco);
  };
  requestAnimationFrame(laco);
}

/**
 * Passeio automático de pan e zoom, medindo o tempo de cada quadro.
 * Uso no console do navegador:  await mapaDepuracao.medirPanZoom()
 */
export async function medirPanZoom(duracaoMs = 4000) {
  const area = areaUtil();
  const cx = area.x + area.largura / 2;
  const cy = area.y + area.altura / 2;
  const tempos = [];
  await new Promise((resolver) => {
    const inicio = performance.now();
    let anterior = inicio;
    const passo = (agora) => {
      tempos.push(agora - anterior);
      anterior = agora;
      const t = (agora - inicio) / 1000;
      moverPor(Math.sin(t * 3) * 14, Math.cos(t * 2.3) * 8);
      zoomNoPonto(cx, cy, 1 + Math.sin(t * 2) * 0.025);
      if (agora - inicio < duracaoMs) requestAnimationFrame(passo);
      else resolver();
    };
    requestAnimationFrame(passo);
  });
  tempos.shift();
  const ordenados = [...tempos].sort((a, b) => a - b);
  const media = tempos.reduce((soma, v) => soma + v, 0) / tempos.length;
  return {
    quadros: tempos.length,
    qps: Number((1000 / media).toFixed(1)),
    mediaMs: Number(media.toFixed(2)),
    p95Ms: Number(ordenados[Math.floor(ordenados.length * 0.95)].toFixed(2)),
    piorMs: Number(ordenados[ordenados.length - 1].toFixed(2)),
  };
}
