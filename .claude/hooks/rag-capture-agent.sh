#!/usr/bin/env bash
# .claude/hooks/rag-capture-agent.sh
# Captura o aprendizado de UM agent que acabou de terminar.
# Eventos: SubagentStop (payload tem transcript_path) OU, como fallback,
# PostToolUse matcher "Agent" (payload tem tool_input + tool_output).
# summarize.ts lida com ambas as formas. Roda ASYNC (settings.json) — nao bloqueia.
# Bypass: HARNESS_SKIP_RAG_CAPTURE=1
set -u
# Early-exit BARATO (2.4.0) — antes do source (dispara em TODO Agent/Task; ver rag-inject.sh).
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

[ "${HARNESS_RAG_ENABLED:-0}" = "0" ] && exit 0
# Captura por-agent: '1' = sim (default), '0' = capturar SO no SessionEnd (1x/sessao).
# Setar '0' em projeto com muito subagent reduz chamadas ao resumidor — mitiga o custo do
# `claude -p` pos-15/jun/2026 (credito Agent SDK a preco de API). Ver harness.env / RAG.md.
[ "${HARNESS_RAG_CAPTURE_AGENTS:-0}" = "0" ] && exit 0

INPUT="$(cat)"
[ -z "$INPUT" ] && exit 0

AGENT="$(rag_json_field "$INPUT" agent_type)"
[ -z "$AGENT" ] && AGENT="$(rag_json_field "$INPUT" subagent_type)"
[ -z "$AGENT" ] && AGENT="agent"

rag_capture "agent" "$AGENT" "$INPUT"
exit 0
