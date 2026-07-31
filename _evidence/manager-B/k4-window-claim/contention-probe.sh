#!/usr/bin/env bash
# K4 — is the window-claim P0 a queue or a hang?
#
# I already shipped a bounded control fetch and a 12s gate floor on the client, and the hang
# survived. So the client is not where it lives. The server endpoint is a sync `def` taking a
# FOR UPDATE row lock, run in FastAPI's threadpool. That protects the event loop, which is what
# the code comment claims — but it does NOT bound the threadpool or the database pool.
#
# The distinction that matters:
#   - claims serialising among themselves          = a queue, acceptable
#   - claims making UNRELATED requests slow        = starvation, and that is the hang
#
# So the discriminator is an endpoint that has nothing to do with window claims, measured while
# claims are contending. /api/auth/me touches the session and returns immediately.
set -uo pipefail
BASE=http://127.0.0.1:3000
. /root/.talaria-test-env
JAR=/tmp/k4-cookies.txt
N="${N_CLAIMS:-16}"
rm -f "$JAR" /tmp/k4-*.out

echo "=== worker topology (how many requests can be in flight at once?) ==="
docker exec talaria-trading-chart-1 sh -c 'ps ax | grep -c "[g]unicorn"' | sed 's/^/  gunicorn procs: /'
docker exec talaria-trading-chart-1 sh -c 'cat /proc/1/cmdline | tr "\0" " "' 2>/dev/null | tr -s ' ' | sed 's/^/  cmd: /'
echo

echo "=== log in ==="
code=$(curl -sS -c "$JAR" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" -o /tmp/k4-login.json -w '%{http_code}')
echo "  http $code"
[ "$code" = "200" ] || { echo "  ABORT: cannot log in"; exit 2; }

echo
echo "=== baseline: unrelated endpoint with NO contention (10 samples) ==="
for i in $(seq 1 10); do
  curl -sS -b "$JAR" -o /dev/null -w '%{time_total}\n' "$BASE/api/auth/me"
done | sort -n | awk '{a[NR]=$1} END {printf "  min %.3fs  median %.3fs  max %.3fs\n", a[1], a[int(NR/2)+1], a[NR]}'

echo
echo "=== fire $N concurrent claims for the SAME user (they contend on one row lock) ==="
start=$(date +%s.%N)
for i in $(seq 1 "$N"); do
  ( curl -sS -b "$JAR" -X POST "$BASE/api/chart/windows/claim" \
      -H 'Content-Type: application/json' \
      -d "{\"client_id\":\"k4-probe-$i-aaaaaaaa\"}" \
      -o "/tmp/k4-claim-$i.out" -w "%{http_code} %{time_total}\n" ) >> /tmp/k4-claims.txt 2>&1 &
done

# While they are in flight, hammer the UNRELATED endpoint. This is the whole experiment.
sleep 0.35
echo "  --- /api/auth/me DURING claim contention (10 samples) ---"
for i in $(seq 1 10); do
  curl -sS -b "$JAR" -m 30 -o /dev/null -w '%{time_total} %{http_code}\n' "$BASE/api/auth/me"
done > /tmp/k4-during.txt
sort -n /tmp/k4-during.txt | awk '{a[NR]=$1} END {printf "  min %.3fs  median %.3fs  max %.3fs\n", a[1], a[int(NR/2)+1], a[NR]}'
echo "  status codes: $(awk '{print $2}' /tmp/k4-during.txt | sort | uniq -c | tr '\n' ' ')"

wait
end=$(date +%s.%N)
echo
echo "=== claim outcomes ==="
sort /tmp/k4-claims.txt | awk '{c[$1]++; t[NR]=$2} END {for (k in c) printf "  http %s : %s\n", k, c[k]}'
awk '{print $2}' /tmp/k4-claims.txt | sort -n | awk '{a[NR]=$1} END {printf "  claim latency: min %.3fs  median %.3fs  max %.3fs\n", a[1], a[int(NR/2)+1], a[NR]}'
echo "  wall clock for all $N: $(echo "$end - $start" | bc)s"

echo
echo "=== recovery: unrelated endpoint AFTER contention (10 samples) ==="
for i in $(seq 1 10); do
  curl -sS -b "$JAR" -o /dev/null -w '%{time_total}\n' "$BASE/api/auth/me"
done | sort -n | awk '{a[NR]=$1} END {printf "  min %.3fs  median %.3fs  max %.3fs\n", a[1], a[int(NR/2)+1], a[NR]}'

echo
echo "=== verdict input ==="
base_med=$(for i in $(seq 1 5); do curl -sS -b "$JAR" -o /dev/null -w '%{time_total}\n' "$BASE/api/auth/me"; done | sort -n | sed -n 3p)
dur_max=$(sort -n /tmp/k4-during.txt | tail -1 | awk '{print $1}')
echo "  quiet median      : ${base_med}s"
echo "  worst DURING      : ${dur_max}s"
echo "  If 'worst DURING' is close to quiet, claims queue among themselves and the API stays"
echo "  responsive. If it blows up, unrelated traffic is being starved and that is the hang."

echo
echo "=== cleanup the probe's claim rows ==="
docker exec talaria-db-1 psql -U talaria -d talaria -At -c \
  "DELETE FROM chart_window_presence WHERE client_id LIKE 'k4-probe-%';" | sed 's/^/  /'
