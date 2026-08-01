import assert from 'node:assert/strict';
import test from 'node:test';
import {
  M8_LOAD_TOLL_BUDGET_SIGNATURE,
  classifyM8LoadTollBudget,
  runKnownBHostLowerBoundControl,
  runM8LoadTollBudgetGate,
  runSyntheticControls,
} from '../m8-load-toll-budget-gate.mjs';

test('M8 load toll passes only when navigation-start peak is under budget', () => {
  const verdict = classifyM8LoadTollBudget([
    {
      sampleOrigin: 'navigation-start',
      elapsedMs: 0,
      decodedPixelFloorBytes: 20 * 1024 * 1024,
      fullResolutionImages: 0,
    },
  ]);
  assert.equal(verdict.status, 'GREEN');
  assert.equal(verdict.reason, 'load-toll-within-budget-from-navigation-start');
});

test('M8 load toll fails when navigation-start peak exceeds budget', () => {
  const verdict = classifyM8LoadTollBudget([
    {
      sampleOrigin: 'navigation-start',
      elapsedMs: 0,
      decodedPixelFloorBytes: 80 * 1024 * 1024,
      fullResolutionImages: 10,
    },
  ]);
  assert.equal(verdict.status, 'RED');
  assert.equal(verdict.reason, 'load-toll-budget-exceeded');
  assert.equal(verdict.peakDecodedMB, 80);
});

test('M8 load toll rejects app-ready lower bound as acceptance sample', () => {
  const report = runKnownBHostLowerBoundControl();
  assert.equal(report.status, 'RED');
  assert.equal(report.verdict.reason, 'sample-window-not-navigation-start');
  assert.equal(report.verdict.peakDecodedMB, 141.57);
});

test('M8 load toll gate publishes red current and passing controls', async () => {
  const controls = runSyntheticControls();
  assert.equal(controls.every((control) => control.status === 'GREEN'), true);
  const report = await runM8LoadTollBudgetGate();
  assert.equal(report.signature, M8_LOAD_TOLL_BUDGET_SIGNATURE);
  assert.equal(report.status, 'RED');
  assert.equal(report.measurementStamp.barCount, 6242);
  assert.equal(report.measurementStamp.tradeCount, 182);
  assert.equal(report.releaseAuthority.resetDependsOn, true);
  assert.match(report.sampleRequirement, /navigation start/i);
});
