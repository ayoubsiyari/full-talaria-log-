#!/bin/sh
# Time-bounded: the repair (ALTER TABLE) landed 2026-07-29T23:59:05Z.
REPAIR=2026-07-29T23:59:05Z
echo "repair_at=$REPAIR   now=$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "=== UndefinedColumn BEFORE the repair ==="
docker logs -t --until "$REPAIR" talaria-journal-backend-1 2>&1 | grep -c 'UndefinedColumn'
echo "=== UndefinedColumn SINCE the repair ==="
docker logs -t --since "$REPAIR" talaria-journal-backend-1 2>&1 | grep -c 'UndefinedColumn'

echo "=== prefs route status census SINCE the repair ==="
docker logs -t --since "$REPAIR" talaria-journal-backend-1 2>&1 \
  | grep -oE '"(GET|POST) /api/chart/preferences[^"]*" [0-9]{3}' \
  | awk '{print $1, $NF}' | sort | uniq -c | sort -rn

echo "=== prefs route status census BEFORE the repair ==="
docker logs -t --until "$REPAIR" talaria-journal-backend-1 2>&1 \
  | grep -oE '"(GET|POST) /api/chart/preferences[^"]*" [0-9]{3}' \
  | awk '{print $1, $NF}' | sort | uniq -c | sort -rn

echo "=== the two POST 500 and two 422: when, exactly ==="
docker logs -t talaria-journal-backend-1 2>&1 \
  | grep -E '"(GET|POST) /api/chart/preferences[^"]*" (500|422)' \
  | awk '{print $1, $(NF-2), $(NF-1), $NF}' | tail -6

echo "=== schema now carries the column ==="
docker exec talaria-journal-db-1 psql -U talaria -d talaria_journal -tAc \
  "select column_name from information_schema.columns where table_name='user_preferences' and column_name='indicator_settings_templates';" \
  2>/dev/null || docker exec talaria-postgres-1 psql -U postgres -d talaria_journal -tAc \
  "select column_name from information_schema.columns where table_name='user_preferences' and column_name='indicator_settings_templates';" 2>/dev/null || echo DB_PROBE_FAILED
