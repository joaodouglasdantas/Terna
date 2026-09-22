#!/usr/bin/env bash
# .claude/hooks/notify.sh
# Hook Notification — dispara quando o Claude Code fica AGUARDANDO O HUMANO (pedido de
# permissao pendente, ou idle esperando input). Duas acoes:
#
#   1. LOGA a espera em .claude/.harness-run/permission-waits.jsonl — a telemetria
#      (harness-metrics.sh stop) le esse log e mede a espera humana REAL da execucao
#      (wait_human_min / permission_prompts), em vez de so inferir por out_tps.
#   2. Dispara um alerta local imediato via HARNESS_NOTIFY_CMD (som/toast/webhook —
#      exemplos no harness.env), se configurado. Objetivo: execucao autonoma NUNCA
#      mais pendura em silencio (incidente real: prompt de permissao aguardou 4h15
#      com o operador longe da tela — 73% do wall-clock de uma PRD).
#
# Inofensivo por design: sem HARNESS_NOTIFY_CMD ele so loga; qualquer falha = exit 0.
# Bypass de emergencia: export HARNESS_SKIP_NOTIFY=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 3.5.7: camadas de configuracao — hooks/_env.sh carrega _defaults.env -> harness.env -> harness.env.local -> ~/.harness.env.local
# (ambiente da sessao vence). Antes cada hook tinha o proprio loop.
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_env.sh"

[ "${HARNESS_SKIP_NOTIFY:-0}" = "1" ] && exit 0

INPUT="$(cat 2>/dev/null || true)"

# message do evento (best-effort; jq preferido, fallback grep/sed)
if command -v jq >/dev/null 2>&1; then
  MSG="$(printf '%s' "$INPUT" | jq -r '.message // empty' 2>/dev/null)"
else
  MSG="$(printf '%s' "$INPUT" \
    | grep -o '"message"[[:space:]]*:[[:space:]]*"[^"]*"' \
    | head -1 \
    | sed -E 's/.*"message"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/')"
fi
[ -z "$MSG" ] && MSG="Claude Code aguardando acao humana"

# tipo da espera: permission (prompt de permissao) | idle (esperando input) |
# spiral (anti-espiral do guard-bash.sh reusando este hook p/ alerta+log) | other
TYPE="other"
if printf '%s' "$MSG" | grep -q '^\[spiral\]'; then
  TYPE="spiral"
elif printf '%s' "$MSG" | grep -qi 'permission'; then
  TYPE="permission"
elif printf '%s' "$MSG" | grep -qi 'waiting for your input\|idle'; then
  TYPE="idle"
fi

# 1) log p/ telemetria (append, 1 linha JSON por espera; nunca falha o hook)
STATE_DIR="$SCRIPT_DIR/../.harness-run"
mkdir -p "$STATE_DIR" 2>/dev/null || true
# 3.4.22 (item 20.8): mensagem multi-linha/tab quebrava o JSON da linha (o cut mantinha o \n).
SAFE_MSG="$(printf '%s' "$MSG" | tr -d '"\\' | tr '\n\r\t' '   ' | tr -d '\000-\037' | cut -c1-200)"
printf '{"ts":%s,"type":"%s","message":"%s"}\n' "$(date +%s 2>/dev/null || echo 0)" "$TYPE" "$SAFE_MSG" \
  >> "$STATE_DIR/permission-waits.jsonl" 2>/dev/null || true

# 2) alerta local (so se configurado). {message} = placeholder do texto do evento;
#    o texto e passado como argumento posicional (sem injecao).
NOTIFY="${HARNESS_NOTIFY_CMD:-}"
if [ -n "$NOTIFY" ]; then
  if printf '%s' "$NOTIFY" | grep -q '{message}'; then
    RUN=${NOTIFY//'{message}'/'"$1"'}
  else
    RUN="$NOTIFY"
  fi
  # async + best-effort: o alerta nunca atrasa nem quebra o fluxo do Claude
  ( sh -c "$RUN" _ "$MSG" >/dev/null 2>&1 & ) 2>/dev/null || true
fi

# 3) E-MAIL via Beholder (3.4.6 — melhoria #11): a espera humana mais cara medida foi
#    208 min de madrugada (PRD-129) — o log existia, ninguem foi avisado. Quando a URL e
#    o token do Beholder (servico de e-mail da casa) estao na maquina, a espera dispara
#    UM e-mail ao proprio dev (git_email — mesma identidade do presence), com throttle.
#    Opt-in POR MAQUINA: HARNESS_BEHOLDER_URL + HARNESS_BEHOLDER_TOKEN no
#    ~/.harness.env.local (chmod 600) — NUNCA no harness.env versionado.
#    Mesmo contrato que o Caronte usa: POST {url}/api/fila, software_id 1 (Beta),
#    tipo_msg email, corpo_msg JSON {destinatario, assunto, corpo}.
#    Best-effort integral: curl em background com teto, falha = silencio total.
EMAIL_MODE="${HARNESS_NOTIFY_EMAIL:-auto}"
BE_URL="${HARNESS_BEHOLDER_URL:-}"
BE_TOKEN="${HARNESS_BEHOLDER_TOKEN:-}"
if [ "$EMAIL_MODE" != "0" ] && [ -n "$BE_URL" ] && [ -n "$BE_TOKEN" ]; then
  THR_MIN="${HARNESS_NOTIFY_EMAIL_THROTTLE_MIN:-10}"
  case "$THR_MIN" in ''|*[!0-9]*) THR_MIN=10 ;; esac
  MARKER="$STATE_DIR/notify-email.last"
  NOW="$(date +%s 2>/dev/null || echo 0)"
  LAST="$(head -1 "$MARKER" 2>/dev/null)"
  case "$LAST" in ''|*[!0-9]*) LAST=0 ;; esac
  if [ $(( NOW - LAST )) -ge $(( THR_MIN * 60 )) ]; then
    PROJ_DIR="$(cd "$SCRIPT_DIR/../.." 2>/dev/null && pwd)"
    PROJ="$(basename "${PROJ_DIR:-projeto}")"
    TO="${HARNESS_NOTIFY_EMAIL_TO:-$(git -C "${PROJ_DIR:-.}" config user.email 2>/dev/null)}"
    if [ -n "$TO" ]; then
      printf '%s\n' "$NOW" > "$MARKER" 2>/dev/null || true   # antes do curl: falha nao vira spam
      BE_SID="${HARNESS_BEHOLDER_SOFTWARE_ID:-1}"
      case "$BE_SID" in ''|*[!0-9]*) BE_SID=1 ;; esac
      HOSTN="$(hostname 2>/dev/null || echo maquina)"
      AGORA="$(date '+%d/%m/%Y %H:%M' 2>/dev/null || true)"
      # SAFE_MSG ja esta sem aspas/backslashes (secao 1) — seguro para embutir nos JSONs.
      # ASCII puro no esqueleto (licao do presence 3.4.5: multibyte do Git Bash/Windows
      # invalida o JSON no receptor — o json_decode do Beholder descartaria a mensagem).
      CORPO="<p><strong>Projeto:</strong> ${PROJ} | <strong>Maquina:</strong> ${HOSTN}</p><p><strong>Tipo de espera:</strong> ${TYPE}</p><p><strong>Mensagem:</strong> ${SAFE_MSG}</p><p>Desde ${AGORA}. A sessao segue parada ate voce responder no Claude Code.</p>"
      CORPO_MSG="{\"destinatario\":\"${TO}\",\"assunto\":\"[harness] ${PROJ} aguardando voce (${TYPE})\",\"corpo\":\"$(printf '%s' "$CORPO" | sed 's/\\/\\\\/g; s/"/\\"/g')\"}"
      BODY="{\"token\":\"$(printf '%s' "$BE_TOKEN" | sed 's/\\/\\\\/g; s/"/\\"/g')\",\"software_id\":${BE_SID},\"tipo_msg\":\"email\",\"corpo_msg\":\"$(printf '%s' "$CORPO_MSG" | sed 's/\\/\\\\/g; s/"/\\"/g')\"}"
      BE_TMO="${HARNESS_NOTIFY_EMAIL_TIMEOUT:-8}"
      case "$BE_TMO" in ''|*[!0-9]*) BE_TMO=8 ;; esac
      ( curl -s -m "$BE_TMO" -X POST -H 'Content-Type: application/json' \
          --data-raw "$BODY" "${BE_URL%/}/api/fila" >/dev/null 2>&1 & ) 2>/dev/null || true
    fi
  fi
fi

exit 0
