#!/usr/bin/env bash
# .claude/hooks/guard-question.sh (3.4.23, item 18) — PreToolUse AskUserQuestion, BLOQUEANTE
# em MODO AUTONOMO. Medido 04/09: 59 min de espera humana numa exec "noturna autonoma" e 27
# prompts "permission to use AskUserQuestion" em 2 dias — pergunta no meio de um run sem humano
# na tela e uma parada que ninguem atende. A instrucao ("ZERO PARADAS depois da decolagem",
# 3.3.0) nao segurou; o hook segura.
#
# REGRA: se o run esta em modo autonomo, a pergunta e NEGADA (exit 2) com a instrucao de decidir
# pelo default declarado no Passo 0.3 (defaults da decolagem) e registrar a duvida em
# "Decisoes pendentes" do Output. Fora do modo autonomo passa SEMPRE (a entrevista unica da
# decolagem e uma AskUserQuestion legitima).
#
# MODO AUTONOMO = qualquer um dos dois:
#   1. variavel de ambiente HARNESS_MODO=noturno|turbo (o noturno.sh exporta);
#   2. marcador .claude/.harness-run/modo com a 1a linha `noturno` ou `turbo` — a /prd-exec
#      --noturno, a /dt-exec --aceito, o TURBO NOTURNO da /prd e o scripts/noturno.sh escrevem
#      (`printf 'noturno\n' > .claude/.harness-run/modo`). NINGUEM precisa apagar: marcador com
#      mtime acima de HARNESS_MODO_TTL_H horas (default 12) e IGNORADO — um run esquecido ontem
#      nao cala a entrevista de hoje. Para sair do modo antes do TTL: `rm .claude/.harness-run/modo`.
#
# Telemetria: .claude/.harness-run/guard-question.jsonl (uma linha por negacao — o
# harness-metrics separa `perguntas` de `permission_prompts` a partir daqui).
# Knob: HARNESS_GUARD_QUESTION='on' (default) | 'off'. Bypass pontual: HARNESS_SKIP_GUARD_QUESTION=1.
#
# Wiring (settings.json — VIAJA com o sync): PreToolUse, matcher "AskUserQuestion" ->
#   bash .claude/hooks/guard-question.sh  (timeout 10)

set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 3.5.7: camadas de configuracao — hooks/_env.sh carrega _defaults.env -> harness.env -> harness.env.local -> ~/.harness.env.local
# (ambiente da sessao vence). Antes cada hook tinha o proprio loop.
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_env.sh"
[ "${HARNESS_GUARD_QUESTION:-on}" = "off" ] && exit 0
[ "${HARNESS_SKIP_GUARD_QUESTION:-0}" = "1" ] && exit 0

RUN_DIR="$SCRIPT_DIR/../.harness-run"
MODO="$(printf '%s' "${HARNESS_MODO:-}" | tr 'A-Z' 'a-z' | tr -d '[:space:]')"
ORIGEM="env"
if [ -z "$MODO" ]; then
  MF="$RUN_DIR/modo"
  if [ -f "$MF" ]; then
    TTL="${HARNESS_MODO_TTL_H:-12}"; case "$TTL" in ''|*[!0-9]*) TTL=12 ;; esac
    # marcador velho (> TTL h) = run de outro dia; ignora. find -mmin e POSIX (GNU e BSD).
    if [ -n "$(find "$MF" -mmin +$((TTL * 60)) 2>/dev/null)" ]; then exit 0; fi
    MODO="$(head -1 "$MF" 2>/dev/null | tr 'A-Z' 'a-z' | tr -d '\r[:space:]')"
    ORIGEM="marcador"
  fi
fi
case "$MODO" in noturno|turbo) ;; *) exit 0 ;; esac

# Telemetria (best-effort): 1a pergunta do payload, saneada — nunca falha o hook.
INPUT="$(cat 2>/dev/null || true)"
Q="$(printf '%s' "$INPUT" | grep -o '"question"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 \
  | sed -E 's/.*"question"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/' | tr -d '\\' | tr '\t' ' ' | tr -d '\n\r\000-\037' | cut -c1-160)"
mkdir -p "$RUN_DIR" 2>/dev/null || true
printf '{"ts":%s,"type":"question-denied","modo":"%s","origem":"%s","pergunta":"%s"}\n' \
  "$(date +%s 2>/dev/null || echo 0)" "$MODO" "$ORIGEM" "$Q" >> "$RUN_DIR/guard-question.jsonl" 2>/dev/null || true
# 3.5.0: incidente VERSIONADO (tipo pergunta) — quantas vezes a exec autonoma quis parar para perguntar, e o que
# shellcheck disable=SC1091
[ -f "$SCRIPT_DIR/_incidente.sh" ] && . "$SCRIPT_DIR/_incidente.sh" && harness_incidente pergunta "" "" "" "$MODO/$ORIGEM: $Q"

printf '%s\n' "[guard-question] AskUserQuestion NEGADA: este run esta em modo autonomo ($MODO, via $ORIGEM) — nao ha humano na tela para responder, e a pergunta viraria uma parada de horas (medido: 59 min numa exec noturna). Decida AGORA pelo default declarado no Passo 0.3 (defaults da decolagem: em duvida de escopo, o menor; de nome, o do glossario/Perfil; de teste, 'n/d (coberto pelo acceptance)'; de tolerancia, SEGUIR + DT) e registre a duvida e a escolha em 'Decisoes pendentes' do Output para o humano revisar de manha. So pare (Status 'Bloqueada — <motivo>') nos casos que a skill nomeia como parada obrigatoria (ABORT de safe-mode, falha nao-recuperavel, >10 bloqueantes no ciclo 1). Sair do modo autonomo de proposito: rm .claude/.harness-run/modo (ou HARNESS_GUARD_QUESTION=off)." >&2
exit 2
