#!/usr/bin/env bash
# Build and deploy one immutable TEST checkpoint from a pushed source tag.
set -Eeuo pipefail

die() { printf 'ERROR: %s\n' "$*" >&2; exit 2; }
say() { printf '\n=== %s ===\n' "$*"; }
need() { command -v "$1" >/dev/null 2>&1 || die "required command is missing: $1"; }

verify_existing_test_project() {
  local allow_stopped="${1:-0}"
  local compose=(docker compose)
  [[ -z "$ENV_FILE" ]] || compose+=(--env-file "$ENV_FILE")
  compose+=(-f "$ORCHESTRATOR_ROOT/docker-compose.yml"
    --project-directory "$ORCHESTRATOR_ROOT" -p "$COMPOSE_PROJECT_NAME")
  local service volume id identity project service_label state
  for service in "${TEST_PROFILE_SERVICES[@]}"; do
    id="$("${compose[@]}" ps -a -q "$service")"
    [[ -n "$id" ]] \
      || die "allowlisted TEST project lacks expected service container: $COMPOSE_PROJECT_NAME/$service"
    identity="$(docker inspect --format \
      '{{ index .Config.Labels "com.docker.compose.project" }}|{{ index .Config.Labels "com.docker.compose.service" }}|{{.State.Status}}' \
      "$id")"
    IFS='|' read -r project service_label state <<<"$identity"
    [[ "$project" == "$COMPOSE_PROJECT_NAME" && "$service_label" == "$service" ]] \
      || die "service container does not belong to allowlisted TEST project: $COMPOSE_PROJECT_NAME/$service"
    if (( ! allow_stopped )) && [[ "$state" != running ]]; then
      die "allowlisted TEST project lacks running service: $COMPOSE_PROJECT_NAME/$service"
    fi
  done
  for volume in "${TEST_PROFILE_VOLUMES[@]}"; do
    docker volume inspect "${COMPOSE_PROJECT_NAME}_${volume}" >/dev/null 2>&1 \
      || die "allowlisted TEST project lacks expected volume: ${COMPOSE_PROJECT_NAME}_${volume}"
  done
  docker network inspect "${COMPOSE_PROJECT_NAME}_${TEST_PROFILE_NETWORK}" >/dev/null 2>&1 \
    || die "allowlisted TEST project lacks expected network: ${COMPOSE_PROJECT_NAME}_${TEST_PROFILE_NETWORK}"
}

require_database_inputs() {
  local name
  for name in POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD; do
    if [[ -v "$name" && -n "${!name}" ]]; then
      continue
    fi
    if [[ -n "$ENV_FILE" ]] \
      && awk -F= -v key="$name" \
        '$1 == key && length(substr($0, index($0, "=") + 1)) > 0 { found=1 } END { exit !found }' \
        "$ENV_FILE"; then
      continue
    fi
    die "$name must be set or present in --env-file; Compose defaults are prohibited"
  done
}

validated_interrupted_resume() {
  [[ -f "$RUN_DIR/.source-sha" && "$(<"$RUN_DIR/.source-sha")" == "$SOURCE_SHA" ]] || return 1
  [[ -f "$PROOF" && -f "$PROOF.sha256" && -f "$MANIFEST" && -f "$MANIFEST.sha256" ]] || return 1
  printf '%s  %s\n' "$(<"$PROOF.sha256")" "$PROOF" | sha256sum --check --status || return 1
  printf '%s  %s\n' "$(<"$MANIFEST.sha256")" "$MANIFEST" | sha256sum --check --status || return 1
  node "$ORCHESTRATOR_ROOT/scripts/checkpoint-provenance.mjs" validate-manifest \
    --manifest="$MANIFEST" >/dev/null || return 1
  mapfile -t RESUME_FIELDS < <(node - "$PROOF" "$MANIFEST" <<'NODE'
const fs = require('fs');
const proof = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const manifest = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
for (const value of [
  proof.expectedBuildId, proof.sourceSha, manifest.checkpoint, manifest.buildId,
  manifest.source?.sha, manifest.images?.chart?.ref, manifest.images?.homepage?.ref,
]) console.log(value || '');
NODE
  )
  [[ "${#RESUME_FIELDS[@]}" -eq 7
    && "${RESUME_FIELDS[0]}" == "$BUILD_ID"
    && "${RESUME_FIELDS[1]}" == "$SOURCE_SHA"
    && "${RESUME_FIELDS[2]}" == "$CHECKPOINT"
    && "${RESUME_FIELDS[3]}" == "$BUILD_ID"
    && "${RESUME_FIELDS[4]}" == "$SOURCE_SHA" ]] || return 1

  local compose=(docker compose)
  [[ -z "$ENV_FILE" ]] || compose+=(--env-file "$ENV_FILE")
  compose+=(-f "$ORCHESTRATOR_ROOT/docker-compose.yml"
    --project-directory "$ORCHESTRATOR_ROOT" -p "$COMPOSE_PROJECT_NAME")
  local service id expected image
  for service in "${TEST_PROFILE_SERVICES[@]}"; do
    id="$("${compose[@]}" ps -a -q "$service")"
    [[ -n "$id" ]] || return 1
    case "$service" in
      trading-chart|trading-chart-worker) expected="${RESUME_FIELDS[5]}" ;;
      homepage) expected="${RESUME_FIELDS[6]}" ;;
      *) return 1 ;;
    esac
    image="$(docker inspect --format '{{.Config.Image}}' "$id")"
    [[ "$image" == "$expected" ]] || return 1
  done
  return 0
}

resolve_remote_annotated_tag() {
  local remote_url="$1"
  local remote_ref="$2"
  local output line sha ref
  local tag_object_sha=""
  local peeled_commit_sha=""

  output="$(git ls-remote "$remote_url" "$remote_ref" "$remote_ref^{}")" \
    || die "could not query remote source tag: $remote_ref"
  while IFS=$'\t' read -r sha ref; do
    [[ -z "$sha$ref" ]] && continue
    [[ "$sha" =~ ^[a-f0-9]{40}$ ]] || die "remote tag returned an invalid object id"
    case "$ref" in
      "$remote_ref")
        [[ -z "$tag_object_sha" ]] || die "remote tag object is ambiguous: $remote_ref"
        tag_object_sha="$sha"
        ;;
      "$remote_ref^{}")
        [[ -z "$peeled_commit_sha" ]] || die "remote peeled tag is ambiguous: $remote_ref^{}"
        peeled_commit_sha="$sha"
        ;;
      *) die "remote tag query returned an unexpected ref: $ref" ;;
    esac
  done <<<"$output"

  [[ -n "$tag_object_sha" ]] || die "pushed source tag not found: $remote_ref"
  [[ -n "$peeled_commit_sha" ]] \
    || die "source tag must be annotated and expose a peeled commit ref: $remote_ref^{}"
  [[ "$tag_object_sha" != "$peeled_commit_sha" ]] \
    || die "source tag object and peeled commit must be distinct"
  REMOTE_TAG_OBJECT_SHA="$tag_object_sha"
  SOURCE_SHA="$peeled_commit_sha"
}

if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then
  return 0
fi

ORCHESTRATOR_ROOT="${ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
SOURCE_TAG=""
BUILD_ID=""
CHECKPOINT=""
REGISTRY="${TEST_CHECKPOINT_REGISTRY:-}"
PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-}"
DIRECT_ORIGIN="${DIRECT_ORIGIN:-auto}"
ROLLBACK_MANIFEST=""
ROLLBACK_BUILD_ID=""
REMOTE="${TEST_CHECKPOINT_REMOTE:-origin}"
STATE_ROOT="${TEST_CHECKPOINT_STATE_ROOT:-/var/lib/talaria/checkpoints}"
COMPOSE_PROJECT_NAME=""
DRY_RUN=0
KEEP_WORKTREE=0
DEPLOY_EXISTING=""
NO_BUILD=0
ENV_FILE=""

usage() {
  cat <<'EOF'
Usage:
  scripts/deploy-test-checkpoint.sh --source-tag=<tag> --build-id=YYYYMMDDbN \
    --checkpoint=CKPT-N --registry=<registry/namespace> \
    --rollback-manifest=<accepted.json> --public-origin=https://test.example \
    --compose-project=<allowlisted-existing-test-project>

Options:
  --direct-origin=<origin|auto>  Re-resolve the recreated homepage container (default: auto)
  --compose-project=<name>       Existing project exactly bound to --public-origin by profile
  --remote=<git-remote>          Remote containing the immutable source tag (default: origin)
  --state-root=<directory>       Durable manifests, proofs, logs, and source worktrees
  --dry-run                      Verify inputs and print the exact plan; change nothing
  --keep-worktree                Keep the clean detached source worktree after success
  --no-build                     Reuse already-published images after digest resolution
  --deploy-existing=<manifest>   Deploy/rollback an already accepted pinned manifest
  --rollback-build-id=<id>       Assert the selected rollback candidate identity
  --env-file=<absolute-file>     Compose environment containing POSTGRES variables

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
    --rollback-build-id=*) ROLLBACK_BUILD_ID="${arg#*=}" ;;
    --env-file=*) ENV_FILE="${arg#*=}" ;;
    --public-origin=*) PUBLIC_ORIGIN="${arg#*=}" ;;
    --direct-origin=*) DIRECT_ORIGIN="${arg#*=}" ;;
    --compose-project=*) COMPOSE_PROJECT_NAME="${arg#*=}" ;;
    --remote=*) REMOTE="${arg#*=}" ;;
    --state-root=*) STATE_ROOT="${arg#*=}" ;;
    --dry-run) DRY_RUN=1 ;;
    --keep-worktree) KEEP_WORKTREE=1 ;;
    --no-build) NO_BUILD=1 ;;
    --deploy-existing=*) DEPLOY_EXISTING="${arg#*=}" ;;
    -h|--help) usage; exit 0 ;;
    --provenance-guard-off) die "--provenance-guard-off is prohibited" ;;
    *) die "unknown argument: $arg" ;;
  esac
done

ORCHESTRATOR_ROOT="$(cd "$ORCHESTRATOR_ROOT" && pwd -P)"
[[ "$STATE_ROOT" == /* ]] || die "--state-root must be an absolute path outside the repository"
case "$STATE_ROOT/" in
  "$ORCHESTRATOR_ROOT/"*)
    die "--state-root must be outside the deployment-tooling repository"
    ;;
esac
if [[ -n "$ENV_FILE" ]]; then
  [[ "$ENV_FILE" == /* ]] || die "--env-file must be absolute"
  [[ -f "$ENV_FILE" ]] || die "configured env-file does not exist: $ENV_FILE"
  export COMPOSE_ENV_FILES="$ENV_FILE"
fi

for tool in node docker; do need "$tool"; done
PROFILE_PATH="$ORCHESTRATOR_ROOT/scripts/test-deployment-profiles.json"
[[ -f "$PROFILE_PATH" ]] || die "committed TEST deployment profile is missing"
mapfile -t TEST_PROFILE_FIELDS < <(
  node - "$PROFILE_PATH" "$PUBLIC_ORIGIN" "$COMPOSE_PROJECT_NAME" <<'NODE'
const fs = require('fs');
const [profilePath, publicOrigin, composeProject] = process.argv.slice(2);
const document = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
if (document.schema !== 'talaria.test-deployment-profiles/v1') process.exit(3);
const matches = document.profiles.filter(
  (profile) => profile.publicOrigin === publicOrigin
    && profile.composeProject === composeProject,
);
if (matches.length !== 1) process.exit(4);
const profile = matches[0];
if (!Array.isArray(profile.services) || !profile.services.length
    || !Array.isArray(profile.volumes) || !profile.volumes.length
    || typeof profile.network !== 'string' || !profile.network) process.exit(5);
console.log(profile.services.join(','));
console.log(profile.volumes.join(','));
console.log(profile.network);
NODE
)
[[ "${#TEST_PROFILE_FIELDS[@]}" -eq 3 ]] \
  || die "public origin and Compose project are not an exact committed TEST profile"
IFS=',' read -r -a TEST_PROFILE_SERVICES <<<"${TEST_PROFILE_FIELDS[0]}"
IFS=',' read -r -a TEST_PROFILE_VOLUMES <<<"${TEST_PROFILE_FIELDS[1]}"
TEST_PROFILE_NETWORK="${TEST_PROFILE_FIELDS[2]}"
export COMPOSE_PROJECT_NAME

if [[ -n "$DEPLOY_EXISTING" ]]; then
  require_database_inputs
  verify_existing_test_project 0
  [[ -f "$DEPLOY_EXISTING" ]] || die "accepted manifest does not exist: $DEPLOY_EXISTING"
  [[ "$PUBLIC_ORIGIN" =~ ^https?://[^/]+/?$ ]] || die "invalid or missing --public-origin"
  need git
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
  resolve_remote_annotated_tag "$REMOTE_URL" "$EXISTING_REF"
  [[ "$SOURCE_SHA" == "$EXISTING_SHA" ]] \
    || die "accepted manifest source tag peeled commit is not immutable remotely"
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
    bash "$ORCHESTRATOR_ROOT/scripts/deploy.sh" --manifest="$DEPLOY_EXISTING"
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
resolve_remote_annotated_tag "$REMOTE_URL" "$REMOTE_REF"

ROLLBACK_FIELDS=()
mapfile -t ROLLBACK_FIELDS < <(
  node "$ORCHESTRATOR_ROOT/scripts/checkpoint-provenance.mjs" fields \
    --manifest="$ROLLBACK_MANIFEST"
)
[[ "${#ROLLBACK_FIELDS[@]}" -eq 6 ]] || die "could not extract immutable rollback fields"
if [[ -n "$ROLLBACK_BUILD_ID" && "${ROLLBACK_FIELDS[1]}" != "$ROLLBACK_BUILD_ID" ]]; then
  die "rollback manifest build ID mismatch: requested $ROLLBACK_BUILD_ID, manifest has ${ROLLBACK_FIELDS[1]}"
fi

RUN_DIR="$STATE_ROOT/$BUILD_ID"
SOURCE_DIR="$RUN_DIR/source"
PROOF="$RUN_DIR/uniformity.json"
MANIFEST="$RUN_DIR/$CHECKPOINT.provenance.json"
CHART_TAG="$REGISTRY/talaria-trading-chart:$BUILD_ID"
HOMEPAGE_TAG="$REGISTRY/talaria-homepage:$BUILD_ID"

require_database_inputs
if validated_interrupted_resume; then
  verify_existing_test_project 1
  printf 'Validated interrupted deploy evidence; stopped/unhealthy/restarting services may resume.\n'
else
  verify_existing_test_project 0
fi

cat <<EOF
TEST checkpoint plan
  source:     $REMOTE_REF
  tag object: $REMOTE_TAG_OBJECT_SHA
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

PREVIOUS_SOURCE_SHA=""
if [[ -f "$RUN_DIR/.source-sha" ]]; then
  PREVIOUS_SOURCE_SHA="$(<"$RUN_DIR/.source-sha")"
elif [[ -f "$MANIFEST" ]]; then
  PREVIOUS_SOURCE_SHA="$(
    node - "$MANIFEST" <<'NODE'
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
process.stdout.write(manifest.source?.sha || '');
NODE
  )"
fi
if [[ -n "$PREVIOUS_SOURCE_SHA" && "$PREVIOUS_SOURCE_SHA" != "$SOURCE_SHA" ]]; then
  [[ "$PREVIOUS_SOURCE_SHA" =~ ^[a-f0-9]{40}$ ]] \
    || die "existing run evidence has an invalid source SHA"
  STALE_DIR="$RUN_DIR/stale-$PREVIOUS_SOURCE_SHA-$(date +%s)"
  mkdir -p "$STALE_DIR"
  for stale in "$PROOF" "$MANIFEST" "$RUN_DIR/runtime.json"; do
    [[ ! -e "$stale" ]] || mv "$stale" "$STALE_DIR/"
  done
  printf 'Source changed from %s to %s; archived stale evidence in %s.\n' \
    "$PREVIOUS_SOURCE_SHA" "$SOURCE_SHA" "$STALE_DIR"
fi
printf '%s\n' "$SOURCE_SHA" >"$RUN_DIR/.source-sha"
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
FETCHED_TAG_OBJECT_SHA="$(git -C "$ORCHESTRATOR_ROOT" rev-parse FETCH_HEAD^{object})"
FETCHED_OBJECT_TYPE="$(git -C "$ORCHESTRATOR_ROOT" cat-file -t "$FETCHED_TAG_OBJECT_SHA")"
FETCHED_SHA="$(git -C "$ORCHESTRATOR_ROOT" rev-parse FETCH_HEAD^{commit})"
[[ "$FETCHED_OBJECT_TYPE" == tag ]] || die "fetched source ref is not an annotated tag object"
[[ "$FETCHED_TAG_OBJECT_SHA" == "$REMOTE_TAG_OBJECT_SHA" ]] \
  || die "fetched tag object differs from verified remote tag object"
[[ "$FETCHED_SHA" == "$SOURCE_SHA" ]] \
  || die "fetched peeled commit differs from verified remote peeled commit"
if [[ -d "$SOURCE_DIR" ]]; then
  git -C "$ORCHESTRATOR_ROOT" worktree remove --force "$SOURCE_DIR" >/dev/null 2>&1 || true
fi
git -C "$ORCHESTRATOR_ROOT" worktree add --detach "$SOURCE_DIR" "$SOURCE_SHA"
[[ -z "$(git -C "$SOURCE_DIR" status --porcelain --untracked-files=all)" ]] \
  || die "source worktree is unexpectedly dirty"

say "generate or validate source uniformity proof"
if [[ -f "$PROOF" && -f "$PROOF.sha256" ]] \
  && printf '%s  %s\n' "$(<"$PROOF.sha256")" "$PROOF" | sha256sum --check --status \
  && node - "$PROOF" "$BUILD_ID" "$SOURCE_SHA" <<'NODE'
const fs = require('fs');
const [file, buildId, sourceSha] = process.argv.slice(2);
const proof = JSON.parse(fs.readFileSync(file, 'utf8'));
process.exit(proof.expectedBuildId === buildId && proof.sourceSha === sourceSha ? 0 : 1);
NODE
then
  printf 'Resuming source-bound proof: %s\n' "$PROOF"
else
  rm -f "$PROOF" "$PROOF.sha256"
  node "$SOURCE_DIR/scripts/checkpoint-provenance.mjs" uniformity \
    --repo-root="$SOURCE_DIR" --build-id="$BUILD_ID" --source-sha="$SOURCE_SHA" \
    --output="$PROOF" >/dev/null
  sha256sum "$PROOF" | awk '{print $1}' >"$PROOF.sha256"
fi

say "strict chart and homepage builds/images"
export CHECKPOINT_BUILD=1 CHART_BUILD_ID="$BUILD_ID" SOURCE_COMMIT_SHA="$SOURCE_SHA"
export TRADING_CHART_IMAGE="$CHART_TAG" HOMEPAGE_IMAGE="$HOMEPAGE_TAG"
if (( ! NO_BUILD )); then
  docker compose -f "$SOURCE_DIR/docker-compose.yml" --project-directory "$SOURCE_DIR" \
    build --pull trading-chart homepage
  docker push "$CHART_TAG"
  docker push "$HOMEPAGE_TAG"
fi

say "resolve registry-authoritative immutable image digests"
CHART_DIGEST="$(docker buildx imagetools inspect "$CHART_TAG" \
  --format '{{json .Manifest.Digest}}' | tr -d '"')"
HOMEPAGE_DIGEST="$(docker buildx imagetools inspect "$HOMEPAGE_TAG" \
  --format '{{json .Manifest.Digest}}' | tr -d '"')"
CHART_REF="${CHART_TAG%:*}@$CHART_DIGEST"
HOMEPAGE_REF="${HOMEPAGE_TAG%:*}@$HOMEPAGE_DIGEST"
[[ "$CHART_REF" =~ @sha256:[a-f0-9]{64}$ ]] || die "chart registry digest was not resolved"
[[ "$HOMEPAGE_REF" =~ @sha256:[a-f0-9]{64}$ ]] || die "homepage registry digest was not resolved"
for published_tag in "$CHART_TAG" "$HOMEPAGE_TAG"; do
  PUBLISHED_LABELS="$(docker buildx imagetools inspect "$published_tag" \
    --format '{{json .Image.Config.Labels}}')"
  node - "$PUBLISHED_LABELS" "$BUILD_ID" "$SOURCE_SHA" <<'NODE' \
    || die "published image labels do not match strict build/source: $published_tag"
const [raw, buildId, sourceSha] = process.argv.slice(2);
const labels = JSON.parse(raw);
const ok = labels?.['io.talaria.checkpoint.strict'] === '1'
  && labels?.['io.talaria.checkpoint.build-id'] === buildId
  && labels?.['org.opencontainers.image.revision'] === sourceSha;
process.exit(ok ? 0 : 1);
NODE
done
PROOF_HASH="$(sha256sum "$PROOF" | awk '{print $1}')"

say "generate or validate provenance manifest"
if [[ -f "$MANIFEST" && -f "$MANIFEST.sha256" ]] \
  && printf '%s  %s\n' "$(<"$MANIFEST.sha256")" "$MANIFEST" | sha256sum --check --status \
  && node "$SOURCE_DIR/scripts/checkpoint-provenance.mjs" validate-manifest --manifest="$MANIFEST" >/dev/null \
  && node - "$MANIFEST" "$CHECKPOINT" "$BUILD_ID" "$SOURCE_SHA" "$REMOTE_REF" \
    "$CHART_REF" "$HOMEPAGE_REF" "$PROOF_HASH" "${ROLLBACK_FIELDS[1]}" <<'NODE'
const fs = require('fs');
const [file, checkpoint, buildId, sourceSha, remoteRef, chartRef, homepageRef, proofHash, rollbackId]
  = process.argv.slice(2);
const m = JSON.parse(fs.readFileSync(file, 'utf8'));
const ok = m.checkpoint === checkpoint && m.buildId === buildId
  && m.source?.sha === sourceSha && m.source?.ref === remoteRef
  && m.images?.chart?.ref === chartRef && m.images?.homepage?.ref === homepageRef
  && m.proof?.sha256 === proofHash && m.rollback?.buildId === rollbackId;
process.exit(ok ? 0 : 1);
NODE
then
  printf 'Resuming fully-bound manifest: %s\n' "$MANIFEST"
else
  rm -f "$MANIFEST" "$MANIFEST.sha256"
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
  sha256sum "$MANIFEST" | awk '{print $1}' >"$MANIFEST.sha256"
fi

say "validate manifest and run fail-closed preflight"
node "$SOURCE_DIR/scripts/checkpoint-provenance.mjs" validate-manifest --manifest="$MANIFEST"
node "$SOURCE_DIR/scripts/checkpoint-provenance.mjs" preflight \
  --manifest="$MANIFEST" --repo-root="$SOURCE_DIR"

say "deploy through guarded deploy.sh"
if [[ "$DIRECT_ORIGIN" == auto ]]; then
  # deploy.sh resolves the recreated homepage container immediately before probing.
  export DIRECT_ORIGIN=auto
else
  export DIRECT_ORIGIN
fi
export PUBLIC_ORIGIN
touch "$RUN_DIR/.deployment-began"
CHECKPOINT_RUNTIME_REPORT="$RUN_DIR/runtime.json" \
  ROOT="$SOURCE_DIR" TOOL_ROOT="$ORCHESTRATOR_ROOT" \
  bash "$ORCHESTRATOR_ROOT/scripts/deploy.sh" --manifest="$MANIFEST"

sha256sum "$RUN_DIR/runtime.json" | awk '{print $1}' >"$RUN_DIR/runtime.json.sha256"
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
