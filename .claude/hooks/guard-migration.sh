#!/usr/bin/env bash
# .claude/hooks/guard-migration.sh (3.4.33) — PreToolUse Write: migration NOVA so com numero RESERVADO.
#
# Medido 10/09/2026 (Mariana): a PRD-141 (criada na worktree ideias) planejou a migration 0193; a exec da
# PRD-140 (checkout principal) criou a 0193 primeiro — quinta colisao de migration seguida. A reserva atomica
# entre checkouts (harness-worktree.sh reservar, 3.4.2) cobria DT/LOTE/PRD; agora cobre MIG.
#
# Regra: Write de arquivo NOVO em */migrations/NNNN_* (ou NNNN-*) — se o projeto usa reservas (existe
# .git/harness-locks/seq), o numero precisa ter sido reservado POR ESTE checkout:
#   bash .claude/hooks/harness-worktree.sh reservar MIG      -> SEQ|MIG|0194
# Reservado por outro checkout => NEGA citando o dono. Sem reserva => NEGA citando a ultima reserva e o comando.
# Editar migration existente passa livre. Projeto sem seq/ passa livre (retrocompat). HARNESS_GUARD_MIG_SEQ=0 desliga.
#
# 3.5.0 — HARNESS_MIG_NUMERACAO='timestamp': o nome NOVO precisa ser YYYYMMDDHHMMSS_<slug> (14 digitos, o que o
# `reservar MIG` devolve), reservado por este checkout, e dentro de +-48 h de agora (timestamp inventado no passado
# reordenaria a serie em banco zero). Arquivo NNNN_ novo nesse modo e NEGADO. Migration NUNCA usa faixa por dev.
set -u
INPUT="$(cat 2>/dev/null)"; [ -n "$INPUT" ] || exit 0
# fast-path barato: so nos interessa Write em .../migrations/<numero>_...
printf '%s' "$INPUT" | grep -qE '"file_path"[^"]*"[^"]*migrations[/\\]+[0-9]{3,14}[_-]' || exit 0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# 3.5.7: camadas de configuracao — hooks/_env.sh carrega _defaults.env -> harness.env -> harness.env.local -> ~/.harness.env.local
# (ambiente da sessao vence). Antes cada hook tinha o proprio loop.
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_env.sh"
[ "${HARNESS_GUARD_MIG_SEQ:-1}" = "1" ] || exit 0

if command -v jq >/dev/null 2>&1; then
  FP="$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)"
else
  FP="$(printf '%s' "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*:[[:space:]]*"([^"]*)"/\1/')"
fi
[ -n "$FP" ] || exit 0
FPU="$(printf '%s' "$FP" | sed -E 's|^([A-Za-z]):[\\/]|/\L\1/|; s|\\|/|g')"
[ -f "$FPU" ] || [ -f "$FP" ] && exit 0     # migration existente: edicao passa livre

deny() { printf '%s\n' "$*" >&2; exit 2; }
N="$(basename "$FPU" | grep -oE '^[0-9]{3,14}' | head -1)"; [ -n "$N" ] || exit 0
COMMON="$(cd "$ROOT" && git rev-parse --git-common-dir 2>/dev/null)"
case "$COMMON" in ""|/*|[A-Za-z]:*) : ;; *) COMMON="$ROOT/$COMMON" ;; esac
SEQD="${COMMON:+$COMMON/harness-locks/seq}"
MEU="$(basename "$ROOT")"
MODO="${HARNESS_MIG_NUMERACAO:-seq}"
# 3.5.6 (D2 / B10): a reserva e por CHECKOUT, mas a migration pertence a PRD, que muda de checkout entre a criacao
# (worktree A) e a exec (worktree B). Medido 15/09: seq/MIG-201 presa em `--wt-prd-137c` (fechada e mergeada as 16:10)
# negou o hefesto da exec e a 137-c virou 0202 com a PRD inteira citando 0201; MIG-200 no mesmo estado para a 144.
# Regra: reserva cujo dono NAO e um checkout vivo (nao esta no `git worktree list` e nao e o principal) e ADOTADA
# por quem escreve — o `dono` e regravado e o Write segue. Dono vivo continua negando. HARNESS_GUARD_MIG_ADOTA=off desliga.
reserva_viva() { # $1 = dono (basename do checkout ou rotulo) -> 0 se ha checkout vivo com esse nome
  local _d="$1" _main
  [ -n "$_d" ] || return 1
  [ "$_d" = "$MEU" ] && return 0
  _main="$(basename "$(cd "$COMMON/.." 2>/dev/null && pwd)")"
  [ "$_d" = "$_main" ] && return 0
  git -C "$ROOT" worktree list --porcelain 2>/dev/null | awk '/^worktree /{sub(/^worktree /, ""); n=split($0, p, "[\\\\/]"); print p[n]}' | grep -qxF "$_d"
}
adotar_reserva() { # $1 = N (nome da pasta MIG-N)  $2 = dono antigo
  [ "${HARNESS_GUARD_MIG_ADOTA:-on}" != "off" ] || return 1
  reserva_viva "$2" && return 1
  printf '%s|%s|%s\n' "$MEU" "$(date -Iseconds 2>/dev/null || date)" "adotada de $2 (checkout morto) — 3.5.6" > "$SEQD/MIG-$1/dono" 2>/dev/null || return 1
  _AV="[guard-migration] reserva MIG-$1 estava em nome de '$2' (checkout que nao existe mais) — ADOTADA por '$MEU' (3.5.6/D2). O Write segue; nada a renumerar."
  if command -v jq >/dev/null 2>&1; then printf '%s' "$_AV" | jq -Rs '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:.}}'; else printf '%s\n' "$_AV" >&2; fi
  return 0
}
if [ "$MODO" = "timestamp" ]; then
  # 3.5.0: modo timestamp — vale mesmo sem seq/ (o formato e a janela sao a regra; a reserva, quando ha seq/).
  [ "${#N}" -eq 14 ] || deny "[guard-migration] este projeto numera migrations por TIMESTAMP (HARNESS_MIG_NUMERACAO=timestamp): o nome novo deve ser YYYYMMDDHHMMSS_<slug>, nao '$N'. Reserve e use o que vier:
  bash .claude/hooks/harness-worktree.sh reservar MIG     # imprime SEQ|MIG|20260911153045"
  AGORA="$(date +%Y%m%d%H%M%S)"
  MIN="$(date -d '-2 days' +%Y%m%d%H%M%S 2>/dev/null || date -v-2d +%Y%m%d%H%M%S 2>/dev/null || echo 0)"
  MAXT="$(date -d '+2 days' +%Y%m%d%H%M%S 2>/dev/null || date -v+2d +%Y%m%d%H%M%S 2>/dev/null || echo 99999999999999)"
  if [ "$N" -lt "$MIN" ] || [ "$N" -gt "$MAXT" ]; then
    deny "[guard-migration] timestamp '$N' fora da janela de +-48 h (agora: $AGORA). Timestamp inventado reordena a serie em banco zero. Reserve o instante real:
  bash .claude/hooks/harness-worktree.sh reservar MIG"
  fi
  if [ -n "$SEQD" ] && [ -d "$SEQD" ]; then
    if [ -d "$SEQD/MIG-$N" ]; then
      DONO="$(cut -d'|' -f1 "$SEQD/MIG-$N/dono" 2>/dev/null)"
      [ "$DONO" = "$MEU" ] || adotar_reserva "$N" "$DONO" || deny "[guard-migration] migration $N esta RESERVADA por '${DONO:-outro checkout}' (checkout VIVO) — reserve o seu instante: bash .claude/hooks/harness-worktree.sh reservar MIG"
    else
      deny "[guard-migration] migration $N NAO esta reservada (modo timestamp exige o instante devolvido pela reserva — mesmo segundo em dois checkouts colide). Rode:
  bash .claude/hooks/harness-worktree.sh reservar MIG     # imprime SEQ|MIG|<YYYYMMDDHHMMSS>"
    fi
  fi
  exit 0
fi
[ "${#N}" -le 5 ] || deny "[guard-migration] nome '$N' tem cara de timestamp, mas este projeto numera migrations em SERIE (HARNESS_MIG_NUMERACAO=seq, NNNN_<slug>). Reserve o proximo numero da serie:
  bash .claude/hooks/harness-worktree.sh reservar MIG     # imprime SEQ|MIG|<numero livre, com zero a esquerda>"
[ -n "$SEQD" ] && [ -d "$SEQD" ] || exit 0     # projeto sem reservas: comportamento antigo
N=$((10#$N))
if [ -d "$SEQD/MIG-$N" ]; then
  DONO="$(cut -d'|' -f1 "$SEQD/MIG-$N/dono" 2>/dev/null)"
  [ "$DONO" = "$MEU" ] && exit 0
  adotar_reserva "$N" "$DONO" && exit 0
  deny "[guard-migration] migration $N esta RESERVADA por '${DONO:-outro checkout}' (worktree/checkout paralelo VIVO) — colisao de numero. Reserve a sua e renumere o arquivo (e as referencias na PRD/task):
  bash .claude/hooks/harness-worktree.sh reservar MIG     # imprime SEQ|MIG|<numero livre, com zero a esquerda>"
fi
MAXR=0; for d in "$SEQD"/MIG-*; do [ -d "$d" ] || continue; n="${d##*-}"; case "$n" in ''|*[!0-9]*) continue ;; esac; n=$((10#$n)); [ "$n" -gt "$MAXR" ] && MAXR="$n"; done
deny "[guard-migration] migration $N NAO esta reservada (este projeto numera migrations por reserva atomica; ultima reserva: $MAXR). 'ultimo arquivo + 1' colide entre checkouts (medido 10/09: PRD-140 e PRD-141 na mesma 0193). Reserve e use o numero devolvido:
  bash .claude/hooks/harness-worktree.sh reservar MIG     # imprime SEQ|MIG|<numero livre>"
