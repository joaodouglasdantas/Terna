#!/usr/bin/env bash
# .claude/hooks/guard-stop.sh (3.4.3) — Stop hook: EM WORKTREE, trabalho aprovado nao fica sem commit.
# Regra 3.4.2 ("commit automatico em worktree") era so texto; a sessao B do sweep terminou com 33
# arquivos soltos e 0 commits. Este hook BLOQUEIA o encerramento do turno UMA vez por sessao quando:
#   - o checkout atual e um worktree do harness (worktree.env com rotulo != principal), e
#   - ha arquivo RASTREADO modificado sem commit (untracked nao conta — pode ser rascunho).
# O bloqueio devolve a instrucao (commitar 1 por item na branch wt/*) e o modelo se autocorrige.
# Depois do 1o bloqueio, vira aviso silencioso (marker) — nunca loop infinito.
# Desligar: HARNESS_GUARD_STOP=0.

set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# 3.5.7: camadas de configuracao — hooks/_env.sh carrega _defaults.env -> harness.env -> harness.env.local -> ~/.harness.env.local
# (ambiente da sessao vence). Antes cada hook tinha o proprio loop.
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_env.sh"
[ "${HARNESS_GUARD_STOP:-1}" = "1" ] || exit 0
# shellcheck disable=SC1091
[ -f "$SCRIPT_DIR/_jsonl-append.sh" ] && . "$SCRIPT_DIR/_jsonl-append.sh"   # 3.5.0: harness_metrics_arquivo

# ---- telemetria sem stop (enforcement item 2, 24/08/2026) ----
# O harness-metrics-auto.sh liga o cronometro sozinho; se um state de metrics existe ha mais
# de HARNESS_METRICS_NAG_H horas (default 3), ou a exec esqueceu o stop do fechamento, ou o
# state e sobra de sessao morta. Bloqueia UMA vez com a instrucao; exec ainda em andamento
# ignora e segue (o aviso nao se repete). Desligar: HARNESS_GUARD_METRICS=0.
if [ "${HARNESS_GUARD_METRICS:-1}" = "1" ]; then
  MRUN="$ROOT/.claude/.harness-run"
  MMARK="$MRUN/guard-stop.metrics.avisado"
  if [ ! -f "$MMARK" ]; then
    NAG_H="${HARNESS_METRICS_NAG_H:-3}"; case "$NAG_H" in ''|*[!0-9]*) NAG_H=3 ;; esac
    NOWE="$(date +%s 2>/dev/null || echo 0)"
    for st in "$MRUN"/*.json; do
      [ -f "$st" ] || continue
      grep -q '"start":' "$st" 2>/dev/null || continue
      SLB="$(grep -o '"label": *"[^"]*"' "$st" 2>/dev/null | cut -d'"' -f4)"
      SEP="$(grep -o '"start": *[0-9]*' "$st" 2>/dev/null | grep -o '[0-9]*' | head -1)"
      [ -n "$SLB" ] && [ -n "$SEP" ] || continue
      if [ $(( (NOWE - SEP) / 3600 )) -ge "$NAG_H" ] 2>/dev/null; then
        : > "$MMARK" 2>/dev/null
        printf '{"decision":"block","reason":"[guard-stop] cronometro de telemetria %s ligado ha %sh+ sem stop. Se a execucao JA TERMINOU, rode agora: bash .claude/hooks/harness-metrics.sh stop %s --tasks=N --ciclos=N --subagents=N --waves=N (contadores REAIS — nunca invente; sem contagem, omita o parametro). Se ainda esta em andamento, ignore e siga — este aviso nao se repete nesta arvore."}\n' "$SLB" "$NAG_H" "$SLB"
        exit 0
      fi
    done
  fi
fi

# ---- telemetria modificada sem stage ha > 1 h (3.4.22, item 16) ----
# O stop do harness-metrics ja faz `git add` do runs/tasks desta maquina; aqui pega o caso em que o
# stop nao rodou (sessao que so despachou subagentes — tasks/ cresce no SubagentStop) ou o dev
# desfez o stage. Avisa UMA vez por dia por arvore; nunca vira loop. Desligar: HARNESS_METRICS_GIT_ADD=0.
if [ "${HARNESS_METRICS_GIT_ADD:-1}" = "1" ] && command -v git >/dev/null 2>&1 && git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  TMARK="$ROOT/.claude/.harness-run/guard-stop.telemetria-git.$(date +%Y%m%d 2>/dev/null)"
  if [ ! -f "$TMARK" ]; then
    NOWT="$(date +%s 2>/dev/null || echo 0)"; PEND=""
    while IFS= read -r ln; do
      [ -n "$ln" ] || continue
      f="${ln#???}"; f="${f#\"}"; f="${f%\"}"
      case "$ln" in "?? "*|" M "*|"MM "*|"AM "*) : ;; *) continue ;; esac   # nao staged (index limpo/parcial)
      mt="$(stat -c %Y "$ROOT/$f" 2>/dev/null || stat -f %m "$ROOT/$f" 2>/dev/null || echo 0)"
      case "$mt" in ''|*[!0-9]*) mt=0 ;; esac
      [ $(( NOWT - mt )) -ge 3600 ] 2>/dev/null && PEND="${PEND:+$PEND }$f"
    done < <(git -C "$ROOT" status --porcelain -- prds/_metrics/runs prds/_metrics/tasks 2>/dev/null)
    if [ -n "$PEND" ]; then
      : > "$TMARK" 2>/dev/null
      printf '{"decision":"block","reason":"[guard-stop] telemetria desta maquina modificada ha mais de 1 h e ainda fora do stage: %s. Rode agora: git add %s (so esses arquivos; o commit e o escopado do fechamento). Sem isso a execucao nao aparece no painel da equipe. Este aviso nao se repete hoje."}\n' "$PEND" "$PEND"
      exit 0
    fi
  fi
fi

# ---- duelo com vitoria sem desfecho registrado (3.4.6, melhoria #6) ----
# O funil vitoria->aplicacao tinha buraco: sessoes registravam o --veredito mas esqueciam o
# --aplicado, e o placar fica cego para "o diff vencedor ENTROU?". Cobra 1x no fechamento os
# vereditos A|B NOVOS (desde o ultimo aviso — cursor por linha, sem parsing de data) que nao
# tem evento 'aplicado'. Primeiro uso ignora o backlog historico (so as ~60 linhas finais).
# Desligar: HARNESS_GUARD_DUELO_APLICADO=0.
if [ "${HARNESS_GUARD_DUELO_APLICADO:-1}" = "1" ]; then
  # 3.5.0: o arquivo DESTA maquina (duelos/<dev>@<host>.jsonl) — vitoria sem desfecho e desta sessao; legado como fallback
  DMETRICS=""; command -v harness_metrics_arquivo >/dev/null 2>&1 && DMETRICS="$(harness_metrics_arquivo "$ROOT" duelos)"
  [ -n "$DMETRICS" ] && [ -s "$DMETRICS" ] || DMETRICS="$ROOT/prds/_metrics/harness-duelos.jsonl"
  DMARK="$ROOT/.claude/.harness-run/guard-stop.duelo-aplicado.cursor"
  if [ -s "$DMETRICS" ]; then
    DTOT="$(wc -l < "$DMETRICS" 2>/dev/null | tr -d '[:space:]')"; : "${DTOT:=0}"
    DESDE=""
    [ -f "$DMARK" ] && DESDE="$(head -1 "$DMARK" 2>/dev/null)"
    case "$DESDE" in ''|*[!0-9]*) DESDE=$(( DTOT > 60 ? DTOT - 60 : 0 )) ;; esac
    [ "$DESDE" -gt "$DTOT" ] 2>/dev/null && DESDE=0   # arquivo rotacionado/encolhido: recomeca
    DPEND="$(awk -v desde="$DESDE" '
      /"ev":"aplicado"/ { if (match($0, /"id":"[^"]*"/)) done[substr($0, RSTART+6, RLENGTH-7)] = 1 }
      NR > desde && /"ev":"veredito"/ && /"vencedor":"(A|B)"/ {
        if (match($0, /"id":"[^"]*"/)) pend[substr($0, RSTART+6, RLENGTH-7)] = 1
      }
      END { n = 0; for (i in pend) if (!(i in done) && n < 6) { print i; n++ } }
    ' "$DMETRICS" 2>/dev/null)"
    if [ -n "$DPEND" ]; then
      printf '%s\n' "$DTOT" > "$DMARK" 2>/dev/null
      DLISTA="$(printf '%s' "$DPEND" | tr '\n' ' ')"
      printf '{"decision":"block","reason":"[guard-stop] duelo(s) com VITORIA sem desfecho registrado: %s. O placar por modelo fica cego sem isso. Para cada id, registre AGORA o que aconteceu de fato: bash .claude/hooks/harness-duelo.sh --aplicado <id> --resultado ok|falhou [--motivo \\"...\\"] (ok = o diff vencedor foi aplicado e passou lint/spec; falhou = foi descartado/reescrito). NUNCA invente resultado: se este duelo e de outra sessao e voce nao sabe, informe o usuario em 1 linha e siga — este aviso nao se repete para esses ids."}\n' "$DLISTA"
      exit 0
    fi
    printf '%s\n' "$DTOT" > "$DMARK" 2>/dev/null   # nada pendente: avanca o cursor em silencio
  fi
fi

WTENV="$ROOT/.claude/.harness-run/worktree.env"
[ -f "$WTENV" ] || exit 0
ROT="$(grep '^rotulo=' "$WTENV" | cut -d= -f2)"
[ -n "$ROT" ] && [ "$ROT" != "principal" ] || exit 0
command -v git >/dev/null || exit 0
N="$(git -C "$ROOT" status --porcelain 2>/dev/null | grep -cv '^??')"
[ "${N:-0}" -gt 0 ] 2>/dev/null || exit 0
MARK="$ROOT/.claude/.harness-run/guard-stop.avisado"
if [ -f "$MARK" ]; then
  exit 0   # ja bloqueou uma vez nesta arvore — nao vira loop
fi
: > "$MARK" 2>/dev/null
cat <<EOF
{"decision":"block","reason":"[guard-stop] Este e um WORKTREE (wt/$ROT) com $N arquivo(s) RASTREADO(s) modificado(s) e sem commit. Regra 3.4.2: em worktree o commit e AUTOMATICO — execute agora os commits escopados (1 por item/task concluido, git add so dos arquivos daquele item + fechamento de DT/INDEX correspondente) na branch wt/$ROT. Trabalho ainda em andamento ou rascunho que nao deve ser commitado? Diga isso explicitamente ao usuario no encerramento (1 linha) — este aviso nao se repete."}
EOF
exit 0
