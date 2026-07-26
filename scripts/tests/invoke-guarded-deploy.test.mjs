import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const helper = path.join(root, 'scripts/lib/invoke-guarded-deploy.sh');
const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const shellPath = (value) => value.replaceAll('\\', '/').replace(
  /^([A-Za-z]):/,
  (_, drive) => `/mnt/${drive.toLowerCase()}`,
);

function invoke(t, exitCode = 0) {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'guarded deploy ; fixture-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const deploy = path.join(fixture, 'deploy script $(not-executed).sh');
  const manifest = path.join(fixture, 'manifest path ; still-one-arg.json');
  fs.writeFileSync(manifest, '{}\n');
  fs.writeFileSync(deploy, `#!/usr/bin/env bash
printf 'argc=%s\\nmanifest=%s\\nproject=%s\\nenv_file=%s\\n' "$#" "$1" "$COMPOSE_PROJECT_NAME" "$COMPOSE_ENV_FILES"
exit ${exitCode}
`);
  fs.chmodSync(deploy, 0o644);
  const shellManifest = shellPath(manifest);
  const command = [
    `export COMPOSE_PROJECT_NAME=${shellQuote('talaria exact project')}`,
    `export COMPOSE_ENV_FILES=${shellQuote('/opt/talaria/env path/.env')}`,
    `export POSTGRES_PASSWORD=${shellQuote('must-not-appear-in-output')}`,
    `source ${shellQuote(shellPath(helper))}`,
    `invoke_guarded_deploy ${shellQuote(shellPath(deploy))} ${shellQuote(shellManifest)}`,
  ].join('; ');
  const encoded = Buffer.from(command).toString('base64');
  return {
    result: spawnSync('bash', ['-c', `echo ${encoded} | base64 -d | bash`], {
      encoding: 'utf8',
      env: process.env,
    }),
    manifest: shellManifest,
  };
}

test('0644 deploy script succeeds through explicit bash with quoted values', (t) => {
  const { result, manifest } = invoke(t);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /argc=1/);
  assert.match(result.stdout, new RegExp(`manifest=--manifest=${manifest.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(result.stdout, /project=talaria exact project/);
  assert.match(result.stdout, /env_file=\/opt\/talaria\/env path\/\.env/);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /must-not-appear-in-output/);
  assert.equal(fs.existsSync(path.join(path.dirname(manifest), 'not-executed')), false);
});

test('guarded deploy propagates exact failure status', (t) => {
  const { result } = invoke(t, 37);
  assert.equal(result.status, 37);
});

test('helper contains no eval or command-string execution', () => {
  const source = fs.readFileSync(helper, 'utf8');
  assert.match(source, /bash "\$deploy_script" --manifest="\$manifest"/);
  assert.doesNotMatch(source, /\beval\b|bash -c|sh -c/);
});
