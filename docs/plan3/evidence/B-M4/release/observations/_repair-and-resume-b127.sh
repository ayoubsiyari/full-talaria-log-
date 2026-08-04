#!/usr/bin/env bash
# b127 repair + resume.
#
# WHAT WENT WRONG
# /opt/talaria/.env pins TRADING_CHART_IMAGE / HOMEPAGE_IMAGE to canary-20260803b126. Compose reads
# .env, so the `unset` the b114 ship script does in its own shell changed nothing, and
# `docker compose build` wrote b127 bytes into b126's tag. b114 then tagged from
# `talaria-trading-chart:latest`, which no longer exists, so the ship died there -- before
# `up -d`, which is the only reason the live site is still genuinely b126.
#
# The images themselves are correct: label io.talaria.checkpoint.build-id=20260804b127 and
# revision=101fe7e5. Only the name is wrong, so this repairs names rather than rebuilding.
#
# ORDER IS LOAD-BEARING
# Tag b127 off the clobbered reference BEFORE restoring b126 from the tarball. Restoring first
# would move the only name pointing at the new images and leave them addressable by digest only.
set -euo pipefail
HOST=31.97.192.82
PORT=443
BUILD=20260804b127
PRIOR=20260803b126
SOURCE_COMMIT_SHA=101fe7e50d6f98fc8fb0ab326ace742753d0b23b
ROOT="/mnt/c/Users/user/Desktop/talaria1/full-talaria-log--main"
SSH=(ssh -p "$PORT" -o BatchMode=yes -o ConnectTimeout=30 -o StrictHostKeyChecking=accept-new)
LOG="$ROOT/docs/plan3/evidence/B-M4/release/observations/b127-repair-resume.log"
exec > >(tee "$LOG") 2>&1
echo "=== b127 REPAIR + RESUME === build=$BUILD prior=$PRIOR"

echo "=== 1. name the new images what they are ==="
"${SSH[@]}" "root@${HOST}" "set -e
for r in talaria-homepage talaria-trading-chart; do
  docker tag \$r:canary-$PRIOR \$r:canary-$BUILD
  L=\$(docker inspect -f '{{index .Config.Labels \"io.talaria.checkpoint.build-id\"}}' \$r:canary-$BUILD)
  R=\$(docker inspect -f '{{index .Config.Labels \"org.opencontainers.image.revision\"}}' \$r:canary-$BUILD)
  printf '  %-28s label=%s revision=%s\n' \"\$r:canary-$BUILD\" \"\$L\" \"\$R\"
  test \"\$L\" = '$BUILD'
  test \"\$R\" = '$SOURCE_COMMIT_SHA'
done
echo TAG_B127_OK
"

echo "=== 2. restore $PRIOR's tag from the retained tarball (rollback integrity) ==="
"${SSH[@]}" "root@${HOST}" "set -e
T=/root/talaria-restore/images/canary-$PRIOR.tar.gz
gzip -t \"\$T\"
gunzip -c \"\$T\" | docker load
for r in talaria-homepage talaria-trading-chart; do
  L=\$(docker inspect -f '{{index .Config.Labels \"io.talaria.checkpoint.build-id\"}}' \$r:canary-$PRIOR)
  printf '  %-28s label=%s\n' \"\$r:canary-$PRIOR\" \"\$L\"
  test \"\$L\" = '$PRIOR'
done
echo ROLLBACK_TAG_RESTORED
# and prove b127 did not move while we did that
for r in talaria-homepage talaria-trading-chart; do
  L=\$(docker inspect -f '{{index .Config.Labels \"io.talaria.checkpoint.build-id\"}}' \$r:canary-$BUILD)
  test \"\$L\" = '$BUILD'
done
echo B127_STILL_INTACT
"

echo "=== 3. save b127 rollback image + PINNED manifest ==="
"${SSH[@]}" "root@${HOST}" "set -e
mkdir -p /root/talaria-restore/images
docker save talaria-homepage:canary-$BUILD talaria-trading-chart:canary-$BUILD | gzip -1 > /root/talaria-restore/images/canary-$BUILD.tar.gz
gzip -t /root/talaria-restore/images/canary-$BUILD.tar.gz
{
  echo build_id=$BUILD
  echo pinned_at=\$(date -u +%Y-%m-%dT%H:%M:%SZ)
  echo source_commit=$SOURCE_COMMIT_SHA
  echo source_tag=roster-20260804b127-source
  echo chart_image=talaria-trading-chart:canary-$BUILD
  echo homepage_image=talaria-homepage:canary-$BUILD
  echo chart_id=\$(docker inspect -f '{{.Id}}' talaria-trading-chart:canary-$BUILD)
  echo homepage_id=\$(docker inspect -f '{{.Id}}' talaria-homepage:canary-$BUILD)
  echo strict_label=\$(docker inspect -f '{{index .Config.Labels \"io.talaria.checkpoint.strict\"}}' talaria-homepage:canary-$BUILD)
  echo buildid_label=$BUILD
  echo train_rows=PACKAGE1_TEN_DEFECTS
  echo note=repaired_from_misnamed_build_see_b127-repair-resume.log
} | tee /root/talaria-restore/PINNED-$BUILD.txt
echo PINNED_OK bytes=\$(stat -c%s /root/talaria-restore/images/canary-$BUILD.tar.gz)
"

echo "=== 4. repoint .env to b127 (backed up first) ==="
"${SSH[@]}" "root@${HOST}" "set -e
cd /opt/talaria
cp -a .env /root/talaria-restore/env-before-$BUILD.bak
sed -i 's|^TRADING_CHART_IMAGE=.*|TRADING_CHART_IMAGE=talaria-trading-chart:canary-$BUILD|' .env
sed -i 's|^HOMEPAGE_IMAGE=.*|HOMEPAGE_IMAGE=talaria-homepage:canary-$BUILD|' .env
grep -nE '^(TRADING_CHART_IMAGE|HOMEPAGE_IMAGE)=' .env
docker compose config 2>/dev/null | grep -E '^\s+image: talaria-' | sort -u
echo ENV_REPOINTED
"

echo "=== 5. up -d --no-build ==="
"${SSH[@]}" "root@${HOST}" "set -e
cd /opt/talaria
export HOMEPAGE_IMAGE=talaria-homepage:canary-$BUILD
export TRADING_CHART_IMAGE=talaria-trading-chart:canary-$BUILD
docker compose up -d --no-build trading-chart trading-chart-worker homepage
echo UP_DONE=\$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo $BUILD > /root/talaria-restore/LIVE-PIN.txt
rm -f /root/talaria-restore/DEPLOY-IN-PROGRESS
echo LIVE_PIN_SET=$BUILD
"

echo "=== 6. wait for health ==="
"${SSH[@]}" "root@${HOST}" "set -e
for i in \$(seq 1 48); do
  st=\$(docker inspect -f '{{.State.Health.Status}}' talaria-trading-chart-1 2>/dev/null || echo missing)
  hp=\$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/chart/dist-v9/index.html || echo 000)
  echo \"  attempt \$i: trading-chart=\$st shell_http=\$hp\"
  [ \"\$st\" = healthy ] && [ \"\$hp\" = 200 ] && break
  sleep 5
done
test \"\$(docker inspect -f '{{.State.Health.Status}}' talaria-trading-chart-1)\" = healthy
test \"\$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/chart/dist-v9/index.html)\" = 200
echo HEALTH_OK
"

echo "=== 7. MEAS-01 — stamp + images from the running system ==="
"${SSH[@]}" "root@${HOST}" "set -e
HTTP=\$(curl -sS -o /tmp/meas01.html -w '%{http_code}' -H 'Cache-Control: no-cache' http://127.0.0.1:3000/chart/dist-v9/index.html)
echo shell_http=\$HTTP
STAMP=\$(tr -d '\\r' </tmp/meas01.html | grep -oE \"window\\.__TALARIA_CHART_BUILD_ID='[^']+'\" | head -1)
echo SERVED_STAMP=\$STAMP
echo \"\$STAMP\" | grep -Fq \"'$BUILD'\"
echo stamp_v_refs=\$(grep -cE '\\?v=$BUILD' /tmp/meas01.html || true)
for c in talaria-homepage-1 talaria-trading-chart-1 talaria-trading-chart-worker-1; do
  I=\$(docker inspect -f '{{.Config.Image}}' \$c)
  printf '  %-32s %s\n' \"\$c\" \"\$I\"
  echo \"\$I\" | grep -Fq canary-$BUILD
done
echo MEAS01_OK
"

echo "=== 8. PACKAGE 1 payload on the wire (HTTP, browser-equivalent) ==="
"${SSH[@]}" "root@${HOST}" "set -e
B=http://127.0.0.1:3000
curl -sS -H 'Cache-Control: no-cache' \$B/chart/chart.js -o /tmp/w-eng.js
curl -sS -H 'Cache-Control: no-cache' \$B/chart/modules/order-manager.js -o /tmp/w-om.js
curl -sS -H 'Cache-Control: no-cache' \$B/chart/modules/compare-overlay.js -o /tmp/w-co.js
curl -sS -H 'Cache-Control: no-cache' \$B/chart/dist-v9/assets/talaria-v9-live.js -o /tmp/w-bun.js
for t in PAIR_SWITCH_LOAD_TIMEOUT_MS serverRewindIsNewer _sessionTimeframeRestoreEnabled; do
  n=\$(grep -c \"\$t\" /tmp/w-eng.js || true); printf '  engine   %-40s %s\n' \"\$t\" \"\$n\"; test \"\$n\" -gt 0
done
for t in _analysisOnlyFileIds _refuseAnalysisOnlyOrderIfNeeded; do
  n=\$(grep -c \"\$t\" /tmp/w-om.js || true); printf '  om       %-40s %s\n' \"\$t\" \"\$n\"; test \"\$n\" -gt 0
done
for t in _warnOverlayOutOfView _overlayFullPriceExtent; do
  n=\$(grep -c \"\$t\" /tmp/w-co.js || true); printf '  compare  %-40s %s\n' \"\$t\" \"\$n\"; test \"\$n\" -gt 0
done
for t in orderValidation __talariaGestureOwnerV1; do
  n=\$(grep -c \"\$t\" /tmp/w-bun.js || true); printf '  bundle   %-40s %s\n' \"\$t\" \"\$n\"; test \"\$n\" -gt 0
done
n=\$(grep -cE '\\.iframe\\b' /tmp/w-bun.js || true)
printf '  bundle   %-40s %s (must be 0)\n' 'no .iframe reader' \"\$n\"; test \"\$n\" -eq 0
grep -oE \"CHART_ENGINE_BUILD = '[^']+'\" /tmp/w-eng.js | head -1
grep -Fq \"CHART_ENGINE_BUILD = '$BUILD'\" /tmp/w-eng.js
echo HTTP_WIRE_OK
"

echo "=== 9. final state ==="
"${SSH[@]}" "root@${HOST}" "set -e
echo LIVE_PIN=\$(cat /root/talaria-restore/LIVE-PIN.txt)
echo PRIOR_PIN=\$(cat /root/talaria-restore/PRIOR-PIN.txt)
[ -f /root/talaria-restore/DEPLOY-IN-PROGRESS ] && echo DEPLOY_FLAG=STILL_SET || echo DEPLOY_FLAG=clear
bash /opt/talaria/deploy/deploy-freeze-guard.sh status
ls -1 /root/talaria-restore/images | tail -4
df -h / | tail -1
"
echo "CANARY_CHECKPOINT_OK build_id=$BUILD sha=$SOURCE_COMMIT_SHA"
echo "PO_SHOULD_READ=$BUILD"
