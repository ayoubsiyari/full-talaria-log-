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
TOOL_ROOT="${TOOL_ROOT:-$ROOT}"
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
if [ "$DIRECT_ORIGIN" != "auto" ] && [[ "$DIRECT_ORIGIN" != http://* ]] \
  && [[ "$DIRECT_ORIGIN" != https://* ]]; then
  echo "ERROR: DIRECT_ORIGIN must be auto or an HTTP(S) origin." >&2
  exit 2
fi

RUNTIME_PROBE="$TOOL_ROOT/scripts/checkpoint-runtime-probe.mjs"
if [ ! -f "$RUNTIME_PROBE" ]; then
  echo "ERROR: runtime probe is missing; stop before deployment." >&2
  exit 2
fi

echo "=== M1 module-contract + shell-inventory preflights (deploy path) ==="
node "$TOOL_ROOT/scripts/module-contract-preflight.mjs"
# Same ratchet as .github/workflows/shell-inventory-preflight.yml: exit 0 GREEN,
# exit 2 budgeted ALLOWED-RED, exit 1 unexpected RED (hard fail).
set +e
node "$TOOL_ROOT/scripts/shell-inventory-preflight.mjs" \
  --allow-kinds=conditional-exposure:2,exclusion-count-undeclared:1,proof-of-derouting-unsatisfied:38,shell-parse-incomplete:12
SHELL_INV_STATUS=$?
set -e
case "$SHELL_INV_STATUS" in
  0|2) ;;
  *)
    echo "ERROR: shell-inventory-preflight unexpected RED (exit=$SHELL_INV_STATUS)." >&2
    exit 1
    ;;
esac

echo "=== cache-stamp coherence (content hash vs ?v= + cross-shell) ==="
node "$TOOL_ROOT/scripts/cache-stamp-coherence-gate.mjs"

echo "=== immutable checkpoint preflight ==="
node "$TOOL_ROOT/scripts/checkpoint-provenance.mjs" preflight \
  --manifest="$MANIFEST" \
  --repo-root="$ROOT"

mapfile -t PROVENANCE_FIELDS < <(
  node "$TOOL_ROOT/scripts/checkpoint-provenance.mjs" fields --manifest="$MANIFEST"
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
node "$TOOL_ROOT/scripts/checkpoint-image-preflight.mjs" --manifest="$MANIFEST"

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
if [ "$DIRECT_ORIGIN" = "auto" ]; then
  homepage_ip="$(
    docker inspect --format \
      '{{range .NetworkSettings.Networks}}{{println .IPAddress}}{{end}}' \
      "$homepage_container_id" | awk 'NF { print; exit }'
  )"
  if [ -z "$homepage_ip" ]; then
    echo "ERROR: could not resolve recreated homepage container direct origin." >&2
    exit 1
  fi
  DIRECT_ORIGIN="http://$homepage_ip"
  echo "Refreshed direct origin: $DIRECT_ORIGIN"
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
