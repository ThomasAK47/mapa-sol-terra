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

Abra <http://127.0.0.1:8000/?teste=150> para ver o mapa com 150 cards
fictícios. Nada é salvo nesse modo, e um medidor de quadros por segundo aparece
no canto da tela. Para voltar ao seu mapa, tire o `?teste=150` do endereço.
