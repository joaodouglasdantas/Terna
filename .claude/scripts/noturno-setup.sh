#!/usr/bin/env bash
# .claude/scripts/noturno-setup.sh (3.4.1) — roda NO SERVIDOR DE HOMOLOG, dentro do checkout do
# projeto. Configura o loop noturno de ponta a ponta, perguntando so o que nao consegue descobrir,
# validando cada item e instalando os crons. Idempotente: rode quantas vezes quiser.
#
#   bash .claude/scripts/noturno-setup.sh            # assistente completo (instala + valida + crons)
#   bash .claude/scripts/noturno-setup.sh --check    # so valida (OK/FALHA por item) — use sempre que mudar algo
#   bash .claude/scripts/noturno-setup.sh --cron     # so (re)instala os crons
#
# O que ele faz: node (via nvm) + claude CLI → ~/.harness-noturno.env (chmod 600) → testa banco,
# URL, git push, GitLab API, claude e OpenRouter → instala cron 01:00 (espelho do prod) e 01:30
# (noturno) → roda um --dry-run. Nunca toca o prod: o dump e so LEITURA no prod.

set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT" || exit 2
ENVF="$HOME/.harness-noturno.env"
MODE="${1:-setup}"
ok()   { printf '  [ OK ] %s\n' "$*"; }
falha(){ printf '  [FALHA] %s\n' "$*"; FALHAS=$((FALHAS+1)); }
aviso(){ printf '  [ -- ] %s\n' "$*"; }
FALHAS=0
ler() { # $1 var  $2 pergunta  $3 default  $4 secreto(1)
  local v cur; cur="$(grep -E "^$1=" "$ENVF" 2>/dev/null | head -1 | cut -d= -f2-)"; cur="${cur:-$3}"
  if [ "${4:-0}" = 1 ]; then printf '%s [%s]: ' "$2" "${cur:+********}"; read -r -s v; echo; else printf '%s [%s]: ' "$2" "$cur"; read -r v; fi
  v="${v:-$cur}"; printf -v "$1" '%s' "$v"
}
carregar_env() { [ -f "$ENVF" ] && { set -a; . "$ENVF"; set +a; }; }
mysql_cli() { command -v mysql >/dev/null && echo mysql || echo ""; }

if [ "$MODE" != "--check" ] && [ "$MODE" != "--cron" ]; then
  echo "== Noturno — assistente de configuracao ($(basename "$ROOT"))"
  echo "   Vou perguntar so o necessario. Enter mantem o valor entre colchetes."
  # 1) runtime
  if ! command -v node >/dev/null 2>&1; then
    echo "-- node ausente: instalando via nvm (Node 22)"
    [ -s "$HOME/.nvm/nvm.sh" ] || curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash >/dev/null 2>&1
    # shellcheck disable=SC1090
    . "$HOME/.nvm/nvm.sh" && nvm install 22 >/dev/null 2>&1 && nvm alias default 22 >/dev/null 2>&1
  fi
  command -v claude >/dev/null 2>&1 || { echo "-- instalando claude CLI"; npm i -g @anthropic-ai/claude-code@latest >/dev/null 2>&1; }
  # 2) segredos e endpoints
  carregar_env
  echo "-- Token do Claude: gere UMA vez na sua maquina com: claude setup-token"
  ler CLAUDE_CODE_OAUTH_TOKEN "CLAUDE_CODE_OAUTH_TOKEN (ou deixe vazio e informe ANTHROPIC_API_KEY)" "${CLAUDE_CODE_OAUTH_TOKEN:-}" 1
  [ -n "$CLAUDE_CODE_OAUTH_TOKEN" ] || ler ANTHROPIC_API_KEY "ANTHROPIC_API_KEY" "${ANTHROPIC_API_KEY:-}" 1
  ler OPENROUTER_API_KEY "OPENROUTER_API_KEY" "${OPENROUTER_API_KEY:-}" 1
  ler HARNESS_DB_EXT_HOST "Banco da homolog — host" "${HARNESS_DB_EXT_HOST:-localhost}"
  ler HARNESS_DB_EXT_NAME "Banco da homolog — nome" "${HARNESS_DB_EXT_NAME:-}"
  ler HARNESS_DB_EXT_USER "Banco da homolog — usuario" "${HARNESS_DB_EXT_USER:-}"
  ler HARNESS_DB_EXT_PASS "Banco da homolog — senha" "${HARNESS_DB_EXT_PASS:-}" 1
  ler HARNESS_URL_EXT "URL da homolog (para o E2E)" "${HARNESS_URL_EXT:-}"
  ler GITLAB_TOKEN "GITLAB_TOKEN (scope api — abre o MR; vazio = so push)" "${GITLAB_TOKEN:-}" 1
  ler GITLAB_PROJECT_ID "ID numerico do projeto no GitLab" "${GITLAB_PROJECT_ID:-}"
  ler PROD_SSH "Espelho do prod — destino SSH (user@host; vazio = bancos no mesmo servidor)" "${PROD_SSH:-}"
  ler PROD_DB "Espelho do prod — banco de ORIGEM" "${PROD_DB:-}"
  ler PROD_DB_USER "Espelho do prod — usuario (leitura)" "${PROD_DB_USER:-}"
  ler PROD_DB_PASS "Espelho do prod — senha" "${PROD_DB_PASS:-}" 1
  {
    printf '# gerado por noturno-setup.sh em %s — NAO versionar\n' "$(date -Iseconds 2>/dev/null || date)"
    for k in CLAUDE_CODE_OAUTH_TOKEN ANTHROPIC_API_KEY OPENROUTER_API_KEY HARNESS_DB_EXT_HOST HARNESS_DB_EXT_NAME HARNESS_DB_EXT_USER HARNESS_DB_EXT_PASS HARNESS_URL_EXT GITLAB_TOKEN GITLAB_PROJECT_ID PROD_SSH PROD_DB PROD_DB_USER PROD_DB_PASS; do
      eval "v=\${$k:-}"; [ -n "$v" ] && printf '%s=%s\n' "$k" "$v"
    done
    printf 'HARNESS_DUELO_JUIZ_CLOUD=%s\nHARNESS_DELEGATE_MODE=off\n' "${HARNESS_DUELO_JUIZ_CLOUD:-openrouter}"
  } > "$ENVF"; chmod 600 "$ENVF"; ok "segredos gravados em $ENVF (chmod 600)"
fi

carregar_env
if [ "$MODE" != "--cron" ]; then
  echo "== Checagem"
  command -v node >/dev/null && ok "node $(node -v)" || falha "node ausente (nvm install 22)"
  command -v claude >/dev/null && ok "claude $(claude --version 2>/dev/null | head -1)" || falha "claude ausente (npm i -g @anthropic-ai/claude-code)"
  [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}${ANTHROPIC_API_KEY:-}" ] && ok "credencial do Claude presente" || falha "sem CLAUDE_CODE_OAUTH_TOKEN/ANTHROPIC_API_KEY"
  if command -v claude >/dev/null && [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}${ANTHROPIC_API_KEY:-}" ]; then
    R="$(timeout 90 claude -p "responda apenas OK" --output-format text 2>/dev/null | tr -d '\r' | tail -1)"; case "$R" in *OK*) ok "claude -p autentica no servidor" ;; *) falha "claude -p nao respondeu (token invalido/expirado?)" ;; esac
  fi
  if [ -n "${OPENROUTER_API_KEY:-}" ]; then
    C="$(curl -s -m 15 -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $OPENROUTER_API_KEY" https://openrouter.ai/api/v1/key)"; [ "$C" = 200 ] && ok "OpenRouter: chave valida" || falha "OpenRouter respondeu HTTP $C"
  else aviso "sem OPENROUTER_API_KEY — duelo dormente (hefesto nativo escreve)"; fi
  if [ -n "$(mysql_cli)" ] && [ -n "${HARNESS_DB_EXT_NAME:-}" ]; then
    mysql -h "${HARNESS_DB_EXT_HOST:-localhost}" -u "${HARNESS_DB_EXT_USER:-}" -p"${HARNESS_DB_EXT_PASS:-}" "$HARNESS_DB_EXT_NAME" -e "SELECT 1" >/dev/null 2>&1 && ok "banco $HARNESS_DB_EXT_NAME@${HARNESS_DB_EXT_HOST:-localhost} responde" || falha "banco da homolog nao conecta"
    N="$(mysql -N -h "${HARNESS_DB_EXT_HOST:-localhost}" -u "${HARNESS_DB_EXT_USER:-}" -p"${HARNESS_DB_EXT_PASS:-}" -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$HARNESS_DB_EXT_NAME'" 2>/dev/null)"; [ "${N:-0}" -gt 0 ] 2>/dev/null && ok "banco com $N tabelas (espelho presente)" || aviso "banco vazio — o espelho (cron 01:00) ainda nao rodou"
  else falha "mysql CLI ausente ou HARNESS_DB_EXT_NAME vazio"; fi
  if [ -n "${HARNESS_URL_EXT:-}" ]; then C="$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$HARNESS_URL_EXT")"; case "$C" in 2*|3*) ok "URL da homolog responde ($C)" ;; *) falha "URL da homolog respondeu $C" ;; esac; else aviso "sem HARNESS_URL_EXT — E2E vai usar a Base URL do Perfil"; fi
  git ls-remote --heads origin >/dev/null 2>&1 && ok "git: origin acessivel" || falha "git: origin inacessivel (deploy token/chave?)"
  git push --dry-run origin HEAD:refs/heads/wt/noturno-teste-setup >/dev/null 2>&1 && ok "git: push permitido (branch wt/*)" || falha "git: push negado — o noturno precisa publicar wt/noturno-*"
  if [ -n "${GITLAB_TOKEN:-}" ] && [ -n "${GITLAB_PROJECT_ID:-}" ]; then
    C="$(curl -s -m 15 -o /dev/null -w '%{http_code}' -H "PRIVATE-TOKEN: $GITLAB_TOKEN" "${CI_API_V4_URL:-https://gitlab.com/api/v4}/projects/$GITLAB_PROJECT_ID")"; [ "$C" = 200 ] && ok "GitLab API: projeto $GITLAB_PROJECT_ID acessivel (MR automatico)" || falha "GitLab API respondeu $C (token/projeto)"
  else aviso "sem GITLAB_TOKEN/PROJECT_ID — branch sera publicada, MR manual"; fi
  if [ -n "${PROD_SSH:-}" ]; then ssh -o BatchMode=yes -o ConnectTimeout=10 "$PROD_SSH" true 2>/dev/null && ok "SSH ao prod ($PROD_SSH) sem senha" || falha "SSH ao prod pede senha/falha — instale a chave publica deste servidor no prod"; fi
  crontab -l 2>/dev/null | grep -q "noturno.sh --cloud" && ok "cron do noturno instalado" || aviso "cron do noturno ainda nao instalado (o assistente instala; ou --cron)"
  [ -f .claude/harness.env ] && ok "harness $(grep -o "HARNESS_VERSION='[^']*'" .claude/harness.env | cut -d"'" -f2) neste checkout" || falha "sem .claude/harness.env — este nao e um checkout com harness"
  echo "== Resultado: $FALHAS falha(s)"
fi

if [ "$MODE" != "--check" ]; then
  echo "== Crons"
  ESPELHO="0 1 * * *  "
  if [ -n "${PROD_SSH:-}" ]; then ESPELHO="${ESPELHO}ssh $PROD_SSH \"mysqldump -u $PROD_DB_USER -p'$PROD_DB_PASS' --single-transaction --routines --triggers --events $PROD_DB\" | mysql -h ${HARNESS_DB_EXT_HOST:-localhost} -u $HARNESS_DB_EXT_USER -p'$HARNESS_DB_EXT_PASS' $HARNESS_DB_EXT_NAME >> $HOME/noturno-espelho.log 2>&1"
  else ESPELHO="${ESPELHO}SRC_DB=$PROD_DB DST_DB=$HARNESS_DB_EXT_NAME DB_HOST=${HARNESS_DB_EXT_HOST:-localhost} DB_USER=$PROD_DB_USER DB_PASS='$PROD_DB_PASS' bash $ROOT/.claude/scripts/noturno-db-clone.sh >> $HOME/noturno-espelho.log 2>&1"; fi
  NOTURNO="30 1 * * 1-6  cd $ROOT && git fetch -q origin && git checkout -q main && git reset -q --hard origin/main && set -a && . $ENVF && set +a && export PATH=\$HOME/.nvm/versions/node/\$(ls \$HOME/.nvm/versions/node 2>/dev/null | tail -1)/bin:\$PATH && bash .claude/scripts/noturno.sh --cloud --max-lotes ${HARNESS_NOTURNO_MAX_LOTES:-3} >> $HOME/noturno.log 2>&1"
  { crontab -l 2>/dev/null | grep -v "noturno.sh --cloud" | grep -v "noturno-db-clone.sh\|noturno-espelho.log"; [ -n "${PROD_DB:-}" ] && echo "$ESPELHO"; echo "$NOTURNO"; } | crontab - && ok "crons instalados (01:00 espelho, 01:30 noturno seg–sab)" || falha "nao consegui instalar o crontab"
  [ "$MODE" = "--cron" ] && exit 0
  echo "== Ensaio (dry-run)"
  bash .claude/scripts/noturno.sh --cloud --dry-run && ok "dry-run OK — o noturno esta pronto; a primeira noite e hoje" || falha "dry-run falhou — veja as mensagens acima"
fi
exit $(( FALHAS > 0 ? 1 : 0 ))
