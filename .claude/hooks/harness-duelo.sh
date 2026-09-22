#!/usr/bin/env bash
# .claude/hooks/harness-duelo.sh (3.3.0)
# DUELO DE MODELOS: dois workers baratos (OpenRouter) implementam a MESMA task em paralelo
# a partir do mesmo task packet; um JUIZ escolhe o melhor (ou reprova os dois); a sessao
# aplica so o vencedor (hefesto: git apply + lint + spec local). Objetivo: VELOCIDADE em
# task mecanica sem abrir mao dos gates (sherlock/michelangelo seguem iguais depois).
#
# ATIVO POR PADRAO (HARNESS_DUELO='auto'): liga sozinho quando ha OPENROUTER_API_KEY na
# maquina; sem chave, devolve 'desligado' e a skill segue no fluxo nativo. Kill switch:
# HARNESS_DUELO='off' ou HARNESS_SKIP_DUELO=1.
#
# USO
#   bash .claude/hooks/harness-duelo.sh --task <TASK-NNN.md> --label PRD-123 \
#        [--models a,b] [--juiz themis|claude-cli|openrouter:<modelo>|nenhum] [--timeout 600]
#   bash .claude/hooks/harness-duelo.sh --veredito <id> --vencedor A|B|nenhum \
#        [--nota-a N --nota-b N --motivo "..."]          # a sessao/themis registra o julgamento
#   bash .claude/hooks/harness-duelo.sh --aplicado <id> --resultado ok|falhou [--motivo "..."]
#
# SAIDA (stdout, 1 linha):
#   DUELO|<status>|<id>|<vencedor>|<diff do vencedor>|<pasta do duelo>
#   status: ok (juiz externo decidiu) | julgar (juiz = themis/sessao: os 2 diffs estao na
#           pasta, a sessao dispara o agente themis e registra --veredito) | reprovado (juiz
#           reprovou os dois) | desligado | indisponivel | erro
#
# TELEMETRIA (versionada, prds/_metrics/harness-duelos.jsonl): uma linha por EVENTO
#   {"ev":"duelo"|"veredito"|"aplicado", "id", "label", "task", "modelo_a", "modelo_b",
#    "status_a","status_b","aplica_a","aplica_b","custo_a","custo_b","dur_a","dur_b",
#    "juiz","vencedor","nota_a","nota_b","motivo","resultado","ts",
#    "serial":"on|off","pulou_b":"0|1"}          (3.4.24: worker B nao pago quando A ja aplica)
#   {"ev":"pool","fora","entra","removido"}        (3.4.24: modelo REMOVIDO pela regua do placar)
#   E dela que o dashboard tira "vitorias / reprovacoes / custo POR MODELO" — a unica forma
#   de saber qual modelo merece continuar no duelo.
#
# 3.4.24 (itens 11a/11d): HARNESS_DUELO_SERIAL='on' (default) roda A, confere `git apply --check`
#   e SO paga B se A nao aplica (os dois inaplicaveis => 'nenhum' sem juiz); 'off' = paralelo.
#   HARNESS_DUELO_PLACAR_REMOVE='on' (default) REMOVE do pool o modelo que cruza a regua (nao
#   volta pelo rodizio de exploracao enquanto a regua valer na janela); 'off' = so rebaixa.
#
# REGRAS: workers sao READ-ONLY (devolvem unified diff em texto; nada e escrito no repo);
# cada diff passa por `git apply --check` antes de ir ao juiz; o broker (harness-delegate.sh)
# impoe o teto diario em USD e o teto por execucao. Nunca commita.

set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$ROOT" || exit 2
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_delegate-common.sh"   # 3.4.8: harness_ollama_resolver_modelo (ollama:auto)
# 3.4.2: chaves PESSOAIS por maquina, validas para todos os projetos (o Claude Desktop nao herda setx
# feito depois de aberto): ~/.harness.env.local (chmod 600). Nunca versionado. Precedencia: env > user > projeto.
# 3.5.6 (DT-010): a POOL e decisao do HARNESS e viaja com o base em hooks/_defaults.env (sourceado primeiro); harness.env,
# harness.env.local e ~/.harness.env.local continuam podendo sobrescrever — e `--pool` diz de onde veio (origem=...).
# 3.5.7: camadas pelo carregador unico (hooks/_env.sh); a ORIGEM da pool olha titulares E suplentes — a camada mais
# alta que define qualquer uma das duas (medido 16/09 na Mariana: pool dos defaults, suplentes do ~/.harness.env.local).
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_env.sh"
_POOL_ORIGEM="defaults"
for _pk in HARNESS_DUELO_MODELS HARNESS_DUELO_SUPLENTES; do
  case "$(harness_env_origem "$_pk")" in
    maquina) _POOL_ORIGEM=".harness.env.local" ;;
    local) [ "$_POOL_ORIGEM" = "defaults" ] || [ "$_POOL_ORIGEM" = "harness.env" ] && _POOL_ORIGEM="harness.env.local" ;;
    projeto) [ "$_POOL_ORIGEM" = "defaults" ] && _POOL_ORIGEM="harness.env" ;;
    ambiente) _POOL_ORIGEM="ambiente" ;;
  esac
done
log() { printf '[duelo] %s\n' "$*" >&2; }
jesc() { printf '%s' "${1:-}" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr -d '\n\r\t'; }
jnum() { case "${1:-}" in ''|*[!0-9.]*) printf 'null' ;; *) printf '%s' "$1" ;; esac; }
# 3.5.0: ESCRITA em duelos/<dev>@<host>.jsonl (por dev/maquina — o arquivo unico conflitava em todo merge entre devs);
# LEITURA do placar/contagem sobre TODOS (legado harness-duelos.jsonl + duelos/*.jsonl) — o placar e da equipe.
METRICS="$(harness_metrics_arquivo "$ROOT" duelos)"
METRICS_ALL="$(harness_metrics_todos "$ROOT" duelos harness-duelos.jsonl)"
mkdir -p "$ROOT/prds/_metrics" "$ROOT/.claude/.harness-run/duelos" 2>/dev/null
TS="$(date -Iseconds 2>/dev/null || date)"

TASK=""; LABEL=""; MODELS=""; JUIZ=""; TIMEOUT=""; VEREDITO_ID=""; VENCEDOR=""; NOTA_A=""; NOTA_B=""; MOTIVO=""; APLICADO_ID=""; RESULTADO=""
SUB_POOL=0; SUB_VALIDAR=0; SUB_PLACAR=0
while [ $# -gt 0 ]; do
  case "$1" in
    --pool) SUB_POOL=1; shift ;;        # 3.5.6 (DT-010): imprime a pool resolvida e a origem
    --validar) SUB_VALIDAR=1; shift ;;  # 3.5.6 (DT-010): confere a pool no catalogo publico do OpenRouter (cache 24 h)
    --placar) SUB_PLACAR=1; shift ;;    # 3.5.6 (DT-011): placar por USO real (usado/venceu/disputou, custo por usado)
    --task) TASK="${2:-}"; shift 2 ;;
    --label) LABEL="${2:-}"; shift 2 ;;
    --models) MODELS="${2:-}"; shift 2 ;;
    --juiz) JUIZ="${2:-}"; shift 2 ;;
    --timeout) TIMEOUT="${2:-}"; shift 2 ;;
    --veredito) VEREDITO_ID="${2:-}"; shift 2 ;;
    --vencedor) VENCEDOR="${2:-}"; shift 2 ;;
    --nota-a) NOTA_A="${2:-}"; shift 2 ;;
    --nota-b) NOTA_B="${2:-}"; shift 2 ;;
    --motivo) MOTIVO="${2:-}"; shift 2 ;;
    --aplicado) APLICADO_ID="${2:-}"; shift 2 ;;
    --resultado) RESULTADO="${2:-}"; shift 2 ;;
    -h|--help) sed -n '1,40p' "${BASH_SOURCE[0]}" >&2; exit 0 ;;
    *) log "argumento desconhecido: $1"; printf 'DUELO|erro|||\n'; exit 2 ;;
  esac
done

# ---------------------------------------------------------------- 3.5.6: --pool [--validar] e --placar (DT-010 / DT-011)
if [ "$SUB_POOL" = 1 ] || [ "$SUB_VALIDAR" = 1 ]; then
  P_TIT="${MODELS:-${HARNESS_DUELO_MODELS:-}}"; P_SUP="${HARNESS_DUELO_SUPLENTES:-}"
  P_ORI="$_POOL_ORIGEM"; [ -n "$MODELS" ] && P_ORI="flag"
  printf 'POOL|%s|%s|origem=%s|juiz=%s\n' "$P_TIT" "$P_SUP" "$P_ORI" "${HARNESS_DUELO_JUIZ_MODEL:-deepseek/deepseek-v4-pro}"
  if [ "$SUB_VALIDAR" = 1 ]; then
    # catalogo publico (sem chave): https://openrouter.ai/api/v1/models — cache HARNESS_OPENROUTER_MODELS_TTL_H (24 h)
    CACHE="${HARNESS_OPENROUTER_MODELS_CACHE:-${HOME:-${USERPROFILE:-}}/.harness-run/openrouter-models.json}"
    TTL_H="${HARNESS_OPENROUTER_MODELS_TTL_H:-24}"; case "$TTL_H" in ''|*[!0-9]*) TTL_H=24 ;; esac
    NODE_BIN="${HARNESS_RAG_NODE:-node}"
    if command -v "$NODE_BIN" >/dev/null 2>&1; then
      "$NODE_BIN" -e '
        const fs = require("fs"), path = require("path");
        const [cache, ttlH, url, tit, sup, juiz] = process.argv.slice(1);
        const slugs = [...new Set((tit + "," + sup + "," + juiz).split(",").map(s => s.trim()).filter(s => s && !/^ollama:/i.test(s)))];
        const fresco = () => { try { return Date.now() - fs.statSync(cache).mtimeMs < Number(ttlH) * 3600e3; } catch { return false; } };
        const ler = () => { try { return JSON.parse(fs.readFileSync(cache, "utf8")); } catch { return null; } };
        const avaliar = (cat, origem) => {
          const ids = new Set(((cat && cat.data) || []).map(m => m.id));
          if (!ids.size) { console.log("DUELO|pool|catalogo-vazio|" + origem); return; }
          let ruins = 0; for (const s of slugs) if (!ids.has(s)) { ruins++; console.log("DUELO|pool|modelo-inexistente|" + s); }
          console.log("DUELO|pool|" + (ruins ? "com-problemas" : "ok") + "|" + slugs.length + " modelo(s) conferido(s) no catalogo OpenRouter (" + origem + ", " + ids.size + " ids)");
        };
        if (fresco()) { avaliar(ler(), "cache"); }
        else {
          const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
          fetch(url, { signal: ctl.signal }).then(r => r.json()).then(j => { clearTimeout(t); try { fs.mkdirSync(path.dirname(cache), { recursive: true }); fs.writeFileSync(cache, JSON.stringify(j)); } catch {} avaliar(j, "rede"); })
            .catch(() => { clearTimeout(t); const c = ler(); if (c) avaliar(c, "cache-velho"); else console.log("DUELO|pool|sem-catalogo|rede fora e sem cache — nada conferido"); });
        }
      ' "$CACHE" "$TTL_H" "${HARNESS_OPENROUTER_URL:-https://openrouter.ai/api/v1}/models" "$P_TIT" "$P_SUP" "${HARNESS_DUELO_JUIZ_MODEL:-deepseek/deepseek-v4-pro}" 2>/dev/null
    else
      printf 'DUELO|pool|sem-node|validacao pulada\n'
    fi
  fi
  exit 0
fi
if [ "$SUB_PLACAR" = 1 ]; then
  # DT-011: o placar por VITORIA escondia que o haiku gastou US$ 2,19 para 0 diffs usados. Aqui: disputou / venceu / usado
  # (aplicado ok) / descartado (aplicado falhou) / desconhecido (venceu sem evento aplicado) / custo / custo por usado.
  if [ -s "$METRICS_ALL" ] && command -v "${HARNESS_RAG_NODE:-node}" >/dev/null 2>&1; then
    "${HARNESS_RAG_NODE:-node}" -e '
      const fs = require("fs"); const L = fs.readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const d = new Map(); for (const e of L) if (e.ev === "duelo") d.set(e.id, { ...e });
      for (const e of L) { const x = d.get(e.id); if (!x) continue; if (e.ev === "veredito") x.vencedor = e.vencedor, x.juiz_v = e.juiz; if (e.ev === "aplicado") x.aplicado = e.resultado; }
      const st = {}; const S = (m) => st[m] || (st[m] = { disputou: 0, venceu: 0, usado: 0, descartado: 0, desconhecido: 0, custo: 0 });
      let tot = 0, comV = 0, wo = 0, usados = 0;
      for (const x of d.values()) {
        tot++; if (x.vencedor === "A" || x.vencedor === "B") comV++; if ((x.juiz_v || x.juiz) === "auto" && (x.vencedor === "A" || x.vencedor === "B")) wo++;
        for (const lado of ["A", "B"]) { const l = lado.toLowerCase(); if (x["status_" + l] === "pulado") continue; const m = x["modelo_" + l]; if (!m) continue; const s = S(m); s.disputou++; s.custo += Number(x["custo_" + l]) || 0;
          if (x.vencedor === lado) { s.venceu++; if (x.aplicado === "ok") { s.usado++; usados++; } else if (x.aplicado === "falhou") s.descartado++; else s.desconhecido++; } }
      }
      console.log(`PLACAR|total|duelos=${tot}|com_vencedor=${comV}|wo_ou_serial=${wo}|usados=${usados}|aproveitamento=${tot ? Math.round(100 * usados / tot) : 0}%`);
      for (const [m, s] of Object.entries(st).sort((a, b) => b[1].usado - a[1].usado || b[1].venceu - a[1].venceu))
        console.log(`PLACAR|${m}|disputou=${s.disputou}|venceu=${s.venceu}|usado=${s.usado}|descartado=${s.descartado}|desconhecido=${s.desconhecido}|custo_usd=${s.custo.toFixed(2)}|custo_por_usado=${s.usado ? (s.custo / s.usado).toFixed(2) : "-"}`);
    ' "$METRICS_ALL" 2>/dev/null
  else
    printf 'PLACAR|total|duelos=0\n'
  fi
  exit 0
fi

# ---------------------------------------------------------------- eventos de fechamento
if [ -n "$VEREDITO_ID" ]; then
  case "$VENCEDOR" in A|B|nenhum) : ;; *) log "--vencedor deve ser A|B|nenhum"; printf 'DUELO|erro|%s||\n' "$VEREDITO_ID"; exit 2 ;; esac
  D="$ROOT/.claude/.harness-run/duelos/$VEREDITO_ID"
  harness_jsonl_append "$METRICS" "$(printf '{"ev":"veredito","id":"%s","ts":"%s","juiz":"%s","vencedor":"%s","nota_a":%s,"nota_b":%s,"motivo":"%s"}' \
    "$(jesc "$VEREDITO_ID")" "$(jesc "$TS")" "$(jesc "${JUIZ:-themis}")" "$VENCEDOR" "$(jnum "$NOTA_A")" "$(jnum "$NOTA_B")" "$(jesc "$MOTIVO")")"
  DIFF=""; [ "$VENCEDOR" = "A" ] && DIFF="$D/A.diff"; [ "$VENCEDOR" = "B" ] && DIFF="$D/B.diff"
  [ "$VENCEDOR" = "nenhum" ] && { printf 'DUELO|reprovado|%s|nenhum||%s\n' "$VEREDITO_ID" "$D"; exit 0; }
  printf 'DUELO|ok|%s|%s|%s|%s\n' "$VEREDITO_ID" "$VENCEDOR" "$DIFF" "$D"; exit 0
fi
if [ -n "$APLICADO_ID" ]; then
  harness_jsonl_append "$METRICS" "$(printf '{"ev":"aplicado","id":"%s","ts":"%s","resultado":"%s","motivo":"%s"}' \
    "$(jesc "$APLICADO_ID")" "$(jesc "$TS")" "$(jesc "$RESULTADO")" "$(jesc "$MOTIVO")")"
  printf 'DUELO|registrado|%s|||\n' "$APLICADO_ID"; exit 0
fi

# ---------------------------------------------------------------- liga/desliga
MODO="${HARNESS_DUELO:-auto}"
if [ "${HARNESS_SKIP_DUELO:-0}" = "1" ] || [ "$MODO" = "off" ]; then printf 'DUELO|desligado||||\n'; exit 0; fi
# 3.4.7: modelo com prefixo 'ollama:' roda na GPU LOCAL (gratis, sem chave). O duelo liga
# quando ha OPENROUTER_API_KEY *ou* pelo menos um worker ollama declarado no pool.
POOL_DECLARADO="${MODELS:-${HARNESS_DUELO_MODELS:-}}${HARNESS_DUELO_SUPLENTES:+,$HARNESS_DUELO_SUPLENTES}"
TEM_OLLAMA=0; case ",$POOL_DECLARADO," in *,ollama:*) TEM_OLLAMA=1 ;; esac
if [ -z "${OPENROUTER_API_KEY:-}" ] && [ "$TEM_OLLAMA" -eq 0 ]; then
  [ "$MODO" = "on" ] && log "HARNESS_DUELO=on mas OPENROUTER_API_KEY ausente (e nenhum worker ollama: no pool) — duelo indisponivel."
  printf 'DUELO|desligado||||\n'; exit 0
fi
# PREFLIGHT (3.4.6): os executores do pool RESPONDEM? Veredito cacheado (~30 min) no broker —
# a 1a chamada pinga (GET /auth/key ou /api/tags do ollama, zero token), as seguintes custam <1s.
# Reprovado o executor de TODO o pool => nem gera packet nem paga timeout de worker.
# 3.4.19: task que CRIA arquivo nao duela — o worker barato nao converte criacao em diff (PRD-135,
# TASK-003: vencedor aplicou com 3/4 endpoints chamando metodos inexistentes). Alvo citado
# inexistente no repo = arquivo novo → fluxo nativo direto, antes de gastar o preflight.
NOVO=''
if [ -n "$TASK" ] && [ -f "$TASK" ] && [ "${HARNESS_DUELO_ARQUIVO_NOVO:-0}" != "1" ]; then
  NOVO="$(grep -oE '(`|\b)[A-Za-z0-9_./-]+/[A-Za-z0-9_.-]+\.(php|js|mjs|ts|tsx|vue|py|sql|html|twig|css|scss)\b' "$TASK" \
    | tr -d '`' | grep -vE '^(https?:|prds/|\.claude/|node_modules/|e2e/|tests?/)' | sort -u \
    | while read -r p; do [ -f "$ROOT/$p" ] || printf '%s ' "$p"; done)"
fi
if [ -n "$NOVO" ]; then
  log "duelo desligado: a task cria arquivo ($NOVO) — fluxo nativo (HARNESS_DUELO_ARQUIVO_NOVO=1 forca)"
  printf 'DUELO|desligado|%s||arquivo-novo\n' "${LABEL:-DUELO}-$(basename "$TASK" .md)"; exit 0
fi
PF_OR=1; PF_OLL=1
if [ -n "${OPENROUTER_API_KEY:-}" ]; then
  bash "$SCRIPT_DIR/harness-delegate.sh" --preflight openrouter >/dev/null 2>&1 || PF_OR=0
else
  PF_OR=0
fi
if [ "$TEM_OLLAMA" -eq 1 ]; then
  bash "$SCRIPT_DIR/harness-delegate.sh" --preflight ollama >/dev/null 2>&1 || PF_OLL=0
else
  PF_OLL=0
fi
if [ "$PF_OR" -eq 0 ] && [ "$PF_OLL" -eq 0 ]; then
  log "preflight reprovado em todos os executores do pool — duelo indisponivel nesta janela (executor nativo escreve)."
  printf 'DUELO|indisponivel||||\n'; exit 0
fi
# Executor reprovado com o outro vivo: tira os modelos dele do pool desta rodada.
FILTRA_PREFIXO=""
[ "$PF_OR" -eq 0 ]  && FILTRA_PREFIXO="remoto"   # so sobrevive ollama:
[ "$PF_OLL" -eq 0 ] && FILTRA_PREFIXO="local"    # some ollama:
[ -n "$TASK" ] && [ -f "$TASK" ] || { log "--task obrigatorio (arquivo TASK-NNN.md)"; printf 'DUELO|erro|||\n'; exit 2; }
[ -n "$LABEL" ] || LABEL="$(basename "$(cd "$(dirname "$TASK")/.." && pwd)" | grep -oE 'PRD-[0-9]+(-[a-z])?\b' || echo DUELO)"   # 3.4.11: preserva sufixo de fatia (PRD-134-b)
TASK_ID="$(basename "$TASK" .md | grep -oE '^TASK-[0-9]+[a-z]?' || basename "$TASK" .md)"
ID="${LABEL}-${TASK_ID}-$(date +%H%M%S)"
D="$ROOT/.claude/.harness-run/duelos/$ID"; mkdir -p "$D"
TIMEOUT="${TIMEOUT:-${HARNESS_DUELO_TIMEOUT:-300}}"

# ---------------------------------------------------------------- escolha dos 2 modelos (rodizio)
# 3.5.6 (DT-010): sem literal aqui — a pool vem de hooks/_defaults.env (o ultimo recurso abaixo so vale em projeto que
# perdeu o arquivo; e o MESMO valor do defaults, com gemini-3.8 no lugar do 3.7 nunca medido).
POOL="${MODELS:-${HARNESS_DUELO_MODELS:-deepseek/deepseek-v4-flash-0731,google/gemini-3.8-flash}}"
# 3.4.7: executor reprovado no preflight tira os modelos DELE desta rodada (sem mexer no env).
filtra_pool() { # $1 = csv  $2 = remoto|local|'' -> csv filtrado ('' = intacto)
  [ -n "${2:-}" ] || { printf '%s' "$1"; return; }
  local out="" item OLDIFS="$IFS"; IFS=','
  for item in $1; do
    item="$(printf '%s' "$item" | tr -d ' ')"; [ -n "$item" ] || continue
    case "$2" in
      remoto) case "$item" in ollama:*) out="$out,$item" ;; esac ;;
      local)  case "$item" in ollama:*) : ;; *) out="$out,$item" ;; esac ;;
    esac
  done
  IFS="$OLDIFS"; printf '%s' "${out#,}"
}
if [ -n "${FILTRA_PREFIXO:-}" ]; then
  POOL="$(filtra_pool "$POOL" "$FILTRA_PREFIXO")"
  log "pool filtrado pelo preflight ($FILTRA_PREFIXO reprovado): ${POOL:-vazio}"
fi
K="$(grep -c '"ev":"duelo"' "$METRICS_ALL" 2>/dev/null || echo 0)"; K="${K:-0}"; case "$K" in ''|*[!0-9]*) K=0 ;; esac
EXPLORA=0; [ $(( K % 4 )) -eq 3 ] && EXPLORA=1   # a cada 4o duelo o rodizio explora (placar nao congela)

# ROTEAMENTO PELO PLACAR (3.4.0): quando ha historico suficiente NESTE projeto, os dois
# workers sao os de MELHOR placar (vitorias - reprovacoes - inaplicaveis, por duelo), e um
# modelo abaixo da regua (>= 5 duelos e < 20% de vitorias, ou > 40% inaplicavel) sai do pool.
# A cada 4o duelo volta o rodizio (exploracao) para o placar nao congelar. HARNESS_DUELO_ROTEAMENTO=rodizio desliga.
#
# REGUA COM JANELA E ERA (DT-001 do mestre, 01/09/2026): a regua avaliava o jsonl INTEIRO,
# misturando eras — os duelos de task de PRD de 26-27/08 (era abolida na 3.4.5: juiz reprovava
# tudo) cortaram os 3 titulares em 28/08 e DE NOVO em 01/09 (evento pool das 00:04). Agora:
#   1) so entram no placar duelos do MESMO tipo do duelo atual (task ^TASK- = PRD; resto = lote);
#   2) dentro do tipo, so os ultimos HARNESS_DUELO_PLACAR_JANELA duelos (default 30 — a mesma
#      janela da regua de revisao do themis). Desempenho antigo nao condena worker para sempre.
#
# SUPLENTES (3.4.6, melhoria #5): quando a regua corta titular e sobra MENOS de 2 escolhiveis,
# o placar PROMOVE reservas de HARNESS_DUELO_SUPLENTES (na ordem declarada) em vez de reabilitar
# o reprovado. Toda mudanca de escalacao (corte/promocao) vira evento {"ev":"pool"} no
# harness-duelos.jsonl — 1x por MUDANCA de estado, nunca por duelo — e 1 linha de log.
#
# REMOCAO PELO PLACAR (3.4.24, item 11d — HARNESS_DUELO_PLACAR_REMOVE='on' default): o modelo que
# cruza a regua e REMOVIDO do pool desta rodada — some tambem do rodizio de exploracao (cada 4o
# duelo), enquanto a regua valer na janela. Antes ele so era "rebaixado" e o rodizio o trazia de
# volta (medido 01-04/09: qwen3-coder-next 0/5 vitorias, 5/5 inaplicaveis, 1,74 M tokens de entrada
# por packet — e seguia duelando). Sobrou < 2 (mesmo com suplentes) => duelo indisponivel, nunca
# reabilitar o reprovado em silencio. Evento pool ganha "removido"; 'off' volta ao rebaixamento.
ESC1=""; P_REMOVIDO=""; P_FORA=""; P_ENTRA=""
PL_REMOVE="${HARNESS_DUELO_PLACAR_REMOVE:-on}"
if [ "${HARNESS_DUELO_ROTEAMENTO:-placar}" = "placar" ] && [ -s "$METRICS_ALL" ]; then
  ESC="$(node -e '
    const fs=require("fs"); const pool=process.argv[1].split(",").map(s=>s.trim()).filter(Boolean);
    const sup=(process.argv[3]||"").split(",").map(s=>s.trim()).filter(s=>s && !pool.includes(s));
    const remove=(process.argv[6]||"on")==="on";
    const L=fs.readFileSync(process.argv[2],"utf8").split("\n").filter(Boolean).map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean);
    const d=new Map(); for(const e of L){ if(e.ev==="duelo") d.set(e.id,{...e}); }
    for(const e of L){ const x=d.get(e.id); if(!x) continue; if(e.ev==="veredito") Object.assign(x,{vencedor:e.vencedor}); }
    // DT-001: mesma era do duelo atual + janela dos ultimos N (ordem do arquivo = cronologica)
    const eraPrd=/^TASK-/.test(process.argv[4]||"");
    const janela=parseInt(process.argv[5]||"30",10)||30;
    const rel=[...d.values()].filter(x=>/^TASK-/.test(x.task||"")===eraPrd).slice(-janela);
    const todos=[...pool,...sup];
    const st={}; for(const m of todos) st[m]={n:0,v:0,na:0,rep:0};
    // 3.4.24: lado "pulado" (serial: B nao pago) nao conta para o modelo — ele nem jogou
    for(const x of rel){ for(const lado of ["A","B"]){ const l=lado.toLowerCase(); if(x["status_"+l]==="pulado") continue; const m=x["modelo_"+l]; if(!st[m]) continue; st[m].n++; if(x.vencedor===lado) st[m].v++; if(x.vencedor==="nenhum") st[m].rep++; if(x["aplica_"+l]==="nao") st[m].na++; } }
    const regua=m=>{const s=st[m]; return s.n>=5 && (s.v/s.n<0.2 || s.na/s.n>0.4);};
    const fora=pool.filter(regua);
    let ok=pool.filter(m=>!regua(m));
    const entra=[];
    for(const m of sup){ if(ok.length>=2) break; if(regua(m)) continue; ok.push(m); entra.push(m); }
    // remove=on: NUNCA volta ao pool cru (o reprovado fica fora); remove=off: comportamento 3.4.0
    const base=(ok.length>=2||remove)?ok:pool;
    const cand=base.map(m=>{const s=st[m]; const score=s.n? (s.v - 0.5*s.rep - s.na)/s.n : 0.5; return [m,score,s.n];}).sort((a,b)=>b[1]-a[1]);
    if(cand.length>=2) process.stdout.write(cand[0][0]+","+cand[1][0]+"|"+cand.map(c=>c[0]+":"+c[1].toFixed(2)+"/"+c[2]).join(" "));
    process.stdout.write("\nPOOL|"+fora.join(",")+"|"+entra.join(","));
  ' "$POOL" "$METRICS_ALL" "$(filtra_pool "${HARNESS_DUELO_SUPLENTES:-}" "${FILTRA_PREFIXO:-}")" "$TASK_ID" "${HARNESS_DUELO_PLACAR_JANELA:-30}" "$PL_REMOVE" 2>/dev/null)"
  ESC1="$(printf '%s\n' "$ESC" | head -1)"
  ESCPOOL="$(printf '%s\n' "$ESC" | sed -n '2p')"
  if [ -n "$ESCPOOL" ]; then
    P_FORA="$(printf '%s' "$ESCPOOL" | cut -d'|' -f2)"
    P_ENTRA="$(printf '%s' "$ESCPOOL" | cut -d'|' -f3)"
  fi
  if [ "$PL_REMOVE" = "on" ] && [ -n "$P_FORA" ]; then
    # tira os reprovados do pool desta rodada (rodizio incluso) e acrescenta os suplentes promovidos
    P_REMOVIDO="$P_FORA"
    NOVO_POOL=""; OLDIFS_P="$IFS"; IFS=','
    for item in $POOL; do IFS="$OLDIFS_P"
      item="$(printf '%s' "$item" | tr -d ' ')"; [ -n "$item" ] || { IFS=','; continue; }
      case ",$P_FORA," in *",$item,"*) : ;; *) NOVO_POOL="$NOVO_POOL,$item" ;; esac
    IFS=','; done
    for item in $P_ENTRA; do IFS="$OLDIFS_P"
      item="$(printf '%s' "$item" | tr -d ' ')"; [ -n "$item" ] && NOVO_POOL="$NOVO_POOL,$item"
    IFS=','; done; IFS="$OLDIFS_P"
    POOL="${NOVO_POOL#,}"
    log "REMOVIDO pelo placar (HARNESS_DUELO_PLACAR_REMOVE=on): $P_FORA — pool desta rodada: ${POOL:-vazio}"
  fi
  if [ -n "$P_FORA$P_ENTRA" ]; then
    P_ULT="$(grep '"ev":"pool"' "$METRICS" 2>/dev/null | tail -1 | grep -o '"fora":"[^"]*","entra":"[^"]*","removido":"[^"]*"')"
    P_NOVO="\"fora\":\"$(jesc "$P_FORA")\",\"entra\":\"$(jesc "$P_ENTRA")\",\"removido\":\"$(jesc "$P_REMOVIDO")\""
    if [ "$P_ULT" != "$P_NOVO" ]; then
      harness_jsonl_append "$METRICS" "$(printf '{"ev":"pool","ts":"%s","label":"%s",%s,"motivo":"regua do placar (>=5 duelos e <20%% vitorias, ou >40%% inaplicavel)%s"}' \
        "$(jesc "$TS")" "$(jesc "$LABEL")" "$P_NOVO" "$([ -n "$P_REMOVIDO" ] && printf ' — removido do pool (3.4.24)')")"
      log "ESCALACAO MUDOU — fora do pool: ${P_FORA:-nenhum} · promovido(s): ${P_ENTRA:-nenhum} · removido(s): ${P_REMOVIDO:-nenhum} (registrado no placar)."
    fi
  fi
fi

IFS=',' read -r -a ARR <<< "$POOL"
N=${#ARR[@]}
if [ "$N" -lt 2 ]; then log "pool com < 2 modelos utilizaveis (HARNESS_DUELO_MODELS/preflight/regua do placar) — duelo indisponivel."; printf 'DUELO|indisponivel|%s||%s\n' "$ID" ""; exit 0; fi
# rodizio justo: o par avanca a cada duelo ja registrado (todo modelo enfrenta todo modelo)
IA=$(( K % N )); IB=$(( (K + 1 + (K / N) % (N - 1)) % N )); [ "$IB" -eq "$IA" ] && IB=$(( (IA + 1) % N ))
MA="${ARR[$IA]}"; MB="${ARR[$IB]}"
MA="$(printf '%s' "$MA" | tr -d ' ')"; MB="$(printf '%s' "$MB" | tr -d ' ')"
if [ "$EXPLORA" -eq 0 ] && [ -n "$ESC1" ]; then
  MA="${ESC1%%,*}"; R="${ESC1#*,}"; MB="${R%%|*}"; log "roteamento pelo placar: ${ESC1#*|}"
  # 3.4.27: EXPLORACAO ACELERADA de modelo novo. No duelo SERIAL o B so e medido quando o A falha —
  # um titular recem-chegado (gemini-3.8 em 09/09) ficaria sem historico por muito tempo. Enquanto um
  # titular tiver < HARNESS_DUELO_NOVATO_MIN (5) duelos medidos na janela, ele vai de A a cada 2 duelos.
  if [ "${HARNESS_DUELO_NOVATO:-on}" = "on" ] && [ $(( K % 2 )) -eq 1 ]; then
    NOV=""; NOV_MIN="${HARNESS_DUELO_NOVATO_MIN:-5}"; case "$NOV_MIN" in ''|*[!0-9]*) NOV_MIN=5 ;; esac
    for tok in ${ESC1#*|}; do
      n_tok="${tok##*/}"; case "$n_tok" in ''|*[!0-9]*) continue ;; esac
      if [ "$n_tok" -lt "$NOV_MIN" ]; then NOV="$(printf '%s' "$tok" | sed -E 's/:[-0-9.]+\/[0-9]+$//')"; break; fi
    done
    if [ -n "$NOV" ] && [ "$NOV" != "$MA" ]; then
      [ "$NOV" = "$MB" ] && MB="$MA"; MA="$NOV"
      log "exploracao acelerada (3.4.27): $NOV tem < $NOV_MIN duelos medidos — vai de A neste duelo (HARNESS_DUELO_NOVATO=off desliga)."
    fi
  fi
fi

# 3.4.8: 'ollama:auto' vira o modelo REAL aqui — telemetria e placar distinguem 30b de 14b.
case "$MA" in ollama:auto) MA="ollama:$(harness_ollama_resolver_modelo auto)"; log "worker A (ollama:auto) -> $MA" ;; esac
case "$MB" in ollama:auto) MB="ollama:$(harness_ollama_resolver_modelo auto)"; log "worker B (ollama:auto) -> $MB" ;; esac

# ---------------------------------------------------------------- task packet
# dieta (25/08): o packet default (--max-kb 300) e para o hefesto; worker de duelo com 300KB
# so estoura o teto de entrada (medido PRD-129: TASK-003..014 todas puladas). O duelo gera o
# SEU packet enxuto.
# 3.4.28: --worker — os alvos vao INTEIROS nos Anexos (abaixo); no packet fica so o indice/esqueleto.
PK="$(bash "$SCRIPT_DIR/task-packet.sh" "$TASK" --out "$D/packet.md" --max-kb "${HARNESS_DUELO_PACKET_KB:-100}" --worker)"
PACKET="$(printf '%s' "$PK" | cut -d'|' -f2)"; ATTACH="$(printf '%s' "$PK" | cut -d'|' -f3)"
[ -s "$PACKET" ] || { log "packet vazio"; printf 'DUELO|erro|%s|||\n' "$ID"; exit 2; }

{
  printf '# Duelo de implementacao — %s / %s\n\n' "$LABEL" "$TASK_ID"
  printf 'Voce e um dos DOIS workers deste duelo. Outro modelo recebe exatamente este pacote; um juiz\n'
  printf 'escolhe a melhor implementacao. Voce NAO tem ferramentas: o packet abaixo (contrato, resumo do\n'
  printf 'Perfil, componentes e indice dos arquivos-alvo) e os ANEXOS no fim (arquivos-alvo na integra,\n'
  printf 'de onde voce COPIA o trecho do BUSCAR) sao tudo o que voce ve.\n\n'
  printf '## Formato OBRIGATORIO da resposta (25/08 — NAO escreva unified diff)\n\n'
  printf 'Para CADA arquivo alterado, um ou mais blocos EXATAMENTE neste formato (sem cercas de codigo):\n\n'
  printf '### ARQUIVO: caminho/relativo/ao/repo.ext\n'
  printf '<<<<<<< BUSCAR\n'
  printf '<trecho EXATO e UNICO do arquivo atual — copie do packet com a indentacao original;\n'
  printf 'inclua 3+ linhas de contexto para o trecho ser unico no arquivo>\n'
  printf '=======\n'
  printf '<trecho substituto completo>\n'
  printf '>>>>>>> FIM\n\n'
  printf 'Varios blocos por arquivo sao permitidos (aplicados de cima para baixo). ARQUIVO NOVO:\n\n'
  printf '### ARQUIVO-NOVO: caminho/novo.ext\n'
  printf '<conteudo integral do arquivo>\n'
  printf '### FIM-ARQUIVO\n\n'
  printf 'REGRAS: o BUSCAR precisa casar CARACTERE A CARACTERE com o arquivo atual (por isso copie,\n'
  printf 'nunca redigite); se o trecho aparecer 2x no arquivo, inclua mais contexto ate ficar unico.\n'
  printf 'Nao toque arquivo que nao esta no packet. Depois dos blocos: `## Notas` (ate 5 linhas:\n'
  printf 'decisoes, o que NAO fez e por que, o que o revisor deve testar) e `## Nao verificado`\n'
  printf '(o que voce precisaria ler e nao tinha).\n\n'
  printf 'Regras do Perfil valem integralmente (datas de negocio, idempotencia, compat de producao,\n'
  printf 'armadilhas). Portugues do Brasil nos comentarios. Nada de refactor fora do contrato.\n\n'
  printf -- '---\n\n'; cat "$PACKET"
} > "$D/prompt-worker.md"

# ---------------------------------------------------------------- teto de ENTRADA (25/08)
# PRD-128: workers receberam 506KB (prompt+anexos) — com meio mega de contexto o modelo barato
# erra o alvo e o duelo queima custo num resultado natimorto. Acima do teto, pula o duelo
# (executor nativo escreve; a pasta existe, o guard-agent libera).
IN_KB=$(( $(wc -c < "$D/prompt-worker.md" 2>/dev/null || echo 0) / 1024 ))
OLDIFS_ATT="$IFS"; IFS=','; for att in $ATTACH; do IFS="$OLDIFS_ATT"
  [ -f "$att" ] && IN_KB=$(( IN_KB + $(wc -c < "$att") / 1024 ))
IFS=','; done; IFS="$OLDIFS_ATT"
MAX_IN_KB="${HARNESS_DUELO_MAX_INPUT_KB:-150}"; case "$MAX_IN_KB" in ''|*[!0-9]*) MAX_IN_KB=150 ;; esac
if [ "$MAX_IN_KB" -gt 0 ] && [ "$IN_KB" -gt "$MAX_IN_KB" ]; then
  # 2a chance (25/08): com tools=on os ANEXOS sao redundantes — o worker le os alvos com
  # read_file. Descarta os anexos e refaz a conta antes de desistir.
  if [ "${HARNESS_DUELO_TOOLS:-on}" = "on" ] && [ -n "$ATTACH" ]; then
    log "entrada ${IN_KB}KB > teto ${MAX_IN_KB}KB — descartando anexos (tools=on: o worker le os alvos com read_file)."
    ATTACH=""
    IN_KB=$(( $(wc -c < "$D/prompt-worker.md" 2>/dev/null || echo 0) / 1024 ))
  fi
  if [ "$IN_KB" -gt "$MAX_IN_KB" ]; then
    log "entrada ${IN_KB}KB > teto ${MAX_IN_KB}KB (HARNESS_DUELO_MAX_INPUT_KB) — duelo pulado, executor nativo escreve."
    printf 'DUELO|indisponivel|%s||%s\n' "$ID" "$D"; exit 0
  fi
fi

# ---------------------------------------------------------------- capacidade do worker LOCAL (DT-006)
# Agora que a ENTRADA REAL e conhecida, re-decide cada worker ollama pelo tamanho: 30b so para
# pacote pequeno (prefill de 42k tokens nao coube no timeout em 01/09), 14b ate o teto local;
# acima disso o local sai e um SUPLENTE REMOTO entra no lugar (sem suplente, o lado local vira
# o mesmo fluxo de duelo indisponivel de sempre).
TOK_EST=$(( IN_KB * 1024 / 2 ))   # estimador canonico bytes/2 (DT-006 — bytes/3 subestimava)
ajusta_worker_local() { # $1 = modelo atual do lado  $2 = modelo do OUTRO lado -> ecoa o modelo final ('' = sem opcao)
  case "$1" in ollama:*) : ;; *) printf '%s' "$1"; return 0 ;; esac
  local r
  if r="$(harness_ollama_resolver_modelo "${1#ollama:}" "$TOK_EST")"; then
    printf 'ollama:%s' "$r"; return 0
  fi
  # local inviavel para esta entrada: promove o 1o suplente REMOTO que nao e o outro worker
  local s OLDIFS_S="$IFS"; IFS=','
  for s in ${HARNESS_DUELO_SUPLENTES:-}; do IFS="$OLDIFS_S"
    s="$(printf '%s' "$s" | tr -d ' ')"
    case "$s" in ''|ollama:*) IFS=','; continue ;; esac
    [ "$s" = "$2" ] && { IFS=','; continue; }
    printf '%s' "$s"; return 0
  IFS=','; done; IFS="$OLDIFS_S"
  printf ''; return 0
}
MA_ANTES="$MA"; MA="$(ajusta_worker_local "$MA" "$MB")"
[ "$MA" != "$MA_ANTES" ] && log "worker A ajustado pela capacidade (~${TOK_EST} tokens): $MA_ANTES -> ${MA:-nenhum} (DT-006)"
MB_ANTES="$MB"; MB="$(ajusta_worker_local "$MB" "$MA")"
[ "$MB" != "$MB_ANTES" ] && log "worker B ajustado pela capacidade (~${TOK_EST} tokens): $MB_ANTES -> ${MB:-nenhum} (DT-006)"
if [ -z "$MA" ] || [ -z "$MB" ]; then
  log "entrada ~${TOK_EST} tokens acima da capacidade local e sem suplente remoto livre — duelo pulado, executor nativo escreve."
  printf 'DUELO|indisponivel|%s||%s\n' "$ID" "$D"; exit 0
fi

# ---------------------------------------------------------------- 2 workers em paralelo
run_worker() { # $1 = letra  $2 = modelo (prefixo 'ollama:' roteia para a GPU local — 3.4.7)
  local EXW="openrouter" MW="$2"
  case "$2" in ollama:*) EXW="ollama"; MW="${2#ollama:}" ;; esac
  [ "$MW" = "auto" ] && MW=""   # 3.4.8: 'ollama:auto' — o broker resolve pela memoria (ja resolvido p/ telemetria acima)
  export HARNESS_OPENROUTER_MAX_OUTPUT_TOKENS="${HARNESS_DUELO_MAX_OUTPUT_TOKENS:-8000}"   # diff + notas cabem; reasoning low nao come tudo
  bash "$SCRIPT_DIR/harness-delegate.sh" --executor "$EXW" --model "$MW" --role duelo-worker \
    --task "${TASK_ID}-$1" --label "$LABEL" --prompt-file "$D/prompt-worker.md" \
    --attach "$ATTACH" --max-words 4000 --timeout "$TIMEOUT" --output "$D/$1.md" --tag "duelo:$ID" \
    --reasoning "${HARNESS_DUELO_REASONING:-low}" $([ "${HARNESS_DUELO_TOOLS:-on}" = "on" ] && echo --tools) \
    > "$D/$1.status" 2> "$D/$1.log"
}
extract_diff() { # $1 = relatorio.md  $2 = saida.diff  (fallback: worker que ainda emitiu diff)
  awk '/^```diff/{on=1; next} on && /^```/{on=0; exit} on{print}' "$1" > "$2" 2>/dev/null
  [ -s "$2" ] || awk '/^(diff --git|--- a\/|--- \/dev\/null)/{on=1} on{print}' "$1" > "$2" 2>/dev/null
}
# 25/08: contrato novo — blocos BUSCAR/SUBSTITUIR aplicados numa arvore temporaria pelo
# duelo-aplicar.mjs; o unified diff REAL (offsets perfeitos) e gerado aqui com `diff -u`.
# O resto da cadeia (git apply --check, juiz, hefesto) continua vendo um diff normal.
converter_para_diff() { # $1 = relatorio.md  $2 = saida.diff  $3 = letra
  local TREE="$D/tree-$3" rel flag orig
  rm -rf "$TREE" 2>/dev/null; mkdir -p "$TREE"; : > "$2"
  "${HARNESS_RAG_NODE:-node}" "$SCRIPT_DIR/duelo-aplicar.mjs" "$1" "$ROOT" "$TREE" 2> "$D/$3.conv.log"
  local RC=$?
  if [ "$RC" = 3 ]; then extract_diff "$1" "$2"; return 0; fi     # sem blocos — tenta diff classico
  if [ "$RC" != 0 ]; then log "worker $3: bloco nao aplicou — $(head -1 "$D/$3.conv.log" 2>/dev/null)"; return 1; fi
  [ -s "$TREE/.tocados" ] || return 1
  while IFS="$(printf '\t')" read -r rel flag; do
    [ -n "$rel" ] || continue
    if [ "$flag" = "N" ]; then
      diff -u --label /dev/null --label "b/$rel" /dev/null "$TREE/$rel" >> "$2"
    else
      diff -u --label "a/$rel" --label "b/$rel" "$ROOT/$rel" "$TREE/$rel" >> "$2"
    fi
    [ $? -le 1 ] || { log "worker $3: diff falhou para $rel"; return 1; }
  done < "$TREE/.tocados"
  return 0
}
# 25/08: nosso diff gerado tem contagens EXATAS — o check e puro. --recount (a muleta para
# diff de LLM) QUEBRA diff correto (medido: mesmo arquivo, sem flags aplica, com --recount
# falha) e fica so como fallback para o caminho legado do extract_diff.
# `git apply --check` nao escreve nada e os workers sao read-only: a conferencia e ISOLADA por
# construcao (sem worktree temporario — o mais barato que funciona no Windows).
checa_diff() { git apply --check "$1" >/dev/null 2>&1 || git apply --check --recount --ignore-whitespace "$1" >/dev/null 2>&1; }
status_de() { cut -d'|' -f2 "$D/$1.status" 2>/dev/null; }
# ---------------------------------------------------------------- workers: SERIAL (3.4.24) ou paralelo
# Item 11a — HARNESS_DUELO_SERIAL='on' (default): roda A, confere se o diff A APLICA antes de pagar
# B. A aplicavel => B nao e pago (pulou_b=1) e A vence por W.O. (o hefesto aplica; lint, spec e os
# gates seguem iguais). A inaplicavel => paga B. Os dois inaplicaveis => 'nenhum' sem juiz.
# Medido 01-04/09: 24 duelos, 4 aplicados, 5 W.O., 3 nenhum; PRD-138 TASK-001 US$ 0,17 e 3 min por
# ZERO diffs aplicaveis. 'off' = os dois em paralelo + juiz (o duelo original da 3.3.0).
SERIAL="${HARNESS_DUELO_SERIAL:-on}"; case "$SERIAL" in on|off) : ;; *) SERIAL="on" ;; esac
PULOU_B=0; APL_A="nao"; APL_B="nao"
T0=$(date +%s)
if [ "$SERIAL" = "on" ]; then
  run_worker A "$MA"; SA="$(status_de A)"; : "${SA:=erro}"
  converter_para_diff "$D/A.md" "$D/A.diff" A
  [ -s "$D/A.diff" ] && checa_diff "$D/A.diff" && APL_A="sim"
  # 3.5.6 (DT-010 item 4 — ESCOPO B, flags DESLIGADAS por default = comportamento 3.4.24): no serial o B so e medido quando
  # o A falha, entao um titular novato nunca ganha historico. HARNESS_DUELO_SERIAL_NOVATO_MIN=N paga o B enquanto ele tiver
  # < N duelos jogados (nao pulados); HARNESS_DUELO_SERIAL_AMOSTRA=K paga o B a cada K duelos. 0 = nunca (default).
  PAGA_B=0
  SN_MIN="${HARNESS_DUELO_SERIAL_NOVATO_MIN:-0}"; case "$SN_MIN" in ''|*[!0-9]*) SN_MIN=0 ;; esac
  SN_AMO="${HARNESS_DUELO_SERIAL_AMOSTRA:-0}"; case "$SN_AMO" in ''|*[!0-9]*) SN_AMO=0 ;; esac
  if [ "$SN_AMO" -gt 0 ] && [ $(( K % SN_AMO )) -eq 0 ]; then PAGA_B=1; log "serial: amostragem (1 a cada $SN_AMO duelos) — B roda mesmo se A aplicar (HARNESS_DUELO_SERIAL_AMOSTRA)."; fi
  if [ "$SN_MIN" -gt 0 ] && [ "$PAGA_B" = 0 ]; then
    NB="$(grep '"ev":"duelo"' "$METRICS_ALL" 2>/dev/null | grep -F "\"$MB\"" | grep -vE "\"modelo_b\":\"$(printf '%s' "$MB" | sed 's#[.[*^$/]#\\&#g')\",\"status_a\":\"[^\"]*\",\"status_b\":\"pulado\"" | wc -l | tr -d ' ')"
    [ "${NB:-0}" -lt "$SN_MIN" ] && { PAGA_B=1; log "serial: $MB e NOVATO ($NB < $SN_MIN duelos jogados) — B roda mesmo se A aplicar (HARNESS_DUELO_SERIAL_NOVATO_MIN)."; }
  fi
  if [ "$APL_A" = "sim" ] && [ "$PAGA_B" = 0 ]; then
    PULOU_B=1; SB="pulado"; : > "$D/B.diff"; : > "$D/B.md"
    log "serial: diff A aplica — worker B ($MB) NAO pago (pulou_b=1; HARNESS_DUELO_SERIAL=off restaura o paralelo)."
  else
    [ "$APL_A" = "sim" ] || log "serial: diff A inaplicavel ($SA) — pagando o worker B ($MB)."
    run_worker B "$MB"; SB="$(status_de B)"; : "${SB:=erro}"
    converter_para_diff "$D/B.md" "$D/B.diff" B
    [ -s "$D/B.diff" ] && checa_diff "$D/B.diff" && APL_B="sim"
  fi
else
  run_worker A "$MA" & PA=$!
  run_worker B "$MB" & PB=$!
  wait $PA; wait $PB
  SA="$(status_de A)"; SB="$(status_de B)"; : "${SA:=erro}"; : "${SB:=erro}"
  converter_para_diff "$D/A.md" "$D/A.diff" A; converter_para_diff "$D/B.md" "$D/B.diff" B
  [ -s "$D/A.diff" ] && checa_diff "$D/A.diff" && APL_A="sim"
  [ -s "$D/B.diff" ] && checa_diff "$D/B.diff" && APL_B="sim"
fi

custo_de() { grep -F "\"task\":\"${TASK_ID}-$1\"" "$ROOT/.claude/.harness-run/delegations/$LABEL/manifest.jsonl" 2>/dev/null | tail -1 | grep -o '"cost_usd":"[0-9.]*"' | cut -d'"' -f4; }
dur_de()   { grep -F "\"task\":\"${TASK_ID}-$1\"" "$ROOT/.claude/.harness-run/delegations/$LABEL/manifest.jsonl" 2>/dev/null | tail -1 | grep -o '"duration_s":[0-9]*' | cut -d: -f2; }
CA="$(custo_de A)"; CB="$(custo_de B)"; DA="$(dur_de A)"; DB="$(dur_de B)"

JUIZ="${JUIZ:-${HARNESS_DUELO_JUIZ:-themis}}"
harness_jsonl_append "$METRICS" "$(printf '{"ev":"duelo","id":"%s","ts":"%s","label":"%s","task":"%s","modelo_a":"%s","modelo_b":"%s","status_a":"%s","status_b":"%s","aplica_a":"%s","aplica_b":"%s","custo_a":%s,"custo_b":%s,"dur_a":%s,"dur_b":%s,"juiz":"%s","packet_bytes":%s,"serial":"%s","pulou_b":"%s"}' \
  "$(jesc "$ID")" "$(jesc "$TS")" "$(jesc "$LABEL")" "$(jesc "$TASK_ID")" "$(jesc "$MA")" "$(jesc "$MB")" "$SA" "$SB" "$APL_A" "$APL_B" \
  "$(jnum "$CA")" "$(jnum "$CB")" "$(jnum "$DA")" "$(jnum "$DB")" "$(jesc "$JUIZ")" "$(jnum "$(wc -c < "$PACKET" | tr -d ' ')")" "$SERIAL" "$PULOU_B")"
log "A=$MA ($SA, aplica=$APL_A, US\$${CA:-?}) · B=$MB ($SB, aplica=$APL_B, US\$${CB:-?}) · serial=$SERIAL · $(( $(date +%s) - T0 ))s"

# nenhum diff aplicavel => nem chama juiz
if [ "$APL_A" = "nao" ] && [ "$APL_B" = "nao" ]; then
  harness_jsonl_append "$METRICS" "$(printf '{"ev":"veredito","id":"%s","ts":"%s","juiz":"auto","vencedor":"nenhum","nota_a":0,"nota_b":0,"motivo":"nenhum diff aplicavel (git apply --check falhou nos dois)"}' "$(jesc "$ID")" "$(jesc "$TS")")"
  printf 'DUELO|reprovado|%s|nenhum||%s\n' "$ID" "$D"; exit 0
fi
# so um aplicavel => vence por W.O. (registrado como tal; o juiz ainda pode reprovar na sessao)
# 3.4.24: no serial, A aplicavel = B nao pago — o motivo diz isso (o dashboard separa W.O. de serial).
if [ "$APL_A" != "$APL_B" ]; then
  W="A"; [ "$APL_B" = "sim" ] && W="B"
  WO_MOT="W.O.: so o diff $W passou no git apply --check"
  [ "$PULOU_B" = "1" ] && WO_MOT="serial: diff A aplica — B nao pago (pulou_b)"
  harness_jsonl_append "$METRICS" "$(printf '{"ev":"veredito","id":"%s","ts":"%s","juiz":"auto","vencedor":"%s","nota_a":null,"nota_b":null,"motivo":"%s"}' "$(jesc "$ID")" "$(jesc "$TS")" "$W" "$(jesc "$WO_MOT")")"
  printf 'DUELO|ok|%s|%s|%s/%s.diff|%s\n' "$ID" "$W" "$D" "$W" "$D"; exit 0
fi

# ---------------------------------------------------------------- juiz
{
  printf '# Julgamento de duelo — %s / %s\n\n' "$LABEL" "$TASK_ID"
  printf 'Dois diffs implementam a MESMA task a partir do MESMO packet. Julgue com a rubrica abaixo e\n'
  printf 'devolva APENAS um JSON (sem prosa fora dele):\n\n'
  printf '{"vencedor":"A"|"B"|"nenhum","nota_a":0-10,"nota_b":0-10,"motivo":"<=40 palavras",\n'
  printf ' "defeitos_a":["..."],"defeitos_b":["..."],"testar":["..."]}\n\n'
  printf '## Rubrica (peso)\n1. Corretude contra o contrato da task (40)\n2. Aderencia ao Perfil: armadilhas, datas de negocio, idempotencia, compat de producao (25)\n'
  printf '3. Escopo: so o que a task pede, sem refactor colateral, sem arquivo fora do packet (15)\n4. Testabilidade / spec local incluida quando a task pede (10)\n5. Legibilidade e convencoes do repo (10)\n\n'
  printf '"nenhum" quando os DOIS tem defeito bloqueante (bug logico, quebra contrato, risco de producao).\n'
  printf 'Voce NAO sabe qual modelo escreveu cada um; nao tente adivinhar. Diff mais longo nao e melhor.\n\n'
  printf -- '---\n\n## Packet\n\n'; cat "$PACKET"
  printf '\n\n---\n\n## Diff A\n\n```diff\n'; cat "$D/A.diff"; printf '\n```\n\n## Notas de A\n\n'; sed -n '/^## Notas/,$p' "$D/A.md" | head -40
  printf '\n\n---\n\n## Diff B\n\n```diff\n'; cat "$D/B.diff"; printf '\n```\n\n## Notas de B\n\n'; sed -n '/^## Notas/,$p' "$D/B.md" | head -40
} > "$D/prompt-juiz.md"

case "$JUIZ" in
  themis|sessao)
    # A sessao dispara o agente themis (Sonnet, dentro da assinatura) sobre $D/prompt-juiz.md
    # e registra o resultado com --veredito. Nada de API aqui.
    printf 'DUELO|julgar|%s|themis|%s/prompt-juiz.md|%s\n' "$ID" "$D" "$D"; exit 0 ;;
  claude-cli|claude-cli:*)
    JM="${JUIZ#claude-cli}"; JM="${JM#:}"; JM="${JM:-haiku}"
    bash "$SCRIPT_DIR/harness-delegate.sh" --executor claude-cli --model "$JM" --role themis --task "${TASK_ID}-juiz" \
      --label "$LABEL" --prompt-file "$D/prompt-juiz.md" --max-words 400 --timeout "$TIMEOUT" --output "$D/juiz.md" --tag "duelo:$ID" > "$D/juiz.status" 2> "$D/juiz.log" ;;
  openrouter|openrouter:*)
    JM="${JUIZ#openrouter}"; JM="${JM#:}"; JM="${JM:-${HARNESS_DUELO_JUIZ_MODEL:-deepseek/deepseek-v4-pro}}"
    bash "$SCRIPT_DIR/harness-delegate.sh" --executor openrouter --model "$JM" --role themis --task "${TASK_ID}-juiz" \
      --label "$LABEL" --prompt-file "$D/prompt-juiz.md" --max-words 400 --timeout "$TIMEOUT" --output "$D/juiz.md" --tag "duelo:$ID" > "$D/juiz.status" 2> "$D/juiz.log" ;;
  nenhum)
    printf 'DUELO|julgar|%s|sessao|%s/prompt-juiz.md|%s\n' "$ID" "$D" "$D"; exit 0 ;;
  *) log "juiz '$JUIZ' desconhecido — devolvendo para a sessao"; printf 'DUELO|julgar|%s|sessao|%s/prompt-juiz.md|%s\n' "$ID" "$D" "$D"; exit 0 ;;
esac
SJ="$(cut -d'|' -f2 "$D/juiz.status" 2>/dev/null)"
if [ "$SJ" != "ok" ]; then
  log "juiz externo falhou ($SJ) — devolvendo o julgamento para a sessao (themis)."
  printf 'DUELO|julgar|%s|themis|%s/prompt-juiz.md|%s\n' "$ID" "$D" "$D"; exit 0
fi
JSON="$(grep -o '{[^{}]*"vencedor"[^{}]*}' "$D/juiz.md" | head -1)"
V="$(printf '%s' "$JSON" | grep -o '"vencedor":"[^"]*"' | cut -d'"' -f4)"
NA="$(printf '%s' "$JSON" | grep -o '"nota_a":[0-9.]*' | cut -d: -f2)"; NB="$(printf '%s' "$JSON" | grep -o '"nota_b":[0-9.]*' | cut -d: -f2)"
MO="$(printf '%s' "$JSON" | grep -o '"motivo":"[^"]*"' | cut -d'"' -f4)"
CJ="$(custo_de juiz)"
case "$V" in A|B|nenhum) : ;; *) log "juiz nao devolveu JSON valido — devolvendo para a sessao"; printf 'DUELO|julgar|%s|themis|%s/prompt-juiz.md|%s\n' "$ID" "$D" "$D"; exit 0 ;; esac
harness_jsonl_append "$METRICS" "$(printf '{"ev":"veredito","id":"%s","ts":"%s","juiz":"%s","vencedor":"%s","nota_a":%s,"nota_b":%s,"motivo":"%s","custo_juiz":%s}' \
  "$(jesc "$ID")" "$(jesc "$TS")" "$(jesc "$JUIZ")" "$V" "$(jnum "$NA")" "$(jnum "$NB")" "$(jesc "$MO")" "$(jnum "$CJ")")"
[ "$V" = "nenhum" ] && { printf 'DUELO|reprovado|%s|nenhum||%s\n' "$ID" "$D"; exit 0; }
printf 'DUELO|ok|%s|%s|%s/%s.diff|%s\n' "$ID" "$V" "$D" "$V" "$D"
