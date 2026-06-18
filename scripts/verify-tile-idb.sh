#!/usr/bin/env bash
# Phase 3 — IndexedDB tile cache verification (browser + optional server checks).
#
# Usage:
#   ./scripts/verify-tile-idb.sh
#
# Most checks are manual in DevTools (IndexedDB is browser-only).
# This script prints the checklist and confirms chart.js contains TileIdbCache.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${CYAN}======== Phase 3 — IndexedDB tile cache ========${NC}"
echo ""

CHART_SRC="$ROOT/chart v 1.4/chart/chart.js"
CHART_PUB="$ROOT/homepage/public/chart/chart.js"

if grep -q 'class TileIdbCache' "$CHART_SRC" 2>/dev/null; then
  echo -e "${GREEN}OK${NC}  TileIdbCache present in chart v 1.4/chart/chart.js"
else
  echo "FAIL  TileIdbCache missing from $CHART_SRC"
  exit 1
fi

if [ -f "$CHART_PUB" ] && grep -q 'class TileIdbCache' "$CHART_PUB" 2>/dev/null; then
  echo -e "${GREEN}OK${NC}  TileIdbCache present in homepage/public/chart/chart.js"
elif [ -f "$CHART_PUB" ]; then
  echo "WARN  homepage/public/chart/chart.js not synced — run: npm run build:chart-v9"
else
  echo "WARN  homepage/public/chart/chart.js not found"
fi

echo ""
echo "Browser verification (do this after deploy + hard refresh):"
echo ""
cat <<'EOF'
  1. Open chart → pick a pair (first load — Network may show /tile/ requests)
  2. Hard refresh (Ctrl+Shift+R) → open same pair again
  3. Console should show: [tile-idb] hit {fileId}/{tf}/{idx}
  4. Network tab: few or zero /api/file/.../tile/... requests on 2nd load
  5. DevTools → Application → IndexedDB → talaria-tiles-v1 → tiles store has keys

  Enable:
    localStorage.setItem('talaria_tile_idb', '1'); location.reload();

  Default: off (no localStorage key needed)

  Clear cache:
    indexedDB.deleteDatabase('talaria-tiles-v1');
EOF

echo ""
echo "Deploy chart engine to production:"
echo "  npm run build:chart-v9"
echo "  docker compose build homepage && docker compose up -d homepage"
echo ""
echo -e "${GREEN}Done${NC} — see docs/client-heavy-scaling-roadmap.md Phase 3"
