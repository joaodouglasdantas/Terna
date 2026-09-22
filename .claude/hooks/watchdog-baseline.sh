#!/usr/bin/env bash
# .claude/hooks/watchdog-baseline.sh (3.4.7) — teto de folego POR PAPEL, derivado do p90 local.
# Motivo (medido 25/08): LOTE-028 gastou 5h37 e 817k tokens para 1 task — um subagente que
# espirala so e descoberto quando termina. Este helper da a regua; quem age e:
#   (a) o mandato de PARCIAL no contrato do hefesto/dedalo (o agente para sozinho por contagem
#       de acoes — modelo nao tem relogio, mas sabe contar chamadas de ferramenta);
#   (b) o guard-agent --post (PostToolUse Agent), que compara a duracao REAL do agente
#       terminado com este teto e avisa a sessao (additionalContext) para replanejar.
#
# Fonte do p90: o ultimo prds/_metrics/harness-dashboard-*.json do projeto (secao porAgente,
# gerada pelo /harness-report). Sem dashboard ou sem node: defaults conservadores da casa.
# teto = HARNESS_WATCHDOG_FATOR x p90 (default 2), nunca abaixo de 600s.
#
#   uso: watchdog-baseline.sh [papel]     -> "PAPEL|p90_s|teto_s" (uma linha por papel)
#        watchdog-baseline.sh --teto papel -> so o teto em segundos (para scripts)
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# 3.5.7: camadas de configuracao — hooks/_env.sh carrega _defaults.env -> harness.env -> harness.env.local -> ~/.harness.env.local
# (ambiente da sessao vence). Antes cada hook tinha o proprio loop.
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_env.sh"
FATOR="${HARNESS_WATCHDOG_FATOR:-2}"; case "$FATOR" in ''|*[!0-9]*) FATOR=2 ;; esac

SO_TETO=0; PAPEL=""
if [ "${1:-}" = "--teto" ]; then SO_TETO=1; PAPEL="${2:-}"; else PAPEL="${1:-}"; fi

# Defaults conservadores (segundos de p90) — usados quando nao ha medicao local do papel.
# Referencia: dashboard 20-24/08 do core (hefesto p90 1569s, dedalo 2340s, sherlock 1281s,
# beholder 913s, michelangelo 1070s) com folga para projeto mais lento.
default_p90() { # $1 = papel
  case "$1" in
    hefesto)      printf '1800\n' ;;
    dedalo)       printf '2400\n' ;;
    sherlock)     printf '1500\n' ;;
    beholder)     printf '1200\n' ;;
    michelangelo) printf '1300\n' ;;
    ariadne)      printf '1200\n' ;;
    hermes)       printf '1200\n' ;;
    atlas|tony-stark|peter-quill|discovery*) printf '900\n' ;;
    *)            printf '1800\n' ;;
  esac
}

# p90 medido (best-effort; qualquer falha => vazio). 3.4.22 (item 8): PRIMEIRO as linhas por task
# gravadas no SubagentStop (prds/_metrics/tasks/*.jsonl, ultimos 30 dias, >= 5 amostras do papel —
# task-telemetry.mjs --p90); so depois o dashboard mais recente (fonte da 3.4.7).
medido_p90() { # $1 = papel -> segundos inteiros ou vazio
  local J T
  if [ -f "$SCRIPT_DIR/task-telemetry.mjs" ] && command -v "${HARNESS_RAG_NODE:-node}" >/dev/null 2>&1; then
    T="$(cd "$ROOT" && "${HARNESS_RAG_NODE:-node}" "$SCRIPT_DIR/task-telemetry.mjs" --p90 "$1" "${HARNESS_WATCHDOG_JANELA_DIAS:-30}" 2>/dev/null)"
    case "$T" in ''|*[!0-9]*) : ;; *) printf '%s' "$T"; return 0 ;; esac
  fi
  J="$(ls -t "$ROOT"/prds/_metrics/harness-dashboard-*.json 2>/dev/null | head -1)"
  [ -n "$J" ] && [ -s "$J" ] || return 0
  command -v "${HARNESS_RAG_NODE:-node}" >/dev/null 2>&1 || return 0
  "${HARNESS_RAG_NODE:-node}" -e '
    try {
      const j = require(process.argv[1]);
      const a = (j.porAgente || []).find(x => x.tipo === process.argv[2]);
      if (a && a.durP90 > 0) process.stdout.write(String(Math.round(a.durP90)));
    } catch {}
  ' "$J" "$1" 2>/dev/null
}

linha() { # $1 = papel
  local p90 teto
  p90="$(medido_p90 "$1")"
  case "$p90" in ''|*[!0-9]*) p90="$(default_p90 "$1")" ;; esac
  teto=$(( p90 * FATOR ))
  [ "$teto" -lt 600 ] && teto=600
  if [ "$SO_TETO" -eq 1 ]; then printf '%s\n' "$teto"; else printf '%s|%s|%s\n' "$1" "$p90" "$teto"; fi
}

if [ -n "$PAPEL" ]; then
  linha "$PAPEL"
else
  for p in hefesto dedalo sherlock beholder michelangelo ariadne hermes atlas tony-stark peter-quill; do
    linha "$p"
  done
fi
