#!/usr/bin/env bash
# .claude/hooks/review-packet.sh (3.4.5; contrato do papel + pasta/piso no topo 3.4.25) — PACKET DO
# REVIEW: dieta de contexto do sherlock.
#
# Motivo (medido 24-27/08): tokens_total de 166-488M por exec — os REVISORES releem Perfil e
# PRD inteiros a cada ciclo, enquanto os executores ja trabalham com task-packet. O review
# dupla-cega precisa de: o DIFF, os arquivos tocados e os CONTRATOS das tasks — e nada mais.
# Este script monta esse envelope; a skill despacha o sherlock com "seu contexto inteiro
# esta aqui" (mesmo espirito do task-packet). Medicao do efeito: dashboard "por agente"
# (tokens do sherlock antes/depois da 3.4.5).
#
#   uso: review-packet.sh --label <PRD-NNN|LOTE-NNN> [--desde <ref>] [--tasks "<glob .md>"] [--out <arq>]
#     --desde HEAD (default)  -> diff do working tree (exec na arvore principal)
#     --desde main            -> diff dos commits da branch (exec em worktree wt/*)
#   saida (1 linha): PACKET-REVIEW|<arquivo da parte 1>|<n arquivos tocados>|<bytes>|<N partes>
#   3.4.19: acima de HARNESS_REVIEW_PACKET_KB o diff NAO e truncado — vira PARTES por arquivo
#     (<LABEL>.review-packet.md, -2.md, ...), cada uma com stat + contratos; um sherlock por parte.
#     Arquivos NOVOS (untracked, --desde HEAD) entram como diff de criacao.
#     --so-alvos: restringe o diff aos arquivos-alvo citados nas --tasks (review antecipado por onda).
#   3.4.25 (item 19): cada parte abre com "## 0. Contrato do papel" (.claude/contratos/CONTRATO-revisor.md;
#     HARNESS_PACKET_CONTRATO='off' tira) e informa PASTA DE RELATORIOS e PISO resolvidos do harness.env —
#     o sherlock nao le o harness.env.
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# 3.5.7: camadas de configuracao — hooks/_env.sh carrega _defaults.env -> harness.env -> harness.env.local -> ~/.harness.env.local
# (ambiente da sessao vence). Antes cada hook tinha o proprio loop.
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_env.sh"
# shellcheck disable=SC1091
[ -f "$SCRIPT_DIR/_contrato.sh" ] && . "$SCRIPT_DIR/_contrato.sh"
PISO="${HARNESS_REVIEW_SEVERITY_FLOOR:-critico}"; REPORTS="${HARNESS_CODEX_REPORTS:-codex-reviews}"
LABEL=''; DESDE='HEAD'; TASKS=''; OUT=''; SO_ALVOS=0
while [ $# -gt 0 ]; do
  case "$1" in
    --label) LABEL="${2:-}"; shift 2 ;;
    --desde) DESDE="${2:-HEAD}"; shift 2 ;;
    --tasks) TASKS="${2:-}"; shift 2 ;;
    --out)   OUT="${2:-}"; shift 2 ;;
    --so-alvos) SO_ALVOS=1; shift ;;
    *) shift ;;
  esac
done
[ -n "$LABEL" ] || { echo "uso: review-packet.sh --label <LABEL> [--desde <ref>] [--tasks <glob>]" >&2; printf 'PACKET-REVIEW|||0\n'; exit 2; }
[ -n "$OUT" ] || OUT="$ROOT/.claude/.harness-run/review/$LABEL.review-packet.md"
mkdir -p "$(dirname "$OUT")" 2>/dev/null
MAXKB="${HARNESS_REVIEW_PACKET_KB:-200}"; case "$MAXKB" in ''|*[!0-9]*) MAXKB=200 ;; esac
BUDGET=$(( MAXKB * 1024 ))

cd "$ROOT" || exit 2
# --so-alvos (3.4.19): so os arquivos citados nas tasks passadas (mesma regex do task-packet)
PATHSPEC=''
if [ "$SO_ALVOS" = "1" ] && [ -n "$TASKS" ]; then
  PATHSPEC="$(cat $TASKS 2>/dev/null | grep -oE '(`|\b)[A-Za-z0-9_./-]+/[A-Za-z0-9_.-]+\.(php|js|mjs|ts|tsx|vue|py|sql|html|twig|blade\.php|css|scss|json|yml|yaml|sh)\b' \
    | tr -d '`' | grep -vE '^(https?:|prds/|\.claude/|node_modules/)' | sort -u | tr '\n' ' ')"
fi
if [ "$DESDE" = "HEAD" ]; then
  BASE_REF="HEAD"
  # shellcheck disable=SC2086
  STAT="$(git diff HEAD --stat -- $PATHSPEC 2>/dev/null)"
  # shellcheck disable=SC2086
  NOVOS="$(git ls-files --others --exclude-standard -- $PATHSPEC 2>/dev/null | grep -E '\.(php|js|mjs|ts|tsx|vue|py|sql|html|twig|css|scss|json|yml|yaml|sh|md)$' | grep -vE '^(prds/|\.claude/|node_modules/)')"
else
  BASE_REF="$(git merge-base "$DESDE" HEAD 2>/dev/null || echo "$DESDE")"
  # shellcheck disable=SC2086
  STAT="$(git diff "$BASE_REF"..HEAD --stat -- $PATHSPEC 2>/dev/null)"
  NOVOS=''
fi
# shellcheck disable=SC2086
ARQS="$( { git diff "$BASE_REF" --name-only -- $PATHSPEC 2>/dev/null; printf '%s\n' "$NOVOS"; } | grep . | sort -u)"
N_ARQ="$(printf '%s\n' "$ARQS" | grep -c .)"

cabecalho() { # $1 = numero da parte, $2 = total
  printf '# REVIEW PACKET — %s' "$LABEL"; [ "$2" -gt 1 ] && printf ' — parte %s/%s' "$1" "$2"; printf '\n\n'
  printf '> Seu contexto de review COMPLETO esta neste arquivo: diff, arquivos tocados e os\n'
  printf '> contratos das tasks. **NAO leia a PRD inteira, o Perfil completo nem arquivos fora\n'
  printf '> do diff** — o custo disso ja foi pago por quem montou o packet. Se algo essencial\n'
  printf '> faltar para julgar um trecho, DECLARE a lacuna no relatorio (achado "nao-verificavel"),\n'
  printf '> em vez de sair cacando contexto. Regras criticas do projeto que valem no julgamento\n'
  printf '> estao resumidas nos contratos abaixo.\n'
  [ "$2" -gt 1 ] && printf '> **Packet em %s partes** (3.4.19): esta parte cobre SO os arquivos do seu DIFF abaixo; o stat\n> lista todos. Julgue apenas o que esta aqui — as outras partes tem revisor proprio.\n' "$2"
  # 3.5.3: a lista NOMINAL dos arquivos desta parte, no topo — a sessao pai copia essa lista para o
  # prompt do sherlock e o sherlock declara cobertura sobre ela. Medido 12/09 (PRD-142-b, ciclo 2):
  # a pai atribuiu arquivos as partes por suposicao, 2 grupos de correcao ficaram sem revisor e custou
  # um 4o sherlock de "lacuna" (20 min).
  if [ "$2" -gt 1 ] && [ -n "${3:-}" ]; then
    printf '> **ARQUIVOS DESTA PARTE (%s/%s) — cubra TODOS e declare no relatorio "Cobertura: N/N arquivos":**\n' "$1" "$2"
    printf '%s\n' "$3" | sed 's/^/> - `/; s/$/`/'
    printf '\n'
  fi
  printf '> **Pasta de relatorios:** `%s` · **Piso de severidade:** `%s` (so o detalhamento das Sugestoes; nunca omite achado).\n\n' "$REPORTS" "$PISO"
  # 3.4.25 (item 19): contrato mecanico do revisor no topo de cada parte
  if command -v contrato_secao >/dev/null 2>&1; then contrato_secao revisor; fi
  printf '\n## Arquivos tocados (%s)\n\n```\n%s\n```\n\n' "$DESDE" "$STAT"
  [ -n "$NOVOS" ] && printf '## Arquivos NOVOS (untracked)\n\n```\n%s\n```\n\n' "$NOVOS"
  # 3.5.7 — COSTURA (incidente PRD-144): checagem estatica no topo do packet — o sherlock julga com a lista pronta
  # (window.X lido sem publicacao, dublê em spec, route.fulfill de endpoint da PRD, marcador de pendencia em codigo).
  if [ "${HARNESS_GATE_COSTURA:-on}" != "off" ] && [ -f "$SCRIPT_DIR/costura-check.mjs" ] && command -v "${HARNESS_RAG_NODE:-node}" >/dev/null 2>&1; then
    C_BASE="none"; [ "$DESDE" != "HEAD" ] && C_BASE="${BASE_REF:-auto}"
    C_OUT="$(cd "$ROOT" && "${HARNESS_RAG_NODE:-node}" "$SCRIPT_DIR/costura-check.mjs" --codigo --base "$C_BASE" 2>/dev/null)"
    printf '## Costura (3.5.7 — checagem estatica; cada linha bloqueante e um Bloqueante seu ate prova em contrario)\n\n```\n'
    printf '%s\n' "$C_OUT" | grep -E '^COSTURA\|(window-sem-publicacao|duble-em-spec|marcador-pendencia|route-fulfill-endpoint-da-prd)\|' | head -40
    printf '%s\n' "$C_OUT" | grep -E '^COSTURA\|typeof-engole\|' | head -10
    printf '%s\n' "$C_OUT" | grep '^COSTURA-VEREDITO|'
    printf '```\n\n'
  fi
  if [ -n "$TASKS" ]; then
    printf '## Contratos das tasks (aceite e regras — julgue CONTRA isto)\n\n'
    for t in $TASKS; do
      [ -f "$t" ] || continue
      printf '### %s\n\n' "$(basename "$t")"
      # cabecalho + "O que fazer"/aceite: as primeiras ~80 linhas cobrem contrato sem inflar
      head -80 "$t"; printf '\n---\n'
    done
  fi
  printf '\n## DIFF COMPLETO\n\n'
}
diff_de() { # $1 = arquivo -> diff (ou diff de criacao para untracked)
  if [ "$DESDE" = "HEAD" ] && git ls-files --error-unmatch "$1" >/dev/null 2>&1; then git diff HEAD -- "$1"
  elif [ "$DESDE" = "HEAD" ]; then git diff --no-index -- /dev/null "$1" 2>/dev/null
  else git diff "$BASE_REF"..HEAD -- "$1"; fi
}

# 3.4.19: agrupa os diffs por arquivo em PARTES <= BUDGET (nunca trunca). Parte 1 = $OUT.
TMPD="$(mktemp -d 2>/dev/null || echo "$ROOT/.claude/.harness-run/review/tmp-$$")"; mkdir -p "$TMPD"
CAB="$TMPD/cab.md"; cabecalho 1 1 > "$CAB"; CAB_B="$(wc -c < "$CAB" | tr -d '[:space:]')"
PARTE=1; USED=0; : > "$TMPD/parte-1.diff"
printf '%s\n' "$ARQS" | while read -r a; do
  [ -n "$a" ] || continue
  diff_de "$a" > "$TMPD/um.diff" 2>/dev/null; SZ="$(wc -c < "$TMPD/um.diff" | tr -d '[:space:]')"
  [ "$SZ" -gt 0 ] || continue
  # le/atualiza estado em arquivo (subshell do while)
  if [ -f "$TMPD/estado" ]; then read -r PARTE USED < "$TMPD/estado"; else PARTE=1; USED=0; fi
  if [ "$USED" -gt 0 ] && [ $(( CAB_B + USED + SZ )) -gt "$BUDGET" ]; then PARTE=$(( PARTE + 1 )); USED=0; : > "$TMPD/parte-$PARTE.diff"; fi
  cat "$TMPD/um.diff" >> "$TMPD/parte-$PARTE.diff"; USED=$(( USED + SZ ))
  printf '%s\n' "$a" >> "$TMPD/parte-$PARTE.arqs"     # 3.5.3: quais arquivos cairam nesta parte
  printf '%s %s\n' "$PARTE" "$USED" > "$TMPD/estado"
done
TOTAL=1; [ -f "$TMPD/estado" ] && read -r TOTAL _ < "$TMPD/estado"
[ "${TOTAL:-1}" -ge 1 ] || TOTAL=1
BASE_OUT="${OUT%.md}"
n=1
PARTES_LINHAS=""
while [ "$n" -le "$TOTAL" ]; do
  DEST="$OUT"; [ "$n" -gt 1 ] && DEST="$BASE_OUT-$n.md"
  ARQS_N="$(cat "$TMPD/parte-$n.arqs" 2>/dev/null)"
  { cabecalho "$n" "$TOTAL" "$ARQS_N"; printf '```diff\n'; cat "$TMPD/parte-$n.diff" 2>/dev/null; printf '\n```\n'; } > "$DEST"
  # 3.5.3: uma linha por parte com a lista de arquivos (csv) — a pai monta o prompt de cada sherlock
  # a partir DESTA linha, nunca por suposicao de onde cada hunk caiu.
  PARTES_LINHAS="${PARTES_LINHAS}$(printf 'PACKET-REVIEW-PARTE|%s/%s|%s|%s' "$n" "$TOTAL" "$DEST" "$(printf '%s\n' "$ARQS_N" | grep . | paste -sd, -)")
"
  n=$(( n + 1 ))
done
# partes velhas de um ciclo anterior maior nao podem sobrar
n=$(( TOTAL + 1 )); while [ -f "$BASE_OUT-$n.md" ]; do rm -f "$BASE_OUT-$n.md"; n=$(( n + 1 )); done
rm -rf "$TMPD" 2>/dev/null
B="$(wc -c < "$OUT" | tr -d '[:space:]')"
printf 'PACKET-REVIEW|%s|%s|%s|%s\n' "$OUT" "$N_ARQ" "$B" "$TOTAL"
[ "$TOTAL" -gt 1 ] && printf '%s' "$PARTES_LINHAS"
