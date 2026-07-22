/**
 * Focused Go To weekend resolution checks (Friday → not Sunday open).
 * Run: node --test src/gotoMenuHelpers.test.mjs
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  isGotoDeadWeekendWallClock,
  resolveGotoTimestampMs,
  buildGotoTimestampMs,
} from './gotoMenuHelpers.js';

/** Chart TZ = UTC for deterministic tests. */
before(() => {
  globalThis.window = {
    timezoneManager: {
      convertToTimezone: (ms) => new Date(ms),
      wallClockToUtcMillis: (y, mo, d, hh, mm, ss = 0) =>
        Date.UTC(y, mo - 1, d, hh, mm, ss || 0, 0),
    },
  };
});

after(() => {
  delete globalThis.window;
});

describe('isGotoDeadWeekendWallClock', () => {
  it('marks Saturday dead', () => {
    // 2024-01-06 = Saturday
    assert.equal(isGotoDeadWeekendWallClock(2024, 1, 6, 8, 0), true);
  });

  it('marks Sunday before 17:00 dead (weekday RTH opens)', () => {
    // 2024-01-07 = Sunday
    assert.equal(isGotoDeadWeekendWallClock(2024, 1, 7, 8, 0), true);
    assert.equal(isGotoDeadWeekendWallClock(2024, 1, 7, 16, 59), true);
  });

  it('allows Sunday evening reopen', () => {
    assert.equal(isGotoDeadWeekendWallClock(2024, 1, 7, 17, 0), false);
    assert.equal(isGotoDeadWeekendWallClock(2024, 1, 7, 22, 0), false);
  });

  it('allows weekdays', () => {
    // 2024-01-05 = Friday, 2024-01-08 = Monday
    assert.equal(isGotoDeadWeekendWallClock(2024, 1, 5, 15, 0), false);
    assert.equal(isGotoDeadWeekendWallClock(2024, 1, 8, 8, 0), false);
  });
});

describe('resolveGotoTimestampMs daily session from Friday', () => {
  it('skips Saturday/Sunday for weekday NY Open 08:00 → Monday', () => {
    // Friday 2024-01-05 15:00 UTC wall (no timezoneManager in node → local/UTC build)
    const fridayAfternoon = Date.UTC(2024, 0, 5, 15, 0, 0);
    const ms = resolveGotoTimestampMs(
      { type: 'session', time: '08:00', repeat: 'daily' },
      { playheadMs: fridayAfternoon }
    );
    assert.ok(Number.isFinite(ms), 'resolved ms');
    const d = new Date(ms);
    // Monday 08:00
    assert.equal(d.getUTCDay(), 1, 'expected Monday');
    assert.equal(d.getUTCHours(), 8);
    assert.equal(d.getUTCMinutes(), 0);
    assert.notEqual(d.getUTCDay(), 0, 'must not land Sunday');
  });

  it('same-day later Friday datetime stays Friday', () => {
    const fridayMorning = Date.UTC(2024, 0, 5, 10, 0, 0);
    const ms = buildGotoTimestampMs('2024-01-05', '15:30');
    assert.ok(Number.isFinite(ms));
    assert.ok(ms > fridayMorning);
    const d = new Date(ms);
    assert.equal(d.getUTCFullYear(), 2024);
    assert.equal(d.getUTCMonth(), 0);
    assert.equal(d.getUTCDate(), 5);
  });
});

/** Mirrors chart.js findGoToTargetIndex gap rule (no chart bootstrap). */
function findGoToTargetIndexPure(sourceData, targetTimestamp, maxForwardGapMs = 18 * 60 * 60 * 1000) {
  let exactIndex = -1;
  let firstOnOrAfterIndex = -1;
  let firstOnOrAfterTs = Infinity;
  let nearestIndex = -1;
  let minDiff = Infinity;
  let lastBeforeIndex = -1;
  let lastBeforeTs = -Infinity;

  for (let i = 0; i < sourceData.length; i++) {
    const ts = sourceData[i].t;
    if (ts === targetTimestamp && exactIndex === -1) exactIndex = i;
    if (ts >= targetTimestamp && ts < firstOnOrAfterTs) {
      firstOnOrAfterTs = ts;
      firstOnOrAfterIndex = i;
    }
    if (ts < targetTimestamp && ts > lastBeforeTs) {
      lastBeforeTs = ts;
      lastBeforeIndex = i;
    }
    const diff = Math.abs(ts - targetTimestamp);
    if (diff < minDiff) {
      minDiff = diff;
      nearestIndex = i;
    }
  }
  if (exactIndex !== -1) return exactIndex;
  if (firstOnOrAfterIndex !== -1) {
    const forwardGap = firstOnOrAfterTs - targetTimestamp;
    if (forwardGap <= maxForwardGapMs) return firstOnOrAfterIndex;
    if (lastBeforeIndex !== -1 && (targetTimestamp - lastBeforeTs) <= forwardGap) {
      return lastBeforeIndex;
    }
    return nearestIndex !== -1 ? nearestIndex : firstOnOrAfterIndex;
  }
  return nearestIndex;
}

describe('findGoToTargetIndex weekend gap', () => {
  it('does not snap Friday afternoon target across weekend to Sunday open', () => {
    const fridayLast = Date.UTC(2024, 0, 5, 16, 55, 0);
    const sundayOpen = Date.UTC(2024, 0, 7, 18, 0, 0);
    const target = Date.UTC(2024, 0, 5, 17, 30, 0); // after last Friday bar
    const data = [
      { t: Date.UTC(2024, 0, 5, 16, 0, 0) },
      { t: fridayLast },
      { t: sundayOpen },
      { t: Date.UTC(2024, 0, 7, 18, 5, 0) },
    ];
    const idx = findGoToTargetIndexPure(data, target, 18 * 60 * 60 * 1000);
    assert.equal(data[idx].t, fridayLast, 'prefer last Friday bar over Sunday open');
  });

  it('still takes first on/after when within gap', () => {
    const t0 = Date.UTC(2024, 0, 8, 8, 0, 0);
    const t1 = Date.UTC(2024, 0, 8, 8, 5, 0);
    const data = [{ t: t0 }, { t: t1 }];
    const idx = findGoToTargetIndexPure(data, Date.UTC(2024, 0, 8, 8, 2, 0), 18 * 60 * 60 * 1000);
    assert.equal(data[idx].t, t1);
  });
});
