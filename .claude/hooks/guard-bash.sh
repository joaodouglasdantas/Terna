#!/usr/bin/env bash
# .claude/hooks/guard-bash.sh
# Hook PreToolUse (matcher: Bash) + PostToolUse/PostToolUseFailure (matcher: Bash, com --post).
# DUAS guardas deterministicas, independentes do classificador de permissao:
#
# 1. TEMPORARIOS (1.8.0) — nega (exit 2) comando Bash que redirecione ESCRITA
#    (>, >>, tee) para caminho absoluto de raiz fora do projeto ('/arquivo',
#    '/tmp/...'). No Git Bash/Windows, '/foo' resolve para C:\Program Files\Git\
#    -> fora do sandbox -> prompt de permissao que PENDURA execucao autonoma
#    (incidente real: 4h15).
#
# 2. ANTI-ESPIRAL (1.9.0) — detecta o MESMO comando tentado N vezes sem nunca
#    executar (assinatura de classificador de permissao INDISPONIVEL fazendo
#    fail-closed, ou negacao repetida) e nega (exit 2) com mensagem DEFINITIVA:
#    em vez do "wait briefly and try again" do classificador (que convida a
#    re-tentar para sempre — incidente real: espiral de alucinacao na exec da
#    PRD-007 do aec-backend, 09/07/2026), o modelo recebe a instrucao de PARAR
#    a fase autonoma com sinal claro. Dispara o notify.sh (alerta local) e loga
#    o evento ({"type":"spiral"}) para a telemetria.
#
#    Mecanica: cada PreToolUse incrementa um contador por hash do comando em
#    .claude/.harness-run/exec-attempts/ (PreToolUse roda ANTES da avaliacao de
#    permissao — lifecycle documentado: PreToolUse -> PermissionRequest ->
#    PostToolUse). O modo --post LIMPA o contador quando o comando de fato
#    executou. Wirear --post nos DOIS eventos: PostToolUse (sucesso) E
#    PostToolUseFailure (executou com erro) — senao um comando que executa e
#    falha (teste vermelho re-rodado) contaria como espiral.
#
#    FUSIVEL DE SEGURANCA: o contador so ARMA se o wiring '--post' aparecer
#    PELO MENOS 2x no settings.json (PostToolUse E PostToolUseFailure) — sem
#    ele os contadores nunca limpariam e comandos legitimos repetidos
#    ("git status" 3x) seriam bloqueados a toa. Fica DORMENTE ate o wiring
#    completo existir; o harness-doctor.sh --autonomia confere.
#
# Complementa (nao substitui) o hook denied.sh (PermissionDenied): o denied.sh
# reage a CADA negacao do classificador (alerta + contexto ao modelo); esta
# guarda e o freio de arruinamento — corta a repeticao do mesmo comando.
#
# Config (.claude/harness.env):
#   HARNESS_GUARD_BASH='1'              — guarda de temporarios (default ligado)
#   HARNESS_GUARD_SPIRAL='1'            — anti-espiral (default ligado; exige wiring --post)
#   HARNESS_GUARD_SPIRAL_N='3'          — nega a partir da N-esima tentativa sem execucao
#   HARNESS_GUARD_SPIRAL_WINDOW_MIN='15'— janela; tentativa mais velha que isso reseta o contador
# Bypass de emergencia: HARNESS_SKIP_GUARD_BASH=1 / HARNESS_SKIP_GUARD_SPIRAL=1
#
# Comportamento:
#   exit 0 => ok / hook desligado / sem comando analisavel (nunca bloqueia no escuro)
#   exit 2 => bloqueado (stderr orienta o modelo — autocorrecao sem esperar humano)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 3.5.7: camadas de configuracao — hooks/_env.sh carrega _defaults.env -> harness.env -> harness.env.local -> ~/.harness.env.local
# (ambiente da sessao vence). Antes cada hook tinha o proprio loop.
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_env.sh"

MODE="pre"
[ "${1:-}" = "--post" ] && MODE="post"

INPUT="$(cat)"

# Extrai o comando. jq e o caminho robusto; sem jq, o fallback e conservador
# (extracao vazia = nao bloqueia — falso negativo e melhor que bloqueio cego).
if command -v jq >/dev/null 2>&1; then
  CMD="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)"
else
  CMD="$(printf '%s' "$INPUT" \
    | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' \
    | head -1 \
    | sed -E 's/.*"command"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/')"
fi
[ -z "$CMD" ] && exit 0

RUN_DIR="$SCRIPT_DIR/../.harness-run"
ATT_DIR="$RUN_DIR/exec-attempts"
CMD_HASH="$(printf '%s' "$CMD" | cksum 2>/dev/null | awk '{print $1"-"$2}')"

# ---------------------------------------------------------------------------
# MODO --post (PostToolUse/PostToolUseFailure Bash): o comando EXECUTOU
# (com ou sem erro) -> limpa o contador dele. Negacao de permissao NAO passa
# por aqui (nesse caso dispara PermissionDenied, nao PostToolUse*).
# ---------------------------------------------------------------------------
if [ "$MODE" = "post" ]; then
  [ -n "$CMD_HASH" ] && rm -f "$ATT_DIR/$CMD_HASH" 2>/dev/null
  # higiene oportunista: contadores parados ha mais de 60 min sao lixo
  [ -d "$ATT_DIR" ] && find "$ATT_DIR" -type f -mmin +60 -delete 2>/dev/null
  exit 0
fi

# ---------------------------------------------------------------------------
# GUARDA 0 (3.4.21) — leitura PURA via Bash em SUBAGENTE => nega com a ferramenta certa.
# Paridade (regua simplificada) com o guard-bash.mjs: uma linha, sem redirecao/substituicao,
# `cd X &&` inicial opcional, e TODOS os segmentos (| ; && ||) sao cat/head/tail/less/more/tac/
# nl/grep/egrep/fgrep/rg/ls/dir/tree/find/wc/sed -n (ou neutros: echo/printf/true/pwd/date).
# Medido 04/09: 1.966 de 3.007 Bash de subagente eram isso apesar da dica instrutiva (3.4.12).
# HARNESS_GUARD_READ_VIA_BASH: 'agentes' (default) | 'todos' | 'off'.
# ---------------------------------------------------------------------------
MODO_LEIT="${HARNESS_GUARD_READ_VIA_BASH:-agentes}"
TP_SUB=0
printf '%s' "$INPUT" | grep -o '"transcript_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | grep -q 'subagents' && TP_SUB=1
if [ "${HARNESS_SKIP_GUARD_BASH:-0}" != "1" ] && [ "$MODO_LEIT" != "off" ] && { [ "$MODO_LEIT" = "todos" ] || [ "$TP_SUB" = "1" ]; }; then
  N_LINHAS="$(printf '%s\n' "$CMD" | wc -l | tr -d ' ')"
  SEM_RUIDO="$(printf '%s' "$CMD" | sed -e 's/2>&1//g' -e 's#[12]\{0,1\}>[[:space:]]*/dev/null##g')"
  if [ "$N_LINHAS" -le 1 ] && ! printf '%s' "$SEM_RUIDO" | grep -qE '[<>]|\$\(|`'; then
    REST="$(printf '%s' "$CMD" | sed -E 's/^cd[[:space:]]+([^[:space:]]+|"[^"]*")[[:space:]]*(&&|;)[[:space:]]*//')"
    LEIT=1; PRIM=""
    OLDIFS="$IFS"; IFS='|;&'; set -f
    for SEG in $REST; do
      SEG="$(printf '%s' "$SEG" | sed -e 's/^[[:space:]]*//')"
      [ -n "$SEG" ] || continue
      W="$(printf '%s' "$SEG" | awk '{print $1}' | sed -e 's#.*/##')"
      case "$W" in
        echo|printf|true|:|pwd|date|type) continue ;;
        cat|head|tail|less|more|tac|nl|grep|egrep|fgrep|rg|ls|dir|tree|wc) ;;
        find) printf '%s' "$SEG" | grep -qE -- ' -(exec|execdir|delete|ok)( |$)' && { LEIT=0; break; } ;;
        sed) { printf '%s' "$SEG" | grep -qE -- '(^| )-n( |$)' && ! printf '%s' "$SEG" | grep -qE -- ' -i'; } || { LEIT=0; break; } ;;
        *) LEIT=0; break ;;
      esac
      [ -n "$PRIM" ] || PRIM="$W"
    done
    set +f; IFS="$OLDIFS"
    if [ "$LEIT" = "1" ] && [ -n "$PRIM" ]; then
      case "$PRIM" in
        grep|egrep|fgrep|rg) FERR="Grep (pattern + path; output_mode content|count|files_with_matches)" ;;
        ls|dir|tree|find)    FERR="Glob (padrao de arquivos, ex.: \"**/*.php\")" ;;
        *)                   FERR="Read (arquivo inteiro ou offset/limit)" ;;
      esac
      ORIG="sessao"; [ "$TP_SUB" = "1" ] && ORIG="sub"
      mkdir -p "$RUN_DIR" 2>/dev/null
      printf '{"ts":%s,"agente":"%s","cmd":"%s","ferramenta":"%s"}\n' "$(date +%s)" "$ORIG" "$(printf '%s' "$CMD" | head -1 | cut -c1-120 | tr -d '"\\')" "${FERR%% *}" >> "$RUN_DIR/guard-bash-leitura.jsonl" 2>/dev/null
      # 3.5.0: incidente VERSIONADO (tipo leitura) — o painel mostra quem/qual papel insiste em ler via Bash
      # shellcheck disable=SC1091
      [ -f "$SCRIPT_DIR/_incidente.sh" ] && . "$SCRIPT_DIR/_incidente.sh" && harness_incidente leitura "$ORIG" "" "" "${FERR%% *}: $(printf '%s' "$CMD" | head -1 | cut -c1-120)"
      cat >&2 <<EOM
[guard-bash] BLOQUEADO: leitura via Bash ("$(printf '%s' "$CMD" | head -1 | cut -c1-90)").
Isto e leitura pura ($PRIM); cada Bash custa 0,3-5 s so de criacao de processo nesta maquina
(bash + hooks) e Read/Grep/Glob respondem em ~0,1 s sem processo nenhum. Use agora:
  -> $FERR
Bash e para EXECUTAR (lint, teste, git, migrate, CLI do projeto). Pipeline com awk/sort/cut ou
comando do projeto continua passando — a regra so pega leitura pura. Nao re-tente o mesmo
comando: troque pela ferramenta acima.
(harness 3.4.21 — HARNESS_GUARD_READ_VIA_BASH='off' desliga; 'todos' aplica tambem a sessao pai)
EOM
      exit 2
    fi
  fi
fi

# ---------------------------------------------------------------------------
# GUARDA 1 — temporarios fora do projeto (bloqueia ANTES de contar tentativa:
# a negacao desta guarda ja traz a instrucao certa; nao e sinal de espiral).
# ---------------------------------------------------------------------------
if [ "${HARNESS_SKIP_GUARD_BASH:-0}" != "1" ] && [ "${HARNESS_GUARD_BASH:-1}" = "1" ]; then
  # Raiz do projeto em forma POSIX (no Git Bash: /c/laragon/www/projeto) — escrita
  # em caminho absoluto DENTRO do projeto e legitima.
  PROJ_POSIX="$(cd "$SCRIPT_DIR/../.." && pwd)"

  # Buffer de scan QUOTE-AWARE (2.0.0): (1) desaspa alvos de redirect/tee (alvo
  # quotado — '> "/tmp/x"' — continua detectavel); (2) remove as demais strings
  # quotadas ('>' DENTRO de string, ex. mensagem de commit, nao e redirect e
  # gerava falso positivo bloqueando commit legitimo).
  CMD_SCAN="$(printf '%s\n' "$CMD" \
    | sed -E "s/(>>?[[:space:]]*)[\"']([^\"']*)[\"']/\1\2/g; s/(tee[[:space:]]+(-a[[:space:]]+)?)[\"']([^\"']*)[\"']/\1\3/g" \
    | sed -E "s/\"[^\"]*\"//g; s/'[^']*'//g")"

  # Alvos de escrita: redirecionamentos (>, >>, 2>) e tee, apontando para caminho
  # absoluto POSIX. Alvo com variavel ($VAR) ou relativo nao e analisado (permitido).
  TARGETS="$(printf '%s\n' "$CMD_SCAN" \
    | grep -oE "(>>?[[:space:]]*|tee[[:space:]]+(-a[[:space:]]+)?)/[^[:space:];|&<>\"')]+" \
    | grep -oE "/[^[:space:];|&<>\"')]+" )"

  if [ -n "$TARGETS" ]; then
    BAD=""
    for t in $TARGETS; do
      case "$t" in
        /dev/*|/proc/*|/sys/*)  continue ;;   # descartes legitimos (/dev/null etc.)
        "$PROJ_POSIX"/*)        continue ;;   # dentro do projeto (forma POSIX do Git Bash)
        /*)                     BAD="$t"; break ;;
      esac
    done

    if [ -n "$BAD" ]; then
      cat >&2 <<EOF
[guard-bash] BLOQUEADO: o comando escreve em '$BAD' — caminho de raiz FORA do projeto.
No Git Bash/Windows, '/arquivo' resolve para dentro de C:\\Program Files\\Git\\ e '/tmp'
fica fora do sandbox do projeto => prompt de permissao que, em execucao nao-assistida,
PENDURA a PRD por horas.
Grave arquivos temporarios (scripts de verificacao, dumps, CSVs intermediarios):
  1. no scratchpad da sessao (caminho indicado no seu system prompt); ou
  2. dentro do projeto, em .claude/.harness-run/tmp/ (crie com mkdir -p; e gitignored).
Reescreva o comando com um desses caminhos e re-execute.
EOF
      exit 2
    fi
  fi
fi

# ---------------------------------------------------------------------------
# GUARDA 2 — anti-espiral (1.9.0; host-aware desde 2.0.0)
# Mitiga um problema ESPECIFICO do host Claude: o classificador de permissao
# remoto do auto mode pode ficar indisponivel e negar tudo em fail-closed.
# O Codex nao tem classificador (sandbox/approvals deterministicos) nem o
# evento PostToolUseFailure que o fusivel exige — la esta guarda fica
# DORMENTE POR DESIGN (documentado em PLATAFORMAS.md §4), nunca "suportada
# pela metade".
# ---------------------------------------------------------------------------
[ "${HARNESS_SKIP_GUARD_SPIRAL:-0}" = "1" ] && exit 0
[ "${HARNESS_GUARD_SPIRAL:-1}" != "1" ] && exit 0
[ -z "$CMD_HASH" ] && exit 0

# shellcheck disable=SC1091
. "$SCRIPT_DIR/_host-detect.sh"
harness_host_is claude || exit 0   # anti-espiral e Claude-only (ver acima)

# Fusivel: exige o wiring '--post' nos DOIS eventos do ADAPTER ATIVO (host
# claude => .claude/settings.json: PostToolUse E PostToolUseFailure => >= 2
# ocorrencias). Sem isso os contadores nao limpam direito -> falso positivo.
# Fica DORMENTE (doctor avisa).
SJ="$SCRIPT_DIR/../settings.json"
# grep -o|wc -l conta OCORRENCIAS (grep -c conta linhas — settings.json minificado
# com os 2 wirings na mesma linha desarmaria o fusivel em silencio); tr -d ' '
# porque o wc do macOS devolve com padding. 3.4.8: aceita o wiring .sh OU .mjs
# (o port Node conta para o mesmo fusivel — os contadores sao compartilhados).
POST_N="$(grep -oE 'guard-bash\.(sh|mjs) --post' "$SJ" 2>/dev/null | wc -l | tr -d '[:space:]')"
case "$POST_N" in (*[!0-9]*|"") POST_N=0 ;; esac
[ "$POST_N" -ge 2 ] 2>/dev/null || exit 0

NOW="$(date +%s 2>/dev/null || echo 0)"
[ "$NOW" = "0" ] && exit 0
SPIRAL_N="${HARNESS_GUARD_SPIRAL_N:-3}"
# valor nao-numerico (ou 0) viraria bloqueio de TODO comando na 1a tentativa
case "$SPIRAL_N" in (*[!0-9]*|""|0) SPIRAL_N=3 ;; esac
WINDOW_MIN="${HARNESS_GUARD_SPIRAL_WINDOW_MIN:-15}"
case "$WINDOW_MIN" in (*[!0-9]*|""|0) WINDOW_MIN=15 ;; esac
WINDOW_S=$(( WINDOW_MIN * 60 ))

mkdir -p "$ATT_DIR" 2>/dev/null || exit 0
STATE="$ATT_DIR/$CMD_HASH"

COUNT=0
if [ -f "$STATE" ]; then
  LAST_TS="$(sed -n '2p' "$STATE" 2>/dev/null)"
  case "$LAST_TS" in (*[!0-9]*|"") LAST_TS=0 ;; esac
  if [ $(( NOW - LAST_TS )) -le "$WINDOW_S" ]; then
    COUNT="$(sed -n '1p' "$STATE" 2>/dev/null)"
    case "$COUNT" in (*[!0-9]*|"") COUNT=0 ;; esac
  fi
fi
COUNT=$(( COUNT + 1 ))

CMD_EXCERPT="$(printf '%s' "$CMD" | head -1 | tr -d '"\\' | cut -c1-120)"
{ printf '%s\n%s\n%s\n' "$COUNT" "$NOW" "$CMD_EXCERPT" > "$STATE"; } 2>/dev/null

[ "$COUNT" -lt "$SPIRAL_N" ] && exit 0

# --- ESPIRAL DETECTADA: alerta local + log de telemetria + negacao definitiva ---
MSG="[spiral] comando bloqueado ${COUNT}x sem executar (classificador de permissao indisponivel?): $CMD_EXCERPT"
if [ -f "$SCRIPT_DIR/notify.sh" ]; then
  printf '{"message":"%s"}' "$MSG" | bash "$SCRIPT_DIR/notify.sh" 2>/dev/null || true
fi

cat >&2 <<EOF
[guard-bash] BLOQUEADO (anti-espiral): este MESMO comando ja foi tentado ${COUNT} vezes sem
conseguir executar. Assinatura tipica: o classificador de permissao do modo autonomo esta
INDISPONIVEL (ele nega em fail-closed e pede "try again" — nao obedeca) ou o comando vem
sendo negado repetidamente por outro motivo. NAO RE-TENTE este comando.

O que fazer AGORA, nesta ordem:
1. Existe alternativa que case com a allowlist do projeto (permissions.allow no
   .claude/settings.json) ou operacao read-only que destrave o proximo passo? Use-a.
   Regras de allowlist sao ESTREITAS — prefira o comando exato documentado no Perfil
   (secao "Execucao autonoma") a variacoes com flags novas.
2. Senao, PARE a fase autonoma AGORA. Devolva o controle ao usuario com:
   Status: "Bloqueada — classificador de permissao indisponivel (comando negado ${COUNT}x)"
   e as opcoes de destrave: trocar o modo de permissao (Shift+Tab), aprovar/re-tentar
   pela aba "Recently denied" do /permissions, ampliar a allowlist
   (bash .claude/harness-doctor.sh --gen-allowlist), reduzir sessoes autonomas
   paralelas (max 2), ou aguardar a normalizacao do servico.
3. NAO use ScheduleWakeup/espera ativa para "esperar o classificador voltar" — o
   reagendamento tambem passa pelo classificador e alimenta a espiral.

O operador ja foi alertado (notify.sh) e o evento foi logado para a telemetria.
Runbook: .claude/PLAYBOOK-TELEMETRIA.md — secao "Classificador indisponivel".
EOF
exit 2
