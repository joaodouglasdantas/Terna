#!/usr/bin/env bash
# docs/noturno-db-clone.sh (harness 3.4.1) — roda NO SERVIDOR (cron, ~01:00, antes do job noturno):
# recria o banco <db>_noturno a partir do banco de producao/homolog, para o loop noturno em cloud
# trabalhar com dados reais sem tocar o prod. Nunca e chamado pelo harness — e infra do projeto.
#
#   0 1 * * *  /home/<user>/noturno-db-clone.sh >> /home/<user>/noturno-db-clone.log 2>&1
#
# Variaveis (edite aqui ou exporte no cron): credenciais de LEITURA do prod e de escrita no noturno.
set -eu
SRC_DB="${SRC_DB:-meu_banco_prod}"; DST_DB="${DST_DB:-${SRC_DB}_noturno}"
DB_HOST="${DB_HOST:-localhost}"; DB_USER="${DB_USER:-root}"; DB_PASS="${DB_PASS:-}"
ANON="${ANON:-1}"   # 1 = anonimiza colunas sensiveis apos restaurar (ajuste a lista abaixo ao projeto)

T0=$(date +%s)
mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" -e "DROP DATABASE IF EXISTS \`$DST_DB\`; CREATE DATABASE \`$DST_DB\` CHARACTER SET utf8mb4;"
mysqldump -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" --single-transaction --routines --triggers --events "$SRC_DB" \
  | mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" "$DST_DB"
if [ "$ANON" = 1 ]; then
  # EXEMPLO — adapte as tabelas/colunas do projeto (LGPD: o runner e um terceiro).
  mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" "$DST_DB" <<'SQL' || true
-- UPDATE pacientes SET email = CONCAT('p', id, '@exemplo.local'), cpf = NULL, telefone = CONCAT('5500', LPAD(id, 9, '0'));
-- UPDATE leads     SET email = CONCAT('l', id, '@exemplo.local'), telefone = CONCAT('5500', LPAD(id, 9, '0'));
-- UPDATE usuarios  SET senha = '$2y$10$exemploexemploexemploexemploexemploexemploexemploexe' WHERE login <> 'ADMIN';
SQL
fi
echo "[noturno-db-clone $(date +%F\ %T)] $SRC_DB -> $DST_DB em $(( $(date +%s) - T0 ))s"
