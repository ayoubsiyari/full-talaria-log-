import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyReplayRestoreCell, RED, summarizeReplayRestoreMatrix } from './b75-po-v4-replay-restore-oracle.mjs';

const candle = (timestamp, close = 1.25) => ({ timestamp, open: 1.2, high: 1.3, low: 1.1, close });
const snap = (timestamp, progress = 9, forming = candle(timestamp), committed = 40) => ({
  rawTickTimestamp: timestamp,
  tickProgress: progress,
  formingCandle: forming,
  committedCandleIndex: committed,
});

test('paused forming replay requires raw tick, substep, OHLC, timestamp, and commit index', () => {
  const before = snap(1_700_000_009_000);
  const result = classifyReplayRestoreCell({
    kind: 'paused-tick-refresh',
    before,
    after: snap(1_700_000_000_000, 0, null, 39),
  });
  assert.equal(result.verdict, RED.FORMING_STATE_OMITTED);
  assert.equal(result.secondsLost, 9);
  assert.equal(result.exact.rawTick, false);
  assert.equal(result.exact.substep, false);
  assert.equal(result.exact.formingCandle, false);
  assert.equal(result.exact.formingOhlc, false);
  assert.equal(result.exact.committedIndex, false);
});

test('playing refresh reports stale checkpoint and exact seconds lost', () => {
  const result = classifyReplayRestoreCell({
    kind: 'playing-refresh',
    before: snap(1_700_000_025_000),
    after: snap(1_700_000_008_000),
  });
  assert.equal(result.verdict, RED.PLAYING_CHECKPOINT_STALE);
  assert.equal(result.secondsLost, 17);
});

test('forming hover compares display timestamp to forming candle timestamp', () => {
  const result = classifyReplayRestoreCell({
    kind: 'forming-candle-hover',
    before: { ...snap(1_700_000_009_000), hover: { timestamp: 1_699_999_940_000 } },
    after: snap(1_700_000_009_000),
  });
  assert.equal(result.verdict, RED.DISPLAY_TIMESTAMP_OFF_BY_ONE);
  assert.equal(result.secondsLost, 69);
});

test('matrix maps the three independent mechanisms to MC_RESTORE, M8, and M25', () => {
  const matrix = summarizeReplayRestoreMatrix([
    { kind: 'candle-mode-control', before: snap(1000), after: snap(1000) },
    { kind: 'paused-tick-refresh', before: snap(9000), after: snap(1000, 0, null, 39) },
    { kind: 'playing-refresh', before: snap(25_000), after: snap(8000) },
    {
      kind: 'forming-candle-hover',
      before: { ...snap(9000), hover: { timestamp: 1000 } },
      after: snap(9000),
    },
  ]);
  assert.equal(matrix.verdict, 'RED');
  assert.deepEqual(matrix.mechanisms, {
    checkpointCadence: true,
    formingTickStateOmitted: true,
    displayTimestampOffByOne: true,
  });
  assert.deepEqual(matrix.mapping.M8, ['paused-tick-refresh', 'tick-exit-reentry', 'playing-refresh']);
});

test('fails closed when authenticated owner scope does not exactly match', () => {
  const result = classifyReplayRestoreCell({
    kind: 'paused-tick-refresh',
    before: snap(9000),
    after: snap(9000),
    scope: { expectedSessionId: '849', observedSessionId: '850', ownerValidated: true },
  });
  assert.equal(result.verdict, 'BLOCKED_SCOPE_MISMATCH');
});

test('reports mode, play state, cadence, elapsed substep, and forming OHLC independently', () => {
  const before = {
    ...snap(9000),
    replayMode: 'tick',
    playPauseState: 'paused',
    loopKind: 'tick',
    tickElapsedMs: 3000,
  };
  const after = {
    ...before,
    replayMode: 'candle',
    loopKind: null,
    tickElapsedMs: 0,
    formingCandle: candle(9000, 1.2),
  };
  const result = classifyReplayRestoreCell({
    kind: 'paused-tick-refresh',
    before,
    after,
    scope: { expectedSessionId: '849', observedSessionId: '849', ownerValidated: true },
  });
  assert.equal(result.verdict, RED.FORMING_STATE_OMITTED);
  assert.equal(result.exact.mode, false);
  assert.equal(result.exact.cadence, false);
  assert.equal(result.exact.tickElapsed, false);
  assert.equal(result.exact.formingOhlc, false);
});
