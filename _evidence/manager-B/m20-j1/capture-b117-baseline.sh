#!/usr/bin/env bash
# TEST-02 negative control for M20-J1, captured from the WIRE while b117 is still live.
# Taken before the b118 deploy for the same reason as last time: afterwards b117 is gone and
# "provably absent from a build predating the fix" stops being provable.
set -uo pipefail
BASE=http://127.0.0.1:3000
OUT=/root/b-m20j1/b117-baseline
mkdir -p "$OUT"

echo "=== build on the wire right now ==="
BID=$(curl -sS "$BASE/chart/dist-v9/index.html" | grep -oE "__TALARIA_CHART_BUILD_ID='[^']+'" | head -1 | sed "s/.*='//;s/'//")
echo "  $BID"
echo "$BID" > "$OUT/BUILD_ID.txt"
[ "$BID" = "20260731b117" ] || { echo "  UNEXPECTED: baseline must be taken on b117"; exit 2; }

echo
echo "=== fetch the served order-manager.js ==="
code=$(curl -sS -H 'Cache-Control: no-cache' "$BASE/chart/modules/order-manager.js" \
  -o "$OUT/order-manager.js" -w '%{http_code} %{content_type}')
echo "  http/type: $code"
echo "  bytes    : $(wc -c < "$OUT/order-manager.js")"
echo "  sha256   : $(sha256sum "$OUT/order-manager.js" | cut -d' ' -f1)"

# Positive control: an absence proved against a login page or an error body is not an absence.
if grep -qE 'updateJournalTab|closedPositions' "$OUT/order-manager.js"; then
  echo "  ok: this is the real module (updateJournalTab/closedPositions present)"
else
  echo "  INSTRUMENT FAILED: not the module"; head -c 200 "$OUT/order-manager.js"; exit 2
fi

echo
echo "=== the three M20-J1 markers must ALL be absent on $BID ==="
fail=0
for m in '_m20J1ThumbsEnabled' '__TALARIA_DISABLE_JOURNAL_SHOT_THUMBS_V1' 'M20-J1'; do
  n=$(grep -c -- "$m" "$OUT/order-manager.js" || true)
  if [ "$n" = "0" ]; then printf '  %-46s absent (0)  ok\n' "$m"
  else printf '  %-46s PRESENT (%s)  NEGATIVE CONTROL BROKEN\n' "$m" "$n"; fail=1; fi
done

echo
echo "=== b117 behavioural baseline: journal rows still carry full-resolution sources ==="
grep -c 'entryScreenshot' "$OUT/order-manager.js" | sed 's/^/  entryScreenshot references: /'
grep -n 'height:60px' "$OUT/order-manager.js" | head -2 | sed 's/^/  /'

echo
if [ "$fail" = 0 ]; then echo "B117_BASELINE_OK ($BID has no M20-J1)"; else echo B117_BASELINE_BROKEN; fi
exit "$fail"
