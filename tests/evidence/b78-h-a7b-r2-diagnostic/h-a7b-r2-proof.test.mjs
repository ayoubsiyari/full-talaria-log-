import test from 'node:test';
import assert from 'node:assert/strict';
import { assessHA7bR2, FIXED_STATE } from './h-a7b-r2-proof.mjs';

test('A5 fixed state passes', () => {
  assert.deepEqual(assessHA7bR2(FIXED_STATE), {
    pass: true,
    ordinaryPass: true,
    inputOk: true,
    geometryOk: true,
    mechanismOk: true,
    firstFailure: null,
  });
});

test('A5 broken mechanism state is RED', () => {
  const result = assessHA7bR2({ ...FIXED_STATE, enforceAfter: 5 });
  assert.equal(result.pass, false);
  assert.equal(result.firstFailure, 'mechanism');
});

test('A5 deliberately corrupted input is RED', () => {
  const result = assessHA7bR2({ ...FIXED_STATE, fileB: '25' });
  assert.equal(result.pass, false);
  assert.equal(result.firstFailure, 'input');
});

test('A5 inverted assertion flips fixed state', () => {
  const result = assessHA7bR2({ ...FIXED_STATE, assertionInverted: true });
  assert.equal(result.ordinaryPass, true);
  assert.equal(result.pass, false);
});

test('negative control rejects crushed geometry', () => {
  const result = assessHA7bR2({
    ...FIXED_STATE,
    probe: { ...FIXED_STATE.probe, crush: true, marginR: 5, axisW: 5 },
  });
  assert.equal(result.pass, false);
  assert.equal(result.firstFailure, 'geometry');
});
