import test from 'node:test';
import assert from 'node:assert/strict';
import { tag, ratio, difference, checkSameBasis, borrowAcrossBasis, BASES, basisKey } from './basis-guard.mjs';

test('INCIDENT 1 — the 59.84% coverage figure is refused at the ratio, not explained afterwards', () => {
  // One renderer's roots over all processes' private memory. Both numbers correct.
  const numerator = tag(310.9, BASES.onePidRoots);
  const denominator = tag(519.6, BASES.allChromePrivate);
  const r = ratio(numerator, denominator);
  assert.equal(r.ok, false);
  assert.equal(r.value, null, 'no number is produced — that is the whole point');
  assert.match(r.why, /different QUANTITIES|different SCOPES/);
});

test('the corrected COV-01 ratio computes, because both sides are all-Chrome', () => {
  const r = ratio(tag(640.1, BASES.allChromeRoots), tag(674.9, BASES.allChromeRoots));
  assert.equal(r.ok, true);
  assert.equal(r.value, 94.84);
});

test('INCIDENT 2 — the JS-heap amplitude cannot be borrowed for GPU canvas memory', () => {
  const b = borrowAcrossBasis(BASES.jsHeap, BASES.gpuMemory);
  assert.equal(b.ok, false);
  assert.equal(b.state, 'BORROW_REFUSED');
  assert.match(b.why, /different QUANTITIES/);
  assert.match(b.why, /Silence is not a justification/);
});

test('a borrow is possible, but only with a written justification that lands in the artifact', () => {
  const b = borrowAcrossBasis(BASES.jsHeap, BASES.gpuMemory, {
    justification: 'both are sampled from the same compositor frame cadence and were shown to move '
      + 'together within 3% across the W90 census',
  });
  assert.equal(b.ok, true);
  assert.equal(b.state, 'BORROW_JUSTIFIED');
  assert.match(b.justification, /W90 census/);
});

test('a hollow justification does not buy the borrow', () => {
  const b = borrowAcrossBasis(BASES.jsHeap, BASES.gpuMemory, { justification: 'should be fine' });
  assert.equal(b.ok, false, 'the same hollow-disposition rule as KNOWN-WEAKNESS-01');
});

test('an untagged figure is refused rather than assumed compatible', () => {
  const c = checkSameBasis({ valueMB: 100 }, tag(50, BASES.allChromePrivate));
  assert.equal(c.ok, false);
  assert.equal(c.state, 'UNTAGGED_FIGURE');
  assert.match(c.why, /MB is not a basis/);
});

test('SCOPE is checked independently of quantity — same thing measured over different scopes', () => {
  const c = checkSameBasis(tag(1, BASES.onePidPrivate), tag(1, BASES.allChromePrivate));
  assert.equal(c.state, 'SCOPE_MISMATCH');
  assert.match(c.why, /59\.84% coverage defect/);
});

test('METHOD is checked too — a 3 s read and a settled curve are not the same measurement', () => {
  const quick = { quantity: 'private-memory', scope: 'all-chrome-processes', method: '3s-sleep' };
  const c = checkSameBasis(tag(1159.7, quick), tag(674.9, BASES.allChromePrivate));
  assert.equal(c.state, 'METHOD_MISMATCH');
  assert.match(c.why, /108\.2 MB/);
});

test('a difference across bases is refused the same way a ratio is', () => {
  const d = difference(tag(1342.9, BASES.allChromePrivate), tag(931.6, BASES.onePidPrivate));
  assert.equal(d.ok, false);
  assert.equal(d.valueMB, null);
});

test('a same-basis difference computes', () => {
  const d = difference(tag(1342.9, BASES.allChromePrivate), tag(1159.7, BASES.allChromePrivate));
  assert.equal(d.valueMB, 183.2);
});

test('a zero denominator is a distinct state from a basis mismatch', () => {
  const r = ratio(tag(100, BASES.allChromeRoots), tag(0, BASES.allChromeRoots));
  assert.equal(r.state, 'NO_DENOMINATOR');
  assert.notEqual(r.state, 'SCOPE_MISMATCH', 'these send you to different places');
});

test('the named bases are distinguishable by key, so spellings cannot drift apart', () => {
  assert.equal(basisKey(BASES.allChromePrivate), 'private-memory@all-chrome-processes/os-footprint');
  assert.notEqual(basisKey(BASES.onePidRoots), basisKey(BASES.allChromeRoots));
});
