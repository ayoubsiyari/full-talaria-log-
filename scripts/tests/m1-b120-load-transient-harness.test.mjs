import assert from 'node:assert/strict';
import test from 'node:test';
import {
  B_HOST_TRANSIENT_LOWER_BOUND,
  M1_LOAD_TRANSIENT_SIGNATURE,
  M1_RESIDENT_SCREENSHOTS_SIGNATURE,
  classifyLoadTransient,
  classifyResidentScreenshots,
  runBHostSplitVerdicts,
} from '../m1-b120-load-transient-harness.mjs';

test('M1 split verdict treats settled resident screenshots as PASSED', () => {
  const verdict = classifyResidentScreenshots({
    surface: B_HOST_TRANSIENT_LOWER_BOUND.steady,
    journal: B_HOST_TRANSIENT_LOWER_BOUND.journal,
    buildId: B_HOST_TRANSIENT_LOWER_BOUND.buildId,
  });
  assert.deepEqual(verdict, {
    status: 'PASSED',
    reason: 'resident-screenshot-surface-settled-to-thumbnails',
  });
});

test('M1 load transient is a separate NEW_DEFECT lower bound', () => {
  const verdict = classifyLoadTransient([
    B_HOST_TRANSIENT_LOWER_BOUND.appReady,
    B_HOST_TRANSIENT_LOWER_BOUND.plus1500ms,
    B_HOST_TRANSIENT_LOWER_BOUND.steady,
  ]);
  assert.equal(verdict.status, 'NEW_DEFECT');
  assert.equal(verdict.reason, 'load-transient-full-resolution-images');
  assert.equal(verdict.lowerBound, true);
  assert.equal(verdict.peak.fullResolutionImages, 29);
  assert.equal(verdict.peakDecodedMB, 141.57);
});

test('M1 split report publishes both board verdicts', () => {
  const report = runBHostSplitVerdicts();
  assert.equal(report.signature, M1_LOAD_TRANSIENT_SIGNATURE);
  assert.equal(report.residentSignature, M1_RESIDENT_SCREENSHOTS_SIGNATURE);
  assert.equal(report.residentScreenshots.boardVerdict, 'PASSED');
  assert.equal(report.residentScreenshots.verdict.status, 'PASSED');
  assert.equal(report.loadTransient.boardVerdict, 'NEW_DEFECT');
  assert.equal(report.loadTransient.verdict.status, 'NEW_DEFECT');
  assert.match(report.rendererMemoryLead.statement, /not confirmed/);
});
