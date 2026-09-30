# CLAUDE.md: Mapa de Estudos Sol–Terra

Guia para sessões futuras do Claude Code neste repositório. Leia também:

- `docs/ESPECIFICACAO.md`: o pedido original, a fonte dos requisitos;
- `docs/PLANO.md`: as decisões aprovadas na Fase 0, que prevalecem sobre este
  resumo em caso de dúvida.

## Quem usa e como trabalhar

- **Quem usa:** estudante de Geoprocessamento (UFSM), bolsista PIBIC no INPE,
  **sem formação em programação**.
  - Responda em português.
  - Explique todo comando que a pessoa precise rodar.
  - Comente o código em português.
- **Trabalho por fases:** PARE ao fim de cada fase para teste e aprovação. Um
  commit por fase, com mensagem específica. Os commits são locais; o push é feito
  pela pessoa.
- **Conteúdo científico:** nunca escreva física nos cards. Exemplos têm títulos
  com "[exemplo]" e descrição vazia.
- **Dados reais:** nunca teste no `data/estudos.json` do projeto (veja
  "Como testar").

## Estado das fases

- [x] Fase 0: plano (`docs/PLANO.md`)
- [x] Fase 1: canvas, zonas, Sol/Terra estáticos, pan/zoom, cards, persistência
  completa, desfazer/refazer, modo somente leitura, `iniciar.*`, modo `?teste`
- [x] Fase 2: conexões (arrasto por alça, texto, direção, várias por par, editor,
  lista no painel), modo foco, mapa andando sozinho perto da borda ao arrastar
- [ ] Fase 3: hierarquia (pai/filho, tamanhos, recolher/expandir) e busca
- [ ] Fase 4: animações (manifesto, iframe sandbox, `_modelo.html`, demonstração, `CONTRATO.md`)
- [ ] Fase 5: efeitos visuais, botão de desempenho, README e CLAUDE.md finais, GitHub Pages

## Arquitetura

- **Sem build, sem npm, sem bibliotecas.** A única dependência externa é a
  fonte Inter (Google Fonts), com a fonte do sistema como reserva.
- **Módulos ES** em `js/`. Funcionam no servidor local e no GitHub Pages (não em
  `file://`).
- **Camadas da tela, de trás para frente:**
  1. `<canvas id="fundo">`: Sol, Terra e limites das zonas;
  2. `#mundo`: recebe um único `transform` de pan/zoom. Contém, nesta ordem, o
     `<svg id="camada-conexoes">` (curvas e setas), os textos das conexões
     (HTML) e os cards (HTML);
  3. `#rotulos-zonas`: nomes presos ao topo;
  4. interface: barra, painel, faixas, toasts, `<dialog>`.

| Arquivo | Responsabilidade |
|---|---|
| `js/principal.js` | Inicialização: modo (edição / leitura / teste), carga dos dados, câmera inicial |
| `js/estado.js` | Dados em memória. **Único caminho de alteração** (`alterar`, gestos). Desfazer/refazer (100 ações), seleção |
| `js/modelo.js` | Versão do formato, `migrar()`, `normalizar()` (reparo + avisos), geometria das zonas |
| `js/persistencia.js` | Leitura, salvamento automático, reserva no localStorage, conflito, exportar/importar |
| `js/camera.js` | Pan/zoom, roda/touchpad/pinça, área útil, posição guardada |
| `js/fundo.js` | Canvas: Sol, Terra com linhas de campo, limites e nomes das zonas |
| `js/cards.js` | Desenho dos cards (reconciliação por id), tamanhos medidos, faixa de zoom (`data-detalhe`: baixo/medio/alto/perto), alças, classes do modo foco. Chama `aoRenderizarCards` no fim |
| `js/conexoes.js` | Curvas SVG (Bézier quadrática, leque por par), setas, textos no meio, linha provisória, espessura constante na tela |
| `js/editor-conexao.js` | Janelinha presa ao meio da conexão: texto, inverter, com/sem seta, excluir (ou só leitura) |
| `js/foco.js` | `focoAtual()`: card selecionado + vizinhos, ou a conexão aberta no editor |
| `js/interacao.js` | Ponteiro: pan, arrastar card, arrastar alça (nova conexão), clique, duplo clique, pinça, mapa andando sozinho perto da borda |
| `js/painel.js` | Painel lateral (edição e leitura), com a lista de conexões do card |
| `js/acoes.js` | Operações: cards (criar, excluir, mudar zona), conexões (criar, texto, inverter, seta, excluir, descartar nova), enquadrar, abrir link |
| `js/barra.js` | Barra de ferramentas, indicador de salvamento, menu de opções, atalhos |
| `js/avisos.js` | Toasts, faixas e janelas de confirmação/escolha |
| `js/teste.js` | Modo `?teste=N` (dados fictícios), medidor de quadros, `medirPanZoom()` |
| `js/util.js` | Auxiliares: `el()`, `icone()`, ids, datas, localStorage seguro |

**Fluxo de uma alteração:**

1. `estado.alterar(rotulo, mutacao, { agrupar, marca })` guarda uma cópia para o
   desfazer e aplica a mudança.
2. `notificar()` avisa quem desenha: cards, painel e fundo redesenham no próximo
   quadro.
3. `persistencia.marcarAlterado()` agenda o salvamento: cerca de 1 s depois,
   `POST api/salvar`.

Arrastos usam `iniciarGesto` / `alterarDuranteGesto` / `concluirGesto`: viram
uma só ação no desfazer e só salvam ao soltar.

**Conexão nova:** a criação usa `marca: 'criar-conexao:<id>'` e
`agrupar: 'conexao-nova:<id>'` com `agruparSemPrazo`. Tudo o que é feito com ela
enquanto o editor está aberto (texto, seta, inverter) entra na mesma ação do
desfazer. Esc no editor chama `descartarUltimaSe(marca)`, como se ela nunca
tivesse existido. Card criado e deixado vazio usa o mesmo mecanismo
(`criar:<id>`).

**Ordem de desenho:** `estado` notifica → `cards.renderizarAgora()` (no próximo
quadro) → no fim, `aoRenderizarCards` → `conexoes` (que dependem da posição e
do tamanho dos cards). O modo foco (`ui.selecionado` / `ui.conexaoAberta`) é
aplicado com as classes `.modo-foco` no `#palco` e `.em-foco` nos elementos.

## Modelo de dados (versão 1)

- **Zonas:** `{ id, nome, detalhe, ordem, largura }`, dispostas lado a lado pela
  `ordem`, a partir de x = 0.
- **Card:** `{ id, titulo, descricao, zona, x, y, pai, recolhido, tags, animacao, linkDocs, criadoEm, atualizadoEm }`.
  - **`x` é relativo ao início da zona** e `(x, y)` é o **centro** do card. Use
    `posicaoAbsoluta` / `definirPosicaoAbsoluta`.
  - A primeira zona aceita `x < 0` (sobre o Sol); a última aceita `x > largura`.
  - Mover um card não altera `atualizadoEm`; só mudanças de conteúdo alteram.
- **Conexão:** `{ id, de, para, texto, direcional, criadoEm, atualizadoEm }`.
- **Nível hierárquico:** derivado de `pai`.
- **Ids:** `c-xxxxxxxx` (cards) e `x-xxxxxxxx` (conexões).
- **Novo campo:** acrescente em `normalizar()` (com valor padrão) e em `novoCard()`.
- **Mudança incompatível de formato:** aumente `VERSAO_ATUAL` e registre a
  conversão em `MIGRACOES`.
- **Normalização:** preserva campos desconhecidos e nunca descarta dados sem
  gerar aviso.
- **Fora do JSON (localStorage):**
  - `mapa-sol-terra:camera`: posição da câmera;
  - `mapa-sol-terra:roda`: comportamento da roda;
  - `mapa-sol-terra:reserva`: alterações não gravadas.

## Servidor (`iniciar.py`, só biblioteca padrão)

**Rotas:**

- `GET /api/status` → `{ app: "mapa-sol-terra", versaoServidor: 1, editavel: true }`.
  A página usa esta resposta para decidir se está no modo de edição.
- `GET /data/estudos.json` → devolve o arquivo com o cabeçalho
  `X-Versao-Arquivo` (sha256 com 16 caracteres, ou `novo`).
- `POST /api/salvar`:
  - exige `Content-Type: application/json` e `Origin` igual ao da própria
    página, e confere o `Host`;
  - cabeçalho `X-Versao-Base`: a versão conhecida, `novo` ou `forcar`;
  - cabeçalho opcional `X-Backup-Antes: <motivo>`;
  - respostas: 200 `{ok, versao}`, 409 (conflito), 400/422 (JSON inválido ou
    sem o formato), 403/415/413.

**Gravação e backups:**

- A gravação é atômica (`.tmp` + `os.replace`, com novas tentativas no Windows)
  e sai indentada, em UTF-8.
- `data/backups/diario-AAAA-MM-DD.json` é feito antes da primeira gravação do
  dia (mantém 30).
- `seguranca-<carimbo>-<motivo>.json` é feito antes de sobrescrever num
  conflito, de importar, de gravar dados reparados, ou quando uma gravação
  remove mais da metade dos cards (mantém 30).

**Proteções:**

- escuta só em 127.0.0.1;
- não serve pastas ocultas, `data/backups` nem `.tmp`;
- envia `Cache-Control: no-store`;
- fixa os tipos MIME (no Windows, `.js` pode vir como `text/plain`);
- desliga o QuickEdit do console do Windows.

**Opções:** `--porta N` e `--sem-navegador` (ou as variáveis `MAPA_PORTA` e
`MAPA_SEM_NAVEGADOR=1`).

## Convenções

- **Textos da pessoa usuária:** nunca use `innerHTML`; use `el()` / `textContent`.
- **Links:** só abrem se forem http(s) (`linkSeguro`).
- **Caminhos:** sempre relativos (o GitHub Pages serve de uma subpasta).
- **Nomes de arquivo:** minúsculas, sem acento e sem espaço (o Pages diferencia
  maiúsculas).
- **Cores:** preto, branco e cinzas. Só o Sol tem cor. Ícones são SVG em traço
  (sem emojis).
- **Identificadores e textos da interface:** em português.
- **Modo somente leitura:** nunca pode quebrar. Use `podeEditar()` e as classes
  `.so-edicao` / `.so-leitura`.
- **Finais de linha:** `iniciar.bat` usa CRLF e não tem acentos.
  `iniciar.command` usa LF e bit executável (`git update-index --chmod=+x`).
  O `.gitattributes` cuida do resto.

## Como testar (sem mexer nos dados reais)

- **Cópia de teste:** copie o projeto para uma pasta temporária e rode lá:
  `python iniciar.py --porta 8765 --sem-navegador`.
  Outra porta também isola a reserva do localStorage.
- **Somente leitura (como no GitHub Pages):** `python -m http.server 8770` na
  cópia.
- **Desempenho:** `?teste=150` na URL. No console, `await mapaDepuracao.medirPanZoom()`.
- **Depuração:** `window.mapaDepuracao` expõe `estado`, `camera`,
  `persistencia` e `acoes`.
- **Lógica sem navegador:** `js/modelo.js` e `js/estado.js` não dependem de
  navegador e podem ser testados com Node (`node --input-type=module`).

## Armadilhas conhecidas

- **Desempenho: não ponha variáveis CSS que mudam com o zoom em `#mundo`.**
  Variáveis CSS são herdadas, então mudar uma em `#mundo` recalcula o estilo do
  mapa inteiro (cerca de 20 ms com 150 cards e 300 conexões). A espessura das
  linhas é o atributo `stroke-width` do `<svg>`, que as linhas herdam; as setas
  usam `markerUnits="strokeWidth"`. Os textos em destaque recebem `scale` inline
  (só eles). As alças têm tamanhos fixos por faixa de zoom (`data-detalhe`).
- **Alças:** ficam com `opacity: 0`, e não `visibility: hidden`. Um elemento
  oculto não recebe o clique, e um gesto rápido acabaria arrastando o card em
  vez de criar a conexão.
- **Painel oculto do navegador embutido:**
  - o `requestAnimationFrame` pausa e o evento `close` do `<dialog>` não dispara.
    Por isso `escolher()` resolve a resposta no clique/Esc. Não volte a depender
    de `close`;
  - capturas e medições de quadros por segundo exigem o painel visível;
  - a câmera (estado) pode ficar à frente do `transform` aplicado na tela.
    Para testar a lógica sem quadros, chame `renderizarAgora()` de
    `js/cards.js` direto.
- **Commits no PowerShell 5.1:** uma mensagem com aspas duplas quebra o
  argumento. Grave a mensagem num arquivo e use `git commit -F arquivo`.
- **`data/estudos.json`:** são os dados da pessoa usuária. Nunca entram nos
  commits de fase (faça `git add` só de código e documentação). O servidor
  aceita arquivos com BOM (Bloco de Notas).
- **Conexão recusada no Windows:** leva cerca de 2 s, então o "erro ao salvar"
  aparece alguns segundos depois de o servidor cair.
- **`.bat` no sandbox do Claude:** `NoDefaultCurrentDirectoryInExePath=1`, então
  chame o `.bat` pelo caminho completo ao testar (como o Explorer faz).
- **Firefox:** leia `deltaMode` antes de `deltaY` nos eventos de roda. Ele
  informa "linhas" para a roda do mouse.

## Contrato das animações

Definido na Fase 4 (`animacoes/CONTRATO.md`).
