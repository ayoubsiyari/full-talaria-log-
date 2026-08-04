#!/usr/bin/env bash
# Ship train b127: the ten Package 1 defects the PO found on the visual pass.
#
# Differs from b114 in one respect worth stating: step -1 calls deploy-freeze-guard.sh check.
# b126 shipped on 2026-08-03 with no BLOCKED and no LIFTED in the freeze audit, meaning that ship
# never asked the guard — the guard's own header predicted exactly that ("a freeze that cannot be
# broken is a freeze that gets worked around by not calling this script"). This ship asks it.
set -euo pipefail
ROOT="/mnt/c/Users/user/Desktop/talaria1/full-talaria-log--main"
HOST=31.97.192.82
PORT=443
CHART_BUILD_ID=20260804b127
SOURCE_COMMIT_SHA=101fe7e50d6f98fc8fb0ab326ace742753d0b23b
# Kept on the Windows mount, not /tmp: WSL reclaims /tmp between `wsl.exe` invocations, so a tar
# built in one call was gone by the next and the ship died on its own precondition.
TAR="/mnt/c/Users/user/Desktop/talaria1/.ship-b127-${SOURCE_COMMIT_SHA:0:12}.tar"
SSH=(ssh -p "$PORT" -o BatchMode=yes -o ConnectTimeout=30 -o StrictHostKeyChecking=accept-new)
SCP=(scp -P "$PORT" -o BatchMode=yes -o ConnectTimeout=30 -o StrictHostKeyChecking=accept-new)
OBS="$ROOT/docs/plan3/evidence/B-M4/release/observations"
LOG="$OBS/b127-ship.log"
exec > >(tee "$LOG") 2>&1
echo "=== CANARY KEY-AUTH SHIP === build_id=$CHART_BUILD_ID sha=$SOURCE_COMMIT_SHA"

if [ ! -f "$TAR" ]; then
  echo "=== -2. build source tar from $SOURCE_COMMIT_SHA ==="
  git -C "$ROOT" archive --format=tar -o "$TAR" "$SOURCE_COMMIT_SHA"
fi
test -f "$TAR"
echo "TAR_OK $(du -h "$TAR" | cut -f1) entries=$(tar -tf "$TAR" | wc -l)"

echo "=== -1. freeze guard + measurement interlock ==="
"${SSH[@]}" "root@${HOST}" "bash /opt/talaria/deploy/deploy-freeze-guard.sh check"
"${SSH[@]}" "root@${HOST}" 'set -u
if [ -f /root/talaria-restore/MEASUREMENT-IN-PROGRESS ]; then
  echo MEASUREMENT_IN_PROGRESS=yes
  cat /root/talaria-restore/MEASUREMENT-IN-PROGRESS
  exit 9
fi
echo MEASUREMENT_IN_PROGRESS=no
echo RUNNING_BEFORE=$(docker inspect -f "{{.Config.Image}}" talaria-homepage-1 2>/dev/null || echo MISSING)
df -h / | tail -1
'

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
# LIVE-PIN lags -- it read 20260731b120 while b126 was live -- so the rollback target is derived
# from the image actually running, never from the pin file.
RUNNING=\$(docker inspect -f '{{.Config.Image}}' talaria-homepage-1 2>/dev/null | sed -n 's/.*canary-//p')
if [ -n \"\$RUNNING\" ]; then
  echo \"\$RUNNING\" > /root/talaria-restore/PRIOR-PIN.txt
fi
echo PRIOR_PIN=\$(cat /root/talaria-restore/PRIOR-PIN.txt)
test -f /root/talaria-restore/images/canary-\$(cat /root/talaria-restore/PRIOR-PIN.txt).tar.gz \
  && echo ROLLBACK_IMAGE_PRESENT=yes \
  || echo ROLLBACK_IMAGE_PRESENT=no
echo RESTORE_POINT_OK rp=\$RP
"

REMOTE_TAR="/tmp/talaria-canary-${SOURCE_COMMIT_SHA:0:12}.tar"
echo "=== 1. scp tip tar ==="
"${SCP[@]}" "$TAR" "root@${HOST}:$REMOTE_TAR"
echo SCP_OK

echo "=== 2. untar + preflight Package 1 tokens in the build context ==="
"${SSH[@]}" "root@${HOST}" "set -e
cd /opt/talaria
tar -xf '$REMOTE_TAR'
rm -f '$REMOTE_TAR'
echo SYNC_OK sha=$SOURCE_COMMIT_SHA
ENG='chart v 1.4/chart/chart.js'
OM='chart v 1.4/chart/modules/order-manager.js'
CO='chart v 1.4/chart/modules/compare-overlay.js'
BUN='homepage/public/chart/dist-v9/assets/talaria-v9-live.js'
test -f \"\$ENG\" && test -f \"\$OM\" && test -f \"\$CO\" && test -f \"\$BUN\"
for t in PAIR_SWITCH_LOAD_TIMEOUT_MS serverRewindIsNewer _sessionTimeframeRestoreEnabled; do
  n=\$(grep -c \"\$t\" \"\$ENG\" || true)
  printf '  %-42s engine=%s\n' \"\$t\" \"\$n\"; test \"\$n\" -gt 0
done
for t in _analysisOnlyFileIds _refuseAnalysisOnlyOrderIfNeeded; do
  n=\$(grep -c \"\$t\" \"\$OM\" || true)
  printf '  %-42s order-manager=%s\n' \"\$t\" \"\$n\"; test \"\$n\" -gt 0
done
for t in _warnOverlayOutOfView _overlayFullPriceExtent; do
  n=\$(grep -c \"\$t\" \"\$CO\" || true)
  printf '  %-42s compare-overlay=%s\n' \"\$t\" \"\$n\"; test \"\$n\" -gt 0
done
for t in orderValidation __talariaGestureOwnerV1; do
  n=\$(grep -c \"\$t\" \"\$BUN\" || true)
  printf '  %-42s bundle=%s\n' \"\$t\" \"\$n\"; test \"\$n\" -gt 0
done
# Word boundary is load-bearing: the bundle legitimately carries a \`.iframes\` collection used to
# suppress pointer events on drag, and a bare '\\.iframe' matches it. Without \\b this refused a
# correct build.
n=\$(grep -cE '\\.iframe\\b' \"\$BUN\" || true)
printf '  %-42s bundle=%s (must be 0)\n' 'no .iframe reader survives' \"\$n\"; test \"\$n\" -eq 0
# Mirror parity for the files that ship from both trees
cmp -s \"\$ENG\" homepage/public/chart/chart.js
cmp -s \"\$OM\" homepage/public/chart/modules/order-manager.js
cmp -s \"\$CO\" homepage/public/chart/modules/compare-overlay.js
echo MIRROR_PARITY_OK
echo PREFLIGHT_OK
"

echo "=== 3. CHECKPOINT_BUILD compose (includes dist-v9 rebuild) ==="
"${SSH[@]}" "root@${HOST}" "set -e
cd /opt/talaria
export CHECKPOINT_BUILD=1
export CHART_BUILD_ID=$CHART_BUILD_ID
export SOURCE_COMMIT_SHA=$SOURCE_COMMIT_SHA
TAG=canary-\$CHART_BUILD_ID
# b114 unset these and then tagged from :latest. That was correct while compose defaulted to
# :latest -- but .env now pins TRADING_CHART_IMAGE/HOMEPAGE_IMAGE to the PREVIOUS build, and
# compose reads .env regardless of what this shell unsets. The b127 attempt therefore built new
# bytes straight into b126's tag, destroying the rollback target's meaning, and then died because
# :latest did not exist. Naming the target explicitly makes the build write where it is going.
export TRADING_CHART_IMAGE=talaria-trading-chart:\$TAG
export HOMEPAGE_IMAGE=talaria-homepage:\$TAG
docker compose config | grep -E '^\s+image: talaria-(trading-chart|homepage):' | sort -u
docker compose config | grep -Fq \"talaria-trading-chart:\$TAG\"
docker compose config | grep -Fq \"talaria-homepage:\$TAG\"
echo BUILD_TARGET_CONFIRMED tag=\$TAG
echo BUILD_START=\$(date -u +%Y-%m-%dT%H:%M:%SZ)
docker compose build --build-arg CHECKPOINT_BUILD=1 --build-arg CHART_BUILD_ID=$CHART_BUILD_ID --build-arg SOURCE_COMMIT_SHA=$SOURCE_COMMIT_SHA trading-chart homepage
echo BUILD_DONE=\$(date -u +%Y-%m-%dT%H:%M:%SZ)
# Prove the build landed on the intended name with the intended provenance before anything is
# saved as a rollback point or served.
for r in talaria-trading-chart talaria-homepage; do
  L=\$(docker inspect -f '{{index .Config.Labels \"io.talaria.checkpoint.build-id\"}}' \$r:\$TAG)
  R=\$(docker inspect -f '{{index .Config.Labels \"org.opencontainers.image.revision\"}}' \$r:\$TAG)
  printf '  %-30s build-id=%s revision=%s\n' \"\$r:\$TAG\" \"\$L\" \"\$R\"
  test \"\$L\" = '$CHART_BUILD_ID'
  test \"\$R\" = '$SOURCE_COMMIT_SHA'
done
echo BUILD_PROVENANCE_OK
mkdir -p /root/talaria-restore/images
docker save talaria-homepage:\$TAG talaria-trading-chart:\$TAG | gzip -1 > /root/talaria-restore/images/\$TAG.tar.gz
gzip -t /root/talaria-restore/images/\$TAG.tar.gz
{
  echo build_id=\$CHART_BUILD_ID
  echo pinned_at=\$(date -u +%Y-%m-%dT%H:%M:%SZ)
  echo source_commit=$SOURCE_COMMIT_SHA
  echo source_tag=roster-20260804b127-source
  echo chart_image=talaria-trading-chart:\$TAG
  echo homepage_image=talaria-homepage:\$TAG
  echo chart_id=\$(docker inspect -f '{{.Id}}' talaria-trading-chart:\$TAG)
  echo homepage_id=\$(docker inspect -f '{{.Id}}' talaria-homepage:\$TAG)
  echo train_rows=PACKAGE1_TEN_DEFECTS
} | tee /root/talaria-restore/PINNED-\$CHART_BUILD_ID.txt
echo IMMUTABLE_TAGS_OK tag=\$TAG bytes=\$(stat -c%s /root/talaria-restore/images/\$TAG.tar.gz)
# Repoint .env too, not just this shell. Leaving it pinned to the previous build is what made the
# next ship build into a stale tag, and it means any later `docker compose up` run by hand would
# quietly revert the stack to the old image.
cp -a .env /root/talaria-restore/env-before-\$CHART_BUILD_ID.bak
sed -i \"s|^TRADING_CHART_IMAGE=.*|TRADING_CHART_IMAGE=talaria-trading-chart:\$TAG|\" .env
sed -i \"s|^HOMEPAGE_IMAGE=.*|HOMEPAGE_IMAGE=talaria-homepage:\$TAG|\" .env
grep -nE '^(TRADING_CHART_IMAGE|HOMEPAGE_IMAGE)=' .env
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
echo LIVE_PIN=\$(cat /root/talaria-restore/LIVE-PIN.txt)
HTTP=\$(curl -sS -o /tmp/meas01-shell.html -w '%{http_code}' -H 'Cache-Control: no-cache' http://127.0.0.1:3000/chart/dist-v9/index.html)
echo shell_http=\$HTTP
STAMP=\$(tr -d '\\r' </tmp/meas01-shell.html | grep -oE \"window\\.__TALARIA_CHART_BUILD_ID='[^']+'\" | head -1)
echo SERVED_STAMP=\$STAMP
echo \"\$STAMP\" | grep -Fq \"'$CHART_BUILD_ID'\"
echo stamp_v_refs=\$(grep -cE '\\?v=$CHART_BUILD_ID' /tmp/meas01-shell.html || true)
IMG_H=\$(docker inspect -f '{{.Config.Image}}' talaria-homepage-1)
IMG_C=\$(docker inspect -f '{{.Config.Image}}' talaria-trading-chart-1)
IMG_W=\$(docker inspect -f '{{.Config.Image}}' talaria-trading-chart-worker-1)
echo homepage_image=\$IMG_H
echo chart_image=\$IMG_C
echo worker_image=\$IMG_W
echo \"\$IMG_H\" | grep -Fq canary-$CHART_BUILD_ID
echo \"\$IMG_C\" | grep -Fq canary-$CHART_BUILD_ID
echo \"\$IMG_W\" | grep -Fq canary-$CHART_BUILD_ID
"

echo "=== 6. PACKAGE 1 PAYLOAD on the wire (HTTP fetch, browser-equivalent) ==="
"${SSH[@]}" "root@${HOST}" "set -e
B=http://127.0.0.1:3000
curl -sS -H 'Cache-Control: no-cache' \$B/chart/chart.js -o /tmp/w-eng.js
curl -sS -H 'Cache-Control: no-cache' \$B/chart/modules/order-manager.js -o /tmp/w-om.js
curl -sS -H 'Cache-Control: no-cache' \$B/chart/modules/compare-overlay.js -o /tmp/w-co.js
curl -sS -H 'Cache-Control: no-cache' \$B/chart/dist-v9/assets/talaria-v9-live.js -o /tmp/w-bun.js
for t in PAIR_SWITCH_LOAD_TIMEOUT_MS serverRewindIsNewer _sessionTimeframeRestoreEnabled; do
  n=\$(grep -c \"\$t\" /tmp/w-eng.js || true); printf '  HTTP engine   %-42s %s\n' \"\$t\" \"\$n\"; test \"\$n\" -gt 0
done
for t in _analysisOnlyFileIds _refuseAnalysisOnlyOrderIfNeeded; do
  n=\$(grep -c \"\$t\" /tmp/w-om.js || true); printf '  HTTP om       %-42s %s\n' \"\$t\" \"\$n\"; test \"\$n\" -gt 0
done
for t in _warnOverlayOutOfView _overlayFullPriceExtent; do
  n=\$(grep -c \"\$t\" /tmp/w-co.js || true); printf '  HTTP compare  %-42s %s\n' \"\$t\" \"\$n\"; test \"\$n\" -gt 0
done
for t in orderValidation __talariaGestureOwnerV1; do
  n=\$(grep -c \"\$t\" /tmp/w-bun.js || true); printf '  HTTP bundle   %-42s %s\n' \"\$t\" \"\$n\"; test \"\$n\" -gt 0
done
n=\$(grep -cE '\\.iframe\\b' /tmp/w-bun.js || true)
printf '  HTTP bundle   %-42s %s (must be 0)\n' 'no .iframe reader' \"\$n\"; test \"\$n\" -eq 0
n=\$(grep -c CHART_ENGINE_BUILD /tmp/w-eng.js || true)
grep -oE \"CHART_ENGINE_BUILD = '[^']+'\" /tmp/w-eng.js | head -1
grep -Fq \"CHART_ENGINE_BUILD = '$CHART_BUILD_ID'\" /tmp/w-eng.js
echo HTTP_WIRE_OK
"

echo CANARY_CHECKPOINT_OK build_id=$CHART_BUILD_ID sha=$SOURCE_COMMIT_SHA
echo "PO_SHOULD_READ=$CHART_BUILD_ID"
