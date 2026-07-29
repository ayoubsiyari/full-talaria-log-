#!/usr/bin/env bash
# Key-auth bringup for Manager C (SSH BatchMode; no host password).
#   CHART_BUILD_ID=20260729b90 bash scripts/evidence/manager-c-w74/pinned-canary/canary-bringup-pinned-key.sh
set -euo pipefail
HOST="${TALARIA_TEST_HOST:-31.97.192.82}"
PORT="${TALARIA_TEST_SSH_PORT:-443}"
CHART_BUILD_ID="${CHART_BUILD_ID:?set CHART_BUILD_ID}"
TAG="canary-${CHART_BUILD_ID}"
HOMEPAGE_IMAGE="${HOMEPAGE_IMAGE:-talaria-homepage:${TAG}}"
TRADING_CHART_IMAGE="${TRADING_CHART_IMAGE:-talaria-trading-chart:${TAG}}"

case "$HOST" in
  *51.20.190.169*|*talaria-log.com*) echo "refusing production" >&2; exit 1 ;;
esac

SSH=(ssh -p "$PORT" -o BatchMode=yes -o StrictHostKeyChecking=accept-new)
echo "=== bring up pinned $CHART_BUILD_ID (key auth) ==="
echo "homepage=$HOMEPAGE_IMAGE chart=$TRADING_CHART_IMAGE"

"${SSH[@]}" "root@${HOST}" bash -s -- "$HOMEPAGE_IMAGE" "$TRADING_CHART_IMAGE" "$CHART_BUILD_ID" <<'REMOTE'
set -euo pipefail
HOMEPAGE_IMAGE="$1"
TRADING_CHART_IMAGE="$2"
CHART_BUILD_ID="$3"
COMPOSE_DIR=""
for d in /root/talaria /opt/talaria /srv/talaria /home/talaria; do
  if [ -f "$d/docker-compose.yml" ] || [ -f "$d/compose.yml" ]; then
    COMPOSE_DIR="$d"
    break
  fi
done
if [ -z "$COMPOSE_DIR" ]; then
  COMPOSE_DIR="$(dirname "$(docker inspect -f '{{.Config.Labels}}' talaria-homepage-1 2>/dev/null || true)" 2>/dev/null || true)"
  # Fallback: discover from running container working dir / compose project
  COMPOSE_DIR="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' talaria-homepage-1 2>/dev/null || true)"
fi
: "${COMPOSE_DIR:?could not locate compose dir}"
echo "compose_dir=$COMPOSE_DIR"
cd "$COMPOSE_DIR"
docker image inspect "$HOMEPAGE_IMAGE" >/dev/null
docker image inspect "$TRADING_CHART_IMAGE" >/dev/null
RP="/root/talaria-restore/bringup-${CHART_BUILD_ID}-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$RP"
docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' >"$RP/docker-ps-before.txt"
{
  echo "captured_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "homepage=$(docker inspect -f '{{.Image}}' talaria-homepage-1 2>/dev/null || echo MISSING)"
  echo "chart=$(docker inspect -f '{{.Image}}' talaria-trading-chart-1 2>/dev/null || echo MISSING)"
  echo "pinned_homepage=$HOMEPAGE_IMAGE"
  echo "pinned_chart=$TRADING_CHART_IMAGE"
  echo "chart_build_id=$CHART_BUILD_ID"
} >"$RP/IMAGE-PINS.txt"
export HOMEPAGE_IMAGE TRADING_CHART_IMAGE
docker compose up -d --no-build trading-chart trading-chart-worker homepage
docker compose ps
sleep 10
SHELL_LINE=$(docker exec talaria-homepage-1 sh -c 'grep -F __TALARIA_CHART_BUILD_ID /usr/share/nginx/html/chart/dist-v9/index.html | head -1' || true)
echo "shell_line=$SHELL_LINE"
echo "$SHELL_LINE" | grep -q "$CHART_BUILD_ID"
echo "CANARY_BRINGUP_PINNED_OK build_id=$CHART_BUILD_ID rp=$RP"
REMOTE
