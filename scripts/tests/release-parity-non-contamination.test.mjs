import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONF01_PANELS,
  NON_CONTAMINATION_OPERATIONS,
  PARITY_SURFACES,
  RELEASE_PARITY_NON_CONTAMINATION_SIGNATURE,
  runNonContaminationSuite,
  runParityBreadthRedControls,
  runParityBreadthSuite,
  runRedControls,
  runReleaseParityNonContaminationOracle,
} from '../../docs/plan3/oracles/release-parity-non-contamination-v1.mjs';

test('RELEASE parity non-contamination oracle declares CONF-01 hard shape', () => {
  assert.equal(CONF01_PANELS.length, 4);
  assert.equal(new Set(CONF01_PANELS.map((p) => p.symbol)).size, 4);
  assert.equal(new Set(CONF01_PANELS.map((p) => p.timeframe)).size, 4);
  assert.deepEqual(CONF01_PANELS.map((p) => p.id), ['A', 'B', 'C', 'D']);
});

test('scoped non-contamination suite is GREEN across data, indicator, drawing, order and viewport surfaces', () => {
  const report = runNonContaminationSuite({ mode: 'scoped' });
  assert.equal(report.signature, RELEASE_PARITY_NON_CONTAMINATION_SIGNATURE);
  assert.equal(report.status, 'GREEN', JSON.stringify(report.failures, null, 2));
  assert.equal(report.conf01.acceptanceWeight, 'same-symbol or matched-timeframe contamination fixtures earn no credit');
  assert.equal(report.conf01.mismatchedTimeframesOnly, true);
  assert.deepEqual(report.operations, NON_CONTAMINATION_OPERATIONS);
  assert.ok(report.operations.includes('pan-candles'));
  assert.ok(report.operations.includes('resize-candles'));
  assert.equal(report.cells.length, NON_CONTAMINATION_OPERATIONS.length);
  for (const cell of report.cells) {
    assert.equal(cell.status, 'GREEN', cell.cell);
    assert.equal(cell.peersIdentical, true, `${cell.cell} mutated peers`);
    assert.equal(cell.targetChanged, true, `${cell.cell} did not exercise target`);
    assert.equal(cell.mismatchedTimeframesOnly, true, `${cell.cell} used matched timeframes`);
  }
});

test('RED fixture: unscoped _h1Cache makes mixed-symbol indicator read another panel data', () => {
  const report = runNonContaminationSuite({ mode: 'unscopedH1Cache' });
  assert.equal(report.status, 'RED');
  const failures = report.failures.filter((f) => f.reason === 'indicator-cross-contamination');
  assert.ok(failures.length > 0, JSON.stringify(report.failures, null, 2));
  assert.ok(
    failures.some((f) => f.sourcePanel && f.sourcePanel !== f.panelId),
    'failure must name the contaminating source panel',
  );
});

test('RED fixture: global chartDataLoaded listener mutates a peer on target panel load', () => {
  const report = runNonContaminationSuite({ mode: 'globalChartDataLoaded' });
  assert.equal(report.status, 'RED');
  const peerFailures = report.failures.filter((f) => f.reason === 'peer-mutated');
  assert.ok(peerFailures.length > 0, JSON.stringify(report.failures, null, 2));
  assert.ok(
    peerFailures.some((f) => ['NONCONTAM-CHANGE-SYMBOL', 'NONCONTAM-CHANGE-TIMEFRAME', 'NONCONTAM-LOAD-DATA'].includes(f.cell)),
    'a chartDataLoaded-producing operation must trip the peer mutation guard',
  );
});

test('red controls are themselves GREEN only when the oracle sees the deliberate breakage', () => {
  const controls = runRedControls();
  assert.equal(controls.length, 2);
  for (const control of controls) {
    assert.equal(control.status, 'GREEN', `${control.cell} failed to prove RED`);
    assert.equal(control.report.status, 'RED');
    assert.ok(
      control.report.failures.some((f) => f.reason === control.expectedFailureReason),
      `${control.cell} missed ${control.expectedFailureReason}`,
    );
  }
});

test('parity breadth suite covers release surfaces in CONF-01 and matches multi-realm reference', () => {
  const report = runParityBreadthSuite({ singleMode: 'scoped' });
  assert.equal(report.status, 'GREEN', JSON.stringify(report.failures, null, 2));
  assert.deepEqual(report.surfaces, PARITY_SURFACES);
  assert.deepEqual(PARITY_SURFACES, [
    'drawing-tools',
    'indicators',
    'orders',
    'replay',
    'crosshair-sync',
    'range-sync',
    'keyboard',
    'context-menus',
  ]);
  assert.equal(report.conf01.fourDistinctSymbols, true);
  assert.equal(report.conf01.fourDistinctTimeframes, true);
  assert.equal(report.conf01.mismatchedTimeframesOnly, true);
  assert.equal(report.cells.length, PARITY_SURFACES.length);
  for (const cell of report.cells) {
    assert.equal(cell.status, 'GREEN', cell.cell);
    assert.equal(cell.wholeStateMatchesReference, true, `${cell.cell} diverged from reference`);
    assert.equal(cell.exercised, true, `${cell.cell} did not change product state`);
  }
  assert.match(report.limitation, /real single-realm app/);
});

test('RED fixture: host-routed drawing/order/replay/keyboard/context-menu break parity', () => {
  const controls = runParityBreadthRedControls();
  assert.equal(controls.length, 6);
  assert.deepEqual(controls.map((c) => c.cell), [
    'NC-PARITY-DRAWING-HOST-ROUTED',
    'NC-PARITY-ORDERS-HOST-ROUTED',
    'NC-PARITY-REPLAY-HOST-ROUTED',
    'NC-PARITY-KEYBOARD-HOST-ROUTED',
    'NC-PARITY-CONTEXT-MENU-HOST-ROUTED',
    'NC-PARITY-CROSSHAIR-HOST-ABS-PRICE',
  ]);
  for (const control of controls) {
    assert.equal(control.status, 'GREEN', `${control.cell} failed to prove RED`);
    assert.equal(control.report.status, 'RED');
    assert.ok(
      control.report.failures.some((f) => f.reason === control.expectedFailureReason),
      `${control.cell} missed ${control.expectedFailureReason}: ${JSON.stringify(control.report.failures)}`,
    );
  }
});

test('full release parity non-contamination report is RED until Chart.destroy() lands', () => {
  const report = runReleaseParityNonContaminationOracle();
  assert.equal(report.signature, RELEASE_PARITY_NON_CONTAMINATION_SIGNATURE);
  assert.equal(report.status, 'RED', JSON.stringify({
    status: report.status,
    green: report.green.status,
    parityBreadth: report.parityBreadth.status,
    forbiddenFields: report.forbiddenFields.status,
    readme63: report.readme63.status,
    readme65: report.readme65.status,
    releaseAuthority: report.releaseAuthority,
    forbiddenFailures: report.forbiddenFields.failures,
  }, null, 2));
  assert.equal(report.green.status, 'GREEN');
  assert.equal(report.parityBreadth.status, 'GREEN');
  assert.equal(report.forbiddenFields.status, 'GREEN');
  assert.equal(report.readme63.status, 'RED');
  assert.equal(report.readme65.status, 'GREEN');
  assert.equal(report.redControls.every((c) => c.status === 'GREEN'), true);
  assert.equal(report.breadthRedControls.every((c) => c.status === 'GREEN'), true);
  assert.equal(report.releaseAuthority.stopAuthority, true);
  assert.equal(report.releaseAuthority.destroyStop, true);
  assert.equal(report.releaseAuthority.trapStop, false);
  assert.equal(report.releaseAuthority.productStubBlocksRelease, true);
  assert.match(report.releaseAuthority.statement, /Chart\.destroy\(\) is absent/);
  assert.equal(report.forbiddenFields.tenFieldCells.length, 10);
  assert.deepEqual(report.releaseAuthority.eCompanion.redControls, [
    'RP-INDICATOR-GLOBAL-SLOT',
    'RP-DRAWING-GLOBAL-LAYER',
    'RP-OVERLAY-GLOBAL-LAYER',
  ]);
});
