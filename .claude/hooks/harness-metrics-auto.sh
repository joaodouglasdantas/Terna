#!/usr/bin/env bash
# .claude/hooks/harness-metrics-auto.sh — UserPromptSubmit, NUNCA bloqueia.
# Enforcement item 1 (24/08/2026): o 'start' da telemetria era instrucao ("best-effort")
# e a exec da PRD-127 esqueceu — run inteira sem duracao/tokens. Agora o cronometro liga
# SOZINHO quando o prompt invoca /prd-exec ou /dt-exec (regra da casa: instrucao nao
# segura, hook segura; e menos digitacao, ativo por padrao).
#   /prd-exec NNN -> state PRD-NNN-exec (mesmo label que o stop do fechamento usa)
#   /dt-exec ...  -> state _auto-dt-exec (o lote ainda nao tem numero na invocacao;
#                    o stop LOTE-NNN cai no fallback _auto-* do harness-metrics.sh)
# 3.4.23: reinvocacao com marcador do MESMO label ja presente NAO sobrescreve (mantem o inicio
# real); prompt sem numero de PRD e recusado com aviso. Desligar: HARNESS_METRICS_AUTO=0.
# 3.5.4: (a) a SKILL e lida primeiro pelo cabecalho do prompt (<command-name>/dt-exec ou "Base directory for this
#   skill: .../skills/dt-exec" — forma do Claude Code Desktop), antes do casamento solto por regex — o corpo expandido
#   de uma skill cita outras (/dt-exec fala de /prd-exec) e o casamento solto pegava a errada; (b) marcador VELHO
#   (>= HARNESS_METRICS_STALE_H h, default 24) e de outra sessao: substituido, nao herdado (medido 14/09, sagittarius:
#   _auto-dt-exec de 5,6 dias virou uma run de 8.134 min); (c) toda decisao vai para .harness-run/metrics-auto.log
#   (medido 14/09, main: a /dt-exec do DT-592 ficou sem marcador e ninguem sabe se o hook rodou).
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 3.5.7: camadas de configuracao — hooks/_env.sh carrega _defaults.env -> harness.env -> harness.env.local -> ~/.harness.env.local
# (ambiente da sessao vence). Antes cada hook tinha o proprio loop.
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_env.sh"
[ "${HARNESS_METRICS_AUTO:-1}" = "1" ] || exit 0
RUN_DIR="$SCRIPT_DIR/../.harness-run"
LOGF="$RUN_DIR/metrics-auto.log"
alog() { mkdir -p "$RUN_DIR" 2>/dev/null; printf '%s|%s|%s\n' "$(date -Iseconds 2>/dev/null || date)" "$1" "$(printf '%s' "${2:-}" | tr '\n\r' '  ' | cut -c1-120)" >> "$LOGF" 2>/dev/null || true; }
# 3.5.5 (C2): modo --skill (PreToolUse, matcher "Skill") — a forma INEQUIVOCA no Claude Code Desktop: o usuario digita texto
# livre, o ASSISTENTE invoca a skill pela ferramenta Skill e o prompt nao traz <command-name>. Medido 15/09 (PRD-141-b): o
# prompt "criar a PRD com /prd PRD-141-b ... a execucao com /prd-exec fica para quando eu aprovar" ligou PRD-141-b-exec
# numa CRIACAO (a regex solta testava prd-exec antes de prd). Aqui o payload da ferramenta vira um prompt com cabecalho.
FROM_SKILL=0; [ "${1:-}" = "--skill" ] && FROM_SKILL=1
INPUT="$(cat 2>/dev/null)"; [ -n "$INPUT" ] || exit 0
if command -v jq >/dev/null 2>&1; then
  PROMPT="$(printf '%s' "$INPUT" | jq -r '.prompt // empty' 2>/dev/null)"
fi
# jq ausente, JSON inesperado ou campo vazio: casa no INPUT bruto (o match e conservador)
[ -n "${PROMPT:-}" ] || PROMPT="$INPUT"
# grep casa por LINHA e a forma <command-name>/prd-exec</command-name>\n<command-args>NNN
# quebra o numero para outra linha — achata antes de casar.
PROMPT="$(printf '%s' "$PROMPT" | tr '\n\r' '  ')"
SK=""
if [ "$FROM_SKILL" = "1" ]; then
  SKARGS=""
  if command -v jq >/dev/null 2>&1; then
    SK="$(printf '%s' "$INPUT" | jq -r '.tool_input.skill // empty' 2>/dev/null)"
    SKARGS="$(printf '%s' "$INPUT" | jq -r '.tool_input.args // empty' 2>/dev/null)"
  fi
  [ -n "$SK" ] || SK="$(printf '%s' "$INPUT" | grep -o '"skill"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*:[[:space:]]*"([^"]*)"/\1/')"
  [ -n "$SKARGS" ] || SKARGS="$(printf '%s' "$INPUT" | grep -o '"args"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*:[[:space:]]*"([^"]*)"/\1/')"
  [ -n "$SK" ] || exit 0
  SK="$(printf '%s' "$SK" | sed -E 's#^.*[:/]##' | tr '[:upper:]' '[:lower:]')"   # "plugin:prd-exec" / "/prd" -> prd-exec / prd
  PROMPT="<command-name>/$SK</command-name> <command-args>$(printf '%s' "$SKARGS" | tr '\n\r' '  ')</command-args>"
fi

# 3.5.4: qual SKILL o prompt invoca — pelo cabecalho (Desktop/CLI), antes de qualquer regex solta.
KIND="$(printf '%s' "$PROMPT" | grep -oiE '(<command-name>[[:space:]]*/?|Base directory for this skill:[^<]{0,240}[\\/]skills[\\/])(prd-exec|dt-exec|prd)([^a-z0-9-]|$)' | head -1 | sed -E 's/[^a-z0-9-]$//' | grep -oiE '(prd-exec|dt-exec|prd)$' | tr '[:upper:]' '[:lower:]')"   # ([^a-z0-9-]|$): /prd-status e /prd-x nao sao /prd
if [ -z "$KIND" ]; then
  # 3.5.5 (C2): no casamento solto vence a skill citada PRIMEIRO no prompt (posicao), nao uma prioridade fixa
  # prd-exec > dt-exec > prd — "criar com /prd X ... a exec com /prd-exec fica para depois" e criacao.
  _off() { printf '%s' "$PROMPT" | grep -boiE "$1" 2>/dev/null | head -1 | cut -d: -f1; }
  _BEST=""
  for _par in "prd-exec:$(_off '(^|[^a-z-])/?prd-exec')" "dt-exec:$(_off '(^|[^a-z-])/?dt-exec')" "prd:$(_off '(^|[^a-z-])/prd([^a-z-]|$)')"; do
    _k="${_par%%:*}"; _o="${_par#*:}"
    [ -n "$_o" ] || continue
    if [ -z "$_BEST" ] || [ "$_o" -lt "$_BEST" ] 2>/dev/null; then _BEST="$_o"; KIND="$_k"; fi
  done
fi

LABEL=""
case "$KIND" in
  prd-exec)
  # numero da PRD: primeiro numero apos a ultima mencao a prd-exec (cobre "/prd-exec 126"
  # e a forma <command-name>/prd-exec</command-name><command-args>126</command-args>)
  # 3.4.19: primeiro a forma ESTRITA (numero logo apos /prd-exec, com ou sem "PRD-"; ou o
  # <command-args> do slash command). Prompt combinado ("Rode as migrations 0014... /prd-exec
  # PRD-012") fazia a forma frouxa pegar outro numero: PRD-4610-exec.json e duracao 0 (Caronte, 02/09).
  N="$(printf '%s' "$PROMPT" | grep -oiE '/?prd-exec[[:space:]]+(PRD-)?0*[0-9]{1,5}' | head -1 | grep -oE '[0-9]+$')"
  [ -n "$N" ] || N="$(printf '%s' "$PROMPT" | grep -oiE '<command-args>[[:space:]]*(PRD-)?0*[0-9]{1,5}' | head -1 | grep -oE '[0-9]+$')"
  [ -n "$N" ] || N="$(printf '%s' "$PROMPT" | grep -oiE 'prd-exec[^0-9]{0,60}[0-9]{1,5}' | grep -oE '[0-9]+' | tail -1)"
  # 3.4.19: "012" com zero a esquerda e OCTAL para o printf %03d do bash (012 -> 10): "/prd-exec PRD-012"
  # virava PRD-010-exec.json e o stop da PRD-012 nao achava o marcador (Caronte, 02/09).
  N="$(printf '%s' "$N" | sed 's/^0*//')"
  # 3.4.23 (item 15d): "/prd-exec" sem numero (ou "PRD-000") NAO liga cronometro nenhum — a linha
  # "PRD-000-exec" e "PRD--exec" apareceram no painel (newportaltefnet, 04/09) e contaminam a mediana.
  if [ -z "$N" ]; then
    alog sem-numero "$PROMPT"
    echo "[metrics-auto] rotulo SEM NUMERO no prompt (/prd-exec sem PRD-NNN): cronometro NAO ligado. Ligue na mao com o rotulo certo: bash .claude/hooks/harness-metrics.sh start PRD-NNN-exec"
    exit 0
  fi
  # 3.4.11: fatia ("/prd-exec 134-b", "PRD-134-b") mantem o sufixo no rotulo — o stop da skill usa
  # PRD-134-b-exec e, sem isso, nao achava o state (duracao 0 na telemetria).
  SUF="$(printf '%s' "$PROMPT" | grep -oiE "(prd-exec[^0-9]{0,60}|PRD-)0*${N:-x}-[a-z]\b" | grep -oE '\-[a-z]$' | tail -1)"
  LABEL="PRD-$(printf '%03d' "$N")${SUF}-exec" ;;
  dt-exec)
  LABEL="_auto-dt-exec" ;;
  prd)
  # 3.4.29: CRIACAO (/prd, /prd --ideia N). A PRD ainda nao tem numero na invocacao — liga como
  # _auto-prd-fase1; o `start PRD-NNN-fase1` da skill (Passo 1) ADOTA este inicio e o stop do Passo
  # 6.2 herda o marcador se o start foi esquecido. Medido 09/09 (PRD-140): a sessao rodou o baseline
  # e pulou o start — Fase 1 inteira (discovery de 6 agentes, maquete) sem duracao no historico.
  LABEL="_auto-prd-fase1" ;;
esac
if [ -z "$LABEL" ]; then
  # 3.5.4: prompt de slash command que NAO casou (outra skill) fica no log — e a prova de que o hook rodou.
  case "$PROMPT" in *command-name*|*"Base directory for this skill"*) alog nao-e-exec "$PROMPT" ;; esac
  exit 0
fi

# 3.4.23 (item 15d): marcador do MESMO rotulo ja existe => NAO sobrescreve (o epoch antigo e o
# inicio real; reinvocar o prompt no meio da exec zerava a duracao e a run era gravada 2x —
# Caronte PRD-013-fase2, newportaltefnet PRD-114-b-fase2 3x). HARNESS_METRICS_AUTO_REUSA=0 volta
# ao comportamento antigo (sobrescrever).
STATE_F="$RUN_DIR/$(printf '%s' "$LABEL" | tr -c 'A-Za-z0-9._-' '_').json"
if [ "$FROM_SKILL" = "1" ]; then
  # 3.5.5 (C2): o hook do PROMPT (regex solta) pode ter ligado o marcador ERRADO segundos antes; a Skill invocada e a
  # verdade. Marcador de OUTRO tipo, ligado pelo prompt (origem auto-prompt) ha menos de 15 min, e removido.
  NOWE0="$(date +%s 2>/dev/null || echo 0)"
  for _m in "$RUN_DIR"/*-exec.json "$RUN_DIR"/_auto-prd-fase1.json "$RUN_DIR"/_auto-dt-exec.json; do
    [ -s "$_m" ] || continue
    [ "$(basename "$_m")" = "$(basename "$STATE_F")" ] && continue
    grep -q '"origem":"auto-prompt"' "$_m" 2>/dev/null || continue
    _s="$(grep -o '"start":[0-9]*' "$_m" 2>/dev/null | grep -o '[0-9]*' | head -n1)"
    [ -n "$_s" ] && [ $(( NOWE0 - _s )) -le 900 ] 2>/dev/null || continue
    rm -f "$_m" 2>/dev/null && alog corrigiu-prompt "$(basename "$_m" .json) -> $LABEL"
    echo "[metrics-auto] marcador $(basename "$_m" .json) (ligado pelo prompt por engano) removido — a skill invocada e /$SK ($LABEL)."
  done
fi
if [ "${HARNESS_METRICS_AUTO_REUSA:-1}" = "1" ] && [ -s "$STATE_F" ]; then
  S0="$(grep -o '"start":[0-9]*' "$STATE_F" 2>/dev/null | grep -o '[0-9]*' | head -n1)"
  # 3.5.4: marcador VELHO e de outra sessao — substitui em vez de herdar (o stop tambem recusa marcador velho).
  STALE_H="${HARNESS_METRICS_STALE_H:-24}"; case "$STALE_H" in ''|*[!0-9]*) STALE_H=24 ;; esac
  NOWE="$(date +%s 2>/dev/null || echo 0)"
  if [ -n "$S0" ] && [ "$NOWE" -gt 0 ] && [ $(( (NOWE - S0) / 3600 )) -ge "$STALE_H" ] 2>/dev/null; then
    rm -f "$STATE_F" 2>/dev/null || true
    alog substituiu-velho "$LABEL start=$S0 idade=$(( (NOWE - S0) / 3600 ))h"
    echo "[metrics-auto] marcador de $LABEL tinha $(( (NOWE - S0) / 3600 ))h (esquecido por outra sessao) — substituido pelo inicio de agora."
  else
    alog mantido "$LABEL start=${S0:-?}"
    echo "[metrics-auto] cronometro da telemetria JA LIGADO para $LABEL (inicio ${S0:-?}) — mantido, nao sobrescrevi. O stop do fechamento continua obrigatorio."
    exit 0
  fi
fi

_ORIG="auto-prompt"; [ "$FROM_SKILL" = "1" ] && _ORIG="auto-skill"   # 3.5.5: o marcador diz quem o ligou
if ! bash "$SCRIPT_DIR/harness-metrics.sh" start "$LABEL" "--origem=$_ORIG" >/dev/null 2>&1; then
  alog start-falhou "$LABEL"
  exit 0
fi
alog ligado "$LABEL"
# stdout do UserPromptSubmit entra como contexto: a sessao fica sabendo que o start ja foi.
echo "[metrics-auto] cronometro da telemetria LIGADO ($LABEL). O stop do fechamento continua obrigatorio: bash .claude/hooks/harness-metrics.sh stop <label> --tasks=... --ciclos=... --subagents=..."
exit 0
