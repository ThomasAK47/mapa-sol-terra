# Mapa de Estudos Sol–Terra

Mapa visual das conexões entre os assuntos do sistema Sol–Terra. Cada card tem
um título e uma descrição curta, e cada conexão explica por que dois assuntos se
relacionam. As explicações longas ficam no Google Docs.

> **README em construção.** Esta versão cobre o uso no dia a dia. A versão
> completa, com animações e publicação no GitHub Pages, chega na Fase 5.

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
| Criar uma conexão | Passe o mouse sobre um card, arraste uma das bolinhas ○ da borda até outro card, escreva o porquê e aperte Enter |
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
- Na versão publicada (vitrine), os visitantes também podem recolher e expandir,
  mas isso vale só para a tela deles.

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

## Guardar uma cópia no GitHub

O repositório é <https://github.com/ThomasAK47/mapa-sol-terra>. Para enviar
suas alterações para lá:

1. Abra um terminal nesta pasta. No Windows: clique na barra de endereço do
   Explorador de Arquivos, digite `cmd` e aperte Enter.
2. Rode os comandos abaixo, um de cada vez.

```bash
git add -A
```
Marca todos os arquivos alterados para entrar na próxima "foto" (commit).

```bash
git commit -m "Atualiza o mapa"
```
Tira a "foto", com uma mensagem que descreve o que mudou.

```bash
git push
```
Envia as fotos para o GitHub. Na **primeira vez**, use `git push -u origin main`.

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

## Teste de desempenho

Abra <http://127.0.0.1:8000/?teste=150> para ver o mapa com 150 cards e 300
conexões fictícios. Nada é salvo nesse modo, e um medidor de quadros por segundo
aparece no canto da tela. Para voltar ao seu mapa, tire o `?teste=150` do
endereço.
