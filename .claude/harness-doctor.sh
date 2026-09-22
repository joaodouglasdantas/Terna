#!/usr/bin/env bash
# .claude/harness-doctor.sh (2.0.0 — multi-AI)
# Verificador de portabilidade do harness. Rode na raiz do repo APOS portar:
#   bash .claude/harness-doctor.sh
# Aponta o que falta configurar (Perfil pela metade, binarios ausentes, lint
# desligado, superficie Codex incompleta). NAO altera nada — so diagnostica.
#
# 2.0.0: as checagens sao agrupadas por AREA e fecham numa MATRIZ multi-AI:
#   nucleo | claude | codex | rag | seguranca | propagacao | portabilidade
# com status por area (OK / WARN / FALTA / N/A). A area 'codex' so e cobrada
# se HARNESS_TARGETS (harness.env) incluir 'codex' — senao e N/A. Um harness
# NUNCA e considerado "pronto para Codex" so porque o settings.json esta ok.
#
# Modos:
#   --autonomia      SO os checks de execucao autonoma (pre-flight da /prd-exec,
#                    Passo 0.2 — host Claude). Exit 0 = pronto; 3 = avisos.
#   --presence       Presenca/Caronte de ponta a ponta: checks locais + ping REAL
#                    de teste (http_code na cara). Exit 0 = ok; 3 = avisos; 1 = falta.
#                    Rode na maquina de quem "nao aparece" no painel do Caronte.
#   --gen-allowlist  Imprime bloco permissions.allow (Claude): minimo canonico do mestre +
#                    tabela do Perfil + (3.4.23) sugestoes das negacoes recorrentes.
#   --apply-allowlist [--sugeridas]
#                    3.4.23: APLICA o bloco gerado no settings.json do projeto por UNIAO (nada
#                    e removido; backup em .harness-run/allowlist-backup/). --sugeridas inclui
#                    tambem as regras sugeridas pelas negacoes recorrentes (revise antes).
#   --gen-rules      Imprime prefix_rule() Starlark (Codex .rules) do MESMO Perfil.
#   --prompt-audit   3.4.25: AUDITORIA DE PROMPTS completa (hooks/prompt-audit.mjs) — todos os
#                    achados por arquivo/linha (agents, skills, contratos, CLAUDE.md, PERFIL-RESUMO).
#                    Rito: a cada geracao nova de modelo. Nao edita nada.
#   --prompt-audit-baseline
#                    Grava a baseline (.harness-run/prompt-audit.baseline.json): dali em diante a
#                    varredura completa so avisa se alto+medio SUBIU.
#
# Saida: [ OK ] / [WARN] / [FALTA] / [ N/A ] por checagem + matriz + resumo.
# Exit 1 se houver FALTA.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # .../.claude
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PERFIL="$SCRIPT_DIR/PERFIL-PROJETO.md"
ENVFILE="$SCRIPT_DIR/harness.env"

# 3.5.7: as CAMADAS de configuracao (hooks/_defaults.env -> harness.env -> harness.env.local -> ~/.harness.env.local;
# ambiente vence) entram pelo carregador unico — o doctor enxerga exatamente o que os hooks enxergam.
# shellcheck disable=SC1091
. "$SCRIPT_DIR/hooks/_env.sh"

OK=0; WARN=0; FAIL=0; NA=0
G_OK=0; G_WARN=0; G_FAIL=0; G_NA=0
G_NAME=""
MATRIX=""

ok()    { printf '  [ OK ] %s\n' "$1"; OK=$((OK+1)); G_OK=$((G_OK+1)); }
warn()  { printf '  [WARN] %s\n' "$1"; WARN=$((WARN+1)); G_WARN=$((G_WARN+1)); }
fail()  { printf '  [FALTA] %s\n' "$1"; FAIL=$((FAIL+1)); G_FAIL=$((G_FAIL+1)); }
na()    { printf '  [ N/A ] %s\n' "$1"; NA=$((NA+1)); G_NA=$((G_NA+1)); }
head_() { printf '\n== %s ==\n' "$1"; }

# Grupos da matriz: begin_group <slug> <titulo> ... end_group
begin_group() {
  G_NAME="$1"; G_OK=0; G_WARN=0; G_FAIL=0; G_NA=0
  head_ "$2"
}
end_group() {
  local status="OK"
  if [ "$G_FAIL" -gt 0 ]; then status="FALTA"
  elif [ "$G_WARN" -gt 0 ]; then status="WARN"
  elif [ $((G_OK + G_WARN + G_FAIL)) -eq 0 ] && [ "$G_NA" -gt 0 ]; then status="N/A"
  fi
  MATRIX="${MATRIX}$(printf '  %-14s %-6s (ok=%s warn=%s falta=%s n/a=%s)' "$G_NAME" "$status" "$G_OK" "$G_WARN" "$G_FAIL" "$G_NA")\n"
}

have()  { command -v "$1" >/dev/null 2>&1; }

# Targets deste repo (quais superficies o doctor cobra).
TARGETS_RAW="$(printf '%s' "${HARNESS_TARGETS:-claude}" | tr -d "[:space:]'\"")"
want_target() { case ",$TARGETS_RAW," in *",$1,"*) return 0 ;; *) return 1 ;; esac; }

# ---------------------------------------------------------------------------
# Helpers do Perfil
# ---------------------------------------------------------------------------

# Placeholders REAIS (2.0.0): a heuristica antiga contava qualquer <...> do
# arquivo — prosa explicativa e exemplos de template viravam "pendencia".
# Agora so conta: (a) linhas com o marcador 🔧; (b) linhas de TABELA (comecam
# com '|') contendo <...> — e nas tabelas que os valores de configuracao moram.
# Blockquotes ('>') e prosa ficam de fora.
perfil_placeholders() {
  [ -f "$PERFIL" ] || return 0
  grep -nE '^\|.*<[^<>=";]+>|🔧' "$PERFIL" 2>/dev/null | grep -v '^[0-9]*:>' || true
}

# Extrai os executaveis declarados no Perfil (Interpretador / Cliente de banco /
# comando de spec E2E). Best-effort: pula placeholders (<...>) e N/A.
perfil_clis() {
  [ -f "$PERFIL" ] || return 0
  grep -E '^\|[[:space:]]*\*\*(Interpretador|Cliente de banco|Comando \(spec)' "$PERFIL" 2>/dev/null \
    | awk -F'|' '{print $3}' \
    | sed -e 's/`//g' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
    | grep -vE '^(<|N/A|Nenhum|🔧|$)' \
    | awk '{print $1}' \
    | grep -vE '^(<|—|-)' \
    | sort -u
}

# Agente INVISIVEL (2.3.0): o parser de frontmatter do host descarta EM SILENCIO
# o agente cujo arquivo combina CRLF + ': ' (dois-pontos+espaco) dentro do VALOR
# da description. Incidente real: hefesto/michelangelo/peter-quill sumiram do
# registry em ~20 projetos (21-24/07/2026) apos regravacao com CRLF — o /prd-exec
# caiu em general-purpose (modelo da sessao, sem o contrato) sem nenhum aviso.
# LF com ': ' funciona (atlas) e CRLF sem ': ' funciona (sherlock) — so a
# COMBINACAO mata. Description entre aspas nao dispara (scalar quotado e seguro).
# Retorno: 0 = ok · 1 = INVISIVEL · 2 = CRLF sem gatilho (risco latente).
agent_visibility() { # $1 = caminho do .md do agente
  local f="$1" desc crlf
  # Deteccao de CR tem de ser BINARIA: no Git Bash/Windows, grep e awk (mingw)
  # leem arquivo em modo texto e REMOVEM o \r antes de casar — falso negativo
  # silencioso. head|tr preserva os bytes do stream (validado 24/07/2026).
  crlf="$(head -c 4096 "$f" 2>/dev/null | tr -dc '\r' | wc -c | tr -d '[:space:]')"
  case "$crlf" in (""|0) return 0 ;; esac
  desc="$(sed -n 's/^description:[[:space:]]*//p' "$f" 2>/dev/null | head -1 | tr -d '\r')"
  case "$desc" in
    \"*|\'*) return 2 ;;      # quotado: ': ' interno e seguro
    *": "*)  return 1 ;;
  esac
  return 2
}

# Comandos da tabela "Execucao autonoma" do Perfil (1a celula em backticks).
perfil_cmds_allowlist() {
  [ -f "$PERFIL" ] || return 0
  awk '/^## Execu/ && /allowlist/{f=1;next} /^## /{f=0} f' "$PERFIL" 2>/dev/null \
    | grep -E '^\|' \
    | grep -v '🔧' \
    | sed -n 's/^|[^`]*`\([^`][^`]*\)`.*/\1/p' \
    | grep -vE '^[[:space:]]*<' \
    | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
    | grep -E '^[A-Za-z0-9_./~]' \
    | grep -v '^$' || true
}

# ---------------------------------------------------------------------------
# Execucao autonoma (host CLAUDE — 1.8.0/1.9.0). Reusada por --autonomia e
# pela varredura completa (grupo seguranca).
# ---------------------------------------------------------------------------
check_autonomia() {
  head_ "Execucao autonoma — host Claude (alerta de espera + guardas + allowlist)"

  # 1) hooks do nucleo presentes
  for h in notify.sh guard-bash.sh denied.sh guard-bash.mjs presence.mjs harness-daemon.mjs frentes.mjs sessoes.mjs guard-folego.mjs task-telemetry.mjs guard-question.sh prompt-audit.mjs; do
    if [ -f "$SCRIPT_DIR/hooks/$h" ]; then
      ok "hook $h presente."
    else
      fail "hook $h ausente — nucleo 1.8.0/1.9.0/3.4.21/3.4.23/3.4.25; atualize via /deus (ou copie da mestre)."
    fi
  done

  # 2) wiring no settings.json (o sync NAO propaga settings.json — decisao local)
  SJ="$SCRIPT_DIR/settings.json"
  if [ -f "$SJ" ]; then
    if grep -q 'notify\.sh' "$SJ" 2>/dev/null; then
      ok "hook Notification (notify.sh) registrado no settings.json."
    else
      warn "notify.sh NAO registrado no settings.json — prompt de permissao pendente fica MUDO. Copie o bloco Notification da mestre (ver ONBOARDING 1.8.0)."
    fi
    if grep -qE 'guard-bash\.(sh|mjs)' "$SJ" 2>/dev/null; then
      ok "hook PreToolUse (guard-bash) registrado no settings.json."
    else
      warn "guard-bash NAO registrado no settings.json — temporario fora do projeto nao e bloqueado. Copie o bloco PreToolUse da mestre (ver ONBOARDING 1.8.0)."
    fi
    # -o|wc -l = ocorrencias (nao linhas — settings.json minificado enganaria o -c)
    # 3.4.8: aceita .sh ou .mjs (port Node)
    POST_N="$(grep -oE 'guard-bash\.(sh|mjs) --post' "$SJ" 2>/dev/null | wc -l | tr -d '[:space:]')"
    case "$POST_N" in (*[!0-9]*|"") POST_N=0 ;; esac
    if [ "$POST_N" -ge 2 ] 2>/dev/null; then
      ok "anti-espiral ARMADO ('guard-bash --post' em PostToolUse E PostToolUseFailure)."
    else
      warn "anti-espiral DORMENTE — wiring 'guard-bash --post' aparece ${POST_N}x no settings.json (precisa 2: PostToolUse E PostToolUseFailure). Copie os blocos da mestre (ONBOARDING 1.9.0)."
    fi
    if grep -q 'denied\.sh' "$SJ" 2>/dev/null; then
      ok "hook PermissionDenied (denied.sh) registrado no settings.json."
    else
      warn "denied.sh NAO registrado no settings.json — negacao do classificador nao gera alerta nem protocolo. Copie o bloco PermissionDenied da mestre (ONBOARDING 1.9.0)."
    fi
    if grep -q 'guard-write\.sh' "$SJ" 2>/dev/null; then
      ok "hook PreToolUse Write (guard-write.sh) registrado no settings.json (Edit-first 3.4.6)."
    else
      warn "guard-write.sh NAO registrado no settings.json — reescrita integral de arquivo existente nao e bloqueada (o executor mais caro paga output a toa). Wire PreToolUse matcher Write (ONBOARDING 3.4.6)."
    fi
    # 3.4.23 (item 18): pergunta em modo autonomo e NEGADA por hook; AskUserQuestion allowlistada
    if grep -q 'guard-question\.sh' "$SJ" 2>/dev/null; then
      ok "guard-question ARMADO (PreToolUse AskUserQuestion — nega pergunta em modo autonomo, 3.4.23)."
    else
      warn "guard-question.sh NAO registrado no settings.json — em --noturno/TURBO uma AskUserQuestion vira parada de horas (medido: 59 min). O sync traz o bloco PreToolUse 'AskUserQuestion' do mestre (harness-sync.sh --apply / /deus)."
    fi
    if grep -q '"AskUserQuestion"' "$SJ" 2>/dev/null; then
      ok "AskUserQuestion em permissions.allow (a pergunta ja e a parada; sem 2a permissao — 3.4.23)."
    else
      warn "AskUserQuestion FORA de permissions.allow — cada pergunta do run pede uma 2a permissao (27 prompts em 2 dias, 04/09). Entra por uniao no sync (harness-sync.sh --apply) ou: bash .claude/harness-doctor.sh --apply-allowlist"
    fi
    if grep -q 'guard-agent\.sh --post' "$SJ" 2>/dev/null; then
      ok "watchdog de subagente ARMADO ('guard-agent.sh --post' em PostToolUse Agent — 3.4.7)."
    else
      warn "watchdog de subagente DORMENTE — 'guard-agent.sh --post' ausente do settings.json (PostToolUse, matcher Agent). Sem ele, agente que estoura o p90 do papel nao gera aviso (caso LOTE-028: 5h37/1 task). Ver ONBOARDING 3.4.7."
    fi
    # 3.4.22: teto de folego por hook (item 7) + telemetria por task (item 8)
    if grep -q '/h/PreToolUse/guard-folego' "$SJ" 2>/dev/null; then
      ok "teto de folego ENFORCADO (guard-folego em PreToolUse Edit|Write + dentro do guard-bash — 3.4.22)."
    else
      warn "teto de folego NAO wired em Edit|Write (3.4.22): so o Bash e conferido (via guard-bash). Copie o bloco PreToolUse 'Edit|Write' do settings.json do mestre (o /deus faz isso)."
    fi
    if [ -d "$SCRIPT_DIR/.harness-run/watchdog" ]; then
      NST="$(ls "$SCRIPT_DIR"/.harness-run/watchdog/*.start 2>/dev/null | wc -l | tr -d ' ')"
      rm -rf "$SCRIPT_DIR/.harness-run/watchdog" 2>/dev/null
      ok "marcadores .start do watchdog antigo removidos (${NST:-0} orfaos — 3.4.22 mede no SubagentStop)."
    fi
    if [ -d "$PROJECT_DIR/prds/_metrics/tasks" ]; then
      NTK="$(cat "$PROJECT_DIR"/prds/_metrics/tasks/*.jsonl 2>/dev/null | wc -l | tr -d ' ')"
      ok "telemetria por task: ${NTK:-0} linha(s) em prds/_metrics/tasks/ (p90 do watchdog e PREVISAO do packet saem daqui)."
    else
      na "telemetria por task ainda vazia (prds/_metrics/tasks/ nasce no 1o SubagentStop desta versao)."
    fi
    # 3.4.21: daemon de hooks (Bash/presenca via curl, sem spawn de node) + semaforo de frentes
    if grep -q 'harness-daemon.mjs --ensure' "$SJ" 2>/dev/null && grep -q '/h/PreToolUse/guard-bash' "$SJ" 2>/dev/null; then
      ok "daemon de hooks WIRED (SessionStart --ensure + curl em PreToolUse/PostToolUse — 3.4.21)."
    else
      warn "daemon de hooks NAO wired (3.4.21) — cada Bash de agente paga 2 bash + 1 node por hook. Copie os blocos SessionStart/PreToolUse/PostToolUse/UserPromptSubmit da mestre."
    fi
    if [ -f "$SCRIPT_DIR/.harness-run/daemon.on" ]; then
      ok "daemon de hooks ATIVO neste projeto (porta $(head -1 "$SCRIPT_DIR/.harness-run/daemon.on" 2>/dev/null)) — status: node .claude/hooks/harness-daemon.mjs --status"
    elif [ "${HARNESS_DAEMON:-on}" = "off" ]; then
      na "daemon de hooks desligado (HARNESS_DAEMON=off) — hooks em modo direto."
    else
      warn "daemon de hooks INATIVO neste projeto (sem .harness-run/daemon.on): hooks em modo direto. Suba: node .claude/hooks/harness-daemon.mjs --ensure (o SessionStart faz isso sozinho)."
    fi
    if command -v curl >/dev/null 2>&1; then
      ok "curl presente (cliente nativo dos hooks via daemon)."
    else
      warn "curl AUSENTE — os hooks nao conseguem falar com o daemon (fallback node, mais lento). Instale o curl (Git for Windows ja traz)."
    fi
    if [ -f "$SCRIPT_DIR/hooks/frentes.mjs" ] && command -v node >/dev/null 2>&1; then
      FR="$(node "$SCRIPT_DIR/hooks/frentes.mjs" status 2>/dev/null | head -1)"
      ok "semaforo de frentes: ${FR:-n/d} (1 frente pesada por PC Windows, 2 no macOS — HARNESS_FRENTES_MAX)."
    fi
  else
    warn "settings.json ausente em .claude/ — NENHUM hook do harness esta ativo no host Claude."
  fi

  # 3) alerta local configurado?
  if [ -n "${HARNESS_NOTIFY_CMD:-}" ]; then
    ok "HARNESS_NOTIFY_CMD configurado (espera humana gera alerta local)."
  else
    warn "HARNESS_NOTIFY_CMD vazio — espera humana e LOGADA (telemetria) mas nao gera som/toast. Exemplos prontos no harness.env."
  fi
  # 3b) e-mail de espera via Beholder (3.4.6 — opt-in por maquina)
  if [ "${HARNESS_NOTIFY_EMAIL:-auto}" = "0" ]; then
    ok "e-mail de espera (Beholder) desligado por escolha (HARNESS_NOTIFY_EMAIL=0)."
  elif [ -n "${HARNESS_BEHOLDER_URL:-}" ] && [ -n "${HARNESS_BEHOLDER_TOKEN:-}" ]; then
    ok "e-mail de espera via Beholder ARMADO (URL+token presentes; destinatario = git_email)."
  else
    warn "e-mail de espera via Beholder dormente — declare HARNESS_BEHOLDER_URL e HARNESS_BEHOLDER_TOKEN no ~/.harness.env.local (ONBOARDING 3.4.6). Espera de madrugada (medido: 208 min) fica sem aviso."
  fi

  # 4) allowlist ESTREITA no settings.json do PROJETO (1.9.0).
  if [ -f "$SJ" ]; then
    ALLOW_RULES="$(grep -oE '"(Bash|PowerShell)\([^)]*\)"' "$SJ" 2>/dev/null || true)"
    if [ -z "$ALLOW_RULES" ]; then
      warn "settings.json sem permissions.allow — em outage do classificador NADA executa em auto mode. Gere regras estreitas: bash .claude/harness-doctor.sh --gen-allowlist"
    else
      NARROW="$(printf '%s\n' "$ALLOW_RULES" | grep -E '\([^)]* [^)]*\)' || true)"
      if [ -z "$NARROW" ]; then
        warn "permissions.allow so tem regra LARGA (interpretador wildcarded, ex. Bash(php:*)) — auto mode SUSPENDE regras largas; elas caem no classificador mesmo assim. Troque por regras estreitas: --gen-allowlist"
      else
        ok "allowlist estreita presente no settings.json (sobrevive a outage do classificador)."
      fi
    fi
  fi

  # 4b) 3.4.23 (item 18d): negacao RECORRENTE do classificador vira sugestao de regra estreita.
  REC="$(denied_recorrentes)"
  if [ -n "$REC" ]; then
    warn "comando(s) negado(s) pelo classificador ${HARNESS_DENIED_SUGERIR_N:-3}+ vezes em ${HARNESS_DENIED_SUGERIR_DIAS:-7} dias — regra estreita pronta (revise: --gen-allowlist mostra; --apply-allowlist --sugeridas aplica):"
    while IFS='|' read -r rn rk; do
      [ -z "$rk" ] && continue
      rr="$(sugestao_regra "$rk")"
      printf '         %sx  %s  ->  %s\n' "$rn" "$rk" "${rr:-(regra LARGA nao sugerida: 1 token de interpretador/cliente de banco — use subcomando ou wrapper)}"
    done <<EOF_REC
$REC
EOF_REC
  else
    ok "sem comando negado de forma recorrente (${HARNESS_DENIED_SUGERIR_N:-3}+ em ${HARNESS_DENIED_SUGERIR_DIAS:-7} dias)."
  fi

  # 5) allowlist de PREFIXO cobrindo os CLIs do Perfil (aviso, nunca bloqueio).
  SL="$SCRIPT_DIR/settings.local.json"
  if [ ! -f "$SL" ]; then
    warn "settings.local.json ausente — todo comando pede permissao; execucao autonoma tende a PENDURAR. Copie o .example e adicione prefixos dos CLIs do Perfil."
  elif [ ! -f "$PERFIL" ]; then
    warn "sem Perfil — impossivel conferir a allowlist dos CLIs da stack."
  else
    CLIS="$(perfil_clis)"
    if [ -z "$CLIS" ]; then
      printf "  [info] nenhum CLI extraivel do Perfil (placeholders ou layout customizado) — confira manualmente se interpretador/banco/test runner tem prefixo na allowlist.\n"
    else
      MISS_CLI=""
      while IFS= read -r bin; do
        [ -z "$bin" ] && continue
        base="${bin##*/}"
        grep -qF "$base" "$SL" 2>/dev/null || MISS_CLI="$MISS_CLI $base"
      done <<EOF_CLIS
$CLIS
EOF_CLIS
      if [ -n "$MISS_CLI" ]; then
        warn "CLI(s) do Perfil SEM allowlist de prefixo no settings.local.json:$MISS_CLI — adicione entradas de prefixo (ex: Bash(\"<caminho-do-cli>\" :*)) p/ a execucao nao pendurar em prompt."
      else
        ok "CLIs do Perfil cobertos por allowlist de prefixo (settings.local.json)."
      fi
    fi
  fi

  # 6) agentes do harness VISIVEIS ao host? (2.3.0 — CRLF + ': ' na description =
  #    agente descartado em silencio; o spawn cai em general-purpose sem aviso e a
  #    execucao fica mais lenta/cara sem ninguem perceber)
  if [ -d "$SCRIPT_DIR/agents" ]; then
    INVIS=""; CRLF_ONLY=""
    for af in "$SCRIPT_DIR/agents"/*.md; do
      [ -f "$af" ] || continue
      agent_visibility "$af"
      case $? in
        1) INVIS="$INVIS $(basename "$af" .md)" ;;
        2) CRLF_ONLY="$CRLF_ONLY $(basename "$af" .md)" ;;
      esac
    done
    if [ -n "$INVIS" ]; then
      fail "agente(s) INVISIVEL(is) ao host:$INVIS — CRLF + ': ' na description; o spawn falha com 'Agent type not found' e cai em general-purpose (modelo caro, sem contrato). Corrija ANTES de decolar: dos2unix .claude/agents/*.md"
    elif [ -n "$CRLF_ONLY" ]; then
      warn "agente(s) com CRLF (carregam hoje, risco latente):$CRLF_ONLY — qualquer ': ' futuro na description os torna invisiveis. Normalize: dos2unix .claude/agents/*.md"
    else
      ok "agentes do harness visiveis ao host (sem combinacao CRLF + ': ')."
    fi
  fi

  # 7) sessoes autonomas paralelas (best-effort, 1.9.0).
  MAXS="${HARNESS_MAX_ACTIVE_SESSIONS:-2}"
  ACTIVE="$(find "${HOME:-/nonexistent}/.claude/projects" -name '*.jsonl' -mmin -10 2>/dev/null \
    | awk -F/ 'NF>1{print $(NF-1)}' | sort -u | grep -c . || true)"
  case "$ACTIVE" in (*[!0-9]*|"") ACTIVE=0 ;; esac
  if [ "$ACTIVE" -gt "$MAXS" ] 2>/dev/null; then
    warn "~$ACTIVE sessao(oes) Claude Code ativa(s) na maquina (transcript <10min) — acima do recomendado ($MAXS, HARNESS_MAX_ACTIVE_SESSIONS). Paralelismo demais multiplica negacao do classificador; escalone as execucoes."
  else
    ok "sessoes ativas na maquina: ~$ACTIVE (limite recomendado: $MAXS)."
  fi

  # 8) 3.5.4: pasta de relatorios de review FORA do projeto conflita com a GUARDA 1 do guard-bash (nega escrita em /tmp):
  #    todo sherlock perde um turno e grava o relatorio onde a pai nao le (medido 14/09: sagittarius e dra-mariana-duarte
  #    ainda com HARNESS_CODEX_REPORTS='/tmp/<projeto>-codex-reviews' — default antigo; o mestre usa codex-reviews/ na raiz).
  CR="${HARNESS_CODEX_REPORTS:-codex-reviews}"
  case "$CR" in
    /*|[A-Za-z]:*) warn "HARNESS_CODEX_REPORTS='$CR' aponta para FORA do projeto — a GUARDA 1 nega a escrita e o sherlock cai para .harness-run/tmp. Troque para 'codex-reviews' (raiz do repo; adicione /codex-reviews/ ao .gitignore) no .claude/harness.env." ;;
    *) ok "HARNESS_CODEX_REPORTS='$CR' (dentro do projeto)." ;;
  esac
}

# ---------------------------------------------------------------------------
# Verificacao visual (3.0.3). Reusada por --autonomia (pre-flight da /prd-exec,
# Passo 0.2) e pela varredura completa (grupo 'visual').
#
# POR QUE EXISTE. Regra-base: PLATAFORMAS.md §7 — evidencia visual de agente e
# Playwright headless gravando ARQUIVO; o browser pane e sonda opcional de UMA
# tentativa. Projeto com front e SEM Playwright instalado nao tem como produzir
# evidencia — e isso precisa doer no PRE-FLIGHT, nao na Fase 2.9 com a PRD ja
# implementada (incidente site-allyson-bezerra-2026, 13/08/2026: pane morto +
# agentes insistindo nele = tempo queimado por agente e por ciclo).
#
# Nada aqui e FALTA: projeto sem front e N/A, e um WARN ja e o suficiente para o
# Passo 0.2 levar a pendencia a entrevista (o usuario decide instalar ou seguir).
# ---------------------------------------------------------------------------
check_visual() {
  head_ "Verificacao visual (evidencia de agente — PLATAFORMAS.md §7)"

  if [ ! -f "$PERFIL" ]; then
    na "sem Perfil — impossivel saber se o projeto tem front (porte o harness primeiro)."
    return 0
  fi

  # Campo do Perfil (secao Testes E2E): "Verificacao visual (agentes)".
  # Valor sem backticks (mesma convencao de perfil_clis): placeholder e o valor que
  # COMECA com '<' ou traz 🔧 — nao basta conter '<...>', porque um campo preenchido
  # de verdade cita comandos (ex.: `npx playwright screenshot <url> <arquivo>`) e
  # seria lido como pendencia (falso positivo real no site-allyson-bezerra-2026).
  V_LINE="$(grep -iE '^\|[[:space:]]*\*\*Verifica(c|ç)(a|ã)o visual' "$PERFIL" 2>/dev/null | head -1)"
  V_VAL="$(printf '%s' "$V_LINE" | awk -F'|' '{print $3}' | sed -e 's/`//g' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"

  # Declarou explicitamente que nao ha front? Nada a cobrar.
  if printf '%s' "$V_VAL" | grep -qiE '^.?(n/a|nao se aplica|não se aplica)'; then
    na "Perfil declara projeto sem front (Verificacao visual = N/A) — nada a verificar."
    return 0
  fi

  # Tem front? Sinal 1: "Pasta de screenshots" preenchida (nao placeholder/N/A).
  S_VAL="$(grep -iE '^\|[[:space:]]*\*\*Pasta de screenshots' "$PERFIL" 2>/dev/null | head -1 \
    | awk -F'|' '{print $3}' | sed -e 's/`//g' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  HAS_FRONT=0
  case "$S_VAL" in
    ''|'<'*|*'🔧'*) ;;                                    # placeholder do template
    *[Nn]/[Aa]*|*[Nn]enhum*) ;;                            # declarado ausente
    *) HAS_FRONT=1 ;;
  esac
  # Sinal 2 (fallback): existe arquivo de front no repo? Busca podada e com PISO.
  # O piso de 3 existe porque um .html solto (doc, template de e-mail, relatorio)
  # nao faz de um backend um projeto de front — e cobrar Playwright ali seria ruido
  # em todo projeto de API. Pastas do proprio harness/docs ficam de fora pelo mesmo
  # motivo (a mestre tem .html de documentacao e nao e um front).
  if [ "$HAS_FRONT" = "0" ]; then
    FRONT_N="$(find "$PROJECT_DIR" \
      \( -name node_modules -o -name vendor -o -name .git -o -name dist -o -name build \
         -o -name .claude -o -name .agents -o -name docs -o -name prds -o -name coverage \) -prune -o \
      -type f \( -name '*.vue' -o -name '*.jsx' -o -name '*.tsx' -o -name '*.blade.php' \
                 -o -name '*.html' -o -name '*.svelte' \) -print 2>/dev/null | head -5 | grep -c . || true)"
    case "$FRONT_N" in (*[!0-9]*|"") FRONT_N=0 ;; esac
    [ "$FRONT_N" -ge 3 ] 2>/dev/null && HAS_FRONT=1
  fi

  if [ "$HAS_FRONT" = "0" ]; then
    na "nenhum sinal de front (Perfil sem pasta de screenshots e sem arquivo de UI no repo)."
    return 0
  fi

  # --- Playwright instalado nesta maquina/repo? ------------------------------
  PW_VER=""
  if [ -f "$PROJECT_DIR/node_modules/@playwright/test/package.json" ]; then
    PW_VER="$(grep -m1 '"version"' "$PROJECT_DIR/node_modules/@playwright/test/package.json" 2>/dev/null \
      | sed 's/.*"version"[^"]*"\([^"]*\)".*/\1/')"
  fi
  if [ -n "$PW_VER" ]; then
    ok "Playwright instalado no repo (@playwright/test ${PW_VER})."
  elif grep -qE '"(@playwright/test|playwright)"' "$PROJECT_DIR/package.json" 2>/dev/null; then
    warn "Playwright esta no package.json mas NAO instalado (sem node_modules/@playwright/test) — agente de front nao produz evidencia. Rode: npm ci (ou npm i -D @playwright/test) && npx playwright install"
  else
    warn "projeto com front SEM Playwright — evidencia visual de agente e Playwright headless (PLATAFORMAS.md §7). Instale antes de executar PRD de front: npm i -D @playwright/test && npx playwright install"
  fi

  # Navegadores baixados? (cache por maquina — Windows e Unix)
  if [ -n "$PW_VER" ]; then
    PW_CACHE=""
    for c in "${PLAYWRIGHT_BROWSERS_PATH:-}" "${LOCALAPPDATA:-}/ms-playwright" \
             "${HOME:-}/AppData/Local/ms-playwright" "${HOME:-}/.cache/ms-playwright" \
             "${HOME:-}/Library/Caches/ms-playwright"; do
      [ -n "$c" ] && [ -d "$c" ] && { PW_CACHE="$c"; break; }
    done
    if [ -n "$PW_CACHE" ]; then
      PW_BROWSERS="$(ls "$PW_CACHE" 2>/dev/null | grep -cE '^(chromium|firefox|webkit)' || true)"
      case "$PW_BROWSERS" in (*[!0-9]*|"") PW_BROWSERS=0 ;; esac
      if [ "$PW_BROWSERS" -gt 0 ] 2>/dev/null; then
        ok "navegadores do Playwright baixados: $PW_BROWSERS em $PW_CACHE."
      else
        warn "cache do Playwright existe ($PW_CACHE) mas sem navegador — rode: npx playwright install"
      fi
    else
      warn "navegadores do Playwright nao encontrados nesta maquina — rode: npx playwright install (senao todo screenshot falha na hora da verificacao)."
    fi
  fi

  # --- Campo do Perfil preenchido? -------------------------------------------
  if [ -z "$V_LINE" ]; then
    warn "Perfil SEM o campo 'Verificacao visual (agentes)' (secao Testes E2E, 3.0.3) — sem ele o fato de maquina (ex.: 'o browser pane nao funciona aqui') nao chega ao proximo agente e cada um redescobre no timeout. Copie a linha do template (.claude/PERFIL-PROJETO.md da mestre) e preencha."
  else
    case "$V_VAL" in
      ''|'<'*|*'🔧'*)
        warn "campo 'Verificacao visual (agentes)' do Perfil ainda e placeholder — declare a versao do Playwright, os navegadores instalados e os fatos desta maquina (carimbe [AAAA-MM-DD · origem] + perfil-frescor.sh --carimbar)."
        ;;
      *)
        ok "Perfil declara o estado da verificacao visual (agentes)."
        ;;
    esac
  fi
}

# ---------------------------------------------------------------------------
# Presenca / Caronte (3.0.1). Reusada pelo run padrao (SO checks locais, zero
# rede) e pelo modo --presence (que acrescenta um ping REAL de ponta a ponta).
# Motivo: o presence.sh e silencioso por design — sem isto, "dev sumido do
# painel" era indiagnosticavel (hook nao rodou? curl bloqueado? identidade?).
# ---------------------------------------------------------------------------
check_presence() {
  P_LIVE="${1:-}"

  if [ "${HARNESS_SKIP_PRESENCE:-0}" = "1" ]; then
    warn "presenca DESLIGADA por HARNESS_SKIP_PRESENCE=1 (bypass de emergencia — lembre de reverter)."
    return
  fi
  P_URL="${HARNESS_PRESENCE_URL-https://caronte.app.br/api/v1/presenca/ping}"
  if [ -z "$P_URL" ]; then
    na "presenca DESLIGADA neste repo (HARNESS_PRESENCE_URL='' — opt-out explicito)."
    return
  fi
  ok "modulo presenca LIGADO -> $P_URL"

  if [ -f "$SCRIPT_DIR/hooks/presence.sh" ]; then
    ok "hooks/presence.sh presente."
  else
    fail "hooks/presence.sh AUSENTE — harness < 2.11.0? Rode o /deus (ou harness-sync.sh --apply)."
    return
  fi

  if have curl; then
    ok "curl disponivel no PATH."
  else
    fail "curl NAO encontrado no PATH — nenhum ping sai desta maquina."
    return
  fi

  # Wiring: o sync NAO mexe no settings.json (decisao local) — projeto portado
  # pode ter o presence.sh no disco sem NENHUM gatilho ligado.
  SJ="$SCRIPT_DIR/settings.json"
  if [ -f "$SJ" ]; then
    # 3.4.8: o wiring pode apontar para o port Node (presence.mjs) — conta os dois.
    W="$(grep -oE 'presence\.(sh|mjs)' "$SJ" 2>/dev/null | wc -l | tr -d '[:space:]')"; case "$W" in (*[!0-9]*|"") W=0 ;; esac
    if [ "$W" -ge 4 ]; then
      if grep -q 'presence\.mjs' "$SJ" 2>/dev/null; then
        ok "wiring completo no settings.json ($W entradas — port Node 3.4.8)."
      else
        ok "wiring completo no settings.json ($W entradas presence.sh). Dica 3.4.8: troque para presence.mjs (hook ~10x mais leve no Windows — ONBOARDING 3.4.8)."
      fi
    elif [ "$W" -ge 1 ]; then
      warn "wiring INCOMPLETO no settings.json ($W entrada(s); esperado 4: SessionStart, UserPromptSubmit, PostToolUse, SessionEnd) — ver ONBOARDING 2.11.0/2.16.0."
    else
      fail "presence existe mas NAO esta ligado no settings.json — nenhum evento dispara ping (ONBOARDING 2.11.0)."
    fi
  else
    fail "settings.json ausente em .claude/ — nenhum hook (de nenhum modulo) esta ligado."
  fi

  # Prova local: o hook 3.0.1+ loga cada tentativa de envio.
  P_LOG="$SCRIPT_DIR/.harness-run/presence.jsonl"
  if [ -f "$P_LOG" ]; then
    P_ULT="$(tail -n 1 "$P_LOG" 2>/dev/null)"
    case "$P_ULT" in
      *'"ok":1'*) ok "ultimo envio registrado: SUCESSO — $P_ULT" ;;
      *'"ok":0'*) warn "ultimo envio registrado FALHOU — $P_ULT (o ping foi para a fila offline; veja abaixo)." ;;
      *)          warn "log de presenca com linha ilegivel: $P_ULT" ;;
    esac
  else
    warn "sem log de envio (.claude/.harness-run/presence.jsonl) — nenhum ping tentado nesta maquina ainda (ou presence.sh < 3.0.1)."
  fi

  P_QDIR="$SCRIPT_DIR/.harness-run/presence-queue"
  P_QN=0
  if [ -d "$P_QDIR" ]; then
    for _pq in "$P_QDIR"/*.json; do [ -f "$_pq" ] && P_QN=$((P_QN+1)); done
  fi
  if [ "$P_QN" -gt 0 ]; then
    warn "$P_QN ping(s) represado(s) na fila offline — a rede falhou ha pouco; reenvio automatico no proximo evento com rede."
  else
    ok "fila offline vazia (nenhum ping represado)."
  fi

  # Ping REAL de ponta a ponta (so no --presence: gera 1 heartbeat de verdade,
  # visivel no painel como sessao 'doctor-selftest' — e a prova final).
  if [ "$P_LIVE" = "--live" ]; then
    P_GIT="$(git config user.email 2>/dev/null || true)"
    P_PAY="$(printf '{"v":1,"evento":"heartbeat","ts":%s,"projeto":"%s","branch":"","git_email":"%s","claude_email":"","os_user":"%s@%s","host":"claude","session":"doctor-selftest","harness":"%s"}' \
      "$(date +%s 2>/dev/null || echo 0)" \
      "$(basename "$PROJECT_DIR")" \
      "$P_GIT" \
      "$(whoami 2>/dev/null || echo '?')" \
      "$(hostname -s 2>/dev/null || hostname 2>/dev/null || echo '?')" \
      "${HARNESS_VERSION:-?}")"
    # curl com -w ja imprime '000' quando nao conecta; fallback so p/ saida vazia.
    if [ -n "${HARNESS_PRESENCE_TOKEN:-}" ]; then
      P_CODE="$(curl -s -o /dev/null -w '%{http_code}' -m 10 -X POST \
        -H 'Content-Type: application/json' -H "X-Presence-Token: ${HARNESS_PRESENCE_TOKEN}" \
        --data "$P_PAY" "$P_URL" 2>/dev/null)"
    else
      P_CODE="$(curl -s -o /dev/null -w '%{http_code}' -m 10 -X POST \
        -H 'Content-Type: application/json' \
        --data "$P_PAY" "$P_URL" 2>/dev/null)"
    fi
    P_CODE="${P_CODE:-000}"
    case "$P_CODE" in
      2*)  ok "PING DE TESTE aceito pelo Caronte (http $P_CODE) — transporte ok de ponta a ponta. Confira o painel: deve aparecer um heartbeat deste projeto agora." ;;
      000) fail "SEM CONEXAO com $P_URL — saida bloqueada nesta maquina (firewall/antivirus/proxy) ou DNS. Teste https://caronte.app.br no navegador para separar rede de bloqueio do curl." ;;
      401) fail "Caronte recusou o ping (401): token exigido e ausente/errado — confira HARNESS_PRESENCE_TOKEN no harness.env.local." ;;
      429) warn "Caronte respondeu 429 (rate limit) — em teste manual repetido e esperado; espere 1 min e rode de novo." ;;
      *)   warn "resposta inesperada do Caronte: http $P_CODE — endpoint mudou de contrato? Veja o error_log do servidor." ;;
    esac
  fi
}

# ---------------------------------------------------------------------------
# --gen-allowlist (1.9.0): bloco permissions.allow (host Claude).
# ---------------------------------------------------------------------------
# 3.4.23 (item 18): MINIMO CANONICO — o mesmo bloco `permissions.allow` do settings.json do
# mestre (que o sync leva por uniao). Independe do projeto: AskUserQuestion (a pergunta ja e a
# parada; a permissao para perguntar era uma 2a parada — decisao do Charles 08/09), helpers do
# harness (scopo fechado) e git read-only. Regra estreita = comando + subcomando fixos, `:*` no
# fim para argumentos (forma documentada de prefixo; `Bash(php:*)` sem espaco = LARGA, suspensa
# em auto mode). A suite tests/t-3423-permissao.mjs cobra que esta lista == settings.json do mestre.
canon_rules() {
  cat <<'EOF_CANON'
AskUserQuestion
Bash(bash .claude/harness-doctor.sh:*)
Bash(bash .claude/hooks/harness-metrics.sh:*)
Bash(bash .claude/hooks/harness-worktree.sh info)
Bash(bash .claude/hooks/harness-worktree.sh lock:*)
Bash(bash .claude/hooks/harness-worktree.sh unlock:*)
Bash(bash .claude/hooks/task-packet.sh:*)
Bash(bash .claude/hooks/review-packet.sh:*)
Bash(bash .claude/hooks/perfil-frescor.sh:*)
Bash(bash .claude/hooks/agent-stall.sh:*)
Bash(bash .claude/hooks/carga-maquina.sh:*)
Bash(node .claude/hooks/frentes.mjs:*)
Bash(node .claude/hooks/task-telemetry.mjs:*)
Bash(git status:*)
Bash(git diff:*)
Bash(git log:*)
Bash(git show:*)
Bash(git rev-parse:*)
Bash(git ls-files:*)
EOF_CANON
}

# Tabela do Perfil -> regra (uma por linha). `php artisan test *` -> Bash(php artisan test:*);
# sem `*` final -> regra exata. Comando com caminho no 1o token ganha tambem a forma quotada.
perfil_rule() { # $1 = comando da tabela
  local c="$1" first rest
  c="${c%" *"}"; c="${c%\*}"; c="${c%"${c##*[! ]}"}"
  if [ "$c" != "$1" ]; then printf 'Bash(%s:*)\n' "$c"; else printf 'Bash(%s)\n' "$c"; fi
  first="${c%% *}"; rest="${c#* }"
  if [ "$first" != "$c" ]; then
    case "$first" in */*) if [ "$c" != "$1" ]; then printf 'Bash("%s" %s:*)\n' "$first" "$rest"; else printf 'Bash("%s" %s)\n' "$first" "$rest"; fi ;; esac
  fi
}

# 3.4.23 (item 18d): comandos negados pelo classificador N+ vezes em D dias (denied.sh grava a
# chave normalizada em .harness-run/denied-recorrentes.jsonl). Saida: <n>|<chave>, mais frequente 1o.
denied_recorrentes() {
  local f="$SCRIPT_DIR/.harness-run/denied-recorrentes.jsonl" n="${HARNESS_DENIED_SUGERIR_N:-3}" d="${HARNESS_DENIED_SUGERIR_DIAS:-7}" now
  [ -f "$f" ] || return 0
  case "$n" in ''|*[!0-9]*) n=3 ;; esac; case "$d" in ''|*[!0-9]*) d=7 ;; esac
  now="$(date +%s 2>/dev/null || echo 0)"
  awk -v lim=$((now - d * 86400)) -v min="$n" '
    { ts = 0; key = "";
      if (match($0, /"ts":[0-9]+/)) ts = substr($0, RSTART + 5, RLENGTH - 5) + 0;
      if (match($0, /"key":"[^"]*"/)) key = substr($0, RSTART + 7, RLENGTH - 8);
      if (key == "" || ts < lim) next; c[key]++ }
    END { for (k in c) if (c[k] >= min) printf "%d|%s\n", c[k], k }' "$f" 2>/dev/null | sort -rn
}
# Chave -> regra estreita sugerida (mesmo formato do gerador). 1 token so = LARGA (nao sugere);
# cliente de banco/shell generico = nunca (wrapper versionado e o caminho).
sugestao_regra() { # $1 = chave normalizada
  case "$1" in
    *" "*) case "$1" in mysql*|psql*|"bash -c"*|"sh -c"*|"sudo "*) return 0 ;; esac; printf 'Bash(%s:*)\n' "$1" ;;
    *) return 0 ;;
  esac
}
# Todas as regras, uma por linha: canonico + db-test + Perfil [+ sugeridas com $1 = --sugeridas]
emit_rules_plain() {
  canon_rules
  [ -f "$SCRIPT_DIR/scripts/db-test.sh" ] && printf 'Bash(bash .claude/scripts/db-test.sh:*)\n'
  local c
  while IFS= read -r c; do [ -z "$c" ] && continue; perfil_rule "$c"; done <<EOF_CMDS
$(perfil_cmds_allowlist)
EOF_CMDS
  if [ "${1:-}" = "--sugeridas" ]; then
    while IFS='|' read -r rn rk; do [ -z "$rk" ] && continue; sugestao_regra "$rk"; done <<EOF_REC
$(denied_recorrentes)
EOF_REC
  fi
}
json_rules() { # stdin = regras (1/linha) -> itens JSON indentados, ultimo sem virgula
  awk 'NF { gsub(/\\/, "\\\\"); gsub(/"/, "\\\""); print "      \"" $0 "\"," }' | sed '$ s/,$//'
}

gen_allowlist() {
  printf '\n== Gerador de allowlist ESTREITA (Claude — regras que sobrevivem a outage do classificador) ==\n\n'
  PCMDS="$(perfil_cmds_allowlist)"
  if [ -z "$PCMDS" ]; then
    printf '[info] Perfil sem comandos na secao "Execucao autonoma — comandos conhecidos-seguros (allowlist)"\n'
    printf '       (ou secao ausente/so placeholders). Preencha a tabela do Perfil e rode de novo.\n'
    printf '       Enquanto isso, o bloco abaixo traz o minimo canonico do mestre (3.4.23) + helpers.\n\n'
  fi
  printf 'Bloco p/ REVISAR e colar em .claude/settings.json (ou aplicar por UNIAO: --apply-allowlist):\n\n'
  printf '  "permissions": {\n    "allow": [\n'
  emit_rules_plain | awk '!s[$0]++' | json_rules
  printf '    ]\n  }\n\n'
  # 3.4.23 (item 18d): secao "sugeridas pelas negacoes" — so o que o classificador negou 3+ vezes
  REC="$(denied_recorrentes)"
  if [ -n "$REC" ]; then
    printf 'Sugeridas pelas NEGACOES recorrentes do classificador (%s+ em %s dias — REVISE; --apply-allowlist --sugeridas aplica):\n\n' "${HARNESS_DENIED_SUGERIR_N:-3}" "${HARNESS_DENIED_SUGERIR_DIAS:-7}"
    printf '    [\n'
    SUG=""
    while IFS='|' read -r rn rk; do
      [ -z "$rk" ] && continue
      rr="$(sugestao_regra "$rk")"
      if [ -n "$rr" ]; then SUG="${SUG}${rr}
"; else printf '      (larga, nao sugerida: %sx "%s" — allowliste um subcomando ou um wrapper versionado)\n' "$rn" "$rk"; fi
    done <<EOF_REC
$REC
EOF_REC
    [ -n "$SUG" ] && printf '%s' "$SUG" | json_rules
    printf '    ]\n\n'
  fi
  cat <<'EOF_NOTES'
Notas IMPORTANTES antes de colar:
  1. REVISE cada regra — voce esta pre-autorizando execucao sem prompt. Regra
     estreita = comando + subcomando fixos, ':*' so no fim p/ argumentos.
  2. NUNCA adicione interpretador wildcarded (Bash(php:*), Bash(node:*),
     Bash(composer:*)): em auto mode essas regras LARGAS sao suspensas e caem
     no classificador mesmo assim — falsa sensacao de cobertura.
  3. Comando composto (a && b) exige que CADA subcomando case com uma regra.
  4. WORKSPACE TRUST: permissions.allow do settings.json DO PROJETO so vale
     depois de aceitar o dialogo de confianca do workspace (uma vez, interativo).
  5. mysql/psql NAO entram direto: crie um wrapper versionado (ex.
     .claude/scripts/db-test.sh apontando SO p/ o banco de TESTE) e allowliste o
     wrapper.
  6. O minimo canonico (AskUserQuestion + helpers + git read-only) ja chega pelo
     sync do mestre por UNIAO (3.4.23); este gerador soma a tabela do Perfil.
  7. Confira o resultado: bash .claude/harness-doctor.sh --autonomia
  8. Equivalente Codex (.rules): bash .claude/harness-doctor.sh --gen-rules
EOF_NOTES
}

# 3.4.23: aplica o bloco gerado no settings.json do PROJETO por UNIAO (o que existe fica; o que
# falta entra; nada sai). Backup antes em .harness-run/allowlist-backup/settings.json.<ts>.
# Saida: ALLOWLIST|atualizado|entraram=N|total=M · ALLOWLIST|ok|nada-a-fazer · ALLOWLIST|erro|<msg>
apply_allowlist() { # $1 = --sugeridas (opcional)
  local sj="$SCRIPT_DIR/settings.json" node="${HARNESS_RAG_NODE:-}" bk ts rules
  [ -z "$node" ] && have node && node="node"
  [ -n "$node" ] || { printf 'ALLOWLIST|erro|sem node — cole o bloco de --gen-allowlist a mao\n'; return 1; }
  rules="$(emit_rules_plain "${1:-}" | awk '!s[$0]++')"
  if [ -f "$sj" ]; then
    ts="$(date +%Y%m%d-%H%M%S 2>/dev/null || echo bk)"; bk="$SCRIPT_DIR/.harness-run/allowlist-backup"
    mkdir -p "$bk" 2>/dev/null && cp -p "$sj" "$bk/settings.json.$ts" 2>/dev/null && printf 'BACKUP|%s/settings.json.%s\n' "$bk" "$ts"
  fi
  printf '%s\n' "$rules" | "$node" -e '
const fs=require("fs"); const sj=process.argv[1];
const rules=fs.readFileSync(0,"utf8").split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
let raw="{}", ts={}; if(fs.existsSync(sj)){ raw=fs.readFileSync(sj,"utf8"); try{ ts=JSON.parse(raw); }catch(e){ console.log("ALLOWLIST|erro|settings.json invalido — corrija a mao"); process.exit(1); } }
ts.permissions=ts.permissions||{}; const cur=Array.isArray(ts.permissions.allow)?ts.permissions.allow:[];
const faltam=rules.filter(r=>!cur.includes(r));
if(!faltam.length){ console.log("ALLOWLIST|ok|nada-a-fazer|total="+cur.length); process.exit(0); }
ts.permissions.allow=cur.concat(faltam);
let out=JSON.stringify(ts,null,2)+"\n"; if(raw.includes("\r\n")) out=out.replace(/\n/g,"\r\n");
fs.writeFileSync(sj+".tmp-allow",out); fs.renameSync(sj+".tmp-allow",sj);
console.log("ALLOWLIST|atualizado|entraram="+faltam.length+"|total="+ts.permissions.allow.length);
for(const r of faltam) console.log("  + "+r);' "$sj"
}

# ---------------------------------------------------------------------------
# --gen-rules (2.0.0): prefix_rule() Starlark (Codex .rules) do MESMO Perfil.
# NAO copia permissions.allow — deriva da tabela canonica do Perfil.
# ---------------------------------------------------------------------------
gen_rules() {
  printf '\n== Gerador de .rules (Codex execpolicy — EXPERIMENTAL; confirme na doc atual) ==\n\n'
  PCMDS="$(perfil_cmds_allowlist)"
  if [ -z "$PCMDS" ]; then
    printf '[info] Perfil sem comandos na secao "Execucao autonoma" — preencha a tabela e rode de novo.\n'
    printf '       O bloco abaixo traz SO os helpers do harness.\n\n'
  fi
  printf 'Salve o resultado REVISADO em .codex/rules/harness.rules (so carrega com o projeto trusted):\n\n'
  emit_rule() { # $1 = comando estreito com tokens separados por espaco (sem o '*' final)
    local cmd="$1"
    cmd="${cmd% \*}"; cmd="${cmd%\*}"   # tira '*' final (prefix_rule ja e prefixo)
    local toks="" t
    for t in $cmd; do
      toks="${toks}\"$t\", "
    done
    toks="${toks%, }"
    printf 'prefix_rule(\n    pattern = [%s],\n    decision = "allow",\n    justification = "comando conhecido-seguro do Perfil (harness)",\n)\n\n' "$toks"
  }
  emit_rule "bash .claude/hooks/harness-metrics.sh"
  emit_rule "bash .claude/harness-doctor.sh"
  [ -f "$SCRIPT_DIR/scripts/db-test.sh" ] && emit_rule "bash .claude/scripts/db-test.sh"
  if [ -n "$PCMDS" ]; then
    while IFS= read -r c; do
      [ -z "$c" ] && continue
      emit_rule "$c"
    done <<EOF_CMDS
$PCMDS
EOF_CMDS
  fi
  cat <<'EOF_NOTES'
Notas:
  1. REVISE cada regra — 'allow' roda SEM prompt (e fora do sandbox, conforme a doc).
     Prefira 'prompt' quando tiver duvida; 'forbidden' bloqueia.
  2. prefix_rule casa por TOKENS (nao glob): o pattern acima autoriza o prefixo
     exato + quaisquer argumentos seguintes.
  3. Recurso EXPERIMENTAL do Codex — o formato pode mudar; confirme na doc.
  4. Rules do repo exigem projeto TRUSTED; `codex exec --ignore-rules` as ignora.
EOF_NOTES
}

printf 'Harness doctor — %s\n' "${HARNESS_VERSION:-versao nao definida em harness.env}"
printf 'Repo: %s\n' "$PROJECT_DIR"
printf 'Targets: %s\n' "$TARGETS_RAW"

if [ "${1:-}" = "--gen-allowlist" ]; then gen_allowlist; exit 0; fi
if [ "${1:-}" = "--apply-allowlist" ]; then apply_allowlist "${2:-}"; exit $?; fi
if [ "${1:-}" = "--gen-rules" ]; then gen_rules; exit 0; fi

# Modo focado: AUDITORIA DE PROMPTS (3.4.25 — melhoria 1). Varredura completa, todos os achados;
# --prompt-audit-baseline grava a regua do dia (o check da varredura so avisa quando subiu).
if [ "${1:-}" = "--prompt-audit" ] || [ "${1:-}" = "--prompt-audit-baseline" ]; then
  PA_NODE="${HARNESS_RAG_NODE:-}"; [ -z "$PA_NODE" ] && have node && PA_NODE="node"
  [ -n "$PA_NODE" ] || { printf 'AUDIT-RESUMO|sem-node\n'; exit 1; }
  head_ "Auditoria de prompts (hooks/prompt-audit.mjs)"
  if [ "${1:-}" = "--prompt-audit-baseline" ]; then
    (cd "$PROJECT_DIR" && "$PA_NODE" "$SCRIPT_DIR/hooks/prompt-audit.mjs" --baseline)
  else
    (cd "$PROJECT_DIR" && "$PA_NODE" "$SCRIPT_DIR/hooks/prompt-audit.mjs" "${2:-}")
    printf '\nRelatorio Markdown: bash .claude/harness-doctor.sh --prompt-audit --md   ·   aceitar o que fica: --prompt-audit-baseline\n'
  fi
  exit 0
fi

# Modo focado: presenca/Caronte de ponta a ponta (3.0.1) — checks locais + ping
# REAL de teste. E o comando a rodar na maquina de quem "nao aparece" no painel.
if [ "${1:-}" = "--presence" ] || [ "${1:-}" = "--presenca" ]; then
  head_ "Presenca (Caronte)"
  check_presence --live
  printf '\n== Resumo (presenca) ==\n'
  printf '  OK: %s   WARN: %s   FALTA: %s   N/A: %s\n' "$OK" "$WARN" "$FAIL" "$NA"
  if [ "$FAIL" -gt 0 ]; then
    printf '\nPing NAO esta saindo desta maquina. Corrija os [FALTA] acima.\n'
    exit 1
  fi
  if [ "$WARN" -gt 0 ]; then
    printf '\nPresenca funciona com ressalvas — leia os [WARN].\n'
    exit 3
  fi
  printf '\nPresenca OK de ponta a ponta.\n'
  exit 0
fi

# Modo focado: SO os checks de execucao autonoma (pre-flight da /prd-exec, Passo 0.2).
if [ "${1:-}" = "--autonomia" ]; then
  check_autonomia
  check_visual
  printf '\n== Resumo (autonomia) ==\n'
  printf '  OK: %s   WARN: %s   FALTA: %s\n' "$OK" "$WARN" "$FAIL"
  if [ $((WARN + FAIL)) -gt 0 ]; then
    printf '\nExecucao NAO-assistida pode pendurar em prompt de permissao sem aviso. Ajuste os itens acima (ou siga conscientemente).\n'
    exit 3
  fi
  printf '\nPronto para execucao nao-assistida.\n'
  exit 0
fi

# ===========================================================================
# GRUPO: nucleo (canonico — vale para qualquer plataforma)
# ===========================================================================
begin_group "nucleo" "Nucleo canonico (Perfil, skills, hooks, agentes, templates)"

if [ ! -f "$PERFIL" ]; then
  fail "PERFIL-PROJETO.md ausente em .claude/ — copie um de perfis/ e preencha."
else
  ok "PERFIL-PROJETO.md encontrado."
  PH="$(perfil_placeholders)"
  if [ -n "$PH" ]; then
    N="$(printf '%s\n' "$PH" | grep -c . )"
    warn "Perfil com $N linha(s) de TABELA com placeholder por preencher (🔧 ou <...>). Ex.:"
    printf '%s\n' "$PH" | head -5 | sed 's/^/         /'
  else
    ok "Sem placeholders reais no Perfil (linhas de tabela/🔧)."
  fi
  MODELS_BLOCK="$(awk '/^## Agentes do harness \(modelos\)/{f=1;next} /^## /{f=0} f' "$PERFIL" 2>/dev/null)"
  if [ -z "$MODELS_BLOCK" ]; then
    warn "Perfil sem a secao 'Agentes do harness (modelos)' — agentes caem no default sonnet; copie a secao do mestre p/ deixar a escolha explicita."
  else
    OPUS_LIST="$(printf '%s\n' "$MODELS_BLOCK" | grep -i 'opus' | grep -v '<' | grep -oE 'Modelo do [a-z-]+' | sed 's/Modelo do //' | tr '\n' ' ')"
    if [ -n "$OPUS_LIST" ]; then
      printf "  [info] agentes promovidos a OPUS no Perfil: %s— consumo de tokens maior (decisao consciente? ver .claude/ONBOARDING.md, A2).\n" "$OPUS_LIST"
    else
      ok "Agentes do harness em Sonnet (default Sonnet-first — economico)."
    fi
  fi
fi

PD="$(bash "$SCRIPT_DIR/hooks/perfil-doctor.sh" --resumo 2>/dev/null)"
case "$PD" in
  "RESUMO|faltas=0 vazios=0"*) ok "Perfil alinhado ao template (perfil-doctor)." ;;
  "RESUMO|sem-perfil"|"RESUMO|sem-node") : ;;
  *) warn "DERIVA DE PERFIL: $PD — rode: bash .claude/hooks/perfil-doctor.sh (completar pela tela, aba Perfil)." ;;
esac
[ -f "$SCRIPT_DIR/ONBOARDING.md" ] && ok "ONBOARDING.md presente (.claude/)." \
  || warn "ONBOARDING.md ausente em .claude/ — harness anterior a 1.2.0? Atualize via /deus."
[ -f "$SCRIPT_DIR/PLATAFORMAS.md" ] && ok "PLATAFORMAS.md presente (mapa multi-AI)." \
  || warn "PLATAFORMAS.md ausente — harness anterior a 2.0.0? Atualize via /deus."
[ -f "$ENVFILE" ] && ok "harness.env encontrado." \
  || warn "harness.env ausente — hooks usam defaults (lint fica DESLIGADO)."

for s in prd prd-exec dt dt-exec dt-sweep codex-review harness-config; do
  [ -f "$SCRIPT_DIR/skills/$s/SKILL.md" ] && ok "skill /$s" || fail "skill /$s ausente."
done
# Frontmatter das skills (2.0.0 — descoberta multi-AI exige name/description)
FM_MISS=""
for s in prd prd-exec dt dt-exec dt-sweep codex-review harness-config; do
  f="$SCRIPT_DIR/skills/$s/SKILL.md"
  [ -f "$f" ] || continue
  head -1 "$f" | grep -q '^---$' && grep -q '^name:' "$f" && grep -q '^description:' "$f" \
    || FM_MISS="$FM_MISS $s"
done
if [ -z "$FM_MISS" ]; then
  ok "skills com frontmatter name/description (descoberta multi-AI)."
else
  warn "skill(s) SEM frontmatter name/description:$FM_MISS — o Codex nao as descobre; atualize via /deus."
fi

for h in sync-memory.sh lint.sh codex-review.sh external-review.sh harness-metrics.sh notify.sh guard-bash.sh guard-bash.mjs presence.mjs denied.sh guard-folego.mjs task-telemetry.mjs _host-detect.sh perfil-frescor.sh harness-delegate.sh _delegate-common.sh task-packet.sh harness-duelo.sh harness-worktree.sh guard-agent.sh guard-stop.sh guard-write.sh guard-question.sh watchdog-baseline.sh perfil-doctor.sh prompt-audit.mjs perfil-poda.sh; do
  [ -f "$SCRIPT_DIR/hooks/$h" ] && ok "hook/helper $h" || fail "hook/helper $h ausente."
done
# --- Defaults do base (3.5.6 — DT-010) ------------------------------------------
if [ -f "$SCRIPT_DIR/hooks/_defaults.env" ]; then
  ok "hooks/_defaults.env presente (pool do duelo e modelos default viajam com o base)."
  if [ -f "$SCRIPT_DIR/hooks/harness-duelo.sh" ]; then
    PL_OUT="$(bash "$SCRIPT_DIR/hooks/harness-duelo.sh" --pool 2>/dev/null | grep '^POOL|' | head -1)"
    PL_T="$(printf '%s' "$PL_OUT" | cut -d'|' -f2)"; PL_S="$(printf '%s' "$PL_OUT" | cut -d'|' -f3)"; PL_ORI="$(printf '%s' "$PL_OUT" | cut -d'|' -f4)"
    case "$PL_ORI" in
      origem=defaults) ok "duelo: pool=$PL_T · suplentes=$PL_S (origem: hooks/_defaults.env)" ;;
      origem=*) warn "duelo: pool=$PL_T sobrescrita por '${PL_ORI#origem=}' — DT-010: a pool e decisao do harness (hooks/_defaults.env); remova HARNESS_DUELO_MODELS/SUPLENTES do harness.env(.local) e de ~/.harness.env.local, salvo experimento consciente (o placar por modelo perde a comparabilidade entre projetos)." ;;
      *) [ -n "$PL_OUT" ] && warn "duelo: pool nao resolvida ($PL_OUT)" ;;
    esac
  fi
else
  fail "hooks/_defaults.env ausente (3.5.6 — DT-010): a pool do duelo volta ao literal do script. Sincronize com o mestre (/deus)."
fi

# --- Auditoria de prompts (3.4.25 — melhoria 1) ------------------------------
# Mede os padroes datados de prompt em agents/skills/contratos/CLAUDE.md/PERFIL-RESUMO. Aqui so o
# RESUMO; WARN apenas quando alto+medio SUBIU em relacao a baseline gravada (o que ja se decidiu
# manter nao grita todo dia). Varredura completa: --prompt-audit · aceitar: --prompt-audit-baseline.
# O SessionStart (doctor-cached.sh) NAO roda isto — e do doctor completo e do rito por geracao.
if [ "${HARNESS_PROMPT_AUDIT:-on}" = "off" ]; then
  na "auditoria de prompts desligada (HARNESS_PROMPT_AUDIT=off)."
elif [ ! -f "$SCRIPT_DIR/hooks/prompt-audit.mjs" ]; then
  na "auditoria de prompts: hooks/prompt-audit.mjs ausente (3.4.25) — atualize via /deus."
else
  PA_NODE="${HARNESS_RAG_NODE:-}"; [ -z "$PA_NODE" ] && have node && PA_NODE="node"
  if [ -z "$PA_NODE" ]; then
    na "auditoria de prompts: sem node nesta maquina."
  else
    PA_OUT="$(cd "$PROJECT_DIR" && "$PA_NODE" "$SCRIPT_DIR/hooks/prompt-audit.mjs" --resumo 2>/dev/null)"
    PA_RES="$(printf '%s\n' "$PA_OUT" | grep '^AUDIT-RESUMO|' | head -1)"
    PA_BL="$(printf '%s\n' "$PA_OUT" | grep '^AUDIT-BASELINE|' | head -1)"
    case "$PA_BL" in
      *"|subiu")
        warn "auditoria de prompts SUBIU vs baseline (${PA_BL#AUDIT-BASELINE|}) — ${PA_RES#AUDIT-RESUMO|}. Veja: bash .claude/harness-doctor.sh --prompt-audit (achado a achado); decidiu manter? --prompt-audit-baseline." ;;
      *"|ausente"*)
        ok "auditoria de prompts: ${PA_RES#AUDIT-RESUMO|} (sem baseline — leia --prompt-audit e grave a regua: --prompt-audit-baseline)." ;;
      "")
        warn "auditoria de prompts nao respondeu (${PA_RES:-sem AUDIT-RESUMO}) — rode: node .claude/hooks/prompt-audit.mjs" ;;
      *)
        ok "auditoria de prompts: ${PA_RES#AUDIT-RESUMO|} (baseline ${PA_BL#AUDIT-BASELINE|})." ;;
    esac
  fi
fi

# --- Delegacao a CLI externo + economia (3.0.0) -----------------------------
# Mostra o ESTADO RESOLVIDO dos dials e a ORIGEM de cada um. Sao 3 camadas de
# configuracao (env > .local > Perfil > harness.env): sem isto, "por que esta PRD
# rodou no Codex?" vira investigacao. O doctor responde de graca.
if [ -f "$SCRIPT_DIR/hooks/harness-delegate.sh" ]; then
  DEL_ROTA="$(bash "$SCRIPT_DIR/hooks/harness-delegate.sh" --rota discovery-schema 2>/dev/null)"
  DEL_MODO="$(printf '%s' "$DEL_ROTA" | cut -d'|' -f6)"
  case "$DEL_MODO" in
    *"modo=off"*|'') ok "delegacao externa: DESLIGADA (tudo no agente nativo — comportamento pre-3.0.0)." ;;
    *)
      printf "  [info] delegacao externa ATIVA — %s\n" "$DEL_MODO"
      for _p in discovery-schema discovery-codigo impacto beholder michelangelo; do
        _r="$(bash "$SCRIPT_DIR/hooks/harness-delegate.sh" --rota "$_p" 2>/dev/null)"
        printf "         %-18s -> %-12s (fallback: %s)\n" \
          "$_p" "$(printf '%s' "$_r" | cut -d'|' -f3)" "$(printf '%s' "$_r" | cut -d'|' -f4)"
      done
      # Executor roteado mas indisponivel = toda PRD cairia em fallback silencioso.
      if printf '%s' "$DEL_ROTA" | grep -q 'codex-cli'; then
        if ! command -v codex >/dev/null 2>&1; then
          warn "modo de delegacao usa codex-cli, mas 'codex' NAO esta no PATH — todo papel externo cairia em fallback. Instale (npm i -g @openai/codex) ou volte o modo para 'off'."
        elif [ ! -f "${CODEX_HOME:-$HOME/.codex}/auth.json" ]; then
          warn "modo de delegacao usa codex-cli, mas nao ha login do Codex (~/.codex/auth.json). Rode: codex login"
        else
          ok "codex-cli disponivel e autenticado (delegacao viavel)."
        fi
      fi
      ;;
  esac
  VERB="${HARNESS_VERBOSITY:-conciso}"
  case "$VERB" in
    normal|conciso|minimo) printf "  [info] verbosidade: %s (o que a skill FALA; nunca silencia degradacao, 🔴 nem o relatorio final).\n" "$VERB" ;;
    *) warn "HARNESS_VERBOSITY='$VERB' invalido (use normal | conciso | minimo)." ;;
  esac
fi
[ -f "$SCRIPT_DIR/PLAYBOOK-TELEMETRIA.md" ] && ok "playbook: PLAYBOOK-TELEMETRIA.md" || warn "PLAYBOOK-TELEMETRIA.md ausente — harness anterior a 1.8.0? Atualize via /deus."
[ -f "$SCRIPT_DIR/hooks/harness-metrics.mjs" ] && ok "telemetria: harness-metrics.mjs" || warn "harness-metrics.mjs ausente — telemetria so com duracao."
[ -f "$SCRIPT_DIR/hooks/harness-dashboard.mjs" ] && ok "telemetria: harness-dashboard.mjs (dashboard do /harness-report)" || warn "harness-dashboard.mjs ausente — harness anterior a 3.1.0? /harness-report volta a agregar na mao. Atualize via /deus ou /prometeu."

# PERFIL-RESUMO (2.4.0; cobrado desde a 2.10.0) — sem ele, TODO subagente le o
# PERFIL-PROJETO.md inteiro em TODO ciclo. Medido em 2026-08: 24 de 25 projetos sem o
# resumo; no core do Taurus (Perfil de 111 KB, ~8,5 subagentes/execucao) isso custava
# ~940 KB de releitura de Perfil POR RUN — e contexto inflado e ruido para o gate fechar.
if [ -f "$SCRIPT_DIR/PERFIL-PROJETO.md" ]; then
  PERFIL_B="$(wc -c < "$SCRIPT_DIR/PERFIL-PROJETO.md" 2>/dev/null | tr -d '[:space:]')"
  if [ -f "$SCRIPT_DIR/PERFIL-RESUMO.md" ]; then
    # 2.15.0: a verdade e o CARIMBO (impressao digital do Perfil gravada no resumo),
    # nao o mtime — `git checkout` reescreve mtime em ordem arbitraria e fazia esta
    # checagem acusar defasagem falsa (ou pior, aprovar resumo defasado de verdade).
    if [ -f "$SCRIPT_DIR/hooks/perfil-frescor.sh" ]; then
      FRESCOR="$(bash "$SCRIPT_DIR/hooks/perfil-frescor.sh" 2>/dev/null)"
      case "$FRESCOR" in
        FRESCO*)      ok "PERFIL-RESUMO.md em dia com o Perfil (carimbo confere — subagentes leem o destilado)." ;;
        DEFASADO*)    warn "PERFIL-RESUMO.md DEFASADO — o Perfil mudou depois que o resumo foi gerado. Todo subagente esta lendo fato velho. Regere o resumo e rode: bash .claude/hooks/perfil-frescor.sh --carimbar" ;;
        SEM-CARIMBO*) warn "PERFIL-RESUMO.md sem carimbo de sincronia (resumo anterior a 2.15.0) — confira se bate com o Perfil e rode: bash .claude/hooks/perfil-frescor.sh --carimbar" ;;
        *)            warn "PERFIL-RESUMO.md presente, frescor nao verificavel ($FRESCOR)." ;;
      esac
    elif [ "$SCRIPT_DIR/PERFIL-PROJETO.md" -nt "$SCRIPT_DIR/PERFIL-RESUMO.md" ]; then
      warn "PERFIL-RESUMO.md mais VELHO que o PERFIL-PROJETO.md (checagem por mtime — imprecisa). Atualize o harness p/ ganhar o perfil-frescor.sh."
    else
      ok "PERFIL-RESUMO.md presente (checagem por mtime — atualize o harness p/ o carimbo)."
    fi
  elif [ "${PERFIL_B:-0}" -gt 20000 ] 2>/dev/null; then
    warn "PERFIL-RESUMO.md AUSENTE com Perfil de ${PERFIL_B} bytes — todo subagente rele o Perfil INTEIRO a cada ciclo. Gere o destilado (template: PERFIL-RESUMO.md da copia-mestre) ou peca ao /deus."
  else
    ok "PERFIL-RESUMO.md ausente, mas o Perfil e pequeno (${PERFIL_B:-?} B) — fallback barato."
  fi
  # Poda do Perfil (3.4.26) — INFORMATIVO. Perfil > 40 KB: roda o motor do P1 do /deus (read-only,
  # ~1 find + 1 grep) e imprime o PODA-RESUMO. 🟢 = morto com prova; a poda em si e decisao humana.
  if [ "${PERFIL_B:-0}" -gt 40000 ] 2>/dev/null && [ -f "$SCRIPT_DIR/hooks/perfil-poda.sh" ]; then
    PODA="$(bash "$SCRIPT_DIR/hooks/perfil-poda.sh" --resumo 2>/dev/null | grep '^PODA' | head -1)"
    case "$PODA" in
      PODA-RESUMO*verde=0*) ok "Perfil de ${PERFIL_B} B — poda: $PODA (nenhuma entrada provada morta)." ;;
      PODA-RESUMO*)         warn "Perfil de ${PERFIL_B} B — poda: $PODA — ha entrada(s) 🟢 com prova; rode: bash .claude/hooks/perfil-poda.sh --md e leve ao /deus (P2)." ;;
      PODA-OFF*)            ok "Perfil de ${PERFIL_B} B — poda desligada (HARNESS_PERFIL_PODA='off')." ;;
      *)                    warn "Perfil de ${PERFIL_B} B — perfil-poda.sh nao respondeu ($PODA)." ;;
    esac
  fi
fi

# Telemetria versionada no git (2.10.0) — historico e LOCAL por projeto. Versionado,
# ele viaja em merge de upstream (/propagar) e em bootstrap por copia de pasta:
# medido em 2026-08, 63,6% das linhas do /harness-report --all eram duplicata de
# linhagem (o historico do core Taurus replicado em 6 projetos). A copia-mestre e
# excecao consciente (vive no vault, que nao e base de fork/copia).
ROLE_FILE="$SCRIPT_DIR/harness-role"
if [ ! -f "$ROLE_FILE" ] || ! grep -q 'mestre' "$ROLE_FILE" 2>/dev/null; then
  if git -C "$SCRIPT_DIR/.." ls-files --error-unmatch prds/_metrics/harness-runs.jsonl >/dev/null 2>&1; then
    warn "telemetria VERSIONADA no git (prds/_metrics/harness-runs.jsonl) — contamina forks/copias e o /harness-report --all. Corrija: adicione 'prds/_metrics/harness-runs.jsonl' ao .gitignore + 'git rm --cached prds/_metrics/harness-runs.jsonl' (o historico local fica no disco)."
  else
    ok "telemetria fora do git (historico local por projeto)."
  fi
fi

# --- Telemetria por dev/maquina no git (3.5.0) -------------------------------
# Tres perguntas por serie (runs/ tasks/ incidentes/ delegations/ duelos/): (a) o que DEVE estar no git
# esta? (b) o que NAO deve (dashboards gerados, transcripts crus) esta? (c) o .gitignore do projeto
# engoliu alguma serie? Medido 11/09: Mariana com 11 dashboards + 118 transcripts crus (1,9 MB)
# versionados; Caronte ainda com o harness-runs.jsonl no git; tasks/ nunca commitado em 2 repos.
if [ ! -f "$ROLE_FILE" ] || ! grep -q 'mestre' "$ROLE_FILE" 2>/dev/null; then
  if git -C "$PROJECT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    MD="$PROJECT_DIR/prds/_metrics"
    NDASH="$(git -C "$PROJECT_DIR" ls-files -- 'prds/_metrics/harness-dashboard-*' 2>/dev/null | wc -l | tr -d ' ')"
    if [ "${NDASH:-0}" -gt 0 ]; then
      warn "$NDASH dashboard(s) gerado(s) VERSIONADO(S) em prds/_metrics/harness-dashboard-* — saida regeravel do /harness-report, so pesa no repo. Corrija: 'prds/_metrics/harness-dashboard-*' no .gitignore + git rm --cached prds/_metrics/harness-dashboard-*"
    fi
    NTR="$(git -C "$PROJECT_DIR" ls-files -- 'prds/_metrics/transcripts*' 2>/dev/null | wc -l | tr -d ' ')"
    if [ "${NTR:-0}" -gt 0 ]; then
      warn "$NTR transcript(s) CRU(S) de agente versionado(s) em prds/_metrics/transcripts* — podem carregar segredo/codigo e o painel nao os le. Mova para fora do repo: 'prds/_metrics/transcripts*/' no .gitignore + git rm -r --cached prds/_metrics/transcripts*"
    fi
    for sub in runs tasks incidentes delegations duelos; do
      [ -d "$MD/$sub" ] || continue
      NL="$(cat "$MD/$sub"/*.jsonl 2>/dev/null | wc -l | tr -d ' ')"; [ "${NL:-0}" -gt 0 ] || continue
      if git -C "$PROJECT_DIR" check-ignore -q "prds/_metrics/$sub/x.jsonl" 2>/dev/null; then
        warn "prds/_metrics/$sub/ esta IGNORADO pelo .gitignore — $NL linha(s) de telemetria nunca chegam ao mestre/equipe. Remova a regra: so harness-runs.jsonl, harness-dashboard-* e transcripts*/ devem ser ignorados."
      else
        NU="$(git -C "$PROJECT_DIR" ls-files --others --exclude-standard -- "prds/_metrics/$sub" 2>/dev/null | wc -l | tr -d ' ')"
        NM="$(git -C "$PROJECT_DIR" diff --name-only -- "prds/_metrics/$sub" 2>/dev/null | wc -l | tr -d ' ')"
        if [ "${NU:-0}" -gt 0 ] || [ "${NM:-0}" -gt 0 ]; then
          warn "prds/_metrics/$sub/: ${NU:-0} arquivo(s) nunca commitado(s) + ${NM:-0} com linhas novas — telemetria parada no disco. Inclua no proximo commit (o stop ja faz git add do arquivo desta maquina; nunca 'git add prds/_metrics/' inteiro)."
        else
          ok "prds/_metrics/$sub/: $NL linha(s), tudo no git."
        fi
      fi
    done
    for lf in harness-delegations.jsonl harness-duelos.jsonl; do
      if [ -s "$MD/$lf" ]; then
        case "$lf" in harness-duelos.jsonl) NSUB=duelos ;; *) NSUB=delegations ;; esac
        na "prds/_metrics/$lf: formato compartilhado (ate a 3.4.34). Desde a 3.5.0 as linhas novas vao para $NSUB/<dev>@<maquina>.jsonl; o painel/placar leem os dois. Nao apague (historico)."
      fi
    done
  fi
fi

# --- Numeracao por dev (3.5.0 — hooks/_seq.sh) --------------------------------
if [ -f "$SCRIPT_DIR/hooks/_seq.sh" ] && [ -f "$SCRIPT_DIR/hooks/harness-worktree.sh" ] && git -C "$PROJECT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  FX_OUT="$(bash "$SCRIPT_DIR/hooks/harness-worktree.sh" faixa 2>/dev/null || true)"
  FX_ID="$(printf '%s\n' "$FX_OUT" | grep '^FAIXA|identidade|' | cut -d'|' -f3)"
  FX_AV="$(printf '%s\n' "$FX_OUT" | grep '^FAIXA|aviso|' | head -1 | cut -d'|' -f3-)"
  if [ -z "$FX_ID" ] || [ "$FX_ID" = "sem-email-git" ]; then
    warn "numeracao por dev: git config user.email VAZIO neste checkout — reservar PRD/DT/LOTE cai na serie compartilhada (bloco 0) e pode colidir com outro dev. Configure: git config user.email <seu-email>"
  elif [ -n "$FX_AV" ]; then
    warn "numeracao por dev: '$FX_ID' NAO esta na tabela de faixas (HARNESS_SEQ_FAIXAS) — reservas caem no bloco 0 (serie compartilhada). Declare no .claude/harness.env: HARNESS_SEQ_FAIXAS_EXTRA='$FX_ID=<bloco livre>' (tabela: bash .claude/hooks/harness-worktree.sh faixa)"
  else
    FX_RES="$(printf '%s\n' "$FX_OUT" | grep -E '^FAIXA\|(PRD|DT|LOTE)\|' | awk -F'|' '{ if ($3=="serie-unica") printf "%s=serie-unica ", $2; else printf "%s=%s(%s) ", $2, $5, $6 }')"
    ok "numeracao por dev ($FX_ID): ${FX_RES:-n/d}"
  fi
  MIGM="${HARNESS_MIG_NUMERACAO:-seq}"
  if [ "$MIGM" = "timestamp" ]; then
    MIGD="${HARNESS_MIGRATIONS_DIR:-}"; case "$MIGD" in ""|/*|[A-Za-z]:*) : ;; *) MIGD="$PROJECT_DIR/$MIGD" ;; esac
    [ -n "$MIGD" ] || MIGD="$(find "$PROJECT_DIR" -type d -name migrations -not -path '*/node_modules/*' -not -path '*/vendor/*' -not -path '*/.claude/*' -not -path '*/.git/*' 2>/dev/null | head -1)"
    if [ -n "$MIGD" ] && [ -d "$MIGD" ]; then
      ANO="$(date +%Y)"
      NLEG="$(ls "$MIGD" 2>/dev/null | grep -oE '^[0-9]{3,5}' | awk -v a="$ANO" '($1+0) >= (a+0)' | wc -l | tr -d ' ')"
      [ "${NLEG:-0}" -gt 0 ] && warn "migrations em modo timestamp, mas $NLEG arquivo(s) legado(s) com prefixo numerico >= $ANO em $MIGD — ordenam DEPOIS dos timestamps e quebram banco zero. Renumere-os (unica excecao a regra) antes de ligar o modo."
      RUNNER="$(ls "$MIGD"/../migrate.php "$MIGD"/../migrate.js "$MIGD"/../migrate.sh 2>/dev/null | head -1)"
      if [ -n "$RUNNER" ] && grep -qF '[0-9][0-9][0-9][0-9]_' "$RUNNER" 2>/dev/null; then
        warn "migrations em modo timestamp, mas o runner ($(basename "$RUNNER")) globa 4 digitos fixos ([0-9][0-9][0-9][0-9]_) — migration YYYYMMDDHHMMSS_ NAO sera aplicada. Troque o glob por [0-9]*_ (aplicar por nome, em ordem) antes de criar a primeira."
      else
        ok "migrations por timestamp (HARNESS_MIG_NUMERACAO=timestamp): $(ls "$MIGD" 2>/dev/null | grep -cE '^[0-9]{14}_') ja no formato novo."
      fi
    fi
  else
    na "migrations em serie unica (HARNESS_MIG_NUMERACAO=seq): colide entre devs e renumera no merge — ver ONBOARDING 3.5.0 para 'timestamp'."
  fi
fi
[ -f "$SCRIPT_DIR/harness-config.html" ] && ok "tela de config: harness-config.html (/harness-config)" || warn "harness-config.html ausente — /harness-config nao abre a tela."
if [ -f "$SCRIPT_DIR/harness-config.html" ] && [ -n "${HARNESS_VERSION:-}" ]; then
  grep -q "$HARNESS_VERSION" "$SCRIPT_DIR/harness-config.html" 2>/dev/null \
    && ok "harness-config.html carimba a versao $HARNESS_VERSION." \
    || warn "harness-config.html NAO cita a versao $HARNESS_VERSION — carimbo defasado (checklist de release, item 4)."
fi

# --- Painel do ecossistema (2.7.0) -----------------------------------------
if [ -f "$SCRIPT_DIR/harness-ui.mjs" ]; then
  ok "bridge da tela: harness-ui.mjs (node .claude/harness-ui.mjs)"
  if command -v node >/dev/null 2>&1; then
    ok "node presente — a tela grava direto nos arquivos."
  else
    warn "node ausente no PATH — a tela abre em modo SOMENTE LEITURA (gera a config p/ o Claude aplicar). Instale o Node p/ o 'salvar direto'."
  fi
else
  warn "harness-ui.mjs ausente — /harness-config abre a tela sem bridge (somente leitura). Atualize via /deus."
fi

CONV_DIR="$SCRIPT_DIR/convencoes"
if [ -d "$CONV_DIR" ]; then
  CONV_N="$(find "$CONV_DIR" -maxdepth 1 -name '*.md' -not -name '_*' -not -name 'INDEX.md' 2>/dev/null | wc -l | tr -d '[:space:]')"
  ok "convencoes da casa: $CONV_N em .claude/convencoes/ (/convencao)"
  # A secao de adocao e LOCAL (fica no Perfil, preservada pelo sync).
  if [ -f "$PERFIL" ]; then
    # '.*' e nao '..': 'ções' tem 4 BYTES de acento e o grep aqui roda sem locale
    # UTF-8 (cada '.' casaria 1 byte) — falso negativo silencioso.
    if grep -qiE '^##[[:space:]]+Conven.*adotadas' "$PERFIL" 2>/dev/null; then
      ok "Perfil tem a secao 'Convencoes adotadas'."
    elif [ "$CONV_N" -gt 0 ]; then
      warn "Perfil SEM a secao 'Convencoes adotadas' — as $CONV_N convencoes constam como nao-adotadas. Registre pela tela (/harness-config, aba Convencoes) ou via /convencao."
    fi
  fi
else
  warn "pasta .claude/convencoes/ ausente — sem a biblioteca de convencoes da casa. Atualize via /deus."
fi

# --- Fila de trabalho (2.8.0) ----------------------------------------------
# O parse de DT/PRD vive no harness-ui.mjs (--dump-trabalho --linhas): UMA
# implementacao, consumida pela tela E por aqui. Sem node, o bloco e pulado.
if [ -f "$SCRIPT_DIR/harness-ui.mjs" ] && command -v node >/dev/null 2>&1; then
  TRAB="$(node "$SCRIPT_DIR/harness-ui.mjs" --dump-trabalho "$PROJECT_DIR" --linhas 2>/dev/null)"
  tv() { printf '%s\n' "$TRAB" | grep "^TRABALHO|$1|" | head -1 | cut -d'|' -f3-; }
  if [ -n "$TRAB" ]; then
    DT_DIR="$(tv dtDir)"; DT_EXISTE="$(tv dtExiste)"; DT_TOTAL="$(tv dtTotal)"
    DT_PEND="$(tv dtPendentes)"; DT_SEMST="$(tv dtSemStatus)"; DIVERG="$(tv divergencias)"
    PRD_TOTAL="$(tv prdTotal)"; PRD_ABERTAS="$(tv prdAbertas)"
    if [ "$DT_EXISTE" = "1" ]; then
      ok "fila: $DT_PEND DT(s) pendente(s) de $DT_TOTAL em $DT_DIR/ · $PRD_ABERTAS PRD(s) aberta(s) de $PRD_TOTAL."
    else
      warn "pasta de DT nao encontrada ('$DT_DIR' — do Perfil, secao Estrutura de diretorios). Corrija o Perfil ou crie a pasta; a aba Trabalho fica vazia."
    fi
    case "$DIVERG" in
      0|"") [ "$DT_EXISTE" = "1" ] && ok "status dos DTs coerente entre arquivo e INDEX.md." ;;
      *)    warn "$DIVERG DT(s) com status DIVERGENTE entre o arquivo e o INDEX.md — o indice mente sobre a fila. Reconcilie pela tela (aba Trabalho) ou rode /dt." ;;
    esac
    case "$DT_SEMST" in
      0|"") : ;;
      *)    warn "$DT_SEMST DT(s) sem a linha '- **Status:**' no cabecalho — ficam fora da contagem da fila. Ver prds/_templates/TEMPLATE-DT.md." ;;
    esac
  fi
fi

# Papel do repo: so a copia-mestre (o vault) declara 'mestre'.
if [ -f "$SCRIPT_DIR/harness-role" ]; then
  ROLE_V="$(tr -d '[:space:]' < "$SCRIPT_DIR/harness-role" 2>/dev/null | tr 'A-Z' 'a-z')"
  case "$ROLE_V" in
    mestre)  ok "papel: COPIA-MESTRE (convencoes gravaveis aqui)." ;;
    projeto) ok "papel: projeto (convencoes somente-leitura)." ;;
    *)       warn "harness-role com valor inesperado ('$ROLE_V') — tratado como 'projeto'. Use 'mestre' ou remova o arquivo." ;;
  esac
else
  ok "papel: projeto (sem .claude/harness-role — o normal fora do vault)."
fi

AGENTS_DIR="$SCRIPT_DIR/agents"
if [ ! -d "$AGENTS_DIR" ]; then
  warn "pasta .claude/agents/ ausente — os agentes especializados nao viajaram no port."
else
  ok "pasta .claude/agents/ presente."
  for a in beholder michelangelo tony-stark sherlock atlas hefesto peter-quill ariadne dedalo prometeu themis; do
    if [ -f "$AGENTS_DIR/$a.md" ]; then
      agent_visibility "$AGENTS_DIR/$a.md"
      case $? in
        0) ok "agent $a" ;;
        1) fail "agent $a INVISIVEL — CRLF + ': ' na description: o host o descarta em silencio ('Agent type not found') e as skills caem em general-purpose. Corrija: dos2unix .claude/agents/$a.md (o .gitattributes eol=lf da pasta previne o retorno via checkout)." ;;
        2) warn "agent $a com CRLF — carrega hoje, mas qualquer ': ' futuro na description o torna invisivel. Normalize: dos2unix .claude/agents/$a.md" ;;
      esac
    else
      warn "agent $a ausente (generico — recomendado p/ o fluxo de PRD/review)."
    fi
  done
  [ -f "$AGENTS_DIR/.gitattributes" ] && ok ".claude/agents/.gitattributes presente (eol=lf — impede o checkout de re-CRLFar os agentes)." \
    || warn ".claude/agents/.gitattributes ausente — com core.autocrlf=true, um checkout futuro regrava os agentes em CRLF e pode torna-los invisiveis. Atualize via /deus."
  # 3.4.25 (item 19): contratos mecanicos por papel — o packet injeta "## 0. Contrato do papel";
  # sem o arquivo o executor/revisor/gate roda sem a mecanica compartilhada (e o .md do agente ja nao a traz).
  if [ ! -d "$SCRIPT_DIR/contratos" ]; then
    fail "pasta .claude/contratos/ ausente — os packets (task/review/prd) saem SEM a secao 0 (contrato do papel) e os agentes 3.4.25 nao carregam mais a mecanica no .md. Atualize via /deus (harness-sync leva .claude/contratos)."
  else
    CTR_MISS=""
    for c in executor revisor gate escrivao scout; do
      [ -f "$SCRIPT_DIR/contratos/CONTRATO-$c.md" ] || CTR_MISS="$CTR_MISS CONTRATO-$c.md"
    done
    if [ -n "$CTR_MISS" ]; then
      fail "contrato(s) de papel ausente(s) em .claude/contratos/:$CTR_MISS — o packet desse papel sai sem a secao 0. Atualize via /deus."
    else
      ok "contratos de papel presentes em .claude/contratos/ (executor, revisor, gate, escrivao, scout)."
    fi
    [ -f "$SCRIPT_DIR/hooks/_contrato.sh" ] || warn "hooks/_contrato.sh ausente — os packets nao conseguem injetar a secao 0 (contrato do papel)."
  fi
  for a in datilografo zelador; do
    if [ -f "$AGENTS_DIR/$a.md" ]; then
      ok "agent $a (Beta)"
    else
      printf "  [info] agent %s ausente — opcional (corporativo Beta).\n" "$a"
    fi
  done
fi
end_group

# ===========================================================================
# GRUPO: claude (superficie do host Claude Code)
# ===========================================================================
begin_group "claude" "Superficie Claude Code"
if want_target claude; then
  SJ="$SCRIPT_DIR/settings.json"
  if [ -f "$SJ" ]; then
    ok "settings.json presente (wiring dos hooks do host Claude)."
  else
    warn "settings.json ausente — nenhum hook ativo no host Claude (wiring e decisao local; copie da mestre)."
  fi
  # Skill UI UX Pro Max (externa, obrigatoria no fluxo de UI do host Claude)
  if [ -d "$SCRIPT_DIR/skills/ui-ux-pro-max" ] || [ -d "${HOME:-}/.claude/skills/ui-ux-pro-max" ]; then
    ok "Skill UI UX Pro Max instalada."
  else
    warn "Skill UI UX Pro Max NAO encontrada. Instale: npm i -g uipro-cli && uipro init --ai claude"
  fi
  # python3 (pre-requisito da UI UX Pro Max)
  PYOK=0
  if have python3; then
    PYV="$(python3 --version 2>&1)"
    case "$PYV" in
      Python\ 3.*) ok "python3 funcional ($PYV)."; PYOK=1 ;;
    esac
  fi
  if [ "$PYOK" -ne 1 ] && have python; then
    PYV="$(python --version 2>&1)"
    case "$PYV" in
      Python\ 3.*) warn "python3 ausente, mas 'python' e 3.x ($PYV) — a skill UI UX Pro Max chama 'python3'; crie alias/symlink."; PYOK=1 ;;
    esac
  fi
  [ "$PYOK" -ne 1 ] && warn "python3 funcional ausente (pre-requisito da skill UI UX Pro Max)."
else
  na "target 'claude' nao declarado em HARNESS_TARGETS — superficie Claude nao cobrada."
fi
end_group

# ===========================================================================
# GRUPO: codex (superficie do host Codex)
# ===========================================================================
begin_group "codex" "Superficie Codex"
if want_target codex; then
  # binario + auth (agora com severidade de superficie de 1a classe)
  if have codex; then
    ok "codex no PATH ($(codex --version 2>/dev/null | head -1 || echo '?'))."
    if [ -f "${HOME:-}/.codex/auth.json" ]; then
      ok "Codex autenticado (~/.codex/auth.json)."
    else
      fail "Codex sem login (~/.codex/auth.json ausente) — rode: codex login"
    fi
  else
    fail "codex ausente no PATH — superficie codex declarada mas o CLI nao esta na maquina. Instale: npm i -g @openai/codex (no macOS o XProtect pode APAGAR o binario nativo — falso positivo conhecido; reinstalar resolve e preserva o login)."
  fi

  # AGENTS.md (guardado)
  if [ -f "$PROJECT_DIR/AGENTS.md" ]; then
    if grep -q 'harness:managed' "$PROJECT_DIR/AGENTS.md" 2>/dev/null; then
      ok "AGENTS.md presente (gerenciado pelo harness)."
    else
      warn "AGENTS.md presente SEM marcador harness:managed — conteudo proprio do projeto; o sync preserva (CONFLITO). Garanta que ele aponta o Perfil como fonte de verdade."
    fi
  else
    fail "AGENTS.md ausente na raiz — o Codex nao recebe as instrucoes do repo. Instale via harness-sync --target codex."
  fi

  # stubs de skills
  STUB_MISS=""
  for s in prd prd-exec dt dt-exec codex-review harness-config; do
    [ -f "$PROJECT_DIR/.agents/skills/$s/SKILL.md" ] || STUB_MISS="$STUB_MISS $s"
  done
  if [ -z "$STUB_MISS" ]; then
    ok "stubs de skills presentes em .agents/skills/ (6)."
  else
    fail "stub(s) de skill ausente(s) em .agents/skills/:$STUB_MISS — o Codex nao descobre; rode gen-adapters.sh (ou sync --target codex)."
  fi
  # drift stub vs canonico
  if [ -f "$SCRIPT_DIR/scripts/gen-adapters.sh" ]; then
    if bash "$SCRIPT_DIR/scripts/gen-adapters.sh" --check >/dev/null 2>&1; then
      ok "adapters em dia com o canonico (gen-adapters --check)."
    else
      warn "DRIFT entre canonico e adapters gerados — rode: bash .claude/scripts/gen-adapters.sh"
    fi
  fi

  # agentes TOML
  TOML_MISS=""
  for a in beholder michelangelo tony-stark sherlock atlas hefesto peter-quill ariadne dedalo prometeu themis; do
    [ -f "$PROJECT_DIR/.codex/agents/$a.toml" ] || TOML_MISS="$TOML_MISS $a"
  done
  if [ -z "$TOML_MISS" ]; then
    ok "10 agentes Codex presentes em .codex/agents/."
  else
    fail "agente(s) Codex ausente(s) em .codex/agents/:$TOML_MISS — papel invisivel no Codex."
  fi

  # hooks.json (guardado) + eventos validos + sem async
  HJ="$PROJECT_DIR/.codex/hooks.json"
  if [ -f "$HJ" ]; then
    if grep -q 'harness:managed' "$HJ" 2>/dev/null; then
      ok ".codex/hooks.json presente (gerenciado)."
    else
      warn ".codex/hooks.json presente sem marcador harness:managed — o sync preserva; confira o wiring manualmente."
    fi
    BAD_EV=""
    for ev in SessionEnd Notification PermissionDenied PostToolUseFailure; do
      grep -q "\"$ev\"" "$HJ" 2>/dev/null && BAD_EV="$BAD_EV $ev"
    done
    if [ -n "$BAD_EV" ]; then
      fail ".codex/hooks.json usa evento(s) INEXISTENTES no Codex:$BAD_EV — hooks nunca disparam; use os 10 eventos oficiais (PLATAFORMAS.md §4)."
    else
      ok ".codex/hooks.json sem eventos incompativeis."
    fi
    if grep -q '"async"' "$HJ" 2>/dev/null; then
      warn ".codex/hooks.json declara 'async' — o Codex NAO suporta hooks assincronos (opcao ignorada; hook roda sincrono)."
    else
      ok ".codex/hooks.json sem 'async' (hooks Codex sao sincronos)."
    fi
  else
    fail ".codex/hooks.json ausente — nenhum hook do harness no host Codex. Instale via sync --target codex."
  fi

  # trust do projeto (por maquina). No Git Bash/Windows o config.toml guarda o
  # caminho NATIVO (C:\...) enquanto PROJECT_DIR esta em forma POSIX (/c/...):
  # gera as formas candidatas (POSIX + nativa via cygpath, com \ e \\) e testa cada.
  CODEX_CFG="${CODEX_HOME:-${HOME:-}/.codex}/config.toml"
  if [ -f "$CODEX_CFG" ]; then
    TRUSTED=0
    CANDS="$PROJECT_DIR"
    if command -v cygpath >/dev/null 2>&1; then
      NATIVE="$(cygpath -w "$PROJECT_DIR" 2>/dev/null || true)"
      if [ -n "$NATIVE" ]; then
        CANDS="$CANDS
$NATIVE
$(printf '%s' "$NATIVE" | sed 's/\\/\\\\/g')"
      fi
    fi
    while IFS= read -r cand; do
      [ -z "$cand" ] && continue
      if grep -Fq "\"$cand\"" "$CODEX_CFG" 2>/dev/null && \
         awk -v p="\"$cand\"" 'index($0,"[projects.")>0 && index($0,p)>0 {f=1} f && /trust_level/ {print; exit}' "$CODEX_CFG" 2>/dev/null | grep -q 'trusted'; then
        TRUSTED=1; break
      fi
    done <<EOF_CANDS
$CANDS
EOF_CANDS
    if [ "$TRUSTED" = "1" ]; then
      ok "projeto TRUSTED no Codex desta maquina (~/.codex/config.toml)."
    else
      warn "projeto NAO consta como trusted no ~/.codex/config.toml — o Codex ignora .codex/ do repo (config/hooks/rules/agents). Abra o Codex no repo e confie o workspace; depois aprove os hooks via /hooks (trust por hash — TODA atualizacao de hook re-pende)."
    fi
  else
    warn "~/.codex/config.toml ausente — Codex nunca aberto nesta maquina? O .codex/ do repo so carrega com o projeto trusted."
  fi
  [ -d "$PROJECT_DIR/.codex/rules" ] && printf "  [info] .codex/rules/ presente — gere/revise com: bash .claude/harness-doctor.sh --gen-rules (experimental).\n"
else
  na "target 'codex' nao declarado em HARNESS_TARGETS — superficie Codex nao cobrada (declare em harness.env p/ instalar)."
fi
end_group

# ===========================================================================
# GRUPO: rag (modulo opcional)
# ===========================================================================
begin_group "rag" "RAG (captura de conhecimento) — modulo OPCIONAL"
RAG_SCRIPTS_DIR="$SCRIPT_DIR/scripts"
RAG_HOOKS_DIR="$SCRIPT_DIR/hooks"
RAG_DB_PATH="${HARNESS_RAG_DB:-$SCRIPT_DIR/rag/rag.db}"

if [ "${HARNESS_RAG_ENABLED:-0}" = "1" ]; then
  ok "HARNESS_RAG_ENABLED='1' (RAG ATIVO neste repo)."
else
  printf "  [info] HARNESS_RAG_ENABLED='%s' — RAG dormente (normal no template; ligue por projeto).\n" "${HARNESS_RAG_ENABLED:-0}"
fi

if have node; then
  ok "node no PATH ($(node --version 2>&1))."
else
  warn "node ausente no PATH — necessario p/ embed/search/reindex (hooks tambem auto-detectam nvm/Homebrew)."
fi

if [ "${HARNESS_RAG_ENABLED:-0}" = "1" ]; then
  rag_dep_miss() { fail "$1 — RAG LIGADO, mas o modulo fica INERTE ate rodar 'npm install' na raiz."; }
else
  rag_dep_miss() { warn "$1 — normal no template dormente; rode 'npm install' ao ativar o RAG."; }
fi
if [ -f "$PROJECT_DIR/node_modules/tsx/dist/cli.mjs" ] || [ -x "$PROJECT_DIR/node_modules/.bin/tsx" ]; then
  ok "tsx instalado (node_modules)."
else
  rag_dep_miss "tsx NAO instalado (node_modules)"
fi
RAG_DEPS_MISS=""
for dep in better-sqlite3 sqlite-vec @huggingface/transformers; do
  [ -d "$PROJECT_DIR/node_modules/$dep" ] || RAG_DEPS_MISS="$RAG_DEPS_MISS $dep"
done
if [ -z "$RAG_DEPS_MISS" ]; then
  ok "deps npm do RAG presentes (better-sqlite3, sqlite-vec, @huggingface/transformers)."
else
  rag_dep_miss "deps npm ausentes:$RAG_DEPS_MISS"
fi

RAG_TS_MISS=""
for s in paths db embedder chunk indexer embed search reindex summarize; do
  [ -f "$RAG_SCRIPTS_DIR/$s.ts" ] || RAG_TS_MISS="$RAG_TS_MISS $s.ts"
done
[ -z "$RAG_TS_MISS" ] && ok "9 scripts .ts presentes em .claude/scripts/." || fail "scripts .ts do RAG ausentes:$RAG_TS_MISS"

RAG_HOOK_MISS=""
for h in _rag-common.sh rag-ensure-index.sh rag-inject.sh rag-capture-session.sh rag-capture-agent.sh; do
  [ -f "$RAG_HOOKS_DIR/$h" ] || RAG_HOOK_MISS="$RAG_HOOK_MISS $h"
done
[ -z "$RAG_HOOK_MISS" ] && ok "hooks do RAG presentes (_rag-common + 4 rag-*.sh)." || fail "hooks do RAG ausentes:$RAG_HOOK_MISS"

if [ -f "$RAG_SCRIPTS_DIR/summarize.ts" ] || [ -f "$RAG_SCRIPTS_DIR/summarize.php" ]; then
  SUMM=""
  [ -f "$RAG_SCRIPTS_DIR/summarize.ts" ]  && SUMM="$SUMM ts"
  [ -f "$RAG_SCRIPTS_DIR/summarize.php" ] && SUMM="$SUMM php"
  ok "summarizer disponivel:$SUMM (provider: ${HARNESS_RAG_LLM_PROVIDER:-claude-cli} — claude-cli|codex-cli|anthropic|mock|disabled)."
else
  fail "nenhum summarizer (summarize.ts OU summarize.php) — a captura nao funciona."
fi
case "${HARNESS_RAG_LLM_PROVIDER:-claude-cli}" in
  claude-cli) have claude || { [ "${HARNESS_RAG_ENABLED:-0}" = "1" ] && warn "provider claude-cli mas 'claude' fora do PATH — resumo vai falhar (log 'FALHA no resumo')."; } ;;
  codex-cli)  have codex  || { [ "${HARNESS_RAG_ENABLED:-0}" = "1" ] && warn "provider codex-cli mas 'codex' fora do PATH — resumo vai falhar (XProtect no macOS? reinstale)."; } ;;
  anthropic)  [ -n "${ANTHROPIC_API_KEY:-}" ] || { [ "${HARNESS_RAG_ENABLED:-0}" = "1" ] && warn "provider anthropic sem ANTHROPIC_API_KEY no ambiente."; } ;;
esac

if [ -f "$RAG_DB_PATH" ]; then
  ok "rag.db presente ($RAG_DB_PATH)."
else
  printf "  [info] rag.db ausente — normal no template; gere com: npm run rag:reindex.\n"
fi
end_group

# ===========================================================================
# GRUPO: seguranca (autonomia + integracoes irreversiveis)
# ===========================================================================
begin_group "seguranca" "Seguranca e autonomia"
check_autonomia

# Integracao irreversivel sem safe-mode verificavel (2.0.0)
if [ -f "$PERFIL" ]; then
  INTEG_BLOCK="$(awk '/^## Integracoes com efeitos colaterais|^## Integrações com efeitos colaterais/{f=1;next} /^## /{f=0} f' "$PERFIL" 2>/dev/null)"
  if [ -n "$INTEG_BLOCK" ] && ! printf '%s' "$INTEG_BLOCK" | grep -qiE '^[[:space:]]*Nenhuma'; then
    # So integracao REAL (titulo sem placeholder <...>) — template de exemplo nao conta.
    HAS_INTEG="$(printf '%s\n' "$INTEG_BLOCK" | grep -E '^### Integra' | grep -cv '<' || true)"
    if [ "${HAS_INTEG:-0}" -gt 0 ] 2>/dev/null; then
      SAFE_BLOCK="$(awk '/^## Safe Mode/{f=1;next} /^## /{f=0} f' "$PERFIL" 2>/dev/null)"
      SAFE_PENDING="$(printf '%s\n' "$SAFE_BLOCK" | grep -cE '^\|.*<[^<>=";]+>|🔧' || true)"
      if [ -z "$SAFE_BLOCK" ] || [ "${SAFE_PENDING:-0}" -gt 0 ] 2>/dev/null; then
        warn "Perfil declara $HAS_INTEG integracao(oes) com efeito colateral mas o Safe Mode esta ausente/com placeholders — a Fase 0 da /prd-exec nao tem como VERIFICAR o safe-mode antes de executar. Preencha a secao 'Safe Mode' do Perfil."
      else
        ok "integracoes com efeito colateral tem Safe Mode verificavel no Perfil."
      fi
    fi
  else
    printf "  [info] Perfil sem integracoes com efeito colateral (ou 'Nenhuma') — Fase 0 do /prd-exec e pulada.\n"
  fi
fi
end_group

# ===========================================================================
# GRUPO: visual (evidencia de agente — PLATAFORMAS.md §7, 3.0.3)
# ===========================================================================
begin_group "visual" "Verificacao visual (Playwright headless)"
check_visual
# 3.5.7 (E7): @playwright/test declarado no package.json e nao instalado — medido 16/09 (140-b/144): a main nao tinha
# node_modules, as specs morriam com "Cannot find module" e cada executor "instalava o playwright no pre-flight".
if [ -f "$PROJECT_DIR/package.json" ] && grep -q '"@playwright/test"' "$PROJECT_DIR/package.json" 2>/dev/null; then
  if [ -d "$PROJECT_DIR/node_modules/@playwright/test" ]; then ok "@playwright/test instalado (node_modules presente)."
  else warn "@playwright/test declarado no package.json e AUSENTE em node_modules — rode: npm i --no-save (o harness-worktree.sh novo faz sozinho desde a 3.5.7; sem isso toda spec falha com 'Cannot find module')."; fi
fi
end_group

# ===========================================================================
# GRUPO: propagacao (versao/targets/carimbos)
# ===========================================================================
begin_group "propagacao" "Propagacao e versao"
if [ -n "${HARNESS_VERSION:-}" ]; then
  ok "HARNESS_VERSION='$HARNESS_VERSION' (harness.env)."
else
  warn "HARNESS_VERSION ausente no harness.env — o /deus nao consegue medir defasagem deste repo."
fi
if grep -q '^HARNESS_TARGETS=' "$ENVFILE" 2>/dev/null; then
  ok "HARNESS_TARGETS declarado ($TARGETS_RAW)."
else
  printf "  [info] HARNESS_TARGETS ausente — sync/doctor assumem 'claude' (retrocompat). Declare no harness.env p/ tornar a decisao explicita.\n"
fi
[ -f "$SCRIPT_DIR/harness-sync.sh" ] && ok "harness-sync.sh presente (multi-target)." || warn "harness-sync.sh ausente — repo nao se compara com a mestre localmente."
[ -f "$SCRIPT_DIR/scripts/gen-adapters.sh" ] && ok "gen-adapters.sh presente (regenera adapters)." || { want_target codex && warn "gen-adapters.sh ausente — sem regeneracao local dos stubs Codex."; }
end_group

# ===========================================================================
# GRUPO: portabilidade (SO / binarios / divergencias)
# ===========================================================================
begin_group "portabilidade" "Portabilidade Windows/macOS e binarios"
ok "bash ${BASH_VERSION:-?}"
if have git && git -C "$PROJECT_DIR" rev-parse --git-dir >/dev/null 2>&1; then
  ok "git: repositorio detectado."
else
  warn "git ausente ou nao e um repo — review externo e sync ficam sem rede de seguranca."
fi
if have jq; then
  ok "jq no PATH (parsing robusto nos hooks)."
else
  warn "jq ausente — hooks usam fallback grep/sed (ok, mas jq e recomendado)."
fi

OS_NAME="$(uname -s 2>/dev/null || echo ?)"
# Lint: binario existe? E o caminho e do SO certo?
if [ -n "${HARNESS_LINT_CMD:-}" ] && [ -n "${HARNESS_LINT_EXT:-}" ]; then
  ok "Lint configurado (ext: ${HARNESS_LINT_EXT})."
  LINT_BIN="$(printf '%s' "$HARNESS_LINT_CMD" | awk '{print $1}')"
  case "$LINT_BIN" in
    [A-Za-z]:*)
      if [ "$OS_NAME" = "Darwin" ] || [ "$OS_NAME" = "Linux" ]; then
        warn "HARNESS_LINT_CMD aponta caminho WINDOWS ($LINT_BIN) rodando em $OS_NAME — comando do outro SO; ajuste no harness.env(.local) desta maquina."
      fi
      ;;
    /Applications/*|/opt/*|/usr/local/*)
      case "$OS_NAME" in
        MINGW*|MSYS*|CYGWIN*) warn "HARNESS_LINT_CMD aponta caminho macOS/Unix ($LINT_BIN) rodando em Windows — comando do outro SO." ;;
      esac
      ;;
  esac
  case "$LINT_BIN" in
    */*)
      if [ -f "$LINT_BIN" ] || [ -x "$LINT_BIN" ]; then
        ok "Binario do lint existe: $LINT_BIN"
      else
        warn "Binario do lint NAO encontrado: $LINT_BIN (ajuste HARNESS_LINT_CMD)."
      fi
      ;;
    *)
      if have "$LINT_BIN"; then
        ok "Binario do lint no PATH: $LINT_BIN"
      else
        warn "Binario do lint NAO no PATH: $LINT_BIN."
      fi
      ;;
  esac
else
  warn "Lint DESLIGADO (defina HARNESS_LINT_CMD + HARNESS_LINT_EXT em harness.env)."
fi

# Divergencia de versao de interpretador: Perfil vs lint (2.0.0).
# Ex. real: Perfil declara php7.4.33 e a allowlist/lint ainda aponta php7.3.33.
if [ -f "$PERFIL" ] && [ -n "${HARNESS_LINT_CMD:-}" ]; then
  PERFIL_VERS="$(grep -E '^\|[[:space:]]*\*\*Interpretador' "$PERFIL" 2>/dev/null \
    | grep -oE 'php[-/]?[0-9]+\.[0-9]+(\.[0-9]+)?' | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | sort -u)"
  LINT_VER="$(printf '%s' "$HARNESS_LINT_CMD" | grep -oE 'php[-/]?[0-9]+\.[0-9]+(\.[0-9]+)?' | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1)"
  if [ -n "$PERFIL_VERS" ] && [ -n "$LINT_VER" ]; then
    if printf '%s\n' "$PERFIL_VERS" | grep -qxF "$LINT_VER"; then
      ok "versao do interpretador do lint ($LINT_VER) confere com o Perfil."
    else
      warn "DIVERGENCIA de interpretador: Perfil declara PHP $(printf '%s' "$PERFIL_VERS" | tr '\n' ' ' | sed 's/ $//'), mas o lint (HARNESS_LINT_CMD) aponta $LINT_VER — alinhe Perfil, harness.env e allowlist."
    fi
  fi
fi

# Binarios do Perfil existem nesta maquina? (existir != estar autorizado)
if [ -f "$PERFIL" ]; then
  CLIS="$(perfil_clis)"
  if [ -n "$CLIS" ]; then
    MISS_BIN=""; OTHER_OS=0
    while IFS= read -r bin; do
      [ -z "$bin" ] && continue
      case "$bin" in
        [A-Za-z]:*)
          if [ "$OS_NAME" = "Darwin" ] || [ "$OS_NAME" = "Linux" ]; then OTHER_OS=$((OTHER_OS+1)); continue; fi
          [ -f "$bin" ] || [ -x "$bin" ] || MISS_BIN="$MISS_BIN $bin"
          ;;
        */*) [ -f "$bin" ] || [ -x "$bin" ] || MISS_BIN="$MISS_BIN $bin" ;;
        *)   have "$bin" || MISS_BIN="$MISS_BIN $bin" ;;
      esac
    done <<EOF_BINS
$CLIS
EOF_BINS
    if [ "$OTHER_OS" -gt 0 ]; then
      printf "  [info] %s CLI(s) do Perfil com caminho Windows num host %s — provavelmente o 'alt. SO' e o ativo aqui; confira as duas linhas do Perfil.\n" "$OTHER_OS" "$OS_NAME"
    fi
    if [ -n "$MISS_BIN" ]; then
      warn "binario(s) do Perfil INEXISTENTES nesta maquina:$MISS_BIN — Perfil de outro SO/maquina? (existir e diferente de estar autorizado — a allowlist e o outro check)."
    else
      ok "binarios do Perfil existem nesta maquina (os do SO ativo)."
    fi
  fi
fi
end_group

# ---------------------------------------------------------------------------
# GRUPO: camadas de configuracao (3.5.7) — NENHUMA decisao do harness vive em variavel local.
# hooks/harness-env.mjs resolve a ORIGEM de cada chave (defaults|projeto|local|maquina|ambiente)
# numa chamada so; aqui: WARN por override de decisao fora do esperado, WARN por chave obsoleta,
# FALTA por segredo versionado ou chave de projeto obrigatoria ausente.
# ---------------------------------------------------------------------------
begin_group "camadas" "Camadas de configuracao (3.5.7 — decisao do harness x projeto x maquina)"
# CRLF em arquivo sourceado = '\r' no fim de cada valor (HARNESS_DUELO='auto\r'): toda comparacao falha em silencio.
# hooks/.gitattributes (3.5.7) forca LF; aqui a rede para checkout feito antes dele ou editor que regravou.
for _cf in hooks/_defaults.env harness.env harness.env.local hooks/_camadas.txt; do
  if [ -f "$SCRIPT_DIR/$_cf" ] && grep -q $'\r' "$SCRIPT_DIR/$_cf" 2>/dev/null; then
    fail "$_cf em CRLF — os valores ganham '\\r' no fim e nenhuma comparacao bate. Converta para LF (dos2unix ou o editor) e confira hooks/.gitattributes."
  fi
done
if [ ! -f "$SCRIPT_DIR/hooks/_camadas.txt" ] || [ ! -f "$SCRIPT_DIR/hooks/harness-env.mjs" ] || [ ! -f "$SCRIPT_DIR/hooks/_env.sh" ]; then
  fail "camadas de configuracao ausentes (hooks/_camadas.txt, hooks/_env.sh, hooks/harness-env.mjs — 3.5.7): sincronize com o mestre (/deus). Ate la as decisoes do harness caem no default do codigo."
else
  CM_NODE="${HARNESS_RAG_NODE:-}"; [ -z "$CM_NODE" ] && have node && CM_NODE="node"
  if [ -z "$CM_NODE" ]; then
    na "camadas: sem node nesta maquina — origem das chaves nao resolvida."
  else
    CM_OUT="$(cd "$PROJECT_DIR" && "$CM_NODE" "$SCRIPT_DIR/hooks/harness-env.mjs" --doctor 2>/dev/null)"
    CM_RES="$(printf '%s\n' "$CM_OUT" | grep '^CAMADAS|resumo|' | head -1)"
    if [ -z "$CM_RES" ]; then
      warn "camadas: hooks/harness-env.mjs --doctor nao respondeu — rode a mao: node .claude/hooks/harness-env.mjs --doctor"
    else
      CM_N="$(printf '%s' "$CM_RES" | sed -n 's/.*|decisoes=\([0-9]*\).*/\1/p')"
      CM_P="$(printf '%s' "$CM_RES" | sed -n 's/.*|projeto=\([0-9]*\).*/\1/p')"
      CM_L="$(printf '%s' "$CM_RES" | sed -n 's/.*|local=\([0-9]*\).*/\1/p')"
      CM_M="$(printf '%s' "$CM_RES" | sed -n 's/.*|maquina=\([0-9]*\).*/\1/p')"
      CM_A="$(printf '%s' "$CM_RES" | sed -n 's/.*|ambiente=\([0-9]*\).*/\1/p')"
      case "$CM_RES" in *"|defaults=ausente"*) fail "hooks/_defaults.env ausente — as decisoes do harness caem no default do codigo. Sincronize com o mestre (/deus)." ;;
        *) ok "decisoes do harness: ${CM_N:-?} chaves com origem resolvida — defaults=hooks/_defaults.env · projeto=${CM_P:-0} · local=${CM_L:-0} · maquina=${CM_M:-0} · ambiente=${CM_A:-0} (ordem de carga: _defaults.env -> harness.env -> harness.env.local -> ~/.harness.env.local; ambiente vence)." ;;
      esac
      CM_OVR=0; CM_ESP=0
      while IFS='|' read -r tag ch cam val dflt esp igual; do
        [ "$tag" = "OVERRIDE" ] || continue
        case "$cam" in local) camf=".claude/harness.env.local" ;; maquina) camf="~/.harness.env.local" ;; *) camf=".claude/harness.env" ;; esac
        if [ "$esp" = "esperado" ]; then
          CM_ESP=$((CM_ESP+1)); printf '  [info] override esperado: %s=%s em %s (%s)\n' "$ch" "$val" "$camf" "$dflt"
        elif [ "$igual" = "igual" ]; then
          CM_OVR=$((CM_OVR+1)); warn "decisao do harness redeclarada em $camf com o MESMO valor do default: $ch=$val — apague a linha (o harness-sync --apply comenta sozinho no harness.env; no .local e a mao)."
        else
          CM_OVR=$((CM_OVR+1)); warn "OVERRIDE CONSCIENTE de decisao do harness: $ch=$val em $camf ($dflt) — vale so aqui; o placar/telemetria deste projeto deixa de ser comparavel. Apague para voltar ao mestre ou registre o motivo na linha de cima."
        fi
      done <<EOF_CM
$(printf '%s\n' "$CM_OUT" | grep '^OVERRIDE|')
EOF_CM
      while IFS='|' read -r tag ch cam; do
        [ "$tag" = "OBSOLETA" ] || continue
        case "$cam" in local) camf=".claude/harness.env.local" ;; maquina) camf="~/.harness.env.local" ;; *) camf=".claude/harness.env" ;; esac
        warn "chave desconhecida em $camf: $ch — o mestre nao a le (obsoleta, renomeada ou erro de digitacao). Ver hooks/_camadas.txt e hooks/_defaults.env."
      done <<EOF_CM2
$(printf '%s\n' "$CM_OUT" | grep '^OBSOLETA|')
EOF_CM2
      while IFS='|' read -r tag ch seg _; do
        [ "$tag" = "MAQUINA-VERSIONADA" ] || continue
        if [ "$seg" = "segredo" ]; then fail "SEGREDO VERSIONADO: $ch esta no .claude/harness.env (vai para o git e para a equipe no /deus) — mova para .claude/harness.env.local ou ~/.harness.env.local e troque a chave."
        else warn "chave de MAQUINA no harness.env versionado: $ch — pertence ao harness.env.local (runtime/caminho desta maquina; num dev com outro SO ela quebra)."; fi
      done <<EOF_CM3
$(printf '%s\n' "$CM_OUT" | grep '^MAQUINA-VERSIONADA|')
EOF_CM3
      while IFS='|' read -r tag ch; do
        [ "$tag" = "PROJETO-AUSENTE" ] || continue
        fail "chave de projeto obrigatoria ausente no .claude/harness.env: $ch"
      done <<EOF_CM4
$(printf '%s\n' "$CM_OUT" | grep '^PROJETO-AUSENTE|')
EOF_CM4
      while IFS='|' read -r tag ch val; do
        [ "$tag" = "AMBIENTE" ] || continue
        printf '  [info] decisao vinda do AMBIENTE da sessao: %s=%s (vence todas as camadas — virada pontual; se e permanente, e do mestre)\n' "$ch" "$val"
      done <<EOF_CM5
$(printf '%s\n' "$CM_OUT" | grep '^AMBIENTE|')
EOF_CM5
      [ "$CM_OVR" -eq 0 ] && ok "nenhuma decisao do harness sobrescrita fora do esperado (overrides esperados: $CM_ESP)."
    fi
  fi
fi
end_group

# ---------------------------------------------------------------------------
# GRUPO: presenca (3.0.1) — so os checks locais (zero rede). O teste de envio
# real fica no modo focado: bash .claude/harness-doctor.sh --presence
# ---------------------------------------------------------------------------
begin_group "presenca" "Presenca (Caronte)"
check_presence
end_group

# ---------------------------------------------------------------------------
printf '\n== Matriz multi-AI ==\n'
printf '  %-14s %-6s\n' "area" "status"
printf '  -------------- ------\n'
printf '%b' "$MATRIX"

printf '\n== Resumo ==\n'
printf '  OK: %s   WARN: %s   FALTA: %s   N/A: %s\n' "$OK" "$WARN" "$FAIL" "$NA"
if [ "$FAIL" -gt 0 ]; then
  printf '\nHa %s item(ns) faltando. Resolva os [FALTA] antes de usar o harness.\n' "$FAIL"
  exit 1
fi
printf '\nTudo pronto (warnings sao opcionais). Bom trabalho.\n'
exit 0
