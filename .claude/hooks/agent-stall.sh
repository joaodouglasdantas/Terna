#!/usr/bin/env bash
# .claude/hooks/agent-stall.sh (3.4.20) — agente VIVO que parou de escrever no transcript.
#
# Motivo (medido 03/09, exec da PRD-137): 3 agentes ficaram 10 min mudos ate o teto do watchdog
# (2 michelangelo presos no browser pane, 1 hefesto de doc). O watchdog por p90 so avisa DEPOIS que
# o agente volta. Este script olha os transcripts dos subagentes da sessao mais recente deste
# projeto: agente cujo arquivo nao muda ha N min e cujo tool_use ainda NAO devolveu resultado no
# transcript do pai = STALL. A skill arma `Monitor` com ele apos cada onda e, ao disparar, faz
# TaskStop no agente e redespacha UMA vez com o motivo.
#
#   uso: bash .claude/hooks/agent-stall.sh [minutos]        (default HARNESS_STALL_MIN=4)
#   saida: STALL|<agent-id>|<papel>|<min sem escrever>|<descricao>   (uma por agente parado)
#          STALL-RESUMO|vivos=<n>|parados=<k>
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ROOT="${HARNESS_STALL_ROOT:-$ROOT}"   # 3.4.27: vigiar OUTRO projeto a partir desta copia (monitor externo)
MIN="${1:-${HARNESS_STALL_MIN:-4}}"; case "$MIN" in ''|*[!0-9]*) MIN=4 ;; esac
# slug do projeto como o Claude Code grava: caminho absoluto com / e : trocados por -
ABS="$(cd "$ROOT" && pwd -W 2>/dev/null || pwd)"
SLUG="$(printf '%s' "$ABS" | sed 's#[/:\\]#-#g; s#^-*##')"
PDIR="${HOME:-$USERPROFILE}/.claude/projects/$SLUG"
[ -d "$PDIR" ] || PDIR="$(ls -d "${HOME:-$USERPROFILE}"/.claude/projects/*"$(basename "$ROOT")" 2>/dev/null | head -1)"
[ -d "$PDIR" ] || { echo "STALL-RESUMO|vivos=0|parados=0"; exit 0; }
# sessao = a que tem o subagente mais recentemente ATIVO (nao o pai mais recente: outra sessao do
# mesmo projeto pode ter escrito depois). Sem subagente nas ultimas 3 h = nada vivo.
# 3.4.22 (item 20.1): sem `find -printf` (GNU-ism — no macOS devolvia vivos=0 em silencio); o mtime
# vem do stat (GNU -c %Y | BSD -f %m), portavel em bash 3.2.
NEWEST=""; NEWEST_T=0
while IFS= read -r f; do
  [ -n "$f" ] || continue
  t="$(stat -c %Y "$f" 2>/dev/null || stat -f %m "$f" 2>/dev/null || echo 0)"
  case "$t" in ''|*[!0-9]*) t=0 ;; esac
  if [ "$t" -gt "$NEWEST_T" ]; then NEWEST_T="$t"; NEWEST="$f"; fi
done < <(find "$PDIR" -path '*/subagents/agent-*.jsonl' -mmin -180 2>/dev/null)
[ -n "$NEWEST" ] || { echo "STALL-RESUMO|vivos=0|parados=0"; exit 0; }
SUBD="$(dirname "$NEWEST")"
SESS="$(dirname "$SUBD").jsonl"
[ -d "$SUBD" ] || { echo "STALL-RESUMO|vivos=0|parados=0"; exit 0; }
NOW="$(date +%s)"; V=0; K=0
for f in "$SUBD"/agent-*.jsonl; do
  [ -f "$f" ] || continue
  META="${f%.jsonl}.meta.json"
  TU="$(grep -o '"toolUseId":"[^"]*"' "$META" 2>/dev/null | cut -d'"' -f4)"
  [ -n "$TU" ] || continue
  # 3.4.27: agente em BACKGROUND devolve um tool_result na hora do lancamento ("Async agent launched") e a
  # conclusao real chega como <task-notification><task-id>ID</task-id>. Medido 09/09: o check antigo via o
  # tool_result do lancamento e dizia vivos=0 com sherlock de 111 turnos em plena revisao.
  ID="$(basename "$f" .jsonl | sed 's/^agent-//')"
  grep -q "<task-id>$ID</task-id>" "$SESS" 2>/dev/null && continue                 # background: terminou
  if grep "\"tool_use_id\":\"$TU\"" "$SESS" 2>/dev/null | grep -qv 'Async agent launched'; then continue; fi   # foreground: resultado real voltou
  V=$((V+1))
  MT="$(stat -c %Y "$f" 2>/dev/null || stat -f %m "$f" 2>/dev/null || echo "$NOW")"
  IDLE=$(( (NOW - MT) / 60 ))
  if [ "$IDLE" -ge "$MIN" ]; then
    K=$((K+1)); PAPEL="$(grep -o '"agentType":"[^"]*"' "$META" | cut -d'"' -f4)"; DESC="$(grep -o '"description":"[^"]*"' "$META" | cut -d'"' -f4 | cut -c1-60)"
    printf 'STALL|%s|%s|%s|%s\n' "$(basename "$f" .jsonl | sed 's/^agent-//')" "$PAPEL" "$IDLE" "$DESC"
    # 3.5.0: incidente VERSIONADO (tipo stall — reservado desde a 3.4.23), UMA vez por agente: o Monitor chama este
    # script em loop e o mesmo agente parado nao pode virar N linhas. Marcador em .harness-run/stall/<id>.
    if [ ! -e "$ROOT/.claude/.harness-run/stall/$ID" ]; then
      mkdir -p "$ROOT/.claude/.harness-run/stall" 2>/dev/null && : > "$ROOT/.claude/.harness-run/stall/$ID" 2>/dev/null
      # shellcheck disable=SC1091
      [ -f "$SCRIPT_DIR/_incidente.sh" ] && . "$SCRIPT_DIR/_incidente.sh" && HARNESS_INCIDENTE_ROOT="$ROOT" harness_incidente stall "$PAPEL" "" "$ID" "${IDLE} min sem escrever: $DESC"
    fi
  fi
done
printf 'STALL-RESUMO|vivos=%s|parados=%s\n' "$V" "$K"
exit 0
