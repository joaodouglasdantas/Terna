#!/usr/bin/env bash
# .claude/hooks/esforco.sh (3.5.3) — ESFORCO DA SESSAO POR FASE (pensar | executar).
#
# Motivo (medido 12/09, PRD-142-b do dra-mariana-duarte): a exec rodou em `high` (preset equilibrado)
# e TODO subagente herdou — 83% dos 2,28M tokens dos executores eram raciocinio invisivel; 5h19 de
# parede para 9 tasks. Esforco e propriedade da SESSAO (nao ha por chamada Agent), e o trabalho de
# uma exec e envelope fechado (packet, contrato, invariantes): `high` ali compra pouco e cobra por
# turno. Ja a criacao (discovery, tecnica, gates) e julgamento aberto — la o `high`/`xhigh` paga.
# Regra da casa: ESFORCO SEGUE A FASE, NAO O PRESET SOZINHO.
#   fase pensar   = /ideia /dt /prd /mockup /dt-sweep /convencao   → economico high · equilibrado high · maximo xhigh
#   fase executar = /prd-exec /dt-exec /codex-review /manual       → economico medium · equilibrado medium · maximo high
# Override por fase no Perfil ("Nivel de esforco" → linhas "Esforco — fase pensar/executar"; `preset` = herda).
#
#   uso: bash .claude/hooks/esforco.sh <pensar|executar> [--atual <low|medium|high|xhigh|max>]
#        --atual: o esforco REAL da sessao — no Claude Code Desktop a skill le por
#                 mcp__ccd_session_mgmt__get_session {session_id:"self"} (campo `effort`); no CLI,
#                 CLAUDE_CODE_EFFORT_LEVEL se exportada; sem nada = n/d (a skill declara o alvo e segue).
#   saida (1 linha): ESFORCO|<fase>|alvo=<x>|atual=<y|n/d>|<ok|AJUSTAR|n/d>|preset=<p>|origem=<override|preset>
#   efeito colateral: grava .claude/.harness-run/esforco.env (fase/alvo/atual) — o `harness-metrics.sh stop`
#   le esse arquivo e registra `esforco` = "<alvo>/<atual>" na linha da run (drift vira metrica).
#   HARNESS_ESFORCO_GATE='off' → imprime so `n/d` (nunca pede ajuste). Read-only fora do .harness-run; exit 0.
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PERFIL="$ROOT/.claude/PERFIL-PROJETO.md"
# 3.5.7: camadas de configuracao — hooks/_env.sh carrega _defaults.env -> harness.env -> harness.env.local -> ~/.harness.env.local
# (ambiente da sessao vence). Antes cada hook tinha o proprio loop.
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_env.sh"
FASE="${1:-}"; [ $# -gt 0 ] && shift
ATUAL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --atual) ATUAL="$(printf '%s' "${2:-}" | tr '[:upper:]' '[:lower:]')"; shift 2 ;;
    --atual=*) ATUAL="$(printf '%s' "${1#*=}" | tr '[:upper:]' '[:lower:]')"; shift ;;
    *) shift ;;
  esac
done
case "$FASE" in
  pensar|executar) : ;;
  *) echo "uso: esforco.sh <pensar|executar> [--atual <nivel>]" >&2; printf 'ESFORCO|%s|alvo=n/d|atual=n/d|n/d|preset=n/d|origem=n/d\n' "${FASE:-?}"; exit 0 ;;
esac
ATUAL_ORIGEM="n/d"; [ -n "$ATUAL" ] && ATUAL_ORIGEM="flag"
if [ -z "$ATUAL" ] && [ -n "${CLAUDE_CODE_EFFORT_LEVEL:-}" ]; then ATUAL="$(printf '%s' "$CLAUDE_CODE_EFFORT_LEVEL" | tr '[:upper:]' '[:lower:]')"; ATUAL_ORIGEM="env"; fi
# 3.5.5 (C1): sem --atual e sem env, o hook DESCOBRE o esforco real sozinho pela linha de comando do processo da sessao
# (claude.exe ... --effort xhigh --model ...). Medido 15/09: 4 de 4 criacoes gravaram atual=n/d porque nenhuma chamou
# get_session self — e as 4 rodavam em xhigh com alvo high. Windows: 1 chamada de PowerShell subindo ate 8 pais (~250 ms);
# mac/linux: ps. HARNESS_ESFORCO_CMDLINE (teste) substitui a linha de comando; HARNESS_ESFORCO_AUTODETECT=off desliga.
esforco_do_processo() {
  local _cl="" _pid _w _i
  if [ -n "${HARNESS_ESFORCO_CMDLINE:-}" ]; then _cl="$HARNESS_ESFORCO_CMDLINE"
  else
    case "$(uname -s 2>/dev/null)" in
      MINGW*|MSYS*|CYGWIN*)
        # MSYS: fork+exec deixa o processo com um pai WINDOWS ja morto (o filho do fork) — a cadeia do Windows quebra no
        # 1o degrau. Sobe pela cadeia do `ps` do MSYS (PPID real) ate o topo (PPID=1 = pai externo) e so entao pergunta
        # ao Windows quem e o pai desse WINPID: o claude.exe que abriu o Bash tool.
        _pid=$$; _w=""; _i=0
        while [ "$_i" -lt 12 ]; do
          _ln="$(ps -p "$_pid" 2>/dev/null | awk 'NR==2{print $2" "$4}')"
          [ -n "$_ln" ] || break
          _w="${_ln##* }"; _pp="${_ln%% *}"
          case "$_pp" in ''|0|1) break ;; esac
          _pid="$_pp"; _i=$(( _i + 1 ))
        done
        [ -n "$_w" ] && _cl="$(powershell.exe -NoProfile -NonInteractive -Command "\$p=$_w; for(\$i=0;\$i -lt 8 -and \$p;\$i++){ \$o=Get-CimInstance Win32_Process -Filter \"ProcessId=\$p\"; if(-not \$o){break}; \$c=[string]\$o.CommandLine; if(\$c -match '--effort[= ]+(\S+)'){ Write-Output ('--effort ' + \$Matches[1]); break }; \$p=\$o.ParentProcessId }" 2>/dev/null | tr -d '\r')" ;;   # so o valor: o PowerShell quebra linha longa em 80 colunas quando nao e console
      *)
        _pid=$$; _i=0
        while [ "$_i" -lt 8 ] && [ -n "$_pid" ] && [ "$_pid" != "0" ] && [ "$_pid" != "1" ]; do
          _cl="$(ps -o args= -p "$_pid" 2>/dev/null)"
          case "$_cl" in *--effort*) break ;; esac
          _pid="$(ps -o ppid= -p "$_pid" 2>/dev/null | tr -d ' ')"; _i=$(( _i + 1 )); _cl=""
        done ;;
    esac
  fi
  printf '%s' "$_cl" | grep -oE -- '--effort[= ]+[A-Za-z]+' | head -1 | sed -E 's/^--effort[= ]+//' | tr '[:upper:]' '[:lower:]'
}
if [ -z "$ATUAL" ] && [ "${HARNESS_ESFORCO_AUTODETECT:-on}" != "off" ]; then
  ATUAL="$(esforco_do_processo 2>/dev/null)"; [ -n "$ATUAL" ] && ATUAL_ORIGEM="processo"
fi
case "$ATUAL" in low|medium|high|xhigh|max) : ;; *) ATUAL=""; ATUAL_ORIGEM="n/d" ;; esac

# celula 2 de uma linha de tabela markdown: "| **Campo** | `valor` ... |" -> valor (minusculo, sem crase)
celula2() { sed -E 's/^\|[^|]*\|[[:space:]]*`?([A-Za-z]+)`?.*$/\1/' | head -1 | tr '[:upper:]' '[:lower:]'; }
PRESET=""
[ -f "$PERFIL" ] && PRESET="$(grep -iE '^\| \*\*Preset de esfor[cç]o\*\*' "$PERFIL" | celula2)"
case "$PRESET" in economico|equilibrado|maximo) : ;; *) PRESET="equilibrado" ;; esac

# 1) override por fase no Perfil (3.5.3); 2) override legado "Esforco da sessao" na tabela de override
#    (3.4.25 — vale para as duas fases quando for um nivel concreto); 3) preset x fase.
OVR=""
if [ -f "$PERFIL" ]; then
  OVR="$(grep -iE "^\| \*\*Esfor[cç]o (—|-|–) fase $FASE\*\*" "$PERFIL" | celula2)"
  case "$OVR" in low|medium|high|xhigh|max) : ;; *) OVR="" ;; esac
  if [ -z "$OVR" ]; then
    LEG="$(grep -iE '^\| \*\*Esfor[cç]o da sess[aã]o\*\* \|' "$PERFIL" | celula2)"
    case "$LEG" in low|medium|high|xhigh|max) OVR="$LEG" ;; esac
  fi
fi
ORIGEM="preset"; ALVO=""
if [ -n "$OVR" ]; then ALVO="$OVR"; ORIGEM="override"
else
  case "$FASE:$PRESET" in
    pensar:economico|pensar:equilibrado) ALVO="high" ;;
    pensar:maximo)                       ALVO="xhigh" ;;
    executar:economico|executar:equilibrado) ALVO="medium" ;;
    executar:maximo)                     ALVO="high" ;;
  esac
fi
VER="n/d"
if [ "${HARNESS_ESFORCO_GATE:-on}" != "off" ] && [ -n "$ATUAL" ]; then
  if [ "$ATUAL" = "$ALVO" ]; then VER="ok"; else VER="AJUSTAR"; fi
fi
mkdir -p "$ROOT/.claude/.harness-run" 2>/dev/null
printf 'fase=%s\nalvo=%s\natual=%s\nts=%s\natual_origem=%s\n' "$FASE" "$ALVO" "${ATUAL:-n/d}" "$(date +%s)" "$ATUAL_ORIGEM" > "$ROOT/.claude/.harness-run/esforco.env" 2>/dev/null || true
printf 'ESFORCO|%s|alvo=%s|atual=%s|%s|preset=%s|origem=%s|atual_origem=%s\n' "$FASE" "$ALVO" "${ATUAL:-n/d}" "$VER" "$PRESET" "$ORIGEM" "$ATUAL_ORIGEM"
exit 0
