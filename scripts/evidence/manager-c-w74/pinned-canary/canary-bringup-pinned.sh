#!/usr/bin/env bash
# Bring up a historical canary checkpoint from immutable local tags.
#
#   CHART_BUILD_ID=20260729b85 bash canary-bringup-pinned.sh
#
# Requires images already tagged on the host:
#   talaria-homepage:canary-<id>
#   talaria-trading-chart:canary-<id>
#
# WARNING: replaces the live canary stack. Take a restore point first.
# Does not rebuild. Does not touch production.
set -euo pipefail
HOST="${TALARIA_TEST_HOST:-31.97.192.82}"
PORT="${TALARIA_TEST_SSH_PORT:-443}"
CHART_BUILD_ID="${CHART_BUILD_ID:?set CHART_BUILD_ID e.g. 20260729b85}"
TAG="canary-${CHART_BUILD_ID}"
HOMEPAGE_IMAGE="${HOMEPAGE_IMAGE:-talaria-homepage:${TAG}}"
TRADING_CHART_IMAGE="${TRADING_CHART_IMAGE:-talaria-trading-chart:${TAG}}"

case "$HOST" in
  *51.20.190.169*|*talaria-log.com*) echo "refusing production" >&2; exit 1 ;;
esac

if [[ -n "${TALARIA_TEST_HOST_PASS_B64:-}" ]]; then
  TALARIA_TEST_HOST_PASS="$(printf '%s' "$TALARIA_TEST_HOST_PASS_B64" | base64 -d)"
  export TALARIA_TEST_HOST_PASS
fi
[[ -n "${TALARIA_TEST_HOST_PASS:-}" ]] || { echo "TALARIA_TEST_HOST_PASS(_B64) required" >&2; exit 1; }

ASK="$(mktemp)"
cleanup() { rm -f "$ASK"; }
trap cleanup EXIT
printf '%s\n' '#!/bin/sh' 'echo "$TALARIA_TEST_HOST_PASS"' >"$ASK"
chmod 700 "$ASK"
export SSH_ASKPASS="$ASK" SSH_ASKPASS_REQUIRE=force DISPLAY="${DISPLAY:-:0}"
SSH=(ssh -p "$PORT" -o StrictHostKeyChecking=accept-new -o NumberOfPasswordPrompts=1
     -o PreferredAuthentications=password -o PubkeyAuthentication=no)

echo "=== bring up pinned $CHART_BUILD_ID ==="
echo "homepage=$HOMEPAGE_IMAGE chart=$TRADING_CHART_IMAGE"

"${SSH[@]}" "root@${HOST}" \
  "set -e
cd /opt/talaria
docker image inspect '$HOMEPAGE_IMAGE' >/dev/null
docker image inspect '$TRADING_CHART_IMAGE' >/dev/null
RP=/root/talaria-restore/bringup-${CHART_BUILD_ID}-\$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p \"\$RP\"
docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' > \"\$RP/docker-ps-before.txt\"
{
  echo captured_at=\$(date -u +%Y-%m-%dT%H:%M:%SZ)
  echo homepage=\$(docker inspect -f '{{.Image}}' talaria-homepage-1 2>/dev/null || echo MISSING)
  echo chart=\$(docker inspect -f '{{.Image}}' talaria-trading-chart-1 2>/dev/null || echo MISSING)
  echo pinned_homepage=$HOMEPAGE_IMAGE
  echo pinned_chart=$TRADING_CHART_IMAGE
  echo chart_build_id=$CHART_BUILD_ID
} > \"\$RP/IMAGE-PINS.txt\"
export HOMEPAGE_IMAGE='$HOMEPAGE_IMAGE'
export TRADING_CHART_IMAGE='$TRADING_CHART_IMAGE'
docker compose up -d --no-build trading-chart trading-chart-worker homepage
docker compose ps
# Verify stamp in shell
sleep 8
SHELL_LINE=\$(docker exec talaria-homepage-1 sh -c 'grep -F __TALARIA_CHART_BUILD_ID /usr/share/nginx/html/chart/dist-v9/index.html | head -1' || true)
echo \"shell_line=\$SHELL_LINE\"
echo \"\$SHELL_LINE\" | grep -q '$CHART_BUILD_ID'
echo CANARY_BRINGUP_PINNED_OK build_id=$CHART_BUILD_ID rp=\$RP
"
