#!/usr/bin/env bash
# .claude/hooks/_host-detect.sh
# Helper COMPARTILHADO (prefixo "_" => nao e hook; e dado source pelos scripts).
# Resolve EM QUAL runtime a sessao atual roda ('claude' | 'codex') e expoe
# utilitarios multi-AI. Ordem (ver .claude/PLATAFORMAS.md §2):
#   1. HARNESS_HOST explicito (ambiente ou harness.env) != 'auto'  -> vence.
#      E o caminho DETERMINISTICO: o wiring do Codex (.codex/hooks.json) ja
#      prefixa cada hook com HARNESS_HOST=codex — la a deteccao nunca chuta.
#   2. Sinais do runtime (PALPITE best-effort, nao confirmado em doc):
#      CLAUDECODE/CLAUDE_PROJECT_DIR => claude (documentado pelo Claude Code);
#      CODEX_HOME/CODEX_SANDBOX/CODEX_THREAD_ID => codex (NAO confirmado na
#      doc do Codex — por isso o wiring explicito do item 1 e o que vale la).
#   3. Fallback: 'claude' (comportamento historico) — palpite, nao certeza.
#
# Uso (apos dar source):
#   HOST="$(harness_detect_host)"          # 'claude' | 'codex'
#   harness_host_is codex && ...
# Nao carrega harness.env sozinho — o chamador ja o fez (padrao dos hooks).

harness_detect_host() {
  case "${HARNESS_HOST:-auto}" in
    claude|codex) printf '%s' "$HARNESS_HOST"; return 0 ;;
  esac
  if [ -n "${CLAUDECODE:-}" ] || [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then
    printf 'claude'; return 0
  fi
  if [ -n "${CODEX_HOME:-}" ] || [ -n "${CODEX_SANDBOX:-}" ] || [ -n "${CODEX_THREAD_ID:-}" ]; then
    printf 'codex'; return 0
  fi
  printf 'claude'
}

harness_host_is() { [ "$(harness_detect_host)" = "$1" ]; }

# Superficies instaladas neste repo (harness.env HARNESS_TARGETS, csv).
# harness_target_has codex && ...
harness_target_has() {
  _ht=",$(printf '%s' "${HARNESS_TARGETS:-claude}" | tr -d '[:space:]'),"
  case "$_ht" in
    *",$1,"*) return 0 ;;
    *) return 1 ;;
  esac
}
