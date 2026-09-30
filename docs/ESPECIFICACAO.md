# Especificação original

> Texto do pedido como foi enviado em 30/09/2026. Só a formatação mudou: o bloco
> JSON foi colocado entre crases e um título que estava grudado na linha anterior
> foi separado. As decisões tomadas a partir deste pedido estão em
> [PLANO.md](PLANO.md).

---

# Projeto: Mapa de Estudos Sol–Terra

## Contexto
Sou estudante de Geoprocessamento (UFSM) e bolsista PIBIC no INPE, estudando tempestades geomagnéticas intensas no ciclo solar 25 (índices Dst, AE, Kp e resposta ionosférica sobre Santa Maria com dados de Digissonda). Não tenho formação em programação: explique qualquer comando que eu precise rodar e comente o código em português.

Quero uma aplicação web para mapear as conexões entre os assuntos do sistema Sol–Terra. Ela NÃO é um editor de texto: cada card tem só um título e uma descrição curta que EU escrevo. Explicações longas ficam no Google Docs. O valor da ferramenta está nas relações: cards ligados por conexões, e cada conexão tem um texto explicando o porquê da relação.

## Restrições técnicas
- Execução principal: LOCAL, no meu computador, por um servidor Python.
- Frontend em HTML, CSS e JavaScript puros, sem etapa de build, sem npm, sem framework. Bibliotecas externas só se forem realmente necessárias, via CDN, justificadas na Fase 0.
- O repositório fica no GitHub apenas como backup e histórico; eu faço commit/push quando quiser.
- A mesma página, se publicada no GitHub Pages, deve funcionar em modo somente leitura (vitrine).
- Desktop primeiro.
- Não escreva conteúdo de física nos cards. Os cards de exemplo devem ter títulos genéricos marcados "[exemplo]" e descrição vazia.

## Persistência (ponto crítico)
1. Crie `iniciar.py` usando SOMENTE a biblioteca padrão do Python (nada de pip). Ele deve:
   - servir a pasta do projeto em http://127.0.0.1:8000, escutando APENAS em 127.0.0.1 (ninguém na rede pode acessar);
   - abrir o navegador automaticamente;
   - expor um endpoint (ex.: POST /api/salvar) que grava em `data/estudos.json` e em nenhum outro caminho;
   - validar que o conteúdo recebido é JSON válido antes de gravar;
   - gravar de forma atômica (arquivo temporário + renomear), para o JSON nunca corromper se algo falhar no meio;
   - manter cópias automáticas em `data/backups/` (uma por dia, guardando as últimas 30), com essa pasta no .gitignore.
2. A página salva automaticamente cerca de 1 segundo após a última alteração, sem botão. Indicador discreto: "salvo" / "salvando…" / "erro ao salvar".
3. Se o salvamento falhar (servidor fechado), guardar as alterações no localStorage como reserva, avisar de forma visível e reenviar quando o servidor voltar.
4. Se a página for aberta sem o servidor (ex.: GitHub Pages), entrar em modo somente leitura: esconder os controles de edição e mostrar um aviso discreto.
5. Botões "Exportar JSON" e "Importar JSON" como segurança extra.
6. Desfazer/refazer (Ctrl+Z / Ctrl+Shift+Z) com histórico de pelo menos 30 ações, e confirmação antes de excluir card ou conexão.
7. Crie atalhos de duplo clique para iniciar (`iniciar.bat` para Windows e `iniciar.command` para macOS/Linux), para eu não precisar abrir o terminal.

## Modelo de dados (proposta; ajuste na Fase 0 se tiver motivo)

```json
{
  "versao": 1,
  "zonas": [ { "id": "sol", "nome": "Sol", "ordem": 1 } ],
  "cards": [ {
    "id": "...", "titulo": "...", "descricao": "...",
    "zona": "sol", "pai": null, "x": 0, "y": 0,
    "recolhido": false, "tags": [],
    "animacao": null, "linkDocs": null,
    "criadoEm": "ISO-8601", "atualizadoEm": "ISO-8601"
  } ],
  "conexoes": [ {
    "id": "...", "de": "idCard", "para": "idCard",
    "texto": "por que se relacionam",
    "direcional": true
  } ]
}
```

O nível hierárquico é derivado do campo "pai". Inclua uma função de migração pelo campo "versao", para eu não perder dados se o formato mudar.

## Layout e visual
- Fundo preto, cards brancos com texto preto. Minimalista: branco e cinza sobre preto; a única cor forte permitida é a do próprio Sol.
- Sol à esquerda e Terra à direita, como âncoras visuais do espaço (acompanham pan e zoom). Sol com corona/brilho sutilmente animado; Terra com linhas de campo da magnetosfera estilizadas.
- O eixo horizontal representa o caminho físico Sol → Terra, dividido em zonas configuráveis no JSON. Zonas iniciais:
  1. Sol (interior e superfície)
  2. Atmosfera solar e eventos (coroa, flares, CMEs, buracos coronais)
  3. Meio interplanetário (vento solar, campo magnético interplanetário)
  4. Magnetosfera
  5. Ionosfera e termosfera
  6. Superfície terrestre e efeitos
  Limites das zonas: linhas verticais tracejadas bem discretas, com o nome no topo.
- Fundo com estrelas estáticas e partículas de vento solar fluindo da esquerda para a direita, em baixa opacidade. Botão para desligar os efeitos animados.
- Os cards "flutuam" só visualmente: oscilação lenta de poucos pixels, com fases diferentes entre cards. A posição salva não muda. NÃO use layout por simulação de forças: a posição é definida por mim ao arrastar.
- Tipografia: uma sans-serif limpa (Inter ou IBM Plex Sans, via Google Fonts).

## Interações
Canvas:
- Pan arrastando o fundo; zoom com a roda do mouse (centrado no cursor) e pinça no touchpad/celular.
- Duplo clique no espaço vazio cria um card ali; a zona é definida pela posição x.
- Botão "enquadrar tudo".

Cards:
- Arrastar move o card; ao soltar, a zona é atualizada pela posição.
- Clique seleciona e ativa o "modo foco": o card e suas conexões diretas em destaque, o resto esmaecido. Esc sai.
- Duplo clique (ou botão) abre um painel lateral para editar: título, descrição, zona, card pai, tags, link do Google Docs e animação associada.
- No card fechado aparecem só o título, o início da descrição e ícones pequenos indicando animação e/ou link do Docs.

Conexões:
- Arrastar de uma alça na borda do card até outro card cria a conexão e abre um campo para digitar o texto.
- Pode haver mais de uma conexão entre o mesmo par de cards; desenhe como curvas separadas, sem sobreposição.
- Seta indica a direção quando "direcional" for verdadeiro.
- O texto aparece pequeno sobre a linha; clicar nele permite editar, inverter a direção ou excluir.
- Linhas finas cinza-claro; em destaque, brancas.

Hierarquia:
- Um card pode ter um card pai. Cards de nível mais alto são maiores; filhos, menores.
- Um card pai pode ser recolhido: os filhos somem e o pai mostra um contador ("+4"). Conexões de filhos ocultos passam a sair do pai, tracejadas.
- Quando expandido, uma linha sutil liga pai e filhos, visualmente diferente das conexões comuns.

Busca:
- Campo que filtra por título, descrição e tags, destacando os resultados e centralizando o primeiro.

## Animações interativas
Vou pedir animações ao longo do estudo, em outras conversas. A arquitetura precisa aceitar arquivos novos sem alterar o código do app:
- Cada animação é um arquivo HTML autossuficiente em `animacoes/` (CSS e JS embutidos; bibliotecas só via CDN).
- `animacoes/manifesto.json` lista as animações disponíveis (arquivo, título, descrição curta). O painel do card oferece um seletor baseado nesse manifesto.
- A animação abre num painel expandido/modal grande, dentro de `<iframe sandbox="allow-scripts">`, carregado só ao abrir e descarregado ao fechar. Nunca renderize animações dentro dos cards no canvas.
- Crie `animacoes/_modelo.html` (template comentado) e uma animação de demonstração simples para testar o fluxo.
- Crie `animacoes/CONTRATO.md` com as regras que toda animação deve seguir: arquivo único, fundo preto, responsiva ao tamanho do iframe, sem acesso ao app pai, e como registrá-la no manifesto. Vou colar esse contrato no chat ao pedir animações novas.

## Documentação
- `CLAUDE.md` na raiz com objetivo, arquitetura, modelo de dados, contrato das animações e convenções, para sessões futuras seguirem o mesmo padrão.
- `README.md` em português com: como rodar localmente (ex.: `python -m http.server`, já que abrir o index.html direto bloqueia o carregamento do JSON); como publicar alterações (via "Salvar no arquivo" + git, ou upload do JSON pela interface web do GitHub, sem git); como adicionar uma animação; como ativar o GitHub Pages.

## Forma de trabalho
Trabalhe por fases e PARE ao final de cada uma para eu testar e aprovar. Um commit por fase, com mensagem específica.

- Fase 0 — Diagnóstico e plano, SEM escrever código: estrutura de arquivos, modelo de dados confirmado ou ajustado, bibliotecas (se houver) com justificativa, riscos e ambiguidades deste pedido, e perguntas sobre o que estiver indefinido.
- Fase 1 — Canvas, zonas, Sol e Terra estáticos, pan/zoom, criar/editar/mover/excluir cards, persistência completa (localStorage, exportar/importar, salvar no arquivo) e desfazer/refazer.
- Fase 2 — Conexões (criação por arrasto, texto, direção, múltiplas por par, edição/exclusão) e modo foco.
- Fase 3 — Hierarquia (pai/filho, tamanhos, recolher/expandir) e busca.
- Fase 4 — Sistema de animações (manifesto, painel com iframe, modelo, demonstração, CONTRATO.md).
- Fase 5 — Efeitos visuais (estrelas, vento solar, flutuação, corona), botão de desempenho, README, CLAUDE.md e passo a passo do deploy no GitHub Pages.

Critério de desempenho: com 150 cards e 300 conexões, pan e zoom continuam fluidos.
