#!/usr/bin/env bash
# .claude/scripts/db-test.sh — acesso SOMENTE ao banco de TESTE local (canonico do harness).
# harness:managed — remova esta linha se transformar este arquivo num adaptador PROPRIO do
# projeto (o sync passa a PRESERVA-lo em vez de atualiza-lo; ver GUARDED_CORE no harness-sync).
#
# Por que existe: a allowlist de execucao autonoma (permissions.allow) NUNCA libera o
# cliente mysql direto — liberaria qualquer banco/qualquer comando. Este wrapper trava
# o banco no de TESTE local do Perfil e e ele que entra na allowlist:
#   "Bash(bash .claude/scripts/db-test.sh *)"
#
# GENERICO POR DECLARACAO (DT-003 do mestre, 01/09/2026 — antes era um adaptador por projeto
# com o banco hardcoded, que dentro de worktree consultava o banco do checkout PRINCIPAL em
# silencio). Fontes, na ordem:
#   1. DBTEST_DB exportado                        (override explicito, casos excepcionais)
#   2. .claude/.harness-run/worktree.env  (db=)   (worktree isolado 3.4.0 — banco CLONADO;
#                                                  o arquivo so existe dentro de worktree)
#   3. Perfil (.claude/PERFIL-PROJETO.md)         (| **Database** | `nome` | — banco de DEV local)
# Credenciais: DBTEST_USER/DBTEST_PASS/DBTEST_HOST > Perfil. Cliente: DBTEST_BIN > 1o token
# do "Comando de smoke test" do Perfil > busca padrao Laragon/MAMP.
#
# Uso:
#   bash .claude/scripts/db-test.sh "SELECT 1;"
#   bash .claude/scripts/db-test.sh < script.sql

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"    # .../.claude/scripts
CLAUDE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"                    # .../.claude
PERFIL="$CLAUDE_DIR/PERFIL-PROJETO.md"

perfil_campo() { # $1 = rotulo da linha (regex) -> valor da 2a coluna, sem crases
  awk -v r="$1" -F'|' '$2 ~ "\\*\\*" r "\\*\\*" { v=$3; gsub(/^[ \t]+|[ \t]+$/, "", v); gsub(/`/, "", v); print v; exit }' "$PERFIL" 2>/dev/null
}

DB="$(perfil_campo 'Database')"
case "$DB" in *'<'*) DB="" ;; esac   # placeholder de template nao e banco

# Worktree isolado: o clone do worktree vence o Perfil (que descreve o checkout principal).
WT_ENV="$CLAUDE_DIR/.harness-run/worktree.env"
if [ -f "$WT_ENV" ]; then
  WT_DB="$(grep '^db=' "$WT_ENV" 2>/dev/null | head -n1 | cut -d= -f2)"
  [ -n "$WT_DB" ] && DB="$WT_DB"
fi
DB="${DBTEST_DB:-$DB}"
if [ -z "$DB" ]; then
  echo "[db-test] banco de teste nao resolvido — preencha '| **Database** |' no Perfil ou exporte DBTEST_DB." >&2
  exit 1
fi

HOST="${DBTEST_HOST:-$(perfil_campo 'Host')}"; [ -n "$HOST" ] || HOST="localhost"
case "$HOST" in *'<'*) HOST="localhost" ;; esac
USER="${DBTEST_USER:-$(perfil_campo 'Usu.?.?rio')}"; [ -n "$USER" ] || USER="root"
PASS="${DBTEST_PASS:-$(perfil_campo 'Senha')}"

# Resolve o cliente: override > smoke test do Perfil (1o token) > busca padrao (Laragon/MAMP).
BIN="${DBTEST_BIN:-}"
if [ -z "$BIN" ]; then
  SMOKE="$(perfil_campo 'Comando de smoke test')"
  CAND="${SMOKE%% *}"
  case "$CAND" in *mysql*) [ -f "$CAND" ] || command -v "$CAND" >/dev/null 2>&1 && BIN="$CAND" ;; esac
fi
if [ -z "$BIN" ]; then
  for c in \
    /c/laragon/bin/mysql/*/bin/mysql.exe \
    "C:/laragon/bin/mysql/mysql-8.0.30-winx64/bin/mysql.exe" \
    "/Applications/MAMP/Library/bin/mysql"; do
    if [ -x "$c" ] || [ -f "$c" ]; then BIN="$c"; break; fi
  done
fi
if [ -z "$BIN" ]; then
  echo "[db-test] cliente mysql nao encontrado (Laragon/MAMP) — defina DBTEST_BIN." >&2
  exit 1
fi

# O banco default e SEMPRE o de teste ($DB) — o argumento e so o SQL, nunca o nome
# do banco. Limite conhecido: SQL com nome qualificado (outrodb.tabela) ainda alcanca
# outros schemas do MySQL local de DEV; a protecao real e a credencial ser local-only.

if [ $# -gt 0 ]; then
  exec "$BIN" -h "$HOST" -u "$USER" -p"$PASS" "$DB" -e "$*"
else
  exec "$BIN" -h "$HOST" -u "$USER" -p"$PASS" "$DB"
fi
