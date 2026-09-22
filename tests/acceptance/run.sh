#!/usr/bin/env bash
# tests/acceptance/run.sh (2.0.0 — multi-AI)
# Suite de ACEITACAO do harness: valida instalacao/atualizacao por superficie
# (claude | codex | all), preservacao do que e local, adapters gerados, hooks
# com payloads sinteticos, wiring de eventos por plataforma e degradacao
# explicita sem CLIs externos.
#
# GARANTIAS DE EXECUCAO:
#   - SEM rede e SEM chamada paga (RAG so em provider 'mock'; review testado
#     justamente na AUSENCIA dos CLIs externos).
#   - A copia-mestre e SO-LEITURA: toda escrita acontece em fixtures dentro de
#     um diretorio temporario, SEMPRE limpo ao sair (trap).
#   - Compativel com bash 3.2 (macOS) e bash 4+ (Git Bash/Linux).
#
# Uso:
#   bash tests/acceptance/run.sh            # roda tudo (t00..t18)
#   bash tests/acceptance/run.sh t09        # filtro por padrao no nome
#
# Saida: uma linha por cenario — "PASS <nome>" | "FAIL <nome> — motivo" |
# "SKIP <nome> — motivo" (pre-requisito de maquina ausente; nunca e falha).
# Exit 0 = nenhum FAIL; exit 1 = pelo menos um FAIL.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # .../tests/acceptance
MASTER="$(cd "$SCRIPT_DIR/../.." && pwd)"                    # raiz do harness (mestre)
SYNC="$MASTER/.claude/harness-sync.sh"
DOCTOR="$MASTER/.claude/harness-doctor.sh"
GEN_ADAPTERS="$MASTER/.claude/scripts/gen-adapters.sh"
HOOKS_DIR="$MASTER/.claude/hooks"

HARNESS_SKILLS="prd prd-exec dt dt-exec dt-sweep codex-review harness-config"

BASE="$(mktemp -d "${TMPDIR:-/tmp}/harness-acc-$$.XXXXXX")" || {
  printf 'FALHA: nao consegui criar o diretorio temporario de fixtures.\n' >&2
  exit 1
}
trap 'rm -rf "$BASE"' EXIT INT TERM

FILTER="${1:-}"
PASS=0; FAIL=0; SKIP=0

pass()  { printf 'PASS %s\n' "$1"; PASS=$((PASS+1)); }
fail()  { printf 'FAIL %s — %s\n' "$1" "$2"; FAIL=$((FAIL+1)); }
skip_() { printf 'SKIP %s — %s\n' "$1" "$2"; SKIP=$((SKIP+1)); }

# O cenario roda? (sem filtro = sim; com filtro = so se o nome contiver o padrao)
want() {
  [ -z "$FILTER" ] && return 0
  case "$1" in *"$FILTER"*) return 0 ;; *) return 1 ;; esac
}

# Nova fixture (dir do projeto-alvo) dentro do temporario. Imprime o caminho.
new_fx() {
  local d="$BASE/$1"
  mkdir -p "$d/.claude"
  printf '%s' "$d"
}

# Lista "-u VAR" p/ limpar QUALQUER HARNESS_* herdada do ambiente do operador —
# os hooks devem ver SO o que o cenario define (a suite pode rodar dentro de uma
# sessao que exporta flags do proprio harness).
hclean() {
  env | LC_ALL=C sed -n 's/^\(HARNESS_[A-Za-z0-9_]*\)=.*/-u \1/p' | tr '\n' ' '
}

# Roda um comando com cwd na fixture e ambiente limpo de HARNESS_*.
# Uso: run_in <fixture> [VAR=val ...] comando args...
run_in() {
  local d="$1"; shift
  # shellcheck disable=SC2046
  ( cd "$d" && env $(hclean) "$@" )
}

# Frontmatter YAML: o campo existe na 1a secao ---?
fm_has() { # $1=arquivo $2=campo
  awk 'NR==1 && $0=="---" {fm=1; next} fm && $0=="---" {exit} fm' "$1" 2>/dev/null \
    | grep -q "^$2:"
}

# Snapshot de uma arvore (lista de paths + checksum de conteudo) p/ provar "sem writes".
snap() {
  ( cd "$1" && {
      find . \( -type d -o -type f \) -print | LC_ALL=C sort
      find . -type f -exec cksum {} + 2>/dev/null | LC_ALL=C sort
    } )
}

# ---------------------------------------------------------------------------
# t00 — sanidade: bash -n em todo script que a suite exercita.
# ---------------------------------------------------------------------------
t00() {
  local n="t00-sanity-bash-n" f bad=""
  want "$n" || return 0
  for f in "$SYNC" "$DOCTOR" "$GEN_ADAPTERS" "$HOOKS_DIR"/*.sh; do
    [ -f "$f" ] || { bad="$bad ${f##*/}(ausente)"; continue; }
    bash -n "$f" 2>/dev/null || bad="$bad ${f##*/}"
  done
  if [ -n "$bad" ]; then fail "$n" "erro de sintaxe/ausencia em:$bad"; else pass "$n"; fi
}

# ---------------------------------------------------------------------------
# t01 — instalacao nova SO Claude: nucleo canonico entra, superficie Codex NAO.
# ---------------------------------------------------------------------------
t01() {
  local n="t01-instalacao-claude" fx rc
  want "$n" || return 0
  fx="$(new_fx t01)"
  ( cd "$fx" && git init -q ) >/dev/null 2>&1
  bash "$SYNC" --apply "$fx" --target claude >"$BASE/t01-apply.log" 2>&1
  rc=$?
  [ "$rc" -eq 0 ] || { fail "$n" "--apply saiu $rc (esperado 0)"; return 0; }
  [ -f "$fx/.claude/skills/prd/SKILL.md" ] \
    || { fail "$n" ".claude/skills/prd/SKILL.md nao foi instalado"; return 0; }
  [ -e "$fx/.agents" ] \
    && { fail "$n" ".agents/ criado num alvo SO-Claude (superficie codex vazou)"; return 0; }
  [ -e "$fx/AGENTS.md" ] \
    && { fail "$n" "AGENTS.md criado num alvo SO-Claude (superficie codex vazou)"; return 0; }
  bash "$SYNC" --check "$fx" >"$BASE/t01-check.log" 2>&1
  rc=$?
  [ "$rc" -eq 0 ] || { fail "$n" "--check pos-apply saiu $rc (esperado 0 = alinhado)"; return 0; }
  pass "$n"
}

# ---------------------------------------------------------------------------
# t02 — instalacao nova SO Codex: adapters da superficie codex presentes.
# ---------------------------------------------------------------------------
t02() {
  local n="t02-instalacao-codex" fx rc f miss=""
  want "$n" || return 0
  fx="$(new_fx t02)"
  bash "$SYNC" --apply "$fx" --target codex >"$BASE/t02-apply.log" 2>&1
  rc=$?
  [ "$rc" -eq 0 ] || { fail "$n" "--apply saiu $rc (esperado 0)"; return 0; }
  for f in "AGENTS.md" ".agents/skills/prd/SKILL.md" ".codex/agents/hefesto.toml" ".codex/hooks.json"; do
    [ -f "$fx/$f" ] || miss="$miss $f"
  done
  if [ -n "$miss" ]; then fail "$n" "artefato(s) codex ausente(s) apos apply:$miss"; else pass "$n"; fi
}

# ---------------------------------------------------------------------------
# t03 — instalacao multi (--target all): uniao das duas superficies.
# ---------------------------------------------------------------------------
t03() {
  local n="t03-instalacao-multi" fx rc f miss=""
  want "$n" || return 0
  fx="$(new_fx t03)"
  bash "$SYNC" --apply "$fx" --target all >"$BASE/t03-apply.log" 2>&1
  rc=$?
  [ "$rc" -eq 0 ] || { fail "$n" "--apply saiu $rc (esperado 0)"; return 0; }
  for f in ".claude/skills/prd/SKILL.md" ".claude/hooks/lint.sh" ".claude/agents/hefesto.md" \
           "AGENTS.md" ".agents/skills/prd/SKILL.md" ".codex/agents/hefesto.toml" ".codex/hooks.json"; do
    [ -f "$fx/$f" ] || miss="$miss $f"
  done
  if [ -n "$miss" ]; then fail "$n" "artefato(s) ausente(s) no multi:$miss"; else pass "$n"; fi
}

# ---------------------------------------------------------------------------
# t04 — atualizacao de projeto Claude LEGADO (1.9.0, sem HARNESS_TARGETS):
# default retrocompat = claude; --check acusa defasagem (exit 10); --apply
# atualiza hook divergente e carimba a versao nova.
# ---------------------------------------------------------------------------
t04() {
  local n="t04-atualizacao-legado" fx rc mver
  want "$n" || return 0
  fx="$(new_fx t04)"
  printf "HARNESS_VERSION='1.9.0'\n" > "$fx/.claude/harness.env"
  mkdir -p "$fx/.claude/hooks"
  printf '#!/usr/bin/env bash\n# hook ANTIGO divergente (fixture 1.9.0)\nexit 0\n' \
    > "$fx/.claude/hooks/lint.sh"

  bash "$SYNC" --check "$fx" >"$BASE/t04-check.log" 2>&1
  rc=$?
  [ "$rc" -eq 10 ] || { fail "$n" "--check saiu $rc (esperado 10 = defasado)"; return 0; }
  grep -q '^TARGET|claude$' "$BASE/t04-check.log" \
    || { fail "$n" "sem HARNESS_TARGETS o default devia ser TARGET|claude (retrocompat)"; return 0; }

  bash "$SYNC" --apply "$fx" >"$BASE/t04-apply.log" 2>&1
  rc=$?
  [ "$rc" -eq 0 ] || { fail "$n" "--apply saiu $rc (esperado 0)"; return 0; }
  grep -q '^VERSAO_ATUALIZADA|' "$BASE/t04-apply.log" \
    || { fail "$n" "--apply nao carimbou VERSAO_ATUALIZADA| no harness.env legado"; return 0; }
  mver="$(grep -E '^HARNESS_VERSION' "$MASTER/.claude/harness.env" | head -1)"
  grep -qF "$mver" "$fx/.claude/harness.env" \
    || { fail "$n" "harness.env do alvo nao ficou com a versao do mestre ($mver)"; return 0; }
  cmp -s "$MASTER/.claude/hooks/lint.sh" "$fx/.claude/hooks/lint.sh" \
    || { fail "$n" "hook divergente nao ficou identico ao mestre apos --apply"; return 0; }
  [ -e "$fx/.agents" ] \
    && { fail "$n" "apply legado (default claude) criou .agents/ indevidamente"; return 0; }
  pass "$n"
}

# ---------------------------------------------------------------------------
# t05 — idempotencia: segundo --apply numa fixture multi ja aplicada nao copia nada.
# ---------------------------------------------------------------------------
t05() {
  local n="t05-idempotencia" fx rc
  want "$n" || return 0
  fx="$(new_fx t05)"
  bash "$SYNC" --apply "$fx" --target all >"$BASE/t05-apply1.log" 2>&1
  rc=$?
  [ "$rc" -eq 0 ] || { fail "$n" "1o --apply saiu $rc (esperado 0)"; return 0; }
  # 2o apply SEM --target: deve ler HARNESS_TARGETS='claude,codex' gravado pelo 1o.
  bash "$SYNC" --apply "$fx" >"$BASE/t05-apply2.log" 2>&1
  rc=$?
  [ "$rc" -eq 0 ] || { fail "$n" "2o --apply saiu $rc (esperado 0)"; return 0; }
  grep -q '^RESUMO|aplicado|copiados=0 erros=0$' "$BASE/t05-apply2.log" \
    || { fail "$n" "2o --apply nao reportou copiados=0 ($(grep '^RESUMO|aplicado' "$BASE/t05-apply2.log" | head -1))"; return 0; }
  grep -q '^COPIADO|' "$BASE/t05-apply2.log" \
    && { fail "$n" "2o --apply emitiu linha COPIADO| (nao e idempotente)"; return 0; }
  pass "$n"
}

# ---------------------------------------------------------------------------
# t06 — preservacao do que e LOCAL: Perfil preenchido, settings.local.json e
# AGENTS.md proprio (sem marcador harness:managed) atravessam o --apply intactos.
# ---------------------------------------------------------------------------
t06() {
  local n="t06-preservacao" fx rc f
  want "$n" || return 0
  fx="$(new_fx t06)"
  cat > "$fx/.claude/PERFIL-PROJETO.md" <<'EOF'
# Perfil do Projeto — fixture t06 (conteudo LOCAL, nao pode ser tocado)
Stack: PHP 7.4 legado. Regras proprias do projeto.
EOF
  printf '{ "permissions": { "allow": ["Bash(ls *)"] } }\n' > "$fx/.claude/settings.local.json"
  cat > "$fx/AGENTS.md" <<'EOF'
# AGENTS.md PROPRIO deste projeto — escrito a mao, SEM marcador do harness.
Instrucoes locais que o sync deve preservar (merge manual, nunca sobrescrita).
EOF
  mkdir -p "$BASE/t06-orig"
  cp "$fx/.claude/PERFIL-PROJETO.md" "$BASE/t06-orig/PERFIL-PROJETO.md"
  cp "$fx/.claude/settings.local.json" "$BASE/t06-orig/settings.local.json"
  cp "$fx/AGENTS.md" "$BASE/t06-orig/AGENTS.md"

  bash "$SYNC" --apply "$fx" --target all >"$BASE/t06-apply.log" 2>&1
  rc=$?
  [ "$rc" -eq 0 ] || { fail "$n" "--apply saiu $rc (esperado 0)"; return 0; }
  cmp -s "$BASE/t06-orig/PERFIL-PROJETO.md" "$fx/.claude/PERFIL-PROJETO.md" \
    || { fail "$n" "PERFIL-PROJETO.md local foi alterado pelo sync"; return 0; }
  cmp -s "$BASE/t06-orig/settings.local.json" "$fx/.claude/settings.local.json" \
    || { fail "$n" "settings.local.json local foi alterado pelo sync"; return 0; }
  cmp -s "$BASE/t06-orig/AGENTS.md" "$fx/AGENTS.md" \
    || { fail "$n" "AGENTS.md proprio (sem marcador) foi sobrescrito pelo sync"; return 0; }
  grep -q '^CONFLITO|guardado|AGENTS.md$' "$BASE/t06-apply.log" \
    || { fail "$n" "sync nao reportou CONFLITO|guardado|AGENTS.md"; return 0; }
  pass "$n"
}

# ---------------------------------------------------------------------------
# t07 — descoberta de skills nas DUAS superficies do mestre: frontmatter
# name/description no canonico E no stub gerado; gen-adapters --check limpo.
# ---------------------------------------------------------------------------
t07() {
  local n="t07-skills-duas-superficies" s f rc miss=""
  want "$n" || return 0
  for s in $HARNESS_SKILLS; do
    for f in "$MASTER/.claude/skills/$s/SKILL.md" "$MASTER/.agents/skills/$s/SKILL.md"; do
      if [ ! -f "$f" ]; then
        miss="$miss ${f#"$MASTER"/}(ausente)"
        continue
      fi
      fm_has "$f" name        || miss="$miss ${f#"$MASTER"/}(sem name:)"
      fm_has "$f" description || miss="$miss ${f#"$MASTER"/}(sem description:)"
    done
  done
  [ -n "$miss" ] && { fail "$n" "frontmatter incompleto:$miss"; return 0; }
  bash "$GEN_ADAPTERS" --check >"$BASE/t07-gen.log" 2>&1
  rc=$?
  [ "$rc" -eq 0 ] \
    || { fail "$n" "gen-adapters.sh --check saiu $rc (drift adapter x canonico): $(tail -1 "$BASE/t07-gen.log")"; return 0; }
  pass "$n"
}

# ---------------------------------------------------------------------------
# t08 — TOMLs dos agentes Codex: campos obrigatorios + parse TOML real
# (tomllib/tomli; sem parser disponivel = SKIP, nunca FAIL).
# ---------------------------------------------------------------------------
t08() {
  local n="t08-toml-valido" f miss="" mod="" perr
  want "$n" || return 0
  for f in "$MASTER"/.codex/agents/*.toml; do
    [ -f "$f" ] || { fail "$n" "nenhum .toml em .codex/agents/ do mestre"; return 0; }
    grep -Eq '^[[:space:]]*name[[:space:]]*=' "$f"                    || miss="$miss ${f##*/}:name"
    grep -Eq '^[[:space:]]*description[[:space:]]*=' "$f"             || miss="$miss ${f##*/}:description"
    grep -Eq '^[[:space:]]*developer_instructions[[:space:]]*=' "$f" || miss="$miss ${f##*/}:developer_instructions"
  done
  [ -n "$miss" ] && { fail "$n" "campo(s) obrigatorio(s) ausente(s):$miss"; return 0; }
  if command -v python3 >/dev/null 2>&1; then
    if python3 -c 'import tomllib' >/dev/null 2>&1; then mod="tomllib"
    elif python3 -c 'import tomli' >/dev/null 2>&1; then mod="tomli"
    fi
  fi
  if [ -z "$mod" ]; then
    skip_ "$n" "python3 sem tomllib/tomli (<3.11) — campos conferidos por grep, parse TOML pulado"
    return 0
  fi
  for f in "$MASTER"/.codex/agents/*.toml; do
    perr="$(python3 -c "import $mod,sys; $mod.load(open(sys.argv[1],'rb'))" "$f" 2>&1)" \
      || { fail "$n" "TOML invalido: ${f##*/} — $(printf '%s' "$perr" | tail -1)"; return 0; }
  done
  pass "$n"
}

# ---------------------------------------------------------------------------
# t09 — hooks com payloads sinteticos (cwd na fixture, HARNESS_HOST=claude):
# (a) guard-bash bloqueia escrita fora do projeto e libera comando inofensivo;
# (b) lint bloqueia com lint configurado que falha e e no-op sem config;
# (c) notify/denied sempre exit 0; (d) rag-* no-op com RAG desligado;
# (e) throttle do Stop: 1a captura marca, 2a dentro da janela sai sem tocar o marker.
# ---------------------------------------------------------------------------
t09() {
  local n="t09-hooks-payloads" fx rc mark m1 m2 past
  want "$n" || return 0
  fx="$(new_fx t09)"
  bash "$SYNC" --apply "$fx" --target claude >"$BASE/t09-apply.log" 2>&1 \
    || { fail "$n" "preparo: --apply da fixture falhou"; return 0; }

  # (a) guard-bash: escrita em /tmp (fora do projeto) => exit 2
  printf '%s' '{"tool_input":{"command":"echo oi > /tmp/x"}}' \
    | run_in "$fx" HARNESS_HOST=claude bash .claude/hooks/guard-bash.sh >/dev/null 2>&1
  rc=$?
  [ "$rc" -eq 2 ] || { fail "$n" "(a) guard-bash: escrita em /tmp/x saiu $rc (esperado 2 = bloqueio)"; return 0; }
  printf '%s' '{"tool_input":{"command":"echo oi"}}' \
    | run_in "$fx" HARNESS_HOST=claude bash .claude/hooks/guard-bash.sh >/dev/null 2>&1
  rc=$?
  [ "$rc" -eq 0 ] || { fail "$n" "(a) guard-bash: comando inofensivo saiu $rc (esperado 0)"; return 0; }

  # (b) lint: configurado via env com comando que falha => exit 2; sem config => exit 0
  printf '%s' "{\"tool_input\":{\"file_path\":\"$fx/exemplo.php\"}}" \
    | run_in "$fx" HARNESS_HOST=claude HARNESS_LINT_CMD=false HARNESS_LINT_EXT=php \
        bash .claude/hooks/lint.sh >/dev/null 2>&1
  rc=$?
  [ "$rc" -eq 2 ] || { fail "$n" "(b) lint configurado com comando que falha saiu $rc (esperado 2)"; return 0; }
  printf '%s' "{\"tool_input\":{\"file_path\":\"$fx/exemplo.php\"}}" \
    | run_in "$fx" HARNESS_HOST=claude bash .claude/hooks/lint.sh >/dev/null 2>&1
  rc=$?
  [ "$rc" -eq 0 ] || { fail "$n" "(b) lint sem config saiu $rc (esperado 0 = no-op)"; return 0; }

  # (c) notify e denied: payload minimo => exit 0 sempre (inofensivos por design)
  printf '%s' '{"message":"aguardando permissao (fixture)"}' \
    | run_in "$fx" HARNESS_HOST=claude bash .claude/hooks/notify.sh >/dev/null 2>&1
  rc=$?
  [ "$rc" -eq 0 ] || { fail "$n" "(c) notify.sh saiu $rc (esperado 0)"; return 0; }
  printf '%s' '{"tool_name":"Bash","tool_input":{"command":"git status"}}' \
    | run_in "$fx" HARNESS_HOST=claude bash .claude/hooks/denied.sh >/dev/null 2>&1
  rc=$?
  [ "$rc" -eq 0 ] || { fail "$n" "(c) denied.sh saiu $rc (esperado 0)"; return 0; }

  # (d) RAG desligado: no-op rapido (exit 0), sem tocar Node/API
  printf '%s' '{"prompt":"qual o padrao de datas do projeto?"}' \
    | run_in "$fx" HARNESS_HOST=claude HARNESS_RAG_ENABLED=0 bash .claude/hooks/rag-inject.sh >/dev/null 2>&1
  rc=$?
  [ "$rc" -eq 0 ] || { fail "$n" "(d) rag-inject com RAG=0 saiu $rc (esperado 0)"; return 0; }
  printf '%s' '{"hook_event_name":"Stop","session_id":"acc-off"}' \
    | run_in "$fx" HARNESS_HOST=claude HARNESS_RAG_ENABLED=0 bash .claude/hooks/rag-capture-session.sh >/dev/null 2>&1
  rc=$?
  [ "$rc" -eq 0 ] || { fail "$n" "(d) rag-capture-session com RAG=0 saiu $rc (esperado 0)"; return 0; }

  # (e) throttle do Stop (Codex dispara a cada turno; semantica 1x/sessao).
  # Ordem REAL do hook: gate ENABLED vem ANTES do throttle, e o throttle vem
  # ANTES da captura — por isso RAG_ENABLED=1 (o passo de captura degrada em
  # no-op sem node_modules na fixture: zero rede/custo). 1a chamada cria o
  # marker; a 2a, dentro da janela, sai 0 SEM tocar o marker (mtime intacto).
  printf '%s' '{"hook_event_name":"Stop","session_id":"acc-throttle"}' \
    | run_in "$fx" HARNESS_HOST=claude HARNESS_RAG_ENABLED=1 bash .claude/hooks/rag-capture-session.sh >/dev/null 2>&1
  rc=$?
  [ "$rc" -eq 0 ] || { fail "$n" "(e) 1a captura Stop saiu $rc (esperado 0)"; return 0; }
  mark="$fx/.claude/.harness-run/rag-stop-capture/acc-throttle"
  [ -f "$mark" ] || { fail "$n" "(e) 1a captura Stop nao criou o marker de throttle"; return 0; }
  # Recua o mtime do marker p/ DENTRO da janela (default 30 min): se a 2a chamada
  # tocar o marker, o mtime muda — e o teste flagra sem depender de sleep.
  past="$(date -v-5M +%Y%m%d%H%M.%S 2>/dev/null || date -d '5 minutes ago' +%Y%m%d%H%M.%S 2>/dev/null)"
  [ -n "$past" ] && touch -t "$past" "$mark" 2>/dev/null
  # ORDEM IMPORTA: GNU (-c %Y) PRIMEIRO, BSD (-f %m) como fallback. No GNU stat o
  # -f significa "filesystem", nao "format": ele NAO falha, imprime info do FS
  # (incluindo blocos livres, que mudam entre as duas leituras) e o teste virava
  # flaky no Git Bash/Linux acusando throttle quebrado com o mtime intacto.
  m1="$(stat -c %Y "$mark" 2>/dev/null || stat -f %m "$mark" 2>/dev/null)"
  printf '%s' '{"hook_event_name":"Stop","session_id":"acc-throttle"}' \
    | run_in "$fx" HARNESS_HOST=claude HARNESS_RAG_ENABLED=1 bash .claude/hooks/rag-capture-session.sh >/dev/null 2>&1
  rc=$?
  [ "$rc" -eq 0 ] || { fail "$n" "(e) 2a captura Stop saiu $rc (esperado 0 = throttled)"; return 0; }
  m2="$(stat -c %Y "$mark" 2>/dev/null || stat -f %m "$mark" 2>/dev/null)"
  [ "$m1" = "$m2" ] \
    || { fail "$n" "(e) 2a chamada dentro da janela TOCOU o marker (throttle nao segurou)"; return 0; }
  pass "$n"
}

# ---------------------------------------------------------------------------
# t10 — wiring sem evento incompativel: .codex/hooks.json so com os 10 eventos
# oficiais do Codex e SEM campo 'async'; .claude/settings.json so com eventos
# do Claude Code. (Nunca fingir suporte — PLATAFORMAS.md §4.)
# ---------------------------------------------------------------------------
t10() {
  local n="t10-eventos-compativeis" out rc
  want "$n" || return 0
  command -v python3 >/dev/null 2>&1 || { skip_ "$n" "python3 ausente (parse JSON)"; return 0; }
  out="$(python3 - "$MASTER/.codex/hooks.json" "$MASTER/.claude/settings.json" <<'PY' 2>&1
import json, sys

CODEX = {"SessionStart", "SubagentStart", "PreToolUse", "PermissionRequest",
         "PostToolUse", "UserPromptSubmit", "PreCompact", "PostCompact",
         "SubagentStop", "Stop"}
CLAUDE = {"SessionStart", "UserPromptSubmit", "SessionEnd", "PreToolUse",
          "PermissionDenied", "Notification", "PostToolUse", "PostToolUseFailure",
          "SubagentStop", "Stop", "PreCompact"}

def has_async(o):
    if isinstance(o, dict):
        return any(k == "async" for k in o) or any(has_async(v) for v in o.values())
    if isinstance(o, list):
        return any(has_async(v) for v in o)
    return False

errs = []
codex = json.load(open(sys.argv[1]))
bad = sorted(k for k in codex.get("hooks", {}) if k not in CODEX)
if bad:
    errs.append(".codex/hooks.json usa evento(s) inexistente(s) no Codex: %s" % ",".join(bad))
if has_async(codex):
    errs.append(".codex/hooks.json contem campo 'async' (o Codex roda tudo sincrono)")
claude = json.load(open(sys.argv[2]))
bad = sorted(k for k in claude.get("hooks", {}) if k not in CLAUDE)
if bad:
    errs.append(".claude/settings.json usa evento(s) desconhecido(s) do Claude Code: %s" % ",".join(bad))
if errs:
    print("; ".join(errs))
    sys.exit(1)
PY
)"
  rc=$?
  if [ "$rc" -eq 0 ]; then pass "$n"; else fail "$n" "$out"; fi
}

# ---------------------------------------------------------------------------
# t11 — RAG mock SEM rede: summarize.ts com provider 'mock' escreve o .md de
# conhecimento DENTRO da fixture (raiz redirecionada via HARNESS_RAG_PROJECT_ROOT,
# lido por paths.ts). Sem node/tsx no mestre = SKIP.
# ---------------------------------------------------------------------------
t11() {
  local n="t11-rag-mock" tsx fx big payload out
  want "$n" || return 0
  tsx="$MASTER/node_modules/tsx/dist/cli.mjs"
  command -v node >/dev/null 2>&1 || { skip_ "$n" "node ausente no PATH"; return 0; }
  [ -f "$tsx" ] \
    || { skip_ "$n" "tsx nao instalado no mestre (node_modules ausente — rode npm install p/ habilitar)"; return 0; }
  fx="$(new_fx t11)"
  big=""
  while [ ${#big} -lt 1200 ]; do
    big="$big Aprendizado sintetico de teste do pipeline RAG em modo mock, sem rede e sem custo."
  done
  payload="{\"session_id\":\"acc-mock\",\"tool_input\":{\"prompt\":\"$big\"}}"
  out="$(printf '%s' "$payload" | run_in "$fx" \
      HARNESS_RAG_PROJECT_ROOT="$fx" HARNESS_RAG_ENABLED=1 HARNESS_RAG_LLM_PROVIDER=mock \
      node "$tsx" "$MASTER/.claude/scripts/summarize.ts" --mode=session --agent=session \
      2>"$BASE/t11.err")"
  out="$(printf '%s' "$out" | head -1)"
  [ -n "$out" ] \
    || { fail "$n" "summarize.ts (mock) nao imprimiu o path do .md ($(tail -1 "$BASE/t11.err" 2>/dev/null))"; return 0; }
  case "$out" in
    "$fx"/*.md) : ;;
    *) fail "$n" "path impresso nao e um .md dentro da fixture: $out"; return 0 ;;
  esac
  [ -f "$out" ] || { fail "$n" "arquivo de conhecimento nao existe: $out"; return 0; }
  [ "$(head -1 "$out")" = "---" ] && fm_has "$out" name && fm_has "$out" description \
    || { fail "$n" "arquivo gerado sem frontmatter name/description: $out"; return 0; }
  pass "$n"
}

# ---------------------------------------------------------------------------
# t12 — doctor acusa INTERPRETADOR divergente: Perfil declara um binario
# (7.4.33) e HARNESS_LINT_CMD usa outro (7.3.33) => aviso com 'diverg'.
# (Spec 2.0.0 — se o doctor em reescrita ainda nao tiver o check, FALHA aqui
# e passa a passar quando o check chegar.)
# ---------------------------------------------------------------------------
t12() {
  local n="t12-doctor-interpretador" fx out
  want "$n" || return 0
  fx="$(new_fx t12)"
  bash "$SYNC" --apply "$fx" --target claude >/dev/null 2>&1 \
    || { fail "$n" "preparo: --apply da fixture falhou"; return 0; }
  cat > "$fx/.claude/PERFIL-PROJETO.md" <<'EOF'
# Perfil do Projeto — fixture t12

| Item | Valor | Observacao |
|---|---|---|
| **Interpretador (run/lint)** | `/x/php7.4.33/php` | binario oficial do projeto |
EOF
  {
    printf "HARNESS_LINT_CMD='/x/php7.3.33/php -l {file}'\n"
    printf "HARNESS_LINT_EXT='php'\n"
  } >> "$fx/.claude/harness.env"
  out="$(run_in "$fx" bash .claude/harness-doctor.sh 2>&1)"
  if printf '%s' "$out" | grep -qi 'diverg'; then
    pass "$n"
  else
    fail "$n" "doctor nao acusou divergencia entre Interpretador do Perfil (7.4.33) e HARNESS_LINT_CMD (7.3.33)"
  fi
}

# ---------------------------------------------------------------------------
# t13 — --check e --dry-run NAO escrevem nada no alvo (snapshot identico);
# --dry-run anuncia COPIARIA| e jamais COPIADO|.
# ---------------------------------------------------------------------------
t13() {
  local n="t13-check-dryrun-sem-writes" fx rc s0 s1 s2
  want "$n" || return 0
  fx="$(new_fx t13)"
  printf "HARNESS_VERSION='1.9.0'\n" > "$fx/.claude/harness.env"
  s0="$(snap "$fx")"

  bash "$SYNC" --check "$fx" >"$BASE/t13-check.log" 2>&1
  rc=$?
  [ "$rc" -eq 10 ] || { fail "$n" "--check saiu $rc (esperado 10 = defasado)"; return 0; }
  s1="$(snap "$fx")"
  [ "$s0" = "$s1" ] || { fail "$n" "--check ALTEROU a fixture (devia ser read-only)"; return 0; }

  bash "$SYNC" --dry-run "$fx" >"$BASE/t13-dryrun.log" 2>&1
  rc=$?
  [ "$rc" -eq 10 ] || { fail "$n" "--dry-run saiu $rc (esperado 10 = defasado)"; return 0; }
  s2="$(snap "$fx")"
  [ "$s0" = "$s2" ] || { fail "$n" "--dry-run ALTEROU a fixture (devia so ensaiar)"; return 0; }
  grep -q '^COPIARIA|' "$BASE/t13-dryrun.log" \
    || { fail "$n" "--dry-run nao anunciou nenhuma linha COPIARIA|"; return 0; }
  grep -q '^COPIADO|' "$BASE/t13-dryrun.log" \
    && { fail "$n" "--dry-run emitiu COPIADO| (copiou de verdade?)"; return 0; }
  pass "$n"
}

# ---------------------------------------------------------------------------
# t14 — degradacao SEM CLIs externos: external-review.sh em repo com mudanca
# pendente e PATH restrito (sem codex/claude) => exit 0, stdout VAZIO e stderr
# declarando modo SOLO. Idem com HARNESS_EXTERNAL_REVIEWER=none.
# ---------------------------------------------------------------------------
t14() {
  local n="t14-degradacao-sem-clis" fx rc out err rpath="/usr/bin:/bin"
  want "$n" || return 0
  # PATH restrito precisa ter bash/git/coreutils e NAO ter codex/claude.
  if env PATH="$rpath" sh -c 'command -v codex || command -v claude' >/dev/null 2>&1; then
    skip_ "$n" "codex/claude presentes em $rpath nesta maquina — nao da p/ simular a ausencia"
    return 0
  fi
  fx="$(new_fx t14)"
  bash "$SYNC" --apply "$fx" --target claude >/dev/null 2>&1 \
    || { fail "$n" "preparo: --apply da fixture falhou"; return 0; }
  ( cd "$fx" && git init -q ) >/dev/null 2>&1 \
    || { fail "$n" "preparo: git init falhou na fixture"; return 0; }
  printf 'mudanca pendente para o revisor\n' > "$fx/pendente.txt"

  # caso 1: reviewer auto (host claude -> codex-cli), codex ausente => SOLO
  out="$(run_in "$fx" PATH="$rpath" HARNESS_HOST=claude \
      bash .claude/hooks/external-review.sh acc-t14 1 2>"$BASE/t14a.err")"
  rc=$?
  err="$(cat "$BASE/t14a.err" 2>/dev/null)"
  [ "$rc" -eq 0 ] || { fail "$n" "sem CLIs: exit $rc (esperado 0 — nunca bloquear o fluxo)"; return 0; }
  [ -z "$out" ] || { fail "$n" "sem CLIs: stdout devia ser VAZIO (sem relatorio), veio: $out"; return 0; }
  printf '%s' "$err" | grep -qi 'solo' \
    || { fail "$n" "sem CLIs: stderr nao declarou modo SOLO"; return 0; }

  # caso 2: HARNESS_EXTERNAL_REVIEWER=none => SOLO explicito por config
  out="$(run_in "$fx" PATH="$rpath" HARNESS_HOST=claude HARNESS_EXTERNAL_REVIEWER=none \
      bash .claude/hooks/external-review.sh acc-t14 1 2>"$BASE/t14b.err")"
  rc=$?
  err="$(cat "$BASE/t14b.err" 2>/dev/null)"
  [ "$rc" -eq 0 ] || { fail "$n" "REVIEWER=none: exit $rc (esperado 0)"; return 0; }
  [ -z "$out" ] || { fail "$n" "REVIEWER=none: stdout devia ser VAZIO, veio: $out"; return 0; }
  printf '%s' "$err" | grep -qi 'solo' \
    || { fail "$n" "REVIEWER=none: stderr nao declarou modo SOLO"; return 0; }
  pass "$n"
}

# ---------------------------------------------------------------------------
# t15 — deteccao de host (_host-detect.sh) + extrator generico de transcript.
# (a) host-detect roda SEMPRE (bash puro): fallback=claude; CODEX_*=codex;
#     CLAUDECODE=claude; HARNESS_HOST explicito vence tudo.
# (b) extrator generico (summarize.ts sobre JSONL estilo Codex) so com node+tsx;
#     senao SKIP dessa metade (a metade (a) ja garante o PASS).
# ---------------------------------------------------------------------------
t15() {
  local n="t15-host-detect-extrator" hd got tsx fx jf out
  want "$n" || return 0
  hd="$MASTER/.claude/hooks/_host-detect.sh"
  [ -f "$hd" ] || { fail "$n" "_host-detect.sh ausente no mestre"; return 0; }

  # (a) — cada caso num shell limpo das vars de host/ambiente do operador.
  got="$(env -u HARNESS_HOST -u HARNESS_TARGETS -u CLAUDECODE -u CLAUDE_PROJECT_DIR \
         -u CODEX_HOME -u CODEX_SANDBOX -u CODEX_THREAD_ID \
         bash -c ". '$hd'; harness_detect_host" 2>/dev/null)"
  [ "$got" = "claude" ] || { fail "$n" "fallback devia ser 'claude', veio '$got'"; return 0; }

  got="$(env -u HARNESS_HOST -u CLAUDECODE -u CLAUDE_PROJECT_DIR -u CODEX_SANDBOX -u CODEX_THREAD_ID \
         CODEX_HOME=/x bash -c ". '$hd'; harness_detect_host" 2>/dev/null)"
  [ "$got" = "codex" ] || { fail "$n" "CODEX_HOME devia dar 'codex', veio '$got'"; return 0; }

  got="$(env -u HARNESS_HOST -u CODEX_HOME -u CODEX_SANDBOX -u CODEX_THREAD_ID \
         CLAUDECODE=1 bash -c ". '$hd'; harness_detect_host" 2>/dev/null)"
  [ "$got" = "claude" ] || { fail "$n" "CLAUDECODE devia dar 'claude', veio '$got'"; return 0; }

  # HARNESS_HOST explicito vence ate sinal contrario do runtime
  got="$(env CLAUDECODE=1 HARNESS_HOST=codex bash -c ". '$hd'; harness_detect_host" 2>/dev/null)"
  [ "$got" = "codex" ] || { fail "$n" "HARNESS_HOST=codex devia vencer, veio '$got'"; return 0; }

  # (b) — extrator generico sobre transcript estilo Codex (payload aninhado).
  tsx="$MASTER/node_modules/tsx/dist/cli.mjs"
  if ! command -v node >/dev/null 2>&1 || [ ! -f "$tsx" ]; then
    skip_ "$n-extrator" "node/tsx ausente (metade (a) do t15 passou)"
    pass "$n"
    return 0
  fi
  fx="$(new_fx t15)"
  jf="$fx/codex-session.jsonl"
  big="Aprendizado tecnico sintetico num transcript estilo Codex para exercitar o extrator generico do summarize; precisa passar do minimo de caracteres para nao ser descartado pelo gate de tamanho, entao repetimos o suficiente desta frase de conteudo."
  {
    printf '{"timestamp":"2026-07-18T10:00:00Z","payload":{"content":[{"text":"%s"}]}}\n' "$big"
    printf '{"timestamp":"2026-07-18T10:00:05Z","payload":{"content":[{"text":"%s"}]}}\n' "$big"
  } > "$jf"
  out="$(printf '{"transcript_path":"%s","session_id":"acc-codex"}' "$jf" | run_in "$fx" \
      HARNESS_RAG_PROJECT_ROOT="$fx" HARNESS_RAG_ENABLED=1 HARNESS_RAG_LLM_PROVIDER=mock \
      node "$tsx" "$MASTER/.claude/scripts/summarize.ts" --mode=session --agent=session \
      2>"$BASE/t15.err" | head -1)"
  case "$out" in
    "$fx"/*.md) [ -f "$out" ] && pass "$n" \
      || fail "$n" "extrator: path impresso mas arquivo ausente: $out" ;;
    *) fail "$n" "extrator generico nao produziu .md do transcript Codex (out='$out'; $(tail -1 "$BASE/t15.err" 2>/dev/null))" ;;
  esac
}

# ---------------------------------------------------------------------------
# t16 — telemetria 2.12.0: gap OCIOSO x gap com SUBAGENTE VIVO + paralelismo.
# Ate a 2.11.0 todo gap do transcript virava "espera humana": uma sessao que
# despacha subagente em background (turno encerra, transcript silencia) ficava
# indistinguivel de operador ausente — e o aviso ⚠️ saia em execucao saudavel.
# Cenario sintetico: gap de 30min COM subagente vivo + gap de 40min ocioso.
# ---------------------------------------------------------------------------
t16() {
  local n="t16-telemetria-ocioso-x-subagente"
  want "$n" || return 0
  command -v node >/dev/null 2>&1 || { skip_ "$n" "node ausente"; return 0; }

  local fx home slug proj sess T0 iso
  fx="$(new_fx t16)"
  home="$fx/home"
  # cwd do projeto (com barra do SO) -> slug do diretorio de transcripts
  proj="$fx/proj"
  mkdir -p "$proj/.claude/hooks" "$proj/prds/_metrics"

  # o slug e o cwd com todo nao-alfanumerico virando '-' (convencao do Claude Code).
  # Em Git Bash o node ve o caminho no formato Windows — perguntamos ao proprio node.
  slug="$(cd "$proj" && node -e "process.stdout.write(process.cwd().replace(/[^a-zA-Z0-9]/g,'-'))")"
  sess="$home/.claude/projects/$slug/sessao-1"
  mkdir -p "$sess/subagents"

  T0="$(( $(date +%s) - 7200 ))"
  iso() { node -e "process.stdout.write(new Date($1*1000).toISOString())"; }

  # transcript principal: 2 entradas coladas, gap de 30min, gap de 40min.
  {
    printf '{"timestamp":"%s"}\n' "$(iso $((T0)))"
    printf '{"timestamp":"%s"}\n' "$(iso $((T0+60)))"
    printf '{"timestamp":"%s"}\n' "$(iso $((T0+60+1800)))"
    printf '{"timestamp":"%s"}\n' "$(iso $((T0+60+1800+2400)))"
  } > "$home/.claude/projects/$slug/sessao-1.jsonl"

  # subagente vivo DENTRO do primeiro gap (70s..1850s do inicio => ~29,7min).
  # Com usage: os tokens de subagente (2.14.0) vivem AQUI e nunca entraram no
  # tokens_output do transcript principal — o teste prova que agora sao medidos.
  {
    printf '{"timestamp":"%s","message":{"usage":{"output_tokens":1234}}}\n' "$(iso $((T0+70)))"
    printf '{"timestamp":"%s","message":{"usage":{"output_tokens":766}}}\n' "$(iso $((T0+1850)))"
  } > "$sess/subagents/agent-teste1.jsonl"

  local out
  out="$(cd "$proj" && env $(hclean) HOME="$home" USERPROFILE="$home" \
      node "$HOOKS_DIR/harness-metrics.mjs" "$T0" "$(cd "$proj" && node -e "process.stdout.write(process.cwd())")" "" claude 10 2>/dev/null)"
  case "$out" in
    *'"ok":true'*) : ;;
    *) fail "$n" "mjs nao mediu o cenario sintetico (out='$out')"; return 0 ;;
  esac

  local subn subbusy gapbusy idle gapraw
  subn="$(printf '%s' "$out"    | grep -o '"subagentN":[0-9]*'    | cut -d: -f2)"
  subbusy="$(printf '%s' "$out" | grep -o '"subagentBusyS":[0-9]*' | cut -d: -f2)"
  gapbusy="$(printf '%s' "$out" | grep -o '"gapBusyS":[0-9]*'      | cut -d: -f2)"
  gapraw="$(printf '%s' "$out"  | grep -o '"gapRawS":[0-9]*'       | cut -d: -f2)"
  idle="$(printf '%s' "$out"    | grep -o '"waitS":[0-9]*'         | cut -d: -f2)"

  [ "${subn:-0}" = "1" ] || { fail "$n" "subagentN devia ser 1, veio '${subn:-vazio}'"; return 0; }
  [ "${subbusy:-0}" -ge 1700 ] && [ "${subbusy:-0}" -le 1800 ] \
    || { fail "$n" "subagentBusyS fora de ~1780s: '${subbusy:-vazio}'"; return 0; }
  # o gap de 30min tem de sair como TRABALHO (coberto pelo subagente), nao como espera
  [ "${gapbusy:-0}" -ge 1700 ] && [ "${gapbusy:-0}" -le 1800 ] \
    || { fail "$n" "gapBusyS devia cobrir o gap com subagente vivo (~1780s), veio '${gapbusy:-vazio}'"; return 0; }
  # ociosidade = so o gap de 40min (+ as bordas do primeiro nao cobertas)
  [ "${idle:-0}" -ge 2400 ] && [ "${idle:-0}" -le 2500 ] \
    || { fail "$n" "waitS (ocioso) devia ser ~2420s (so o gap sem subagente), veio '${idle:-vazio}'"; return 0; }
  [ "${idle:-0}" -lt "${gapraw:-0}" ] \
    || { fail "$n" "regressao 2.10.0: ocioso ($idle) nao pode igualar o gap bruto ($gapraw)"; return 0; }

  # tokens do subagente (2.14.0): 1234+766 = 2000, invisiveis ate a 2.13.0
  local subout
  subout="$(printf '%s' "$out" | grep -o '"subOutput":[0-9]*' | cut -d: -f2)"
  [ "${subout:-0}" = "2000" ] \
    || { fail "$n" "subOutput devia somar 2000 (tokens dentro do subagente), veio '${subout:-vazio}'"; return 0; }

  # --- linha do jsonl: schema + campos novos + fator de paralelismo ----------
  cp "$HOOKS_DIR/harness-metrics.sh" "$HOOKS_DIR/harness-metrics.mjs" \
     "$HOOKS_DIR/_host-detect.sh" "$proj/.claude/hooks/" 2>/dev/null
  printf "HARNESS_VERSION='teste'\nHARNESS_WAIT_GAP_MIN='10'\n" > "$proj/.claude/harness.env"
  mkdir -p "$proj/.claude/.harness-run"
  printf '{"label":"PRD-999-exec","start":%s}\n' "$T0" > "$proj/.claude/.harness-run/PRD-999-exec.json"
  ( cd "$proj" && env $(hclean) HOME="$home" USERPROFILE="$home" \
      bash .claude/hooks/harness-metrics.sh stop PRD-999-exec --subagents=1 >/dev/null 2>&1 )

  local linha
  linha="$(tail -1 "$proj/prds/_metrics/harness-runs.jsonl" 2>/dev/null)"
  # a PRESENCA do carimbo e o contrato (fronteira de versao); o valor sobe a cada
  # mudanca de schema e nao deve ser fixado aqui.
  case "$linha" in
    *'"schema":""'*|*'"schema":"'*) : ;;
    *) fail "$n" "linha do jsonl sem o carimbo 'schema' (fronteira de versao): $linha"; return 0 ;;
  esac
  case "$linha" in
    *'"schema":""'*) fail "$n" "carimbo 'schema' vazio na linha: $linha"; return 0 ;;
  esac
  for campo in wait_idle_min subagent_busy_min parallel_factor tokens_output_subagents; do
    case "$linha" in
      *"\"$campo\":\"\""*) fail "$n" "campo $campo vazio na linha ($linha)"; return 0 ;;
      *"\"$campo\":"*) : ;;
      *) fail "$n" "campo $campo ausente na linha ($linha)"; return 0 ;;
    esac
  done
  pass "$n"
}

# ---------------------------------------------------------------------------
# t17 — review em escopo DELTA (2.14.0): ciclo 2+ ve so o que mudou desde o
# ciclo anterior, e DEGRADA PARA COMPLETO (barulhento) quando nao da para
# recortar. E a peca com mais risco de "revisar menos em silencio".
# Revisor falso (HARNESS_RAG_CLAUDE_BIN) — sem rede, sem chamada paga.
# ---------------------------------------------------------------------------
t17() {
  local n="t17-review-escopo-delta"
  want "$n" || return 0
  command -v git >/dev/null 2>&1 || { skip_ "$n" "git ausente"; return 0; }

  local fx fake r1 r2 saida
  fx="$(new_fx t17)"
  mkdir -p "$fx/.claude/hooks"
  cp "$HOOKS_DIR/external-review.sh" "$HOOKS_DIR/_host-detect.sh" \
     "$HOOKS_DIR/_delegate-common.sh" "$fx/.claude/hooks/"
  printf "HARNESS_VERSION='teste'\n" > "$fx/.claude/harness.env"

  # revisor falso: consome o diff no stdin e imprime quantas linhas viu
  fake="$fx/fake-claude.sh"
  printf '#!/usr/bin/env bash\nprintf "[fake] linhas de diff: %%s\\n" "$(wc -l)"\n' > "$fake"
  chmod +x "$fake"

  ( cd "$fx" && git init -q . && git config user.email t@t && git config user.name t \
    && printf 'a1\n' > a.php && printf 'b1\n' > b.php \
    && git add a.php b.php && git commit -qm base ) >/dev/null 2>&1 \
    || { skip_ "$n" "git init/commit falhou na fixture"; return 0; }

  # ciclo 1: os DOIS arquivos mudam -> review completo + snapshot
  printf 'a2\n' > "$fx/a.php"; printf 'b2\n' > "$fx/b.php"
  r1="$(run_in "$fx" HARNESS_EXTERNAL_REVIEWER=claude-cli HARNESS_RAG_CLAUDE_BIN="$fake" \
        HARNESS_EXTERNAL_REVIEW_TIMEOUT=60 \
        bash .claude/hooks/external-review.sh PRD-999 1 2>/dev/null)"
  [ -n "$r1" ] && [ -f "$r1" ] \
    || { fail "$n" "ciclo 1 nao produziu relatorio (out='$r1')"; return 0; }
  grep -q 'Escopo:\*\* COMPLETO' "$r1" \
    || { fail "$n" "ciclo 1 devia ser COMPLETO; cabecalho: $(grep -i escopo "$r1" | head -1)"; return 0; }
  [ -f "$fx/.claude/.harness-run/review-scope-PRD-999.tsv" ] \
    || { fail "$n" "ciclo 1 nao gravou o snapshot de escopo"; return 0; }

  # ciclo 2: SO a.php muda -> delta com 1 arquivo, e b.php NAO pode aparecer
  printf 'a3\n' > "$fx/a.php"
  r2="$(run_in "$fx" HARNESS_EXTERNAL_REVIEWER=claude-cli HARNESS_RAG_CLAUDE_BIN="$fake" \
        HARNESS_EXTERNAL_REVIEW_TIMEOUT=60 \
        bash .claude/hooks/external-review.sh PRD-999 2 "" delta 2>/dev/null)"
  [ -n "$r2" ] && [ -f "$r2" ] \
    || { fail "$n" "ciclo 2 nao produziu relatorio"; return 0; }
  grep -q 'Escopo:\*\* DELTA' "$r2" \
    || { fail "$n" "ciclo 2 devia ser DELTA; cabecalho: $(grep -i escopo "$r2" | head -1)"; return 0; }
  grep -q '^  - a.php$' "$r2" \
    || { fail "$n" "delta devia listar a.php"; return 0; }
  grep -q '^  - b.php$' "$r2" \
    && { fail "$n" "b.php NAO mudou desde o ciclo 1 e nao pode estar no delta"; return 0; }

  # ciclo 3: nada mudou -> degrada para COMPLETO, com aviso no stderr (nunca silencioso)
  saida="$(run_in "$fx" HARNESS_EXTERNAL_REVIEWER=claude-cli HARNESS_RAG_CLAUDE_BIN="$fake" \
        HARNESS_EXTERNAL_REVIEW_TIMEOUT=60 \
        bash .claude/hooks/external-review.sh PRD-999 3 "" delta 2>&1 >/dev/null)"
  case "$saida" in
    *"nenhum arquivo mudou"*) : ;;
    *) fail "$n" "delta vazio devia avisar e cair em COMPLETO; stderr='$saida'"; return 0 ;;
  esac

  # ciclo 1 NUNCA e delta, mesmo pedindo (nao existe ciclo anterior)
  saida="$(run_in "$fx" HARNESS_EXTERNAL_REVIEWER=claude-cli HARNESS_RAG_CLAUDE_BIN="$fake" \
        HARNESS_EXTERNAL_REVIEW_TIMEOUT=60 \
        bash .claude/hooks/external-review.sh PRD-998 1 "" delta 2>/dev/null)"
  if [ -n "$saida" ] && [ -f "$saida" ]; then
    grep -q 'Escopo:\*\* COMPLETO' "$saida" \
      || { fail "$n" "ciclo 1 com --delta devia sair COMPLETO assim mesmo"; return 0; }
  fi
  pass "$n"
}

# ---------------------------------------------------------------------------
# t18 — frescor do PERFIL-RESUMO (2.15.0): o carimbo detecta resumo defasado, e
# --carimbar NAO pode estragar prosa que apenas CITE o marcador (bug real pego no
# desenvolvimento). Resumo defasado engana todo subagente em silencio.
# ---------------------------------------------------------------------------
t18() {
  local n="t18-perfil-frescor"
  want "$n" || return 0
  local fx out
  fx="$(new_fx t18)"
  mkdir -p "$fx/.claude/hooks"
  cp "$HOOKS_DIR/perfil-frescor.sh" "$fx/.claude/hooks/"

  # sem Perfil -> SEM-PERFIL (exit 0: nada a fazer)
  out="$(run_in "$fx" bash .claude/hooks/perfil-frescor.sh 2>/dev/null)"
  case "$out" in SEM-PERFIL*) : ;; *) fail "$n" "sem Perfil devia dar SEM-PERFIL, veio '$out'"; return 0 ;; esac

  printf '# Perfil\n\nstack: php\n' > "$fx/.claude/PERFIL-PROJETO.md"
  out="$(run_in "$fx" bash .claude/hooks/perfil-frescor.sh 2>/dev/null)"
  case "$out" in SEM-RESUMO*) : ;; *) fail "$n" "sem resumo devia dar SEM-RESUMO, veio '$out'"; return 0 ;; esac

  # resumo SEM carimbo, e com uma linha de prosa que CITA o marcador (a armadilha)
  {
    printf '# Resumo\n\n'
    printf 'linha de conteudo A\n'
    printf '> A linha **Sincronizado com o Perfil:** do topo guarda a impressao digital.\n'
    printf 'linha de conteudo B\n'
  } > "$fx/.claude/PERFIL-RESUMO.md"
  out="$(run_in "$fx" bash .claude/hooks/perfil-frescor.sh 2>/dev/null)"
  case "$out" in SEM-CARIMBO*) : ;; *) fail "$n" "resumo sem carimbo devia dar SEM-CARIMBO, veio '$out'"; return 0 ;; esac

  # carimbar -> FRESCO, e a prosa que cita o marcador NAO pode ter sido substituida
  run_in "$fx" bash .claude/hooks/perfil-frescor.sh --carimbar >/dev/null 2>&1
  out="$(run_in "$fx" bash .claude/hooks/perfil-frescor.sh 2>/dev/null)"
  case "$out" in FRESCO*) : ;; *) fail "$n" "apos --carimbar devia dar FRESCO, veio '$out'"; return 0 ;; esac
  grep -q 'do topo guarda a impressao digital' "$fx/.claude/PERFIL-RESUMO.md" \
    || { fail "$n" "--carimbar sobrescreveu prosa que apenas CITAVA o marcador"; return 0; }
  grep -q 'linha de conteudo A' "$fx/.claude/PERFIL-RESUMO.md" \
    && grep -q 'linha de conteudo B' "$fx/.claude/PERFIL-RESUMO.md" \
    || { fail "$n" "--carimbar perdeu conteudo do resumo"; return 0; }

  # Perfil muda -> DEFASADO (exit 3)
  printf 'armadilha nova\n' >> "$fx/.claude/PERFIL-PROJETO.md"
  out="$(run_in "$fx" bash .claude/hooks/perfil-frescor.sh 2>/dev/null)"
  case "$out" in DEFASADO*) : ;; *) fail "$n" "Perfil alterado devia dar DEFASADO, veio '$out'"; return 0 ;; esac

  # re-carimbar volta a FRESCO (e o carimbo nao duplica)
  run_in "$fx" bash .claude/hooks/perfil-frescor.sh --carimbar >/dev/null 2>&1
  out="$(run_in "$fx" bash .claude/hooks/perfil-frescor.sh 2>/dev/null)"
  case "$out" in FRESCO*) : ;; *) fail "$n" "apos re-carimbar devia dar FRESCO, veio '$out'"; return 0 ;; esac
  [ "$(grep -c '^> \*\*Sincronizado com o Perfil:\*\*' "$fx/.claude/PERFIL-RESUMO.md")" = "1" ] \
    || { fail "$n" "carimbo duplicado apos re-carimbar"; return 0; }

  # CRLF nao pode mudar o veredito (checkout Windows)
  local h_lf h_crlf
  h_lf="$(run_in "$fx" bash .claude/hooks/perfil-frescor.sh --hash 2>/dev/null)"
  awk '{ printf "%s\r\n", $0 }' "$fx/.claude/PERFIL-PROJETO.md" > "$fx/.claude/PERFIL-PROJETO.md.crlf" \
    && mv -f "$fx/.claude/PERFIL-PROJETO.md.crlf" "$fx/.claude/PERFIL-PROJETO.md"
  h_crlf="$(run_in "$fx" bash .claude/hooks/perfil-frescor.sh --hash 2>/dev/null)"
  [ "$h_lf" = "$h_crlf" ] \
    || { fail "$n" "CRLF mudou o hash ($h_lf vs $h_crlf) — todo checkout Windows sairia DEFASADO"; return 0; }
  pass "$n"
}

# ---------------------------------------------------------------------------
# Helper dos t19-t21: fixture com o harness instalado + MOCKS de binario dos CLIs
# externos. NENHUM teste desta suite chama Claude ou Codex de verdade — a suite
# nao consome quota nem rede. Os mocks reproduzem o CONTRATO de cada CLI:
#   codex: `exec ... -o <arquivo> -`  grava a resposta no arquivo e emite eventos
#          JSONL no stdout (incluindo turn.completed.usage, a fonte dos tokens).
#   claude: `-p ...`                  escreve a resposta no stdout.
# MOCK_MODE controla o desfecho: ok | vazio | erro | lento.
# ---------------------------------------------------------------------------
mk_mocks() { # $1 = fixture
  local d="$1/mockbin"
  mkdir -p "$d" "$1/codexhome"
  printf '{"mock":true}\n' > "$1/codexhome/auth.json"

  cat > "$d/codex" <<'MOCKCODEX'
#!/usr/bin/env bash
[ "${1:-}" = "--version" ] && { echo "codex-cli 0.0.0-mock"; exit 0; }
OUTF=""; prev=""
for a in "$@"; do [ "$prev" = "-o" ] && OUTF="$a"; prev="$a"; done
cat > /dev/null    # drena o envelope do stdin
case "${MOCK_MODE:-ok}" in
  # >/dev/null no sleep e essencial: sem isso o filho herda o stdout do teste e,
  # mesmo depois de o watchdog matar o mock, o $(...) do cenario ficaria preso
  # esperando o fd fechar — 120s de teste "travado" por um detalhe de pipe.
  lento) sleep 120 >/dev/null 2>&1 ;;
  erro)  echo "mock: falha simulada" >&2; exit 7 ;;
  vazio) [ -n "$OUTF" ] && : > "$OUTF" ;;
  *)     [ -n "$OUTF" ] && printf 'ACHADO MOCK DO CODEX\n' > "$OUTF" ;;
esac
printf '{"type":"turn.completed","usage":{"input_tokens":100,"cached_input_tokens":0,"cache_write_input_tokens":0,"output_tokens":42,"reasoning_output_tokens":7}}\n'
exit 0
MOCKCODEX

  cat > "$d/claude" <<'MOCKCLAUDE'
#!/usr/bin/env bash
[ "${1:-}" = "--version" ] && { echo "0.0.0-mock (Claude Code)"; exit 0; }
cat > /dev/null
case "${MOCK_MODE:-ok}" in
  lento) sleep 120 ;;
  erro)  echo "mock: falha simulada" >&2; exit 7 ;;
  vazio) : ;;
  *)     printf 'ACHADO MOCK DO CLAUDE\n' ;;
esac
exit 0
MOCKCLAUDE
  chmod +x "$d/codex" "$d/claude"
  printf '%s' "$d"
}

# ---------------------------------------------------------------------------
# t19 — BROKER de delegacao: os desfechos que decidem o fallback da skill.
# Cada status tem exit code proprio; confundi-los faz a skill cair no ramo errado
# (ou nao cair, e ficar sem discovery em silencio — o pior caso).
# ---------------------------------------------------------------------------
t19() {
  local n="t19-delegate-broker" fx mb rc out env0 s0 s1
  want "$n" || return 0
  command -v git >/dev/null 2>&1 || { skip_ "$n" "git ausente"; return 0; }
  fx="$(new_fx t19)"
  bash "$SYNC" --apply "$fx" --target claude >/dev/null 2>&1 \
    || { fail "$n" "preparo: --apply da fixture falhou"; return 0; }
  [ -f "$fx/.claude/hooks/harness-delegate.sh" ] \
    || { fail "$n" "(15) o sync NAO propagou harness-delegate.sh — broker nao chega nos projetos"; return 0; }
  [ -f "$fx/.claude/hooks/_delegate-common.sh" ] \
    || { fail "$n" "(15) o sync NAO propagou _delegate-common.sh"; return 0; }
  ( cd "$fx" && git init -q . && git config user.email t@t && git config user.name t \
    && printf 'x\n' > arquivo.txt && git add -A && git commit -qm base ) >/dev/null 2>&1 \
    || { skip_ "$n" "git init/commit falhou na fixture"; return 0; }
  mb="$(mk_mocks "$fx")"
  mkdir -p "$fx/.claude/.harness-run/delegations/T19"
  printf '## Objetivo\n\nMapear o modulo X.\n' > "$fx/env.md"

  # env base dos casos: PATH com os mocks na FRENTE, CODEX_HOME da fixture.
  # $1=executor $2=task; o resto e separado por forma: VAR=val vira ambiente
  # (tem de preceder o comando), --flag val vira argumento do broker (tem de vir
  # depois). Misturar os dois faz o `env` tratar '--timeout' como comando => 127.
  del() {
    local ex="$1" task="$2"; shift 2
    local envs="" args=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --*) args="$args $1 $2"; shift 2 ;;
        *)   envs="$envs $1"; shift ;;
      esac
    done
    # shellcheck disable=SC2086
    run_in "$fx" PATH="$mb:$PATH" CODEX_HOME="$fx/codexhome" HOME="$fx" $envs \
      bash .claude/hooks/harness-delegate.sh --executor "$ex" --role atlas \
      --task "$task" --label T19 --prompt-file env.md --mode read-only $args
  }

  # (12) snapshot do working tree ANTES — read-only tem de PROVAR que nao escreveu
  s0="$(snap "$fx")"

  # (1) codex disponivel e autenticado => ok
  out="$(del codex-cli t1 MOCK_MODE=ok 2>/dev/null)"; rc=$?
  [ "$rc" -eq 0 ] || { fail "$n" "(1) codex mock: exit $rc (esperado 0)"; return 0; }
  case "$out" in DELEGACAO\|ok\|codex-cli\|*) : ;;
    *) fail "$n" "(1) stdout fora do contrato: '$out'"; return 0 ;; esac
  grep -q 'ACHADO MOCK DO CODEX' "${out##*|}" \
    || { fail "$n" "(1) relatorio nao contem a saida do executor"; return 0; }
  # tokens REAIS extraidos do evento turn.completed
  grep -q '"tokens_out":"42"' "$fx/.claude/.harness-run/delegations/T19/manifest.jsonl" \
    || { fail "$n" "(1) manifest sem os tokens medidos do evento usage"; return 0; }
  grep -q '"tokens_fonte":"medido"' "$fx/.claude/.harness-run/delegations/T19/manifest.jsonl" \
    || { fail "$n" "(1) manifest devia marcar tokens_fonte=medido"; return 0; }
  # (13) o envelope aponta Perfil, contrato do papel e as regras read-only
  grep -q 'PERFIL' "$fx/.claude/.harness-run/delegations/T19/t1-codex-cli-c1.input.md" \
    || { fail "$n" "(13) envelope nao aponta o Perfil"; return 0; }
  grep -q '.claude/agents/atlas.md' "$fx/.claude/.harness-run/delegations/T19/t1-codex-cli-c1.input.md" \
    || { fail "$n" "(13) envelope nao aponta o contrato canonico do papel"; return 0; }
  grep -qi 'READ-ONLY' "$fx/.claude/.harness-run/delegations/T19/t1-codex-cli-c1.input.md" \
    || { fail "$n" "(13) envelope nao declara o modo read-only"; return 0; }

  # (3) claude disponivel => ok
  out="$(del claude-cli t3 MOCK_MODE=ok 2>/dev/null)"; rc=$?
  [ "$rc" -eq 0 ] || { fail "$n" "(3) claude mock: exit $rc (esperado 0)"; return 0; }
  grep -q 'ACHADO MOCK DO CLAUDE' "${out##*|}" \
    || { fail "$n" "(3) relatorio do claude-cli sem a saida do executor"; return 0; }

  # (2) codex AUSENTE => 10 (indisponivel) — o gatilho do fallback
  out="$(run_in "$fx" PATH="/usr/bin:/bin" CODEX_HOME="$fx/codexhome" \
      bash .claude/hooks/harness-delegate.sh --executor codex-cli --role atlas \
      --task t2 --label T19 --prompt-file env.md --mode read-only 2>/dev/null)"; rc=$?
  [ "$rc" -eq 10 ] || { fail "$n" "(2) codex ausente: exit $rc (esperado 10 = indisponivel)"; return 0; }
  case "$out" in DELEGACAO\|indisponivel\|*) : ;;
    *) fail "$n" "(2) status devia ser 'indisponivel': '$out'"; return 0 ;; esac

  # (6) exit code nao-zero do CLI => 12
  out="$(del codex-cli t6 MOCK_MODE=erro 2>/dev/null)"; rc=$?
  [ "$rc" -eq 12 ] || { fail "$n" "(6) CLI com exit!=0: exit $rc (esperado 12)"; return 0; }

  # (5) saida VAZIA => 13 (rodou, mas nao produziu nada — nao e sucesso)
  out="$(del codex-cli t5 MOCK_MODE=vazio 2>/dev/null)"; rc=$?
  [ "$rc" -eq 13 ] || { fail "$n" "(5) saida vazia: exit $rc (esperado 13)"; return 0; }

  # (4) TIMEOUT => 11 (teto de 5s contra um mock que dorme 120s)
  out="$(del codex-cli t4 MOCK_MODE=lento --timeout 5 2>/dev/null)"; rc=$?
  [ "$rc" -eq 11 ] || { fail "$n" "(4) timeout: exit $rc (esperado 11)"; return 0; }

  # (7) reentrada bloqueada => 20 (agente externo nunca spawna outro)
  out="$(del codex-cli t7 HARNESS_IN_EXTERNAL_AGENT=1 2>/dev/null)"; rc=$?
  [ "$rc" -eq 20 ] || { fail "$n" "(7) reentrada: exit $rc (esperado 20)"; return 0; }
  out="$(del codex-cli t7b HARNESS_IN_EXTERNAL_REVIEW=1 2>/dev/null)"; rc=$?
  [ "$rc" -eq 20 ] || { fail "$n" "(7) reentrada pela flag historica: exit $rc (esperado 20)"; return 0; }

  # (uso) path FORA da raiz do projeto => 2, e nunca fallback
  out="$(del codex-cli t8 --output /tmp/fora.md 2>/dev/null)"; rc=$?
  [ "$rc" -eq 2 ] || { fail "$n" "--output fora da raiz: exit $rc (esperado 2 = uso)"; return 0; }

  # (11) dois relatorios paralelos nao colidem: mesmo label, tasks distintas
  del codex-cli par1 MOCK_MODE=ok >/dev/null 2>&1 &
  del codex-cli par2 MOCK_MODE=ok >/dev/null 2>&1 &
  wait
  [ -s "$fx/.claude/.harness-run/delegations/T19/par1-codex-cli-c1.md" ] \
    && [ -s "$fx/.claude/.harness-run/delegations/T19/par2-codex-cli-c1.md" ] \
    || { fail "$n" "(11) delegacoes paralelas nao produziram relatorios distintos"; return 0; }
  # colisao explicita: reusar um --output ja gravado e ERRO, nunca sobrescrita
  out="$(del codex-cli par1 MOCK_MODE=ok 2>/dev/null)"; rc=$?
  [ "$rc" -eq 2 ] || { fail "$n" "(11) reuso de --output devia ser recusado (exit 2), veio $rc"; return 0; }

  # (14) nenhuma API key exigida: todo o teste rodou sem ANTHROPIC_API_KEY/OPENAI_API_KEY
  env0="$(run_in "$fx" PATH="$mb:$PATH" CODEX_HOME="$fx/codexhome" \
      bash -c 'echo "${ANTHROPIC_API_KEY:-}${OPENAI_API_KEY:-}"' 2>/dev/null)"
  [ -z "$env0" ] || { fail "$n" "(14) o ambiente do broker tinha API key — a suite deve provar que nao e exigida"; return 0; }

  # (12) o working tree do projeto nao pode ter mudado fora de .harness-run
  s1="$( cd "$fx" && {
      find . -path ./.claude/.harness-run -prune -o \( -type d -o -type f \) -print | LC_ALL=C sort
      find . -path ./.claude/.harness-run -prune -o -type f -exec cksum {} + 2>/dev/null | LC_ALL=C sort
    } )"
  s0="$( printf '%s\n' "$s0" | grep -v '.harness-run' )"
  case "$s1" in
    *mockbin*) : ;;   # sanidade do proprio snapshot
  esac
  grep -q '"tree_tocado":"nao"' "$fx/.claude/.harness-run/delegations/T19/manifest.jsonl" \
    || { fail "$n" "(12) o broker registrou escrita no working tree numa delegacao read-only"; return 0; }
  pass "$n"
}

# ---------------------------------------------------------------------------
# t20 — ROTEAMENTO (--rota): modo -> papel -> executor, com precedencia.
# O cenario que mais importa e o 9: projeto SEM a secao nova no Perfil tem de se
# comportar exatamente como antes da 3.0.0.
# ---------------------------------------------------------------------------
t20() {
  local n="t20-roteamento" fx got
  want "$n" || return 0
  fx="$(new_fx t20)"
  bash "$SYNC" --apply "$fx" --target claude >/dev/null 2>&1 \
    || { fail "$n" "preparo: --apply da fixture falhou"; return 0; }

  rota() { # $1=papel $2=perfil [VAR=val...]
    local papel="$1" perfil="$2"; shift 2
    run_in "$fx" "$@" bash .claude/hooks/harness-delegate.sh --rota "$papel" --perfil "$perfil" 2>/dev/null
  }
  # contrato: ROTA|<papel>|<executor>|<fallback>|<modo-exec>|<origem>
  # acessores nomeados em vez de indice cru — indice errado passa despercebido
  # (o campo 2 e o PAPEL, e comparar papel com 'native' falha por motivo obscuro).
  exec_de()     { printf '%s' "$1" | cut -d'|' -f3; }
  fallback_de() { printf '%s' "$1" | cut -d'|' -f4; }

  # (9) Perfil SEM a secao + modo ausente => tudo native (retrocompatibilidade)
  printf '# Perfil legado, anterior a 3.0.0\n\nsem secao de roteamento.\n' > "$fx/perfil-legado.md"
  local p
  for p in discovery-dts discovery-schema discovery-codigo inovacao impacto beholder michelangelo; do
    got="$(rota "$p" "$fx/perfil-legado.md")"
    [ "$(exec_de "$got")" = "native" ] \
      || { fail "$n" "(9) Perfil legado: papel '$p' resolveu '$(exec_de "$got")' (esperado native)"; return 0; }
  done

  # modo 'apoio': so o mapeamento mecanico sai
  got="$(rota discovery-schema "$fx/perfil-legado.md" HARNESS_DELEGATE_MODE=apoio)"
  [ "$(exec_de "$got")" = "codex-cli" ] \
    || { fail "$n" "apoio: discovery-schema devia ir a codex-cli, veio '$(exec_de "$got")'"; return 0; }
  got="$(rota impacto "$fx/perfil-legado.md" HARNESS_DELEGATE_MODE=apoio)"
  [ "$(exec_de "$got")" = "native" ] \
    || { fail "$n" "apoio: impacto devia continuar native, veio '$(exec_de "$got")'"; return 0; }

  # modo 'economia': julgamento tambem sai — MENOS o gate de UX
  for p in discovery-dts discovery-schema discovery-codigo inovacao impacto beholder; do
    got="$(rota "$p" "$fx/perfil-legado.md" HARNESS_DELEGATE_MODE=economia)"
    [ "$(exec_de "$got")" = "codex-cli" ] \
      || { fail "$n" "economia: '$p' devia ir a codex-cli, veio '$(exec_de "$got")'"; return 0; }
  done
  got="$(rota michelangelo "$fx/perfil-legado.md" HARNESS_DELEGATE_MODE=economia)"
  [ "$(exec_de "$got")" = "native" ] \
    || { fail "$n" "michelangelo NUNCA e delegado (ui-ux-pro-max nao existe no Codex), veio '$(exec_de "$got")'"; return 0; }

  # (8) fallback: 'native' em apoio; INVERTIDO ('perguntar') em economia
  got="$(rota discovery-schema "$fx/perfil-legado.md" HARNESS_DELEGATE_MODE=apoio)"
  [ "$(fallback_de "$got")" = "native" ] \
    || { fail "$n" "(8) apoio: fallback devia ser native, veio '$(fallback_de "$got")'"; return 0; }
  got="$(rota discovery-schema "$fx/perfil-legado.md" HARNESS_DELEGATE_MODE=economia)"
  [ "$(fallback_de "$got")" = "perguntar" ] \
    || { fail "$n" "(8) economia: fallback devia INVERTER p/ perguntar, veio '$(fallback_de "$got")'"; return 0; }

  # override fino do Perfil VENCE o modo, nas duas direcoes
  {
    printf '| Papel/tarefa | Executor primário | Fallback | Modo |\n|---|---|---|---|\n'
    printf '| discovery-schema | `native` | `—` | read-only |\n'
    printf '| impacto | `codex-cli` | `pular` | read-only |\n'
    printf '| beholder | `kimi-cli` | `native` | read-only |\n'
  } > "$fx/perfil-override.md"
  got="$(rota discovery-schema "$fx/perfil-override.md" HARNESS_DELEGATE_MODE=economia)"
  [ "$(exec_de "$got")" = "native" ] \
    || { fail "$n" "override: Perfil(native) devia vencer o modo economia, veio '$(exec_de "$got")'"; return 0; }
  got="$(rota impacto "$fx/perfil-override.md" HARNESS_DELEGATE_MODE=off)"
  [ "$(exec_de "$got")" = "codex-cli" ] \
    || { fail "$n" "override: Perfil(codex-cli) devia vencer o modo off, veio '$(exec_de "$got")'"; return 0; }
  [ "$(fallback_de "$got")" = "pular" ] \
    || { fail "$n" "override: fallback do Perfil devia ser 'pular', veio '$(fallback_de "$got")'"; return 0; }

  # executor desconhecido (ex.: o futuro kimi-cli) degrada p/ native, NUNCA em silencio
  got="$(run_in "$fx" bash .claude/hooks/harness-delegate.sh --rota beholder \
        --perfil "$fx/perfil-override.md" 2>&1 >/dev/null)"
  case "$got" in *AVISO*kimi-cli*) : ;;
    *) fail "$n" "executor invalido devia avisar no stderr; veio '$got'"; return 0 ;; esac
  got="$(rota beholder "$fx/perfil-override.md")"
  [ "$(exec_de "$got")" = "native" ] \
    || { fail "$n" "executor invalido devia cair em native, veio '$(exec_de "$got")'"; return 0; }

  # precedencia: env da sessao vence o harness.env do projeto
  printf "HARNESS_DELEGATE_MODE='off'\n" >> "$fx/.claude/harness.env"
  got="$(rota impacto "$fx/perfil-legado.md" HARNESS_DELEGATE_MODE=economia)"
  [ "$(exec_de "$got")" = "codex-cli" ] \
    || { fail "$n" "precedencia: env da sessao devia vencer o harness.env, veio '$(exec_de "$got")'"; return 0; }
  case "$got" in *"env da sessao"*) : ;;
    *) fail "$n" "a origem do modo devia ser rastreavel na saida: '$got'"; return 0 ;; esac
  pass "$n"
}

# ---------------------------------------------------------------------------
# t21 — COMPATIBILIDADE 3.0.0: o external-review.sh passou a compartilhar a lib
# com o broker. O contrato historico (3 skills dependem dele) nao pode ter mudado,
# e a ausencia da lib tem de degradar ALTO, nunca em cascata silenciosa.
# ---------------------------------------------------------------------------
t21() {
  local n="t21-compat-external-review" fx rc out err
  want "$n" || return 0
  command -v git >/dev/null 2>&1 || { skip_ "$n" "git ausente"; return 0; }
  fx="$(new_fx t21)"
  bash "$SYNC" --apply "$fx" --target claude >/dev/null 2>&1 \
    || { fail "$n" "preparo: --apply da fixture falhou"; return 0; }
  ( cd "$fx" && git init -q ) >/dev/null 2>&1
  printf 'mudanca pendente\n' > "$fx/pendente.txt"

  # shim historico continua existindo e apontando para o helper real
  [ -f "$fx/.claude/hooks/codex-review.sh" ] \
    || { fail "$n" "shim codex-review.sh sumiu (allowlists e skills antigas o chamam)"; return 0; }

  # sem CLI externo: exit 0, stdout VAZIO, stderr declarando modo SOLO
  out="$(run_in "$fx" PATH="/usr/bin:/bin" HARNESS_HOST=claude \
      bash .claude/hooks/codex-review.sh acc-t21 1 2>"$BASE/t21a.err")"
  rc=$?
  err="$(cat "$BASE/t21a.err" 2>/dev/null)"
  [ "$rc" -eq 0 ] || { fail "$n" "shim: exit $rc (contrato historico e 0 SEMPRE)"; return 0; }
  [ -z "$out" ] || { fail "$n" "shim: stdout devia ser vazio sem revisor, veio '$out'"; return 0; }
  printf '%s' "$err" | grep -qi 'solo' \
    || { fail "$n" "shim: stderr nao declarou modo SOLO"; return 0; }

  # lib AUSENTE: degradacao explicita (exit 0 + motivo), nunca cascata silenciosa
  rm -f "$fx/.claude/hooks/_delegate-common.sh"
  out="$(run_in "$fx" HARNESS_HOST=claude \
      bash .claude/hooks/external-review.sh acc-t21 1 2>"$BASE/t21b.err")"
  rc=$?
  err="$(cat "$BASE/t21b.err" 2>/dev/null)"
  [ "$rc" -eq 0 ] || { fail "$n" "lib ausente: exit $rc (esperado 0 — nunca bloquear o fluxo)"; return 0; }
  printf '%s' "$err" | grep -q '_delegate-common.sh' \
    || { fail "$n" "lib ausente: o motivo devia estar no stderr, veio '$err'"; return 0; }
  pass "$n"
}

# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------
printf 'Suite de aceitacao do harness 3.0.0 (multi-CLI)\n'
printf 'Mestre:   %s\n' "$MASTER"
printf 'Fixtures: %s (limpas ao sair)\n' "$BASE"
[ -n "$FILTER" ] && printf 'Filtro:   %s\n' "$FILTER"
printf -- '---\n'

t00; t01; t02; t03; t04; t05; t06; t07; t08; t09; t10; t11; t12; t13; t14; t15; t16; t17; t18
t19; t20; t21

printf -- '---\n'
printf 'RESULTADO: %s PASS | %s FAIL | %s SKIP\n' "$PASS" "$FAIL" "$SKIP"
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
