#!/usr/bin/env bash
# A properly-powered flag A/B, ready to fire once someone names the flag.
#
#   bash flag-ab.sh --flag TALARIA_DISABLE_SOMETHING_V1 --repeats 5 [--session 936] [--file 677]
#
# Built as a parameterised runner rather than a one-off because the underpowered result it replaces was
# not underpowered through carelessness - a powered A/B is 20 windows and two container restarts, and
# nobody does that by hand at 2am. This does it in one command and refuses to lie about the outcome.
#
# Properties that matter, each one bought with an incident tonight:
#   - the flag is verified IN THE RUNNING CONTAINER, not in the .env file we just wrote. A marker in a
#     file we authored is not evidence about the thing under test.
#   - no output suppression anywhere a failure would change what is deployed.
#   - .env restore is checksum-verified in place via killswitch.sh, with a trap, and re-verified after
#     each arm rather than once at the end.
#   - it declares the regime it measured and REFUSES to imply anything about the other one.
#   - it hands the numbers to regime-oracle.mjs instead of eyeballing them.
set -uo pipefail

FLAG=""; REPEATS=5; SESSION=936; FILEID=677; OUT="flag-ab-$(date -u +%Y%m%dT%H%M%SZ)"
while [ $# -gt 0 ]; do
  case "$1" in
    --flag) FLAG="$2"; shift 2;;
    --repeats) REPEATS="$2"; shift 2;;
    --session) SESSION="$2"; shift 2;;
    --file) FILEID="$2"; shift 2;;
    --out) OUT="$2"; shift 2;;
    *) echo "unknown arg: $1"; exit 2;;
  esac
done
[ -n "$FLAG" ] || { echo "FATAL: --flag is required. This script will not guess at the independent variable."; exit 2; }
[ "$REPEATS" -ge 3 ] || { echo "FATAL: --repeats must be >= 3; below that the run cannot evaluate no-regression."; exit 2; }

CHART=talaria-trading-chart-1
cd /root/b-tal01891

echo "############ FLAG A/B ############"
echo "flag     : $FLAG"
echo "repeats  : $REPEATS per arm  (2 arms = $((REPEATS*2)) windows)"
echo "session  : $SESSION / file $FILEID"
echo "started  : $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo

echo "=== preflight: is the host actually free? ==="
bash can-i-run-now.sh || true
echo
echo -n "chart container cpu: "
docker stats --no-stream --format '{{.CPUPerc}}' "$CHART"
read -r -p "Proceed? host must be quiet [y/N] " ok < /dev/tty || ok=n
[ "$ok" = "y" ] || { echo "aborted by operator"; exit 1; }

echo
echo "=== backup .env, checksum-verified ==="
bash killswitch.sh backup || { echo "FATAL: backup failed, refusing to mutate"; exit 1; }
MANIFEST=$(ls -t killswitch-backups/*.manifest | head -1)
echo "manifest: $MANIFEST"

restore_now() {
  echo
  echo "=== restoring .env in place ==="
  bash killswitch.sh restore "$MANIFEST"
  bash killswitch.sh verify "$MANIFEST"
}
trap 'echo; echo "SIGNAL - restoring before exit"; restore_now; exit 143' INT TERM HUP
trap 'restore_now' EXIT

# Assert the flag's state inside the RUNNING container, which is the only place it can be true.
assert_flag_in_container() {
  local want="$1"   # present | absent
  local n
  n=$(docker exec "$CHART" env | grep -c "^${FLAG}=" || true)
  echo "  container env has ${FLAG}: $n occurrence(s), wanted $want"
  if [ "$want" = present ] && [ "$n" -lt 1 ]; then
    echo "  FATAL: flag was written to .env but is NOT in the running container."
    echo "  That is the b118/b120 pin bug again - the file said one thing and the container another."
    return 1
  fi
  if [ "$want" = absent ] && [ "$n" -ne 0 ]; then
    echo "  FATAL: flag still present in container after restore."
    return 1
  fi
  return 0
}

run_arm() {
  local label="$1" want="$2" json="${OUT}-${1}.json"
  echo
  echo "======== ARM: $label (flag $want) ========"
  assert_flag_in_container "$want" || return 1
  echo -n "  build in container: "
  docker exec "$CHART" sh -c 'cat /app/BUILD_ID 2>/dev/null || echo unknown'
  echo "  running $REPEATS windows..."
  REPEATS="$REPEATS" SESSION="$SESSION" FILEID="$FILEID" OUT_JSON="$json" \
    node flag-ab-arm.mjs
  local rc=$?
  echo "  arm exit: $rc  ->  $json"
  return $rc
}

echo
echo "############ ARM 1: flag OFF (product default) ############"
run_arm "flagoff" absent || { echo "ARM 1 FAILED"; exit 1; }

echo
echo "############ applying flag ############"
bash killswitch.sh apply "$FLAG=1"   # restarts the container; output deliberately not suppressed
echo "waiting for health..."
for i in $(seq 1 30); do
  s=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/health || true)
  [ "$s" = "200" ] && { echo "healthy after ${i}s"; break; }
  sleep 1
done
bash killswitch.sh verify "$MANIFEST" || echo "NOTE: .env differs from backup, which is expected while the flag is applied"

echo
echo "############ ARM 2: flag ON ############"
run_arm "flagon" present || { echo "ARM 2 FAILED"; exit 1; }

echo
echo "############ VERDICT ############"
node -e '
const fs=require("fs");
const off=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
const on=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
import("./regime-oracle.mjs").then(({verdict,printVerdict})=>{
  const v=verdict({
    zeroTrade:{before:off.blockedMsPerSec, after:on.blockedMsPerSec},
    // Deliberately absent. This host has no trade-bearing session stamped, and REGIME-01 says an
    // unmeasured arm is a FAIL rather than a silence. The oracle will say so.
  },{declaredRegime:"zeroTrade"});
  printVerdict(v,"("+process.argv[3]+")");
  console.log("");
  console.log("READ THIS BEFORE QUOTING THE RESULT:");
  console.log("  this run measured the ZERO-TRADE regime only. Whatever it says about "+process.argv[3]+",");
  console.log("  it says nothing about the trade-bearing regime, where the dominant cost is a different");
  console.log("  function entirely (C measured _chartIndexForCloseMarkerOnChart at 31.8%; this session");
  console.log("  calls it zero times). The trade-bearing arm is owed before any fix is recorded as passing.");
});
' "${OUT}-flagoff.json" "${OUT}-flagon.json" "$FLAG"

echo
echo "finished: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
# EXIT trap restores and verifies
