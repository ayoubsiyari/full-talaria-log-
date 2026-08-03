/**
 * Self-test for CONF01-COMMON-WINDOW-V1 — no host, no browser, no network.
 * node --test scripts/conf01-common-window.selftest.mjs
 *
 * The headline case is A's measured seed, replayed from the numbers in
 * docs/plan3/A-TO-C-CONF01-COMMON-WINDOW.md, so the gate is proven RED on the known-defective
 * input rather than only green on a happy path.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessCommonWindow,
  assertCommonWindow,
  computeRequiredRunwayMs,
  decideCommonWindowAction,
} from './lib/heap-cycle-dataset-config.mjs';

const T = (iso) => Date.parse(iso);
const DAY = 86_400_000;

/** A's table: 1m host on 677 in June, three peers on Apr/May files. */
const A_MEASURED_SEED = {
  hostSessionStartMs: T('2026-06-18T00:00:00Z'),
  panels: [
    { panelId: 'A', timeframe: '1m', fileId: 677, dataFirstMs: T('2026-06-18T00:00:00Z'), dataLastMs: T('2026-06-23T00:00:00Z') },
    { panelId: 'B', timeframe: '5m', fileId: 673, dataFirstMs: T('2026-05-11T00:00:00Z'), dataLastMs: T('2026-05-18T00:00:00Z') },
    { panelId: 'C', timeframe: '15m', fileId: 670, dataFirstMs: T('2026-04-17T00:00:00Z'), dataLastMs: T('2026-05-18T00:00:00Z') },
    { panelId: 'D', timeframe: '1h', fileId: 669, dataFirstMs: T('2026-04-17T00:00:00Z'), dataLastMs: T('2026-05-18T00:00:00Z') },
  ],
};

/** same-symbol: one file, four timeframe views, so the window is shared by construction. */
const SAME_SYMBOL_SEED = {
  hostSessionStartMs: T('2026-06-19T00:00:00Z'),
  panels: ['1m', '5m', '15m', '1h'].map((tf, i) => ({
    panelId: 'ABCD'[i], timeframe: tf, fileId: 677,
    dataFirstMs: T('2026-06-18T00:00:00Z'), dataLastMs: T('2026-06-23T00:00:00Z'),
  })),
};

test('RED on A\'s measured seed — the defect this gate exists for', () => {
  const r = assessCommonWindow(A_MEASURED_SEED);
  assert.equal(r.state, 'NO_COMMON_WINDOW');
  assert.equal(r.ok, false);
  assert.equal(r.offendingPanels.length, 3, 'the three peers, not the host');
  assert.deepEqual(r.offendingPanels.map((p) => p.timeframe), ['5m', '15m', '1h']);
  // Host starts 31 days after the peers' data ends.
  assert.equal(r.offendingPanels[0].shortByDays, 31);
  assert.match(r.reason, /do not hold the host session start/);
});

test('GREEN on same-symbol, and it reports the shared window it verified', () => {
  const r = assessCommonWindow(SAME_SYMBOL_SEED);
  assert.equal(r.state, 'COMMON_WINDOW_OK');
  assert.equal(r.ok, true);
  assert.equal(r.intersectionDays, 5);
  assert.equal(assertCommonWindow(r), r, 'a passing assessment is returned, not thrown');
});

test('distinct fileIds cannot rescue a broken window — identity is not calendar', () => {
  // Four genuinely distinct (fileId, tf) pairs, which assessDatasetDistinctness would pass.
  const r = assessCommonWindow(A_MEASURED_SEED);
  const ids = new Set(A_MEASURED_SEED.panels.map((p) => p.fileId));
  assert.equal(ids.size, 4, 'the seed really is four distinct files');
  assert.equal(r.ok, false, 'and it is still refused, because overlap is the requirement');
});

test('UNREADABLE is its own state and must not be reported as a window failure', () => {
  const r = assessCommonWindow({
    hostSessionStartMs: T('2026-06-18T00:00:00Z'),
    panels: [
      { panelId: 'A', timeframe: '1m', dataFirstMs: T('2026-06-18T00:00:00Z'), dataLastMs: T('2026-06-23T00:00:00Z') },
      { panelId: 'B', timeframe: '5m', dataFirstMs: null, dataLastMs: null },
    ],
  });
  assert.equal(r.state, 'WINDOW_UNREADABLE');
  assert.equal(r.ok, false);
  assert.notEqual(r.state, 'NO_COMMON_WINDOW');
  assert.match(r.reason, /broken read, not a statement about the data/);
});

test('a zero or empty-string timestamp is unreadable, not epoch', () => {
  const r = assessCommonWindow({
    hostSessionStartMs: T('2026-06-18T00:00:00Z'),
    panels: [{ panelId: 'A', timeframe: '1m', dataFirstMs: '', dataLastMs: undefined }],
  });
  assert.equal(r.state, 'WINDOW_UNREADABLE');
});

test('an unreadable host session start is its own state', () => {
  const r = assessCommonWindow({ hostSessionStartMs: null, panels: SAME_SYMBOL_SEED.panels });
  assert.equal(r.state, 'NO_HOST_SESSION_START');
  assert.equal(r.ok, false);
});

test('no panels at all fails closed rather than passing vacuously', () => {
  const r = assessCommonWindow({ hostSessionStartMs: T('2026-06-18T00:00:00Z'), panels: [] });
  assert.equal(r.ok, false);
  assert.equal(r.state, 'WINDOW_UNREADABLE');
});

test('covering the start but running off the end is INSUFFICIENT_RUNWAY, not OK', () => {
  const r = assessCommonWindow({ ...SAME_SYMBOL_SEED, requiredRunwayMs: 30 * DAY });
  assert.equal(r.state, 'INSUFFICIENT_RUNWAY');
  assert.equal(r.ok, false);
  assert.match(r.reason, /run off the common window/);
});

test('the boundary is inclusive — a start exactly on the last bar still holds it', () => {
  const r = assessCommonWindow({
    hostSessionStartMs: T('2026-06-23T00:00:00Z'),
    panels: SAME_SYMBOL_SEED.panels,
  });
  assert.equal(r.state, 'COMMON_WINDOW_OK');
});

test('assertCommonWindow fails closed and names the state and the seed fix', () => {
  const r = assessCommonWindow(A_MEASURED_SEED);
  assert.throws(() => assertCommonWindow(r), (e) => {
    assert.equal(e.name, 'CommonWindowRefusal');
    assert.equal(e.state, 'NO_COMMON_WINDOW');
    assert.match(e.message, /Fix the seed/);
    assert.match(e.message, /Do NOT relabel the arm as one-panel/);
    return true;
  });
});

test('an unreadable refusal points at the read, not at the seed', () => {
  const r = assessCommonWindow({ hostSessionStartMs: 1, panels: [{ panelId: 'A' }] });
  assert.throws(() => assertCommonWindow(r), (e) => {
    assert.match(e.message, /Fix the range read/);
    assert.doesNotMatch(e.message, /Fix the seed/);
    return true;
  });
});

// ─── runway: the second half of A's exhaustion finding ──────────────────────

test('computeRequiredRunwayMs is the product arithmetic — bars/s x seconds/bar x wall', () => {
  // One wall hour at 10 bars/s on 1m bars = 3600 x 10 x 60 market seconds = 25 days.
  const ms = computeRequiredRunwayMs({ wallMs: 3_600_000, barsPerSecond: 10, barSeconds: 60 });
  assert.equal(ms, 2_160_000_000);
  assert.equal(ms / DAY, 25);
});

test('the soak default is quantified, and it is the exhaustion finding: 250 days for a 10h arm', () => {
  const ms = computeRequiredRunwayMs({ wallMs: 10 * 3_600_000, barsPerSecond: 10, barSeconds: 60 });
  assert.equal(ms / DAY, 250, 'ten hours at speed 10 on 1m bars consumes 250 days of market time');
});

test('a slower arm needs proportionally less, so the knob is actionable', () => {
  const fast = computeRequiredRunwayMs({ wallMs: 3_600_000, barsPerSecond: 10, barSeconds: 60 });
  const slow = computeRequiredRunwayMs({ wallMs: 3_600_000, barsPerSecond: 1, barSeconds: 60 });
  assert.equal(fast / slow, 10);
});

test('degenerate and unreadable inputs are told apart — 0 is an answer, null is not', () => {
  assert.equal(computeRequiredRunwayMs({ wallMs: 0, barsPerSecond: 10, barSeconds: 60 }), 0);
  assert.equal(computeRequiredRunwayMs({ wallMs: 3_600_000, barsPerSecond: 0, barSeconds: 60 }), 0);
  assert.equal(computeRequiredRunwayMs({ wallMs: 'x', barsPerSecond: 10, barSeconds: 60 }), null);
  assert.equal(computeRequiredRunwayMs({}), null);
});

test('the wrap count is reported, because an N-hour run over one week is not N hours of data', () => {
  // SAME_SYMBOL_SEED holds 18–23 Jun and starts on the 19th: 4 days of runway ahead.
  const r = assessCommonWindow({ ...SAME_SYMBOL_SEED, requiredRunwayMs: 20 * DAY });
  assert.equal(r.state, 'INSUFFICIENT_RUNWAY');
  assert.equal(r.runwayAheadDays, 4);
  assert.equal(r.wrapsExpected, 5, '20 days required over 4 days available');
  assert.equal(r.runwayDeficitMs, 16 * DAY);
  assert.match(r.reason, /re-measure the same market data/);
});

test('runway figures are reported on the PASSING case too, so headroom is visible', () => {
  const r = assessCommonWindow({ ...SAME_SYMBOL_SEED, requiredRunwayMs: 2 * DAY });
  assert.equal(r.state, 'COMMON_WINDOW_OK');
  assert.equal(r.ok, true);
  assert.equal(r.runwayAheadDays, 4);
  assert.equal(r.requiredRunwayMs, 2 * DAY);
  assert.equal(r.runwayDeficitMs, 0);
  assert.equal(r.wrapsExpected, 0.5, 'half a pass — the run uses half the available window');
});

test('runway is graded ahead of the host start, not across the whole window', () => {
  // Start on the last bar: the window is 5 days wide but 0 days lie ahead.
  const r = assessCommonWindow({
    hostSessionStartMs: T('2026-06-23T00:00:00Z'),
    panels: SAME_SYMBOL_SEED.panels,
    requiredRunwayMs: DAY,
  });
  assert.equal(r.state, 'INSUFFICIENT_RUNWAY');
  assert.equal(r.runwayAheadDays, 0);
  assert.equal(r.intersectionDays, 5, 'the window is still 5 days wide; none of it is ahead');
  assert.equal(r.wrapsExpected, null, 'no runway means no meaningful wrap count, not Infinity');
});

test('overlap failure outranks runway failure — the fatal one must not be masked', () => {
  const r = assessCommonWindow({ ...A_MEASURED_SEED, requiredRunwayMs: 500 * DAY });
  assert.equal(r.state, 'NO_COMMON_WINDOW', 'not INSUFFICIENT_RUNWAY');
});

// ─── the wiring itself, tested without a browser ────────────────────────────

test('A\'s broken seed REFUSES under either policy — runway leniency must not reach overlap', () => {
  const r = assessCommonWindow({ ...A_MEASURED_SEED, requiredRunwayMs: 500 * DAY });
  for (const runwayPolicy of ['declare', 'require']) {
    assert.equal(decideCommonWindowAction({ assessment: r, runwayPolicy }).action, 'REFUSE');
  }
});

test('a short runway DECLARES by default and REFUSES on demand', () => {
  const r = assessCommonWindow({ ...SAME_SYMBOL_SEED, requiredRunwayMs: 20 * DAY });
  const declared = decideCommonWindowAction({ assessment: r, runwayPolicy: 'declare' });
  assert.equal(declared.action, 'DECLARE');
  assert.equal(declared.wrapsExpected, 5);
  assert.equal(decideCommonWindowAction({ assessment: r, runwayPolicy: 'require' }).action, 'REFUSE');
});

test('a healthy seed PROCEEDs', () => {
  const r = assessCommonWindow({ ...SAME_SYMBOL_SEED, requiredRunwayMs: 2 * DAY });
  assert.equal(decideCommonWindowAction({ assessment: r }).action, 'PROCEED');
});

test('an unreadable range REFUSES even under declare — a broken read is never tolerable', () => {
  const r = assessCommonWindow({ hostSessionStartMs: 1, panels: [{ panelId: 'A' }] });
  assert.equal(decideCommonWindowAction({ assessment: r, runwayPolicy: 'declare' }).action, 'REFUSE');
});

test('a missing assessment refuses rather than defaulting open', () => {
  assert.equal(decideCommonWindowAction({}).action, 'REFUSE');
  assert.equal(decideCommonWindowAction({ assessment: null }).action, 'REFUSE');
  assert.equal(decideCommonWindowAction().action, 'REFUSE');
});

test('the soak default trips the declaration on a realistic week-long file', () => {
  // What the arm actually asks for, against what a file actually holds.
  const required = computeRequiredRunwayMs({ wallMs: 10 * 3_600_000, barsPerSecond: 10, barSeconds: 60 });
  const r = assessCommonWindow({ ...SAME_SYMBOL_SEED, requiredRunwayMs: required });
  const d = decideCommonWindowAction({ assessment: r, runwayPolicy: 'declare' });
  assert.equal(d.action, 'DECLARE');
  assert.equal(r.runwayAheadDays, 4);
  assert.equal(d.wrapsExpected, 62.5, 'the ten-hour arm laps a four-day window sixty-two times');
});
