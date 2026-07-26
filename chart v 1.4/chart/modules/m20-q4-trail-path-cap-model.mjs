import { createHash } from 'node:crypto';

export const TRAIL_PATH_CAP_SCHEMA = Object.freeze({
  id: 'talaria.m20.q4.trail-path-cap',
  version: 1,
  maxPoints: 256,
  maxGrowthPerTick: 1,
  pointFields: Object.freeze(['tick', 'time', 'value']),
  invalidInput: 'reject-without-mutation',
  sameTick: 'coalesce-latest',
  resetEvents: Object.freeze(['seek', 'timeframe']),
  teardown: 'clear-and-seal',
});

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export const TRAIL_PATH_CAP_SCHEMA_SHA256 = createHash('sha256')
  .update(canonical(TRAIL_PATH_CAP_SCHEMA))
  .digest('hex');

export function createTrailPathState(options = {}) {
  const requested = Number(options.maxPoints);
  const maxPoints = Number.isSafeInteger(requested) && requested > 1
    ? requested
    : TRAIL_PATH_CAP_SCHEMA.maxPoints;
  return {
    maxPoints,
    points: [],
    lastTick: null,
    generation: 0,
    disposed: false,
    accepted: 0,
    rejected: 0,
    coalesced: 0,
  };
}

function normalizePoint(input) {
  if (!input || typeof input !== 'object') return null;
  const tick = Number(input.tick);
  const time = Number(input.time);
  const value = Number(input.value);
  if (!Number.isSafeInteger(tick) || tick < 0 || !Number.isFinite(time) || !Number.isFinite(value)) return null;
  return Object.freeze({ tick, time, value });
}

export function appendTrailPathPoint(state, input) {
  if (!state || state.disposed || !Array.isArray(state.points)) return Object.freeze({ status: 'sealed', growth: 0 });
  const point = normalizePoint(input);
  if (!point || (state.lastTick !== null && point.tick < state.lastTick)) {
    state.rejected += 1;
    return Object.freeze({ status: 'rejected', growth: 0 });
  }

  const tail = state.points[state.points.length - 1];
  if (tail && point.tick === state.lastTick) {
    if (tail.time === point.time && tail.value === point.value) {
      return Object.freeze({ status: 'duplicate', growth: 0 });
    }
    state.points[state.points.length - 1] = point;
    state.coalesced += 1;
    return Object.freeze({ status: 'coalesced', growth: 0 });
  }

  state.points.push(point);
  state.lastTick = point.tick;
  state.accepted += 1;
  if (state.points.length > state.maxPoints) state.points.splice(0, state.points.length - state.maxPoints);
  return Object.freeze({ status: 'appended', growth: 1 });
}

export function resetTrailPath(state, reason) {
  if (!state || state.disposed || !TRAIL_PATH_CAP_SCHEMA.resetEvents.includes(reason)) return false;
  state.points.length = 0;
  state.lastTick = null;
  state.generation += 1;
  return true;
}

export function teardownTrailPath(state) {
  if (!state || state.disposed) return false;
  if (Array.isArray(state.points)) state.points.length = 0;
  state.lastTick = null;
  state.disposed = true;
  return true;
}

export function retainedPointCount(state) {
  return Array.isArray(state?.points) ? state.points.length : 0;
}
