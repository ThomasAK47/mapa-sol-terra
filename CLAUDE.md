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
- [x] Fase 3: hierarquia (card pai no painel, tamanhos por nível, recolher/expandir
  com "+N", linhas pai → filho, conexões redirecionadas e agrupadas, arrastar pai
  com filhos / Alt só o pai) e busca (Ctrl+F, Enter/Shift+Enter, expansão temporária)
- [x] Fase 4: animações (manifesto relido ao voltar à janela, campo "Animação" no
  painel, janela grande com `<iframe sandbox="allow-scripts">` criado ao abrir e
  removido ao fechar, Esc por mensagem, `_modelo.html`, demonstração,
  `CONTRATO.md`, cabeçalho de isolamento no servidor)
- [ ] Fase 5: efeitos visuais, botão de desempenho, README e CLAUDE.md finais, GitHub Pages

## Arquitetura

- **Sem build, sem npm, sem bibliotecas.** A única dependência externa é a
  fonte Inter (Google Fonts), com a fonte do sistema como reserva.
- **Módulos ES** em `js/`. Funcionam no servidor local e no GitHub Pages (não em
  `file://`).
- **Camadas da tela, de trás para frente:**
  1. `<canvas id="fundo">`: Sol, Terra e limites das zonas;
  2. `#mundo`: recebe um único `transform` de pan/zoom. Contém, nesta ordem:
     - o `<svg id="camada-conexoes">`, com os grupos `#linhas-familia`
       (pai → filho), `#linhas-conexoes` (conexões) e `#linhas-redirecionadas`
       (tracejadas);
     - os textos das conexões (HTML);
     - os cards (HTML);
  3. `#rotulos-zonas`: nomes presos ao topo;
  4. interface: barra, painel, faixas, toasts, `<dialog id="dialogo">`
     (confirmações) e `<dialog id="janela-animacao">` (o iframe da animação).

| Arquivo | Responsabilidade |
|---|---|
| `js/principal.js` | Inicialização: modo (edição / leitura / teste), carga dos dados, câmera inicial |
| `js/estado.js` | Dados em memória. **Único caminho de alteração** (`alterar`, gestos). Desfazer/refazer (100 ações), seleção |
| `js/modelo.js` | Versão do formato, `migrar()`, `normalizar()` (reparo + avisos), geometria das zonas |
| `js/persistencia.js` | Leitura, salvamento automático, reserva no localStorage, conflito, exportar/importar |
| `js/camera.js` | Pan/zoom, roda/touchpad/pinça, área útil, posição guardada |
| `js/fundo.js` | Canvas: Sol, Terra com linhas de campo, limites e nomes das zonas |
| `js/cards.js` | Desenho dos cards (reconciliação por id): esconde os que estão em pai recolhido, classes `nivel-1..3` (escala), botão "+N"/"−", classes de foco e de busca, tamanhos medidos (`tamanhoDoCard` já aplica a escala do nível), faixa de zoom (`data-detalhe`), alças. Chama `aoRenderizarCards` no fim |
| `js/conexoes.js` | Linhas pai → filho; conexões como curvas SVG (Bézier quadrática, leque por par de cards **visíveis**), setas, textos no meio; conexões de cards escondidos redirecionadas ao representante (tracejadas; várias viram "N conexões", com `data-expandir`); linha provisória; espessura constante na tela |
| `js/hierarquia.js` | `hierarquia()` em cache: filhos, nível, representante visível, visíveis, total de descendentes. `descendentes`, `podeSerPai`, `ancestraisRecolhidos`, `estaRecolhido` (considera o recolhimento local da vitrine e as expansões temporárias da busca) |
| `js/busca.js` | Campo de busca: `filtrarCards` (função pura), resultados na ordem do mapa, Enter/Shift+Enter/Esc, expansão temporária de pais recolhidos |
| `js/editor-conexao.js` | Janelinha presa ao meio da conexão: texto, inverter, com/sem seta, excluir (ou só leitura) |
| `js/foco.js` | `focoAtual()`: card selecionado + vizinhos (pelas pontas visíveis) + pai e filhos (`familia`), ou a conexão aberta no editor. Fica suspenso durante a busca |
| `js/interacao.js` | Ponteiro: pan, arrastar card, arrastar alça (nova conexão), clique, duplo clique, pinça, mapa andando sozinho perto da borda |
| `js/painel.js` | Painel lateral (edição e leitura): campos, card pai (sem ele mesmo nem descendentes, agrupado por zona), filhos com recolher/expandir, campo "Animação" (lista do manifesto; a escolha atual continua na lista mesmo fora dele) ou botão "Abrir a animação" na leitura, conexões do card |
| `js/animacoes.js` | Manifesto (`animacoes/manifesto.json`): leitura ao iniciar e quando a janela volta ao foco, `validarManifesto` (função pura, avisos em português), `arquivoDeAnimacaoValido` (regra do nome), `infoDaAnimacao`, `aoMudarManifesto` |
| `js/janela-animacao.js` | Janela da animação: `abrirAnimacaoDoCard`, `fecharAnimacao`, `animacaoAberta`. Confere o arquivo (HEAD), cria o iframe com sandbox, "Recomeçar", fecha com ×/Esc/clique fora/mensagem `fechar-animacao` |
| `js/acoes.js` | Operações: cards (criar, excluir, mudar zona, `definirAnimacao`), hierarquia (`alternarRecolhido`, `expandirCards`, `expandirAte`, `definirPai`), conexões (criar, texto, inverter, seta, excluir, descartar nova), enquadrar, abrir link |
| `js/barra.js` | Barra de ferramentas, indicador de salvamento, menu de opções, atalhos (desligados com a janela de animação aberta, exceto Esc e Ctrl+S) |
| `js/avisos.js` | Toasts, faixas e janelas de confirmação/escolha |
| `js/teste.js` | Modo `?teste=N` (dados fictícios), medidor de quadros, `medirPanZoom()` |
| `js/util.js` | Auxiliares: `el()`, `icone()`, ids, datas, localStorage seguro, `localizarErroJson` (linha/coluna de um erro de JSON) |

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
aplicado com as classes `.modo-foco` no `#palco` e `.em-foco` nos elementos; a
busca, com `.modo-busca`, `.resultado-busca`, `.resultado-atual` e
`.contem-resultado` (pai recolhido que esconde um resultado).

**Mudanças que não vão para o arquivo:** recolher/expandir na vitrine
(`definirRecolhimentoLocal`) e as expansões temporárias da busca
(`expandirTemporariamente` / `limparExpansoesTemporarias`) só mudam a tela. Elas
avisam os módulos com `estado.avisarMudancaVisual()` (notificação `'visual'`, que
não salva nem entra no desfazer). Caches como `hierarquia()` usam
`versaoDosDados()`, que muda a cada notificação, exceto `'selecao'`.

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
- envia tudo o que está em `/animacoes/` com
  `Content-Security-Policy: sandbox allow-scripts`. Assim, uma animação aberta
  direto numa aba também tem origem opaca: não lê o localStorage do app e não
  grava, porque o `Origin: null` é recusado;
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
  `persistencia`, `acoes`, `hierarquia`, `busca`, `animacoes` e
  `janelaAnimacao`.
- **Navegador de verdade (Edge sem janela):** o navegador embutido do Claude não
  carrega iframes com sandbox (veja "Armadilhas"). Para testar animações e
  medir quadros por segundo reais, controle o Edge pelo protocolo de depuração
  (WebSocket do Node 22+), sempre com perfil temporário:
  `msedge --headless --remote-debugging-port=9333 --user-data-dir=<pasta temporária>`.
  - Acrescente `--enable-gpu --use-angle=d3d11` para usar a placa de vídeo.
  - O iframe da animação roda em outro processo: para avaliar código dentro
    dele, use `Target.setAutoAttach` com `flatten: true`.
- **Lógica sem navegador:** `modelo`, `estado`, `hierarquia`, `foco`, `acoes`
  (exceto o que abre janelas ou avisos) e `busca.filtrarCards` rodam no Node
  (`node --input-type=module`). Use como base uma cópia fixa dos dados de exemplo
  (ex.: `git show b10e48d:data/estudos.json`), **nunca** o `data/estudos.json`
  atual, que muda com o uso.
- **Gestos simulados:** dá para disparar `PointerEvent`s sintéticos num card (por
  exemplo, com `altKey` para testar Alt + arrastar). A captura do ponteiro é
  protegida (`capturarPonteiro`), porque o navegador a recusa para ponteiros
  simulados.

## Armadilhas conhecidas

- **Desempenho: não ponha variáveis CSS que mudam com o zoom em `#mundo`.**
  Variáveis CSS são herdadas, então mudar uma em `#mundo` recalcula o estilo do
  mapa inteiro (cerca de 20 ms com 150 cards e 300 conexões). A espessura das
  linhas é o atributo `stroke-width` do `<svg>`, que as linhas herdam; as setas
  usam `markerUnits="strokeWidth"`. Os textos em destaque recebem `scale` inline
  (só eles). As alças têm tamanhos fixos por faixa de zoom (`data-detalhe`).
- **Desempenho do zoom com muitas conexões** (medido na Fase 4, no Edge com
  placa de vídeo, 150 cards e 300 conexões):
  - mover o mapa roda a cerca de 144 qps;
  - o zoom contínuo (pinça) cai para 33 a 53 qps, com quadros de até 250 ms;
  - o gargalo é a repintura (raster) do `<svg>` das conexões a cada mudança de
    escala, e `will-change: transform` não evita isso;
  - `shape-rendering: optimizeSpeed` acelera, mas deixa as linhas finas com cara
    de tracejadas, o que confunde com as redirecionadas;
  - um protótipo em canvas, com as curvas num único `Path2D`, deixou o zoom a
    cerca de 90 qps, mas mover caiu para 77 a 100 qps;
  - ainda não há decisão (proposta para a Fase 5).
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
- **Navegador embutido e iframes com sandbox:** ele bloqueia qualquer iframe com
  `sandbox` que carregue um endereço (`net::ERR_BLOCKED_BY_CLIENT`, até para o
  `README.md`). É uma regra dele, não do app. Teste as animações no Edge sem
  janela (veja "Como testar").
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

As regras completas estão em `animacoes/CONTRATO.md`, o texto que a pessoa
usuária cola nas conversas ao pedir animações novas. Se o comportamento da
janela mudar, atualize o contrato junto. Resumo técnico:

- **Arquivos:** cada animação é um HTML autossuficiente em `animacoes/`.
  `_modelo.html` é o esqueleto comentado; `demonstracao.html` é o exemplo (pontos
  em onda, sem física).
- **Manifesto:** `animacoes/manifesto.json`, no formato
  `{ "animacoes": [{ "arquivo", "titulo", "descricao" }] }` (também aceita só a
  lista). Outras chaves, como `"leia-me"`, são ignoradas.
  - `validarManifesto()` deixa de fora os itens inválidos, com um aviso em
    português que o painel mostra.
  - Um erro de JSON aparece com linha e coluna.
  - O manifesto é relido no evento `focus` da janela. Sem resposta do servidor,
    a lista anterior é mantida.
- **Nome do arquivo:** `^[a-z0-9][a-z0-9_-]*\.html$` (`arquivoDeAnimacaoValido`).
  - A regra vale para o manifesto e também para `card.animacao` na hora de
    abrir, porque o JSON pode ter sido editado à mão.
  - Nenhum nome vira endereço sem essa conferência.
  - `normalizar()` não mexe em `card.animacao`.
- **Janela:** `<dialog id="janela-animacao">` com `showModal()`.
  - O iframe tem `sandbox="allow-scripts"` (atributo definido antes do `src`) e
    `referrerpolicy="no-referrer"`. Ele é criado ao abrir e removido ao fechar.
  - Antes de criá-lo, um `HEAD` confere se o arquivo existe. Um 404 vira uma
    mensagem explicativa no lugar do iframe.
  - O foco fica no `<dialog>` (`tabindex="-1"`), não no primeiro botão.
  - O Esc na janela usa `stopPropagation`, para não fechar o painel junto.
- **Mensagem aceita:** só `{ tipo: 'fechar-animacao' }` (o Esc com o foco dentro
  da animação), e só se `evento.source` for o iframe aberto.
- **Sandbox:** a animação não acessa `localStorage` nem `parent` (dá
  `SecurityError`). Também não abre `alert`, pop-ups ou tela cheia. O contrato
  explica isso a quem escreve as animações.
- **Nunca** desenhe animações dentro dos cards no mapa.
