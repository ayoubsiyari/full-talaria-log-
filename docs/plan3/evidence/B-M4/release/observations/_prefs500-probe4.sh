#!/bin/sh
echo "=== did the idempotent schema patch run, and did it fail? ==="
docker logs talaria-journal-backend-1 2>&1 | grep -niE 'schema patch|schema patch failed|ensure_users_schema|Traceback' | head -40

echo
echo "=== backend startup window (first 60 lines) ==="
docker logs talaria-journal-backend-1 2>&1 | head -60

echo
echo "=== alembic state ==="
docker exec talaria-db-1 sh -c 'psql -tAq -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select version_num from alembic_version"' 2>&1
