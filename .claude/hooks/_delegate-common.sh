#!/usr/bin/env bash
# .claude/hooks/_delegate-common.sh (3.0.0)
# Biblioteca COMUM dos helpers que disparam um CLI EXTERNO (Claude CLI / Codex CLI).
# Sourceada por:
#   - .claude/hooks/external-review.sh   (revisor externo da dupla-cega — 2.0.0)
#   - .claude/hooks/harness-delegate.sh  (broker de delegacao read-only — 3.0.0)
#
# POR QUE ELA EXISTE: o teto de tempo portavel, o probe de executor e a resolucao
# da raiz do projeto nasceram inline no external-review.sh e sao genuinamente
# genericos. Duplicar isso no broker significaria duas implementacoes do watchdog
# divergindo com o tempo — e o watchdog e a peca que impede processo orfao.
#
# NAO decide qual executor usar (isso e do roteador, no Perfil) nem sintetiza
# resultado (isso e do juiz, a sessao principal). E so encanamento deterministico.
#
# Compativel com bash 3.2 (macOS) e 4+ (Git Bash/Linux). Sem arrays associativos.

# Guard de double-source: sourceada duas vezes nao redefine nada nem repete probe.
if [ -n "${HARNESS_DELEGATE_COMMON_LOADED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
HARNESS_DELEGATE_COMMON_LOADED=1

# Tag do log em stderr. Cada consumidor define a sua antes de chamar as funcoes.
: "${HARNESS_LOG_TAG:=harness}"

harness_log() { # $* = mensagem (stderr — stdout e contrato de dados)
  printf '[%s] %s\n' "$HARNESS_LOG_TAG" "$*" >&2
}

# ---------------------------------------------------------------------------
# Raiz do projeto
# ---------------------------------------------------------------------------
# A raiz e o diretorio que CONTEM o `.claude/` — ou seja, dois niveis acima deste
# script. Nunca o cwd (hooks e helpers sao chamados de subdiretorio o tempo todo)
# e nunca o `git rev-parse --show-toplevel` cru:
#
#   Em projeto portado os dois coincidem. Mas quando o harness vive DENTRO de um
#   repo maior — e e o caso da propria copia-mestre, que mora no vault — o
#   toplevel do git devolve a raiz do repo hospedeiro, e o executor externo
#   receberia um cwd que abrange o vault inteiro em vez do projeto.
#
# O git entra so como INFORMACAO (harness_git_root), nunca como a resposta.
harness_project_root() {
  ( cd "$( dirname "${BASH_SOURCE[0]}" )/../.." 2>/dev/null && pwd )
}

# Raiz do repositorio git que contem o projeto (ou vazio). Usada para diagnostico
# e para o fingerprint do working tree — nao para definir o cwd do executor.
harness_git_root() { # [dir-de-partida]
  ( cd "${1:-$PWD}" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null )
}

# ---------------------------------------------------------------------------
# Validacao de caminho — o broker recebe path de fora e nunca confia nele
# ---------------------------------------------------------------------------
# Resolve para absoluto SEM exigir que o arquivo exista (o --output ainda nao
# existe quando e validado). Portavel: nao depende de realpath/readlink -f.
harness_abs_path() { # $1 = path
  local p="$1" d b
  [ -n "$p" ] || return 1
  d="$( dirname "$p" )"
  b="$( basename "$p" )"
  d="$( cd "$d" 2>/dev/null && pwd )" || return 1
  case "$b" in
    .) printf '%s\n' "$d" ;;
    *) printf '%s/%s\n' "${d%/}" "$b" ;;
  esac
}

# 0 = o path esta DENTRO da raiz; 1 = fora (ou irresolvivel).
# Barra o classico "--output ../../fora.md" e caminho absoluto de outro repo.
harness_path_inside() { # $1 = raiz  $2 = path
  local root="$1" p="$2" abs
  root="$( cd "$root" 2>/dev/null && pwd )" || return 1
  abs="$( harness_abs_path "$p" )" || return 1
  case "$abs" in
    "$root"|"$root"/*) return 0 ;;
    *) return 1 ;;
  esac
}

# ---------------------------------------------------------------------------
# Teto de tempo portavel  (extraido do external-review.sh 2.4.0)
# ---------------------------------------------------------------------------
# Probe de CAPACIDADE, nao de existencia: no Git Bash/Windows o PATH herda o
# System32 e 'command -v timeout' acha o timeout.exe (delay de console, que
# rejeita comando como argumento e stdin) — o executor morreria na hora.
# GNU/BusyBox timeout aceitam 'timeout 1 true'; o do System32 falha o probe.
#
# Sem GNU timeout, um watchdog em shell puro mata o executor apos N segundos —
# o CLI externo NUNCA roda sem teto.
harness_run_with_timeout() { # $1 = segundos; $@ = comando
  local _t="$1"; shift
  "$@" &
  local _pid=$!
  (
    local _i=0
    while [ "$_i" -lt "$_t" ]; do
      sleep 5; _i=$((_i+5))
      kill -0 "$_pid" 2>/dev/null || exit 0
    done
    printf '[%s] watchdog: executor externo excedeu %ss — encerrando (pid %s).\n' \
      "$HARNESS_LOG_TAG" "$_t" "$_pid" >&2
    kill "$_pid" 2>/dev/null
    sleep 2
    kill -9 "$_pid" 2>/dev/null
  ) &
  local _wd=$!
  wait "$_pid"
  local _rc=$?
  kill "$_wd" 2>/dev/null
  wait "$_wd" 2>/dev/null
  return $_rc
}

# Imprime o prefixo de comando a usar ("timeout N" ou "harness_run_with_timeout N").
# O chamador expande SEM aspas (SC2086 desabilitado no ponto de uso).
harness_resolve_timeout_cmd() { # $1 = segundos
  local t="$1"
  if command -v timeout >/dev/null 2>&1 && timeout 1 true >/dev/null 2>&1; then
    printf 'timeout %s\n' "$t"
  else
    harness_log "GNU timeout indisponivel — usando watchdog interno (teto ${t}s)."
    printf 'harness_run_with_timeout %s\n' "$t"
  fi
}

# Normaliza um numero de segundos (vazio/lixo => default).
harness_sane_timeout() { # $1 = valor  $2 = default
  local v="$1" d="$2"
  case "$v" in
    ''|*[!0-9]*) printf '%s\n' "$d" ;;
    0)           printf '%s\n' "$d" ;;
    *)           printf '%s\n' "$v" ;;
  esac
}

# ---------------------------------------------------------------------------
# Disponibilidade do executor (binario + autenticacao best-effort)
# ---------------------------------------------------------------------------
# exit 0  = disponivel
# exit 10 = INDISPONIVEL (motivo em stderr) — o chamador cai no fallback
# exit 2  = executor desconhecido
#
# "best-effort" e literal: conferimos binario no PATH e o artefato de login que
# cada CLI cria. Nao validamos a sessao contra a rede — isso custaria uma chamada
# so para descobrir se da para fazer a chamada.
harness_executor_available() { # $1 = claude-cli|codex-cli
  local ex="$1" bin
  case "$ex" in
    codex-cli)
      if ! command -v codex >/dev/null 2>&1; then
        harness_log "'codex' ausente no PATH. Instalar: npm i -g @openai/codex (no macOS o XProtect pode apagar o binario — reinstale)."
        return 10
      fi
      if [ ! -f "${CODEX_HOME:-${HOME:-}/.codex}/auth.json" ]; then
        harness_log "Codex sem login (~/.codex/auth.json ausente). Rode: codex login"
        return 10
      fi
      return 0
      ;;
    claude-cli)
      bin="${HARNESS_RAG_CLAUDE_BIN:-claude}"
      if ! command -v "$bin" >/dev/null 2>&1; then
        harness_log "'$bin' ausente no PATH — instale o Claude Code CLI."
        return 10
      fi
      return 0
      ;;
    openrouter)
      # 3.2.2 — HTTP puro via Node (fetch nativo >= 18). A chave vem do AMBIENTE ou
      # do harness.env.local (ja sourceado por quem chama); nunca do harness.env.
      bin="${HARNESS_RAG_NODE:-node}"
      if ! command -v "$bin" >/dev/null 2>&1; then
        harness_log "'$bin' ausente no PATH — o executor openrouter precisa de Node >= 18 (fetch nativo)."
        return 10
      fi
      if [ -z "${OPENROUTER_API_KEY:-}" ]; then
        harness_log "OPENROUTER_API_KEY ausente. Preencha no .claude/harness.env do projeto (chave de PROJETO desde a 3.5.7 — viaja pelo repo) ou, pessoal, em ~/.harness.env.local (vence por cima)."
        return 10
      fi
      return 0
      ;;
    ollama)
      # 3.4.7 — modelo LOCAL na GPU da maquina, via API OpenAI-compativel do Ollama
      # ({url}/v1/chat/completions). Zero custo, zero rede externa, imune a 429 — o
      # "worker gratis" do duelo. Reusa o MESMO motor HTTP do openrouter (OR_BASE_URL).
      bin="${HARNESS_RAG_NODE:-node}"
      if ! command -v "$bin" >/dev/null 2>&1; then
        harness_log "'$bin' ausente no PATH — o executor ollama precisa de Node >= 18 (fetch nativo)."
        return 10
      fi
      if ! curl -s -m 3 "${HARNESS_OLLAMA_URL:-http://localhost:11434}/api/tags" >/dev/null 2>&1; then
        harness_log "daemon do Ollama nao responde em ${HARNESS_OLLAMA_URL:-http://localhost:11434} — instale/inicie (https://ollama.com) e rode: ollama pull ${HARNESS_OLLAMA_MODEL:-auto}"
        return 10
      fi
      return 0
      ;;
    *)
      harness_log "executor desconhecido: '$ex' (use claude-cli, codex-cli, openrouter ou ollama)."
      return 2
      ;;
  esac
}

# Versao do CLI (para a telemetria). Nunca falha: sem valor, imprime 'n/d'.
harness_executor_version() { # $1 = claude-cli|codex-cli|openrouter|ollama
  local ex="$1" v=""
  case "$ex" in
    codex-cli)  v="$( codex --version 2>/dev/null | head -1 )" ;;
    claude-cli) v="$( "${HARNESS_RAG_CLAUDE_BIN:-claude}" --version 2>/dev/null | head -1 )" ;;
    openrouter) v="openrouter-http/$( "${HARNESS_RAG_NODE:-node}" --version 2>/dev/null | head -1 )" ;;
    ollama)     v="ollama/$( curl -s -m 3 "${HARNESS_OLLAMA_URL:-http://localhost:11434}/api/version" 2>/dev/null | grep -o '"version":"[^"]*"' | cut -d'"' -f4 )" ;;
  esac
  case "$v" in ''|*/) printf 'n/d\n' ;; *) printf '%s\n' "$v" ;; esac
}

# ---------------------------------------------------------------------------
# Ollama: resolucao DINAMICA do modelo por memoria livre (3.4.8, adendo 31/08)
# + CAPACIDADE pelo tamanho do prompt (DT-006 do mestre, 01/09)
# ---------------------------------------------------------------------------
# 'auto' escolhe na hora entre o modelo GRANDE (melhor; precisa de folga de RAM
# para o offload do MoE) e o PEQUENO (cabe inteiro na VRAM): pedido do Charles —
# "se tiver memoria livre roda o maior, senao o menor". Regra:
#   RAM livre >= HARNESS_OLLAMA_AUTO_RAM_GB (12)  E  uso de VRAM <= 3GB (sem jogo)
#     -> GRANDE; qualquer outra situacao (ou medicao indisponivel) -> PEQUENO.
# A medicao e best-effort por plataforma; na duvida degrada ao PEQUENO (nunca
# derruba a maquina do dev). O chamador DEVE registrar o modelo RESOLVIDO na
# telemetria (placar distingue 30b de 14b).
#
# DT-006 (01/09/2026, decisao do Charles: "30B apenas para pacotes menores"): $2
# opcional = tokens ESTIMADOS do prompt — estimador canonico: **bytes/2** (medido
# 01/09: codigo denso tokeniza a 2,16 bytes/token; bytes/3 SUBESTIMAVA e deixava
# truncar). Com ele, tetos de capacidade ANTES da memoria — no DT-540 o 30b
# (18GB > VRAM 16GB) nao completou o prefill de 42k tokens no timeout, e o
# llama-server trunca o prompt A METADE do n_ctx do slot quando nao cabe:
#   tokens > HARNESS_OLLAMA_MAX_TOKENS_PEQUENO (16000 est ~ 32KB) -> LOCAL
#     INVIAVEL (rc 3, saida vazia — o chamador pula o local ou promove remoto);
#   tokens > HARNESS_OLLAMA_MAX_TOKENS_GRANDE  (6000 est ~ 12KB)  -> forca o
#     PEQUENO (mesmo que $1 pedisse o GRANDE — degradar e melhor que truncar);
#   dentro dos tetos -> a regra de memoria acima decide normalmente.
# Os tetos garantem prompt real < NUM_CTX_MAX/2 (o limite de truncamento do
# slot) com margem, mesmo no pior caso de tokenizacao medido.
harness_ollama_resolver_modelo() { # $1 = modelo pedido ('' ou 'auto' => decidir)  $2 = tokens estimados bytes/2 (opcional)
  local m="${1:-${HARNESS_OLLAMA_MODEL:-auto}}"
  local GRANDE="${HARNESS_OLLAMA_MODEL_GRANDE:-qwen3-coder:30b}"
  local PEQUENO="${HARNESS_OLLAMA_MODEL_PEQUENO:-qwen2.5-coder:14b}"
  local TOK="${2:-}" MAXG="${HARNESS_OLLAMA_MAX_TOKENS_GRANDE:-6000}" MAXP="${HARNESS_OLLAMA_MAX_TOKENS_PEQUENO:-16000}"
  case "$MAXG" in ''|*[!0-9]*) MAXG=6000 ;; esac
  case "$MAXP" in ''|*[!0-9]*) MAXP=16000 ;; esac
  if [ -n "$TOK" ]; then
    case "$TOK" in ''|*[!0-9]*) TOK="" ;; esac
  fi
  if [ -n "$TOK" ]; then
    if [ "$TOK" -gt "$MAXP" ]; then
      harness_log "ollama: prompt ~${TOK} tokens > teto local ${MAXP} (HARNESS_OLLAMA_MAX_TOKENS_PEQUENO) — local inviavel (DT-006)."
      return 3
    fi
    if [ "$TOK" -gt "$MAXG" ]; then
      # acima do teto do GRANDE: so o PEQUENO e elegivel, mesmo com memoria de sobra
      if [ "$m" = "auto" ] || [ "$m" = "$GRANDE" ]; then
        [ "$m" = "$GRANDE" ] && harness_log "ollama: prompt ~${TOK} tokens > teto do GRANDE ${MAXG} (HARNESS_OLLAMA_MAX_TOKENS_GRANDE) — degradando a $PEQUENO (DT-006)."
        printf '%s\n' "$PEQUENO"; return 0
      fi
      printf '%s\n' "$m"; return 0
    fi
  fi
  if [ "$m" != "auto" ]; then printf '%s\n' "$m"; return 0; fi
  local MIN_RAM_GB="${HARNESS_OLLAMA_AUTO_RAM_GB:-10}"   # calibrado 31/08: maquina 32GB em uso normal fica com 11-12 disponiveis; 12 reprovava com folga real
  case "$MIN_RAM_GB" in ''|*[!0-9]*) MIN_RAM_GB=10 ;; esac
  # Cache de 120s: a medicao (PowerShell frio) custa ~8s — rajada de duelos paga 1x.
  local CACHE_F="$(harness_project_root)/.claude/.harness-run/ollama-auto.cache"
  local _now _cl _cts _cm
  _now="$(date +%s)"
  if [ -f "$CACHE_F" ]; then
    IFS='|' read -r _cts _cm < "$CACHE_F" 2>/dev/null || true
    case "$_cts" in *[!0-9]*|'') _cts=0 ;; esac
    if [ $(( _now - _cts )) -lt 120 ] && [ -n "${_cm:-}" ]; then printf '%s\n' "$_cm"; return 0; fi
  fi
  local ram_gb='' vram_gb=''
  if command -v powershell.exe >/dev/null 2>&1; then
    # Windows, UMA chamada (o PS frio custa ~3s): linha1 = RAM DISPONIVEL em GB
    # (Available MBytes = free+standby, o analogo do MemAvailable — free estrito
    # subestima brutalmente: Windows saudavel vive com quase tudo em standby cache);
    # linha2 = uso somado de VRAM dedicada em GB (contador de GPU; falha => vazio).
    local _ps_out
    _ps_out="$(powershell.exe -NoProfile -Command "[int]((Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory).AvailableMBytes/1024); try{[int](((Get-Counter '\GPU Adapter Memory(*)\Dedicated Usage' -ErrorAction Stop).CounterSamples | Measure-Object -Property CookedValue -Sum).Sum/1GB)}catch{''}" 2>/dev/null | tr -d '\r')"
    ram_gb="$(printf '%s\n' "$_ps_out" | sed -n '1p' | tr -d '[:space:]')"
    vram_gb="$(printf '%s\n' "$_ps_out" | sed -n '2p' | tr -d '[:space:]')"
  elif [ -r /proc/meminfo ]; then
    ram_gb="$(( $(grep -m1 '^MemAvailable:' /proc/meminfo | grep -oE '[0-9]+') / 1048576 ))"
  elif command -v vm_stat >/dev/null 2>&1; then
    # macOS: paginas livres+inativas * 4KB
    ram_gb="$(vm_stat 2>/dev/null | awk '/Pages (free|inactive)/ {gsub(/\./,"",$NF); s+=$NF} END {printf "%d", s*4096/1073741824}')"
  fi
  local ESCOLHA="$PEQUENO"
  case "$ram_gb" in
    ''|*[!0-9]*) : ;;   # medicao indisponivel => pequeno (seguro)
    *)
      if [ "$ram_gb" -ge "$MIN_RAM_GB" ]; then
        case "$vram_gb" in
          ''|*[!0-9]*) ESCOLHA="$GRANDE" ;;               # sem medicao de VRAM: RAM decide
          *) [ "$vram_gb" -le 3 ] && ESCOLHA="$GRANDE" ;; # GPU ocupada (jogo) => pequeno
        esac
      fi
      ;;
  esac
  mkdir -p "$(dirname "$CACHE_F")" 2>/dev/null
  printf '%s|%s\n' "$_now" "$ESCOLHA" > "$CACHE_F" 2>/dev/null
  printf '%s\n' "$ESCOLHA"
}

# DT-007: append de telemetria JSONL com lock (compartilhado com metrics/duelo)
# shellcheck disable=SC1091
[ -f "$(dirname "${BASH_SOURCE[0]}")/_jsonl-append.sh" ] && . "$(dirname "${BASH_SOURCE[0]}")/_jsonl-append.sh"
# fallback minimo se o helper nao viajou (harness parcial): append direto, sem lock
command -v harness_jsonl_append >/dev/null 2>&1 || harness_jsonl_append() { [ -n "${1:-}" ] && printf '%s\n' "${2:-}" >> "$1" 2>/dev/null; return 0; }

# ---------------------------------------------------------------------------
# Reentrancia — um agente externo NUNCA spawna outro
# ---------------------------------------------------------------------------
# Duas flags durante a transicao 2.x -> 3.0.0:
#   HARNESS_IN_EXTERNAL_REVIEW — historica (revisor externo; hooks RAG ja a respeitam)
#   HARNESS_IN_EXTERNAL_AGENT  — generica (qualquer delegacao a CLI externo)
# Os hooks reconhecem AS DUAS; helpers novos exportam as duas.
harness_in_external() {
  [ "${HARNESS_IN_EXTERNAL_AGENT:-}" = "1" ] && return 0
  [ "${HARNESS_IN_EXTERNAL_REVIEW:-}" = "1" ] && return 0
  return 1
}
