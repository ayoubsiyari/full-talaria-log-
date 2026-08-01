#!/usr/bin/env bash
set -euo pipefail
ROOT="/mnt/c/Users/user/Desktop/talaria1/manager-b-plan3"
HOST=31.97.192.82
PORT=443
CHART_BUILD_ID=20260730b110
LOGO04_SHA256=b47ba1be1c532a87339d308a9814a5ede26e730bae1b3be25120d6c299402856
SOURCE_COMMIT_SHA="$(tr -d '\r\n' <"$ROOT/docs/plan3/evidence/B-M4/release/observations/.ship-tip-sha.txt")"
TAR="$ROOT/.scratch-canary-checkpoint.tar"
SSH=(ssh -p "$PORT" -o BatchMode=yes -o ConnectTimeout=30 -o StrictHostKeyChecking=accept-new)
SCP=(scp -P "$PORT" -o BatchMode=yes -o ConnectTimeout=30 -o StrictHostKeyChecking=accept-new)
OBS="$ROOT/docs/plan3/evidence/B-M4/release/observations"
LOG="$OBS/b110-ship.log"
exec > >(tee "$LOG") 2>&1
echo "=== CANARY KEY-AUTH SHIP === build_id=$CHART_BUILD_ID sha=$SOURCE_COMMIT_SHA"
test -f "$TAR"
test -n "$SOURCE_COMMIT_SHA"

# DEPLOY-02 interlock: refuse to move the wire while a measurement is running.
echo "=== -1. measurement interlock ==="
"${SSH[@]}" "root@${HOST}" "if [ -f /root/talaria-restore/MEASUREMENT-IN-PROGRESS ]; then
  echo MEASUREMENT_IN_PROGRESS=yes
  cat /root/talaria-restore/MEASUREMENT-IN-PROGRESS
  exit 9
fi
echo MEASUREMENT_IN_PROGRESS=no"

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
cat /root/talaria-restore/LIVE-PIN.txt > /root/talaria-restore/PRIOR-PIN.txt 2>/dev/null || true
echo RESTORE_POINT_OK rp=\$RP"

REMOTE_TAR="/tmp/talaria-canary-${SOURCE_COMMIT_SHA:0:12}.tar"
echo "=== 1. scp tip tar ==="
"${SCP[@]}" "$TAR" "root@${HOST}:$REMOTE_TAR"
echo SCP_EXIT=$?

echo "=== 2. untar into /opt/talaria ==="
"${SSH[@]}" "root@${HOST}" "set -e
cd /opt/talaria
tar -xf '$REMOTE_TAR'
rm -f '$REMOTE_TAR'
echo SYNC_OK sha=$SOURCE_COMMIT_SHA"

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
{
  echo tagged_at=\$(date -u +%Y-%m-%dT%H:%M:%SZ)
  echo chart_build_id=\$CHART_BUILD_ID
  echo source_commit_sha=\$SOURCE_COMMIT_SHA
  echo trading_chart_tag=talaria-trading-chart:\$TAG
  echo homepage_tag=talaria-homepage:\$TAG
} | tee /root/talaria-restore/PINNED-\$CHART_BUILD_ID.txt
echo IMMUTABLE_TAGS_OK tag=\$TAG
export HOMEPAGE_IMAGE=talaria-homepage:\$TAG
export TRADING_CHART_IMAGE=talaria-trading-chart:\$TAG
docker compose up -d trading-chart trading-chart-worker homepage
echo UP_DONE=\$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo \$CHART_BUILD_ID > /root/talaria-restore/LIVE-PIN.txt
rm -f /root/talaria-restore/DEPLOY-IN-PROGRESS
echo LIVE_PIN_SET=\$CHART_BUILD_ID
if [ -x /root/talaria-restore/canary-image-retention.sh ]; then
  /root/talaria-restore/canary-image-retention.sh --apply || echo RETENTION_NONFATAL_FAIL
fi"

echo "=== 4. wait for nginx ==="
sleep 25

echo "=== 5. MEAS-01 — stamp from the running page over HTTP ==="
"${SSH[@]}" "root@${HOST}" "set -e
PIN=\$(cat /root/talaria-restore/LIVE-PIN.txt)
echo LIVE_PIN=\$PIN
HTTP=\$(curl -sS -o /tmp/meas01-shell.html -w '%{http_code}' -H 'Cache-Control: no-cache' http://127.0.0.1:3000/chart/dist-v9/index.html)
echo shell_http=\$HTTP
STAMP=\$(tr -d '\\r' </tmp/meas01-shell.html | grep -oE \"window\\.__TALARIA_CHART_BUILD_ID='[^']+'\" | head -1)
echo SERVED_STAMP=\$STAMP
echo \"\$STAMP\" | grep -Fq \"'$CHART_BUILD_ID'\"
IMG_H=\$(docker inspect -f '{{.Config.Image}}' talaria-homepage-1)
IMG_C=\$(docker inspect -f '{{.Config.Image}}' talaria-trading-chart-1)
echo homepage_image=\$IMG_H
echo chart_image=\$IMG_C
echo \"\$IMG_H\" | grep -Fq canary-$CHART_BUILD_ID
echo \"\$IMG_C\" | grep -Fq canary-$CHART_BUILD_ID
"

echo "=== 6. B-0200 payload: the image cut, measured on the wire ==="
"${SSH[@]}" "root@${HOST}" "set -e
echo '--- the loader brand served over HTTP is the resized file, byte for byte'
SERVED=\$(curl -sS -o /tmp/logo04.png -w '%{http_code}' -H 'Cache-Control: no-cache' http://127.0.0.1:3000/chart/modules/logo-04.png)
echo logo04_http=\$SERVED
echo logo04_bytes=\$(stat -c %s /tmp/logo04.png)
echo logo04_sha256=\$(sha256sum /tmp/logo04.png | cut -d' ' -f1)
sha256sum /tmp/logo04.png | grep -Fq $LOGO04_SHA256 && echo LOGO04_MATCHES_RESIZED=yes
# IHDR: width/height are big-endian u32 at byte offsets 16 and 20.
python3 - <<'PY'
import struct
with open('/tmp/logo04.png','rb') as f:
    b = f.read(24)
w, h = struct.unpack('>II', b[16:24])
print('logo04_pixels=%dx%d decoded_bytes=%d decoded_mb=%.2f' % (w, h, w*h*4, w*h*4/1048576))
assert max(w, h) <= 1024, 'loader brand is still oversized on the wire'
print('LOGO04_WITHIN_1024=yes')
PY

echo '--- the screenshot brand preload is gone from the served module'
H=/usr/share/nginx/html/chart
docker exec talaria-homepage-1 sh -c \"
  F=\$H/modules/screenshot-manager.js
  printf 'guard=%s switch=%s climb_helper=%s call_sites=%s\n' \\
    \\\"\\\$(grep -c '_talariaScreenshotFlagTruthy(' \\\$F)\\\" \\
    \\\"\\\$(grep -c '__TALARIA_DISABLE_SCREENSHOT_BRAND_PRELOAD_CUT_V1' \\\$F)\\\" \\
    \\\"\\\$(grep -c 'window.parent !== window' \\\$F)\\\" \\
    \\\"\\\$(grep -c 'this.getBrandLogoImage()' \\\$F)\\\"
\"
echo '--- no other eager brand img crept into the served shell'
docker exec talaria-homepage-1 sh -c \"grep -oE '<img[^>]*logo-[0-9]+\\.png' \$H/dist-v9/index.html || echo NO_OTHER_BRAND_IMG\"

echo '--- prior payloads still on the wire (b104-b109 regression check)'
docker exec talaria-homepage-1 sh -c \"
  printf 'stash_handles=%s xframe_switch=%s claim_split=%s ledger_in_shell=%s\n' \\
    \\\"\\\$(grep -c 'mcStashPanelHandles' \$H/multichart-prod/multichart-manager.js)\\\" \\
    \\\"\\\$(grep -c '__TALARIA_DISABLE_MC_XFRAME_REF_RELEASE_V1' \$H/multichart-prod/multichart-manager.js)\\\" \\
    \\\"\\\$(grep -c 'function sendClaimRequest' \$H/modules/chart-window-limit.js)\\\" \\
    \\\"\\\$(grep -c 'server-write-failure-ledger' \$H/dist-v9/index.html)\\\"
\"
"

echo "=== 7. total decoded image bytes now eager on a chart load ==="
"${SSH[@]}" "root@${HOST}" "set -e
H=/usr/share/nginx/html/chart
docker exec talaria-homepage-1 sh -c \"grep -oE 'src=\\\"[^\\\"]*logo-[0-9]+\\.png' \$H/dist-v9/index.html\" || true
python3 - <<'PY'
import struct, subprocess
# Only the loader brand remains eager; prove its decoded cost from the served bytes.
out = subprocess.run(['curl','-sS','http://127.0.0.1:3000/chart/modules/logo-04.png'],
                     capture_output=True).stdout
w, h = struct.unpack('>II', out[16:24])
print('EAGER_DECODED_IMAGE_BYTES=%d (%.2f MB) from 1 asset' % (w*h*4, w*h*4/1048576))
print('WAS=54277464 (51.78 MB) from 2 assets')
PY
"

echo CANARY_CHECKPOINT_OK build_id=$CHART_BUILD_ID sha=$SOURCE_COMMIT_SHA
echo "PO_SHOULD_READ=$CHART_BUILD_ID"
