#!/usr/bin/env bash
# .claude/hooks/carga-maquina.sh (3.4.5) — INSTRUTIVO, nunca bloqueia.
# Conta quantas execucoes do harness estao ATIVAS nesta maquina (presenca com ping < 15min
# em qualquer checkout irmao) e imprime uma recomendacao de paralelismo para a onda.
#
# Motivo (medido 25/08, plano Claude 20x): o rate limit e por MINUTO — 3+ frentes de
# fan-out (8-12 subagentes cada) se canibalizam com 429/529 e TODAS ficam lentas.
# Regra da casa (recalibrada 3.4.18): ate 3 frentes pesadas simultaneas = paralelismo pleno;
# a partir da 4a, ALERTA (nunca corte automatico). So o spawn LENTO medido reduz executores.
# Medido 02/09: 2 execs + 1 sessao de analise com spawn 0,15-0,8 s a tarde inteira.
#   uso: bash .claude/hooks/carga-maquina.sh   (a skill roda antes de despachar onda)
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PAI="$(dirname "$ROOT")"
ATIVAS=0; ONDE=''
for d in "$PAI"/*/.claude/.harness-run "$PAI"/*/*/.claude/.harness-run; do
  [ -d "$d" ] || continue
  # ping de presenca recente = sessao viva naquele checkout
  if find "$d" -maxdepth 1 -name 'presence-last-ping-*' -mmin -15 2>/dev/null | grep -q .; then
    ATIVAS=$((ATIVAS+1))
    NM="$(basename "$(dirname "$(dirname "$d")")")"
    [ "$NM" = "$(basename "$ROOT")" ] && NM="$NM(esta)"
    ONDE="$ONDE $NM"
  fi
done
OUTRAS=$((ATIVAS>0 ? ATIVAS-1 : 0))
# 3.4.12: custo de CRIAR UM PROCESSO nesta maquina, agora (ms). Medido 01-02/09 no Windows: com
# 2 frentes um `cmp` custava 0,3 s; com 3 frentes + 8 agentes, 1,8 s — e cada Bash de agente
# (hooks + comando) foi de 4 s para 40-88 s. CPU/RAM ficam moderadas: e fila de spawn (fork do
# MSYS + Defender), nao processamento. Acima de HARNESS_SPAWN_LENTO_MS (default 1000) a
# recomendacao cai para 2 executores vivos e gates um de cada vez.
SPAWN_MS=""
if command -v node >/dev/null 2>&1; then
  # 3.4.18: MEDIANA de 3 amostras — uma amostra unica pegava um pico isolado (1,3 s com a vigia
  # medindo 0,15-0,8 s no mesmo minuto) e cortava a execucao para 2 vivos sem motivo.
  SPAWN_MS="$(node -e 'const cp=require("child_process");const v=[];for(let i=0;i<3;i++){const t=Date.now();try{cp.execSync("bash -c true",{stdio:"ignore"})}catch(e){};v.push(Date.now()-t)}v.sort((a,b)=>a-b);process.stdout.write(String(v[1]))' 2>/dev/null)"
fi
case "$SPAWN_MS" in ''|*[!0-9]*) SPAWN_MS="" ;; esac
LENTO="${HARNESS_SPAWN_LENTO_MS:-1000}"; case "$LENTO" in ''|*[!0-9]*) LENTO=1000 ;; esac
# 3.5.3: TETO DE VIVOS DINAMICO — a linha CARGA|vivos|N passa a sair SEMPRE, e a skill obedece a ela.
#   spawn LENTO                      -> 2 (como antes)
#   maquina folgada (0-1 outra frente, spawn ok) -> HARNESS_PIPELINE_MAX_VIVOS_FOLGADO (default 6)
#   2+ outras frentes                -> HARNESS_PIPELINE_MAX_VIVOS (piso, default 4)
# Medido 12/09 (PRD-142-b): 5 tasks liberadas na onda 1 com teto 4, CARGA|baixa e spawn 320 ms —
# a TASK-006 esperou 43 min por vaga e virou cauda serial de 45 min. O 4 protegia do 429/529 por
# rajada (25/08); com a maquina folgada a rajada nao acontece (0 stalls, 0 429 medidos).
PISO="${HARNESS_PIPELINE_MAX_VIVOS:-4}"; case "$PISO" in ''|*[!0-9]*) PISO=4 ;; esac
FOLGADO="${HARNESS_PIPELINE_MAX_VIVOS_FOLGADO:-6}"; case "$FOLGADO" in ''|*[!0-9]*) FOLGADO=6 ;; esac
[ "$FOLGADO" -lt "$PISO" ] && FOLGADO="$PISO"
VIVOS="$PISO"; [ "$OUTRAS" -le 1 ] && VIVOS="$FOLGADO"
# 3.5.4: CARGA|alta (3+ outras frentes) tambem baixa o teto — HARNESS_PIPELINE_MAX_VIVOS_ALTA (default 3). Medido
# 14/09: 5 sessoes harness vivas, duas execs com vivos=4 cada = 16 subagentes e spawn de 3-6 s, enquanto a amostra
# unica do CARGA|spawn tinha dado 131 ms dois minutos antes. So o spawn LENTO nao pega a rajada que vem depois.
ALTA_VIVOS="${HARNESS_PIPELINE_MAX_VIVOS_ALTA:-3}"; case "$ALTA_VIVOS" in ''|*[!0-9]*) ALTA_VIVOS=3 ;; esac
[ "$OUTRAS" -ge 3 ] && [ "$VIVOS" -gt "$ALTA_VIVOS" ] && VIVOS="$ALTA_VIVOS"
if [ -n "$SPAWN_MS" ]; then
  if [ "$SPAWN_MS" -gt "$LENTO" ]; then
    echo "CARGA|spawn|${SPAWN_MS}ms|LENTO — criar processo esta custando ${SPAWN_MS} ms (regua: ${LENTO}). Cada Bash de agente vai custar 10x o normal: use HARNESS_PIPELINE_MAX_VIVOS=2 nesta execucao, gates um de cada vez, e prefira Read/Grep a cat/grep. Provaveis causas: 3+ frentes vivas, Defender sem exclusao para o projeto/Git/node, PC sem reiniciar ha dias."
    VIVOS=2
  else
    echo "CARGA|spawn|${SPAWN_MS}ms|ok"
  fi
fi
echo "CARGA|vivos|$VIVOS"
echo "CARGA|frentes|$ATIVAS"
if [ "$OUTRAS" -ge 3 ]; then
  echo "CARGA|alta|$ATIVAS sessoes harness ativas nesta maquina:$ONDE"
  echo "CARGA|recomendacao|4+ frentes disputam o rate limit POR MINUTO da conta (medido 25/08: 429/529) e a criacao de processo desta maquina (3-6 s de spawn com 16 subagentes, 14/09). Teto de vivos nesta exec: $VIVOS (3.5.4, HARNESS_PIPELINE_MAX_VIVOS_ALTA) — obedeca a linha CARGA|vivos; anuncie ao usuario e siga; reduza mais so se vir 429/529."
elif [ "$OUTRAS" -ge 1 ]; then
  echo "CARGA|media|$ATIVAS frentes ativas:$ONDE — paralelismo pleno (3.4.18: ate 3 frentes a maquina aguenta; so spawn LENTO reduz vivos). Teto de vivos: $VIVOS."
else
  echo "CARGA|baixa|so esta sessao ativa — paralelismo pleno liberado. Teto de vivos: $VIVOS (folgado)."
fi
exit 0
