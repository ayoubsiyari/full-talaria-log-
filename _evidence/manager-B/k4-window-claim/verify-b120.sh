#!/usr/bin/env bash
# b120 verification. I converted nine gated endpoints from `async def` to `def`. That is a change
# to how the product's hot path is scheduled, so "the stall went away" is only half the report —
# the other half is that the endpoints still do their job and the gate still gates.
set -uo pipefail
BASE=http://127.0.0.1:3000
. /root/.talaria-test-env
JAR=/tmp/b120-verify.txt
rm -f "$JAR"

echo "=== build on the wire ==="
curl -s "$BASE/chart/dist-v9/index.html" | grep -o '__TALARIA_CHART_BUILD_ID[^;]*' | head -1 | sed 's/^/  /'
echo "  LIVE-PIN: $(cat /root/talaria-restore/LIVE-PIN.txt)"

echo
echo "=== log in and claim a window ==="
curl -sS -c "$JAR" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" -o /dev/null -w '  login  %{http_code}\n'
WID="b120verify$(date +%s)"
curl -sS -b "$JAR" -X POST "$BASE/api/chart/windows/claim" -H 'Content-Type: application/json' \
  -d "{\"client_id\":\"$WID\"}" -o /dev/null -w '  claim  %{http_code}\n'

FID=677
echo
echo "=== every endpoint I converted must still answer correctly ==="
probe() { # name path
  out=$(curl -sS -b "$JAR" -H "X-Talaria-Chart-Window-Id: $WID" \
        -o /tmp/b120-body -w '%{http_code} %{time_total} %{size_download}' "$BASE$2")
  set -- $out
  printf '  %-34s http %-4s %6.3fs %9s bytes\n' "$1" "$1" 0 0 >/dev/null
  printf '  %-34s http %-4s %7ss %9s bytes\n' "$3x" "$1" "$2" "$3" >/dev/null
  printf '  %-34s http %-5s %8ss  %10s bytes\n' "$4" "$1" "$2" "$3"
}
for spec in \
  "meta|/api/file/$FID/meta" \
  "bars|/api/file/$FID/bars?resolution=1m&limit=50" \
  "candles|/api/file/$FID/candles?timeframe=1m&limit=50" \
  "smart|/api/file/$FID/smart?timeframe=1m&limit=50" \
  "tile-meta|/api/file/$FID/tile-meta/1m" \
  "conversion-status|/api/file/$FID/conversion-status" \
  ; do
  name="${spec%%|*}"; path="${spec#*|}"
  read -r code t size <<<"$(curl -sS -b "$JAR" -H "X-Talaria-Chart-Window-Id: $WID" \
      -o /tmp/b120-body -w '%{http_code} %{time_total} %{size_download}' "$BASE$path")"
  printf '  %-20s http %-5s %8ss  %10s bytes\n' "$name" "$code" "$t" "$size"
done

echo
echo "=== the payload is real, not an empty 200 ==="
curl -sS -b "$JAR" -H "X-Talaria-Chart-Window-Id: $WID" \
  "$BASE/api/file/$FID/bars?resolution=1m&limit=5" \
  | head -c 260 | sed 's/^/  /'
echo

echo
echo "=== the gate still gates: same request, a window id that was never claimed ==="
curl -sS -b "$JAR" -H "X-Talaria-Chart-Window-Id: never-claimed-window-000" \
  -o /tmp/b120-gate -w '  unclaimed window -> http %{http_code}\n' \
  "$BASE/api/file/$FID/bars?resolution=1m&limit=5"
head -c 200 /tmp/b120-gate | sed 's/^/  /'
echo

echo
echo "=== and with no window id at all ==="
curl -sS -b "$JAR" -o /tmp/b120-gate2 -w '  no window id     -> http %{http_code}\n' \
  "$BASE/api/file/$FID/bars?resolution=1m&limit=5"
head -c 200 /tmp/b120-gate2 | sed 's/^/  /'
echo

echo
echo "=== cleanup ==="
docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "DELETE FROM chart_window_presence WHERE client_id LIKE 'b120verify%';" | sed 's/^/  /'
