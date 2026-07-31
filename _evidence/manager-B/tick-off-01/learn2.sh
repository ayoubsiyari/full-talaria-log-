#!/usr/bin/env bash
set -uo pipefail
cd /opt/talaria
echo "=== what build id does the CONTEXT carry right now? ==="
for f in "chart v 1.4/chart/dist-v9/index.html" "homepage/public/chart/dist-v9/index.html"; do
  printf '  %-46s ' "$(basename "$(dirname "$f")")/$(basename "$f")"
  grep -oE "__TALARIA_CHART_BUILD_ID='[^']+'" "$f" 2>/dev/null | head -1 || echo "(no stamp)"
done
echo
echo "=== what build id does the RUNNING IMAGE carry? ==="
docker exec talaria-homepage-1 sh -c "grep -oE \"__TALARIA_CHART_BUILD_ID='[^']+'\" /usr/share/nginx/html/chart/dist-v9/index.html 2>/dev/null | head -1" 2>&1
echo
echo "=== deploy.sh interface (first 100 lines) ==="
sed -n '1,100p' scripts/deploy.sh
