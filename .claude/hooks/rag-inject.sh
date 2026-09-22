#!/usr/bin/env bash
# .claude/hooks/rag-inject.sh
# Injeta conhecimento relevante no contexto ANTES do turno.
# Evento: UserPromptSubmit (payload tem 'prompt'). SINCRONO (o additionalContext
# precisa estar pronto antes do modelo ler o prompt) com degradacao graciosa:
# qualquer falha/silencio => nao injeta nada e NUNCA bloqueia o prompt (exit 0).
# Bypass: HARNESS_SKIP_RAG_INJECT=1
set -u
# Early-exit BARATO (2.4.0) — antes do source: o _rag-common.sh resolve node/php
# com globs de filesystem no momento do source, e este hook e SINCRONO em TODO
# UserPromptSubmit. Com RAG desligado, sair aqui poupa esse custo por turno.
[ "${HARNESS_SKIP_RAG_INJECT:-0}" = "1" ] && exit 0
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

[ "${HARNESS_RAG_ENABLED:-0}" = "0" ] && exit 0
[ -z "$RAG_NODE" ] && exit 0
[ -f "$RAG_TSX" ] || exit 0
[ -f "$RAG_DB" ] || exit 0   # sem indice ainda: nada a injetar

INPUT="$(cat)"
PROMPT="$(rag_json_field "$INPUT" prompt)"
[ -z "$PROMPT" ] && exit 0

# search.ts --hook imprime o JSON {hookSpecificOutput:{...}} pronto (ou nada).
OUT="$("$RAG_NODE" "$RAG_TSX" "$RAG_SCRIPTS/search.ts" --hook "$PROMPT" 2>>"$RAG_LOG")"
[ -n "$OUT" ] && printf '%s' "$OUT"
exit 0
