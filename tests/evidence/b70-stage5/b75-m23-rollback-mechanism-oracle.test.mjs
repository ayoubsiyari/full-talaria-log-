import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  applyPoManualDisposition,
  classifyRollbackCell,
  M23_RED,
  summarizeRollbackMechanisms,
} from './b75-m23-rollback-mechanism-oracle.mjs';

const replaySource = fs.readFileSync(path.resolve(
  import.meta.dirname,
  '../../../chart v 1.4/chart/modules/replay-system.js',
), 'utf8');

const methodBody = (name, nextName) => {
  const start = replaySource.indexOf(`    ${name}(`);
  const end = replaySource.indexOf(`    ${nextName}(`, start + 1);
  assert.ok(start >= 0 && end > start, `source methods ${name}/${nextName} must remain discoverable`);
  return replaySource.slice(start, end);
};

const cutoff = 2_000;
const before = {
  startingBalance: 10_000,
  trades: [{ id: 1, entryTime: 1_000 }, { id: 2, entryTime: 2_100 }],
  history: [
    { id: 1, entryTime: 1_000, exitTime: 1_500, pnl: 100 },
    { id: 2, entryTime: 2_100, exitTime: 2_500, pnl: -50 },
  ],
  balance: 10_050,
  artifacts: [{ id: 'entry-1', time: 1_000 }, { id: 'exit-2', time: 2_500 }],
  identityCounter: 3,
};
const restored = {
  trades: [{ id: 1, entryTime: 1_000 }],
  history: [{ id: 1, entryTime: 1_000, exitTime: 1_500, pnl: 100 }],
  balance: 10_100,
  artifacts: [{ id: 'entry-1', time: 1_000 }],
  identityCounter: 3,
};

test('Rayan mechanism 1: replay step-back is RED when only the playhead moves', () => {
  const result = classifyRollbackCell({
    mechanism: 'replay-step-back', cutoff, before, after: before,
  });
  assert.equal(result.verdict, M23_RED.STEP_BACK_NO_LEDGER_RESTORE);
  assert.deepEqual(result.restored, {
    trades: false, history: false, balance: false, artifacts: false,
  });
});

test('Rayan mechanism 2: active replay-handle drag is independently RED', () => {
  const result = classifyRollbackCell({
    mechanism: 'active-replay-handle-drag', cutoff, before, after: before,
  });
  assert.equal(result.verdict, M23_RED.ACTIVE_HANDLE_DRAG_NO_LEDGER_RESTORE);
});

test('clean replay-bar cut is the positive restoration control', () => {
  const result = classifyRollbackCell({
    mechanism: 'clean-replay-bar-cut', cutoff, before, after: restored,
  });
  assert.equal(result.verdict, 'GREEN_EXACT_CUT_RESTORE');
  assert.deepEqual(result.restored, {
    trades: true, history: true, balance: true, artifacts: true,
  });
});

test('identity counter is assessed independently from economic restoration', () => {
  const monotonic = classifyRollbackCell({
    mechanism: 'clean-replay-bar-cut', cutoff, before, after: restored,
  });
  assert.equal(monotonic.identity.monotonic, true);
  assert.equal(monotonic.identity.reused, false);
  assert.equal(monotonic.verdict, 'GREEN_EXACT_CUT_RESTORE');
});

test('matrix preserves separate mechanisms and states the proposed PO rule', () => {
  const matrix = summarizeRollbackMechanisms([
    { mechanism: 'replay-step-back', cutoff, before, after: before },
    { mechanism: 'active-replay-handle-drag', cutoff, before, after: before },
    { mechanism: 'clean-replay-bar-cut', cutoff, before, after: restored },
  ]);
  assert.equal(matrix.verdict, 'RED');
  assert.match(matrix.identityPolicyProposal, /monotonic audit identities/);
  assert.equal(matrix.cells[2].oracle.verdict, 'GREEN_EXACT_CUT_RESTORE');
});

test('read-only source audit maps each gesture to its actual product call path', () => {
  const step = methodBody('stepBackward', 'normalizeSpeed');
  const seek = methodBody('seekTo', 'goToReplayTimestamp');
  const cut = methodBody('applyReplayCutToWallClock', 'handleGoBackClick');
  assert.doesNotMatch(step, /forceCloseAllOrders/);
  assert.doesNotMatch(seek, /forceCloseAllOrders/);
  assert.match(cut, /forceCloseAllOrders\(orderCutoff\)/);
});

test('PO manual evidence overrides M23 product disposition when all normal doors are clean', () => {
  const diagnostic = summarizeRollbackMechanisms([
    { mechanism: 'replay-step-back', cutoff, before, after: before },
    { mechanism: 'active-replay-handle-drag', cutoff, before, after: before },
    { mechanism: 'clean-replay-bar-cut', cutoff, before, after: restored },
  ]);
  const disposition = applyPoManualDisposition(diagnostic, {
    stepBack: 'clean',
    activeReplayHandleDrag: 'clean',
    cleanReplayBarCut: 'clean',
    source: 'PO manual evidence',
  });
  assert.equal(diagnostic.verdict, 'RED');
  assert.equal(disposition.diagnosticOracleDisposition, 'OVERRIDDEN_BY_PO_MANUAL_EVIDENCE');
  assert.equal(disposition.productDisposition, 'NO_M23_PRODUCT_CHANGE');
});
