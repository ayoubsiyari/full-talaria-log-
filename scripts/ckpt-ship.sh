#!/usr/bin/env bash
# Stable one-command TEST checkpoint shipper.
set -Eeuo pipefail

die() { printf 'ERROR: %s\n' "$*" >&2; exit 2; }
ROOT="${ROOT:-$(cd "$(dirname "$0")/.." && pwd -P)}"
STATE_ROOT="${TEST_CHECKPOINT_STATE_ROOT:-/var/lib/talaria/checkpoints}"
REGISTRY="${TEST_CHECKPOINT_REGISTRY:-localhost:5000/talaria}"
PUBLIC_ORIGIN="http://31.97.192.82:3000"
COMPOSE_PROJECT="talaria"
REMOTE="${TEST_CHECKPOINT_REMOTE:-origin}"
CHECKPOINT=""
BUILD_ID=""
ROLLBACK_BUILD_ID=""
SOURCE_TAG=""
NO_BUILD=0
PLAN=0

usage() {
  cat <<'EOF'
Usage: scripts/ckpt-ship.sh --checkpoint=CKPT-N --build-id=YYYYMMDDbN [options]

Options:
  --rollback-build-id=ID  Use ID's accepted manifest (default: latest accepted prior build)
  --no-build              Reuse already-published, digest-resolved images
  --plan                  Verify and print the complete plan without changing anything
  --source-tag=TAG        Override automatic unique *-<build-id>-source tag discovery
  --state-root=DIR        Durable state outside the repository
EOF
}

for arg in "$@"; do
  case "$arg" in
    --checkpoint=*) CHECKPOINT="${arg#*=}" ;;
    --build-id=*) BUILD_ID="${arg#*=}" ;;
    --rollback-build-id=*) ROLLBACK_BUILD_ID="${arg#*=}" ;;
    --source-tag=*) SOURCE_TAG="${arg#*=}" ;;
    --state-root=*) STATE_ROOT="${arg#*=}" ;;
    --no-build) NO_BUILD=1 ;;
    --plan) PLAN=1 ;;
    --provenance-guard-off|--force) die "$arg is prohibited in the stable ship command" ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument: $arg" ;;
  esac
done

[[ "$CHECKPOINT" =~ ^CKPT-[0-9]+$ ]] || die "invalid or missing --checkpoint"
[[ "$BUILD_ID" =~ ^[0-9]{8}b[0-9]+$ ]] || die "invalid or missing --build-id"
[[ "$STATE_ROOT" == /* ]] || die "--state-root must be absolute"
case "$STATE_ROOT/" in "$ROOT/"*) die "--state-root must be outside the repository" ;; esac

# Local shells are allowed. Remote operation must survive a dropped SSH session.
if [[ -n "${SSH_CONNECTION:-}${SSH_CLIENT:-}${SSH_TTY:-}" && -z "${TMUX:-}" ]]; then
  die "refusing SSH operation outside tmux; attach tmux and rerun the same command"
fi

cd "$ROOT"
[[ -z "$(git status --porcelain --untracked-files=all)" ]] || die "repository is not clean"
HEAD_SHA="$(git rev-parse HEAD)"
UPSTREAM_SHA="$(git rev-parse '@{u}' 2>/dev/null)" || die "HEAD has no pushed upstream"
[[ "$HEAD_SHA" == "$UPSTREAM_SHA" ]] || die "HEAD is not pushed to its upstream"

if [[ -z "$SOURCE_TAG" ]]; then
  mapfile -t SOURCE_TAGS < <(
    git ls-remote --tags "$REMOTE" "refs/tags/*-$BUILD_ID-source^{}" |
      awk -F'/' '{sub(/\^\{\}$/, "", $NF); print $NF}'
  )
  [[ "${#SOURCE_TAGS[@]}" -eq 1 ]] ||
    die "expected one pushed annotated *-$BUILD_ID-source tag; found ${#SOURCE_TAGS[@]}"
  SOURCE_TAG="${SOURCE_TAGS[0]}"
fi

if [[ -z "$ROLLBACK_BUILD_ID" ]]; then
  mapfile -t ACCEPTED < <(
    for manifest in "$STATE_ROOT"/*/*.provenance.json; do
      [[ -f "$manifest" ]] || continue
      id="$(basename "$(dirname "$manifest")")"
      [[ "$id" =~ ^[0-9]{8}b[0-9]+$ && "$id" != "$BUILD_ID" ]] && printf '%s\n' "$id"
    done | sort -V
  )
  [[ "${#ACCEPTED[@]}" -gt 0 ]] || die "no prior accepted rollback manifest found"
  ROLLBACK_BUILD_ID="${ACCEPTED[${#ACCEPTED[@]}-1]}"
fi
mapfile -t ROLLBACK_MANIFESTS < <(
  printf '%s\n' "$STATE_ROOT/$ROLLBACK_BUILD_ID"/*.provenance.json
)
[[ "${#ROLLBACK_MANIFESTS[@]}" -eq 1 && -f "${ROLLBACK_MANIFESTS[0]}" ]] ||
  die "rollback build must contain exactly one accepted provenance manifest: $ROLLBACK_BUILD_ID"
ROLLBACK_MANIFEST="${ROLLBACK_MANIFESTS[0]}"

RUN_DIR="$STATE_ROOT/$BUILD_ID"
LOG="$RUN_DIR/SHIP-LOG-$BUILD_ID.txt"
if (( ! PLAN )); then
  mkdir -p "$RUN_DIR"
  exec > >(tee -a "$LOG") 2>&1
fi

printf 'SHIP PARAMETERS\n  checkpoint: %s\n  build: %s\n  source tag: %s\n  rollback: %s\n  no-build: %s\n' \
  "$CHECKPOINT" "$BUILD_ID" "$SOURCE_TAG" "$ROLLBACK_BUILD_ID" "$NO_BUILD"

command=(
  bash "$ROOT/scripts/deploy-test-checkpoint.sh"
  "--source-tag=$SOURCE_TAG" "--build-id=$BUILD_ID" "--checkpoint=$CHECKPOINT"
  "--registry=$REGISTRY" "--rollback-manifest=$ROLLBACK_MANIFEST"
  "--public-origin=$PUBLIC_ORIGIN" "--compose-project=$COMPOSE_PROJECT"
  "--state-root=$STATE_ROOT" "--remote=$REMOTE"
)
(( NO_BUILD )) && command+=(--no-build)
(( PLAN )) && command+=(--dry-run)
"${command[@]}"

if (( ! PLAN )); then
  manifest="$RUN_DIR/$CHECKPOINT.provenance.json"
  runtime="$RUN_DIR/runtime.json"
  printf '\nSHIP COMPLETE\n  build-id: %s\n  manifest-sha256: %s\n  runtime-sha256: %s\n  log: %s\n' \
    "$BUILD_ID" "$(sha256sum "$manifest" | awk '{print $1}')" \
    "$(sha256sum "$runtime" | awk '{print $1}')" "$LOG"
fi
