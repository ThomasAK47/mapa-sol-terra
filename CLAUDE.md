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
- [x] Fase 5: efeitos visuais (estrelas, vento solar, coroa do Sol animada,
  flutuação dos cards), botão de efeitos, pinça 50% mais sensível, README e
  CLAUDE.md finais, passo a passo do GitHub Pages

**Todas as fases do plano foram entregues.** Depois delas vieram melhorias
pedidas pela pessoa usuária, um commit para cada:

- uma única alça de conexão, embaixo do card;
- tamanho dos cards: alça no canto do card (vale para os descendentes) e barra
  "Tamanho de todos os cards" em Opções;
- zonas editáveis: nome, descrição, largura, zona nova e exclusão;
- vento solar radial, contornando o primeiro anel do campo da Terra;
- animações de verdade: `animacoes/magnetopausa.html`, a série do campo
  geomagnético, em três partes, `animacoes/vento-solar-bz.html`,
  `animacoes/corrente-de-anel.html`, `animacoes/flare-solar.html` e
  `animacoes/estrutura-do-sol.html` (veja "Contrato das animações");
- cards legíveis com o zoom afastado e várias animações por card (formato 2
  dos dados): veja "Legibilidade dos cards" e "Modelo de dados";
- textos editáveis das animações (botão "Editar textos" da janela da
  animação, com prévia e gravação no próprio arquivo): veja "Textos editáveis
  das animações".

O que vem depois também é decidido por ela:

- **Ajustes de layout:** ela pediu para deixá-los para depois das fases. Espere
  o pedido dela; não proponha mudanças visuais grandes por conta própria.
- **GitHub:** o push e a ativação do GitHub Pages são feitos por ela (passo a
  passo no README).
- **Animações novas:** chegam por outras conversas, seguindo
  `animacoes/CONTRATO.md`, ou são pedidas aqui, com a física descrita por ela.

## Arquitetura

- **Sem build, sem npm, sem bibliotecas.** A única dependência externa é a
  fonte Inter (Google Fonts), com a fonte do sistema como reserva.
- **Módulos ES** em `js/`. Funcionam no servidor local e no GitHub Pages (não em
  `file://`).
- **Camadas da tela, de trás para frente:**
  1. `<canvas id="fundo">`: estrelas, coroa do Sol, vento solar, Sol, Terra e
     limites das zonas;
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
| `js/modelo.js` | Versão do formato (2), `migrar()` (1 → 2: `animacao` vira a lista `animacoes`), `normalizar()` (reparo + avisos), geometria das zonas, operações de zona como funções puras (`definirLarguraDaZona`, `inserirZonaDepois`, `unirZonaComVizinha`) |
| `js/zonas.js` | Edição das zonas no modo de edição: janelinha embaixo do nome (nome, descrição, "Nova zona à direita", excluir) e arrasto das marcas de largura (um gesto = uma ação no desfazer). Usa delegação de eventos em `#rotulos-zonas` |
| `js/persistencia.js` | Leitura, salvamento automático, reserva no localStorage, conflito, exportar/importar |
| `js/camera.js` | Pan/zoom, roda/touchpad/pinça (sensibilidades em constantes no topo; `GANHO_DA_PINCA = 1.5`, a pedido), área útil, posição guardada |
| `js/fundo.js` | Canvas: estrelas, coroa do Sol (`desenharCoroa`), vento solar, Sol, Terra com linhas de campo, limites das zonas. Cria e posiciona os nomes das zonas e as marcas de largura (`.rotulo-zona`, `.alca-zona`, com `data-zona`). Redesenha a cada mudança da câmera, quando uma zona muda e, com os efeitos ligados, a cada passo do relógio dos efeitos |
| `js/ceu.js` | Estrelas (estáticas, com paralaxe de 4% só no arrasto) e partículas de vento solar (espaço do mapa; saem do Sol em todas as direções e contornam o primeiro anel do campo da Terra). Só decoração |
| `js/efeitos.js` | Liga/desliga os efeitos (`definirEfeitos`, guardado no localStorage; padrão desligado se o sistema pede menos movimento), classe `efeitos-ligados` no `<body>`, relógio a 30 passos/s (`tempoDosEfeitos`, `aoPassoDosEfeitos`), parado com a janela de animação aberta |
| `js/cards.js` | Desenho dos cards (reconciliação por id): esconde os que estão em pai recolhido, aplica o tamanho final no `transform` de cada card, botão "+N"/"−", botão ▶ das animações (com o número delas), classes de foco e de busca, tamanhos medidos (`tamanhoDoCard` já aplica o tamanho final), faixa de zoom do mapa (`data-detalhe` no `#palco`) e faixa de cada card (`data-faixa`, título da faixa "compacto"; veja "Legibilidade dos cards"), alça de conexão (uma, embaixo) e alça de tamanho (canto inferior direito), ritmo da flutuação de cada card (`--flut-duracao`, `--flut-atraso`, classe `flut-a/b/c`, a partir do id). Chama `aoRenderizarCards` no fim |
| `js/conexoes.js` | Linhas pai → filho; conexões como curvas SVG (Bézier quadrática, leque por par de cards **visíveis**), setas, textos no meio; conexões de cards escondidos redirecionadas ao representante (tracejadas; várias viram "N conexões", com `data-expandir`); linha provisória; espessura constante na tela |
| `js/hierarquia.js` | `hierarquia()` em cache: filhos, nível, representante visível, visíveis, total de descendentes, tamanho final de cada card (`escala`). `descendentes`, `podeSerPai`, `ancestraisRecolhidos`, `estaRecolhido` (considera o recolhimento local da vitrine e as expansões temporárias da busca) |
| `js/busca.js` | Campo de busca: `filtrarCards` (função pura), resultados na ordem do mapa, Enter/Shift+Enter/Esc, expansão temporária de pais recolhidos |
| `js/editor-conexao.js` | Janelinha presa ao meio da conexão: texto, inverter, com/sem seta, excluir (ou só leitura) |
| `js/foco.js` | `focoAtual()`: card selecionado + vizinhos (pelas pontas visíveis) + pai e filhos (`familia`), ou a conexão aberta no editor. Fica suspenso durante a busca |
| `js/interacao.js` | Ponteiro: pan, arrastar card, arrastar a alça de conexão (nova conexão), arrastar a alça de tamanho (o card cresce em volta do centro; duplo clique volta a 100%), clique, duplo clique, pinça, mapa andando sozinho perto da borda |
| `js/painel.js` | Painel lateral (edição e leitura): campos, card pai (sem ele mesmo nem descendentes, agrupado por zona), filhos com recolher/expandir, campo "Animações" (as do card em ordem, cada uma com abrir/subir/tirar, e uma lista do manifesto para acrescentar; uma animação fora do manifesto continua no card, com aviso) ou um botão por animação na leitura, conexões do card |
| `js/animacoes.js` | Manifesto (`animacoes/manifesto.json`): leitura ao iniciar e quando a janela volta ao foco, `validarManifesto` (função pura, avisos em português), `arquivoDeAnimacaoValido` (regra do nome), `infoDaAnimacao`, `aoMudarManifesto` |
| `js/janela-animacao.js` | Janela da animação: `abrirAnimacaoDoCard(id, indice)`, `abrirAnimacao`, `fecharAnimacao({ forcar })`, `animacaoAberta`. Confere o arquivo (HEAD), cria o iframe com sandbox, "Recomeçar", botões 1, 2, 3… quando o card tem várias animações (cada troca descarrega a anterior), fecha com ×/Esc/clique fora/mensagem `fechar-animacao`. Botão "Editar textos" (só no modo `edicao`), que abre o editor ao lado; `carregar({ manterLugar })` põe a prévia e o lugar depois do `#`; guarda `ondeEsta` (mensagem `animacao-esta-em`); com textos não salvos, fechar e trocar de animação perguntam antes |
| `js/editor-textos.js` | Editor dos textos de uma animação: lê o HTML (`lerTextosDaAnimacao`: `data-texto`, `T_`/`H_` achados por `acharTextosNoScript`, o bloco `textos-editados`), agrupa (cabeçalho, passos, controles, "textos que mudam", seções do desenho, "não usa mais"), campos com enfeites (`limparEnfeites`, `execCommand`), marcadores `{0}` conferidos, prévia (`textosDaPrevia`, ~0,9 s sem digitar), procurar, "Só o que está na tela", Salvar (Ctrl+S) / Descartar, conflito (409) |
| `js/acoes.js` | Operações: cards (criar, excluir, mudar zona, `acrescentarAnimacao`, `removerAnimacao`, `subirAnimacao`, `definirEscalaDoCard`, `definirEscalaDosCards`), zonas (`editarZona`, `criarZonaDepoisDe`, `excluirZona`), hierarquia (`alternarRecolhido`, `expandirCards`, `expandirAte`, `definirPai`), conexões (criar, texto, inverter, seta, excluir, descartar nova), enquadrar, abrir link |
| `js/barra.js` | Barra de ferramentas, indicador de salvamento, botão de efeitos (`#bt-efeitos`), menu de opções (barra "Tamanho de todos os cards", modo da roda), atalhos (desligados com a janela de animação aberta, exceto Esc e Ctrl+S) |
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

**Geometria das zonas:** `estado.geometria()` fica em cache até a próxima
notificação. Dentro de uma alteração que mexe nas zonas, calcule com
`geometriaZonas(dados.zonas)`, que é sempre atual.

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

## Modelo de dados (versão 2)

- **Zonas:** `{ id, nome, detalhe, ordem, largura }`, dispostas lado a lado pela
  `ordem`, a partir de x = 0. São editáveis pelo app (`js/zonas.js`):
  - mudar a largura desloca as zonas seguintes, com seus cards e a Terra, e
    não troca nenhum card de zona (o `x` é relativo ao início da zona);
  - a largura mínima é 300, ou o `x` do card mais à direita da zona + 10;
  - zonas criadas pelo app têm id `z-xxxxxxxx`;
  - excluir uma zona é uni-la à vizinha (`unirZonaComVizinha`): o espaço e os
    cards passam para a vizinha, e nenhuma posição absoluta muda.
- **Raiz:** `{ versao, escalaDosCards, zonas, cards, conexoes }`.
  `escalaDosCards` é o tamanho de todos os cards (1 = normal; de 0,5 a 2).
- **Card:** `{ id, titulo, descricao, zona, x, y, pai, recolhido, escala, tags, animacoes, linkDocs, criadoEm, atualizadoEm }`.
  - **`animacoes`** é a lista de animações do card (nomes de arquivo da pasta
    `animacoes/`), na ordem em que a janela as mostra (1, 2, 3…). Na versão 1
    era um campo só, `animacao` (um nome ou `null`); `MIGRACOES[1]` faz a
    troca, e o app guarda o arquivo antigo em `data/backups`
    (`…-antes-de-migrar.json`) antes da primeira gravação no formato 2.
    `normalizar()` tira nomes repetidos e itens que não são texto (com
    aviso) e aceita também um nome solto ou o campo antigo, de um arquivo
    editado à mão.
  - **`x` é relativo ao início da zona** e `(x, y)` é o **centro** do card. Use
    `posicaoAbsoluta` / `definirPosicaoAbsoluta`.
  - **`escala`** é o tamanho próprio do card (1 = normal; de 0,5 a 3) e vale
    também para os descendentes. O tamanho final é
    `nível × escala do card × escala de cada ancestral × escalaDosCards`, e
    fica em `hierarquia().escala`. Mudar o tamanho não move nenhum card.
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
  - `mapa-sol-terra:efeitos`: efeitos animados ligados (`true`) ou não;
  - `mapa-sol-terra:reserva`: alterações não gravadas.

## Legibilidade dos cards

Pedido da pessoa usuária: o texto só aparecia com muito zoom (mesmo com os
cards no tamanho 2×), e o ícone da animação ficava escondido. Em `js/cards.js`:

- **Faixa de cada card, pelo tamanho REAL dele na tela** (zoom × tamanho do
  card), atributo `data-faixa`:
  - `completo` (a partir de 0,7): título, descrição e o ícone do Docs;
  - `compacto` (abaixo disso, quando a descrição teria menos de ~9 px na
    tela): só o título, que cresce dentro do card para ficar com uns 12 px na
    tela, até o maior tamanho que cabe na largura do card sem quebrar palavras
    e em até 3 linhas (`tamanhoMaximoDoTitulo`, medido num canvas); daí em
    diante, ele diminui com o zoom, como o resto do mapa.
- **Botão ▶ das animações** (`.card-animacao`): sentado na borda de cima do
  card, à esquerda, em qualquer zoom, com o número de animações quando são
  várias. Quando ficaria menor que 20 px na tela, ganha `scale` (cresce para
  cima, sem cobrir o título).
- **Desempenho:** esses ajustes mudam o tamanho dos cards (medir de novo,
  redesenhar as conexões) e qualquer mudança de estilo dentro de `#mundo`
  obriga a repintar o mapa. Feitos a cada quadro, derrubavam o zoom com 150
  cards para 16 a 30 qps. Por isso só acontecem quando o zoom para
  (`ESPERA_PARA_AJUSTAR`, 300 ms sem mudar; mover sem zoom não ajusta nada).
  O ajuste custa um quadro (~50 ms com 150 cards e 300 conexões); durante o
  gesto, a fluidez é a mesma de antes. Não volte a ajustar a cada quadro.
- A faixa do mapa todo (`data-detalhe` no `#palco`) continua valendo para as
  alças, os textos das conexões e a flutuação.

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
- `POST /api/textos-da-animacao` (o editor de textos):
  - as mesmas checagens de `Host`, `Origin`, `Content-Type` e tamanho (até 2 MB);
  - corpo `{ arquivo, antes, textos, forcar }`. O nome segue
    `^[a-z0-9][a-z0-9_-]*\.html$` e o arquivo precisa existir em `animacoes/`;
  - troca **só** o bloco `<script type="application/json"
    id="textos-editados">` (regex em bytes; o resto do arquivo e o fim de linha
    ficam iguais). O JSON sai indentado, em UTF-8, com `<` escrito `<`;
  - se o bloco do arquivo não for igual a `antes`, responde 409 com os textos
    atuais (a menos que venha `forcar`);
  - respostas: 200 `{ok, textos}`, 409, 404 (`animacao-inexistente`), 422
    (`arquivo-invalido`, `textos-invalidos`, `sem-textos-editaveis`), 403/415/413.

**Gravação e backups:**

- A gravação é atômica (`.tmp` + `os.replace`, com novas tentativas no Windows)
  e sai indentada, em UTF-8.
- `data/backups/diario-AAAA-MM-DD.json` é feito antes da primeira gravação do
  dia (mantém 30).
- `seguranca-<carimbo>-<motivo>.json` é feito antes de sobrescrever num
  conflito, de importar, de gravar dados reparados, ou quando uma gravação
  remove mais da metade dos cards (mantém 30).
- `data/backups/animacoes/<nome>-<carimbo>.html` é a cópia do arquivo da
  animação antes de cada gravação de textos (mantém 20 por animação). A
  gravação é atômica, como a dos dados (o `.tmp` fica em `animacoes/` por um
  instante e não é servido).

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

## Efeitos visuais

São só decoração: não representam medidas nem um modelo físico, e nunca tocam
nos dados.

- **Liga/desliga:** `js/efeitos.js` guarda a escolha em
  `mapa-sol-terra:efeitos` e põe a classe `efeitos-ligados` no `<body>`. Sem
  escolha guardada, o padrão é ligado, exceto com `prefers-reduced-motion`.
- **Desligado custa zero:** sem os efeitos, nenhum laço roda e o fundo só é
  redesenhado quando a câmera ou os dados mudam. Mantenha isso em qualquer
  efeito novo.
- **Relógio:** 30 passos por segundo (`tempoDosEfeitos()`, em segundos). Ele
  para com os efeitos desligados e com a janela de animação aberta.
- **Fundo:** a cada passo, `fundo.js` redesenha, a menos que a câmera tenha
  desenhado há menos de 25 ms (mapa em movimento). Um redesenho custa menos de
  0,1 ms de JavaScript.
- **Estrelas:** sempre visíveis, sem piscar. Deslocam-se 4% do que o mapa é
  arrastado; o zoom não as move (`acompanharCamera` só soma arrastos).
- **Vento solar** (pedido da pessoa usuária: radial e desviando no primeiro
  anel do campo):
  - até 300 partículas no espaço do mapa. Cada uma se afasta do centro do Sol
    em linha reta, some depois de alguns segundos, e outra nasce num ponto da
    tela ou na borda do Sol. Assim a quantidade na tela é parecida em qualquer
    zoom, e a velocidade é constante na tela;
  - o "escudo" é o primeiro anel do campo da Terra: meia elipse do lado do Sol
    mais duas retas horizontais. Os parâmetros saem do próprio desenho das
    linhas de campo (`calcularPrimeiroAnel`, em `js/fundo.js`), com desvio de
    0,5%. Mudou o desenho das linhas, o escudo acompanha;
  - junto ao escudo, a partícula perde a parte do movimento que entraria nele e
    escorrega por fora. Se mesmo assim entrar, é devolvida à borda;
  - o custo por redesenho do fundo continua abaixo de 0,1 ms;
  - `ceu.particulasDoVento()` devolve as partículas vivas, para testes.
- **Coroa:** um halo que "respira" e cinco manchas de brilho esfumado
  (`LOBOS_DA_COROA`). Um contorno preenchido não serve: fica com borda dura.
- **Flutuação dos cards:** animação CSS de `translate` (`flutuar-a/b/c`), com o
  ritmo de cada card vindo do id.
  - Ela roda na placa de vídeo, sem redesenhar o mapa, e não tem custo
    mensurável nem com 130 cards.
  - As regras usam as propriedades separadas (`animation-name` etc.), e não o
    atalho `animation`. Assim a pausa (`animation-play-state`) vale sempre.
  - Ela pausa com `#palco.movendo`, `.panoramica`, `.arrastando` e
    `.conectando`, sob o mouse e atrás da janela de animação.
  - Fica desligada com `data-detalhe="baixo"` e com `prefers-reduced-motion`.
  - As linhas não flutuam. As folgas em `js/conexoes.js` (`FOLGA_INICIO`,
    `FOLGA_SETA`, `FOLGA_FAMILIA`) cobrem os 2,5 px do movimento.
- **Nunca** anime a posição dos cards por JavaScript nem por `left`/`top`: isso
  obriga o navegador a repintar o mapa, incluindo o SVG das conexões.

## GitHub Pages (a vitrine)

- O repositório é `ThomasAK47/mapa-sol-terra`, e a vitrine fica em
  `https://thomasak47.github.io/mapa-sol-terra/`. O push e a ativação são da
  pessoa usuária.
- **Subpasta:** todos os caminhos do app são relativos.
- **Maiúsculas:** o Pages diferencia maiúsculas nos nomes de arquivo; o Windows,
  não. Um `import` com a grafia errada funciona aqui e quebra lá.
- **`.nojekyll`:** sem ele, o Pages não serve arquivos que começam com `_`
  (`animacoes/_modelo.html`).
- **Modo:** sem `api/status` (404), o app abre só para leitura.
- **O que vai para lá:** tudo o que não está no `.gitignore`, incluindo
  `data/estudos.json`.

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
- **Somente leitura (como no GitHub Pages):**
  `python -m http.server 8770 --bind 127.0.0.1` na cópia.
- **Simulação fiel do Pages:** um servidor estático que sirva a cópia sob
  `/mapa-sol-terra/`, confira a grafia exata de cada pedaço do caminho e só
  entregue o que `git ls-files --cached --others --exclude-standard` lista.
  Nenhum pedido pode falhar, exceto `api/status`.
- **Desempenho:** `?teste=150` na URL. No console, `await mapaDepuracao.medirPanZoom()`.
- **Depuração:** `window.mapaDepuracao` expõe `estado`, `camera`,
  `persistencia`, `acoes`, `hierarquia`, `busca`, `animacoes`,
  `janelaAnimacao` e `efeitos`.
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
  - **decisão:** a pessoa testou e disse que a pinça não trava, então as linhas
    continuam em SVG. Só troque para canvas se ela pedir;
  - os efeitos da Fase 5 não mudam esses números (medido com e sem eles).
- **Roda do mouse nos testes:** um `WheelEvent` criado em JavaScript não tem o
  `wheelDeltaY` de uma roda de verdade, e o app o trata como touchpad. Para
  simular a roda, use `Input.dispatchMouseEvent` com `type: 'mouseWheel'` (CDP).
  O `WheelEvent` fabricado, com `ctrlKey: true` e `deltaY` pequeno, serve para
  simular a pinça.
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

## Textos editáveis das animações

Pedido da pessoa usuária: trocar os textos das animações (completar uma
explicação, cortar o que sobra) sem pedir a reescrita numa conversa. **As
fórmulas e as contas ficam de fora:** essas ela pede numa conversa.

- **No arquivo de cada animação:**
  - o bloco `<script type="application/json" id="textos-editados">`, logo
    antes do script principal: `{ versao: 1, painel, gerados, desenho }`, só
    com as trocas (o original continua no código). Quem grava é o app;
  - `painel`: elementos com `data-texto="nome"` (chave = o nome). Ao abrir, o
    trecho comum troca o `innerHTML` deles (depois de `textoSeguro`);
  - `gerados`: textos do painel montados pelo script, escritos como
    `` H_`…` `` (chave = o texto, com `{0}`, `{1}`… no lugar de cada `${…}`);
  - `desenho`: textos do canvas, `` T_`…` `` (mesma regra de chave; texto
    puro). `T_` anota quando cada texto foi usado (`textosVistos`);
  - enfeites aceitos: `b`, `strong`→`b`, `i`, `em`→`i`, `sup`, `sub`,
    `small`, `br` e `span`, só com o atributo `class`. O conteúdo de
    `script`/`style` é descartado;
  - o trecho comum (o "1b" do `_modelo.html`, igual ao do CONTRATO.md), logo
    depois do trecho do Esc. `avisarOndeEsta()` fica no fim de `mostrarVisao` e
    de `mostrarPasso` (e de `mostrarParte`, se houver partes);
    `voltarAoLugarDaPrevia()` na última linha do script;
  - **partes dentro dos passos** (desde a estrutura do Sol): o trecho comum
    manda também `parte` (`estado.parte`) e, na prévia, chama
    `mostrarParte(n)` se ela existir. O app guarda `ondeEsta.parte` e põe
    `&parte=N` no endereço (só se N > 0). Nas animações sem partes, nada muda;
  - o editor chama os grupos de "Passo"; um elemento com
    `data-palavra-do-grupo="Camada"` em volta dos `[data-passo]` troca a
    palavra. Rótulos de `passo-N-parte-K-titulo/explicacao/item/legenda`:
    "Parte K: …".
- **Por que `T_` e `H_`, com traço:** `T` e `H` colidiam com variáveis das
  animações (um `const T` local na geo-2 escondia a função, e o passo 1 parava
  com erro a cada quadro; o flare usa `T` para temperatura e `H` para altura).
- **Nomes de `data-texto`** (o editor agrupa e rotula por eles):
  `titulo-complemento`, `resumo-titulo`, `resumo-texto` (o parágrafo do
  resumo; a primeira conversão o deixou de fora e ele foi marcado depois, em
  2026-10-13), `leitura-<id do dd>`,
  `dica`, `botao-ver-de-perto`, `controle-<id do input>` e, dentro de
  `[data-passo]`, `passo-N-titulo` (o texto do botão, num `<span>`),
  `passo-N-explicacao` (`-2` se houver outra), `passo-N-item-K` (ou
  `passo-N-item-K-<classe>` para as partes de um item, como nas causas do
  vento solar) e `passo-N-legenda` (os `<dd>` fixos). N começa em 1.
- **Ficaram de fora, de propósito:** `por('conta-…')`, `o-…`, `formula-…` e
  `tabela` (a geo-2 tem os cabeçalhos como `H_` dentro dela); objetos com
  `formula: true` e `escreverFormula`; textos que são só número, símbolo e
  unidade (`B = ${…}`, `${…} nPa`); os `<dt>` das legendas (os `<dd>` são
  editáveis, inclusive os montados em `por('legenda-…')`); palavras soltas de
  funções de formatação (`latitudeEmTexto`, `emRaios`, `vezesMenor`).
- **As sete animações foram convertidas em 2026-10-12** por um conversor feito
  para isso (fica fora do repositório). Depois de convertidas, passaram nos
  testes de antes (94) e por todos os passos sem erro no console. Animações
  novas já vêm assim, pelo contrato.
- **No app** (`js/editor-textos.js`, só no modo `edicao`):
  - lê o HTML da animação com `fetch` e `DOMParser` (documento inerte);
    `acharTextosNoScript` percorre o script pulando comentários, aspas e
    expressões regulares, e entra nos `${…}` (há `H_` dentro de templates);
  - a prévia recria o iframe com `#textos=<JSON>&perto=1&passo=N`
    (`URLSearchParams`). Mudar só o `#` de uma página aberta não a recarrega:
    por isso o iframe é sempre recriado;
  - as mensagens novas, aceitas só do iframe aberto: `animacao-esta-em
    { perto, passo }` e `textos-na-tela { chaves }`, resposta a
    `quais-textos-na-tela` (o app pergunta a cada 1 s com o filtro ligado).
    A conta "na tela" usa os `T_` do último segundo e o painel do passo aberto;
    os `H_` não entram nela;
  - campos do painel: `contenteditable` (Enter = `<br>`, colar = texto puro,
    B/I/x²/x₂ por `execCommand`); do desenho: `<textarea>` de uma linha;
  - um texto `H_`/`T_` sem algum dos seus marcadores fica com aviso e não entra
    nas trocas (vale o último valor bom). Texto vazio vale (tira o texto).
- **Armadilhas:** um campo dentro de um `<details>` fechado não recebe foco
  (os testes abrem o grupo antes de escrever); não marque com `data-texto` um
  elemento que o script preenche (o conversor pulou os vazios e os com id
  usado em `por`).

## Contrato das animações

As regras completas estão em `animacoes/CONTRATO.md`, o texto que a pessoa
usuária cola nas conversas ao pedir animações novas. Se o comportamento da
janela mudar, atualize o contrato junto. Resumo técnico:

- **Arquivos:** cada animação é um HTML autossuficiente em `animacoes/`.
  `_modelo.html` é o esqueleto comentado; `demonstracao.html` é o exemplo (pontos
  em onda, sem física).
- **`magnetopausa.html`** (a primeira com física, escrita a partir da descrição
  da pessoa usuária): equilíbrio entre a pressão do vento solar,
  2·N·m·v²·cos² ψ, e a pressão magnética, B²/2μ₀.
  - Duas visões: de longe (a magnetopausa inteira; o ponto marcado pode ser
    arrastado) e de perto (a conta em cinco passos, com os números de agora).
  - Toda a física fica na seção 2 do script. Três valores foram assumidos e
    **ainda vão ser conferidos por ela com o professor**: `MASSA` (próton),
    `CAMPO_NA_SUPERFICIE` (31 000 nT, dipolo B₀·(R_T/r)³) e `FATOR_DO_CAMPO`
    (1 = dipolo puro, sem a compressão do campo; dá 7,2 raios da Terra com
    N = 5 por cm³ e v = 400 km/s). Não mude esses valores por conta própria.
  - A forma da parede é a mesma conta repetida em cada ponto (`CURVA`); as
    linhas de campo e as partículas são um esquema.
  - Layout: painel de explicação à direita e barra de controles embaixo do
    desenho; em telas estreitas (até 760 px) ou muito baixas, tudo num painel
    embaixo. A janela do app num notebook dá cerca de 1300 × 550 px: confira
    sempre nesse tamanho.
  - Para testar pelo Edge sem janela: dentro do iframe, `estado`,
    `mostrarVisao(true)` e `mostrarPasso(n)` são acessíveis pelo protocolo de
    depuração (são do escopo global do script).
- **Campo geomagnético, em três animações** (a divisão foi escolhida pela pessoa
  usuária; a física vem da descrição dela, que segue as equações 5.11 a 5.18
  do livro que ela estuda):
  1. `geomagnetico-1-campo-num-ponto.html` (feita): o campo de dipolo num
     ponto. De longe, a Terra como um ímã em barra, com um ponto para arrastar
     e a curva de mesma intensidade. De perto, o desenho gira até "para fora da
     Terra" ficar para cima, e a conta vem em cinco passos: M/r³,
     √(1 + 3 sen² λ), as partes B_r e B_λ, Pitágoras e a agulha da bússola.
     Valores na seção 2 do script: 0,31 gauss = 31 000 nT no equador, ímã
     inclinado 11°. A inclinação da agulha (tan = |B_r|/B_λ) foi tirada das duas
     partes, não do livro.
  2. `geomagnetico-2-linhas-de-campo.html` (feita): a forma das linhas e onde
     elas tocam o chão. De longe, as linhas de R₀ = 2 a 10 (a figura 5.16),
     com um ponto para arrastar: a linha que passa por ele acende. De perto,
     cinco passos com três câmeras (`CAMERA_DA_CENA`):
     - no ponto (passos 1 e 2): r·dλ/dr = B_λ/B_r e dr/r = −2·tan λ·dλ;
     - meia linha (passo 3): r = r₀·cos² λ, em degraus de 5°;
     - o chão do hemisfério norte (passos 4 e 5): cos λ_E = 1/√R₀, a tabela da
       descrição (clicável) e a faixa de 6 a 10 raios, com a oval auroral e o
       índice AE.

     A câmera "viaja" de um lugar a outro (`iniciarViagem`), e os rótulos de
     cada cena aparecem e somem com `forcaDaCena`. Os rótulos das linhas no
     chão são colocados sem sobreposição (`colocarRotulos`). Para testar:
     `escolher({ R0, graus, lado })` também é do escopo global.
     Acréscimos fora da descrição: as setas paralelas do passo 2 (a inclinação
     só depende da latitude) e os pulsos que descem pela faixa no passo 5 (um
     esquema). A descrição fala em "65° a 72°"; a conta dá 65,9°, e a tela
     mostra 66° a 72°.
  3. `geomagnetico-3-alem-do-dipolo.html` (feita): por que o dipolo é só uma
     aproximação. De longe, três territórios (campo irregular até 2 raios; o
     dipolo funciona bem de 2 a 4; além disso, o vento solar deforma), com a
     magnetopausa e o vento solar em esquema. De perto, cinco passos:
     - ímã fora do centro (uns 400 km, para o lado do Pacífico; mais fraco no
       Atlântico Sul): B = 0,31 G ÷ (1 ± d/R_E)³, na superfície, sobre o
       equador do ímã;
     - soma de formas simples: dipolo, quadrupolo, octupolo (não há n = 0);
     - quanto de cada forma: os coeficientes de Gauss, o IGRF;
     - a queda com a distância: potencial ∝ R^−(n+1) e campo ∝ R^−(n+2) (a
       pessoa usuária confirmou: n+1 é do potencial; o campo é a derivada);
     - onde cada modelo vale (volta à visão de longe).

     O campo é a soma das formas simétricas em torno do eixo (`campoEm`), e as
     linhas são seguidas passo a passo (`seguirLinha`, Runge–Kutta), refeitas
     só quando um valor muda (`daSoma`, `doDeslocado`). `MISTURA_DA_CENA` diz
     o que cada cena acrescenta ao desenho; a barra mostra só os controles da
     cena (`data-cenas`). Para testar: `definir({ R, graus, d, quadrupolo,
     octupolo })` também é do escopo global.
     **Assumido, e avisado na tela:** as quantidades de quadrupolo e octupolo
     são de exemplo (não são os coeficientes da Terra); de cada ordem só
     aparece a forma mais simples; R_E = 6 371 km; a deformação pelo vento
     solar (`deformar`), a magnetopausa a 10 raios e a direção do deslocamento
     do ímã são um esquema. Não troque os valores de exemplo por coeficientes
     reais sem ela pedir.
- **`vento-solar-bz.html`** (feita; a física é a seção "1. O vento solar e o
  Bz" do material da pessoa usuária, que cita uma "seção 4" sobre reconexão
  ainda não enviada): o vento solar, o campo que ele traz (IMF) e por que o
  sinal do Bz decide se a energia entra.
  - De longe: o vento chega à Terra trazendo o IMF. A seta laranja muda o Bz
    que sai agora (dá para arrastar; o comprimento cresce com a raiz do Bz,
    `alturaDaSeta`). As linhas do IMF andam com o vento e guardam o Bz com que
    saíram (`linhasDoIMF`): uma mudança só chega à Terra junto com as linhas
    novas (`bzChegando`, com a "frente" tracejada). Com Bz sul, aparecem as
    linhas ligadas (`LINHAS_LIGADAS`: o pedaço de fora em laranja, o de dentro
    em azul) e a energia descendo por elas.
  - De perto, seis passos, cada um com a sua cena (`CAMERA_DA_CENA`,
    `MUNDO_NA_CENA`):
    1. o plasma: um cubinho de 1 cm³ e o tempo de viagem
       (150 milhões de km ÷ v);
    2. o campo congelado: linhas presas ao plasma; 31 000 nT ÷ B;
    3. os eixos do GSM em 3D (arrastar gira) e √(Bx² + By² + Bz²);
    4. o sinal, na frente da magnetopausa;
    5. a regra de −10 nT por mais de 3 h, num gráfico de 24 h;
    6. CME × CIR.
  - **Assumido, e avisado na tela:**
    - N conta os prótons (o texto diz "5 partículas/cm³"), e o desenho põe o
      mesmo número de elétrons;
    - 150 milhões de km e 31 000 nT são acréscimos;
    - magnetopausa a 10 raios, linhas, partículas, a ligação dos campos e as
      cenas da CME e da CIR são esquemas;
    - a curva do passo 5 é inventada. Num intervalo curto a rampa encurta,
      para dar para mostrar um pico de poucos minutos.
  - Para testar: `definir({ bx, by, bz, B, N, v, bzSul, duracao, azimute,
    elevacao })` também é do escopo global. O teste confere que o pedaço de
    fora das linhas ligadas não entra na magnetopausa e que o de dentro não
    sai dela.
- **`corrente-de-anel.html`** (feita; a física é a seção 5.8.3, "The ring
  current", do livro da pessoa usuária, colada de um PDF em inglês): a
  corrente de leste para oeste em volta da Terra que enfraquece o campo no
  chão nas tempestades.
  - **Fórmulas que vieram estragadas do PDF**, lidas assim (conferido com as
    contas do próprio texto e avisado na tela):
    - eq. 5.45: ΔB(nT) = 2π·I(A)/(10·r(km)), o campo no centro de um anel,
      B = μ₀I/2r;
    - o fator das correntes induzidas no solo ("§") lido como 1,5;
    - eq. 5.46: ΔB(nT) ≈ I(A)/r(km);
    - eq. 5.47: ΔB(nT) ≈ 2,6 × 10⁻¹⁴·E(J), com o expoente negativo.
  - Uma corrente só: o estado guarda `I` e `r`. A queda (passo 1) e a energia
    total (passo 5) são calculadas a partir deles; mexer nelas muda `I`
    (`definir({ queda })`, `definir({ E })`).
  - De longe: a Terra vista de cima do polo norte (Sol à esquerda), prótons
    derivando no sentido horário (oeste) e elétrons no anti-horário (leste),
    com a deriva proporcional à energia. O satélite pode ser arrastado: dentro
    do anel, o campo cai; fora, sobe.
  - De perto, sete passos, com três câmeras (`CAMERA_DA_CENA`: `cima`,
    `lado` e `faixa`):
    1. o magnetômetro numa tempestade (gráfico; a curva é um esquema);
    2. o corte de lado: a corrente sai do desenho à direita (⊙) e entra à
       esquerda (⊗), e as voltas do campo dela;
    3. a conta das eq. 5.45 e 5.46;
    4. as duas derivas, de perto da faixa;
    5. a energia total (eq. 5.47);
    6. a inflação, quando a energia das partículas passa a do campo
       (B²/2μ₀ a 5 raios = 2,4 × 10⁻⁸ J/m³; o texto diz 2 × 10⁻⁸);
    7. a plasmapausa e o arco SAR (630 nm), que acende quando a borda de
       dentro da corrente chega a ela (dá para arrastar a borda).
  - **Assumido, e avisado na tela:** R_E = 6 371 km; 31 000 nT no equador
    (para o passo 6); a plasmapausa a 4 raios; a curva da tempestade, as
    partículas, as linhas, a inflação e o arco são esquemas. A razão do
    passo 6 é entre densidades de energia, como no texto (o β, a rigor, é
    uma razão de pressões).
  - Os sentidos do campo da corrente (sul dentro do anel, norte fora) foram
    conferidos no teste com a lei de Biot–Savart.
  - Para testar: `definir({ I, r, queda, E, energia, densidade, borda, satR,
    satAngulo })` também é do escopo global.
- **`flare-solar.html`** (feita; a física é a seção 5.2.2, "The phenomenon of
  the solar flare", do livro da pessoa usuária, colada de um PDF): o brilho
  súbito de uma área pequena do Sol, que solta em minutos a energia que o
  campo juntou durante cerca de um dia.
  - **Do PDF:** "4xlO2 5 J" é 4 × 10²⁵ J (10²⁵ de luz + 3 × 10²⁵ de
    partículas). As densidades vieram como 10⁴ → 10⁷ e 10² elétrons/m³ e
    parecem ter perdido algarismos: a tela mostra como vieram, com aviso, e só
    a razão (× 1 000) entra na conta. A legenda da fig. 5.3 (espectro), que
    veio no meio do texto colado, é de outra seção e ficou de fora.
  - **Refeita a pedido da pessoa usuária** (a primeira versão ficou "apagada" e
    simples demais): o Sol vivo e brilhante, e cada passo com mais conteúdo.
  - Cada cena tem o seu "mundo" (`MUNDO_DA_CENA`): o Sol (de longe e passo
    1), o corte da atmosfera em 3D (passo 2), o campo de lado (bipolo no
    passo 3; modelo do ponto neutro nos passos 5 e 6), o gráfico (passo 4) e
    o caminho do Sol à Terra (passo 7). Os mundos trocam por transparência
    (`misturas`). Os planos usam `usar(tipo)`, `tx`, `ty`; o corte usa a
    vista oblíqua `ox`, `oy`.
  - **O Sol:** a região ativa fica num ponto da esfera (`estado.lon`,
    `estado.lat`; dá para arrastar). A região é desenhada no plano dela, com a
    transformação `transformarParaRegiao(vista)` (Mm, com x = u e y = −v); os
    laços, o plasma e os prótons são pontos 3D (`pontoNoSol`), escondidos
    atrás do disco (`visivelNoSol`). `vistaDoSol()` junta tudo: `estado.ver`
    vai de 0 (o disco inteiro) a 1 (passo 1); a câmera se aproxima e a região
    "se desdobra" até ficar de frente.
  - As texturas (`TEXTURA_DO_DISCO`, `TEXTURA_DOS_BRILHOS`,
    `TEXTURA_DA_REGIAO` e a versão pequena) são feitas uma vez, com números
    "aleatórios" que se repetem (`sorteador`). Os brilhos somam luz
    (`aditivo`), exceto o miolo das fitas, que vai por cima (somando, ele
    "estourava" em branco).
  - **De longe:** o clarão do gatilho (`clarao`), as duas fitas que se
    afastam (`geometriaDasFitas`: duas elipses de W × 3W que somam a área do
    brilho; a curva das fitas não muda a área), os laços que acendem
    (quentes → frios, `corDoLaco`), a bolha de plasma e os prótons, a lupa
    (telas largas) e o gráfico pequeno do painel (`#mini`: o brilho e a
    energia guardada no ciclo). O botão "Soltar um flare" leva o ciclo para
    logo antes do gatilho.
  - Os sete passos:
    1. a região de frente: manchas, plage, as fitas, a área medida (tracejada,
       no máximo do brilho), a escala de 20 000 km, o disco inteiro pequeno e
       a classe pela área em Hα (S, 1 a 4);
    2. o cubo de 10¹⁴ km³ vira uma camada de 1 milésimo do disco × 20 km
       (≈ 3 300 vezes menor, da ordem dos × 1 000 da densidade), com
       espículas, laços quentes, o termômetro (10⁴ K e 10⁷–10⁸ K) e uma lupa
       com a espessura;
    3. o mapa de B² (escala de 10, `MAPA_DE_ENERGIA`) e B²/2μ₀ × 10¹⁴ km³
       contra os 4 × 10²⁵ J, com a régua do campo e o mínimo
       (`CAMPO_MINIMO_G`, ~320 G);
    4. P = E/t: o gráfico de um dia, o detalhe dos segundos e as duas
       potências numa escala de 10 (288 vezes);
    5. e 6. a reconexão animada (`estadoDoModelo(t)`): seis pares de linhas
       esticadas se aproximam do ponto neutro e se encontram, uma de cada vez;
       embaixo nasce um laço pontudo e quente que se arredonda e esfria;
       em cima, uma linha em U sobe com o plasma. Elétrons descem pelas pernas
       do laço novo e acendem os pés (raios X e Hα: as fitas se afastam);
       prótons sobem; no passo 6, surtos de rádio. Tocar na legenda do passo 6
       destaca um produto (`destacar(produto)`, `zonasDaLegenda`);
    7. o que chega à Terra: o relógio da luz (0 a 8,3 min), o vento solar de
       fundo (mais forte onde passa a bolha), a magnetosfera que se aperta e a
       baixa ionosfera que acende.
  - **Assumido, e avisado na tela:** o raio do Sol (696 000 km); os limites
    usuais das classes (100, 250, 600 e 1 200 milionésimos do hemisfério),
    convertidos para milésimos do disco (`LIMITES_DAS_CLASSES`); 500 G e
    300 s como exemplos de "centenas de gauss" e "poucas centenas de
    segundos"; 150 milhões de km e 300 000 km/s. A textura do Sol, as
    proeminências, o tamanho das manchas, as fitas, os laços, o modelo, as
    partículas e os tempos das cenas são desenhos; o tempo é acelerado.
  - Para testar: `definir({ area, espessura, B, liberacao, lon, lat })`,
    `destacar(produto)` e `soltarFlare()` também são do escopo global;
    `estado.tempo` escolhe o momento dos ciclos.
- **`estrutura-do-sol.html`** (feita; a física é a seção 2.5, "Solar
  structure", do livro da pessoa usuária, colada de um PDF): o Sol cortado,
  com as sete camadas. **Formato diferente, a pedido dela:** não há o seletor
  "De longe"/"De perto"; clicar numa camada (no desenho, nos nomes à direita
  ou na lista do painel) leva a câmera até ela.
  - Navegação: `estado.camada` (−1 = o Sol inteiro, 0 a 6) e `estado.parte`;
    `mostrarCamada(camada, parte)` faz tudo. Para o editor e os testes,
    `mostrarVisao(perto)`, `mostrarPasso(camada)` e `mostrarParte(parte)`
    também existem (perto = uma camada aberta; passo = a camada). "Próximo"
    passa de parte em parte e, no fim de uma camada, vira "Próxima camada".
    No painel, os números 1 a 7 pulam de camada; no canto do desenho, um Sol
    pequeno (`desenharLocalizador`) mostra onde se está e volta ao Sol inteiro.
  - A câmera (`cameraDoSol`, `FOCOS`, `estado.zoom` e `estado.foco`) se
    aproxima do ponto da camada no corte; para trocar de camada, afasta-se um
    pouco antes. Com a câmera na camada, o "mundo" da cena aparece por
    transparência (`MUNDO_DA_CENA`, `misturas`, `DESENHOS`). Uma prévia do
    editor (`#…perto=1`) abre direto na camada (`pularTransicao`).
  - O corte (`desenharCorte`): núcleo pulsando, fótons em zigue-zague
    (`FOTONS_DO_CORTE`, cor pela energia, `corDaEnergia`), células da convecção,
    a fotosfera; em volta, cromosfera, transição, coroa e vento solar
    (`desenharAneis`, `desenharCoroa`). As camadas de dentro estão na escala do
    texto; a atmosfera, muito mais grossa (`R_CROMOSFERA` etc.).
    `camadaNoPonto(u, v)` diz a camada sob o ponteiro.
  - As 21 partes (cada uma com o seu mundo): núcleo (fusão com prótons,
    elétrons, hélio, raio gama preso e neutrino que escapa; a balança de
    E = Δm·c²; o painel acima da atmosfera e a casa de 1 600 W; a esfera de
    raio r, com S = 1 400/r²; 600 milhões de t/s; os neutrinos e o detector),
    zona radiativa (o fóton que passeia; a heliossismologia com o Doppler),
    zona convectiva (rolos com traçadores; o limite do fluxo), fotosfera (a
    borda com a lupa; a mancha com a Terra na mesma escala e o ciclo; a
    rotação diferencial; os grânulos, com Doppler e supergranulação),
    cromosfera (a atmosfera de lado com as curvas; o eclipse; as espículas; o
    disco em Hα), região de transição (as mesmas curvas, até a coroa) e coroa
    (o coronógrafo; o vento solar).
  - A granulação é um padrão de células (`fazerGranulacoes`: cada pixel olha o
    centro mais próximo e o segundo mais próximo), em três versões que se
    revezam devagar; a versão Doppler pinta as células de azul e as divisas de
    vermelho.
  - **Leituras:** "200 000 km across" do núcleo lido como diâmetro (raio de
    100 000 km); a zona convectiva começa a 496 000 km do centro.
    **Incoerência apontada na tela:** "1 kg de H = 1 600 anos da energia da
    Terra" não bate com "1 s do Sol = 900 000 anos da Terra" (por esta, são
    ~47 s). **Acréscimos, avisados:** massa do próton, 1 megaton =
    4,18 × 10¹⁵ J, raio da Terra, a temperatura da coroa (~1 milhão de K); as
    curvas da atmosfera, a rotação entre o equador e os polos (25 + 11·sen²),
    as manchas do ciclo, o limite do fluxo e as alturas das espículas são
    esquemas.
  - Para testar: `definir({ massa, area, raio, fluxo, ano, dias, altura, lua,
    velocidade })`, `alternar(nome)` (doppler, super, halfa, tapar),
    `fundirAgora()` e `novoFoton()` são do escopo global. O teste confere
    também que todos os textos que o desenho usa estão na lista do editor.
- **Formato das animações com física** (aprovado na magnetopausa): duas visões
  ligadas por um zoom ("De longe" e "De perto"), painel de explicação à direita,
  barra de controles embaixo do desenho, conta em passos (fórmula, números de
  agora, resultado, legenda). Cada arquivo é independente: o estilo é copiado,
  não compartilhado. Os textos seguem "Textos editáveis das animações"
  (`data-texto`, `T_`, `H_`, bloco e trecho comum).
  - Com a mesma ideia de teste: `estado`, `mostrarVisao` e `mostrarPasso` no
    escopo global.
  - Na área mínima do contrato (360 × 300 px) o painel ocupa quase tudo e
    sobram uns 70 px de altura para o desenho. Com menos de 170 px livres
    (`comNomes`), os rótulos do canvas somem e ficam só o desenho e o painel.
    Confira sempre também nesse tamanho.
- **Manifesto:** `animacoes/manifesto.json`, no formato
  `{ "animacoes": [{ "arquivo", "titulo", "descricao" }] }` (também aceita só a
  lista). Outras chaves, como `"leia-me"`, são ignoradas.
  - `validarManifesto()` deixa de fora os itens inválidos, com um aviso em
    português que o painel mostra.
  - Um erro de JSON aparece com linha e coluna.
  - O manifesto é relido no evento `focus` da janela. Sem resposta do servidor,
    a lista anterior é mantida.
- **Nome do arquivo:** `^[a-z0-9][a-z0-9_-]*\.html$` (`arquivoDeAnimacaoValido`).
  - A regra vale para o manifesto e também para cada nome de
    `card.animacoes` na hora de abrir, porque o JSON pode ter sido editado à
    mão.
  - Nenhum nome vira endereço sem essa conferência.
  - `normalizar()` não confere os nomes de `card.animacoes` (só tira os
    repetidos e o que não é texto).
- **Várias animações num card:** o ▶ do card abre a primeira; o painel abre
  qualquer uma. Com mais de uma, o cabeçalho da janela mostra botões 1, 2,
  3… e o subtítulo diz "animação 2 de 3". A animação não sabe que faz parte
  de uma lista (o contrato não mudou).
- **Janela:** `<dialog id="janela-animacao">` com `showModal()`.
  - O iframe tem `sandbox="allow-scripts"` (atributo definido antes do `src`) e
    `referrerpolicy="no-referrer"`. Ele é criado ao abrir e removido ao fechar.
  - Antes de criá-lo, um `HEAD` confere se o arquivo existe. Um 404 vira uma
    mensagem explicativa no lugar do iframe.
  - O foco fica no `<dialog>` (`tabindex="-1"`), não no primeiro botão.
  - O Esc na janela usa `stopPropagation`, para não fechar o painel junto.
- **Mensagens aceitas** (só se `evento.source` for o iframe aberto):
  `{ tipo: 'fechar-animacao' }` (o Esc com o foco dentro da animação) e as duas
  dos textos editáveis, `animacao-esta-em` e `textos-na-tela`.
- **Sandbox:** a animação não acessa `localStorage` nem `parent` (dá
  `SecurityError`). Também não abre `alert`, pop-ups ou tela cheia. O contrato
  explica isso a quem escreve as animações.
- **Nunca** desenhe animações dentro dos cards no mapa.
