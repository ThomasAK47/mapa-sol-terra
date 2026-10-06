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
| `parent`, `top`, `window.opener` | Nada: a animação não tem acesso ao app (a única exceção é a mensagem do Esc, abaixo) |
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

  É a única mensagem que o mapa aceita da animação; qualquer outra é ignorada.

### Conteúdo

- A animação é um apoio visual ao estudo.
- Se ela simplificar escala, tempo ou proporções, diga isso numa frase na
  própria tela (ex.: "tamanhos e distâncias fora de escala").

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
   - se ela usa biblioteca por CDN: sem internet, aparece um aviso.
3. Também dá para abrir o arquivo direto, em
   `http://127.0.0.1:8000/animacoes/nome-do-arquivo.html`, com o mesmo
   isolamento.

## 8. Lista de conferência

- [ ] Arquivo único, com nome válido e `<title>` igual ao título do manifesto
- [ ] Fundo preto, 100% da área, sem barras de rolagem
- [ ] Ajusta ao redimensionar; canvas com `devicePixelRatio`
- [ ] Trecho do Esc incluído
- [ ] Nada de `localStorage`, `alert`, `window.open`, formulário com envio ou
      `fetch` de arquivo local
- [ ] Bibliotecas (se houver) por CDN, com versão fixa e aviso quando não
      carregam
- [ ] Controles na tela e textos em português
- [ ] Simplificações indicadas na tela
- [ ] Trecho do manifesto entregue
