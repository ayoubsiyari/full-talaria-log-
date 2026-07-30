#!/usr/bin/env bash
# Ship train b114: Rayan #8 (gap+place-audit), TAL-01807b visual-rebind, TAL-01896,
# EXCURSION-SINGLE-OWNER-V1, TRADE-EVICT-V1, INDICATOR-EVICT / clearIndicators.
set -euo pipefail
ROOT="/mnt/c/Users/user/Desktop/talaria1/manager-b-plan3"
HOST=31.97.192.82
PORT=443
CHART_BUILD_ID=20260730b114
SOURCE_COMMIT_SHA="$(tr -d '\r\n' <"$ROOT/docs/plan3/evidence/B-M4/release/observations/.ship-tip-sha.txt")"
TAR="$ROOT/.scratch-canary-checkpoint.tar"
SSH=(ssh -p "$PORT" -o BatchMode=yes -o ConnectTimeout=30 -o StrictHostKeyChecking=accept-new)
SCP=(scp -P "$PORT" -o BatchMode=yes -o ConnectTimeout=30 -o StrictHostKeyChecking=accept-new)
OBS="$ROOT/docs/plan3/evidence/B-M4/release/observations"
LOG="$OBS/b114-ship.log"
exec > >(tee "$LOG") 2>&1
echo "=== CANARY KEY-AUTH SHIP === build_id=$CHART_BUILD_ID sha=$SOURCE_COMMIT_SHA"
test -f "$TAR"
test -n "$SOURCE_COMMIT_SHA"
test "$SOURCE_COMMIT_SHA" = "75e713d16f0ac76d9a585147c7bf2a3fb3789a1e"

echo "=== -1. measurement interlock ==="
"${SSH[@]}" "root@${HOST}" "if [ -f /root/talaria-restore/MEASUREMENT-IN-PROGRESS ]; then
  echo MEASUREMENT_IN_PROGRESS=yes
  cat /root/talaria-restore/MEASUREMENT-IN-PROGRESS
  exit 9
fi
echo MEASUREMENT_IN_PROGRESS=no
echo LIVE_PIN_BEFORE=\$(cat /root/talaria-restore/LIVE-PIN.txt 2>/dev/null || echo NONE)
echo HOMEPAGE_BEFORE=\$(docker inspect -f '{{.Config.Image}}' talaria-homepage-1 2>/dev/null || echo MISSING)
df -h / | tail -1
"

echo "=== 0. DEPLOY-IN-PROGRESS + restore point ==="
"${SSH[@]}" "root@${HOST}" "set -e
mkdir -p /root/talaria-restore
touch /root/talaria-restore/DEPLOY-IN-PROGRESS
RP=/root/talaria-restore/canary-${CHART_BUILD_ID}-\$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p \"\$RP\"
docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' > \"\$RP/docker-ps.txt\"
{
  echo captured_at=\$(date -u +%Y-%m-%dT%H:%M:%SZ)
  echo homepage=\$(docker inspect -f '{{.Config.Image}}' talaria-homepage-1 2>/dev/null || echo MISSING)
  echo chart=\$(docker inspect -f '{{.Config.Image}}' talaria-trading-chart-1 2>/dev/null || echo MISSING)
  echo prior_pin=\$(cat /root/talaria-restore/LIVE-PIN.txt 2>/dev/null || echo NONE)
} | tee \"\$RP/IMAGE-PINS.txt\"
# Prefer the image tag actually running as the rollback target (LIVE-PIN can lag).
RUNNING=\$(docker inspect -f '{{.Config.Image}}' talaria-homepage-1 2>/dev/null | sed -n 's/.*canary-//p')
if [ -n \"\$RUNNING\" ]; then
  echo \"\$RUNNING\" > /root/talaria-restore/PRIOR-PIN.txt
else
  cat /root/talaria-restore/LIVE-PIN.txt > /root/talaria-restore/PRIOR-PIN.txt 2>/dev/null || true
fi
echo PRIOR_PIN=\$(cat /root/talaria-restore/PRIOR-PIN.txt)
echo RESTORE_POINT_OK rp=\$RP
"

REMOTE_TAR="/tmp/talaria-canary-${SOURCE_COMMIT_SHA:0:12}.tar"
echo "=== 1. scp tip tar ==="
"${SCP[@]}" "$TAR" "root@${HOST}:$REMOTE_TAR"
echo SCP_EXIT=$?

echo "=== 2. untar + preflight train tokens in build context ==="
"${SSH[@]}" "root@${HOST}" "set -e
cd /opt/talaria
tar -xf '$REMOTE_TAR'
rm -f '$REMOTE_TAR'
echo SYNC_OK sha=$SOURCE_COMMIT_SHA
OM='chart v 1.4/chart/modules/order-manager.js'
IND='chart v 1.4/chart/modules/chart-indicators-full.js'
TR='chart v 1.4/talaria-design/src/orderManagerTradeRows.js'
test -f \"\$OM\" && test -f \"\$IND\" && test -f \"\$TR\"
for t in \
  __TALARIA_DISABLE_M24_ORDER_ID_GAP_RECONCILE_V1 \
  __TALARIA_DISABLE_ORDER_EXPLICIT_PLACE_AUDIT_V1 \
  __TALARIA_DISABLE_ORDER_PAIR_SWITCH_VISUAL_REBIND_V1 \
  __TALARIA_DISABLE_EXCURSION_SINGLE_OWNER_V1 \
  __TALARIA_DISABLE_TRADE_EVICT_V1
do
  n=\$(grep -c \"\$t\" \"\$OM\" || true)
  printf '  %-55s order-manager=%s\n' \"\$t\" \"\$n\"
  test \"\$n\" -gt 0
done
n=\$(grep -c '__TALARIA_DISABLE_INDICATOR_EVICT_V1' \"\$IND\" || true)
printf '  %-55s indicators=%s\n' '__TALARIA_DISABLE_INDICATOR_EVICT_V1' \"\$n\"
test \"\$n\" -gt 0
n=\$(grep -c '__TALARIA_DISABLE_TRADE_DURATION_NORM_V1' \"\$TR\" || true)
printf '  %-55s tradeRows=%s\n' '__TALARIA_DISABLE_TRADE_DURATION_NORM_V1' \"\$n\"
test \"\$n\" -gt 0
n=\$(grep -c 'clearIndicators' \"\$IND\" || true)
printf '  %-55s clearIndicators=%s\n' 'clearIndicators sites' \"\$n\"
test \"\$n\" -gt 0
# Mirror parity for files that ship from both trees
cmp -s \"\$OM\" homepage/public/chart/modules/order-manager.js
cmp -s \"\$IND\" homepage/public/chart/modules/chart-indicators-full.js
echo PREFLIGHT_OK
"

echo "=== 3. CHECKPOINT_BUILD compose (includes dist-v9 rebuild) ==="
"${SSH[@]}" "root@${HOST}" "set -e
cd /opt/talaria
export CHECKPOINT_BUILD=1
export CHART_BUILD_ID=$CHART_BUILD_ID
export SOURCE_COMMIT_SHA=$SOURCE_COMMIT_SHA
unset TRADING_CHART_IMAGE HOMEPAGE_IMAGE || true
echo BUILD_START=\$(date -u +%Y-%m-%dT%H:%M:%SZ)
docker compose build --build-arg CHECKPOINT_BUILD=1 --build-arg CHART_BUILD_ID=$CHART_BUILD_ID --build-arg SOURCE_COMMIT_SHA=$SOURCE_COMMIT_SHA trading-chart homepage
echo BUILD_DONE=\$(date -u +%Y-%m-%dT%H:%M:%SZ)
TAG=canary-\$CHART_BUILD_ID
docker tag talaria-trading-chart:latest talaria-trading-chart:\$TAG
docker tag talaria-homepage:latest talaria-homepage:\$TAG
mkdir -p /root/talaria-restore/images
docker save talaria-homepage:\$TAG talaria-trading-chart:\$TAG | gzip -1 > /root/talaria-restore/images/\$TAG.tar.gz
gzip -t /root/talaria-restore/images/\$TAG.tar.gz
{
  echo tagged_at=\$(date -u +%Y-%m-%dT%H:%M:%SZ)
  echo chart_build_id=\$CHART_BUILD_ID
  echo source_commit_sha=\$SOURCE_COMMIT_SHA
  echo trading_chart_tag=talaria-trading-chart:\$TAG
  echo homepage_tag=talaria-homepage:\$TAG
  echo train_rows=Rayan8_gap+place_audit,TAL-01807b,TAL-01896,EXCURSION-SINGLE-OWNER,TRADE-EVICT,INDICATOR-EVICT
} | tee /root/talaria-restore/PINNED-\$CHART_BUILD_ID.txt
echo IMMUTABLE_TAGS_OK tag=\$TAG bytes=\$(stat -c%s /root/talaria-restore/images/\$TAG.tar.gz)
export HOMEPAGE_IMAGE=talaria-homepage:\$TAG
export TRADING_CHART_IMAGE=talaria-trading-chart:\$TAG
docker compose up -d --no-build trading-chart trading-chart-worker homepage
echo UP_DONE=\$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo \$CHART_BUILD_ID > /root/talaria-restore/LIVE-PIN.txt
rm -f /root/talaria-restore/DEPLOY-IN-PROGRESS
echo LIVE_PIN_SET=\$CHART_BUILD_ID
if [ -x /root/talaria-restore/canary-image-retention.sh ]; then
  /root/talaria-restore/canary-image-retention.sh --apply || echo RETENTION_NONFATAL_FAIL
fi
"

echo "=== 4. wait for health ==="
"${SSH[@]}" "root@${HOST}" "set -e
for i in \$(seq 1 36); do
  st=\$(docker inspect -f '{{.State.Health.Status}}' talaria-trading-chart-1 2>/dev/null || echo missing)
  hp=\$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/chart/dist-v9/index.html || echo 000)
  echo \"  attempt \$i: trading-chart=\$st shell_http=\$hp\"
  [ \"\$st\" = healthy ] && [ \"\$hp\" = 200 ] && break
  sleep 5
done
test \"\$(docker inspect -f '{{.State.Health.Status}}' talaria-trading-chart-1)\" = healthy
test \"\$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/chart/dist-v9/index.html)\" = 200
"

echo "=== 5. MEAS-01 — stamp from the running page over HTTP ==="
"${SSH[@]}" "root@${HOST}" "set -e
PIN=\$(cat /root/talaria-restore/LIVE-PIN.txt)
echo LIVE_PIN=\$PIN
HTTP=\$(curl -sS -o /tmp/meas01-shell.html -w '%{http_code}' -H 'Cache-Control: no-cache' http://127.0.0.1:3000/chart/dist-v9/index.html)
echo shell_http=\$HTTP
STAMP=\$(tr -d '\\r' </tmp/meas01-shell.html | grep -oE \"window\\.__TALARIA_CHART_BUILD_ID='[^']+'\" | head -1)
echo SERVED_STAMP=\$STAMP
echo \"\$STAMP\" | grep -Fq \"'$CHART_BUILD_ID'\"
STAMP_COUNT=\$(grep -cE '\\?v=$CHART_BUILD_ID' /tmp/meas01-shell.html || true)
echo stamp_v_refs=\$STAMP_COUNT
test \"\$STAMP_COUNT\" -gt 0
IMG_H=\$(docker inspect -f '{{.Config.Image}}' talaria-homepage-1)
IMG_C=\$(docker inspect -f '{{.Config.Image}}' talaria-trading-chart-1)
IMG_W=\$(docker inspect -f '{{.Config.Image}}' talaria-trading-chart-worker-1)
echo homepage_image=\$IMG_H
echo chart_image=\$IMG_C
echo worker_image=\$IMG_W
echo \"\$IMG_H\" | grep -Fq canary-$CHART_BUILD_ID
echo \"\$IMG_C\" | grep -Fq canary-$CHART_BUILD_ID
echo \"\$IMG_W\" | grep -Fq canary-$CHART_BUILD_ID
echo GRADE_UNTOUCHED=\$(docker inspect -f '{{.Config.Image}}' talaria-grade-homepage 2>/dev/null || echo none)
"

echo "=== 6. TRAIN PAYLOAD on the wire (served bytes, not the build context) ==="
"${SSH[@]}" "root@${HOST}" "set -e
H=/usr/share/nginx/html/chart
docker exec talaria-homepage-1 sh -c \"
  OM=\$H/modules/order-manager.js
  IND=\$H/modules/chart-indicators-full.js
  echo '--- money-path / D rows in served order-manager.js ---'
  for t in \
    __TALARIA_DISABLE_M24_ORDER_ID_GAP_RECONCILE_V1 \
    __TALARIA_DISABLE_ORDER_EXPLICIT_PLACE_AUDIT_V1 \
    __TALARIA_DISABLE_ORDER_PAIR_SWITCH_VISUAL_REBIND_V1 \
    __TALARIA_DISABLE_EXCURSION_SINGLE_OWNER_V1 \
    __TALARIA_DISABLE_TRADE_EVICT_V1
  do
    n=\\\$(grep -c \\\$t \\\$OM || true)
    printf '  %-55s %s\n' \\\$t \\\$n
    test \\\$n -gt 0
  done
  echo '--- E INDICATOR-EVICT in served chart-indicators-full.js ---'
  n=\\\$(grep -c __TALARIA_DISABLE_INDICATOR_EVICT_V1 \\\$IND || true)
  printf '  %-55s %s\n' __TALARIA_DISABLE_INDICATOR_EVICT_V1 \\\$n
  test \\\$n -gt 0
  n=\\\$(grep -c clearIndicators \\\$IND || true)
  printf '  %-55s %s\n' clearIndicators \\\$n
  test \\\$n -gt 0
  echo '--- TAL-01896 duration norm in served dist-v9 (must be fetchable) ---'
  n=\\\$(grep -R -l __TALARIA_DISABLE_TRADE_DURATION_NORM_V1 \$H/dist-v9 2>/dev/null | wc -l)
  printf '  files_containing_TRADE_DURATION_NORM=%s\n' \\\$n
  test \\\$n -gt 0
  grep -R -l __TALARIA_DISABLE_TRADE_DURATION_NORM_V1 \$H/dist-v9 2>/dev/null | head -5
  echo '--- prior P0 still on the wire ---'
  n=\\\$(grep -c CONTROL_TIMEOUT_MS \$H/modules/chart-window-limit.js || true)
  printf '  CONTROL_TIMEOUT_MS=%s\n' \\\$n
  test \\\$n -gt 0
\"
echo TRAIN_WIRE_OK
"

echo "=== 7. HTTP fetch of discriminating tokens (browser-equivalent) ==="
"${SSH[@]}" "root@${HOST}" "set -e
curl -sS -H 'Cache-Control: no-cache' http://127.0.0.1:3000/chart/modules/order-manager.js -o /tmp/om.js
curl -sS -H 'Cache-Control: no-cache' http://127.0.0.1:3000/chart/modules/chart-indicators-full.js -o /tmp/ind.js
for t in \
  __TALARIA_DISABLE_M24_ORDER_ID_GAP_RECONCILE_V1 \
  __TALARIA_DISABLE_ORDER_EXPLICIT_PLACE_AUDIT_V1 \
  __TALARIA_DISABLE_ORDER_PAIR_SWITCH_VISUAL_REBIND_V1 \
  __TALARIA_DISABLE_EXCURSION_SINGLE_OWNER_V1 \
  __TALARIA_DISABLE_TRADE_EVICT_V1
do
  n=\$(grep -c \"\$t\" /tmp/om.js || true)
  printf '  HTTP order-manager %-55s %s\n' \"\$t\" \"\$n\"
  test \"\$n\" -gt 0
done
n=\$(grep -c '__TALARIA_DISABLE_INDICATOR_EVICT_V1' /tmp/ind.js || true)
printf '  HTTP indicators %-55s %s\n' '__TALARIA_DISABLE_INDICATOR_EVICT_V1' \"\$n\"
test \"\$n\" -gt 0
# Find which dist-v9 asset carries TAL-01896 and fetch it over HTTP
HIT=\$(docker exec talaria-homepage-1 sh -c \"grep -R -l __TALARIA_DISABLE_TRADE_DURATION_NORM_V1 /usr/share/nginx/html/chart/dist-v9 2>/dev/null | head -1\")
echo TAL01896_SERVED_PATH=\$HIT
test -n \"\$HIT\"
REL=\${HIT#/usr/share/nginx/html}
curl -sS -H 'Cache-Control: no-cache' \"http://127.0.0.1:3000\$REL\" -o /tmp/tal01896.js
n=\$(grep -c '__TALARIA_DISABLE_TRADE_DURATION_NORM_V1' /tmp/tal01896.js || true)
printf '  HTTP %s TRADE_DURATION_NORM=%s\n' \"\$REL\" \"\$n\"
test \"\$n\" -gt 0
echo HTTP_WIRE_OK
"

echo CANARY_CHECKPOINT_OK build_id=$CHART_BUILD_ID sha=$SOURCE_COMMIT_SHA
echo "PO_SHOULD_READ=$CHART_BUILD_ID"
echo "PING_D_AND_E=wire is $CHART_BUILD_ID; re-run TEST-02 / money probes / INDICATOR-EVICT"
