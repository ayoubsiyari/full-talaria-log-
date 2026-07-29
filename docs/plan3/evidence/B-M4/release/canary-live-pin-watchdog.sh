#!/bin/sh
# LIVE PIN WATCHDOG — installed on the canary host at /opt/talaria/canary-live-pin-watchdog.sh
#
# Why: on 2026-07-29 the live stack was recreated 28 times, and three of those
# were historical-pin bringups that silently replaced the build the PO was
# measuring. Each recreate also 502s every in-flight request, which the PO read
# as a broken backend. Shipping is not durable if anything can take the wire back
# without anyone noticing.
#
# What it does, once a minute:
#   - reads the intended build from /root/talaria-restore/LIVE-PIN.txt
#   - compares it to what nginx actually serves
#   - on drift: appends to /root/talaria-restore/LIVE-DRIFT.log and re-asserts the
#     pinned tags
#
# Disable:  touch /root/talaria-restore/WATCHDOG-OFF
# Detect only, never repair:  touch /root/talaria-restore/WATCHDOG-DETECT-ONLY
#
# It will NOT act while a compose build/up is running, so it cannot fight a ship.
set -u
PIN_FILE=/root/talaria-restore/LIVE-PIN.txt
DRIFT_LOG=/root/talaria-restore/LIVE-DRIFT.log
HEARTBEAT=/root/talaria-restore/WATCHDOG-HEARTBEAT
STACK=/opt/talaria
SHELL_PATH=/usr/share/nginx/html/chart/dist-v9/index.html

# Heartbeat first, before any early exit. The drift log only grows when something
# is wrong, so silence in it is ambiguous: "nothing drifted" and "the watchdog is
# dead" look identical. That ambiguity already cost me once today, when a bad
# guard made this script skip every tick while reporting nothing. Freshness of
# this file is the only proof the watchdog ran:
#   test -n "$(find /root/talaria-restore/WATCHDOG-HEARTBEAT -mmin -2)" || echo DEAD
#
# It records the mode too, so "ran recently" cannot be mistaken for "is guarding":
# a fresh heartbeat reading off is a watchdog that is deliberately not protecting
# anything.
if [ -f /root/talaria-restore/WATCHDOG-OFF ]; then
  MODE=off
elif [ -f /root/talaria-restore/WATCHDOG-DETECT-ONLY ]; then
  MODE=detect-only
else
  MODE=armed
fi
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) mode=$MODE" > "$HEARTBEAT" 2>/dev/null || true

[ "$MODE" = off ] && exit 0
[ -f "$PIN_FILE" ] || exit 0

INTENDED=$(tr -d ' \t\r\n' < "$PIN_FILE")
[ -n "$INTENDED" ] || exit 0

# Never race a ship or a deliberate bringup. This used to be
# `pgrep -f "docker compose"`, which matched any SSH session whose command line
# merely CONTAINED that string — including the harness testing this watchdog — so
# it skipped every tick and repaired nothing. An explicit marker is the only
# honest signal of "a deploy is in progress"; a substring of somebody's argv is not.
#
# Ship / bringup paths must:  touch $BUSY  ... deploy ...  rm -f $BUSY
BUSY=/root/talaria-restore/DEPLOY-IN-PROGRESS
if [ -f "$BUSY" ]; then
  # Stale marker (crashed ship) must not disable the watchdog forever.
  if [ -n "$(find "$BUSY" -mmin +20 2>/dev/null)" ]; then
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) STALE_BUSY_MARKER ignoring $BUSY" >> "$DRIFT_LOG"
    rm -f "$BUSY"
  else
    exit 0
  fi
fi

SERVED=$(docker exec talaria-homepage-1 grep -m1 -o "20260729b[0-9]*" "$SHELL_PATH" 2>/dev/null)
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# No answer at all is itself drift worth recording — the container may be mid-recreate.
if [ -z "$SERVED" ]; then
  echo "$NOW UNREADABLE intended=$INTENDED (homepage not answering)" >> "$DRIFT_LOG"
  exit 0
fi

[ "$SERVED" = "$INTENDED" ] && exit 0

IMG=$(docker inspect -f "{{.Config.Image}}" talaria-homepage-1 2>/dev/null)
echo "$NOW DRIFT served=$SERVED intended=$INTENDED image=$IMG" >> "$DRIFT_LOG"

if [ -f /root/talaria-restore/WATCHDOG-DETECT-ONLY ]; then
  echo "$NOW detect-only, not repairing" >> "$DRIFT_LOG"
  exit 0
fi

# Only repair if the pinned tags actually exist; a half-repair is worse than none.
if ! docker image inspect "talaria-homepage:canary-$INTENDED" >/dev/null 2>&1 \
  || ! docker image inspect "talaria-trading-chart:canary-$INTENDED" >/dev/null 2>&1; then
  echo "$NOW CANNOT_REPAIR missing tags for $INTENDED" >> "$DRIFT_LOG"
  exit 1
fi

cd "$STACK" || exit 1
HOMEPAGE_IMAGE="talaria-homepage:canary-$INTENDED" \
TRADING_CHART_IMAGE="talaria-trading-chart:canary-$INTENDED" \
  docker compose up -d --no-build trading-chart trading-chart-worker homepage >/dev/null 2>&1
sleep 12
AFTER=$(docker exec talaria-homepage-1 grep -m1 -o "20260729b[0-9]*" "$SHELL_PATH" 2>/dev/null)
if [ "$AFTER" = "$INTENDED" ]; then
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) REPAIRED -> $AFTER" >> "$DRIFT_LOG"
else
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) REPAIR_FAILED served=$AFTER intended=$INTENDED" >> "$DRIFT_LOG"
fi
