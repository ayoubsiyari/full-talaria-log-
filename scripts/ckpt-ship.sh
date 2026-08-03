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

# TAG FIRST, BUILD FROM THE TAG, PASSPORT NAMES THE TAG'S COMMIT.
#
# What gets built is the *-<build-id>-source tag, which deploy-test-checkpoint.sh
# fetches into a worktree of its own. The operator's current branch never enters
# the image. The precondition here used to be `git rev-parse @{u}`, which asserted
# nothing whatsoever about the artifact while being able to refuse the ship
# outright — and worse, a tag build runs on a DETACHED HEAD, which by definition
# has no upstream, so the guard refused this script's own documented mode.
#
# On 2026-08-03 it did exactly that. The operator built from the tip by hand
# instead, and 20260803b126 ended up carrying a tag cut AFTER the image rather
# than one that produced it. A guard that fails closed into a hand-build
# manufactures the provenance hole it exists to prevent, so the precondition is
# now about the thing that is actually built.
remote_tag_commit() { # -> commit the remote's ANNOTATED tag peels to, or empty
  git ls-remote --tags "$REMOTE" "refs/tags/$1^{}" | awk 'NR==1{print $1}'
}

if [[ -z "$SOURCE_TAG" ]]; then
  mapfile -t SOURCE_TAGS < <(
    git ls-remote --tags "$REMOTE" "refs/tags/*-$BUILD_ID-source^{}" |
      awk -F'/' '{sub(/\^\{\}$/, "", $NF); print $NF}'
  )
  [[ "${#SOURCE_TAGS[@]}" -eq 1 ]] || die \
"expected exactly one pushed annotated *-$BUILD_ID-source tag; found ${#SOURCE_TAGS[@]}.
       Tag first, then ship:
         git tag -a <name>-$BUILD_ID-source -m 'Source tag for build $BUILD_ID'
         git push $REMOTE <name>-$BUILD_ID-source
       DO NOT build from the tip by hand instead. That is precisely how b126 came
       to be described by its tag rather than produced by it, and the seal build
       may not repeat it."
  SOURCE_TAG="${SOURCE_TAGS[0]}"
fi

# An explicitly supplied --source-tag used to be taken on trust and handed
# straight to the builder. Verify it the same way discovery does: present on the
# remote, annotated (only annotated tags produce a ^{} peel line), and named for
# this build, so --source-tag cannot become the quiet way around the rule above.
SOURCE_TAG_SHA="$(remote_tag_commit "$SOURCE_TAG")"
[[ -n "$SOURCE_TAG_SHA" ]] || die \
"source tag '$SOURCE_TAG' is not a pushed annotated tag on $REMOTE.
       Push it before shipping: git push $REMOTE $SOURCE_TAG
       A tag that exists only locally cannot be fetched by the builder, and a
       lightweight tag carries no tagger or date to audit."
[[ "$SOURCE_TAG" == *"-$BUILD_ID-source" ]] || die \
"source tag '$SOURCE_TAG' does not name build $BUILD_ID (expected *-$BUILD_ID-source)"

# The branch upstream is no longer a precondition, because it does not describe
# what is built. It is still worth keeping HEAD recoverable by others: repair it
# when that is free, and otherwise say plainly that it is not a blocker so nobody
# reads this as a reason to go around the script.
if git symbolic-ref -q HEAD >/dev/null 2>&1; then
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  if ! git rev-parse '@{u}' >/dev/null 2>&1; then
    REMOTE_BRANCH_SHA="$(git rev-parse -q --verify "refs/remotes/$REMOTE/$BRANCH" 2>/dev/null || true)"
    if [[ -n "$REMOTE_BRANCH_SHA" && "$REMOTE_BRANCH_SHA" == "$HEAD_SHA" ]]; then
      git branch --set-upstream-to="$REMOTE/$BRANCH" "$BRANCH" >/dev/null
      printf 'NOTE: set missing upstream to %s/%s (already at the same commit).\n' "$REMOTE" "$BRANCH"
    else
      printf 'NOTE: branch %s has no upstream. Not a blocker — the build takes tag %s.\n' \
        "$BRANCH" "$SOURCE_TAG"
    fi
  fi
else
  printf 'NOTE: detached HEAD at %s — expected for a tag build.\n' "${HEAD_SHA:0:9}"
fi

if [[ "$HEAD_SHA" != "$SOURCE_TAG_SHA" ]]; then
  printf 'NOTE: HEAD (%s) is not the tag being built (%s -> %s). The TAG is what ships.\n' \
    "${HEAD_SHA:0:9}" "$SOURCE_TAG" "${SOURCE_TAG_SHA:0:9}"
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
