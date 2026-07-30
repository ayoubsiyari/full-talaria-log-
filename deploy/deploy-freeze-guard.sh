#!/usr/bin/env bash
# DEPLOY-FREEZE-V1 — refuse to ship to the canary while a test window is open.
#
# WHY A LOCK AND NOT AN AGREEMENT
# "We agreed not to deploy during the PO's window" is not a control. It survives exactly until
# the next person with host access is mid-task at 03:00 and does not know the window exists.
# The canary has one deploy path and it runs through this host, so the lock lives on the host and
# the ship path asks it. An agreement nobody can violate by accident is the only kind worth having.
#
# FAILS SAFE
# The freeze has no expiry. A window that auto-expires expires mid-test, at which point the PO is
# testing one build in a tab and another on the wire and does not know it. It holds until someone
# lifts it deliberately, and lifting is logged with who and why.
#
# OVERRIDE
# A freeze that cannot be broken is a freeze that gets worked around by not calling this script.
# So override exists, is one variable, and is loud: it prints, and it appends to the audit log with
# the stated reason. Silent override is the failure mode; recorded override is a decision.
#
#   TALARIA_FREEZE_OVERRIDE="P0 hotfix, PO notified at 02:10" ./ship.sh
#
# Usage:
#   deploy-freeze-guard.sh check                 # exit 1 if frozen; call this before any deploy
#   deploy-freeze-guard.sh arm <owner> <reason>  # open a freeze
#   deploy-freeze-guard.sh lift <owner> <reason> # close it
#   deploy-freeze-guard.sh status                # print state, always exit 0
set -uo pipefail

LOCK="${TALARIA_FREEZE_LOCK:-/opt/talaria/DEPLOY-FREEZE}"
AUDIT="${TALARIA_FREEZE_AUDIT:-/opt/talaria/DEPLOY-FREEZE.log}"
ACTION="${1:-status}"
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
# Fields are joined here rather than written as "A\tB" at the call sites: bash does not expand
# \t inside double quotes, so those lines logged a literal backslash-t.
log() { local IFS; IFS=$'\t'; printf '%s\t%s\n' "$(now)" "$*" >>"$AUDIT" 2>/dev/null || true; }

case "$ACTION" in
  status)
    if [ -f "$LOCK" ]; then
      echo "DEPLOY FREEZE: ACTIVE"
      sed 's/^/  /' "$LOCK"
    else
      echo "DEPLOY FREEZE: none"
    fi
    ;;

  check)
    if [ ! -f "$LOCK" ]; then
      echo "deploy-freeze: clear"
      exit 0
    fi
    if [ -n "${TALARIA_FREEZE_OVERRIDE:-}" ]; then
      echo "=============================================================="
      echo "DEPLOY FREEZE OVERRIDDEN"
      sed 's/^/  /' "$LOCK"
      echo "  override reason: ${TALARIA_FREEZE_OVERRIDE}"
      echo "=============================================================="
      log OVERRIDE "${TALARIA_FREEZE_OVERRIDE}"
      exit 0
    fi
    echo "=============================================================="                >&2
    echo "REFUSING TO DEPLOY — a deploy freeze is active."                                >&2
    sed 's/^/  /' "$LOCK"                                                                 >&2
    echo "--------------------------------------------------------------"                >&2
    echo "  Lift it:     $0 lift <owner> <reason>"                                        >&2
    echo "  Or override: TALARIA_FREEZE_OVERRIDE='<why>' <your ship command>"             >&2
    echo "=============================================================="                >&2
    log BLOCKED "$(id -un 2>/dev/null || echo unknown)"
    exit 1
    ;;

  arm)
    owner="${2:?usage: $0 arm <owner> <reason>}"
    shift 2
    reason="${*:?usage: $0 arm <owner> <reason>}"
    if [ -f "$LOCK" ]; then
      echo "deploy-freeze: already active; lift it first" >&2
      sed 's/^/  /' "$LOCK" >&2
      exit 1
    fi
    mkdir -p "$(dirname "$LOCK")"
    {
      echo "armed_at: $(now)"
      echo "armed_by: $owner"
      echo "reason:   $reason"
      echo "expiry:   none — holds until explicitly lifted (a window that expires mid-test is worse than none)"
    } >"$LOCK"
    log ARMED "$owner" "$reason"
    echo "deploy-freeze: ARMED"
    sed 's/^/  /' "$LOCK"
    ;;

  lift)
    owner="${2:?usage: $0 lift <owner> <reason>}"
    shift 2
    reason="${*:?usage: $0 lift <owner> <reason>}"
    if [ ! -f "$LOCK" ]; then
      echo "deploy-freeze: nothing to lift"
      exit 0
    fi
    log LIFTED "$owner" "$reason" "was: $(tr '\n' ' ' <"$LOCK")"
    rm -f "$LOCK"
    echo "deploy-freeze: LIFTED by $owner ($reason)"
    ;;

  *)
    echo "usage: $0 {check|arm|lift|status}" >&2
    exit 2
    ;;
esac
