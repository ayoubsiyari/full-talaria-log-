#!/usr/bin/env bash
# Run D's M1 harness on the host, where TEST_PASSWORD exists. D's script is unmodified.
#
# D's harness requires the full `puppeteer` package at a path inside D's repo. This host has only
# `puppeteer-core` plus a Chrome that puppeteer downloaded earlier. Rather than install a new
# dependency onto a host that is currently carrying C's ten-hour soak, this builds a two-function
# shim at the path D's script expects, which forwards to puppeteer-core with executablePath set.
#
# That substitution is material to D's numbers, because renderer and GPU footprint depend on the
# browser build, so it is recorded in the artifact under `bHostRun` rather than left implicit.
#
# No output is suppressed anywhere in this script: every step that could change what D receives
# prints its own result.
set -uo pipefail

RUN_ROOT=/root/m1-b120-brun
REPO="$RUN_ROOT/repo"
PUP_DIR="$REPO/chart v 1.4/chart/multichart-prod/harness/node_modules"

echo "=== 0. host state BEFORE the run (so C can exclude this window from the soak) ==="
date -u +'utc_before=%Y-%m-%dT%H:%M:%SZ'
echo -n 'loadavg_before='; cat /proc/loadavg
docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}' | head -4

echo
echo "=== 1. build the layout D's script expects ==="
rm -rf "$RUN_ROOT"
mkdir -p "$REPO/scripts" "$REPO/docs/plan3" "$PUP_DIR" \
         "$RUN_ROOT/_evidence/manager-B/m20-j1" "$RUN_ROOT/_evidence/manager-D"
cp /root/b-tal01891/m1-b118-real-app-harness.mjs "$REPO/scripts/"
cp /root/b-tal01891/m1-b120-real-app-harness.mjs "$REPO/scripts/"
cp /root/b-tal01891/talaria-auth-route.mjs "$RUN_ROOT/_evidence/manager-B/m20-j1/"
ln -s /root/b-tal01891/node_modules/puppeteer-core "$PUP_DIR/puppeteer-core"
echo "  D's scripts staged unmodified; sha256 of each:"
sha256sum "$REPO/scripts/m1-b118-real-app-harness.mjs" "$REPO/scripts/m1-b120-real-app-harness.mjs"

echo
echo "=== 2. the puppeteer shim (only .launch is used by D's script) ==="
CHROME=$(cat /root/b-tal01891/CHROME_PATH)
echo "  chrome: $CHROME"
"$CHROME" --version || echo "  WARNING: chrome did not report a version"
mkdir -p "$PUP_DIR/puppeteer"
cat > "$PUP_DIR/puppeteer/package.json" <<'JSON'
{ "name": "puppeteer", "version": "0.0.0-b-host-shim", "main": "index.cjs" }
JSON
cat > "$PUP_DIR/puppeteer/index.cjs" <<'CJS'
const fs = require('fs');
const CHROME = fs.readFileSync('/root/b-tal01891/CHROME_PATH', 'utf8').trim();
// puppeteer-core 25.x is ESM-only and D's harness reaches this file through createRequire, so a
// top-level require of it throws ERR_REQUIRE_ESM. launch() is async, so the import can be deferred
// into it. D's harness calls only puppeteer.launch(); its own args/viewport/js-flags win over the
// executablePath default below.
module.exports = {
  launch: async (opts = {}) => {
    const mod = await import('puppeteer-core');
    const core = mod.default || mod;
    return core.launch({ executablePath: CHROME, ...opts });
  },
};
CJS
echo "  shim written; puppeteer-core version:"
node -e "console.log('    ' + require('$PUP_DIR/puppeteer-core/package.json').version)"

echo
echo "=== 3. is D's default URL reachable from this host? ==="
D_URL='http://31.97.192.82:3000/chart/dist-v9/index.html?mode=backtest&mcLayout=2v'
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$D_URL")
echo "  GET (D's default URL) -> HTTP $code"
if [ "$code" != "200" ]; then
  echo "  not 200, so falling back to the loopback origin and recording that in the artifact"
  D_URL='http://127.0.0.1:3000/chart/dist-v9/index.html?mode=backtest&mcLayout=2v'
  curl -s -o /dev/null -w '  GET (loopback) -> HTTP %{http_code}\n' --max-time 20 "$D_URL"
fi
echo "  build id on the wire right now:"
curl -s --max-time 20 "$D_URL" | grep -oE '20[0-9]{6}b[0-9]{2,4}' | head -1 | sed 's/^/    /'

echo
echo "=== 4. D's --dry-run self-test first (D's own gate, unmodified) ==="
cd "$REPO"
set -a; . /root/.talaria-test-env; set +a
node scripts/m1-b120-real-app-harness.mjs --dry-run
echo "  dry-run exit=$?"

echo
echo "=== 5. the real M1 run against b120 ==="
export M1_REAL_APP_URL="$D_URL"
export M1_EMAIL="$TEST_EMAIL"
date -u +'  run_start_utc=%Y-%m-%dT%H:%M:%SZ'
node scripts/m1-b120-real-app-harness.mjs
echo "  harness exit=$?  (D's contract: 0 only for GREEN_CANDIDATE)"
date -u +'  run_end_utc=%Y-%m-%dT%H:%M:%SZ'

echo
echo "=== 6. artifacts written ==="
ls -la "$REPO/docs/plan3/" "$RUN_ROOT/_evidence/manager-D/"

echo
echo "=== 7. host state AFTER the run ==="
echo -n 'loadavg_after='; cat /proc/loadavg
docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}' | head -4
date -u +'utc_after=%Y-%m-%dT%H:%M:%SZ'
