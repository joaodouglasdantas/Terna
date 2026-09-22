#!/usr/bin/env bash
# .claude/scripts/noturno.sh (3.4.1; --fila 3.4.8)
# LOOP NOTURNO DE DTs — resolve a fila de DTs pequenos com duelo de modelos baratos e entrega um
# MERGE REQUEST de manha. Nunca toca a branch principal. Dois modos:
#
#   LOCAL (default) — na SUA maquina: worktree isolado + banco CLONADO do Perfil
#       bash .claude/scripts/noturno.sh [--paralelo 1] [--max-lotes 3] [--sem-mr] [--dry-run] [--fila]
#
#   CLOUD (--cloud) — num runner (GitLab CI agendado, Caronte, cron de servidor): o checkout do
#       runner ja e isolado (sem worktree), o banco e EXTERNO (CI variables) e o MR sai pela API.
#
#   FILA INTELIGENTE (--fila, 3.4.8 — noturno v2): a madrugada vira esteira, nao so faxina.
#     Etapa 1 — o sweep processa PRIMEIRO os DTs de Prioridade Alta, depois os lotes normais
#               (mesma mecanica, diretiva de prioridade no prompt);
#     Etapa 2 — sobrando noite, cada ideia 'pronta-para-prd' (prds/backlog/IDEIAS.md) vira um
#               RASCUNHO de PRD de produto em prds/backlog/RASCUNHO-IDEIA-NNN.md (sem
#               entrevista; premissas declaradas no topo) — o Charles refina de manha com
#               /prd --ideia NNN ja com o rascunho pronto. Teto: HARNESS_NOTURNO_MAX_RASCUNHOS
#               (default 2) por noite. Rascunho existente nao e regravado.
#     Liga por flag ou por HARNESS_NOTURNO_FILA='on' no harness.env (default off ate o v1
#     rodar em producao).
#       Variaveis esperadas no runner:
#         CLAUDE_CODE_OAUTH_TOKEN (token da assinatura: `claude setup-token`) ou ANTHROPIC_API_KEY
#         OPENROUTER_API_KEY                                  workers + juiz baratos
#         HARNESS_DB_EXT_HOST / _USER / _PASS / _NAME         banco do noturno (ex.: <db>_noturno
#                                                             recriado toda noite a partir do prod)
#         HARNESS_URL_EXT (opcional)                          URL do app para E2E, se houver
#         GITLAB_TOKEN (opcional)                             abre o MR via API; sem ele, so push
#       Exemplo de job: .claude/scripts/noturno-ci.yml · clone do banco no servidor: .claude/scripts/noturno-db-clone.sh
#
# O trabalho em si e sempre a skill: claude -p "/dt-sweep --loop --autonomo ..." (prova o sweep,
# lotes leves com lock por DT, duelo nos itens mecanicos, sherlock solo, 1 commit por item).
#
# TELEMETRIA: runs/<dev>@<maquina>~noturno-<data>.jsonl + duelos/<dev>@<maquina>~noturno-<data>.jsonl (3.5.0) — o /harness-report
# mostra o que a madrugada produziu e quanto custou.

set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT" || exit 2
# 3.4.21: noturno LOCAL em Windows nao compensa — a criacao de processo e serializada (~20/s) e o
# spawn sobe a 1,4 s com frentes paralelas (medido 04/09); a madrugada e onde as frentes se
# acumulam. Rode no Mac (fork nativo, 5-20 ms) ou no servidor de homolog (--cloud). Para insistir
# no PC: --forcar-windows (o semaforo de frentes ainda vale).
case "$(uname -s 2>/dev/null)" in
  MINGW*|MSYS*|CYGWIN*)
    if ! printf '%s ' "$@" | grep -q -- '--cloud' && ! printf '%s ' "$@" | grep -q -- '--forcar-windows'; then
      echo "NOTURNO|recusado|Windows: rode no Mac ou em --cloud (homolog). Motivo: spawn serializado nesta plataforma (3.4.21). Forcar: --forcar-windows"
      exit 3
    fi ;;
esac
# 3.4.2: chaves PESSOAIS por maquina, validas para todos os projetos (o Claude Desktop nao herda setx
# feito depois de aberto): ~/.harness.env.local (chmod 600). Nunca versionado. Precedencia: env > user > projeto.
. .claude/hooks/_env.sh   # 3.5.7: camadas de configuracao (_defaults.env -> harness.env -> .local -> ~/.local)
PAR=1; MAXL="${HARNESS_NOTURNO_MAX_LOTES:-3}"; MR=1; DRY=0; CLOUD=0
FILA=0; [ "${HARNESS_NOTURNO_FILA:-off}" = "on" ] && FILA=1
while [ $# -gt 0 ]; do case "$1" in --paralelo) PAR="$2"; shift 2;; --max-lotes) MAXL="$2"; shift 2;; --sem-mr) MR=0; shift;; --dry-run) DRY=1; shift;; --cloud) CLOUD=1; shift;; --fila) FILA=1; shift;; *) shift;; esac; done
log() { printf '[noturno %s] %s\n' "$(date +%H:%M:%S)" "$*" >&2; }
[ "${HARNESS_NOTURNO:-on}" = "off" ] && { log "HARNESS_NOTURNO=off — nada a fazer"; exit 0; }
command -v claude >/dev/null || { log "claude ausente no PATH (no runner: npm i -g @anthropic-ai/claude-code)"; exit 1; }
[ -n "${OPENROUTER_API_KEY:-}" ] || log "sem OPENROUTER_API_KEY — duelo dormente, hefesto nativo escreve (mais lento)"
ROT="noturno-$(date +%Y%m%d)"
MAIN_BR="$(git rev-parse --abbrev-ref HEAD)"

if [ "$CLOUD" = 1 ]; then
  # ---- CLOUD: checkout do runner = isolado. Branch propria + banco externo + sem worktree.
  [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}${ANTHROPIC_API_KEY:-}" ] || { log "sem CLAUDE_CODE_OAUTH_TOKEN/ANTHROPIC_API_KEY — o orquestrador (claude -p) nao autentica no runner"; exit 1; }
  git config user.email >/dev/null 2>&1 || { git config user.email "noturno@harness"; git config user.name "harness noturno"; }
  git checkout -q -B "wt/$ROT" "$MAIN_BR"
  bash .claude/hooks/harness-worktree.sh apontar "$ROT" >&2 || exit 1
  # Juiz no cloud: se nao declarado, usa OpenRouter (o Claude do runner fica so para orquestrar)
  export HARNESS_DUELO_JUIZ="${HARNESS_DUELO_JUIZ_CLOUD:-openrouter}"
  WT="$ROOT"
else
  # ---- LOCAL: worktree + banco clonado
  [ -z "$(git status --porcelain)" ] || { log "checkout principal sujo — o noturno so parte de tree limpo"; exit 1; }
  git pull -q --ff-only 2>/dev/null || log "pull --ff-only falhou (offline?) — seguindo com o local"
  WT_OUT="$(bash .claude/hooks/harness-worktree.sh novo "$ROT" 2>&1)" || { log "worktree falhou: $WT_OUT"; exit 1; }
  WT="$(printf '%s\n' "$WT_OUT" | grep '^WT|dir|' | cut -d'|' -f3)"
  log "worktree $WT ($(printf '%s\n' "$WT_OUT" | grep '^WT|banco|' | cut -d'|' -f3))"
fi
log "modo=$([ "$CLOUD" = 1 ] && echo cloud || echo local) · branch wt/$ROT · juiz=${HARNESS_DUELO_JUIZ:-themis} · max-lotes=$MAXL"
[ "$DRY" = 1 ] && { log "dry-run: ambiente preparado, nada executado"; if [ "$CLOUD" = 1 ]; then git checkout -q "$MAIN_BR"; rm -f .claude/.harness-run/worktree.env; fi; exit 0; }
# (o worktree.env do modo cloud e removido tambem no fim do run — deixa-lo no checkout principal
#  faria a PROXIMA execucao normal gravar telemetria com o rotulo do noturno; aconteceu em 23/08)
trap '[ "$CLOUD" = 1 ] && rm -f "$ROOT/.claude/.harness-run/worktree.env" 2>/dev/null' EXIT

cd "$WT" || exit 1
T0=$(date +%s)
# 3.4.23 (item 18): MODO AUTONOMO declarado — marcador + ambiente. O hooks/guard-question.sh nega
# AskUserQuestion enquanto o marcador tiver < HARNESS_MODO_TTL_H h (default 12); ninguem apaga.
mkdir -p .claude/.harness-run 2>/dev/null; printf 'noturno\n' > .claude/.harness-run/modo 2>/dev/null || true
export HARNESS_MODO=noturno
# --fila (3.4.8): etapa 1 = sweep com prioridade Alta primeiro (mesma skill, diretiva no prompt)
SWEEP_PROMPT="/dt-sweep --loop --autonomo --paralelo=$PAR --max-lotes=$MAXL"
if [ "$FILA" = 1 ]; then
  SWEEP_PROMPT="$SWEEP_PROMPT — PRIORIDADE DA NOITE (noturno --fila): antes de montar a fila normal, processe TODOS os DTs com Prioridade Alta elegiveis do INDEX (lotes proprios, na frente); so depois os demais. Se um Alta nao for elegivel a lote, registre o motivo no relatorio."
fi
claude -p "$SWEEP_PROMPT" \
  --permission-mode acceptEdits --output-format text > ".claude/.harness-run/noturno-$ROT.log" 2>&1
RC=$?

# --fila etapa 2 (3.4.8): ideias 'pronta-para-prd' viram RASCUNHO de PRD para o Charles
# refinar de manha. Read-only sobre o codigo (so escreve os rascunhos em prds/backlog/).
if [ "$FILA" = 1 ] && [ -f "prds/backlog/IDEIAS.md" ]; then
  MAXR="${HARNESS_NOTURNO_MAX_RASCUNHOS:-2}"; case "$MAXR" in ''|*[!0-9]*) MAXR=2 ;; esac
  N_R=0
  # linhas do indice com estado pronta-para-prd -> IDEIA-NNN
  for IDN in $(grep -oE 'IDEIA-[0-9]+' <(grep -i 'pronta-para-prd' prds/backlog/IDEIAS.md 2>/dev/null) | sort -u); do
    [ "$N_R" -ge "$MAXR" ] && break
    ls prds/backlog/RASCUNHO-"$IDN"*.md >/dev/null 2>&1 && continue   # ja tem rascunho
    log "fila: gerando rascunho de PRD para $IDN"
    claude -p "Leia prds/ideias/${IDN}-*.md (ideia madura, estado pronta-para-prd), o .claude/PERFIL-RESUMO.md e o template prds/_templates/TEMPLATE-PRD.md. Escreva um RASCUNHO de PRD DE PRODUTO em prds/backlog/RASCUNHO-${IDN}.md: siga o template, declare no topo '> RASCUNHO NOTURNO — premissas assumidas sem entrevista; refinar com /prd --ideia ${IDN#IDEIA-}' e liste as premissas que voce assumiu. NAO crie pasta de PRD, NAO toque em codigo, NAO mexa no INDEX — so o arquivo do rascunho." \
      --permission-mode acceptEdits --output-format text >> ".claude/.harness-run/noturno-$ROT.log" 2>&1 \
      && N_R=$(( N_R + 1 )) || log "fila: rascunho de $IDN falhou (ver log)"
  done
  [ "$N_R" -gt 0 ] && log "fila: $N_R rascunho(s) de PRD gerado(s) em prds/backlog/ — commite-os no MR da noite"
  if [ "$N_R" -gt 0 ]; then
    git add prds/backlog/RASCUNHO-*.md 2>/dev/null && git commit -qm "noturno --fila: $N_R rascunho(s) de PRD de ideias pronta-para-prd" 2>/dev/null || true
  fi
fi
N_COMMITS="$(git rev-list --count "$MAIN_BR..HEAD" 2>/dev/null || echo 0)"
log "claude -p terminou rc=$RC em $(( ( $(date +%s) - T0 ) / 60 )) min · $N_COMMITS commit(s) em wt/$ROT"

if [ "$N_COMMITS" -gt 0 ] && [ "$MR" = 1 ]; then
  git push -u origin "wt/$ROT" 2>/dev/null && log "branch publicada: wt/$ROT" || log "push falhou — branch fica local"
  TITLE="noturno $ROT: $N_COMMITS DT(s) resolvidos pelo loop automatico"
  DESC="Gerado por .claude/scripts/noturno.sh (harness 3.4.1, modo $([ "$CLOUD" = 1 ] && echo cloud || echo local)). Revisar antes do merge."
  if [ -n "${GITLAB_TOKEN:-}" ] && [ -n "${CI_PROJECT_ID:-${GITLAB_PROJECT_ID:-}}" ]; then
    curl -s -X POST -H "PRIVATE-TOKEN: $GITLAB_TOKEN" "${CI_API_V4_URL:-https://gitlab.com/api/v4}/projects/${CI_PROJECT_ID:-$GITLAB_PROJECT_ID}/merge_requests" \
      --data-urlencode "source_branch=wt/$ROT" --data-urlencode "target_branch=$MAIN_BR" --data-urlencode "title=$TITLE" --data-urlencode "description=$DESC" --data "remove_source_branch=true" \
      | grep -o '"web_url":"[^"]*"' | head -1 | sed 's/"web_url":"//; s/"$//' | { read -r u; [ -n "$u" ] && log "MR aberto: $u" || log "MR via API falhou — abra a partir de wt/$ROT"; }
  elif command -v glab >/dev/null 2>&1; then
    glab mr create --source-branch "wt/$ROT" --target-branch "$MAIN_BR" --title "$TITLE" --description "$DESC" --yes 2>/dev/null && log "MR aberto (glab)" || log "glab mr create falhou — abra a partir de wt/$ROT"
  else
    log "sem GITLAB_TOKEN nem glab — abra o MR manualmente a partir de wt/$ROT"
  fi
fi
if [ "$N_COMMITS" -eq 0 ]; then
  log "nada produzido"
  if [ "$CLOUD" = 1 ]; then git checkout -q "$MAIN_BR"; else cd "$ROOT" && bash .claude/hooks/harness-worktree.sh fechar "$ROT" >/dev/null 2>&1; fi
fi
exit $RC
