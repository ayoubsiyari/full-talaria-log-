import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflowPath = path.join(root, 'scripts/deploy-test-checkpoint.sh');
const deployPath = path.join(root, 'scripts/deploy.sh');

test('checkpoint wrapper is fail-closed and never handles passwords', () => {
  const source = fs.readFileSync(workflowPath, 'utf8');
  assert.match(source, /--rollback-manifest is required/);
  assert.match(source, /resolve_remote_tag_commit/);
  assert.match(source, /git ls-remote "\$remote_url" "\$remote_ref" "\$\{remote_ref\}\^\{\}"/);
  assert.match(source, /FETCHED_SHA.*SOURCE_SHA/s);
  assert.match(source, /CHECKPOINT_BUILD=1/);
  assert.match(source, /docker compose.*build --pull/s);
  assert.match(source, /docker push "\$CHART_TAG"/);
  assert.match(source, /@sha256:\[a-f0-9\]\{64\}/);
  assert.match(source, /checkpoint-provenance\.mjs" create-manifest/);
  assert.match(source, /"\$ORCHESTRATOR_ROOT\/scripts\/deploy\.sh" --manifest/);
  assert.match(source, /DRY RUN:.*no files, images, or containers changed/);
  assert.doesNotMatch(source, /password|sshpass/i);
  assert.doesNotMatch(source, /:latest/);
});

test('invalid inputs are rejected before tools or deployment are invoked', () => {
  const source = fs.readFileSync(workflowPath, 'utf8');
  const testTarget = source.indexOf('--compose-project must explicitly name a TEST project');
  const validation = source.indexOf('invalid or missing --source-tag');
  const toolChecks = source.indexOf('for tool in git node docker sha256sum');
  const deployment = source.indexOf('deploy through guarded deploy.sh');
  assert.ok(testTarget >= 0 && testTarget < validation);
  assert.ok(validation >= 0 && validation < toolChecks && toolChecks < deployment);
  assert.match(source, /--compose-project='\$COMPOSE_PROJECT_NAME'/);
});

test('deploy refreshes auto direct-origin after container recreation', () => {
  const source = fs.readFileSync(deployPath, 'utf8');
  const recreate = source.indexOf('docker compose up -d --no-build');
  const resolution = source.indexOf('NetworkSettings.Networks');
  const probe = source.indexOf('checkpoint-runtime-probe.mjs');
  assert.ok(recreate >= 0 && resolution > recreate);
  assert.ok(probe >= 0);
  assert.match(source, /TOOL_ROOT/);
});

test('runtime probe defaults to static auth-compatible tripwire', () => {
  const source = fs.readFileSync(
    path.join(root, 'scripts/checkpoint-runtime-probe.mjs'),
    'utf8',
  );
  assert.match(source, /Static mode is intentional for login-gated TEST surfaces/);
  assert.match(source, /args\['browser-authenticated'\] === '1'/);
  assert.match(source, /frameBuildIds: \[embedBuildId\]/);
});
