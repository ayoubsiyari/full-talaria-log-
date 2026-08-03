/**
 * Self-test for FLOOR-CURVE-V1.
 *
 * The cases that matter are the rejections. A grader that has only ever been shown a good curve is
 * the defect SEAL-EVIDENCE-01 names, so every refusal state has a test that produces it, and the
 * curve shapes are the real ones: A's settle data, my own post-play census, and the awkward shape
 * that falls, rises and falls back — which is flat between its last two reads while describing a
 * session that never rested.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gradeSettleCurve, reconcileFloors, PUBLISHED_FLOORS, DEFAULT_FLAT_BAND_MB,
} from './lib/floor-curve.mjs';

test('FLOOR_FOUND: a curve that flattens gives its asymptote as the floor', () => {
  const r = gradeSettleCurve([
    { settleSec: 0, totalMB: 531.8 },
    { settleSec: 20, totalMB: 420.7 },
    { settleSec: 150, totalMB: 415.2 },
    { settleSec: 300, totalMB: 414.1 },
  ]);
  assert.equal(r.state, 'FLOOR_FOUND');
  assert.equal(r.ok, true);
  assert.equal(r.floorMB, 414.1);
  assert.equal(r.settleToFloorSec, 300);
  assert.equal(r.totalDeclineMB, 117.7);
});

test("STILL_FALLING: A's 20 s stop would have been an upper bound, not a floor", () => {
  // The exact shape A published, stopped where A stopped. If the curve is still moving there, 420.70
  // is a bound. This is the test that decides whether the re-take is worth a host at all.
  const r = gradeSettleCurve([
    { settleSec: 0, totalMB: 531.84 },
    { settleSec: 20, totalMB: 420.70 },
  ]);
  assert.equal(r.state, 'STILL_FALLING');
  assert.equal(r.ok, false);
  assert.equal(r.floorMB, null);
  assert.equal(r.upperBoundMB, 420.70);
  assert.match(r.why, /UPPER BOUND/);
});

test('NOT_IDLE: a curve that rises is refused outright, not averaged', () => {
  const r = gradeSettleCurve([
    { settleSec: 0, totalMB: 500 },
    { settleSec: 60, totalMB: 470 },
    { settleSec: 120, totalMB: 495 },
    { settleSec: 180, totalMB: 494 },
  ]);
  assert.equal(r.state, 'NOT_IDLE');
  assert.equal(r.ok, false);
  assert.equal(r.floorMB, null);
  assert.equal(r.biggestRiseMB, 25);
  assert.match(r.why, /not at rest/);
});

test('NOT_IDLE beats flatness: the last interval being flat does not rescue a curve that rose', () => {
  // Falls, jumps, then settles flat. Grading flatness first would call this a floor.
  const r = gradeSettleCurve([
    { settleSec: 0, totalMB: 600 },
    { settleSec: 60, totalMB: 500 },
    { settleSec: 120, totalMB: 560 },
    { settleSec: 180, totalMB: 560.5 },
  ]);
  assert.equal(r.state, 'NOT_IDLE');
});

test('small noise does not read as a rise', () => {
  const r = gradeSettleCurve([
    { settleSec: 0, totalMB: 430 },
    { settleSec: 60, totalMB: 421 },
    { settleSec: 120, totalMB: 422.5 },
    { settleSec: 180, totalMB: 421.8 },
  ]);
  assert.equal(r.state, 'FLOOR_FOUND');
  assert.equal(r.floorMB, 421.8);
});

test('TOO_FEW_READS and UNREADABLE are distinct from a bad floor', () => {
  assert.equal(gradeSettleCurve([]).state, 'TOO_FEW_READS');
  assert.equal(gradeSettleCurve([{ settleSec: 0, totalMB: 500 }]).state, 'TOO_FEW_READS');

  const hole = gradeSettleCurve([
    { settleSec: 0, totalMB: 500 },
    { settleSec: 60, totalMB: null },
    { settleSec: 120, totalMB: 480 },
  ]);
  assert.equal(hole.state, 'UNREADABLE');
  assert.match(hole.why, /hole/);
});

test('a null total is a hole, not a zero', () => {
  // Number(null) is 0, and a curve ending at "0 MB" would grade as a spectacular floor.
  const r = gradeSettleCurve([
    { settleSec: 0, totalMB: 500 },
    { settleSec: 60, totalMB: null },
  ]);
  assert.equal(r.state, 'UNREADABLE');
  assert.notEqual(r.floorMB, 0);
});

test('the flat band is configurable and actually changes the verdict', () => {
  const curve = [{ settleSec: 0, totalMB: 500 }, { settleSec: 60, totalMB: 495 }];
  assert.equal(gradeSettleCurve(curve, { flatBandMB: 3 }).state, 'STILL_FALLING');
  assert.equal(gradeSettleCurve(curve, { flatBandMB: 10 }).state, 'FLOOR_FOUND');
  assert.equal(DEFAULT_FLAT_BAND_MB, 3.0);
});

test('reconcileFloors routes each published figure to the floor it is comparable with', () => {
  const r = reconcileFloors({ bootFloorMB: 414.1, postPlayFloorMB: 560.2 });
  const byId = Object.fromEntries(r.rows.map((x) => [x.id, x]));

  // The three boot figures compare against the boot floor.
  for (const id of ['532.6', '531.84', '420.70']) {
    assert.equal(byId[id].comparedAgainst, 'boot floor', `${id} should compare against the boot floor`);
    assert.equal(byId[id].newFloorMB, 414.1);
  }
  // C's 633 is post-play and must NOT be compared against a boot floor.
  assert.equal(byId['633.0'].comparedAgainst, 'post-play floor');
  assert.equal(byId['633.0'].newFloorMB, 560.2);
  assert.equal(byId['633.0'].deltaMB, 72.8);
});

test('every unsettled figure names the settle as its explanation, and 633 names both axes', () => {
  const r = reconcileFloors({ bootFloorMB: 414.1, postPlayFloorMB: 560.2 });
  const byId = Object.fromEntries(r.rows.map((x) => [x.id, x]));

  assert.ok(byId['532.6'].explainedBy.some((e) => /no settle/.test(e)));
  assert.equal(byId['420.70'].explainedBy.length, 0, 'the settled boot figure needs no excuse');
  assert.equal(byId['633.0'].explainedBy.length, 2, '633 differs on BOTH settle and session history');
  assert.ok(byId['633.0'].explainedBy.some((e) => /post-play/.test(e)));
});

test('a half-finished reconciliation refuses rather than quoting one floor as the floor', () => {
  const r = reconcileFloors({ bootFloorMB: 414.1, postPlayFloorMB: null });
  assert.match(r.verdict, /^INCOMPLETE/);
  assert.match(r.verdict, /633 versus 532\.6/);

  const both = reconcileFloors({ bootFloorMB: 414.1, postPlayFloorMB: 560.2 });
  assert.match(both.verdict, /TWO canonical floors/);
});

test('the published table records conditions and settle for every figure', () => {
  assert.equal(PUBLISHED_FLOORS.length, 4);
  for (const p of PUBLISHED_FLOORS) {
    assert.ok(p.conditions && p.conditions.length > 10, `${p.id} does not state its conditions`);
    assert.ok(p.settle && p.settle.length > 3, `${p.id} does not state its settle`);
    assert.ok(p.owner, `${p.id} has no owner`);
  }
});
