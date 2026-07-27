const HOUR_MS = 3_600_000;

export const TAL_01896_RED = Object.freeze({
  WALL_CLOCK_FOR_REPLAY_OPEN: 'RED_WALL_CLOCK_FOR_REPLAY_OPEN',
  INVALID_OPEN_SENTINEL: 'RED_INVALID_OPEN_SENTINEL',
  MIXED_TIMESTAMP_UNITS: 'RED_MIXED_TIMESTAMP_UNITS',
});

export function normalizeEpochMs(value) {
  if (value == null || value === '' || value === false) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric < 100_000_000_000 ? numeric * 1000 : numeric;
}

export function classifyDurationCell(cell) {
  const startMs = normalizeEpochMs(cell.start);
  const endMs = normalizeEpochMs(cell.end);
  const nowMs = normalizeEpochMs(cell.current);
  const open = cell.status === 'open';

  if (startMs == null) {
    return { verdict: TAL_01896_RED.INVALID_OPEN_SENTINEL, hours: null };
  }

  const effectiveEndMs = open ? nowMs : endMs;
  if (effectiveEndMs == null || effectiveEndMs < startMs) {
    return { verdict: TAL_01896_RED.INVALID_OPEN_SENTINEL, hours: null };
  }

  const hours = (effectiveEndMs - startMs) / HOUR_MS;
  if (open && cell.clockDomain === 'replay' && cell.currentClockDomain === 'wall') {
    return {
      verdict: TAL_01896_RED.WALL_CLOCK_FOR_REPLAY_OPEN,
      hours,
      mechanism: 'open duration substitutes wall clock for absent replay close time',
    };
  }

  return {
    verdict: 'GREEN_DURATION_DOMAIN_ALIGNED',
    hours,
    mechanism: open ? 'replay playhead minus replay entry' : 'replay exit minus replay entry',
  };
}

export function formatDurationHours(hours) {
  return Number.isFinite(hours) && hours >= 0
    ? `${Math.round(hours).toLocaleString('en-US')}h`
    : '—';
}

export function summarizeDurationEvidence(cells) {
  const classified = cells.map((cell) => ({ ...cell, oracle: classifyDurationCell(cell) }));
  return {
    verdict: classified.some((cell) => String(cell.oracle.verdict).startsWith('RED_'))
      ? 'RED' : 'GREEN',
    mechanismMapping: {
      start: 'trade open/entry timestamp, normalized once to epoch milliseconds',
      closedEnd: 'trade close/exit timestamp in replay market-clock domain',
      openEnd: 'active replay playhead; null close is state, never epoch-zero sentinel',
      refreshHydration: 'must preserve clock-domain metadata and active replay playhead',
      formatter: 'presentation only; receives elapsed hours and cannot select a clock',
    },
    cells: classified,
  };
}
