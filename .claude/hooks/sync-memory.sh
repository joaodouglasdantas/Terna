#!/usr/bin/env bash
# .claude/hooks/sync-memory.sh
# Hook SessionStart — sincroniza .claude/memory/ (versionado no repo) para
# ~/.claude/projects/<slug>/memory/ (lido pelo sistema de memoria do Claude Code).
# Assim a memoria do projeto viaja junto com o repo, mas continua sendo aplicada
# por-maquina (o destino e local de cada dev).
# Bypass: export HARNESS_SKIP_MEMORY_SYNC=1

# 0) Carrega config (harness.env), se existir.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 3.5.7: camadas de configuracao — hooks/_env.sh carrega _defaults.env -> harness.env -> harness.env.local -> ~/.harness.env.local
# (ambiente da sessao vence). Antes cada hook tinha o proprio loop.
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_env.sh"

# 1) Bypass total.
if [ "${HARNESS_SKIP_MEMORY_SYNC:-0}" = "1" ]; then
  exit 0
fi

# 1b) Adapter do HOST CLAUDE (2.0.0): o espelho em ~/.claude/projects/<slug>/memory/
# so faz sentido para o auto-memory do Claude Code. Em outro host (Codex), a fonte
# versionada .claude/memory/ e lida diretamente (ponteiro no AGENTS.md) — no-op aqui.
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_host-detect.sh"
harness_host_is claude || exit 0

# 2) Diretorio fonte (.claude/memory/ no repo).
SRC="$SCRIPT_DIR/../memory"
if [ ! -d "$SRC" ]; then
  echo "[sync-memory hook] Diretorio fonte nao encontrado: $SRC" >&2
  exit 0
fi

# 3) Computa slug do projeto a partir do path absoluto Windows-style.
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
if command -v cygpath >/dev/null 2>&1; then
  NATIVE_PATH="$(cygpath -w "$PROJECT_DIR" 2>/dev/null || printf '%s' "$PROJECT_DIR")"
else
  NATIVE_PATH="$PROJECT_DIR"
fi
# O dash INICIAL faz parte do slug real do Claude Code no macOS/Linux
# ('/Applications/...' -> '-Applications-...') — nao remover (um sed 's/^-*//'
# antigo mandava as memorias para um diretorio-gemeo morto em todo host Mac).
SLUG="$(printf '%s' "$NATIVE_PATH" | tr ':\\/' '---')"

if [ -z "$SLUG" ]; then
  echo "[sync-memory hook] Nao foi possivel computar slug do projeto." >&2
  exit 0
fi

# 4) Copia arquivos .md do repo para o destino (sobrescreve).
DEST="$HOME/.claude/projects/$SLUG/memory"
mkdir -p "$DEST" 2>/dev/null || true

if ! cp -f "$SRC"/*.md "$DEST/" 2>/dev/null; then
  echo "[sync-memory hook] Falha ao copiar memorias para $DEST" >&2
  exit 0
fi

exit 0
