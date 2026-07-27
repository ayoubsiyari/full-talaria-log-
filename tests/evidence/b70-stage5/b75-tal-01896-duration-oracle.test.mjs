import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyDurationCell,
  formatDurationHours,
  normalizeEpochMs,
  summarizeDurationEvidence,
  TAL_01896_RED,
} from './b75-tal-01896-duration-oracle.mjs';

const ENTRY = 1_200_000_000_000;
const REPLAY_NOW = ENTRY + 6 * 3_600_000;
const WALL_NOW = ENTRY + 139_271 * 3_600_000;

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
      kind: 'before-refresh-open',
      status: 'open', start: ENTRY, end: null, current: WALL_NOW,
      clockDomain: 'replay', currentClockDomain: 'wall',
    },
    {
      kind: 'after-refresh-open',
      status: 'open', start: String(ENTRY / 1000), end: null, current: WALL_NOW,
      clockDomain: 'replay', currentClockDomain: 'wall',
    },
    {
      kind: 'closed-control',
      status: 'closed', start: ENTRY, end: REPLAY_NOW,
      clockDomain: 'replay', currentClockDomain: 'replay',
    },
  ]);
  assert.equal(matrix.verdict, 'RED');
  assert.equal(matrix.cells[0].oracle.hours, matrix.cells[1].oracle.hours);
  assert.equal(matrix.cells[2].oracle.verdict, 'GREEN_DURATION_DOMAIN_ALIGNED');
});
