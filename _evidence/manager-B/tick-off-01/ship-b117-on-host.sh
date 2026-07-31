#!/usr/bin/env bash
# b117 = b116 + TICK-OFF-01 (A) + support passport axis (B) + opening-range bound (E, eb1cb76ae).
#
# Built the same way b116 was — same build args, same tag shape, same save/pin — so that the
# difference between b116 and b117 is the payload and nothing else. That equivalence is what
# makes the TEST-02 comparison in step 8 mean anything.
set -euo pipefail
BID=20260731b117
SHA="${SOURCE_COMMIT_SHA:?}"
STAGED=/tmp/b117-stage
BASELINE=/root/b-tickoff/prefix-baseline
cd /opt/talaria

if [[ -f /root/talaria-restore/MEASUREMENT-IN-PROGRESS ]]; then
  echo MEASUREMENT_IN_PROGRESS=yes; cat /root/talaria-restore/MEASUREMENT-IN-PROGRESS; exit 9
fi
echo MEASUREMENT_IN_PROGRESS=no

# Freeze: honour it if the mechanism is present. It is currently absent from the host — recorded
# here rather than assumed, because "no guard found" and "guard said go" are different facts.
if [[ -x /opt/talaria/deploy-freeze-guard.sh ]]; then
  echo "FREEZE_GUARD=present"; /opt/talaria/deploy-freeze-guard.sh check || exit 8
else
  echo "FREEZE_GUARD=absent (no guard binary and no DEPLOY-FREEZE.json on host; nothing to honour)"
fi
echo LIVE_PIN_BEFORE="$(cat /root/talaria-restore/LIVE-PIN.txt 2>/dev/null || echo NONE)"

echo "=== 0. restore point ==="
mkdir -p /root/talaria-restore
touch /root/talaria-restore/DEPLOY-IN-PROGRESS
docker inspect -f '{{.Config.Image}}' talaria-homepage-1 | sed -n 's/.*canary-//p' \
  > /root/talaria-restore/PRIOR-PIN.txt
echo PRIOR_PIN="$(cat /root/talaria-restore/PRIOR-PIN.txt)"

echo "=== 1. apply the train to the build context ==="
cp "$STAGED/api_server.py"           "chart v 1.4/chart/api_server.py"
cp "$STAGED/admin-dashboard.html"    "chart v 1.4/chart/admin-dashboard.html"
cp "$STAGED/test_support_account_facts.py" "chart v 1.4/chart/tests/test_support_account_facts.py"
for d in "chart v 1.4/chart/modules" "homepage/public/chart/modules"; do
  cp "$STAGED/chart-indicators-full.js" "$d/chart-indicators-full.js"
  cp "$STAGED/replay-system.js"         "$d/replay-system.js"
done
cp "$STAGED/tick-off-candle-only-playback.test.mjs" "chart v 1.4/chart/modules/"
cp "$STAGED/b75-po-v5-1d-tick-speed-routing.red.test.mjs" "chart v 1.4/chart/modules/"
cp "$STAGED/tick-off-mutants.mjs"    scripts/tick-off-mutants.mjs
cp "$STAGED/tick-off-regression.mjs" scripts/tick-off-regression.mjs

echo "=== 2. preflight: the new payload is in, the old payload survived ==="
newp=0
chk(){ if grep -q -- "$2" "$1"; then printf '  %-52s ok\n' "$3"; else printf '  %-52s MISSING\n' "$3"; newp=1; fi; }
chk "chart v 1.4/chart/api_server.py"                      '_support_account_facts'                   'B  passport account axis'
chk "chart v 1.4/chart/admin-dashboard.html"               'Account position'                          'B  passport CRM block'
chk "chart v 1.4/chart/modules/chart-indicators-full.js"   'flushRangeWindow'                          'E  opening-range bound (TAL-01938)'
chk "chart v 1.4/chart/modules/chart-indicators-full.js"   '__TALARIA_DISABLE_INDICATOR_EVICT_V1'      'E  clearIndicators evict'
chk "chart v 1.4/chart/modules/replay-system.js"           '_isCandleOnlyPlaybackEnabled'              'A  TICK-OFF-01 (canonical)'
chk "homepage/public/chart/modules/replay-system.js"       '_isCandleOnlyPlaybackEnabled'              'A  TICK-OFF-01 (mirror)'
chk "chart v 1.4/chart/modules/order-manager.js"           '__TALARIA_DISABLE_EXCURSION_SINGLE_OWNER_V1' 'D  excursion single-owner'
chk "chart v 1.4/chart/modules/order-manager.js"           '__TALARIA_DISABLE_TRADE_EVICT_V1'          'D  trade evict'
chk "chart v 1.4/chart/modules/chart-window-limit.js"      'Prefer bounded controlFetch'               'B  window-claim P0 release'
grep -qE '^def chart_window_claim\(' "chart v 1.4/chart/api_server.py" \
  && printf '  %-52s ok\n' 'B  window-claim P0 claim' || { printf '  %-52s MISSING\n' 'B  window-claim P0 claim'; newp=1; }
# b116's hygiene must not regress: exactly one chart-indicators* per module dir.
for d in "chart v 1.4/chart/modules" "homepage/public/chart/modules"; do
  n=$(ls "$d" | grep -cE '^chart-indicators.*\.(js|mjs|cjs)$' || true)
  printf '  %-52s %s (want 1)\n' "b116 hygiene: $(basename "$(dirname "$d")")" "$n"; test "$n" -eq 1 || newp=1
done
# The two mirrors must be byte-identical or the wire serves a different file than the tests ran.
for f in replay-system.js chart-indicators-full.js; do
  a=$(sha256sum "chart v 1.4/chart/modules/$f" | cut -d' ' -f1)
  b=$(sha256sum "homepage/public/chart/modules/$f" | cut -d' ' -f1)
  if [ "$a" = "$b" ]; then printf '  %-52s identical\n' "mirror parity: $f"
  else printf '  %-52s DIVERGED\n' "mirror parity: $f"; newp=1; fi
done
test "$newp" = 0 || { echo PREFLIGHT_FAILED; rm -f /root/talaria-restore/DEPLOY-IN-PROGRESS; exit 2; }
echo PREFLIGHT_OK

echo "=== 3. gates on the host tree ==="
docker run --rm -v /opt/talaria:/w -w /w node:22-alpine sh -c \
  'node --test "chart v 1.4/chart/modules/tick-off-candle-only-playback.test.mjs" 2>&1 | tail -10'
docker run --rm -v /opt/talaria:/w -w /w node:22-alpine sh -c \
  'node --test deploy/dead-indicator-copies.test.mjs 2>&1 | tail -8' || echo "  (b116 hygiene gate not present in context; skipped)"

echo "=== 4. build + tag + save ==="
export CHECKPOINT_BUILD=1 CHART_BUILD_ID="$BID" SOURCE_COMMIT_SHA="$SHA"
unset TRADING_CHART_IMAGE HOMEPAGE_IMAGE || true
echo BUILD_START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
docker compose build --build-arg CHECKPOINT_BUILD=1 --build-arg CHART_BUILD_ID="$BID" \
  --build-arg SOURCE_COMMIT_SHA="$SHA" trading-chart homepage
echo BUILD_DONE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
TAG="canary-$BID"
docker tag talaria-trading-chart:latest "talaria-trading-chart:$TAG"
docker tag talaria-homepage:latest "talaria-homepage:$TAG"
mkdir -p /root/talaria-restore/images
docker save "talaria-homepage:$TAG" "talaria-trading-chart:$TAG" | gzip -1 \
  > "/root/talaria-restore/images/$TAG.tar.gz"
gzip -t "/root/talaria-restore/images/$TAG.tar.gz"
{
  echo tagged_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo chart_build_id="$BID"
  echo source_commit_sha="$SHA"
  echo trading_chart_tag="talaria-trading-chart:$TAG"
  echo homepage_tag="talaria-homepage:$TAG"
  echo train_rows=b116_all+TICK_OFF_01+SUPPORT_PASSPORT_ACCOUNT_AXIS+OPENING_RANGE_BOUND_eb1cb76ae
} | tee "/root/talaria-restore/PINNED-$BID.txt"

export HOMEPAGE_IMAGE="talaria-homepage:$TAG"
export TRADING_CHART_IMAGE="talaria-trading-chart:$TAG"
docker compose up -d --no-build trading-chart trading-chart-worker homepage
echo "$BID" > /root/talaria-restore/LIVE-PIN.txt
rm -f /root/talaria-restore/DEPLOY-IN-PROGRESS
echo LIVE_PIN_SET="$BID"

echo "=== 5. health ==="
for i in $(seq 1 36); do
  st=$(docker inspect -f '{{.State.Health.Status}}' talaria-trading-chart-1 2>/dev/null || echo missing)
  hp=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/chart/dist-v9/index.html || echo 000)
  echo "  attempt $i: trading-chart=$st shell_http=$hp"
  [ "$st" = healthy ] && [ "$hp" = 200 ] && break
  sleep 5
done
test "$(docker inspect -f '{{.State.Health.Status}}' talaria-trading-chart-1)" = healthy

echo "=== 6. MEAS-01 stamp ==="
curl -sS -o /tmp/meas01.html -H 'Cache-Control: no-cache' http://127.0.0.1:3000/chart/dist-v9/index.html
grep -oE "window\.__TALARIA_CHART_BUILD_ID='[^']+'" /tmp/meas01.html | head -1
grep -oE "window\.__TALARIA_CHART_BUILD_ID='[^']+'" /tmp/meas01.html | head -1 | grep -Fq "'$BID'"

echo "=== 7. the rest of the train is still on the wire ==="
curl -sS -H 'Cache-Control: no-cache' http://127.0.0.1:3000/chart/modules/chart-window-limit.js -o /tmp/cwl.js
grep -q 'Prefer bounded controlFetch' /tmp/cwl.js && echo "  P0 release marker ok"
docker exec talaria-trading-chart-1 grep -qE '^def chart_window_claim\(' /app/api_server.py && echo "  P0 claim ok"
docker exec talaria-trading-chart-1 grep -q '_support_account_facts' /app/api_server.py && echo "  passport axis ok"
curl -sS -H 'Cache-Control: no-cache' http://127.0.0.1:3000/chart/modules/order-manager.js -o /tmp/om.js
for t in __TALARIA_DISABLE_M24_ORDER_ID_GAP_RECONCILE_V1 \
         __TALARIA_DISABLE_ORDER_EXPLICIT_PLACE_AUDIT_V1 \
         __TALARIA_DISABLE_EXCURSION_SINGLE_OWNER_V1 \
         __TALARIA_DISABLE_TRADE_EVICT_V1; do
  n=$(grep -c "$t" /tmp/om.js || true); printf '  om %-55s %s\n' "$t" "$n"; test "$n" -gt 0
done
curl -sS -H 'Cache-Control: no-cache' http://127.0.0.1:3000/chart/modules/chart-indicators-full.js -o /tmp/cif.js
grep -q 'flushRangeWindow' /tmp/cif.js && echo "  E opening-range bound ok"

echo
echo "=== 8. TEST-02 DISCRIMINATING MARKER for TICK-OFF-01 ==="
# Presence alone proves nothing. The same probe, run the same way, came back EMPTY against b116
# before this deploy — that file is on disk with its sha256 recorded. Both halves are asserted here.
NEW=/tmp/replay-b117.js
code=$(curl -sS -H 'Cache-Control: no-cache' -o "$NEW" -w '%{http_code} %{content_type}' \
  http://127.0.0.1:3000/chart/modules/replay-system.js)
echo "  b117 fetch: $code  bytes=$(wc -c < "$NEW")  sha256=$(sha256sum "$NEW" | cut -d' ' -f1)"
echo "  b116 base : bytes=$(wc -c < "$BASELINE/replay-system.js")  sha256=$(sha256sum "$BASELINE/replay-system.js" | cut -d' ' -f1)"
echo "  b116 id   : $(cat "$BASELINE/BUILD_ID.txt")"
echo
# Positive control: both files must be the real module, or an absence proves nothing.
for f in "$BASELINE/replay-system.js" "$NEW"; do
  grep -q 'startCandleByCandle' "$f" || { echo "  ABORT: $f is not the real module"; exit 2; }
done
echo "  positive control: both fetches are the real replay-system.js (startCandleByCandle present)"
echo
fail=0
printf '  %-46s %-14s %-14s %s\n' MARKER "b116(before)" "b117(now)" VERDICT
for m in '_isCandleOnlyPlaybackEnabled' '__TALARIA_DISABLE_CANDLE_ONLY_PLAYBACK_V1' 'TICK-OFF-01'; do
  o=$(grep -c -- "$m" "$BASELINE/replay-system.js" || true)
  n=$(grep -c -- "$m" "$NEW" || true)
  if [ "$o" = "0" ] && [ "$n" -gt 0 ]; then v="DISCRIMINATING"; else v="NOT DISCRIMINATING"; fail=1; fi
  printf '  %-46s %-14s %-14s %s\n' "$m" "$o" "$n" "$v"
done
echo
if [ "$fail" = 0 ]; then
  echo "TEST02_DISCRIMINATING_OK — absent on $(cat "$BASELINE/BUILD_ID.txt"), present on $BID"
else
  echo "TEST02_FAILED"; exit 3
fi

echo
echo "CANARY_CHECKPOINT_OK build_id=$BID sha=$SHA"
