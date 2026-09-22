#!/usr/bin/env bash
# .claude/hooks/codex-review.sh (2.0.0 — SHIM de compatibilidade)
# O helper real virou .claude/hooks/external-review.sh, consciente do host
# (multi-AI): no host Claude o revisor externo e o Codex CLI; no host Codex,
# o Claude CLI. Este shim preserva o nome e o CONTRATO historicos (skills e
# allowlists antigas chamam "codex-review.sh"):
#   stdout = path do relatorio (1 linha) ou vazio; exit 0 SEMPRE.
# Args identicos: [LABEL] [CICLO] [REASONING]. Config no harness.env
# (HARNESS_EXTERNAL_REVIEWER etc. — ver .claude/PLATAFORMAS.md §8).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/external-review.sh" "$@"
