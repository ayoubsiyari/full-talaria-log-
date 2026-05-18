#!/usr/bin/env bash
# FirstRate / binary pipeline diagnostics on the VPS (run from repo root, e.g. /opt/talaria).
set -euo pipefail

ROOT="${1:-.}"
cd "$ROOT"

echo "=== containers ==="
docker compose ps trading-chart trading-chart-worker 2>/dev/null || docker-compose ps trading-chart trading-chart-worker

echo ""
echo "=== trading-chart (API) — last 40 lines ==="
docker compose logs trading-chart --tail 40 2>/dev/null || docker-compose logs trading-chart --tail 40

echo ""
echo "=== trading-chart-worker — last 40 lines ==="
docker compose logs trading-chart-worker --tail 40 2>/dev/null || docker-compose logs trading-chart-worker --tail 40

echo ""
echo "=== firstrate job files (newest 5) ==="
docker compose exec -T trading-chart sh -c 'ls -lt /app/uploads/firstrate_jobs/*.json 2>/dev/null | head -5' || true

echo ""
echo "=== active import job snippet ==="
docker compose exec -T trading-chart sh -c '
  for f in /app/uploads/firstrate_jobs/*.json; do
    grep -l "\"running\"" "$f" 2>/dev/null && head -c 800 "$f" && echo
  done
' 2>/dev/null | head -20 || true

echo ""
echo "=== BINARY_BUILD_MODE / APP_ROLE ==="
docker compose exec -T trading-chart printenv APP_ROLE BINARY_BUILD_MODE 2>/dev/null || true
docker compose exec -T trading-chart-worker printenv APP_ROLE BINARY_BUILD_MODE 2>/dev/null || true

echo ""
echo "Tip: open Admin → Dataset Management → Sync health → VPS pipeline (build tag admin 2026-05-18e)"
echo "Or call GET /api/admin/datasets/pipeline-diagnostics (admin session cookie)."
