import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ENTRY_LEVELS_CAP,
  ENTRY_LEVELS_CAP_SIGNATURE,
  ENTRY_LEVELS_CAP_SWITCH,
  runEntryLevelsCapGate,
} from '../entry-levels-cap-gate.mjs';

test('entry-level cap gate is green in zero-trade and trade-heavy regimes', () => {
  const report = runEntryLevelsCapGate();
  assert.equal(report.signature, ENTRY_LEVELS_CAP_SIGNATURE);
  assert.equal(report.switchName, ENTRY_LEVELS_CAP_SWITCH);
  assert.equal(report.status, 'GREEN');

  const zero = report.cells.find((cell) => cell.name === 'ENTRY-CAP-ZERO-TRADE-REGIME');
  assert.equal(zero.status, 'GREEN');
  assert.equal(zero.metrics.afterCount, 1);

  const heavy = report.cells.find((cell) => cell.name === 'ENTRY-CAP-TRADE-HEAVY-REGIME');
  assert.equal(heavy.status, 'GREEN');
  assert.equal(heavy.metrics.beforeCount, ENTRY_LEVELS_CAP);
  assert.equal(heavy.metrics.afterCount, ENTRY_LEVELS_CAP);
  assert.equal(heavy.metrics.newOrderAcceptedIntoGroup, false);
  assert.equal(heavy.metrics.realOrdersOnOrderManager, true);
});

test('entry-level cap gate keeps bypass-path RED control armed', () => {
  const report = runEntryLevelsCapGate();
  const control = report.cells.find((cell) => cell.name === 'NC-ENTRY-CAP-BYPASS-PATH-RED');
  assert.equal(control.status, 'GREEN');
  assert.equal(control.reportStatus, 'RED');
  assert.equal(control.metrics.afterCount, ENTRY_LEVELS_CAP + 1);
  assert.equal(control.metrics.newOrderAcceptedIntoGroup, true);
});

test('entry-level cap gate proves below-cap scaling still works', () => {
  const report = runEntryLevelsCapGate();
  const belowCap = report.cells.find((cell) => cell.name === 'ENTRY-CAP-BELOW-CAP-STILL-SCALES');
  assert.equal(belowCap.status, 'GREEN');
  assert.equal(belowCap.metrics.beforeCount, ENTRY_LEVELS_CAP - 1);
  assert.equal(belowCap.metrics.afterCount, ENTRY_LEVELS_CAP);
  assert.equal(belowCap.metrics.newOrderAcceptedIntoGroup, true);
});

test('entry-level cap gate proves mirrors and live scaling binding', () => {
  const report = runEntryLevelsCapGate();
  const source = report.cells.find((cell) => cell.name === 'ENTRY-CAP-SOURCE-PRESENT-BOUND-MIRRORED');
  assert.equal(source.status, 'GREEN');
  assert.equal(source.source.mirrorsByteIdentical, true);
  assert.equal(source.source.switchPresent, true);
  assert.equal(source.source.capHelperPresent, true);
  assert.equal(source.source.scalingPathBound, true);
});
