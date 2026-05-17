#!/usr/bin/env bash
# Clean unused chart upload junk on VPS (orphans, quarantine, stale import temps).
# Does NOT remove registered datasets (csv_files / bin / tiles / archive).
#
#   cd /opt/talaria
#   chmod +x scripts/vps-cleanup-unused-uploads.sh
#   ./scripts/vps-cleanup-unused-uploads.sh           # dry-run
#   ./scripts/vps-cleanup-unused-uploads.sh --apply   # delete

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
APPLY=()
if [[ "${1:-}" == "--apply" ]]; then
  APPLY=(--apply)
fi
docker compose exec -T trading-chart python - "${APPLY[@]}" < scripts/vps-cleanup-unused-uploads.py
