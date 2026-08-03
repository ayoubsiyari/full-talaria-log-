import test from 'node:test';
import assert from 'node:assert/strict';
import { assessRateFloor, deliveredRate } from './rate-hold.mjs';

/**
 * The PO's hand measurement is the fixture: speed 10, step 1m, 600 bars per minute. That is 10 bars/s
 * of 1m bars, i.e. 600 market-seconds delivered per wall-second. Every cell below is anchored to it,
 * so a change that breaks the healthy case breaks against a number a human counted.
 */
const HEALTHY = { requestedSpeed: 10, stepSec: 60, expectedMarketSecPerWallSec: 600 };

const rateOver = (marketSecPerWallSec, wallSec = 60) => deliveredRate(
  { atMs: 0, replayTimestamp: 0, replayIndex: 0 },
  { atMs: wallSec * 1000, replayTimestamp: marketSecPerWallSec * wallSec * 1000, replayIndex: 100 },
  { baseTimeframeSec: 60 },
);

test('the PO\'s hand-measured 600 bars per minute passes the floor', () => {
  const v = assessRateFloor({ measured: rateOver(600), ...HEALTHY, windowSec: 60 });
  assert.equal(v.state, 'RATE_FLOOR_MET');
  assert.equal(v.pass, true);
  assert.equal(v.abort, false);
  assert.equal(v.actualMarketSecPerWallSec, 600);
  assert.equal(v.expectedMarketSecPerWallSec, 600);
  assert.equal(v.ratio, 1);
  assert.equal(v.actualBarsPerSecOfStep, 10);
});

test('W1\'s failure aborts — 0.08 bars/s against a requested 10', () => {
  const v = assessRateFloor({ measured: rateOver(0.08 * 60), ...HEALTHY });
  assert.equal(v.state, 'RATE_FLOOR_BREACHED');
  assert.equal(v.abort, true);
  assert.equal(v.actualBarsPerSecOfStep, 0.08);
  assert.match(v.why, /Refusing the arm now rather than holding this rate/);
});

test('the floor is absolute, not a ratio — a perfectly held wrong rate still aborts', () => {
  // RATE-HOLD would pass this arm at hour 10: it is holding exactly. That is the gap this closes.
  const v = assessRateFloor({ measured: rateOver(6), ...HEALTHY });
  assert.equal(v.pass, false);
  assert.equal(v.ratio, 0.01);
});

test('an unreadable step refuses to grade rather than guessing a denominator', () => {
  const v = assessRateFloor({ measured: rateOver(600), requestedSpeed: 10, stepSec: null });
  assert.equal(v.state, 'STEP_UNREADABLE');
  assert.equal(v.abort, true);
  assert.match(v.why, /must not be graded against an assumed denominator/);
});

test('a step that differs from the host timeframe does not manufacture a 60x error', () => {
  // Hourly host panel, 1m step, healthy delivery. Grading bars/s against the HOST tf would read 0.167
  // against 10 and abort a healthy arm; grading in market-seconds reads it correctly.
  const v = assessRateFloor({ measured: rateOver(600), requestedSpeed: 10, stepSec: 60, hostTfSec: 3600 });
  assert.equal(v.pass, true);
  assert.equal(v.ratio, 1);
});

test('an unmeasurable rate aborts, and says so distinctly from a slow one', () => {
  const v = assessRateFloor({ measured: { ok: false, why: 'first sample' }, ...HEALTHY });
  assert.equal(v.state, 'RATE_UNREADABLE');
  assert.equal(v.abort, true);
  assert.notEqual(v.state, 'RATE_FLOOR_BREACHED');
});

test('a backwards playhead is not graded as slow delivery', () => {
  const reseek = deliveredRate(
    { atMs: 0, replayTimestamp: 5_000_000, replayIndex: 500 },
    { atMs: 60_000, replayTimestamp: 1_000_000, replayIndex: 100 },
    { baseTimeframeSec: 60 },
  );
  const v = assessRateFloor({ measured: reseek, ...HEALTHY });
  assert.equal(v.state, 'RATE_UNREADABLE');
  assert.match(v.why, /re-seek or wrap/);
});

test('index-only delivery aborts, because an index cannot tell slow from stalled', () => {
  const idxOnly = deliveredRate(
    { atMs: 0, replayTimestamp: null, replayIndex: 0 },
    { atMs: 60_000, replayTimestamp: null, replayIndex: 600 },
    { baseTimeframeSec: 60 },
  );
  assert.equal(idxOnly.ok, true, 'deliveredRate still reports the index route');
  const v = assessRateFloor({ measured: idxOnly, ...HEALTHY });
  assert.equal(v.state, 'NO_SIMULATED_TIME');
  assert.equal(v.abort, true);
});

test('the floor fraction is honoured at its boundary', () => {
  const at = assessRateFloor({ measured: rateOver(300), ...HEALTHY, floorFraction: 0.5 });
  assert.equal(at.pass, true, 'exactly at the floor passes');
  const under = assessRateFloor({ measured: rateOver(299), ...HEALTHY, floorFraction: 0.5 });
  assert.equal(under.pass, false);
});
