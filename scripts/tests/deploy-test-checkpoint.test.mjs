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
