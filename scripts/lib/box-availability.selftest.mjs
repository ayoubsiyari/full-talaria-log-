#!/usr/bin/env node
/**
 * Cells for the box-availability contract.
 *
 * These exist because of a specific loss: `waitForBox` returned
 * `{state, waitedMs}` while its sibling `boxIsFree` returned `{free, why}`, so a
 * caller that read `gate.free` saw `undefined` on the success path and refused its
 * own turn — printing `WAIT_TIMEOUT — undefined` six minutes into a 180-minute
 * budget, after the box had cleared. The slot went to the next lane.
 *
 * The cell that would have caught it needs no fixtures and no stubs: whatever the
 * box is doing right now, the two fields must both be present and must agree. It
 * therefore passes on a busy box and on a free one, which is what lets it run in
 * a gate rather than only when the machine happens to be quiet.
 */

import assert from 'node:assert/strict';
import { boxBlockers, boxIsFree, waitForBox } from './box-availability.mjs';

let pass = 0; let fail = 0;
const results = [];
const test = async (name, fn) => {
  try { await fn(); pass++; results.push(['PASS', name]); } catch (e) { fail++; results.push(['FAIL', name, e.message]); }
};

await test('boxBlockers returns an array of strings, empty meaning available', () => {
  const b = boxBlockers({ owner: 'A' });
  assert.ok(Array.isArray(b), 'blockers must be an array');
  for (const x of b) assert.equal(typeof x, 'string', 'a blocker a human cannot read is not a blocker');
});

await test('boxIsFree carries both free and why', () => {
  const q = boxIsFree({ owner: 'A' });
  assert.equal(typeof q.free, 'boolean');
  assert.equal(typeof q.why, 'string', 'why is always a string here, empty when free');
});

await test('waitForBox and boxIsFree agree on the name of the answer', async () => {
  // The defect, closed structurally: both fields present on whichever path runs,
  // and `free` equal to the state rather than merely correlated with it.
  const gate = await waitForBox({ owner: 'A', waitMaxMs: 0, pollMs: 1, log: () => {} });
  assert.ok('free' in gate, 'waitForBox must carry `free`: its sibling does, and callers read it');
  assert.ok('state' in gate, 'and `state`, since two live callers read that instead');
  assert.ok('why' in gate, 'and `why` on both paths, so a refusal never logs undefined');
  assert.equal(typeof gate.waitedMs, 'number');
  assert.equal(gate.free, gate.state === 'BOX_AVAILABLE',
    `free and state must not be able to disagree; saw free=${gate.free} state=${gate.state}`);
  assert.ok(['BOX_AVAILABLE', 'WAIT_TIMEOUT'].includes(gate.state), `unexpected state ${gate.state}`);
  // Whichever the box happens to be, say so rather than asserting a condition
  // the host cannot guarantee.
  results.push(['NOTE', `the box was ${gate.state}${gate.why ? ` — ${gate.why}` : ''}`]);
});

await test('a zero budget still answers rather than hanging', async () => {
  const t0 = Date.now();
  const gate = await waitForBox({ owner: 'A', waitMaxMs: 0, pollMs: 1, log: () => {} });
  assert.ok(Date.now() - t0 < 20_000, 'a zero budget must not sit through a poll interval');
  assert.ok(gate.state);
});

for (const [state, name, why] of results) {
  console.log(`  ${state}  ${name}${why ? `\n        ${why}` : ''}`);
}
console.log(`\n  ${pass}/${pass + fail} cells`);
process.exitCode = fail ? 1 : 0;
