#!/bin/sh
# Hard-bounded: does the claim endpoint answer promptly? Every gated fetch
# (/api/file/*, /api/sessions/N/state) waits on this promise before it is issued.
echo "=== claim: 5 calls, 8s cap each ==="
for i in 1 2 3 4 5; do
  curl -sS --max-time 8 -o /dev/null \
    -w "claim status=%{http_code} total=%{time_total}s connect=%{time_connect}s\n" \
    -X POST -H 'Content-Type: application/json' -d '{"client_id":"probe0000"}' \
    http://127.0.0.1:3000/api/chart/windows/claim \
    || echo "claim TIMED_OUT_OR_FAILED exit=$?"
done

echo "=== heartbeat: 2 calls, 8s cap ==="
for i in 1 2; do
  curl -sS --max-time 8 -o /dev/null \
    -w "heartbeat status=%{http_code} total=%{time_total}s\n" \
    -X POST -H 'Content-Type: application/json' -d '{"client_id":"probe0000"}' \
    http://127.0.0.1:3000/api/chart/windows/heartbeat \
    || echo "heartbeat TIMED_OUT_OR_FAILED exit=$?"
done

echo "=== the other gated path ==="
curl -sS --max-time 8 -o /dev/null \
  -w "sessions/1/state status=%{http_code} total=%{time_total}s\n" \
  http://127.0.0.1:3000/api/sessions/1/state || echo "sessions TIMED_OUT exit=$?"

echo "=== prefs, for comparison (not gated) ==="
curl -sS --max-time 8 -o /dev/null \
  -w "preferences status=%{http_code} total=%{time_total}s\n" \
  http://127.0.0.1:3000/api/chart/preferences || echo "prefs TIMED_OUT exit=$?"

echo "=== gated-path status census, homepage container only, bounded tail ==="
docker logs --tail 6000 talaria-homepage-1 2>&1 \
  | grep -oE '/api/(chart/windows/[a-z]+|sessions/[0-9]+/state)[^ "]*" [0-9]{3}' \
  | awk '{print $1, $NF}' | sort | uniq -c | sort -rn | head -8
