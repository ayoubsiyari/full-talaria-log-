#!/usr/bin/env bash
set -uo pipefail
echo "=== host headroom ==="
free -m | head -2
df -h / | tail -1
echo
echo "=== running stack ==="
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}' | sed 's/^/  /'
echo
echo "=== compose project + file ==="
ls -1 /opt/talaria/*.yml /opt/talaria/docker-compose* 2>/dev/null | sed 's/^/  /'
ls -1 /root/talaria-restore/docker-compose* 2>/dev/null | sed 's/^/  /'
echo
echo "=== app image currently serving ==="
docker inspect --format '{{.Config.Image}}' $(docker ps -q --filter "name=api" | head -1) 2>/dev/null | sed 's/^/  /'
echo
echo "=== WEB_CONCURRENCY / pool env in the live api container ==="
API=$(docker ps --format '{{.Names}}' | grep -Ei 'api|web' | head -1)
echo "  container: $API"
docker exec "$API" sh -lc 'env | grep -Ei "WEB_CONCURRENCY|DB_POOL|DB_MAX_OVERFLOW|DATABASE_URL" | sed "s/:\/\/[^@]*@/:\/\/***@/"' 2>/dev/null | sed 's/^/  /'
echo
echo "=== free ports in the 3100-3110 range ==="
for p in 3101 3102 3103; do
  if ! ss -ltn | grep -q ":$p "; then echo "  $p free"; fi
done
