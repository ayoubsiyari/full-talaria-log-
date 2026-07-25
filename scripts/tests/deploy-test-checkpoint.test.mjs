import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflowPath = path.join(root, 'scripts/deploy-test-checkpoint.sh');
const deployPath = path.join(root, 'scripts/deploy.sh');
const profilesPath = path.join(root, 'scripts/test-deployment-profiles.json');

function run(command, cwd, env = {}) {
  const result = spawnSync(command[0], command.slice(1), {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function shellPath(value) {
  const normalized = value.replaceAll('\\', '/');
  return normalized.replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
}

test('checkpoint wrapper is fail-closed and never handles passwords', () => {
  const source = fs.readFileSync(workflowPath, 'utf8');
  assert.match(source, /--rollback-manifest is required/);
  assert.match(source, /git ls-remote.*"\$remote_ref\^\{\}"/);
  assert.match(source, /FETCHED_SHA.*SOURCE_SHA/s);
  assert.match(source, /CHECKPOINT_BUILD=1/);
  assert.match(source, /docker compose.*build --pull/s);
  assert.match(source, /docker push "\$CHART_TAG"/);
  assert.match(source, /@sha256:\[a-f0-9\]\{64\}/);
  assert.match(source, /checkpoint-provenance\.mjs" create-manifest/);
  assert.equal(
    [...source.matchAll(/bash "\$ORCHESTRATOR_ROOT\/scripts\/deploy\.sh" --manifest/g)].length,
    2,
  );
  assert.match(source, /DRY RUN:.*no files, images, or containers changed/);
  assert.doesNotMatch(source, /password|sshpass/i);
  assert.doesNotMatch(source, /:latest/);
});

test('invalid inputs are rejected before tools or deployment are invoked', () => {
  const source = fs.readFileSync(workflowPath, 'utf8');
  const testTarget = source.indexOf('public origin and Compose project are not an exact committed TEST profile');
  const validation = source.indexOf('invalid or missing --source-tag');
  const toolChecks = source.indexOf('for tool in git node docker sha256sum');
  const deployment = source.indexOf('deploy through guarded deploy.sh');
  assert.ok(testTarget >= 0 && testTarget < validation);
  assert.ok(validation >= 0 && validation < toolChecks && toolChecks < deployment);
  assert.match(source, /--compose-project='\$COMPOSE_PROJECT_NAME'/);
});

test('exact TEST profile binds origin to existing talaria project only', () => {
  const document = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));
  assert.equal(document.schema, 'talaria.test-deployment-profiles/v1');
  const allowed = (origin, project) => document.profiles.filter(
    (profile) => profile.publicOrigin === origin && profile.composeProject === project,
  ).length === 1;
  assert.equal(allowed('http://31.97.192.82:3000', 'talaria'), true);
  assert.equal(allowed('http://31.97.192.82:3000', 'talaria-test'), false);
  assert.equal(allowed('https://talaria-log.com', 'talaria'), false);
  assert.equal(allowed('http://31.97.192.82:3000', 'production'), false);
});

test('existing TEST stack inventory is checked before any build or deploy mutation', () => {
  const source = fs.readFileSync(workflowPath, 'utf8');
  const service = source.indexOf('ps -q "$service"');
  const volume = source.indexOf('docker volume inspect');
  const network = source.indexOf('docker network inspect');
  const profileCall = source.indexOf('verify_existing_test_project');
  const build = source.indexOf('strict chart and homepage builds');
  assert.ok(service >= 0 && volume > service && network > volume);
  assert.ok(profileCall >= 0 && profileCall < build);
  assert.doesNotMatch(source, /--provision|provision mode/);
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

test('annotated source tag resolves to its peeled commit and rejects ambiguity', (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'talaria-annotated-tag-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  run(['git', 'init', '--quiet'], repo);
  run(['git', 'config', 'user.name', 'Checkpoint Test'], repo);
  run(['git', 'config', 'user.email', 'checkpoint@example.invalid'], repo);
  fs.writeFileSync(path.join(repo, 'source.txt'), 'annotated checkpoint\n');
  run(['git', 'add', 'source.txt'], repo);
  run(['git', 'commit', '--quiet', '-m', 'fixture commit'], repo);
  const commitSha = run(['git', 'rev-parse', 'HEAD'], repo);
  run(['git', 'tag', '-a', 'fixture-source', '-m', 'fixture annotated tag'], repo);
  const tagObjectSha = run(['git', 'rev-parse', 'fixture-source^{object}'], repo);
  assert.notEqual(tagObjectSha, commitSha);

  const advertised = run([
    'git', 'ls-remote', repo,
    'refs/tags/fixture-source', 'refs/tags/fixture-source^{}',
  ], root).split(/\r?\n/).map((line) => line.split(/\s+/));
  assert.deepEqual(advertised, [
    [tagObjectSha, 'refs/tags/fixture-source'],
    [commitSha, 'refs/tags/fixture-source^{}'],
  ]);

  const source = fs.readFileSync(workflowPath, 'utf8');
  assert.match(source, /SOURCE_SHA="\$peeled_commit_sha"/);
  assert.match(source, /SOURCE_COMMIT_SHA="\$SOURCE_SHA"/);
  assert.match(source, /--source-sha="\$SOURCE_SHA"/);
  assert.match(source, /worktree add --detach "\$SOURCE_DIR" "\$SOURCE_SHA"/);
  assert.match(source, /remote peeled tag is ambiguous/);
  assert.match(source, /fetched tag object differs from verified remote tag object/);
  assert.match(source, /fetched peeled commit differs from verified remote peeled commit/);
});

test('non-executable deploy script is reached through bash', (t) => {
  const fixture = fs.mkdtempSync(path.join(root, '.talaria-deploy-mode-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const deploy = path.join(fixture, 'deploy.sh');
  fs.writeFileSync(deploy, '#!/usr/bin/env bash\nprintf "%s" "$1"\n');
  fs.chmodSync(deploy, 0o644);
  assert.equal(fs.statSync(deploy).mode & 0o111, 0);
  assert.equal(
    run(['bash', shellPath(path.relative(root, deploy)), '--manifest=fixture.json'], root),
    '--manifest=fixture.json',
  );
});

test('interrupted rerun archives evidence from a different source SHA', () => {
  const source = fs.readFileSync(workflowPath, 'utf8');
  const mismatch = source.indexOf('"$PREVIOUS_SOURCE_SHA" != "$SOURCE_SHA"');
  const archive = source.indexOf('mv "$stale" "$STALE_DIR/"');
  const sourceMarker = source.indexOf('>"$RUN_DIR/.source-sha"');
  const build = source.indexOf('strict chart and homepage builds');
  assert.ok(mismatch >= 0 && mismatch < archive);
  assert.ok(archive < sourceMarker && sourceMarker < build);
  assert.match(source, /stale-\$PREVIOUS_SOURCE_SHA-\$\(date \+%s\)/);
  assert.match(source, /SOURCE_COMMIT_SHA="\$SOURCE_SHA"/);
});

test('generated evidence defaults outside and does not dirty source', (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'talaria-state-isolation-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const repository = path.join(parent, 'source');
  const state = path.join(parent, 'state', '20260725b68');
  fs.mkdirSync(repository);
  run(['git', 'init', '--quiet'], repository);
  run(['git', 'config', 'user.name', 'Checkpoint Test'], repository);
  run(['git', 'config', 'user.email', 'checkpoint@example.invalid'], repository);
  fs.writeFileSync(path.join(repository, 'tracked.txt'), 'source\n');
  run(['git', 'add', 'tracked.txt'], repository);
  run(['git', 'commit', '--quiet', '-m', 'clean source'], repository);
  fs.mkdirSync(state, { recursive: true });
  fs.writeFileSync(path.join(state, 'uniformity.json'), '{}\n');
  assert.equal(run(['git', 'status', '--porcelain', '--untracked-files=all'], repository), '');

  const source = fs.readFileSync(workflowPath, 'utf8');
  assert.match(source, /STATE_ROOT="\$\{TEST_CHECKPOINT_STATE_ROOT:-\/var\/lib\/talaria\/checkpoints\}"/);
  assert.match(source, /--state-root must be outside the deployment-tooling repository/);
});

test('b69 binds the selected b68 candidate, never b68 nested b65 rollback', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'talaria-rollback-chain-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const candidate = JSON.parse(fs.readFileSync(
    path.join(root, 'scripts/fixtures/checkpoint-provenance/green-manifest.json'),
    'utf8',
  ));
  candidate.checkpoint = 'CKPT-68';
  candidate.buildId = '20260725b68';
  candidate.source.sha = '8'.repeat(40);
  candidate.images.chart = {
    ref: `registry/chart@sha256:${'8'.repeat(64)}`,
    digest: `sha256:${'8'.repeat(64)}`,
  };
  candidate.images.homepage = {
    ref: `registry/homepage@sha256:${'9'.repeat(64)}`,
    digest: `sha256:${'9'.repeat(64)}`,
  };
  candidate.rollback.buildId = '20260725b65';
  candidate.rollback.sourceSha = '5'.repeat(40);
  const candidatePath = path.join(dir, 'b68.json');
  fs.writeFileSync(candidatePath, JSON.stringify(candidate));

  const fields = spawnSync(process.execPath, [
    path.join(root, 'scripts/checkpoint-provenance.mjs'),
    'fields', `--manifest=${candidatePath}`,
  ], { encoding: 'utf8' });
  assert.equal(fields.status, 0, fields.stderr);
  assert.deepEqual(fields.stdout.trim().split(/\r?\n/), [
    candidate.source.sha,
    '20260725b68',
    candidate.images.chart.ref,
    candidate.images.homepage.ref,
    candidate.images.chart.digest,
    candidate.images.homepage.digest,
  ]);

  const source = fs.readFileSync(workflowPath, 'utf8');
  assert.match(source, /fields \\\n\s+--manifest="\$ROLLBACK_MANIFEST"\n/);
  assert.doesNotMatch(source, /--manifest="\$ROLLBACK_MANIFEST" --rollback/);
  assert.match(source, /rollback manifest build ID mismatch/);
});
