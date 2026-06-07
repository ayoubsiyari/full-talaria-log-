#!/usr/bin/env bash
# Export Postgres + chart uploads from the VPS for local Docker restore.
# Run ON THE VPS from repo root (e.g. /opt/talaria):
#   chmod +x scripts/vps-export-data.sh
#   ./scripts/vps-export-data.sh
#   ./scripts/vps-export-data.sh /tmp/talaria-export-20260606
#
# Then copy to your laptop (from your machine):
#   scp -r user@YOUR_VPS:/tmp/talaria-export-YYYYMMDD ./
#   # or single tarball if OUT_DIR was packed:
#   scp user@YOUR_VPS:/tmp/talaria-export-YYYYMMDD.tar.gz ./

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OUT_DIR="${1:-/tmp/talaria-export-$(date +%Y%m%d)}"
mkdir -p "$OUT_DIR"

POSTGRES_USER="${POSTGRES_USER:-talaria}"
POSTGRES_DB="${POSTGRES_DB:-talaria}"

echo "==> Postgres dump → $OUT_DIR/postgres.sql.gz"
docker compose exec -T db pg_dump -U "$POSTGRES_USER" --no-owner --no-acl "$POSTGRES_DB" | gzip -9 > "$OUT_DIR/postgres.sql.gz"

echo "==> Chart uploads tarball → $OUT_DIR/chart-uploads.tar.gz"
docker compose exec -T trading-chart tar czf - -C /app uploads > "$OUT_DIR/chart-uploads.tar.gz"

echo "==> Manifest"
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT COUNT(*) AS users FROM users; SELECT COUNT(*) AS csv_files FROM csv_files;" \
  > "$OUT_DIR/manifest.txt" 2>&1 || true

docker compose exec -T trading-chart du -sh /app/uploads >> "$OUT_DIR/manifest.txt" 2>&1 || true

(
  cd "$(dirname "$OUT_DIR")"
  tar czf "$(basename "$OUT_DIR").tar.gz" "$(basename "$OUT_DIR")"
)
echo "==> Packed $(dirname "$OUT_DIR")/$(basename "$OUT_DIR").tar.gz"
echo "Download that file to your laptop, then run scripts/import-vps-data-local.ps1"
