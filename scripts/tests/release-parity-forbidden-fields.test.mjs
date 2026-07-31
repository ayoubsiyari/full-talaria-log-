import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DECISIONS_FORBIDDEN_FIELDS,
  E_COMPANION_ORACLE,
  E_OWNED_FORBIDDEN_FIELDS,
  provePerInstanceTrapsFireInSingleRealm,
  productSetterTrapsAreStub,
} from '../../docs/plan3/oracles/release-parity-engine-api-guards.mjs';
import {
  RELEASE_PARITY_FORBIDDEN_FIELDS_SIGNATURE,
  runForbiddenFieldsSuite,
  runDecisionsTenFilterCells,
  runPerInstanceTrapCell,
  runPortedGuardSelfTest,
  runVisibleRangeAutoScaleSubtlety,
} from '../../docs/plan3/oracles/release-parity-forbidden-fields-v1.mjs';

test('decisions.md ten forbidden fields are the suite source of truth', () => {
  assert.deepEqual(DECISIONS_FORBIDDEN_FIELDS, [
    'priceMin',
    'priceMax',
    'autoScale',
    'priceZoom',
    'priceOffset',
    'timeframe',
    'indicators',
    'drawings',
    'chartType',
    'scaleMode',
  ]);
  assert.deepEqual(E_OWNED_FORBIDDEN_FIELDS, ['indicators', 'drawings', 'chartType']);
  assert.ok(E_COMPANION_ORACLE.redControls.includes('RP-INDICATOR-GLOBAL-SLOT'));
  assert.ok(E_COMPANION_ORACLE.redControls.includes('RP-DRAWING-GLOBAL-LAYER'));
  assert.ok(E_COMPANION_ORACLE.redControls.includes('RP-OVERLAY-GLOBAL-LAYER'));
});

test('ported product guard self-test is GREEN (RED fixtures strip)', () => {
  const cell = runPortedGuardSelfTest();
  assert.equal(cell.status, 'GREEN', JSON.stringify(cell.failures, null, 2));
});

test('each of the ten fields is stripped top-level and nested', () => {
  const cells = runDecisionsTenFilterCells();
  assert.equal(cells.length, 10);
  for (const cell of cells) {
    assert.equal(cell.status, 'GREEN', `${cell.cell}: ${JSON.stringify(cell)}`);
  }
});

test('visibleRange sync keeps autoScale true (product subtlety)', () => {
  const cell = runVisibleRangeAutoScaleSubtlety();
  assert.equal(cell.status, 'GREEN', JSON.stringify(cell, null, 2));
});

test('RELEASE-01 stop authority: ported traps fire per-instance in one realm', () => {
  const proof = provePerInstanceTrapsFireInSingleRealm();
  assert.equal(proof.ok, true, JSON.stringify(proof, null, 2));
  assert.equal(proof.threw, true);
  assert.equal(proof.errorCode, 'FORBIDDEN_SETTER_TRAP');
  assert.equal(proof.internalOk, true);
  const cell = runPerInstanceTrapCell();
  assert.equal(cell.status, 'GREEN');
  assert.equal(cell.releaseAuthority.stopAuthority, true);
});

test('product installForbiddenSetterTraps remains a stub — release waits', () => {
  assert.equal(productSetterTrapsAreStub(), true);
  const report = runForbiddenFieldsSuite();
  assert.equal(report.status, 'GREEN', JSON.stringify(report.failures, null, 2));
  assert.equal(report.signature, RELEASE_PARITY_FORBIDDEN_FIELDS_SIGNATURE);
  assert.equal(report.releaseAuthority.productStubBlocksRelease, true);
});
