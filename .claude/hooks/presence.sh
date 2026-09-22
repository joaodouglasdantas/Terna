#!/usr/bin/env bash
# .claude/hooks/presence.sh (3.0.1)
# Modulo PRESENCA — ping de telemetria de presenca para o Caronte (o software
# central da Beta). Responde "quem esta mexendo em que, agora": a cada sessao
# (start/end), a cada prompt e a cada tool use (heartbeat THROTTLED), envia
# METADADOS — nunca conteudo — para HARNESS_PRESENCE_URL:
#
#   { evento, projeto, branch, git_email, claude_email, os_user, host, ... }
#
# O servidor (Caronte) e quem resolve identidade (email -> pessoa, interno/externo)
# — o cliente e burro de proposito: zero config por dev, a identidade ja mora na
# maquina (~/.gitconfig, ~/.claude.json, $USER@hostname).
#
# CUSTO ZERO por design:
#   - tokens: o hook NUNCA imprime nada (stdout de hook pode virar contexto) — exit 0 sempre;
#   - fluxo:  o curl roda em BACKGROUND com -m 8 (mesmo no Codex, cujos hooks sao sincronos);
#   - rede:   URL vazia = modulo dormente (no-op imediato); falha de rede = silencio NO
#             TERMINAL, mas nunca mais invisivel (3.0.1): cada tentativa deixa prova em
#             .harness-run/presence.jsonl e ping que falha vai para a fila offline
#             .harness-run/presence-queue/, reenviada no proximo evento com rede
#             (store-and-forward, TTL 30 min — presenca e dado perecivel: replay velho
#             viraria "agora" no painel, que usa o relogio do SERVIDOR).
#             Diagnostico em 1 comando: bash .claude/harness-doctor.sh --presence
#
# Eventos (argumento explicito no wiring — deterministico, sem depender do stdin):
#   --start  SessionStart                     -> envia sempre (e carimba o throttle)
#   --prompt UserPromptSubmit / PostToolUse   -> heartbeat, no maximo 1x por THROTTLE_MIN
#            (+ Stop no codex)                   POR SESSAO — o PostToolUse (sem matcher)
#                                                mantem o sinal vivo em tarefas longas sem
#                                                input humano; o throttle segura o volume
#   --end    SessionEnd (so host claude)      -> envia sempre
#
# Throttle POR SESSAO (2.16.0): o carimbo era por projeto e duas sessoes no mesmo
# repo (modo normal de trabalho) dividiam o mesmo arquivo — a primeira silenciava
# a outra por ate THROTTLE_MIN. Agora cada sessao tem seu carimbo
# (presence-last-ping-<session_id sanitizado>); sem session_id no stdin, cai no
# carimbo global antigo. Carimbos com mais de 1 dia sao podados no --start.
#
# Bypass de emergencia: export HARNESS_SKIP_PRESENCE=1 (ou HARNESS_PRESENCE_URL='').

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 3.5.7: camadas de configuracao — hooks/_env.sh carrega _defaults.env -> harness.env -> harness.env.local -> ~/.harness.env.local
# (ambiente da sessao vence). Antes cada hook tinha o proprio loop.
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_env.sh"

[ "${HARNESS_SKIP_PRESENCE:-0}" = "1" ] && exit 0

# 3.0.0 — dentro de um CLI EXTERNO (revisor da dupla-cega ou mini-task delegada
# pelo harness-delegate.sh) nao se pinga presenca: o executor herda o ambiente e
# dispararia os hooks do repo, inflando o painel do Caronte com "sessoes" que sao
# subprocessos da mesma pessoa, no mesmo projeto, no mesmo minuto.
[ "${HARNESS_IN_EXTERNAL_AGENT:-}" = "1" ] && exit 0
[ "${HARNESS_IN_EXTERNAL_REVIEW:-}" = "1" ] && exit 0

# URL: 3 estados (padrao da casa: hooks funcionam com default seguro SEM config).
#   nao definida       -> DEFAULT fixo da casa (abaixo) — e o caso dos projetos ja
#                         portados, cujo harness.env e preservado pelo sync;
#   definida vazia ('')-> modulo DESLIGADO neste repo (opt-out explicito);
#   definida com valor -> usa o valor.
DEFAULT_URL='https://caronte.app.br/api/v1/presenca/ping'
URL="${HARNESS_PRESENCE_URL-$DEFAULT_URL}"
[ -z "$URL" ] && exit 0
command -v curl >/dev/null 2>&1 || exit 0

# stdin PRECISA ser drenado (hook recebe JSON; nao ler pode quebrar o pipe do host).
INPUT="$(cat 2>/dev/null || true)"

# 3.4.14: --agent-start <tipo> / --agent-end <tipo> = o PAI anuncia o subagente (guard-agent.sh).
AGENT_ANUN=''
AGENT_ANUN_ID=''
IS_ANUN=0
case "${1:-}" in
  --start)        EVENTO='start' ;;
  --end)          EVENTO='end' ;;
  --agent-start)  EVENTO='start'; IS_ANUN=1; AGENT_ANUN="${2:-}"; AGENT_ANUN_ID="${3:-}" ;;
  --agent-end)    EVENTO='end';   IS_ANUN=1; AGENT_ANUN="${2:-}"; AGENT_ANUN_ID="${3:-}" ;;
  *)              EVENTO='heartbeat' ;;
esac
# 3.4.17: hooks SubagentStart/SubagentStop (e hooks disparados DENTRO do subagente) trazem
# agent_type + agent_id no input; argv e so fallback do anuncio pelo pai (3.4.14).
IN_AGENT_TYPE=''; IN_AGENT_ID=''
if [[ "$INPUT" =~ \"agent_type\"[[:space:]]*:[[:space:]]*\"([^\"]*)\" ]]; then IN_AGENT_TYPE="${BASH_REMATCH[1]}"; fi
if [[ "$INPUT" =~ \"agent_id\"[[:space:]]*:[[:space:]]*\"([^\"]*)\" ]]; then IN_AGENT_ID="${BASH_REMATCH[1]}"; fi
if [ "$IS_ANUN" = "1" ]; then
  [ -n "$IN_AGENT_TYPE" ] && AGENT_ANUN="$IN_AGENT_TYPE"
  [ -n "$IN_AGENT_ID" ] && AGENT_ANUN_ID="$IN_AGENT_ID"
  case "$AGENT_ANUN" in ''|general-purpose|Explore|Plan|claude) exit 0 ;; esac   # utilitarios sem papel no painel
fi

# Caminho quente (roda a CADA PostToolUse, sincrono no Codex): builtins no lugar
# de subprocessos — no Windows cada spawn custa ~50 ms.
STATE_DIR="$SCRIPT_DIR/../.harness-run"
[ -d "$STATE_DIR" ] || mkdir -p "$STATE_DIR" 2>/dev/null || true
printf -v NOW '%(%s)T' -1 2>/dev/null || NOW="$(date +%s 2>/dev/null || echo 0)"

# Prova de envio + fila offline (3.0.1). Nada disso e versionado nem vira contexto.
LOG_FILE="$STATE_DIR/presence.jsonl"
QUEUE_DIR="$STATE_DIR/presence-queue"
QUEUE_TTL_MIN="${HARNESS_PRESENCE_QUEUE_TTL_MIN:-30}"

# session_id do stdin — extraido ANTES do throttle porque o carimbo e por sessao.
# Regex nativo do bash (zero processo — este trecho roda a CADA PostToolUse);
# jq so como fallback de robustez. session_id e um UUID, sem escaping exotico.
SESSION=''
if [[ "$INPUT" =~ \"session_id\"[[:space:]]*:[[:space:]]*\"([^\"]*)\" ]]; then
  SESSION="${BASH_REMATCH[1]}"
elif command -v jq >/dev/null 2>&1; then
  SESSION="$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)"
fi
# Sanitizado (vira nome de arquivo) e truncado — tambem sem spawn.
SESSION_KEY="${SESSION//[^A-Za-z0-9.-]/}"
SESSION_KEY="${SESSION_KEY:0:64}"

# Carimbo POR SESSAO; sem session_id, carimbo global (comportamento pre-2.16.0).
# 3.4.12c: SUBAGENTE tem carimbo PROPRIO (paridade com o presence.mjs). O subagente herda o
# session_id do pai e o carimbo por sessao era renovado pelo pai a cada PostToolUse — o
# heartbeat do agente nunca furava o throttle e a deteccao DT-009 nunca rodava.
AGENT_KEY=''
TRANSCRIPT0=''
if [[ "$INPUT" =~ \"transcript_path\"[[:space:]]*:[[:space:]]*\"([^\"]*)\" ]]; then
  TRANSCRIPT0="${BASH_REMATCH[1]}"
fi
TRANSCRIPT0="${TRANSCRIPT0//\\\\//}"; TRANSCRIPT0="${TRANSCRIPT0//\\//}"
case "$TRANSCRIPT0" in
  */subagents/*)
    AGENT_KEY="${TRANSCRIPT0##*/}"; AGENT_KEY="${AGENT_KEY%.jsonl}"
    AGENT_KEY="${AGENT_KEY//[^A-Za-z0-9.-]/}"; AGENT_KEY="${AGENT_KEY:0:40}" ;;
esac
LAST_FILE="$STATE_DIR/presence-last-ping${SESSION_KEY:+-$SESSION_KEY}${AGENT_KEY:+-$AGENT_KEY}"

# 3.4.14: START ADIADO ao 1o prompt (paridade com o presence.mjs) — processo sem prompt nao vira
# cartao. --start so marca; o 1o heartbeat vira 'start'; --end sem prompt apaga a marca e sai.
PENDING_FILE="$STATE_DIR/presence-pending${SESSION_KEY:+-$SESSION_KEY}"
START_ADIADO=0
if [ -z "$AGENT_ANUN" ]; then
  if [ "$EVENTO" = "start" ]; then
    printf '%s' "$NOW" > "$PENDING_FILE" 2>/dev/null || true
    find "$STATE_DIR" -maxdepth 1 -name 'presence-pending-*' -mmin +1440 -delete 2>/dev/null || true
    START_ADIADO=1
  elif [ -f "$PENDING_FILE" ]; then
    rm -f "$PENDING_FILE" 2>/dev/null || true
    [ "$EVENTO" = "end" ] && exit 0
    [ "$EVENTO" = "heartbeat" ] && [ -z "$AGENT_KEY" ] && EVENTO='start'
  fi
fi

# Poda dos carimbos de sessoes mortas (1x por sessao, no --start; best-effort).
if [ "$EVENTO" = "start" ]; then
  find "$STATE_DIR" -maxdepth 1 -name 'presence-last-ping-*' -mmin +1440 -delete 2>/dev/null || true

  # 3.0.1 — higiene do log e da fila, so no caminho FRIO (1x por sessao):
  # log rotacionado (>400 linhas -> mantem as 200 mais novas) e fila com TTL +
  # teto de 40 arquivos (maquina sem rede por dias nao acumula lixo).
  if [ -f "$LOG_FILE" ]; then
    L="$(wc -l < "$LOG_FILE" 2>/dev/null)"; L="${L//[^0-9]/}"
    if [ "${L:-0}" -gt 400 ]; then
      tail -n 200 "$LOG_FILE" > "$LOG_FILE.tmp" 2>/dev/null \
        && mv -f "$LOG_FILE.tmp" "$LOG_FILE" 2>/dev/null || rm -f "$LOG_FILE.tmp" 2>/dev/null
    fi
  fi
  if [ -d "$QUEUE_DIR" ]; then
    find "$QUEUE_DIR" -maxdepth 1 -name '*.json' -mmin +"$QUEUE_TTL_MIN" -delete 2>/dev/null || true
    C=0; for _f in "$QUEUE_DIR"/*.json; do [ -f "$_f" ] && C=$((C+1)); done
    if [ "$C" -gt 40 ]; then
      X=$((C - 40))
      for _f in "$QUEUE_DIR"/*.json; do   # glob em ordem lexicografica = cronologica (prefixo epoch)
        [ "$X" -le 0 ] && break
        rm -f "$_f" 2>/dev/null; X=$((X-1))
      done
    fi
  fi
fi

[ "$START_ADIADO" = 1 ] && exit 0   # housekeeping feito; envio so no 1o prompt

# Throttle do heartbeat: no maximo 1 ping a cada HARNESS_PRESENCE_THROTTLE_MIN.
# (start/end passam direto — sao 1x por sessao e sao o esqueleto do painel.)
if [ "$EVENTO" = "heartbeat" ] && [ -z "$AGENT_ANUN" ]; then
  # 3.0.1: default 15 -> 10. Contra o verde do painel (< 20 min), 15 deixava
  # margem de so 5 min — UM heartbeat perdido ja degradava o dev para amarelo.
  if [ -n "$AGENT_KEY" ]; then
    THROTTLE_MIN="${HARNESS_PRESENCE_THROTTLE_AGENT_MIN:-5}"   # 3.4.12c: agente pinga a cada 5 min (TTL do painel = 15)
  else
    THROTTLE_MIN="${HARNESS_PRESENCE_THROTTLE_MIN:-10}"
  fi
  LAST=0
  [ -f "$LAST_FILE" ] && { IFS= read -r LAST < "$LAST_FILE" || true; } 2>/dev/null
  case "$LAST" in ''|*[!0-9]*) LAST=0 ;; esac
  [ $(( NOW - LAST )) -lt $(( THROTTLE_MIN * 60 )) ] && exit 0
fi

# --- Identidade (tudo best-effort; vazio e aceitavel, o servidor decide) -----
# _clean garante UTF-8 VALIDO (27/08): no Windows o Git Bash devolve whoami/hostname na
# codepage ANSI (Windows-1252) — "Débora" vira o byte 0xE9, o JSON chega invalido no
# Caronte e o json_decode descarta o ping (dev com acento sumia do painel). Alem disso o
# cut -c corta em BYTES e podia partir um caractere multibyte no meio. Agora: bytes que
# nao sao UTF-8 sao convertidos de 1252; cauda truncada e saneada com //IGNORE; sem
# iconv na maquina, degrada para ASCII puro (nome sem acento e melhor que ping perdido).
_clean() {
  local s
  s="$(printf '%s' "$1" | tr -d '"\\' | tr -d '\r\n')"
  if command -v iconv >/dev/null 2>&1; then
    if ! printf '%s' "$s" | iconv -f UTF-8 -t UTF-8 >/dev/null 2>&1; then
      s="$(printf '%s' "$s" | iconv -f WINDOWS-1252 -t UTF-8 2>/dev/null || printf '%s' "$s" | LC_ALL=C tr -cd '\40-\176')"
    fi
    printf '%s' "$s" | cut -c1-120 | iconv -f UTF-8 -t UTF-8//IGNORE 2>/dev/null
  else
    printf '%s' "$s" | LC_ALL=C tr -cd '\40-\176' | cut -c1-120
  fi
}

GIT_EMAIL="$(_clean "$(git config user.email 2>/dev/null)")"

# E-mail do login do Claude Code (~/.claude.json -> oauthAccount.emailAddress).
# Formato INTERNO/nao documentado — por isso so grep/sed best-effort, nunca falha.
CLAUDE_EMAIL=''
if [ -f "$HOME/.claude.json" ]; then
  CLAUDE_EMAIL="$(grep -o '"emailAddress"[[:space:]]*:[[:space:]]*"[^"]*"' "$HOME/.claude.json" 2>/dev/null \
    | head -1 | sed -E 's/.*"([^"]*)"$/\1/')"
  CLAUDE_EMAIL="$(_clean "$CLAUDE_EMAIL")"
fi

OS_USER="$(_clean "$(whoami 2>/dev/null || echo '?')@$(hostname -s 2>/dev/null || hostname 2>/dev/null || echo '?')")"

# --- Contexto do repo/sessao -------------------------------------------------
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
[ -z "$ROOT" ] && ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJETO="$(_clean "$(basename "$ROOT")")"
BRANCH="$(_clean "$(git rev-parse --abbrev-ref HEAD 2>/dev/null)")"

if [ -f "$SCRIPT_DIR/_host-detect.sh" ]; then
  # shellcheck disable=SC1091
  . "$SCRIPT_DIR/_host-detect.sh"
  HOST="$(harness_detect_host)"
else
  HOST='claude'
fi

# session_id ja extraido antes do throttle; aqui so a limpeza para o payload.
SESSION="$(_clean "$SESSION")"

# --- Subagente NATIVO (DT-009, 01/09/2026) -----------------------------------
# Subagente do Claude Code (Agent tool: hefesto, dedalo, sherlock...) dispara os
# MESMOS hooks com session_id PROPRIO — sem marcacao, cada um vira um cartao de
# "sessao" no painel do Caronte (medido 01/09: 6 dos 10 cartoes eram subagentes).
# Deteccao deterministica: o transcript de subagente vive em
#   ~/.claude/projects/<slug>/<UUID-DA-SESSAO-PAI>/subagents/agent-*.jsonl
# e o nome do agente esta no .meta.json ao lado (campo agentType). O payload de
# sessao HUMANA fica byte a byte identico ao de antes (retrocompatibilidade);
# subagente ganha: "agent":1, "agent_name", "parent_session" — o servidor agrupa
# no cartao do pai ("N agentes trabalhando") em vez de duplicar cartao.
AGENT_JSON=''
TRANSCRIPT=''
if [ -n "$AGENT_ANUN" ]; then
  # 3.4.14: anuncio pelo pai — agente identificado pelo tipo, sem transcript proprio ainda
  AGENT_JSON="$(printf ',"agent":1,"agent_name":"%s","parent_session":"%s"' "$(_clean "$AGENT_ANUN")" "$SESSION")"
  AGENT_ID_OUT="$(_clean "$AGENT_ANUN_ID")"
  [ -n "$AGENT_ID_OUT" ] && AGENT_JSON="${AGENT_JSON}$(printf ',"agent_id":"%s"' "$AGENT_ID_OUT")"
elif [[ "$INPUT" =~ \"transcript_path\"[[:space:]]*:[[:space:]]*\"([^\"]*)\" ]]; then
  TRANSCRIPT="${BASH_REMATCH[1]}"
fi
TRANSCRIPT="${TRANSCRIPT//\\\\//}"; TRANSCRIPT="${TRANSCRIPT//\\//}"
case "$TRANSCRIPT" in
  */subagents/*)
    AG_PARENT="${TRANSCRIPT%/subagents/*}"; AG_PARENT="${AG_PARENT##*/}"
    AG_NAME="$IN_AGENT_TYPE"   # 3.4.17: hook dentro do subagente ja traz agent_type; meta.json e fallback
    AG_META="${TRANSCRIPT%.jsonl}.meta.json"
    if [ -z "$AG_NAME" ] && [ -f "$AG_META" ]; then
      AG_NAME="$(grep -o '"agentType"[[:space:]]*:[[:space:]]*"[^"]*"' "$AG_META" 2>/dev/null \
        | head -1 | sed -E 's/.*"([^"]*)"$/\1/')"
    fi
    AGENT_JSON="$(printf ',"agent":1,"agent_name":"%s","parent_session":"%s"' \
      "$(_clean "$AG_NAME")" "$(_clean "$AG_PARENT")")"
    # 3.4.17: id unico por despacho = sufixo do arquivo agent-<id>.jsonl (== agent_id dos hooks)
    AG_ID="$IN_AGENT_ID"
    if [ -z "$AG_ID" ]; then AG_ID="${TRANSCRIPT##*/}"; AG_ID="${AG_ID%.jsonl}"; AG_ID="${AG_ID#agent-}"; fi
    AGENT_ID_OUT="$(_clean "$AG_ID")"
    [ -n "$AGENT_ID_OUT" ] && AGENT_JSON="${AGENT_JSON}$(printf ',"agent_id":"%s"' "$AGENT_ID_OUT")"
    ;;
esac

# 3.4.14: bridge_session_id (paridade com o presence.mjs) — 1a linha do transcript da janela
# (do PAI, em subagente/anuncio), lida com `read` builtin (sem spawn, sem varrer o arquivo).
# 3.4.17: campo INFORMATIVO — medido 02/09: muda a cada reconexao do app; o receptor nao agrupa por ele.
BRIDGE_JSON=''
TRANSCRIPT_B=''
if [[ "$INPUT" =~ \"transcript_path\"[[:space:]]*:[[:space:]]*\"([^\"]*)\" ]]; then TRANSCRIPT_B="${BASH_REMATCH[1]}"; fi
TRANSCRIPT_B="${TRANSCRIPT_B//\\\\//}"; TRANSCRIPT_B="${TRANSCRIPT_B//\\//}"
case "$TRANSCRIPT_B" in */subagents/*) TRANSCRIPT_B="${TRANSCRIPT_B%/subagents/*}.jsonl" ;; esac
if [ -n "$TRANSCRIPT_B" ] && [ -f "$TRANSCRIPT_B" ]; then
  FIRST_LINE=''; { IFS= read -r FIRST_LINE < "$TRANSCRIPT_B"; } 2>/dev/null || true
  if [[ "$FIRST_LINE" == *'"bridge-session"'* ]] && [[ "$FIRST_LINE" =~ \"bridgeSessionId\"[[:space:]]*:[[:space:]]*\"([^\"]*)\" ]]; then
    BRIDGE_ID="$(_clean "${BASH_REMATCH[1]}")"; BRIDGE_ID="${BRIDGE_ID:0:80}"
    [ -n "$BRIDGE_ID" ] && BRIDGE_JSON="$(printf ',"bridge_session_id":"%s"' "$BRIDGE_ID")"
  fi
fi
AGENT_JSON="${BRIDGE_JSON}${AGENT_JSON}"
# 3.4.16: agente com `session` PROPRIA (<pai>-<agent_name>) — paridade com o presence.mjs; o receptor
# guarda 1 linha por session e um 'end' com a session do pai encerrava o cartao do pai.
# 3.4.17: <pai>-<tipo>-<8 do agent_id> — dois agentes do mesmo tipo em paralelo nao colidem mais.
SESSION_OUT="$SESSION"
if [ -n "$AGENT_JSON" ] && [[ "$AGENT_JSON" =~ \"agent_name\":\"([^\"]*)\" ]] && [ -n "${BASH_REMATCH[1]}" ]; then
  SESSION_OUT="${SESSION}-${BASH_REMATCH[1]}"
  if [[ "$AGENT_JSON" =~ \"agent_id\":\"([^\"]*)\" ]] && [ -n "${BASH_REMATCH[1]}" ]; then
    SESSION_OUT="${SESSION_OUT}-${BASH_REMATCH[1]:0:8}"
  fi
fi

PAYLOAD="$(printf '{"v":1,"evento":"%s","ts":%s,"projeto":"%s","branch":"%s","git_email":"%s","claude_email":"%s","os_user":"%s","host":"%s","session":"%s","harness":"%s"%s}' \
  "$EVENTO" "$NOW" "$PROJETO" "$BRANCH" "$GIT_EMAIL" "$CLAUDE_EMAIL" "$OS_USER" "$HOST" "$SESSION_OUT" "${HARNESS_VERSION:-?}" "$AGENT_JSON")"

# Token opcional (harness.env.local — NUNCA no harness.env versionado).
AUTH_HDR=''
[ -n "${HARNESS_PRESENCE_TOKEN:-}" ] && AUTH_HDR="X-Presence-Token: ${HARNESS_PRESENCE_TOKEN}"

# Carimba o throttle ANTES do envio (evita rajada se varios eventos chegarem juntos).
# Ping que falhar nao se perde mais (3.0.1): vai para a fila e reenvia no proximo evento.
[ -z "$AGENT_ANUN" ] && { printf '%s' "$NOW" > "$LAST_FILE" 2>/dev/null || true; }   # anuncio nao carimba

# --- Envio com prova (3.0.1) --------------------------------------------------
# Tudo em BACKGROUND com double-fork (o processo escapa da arvore do hook — o host
# pode matar a arvore no timeout de 10s e a drenagem da fila pode passar disso):
#   1. envia com teto de 8s + 1 retry (o -m 3 antigo estourava em rede de
#      escritorio com DNS frio — ping perdido + 15 min de buraco pelo throttle);
#   2. loga o resultado em .harness-run/presence.jsonl — a UNICA prova local de
#      que o ping saiu; o doctor --presence le daqui;
#   3. falha  -> payload vai para .harness-run/presence-queue/<epoch>-<pid>.json;
#   4. sucesso -> drena a fila (ate 20 pings represados, mais antigos primeiro;
#      para no 1o erro; TTL de QUEUE_TTL_MIN — replay velho viraria "agora" no
#      painel, que usa o relogio do servidor, entao presenca vencida e descartada).
TIMEOUT_S="${HARNESS_PRESENCE_TIMEOUT:-8}"

_envia() {  # $1 = payload JSON -> ecoa o http_code ('000' = sem conexao/timeout)
  # curl com -w ja imprime '000' quando nao conecta (e sai != 0) — por isso o
  # fallback e so para saida VAZIA (curl morto/ausente), senao viraria '000000'.
  local _rc
  if [ -n "$AUTH_HDR" ]; then
    _rc="$(curl -s -o /dev/null -w '%{http_code}' -m "$TIMEOUT_S" --retry 1 \
      -X POST -H 'Content-Type: application/json' -H "$AUTH_HDR" \
      --data "$1" "$URL" 2>/dev/null)"
  else
    _rc="$(curl -s -o /dev/null -w '%{http_code}' -m "$TIMEOUT_S" --retry 1 \
      -X POST -H 'Content-Type: application/json' \
      --data "$1" "$URL" 2>/dev/null)"
  fi
  printf '%s' "${_rc:-000}"
}

( (
  CODE="$(_envia "$PAYLOAD")"
  case "$CODE" in
    2*)
      printf '{"ts":%s,"evento":"%s","http":"%s","ok":1}\n' "$NOW" "$EVENTO" "$CODE" >> "$LOG_FILE" 2>/dev/null
      # Rede viva: aproveita para drenar a fila offline.
      if [ -d "$QUEUE_DIR" ]; then
        find "$QUEUE_DIR" -maxdepth 1 -name '*.json' -mmin +"$QUEUE_TTL_MIN" -delete 2>/dev/null || true
        N=0
        for _q in "$QUEUE_DIR"/*.json; do   # ordem lexicografica = cronologica (prefixo epoch)
          [ -f "$_q" ] || break
          [ "$N" -ge 20 ] && break
          RC="$(_envia "$(cat "$_q" 2>/dev/null)")"
          case "$RC" in
            2*) rm -f "$_q" 2>/dev/null; N=$((N+1)) ;;
            *)  break ;;                    # rede piscou de novo — o resto fica p/ proxima
          esac
        done
        [ "$N" -gt 0 ] && printf '{"ts":%s,"fila_drenada":%s,"ok":1}\n' "$NOW" "$N" >> "$LOG_FILE" 2>/dev/null
      fi
      ;;
    *)
      printf '{"ts":%s,"evento":"%s","http":"%s","ok":0}\n' "$NOW" "$EVENTO" "$CODE" >> "$LOG_FILE" 2>/dev/null
      mkdir -p "$QUEUE_DIR" 2>/dev/null || true
      printf '%s' "$PAYLOAD" > "$QUEUE_DIR/$NOW-$$.json" 2>/dev/null || true
      ;;
  esac
) >/dev/null 2>&1 </dev/null & ) 2>/dev/null || true

exit 0
