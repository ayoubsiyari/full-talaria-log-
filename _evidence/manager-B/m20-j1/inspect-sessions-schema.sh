#!/usr/bin/env bash
set -uo pipefail
docker exec talaria-db-1 psql -U talaria -d talaria -c \
  "SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
    WHERE table_name='trading_sessions'
      AND is_nullable='NO' AND column_default IS NULL
    ORDER BY ordinal_position;" 2>&1
echo "=== distinct session_type values in use ==="
docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "SELECT DISTINCT session_type FROM trading_sessions LIMIT 10;" 2>&1
echo "=== a real session row, columns that matter ==="
docker exec talaria-db-1 psql -U talaria -d talaria -c \
  "SELECT id, user_id, name, session_type FROM trading_sessions ORDER BY id DESC LIMIT 3;" 2>&1
