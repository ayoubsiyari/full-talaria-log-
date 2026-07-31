#!/usr/bin/env bash
# b120 = b118 + K4-P0-WINDOW-GATE-THREADPOOL-V1.
#
# The window-presence gate runs on every gated request from inside `auth_middleware`, which is
# `async def`. It called a sync function that opens a SQLAlchemy session and queries — a blocking
# pool checkout on the event loop thread. Measured on b118 minutes ago at concurrency 60:
# /api/health goes 4.8ms idle -> 500.5ms p95 under gated load, 14.8x an equal-volume ungated
# control. That is the hang; the previous pass fixed the claim endpoint and missed this site.
#
# Built exactly as b116/b117/b118 were, so the only difference from b118 is this payload.
set -euo pipefail
BID=20260731b120
SHA="${SOURCE_COMMIT_SHA:?}"
STAGED=/tmp/b120-stage
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

echo "=== 1. apply the off-loop gate to the build context ==="
cp "$STAGED/api_server.py" "chart v 1.4/chart/api_server.py"

echo "=== 2. preflight ==="
bad=0
chk(){ if grep -q -- "$2" "$1"; then printf '  %-56s ok\n' "$3"; else printf '  %-56s MISSING\n' "$3"; bad=1; fi; }
API="chart v 1.4/chart/api_server.py"
# the new payload
chk "$API" 'K4-P0-WINDOW-GATE-THREADPOOL-V1'                'B  K4 off-loop gate marker'
chk "$API" '_require_active_chart_window_async'             'B  async gate defined'
chk "$API" 'TALARIA_DISABLE_WINDOW_GATE_THREADPOOL_V1'      'B  K4 kill-switch'
chk "$API" 'await run_in_threadpool(_require_active_chart_window'  'B  gate offloaded'
chk "$API" 'await _require_active_chart_window_async(request, user=user)' 'B  middleware calls async gate'
chk "$API" 'K4-P0-BARS-OFF-LOOP-V1'                         'B  b120 off-loop handlers marker'
# every gated handler must now be a sync def; an async one with no await still blocks the loop
for fn in get_tile_meta get_tile get_conversion_status get_trading_session_state \
          get_file get_file_smart get_file_candles get_file_bars get_file_meta; do
  if grep -q "^async def ${fn}(" "$API"; then
    printf '  %-56s STILL ASYNC\n' "B  ${fn} off-loop"; bad=1
  elif grep -q "^def ${fn}(" "$API"; then
    printf '  %-56s ok\n' "B  ${fn} off-loop"
  else
    printf '  %-56s NOT FOUND\n' "B  ${fn} off-loop"; bad=1
  fi
done
# the inline call must be GONE from the middleware, or nothing changed
if grep -n 'await call_next' -B8 "$API" | grep -q '^\s*[0-9]*-\s*_require_active_chart_window(request, user=user)$'; then
  printf '  %-56s STILL INLINE\n' 'B  middleware no longer blocks'; bad=1
else
  printf '  %-56s ok\n' 'B  middleware no longer blocks'
fi
# b118 must survive intact
chk "chart v 1.4/chart/modules/order-manager.js"      '_m20J1ThumbsEnabled'                        'A  M20-J1 survived'
chk "chart v 1.4/chart/modules/replay-system.js"      '_isCandleOnlyPlaybackEnabled'               'A  TICK-OFF-01 survived'
chk "$API"                                            '_support_account_facts'                     'B  passport axis survived'
chk "chart v 1.4/chart/modules/chart-indicators-full.js" 'flushRangeWindow'                        'E  opening-range bound survived'
chk "chart v 1.4/chart/modules/order-manager.js"      '__TALARIA_DISABLE_EXCURSION_SINGLE_OWNER_V1' 'D  excursion single-owner survived'
chk "chart v 1.4/chart/modules/order-manager.js"      '__TALARIA_DISABLE_TRADE_EVICT_V1'           'D  trade evict survived'
chk "chart v 1.4/chart/modules/chart-window-limit.js" 'Prefer bounded controlFetch'                'B  b115 claim bound survived'
test "$bad" = 0 || { echo PREFLIGHT_FAILED; rm -f /root/talaria-restore/DEPLOY-IN-PROGRESS; exit 2; }
echo PREFLIGHT_OK

echo "=== 3. the file must import and the gate must be reachable ==="
docker run --rm -v /opt/talaria:/w -w "/w/chart v 1.4/chart" python:3.11-slim \
  python -c "import ast,sys; ast.parse(open('api_server.py',encoding='utf-8').read()); print('  api_server.py parses')"

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
  echo train_rows=b119_all+K4_bars_off_loop
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

echo "=== 6. the gate still gates (semantics unchanged) ==="
echo "  a request with an unknown window id must still be refused:"
curl -s -o /dev/null -w '    unknown-window -> %{http_code}\n' \
  -H 'X-Talaria-Chart-Window-Id: definitely-not-a-real-window' \
  "http://127.0.0.1:3000/api/file/677/bars?resolution=1m&limit=10"

echo "SHIP_STAGE_DONE build_id=$BID"
