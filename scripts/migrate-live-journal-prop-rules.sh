#!/usr/bin/env bash
# Add live_journal_accounts.prop_rules (PostgreSQL) — fixes journal create/list after prop rules feature.
# Run from repo root on the VPS:
#   chmod +x scripts/migrate-live-journal-prop-rules.sh
#   ./scripts/migrate-live-journal-prop-rules.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Adding prop_rules column to live_journal_accounts (if missing) ==="
docker compose exec -T db psql -U "${POSTGRES_USER:-talaria}" -d "${POSTGRES_DB:-talaria}" -v ON_ERROR_STOP=1 <<'SQL'
ALTER TABLE live_journal_accounts ADD COLUMN IF NOT EXISTS prop_rules JSONB;
SQL

echo "=== Restarting journal-backend so startup schema patch runs ==="
docker compose restart journal-backend

echo "=== Done. Journals should list again; prop journal create should work. ==="
