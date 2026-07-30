#!/bin/sh
echo "=== db identity ==="
docker exec talaria-journal-backend-1 sh -c 'echo "$DATABASE_URL" | sed -E "s#(//[^:]+):[^@]*@#\1:***@#"' 2>&1

echo
echo "=== columns that EXIST in the deployed table ==="
docker exec talaria-db-1 sh -c 'psql -tAq -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select column_name from information_schema.columns where table_name='"'"'user_preferences'"'"' order by column_name"' 2>&1

echo
echo "=== POST vs GET on the endpoint (all statuses, 180m) ==="
docker logs --since 180m talaria-journal-backend-1 2>&1 \
  | grep 'api/chart/preferences' \
  | sed -E 's/.*"([A-Z]+) [^"]*" ([0-9]{3}).*/\1 \2/' \
  | sort | uniq -c | sort -rn

echo
echo "=== distinct backend error strings on this endpoint ==="
docker logs --since 180m talaria-journal-backend-1 2>&1 \
  | grep -F 'Error loading preferences' | sed -E 's/.*Error loading preferences: //' | sort | uniq -c
docker logs --since 180m talaria-journal-backend-1 2>&1 \
  | grep -F 'Error updating preferences' | sed -E 's/.*Error updating preferences: //' | sort | uniq -c

echo
echo "=== migration files present in the backend image ==="
docker exec talaria-journal-backend-1 sh -c 'ls -1 /app/migrations 2>/dev/null | tail -20; ls -1 /app/migrations/versions 2>/dev/null | tail -20' 2>&1

echo
echo "=== does any migration mention the missing column ==="
docker exec talaria-journal-backend-1 sh -c 'grep -rl indicator_settings_templates /app 2>/dev/null | head -10' 2>&1
