#!/bin/bash
# ==========================================================================
#  Mapa de Estudos Sol–Terra: inicia o servidor local e abre o navegador.
#  macOS: dê dois cliques neste arquivo. Na primeira vez, o macOS pode
#         bloquear; nesse caso, clique com o botão direito → Abrir.
#  Linux: rode no terminal, dentro desta pasta:  bash iniciar.command
#  Deixe a janela do terminal aberta enquanto usa o mapa.
# ==========================================================================

# Vai para a pasta onde este arquivo está (mesmo se aberto de outro lugar).
cd "$(dirname "$0")" || exit 1

# Procura o Python 3.
if command -v python3 >/dev/null 2>&1; then
  python3 iniciar.py
elif command -v python >/dev/null 2>&1; then
  python iniciar.py
else
  echo
  echo "  Python não foi encontrado neste computador."
  echo "  Instale em https://www.python.org/downloads/ e tente de novo."
  echo
  read -r -p "  Aperte Enter para fechar..."
  exit 1
fi

# Se o servidor terminou com erro, mantém a janela aberta para leitura.
status=$?
if [ "$status" -ne 0 ]; then
  read -r -p "  Aperte Enter para fechar..."
fi
exit "$status"
