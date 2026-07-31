#!/usr/bin/env bash
# Run one freeze arm cleanly.
#
# The QA account's window cap is 2. Two replay windows plus a load generator is three claims, so
# the oldest gets evicted by design and its chart stops — which looks like a 30s freeze but is the
# cap working correctly. Raising the cap for the measurement removes that confound, so what is left
# is the freeze the defect causes.
#
# The cap is restored by THIS script, on any exit path, to whatever it was when the script started.
# It used to say "restored at the end by run-freeze-restore.sh" and in practice restoration lived in
# the traps of two wrapper scripts. fill-missing-cell.sh then called this script directly and left
# qa-canary on a cap of 12 for over an hour — an account D also uses. Cleanup belongs to the thing
# that makes the mess, and the value restored is read rather than assumed, so this cannot drift from
# the product value either.
set -uo pipefail
CAP="${CAP:-12}"
Q() { docker exec talaria-db-1 psql -U talaria -d talaria -At -c "$1"; }

PRIOR_CAP=$(Q "SELECT max_sessions FROM users WHERE email='qa-canary@talaria-log.com';" | tr -d '[:space:]')
if ! [ "$PRIOR_CAP" -eq "$PRIOR_CAP" ] 2>/dev/null; then
  echo "  ABORT: could not read the account's current cap (got '$PRIOR_CAP'), so it could not be restored." >&2
  exit 2
fi
echo "  cap before: $PRIOR_CAP"

restore() {
  local rc=$?
  echo
  echo "  restoring cap to $PRIOR_CAP"
  Q "UPDATE users SET max_sessions=$PRIOR_CAP WHERE email='qa-canary@talaria-log.com';" | sed 's/^/    /'
  Q "DELETE FROM chart_window_presence WHERE user_id=128;" | sed 's/^/    cleared windows: /'
  local now
  now=$(Q "SELECT max_sessions FROM users WHERE email='qa-canary@talaria-log.com';" | tr -d '[:space:]')
  if [ "$now" = "$PRIOR_CAP" ]; then
    echo "    verified: max_sessions=$now"
  else
    echo "    RESTORE FAILED: cap is $now, expected $PRIOR_CAP — fix before anyone else measures" >&2
  fi
  return $rc
}
trap restore EXIT INT TERM

Q "UPDATE users SET max_sessions=$CAP WHERE email='qa-canary@talaria-log.com';" | sed 's/^/  cap set: /'
Q "DELETE FROM chart_window_presence WHERE user_id=128;" | sed 's/^/  cleared windows: /'
echo "  live pin: $(cat /root/talaria-restore/LIVE-PIN.txt)"
echo
cd /root/b-tal01891 && node main-thread-freeze.mjs
