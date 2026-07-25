#!/usr/bin/env bash
# Stable, fail-closed TEST checkpoint shipper.
set -Eeuo pipefail

die() { printf 'ERROR: %s\n' "$*" >&2; exit 2; }
ROOT="${ROOT:-$(cd "$(dirname "$0")/.." && pwd -P)}"
STATE_ROOT="${TEST_CHECKPOINT_STATE_ROOT:-/var/lib/talaria/checkpoints}"
REGISTRY="${TEST_CHECKPOINT_REGISTRY:-localhost:5000/talaria}"
REMOTE="${TEST_CHECKPOINT_REMOTE:-origin}"
PUBLIC_ORIGIN="http://31.97.192.82:3000"
COMPOSE_PROJECT="talaria"
CHECKPOINT=""
BUILD_ID=""
ROLLBACK_BUILD_ID=""
SOURCE_TAG=""
CREATE_SOURCE_TAG=""
NO_BUILD=0
PLAN=0

usage() {
  cat <<'EOF'
Usage: scripts/ckpt-ship.sh --checkpoint=CKPT-N --build-id=YYYYMMDDbN [options]

  --rollback-build-id=ID  Use this prior accepted rollback build
  --source-tag=TAG        Use the unique pushed annotated source tag
  --create-source-tag=TAG Create and push an annotated tag for current HEAD
  --no-build              Reuse published images after authoritative digest lookup
  --plan                  Verify and print the full plan without mutation
  --state-root=DIR        Durable state outside this repository
EOF
}

for arg in "$@"; do
  case "$arg" in
    --checkpoint=*) CHECKPOINT="${arg#*=}" ;;
    --build-id=*) BUILD_ID="${arg#*=}" ;;
    --rollback-build-id=*) ROLLBACK_BUILD_ID="${arg#*=}" ;;
    --source-tag=*) SOURCE_TAG="${arg#*=}" ;;
    --create-source-tag=*) CREATE_SOURCE_TAG="${arg#*=}" ;;
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
if [[ -n "${SSH_CONNECTION:-}${SSH_CLIENT:-}${SSH_TTY:-}" && -z "${TMUX:-}" ]]; then
  die "refusing SSH operation outside tmux; attach tmux and rerun the same command"
fi

cd "$ROOT"
[[ -z "$(git status --porcelain --untracked-files=all)" ]] || die "repository is not clean"
HEAD_SHA="$(git rev-parse HEAD)"
UPSTREAM_SHA="$(git rev-parse '@{u}' 2>/dev/null)" || die "HEAD has no pushed upstream"
[[ "$HEAD_SHA" == "$UPSTREAM_SHA" ]] || die "HEAD is not pushed to its upstream"

if [[ -n "$CREATE_SOURCE_TAG" ]]; then
  [[ -z "$SOURCE_TAG" ]] || die "use only one of --source-tag and --create-source-tag"
  [[ "$CREATE_SOURCE_TAG" == *-"$BUILD_ID"-source ]] \
    || die "created source tag must end in -$BUILD_ID-source"
  if (( PLAN )); then
    die "--plan cannot create a source tag; create and push it first"
  fi
  if git show-ref --verify --quiet "refs/tags/$CREATE_SOURCE_TAG"; then
    [[ "$(git cat-file -t "refs/tags/$CREATE_SOURCE_TAG")" == tag ]] \
      || die "existing local source tag is not annotated: $CREATE_SOURCE_TAG"
    [[ "$(git rev-parse "refs/tags/$CREATE_SOURCE_TAG^{commit}")" == "$HEAD_SHA" ]] \
      || die "existing local source tag does not peel to pushed HEAD"
  else
    git tag -a "$CREATE_SOURCE_TAG" -m "TEST checkpoint $BUILD_ID source" "$HEAD_SHA"
  fi
  # Idempotent after an interrupted push: an identical remote tag is already up to date;
  # a conflicting immutable remote tag is rejected by git and then by the peel checks below.
  git push "$REMOTE" "refs/tags/$CREATE_SOURCE_TAG"
  SOURCE_TAG="$CREATE_SOURCE_TAG"
fi

if [[ -z "$SOURCE_TAG" ]]; then
  mapfile -t SOURCE_TAGS < <(
    git ls-remote --tags "$REMOTE" "refs/tags/*-$BUILD_ID-source^{}" |
      awk -F'/' '{sub(/\^\{\}$/, "", $NF); print $NF}'
  )
  [[ "${#SOURCE_TAGS[@]}" -eq 1 ]] \
    || die "expected one pushed annotated *-$BUILD_ID-source tag; found ${#SOURCE_TAGS[@]}"
  SOURCE_TAG="${SOURCE_TAGS[0]}"
fi
[[ "$SOURCE_TAG" == *-"$BUILD_ID"-source ]] || die "source tag does not match build ID"
mapfile -t TAG_LINES < <(
  git ls-remote --tags "$REMOTE" "refs/tags/$SOURCE_TAG" "refs/tags/$SOURCE_TAG^{}"
)
[[ "${#TAG_LINES[@]}" -eq 2 ]] || die "source tag must be pushed and annotated: $SOURCE_TAG"
TAG_OBJECT_SHA=""
PEELED_SHA=""
for line in "${TAG_LINES[@]}"; do
  sha="${line%%[[:space:]]*}"
  ref="${line#*[[:space:]]}"
  case "$ref" in
    "refs/tags/$SOURCE_TAG") TAG_OBJECT_SHA="$sha" ;;
    "refs/tags/$SOURCE_TAG^{}") PEELED_SHA="$sha" ;;
    *) die "source tag advertisement is malformed" ;;
  esac
done
[[ "$TAG_OBJECT_SHA" =~ ^[a-f0-9]{40}$ ]] || die "source tag object is missing"
[[ "$PEELED_SHA" =~ ^[a-f0-9]{40}$ ]] || die "source tag does not expose an annotated peel"
[[ "$TAG_OBJECT_SHA" != "$PEELED_SHA" ]] || die "source tag is lightweight, not annotated"
[[ "$PEELED_SHA" == "$HEAD_SHA" ]] || die "source tag does not peel to pushed HEAD"

if [[ -z "$ROLLBACK_BUILD_ID" ]]; then
  mapfile -t ACCEPTED < <(
    for manifest in "$STATE_ROOT"/*/*.provenance.json; do
      [[ -f "$manifest" ]] || continue
      id="$(basename "$(dirname "$manifest")")"
      [[ "$id" =~ ^[0-9]{8}b[0-9]+$ ]] || continue
      [[ "$(printf '%s\n%s\n' "$id" "$BUILD_ID" | sort -V | head -n1)" == "$id" ]] || continue
      [[ "$id" != "$BUILD_ID" ]] || continue
      node "$ROOT/scripts/checkpoint-provenance.mjs" validate-manifest \
        --manifest="$manifest" >/dev/null 2>&1 || continue
      printf '%s\n' "$id"
    done | sort -Vu
  )
  [[ "${#ACCEPTED[@]}" -gt 0 ]] || die "no prior accepted rollback manifest found"
  ROLLBACK_BUILD_ID="${ACCEPTED[${#ACCEPTED[@]}-1]}"
fi
[[ "$ROLLBACK_BUILD_ID" != "$BUILD_ID" ]] || die "rollback build must precede current build"
[[ "$(printf '%s\n%s\n' "$ROLLBACK_BUILD_ID" "$BUILD_ID" | sort -V | head -n1)" == "$ROLLBACK_BUILD_ID" ]] \
  || die "rollback build must precede current build"
mapfile -t ROLLBACK_MANIFESTS < <(
  for manifest in "$STATE_ROOT/$ROLLBACK_BUILD_ID"/*.provenance.json; do
    [[ -f "$manifest" ]] && printf '%s\n' "$manifest"
  done
)
[[ "${#ROLLBACK_MANIFESTS[@]}" -eq 1 ]] \
  || die "rollback build must contain exactly one accepted provenance manifest: $ROLLBACK_BUILD_ID"
ROLLBACK_MANIFEST="${ROLLBACK_MANIFESTS[0]}"
node "$ROOT/scripts/checkpoint-provenance.mjs" validate-manifest \
  --manifest="$ROLLBACK_MANIFEST" >/dev/null
ROLLBACK_MANIFEST_BUILD_ID="$(
  node - "$ROLLBACK_MANIFEST" <<'NODE'
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
process.stdout.write(manifest.buildId || '');
NODE
)"
[[ "$ROLLBACK_MANIFEST_BUILD_ID" == "$ROLLBACK_BUILD_ID" ]] \
  || die "rollback manifest build ID mismatch: requested $ROLLBACK_BUILD_ID, manifest has $ROLLBACK_MANIFEST_BUILD_ID"

RUN_DIR="$STATE_ROOT/$BUILD_ID"
LOG="$RUN_DIR/SHIP-LOG-$BUILD_ID.txt"
if (( ! PLAN )); then
  mkdir -p "$RUN_DIR"
  exec > >(tee -a "$LOG") 2>&1
fi
printf 'SHIP PARAMETERS\n  checkpoint: %s\n  build: %s\n  head: %s\n  source tag: %s\n  tag object: %s\n  rollback: %s\n  no-build: %s\n  plan: %s\n' \
  "$CHECKPOINT" "$BUILD_ID" "$HEAD_SHA" "$SOURCE_TAG" "$TAG_OBJECT_SHA" \
  "$ROLLBACK_BUILD_ID" "$NO_BUILD" "$PLAN"

MANIFEST="$RUN_DIR/$CHECKPOINT.provenance.json"
RUNTIME="$RUN_DIR/runtime.json"
if (( ! PLAN )) && [[ -f "$RUN_DIR/.complete" ]]; then
  for artifact in "$MANIFEST" "$RUNTIME"; do
    [[ -f "$artifact" && -f "$artifact.sha256" ]] || die "completed run lacks hashed artifact: $artifact"
    printf '%s  %s\n' "$(<"$artifact.sha256")" "$artifact" | sha256sum --check --status \
      || die "completed artifact hash mismatch: $artifact"
  done
  node "$ROOT/scripts/checkpoint-provenance.mjs" validate-manifest --manifest="$MANIFEST"
  node "$ROOT/scripts/checkpoint-provenance.mjs" preflight \
    --manifest="$MANIFEST" --repo-root="$RUN_DIR/source"
  printf 'SHIP COMPLETE (validated resume)\n'
else
  command=(
    bash "$ROOT/scripts/deploy-test-checkpoint.sh"
    "--source-tag=$SOURCE_TAG" "--build-id=$BUILD_ID" "--checkpoint=$CHECKPOINT"
    "--registry=$REGISTRY" "--rollback-manifest=$ROLLBACK_MANIFEST"
    "--rollback-build-id=$ROLLBACK_BUILD_ID"
    "--public-origin=$PUBLIC_ORIGIN" "--compose-project=$COMPOSE_PROJECT"
    "--state-root=$STATE_ROOT" "--remote=$REMOTE"
  )
  (( NO_BUILD )) && command+=(--no-build)
  (( PLAN )) && command+=(--dry-run)
  "${command[@]}"
fi

if (( ! PLAN )); then
  printf '\nSHIP COMPLETE\n  build-id: %s\n  manifest-sha256: %s\n  runtime-sha256: %s\n  log: %s\n' \
    "$BUILD_ID" "$(sha256sum "$MANIFEST" | awk '{print $1}')" \
    "$(sha256sum "$RUNTIME" | awk '{print $1}')" "$LOG"
fi
