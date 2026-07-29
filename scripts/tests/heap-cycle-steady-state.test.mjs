import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeSteadyStateRetention } from '../lib/heap-cycle-memory.mjs';

const MB = 1024 * 1024;

test('unit: one-time warm-up then flat is not retention', () => {
  // +350MB expanding four panels once, then nothing. Naive mean = 58MB/cycle.
  const deltas = [350 * MB, 0, 0, 0, 0, 0];
  const got = summarizeSteadyStateRetention(deltas);
  assert.equal(got.ok, true);
  assert.equal(got.warmupBytes, 350 * MB);
  assert.equal(got.steadyMeanBytes, 0);
  assert.equal(got.positiveRetention, false);
});

test('unit: GC-timing noise with negative excursions is not retention', () => {
  // Observed live shape: floors swing ±100MB on GC timing, mean below its own noise.
  const deltas = [173 * MB, -19 * MB, 22 * MB, -85 * MB, 121 * MB, -116 * MB];
  const got = summarizeSteadyStateRetention(deltas);
  assert.equal(got.positiveRetention, false);
  assert.ok(got.steadyMeanBytes < 0, 'steady mean is negative');
  assert.ok(got.steadySdBytes > 50 * MB, 'noise is large');
});

test('unit: consistent per-cycle growth clears the noise floor', () => {
  const deltas = [40 * MB, 13 * MB, 12.5 * MB, 13.2 * MB, 12.8 * MB, 13.1 * MB];
  const got = summarizeSteadyStateRetention(deltas);
  assert.equal(got.positiveRetention, true);
  assert.ok(Math.abs(got.steadyMeanBytes / MB - 12.92) < 0.1);
  assert.ok(got.steadyStandardErrorBytes < got.steadyMeanBytes);
});

test('unit: large mean that is pure noise does not count as retention', () => {
  // Mean +20MB but sd ~140MB over 5 cycles: standard error ~63MB > mean.
  const deltas = [0, 200 * MB, -180 * MB, 150 * MB, -120 * MB, 50 * MB];
  const got = summarizeSteadyStateRetention(deltas);
  assert.ok(got.steadyMeanBytes > 0, 'mean is positive');
  assert.equal(got.positiveRetention, false, 'but it is inside the noise');
});

test('unit: two-cycle warm-up then a flat plateau is not retention', () => {
  // Live identical-dataset control: expansion spans two cycles, then ~221MB flat.
  const deltas = [53.66 * MB, 91.37 * MB, 1.71 * MB, -1.06 * MB, 5.66 * MB, -5.46 * MB];
  const got = summarizeSteadyStateRetention(deltas);
  assert.ok(got.steadyMeanBytes > 0, 'cycle-2 warm-up drags the steady mean positive');
  assert.equal(got.positiveRetention, false, 'but the tail is flat, so nothing is retained');
  assert.ok(Math.abs(got.tailMeanBytes / MB) < 1);
});

test('unit: monotonic growth that persists to the tail is retention', () => {
  // Live distinct-dataset arm: four independent datasets, forced-GC floors.
  const deltas = [27.92 * MB, 33.43 * MB, 19.16 * MB, 20.50 * MB, 24.49 * MB, 18.81 * MB];
  const got = summarizeSteadyStateRetention(deltas);
  assert.equal(got.positiveRetention, true);
  assert.ok(got.tailMeanBytes / MB > 15, 'still growing at the end of the run');
});

test('unit: too few cycles cannot separate warm-up from steady state', () => {
  const got = summarizeSteadyStateRetention([100 * MB, 5 * MB]);
  assert.equal(got.ok, false);
  assert.match(got.reason, /≥3 cycles/);
  assert.equal(got.positiveRetention, false);
});

test('unit: missing deltas cannot pass', () => {
  const got = summarizeSteadyStateRetention([10 * MB, null, 5 * MB, 5 * MB]);
  assert.equal(got.ok, false);
  assert.equal(got.positiveRetention, false);
});

test('unit: empty input cannot pass', () => {
  assert.equal(summarizeSteadyStateRetention([]).ok, false);
});
