#!/usr/bin/env bash
# .claude/hooks/_rag-common.sh
# Helpers COMPARTILHADOS dos hooks de RAG. Prefixo "_" => nao e um hook (nao e
# registrado em settings.json; e dado source pelos rag-*.sh).
#
# Resolve runtimes (node / php) de forma PORTATIL entre maquinas:
#   1. override em .claude/harness.env.local (HARNESS_RAG_NODE / HARNESS_RAG_PHP)
#   2. PATH
#   3. locais conhecidos (nvm / MAMP / Laragon / Homebrew)
# E expoe utilitarios (extrair campo JSON do payload, capturar->resumir->embeddar).
# Tudo defensivo: nenhuma funcao aqui deve abortar o hook chamador.

# --- guarda anti-reentrancia GENERICA (2.0.0) ---
# Dois cenarios de subprocesso-LLM disparam os hooks deste projeto de novo:
#   1. resumo do RAG (providers claude-cli/codex-cli) — summarize exporta
#      HARNESS_RAG_IN_SUMMARIZE=1 no spawn;
#   2. revisor externo do review dupla-cega (external-review.sh) — exporta
#      HARNESS_IN_EXTERNAL_REVIEW=1.
# Sem a guarda, rag-capture-* chamaria o summarize dentro do subprocesso ->
# loop infinito (ou captura-lixo do review). Como todos os hooks rag-*.sh dao
# source neste arquivo antes de qualquer trabalho, sair aqui neutraliza todos
# de uma vez (captura, injecao e ensure-index) — em QUALQUER host (os hooks do
# Codex herdam o ambiente do subprocesso igualzinho).
[ "${HARNESS_RAG_IN_SUMMARIZE:-}" = "1" ] && exit 0
[ "${HARNESS_IN_EXTERNAL_REVIEW:-}" = "1" ] && exit 0
# 3.0.0: flag GENERICA de "estamos dentro de um CLI externo" (revisor da dupla-cega
# OU mini-task delegada pelo harness-delegate.sh). As duas convivem na transicao.
[ "${HARNESS_IN_EXTERNAL_AGENT:-}" = "1" ] && exit 0

# --- diretorios ---
RAG_HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # .../.claude/hooks
RAG_CLAUDE_DIR="$(cd "$RAG_HOOK_DIR/.." && pwd)"               # .../.claude
RAG_PROJECT_DIR="$(cd "$RAG_CLAUDE_DIR/.." && pwd)"            # raiz do repo
RAG_SCRIPTS="$RAG_PROJECT_DIR/.claude/scripts"
RAG_TSX="$RAG_PROJECT_DIR/node_modules/tsx/dist/cli.mjs"

# --- config: versionada (harness.env) + override local gitignored ---
# set -a: exporta TUDO que o harness.env(.local) define, para que os scripts Node/PHP
# (summarize/embed/search), chamados como subprocessos, herdem as flags HARNESS_RAG_*
# via process.env. Sem isto, as vars ficam locais ao shell do hook e NAO chegam ao node
# (ex.: HARNESS_RAG_LLM_PROVIDER cairia no default 'anthropic').
set -a
# 3.5.7: camadas (_defaults.env -> harness.env -> .local -> ~/.local; ambiente vence) via hooks/_env.sh
# shellcheck disable=SC1091
. "$RAG_CLAUDE_DIR/hooks/_env.sh"
set +a

# paths.ts (Node) le esta env primeiro — garante raiz correta independente do cwd do hook.
export HARNESS_RAG_PROJECT_ROOT="$RAG_PROJECT_DIR"

# Banco e log (derivados/por-maquina, gitignored).
RAG_DB="${HARNESS_RAG_DB:-$RAG_PROJECT_DIR/.claude/rag/rag.db}"
RAG_LOG="${HARNESS_RAG_LOG:-$RAG_PROJECT_DIR/.claude/rag/rag.log}"
mkdir -p "$(dirname "$RAG_LOG")" 2>/dev/null || true

rag_log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >>"$RAG_LOG" 2>/dev/null || true; }

# --- resolucao de runtimes ---
rag_resolve_node() {
  if [ -n "${HARNESS_RAG_NODE:-}" ] && [ -x "$HARNESS_RAG_NODE" ]; then printf '%s' "$HARNESS_RAG_NODE"; return 0; fi
  if command -v node >/dev/null 2>&1; then command -v node; return 0; fi
  # sort -V = ordem de VERSAO real (o glob e lexicografico: v9 > v18 > v22 —
  # pegaria um node arcaico como "mais novo"). Suportado no sort do macOS e GNU.
  local best=""
  best="$(printf '%s\n' "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | sort -V | tail -1)"
  [ -x "$best" ] || best=""
  if [ -z "$best" ]; then
    for d in /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do
      [ -x "$d" ] && { best="$d"; break; }
    done
  fi
  [ -n "$best" ] && printf '%s' "$best"
}

rag_resolve_php() {
  if [ -n "${HARNESS_RAG_PHP:-}" ] && [ -x "$HARNESS_RAG_PHP" ]; then printf '%s' "$HARNESS_RAG_PHP"; return 0; fi
  # MAMP (macOS) — prefere 7.4, depois qualquer 7.x, depois 8.x
  for d in /Applications/MAMP/bin/php/php7.4*/bin/php; do [ -x "$d" ] && { printf '%s' "$d"; return 0; }; done
  for d in /Applications/MAMP/bin/php/php7.*/bin/php; do [ -x "$d" ] && { printf '%s' "$d"; return 0; }; done
  for d in /Applications/MAMP/bin/php/php8.*/bin/php; do [ -x "$d" ] && { printf '%s' "$d"; return 0; }; done
  # Laragon (Windows)
  for d in "C:/laragon/bin/php/php-7."*"/php.exe" "C:/laragon/bin/php/php-8."*"/php.exe"; do
    [ -x "$d" ] && { printf '%s' "$d"; return 0; }
  done
  command -v php 2>/dev/null
}

RAG_NODE="$(rag_resolve_node)"
RAG_PHP="$(rag_resolve_php)"

# --- util: extrai um campo string de 1o nivel do JSON do payload ---
# Usa jq se disponivel (rapido); fallback para node (robusto com aspas/newlines).
rag_json_field() { # $1=json  $2=campo
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$1" | jq -r --arg k "$2" '.[$k] // empty' 2>/dev/null
    return 0
  fi
  [ -z "$RAG_NODE" ] && return 0
  printf '%s' "$1" | "$RAG_NODE" -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      try{const o=JSON.parse(s);const v=o[process.argv[1]];process.stdout.write(v==null?"":String(v));}catch(e){}
    });' "$2" 2>/dev/null
}

# --- escolhe o summarizer ---
# HARNESS_RAG_SUMMARIZER=ts|php forca; senao auto: PHP se summarize.php existir + php
# resolvido (este projeto reusa AnthropicService); senao TS (harness padrao, Node-only;
# provider de resumo via HARNESS_RAG_LLM_PROVIDER, default 'claude-cli'). Imprime 'ts'|'php'|''.
rag_pick_summarizer() {
  case "${HARNESS_RAG_SUMMARIZER:-}" in
    ts)  printf 'ts';  return 0 ;;
    php) printf 'php'; return 0 ;;
  esac
  if [ -f "$RAG_SCRIPTS/summarize.php" ] && [ -n "$RAG_PHP" ]; then printf 'php'; return 0; fi
  if [ -f "$RAG_SCRIPTS/summarize.ts" ] && [ -n "$RAG_NODE" ] && [ -f "$RAG_TSX" ]; then printf 'ts'; return 0; fi
  printf ''
}

# --- captura: payload(stdin) -> summarize (ts|php) -> .md -> embed.ts ---
rag_capture() { # $1=mode(agent|session)  $2=agent  $3=input(json)
  local mode="$1" agent="$2" input="$3" md="" engine=""
  # o embed sempre precisa de node+tsx
  if [ -z "$RAG_NODE" ] || [ ! -f "$RAG_TSX" ]; then rag_log "[capture] node/tsx ausente (embed) — pulado"; return 0; fi
  engine="$(rag_pick_summarizer)"
  if [ -z "$engine" ]; then rag_log "[capture] nenhum summarizer disponivel — pulado"; return 0; fi

  local rc=0
  if [ "$engine" = "php" ]; then
    md="$(printf '%s' "$input" | "$RAG_PHP" "$RAG_SCRIPTS/summarize.php" --mode="$mode" --agent="$agent" 2>>"$RAG_LOG")"; rc=$?
  else
    md="$(printf '%s' "$input" | "$RAG_NODE" "$RAG_TSX" "$RAG_SCRIPTS/summarize.ts" --mode="$mode" --agent="$agent" 2>>"$RAG_LOG")"; rc=$?
  fi

  if [ -n "$md" ] && [ -f "$md" ]; then
    "$RAG_NODE" "$RAG_TSX" "$RAG_SCRIPTS/embed.ts" "$md" knowledge >>"$RAG_LOG" 2>&1
    rag_log "[capture] $mode/$agent ($engine) -> $md"
  elif [ "$rc" = "3" ]; then
    # exit 3 = o summarize sinalizou FALHA do LLM (timeout/indisponivel), NAO irrelevancia.
    # Distinguir os dois e o que evita o problema passar despercebido como "nada relevante"
    # (o stderr com a causa — ex.: ETIMEDOUT — ja foi anexado ao log logo acima).
    rag_log "[capture] $mode/$agent ($engine) -> FALHA no resumo (LLM timeout/indisponivel — ver stderr acima)"
  else
    rag_log "[capture] $mode/$agent ($engine) -> nada relevante"
  fi
  return 0
}
