#!/usr/bin/env bash
# Build and deploy one immutable TEST checkpoint from a pushed source tag.
set -Eeuo pipefail

die() { printf 'ERROR: %s\n' "$*" >&2; exit 2; }
say() { printf '\n=== %s ===\n' "$*"; }
need() { command -v "$1" >/dev/null 2>&1 || die "required command is missing: $1"; }

ORCHESTRATOR_ROOT="${ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

resolve_remote_tag_commit() {
  local remote_url="$1"
  local remote_ref="$2"
  git ls-remote "$remote_url" "$remote_ref" "${remote_ref}^{}" \
    | node --input-type=module -e '
        import fs from "node:fs";
        import { resolveAdvertisedTagCommit } from "./scripts/lib/checkpoint-provenance.mjs";
        const remoteRef = process.argv[1];
        const result = resolveAdvertisedTagCommit(fs.readFileSync(0, "utf8"), remoteRef);
        process.stdout.write(`${result.commitSha}\n`);
      ' "$remote_ref"
}

SOURCE_TAG=""
BUILD_ID=""
CHECKPOINT=""
REGISTRY="${TEST_CHECKPOINT_REGISTRY:-}"
PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-}"
DIRECT_ORIGIN="${DIRECT_ORIGIN:-auto}"
ROLLBACK_MANIFEST=""
REMOTE="${TEST_CHECKPOINT_REMOTE:-origin}"
STATE_ROOT="${TEST_CHECKPOINT_STATE_ROOT:-$ORCHESTRATOR_ROOT/.checkpoint-test}"
COMPOSE_PROJECT_NAME=""
DRY_RUN=0
KEEP_WORKTREE=0
DEPLOY_EXISTING=""

usage() {
  cat <<'EOF'
Usage:
  scripts/deploy-test-checkpoint.sh --source-tag=<tag> --build-id=YYYYMMDDbN \
    --checkpoint=CKPT-N --registry=<registry/namespace> \
    --rollback-manifest=<accepted.json> --public-origin=https://test.example \
    --compose-project=<explicit-test-project>

Options:
  --direct-origin=<origin|auto>  Re-resolve the recreated homepage container (default: auto)
  --compose-project=<name>       Required TEST Compose project name; must contain "test"
  --remote=<git-remote>          Remote containing the immutable source tag (default: origin)
  --state-root=<directory>       Durable manifests, proofs, logs, and source worktrees
  --dry-run                      Verify inputs and print the exact plan; change nothing
  --keep-worktree                Keep the clean detached source worktree after success
  --deploy-existing=<manifest>   Deploy/rollback an already accepted pinned manifest

The registry may be a remote registry or a TEST-local registry such as
localhost:5000/talaria. Images are always pushed and consumed by repository
digest; mutable tags are never passed to deploy.sh.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --source-tag=*) SOURCE_TAG="${arg#*=}" ;;
    --build-id=*) BUILD_ID="${arg#*=}" ;;
    --checkpoint=*) CHECKPOINT="${arg#*=}" ;;
    --registry=*) REGISTRY="${arg#*=}" ;;
    --rollback-manifest=*) ROLLBACK_MANIFEST="${arg#*=}" ;;
    --public-origin=*) PUBLIC_ORIGIN="${arg#*=}" ;;
    --direct-origin=*) DIRECT_ORIGIN="${arg#*=}" ;;
    --compose-project=*) COMPOSE_PROJECT_NAME="${arg#*=}" ;;
    --remote=*) REMOTE="${arg#*=}" ;;
    --state-root=*) STATE_ROOT="${arg#*=}" ;;
    --dry-run) DRY_RUN=1 ;;
    --keep-worktree) KEEP_WORKTREE=1 ;;
    --deploy-existing=*) DEPLOY_EXISTING="${arg#*=}" ;;
    -h|--help) usage; exit 0 ;;
    --provenance-guard-off) die "--provenance-guard-off is prohibited" ;;
    *) die "unknown argument: $arg" ;;
  esac
done

[[ "$COMPOSE_PROJECT_NAME" =~ ^[a-z0-9][a-z0-9_-]*test[a-z0-9_-]*$ ]] \
  || die "--compose-project must explicitly name a TEST project (and contain 'test')"
export COMPOSE_PROJECT_NAME

if [[ -n "$DEPLOY_EXISTING" ]]; then
  [[ -f "$DEPLOY_EXISTING" ]] || die "accepted manifest does not exist: $DEPLOY_EXISTING"
  [[ "$PUBLIC_ORIGIN" =~ ^https?://[^/]+/?$ ]] || die "invalid or missing --public-origin"
  for tool in git node docker; do need "$tool"; done
  mapfile -t EXISTING_FIELDS < <(node - "$DEPLOY_EXISTING" <<'NODE'
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
for (const value of [
  manifest.source?.sha, manifest.source?.remote, manifest.source?.ref, manifest.buildId,
]) console.log(value || '');
NODE
  )
  [[ "${#EXISTING_FIELDS[@]}" -eq 4 ]] || die "accepted manifest source fields are missing"
  EXISTING_SHA="${EXISTING_FIELDS[0]}"
  EXISTING_REMOTE="${EXISTING_FIELDS[1]}"
  EXISTING_REF="${EXISTING_FIELDS[2]}"
  EXISTING_BUILD="${EXISTING_FIELDS[3]}"
  node "$ORCHESTRATOR_ROOT/scripts/checkpoint-provenance.mjs" validate-manifest \
    --manifest="$DEPLOY_EXISTING" >/dev/null
  REMOTE_URL="$(git -C "$ORCHESTRATOR_ROOT" remote get-url "$EXISTING_REMOTE")"
  REMOTE_SHA="$(cd "$ORCHESTRATOR_ROOT" && resolve_remote_tag_commit "$REMOTE_URL" "$EXISTING_REF")"
  [[ "$REMOTE_SHA" == "$EXISTING_SHA" ]] || die "accepted manifest source tag is not immutable remotely"
  EXISTING_SOURCE="$STATE_ROOT/rollback-$EXISTING_BUILD/source"
  mkdir -p "$(dirname "$EXISTING_SOURCE")"
  if [[ ! -e "$EXISTING_SOURCE/.git" ]]; then
    git -C "$ORCHESTRATOR_ROOT" fetch --force "$EXISTING_REMOTE" "$EXISTING_REF"
    git -C "$ORCHESTRATOR_ROOT" worktree add --detach "$EXISTING_SOURCE" "$EXISTING_SHA"
  fi
  [[ "$(git -C "$EXISTING_SOURCE" rev-parse HEAD)" == "$EXISTING_SHA" ]] \
    || die "rollback worktree HEAD mismatch"
  [[ -z "$(git -C "$EXISTING_SOURCE" status --porcelain --untracked-files=all)" ]] \
    || die "rollback worktree is dirty"
  export DIRECT_ORIGIN PUBLIC_ORIGIN
  ROOT="$EXISTING_SOURCE" TOOL_ROOT="$ORCHESTRATOR_ROOT" \
    "$ORCHESTRATOR_ROOT/scripts/deploy.sh" --manifest="$DEPLOY_EXISTING"
  printf 'Deployed accepted checkpoint %s from %s\n' "$EXISTING_BUILD" "$EXISTING_SHA"
  exit 0
fi

[[ "$SOURCE_TAG" =~ ^[A-Za-z0-9._/-]+$ ]] || die "invalid or missing --source-tag"
[[ "$BUILD_ID" =~ ^[0-9]{8}b[0-9]+$ ]] || die "invalid or missing --build-id"
[[ "$CHECKPOINT" =~ ^CKPT-[0-9]+$ ]] || die "invalid or missing --checkpoint"
[[ "$REGISTRY" =~ ^[A-Za-z0-9._:/-]+$ ]] || die "invalid or missing --registry"
[[ -n "$ROLLBACK_MANIFEST" ]] || die "--rollback-manifest is required"
[[ -f "$ROLLBACK_MANIFEST" ]] || die "rollback manifest does not exist: $ROLLBACK_MANIFEST"
[[ "$PUBLIC_ORIGIN" =~ ^https?://[^/]+/?$ ]] || die "invalid or missing --public-origin"
[[ "$DIRECT_ORIGIN" == auto || "$DIRECT_ORIGIN" =~ ^https?://[^/]+/?$ ]] \
  || die "--direct-origin must be auto or an HTTP(S) origin"

for tool in git node docker sha256sum; do need "$tool"; done
git -C "$ORCHESTRATOR_ROOT" remote get-url "$REMOTE" >/dev/null 2>&1 \
  || die "unknown git remote: $REMOTE"

REMOTE_URL="$(git -C "$ORCHESTRATOR_ROOT" remote get-url "$REMOTE")"
REMOTE_REF="refs/tags/$SOURCE_TAG"
SOURCE_SHA="$(cd "$ORCHESTRATOR_ROOT" && resolve_remote_tag_commit "$REMOTE_URL" "$REMOTE_REF")"
[[ "$SOURCE_SHA" =~ ^[a-f0-9]{40}$ ]] || die "remote tag did not resolve to a commit SHA"

ROLLBACK_FIELDS=()
mapfile -t ROLLBACK_FIELDS < <(
  node "$ORCHESTRATOR_ROOT/scripts/checkpoint-provenance.mjs" fields \
    --manifest="$ROLLBACK_MANIFEST" --rollback
)
[[ "${#ROLLBACK_FIELDS[@]}" -eq 6 ]] || die "could not extract immutable rollback fields"

RUN_DIR="$STATE_ROOT/$BUILD_ID"
SOURCE_DIR="$RUN_DIR/source"
PROOF="$RUN_DIR/uniformity.json"
MANIFEST="$RUN_DIR/$CHECKPOINT.provenance.json"
CHART_TAG="$REGISTRY/talaria-trading-chart:$BUILD_ID"
HOMEPAGE_TAG="$REGISTRY/talaria-homepage:$BUILD_ID"

cat <<EOF
TEST checkpoint plan
  source:     $REMOTE_REF
  source SHA: $SOURCE_SHA
  build:      $BUILD_ID
  checkpoint: $CHECKPOINT
  chart tag:  $CHART_TAG
  homepage:   $HOMEPAGE_TAG
  evidence:   $RUN_DIR
  compose:    $COMPOSE_PROJECT_NAME
  rollback:   ${ROLLBACK_FIELDS[1]} (${ROLLBACK_FIELDS[0]})
EOF
if (( DRY_RUN )); then
  printf 'DRY RUN: verified remote tag and rollback manifest; no files, images, or containers changed.\n'
  exit 0
fi

[[ ! -e "$RUN_DIR/.complete" ]] || die "checkpoint already completed: $RUN_DIR"
mkdir -p "$RUN_DIR"
exec 9>"$RUN_DIR/.lock"
flock -n 9 || die "another checkpoint run is active for $BUILD_ID"
printf '%s\n' "$$" >"$RUN_DIR/.in-progress"

cleanup() {
  status=$?
  if (( status != 0 )); then
    printf 'FAILED: retained resumable evidence in %s\n' "$RUN_DIR" >&2
  fi
  if (( status != 0 && KEEP_WORKTREE == 0 )) && [[ -d "$SOURCE_DIR" ]]; then
    git -C "$ORCHESTRATOR_ROOT" worktree remove --force "$SOURCE_DIR" >/dev/null 2>&1 || true
  fi
  rm -f "$RUN_DIR/.in-progress"
  exit "$status"
}
trap cleanup EXIT

say "fetch and verify immutable source"
git -C "$ORCHESTRATOR_ROOT" fetch --force "$REMOTE" "$REMOTE_REF"
FETCHED_SHA="$(git -C "$ORCHESTRATOR_ROOT" rev-parse FETCH_HEAD^{commit})"
[[ "$FETCHED_SHA" == "$SOURCE_SHA" ]] || die "fetched SHA differs from verified remote SHA"
if [[ -d "$SOURCE_DIR" ]]; then
  git -C "$ORCHESTRATOR_ROOT" worktree remove --force "$SOURCE_DIR" >/dev/null 2>&1 || true
fi
git -C "$ORCHESTRATOR_ROOT" worktree add --detach "$SOURCE_DIR" "$SOURCE_SHA"
[[ -z "$(git -C "$SOURCE_DIR" status --porcelain --untracked-files=all)" ]] \
  || die "source worktree is unexpectedly dirty"

say "generate source uniformity proof"
node "$SOURCE_DIR/scripts/checkpoint-provenance.mjs" uniformity \
  --repo-root="$SOURCE_DIR" --build-id="$BUILD_ID" --source-sha="$SOURCE_SHA" \
  --output="$PROOF" >/dev/null

say "strict chart and homepage builds"
export CHECKPOINT_BUILD=1 CHART_BUILD_ID="$BUILD_ID" SOURCE_COMMIT_SHA="$SOURCE_SHA"
export TRADING_CHART_IMAGE="$CHART_TAG" HOMEPAGE_IMAGE="$HOMEPAGE_TAG"
docker compose -f "$SOURCE_DIR/docker-compose.yml" --project-directory "$SOURCE_DIR" \
  build --pull trading-chart homepage

say "publish and resolve immutable image digests"
docker push "$CHART_TAG"
docker push "$HOMEPAGE_TAG"
CHART_REF="$(docker image inspect "$CHART_TAG" --format '{{range .RepoDigests}}{{println .}}{{end}}' \
  | awk -v r="${CHART_TAG%:*}@" 'index($0,r)==1 {print; exit}')"
HOMEPAGE_REF="$(docker image inspect "$HOMEPAGE_TAG" --format '{{range .RepoDigests}}{{println .}}{{end}}' \
  | awk -v r="${HOMEPAGE_TAG%:*}@" 'index($0,r)==1 {print; exit}')"
[[ "$CHART_REF" =~ @sha256:[a-f0-9]{64}$ ]] || die "chart registry digest was not resolved"
[[ "$HOMEPAGE_REF" =~ @sha256:[a-f0-9]{64}$ ]] || die "homepage registry digest was not resolved"
CHART_DIGEST="${CHART_REF##*@}"
HOMEPAGE_DIGEST="${HOMEPAGE_REF##*@}"
PROOF_HASH="$(sha256sum "$PROOF" | awk '{print $1}')"

say "generate provenance manifest"
node "$SOURCE_DIR/scripts/checkpoint-provenance.mjs" create-manifest \
  --checkpoint="$CHECKPOINT" --build-id="$BUILD_ID" --source-sha="$SOURCE_SHA" \
  --remote="$REMOTE" --remote-ref="$REMOTE_REF" \
  --chart-ref="$CHART_REF" --chart-digest="$CHART_DIGEST" \
  --homepage-ref="$HOMEPAGE_REF" --homepage-digest="$HOMEPAGE_DIGEST" \
  --proof="$(basename "$PROOF")" --proof-sha256="$PROOF_HASH" \
  --rollback-build-id="${ROLLBACK_FIELDS[1]}" --rollback-source-sha="${ROLLBACK_FIELDS[0]}" \
  --rollback-chart-ref="${ROLLBACK_FIELDS[2]}" --rollback-chart-digest="${ROLLBACK_FIELDS[4]}" \
  --rollback-homepage-ref="${ROLLBACK_FIELDS[3]}" --rollback-homepage-digest="${ROLLBACK_FIELDS[5]}" \
  --output="$MANIFEST" >/dev/null

say "deploy through guarded deploy.sh"
if [[ "$DIRECT_ORIGIN" == auto ]]; then
  # deploy.sh resolves the recreated homepage container immediately before probing.
  export DIRECT_ORIGIN=auto
else
  export DIRECT_ORIGIN
fi
export PUBLIC_ORIGIN
CHECKPOINT_RUNTIME_REPORT="$RUN_DIR/runtime.json" \
  ROOT="$SOURCE_DIR" TOOL_ROOT="$ORCHESTRATOR_ROOT" \
  "$ORCHESTRATOR_ROOT/scripts/deploy.sh" --manifest="$MANIFEST"

touch "$RUN_DIR/.complete"
ROLLBACK_COMMAND="'$ORCHESTRATOR_ROOT/scripts/deploy-test-checkpoint.sh' --deploy-existing='$ROLLBACK_MANIFEST' --public-origin='$PUBLIC_ORIGIN' --direct-origin='$DIRECT_ORIGIN' --compose-project='$COMPOSE_PROJECT_NAME' --state-root='$STATE_ROOT'"
cat <<EOF

DEPLOYED TEST CHECKPOINT
  build:           $BUILD_ID
  source:          $SOURCE_TAG ($SOURCE_SHA)
  chart image:     $CHART_REF
  homepage image:  $HOMEPAGE_REF
  manifest:        $MANIFEST
  runtime proof:   $RUN_DIR/runtime.json
  exact rollback:  $ROLLBACK_COMMAND
EOF
