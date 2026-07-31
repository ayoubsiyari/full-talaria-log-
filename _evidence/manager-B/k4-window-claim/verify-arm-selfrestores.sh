#!/usr/bin/env bash
# Prove the trap works, by asking the database rather than reading the script.
set -uo pipefail
Q() { docker exec talaria-db-1 psql -U talaria -d talaria -At -c "$1"; }
echo "cap before test: $(Q "SELECT max_sessions FROM users WHERE id=128;")"
echo
echo "--- one short arm ---"
LABEL=restore-selftest WINDOWS=1 SPEED=10 LOAD=0 MEASURE_MS=8000 \
  /root/b-tal01891/run-freeze-arm.sh 2>&1 | grep -E 'cap |restoring|verified|RESTORE FAILED|win1'
echo
echo "cap after test:  $(Q "SELECT max_sessions FROM users WHERE id=128;")   (must be 2)"
echo "presence rows for 128: $(Q "SELECT count(*) FROM chart_window_presence WHERE user_id=128;")"
echo
echo "--- and it must restore even when killed mid-run ---"
LABEL=restore-killtest WINDOWS=1 SPEED=10 LOAD=0 MEASURE_MS=60000 \
  /root/b-tal01891/run-freeze-arm.sh > /tmp/killtest.log 2>&1 &
pid=$!
sleep 12
echo "  cap while running: $(Q "SELECT max_sessions FROM users WHERE id=128;")   (should be 12)"
kill -TERM $pid 2>/dev/null
wait $pid 2>/dev/null
sleep 2
echo "  cap after kill:    $(Q "SELECT max_sessions FROM users WHERE id=128;")   (must be 2)"
grep -E 'restoring|verified|RESTORE FAILED' /tmp/killtest.log | sed 's/^/  /'
