#!/bin/sh
# Q1: is the prefs 500 gone and staying gone?
# Q2: what DOES construction await — and can that thing fail?
echo "=== 1. prefs route health on the live build ==="
curl -sS -o /dev/null -w 'GET /api/chart/preferences (no auth) -> %{http_code}\n' \
  http://127.0.0.1:3000/api/chart/preferences

echo "=== 2. UndefinedColumn occurrences since the repair (repair was 23:59:05Z 2026-07-29) ==="
docker logs talaria-journal-backend-1 2>&1 | grep -c 'UndefinedColumn' || echo 0
echo "--- last occurrence timestamp, if any"
docker logs talaria-journal-backend-1 2>&1 | grep 'UndefinedColumn' | tail -1 | cut -c1-120 || true

echo "=== 3. status census for the prefs route in the whole retained log ==="
docker logs talaria-journal-backend-1 2>&1 \
  | grep -oE '"(GET|POST) /api/chart/preferences[^"]*" [0-9]{3}' \
  | awk '{print $1, $NF}' | sort | uniq -c | sort -rn | head -10

echo "=== 4. the endpoints that construction ACTUALLY awaits (chart-window-limit gates these) ==="
for p in /api/chart/windows/claim /api/chart/windows/heartbeat; do
  curl -sS -o /dev/null -w "POST $p (no auth) -> %{http_code}\n" -X POST \
    -H 'Content-Type: application/json' -d '{"client_id":"probe0000"}' \
    "http://127.0.0.1:3000$p"
done
echo "--- claim/heartbeat status census from the log"
docker logs talaria-journal-backend-1 2>&1 \
  | grep -oE '"(GET|POST) /api/chart/windows/[a-z]+[^"]*" [0-9]{3}' \
  | awk '{print $2, $NF}' | sort | uniq -c | sort -rn | head -10

echo "=== 5. 405/404 on the windows API would pause window-limit silently (markApiUnavailable) ==="
docker logs talaria-journal-backend-1 2>&1 | grep -cE '"POST /api/chart/windows/claim[^"]*" (404|405)' || echo 0

echo "=== 6. every iframe-creating site in the SERVED tree (for C's frame-tree census) ==="
docker exec talaria-homepage-1 sh -c '
H=/usr/share/nginx/html/chart
for f in $H/multichart-prod/multichart-manager.js $H/multichart/multichart-manager.js \
         $H/multichart-prod/chart-embed.html; do
  [ -f "$f" ] || continue
  printf "%s createElement(iframe)=%s document.write=%s about:blank=%s\n" \
    "$(basename $f)" \
    "$(grep -c "createElement('\''iframe'\''\|createElement(\"iframe\")" $f)" \
    "$(grep -c "document.write" $f)" \
    "$(grep -c "about:blank" $f)"
done'
