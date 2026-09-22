#!/usr/bin/env bash
# .claude/hooks/rag-capture-session.sh
# Captura a sintese da SESSAO inteira.
# Claude Code: evento SessionEnd (1x/sessao; payload tem transcript_path). ASYNC.
# Codex:       NAO existe SessionEnd — wired no evento Stop, que dispara a CADA
#              turno. Para preservar a semantica "1x/sessao", aplica THROTTLE por
#              session_id: captura no maximo 1x a cada HARNESS_RAG_STOP_THROTTLE_MIN
#              minutos (default 30) por sessao. Hooks do Codex sao sincronos —
#              o gate de throttle sai em milissegundos nos turnos intermediarios.
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

INPUT="$(cat)"
[ -z "$INPUT" ] && exit 0

# Throttle (so quando o evento e Stop — no SessionEnd do Claude captura direto).
EVENT="$(rag_json_field "$INPUT" hook_event_name)"
if [ "$EVENT" = "Stop" ]; then
  SID="$(rag_json_field "$INPUT" session_id)"
  [ -z "$SID" ] && SID="sem-sessao"
  SAFE_SID="$(printf '%s' "$SID" | tr -c 'A-Za-z0-9._-' '_' | cut -c1-64)"
  THROTTLE_MIN="${HARNESS_RAG_STOP_THROTTLE_MIN:-30}"
  case "$THROTTLE_MIN" in (*[!0-9]*|"") THROTTLE_MIN=30 ;; esac
  MARK_DIR="$RAG_CLAUDE_DIR/.harness-run/rag-stop-capture"
  MARK="$MARK_DIR/$SAFE_SID"
  if [ -f "$MARK" ] && [ -n "$(find "$MARK" -mmin "-$THROTTLE_MIN" 2>/dev/null)" ]; then
    exit 0   # capturado ha pouco nesta sessao — aguarda a janela
  fi
  mkdir -p "$MARK_DIR" 2>/dev/null || exit 0
  : > "$MARK" 2>/dev/null || true
  # higiene: markers de sessoes velhas (>48h) sao lixo
  find "$MARK_DIR" -type f -mmin +2880 -delete 2>/dev/null || true
fi

rag_capture "session" "session" "$INPUT"
exit 0
