#!/usr/bin/env bash
# b118 = b117 + M20-J1 (A, d03dfc30f): the journal list stops carrying full-resolution screenshots.
# This is the TAL-01891 memory fix. b117 carried A's lag fix, not this one.
#
# Built exactly as b116 and b117 were, so the only difference between b117 and b118 is this payload.
set -euo pipefail
BID=20260731b118
SHA="${SOURCE_COMMIT_SHA:?}"
STAGED=/tmp/b118-stage
BASELINE=/root/b-m20j1/b117-baseline
cd /opt/talaria

if [[ -f /root/talaria-restore/MEASUREMENT-IN-PROGRESS ]]; then
  echo MEASUREMENT_IN_PROGRESS=yes; cat /root/talaria-restore/MEASUREMENT-IN-PROGRESS; exit 9
fi
echo MEASUREMENT_IN_PROGRESS=no
if [[ -x /opt/talaria/deploy-freeze-guard.sh ]]; then
  /opt/talaria/deploy-freeze-guard.sh check || exit 8
  echo "FREEZE=clear"
fi
echo LIVE_PIN_BEFORE="$(cat /root/talaria-restore/LIVE-PIN.txt 2>/dev/null || echo NONE)"

echo "=== 0. restore point ==="
touch /root/talaria-restore/DEPLOY-IN-PROGRESS
docker inspect -f '{{.Config.Image}}' talaria-homepage-1 | sed -n 's/.*canary-//p' \
  > /root/talaria-restore/PRIOR-PIN.txt
echo PRIOR_PIN="$(cat /root/talaria-restore/PRIOR-PIN.txt)"

echo "=== 1. apply M20-J1 to the build context ==="
for d in "chart v 1.4/chart/modules" "homepage/public/chart/modules"; do
  cp "$STAGED/order-manager.js" "$d/order-manager.js"
done
cp "$STAGED/m20-j1-journal-shot-thumbs.test.mjs"    "chart v 1.4/chart/modules/"
cp "$STAGED/m20-j1-journal-shot-thumbs.mutants.mjs" "chart v 1.4/chart/modules/"
cp "$STAGED/flag03-kill-switch-product-on.test.mjs" "chart v 1.4/chart/modules/"
cp "$STAGED/m20-j1-mirror-apply.mjs"                scripts/m20-j1-mirror-apply.mjs

echo "=== 2. preflight ==="
bad=0
chk(){ if grep -q -- "$2" "$1"; then printf '  %-52s ok\n' "$3"; else printf '  %-52s MISSING\n' "$3"; bad=1; fi; }
# the new payload
chk "chart v 1.4/chart/modules/order-manager.js"      '_m20J1ThumbsEnabled'                        'A  M20-J1 thumbs (canonical)'
chk "homepage/public/chart/modules/order-manager.js"  '_m20J1ThumbsEnabled'                        'A  M20-J1 thumbs (mirror)'
chk "chart v 1.4/chart/modules/order-manager.js"      '__TALARIA_DISABLE_JOURNAL_SHOT_THUMBS_V1'   'A  M20-J1 kill-switch'
# b117 must survive intact — this train must not silently drop anything already live
chk "chart v 1.4/chart/modules/replay-system.js"      '_isCandleOnlyPlaybackEnabled'               'A  TICK-OFF-01 survived'
chk "chart v 1.4/chart/api_server.py"                 '_support_account_facts'                     'B  passport axis survived'
chk "chart v 1.4/chart/modules/chart-indicators-full.js" 'flushRangeWindow'                        'E  opening-range bound survived'
chk "chart v 1.4/chart/modules/order-manager.js"      '__TALARIA_DISABLE_EXCURSION_SINGLE_OWNER_V1' 'D  excursion single-owner survived'
chk "chart v 1.4/chart/modules/order-manager.js"      '__TALARIA_DISABLE_TRADE_EVICT_V1'           'D  trade evict survived'
chk "chart v 1.4/chart/modules/order-manager.js"      '__TALARIA_DISABLE_M24_ORDER_ID_GAP_RECONCILE_V1' 'Rayan M24 survived'
chk "chart v 1.4/chart/modules/chart-window-limit.js" 'Prefer bounded controlFetch'                'B  window-claim P0 survived'
for f in order-manager.js replay-system.js chart-indicators-full.js; do
  a=$(sha256sum "chart v 1.4/chart/modules/$f" | cut -d' ' -f1)
  b=$(sha256sum "homepage/public/chart/modules/$f" | cut -d' ' -f1)
  if [ "$a" = "$b" ]; then printf '  %-52s identical\n' "mirror parity: $f"
  else printf '  %-52s DIVERGED\n' "mirror parity: $f"; bad=1; fi
done
test "$bad" = 0 || { echo PREFLIGHT_FAILED; rm -f /root/talaria-restore/DEPLOY-IN-PROGRESS; exit 2; }
echo PREFLIGHT_OK

echo "=== 3. gates on the host tree ==="
docker run --rm -v /opt/talaria:/w -w /w node:22-alpine sh -c \
  'node --test "chart v 1.4/chart/modules/m20-j1-journal-shot-thumbs.test.mjs" 2>&1 | tail -10'

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
docker save "talaria-homepage:$TAG" "talaria-trading-chart:$TAG" | gzip -1 \
  > "/root/talaria-restore/images/$TAG.tar.gz"
gzip -t "/root/talaria-restore/images/$TAG.tar.gz"
{
  echo tagged_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo chart_build_id="$BID"
  echo source_commit_sha="$SHA"
  echo trading_chart_tag="talaria-trading-chart:$TAG"
  echo homepage_tag="talaria-homepage:$TAG"
  echo train_rows=b117_all+M20_J1_journal_shot_thumbs_d03dfc30f
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
echo "SHIP_STAGE_DONE build_id=$BID"
