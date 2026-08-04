#!/usr/bin/env bash
# SHIP-CANARY-V1 — the key-auth canary ship, as one script instead of a per-build copy.
#
# WHY THIS EXISTS
# b107 through b127 all shipped through hand-copied `_run-ship-b<N>-key.sh` files. Copying a script
# per build copies its assumptions too, and assumptions rot silently. On 2026-08-04 the b114 lineage
# failed three ways in one run:
#
#   1. It ran `unset TRADING_CHART_IMAGE HOMEPAGE_IMAGE` and then tagged from `:latest`. That was
#      right when compose defaulted to `:latest`, but `.env` now PINS those names to the previous
#      build and compose reads `.env` regardless of the calling shell. So `docker compose build`
#      wrote b127's bytes into b126's tag, destroying the meaning of the rollback target, and then
#      died because `:latest` did not exist. The live site survived only because the death happened
#      before `up -d` — luck, not design.
#   2. It never asked the deploy freeze. A freeze had been armed since 2026-08-02 and b126 shipped
#      straight through it with no BLOCKED and no LIFTED recorded.
#   3. When it died mid-run it left DEPLOY-IN-PROGRESS set on the host, so the next reader saw a
#      deploy that was not happening.
#
# The through-line is that each guard existed somewhere and was not consulted here. This script
# consults them, and asserts its intent BEFORE building and its result AFTER, so that the failure
# mode is a refusal rather than a mislabelled image.
#
# WHAT IT REFUSES
#   FREEZE_ACTIVE        a deploy freeze is armed (override only via TALARIA_FREEZE_OVERRIDE, logged)
#   MEASUREMENT_ACTIVE   a measurement or soak has claimed the host
#   TAG_EXISTS           the target image tag is already present — never silently reuse or overwrite
#   BUILD_TARGET_WRONG   `compose config` does not resolve to the tag we are about to build
#   PROVENANCE_WRONG     the built image's build-id/revision labels disagree with what we asked for
#   MARKER_MISSING       a required token is absent from the bytes the host serves
#
# USAGE
#   scripts/ship-canary.sh --build-id=20260804b127 --source=roster-20260804b127-source [--plan]
#
#   --plan   run every read-only precondition and stop before the tar is shipped. Changes nothing.
set -Eeuo pipefail

die() { printf 'ERROR: %s\n' "$*" >&2; exit 2; }

HOST="${TALARIA_CANARY_HOST:-31.97.192.82}"
PORT="${TALARIA_CANARY_SSH_PORT:-443}"
ROOT="${ROOT:-$(cd "$(dirname "$0")/.." && pwd -P)}"
BUILD_ID=""
SOURCE_REF=""
PLAN=0

for arg in "$@"; do
  case "$arg" in
    --build-id=*) BUILD_ID="${arg#*=}" ;;
    --source=*) SOURCE_REF="${arg#*=}" ;;
    --plan) PLAN=1 ;;
    --force|--provenance-guard-off) die "$arg is prohibited: this script's refusals are the point" ;;
    -h|--help) sed -n '2,40p' "$0"; exit 0 ;;
    *) die "unknown argument: $arg" ;;
  esac
done

[[ "$BUILD_ID" =~ ^[0-9]{8}b[0-9]+$ ]] || die "invalid or missing --build-id (want YYYYMMDDbN)"
[[ -n "$SOURCE_REF" ]] || die "missing --source (a git ref, normally the annotated *-source tag)"

cd "$ROOT"
SHA="$(git rev-parse --verify "${SOURCE_REF}^{commit}" 2>/dev/null)" \
  || die "--source '$SOURCE_REF' does not resolve to a commit"

TAG="canary-${BUILD_ID}"
# Not /tmp: WSL reclaims /tmp between `wsl.exe` invocations, so a tar built in one call was gone by
# the next and the ship died on its own precondition. This lives beside the repo instead.
TAR="${TALARIA_SHIP_TAR_DIR:-$(dirname "$ROOT")}/.ship-${BUILD_ID}-${SHA:0:12}.tar"
SSH=(ssh -p "$PORT" -o BatchMode=yes -o ConnectTimeout=30 -o StrictHostKeyChecking=accept-new)
SCP=(scp -P "$PORT" -o BatchMode=yes -o ConnectTimeout=30 -o StrictHostKeyChecking=accept-new)

# Every remote block runs as `ENV=... bash -s` with a quoted heredoc. The b114 lineage interpolated
# variables into double-quoted remote strings and needed a backslash before every `$`, which is how
# a `\$?` became a literal and a grep lost its word boundary. Passing values as environment keeps
# the remote body verbatim.
remote() { "${SSH[@]}" "root@${HOST}" "BUILD_ID='$BUILD_ID' TAG='$TAG' SHA='$SHA' SOURCE_REF='$SOURCE_REF' FREEZE_OVERRIDE='${TALARIA_FREEZE_OVERRIDE:-}' bash -s"; }

say() { printf '\n=== %s ===\n' "$*"; }

say "ship-canary $BUILD_ID  source=$SOURCE_REF ($(git rev-parse --short "$SHA"))  plan=$PLAN"

say "1. freeze guard + measurement interlock + tag collision"
remote <<'REMOTE'
set -u
fail() { printf 'REFUSED: %s\n' "$*" >&2; exit 1; }

if [ -n "$FREEZE_OVERRIDE" ]; then
  TALARIA_FREEZE_OVERRIDE="$FREEZE_OVERRIDE" bash /opt/talaria/deploy/deploy-freeze-guard.sh check \
    || fail "FREEZE_ACTIVE and override rejected"
else
  bash /opt/talaria/deploy/deploy-freeze-guard.sh check || fail "FREEZE_ACTIVE"
fi

[ -f /root/talaria-restore/MEASUREMENT-IN-PROGRESS ] && {
  cat /root/talaria-restore/MEASUREMENT-IN-PROGRESS
  fail "MEASUREMENT_ACTIVE — a soak or measurement has claimed this host"
}
echo "  measurement: clear"

# Refuse a tag that already exists. Reusing it would make two different sets of bytes answer to one
# build id, which is the confusion b126/b127 just produced by accident.
for r in talaria-trading-chart talaria-homepage; do
  if docker image inspect "$r:$TAG" >/dev/null 2>&1; then
    fail "TAG_EXISTS $r:$TAG — pick a new build id, or delete that tag deliberately"
  fi
done
echo "  target tag $TAG: free on both repositories"

echo "  running now: $(docker inspect -f '{{.Config.Image}}' talaria-homepage-1 2>/dev/null || echo MISSING)"
df -h / | tail -1
REMOTE

if [[ "$PLAN" == "1" ]]; then
  say "PLAN_OK — preconditions pass. Nothing was changed. Re-run without --plan to ship."
  exit 0
fi

say "2. source tar from $SOURCE_REF"
[[ -f "$TAR" ]] || git archive --format=tar -o "$TAR" "$SHA"
printf '  %s  %s  entries=%s\n' "$TAR" "$(du -h "$TAR" | cut -f1)" "$(tar -tf "$TAR" | wc -l)"

REMOTE_TAR="/tmp/talaria-ship-${SHA:0:12}.tar"
say "3. restore point, then sync"
remote <<'REMOTE'
set -eu
mkdir -p /root/talaria-restore
# Set the flag and guarantee it is cleared: an aborted ship that leaves this behind tells every
# later reader that a deploy is in flight when none is. b127's first attempt did exactly that.
touch /root/talaria-restore/DEPLOY-IN-PROGRESS
RP="/root/talaria-restore/canary-${BUILD_ID}-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$RP"
docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' > "$RP/docker-ps.txt"
# Derived from the image actually running, never from LIVE-PIN.txt: on 2026-08-04 that file read
# 20260731b120 while b126 was live, so trusting it would have named the wrong rollback target.
RUNNING="$(docker inspect -f '{{.Config.Image}}' talaria-homepage-1 2>/dev/null | sed -n 's/.*canary-//p')"
if [ -n "$RUNNING" ]; then printf '%s\n' "$RUNNING" > /root/talaria-restore/PRIOR-PIN.txt; fi
PRIOR="$(cat /root/talaria-restore/PRIOR-PIN.txt 2>/dev/null || echo NONE)"
printf '  prior pin (from the running image): %s\n' "$PRIOR"
if [ -f "/root/talaria-restore/images/canary-$PRIOR.tar.gz" ]; then
  gzip -t "/root/talaria-restore/images/canary-$PRIOR.tar.gz" && echo "  rollback image for $PRIOR: present and valid"
else
  echo "  WARNING rollback image for $PRIOR is absent — a bad ship would have no one-command way back"
fi
REMOTE

"${SCP[@]}" "$TAR" "root@${HOST}:$REMOTE_TAR"
echo "  scp ok"

say "4. unpack + preflight the payload in the build context"
"${SSH[@]}" "root@${HOST}" "BUILD_ID='$BUILD_ID' TAG='$TAG' SHA='$SHA' REMOTE_TAR='$REMOTE_TAR' bash -s" <<'REMOTE'
set -eu
trap 'rm -f /root/talaria-restore/DEPLOY-IN-PROGRESS' EXIT
cd /opt/talaria
tar -xf "$REMOTE_TAR"
rm -f "$REMOTE_TAR"
echo "  sync ok at $SHA"

ENG='chart v 1.4/chart/chart.js'
OM='chart v 1.4/chart/modules/order-manager.js'
CO='chart v 1.4/chart/modules/compare-overlay.js'
for f in "$ENG" "$OM" "$CO"; do [ -f "$f" ] || { echo "MISSING $f" >&2; exit 1; }; done

# Mirror parity, because these files ship from both trees and a divergence means the served copy is
# not the reviewed copy.
cmp -s "$ENG" homepage/public/chart/chart.js || { echo "MIRROR_DIVERGED chart.js" >&2; exit 1; }
cmp -s "$OM" homepage/public/chart/modules/order-manager.js || { echo "MIRROR_DIVERGED order-manager.js" >&2; exit 1; }
cmp -s "$CO" homepage/public/chart/modules/compare-overlay.js || { echo "MIRROR_DIVERGED compare-overlay.js" >&2; exit 1; }
echo "  mirror parity ok"

# The engine must already be stamped with the build id being shipped. Catching this here rather than
# after the build is the difference between a refusal and a mislabelled image.
grep -Fq "CHART_ENGINE_BUILD = '$BUILD_ID'" "$ENG" \
  || { echo "STAMP_MISMATCH: engine is not stamped $BUILD_ID" >&2; exit 1; }
echo "  engine stamped $BUILD_ID"
trap - EXIT
REMOTE

say "5. build into the tag we intend, and prove it landed there"
"${SSH[@]}" "root@${HOST}" "BUILD_ID='$BUILD_ID' TAG='$TAG' SHA='$SHA' bash -s" <<'REMOTE'
set -eu
trap 'rm -f /root/talaria-restore/DEPLOY-IN-PROGRESS' EXIT
cd /opt/talaria
export CHECKPOINT_BUILD=1 CHART_BUILD_ID="$BUILD_ID" SOURCE_COMMIT_SHA="$SHA"
# Exported, not unset. compose reads .env, so unsetting here left the previous build's pin in force
# and the build landed on the wrong name.
export TRADING_CHART_IMAGE="talaria-trading-chart:$TAG"
export HOMEPAGE_IMAGE="talaria-homepage:$TAG"
docker compose config | grep -E '^[[:space:]]+image: talaria-(trading-chart|homepage):' | sort -u
docker compose config | grep -Fq "talaria-trading-chart:$TAG" || { echo "BUILD_TARGET_WRONG chart" >&2; exit 1; }
docker compose config | grep -Fq "talaria-homepage:$TAG" || { echo "BUILD_TARGET_WRONG homepage" >&2; exit 1; }
echo "  build target confirmed: $TAG"

echo "  build start $(date -u +%Y-%m-%dT%H:%M:%SZ)"
docker compose build --build-arg CHECKPOINT_BUILD=1 --build-arg CHART_BUILD_ID="$BUILD_ID" \
  --build-arg SOURCE_COMMIT_SHA="$SHA" trading-chart homepage
echo "  build done  $(date -u +%Y-%m-%dT%H:%M:%SZ)"

for r in talaria-trading-chart talaria-homepage; do
  L="$(docker inspect -f '{{index .Config.Labels "io.talaria.checkpoint.build-id"}}' "$r:$TAG")"
  R="$(docker inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$r:$TAG")"
  printf '  %-30s build-id=%s revision=%s\n' "$r:$TAG" "$L" "$R"
  [ "$L" = "$BUILD_ID" ] || { echo "PROVENANCE_WRONG build-id on $r" >&2; exit 1; }
  [ "$R" = "$SHA" ] || { echo "PROVENANCE_WRONG revision on $r" >&2; exit 1; }
done
echo "  provenance ok"

mkdir -p /root/talaria-restore/images
docker save "talaria-homepage:$TAG" "talaria-trading-chart:$TAG" | gzip -1 > "/root/talaria-restore/images/$TAG.tar.gz"
gzip -t "/root/talaria-restore/images/$TAG.tar.gz"
{
  echo "build_id=$BUILD_ID"
  echo "pinned_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "source_commit=$SHA"
  echo "source_tag=$SOURCE_REF"
  echo "chart_image=talaria-trading-chart:$TAG"
  echo "homepage_image=talaria-homepage:$TAG"
  echo "chart_id=$(docker inspect -f '{{.Id}}' "talaria-trading-chart:$TAG")"
  echo "homepage_id=$(docker inspect -f '{{.Id}}' "talaria-homepage:$TAG")"
  echo "buildid_label=$BUILD_ID"
} | tee "/root/talaria-restore/PINNED-$BUILD_ID.txt"

# .env too, not just this shell: leaving it pinned to the previous build is what made the NEXT ship
# build into a stale tag, and it means a later hand-run `docker compose up` silently reverts.
cp -a .env "/root/talaria-restore/env-before-$BUILD_ID.bak"
sed -i "s|^TRADING_CHART_IMAGE=.*|TRADING_CHART_IMAGE=talaria-trading-chart:$TAG|" .env
sed -i "s|^HOMEPAGE_IMAGE=.*|HOMEPAGE_IMAGE=talaria-homepage:$TAG|" .env
grep -nE '^(TRADING_CHART_IMAGE|HOMEPAGE_IMAGE)=' .env

docker compose up -d --no-build trading-chart trading-chart-worker homepage
printf '%s\n' "$BUILD_ID" > /root/talaria-restore/LIVE-PIN.txt
echo "  up done, LIVE-PIN=$BUILD_ID"
trap - EXIT
rm -f /root/talaria-restore/DEPLOY-IN-PROGRESS
REMOTE

say "6. health"
remote <<'REMOTE'
set -eu
for i in $(seq 1 48); do
  st="$(docker inspect -f '{{.State.Health.Status}}' talaria-trading-chart-1 2>/dev/null || echo missing)"
  hp="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/chart/dist-v9/index.html || echo 000)"
  printf '  attempt %s: trading-chart=%s shell_http=%s\n' "$i" "$st" "$hp"
  [ "$st" = healthy ] && [ "$hp" = 200 ] && break
  sleep 5
done
[ "$(docker inspect -f '{{.State.Health.Status}}' talaria-trading-chart-1)" = healthy ] || exit 1
[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/chart/dist-v9/index.html)" = 200 ] || exit 1
echo "  healthy"
REMOTE

say "7. the served page, and the images actually running"
remote <<'REMOTE'
set -eu
curl -sS -o /tmp/meas01.html -H 'Cache-Control: no-cache' http://127.0.0.1:3000/chart/dist-v9/index.html
STAMP="$(tr -d '\r' </tmp/meas01.html | grep -oE "window\.__TALARIA_CHART_BUILD_ID='[^']+'" | head -1)"
printf '  served stamp: %s\n' "$STAMP"
printf '%s' "$STAMP" | grep -Fq "'$BUILD_ID'" || { echo "SERVED_STAMP_WRONG" >&2; exit 1; }
printf '  ?v= refs: %s\n' "$(grep -cE "\?v=$BUILD_ID" /tmp/meas01.html || true)"
for c in talaria-homepage-1 talaria-trading-chart-1 talaria-trading-chart-worker-1; do
  I="$(docker inspect -f '{{.Config.Image}}' "$c")"
  printf '  %-32s %s\n' "$c" "$I"
  printf '%s' "$I" | grep -Fq "canary-$BUILD_ID" || { echo "CONTAINER_ON_WRONG_IMAGE $c" >&2; exit 1; }
done
# Anything not in the three services above must be untouched. The production/grade stack lives on
# this host and has never been a target.
printf '  grade stack (must be untouched): %s\n' \
  "$(docker inspect -f '{{.Config.Image}}' talaria-grade-homepage 2>/dev/null || echo absent)"
REMOTE

say "8. payload on the wire, fetched over HTTP"
remote <<'REMOTE'
set -eu
B=http://127.0.0.1:3000
curl -sS -H 'Cache-Control: no-cache' "$B/chart/chart.js" -o /tmp/w-eng.js
curl -sS -H 'Cache-Control: no-cache' "$B/chart/dist-v9/assets/talaria-v9-live.js" -o /tmp/w-bun.js
grep -Fq "CHART_ENGINE_BUILD = '$BUILD_ID'" /tmp/w-eng.js || { echo "MARKER_MISSING engine stamp" >&2; exit 1; }
printf '  engine stamp on the wire: %s\n' "$BUILD_ID"
# Word boundary is load-bearing. A bare '\.iframe' also matches the bundle's legitimate `.iframes`
# collection, and without \b this assertion refused a correct build on 2026-08-04.
n="$(grep -cE '\.iframe\b' /tmp/w-bun.js || true)"
printf '  bundle .iframe\\b readers: %s (must be 0)\n' "$n"
[ "$n" -eq 0 ] || { echo "MARKER_MISSING: an .iframe reader survives in the bundle" >&2; exit 1; }
REMOTE

say "9. final state"
remote <<'REMOTE'
set -u
printf '  LIVE-PIN:  %s\n' "$(cat /root/talaria-restore/LIVE-PIN.txt 2>/dev/null || echo NONE)"
printf '  PRIOR-PIN: %s\n' "$(cat /root/talaria-restore/PRIOR-PIN.txt 2>/dev/null || echo NONE)"
[ -f /root/talaria-restore/DEPLOY-IN-PROGRESS ] && echo "  deploy flag: STILL SET (bug)" || echo "  deploy flag: clear"
bash /opt/talaria/deploy/deploy-freeze-guard.sh status | head -2
ls -1 /root/talaria-restore/images | tail -3
REMOTE

say "SHIPPED $BUILD_ID from $SOURCE_REF"
echo "Now verify from OUTSIDE the host, which is the only check that speaks for the PO:"
echo "  npm run gate:served-build-agreement"
