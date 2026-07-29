#!/bin/sh
# MEAS-01 — read the build stamp from the RUNNING PAGE at measurement time.
#
# Tonight two of the PO's conclusions were void because the wire had been swapped
# under an in-flight measurement: the console said "b99 test" while the served
# bundle was b85, a pre-fix build, and the numbers described neither build
# cleanly. MEAS-01 exists so that can never be inferred after the fact again.
#
# This reads the stamp the way a browser would -- over HTTP from the served
# bundle, not from the image, not from a pin file, not from an assumption -- and
# in `watch` mode samples for the length of a run so a mid-run displacement is
# timestamped rather than argued about.
#
# Usage, on the canary host:
#   canary-meas01-stamp.sh once
#   canary-meas01-stamp.sh watch 1800 15   # 30 min at 15s, for the 6-cycle heap test
#
# Attach the JSONL from watch mode to the measurement. A run whose first and last
# stamp differ is void by definition, and the file says when it turned.
set -u
BASE=${BASE:-http://127.0.0.1:3000}
SHELL_URL="$BASE/chart/dist-v9/index.html"
OUT=${OUT:-/root/talaria-restore/MEAS01-$(date -u +%Y%m%dT%H%M%SZ).jsonl}

# The stamp as the browser sees it. index.html references the bundle; the build id
# is stamped into chart.js, so read both and report the bundle's answer.
read_stamp() {
  CHART_URL="$BASE/chart/chart.js"
  curl -s --max-time 20 "$CHART_URL" | grep -m1 -o '20260729b[0-9]*' || true
}
read_shell_code() {
  curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$SHELL_URL"
}

sample() {
  TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  STAMP=$(read_stamp)
  CODE=$(read_shell_code)
  PIN=$(tr -d ' \t\r\n' < /root/talaria-restore/LIVE-PIN.txt 2>/dev/null)
  HB=$(cat /root/talaria-restore/WATCHDOG-HEARTBEAT 2>/dev/null)
  HB_FRESH=$([ -n "$(find /root/talaria-restore/WATCHDOG-HEARTBEAT -mmin -2 2>/dev/null)" ] && echo true || echo false)
  printf '{"t":"%s","served":"%s","pin":"%s","shell_http":%s,"watchdog":"%s","watchdog_fresh":%s}\n' \
    "$TS" "${STAMP:-UNREADABLE}" "${PIN:-none}" "$CODE" "$HB" "$HB_FRESH"
}

case "${1:-once}" in
  once)
    sample
    ;;
  watch)
    DUR=${2:-1800}
    EVERY=${3:-15}
    echo "MEAS-01 watching for ${DUR}s every ${EVERY}s -> $OUT" >&2
    FIRST=""
    END=$(( $(date +%s) + DUR ))
    while [ "$(date +%s)" -lt "$END" ]; do
      LINE=$(sample)
      echo "$LINE" >> "$OUT"
      S=$(echo "$LINE" | sed 's/.*"served":"\([^"]*\)".*/\1/')
      [ -z "$FIRST" ] && FIRST="$S"
      if [ "$S" != "$FIRST" ]; then
        echo "MEAS-01 VIOLATION at $(date -u +%H:%M:%SZ): served $FIRST -> $S. This run is void." >&2
        echo "$LINE" >&2
      fi
      sleep "$EVERY"
    done
    LAST=$(tail -1 "$OUT" | sed 's/.*"served":"\([^"]*\)".*/\1/')
    echo "MEAS-01 first=$FIRST last=$LAST verdict=$([ "$FIRST" = "$LAST" ] && echo STABLE || echo VOID)" >&2
    echo "$OUT"
    ;;
  *)
    echo "usage: $0 {once|watch <seconds> <interval>}" >&2; exit 2 ;;
esac
