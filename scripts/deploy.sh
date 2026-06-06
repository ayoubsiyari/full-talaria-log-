#!/usr/bin/env bash
# Pull-based deploy for the VPS (run from repo root, e.g. /opt/talaria).
#
# Replaces `git pull && docker compose up -d --build`, which compiled the V9 React
# bundle + Terser legacy bundle ON the production host (~15–20 min of CPU per deploy).
# Images are now built in CI (.github/workflows/build-images.yml) and pushed to GHCR;
# here we just pull the prebuilt images and recreate containers.
#
# Usage:
#   ./scripts/deploy.sh            # deploy :latest
#   IMAGE_TAG=<git-sha> ./scripts/deploy.sh   # pin to a specific CI build
set -euo pipefail

ROOT="${ROOT:-.}"
cd "$ROOT"

# Point compose at the CI-published registry images (overrides the local-build defaults
# in docker-compose.yml). Override REGISTRY/IMAGE_TAG to pin a specific build.
REGISTRY="${REGISTRY:-ghcr.io/ayoubsiyari}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
export TRADING_CHART_IMAGE="${TRADING_CHART_IMAGE:-${REGISTRY}/talaria-trading-chart:${IMAGE_TAG}}"
export HOMEPAGE_IMAGE="${HOMEPAGE_IMAGE:-${REGISTRY}/talaria-homepage:${IMAGE_TAG}}"
export JOURNAL_BACKEND_IMAGE="${JOURNAL_BACKEND_IMAGE:-${REGISTRY}/talaria-journal-backend:${IMAGE_TAG}}"

echo "=== git pull (config only; no host build) ==="
git pull --ff-only

echo ""
echo "=== docker compose pull (prebuilt images from registry) ==="
echo "    trading-chart: $TRADING_CHART_IMAGE"
docker compose pull questdb db redis trading-chart trading-chart-worker homepage journal-backend

echo ""
echo "=== docker compose up -d (recreate; NO --build) ==="
docker compose up -d --no-build

echo ""
echo "=== docker stats snapshot ==="
docker stats --no-stream
