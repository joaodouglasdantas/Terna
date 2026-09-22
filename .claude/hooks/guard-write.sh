#!/usr/bin/env bash
# .claude/hooks/guard-write.sh (3.4.6) — PreToolUse Write, BLOQUEANTE: Edit-first.
# Reescrever um arquivo EXISTENTE inteiro com Write e o jeito mais caro e mais arriscado de
# editar: output e o token mais caro e mais lento do harness (medido 20-24/08: dedalo a 121k
# tokens de output por task, out_tps 38-92 nas execucoes), e reescrita total ainda arrisca
# truncar o arquivo. O Edit cirurgico gasta so o delta e o lint.sh continua validando igual.
#
# REGRA: Write sobre arquivo JA EXISTENTE com >= HARNESS_GUARD_WRITE_MIN_LINES linhas (default
# 150) e negado com instrucao (exit 2 — o modelo se autocorrige e refaz com Edit na hora).
# Arquivo NOVO passa sempre. Arquivos efemeros (.claude/.harness-run/) passam sempre.
#
# Reescrita GENUINA (> ~50% do arquivo, raro em task): apague antes com `rm` e re-crie com
# Write — acao consciente que fica auditavel no transcript — ou desligue pontualmente com
# HARNESS_GUARD_WRITE=0. Desligar de vez: HARNESS_GUARD_WRITE=0 no harness.env(.local).
#
# Wiring (settings.json do projeto — local, o /deus nao propaga; o doctor cobra):
#   PreToolUse, matcher "Write" -> bash .claude/hooks/guard-write.sh

set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# 3.5.7: camadas de configuracao — hooks/_env.sh carrega _defaults.env -> harness.env -> harness.env.local -> ~/.harness.env.local
# (ambiente da sessao vence). Antes cada hook tinha o proprio loop.
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_env.sh"
[ "${HARNESS_GUARD_WRITE:-1}" = "1" ] || exit 0
[ "${HARNESS_SKIP_GUARD_WRITE:-0}" = "1" ] && exit 0

INPUT="$(cat 2>/dev/null)"; [ -n "$INPUT" ] || exit 0
if command -v jq >/dev/null 2>&1; then
  FP="$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)"
else
  FP="$(printf '%s' "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*:[[:space:]]*"([^"]*)"/\1/')"
  # JSON escapa a barra invertida — no Windows o path chega "C:\\laragon\\..."; desfazer.
  FP="$(printf '%s' "$FP" | sed 's/\\\\/\//g; s/\\//g')"
fi
[ -n "$FP" ] || exit 0

# 3.5.5 (C12): conteudo com MARCADORES DE CONFLITO do git nunca vai para o disco por Write. Medido 15/09: um merge do
# INDEX.md (CRLF) foi commitado com <<<<<<< / ======= / >>>>>>> dentro. HARNESS_GUARD_WRITE_CONFLITO=off desliga.
if [ "${HARNESS_GUARD_WRITE_CONFLITO:-on}" != "off" ] && command -v jq >/dev/null 2>&1; then
  if printf '%s' "$INPUT" | jq -r '.tool_input.content // empty' 2>/dev/null | grep -qE '^(<<<<<<< |=======[[:space:]]*$|>>>>>>> )'; then
    printf '%s\n' "[guard-write] Write NEGADO: o conteudo de '$FP' contem marcadores de conflito do git (<<<<<<< / ======= / >>>>>>>). Resolva o conflito (escolha um lado ou junte os dois) e escreva o arquivo sem os marcadores." >&2
    exit 2
  fi
fi

# 3.5.6 (D7 + D6/E1) — duas regras SO PARA SUBAGENTE (payload com agent_id — regra 3.4.27 do presence.mjs):
#  (a) Write FORA do projeto e do scratchpad da sessao e negado com a mesma receita da GUARDA 1 do guard-bash.
#      Medido 15/09 (145): dedalo gravou check_console.js no Temp do usuario via Write e tomou "Cannot find module
#      'playwright'" (o node_modules e do projeto); o michelangelo repetiu o padrao. HARNESS_GUARD_WRITE_FORA=off desliga.
#  (b) SPEC DE DEPURACAO (`_debug*`, `_tmp-*`, `zz*`, `*-debug.spec.*`) em tests/ e negado: o executor fabricava specs
#      de sondagem e gastava neles as 4 rodadas do teto (D6: zzdebug_ck_modal, _tmp-check-salas-console; E1: _debug144-temp)
#      — depuracao e `--grep` no spec real, e spec fora do padrao PRD-NNN-*.spec.js nunca entra no repo.
#      HARNESS_GUARD_WRITE_SPEC_DEBUG=off desliga. A sessao pai passa nas duas (ela investiga; o teto dela e da skill).
AGENT_ID=""
if command -v jq >/dev/null 2>&1; then AGENT_ID="$(printf '%s' "$INPUT" | jq -r '.agent_id // empty' 2>/dev/null)"
else AGENT_ID="$(printf '%s' "$INPUT" | grep -o '"agent_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*:[[:space:]]*"([^"]*)"/\1/')"; fi
if [ -n "$AGENT_ID" ]; then
  # 3.5.7 (incidente PRD-144): DUBLÊ DE SIMBOLO DE PRODUCAO em spec — `window.X = function/=>` num arquivo de teste
  # prova o modulo e esconde a publicacao que falta (os specs da 144 criaram window.abrirPorTelefoneViaResolver como espiao e
  # ficaram verdes; em producao o clique nao fazia nada). AVISO (additionalContext), nao nega: o costura-check reprova no
  # review e no stop. Espiao certo envolve a funcao REAL: const orig = window.X; expect(typeof orig).toBe('function').
  if [ "${HARNESS_GUARD_WRITE_DUBLE:-on}" != "off" ] && printf '%s' "$FP" | grep -qiE '\.(spec|test)\.(js|mjs|ts|tsx)$|/tests?/|/e2e/'; then
    _DUB="$(printf '%s' "$INPUT" | jq -r '.tool_input.content // empty' 2>/dev/null | grep -oE 'window\.[A-Za-z_$][A-Za-z0-9_$]*[[:space:]]*=[[:space:]]*(async[[:space:]]+)?(function\b|\(|[A-Za-z_$][A-Za-z0-9_$]*[[:space:]]*=>)' | grep -oE 'window\.[A-Za-z_$][A-Za-z0-9_$]*' | sort -u | tr '\n' ' ')"
    if [ -n "$_DUB" ]; then
      _AV="[guard-write] spec '$(basename "$FP")' cria no window a(s) funcao(oes) $_DUB— se o PRODUTO consome esse simbolo, o teste vira dublê: prova o modulo e esconde a publicacao que falta (incidente PRD-144, 16/09: clique que nao fazia nada em producao com 61 specs verdes). Espiao certo envolve a funcao REAL (const orig = window.X; expect(typeof orig).toBe('function'); window.X = (...a) => { chamadas.push(a); return orig(...a); }). O costura-check reprova 'duble-em-spec' no review e no stop. (3.5.7 — HARNESS_GUARD_WRITE_DUBLE=off desliga)"
      if command -v jq >/dev/null 2>&1; then printf '%s' "$_AV" | jq -Rs '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:.}}'; else printf '%s\n' "$_AV" >&2; fi
    fi
  fi
  # normaliza os dois lados para /c/caminho/minusculo (o Write manda C:\...; o pwd do Git Bash da /c/...)
  FPN="${FP//\\//}"; case "$FPN" in [A-Za-z]:/*) FPN="/${FPN:0:1}${FPN:2}" ;; esac; FPN="$(printf '%s' "$FPN" | tr 'A-Z' 'a-z')"
  # a raiz em forma WINDOWS (pwd -W no Git Bash; /tmp e outros mounts do MSYS nao batem com o C:\... que o Write manda)
  ROOTN="$(cd "$ROOT" 2>/dev/null && { pwd -W 2>/dev/null || pwd; })"; ROOTN="${ROOTN//\\//}"; case "$ROOTN" in [A-Za-z]:/*) ROOTN="/${ROOTN:0:1}${ROOTN:2}" ;; esac; ROOTN="$(printf '%s' "$ROOTN" | tr 'A-Z' 'a-z')"
  case "$FPN" in
    "$ROOTN"/*) : ;;
    */claude/*/*/scratchpad/*) : ;;
    *)
      if [ "${HARNESS_GUARD_WRITE_FORA:-on}" != "off" ]; then
        printf '%s\n' "[guard-write] Write NEGADO: '$FP' fica FORA do projeto ($ROOT) e fora do scratchpad da sessao. Script de verificacao, dump ou spec temporario vai em .claude/.harness-run/tmp/ (dentro do projeto: mkdir -p, gitignored, com o node_modules do projeto ao alcance) ou no scratchpad indicado no seu system prompt. Fora dai o node_modules nao existe ('Cannot find module playwright') e o caminho pode cair num prompt de permissao que ninguem ve. (3.5.6/D7 — HARNESS_GUARD_WRITE_FORA=off desliga)" >&2
        exit 2
      fi ;;
  esac
  if [ "${HARNESS_GUARD_WRITE_SPEC_DEBUG:-on}" != "off" ]; then
    case "$FPN" in
      */test/*|*/tests/*|*/e2e/*|*/spec/*|*/specs/*)
        BN="$(basename "$FPN")"
        if printf '%s' "$BN" | grep -qE '^(_|zz|tmp[-_.]|temp[-_.]|debug[-_.]|sonda[-_.]|probe[-_.])[^/]*\.spec\.(js|ts|mjs)$|[-_.](tmp|temp|debug|zz[a-z]*)\.spec\.(js|ts|mjs)$'; then
          printf '%s\n' "[guard-write] Write NEGADO: '$BN' e um SPEC DE DEPURACAO (prefixo _/zz/tmp/debug). O executor nao fabrica spec: cada rodada nele consome o teto de testes da task e o arquivo nunca entra no repo. Depure no spec REAL da task com \`--grep \"<cenario>\"\` (e --workers=1), ou colete evidencia com \`npx playwright screenshot\`/um script Node em .claude/.harness-run/tmp/ (nao conta como rodada). Se o cenario exige um spec novo de verdade, ele se chama PRD-NNN-<algo>.spec.js e esta no contrato da task. (3.5.6/D6 — HARNESS_GUARD_WRITE_SPEC_DEBUG=off desliga)" >&2
          exit 2
        fi ;;
    esac
  fi
fi

# Arquivo novo = caminho legitimo do Write. So arquivo EXISTENTE interessa aqui.
[ -f "$FP" ] || exit 0

# Efemeros e artefatos do proprio harness: regravar inteiro e legitimo.
case "$FP" in
  *.harness-run*|*/codex-reviews/*) exit 0 ;;
  # 3.4.11: DOCUMENTO da pasta da PRD (PRD/tecnica/tasks) nao e codigo — o Edit-first ali
  # virou 398 turnos/47 min por ciclo de correcao do hermes (PRD-133, 01/09). Um Read +
  # um Write por documento; o snapshot+diff do Passo 10 audita. HARNESS_GUARD_WRITE_DOCS=1
  # devolve o comportamento 3.4.6 tambem para documentos.
  */prds/PRD-*/*.md|*/prds/*/tasks/*.md) [ "${HARNESS_GUARD_WRITE_DOCS:-0}" = "1" ] || exit 0 ;;
esac

MIN="${HARNESS_GUARD_WRITE_MIN_LINES:-150}"
case "$MIN" in ''|*[!0-9]*) MIN=150 ;; esac
[ "$MIN" -gt 0 ] 2>/dev/null || exit 0

N="$(wc -l < "$FP" 2>/dev/null | tr -d '[:space:]')"
case "$N" in ''|*[!0-9]*) exit 0 ;; esac
[ "$N" -ge "$MIN" ] || exit 0

printf '%s\n' "[guard-write] Write NEGADO: '$FP' JA EXISTE com $N linhas (piso $MIN — HARNESS_GUARD_WRITE_MIN_LINES). Reescrever arquivo inteiro e o jeito mais caro (output e o token mais caro/lento) e mais arriscado (truncamento) de editar. Use Edit com blocos cirurgicos (old_string/new_string) — varios Edits pequenos no mesmo arquivo sao bem-vindos. Reescrita GENUINA de mais da metade do arquivo: rode 'rm <arquivo>' no Bash e re-crie com Write (fica auditavel), ou HARNESS_GUARD_WRITE=0 pontual." >&2
exit 2
