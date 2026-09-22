#!/usr/bin/env bash
# .claude/hooks/guard-agent.sh (3.4.2) — PreToolUse Agent, BLOQUEANTE.
# Garante, por ENFORCEMENT (nao por instrucao), o passo 0 da Fase 1.3 da /prd-exec:
#   1. executor (hefesto/dedalo) so e despachado com TASK PACKET pronto
#      (.claude/.harness-run/packets/TASK-NNN.packet.md existe);
#   2. task ELEGIVEL a duelo so vai ao hefesto depois que o duelo rodou
#      (.claude/.harness-run/duelos/*-TASK-NNN-* existe), quando o duelo esta ativo na maquina.
# Motivo (PRD-125, 23/08/2026): a skill dizia; a sessao leu, julgou "opcional" e mandou
# TASK-002/003/005 direto ao hefesto (22+ min seriais cada). Instrucao nao segura; hook segura.
#
# Nega com exit 2 + orientacao no stderr (o modelo se autocorrige na hora, sem humano).
# Desligar: HARNESS_GUARD_AGENT=0 · so o duelo: HARNESS_SKIP_DUELO=1 / HARNESS_DUELO=off.
# 3.4.22: general-purpose e NEGADO para despacho de task com packet e review de ciclo (papel certo na cara); sherlock/beholder/michelangelo tem guard de packet e ciclos; themis passa.
# 3.4.25 (melhoria 4): no --post, relatorio com verificacao declarada SEM PROVA (task-telemetry: verif_sem_prova > 0) vira aviso [relatorio] + incidente `relatorio`; os avisos do --post saem num unico additionalContext.

set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# 3.4.2: chaves PESSOAIS por maquina, validas para todos os projetos (o Claude Desktop nao herda setx
# feito depois de aberto): ~/.harness.env.local (chmod 600). Nunca versionado. Precedencia: env > user > projeto.
# 3.5.7: camadas de configuracao — hooks/_env.sh carrega _defaults.env -> harness.env -> harness.env.local -> ~/.harness.env.local
# (ambiente da sessao vence). Antes cada hook tinha o proprio loop.
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_env.sh"
[ "${HARNESS_GUARD_AGENT:-1}" = "1" ] || exit 0
# 3.4.23 (item 15g): incidente com schema unico em prds/_metrics/incidentes/<dev>@<host>.jsonl
# shellcheck disable=SC1091
[ -f "$SCRIPT_DIR/_incidente.sh" ] && . "$SCRIPT_DIR/_incidente.sh"
command -v harness_incidente >/dev/null 2>&1 || harness_incidente() { return 0; }
MODE="pre"; [ "${1:-}" = "--post" ] && MODE="post"
INPUT="$(cat 2>/dev/null)"; [ -n "$INPUT" ] || exit 0
if command -v jq >/dev/null 2>&1; then
  TIPO="$(printf '%s' "$INPUT" | jq -r '.tool_input.subagent_type // empty' 2>/dev/null)"
  PROMPT="$(printf '%s' "$INPUT" | jq -r '(.tool_input.prompt // "") + " " + (.tool_input.description // "")' 2>/dev/null)"
  DESC="$(printf '%s' "$INPUT" | jq -r '.tool_input.description // empty' 2>/dev/null)"
else
  TIPO="$(printf '%s' "$INPUT" | grep -o '"subagent_type"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*:[[:space:]]*"([^"]*)"/\1/')"
  PROMPT="$(printf '%s' "$INPUT" | tr -d '\n')"
  DESC="$(printf '%s' "$INPUT" | grep -o '"description"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*:[[:space:]]*"([^"]*)"/\1/')"
fi
# 3.5.4b (14/09 22:16): a TASK do despacho e (1) a do packet citado no prompt, (2) a da description, (3) so entao o 1o
# rotulo do prompt. Medido na /dt-exec da wt-dt-cancelamento: o prompt do executor abria com "rescaldo do DT-592" e o
# guard exigiu packets/DT-592.packet.md para um dedalo da DT-593 — os 3 executores do lote negados duas vezes.
rotulo_do_despacho() { # -> TASK-NNN | DT-NNN | vazio
  local _t
  _t="$(printf '%s' "$PROMPT" | grep -oE 'packets/(TASK|DT)-[0-9]{2,4}[a-z]?\.packet\.md' | head -1 | grep -oE '(TASK|DT)-[0-9]{2,4}[a-z]?')"
  [ -n "$_t" ] || _t="$(printf '%s' "${DESC:-}" | grep -oE '(TASK|DT)-[0-9]{2,4}[a-z]?' | head -1)"
  [ -n "$_t" ] || _t="$(printf '%s' "$PROMPT" | grep -oE '(TASK|DT)-[0-9]{2,4}[a-z]?' | head -1)"
  printf '%s' "$_t"
}
deny() { printf '%s\n' "$*" >&2; exit 2; }

# 3.5.5 (C5): papel FORA DO CATALOGO durante uma skill do harness — AVISA (additionalContext), nao nega; os guards abaixo
# seguem valendo (barreira do general-purpose com packet/ciclo continua negando). Medido 15/09 (PRD-141-b): a /prd em MODO
# LEVE despachou `general-purpose` (sonnet) para o discovery de DTs, pulando a ROTA (Codex, modo apoio) e o papel
# peter-quill — sem contrato de saida, sem effort no frontmatter, telemetria com papel generico. HARNESS_GUARD_AGENT_CATALOGO=off desliga.
if [ "$MODE" = "pre" ] && [ "${HARNESS_GUARD_AGENT_CATALOGO:-on}" != "off" ]; then
  case "$TIPO" in
    general-purpose|Explore|Plan|claude)
      _RUNS="$(ls "$ROOT"/.claude/.harness-run/*-fase1.json "$ROOT"/.claude/.harness-run/*-fase2.json "$ROOT"/.claude/.harness-run/*-exec.json "$ROOT"/.claude/.harness-run/_auto-*.json 2>/dev/null | head -3 | sed -E 's#.*/##; s/\.json$//' | tr '\n' ' ')"
      if [ -n "$_RUNS" ]; then
        _AV="[guard-agent] '$TIPO' despachado durante uma skill do harness (${_RUNS% }). Papel fora do catalogo: sem contrato de saida, sem effort no frontmatter, telemetria generica. Discovery/scout = peter-quill (ou a ROTA: bash .claude/hooks/harness-delegate.sh --rota discovery-dts, que pode mandar ao Codex); implementacao = hefesto/dedalo; review = sherlock. Siga so se for utilitario de verdade (leitura ampla sem papel)."
        if command -v jq >/dev/null 2>&1; then printf '%s' "$_AV" | jq -Rs '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:.}}'; else printf '%s\n' "$_AV" >&2; fi
      fi ;;
  esac
fi

# ---- PRESENCA DO SUBAGENTE ANUNCIADA PELO PAI (3.4.14) ----
# Agente 100% read-only (tony-stark, peter-quill...) nunca dispara PostToolUse com o matcher
# enxuto (Bash|Agent|Task|Write|Edit) e por isso nao existia no painel do Caronte. Este hook ja
# roda no despacho (pre) e no retorno (post) de TODO Agent: aqui o pai anuncia o agente com
# --agent-start/--agent-end (zero spawn novo por ferramenta do agente). Em background, nunca
# bloqueia; so no exit 0 do pre (despacho negado nao vira bonequinho). HARNESS_SKIP_PRESENCE=1 desliga.
_anuncia_agente() {
  local _ev="$1"
  # 3.4.17: o anuncio oficial saiu daqui e foi para os hooks SubagentStart/SubagentStop
  # (settings.json), que trazem agent_id — aqui nao existe id e dois agentes do mesmo tipo
  # colidiam na mesma linha. Este caminho fica so como fallback opt-in (CLI sem Subagent*):
  # HARNESS_PRESENCE_ANUNCIA_PRE=1. Ligado junto com os hooks novos, DUPLICA linhas.
  [ "${HARNESS_PRESENCE_ANUNCIA_PRE:-0}" = "1" ] || return 0
  [ "${HARNESS_SKIP_PRESENCE:-0}" = "1" ] && return 0
  [ -n "$TIPO" ] || return 0
  case "$TIPO" in general-purpose|Explore|Plan|claude) return 0 ;; esac   # utilitarios sem papel no painel
  [ -f "$SCRIPT_DIR/presence.mjs" ] && command -v "${HARNESS_RAG_NODE:-node}" >/dev/null 2>&1 || return 0
  ( printf '%s' "$INPUT" | "${HARNESS_RAG_NODE:-node}" "$SCRIPT_DIR/presence.mjs" "--agent-$_ev" "$TIPO" >/dev/null 2>&1 & ) 2>/dev/null
  return 0
}
if [ "$MODE" = "pre" ]; then
  trap '_rc=$?; [ "$_rc" -eq 0 ] && _anuncia_agente start; exit $_rc' EXIT
else
  _anuncia_agente end
fi

# ---- WATCHDOG por p90 (3.4.7 — melhoria #13; 3.4.22 sem marcador .start) ----
# Post (--post, PostToolUse Agent): le a linha que o SubagentStop acabou de gravar para este
# papel (task-telemetry.mjs, item 8 — duracao real, turnos, status) e compara com o teto do
# papel (watchdog-baseline.sh = FATOR x p90 local, agora derivado das proprias linhas). No
# estouro, avisa a sessao via additionalContext — o ponto acionavel para dividir/replanejar
# (caso LOTE-028: 5h37 para 1 task). O lado de DENTRO do agente e o guard-folego.mjs (item 7):
# acima do teto de chamadas do papel ele NEGA e o agente devolve PARCIAL-TEMPO. Os marcadores
# .harness-run/watchdog/*.start da 3.4.7 nao existem mais (16 orfaos medidos em 04/09; o doctor
# limpa os antigos). Desligar: HARNESS_WATCHDOG=0.
_ultima_task() { # $1 = papel -> "dur_s|turnos|rotulo|agent_id|status|verif_sem_prova" da linha mais recente (<= 3 min) ou vazio
  [ -f "$SCRIPT_DIR/task-telemetry.mjs" ] && command -v "${HARNESS_RAG_NODE:-node}" >/dev/null 2>&1 || return 0
  (cd "$ROOT" && "${HARNESS_RAG_NODE:-node}" "$SCRIPT_DIR/task-telemetry.mjs" --ultima "$1" 180 2>/dev/null)
}
# 3.4.25: os avisos do --post (relatorio, hermes, watchdog) saem num UNICO additionalContext.
POST_MSG=""
_post_add() { POST_MSG="${POST_MSG:+$POST_MSG }$1"; }
_post_flush() {
  if [ -n "$POST_MSG" ]; then
    if command -v jq >/dev/null 2>&1; then
      printf '%s' "$POST_MSG" | jq -Rs '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:.}}'
    else
      printf '%s\n' "$POST_MSG" >&2
    fi
  fi
  exit 0   # --post NUNCA nega nada — so mede e avisa
}
if [ "$MODE" = "post" ]; then
  UT=""; case "$TIPO" in hefesto|dedalo|sherlock|beholder|michelangelo|ariadne|hermes|atlas|tony-stark|peter-quill) UT="$(_ultima_task "$TIPO")" ;; esac
  UT_DUR="${UT%%|*}"; UT_REST="${UT#*|}"; UT_TURNOS="${UT_REST%%|*}"; UT_REST="${UT_REST#*|}"; UT_ROT="${UT_REST%%|*}"; UT_REST="${UT_REST#*|}"; UT_ID="${UT_REST%%|*}"; UT_REST="${UT_REST#*|}"
  # 3.4.25: 6o campo = verif_sem_prova (ausente numa linha antiga de 5 campos => vazio)
  case "$UT_REST" in *"|"*) UT_STATUS="${UT_REST%%|*}"; UT_VSP="${UT_REST#*|}" ;; *) UT_STATUS="$UT_REST"; UT_VSP="" ;; esac
  UT_ITENS=""; case "$UT_VSP" in *"|"*) UT_ITENS="${UT_VSP#*|}"; UT_VSP="${UT_VSP%%|*}" ;; esac   # 3.5.6 (D9): 7o campo = QUAIS itens sem prova
  # ---- RELATORIO AUDITADO (3.4.25 — melhoria 4): "relatorio honesto" era instrucao; agora e medido.
  # O task-telemetry avaliou a secao "## Verificacoes" do relatorio: item que declara sucesso sem
  # saida colada (fence, `saida:`/`>`, caminho de log) e verificacao SEM PROVA. Aqui a sessao-pai
  # fica sabendo no retorno, antes do gate — e o incidente fica versionado (tipo `relatorio`).
  if [ "${HARNESS_VERIF_PROVA:-on}" != "off" ] && [ -n "$UT_VSP" ] && [ "$UT_VSP" -gt 0 ] 2>/dev/null; then
    HARNESS_INCIDENTE_ROOT="$ROOT" harness_incidente relatorio "$TIPO" "$UT_ROT" "$UT_ID" "verif_sem_prova=$UT_VSP status=${UT_STATUS:-} turnos=${UT_TURNOS:-?}"
    _post_add "[relatorio] $TIPO (${UT_ROT:-avulso}) declarou $UT_VSP verificação(ões) sem saída colada${UT_ITENS:+ — quais: $UT_ITENS} — trate como NÃO verificadas: rode você a verificação ou redespache pedindo a saída (fence com o comando e o resultado em '## Verificações'); Status rebaixado para ⚠️ na telemetria (incidente 'relatorio' gravado)."
  fi
  # ---- 3.5.6 (DT-011): DIFF DO DUELO — o executor que recebeu DUELO|ok declara `**Diff do duelo:** aplicado|parcial|reescrito (motivo) — <id>`
  # no relatorio; aqui a linha vira o evento `aplicado` (6 de 32 vencedores dos ultimos 50 duelos nunca souberam se foram usados).
  # Sem a linha, com duelo vencido para a task: aviso a pai. HARNESS_DUELO_APLICADO_AUTO=off desliga.
  if [ "${HARNESS_DUELO_APLICADO_AUTO:-on}" != "off" ] && [ -n "$UT_ROT" ] && [ -f "$SCRIPT_DIR/harness-duelo.sh" ]; then
    case "$TIPO" in hefesto|dedalo)
      _REL="$ROOT/.claude/.harness-run/relatorios/$UT_ROT-$TIPO.md"
      _DL="$(grep -iE '^[[:space:]]*\**Diff do duelo:?\**' "$_REL" 2>/dev/null | head -1)"
      _DID="$(ls -d "$ROOT"/.claude/.harness-run/duelos/*-"$UT_ROT"-* 2>/dev/null | sed 's#.*/##' | sort | tail -1)"
      _DID2="$(printf '%s' "$_DL" | grep -oE '(PRD|LOTE|DT)-[0-9]+(-[a-z])?-(TASK|DT)-[0-9]+[a-z]?-[0-9]{6}' | head -1)"; [ -n "$_DID2" ] && _DID="$_DID2"
      if [ -n "$_DID" ] && cat "$ROOT"/prds/_metrics/duelos/*.jsonl "$ROOT"/prds/_metrics/harness-duelos.jsonl 2>/dev/null | grep -F "\"ev\":\"veredito\",\"id\":\"$_DID\"" | grep -qE '"vencedor":"[AB]"'; then
        if ! cat "$ROOT"/prds/_metrics/duelos/*.jsonl "$ROOT"/prds/_metrics/harness-duelos.jsonl 2>/dev/null | grep -qF "\"ev\":\"aplicado\",\"id\":\"$_DID\""; then
          if [ -n "$_DL" ]; then
            _MOT="$(printf '%s' "$_DL" | sed -E 's/^[[:space:]]*\**Diff do duelo:?\**[[:space:]]*//' | tr -d '"' | cut -c1-140)"
            _RES="falhou"; printf '%s' "$_MOT" | grep -qiE '^(aplicado|parcial)' && _RES="ok"
            if bash "$SCRIPT_DIR/harness-duelo.sh" --aplicado "$_DID" --resultado "$_RES" --motivo "$_MOT" >/dev/null 2>&1; then
              _post_add "[duelo] linha 'Diff do duelo' do relatorio ($UT_ROT): $_MOT → evento aplicado=$_RES registrado para $_DID (3.5.6)."
            fi
          else
            _post_add "[duelo] $TIPO ($UT_ROT) recebeu o diff vencedor do duelo $_DID e o relatorio NAO traz a linha '**Diff do duelo:** aplicado | parcial | reescrito (motivo)'. Registre agora: bash .claude/hooks/harness-duelo.sh --aplicado $_DID --resultado ok|falhou --motivo \"...\" — sem isso o placar conta o vencedor como desconhecido (DT-011)."
          fi
        fi
      fi ;;
    esac
  fi
  # ---- 3.5.7 (E5): TASK ✅ SEM COMMIT — commit POR TASK e passo mecanico do fechamento em worktree (wt/*). Medido 16/09
  # (140-b, exec noturna): 7 tasks fechadas, 1 commit so no fim, 27 arquivos soltos no working tree — a 144, na mesma
  # noite, commitou 8/9. Aqui, no retorno de CADA executor, as tasks ✅ desta run fechadas ha mais de 60 s sem commit
  # que as cite viram UM aviso (a que acabou de voltar ainda nao teve tempo). Marcador evita repetir o mesmo aviso
  # por 15 min. So em branch wt/* (no checkout principal o usuario commita — Fase 3). HARNESS_GUARD_COMMIT_TASK=off.
  if [ "${HARNESS_GUARD_COMMIT_TASK:-on}" != "off" ] && [ -f "$SCRIPT_DIR/task-telemetry.mjs" ] && command -v "${HARNESS_RAG_NODE:-node}" >/dev/null 2>&1; then
    case "$TIPO" in hefesto|dedalo)
      _BR="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null)"
      case "$_BR" in wt/*)
        _RUNM="$(ls "$ROOT"/.claude/.harness-run/PRD-*-exec.json "$ROOT"/.claude/.harness-run/LOTE-*.json 2>/dev/null | head -1)"
        _T0="$(grep -oE '"start"[[:space:]]*:[[:space:]]*[0-9]+' "$_RUNM" 2>/dev/null | grep -oE '[0-9]+$' | head -1)"
        if [ -n "$_T0" ]; then
          _SEMC=""; _AGORA="$(date +%s)"
          while IFS='|' read -r _rot _ts _pap; do
            [ -n "$_rot" ] || continue
            [ "$_rot" = "$UT_ROT" ] && continue
            [ $(( _AGORA - _ts )) -ge 60 ] || continue
            git -C "$ROOT" log -60 --format=%s 2>/dev/null | grep -qF "$_rot" && continue
            _MK="$ROOT/.claude/.harness-run/commit-aviso-$_rot"
            if [ -f "$_MK" ] && [ $(( _AGORA - $(stat -c %Y "$_MK" 2>/dev/null || echo 0) )) -lt 900 ]; then continue; fi
            touch "$_MK" 2>/dev/null; _SEMC="${_SEMC:+$_SEMC, }$_rot"
          done <<EOF_FC
$(cd "$ROOT" && "${HARNESS_RAG_NODE:-node}" "$SCRIPT_DIR/task-telemetry.mjs" --fechadas "$_T0" 2>/dev/null)
EOF_FC
          if [ -n "$_SEMC" ]; then
            _NSUJO="$(git -C "$ROOT" status --porcelain 2>/dev/null | grep -vcE '^\?\? \.claude/' | tr -d ' ')"
            HARNESS_INCIDENTE_ROOT="$ROOT" harness_incidente commit "$TIPO" "$UT_ROT" "$UT_ID" "sem_commit=$_SEMC sujos=${_NSUJO:-0}"
            _post_add "[commit] task(s) ✅ desta run SEM commit que as cite: $_SEMC (working tree com ${_NSUJO:-0} arquivo(s) alterado(s)). Commit POR TASK e passo mecanico do fechamento em worktree (3.5.7/E5 — medido 16/09, 140-b: 7 tasks, 1 commit, 27 arquivos soltos): antes do proximo despacho, para cada uma: git add -- <arquivos da task> && git commit -m \"<tipo>(<PRD>): <TASK> — <titulo>\". Nunca git add -A."
          fi
        fi ;;
      esac ;;
    esac
  fi
  # ---- DIETA DO HERMES (3.4.11) — aviso, nunca nega ----
  # Medido 01/09: tasks 2,6x maiores (371-403 linhas contra 133-177 ate a 3.4.8) e Modo C com
  # 226-398 turnos por ciclo. Aqui a sessao fica sabendo NO RETORNO do hermes, antes do gate.
  if [ "$TIPO" = "hermes" ]; then
    H_MSG=""
    HP="$(printf '%s' "$PROMPT" | grep -oE 'PRD-[0-9]{3,5}(-[a-z])?\b' | head -1)"
    if [ -n "$HP" ]; then
      H_N="$(ls "$ROOT"/prds/"$HP"-*/tasks/TASK-*.md 2>/dev/null | wc -l | tr -d ' ')"
      if [ "${H_N:-0}" -gt 0 ] 2>/dev/null; then
        H_TOT="$(cat "$ROOT"/prds/"$HP"-*/tasks/TASK-*.md 2>/dev/null | wc -l | tr -d ' ')"
        H_AVG=$(( ${H_TOT:-0} / H_N ))
        if [ "$H_AVG" -gt "${HARNESS_TASK_MAX_LINHAS:-230}" ] 2>/dev/null; then
          H_MSG="[hermes] tasks da $HP com media de ${H_AVG} linhas (teto ~180 — 3.4.11): task grande dobra o custo de cada gate e do Modo C. Antes do gate, peca ao hermes para reduzir as tasks as camadas que elas exigem (E2E como lista, sem codigo de referencia com spec precedente, rollback so com migration)."
        fi
      fi
    fi
    # 3.4.22 (item 14): o teto de chamadas do hermes e DENY do guard-folego (HARNESS_FOLEGO_hermes,
    # 120). Aqui so o aviso de que o retorno veio PARCIAL — a pai despacha outro lote por documento.
    if [ "$UT_STATUS" = "PARCIAL" ] || { [ -n "$UT_TURNOS" ] && [ "${UT_TURNOS:-0}" -ge "${HARNESS_FOLEGO_hermes:-120}" ] 2>/dev/null; }; then
      H_MSG="${H_MSG:+$H_MSG }[hermes] retorno PARCIAL (${UT_TURNOS:-?} turnos; teto ${HARNESS_FOLEGO_hermes:-120} enforcado pelo guard-folego): leia 'Decisoes pendentes'/'o que falta' no relatorio e despache o restante em OUTRO hermes por documento (um Read + um Write por documento), na mesma mensagem se forem varios."
    fi
    if [ -n "$H_MSG" ]; then _post_add "$H_MSG"; _post_flush; fi
  fi
  if [ "${HARNESS_WATCHDOG:-1}" = "1" ] && [ -n "$UT_DUR" ]; then
    case "$UT_DUR" in ''|*[!0-9]*) _post_flush ;; esac
    WD_TETO="$(bash "$SCRIPT_DIR/watchdog-baseline.sh" --teto "$TIPO" 2>/dev/null)"
    case "$WD_TETO" in ''|*[!0-9]*) _post_flush ;; esac
    WD_MSG=""
    if [ "$UT_DUR" -gt "$WD_TETO" ]; then
      printf '{"ts":%s,"papel":"%s","ref":"%s","agent":"%s","dur_s":%s,"teto_s":%s,"turnos":"%s","status":"%s"}\n' \
        "$(date +%s)" "$TIPO" "$UT_ROT" "$UT_ID" "$UT_DUR" "$WD_TETO" "$UT_TURNOS" "$UT_STATUS" \
        >> "$ROOT/.claude/.harness-run/watchdog-overruns.jsonl" 2>/dev/null
      HARNESS_INCIDENTE_ROOT="$ROOT" harness_incidente overrun "$TIPO" "$UT_ROT" "$UT_ID" "dur_s=$UT_DUR teto_s=$WD_TETO turnos=${UT_TURNOS:-?} status=${UT_STATUS:-}"
      WD_MSG="[watchdog] $TIPO (${UT_ROT:-avulso}) levou $(( UT_DUR / 60 ))min em ${UT_TURNOS:-?} turnos — acima do teto de $(( WD_TETO / 60 ))min (${HARNESS_WATCHDOG_FATOR:-2}x o p90 local do papel). Antes da proxima onda, avalie: o retorno esta completo ou PARCIAL? A task merece ser dividida/replanejada? Registre a decisao no Output (1 linha). Overrun logado em .harness-run/watchdog-overruns.jsonl."
    elif [ "$UT_STATUS" = "PARCIAL" ] || [ "$UT_STATUS" = "⛔" ]; then   # 3.4.30: ⛔ (ultimo texto = Write negado) tambem e corte de folego
      WD_MSG="[watchdog] $TIPO (${UT_ROT:-avulso}) devolveu PARCIAL-TEMPO (${UT_TURNOS:-?} turnos, $(( UT_DUR / 60 ))min — o guard-folego negou acima do teto do papel). Leia o relatorio: o que falta vira task menor/redespacho unico com o contexto do parcial; registre a decisao no Output (1 linha)."
      WD_MSG="$WD_MSG NAO marque ${UT_ROT:-a task} como concluida: abra .claude/.harness-run/relatorios/${UT_ROT:-<task>}-$TIPO.md, secao 'O que FALTA', e redespache UMA vez so o que falta (medido 09/09, PRD-140 TASK-003: backend ok, spec E2E nunca escrito e a exec seguiu como concluida)."
    fi
    [ -n "$WD_MSG" ] && _post_add "$WD_MSG"
  fi
  _post_flush   # --post NUNCA nega nada — so mede e avisa
fi

# ---- BARREIRA DO general-purpose (3.4.22 — item 7b) ----
# Medido 29/08-04/09: 5 general-purpose despachados na janela para trabalho de task/review — sem
# contrato, sem packet, sem guard, sem teto. Despacho de TASK/DT com packet, ou de review "ciclo N",
# tem papel no panteao: o guard aponta o agente certo. Escapes: prompt que declara `fallback`
# (agente indisponivel — regra das skills) e HARNESS_GUARD_GP=off. Discovery/votacao da /prd
# (rotulo PRD sem packet/task) continua passando.
if [ "$TIPO" = "general-purpose" ] && [ "${HARNESS_GUARD_GP:-on}" != "off" ] && ! printf '%s' "$PROMPT" | grep -qiE 'fallback'; then
  GP_T="$(printf '%s' "$PROMPT" | grep -oE '(TASK|DT)-[0-9]{2,4}[a-z]?' | head -1)"
  if [ -n "$GP_T" ] && printf '%s' "$PROMPT" | grep -qiE '\.packet\.md|implement|execute a task|forje|construa'; then
    GP_PAPEL="hefesto"; printf '%s' "$PROMPT" | grep -qiE 'front|tela|componente|css|dedalo' && GP_PAPEL="dedalo"
    deny "[guard-agent] general-purpose NAO executa task ($GP_T): sem contrato, sem teto de folego, sem packet. Despache subagent_type=\"$GP_PAPEL\" com o mesmo prompt (o packet e o contrato do papel viajam com ele). Agente indisponivel de verdade? escreva 'fallback: $GP_PAPEL -> general-purpose' no prompt e registre no Output. Knob: HARNESS_GUARD_GP=off."
  fi
  if printf '%s' "$PROMPT" | grep -qiE 'ciclo[ _-]?[0-9]+' && printf '%s' "$PROMPT" | grep -qiE 'review|revis|red-team|gate|bloqueante'; then
    GP_PAPEL="sherlock"; printf '%s' "$PROMPT" | grep -qiE 'PRD-[0-9]{3,5}' && ! printf '%s' "$PROMPT" | grep -qiE 'working tree|diff|codigo' && GP_PAPEL="beholder"
    deny "[guard-agent] general-purpose NAO faz gate/review de ciclo: use subagent_type=\"$GP_PAPEL\" (ou michelangelo para UX) — o packet e o teto de ciclos so valem para os papeis do panteao. Agente indisponivel? 'fallback: $GP_PAPEL -> general-purpose' no prompt. Knob: HARNESS_GUARD_GP=off."
  fi
fi

# 3.5.7 (E6): qualquer Agent despachado durante uma RUN VIVA renova o heartbeat da frente — a Fase 2 (sherlock,
# michelangelo, hermes de correcao: 45 min sem hefesto/dedalo) deixava o slot expirar no meio da exec (medido 16/09:
# a 144 perdeu a vaga em review e a 140-b decolou junto; as duas dividiram o spawn). Em background, nunca bloqueia.
if [ "$MODE" = "pre" ] && [ "${HARNESS_FRENTES:-on}" != "off" ] && [ -n "$TIPO" ] && [ -f "$SCRIPT_DIR/frentes.mjs" ]; then
  case "$TIPO" in
    hefesto|dedalo|general-purpose|Explore|Plan|claude) : ;;   # executores adquirem/renovam abaixo; utilitarios nao contam
    *)
      _RUNM="$(ls "$ROOT"/.claude/.harness-run/PRD-*-exec.json "$ROOT"/.claude/.harness-run/LOTE-*.json "$ROOT"/.claude/.harness-run/_auto-*-exec.json 2>/dev/null | head -1)"
      if [ -n "$_RUNM" ] && command -v "${HARNESS_RAG_NODE:-node}" >/dev/null 2>&1; then
        _HBL="$(printf '%s' "$PROMPT" | grep -oE 'LOTE-[0-9]{3,5}' | head -1)"
        [ -n "$_HBL" ] || _HBL="$(printf '%s' "$PROMPT" | grep -oE 'PRD-[0-9]{3,5}(-[a-z])?\b' | head -1)"
        [ -n "$_HBL" ] || _HBL="$(basename "$_RUNM" .json | sed -E 's/-exec$//; s/^_auto-//')"
        ( "${HARNESS_RAG_NODE:-node}" "$SCRIPT_DIR/frentes.mjs" heartbeat --label "$_HBL" >/dev/null 2>&1 & ) 2>/dev/null
      fi ;;
  esac
fi
# TETO DE CICLOS tambem para a metade INTERNA do review (3.4.3): sherlock/beholder/michelangelo
# convocados para "ciclo N" alem do teto sao negados — a regra vale para os dois lados da dupla-cega.
# ---- RESGATE DO CRONOMETRO DA CRIACAO (3.4.29). A telemetria da Fase 1 da /prd dependia de UMA linha
# da skill (`start PRD-NNN-fase1`, Passo 1) — a PRD-140 (09/09) rodou o baseline e pulou o start: Fase 1
# inteira sem duracao. O prompt /prd ja liga _auto-prd-fase1 (harness-metrics-auto.sh); aqui e a 2a rede:
# o 1o agente da criacao que cita PRD-NNN sem marcador nenhum dessa PRD liga o cronometro sozinho.
# Fase: fase1; se a fase1 dessa PRD ja esta gravada nos runs, e a fase2 (retomada apos o aceite).
# Nunca bloqueia. Fora da criacao (marcador *-exec da PRD, _auto-dt-exec, prompt com packet de task) passa.
if [ "${HARNESS_METRICS_AUTO:-1}" = "1" ]; then
  case "$TIPO" in
    peter-quill|tony-stark|atlas|ariadne|beholder|michelangelo|dedalo|hermes|themis|prometeu)
      PL="$(printf '%s' "$PROMPT" | grep -oE 'PRD-[0-9]{3,5}(-[a-z])?\b' | head -1)"
      RD="$ROOT/.claude/.harness-run"
      TEM=0   # `ls a b c` falha se QUALQUER um faltar — testar um a um (medido na suite: resgate rodava sempre)
      for f in "$RD/$PL-fase1.json" "$RD/$PL-fase2.json" "$RD/$PL"-exec*.json; do [ -e "$f" ] && TEM=1; done
      # 3.4.31b: PRD que JA teve exec (runs com PRD-NNN-exec*) esta na execucao/fix, nao na criacao — medido 10/09 09:26:
      # apos o stop da exec da PRD-140, um agente do ciclo de fix citou PRD-140 sem marcador e o resgate abriu PRD-140-fase1.
      grep -qs "\"label\":\"$PL-exec" "$ROOT"/prds/_metrics/runs/*.jsonl "$ROOT"/prds/_metrics/harness-runs.jsonl 2>/dev/null && TEM=1
      ls "$RD"/_auto-*.json >/dev/null 2>&1 && TEM=1
      if [ -n "$PL" ] && [ "$TEM" = 0 ] && ! printf '%s' "$PROMPT" | grep -qE '\.packet\.md'; then
        FASE="fase1"
        grep -qs "\"label\":\"$PL-fase1\"" "$ROOT"/prds/_metrics/runs/*.jsonl "$ROOT"/prds/_metrics/harness-runs.jsonl 2>/dev/null && FASE="fase2"
        bash "$SCRIPT_DIR/harness-metrics.sh" start "$PL-$FASE" >/dev/null 2>&1 || true
      fi ;;
  esac
fi

case "$TIPO" in
  sherlock|beholder|michelangelo)
    MAXC="${HARNESS_REVIEW_MAX_CICLOS:-3}"; case "$MAXC" in ''|*[!0-9]*) MAXC=3 ;; esac
    CN="$(printf '%s' "$PROMPT" | grep -oiE 'ciclo[ _-]?[0-9]+' | grep -oE '[0-9]+' | head -1)"
    if [ -n "$CN" ] && [ "$MAXC" -gt 0 ] 2>/dev/null && [ "$CN" -gt "$MAXC" ] 2>/dev/null; then
      deny "[guard-agent] $TIPO em ciclo $CN > teto absoluto $MAXC (HARNESS_REVIEW_MAX_CICLOS). Achado que sobreviveu aos ciclos e DECISAO HUMANA (10.3) ou DT — nao rode outro ciclo de gate."
    fi
    # PACKET DE REVISAO DA CRIACAO obrigatorio (3.4.15): beholder/michelangelo convocados para
    # "ciclo N" de uma PRD leem o prd-packet (produto + tecnica + indice das tasks), nao a pasta
    # inteira (300-425 KB, 18-28 min por passada). Pre-gate (7.2) e michelangelo Modo A (exec) nao
    # dizem "ciclo" e passam. HARNESS_GUARD_PRD_PACKET=0 desliga.
    if [ "$TIPO" != "sherlock" ] && [ "${HARNESS_GUARD_PRD_PACKET:-1}" = "1" ] && [ -n "$CN" ]; then
      PLBL="$(printf '%s' "$PROMPT" | grep -oE 'PRD-[0-9]{3,5}(-[a-z])?\b' | head -1)"
      if [ -n "$PLBL" ] && [ ! -s "$ROOT/.claude/.harness-run/review/$PLBL.prd-packet.md" ]; then
        deny "[guard-agent] $TIPO ciclo $CN da $PLBL sem PACKET DE REVISAO (3.4.15). Rode ANTES, na mesma mensagem:
  bash .claude/hooks/prd-packet.sh --label $PLBL
e aponte o prompt para o packet ('seu contexto esta em <caminho>; abra uma task inteira SO se um achado exigir'). Remonte a cada ciclo (as correcoes mudam os documentos)."
      fi
    fi
    # REVIEW PACKET obrigatorio no sherlock com rotulo (3.4.7 — melhoria #4, mesmo principio do
    # task-packet): a 3.4.5 criou a dieta, mas prompt antigo mandava reler PRD/Perfil inteiros
    # (parte dos 166-488M tokens_total/exec). Sem rotulo PRD/LOTE = uso avulso, passa.
    if [ "$TIPO" = "sherlock" ] && [ "${HARNESS_GUARD_REVIEW_PACKET:-1}" = "1" ]; then
      # 3.4.22 (item 20.2): o sufixo de FATIA (PRD-136-b) faz parte do rotulo do packet; aceita
      # tambem o packet da mae quando o prompt cita a fatia (incidente 04/09: exigido como PRD-136).
      RLBL="$(printf '%s' "$PROMPT" | grep -oE '(PRD|LOTE)-[0-9]{2,4}(-[a-z])?\b' | head -1)"
      RLBL_MAE="$(printf '%s' "$RLBL" | sed -E 's/-[a-z]$//')"
      if [ -n "$RLBL" ] && [ ! -s "$ROOT/.claude/.harness-run/review/$RLBL.review-packet.md" ] && [ ! -s "$ROOT/.claude/.harness-run/review/$RLBL_MAE.review-packet.md" ]; then
        deny "[guard-agent] sherlock para $RLBL sem REVIEW PACKET (3.4.5/3.4.7). Rode ANTES, na mesma mensagem:
  bash .claude/hooks/review-packet.sh --label $RLBL --tasks \"<glob das tasks/lote>\" [--desde main em worktree]
e aponte o prompt do sherlock para o packet ('seu contexto COMPLETO esta em <arquivo>; nao leia PRD/Perfil inteiros'). Depois despache de novo. Remonte a cada ciclo (o diff muda)."
      fi
    fi
    exit 0 ;;
esac
case "$TIPO" in hefesto|dedalo) : ;; *) exit 0 ;; esac

# 3.4.2b: itens de LOTE (/dt-exec) sao DT-NNN — o guard valia so para TASK-NNN e os lotes
# escaparam do duelo inteiro (medido: sessoes A/B do sweep, 23/08, zero duelos).
TASK_ID="$(rotulo_do_despacho)"   # 3.5.4b: packet citado > description > 1o rotulo do prompt
[ -n "$TASK_ID" ] || exit 0           # sem task nomeada (uso avulso do hefesto) — nao e a Fase 1
# 3.4.11: o sufixo de FATIA (PRD-134-b) faz parte do rotulo — sem ele o packet/task de
# PRD-134-b caia no glob de PRD-134-* (mae) e a telemetria _auto nascia como PRD-134-exec.
PRD="$(printf '%s' "$PROMPT" | grep -oE 'PRD-[0-9]{3,5}(-[a-z])?\b' | head -1)"
RUN="$ROOT/.claude/.harness-run"
PACKET="$RUN/packets/$TASK_ID.packet.md"
# 3.4.19: packet e exigencia da EXECUCAO (Fase 1.3). Na CRIACAO (/prd) o dedalo roda em Modo P
# (projeto de front, Passo 7.1) e Modo R (correcao de UX, 10.2) — as tasks nem existem ainda; um
# rotulo DT-NNN/TASK-NNN citado no prompt nao e despacho de task. Medido 03/09 (Caronte, PRD-012-b):
# dedalo Modo P negado por mencionar o DT absorvido. Fora do contexto de exec, o guard passa.
# 3.4.28: case-insensitive — a /prd escreve "MODO P" no prompt (medido 09/09, PRD-140: dedalo de projeto negado,
# 2 packets de DT gerados a toa). Marcador *-exec.json antigo (run aberta) tambem anulava a 2a isencao.
if printf '%s' "$PROMPT" | grep -qiE 'modo [pr]\b'; then exit 0; fi
if ls "$RUN"/PRD-*-fase[12].json >/dev/null 2>&1 && ! ls "$RUN"/*-exec.json >/dev/null 2>&1; then exit 0; fi

# Telemetria de resgate (24/08): sessao disparada pela TELA (queue/bridge) nao passa pelo
# UserPromptSubmit — o harness-metrics-auto.sh nunca ve o prompt (medido: wt-sweep-a/ux sem
# state). Aqui e o primeiro ponto GARANTIDO de toda exec (despacho de executor): sem state
# nenhum, liga o cronometro. Nao bloqueia nada.
if [ "${HARNESS_METRICS_AUTO:-1}" = "1" ]; then
  ML="_auto-dt-exec"; [ -n "$PRD" ] && ML="$PRD-exec"
  # 3.5.4: so o marcador DESTE rotulo conta como "ja ligado" — antes, qualquer *.json na pasta (PRD-001-exec.json esquecido
  # ha 3 dias, medido 14/09 na main) calava o resgate e a run nascia sem start. LOTE-NNN explicito da skill tambem vale.
  if [ ! -s "$RUN/$ML.json" ] && ! { [ -z "$PRD" ] && ls "$RUN"/LOTE-*.json >/dev/null 2>&1; }; then
    bash "$SCRIPT_DIR/harness-metrics.sh" start "$ML" >/dev/null 2>&1 || true
  fi
fi

# ---- SEMAFORO DE FRENTES (3.4.21): 1 frente pesada por PC Windows (2 no macOS) — as demais esperam.
# Medido 04/09: 3 execs simultaneas no mesmo PC = spawn 1.382 ms, vivos cortados para 2 em todas,
# 858 min de parede para 27 tasks; a criacao de processo desta maquina e serializada (~20/s), entao
# frentes paralelas nao somam — dividem. Slot por rotulo (PRD/LOTE) em ~/.harness-run/frentes:
# adquirido AQUI no 1o despacho de executor (automatico), renovado a cada despacho, liberado no
# stop da telemetria (ou expira em HARNESS_FRENTES_STALE_MIN). HARNESS_FRENTES=off desliga.
if [ "${HARNESS_FRENTES:-on}" != "off" ] && [ -f "$SCRIPT_DIR/frentes.mjs" ] && command -v "${HARNESS_RAG_NODE:-node}" >/dev/null 2>&1; then
  case "$TIPO" in
    hefesto|dedalo)
      SID="$(printf '%s' "$INPUT" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*"([^"]*)"$/\1/')"
      # 3.4.27: LOTE antes de PRD — no /dt-exec o prompt cita a PRD de origem do DT e o slot nascia como
      # PRD-136 (medido 09/09: o stop LOTE-044 nao liberava o slot; expirava em 45 min).
      FL="$(printf '%s' "$PROMPT" | grep -oE 'LOTE-[0-9]{3,5}' | head -1)"; [ -n "$FL" ] || FL="$PRD"; [ -n "$FL" ] || FL="auto-$(basename "$ROOT")"
      FOUT="$("${HARNESS_RAG_NODE:-node}" "$SCRIPT_DIR/frentes.mjs" acquire --label "$FL" --session "$SID" --projeto "$(basename "$ROOT")" 2>/dev/null)"; FRC=$?
      if [ "$FRC" -eq 3 ]; then
        HARNESS_INCIDENTE_ROOT="$ROOT" harness_incidente frentes "$TIPO" "$FL" "" "$FOUT"
        deny "[guard-agent] FRENTES CHEIAS nesta maquina — $FOUT
Esta maquina serializa a criacao de processos (~20/s, medido 04/09): frentes paralelas nao somam, dividem — 3 execs juntas deram spawn de 1.382 ms e 858 min de parede. Teto: HARNESS_FRENTES_MAX (1 no Windows, 2 no macOS; por maquina em ~/.harness.env.local).
O que fazer AGORA (3.5.4 — a resposta padrao e ESPERAR NA FILA, nunca a sessao pai implementar):
  (a) rode em background (run_in_background: true) e encerre o turno — a notificacao acorda voce com o slot adquirido:
        node .claude/hooks/frentes.mjs wait --label $FL --session $SID --max-min 240
      SO ENTAO despache os executores. Nada de sleep.
  (b) modo interativo: pergunte ao usuario com 'esperar a vaga' como opcao RECOMENDADA; alternativas: encerrar a outra frente,
      ou subir HARNESS_FRENTES_MAX em ~/.harness.env.local (as frentes ficam mais lentas). 'Implementar direto na sessao pai' so
      se o usuario pedir com essas palavras — medido 14/09 (sagittarius): pai em Opus codou 77 min e gravou 307k tokens de saida.
Status: node .claude/hooks/frentes.mjs status · Nao despache executores em paralelo a outra frente sem decisao."
      fi ;;
  esac
fi

deny() { printf '%s\n' "$*" >&2; exit 2; }

# ---- 3.5.4: ESFORCO DA FASE declarado antes do 1o executor. Medido 14/09: a 139-b nem rodou esforco.sh (telemetria
# high/n/d) e a 143 chamou set_session_effort em si mesma (recusado); as duas rodaram em medium por troca manual e o
# historico nao sabe. Exige .harness-run/esforco.env com fase=executar gravado NESTA decolagem (ts >= start - 30 min).
# HARNESS_GUARD_ESFORCO=off desliga.
if [ "${HARNESS_GUARD_ESFORCO:-on}" != "off" ]; then
  EENV="$RUN/esforco.env"; E_OK=0
  if [ -s "$EENV" ] && grep -q '^fase=executar' "$EENV" 2>/dev/null; then
    E_TS="$(grep '^ts=' "$EENV" 2>/dev/null | cut -d= -f2 | tr -cd '0-9')"
    RS=""
    for st in "$RUN"/*-exec.json "$RUN"/_auto-dt-exec.json "$RUN"/LOTE-*.json; do
      [ -f "$st" ] || continue
      s="$(grep -o '"start":[0-9]*' "$st" 2>/dev/null | grep -o '[0-9]*' | head -1)"
      [ -n "$s" ] && { [ -z "$RS" ] || [ "$s" -gt "$RS" ]; } && RS="$s"
    done
    if [ -z "$E_TS" ] || [ -z "$RS" ] || [ "$E_TS" -ge $(( RS - 1800 )) ] 2>/dev/null; then E_OK=1; fi
  fi
  if [ "$E_OK" != "1" ]; then
    HARNESS_INCIDENTE_ROOT="$ROOT" harness_incidente esforco "$TIPO" "${PRD:-$TASK_ID}" "" "esforco.env ausente, sem fase=executar ou de outra decolagem" 2>/dev/null || true
    deny "[guard-agent] $TIPO para $TASK_ID sem ESFORCO DA FASE declarado nesta decolagem (3.5.4). Antes do 1o executor, na mesma mensagem:
  1. leia o esforco REAL da sessao: mcp__ccd_session_mgmt__get_session {session_id:\"self\"} (campo effort; no CLI: CLAUDE_CODE_EFFORT_LEVEL);
  2. rode: bash .claude/hooks/esforco.sh executar --atual <effort>   (sem a ferramenta, omita --atual);
  3. se sair AJUSTAR: peca ao usuario '/effort <alvo>' (NUNCA chame set_session_effort em si mesma — e recusado pelo Desktop)
     e, apos a resposta, releia get_session e rode o esforco.sh de novo com o valor novo. Em modo autonomo anuncie e siga.
Medido 14/09: duas execs em medium ficaram gravadas como high/n/d e medium/high porque o passo foi pulado ou ficou velho."
  fi
fi

if [ ! -s "$PACKET" ]; then
  TF="$(ls "$ROOT"/prds/${PRD:-PRD-*}*/tasks/$TASK_ID-*.md "$ROOT"/prds/debito_tecnico/$TASK_ID-*.md 2>/dev/null | head -1)"
  # 3.5.6 (D12): o guard MONTA o packet que faltou (task encontrada) e nega uma vez so, ja com o caminho pronto — a pai
  # redespacha citando-o em vez de gastar um turno no task-packet.sh (medido 15/09 137-c e 14/09 143-b: acceptance sem packet).
  if [ -n "$TF" ] && [ "${HARNESS_GUARD_AGENT_PACKET_AUTO:-on}" != "off" ] && [ -f "$SCRIPT_DIR/task-packet.sh" ]; then
    _PK="$(cd "$ROOT" && bash "$SCRIPT_DIR/task-packet.sh" "$TF" 2>/dev/null | grep '^PACKET|' | cut -d'|' -f2)"
    if [ -n "$_PK" ] && [ -s "$_PK" ]; then
      deny "[guard-agent] $TIPO para $TASK_ID despachado sem TASK PACKET — o guard montou agora (3.5.6): $_PK ($(( $(wc -c < "$_PK" | tr -d ' ') / 1024 )) KB). Redespache o MESMO agente citando o packet no prompt ('seu contexto inteiro esta em $_PK; nao leia o Perfil completo nem a PRD inteira')."
    fi
  fi
  deny "[guard-agent] $TIPO para $TASK_ID sem TASK PACKET (Fase 1.3, passo 0). Rode ANTES, na mesma mensagem:
  bash .claude/hooks/task-packet.sh ${TF:-prds/<PRD>/tasks/$TASK_ID-*.md}
e passe o caminho do packet no prompt do executor ('seu contexto inteiro esta em <packet>; nao leia o Perfil completo nem a PRD inteira'). Depois despache de novo."
fi

# ---- 3.4.34 (PRD-141, 10/09): tres tetos mecanicos no DESPACHO do executor. Medido: 13 tasks (teto 9), 5 cortadas
# pelo folego (150-270 turnos), review final com 12 bloqueantes de costura front<->back e o gate de acceptance nunca
# rodou. Instrucao nao segurou nenhum dos tres; hook segura.
TF_TASK="$(ls "$ROOT"/prds/${PRD:-PRD-*}*/tasks/$TASK_ID-*.md 2>/dev/null | head -1)"
PRD_DIR=""; [ -n "$TF_TASK" ] && PRD_DIR="$(cd "$(dirname "$TF_TASK")/.." && pwd)"
# 1) teto de tasks da PRD (HARNESS_PRD_MAX_TASKS, default 9) — acima, fatiar; override humano = marcador tasks-ok
if [ -n "$PRD" ] && [ -n "$PRD_DIR" ]; then
  MAXT="${HARNESS_PRD_MAX_TASKS:-9}"; case "$MAXT" in ''|*[!0-9]*) MAXT=9 ;; esac
  NT="$(ls "$PRD_DIR"/tasks/TASK-*.md 2>/dev/null | grep -cE '/TASK-[0-9]{3}[a-z]?-' || true)"
  if [ "${NT:-0}" -gt "$MAXT" ] && [ ! -f "$RUN/$PRD.tasks-ok" ]; then
    HARNESS_INCIDENTE_ROOT="$ROOT" harness_incidente teto-tasks "$TIPO" "$PRD" "$TASK_ID" "tasks=$NT teto=$MAXT" 2>/dev/null || true
    deny "[guard-agent] $PRD tem $NT tasks — acima do teto de $MAXT (HARNESS_PRD_MAX_TASKS). PRD grande demais para uma exec:
medido 10/09 (PRD-141, 13 tasks): 5 tasks cortadas pelo folego, 12 bloqueantes de costura no review final, 6 h de exec.
O que fazer: FATIAR — mova as tasks excedentes para uma fatia (PRD-$PRD-b: /prd fatia) e execute a mae primeiro.
Decisao humana de rodar assim mesmo: touch .claude/.harness-run/$PRD.tasks-ok  (registre o motivo no Output)."
  fi
fi
# 2b) 3.5.3: o override grande-ok e UM por PRD (HARNESS_GRANDE_OK_MAX, default 1). Medido 12/09 (PRD-142-b):
# a sessao pai carimbou grande-ok em 3 tasks de uma vez ("justificativa ja documentada na task") e foram
# exatamente as 3 que levaram 49-59 min e estouraram o folego — o override virou rotina, nao excecao.
# A partir do 2o GRANDE da mesma PRD o marcador nao vale: fatiar antes de despachar (RE-FATIAR da 1.3).
if [ "${HARNESS_TASK_GRANDE:-negar}" = "negar" ] && [ -n "$TF_TASK" ] && [ -f "$RUN/packets/$TASK_ID.grande-ok" ] && [ -n "$PRD_DIR" ]; then
  GOK_MAX="${HARNESS_GRANDE_OK_MAX:-1}"; case "$GOK_MAX" in ''|*[!0-9]*) GOK_MAX=1 ;; esac
  GOK_OUTROS=0
  for gk in "$RUN"/packets/TASK-*.grande-ok; do
    [ -f "$gk" ] || continue
    gid="$(basename "$gk" .grande-ok)"
    [ "$gid" = "$TASK_ID" ] && continue
    # so conta marcador de task DESTA PRD (o packets/ e compartilhado entre PRDs do mesmo checkout)
    ls "$PRD_DIR"/tasks/"$gid"-*.md >/dev/null 2>&1 && GOK_OUTROS=$(( GOK_OUTROS + 1 ))
  done
  if [ "$GOK_OUTROS" -ge "$GOK_MAX" ]; then
    HARNESS_INCIDENTE_ROOT="$ROOT" harness_incidente task-grande "$TIPO" "$TASK_ID" "$TASK_ID" "grande-ok excedido: $((GOK_OUTROS+1))>$GOK_MAX na $PRD" 2>/dev/null || true
    deny "[guard-agent] $TASK_ID tem grande-ok, mas a $PRD ja gastou o override em $GOK_OUTROS task(s) (teto HARNESS_GRANDE_OK_MAX=$GOK_MAX).
Medido 12/09 (PRD-142-b): 3 grande-ok de uma vez = as 3 tasks de 49-59 min que estouraram o folego e serializaram a exec.
O que fazer: FATIE esta task em 2 (TASK-${TASK_ID#TASK-}a sem dependencia + TASK-${TASK_ID#TASK-}b [requires] a), como o RE-FATIAR da 1.3, e despache as fatias.
Decisao humana consciente de rodar mais uma inteira: HARNESS_GRANDE_OK_MAX=2 (registre o motivo no Output)."
  fi
fi
# 2) task GRANDE pela regua do packet (linhas/KB/alvos/PREVISAO por historico) — nao despacha sem fatiar
if [ "${HARNESS_TASK_GRANDE:-negar}" = "negar" ] && [ -n "$TF_TASK" ] && [ ! -f "$RUN/packets/$TASK_ID.grande-ok" ]; then
  PC="$(bash "$SCRIPT_DIR/task-packet.sh" "$TF_TASK" --check 2>/dev/null | grep '^PACKET-CHECK|' | head -1)"
  case "$PC" in
    *'|GRANDE|'*|*'|GRANDE')
      MOT="${PC##*|GRANDE}"; MOT="${MOT#|}"
      HARNESS_INCIDENTE_ROOT="$ROOT" harness_incidente task-grande "$TIPO" "$TASK_ID" "$TASK_ID" "$MOT" 2>/dev/null || true
      deny "[guard-agent] $TASK_ID e GRANDE pela regua do packet (${MOT:-veja task-packet --check}) — nao despacho sem fatiar.
Medido 10/09 (PRD-141): task de 150-270 turnos estoura o folego, volta PARCIAL e custa uma rodada de resto (165 min na PRD).
O que fazer: fatie a task em 2-3 (arquivos disjuntos, cada uma cabendo em ~90 chamadas) e despache as fatias.
Decisao humana de rodar inteira: touch .claude/.harness-run/packets/$TASK_ID.grande-ok  (HARNESS_TASK_GRANDE=permitir so avisa)." ;;
  esac
fi
# 4) costura por onda: PRD com front E back so entra na onda N>=2 depois do sherlock 'lente costura' da onda N-1
if [ "${HARNESS_COSTURA_ONDA:-on}" = "on" ] && [ -n "$PRD" ] && [ -n "$PRD_DIR" ]; then
  ONDA="$(printf '%s' "$PROMPT" | grep -oiE '\bonda[[:space:]]*[0-9]+' | head -1 | grep -oE '[0-9]+')"
  if [ -n "$ONDA" ] && [ "$ONDA" -ge 2 ] 2>/dev/null && grep -qiE '\*\*Tipo\*\* *\| *front' "$PRD_DIR"/tasks/TASK-*.md 2>/dev/null \
     && grep -qiE '\*\*Tipo\*\* *\| *(backend|back)' "$PRD_DIR"/tasks/TASK-*.md 2>/dev/null; then
    ANT=$(( ONDA - 1 ))
    if [ ! -s "$RUN/review/$PRD.costura-onda-$ANT.md" ]; then
      deny "[guard-agent] onda $ONDA da $PRD sem a COSTURA da onda $ANT (3.4.34). PRD com front E back: antes da proxima onda, um sherlock
com 'Lente: costura' revisa o diff da onda $ANT procurando contrato front<->back (nomes de chave JSON, campos removidos que
alguem ainda le, endpoint que o JS chama com payload diferente). Medido 10/09 (PRD-141): 'pendentes' x 'pendencias' e
window.BRANDING removido so apareceram no review final — 2h23 de rodada de fix.
Rode: bash .claude/hooks/review-packet.sh --label $PRD --tasks \"<tasks da onda $ANT>\"  e despache o sherlock com Lente: costura,
gravando o veredito em .claude/.harness-run/review/$PRD.costura-onda-$ANT.md (o sherlock escreve; 0 bloqueante libera a onda)."
    fi
  fi
fi

# ---- duelo obrigatorio (enforcement item 3, 24/08/2026): o campo Duelo EXPLICITO da task MANDA,
#      e a exigencia vale para hefesto E dedalo (a TASK-006 da PRD-127, front com Duelo:auto,
#      escapou porque o guard so cobria hefesto).
#        sim  -> duelo obrigatorio, so exclusoes duras ([barrier], migration no titulo)
#        auto -> idem, respeitando o teto de <= 3 arquivos-alvo do packet
#        nao  -> nunca (decisao do planejador — que agora precisa justificar o nao na task)
#        sem campo (item de lote /dt-exec, uso avulso) -> heuristica antiga, so hefesto
[ "${HARNESS_SKIP_DUELO:-0}" != "1" ] || exit 0
[ "${HARNESS_DUELO:-auto}" != "off" ] || exit 0
[ -n "${OPENROUTER_API_KEY:-}" ] || exit 0      # sem chave o duelo e dormente — nada a exigir
ls "$RUN"/duelos/*-"$TASK_ID"-* >/dev/null 2>&1 && exit 0   # duelo ja rodou para esta task

TF="$(ls "$ROOT"/prds/${PRD:-PRD-*}*/tasks/$TASK_ID-*.md "$ROOT"/prds/debito_tecnico/$TASK_ID-*.md 2>/dev/null | head -1)"
[ -n "$TF" ] || exit 0
grep -qiE '\*\*Duelo\*\* *\| *nao' "$TF" && exit 0
DUELO_EXPL="$(grep -oiE '\*\*Duelo\*\* *\| *(sim|auto)' "$TF" | grep -oiE '(sim|auto)$' | head -1 | tr '[:upper:]' '[:lower:]')"
grep -qiE '\[barrier\]' "$TF" && exit 0
printf '%s' "$TASK_ID $(basename "$TF")" | grep -qiE 'migration|migracao' && exit 0
N_ALVOS="$(grep -c '^### `' "$PACKET" 2>/dev/null)"; N_ALVOS="${N_ALVOS:-0}"; case "$N_ALVOS" in ''|*[!0-9]*) N_ALVOS=0 ;; esac
# 3.4.5 (27/08): em task de PRD, 'auto' NAO dispara mais duelo — medido em 30 duelos
# parciais: DT de lote mecanico aprova (notas 8,3-8,5, vitorias aplicadas); task de PRD
# reprova mesmo com dois diffs aplicaveis (nota maxima 4,5, zero aprovacao) — o duelo
# vira pedagio de 3-9min. Em PRD so 'sim' explicito duela (o planejador reserva 'sim'
# para o genuinamente mecanico). DT-NNN de lote segue inalterado.
# HARNESS_DUELO_PRD: 'sim' (default — so explicito) | 'auto' (comportamento anterior).
if [ "$DUELO_EXPL" = "auto" ] && [ "${HARNESS_DUELO_PRD:-sim}" != "auto" ] \
   && printf '%s' "$TASK_ID" | grep -qE '^TASK-'; then
  exit 0
fi
case "$DUELO_EXPL" in
  sim)  : ;;                                  # planejador forcou — vale mesmo com >3 arquivos
  auto) [ "$N_ALVOS" -le 3 ] || exit 0 ;;     # planejador liberou — teto de tamanho ainda vale
  *)    # sem campo explicito: heuristica conservadora, e so para o hefesto
        [ "$TIPO" = "hefesto" ] || exit 0
        grep -qiE '\*\*Tipo\*\* *\| *front' "$TF" && exit 0
        [ "$N_ALVOS" -le 3 ] || exit 0
        VETO='migration|waha|whatsapp|calendar|pagamento|pix|s3|auth|sess[aã]o|login'
        if grep -qiE '\*\*Balde:?\*\*[^|]*\blote\b' "$TF"; then
          # Refino 25/08: DT ja triado como 'lote' (gate de admissao) sofria FALSO VETO por
          # mencao casual na prosa (DT-393 citava 'S3', DT-394 'pagamento' — mudancas que nao
          # tocavam nem S3 nem pagamento). Para esses, o veto so vale se um ARQUIVO-ALVO do
          # packet carrega a palavra no caminho: mexer em api/pagamentos/x.php veta; citar
          # 'pagamento' no contexto nao.
          grep '^### ' "$PACKET" 2>/dev/null | grep -qiE "$VETO" && exit 0
        else
          head -60 "$TF" | grep -qiE "$VETO" && exit 0
        fi ;;
esac
deny "[guard-agent] $TASK_ID e ELEGIVEL a DUELO (Duelo=${DUELO_EXPL:-heuristica}, $N_ALVOS arquivo(s)-alvo, sem migration/[barrier]) e o duelo ainda nao rodou. Rode, na mesma mensagem que despacha a onda:
  bash .claude/hooks/harness-duelo.sh --task $TF --label ${PRD:-$(basename \"$(dirname \"$(dirname \"$TF\")\")\" 2>/dev/null | grep -oE 'PRD-[0-9]+(-[a-z])?\b' || echo LOTE)}
Leia a linha DUELO|...: 'julgar' => dispare o agente themis com o prompt-juiz.md e registre --veredito; 'ok' => despache o executor ($TIPO) para APLICAR o diff vencedor (git apply simples — o diff e gerado pelo proprio duelo com contagens exatas; --recount so se o apply puro falhar — + lint + spec local); 'reprovado|desligado|indisponivel' => ai sim o executor escreve do zero (o guard libera porque a pasta do duelo passa a existir). Nao e opcional."
