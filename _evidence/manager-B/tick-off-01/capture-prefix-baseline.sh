#!/usr/bin/env bash
# TEST-02 negative control for TICK-OFF-01, captured BEFORE the ship.
#
# "Present in this build" is not evidence. The claim only means something if the same probe,
# run the same way, comes back empty against a build that predates the fix. b116 is that build
# and it is on the wire right now — after the ship it is gone and this becomes unprovable.
# So the negative control is taken first, and it is taken from the WIRE, not from an image or
# a source tree.
set -uo pipefail
BASE=http://127.0.0.1:3000
OUT=/root/b-tickoff/prefix-baseline
mkdir -p "$OUT"
. /root/.talaria-test-env

uid=$(docker exec talaria-db-1 psql -U talaria -d talaria -At -c "SELECT id FROM users WHERE email='$TEST_EMAIL'")
sid=$(docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "SELECT id FROM user_sessions WHERE user_id=$uid ORDER BY last_active_at DESC NULLS LAST LIMIT 1")
CN=$(docker exec talaria-trading-chart-1 sh -c 'printf %s "${SESSION_COOKIE_NAME:-session_id}"')

echo "=== build on the wire right now ==="
BID=$(curl -sS "$BASE/chart/dist-v9/index.html" | grep -oE "__TALARIA_CHART_BUILD_ID='[^']+'" | head -1 | sed "s/.*='//;s/'//")
echo "  $BID"
echo "$BID" > "$OUT/BUILD_ID.txt"

echo
echo "=== fetch the served replay-system.js ==="
code=$(curl -sS -b "$CN=$sid" -L "$BASE/chart/modules/replay-system.js" \
  -o "$OUT/replay-system.js" -w '%{http_code} %{content_type}')
echo "  http/type: $code"
echo "  bytes    : $(wc -c < "$OUT/replay-system.js")"
echo "  sha256   : $(sha256sum "$OUT/replay-system.js" | cut -d' ' -f1)"

# Positive control: prove the probe is reading real JS and not a login page.
if grep -q 'application/javascript' <<<"$code" && grep -qE 'startCandleByCandle|playbackMode' "$OUT/replay-system.js"; then
  echo "  ok: this is the real module (startCandleByCandle/playbackMode present)"
else
  echo "  INSTRUMENT FAILED: not the module — an absence proved against a login page is worthless"
  head -c 200 "$OUT/replay-system.js"; echo
  exit 2
fi

echo
echo "=== the three markers must ALL be absent on $BID ==="
fail=0
for m in '_isCandleOnlyPlaybackEnabled' '__TALARIA_DISABLE_CANDLE_ONLY_PLAYBACK_V1' 'TICK-OFF-01'; do
  n=$(grep -c -- "$m" "$OUT/replay-system.js" || true)
  if [ "$n" = "0" ]; then printf '  %-46s absent (0)  ok\n' "$m"
  else printf '  %-46s PRESENT (%s)  NEGATIVE CONTROL BROKEN\n' "$m" "$n"; fail=1; fi
done

echo
echo "=== behavioural baseline: does tick mode still exist on $BID? ==="
grep -c 'startTickAnimation' "$OUT/replay-system.js" | sed 's/^/  startTickAnimation occurrences: /'
grep -n 'getPlaybackMode()' "$OUT/replay-system.js" | head -3 | sed 's/^/  /'

echo
if [ "$fail" = 0 ]; then echo "PREFIX_BASELINE_OK  ($BID has no TICK-OFF-01)"; else echo PREFIX_BASELINE_BROKEN; fi
exit "$fail"
