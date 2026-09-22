#!/usr/bin/env bash
# .claude/hooks/_contrato.sh (3.4.25, item 19) — helper: secao "## 0. Contrato do papel" dos packets.
# Sourced por task-packet.sh (executor), review-packet.sh (revisor) e prd-packet.sh (gate).
#   contrato_secao <papel>   -> imprime a secao no stdout (vazio se knob off ou arquivo ausente)
#   contrato_knob            -> on|off (env HARNESS_PACKET_CONTRATO > ~/.harness.env.local > harness.env.local > harness.env > hooks/_defaults.env)
# O contrato e a mecanica compartilhada do papel (.claude/contratos/CONTRATO-<papel>.md); o .md do
# agente fica com persona/lentes/regras. Nao usa GNU-ism (bash 3.2 ok).
# shellcheck disable=SC2034
_CONTRATO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../contratos" 2>/dev/null && pwd)"
_CONTRATO_ENV_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

contrato_knob() {
  local v="${HARNESS_PACKET_CONTRATO:-}" f
  if [ -z "$v" ]; then
    for f in "${HOME:-}/.harness.env.local" "$_CONTRATO_ENV_DIR/harness.env.local" "$_CONTRATO_ENV_DIR/harness.env" "$_CONTRATO_ENV_DIR/hooks/_defaults.env"; do   # 3.5.7: camadas (o 1o achado vence)
      [ -f "$f" ] || continue
      v="$(grep -E '^HARNESS_PACKET_CONTRATO=' "$f" 2>/dev/null | head -1 | cut -d= -f2- | tr -d "'\"[:space:]")"
      [ -n "$v" ] && break
    done
  fi
  case "$v" in off|0|no) printf 'off\n' ;; *) printf 'on\n' ;; esac
}

contrato_secao() {
  local papel="${1:-executor}" arq
  [ "$(contrato_knob)" = "on" ] || return 0
  arq="$_CONTRATO_DIR/CONTRATO-$papel.md"
  [ -f "$arq" ] || return 0
  printf '## 0. Contrato do papel (%s)\n\n' "$papel"
  printf '> Mecanica compartilhada do papel — vale para este despacho inteiro. Fonte: `.claude/contratos/CONTRATO-%s.md`.\n\n' "$papel"
  # rebaixa os titulos do contrato (## -> ###) para caberem sob a secao 0; pula o titulo H1 e o blockquote de abertura
  awk 'NR==1 && /^# / {next} !viu && (/^> / || /^[[:space:]]*$/) {next} {viu=1} /^## / {sub(/^## /, "### ")} {print}' "$arq"
  printf '\n'
}
