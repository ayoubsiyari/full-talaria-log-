#!/usr/bin/env bash
# Reconstitute the b103 artifact that retention destroyed, from its recorded sha.
# Build and tag ONLY. No compose up, no LIVE-PIN write: the wire stays on b104.
# :latest is restored to b104 at the end, because `docker compose build` moves it
# and a watchdog restart with no image env would otherwise serve b103 code.
set -euo pipefail
ROOT="/mnt/c/Users/user/Desktop/talaria1/manager-b-plan3"
HOST=31.97.192.82
PORT=443
BID=20260729b103
SHA=153c835e249b159d65b7a551f4045bd97239c459
TIP_SHA="$(tr -d '\r\n' <"$ROOT/docs/plan3/evidence/B-M4/release/observations/.ship-tip-sha.txt")"
SSH=(ssh -p "$PORT" -o BatchMode=yes -o ConnectTimeout=30 -o StrictHostKeyChecking=accept-new)
SCP=(scp -P "$PORT" -o BatchMode=yes -o ConnectTimeout=30 -o StrictHostKeyChecking=accept-new)
OBS="$ROOT/docs/plan3/evidence/B-M4/release/observations"
exec > >(tee "$OBS/b103-artifact-rebuild.log") 2>&1

echo "=== REBUILD b103 ARTIFACT === bid=$BID sha=$SHA (wire stays $TIP_SHA / b104)"

echo "=== -1. interlock: never build under a live measurement ==="
"${SSH[@]}" "root@${HOST}" 'if [ -f /root/talaria-restore/MEASUREMENT-IN-PROGRESS ]; then echo MEASUREMENT_IN_PROGRESS=yes; cat /root/talaria-restore/MEASUREMENT-IN-PROGRESS; exit 9; fi; echo MEASUREMENT_IN_PROGRESS=no'

echo "=== 0. record what is live now, to assert it is unchanged at the end ==="
"${SSH[@]}" "root@${HOST}" "docker inspect -f '{{.Config.Image}}' talaria-homepage-1 talaria-trading-chart-1; cat /root/talaria-restore/LIVE-PIN.txt"

echo "=== 1. source tars: b103 sha, and the tip to restore the tree afterwards ==="
# The tar is produced by Windows git before this script runs: this is a git
# worktree whose .git file holds a Windows path, so git inside WSL cannot read it.
test -s "$ROOT/.scratch-b103-source.tar"
ls -la "$ROOT/.scratch-b103-source.tar"
"${SCP[@]}" "$ROOT/.scratch-b103-source.tar" "root@${HOST}:/tmp/b103-source.tar"
"${SCP[@]}" "$ROOT/.scratch-canary-checkpoint.tar" "root@${HOST}:/tmp/tip-source.tar"

echo "=== 2. build b103 from its own source, tag, save tar ==="
"${SSH[@]}" "root@${HOST}" "set -e
cd /opt/talaria
tar -xf /tmp/b103-source.tar
export CHECKPOINT_BUILD=1
echo B103_BUILD_START=\$(date -u +%Y-%m-%dT%H:%M:%SZ)
docker compose build --build-arg CHECKPOINT_BUILD=1 --build-arg CHART_BUILD_ID=$BID --build-arg SOURCE_COMMIT_SHA=$SHA trading-chart homepage
echo B103_BUILD_DONE=\$(date -u +%Y-%m-%dT%H:%M:%SZ)
TAG=canary-$BID
docker tag talaria-trading-chart:latest talaria-trading-chart:\$TAG
docker tag talaria-homepage:latest talaria-homepage:\$TAG
mkdir -p /root/talaria-restore/images
docker save talaria-homepage:\$TAG talaria-trading-chart:\$TAG | gzip -1 > /root/talaria-restore/images/\$TAG.tar.gz
{
  echo tagged_at=\$(date -u +%Y-%m-%dT%H:%M:%SZ)
  echo chart_build_id=$BID
  echo source_commit_sha=$SHA
  echo trading_chart_tag=talaria-trading-chart:\$TAG
  echo homepage_tag=talaria-homepage:\$TAG
  echo tar=/root/talaria-restore/images/\$TAG.tar.gz
  echo provenance=REBUILT-2026-07-30-from-recorded-sha-after-retention-loss
  echo caveat=source-identical-to-the-graded-build-image-layers-rebuilt-not-byte-identical
} | tee /root/talaria-restore/PINNED-$BID.txt
echo B103_ARTIFACT_OK"

echo "=== 3. put the tree and :latest back to the tip, so nothing can drift to b103 ==="
"${SSH[@]}" "root@${HOST}" "set -e
cd /opt/talaria
tar -xf /tmp/tip-source.tar
rm -f /tmp/b103-source.tar /tmp/tip-source.tar
docker tag talaria-trading-chart:canary-20260729b104 talaria-trading-chart:latest
docker tag talaria-homepage:canary-20260729b104 talaria-homepage:latest
echo LATEST_RESTORED_TO=b104"

echo "=== 4. the wire must be untouched: b104 still live, b103 present as an artifact ==="
"${SSH[@]}" "root@${HOST}" "set -e
echo live_pin=\$(cat /root/talaria-restore/LIVE-PIN.txt)
docker inspect -f 'running={{.Config.Image}}' talaria-homepage-1 talaria-trading-chart-1
STAMP=\$(curl -sS -H 'Cache-Control: no-cache' http://127.0.0.1:3000/chart/dist-v9/index.html | grep -oE \"window\\.__TALARIA_CHART_BUILD_ID='[^']+'\" | head -1)
echo SERVED_STAMP=\$STAMP
echo \"\$STAMP\" | grep -Fq \"'20260729b104'\" && echo WIRE_UNCHANGED_OK
ls -la /root/talaria-restore/images/ | grep -E 'b103|b104'
docker images --format '{{.Repository}}:{{.Tag}}' | grep -E 'canary-20260729b10[34]|:latest' | sort"

echo B103_REBUILD_COMPLETE
