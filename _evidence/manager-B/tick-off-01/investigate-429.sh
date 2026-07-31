#!/usr/bin/env bash
# 87% of traffic since the deploy is 429. Either b117 broke something for real users, or a harness
# is hammering a rate limit that was always there. Those need different responses, so find out.
set -uo pipefail
echo "=== who is getting 429, and on what? ==="
docker logs --since 10m talaria-homepage-1 2>&1 | awk '$9==429 {print $1}' | sort | uniq -c | sort -rn | head -5 | sed 's/^/  client: /'
echo
docker logs --since 10m talaria-homepage-1 2>&1 | awk '$9==429 {print $7}' | sed 's/?.*//' \
  | sort | uniq -c | sort -rn | head -8 | sed 's/^/  path: /'
echo
echo "=== user agent of the 429 traffic ==="
docker logs --since 10m talaria-homepage-1 2>&1 | awk '$9==429' | grep -oE '"Mozilla[^"]*"' \
  | sort | uniq -c | sort -rn | head -3 | sed 's/^/  /'
echo
echo "=== is ANY client getting 200s, i.e. is the product usable? ==="
docker logs --since 10m talaria-homepage-1 2>&1 | awk '$9==200 {print $1}' | sort | uniq -c | sort -rn | head -5 | sed 's/^/  /'
echo
docker logs --since 10m talaria-homepage-1 2>&1 | awk '$9==200 {print $7}' | sed 's/?.*//' \
  | sort | uniq -c | sort -rn | head -8 | sed 's/^/  200 path: /'
echo
echo "=== was the rate limiter already firing on b116? ==="
echo "  the homepage container was recreated, so its own history is gone. The b85 grade container"
echo "  was NOT recreated and shares the stack — check whether 429s predate today's deploy:"
docker logs --since 6h talaria-grade-homepage 2>&1 | awk '{print $9}' | sort | uniq -c | sort -rn | head -5 | sed 's/^/    grade-homepage: /'
echo
echo "=== does the rate limit come from nginx or the app? ==="
docker exec talaria-homepage-1 sh -c 'grep -rn "limit_req\|limit_conn" /etc/nginx/ 2>/dev/null | head -6' | sed 's/^/  /'
echo
echo "=== a fresh client right now: is a NEW user rate limited? ==="
for i in 1 2 3; do
  printf '  attempt %s: ' "$i"
  curl -sS -o /dev/null -m 10 -w 'http=%{http_code}\n' http://127.0.0.1:3000/chart/dist-v9/index.html
done
echo "  (200s here mean the limiter is per-client and the product is fine for everyone else)"
echo
echo "=== rate of the offending client over time ==="
docker logs --since 10m talaria-homepage-1 2>&1 | grep -oE '[0-9]{2}:[0-9]{2}:[0-9]{2}' \
  | cut -d: -f1-2 | sort | uniq -c | sed 's/^/  /'
