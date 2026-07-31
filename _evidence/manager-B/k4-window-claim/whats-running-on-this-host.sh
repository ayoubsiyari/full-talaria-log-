#!/usr/bin/env bash
# Two things to establish, because a cap I verified at 2 read back as 12 with nothing of mine in
# between, and a trap I added did not fire:
#
#   1. Is the file on the host actually the version I think it is?
#   2. Is something of mine still running in the background, resetting the cap and — much worse —
#      generating browser load during runs I labelled "no load"?
#
# The second question matters more than the first. If a leftover suite was driving Chrome during the
# no-load cells, then the cell I just published is not a no-load cell.
set -uo pipefail
Q() { docker exec talaria-db-1 psql -U talaria -d talaria -At -c "$1"; }

echo "== 1. which version of the arm script is on the host =="
echo -n "  has the self-restoring trap: "
grep -c 'trap restore EXIT' /root/b-tal01891/run-freeze-arm.sh 2>/dev/null || echo 0
echo "  mtime: $(stat -c '%y' /root/b-tal01891/run-freeze-arm.sh 2>/dev/null)"

echo
echo "== 2. anything of mine still running =="
echo "  node processes:"
pgrep -af 'node ' | sed 's/^/    /' || echo "    none"
echo "  chrome/chromium processes: $(pgrep -c -f 'chrome|chromium' 2>/dev/null || echo 0)"
echo "  my shell scripts:"
pgrep -af 'freeze|run-freeze|threshold-suite|fill-missing|ab-b118' | sed 's/^/    /' || echo "    none"
echo "  nohup/background logs touched in the last 30 min:"
find /root -maxdepth 2 -name '*.log' -newermt '-30 minutes' 2>/dev/null | sed 's/^/    /' || true

echo
echo "== 3. current cap, and who could be moving it =="
echo "  qa-canary max_sessions = $(Q "SELECT max_sessions FROM users WHERE id=128;")"
echo "  presence rows for 128  = $(Q "SELECT count(*) FROM chart_window_presence WHERE user_id=128;")"

echo
echo "== 4. host load, which tells me whether the 'no load' cells were really unloaded =="
echo "  loadavg: $(cat /proc/loadavg)"
docker stats --no-stream --format '  {{.Name}} cpu={{.CPUPerc}}' 2>/dev/null | head -8
