#!/bin/sh
# Automated Postgres backup for the Talaria stack.
#
# Run on the VPS from repo root (e.g. /opt/talaria):
#   sh scripts/backup-postgres.sh
#
# What it does:
#   * pg_dump the Postgres container's database to a timestamped .sql.gz file
#   * store it under $BACKUP_DIR (default ./backups — i.e. /opt/talaria/backups)
#   * prune dumps older than $BACKUP_RETENTION_DAYS (default 14)
#
# Schedule it via cron (daily at 03:15 server time):
#   crontab -e
#   15 3 * * * cd /opt/talaria && sh scripts/backup-postgres.sh >> /opt/talaria/backups/backup.log 2>&1
#
# Off-site copy (recommended — a local backup dies with the disk it lives on):
#   set BACKUP_S3_URI to sync the dump to object storage after each run, e.g.
#   BACKUP_S3_URI=s3://talaria-backups/postgres  (requires awscli on the host)
set -e

POSTGRES_USER="${POSTGRES_USER:-talaria}"
POSTGRES_DB="${POSTGRES_DB:-talaria}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
DB_SERVICE="${DB_SERVICE:-db}"

# docker compose v2 (plugin) with a v1 fallback.
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
else
  DC="docker-compose"
fi

mkdir -p "$BACKUP_DIR"

TS="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="$BACKUP_DIR/talaria-${POSTGRES_DB}-${TS}.sql.gz"

echo "=== Talaria Postgres backup ==="
echo "Database : $POSTGRES_DB (user $POSTGRES_USER)"
echo "Target   : $OUT_FILE"

# --clean --if-exists makes the dump safe to restore over an existing schema.
# Stream straight through gzip so we never write the uncompressed dump to disk.
$DC exec -T "$DB_SERVICE" pg_dump \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --clean --if-exists --no-owner \
  | gzip -c > "$OUT_FILE"

# Guard against a silently-empty dump (e.g. container not ready).
SIZE_BYTES="$(wc -c < "$OUT_FILE" | tr -d ' ')"
if [ "$SIZE_BYTES" -lt 1000 ]; then
  echo "FAILED: backup is suspiciously small (${SIZE_BYTES} bytes) — leaving file for inspection but not pruning." >&2
  exit 1
fi
echo "OK: wrote ${SIZE_BYTES} bytes"

# Optional off-site copy.
if [ -n "$BACKUP_S3_URI" ]; then
  if command -v aws >/dev/null 2>&1; then
    echo "Uploading to ${BACKUP_S3_URI}/ ..."
    aws s3 cp "$OUT_FILE" "${BACKUP_S3_URI}/$(basename "$OUT_FILE")"
    echo "OK: uploaded to S3"
  else
    echo "WARN: BACKUP_S3_URI set but awscli not found — skipping off-site upload." >&2
  fi
fi

# Prune old local dumps.
echo "Pruning local dumps older than ${BACKUP_RETENTION_DAYS} days ..."
find "$BACKUP_DIR" -name "talaria-*.sql.gz" -type f -mtime "+${BACKUP_RETENTION_DAYS}" -print -delete || true

echo "=== Backup complete ==="
