#!/usr/bin/env bash
# GRADE LANE — run a pinned historical canary build WITHOUT displacing live.
#
# Why this exists: grading a pinned build by `docker compose up` on the live
# project replaces what the PO is measuring on :3000. That happened three times
# on 2026-07-29 (b85 bringups at 16:06Z, 16:13Z, 16:27Z displaced b99), and each
# time it read as "B never shipped".
#
# This starts a SECOND homepage container from the immutable canary tag in its
# own name, bound to 127.0.0.1 only, joined to the live docker network so the
# API/journal service names still resolve.
#
#   CHART_BUILD_ID=20260729b85 bash canary-grade-lane.sh up
#   CHART_BUILD_ID=20260729b85 bash canary-grade-lane.sh status
#   bash canary-grade-lane.sh down
#
# Reach it from a workstation over an SSH tunnel (no new public port):
#   ssh -p 443 -L 3001:127.0.0.1:3001 root@31.97.192.82
#   then open http://localhost:3001
#
# SCOPE LIMIT, state it in any grading claim: only the FRONT-END bundle is
# pinned (nginx + /chart/dist-v9 + /chart/modules from the pinned homepage
# image). trading-chart, the worker, journal-backend and the databases are the
# LIVE current ones, shared with :3000. Sound for front-end listener/timer/heap
# grading; NOT sound for anything that depends on server-side build state.
set -euo pipefail

ACTION="${1:-up}"
NAME=talaria-grade-homepage
NET=talaria_default
BIND="${GRADE_BIND:-127.0.0.1}"
GRADE_PORT="${GRADE_PORT:-3001}"
STACK=/opt/talaria
SHELL_PATH=/usr/share/nginx/html/chart/dist-v9/index.html

# Read the build id a container actually serves. Empty (not "UNKNOWN") on miss so
# callers can fail closed rather than compare against a sentinel string.
build_id_of() {
  docker exec "$1" grep -m1 -o "20260729b[0-9]*" "$SHELL_PATH" 2>/dev/null || true
}

case "$ACTION" in
  up)
    : "${CHART_BUILD_ID:?set CHART_BUILD_ID, e.g. 20260729b85}"
    TAG="canary-${CHART_BUILD_ID}"
    IMG="talaria-homepage:${TAG}"

    if ! docker image inspect "$IMG" >/dev/null 2>&1; then
      echo "MISSING_TAG $IMG" >&2
      TARBALL="/root/talaria-restore/images/${TAG}.tar.gz"
      if [[ -f "$TARBALL" ]]; then
        echo "loading from $TARBALL"
        gunzip -c "$TARBALL" | docker load
      else
        echo "NO_TAR $TARBALL — cannot grade ${CHART_BUILD_ID}" >&2
        exit 1
      fi
    fi

    docker rm -f "$NAME" >/dev/null 2>&1 || true
    docker run -d --name "$NAME" \
      --network "$NET" \
      -p "${BIND}:${GRADE_PORT}:80" \
      -v "$STACK/homepage/nginx.local.conf:/etc/nginx/conf.d/default.conf:ro" \
      -v "$STACK/securty/nginx-security-headers.conf:/etc/nginx/conf.d/security-headers.conf:ro" \
      "$IMG" >/dev/null

    sleep 4
    # grep -m1 rather than `| head -1`: closing the pipe early SIGPIPEs grep,
    # which then trips the fallback and appends a second bogus line.
    GRADED=$(build_id_of "$NAME")
    LIVE=$(build_id_of talaria-homepage-1)

    echo "grade_lane_image=$IMG"
    echo "grade_lane_url=http://${BIND}:${GRADE_PORT}  (tunnel: ssh -p 443 -L ${GRADE_PORT}:127.0.0.1:${GRADE_PORT} root@31.97.192.82)"
    echo "grade_lane_build=$GRADED"
    echo "live_3000_build=$LIVE"
    if [[ "$GRADED" != "$CHART_BUILD_ID" ]]; then
      echo "GRADE_LANE_FAIL served=$GRADED requested=$CHART_BUILD_ID" >&2
      exit 1
    fi
    echo GRADE_LANE_OK
    ;;

  status)
    docker ps -a --filter "name=$NAME" --format "{{.Names}} {{.Image}} {{.Status}} {{.Ports}}"
    echo "live_3000_build=$(build_id_of talaria-homepage-1)"
    if docker inspect "$NAME" >/dev/null 2>&1; then
      echo "grade_lane_build=$(build_id_of "$NAME")"
    fi
    ;;

  down)
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    echo GRADE_LANE_DOWN
    ;;

  *)
    echo "usage: [CHART_BUILD_ID=...] bash canary-grade-lane.sh {up|status|down}" >&2
    exit 2
    ;;
esac
