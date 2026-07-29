#!/usr/bin/env bash
# Rebuild a historical tip as immutable canary-<build_id> tags WITHOUT replacing
# the live stack. Restores :latest to LIVE_PIN_BUILD_ID after build.
# Also writes a gzipped docker-save under /root/talaria-restore/images/.
#
# Usage:
#   LIVE_PIN_BUILD_ID=20260729b90 \
#   CHART_BUILD_ID=20260729b85 \
#   SOURCE_COMMIT_SHA=294fef744ca8a49a8f20f8a8348ea2de4491aa97 \
#   bash canary-rebuild-pinned.sh
#
# TARGET permanently test/canary. Prod refused.
set -euo pipefail

RELEASE_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="${REPO_ROOT:-$(cd "$RELEASE_DIR/../../../../.." && pwd)}"
OBS="$RELEASE_DIR/observations"

TARGET="${TARGET:-test}"
CHART_BUILD_ID="${CHART_BUILD_ID:?}"
SOURCE_COMMIT_SHA="${SOURCE_COMMIT_SHA:?}"
LIVE_PIN_BUILD_ID="${LIVE_PIN_BUILD_ID:?}"
CANARY_TAG="canary-${CHART_BUILD_ID}"
LIVE_TAG="canary-${LIVE_PIN_BUILD_ID}"
TAR="${TAR:-$ROOT/.scratch-canary-rebuild-${CHART_BUILD_ID}.tar}"
HOST="${TALARIA_TEST_HOST:-31.97.192.82}"
PORT="${TALARIA_TEST_SSH_PORT:-443}"

die() { echo "ERROR: $*" >&2; exit 1; }

case "$TARGET" in
  test|canary) ;;
  prod|production) die "TARGET=prod refused — talaria-log.com OUT OF SCOPE" ;;
  *) die "TARGET must be test|canary" ;;
esac
case "$HOST" in
  *51.20.190.169*|*talaria-log.com*) die "refusing production host" ;;
esac
if ! [[ "$CHART_BUILD_ID" =~ ^[0-9]{8}b[0-9]+$ ]]; then
  die "CHART_BUILD_ID must look like YYYYMMDDbN"
fi
if ! [[ "$SOURCE_COMMIT_SHA" =~ ^[0-9a-f]{7,40}$ ]]; then
  die "SOURCE_COMMIT_SHA invalid"
fi

if [[ -n "${TALARIA_TEST_HOST_PASS_B64:-}" ]]; then
  TALARIA_TEST_HOST_PASS="$(printf '%s' "$TALARIA_TEST_HOST_PASS_B64" | base64 -d)"
  export TALARIA_TEST_HOST_PASS
fi
[[ -n "${TALARIA_TEST_HOST_PASS:-}" ]] || die "TALARIA_TEST_HOST_PASS(_B64) required"

ASK="$(mktemp)"
cleanup() { rm -f "$ASK" "$TAR"; }
trap cleanup EXIT
printf '%s\n' '#!/bin/sh' 'echo "$TALARIA_TEST_HOST_PASS"' >"$ASK"
chmod 700 "$ASK"
export SSH_ASKPASS="$ASK" SSH_ASKPASS_REQUIRE=force DISPLAY="${DISPLAY:-:0}"
SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o NumberOfPasswordPrompts=1
          -o PreferredAuthentications=password -o PubkeyAuthentication=no)
SCP=(scp -P "$PORT" "${SSH_OPTS[@]}")
SSH=(ssh -p "$PORT" "${SSH_OPTS[@]}")

mkdir -p "$OBS"
LOG="$OBS/rebuild-pinned-${CHART_BUILD_ID}.log"
echo "=== REBUILD PINNED === log=$LOG"
echo "build_id=$CHART_BUILD_ID sha=$SOURCE_COMMIT_SHA live_pin=$LIVE_PIN_BUILD_ID"

# Live pin must already exist so we can restore :latest.
"${SSH[@]}" "root@${HOST}" \
  "docker image inspect 'talaria-homepage:${LIVE_TAG}' >/dev/null \
   && docker image inspect 'talaria-trading-chart:${LIVE_TAG}' >/dev/null \
   && echo LIVE_PIN_OK ${LIVE_TAG}"

echo "=== archive tip ==="
if [[ "${SKIP_GIT_ARCHIVE:-0}" == "1" ]]; then
  test -f "$TAR" || die "SKIP_GIT_ARCHIVE=1 but missing tar $TAR"
else
  # Prefer host git when ROOT is a Windows worktree (WSL cannot resolve win gitdir).
  if command -v git.exe >/dev/null 2>&1 && [[ "$ROOT" == /mnt/c/* ]]; then
    WIN_ROOT="$(printf '%s' "$ROOT" | sed 's|^/mnt/c/|C:/|; s|/|\\|g')"
    git.exe -C "$WIN_ROOT" archive --format=tar "${SOURCE_COMMIT_SHA}" -o "$TAR"
  else
    git -C "$ROOT" archive --format=tar "${SOURCE_COMMIT_SHA}" -o "$TAR"
  fi
fi
test -f "$TAR"

echo "=== sync + rebuild (no up) ==="
REMOTE_TAR="/tmp/talaria-rebuild-${CHART_BUILD_ID}.tar"
"${SCP[@]}" "$TAR" "root@${HOST}:$REMOTE_TAR"
"${SSH[@]}" "root@${HOST}" \
  "set -e
cd /opt/talaria
tar -xf '$REMOTE_TAR'
rm -f '$REMOTE_TAR'
export CHECKPOINT_BUILD=1
export CHART_BUILD_ID=$CHART_BUILD_ID
export SOURCE_COMMIT_SHA=$SOURCE_COMMIT_SHA
unset TRADING_CHART_IMAGE HOMEPAGE_IMAGE || true
echo BUILD_START=\$(date -u +%Y-%m-%dT%H:%M:%SZ)
docker compose build \
  --build-arg CHECKPOINT_BUILD=1 \
  --build-arg CHART_BUILD_ID=$CHART_BUILD_ID \
  --build-arg SOURCE_COMMIT_SHA=$SOURCE_COMMIT_SHA \
  trading-chart homepage
echo BUILD_DONE=\$(date -u +%Y-%m-%dT%H:%M:%SZ)

TAG=$CANARY_TAG
LIVE_TAG=$LIVE_TAG
docker tag talaria-trading-chart:latest talaria-trading-chart:\$TAG
docker tag talaria-homepage:latest talaria-homepage:\$TAG

# Restore :latest to live pin — do NOT compose up.
docker tag talaria-homepage:\$LIVE_TAG talaria-homepage:latest
docker tag talaria-trading-chart:\$LIVE_TAG talaria-trading-chart:latest

HP_ID=\$(docker image inspect -f '{{.Id}}' talaria-homepage:\$TAG)
TC_ID=\$(docker image inspect -f '{{.Id}}' talaria-trading-chart:\$TAG)
mkdir -p /root/talaria-restore/images
echo SAVE_START=\$(date -u +%Y-%m-%dT%H:%M:%SZ)
docker save talaria-homepage:\$TAG talaria-trading-chart:\$TAG \
  | gzip -1 > /root/talaria-restore/images/\$TAG.tar.gz
echo SAVE_DONE=\$(date -u +%Y-%m-%dT%H:%M:%SZ)
ls -lh /root/talaria-restore/images/\$TAG.tar.gz

{
  echo tagged_at=\$(date -u +%Y-%m-%dT%H:%M:%SZ)
  echo chart_build_id=$CHART_BUILD_ID
  echo source_commit_sha=$SOURCE_COMMIT_SHA
  echo trading_chart_tag=talaria-trading-chart:\$TAG
  echo homepage_tag=talaria-homepage:\$TAG
  echo trading_chart_id=\$TC_ID
  echo homepage_id=\$HP_ID
  echo tar=/root/talaria-restore/images/\$TAG.tar.gz
  echo live_pin_restored=\$LIVE_TAG
  echo note=rebuild-pinned-no-up
} | tee /root/talaria-restore/PINNED-$CHART_BUILD_ID.txt

echo LIVE_CONTAINERS:
docker inspect -f '{{.Name}} {{.Image}}' talaria-homepage-1 talaria-trading-chart-1 2>/dev/null || true
echo REBUILD_PINNED_OK build_id=$CHART_BUILD_ID tag=\$TAG
" | tee "$LOG"

echo "=== DONE rebuild-pinned $CHART_BUILD_ID (live still $LIVE_PIN_BUILD_ID) ==="
