#!/usr/bin/env bash
# .claude/hooks/rag-ensure-index.sh
# Garante que o indice (rag.db) existe e esta fresco. E o que torna o RAG portatil:
# o .db e gitignored, entao apos um `git pull` no outro PC (ou 1a vez na maquina),
# a 1a sessao reconstroi o indice a partir das fontes versionadas (.md).
# Evento: SessionStart. Roda ASYNC (settings.json) — nao atrasa o inicio da sessao.
# Reconstroi se: db ausente OU algum .md fonte mais novo que o db.
# Bypass: HARNESS_SKIP_RAG_CAPTURE=1
set -u
# Early-exit BARATO (2.4.0) — antes do source (ver rag-inject.sh).
[ "${HARNESS_SKIP_RAG_CAPTURE:-0}" = "1" ] && exit 0
_HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -z "${HARNESS_RAG_ENABLED:-}" ]; then
  _flag=""
  for _f in "$_HOOK_DIR/_defaults.env" "$_HOOK_DIR/../harness.env" "$_HOOK_DIR/../harness.env.local" "${HOME:-}/.harness.env.local"; do   # 3.5.7: mesma ordem das camadas
    [ -f "$_f" ] || continue
    _v="$(sed -n "s/^[[:space:]]*HARNESS_RAG_ENABLED=['\"]\{0,1\}\([01]\).*/\1/p" "$_f" | tail -1)"
    [ -n "$_v" ] && _flag="$_v"
  done
  [ "$_flag" = "0" ] && exit 0
elif [ "$HARNESS_RAG_ENABLED" = "0" ]; then
  exit 0
fi
. "$_HOOK_DIR/_rag-common.sh"

[ "${HARNESS_SKIP_RAG_CAPTURE:-0}" = "1" ] && exit 0
[ "${HARNESS_RAG_ENABLED:-0}" = "0" ] && exit 0
[ -z "$RAG_NODE" ] && exit 0
[ -f "$RAG_TSX" ] || exit 0

NEED=0
if [ ! -f "$RAG_DB" ]; then
  NEED=1
else
  NEWER="$(find \
    "$RAG_PROJECT_DIR/.claude/knowledge" \
    "$RAG_PROJECT_DIR/.claude/memory" \
    "$RAG_PROJECT_DIR/prds/debito_tecnico" \
    -name '*.md' -newer "$RAG_DB" -print 2>/dev/null | head -1)"
  [ -n "$NEWER" ] && NEED=1
fi

[ "$NEED" = "0" ] && exit 0

rag_log "[ensure-index] reconstruindo indice (db ausente ou desatualizado)"
"$RAG_NODE" "$RAG_TSX" "$RAG_SCRIPTS/reindex.ts" >>"$RAG_LOG" 2>&1
exit 0
