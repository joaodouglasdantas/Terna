#!/usr/bin/env bash
# .claude/hooks/denied.sh
# Hook PermissionDenied (SEM matcher = todas as ferramentas — pega Bash E Agent).
# Dispara SO quando o CLASSIFICADOR do auto mode nega uma acao (negacao manual do
# humano NAO passa por aqui). Tres acoes, todas best-effort:
#
#   1. LOGA a negacao em .claude/.harness-run/permission-waits.jsonl como
#      {"type":"denied","tool":...} — a telemetria (harness-metrics.mjs) conta essas
#      linhas em classifier_denials SEM soma-las como espera humana.
#   2. Alerta local via HARNESS_NOTIFY_CMD com THROTTLE: a 1a negacao alerta na hora;
#      depois no maximo 1 alerta a cada 5 min (outage de classificador nega em rajada —
#      sem throttle viraria metralhadora de toast). Estado em
#      .claude/.harness-run/denied-last-alert.
#   3. Injeta additionalContext CURTO no modelo com o protocolo (infra vs juizo,
#      nao re-tentar em loop, parar com Status Bloqueada). NUNCA devolve retry:true —
#      re-tentar automaticamente e exatamente a espiral que queremos matar.
#
# Complementa o anti-espiral do guard-bash.sh: este hook reage a CADA negacao
# (contexto + alerta); o guard corta a REPETICAO do mesmo comando (freio).
#
# Inofensivo por design: qualquer falha = exit 0 (exit code/stderr sao ignorados
# neste evento; a unica saida util e o JSON de hookSpecificOutput no stdout).
# Bypass de emergencia: export HARNESS_SKIP_DENIED=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 3.5.7: camadas de configuracao — hooks/_env.sh carrega _defaults.env -> harness.env -> harness.env.local -> ~/.harness.env.local
# (ambiente da sessao vence). Antes cada hook tinha o proprio loop.
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_env.sh"

[ "${HARNESS_SKIP_DENIED:-0}" = "1" ] && exit 0

INPUT="$(cat 2>/dev/null || true)"

# tool_name + resumo do input (best-effort; jq preferido, fallback grep/sed)
if command -v jq >/dev/null 2>&1; then
  TOOL="$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)"
  DETAIL="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // .tool_input.description // empty' 2>/dev/null)"
else
  TOOL="$(printf '%s' "$INPUT" \
    | grep -o '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' \
    | head -1 \
    | sed -E 's/.*"tool_name"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/')"
  DETAIL="$(printf '%s' "$INPUT" \
    | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' \
    | head -1 \
    | sed -E 's/.*"command"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/')"
fi
[ -z "$TOOL" ] && TOOL="desconhecida"
# 3.4.22 (item 20.8): alem de aspas/barra, quebra de linha, tab e QUALQUER controle (< 0x20) saem —
# 16 de 83 linhas do permission-waits.jsonl estavam invalidas por comando multi-linha/tab.
SAFE_DETAIL="$(printf '%s' "$DETAIL" | tr -d '"\\' | tr '\n\r\t' '   ' | tr -d '\000-\037' | cut -c1-160)"

STATE_DIR="$SCRIPT_DIR/../.harness-run"
mkdir -p "$STATE_DIR" 2>/dev/null || true
NOW="$(date +%s 2>/dev/null || echo 0)"

# 1) log p/ telemetria (mesmo arquivo do notify.sh; type distingue na leitura)
printf '{"ts":%s,"type":"denied","tool":"%s","detail":"%s"}\n' "$NOW" "$TOOL" "$SAFE_DETAIL" \
  >> "$STATE_DIR/permission-waits.jsonl" 2>/dev/null || true
# 1a) 3.5.0: incidente VERSIONADO por dev/maquina (tipo denied — reservado desde a 3.4.23). O log local acima
#     so alimentava `classifier_denials` da run; agora cada negacao chega ao mestre com ferramenta + comando.
# shellcheck disable=SC1091
[ -f "$SCRIPT_DIR/_incidente.sh" ] && . "$SCRIPT_DIR/_incidente.sh" && harness_incidente denied "" "" "" "$TOOL: $SAFE_DETAIL"

# 1b) 3.4.23 (item 18d): contador de negacao RECORRENTE por comando NORMALIZADO — o doctor lista
#     os negados 3+ vezes em 7 dias com a regra estreita pronta e o --gen-allowlist os inclui
#     (Giovanny: 52 negacoes em 33 runs, quase sempre o mesmo comando). Chave = 1o comando util
#     (pula `cd x &&`), ate 3 tokens, parando em opcao (-x), atribuicao (=), shell-meta ou, no 3o
#     token, em caminho/arquivo: `php artisan test --filter=x` -> `php artisan test`;
#     `npx playwright test tests/e2e` -> `npx playwright test`; `php -l a.php` -> `php` (larga —
#     o doctor NAO sugere regra para 1 token so). Arquivo: .harness-run/denied-recorrentes.jsonl
if [ "$TOOL" = "Bash" ] && [ -n "$DETAIL" ]; then
  KEY="$(printf '%s' "$DETAIL" | tr '\n\r\t' '   ' | awk '
    { n = split($0, seg, /&&|;|\|/); s = "";
      for (i = 1; i <= n; i++) { t = seg[i]; gsub(/^ +| +$/, "", t); if (t != "" && t !~ /^cd /) { s = t; break } }
      if (s == "") exit;
      m = split(s, w, / +/); out = ""; k = 0;
      for (i = 1; i <= m; i++) {
        if (w[i] == "") continue;
        if (w[i] ~ /^-/ || w[i] ~ /[=<>$"`(){}]/) break;
        if (k == 2 && w[i] ~ /[\/.]/) break;
        out = (k ? out " " w[i] : w[i]); k++; if (k == 3) break }
      print out }' 2>/dev/null | tr -d '"\\' | tr -d '\000-\037' | cut -c1-120)"
  [ -n "$KEY" ] && printf '{"ts":%s,"key":"%s","cmd":"%s"}\n' "$NOW" "$KEY" "$SAFE_DETAIL" \
    >> "$STATE_DIR/denied-recorrentes.jsonl" 2>/dev/null || true
fi

# 2) alerta local com throttle (1a negacao imediata; depois max 1 a cada 5 min)
NOTIFY="${HARNESS_NOTIFY_CMD:-}"
if [ -n "$NOTIFY" ] && [ "$NOW" != "0" ]; then
  THROTTLE="$STATE_DIR/denied-last-alert"
  LAST=0
  [ -f "$THROTTLE" ] && LAST="$(cat "$THROTTLE" 2>/dev/null)"
  case "$LAST" in (*[!0-9]*|"") LAST=0 ;; esac
  if [ $(( NOW - LAST )) -ge 300 ]; then
    printf '%s' "$NOW" > "$THROTTLE" 2>/dev/null || true
    ALERT_MSG="[denied] classificador negou $TOOL — possivel indisponibilidade (auto mode). Ver /permissions > Recently denied."
    if printf '%s' "$NOTIFY" | grep -q '{message}'; then
      RUN=${NOTIFY//'{message}'/'"$1"'}
    else
      RUN="$NOTIFY"
    fi
    ( sh -c "$RUN" _ "$ALERT_MSG" >/dev/null 2>&1 & ) 2>/dev/null || true
  fi
fi

# 3) contexto imediato ao modelo (stdout JSON). Curto e DEFINITIVO — nada de
#    "aguarde e tente de novo". NUNCA emitir retry:true.
CTX="Negacao do CLASSIFICADOR de permissao (auto mode) para ${TOOL}. Se a mensagem citar 'temporarily unavailable'/'cannot determine the safety', e INFRA (classificador fora do ar), nao juizo sobre o comando: NAO re-tente em loop (max 1-2 tentativas intercaladas com trabalho read-only), prefira reformular para um comando da allowlist do projeto (permissions.allow, regras estreitas) ou operacao read-only. Persistindo, PARE a fase autonoma com Status 'Bloqueada — classificador de permissao indisponivel' e devolva o controle ao usuario (destrave: Shift+Tab, /permissions > Recently denied, harness-doctor.sh --gen-allowlist, max 2 sessoes autonomas). Negacao por JUIZO (mensagem explica o risco): nao re-tente; ajuste a abordagem. NUNCA use ScheduleWakeup para esperar o classificador."
if command -v jq >/dev/null 2>&1; then
  jq -cn --arg ctx "$CTX" \
    '{hookSpecificOutput:{hookEventName:"PermissionDenied",additionalContext:$ctx}}' 2>/dev/null || true
else
  printf '{"hookSpecificOutput":{"hookEventName":"PermissionDenied","additionalContext":"%s"}}\n' "$CTX" 2>/dev/null || true
fi

exit 0
