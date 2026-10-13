# Contrato das animações

Regras para criar uma animação do **Mapa de Estudos Sol–Terra**, um app pessoal
de estudo que liga os assuntos do caminho Sol → Terra. Cada card do mapa pode
ter uma animação, que abre numa janela grande quando a pessoa clica nela.

> **Para pedir uma animação nova:** numa conversa, cole este arquivo inteiro e
> descreva o que quer ver. Há um modelo de mensagem na seção 1.

## 1. Modelo de pedido

```text
Crie uma animação para o meu Mapa de Estudos Sol–Terra, seguindo o contrato abaixo.
Tema: …
O que quero ver: …
Controles que ajudariam (ex.: velocidade, intensidade): …
Entregue o arquivo HTML completo e o trecho para o manifesto.

(cole aqui este CONTRATO.md)
```

## 2. O que entregar

1. **Um arquivo HTML completo**, pronto para salvar na pasta `animacoes/`.
2. **O nome do arquivo:** letras minúsculas sem acento, números, `-` ou `_`,
   terminando em `.html`, sem espaço e sem começar com `_`. Exemplo:
   `compressao-da-magnetosfera.html`.
3. **O trecho para o manifesto** (seção 6), com o mesmo nome de arquivo.

## 3. Onde a animação roda

- O mapa abre o arquivo numa janela que ocupa quase todo o navegador, dentro de
  um `<iframe sandbox="allow-scripts">`.
- O iframe é criado ao abrir a janela e removido ao fechar.
- A área vai de cerca de 360 × 300 px, em telas pequenas, a cerca de
  1600 × 1000 px, e **muda de tamanho** quando a janela do navegador muda.
- O servidor local envia os arquivos de `animacoes/` com o cabeçalho
  `Content-Security-Policy: sandbox allow-scripts`. Assim, as mesmas regras
  valem quando o arquivo é aberto direto numa aba.

## 4. Regras obrigatórias

### Arquivo

- **Arquivo único:** HTML, CSS (`<style>`) e JavaScript (`<script>`) no mesmo
  arquivo.
  - Nada de arquivos locais extras (imagens, `.js`, `.css`, `.json`).
  - Figuras vão desenhadas no canvas ou como SVG dentro do próprio HTML.
  - Dados vão no próprio script.
- **Bibliotecas só por CDN**, com versão fixa (ex.: `…/biblioteca@1.2.3/…`).
  - Use `cdn.jsdelivr.net`, `unpkg.com` ou `cdnjs.cloudflare.com`.
  - Prefira não usar biblioteca quando canvas ou SVG bastam.
  - Sem internet, a animação precisa mostrar um aviso na tela, nunca uma área
    vazia (veja `mostrarAviso` no esqueleto).
- **Cabeçalho do HTML:**
  - `<!doctype html>`, `<html lang="pt-BR">` e `<meta charset="utf-8">`;
  - `<meta name="viewport" content="width=device-width, initial-scale=1">`;
  - `<title>` igual ao título do manifesto.
- **Leve:** o arquivo deve abrir em menos de 2 segundos.

### Visual

- **Fundo preto** (`#000`) em toda a área, com textos claros.
- **Paleta sóbria**, como a do mapa: branco e cinzas.
  - Use cor só quando ela tiver significado, e explique o significado na
    legenda.
  - O Sol pode ser laranja (`#ffb347`), como no mapa.
- **Fonte:** `system-ui`, a fonte do sistema.
- **Textos em português.**
- **Legenda curta num canto,** com o título e uma frase sobre o que se vê.

### Tamanho da área

- **Ocupe 100% da largura e da altura,** sem barras de rolagem:
  `html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }`.
- **Calcule o desenho a partir do tamanho da área**
  (`window.innerWidth` e `window.innerHeight`), nunca de medidas fixas.
- **Refaça o desenho quando a janela mudar de tamanho** (evento `resize`).
- **Canvas nítido:** multiplique o tamanho em pixels por
  `window.devicePixelRatio` (veja o esqueleto).
- **Funcione de 360 × 300 px até telas grandes.** Os controles podem quebrar a
  linha, mas não podem sumir.

### Isolamento

Dentro do sandbox, o navegador bloqueia as funções abaixo. Algumas dão erro e
param o script inteiro.

| Não use | O que fazer em vez disso |
|---|---|
| `localStorage`, `sessionStorage`, `indexedDB`, cookies | Guarde o estado em variáveis |
| `parent`, `top`, `window.opener` | Nada: a animação não tem acesso ao app (as exceções são as mensagens do Esc e dos textos editáveis, abaixo) |
| `alert()`, `confirm()`, `prompt()` | Escreva a mensagem na própria tela |
| `window.open()`, links com `target="_blank"` | Referências vão no Google Docs do card |
| `<form>` com envio | Botões com JavaScript |
| Tela cheia, downloads, câmera, microfone | A janela já é grande |
| `fetch` ou `XMLHttpRequest` de arquivos locais | Dados no próprio arquivo |
| Mudar de página (`location.href = …`) | A animação é uma página só |

### Controles e teclado

- **Controles na tela:**
  - botões e sliders visíveis, como **Pausar/Continuar** e **Recomeçar**;
  - os parâmetros que ajudam a entender o fenômeno.
- **Teclado é opcional:** ele só funciona depois de a pessoa clicar dentro da
  animação.
- **Esc fecha a janela (obrigatório).** Inclua este trecho:

  ```js
  window.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') window.parent.postMessage({ tipo: 'fechar-animacao' }, '*');
  });
  ```

  Além dela, o mapa só aceita as duas mensagens do trecho dos textos editáveis
  (abaixo); qualquer outra é ignorada.

### Conteúdo

- A animação é um apoio visual ao estudo.
- Se ela simplificar escala, tempo ou proporções, diga isso numa frase na
  própria tela (ex.: "tamanhos e distâncias fora de escala").

### Textos editáveis

No mapa, o botão **Editar textos** da janela da animação deixa a pessoa trocar
os textos (completar uma explicação, tirar uma frase) sem mexer no código. As
trocas ficam gravadas no próprio arquivo, num bloco JSON. **As fórmulas e as
contas não são editáveis:** elas só mudam por um pedido numa conversa. Para o
botão funcionar, a animação precisa de cinco coisas:

1. **Textos fixos do HTML** (legenda, painel, explicações): marque cada um com
   `data-texto="nome"`. O nome é único no arquivo (minúsculas e hífens).
   - Dentro do texto valem só estes enfeites: `<b>`, `<i>`, `<sup>`, `<sub>`,
     `<small>`, `<br>` e `<span class="…">`.
   - Não marque fórmulas, números nem elementos que o script preenche.
   - O editor agrupa pelos nomes: `titulo-complemento`, `resumo-titulo`,
     `resumo-texto`, `leitura-<id>`, `dica`, `botao-ver-de-perto`,
     `controle-<id>` e, dentro de um elemento com `data-passo="N"` (N a partir
     de 0), `passo-<N+1>-titulo`, `passo-<N+1>-explicacao`,
     `passo-<N+1>-item-<K>` e `passo-<N+1>-legenda`. Outros nomes também
     funcionam.
2. **Textos do desenho** (canvas): escreva cada um como `` T_`…` ``, com os
   números em `${…}`:

   ```js
   escrever(T_`o campo cai ${numero(queda)} nT`, x, y);
   ```

   Na tela de edição, cada `${…}` aparece como um marcador `{0}`, `{1}`…, que
   a pessoa mantém ao reescrever. Texto do desenho não tem enfeites.
3. **Textos do painel montados pelo script:** escreva como `` H_`…` `` (aceita
   os mesmos enfeites do item 1):

   ```js
   valor.innerHTML = H_`a parede fica a <b>${numero(r)} raios da Terra</b>`;
   ```

   Fórmulas e contas ficam fora de `T_` e `H_` (ex.: `` `B = ${b} nT` ``,
   `` `= ${a} × ${b}` ``). **Não use `T_` nem `H_` como nomes de variáveis.**
4. **O bloco das trocas, vazio,** logo antes do `<script>` principal:

   ```html
   <script type="application/json" id="textos-editados">
   {
     "versao": 1,
     "painel": {},
     "gerados": {},
     "desenho": {}
   }
   </script>
   ```

5. **O trecho comum,** logo depois do trecho do Esc, sem mudanças. Ele define
   `T_` e `H_`, aplica as trocas e conversa com o mapa (duas mensagens: onde a
   animação está e quais textos do desenho estão na tela):

   ```js
   // -------------------------------------------------------------------------
   // Textos editáveis (veja animacoes/CONTRATO.md, "Textos editáveis").
   //   No app, o botão "Editar textos" da janela da animação troca: os textos fixos do painel (marcados com
   //   data-texto), os textos do painel montados por este script (H_`…`) e os textos do desenho (T_`…`).
   //   As trocas ficam no bloco JSON "textos-editados", perto do fim do HTML; o texto original continua aqui no
   //   código. Dentro de T_`…` e H_`…`, cada ${…} vira um marcador {0}, {1}…: é onde entram os números.
   //   (T_ e H_ têm o traço para não colidir com variáveis da animação, como T de temperatura.)
   // -------------------------------------------------------------------------
   const TEXTOS_EDITADOS = (() => {
     const ler = (json) => {
       try {
         const d = JSON.parse(json);
         return { painel: d.painel || {}, gerados: d.gerados || {}, desenho: d.desenho || {} };
       } catch {
         return null;
       }
     };
     // A prévia que o app manda no endereço (depois do #) vale mais que os textos gravados no arquivo.
     const previa = new URLSearchParams(location.hash.slice(1)).get('textos');
     const bloco = document.getElementById('textos-editados');
     return (previa && ler(previa)) || (bloco && ler(bloco.textContent)) || { painel: {}, gerados: {}, desenho: {} };
   })();
   const ENFEITES_PERMITIDOS = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', SUP: 'sup', SUB: 'sub', SMALL: 'small', BR: 'br', SPAN: 'span' };
   /** Deixa só os enfeites permitidos: negrito, itálico, sobrescrito, subscrito, letra menor, quebra de linha e
    *  trechos (span), com a classe e nenhum outro atributo. */
   function textoSeguro(html) {
     const modelo = document.createElement('template');
     modelo.innerHTML = String(html);
     const copiar = (origem, destino) => {
       for (const no of origem.childNodes) {
         if (no.nodeType === Node.TEXT_NODE) destino.append(no.nodeValue);
         else if (no.nodeType === Node.ELEMENT_NODE && no.tagName !== 'SCRIPT' && no.tagName !== 'STYLE') {
           const nome = ENFEITES_PERMITIDOS[no.tagName];
           if (!nome) {
             copiar(no, destino);
             continue;
           }
           const novo = document.createElement(nome);
           const classe = no.getAttribute('class');
           if (/^[a-z][a-z0-9-]*( [a-z][a-z0-9-]*)*$/.test(classe || '')) novo.className = classe;     // longo, curto, cores…
           copiar(no, novo);
           destino.append(novo);
         }
       }
     };
     const saida = document.createElement('div');
     copiar(modelo.content, saida);
     return saida.innerHTML;
   }
   /** A chave de um texto do código: o próprio texto, com {0}, {1}… no lugar de cada ${…}. */
   const chaveDoTexto = (partes) => partes.reduce((chave, parte, i) => chave + (i ? `{${i - 1}}` : '') + parte, '');
   const encaixarValores = (modelo, valores) => modelo.replace(/\{(\d+)\}/g, (marca, n) => (Number(n) < valores.length ? String(valores[n]) : marca));
   const textosVistos = new Map();       // texto do desenho → quando apareceu (o app pergunta o que está na tela)
   /** Um texto do desenho (simples, sem enfeites). */
   function T_(partes, ...valores) {
     const chave = chaveDoTexto(partes);
     textosVistos.set(chave, performance.now());
     const trocado = TEXTOS_EDITADOS.desenho[chave];
     return encaixarValores(typeof trocado === 'string' ? trocado : chave, valores);
   }
   /** Um texto do painel montado por este script (pode ter negrito, itálico, sobrescrito…). */
   function H_(partes, ...valores) {
     const chave = chaveDoTexto(partes);
     const trocado = TEXTOS_EDITADOS.gerados[chave];
     return encaixarValores(typeof trocado === 'string' ? textoSeguro(trocado) : chave, valores);
   }
   // Os textos fixos do painel (marcados com data-texto) recebem as trocas assim que a página abre.
   for (const elemento of document.querySelectorAll('[data-texto]')) {
     const trocado = TEXTOS_EDITADOS.painel[elemento.dataset.texto];
     if (typeof trocado === 'string') elemento.innerHTML = textoSeguro(trocado);
   }
   /** Conta ao app onde a animação está (para a prévia dos textos voltar ao mesmo lugar). */
   function avisarOndeEsta() {
     const lugar = typeof estado === 'object' && estado ? estado : {};     // estado.perto, .passo e .parte, se houver
     window.parent.postMessage({ tipo: 'animacao-esta-em', perto: Boolean(lugar.perto), passo: Number(lugar.passo) || 0,
       parte: Number(lugar.parte) || 0 }, '*');
   }
   /** Numa prévia, volta à vista, ao passo e à parte de antes (vêm no endereço, depois do #). Fica no fim do script. */
   function voltarAoLugarDaPrevia() {
     const dados = new URLSearchParams(location.hash.slice(1));
     if (dados.get('perto') === '1' && typeof mostrarVisao === 'function') {
       mostrarVisao(true);
       if (typeof mostrarPasso === 'function') mostrarPasso(Number(dados.get('passo')) || 0);
       if (typeof mostrarParte === 'function') mostrarParte(Number(dados.get('parte')) || 0);
     }
     avisarOndeEsta();
   }
   // O app pode perguntar quais textos do desenho estão na tela agora (os usados no último segundo).
   window.addEventListener('message', (evento) => {
     if (evento.source !== window.parent || evento.data?.tipo !== 'quais-textos-na-tela') return;
     const agora = performance.now();
     const chaves = [...textosVistos].filter(([, quando]) => agora - quando < 1000).map(([chave]) => chave);
     window.parent.postMessage({ tipo: 'textos-na-tela', chaves }, '*');
   });
   ```

   A prévia da edição recarrega a animação. Para ela voltar à mesma visão e ao
   mesmo passo, uma animação com passos (`estado.perto`, `estado.passo`,
   `mostrarVisao(perto)` e `mostrarPasso(n)`) chama `avisarOndeEsta()` no fim
   de `mostrarVisao` e de `mostrarPasso`. Se cada passo tiver partes
   (`estado.parte` e `mostrarParte(n)`), chama também no fim de
   `mostrarParte`. Toda animação chama `voltarAoLugarDaPrevia()` na última
   linha do script.

## 5. Esqueleto mínimo

O arquivo `animacoes/_modelo.html` do projeto traz uma versão mais completa e
comentada deste esqueleto.

```html
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Título da animação</title>
  <style>
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #000;
                 color: #e9e9e9; font: 14px/1.4 system-ui, sans-serif; }
    #tela { position: fixed; inset: 0; width: 100%; height: 100%; display: block; }
    .controles { position: fixed; left: 50%; bottom: 14px; transform: translateX(-50%);
                 display: flex; flex-wrap: wrap; gap: 10px; }
  </style>
</head>
<body>
  <canvas id="tela"></canvas>
  <div class="controles"><button id="bt-pausar" type="button">Pausar</button></div>
  <script>
    'use strict';
    // Esc fecha a janela do mapa (obrigatório).
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') window.parent.postMessage({ tipo: 'fechar-animacao' }, '*');
    });

    // Canvas nítido e do tamanho da área.
    const tela = document.getElementById('tela');
    const ctx = tela.getContext('2d');
    let largura = 0, altura = 0;
    function ajustarTamanho() {
      const escala = window.devicePixelRatio || 1;
      largura = window.innerWidth;
      altura = window.innerHeight;
      tela.width = Math.round(largura * escala);
      tela.height = Math.round(altura * escala);
      ctx.setTransform(escala, 0, 0, escala, 0, 0);
      desenhar();
    }
    window.addEventListener('resize', ajustarTamanho);

    // Estado e controles.
    let tempo = 0, pausado = false;
    const botao = document.getElementById('bt-pausar');
    botao.addEventListener('click', () => {
      pausado = !pausado;
      botao.textContent = pausado ? 'Continuar' : 'Pausar';
    });

    // O desenho do instante "tempo" (use largura e altura, nunca medidas fixas).
    function desenhar() {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, largura, altura);
      // …
    }

    // Aviso na tela (ex.: biblioteca da internet que não carregou).
    function mostrarAviso(texto) {
      document.body.textContent = texto;
    }

    // Laço: o passo é limitado para não "pular" depois de uma pausa.
    let anterior = performance.now();
    function quadro(agora) {
      const passo = Math.min((agora - anterior) / 1000, 0.1);
      anterior = agora;
      if (!pausado) { tempo += passo; desenhar(); }
      requestAnimationFrame(quadro);
    }
    ajustarTamanho();
    requestAnimationFrame(quadro);
  </script>
</body>
</html>
```

## 6. Registrar no manifesto

O arquivo `animacoes/manifesto.json` lista as animações que aparecem no campo
**Animações** do painel do card. Cada item tem três campos:

| Campo | O que é |
|---|---|
| `arquivo` | O nome do arquivo, exatamente igual (minúsculas, com `.html`) |
| `titulo` | Nome curto. Aparece no painel e no alto da janela |
| `descricao` | Uma frase. Aparece no painel (na vitrine, e ao passar o mouse sobre a animação no modo de edição) |

Um card pode ter várias animações (uma série, por exemplo). Elas abrem na
ordem do painel, e a janela mostra botões 1, 2, 3… para trocar de uma para
outra. Cada animação continua sendo um arquivo independente: ela não sabe que
faz parte de uma lista.

**Passo a passo:**

1. Salve o arquivo da animação na pasta `animacoes/`.
2. Abra `animacoes/manifesto.json` num editor de texto (o Bloco de Notas serve).
3. Acrescente o item novo dentro da lista `"animacoes": [ … ]`. **Ponha uma
   vírgula depois do `}` do item anterior.**
4. Salve o arquivo e volte ao mapa: a lista se atualiza sozinha (ou aperte F5).
5. No painel do card, escolha a animação na lista do campo **Animações** e
   clique no botão ▷ ao lado dela (ou no ▶ do card).

Exemplo com duas animações (repare na vírgula entre os itens):

```json
{
  "animacoes": [
    {
      "arquivo": "demonstracao.html",
      "titulo": "[exemplo] Demonstração",
      "descricao": "Teste técnico do sistema de animações."
    },
    {
      "arquivo": "minha-animacao.html",
      "titulo": "Título curto",
      "descricao": "Uma frase sobre o que a animação mostra."
    }
  ]
}
```

- Se o manifesto tiver um erro de digitação, o campo **Animações** do painel
  mostra a linha do problema. O resto do mapa continua funcionando.
- Outros campos, como o `"leia-me"`, são ignorados.

## 7. Como testar

1. Abra o mapa com o `iniciar.bat`, ponha a animação num card (campo
   **Animações** do painel) e clique no ▶ do card.
2. Confira:
   - a animação aparece rápido, com fundo preto e nada cortado;
   - ao redimensionar a janela do navegador, ela se ajusta;
   - clicando dentro da animação e apertando Esc, a janela fecha;
   - no console do navegador (F12 → Console), não há erros em vermelho;
   - no botão **Editar textos**, os textos aparecem na lista; trocar um deles
     muda a animação (a prévia) no mesmo passo;
   - se ela usa biblioteca por CDN: sem internet, aparece um aviso.
3. Também dá para abrir o arquivo direto, em
   `http://127.0.0.1:8000/animacoes/nome-do-arquivo.html`, com o mesmo
   isolamento.

## 8. Lista de conferência

- [ ] Arquivo único, com nome válido e `<title>` igual ao título do manifesto
- [ ] Fundo preto, 100% da área, sem barras de rolagem
- [ ] Ajusta ao redimensionar; canvas com `devicePixelRatio`
- [ ] Trecho do Esc incluído
- [ ] Textos editáveis: `data-texto` nos textos fixos, `T_` e `H_` nos textos
      do script (fora das fórmulas), bloco `textos-editados` vazio, trecho
      comum depois do Esc e `voltarAoLugarDaPrevia()` no fim do script
- [ ] Nada de `localStorage`, `alert`, `window.open`, formulário com envio ou
      `fetch` de arquivo local
- [ ] Bibliotecas (se houver) por CDN, com versão fixa e aviso quando não
      carregam
- [ ] Controles na tela e textos em português
- [ ] Simplificações indicadas na tela
- [ ] Trecho do manifesto entregue
