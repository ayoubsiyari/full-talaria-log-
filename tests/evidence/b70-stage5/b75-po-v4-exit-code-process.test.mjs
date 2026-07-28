import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const probe = fileURLToPath(new URL('./b75-po-v4-exit-code-probe.mjs', import.meta.url));
const run = (verdict, complete = true, fatal = 0) => spawnSync(
  process.execPath,
  [probe, verdict, String(complete), String(fatal)],
  { encoding: 'utf8' },
);

for (const verdict of [
  'BLOCKED',
  'BLOCKED_UNKNOWN_MUTATION',
  'BLOCKED_SCOPE_MISMATCH',
  'ERROR',
  'UNKNOWN',
  'UNSAFE',
  '',
]) {
  test(`process exits nonzero for ${verdict || 'empty verdict'}`, () => {
    assert.notEqual(run(verdict).status, 0);
  });
}

test('process exits nonzero for incomplete capture despite RED verdict', () => {
  assert.notEqual(run('RED', false).status, 0);
});

test('process exits nonzero when mutation detection is fatal', () => {
  assert.notEqual(run('RED', true, 1).status, 0);
});

test('process exits zero for a complete offline RED diagnostic outcome', () => {
  assert.equal(run('RED', true, 0).status, 0);
});

test('process exits zero for a complete offline GREEN diagnostic outcome', () => {
  assert.equal(run('GREEN', true, 0).status, 0);
});
