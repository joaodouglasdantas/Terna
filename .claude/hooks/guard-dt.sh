#!/usr/bin/env bash
# .claude/hooks/guard-dt.sh — PreToolUse Write, BLOQUEANTE. Gate de ADMISSAO de debito tecnico.
#
# Motivo (24-25/08/2026): criar DT custa 30s (qualquer reviewer abre um), resolver custa 30+min.
# A /dt tem as regras (ideia nao vira DT, sem duplicata), mas quem cria DT em VOLUME sao as
# sessoes de exec/review escrevendo prds/debito_tecnico/DT-*.md direto — sem passar pela /dt.
# Medido: sweep de 98 pendentes; 19 DTs novos num unico dia. Instrucao nao segura; hook segura.
#
# Exigencias para DT NOVO (arquivo ainda nao existe):
#   1. PROVA concreta: referencia arquivo:linha (ex: caminho.php:123) em algum lugar do corpo;
#   2. **Duplicata:** declarada (ex: "**Duplicata:** nenhuma (INDEX verificado)" ou "similar a DT-NNN");
#   3. **Balde:** classificado no nascimento (lote | prd | decidir) — taxonomia do /dt-sweep;
#   4. WIP CAP: com mais de HARNESS_DT_WIP_MAX pendentes (default 60), so entra DT com
#      prioridade Alta/bloqueante — o resto vira ideia (prds/backlog/IDEIAS.md) ou linha de relatorio.
# Edicao de DT existente passa livre. Desligar: HARNESS_GUARD_DT=0.
set -u
INPUT="$(cat 2>/dev/null)"; [ -n "$INPUT" ] || exit 0
# fast-path: so nos interessa Write em prds/debito_tecnico/DT-*.md (barato: grep no JSON cru)
printf '%s' "$INPUT" | grep -qE '"file_path"[^"]*"[^"]*prds[/\\]+debito_tecnico[/\\]+DT-[0-9]+' || exit 0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# 3.5.7: camadas de configuracao — hooks/_env.sh carrega _defaults.env -> harness.env -> harness.env.local -> ~/.harness.env.local
# (ambiente da sessao vence). Antes cada hook tinha o proprio loop.
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_env.sh"
[ "${HARNESS_GUARD_DT:-1}" = "1" ] || exit 0

if command -v jq >/dev/null 2>&1; then
  FP="$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)"
  CONTEUDO="$(printf '%s' "$INPUT" | jq -r '.tool_input.content // empty' 2>/dev/null)"
else
  FP="$(printf '%s' "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*:[[:space:]]*"([^"]*)"/\1/')"
  CONTEUDO="$INPUT"
fi
[ -n "$FP" ] || exit 0
# normaliza C:\ -> /c/ para o teste de existencia no Git Bash
FPU="$(printf '%s' "$FP" | sed -E 's|^([A-Za-z]):[\\/]|/\L\1/|; s|\\|/|g')"
[ -f "$FPU" ] || [ -f "$FP" ] && exit 0     # DT existente: edicao/atualizacao passa livre

deny() { printf '%s\n' "$*" >&2; exit 2; }
# 3.4.32 — NUMERO RESERVADO. Medido 10/09/2026: a exec da PRD-140 (checkout principal) criou DT-578/579 por
# max(INDEX)+1 enquanto a worktree ideias ja tinha reservado 578-580 (harness-worktree.sh reservar DT): dois
# DT-578 e dois DT-579 com slugs diferentes esperando o merge. Regra: se o projeto usa reservas (existe
# .git/harness-locks/seq), todo DT NOVO precisa ter o numero reservado POR ESTE checkout. HARNESS_GUARD_DT_SEQ=0 desliga.
if [ "${HARNESS_GUARD_DT_SEQ:-1}" = "1" ]; then
  N="$(basename "$FP" | grep -oE '^DT-[0-9]+' | grep -oE '[0-9]+' | head -1)"
  COMMON="$(cd "$ROOT" && git rev-parse --git-common-dir 2>/dev/null)"
  case "$COMMON" in ""|/*|[A-Za-z]:*) : ;; *) COMMON="$ROOT/$COMMON" ;; esac
  SEQD="${COMMON:+$COMMON/harness-locks/seq}"
  if [ -n "$N" ] && [ -n "$SEQD" ] && [ -d "$SEQD" ]; then
    N=$((10#$N)); MEU="$(basename "$ROOT")"
    if [ -d "$SEQD/DT-$N" ]; then
      DONO="$(cut -d'|' -f1 "$SEQD/DT-$N/dono" 2>/dev/null)"
      [ "$DONO" = "$MEU" ] || deny "[guard-dt] DT-$N esta RESERVADO por '${DONO:-outro checkout}' (worktree/checkout paralelo) — colisao de numero. Reserve o seu numero e renomeie arquivo + linha do INDEX:
  bash .claude/hooks/harness-worktree.sh reservar DT     # imprime SEQ|DT|<numero livre>"
    else
      MAXR=0; for d in "$SEQD"/DT-*; do [ -d "$d" ] || continue; n="${d##*-}"; case "$n" in ''|*[!0-9]*) continue ;; esac; n=$((10#$n)); [ "$n" -gt "$MAXR" ] && MAXR="$n"; done
      deny "[guard-dt] DT-$N NAO esta reservado (este projeto numera por reserva atomica; ultima reserva: DT-$MAXR). max(INDEX)+1 colide entre checkouts. Reserve e use o numero devolvido:
  bash .claude/hooks/harness-worktree.sh reservar DT     # imprime SEQ|DT|<numero livre>"
    fi
  fi
fi
FALTA=""
printf '%s' "$CONTEUDO" | grep -qE '[A-Za-z0-9_./\\-]+\.(php|js|ts|css|py|sh|sql|md)(:[0-9]+|`? *\| *(Modificar|Criar))' \
  || FALTA="$FALTA
  - PROVA: cite ao menos um alvo concreto 'arquivo.ext:linha' (ou tabela de Arquivo(s) Afetado(s)). Sem prova, o debito e opiniao."
printf '%s' "$CONTEUDO" | grep -qiE '\*\*Duplicata' \
  || FALTA="$FALTA
  - DEDUPE: adicione a linha '**Duplicata:** nenhuma (INDEX verificado em AAAA-MM-DD)' ou '**Duplicata:** similar a DT-NNN — <por que este e distinto>'. Verifique ANTES em prds/debito_tecnico/INDEX.md (duplicata e a 2a causa da fila inchada)."
printf '%s' "$CONTEUDO" | grep -qiE '\*\*Balde:?\*\*[^|]*\b(lote|prd|decidir)\b' \
  || FALTA="$FALTA
  - BALDE: adicione '**Balde:** lote' (pequeno e mecanico), 'prd' (grande, exige spec) ou 'decidir' (depende de decisao de produto). Ideia NAO e DT: 'seria bom ter' vai em 1 linha no prds/backlog/IDEIAS.md e este arquivo nem nasce."
if [ -n "$FALTA" ]; then
  deny "[guard-dt] DT novo sem gate de admissao ($(basename "$FP")). Faltou:$FALTA
Corrija o conteudo e escreva de novo. Achado de review com <= ~30 min de conserto no arquivo JA TOCADO nao vira DT: corrija no proprio ciclo ou rebaixe a informativo no relatorio."
fi

# WIP cap: fila cheia so aceita Alta/bloqueante
IDX="$ROOT/prds/debito_tecnico/INDEX.md"
MAXP="${HARNESS_DT_WIP_MAX:-60}"; case "$MAXP" in ''|*[!0-9]*) MAXP=60 ;; esac
if [ -s "$IDX" ] && [ "$MAXP" -gt 0 ] 2>/dev/null; then
  PEND="$(grep -c '| *Pendente *|' "$IDX" 2>/dev/null)"; case "$PEND" in ''|*[!0-9]*) PEND=0 ;; esac
  if [ "$PEND" -gt "$MAXP" ] && ! printf '%s' "$CONTEUDO" | grep -qiE 'Alta|bloqueante|🔴'; then
    deny "[guard-dt] Fila de DTs CHEIA ($PEND pendentes > teto $MAXP, HARNESS_DT_WIP_MAX) e este DT nao e Alta/bloqueante. NAO registre: se e ideia/melhoria, 1 linha em prds/backlog/IDEIAS.md; se e achado menor de review, corrija no ciclo ou deixe como informativo no relatorio final. So debito Alta/bloqueante fura a fila cheia."
  fi
fi
exit 0
