import test from 'node:test';
import assert from 'node:assert/strict';
import { threeRows, assessAgainstBar, BAR_MB } from './bar-basis.mjs';

/** CONF-01 b120 first paint, as measured: total 1342.9, page renderer 931.6, gpu 246.1, browser 60.1. */
const CONF01_FIRST_PAINT = {
  footprintTotalMB: 1342.9,
  footprintByType: { renderer: 989.0, gpu: 246.1, browser: 60.1, other: 47.7 },
  pageRendererMB: 931.6,
  rendererProcesses: 4,
};

/** The b126 canonical floor: settled over 600 s rungs. */
const SETTLED_FLOOR = {
  footprintTotalMB: 674.9,
  footprintByType: { renderer: 460.0, gpu: 150.0, browser: 40.0, other: 24.9 },
  pageRendererMB: 403.0,
  rendererProcesses: 4,
};

test('the three rows reproduce the measured CONF-01 split', () => {
  const r = threeRows(CONF01_FIRST_PAINT);
  assert.equal(r.authoredMB, 931.6);
  assert.equal(r.causedMB, 246.1);
  assert.equal(r.fixedBreakdown.spareRenderersMB, 57.4, 'renderer sum minus the page renderer');
  assert.equal(r.fixedMB, 165.2, 'spare renderers + browser + utility');
  assert.equal(r.rowsSumMB, 1342.9);
  assert.equal(r.unsplitMB, 0, 'the three rows must account for the whole total or the split is lying');
});

test('RED — the bar does not bind at first paint, and an unsettled reading is refused not graded', () => {
  const v = assessAgainstBar(CONF01_FIRST_PAINT, { settled: false, settleMs: 3000, what: 'CONF-01 first paint' });
  assert.equal(v.barState, 'BAR_NOT_APPLICABLE_UNSETTLED');
  assert.equal(v.meetsBar, null, 'this is exactly how 1,159.7 came to be compared against a settled bar');
  assert.equal(v.overBarMB, null);
});

test('a settled reading under the bar reads WITHIN_BAR with all three rows in the sentence', () => {
  const v = assessAgainstBar(SETTLED_FLOOR, { settled: true });
  assert.equal(v.barState, 'WITHIN_BAR');
  assert.equal(v.meetsBar, true);
  assert.equal(v.overBarMB, -349.1);
  assert.match(v.reason, /authored 403.*caused 150.*fixed/);
});

test('a settled reading over the bar names the breach', () => {
  const over = { ...SETTLED_FLOOR, footprintTotalMB: 1032.0 };
  const v = assessAgainstBar(over, { settled: true });
  assert.equal(v.barState, 'OVER_BAR');
  assert.equal(v.overBarMB, 8);
  assert.equal(v.meetsBar, false);
});

test('the fixed row is reported as harness-conditional and never deducted', () => {
  const r = threeRows(CONF01_FIRST_PAINT);
  assert.equal(r.harnessConditional, true);
  assert.match(r.harnessNote, /do not deduct it/);
  const v = assessAgainstBar({ ...CONF01_FIRST_PAINT, footprintTotalMB: 1100 }, { settled: true });
  assert.equal(v.overBarMB, 76, 'the comparison is against the TOTAL; subtracting the fixed row here would hide a breach');
});

test('an unreadable footprint is not a pass and not a breach', () => {
  const v = assessAgainstBar({ footprintTotalMB: null }, { settled: true });
  assert.equal(v.barState, 'NO_READING');
  assert.equal(v.meetsBar, null, 'a failed gauge reported as WITHIN_BAR is the worst available outcome');
});

test('a total with no per-process split does not silently become a two-row report', () => {
  const r = threeRows({ footprintTotalMB: 900, footprintByType: {}, pageRendererMB: null });
  assert.equal(r.state, 'SPLIT_UNAVAILABLE');
  assert.equal(r.rowsSumMB, null);
});

test('the bar constant is the ruled one and lives in exactly one place', () => {
  assert.equal(BAR_MB, 1024);
});
