#!/usr/bin/env bash
# .claude/hooks/perfil-poda.sh (3.4.26) — motor do P1 da "Poda do Perfil": EVIDENCIA, nao opiniao.
#
# POR QUE EXISTE. O Perfil incha porque toda PRD acrescenta e nada remove (core do Taurus: 140 KB,
# ~250 entradas). Podar "porque parece obsoleto" e o pior erro possivel — a armadilha que parece
# velha e justamente a que ninguem lembra. Este script classifica CADA entrada podavel do Perfil em
# tres baldes, com a prova executavel colada (o `test`/`grep` que falhou), e por padrao NAO escreve
# nada. A regra de ouro do /deus (P1): sem evidencia executavel a entrada e VERMELHA, nao amarela.
#
#   verde    (🟢 morto-provado)  TODO caminho/arquivo/tabela/coluna/funcao citado NAO existe mais no
#                                 repo (ou a PRD de origem do carimbo esta Revertida). Entrada que cita
#                                 3 coisas e 1 morreu NAO e verde — e amarela.
#   amarelo  (🟡 suspeito)       parcialmente morta · carimbo > N meses sem nenhuma referencia viva ·
#                                 duplicata provavel de outra entrada · regra que virou convencao da
#                                 casa (.claude/convencoes/) · "verde" cujo texto fala da ausencia DE
#                                 PROPOSITO ("nunca existiu", "removido"...) — decisao humana, um a um.
#   vermelho (🔴 intocavel)      o resto — inclusive toda entrada sem carimbo cuja evidencia nao deu
#                                 para produzir.
#
# O que NAO e evidencia aqui (de proposito): `command -v` de binario (php/mysql/node variam por
# maquina — daria falso verde no macOS); caminho absoluto (C:/..., /Applications/...); caminho com
# placeholder (<recurso>, XXXX, *, NNN); arquivo de runtime (.harness-run/, logs/, *.lock); token
# em MAIUSCULAS (env/constante); arquivo local nao versionado (*.local.php, .env).
#
# Como prova vida (1 find + 1 grep -F sobre o codigo — o PC do Charles cria ~20 processos/s, entao
# NADA aqui roda por entrada): caminho -> existe no inventario (`find`, sufixo tolerante: api/x.php
# casa administrativo/api/x.php); arquivo solto -> basename no inventario; identificador
# (snake_case, funcao(), tabela.coluna) -> aparece como palavra inteira no codigo vivo (php/js/sql/
# md/json..., FORA de .claude/, prds/, docs/ — o Perfil e as PRDs citam o que morreu, so codigo
# prova vida); tabela.coluna so conta quando `tabela` e CREATE TABLE em */migrations/*, *.sql ou
# database.md.
#
# Uso (roda de dentro do projeto; --root aponta outro):
#   bash .claude/hooks/perfil-poda.sh                      # lista PODA|... + PODA-RESUMO (read-only)
#   bash .claude/hooks/perfil-poda.sh --md                 # + grava prds/_metrics/perfil-poda-<data>.md
#   bash .claude/hooks/perfil-poda.sh --resumo             # so a linha PODA-RESUMO (doctor)
#   bash .claude/hooks/perfil-poda.sh --root <dir> [--md]  # analisa outro projeto (read-only)
#   bash .claude/hooks/perfil-poda.sh --aplicar-verde      # OPT-IN: move os 🟢 p/ .claude/PERFIL-ARQUIVO.md
#   bash .claude/hooks/perfil-poda.sh --meses 18           # idade do carimbo p/ 🟡 (default knob/12)
#   bash .claude/hooks/perfil-poda.sh --convencoes <dir>   # pasta extra de convencoes (ex.: a da mestre)
#   bash .claude/hooks/perfil-poda.sh --force              # ignora HARNESS_PERFIL_PODA='off'
#
# Saida (stdout):
#   PODA|<verde|amarelo|vermelho>|<secao>|<linha>|<80 primeiros chars>|<evidencia>   (1 por entrada)
#   PODA-RESUMO|entradas=N|verde=N|amarelo=N|vermelho=N|kb=N
#   PODA-MD|<arquivo>                                  (com --md)
#   PODA-APLICADA|verde=N|arquivo=<PERFIL-ARQUIVO>     (com --aplicar-verde; N=0 nao toca nada)
#   PODA-OFF|...                                       (knob HARNESS_PERFIL_PODA='off' sem --force)
# Knobs (env > harness.env.local > harness.env): HARNESS_PERFIL_PODA (sugerir|auto-verde|off),
#   HARNESS_PERFIL_PODA_MESES (12), HARNESS_PERFIL_PODA_SECOES_FIXAS (csv extra de secoes a ignorar).
# Exit 0 sempre que analisou (contagens sao sinal, nao erro); 2 uso invalido; 3 sem Perfil.
# Portavel: bash 3.2 (macOS) + Git Bash; awk BWK (sem gensub/asort); sem os GNU-ismos de sed/find
# (edicao in-place, printf do find) nem arrays lidos em bloco.
set -u

MODO_MD=0; MODO_RESUMO=0; MODO_APLICAR=0; FORCE=0; ROOT=""; MESES=""; CONV_EXTRA=""
while [ $# -gt 0 ]; do
  case "$1" in
    --md) MODO_MD=1 ;;
    --resumo) MODO_RESUMO=1 ;;
    --aplicar-verde) MODO_APLICAR=1 ;;
    --force) FORCE=1 ;;
    --root) shift; ROOT="${1:-}" ;;
    --meses) shift; MESES="${1:-}" ;;
    --convencoes) shift; CONV_EXTRA="${1:-}" ;;
    -h|--help) sed -n '2,52p' "$0"; exit 0 ;;
    *) echo "perfil-poda: argumento desconhecido: $1" >&2; exit 2 ;;
  esac
  shift
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -n "$ROOT" ]; then
  ROOT="$(cd "$ROOT" 2>/dev/null && pwd)" || { echo "perfil-poda: --root invalido" >&2; exit 2; }
else
  ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
fi
CLAUDE_DIR="$ROOT/.claude"
PERFIL="$CLAUDE_DIR/PERFIL-PROJETO.md"
ARQUIVO="$CLAUDE_DIR/PERFIL-ARQUIVO.md"
[ -f "$PERFIL" ] || { echo "PODA-SEM-PERFIL|$PERFIL nao existe"; exit 3; }

# --- knobs: env > harness.env.local > harness.env > default ------------------------------------
knob() { # knob NOME DEFAULT
  local v="" f
  eval "v=\"\${$1:-}\""
  if [ -z "$v" ]; then
    for f in "${HOME:-}/.harness.env.local" "$CLAUDE_DIR/harness.env.local" "$CLAUDE_DIR/harness.env" "$CLAUDE_DIR/hooks/_defaults.env"; do   # 3.5.7: camadas (o 1o achado vence)
      [ -f "$f" ] || continue
      v="$(grep -E "^$1=" "$f" 2>/dev/null | head -1 | cut -d= -f2- | tr -d "'\"[:space:]")"
      [ -n "$v" ] && break
    done
  fi
  [ -n "$v" ] && printf '%s' "$v" || printf '%s' "$2"
}
KNOB="$(knob HARNESS_PERFIL_PODA sugerir)"
[ -z "$MESES" ] && MESES="$(knob HARNESS_PERFIL_PODA_MESES 12)"
case "$MESES" in ''|*[!0-9]*) MESES=12 ;; esac
FIXAS_EXTRA="$(knob HARNESS_PERFIL_PODA_SECOES_FIXAS '')"
if [ "$KNOB" = "off" ] && [ "$FORCE" != "1" ]; then
  echo "PODA-OFF|HARNESS_PERFIL_PODA='off' — nada analisado (use --force para rodar mesmo assim)"
  exit 0
fi

HOJE="$(date +%Y-%m-%d)"; HOJE_Y="$(date +%Y)"; HOJE_M="$(date +%m)"; HOJE_M="${HOJE_M#0}"
TMP="${TMPDIR:-/tmp}/perfil-poda.$$"; mkdir -p "$TMP"; trap 'rm -rf "$TMP"' EXIT
export LC_ALL=C   # length()=bytes no awk; regex sem surpresa multibyte

# --- 1. inventario do repo (1 find) --------------------------------------------------------------
( cd "$ROOT" && find . -type f \
    -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/vendor/*' \
    -not -path '*/dist/*' -not -path '*/build/*' -not -path '*/playwright-report/*' \
    -not -path '*/test-results/*' -not -path '*/coverage/*' 2>/dev/null \
  | sed 's#^\./##' ) > "$TMP/files.txt"
# fontes de schema (descoberta generica): */migrations/*, *.sql, database.md — fora de .claude/prds
grep -E '(^|/)migrations/|\.sql$|(^|/)database\.md$' "$TMP/files.txt" | grep -v -E '^(\.claude|prds|codex-reviews|node_modules)/' > "$TMP/schema-files.txt"
# convencoes da casa (projeto + extra): tokens entre crases por arquivo
: > "$TMP/conv-index.txt"
for d in "$CLAUDE_DIR/convencoes" "$CONV_EXTRA"; do
  [ -n "$d" ] && [ -d "$d" ] || continue
  for f in "$d"/*.md; do
    [ -f "$f" ] || continue
    case "$(basename "$f")" in INDEX.md|_TEMPLATE*) continue ;; esac
    grep -oE '`[^`]{4,60}`' "$f" 2>/dev/null | tr -d '`' | sort -u | sed "s#^#$(basename "$f")	#" >> "$TMP/conv-index.txt"
  done
done
# status das PRDs no prds/INDEX.md (coluna 3) — para "PRD de origem revertida"
if [ -f "$ROOT/prds/INDEX.md" ]; then
  awk -F'|' '/^\| *(PRD|LOTE|DT)-[0-9]+/ { id=$2; st=$4; gsub(/^ +| +$/, "", id); gsub(/^ +| +$/, "", st); sub(/ .*/, "", id); printf "%s\t%s\n", id, substr(st, 1, 60) }' "$ROOT/prds/INDEX.md" > "$TMP/prd-status.tsv"
else
  : > "$TMP/prd-status.tsv"
fi

# --- 2. parse do Perfil -> entradas (awk BWK) ----------------------------------------------------
# entries.tsv: id \t ini \t fim \t bytes \t secao \t tipo \t data \t origem \t texto(1 linha)
FIXAS_DEFAULT='identificacao,cli,execucao autonoma,allowlist,banco,aplicacao,lint,codex review,agentes,convencoes,economia,nivel de esforco,manual vivo,plataformas,worktrees,compatibilidade,timezone'
norm() { printf '%s' "$1" | tr 'A-Z' 'a-z' | sed 's/á/a/g; s/à/a/g; s/ã/a/g; s/â/a/g; s/é/e/g; s/ê/e/g; s/í/i/g; s/ó/o/g; s/ô/o/g; s/õ/o/g; s/ú/u/g; s/ç/c/g'; }
FIXAS="$(norm "$FIXAS_DEFAULT,$FIXAS_EXTRA")"

awk -v fixas="$FIXAS" '
BEGIN { nf = split(fixas, FX, ","); for (i = 1; i <= nf; i++) gsub(/^ +| +$/, "", FX[i]); id = 0; podavel = 0; secao = ""; sub3 = ""; tipo = ""; ini = 0; fim = 0; texto = ""; bytes = 0 }
function normaliza(s,   t) { t = s; gsub(/\303\241|\303\240|\303\243|\303\242|\303\201|\303\200|\303\203|\303\202/, "a", t); gsub(/\303\251|\303\252|\303\211|\303\212/, "e", t); gsub(/\303\255|\303\215/, "i", t); gsub(/\303\263|\303\264|\303\265|\303\223|\303\224|\303\225/, "o", t); gsub(/\303\272|\303\232/, "u", t); gsub(/\303\247|\303\207/, "c", t); gsub(/[\200-\377]+/, " ", t); return tolower(t) }
function fixa(nome,   n, i) { n = normaliza(nome); for (i = 1; i <= nf; i++) if (FX[i] != "" && index(n, FX[i]) == 1) return 1; return 0 }
function fecha(   d, o, t) {
  if (tipo == "") return
  t = texto; d = ""; o = ""
  if (match(t, /\[20[0-9][0-9]-[0-9][0-9]-[0-9][0-9] [^]]*\]/)) { d = substr(t, RSTART + 1, 10); o = substr(t, RSTART + 12, RLENGTH - 13); sub(/^[^A-Za-z0-9]+/, "", o) }
  else if (match(t, /\((PRD|LOTE|DT)-[0-9]+[^)]*\)/)) { o = substr(t, RSTART + 1, RLENGTH - 2) }
  gsub(/\t/, " ", t)
  id++
  printf "%d\t%d\t%d\t%d\t%s\t%s\t%s\t%s\t%s\n", id, ini, fim, bytes, secao, tipo, d, o, t
  tipo = ""; texto = ""; bytes = 0
}
{
  linha = $0; sub(/\r$/, "", linha)
  if (linha ~ /^## /) { fecha(); secao = substr(linha, 4); sub(/[ \t]+$/, "", secao); podavel = !fixa(secao); sub3 = ""; next }
  if (!podavel) next
  if (linha ~ /^#+ /) { fecha(); sub3 = linha; sub(/^#+ +/, "", sub3); next }
  if (linha ~ /^```/) { fecha(); cod = !cod; next }
  if (cod) next
  if (linha ~ /^[ \t]*$/) { fecha(); next }
  if (linha ~ /^\|/) {
    if (tipo != "tabela") { fecha(); tipo = "tabela"; ini = NR; texto = (sub3 != "" ? "[" sub3 "] " : "") }
    fim = NR; texto = texto " " linha; bytes += length($0) + 1; next
  }
  if (linha ~ /^>/) {
    if (tipo != "quote") { fecha(); tipo = "quote"; ini = NR; texto = "" }
    l2 = linha; sub(/^>[ \t]?/, "", l2); fim = NR; texto = texto " " l2; bytes += length($0) + 1; next
  }
  if (linha ~ /^[ \t]*([-*+]|[0-9]+\.) /) { fecha(); tipo = "lista"; ini = NR; fim = NR; texto = linha; bytes = length($0) + 1; next }
  if (tipo == "" || tipo == "tabela" || tipo == "quote") { fecha(); tipo = "paragrafo"; ini = NR; texto = "" }
  fim = NR; texto = texto " " linha; bytes += length($0) + 1
}
END { fecha() }
' "$PERFIL" > "$TMP/entries.tsv"
N_ENT="$(wc -l < "$TMP/entries.tsv" | tr -d ' ')"

# --- 3. identificadores citados -> 1 grep -F no codigo e 1 no schema ----------------------------
awk -F'\t' '{
  s = $9
  while (match(s, /`[^`]+`/)) {
    tk = substr(s, RSTART + 1, RLENGTH - 2); s = substr(s, RSTART + RLENGTH)
    gsub(/^\$|\(\)$/, "", tk); sub(/:[0-9-]+$/, "", tk)
    if (tk ~ /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/ && length(tk) >= 5) print tk                       # snake_case
    else if (tk ~ /^_?[a-z][A-Za-z0-9]*$/ && tk ~ /[A-Z]/) print tk                                 # funcaoCamel (_privada tambem)
    else if (tk ~ /^[a-z][a-z0-9_]+\.[a-z][a-z0-9_]+$/) { split(tk, P, "."); print P[1]; print P[2] } # tabela.coluna
  }
}' "$TMP/entries.tsv" | sort -u > "$TMP/cited.txt"
: > "$TMP/alive-code.txt"; : > "$TMP/alive-schema.txt"; : > "$TMP/tables.txt"
if [ -s "$TMP/cited.txt" ]; then
  ( cd "$ROOT" && grep -rhowF -f "$TMP/cited.txt" \
      --include='*.php' --include='*.js' --include='*.mjs' --include='*.cjs' --include='*.ts' --include='*.sql' \
      --include='*.sh' --include='*.md' --include='*.json' --include='*.yml' --include='*.yaml' --include='*.html' --include='*.py' \
      --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=vendor --exclude-dir=dist --exclude-dir=build \
      --exclude-dir=playwright-report --exclude-dir=test-results --exclude-dir=coverage \
      --exclude-dir=.claude --exclude-dir=prds --exclude-dir=docs --exclude-dir=codex-reviews \
      --exclude='*.min.js' --exclude='package-lock.json' . 2>/dev/null ) | sort -u > "$TMP/alive-code.txt"
  if [ -s "$TMP/schema-files.txt" ]; then
    ( cd "$ROOT" && tr '\n' '\0' < "$TMP/schema-files.txt" | xargs -0 grep -howF -f "$TMP/cited.txt" 2>/dev/null ) | sort -u > "$TMP/alive-schema.txt"
  fi
fi
if [ -s "$TMP/schema-files.txt" ]; then
  ( cd "$ROOT" && tr '\n' '\0' < "$TMP/schema-files.txt" | xargs -0 grep -ohiE '(CREATE|ALTER) TABLE( IF NOT EXISTS)?[ `"'"'"']*[A-Za-z_][A-Za-z0-9_]*|^### *`[a-z_][a-z0-9_]*`' 2>/dev/null ) \
    | sed 's/.*[ `"'"'"'#]//; s/`//g' | tr 'A-Z' 'a-z' | sort -u > "$TMP/tables.txt"
fi

# --- 4. veredito por entrada + duplicatas + convencoes (1 awk) ----------------------------------
# final.tsv: id \t balde \t secao \t ini \t fim \t bytes \t texto80 \t evidencia \t origem \t data
awk -F'\t' -v OFS='\t' -v MESES="$MESES" -v HY="$HOJE_Y" -v HM="$HOJE_M" '
function normaliza(s,   t) { t = s; gsub(/\303\241|\303\240|\303\243|\303\242|\303\201|\303\200|\303\203|\303\202/, "a", t); gsub(/\303\251|\303\252|\303\211|\303\212/, "e", t); gsub(/\303\255|\303\215/, "i", t); gsub(/\303\263|\303\264|\303\265|\303\223|\303\224|\303\225/, "o", t); gsub(/\303\272|\303\232/, "u", t); gsub(/\303\247|\303\207/, "c", t); gsub(/[\200-\377]+/, " ", t); return tolower(t) }
function fim_de(p,   n) { n = split(p, Q, "/"); return Q[n] }
# caminho existe? exato, sob .claude/, ou como sufixo de algum arquivo com o mesmo basename
function path_ok(p,   b, k, m, i, c) {
  if (p in FILE) return 1
  if ((".claude/" p) in FILE) return 1
  b = fim_de(p); if (!(b in BASE)) return 0
  m = split(BASE[b], C, "\037")
  for (i = 1; i <= m; i++) { c = C[i]; if (c == "") continue; if (length(c) > length(p) && substr(c, length(c) - length(p)) == "/" p) return 1 }
  return 0
}
function skip_path(p) {
  if (p ~ /^(https?:|www\.)/ || p ~ /\.(com|br|io|org|net|dev)\//) return 1        # URL/dominio
  if (p ~ /^(\/|[A-Za-z]:\/|~\/|%)/) return 1                                       # absoluto (maquina)
  if (p ~ /[<>*{}]|XXXX|NNN|\.\.\.|\342\200\246/) return 1                          # placeholder
  if (p ~ /\.harness-run\/|(^|\/)(logs|tmp|cache|screenshots)\/|\.(lock|log)$/) return 1  # runtime
  if (p ~ /^[0-9]/ || p ~ /\/[0-9]+(\.[0-9]+)+/) return 1                             # versao (v25.0/…, 1/2)
  if (p ~ /\.(local\.php|env)$/ || p ~ /(^|\/)\.env/) return 1                        # local nao versionado
  return 0
}
function add_term(i, t) { if (index(T[i], "\037" t "\037") == 0) { T[i] = (T[i] == "" ? "\037" : T[i]) t "\037"; DF[t]++ } }
BEGIN { RE_AUS = "nunca existiu|nao existe|inexistente|removid|apagad|renomead|deletad|extint|substituid|nao cri(e|ar)|hipotetic" }
FILENAME == ARGV[1] { FILE[$0] = 1; b = fim_de($0); BASE[b] = BASE[b] "\037" $0; next }
FILENAME == ARGV[2] { AC[$0] = 1; next }
FILENAME == ARGV[3] { AS[$0] = 1; next }
FILENAME == ARGV[4] { TB[$0] = 1; ntab++; next }
FILENAME == ARGV[5] { ST[$1] = $2; next }
FILENAME == ARGV[6] { CV[$1 "\037" $2] = 1; CVN[$1] = 1; next }
{
  id = $1; ini = $2; fim = $3; bytes = $4; secao = $5; data = $7; origem = $8; texto = $9
  N = id; INI[id] = ini; FIM[id] = fim; BYT[id] = bytes; SEC[id] = secao; ORI[id] = origem; DAT[id] = data; TIP[id] = $6
  t80 = texto; sub(/^ +/, "", t80); gsub(/\*\*/, "", t80); T80[id] = substr(t80, 1, 80)
  vivos = 0; mortos = 0; fortes = 0; evm = ""; evv = ""; delete SEEN
  # 4a. caminhos com / e extensao. Caminho ABSOLUTO (C:/..., /Applications/..., ~/, %VAR%) e de
  # maquina, nao do repo: sai do texto ANTES da varredura (senao "C:/laragon/x.exe" vira "laragon/x.exe").
  s = " " texto
  gsub(/[A-Za-z]:[\/\\][^ `)]*/, " ", s); gsub(/[ `(]\/[A-Za-z0-9_.\/-]+/, " ", s); gsub(/~\/[^ `)]*/, " ", s); gsub(/%[A-Za-z_]+%[^ `)]*/, " ", s)
  while (match(s, /[A-Za-z0-9_.@%~-]+(\/[A-Za-z0-9_.@<>*{}-]+)+\.[A-Za-z0-9]{1,6}(:[0-9]+(-[0-9]+)?)?/)) {
    p = substr(s, RSTART, RLENGTH); s = substr(s, RSTART + RLENGTH)
    sub(/:[0-9-]+$/, "", p); sub(/[.,;:)]+$/, "", p); sub(/^\.\//, "", p)
    if (skip_path(p) || (p in SEEN)) continue
    SEEN[p] = 1; SEEN[fim_de(p)] = 1
    if (path_ok(p)) { vivos++; evv = evv " " p } else { mortos++; fortes++; evm = evm " test -e " p " → AUSENTE;" }
  }
  # 4b. arquivo solto entre crases (basename)
  s = texto
  while (match(s, /`[A-Za-z0-9_.-]{4,}\.(php|js|mjs|cjs|ts|sh|sql|md|json|css|html|py|yml|yaml)(:[0-9]+(-[0-9]+)?)?`/)) {
    b = substr(s, RSTART + 1, RLENGTH - 2); s = substr(s, RSTART + RLENGTH)
    sub(/:[0-9-]+$/, "", b)
    if (b ~ /[<>*]|XXXX|NNN/ || b ~ /\.local\./ || b ~ /^\.env/ || (b in SEEN)) continue
    SEEN[b] = 1
    if (b in BASE) { vivos++; evv = evv " " b } else { mortos++; fortes++; evm = evm " arquivo " b " → NENHUM no repo;" }
  }
  # 4c. tabela.coluna / snake_case / funcao() entre crases
  s = texto
  while (match(s, /`[^`]+`/)) {
    tk = substr(s, RSTART + 1, RLENGTH - 2); s = substr(s, RSTART + RLENGTH)
    paren = (tk ~ /\(\)$/)
    gsub(/^\$|\(\)$/, "", tk); sub(/:[0-9-]+$/, "", tk)
    if (tk in SEEN) continue
    if (tk ~ /^[a-z][a-z0-9_]+\.[a-z][a-z0-9_]+$/) {
      split(tk, P, "."); tb = P[1]; col = P[2]
      if (col ~ /^(php|js|mjs|ts|json|md|sql|css|html|txt|sh|log|lock|spec|env|yml|yaml|xml|csv|png|jpg|pdf|local|example|min|test)$/) continue
      SEEN[tk] = 1
      if (tb in TB) { if ((col in AS) || (col in AC)) { vivos++; evv = evv " " tk } else { mortos++; fortes++; evm = evm " grep -rw " col " migrations+schema+codigo → AUSENTE (tabela " tb " existe);" } }
      else if (ntab > 0 && !(tb in AC) && !(tb in AS) && length(tb) >= 5 && index(tb, "_") > 0) { mortos++; fortes++; evm = evm " tabela " tb " → NAO esta no schema nem no codigo;" }
    } else if ((tk ~ /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/ && length(tk) >= 5) || (paren && tk ~ /^_?[a-z][A-Za-z0-9]*$/ && tk ~ /[A-Z]/)) {
      SEEN[tk] = 1
      if ((tk in AC) || (tk in AS)) { vivos++; evv = evv " " tk } else { mortos++; evm = evm " grep -rw " tk " codigo+schema → AUSENTE;" }
    }
  }
  # 4d. PRD de origem revertida
  revert = ""; o = origem; sub(/[^A-Za-z0-9-].*/, "", o)
  if (o != "" && (o in ST) && normaliza(ST[o]) ~ /^[ *_]*(revertid|reverted|descartad|cancelad)/) revert = "PRD de origem " o " marcada \"" ST[o] "\" no prds/INDEX.md;"
  # 4e. idade do carimbo
  idade = -1
  if (data != "") { y = substr(data, 1, 4) + 0; m = substr(data, 6, 2) + 0; idade = (HY * 12 + HM) - (y * 12 + m) }
  # 4f. balde
  aus = (normaliza(texto) ~ RE_AUS)
  balde = "vermelho"; ev = ""
  if (revert != "") { balde = "verde"; ev = revert }
  # so identificador morto (funcao/chave snake_case) NUNCA prova sozinho: pode ser nome externo (tool
  # MCP, campo de API) ou funcao renomeada com a licao ainda valida — vira amarelo, nao verde
  else if (mortos > 0 && vivos == 0 && fortes == 0) { balde = "amarelo"; ev = "so identificador(es) morto(s), nenhum caminho/arquivo/tabela para provar (renomeado? nome externo?) — conferir:" evm }
  else if (mortos > 0 && vivos == 0) { if (aus) { balde = "amarelo"; ev = "tudo que cita esta morto (" mortos ") MAS o texto fala da ausencia de proposito — conferir:" evm } else { balde = "verde"; ev = evm } }
  else if (mortos > 0) { balde = "amarelo"; ev = "parcialmente morta (vivos=" vivos " mortos=" mortos "):" evm " vivos:" evv }
  else if (idade > MESES && vivos == 0) { balde = "amarelo"; ev = "carimbo " data " (" idade " meses > " MESES ") e nenhuma referencia verificavel viva" }
  else { ev = (vivos > 0 ? "refs vivas=" vivos ":" evv : "sem referencia verificavel"); ev = ev (data != "" ? "; carimbo " data " (" idade " m)" : "; sem carimbo") }
  BAL[id] = balde; EV[id] = ev
  # termos p/ duplicata: crases (>=5 chars) + palavras >= 8 letras do titulo em negrito
  s = texto
  while (match(s, /`[^`]+`/)) { tk = substr(s, RSTART + 1, RLENGTH - 2); s = substr(s, RSTART + RLENGTH); gsub(/[()$]/, "", tk); sub(/:[0-9-]+$/, "", tk); if (tk ~ /^[A-Za-z0-9_.\/-]+$/ && length(tk) >= 5) add_term(id, "`" normaliza(tk)) }
  if (match(texto, /\*\*[^*]{8,}\*\*/)) { tit = normaliza(substr(texto, RSTART + 2, RLENGTH - 4)); gsub(/[^a-z0-9 ]/, " ", tit); k = split(tit, W, " "); for (j = 1; j <= k; j++) if (length(W[j]) >= 8) add_term(id, W[j]) }
  # convencoes: >= 3 tokens de crase presentes na MESMA convencao
  delete CC; s = texto
  while (match(s, /`[^`]{4,60}`/)) { tk = substr(s, RSTART + 1, RLENGTH - 2); s = substr(s, RSTART + RLENGTH); for (c in CVN) if ((c "\037" tk) in CV) CC[c]++ }
  for (c in CC) if (CC[c] >= 3) EXTRA[id] = EXTRA[id] "regra ja e convencao da casa: " c " (" CC[c] " termos em comum); "
}
END {
  # duplicatas: par com >= 2 termos-chave RAROS em comum (termo em <= 3 entradas do Perfil inteiro —
  # sem a raridade, secoes densas como ACL viram "tudo duplicata de tudo")
  for (a = 1; a < N; a++) { if (T[a] == "") continue
    for (b = a + 1; b <= N; b++) { if (T[b] == "") continue
      raros = 0; lista = ""
      k = split(T[a], A, "\037")
      for (j = 1; j <= k; j++) { x = A[j]; if (x == "") continue
        if (index(T[b], "\037" x "\037") > 0 && DF[x] <= 3) { raros++; lista = lista x ", " } }
      # tabela (integracao, estrutura) toca dezenas de termos por natureza: exige 3, nao 2
      if (raros >= ((TIP[a] == "tabela" || TIP[b] == "tabela") ? 3 : 2)) { lista = substr(lista, 1, length(lista) - 2); EXTRA[a] = EXTRA[a] "duplicata provavel de L" INI[b] " (" lista "); "; EXTRA[b] = EXTRA[b] "duplicata provavel de L" INI[a] " (" lista "); " }
    } }
  for (i = 1; i <= N; i++) {
    balde = BAL[i]; ev = EV[i]; x = EXTRA[i]; sub(/; $/, "", x)
    if (x != "") { if (balde == "vermelho") { balde = "amarelo"; ev = x " | " ev } else ev = ev " | " x }
    gsub(/\|/, "/", T80[i])
    print i, balde, SEC[i], INI[i], FIM[i], BYT[i], T80[i], ev, ORI[i], DAT[i]
  }
}' "$TMP/files.txt" "$TMP/alive-code.txt" "$TMP/alive-schema.txt" "$TMP/tables.txt" "$TMP/prd-status.tsv" "$TMP/conv-index.txt" "$TMP/entries.tsv" > "$TMP/final.tsv"

# --- 5. saida -----------------------------------------------------------------------------------
V=$(awk -F'\t' '$2=="verde"' "$TMP/final.tsv" | wc -l | tr -d ' ')
A=$(awk -F'\t' '$2=="amarelo"' "$TMP/final.tsv" | wc -l | tr -d ' ')
R=$(awk -F'\t' '$2=="vermelho"' "$TMP/final.tsv" | wc -l | tr -d ' ')
PB=$(wc -c < "$PERFIL" | tr -d ' ')
KB=$(( (PB + 512) / 1024 ))
BV=$(awk -F'\t' '$2=="verde"{s+=$6} END{print s+0}' "$TMP/final.tsv")
BA=$(awk -F'\t' '$2=="amarelo"{s+=$6} END{print s+0}' "$TMP/final.tsv")
RESUMO="PODA-RESUMO|entradas=$N_ENT|verde=$V|amarelo=$A|vermelho=$R|kb=$KB"

if [ "$MODO_RESUMO" = "1" ]; then echo "$RESUMO"; exit 0; fi
awk -F'\t' '{ printf "PODA|%s|%s|%s|%s|%s\n", $2, $3, $4, $7, $8 }' "$TMP/final.tsv"
echo "$RESUMO"

# --- 6. --md ------------------------------------------------------------------------------------
if [ "$MODO_MD" = "1" ]; then
  mkdir -p "$ROOT/prds/_metrics"
  MD="$ROOT/prds/_metrics/perfil-poda-$HOJE.md"
  {
    echo "# Poda do Perfil — candidatos com evidência ($HOJE)"
    echo
    echo "> Gerado por \`bash .claude/hooks/perfil-poda.sh --md\` (3.4.26). **Read-only**: nada foi movido."
    echo "> Régua do \`/deus\` P1: 🟢 só com prova executável (tudo que a entrada cita morreu); 🟡 é decisão humana, um a um; 🔴 fica."
    echo
    echo "| Métrica | Valor |"; echo "|---|---|"
    echo "| Perfil hoje | $KB KB ($N_ENT entradas podáveis) |"
    echo "| 🟢 morto-provado | $V entradas · $(( (BV+512)/1024 )) KB |"
    echo "| 🟡 suspeito | $A entradas · $(( (BA+512)/1024 )) KB |"
    echo "| 🔴 intocável | $R entradas |"
    echo "| KB estimado após 🟢 | $(( (PB - BV + 512) / 1024 )) KB |"
    echo "| KB estimado após 🟢+🟡 | $(( (PB - BV - BA + 512) / 1024 )) KB |"
    echo
    echo "## Peso por seção (bytes das entradas podáveis)"; echo
    echo "| Seção | Entradas | KB | 🟢 | 🟡 | 🔴 |"; echo "|---|---|---|---|---|---|"
    awk -F'\t' '{ n[$3]++; b[$3]+=$6; if($2=="verde")v[$3]++; else if($2=="amarelo")a[$3]++; else r[$3]++ } END { for (s in n) printf "%d\t| %s | %d | %d | %d | %d | %d |\n", b[s], s, n[s], (b[s]+512)/1024, v[s]+0, a[s]+0, r[s]+0 }' "$TMP/final.tsv" | sort -rn | cut -f2-
    for balde in verde amarelo vermelho; do
      case $balde in verde) titulo="🟢 Morto-provado (podar — evidência colada)";; amarelo) titulo="🟡 Suspeito (decisão humana, um a um)";; *) titulo="🔴 Intocável";; esac
      echo; echo "## $titulo"; echo
      echo "| Linha | Seção | Entrada | Evidência |"; echo "|---|---|---|---|"
      awk -F'\t' -v b="$balde" '$2==b { t=$7; e=$8; gsub(/\|/, "/", e); printf "| %s | %s | %s | %s |\n", $4, $3, t, e }' "$TMP/final.tsv"
    done
    echo; echo "---"; echo "$RESUMO"
  } > "$MD"
  echo "PODA-MD|${MD#$ROOT/}"
fi

# --- 7. --aplicar-verde (opt-in; move, nunca apaga) --------------------------------------------
if [ "$MODO_APLICAR" = "1" ]; then
  if [ "$V" -eq 0 ]; then echo "PODA-APLICADA|verde=0|arquivo=${ARQUIVO#$ROOT/}|nada a mover"; exit 0; fi
  awk -F'\t' '$2=="verde" { print $4 "\t" $5 "\t" $3 "\t" $8 }' "$TMP/final.tsv" | sort -n > "$TMP/ranges.tsv"
  {
    if [ ! -f "$ARQUIVO" ]; then
      echo "# Perfil — ARQUIVO (entradas podadas)"
      echo
      echo "> **Nada é deletado: poda é mudança de lugar.** Cada bloco abaixo saiu do \`PERFIL-PROJETO.md\` com a"
      echo "> data e a prova executável (\`perfil-poda.sh --aplicar-verde\`). Para reverter, cole o texto de volta"
      echo "> na seção de origem e rode \`bash .claude/hooks/perfil-frescor.sh --carimbar\`."
    else
      cat "$ARQUIVO"
    fi
    echo
    echo "## Poda de $HOJE — $V entrada(s) 🟢 (perfil-poda.sh --aplicar-verde)"
    while IFS="$(printf '\t')" read -r ini fim secao ev; do
      echo
      echo "### Seção «$secao» · linhas $ini–$fim do Perfil em $HOJE"
      echo
      echo "**Evidência:** $ev"
      echo
      sed -n "${ini},${fim}p" "$PERFIL"
    done < "$TMP/ranges.tsv"
  } > "$TMP/arquivo.new"
  # Perfil sem os ranges (+ a linha em branco logo apos cada range, para nao deixar buraco duplo)
  awk -F'\t' 'NR == FNR { for (i = $1; i <= $2; i++) SK[i] = 1; TAIL[$2 + 1] = 1; next }
    { if (FNR in SK) next; if ((FNR in TAIL) && $0 ~ /^[ \t]*\r?$/) next; print }' "$TMP/ranges.tsv" "$PERFIL" > "$TMP/perfil.new"
  cat "$TMP/arquivo.new" > "$ARQUIVO"
  cat "$TMP/perfil.new" > "$PERFIL"
  echo "PODA-APLICADA|verde=$V|arquivo=${ARQUIVO#$ROOT/}"
  echo "PODA-AVISO|o PERFIL-RESUMO.md precisa ser regerado (se citava algo podado) e carimbado: bash .claude/hooks/perfil-frescor.sh --carimbar"
fi
exit 0
