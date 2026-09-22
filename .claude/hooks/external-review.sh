#!/usr/bin/env bash
# .claude/hooks/external-review.sh (2.0.0)
# Revisor EXTERNO do review dupla-cega, consciente do host (multi-AI).
# Generaliza o antigo codex-review.sh: a sessao principal roda num runtime
# (Claude Code ou Codex) e o revisor externo e o CLI do OUTRO modelo —
# preservando a premissa "modelos diferentes erram diferente".
#
#   host claude + REVIEWER auto  -> codex exec review --uncommitted
#   host codex  + REVIEWER auto  -> claude -p (review adversarial sobre o diff)
#   REVIEWER codex-cli|claude-cli -> forca o provider
#   REVIEWER none                 -> pula (modo SOLO — so a persona sherlock)
#
# CONTRATO (identico ao codex-review.sh historico — as skills dependem dele):
#   stdout = path absoluto do relatorio (1 linha) ou VAZIO se pulou.
#   stderr = warnings/erros (inclui o aviso de modo solo).
#   exit 0 SEMPRE (defensivo — nunca bloqueia /prd-exec nem /codex-review).
#
# Uso:
#   bash .claude/hooks/external-review.sh [LABEL] [CICLO] [REASONING]
#     $1 LABEL     — rotulo do relatorio (ex: PRD-016). Default "manual".
#     $2 CICLO     — numero do ciclo. Default "1".
#     $3 REASONING — low|medium|high (so afeta o provider codex-cli; vazio =
#                    HARNESS_CODEX_REASONING do harness.env, senao default do CLI).
#
# Config (.claude/harness.env):
#   HARNESS_HOST / HARNESS_EXTERNAL_REVIEWER  — ver PLATAFORMAS.md §8.
#   HARNESS_CODEX_REPORTS      — pasta de relatorios (default codex-reviews/ na raiz).
#   HARNESS_CLAUDE_REVIEW_MODEL— modelo do revisor claude-cli (default sonnet).
#   HARNESS_SKIP_CODEX_REVIEW=1— bypass historico (pula o revisor externo).
#   HARNESS_EXTERNAL_REVIEW_TIMEOUT — teto em segundos do revisor (default 600;
#                    lotes pequenos passam 300 inline — ver /dt-exec Passo 5).
#
# Reentrancia: o subprocesso do revisor roda com HARNESS_IN_EXTERNAL_REVIEW=1 e
# HARNESS_IN_EXTERNAL_AGENT=1 (3.0.0 — flag generica de "estou dentro de um CLI
# externo") — os hooks RAG (e qualquer hook que cheque as flags) saem no-op dentro
# dele, evitando captura/injecao recursiva quando o CLI revisor dispara os hooks
# do repo. Os hooks reconhecem AS DUAS durante a transicao.
#
# 3.0.0: o teto de tempo portavel e o probe de executor sairam daqui para
# .claude/hooks/_delegate-common.sh, compartilhados com o broker de delegacao
# (harness-delegate.sh). O CONTRATO deste script nao mudou em nada.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 3.5.7: camadas de configuracao — hooks/_env.sh carrega _defaults.env -> harness.env -> harness.env.local -> ~/.harness.env.local
# (ambiente da sessao vence). Antes cada hook tinha o proprio loop.
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_env.sh"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_host-detect.sh"
# A lib comum (3.0.0) traz o teto de tempo portavel e o probe de executor. Sem ela
# o script seguiria adiante e morreria em cascata silenciosa ('command not found'
# nao aborta), o pior desfecho possivel para um helper cujo contrato e "nunca
# bloquear o fluxo": ficariamos sem revisor E sem explicacao.
if [ ! -f "$SCRIPT_DIR/_delegate-common.sh" ]; then
  echo "[external-review] _delegate-common.sh ausente em $SCRIPT_DIR — harness incompleto (atualize via /deus). Review em modo SOLO." >&2
  exit 0
fi
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_delegate-common.sh"
HARNESS_LOG_TAG="external-review"

# 3.5.6 (D11): flags nomeadas ANTES dos posicionais — `--base <ref>` (ou HARNESS_REVIEW_BASE; default auto) e `--dry-run`
# (monta o diff, imprime REVIEW|dry-run|... e sai sem chamar o revisor — usado pelos testes do mestre).
BASE_ARG=""; DRY_RUN=0; _POS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --base) BASE_ARG="${2:-}"; shift 2 ;;
    --base=*) BASE_ARG="${1#*=}"; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    *) _POS+=("$1"); shift ;;
  esac
done
set -- ${_POS[@]+"${_POS[@]}"}

LABEL="${1:-manual}"
CICLO="${2:-1}"
# TETO ABSOLUTO DE CICLOS (3.4.3 — enforcement da regra S5/3.3.0, nao mais so texto).
# Medido: caronte PRD-009 rodou 5 ciclos; PRD-104 chegou a 10. Ciclo alem do teto nao roda:
# achado que sobreviveu ao teto e DECISAO HUMANA (10.3), nao mais um ciclo de gate.
MAXC="${HARNESS_REVIEW_MAX_CICLOS:-3}"
case "$MAXC" in ''|*[!0-9]*) MAXC=3 ;; esac
if [ "$MAXC" -gt 0 ] 2>/dev/null && [ "$CICLO" -gt "$MAXC" ] 2>/dev/null; then
  echo "[external-review] RECUSADO: ciclo $CICLO > teto absoluto $MAXC (HARNESS_REVIEW_MAX_CICLOS). Achado restante = decisao humana (10.3) ou DT — nunca outro ciclo." >&2
  exit 3
fi
REASONING="${3:-${HARNESS_CODEX_REASONING:-}}"
# 2.14.0 — ESCOPO do review: 'full' (default) le o working tree inteiro; 'delta' le so
# o que MUDOU desde o ciclo anterior deste mesmo LABEL. Do ciclo 2 em diante o revisor
# esta conferindo correcao, nao reabrindo investigacao — reler o diff inteiro a cada
# ciclo era custo puro. Fonte: 4o argumento posicional ou HARNESS_REVIEW_SCOPE.
ESCOPO="${4:-${HARNESS_REVIEW_SCOPE:-full}}"
case "$ESCOPO" in full|delta) : ;; *) ESCOPO="full" ;; esac
[ "${CICLO:-1}" = "1" ] && ESCOPO="full"   # ciclo 1 nunca e delta (nao ha anterior)

# 3.5.6 (D11): BASE do review. Medido 15/09 (145): commit por task (que o merge pede e o guard-stop cobra) deixou o
# `codex exec review --uncommitted` sem diff e a pai fez `git reset --soft` ate a base para "expor" o diff — 5 commits
# desfeitos com executores vivos. Agora o revisor ve `git diff <base>`, commitado OU nao:
#   --base <ref> | HARNESS_REVIEW_BASE=<ref|auto|none>  (default auto)
#   auto: em branch wt/* = merge-base com a main (HARNESS_MAIN_BRANCH, default main); no checkout principal = o
#         ultimo commit ANTES do start da run deste LABEL (.harness-run/<LABEL>-exec.json); sem marcador = HEAD (3.5.5).
BASE_REF=""
resolve_base() {
  local b="${BASE_ARG:-${HARNESS_REVIEW_BASE:-auto}}" br mb st iso head
  git rev-parse --git-dir >/dev/null 2>&1 || return 0
  head="$(git rev-parse HEAD 2>/dev/null || true)"
  case "$b" in
    ''|none|HEAD) return 0 ;;
    auto)
      br="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
      case "$br" in
        wt/*)
          mb="$(git merge-base "${HARNESS_MAIN_BRANCH:-main}" HEAD 2>/dev/null || git merge-base master HEAD 2>/dev/null || true)"
          [ -n "$mb" ] && [ "$mb" != "$head" ] && BASE_REF="$mb"
          return 0 ;;
      esac
      st="$(grep -o '"start":[0-9]*' "$SCRIPT_DIR/../.harness-run/${LABEL}-exec.json" 2>/dev/null | grep -o '[0-9]*' | head -n1)"
      if [ -n "$st" ]; then
        iso="$(date -d "@$st" '+%Y-%m-%dT%H:%M:%S' 2>/dev/null || date -r "$st" '+%Y-%m-%dT%H:%M:%S' 2>/dev/null || true)"
        [ -n "$iso" ] && mb="$(git rev-list -1 --before="$iso" HEAD 2>/dev/null || true)"
        [ -n "$mb" ] && [ "$mb" != "$head" ] && BASE_REF="$mb"
      fi
      return 0 ;;
    *)
      BASE_REF="$(git rev-parse --verify "$b^{commit}" 2>/dev/null || true)"
      [ -n "$BASE_REF" ] || echo "[external-review] --base '$b' nao resolve para um commit — revisando o working tree (HEAD)." >&2 ;;
  esac
  return 0
}
resolve_base
DIFF_DE="${BASE_REF:-HEAD}"

# 0) Reentrancia: se JA estamos dentro de um agente/revisor externo, nao spawnar outro.
if harness_in_external; then
  echo "[external-review] reentrada detectada (HARNESS_IN_EXTERNAL_REVIEW/AGENT=1) — pulando." >&2
  exit 0
fi

# 1) Bypass historico.
if [ "${HARNESS_SKIP_CODEX_REVIEW:-0}" = "1" ]; then
  echo "[external-review] HARNESS_SKIP_CODEX_REVIEW=1 — revisor externo pulado (modo SOLO: so sherlock)." >&2
  exit 0
fi

# 2) Resolve o provider do revisor externo.
HOST="$(harness_detect_host)"
REVIEWER="${HARNESS_EXTERNAL_REVIEWER:-auto}"
case "$REVIEWER" in
  auto)
    if [ "$HOST" = "codex" ]; then REVIEWER="claude-cli"; else REVIEWER="codex-cli"; fi
    ;;
  codex-cli|claude-cli) : ;;
  none)
    echo "[external-review] HARNESS_EXTERNAL_REVIEWER=none — modo SOLO (so a persona sherlock; NAO e dupla-cega)." >&2
    exit 0
    ;;
  *)
    echo "[external-review] HARNESS_EXTERNAL_REVIEWER invalido ('$REVIEWER') — usando auto." >&2
    if [ "$HOST" = "codex" ]; then REVIEWER="claude-cli"; else REVIEWER="codex-cli"; fi
    ;;
esac

# 2b) Anti-auto-review: revisor externo do MESMO modelo do host nao e dupla-cega.
#     Permitido (configuracao explicita), mas avisado com clareza.
if { [ "$HOST" = "claude" ] && [ "$REVIEWER" = "claude-cli" ]; } || \
   { [ "$HOST" = "codex" ] && [ "$REVIEWER" = "codex-cli" ]; }; then
  echo "[external-review] AVISO: host '$HOST' com revisor '$REVIEWER' — MESMO modelo dos dois lados. Isso NAO e dupla-cega (segunda passada do mesmo modelo); registre como tal." >&2
fi

# 3) Pre-condicoes comuns.
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "[external-review] diretorio atual nao e um git repo — pulando (modo SOLO)." >&2
  exit 0
fi
if [ -n "$BASE_REF" ]; then
  if git diff --quiet "$BASE_REF" 2>/dev/null && [ -z "$(git ls-files --others --exclude-standard 2>/dev/null)" ]; then
    echo "[external-review] nada mudou desde a base ${BASE_REF:0:8} — nada a revisar." >&2
    exit 0
  fi
elif [ -z "$(git status --porcelain)" ]; then
  echo "[external-review] working tree limpo — nada a revisar (sem base resolvida so o nao-commitado conta; em worktree wt/* ou com marcador de run a base e automatica — 3.5.6)." >&2
  exit 0
fi

# 4) Pre-condicoes por provider (indisponivel => modo SOLO explicito, exit 0).
# 3.0.0: o probe (binario no PATH + artefato de login) vive no _delegate-common.sh,
# compartilhado com o broker de delegacao. Aqui so traduzimos "indisponivel" para
# o vocabulario historico deste helper — modo SOLO, exit 0, nunca bloquear o fluxo.
CLAUDE_BIN="${HARNESS_RAG_CLAUDE_BIN:-claude}"
if ! harness_executor_available "$REVIEWER"; then
  echo "[external-review] revisor externo '$REVIEWER' indisponivel (motivo acima) — review em modo SOLO (so a persona sherlock; NAO e dupla-cega)." >&2
  exit 0
fi

# 5) Pasta de relatorios (mesma convencao historica).
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPORTS_DIR="${HARNESS_CODEX_REPORTS:-codex-reviews}"
case "$REPORTS_DIR" in
  /*|[A-Za-z]:*) : ;;
  *) REPORTS_DIR="$PROJECT_ROOT/$REPORTS_DIR" ;;
esac
if ! mkdir -p "$REPORTS_DIR" 2>/dev/null; then
  echo "[external-review] falha ao criar pasta de relatorios: $REPORTS_DIR" >&2
  exit 0
fi
TS="$(date +%Y%m%d-%H%M%S)"
REPORT="$REPORTS_DIR/${LABEL}-ciclo${CICLO}-${TS}.md"

# 5b) ESCOPO DELTA (2.14.0) — quais arquivos mudaram desde o ciclo anterior.
# Impressao digital por ARQUIVO (checksum do patch dele), guardada entre ciclos em
# .claude/.harness-run/. Nao ha commit entre ciclos (a skill nunca commita), entao o
# snapshot e a unica forma de saber o que a correcao do ciclo N-1 realmente tocou.
SAFE_LABEL="$(printf '%s' "$LABEL" | tr -c 'A-Za-z0-9._-' '_')"
STATE_DIR="$SCRIPT_DIR/../.harness-run"
SNAP="$STATE_DIR/review-scope-${SAFE_LABEL}.tsv"
DELTA_FILES=""      # lista (uma por linha) quando o escopo delta VALEU
mkdir -p "$STATE_DIR" 2>/dev/null || true

impressao_atual() {   # <arquivo>\t<checksum do patch/conteudo>
  git diff "$DIFF_DE" --name-only 2>/dev/null | while IFS= read -r f; do
    [ -n "$f" ] || continue
    printf '%s\t%s\n' "$f" "$(git diff "$DIFF_DE" -- "$f" 2>/dev/null | cksum | tr -d ' ')"
  done
  git ls-files --others --exclude-standard 2>/dev/null | while IFS= read -r f; do
    [ -f "$f" ] || continue
    case "$f" in .claude/.harness-run/*|codex-reviews/*) continue ;; esac
    printf '%s\t%s\n' "$f" "$(cksum < "$f" 2>/dev/null | tr -d ' ')"
  done
}

ATUAL="$STATE_DIR/review-scope-${SAFE_LABEL}.now"
impressao_atual > "$ATUAL" 2>/dev/null || : > "$ATUAL"

if [ "$ESCOPO" = "delta" ]; then
  if [ ! -s "$SNAP" ]; then
    echo "[external-review] escopo delta pedido mas nao ha snapshot do ciclo anterior — revisando COMPLETO (seguro)." >&2
    ESCOPO="full"
  else
    # arquivo cuja impressao mudou (ou que nao existia no snapshot) = tocado desde o ciclo anterior
    DELTA_FILES="$(awk -F'\t' 'NR==FNR{h[$1]=$2; next} h[$1]!=$2 {print $1}' "$SNAP" "$ATUAL" 2>/dev/null)"
    if [ -z "$DELTA_FILES" ]; then
      echo "[external-review] AVISO: nenhum arquivo mudou desde o ciclo anterior — a correcao nao tocou codigo? Revisando COMPLETO." >&2
      ESCOPO="full"
    else
      echo "[external-review] escopo DELTA: $(printf '%s\n' "$DELTA_FILES" | wc -l | tr -d ' ') arquivo(s) alterado(s) desde o ciclo $((CICLO-1))." >&2
    fi
  fi
fi

# Teto de tempo do revisor externo (2.3.0): HARNESS_EXTERNAL_REVIEW_TIMEOUT
# (segundos; default 600). Lotes pequenos nao precisam de 10 min de revisor no
# caminho critico — a /dt-exec passa 300 inline para lote <= 2 itens.
EXT_TIMEOUT="$(harness_sane_timeout "${HARNESS_EXTERNAL_REVIEW_TIMEOUT:-600}" 600)"

# Probe de CAPACIDADE + watchdog portavel: 3.0.0 moveu os dois para
# _delegate-common.sh (harness_resolve_timeout_cmd / harness_run_with_timeout),
# compartilhados com o broker. Comportamento identico ao da 2.4.0 — no Git Bash o
# 'timeout' do System32 reprova no probe e o watchdog em shell puro assume, para
# que o revisor externo NUNCA rode sem teto.
TIMEOUT_CMD="$(harness_resolve_timeout_cmd "$EXT_TIMEOUT")"

# 6) Diff a revisar (3.5.6): montado UMA vez, para os dois provedores — tracked desde a base (ou HEAD) + untracked inteiro.
#    FORA do working tree (TMPDIR): dentro do repo, sem .gitignore cobrindo, o proprio arquivo viraria untracked e o `cat`
#    dele para dentro dele mesmo entraria em loop (2.0.0). Escopo delta (2.14.0): so os arquivos tocados desde o ciclo anterior.
DIFF_FILE="${TMPDIR:-/tmp}/external-review-diff-$$.patch"
montar_diff() {
  {
    if [ "$ESCOPO" = "delta" ]; then
      printf '%s\n' "$DELTA_FILES" | while IFS= read -r f; do [ -n "$f" ] || continue; git diff "$DIFF_DE" -- "$f" 2>/dev/null; done
    else
      git diff "$DIFF_DE" 2>/dev/null || git diff 2>/dev/null
    fi
    git ls-files --others --exclude-standard 2>/dev/null | while IFS= read -r f; do
      [ -f "$f" ] || continue
      if [ "$ESCOPO" = "delta" ]; then printf '%s\n' "$DELTA_FILES" | grep -qxF "$f" || continue; fi
      # efemeros do proprio harness fora (estado/backup/relatorios — nao sao "codigo"); binarios/gigantes fora (o revisor le texto)
      case "$f" in .claude/.harness-run/*|codex-reviews/*) continue ;; esac
      case "$f" in *.png|*.jpg|*.jpeg|*.gif|*.pdf|*.zip|*.sqlite|*.db) continue ;; esac
      SZ="$(wc -c < "$f" 2>/dev/null || echo 0)"; [ "${SZ:-0}" -gt 200000 ] && continue
      printf '\n--- ARQUIVO NOVO (untracked): %s ---\n' "$f"; cat "$f" 2>/dev/null
    done
  } > "$DIFF_FILE" 2>/dev/null
}
DIFF_N=0; DIFF_BYTES=0
if [ -n "$BASE_REF" ] || [ "$REVIEWER" = "claude-cli" ] || [ "$DRY_RUN" = 1 ]; then
  montar_diff
  DIFF_BYTES="$(wc -c < "$DIFF_FILE" 2>/dev/null | tr -d ' ')"; : "${DIFF_BYTES:=0}"
  DIFF_N="$( { git diff "$DIFF_DE" --name-only 2>/dev/null; git ls-files --others --exclude-standard 2>/dev/null | grep -vE '^(\.claude/\.harness-run/|codex-reviews/)'; } | grep -c . || true)"
  if [ "$DRY_RUN" = 1 ]; then
    printf 'REVIEW|dry-run|base=%s|arquivos=%s|bytes=%s|escopo=%s|revisor=%s\n' "${BASE_REF:-HEAD}" "$DIFF_N" "$DIFF_BYTES" "$ESCOPO" "$REVIEWER"
    rm -f "$DIFF_FILE" "$ATUAL" "$REPORT" 2>/dev/null; exit 0
  fi
  if [ ! -s "$DIFF_FILE" ]; then
    echo "[external-review] diff vazio — nada a revisar." >&2
    rm -f "$DIFF_FILE" "$ATUAL" "$REPORT" 2>/dev/null; exit 0
  fi
fi

PROMPT_REVIEW="Voce e um revisor de codigo adversarial e independente. Revise o diff abaixo (mudancas de um projeto${BASE_REF:+ desde a base ${BASE_REF:0:8}, commitadas ou nao}) procurando BUGS REAIS: logica errada, casos de borda, seguranca (auth/injecao), idempotencia, datas/timezone, regressao de compatibilidade, erro de sintaxe. NAO comente estilo. Se o repo tiver .claude/PERFIL-PROJETO.md, as armadilhas de la sao a regua da triagem (voce recebe SO o diff — julgue pelo codigo). Formato de saida: lista de achados com severidade (P0 bloqueante / P1 serio / P2 menor), cada um com arquivo:linha, o problema e por que e um bug. Se nao houver achados, diga 'Nenhum achado relevante.' Responda em portugues."
if [ "$ESCOPO" = "delta" ]; then
  PROMPT_REVIEW="$PROMPT_REVIEW ESTE E UM RE-REVIEW (ciclo ${CICLO}): o diff abaixo contem SO os arquivos alterados desde o ciclo anterior, ou seja, as CORRECOES. Duas tarefas, nessa ordem: (1) a correcao resolveu de fato o que se propunha, sem meia-solucao? (2) ela INTRODUZIU bug novo ou quebrou algo adjacente? Voce nao esta vendo o resto da mudanca — se um achado depender de codigo que nao esta no diff, diga isso explicitamente em vez de supor."
fi

cabecalho() { # $1 = comando  $2 = escopo (texto)
  {
    echo "# Review externo (${REVIEWER}) — ${LABEL} (ciclo ${CICLO})"; echo ""
    echo "- **Host da sessao:** ${HOST}"
    echo "- **Timestamp:** $(date -Iseconds 2>/dev/null || date)"
    echo "- **Branch:** $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
    if [ -n "$BASE_REF" ]; then echo "- **Commit base:** ${BASE_REF:0:12} (base do review, 3.5.6) — HEAD $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
    else echo "- **Commit base:** $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"; fi
    echo "- **Comando:** \`$1\`"
    echo "- **Escopo:** $2"
    if [ -n "$DELTA_FILES" ]; then echo "  Arquivos tocados desde o ciclo anterior (achado fora da lista e pre-existente, nao regressao):"; printf '%s\n' "$DELTA_FILES" | sed 's/^/  - /'; fi
    echo ""; echo "---"; echo ""
  } > "$REPORT"
}

# 7) Executa o revisor externo escolhido.
ER_T0="$(date +%s)"; RC=0; MODEL=""
case "$REVIEWER" in
  codex-cli)
    REASON_ARGS=""
    case "$REASONING" in low|medium|high) REASON_ARGS="-c model_reasoning_effort=$REASONING" ;; esac
    if [ -n "$BASE_REF" ]; then
      # 3.5.6 (D11): com base, o Codex recebe o NOSSO diff (commitado + nao commitado desde a base) num arquivo DENTRO do
      # projeto (o sandbox read-only le o cwd), via `codex exec` — o `review --uncommitted` so ve o indice/working tree.
      DIFF_REL=".claude/.harness-run/review-${SAFE_LABEL}-c${CICLO}.patch"
      cp -f "$DIFF_FILE" "$PROJECT_ROOT/$DIFF_REL" 2>/dev/null || DIFF_REL=""
      if [ -n "$DIFF_REL" ]; then
        # 3.5.2: o modelo e do HARNESS (HARNESS_DELEGATE_CODEX_MODEL; vazio = herda o config do CLI)
        MODEL="${HARNESS_DELEGATE_CODEX_MODEL-gpt-5.6-sol}"
        CODEX_MODEL_ARG=""; [ -n "$MODEL" ] && CODEX_MODEL_ARG="--model $MODEL"
        cabecalho "codex ${REASON_ARGS} exec --sandbox read-only ${CODEX_MODEL_ARG} (diff em ${DIFF_REL}: $DIFF_N arquivo(s), $DIFF_BYTES bytes)" "desde a base ${BASE_REF:0:8} — commitado + nao commitado (3.5.6)"
        echo "[external-review] disparando codex exec sobre $DIFF_REL (base ${BASE_REF:0:8}, $DIFF_N arquivo(s); timeout ${EXT_TIMEOUT}s)..." >&2
        # shellcheck disable=SC2086
        HARNESS_IN_EXTERNAL_REVIEW=1 HARNESS_IN_EXTERNAL_AGENT=1 HARNESS_RAG_IN_SUMMARIZE=1 \
          $TIMEOUT_CMD codex $REASON_ARGS exec --sandbox read-only --skip-git-repo-check $CODEX_MODEL_ARG \
            "$PROMPT_REVIEW O diff esta no arquivo $DIFF_REL (relativo a raiz do repo, cwd atual): leia-o INTEIRO com cat antes de responder; nao leia outros arquivos alem dos que o diff cita." >> "$REPORT" 2>&1
        RC=$?
        rm -f "$PROJECT_ROOT/$DIFF_REL" 2>/dev/null
      else
        BASE_REF=""   # nao conseguiu gravar o diff no projeto: caminho legado
      fi
    fi
    if [ -z "$BASE_REF" ]; then
      cabecalho "codex ${REASON_ARGS} exec review --uncommitted" "COMPLETO — \`review --uncommitted\` (so o nao-commitado; nenhuma base resolvida)"
      echo "[external-review] disparando codex exec review --uncommitted (timeout ${EXT_TIMEOUT}s)..." >&2
      # shellcheck disable=SC2086
      HARNESS_IN_EXTERNAL_REVIEW=1 HARNESS_IN_EXTERNAL_AGENT=1 HARNESS_RAG_IN_SUMMARIZE=1 \
        $TIMEOUT_CMD codex $REASON_ARGS exec review --uncommitted >> "$REPORT" 2>&1
      RC=$?
    fi
    ;;
  claude-cli)
    MODEL="${HARNESS_CLAUDE_REVIEW_MODEL:-sonnet}"
    if [ "$ESCOPO" = "delta" ]; then ESC_TXT="DELTA — so os arquivos tocados desde o ciclo $((CICLO-1))"; else ESC_TXT="COMPLETO desde ${BASE_REF:-HEAD} (commitado + nao commitado)"; fi
    cabecalho "claude -p --model ${MODEL} sobre o diff ($DIFF_N arquivo(s), $DIFF_BYTES bytes)" "$ESC_TXT"
    echo "[external-review] disparando claude -p (review do diff, timeout ${EXT_TIMEOUT}s)..." >&2
    # shellcheck disable=SC2086
    HARNESS_IN_EXTERNAL_REVIEW=1 HARNESS_IN_EXTERNAL_AGENT=1 HARNESS_RAG_IN_SUMMARIZE=1 \
      $TIMEOUT_CMD "$CLAUDE_BIN" -p --model "$MODEL" --no-session-persistence \
        --output-format text "$PROMPT_REVIEW" < "$DIFF_FILE" >> "$REPORT" 2>&1
    RC=$?
    ;;
esac
ER_T1="$(date +%s)"
rm -f "$DIFF_FILE" 2>/dev/null

if [ "${RC:-0}" -ne 0 ]; then
  {
    echo ""; echo "---"; echo ""
    echo "**[helper] revisor externo ($REVIEWER) retornou exit code ${RC}.** Relatorio pode estar incompleto."
  } >> "$REPORT"
  echo "[external-review] revisor $REVIEWER retornou exit $RC — relatorio salvo mesmo assim em $REPORT" >&2
fi

# 7b) 3.5.6 (D17, complemento do C7): o review externo entra no MANIFEST de delegacoes (prds/_metrics/delegations/) —
# antes o `codex exec review` nao gravava linha nenhuma e a run fechava com codex="" mesmo em review_modo=dupla; o
# harness-metrics.sh stop (3.5.5) soma o duration_s do rotulo-base e marca codex=ok.
if command -v harness_metrics_arquivo >/dev/null 2>&1 && command -v harness_jsonl_append >/dev/null 2>&1; then
  _j() { printf '%s' "${1:-}" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr -d '\n\r\t'; }
  ER_ST="ok"; [ "${RC:-0}" -eq 0 ] || ER_ST="erro"
  ER_LINE="$(printf '{"ts":"%s","label":"%s","task":"review-c%s","role":"revisor-externo","ciclo":%s,"host":"%s","executor":"%s","cli_version":"n/d","model":"%s","reasoning":"%s","mode":"read-only","status":"%s","exit_code":%s,"duration_s":%s,"timeout_s":%s,"input_bytes":%s,"output_bytes":%s,"max_words":0,"tokens_in":"n/d","tokens_out":"n/d","tokens_cached":"n/d","tokens_fresh":"n/d","tokens_reasoning":"n/d","tokens_fonte":"nao-reportado","tree_tocado":"nao","cost_usd":"n/d","tag":"%s"}' \
    "$(_j "$(date -Iseconds 2>/dev/null || date)")" "$(_j "${LABEL%-fase[12]}")" "${CICLO:-1}" "${CICLO:-1}" "$(_j "$HOST")" "$(_j "$REVIEWER")" "$(_j "${MODEL:-herdado}")" "$(_j "${REASONING:-default}")" "$ER_ST" "${RC:-0}" "$(( ER_T1 - ER_T0 ))" "${EXT_TIMEOUT:-600}" "${DIFF_BYTES:-0}" "$(wc -c < "$REPORT" 2>/dev/null | tr -d ' ')" "$(_j "review externo${BASE_REF:+ base=${BASE_REF:0:8}} escopo=$ESCOPO")")"
  harness_jsonl_append "$(harness_metrics_arquivo "$PROJECT_ROOT" delegations)" "$ER_LINE"
fi

# 8) Snapshot do estado revisado (2.14.0) — base do escopo delta do PROXIMO ciclo.
# Gravado sempre que o revisor rodou, inclusive em erro: o que importa e "ate aqui ja
# passou por revisor". Falha em gravar nao quebra nada (o proximo ciclo cai em full).
mv -f "$ATUAL" "$SNAP" 2>/dev/null || rm -f "$ATUAL" 2>/dev/null || true

# 9) Devolve o path no stdout (UMA linha) — contrato historico.
printf '%s\n' "$REPORT"
exit 0
