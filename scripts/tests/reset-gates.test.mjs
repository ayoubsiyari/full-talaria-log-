import assert from 'node:assert/strict';
import test from 'node:test';
import { RESET_GATES_SIGNATURE, runResetGates } from '../reset-gates.mjs';

test('reset gates require load toll and allow destroy heap RED only for missing destroy', async () => {
  const report = await runResetGates();
  assert.equal(report.signature, RESET_GATES_SIGNATURE);
  assert.equal(report.status, 'RED');
  assert.equal(report.measurementStamp.barCount, 6242);
  assert.equal(report.measurementStamp.tradeCount, 182);
  assert.equal(report.destroyHeap.measurementStamp.barCount, 6242);
  assert.equal(report.destroyHeap.measurementStamp.tradeCount, 182);
  assert.equal(report.checks.find((check) => check.cell === 'RESET-M8-LOAD-TOLL-BUDGET').status, 'RED');
  const destroyCheck = report.checks.find((check) => check.cell === 'RESET-DESTROY-HEAP-README-6-3');
  assert.equal(destroyCheck.status, 'ALLOWED_RED');
  assert.equal(destroyCheck.reportStatus, 'RED');
  assert.match(destroyCheck.allowance, /R3\/Chart\.destroy\(\) fails by construction/);
});
