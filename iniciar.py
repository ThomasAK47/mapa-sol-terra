#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Servidor local do Mapa de Estudos Sol–Terra
===========================================

Como usar
---------
Dê dois cliques em ``iniciar.bat`` (Windows) ou ``iniciar.command`` (macOS).
Ou, num terminal aberto nesta pasta:  python iniciar.py

Deixe a janela aberta enquanto usa o mapa. Para encerrar, feche a janela
(ou aperte Ctrl+C dentro dela).

O que este programa faz
-----------------------
* Serve os arquivos desta pasta em http://127.0.0.1:8000. Ele escuta APENAS no
  endereço 127.0.0.1, então só este computador consegue acessar o mapa.
* Abre o navegador automaticamente.
* Recebe as gravações da página em POST /api/salvar e grava SOMENTE em
  data/estudos.json, de forma atômica: escreve primeiro num arquivo
  temporário e só depois o renomeia por cima do original. Se algo falhar no
  meio, o arquivo antigo continua inteiro.
* Antes da primeira gravação de cada dia, guarda uma cópia do arquivo em
  data/backups/ (mantém as 30 mais recentes).

Usa apenas a biblioteca padrão do Python: não é preciso instalar nada.

Opções (uso avançado e testes)
------------------------------
  --porta N          usa outra porta (padrão: 8000). Atenção: a reserva de
                     alterações do navegador é separada por porta.
  --sem-navegador    não abre o navegador automaticamente.
As mesmas opções podem vir das variáveis de ambiente MAPA_PORTA e
MAPA_SEM_NAVEGADOR=1.
"""

import argparse
import datetime
import hashlib
import http.server
import json
import os
import posixpath
import re
import shutil
import socket
import socketserver
import sys
import threading
import time
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path

if sys.version_info < (3, 8):
    sys.exit("O Mapa de Estudos precisa do Python 3.8 ou mais recente.")


# ---------------------------------------------------------------------------
# Configuração
# ---------------------------------------------------------------------------

HOST = "127.0.0.1"  # só este computador; ninguém na rede alcança o servidor
PORTA_PADRAO = 8000

PASTA_PROJETO = Path(__file__).resolve().parent
ARQUIVO_DADOS = PASTA_PROJETO / "data" / "estudos.json"  # o ÚNICO arquivo gravado
PASTA_BACKUPS = PASTA_PROJETO / "data" / "backups"

MAX_BACKUPS_DIARIOS = 30
MAX_BACKUPS_SEGURANCA = 30
TAMANHO_MAXIMO = 20 * 1024 * 1024  # 20 MB, muito acima do necessário

# Resposta de /api/status. A página usa isto para saber que está falando com
# este servidor (e não com o GitHub Pages ou outro servidor qualquer).
ASSINATURA_APP = "mapa-sol-terra"
VERSAO_SERVIDOR = 1

# A página pode pedir um backup extra antes de certas gravações (ex.: antes de
# importar um arquivo). O motivo vira parte do nome do backup, por isso só
# aceitamos letras minúsculas, números e hífens.
PADRAO_MOTIVO = re.compile(r"^[a-z0-9-]{1,40}$")

# Tipos de arquivo enviados ao navegador. Ficam fixos aqui porque, em alguns
# Windows, o registro do sistema informa "text/plain" para arquivos .js, e aí
# o navegador se recusa a carregar os módulos da página.
TIPOS_DE_ARQUIVO = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    "": "application/octet-stream",
}

# Garante que duas gravações nunca aconteçam ao mesmo tempo.
trava_gravacao = threading.Lock()


# ---------------------------------------------------------------------------
# Funções de apoio
# ---------------------------------------------------------------------------

def registrar(mensagem):
    """Escreve uma linha com horário na janela do servidor."""
    print(f"  {datetime.datetime.now():%H:%M:%S}  {mensagem}", flush=True)


def calcular_versao(conteudo):
    """Identificador curto de um conteúdo (resumo SHA-256).

    A página guarda a versão do arquivo que carregou e a envia de volta ao
    salvar. Se o arquivo tiver mudado nesse meio-tempo (outra aba, edição à
    mão, git), as versões não batem e o servidor recusa sobrescrever.
    """
    return hashlib.sha256(conteudo).hexdigest()[:16]


def ler_arquivo_dados():
    """Devolve (conteúdo em bytes, versão), ou (None, "novo") se não existe."""
    try:
        conteudo = ARQUIVO_DADOS.read_bytes()
    except FileNotFoundError:
        return None, "novo"
    return conteudo, calcular_versao(conteudo)


def validar_estrutura(dados):
    """Confere o mínimo do formato do mapa. Devolve o problema ou None."""
    if not isinstance(dados, dict):
        return "o conteúdo precisa ser um objeto { ... }"
    versao = dados.get("versao")
    if not isinstance(versao, int) or isinstance(versao, bool) or versao < 1:
        return "o campo 'versao' está ausente ou inválido"
    for campo in ("zonas", "cards", "conexoes"):
        if not isinstance(dados.get(campo), list):
            return f"o campo '{campo}' precisa ser uma lista"
    for card in dados["cards"]:
        if not isinstance(card, dict) or not isinstance(card.get("id"), str):
            return "há um card sem 'id'"
    for conexao in dados["conexoes"]:
        if not isinstance(conexao, dict) or not isinstance(conexao.get("id"), str):
            return "há uma conexão sem 'id'"
    return None


def contar_cards(conteudo):
    """Quantos cards há num conteúdo JSON (0 se não der para ler)."""
    try:
        dados = json.loads(conteudo.decode("utf-8"))
        return len(dados.get("cards", [])) if isinstance(dados, dict) else 0
    except (ValueError, UnicodeDecodeError, AttributeError):
        return 0


def gravar_atomico(destino, conteudo):
    """Grava sem risco de corromper: arquivo temporário + renomear.

    Se o programa for fechado no meio da escrita, o que fica pela metade é o
    temporário; o arquivo original continua inteiro.
    """
    destino.parent.mkdir(parents=True, exist_ok=True)
    temporario = destino.with_name(destino.name + ".tmp")
    with open(temporario, "wb") as arquivo:
        arquivo.write(conteudo)
        arquivo.flush()
        os.fsync(arquivo.fileno())  # garante que chegou ao disco
    # No Windows, antivírus, indexador ou OneDrive podem segurar o arquivo por
    # um instante. Tentamos de novo algumas vezes antes de desistir.
    for tentativa in range(8):
        try:
            os.replace(temporario, destino)  # troca atômica
            return
        except PermissionError:
            if tentativa == 7:
                raise
            time.sleep(0.15 * (tentativa + 1))


def podar_backups(prefixo, manter):
    """Apaga os backups mais antigos de um tipo, mantendo os N mais recentes."""
    # Os nomes começam com a data (AAAA-MM-DD), então a ordem alfabética é a
    # ordem cronológica.
    arquivos = sorted(PASTA_BACKUPS.glob(prefixo + "*.json"))
    for antigo in arquivos[:-manter]:
        try:
            antigo.unlink()
        except OSError:
            pass


def fazer_backup_diario():
    """Antes da primeira gravação do dia, guarda o arquivo como estava."""
    if not ARQUIVO_DADOS.exists():
        return
    destino = PASTA_BACKUPS / f"diario-{datetime.date.today().isoformat()}.json"
    if destino.exists():
        return
    PASTA_BACKUPS.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ARQUIVO_DADOS, destino)
    podar_backups("diario-", MAX_BACKUPS_DIARIOS)
    registrar(f"cópia do dia guardada em data/backups/{destino.name}")


def fazer_backup_seguranca(motivo):
    """Cópia extra do arquivo atual antes de uma gravação arriscada."""
    if not ARQUIVO_DADOS.exists():
        return
    PASTA_BACKUPS.mkdir(parents=True, exist_ok=True)
    carimbo = datetime.datetime.now().strftime("%Y-%m-%d_%H%M%S")
    destino = PASTA_BACKUPS / f"seguranca-{carimbo}-{motivo}.json"
    numero = 2
    while destino.exists():
        destino = PASTA_BACKUPS / f"seguranca-{carimbo}-{motivo}-{numero}.json"
        numero += 1
    shutil.copy2(ARQUIVO_DADOS, destino)
    podar_backups("seguranca-", MAX_BACKUPS_SEGURANCA)
    registrar(f"cópia de segurança guardada em data/backups/{destino.name}")


def salvar(corpo, versao_base, motivo_backup):
    """Valida e grava os dados enviados pela página.

    Devolve (código HTTP, resposta para a página, mensagem para a janela).
    """
    try:
        dados = json.loads(corpo.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as erro:
        return 400, {"ok": False, "erro": "json-invalido",
                     "mensagem": f"O conteúdo recebido não é um JSON válido ({erro})."}, None

    problema = validar_estrutura(dados)
    if problema:
        return 422, {"ok": False, "erro": "estrutura-invalida",
                     "mensagem": f"O JSON recebido não tem o formato do mapa: {problema}."}, None

    # Formato gravado: indentado e com acentos legíveis (UTF-8), para que o
    # histórico no GitHub mostre com clareza o que mudou entre versões.
    conteudo = (json.dumps(dados, ensure_ascii=False, indent=2) + "\n").encode("utf-8")

    with trava_gravacao:
        atual, versao_atual = ler_arquivo_dados()

        if versao_base == "forcar":
            # Num conflito, a pessoa escolheu manter a versão da página:
            # o arquivo atual vai para os backups antes de ser substituído.
            fazer_backup_seguranca("antes-de-sobrescrever")
        elif versao_base != versao_atual:
            return 409, {"ok": False, "erro": "conflito", "versaoArquivo": versao_atual,
                         "mensagem": "O arquivo foi alterado fora desta página."}, None

        if atual == conteudo:
            return 200, {"ok": True, "versao": versao_atual, "semMudancas": True}, None

        fazer_backup_diario()
        if motivo_backup:
            fazer_backup_seguranca(motivo_backup)
        elif atual is not None:
            # Rede de segurança: se uma gravação apagar mais da metade dos
            # cards, o arquivo anterior é guardado antes.
            antes, depois = contar_cards(atual), len(dados["cards"])
            if antes >= 10 and depois < antes / 2:
                fazer_backup_seguranca("muitos-cards-removidos")

        gravar_atomico(ARQUIVO_DADOS, conteudo)
        nova_versao = calcular_versao(conteudo)

    resumo = f"salvo ({len(dados['cards'])} cards, {len(dados['conexoes'])} conexões)"
    return 200, {"ok": True, "versao": nova_versao}, resumo


# ---------------------------------------------------------------------------
# Servidor HTTP
# ---------------------------------------------------------------------------

class Manipulador(http.server.SimpleHTTPRequestHandler):
    """Atende cada pedido do navegador."""

    server_version = "MapaSolTerra/1"
    extensions_map = TIPOS_DE_ARQUIVO

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PASTA_PROJETO), **kwargs)

    # ---- verificações de segurança ------------------------------------

    def _host_permitido(self):
        # Protege contra "DNS rebinding": um site malicioso que finge ser
        # 127.0.0.1 chega com outro nome no cabeçalho Host.
        host = (self.headers.get("Host") or "").strip().lower()
        return host in self.server.hosts_permitidos

    def _origem_permitida(self):
        # O navegador informa em "Origin" qual página fez o pedido. Só a
        # própria página do mapa pode gravar; outro site aberto em outra aba
        # não consegue.
        origem = (self.headers.get("Origin") or "").strip().lower()
        return origem in self.server.origens_permitidas

    @staticmethod
    def _caminho_proibido(caminho):
        """Pastas e arquivos que o navegador não precisa ver."""
        limpo = posixpath.normpath(urllib.parse.unquote(caminho)).lower()
        partes = [parte for parte in limpo.split("/") if parte]
        if any(parte.startswith(".") for parte in partes):  # .git, .claude…
            return True
        return limpo.startswith("/data/backups") or limpo.endswith(".tmp")

    # ---- respostas -----------------------------------------------------

    def end_headers(self):
        # Nada fica em cache: o navegador sempre recebe a versão mais recente
        # dos arquivos do app e dos dados.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _responder_json(self, codigo, dados, cabecalhos=None):
        corpo = json.dumps(dados, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        for nome, valor in (cabecalhos or {}).items():
            self.send_header(nome, valor)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(corpo)

    def _enviar_dados(self):
        """Envia data/estudos.json junto com a versão (resumo) do arquivo."""
        conteudo, versao = ler_arquivo_dados()
        if conteudo is None:
            return self._responder_json(404, {"erro": "inexistente"}, {"X-Versao-Arquivo": versao})
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(conteudo)))
        self.send_header("X-Versao-Arquivo", versao)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(conteudo)

    # ---- leitura (GET e HEAD) --------------------------------------------

    def do_GET(self):
        self._atender_leitura()

    def do_HEAD(self):
        self._atender_leitura()

    def _atender_leitura(self):
        if not self._host_permitido():
            return self._responder_json(403, {"erro": "endereco-nao-permitido"})
        caminho = urllib.parse.urlsplit(self.path).path
        if caminho == "/api/status":
            return self._responder_json(200, {"app": ASSINATURA_APP,
                                              "versaoServidor": VERSAO_SERVIDOR,
                                              "editavel": True})
        if caminho == "/data/estudos.json":
            return self._enviar_dados()
        if self._caminho_proibido(caminho):
            return self.send_error(404)
        if self.command == "HEAD":
            return super().do_HEAD()
        return super().do_GET()

    # ---- gravação (POST /api/salvar) -----------------------------------

    def do_POST(self):
        caminho = urllib.parse.urlsplit(self.path).path
        if caminho != "/api/salvar":
            return self._responder_json(404, {"ok": False, "erro": "rota-inexistente"})
        if not self._host_permitido() or not self._origem_permitida():
            registrar("aviso: gravação recusada (o pedido não veio da página do mapa)")
            return self._responder_json(403, {"ok": False, "erro": "origem-nao-permitida",
                                               "mensagem": "Pedido recusado: ele não veio da página do mapa."})
        tipo = (self.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        if tipo != "application/json":
            return self._responder_json(415, {"ok": False, "erro": "tipo-invalido",
                                               "mensagem": "O conteúdo precisa ser enviado como JSON."})
        try:
            tamanho = int(self.headers.get("Content-Length") or "")
        except ValueError:
            return self._responder_json(411, {"ok": False, "erro": "sem-tamanho",
                                               "mensagem": "Pedido sem tamanho informado."})
        if tamanho <= 0 or tamanho > TAMANHO_MAXIMO:
            return self._responder_json(413, {"ok": False, "erro": "tamanho-invalido",
                                               "mensagem": "Conteúdo vazio ou grande demais."})
        corpo = self.rfile.read(tamanho)

        versao_base = (self.headers.get("X-Versao-Base") or "").strip()
        motivo = (self.headers.get("X-Backup-Antes") or "").strip().lower()
        if not PADRAO_MOTIVO.match(motivo):
            motivo = None

        try:
            codigo, resposta, resumo = salvar(corpo, versao_base, motivo)
        except OSError as erro:
            codigo = 500
            resposta = {"ok": False, "erro": "falha-ao-gravar",
                        "mensagem": f"Não consegui gravar o arquivo: {erro}"}
            resumo = f"ERRO ao gravar: {erro}"

        self._responder_json(codigo, resposta)
        # A mensagem na janela vem depois da resposta, para nunca atrasá-la.
        if resumo:
            registrar(resumo)
        elif codigo == 409:
            registrar("aviso: gravação recusada por conflito (o arquivo mudou fora da página)")

    # ---- registro na janela ---------------------------------------------

    def log_message(self, formato, *args):
        """Silencia o registro padrão (uma linha por arquivo pedido)."""

    def log_error(self, formato, *args):
        mensagem = formato % args
        if "code 404" not in mensagem:
            registrar("aviso: " + mensagem)


class Servidor(http.server.ThreadingHTTPServer):
    """Servidor que atende vários pedidos ao mesmo tempo."""

    daemon_threads = True
    # No Windows, a opção padrão (SO_REUSEADDR) deixaria DOIS servidores
    # ocuparem a mesma porta sem erro. Lá usamos SO_EXCLUSIVEADDRUSE.
    allow_reuse_address = os.name != "nt"

    def __init__(self, endereco, manipulador, porta):
        self.hosts_permitidos = {f"127.0.0.1:{porta}", f"localhost:{porta}"}
        self.origens_permitidas = {f"http://127.0.0.1:{porta}", f"http://localhost:{porta}"}
        super().__init__(endereco, manipulador)

    def server_bind(self):
        if os.name == "nt" and hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        # Não chamamos a versão original, que consulta o nome do computador na
        # rede e pode demorar vários segundos em algumas máquinas.
        socketserver.TCPServer.server_bind(self)
        self.server_name, self.server_port = self.server_address[:2]

    def handle_error(self, request, client_address):
        # Conexões interrompidas (ex.: recarregar a página no meio de um
        # pedido) são normais e não merecem mensagem de erro.
        if isinstance(sys.exc_info()[1], (ConnectionError, TimeoutError)):
            return
        super().handle_error(request, client_address)


# ---------------------------------------------------------------------------
# Início
# ---------------------------------------------------------------------------

def servidor_ja_rodando(porta):
    """True se já existe um servidor do mapa respondendo nesta porta."""
    abridor = urllib.request.build_opener(urllib.request.ProxyHandler({}))  # ignora proxies
    try:
        with abridor.open(f"http://{HOST}:{porta}/api/status", timeout=1.5) as resposta:
            return json.loads(resposta.read().decode("utf-8")).get("app") == ASSINATURA_APP
    except Exception:
        return False


def preparar_console():
    """Ajustes na janela preta para o servidor nunca travar sem motivo."""
    for fluxo in (sys.stdout, sys.stderr):
        try:
            if fluxo.isatty():
                fluxo.reconfigure(errors="replace")  # caractere estranho não derruba o programa
            else:
                # Saída redirecionada (ex.: terminal do Git Bash): acentos em
                # UTF-8 e cada linha gravada na hora.
                fluxo.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
        except (AttributeError, ValueError):
            pass
    if os.name != "nt":
        return
    # No Windows, clicar dentro da janela preta ativa o "modo de seleção", que
    # PAUSA o programa até alguém apertar Esc (e as gravações ficariam
    # esperando). Desligamos esse modo só nesta janela.
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        entrada = kernel32.GetStdHandle(-10)  # STD_INPUT_HANDLE
        modo = ctypes.c_uint32()
        if kernel32.GetConsoleMode(entrada, ctypes.byref(modo)):
            ENABLE_QUICK_EDIT_MODE, ENABLE_EXTENDED_FLAGS = 0x0040, 0x0080
            kernel32.SetConsoleMode(entrada, (modo.value | ENABLE_EXTENDED_FLAGS) & ~ENABLE_QUICK_EDIT_MODE)
    except Exception:
        pass


def main():
    parser = argparse.ArgumentParser(description="Servidor local do Mapa de Estudos Sol–Terra.")
    parser.add_argument("--porta", type=int, default=int(os.environ.get("MAPA_PORTA") or PORTA_PADRAO),
                        help=f"porta do servidor (padrão: {PORTA_PADRAO})")
    parser.add_argument("--sem-navegador", action="store_true",
                        default=os.environ.get("MAPA_SEM_NAVEGADOR") == "1",
                        help="não abrir o navegador automaticamente")
    argumentos = parser.parse_args()
    porta = argumentos.porta
    endereco = f"http://{HOST}:{porta}/"
    abrir_navegador = not argumentos.sem_navegador

    preparar_console()
    print()
    print("  Mapa de Estudos Sol–Terra")
    print("  " + "-" * 25)

    if servidor_ja_rodando(porta):
        print(f"  O mapa já está aberto em outra janela ({endereco}).")
        if abrir_navegador:
            print("  Abrindo o navegador...")
            webbrowser.open(endereco)
        time.sleep(3)
        return 0

    try:
        servidor = Servidor((HOST, porta), Manipulador, porta)
    except OSError as erro:
        print(f"  Não foi possível usar a porta {porta} ({erro}).")
        print("  Outro programa já está usando essa porta. Feche-o e tente de novo")
        print("  (se não souber qual é, reiniciar o computador resolve).")
        return 1

    if not ARQUIVO_DADOS.exists():
        print("  Aviso: data/estudos.json ainda não existe; ele será criado na primeira gravação.")
    print(f"  Mapa aberto em {endereco}")
    print("  Deixe esta janela aberta enquanto usa o mapa.")
    print("  Para encerrar, feche esta janela (ou aperte Ctrl+C).")
    print()

    if abrir_navegador:
        threading.Timer(0.5, webbrowser.open, args=(endereco,)).start()

    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\n  Servidor encerrado.")
    finally:
        servidor.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
