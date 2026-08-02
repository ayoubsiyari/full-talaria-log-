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
import { assessCommonWindow, assertCommonWindow } from './lib/heap-cycle-dataset-config.mjs';

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
