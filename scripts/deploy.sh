#!/usr/bin/env bash
# Immutable chart/homepage checkpoint deploy.
#
# This command never builds on the VPS and never resolves :latest. The operator
# must first check out the exact source SHA named by an accepted manifest.
#
# Usage:
#   ./scripts/deploy.sh --manifest=/secure/path/CKPT-N.provenance.json
#
# Rollback uses this same command with the previous accepted manifest.
set -euo pipefail

ROOT="${ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"

MANIFEST=""
for arg in "$@"; do
  case "$arg" in
    --manifest=*) MANIFEST="${arg#--manifest=}" ;;
    --provenance-guard-off)
      echo "ERROR: --provenance-guard-off is test-harness-only." >&2
      exit 2
      ;;
    -h|--help)
      echo "Usage: $0 --manifest=/secure/path/CKPT-N.provenance.json"
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

if [ -z "$MANIFEST" ]; then
  echo "ERROR: --manifest is required; latest/tag-only deployment is prohibited." >&2
  exit 2
fi
if [ -z "${DIRECT_ORIGIN:-}" ] || [ -z "${PUBLIC_ORIGIN:-}" ]; then
  echo "ERROR: DIRECT_ORIGIN and PUBLIC_ORIGIN are required for post-deploy parity." >&2
  exit 2
fi

RUNTIME_PROBE="$ROOT/scripts/checkpoint-runtime-probe.mjs"
PUPPETEER_DIR="$ROOT/chart v 1.4/chart/multichart-prod/harness/node_modules/puppeteer"
if [ ! -f "$RUNTIME_PROBE" ] || [ ! -d "$PUPPETEER_DIR" ]; then
  echo "ERROR: runtime probe/Puppeteer prerequisite is missing; stop before deployment." >&2
  exit 2
fi

echo "=== immutable checkpoint preflight ==="
node "$ROOT/scripts/checkpoint-provenance.mjs" preflight \
  --manifest="$MANIFEST" \
  --repo-root="$ROOT"

mapfile -t PROVENANCE_FIELDS < <(
  node "$ROOT/scripts/checkpoint-provenance.mjs" fields --manifest="$MANIFEST"
)
if [ "${#PROVENANCE_FIELDS[@]}" -ne 6 ]; then
  echo "ERROR: provenance field extraction failed." >&2
  exit 2
fi

SOURCE_COMMIT_SHA="${PROVENANCE_FIELDS[0]}"
CHART_BUILD_ID="${PROVENANCE_FIELDS[1]}"
export TRADING_CHART_IMAGE="${PROVENANCE_FIELDS[2]}"
export HOMEPAGE_IMAGE="${PROVENANCE_FIELDS[3]}"
EXPECTED_CHART_DIGEST="${PROVENANCE_FIELDS[4]}"
EXPECTED_HOMEPAGE_DIGEST="${PROVENANCE_FIELDS[5]}"

case "$TRADING_CHART_IMAGE|$HOMEPAGE_IMAGE" in
  *:latest*|*:latest@*)
    echo "ERROR: invalid immutable image references." >&2
    exit 2
    ;;
esac
if [[ "$TRADING_CHART_IMAGE" != *@sha256:* ]] || [[ "$HOMEPAGE_IMAGE" != *@sha256:* ]]; then
  echo "ERROR: both images must be digest-pinned." >&2
  exit 2
fi

echo "=== pull exact candidate image digests (NO BUILD) ==="
docker compose pull trading-chart trading-chart-worker homepage

echo "=== disposable image uniformity preflight ==="
node "$ROOT/scripts/checkpoint-image-preflight.mjs" --manifest="$MANIFEST"

echo "=== recreate exact checkpoint services (NO BUILD) ==="
docker compose up -d --no-build --no-deps trading-chart trading-chart-worker homepage

EXPECTED_CHART_IMAGE_ID="$(docker image inspect --format '{{.Id}}' "$TRADING_CHART_IMAGE")"
EXPECTED_HOMEPAGE_IMAGE_ID="$(docker image inspect --format '{{.Id}}' "$HOMEPAGE_IMAGE")"
for service in trading-chart trading-chart-worker; do
  container_id="$(docker compose ps -q "$service")"
  actual_image_id="$(docker inspect --format '{{.Image}}' "$container_id")"
  if [ "$actual_image_id" != "$EXPECTED_CHART_IMAGE_ID" ]; then
    echo "ERROR: $service is not running expected digest $EXPECTED_CHART_DIGEST." >&2
    exit 1
  fi
done
homepage_container_id="$(docker compose ps -q homepage)"
homepage_image_id="$(docker inspect --format '{{.Image}}' "$homepage_container_id")"
if [ "$homepage_image_id" != "$EXPECTED_HOMEPAGE_IMAGE_ID" ]; then
  echo "ERROR: homepage is not running expected digest $EXPECTED_HOMEPAGE_DIGEST." >&2
  exit 1
fi

RUNTIME_REPORT="${CHECKPOINT_RUNTIME_REPORT:-$ROOT/backups/checkpoint-runtime-${CHART_BUILD_ID}.json}"
mkdir -p "$(dirname "$RUNTIME_REPORT")"
echo "=== direct/public host + iframe + engine parity ==="
node "$RUNTIME_PROBE" \
  --manifest="$MANIFEST" \
  --direct="$DIRECT_ORIGIN" \
  --public="$PUBLIC_ORIGIN" \
  --output="$RUNTIME_REPORT"

echo "Checkpoint ${CHART_BUILD_ID} deployed from ${SOURCE_COMMIT_SHA}."
echo "Runtime proof: $RUNTIME_REPORT"
