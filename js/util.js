// =============================================================================
// util.js — pequenas funções auxiliares usadas por vários módulos.
// =============================================================================

/** Prefixo das chaves que o app guarda no localStorage do navegador. */
export const PREFIXO_LOCAL = 'mapa-sol-terra:';

/** Limita um número ao intervalo [min, max]. */
export function limitar(valor, min, max) {
  return Math.min(max, Math.max(min, valor));
}

/** Data e hora atuais em ISO-8601 (UTC), ex.: "2026-09-30T18:42:07.123Z". */
export function agoraISO() {
  return new Date().toISOString();
}

const ALFABETO_ID = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * Gera um identificador curto e aleatório, ex.: gerarId('c') → "c-k3j9x2ab".
 * "existentes" (opcional) é um Set com ids que não podem se repetir.
 */
export function gerarId(prefixo, existentes = null) {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    let sufixo = '';
    for (const byte of bytes) sufixo += ALFABETO_ID[byte % ALFABETO_ID.length];
    const id = `${prefixo}-${sufixo}`;
    if (!existentes || !existentes.has(id)) return id;
  }
}

/** Texto sem acentos e em minúsculas (para comparar e buscar). */
export function semAcentos(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** "1 card" / "3 cards". */
export function plural(n, singular, formaPlural) {
  return `${n} ${n === 1 ? singular : formaPlural}`;
}

/**
 * Cria um elemento HTML com atributos e filhos. Os textos entram sempre como
 * texto puro (nunca como HTML), então nada que a pessoa digite vira código.
 * Ex.: el('button', { class: 'botao', onclick: fn }, 'Salvar')
 */
export function el(tag, atributos = {}, ...filhos) {
  const elemento = document.createElement(tag);
  for (const [nome, valor] of Object.entries(atributos)) {
    if (valor == null || valor === false) continue;
    if (nome === 'class') elemento.className = valor;
    else if (nome.startsWith('on') && typeof valor === 'function') elemento.addEventListener(nome.slice(2), valor);
    else if (nome === 'value') elemento.value = valor;
    else if (valor === true) elemento.setAttribute(nome, '');
    else elemento.setAttribute(nome, String(valor));
  }
  for (const filho of filhos.flat(Infinity)) {
    if (filho == null || filho === false) continue;
    elemento.append(filho instanceof Node ? filho : document.createTextNode(String(filho)));
  }
  return elemento;
}

// Desenhos dos ícones (traços em uma grade de 24×24). São fixos do app.
const ICONES = {
  mais: '<path d="M12 5v14M5 12h14"/>',
  enquadrar: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  desfazer: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  refazer: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  exportar: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  importar: '<path d="M12 15V4M7 9l5-5 5 5M5 20h14"/>',
  opcoes: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  fechar: '<path d="M6 6l12 12M18 6 6 18"/>',
  lixeira: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  documento: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  animacao: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/>',
  // Triângulo do botão ▶ dos cards (o CSS o preenche; veja .card-animacao).
  tocar: '<path d="M8.5 6.2v11.6L18 12z"/>',
  subir: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  externo: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  inverter: '<path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4"/>',
  menos: '<path d="M6 12h12"/>',
  busca: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  alerta: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4M12 17.5v.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.01"/>',
  recarregar: '<path d="M20 4v6h-6"/><path d="M19.2 15a8 8 0 1 1-1.8-8.4L20 10"/>',
  editar: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-4-4L4 16z"/><path d="m14 6 4 4"/>',
  efeitos: '<path d="M9.6 4.6A2 2 0 1 1 11 8H2M12.6 19.4A2 2 0 1 0 14 16H2M17.7 7.7A2.5 2.5 0 1 1 19.5 12H2"/>',
  'efeitos-desligados': '<path d="M9.6 4.6A2 2 0 1 1 11 8H2M12.6 19.4A2 2 0 1 0 14 16H2M17.7 7.7A2.5 2.5 0 1 1 19.5 12H2" opacity=".45"/><path d="M4 3.5l16 17"/>',
};

/** Cria um ícone SVG pelo nome (veja a lista ICONES acima). */
export function icone(nome, classe = 'ico') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', classe);
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONES[nome] ?? ''; // desenho fixo do app, não texto digitado
  return svg;
}

/** Baixa um arquivo de texto gerado na hora (usado em "Exportar JSON"). */
export function baixarArquivo(nome, conteudo, tipo = 'application/json') {
  const blob = new Blob([conteudo], { type: `${tipo};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = el('a', { href: url, download: nome });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Data e hora locais para nomes de arquivo: "2026-09-30_1542". */
export function carimboParaArquivo(data = new Date()) {
  const dois = (n) => String(n).padStart(2, '0');
  return `${data.getFullYear()}-${dois(data.getMonth() + 1)}-${dois(data.getDate())}_` +
         `${dois(data.getHours())}${dois(data.getMinutes())}`;
}

/** Data e hora legíveis: "30/09/2026 15:42". */
export function formatarDataHora(iso) {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '—';
  return data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** true se o foco do teclado está num campo onde se digita texto. */
export function digitandoEmCampo(alvo = document.activeElement) {
  if (!alvo) return false;
  if (alvo.isContentEditable) return true;
  if (alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT') return true;
  if (alvo.tagName !== 'INPUT') return false;
  return !['radio', 'checkbox', 'button', 'submit', 'file', 'range', 'color'].includes(alvo.type);
}

/**
 * Descobre linha e coluna de um erro de JSON.parse (as mensagens variam por
 * navegador). Devolve { linha, coluna, mensagem }; linha/coluna podem ser null.
 */
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

/** Devolve o link só se for http(s); qualquer outra coisa vira null. */
export function linkSeguro(texto) {
  try {
    const url = new URL(String(texto ?? '').trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Acesso ao localStorage que nunca derruba o app (o navegador pode bloqueá-lo
 * ou estar sem espaço). "gravar" devolve false se não conseguiu.
 */
export const local = {
  ler(chave, padrao = null) {
    try {
      const valor = localStorage.getItem(chave);
      return valor == null ? padrao : JSON.parse(valor);
    } catch {
      return padrao;
    }
  },
  gravar(chave, valor) {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
      return true;
    } catch {
      return false;
    }
  },
  apagar(chave) {
    try {
      localStorage.removeItem(chave);
    } catch {
      /* nada a fazer */
    }
  },
};
