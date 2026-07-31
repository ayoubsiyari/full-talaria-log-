#!/usr/bin/env bash
# The confound test came back flat (r = -0.016) but only across 1930-2592 bars, where the metric
# is already saturated at ~300-340 ms/s. The one low reading, 55 ms/s, was taken at 579-888 bars —
# below that range. So the question that decides whether my 5.9x survives is: what does b120 do at
# ~800-1100 bars, the window b118 was measured in?
#
# To answer it I have to put replay back to the start. This finds where the position is kept.
set -uo pipefail
echo "=== config_json keys for session 936 ==="
docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "SELECT string_agg(k, ', ') FROM (
     SELECT jsonb_object_keys(config_json::jsonb) AS k FROM trading_sessions WHERE id=936
   ) t;" 2>&1 | fold -w 150 | sed 's/^/  /'

echo
echo "=== anything positional inside config_json ==="
docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "SELECT key||' = '||LEFT(value::text, 90)
     FROM trading_sessions, jsonb_each(config_json::jsonb)
    WHERE id=936
      AND (key ILIKE '%replay%' OR key ILIKE '%index%' OR key ILIKE '%position%'
        OR key ILIKE '%bar%' OR key ILIKE '%candle%' OR key ILIKE '%playback%'
        OR key ILIKE '%current%' OR key ILIKE '%time%' OR key ILIKE '%cursor%');" 2>&1 | sed 's/^/  /'

echo
echo "=== how big is it, and when was it last written ==="
docker exec talaria-db-1 psql -U talaria -d talaria -c \
  "SELECT id, LENGTH(config_json) AS len, updated_at FROM trading_sessions WHERE id=936;" 2>&1 | sed 's/^/  /'

echo
echo "=== a fresh session is the alternative: what does an UNUSED session look like? ==="
docker exec talaria-db-1 psql -U talaria -d talaria -c \
  "SELECT id, LENGTH(config_json) AS len FROM trading_sessions
     WHERE user_id=128 ORDER BY id;" 2>&1 | sed 's/^/  /'
