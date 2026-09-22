#!/usr/bin/env bash
# .claude/hooks/_incidente.sh — INCIDENTES do harness com schema unico (3.4.23, item 15g).
# Helper COMPARTILHADO (prefixo "_" => nao e hook; e dado source pelos scripts).
#
# POR QUE EXISTE. Ate a 3.4.22 cada guarda gravava o seu proprio log local e efemero
# (.harness-run/watchdog-overruns.jsonl, .harness-run/folego.jsonl, saida do agent-stall,
# permission-waits.jsonl com type:denied) — formatos diferentes, nada versionado, nada por dev.
# Medido 04/09: 0 overruns registrados em projeto com 6 agentes > 60 min. Agora TODO incidente
# tambem vira UMA linha com o MESMO schema em
#   prds/_metrics/incidentes/<usuario>@<maquina>[~worktree].jsonl   (versionado, um arquivo por
#   dev/maquina = append-only sem conflito de merge — mesma regra dos runs/ e tasks/)
# e o harness-metrics.sh stop faz `git add` dele. Os logs locais antigos CONTINUAM (nada quebra).
#
# Schema (uma linha):
#   {"ts":<epoch>,"projeto":"<pasta>","maquina":"<user@host>","harness":"<versao>",
#    "tipo":"overrun|folego|stall|denied|frentes","papel":"<agente>","rotulo":"<TASK/DT/PRD/LOTE>",
#    "agent":"<id>","detalhe":"<texto curto, sem aspas/controle>"}
#
# Uso (apos dar source; o chamador ja carregou harness.env):
#   harness_incidente <tipo> <papel> <rotulo> <agent> <detalhe>
# Knob: HARNESS_INCIDENTES='on' (default) | 'off'. Nunca falha o chamador (return 0 sempre).

# shellcheck disable=SC1091
[ -f "$(dirname "${BASH_SOURCE[0]}")/_jsonl-append.sh" ] && . "$(dirname "${BASH_SOURCE[0]}")/_jsonl-append.sh"
command -v harness_jsonl_append >/dev/null 2>&1 || harness_jsonl_append() { [ -n "${1:-}" ] && { mkdir -p "$(dirname "$1")" 2>/dev/null; printf '%s\n' "${2:-}" >> "$1" 2>/dev/null; }; return 0; }

harness_incidente_arquivo() { # $1 = raiz do projeto -> caminho do jsonl desta maquina
  local _root="$1" _u _h _wt=""
  # 3.5.0: mesma regra de nome das demais series (helper unico em _jsonl-append.sh); fallback abaixo se ausente
  if command -v harness_metrics_arquivo >/dev/null 2>&1; then harness_metrics_arquivo "$_root" incidentes; return 0; fi
  _u="${USER:-${USERNAME:-dev}}"
  _h="$(hostname 2>/dev/null | cut -d. -f1)"; : "${_h:=maquina}"
  _wt="$(grep '^rotulo=' "$_root/.claude/.harness-run/worktree.env" 2>/dev/null | cut -d= -f2)"
  [ -n "$_wt" ] && _wt="~$_wt"
  printf '%s/prds/_metrics/incidentes/%s.jsonl' "$_root" "$(printf '%s@%s%s' "$_u" "$_h" "$_wt" | tr -c 'A-Za-z0-9@._~-' '_')"
}

harness_incidente() { # $1 tipo  $2 papel  $3 rotulo  $4 agent  $5 detalhe
  [ "${HARNESS_INCIDENTES:-on}" != "off" ] || return 0
  local _tipo _papel _rot _ag _det _root _f _line
  _tipo="$(printf '%s' "${1:-}" | tr -c 'a-z' '_' | cut -c1-16)"; [ -n "$_tipo" ] || _tipo="outro"
  _papel="$(printf '%s' "${2:-}" | tr -cd 'A-Za-z0-9._-' | cut -c1-40)"
  _rot="$(printf '%s' "${3:-}" | tr -cd 'A-Za-z0-9._-' | cut -c1-40)"
  _ag="$(printf '%s' "${4:-}" | tr -cd 'A-Za-z0-9._-' | cut -c1-40)"
  _det="$(printf '%s' "${5:-}" | tr -d '"\\' | tr '\n\r\t' '   ' | tr -d '\000-\037' | cut -c1-200)"
  _root="${HARNESS_INCIDENTE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd)}"
  [ -n "$_root" ] || return 0
  _f="$(harness_incidente_arquivo "$_root")"
  # 3.5.6 (D8): DEDUP — o guard-agent --post pode rodar duas vezes para o MESMO retorno (medido 15/09, 137-c: incidente
  # `relatorio` do hefesto TASK-002 gravado 2x em 19 s). Mesma assinatura (tipo, papel, rotulo, agent, detalhe) nas ultimas
  # 20 linhas e com menos de HARNESS_INCIDENTES_DEDUP_S (600 s) => nao grava de novo. HARNESS_INCIDENTES_DEDUP=off desliga.
  if [ "${HARNESS_INCIDENTES_DEDUP:-on}" != "off" ] && [ -f "$_f" ]; then
    local _sig _prev _pts _win
    _sig="\"tipo\":\"$_tipo\",\"papel\":\"$_papel\",\"rotulo\":\"$_rot\",\"agent\":\"$_ag\",\"detalhe\":\"$_det\"}"
    _prev="$(tail -n 20 "$_f" 2>/dev/null | grep -F -- "$_sig" | tail -1)"
    if [ -n "$_prev" ]; then
      _pts="$(printf '%s' "$_prev" | grep -o '"ts":[0-9]*' | head -1 | cut -d: -f2)"
      _win="${HARNESS_INCIDENTES_DEDUP_S:-600}"; case "$_win" in ''|*[!0-9]*) _win=600 ;; esac
      case "$_pts" in ''|*[!0-9]*) _pts=0 ;; esac
      [ $(( $(date +%s 2>/dev/null || echo 0) - _pts )) -lt "$_win" ] 2>/dev/null && return 0
    fi
  fi
  _line="$(printf '{"ts":%s,"projeto":"%s","maquina":"%s","harness":"%s","tipo":"%s","papel":"%s","rotulo":"%s","agent":"%s","detalhe":"%s"}' \
    "$(date +%s 2>/dev/null || echo 0)" "$(basename "$_root")" "${USER:-${USERNAME:-dev}}@$(hostname 2>/dev/null | cut -d. -f1)" "${HARNESS_VERSION:-}" \
    "$_tipo" "$_papel" "$_rot" "$_ag" "$_det")"
  harness_jsonl_append "$_f" "$_line"
  return 0
}
