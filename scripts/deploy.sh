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

echo "=== git pull (config only; no host build) ==="
git pull --ff-only

echo ""
echo "=== docker compose pull (prebuilt images from registry) ==="
docker compose pull questdb db redis trading-chart trading-chart-worker homepage journal-backend

echo ""
echo "=== docker compose up -d (recreate; NO --build) ==="
docker compose up -d --no-build

echo ""
echo "=== docker stats snapshot ==="
docker stats --no-stream
