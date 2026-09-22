#!/usr/bin/env bash
# .claude/hooks/harness-worktree.sh (3.4.0)
# WORKTREES ISOLADOS — varias sessoes no MESMO projeto sem sujar o git uma da outra.
#
# Problema (Charles, 23/08/2026): 2-3 sessoes no mesmo checkout => working tree sujo cruzado,
# review que ve diff alheio, E2E que quebra porque outra sessao mexeu no banco/tela.
# Solucao: cada sessao trabalha num `git worktree` proprio (branch + pasta), com BANCO CLONADO
# e URL propria — e um registro de LOCKS compartilhado (no .git comum) para duas sessoes nao
# pegarem o mesmo DT/PRD.
#
# GENERICO POR DECLARACAO (nada do projeto e hardcoded aqui). O hook le:
#   Perfil (.claude/PERFIL-PROJETO.md): Database, Host, Usuario, Senha, Comando de smoke test
#     (o cliente de banco e o 1o token), Base URL local, Base URL da API.
#   harness.env (ver secao WORKTREES):
#     HARNESS_WT_COPIAR        csv de arquivos GITIGNORED a copiar p/ o worktree ("src" ou "src:dst")
#     HARNESS_WT_DB            clone | compartilhado | off
#     HARNESS_WT_DB_OVERRIDE_FILE + HARNESS_WT_DB_OVERRIDE_TPL  arquivo (gitignored) que o app le
#                              para achar o banco, gerado com {db} {host} {user} {pass} {rotulo} {url}
#     HARNESS_WT_OVERRIDES     N overrides (DT-502): csv 'arquivo=VAR_TPL' — VAR_TPL e outra
#                              variavel com o template ({db} {url} {api} {rotulo} {porta}...).
#                              Para TODO arquivo gitignored que embute URL/banco (ex.: env.js
#                              do front) — copia crua apontaria para a arvore principal.
#     HARNESS_WT_ENV_MAP       csv "CHAVE={db|url|api|rotulo|porta}" anexado ao .env do worktree
#     HARNESS_WT_URL_MODE      pasta (Laragon/MAMP: http://host/<pasta>/) | porta (dev server: base+N)
#     HARNESS_WT_PORT_BASE     porta base no modo porta (default 3100)
#
# USO
#   bash .claude/hooks/harness-worktree.sh novo <rotulo> [--sem-banco]
#   bash .claude/hooks/harness-worktree.sh lista
#   bash .claude/hooks/harness-worktree.sh info                 # do worktree ATUAL (1 linha WT|...)
#   bash .claude/hooks/harness-worktree.sh lock <ID> [--por <rotulo>] | unlock <ID> | locks
#   bash .claude/hooks/harness-worktree.sh fechar <rotulo> [--merge] [--manter-banco]
#   bash .claude/hooks/harness-worktree.sh reservar <DT|LOTE|PRD|MIG> [--qtd N]   # numero atomico (3.4.2; faixa por dev 3.5.0)
#   bash .claude/hooks/harness-worktree.sh faixa                                   # a faixa deste dev por serie (3.5.0)
#
# SAIDA (stdout): linhas WT|<campo>|<valor>; erros em stderr, exit != 0.
# NUNCA faz push. `fechar --merge` faz merge LOCAL na branch principal (fast-forward ou merge
# commit) — o push continua humano.

set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$ROOT" || exit 2
# 3.4.2: chaves PESSOAIS por maquina, validas para todos os projetos (o Claude Desktop nao herda setx
# feito depois de aberto): ~/.harness.env.local (chmod 600). Nunca versionado. Precedencia: env > user > projeto.
# 3.5.7: camadas de configuracao — hooks/_env.sh carrega _defaults.env -> harness.env -> harness.env.local -> ~/.harness.env.local
# (ambiente da sessao vence). Antes cada hook tinha o proprio loop.
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_env.sh"
log() { printf '[worktree] %s\n' "$*" >&2; }
die() { log "$*"; exit 1; }
command -v git >/dev/null || die "git ausente"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "nao e um repo git"
COMMON="$(git rev-parse --git-common-dir)"; case "$COMMON" in /*|[A-Za-z]:*) : ;; *) COMMON="$ROOT/$COMMON" ;; esac
LOCKS="$COMMON/harness-locks"; mkdir -p "$LOCKS" 2>/dev/null
MAIN_ROOT="$(cd "$COMMON/.." 2>/dev/null && pwd)"   # checkout principal (onde mora o .git)
# 3.5.4: PASTA DOS DTs por projeto — o sagittarius guarda em prds/dt e o `reservar DT` lia prds/debito_tecnico fixo:
# devolveu SEQ 1 e 2 em vez de 217/218 e deixou marcadores errados no .git (medido 14/09). HARNESS_DTS_DIR (relativo
# a raiz) vence; senao a 1a pasta conhecida que tiver INDEX.md. Sem nenhuma => o chamador decide (reservar DT/LOTE morre
# sem consumir numero).
dts_dir() { # $1 = raiz -> imprime caminho relativo; 1 = nao achou
  local _r="$1" _d
  if [ -n "${HARNESS_DTS_DIR:-}" ]; then _d="${HARNESS_DTS_DIR#/}"; _d="${_d%/}"; [ -f "$_r/$_d/INDEX.md" ] && { printf '%s' "$_d"; return 0; }; fi
  for _d in prds/debito_tecnico prds/dt prds/dts prds/debitos; do [ -f "$_r/$_d/INDEX.md" ] && { printf '%s' "$_d"; return 0; }; done
  return 1
}
REPO="$(basename "$MAIN_ROOT")"
PERFIL="$MAIN_ROOT/.claude/PERFIL-PROJETO.md"

perfil_campo() { # $1 = rotulo da linha (regex) -> valor da 2a coluna, sem crases
  awk -v r="$1" -F'|' '$2 ~ "\\*\\*" r "\\*\\*" { v=$3; gsub(/^[ \t]+|[ \t]+$/, "", v); gsub(/`/, "", v); print v; exit }' "$PERFIL" 2>/dev/null
}
DB_NAME="$(perfil_campo 'Database')"; DB_HOST="$(perfil_campo 'Host')"; DB_USER="$(perfil_campo 'Usu.?.?rio')"; DB_PASS="$(perfil_campo 'Senha')"
SMOKE="$(perfil_campo 'Comando de smoke test')"; DB_CLI="${SMOKE%% *}"
URL_BASE="$(perfil_campo 'Base URL local')"; URL_API="$(perfil_campo 'Base URL da API')"
case "$DB_NAME" in *'<'*|'') DB_NAME="" ;; esac
case "$URL_BASE" in *'<'*) URL_BASE="" ;; esac

WT_DIR_DE() { printf '%s/%s--wt-%s' "$(dirname "$MAIN_ROOT")" "$REPO" "$1"; }
SAFE() { printf '%s' "$1" | tr -c 'A-Za-z0-9_-' '_'; }
DB_DE() { printf '%s_wt_%s' "$DB_NAME" "$(SAFE "$1" | tr 'A-Z-' 'a-z_' | cut -c1-20)"; }
PORTA_DE() { local base="${HARNESS_WT_PORT_BASE:-3100}" n; n="$(git worktree list --porcelain | grep -c '^worktree ')"; echo $(( base + n )); }

url_wt() { # $1 = url  $2 = rotulo  $3 = porta
  local u="$1"
  case "${HARNESS_WT_URL_MODE:-pasta}" in
    porta) printf '%s' "$u" | sed -E "s#(https?://[^/:]+)(:[0-9]+)?#\1:$3#" ;;
    *)     printf '%s' "$u" | sed "s#/$REPO/#/$REPO--wt-$2/#; s#/$REPO\$#/$REPO--wt-$2#" ;;
  esac
}

CMD="${1:-}"; shift || true

# apontar_app: grava o override/.env que o APP le, para um banco/url dados (usado por `novo`
# e por `apontar` — o modo CLOUD do noturno, onde nao ha worktree: o checkout do runner ja e
# isolado e o banco e EXTERNO, declarado por variaveis de ambiente).
apontar_app() { # $1 = dir  $2 = rotulo  $3 = db  $4 = url  $5 = api  $6 = porta  [$7 host $8 user $9 pass]
  local WT="$1" ROT="$2" DBWT="$3" URL="$4" API="$5" PORTA="$6" H="${7:-${DB_HOST:-localhost}}" U="${8:-$DB_USER}" P="${9:-$DB_PASS}"
  if [ -n "${HARNESS_WT_DB_OVERRIDE_FILE:-}" ] && [ -n "${HARNESS_WT_DB_OVERRIDE_TPL:-}" ]; then
    mkdir -p "$(dirname "$WT/$HARNESS_WT_DB_OVERRIDE_FILE")"
    printf '%s\n' "$HARNESS_WT_DB_OVERRIDE_TPL" | sed "s|{db}|$DBWT|g; s|{host}|$H|g; s|{user}|$U|g; s|{pass}|$P|g; s|{rotulo}|$ROT|g; s|{url}|$URL|g; s|{porta}|$PORTA|g" > "$WT/$HARNESS_WT_DB_OVERRIDE_FILE"
    printf 'WT|override|%s\n' "$HARNESS_WT_DB_OVERRIDE_FILE"
  fi
  # N overrides por declaracao (DT-502, 25/08): HARNESS_WT_OVERRIDES='arquivo=VAR_TPL,arquivo2=VAR2'
  # — cada VAR_TPL e OUTRA variavel do harness.env com o conteudo-template (placeholders {db}
  # {host} {user} {pass} {rotulo} {url} {api} {porta}). Motivo: so havia UM par (conexao.local.php)
  # e o env.js gitignored do front nascia AUSENTE na worktree — e copia-lo cru apontaria o
  # navegador para a API/banco da arvore PRINCIPAL (falha silenciosa: tela funciona, dado vai
  # para o banco errado). Regra: config gitignored com URL/banco = template, nunca copia crua.
  if [ -n "${HARNESS_WT_OVERRIDES:-}" ]; then
    local OLDIFS2="$IFS" par arq varn tpl; IFS=','
    for par in $HARNESS_WT_OVERRIDES; do IFS="$OLDIFS2"
      arq="${par%%=*}"; varn="${par#*=}"
      tpl="$(eval "printf '%s' \"\${$varn:-}\"")"
      if [ -n "$arq" ] && [ -n "$tpl" ]; then
        mkdir -p "$(dirname "$WT/$arq")"
        printf '%s\n' "$tpl" | sed "s|{db}|$DBWT|g; s|{host}|$H|g; s|{user}|$U|g; s|{pass}|$P|g; s|{rotulo}|$ROT|g; s|{url}|$URL|g; s|{api}|$API|g; s|{porta}|$PORTA|g" > "$WT/$arq"
        printf 'WT|override|%s\n' "$arq"
      else
        printf 'WT|override-IGNORADO|%s (template %s vazio ou par malformado)\n' "$arq" "$varn"
      fi
    IFS=','; done; IFS="$OLDIFS2"
  fi
  if [ -n "${HARNESS_WT_ENV_MAP:-}" ]; then
    { printf '\n# --- harness worktree %s (gerado por harness-worktree.sh) ---\n' "$ROT"
      local OLDIFS="$IFS" kv k v; IFS=','; for kv in $HARNESS_WT_ENV_MAP; do IFS="$OLDIFS"; k="${kv%%=*}"; v="${kv#*=}"
        v="$(printf '%s' "$v" | sed "s|{db}|$DBWT|g; s|{url}|$URL|g; s|{api}|$API|g; s|{rotulo}|$ROT|g; s|{porta}|$PORTA|g; s|{host}|$H|g; s|{user}|$U|g; s|{pass}|$P|g")"
        printf '%s=%s\n' "$(printf '%s' "$k" | tr -d ' ')" "$v"; IFS=','; done; IFS="$OLDIFS"
    } >> "$WT/.env"; printf 'WT|env|.env (+%s chaves)\n' "$(printf '%s' "$HARNESS_WT_ENV_MAP" | tr ',' '\n' | grep -c .)"
  fi
  mkdir -p "$WT/.claude/.harness-run"; [ -f "$WT/.claude/.harness-run/.gitignore" ] || printf '*\n' > "$WT/.claude/.harness-run/.gitignore"
  printf 'rotulo=%s\ndir=%s\ndb=%s\ndb_host=%s\ndb_user=%s\nurl=%s\napi=%s\nporta=%s\ncriado=%s\n' \
    "$ROT" "$WT" "$DBWT" "$H" "$U" "$URL" "$API" "$PORTA" "$(date -Iseconds 2>/dev/null || date)" > "$WT/.claude/.harness-run/worktree.env"
}

case "$CMD" in
  apontar)
    # MODO CLOUD (3.4.1): sem worktree — aponta ESTE checkout para um banco EXTERNO declarado
    # por variaveis (CI variables): HARNESS_DB_EXT_HOST/USER/PASS/NAME e HARNESS_URL_EXT.
    #   bash .claude/hooks/harness-worktree.sh apontar <rotulo>
    ROT="$(SAFE "${1:-cloud}")"
    [ -n "${HARNESS_DB_EXT_NAME:-}" ] || die "apontar: declare HARNESS_DB_EXT_NAME (e HOST/USER/PASS) no ambiente"
    URL="${HARNESS_URL_EXT:-$URL_BASE}"; API="${HARNESS_API_EXT:-$URL_API}"
    apontar_app "$ROOT" "$ROT" "$HARNESS_DB_EXT_NAME" "$URL" "$API" "0" "${HARNESS_DB_EXT_HOST:-localhost}" "${HARNESS_DB_EXT_USER:-$DB_USER}" "${HARNESS_DB_EXT_PASS:-$DB_PASS}"
    printf 'WT|banco|%s@%s (externo)\nWT|url|%s\n' "$HARNESS_DB_EXT_NAME" "${HARNESS_DB_EXT_HOST:-localhost}" "$URL"
    exit 0 ;;

  info)
    WTENV="$ROOT/.claude/.harness-run/worktree.env"
    if [ -f "$WTENV" ]; then cat "$WTENV" | sed 's/^/WT|/; s/=/|/'; else printf 'WT|rotulo|principal\nWT|db|%s\nWT|url|%s\n' "$DB_NAME" "$URL_BASE"; fi
    exit 0 ;;

  lista)
    git worktree list --porcelain | awk '/^worktree /{w=$2} /^branch /{print "WT|" w "|" $2}'
    for l in "$LOCKS"/*.lock; do [ -f "$l" ] && printf 'LOCK|%s|%s\n' "$(basename "$l" .lock)" "$(cat "$l")"; done
    exit 0 ;;

  locks)
    for l in "$LOCKS"/*.lock; do [ -f "$l" ] && printf 'LOCK|%s|%s\n' "$(basename "$l" .lock)" "$(cat "$l")"; done; exit 0 ;;

  doctor)
    # FAXINA (3.4.3): residuos que o modo worktree pode deixar — worktree parado, banco _wt_
    # orfao, lock preso. Read-only por default; --limpar remove SO banco orfao e lock morto
    # (worktree parado nunca e removido sozinho: pode ter trabalho — decisao humana).
    LIMPAR=0; [ "${1:-}" = "--limpar" ] && LIMPAR=1
    ACHOU=0
    # projeto sem declaracao de worktree (3.4.5): o 'novo' recusa criar — avisar aqui
    [ -z "${HARNESS_WT_DB:-}" ] && printf 'DOCTOR|wt-sem-declaracao||HARNESS_WT_DB ausente no harness.env — "novo" recusa criar worktree ate o projeto declarar a secao WORKTREES (clone|compartilhado|off + overrides)\n'
    # 3.5.7 (E7): @playwright/test declarado e nao instalado — no principal e em cada worktree (link quebrado ou ausente)
    if [ -f "$MAIN_ROOT/package.json" ] && grep -q '"@playwright/test"' "$MAIN_ROOT/package.json" 2>/dev/null; then
      [ -d "$MAIN_ROOT/node_modules/@playwright/test" ] || printf 'DOCTOR|node_modules-ausente|%s|@playwright/test declarado no package.json e ausente — npm i --no-save no principal (o "novo" faz sozinho desde a 3.5.7)\n' "$MAIN_ROOT"
      git worktree list --porcelain | awk '/^worktree /{print $2}' | while read -r w; do
        [ "$w" = "$MAIN_ROOT" ] && continue
        [ -d "$w/node_modules/@playwright/test" ] || printf 'DOCTOR|node_modules-ausente|%s|worktree sem @playwright/test (link node_modules ausente/quebrado) — specs vao falhar com "Cannot find module"\n' "$w"
      done
    fi
    # worktrees parados (> 48h sem commit/mtime)
    git worktree list --porcelain | awk '/^worktree /{print $2}' | while read -r w; do
      [ "$w" = "$MAIN_ROOT" ] && continue
      TS="$(git -C "$w" log -1 --format=%ct 2>/dev/null || echo 0)"
      M="$(stat -c %Y "$w" 2>/dev/null || echo 0)"; [ "$M" -gt "$TS" ] && TS="$M"
      IDADE=$(( ( $(date +%s) - TS ) / 3600 ))
      [ "$IDADE" -ge 48 ] && printf 'DOCTOR|worktree-parado|%s|%sh sem atividade — fechar com "harness-worktree.sh fechar %s [--merge]"\n' "$w" "$IDADE" "$(basename "$w" | sed "s/^$REPO--wt-//")"
    done
    # bancos _wt_ sem worktree correspondente
    if [ -n "$DB_NAME" ] && [ -n "$DB_CLI" ]; then
      "$DB_CLI" -h "${DB_HOST:-localhost}" -u "$DB_USER" -p"$DB_PASS" -N -e "SHOW DATABASES LIKE '${DB_NAME}\_wt\_%';" 2>/dev/null | tr -d '\r' | while read -r db; do
        # tr acima: mysql no Windows emite CRLF — o \r no rotulo fazia banco VIVO parecer
        # orfao (24/08: doctor sugeriu --limpar para o clone das sessoes sweep-a/ux EM VOO)
        rot="${db#"${DB_NAME}"_wt_}"
        TEM=0
        for wdir in "$(dirname "$MAIN_ROOT")/$REPO--wt-"*; do
          [ -d "$wdir" ] || continue
          wrot="$(basename "$wdir" | sed "s/^$REPO--wt-//" | tr 'A-Z-' 'a-z_' | cut -c1-20)"
          [ "$wrot" = "$rot" ] && { TEM=1; break; }
        done
        [ "$TEM" = 1 ] && continue
        if [ "$LIMPAR" = 1 ]; then
          "$DB_CLI" -h "${DB_HOST:-localhost}" -u "$DB_USER" -p"$DB_PASS" -e "DROP DATABASE IF EXISTS \`$db\`;" 2>/dev/null && printf 'DOCTOR|banco-orfao-REMOVIDO|%s\n' "$db"
        else printf 'DOCTOR|banco-orfao|%s|sem worktree correspondente — "doctor --limpar" remove\n' "$db"; fi
      done
    fi
    # locks presos (> 24h, ou cujo worktree/checkout do dono nao existe mais)
    NOW_E="$(date +%s)"   # uma vez — cada fork custa segundos sob carga (24/08: doctor a 100s+)
    for l in "$LOCKS"/*.lock; do
      [ -f "$l" ] || continue
      DONO="$(cut -d'|' -f1 "$l")"; IDADE=$(( ( NOW_E - $(stat -c %Y "$l") ) / 3600 ))
      MORTO=0
      case "$DONO" in "$REPO"--wt-*) [ -d "$(dirname "$MAIN_ROOT")/$DONO" ] || MORTO=1 ;; esac
      [ "$IDADE" -ge 24 ] && MORTO=1
      if [ "$MORTO" = 1 ]; then
        if [ "$LIMPAR" = 1 ]; then rm -f "$l" && printf 'DOCTOR|lock-preso-REMOVIDO|%s\n' "$(basename "$l" .lock)"
        else printf 'DOCTOR|lock-preso|%s|dono %s, %sh — "doctor --limpar" libera\n' "$(basename "$l" .lock)" "$DONO" "$IDADE"; fi
      fi
    done
    # 3.5.6 (D2): reservas de numero em nome de checkout que NAO existe mais (worktree fechada sem transferir — anteriores
    # a 3.5.6 — ou apagada a mao). O guard-migration adota na hora da escrita; aqui so LISTA (decisao humana: --limpar nao mexe).
    _WTS="$(git worktree list --porcelain 2>/dev/null | awk '/^worktree /{sub(/^worktree /, ""); n=split($0, p, "[\\\\/]"); print p[n]}')"
    for d in "$LOCKS"/seq/*/; do
      [ -f "$d/dono" ] || continue
      _dn="$(cut -d'|' -f1 "$d/dono")"
      [ -z "$_dn" ] || [ "$_dn" = "$REPO" ] && continue
      printf '%s\n' "$_WTS" | grep -qxF "$_dn" && continue
      printf 'DOCTOR|reserva-orfa|%s|dono %s (checkout inexistente) — o proximo Write da migration/DT adota (guard 3.5.6); "fechar" transfere\n' "$(basename "$d")" "$_dn"
    done
    # sessoes claude OCIOSAS (24/08 — zumbis; 3.4.21 — sessoes.mjs): abas fechadas nao matam o
    # processo — mediu-se 35 processos claude (2 com 600-1500 min de CPU) em 25/08 e 6 sessoes
    # vivas (3 desde a manha) em 04/09. O doctor LISTA e entrega o comando pronto; fechar e
    # decisao do dev (node .claude/hooks/sessoes.mjs --fechar [--pid N]) — o transcript fica em
    # ~/.claude/projects e a sessao segue retomavel (`claude --resume <id>`); arquivar aba no
    # Desktop e que perde o rastreio. Limiar: HARNESS_SESSAO_OCIOSA_MIN (default 120 min).
    if [ -f "$SCRIPT_DIR/sessoes.mjs" ] && command -v "${HARNESS_RAG_NODE:-node}" >/dev/null 2>&1; then
      "${HARNESS_RAG_NODE:-node}" "$SCRIPT_DIR/sessoes.mjs" --doctor 2>/dev/null | tr -d '\r' | grep '^DOCTOR|' || true
    fi
    exit 0 ;;

  lock)
    # LOTE (24/08): aceita N IDs numa invocacao so — cada chamada paga o setup inteiro do
    # script (~2-20s no Git Bash sob carga) e o /dt-exec travava 15 DTs um a um: minutos de
    # burocracia serial medidos nas sessoes sweep-a/ux. Exit 3 se QUALQUER um ja era de outro.
    [ -n "${1:-}" ] || die "lock <ID> [ID2 ...] [--por <dono>]"
    IDS=""; while [ -n "${1:-}" ] && [ "$1" != "--por" ]; do IDS="$IDS $1"; shift; done
    POR="$(basename "$ROOT")"; [ "${1:-}" = "--por" ] && POR="${2:-$POR}"
    TS="$(date -Iseconds 2>/dev/null || date)"; DONO="${USER:-${USERNAME:-dev}}@$(hostname | cut -d. -f1)"
    RC=0
    for ID in $IDS; do
      L="$LOCKS/$(SAFE "$ID").lock"
      if [ -f "$L" ] && ! grep -q "^$POR|" "$L"; then printf 'LOCK|ocupado|%s|%s\n' "$ID" "$(cat "$L")"; RC=3; continue; fi
      printf '%s|%s|%s\n' "$POR" "$TS" "$DONO" > "$L"
      printf 'LOCK|ok|%s|%s\n' "$ID" "$POR"
    done
    exit "$RC" ;;

  unlock)
    [ -n "${1:-}" ] || die "unlock <ID> [ID2 ...]"
    for ID in "$@"; do rm -f "$LOCKS/$(SAFE "$ID").lock"; printf 'LOCK|livre|%s\n' "$ID"; done; exit 0 ;;

  reservar)
    # NUMERACAO ATOMICA ENTRE WORKTREES (DT-002 do mestre, 01/09/2026): cada sessao numerava
    # LOTE/DT novo com max(INDEX local)+1 — em worktree o INDEX e o snapshot do fork, e duas
    # sessoes paralelas alocaram o MESMO numero (dois LOTE-037 e dois DT-541/542 no Mariana).
    # Reserva via mkdir (atomico) no .git COMUM ($LOCKS/seq), visivel a todos os worktrees e
    # ao checkout principal. Numeros reservados NUNCA sao devolvidos — buraco na serie e ok,
    # colisao nao e. A reserva manual (prd-reserva-numeros.md) fica aposentada por isto.
    #   bash .claude/hooks/harness-worktree.sh reservar <DT|LOTE|PRD|MIG> [--qtd N] [--por <dono>]
    #   3.4.33: serie MIG = migrations (arquivos NNNN_* na pasta HARNESS_MIGRATIONS_DIR ou a 1a pasta "migrations" do repo);
    #   SEQ|MIG|0194 sai com zero a esquerda na largura dos arquivos existentes. Medido 10/09: PRD-140 e PRD-141 (worktree)
    #   planejaram a mesma 0193 — 5a colisao de migration seguida; a reserva atomica cobria DT/LOTE/PRD e nao migration.
    # Saida: uma linha SEQ|<serie>|<numero> por reserva. Sufixos de fatia (-b/-c) NAO passam
    # por aqui: derivam do numero da mae e nao consomem numero da serie.
    #   3.5.0: FAIXA POR DEV (hooks/_seq.sh). A reserva no .git comum so alcanca os checkouts DESTA maquina;
    #   entre devs, dois PRD-142 nasciam em maquinas diferentes e so se encontravam no merge. Agora cada dev
    #   tem um bloco por serie (e-mail git -> bloco; ver HARNESS_SEQ_FAIXAS): o piso e o maior numero visto
    #   DENTRO da faixa deste dev e o teto e o fim dela. Numero de outra faixa nao entra no piso. MIG nunca
    #   usa faixa (precisa de ordem de criacao): HARNESS_MIG_NUMERACAO='timestamp' numera por instante.
    SERIE="$(printf '%s' "${1:-}" | tr 'a-z' 'A-Z')"; shift || true
    case "$SERIE" in DT|LOTE|PRD|MIG) : ;; *) die "reservar <DT|LOTE|PRD|MIG> [--qtd N] [--por <dono>]" ;; esac
    QTD=1; POR="$(basename "$ROOT")"
    while [ -n "${1:-}" ]; do case "$1" in
      --qtd) QTD="${2:-1}"; shift 2 ;;
      --por) POR="${2:-$POR}"; shift 2 ;;
      *) shift ;;
    esac; done
    case "$QTD" in ''|*[!0-9]*|0) QTD=1 ;; esac
    SEQD="$LOCKS/seq"; mkdir -p "$SEQD"
    TS="$(date -Iseconds 2>/dev/null || date)"; DONO="${USER:-${USERNAME:-dev}}@$(hostname | cut -d. -f1)"
    # 3.5.0: MIG por TIMESTAMP (HARNESS_MIG_NUMERACAO='timestamp') — YYYYMMDDHHMMSS: ordem de criacao entre
    # devs sem coordenacao, nunca renumera; unicidade no mesmo segundo garantida pela reserva (mkdir atomico).
    # O runner do projeto precisa aplicar por NOME em ordem lexicografica aceitando prefixo de 14 digitos
    # (ver ONBOARDING 3.5.0 — o glob [0-9][0-9][0-9][0-9]_ de 4 digitos fixos NAO enxerga o arquivo).
    if [ "$SERIE" = MIG ] && [ "${HARNESS_MIG_NUMERACAO:-seq}" = "timestamp" ]; then
      FEITAS=0; TENT=0
      while [ "$FEITAS" -lt "$QTD" ]; do
        TSN="$(date +%Y%m%d%H%M%S)"
        if mkdir "$SEQD/MIG-$TSN" 2>/dev/null; then
          printf '%s|%s|%s\n' "$POR" "$TS" "$DONO" > "$SEQD/MIG-$TSN/dono" 2>/dev/null || true
          printf 'SEQ|MIG|%s\n' "$TSN"; FEITAS=$(( FEITAS + 1 ))
        fi
        TENT=$(( TENT + 1 )); [ "$TENT" -gt 90 ] && die "reservar MIG (timestamp): 90 tentativas — investigue $SEQD"
        [ "$FEITAS" -lt "$QTD" ] && sleep 1
      done
      exit 0
    fi
    # Piso: maior numero ja visto no INDEX **do checkout principal** + arquivos em disco la
    # + reservas ja feitas. grep -oE '<serie>-[0-9]+' ignora sufixo de fatia por construcao.
    MAX=0
    case "$SERIE" in
      DT|LOTE)
        # 3.5.4: pasta resolvida (dts_dir); sem INDEX.md em pasta nenhuma o piso seria 0 e a reserva devolveria DT-1 — morre antes.
        DTSD="$(dts_dir "$MAIN_ROOT")" || die "reservar $SERIE: pasta de DTs nao encontrada em $MAIN_ROOT (prds/debito_tecnico | prds/dt | prds/dts com INDEX.md). Declare HARNESS_DTS_DIR='<pasta relativa>' no .claude/harness.env do projeto. Nada foi reservado."
        if [ "$SERIE" = DT ]; then
          VISTOS="$( { grep -hoE 'DT-[0-9]+' "$MAIN_ROOT/$DTSD/INDEX.md" 2>/dev/null; ls "$MAIN_ROOT/$DTSD" 2>/dev/null | grep -oE '^DT-[0-9]+'; } )"
        else
          VISTOS="$( { grep -hoE 'LOTE-[0-9]+' "$MAIN_ROOT/$DTSD/INDEX.md" 2>/dev/null; ls "$MAIN_ROOT/$DTSD/lotes" 2>/dev/null | grep -oE '^LOTE-[0-9]+'; } )"
        fi ;;
      PRD)  VISTOS="$( { grep -hoE 'PRD-[0-9]+' "$MAIN_ROOT/prds/INDEX.md" 2>/dev/null; ls "$MAIN_ROOT/prds" 2>/dev/null | grep -oE '^PRD-[0-9]+'; } )" ;;
      MIG)  MIGDIR="${HARNESS_MIGRATIONS_DIR:-}"; case "$MIGDIR" in ""|/*|[A-Za-z]:*) : ;; *) MIGDIR="$MAIN_ROOT/$MIGDIR" ;; esac
            [ -n "$MIGDIR" ] || MIGDIR="$(find "$MAIN_ROOT" -type d -name migrations -not -path '*/node_modules/*' -not -path '*/vendor/*' -not -path '*/.claude/*' 2>/dev/null | head -1)"
            VISTOS="$(ls "$MIGDIR" 2>/dev/null | grep -oE '^[0-9]{3,5}' | sed 's/^/MIG-/')"
            MIGW="$(ls "$MIGDIR" 2>/dev/null | grep -oE '^[0-9]{3,5}' | head -1 | tr -d '
' | wc -c | tr -d ' ')"; [ "${MIGW:-0}" -ge 3 ] 2>/dev/null || MIGW=4 ;;
    esac
    # 10#: numeros de INDEX vem com zero a esquerda (DT-010) e a aritmetica do bash os leria
    # como OCTAL (010=8) — piso errado por silencio. Base decimal forcada, sempre.
    # 3.5.0: com faixa, so numeros DENTRO da faixa [INI,FIM] deste dev entram no piso; sem faixa
    # (serie unica, HARNESS_SEQ_FAIXAS=off, MIG, serie fora de HARNESS_SEQ_FAIXAS_SERIES) tudo entra.
    # shellcheck disable=SC1091
    [ -f "$SCRIPT_DIR/_seq.sh" ] && . "$SCRIPT_DIR/_seq.sh"
    FAIXAS=""; command -v harness_seq_faixa >/dev/null 2>&1 && FAIXAS="$(harness_seq_faixa "$SERIE" "$MAIN_ROOT")"
    [ -n "$FAIXAS" ] || FAIXAS="1|999999999|-|-"
    VISTOS_N="$( { printf '%s\n' "$VISTOS" | grep -oE '[0-9]+$'; for d in "$SEQD/$SERIE-"*; do [ -d "$d" ] || continue; n="${d##*-}"; case "$n" in ''|*[!0-9]*) continue ;; esac; [ "${#n}" -le 9 ] || continue; printf '%s\n' "$n"; done; } | sort -n | uniq)"   # >9 digitos = reserva de timestamp (MIG), fora da serie
    FEITAS=0
    while IFS='|' read -r INI FIM BLOCO CHAVE; do
      [ -n "$INI" ] || continue
      [ "$FEITAS" -ge "$QTD" ] && break
      MAX=$(( INI - 1 ))
      for n in $VISTOS_N; do n=$((10#$n)); [ "$n" -ge "$INI" ] && [ "$n" -le "$FIM" ] && [ "$n" -gt "$MAX" ] && MAX="$n"; done
      N="$MAX"; TETO=$(( MAX + 500 )); [ "$TETO" -gt "$FIM" ] && TETO="$FIM"
      while [ "$FEITAS" -lt "$QTD" ] && [ "$N" -lt "$TETO" ]; do
        N=$(( N + 1 ))
        if mkdir "$SEQD/$SERIE-$N" 2>/dev/null; then
          printf '%s|%s|%s\n' "$POR" "$TS" "$DONO" > "$SEQD/$SERIE-$N/dono" 2>/dev/null || true
          NP="$N"; [ "$SERIE" = MIG ] && NP="$(printf "%0${MIGW:-4}d" "$N")"   # 3.4.33: migration sai com zero a esquerda
          printf 'SEQ|%s|%s\n' "$SERIE" "$NP"
          FEITAS=$(( FEITAS + 1 ))
        fi
      done
      [ "$FEITAS" -lt "$QTD" ] && [ "$BLOCO" != "-" ] && log "faixa da serie $SERIE (bloco $BLOCO, $INI-$FIM) ESGOTADA para $CHAVE — tentando o proximo bloco declarado"
    done <<EOT
$FAIXAS
EOT
    [ "$FEITAS" -ge "$QTD" ] || die "reservar: sem numero livre na serie $SERIE — faixa(s) esgotada(s) ou 500 tentativas sem sucesso. Declare outro bloco para este dev em HARNESS_SEQ_FAIXAS/HARNESS_SEQ_FAIXAS_EXTRA (bash .claude/hooks/harness-worktree.sh faixa) ou investigue $SEQD"
    exit 0 ;;

  faixa)
    # 3.5.0: a faixa deste dev por serie (o doctor e o humano leem daqui). Saida:
    #   FAIXA|<serie>|<chave>|bloco=<k>|<ini>-<fim>|proximo=<n>     (uma por bloco declarado)
    #   FAIXA|MIG|modo=<seq|timestamp>
    #   FAIXA|tabela|<chave>=<bloco>                                 (tabela em vigor, uma por entrada)
    # shellcheck disable=SC1091
    [ -f "$SCRIPT_DIR/_seq.sh" ] && . "$SCRIPT_DIR/_seq.sh" || die "hooks/_seq.sh ausente"
    SEQD="$LOCKS/seq"
    for S in PRD DT LOTE; do
      FX="$(harness_seq_faixa "$S" "$MAIN_ROOT" 2>/dev/null)"
      if [ -z "$FX" ]; then printf 'FAIXA|%s|serie-unica\n' "$S"; continue; fi
      case "$S" in
        DT)   DTSD="$(dts_dir "$MAIN_ROOT" 2>/dev/null || printf 'prds/debito_tecnico')"   # 3.5.4
              VS="$( { grep -hoE 'DT-[0-9]+' "$MAIN_ROOT/$DTSD/INDEX.md" 2>/dev/null; ls "$MAIN_ROOT/$DTSD" 2>/dev/null | grep -oE '^DT-[0-9]+'; } | grep -oE '[0-9]+$')" ;;
        LOTE) DTSD="$(dts_dir "$MAIN_ROOT" 2>/dev/null || printf 'prds/debito_tecnico')"   # 3.5.4
              VS="$( { grep -hoE 'LOTE-[0-9]+' "$MAIN_ROOT/$DTSD/INDEX.md" 2>/dev/null; ls "$MAIN_ROOT/$DTSD/lotes" 2>/dev/null | grep -oE '^LOTE-[0-9]+'; } | grep -oE '[0-9]+$')" ;;
        PRD)  VS="$( { grep -hoE 'PRD-[0-9]+' "$MAIN_ROOT/prds/INDEX.md" 2>/dev/null; ls "$MAIN_ROOT/prds" 2>/dev/null | grep -oE '^PRD-[0-9]+'; } | grep -oE '[0-9]+$')" ;;
      esac
      for d in "$SEQD/$S-"*; do [ -d "$d" ] || continue; n="${d##*-}"; case "$n" in ''|*[!0-9]*) continue ;; esac; VS="$VS
$n"; done
      printf '%s\n' "$FX" | while IFS='|' read -r INI FIM BLOCO CHAVE; do
        [ -n "$INI" ] || continue
        MAX=$(( INI - 1 )); for n in $VS; do n=$((10#$n)); [ "$n" -ge "$INI" ] && [ "$n" -le "$FIM" ] && [ "$n" -gt "$MAX" ] && MAX="$n"; done
        printf 'FAIXA|%s|%s|bloco=%s|%s-%s|proximo=%s\n' "$S" "$CHAVE" "$BLOCO" "$INI" "$FIM" "$(( MAX + 1 ))"
      done
    done
    printf 'FAIXA|MIG|modo=%s\n' "${HARNESS_MIG_NUMERACAO:-seq}"
    harness_seq_tabela | sed 's/^/FAIXA|tabela|/'
    ID="$(harness_seq_identidade "$MAIN_ROOT")"; printf 'FAIXA|identidade|%s\n' "${ID:-sem-email-git}"
    # dev sem faixa (fora da tabela, ou sem e-mail git) => linha de aviso em stdout (o doctor le daqui)
    if [ "${HARNESS_SEQ_FAIXAS:-}" != "off" ]; then
      if [ -z "$ID" ]; then printf 'FAIXA|aviso|git config user.email VAZIO — reservas caem no bloco 0 (serie compartilhada)\n'
      elif ! harness_seq_tabela | grep -q "^$ID="; then printf 'FAIXA|aviso|%s NAO esta na tabela de faixas — reservas caem no bloco 0 (serie compartilhada); declare HARNESS_SEQ_FAIXAS_EXTRA=%s=<bloco livre>\n' "$ID" "$ID"; fi
    fi
    exit 0 ;;

  novo)
    ROT="$(SAFE "${1:-}")"; [ -n "$ROT" ] || die "novo <rotulo>"; shift
    SEM_BANCO=0; [ "${1:-}" = "--sem-banco" ] && SEM_BANCO=1
    # SAFE-BY-DEFAULT (3.4.5, pre-propagacao): projeto SEM declaracao de worktree no
    # harness.env criaria worktree com BANCO COMPARTILHADO e app apontando para a arvore
    # principal — a classe de acidente do DT-502 (tela funciona, dado vai pro lugar
    # errado, em silencio). Sem HARNESS_WT_DB declarado, este hook RECUSA criar; o dev
    # declara conscientemente ('clone' | 'compartilhado' | 'off') apos preencher as
    # chaves do projeto (ver secao WORKTREES do harness.env e o Perfil).
    if [ -z "${HARNESS_WT_DB:-}" ] && [ "$SEM_BANCO" != "1" ]; then
      die "worktree NAO criado: este projeto nao declarou HARNESS_WT_DB no .claude/harness.env.
  Declare conscientemente (e as chaves da secao WORKTREES — override de conexao, env.js/URL,
  HARNESS_WT_ENV_MAP...):
    HARNESS_WT_DB='clone'          # cada worktree com banco proprio (recomendado)
    HARNESS_WT_DB='compartilhado'  # worktrees dividem o banco da principal (risco consciente)
    HARNESS_WT_DB='off'            # sem banco (projeto estatico)
  Ou rode com --sem-banco para um worktree descartavel de teste."
    fi
    WT="$(WT_DIR_DE "$ROT")"; BR="wt/$ROT"
    [ -e "$WT" ] && die "ja existe: $WT"
    BASE_BR="$(git -C "$MAIN_ROOT" rev-parse --abbrev-ref HEAD)"
    git -C "$MAIN_ROOT" worktree add -q -b "$BR" "$WT" "$BASE_BR" 2>/dev/null || git -C "$MAIN_ROOT" worktree add -q "$WT" "$BR" || die "git worktree add falhou"
    mkdir -p "$WT/.claude/.harness-run"; printf '*\n' > "$WT/.claude/.harness-run/.gitignore"

    # 1) copiar gitignored declarados (src ou src:dst)
    COPIAR="${HARNESS_WT_COPIAR:-.env,.claude/harness.env.local,.claude/settings.local.json}"
    OLDIFS="$IFS"; IFS=','; for item in $COPIAR; do IFS="$OLDIFS"; item="$(printf '%s' "$item" | sed 's/^ *//; s/ *$//')"; [ -n "$item" ] || continue
      src="${item%%:*}"; dst="${item#*:}"; [ "$dst" = "$item" ] && dst="$src"
      if [ -e "$MAIN_ROOT/$src" ]; then mkdir -p "$(dirname "$WT/$dst")"; cp -r "$MAIN_ROOT/$src" "$WT/$dst" && printf 'WT|copiado|%s\n' "$dst"; fi
      IFS=','; done; IFS="$OLDIFS"

    # 1a2) 3.5.7 (E7): node_modules AUSENTE no principal — medido 16/09 (140-b): "playwright instalado no pre-flight",
    #      specs mortos na worktree e na main ("Cannot find module @playwright/test"). Se o package.json declara
    #      @playwright/test e ha npm, instala no PRINCIPAL sem tocar o package.json (npm i --no-save, ~5 s com cache
    #      local) e o passo 1b linka. HARNESS_WT_NPM_INSTALL='off' desliga. Falha = aviso, nunca aborta o novo.
    if [ "${HARNESS_WT_NPM_INSTALL:-on}" != "off" ] && [ -f "$MAIN_ROOT/package.json" ] && [ ! -d "$MAIN_ROOT/node_modules" ] \
       && grep -q '"@playwright/test"' "$MAIN_ROOT/package.json" 2>/dev/null && command -v npm >/dev/null 2>&1; then
      log "node_modules ausente no principal e o package.json declara @playwright/test — npm i --no-save (3.5.7/E7)"
      if (cd "$MAIN_ROOT" && npm i --no-save --no-audit --no-fund --prefer-offline >/dev/null 2>&1); then
        printf 'WT|npm|node_modules instalado no principal (npm i --no-save) — a worktree recebe o link abaixo\n'
      else
        log "npm i --no-save falhou no principal — instale as dependencias a mao antes de rodar specs (harness-worktree.sh doctor acusa)"
      fi
    fi

    # 1b) 3.4.12: dependencias instaladas viram LINK, nao copia — sem isso o michelangelo/acceptance
    #     param na primeira spec ("Playwright nao esta instalado neste worktree", PRD-133 e 133-b).
    #     Windows: junction (nao exige admin); demais: symlink. HARNESS_WT_LINKS lista as pastas.
    LINKS="${HARNESS_WT_LINKS:-node_modules,vendor}"
    OLDIFS="$IFS"; IFS=','; for item in $LINKS; do IFS="$OLDIFS"; item="$(printf '%s' "$item" | sed 's/^ *//; s/ *$//')"; [ -n "$item" ] || continue
      if [ -d "$MAIN_ROOT/$item" ] && [ ! -e "$WT/$item" ]; then
        case "$(uname -s 2>/dev/null)" in
          MINGW*|MSYS*|CYGWIN*)
            W_WT="$(cygpath -w "$WT/$item" 2>/dev/null)"; W_SRC="$(cygpath -w "$MAIN_ROOT/$item" 2>/dev/null)"
            if [ -n "$W_WT" ] && cmd //c mklink /J "$W_WT" "$W_SRC" >/dev/null 2>&1; then printf 'WT|link|%s (junction -> principal)\n' "$item"; else log "nao consegui criar junction de $item — instale as dependencias no worktree"; fi ;;
          *)
            ln -s "$MAIN_ROOT/$item" "$WT/$item" 2>/dev/null && printf 'WT|link|%s (symlink -> principal)\n' "$item" || log "nao consegui linkar $item" ;;
        esac
      fi
      IFS=','; done; IFS="$OLDIFS"

    # 1c) 3.5.4: helpers efemeros do .harness-run que o Perfil/specs referenciam (pw-login.mjs + storage-state do login)
    #     sao gitignored e nao viajam no fork — medido 14/09 (PRD-139-b): dedalo quebrou com "Cannot find module
    #     .claude/.harness-run/pw-login.mjs" na worktree. HARNESS_WT_COPIAR_RUN lista os arquivos (so copia se existirem).
    RUNCOPIA="${HARNESS_WT_COPIAR_RUN:-pw-login.mjs,pw-storage.json}"
    OLDIFS="$IFS"; IFS=','; for item in $RUNCOPIA; do IFS="$OLDIFS"; item="$(printf '%s' "$item" | sed 's/^ *//; s/ *$//')"; [ -n "$item" ] || continue
      if [ -f "$MAIN_ROOT/.claude/.harness-run/$item" ] && [ ! -e "$WT/.claude/.harness-run/$item" ]; then
        mkdir -p "$WT/.claude/.harness-run" 2>/dev/null
        cp "$MAIN_ROOT/.claude/.harness-run/$item" "$WT/.claude/.harness-run/$item" 2>/dev/null && printf 'WT|copiado|.claude/.harness-run/%s\n' "$item"
      fi
      IFS=','; done; IFS="$OLDIFS"

    # 2) banco
    PORTA="$(PORTA_DE)"; URL="$(url_wt "$URL_BASE" "$ROT" "$PORTA")"; API="$(url_wt "$URL_API" "$ROT" "$PORTA")"
    DBWT="$DB_NAME"; MODO_DB="${HARNESS_WT_DB:-clone}"
    if [ "$SEM_BANCO" = 1 ] || [ "$MODO_DB" != "clone" ] || [ -z "$DB_NAME" ]; then
      [ -z "$DB_NAME" ] && log "Perfil sem Database — banco compartilhado."
      printf 'WT|banco|%s (compartilhado)\n' "$DBWT"
    else
      DBWT="$(DB_DE "$ROT")"
      case "$DB_CLI" in
        *mysql*)
          DUMP="$(dirname "$DB_CLI")/mysqldump$(case "$DB_CLI" in *.exe) echo .exe;; esac)"
          [ -x "$DUMP" ] || DUMP="mysqldump"
          T0=$(date +%s)
          ERR="$("$DB_CLI" -h "${DB_HOST:-localhost}" -u "$DB_USER" -p"$DB_PASS" -e "CREATE DATABASE IF NOT EXISTS \`$DBWT\` CHARACTER SET utf8mb4;" 2>&1 >/dev/null | grep -v "Using a password")" || true
          if [ -n "$ERR" ]; then git -C "$MAIN_ROOT" worktree remove --force "$WT" >/dev/null 2>&1; git -C "$MAIN_ROOT" branch -D "$BR" >/dev/null 2>&1; die "nao consegui criar $DBWT: $ERR"; fi
          "$DUMP" -h "${DB_HOST:-localhost}" -u "$DB_USER" -p"$DB_PASS" --single-transaction --routines --triggers --events "$DB_NAME" 2>/dev/null \
            | "$DB_CLI" -h "${DB_HOST:-localhost}" -u "$DB_USER" -p"$DB_PASS" "$DBWT" 2>/dev/null || { git -C "$MAIN_ROOT" worktree remove --force "$WT" >/dev/null 2>&1; git -C "$MAIN_ROOT" branch -D "$BR" >/dev/null 2>&1; die "clone do banco falhou (mysqldump|mysql)"; }
          printf 'WT|banco|%s (clonado de %s em %ss)\n' "$DBWT" "$DB_NAME" "$(( $(date +%s) - T0 ))" ;;
        *psql*|*pg_dump*)
          createdb -h "${DB_HOST:-localhost}" -U "$DB_USER" -T "$DB_NAME" "$DBWT" 2>/dev/null && printf 'WT|banco|%s (clonado de %s)\n' "$DBWT" "$DB_NAME" || { DBWT="$DB_NAME"; log "createdb -T falhou — banco compartilhado"; } ;;
        *) DBWT="$DB_NAME"; log "cliente de banco nao reconhecido ($DB_CLI) — banco compartilhado" ;;
      esac
    fi

    # 3) como o app descobre o banco/url: override declarado + .env
    apontar_app "$WT" "$ROT" "$DBWT" "$URL" "$API" "$PORTA"
    printf 'branch=%s\ndb_origem=%s\n' "$BR" "$DB_NAME" >> "$WT/.claude/.harness-run/worktree.env"
    printf 'WT|dir|%s\nWT|branch|%s\nWT|url|%s\nWT|api|%s\nWT|porta|%s\n' "$WT" "$BR" "$URL" "$API" "$PORTA"
    printf 'WT|abrir|cd "%s" && claude\n' "$WT"
    exit 0 ;;

  fechar)
    ROT="$(SAFE "${1:-}")"; [ -n "$ROT" ] || die "fechar <rotulo>"; shift
    MERGE=0; MANTER=0; for a in "$@"; do [ "$a" = "--merge" ] && MERGE=1; [ "$a" = "--manter-banco" ] && MANTER=1; done
    WT="$(WT_DIR_DE "$ROT")"; BR="wt/$ROT"
    [ -d "$WT" ] || die "worktree nao existe: $WT"
    if [ -n "$(git -C "$WT" status --porcelain)" ]; then die "worktree com mudanca nao commitada — commite ou descarte antes de fechar"; fi
    if [ "$MERGE" = 1 ]; then
      [ -z "$(git -C "$MAIN_ROOT" status --porcelain)" ] || die "checkout principal sujo — nao faco merge em cima de trabalho nao commitado"
      git -C "$MAIN_ROOT" merge --no-edit "$BR" >/dev/null 2>&1 && printf 'WT|merge|%s -> %s\n' "$BR" "$(git -C "$MAIN_ROOT" rev-parse --abbrev-ref HEAD)" || die "merge com conflito — resolva no checkout principal"
    fi
    DBWT="$(grep '^db=' "$WT/.claude/.harness-run/worktree.env" 2>/dev/null | cut -d= -f2)"
    git -C "$MAIN_ROOT" worktree remove --force "$WT" && printf 'WT|removido|%s\n' "$WT"
    if [ "$MANTER" = 0 ] && [ -n "$DBWT" ] && [ "$DBWT" != "$DB_NAME" ] && [ -n "$DB_NAME" ]; then
      case "$DB_CLI" in *mysql*) "$DB_CLI" -h "${DB_HOST:-localhost}" -u "$DB_USER" -p"$DB_PASS" -e "DROP DATABASE IF EXISTS \`$DBWT\`;" 2>/dev/null && printf 'WT|banco-removido|%s\n' "$DBWT" ;; esac
    fi
    # 3.5.5 (C11): o lock pode ter sido feito com `lock X --por <rotulo>` (dono = rotulo cru) — medido 15/09: os 4 locks das
    # worktrees da tarde ficaram orfaos depois do fechar porque o grep so aceitava <repo>--wt-<rotulo>.
    for l in "$LOCKS"/*.lock; do [ -f "$l" ] && grep -qE "^($REPO--wt-$ROT|$ROT)\|" "$l" && rm -f "$l" && printf 'LOCK|livre|%s\n' "$(basename "$l" .lock)"; done
    # 3.5.6 (D2 / B10): reservas de NUMERO (seq/PRD-*, DT-*, LOTE-*, MIG-*) feitas por esta worktree passam ao checkout
    # principal — a PRD/migration continua existindo depois do merge e o proximo checkout que escrever a migration nao pode
    # bater numa reserva de worktree morta (medido 15/09: 0201 da 137-c perdida, 0200 da 144 transferida a mao).
    for d in "$LOCKS"/seq/*/; do
      [ -f "$d/dono" ] || continue
      grep -qE "^($REPO--wt-$ROT|$ROT)\|" "$d/dono" 2>/dev/null || continue
      _old="$(cut -d'|' -f1 "$d/dono")"
      printf '%s|%s|%s\n' "$REPO" "$(date -Iseconds 2>/dev/null || date)" "transferida de $_old no fechar (3.5.6)" > "$d/dono" 2>/dev/null || continue
      printf 'SEQ|transferida|%s|%s -> %s\n' "$(basename "$d")" "$_old" "$REPO"
    done
    [ "$MERGE" = 1 ] && git -C "$MAIN_ROOT" branch -d "$BR" >/dev/null 2>&1 && printf 'WT|branch-removida|%s\n' "$BR"
    exit 0 ;;

  *) sed -n '1,30p' "${BASH_SOURCE[0]}" >&2; exit 2 ;;
esac
