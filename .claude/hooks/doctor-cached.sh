#!/usr/bin/env bash
# .claude/hooks/doctor-cached.sh — SessionStart, NUNCA bloqueia e NUNCA demora.
#
# Motivo (3.4.5, pre-propagacao): o doctor do worktree e fork-heavy (git + mysql +
# powershell) e chegou a 30-150s sob carga no Windows — e rodava SINCRONO em TODA
# abertura de sessao. Primeira impressao da equipe seria "o harness deixou tudo lento".
# Agora: imprime o resultado CACHEADO (instantaneo) e renova o cache em BACKGROUND no
# maximo 1x a cada HARNESS_DOCTOR_CACHE_H horas (default 12). Forcar: rode o doctor
# direto (bash .claude/hooks/harness-worktree.sh doctor).
#
# Bonus (onboarding 3.4.x): 1 linha com o estado do DUELO — quem nao criou a chave
# nem sabe que ele existe; quem criou ve o placar.
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# 3.5.7: camadas de configuracao — hooks/_env.sh carrega _defaults.env -> harness.env -> harness.env.local -> ~/.harness.env.local
# (ambiente da sessao vence). Antes cada hook tinha o proprio loop.
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_env.sh"
RUN="$ROOT/.claude/.harness-run"; mkdir -p "$RUN" 2>/dev/null || true
CACHE="$RUN/doctor.cache"
CACHE_H="${HARNESS_DOCTOR_CACHE_H:-12}"; case "$CACHE_H" in ''|*[!0-9]*) CACHE_H=12 ;; esac

# 1) estado do duelo (barato: env + wc) — sempre fresco
if [ -n "${OPENROUTER_API_KEY:-}" ] && [ "${HARNESS_DUELO:-auto}" != "off" ]; then
  N_DU="$(cat "$ROOT/prds/_metrics/harness-duelos.jsonl" "$ROOT"/prds/_metrics/duelos/*.jsonl 2>/dev/null | grep -c '"ev":"duelo"' | tr -d '[:space:]')"   # 3.5.0: legado + por dev
  echo "[doctor] duelo ATIVO (chave ok · ${N_DU:-0} duelo(s) no historico — placar: node .claude/hooks/harness-dashboard.mjs)"
else
  echo "[doctor] duelo dormente (sem OPENROUTER_API_KEY nesta maquina — opcional; ver .claude/ONBOARDING.md, 'Decisoes 3.4.x')"
fi

# 1a) 3.4.24 (item 10a) — Codex em LIMITE DE USO com validade: o preflight gravou `ate=<epoch>` em
# preflight-codex-cli.status. Enquanto valer, ninguem pinga o Codex e o review da Fase 2 roda em
# SOLO-2 (dois sherlocks, lentes A/B disjuntas). Barato: grep + date.
PF_CODEX="$RUN/preflight-codex-cli.status"
ATE=""
if [ -f "$PF_CODEX" ]; then
  ATE="$(grep '^ate=' "$PF_CODEX" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]')"
  case "$ATE" in ''|*[!0-9]*) ATE="" ;; esac
  if [ -n "$ATE" ] && [ "$ATE" -gt "$(date +%s)" ] 2>/dev/null; then
    ATE_H="$(date -d "@$ATE" '+%d/%m %H:%M' 2>/dev/null || date -r "$ATE" '+%d/%m %H:%M' 2>/dev/null || echo "$ATE")"
    echo "[doctor] Codex fora até $ATE_H (limite de uso) — review em SOLO-2 (2 sherlocks, lentes A/B); nenhum preflight pinga ate la (liberou antes? bash .claude/hooks/harness-delegate.sh --preflight codex-cli --force)"
  fi
fi
# 1a') 3.5.6 (D17): a cota do Codex e da MAQUINA, nao do projeto — o preflight de qualquer projeto grava
# ~/.harness-run/codex-limite.json e todos os outros leem daqui sem pagar um ping (medido 15/09: 3 execs + 4 criacoes
# descobrindo o mesmo limite uma a uma).
CL="${HOME:-${USERPROFILE:-}}/.harness-run/codex-limite.json"
if [ -f "$CL" ]; then
  ATE2="$(grep -o '"ate":[0-9]*' "$CL" 2>/dev/null | head -1 | cut -d: -f2)"
  case "$ATE2" in ''|*[!0-9]*) ATE2="" ;; esac
  if [ -n "$ATE2" ] && [ "$ATE2" -gt "$(date +%s)" ] 2>/dev/null && { [ -z "$ATE" ] || [ "$ATE" -le "$(date +%s)" ] 2>/dev/null; }; then
    ATE2_H="$(date -d "@$ATE2" '+%d/%m %H:%M' 2>/dev/null || date -r "$ATE2" '+%d/%m %H:%M' 2>/dev/null || echo "$ATE2")"
    CL_P="$(grep -o '"projeto":"[^"]*"' "$CL" 2>/dev/null | head -1 | cut -d'"' -f4)"
    echo "[doctor] Codex fora até $ATE2_H (limite de uso visto em ${CL_P:-outro projeto} — compartilhado entre os projetos desta maquina, 3.5.6) — review em SOLO-2; nenhum preflight pinga ate la (liberou antes? --preflight codex-cli --force)"
  fi
fi

# 1b) 3.4.21 — custo de CRIAR UM PROCESSO nesta maquina, agora (mediana de 5 `bash -c true`, ~0,4 s).
# Medido 04/09: a criacao de processo e serializada (~20/s) e o spawn foi de 29 ms (repouso) a
# 1.382 ms (3 frentes); Derick 33 ms, Joao 69, Macs 5-20. Historico por maquina em
# ~/.harness-run/spawn-history.jsonl (o dashboard/analise le); referencia da equipe em
# HARNESS_SPAWN_REF_MS (33). Acima de 4x a referencia => provavel HVCI ligado, Defender sem
# exclusao (bash.exe/node.exe/projetos) ou frentes/sessoes demais — ver ONBOARDING 3.4.21.
if command -v "${HARNESS_RAG_NODE:-node}" >/dev/null 2>&1; then
  SP_MS="$("${HARNESS_RAG_NODE:-node}" -e 'const cp=require("child_process");const v=[];for(let i=0;i<5;i++){const t=Date.now();try{cp.execSync("bash -c true",{stdio:"ignore",windowsHide:true})}catch(e){};v.push(Date.now()-t)}v.sort((a,b)=>a-b);process.stdout.write(String(v[2]))' 2>/dev/null)"
  case "$SP_MS" in ''|*[!0-9]*) SP_MS="" ;; esac
  if [ -n "$SP_MS" ]; then
    REF="${HARNESS_SPAWN_REF_MS:-33}"; case "$REF" in ''|*[!0-9]*) REF=33 ;; esac
    HRUN="${HOME:-$USERPROFILE}/.harness-run"; mkdir -p "$HRUN" 2>/dev/null
    ULT="$(tail -1 "$HRUN/spawn-history.jsonl" 2>/dev/null | grep -o '"ms":[0-9]*' | cut -d: -f2)"
    printf '{"ts":%s,"ms":%s,"host":"%s","projeto":"%s","os":"%s"}\n' "$(date +%s)" "$SP_MS" "$(hostname 2>/dev/null | cut -d. -f1)" "$(basename "$ROOT")" "$(uname -s 2>/dev/null)" >> "$HRUN/spawn-history.jsonl" 2>/dev/null
    if [ "$SP_MS" -gt $((REF * 4)) ]; then
      echo "[doctor] spawn ${SP_MS} ms por processo — LENTO (ref. equipe ${REF} ms${ULT:+; ultimo ${ULT}}). Cheque: Integridade de Memoria (HVCI) ligada? exclusoes do Defender p/ bash.exe/node.exe/projetos? sessoes ociosas (node .claude/hooks/sessoes.mjs)? frentes (node .claude/hooks/frentes.mjs status)?"
    else
      echo "[doctor] spawn ${SP_MS} ms por processo (ref. equipe ${REF}${ULT:+; ultimo ${ULT}})"
    fi
  fi
fi

# 1c) 3.4.21 — daemon de hooks (marcador por projeto; o --ensure do SessionStart e quem o sobe)
if [ -f "$RUN/daemon.on" ]; then
  echo "[doctor] daemon de hooks ATIVO (porta $(head -1 "$RUN/daemon.on" 2>/dev/null)) — Bash/presenca sem spawn de node; status: node .claude/hooks/harness-daemon.mjs --status"
elif [ "${HARNESS_DAEMON:-on}" = "off" ]; then
  echo "[doctor] daemon de hooks desligado (HARNESS_DAEMON=off) — hooks em modo direto"
fi

# 2) resultado cacheado do doctor de worktree (instantaneo) — 3.4.21: 14 linhas (sessoes ociosas
# e frentes entram aqui)
if [ -s "$CACHE" ]; then
  head -14 "$CACHE"
else
  echo "[doctor] primeira execucao: rodando em background — resultado na proxima sessao (ou rode: bash .claude/hooks/harness-worktree.sh doctor)"
fi

# 3) renova em background se o cache esta velho (double-fork: escapa do timeout do hook)
FRESCO=0
if [ -s "$CACHE" ]; then
  AGORA="$(date +%s)"; MT="$(stat -c %Y "$CACHE" 2>/dev/null || stat -f %m "$CACHE" 2>/dev/null || echo 0)"
  [ $(( (AGORA - MT) / 3600 )) -lt "$CACHE_H" ] && FRESCO=1
fi
if [ "$FRESCO" != "1" ] && [ ! -f "$RUN/doctor.refreshing" ]; then
  : > "$RUN/doctor.refreshing" 2>/dev/null
  ( ( bash "$SCRIPT_DIR/harness-worktree.sh" doctor > "$CACHE.new" 2>/dev/null; \
      [ -s "$CACHE.new" ] && mv -f "$CACHE.new" "$CACHE" || { echo "(doctor sem achados $(date +%d/%m\ %H:%M))" > "$CACHE"; rm -f "$CACHE.new"; }; \
      rm -f "$RUN/doctor.refreshing" ) & ) 2>/dev/null
fi
exit 0
