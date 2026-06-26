#!/bin/sh
# Restore a Talaria Postgres backup produced by scripts/backup-postgres.sh.
#
# DANGER: this overwrites the current database contents. The dump is created
# with --clean --if-exists, so existing tables are dropped and recreated.
#
# Run on the VPS from repo root:
#   sh scripts/restore-postgres.sh backups/talaria-talaria-20260626-031500.sql.gz
#
# It will ask for confirmation before touching the database.
set -e

DUMP_FILE="$1"
if [ -z "$DUMP_FILE" ]; then
  echo "Usage: sh scripts/restore-postgres.sh <path-to-dump.sql.gz>" >&2
  exit 2
fi
if [ ! -f "$DUMP_FILE" ]; then
  echo "FAILED: file not found: $DUMP_FILE" >&2
  exit 2
fi

POSTGRES_USER="${POSTGRES_USER:-talaria}"
POSTGRES_DB="${POSTGRES_DB:-talaria}"
DB_SERVICE="${DB_SERVICE:-db}"

if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
else
  DC="docker-compose"
fi

echo "About to restore into database '$POSTGRES_DB' (user '$POSTGRES_USER')."
echo "Source dump: $DUMP_FILE"
echo "This will DROP and recreate existing objects. Existing data will be lost."
printf "Type 'RESTORE' to continue: "
read CONFIRM
if [ "$CONFIRM" != "RESTORE" ]; then
  echo "Aborted."
  exit 1
fi

# Decompress on the host and pipe the SQL into psql inside the container.
gunzip -c "$DUMP_FILE" | $DC exec -T "$DB_SERVICE" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

echo "=== Restore complete ==="
echo "Recommended: restart app containers so pooled connections reconnect:"
echo "  $DC restart trading-chart trading-chart-worker journal-backend"
