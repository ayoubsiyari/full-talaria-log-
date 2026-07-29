#!/usr/bin/env bash
# CANARY CHECKPOINT ONE ACTION — 31.97.192.82 only.
# Restore point → sync tip tar → CHECKPOINT_BUILD compose → up → verify.
#
# Usage:
#   CHART_BUILD_ID=20260729b83 SOURCE_COMMIT_SHA=<40hex> \
#     bash canary-checkpoint-one-action.sh
#
# TARGET permanently test/canary. Prod refused.
set -euo pipefail

RELEASE_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="${REPO_ROOT:-$(cd "$RELEASE_DIR/../../../../.." && pwd)}"
OBS="$RELEASE_DIR/observations"
PROBE="$ROOT/docs/plan3/evidence/B-M4/live-surface-probe/live-surface-probe.mjs"
CENSUS="$ROOT/docs/plan3/evidence/B-M4/live-surface-probe/stamp-census.mjs"
SURF3="$ROOT/scripts/surf3-build-agreement-gate.mjs"

TARGET="${TARGET:-test}"
CHART_BUILD_ID="${CHART_BUILD_ID:?set CHART_BUILD_ID e.g. 20260729b83}"
SOURCE_COMMIT_SHA="${SOURCE_COMMIT_SHA:?set SOURCE_COMMIT_SHA}"
TAR="${TAR:-$ROOT/.scratch-canary-checkpoint.tar}"
HOST="${TALARIA_TEST_HOST:-31.97.192.82}"
PORT="${TALARIA_TEST_SSH_PORT:-443}"
BASE_URL="${TALARIA_TEST_BASE_URL:-http://31.97.192.82:3000}"

die() { echo "ERROR: $*" >&2; exit 1; }

case "$TARGET" in
  test|canary) ;;
  prod|production) die "TARGET=prod refused — talaria-log.com OUT OF SCOPE" ;;
  *) die "TARGET must be test|canary" ;;
esac
case "$HOST$BASE_URL" in
  *51.20.190.169*|*talaria-log.com*) die "refusing production host/url" ;;
esac

if [[ -n "${TALARIA_TEST_HOST_PASS_B64:-}" ]]; then
  TALARIA_TEST_HOST_PASS="$(printf '%s' "$TALARIA_TEST_HOST_PASS_B64" | base64 -d)"
  export TALARIA_TEST_HOST_PASS
fi
[[ -n "${TALARIA_TEST_HOST_PASS:-}" ]] || die "TALARIA_TEST_HOST_PASS(_B64) required"

test -f "$TAR" || die "missing tar $TAR — create with: git archive --format=tar HEAD -o $TAR"

ASK="$(mktemp)"; STAGE="$(mktemp -d)"
cleanup() { rm -f "$ASK"; rm -rf "$STAGE"; }
trap cleanup EXIT
printf '%s\n' '#!/bin/sh' 'echo "$TALARIA_TEST_HOST_PASS"' >"$ASK"
chmod 700 "$ASK"
export SSH_ASKPASS="$ASK" SSH_ASKPASS_REQUIRE=force DISPLAY="${DISPLAY:-:0}"
SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o NumberOfPasswordPrompts=1
          -o PreferredAuthentications=password -o PubkeyAuthentication=no)
SCP=(scp -P "$PORT" "${SSH_OPTS[@]}")
SSH=(ssh -p "$PORT" "${SSH_OPTS[@]}")

LOG="$OBS/checkpoint-build-up-${SOURCE_COMMIT_SHA:0:12}-${CHART_BUILD_ID}.log"
mkdir -p "$OBS"
echo "=== CANARY CHECKPOINT ONE ACTION === log=$LOG"
echo "build_id=$CHART_BUILD_ID sha=$SOURCE_COMMIT_SHA host=$HOST base_url=$BASE_URL"
echo "tar=$TAR"
# Caller should tee to $LOG; script prints to stdout/stderr only.

echo "=== 0. restore point on host ==="
"${SSH[@]}" "root@${HOST}" \
  "set -e
RP=/root/talaria-restore/canary-${CHART_BUILD_ID}-\$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p \"\$RP\"
docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' > \"\$RP/docker-ps.txt\"
{
  echo captured_at=\$(date -u +%Y-%m-%dT%H:%M:%SZ)
  echo homepage=\$(docker inspect -f '{{.Image}}' talaria-homepage-1 2>/dev/null || echo MISSING)
  echo chart=\$(docker inspect -f '{{.Image}}' talaria-trading-chart-1 2>/dev/null || echo MISSING)
  echo worker=\$(docker inspect -f '{{.Image}}' talaria-trading-chart-worker-1 2>/dev/null || echo MISSING)
} > \"\$RP/IMAGE-PINS.txt\"
ls -la \"\$RP\"
echo RESTORE_POINT_OK rp=\$RP"

echo "=== 1. sync tip tar ==="
REMOTE_TAR="/tmp/talaria-canary-${SOURCE_COMMIT_SHA:0:12}.tar"
"${SCP[@]}" "$TAR" "root@${HOST}:$REMOTE_TAR"
"${SSH[@]}" "root@${HOST}" \
  "set -e
cd /opt/talaria
tar -xf '$REMOTE_TAR'
rm -f '$REMOTE_TAR'
echo SYNC_OK sha=$SOURCE_COMMIT_SHA
test -f 'chart v 1.4/chart/multichart-prod/multichart-manager.js'
grep -q '__TALARIA_DISABLE_MC_PANEL_STATE_PURGE_V1' 'chart v 1.4/chart/multichart-prod/multichart-manager.js'
grep -q '__TALARIA_DISABLE_MC_GRID_STATE_PURGE_V1' 'chart v 1.4/talaria-design/src/MultichartGrid.jsx'
# Optional: present when P3+ shipped
if grep -q '__TALARIA_DISABLE_MC_BAR_STORE_REALM_V1' 'chart v 1.4/chart/chart.js'; then
  echo SYNC_REALM_FLAG_OK
fi
echo SYNC_PURGE_MARKERS_OK"

echo "=== 2. CHECKPOINT_BUILD compose (trading-chart + homepage) ==="
"${SSH[@]}" "root@${HOST}" \
  "set -e
cd /opt/talaria
# Tell the live-pin watchdog a deploy is in progress so it does not re-assert the
# previous build over this one mid-flight. Removed at the end of this phase.
touch /root/talaria-restore/DEPLOY-IN-PROGRESS
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
# Immutable per-build tags — survive :latest overwrite so C can re-measure.
TAG=canary-\$CHART_BUILD_ID
docker tag talaria-trading-chart:latest talaria-trading-chart:\$TAG
docker tag talaria-homepage:latest talaria-homepage:\$TAG
CHART_DIGEST=\$(docker image inspect -f '{{.Id}}' talaria-trading-chart:\$TAG)
HOME_DIGEST=\$(docker image inspect -f '{{.Id}}' talaria-homepage:\$TAG)
mkdir -p /root/talaria-restore/images
docker save talaria-homepage:\$TAG talaria-trading-chart:\$TAG \
  | gzip -1 > /root/talaria-restore/images/\$TAG.tar.gz
{
  echo tagged_at=\$(date -u +%Y-%m-%dT%H:%M:%SZ)
  echo chart_build_id=\$CHART_BUILD_ID
  echo source_commit_sha=\$SOURCE_COMMIT_SHA
  echo trading_chart_tag=talaria-trading-chart:\$TAG
  echo homepage_tag=talaria-homepage:\$TAG
  echo trading_chart_id=\$CHART_DIGEST
  echo homepage_id=\$HOME_DIGEST
  echo tar=/root/talaria-restore/images/\$TAG.tar.gz
} | tee /root/talaria-restore/PINNED-\$CHART_BUILD_ID.txt
echo IMMUTABLE_TAGS_OK tag=\$TAG
ls -lh /root/talaria-restore/images/\$TAG.tar.gz
docker compose up -d trading-chart trading-chart-worker homepage
docker compose ps
# This stamp is now the intended live build; the watchdog defends it.
echo \$CHART_BUILD_ID > /root/talaria-restore/LIVE-PIN.txt
rm -f /root/talaria-restore/DEPLOY-IN-PROGRESS
echo LIVE_PIN_SET=\$CHART_BUILD_ID
# Cap the rollback store at the one moment it grows. Runs AFTER the pin is written,
# so the build that just shipped is protected as live-pin on its first pass. Never
# fatal: a retention failure must not fail a ship that already succeeded.
if [ -x /root/talaria-restore/canary-image-retention.sh ]; then
  /root/talaria-restore/canary-image-retention.sh --apply || echo RETENTION_NONFATAL_FAIL
fi
echo UP_DONE=\$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "=== 3. settle ==="
sleep "${TALARIA_POST_RESTART_SLEEP_SEC:-20}"

NODE_BIN="${NODE_BIN:-}"
if [[ -z "$NODE_BIN" ]]; then
  if command -v node >/dev/null 2>&1 && [[ "$(command -v node)" != *.exe ]]; then
    NODE_BIN="$(command -v node)"
  elif [[ -x "/mnt/c/Program Files/nodejs/node.exe" ]]; then
    NODE_BIN="/mnt/c/Program Files/nodejs/node.exe"
  else
    die "node not found"
  fi
fi
to_node_path() {
  local p="$1"
  case "$NODE_BIN" in
    *.exe)
      if command -v wslpath >/dev/null 2>&1; then wslpath -w "$p"
      else
        local rest="${p#/mnt/}"; local drive="${rest%%/*}"; local tail="${rest#*/}"
        printf '%s:\\%s\n' "$(printf '%s' "$drive" | tr '[:lower:]' '[:upper:]')" "${tail////\\}"
      fi ;;
    *) printf '%s\n' "$p" ;;
  esac
}

OBS_DIR="$ROOT/docs/plan3/evidence/B-M4/live-surface-probe/observations"
mkdir -p "$OBS_DIR"

echo "=== 4a. journalVouchedFor PRESENT + deploy-gate (waive stampInert) ==="
PROBE_LOG="$(mktemp)"
set +e
"$NODE_BIN" "$(to_node_path "$PROBE")" \
  --base-url="$BASE_URL" \
  --module=/chart/modules/order-manager.js \
  --marker=journalVouchedFor \
  --deploy-gate \
  --waive-stamp-inert \
  --out="$(to_node_path "$OBS_DIR")" | tee "$PROBE_LOG"
PROBE_RC=$?
set -e
grep -qE 'PRESENT[[:space:]]+journalVouchedFor' "$PROBE_LOG" || die "journalVouchedFor not PRESENT"
[[ "$PROBE_RC" -eq 0 ]] || die "deploy-gate exit=$PROBE_RC"

echo "=== 4b. stamp-census holes=0 vs $CHART_BUILD_ID ==="
if [[ -f "$CENSUS" ]]; then
  "$NODE_BIN" "$(to_node_path "$CENSUS")" \
    --base-url="$BASE_URL" \
    --current="$CHART_BUILD_ID" \
    --json || die "stamp-census failed"
else
  echo "WARN: stamp-census.mjs missing — skipping file; using SURF-3 + probe"
fi

echo "=== 4c. SURF-3 fixture RED + live GREEN ==="
set +e
"$NODE_BIN" "$(to_node_path "$SURF3")" --fixture
FIX_RC=$?
set -e
[[ "$FIX_RC" -ne 0 ]] || die "SURF-3 fixture went GREEN — broken"
echo "SURF3_FIXTURE_RED_OK exit=$FIX_RC"
if [[ -n "${SURF3_COOKIE:-}" ]]; then
  "$NODE_BIN" "$(to_node_path "$SURF3")" --base-url="$BASE_URL" --cookie="$SURF3_COOKIE" --json \
    || die "SURF-3 live not GREEN"
  echo "SURF3_LIVE_GREEN_OK"
elif [[ -n "${TEST_EMAIL:-}" && -n "${TEST_PASSWORD:-}" ]]; then
  # Embed creds in the temp script: Windows node.exe does not reliably inherit
  # bash-prefixed env vars when launched from WSL.
  COOKIE_JS="$STAGE/get-cookie.mjs"
  python3 - <<PY
from pathlib import Path
import json
p = Path(r'''$COOKIE_JS''')
base = json.dumps('''$BASE_URL''')
email = json.dumps('''$TEST_EMAIL''')
password = json.dumps('''$TEST_PASSWORD''')
p.write_text(f"""const base = {base};
const email = {email};
const password = {password};
const r = await fetch(base + '/api/auth/login', {{
  method: 'POST',
  headers: {{ 'content-type': 'application/json' }},
  body: JSON.stringify({{ email, password }}),
}});
const set = r.headers.getSetCookie?.() || [];
const raw = set.length ? set : [r.headers.get('set-cookie')].filter(Boolean);
const cookie = raw.map((c) => String(c).split(';')[0]).join('; ');
if (!r.ok || !cookie) {{ console.error('login failed', r.status); process.exit(2); }}
process.stdout.write(cookie);
""", encoding='utf-8')
PY
  SURF3_COOKIE="$("$NODE_BIN" "$(to_node_path "$COOKIE_JS")")"
  rm -f "$COOKIE_JS"
  export SURF3_COOKIE
  "$NODE_BIN" "$(to_node_path "$SURF3")" \
    --base-url="$BASE_URL" --cookie="$SURF3_COOKIE" --json \
    || die "SURF-3 live not GREEN"
  echo "SURF3_LIVE_GREEN_OK"
else
  die "SURF-3 live requires SURF3_COOKIE or TEST_EMAIL+TEST_PASSWORD"
fi

echo "=== 4d. purge / leak flags reachable on deployed surface ==="
"${SSH[@]}" "root@${HOST}" \
  "set -e
docker exec talaria-homepage-1 sh -c 'grep -c __TALARIA_DISABLE_MC_PANEL_STATE_PURGE_V1 /usr/share/nginx/html/chart/multichart-prod/multichart-manager.js'
docker exec talaria-homepage-1 sh -c 'grep -c __TALARIA_DISABLE_MC_CLEARFILE_ON_REMOVE_V1 /usr/share/nginx/html/chart/multichart-prod/multichart-manager.js'
COUNT=\$(docker exec talaria-homepage-1 sh -c 'grep -Rcl __TALARIA_DISABLE_MC_GRID_STATE_PURGE_V1 /usr/share/nginx/html/chart/dist-v9 2>/dev/null | wc -l')
test \"\$COUNT\" -ge 1
echo PURGE_FLAGS_REACHABLE panel+grid+clearfile
docker exec talaria-homepage-1 sh -c 'grep -F __TALARIA_CHART_BUILD_ID /usr/share/nginx/html/chart/dist-v9/index.html | head -1' | tee /tmp/shell-stamp.txt
grep -q \"$CHART_BUILD_ID\" /tmp/shell-stamp.txt
echo shell_stamp_ok
"

echo "CANARY_CHECKPOINT_OK build_id=$CHART_BUILD_ID sha=$SOURCE_COMMIT_SHA"
