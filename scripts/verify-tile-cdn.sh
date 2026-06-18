#!/usr/bin/env bash
# Phase 2 — measure tile CDN impact (run on VPS from repo root).
#
# Usage:
#   chmod +x scripts/verify-tile-cdn.sh
#   ./scripts/verify-tile-cdn.sh
#   FILE_ID=29 TF=1m TILE_IDX=0 CONCURRENCY=20 ./scripts/verify-tile-cdn.sh
#
# Before CDN:  TILE_CDN_REDIRECT=false (or unset) — tiles served from EC2/nginx
# After CDN:   TILE_CDN_REDIRECT=true + TILE_CDN_BASE_URL=https://xxx.cloudfront.net
#              + tiles synced to S3 (scripts/sync-tiles-to-s3.py)
#
# You should see:
#   - API returns 307 → CloudFront when CDN enabled
#   - Repeat fetches: x-cache Hit on CloudFront, lower p50 latency under load
#   - docker stats: trading-chart CPU lower during concurrent tile storm

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BASE_URL="${BASE_URL:-http://localhost}"
FILE_ID="${FILE_ID:-}"
TF="${TF:-1m}"
TILE_IDX="${TILE_IDX:-0}"
CONCURRENCY="${CONCURRENCY:-15}"
REQUESTS="${REQUESTS:-30}"
CDN_URL="${TILE_CDN_BASE_URL:-}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

section() { echo ""; echo -e "${CYAN}======== $* ========${NC}"; }
ok() { echo -e "${GREEN}OK${NC}  $*"; }
warn() { echo -e "${YELLOW}WARN${NC} $*"; }

if [ -z "$FILE_ID" ]; then
  FILE_ID="$(docker compose exec -T db psql -U talaria -d talaria -t -A -c \
    "SELECT id FROM csv_files ORDER BY id LIMIT 1;" 2>/dev/null | tr -d '[:space:]' || true)"
fi
if [ -z "$FILE_ID" ]; then
  echo "Set FILE_ID= (no csv_files row found)" >&2
  exit 1
fi

TILE_PATH="/api/file/${FILE_ID}/tile/${TF}/${TILE_IDX}"
FULL_URL="${BASE_URL%/}${TILE_PATH}"

section "Config"
echo "BASE_URL=$BASE_URL"
echo "TILE=$TILE_PATH"
echo "CONCURRENCY=$CONCURRENCY REQUESTS=$REQUESTS"

section "Env (trading-chart)"
docker compose exec -T trading-chart env 2>/dev/null | grep -E '^TILE_CDN_' || warn "TILE_CDN_* not set"

section "1) Single tile — API path (may 307 to CDN)"
HDR="$(mktemp)"
BODY="$(mktemp)"
trap 'rm -f "$HDR" "$BODY"' EXIT

curl -sS -o "$BODY" -D "$HDR" -w "time_total=%{time_total}s http_code=%{http_code}\n" \
  "$FULL_URL" || true
head -15 "$HDR" | sed 's/^/  /'
BYTES="$(wc -c < "$BODY" | tr -d ' ')"
echo "  body_bytes=$BYTES"
if grep -qi '^location:.*cloudfront\|amazonaws' "$HDR" 2>/dev/null; then
  ok "Redirect to CDN active (307 Location header)"
elif grep -qi '^HTTP/.* 200' "$HDR"; then
  warn "Direct 200 from API/nginx (TILE_CDN_REDIRECT=false or CDN not configured)"
fi

section "2) Single tile — follow redirects (end-to-end)"
if [ -n "$CDN_URL" ]; then
  echo "CDN direct: ${CDN_URL%/}${TILE_PATH}"
  curl -sS -o /dev/null -D - "${CDN_URL%/}${TILE_PATH}" 2>/dev/null | head -12 | sed 's/^/  /' || warn "CDN direct fetch failed — sync tiles first"
fi
curl -sS -L -o /dev/null -D - "$FULL_URL" 2>/dev/null | grep -iE '^(HTTP/|x-cache|x-cache-status|age:|via:)' | sed 's/^/  /' || true
curl -sS -L -o /dev/null -w "  follow_redirect time_total=%{time_total}s http_code=%{http_code}\n" "$FULL_URL"

section "3) Concurrent tile storm ($REQUESTS requests, $CONCURRENCY parallel)"
echo "  (Watch trading-chart CPU in another terminal: docker stats --no-stream)"
BEFORE_CPU="$(docker stats --no-stream --format '{{.Name}} {{.CPUPerc}}' 2>/dev/null | grep trading-chart || true)"
echo "  CPU before: ${BEFORE_CPU:-n/a}"

TMP_TIMES="$(mktemp)"
seq "$REQUESTS" | xargs -P "$CONCURRENCY" -I{} curl -sS -L -o /dev/null -w "%{time_total}\n" "$FULL_URL" 2>/dev/null \
  > "$TMP_TIMES" || true

if [ -s "$TMP_TIMES" ]; then
  python3 - "$TMP_TIMES" <<'PY'
import sys
from pathlib import Path
vals = [float(x) for x in Path(sys.argv[1]).read_text().split() if x.strip()]
if not vals:
    sys.exit(0)
vals.sort()
n = len(vals)
p50 = vals[int(0.5 * (n - 1))]
p95 = vals[int(0.95 * (n - 1))]
print(f"  samples={n} min={vals[0]:.3f}s p50={p50:.3f}s p95={p95:.3f}s max={vals[-1]:.3f}s")
PY
fi
rm -f "$TMP_TIMES"

AFTER_CPU="$(docker stats --no-stream --format '{{.Name}} {{.CPUPerc}}' 2>/dev/null | grep trading-chart || true)"
echo "  CPU after:  ${AFTER_CPU:-n/a}"

section "4) What you should see (before vs after CDN)"
cat <<'EOF'
  BEFORE (TILE_CDN_REDIRECT=false):
    - HTTP 200 from nginx/trading-chart
    - X-Cache-Status: MISS then HIT on nginx (same server)
    - Under load: trading-chart CPU rises (disk + gunicorn)

  AFTER (sync S3 + CloudFront + TILE_CDN_REDIRECT=true):
    - HTTP 307 from API → Location: cloudfront.net/...
    - CloudFront x-cache: Miss on first fetch, Hit on repeats
    - Under load: trading-chart CPU stays lower; bytes served from edge

  Chart pan still uses /candles and /smart on API — CDN mainly helps raw /tile/* paths
  and reduces EC2 bandwidth. Run this script twice and compare p50/p95 + CPU.
EOF

section "Done"
ok "FILE_ID=$FILE_ID — re-run after enabling CDN and compare section 3 numbers"
