#!/usr/bin/env bash
# .claude/hooks/prd-validacao-check.sh (3.4.30) — confere a LEITURA DE VALIDACAO da PRD (VALIDACAO.md).
#
# Por que: a PRD de produto + tecnica + tasks passa de 300 KB; o humano nao le antes de executar e
# descobre o que faltou (ou o que o modelo inventou) DEPOIS, na exec. O VALIDACAO.md (Passo 10.9 da
# /prd, TEMPLATE-VALIDACAO.md) e a leitura de 5 minutos: pedido como entrou, fluxo como ficou,
# tabela RF -> origem -> tasks, o que foi agregado (inovacao/DT/gate) e o que ficou de fora.
# Este script prova MECANICAMENTE que a leitura cobre a PRD — o resto e julgamento humano.
#
#   uso: bash .claude/hooks/prd-validacao-check.sh --label PRD-NNN [--dir prds/PRD-NNN-slug]
#   saida (exit 0): VALIDACAO|PRD-NNN|ok|rf=<n>/<n>|tasks=<n>/<n>|dts=<n>/<n>|fatias=<n>/<n>
#          (exit 1): VALIDACAO|PRD-NNN|ausente|<caminho esperado>
#                    VALIDACAO|PRD-NNN|falta|<motivo>; <motivo>; ...
#
# O que confere:
#   1. arquivo existe e tem as 6 secoes (## 1. ... ## 6.);
#   2. toda `### RF-NN` da PRD de produto tem linha `| RF-NN |` na secao 3;
#   3. toda linha da secao 3 tem ORIGEM permitida (pedido|entrevista|inovacao|DT-NNN|gate|projeto|impacto);
#   4. toda task de tasks/ (TASK-NNN[a-z]?) aparece na secao 3;
#   5. todo DT-NNN citado na PRD de produto (absorvido) aparece na secao 3 ou 4;
#   6. toda fatia existente (prds/PRD-NNN-[a-z]-*) aparece na secao 5.
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LABEL=""; DIR=""
while [ $# -gt 0 ]; do
  case "$1" in
    --label) LABEL="${2:-}"; shift 2 ;;
    --dir) DIR="${2:-}"; shift 2 ;;
    -h|--help) sed -n '1,25p' "${BASH_SOURCE[0]}" >&2; exit 0 ;;
    *) [ -z "$LABEL" ] && LABEL="$1"; shift ;;
  esac
done
LABEL="$(printf '%s' "$LABEL" | sed -E 's/-(fase[12]|exec)$//' | grep -oE 'PRD-[0-9]{3,5}(-[a-z])?\b' | head -1)"
[ -n "$LABEL" ] || { echo "uso: prd-validacao-check.sh --label PRD-NNN [--dir <pasta>]" >&2; echo "VALIDACAO||erro|rotulo ausente"; exit 2; }
if [ -z "$DIR" ]; then
  DIR="$(ls -d "$ROOT"/prds/"$LABEL"-* 2>/dev/null | grep -vE "/$LABEL-[a-z]-" | head -1)"
  [ -n "$DIR" ] || DIR="$(ls -d "$ROOT"/prds/"$LABEL" 2>/dev/null | head -1)"
fi
case "$DIR" in /*|[A-Za-z]:*) : ;; "") : ;; *) DIR="$ROOT/$DIR" ;; esac
[ -n "$DIR" ] && [ -d "$DIR" ] || { echo "VALIDACAO|$LABEL|erro|pasta da PRD nao encontrada em prds/"; exit 2; }
V="$DIR/VALIDACAO.md"
[ -s "$V" ] || { echo "VALIDACAO|$LABEL|ausente|${V#"$ROOT"/} (Passo 10.9 da /prd; modelo em prds/_templates/TEMPLATE-VALIDACAO.md)"; exit 1; }

PROD="$(ls "$DIR"/"$LABEL"-*.md 2>/dev/null | grep -vE 'TECNICA|VALIDACAO|REVIEW|PROMPT' | head -1)"
[ -n "$PROD" ] || PROD="$(ls "$DIR"/PRD-*.md 2>/dev/null | grep -vE 'TECNICA|VALIDACAO|REVIEW|PROMPT' | head -1)"
FALTAS=""
falta() { FALTAS="${FALTAS}${FALTAS:+; }$*"; }
secao() { # $1 = numero -> imprime o corpo da secao "## N." ate o proximo "## "
  awk -v n="$1" '$0 ~ ("^## " n "\\.") {on=1; next} on && /^## / {on=0} on {print}' "$V"
}

# 1) secoes
for n in 1 2 3 4 5 6; do grep -qE "^## $n\." "$V" || falta "secao $n ausente"; done
S3="$(secao 3)"; S4="$(secao 4)"; S5="$(secao 5)"

# 2) RFs da PRD de produto -> linha na secao 3
RF_T=0; RF_OK=0
if [ -n "$PROD" ]; then
  for rf in $(grep -oE '^### *RF-[0-9]+' "$PROD" | grep -oE 'RF-[0-9]+' | sort -u); do
    RF_T=$((RF_T+1))
    if printf '%s\n' "$S3" | grep -qE "^\| *$rf *\|"; then RF_OK=$((RF_OK+1)); else falta "$rf sem linha na secao 3"; fi
  done
fi

# 3) origem de cada linha da secao 3
ORIG='(pedido|entrevista|inova[cç][aã]o|DT-[0-9]{2,4}|gate|projeto|impacto)'
printf '%s\n' "$S3" | grep -E '^\| *RF-[0-9]+ *\|' | while IFS= read -r ln; do
  rf="$(printf '%s' "$ln" | grep -oE 'RF-[0-9]+' | head -1)"
  orig="$(printf '%s' "$ln" | awk -F'|' '{print $4}' | tr -d ' `*')"
  [ -n "$orig" ] || { echo "ORIGEM-VAZIA|$rf"; continue; }
  printf '%s' "$orig" | tr ',+·;' '\n\n\n\n' | grep -v '^$' | grep -viE "^${ORIG}$" | head -1 | grep -q . && echo "ORIGEM-INVALIDA|$rf|$orig"
done > "$V.chk.tmp" 2>/dev/null
while IFS='|' read -r k rf o; do
  case "$k" in
    ORIGEM-VAZIA) falta "$rf sem origem" ;;
    ORIGEM-INVALIDA) falta "$rf origem '$o' fora de pedido|entrevista|inovacao|DT-NNN|gate|projeto|impacto" ;;
  esac
done < "$V.chk.tmp"; rm -f "$V.chk.tmp"

# 4) tasks de tasks/ -> citadas na secao 3
TK_T=0; TK_OK=0
for t in "$DIR"/tasks/TASK-*.md; do
  [ -f "$t" ] || continue
  id="$(basename "$t" .md | grep -oE '^TASK-[0-9]+[a-z]?')"; [ -n "$id" ] || continue
  TK_T=$((TK_T+1))
  if printf '%s\n' "$S3" | grep -qE "\b$id\b"; then TK_OK=$((TK_OK+1)); else falta "$id nao aparece na secao 3"; fi
done

# 5) DTs citados na PRD de produto (absorvidos) -> secao 3 ou 4
DT_T=0; DT_OK=0
if [ -n "$PROD" ]; then
  # so DT ABSORVIDO conta: citado na secao de Requisitos Funcionais ou em linha 'Expande'/'absorv' — a PRD cita
  # DTs de referencia em outros lugares (Documentos Relacionados, precedentes) e esses nao sao promessa desta PRD.
  DTS_ABS="$({ awk '/^## +Requisitos Funcionais/{on=1; next} on && /^## /{on=0} on' "$PROD"; grep -iE 'Expande|absorv' "$PROD"; } | grep -oE '\bDT-[0-9]{2,4}\b' | sort -u)"
  for dt in $DTS_ABS; do
    DT_T=$((DT_T+1))
    if printf '%s\n%s\n' "$S3" "$S4" | grep -qE "\b$dt\b"; then DT_OK=$((DT_OK+1)); else falta "$dt citado na PRD e ausente das secoes 3/4"; fi
  done
fi

# 7) 3.4.34: teto de tasks da PRD (HARNESS_PRD_MAX_TASKS, 9) — acima, a criacao FATIA antes do aceite
MAXT="${HARNESS_PRD_MAX_TASKS:-9}"; case "$MAXT" in ''|*[!0-9]*) MAXT=9 ;; esac
[ "$TK_T" -gt "$MAXT" ] && falta "$TK_T tasks > teto $MAXT (HARNESS_PRD_MAX_TASKS): fatiar em PRD-NNN-b antes do aceite (medido PRD-141: 13 tasks = 6 h de exec)"
# 8) 3.4.34: contrato de API na tecnica quando alguma task toca endpoint (api/) — com consumidores nomeados
TEC="$(ls "$DIR"/PRD-TECNICA-*.md 2>/dev/null | head -1)"
if [ -n "$TEC" ] && grep -qsE '`([^`]*/)?api/[^`]*\.(php|js|ts|py)`' "$DIR"/tasks/TASK-*.md 2>/dev/null; then
  if ! grep -qE '^## +Contrato de API' "$TEC" || ! grep -qE '^### +Endpoint' "$TEC"; then
    falta "tecnica sem '## Contrato de API' com '### Endpoint' (tasks tocam api/): nomes de chave JSON sao contrato (PRD-141: pendentes x pendencias)"
  elif ! grep -qiE 'Consumidores \(ARQUIVOS\)' "$TEC"; then
    falta "Contrato de API sem a linha 'Consumidores (ARQUIVOS)' (quem le cada resposta, arquivo por arquivo)"
  fi
fi

# 6) fatias existentes -> secao 5
FT_T=0; FT_OK=0
BASE="$(printf '%s' "$LABEL" | sed -E 's/-[a-z]$//')"
for d in "$ROOT"/prds/"$BASE"-[a-z]-*; do
  [ -d "$d" ] || continue
  f="$(basename "$d" | grep -oE "^$BASE-[a-z]")"; [ -n "$f" ] || continue
  [ "$f" = "$LABEL" ] && continue
  FT_T=$((FT_T+1))
  if printf '%s\n' "$S5" | grep -qE "\b$f\b"; then FT_OK=$((FT_OK+1)); else falta "fatia $f existe e nao esta na secao 5"; fi
done

if [ -n "$FALTAS" ]; then
  echo "VALIDACAO|$LABEL|falta|$FALTAS"; exit 1
fi
echo "VALIDACAO|$LABEL|ok|rf=$RF_OK/$RF_T|tasks=$TK_OK/$TK_T|dts=$DT_OK/$DT_T|fatias=$FT_OK/$FT_T"
exit 0
