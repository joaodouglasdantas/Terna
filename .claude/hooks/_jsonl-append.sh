#!/usr/bin/env bash
# .claude/hooks/_jsonl-append.sh — append de telemetria JSONL com LOCK (DT-007, 01/09/2026)
#
# POR QUE EXISTE. Os jsonl de prds/_metrics recebem appends de N processos ao mesmo
# tempo (2 workers de duelo em paralelo, delegacoes, sessoes simultaneas) e append
# via '>>' NAO e atomico entre processos no Windows/NTFS — e um registro montado com
# VARIOS printf no mesmo redirect intercala com o vizinho. Caso real (Mariana,
# 18/08): linhas 1-2 do harness-delegations.jsonl viraram JSON invalido
# ('"tag":"""ts":...' — o comeco de um registro entrelacado com o fim de outro), e
# os leitores (dashboard, placar) descartavam em silencio, distorcendo metrica.
#
# Regras:
#   - a LINHA chega PRONTA (JSON completo, sem \n) — quem monta com varios printf
#     captura antes ("LINE=$( { ...; } )") e passa inteira;
#   - lock por mkdir (atomico em POSIX e NTFS), mesmo padrao do harness-locks/seq;
#   - lock VELHO (> 30s) e roubado — processo morto nao trava telemetria;
#   - timeout de espera ~5s e o append acontece MESMO SEM lock (telemetria perdida
#     e pior que uma corrida residual; o fluxo nunca trava por causa disto);
#   - nunca falha o chamador (sempre return 0).

harness_jsonl_append() { # $1 = arquivo .jsonl  $2 = linha JSON completa (sem \n)
  local f="$1" l="$2" lock="$1.lock.d" i=0 got=0 age now mt
  [ -n "$f" ] && [ -n "$l" ] || return 0
  mkdir -p "$(dirname "$f")" 2>/dev/null
  while [ "$i" -lt 50 ]; do
    if mkdir "$lock" 2>/dev/null; then got=1; break; fi
    # lock orfao? (> 30s) — rouba em vez de esperar para sempre. O mtime precisa ser
    # validado como NUMERO: se o lock sumiu entre o mkdir e o stat (corrida normal),
    # ou num stat BSD/GNU trocado, a saida vira lixo multiline e quebraria a aritmetica.
    now="$(date +%s 2>/dev/null || echo 0)"
    mt="$(stat -c %Y "$lock" 2>/dev/null | head -n1)"
    case "$mt" in ''|*[!0-9]*) mt="$(stat -f %m "$lock" 2>/dev/null | head -n1)" ;; esac
    case "$mt" in ''|*[!0-9]*) mt="" ;; esac
    if [ -n "$mt" ] && [ "$now" -gt 0 ] && [ $(( now - mt )) -gt 30 ]; then rmdir "$lock" 2>/dev/null; continue; fi
    i=$(( i + 1 )); sleep 0.1 2>/dev/null || sleep 1
  done
  printf '%s\n' "$l" >> "$f" 2>/dev/null
  [ "$got" = "1" ] && rmdir "$lock" 2>/dev/null
  return 0
}

# 3.5.0 — ARQUIVO VERSIONADO POR DEV/MAQUINA de uma subpasta de prds/_metrics (runs | tasks | incidentes |
# delegations | duelos). Mesma regra dos runs/ (3.2.2): um arquivo por dev/maquina[~worktree] = append-only sem
# conflito de merge. Motivo: harness-delegations.jsonl e harness-duelos.jsonl eram UM arquivo compartilhado —
# dois devs apendando o mesmo fim de arquivo conflitam em todo merge (a classe de problema que tirou os runs
# do arquivo unico). O nome e IDENTICO ao que o harness-metrics.sh usa para runs/ (RUN_BASENAME).
harness_metrics_arquivo() { # $1 = raiz do projeto  $2 = subpasta -> caminho do .jsonl desta maquina
  local _root="$1" _sub="$2" _u _h _wt=""
  [ -n "$_root" ] && [ -n "$_sub" ] || return 0
  _u="${USER:-${USERNAME:-dev}}"
  _h="$(hostname 2>/dev/null | cut -d. -f1)"; : "${_h:=maquina}"
  _wt="$(grep '^rotulo=' "$_root/.claude/.harness-run/worktree.env" 2>/dev/null | cut -d= -f2)"
  [ -n "$_wt" ] && _wt="~$_wt"
  printf '%s/prds/_metrics/%s/%s.jsonl' "$_root" "$_sub" "$(printf '%s@%s%s' "$_u" "$_h" "$_wt" | tr -c 'A-Za-z0-9@._~-' '_')"
  return 0
}

# 3.5.0 — TODAS as linhas de uma serie: legado compartilhado (se existir) + todos os arquivos por dev/maquina
# da subpasta. Grava a uniao em .harness-run/<sub>-todos.jsonl (efemero) e imprime o caminho — para leitores
# que recebem UM arquivo (placar do duelo em node -e, contadores por grep).
harness_metrics_todos() { # $1 = raiz  $2 = subpasta  $3 = arquivo legado (nome, opcional) -> caminho
  local _root="$1" _sub="$2" _leg="${3:-}" _out
  [ -n "$_root" ] && [ -n "$_sub" ] || return 0
  _out="$_root/.claude/.harness-run/$_sub-todos.jsonl"; mkdir -p "$(dirname "$_out")" 2>/dev/null
  { [ -n "$_leg" ] && cat "$_root/prds/_metrics/$_leg" 2>/dev/null; cat "$_root/prds/_metrics/$_sub"/*.jsonl 2>/dev/null; } > "$_out" 2>/dev/null
  printf '%s' "$_out"
  return 0
}
