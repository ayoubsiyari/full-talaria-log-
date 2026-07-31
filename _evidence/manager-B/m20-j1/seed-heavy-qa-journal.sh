#!/usr/bin/env bash
# Give the QA account a heavy journal made of REAL captures.
#
# D's harness used 120 synthetic images on a synthetic page. That establishes the mechanism but
# not the product. This copies genuine screenshot-bearing payloads that already exist in the
# database onto the QA account, so the measurement runs against real capture sizes, the real
# journal renderer, and a real logged-in session.
#
# Nothing is deleted and no other account is touched: rows are INSERTed for user 128 only, and
# cleanup-heavy-qa-journal.sh removes exactly what this created.
set -uo pipefail
N="${N_TRADES:-150}"
QA_USER=128
q(){ docker exec talaria-db-1 psql -U talaria -d talaria -At -c "$1" 2>&1; }

echo "=== how much real screenshot data is available? ==="
q "SELECT COUNT(*) FROM trading_session_journal_trades WHERE payload_json LIKE '%data:image%';" \
  | sed 's/^/  trades carrying a real data url: /'

echo
echo "=== make a session for the QA account ==="
existing=$(q "SELECT id FROM trading_sessions WHERE user_id=$QA_USER AND name='M20J1-HEAVY' LIMIT 1;")
if [ -n "$existing" ] && [ "$existing" -eq "$existing" ] 2>/dev/null; then
  SESS="$existing"; echo "  reusing session $SESS"
else
  SESS=$(q "INSERT INTO trading_sessions (user_id, name, session_type, config_json, created_at)
            VALUES ($QA_USER,'M20J1-HEAVY','personal','{}',NOW()) RETURNING id;" | head -1)
  echo "  created session $SESS"
fi
case "$SESS" in ''|*[!0-9]*) echo "  ABORT: bad session id '$SESS'"; exit 2 ;; esac

echo
echo "=== clear any previous seed, then copy $N real payloads onto QA ==="
q "DELETE FROM trading_session_journal_trades WHERE user_id=$QA_USER AND session_id=$SESS;" | sed 's/^/  /'

# Copy real payloads, rewriting only the ids so they belong to the QA session.
q "INSERT INTO trading_session_journal_trades
     (session_id, user_id, client_trade_id, payload_json, created_at, updated_at)
   SELECT $SESS, $QA_USER, 'm20j1-' || ROW_NUMBER() OVER (ORDER BY id),
          payload_json, NOW(), NOW()
     FROM trading_session_journal_trades
    WHERE payload_json LIKE '%data:image%'
    ORDER BY LENGTH(payload_json) DESC
    LIMIT $N;" | sed 's/^/  /'

echo
echo "=== what the QA journal now holds ==="
q "SELECT COUNT(*) AS trades,
          pg_size_pretty(SUM(LENGTH(payload_json))::bigint) AS total_payload,
          pg_size_pretty(ROUND(AVG(LENGTH(payload_json)))::bigint) AS avg_payload
     FROM trading_session_journal_trades WHERE user_id=$QA_USER AND session_id=$SESS;" \
  | sed 's/|/  |  /g; s/^/  /'

echo
echo "=== how many of those actually carry a data url (the thing under test)? ==="
q "SELECT COUNT(*) FILTER (WHERE payload_json LIKE '%data:image%') AS with_shot,
          COUNT(*) AS total
     FROM trading_session_journal_trades WHERE user_id=$QA_USER AND session_id=$SESS;" \
  | sed 's/|/  of  /; s/^/  /'

echo "$SESS" > /root/b-m20j1/QA_SESSION_ID
echo
echo "SEEDED session=$SESS user=$QA_USER"
