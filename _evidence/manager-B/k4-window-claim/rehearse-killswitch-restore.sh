#!/bin/bash
# Rehearsal for the 04:00 window. Proves the restore machinery on a SANDBOX COPY of the real .env.
#
# It runs against a copy on purpose. C's soak shows one established connection to :3000 and I committed
# not to disturb it, and applying a server-side switch for real requires a container restart. The file
# mechanics are identical on a copy; only the restart is deferred to the window.
#
# Six tests, including the two failure modes that matter more than the happy path:
#   4  interrupted run (SIGTERM) - the case that actually bit me at 15:00
#   5  SIGKILL - stated as a real limit rather than papered over
#   6  corrupt backup - restore must refuse rather than write garbage over a good file
set -u -o pipefail
cd "$(dirname "$0")" || exit 1

REAL=/opt/talaria/.env
SANDBOX=/root/b-tal01891/ks-rehearsal/.env
SW=TALARIA_DISABLE_WINDOW_GATE_THREADPOOL_V1
PASS=0; FAIL=0
ok()   { echo "  PASS: $*"; PASS=$((PASS+1)); }
bad()  { echo "  FAIL: $*"; FAIL=$((FAIL+1)); }
sha()  { sha256sum "$1" | awk '{print $1}'; }

mkdir -p /root/b-tal01891/ks-rehearsal
chmod 700 /root/b-tal01891/ks-rehearsal
( umask 077 && cp -p "$REAL" "$SANDBOX" )
GOLD=$(sha "$SANDBOX")
echo "sandbox copy of $REAL"
echo "gold sha256: $GOLD"
echo "real  sha256: $(sha "$REAL")  (must be untouched by this rehearsal)"
REAL_BEFORE=$(sha "$REAL")

export TARGET="$SANDBOX"
export BKDIR=/root/b-tal01891/ks-rehearsal/backups

echo
echo "=== 1. backup is verified against the original before any mutation ==="
out=$(bash ./killswitch.sh backup) || { bad "backup failed"; echo "$out"; }
echo "$out" | sed 's/^/  /'
echo "$out" | grep -q "VERIFIED: backup re-read from disk and byte-identical" \
  && ok "backup byte-verified before mutation" || bad "backup not verified"
MAN=$(echo "$out" | grep '^manifest:' | awk '{print $2}')

echo
echo "=== 2. applying the switch really changes the file ==="
bash ./killswitch.sh set "$SW" 1 2>&1 | sed 's/^/  /'
NOW=$(sha "$SANDBOX")
[ "$NOW" != "$GOLD" ] && ok "file mutated (sha changed)" || bad "file unchanged - switch did not apply"
grep -q "^${SW}=1$" "$SANDBOX" && ok "switch present in file" || bad "switch absent"

echo
echo "=== 3. restore is in place and byte-identical ==="
out=$(bash ./killswitch.sh restore "$MAN") || bad "restore returned non-zero"
echo "$out" | sed 's/^/  /'
[ "$(sha "$SANDBOX")" = "$GOLD" ] && ok "byte-identical to original" || bad "NOT byte-identical"
echo "$out" | grep -q '(in place)' && ok "inode preserved (true in-place write)" || bad "inode changed"
grep -q "^${SW}=" "$SANDBOX" && bad "switch line survived restore" || ok "switch line gone"

echo
echo "=== 4. an INTERRUPTED run restores itself (SIGTERM) ==="
cat > /tmp/ks-longjob.sh <<'JOB'
#!/bin/bash
cd "$(dirname "$0")" || exit 1
source /root/b-tal01891/killswitch.sh
do_backup
do_set "$SWNAME" 1
echo "switch applied, sleeping - kill me here"
sleep 60
echo "SHOULD NOT REACH: job completed normally"
JOB
chmod +x /tmp/ks-longjob.sh
SWNAME="$SW" TARGET="$SANDBOX" BKDIR="$BKDIR" bash /tmp/ks-longjob.sh > /tmp/ks-longjob.out 2>&1 &
JOB=$!
sleep 6
if grep -q "switch applied" /tmp/ks-longjob.out; then
  ok "job applied the switch"
  MID=$(sha "$SANDBOX")
  [ "$MID" != "$GOLD" ] && ok "file is mutated mid-run (so the restore below is a real test)" \
                        || bad "file not mutated mid-run"
  kill -TERM "$JOB"; wait "$JOB" 2>/dev/null; RC=$?
  sleep 1
  sed 's/^/  /' /tmp/ks-longjob.out
  [ "$(sha "$SANDBOX")" = "$GOLD" ] && ok "SIGTERM mid-run left the file restored" \
                                    || bad "SIGTERM LEFT THE SWITCH APPLIED"
  # The job must STOP, not carry on with its conditions silently changed underneath it.
  grep -q "SHOULD NOT REACH" /tmp/ks-longjob.out \
    && bad "job continued past its own interruption" \
    || ok "job stopped at the signal instead of resuming"
  [ "$RC" = "143" ] && ok "exited 143 (SIGTERM), so a caller can tell the run was void" \
                    || bad "exit code $RC does not identify the signal"
else
  bad "job never applied the switch"; sed 's/^/  /' /tmp/ks-longjob.out
  kill -TERM "$JOB" 2>/dev/null; wait "$JOB" 2>/dev/null
fi

echo
echo "=== 5. SIGKILL cannot be trapped - stating the limit honestly ==="
SWNAME="$SW" TARGET="$SANDBOX" BKDIR="$BKDIR" bash /tmp/ks-longjob.sh > /tmp/ks-kill.out 2>&1 &
JOB=$!
sleep 6
kill -KILL "$JOB" 2>/dev/null; wait "$JOB" 2>/dev/null
sleep 1
if [ "$(sha "$SANDBOX")" != "$GOLD" ]; then
  ok "as expected, SIGKILL leaves the switch applied - no trap can run"
  LASTMAN=$(ls -t "$BKDIR"/*.manifest | head -1)
  bash ./killswitch.sh verify "$LASTMAN" > /tmp/ks-verify.out 2>&1; rc=$?
  sed 's/^/  /' /tmp/ks-verify.out
  [ "$rc" != "0" ] && ok "verify DETECTS the unrestored state (exit $rc) - this is the safety net" \
                   || bad "verify failed to detect an unrestored file"
  bash ./killswitch.sh restore "$LASTMAN" | sed 's/^/  /'
  [ "$(sha "$SANDBOX")" = "$GOLD" ] && ok "manual restore recovers it" || bad "manual restore failed"
else
  bad "file was clean after SIGKILL - the test did not exercise what it claims"
fi

echo
echo "=== 6. a corrupt backup must not be written over a good file ==="
out=$(bash ./killswitch.sh backup); MAN2=$(echo "$out" | grep '^manifest:' | awk '{print $2}')
BK2=$(grep '^backup=' "$MAN2" | cut -d= -f2-)
echo "corrupted-by-test" >> "$BK2"
set +e
out=$(bash ./killswitch.sh restore "$MAN2" 2>&1); rc=$?
set -e
echo "$out" | sed 's/^/  /'
[ "$rc" != "0" ] && ok "restore refused a corrupt backup (exit $rc)" || bad "restore accepted a corrupt backup"
[ "$(sha "$SANDBOX")" = "$GOLD" ] && ok "good file left intact" || bad "GOOD FILE WAS DAMAGED"

echo
echo "=== the real .env was never touched ==="
REAL_AFTER=$(sha "$REAL")
echo "  before: $REAL_BEFORE"
echo "  after:  $REAL_AFTER"
[ "$REAL_BEFORE" = "$REAL_AFTER" ] && ok "real .env unchanged" || bad "REAL .env CHANGED"

echo
echo "=== live container state (read-only) ==="
bash ./killswitch.sh verify 2>&1 | sed 's/^/  /'

echo
echo "================ $PASS passed, $FAIL failed ================"
[ "$FAIL" = "0" ] || exit 1
