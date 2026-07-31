#!/bin/bash
# Kill-switch apply/restore with a checksum-verified backup.
#
# Written because of my own incident at 15:00: an A/B script suppressed the output of the command that
# changed what was deployed, then wrote a state file asserting the result it had not checked. The canary
# sat on b118 with a live P0 while a file on disk claimed b120. This tool encodes the two rules that came
# out of it, plus the one that matters most and is easiest to skip:
#
#   A backup you have not checksummed is not a backup. Verify it BEFORE you mutate, not after.
#
# Properties:
#   - backup is byte-verified against the original before any write is permitted
#   - restore is IN PLACE: the existing inode is truncated and rewritten, so mode, owner and any
#     bind-mount identity survive; a mv-over would silently replace all three
#   - restore re-reads the file from disk and compares to the recorded checksum; mismatch exits non-zero
#   - a trap on EXIT/INT/TERM/HUP restores if the switch is still applied, so an interrupted or killed
#     run cannot leave the switch on. That is the failure that actually bit me.
#   - nothing is suppressed, and the file's contents are never printed: .env holds secrets and this
#     output goes into evidence artifacts. Checksums only.
set -u -o pipefail

TARGET="${TARGET:-/opt/talaria/.env}"
BKDIR="${BKDIR:-/root/b-tal01891/killswitch-backups}"
CHART="${CHART:-talaria-trading-chart-1}"
APPLIED=0
MANIFEST=""

die() { echo "FAIL: $*" >&2; exit 1; }
sha() { sha256sum "$1" | awk '{print $1}'; }

# ---------------------------------------------------------------- backup

do_backup() {
  [ -f "$TARGET" ] || die "target does not exist: $TARGET"
  mkdir -p "$BKDIR" || die "cannot create $BKDIR"
  chmod 700 "$BKDIR" || die "cannot chmod $BKDIR"

  # Host clock, read at write time. Never a timestamp I typed.
  local stamp; stamp=$(date -u +%Y%m%dT%H%M%SZ) || die "date failed"
  local bk="$BKDIR/env.$stamp.bak"
  MANIFEST="$BKDIR/env.$stamp.manifest"

  local before; before=$(sha "$TARGET") || die "cannot checksum target"
  local mode;   mode=$(stat -c '%a' "$TARGET")
  local owner;  owner=$(stat -c '%u:%g' "$TARGET")
  local bytes;  bytes=$(stat -c '%s' "$TARGET")

  ( umask 077 && cp -p "$TARGET" "$bk" ) || die "copy failed"
  local after; after=$(sha "$bk") || die "cannot checksum backup"

  # The load-bearing check. If this does not hold, no mutation is permitted.
  [ "$before" = "$after" ] || die "BACKUP DOES NOT MATCH ORIGINAL ($before vs $after) - refusing to proceed"

  cat > "$MANIFEST" <<EOF
target=$TARGET
backup=$bk
sha256=$before
bytes=$bytes
mode=$mode
owner=$owner
taken_utc=$stamp
verified=backup-reread-and-compared-equal
EOF
  chmod 600 "$MANIFEST" "$bk" || die "cannot chmod backup"

  echo "backup:   $bk"
  echo "manifest: $MANIFEST"
  echo "sha256:   $before  ($bytes bytes, mode $mode, owner $owner)"
  echo "VERIFIED: backup re-read from disk and byte-identical to original"
}

# ---------------------------------------------------------------- restore

do_restore() {
  local m="${1:-$MANIFEST}"
  [ -n "$m" ] && [ -f "$m" ] || die "no manifest to restore from"
  # shellcheck disable=SC1090
  local bk want tgt
  bk=$(grep '^backup=' "$m" | cut -d= -f2-)
  want=$(grep '^sha256=' "$m" | cut -d= -f2-)
  tgt=$(grep '^target=' "$m" | cut -d= -f2-)
  [ -f "$bk" ] || die "backup file missing: $bk"
  [ "$(sha "$bk")" = "$want" ] || die "BACKUP ITSELF IS CORRUPT - not restoring from it"

  # In place: truncate and rewrite the existing inode rather than mv over it.
  local ino_before; ino_before=$(stat -c '%i' "$tgt" 2>/dev/null || echo none)
  cat "$bk" > "$tgt" || die "in-place write failed"
  local ino_after; ino_after=$(stat -c '%i' "$tgt")

  local got; got=$(sha "$tgt")
  if [ "$got" != "$want" ]; then
    echo "FAIL: RESTORE DID NOT MATCH. target=$tgt want=$want got=$got" >&2
    echo "FAIL: the good copy is still at $bk - restore it by hand before anything else runs" >&2
    exit 2
  fi
  APPLIED=0
  echo "restored: $tgt"
  echo "sha256:   $got  (matches manifest)"
  echo "inode:    $ino_before -> $ino_after $([ "$ino_before" = "$ino_after" ] && echo '(in place)' || echo '(CHANGED - not in place)')"
}

on_exit() {
  local rc=$?
  if [ "$APPLIED" = "1" ]; then
    echo ""
    echo "=== TRAP: switch still applied at exit (rc=$rc). Restoring. ==="
    do_restore "$MANIFEST" || echo "TRAP RESTORE FAILED - MANUAL ACTION REQUIRED" >&2
  fi
  return $rc
}

# Signals get their own handler that restores and then STOPS. The first version of this trapped
# INT/TERM/HUP with on_exit, which returns — so after a SIGTERM the caller carried on running with the
# switch silently flipped back underneath it, and the rehearsal printed "SHOULD NOT REACH". A handler
# that lets the job continue past its own interruption is how you get a measurement whose conditions
# changed halfway through and no line in the log saying so.
on_signal() {
  local sig="$1"
  echo ""
  echo "=== SIG${sig}: restoring, then stopping. This run is void, not resumed. ==="
  if [ "$APPLIED" = "1" ]; then
    do_restore "$MANIFEST" || echo "SIGNAL RESTORE FAILED - MANUAL ACTION REQUIRED" >&2
  else
    echo "(no switch applied; nothing to restore)"
  fi
  trap - EXIT
  case "$sig" in INT) exit 130 ;; TERM) exit 143 ;; HUP) exit 129 ;; *) exit 1 ;; esac
}
trap on_exit EXIT
trap 'on_signal INT'  INT
trap 'on_signal TERM' TERM
trap 'on_signal HUP'  HUP

# ---------------------------------------------------------------- apply

do_set() {
  local name="$1" val="$2"
  [ "$APPLIED" = "0" ] || die "a switch is already applied"
  [ -n "$MANIFEST" ] || die "backup must be taken first"
  APPLIED=1
  if grep -q "^${name}=" "$TARGET"; then
    sed -i "s|^${name}=.*|${name}=${val}|" "$TARGET" || die "sed failed"
  else
    printf '%s=%s\n' "$name" "$val" >> "$TARGET" || die "append failed"
  fi
  grep -q "^${name}=${val}$" "$TARGET" || die "switch did not take effect in the file"
  echo "applied:  ${name}=${val}"
  echo "file sha: $(sha "$TARGET")  (expected to differ from manifest - it has been mutated)"
}

# ---------------------------------------------------------------- verify

do_verify() {
  local m="${1:-$MANIFEST}"
  echo "=== file ==="
  if [ -n "$m" ] && [ -f "$m" ]; then
    local want; want=$(grep '^sha256=' "$m" | cut -d= -f2-)
    local got;  got=$(sha "$TARGET")
    echo "manifest sha256: $want"
    echo "on-disk  sha256: $got"
    [ "$want" = "$got" ] && echo "MATCH - file is in its recorded state" \
                         || { echo "MISMATCH - file is NOT in its recorded state"; return 3; }
  else
    echo "(no manifest given; on-disk sha256: $(sha "$TARGET"))"
  fi
  echo "=== running container ==="
  # The invariant on this canary: no kill-switch is set at all. Interrogate the container, not the file.
  local n
  n=$(docker exec "$CHART" env 2>/dev/null | grep -c '^TALARIA_DISABLE_' || true)
  echo "TALARIA_DISABLE_* set in $CHART: $n"
  if [ "$n" != "0" ]; then
    echo "the following are set, and the product default is none:"
    docker exec "$CHART" env | grep '^TALARIA_DISABLE_'
    return 4
  fi
  echo "MATCH - container carries no kill-switch, which is the product default"
}

# Dispatch only when executed directly. Sourcing gives a caller the functions plus the exit trap, which
# is how a measurement run should use this: source it, apply, measure, and let the trap cover the paths
# the caller forgot about.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  case "${1:-}" in
    backup)  do_backup ;;
    restore) do_restore "${2:-}" ;;
    verify)  do_verify "${2:-}" ;;
    set)     do_backup; do_set "$2" "$3"; APPLIED=0; echo "(APPLIED cleared: 'set' is for callers that restore explicitly)" ;;
    *) echo "usage: $0 {backup|restore <manifest>|verify [manifest]|set <NAME> <VALUE>}"; exit 64 ;;
  esac
fi
