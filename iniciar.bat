@echo off
rem ==========================================================================
rem  Mapa de Estudos Sol-Terra: inicia o servidor local e abre o navegador.
rem  Uso: de dois cliques neste arquivo.
rem  Deixe a janela preta aberta enquanto usa o mapa; fechar a janela encerra.
rem  (Este arquivo nao usa acentos de proposito: o Prompt de Comando do
rem   Windows os mostraria como caracteres estranhos.)
rem ==========================================================================

rem Vai para a pasta onde este arquivo esta (mesmo se aberto de outro lugar).
cd /d "%~dp0"
title Mapa de Estudos Sol-Terra

rem Procura o Python: primeiro o lancador "py", depois o comando "python".
where py >nul 2>nul
if not errorlevel 1 (
    py -3 iniciar.py
    goto fim
)
where python >nul 2>nul
if not errorlevel 1 (
    python iniciar.py
    goto fim
)

echo.
echo   Python nao foi encontrado neste computador.
echo   Instale em https://www.python.org/downloads/ e tente de novo.
echo.
pause
exit /b 1

:fim
rem Se o servidor terminou com erro, mantem a janela aberta para leitura.
if errorlevel 1 pause
