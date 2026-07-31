#!/usr/bin/env bash
# Standalone post-ship verification of b118. Independent of the ship script, because a deploy
# that grades itself is not evidence.
set -uo pipefail
BID=20260731b118
BASELINE=/root/b-m20j1/b117-baseline
OUT=/root/b-m20j1/b118
mkdir -p "$OUT"
fail=0

echo "=== 1. what is on the wire ==="
curl -sS -H 'Cache-Control: no-cache' -o /tmp/shell.html http://127.0.0.1:3000/chart/dist-v9/index.html
live=$(grep -oE "__TALARIA_CHART_BUILD_ID='[^']+'" /tmp/shell.html | head -1 | sed "s/.*='//;s/'//")
echo "  build id on the wire : $live"
echo "  LIVE-PIN.txt         : $(cat /root/talaria-restore/LIVE-PIN.txt 2>/dev/null)"
docker ps --format '{{.Names}} {{.Image}}' | grep -E 'homepage-1|trading-chart' | sed 's/^/    /'
[ "$live" = "$BID" ] || { echo "  MISMATCH: expected $BID"; fail=1; }

echo
echo "=== 2. TEST-02 DISCRIMINATING MARKER — M20-J1 ==="
echo "  Negative control was taken from the WIRE on b117, before this deploy."
echo
curl -sS -H 'Cache-Control: no-cache' -o "$OUT/order-manager.js" \
  http://127.0.0.1:3000/chart/modules/order-manager.js
echo "  b117 (before)  id=$(cat "$BASELINE/BUILD_ID.txt")  bytes=$(wc -c < "$BASELINE/order-manager.js")  sha256=$(sha256sum "$BASELINE/order-manager.js" | cut -c1-16)"
echo "  b118 (now)     id=$live  bytes=$(wc -c < "$OUT/order-manager.js")  sha256=$(sha256sum "$OUT/order-manager.js" | cut -c1-16)"
echo
for f in "$BASELINE/order-manager.js" "$OUT/order-manager.js"; do
  grep -qE 'updateJournalTab|closedPositions' "$f" || { echo "  ABORT: $f is not the real module"; exit 2; }
done
echo "  positive control: both fetches are the real order-manager.js"
echo
printf '  %-46s %-13s %-12s %s\n' MARKER 'b117 BEFORE' 'b118 NOW' VERDICT
printf '  %-46s %-13s %-12s %s\n' '----------------------------------------' '-----------' '----------' '-------'
for m in '_m20J1ThumbsEnabled' '__TALARIA_DISABLE_JOURNAL_SHOT_THUMBS_V1' 'M20-J1'; do
  o=$(grep -c -- "$m" "$BASELINE/order-manager.js" || true)
  n=$(grep -c -- "$m" "$OUT/order-manager.js" || true)
  if [ "$o" = "0" ] && [ "$n" -gt 0 ]; then v='DISCRIMINATING'; else v='NOT DISCRIMINATING'; fail=1; fi
  printf '  %-46s %-13s %-12s %s\n' "$m" "$o" "$n" "$v"
done

echo
echo "=== 3. served file matches the image (no cache in between) ==="
img=$(docker exec talaria-homepage-1 sha256sum /usr/share/nginx/html/chart/modules/order-manager.js 2>/dev/null | cut -d' ' -f1)
wir=$(sha256sum "$OUT/order-manager.js" | cut -d' ' -f1)
echo "  image: $img"
echo "  wire : $wir"
[ "$img" = "$wir" ] && echo "  identical" || { echo "  MISMATCH"; fail=1; }

echo
echo "=== 4. everything b117 carried is still on the wire ==="
curl -sS -H 'Cache-Control: no-cache' -o /tmp/rs.js  http://127.0.0.1:3000/chart/modules/replay-system.js
curl -sS -H 'Cache-Control: no-cache' -o /tmp/cwl.js http://127.0.0.1:3000/chart/modules/chart-window-limit.js
curl -sS -H 'Cache-Control: no-cache' -o /tmp/cif.js http://127.0.0.1:3000/chart/modules/chart-indicators-full.js
chk(){ n=$(grep -c -- "$2" "$1" || true); if [ "$n" -gt 0 ]; then printf '  %-48s ok (%s)\n' "$3" "$n"; else printf '  %-48s MISSING\n' "$3"; fail=1; fi; }
chk /tmp/rs.js  '_isCandleOnlyPlaybackEnabled'                    'A  TICK-OFF-01'
chk /tmp/cwl.js 'Prefer bounded controlFetch'                     'B  window-claim P0 release'
chk /tmp/cif.js 'flushRangeWindow'                                'E  opening-range bound'
chk /tmp/cif.js '__TALARIA_DISABLE_INDICATOR_EVICT_V1'            'E  clearIndicators evict'
chk "$OUT/order-manager.js" '__TALARIA_DISABLE_EXCURSION_SINGLE_OWNER_V1' 'D  excursion single-owner'
chk "$OUT/order-manager.js" '__TALARIA_DISABLE_TRADE_EVICT_V1'    'D  trade evict'
chk "$OUT/order-manager.js" '__TALARIA_DISABLE_M24_ORDER_ID_GAP_RECONCILE_V1' 'Rayan M24 gap reconcile'
chk "$OUT/order-manager.js" '__TALARIA_DISABLE_ORDER_EXPLICIT_PLACE_AUDIT_V1' 'Rayan explicit place audit'
docker exec talaria-trading-chart-1 grep -q '_support_account_facts' /app/api_server.py \
  && printf '  %-48s ok\n' 'B  support passport axis' || { printf '  %-48s MISSING\n' 'B  support passport axis'; fail=1; }

echo
echo "=== 5. health ==="
docker ps --format '{{.Names}} {{.Status}}' | grep -E 'trading-chart-1|homepage-1' | sed 's/^/  /'
n5=$(docker logs --since 10m talaria-homepage-1 2>&1 | awk '$9 ~ /^5/' | wc -l)
echo "  5xx in last 10m: $n5"
[ "$n5" -gt 0 ] && fail=1

echo
if [ "$fail" = 0 ]; then echo "B118_WIRE_OK"; else echo "B118_WIRE_PROBLEMS"; fi
exit "$fail"
