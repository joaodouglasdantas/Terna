#!/usr/bin/env bash
# .claude/hooks/task-packet.sh (3.3.0; esqueleto p/ contexto + DUELO-CHECK + previsao no veredito 3.4.24;
#                                contrato do papel no topo 3.4.25; Perfil filtrado + --worker 3.4.28)
# Monta o TASK PACKET de uma task: o MINIMO que um executor (hefesto/dedalo nativo ou worker
# de duelo via OpenRouter) precisa para implementar — e nada mais.
#
#   packet = "## 0. Contrato do papel" (3.4.25, item 19: .claude/contratos/CONTRATO-executor.md —
#            a mecanica compartilhada dos executores; HARNESS_PACKET_CONTRATO='off' tira a secao;
#            no --check a secao NAO entra na medicao, e overhead constante)
#          + contrato da task (TASK-NNN.md)
#          + PERFIL-RESUMO.md (nunca o Perfil inteiro) — 3.4.28: FILTRADO pela task (ver abaixo)
#          + o "Componente N" da PRD tecnica que a task referencia (quando acha)
#          + os ARQUIVOS-ALVO citados na secao "Arquivo(s) Afetado(s)" da task (o que ela MUDA)
#          + os ARQUIVOS DE CONTEXTO citados fora dessa secao (o que ela LE — helper, precedente)
#            (3.4.24, item 9: task sem a secao = tudo e alvo, como antes)
#
# Por que (S3, medido 15-22/08/2026): tokens por /prd-exec dobraram (1,02M -> 2,04M); hefesto
# 84k e dedalo 121k tokens por chamada. Boa parte e releitura de Perfil e de PRD inteira por
# cada subagente. O packet corta isso na raiz: o executor recebe so o que a task pede.
#
# ARQUIVO GRANDE (> HARNESS_PACKET_ARQ_KB, default 40 KB) — 3.4.19, estendido na 3.4.24 (item 9):
#   qualquer arquivo de codigo que entra no packet, ALVO ou CONTEXTO, entra por ESQUELETO
#   (assinaturas com numero de linha) + corpo SO das funcoes que a task cita. Arquivo grande sem
#   funcoes (css/html/sql/json/yml/md) entra pelo cabecalho (primeiras linhas). Medido 02/09: as
#   TASK-004 das PRD-135/136 (51-57 min) tocavam arquivos de 60-120 KB que entravam inteiros; na
#   PRD-135-b 4 de 8 tasks passaram de 66 min com packets de 62-134 KB.
#   HARNESS_PACKET_ESQUELETO='on' (alvo + contexto) | 'alvos' (so alvo, 3.4.19) | 'off' (inteiro).
#
# USO
#   bash .claude/hooks/task-packet.sh <caminho/TASK-NNN-x.md> [--out <packet.md>] [--max-kb 300]
#   bash .claude/hooks/task-packet.sh <TASK-NNN.md> --check      (3.4.18: so mede, nao grava packet)
# SAIDA (stdout, 1 linha):  PACKET|<packet.md>|<arquivos-alvo csv>|<n arquivos>|<bytes>
#   --check (3 linhas):
#     PACKET-CHECK|<TASK-ID>|<KB>|<alvos prod>/<alvos total>|<linhas da task>|ok|GRANDE[|<motivos csv>]
#         GRANDE = packet > HARNESS_PACKET_MAX_KB (300) OU > 4 alvos de producao OU
#                  > HARNESS_TASK_MAX_LINHAS (230) linhas OU (3.4.24) previsao > HARNESS_TASK_PREVISAO_MAX_MIN (45)
#         o 7o campo so aparece quando GRANDE e diz por que (kb, alvos, linhas, previsao).
#     PREVISAO|<TASK-ID>|<min> min|n=<k>|<papel>|ok|GRANDE      (3.4.22, item 8; sem historico: n/d)
#     DUELO-CHECK|<TASK-ID>|ok|inelegivel|<motivo>              (3.4.24, item 11c) — so vale para
#         `Duelo | sim`: elegivel quando ha <= 2 arquivos-alvo de PRODUCAO e NENHUM arquivo novo
#         (citado em "Arquivo(s) Afetado(s)" e ausente no repo). Task com Duelo auto/nao: `n/a`.
#         A /prd (Passo 8) rebaixa `sim` -> `nao — <motivo>`; o guard-agent le o campo da task.
#         HARNESS_DUELO_CHECK='off' desliga (imprime `off`).
# exit 0 sempre que conseguiu montar; 2 = uso invalido. Read-only sobre o projeto.

set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck disable=SC1091
[ -f "$SCRIPT_DIR/_contrato.sh" ] && . "$SCRIPT_DIR/_contrato.sh"
TASK=""; OUT=""; MAXKB="${HARNESS_PACKET_MAX_KB:-300}"; CHECK=0; WORKER=0
case "$MAXKB" in ''|*[!0-9]*) MAXKB=300 ;; esac
while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT="${2:-}"; shift 2 ;;
    --check) CHECK=1; shift ;;
    --worker) WORKER=1; shift ;;   # 3.4.28: packet p/ worker SEM tools — os alvos vao nos Anexos, aqui so o indice
    --max-kb) MAXKB="${2:-300}"; shift 2 ;;
    -h|--help) sed -n '1,42p' "${BASH_SOURCE[0]}" >&2; exit 0 ;;
    *) [ -z "$TASK" ] && TASK="$1"; shift ;;
  esac
done
[ -n "$TASK" ] && [ -f "$TASK" ] || { echo "uso: task-packet.sh <TASK-NNN.md>" >&2; printf 'PACKET|||0|0\n'; exit 2; }
case "$TASK" in /*|[A-Za-z]:*) : ;; *) TASK="$ROOT/$TASK" ;; esac
TASK_DIR="$(dirname "$TASK")"; PRD_DIR="$(cd "$TASK_DIR/.." && pwd)"
# 3.4.18: sufixo de FATIA (TASK-006b) faz parte do id — antes colidia com TASK-006.packet.md (PRD-136, 02/09).
# (TASK|DT): o guard-agent 3.4.2b procura packets de item de lote como DT-NNN.packet.md —
# so TASK- aqui fazia o default cair no basename com slug e o guard nunca achava (24/08, sweep-a)
TASK_ID="$(basename "$TASK" .md | grep -oE '^(TASK|DT)-[0-9]+[a-z]?' || basename "$TASK" .md)"
mkdir -p "$ROOT/.claude/.harness-run/packets" 2>/dev/null
[ -n "$OUT" ] || OUT="$ROOT/.claude/.harness-run/packets/${TASK_ID}.packet.md"
[ "$CHECK" = "1" ] && OUT="$ROOT/.claude/.harness-run/packets/${TASK_ID}.check.tmp"   # 3.4.18: medir sem gravar
BUDGET=$(( MAXKB * 1024 ))
ARQKB="${HARNESS_PACKET_ARQ_KB:-40}"; case "$ARQKB" in ''|*[!0-9]*) ARQKB=40 ;; esac
ESQ="${HARNESS_PACKET_ESQUELETO:-on}"; case "$ESQ" in on|alvos|off) : ;; *) ESQ=on ;; esac
[ "$ARQKB" -gt 0 ] || ESQ=off     # ARQ_KB=0 = nunca esqueleto (kill switch antigo, mantido)

# 1) Arquivos CITADOS na task (caminhos relativos com extensao de codigo/spec/template; ignora URLs e prds/).
#    3.4.24 (item 9): o que esta na secao "## Arquivo(s) Afetado(s)" (TEMPLATE-TASK) e ALVO — o que a task
#    muda; o citado fora dela e CONTEXTO — o que ela le. Task sem a secao: tudo e alvo (comportamento 3.3.0).
citar() { grep -oE '(`|\b)[A-Za-z0-9_./-]+/[A-Za-z0-9_.-]+\.(php|js|mjs|ts|tsx|vue|py|sql|html|twig|blade\.php|css|scss|json|yml|yaml|md|sh)\b' \
  | tr -d '`' | grep -vE '^(https?:|prds/|\.claude/|node_modules/)' | sort -u; }
CITADOS="$(citar < "$TASK")"
SEC_AFET="$(awk 'tolower($0) ~ /^## +arquivo/ {on=1; next} on && /^## / {on=0} on {print}' "$TASK")"
if [ -n "$SEC_AFET" ]; then
  ALVOS_CIT="$(printf '%s\n' "$SEC_AFET" | citar)"
  # contexto = citados que NAO estao na secao de afetados
  CTX_CIT="$(printf '%s\n' "$CITADOS" | while read -r p; do
    [ -n "$p" ] || continue
    printf '%s\n' "$ALVOS_CIT" | grep -qxF "$p" || printf '%s\n' "$p"
  done)"
else
  ALVOS_CIT="$CITADOS"; CTX_CIT=""
fi
existentes() { while read -r p; do [ -n "$p" ] && [ -f "$ROOT/$p" ] && printf '%s\n' "$p"; done; return 0; }
ALVOS="$(printf '%s\n' "$ALVOS_CIT" | existentes)"
CONTEXTO="$(printf '%s\n' "$CTX_CIT" | existentes)"
# arquivo NOVO (3.4.24, item 11c): citado como afetado, de PRODUCAO, e ausente no repo — o duelo so sabe editar.
PROD_FILTRO='(^|/)(tests?|e2e|specs?|docs?|__tests__)/|\.(spec|test)\.[a-z]+$|\.md$'
NOVOS="$(printf '%s\n' "$ALVOS_CIT" | while read -r p; do [ -n "$p" ] && [ ! -f "$ROOT/$p" ] && printf '%s\n' "$p"; done | grep -vE "$PROD_FILTRO" || true)"
N_ALVOS="$(printf '%s\n' "$ALVOS" | grep -c . || true)"

# 2) Componente da PRD tecnica referenciado ("Componente N")
TEC="$(ls "$PRD_DIR"/PRD-TECNICA-*.md 2>/dev/null | head -1)"
COMPS="$(grep -oE 'Componente [0-9]+' "$TASK" | sort -u | grep -oE '[0-9]+' | tr '\n' ' ')"
FUNCS="$(grep -oE '\b[A-Za-z_][A-Za-z0-9_]{3,}\(' "$TASK" | tr -d '(' | sort -u)"

# 3.4.26 (achado do teste de modelos, 08/09 — DT-543): o contrato cita `arquivo:NNN` (ou `:NNN-MMM`,
# `l. NNN`, `linha NNN`) e o arquivo de 66 KB entrou por ESQUELETO sem o trecho citado — todo worker do
# duelo ficou inaplicavel, qualquer que fosse o modelo. Agora toda linha citada para um arquivo GRANDE
# entra com TRECHOS_MARGEM linhas de contexto em volta (em codigo e em nao-codigo). Quem le a task e
# a mesma regex do --check (TRECHOS|...). Linha defasada (o codigo andou) ainda aparece — por isso o
# esqueleto continua junto: o worker acha a funcao certa pelo nome.
TRECHOS_MARGEM="${HARNESS_PACKET_TRECHO_MARGEM:-25}"; case "$TRECHOS_MARGEM" in ''|*[!0-9]*) TRECHOS_MARGEM=25 ;; esac
# linhas citadas de UM arquivo: "<ini> <fim>" por linha (deduplicadas). $1 = caminho relativo.
linhas_citadas() {
  b="$(basename "$1")"; bq="$(printf '%s' "$b" | sed 's/[.[\*^$]/\\&/g')"
  {
    # arquivo.php:123 | arquivo.php:123-140 | `arquivo.php:123`
    grep -oE "${bq}:[0-9]{1,6}(-[0-9]{1,6})?" "$TASK" | sed -E 's/^.*://; s/-/ /'
    # arquivo.php (l. 123) | arquivo.php (linha 123) | arquivo.php, linha 123 | arquivo.php linhas 120-130
    grep -oiE "${bq}[^|\n]{0,30}\b(l\.|linha|linhas|line)[[:space:]]*[0-9]{1,6}([-–][0-9]{1,6})?" "$TASK" | grep -oE '[0-9]{1,6}([-–][0-9]{1,6})?$' | sed -E 's/[-–]/ /'
  } 2>/dev/null | awk 'NF{ini=$1; fim=($2!=""?$2:$1); if (fim<ini) {t=ini; ini=fim; fim=t}; k=ini"-"fim; if(!s[k]++) print ini, fim}' | sort -n
}
imprimir_trechos() { # $1 = caminho relativo — imprime os trechos citados com margem
  total="$(wc -l < "$ROOT/$1" | tr -d ' ')"
  linhas_citadas "$1" | while read -r ini fim; do
    a=$(( ini - TRECHOS_MARGEM )); [ "$a" -lt 1 ] && a=1
    z=$(( fim + TRECHOS_MARGEM )); [ "$z" -gt "$total" ] && z="$total"
    [ "$ini" -gt "$total" ] && { printf '#### linha %s citada no contrato — o arquivo tem %s linhas (referencia DEFASADA: ache pelo nome/funcao)\n\n' "$ini" "$total"; continue; }
    printf '#### trecho citado no contrato: linhas %s-%s (margem %s)\n\n```\n' "$ini" "$fim" "$TRECHOS_MARGEM"
    sed -n "${a},${z}p" "$ROOT/$1" | awk -v n="$a" '{print n": "$0; n++}'
    printf '```\n\n'
  done
}

# Inclui UM arquivo no packet respeitando o teto e a regra do arquivo grande. $1 = caminho, $2 = alvo|contexto.
# Usa/atualiza `used` (chamada fora de pipeline, de proposito — subshell perderia o acumulado).
used=0
incluir_arquivo() {
  p="$1"; papel_arq="$2"
  sz="$(wc -c < "$ROOT/$p" | tr -d ' ')"
  if [ $(( used + sz )) -gt "$BUDGET" ]; then printf -- '- `%s` — NAO incluido (teto de %s KB); leia-o diretamente.\n' "$p" "$MAXKB"; return; fi
  grande=0
  if [ "$sz" -gt $(( ARQKB * 1024 )) ]; then
    case "$ESQ" in on) grande=1 ;; alvos) [ "$papel_arq" = alvo ] && grande=1 ;; esac
  fi
  if [ "$grande" = 1 ] && printf '%s' "$p" | grep -qE '\.(php|js|mjs|ts|tsx|vue|py|sh)$'; then
    # 3.4.19/3.4.24: arquivo de codigo GRANDE entra por FUNCAO — esqueleto (assinaturas com numero de
    # linha) + corpo so das funcoes que a task CITA. Vale para alvo E contexto (item 9).
    printf '### `%s` (%s bytes — GRANDE: esqueleto + funcoes e trechos citados [%s]; o resto leia com Read se o contrato exigir)\n\n```\n' "$p" "$sz" "$papel_arq"
    grep -nE '^[[:space:]]*((public|private|protected|static|async|export|default)[[:space:]]+)*(function|class|const [A-Za-z_]+ = (async )?\(|def )[[:space:]]*[A-Za-z_][A-Za-z0-9_]*' "$ROOT/$p" | cut -c1-160
    printf '```\n\n'
    imprimir_trechos "$p"
    for fn in $FUNCS; do
      if grep -qE "(function[[:space:]]+$fn[[:space:]]*\(|[[:space:]]$fn[[:space:]]*\(.*\)[[:space:]]*\{|def[[:space:]]+$fn[[:space:]]*\()" "$ROOT/$p"; then
        printf '#### `%s()`\n\n```\n' "$fn"
        awk -v fn="$fn" '
          $0 ~ ("(function[ \t]+" fn "[ \t]*\\(|[ \t]" fn "[ \t]*\\(.*\\)[ \t]*\\{|def[ \t]+" fn "[ \t]*\\()") {on=1; ind=match($0,/[^ \t]/); print NR": "$0; next}
          on { print NR": "$0; if (match($0,/[^ \t]/) && RSTART<=ind && $0 ~ /^[ \t]*\}/) {on=0} }' "$ROOT/$p" | head -400
        printf '```\n\n'
      fi
    done
    used=$(( used + 8192 ))
    return
  fi
  if [ "$grande" = 1 ]; then
    # 3.4.24: arquivo GRANDE sem funcoes (css/html/sql/json/yml/md) — cabecalho (120 linhas) e o resto sob demanda.
    printf '### `%s` (%s bytes — GRANDE: cabecalho, primeiras 120 linhas + trechos citados [%s]; o resto leia com Read offset/limit)\n\n```\n' "$p" "$sz" "$papel_arq"
    head -120 "$ROOT/$p"
    printf '\n```\n\n'
    imprimir_trechos "$p"
    used=$(( used + 8192 ))
    return
  fi
  used=$(( used + sz ))
  printf '### `%s` (%s bytes)\n\n```\n' "$p" "$sz"; cat "$ROOT/$p"; printf '\n```\n\n'
}

# 3.4.28 — Perfil FILTRADO pela task (medido 09/09, sweep do Mariana: o PERFIL-RESUMO tem 56 KB, dos quais
# 52 KB sao 33 armadilhas de PRDs passadas, uma por paragrafo; um DT que toca UM arquivo levava tudo —
# 56 dos 142 KB do worker de duelo, e o mesmo peso em todo packet de hefesto/sherlock). Regra: nas secoes
# de historico (heading com armadilha|integra|hist|decis|prd) o bullet LONGO (> PERFIL_MIN chars) so fica se
# citar um token da task (basename/pasta dos arquivos citados, identificadores em crase) OU se estiver
# entre os PERFIL_RECENTES mais recentes do arquivo. Bullet curto (regra), secoes fixas (identificacao,
# CLI, reguas, conduta) e linhas de continuacao do bullet mantido ficam. HARNESS_PACKET_PERFIL=integral desliga.
PERFIL_MODO="${HARNESS_PACKET_PERFIL:-filtrado}"; case "$PERFIL_MODO" in filtrado|integral) : ;; *) PERFIL_MODO=filtrado ;; esac
PERFIL_MIN="${HARNESS_PACKET_PERFIL_MIN:-300}"; case "$PERFIL_MIN" in ''|*[!0-9]*) PERFIL_MIN=300 ;; esac
PERFIL_REC="${HARNESS_PACKET_PERFIL_RECENTES:-3}"; case "$PERFIL_REC" in ''|*[!0-9]*) PERFIL_REC=3 ;; esac
PERFIL_SRC="$ROOT/.claude/PERFIL-RESUMO.md"; PERFIL_TMP=""; PERFIL_MANT=0; PERFIL_TOTAL=0; PERFIL_KB_INT=0; PERFIL_KB_FIL=0
if [ -f "$PERFIL_SRC" ]; then
  PERFIL_KB_INT=$(( $(wc -c < "$PERFIL_SRC" | tr -d ' ') / 1024 )); PERFIL_KB_FIL="$PERFIL_KB_INT"
  if [ "$PERFIL_MODO" = "filtrado" ]; then
    TOKENS="$( {
        for p in $ALVOS $CONTEXTO $NOVOS; do b="$(basename "$p")"; printf '%s\n' "${b%.*}"; basename "$(dirname "$p")"; done
        # identificador em crase so conta se for ESPECIFICO: tem `_` ou >= 10 chars (medido DT-544: `status`,
        # `update`, `insert`, `false` casavam com 4-7 armadilhas cada e o filtro ficava em 24/39).
        grep -oE '`[A-Za-z_][A-Za-z0-9_]{4,}`' "$TASK" | tr -d '`' | grep -E '_|^.{10,}$'
      } 2>/dev/null | tr '[:upper:]' '[:lower:]' \
      | grep -vxE 'administrativo|api|js|css|src|app|lib|public|assets|include|includes|dependencias|test|tests|e2e|spec|specs|index|main|config|util|utils|helper|helpers|tools|scripts|hooks|claude|null|true|false|status|update|insert|delete|select|return|function|created_at|updated_at|deleted_at' \
      | awk 'length($0) >= 4 && !s[$0]++' | head -80 | paste -sd'|' -)"
    PERFIL_TMP="$ROOT/.claude/.harness-run/packets/.perfil-$$.tmp"
    awk -v min="$PERFIL_MIN" -v rec="$PERFIL_REC" -v toks="$TOKENS" '
      BEGIN { nt = split(toks, T, "|") }
      FNR == NR { if ($0 ~ /^## /) sec = (tolower($0) ~ /armadilha|integra|hist|decis|prd/)
                  if (sec && $0 ~ /^- / && length($0) > min) { n++; ord[n] = FNR }
                  next }
      FNR == 1 { total = n; for (i = (n - rec > 0 ? n - rec + 1 : 1); i <= n; i++) recente[ord[i]] = 1; keep = 1; sec = 0 }
      /^## / { sec = (tolower($0) ~ /armadilha|integra|hist|decis|prd/); keep = 1; print; next }
      sec && /^- / && length($0) > min {
        keep = 0
        if (recente[FNR]) keep = 1
        else { l = tolower($0); for (i = 1; i <= nt; i++) if (T[i] != "" && index(l, T[i])) { keep = 1; break } }
        if (keep) { mant++; print } else omit++
        next }
      /^- / { keep = 1; print; next }
      /^[ \t]+[^ \t]/ { if (keep) print; next }
      { keep = 1; print }
      END { if (omit > 0) printf "\n> Perfil filtrado (3.4.28): %d de %d armadilhas longas mantidas — as que citam os arquivos/identificadores desta task e as %d mais recentes; %d omitidas. Integral em `.claude/PERFIL-RESUMO.md` (HARNESS_PACKET_PERFIL=integral desliga).\n", mant, total, rec, omit
            printf "%d %d\n", mant, total > "/dev/stderr" }' "$PERFIL_SRC" "$PERFIL_SRC" > "$PERFIL_TMP" 2> "$PERFIL_TMP.n"
    read -r PERFIL_MANT PERFIL_TOTAL < "$PERFIL_TMP.n" 2>/dev/null || true; rm -f "$PERFIL_TMP.n"
    : "${PERFIL_MANT:=0}"; : "${PERFIL_TOTAL:=0}"
    PERFIL_KB_FIL=$(( $(wc -c < "$PERFIL_TMP" | tr -d ' ') / 1024 ))
  fi
fi

{
  printf '# TASK PACKET — %s\n\n' "$TASK_ID"
  printf '> Montado por task-packet.sh (3.3.0). Este e o seu contexto INTEIRO: contrato da task,\n'
  printf '> resumo do Perfil, componente(s) da PRD tecnica e os arquivos-alvo. Nao leia o Perfil\n'
  printf '> completo nem a PRD inteira — se faltar algo essencial, declare em "Nao verificado".\n'
  if [ -n "$PERFIL_TMP" ] && [ "$PERFIL_MANT" -lt "$PERFIL_TOTAL" ]; then printf '> Perfil: filtrado pela task (%s KB -> %s KB; %s/%s armadilhas longas).\n' "$PERFIL_KB_INT" "$PERFIL_KB_FIL" "$PERFIL_MANT" "$PERFIL_TOTAL"; fi
  printf '
'

  # 3.4.25 (item 19): contrato mecanico do papel no topo; fora do --check (overhead constante, nao mede a task)
  if [ "$CHECK" != "1" ] && command -v contrato_secao >/dev/null 2>&1; then contrato_secao executor; fi
  printf '## 1. Contrato da task\n\n'; cat "$TASK"; printf '\n\n'
  if [ -f "$PERFIL_SRC" ]; then
    printf '## 2. Perfil do projeto (resumo)\n\n'
    if [ -n "$PERFIL_TMP" ] && [ -s "$PERFIL_TMP" ]; then cat "$PERFIL_TMP"; else cat "$PERFIL_SRC"; fi
    printf '\n\n'
  fi
  if [ -n "$TEC" ] && [ -n "$COMPS" ]; then
    printf '## 3. Componentes da PRD tecnica referenciados\n\n'
    for c in $COMPS; do
      # bloco do "### Componente N" ate o proximo "### " ou "## "
      awk -v n="$c" '
        $0 ~ ("^#+ *Componente " n "([^0-9]|$)") {on=1; print; next}
        on && /^#{1,3} / && $0 !~ ("Componente " n "([^0-9]|$)") {on=0}
        on {print}' "$TEC"
      printf '\n'
    done
  fi
  if [ -n "$ALVOS" ] || [ -n "$NOVOS" ]; then
    if [ "$WORKER" = 1 ]; then
      # 3.4.28: worker sem tools recebe os alvos INTEIROS como Anexo (harness-delegate --attach); repetir
      # o conteudo aqui dobrava o alvo na entrada (DT-542: 17 KB x2; DT-544: esqueleto+trechos + 66 KB).
      # Fica so o indice — e o esqueleto (assinaturas com linha) do arquivo grande, que orienta o BUSCAR.
      printf '## 4. Arquivos-alvo (indice — o conteudo INTEGRAL de cada um esta nos Anexos, no fim)\n\n'
      for p in $ALVOS; do
        sz="$(wc -c < "$ROOT/$p" | tr -d ' ')"
        if [ "$sz" -gt $(( ARQKB * 1024 )) ] && printf '%s' "$p" | grep -qE '\.(php|js|mjs|ts|tsx|vue|py|sh)$'; then
          printf -- '- `%s` (%s bytes — GRANDE; integral no Anexo). Esqueleto (linha:assinatura):\n\n```\n' "$p" "$sz"
          grep -nE '^[[:space:]]*((public|private|protected|static|async|export|default)[[:space:]]+)*(function|class|const [A-Za-z_]+ = (async )?\(|def )[[:space:]]*[A-Za-z_][A-Za-z0-9_]*' "$ROOT/$p" | cut -c1-160
          printf '```\n\n'
        else
          printf -- '- `%s` (%s bytes) — integral no Anexo.\n' "$p" "$sz"
        fi
      done
      [ -n "$ALVOS" ] && printf '\n'
    else
      printf '## 4. Arquivos-alvo (estado atual)\n\n'
      for p in $ALVOS; do incluir_arquivo "$p" alvo; done
    fi
    for p in $NOVOS; do printf -- '- `%s` — ARQUIVO NOVO (nao existe no repo; a task o cria).\n' "$p"; done
    [ -n "$NOVOS" ] && printf '\n'
  fi
  if [ -n "$CONTEXTO" ]; then
    printf '## 5. Arquivos de contexto (citados fora de "Arquivo(s) Afetado(s)" — leitura, nao alvo)\n\n'
    for p in $CONTEXTO; do incluir_arquivo "$p" contexto; done
  fi
  if [ "$CHECK" != "1" ] && [ "$WORKER" != 1 ] && [ "${HARNESS_PACKET_AMBIENTE:-on}" != "off" ]; then
    # 3.5.6 (D3/D4/D7/D16): AMBIENTE DESTA WORKTREE — informacao que existia no .harness-run e nunca chegava ao
    # subagente: ele lia o .env atras da URL (D3), descobria o login do Playwright na mao (D16), gravava script no
    # Temp do usuario (D7) e tentava esperar o e2e-lock com sleep/wmic (D4). Um bloco fixo resolve os quatro.
    WTENV="$ROOT/.claude/.harness-run/worktree.env"
    printf '## 6. Ambiente desta worktree (3.5.6)\n\n'
    if [ -f "$WTENV" ]; then
      printf -- '- Worktree `%s`: URL `%s` · banco `%s` · porta `%s` (fonte: `.claude/.harness-run/worktree.env`). NAO leia o `.env`: a credencial nao precisa entrar no seu contexto; conexao ao banco e `bash .claude/scripts/db-test.sh`.\n' \
        "$(grep '^rotulo=' "$WTENV" | cut -d= -f2-)" "$(grep '^url=' "$WTENV" | cut -d= -f2-)" "$(grep '^db=' "$WTENV" | cut -d= -f2-)" "$(grep '^porta=' "$WTENV" | cut -d= -f2-)"
    else
      printf -- '- Checkout principal: URL e banco sao os do Perfil ("Base URL local", "Database"); conexao ao banco: `bash .claude/scripts/db-test.sh`. NAO leia o `.env`.\n'
    fi
    if [ -f "$ROOT/.claude/.harness-run/pw-storage.json" ]; then
      printf -- '- Login do Playwright JA existe: `.claude/.harness-run/pw-storage.json` (storageState; gerado por `.claude/.harness-run/pw-login.mjs`) — nao descubra o login na mao nem escreva script de login.\n'
    fi
    printf -- '- Temporarios (script de sondagem, dump, log): `.claude/.harness-run/tmp/` (mkdir -p; gitignored, com o node_modules do projeto ao alcance) ou o scratchpad da sessao. Nunca /tmp, nunca fora do projeto — o guard-write/guard-bash negam.\n'
    printf -- '- Rodadas de teste: SO o spec da sua task, `--workers=1 [--grep "<cenario>"]`; teto %s rodadas por spec (falha por ambiente/lock em < 20 s e creditada). Lock E2E vivo de outro executor desta worktree (`%s`): espere num Bash so — `until [ ! -f <lock> ]; do sleep 5; done; <comando>` — nao re-tente na hora.\n' "${HARNESS_PW_RUNS_MAX:-4}" "${HARNESS_PW_LOCK_GLOB:-.claude/.harness-run/tmp/*.lock}"
    printf -- '- Nao crie spec de depuracao (`_debug*`, `_tmp-*`, `zz*`): o guard-write nega; depure no spec real com `--grep`.\n\n'
    # 3.5.6 (D9): VERIFICACOES PRE-PREENCHIDAS — os comandos das invariantes/E2E da task ja listados; o executor so cola a
    # saida em fence. Medido 15/09 (137-c): 2 hefestos com 3 verificacoes "feitas" sem saida => ⚠️ fabricado.
    printf '## 7. Verificacoes desta task — cole a SAIDA de cada uma no relatorio (3.5.6)\n\n'
    printf 'Cada item abaixo vira uma linha de "## Verificacoes" com o comando E a saida em fence. Item sem saida colada e nao-provado (o Status cai para ⚠️ e o guard-agent lista qual faltou).\n\n'
    awk '/^## Invariantes do gate/{f=1; next} f && /^## /{f=0} f && /^```/{c=!c; next} f && c' "$TASK" 2>/dev/null | awk 'NF' | head -40 | sed 's/^[[:space:]]*/- [ ] /'
    grep -oE '(tests?/[A-Za-z0-9_./-]+\.spec\.(js|ts|mjs))' "$TASK" 2>/dev/null | sort -u | head -5 | sed 's|^|- [ ] npx playwright test |; s|$| --workers=1   (spec da task — cole a saida BRUTA: "N passed")|'
    printf -- '- [ ] lint do Perfil sobre os arquivos que voce tocou (um comando so)\n\n'
  fi
} > "$OUT" 2>/dev/null
[ -n "$PERFIL_TMP" ] && rm -f "$PERFIL_TMP" 2>/dev/null

BYTES="$(wc -c < "$OUT" | tr -d ' ')"
if [ "$CHECK" = "1" ]; then
  # 3.4.18: conferencia mecanica da /prd (Passo 8) — task GRANDE e fatiada ANTES dos gates
  MAXL="${HARNESS_TASK_MAX_LINHAS:-230}"; case "$MAXL" in ''|*[!0-9]*) MAXL=230 ;; esac
  # 3.4.20: desconta o CABECALHO obrigatorio do template (instrucao de execucao + metadados, ~29
  # linhas) — conta a partir de "## Objetivo". PRD-012-b (03/09): 4 tasks em 232-254 so por cabecalho.
  LINHAS="$(awk '/^## Objetivo/{f=1} f' "$TASK" | wc -l | tr -d ' ')"
  [ "${LINHAS:-0}" -gt 0 ] || LINHAS="$(wc -l < "$TASK" | tr -d ' ')"
  KB=$(( BYTES / 1024 ))
  # 3.4.19b: so arquivo de PRODUCAO conta no criterio de alvos — spec/teste/doc onde a task muda
  # uma linha (lista CHAVES_EDITAVEIS, acceptance que toca N specs) marcava GRANDE falso em 3 de 9
  # tasks da PRD-012-b do Caronte (03/09). Saida: <prod>/<total> no campo de alvos.
  N_PROD="$(printf '%s\n' "$ALVOS" | grep -vE "$PROD_FILTRO" | grep -c . || true)"
  N_NOVOS="$(printf '%s\n' "$NOVOS" | grep -c . || true)"
  # 3.4.22 (item 8): PREVISAO de minutos a partir das tasks ja medidas deste projeto (SubagentStop —
  # task-telemetry.mjs: mediana da duracao de tasks do mesmo papel com packet de tamanho parecido,
  # >= 3 amostras; sem historico = n/d). Papel: dedalo se a task e `Tipo | front`, senao hefesto.
  # 3.4.24 (item 9): previsao > HARNESS_TASK_PREVISAO_MAX_MIN (45) entra no VEREDITO (GRANDE) — a /prd
  # fatia antes do gate igual ao GRANDE por linhas/KB/alvos; a linha PREVISAO continua saindo.
  PV_PAPEL="hefesto"; grep -qiE '\*\*Tipo\*\* *\| *front' "$TASK" 2>/dev/null && PV_PAPEL="dedalo"
  PV=""
  if [ -f "$SCRIPT_DIR/task-telemetry.mjs" ] && command -v "${HARNESS_RAG_NODE:-node}" >/dev/null 2>&1; then
    PV="$(cd "$ROOT" && "${HARNESS_RAG_NODE:-node}" "$SCRIPT_DIR/task-telemetry.mjs" --previsao "$PV_PAPEL" "$KB" "$N_ALVOS" 2>/dev/null)"
  fi
  PV_MAX="${HARNESS_TASK_PREVISAO_MAX_MIN:-45}"; case "$PV_MAX" in ''|*[!0-9]*) PV_MAX=45 ;; esac
  PV_MIN=""; PV_VER="ok"
  if [ -n "$PV" ]; then
    PV_MIN="${PV%%|*}"
    [ "${PV_MIN:-0}" -gt "$PV_MAX" ] 2>/dev/null && PV_VER="GRANDE"
  fi
  VER="ok"; MOTIVOS=""
  [ "$KB" -gt "$MAXKB" ] && MOTIVOS="${MOTIVOS}kb ${KB}>${MAXKB},"
  [ "$N_PROD" -gt 4 ] && MOTIVOS="${MOTIVOS}alvos ${N_PROD}>4,"
  [ "$LINHAS" -gt "$MAXL" ] && MOTIVOS="${MOTIVOS}linhas ${LINHAS}>${MAXL},"
  [ "$PV_VER" = "GRANDE" ] && MOTIVOS="${MOTIVOS}previsao ${PV_MIN}>${PV_MAX} min,"
  [ -n "$MOTIVOS" ] && VER="GRANDE"
  rm -f "$OUT" 2>/dev/null
  if [ "$VER" = "GRANDE" ]; then
    printf 'PACKET-CHECK|%s|%s|%s/%s|%s|%s|%s\n' "$TASK_ID" "$KB" "$N_PROD" "$N_ALVOS" "$LINHAS" "$VER" "${MOTIVOS%,}"
  else
    printf 'PACKET-CHECK|%s|%s|%s/%s|%s|%s\n' "$TASK_ID" "$KB" "$N_PROD" "$N_ALVOS" "$LINHAS" "$VER"
  fi
  if [ -n "$PV" ]; then
    printf 'PREVISAO|%s|%s min|%s|%s|%s\n' "$TASK_ID" "$PV_MIN" "${PV#*|}" "$PV_PAPEL" "$PV_VER"
  else
    printf 'PREVISAO|%s|n/d|sem historico (>= 3 tasks medidas do papel %s com packet parecido)\n' "$TASK_ID" "$PV_PAPEL"
  fi
  # 3.4.28: PERFIL — quanto do resumo do Perfil entrou (filtrado pela task) — a /prd e o /dt-exec leem o peso.
  [ -f "$PERFIL_SRC" ] && printf 'PERFIL|%s|%s|%s KB -> %s KB|%s/%s\n' "$TASK_ID" "$PERFIL_MODO" "$PERFIL_KB_INT" "$PERFIL_KB_FIL" "$PERFIL_MANT" "$PERFIL_TOTAL"
  # 3.5.7: GRAFO da PRD inteira (pasta desta task) — profundidade x largura; fator teorico < HARNESS_GRAFO_FATOR_MIN (2) =
  # plano serial por construcao: replanejar no Passo 8 ANTES do gate. Medido 15-16/09: 5 execs com limitou=dependencias
  # e paralelismo real 1,18-1,29 sob teto 6. Detalhe: node .claude/hooks/task-grafo.mjs <pasta das tasks>
  if [ -f "$SCRIPT_DIR/task-grafo.mjs" ] && command -v "${HARNESS_RAG_NODE:-node}" >/dev/null 2>&1; then
    (cd "$ROOT" && "${HARNESS_RAG_NODE:-node}" "$SCRIPT_DIR/task-grafo.mjs" "$(dirname "$TASK")" 2>/dev/null | grep -E '^GRAFO(-VEREDITO)?\|' | head -2)
  fi
  # 3.5.7 — COSTURA entre tasks (incidente PRD-144): Produz/Consome — consumo "existente" sem arquivo:linha provado, ou
  # "TASK-N" que nao lista o simbolo em Produz, e COSTURA-TASK|...; a /prd corrige antes do gate.
  if [ "${HARNESS_GATE_COSTURA:-on}" != "off" ] && [ -f "$SCRIPT_DIR/costura-check.mjs" ] && command -v "${HARNESS_RAG_NODE:-node}" >/dev/null 2>&1; then
    (cd "$ROOT" && "${HARNESS_RAG_NODE:-node}" "$SCRIPT_DIR/costura-check.mjs" --tasks "$(dirname "$TASK")" 2>/dev/null | grep -E "^COSTURA-TASK\|[a-z-]+\|$TASK_ID\||^COSTURA-TASK-VEREDITO\|" | head -6)
  fi
  # 3.4.26: TRECHOS — linhas citadas no contrato por arquivo (ok = dentro do arquivo; DEFASADA = alem do
  # fim). Referencia defasada e o 2o achado do teste de 08/09 (DT-543 citava :737; a linha real era 1094):
  # a /prd e o /dt corrigem a citacao antes do despacho, ou trocam por nome de funcao.
  for p in $ALVOS; do
    total="$(wc -l < "$ROOT/$p" 2>/dev/null | tr -d ' ')"; [ -n "$total" ] || continue
    linhas_citadas "$p" | while read -r ini fim; do
      if [ "$ini" -gt "${total:-0}" ]; then printf 'TRECHOS|%s|%s:%s|DEFASADA (arquivo tem %s linhas)\n' "$TASK_ID" "$p" "$ini" "$total"
      else printf 'TRECHOS|%s|%s:%s-%s|ok\n' "$TASK_ID" "$p" "$ini" "$fim"; fi
    done
  done
  # 3.4.24 (item 11c): DUELO-CHECK — `Duelo | sim` so e elegivel com <= 2 alvos de PRODUCAO e nenhum
  # arquivo NOVO (medido 01-07/09: 24 duelos, 4 aplicados; diffs de arquivo novo e de 3+ alvos nunca
  # aplicaram — pedagio de 3 min e US$ 0,17 por task sem retorno).
  if [ "${HARNESS_DUELO_CHECK:-on}" = "off" ]; then
    printf 'DUELO-CHECK|%s|off\n' "$TASK_ID"
  else
    DUELO_VAL="$(grep -oiE '\*\*Duelo\*\* *\| *(sim|auto|nao|não)' "$TASK" 2>/dev/null | head -1 | sed 's/.*| *//' | tr '[:upper:]' '[:lower:]')"
    case "$DUELO_VAL" in
      sim)
        if [ "$N_PROD" -gt 2 ]; then
          printf 'DUELO-CHECK|%s|inelegivel|%s alvos de producao (max 2)\n' "$TASK_ID" "$N_PROD"
        elif [ "$N_NOVOS" -gt 0 ]; then
          printf 'DUELO-CHECK|%s|inelegivel|arquivo novo: %s\n' "$TASK_ID" "$(printf '%s\n' "$NOVOS" | paste -sd, -)"
        else
          printf 'DUELO-CHECK|%s|ok\n' "$TASK_ID"
        fi ;;
      *) printf 'DUELO-CHECK|%s|n/a|Duelo=%s\n' "$TASK_ID" "${DUELO_VAL:-ausente}" ;;
    esac
  fi
  exit 0
fi
printf 'PACKET|%s|%s|%s|%s\n' "$OUT" "$(printf '%s\n' "$ALVOS" | paste -sd, -)" "$N_ALVOS" "$BYTES"
exit 0
