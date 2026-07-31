#!/usr/bin/env bash
# I published a "no artificial load" cell and then found the host was not quiet: an orphaned
# main-thread-freeze.mjs with 13 Chrome processes was still running, loadavg 12.13, and until a few
# minutes ago four scratch API containers were up too. "No load" in my label meant "my HTTP
# generator was off", which is not the same claim.
#
# So: kill my orphans, wait for the host to settle, prove it settled, and re-run the cell recording
# loadavg alongside each reading. If the numbers hold on a quiet host the finding stands as
# published. If they collapse, the cell was measuring my own leftovers and has to be corrected.
#
# The orphan exists because I killed the wrapper shell rather than the node child. Killing a parent
# does not kill what it spawned, and the parent's trap is what I was trying to test.
set -uo pipefail
Q() { docker exec talaria-db-1 psql -U talaria -d talaria -At -c "$1"; }

echo "== 1. kill my orphaned probes, by name, and only mine =="
for p in $(pgrep -f 'main-thread-freeze.mjs' 2>/dev/null); do
  echo "  killing node $p"; kill -9 "$p" 2>/dev/null
done
# Chrome instances launched by the probe carry the probe's user-data-dir under /tmp.
for p in $(pgrep -f 'chrome.*--user-data-dir=/tmp' 2>/dev/null); do
  kill -9 "$p" 2>/dev/null
done
sleep 3
echo "  node left:   $(pgrep -c -f 'main-thread-freeze.mjs' 2>/dev/null || echo 0)"
echo "  chrome left: $(pgrep -c -f 'chrome|chromium' 2>/dev/null || echo 0)"

echo
echo "== 2. restore the cap my orphan left raised =="
Q "UPDATE users SET max_sessions=2 WHERE id=128;" | sed 's/^/  /'
Q "DELETE FROM chart_window_presence WHERE user_id IN (128,131);" | sed 's/^/  cleared: /'
echo "  cap now: $(Q "SELECT max_sessions FROM users WHERE id=128;")"

echo
echo "== 3. wait for the host to settle, and prove it did =="
for i in $(seq 1 10); do
  la=$(awk '{print $1}' /proc/loadavg)
  echo "  t+$((i*15))s loadavg1=$la"
  # shellcheck disable=SC2072
  if awk -v l="$la" 'BEGIN{exit !(l < 1.5)}'; then echo "  settled"; break; fi
  sleep 15
done
echo "  final loadavg: $(cat /proc/loadavg)"
docker stats --no-stream --format '  {{.Name}} cpu={{.CPUPerc}}' 2>/dev/null | head -8

echo
echo "== 4. re-run the no-load cell on the quiet host, loadavg recorded per reading =="
for i in 1 2 3; do
  echo "--- quiet no-load run $i ---"
  echo "  loadavg before: $(awk '{print $1, $2, $3}' /proc/loadavg)"
  LABEL="quiet-noload-r$i" WINDOWS=1 SPEED=10 LOAD=0 MEASURE_MS=30000 \
    /root/b-tal01891/run-freeze-arm.sh 2>&1 | grep -E '^  win1  |cap before|restoring|verified'
  echo "  loadavg after:  $(awk '{print $1, $2, $3}' /proc/loadavg)"
done

echo
echo "== 5. leave the account as the product has it =="
Q "UPDATE users SET max_sessions=2 WHERE id=128;" >/dev/null
Q "DELETE FROM chart_window_presence WHERE user_id IN (128,131);" >/dev/null
echo "  cap: $(Q "SELECT max_sessions FROM users WHERE id=128;")  presence rows for 128: $(Q "SELECT count(*) FROM chart_window_presence WHERE user_id=128;")"
echo "  node left: $(pgrep -c -f 'main-thread-freeze.mjs' 2>/dev/null || echo 0)  chrome left: $(pgrep -c -f 'chrome|chromium' 2>/dev/null || echo 0)"
