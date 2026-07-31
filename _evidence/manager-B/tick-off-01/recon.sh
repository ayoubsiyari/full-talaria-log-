#!/usr/bin/env bash
set -uo pipefail
echo "=== last drift log lines ==="
tail -6 /root/talaria-restore/LIVE-DRIFT.log 2>&1
echo
echo "=== prior ship scripts ==="
ls -1 /root/b-ship/ 2>&1 | head -20
echo
echo "=== build context /opt/talaria ==="
cd /opt/talaria 2>/dev/null && { git rev-parse --short HEAD 2>&1; git status --porcelain 2>&1 | head -8; echo "--- empty above means clean b116 context"; } || echo "no git in /opt/talaria"
echo
echo "=== compose services ==="
docker compose -f /opt/talaria/docker-compose.yml config --services 2>&1 | head
echo
echo "=== running images ==="
docker ps --format '{{.Names}}  {{.Image}}' | head
