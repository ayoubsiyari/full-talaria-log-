import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessRateFloor, deliveredRate, RATE_TARGET_BARS_PER_SEC, RATE_FLOOR_BARS_PER_SEC,
} from './rate-hold.mjs';

/**
 * The PO's hand measurement is the fixture: speed 10, step 1m, 600 bars per minute = 10 bars/s.
 * Every cell is anchored to it, so a change that breaks the healthy case breaks against a number a
 * human counted rather than against an instrument's opinion of itself.
 */
const STEP_1M = 60;

/** Build a two-sample pair that delivers exactly `barsPerSec` bars of `stepSec`. */
const armDelivering = (barsPerSec, { stepSec = STEP_1M, wallSec = 60 } = {}) => deliveredRate(
  { atMs: 0, replayTimestamp: 0, replayIndex: 0 },
  { atMs: wallSec * 1000, replayTimestamp: barsPerSec * stepSec * wallSec * 1000, replayIndex: 100 },
  { baseTimeframeSec: 3600, stepSec },
);

test('the target is 10 bars/s and the floor is 8', () => {
  assert.equal(RATE_TARGET_BARS_PER_SEC, 10);
  assert.equal(RATE_FLOOR_BARS_PER_SEC, 8);
});

test('the PO\'s hand-measured 600 bars per minute is 10 bars/s and passes', () => {
  const m = armDelivering(10);
  assert.equal(m.barsPerSec, 10);
  assert.equal(m.marketSecPerWallSec, 600);
  const v = assessRateFloor({ measured: m, stepSec: STEP_1M, windowSec: 60 });
  assert.equal(v.state, 'RATE_FLOOR_MET');
  assert.equal(v.abort, false);
  assert.equal(v.actualBarsPerSec, 10);
  assert.equal(v.unit, 'bars per second of the step');
});

/**
 * The failure that cost the night, as one cell. Same governed build, two step sizes: the OLD primary
 * unit reports 10 and 600 and both are "correct"; the new primary reports 10 both times.
 */
test('bars/s of the step is invariant where market-seconds is not — 0.08 vs 602, resolved', () => {
  const at1s = armDelivering(10, { stepSec: 1 });
  const at60s = armDelivering(10, { stepSec: 60 });
  assert.equal(at1s.marketSecPerWallSec, 10, 'market-seconds moves with the step');
  assert.equal(at60s.marketSecPerWallSec, 600, 'market-seconds moves with the step');
  assert.equal(at1s.barsPerSec, 10, 'bars/s of the step does not');
  assert.equal(at60s.barsPerSec, 10, 'bars/s of the step does not');
  assert.equal(assessRateFloor({ measured: at1s, stepSec: 1 }).pass, true);
  assert.equal(assessRateFloor({ measured: at60s, stepSec: 60 }).pass, true);
});

test('W1\'s 0.08 bars/s aborts', () => {
  const v = assessRateFloor({ measured: armDelivering(0.08), stepSec: STEP_1M });
  assert.equal(v.state, 'RATE_FLOOR_BREACHED');
  assert.equal(v.abort, true);
  assert.equal(v.actualBarsPerSec, 0.08);
  assert.match(v.why, /against a floor of 8 and a target of 10/);
});

test('the floor is absolute, not a ratio — a perfectly held wrong rate still aborts', () => {
  // RATE-HOLD would pass this arm at hour 10: it is holding exactly. That is the gap this closes.
  const v = assessRateFloor({ measured: armDelivering(0.1), stepSec: STEP_1M });
  assert.equal(v.pass, false);
});

test('the floor bites between 8 and 10, where a ratio-only check would not', () => {
  assert.equal(assessRateFloor({ measured: armDelivering(8), stepSec: STEP_1M }).pass, true, 'exactly at the floor passes');
  assert.equal(assessRateFloor({ measured: armDelivering(7.9), stepSec: STEP_1M }).pass, false);
  const under = assessRateFloor({ measured: armDelivering(7.9), stepSec: STEP_1M });
  assert.equal(under.fractionOfTarget, 0.79);
});

test('no bars/s is emitted without a step, rather than one derived from the timeframe', () => {
  const m = deliveredRate(
    { atMs: 0, replayTimestamp: 0, replayIndex: 0 },
    { atMs: 60_000, replayTimestamp: 600 * 60 * 1000, replayIndex: 100 },
    { baseTimeframeSec: 3600 },
  );
  assert.equal(m.barsPerSec, null);
  assert.equal(m.barsPerSecDenominatorSec, null);
  assert.match(m.barsPerSecWhy, /must not be substituted/);
  assert.equal(m.marketSecPerWallSec, 600, 'market-seconds is still recorded');
  assert.equal(m.barsPerSecOfTimeframe, 0.1667, 'the panel cadence is available, separately named');
});

test('an unreadable step refuses to grade rather than guessing a denominator', () => {
  const v = assessRateFloor({ measured: armDelivering(10), stepSec: null });
  assert.equal(v.state, 'STEP_UNREADABLE');
  assert.equal(v.abort, true);
  assert.match(v.why, /must not be graded against an assumed denominator/);
});

test('a rate measured against one denominator cannot be graded against another', () => {
  const v = assessRateFloor({ measured: armDelivering(10, { stepSec: 1 }), stepSec: 60 });
  assert.equal(v.state, 'DENOMINATOR_MISMATCH');
  assert.equal(v.abort, true);
  assert.match(v.why, /0\.08 and 602 on the same day/);
});

test('an hourly panel stepping 1m does not manufacture a 60x error', () => {
  // Host timeframe 3600s, step 60s, healthy. Grading on the timeframe would read 0.167 and abort.
  const m = armDelivering(10, { stepSec: 60 });
  assert.equal(m.barsPerSecOfTimeframe, 0.1667);
  assert.equal(assessRateFloor({ measured: m, stepSec: 60, hostTfSec: 3600 }).pass, true);
});

test('an unmeasurable rate aborts, distinctly from a slow one', () => {
  const v = assessRateFloor({ measured: { ok: false, why: 'first sample' }, stepSec: STEP_1M });
  assert.equal(v.state, 'RATE_UNREADABLE');
  assert.notEqual(v.state, 'RATE_FLOOR_BREACHED');
});

test('a backwards playhead is not graded as slow delivery', () => {
  const reseek = deliveredRate(
    { atMs: 0, replayTimestamp: 5_000_000, replayIndex: 500 },
    { atMs: 60_000, replayTimestamp: 1_000_000, replayIndex: 100 },
    { baseTimeframeSec: 60, stepSec: STEP_1M },
  );
  const v = assessRateFloor({ measured: reseek, stepSec: STEP_1M });
  assert.equal(v.state, 'RATE_UNREADABLE');
  assert.match(v.why, /re-seek or wrap/);
});

test('index-only delivery aborts, because an index cannot tell slow from stalled', () => {
  const idxOnly = deliveredRate(
    { atMs: 0, replayTimestamp: null, replayIndex: 0 },
    { atMs: 60_000, replayTimestamp: null, replayIndex: 600 },
    { baseTimeframeSec: 60, stepSec: STEP_1M },
  );
  assert.equal(idxOnly.ok, true, 'deliveredRate still reports the index route');
  const v = assessRateFloor({ measured: idxOnly, stepSec: STEP_1M });
  assert.equal(v.state, 'NO_SIMULATED_TIME');
  assert.equal(v.abort, true);
});

test('barsPerSec x its denominator reconstructs market-seconds, so the two can never drift', () => {
  const m = armDelivering(10, { stepSec: 60 });
  assert.equal(+(m.barsPerSec * m.barsPerSecDenominatorSec).toFixed(4), m.marketSecPerWallSec);
});
