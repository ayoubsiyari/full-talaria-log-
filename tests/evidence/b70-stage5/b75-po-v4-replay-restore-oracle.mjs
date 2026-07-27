const finite = (value) => Number.isFinite(Number(value));

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
  const exactForming = JSON.stringify(before.formingCandle) === JSON.stringify(after.formingCandle);
  const exactCommitted = Number(before.committedCandleIndex) === Number(after.committedCandleIndex);

  if (cell.kind === 'candle-mode-control') {
    return {
      // currentIndex is raw-timeframe-relative and may legitimately differ after 1h
      // hydrate; the wall-clock candle playhead is the cross-refresh invariant.
      verdict: exactTick ? 'GREEN_EXACT_CANDLE_CONTROL' : RED.CANDLE_CONTROL_RESTORE,
      secondsLost,
    };
  }
  if (cell.kind === 'playing-refresh') {
    return {
      verdict: exactTick ? 'GREEN_EXACT_PLAYHEAD' : RED.PLAYING_CHECKPOINT_STALE,
      secondsLost,
    };
  }
  return {
    verdict: exactTick && exactSubstep && exactForming && exactCommitted
      ? 'GREEN_EXACT_FORMING_RESTORE' : RED.FORMING_STATE_OMITTED,
    exact: { rawTick: exactTick, substep: exactSubstep, formingCandle: exactForming, committedIndex: exactCommitted },
    secondsLost,
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
