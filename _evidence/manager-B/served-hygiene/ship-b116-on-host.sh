#!/usr/bin/env bash
# Ship b116 = b115 + served hygiene (dead indicator copies out, share card re-encoded).
# No money-path change. Build context /opt/talaria is the b115 tree.
set -euo pipefail
BID=20260730b116
SHA="${SOURCE_COMMIT_SHA:?}"
STAGED=/tmp/b116-stage
cd /opt/talaria

if [[ -f /root/talaria-restore/MEASUREMENT-IN-PROGRESS ]]; then
  echo MEASUREMENT_IN_PROGRESS=yes; cat /root/talaria-restore/MEASUREMENT-IN-PROGRESS; exit 9
fi
# The guard ships in this train, so honour it from the copy already on the host if present.
if [[ -x /opt/talaria/deploy-freeze-guard.sh ]]; then
  /opt/talaria/deploy-freeze-guard.sh check || exit 8
fi
echo MEASUREMENT_IN_PROGRESS=no
echo LIVE_PIN_BEFORE="$(cat /root/talaria-restore/LIVE-PIN.txt 2>/dev/null || echo NONE)"

echo "=== 0. restore point ==="
mkdir -p /root/talaria-restore
touch /root/talaria-restore/DEPLOY-IN-PROGRESS
docker inspect -f '{{.Config.Image}}' talaria-homepage-1 | sed -n 's/.*canary-//p' \
  > /root/talaria-restore/PRIOR-PIN.txt
echo PRIOR_PIN="$(cat /root/talaria-restore/PRIOR-PIN.txt)"

echo "=== 1. apply hygiene to the build context ==="
cp "$STAGED/layout.tsx"                    homepage/src/app/layout.tsx
cp "$STAGED/talaria-log.logo.jpg"          homepage/public/talaria-log.logo.jpg
cp "$STAGED/asset-decoded-budget.mjs"      scripts/lib/asset-decoded-budget.mjs
cp "$STAGED/asset-decoded-budget.test.mjs" scripts/tests/asset-decoded-budget.test.mjs
cp "$STAGED/dead-indicator-copies.test.mjs" deploy/dead-indicator-copies.test.mjs
cp "$STAGED/deploy-freeze-guard.sh"        deploy/deploy-freeze-guard.sh
cp "$STAGED/deploy-freeze-guard.test.mjs"  deploy/deploy-freeze-guard.test.mjs
install -m 0755 "$STAGED/deploy-freeze-guard.sh" /opt/talaria/deploy-freeze-guard.sh

rm -f homepage/public/talaria-log.logo.png
for d in "chart v 1.4/chart/modules" "homepage/public/chart/modules"; do
  rm -f "$d/chart-indicators.js" \
        "$d/chart-indicators-readable.js" \
        "$d/chart-indicators-with-hma.js" \
        "$d/chart-indicators-working-backup-final.js" \
        "$d/indicator formuls.text"
done

echo "=== 2. preflight ==="
# The implementation must survive; "no dead copies" must not be satisfied by deleting all of them.
for d in "chart v 1.4/chart/modules" "homepage/public/chart/modules"; do
  test -f "$d/chart-indicators-full.js" || { echo "ABORT_LIVE_IMPL_MISSING $d"; exit 2; }
  n=$(ls "$d" | grep -cE '^chart-indicators.*\.(js|mjs|cjs)$' || true)
  printf '  %-40s chart-indicators*=%s (want 1)\n' "$d" "$n"; test "$n" -eq 1
done
test -f homepage/public/talaria-log.logo.jpg || { echo ABORT_OG_MISSING; exit 2; }
test ! -f homepage/public/talaria-log.logo.png || { echo ABORT_OG_PNG_STILL_THERE; exit 2; }
grep -q 'talaria-log.logo.jpg' homepage/src/app/layout.tsx || { echo ABORT_OG_PATH; exit 2; }
echo "  og jpg bytes=$(wc -c < homepage/public/talaria-log.logo.jpg)"

# b115 payload must still be in the context — this train must not silently drop the P0 fix.
grep -q 'Prefer bounded controlFetch' "chart v 1.4/chart/modules/chart-window-limit.js" || { echo ABORT_P0_RELEASE; exit 2; }
grep -qE '^def chart_window_claim\(' "chart v 1.4/chart/api_server.py" || { echo ABORT_P0_CLAIM; exit 2; }
grep -q '__TALARIA_DISABLE_INDICATOR_EVICT_V1' "chart v 1.4/chart/modules/chart-indicators-full.js" || { echo ABORT_E_PAYLOAD; exit 2; }
grep -q '__TALARIA_DISABLE_EXCURSION_SINGLE_OWNER_V1' "chart v 1.4/chart/modules/order-manager.js" || { echo ABORT_D_PAYLOAD; exit 2; }
echo PREFLIGHT_OK

echo "=== 3. gates on the host tree ==="
docker run --rm -v /opt/talaria:/w -w /w node:22-alpine sh -c \
  'node --test deploy/dead-indicator-copies.test.mjs scripts/tests/asset-decoded-budget.test.mjs 2>&1 | tail -14'
docker run --rm -v /opt/talaria:/w -w /w node:22-alpine sh -c \
  'apk add --no-cache bash >/dev/null 2>&1; node --test deploy/deploy-freeze-guard.test.mjs 2>&1 | tail -14'

echo "=== 4. build + tag + save ==="
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
  echo trading_chart_tag="talaria-trading-chart:$TAG"
  echo homepage_tag="talaria-homepage:$TAG"
  echo train_rows=b115_all+SERVED_HYGIENE_dead_indicators+OG_JPEG
} | tee "/root/talaria-restore/PINNED-$BID.txt"

export HOMEPAGE_IMAGE="talaria-homepage:$TAG"
export TRADING_CHART_IMAGE="talaria-trading-chart:$TAG"
docker compose up -d --no-build trading-chart trading-chart-worker homepage
echo "$BID" > /root/talaria-restore/LIVE-PIN.txt
rm -f /root/talaria-restore/DEPLOY-IN-PROGRESS
echo LIVE_PIN_SET="$BID"

echo "=== 5. health ==="
for i in $(seq 1 36); do
  st=$(docker inspect -f '{{.State.Health.Status}}' talaria-trading-chart-1 2>/dev/null || echo missing)
  hp=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/chart/dist-v9/index.html || echo 000)
  echo "  attempt $i: trading-chart=$st shell_http=$hp"
  [ "$st" = healthy ] && [ "$hp" = 200 ] && break
  sleep 5
done
test "$(docker inspect -f '{{.State.Health.Status}}' talaria-trading-chart-1)" = healthy

echo "=== 6. MEAS-01 stamp ==="
curl -sS -o /tmp/meas01.html -H 'Cache-Control: no-cache' http://127.0.0.1:3000/chart/dist-v9/index.html
grep -oE "window\.__TALARIA_CHART_BUILD_ID='[^']+'" /tmp/meas01.html | head -1
grep -oE "window\.__TALARIA_CHART_BUILD_ID='[^']+'" /tmp/meas01.html | head -1 | grep -Fq "'$BID'"

echo "=== 7. hygiene on the wire ==="
# This asserted 404 on the first run and got 307: an unresolvable /chart/modules/* path on this
# stack redirects to /login?next=..., so 404 never appears and "want 404" would have failed a
# correct deploy. Nor is "not 200" enough — the login page is a 200 once the redirect is followed.
# Assert instead on the two things a redirect rule cannot fake: absence from the image, and that
# the URL does not yield JavaScript. Same checks run against the live implementation as a control.
for f in chart-indicators.js chart-indicators-readable.js chart-indicators-with-hma.js \
         chart-indicators-working-backup-final.js; do
  docker exec talaria-homepage-1 test ! -e "/usr/share/nginx/html/chart/modules/$f" \
    || { echo "ABORT_STILL_IN_IMAGE $f"; exit 2; }
  ct=$(curl -sL -o /dev/null -w '%{content_type}' "http://127.0.0.1:3000/chart/modules/$f")
  printf '  %-45s absent, serves %s\n' "$f" "$ct"
  case "$ct" in *javascript*) echo "ABORT_STILL_SERVED_AS_JS $f"; exit 2 ;; esac
done
ct=$(curl -sL -o /tmp/live.js -w '%{content_type}' http://127.0.0.1:3000/chart/modules/chart-indicators-full.js)
sz=$(wc -c < /tmp/live.js)
printf '  %-45s CONTROL %s %s bytes\n' chart-indicators-full.js "$ct" "$sz"
case "$ct" in *javascript*) : ;; *) echo ABORT_CONTROL_NOT_JS; exit 2 ;; esac
test "$sz" -gt 900000 || { echo ABORT_CONTROL_TOO_SMALL; exit 2; }

og=$(curl -s -o /tmp/og.jpg -w '%{http_code}' http://127.0.0.1:3000/talaria-log.logo.jpg)
printf '  og jpg HTTP %s bytes=%s\n' "$og" "$(wc -c < /tmp/og.jpg)"; test "$og" = 200
head -c 2 /tmp/og.jpg | od -An -tx1 | tr -d ' \n' | grep -q 'ffd8' || { echo ABORT_NOT_JPEG; exit 2; }
n=$(curl -s -H 'Cache-Control: no-cache' http://127.0.0.1:3000/ | grep -c 'talaria-log.logo.jpg' || true)
printf '  index.html references og jpg: %s\n' "$n"; test "$n" -gt 0

echo "=== 8. P0 + train still on the wire ==="
curl -sS -H 'Cache-Control: no-cache' http://127.0.0.1:3000/chart/modules/chart-window-limit.js -o /tmp/cwl.js
grep -q 'Prefer bounded controlFetch' /tmp/cwl.js
docker exec talaria-trading-chart-1 grep -qE '^def chart_window_claim\(' /app/api_server.py
curl -sS -H 'Cache-Control: no-cache' http://127.0.0.1:3000/chart/modules/order-manager.js -o /tmp/om.js
for t in __TALARIA_DISABLE_M24_ORDER_ID_GAP_RECONCILE_V1 \
         __TALARIA_DISABLE_ORDER_EXPLICIT_PLACE_AUDIT_V1 \
         __TALARIA_DISABLE_EXCURSION_SINGLE_OWNER_V1 \
         __TALARIA_DISABLE_TRADE_EVICT_V1; do
  n=$(grep -c "$t" /tmp/om.js || true); printf '  HTTP om %-55s %s\n' "$t" "$n"; test "$n" -gt 0
done
echo HTTP_WIRE_OK

echo "CANARY_CHECKPOINT_OK build_id=$BID sha=$SHA"
