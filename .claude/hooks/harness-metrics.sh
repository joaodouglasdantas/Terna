#!/usr/bin/env bash
# .claude/hooks/harness-metrics.sh
# Telemetria de execucao do harness: tempo de parede + tokens (best-effort) + contadores.
# Gera um resumo ao fim de /prd e /prd-exec e mantem um historico comparativo (jsonl).
#
# Uso:
#   bash .claude/hooks/harness-metrics.sh start <label>
#   bash .claude/hooks/harness-metrics.sh stop  <label> [--tasks=N] [--ciclos=N]
#         [--subagents=N] [--waves=N] [--preset=X] [--models="hefesto sonnet, ..."] [--extra="..."]
#         [--modo=leve|turbo|noturno|normal] [--limitou=X] [--review-modo=dupla|solo|solo-2|partes]
#         [--codex=ok|indisponivel] [--stalls=N] [--tasks-estouradas=N]        (3.4.23, item 15b)
#         [--vivos-max=N]   (3.5.3: maior numero de executores vivos ao mesmo tempo, anotado pela skill)
#
# 'start' grava o epoch de inicio num arquivo de estado. 'stop' calcula a duracao, tenta medir
# tokens via Node (harness-metrics.mjs lendo o transcript), faz append no historico e imprime o
# bloco markdown do resumo no stdout (a skill cola no output final).
# Tudo best-effort: falha em qualquer parte NUNCA quebra a skill (exit 0 sempre).
#
# TELEMETRIA HONESTA (1.8.0): alem de ts_end/elapsed_s, grava ts_start, out_tps
# (tokens_output/elapsed_s — ATENCAO 3.5.3: tokens_output e por mensagem UNICA a partir
# de 13/09/2026, ver "DEDUP POR message.id" abaixo), max_gap_min (maior gap do transcript), wait_human_min +
# permission_prompts (espera humana MEDIDA via log do hook notify.sh), elapsed_active_s
# (duracao descontada da espera) e waves (ondas de paralelismo da Fase 1). Regra de
# leitura: out_tps < 30 com elapsed alto => espera humana (prompt de permissao pendurado,
# pausa do operador) — NAO ajustar preset/modelo. Roteiro: .claude/PLAYBOOK-TELEMETRIA.md
#
# ESPERA POR GAP (2.10.0): o notify.sh so ve prompt de permissao/idle — sessao deixada
# aberta overnight nao gerava espera nenhuma e elapsed_active_s saia IGUAL ao elapsed_s
# (82% dos runs, gaps de ate 14h "ativos"). Agora todo gap do transcript maior que
# HARNESS_WAIT_GAP_MIN (default 10 min) conta como espera humana; as janelas das duas
# fontes sao mescladas (sem dupla contagem) e descontadas do elapsed_active_s. Campos
# novos na linha: wait_gap_min (espera vinda de gaps) e wait_gap_threshold_min (limiar
# usado — a PRESENCA deste campo marca a linha como pos-2.10.0, com duracao ativa
# confiavel; linha antiga sem ele deve ser lida com desconfianca se max_gap_min alto).
#
# OCIOSIDADE x SUBAGENTE VIVO + PARALELISMO (2.12.0): a 2.10.0 nao distinguia "sessao
# parada" de "sessao aguardando subagente em background" — quando a sessao despacha um
# agente o turno encerra e o transcript principal silencia, igualzinho a operador ausente
# (PRD-111 real: wait_human_min=850 com permission_prompts=0; eram 506 min de ociosidade
# + ~344 min de subagente trabalhando). Agora as janelas dos subagentes sao medidas e:
#   wait_idle_min     = espera OCIOSA (gaps U notify MENOS subagente vivo) — a unica que
#                       desconta o elapsed_active_s e dispara o aviso ⚠️;
#   wait_gap_min      = a parcela de gap COM subagente vivo (trabalho, nao espera);
#   subagent_busy_min = SOMA das duracoes dos subagentes;
#   parallel_factor   = subagent_busy_min / duracao ativa — < 1,3 com subagents >= 10
#                       significa execucao SERIAL (ver PLAYBOOK-TELEMETRIA).
# A linha carrega "schema":"2.12.0" — e o discriminador explicito de fronteira de versao
# (linhas anteriores NAO sao comparaveis em espera/duracao ativa).
#
# TOKENS DE SUBAGENTE (2.14.0): o medidor lia so os .jsonl do TOPO do diretorio da sessao —
# subagente vive em <session>/subagents/ e por isso NUNCA entrou no tokens_output (a PRD-111
# registrou 322k com 22 subagentes invisiveis). Isso subestimava sistematicamente o custo de
# execucao com muito subagente e enviesava a comparacao PRD x lote no /harness-report. Campos
# NOVOS (a serie historica do tokens_output fica intacta): tokens_output_subagents,
# tokens_total_subagents e out_tps_all (throughput real = principal + subagentes).
#
# DEDUP POR message.id (3.5.3, medido 12/09 na PRD-142-b-exec do dra-mariana-duarte): no
# transcript UMA mensagem do assistente vira VARIAS linhas (uma por bloco thinking/text/tool_use),
# todas com o MESMO message.id e usage.output_tokens CUMULATIVO. O medidor somava toda linha e
# contava cada linha como turno: tokens_output da pai saiu 1.078.168 onde o real era 453.914
# (2,4x), out_tps 56 onde o real era 24, e a TASK-004 gravou 292 turnos para 151 mensagens.
# A partir desta versao tokens_output/tokens_input/tokens_cache_read/tokens_total, os *_subagents
# e turnos (tasks/) sao POR MENSAGEM UNICA (maximo por message.id). A SERIE ANTERIOR A 13/09/2026
# ESTA INFLADA (~2,4x na pai, ~1x a 2x nos subagentes) — NAO comparar cru; out_tps/out_tps_all
# herdam a quebra. Campos NOVOS ao fim da linha (schema continua 2.15.0): tokens_thinking_pct e
# tokens_thinking_pct_subagents (% ESTIMADO de raciocinio invisivel — os blocos thinking chegam
# vazios, so sobra a diferenca output - visiveis/3,6) e vivos_max (--vivos-max=N, anotado pela
# skill). Vazio = nao medido, nunca zero inventado.
set -u
SCHEMA_TELEMETRIA='2.15.0'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$CLAUDE_DIR/.." && pwd)"
STATE_DIR="$CLAUDE_DIR/.harness-run"
METRICS_DIR="$PROJECT_ROOT/prds/_metrics"
HIST="$METRICS_DIR/harness-runs.jsonl"

# DT-007: append com lock (corrida entre sessoes/hooks corrompia jsonl — 18/08 no Mariana)
# shellcheck disable=SC1091
[ -f "$SCRIPT_DIR/_jsonl-append.sh" ] && . "$SCRIPT_DIR/_jsonl-append.sh"
command -v harness_jsonl_append >/dev/null 2>&1 || harness_jsonl_append() { [ -n "${1:-}" ] && printf '%s\n' "${2:-}" >> "$1" 2>/dev/null; return 0; }

# ---------------------------------------------------------------------------
# Subcomando SANEAR (DT-007): valida os jsonl de _metrics linha a linha; linha
# invalida vai para <arquivo>.quarentena (com carimbo) em vez de ser descartada
# em silencio pelos leitores. Rewrite ATOMICO (tmp+mv) sob o mesmo lock do
# append. NAO rode com execucoes ativas gravando no arquivo.
#   bash .claude/hooks/harness-metrics.sh sanear [arquivo.jsonl ...]
# ---------------------------------------------------------------------------
if [ "${1:-}" = "sanear" ]; then
  shift
  ALVOS=("$@")
  [ ${#ALVOS[@]} -eq 0 ] && ALVOS=("$METRICS_DIR/harness-runs.jsonl" "$METRICS_DIR/harness-delegations.jsonl" "$METRICS_DIR/harness-duelos.jsonl" "$METRICS_DIR/presence.jsonl" "$METRICS_DIR"/runs/*.jsonl "$METRICS_DIR"/tasks/*.jsonl "$METRICS_DIR"/incidentes/*.jsonl "$METRICS_DIR"/delegations/*.jsonl "$METRICS_DIR"/duelos/*.jsonl)   # 3.5.0: + por dev/maquina
  for F in "${ALVOS[@]}"; do
    [ -s "$F" ] || continue
    LOCK="$F.lock.d"; i=0
    while ! mkdir "$LOCK" 2>/dev/null; do i=$((i+1)); [ "$i" -gt 50 ] && break; sleep 0.1 2>/dev/null || sleep 1; done
    TMP="$F.sanear.tmp"; QUAR="$F.quarentena"
    node -e '
      const fs=require("fs");
      const [f,tmp,quar]=process.argv.slice(1);
      const L=fs.readFileSync(f,"utf8").split("\n");
      const ok=[],bad=[];
      for(const l of L){ if(!l.trim()) continue; try{ JSON.parse(l); ok.push(l); }catch{ bad.push(l); } }
      fs.writeFileSync(tmp, ok.join("\n")+(ok.length?"\n":""));
      if(bad.length){ const ts=new Date().toISOString(); fs.appendFileSync(quar, bad.map(b=>JSON.stringify({quarentena_ts:ts,linha:b})).join("\n")+"\n"); }
      console.log(f+": "+ok.length+" validas, "+bad.length+" em quarentena");
    ' "$F" "$TMP" "$QUAR" && mv -f "$TMP" "$F"
    rmdir "$LOCK" 2>/dev/null
  done
  exit 0
fi

# Plataforma da sessao (2.0.0): identifica o runtime no historico — execucoes de
# hosts diferentes nao sao comparaveis entre si (modelos/medidores distintos).
# 3.5.7: camadas de configuracao — hooks/_env.sh carrega _defaults.env -> harness.env -> harness.env.local -> ~/.harness.env.local
# (ambiente da sessao vence). Antes cada hook tinha o proprio loop.
# shellcheck disable=SC1091
. "$CLAUDE_DIR/hooks/_env.sh"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_host-detect.sh"
PLATFORM="$(harness_detect_host)"

ACTION="${1:-}"
LABEL="${2:-run}"
SAFE="$(printf '%s' "$LABEL" | tr -c 'A-Za-z0-9._-' '_')"
STATE="$STATE_DIR/$SAFE.json"

now_epoch() { date +%s 2>/dev/null || echo 0; }

# 3.4.23 (item 15d): rotulo SEM NUMERO (PRD-000-exec, PRD--exec, LOTE-000) e recusado no start —
# medido 04/09: "PRD-000-exec" no painel do newportaltefnet. A linha nasceria orfa (sem PRD para
# derivar tasks, sem frente para liberar) e contaminaria as medianas do grupo.
rotulo_sem_numero() { # $1 = label -> 0 (sem numero) | 1 (ok / nao se aplica)
  case "$1" in
    DT-SWEEP-*|SWEEP-*) return 1 ;;   # 3.4.26: rotulo do /dt-sweep e por DATA (DT-SWEEP-2026-09-09), nao por numero
    PRD-*|LOTE-*|DT-*) printf '%s' "$1" | sed -E 's/^(PRD|LOTE|DT)-//' | grep -qE '^0*[1-9]' && return 1; return 0 ;;
  esac
  return 1
}

# ---------- start ----------
if [ "$ACTION" = "start" ]; then
  if rotulo_sem_numero "$LABEL"; then
    echo "[harness-metrics] RECUSADO: rotulo '$LABEL' sem numero (PRD-000/PRD--exec). Nao liguei o cronometro — rode de novo com o rotulo certo (ex.: PRD-137-exec)." >&2
    echo "TELEMETRIA|rotulo-invalido|$LABEL"
    exit 0
  fi
  mkdir -p "$STATE_DIR" 2>/dev/null || true
  # 3.5.6 (D1 / B2): `start` de rotulo que JA TEM marcador fresco MANTEM o epoch e a origem. Medido 15/09 (PRD-145):
  # o hook do prompt ligou 21:57:40 e o hook Skill confirmou `mantido`; a sessao rodou o start manual 21:59:34 e o
  # marcador virou 114 s mais novo e sem `origem` (a regra REUSA so existia no harness-metrics-auto.sh). Marcador mais
  # velho que HARNESS_METRICS_STALE_H e estado esquecido: sobrescreve como antes. `--forcar` sobrescreve sempre.
  FORCAR_M=0; for _a in "$@"; do [ "$_a" = "--forcar" ] && FORCAR_M=1; done
  if [ "$FORCAR_M" = 0 ] && [ -s "$STATE" ]; then
    _s0="$(grep -o '"start":[0-9]*' "$STATE" 2>/dev/null | grep -o '[0-9]*' | head -n1)"
    _sh0="${HARNESS_METRICS_STALE_H:-24}"; case "$_sh0" in ''|*[!0-9]*) _sh0=24 ;; esac
    if [ -n "$_s0" ] && [ $(( ($(now_epoch) - _s0) / 3600 )) -lt "$_sh0" ] 2>/dev/null; then
      _o0="$(grep -o '"origem":"[^"]*"' "$STATE" 2>/dev/null | head -n1 | cut -d'"' -f4)"
      echo "[harness-metrics] mantido: $LABEL ja tem marcador fresco (start=$_s0, ha $(( ($(now_epoch) - _s0) / 60 )) min${_o0:+, origem=$_o0}) — nao sobrescrevi (3.5.6/D1). Reiniciar de proposito: start $LABEL --forcar."
      echo "TELEMETRIA|mantido|$LABEL|$_s0"
      exit 0
    fi
  fi
  # 3.4.29: o start explicito de PRD-NNN-fase1 ADOTA o inicio do _auto-prd-fase1 (ligado pelo
  # harness-metrics-auto.sh no prompt /prd) — o epoch do prompt e o inicio real; o do Passo 1 vem
  # 2-4 min depois (entrevista). O marcador auto some para nao ser herdado por outro stop.
  AUTO_PRD="$STATE_DIR/_auto-prd-fase1.json"
  ORIGEM_M=""; for _a in "$@"; do case "$_a" in --origem=*) ORIGEM_M="${_a#*=}" ;; esac; done   # 3.5.5: auto-prompt | auto-skill | vazio (skill)
  case "$LABEL" in
    *-fase1)
      # 3.5.5 (C2): o auto-start do PROMPT pode ter ligado PRD-NNN-exec numa CRIACAO ("...a exec com /prd-exec fica para
      # depois"); o start explicito da fase 1 e a prova de que e criacao — marcador -exec do auto, com menos de 6 h, cai.
      _EXECM="$STATE_DIR/${LABEL%-fase1}-exec.json"
      if [ -s "$_EXECM" ] && grep -q '"origem":"auto-' "$_EXECM" 2>/dev/null; then
        _es="$(grep -o '"start":[0-9]*' "$_EXECM" 2>/dev/null | grep -o '[0-9]*' | head -n1)"
        if [ -n "$_es" ] && [ $(( $(now_epoch) - _es )) -le 21600 ] 2>/dev/null; then
          rm -f "$_EXECM" 2>/dev/null && echo "[harness-metrics] marcador ${LABEL%-fase1}-exec (ligado pelo auto-start do prompt) removido: esta sessao e a CRIACAO da PRD."
        fi
      fi
      if [ -s "$AUTO_PRD" ]; then
        S0="$(grep -o '"start":[0-9]*' "$AUTO_PRD" 2>/dev/null | grep -o '[0-9]*' | head -n1)"
        if [ -n "$S0" ]; then
          printf '{"label":"%s","start":%s}\n' "$LABEL" "$S0" > "$STATE" 2>/dev/null || true
          rm -f "$AUTO_PRD" 2>/dev/null || true
          echo "[harness-metrics] inicio registrado: $LABEL ($S0 — herdado do cronometro automatico do prompt /prd)"
          exit 0
        fi
      fi ;;
  esac
  printf '{"label":"%s","start":%s%s}\n' "$LABEL" "$(now_epoch)" "${ORIGEM_M:+,\"origem\":\"$ORIGEM_M\"}" > "$STATE" 2>/dev/null || true
  echo "[harness-metrics] inicio registrado: $LABEL ($(now_epoch))"
  exit 0
fi

# ---------- baseline (3.0.0) ----------
# Custo TIPICO de uma execucao deste projeto, derivado do historico REAL. Alimenta
# o plano de custo da decolagem (/prd Passo 0.1, /prd-exec 0.3, /dt-exec) — para o
# humano aprovar o orcamento uma vez, com numero, em vez de aprovar no escuro.
#
# Regra de honestidade: SEM historico suficiente, imprime 'sem-baseline'. Estimar
# custo sem dado e chute com cara de medicao — pior que nao estimar.
#
#   uso: harness-metrics.sh baseline [prefixo-do-label] [n-amostras]
#   ex:  harness-metrics.sh baseline PRD 5     -> media das 5 ultimas linhas PRD*
#   saida: BASELINE|<n>|<dur_med_min>|<out_med>|<subagentes_med>|<delegacoes_med>
if [ "$ACTION" = "baseline" ]; then
  PREFIXO="${2:-}"
  AMOSTRAS="${3:-5}"
  case "$AMOSTRAS" in ''|*[!0-9]*) AMOSTRAS=5 ;; esac
  if [ ! -f "$HIST" ]; then
    echo "BASELINE|0|sem-baseline|sem-baseline|sem-baseline|sem-baseline"
    echo "[harness-metrics] sem historico em $HIST — a decolagem deve declarar 'sem baseline', nunca inventar numero." >&2
    exit 0
  fi
  # 3.4.19: a duracao vinha de `duration_min`, campo do schema antigo — desde a 2.14 a linha grava
  # elapsed_s/elapsed_active_s, e o baseline devolvia 0 para sempre ("sem baseline de parede" com 5
  # execucoes medidas). Agora: elapsed_active_s (fallback elapsed_s) em MEDIANA, ignorando linhas sem
  # start (null/0) e absurdas (> 24 h — PRD-009 do Caronte: start de 14 dias nunca fechado).
  grep -F "\"label\":\"$PREFIXO" "$HIST" 2>/dev/null | grep -F "\"tasks\":\"" | grep -vE '"tasks":"(0)?"' | tail -"$AMOSTRAS" | awk -F'"' '
    function num(s) { gsub(/[^0-9.]/, "", s); return s+0 }
    {
      n++; act = 0; el = 0; dm = 0
      for (i = 1; i < NF; i++) {
        if ($i == "elapsed_active_s") act = num($(i+2))
        if ($i == "elapsed_s")        el  = num($(i+1)) + num($(i+2))
        if ($i == "duration_min")     dm  = num($(i+2))
        if ($i == "tokens_output")    o += num($(i+2))
        if ($i == "subagents")        s += num($(i+2))
        if ($i == "delegations_n")    g += num($(i+2))
      }
      sec = (act > 0) ? act : ((el > 0) ? el : dm * 60)
      if (sec >= 60 && sec <= 86400) { nd++; dur[nd] = sec / 60 }
    }
    END {
      if (n == 0) { print "BASELINE|0|sem-baseline|sem-baseline|sem-baseline|sem-baseline"; exit }
      med = 0
      if (nd > 0) {
        for (i = 1; i <= nd; i++) for (j = i + 1; j <= nd; j++) if (dur[j] < dur[i]) { t = dur[i]; dur[i] = dur[j]; dur[j] = t }
        med = (nd % 2) ? dur[(nd + 1) / 2] : (dur[nd / 2] + dur[nd / 2 + 1]) / 2
      }
      if (nd == 0) printf "BASELINE|%d|sem-baseline|%.0f|%.1f|%.1f\n", n, o/n, s/n, g/n
      else printf "BASELINE|%d|%.0f|%.0f|%.1f|%.1f\n", n, med, o/n, s/n, g/n
    }'
  exit 0
fi

if [ "$ACTION" != "stop" ]; then
  echo "[harness-metrics] uso: start <label> | stop <label> [--tasks=N --ciclos=N ...] | baseline [prefixo] [n]" >&2
  exit 0
fi

# ---------- stop ----------
# 3.4.34 — GATE DE ACCEPTANCE (PRD-141, 10/09): a TASK-012 (GATE BLOQUEANTE) nunca rodou e a exec seguiu para o review
# como se tivesse; o stop fechava a run sem prova. Agora `stop PRD-NNN-exec*` exige, para cada task GATE/acceptance da
# PRD: (a) todo spec citado (tests/e2e/*.spec.js|ts) existe em disco; (b) ha linha de telemetria da task com status.
# Sem isso: TELEMETRIA|gate|ausente|... , o marcador de start fica e o stop sai com exit 3. `--gate-ok "<motivo>"` registra
# a decisao humana (vai para o extra). HARNESS_GATE_ACCEPTANCE=off desliga.
GATE_OK=""
for _a in "$@"; do case "$_a" in --gate-ok=*) GATE_OK="${_a#--gate-ok=}" ;; esac; done
case "$LABEL" in
  PRD-*-exec|PRD-*-exec-*)
    if [ "${HARNESS_GATE_ACCEPTANCE:-on}" = "on" ] && [ -z "$GATE_OK" ]; then
      G_PRD="$(printf '%s' "$LABEL" | grep -oE '^PRD-[0-9]{3,5}(-[a-z])?\b')"
      G_DIR="$(ls -d "$PROJECT_ROOT"/prds/"$G_PRD"-* 2>/dev/null | grep -vE "/$G_PRD-[a-z]-" | head -1)"
      G_FALTA=""
      for gt in $(grep -liE 'GATE BLOQUEANTE|acceptance' "$G_DIR"/tasks/TASK-*.md 2>/dev/null); do
        gid="$(basename "$gt" .md | grep -oE '^TASK-[0-9]{3}[a-z]?')"
        for sp in $(grep -oE 'tests?/e2e/[A-Za-z0-9_./-]+\.spec\.(js|ts)' "$gt" | sort -u); do
          [ -f "$PROJECT_ROOT/$sp" ] || G_FALTA="$G_FALTA $gid:spec-ausente($sp)"
        done
        grep -hs "\"rotulo\":\"$gid\"" "$PROJECT_ROOT"/prds/_metrics/tasks/*.jsonl 2>/dev/null | grep -qE '"status":"(✅|⚠️|⛔|PARCIAL)"' \
          || G_FALTA="$G_FALTA $gid:sem-execucao-na-telemetria"
      done
      if [ -n "$G_FALTA" ]; then
        echo "[harness-metrics] GATE DE ACCEPTANCE SEM PROVA — a exec NAO fecha:$G_FALTA" >&2
        echo "  A task GATE precisa rodar (spec em disco + SubagentStop registrado). Medido 10/09 (PRD-141): o gate nunca rodou e 12 bloqueantes" >&2
        echo "  so apareceram no review. Rode o gate e repita o stop; decisao humana de fechar sem ele: --gate-ok=\"<motivo>\" (fica no extra)." >&2
        echo "TELEMETRIA|gate|ausente|$LABEL|$(printf '%s' "$G_FALTA" | sed 's/^ //')"
        exit 3
      fi
    fi
    # 3.5.7 — GATE DE COSTURA (incidente PRD-144, 16/09: 61 specs verdes, acceptance verde, feature inutilizavel em producao
    # por 4 defeitos de integracao). hooks/costura-check.mjs e estatico: window.X lido sem publicacao, dublê de simbolo em
    # spec, route.fulfill de endpoint da PRD no acceptance, marcador "NAO VERIFICADO"/"a integrar na TASK-N" em codigo.
    # `bloqueia` => a exec NAO fecha (exit 3); --costura-ok="<motivo>" registra a decisao humana. HARNESS_GATE_COSTURA=aviso|off.
    C_OK=""; for _a in "$@"; do case "$_a" in --costura-ok=*) C_OK="${_a#--costura-ok=}" ;; esac; done
    if [ "${HARNESS_GATE_COSTURA:-on}" != "off" ] && [ -z "$C_OK" ] && [ -f "$SCRIPT_DIR/costura-check.mjs" ] && command -v "${HARNESS_RAG_NODE:-node}" >/dev/null 2>&1; then
      C_OUT="$(cd "$PROJECT_ROOT" && "${HARNESS_RAG_NODE:-node}" "$SCRIPT_DIR/costura-check.mjs" --codigo --base auto 2>/dev/null)"
      C_VER="$(printf '%s\n' "$C_OUT" | grep '^COSTURA-VEREDITO|' | head -1)"
      case "$C_VER" in
        COSTURA-VEREDITO\|bloqueia\|*)
          echo "[harness-metrics] COSTURA COM PENDENCIA — ${C_VER#COSTURA-VEREDITO|}" >&2
          printf '%s\n' "$C_OUT" | grep -E '^COSTURA\|(window-sem-publicacao|duble-em-spec|marcador-pendencia|route-fulfill-endpoint-da-prd)\|' | head -20 | sed 's/^/  /' >&2
          if [ "${HARNESS_GATE_COSTURA:-on}" = "on" ]; then
            echo "  A exec NAO fecha (3.5.7 — incidente PRD-144): publique o window.X consumido, troque o dublê do spec por espiao da funcao real," >&2
            echo "  resolva o marcador em codigo, tire o route.fulfill do endpoint da PRD do acceptance. Decisao humana de fechar assim: --costura-ok=\"<motivo>\"." >&2
            echo "TELEMETRIA|costura|bloqueia|$LABEL|${C_VER#COSTURA-VEREDITO|bloqueia|}"
            exit 3
          fi ;;
      esac
    fi
    : ;;
esac
NOW="$(now_epoch)"
START="$NOW"
# Fallback (enforcement item 1, 24/08/2026): o harness-metrics-auto.sh liga o cronometro do
# /dt-exec como _auto-dt-exec (o LOTE-NNN nao existe na invocacao). Se o stop veio com um
# label sem state proprio, herda o _auto-* mais antigo em vez de zerar a duracao.
if [ ! -f "$STATE" ]; then
  # 3.4.29: herda por FAMILIA — rotulo de criacao (*-fase1/*-fase2) so herda _auto-prd-*; os demais
  # (LOTE-NNN, *-exec) so herdam _auto-dt-exec/_auto-* que nao seja de criacao. Antes o stop de uma
  # fase1 herdaria um _auto-dt-exec esquecido de outro run e gravaria uma duracao inventada.
  case "$LABEL" in
    *-fase1|*-fase2) AUTO_STATE="$(ls -t "$STATE_DIR"/_auto-prd-*.json 2>/dev/null | tail -1)" ;;
    *) AUTO_STATE="$(ls -t "$STATE_DIR"/_auto-*.json 2>/dev/null | grep -v '/_auto-prd-' | tail -1)" ;;
  esac
  [ -n "$AUTO_STATE" ] && STATE="$AUTO_STATE"
fi
SEM_START=0
if [ -f "$STATE" ]; then
  S="$(grep -o '"start":[0-9]*' "$STATE" 2>/dev/null | grep -o '[0-9]*' | head -n1)"
  [ -n "$S" ] && START="$S"
else
  # 3.4.19: nunca gravar duracao 0 em silencio. Marcador ausente = ts_start/elapsed_s NULL na linha
  # (o baseline ignora) + aviso alto. Causa medida (Caronte PRD-012, 02/09): o auto criou o marcador
  # com outro numero (PRD-4610-exec.json) e o stop imprimiu "0min 0s" sem avisar.
  SEM_START=1
  echo "[harness-metrics] AVISO: SEM MARCADOR DE START para $LABEL — duracao NAO medida (ts_start=null). Marcadores presentes: $(ls "$STATE_DIR"/*-exec.json "$STATE_DIR"/*-fase1.json 2>/dev/null | xargs -n1 basename 2>/dev/null | tr '\n' ' ')" >&2
  echo "TELEMETRIA|sem-start|$LABEL"
fi
ELAPSED=$(( NOW - START )); [ "$ELAPSED" -lt 0 ] && ELAPSED=0
START_OUT="$START"; ELAPSED_OUT="$ELAPSED"
[ "$SEM_START" = "1" ] && { START_OUT="null"; ELAPSED_OUT="null"; }
MM=$(( ELAPSED / 60 )); SS=$(( ELAPSED % 60 ))

TASKS=""; CICLOS=""; SUBAGENTS=""; WAVES=""; PRESET=""; MODELS=""; EXTRA=""; ACHADOS=""
# 3.4.23 (item 15b): campos ESTRUTURADOS do controle da run — ate aqui viviam soltos no `extra`
# ("spawn=166ms", "review: SOLO", "modo leve") e a comparacao por dev exigia script a mao.
MODO=""; LIMITOU=""; REVIEW_MODO=""; CODEX=""; STALLS=""; TASKS_EST=""
VIVOS_MAX=""   # 3.5.3: maior numero de executores vivos ao mesmo tempo (--vivos-max=N, anotado pela skill)
shift 2 2>/dev/null || shift $# 2>/dev/null || true
for arg in "$@"; do
  case "$arg" in
    --tasks=*)     TASKS="${arg#*=}" ;;
    --ciclos=*)    CICLOS="${arg#*=}" ;;
    --subagents=*) SUBAGENTS="${arg#*=}" ;;
    --waves=*)     WAVES="${arg#*=}" ;;
    --preset=*)    PRESET="${arg#*=}" ;;
    --models=*)    MODELS="${arg#*=}" ;;
    --extra=*)     EXTRA="${arg#*=}" ;;
    --gate-ok=*)   GATE_OK="${arg#*=}" ;;   # 3.4.34: decisao humana de fechar sem o gate de acceptance
    --costura-ok=*) C_OK="${arg#*=}" ;;    # 3.5.7: decisao humana de fechar com pendencia de costura (vai para o extra)
    --achados=*)   ACHADOS="${arg#*=}" ;;   # 3.4.11: 🔴 por ciclo do gate gargalo (ex. 4,1,0)
    --modo=*)      MODO="${arg#*=}" ;;            # leve|turbo|noturno|normal
    --limitou=*)   LIMITOU="${arg#*=}" ;;         # o que limitou a run (mutex, frentes, codex, humano...)
    --review-modo=*) REVIEW_MODO="${arg#*=}" ;;   # dupla|solo|solo-2|partes
    --codex=*)     CODEX="${arg#*=}" ;;           # ok|indisponivel
    --stalls=*)    STALLS="${arg#*=}" ;;          # agentes parados detectados (agent-stall)
    --tasks-estouradas=*) TASKS_EST="${arg#*=}" ;;  # tasks > envelope; sem flag = derivado de tasks/
    --vivos-max=*) VIVOS_MAX="${arg#*=}" ;;         # 3.5.3: pico de executores simultaneos (obrigatorio em run com tasks — /prd-exec 1.3 item 6)
    --esforco=*)   ESFORCO="${arg#*=}" ;;           # 3.5.3: "<alvo>/<atual>" (esforco.sh); sem flag = le .harness-run/esforco.env
    --esforco-final=*) ESFORCO_FINAL="${arg#*=}" ;; # 3.5.4: esforco EFETIVO no fechamento (get_session self) — substitui o `atual` da decolagem
    --forcar-stale) FORCAR_STALE=1 ;;               # 3.5.4: aceita marcador de start mais velho que HARNESS_METRICS_STALE_H
  esac
done
# 3.5.4: MARCADOR VELHO nao vira linha. Medido 14/09 (sagittarius): `stop _auto-dt-exec` sobre um marcador esquecido de
# 5,6 dias gravou "8134min 34s / 0.01 tok/s" sem reclamar; a main tinha PRD-001-exec.json de 3 dias esperando o mesmo.
# Acima de HARNESS_METRICS_STALE_H horas (default 24) o stop recusa, apaga o marcador e pede para repetir — a repeticao
# cai no inicio DERIVADO DO TRANSCRIPT (abaixo). --forcar-stale grava assim mesmo (execucao que durou dias de verdade).
STALE_H="${HARNESS_METRICS_STALE_H:-24}"; case "$STALE_H" in ''|*[!0-9]*) STALE_H=24 ;; esac
if [ "$SEM_START" = "0" ] && [ "${FORCAR_STALE:-0}" != "1" ] && [ $(( (NOW - START) / 3600 )) -ge "$STALE_H" ] 2>/dev/null; then
  echo "[harness-metrics] RECUSADO: o marcador de start de $LABEL tem $(( (NOW - START) / 3600 ))h (limite HARNESS_METRICS_STALE_H=$STALE_H) — e estado esquecido de outra sessao ($(basename "$STATE")). Nao gravei a linha (seria duracao inventada). Marcador removido: repita o mesmo stop agora (o inicio sera derivado do transcript desta sessao) ou, se a execucao durou isso mesmo, repita com --forcar-stale." >&2
  echo "TELEMETRIA|stale|$LABEL|$(( (NOW - START) / 3600 ))h"
  rm -f "$STATE" 2>/dev/null || true
  exit 4
fi
# 3.5.3: esforco da sessao por fase — alvo (Perfil/preset) x atual (get_session/CLAUDE_CODE_EFFORT_LEVEL). O
# esforco.sh grava .harness-run/esforco.env na decolagem; aqui vira o campo `esforco` da run ("medium/high"
# = drift: a exec rodou acima do alvo). Vazio = nao medido.
ESFORCO="$(printf '%s' "${ESFORCO:-}" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z/' | cut -c1-16)"
ESFORCO_FINAL="$(printf '%s' "${ESFORCO_FINAL:-}" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z' | cut -c1-8)"
if [ -z "$ESFORCO" ] && [ -f "$CLAUDE_DIR/.harness-run/esforco.env" ]; then
  # 3.5.4: esforco.env de OUTRA decolagem nao vale — medido 14/09: a 139-b (exec 12:52) leu o esforco.env de um /prd
  # das 10:26 e gravou high/n/d; a main (dt-exec 13:05) leu o das 11:32. Vale se gravado apos o start desta run
  # (30 min de folga para o marcador tardio do guard-agent).
  E_TS="$(grep '^ts=' "$CLAUDE_DIR/.harness-run/esforco.env" 2>/dev/null | cut -d= -f2 | tr -cd '0-9')"
  if [ "$SEM_START" = "0" ] && [ -n "$E_TS" ] && [ "$E_TS" -lt $(( START - 1800 )) ] 2>/dev/null; then
    echo "[harness-metrics] esforco.env foi gravado $(( (START - E_TS) / 60 )) min ANTES do start desta run — ignorado (a skill nao rodou esforco.sh nesta decolagem; campo esforco fica vazio)." >&2
  else
    E_ALVO="$(grep '^alvo=' "$CLAUDE_DIR/.harness-run/esforco.env" 2>/dev/null | cut -d= -f2 | tr -cd 'a-z')"
    E_ATUAL="$(grep '^atual=' "$CLAUDE_DIR/.harness-run/esforco.env" 2>/dev/null | cut -d= -f2 | tr -cd 'a-z/')"
    [ -n "$E_ALVO" ] && ESFORCO="${E_ALVO}/${E_ATUAL:-n/d}"
  fi
fi
# 3.5.4: --esforco-final=<nivel> — o esforco EFETIVO lido no fechamento (get_session self) substitui o `atual` da
# decolagem: quem trocou o esforco no Desktop depois do esforco.sh (medido 14/09: as duas execs) deixava a run
# gravada com o valor velho.
case "$ESFORCO_FINAL" in
  low|medium|high|xhigh|max) E_ALVO2="${ESFORCO%%/*}"; [ -n "$E_ALVO2" ] || E_ALVO2="n/d"; ESFORCO="$E_ALVO2/$ESFORCO_FINAL" ;;
esac
[ -n "${GATE_OK:-}" ] && EXTRA="${EXTRA:+$EXTRA; }gate: fechado sem prova por decisao humana — $GATE_OK"
# sanitizacao dos campos livres (valor curto, sem aspas/controle — o JSON e montado com printf)
_san() { printf '%s' "$1" | tr -d '"\\' | tr '\n\r\t' '   ' | tr -d '\000-\037' | cut -c1-40; }
MODO="$(_san "$MODO")"; [ -n "$MODO" ] || MODO="normal"
LIMITOU="$(_san "$LIMITOU")"; REVIEW_MODO="$(_san "$REVIEW_MODO")"; CODEX="$(_san "$CODEX")"
case "$STALLS" in ''|*[!0-9]*) STALLS="" ;; esac
case "$TASKS_EST" in ''|*[!0-9]*) TASKS_EST="" ;; esac
case "$VIVOS_MAX" in ''|*[!0-9]*) VIVOS_MAX="" ;; esac   # 3.5.3: so inteiro; qualquer outra coisa = nao medido

# tokens + sinais de espera (best-effort, via Node — sem deps; n/d se node ausente
# ou transcript nao localizado). O 3o arg e o log de esperas do hook notify.sh;
# o 5o e o limiar de gap (min) acima do qual um gap do transcript conta como espera.
TOK_TOTAL=""; TOK_OUT=""; TOK_IN=""; TOK_CR=""
MAX_GAP=""; PERM_N=""; WAIT_S=""; DENIED_N=""; SPIRAL_N=""; PERGUNTAS=""; WAITS_INV=""
GAP_BUSY_S=""; GAP_N=""; GAP_THRESHOLD=""; IDLE_N=""
SUB_BUSY_S=""; SUB_N=""; SUB_SPAN_S=""; SUB_TOK_OUT=""; SUB_TOK_TOTAL=""; TOK_ALL_OUT=""
HERMES_E_S=""; HERMES_C_S=""; HERMES_TURNS=""; GATES_S=""
THINK_PCT=""; SUB_THINK_PCT=""   # 3.5.3: % estimado de raciocinio invisivel (pai / subagentes)
TOK_LINE="tokens: n/d (Node ausente ou transcript nao localizado)"
WAITS_FILE="$STATE_DIR/permission-waits.jsonl"
GAP_MIN_CFG="${HARNESS_WAIT_GAP_MIN:-10}"
NODE_BIN="${HARNESS_RAG_NODE:-}"
[ -z "$NODE_BIN" ] && command -v node >/dev/null 2>&1 && NODE_BIN="node"
# 3.5.4: SEM MARCADOR? o inicio vem do TRANSCRIPT da sessao (1a linha com timestamp do .jsonl mais recente do projeto)
# em vez de ts_start=null. Medido 14/09 (LOTE-045/DT-592 na main): o auto-start nao criou o marcador e a run ficou sem
# duracao e sem tokens (o Node so soma o que veio depois do start). A origem fica gravada em `origem_start`.
ORIGEM_START="marcador"
if [ "$SEM_START" = "1" ] && [ -n "$NODE_BIN" ]; then
  DERIV="$("$NODE_BIN" -e '
    const fs=require("fs"),p=require("path"),os=require("os");
    let root=(process.argv[1]||"").replace(/^\/([a-zA-Z])\//,(m,d)=>d.toUpperCase()+":/");   // /c/x (Git Bash) -> C:/x (slug real do Claude Code)
    const base=p.join(os.homedir(),".claude","projects"); let dir=p.join(base,root.replace(/[^a-zA-Z0-9]/g,"-"));
    if(!fs.existsSync(dir)){ const suf="-"+p.basename(root).replace(/[^a-zA-Z0-9]/g,"-"); let bd="",bt=0; try{for(const d of fs.readdirSync(base)){ if(!d.endsWith(suf))continue; const m=fs.statSync(p.join(base,d)).mtimeMs; if(m>bt){bt=m;bd=p.join(base,d);} }}catch{} if(bd)dir=bd; }
    let best="",bm=0; try{for(const f of fs.readdirSync(dir)){if(!f.endsWith(".jsonl"))continue;const m=fs.statSync(p.join(dir,f)).mtimeMs;if(m>bm){bm=m;best=p.join(dir,f);}}}catch{}
    if(!best)process.exit(1);
    const fd=fs.openSync(best,"r");const b=Buffer.alloc(262144);const n=fs.readSync(fd,b,0,b.length,0);fs.closeSync(fd);
    const m=b.toString("utf8",0,n).match(/"timestamp":"([^"]+)"/); if(!m)process.exit(1);
    const t=Date.parse(m[1]); if(!Number.isFinite(t))process.exit(1); process.stdout.write(String(Math.floor(t/1000)));
  ' "$PROJECT_ROOT" 2>/dev/null)"
  case "$DERIV" in ''|*[!0-9]*) DERIV="" ;; esac
  if [ -n "$DERIV" ] && [ "$DERIV" -lt "$NOW" ] 2>/dev/null; then
    START="$DERIV"; SEM_START=0; ORIGEM_START="transcript"
    ELAPSED=$(( NOW - START )); START_OUT="$START"; ELAPSED_OUT="$ELAPSED"; MM=$(( ELAPSED / 60 )); SS=$(( ELAPSED % 60 ))
    echo "[harness-metrics] inicio DERIVADO do transcript da sessao (${MM}min atras) — nao havia marcador de start; a linha sai com origem_start=transcript." >&2
    echo "TELEMETRIA|start-derivado|$LABEL|$START"
  fi
fi
[ "$SEM_START" = "1" ] && ORIGEM_START="null"
if [ -n "$NODE_BIN" ] && [ -f "$SCRIPT_DIR/harness-metrics.mjs" ]; then
  MOUT="$("$NODE_BIN" "$SCRIPT_DIR/harness-metrics.mjs" "$START" "$PROJECT_ROOT" "$WAITS_FILE" "$PLATFORM" "$GAP_MIN_CFG" 2>/dev/null)"
  if printf '%s' "$MOUT" | grep -q '"ok":true'; then
    TOK_TOTAL="$(printf '%s' "$MOUT" | grep -o '"total":[0-9]*' | grep -o '[0-9]*' | head -n1)"
    TOK_OUT="$(printf '%s' "$MOUT" | grep -o '"output":[0-9]*' | grep -o '[0-9]*' | head -n1)"
    TOK_IN="$(printf '%s' "$MOUT" | grep -o '"input":[0-9]*' | grep -o '[0-9]*' | head -n1)"
    TOK_CR="$(printf '%s' "$MOUT" | grep -o '"cacheRead":[0-9]*' | grep -o '[0-9]*' | head -n1)"
    MAX_GAP="$(printf '%s' "$MOUT" | grep -o '"maxGapMin":[0-9.]*' | cut -d: -f2 | head -n1)"
    PERM_N="$(printf '%s' "$MOUT" | grep -o '"permCount":[0-9]*' | cut -d: -f2 | head -n1)"
    WAIT_S="$(printf '%s' "$MOUT" | grep -o '"waitS":[0-9]*' | cut -d: -f2 | head -n1)"
    DENIED_N="$(printf '%s' "$MOUT" | grep -o '"deniedN":[0-9]*' | cut -d: -f2 | head -n1)"
    SPIRAL_N="$(printf '%s' "$MOUT" | grep -o '"spiralN":[0-9]*' | cut -d: -f2 | head -n1)"
    # 3.4.23: perguntas ao humano (AskUserQuestion) separadas dos prompts de permissao; linhas
    # invalidas do permission-waits.jsonl ignoradas E contadas (parser tolerante, item 15f)
    PERGUNTAS="$(printf '%s' "$MOUT" | grep -o '"askCount":[0-9]*' | cut -d: -f2 | head -n1)"
    WAITS_INV="$(printf '%s' "$MOUT" | grep -o '"waitsInvalid":[0-9]*' | cut -d: -f2 | head -n1)"
    GAP_BUSY_S="$(printf '%s' "$MOUT" | grep -o '"gapBusyS":[0-9]*' | cut -d: -f2 | head -n1)"
    GAP_N="$(printf '%s' "$MOUT" | grep -o '"gapCount":[0-9]*' | cut -d: -f2 | head -n1)"
    GAP_THRESHOLD="$(printf '%s' "$MOUT" | grep -o '"gapThresholdMin":[0-9]*' | cut -d: -f2 | head -n1)"
    IDLE_N="$(printf '%s' "$MOUT" | grep -o '"idleCount":[0-9]*' | cut -d: -f2 | head -n1)"
    SUB_BUSY_S="$(printf '%s' "$MOUT" | grep -o '"subagentBusyS":[0-9]*' | cut -d: -f2 | head -n1)"
    SUB_N="$(printf '%s' "$MOUT" | grep -o '"subagentN":[0-9]*' | cut -d: -f2 | head -n1)"
    CICLOS_MAX="$(printf '%s' "$MOUT" | grep -o '"ciclosMax":[0-9]*' | cut -d: -f2 | head -n1)"
    SUB_SPAN_S="$(printf '%s' "$MOUT" | grep -o '"subagentSpanS":[0-9]*' | cut -d: -f2 | head -n1)"
    SUB_TOK_OUT="$(printf '%s' "$MOUT" | grep -o '"subOutput":[0-9]*' | cut -d: -f2 | head -n1)"
    SUB_TOK_TOTAL="$(printf '%s' "$MOUT" | grep -o '"subTotal":[0-9]*' | cut -d: -f2 | head -n1)"
    # 3.4.11: tempo por papel (hermes E/C, gates) e turnos do hermes
    HERMES_E_S="$(printf '%s' "$MOUT" | grep -o '"hermesEBusyS":[0-9]*' | cut -d: -f2 | head -n1)"
    HERMES_C_S="$(printf '%s' "$MOUT" | grep -o '"hermesCBusyS":[0-9]*' | cut -d: -f2 | head -n1)"
    HERMES_TURNS="$(printf '%s' "$MOUT" | grep -o '"hermesTurns":[0-9]*' | cut -d: -f2 | head -n1)"
    GATES_S="$(printf '%s' "$MOUT" | grep -o '"gatesBusyS":[0-9]*' | cut -d: -f2 | head -n1)"
    # 3.5.3: % estimado de raciocinio invisivel (ausente no JSON quando output = 0 -> fica vazio)
    THINK_PCT="$(printf '%s' "$MOUT" | grep -o '"thinkingPct":[0-9]*' | cut -d: -f2 | head -n1)"
    SUB_THINK_PCT="$(printf '%s' "$MOUT" | grep -o '"subThinkingPct":[0-9]*' | cut -d: -f2 | head -n1)"
    [ -n "$TOK_OUT" ] && TOK_LINE="tokens (aprox.): ${TOK_OUT} output / ${TOK_IN} input / ${TOK_TOTAL} total c/ cache"
    # 2.14.0: os tokens dos subagentes vivem em subpasta do transcript e NUNCA entraram
    # no tokens_output — campos separados (serie historica do tokens_output preservada).
    if [ -n "$SUB_TOK_OUT" ] && [ "${SUB_TOK_OUT:-0}" -gt 0 ] 2>/dev/null; then
      TOK_ALL_OUT=$(( ${TOK_OUT:-0} + SUB_TOK_OUT ))
      TOK_LINE="${TOK_LINE} + ${SUB_TOK_OUT} output em ${SUB_N:-?} subagente(s) = ${TOK_ALL_OUT} output REAL"
    fi
    # 3.5.3: raciocinio invisivel (estimado) no resumo — so quando medido
    if [ -n "$TOK_OUT" ] && { [ -n "$THINK_PCT" ] || [ -n "$SUB_THINK_PCT" ]; }; then
      RAC=""
      [ -n "$THINK_PCT" ] && RAC="~${THINK_PCT}% (pai)"
      [ -n "$SUB_THINK_PCT" ] && RAC="${RAC:+$RAC / }~${SUB_THINK_PCT}% (subagentes)"
      TOK_LINE="${TOK_LINE} — raciocinio ${RAC}"
    fi
  fi
fi

# out_tps = tokens_output / elapsed_s (o detector barato de espera humana).
# ATENCAO: e o throughput da SESSAO PRINCIPAL — serie historica, nao mexer. O throughput
# REAL (com subagente) e o out_tps_all abaixo; execucao com muito subagente tem out_tps
# baixo por construcao, nao por lentidao.
# 3.5.3: tokens_output passou a ser por mensagem UNICA (dedup por message.id) — out_tps e
# out_tps_all de linhas anteriores a 13/09/2026 estao inflados (~2,4x na pai: a PRD-142-b
# registrou 56 tok/s onde o real era 24). A regua "saudavel 100-270" foi calibrada na serie
# inflada — releia com desconfianca ate recalibrar.
OUT_TPS=""; OUT_TPS_ALL=""
if [ -n "$TOK_OUT" ] && [ "$ELAPSED" -gt 0 ]; then
  OUT_TPS="$(awk "BEGIN{printf \"%.2f\", $TOK_OUT/$ELAPSED}" 2>/dev/null)"
  if [ -n "$TOK_ALL_OUT" ]; then
    OUT_TPS_ALL="$(awk "BEGIN{printf \"%.2f\", $TOK_ALL_OUT/$ELAPSED}" 2>/dev/null)"
  fi
fi

# espera OCIOSA medida (gaps U notify, MENOS subagente vivo) -> duracao ativa.
# 2.12.0: wait_human_min passa a valer a ociosidade REAL — gap com subagente vivo
# NAO entra mais aqui (vai em wait_gap_min, como trabalho). Linha pre-2.12.0 somava
# os dois no mesmo campo: nao sao comparaveis (ver "schema" abaixo).
WAIT_MIN=""; ACTIVE_S=""; GAP_BUSY_MIN=""; SUB_BUSY_MIN=""; PARALLEL=""
if [ -n "$WAIT_S" ]; then
  WAIT_MIN=$(( WAIT_S / 60 ))
  ACTIVE_S=$(( ELAPSED - WAIT_S )); [ "$ACTIVE_S" -lt 0 ] && ACTIVE_S=0
fi
# 3.5.5 (C7): DELEGACOES EXTERNAS (harness-delegate.sh -> prds/_metrics/delegations/*.jsonl) contam como trabalho de
# subagente. Medido 15/09: PRD-145-fase1 com 4 delegacoes ao Codex de 105-176 s em paralelo gravou fator 0,05 e codex="".
# Linha do manifest com o rotulo-base da run (PRD-145 para PRD-145-fase1) e ts dentro da janela soma duration_s.
DELEG_N=0; DELEG_S=0
if [ "$SEM_START" = "0" ] && [ -d "$METRICS_DIR/delegations" ]; then
  RUN_BASE="$(printf '%s' "$LABEL" | sed -E 's/-(fase[12]|exec)(-[a-z0-9]+)*$//')"
  for _df in "$METRICS_DIR"/delegations/*.jsonl; do
    [ -s "$_df" ] || continue
    while IFS= read -r _dl; do
      case "$_dl" in *"\"label\":\"$RUN_BASE\""*) : ;; *) continue ;; esac
      _dts="$(printf '%s' "$_dl" | grep -o '"ts":"[^"]*"' | head -n1 | cut -d'"' -f4)"
      _de="$(date -d "$_dts" +%s 2>/dev/null || echo 0)"
      [ "$_de" -ge $(( START - 120 )) ] 2>/dev/null && [ "$_de" -le "$NOW" ] 2>/dev/null || continue
      _dd="$(printf '%s' "$_dl" | grep -o '"duration_s":[0-9]*' | head -n1 | cut -d: -f2)"
      DELEG_N=$(( DELEG_N + 1 )); DELEG_S=$(( DELEG_S + ${_dd:-0} ))
    done < "$_df"
  done
  if [ "$DELEG_N" -gt 0 ]; then
    SUB_BUSY_S=$(( ${SUB_BUSY_S:-0} + DELEG_S )); SUB_N=$(( ${SUB_N:-0} + DELEG_N ))
    [ -n "$CODEX" ] || CODEX="ok"
    EXTRA="${EXTRA:+$EXTRA; }delegacoes=${DELEG_N} (${DELEG_S}s no executor externo)"
  fi
fi
[ -n "$GAP_BUSY_S" ] && GAP_BUSY_MIN=$(( GAP_BUSY_S / 60 ))
[ -n "$SUB_BUSY_S" ] && SUB_BUSY_MIN=$(( SUB_BUSY_S / 60 ))

# fator de paralelismo = trabalho somado dos subagentes / duracao ATIVA (janela util,
# ja sem ociosidade). ~1,0 com muitos subagentes = execucao SERIAL (um agente por vez);
# 2,0 = em media dois trabalhando ao mesmo tempo. Regua no PLAYBOOK-TELEMETRIA.
if [ -n "$SUB_BUSY_S" ] && [ -n "$ACTIVE_S" ] && [ "$ACTIVE_S" -gt 0 ]; then
  PARALLEL="$(awk "BEGIN{printf \"%.2f\", $SUB_BUSY_S/$ACTIVE_S}" 2>/dev/null)"
fi

# 3.4.11 — dieta da criacao: tamanho medio das tasks (linhas) desta PRD, minutos do hermes por
# modo, turnos do hermes e minutos de gate. E o que faltou para ver a 3.4.10 regredir na hora
# (tasks 2,6x maiores e correcoes 5x mais longas so apareceram numa analise de transcript).
MIN_HERMES_E=""; MIN_HERMES_C=""; MIN_GATES=""; LINHAS_TASK=""
[ -n "$HERMES_E_S" ] && MIN_HERMES_E=$(( HERMES_E_S / 60 ))
[ -n "$HERMES_C_S" ] && MIN_HERMES_C=$(( HERMES_C_S / 60 ))
[ -n "$GATES_S" ] && MIN_GATES=$(( GATES_S / 60 ))
PRD_PFX="$(printf '%s' "$LABEL" | grep -oE '^PRD-[0-9]+(-[a-z])?\b' | head -1)"
if [ -n "$PRD_PFX" ]; then
  LT_N="$(ls "$PROJECT_ROOT"/prds/"$PRD_PFX"-*/tasks/TASK-*.md 2>/dev/null | wc -l | tr -d ' ')"
  if [ "${LT_N:-0}" -gt 0 ] 2>/dev/null; then
    LT_TOT="$(cat "$PROJECT_ROOT"/prds/"$PRD_PFX"-*/tasks/TASK-*.md 2>/dev/null | wc -l | tr -d ' ')"
    LINHAS_TASK=$(( ${LT_TOT:-0} / LT_N ))
  fi
fi

# append no historico comparativo (jsonl). Campos novos da 1.8.0/1.9.0/2.10.0/2.12.0
# podem vir vazios ("") — linhas antigas nao os tem; historico misto e esperado (ver
# PLAYBOOK). O campo "schema" e a FRONTEIRA DE VERSAO explicita: ausente = linha
# pre-2.12.0, cujo wait_human_min mistura ociosidade com espera de subagente e cujo
# elapsed_active_s desconta as duas — nao comparavel com linha nova.
mkdir -p "$METRICS_DIR" 2>/dev/null || true
# 3.4.20: contadores que a sessao esqueceu de passar sao DERIVADOS, nao deixados vazios (a exec da
# PRD-135, 02/09, gravou tasks/ciclos/subagents em branco). subagents = janelas medidas pelo .mjs;
# ciclos = maior "ciclo N" nas descricoes de sherlock/beholder/michelangelo; tasks = arquivos
# TASK-*.md da pasta da PRD do rotulo (sem acceptance/doc, que nao sao trabalho).
[ -n "$SUBAGENTS" ] || SUBAGENTS="${SUB_N:-}"
[ -n "$CICLOS" ] || CICLOS="${CICLOS_MAX:-}"
if [ -z "$TASKS" ]; then
  PRD_LBL="$(printf '%s' "$LABEL" | sed -E 's/-exec$//' | grep -oE '^PRD-[0-9]+(-[a-z])?$' || true)"
  if [ -n "$PRD_LBL" ]; then
    PRD_DIR="$(ls -d "$PROJECT_ROOT"/prds/"$PRD_LBL"-*/ 2>/dev/null | grep -vE "/$PRD_LBL-[a-z]-" | head -1)"
    [ -n "$PRD_DIR" ] && TASKS="$(ls "$PRD_DIR"/tasks/TASK-*.md 2>/dev/null | grep -viE 'acceptance|doc-raiz|doc_raiz|documenta' | wc -l | tr -d ' ')"
    [ "${TASKS:-0}" = "0" ] && TASKS=""
  fi
fi
# ---- 3.4.23 (item 15b): campos estruturados DERIVADOS (best-effort; vazio = n/d, nunca zero).
# Schema continua "2.15.0" (so ACRESCENTA campos; a serie historica segue legivel). Campos 3.4.23:
#   modo, limitou, review_modo, codex, stalls, tasks_estouradas, spawn_ms, frentes, perguntas,
#   waits_invalidas — ver prds/_metrics/README.md. HARNESS_METRICS_DERIVAR=0 pula as derivacoes
#   (os campos passados por flag continuam gravados).
SPAWN_MS=""; FRENTES=""
RUNS_DIR="$METRICS_DIR/runs"
RUN_USER="${USER:-${USERNAME:-dev}}"
RUN_HOST="$(hostname 2>/dev/null | cut -d. -f1)"; : "${RUN_HOST:=maquina}"
WT_SUF=""; WT_ROT="$(grep '^rotulo=' "$CLAUDE_DIR/.harness-run/worktree.env" 2>/dev/null | cut -d= -f2)"; [ -n "$WT_ROT" ] && WT_SUF="~$WT_ROT"
RUN_BASENAME="$(printf '%s@%s%s' "$RUN_USER" "$RUN_HOST" "$WT_SUF" | tr -c 'A-Za-z0-9@._~-' '_').jsonl"
RUN_FILE="$RUNS_DIR/$RUN_BASENAME"
if [ "${HARNESS_METRICS_DERIVAR:-1}" = "1" ]; then
  # tasks_estouradas: linhas de prds/_metrics/tasks/<self>.jsonl desta maquina com ts dentro da
  # janela da run e dur_s > envelope (HARNESS_TASK_PREVISAO_MAX_MIN, 45 min)
  if [ -z "$TASKS_EST" ] && [ "$SEM_START" = "0" ] && [ -s "$METRICS_DIR/tasks/$RUN_BASENAME" ]; then
    ENV_S=$(( ${HARNESS_TASK_PREVISAO_MAX_MIN:-45} * 60 ))
    TASKS_EST="$(awk -v a="$START" -v b="$NOW" -v e="$ENV_S" '
      { ts=""; d="";
        if (match($0, /"ts":[0-9]+/)) ts=substr($0, RSTART+5, RLENGTH-5);
        if (match($0, /"dur_s":[0-9]+/)) d=substr($0, RSTART+8, RLENGTH-8);
        if (ts != "" && d != "" && ts+0 >= a+0 && ts+0 <= b+0 && d+0 > e+0) n++ }
      END { printf "%d", n+0 }' "$METRICS_DIR/tasks/$RUN_BASENAME" 2>/dev/null)"
    case "$TASKS_EST" in ''|*[!0-9]*) TASKS_EST="" ;; esac
  fi
  # spawn_ms: ultimo valor medido pelo doctor desta maquina (~/.harness-run/spawn-history.jsonl)
  HR_HOME="${HOME:-${USERPROFILE:-}}"
  if [ -n "$HR_HOME" ] && [ -s "$HR_HOME/.harness-run/spawn-history.jsonl" ]; then
    SPAWN_MS="$(tail -1 "$HR_HOME/.harness-run/spawn-history.jsonl" 2>/dev/null | grep -o '"ms":[0-9]*' | cut -d: -f2 | head -n1)"
    case "$SPAWN_MS" in ''|*[!0-9]*) SPAWN_MS="" ;; esac
  fi
  # frentes: ocupacao do semaforo NO FECHAMENTO (antes do release abaixo) — "1/1", "2/2"...
  if [ -f "$SCRIPT_DIR/frentes.mjs" ] && command -v "${HARNESS_RAG_NODE:-node}" >/dev/null 2>&1; then
    FRENTES="$("${HARNESS_RAG_NODE:-node}" "$SCRIPT_DIR/frentes.mjs" status 2>/dev/null | head -n1 | awk -F'|' '$1=="FRENTES" && $2=="status" { print $3 }' | tr -cd '0-9/' | cut -c1-8)"
  fi
fi
LINE="$(printf '{"label":"%s","schema":"%s","platform":"%s","ts_start":%s,"ts_end":%s,"elapsed_s":%s,"elapsed_active_s":"%s","tasks":"%s","ciclos":"%s","subagents":"%s","waves":"%s","preset":"%s","models":"%s","tokens_output":"%s","tokens_input":"%s","tokens_cache_read":"%s","tokens_total":"%s","tokens_output_subagents":"%s","tokens_total_subagents":"%s","out_tps":"%s","out_tps_all":"%s","max_gap_min":"%s","wait_human_min":"%s","wait_idle_min":"%s","wait_gap_min":"%s","wait_gap_threshold_min":"%s","subagent_busy_min":"%s","subagent_measured":"%s","parallel_factor":"%s","permission_prompts":"%s","classifier_denials":"%s","spiral_blocks":"%s","achados_por_ciclo":"%s","linhas_por_task":"%s","min_hermes_e":"%s","min_hermes_c":"%s","turnos_hermes":"%s","min_gates":"%s","modo":"%s","limitou":"%s","review_modo":"%s","codex":"%s","stalls":"%s","tasks_estouradas":"%s","spawn_ms":"%s","frentes":"%s","perguntas":"%s","waits_invalidas":"%s","tokens_thinking_pct":"%s","tokens_thinking_pct_subagents":"%s","vivos_max":"%s"}\n' \
  "$LABEL" "$SCHEMA_TELEMETRIA" "$PLATFORM" "$START_OUT" "$NOW" "$ELAPSED_OUT" "$ACTIVE_S" "$TASKS" "$CICLOS" "$SUBAGENTS" "$WAVES" "$PRESET" "$MODELS" "$TOK_OUT" "$TOK_IN" "$TOK_CR" "$TOK_TOTAL" "$SUB_TOK_OUT" "$SUB_TOK_TOTAL" "$OUT_TPS" "$OUT_TPS_ALL" "$MAX_GAP" "$WAIT_MIN" "$WAIT_MIN" "$GAP_BUSY_MIN" "$GAP_THRESHOLD" "$SUB_BUSY_MIN" "$SUB_N" "$PARALLEL" "$PERM_N" "$DENIED_N" "$SPIRAL_N" "$ACHADOS" "$LINHAS_TASK" "$MIN_HERMES_E" "$MIN_HERMES_C" "$HERMES_TURNS" "$MIN_GATES" \
  "$MODO" "$LIMITOU" "$REVIEW_MODO" "$CODEX" "$STALLS" "$TASKS_EST" "$SPAWN_MS" "$FRENTES" "$PERGUNTAS" "$WAITS_INV" \
  "$THINK_PCT" "$SUB_THINK_PCT" "$VIVOS_MAX")"   # 3.5.3: tres campos ao FIM (schema segue 2.15.0; vazio = nao medido)
LINE="${LINE%\}},\"esforco\":\"${ESFORCO}\"}"   # 3.5.3: alvo/atual do esforco da sessao (esforco.sh); vazio = nao medido
LINE="${LINE%\}},\"origem_start\":\"${ORIGEM_START}\"}"   # 3.5.4: marcador | transcript (derivado) | null
harness_jsonl_append "$HIST" "$LINE"   # DT-007: com lock

# HISTORICO VERSIONADO POR DEV/MAQUINA (3.2.2) — pedido do Charles (22/08/2026): as
# metricas de execucao, dele E da equipe, precisam viver NO REPO para analise geral.
# O harness-runs.jsonl acima e LOCAL nos projetos (a 2.10.0 o tirou do git porque o
# historico do core viajava para os clones no merge do upstream e duplicava 63% das
# linhas). A solucao aqui e diferente: UM ARQUIVO POR DEV/MAQUINA (append-only em
# arquivos distintos = sem conflito de merge) e cada linha carrega o PROJETO de origem;
# o dashboard descarta linha cujo projeto nao e o repo onde ela esta (linhagem de clone).
# 3.4.0: num WORKTREE o arquivo ganha o sufixo ~<rotulo> — dois worktrees do mesmo dev
# anexando no mesmo arquivo gerariam conflito de merge ao fechar. (RUN_FILE/RUN_USER/RUN_HOST
# calculados acima, antes das derivacoes 3.4.23 que precisam do nome do arquivo de tasks.)
GIT_EMAIL="$(git -C "$PROJECT_ROOT" config user.email 2>/dev/null)"
PROJ_NOME="$(basename "$PROJECT_ROOT")"
EXTRA_J="$(printf '%s' "$EXTRA" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr -d '\n\r')"
mkdir -p "$RUNS_DIR" 2>/dev/null || true
printf '{"projeto":"%s","autor":"%s","maquina":"%s","harness":"%s","extra":"%s",%s\n' \
  "$PROJ_NOME" "$GIT_EMAIL" "$RUN_USER@$RUN_HOST" "${HARNESS_VERSION:-}" "$EXTRA_J" "${LINE#\{}" >> "$RUN_FILE" 2>/dev/null || true

# 3.4.22 (item 16): a telemetria chega ao git SOZINHA — o stop faz `git add` do arquivo DESTA
# maquina (runs/ e tasks/ do SubagentStop; nunca _metrics/ inteiro, nunca commit). Medido 04/09:
# runs/ so chegava quando o dev lembrava de incluir (Debora: 0 em 2 repos com 9 PRDs). O commit
# escopado da skill leva o que ja esta staged. Desligar: HARNESS_METRICS_GIT_ADD=0.
GIT_STAGED=""
if [ "${HARNESS_METRICS_GIT_ADD:-1}" = "1" ] && git -C "$PROJECT_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  # 3.4.23 (item 15g): o arquivo de INCIDENTES desta maquina entra no mesmo stage
  # 3.5.0: + delegations/ e duelos/ desta maquina (deixaram de ser arquivo compartilhado)
  for gf in "$RUN_FILE" "$METRICS_DIR/tasks/$RUN_BASENAME" "$METRICS_DIR/incidentes/$RUN_BASENAME" "$METRICS_DIR/delegations/$RUN_BASENAME" "$METRICS_DIR/duelos/$RUN_BASENAME"; do
    [ -s "$gf" ] || continue
    if git -C "$PROJECT_ROOT" add -- "$gf" >/dev/null 2>&1; then GIT_STAGED="${GIT_STAGED:+$GIT_STAGED, }${gf#$PROJECT_ROOT/}"; fi
  done
fi

rm -f "$STATE" 2>/dev/null || true

# bloco markdown do resumo (stdout — a skill cola no output final)
echo ""
echo "## Telemetria — $LABEL"
echo ""
echo "- **Plataforma:** ${PLATFORM}"
[ -n "$PRESET" ] && echo "- **Preset:** ${PRESET}${MODELS:+ (${MODELS})}"
if [ "$SEM_START" = "1" ]; then echo "- **Duracao:** SEM START (marcador ausente — nao medida; ver aviso acima)"; else echo "- **Duracao:** ${MM}min ${SS}s$( [ "$ORIGEM_START" = "transcript" ] && printf ' (inicio derivado do transcript — sem marcador de start)' )"; fi
if [ -n "$WAIT_S" ] && [ "$WAIT_S" -gt 60 ]; then
  A_MM=$(( ACTIVE_S / 60 ))
  FONTES=""
  [ -n "$PERM_N" ] && [ "${PERM_N:-0}" -gt 0 ] 2>/dev/null && FONTES="${PERM_N} janela(s) de permissao/idle"
  if [ -n "$IDLE_N" ] && [ "${IDLE_N:-0}" -gt 0 ] 2>/dev/null; then
    [ -n "$FONTES" ] && FONTES="$FONTES + "
    FONTES="${FONTES}${IDLE_N} janela(s) ociosa(s) > ${GAP_THRESHOLD:-10}min no transcript"
  fi
  [ -z "$FONTES" ] && FONTES="fontes mescladas"
  echo "- **Espera OCIOSA medida:** ${WAIT_MIN}min (${FONTES}) — duracao ATIVA ~${A_MM}min"
fi
# gap explicado por subagente vivo: e TRABALHO, nao espera (2.12.0)
if [ -n "$GAP_BUSY_MIN" ] && [ "${GAP_BUSY_MIN:-0}" -gt 0 ] 2>/dev/null; then
  echo "- **Gap com subagente vivo:** ${GAP_BUSY_MIN}min — trabalho em background (NAO conta como espera)"
fi
# fator de paralelismo (2.12.0): o numero que denuncia execucao serial
if [ -n "$PARALLEL" ]; then
  A_MM=$(( ${ACTIVE_S:-0} / 60 ))
  echo "- **Paralelismo:** ${SUB_BUSY_MIN}min de trabalho em ${SUB_N:-?} subagente(s) sobre ${A_MM}min de janela ativa — **fator ${PARALLEL}** (saudavel: >= 1.3; ~1.0 = serial)"
fi
VOL="- **Volume:**"
[ -n "$TASKS" ]     && VOL="$VOL ${TASKS} tasks;"
[ -n "$CICLOS" ]    && VOL="$VOL ${CICLOS} ciclos de review;"
[ -n "$SUBAGENTS" ] && VOL="$VOL ${SUBAGENTS} subagentes;"
[ -n "$WAVES" ]     && VOL="$VOL ${WAVES} onda(s) de paralelismo;"
[ "$VOL" != "- **Volume:**" ] && echo "${VOL%;}"
echo "- **${TOK_LINE}**"
if [ -n "$OUT_TPS_ALL" ]; then
  echo "- **Throughput REAL:** ${OUT_TPS_ALL} tok/s de output (principal + subagentes) — o out_tps da sessao sozinha e ${OUT_TPS} e NAO mede esta execucao"
elif [ -n "$OUT_TPS" ]; then
  echo "- **Throughput:** ${OUT_TPS} tok/s de output (saudavel: 100-270; <30 c/ duracao alta = espera humana)"
fi
[ -n "$MAX_GAP" ] && echo "- **Maior gap do transcript:** ${MAX_GAP}min"
if [ -n "$DENIED_N" ] && [ "${DENIED_N:-0}" -gt 0 ] 2>/dev/null; then
  echo "- **⚠️ Negacoes do classificador de permissao:** ${DENIED_N}${SPIRAL_N:+ (+ ${SPIRAL_N} corte(s) anti-espiral)} — a execucao atravessou indisponibilidade do auto mode; ver PLAYBOOK, secao 'Classificador indisponivel'"
elif [ -n "$SPIRAL_N" ] && [ "${SPIRAL_N:-0}" -gt 0 ] 2>/dev/null; then
  echo "- **⚠️ Cortes anti-espiral (guard-bash):** ${SPIRAL_N} — comando repetido sem executar; ver PLAYBOOK, secao 'Classificador indisponivel'"
fi
# 3.4.11: dieta da criacao — o que a 3.4.10 nao media
DIETA=""
[ -n "$LINHAS_TASK" ] && DIETA="${LINHAS_TASK} linhas/task (media)"
[ -n "$ACHADOS" ] && DIETA="${DIETA:+$DIETA; }🔴 por ciclo: ${ACHADOS}"
[ -n "$MIN_GATES" ] && DIETA="${DIETA:+$DIETA; }gates ${MIN_GATES}min"
if [ -n "$MIN_HERMES_E" ] || [ -n "$MIN_HERMES_C" ]; then DIETA="${DIETA:+$DIETA; }hermes E ${MIN_HERMES_E:-0}min / C ${MIN_HERMES_C:-0}min (${HERMES_TURNS:-0} turnos)"; fi
[ -n "$DIETA" ] && echo "- **Dieta da criacao (3.4.11):** ${DIETA}"
# 3.4.23: controle da run em campos estruturados (o que antes ia solto no extra)
CTRL="modo=${MODO}"
[ -n "$REVIEW_MODO" ] && CTRL="$CTRL; review=${REVIEW_MODO}"
[ -n "$CODEX" ] && CTRL="$CTRL; codex=${CODEX}"
[ -n "$LIMITOU" ] && CTRL="$CTRL; limitou=${LIMITOU}"
[ -n "$STALLS" ] && CTRL="$CTRL; stalls=${STALLS}"
[ -n "$TASKS_EST" ] && CTRL="$CTRL; tasks>envelope=${TASKS_EST}"
[ -n "$SPAWN_MS" ] && CTRL="$CTRL; spawn=${SPAWN_MS}ms"
[ -n "$FRENTES" ] && CTRL="$CTRL; frentes=${FRENTES}"
[ -n "$PERGUNTAS" ] && CTRL="$CTRL; perguntas=${PERGUNTAS}"
[ -n "$WAITS_INV" ] && [ "${WAITS_INV:-0}" -gt 0 ] 2>/dev/null && CTRL="$CTRL; waits invalidas=${WAITS_INV}"
[ -n "$VIVOS_MAX" ] && CTRL="$CTRL; vivos_max=${VIVOS_MAX}"   # 3.5.3
[ -n "$ESFORCO" ] && CTRL="$CTRL; esforco=${ESFORCO}"         # 3.5.3: alvo/atual
echo "- **Controle (3.4.23):** ${CTRL}"
# 3.5.3: drift de esforco — a sessao rodou acima do alvo da fase (ex.: exec em high com alvo medium). E o
# primeiro suspeito quando tokens_thinking_pct_subagents passa de ~75% (PRD-142-b: 83%).
case "$ESFORCO" in
  medium/high|medium/xhigh|medium/max|high/xhigh|high/max|low/*)
    [ "${ESFORCO#*/}" != "n/d" ] && [ "${ESFORCO#*/}" != "${ESFORCO%/*}" ] && echo "- ⚠️ **Esforco acima do alvo da fase (3.5.3):** alvo \`${ESFORCO%/*}\`, sessao em \`${ESFORCO#*/}\` — todo subagente herdou; ${SUB_THINK_PCT:+raciocinio dos subagentes ~${SUB_THINK_PCT}%; }ajuste com \`/effort ${ESFORCO%/*}\` na proxima decolagem (Perfil → Nivel de esforco)." ;;
esac
# 3.5.3: run com tasks sem --vivos-max e/ou --limitou = leitura de paralelismo CEGA (regra 1.3 item 6 da
# /prd-exec: os dois sao obrigatorios em run com tasks). parallel_factor sozinho nao diz se o gargalo
# foi o teto, as dependencias ou tasks curtas demais.
# 3.5.5 (C9): so run de EXECUCAO tem executores — na fase 1/2 da criacao as "tasks" sao documentos redigidos pela pai.
PARAL_AVISO=0; case "$LABEL" in *-exec|*-exec-*|LOTE-*) PARAL_AVISO=1 ;; esac
if [ "$PARAL_AVISO" = 1 ] && [ -n "$TASKS" ] && [ "${TASKS:-0}" -gt 0 ] 2>/dev/null && { [ -z "$LIMITOU" ] || [ -z "$VIVOS_MAX" ]; }; then
  FALTA=""
  [ -z "$VIVOS_MAX" ] && FALTA="--vivos-max"
  [ -z "$LIMITOU" ] && FALTA="${FALTA:+$FALTA e }--limitou"
  echo "- ⚠️ **Paralelismo cego (3.5.3):** run com ${TASKS} tasks fechou sem ${FALTA} — nao da para saber o que limitou os executores. Regra 1.3 item 6 da /prd-exec: \`--vivos-max=N\` e \`--limitou=<dependencias|duelo|teto|tasks-curtas>\` sao obrigatorios em run com tasks."
fi
[ -n "$EXTRA" ] && echo "- ${EXTRA}"
echo "- **Historico:** prds/_metrics/harness-runs.jsonl (comparativo entre execucoes)"
# 3.4.30: fim da criacao (stop *-fase2) confere a LEITURA DE VALIDACAO (VALIDACAO.md, Passo 10.9 da /prd).
# Nunca bloqueia — grita. O aceite do Passo 11 e feito sobre esse arquivo.
case "$LABEL" in
  *-fase2)
    if [ -f "$SCRIPT_DIR/prd-validacao-check.sh" ]; then
      VL="$(bash "$SCRIPT_DIR/prd-validacao-check.sh" --label "$(printf '%s' "$LABEL" | sed -E 's/-fase2$//')" 2>/dev/null | tail -1)"
      case "$VL" in
        VALIDACAO*'|ok|'*) echo "- **Leitura de validacao (3.4.30):** $VL" ;;
        VALIDACAO*'|ausente|'*|VALIDACAO*'|falta|'*)
          echo "- **Leitura de validacao (3.4.30):** ⚠️ $VL"
          echo "  ESCREVA prds/PRD-NNN-*/VALIDACAO.md (TEMPLATE-VALIDACAO.md, Passo 10.9) ANTES de pedir o aceite — e a leitura de 5 min do humano; sem ela o que faltou/inventou so aparece na exec."
          echo "TELEMETRIA|validacao|$(printf '%s' "$VL" | cut -d'|' -f3)|$(printf '%s' "$LABEL" | sed -E 's/-fase2$//')" ;;
      esac
    fi ;;
esac
[ -n "$GIT_STAGED" ] && echo "- **Telemetria no git (3.4.22):** staged — ${GIT_STAGED} (entra no commit escopado do fechamento; nao commitado aqui)"
if [ -n "$LINHAS_TASK" ] && [ "$LINHAS_TASK" -gt "${HARNESS_TASK_MAX_LINHAS:-230}" ] 2>/dev/null; then
  echo ""
  echo "> ⚠️ **Tasks grandes** — media de ${LINHAS_TASK} linhas por task (teto ~180, 3.4.11). Medido 01/09:"
  echo "> tasks 2,6x maiores dobraram o custo de cada gate e das correcoes. Reduza as camadas ao que a"
  echo "> task exige (TEMPLATE-TASK 3b) antes da exec."
fi
if [ -n "$HERMES_TURNS" ] && [ "$HERMES_TURNS" -gt "${HARNESS_HERMES_MAX_TURNOS_RUN:-250}" ] 2>/dev/null; then
  echo ""
  echo "> ⚠️ **Hermes em Edit por ocorrencia** — ${HERMES_TURNS} turnos somados nesta fase (regua: <= 250)."
  echo "> Modo C deve gravar um Read + um Write por documento; ate 5 achados a pai aplica com script (10.2)."
fi

# aviso automatico de provavel espera humana (regra de leitura documentada no PLAYBOOK).
# 2.12.0: dispara SO com ociosidade REAL. Antes, gap de subagente em background contava
# como espera e o aviso saia em execucao saudavel — o que treina o leitor a ignora-lo,
# exatamente o oposto do que o PLAYBOOK quer.
SUSPEITA=0
[ -n "$WAIT_S" ] && [ "$WAIT_S" -gt 300 ] && SUSPEITA=1
# out_tps baixo so e sinal de espera quando os subagentes NAO explicam o silencio do
# transcript principal (eles produzem token fora dele). Com >= 30% da parede ocupada
# por subagente, out_tps baixo e regime de execucao, nao operador ausente.
if [ -n "$OUT_TPS" ] && [ "$ELAPSED" -gt 600 ]; then
  # 2.14.0: com tokens de subagente medidos, a regra roda sobre o throughput REAL.
  TPS_REGUA="${OUT_TPS_ALL:-$OUT_TPS}"
  EXPLICADO=0
  if [ -n "$SUB_SPAN_S" ] && [ "$ELAPSED" -gt 0 ]; then
    awk "BEGIN{exit !($SUB_SPAN_S >= 0.30*$ELAPSED)}" 2>/dev/null && EXPLICADO=1
  fi
  if [ "$EXPLICADO" -eq 0 ]; then
    awk "BEGIN{exit !($TPS_REGUA < 30)}" 2>/dev/null && SUSPEITA=1
  fi
fi
if [ "$SUSPEITA" -eq 1 ]; then
  echo ""
  echo "> ⚠️ **Provavel espera humana nesta execucao** (ociosidade medida e/ou out_tps baixo"
  echo "> sem subagente em voo). O wall-clock inclui prompt de permissao pendurado / pausa do"
  echo "> operador — NAO conclua nada sobre performance de modelo/preset."
  echo "> Roteiro: .claude/PLAYBOOK-TELEMETRIA.md"
fi
# aviso de execucao SERIAL (2.12.0): muitos subagentes com fator ~1 = ninguem rodou junto.
if [ -n "$PARALLEL" ] && [ -n "$SUB_N" ] && [ "${SUB_N:-0}" -ge 10 ] 2>/dev/null; then
  if awk "BEGIN{exit !($PARALLEL < 1.3)}" 2>/dev/null; then
    echo ""
    echo "> ⚠️ **Execucao SERIAL** — ${SUB_N} subagentes com fator de paralelismo ${PARALLEL}"
    echo "> (< 1.3): eles rodaram praticamente um de cada vez. Paralelismo e REGRA no harness"
    echo "> (Fase 1.3, 2.5 e 2.9.3 da /prd-exec) — vale post-mortem: quais grupos eram"
    echo "> disjuntos e foram enfileirados? Regua e roteiro: .claude/PLAYBOOK-TELEMETRIA.md"
  fi
fi
# 3.4.21: a execucao fechou — libera o slot de frente pesada desta maquina (semaforo frentes.mjs;
# o rotulo PRD-NNN-exec/LOTE-NNN e normalizado la). Sem node/arquivo: nada acontece (o slot
# expira sozinho em HARNESS_FRENTES_STALE_MIN).
if [ -f "$SCRIPT_DIR/frentes.mjs" ] && command -v "${HARNESS_RAG_NODE:-node}" >/dev/null 2>&1; then
  "${HARNESS_RAG_NODE:-node}" "$SCRIPT_DIR/frentes.mjs" release --label "$LABEL" >/dev/null 2>&1 || true
fi
# 3.5.5 (C6): locks tomados por ESTE checkout durante a run (lock DT-NNN/PRD-NNN do /dt-exec e /prd-exec no checkout
# principal) sao liberados no stop. Medido 14-15/09: o /dt-exec do DT-592 deixou o lock preso 25 h e o doctor avisou
# em 4 sessoes. Em worktree o `fechar` libera; aqui so o principal (sem worktree.env), e so lock criado apos o start.
if [ "$SEM_START" = "0" ] && [ ! -f "$CLAUDE_DIR/.harness-run/worktree.env" ]; then
  _LOCKS="$(git -C "$PROJECT_ROOT" rev-parse --git-common-dir 2>/dev/null)"
  case "$_LOCKS" in ''|/*|[A-Za-z]:*) : ;; *) _LOCKS="$PROJECT_ROOT/$_LOCKS" ;; esac
  _LOCKS="${_LOCKS:+$_LOCKS/harness-locks}"; _DONO="$(basename "$PROJECT_ROOT")"
  for _l in "${_LOCKS:-/nonexistent}"/*.lock; do
    [ -f "$_l" ] || continue
    grep -q "^$_DONO|" "$_l" 2>/dev/null || continue
    _lts="$(cut -d'|' -f2 "$_l" 2>/dev/null | head -n1)"; _le="$(date -d "$_lts" +%s 2>/dev/null || echo 0)"
    [ "$_le" -ge $(( START - 600 )) ] 2>/dev/null || continue
    rm -f "$_l" 2>/dev/null && echo "LOCK|livre|$(basename "$_l" .lock)|liberado no stop de $LABEL"
  done
fi
exit 0
