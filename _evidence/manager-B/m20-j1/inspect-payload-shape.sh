#!/usr/bin/env bash
# Seeded data has to match the real shape or the measurement is of my fixture, not the product.
set -uo pipefail
q(){ docker exec talaria-db-1 psql -U talaria -d talaria -At -c "$1" 2>&1; }

echo "=== keys present on a real payload_json ==="
q "SELECT string_agg(DISTINCT k, ', ' ORDER BY k)
   FROM (SELECT jsonb_object_keys(payload_json::jsonb) AS k
         FROM trading_session_journal_trades
         WHERE payload_json IS NOT NULL AND payload_json <> ''
         LIMIT 200) t;"

echo
echo "=== do any real payloads carry screenshots, and how big are they? ==="
q "SELECT COUNT(*) FILTER (WHERE payload_json LIKE '%entryScreenshot%') AS with_entry_shot,
          COUNT(*) FILTER (WHERE payload_json LIKE '%data:image%')      AS with_data_url,
          COUNT(*)                                                      AS total
   FROM trading_session_journal_trades;"

echo
echo "=== size distribution of payloads that DO carry a data url ==="
q "SELECT ROUND(AVG(LENGTH(payload_json))) AS avg_bytes,
          MAX(LENGTH(payload_json))        AS max_bytes
   FROM trading_session_journal_trades WHERE payload_json LIKE '%data:image%';"

echo
echo "=== a redacted sample payload (data urls truncated) ==="
q "SELECT LEFT(regexp_replace(payload_json, 'data:image/[a-z]+;base64,[A-Za-z0-9+/=]{0,60}[A-Za-z0-9+/=]*', 'data:image/jpeg;base64,<TRUNCATED>', 'g'), 1200)
   FROM trading_session_journal_trades
   WHERE payload_json LIKE '%data:image%' LIMIT 1;"

echo
echo "=== how many closed trades does the QA account have? ==="
q "SELECT COUNT(*) FROM trading_session_journal_trades WHERE user_id=128;"

echo
echo "=== sessions belonging to QA ==="
q "SELECT id FROM trading_sessions WHERE user_id=128 ORDER BY id DESC LIMIT 5;"
