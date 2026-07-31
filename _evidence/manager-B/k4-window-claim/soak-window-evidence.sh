#!/usr/bin/env bash
# Ground the post-soak cut window in host evidence rather than in my recollection of C's launch time.
# Nothing here changes state.
#
# First revision of this script printed four empty sections and a zero, because it guessed the
# database name and the presence-table name. Empty output read as success is the exact trap that cost
# me a container-name error earlier today, so this version discovers both and prints what it found.
set -uo pipefail
echo "=== now ==="; date -u +'%Y-%m-%dT%H:%M:%SZ'

echo
echo "=== chart container uptime (a restart would have ended C's arm) ==="
docker inspect -f 'started={{.State.StartedAt}} running={{.State.Running}}' talaria-trading-chart-1

echo
echo "=== discover the database ==="
DBS=$(docker exec talaria-db-1 psql -U postgres -t -A -c "SELECT datname FROM pg_database WHERE datistemplate=false;")
echo "  databases: $(echo $DBS | tr '\n' ' ')"
DB=""
for d in $DBS; do
  n=$(docker exec talaria-db-1 psql -U postgres -d "$d" -t -A -c \
     "SELECT count(*) FROM information_schema.tables WHERE table_name LIKE '%window%' OR table_name='users';" 2>/dev/null)
  echo "  $d -> matching tables: ${n:-0}"
  if [ "${n:-0}" -gt 0 ] && [ -z "$DB" ]; then DB="$d"; fi
done
echo "  using DB=$DB"
[ -z "$DB" ] && { echo "  FAILED to find a database with the expected tables"; exit 1; }

echo
echo "=== discover the presence table ==="
docker exec talaria-db-1 psql -U postgres -d "$DB" -t -A -c \
  "SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%window%';"
TBL=$(docker exec talaria-db-1 psql -U postgres -d "$DB" -t -A -c \
  "SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%window%' LIMIT 1;")
echo "  using TBL=$TBL"

echo
echo "=== columns of $TBL ==="
docker exec talaria-db-1 psql -U postgres -d "$DB" -t -A -F'|' -c \
  "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='$TBL' ORDER BY ordinal_position;"

echo
echo "=== who holds window slots right now ==="
docker exec talaria-db-1 psql -U postgres -d "$DB" -t -A -F'|' -c \
  "SELECT u.email, count(*) FROM $TBL w JOIN users u ON u.id=w.user_id GROUP BY u.email ORDER BY 2 DESC;"
echo "  (blank above genuinely means no live window rows)"

echo
echo "=== session caps for the accounts I touched ==="
docker exec talaria-db-1 psql -U postgres -d "$DB" -t -A -c \
  "SELECT email || ' max_sessions=' || COALESCE(max_sessions::text,'null') FROM users
    WHERE email LIKE 'qa-canary%' OR email LIKE 'k4-probe%';"

echo
echo "=== request volume last 10 minutes (is a soak still driving traffic?) ==="
LINES=$(docker logs --since 10m talaria-trading-chart-1 2>&1 | wc -l)
echo "  log lines in last 10m: $LINES"
docker logs --since 10m talaria-trading-chart-1 2>&1 | tail -3

echo
echo "=== active sessions table, if one exists ==="
docker exec talaria-db-1 psql -U postgres -d "$DB" -t -A -F'|' -c \
  "SELECT u.email, count(*), min(s.created_at), max(s.created_at)
     FROM trading_sessions s JOIN users u ON u.id=s.user_id
    WHERE s.created_at > now() - interval '12 hours'
    GROUP BY u.email ORDER BY 2 DESC LIMIT 8;"
