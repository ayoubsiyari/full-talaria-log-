#!/usr/bin/env bash
# Standalone post-ship verification of b117. Deliberately independent of the ship script:
# a deploy that grades itself is not evidence, and I lost the ship script's own output anyway.
set -uo pipefail
BID=20260731b117
BASELINE=/root/b-tickoff/prefix-baseline
OUT=/root/b-tickoff/b117
mkdir -p "$OUT"
fail=0

echo "=== 1. what is actually on the wire ==="
curl -sS -H 'Cache-Control: no-cache' -o /tmp/shell.html http://127.0.0.1:3000/chart/dist-v9/index.html
live=$(grep -oE "__TALARIA_CHART_BUILD_ID='[^']+'" /tmp/shell.html | head -1 | sed "s/.*='//;s/'//")
echo "  build id on the wire : $live"
echo "  LIVE-PIN.txt         : $(cat /root/talaria-restore/LIVE-PIN.txt 2>/dev/null)"
echo "  images running       :"
docker ps --format '{{.Names}} {{.Image}}' | grep -E 'homepage-1|trading-chart' | sed 's/^/    /'
[ "$live" = "$BID" ] || { echo "  MISMATCH: expected $BID"; fail=1; }

echo
echo "=== 2. TEST-02 DISCRIMINATING MARKER — TICK-OFF-01 ==="
echo "  The negative control was taken from the WIRE on b116 BEFORE this deploy, not from a"
echo "  source tree and not after the fact. Both halves are asserted below."
echo
curl -sS -H 'Cache-Control: no-cache' -o "$OUT/replay-system.js" \
  http://127.0.0.1:3000/chart/modules/replay-system.js
echo "  b116 (before)  id=$(cat "$BASELINE/BUILD_ID.txt")  bytes=$(wc -c < "$BASELINE/replay-system.js")  sha256=$(sha256sum "$BASELINE/replay-system.js" | cut -c1-16)"
echo "  b117 (now)     id=$live  bytes=$(wc -c < "$OUT/replay-system.js")  sha256=$(sha256sum "$OUT/replay-system.js" | cut -c1-16)"
echo
# Positive control on BOTH files: an absence proved against a login page would be worthless.
for f in "$BASELINE/replay-system.js" "$OUT/replay-system.js"; do
  grep -q 'startCandleByCandle' "$f" || { echo "  ABORT: $(basename "$f") is not the real module"; exit 2; }
done
echo "  positive control: both fetches are the real replay-system.js"
echo
printf '  %-46s %-13s %-12s %s\n' MARKER 'b116 BEFORE' 'b117 NOW' VERDICT
printf '  %-46s %-13s %-12s %s\n' '----------------------------------------' '-----------' '----------' '-------'
for m in '_isCandleOnlyPlaybackEnabled' '__TALARIA_DISABLE_CANDLE_ONLY_PLAYBACK_V1' 'TICK-OFF-01'; do
  o=$(grep -c -- "$m" "$BASELINE/replay-system.js" || true)
  n=$(grep -c -- "$m" "$OUT/replay-system.js" || true)
  if [ "$o" = "0" ] && [ "$n" -gt 0 ]; then v='DISCRIMINATING'; else v='NOT DISCRIMINATING'; fail=1; fi
  printf '  %-46s %-13s %-12s %s\n' "$m" "$o" "$n" "$v"
done

echo
echo "=== 3. mirror served by homepage matches the canonical module ==="
docker exec talaria-homepage-1 sha256sum /usr/share/nginx/html/chart/modules/replay-system.js 2>/dev/null | sed 's/^/    image: /'
echo "    wire : $(sha256sum "$OUT/replay-system.js" | cut -d' ' -f1)  /chart/modules/replay-system.js"

echo
echo "=== 4. the rest of the train on the wire ==="
curl -sS -H 'Cache-Control: no-cache' -o /tmp/om.js  http://127.0.0.1:3000/chart/modules/order-manager.js
curl -sS -H 'Cache-Control: no-cache' -o /tmp/cwl.js http://127.0.0.1:3000/chart/modules/chart-window-limit.js
curl -sS -H 'Cache-Control: no-cache' -o /tmp/cif.js http://127.0.0.1:3000/chart/modules/chart-indicators-full.js
chk(){ n=$(grep -c -- "$2" "$1" || true); if [ "$n" -gt 0 ]; then printf '  %-46s ok (%s)\n' "$3" "$n"; else printf '  %-46s MISSING\n' "$3"; fail=1; fi; }
chk /tmp/cwl.js 'Prefer bounded controlFetch'                  'B  window-claim P0 release'
chk /tmp/om.js  '__TALARIA_DISABLE_EXCURSION_SINGLE_OWNER_V1'  'D  excursion single-owner'
chk /tmp/om.js  '__TALARIA_DISABLE_TRADE_EVICT_V1'             'D  trade evict'
chk /tmp/om.js  '__TALARIA_DISABLE_M24_ORDER_ID_GAP_RECONCILE_V1' 'Rayan  M24 order-id gap reconcile'
chk /tmp/om.js  '__TALARIA_DISABLE_ORDER_EXPLICIT_PLACE_AUDIT_V1' 'Rayan  explicit place audit'
chk /tmp/cif.js 'flushRangeWindow'                             'E  opening-range bound (eb1cb76ae)'
chk /tmp/cif.js '__TALARIA_DISABLE_INDICATOR_EVICT_V1'         'E  clearIndicators evict'
if docker exec talaria-trading-chart-1 grep -q '_support_account_facts' /app/api_server.py; then
  printf '  %-46s ok\n' 'B  support passport account axis'
else printf '  %-46s MISSING\n' 'B  support passport account axis'; fail=1; fi
if docker exec talaria-trading-chart-1 grep -qE '^def chart_window_claim\(' /app/api_server.py; then
  printf '  %-46s ok\n' 'B  window-claim P0 claim endpoint'
else printf '  %-46s MISSING\n' 'B  window-claim P0 claim endpoint'; fail=1; fi

echo
echo "=== 5. b116 hygiene did not regress ==="
for f in chart-indicators.js chart-indicators-readable.js chart-indicators-with-hma.js; do
  if docker exec talaria-homepage-1 test ! -e "/usr/share/nginx/html/chart/modules/$f"; then
    printf '  %-46s still absent\n' "$f"
  else printf '  %-46s REGRESSED (back in image)\n' "$f"; fail=1; fi
done

echo
if [ "$fail" = 0 ]; then echo "B117_WIRE_OK"; else echo "B117_WIRE_PROBLEMS"; fi
exit "$fail"
