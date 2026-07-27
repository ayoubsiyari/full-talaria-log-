const finite = (value) => Number.isFinite(Number(value));
const same = (left, right) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

export const RED = Object.freeze({
  FORMING_STATE_OMITTED: 'RED_FORMING_TICK_STATE_OMITTED',
  PLAYING_CHECKPOINT_STALE: 'RED_PLAYING_CHECKPOINT_STALE',
  DISPLAY_TIMESTAMP_OFF_BY_ONE: 'RED_DISPLAY_TIMESTAMP_OFF_BY_ONE',
  CANDLE_CONTROL_RESTORE: 'RED_CANDLE_CONTROL_RESTORE',
});

export function classifyReplayRestoreCell(cell) {
  if (!cell?.before || !cell?.after) return { verdict: 'BLOCKED', reason: 'missing snapshots' };
  const before = cell.before;
  const after = cell.after;
  const scope = {
    expectedSessionId: cell.scope?.expectedSessionId ?? null,
    observedSessionId: cell.scope?.observedSessionId ?? null,
    ownerValidated: cell.scope?.ownerValidated ?? null,
  };
  if (scope.expectedSessionId != null && (
    String(scope.observedSessionId) !== String(scope.expectedSessionId)
    || scope.ownerValidated !== true
  )) {
    return { verdict: 'BLOCKED_SCOPE_MISMATCH', scope };
  }
  const secondsLost = finite(before.rawTickTimestamp) && finite(after.rawTickTimestamp)
    ? Math.max(0, (Number(before.rawTickTimestamp) - Number(after.rawTickTimestamp)) / 1000)
    : null;

  if (cell.kind === 'forming-candle-hover') {
    const expected = Number(before.formingCandle?.timestamp);
    const actual = Number(before.hover?.timestamp);
    return {
      verdict: finite(expected) && finite(actual) && expected === actual
        ? 'GREEN_EXACT_FORMING_TIMESTAMP' : RED.DISPLAY_TIMESTAMP_OFF_BY_ONE,
      expectedTimestamp: finite(expected) ? expected : null,
      actualTimestamp: finite(actual) ? actual : null,
      secondsLost: finite(expected) && finite(actual) ? Math.max(0, (expected - actual) / 1000) : null,
    };
  }

  const exactTick = finite(before.rawTickTimestamp)
    && finite(after.rawTickTimestamp)
    && Number(before.rawTickTimestamp) === Number(after.rawTickTimestamp);
  const exactSubstep = Number(before.tickProgress) === Number(after.tickProgress);
  const exactTickElapsed = Number(before.tickElapsedMs) === Number(after.tickElapsedMs);
  const exactForming = same(before.formingCandle, after.formingCandle);
  const exactCommitted = Number(before.committedCandleIndex) === Number(after.committedCandleIndex);
  const exactMode = before.replayMode === after.replayMode;
  const exactPlayPause = before.playPauseState === after.playPauseState;
  const exactCadence = same(before.cadence ?? before.loopKind, after.cadence ?? after.loopKind);
  const exactFormingOhlc = same(
    before.formingCandle && {
      open: before.formingCandle.open, high: before.formingCandle.high,
      low: before.formingCandle.low, close: before.formingCandle.close,
    },
    after.formingCandle && {
      open: after.formingCandle.open, high: after.formingCandle.high,
      low: after.formingCandle.low, close: after.formingCandle.close,
    },
  );
  const exact = {
    mode: exactMode,
    playPause: exactPlayPause,
    cadence: exactCadence,
    rawTick: exactTick,
    tickElapsed: exactTickElapsed,
    substep: exactSubstep,
    formingCandle: exactForming,
    formingOhlc: exactFormingOhlc,
    committedIndex: exactCommitted,
  };

  if (cell.kind === 'candle-mode-control') {
    return {
      verdict: exactTick && exactMode && exactPlayPause
        ? 'GREEN_EXACT_CANDLE_CONTROL' : RED.CANDLE_CONTROL_RESTORE,
      exact, secondsLost, scope,
    };
  }
  if (cell.kind === 'playing-refresh') {
    return {
      verdict: exactTick ? 'GREEN_EXACT_PLAYHEAD' : RED.PLAYING_CHECKPOINT_STALE,
      exact, secondsLost, scope,
    };
  }
  return {
    verdict: exactTick && exactTickElapsed && exactSubstep && exactForming
      && exactFormingOhlc && exactCommitted && exactMode
      ? 'GREEN_EXACT_FORMING_RESTORE' : RED.FORMING_STATE_OMITTED,
    exact, secondsLost, scope,
  };
}

export function summarizeReplayRestoreMatrix(cells) {
  const classified = cells.map((cell) => ({ ...cell, oracle: classifyReplayRestoreCell(cell) }));
  const reds = [...new Set(classified
    .map((cell) => cell.oracle.verdict)
    .filter((verdict) => String(verdict).startsWith('RED_')))];
  return {
    verdict: reds.length ? 'RED' : (classified.every((cell) =>
      String(cell.oracle.verdict).startsWith('GREEN_')) ? 'GREEN' : 'BLOCKED'),
    mechanisms: {
      checkpointCadence: reds.includes(RED.PLAYING_CHECKPOINT_STALE),
      formingTickStateOmitted: reds.includes(RED.FORMING_STATE_OMITTED),
      displayTimestampOffByOne: reds.includes(RED.DISPLAY_TIMESTAMP_OFF_BY_ONE),
    },
    mapping: {
      MC_RESTORE: ['candle-mode-control', 'paused-tick-refresh', 'playing-refresh'],
      M8: ['paused-tick-refresh', 'tick-exit-reentry', 'playing-refresh'],
      M25: ['forming-candle-hover'],
    },
    cells: classified,
  };
}
