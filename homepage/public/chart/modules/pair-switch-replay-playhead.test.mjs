/**
 * Mid-replay pair switch must fetch a playhead-centered window. Session-start
 * initial range + bar limit lets goToReplayTimestamp clamp back to the early
 * slice ("date reverts when changing currency").
 *
 *   node --test "chart v 1.4/chart/modules/pair-switch-replay-playhead.test.mjs"
 */
import assert from 'node:assert/strict';
import test from 'node:test';

function pickPairSwitchFetchRange({
  independentPair,
  sessionEndMs,
  replayTs,
  getReplayRange,
  getInitialRange,
}) {
  if (independentPair && sessionEndMs != null) {
    return { endTs: sessionEndMs };
  }
  if (Number.isFinite(replayTs)) {
    return getReplayRange(replayTs);
  }
  return getInitialRange();
}

test('host pair switch with active playhead uses replay-centered range', () => {
  const playhead = Date.UTC(2014, 1, 11, 13, 2, 0); // Feb 11 2014
  const sessionStart = Date.UTC(2014, 0, 2);
  const sessionEnd = Date.UTC(2014, 5, 1);
  let used = null;
  const range = pickPairSwitchFetchRange({
    independentPair: false,
    sessionEndMs: sessionEnd,
    replayTs: playhead,
    getReplayRange: (ts) => {
      used = 'replay';
      return { startTs: ts - 2000 * 60_000, endTs: ts + 120 * 60_000 };
    },
    getInitialRange: () => {
      used = 'initial';
      return { startTs: sessionStart - 320 * 60_000, endTs: sessionEnd };
    },
  });
  assert.equal(used, 'replay');
  assert.ok(range.startTs <= playhead && range.endTs >= playhead);
});

test('pair switch without playhead keeps session-initial range', () => {
  let used = null;
  pickPairSwitchFetchRange({
    independentPair: false,
    sessionEndMs: Date.UTC(2014, 5, 1),
    replayTs: null,
    getReplayRange: () => {
      used = 'replay';
      return {};
    },
    getInitialRange: () => {
      used = 'initial';
      return { startTs: 1, endTs: 2 };
    },
  });
  assert.equal(used, 'initial');
});
