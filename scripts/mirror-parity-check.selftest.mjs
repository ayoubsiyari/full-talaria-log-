/**
 * MIRROR-PARITY-01 selftest. BIND-01: a checker that has never been observed
 * going red is not evidence of parity, so each state is driven from a fixture
 * tree with a known answer. The divergence case is the one that matters — it is
 * the state the real run has to reach on the day it counts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { checkParity, mirrorPathOf, MIRROR_TREES } from './mirror-parity-check.mjs';

const [CANON, MIRROR] = MIRROR_TREES[0];
const REL = `${CANON}modules/parity-fixture.mjs`;

function fixture(canonBody, mirrorBody) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-'));
  const write = (rel, body) => {
    if (body === null) return;
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  };
  write(REL, canonBody);
  write(mirrorPathOf(REL), mirrorBody);
  return root;
}

test('mirrorPathOf maps both directions and declines unmirrored paths', () => {
  assert.equal(mirrorPathOf(REL), `${MIRROR}modules/parity-fixture.mjs`);
  assert.equal(mirrorPathOf(`${MIRROR}modules/x.mjs`), `${CANON}modules/x.mjs`);
  assert.equal(mirrorPathOf('scripts/mirror-parity-check.mjs'), null);
});

test('identical pair reports PARITY_OK with the pair actually compared', () => {
  const root = fixture('same\n', 'same\n');
  const r = checkParity([REL], { root });
  assert.equal(r.state, 'PARITY_OK');
  assert.equal(r.checked, 1);
});

test('RED: one-byte difference reports PARITY_DIVERGED', () => {
  const root = fixture('same\n', 'same \n');
  const r = checkParity([REL], { root });
  assert.equal(r.state, 'PARITY_DIVERGED');
  assert.equal(r.diverged.length, 1);
  assert.notEqual(r.diverged[0].canonical, r.diverged[0].mirror);
});

test('RED: reverted mirror is caught when only the canonical side was named', () => {
  // The 2026-08-03 shape: the codemod wrote both, one silently returned to its
  // committed body, and the gate reading the canonical copy still passed.
  const root = fixture('disclosed\n', 'committed\n');
  assert.equal(checkParity([REL], { root }).state, 'PARITY_DIVERGED');
  assert.equal(checkParity([mirrorPathOf(REL)], { root }).state, 'PARITY_DIVERGED');
});

test('half-present pair reports MIRROR_MISSING, not OK and not diverged', () => {
  const root = fixture('only canonical\n', null);
  const r = checkParity([REL], { root });
  assert.equal(r.state, 'MIRROR_MISSING');
  assert.equal(r.checked, 0);
});

test('comparing nothing reports NO_MIRRORED_EDITS rather than a pass', () => {
  const root = fixture('same\n', 'same\n');
  const r = checkParity(['scripts/mirror-parity-check.mjs', 'docs/plan3/board/BOARD-A.md'], { root });
  assert.equal(r.state, 'NO_MIRRORED_EDITS');
  assert.equal(r.checked, 0);
});

test('a pair named from both sides is compared once, not twice', () => {
  const root = fixture('same\n', 'same\n');
  assert.equal(checkParity([REL, mirrorPathOf(REL)], { root }).checked, 1);
});
