#!/usr/bin/env bash
set -euo pipefail
ssh -p 443 -o BatchMode=yes -o StrictHostKeyChecking=accept-new root@31.97.192.82 '
echo === PINNED b90 ===
cat /root/talaria-restore/PINNED-20260729b90.txt 2>/dev/null || true
echo === compose working_dir ===
docker inspect -f "{{index .Config.Labels \"com.docker.compose.project.working_dir\"}}" talaria-homepage-1 2>/dev/null || true
echo === images ===
docker images --format "{{.Repository}}:{{.Tag}}" | grep canary-20260729b | sort
echo === live shell ===
docker exec talaria-homepage-1 sh -c "grep -F __TALARIA_CHART_BUILD_ID /usr/share/nginx/html/chart/dist-v9/index.html | head -1" || true
'
