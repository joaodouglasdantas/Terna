#!/usr/bin/env bash
# .claude/hooks/harness-delegate.sh (3.0.0)
# BROKER de delegacao de mini-task READ-ONLY a um CLI externo autenticado na maquina.
#
# O que ele E: encanamento deterministico. Recebe um envelope de tarefa, dispara o
# CLI, aplica teto de tempo, captura stdout/stderr separados, mede o custo real e
# devolve um STATUS normalizado que permite fallback explicito.
#
# O que ele NAO E:
#   - nao decide QUAL executor usar          (isso e do roteador — Perfil do projeto)
#   - nao decide qual MODELO usar            (herda a sessao do CLI; dial fino por flag)
#   - nao sintetiza nem julga o resultado    (isso e do juiz — a sessao principal)
#   - nao executa o agente NATIVO do host    (rota 'native' nunca passa por aqui:
#     a skill usa o mecanismo de subagentes do proprio runtime)
#
# EXECUTORES (3.0.0): claude-cli | codex-cli.  (3.2.2): + openrouter.
#   claude-cli -> claude -p        (print mode oficial; -p E o print mode aqui)
#   codex-cli  -> codex exec       (ATENCAO: no Codex, -p e --profile, NAO print mode.
#                                   O modo nao-interativo e `codex exec`.)
#   openrouter -> POST https://openrouter.ai/api/v1/chat/completions (3.2.2)
#                 Modelo barato/rapido de OUTRO fornecedor para trabalho MECANICO
#                 (triagem, classificacao, resumo). NAO tem ferramentas: so ve o que
#                 o envelope carrega — use --attach para anexar os arquivos que a
#                 tarefa precisa ler. Chave: OPENROUTER_API_KEY no AMBIENTE ou no
#                 harness.env.local (gitignored) — NUNCA no harness.env versionado.
#                 Modelo: --model, senao HARNESS_OPENROUTER_MODEL do harness.env.
# Extensao futura (kimi-cli etc.): acrescente um ramo em run_executor() + um caso em
# harness_executor_available() no _delegate-common.sh. Nada mais muda.
#
# USO
#   bash .claude/hooks/harness-delegate.sh \
#     --executor codex-cli --role atlas --task impacto --label PRD-123 \
#     --prompt-file <envelope.md> --mode read-only --output <saida.md> [--timeout 600]
#
#   Opcionais: --ciclo N | --reasoning low|medium|high (codex) | --model <alias> (claude)
#              --max-words N (teto do relatorio; default 500) | --tag <texto livre>
#              --attach a.md,b.php,dir/ (openrouter: arquivos/pastas anexados ao envelope,
#                 relativos a raiz; teto HARNESS_OPENROUTER_MAX_ATTACH_KB, default 400)
#
#   PREFLIGHT (3.4.6): bash .claude/hooks/harness-delegate.sh --preflight codex-cli [--force]
#     Ping real barato ("o executor RESPONDE?") com teto curto, cacheado por
#     HARNESS_DELEGATE_PREFLIGHT_TTL_MIN. Rode 1x na decolagem por executor externo.
#     stdout: PREFLIGHT|ok|<executor>|  (exit 0)  ou  PREFLIGHT|indisponivel|<executor>|<motivo> (exit 10)
#     3.4.24: resposta de LIMITE DE USO grava `ate=<epoch>` no .status e, ate la, devolve
#     `PREFLIGHT|indisponivel|<executor>|limite-ate <dd/mm HH:MM>` SEM pingar (--force pinga).
#   --tools (openrouter): teto de turnos HARNESS_DELEGATE_TOOLS_MAX_TURNOS (4); modelos em
#     HARNESS_DELEGATE_TOOLS_OFF_MODELS rodam sem ferramentas (3.4.24).
#
# CONTRATO DE SAIDA
#   stdout = UMA linha:  DELEGACAO|<status>|<executor>|<path do relatorio ou vazio>
#   stderr = diagnostico legivel
#   exit   = o canal do fallback (ao contrario do external-review.sh, que e defensivo
#            e sai 0 sempre — aqui quem chama e uma SKILL, nao um hook wired):
#     0  ok            resultado utilizavel
#     10 indisponivel  CLI ausente / sem login          -> fallback
#     11 timeout       estourou o teto                  -> fallback
#     12 erro          CLI retornou exit != 0           -> fallback
#     13 vazio         rodou mas nao produziu conteudo  -> fallback
#     20 reentrada     ja estamos dentro de um agente externo (nunca aninhar)
#     2  uso           argumento/caminho invalido       -> ERRO DE PROGRAMACAO, nao fallback
#
# SEGURANCA (3.0.0 — todas as delegacoes desta fase sao read-only)
#   - cwd sempre na raiz REAL do projeto; todo path recebido e validado DENTRO dela.
#   - codex: sandbox `read-only` do SO + approval_policy=never + --ephemeral.
#   - claude: --tools restrito a leitura + --disallowedTools de escrita/rede.
#     ATENCAO/HONESTIDADE: isso e enforcement do HARNESS (o CLI so oferece essas
#     ferramentas ao modelo), nao sandbox de sistema operacional como no Codex.
#     A assimetria esta documentada em .claude/PLATAFORMAS.md.
#   - prova, nao promessa: o broker tira impressao do working tree ANTES e DEPOIS e
#     registra no manifest se algo mudou.
#   - nunca commita, nunca faz push, nunca roda sem teto de tempo, nunca usa
#     --dangerously-* / --yolo, nunca exige API key.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# PRECEDENCIA (3.0.0) — sourcear o harness.env SOBRESCREVE variavel vinda do
# ambiente. Sem este resgate, `HARNESS_DELEGATE_MODE=economia claude` seria comido
# pelo `HARNESS_DELEGATE_MODE='off'` do arquivo versionado — justamente a virada
# rapida que o dial existe para permitir. Guardamos o que veio do AMBIENTE antes de
# sourcear e restauramos depois, registrando a ORIGEM (o doctor a exibe: ninguem
# deve ficar em duvida sobre por que uma PRD rodou no Codex).
_ENV_MODE="${HARNESS_DELEGATE_MODE:-}"
_ENV_FALLBACK="${HARNESS_DELEGATE_FALLBACK:-}"
_ENV_VERBOSITY="${HARNESS_VERBOSITY:-}"

# 3.5.7: camadas de configuracao pelo carregador unico (hooks/_env.sh): _defaults.env (decisao do harness, DT-010) ->
# harness.env -> harness.env.local -> ~/.harness.env.local; o AMBIENTE vence (OPENROUTER_API_KEY exportada e
# HARNESS_DELEGATE_MODE=economia claude continuam valendo). A origem do modo vem de harness_env_origem.
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_env.sh"
case "$(harness_env_origem HARNESS_DELEGATE_MODE)" in
  local) ORIGEM_MODE="harness.env.local" ;; maquina) ORIGEM_MODE="~/.harness.env.local" ;;
  projeto) ORIGEM_MODE="harness.env" ;; defaults) ORIGEM_MODE="hooks/_defaults.env" ;; *) ORIGEM_MODE="harness.env" ;;
esac
if [ -n "$_ENV_MODE" ];      then HARNESS_DELEGATE_MODE="$_ENV_MODE";         ORIGEM_MODE="env da sessao"; fi
if [ -n "$_ENV_FALLBACK" ];  then HARNESS_DELEGATE_FALLBACK="$_ENV_FALLBACK"; fi
if [ -n "$_ENV_VERBOSITY" ]; then HARNESS_VERBOSITY="$_ENV_VERBOSITY";        fi
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_delegate-common.sh"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/_host-detect.sh"

HARNESS_LOG_TAG="delegate"

# Escapes JSON — definidos aqui em cima porque o preflight (1c) tambem grava telemetria.
jesc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr -d '\n\r\t'; }
jnum() { case "$1" in ''|*[!0-9]*) printf 'null' ;; *) printf '%s' "$1" ;; esac; }

# 3.4.24 (item 10a) — helpers do LIMITE DE USO do preflight. Formato do status:
#   linha 1: <epoch>|ok|            ou  <epoch>|falha|<motivo>
#   linha 2: ate=<epoch>            (so quando a falha foi limite de uso; validade do veredito)
harness_preflight_ate() { # $1 = arquivo .status -> epoch do `ate=` (ou vazio)
  [ -f "${1:-}" ] || return 0
  local a; a="$(grep '^ate=' "$1" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]')"
  case "$a" in ''|*[!0-9]*) : ;; *) printf '%s' "$a" ;; esac
}
harness_fmt_epoch() { # $1 = epoch -> "dd/mm HH:MM" (GNU ou BSD date)
  date -d "@$1" '+%d/%m %H:%M' 2>/dev/null || date -r "$1" '+%d/%m %H:%M' 2>/dev/null || printf '%s' "$1"
}
harness_limite_uso() { # $1 = texto (stderr+stdout do CLI) -> 0 se parece limite de uso
  printf '%s' "${1:-}" | tr 'A-Z' 'a-z' | grep -qE 'usage limit|rate limit|limit reached|limit has been reached|quota|too many requests|try again|resets? (at|in|on)|reset at' 2>/dev/null
}
# 3.4.33b: erro de CONFIGURACAO nao e limite de uso — medido 10/09: `400 invalid_request_error: The 'gpt-6-astra' model
# requires ...` casava com 'try again' e prendia o Codex por 24 h como 'limite'. Config invalida = falha normal (TTL 30 min),
# com dica de corrigir ~/.codex/config.toml (model =).
harness_config_erro() { # $1 = texto -> 0 se parece erro de configuracao/modelo (nao e limite)
  printf '%s' "${1:-}" | tr 'A-Z' 'a-z' | grep -qE 'invalid_request_error|"status":400|model requires|unknown model|model not found|not a valid model|unsupported model|does not exist' 2>/dev/null
}
# Extrai a data/hora de reabertura da mensagem (ISO, "at 2:05 PM on Sep 7", "in 3 hours 12 minutes",
# "resets in 2d 4h"...). Sem data reconhecivel (ou sem node): agora + HARNESS_DELEGATE_LIMITE_H (24 h).
harness_limite_ate() { # $1 = texto -> epoch (sempre imprime algo)
  local h="${HARNESS_DELEGATE_LIMITE_H:-24}" out=""
  case "$h" in ''|*[!0-9]*) h=24 ;; esac
  if command -v "${HARNESS_RAG_NODE:-node}" >/dev/null 2>&1; then
    out="$(printf '%s' "${1:-}" | "${HARNESS_RAG_NODE:-node}" -e '
      let s = ""; process.stdin.on("data", c => s += c).on("end", () => {
        const now = Date.now(), H = Number(process.argv[1]) || 24; let t = 0, m;
        const em = (x) => x > now && x < now + 30 * 864e5;   // plausivel: futuro, < 30 dias
        // 1) ISO / RFC ("2026-09-07T12:00:00Z", "2026-09-07 15:30")
        if ((m = s.match(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/))) { const x = Date.parse(m[0]); if (em(x)) t = x; }
        // 2) relativo: "in 2 hours 30 minutes", "in 3h 12m", "resets in 2d 4h", "in 45 min"
        if (!t && (m = s.match(/\b(?:in|em)\s+((?:\d+\s*(?:d(?:ays?|ias?)?|h(?:ours?|oras?)?|m(?:in(?:utes?|utos?)?)?|s(?:ec(?:onds?)?)?)\s*,?\s*(?:and\s+)?)+)/i))) {
          let ms = 0; const re = /(\d+)\s*(d|h|m|s)/gi; let k; const low = m[1].toLowerCase();
          while ((k = re.exec(low))) { const n = Number(k[1]); ms += k[2] === "d" ? n * 864e5 : k[2] === "h" ? n * 36e5 : k[2] === "m" ? n * 6e4 : n * 1e3; }
          if (ms > 0 && em(now + ms)) t = now + ms;
        }
        // 3) "at 2:05 PM on Sep 7" / "Sep 7, 2:05 PM" / "on Sep 7 at 14:05" (ano = corrente; se ja passou, +1 ano)
        if (!t) {
          const mon = "(jan|feb|fev|mar|apr|abr|may|mai|jun|jul|aug|ago|sep|set|oct|out|nov|dec|dez)[a-z]*";
          const hora = "(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?)";
          const pats = [ new RegExp(hora + "\\s+(?:on|of|de)\\s+" + mon + "\\.?\\s*(\\d{1,2})", "i"), new RegExp(mon + "\\.?\\s*(\\d{1,2})(?:,)?\\s*(?:at|as|às)?\\s*" + hora, "i") ];
          for (const p of pats) { m = s.match(p); if (!m) continue;
            const isFirst = p === pats[0]; const hh = isFirst ? m[1] : m[3], mo = isFirst ? m[2] : m[1], dd = isFirst ? m[3] : m[2];
            const y = new Date().getFullYear(); let x = Date.parse(mo.slice(0, 3) + " " + dd + ", " + y + " " + hh);
            if (isNaN(x)) continue; if (x < now - 36e5) x = Date.parse(mo.slice(0, 3) + " " + dd + ", " + (y + 1) + " " + hh);
            if (em(x)) { t = x; break; } }
        }
        // 4) so hora: "try again at 2:05 PM" (hoje; se ja passou, amanha)
        if (!t && (m = s.match(/\b(?:at|às|as)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i))) {
          const d = new Date(); let x = Date.parse(d.toDateString() + " " + m[1]); if (!isNaN(x)) { if (x < now) x += 864e5; if (em(x)) t = x; }
        }
        if (!t) t = now + H * 36e5;
        process.stdout.write(String(Math.floor(t / 1000)));
      });' "$h" 2>/dev/null)"
  fi
  case "$out" in ''|*[!0-9]*) out=$(( $(date +%s) + h * 3600 )) ;; esac
  printf '%s' "$out"
}

# ---------------------------------------------------------------------------
# 1) Argumentos
# ---------------------------------------------------------------------------
EXECUTOR=""; ROLE=""; TASK=""; LABEL=""; PROMPT_FILE=""; OUTPUT=""
MODE="read-only"; TIMEOUT=""; REASONING=""; MODEL=""; CICLO="1"
MAX_WORDS="500"; TAG=""; ROTA=""; PERFIL_ARG=""; ATTACH=""; TOOLS="0"
PREFLIGHT_EX=""; PF_FORCE="0"

die_uso() { harness_log "$1"; printf 'DELEGACAO|uso|%s|\n' "${EXECUTOR:-?}"; exit 2; }

while [ $# -gt 0 ]; do
  case "$1" in
    --executor)    EXECUTOR="${2:-}"; shift 2 || die_uso "--executor sem valor" ;;
    --role)        ROLE="${2:-}"; shift 2 || die_uso "--role sem valor" ;;
    --task)        TASK="${2:-}"; shift 2 || die_uso "--task sem valor" ;;
    --label)       LABEL="${2:-}"; shift 2 || die_uso "--label sem valor" ;;
    --prompt-file) PROMPT_FILE="${2:-}"; shift 2 || die_uso "--prompt-file sem valor" ;;
    --output)      OUTPUT="${2:-}"; shift 2 || die_uso "--output sem valor" ;;
    --mode)        MODE="${2:-}"; shift 2 || die_uso "--mode sem valor" ;;
    --timeout)     TIMEOUT="${2:-}"; shift 2 || die_uso "--timeout sem valor" ;;
    --reasoning)   REASONING="${2:-}"; shift 2 || die_uso "--reasoning sem valor" ;;
    --model)       MODEL="${2:-}"; shift 2 || die_uso "--model sem valor" ;;
    --ciclo)       CICLO="${2:-}"; shift 2 || die_uso "--ciclo sem valor" ;;
    --max-words)   MAX_WORDS="${2:-}"; shift 2 || die_uso "--max-words sem valor" ;;
    --tag)         TAG="${2:-}"; shift 2 || die_uso "--tag sem valor" ;;
    --rota)        ROTA="${2:-}"; shift 2 || die_uso "--rota sem valor" ;;
    --perfil)      PERFIL_ARG="${2:-}"; shift 2 || die_uso "--perfil sem valor" ;;
    --attach)      ATTACH="${2:-}"; shift 2 || die_uso "--attach sem valor" ;;
    --preflight)   PREFLIGHT_EX="${2:-}"; shift 2 || die_uso "--preflight sem valor" ;;
    --force)       PF_FORCE="1"; shift ;;   # 3.4.6: preflight ignora o cache e pinga de novo
    --tools)       TOOLS="1"; shift ;;   # 3.4.0: openrouter com ferramentas read-only (read_file/list/grep/lint)
    -h|--help)     sed -n '1,60p' "${BASH_SOURCE[0]}" >&2; exit 0 ;;
    *)             die_uso "argumento desconhecido: $1" ;;
  esac
done

# ---------------------------------------------------------------------------
# 1b) MODO CONSULTA (--rota) — resolve modo -> papel -> executor e sai.
# ---------------------------------------------------------------------------
# Existe para que o ROTEAMENTO seja deterministico e testavel, em vez de depender
# de cada skill parsear a tabela markdown do Perfil do seu jeito. A skill pergunta,
# o broker responde. O Perfil continua sendo a fonte de verdade.
#
#   stdout: ROTA|<papel>|<primario>|<fallback>|<modo-exec>|<origem>
#   exit 0 sempre (papel desconhecido resolve para 'native' — nunca trava a skill).

VALORES_OK="native claude-cli claude-cli:sonnet codex-cli openrouter off"

# Expansao do MODO (a regua do harness — mora aqui, nao no projeto).
expandir_modo() { # $1 = papel  $2 = modo  -> imprime o executor
  local papel="$1" modo="$2"
  case "$modo" in
    apoio)
      case "$papel" in
        discovery-schema|discovery-codigo|discovery-prds) printf 'codex-cli\n' ;;
        *) printf 'native\n' ;;
      esac
      ;;
    economia)
      case "$papel" in
        # michelangelo e dedalo NUNCA saem: a base de design (ui-ux-pro-max) e
        # deliberadamente excluida dos adapters Codex pelo gen-adapters.sh —
        # delegar ali degradaria o gate de UX em silencio.
        michelangelo|dedalo|ariadne) printf 'native\n' ;;
        discovery-dts|discovery-schema|discovery-codigo|discovery-prds|inovacao|impacto|beholder)
          printf 'codex-cli\n' ;;
        *) printf 'native\n' ;;
      esac
      ;;
    *) printf 'native\n' ;;   # off / desconhecido
  esac
}

fallback_do_modo() { # $1 = modo
  case "$1" in
    economia) printf 'perguntar\n' ;;   # nunca voltar em silencio ao recurso escasso
    apoio)    printf 'native\n' ;;
    *)        printf 'native\n' ;;
  esac
}

# Le uma celula da tabela "Roteamento por papel" do Perfil.
# Valor entre crases; placeholder (<...>), 'preset' ou vazio contam como NAO-DEFINIDO.
celula_perfil() { # $1 = arquivo  $2 = papel  $3 = numero da coluna (2=primario 3=fallback)
  [ -f "$1" ] || return 1
  awk -v papel="$2" -v col="$3" '
    /^\| *Papel\/tarefa *\|/ { intab=1; next }
    intab && /^## / { intab=0 }
    intab && /^\|/ {
      n=split($0, c, "|")
      nome=c[2]; gsub(/^[ \t]+|[ \t]+$/, "", nome)
      gsub(/`/, "", nome)
      if (nome == papel && n > col) {
        v=c[col+1]
        gsub(/^[ \t]+|[ \t]+$/, "", v)
        # primeiro valor entre crases
        if (match(v, /`[^`]*`/)) { v=substr(v, RSTART+1, RLENGTH-2) }
        gsub(/^[ \t]+|[ \t]+$/, "", v)
        print v; exit
      }
    }
  ' "$1" 2>/dev/null
}

valor_util() { # 0 = e um valor real; 1 = placeholder/preset/vazio
  case "$1" in
    ''|preset|'—'|'-') return 1 ;;
    *'<'*) return 1 ;;
    *) return 0 ;;
  esac
}

if [ -n "$ROTA" ]; then
  R_ROOT="$(harness_project_root)"
  PERFIL="${PERFIL_ARG:-$R_ROOT/.claude/PERFIL-PROJETO.md}"

  # 1. Modo: env > .local > Perfil > harness.env > off
  R_MODO="${HARNESS_DELEGATE_MODE:-}"
  R_ORIGEM="$ORIGEM_MODE"
  if [ -z "$R_MODO" ] || [ "$R_MODO" = "harness.env" ]; then
    P_MODO="$(awk -F'|' '
      /^\| *\*\*Modo de delegação\*\* *\|/ {
        v=$3; gsub(/^[ \t]+|[ \t]+$/, "", v)
        if (match(v, /`[^`]*`/)) { v=substr(v, RSTART+1, RLENGTH-2) }
        print v; exit
      }' "$PERFIL" 2>/dev/null)"
    if valor_util "${P_MODO:-}" && [ "${P_MODO:-}" != "harness.env" ]; then
      R_MODO="$P_MODO"; R_ORIGEM="Perfil"
    fi
  fi
  case "${R_MODO:-}" in
    off|apoio|economia) : ;;
    '') R_MODO="off"; R_ORIGEM="default" ;;
    *)  harness_log "AVISO: modo de delegacao '$R_MODO' invalido — usando 'off' (tudo native)."
        R_MODO="off"; R_ORIGEM="invalido->default" ;;
  esac

  # 2. Executor: linha do Perfil (override fino) vence a expansao do modo.
  R_EXEC="$(celula_perfil "$PERFIL" "$ROTA" 2)"
  if valor_util "${R_EXEC:-}"; then
    R_ORIGEM="$R_ORIGEM + Perfil(papel)"
  else
    R_EXEC="$(expandir_modo "$ROTA" "$R_MODO")"
  fi
  case " $VALORES_OK " in
    *" $R_EXEC "*) : ;;
    *) harness_log "AVISO: executor '$R_EXEC' invalido para o papel '$ROTA' — usando 'native'."
       R_EXEC="native" ;;
  esac

  # 3. Fallback
  R_FB="$(celula_perfil "$PERFIL" "$ROTA" 3)"
  valor_util "${R_FB:-}" || R_FB="$(fallback_do_modo "$R_MODO")"
  [ "$R_EXEC" = "native" ] && R_FB="—"

  printf 'ROTA|%s|%s|%s|read-only|modo=%s (%s)\n' "$ROTA" "$R_EXEC" "$R_FB" "$R_MODO" "$R_ORIGEM"
  exit 0
fi

# ---------------------------------------------------------------------------
# 1c) PREFLIGHT (3.4.6) — "o executor RESPONDE?" antes da primeira delegacao
# ---------------------------------------------------------------------------
# Medido 20-24/08 (dra-mariana-duarte): codex-cli falhou 4/4 delegacoes com binario
# e auth.json PRESENTES — o check estatico nao pega falha de EXECUCAO, e cada
# tentativa custava ate HARNESS_DELEGATE_TIMEOUT (600s) de parede antes do
# fallback, em silencio. O preflight faz UM ping real com teto curto e grava o
# veredito em .claude/.harness-run/preflight-<executor>.status; dentro da validade
# (HARNESS_DELEGATE_PREFLIGHT_TTL_MIN, default 30 min) chamadas repetidas leem o
# cache (idempotente — pode ser chamado da decolagem E do duelo sem custo extra)
# e o broker RECUSA na hora delegacao a executor reprovado (breaker, secao 3).
#
# Ping real: codex-cli (exec trivial, ~5-15s) e openrouter (GET /auth/key — zero
# token). claude-cli: so o check estatico (ping headless consome credito Agent SDK).
if [ -n "$PREFLIGHT_EX" ]; then
  EXECUTOR="$PREFLIGHT_EX"
  case "$EXECUTOR" in
    claude-cli|codex-cli|openrouter|ollama) : ;;
    *) die_uso "--preflight '$EXECUTOR' invalido (claude-cli | codex-cli | openrouter | ollama)" ;;
  esac
  if [ "${HARNESS_DELEGATE_PREFLIGHT:-1}" = "0" ]; then
    harness_log "preflight desligado (HARNESS_DELEGATE_PREFLIGHT=0) — reportando ok sem pingar."
    printf 'PREFLIGHT|ok|%s|\n' "$EXECUTOR"; exit 0
  fi
  PF_ROOT="$(harness_project_root)"
  PF_DIR="$PF_ROOT/.claude/.harness-run"
  mkdir -p "$PF_DIR" 2>/dev/null
  [ -f "$PF_DIR/.gitignore" ] || printf '*\n' > "$PF_DIR/.gitignore" 2>/dev/null
  PF_STATUS_FILE="$PF_DIR/preflight-$EXECUTOR.status"
  PF_TTL="${HARNESS_DELEGATE_PREFLIGHT_TTL_MIN:-30}"
  case "$PF_TTL" in ''|*[!0-9]*) PF_TTL=30 ;; esac

  # 3.5.6 (D17): a cota do Codex e da MAQUINA, nao do projeto. Quem bate no limite grava ~/.harness-run/codex-limite.json
  # ({"ate":<epoch>,...}); todo preflight codex-cli de qualquer projeto le daqui ANTES de pingar (medido 15/09: 3 execs +
  # 4 criacoes descobrindo o mesmo limite uma a uma, 1 ping pago cada). --force ignora; sucesso real apaga o arquivo.
  # HARNESS_CODEX_LIMITE_COMPARTILHADO=off desliga.
  CL_FILE="${HOME:-${USERPROFILE:-}}/.harness-run/codex-limite.json"
  if [ "$EXECUTOR" = "codex-cli" ] && [ "$PF_FORCE" != "1" ] && [ "${HARNESS_CODEX_LIMITE_COMPARTILHADO:-on}" != "off" ] && [ -f "$CL_FILE" ]; then
    CL_ATE="$(grep -o '"ate":[0-9]*' "$CL_FILE" 2>/dev/null | head -1 | cut -d: -f2)"
    case "$CL_ATE" in ''|*[!0-9]*) CL_ATE="" ;; esac
    if [ -n "$CL_ATE" ] && [ "$CL_ATE" -gt "$(date +%s)" ] 2>/dev/null; then
      CL_PROJ="$(grep -o '"projeto":"[^"]*"' "$CL_FILE" 2>/dev/null | head -1 | cut -d'"' -f4)"
      # replica no .status deste projeto (doctor-cached e skills leem dali) — sem pingar
      if [ -z "$(harness_preflight_ate "$PF_STATUS_FILE")" ]; then printf '%s|falha|limite de uso ate %s (visto em %s)\nate=%s\n' "$(date +%s)" "$(harness_fmt_epoch "$CL_ATE")" "${CL_PROJ:-outro projeto}" "$CL_ATE" > "$PF_STATUS_FILE" 2>/dev/null; fi
      harness_log "preflight codex-cli: LIMITE DE USO ate $(harness_fmt_epoch "$CL_ATE") visto por outro projeto desta maquina (${CL_PROJ:-?}) — sem pingar (3.5.6). Review em SOLO-2. Reteste: --preflight codex-cli --force."
      printf 'PREFLIGHT|indisponivel|%s|limite-ate %s\n' "$EXECUTOR" "$(harness_fmt_epoch "$CL_ATE")"; exit 10
    fi
  fi

  # 3.4.24 (item 10a) — LIMITE DE USO com validade: quando o Codex responde "usage limit /
  # rate limit / try again at <data>", o status guarda `ate=<epoch>` (2a linha) e, ate la, o
  # preflight responde `limite-ate <data>` SEM pingar — o TTL de 30 min NAO se aplica (medido
  # 04/09: 5/5 preflights reprovando no PC com limite ate 07/09, e o ping repetindo a cada run).
  # --force ignora. Sucesso real de delegacao sobrescreve o arquivo (limpa o `ate`).
  PF_ATE="$(harness_preflight_ate "$PF_STATUS_FILE")"
  if [ "$PF_FORCE" != "1" ] && [ -n "$PF_ATE" ] && [ "$PF_ATE" -gt "$(date +%s)" ] 2>/dev/null; then
    PF_ATE_H="$(harness_fmt_epoch "$PF_ATE")"
    harness_log "preflight $EXECUTOR: LIMITE DE USO ate $PF_ATE_H — sem pingar (validade do limite vence o TTL). Review em SOLO-2. Reteste: --preflight $EXECUTOR --force."
    printf 'PREFLIGHT|indisponivel|%s|limite-ate %s\n' "$EXECUTOR" "$PF_ATE_H"; exit 10
  fi

  # Cache valido responde sem pingar (--force ignora).
  if [ "$PF_FORCE" != "1" ] && [ -f "$PF_STATUS_FILE" ]; then
    PF_LINE="$(head -1 "$PF_STATUS_FILE" 2>/dev/null)"
    PF_TS="${PF_LINE%%|*}"; PF_REST="${PF_LINE#*|}"; PF_VER="${PF_REST%%|*}"; PF_MOT="${PF_REST#*|}"
    case "$PF_TS" in ''|*[!0-9]*) PF_TS=0 ;; esac
    if [ $(( $(date +%s) - PF_TS )) -lt $(( PF_TTL * 60 )) ]; then
      if [ "$PF_VER" = "ok" ]; then
        harness_log "preflight $EXECUTOR: ok (cache < ${PF_TTL} min)."
        printf 'PREFLIGHT|ok|%s|\n' "$EXECUTOR"; exit 0
      elif [ "$PF_VER" = "falha" ]; then
        harness_log "preflight $EXECUTOR: FALHA (cache < ${PF_TTL} min) — $PF_MOT. Reteste: --preflight $EXECUTOR --force."
        printf 'PREFLIGHT|indisponivel|%s|%s\n' "$EXECUTOR" "$PF_MOT"; exit 10
      fi
    fi
  fi

  PF_T="$(harness_sane_timeout "$TIMEOUT" "${HARNESS_DELEGATE_PREFLIGHT_TIMEOUT:-45}")"
  PF_OK=1; PF_MOTIVO=""; PF_LIMITE_ATE=""
  PF_START="$(date +%s)"
  harness_executor_available "$EXECUTOR"; PF_RC=$?
  if [ "$PF_RC" -ne 0 ]; then
    PF_OK=0; PF_MOTIVO="check estatico reprovado (binario/login/chave — ver stderr acima)"
  else
    TIMEOUT_CMD="$(harness_resolve_timeout_cmd "$PF_T")"
    case "$EXECUTOR" in
      codex-cli)
        PF_TMP="$PF_DIR/preflight-codex.$$"
        printf 'Responda exatamente: ok\n' > "$PF_TMP.in"
        # 3.5.2: o ping usa o MESMO modelo da delegacao. Sem isso o preflight testava
        # o modelo do ~/.codex/config.toml e reprovava o executor por um modelo que o
        # harness nem usaria (incidente de 11/09 com `gpt-6-astra` escrito pelo app).
        PF_MODELO="${HARNESS_DELEGATE_CODEX_MODEL-gpt-5.6-sol}"
        set -- codex exec --sandbox read-only --ephemeral --skip-git-repo-check \
          -c approval_policy="never" --color never
        [ -n "$PF_MODELO" ] && set -- "$@" --model "$PF_MODELO"
        set -- "$@" -o "$PF_TMP.out" -
        (
          export HARNESS_IN_EXTERNAL_AGENT=1 HARNESS_IN_EXTERNAL_REVIEW=1 HARNESS_RAG_IN_SUMMARIZE=1
          # shellcheck disable=SC2086
          $TIMEOUT_CMD "$@" < "$PF_TMP.in" > /dev/null 2> "$PF_TMP.err"
        )
        PF_RC=$?
        if [ "$PF_RC" -ne 0 ] || [ ! -s "$PF_TMP.out" ]; then
          PF_ERRTAIL="$(tail -1 "$PF_TMP.err" 2>/dev/null | tr -d '\r' | cut -c1-120)"
          PF_OK=0; PF_MOTIVO="ping falhou (exit $PF_RC${PF_ERRTAIL:+ — $PF_ERRTAIL})"
          # 3.4.24 (item 10a): a resposta e LIMITE DE USO? Guarda a validade (ate=) — parse da
          # data da mensagem; sem data, +24 h. Le stderr E stdout (o Codex varia onde imprime).
          PF_TEXTO="$( { cat "$PF_TMP.err" "$PF_TMP.out" 2>/dev/null; } | tr -d '\r' | tail -c 4000)"
          if harness_config_erro "$PF_TEXTO"; then
            PF_MOTIVO="CONFIG invalida (modelo/parametro rejeitado pelo servico) — corrija ~/.codex/config.toml (model =) ou o CLI${PF_ERRTAIL:+ — $PF_ERRTAIL}"
          elif harness_limite_uso "$PF_TEXTO"; then
            PF_LIMITE_ATE="$(harness_limite_ate "$PF_TEXTO")"
            PF_MOTIVO="limite de uso ate $(harness_fmt_epoch "$PF_LIMITE_ATE")${PF_ERRTAIL:+ — $PF_ERRTAIL}"
          fi
        fi
        rm -f "$PF_TMP.in" "$PF_TMP.out" "$PF_TMP.err" 2>/dev/null
        ;;
      openrouter)
        # GET /auth/key valida chave + rede sem gerar completion (zero token).
        # NAO usar process.exit() aqui: no Node/Windows, exit forcado com socket/timer
        # vivos crasha o libuv (Assertion UV_HANDLE_CLOSING, exit 127) — medido 28/08
        # com a chave VALIDA e HTTP 200. clearTimeout + exitCode deixam o loop esvaziar.
        (
          export OPENROUTER_API_KEY OR_BASE_URL="${HARNESS_OPENROUTER_URL:-https://openrouter.ai/api/v1}"
          # shellcheck disable=SC2086
          $TIMEOUT_CMD "${HARNESS_RAG_NODE:-node}" -e '
            const ctl = new AbortController();
            const t = setTimeout(() => { ctl.abort(); }, 15000);
            fetch((process.env.OR_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, "") + "/auth/key", { signal: ctl.signal,
              headers: { Authorization: "Bearer " + (process.env.OPENROUTER_API_KEY || "") } })
              .then(r => { clearTimeout(t); process.exitCode = r.ok ? 0 : 12; return r.text().catch(() => ""); })
              .catch(() => { clearTimeout(t); process.exitCode = 12; });
          ' > /dev/null 2>&1
        )
        PF_RC=$?
        [ "$PF_RC" -eq 0 ] || { PF_OK=0; PF_MOTIVO="GET /auth/key falhou (rede fora ou chave invalida)"; }
        ;;
      claude-cli)
        harness_log "claude-cli: preflight estatico apenas (ping headless consumiria credito Agent SDK)."
        ;;
      ollama)
        # daemon ja respondeu no check estatico; aqui confere se o MODELO esta puxado.
        # Com 'auto' (3.4.8): resolve pela memoria e confere o RESOLVIDO; se ele nao
        # esta puxado mas o outro do par esta, o preflight passa avisando (a resolucao
        # da execucao cai no que existir).
        OLL_URL="${HARNESS_OLLAMA_URL:-http://localhost:11434}"
        OLL_TAGS="$(curl -s -m 5 "$OLL_URL/api/tags" 2>/dev/null)"
        OLL_CFG="${HARNESS_OLLAMA_MODEL:-auto}"
        if [ "$OLL_CFG" = "auto" ]; then
          OLL_G="${HARNESS_OLLAMA_MODEL_GRANDE:-qwen3-coder:30b}"
          OLL_P="${HARNESS_OLLAMA_MODEL_PEQUENO:-qwen2.5-coder:14b}"
          OLL_RES="$(harness_ollama_resolver_modelo auto)"
          if ! printf '%s' "$OLL_TAGS" | grep -q "\"name\":\"$OLL_RES"; then
            OUTRO="$OLL_P"; [ "$OLL_RES" = "$OLL_P" ] && OUTRO="$OLL_G"
            if printf '%s' "$OLL_TAGS" | grep -q "\"name\":\"$OUTRO"; then
              harness_log "aviso: modelo resolvido '$OLL_RES' ausente; '$OUTRO' presente — execucao usara o que existir."
            else
              PF_OK=0; PF_MOTIVO="nenhum modelo do par auto puxado — rode: ollama pull $OLL_G (e/ou $OLL_P)"
            fi
          fi
        else
          if ! printf '%s' "$OLL_TAGS" | grep -q "\"name\":\"$OLL_CFG"; then
            PF_OK=0; PF_MOTIVO="modelo '$OLL_CFG' ausente no Ollama — rode: ollama pull $OLL_CFG"
          fi
        fi
        ;;
    esac
  fi
  PF_END="$(date +%s)"
  PF_EPOCH="$PF_END"
  if [ "$PF_OK" -eq 1 ]; then
    printf '%s|ok|\n' "$PF_EPOCH" > "$PF_STATUS_FILE" 2>/dev/null
  else
    printf '%s|falha|%s\n' "$PF_EPOCH" "$PF_MOTIVO" > "$PF_STATUS_FILE" 2>/dev/null
    # 3.4.24: 2a linha = validade do limite de uso (o doctor/SessionStart e o breaker a leem)
    [ -n "${PF_LIMITE_ATE:-}" ] && printf 'ate=%s\n' "$PF_LIMITE_ATE" >> "$PF_STATUS_FILE" 2>/dev/null
  fi

  # Telemetria versionada (mesmo schema do manifest — o dashboard "executores"
  # passa a enxergar a saude do preflight; label fixo PREFLIGHT, role preflight).
  PF_HOST="$(harness_detect_host)"
  PF_VERSTR="$(harness_executor_version "$EXECUTOR")"
  PF_STATUS_J="ok"; [ "$PF_OK" -eq 1 ] || PF_STATUS_J="erro"
  PF_METRICS_DIR="$PF_ROOT/prds/_metrics"
  if mkdir -p "$PF_METRICS_DIR" 2>/dev/null; then
    # DT-007: a linha e MONTADA INTEIRA antes do append — este bloco era um grupo de
    # printfs direto no '>>', e dois processos simultaneos intercalavam os writes
    # (a corrupcao de 18/08 no Mariana nasceu exatamente aqui).
    PF_LINE="$(
      printf '{'
      printf '"ts":"%s",'          "$(jesc "$(date -Iseconds 2>/dev/null || date)")"
      printf '"label":"PREFLIGHT","task":"preflight","role":"preflight","ciclo":1,'
      printf '"host":"%s",'        "$(jesc "$PF_HOST")"
      printf '"executor":"%s",'    "$(jesc "$EXECUTOR")"
      printf '"cli_version":"%s",' "$(jesc "$PF_VERSTR")"
      printf '"model":"n/d","reasoning":"n/d","mode":"read-only",'
      printf '"status":"%s",'      "$PF_STATUS_J"
      printf '"exit_code":%s,'     "$(jnum "$PF_RC")"
      printf '"duration_s":%s,'    "$(jnum "$(( PF_END - PF_START ))")"
      printf '"timeout_s":%s,'     "$(jnum "$PF_T")"
      printf '"input_bytes":0,"output_bytes":0,"max_words":0,'
      printf '"tokens_in":"n/d","tokens_out":"n/d","tokens_cached":"n/d","tokens_fresh":"n/d","tokens_reasoning":"n/d","tokens_fonte":"nao-reportado",'
      printf '"tree_tocado":"nao","cost_usd":"n/d",'
      printf '"tag":"%s"'          "$(jesc "$PF_MOTIVO")"
      printf '}'
    )"
    # 3.5.0: arquivo POR DEV/MAQUINA (delegations/<dev>@<host>.jsonl) — o compartilhado conflitava no merge
    harness_jsonl_append "$(harness_metrics_arquivo "$PF_ROOT" delegations)" "$PF_LINE"
  fi

  if [ "$PF_OK" -eq 1 ]; then
    [ "$EXECUTOR" = "codex-cli" ] && rm -f "$CL_FILE" 2>/dev/null   # 3.5.6 (D17): respondeu => o limite compartilhado caiu
    harness_log "preflight OK — $EXECUTOR respondendo (valido por ${PF_TTL} min)."
    printf 'PREFLIGHT|ok|%s|\n' "$EXECUTOR"; exit 0
  elif [ -n "$PF_LIMITE_ATE" ]; then
    if [ "$EXECUTOR" = "codex-cli" ] && [ "${HARNESS_CODEX_LIMITE_COMPARTILHADO:-on}" != "off" ]; then   # 3.5.6 (D17): avisa a maquina inteira
      mkdir -p "$(dirname "$CL_FILE")" 2>/dev/null
      printf '{"ate":%s,"ate_h":"%s","projeto":"%s","ts":%s}\n' "$PF_LIMITE_ATE" "$(harness_fmt_epoch "$PF_LIMITE_ATE")" "$(basename "$PF_ROOT")" "$(date +%s)" > "$CL_FILE" 2>/dev/null
    fi
    harness_log "preflight FALHOU — $EXECUTOR em LIMITE DE USO ate $(harness_fmt_epoch "$PF_LIMITE_ATE") ($PF_MOTIVO). Ate la nenhum preflight pinga de novo; review em SOLO-2. Liberou antes? --preflight $EXECUTOR --force."
    printf 'PREFLIGHT|indisponivel|%s|limite-ate %s\n' "$EXECUTOR" "$(harness_fmt_epoch "$PF_LIMITE_ATE")"; exit 10
  else
    harness_log "preflight FALHOU — $EXECUTOR: $PF_MOTIVO. Delegacoes a ele serao RECUSADAS na hora pelos proximos ${PF_TTL} min (use o fallback declarado). Corrigiu? --preflight $EXECUTOR --force."
    printf 'PREFLIGHT|indisponivel|%s|%s\n' "$EXECUTOR" "$PF_MOTIVO"; exit 10
  fi
fi

[ -n "$EXECUTOR" ]    || die_uso "--executor e obrigatorio (claude-cli | codex-cli | openrouter | ollama)"
[ -n "$ROLE" ]        || die_uso "--role e obrigatorio (papel/persona: atlas, beholder, ...)"
[ -n "$LABEL" ]       || die_uso "--label e obrigatorio (ex: PRD-123)"
[ -n "$PROMPT_FILE" ] || die_uso "--prompt-file e obrigatorio (envelope da tarefa)"
[ -n "$TASK" ]        || TASK="$ROLE"

# Modo: a 3.0.0 so delega leitura. Qualquer outro valor e recusado na porta —
# um dia em que o harness delegar escrita, isso vira uma decisao consciente aqui.
case "$MODE" in
  read-only) : ;;
  *) die_uso "--mode '$MODE' nao suportado (3.0.0 delega SOMENTE read-only)" ;;
esac

case "$EXECUTOR" in
  claude-cli|codex-cli|openrouter|ollama) : ;;
  *) die_uso "--executor '$EXECUTOR' invalido (claude-cli | codex-cli | openrouter | ollama)" ;;
esac

case "$REASONING" in
  ''|low|medium|high) : ;;
  *) harness_log "AVISO: --reasoning '$REASONING' invalido — ignorado."; REASONING="" ;;
esac
case "$MAX_WORDS" in
  ''|*[!0-9]*) MAX_WORDS="500" ;;
esac
case "$CICLO" in
  ''|*[!0-9]*) CICLO="1" ;;
esac

# ---------------------------------------------------------------------------
# 2) Reentrancia e bypass — antes de qualquer trabalho
# ---------------------------------------------------------------------------
if harness_in_external; then
  harness_log "reentrada detectada (ja estamos dentro de um agente externo) — nao aninhar."
  printf 'DELEGACAO|reentrada|%s|\n' "$EXECUTOR"
  exit 20
fi
if [ "${HARNESS_SKIP_DELEGATE:-0}" = "1" ]; then
  harness_log "HARNESS_SKIP_DELEGATE=1 — delegacao externa desligada; use a rota nativa."
  printf 'DELEGACAO|indisponivel|%s|\n' "$EXECUTOR"
  exit 10
fi

# ---------------------------------------------------------------------------
# 3) Raiz do projeto + validacao dos caminhos recebidos
# ---------------------------------------------------------------------------
ROOT="$(harness_project_root)"
[ -n "$ROOT" ] && [ -d "$ROOT" ] || die_uso "nao consegui resolver a raiz do projeto"
cd "$ROOT" || die_uso "nao consegui entrar na raiz do projeto: $ROOT"
# O executor externo herda ESTE cwd. Se o repo git for maior que o projeto (harness
# aninhado num monorepo/vault), o fingerprint abaixo se restringe ao projeto.
# NORMALIZAR antes de comparar: no Git Bash o `git rev-parse` devolve o caminho no
# formato Windows ('C:/laragon/...') enquanto o `pwd` devolve o do MSYS
# ('/c/laragon/...'). Comparar as strings cruas fazia TODO projeto Windows exibir a
# nota de "harness aninhado" — falso alarme em 100% dos casos, exatamente o tipo de
# ruido que ensina o dev a ignorar aviso.
GITROOT="$(harness_git_root "$ROOT")"
[ -n "$GITROOT" ] && GITROOT="$( cd "$GITROOT" 2>/dev/null && pwd )"
if [ -n "$GITROOT" ] && [ "$GITROOT" != "$ROOT" ]; then
  harness_log "nota: raiz do projeto ($ROOT) e subdiretorio do repo git ($GITROOT) — cwd e telemetria ficam no projeto."
fi

harness_path_inside "$ROOT" "$PROMPT_FILE" \
  || die_uso "--prompt-file fora da raiz do projeto (recusado): $PROMPT_FILE"
[ -f "$PROMPT_FILE" ] || die_uso "--prompt-file nao existe: $PROMPT_FILE"
[ -s "$PROMPT_FILE" ] || die_uso "--prompt-file esta vazio: $PROMPT_FILE"

SAFE_LABEL="$(printf '%s' "$LABEL" | tr -c 'A-Za-z0-9._-' '_')"
SAFE_TASK="$(printf '%s' "$TASK"  | tr -c 'A-Za-z0-9._-' '_')"
WORKDIR="$ROOT/.claude/.harness-run/delegations/$SAFE_LABEL"
mkdir -p "$WORKDIR" 2>/dev/null || die_uso "nao consegui criar $WORKDIR"
# .harness-run e gitignored na copia-mestre; em alvo cujo .gitignore nao o cubra,
# este arquivo impede que o envelope vire lixo untracked no diff do dev.
[ -f "$ROOT/.claude/.harness-run/.gitignore" ] || printf '*\n' > "$ROOT/.claude/.harness-run/.gitignore" 2>/dev/null

BASE="$WORKDIR/${SAFE_TASK}-${EXECUTOR}-c${CICLO}"
[ -n "$OUTPUT" ] || OUTPUT="${BASE}.md"
harness_path_inside "$ROOT" "$OUTPUT" \
  || die_uso "--output fora da raiz do projeto (recusado): $OUTPUT"
# Dois executores NAO gravam o mesmo relatorio. Se o caller reaproveitou um nome
# ja usado, isso e bug de orquestracao — falhar alto e melhor que perder evidencia.
if [ -s "$OUTPUT" ]; then
  die_uso "--output ja existe e nao esta vazio (colisao de relatorio): $OUTPUT"
fi
mkdir -p "$(dirname "$OUTPUT")" 2>/dev/null || die_uso "nao consegui criar o diretorio de --output"

INPUT="${BASE}.input.md"
RAW="${BASE}.raw"
ERRF="${BASE}.stderr"
EVENTS="${BASE}.events.jsonl"
MANIFEST="$WORKDIR/manifest.jsonl"

# Teto de delegacoes por execucao (anti-espiral de GASTO). O analogo do
# HARNESS_GUARD_SPIRAL_N do guard-bash: la o alvo e o comando repetido, aqui e a
# skill que entra em loop de ciclos e vai queimando quota externa sem ninguem ver.
# Duelo tem teto PROPRIO (25/08, exec da PRD-128): cada duelo legitimo consome 2 delegacoes
# (workers A+B) — uma PRD de 8+ tasks estourava o teto de 8 na 4a task e todo duelo seguinte
# virava 'indisponivel' em 1s; pior, a review externa da Fase 2 (MESMO label) herdava o
# bloqueio. O anti-espiral passa a contar POR PAPEL: duelo-worker contra
# HARNESS_DELEGATE_MAX_DUELO (48 = ~20 tasks + retries), os demais papeis contra
# HARNESS_DELEGATE_MAX_PER_RUN (8) SEM contar os duelos.
MAXRUN="${HARNESS_DELEGATE_MAX_PER_RUN:-8}"
case "$MAXRUN" in ''|*[!0-9]*) MAXRUN=8 ;; esac
if [ "$ROLE" = "duelo-worker" ]; then
  MAXRUN="${HARNESS_DELEGATE_MAX_DUELO:-48}"
  case "$MAXRUN" in ''|*[!0-9]*) MAXRUN=48 ;; esac
fi
if [ "$MAXRUN" -gt 0 ] 2>/dev/null && [ -f "$MANIFEST" ]; then
  if [ "$ROLE" = "duelo-worker" ]; then
    JA="$(grep -c '"role":"duelo-worker"' "$MANIFEST" 2>/dev/null)"
  else
    JA="$(grep -vc '"role":"duelo-worker"' "$MANIFEST" 2>/dev/null)"
  fi
  : "${JA:=0}"; case "$JA" in ''|*[!0-9]*) JA=0 ;; esac
  if [ "$JA" -ge "$MAXRUN" ]; then
    harness_log "TETO atingido: ja houve $JA delegacao(oes) do papel '$ROLE' no label '$LABEL' (teto $MAXRUN — HARNESS_DELEGATE_MAX_PER_RUN/HARNESS_DELEGATE_MAX_DUELO). Recusando — use a rota nativa ou reveja o loop da skill."
    printf 'DELEGACAO|indisponivel|%s|\n' "$EXECUTOR"
    exit 10
  fi
fi

# CIRCUIT-BREAKER (3.4.6) — falha sistematica nao paga timeout repetido.
# Medido 20-24/08: codex-cli 4/4 falhas na mesma janela, cada uma custando ate
# 600s de parede antes do fallback. Duas guardas, ambas respondendo em <1s:
#  (a) preflight REPROVADO dentro da validade => recusa imediata (quem grava o
#      status e o --preflight da decolagem; ver secao 1c);
#  (b) N falhas CONSECUTIVAS (timeout/erro/vazio) do MESMO executor nesta run
#      (manifest do label) => breaker aberto ate o fim da run.
# HARNESS_DELEGATE_BREAKER=0 desliga as duas (kill switch por env/sessao).
if [ "${HARNESS_DELEGATE_BREAKER:-1}" = "1" ]; then
  PF_STATUS_FILE="$ROOT/.claude/.harness-run/preflight-$EXECUTOR.status"
  if [ -f "$PF_STATUS_FILE" ]; then
    PF_LINE="$(head -1 "$PF_STATUS_FILE" 2>/dev/null)"
    PF_TS="${PF_LINE%%|*}"; PF_REST="${PF_LINE#*|}"; PF_VER="${PF_REST%%|*}"
    PF_TTL="${HARNESS_DELEGATE_PREFLIGHT_TTL_MIN:-30}"
    case "$PF_TS" in ''|*[!0-9]*) PF_TS=0 ;; esac
    case "$PF_TTL" in ''|*[!0-9]*) PF_TTL=30 ;; esac
    # 3.4.24: limite de uso com validade (ate=) vence o TTL — recusa ate a data da mensagem.
    PF_ATE_B="$(harness_preflight_ate "$PF_STATUS_FILE")"
    if [ -n "$PF_ATE_B" ] && [ "$PF_ATE_B" -gt "$(date +%s)" ] 2>/dev/null; then
      harness_log "BREAKER: '$EXECUTOR' em LIMITE DE USO ate $(harness_fmt_epoch "$PF_ATE_B") (preflight). Recusando SEM tentar — use o fallback declarado (review: SOLO-2). Liberou antes? --preflight $EXECUTOR --force"
      printf 'DELEGACAO|indisponivel|%s|\n' "$EXECUTOR"
      exit 10
    fi
    if [ "$PF_VER" = "falha" ] && [ $(( $(date +%s) - PF_TS )) -lt $(( PF_TTL * 60 )) ]; then
      harness_log "BREAKER: preflight de '$EXECUTOR' reprovado ha menos de ${PF_TTL} min (${PF_REST#*|}). Recusando SEM tentar — use o fallback declarado. Corrigiu? bash .claude/hooks/harness-delegate.sh --preflight $EXECUTOR --force"
      printf 'DELEGACAO|indisponivel|%s|\n' "$EXECUTOR"
      exit 10
    fi
  fi
  BRK_N="${HARNESS_DELEGATE_BREAKER_N:-2}"
  case "$BRK_N" in ''|*[!0-9]*) BRK_N=2 ;; esac
  if [ "$BRK_N" -gt 0 ] && [ -f "$MANIFEST" ]; then
    SEGUIDAS="$(awk -v ex="\"executor\":\"$EXECUTOR\"" '
      index($0, ex) { if (index($0, "\"status\":\"ok\"")) n = 0; else n++ }
      END { print n + 0 }
    ' "$MANIFEST" 2>/dev/null)"
    case "$SEGUIDAS" in ''|*[!0-9]*) SEGUIDAS=0 ;; esac
    if [ "$SEGUIDAS" -ge "$BRK_N" ]; then
      harness_log "BREAKER ABERTO: $SEGUIDAS falha(s) consecutivas de '$EXECUTOR' no label '$LABEL' (teto $BRK_N — HARNESS_DELEGATE_BREAKER_N). Recusando SEM tentar; use o fallback declarado pelo resto da run. Reabrir conscientemente: HARNESS_DELEGATE_BREAKER=0 no env da sessao."
      printf 'DELEGACAO|indisponivel|%s|\n' "$EXECUTOR"
      exit 10
    fi
  fi
fi

# Teto de GASTO DIARIO do openrouter em USD (3.2.2) — o unico executor que custa
# dinheiro direto. Soma o cost_usd das delegacoes de HOJE no historico versionado
# (prds/_metrics/harness-delegations.jsonl) e recusa acima do teto. 0 = sem teto.
if [ "$EXECUTOR" = "openrouter" ]; then
  BUD="${HARNESS_OPENROUTER_BUDGET_USD_DAY:-2}"
  HOJE="$(date +%F)"
  # 3.5.0: o teto e POR MAQUINA (a chave do openrouter e pessoal): soma o arquivo desta maquina + o legado compartilhado
  GASTO="$(cat "$(harness_metrics_arquivo "$ROOT" delegations)" "$ROOT/prds/_metrics/harness-delegations.jsonl" 2>/dev/null | grep -F "\"ts\":\"$HOJE" \
    | grep -F '"executor":"openrouter"' | grep -o '"cost_usd":"[0-9.]*"' | cut -d'"' -f4 \
    | awk '{s+=$1} END{printf "%.4f", s+0}')"
  : "${GASTO:=0}"
  if awk "BEGIN{exit !($BUD > 0 && $GASTO >= $BUD)}" 2>/dev/null; then
    harness_log "TETO DIARIO do openrouter atingido: US\$ $GASTO gastos hoje (HARNESS_OPENROUTER_BUDGET_USD_DAY=$BUD). Recusando — suba o teto no harness.env.local ou use a rota nativa."
    printf 'DELEGACAO|indisponivel|%s|\n' "$EXECUTOR"
    exit 10
  fi
  harness_log "openrouter: US\$ $GASTO gastos hoje (teto diario $BUD)."
fi

# ---------------------------------------------------------------------------
# 4) Disponibilidade do executor  (indisponivel NUNCA e escondido)
# ---------------------------------------------------------------------------
harness_executor_available "$EXECUTOR"
AVAIL_RC=$?
if [ "$AVAIL_RC" -ne 0 ]; then
  harness_log "executor '$EXECUTOR' INDISPONIVEL — a skill deve cair no fallback declarado."
  printf 'DELEGACAO|indisponivel|%s|\n' "$EXECUTOR"
  exit 10
fi

HOST="$(harness_detect_host)"
CLI_VERSION="$(harness_executor_version "$EXECUTOR")"

# claude-cli com host claude custa credito Agent SDK a preco de API (desde
# 15/06/2026) e NAO traz diversidade de modelo — e o mesmo modelo da sessao.
# Configuracao legitima, mas nunca silenciosa.
if [ "$HOST" = "claude" ] && [ "$EXECUTOR" = "claude-cli" ]; then
  harness_log "AVISO: host 'claude' delegando a 'claude-cli' — MESMO modelo da sessao, e o \`claude -p\` headless consome credito Agent SDK separado (preco de API). Sem ganho de diversidade; considere 'native' ou 'codex-cli'."
fi

# ---------------------------------------------------------------------------
# 5) Envelope final = preambulo do broker + envelope da skill
# ---------------------------------------------------------------------------
# O preambulo e injetado SEMPRE: mesmo envelope mal escrito carrega as regras de
# modo, escopo de leitura, formato e independencia.
PERFIL_HINT=".claude/PERFIL-RESUMO.md"
[ -f "$ROOT/.claude/PERFIL-RESUMO.md" ] || PERFIL_HINT=".claude/PERFIL-PROJETO.md"
CONTRATO=".claude/agents/${ROLE}.md"
RAIZ_DOC="CLAUDE.md"
[ "$EXECUTOR" = "codex-cli" ] && RAIZ_DOC="AGENTS.md"

{
  printf '# Tarefa delegada pelo harness Beta Sistemas\n\n'
  printf -- '- **ID da tarefa:** `%s / %s / ciclo %s`\n' "$LABEL" "$TASK" "$CICLO"
  printf -- '- **Papel (persona):** `%s`\n' "$ROLE"
  printf -- '- **Modo:** `read-only`\n'
  printf -- '- **Raiz do projeto:** o seu diretorio de trabalho atual\n\n'

  printf '## Regras inegociaveis desta execucao\n\n'
  printf '1. **READ-ONLY.** Nao crie, altere, mova ou apague arquivo nenhum. Nao rode comando\n'
  printf '   que escreva em disco. Nao rode `git add`, `git commit`, `git push`, migration,\n'
  printf '   instalador ou qualquer coisa com efeito colateral.\n'
  printf '2. **A sua RESPOSTA e o entregavel.** Quem grava relatorio e a sessao que te chamou.\n'
  printf '   Nao tente escrever o resultado num arquivo.\n'
  printf '3. **Independencia.** Nao leia relatorios de outros agentes desta mesma rodada\n'
  printf '   (`.claude/.harness-run/delegations/`, `REVIEW-*.md` de outro papel). Voce foi\n'
  printf '   chamado para dar uma opiniao INDEPENDENTE — ler a do vizinho a contamina.\n'
  printf '4. **Sem preambulo e sem narracao.** Nada de "vou analisar", "primeiro eu...".\n'
  printf '   Devolva o relatorio final e mais nada.\n'
  printf '5. **Portugues do Brasil.** Teto: **%s palavras**. Estourar o teto e defeito, nao zelo.\n' "$MAX_WORDS"
  printf '6. **Honestidade.** O que voce nao conseguiu verificar entra numa secao\n'
  printf '   "Nao verificado" — nunca preencha lacuna com suposicao apresentada como fato.\n\n'

  printf '## Leia primeiro (nesta ordem, e so o que for necessario)\n\n'
  printf -- '1. `%s` — a fonte de verdade do projeto (stack, caminhos, armadilhas).\n' "$PERFIL_HINT"
  if [ -f "$ROOT/$CONTRATO" ]; then
    printf -- '2. `%s` — **o seu contrato canonico**: formato de saida, lentes e regras da\n' "$CONTRATO"
    printf '   persona `%s`. Siga-o integralmente; ele vence qualquer instrucao generica daqui.\n' "$ROLE"
  else
    printf -- '2. (sem contrato canonico para `%s` neste repo — siga o formato pedido abaixo.)\n' "$ROLE"
  fi
  printf -- '3. `%s` (raiz), se existir — convencoes do repositorio.\n\n' "$RAIZ_DOC"

  printf -- '---\n\n'
  printf '# Tarefa\n\n'
  cat "$PROMPT_FILE"

  # openrouter (3.2.2) / ollama (3.4.8 — fix 31/08: o bloco checava so 'openrouter' e o worker
  # local ficava SEM anexo nenhum, em silencio): sem tools, os anexos sao o unico acesso do
  # modelo ao repositorio. Sem --attach, ele so ve o envelope.
  if [ "$EXECUTOR" = "openrouter" ] || [ "$EXECUTOR" = "ollama" ]; then
    ATT_MAX_KB="${HARNESS_OPENROUTER_MAX_ATTACH_KB:-400}"
    case "$ATT_MAX_KB" in ''|*[!0-9]*) ATT_MAX_KB=400 ;; esac
    ATT_BUDGET=$(( ATT_MAX_KB * 1024 )); ATT_USED=0; ATT_N=0; ATT_SKIP=""
    printf '\n\n---\n\n# Anexos (o seu UNICO acesso ao repositorio — voce nao tem ferramentas)\n\n'
    printf 'Os arquivos abaixo foram anexados pela sessao que te chamou. Tudo o que nao esta aqui\n'
    printf 'voce NAO consegue ler: declare em "Nao verificado" em vez de supor.\n\n'
    OLDIFS="$IFS"; IFS=','
    for item in $ATTACH; do
      IFS="$OLDIFS"
      item="$(printf '%s' "$item" | sed 's/^[ \t]*//; s/[ \t]*$//')"
      [ -n "$item" ] || continue
      abs="$item"; case "$abs" in /*|[A-Za-z]:*) : ;; *) abs="$ROOT/$item" ;; esac
      harness_path_inside "$ROOT" "$abs" || { ATT_SKIP="$ATT_SKIP $item(fora-da-raiz)"; continue; }
      if [ -d "$abs" ]; then
        lista="$(find "$abs" -type f \( -name '*.md' -o -name '*.php' -o -name '*.js' -o -name '*.ts' -o -name '*.py' -o -name '*.sql' -o -name '*.json' -o -name '*.txt' -o -name '*.yml' -o -name '*.yaml' \) 2>/dev/null | sort)"
      else
        lista="$abs"
      fi
      for f in $lista; do
        [ -f "$f" ] || { ATT_SKIP="$ATT_SKIP $f(ausente)"; continue; }
        sz="$(wc -c < "$f" 2>/dev/null | tr -d '[:space:]')"; : "${sz:=0}"
        if [ $(( ATT_USED + sz )) -gt "$ATT_BUDGET" ]; then ATT_SKIP="$ATT_SKIP ${f#"$ROOT"/}(teto)"; continue; fi
        ATT_USED=$(( ATT_USED + sz )); ATT_N=$(( ATT_N + 1 ))
        printf '## Anexo %s — `%s` (%s bytes)\n\n```\n' "$ATT_N" "${f#"$ROOT"/}" "$sz"
        cat "$f"; printf '\n```\n\n'
      done
      IFS=','
    done
    IFS="$OLDIFS"
    [ -n "$ATT_SKIP" ] && printf '> Nao anexados (teto de %s KB ou inexistentes):%s\n' "$ATT_MAX_KB" "$ATT_SKIP"
    if [ "$ATT_N" -eq 0 ]; then harness_log "AVISO: openrouter sem anexo util (--attach) — o modelo so vera o envelope."; fi
  fi
  :   # status do bloco = sucesso (o ultimo teste acima nao pode decidir o redirecionamento)
} > "$INPUT" 2>/dev/null || die_uso "falha ao montar o envelope em $INPUT"

# ---------------------------------------------------------------------------
# 6) Execucao
# ---------------------------------------------------------------------------
TIMEOUT="$(harness_sane_timeout "$TIMEOUT" "${HARNESS_DELEGATE_TIMEOUT:-600}")"
TIMEOUT_CMD="$(harness_resolve_timeout_cmd "$TIMEOUT")"

# Impressao do working tree ANTES — prova de read-only, nao promessa.
# O `-- .` restringe ao diretorio do PROJETO: sem ele, num harness aninhado o
# status varreria o repo hospedeiro inteiro e qualquer edicao alheia (outra
# sessao, outro projeto do mesmo vault) viraria falso alarme de escrita.
tree_fingerprint() {
  {
    git status --porcelain -- . 2>/dev/null
    git diff HEAD --stat -- . 2>/dev/null
  } | cksum | tr -d ' '
}
FP_BEFORE="$(tree_fingerprint)"
T_START="$(date +%s)"
T_START_ISO="$(date -Iseconds 2>/dev/null || date)"

# DT-474 (PRD-125, 23/08): houve falha "DELEGACAO|erro" em ~1s por diretorio de saida ausente na
# hora do write (2/2 em discovery-dts/impacto, sem reproducao isolada). Defesa: garantir os
# diretorios IMEDIATAMENTE antes de executar e falhar com diagnostico nomeado, nunca generico.
for d in "$WORKDIR" "$(dirname "$RAW")" "$(dirname "$OUTPUT")" "$(dirname "$EVENTS")"; do
  mkdir -p "$d" 2>/dev/null
  [ -d "$d" ] && [ -w "$d" ] || { harness_log "diretorio de saida inacessivel: $d"; printf 'DELEGACAO|erro|%s|\n' "$EXECUTOR"; exit 12; }
done
harness_log "delegando '$TASK' (papel $ROLE) a $EXECUTOR — read-only, teto ${TIMEOUT}s, ciclo $CICLO."

run_executor() {
  case "$EXECUTOR" in
    codex-cli)
      # `codex exec -` le o prompt do STDIN. Sandbox read-only do SO + sem
      # aprovacao interativa + sem persistir sessao. --json da os eventos (com o
      # usage real de tokens); -o entrega a mensagem final ja limpa.
      set -- codex exec \
        --sandbox read-only \
        --ephemeral \
        --skip-git-repo-check \
        -c approval_policy="never"
      [ -n "$REASONING" ] && set -- "$@" -c "model_reasoning_effort=$REASONING"
      # 3.5.2: o modelo e do HARNESS, nao do ~/.codex/config.toml — o app do Codex
      # reescreve aquele arquivo a cada update e ja quebrou o parque inteiro (11/09:
      # o app gravou `gpt-6-astra`, que a CLI do PATH nao suportava => 400 em todos
      # os projetos). --model explicito ganha do config; knob vazio volta a herdar.
      CODEX_MODEL="${MODEL:-${HARNESS_DELEGATE_CODEX_MODEL-gpt-5.6-sol}}"
      [ -n "$CODEX_MODEL" ] && set -- "$@" --model "$CODEX_MODEL"
      set -- "$@" --color never --json -o "$RAW" -
      (
        export HARNESS_IN_EXTERNAL_AGENT=1 HARNESS_IN_EXTERNAL_REVIEW=1 HARNESS_RAG_IN_SUMMARIZE=1
        # shellcheck disable=SC2086
        $TIMEOUT_CMD "$@" < "$INPUT" > "$EVENTS" 2> "$ERRF"
      )
      ;;
    claude-cli)
      # `claude -p` E o print mode oficial. Restricao read-only pelo mecanismo
      # suportado da versao instalada: --tools limita o conjunto built-in
      # oferecido ao modelo e --disallowedTools nega o resto explicitamente.
      set -- "${HARNESS_RAG_CLAUDE_BIN:-claude}" -p \
        --no-session-persistence \
        --output-format text \
        --tools "Read,Glob,Grep" \
        --disallowedTools "Write,Edit,NotebookEdit,Bash,WebFetch,WebSearch" \
        --permission-mode dontAsk \
        --strict-mcp-config
      [ -n "$MODEL" ] && set -- "$@" --model "$MODEL"
      (
        export HARNESS_IN_EXTERNAL_AGENT=1 HARNESS_IN_EXTERNAL_REVIEW=1 HARNESS_RAG_IN_SUMMARIZE=1
        # shellcheck disable=SC2086
        $TIMEOUT_CMD "$@" < "$INPUT" > "$RAW" 2> "$ERRF"
      )
      ;;
    openrouter|ollama)
      # Chamada HTTP pura (Node >= 18, fetch nativo; sem dependencia). Nao ha
      # ferramenta nem sandbox porque nao ha agente: e UMA completion sobre o
      # envelope + anexos. O usage (e o custo em USD, quando o OpenRouter reporta)
      # vai para $EVENTS em UMA linha JSON, no mesmo espirito do turn.completed do Codex.
      # 3.4.7: o executor 'ollama' e o MESMO motor apontado para a GPU local
      # ({HARNESS_OLLAMA_URL}/v1 — API OpenAI-compativel): zero custo, zero rede externa.
      if [ "$EXECUTOR" = "ollama" ]; then
        # 3.4.8 (31/08): 'auto' (ou vazio) escolhe o modelo pela memoria livre da maquina —
        # com folga roda o GRANDE, apertado roda o PEQUENO. MODEL e atualizado para o
        # RESOLVIDO: o manifest/placar registram o modelo real, nunca 'auto'.
        # DT-006 (01/09): a resolucao recebe o tamanho estimado da ENTRADA (bytes/3) —
        # 30b so para prompt pequeno; acima do teto local, a delegacao falha AQUI com
        # motivo legivel em vez de truncar em silencio no runner.
        OLL_TOK_EST=$(( $(wc -c < "$INPUT" 2>/dev/null || echo 0) / 2 ))   # estimador canonico bytes/2 (DT-006)
        if ! OR_MODEL="$(harness_ollama_resolver_modelo "${MODEL:-}" "$OLL_TOK_EST")"; then
          harness_log "ollama: entrada ~${OLL_TOK_EST} tokens acima da capacidade local (DT-006) — use um executor remoto ou reduza o prompt."
          exit 10
        fi
        # resolvido nao puxado mas o par do 'auto' existe? usa o que existir (nunca falha a toa)
        OLL_TAGS_X="$(curl -s -m 3 "${HARNESS_OLLAMA_URL:-http://localhost:11434}/api/tags" 2>/dev/null)"
        if [ -n "$OLL_TAGS_X" ] && ! printf '%s' "$OLL_TAGS_X" | grep -q "\"name\":\"$OR_MODEL"; then
          for alt in "${HARNESS_OLLAMA_MODEL_PEQUENO:-qwen2.5-coder:14b}" "${HARNESS_OLLAMA_MODEL_GRANDE:-qwen3-coder:30b}"; do
            if printf '%s' "$OLL_TAGS_X" | grep -q "\"name\":\"$alt"; then
              harness_log "ollama: '$OR_MODEL' nao puxado — usando '$alt'."
              OR_MODEL="$alt"; break
            fi
          done
        fi
        MODEL="$OR_MODEL"
        harness_log "ollama: modelo resolvido -> $OR_MODEL"
        OR_BASE_URL="${HARNESS_OLLAMA_URL:-http://localhost:11434}/v1"
      else
        OR_MODEL="${MODEL:-${HARNESS_OPENROUTER_MODEL:-deepseek/deepseek-v4-flash-0731}}"
        OR_BASE_URL="${HARNESS_OPENROUTER_URL:-https://openrouter.ai/api/v1}"   # 3.4.24: override so p/ teste/proxy
      fi
      # 3.4.24 (item 11b) — FERRAMENTAS por modelo: o loop --tools reenvia o contexto inteiro a
      # cada turno e o provedor cobra tudo (qwen3-coder-next: 1,74 M tokens de entrada para um
      # packet de 104 KB, 0/5 vitorias). HARNESS_DELEGATE_TOOLS='off' desliga para todos;
      # HARNESS_DELEGATE_TOOLS_OFF_MODELS (csv) desliga so para os listados — rodam como
      # completion cega (packet + anexos), que e o modo em que esses modelos rendem.
      if [ "$TOOLS" = "1" ]; then
        if [ "${HARNESS_DELEGATE_TOOLS:-on}" = "off" ]; then
          TOOLS="0"; harness_log "tools desligadas (HARNESS_DELEGATE_TOOLS=off) — completion cega."
        else
          _OFFM=",$(printf '%s' "${HARNESS_DELEGATE_TOOLS_OFF_MODELS:-}" | tr -d ' '),"
          case "$_OFFM" in *",$OR_MODEL,"*) TOOLS="0"; harness_log "tools desligadas para '$OR_MODEL' (HARNESS_DELEGATE_TOOLS_OFF_MODELS) — completion cega." ;; esac
        fi
      fi
      OR_NODE="${HARNESS_RAG_NODE:-node}"
      : > "$RAW"   # existe mesmo em timeout (a normalizacao le o tamanho dele)
      (
        # OR_REASONING: sem valor explicito o DeepSeek queima o teto de output inteiro
        # pensando e devolve VAZIO (triagem do dt-sweep, 24/08) — default 'low', como o
        # duelo ja fazia via HARNESS_DUELO_REASONING. Override: --reasoning ou
        # HARNESS_OPENROUTER_REASONING ('none' desliga o pensamento).
        export HARNESS_IN_EXTERNAL_AGENT=1 HARNESS_IN_EXTERNAL_REVIEW=1 HARNESS_RAG_IN_SUMMARIZE=1
        # A chave pode ter vindo de source dos harness.env.local (variavel de shell,
        # nao de ambiente) — sem este export o node ve process.env vazio e sai com 10
        # ("OPENROUTER_API_KEY ausente"), mesmo com a chave presente (PRD-126, 24/08).
        export OPENROUTER_API_KEY
        export OR_MODEL OR_BASE_URL OR_INPUT="$INPUT" OR_RAW="$RAW" OR_EVENTS="$EVENTS" OR_TIMEOUT="$TIMEOUT" \
               OR_TOK_EST="${OLL_TOK_EST:-}" OR_NUM_CTX_MAX="${HARNESS_OLLAMA_NUM_CTX_MAX:-32768}" \
               OR_MAX_OUT="${HARNESS_OPENROUTER_MAX_OUTPUT_TOKENS:-4000}" \
               OR_REASONING="${REASONING:-${HARNESS_OPENROUTER_REASONING:-low}}" \
               OR_SORT="${HARNESS_OPENROUTER_SORT:-throughput}" \
               OR_TOOLS="$([ "$TOOLS" = "1" ] && echo 1 || echo 0)" \
               OR_TOOL_TURNS="${HARNESS_DELEGATE_TOOLS_MAX_TURNOS:-${HARNESS_OPENROUTER_TOOL_TURNS:-4}}" \
               OR_EXECUTOR="$EXECUTOR" OR_LINT_CMD="${HARNESS_LINT_CMD:-}"
        # shellcheck disable=SC2016
        $TIMEOUT_CMD "$OR_NODE" -e '
          const fs = require("fs");
          const BASE = process.env.OR_BASE_URL || "https://openrouter.ai/api/v1";
          // ollama: sem chave, sem provider.sort, sem reasoning. 3.4.24: decidido pelo EXECUTOR (nao
          // pela URL) — HARNESS_OPENROUTER_URL pode apontar o openrouter a um proxy/stub local.
          const LOCAL = process.env.OR_EXECUTOR ? process.env.OR_EXECUTOR === "ollama" : /^https?:\/\/(localhost|127\.0\.0\.1)[:\/]/.test(BASE);
          const key = process.env.OPENROUTER_API_KEY;
          if (!key && !LOCAL) { process.stderr.write("OPENROUTER_API_KEY ausente\n"); process.exit(10); }
          const body = {
            model: process.env.OR_MODEL,
            messages: [{ role: "user", content: fs.readFileSync(process.env.OR_INPUT, "utf8") }],
            max_tokens: Number(process.env.OR_MAX_OUT) || 4000,
            usage: { include: true },
          };
          // Gemini 3.x: o Google DEPRECIOU os sampling params e manda manter temperature no
          // default 1.0 — forcar 0 num modelo de reasoning causa loop/degradacao/resposta
          // VAZIA (docs "Gemini 3 developer guide"; medido 25/08: 1 token em 18s no LOTE-027).
          if (!/google\/gemini-3/.test(process.env.OR_MODEL || "")) body.temperature = 0;
          // reasoning: "none" desliga o pensamento (worker de diff nao precisa); low/medium/high.
          // LOCAL (ollama): nao mandar — campo fora da spec OpenAI pode dar 400 em versoes antigas.
          if (!LOCAL) {
            if (process.env.OR_REASONING === "none") body.reasoning = { enabled: false };
            else if (process.env.OR_REASONING) body.reasoning = { effort: process.env.OR_REASONING };
            // roteamento por THROUGHPUT (velocidade e a prioridade do harness) — HARNESS_OPENROUTER_SORT
            if (process.env.OR_SORT) body.provider = { sort: process.env.OR_SORT };
          }
          const ctl = new AbortController();
          const t = setTimeout(() => ctl.abort(), (Number(process.env.OR_TIMEOUT) || 600) * 1000 - 2000);
          // ---- via LOCAL nativa (DT-006, 01/09): /api/chat com http puro. Tres motivos medidos
          // no DT-540: (1) o /v1 OpenAI-compat nao aceita options.num_ctx e o runner truncou um
          // prompt de 42.776 tokens a 16.386 EM SILENCIO; (2) o fetch/undici tem headers-timeout
          // de ~300s proprio, que matou o worker aos 318s com teto de 600s; (3) o /api/chat
          // devolve prompt_eval_count, que permite DETECTAR truncamento em vez de mandar diff
          // lixo ao juiz. num_ctx dimensionado pela entrada real, com teto HARNESS_OLLAMA_NUM_CTX_MAX.
          const http = require("http");
          // O llama-server, quando o prompt nao cabe, TRUNCA A METADE do n_ctx do slot (medido
          // 01/09: n_ctx 25344 -> limit 12627; 8192 -> 4098). Por isso NCTX = est*2 + 2*out:
          // garante prompt real < NCTX/2 mesmo com a tokenizacao mais densa medida.
          const NCTX = (() => { if (!LOCAL) return 0;
            let est = Number(process.env.OR_TOK_EST) || 0;
            if (!est) { try { est = Math.ceil(fs.statSync(process.env.OR_INPUT).size / 2); } catch { est = 8000; } }
            const max = Number(process.env.OR_NUM_CTX_MAX) || 32768;
            const out = Number(process.env.OR_MAX_OUT) || 4000;
            return Math.min(Math.max(est * 2 + out * 2, 8192), max);
          })();
          const chamarNativo = (b) => new Promise((resolve) => {
            const msgs = (b.messages || []).map(m => {
              if (m.role === "assistant" && m.tool_calls) {
                const tcs = m.tool_calls.map(tc => { const f = { ...tc.function }; if (typeof f.arguments === "string") { try { f.arguments = JSON.parse(f.arguments || "{}"); } catch { f.arguments = {}; } } return { ...tc, function: f }; });
                return { ...m, tool_calls: tcs };
              }
              return m;
            });
            const nb = { model: b.model, messages: msgs, stream: false, keep_alive: "15m",
                         options: { num_ctx: NCTX, num_predict: b.max_tokens || 4000 } };
            if (b.temperature !== undefined) nb.options.temperature = b.temperature;
            if (b.tools) nb.tools = b.tools;
            const u = new URL(BASE.replace(/\/v1\/?$/, "") + "/api/chat");
            const payload = JSON.stringify(nb);
            const req = http.request({ hostname: u.hostname, port: u.port || 11434, path: u.pathname, method: "POST",
              headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } }, res => {
              let txt = ""; res.on("data", c => txt += c);
              res.on("end", () => {
                if (res.statusCode !== 200) { process.stderr.write("HTTP " + res.statusCode + " (ollama nativo): " + txt.slice(0, 600) + "\n"); process.exit(12); }
                let j; try { j = JSON.parse(txt); } catch { process.stderr.write("resposta nao-JSON do ollama: " + txt.slice(0, 300) + "\n"); process.exit(12); }
                const pe = j.prompt_eval_count || 0;
                usageTot.prompt_tokens += pe; usageTot.completion_tokens += (j.eval_count || 0);
                lastModel = j.model || lastModel; lastFinish = j.done_reason || lastFinish;
                // truncou? quando o prompt NAO cabe, o runner corta para um limite exato — medido
                // em ~n_ctx/2 (01/09, /api/chat: 25344->12627, 8192->4098) ou no n_ctx cheio
                // (madrugada, 16386->16386). pe LEGITIMO menor que o slot nao cai nessas janelas.
                const meiaJ = Math.floor(NCTX / 2);
                const naJanela = (v, alvo) => v >= alvo - 128 && v <= alvo + 8;
                if (pe && NCTX && (naJanela(pe, meiaJ) || naJanela(pe, NCTX))) { process.stderr.write("[ollama] PROMPT TRUNCADO: prompt_eval=" + pe + " colado num limite de truncamento do runner (" + meiaJ + " ou " + NCTX + ") — aumente HARNESS_OLLAMA_NUM_CTX_MAX ou reduza o packet (DT-006)\n"); process.exit(13); }
                const m = j.message || {};
                if (m.tool_calls) for (const tc of m.tool_calls) { if (tc.function && typeof tc.function.arguments === "object") tc.function.arguments = JSON.stringify(tc.function.arguments); }
                resolve(m);
              });
            });
            req.on("error", e => { process.stderr.write("ollama http: " + (e && e.message || e) + "\n"); process.exit(12); });
            const tt = setTimeout(() => { try { req.destroy(new Error("timeout")); } catch {} process.stderr.write("[ollama] timeout de transporte no teto da delegacao (" + (Number(process.env.OR_TIMEOUT) || 600) + "s)\n"); process.exit(12); }, (Number(process.env.OR_TIMEOUT) || 600) * 1000 - 2000);
            req.on("close", () => clearTimeout(tt));
            req.end(payload);
          });
          // 3.4.0 — FERRAMENTAS READ-ONLY (OR_TOOLS=1): o worker deixa de ser uma completion cega e
          // vira um mini-agente: pode ler arquivo, listar, grep e rodar o LINT do Perfil num rascunho
          // (em .harness-run/tmp, nunca no repo). Loop com teto de turnos; tudo continua read-only.
          const path = require("path"), cp = require("child_process");
          const ROOT = process.cwd(), TOOLS = process.env.OR_TOOLS === "1";
          // 3.4.24 (item 11b): teto de TURNOS com ferramenta (HARNESS_DELEGATE_TOOLS_MAX_TURNOS, default 4).
          // Cada turno reenvia o contexto inteiro e o provedor cobra tudo de novo; acima do teto o
          // broker ENCERRA pedindo o resultado final sem ferramentas (teto_turnos=1 no evento).
          const MAX_TURNS = Number(process.env.OR_TOOL_TURNS) || 4;
          const dentro = p => { const a = path.resolve(ROOT, p); return a.startsWith(ROOT) ? a : null; };
          const tools = [
            { type: "function", function: { name: "read_file", description: "Le um arquivo do repositorio (ate 120 KB). Caminho relativo a raiz.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
            { type: "function", function: { name: "list_files", description: "Lista arquivos de um diretorio (nao recursivo).", parameters: { type: "object", properties: { dir: { type: "string" } }, required: ["dir"] } } },
            { type: "function", function: { name: "grep", description: "Busca um padrao (regex JS) nos arquivos de um diretorio, recursivo, ate 60 linhas.", parameters: { type: "object", properties: { pattern: { type: "string" }, dir: { type: "string" } }, required: ["pattern"] } } },
            { type: "function", function: { name: "lint", description: "Valida a SINTAXE de um conteudo proposto para um arquivo (roda o lint do projeto num rascunho temporario; nao grava no repo).", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } } },
          ];
          const runTool = (name, a) => {
            try {
              if (name === "read_file") { const p = dentro(a.path); if (!p || !fs.existsSync(p)) return "ERRO: arquivo nao encontrado ou fora da raiz"; const s = fs.readFileSync(p, "utf8"); return s.length > 120000 ? s.slice(0, 120000) + "\n...[truncado]" : s; }
              if (name === "list_files") { const p = dentro(a.dir || "."); if (!p || !fs.existsSync(p)) return "ERRO: diretorio invalido"; return fs.readdirSync(p, { withFileTypes: true }).map(d => (d.isDirectory() ? d.name + "/" : d.name)).join("\n"); }
              if (name === "grep") { const p = dentro(a.dir || "."); if (!p) return "ERRO: fora da raiz"; const re = new RegExp(a.pattern); const out = []; const walk = (d, depth) => { if (depth > 6 || out.length >= 60) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (out.length >= 60) return; if (e.name === "node_modules" || e.name === ".git" || e.name === "vendor") continue; const f = path.join(d, e.name); if (e.isDirectory()) walk(f, depth + 1); else if (/\.(php|js|mjs|ts|tsx|vue|py|sql|html|css|json|md|sh)$/.test(e.name)) { let s; try { s = fs.readFileSync(f, "utf8"); } catch { continue; } s.split("\n").forEach((l, i) => { if (out.length < 60 && re.test(l)) out.push(path.relative(ROOT, f) + ":" + (i + 1) + ": " + l.trim().slice(0, 200)); }); } } }; walk(p, 0); return out.join("\n") || "(nada)"; }
              if (name === "lint") { const cmd = process.env.OR_LINT_CMD; if (!cmd) return "lint nao configurado no projeto (HARNESS_LINT_CMD) — considere OK"; const tmp = path.join(ROOT, ".claude", ".harness-run", "tmp"); fs.mkdirSync(tmp, { recursive: true }); const f = path.join(tmp, "lint-" + Date.now() + path.extname(a.path || ".txt")); fs.writeFileSync(f, a.content); const Q = String.fromCharCode(34); const full = cmd.includes("{file}") ? cmd.replace("{file}", Q + f + Q) : cmd + " " + Q + f + Q; try { const r = cp.execSync(full, { encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] }); return "OK\n" + String(r).slice(0, 800); } catch (e) { return "FALHOU\n" + String((e.stdout || "") + (e.stderr || "")).slice(0, 1200); } finally { try { fs.unlinkSync(f); } catch {} } }
              return "ERRO: ferramenta desconhecida";
            } catch (e) { return "ERRO: " + (e && e.message || e); }
          };
          const usageTot = { prompt_tokens: 0, completion_tokens: 0, cost: 0, reasoning_tokens: 0, cached_tokens: 0 }; let lastModel = null, lastProvider = null, lastFinish = null, turns = 0, toolCalls = 0, tetoTurnos = 0;
          const chamar = async (comTools = TOOLS) => {
            const b = comTools ? { ...body, tools } : body;
            if (LOCAL) return chamarNativo(b);   // DT-006: local vai pela API nativa (num_ctx + http puro)
            const hdrs = { "Content-Type": "application/json", "Connection": "close", "HTTP-Referer": "https://betasistemas.com.br", "X-Title": "harness-beta" };
            if (key) hdrs["Authorization"] = "Bearer " + key;
            const r = await fetch(BASE.replace(/\/+$/, "") + "/chat/completions", { method: "POST", signal: ctl.signal,
              headers: hdrs,
              body: JSON.stringify(b) });
            const txt = await r.text();
            if (!r.ok) { process.stderr.write("HTTP " + r.status + ": " + txt.slice(0, 600) + "\n"); process.exit(12); }
            const j = JSON.parse(txt);
            if (j.usage) { usageTot.prompt_tokens += j.usage.prompt_tokens || 0; usageTot.completion_tokens += j.usage.completion_tokens || 0; usageTot.cost += j.usage.cost || 0;
              usageTot.reasoning_tokens += (j.usage.completion_tokens_details && j.usage.completion_tokens_details.reasoning_tokens) || 0;
              // 3.4.24: prompt caching e AUTOMATICO em alguns provedores do OpenRouter (DeepSeek, Gemini) e
              // reportado em prompt_tokens_details.cached_tokens — o broker so MEDE (nao ha campo universal
              // para PEDIR cache; a 3.4.24 nao inventa um). O dashboard le tokens_cached do manifest.
              usageTot.cached_tokens += (j.usage.prompt_tokens_details && j.usage.prompt_tokens_details.cached_tokens) || 0; }
            lastModel = j.model || lastModel; lastProvider = j.provider || lastProvider;
            lastFinish = (j.choices && j.choices[0] && (j.choices[0].native_finish_reason || j.choices[0].finish_reason)) || lastFinish;
            return (j.choices && j.choices[0] && j.choices[0].message) || {};
          };
          (async () => {
            let msg = await chamar(); turns++;
            while (TOOLS && msg.tool_calls && msg.tool_calls.length && turns < MAX_TURNS) {
              body.messages.push({ role: "assistant", content: msg.content || "", tool_calls: msg.tool_calls });
              for (const tc of msg.tool_calls) { let args = {}; try { args = JSON.parse(tc.function.arguments || "{}"); } catch {} toolCalls++;
                body.messages.push({ role: "tool", tool_call_id: tc.id, content: String(runTool(tc.function.name, args)).slice(0, 60000) }); }
              msg = await chamar(); turns++;
            }
            // 3.4.24 (item 11b): saiu do loop AINDA pedindo ferramenta = bateu o teto de turnos. Encerra
            // pedindo o resultado final SEM tools (a mensagem com tool_calls nao volta ao contexto —
            // o provedor exigiria uma resposta por chamada; o texto parcial, se houver, fica).
            if (TOOLS && msg.tool_calls && msg.tool_calls.length && turns >= MAX_TURNS) {
              tetoTurnos = 1;
              process.stderr.write("[openrouter] teto de turnos com ferramenta atingido (" + MAX_TURNS + " — HARNESS_DELEGATE_TOOLS_MAX_TURNOS) apos " + toolCalls + " chamada(s) — pedindo o resultado final sem tools\n");
              body.messages.push({ role: "assistant", content: (msg.content && msg.content.trim()) || "(chamadas de ferramenta omitidas — teto de turnos do broker)" });
              body.messages.push({ role: "user", content: "TETO DE TURNOS atingido: nenhuma ferramenta a mais sera atendida. Responda AGORA com o resultado FINAL no formato obrigatorio da tarefa, usando so o que ja leu; o que nao conseguiu verificar vai em \"Nao verificado\"." });
              msg = await chamar(false); turns++;
            }
            // RETRY DE VAZIO unificado (25/08 — LOTE-027 e PRD-129/TASK-002): cobre os dois
            // modos. Causas medidas: DeepSeek queima o teto em reasoning (finish=length);
            // Gemini finaliza vazio; e no modo TOOLS o modelo pode "morrer" apos tool_calls
            // sem emitir o texto final. Nudge de 1 turno, SEM tools e com teto dobrado —
            // 2o vazio e vazio mesmo (o placar do duelo pune o modelo).
            if (!msg.content || !msg.content.trim()) {
              process.stderr.write("[openrouter] content vazio (finish=" + lastFinish + ", reasoning_tokens=" + usageTot.reasoning_tokens + ", turns=" + turns + ") — nudge final sem tools, max_tokens x2\n");
              body.max_tokens = (Number(process.env.OR_MAX_OUT) || 4000) * 2;
              body.messages.push({ role: "user", content: "Sua resposta anterior veio VAZIA. Responda AGORA em texto puro, exatamente no formato obrigatorio pedido na tarefa. Nao chame ferramentas, nao explique o atraso." });
              msg = await chamar(false); turns++;
            }
            clearTimeout(t);
            // 3.4.24: NAO usar process.exit() com sockets keep-alive vivos — no Node/Windows o libuv
            // crasha (Assertion UV_HANDLE_CLOSING, exit 127; medido 08/09 apos 5 turnos de --tools;
            // mesmo bug do preflight, 28/08). exitCode + loop esvaziando; Connection: close no fetch.
            fs.writeFileSync(process.env.OR_RAW, msg.content || "");
            fs.writeFileSync(process.env.OR_EVENTS, JSON.stringify({ type: "openrouter.completed", model: lastModel || process.env.OR_MODEL, provider: lastProvider,
              usage: { prompt_tokens: usageTot.prompt_tokens, completion_tokens: usageTot.completion_tokens, cost: usageTot.cost, reasoning_tokens: usageTot.reasoning_tokens, cached_tokens: usageTot.cached_tokens },
              finish_reason: lastFinish, turns, tool_calls: toolCalls, tools: TOOLS ? 1 : 0, teto_turnos: tetoTurnos }) + "\n");
            process.exitCode = 0;
          })().catch(e => { clearTimeout(t); process.stderr.write(String(e && e.message || e) + "\n"); process.exitCode = (e && e.name === "AbortError") ? 124 : 12; });
        ' 2> "$ERRF"
      )
      ;;
  esac
}

run_executor
RC=$?
T_END="$(date +%s)"
DUR=$(( T_END - T_START ))
FP_AFTER="$(tree_fingerprint)"

# ---------------------------------------------------------------------------
# 7) Normalizacao do status
# ---------------------------------------------------------------------------
# 124 = GNU timeout; 137/143 = SIGKILL/SIGTERM do watchdog interno.
STATUS="ok"; EXIT_CODE=0
case "$RC" in
  0)           STATUS="ok" ;;
  124|137|143) STATUS="timeout"; EXIT_CODE=11 ;;
  *)           STATUS="erro";    EXIT_CODE=12 ;;
esac
if [ "$STATUS" = "ok" ] && { [ ! -s "$RAW" ] || [ -z "$(tr -d '[:space:]' < "$RAW" 2>/dev/null)" ]; }; then
  STATUS="vazio"; EXIT_CODE=13
fi

# Tokens REAIS quando o executor os reporta (codex: evento turn.completed.usage).
TOK_IN="n/d"; TOK_OUT="n/d"; TOK_REASON="n/d"; TOK_CACHED="n/d"; TOK_FRESH="n/d"
TOK_FONTE="nao-reportado"
if [ "$EXECUTOR" = "codex-cli" ] && [ -s "$EVENTS" ]; then
  USAGE_LINE="$(grep '"turn.completed"' "$EVENTS" 2>/dev/null | tail -1)"
  if [ -n "$USAGE_LINE" ]; then
    _g() { printf '%s' "$USAGE_LINE" | grep -o "\"$1\":[0-9]*" | tail -1 | cut -d: -f2; }
    TOK_IN="$(_g input_tokens)";            [ -n "$TOK_IN" ]     || TOK_IN="n/d"
    TOK_OUT="$(_g output_tokens)";          [ -n "$TOK_OUT" ]    || TOK_OUT="n/d"
    TOK_REASON="$(_g reasoning_output_tokens)"; [ -n "$TOK_REASON" ] || TOK_REASON="n/d"
    # CACHED (3.0.0): sem ele o input bruto engana. Um agente autonomo acumula
    # contexto a cada turno, entao 'input_tokens' e a SOMA de todos os turnos da
    # thread — o que importa para custo e a parcela NAO cacheada.
    TOK_CACHED="$(_g cached_input_tokens)"; [ -n "$TOK_CACHED" ] || TOK_CACHED="n/d"
    if [ "$TOK_IN" != "n/d" ] && [ "$TOK_CACHED" != "n/d" ]; then
      TOK_FRESH=$(( TOK_IN - TOK_CACHED ))
      [ "$TOK_FRESH" -lt 0 ] 2>/dev/null && TOK_FRESH="n/d"
    fi
    [ "$TOK_OUT" = "n/d" ] || TOK_FONTE="medido"
  fi
fi
# openrouter/ollama (3.2.2/3.4.7): usage padrao OpenAI (prompt_tokens/completion_tokens);
# cost em USD so no openrouter (ollama e gasto zero — cost fica n/d de proposito).
OR_COST="n/d"
if { [ "$EXECUTOR" = "openrouter" ] || [ "$EXECUTOR" = "ollama" ]; } && [ -s "$EVENTS" ]; then
  USAGE_LINE="$(tail -1 "$EVENTS" 2>/dev/null)"
  _g() { printf '%s' "$USAGE_LINE" | grep -o "\"$1\":[0-9.]*" | tail -1 | cut -d: -f2; }
  TOK_IN="$(_g prompt_tokens)";      [ -n "$TOK_IN" ]  || TOK_IN="n/d"
  TOK_OUT="$(_g completion_tokens)"; [ -n "$TOK_OUT" ] || TOK_OUT="n/d"
  TOK_CACHED="$(_g cached_tokens)";  [ -n "$TOK_CACHED" ] || TOK_CACHED="n/d"
  TOK_REASON="$(_g reasoning_tokens)"; [ -n "$TOK_REASON" ] || TOK_REASON="n/d"
  OR_COST="$(_g cost)";              [ -n "$OR_COST" ] || OR_COST="n/d"
  [ "$TOK_OUT" = "n/d" ] || TOK_FONTE="medido"
  if [ "$EXECUTOR" = "ollama" ]; then
    MODEL="${MODEL:-${HARNESS_OLLAMA_MODEL:-auto}}"
  else
    MODEL="${MODEL:-${HARNESS_OPENROUTER_MODEL:-deepseek/deepseek-v4-flash-0731}}"
  fi
fi
OUT_BYTES="$(wc -c < "$RAW" 2>/dev/null | tr -d '[:space:]')"; : "${OUT_BYTES:=0}"
IN_BYTES="$(wc -c < "$INPUT" 2>/dev/null | tr -d '[:space:]')"; : "${IN_BYTES:=0}"

TREE_TOCADO="nao"
[ "$FP_BEFORE" = "$FP_AFTER" ] || TREE_TOCADO="SIM"
if [ "$TREE_TOCADO" = "SIM" ]; then
  harness_log "ALERTA: o working tree MUDOU durante uma delegacao read-only ($EXECUTOR/$ROLE). Confira o diff antes de confiar no resultado."
fi

# ---------------------------------------------------------------------------
# 8) Relatorio (cabecalho auditavel + saida do executor)
# ---------------------------------------------------------------------------
{
  printf '# Delegacao externa (%s) — %s / %s (ciclo %s)\n\n' "$EXECUTOR" "$LABEL" "$TASK" "$CICLO"
  printf -- '- **Papel:** %s\n' "$ROLE"
  printf -- '- **Host da sessao:** %s · **Executor:** %s (%s)\n' "$HOST" "$EXECUTOR" "$CLI_VERSION"
  printf -- '- **Modelo:** %s\n' "${MODEL:-herdado da sessao do CLI}"
  printf -- '- **Modo:** read-only · **Working tree alterado:** %s\n' "$TREE_TOCADO"
  printf -- '- **Inicio:** %s · **Duracao:** %ss (teto %ss)\n' "$T_START_ISO" "$DUR" "$TIMEOUT"
  printf -- '- **Status:** %s · **Exit code do CLI:** %s\n' "$STATUS" "$RC"
  printf -- '- **Tokens:** in=%s out=%s reasoning=%s (%s)\n' "$TOK_IN" "$TOK_OUT" "$TOK_REASON" "$TOK_FONTE"
  [ -n "$TAG" ] && printf -- '- **Tag:** %s\n' "$TAG"
  printf '\n---\n\n'
  if [ -s "$RAW" ]; then
    cat "$RAW"
  else
    printf '_(sem conteudo — status `%s`)_\n' "$STATUS"
  fi
  if [ "$STATUS" != "ok" ]; then
    printf '\n\n---\n\n## Diagnostico do broker\n\n'
    printf 'Status `%s` (exit %s do CLI). Ultimas linhas do stderr:\n\n```\n' "$STATUS" "$RC"
    tail -20 "$ERRF" 2>/dev/null
    printf '```\n'
  fi
} > "$OUTPUT" 2>/dev/null

# ---------------------------------------------------------------------------
# 9) Manifest (telemetria granular — uma linha por delegacao)
# ---------------------------------------------------------------------------
# (jesc/jnum definidos no topo — o preflight 1c tambem os usa.)
# 3.3.0: a linha e montada NUMA variavel e gravada com UM write. Antes, o grupo de printfs
# escrevia direto no arquivo e dois workers em paralelo (duelo) INTERCALAVAM os campos na
# mesma linha — JSON corrompido e custo do worker A atribuido ao B (medido 22/08).
MANIFEST_LINE="$( {
  printf '{'
  printf '"ts":"%s",'          "$(jesc "$T_START_ISO")"
  printf '"label":"%s",'       "$(jesc "$LABEL")"
  printf '"task":"%s",'        "$(jesc "$TASK")"
  printf '"role":"%s",'        "$(jesc "$ROLE")"
  printf '"ciclo":%s,'         "$(jnum "$CICLO")"
  printf '"host":"%s",'        "$(jesc "$HOST")"
  printf '"executor":"%s",'    "$(jesc "$EXECUTOR")"
  printf '"cli_version":"%s",' "$(jesc "$CLI_VERSION")"
  printf '"model":"%s",'       "$(jesc "${MODEL:-herdado}")"
  printf '"reasoning":"%s",'   "$(jesc "${REASONING:-default}")"
  printf '"mode":"read-only",'
  printf '"status":"%s",'      "$(jesc "$STATUS")"
  printf '"exit_code":%s,'     "$(jnum "$RC")"
  printf '"duration_s":%s,'    "$(jnum "$DUR")"
  printf '"timeout_s":%s,'     "$(jnum "$TIMEOUT")"
  printf '"input_bytes":%s,'   "$(jnum "$IN_BYTES")"
  printf '"output_bytes":%s,'  "$(jnum "$OUT_BYTES")"
  printf '"max_words":%s,'     "$(jnum "$MAX_WORDS")"
  printf '"tokens_in":"%s",'   "$(jesc "$TOK_IN")"
  printf '"tokens_out":"%s",'  "$(jesc "$TOK_OUT")"
  printf '"tokens_cached":"%s",'    "$(jesc "$TOK_CACHED")"
  printf '"tokens_fresh":"%s",'     "$(jesc "$TOK_FRESH")"
  printf '"tokens_reasoning":"%s",' "$(jesc "$TOK_REASON")"
  printf '"tokens_fonte":"%s",'     "$(jesc "$TOK_FONTE")"
  printf '"tree_tocado":"%s",'      "$(jesc "$TREE_TOCADO")"
  printf '"cost_usd":"%s",'         "$(jesc "${OR_COST:-n/d}")"
  printf '"tag":"%s"'               "$(jesc "$TAG")"
  printf '}'
} )"
printf '%s\n' "$MANIFEST_LINE" >> "$MANIFEST" 2>/dev/null

# Historico VERSIONADO (irmao do harness-runs.jsonl): o manifest vive no
# .harness-run, que e efemero por design — sem esta copia, a unica evidencia de
# "quanto rodou no Codex" morreria na primeira limpeza, e a comparacao entre
# execucoes (a pergunta que motivou a telemetria) ficaria impossivel.
METRICS_DIR="$ROOT/prds/_metrics"
if mkdir -p "$METRICS_DIR" 2>/dev/null; then
  # 3.5.0: delegations/<dev>@<host>.jsonl (por dev/maquina, sem conflito de merge); o stop faz git add dele
  harness_jsonl_append "$(harness_metrics_arquivo "$ROOT" delegations)" "$MANIFEST_LINE"   # DT-007: com lock
fi

# Efemeros: o envelope e a saida bruta ficam (auditoria da rodada); o stderr so
# interessa quando deu errado — em caso de sucesso ele e ruido no diretorio.
[ "$STATUS" = "ok" ] && rm -f "$ERRF" 2>/dev/null

case "$STATUS" in
  ok) harness_log "OK — '$TASK' via $EXECUTOR em ${DUR}s (out=${TOK_OUT} tokens, ${OUT_BYTES}B)."
      # 3.4.6: sucesso real e o melhor ping que existe — renova o cache do preflight
      # (delegacoes seguintes na janela do TTL nem precisam pingar de novo).
      printf '%s|ok|\n' "$(date +%s)" > "$ROOT/.claude/.harness-run/preflight-$EXECUTOR.status" 2>/dev/null
      ;;
  *)  harness_log "FALHOU ($STATUS) — '$TASK' via $EXECUTOR apos ${DUR}s. Relatorio parcial em $OUTPUT" ;;
esac

printf 'DELEGACAO|%s|%s|%s\n' "$STATUS" "$EXECUTOR" "$OUTPUT"
exit "$EXIT_CODE"
