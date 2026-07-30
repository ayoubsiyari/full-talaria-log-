import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { FREEZE_GATE_ENV, resolveFreezeGate } from '../freeze-gate.mjs';

function retainedRootWith(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ckpt-test-'));
  for (const f of files) {
    const full = path.join(root, f);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, '// retained\n');
  }
  return root;
}

test('FLAG-01: with the switch ABSENT the CONF-01 gate is the bar', () => {
  const r = resolveFreezeGate({});
  assert.equal(r.mode, 'conf01');
  assert.equal(r.signature, 'CONF01-DURATION-GATE-V1');
  assert.equal(r.isTheBar, true);
  assert.match(r.flagState, /ABSENT/);
});

test('the OFF state resolves to retained bytes, not a rebuild', () => {
  const root = retainedRootWith([
    'pre-conf01-gate-swap-20260730b113/scripts/single-pair-soak.mjs',
  ]);
  const r = resolveFreezeGate({ [FREEZE_GATE_ENV]: 'single-pair' }, { retainedRoot: root });
  assert.equal(r.signature, 'SINGLE-PAIR-SOAK-V1');
  assert.equal(r.isTheBar, false, 'the rollback path is not a substitute bar');
  assert.match(r.source, /retained artifact/);
  assert.ok(fs.existsSync(r.script), `resolved script must exist: ${r.script}`);
});

test('the OFF state reports a missing artifact instead of silently rebuilding', () => {
  const root = retainedRootWith(['unrelated/scripts/other.mjs']);
  const r = resolveFreezeGate({ [FREEZE_GATE_ENV]: 'single-pair' }, { retainedRoot: root });
  assert.equal(r.script, null);
  assert.match(r.source, /MISSING/);
});

test('the newest retained checkpoint wins when several exist', () => {
  const root = retainedRootWith([
    'pre-conf01-gate-swap-20260730b100/scripts/single-pair-soak.mjs',
    'pre-conf01-gate-swap-20260730b113/scripts/single-pair-soak.mjs',
  ]);
  const r = resolveFreezeGate({ [FREEZE_GATE_ENV]: 'single-pair' }, { retainedRoot: root });
  assert.match(r.script, /20260730b113/);
});

test('a mistyped kill-switch throws rather than quietly running the new gate', () => {
  assert.throws(
    () => resolveFreezeGate({ [FREEZE_GATE_ENV]: 'singlepair' }),
    /not a known gate/,
  );
});

test('the rollback path carries its own acceptance caveat', () => {
  const root = retainedRootWith(['pre-conf01-gate-swap-x/scripts/single-pair-soak.mjs']);
  const r = resolveFreezeGate({ [FREEZE_GATE_ENV]: 'single-pair' }, { retainedRoot: root });
  assert.match(r.caveat, /no acceptance weight/);
});
