#!/bin/sh
H=/usr/share/nginx/html/chart

echo "=== schema: repaired column present ==="
docker exec talaria-db-1 sh -lc 'psql -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-postgres} -tAc "select column_name from information_schema.columns where table_name = '"'"'user_preferences'"'"' and column_name = '"'"'indicator_settings_templates'"'"';"' 2>&1 | head -3

echo
echo "=== preferencesLoaded listeners in the SERVED tree ==="
docker exec talaria-homepage-1 sh -c "grep -rl preferencesLoaded $H 2>/dev/null | head -6"

echo
echo "=== iframe lifecycle in the served panel manager (about:blank then embed URL?) ==="
docker exec talaria-homepage-1 sh -c "grep -n 'about:blank' -B6 -A10 $H/multichart-prod/multichart-manager.js | head -40"

echo
echo "=== where the embed URL is assigned ==="
docker exec talaria-homepage-1 sh -c "grep -nE \"\.src *= *'[^']*chart-embed|\.src *= *\\\"[^\\\"]*chart-embed|chart-embed.html\" $H/multichart-prod/multichart-manager.js | head -6"
