#!/bin/sh
# CANARY IMAGE RETENTION ? bound the rollback store without ever eating the
# rollback path itself.
#
# Usage, on the canary host:
#   canary-image-retention.sh                 # dry run, default cap
#   canary-image-retention.sh --apply         # actually delete
#   KEEP=8 canary-image-retention.sh --apply  # override the cap
#
# What a "retained build" costs, measured 2026-07-29:
#   talaria-trading-chart:canary-<id>   1.46 GB
#   talaria-homepage:canary-<id>        0.159 GB
#   images/canary-<id>.tar.gz           0.32 GB
#   ------------------------------------------
#   ~1.94 GB per build, and every ship adds one.
#
# Note the shape of that: the tarballs are the small half. Capping tars alone
# would leave 84% of the per-build cost behind in the image store, so this
# script retires a build as a unit ? both images and the tar together.
#
# PROTECTED, and never deleted regardless of the cap:
#   1. the build in LIVE-PIN.txt (what the PO is measuring);
#   2. any build whose image is used by ANY container, running or stopped ?
#      this is what keeps C's grade lane on :3001 from being pulled out from
#      under a grading run;
#   3. any build id listed in KEEP-BUILDS.txt, one per line (the escape hatch
#      for "C still needs to grade this one");
#   4. the newest $KEEP builds by build id.
# If applying the policy would leave fewer than $FLOOR builds retained, the
# script refuses and changes nothing: a retention policy that can empty the
# rollback store is a worse failure than a full disk.

set -u

RESTORE=/root/talaria-restore
IMAGES="$RESTORE/images"
PIN_FILE="$RESTORE/LIVE-PIN.txt"
KEEP_FILE="$RESTORE/KEEP-BUILDS.txt"
LOG="$RESTORE/RETENTION.log"
KEEP="${KEEP:-8}"
FLOOR="${FLOOR:-4}"
APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)

log() { echo "$NOW $*" >> "$LOG" 2>/dev/null || true; }

# Rank build ids oldest-first.
#
# This used to be a plain `sort`, and that destroyed four builds. Build ids are
# `<date>b<n>`, so a lexicographic sort compares "1" against "8" and decides
# 20260729b100 is OLDER than 20260729b85. Every build from b100 on therefore
# sorted below the cap window and was retired the instant it stopped being the
# live pin ? b100, b101, b102 and b103, each one the build a manager was still
# grading. `sort -V` compares digit runs numerically, which is the only ordering
# that matches what "newest" means here. Asserted by --self-test below.
rank() { sort -u -V; }

if [ "${1:-}" = "--self-test" ]; then
  got=$(printf '%s\n' 20260729b85 20260729b100 20260726b75 20260729b99 20260729b104 20260729b9 | rank | tr '\n' ' ')
  want="20260726b75 20260729b9 20260729b85 20260729b99 20260729b100 20260729b104 "
  if [ "$got" = "$want" ]; then
    echo "SELF_TEST_OK ordering=oldest-first"
    newest2=$(printf '%s\n' 20260729b85 20260729b100 20260729b103 20260729b104 | rank | tail -n 2 | tr '\n' ' ')
    [ "$newest2" = "20260729b103 20260729b104 " ] || { echo "SELF_TEST_FAIL cap-window=$newest2" >&2; exit 3; }
    echo "SELF_TEST_OK cap-window-keeps-newest"
    exit 0
  fi
  echo "SELF_TEST_FAIL got=[$got] want=[$want]" >&2
  exit 3
fi

# Every build id we know about, from tars and from image tags, newest last.
ALL=$( { ls -1 "$IMAGES" 2>/dev/null | sed -n 's/^canary-\(.*\)\.tar\.gz$/\1/p'
         docker images --format '{{.Tag}}' 2>/dev/null | sed -n 's/^canary-\(.*\)$/\1/p'
       } | rank )

[ -z "$ALL" ] && { echo "no canary builds found under $IMAGES ? nothing to do"; exit 0; }

LIVE=$(cat "$PIN_FILE" 2>/dev/null || echo "")
# The build that was live until the last ship is the build somebody is grading
# right now. Live-pin protection alone only ever covers the current stamp, so a
# ship silently ended the previous stamp's life. It is protected here by name.
PRIOR=$(cat "$RESTORE/PRIOR-PIN.txt" 2>/dev/null || echo "")

# Images referenced by any container, including stopped ones and the grade lane.
INUSE=$(docker ps -a --format '{{.Image}}' 2>/dev/null | sed -n 's/^.*:canary-\(.*\)$/\1/p' | sort -u)

KEEPLIST=$(sed -e 's/#.*//' -e 's/[[:space:]]//g' "$KEEP_FILE" 2>/dev/null | grep -v '^$' || true)

NEWEST=$(echo "$ALL" | tail -n "$KEEP")

protected() {
  b="$1"
  [ -n "$LIVE" ] && [ "$b" = "$LIVE" ] && { echo "live-pin"; return; }
  [ -n "$PRIOR" ] && [ "$b" = "$PRIOR" ] && { echo "prior-pin-under-grading"; return; }
  echo "$INUSE"    | grep -qx "$b" && { echo "in-use-by-container"; return; }
  echo "$KEEPLIST" | grep -qx "$b" && { echo "keep-list"; return; }
  echo "$NEWEST"   | grep -qx "$b" && { echo "newest-$KEEP"; return; }
  echo ""
}

RETAIN_N=0
RETIRE=""
echo "cap=$KEEP floor=$FLOOR live=${LIVE:-none} prior=${PRIOR:-none}"
echo "--- decision per build ---"
for b in $ALL; do
  why=$(protected "$b")
  if [ -n "$why" ]; then
    RETAIN_N=$((RETAIN_N + 1))
    echo "  RETAIN  $b   ($why)"
  else
    RETIRE="$RETIRE $b"
    echo "  RETIRE  $b"
  fi
done

[ -z "$RETIRE" ] && { echo "nothing to retire; store is within the cap"; log "NOOP retained=$RETAIN_N"; exit 0; }

if [ "$RETAIN_N" -lt "$FLOOR" ]; then
  echo "REFUSING: policy would leave $RETAIN_N retained builds, floor is $FLOOR." >&2
  echo "The tars ARE the rollback path. Raise KEEP or shorten the retire list." >&2
  log "REFUSED retained=$RETAIN_N floor=$FLOOR"
  exit 2
fi

if [ "$APPLY" != "1" ]; then
  echo "--- dry run; re-run with --apply to delete the RETIRE set ---"
  exit 0
fi

FREED=0
for b in $RETIRE; do
  tar="$IMAGES/canary-$b.tar.gz"
  if [ -f "$tar" ]; then
    sz=$(stat -c %s "$tar" 2>/dev/null || echo 0)
    rm -f "$tar" && FREED=$((FREED + sz)) && echo "  removed tar   canary-$b.tar.gz"
  fi
  for repo in talaria-trading-chart talaria-homepage; do
    if docker image inspect "$repo:canary-$b" >/dev/null 2>&1; then
      docker rmi "$repo:canary-$b" >/dev/null 2>&1 \
        && echo "  removed image $repo:canary-$b" \
        || echo "  KEPT image $repo:canary-$b (still referenced)"
    fi
  done
  log "RETIRED $b"
done

echo "--- after ---"
df -h / | tail -1
log "APPLIED retired=$(echo $RETIRE | tr ' ' ',') retained=$RETAIN_N tar_bytes_freed=$FREED"
echo "tar bytes freed: $FREED (image layers freed separately; see df above)"

