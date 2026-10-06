# Plano aprovado

Aprovado em 30/09/2026, ao fim da Fase 0. Aqui ficam as decisões de arquitetura
tomadas antes de escrever código. O pedido original está em
[ESPECIFICACAO.md](ESPECIFICACAO.md). Se alguma decisão mudar, atualize este
arquivo e o `CLAUDE.md` da raiz.

## 1. Como a página é montada

| Camada | Conteúdo | Por que assim |
|---|---|---|
| Fundo (`<canvas>`) | zonas, Sol, Terra, estrelas, vento solar | Desenhar num canvas é leve mesmo com o Sol enorme no zoom. Sol e Terra são desenhados no espaço do mapa e acompanham pan e zoom |
| Mapa (HTML + SVG) | cards em HTML, conexões como curvas SVG | Texto nítido e fácil de editar. Pan e zoom aplicam uma única transformação ao conjunto, o que mantém a fluidez com 150 cards e 300 conexões |
| Rótulos das zonas | nomes presos ao topo da tela | Continuam visíveis quando o mapa se move para cima ou para baixo |
| Interface | barra de ferramentas, busca, indicador de salvamento, painel lateral, janela de animação | — |

O JavaScript fica dividido em módulos ES (um assunto por arquivo), sem etapa de
build. Toda alteração nos dados passa por `js/estado.js`, que registra a ação no
desfazer e agenda o salvamento.

## 2. Estrutura de arquivos

```
Estudo_INPE/
├── index.html              a página (única)
├── iniciar.py              servidor local (só biblioteca padrão do Python)
├── iniciar.bat             duplo clique no Windows
├── iniciar.command         duplo clique no macOS (Linux: bash iniciar.command)
├── css/estilo.css
├── js/                     módulos (lista completa no CLAUDE.md)
├── data/
│   ├── estudos.json        os dados (vão para o git)
│   └── backups/            cópias diárias (fora do git)
├── animacoes/
│   └── manifesto.json · CONTRATO.md · _modelo.html · demonstracao.html
├── docs/                   especificação original e este plano
├── README.md · CLAUDE.md
├── .gitignore · .gitattributes · .nojekyll
```

Nomes de arquivo sempre em minúsculas, sem acento e sem espaço.

## 3. Modelo de dados (versão 1)

```json
{
  "versao": 1,
  "zonas": [
    { "id": "sol", "nome": "Sol", "detalhe": "interior e superfície", "ordem": 1, "largura": 1400 }
  ],
  "cards": [{
    "id": "c-k3j9x2ab", "titulo": "[exemplo] Card A", "descricao": "",
    "zona": "sol", "x": 320, "y": -150,
    "pai": null, "recolhido": false, "tags": [],
    "animacao": null, "linkDocs": null,
    "criadoEm": "2026-10-01T14:03:00.000Z", "atualizadoEm": "2026-10-01T14:03:00.000Z"
  }],
  "conexoes": [{
    "id": "x-8p2d1wqz", "de": "c-k3j9x2ab", "para": "c-4n6r2tmm",
    "texto": "", "direcional": true,
    "criadoEm": "…", "atualizadoEm": "…"
  }]
}
```

Ajustes em relação à proposta original:

1. **Zonas têm `largura` e `detalhe`.** A largura diz onde cada zona começa e
   termina. As zonas são dispostas em sequência, pela `ordem`, a partir de x = 0.
   O `nome` curto aparece no topo da tela; o `detalhe` aparece ao passar o mouse.
2. **O `x` do card é medido a partir do início da zona dele**, e `x`/`y` marcam o
   centro do card. Alargar uma zona desloca os cards das zonas seguintes junto,
   sem trocá-los de zona; Sol e Terra se reposicionam sozinhos. Ao arrastar, a
   zona é atualizada pela posição.
3. **`animacao` guarda o nome do arquivo** (ex.: `"demonstracao.html"`).
   *Mudou depois, a pedido (2026-10-06): no formato 2, o campo é
   `"animacoes"`, uma lista de nomes em ordem (um card pode ter várias, como a
   série do campo geomagnético). A migração 1 → 2 converte os arquivos
   antigos sozinha.*
4. **Conexões têm `criadoEm` e `atualizadoEm`.**
5. **Gravação pensada para o git:** arquivo indentado, em UTF-8, posições
   inteiras. Mover um card não altera `atualizadoEm`; só mudanças de conteúdo
   alteram.
6. **Fora do JSON:** a posição da câmera e as preferências (efeitos, comportamento
   da roda) ficam no `localStorage` do navegador.
7. **Migração e reparo ao abrir:** `migrar()` aplica as conversões de versão em
   sequência. A normalização preenche campos faltantes e conserta referências
   quebradas (conexão para card inexistente, `pai` inexistente ou em ciclo, card
   em zona apagada), sempre com aviso. Um arquivo de versão mais nova que o app
   abre só para leitura. Campos desconhecidos são preservados.

O nível hierárquico é derivado de `pai`.

## 4. Bibliotecas

Nenhuma no app. Pan, zoom, arrasto, curvas e desfazer são código próprio.
Bibliotecas de grafos trariam layout automático, que não é desejado, e mais uma
dependência. A única exceção é a fonte Inter via Google Fonts (sem internet, entra
a fonte do sistema). As animações podem usar bibliotecas via CDN dentro do próprio
arquivo.

## 5. Persistência e proteções

- O salvamento é automático, cerca de 1 s após a última alteração. Ctrl+S salva na
  hora.
- O app **nunca salva se a leitura do arquivo falhou**. Nesse caso, mostra a linha
  do erro e fica só leitura.
- **Conflitos:** o servidor informa a versão (hash) do arquivo que a página
  carregou e recusa gravar por cima de uma versão diferente, como acontece com
  outra aba aberta, edição à mão ou `git pull`. A página então pergunta qual
  versão manter, e a descartada é baixada como JSON por segurança.
- **Servidor fechado:** as alterações vão para a reserva do `localStorage`, com
  aviso visível e reenvio automático. Na abertura seguinte:
  - se o arquivo não mudou, a reserva é aplicada sozinha;
  - se mudou, o app pergunta qual versão usar.
- **Backups:**
  - antes da primeira gravação de cada dia, o arquivo vai para
    `data/backups/diario-AAAA-MM-DD.json` (os 30 mais recentes são mantidos);
  - backups extras de segurança são feitos antes de sobrescrever num conflito e
    quando uma gravação reduz muito o número de cards.
- **Segurança do servidor:**
  - escuta só em 127.0.0.1;
  - aceita gravações só da própria página, conferindo os cabeçalhos Origin e
    Host;
  - rejeita corpo que não seja JSON;
  - não serve pastas ocultas nem os backups.
- **Endereço fixo:** o app usa sempre `127.0.0.1`. Se for aberto por `localhost`,
  redireciona, porque a reserva do navegador é separada por endereço.

## 6. Riscos e tratamento

| Risco | Tratamento |
|---|---|
| JSON editado à mão com erro | App não salva; mostra a linha do erro |
| Duas abas / arquivo alterado fora do app | Detecção de conflito por hash |
| Servidor fechado com a página aberta | Reserva no `localStorage` + reenvio |
| Site malicioso enviando pedidos a 127.0.0.1 | Verificação de Origin/Host |
| Antivírus/OneDrive travando o arquivo | Novas tentativas antes de acusar erro |
| Tipo MIME errado para `.js` em alguns Windows | `iniciar.py` fixa os tipos |
| `iniciar.command` criado no Windows | `.gitattributes` (LF) + bit de execução no git |
| GitHub Pages esconde arquivos com `_` | `.nojekyll` |
| Maiúsculas em nomes de arquivo no Pages | Nomes em minúsculas; caminhos relativos |
| Desempenho com 150 cards / 300 conexões | Flutuação pausa em pan/zoom/arrasto; nível de detalhe por zoom; modo `?teste` |
| Textos das conexões sobrepostos | Truncados; somem no zoom afastado |
| Iframe de animação (Esc, localStorage, CDN offline) | Botão × sempre visível; Esc dentro da animação por mensagem; botão "Recomeçar"; regras no `CONTRATO.md` |
| Animação aberta direto numa aba | O servidor envia `animacoes/` com `Content-Security-Policy: sandbox allow-scripts` |

## 7. Decisões de comportamento

- **Espaço e visual:**
  - o eixo vertical é livre;
  - o centro do Sol fica no início da primeira zona e o da Terra no fim da última;
  - as linhas de campo da Terra se estendem para a esquerda;
  - a Terra é cinza, porque só o Sol tem cor.
- **Tamanhos por nível:** 100% → 85% → 72% → 62% (nível 3 em diante).
- **Ícones:** SVG cinza, sem emojis.
- **Zoom e enquadramento:** zoom de 5% a 300% (o mínimo baixou de 10% para 5%
  na Fase 1, para "Enquadrar tudo" caber em telas pequenas); "Enquadrar tudo"
  inclui Sol e Terra.
- **Descrição:** contador discreto a partir de ~300 caracteres, sem bloquear.
- **Roda do mouse e touchpad:**
  - roda do mouse = zoom;
  - dois dedos no touchpad = mover;
  - pinça (ou Ctrl + roda) = zoom;
  - como a detecção é automática e pode errar em algum equipamento, há um ajuste
    manual em "Opções".
- **Conexões:**
  - direcionais no sentido do arrasto;
  - Esc cancela a criação;
  - uma conexão sem texto ganha um "?" discreto;
  - as linhas não flutuam: as setas param a alguns pixels da borda.
- **Acréscimos da Fase 2:**
  - o painel do card lista as conexões dele (sentido, card do outro lado e
    texto); um clique abre a conexão;
  - ao arrastar perto da borda da tela, o mapa anda sozinho;
  - as alças ficam sempre clicáveis, mesmo antes de aparecer.
- **Estilos de linha:** pai → filho reta, fina e sem seta; conexão comum em
  curva; conexão redirecionada de filho oculto em curva tracejada.
- **Hierarquia:**
  - arrastar um pai move os filhos junto (Alt move só o pai);
  - excluir um pai faz os filhos subirem um nível;
  - o "+N" de um pai recolhido conta todos os descendentes ocultos;
  - conexões redirecionadas para o mesmo par viram uma linha com contagem;
  - conexões internas ao grupo recolhido somem;
  - recolher e expandir é salvo e entra no desfazer.
- **Busca:** ignora acentos e maiúsculas. Enter vai ao próximo resultado. Se o
  resultado estiver num pai recolhido, o pai é expandido **temporariamente**: ele
  volta a ficar recolhido quando a busca é limpa, e a busca nunca altera o
  arquivo (decisão da Fase 3).
- **Acréscimos da Fase 3:**
  - o painel mostra os cards filhos, com botão recolher/expandir, e o pai é
    clicável;
  - clicar numa linha "N conexões" (de cards escondidos) expande os pais que os
    escondem;
  - no modo foco, o pai e os filhos do card também ficam em destaque;
  - enquanto há uma busca ativa, o modo foco fica suspenso.
- **Acréscimos da Fase 4 (animações):**
  - **Janela:** ocupa quase a tela toda. Fecha com ×, Esc, clique fora ou um
    pedido da própria animação: o Esc dentro dela envia a mensagem
    `fechar-animacao`, e nenhuma outra mensagem é aceita.
  - **Recomeçar:** um botão recarrega a animação, o que também resolve uma
    biblioteca da internet que falhou.
  - **Arquivo inexistente:** antes de abrir, o app confere se o arquivo existe e,
    se não existir, explica o problema.
  - **Manifesto:**
    - é relido quando a janela do navegador volta ao foco;
    - os erros dele aparecem no campo "Animação" do painel;
    - a animação escolhida continua na lista mesmo se sair do manifesto.
  - **Nomes de arquivo:** letras minúsculas sem acento, números, `-` e `_`,
    terminando em `.html` e sem começar com `_`.
  - **Atalhos:** com a janela aberta, os do mapa ficam desligados.
  - **Desempenho do zoom com 300 conexões:** o zoom contínuo fica abaixo do
    ideal, porque o SVG das linhas é repintado a cada mudança de escala. Ao
    testar, a pessoa usuária disse que a pinça não trava, e as linhas
    continuaram em SVG.
- **Acréscimos da Fase 5 (efeitos):**
  - **Estrelas:** não piscam e ficam sempre visíveis. Ao arrastar o mapa, elas
    se deslocam 4% do movimento, para dar profundidade.
  - **Vento solar:** riscos claros e discretos, da esquerda para a direita, só à
    direita do Sol. (Depois passou a ser radial; veja as melhorias, abaixo.)
  - **Coroa do Sol:** um halo e manchas de brilho que crescem e encolhem
    devagar.
  - **Flutuação:** cada card sobe e desce até 2,5 px, com ritmo próprio. Ela
    pausa durante os gestos e sob o mouse, e desliga com o zoom bem afastado.
    Para as linhas não encostarem nos cards, a folga das linhas pai → filho
    passou de 2 para 4.
  - **Botão de efeitos:** liga e desliga vento, coroa e flutuação. A escolha
    fica no navegador. Sem os efeitos, nada roda com o mapa parado.
  - **Menos movimento:** se o sistema estiver configurado para reduzir
    animações, os efeitos começam desligados e os cards não flutuam.
  - **Janela de animação aberta:** os efeitos de trás param.
  - **Pinça:** 50% mais sensível, a pedido. A roda do mouse não mudou.
  - **Desempenho:** com 150 cards e 300 conexões, os efeitos não mudaram os
    quadros por segundo de mover, de zoom nem do mapa parado.
- **Melhorias pedidas depois das fases (01/10/2026):**
  - **Uma alça de conexão só:** fica a de baixo. A linha sempre sai do lado que
    aponta para o outro card, então o ponto de partida não muda o resultado.
  - **Tamanho dos cards:**
    - a alça no canto inferior direito muda o tamanho do card e, na mesma
      proporção, o dos descendentes dele; os outros cards não mudam;
    - o card cresce em volta do centro, e nenhuma posição muda;
    - duplo clique na alça volta a 100%;
    - a barra "Tamanho de todos os cards", em Opções, vale para o mapa inteiro;
    - os dois tamanhos ficam gravados no arquivo (`escala` no card e
      `escalaDosCards` na raiz), entram no desfazer e valem na vitrine.
  - **Zonas editáveis, de forma discreta:**
    - clicar no nome da zona, no alto da tela, abre uma janelinha com nome e
      descrição;
    - a largura muda arrastando a marca no alto do limite direito da zona. As
      linhas tracejadas em si não são arrastáveis, para um arrasto do mapa não
      alargar uma zona sem querer;
    - "Nova zona à direita" cria a zona depois da escolhida;
    - excluir une a zona à vizinha, com confirmação: os cards passam para a
      vizinha e nada sai do lugar (não estava no pedido; foi incluído para uma
      zona criada por engano não ficar sem saída);
    - uma zona não encolhe além dos cards dela.
  - **Vento solar radial:** as partículas saem do Sol em todas as direções e,
    perto da Terra, contornam o primeiro anel do campo sem entrar nele. É um
    desenho estilizado, pedido pela pessoa usuária, com a condição de não pesar
    na página: medido, o custo por quadro não mudou.
- **Desfazer:**
  - 100 ações, em memória;
  - dentro de um campo de texto, o Ctrl+Z desfaz o texto, não o mapa;
  - um arrasto conta como uma ação, e uma digitação também.
- **Exclusão e importação:**
  - a confirmação de exclusão informa as conexões afetadas;
  - importar substitui o mapa inteiro, com confirmação, e pode ser desfeito.
- **Abrir duas vezes:** um segundo `iniciar.bat` só abre o navegador. Se a porta
  estiver ocupada por outro programa, aparece uma mensagem clara.
- **Vitrine:** o visitante navega, foca, busca, recolhe e expande sem salvar, vê o
  painel sem editar e abre animações e links.

## 8. Fases

| Fase | Conteúdo |
|---|---|
| 0 | Diagnóstico e plano (este documento) |
| 1 | Canvas, zonas, Sol/Terra estáticos, pan/zoom, cards, persistência completa, desfazer, modo somente leitura, `iniciar.*`, README mínimo, `CLAUDE.md` inicial, modo `?teste` |
| 2 | Conexões e modo foco (teste com 300 conexões) |
| 3 | Hierarquia e busca (campo "card pai" no painel) |
| 4 | Sistema de animações |
| 5 | Efeitos visuais, botão de desempenho, README e `CLAUDE.md` finais, deploy no GitHub Pages |

Cada fase termina com teste no navegador (incluindo `?teste`), um roteiro de
teste para a pessoa usuária e um commit local. O push para o GitHub é feito pela
pessoa usuária.

## 9. Respostas da Fase 0

1. **Repositório:** não existia no GitHub; foi criado um novo.
2. **Vitrine pública:** aceita. Os links do Docs ficam visíveis mesmo que os
   visitantes não tenham acesso a eles.
3. **Arrastar um pai move os filhos:** sim, e com Alt move só o pai.
4. **Excluir um pai:** os filhos sobem um nível.
5. **Mouse ou touchpad:** usa os dois. Daí a detecção automática, com ajuste
   manual.
6. **Documentação antecipada:** sim, com `CLAUDE.md` desde a Fase 1.
