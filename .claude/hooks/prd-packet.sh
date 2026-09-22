#!/usr/bin/env bash
# .claude/hooks/prd-packet.sh (3.4.15; contrato do papel + piso no topo 3.4.25) — PACKET DE REVISAO DA
# CRIACAO (dieta dos gates da /prd).
# Medido 01-02/09: beholder/michelangelo reliam a pasta INTEIRA da PRD (300-425 KB: produto,
# tecnica, 10 tasks) a CADA ciclo — 18-28 min por passada, 50-66% da fase 2. O sherlock da exec
# ja tem dieta (review-packet.sh); este e o equivalente para a criacao: produto + tecnica na
# integra e as tasks por INDICE (metadados, objetivo, arquivos, testes manuais) — contrato
# detalhado, E2E, rollback e notas ficam por referencia (o gate abre a task inteira SO se um
# achado exigir).
#   3.4.25 (item 19): o packet abre com "## 0. Contrato do papel" (.claude/contratos/CONTRATO-gate.md —
#   mecanica compartilhada de beholder/michelangelo; HARNESS_PACKET_CONTRATO='off' tira a secao) e
#   traz o PISO DE SEVERIDADE resolvido (harness.env/.local) — o gate nao precisa ler o harness.env.
#   uso: bash .claude/hooks/prd-packet.sh --label PRD-NNN [--dir prds/PRD-NNN-slug]
#   saida: PACKET|<caminho>|<kb>|<kb da pasta>   (exit 0; erro => PACKET|erro|<msg>, exit 1)
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# 3.5.7: camadas de configuracao — hooks/_env.sh carrega _defaults.env -> harness.env -> harness.env.local -> ~/.harness.env.local
# (ambiente da sessao vence). Antes cada hook tinha o proprio loop.
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_env.sh"
# shellcheck disable=SC1091
[ -f "$SCRIPT_DIR/_contrato.sh" ] && . "$SCRIPT_DIR/_contrato.sh"
PISO="${HARNESS_REVIEW_SEVERITY_FLOOR:-critico}"
LABEL=""; DIR=""
while [ $# -gt 0 ]; do
  case "$1" in
    --label) LABEL="${2:-}"; shift 2 ;;
    --dir)   DIR="${2:-}"; shift 2 ;;
    *) shift ;;
  esac
done
[ -n "$LABEL" ] || { echo "PACKET|erro|--label PRD-NNN obrigatorio"; exit 1; }
if [ -z "$DIR" ]; then
  # sufixo de fatia (-b) faz parte do rotulo; a mae nao pode casar com a fatia nem vice-versa
  DIR="$(ls -d "$ROOT"/prds/"$LABEL"-*/ 2>/dev/null | grep -vE "/$LABEL-[a-z]-" | head -1)"
fi
[ -d "$DIR" ] || { echo "PACKET|erro|pasta da $LABEL nao encontrada"; exit 1; }
DIR="${DIR%/}"
OUT_DIR="$ROOT/.claude/.harness-run/review"; mkdir -p "$OUT_DIR" 2>/dev/null
OUT="$OUT_DIR/$LABEL.prd-packet.md"
PRD="$(ls "$DIR"/PRD-[0-9]*.md 2>/dev/null | grep -v TECNICA | head -1)"
TEC="$(ls "$DIR"/PRD-TECNICA*.md 2>/dev/null | head -1)"
{
  printf '# PACKET DE REVISAO — %s (harness 3.4.15)\n\n' "$LABEL"
  printf '> Gerado em %s a partir de `%s`. Produto e Tecnica na integra; tasks por INDICE\n' "$(date '+%Y-%m-%d %H:%M')" "${DIR#$ROOT/}"
  printf '> (metadados, objetivo, arquivos, testes manuais). Abra a task inteira em `tasks/` SO se um\n'
  printf '> achado exigir ver o contrato detalhado/E2E dela. Grep por tema continua valendo na pasta.\n'
  printf '> **Piso de severidade:** `%s` (controla so o DETALHAMENTO do relatorio; nunca a omissao de achado).\n\n' "$PISO"
  # 3.4.25 (item 19): contrato mecanico do gate (beholder/michelangelo) no topo
  if command -v contrato_secao >/dev/null 2>&1; then contrato_secao gate; fi
  if [ -n "$PRD" ]; then printf '\n\n---\n# [PRODUTO] %s\n\n' "$(basename "$PRD")"; cat "$PRD"; fi
  if [ -n "$TEC" ]; then printf '\n\n---\n# [TECNICA] %s\n\n' "$(basename "$TEC")"; cat "$TEC"; fi
  printf '\n\n---\n# [INDICE DAS TASKS]\n'
  N=0
  for T in "$DIR"/tasks/TASK-*.md; do
    [ -f "$T" ] || continue
    N=$((N+1))
    printf '\n## %s\n\n' "$(basename "$T")"
    # secoes incluidas: titulo/metadados/objetivo/arquivos/testes manuais; excluidas: alteracoes
    # detalhadas, checklist, E2E, rollback, notas (ficam por referencia)
    awk '
      /^# /            { print; next }
      /^## /           { sec=$0; keep = (sec ~ /Metadados|Objetivo|Arquivo|Testes de Verificacao/); if (keep) print; next }
      /^> \*\*INSTRUCOES DE USO|^> \*\*INSTRUCAO DE EXECUCAO/ { keep=0 }
      keep && !/^> / { print }
    ' "$T"
  done
  if [ "$N" -eq 0 ]; then printf '\n(tasks ainda em redacao — este packet cobre PRODUTO + TECNICA; o ciclo 2 recebe o indice)\n'; fi
  printf '\n\n---\n# [REFERENCIAS]\n- pasta: `%s`\n- tasks completas: `%s/tasks/`\n- templates: `prds/_templates/`\n' "${DIR#$ROOT/}" "${DIR#$ROOT/}"
} > "$OUT" 2>/dev/null
KB=$(( $(wc -c < "$OUT") / 1024 )); TOT=$(( $(cat "$DIR"/*.md "$DIR"/tasks/*.md 2>/dev/null | wc -c) / 1024 ))
echo "PACKET|${OUT#$ROOT/}|${KB}|${TOT}"
exit 0
