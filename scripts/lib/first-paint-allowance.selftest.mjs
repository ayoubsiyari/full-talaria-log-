import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveAllowance, SCALING_MIN_FRACTION, ATTRIBUTION_MIN_FRACTION } from './first-paint-allowance.mjs';

/** A world where the transient really is construction cost: it scales with panels and with bars. */
const SCALING_WORLD = [
  { id: 'V1', panels: 4, residentBars: 7400, transientMB: 30 + 4 * 12 + 4 * 7400 * 0.004 },
  { id: 'V2', panels: 1, residentBars: 7400, transientMB: 30 + 1 * 12 + 1 * 7400 * 0.004 },
  { id: 'V3', panels: 4, residentBars: 1000, transientMB: 30 + 4 * 12 + 4 * 1000 * 0.004 },
];

test('a scaling transient yields an allowance ABOVE the bar, built only from attributed terms', () => {
  const v = deriveAllowance(SCALING_WORLD, { settledBarMB: 1024 });
  assert.equal(v.state, 'DERIVED');
  assert.equal(v.attributed.bundleParseMB, 30);
  assert.equal(v.attributed.initialRasterMB, 48, '4 panels x 12 MB');
  assert.equal(v.attributed.datasetDecodeMB, 118.4, '4 panels x 7400 bars x 4 KB');
  assert.equal(v.allowanceMB, 1220.4);
  assert.equal(v.excludedUnattributedMB, 0);
});

test('FALSIFIER 1 — a transient that does NOT move with bars or panels kills the allowance entirely', () => {
  // Booting at 1,000 bars costs what 7,400 costs, and one panel costs what four cost.
  const flatWorld = [
    { id: 'V1', panels: 4, residentBars: 7400, transientMB: 180 },
    { id: 'V2', panels: 1, residentBars: 7400, transientMB: 180 },
    { id: 'V3', panels: 4, residentBars: 1000, transientMB: 180 },
  ];
  const v = deriveAllowance(flatWorld);
  assert.equal(v.state, 'FALSIFIED_NOT_CONSTRUCTION_COST');
  assert.equal(v.allowanceMB, null, 'no number is produced; that is the point of the falsifier');
  assert.match(v.why, /NOT construction cost/);
  assert.match(v.why, /defect to fix rather than a budget to grant/);
});

test('FALSIFIER 2 — an attribution shortfall reports the gap and does NOT widen the allowance', () => {
  // Terms solved from three points always fit those three exactly, so the shortfall is injected the
  // way it would really arrive: the reference variant costs more than the model built from the others.
  const world = [
    { id: 'V1', panels: 4, residentBars: 7400, transientMB: 400 },
    { id: 'V2', panels: 1, residentBars: 7400, transientMB: 395 },
    { id: 'V3', panels: 4, residentBars: 1000, transientMB: 398 },
  ];
  const v = deriveAllowance(world);
  assert.ok(['FALSIFIED_ATTRIBUTION_SHORTFALL', 'FALSIFIED_NOT_CONSTRUCTION_COST'].includes(v.state));
  assert.equal(v.allowanceMB, null);
});

test('the allowance never includes unattributed transient — the anti-ratification rule', () => {
  const v = deriveAllowance(SCALING_WORLD, { settledBarMB: 1024 });
  const sum = v.attributed.bundleParseMB + v.attributed.initialRasterMB + v.attributed.datasetDecodeMB;
  assert.equal(v.allowanceMB, 1024 + Math.round(sum * 10) / 10);
  assert.ok(v.allowanceMB < 1024 + v.referenceVariant.transientMB + 0.05,
    'the allowance can never exceed bar + measured transient');
});

test('a design that does not separate panels from bars is refused, not fitted', () => {
  const degenerate = [
    { id: 'V1', panels: 4, residentBars: 7400, transientMB: 200 },
    { id: 'V2', panels: 4, residentBars: 7400, transientMB: 201 },
    { id: 'V3', panels: 4, residentBars: 7400, transientMB: 199 },
  ];
  const v = deriveAllowance(degenerate);
  assert.equal(v.state, 'DEGENERATE_DESIGN');
  assert.match(v.why, /the design must change/);
});

test('fewer than three variants cannot solve three terms', () => {
  const v = deriveAllowance(SCALING_WORLD.slice(0, 2));
  assert.equal(v.state, 'INSUFFICIENT_VARIANTS');
  assert.equal(v.allowanceMB, null);
});

test('the two falsifier thresholds are the ones stated to the PO in advance', () => {
  assert.equal(SCALING_MIN_FRACTION, 0.30);
  assert.equal(ATTRIBUTION_MIN_FRACTION, 0.70);
});
