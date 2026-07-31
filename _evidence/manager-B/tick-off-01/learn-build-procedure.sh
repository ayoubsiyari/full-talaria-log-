#!/usr/bin/env bash
# b117 must be built the same way b116 was, or the comparison between them is not a comparison.
set -uo pipefail
cd /opt/talaria
echo "=== where does the build id live? ==="
grep -rn "20260730b116" --include=*.html --include=*.js --include=*.mjs --include=*.sh --include=*.yml \
  . 2>/dev/null | grep -v node_modules | head -12
echo
echo "=== deploy.sh build-id handling ==="
grep -n "BUILD_ID\|CHART_BUILD\|canary-" scripts/deploy.sh 2>/dev/null | head -25
echo
echo "=== the cache bump script ==="
sed -n '1,45p' "chart v 1.4/talaria-design/scripts/bump-dist-v9-cache.mjs" 2>/dev/null
echo
echo "=== my prior ship scripts anywhere on host ==="
find /root -maxdepth 3 -name "*ship*" -o -maxdepth 3 -name "*b116*" 2>/dev/null | head -15
echo
echo "=== compose build config for the two services ==="
grep -n -A6 "^  trading-chart:\|^  homepage:" docker-compose.yml | head -40
