#!/usr/bin/env node
/**
 * DRAW-SMOKE-01 selftest — every verdict branch of the grader, from fixtures.
 *
 * EVIDENCE CLASS: pure-function. This proves the GRADER discriminates. It does not
 * open a browser and says nothing about the served build; the runtime half is the
 * `--drawingsSmoke=1` step inside the pre-fire smoke, and until that has run
 * against a sealed build this row is not seal-grade. Stated here rather than
 * implied, per SEAL-EVIDENCE-01.
 *
 *   node scripts/lib/drawings-smoke.selftest.mjs
 */
import assert from 'node:assert/strict';

import { PRICE_EPSILON, gradeDrawingsPersistence } from './drawings-smoke.mjs';

let pass = 0;
let fail = 0;
const cell = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); pass += 1; } catch (err) {
    console.log(`  FAIL  ${name}\n        ${err.message.split('\n')[0]}`);
    fail += 1;
  }
};

const T1 = 1700000000000;
const T2 = 1700000240000;

const trendline = {
  id: 'dr_1', type: 'trendline', panelId: 'A', timeframe: '1m',
  points: [{ timestamp: T1, price: 101.25 }, { timestamp: T2, price: 105.5 }],
};
const horizontal = {
  id: 'dr_2', type: 'horizontal', panelId: 'B', timeframe: '5m',
  points: [{ timestamp: T2, price: 1.085 }],
};
/** A frame as READ_IN_FRAME returns it. */
const frame = (panelId, timeframe, drawings) => ({
  isHost: panelId === 'A', panelId, timeframe, fileId: 'f1', bars: 5000, drawings,
});
const asStored = (d, over = {}) => ({
  id: d.id, type: d.type, coordinateSystem: 'timestamp', points: d.points, ...over,
});

console.log('DRAW-SMOKE-01 selftest\n');

cell('GREEN: both drawings back on their own panel at the planted price and market time', () => {
  const r = gradeDrawingsPersistence([trendline, horizontal], [
    frame('A', '1m', [asStored(trendline)]),
    frame('B', '5m', [asStored(horizontal)]),
  ]);
  assert.equal(r.state, 'DRAWINGS_PERSIST');
  assert.equal(r.ok, true);
  assert.equal(r.perDrawing.filter((d) => d.state === 'PERSISTED').length, 2);
});

cell('THE MARKET-TIME PROOF: identical anchors on 1m and 1h is reported as cross-timeframe', () => {
  // Bar index 4,000 on 1m is not bar index 4,000 on 1h. Byte-equal anchors on both
  // is the runtime evidence that persistence is in market time.
  const r = gradeDrawingsPersistence([trendline], [
    frame('A', '1m', [asStored(trendline)]),
    frame('D', '1h', [asStored(trendline)]),
  ]);
  assert.equal(r.state, 'DRAWINGS_PERSIST');
  assert.equal(r.perDrawing[0].crossTimeframe, true);
  assert.deepEqual(r.perDrawing[0].timeframes, ['1m', '1h']);
  assert.match(r.detail, /market-time anchoring proven at runtime/);
});

cell('a single-timeframe pass says so, instead of implying the cross-timeframe proof', () => {
  const r = gradeDrawingsPersistence([trendline], [frame('A', '1m', [asStored(trendline)])]);
  assert.equal(r.state, 'DRAWINGS_PERSIST');
  assert.equal(r.perDrawing[0].crossTimeframe, false);
  assert.match(r.detail, /cross-timeframe anchoring is NOT/);
});

cell('RED: a drawing that did not survive the refresh', () => {
  const r = gradeDrawingsPersistence([trendline, horizontal], [
    frame('A', '1m', [asStored(trendline)]),
    frame('B', '5m', []),
  ]);
  assert.equal(r.state, 'DRAWINGS_LOST');
  assert.equal(r.ok, false);
  assert.match(r.detail, /horizontal planted on B/);
});

cell('RED: survived at the wrong PRICE — the money assertion', () => {
  const moved = { ...horizontal, points: [{ timestamp: T2, price: 1.0851 }] };
  const r = gradeDrawingsPersistence([horizontal], [frame('B', '5m', [asStored(moved)])]);
  assert.equal(r.state, 'DRAWINGS_MOVED');
  assert.match(r.detail, /price 1\.0851 != planted 1\.085/);
});

cell('RED: survived at the wrong MARKET TIME, and the drift is quantified', () => {
  const slipped = { ...trendline, points: [{ timestamp: T1 + 60000, price: 101.25 }, { timestamp: T2, price: 105.5 }] };
  const r = gradeDrawingsPersistence([trendline], [frame('A', '1m', [asStored(slipped)])]);
  assert.equal(r.state, 'DRAWINGS_MOVED');
  assert.match(r.detail, /60s out/);
});

cell('RED: came back INDEX-anchored — the exact regression market time exists to stop', () => {
  const r = gradeDrawingsPersistence([trendline], [
    frame('A', '1m', [asStored(trendline, { coordinateSystem: 'index' })]),
  ]);
  assert.equal(r.state, 'DRAWINGS_MOVED');
  assert.match(r.detail, /not "timestamp"/);
  assert.match(r.detail, /moves when bars reload/);
});

cell('RED: present somewhere but absent from the panel it was drawn on', () => {
  const r = gradeDrawingsPersistence([horizontal], [
    frame('A', '1m', [asStored(horizontal)]),
    frame('B', '5m', []),
  ]);
  assert.equal(r.state, 'DRAWINGS_WRONG_PANEL');
  assert.match(r.detail, /planted B, found A/);
});

cell('AN EMPTY PLANT IS NOT A PASS', () => {
  // The failure mode that would make this whole step decorative: planting silently
  // fails, nothing is lost because nothing existed, and the gate reads green.
  const r = gradeDrawingsPersistence([], [frame('A', '1m', [])]);
  assert.equal(r.state, 'DRAWINGS_NOT_PLANTED');
  assert.equal(r.ok, false);
});

cell('panels not coming back is its own state, not DRAWINGS_LOST', () => {
  const r = gradeDrawingsPersistence([trendline], []);
  assert.equal(r.state, 'NO_PANELS_READ');
  assert.equal(r.ok, false);
  assert.match(r.detail, /Distinct from DRAWINGS_LOST/);
});

/**
 * These four cells exist because of what the first real run against b126 produced.
 * The step planted two drawings, the refresh came back with one frame and ZERO panels
 * painted, and the grader reported DRAWINGS_LOST — a persistence defect that had not
 * been demonstrated, because nothing had rendered for a drawing to be on.
 */
cell('REGRESSION (b126 run): a frame that answers but paints nothing is UNMEASURED, not LOST', () => {
  const r = gradeDrawingsPersistence([trendline, horizontal], [frame('A', '1m', [])], {
    panelsPainted: 0, panelsExpected: 1,
  });
  assert.equal(r.state, 'DRAWINGS_UNOBSERVABLE_NO_PAINT');
  assert.equal(r.ok, false);
  assert.equal(r.attributable, false, 'an unmeasured run must say it is not attributable');
  assert.match(r.detail, /Do not read this as "drawings do not persist"/);
  assert.equal(r.surface.panelsPainted, 0);
});

cell('ANTI-VACUITY: with panels painted, the same absent drawings are still DRAWINGS_LOST', () => {
  const r = gradeDrawingsPersistence([trendline, horizontal], [frame('A', '1m', [])], {
    panelsPainted: 2, panelsExpected: 2,
  });
  assert.equal(r.state, 'DRAWINGS_LOST', 'the new state must not swallow a real loss');
  assert.equal(r.ok, false);
});

cell('the paint gate does not fire on a healthy run', () => {
  const r = gradeDrawingsPersistence([trendline], [frame('A', '1m', [asStored(trendline)])], {
    panelsPainted: 1, panelsExpected: 1,
  });
  assert.equal(r.state, 'DRAWINGS_PERSIST');
  assert.equal(r.ok, true);
});

cell('a caller that cannot report paint keeps the old behaviour rather than going unmeasured', () => {
  const r = gradeDrawingsPersistence([trendline], [frame('A', '1m', [])]);
  assert.equal(r.state, 'DRAWINGS_LOST', 'absent paint evidence must not be read as zero paint');
});

cell('matching is by id, so a DIFFERENT drawing of the same type is not a survivor', () => {
  const impostor = { ...asStored(trendline), id: 'dr_other' };
  const r = gradeDrawingsPersistence([trendline], [frame('A', '1m', [impostor])]);
  assert.equal(r.state, 'DRAWINGS_LOST');
});

cell('ANTI-VACUITY: the price comparison is load-bearing on both sides of epsilon', () => {
  // If this cell can be made to pass by a comparison that is always true or always
  // false, the price assertion above proves nothing.
  const under = { ...horizontal, points: [{ timestamp: T2, price: 1.085 + PRICE_EPSILON / 2 }] };
  const over = { ...horizontal, points: [{ timestamp: T2, price: 1.085 + PRICE_EPSILON * 10 }] };
  assert.equal(
    gradeDrawingsPersistence([horizontal], [frame('B', '5m', [asStored(under)])]).state,
    'DRAWINGS_PERSIST', 'a difference below epsilon must not fail',
  );
  assert.equal(
    gradeDrawingsPersistence([horizontal], [frame('B', '5m', [asStored(over)])]).state,
    'DRAWINGS_MOVED', 'a difference above epsilon must fail',
  );
});

cell('an anchor COUNT change is caught, not silently zipped over', () => {
  const halved = { ...trendline, points: [{ timestamp: T1, price: 101.25 }] };
  const r = gradeDrawingsPersistence([trendline], [frame('A', '1m', [asStored(halved)])]);
  assert.equal(r.state, 'DRAWINGS_MOVED');
  assert.match(r.detail, /1 anchor\(s\), planted with 2/);
});

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
