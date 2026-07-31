#!/usr/bin/env bash
# Decide, at LOW concurrency, whether the freeze is event-loop blocking or ordinary queueing.
#
# The first reproduction used 180 concurrent connections against 2 workers. That reliably froze the
# app, but it cannot tell the two apart: at that concurrency requests queue at the worker whatever
# the loop is doing. The threadpool fix not helping is consistent with "it was queueing all along",
# so the hypothesis has to be tested directly instead of argued.
#
# Design: one worker, one database connection, and a handful of clients.
#   WEB_CONCURRENCY=1     exactly one event loop to observe
#   DB_POOL_SIZE=1, DB_MAX_OVERFLOW=0   the pool is empty the moment one request holds it
#   ~4 concurrent clients so there is no queue to speak of
#
# Now a single in-flight claim owns the only connection. A concurrent gated request must wait for
# checkout. Unfixed, that wait happens inline in the async middleware and freezes the loop; fixed,
# it happens in a worker thread and the loop stays free. Same load, same worker count, same pool —
# if the two builds differ here, the mechanism is the blocking checkout and nothing else.
set -euo pipefail

up() {
  local name=$1 image=$2 port=$3
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker run -d --name "$name" \
    --network talaria_default \
    --env-file /root/b-k4/.scratch.env \
    -e WEB_CONCURRENCY=1 -e DB_POOL_SIZE=1 -e DB_MAX_OVERFLOW=0 \
    -p "127.0.0.1:${port}:8000" \
    "$image" \
    sh -c 'exec gunicorn api_server:app -w 1 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000 --timeout 1800 --keep-alive 5' \
    >/dev/null
  echo -n "  $name on :$port "
  for i in $(seq 1 90); do
    c=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${port}/api/health" 2>/dev/null || true)
    if [ "$c" = "401" ] || [ "$c" = "200" ]; then echo "up (${i}s, http $c)"; return 0; fi
    sleep 1
  done
  echo "FAILED"; docker logs "$name" 2>&1 | tail -20; return 1
}

echo "=== single-worker, single-connection instances ==="
up k4-tiny-unfixed talaria-trading-chart:canary-20260731b118 3103
up k4-tiny-fixed   talaria-trading-chart:k4fix               3104

echo
echo "=== confirm the pool really is 1 ==="
for n in k4-tiny-unfixed k4-tiny-fixed; do
  echo -n "  $n: "
  docker exec "$n" sh -lc 'env | grep -E "DB_POOL_SIZE|DB_MAX_OVERFLOW|WEB_CONCURRENCY" | tr "\n" " "'
  echo
done
