import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TRAIL_PATH_CAP_SCHEMA,
  TRAIL_PATH_CAP_SCHEMA_SHA256,
  appendTrailPathPoint,
  createTrailPathState,
  resetTrailPath,
  retainedPointCount,
  teardownTrailPath,
} from './m20-q4-trail-path-cap-model.mjs';
import { makeTrailPoint, TRAIL_PATH_CAP_FIXTURES } from './m20-q4-trail-path-cap-fixtures.mjs';

const PINNED_SCHEMA_SHA256 = '7786f942356c15864c1f588326a54e3d20fcb70224894c8f4826bf51a0471d1d';

test('schema and behavior contract are version/hash pinned', () => {
  assert.equal(TRAIL_PATH_CAP_SCHEMA.version, 1);
  assert.equal(TRAIL_PATH_CAP_SCHEMA_SHA256, PINNED_SCHEMA_SHA256);
  assert.equal(Object.isFrozen(TRAIL_PATH_CAP_SCHEMA), true);
  assert.equal(Object.isFrozen(TRAIL_PATH_CAP_SCHEMA.pointFields), true);
  assert.equal(Object.isFrozen(TRAIL_PATH_CAP_SCHEMA.pointTypes), true);
  assert.equal(Object.isFrozen(TRAIL_PATH_CAP_SCHEMA.resetEvents), true);
  assert.throws(() => {
    TRAIL_PATH_CAP_SCHEMA.maxPoints = 1;
  }, TypeError);
});

test('maximum length and per-tick growth remain bounded deterministically', () => {
  const state = createTrailPathState({ maxPoints: 8 });
  for (let tick = 0; tick < 10_000; tick += 1) {
    const before = retainedPointCount(state);
    const result = appendTrailPathPoint(state, makeTrailPoint(tick));
    assert.ok(result.growth <= TRAIL_PATH_CAP_SCHEMA.maxGrowthPerTick);
    assert.ok(retainedPointCount(state) <= 8);
    assert.ok(retainedPointCount(state) - before <= 1);
  }
  assert.deepEqual(state.points.map((point) => point.tick), [9992, 9993, 9994, 9995, 9996, 9997, 9998, 9999]);

  const onePointState = createTrailPathState({ maxPoints: 1 });
  appendTrailPathPoint(onePointState, makeTrailPoint(0));
  appendTrailPathPoint(onePointState, makeTrailPoint(1));
  assert.deepEqual(onePointState.points.map((point) => point.tick), [1]);
});

test('duplicate points are no-ops and same-tick points coalesce', () => {
  const state = createTrailPathState();
  for (const point of TRAIL_PATH_CAP_FIXTURES.ordered) appendTrailPathPoint(state, point);
  assert.equal(appendTrailPathPoint(state, TRAIL_PATH_CAP_FIXTURES.ordered[1]).status, 'duplicate');
  assert.equal(appendTrailPathPoint(state, TRAIL_PATH_CAP_FIXTURES.sameTickReplacement).status, 'coalesced');
  assert.equal(state.points.length, 2);
  assert.deepEqual(state.points[1], TRAIL_PATH_CAP_FIXTURES.sameTickReplacement);
});

test('seek and timeframe changes reset retained path and ordering epoch', () => {
  for (const reason of TRAIL_PATH_CAP_SCHEMA.resetEvents) {
    const state = createTrailPathState();
    appendTrailPathPoint(state, makeTrailPoint(50));
    assert.equal(resetTrailPath(state, reason), true);
    assert.equal(retainedPointCount(state), 0);
    assert.equal(appendTrailPathPoint(state, makeTrailPoint(0)).status, 'appended');
    assert.equal(state.generation, 1);
  }
});

test('removal tears down storage and seals against late callbacks', () => {
  const state = createTrailPathState();
  appendTrailPathPoint(state, makeTrailPoint(1));
  assert.equal(teardownTrailPath(state), true);
  assert.equal(retainedPointCount(state), 0);
  assert.equal(appendTrailPathPoint(state, makeTrailPoint(2)).status, 'sealed');
  assert.equal(teardownTrailPath(state), false);
});

test('NaN, non-finite, malformed, and out-of-order inputs fail closed', () => {
  const state = createTrailPathState();
  appendTrailPathPoint(state, makeTrailPoint(1));
  const snapshot = JSON.stringify(state.points);
  for (const point of TRAIL_PATH_CAP_FIXTURES.invalid) {
    assert.equal(appendTrailPathPoint(state, point).status, 'rejected');
    assert.equal(JSON.stringify(state.points), snapshot);
  }
});

test('anti-vacuity probe rejects backward same-tick replacement', () => {
  const state = createTrailPathState();
  appendTrailPathPoint(state, TRAIL_PATH_CAP_FIXTURES.ordered[1]);
  const snapshot = JSON.stringify(state.points);
  const backwardReplacement = {
    tick: TRAIL_PATH_CAP_FIXTURES.ordered[1].tick,
    time: TRAIL_PATH_CAP_FIXTURES.ordered[1].time - 1,
    value: 9.9,
  };
  assert.equal(appendTrailPathPoint(state, backwardReplacement).status, 'rejected');
  assert.equal(JSON.stringify(state.points), snapshot);
});

test('memory retention is independent of session length', () => {
  const state = createTrailPathState({ maxPoints: 32 });
  for (let tick = 0; tick < 100_000; tick += 1) appendTrailPathPoint(state, makeTrailPoint(tick));
  assert.equal(retainedPointCount(state), 32);
  assert.ok(JSON.stringify(state).length < 4_096);
});
