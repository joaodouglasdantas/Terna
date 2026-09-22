#!/usr/bin/env bash
# .claude/hooks/task-matrix.sh (3.4.20) — MATRIZ arquivo x task: quem escreve em que.
#
# Motivo (medido 03/09, exec da PRD-137): `sugerir_resposta.php` era alvo de 5 tasks; o pipeline
# serializou tudo por [mutex] e a telemetria fechou com `limitou=mutex`. Um arquivo compartilhado
# por 3+ tasks e um HUB: vira task propria (o hub primeiro, as consumidoras depois) ou o codigo novo
# nasce em modulo proprio e o arquivo compartilhado recebe 1 linha numa unica task. Roda na
# conferencia mecanica do Passo 8 da /prd e de novo apos cada lote de correcao dos gates.
#
#   uso: bash .claude/hooks/task-matrix.sh "prds/PRD-NNN-*/tasks/TASK-*.md"   [--hub N]
#   saida: MATRIZ|<arquivo>|<n tasks>|<TASK-ids>          (uma por arquivo de PRODUCAO, n desc)
#          MATRIZ-HUB|<arquivo>|<n>|<TASK-ids>            (so os com n >= HARNESS_MATRIZ_HUB, default 3)
#          MATRIZ-RESUMO|tasks=<t>|arquivos=<a>|hubs=<h>
# Read-only. Conta arquivo CITADO (existente ou a criar); ignora spec/teste/doc/prds/.claude.
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HUB="${HARNESS_MATRIZ_HUB:-3}"; GLOB=""
while [ $# -gt 0 ]; do case "$1" in --hub) HUB="${2:-3}"; shift 2 ;; *) [ -z "$GLOB" ] && GLOB="$1"; shift ;; esac; done
case "$HUB" in ''|*[!0-9]*) HUB=3 ;; esac
[ -n "$GLOB" ] || { echo "uso: task-matrix.sh \"<glob das tasks>\" [--hub N]" >&2; echo "MATRIZ-RESUMO|tasks=0|arquivos=0|hubs=0"; exit 2; }
cd "$ROOT" || exit 2
TMP="$(mktemp 2>/dev/null || echo "$ROOT/.claude/.harness-run/matriz-$$.tmp")"
T=0
# shellcheck disable=SC2086
for t in $GLOB; do
  [ -f "$t" ] || continue
  T=$((T+1)); ID="$(basename "$t" .md | grep -oE '^TASK-[0-9]+[a-z]?' || basename "$t" .md)"
  grep -oE '(`|\b)[A-Za-z0-9_./-]+/[A-Za-z0-9_.-]+\.(php|js|mjs|ts|tsx|vue|py|sql|html|twig|blade\.php|css|scss)\b' "$t" \
    | tr -d '`' | grep -vE '^(https?:|prds/|\.claude/|node_modules/)' \
    | grep -vE '(^|/)(tests?|e2e|specs?|docs?|__tests__|migrations)/|\.(spec|test)\.[a-z]+$' \
    | sort -u | sed "s/$/|$ID/" >> "$TMP"
done
A=0; H=0
if [ -s "$TMP" ]; then
  OUT="$(awk -F'|' '{ n[$1]++; ids[$1]=(ids[$1]? ids[$1] "," : "") $2 } END { for (f in n) printf "%d|%s|%s\n", n[f], f, ids[f] }' "$TMP" | sort -t'|' -k1,1nr -k2,2)"
  A="$(printf '%s\n' "$OUT" | grep -c .)"
  printf '%s\n' "$OUT" | while IFS='|' read -r n f ids; do printf 'MATRIZ|%s|%s|%s\n' "$f" "$n" "$ids"; done
  printf '%s\n' "$OUT" | while IFS='|' read -r n f ids; do [ "$n" -ge "$HUB" ] && printf 'MATRIZ-HUB|%s|%s|%s\n' "$f" "$n" "$ids"; done
  H="$(printf '%s\n' "$OUT" | awk -F'|' -v h="$HUB" '$1>=h' | grep -c .)"
fi
rm -f "$TMP" 2>/dev/null
printf 'MATRIZ-RESUMO|tasks=%s|arquivos=%s|hubs=%s\n' "$T" "$A" "$H"
exit 0
