# Mapa de Estudos Sol–Terra

Mapa visual das conexões entre os assuntos do sistema Sol–Terra. Cada card tem
um título e uma descrição curta, e cada conexão explica por que dois assuntos se
relacionam. As explicações longas ficam no Google Docs.

O mapa roda no seu computador, e só nele dá para editar. O GitHub guarda o
histórico e pode mostrar uma cópia pública, só para leitura (a "vitrine").

**Neste arquivo:**
[Como abrir](#como-abrir) ·
[Onde ficam os dados](#onde-ficam-os-seus-dados) ·
[Como usar](#como-usar) ·
[Animações](#animações) ·
[GitHub: guardar e publicar](#github-guardar-e-publicar) ·
[Se algo der errado](#se-algo-der-errado) ·
[Pastas do projeto](#pastas-do-projeto)

## Como abrir

| Sistema | O que fazer |
|---|---|
| Windows | Dê dois cliques em `iniciar.bat`. |
| macOS | Dê dois cliques em `iniciar.command`. Se o macOS bloquear na primeira vez, clique com o botão direito no arquivo e escolha **Abrir**. |
| Linux | No terminal, dentro desta pasta, rode `bash iniciar.command`. |

Uma janela preta se abre, e o mapa aparece no navegador, no endereço
<http://127.0.0.1:8000>.

- **Deixe a janela preta aberta** enquanto usa o mapa, porque é ela que grava as
  alterações.
- Para encerrar, feche a janela.

É preciso ter o Python 3.8 ou mais recente (<https://www.python.org/downloads/>).
Não há mais nada para instalar.

> Abrir o `index.html` com dois cliques **não** funciona: o navegador bloqueia o
> carregamento dos dados. Use sempre o `iniciar.bat`.

## Onde ficam os seus dados

- **`data/estudos.json`** guarda o mapa inteiro. Ele é salvo sozinho cerca de
  1 segundo depois de cada alteração, e o indicador no topo mostra "salvo",
  "salvando…" ou "erro ao salvar".
- **`data/backups/`** guarda uma cópia por dia (as 30 mais recentes) e cópias de
  segurança feitas antes de importar um arquivo ou de resolver um conflito. Essa
  pasta fica só no seu computador e não vai para o GitHub.
- **Se a janela preta for fechada** com o mapa aberto, as alterações ficam
  guardadas no navegador e são enviadas quando o servidor voltar.
- **Exportar JSON** baixa uma cópia do mapa. **Importar JSON** substitui o mapa
  pelo conteúdo de um arquivo, com confirmação, e pode ser desfeito.

## Como usar

| Ação | Como |
|---|---|
| Criar um card | Duplo clique no fundo, ou botão **Novo card** |
| Editar um card | Duplo clique no card (ou selecione e aperte Enter) |
| Mover um card | Arraste. A zona muda conforme a posição |
| Excluir um card | Selecione e aperte Delete, ou use o botão no painel |
| Mover o mapa | Arraste o fundo. No touchpad, deslize dois dedos |
| Zoom | Roda do mouse, ou pinça no touchpad |
| Ver tudo | Botão **Enquadrar tudo** ou tecla F |
| Desfazer / refazer | Ctrl+Z / Ctrl+Shift+Z |
| Salvar agora | Ctrl+S (normalmente não é preciso) |

Um card criado e deixado vazio é descartado sozinho ao fechar o painel.

Se o zoom e o movimento do touchpad se confundirem no seu equipamento, ajuste em
**Opções**, o botão no canto superior direito.

### Conexões

O valor do mapa está nas conexões, e cada uma tem um texto dizendo **por que**
os dois assuntos se relacionam.

| Ação | Como |
|---|---|
| Criar uma conexão | Passe o mouse sobre um card, arraste a bolinha ○ que aparece embaixo dele até outro card, escreva o porquê e aperte Enter |
| Cancelar a criação | Esc, enquanto escreve o texto da conexão nova |
| Ler ou editar | Clique no texto da conexão, ou na lista "Conexões" do painel do card |
| Inverter a direção, tirar a seta | Botões no editor da conexão |
| Excluir | Ícone de lixeira no editor (pede confirmação) |
| Modo foco | Clique num card: ele e suas conexões ficam em destaque. Esc ou clique no fundo para sair |

- Um **"?"** sobre a linha indica uma conexão ainda sem explicação.
- Pode haver várias conexões entre os mesmos dois cards; elas aparecem como
  curvas separadas.
- Com o zoom afastado, os textos das conexões somem para não poluir o mapa;
  no modo foco, os textos em destaque continuam visíveis.
- Ao arrastar um card ou uma conexão perto da borda da tela, o mapa anda sozinho
  naquela direção.
- Enter confirma o texto; Shift+Enter quebra a linha.

### Cards pai e filhos

Um card pode ter um **card pai**, escolhido no campo "Card pai" do painel.
Cards de nível mais alto aparecem maiores; filhos e netos, menores. Uma linha
fina e escura, com um pontinho do lado do pai, liga pai e filho.

| Ação | Como |
|---|---|
| Definir o pai | Campo "Card pai" no painel (um card não pode ser pai de um ancestral seu) |
| Recolher os filhos | Botão **−** no canto do card pai (aparece com o mouse em cima), ou "Recolher" no painel |
| Expandir | Clique no **+N** do card recolhido (N = quantos cards estão escondidos) |
| Mover o pai com os filhos | Arraste o card pai: filhos e netos vão junto |
| Mover só o pai | Segure **Alt** enquanto arrasta |
| Excluir um pai | Os filhos sobem um nível (passam a ser filhos do avô) |

- Com um pai recolhido, as conexões dos cards escondidos passam a sair dele,
  **tracejadas**. Se forem várias entre os mesmos dois cards, viram uma linha só
  ("3 conexões"); clique nela para expandir e ver cada uma.
- Na vitrine, os visitantes também podem recolher e expandir, mas isso vale só
  para a tela deles.

### Tamanho dos cards

| Ação | Como |
|---|---|
| Mudar o tamanho de um card | Passe o mouse sobre ele e arraste os risquinhos do canto inferior direito |
| Voltar ao tamanho normal | Duplo clique nos risquinhos |
| Mudar o tamanho de todos | **Opções** → barra **Tamanho de todos os cards** |

- Os filhos e netos do card acompanham, na mesma proporção. Os outros cards não
  mudam.
- O card cresce em volta do centro, e nenhum card muda de lugar. Se um ficar
  por cima de outro, arraste-o.
- Os tamanhos ficam gravados no mapa, então valem também na vitrine.
- Um card pode ir de 50% a 300%; o tamanho de todos, de 50% a 200%.

### Busca

Digite no campo **Buscar** da barra (atalho **Ctrl+F**). Os cards que têm as
palavras no título, na descrição ou nas tags ficam em destaque, e o mapa vai até
o primeiro.

- Não importam acentos nem maiúsculas ("ionosferico" encontra "Ionosférico").
  Com várias palavras, todas precisam aparecer.
- **Enter** vai ao próximo resultado, **Shift+Enter** ao anterior, **Esc** limpa.
- Um resultado escondido dentro de um pai recolhido aparece enquanto você busca;
  ao limpar a busca, o pai volta a ficar recolhido. A busca nunca altera o
  arquivo.

### Efeitos visuais

O fundo tem estrelas, o brilho do Sol "respira" devagar, riscos claros de vento
solar saem do Sol para a direita, e os cards flutuam alguns pixels. É só
decoração: a posição salva dos cards não muda, e nada disso vai para o arquivo.

- **Botão de efeitos** (o ícone de vento, ao lado de **Opções**): liga e desliga
  os efeitos animados. As estrelas, que não se mexem, continuam.
- **Desligue os efeitos** se o mapa ficar lento ou se o notebook estiver na
  bateria. Sem eles, nada fica rodando com o mapa parado.
- A escolha fica guardada no navegador.
- A flutuação para enquanto você move o mapa, arrasta um card ou passa o mouse
  sobre ele.
- Se o Windows estiver com as animações desligadas (Configurações →
  Acessibilidade → Efeitos visuais → Efeitos de animação), os efeitos começam
  desligados e os cards não flutuam.

## Animações

Um card pode ter uma animação: um arquivo da pasta `animacoes/` que abre numa
janela grande.

| Ação | Como |
|---|---|
| Escolher a animação do card | Campo **Animação** no painel do card |
| Abrir | Ícone ▷ no card, ou botão **Abrir** no painel |
| Recomeçar do início | Botão de seta circular, no alto da janela |
| Fechar | Botão ×, tecla Esc, ou clique fora da janela |

- A lista do campo **Animação** vem do arquivo `animacoes/manifesto.json`.
- A animação roda isolada: ela não enxerga nem altera os dados do mapa.
- Com a janela aberta, os atalhos do mapa (Delete, Ctrl+Z…) ficam desligados.

**Para acrescentar uma animação nova:**

1. Numa conversa, cole o arquivo `animacoes/CONTRATO.md` e descreva a animação
   que você quer. A resposta traz um arquivo HTML e um trecho para o manifesto.
2. Salve o arquivo HTML na pasta `animacoes/`, com o nome indicado.
3. Acrescente o trecho em `animacoes/manifesto.json`. O passo a passo está na
   seção "Registrar no manifesto" do contrato.
4. Volte ao mapa: a lista do campo **Animação** se atualiza sozinha.

## GitHub: guardar e publicar

O repositório é <https://github.com/ThomasAK47/mapa-sol-terra>. Ele serve para
duas coisas: guardar o histórico do mapa e mostrar a vitrine.

### Enviar as alterações (com o git)

1. Abra um terminal nesta pasta. No Windows: clique na barra de endereço do
   Explorador de Arquivos, digite `cmd` e aperte Enter.
2. Rode os comandos abaixo, um de cada vez.

```bash
git add -A
```
Marca todos os arquivos alterados para entrar na próxima "foto" (commit). O
seu mapa (`data/estudos.json`) entra junto; os backups, não.

```bash
git commit -m "Atualiza o mapa"
```
Tira a "foto", com uma mensagem que descreve o que mudou. Troque o texto entre
aspas pelo que quiser.

```bash
git push
```
Envia as fotos para o GitHub.

- **Na primeira vez**, use `git push -u origin main`. O `-u origin main` diz ao
  git para onde enviar; depois disso, `git push` basta.
- Também na primeira vez, o Windows pode abrir uma janela pedindo para você
  entrar na sua conta do GitHub.

### Atualizar só os dados, sem o git

Depois que o projeto já estiver no GitHub, dá para atualizar o mapa pelo site:

1. Abra o repositório no navegador e entre na pasta `data`.
2. Clique em **Add file** → **Upload files**.
3. Arraste o arquivo `data/estudos.json` do seu computador para a página.
4. Clique em **Commit changes**.

O primeiro envio precisa ser pelo git, porque ele leva o app inteiro.

### Publicar a vitrine (GitHub Pages)

A vitrine é uma cópia do mapa que qualquer pessoa com o link pode ver, sem
poder alterar. Para ativá-la, uma única vez:

1. Envie o projeto para o GitHub, como explicado acima.
2. No site do repositório, clique em **Settings** (Configurações).
3. No menu da esquerda, clique em **Pages**.
4. Em **Build and deployment** → **Source**, escolha **Deploy from a branch**.
5. Em **Branch**, escolha **main** e a pasta **/ (root)**, e clique em **Save**.
6. Espere 1 ou 2 minutos e recarregue a página. Vai aparecer o endereço da
   vitrine: <https://thomasak47.github.io/mapa-sol-terra/>.

Depois disso:

- **Cada `git push` atualiza a vitrine**, em 1 ou 2 minutos. A aba **Actions** do
  repositório mostra o andamento ("pages build and deployment").
- **A vitrine é pública.** Quem tiver o link vê os títulos, as descrições e as
  conexões. Os links do Google Docs aparecem, mas só abrem para quem tem acesso
  ao documento.
- **Ninguém altera nada por lá.** A vitrine mostra o selo "somente leitura". Os
  visitantes podem navegar, buscar, recolher e abrir animações, e nada disso é
  gravado.
- **Se a vitrine mostrar uma versão antiga,** recarregue com Ctrl+F5.
- **Não apague o arquivo `.nojekyll`.** Sem ele, o GitHub esconde os arquivos
  que começam com `_`, como o `animacoes/_modelo.html`.
- **Use só letras minúsculas, sem acento e sem espaço,** nos nomes dos arquivos
  novos. O GitHub diferencia maiúsculas de minúsculas, e o Windows não.

## Se algo der errado

- **"erro ao salvar"**: a janela preta foi fechada. Dê dois cliques em
  `iniciar.bat` de novo. As alterações são enviadas sozinhas.
- **"O mapa abriu só para leitura"** com uma mensagem de erro: o arquivo
  `data/estudos.json` tem um erro de digitação, e a mensagem diz perto de qual
  linha. Corrija o arquivo, ou copie de volta um arquivo de `data/backups/`, e
  recarregue a página (F5). O app não grava nada enquanto o erro existir.
- **"O arquivo de dados mudou fora desta aba"**: o arquivo foi alterado em outra
  aba, à mão ou pelo git. Escolha qual versão manter. A outra fica guardada, em
  `data/backups/` ou baixada como `.json`.
- **O mapa abre com o selo "somente leitura" no seu computador**: ele foi aberto
  sem o `iniciar.bat` (por exemplo, com outro servidor). Feche a aba e use o
  `iniciar.bat`.
- **O mapa está lento**: desligue os efeitos, no botão com o ícone de vento.
- **Uma animação nova não aparece na lista**: confira o `animacoes/manifesto.json`.
  Se ele tiver um erro de digitação (como uma vírgula faltando), o campo
  **Animação** do painel diz em que linha.
- **"O arquivo … não foi encontrado"** ao abrir uma animação: o nome no
  manifesto e o nome do arquivo na pasta `animacoes/` precisam ser iguais, letra
  por letra.

## Teste de desempenho

Abra <http://127.0.0.1:8000/?teste=150> para ver o mapa com 150 cards e 300
conexões fictícios. Nada é salvo nesse modo, e um medidor de quadros por segundo
aparece no canto da tela. Para voltar ao seu mapa, tire o `?teste=150` do
endereço.

## Pastas do projeto

| Pasta ou arquivo | O que é |
|---|---|
| `iniciar.bat`, `iniciar.command`, `iniciar.py` | Abrem o mapa e gravam as alterações |
| `data/estudos.json` | O seu mapa |
| `data/backups/` | Cópias de segurança (só no seu computador) |
| `animacoes/` | As animações, o manifesto, o modelo e o contrato |
| `index.html`, `css/`, `js/` | O app |
| `docs/` | O pedido original e o plano aprovado |
| `CLAUDE.md` | Guia técnico para futuras sessões de desenvolvimento |

Para ver o mapa sem poder editar, como na vitrine, dá para usar qualquer
servidor de arquivos nesta pasta. Por exemplo, com o comando abaixo, o mapa abre
em <http://127.0.0.1:8000> com o selo "somente leitura":

```bash
python -m http.server 8000 --bind 127.0.0.1
```
O comando pede ao Python para servir os arquivos da pasta atual na porta 8000.
O `--bind 127.0.0.1` faz com que só este computador tenha acesso; sem ele,
outros aparelhos da mesma rede também enxergariam a pasta. Só o `iniciar.py`
sabe gravar; por isso, aberto assim, o mapa não salva nada.
