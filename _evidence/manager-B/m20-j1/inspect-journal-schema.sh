#!/usr/bin/env bash
# To confirm M20-J1 on the real app I need a heavy account: many closed trades, each carrying
# real screenshot data URLs. Find where the journal actually stores them.
set -uo pipefail
q(){ docker exec talaria-db-1 psql -U talaria -d talaria -c "$1" 2>&1; }

echo "=== tables that could hold journal trades ==="
q "SELECT table_name FROM information_schema.tables
   WHERE table_schema='public' AND (table_name LIKE '%journal%' OR table_name LIKE '%trade%')
   ORDER BY table_name;"

echo "=== columns of trading_session_journal_trades ==="
q "SELECT column_name, data_type FROM information_schema.columns
   WHERE table_name='trading_session_journal_trades' ORDER BY ordinal_position;"

echo "=== any column anywhere that smells like a screenshot ==="
q "SELECT table_name, column_name, data_type FROM information_schema.columns
   WHERE column_name ILIKE '%screenshot%' OR column_name ILIKE '%shot%' OR column_name ILIKE '%image%'
   ORDER BY table_name, column_name;"

echo "=== how many trades exist today, and do any carry screenshots? ==="
q "SELECT COUNT(*) AS total_trades FROM trading_session_journal_trades;"

echo "=== the QA account ==="
. /root/.talaria-test-env 2>/dev/null || true
q "SELECT id, email FROM users WHERE email='${TEST_EMAIL:-none}';"
