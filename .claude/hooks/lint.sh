#!/usr/bin/env bash
# .claude/hooks/lint.sh
# Hook PostToolUse — lint de SINTAXE bloqueante para Write/Edit (stack-agnostico).
#
# Configuracao em .claude/harness.env:
#   HARNESS_LINT_CMD        — comando de checagem de sintaxe. Use {file} como placeholder
#                             (se ausente, o caminho e anexado). VAZIO = hook desligado.
#   HARNESS_LINT_EXT        — extensoes a verificar (csv, sem ponto). VAZIO = desligado.
#   HARNESS_LINT_CMD_EXTRA  — (opcional) analise estatica adicional NAO-BLOQUEANTE
#                             (ex: phpstan, eslint). Roda apos a sintaxe passar; falha
#                             vira aviso (additionalContext) para o Claude, nunca exit 2.
# Bypass de emergencia: export HARNESS_SKIP_LINT=1
#
# Comportamento:
#   - exit 0  => arquivo ok, fora de escopo, ou hook desligado (nao bloqueia)
#   - exit 2  => erro de SINTAXE (bloqueia o Write/Edit, devolve output ao Claude)
#   - binario do lint ausente (rc 127) => warning amigavel, exit 0 (nao bloqueia colega)
#   - lint EXTRA falhou => aviso nao-bloqueante (exit 0)

# 1) Carrega as camadas de configuracao (3.5.7 — hooks/_env.sh: _defaults.env -> harness.env -> harness.env.local ->
#    ~/.harness.env.local; ambiente vence). O override por maquina (2.8.0, caso caronte dual Mac/Windows) continua
#    valendo: HARNESS_LINT_CMD no harness.env.local aponta o binario desta plataforma.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_env.sh"

# 2) Bypass total.
if [ "${HARNESS_SKIP_LINT:-0}" = "1" ]; then
  exit 0
fi

# 3) Hook desligado se nao configurado.
LINT_CMD="${HARNESS_LINT_CMD:-}"
LINT_EXT="${HARNESS_LINT_EXT:-}"
if [ -z "$LINT_CMD" ] || [ -z "$LINT_EXT" ]; then
  exit 0
fi

# 4) Le JSON do evento via stdin.
INPUT="$(cat)"

# 5) Extrai file_path. Tenta jq (robusto), com fallback grep/sed.
if command -v jq >/dev/null 2>&1; then
  FILE_PATH="$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)"
else
  FILE_PATH="$(printf '%s' "$INPUT" \
    | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' \
    | head -1 \
    | sed -E 's/.*"file_path"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/')"
fi

# 6) Sem caminho — nada a fazer.
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# 7) Filtra extensao (case-insensitive) contra a lista csv de HARNESS_LINT_EXT.
LOWER_PATH="$(printf '%s' "$FILE_PATH" | tr '[:upper:]' '[:lower:]')"
FILE_EXT="${LOWER_PATH##*.}"
MATCH=0
IFS=','
for ext in $LINT_EXT; do
  ext="$(printf '%s' "$ext" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:].')"
  [ -n "$ext" ] && [ "$FILE_EXT" = "$ext" ] && MATCH=1
done
unset IFS
if [ "$MATCH" -ne 1 ]; then
  exit 0
fi

# 8) Monta o comando. {file} vira "$1" (passado como argumento — sem injecao).
if printf '%s' "$LINT_CMD" | grep -q '{file}'; then
  RUN=${LINT_CMD//'{file}'/'"$1"'}
else
  RUN="$LINT_CMD \"\$1\""
fi

# 8.1) Resolve o BINARIO do lint (1o token do comando) e checa existencia ANTES de rodar.
# 3.0.2 (fix nascido no newportaltefnet, 12/08/2026): no Windows/Laragon o `php.exe -l`
# sai com rc 127 TAMBEM em erro de sintaxe (nao so 255 como no Unix). Como o passo 10
# antigo tratava 127 como "binario ausente => exit 0", o lint de PHP NUNCA bloqueou nada
# nesta plataforma — mesmo com o caminho do binario correto. Distinguir pelo rc e
# impossivel; a existencia do binario e o unico sinal confiavel. Se o binario EXISTE,
# qualquer rc != 0 e falha de lint (bloqueia).
LINT_BIN="$(printf '%s' "$LINT_CMD" | awk '{print $1}' | tr -d '"'"'"'')"
LINT_BIN_OK=0
if [ -x "$LINT_BIN" ] || command -v "$LINT_BIN" >/dev/null 2>&1; then
  LINT_BIN_OK=1
fi

# 10) Binario ausente — nao bloquear colaborador (agora decidido ANTES de executar).
if [ "$LINT_BIN_OK" -ne 1 ]; then
  echo "[lint hook] Comando de lint nao encontrado: '$LINT_CMD'." >&2
  echo "[lint hook] Ajuste HARNESS_LINT_CMD em .claude/harness.env ou HARNESS_SKIP_LINT=1 para silenciar." >&2
  exit 0
fi

# 9) Executa via sh -c, passando o caminho como argumento posicional.
LINT_OUT="$(sh -c "$RUN" _ "$FILE_PATH" 2>&1)"
LINT_RC=$?

# 11) Sintaxe ok — roda o lint EXTRA (nao-bloqueante), se configurado.
if [ "$LINT_RC" -eq 0 ]; then
  EXTRA_CMD="${HARNESS_LINT_CMD_EXTRA:-}"
  if [ -n "$EXTRA_CMD" ]; then
    if printf '%s' "$EXTRA_CMD" | grep -q '{file}'; then
      RUN_EXTRA=${EXTRA_CMD//'{file}'/'"$1"'}
    else
      RUN_EXTRA="$EXTRA_CMD \"\$1\""
    fi
    EXTRA_OUT="$(sh -c "$RUN_EXTRA" _ "$FILE_PATH" 2>&1)"
    EXTRA_RC=$?
    # 127 = binario ausente: silencio (extra e opcional). Falha real: aviso nao-bloqueante.
    if [ "$EXTRA_RC" -ne 0 ] && [ "$EXTRA_RC" -ne 127 ]; then
      MSG="[lint-extra] Analise estatica apontou problemas em $FILE_PATH (NAO-bloqueante):
$EXTRA_OUT"
      if command -v jq >/dev/null 2>&1; then
        # additionalContext: o aviso chega ao Claude sem bloquear o Write/Edit.
        printf '%s' "$MSG" | jq -Rs '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:.}}'
      else
        echo "$MSG" >&2
      fi
    fi
  fi
  exit 0
fi

# 12) Erro de sintaxe — bloqueia.
echo "[lint hook] Erro de sintaxe em $FILE_PATH:" >&2
echo "$LINT_OUT" >&2
exit 2
