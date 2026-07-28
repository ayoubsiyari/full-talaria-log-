import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyDurationCell,
  formatDurationHours,
  normalizeEpochMs,
  summarizeDurationEvidence,
  TAL_01896_RED,
} from './b75-tal-01896-duration-oracle.mjs';

const HOUR_MS = 3_600_000;
const WALL_NOW = 1_800_000_000_000;
const ENTRY = WALL_NOW - 139_271 * HOUR_MS;
const REPLAY_NOW = ENTRY + 6 * HOUR_MS;
const ROLLBACK_ENTRY = WALL_NOW - 110_036 * HOUR_MS;
const ROLLBACK_REPLAY_NOW = ROLLBACK_ENTRY + HOUR_MS;

test('TAL-01896 deterministic RED reproduces 139,271h from wall clock substitution', () => {
  const result = classifyDurationCell({
    status: 'open',
    start: ENTRY,
    end: null,
    current: WALL_NOW,
    clockDomain: 'replay',
    currentClockDomain: 'wall',
  });
  assert.equal(result.verdict, TAL_01896_RED.WALL_CLOCK_FOR_REPLAY_OPEN);
  assert.equal(result.hours, 139_271);
  assert.equal(formatDurationHours(result.hours), '139,271h');
});

test('post-rollback RED reproduces 110,036h while its replay duration is one hour', () => {
  const result = classifyDurationCell({
    kind: 'post-rollback-open',
    status: 'open',
    replayEntry: ROLLBACK_ENTRY,
    currentReplay: ROLLBACK_REPLAY_NOW,
    wallNow: WALL_NOW,
    currentClockDomain: 'wall',
    clockDomain: 'replay',
    afterRollback: true,
  });
  assert.equal(result.verdict, TAL_01896_RED.WALL_CLOCK_FOR_REPLAY_OPEN);
  assert.equal(result.hours, 110_036);
  assert.equal(formatDurationHours(result.hours), '110,036h');
  assert.deepEqual(result.clocks, {
    replayEntryMs: ROLLBACK_ENTRY,
    currentReplayMs: ROLLBACK_REPLAY_NOW,
    wallNowMs: WALL_NOW,
  });
});

test('open replay control uses the replay playhead and remains plausible', () => {
  const result = classifyDurationCell({
    status: 'open',
    start: ENTRY,
    end: null,
    current: REPLAY_NOW,
    clockDomain: 'replay',
    currentClockDomain: 'replay',
  });
  assert.equal(result.verdict, 'GREEN_DURATION_DOMAIN_ALIGNED');
  assert.equal(result.hours, 6);
});

test('closed-trade control ignores wall time and uses replay exit', () => {
  const result = classifyDurationCell({
    status: 'closed',
    start: ENTRY,
    end: ENTRY + 2.5 * 3_600_000,
    current: WALL_NOW,
    clockDomain: 'replay',
    currentClockDomain: 'wall',
  });
  assert.equal(result.verdict, 'GREEN_DURATION_DOMAIN_ALIGNED');
  assert.equal(result.hours, 2.5);
});

test('seconds and milliseconds normalize identically without treating null as epoch zero', () => {
  assert.equal(normalizeEpochMs(ENTRY / 1000), ENTRY);
  assert.equal(normalizeEpochMs(String(ENTRY)), ENTRY);
  assert.equal(normalizeEpochMs(null), null);
  assert.equal(normalizeEpochMs(0), null);
});

test('refresh hydration cannot repair a wrong clock domain by formatting it', () => {
  const matrix = summarizeDurationEvidence([
    {
      kind: 'ordinary-open',
      status: 'open', replayEntry: ENTRY, currentReplay: REPLAY_NOW, wallNow: WALL_NOW,
      clockDomain: 'replay', currentClockDomain: 'wall',
    },
    {
      kind: 'post-rollback-open',
      status: 'open', replayEntry: ROLLBACK_ENTRY,
      currentReplay: ROLLBACK_REPLAY_NOW, wallNow: WALL_NOW,
      clockDomain: 'replay', currentClockDomain: 'wall',
      afterRollback: true,
    },
    {
      kind: 'closed-control',
      status: 'closed', start: ENTRY, end: REPLAY_NOW,
      clockDomain: 'replay', currentClockDomain: 'replay',
    },
  ]);
  assert.equal(matrix.verdict, 'RED');
  assert.equal(matrix.cells[0].oracle.hours, 139_271);
  assert.equal(matrix.cells[1].oracle.hours, 110_036);
  assert.equal(matrix.cells[2].oracle.verdict, 'GREEN_DURATION_DOMAIN_ALIGNED');
  assert.equal(matrix.rootMismatchExistsWithoutRollback, true);
  assert.equal(matrix.rollbackExaggeratesCorrectDuration, true);
});
