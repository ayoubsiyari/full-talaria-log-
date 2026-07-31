#!/usr/bin/env bash
# Ship b117 = b116 + the support passport account axis (account_age_days, closed_trades).
# Server-side only; no client bundle change, no money path touched.
#
# This will NOT run while the freeze is armed. That is deliberate: D holds the lift, and the
# guard is the thing that enforces it rather than an agreement. If you are reading this because
# the script exited 8, that is the freeze doing its job — get the lift, do not set OVERRIDE.
set -euo pipefail
BID=20260731b117
# Payload resolved by SHA, not by message: 1cd2b1ab3 on manager-b/plan3-20260727.
SHA="${SOURCE_COMMIT_SHA:?set SOURCE_COMMIT_SHA=1cd2b1ab3 (the commit carrying the passport change)}"
STAGED=/tmp/b117-stage
CHART="chart v 1.4/chart"
cd /opt/talaria

if [[ -f /root/talaria-restore/MEASUREMENT-IN-PROGRESS ]]; then
  echo MEASUREMENT_IN_PROGRESS=yes; cat /root/talaria-restore/MEASUREMENT-IN-PROGRESS; exit 9
fi
/opt/talaria/deploy-freeze-guard.sh check || exit 8
echo LIVE_PIN_BEFORE="$(cat /root/talaria-restore/LIVE-PIN.txt 2>/dev/null || echo NONE)"

echo "=== 0. restore point ==="
mkdir -p /root/talaria-restore
touch /root/talaria-restore/DEPLOY-IN-PROGRESS
docker inspect -f '{{.Config.Image}}' talaria-homepage-1 | sed -n 's/.*canary-//p' \
  > /root/talaria-restore/PRIOR-PIN.txt
echo PRIOR_PIN="$(cat /root/talaria-restore/PRIOR-PIN.txt)"

echo "=== 1. apply the staged change ==="
cp "$STAGED/api_server.py"                 "$CHART/api_server.py"
cp "$STAGED/admin-dashboard.html"          "$CHART/admin-dashboard.html"
cp "$STAGED/test_support_account_facts.py" "$CHART/tests/test_support_account_facts.py"

echo "=== 2. preflight ==="
grep -q '_support_account_facts' "$CHART/api_server.py"        || { echo ABORT_PASSPORT_MISSING; exit 2; }
grep -q 'extra\["account"\]' "$CHART/api_server.py"            || { echo ABORT_ACCOUNT_WRITE_MISSING; exit 2; }
grep -q 'Account position (server-stamped)' "$CHART/admin-dashboard.html" || { echo ABORT_ADMIN_VIEW; exit 2; }
# The account block must be written AFTER the client context block, or a crafted context wins.
python3 - <<'PY'
import re,sys
src=open('chart v 1.4/chart/api_server.py',encoding='utf-8').read()
i=src.index('extra["context"]'); j=src.index('extra["account"]')
sys.exit(0 if j>i else (print("ABORT_ORDERING") or 2))
PY
# b115/b116 payloads must still be in the context — this train must not silently drop them.
grep -qE '^def chart_window_claim\(' "$CHART/api_server.py"     || { echo ABORT_P0_CLAIM; exit 2; }
grep -q 'Prefer bounded controlFetch' "$CHART/modules/chart-window-limit.js" || { echo ABORT_P0_RELEASE; exit 2; }
grep -q '__TALARIA_DISABLE_INDICATOR_EVICT_V1' "$CHART/modules/chart-indicators-full.js" || { echo ABORT_E_PAYLOAD; exit 2; }
grep -q '__TALARIA_DISABLE_EXCURSION_SINGLE_OWNER_V1' "$CHART/modules/order-manager.js"  || { echo ABORT_D_PAYLOAD; exit 2; }
test -f homepage/public/talaria-log.logo.jpg   || { echo ABORT_OG_MISSING; exit 2; }
test ! -f homepage/public/talaria-log.logo.png || { echo ABORT_OG_PNG_BACK; exit 2; }
echo PREFLIGHT_OK

echo "=== 3. tests against a real interpreter ==="
IMGNOW=$(docker inspect -f '{{.Config.Image}}' talaria-trading-chart-1)
docker run --rm \
  -v "/opt/talaria/$CHART/api_server.py:/app/api_server.py:ro" \
  -v "/opt/talaria/$CHART/tests/test_support_account_facts.py:/app/tests/test_support_account_facts.py:ro" \
  -w /app "$IMGNOW" sh -c 'python -m pytest tests/test_support_account_facts.py -q 2>&1 | tail -5'

echo "=== 4. host gates ==="
docker run --rm -v /opt/talaria:/w -w /w node:22-alpine sh -c \
  'node --test deploy/dead-indicator-copies.test.mjs scripts/tests/asset-decoded-budget.test.mjs 2>&1 | tail -10'

echo "=== 5. build + tag + save ==="
export CHECKPOINT_BUILD=1 CHART_BUILD_ID="$BID" SOURCE_COMMIT_SHA="$SHA"
unset TRADING_CHART_IMAGE HOMEPAGE_IMAGE || true
echo BUILD_START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
docker compose build --build-arg CHECKPOINT_BUILD=1 --build-arg CHART_BUILD_ID="$BID" \
  --build-arg SOURCE_COMMIT_SHA="$SHA" trading-chart homepage
echo BUILD_DONE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
TAG="canary-$BID"
docker tag talaria-trading-chart:latest "talaria-trading-chart:$TAG"
docker tag talaria-homepage:latest "talaria-homepage:$TAG"
mkdir -p /root/talaria-restore/images
docker save "talaria-homepage:$TAG" "talaria-trading-chart:$TAG" | gzip -1 \
  > "/root/talaria-restore/images/$TAG.tar.gz"
gzip -t "/root/talaria-restore/images/$TAG.tar.gz"
{
  echo tagged_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo chart_build_id="$BID"
  echo source_commit_sha="$SHA"
  echo train_rows=b116_all+SUPPORT_PASSPORT_ACCOUNT_AXIS
} | tee "/root/talaria-restore/PINNED-$BID.txt"

export HOMEPAGE_IMAGE="talaria-homepage:$TAG"
export TRADING_CHART_IMAGE="talaria-trading-chart:$TAG"
docker compose up -d --no-build trading-chart trading-chart-worker homepage
echo "$BID" > /root/talaria-restore/LIVE-PIN.txt
rm -f /root/talaria-restore/DEPLOY-IN-PROGRESS

echo "=== 6. confirm on the wire, not in the image ==="
sleep 6
curl -sS http://127.0.0.1:3000/chart/dist-v9/index.html \
  | grep -oE "__TALARIA_CHART_BUILD_ID='[^']+'" | head -1 | sed 's/^/  /'
docker exec talaria-trading-chart-1 grep -q '_support_account_facts' /app/api_server.py \
  && echo "  ok: passport axis in the running image" || { echo "  FAIL"; exit 3; }
echo
echo "  Behavioural confirmation (a real ticket carrying real numbers) is the actual close"
echo "  condition — run /tmp/discriminate-passport.sh against the LIVE port, not a shadow."
echo SHIPPED="$BID"
