#!/usr/bin/env bash
# D's harness reaches a login redirect and never lands on a page carrying trades and screenshots.
# Two things are needed to fix that once rather than per-manager:
#
#   1. the authenticated route (login shape + the URL that opens a backtest session)
#   2. a session that actually HAS journal trades with screenshots, because a correct route to an
#      empty session still returns UNPROVEN
#
# This finds (2), and reports the file_id each session needs, since the chart URL takes both.
set -uo pipefail
Q() { docker exec talaria-db-1 psql -U talaria -d talaria -At -F' | ' -c "$1"; }

echo "== sessions with journal trades, and how many of those trades carry a screenshot =="
Q "SELECT t.session_id,
          s.user_id,
          u.email,
          count(*) AS trades,
          count(*) FILTER (WHERE t.payload_json::text LIKE '%data:image%') AS with_shot,
          s.file_id
     FROM trading_session_journal_trades t
     JOIN trading_sessions s ON s.id = t.session_id
     JOIN users u ON u.id = s.user_id
    GROUP BY t.session_id, s.user_id, u.email, s.file_id
    HAVING count(*) FILTER (WHERE t.payload_json::text LIKE '%data:image%') > 0
    ORDER BY with_shot DESC, trades DESC
    LIMIT 10;" | sed 's/^/  session | user | email | trades | with_shot | file_id\n  /' | head -20

echo
echo "== total screenshot payload per candidate session, so D can pick a heavy one =="
Q "SELECT t.session_id,
          count(*) AS trades,
          pg_size_pretty(sum(length(t.payload_json::text))::bigint) AS payload
     FROM trading_session_journal_trades t
    WHERE t.payload_json::text LIKE '%data:image%'
    GROUP BY t.session_id
    ORDER BY sum(length(t.payload_json::text)) DESC
    LIMIT 10;" | sed 's/^/  /'

echo
echo "== does the session the freeze probe uses (936) carry any? =="
Q "SELECT '936: trades='||count(*)||' with_shot='||count(*) FILTER (WHERE payload_json::text LIKE '%data:image%')
     FROM trading_session_journal_trades WHERE session_id=936;" | sed 's/^/  /'

echo
echo "== file_id is needed in the chart URL; confirm it resolves =="
Q "SELECT 'session '||s.id||' -> file_id '||coalesce(s.file_id::text,'NULL')||'  ('||coalesce(f.original_filename,'no file row')||')'
     FROM trading_sessions s LEFT JOIN csv_files f ON f.id = s.file_id
    WHERE s.id IN (SELECT DISTINCT session_id FROM trading_session_journal_trades
                    WHERE payload_json::text LIKE '%data:image%')
    LIMIT 10;" | sed 's/^/  /'
