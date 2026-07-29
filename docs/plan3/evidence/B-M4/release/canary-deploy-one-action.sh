#!/usr/bin/env bash
# CANARY DEPLOY MECHANISM — Plan 3 surface only: 31.97.192.82
#
# ONE ACTION: restore → two-file ship → restart chart workers →
#   journalVouchedFor PRESENT → (optional) SURF-3 live GREEN + fixture RED.
#
# Usage:
#   ./canary-deploy-one-action.sh
#   TARGET=test ./canary-deploy-one-action.sh          # TARGET=test|canary only
#   SURF3_COOKIE='...' ./canary-deploy-one-action.sh   # also run SURF-3 live
#
# Auth: TALARIA_TEST_HOST_PASS or TALARIA_TEST_HOST_PASS_B64 (SSH port 443).
#
# OUT OF SCOPE: talaria-log.com / 51.20.190.169 — prod branch removed; refused.
# Ship floor: b82. Destroy nothing.
set -euo pipefail

RELEASE_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="${REPO_ROOT:-$(cd "$RELEASE_DIR/../../../../.." && pwd)}"
REMOTE_SH="$RELEASE_DIR/canary-deploy-remote.sh"
PROBE="$ROOT/docs/plan3/evidence/B-M4/live-surface-probe/live-surface-probe.mjs"
SURF3="$ROOT/scripts/surf3-build-agreement-gate.mjs"
API_SRC="$ROOT/chart v 1.4/chart/api_server.py"
OM_SRC="$ROOT/chart v 1.4/chart/modules/order-manager.js"

TARGET="${TARGET:-test}"
DRY_RUN="${DRY_RUN:-0}"
SHIP_FLOOR="${SHIP_FLOOR:-20260728b82}"

die() { echo "ERROR: $*" >&2; exit 1; }

case "$TARGET" in
  test|canary) ;;
  prod|production)
    die "TARGET=$TARGET refused. talaria-log.com / 51.20.190.169 are OUT OF SCOPE for Plan 3. Use canary host 31.97.192.82 only."
    ;;
  *)
    die "TARGET must be test or canary (got: $TARGET). Prod branch permanently removed."
    ;;
esac

test -f "$API_SRC" || die "missing api_server.py at $API_SRC"
test -f "$OM_SRC" || die "missing order-manager.js at $OM_SRC"
test -f "$REMOTE_SH" || die "missing remote script"
test -f "$PROBE" || die "missing live-surface-probe.mjs"
grep -q 'JOURNAL_SWEEP_PARSE_GUARD' "$API_SRC" || die "tip api_server.py lacks JOURNAL_SWEEP_PARSE_GUARD"
grep -q 'journalVouchedFor' "$OM_SRC" || die "tip order-manager.js lacks journalVouchedFor"

HOST="${TALARIA_TEST_HOST:-31.97.192.82}"
PORT="${TALARIA_TEST_SSH_PORT:-443}"
BASE_URL="${TALARIA_TEST_BASE_URL:-http://31.97.192.82:3000}"

# Hard refuse any accidental prod origin
case "$HOST$BASE_URL" in
  *51.20.190.169*|*talaria-log.com*)
    die "refusing host/base_url that looks like production ($HOST / $BASE_URL)"
    ;;
esac

if [[ -n "${TALARIA_TEST_HOST_PASS_B64:-}" ]]; then
  TALARIA_TEST_HOST_PASS="$(printf '%s' "$TALARIA_TEST_HOST_PASS_B64" | base64 -d)"
  export TALARIA_TEST_HOST_PASS
fi
[[ -n "${TALARIA_TEST_HOST_PASS:-}" ]] || die "TALARIA_TEST_HOST_PASS(_B64) required"

echo "=== CANARY DEPLOY ONE ACTION ==="
echo "target=$TARGET host=$HOST port=$PORT base_url=$BASE_URL ship_floor=$SHIP_FLOOR"
echo "api=$API_SRC"
echo "om=$OM_SRC"
echo "scope=31.97.192.82 only · prod=OUT_OF_SCOPE · destroy=nothing"

if [[ "$DRY_RUN" == "1" ]]; then
  echo "DRY_RUN=1 — stop before SSH"
  exit 0
fi

ASK="$(mktemp)"
STAGE="$(mktemp -d)"
cleanup() { rm -f "$ASK"; rm -rf "$STAGE"; }
trap cleanup EXIT

printf '%s\n' '#!/bin/sh' 'echo "$TALARIA_TEST_HOST_PASS"' >"$ASK"
chmod 700 "$ASK"
export SSH_ASKPASS="$ASK" SSH_ASKPASS_REQUIRE=force DISPLAY="${DISPLAY:-:0}"

SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o NumberOfPasswordPrompts=1
          -o PreferredAuthentications=password -o PubkeyAuthentication=no)
SCP=(scp -P "$PORT" "${SSH_OPTS[@]}")
SSH=(ssh -p "$PORT" "${SSH_OPTS[@]}")

echo "=== upload tip bytes + remote script ==="
cp "$REMOTE_SH" "$STAGE/canary-deploy-remote.sh"
cp "$API_SRC" "$STAGE/talaria-canary-api_server.py"
cp "$OM_SRC" "$STAGE/talaria-canary-order-manager.js"
sed -i 's/\r$//' "$STAGE/canary-deploy-remote.sh" || true
"${SCP[@]}" \
  "$STAGE/canary-deploy-remote.sh" \
  "$STAGE/talaria-canary-api_server.py" \
  "$STAGE/talaria-canary-order-manager.js" \
  "root@${HOST}:/tmp/"
REMOTE_API=/tmp/talaria-canary-api_server.py
REMOTE_OM=/tmp/talaria-canary-order-manager.js
"${SSH[@]}" "root@${HOST}" \
  "chmod +x /tmp/canary-deploy-remote.sh; \
   bash /tmp/canary-deploy-remote.sh '$REMOTE_API' '$REMOTE_OM'; \
   rm -f /tmp/canary-deploy-remote.sh '$REMOTE_API' '$REMOTE_OM'"

echo "=== same-session verify: journalVouchedFor PRESENT ==="
sleep "${TALARIA_POST_RESTART_SLEEP_SEC:-8}"
OBS_DIR="$ROOT/docs/plan3/evidence/B-M4/live-surface-probe/observations"
mkdir -p "$OBS_DIR"
NODE_BIN="${NODE_BIN:-}"
if [[ -z "$NODE_BIN" ]]; then
  if command -v node >/dev/null 2>&1 && [[ "$(command -v node)" != *.exe ]]; then
    NODE_BIN="$(command -v node)"
  elif [[ -x "/mnt/c/Program Files/nodejs/node.exe" ]]; then
    NODE_BIN="/mnt/c/Program Files/nodejs/node.exe"
  elif command -v node.exe >/dev/null 2>&1; then
    NODE_BIN="$(command -v node.exe)"
  else
    die "node not found (set NODE_BIN=...). Remote ship already completed — run probe manually against $BASE_URL"
  fi
fi
to_node_path() {
  local p="$1"
  case "$NODE_BIN" in
    *.exe)
      if command -v wslpath >/dev/null 2>&1; then
        wslpath -w "$p"
      else
        local rest="${p#/mnt/}"
        local drive="${rest%%/*}"
        local tail="${rest#*/}"
        printf '%s:\\%s\n' "$(printf '%s' "$drive" | tr '[:lower:]' '[:upper:]')" "${tail////\\}"
      fi
      ;;
    *)
      printf '%s\n' "$p"
      ;;
  esac
}
PROBE_ARG="$(to_node_path "$PROBE")"
OBS_ARG="$(to_node_path "$OBS_DIR")"
PROBE_LOG="$(mktemp)"
set +e
"$NODE_BIN" "$PROBE_ARG" \
  --base-url="$BASE_URL" \
  --module=/chart/modules/order-manager.js \
  --marker=journalVouchedFor \
  --no-stamp-inert-check \
  --out="$OBS_ARG" | tee "$PROBE_LOG"
PROBE_RC=$?
set -e

if ! grep -qE 'PRESENT[[:space:]]+journalVouchedFor' "$PROBE_LOG"; then
  die "journalVouchedFor not PRESENT (exit=$PROBE_RC) — canary deploy verify FAILED"
fi
if grep -qE 'ABSENT[[:space:]]+journalVouchedFor' "$PROBE_LOG"; then
  die "journalVouchedFor ABSENT — canary deploy verify FAILED"
fi

echo "=== SURF-3 post-deploy ==="
test -f "$SURF3" || die "missing surf3-build-agreement-gate.mjs"
SURF3_ARG="$(to_node_path "$SURF3")"
# Fixture must stay RED forever (GATE-01)
set +e
"$NODE_BIN" "$SURF3_ARG" --fixture
FIX_RC=$?
set -e
if [[ "$FIX_RC" -eq 0 ]]; then
  die "SURF-3 --fixture went GREEN — gate is broken (must stay RED)"
fi
echo "SURF3_FIXTURE_RED_OK exit=$FIX_RC"

if [[ -n "${SURF3_COOKIE:-}" ]]; then
  set +e
  "$NODE_BIN" "$SURF3_ARG" --base-url="$BASE_URL" --cookie="$SURF3_COOKIE" --json
  LIVE_RC=$?
  set -e
  [[ "$LIVE_RC" -eq 0 ]] || die "SURF-3 live not GREEN (exit=$LIVE_RC)"
  echo "SURF3_LIVE_GREEN_OK"
else
  echo "SURF3_LIVE_SKIPPED (set SURF3_COOKIE to require live GREEN this run)"
fi

echo "CANARY_DEPLOY_OK host=$HOST base_url=$BASE_URL ship_floor=$SHIP_FLOOR marker=journalVouchedFor PRESENT"
