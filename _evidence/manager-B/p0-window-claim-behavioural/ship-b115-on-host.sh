#!/usr/bin/env bash
# Ship b115 = b114 train + P0 window-claim fix baked into the image.
# Build context /opt/talaria is already the b114 tree; only the P0 files are patched in.
set -euo pipefail
BID=20260730b115
SHA="${SOURCE_COMMIT_SHA:?}"
STAGED=/tmp/p0-hotfix
cd /opt/talaria

if [[ -f /root/talaria-restore/MEASUREMENT-IN-PROGRESS ]]; then
  echo MEASUREMENT_IN_PROGRESS=yes; cat /root/talaria-restore/MEASUREMENT-IN-PROGRESS; exit 9
fi
echo MEASUREMENT_IN_PROGRESS=no
echo LIVE_PIN_BEFORE="$(cat /root/talaria-restore/LIVE-PIN.txt 2>/dev/null || echo NONE)"

echo "=== 0. restore point ==="
mkdir -p /root/talaria-restore
touch /root/talaria-restore/DEPLOY-IN-PROGRESS
RP="/root/talaria-restore/canary-${BID}-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$RP"
docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' > "$RP/docker-ps.txt"
docker inspect -f '{{.Config.Image}}' talaria-homepage-1 | sed -n 's/.*canary-//p' \
  > /root/talaria-restore/PRIOR-PIN.txt
echo PRIOR_PIN="$(cat /root/talaria-restore/PRIOR-PIN.txt)"

echo "=== 1. patch P0 files into the build context ==="
cp "$STAGED/api_server.py"          "chart v 1.4/chart/api_server.py"
cp "$STAGED/chart-window-limit.js"  "chart v 1.4/chart/modules/chart-window-limit.js"
cp "$STAGED/chart-window-limit.js"  "homepage/public/chart/modules/chart-window-limit.js"

echo "=== 2. preflight: P0 fix + full b114 train present in the context ==="
CWL="chart v 1.4/chart/modules/chart-window-limit.js"
API="chart v 1.4/chart/api_server.py"
OM="chart v 1.4/chart/modules/order-manager.js"
IND="chart v 1.4/chart/modules/chart-indicators-full.js"
TR="chart v 1.4/talaria-design/src/orderManagerTradeRows.js"

cmp -s "$CWL" homepage/public/chart/modules/chart-window-limit.js || { echo ABORT_MIRROR; exit 2; }
grep -q 'Prefer bounded controlFetch' "$CWL" || { echo ABORT_RELEASE_FIX; exit 2; }
grep -qE '^def chart_window_claim\(' "$API" || { echo ABORT_CLAIM_SYNC; exit 2; }
grep -q 'run_in_threadpool(_patch_trading_session_state_db)' "$API" || { echo ABORT_THREADPOOL; exit 2; }
grep -q '_set_local_lock_timeout' "$API" || { echo ABORT_LOCK_TIMEOUT; exit 2; }
python3 -c "import ast,sys; ast.parse(open('$API',encoding='utf-8').read()); print('  api_server AST OK')"

for t in __TALARIA_DISABLE_M24_ORDER_ID_GAP_RECONCILE_V1 \
         __TALARIA_DISABLE_ORDER_EXPLICIT_PLACE_AUDIT_V1 \
         __TALARIA_DISABLE_ORDER_PAIR_SWITCH_VISUAL_REBIND_V1 \
         __TALARIA_DISABLE_EXCURSION_SINGLE_OWNER_V1 \
         __TALARIA_DISABLE_TRADE_EVICT_V1; do
  n=$(grep -c "$t" "$OM" || true); printf '  %-55s order-manager=%s\n' "$t" "$n"; test "$n" -gt 0
done
n=$(grep -c '__TALARIA_DISABLE_INDICATOR_EVICT_V1' "$IND" || true)
printf '  %-55s indicators=%s\n' '__TALARIA_DISABLE_INDICATOR_EVICT_V1' "$n"; test "$n" -gt 0
n=$(grep -c '__TALARIA_DISABLE_TRADE_DURATION_NORM_V1' "$TR" || true)
printf '  %-55s tradeRows=%s\n' '__TALARIA_DISABLE_TRADE_DURATION_NORM_V1' "$n"; test "$n" -gt 0
cmp -s "$OM"  homepage/public/chart/modules/order-manager.js
cmp -s "$IND" homepage/public/chart/modules/chart-indicators-full.js
echo PREFLIGHT_OK

echo "=== 3. GATE-01 on the host tree ==="
docker run --rm -v /opt/talaria:/w -w /w node:22-alpine \
  node --test "chart v 1.4/chart/modules/window-control-fetch-timeout.test.mjs" 2>&1 | tail -8
docker run --rm -v /opt/talaria:/w -w /w node:22-alpine \
  node --test deploy/event-loop-row-lock-ratchet.test.mjs deploy/event-loop-row-lock.test.mjs 2>&1 | tail -8

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
  echo train_rows=Rayan8_gap+place_audit,TAL-01807b,TAL-01896,EXCURSION-SINGLE-OWNER,TRADE-EVICT,INDICATOR-EVICT,P0-WINDOW-CLAIM
} | tee "/root/talaria-restore/PINNED-$BID.txt"

export HOMEPAGE_IMAGE="talaria-homepage:$TAG"
export TRADING_CHART_IMAGE="talaria-trading-chart:$TAG"
docker compose up -d --no-build trading-chart trading-chart-worker homepage
echo "$BID" > /root/talaria-restore/LIVE-PIN.txt
rm -f /root/talaria-restore/DEPLOY-IN-PROGRESS
echo LIVE_PIN_SET="$BID"
if [ -x /root/talaria-restore/canary-image-retention.sh ]; then
  /root/talaria-restore/canary-image-retention.sh --apply || echo RETENTION_NONFATAL_FAIL
fi

echo "=== 5. health ==="
for i in $(seq 1 36); do
  st=$(docker inspect -f '{{.State.Health.Status}}' talaria-trading-chart-1 2>/dev/null || echo missing)
  hp=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/chart/dist-v9/index.html || echo 000)
  echo "  attempt $i: trading-chart=$st shell_http=$hp"
  [ "$st" = healthy ] && [ "$hp" = 200 ] && break
  sleep 5
done
test "$(docker inspect -f '{{.State.Health.Status}}' talaria-trading-chart-1)" = healthy

echo "=== 6. MEAS-01 stamp from the running page ==="
curl -sS -o /tmp/meas01.html -H 'Cache-Control: no-cache' http://127.0.0.1:3000/chart/dist-v9/index.html
grep -oE "window\.__TALARIA_CHART_BUILD_ID='[^']+'" /tmp/meas01.html | head -1
grep -oE "window\.__TALARIA_CHART_BUILD_ID='[^']+'" /tmp/meas01.html | head -1 | grep -Fq "'$BID'"
echo stamp_v_refs="$(grep -cE "\?v=$BID" /tmp/meas01.html || true)"
for c in talaria-homepage-1 talaria-trading-chart-1 talaria-trading-chart-worker-1; do
  img=$(docker inspect -f '{{.Config.Image}}' "$c"); echo "  $c=$img"
  echo "$img" | grep -Fq "canary-$BID"
done

echo "=== 7. train payload + P0 on the wire over HTTP ==="
curl -sS -H 'Cache-Control: no-cache' http://127.0.0.1:3000/chart/modules/order-manager.js -o /tmp/om.js
curl -sS -H 'Cache-Control: no-cache' http://127.0.0.1:3000/chart/modules/chart-indicators-full.js -o /tmp/ind.js
curl -sS -H 'Cache-Control: no-cache' http://127.0.0.1:3000/chart/modules/chart-window-limit.js -o /tmp/cwl.js
for t in __TALARIA_DISABLE_M24_ORDER_ID_GAP_RECONCILE_V1 \
         __TALARIA_DISABLE_ORDER_EXPLICIT_PLACE_AUDIT_V1 \
         __TALARIA_DISABLE_ORDER_PAIR_SWITCH_VISUAL_REBIND_V1 \
         __TALARIA_DISABLE_EXCURSION_SINGLE_OWNER_V1 \
         __TALARIA_DISABLE_TRADE_EVICT_V1; do
  n=$(grep -c "$t" /tmp/om.js || true); printf '  HTTP om %-55s %s\n' "$t" "$n"; test "$n" -gt 0
done
n=$(grep -c '__TALARIA_DISABLE_INDICATOR_EVICT_V1' /tmp/ind.js || true)
printf '  HTTP ind %-55s %s\n' '__TALARIA_DISABLE_INDICATOR_EVICT_V1' "$n"; test "$n" -gt 0
n=$(grep -c '_evictClearedIndicatorSettingsV1' /tmp/ind.js || true)
printf '  HTTP ind %-55s %s\n' '_evictClearedIndicatorSettingsV1' "$n"; test "$n" -gt 0
HIT=$(docker exec talaria-homepage-1 sh -c "grep -R -l __TALARIA_DISABLE_TRADE_DURATION_NORM_V1 /usr/share/nginx/html/chart/dist-v9 2>/dev/null | head -1")
REL=${HIT#/usr/share/nginx/html}
curl -sS -H 'Cache-Control: no-cache' "http://127.0.0.1:3000$REL" -o /tmp/tal.js
n=$(grep -c '__TALARIA_DISABLE_TRADE_DURATION_NORM_V1' /tmp/tal.js || true)
printf '  HTTP %s TRADE_DURATION_NORM=%s\n' "$REL" "$n"; test "$n" -gt 0
echo "  HTTP cwl bytes=$(wc -c < /tmp/cwl.js)"
n=$(grep -c 'Prefer bounded controlFetch' /tmp/cwl.js || true)
printf '  HTTP cwl release-via-controlFetch=%s\n' "$n"; test "$n" -gt 0
n=$(grep -c 'CONTROL_TIMEOUT_MS' /tmp/cwl.js || true)
printf '  HTTP cwl CONTROL_TIMEOUT_MS=%s\n' "$n"; test "$n" -gt 0
docker exec talaria-trading-chart-1 grep -qE '^def chart_window_claim\(' /app/api_server.py
docker exec talaria-trading-chart-1 grep -q 'run_in_threadpool(_patch_trading_session_state_db)' /app/api_server.py
echo "  IMAGE carries claim=sync-def, session-state=threadpool"
echo HTTP_WIRE_OK

echo "CANARY_CHECKPOINT_OK build_id=$BID sha=$SHA"
