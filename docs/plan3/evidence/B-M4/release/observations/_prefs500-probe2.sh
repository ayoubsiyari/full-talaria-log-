#!/bin/sh
echo "=== journal-backend: the actual failure ==="
docker logs --since 120m talaria-journal-backend-1 2>&1 | grep -niE 'preferences|Traceback|sqlalchemy|psycopg|column|relation|UndefinedColumn|ProgrammingError' | tail -60

echo
echo "=== journal-backend: last 40 lines raw ==="
docker logs --tail 40 talaria-journal-backend-1 2>&1

echo
echo "=== method x status tally for the endpoint (nginx, 120m) ==="
docker logs --since 120m talaria-homepage-1 2>&1 \
  | grep 'api/chart/preferences' \
  | sed -E 's/.*"([A-Z]+) ([^ ]*) HTTP[^"]*" ([0-9]{3}).*/\1 \3/' \
  | sort | uniq -c | sort -rn

echo
echo "=== every distinct status seen on the endpoint, with counts by hour ==="
docker logs --since 120m talaria-homepage-1 2>&1 \
  | grep 'api/chart/preferences' \
  | sed -E 's/.*\[([0-9]{2}\/[A-Za-z]+\/[0-9]{4}:[0-9]{2}).*"([A-Z]+) [^"]*" ([0-9]{3}).*/\1 \2 \3/' \
  | sort | uniq -c

echo
echo "=== does the UserPreferences table match the model? ==="
docker exec talaria-db-1 psql -U postgres -d talaria -c '\d user_preferences' 2>&1 | head -40 || \
docker exec talaria-db-1 sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\\d user_preferences"' 2>&1 | head -40
