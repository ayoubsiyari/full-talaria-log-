/**
 * Deterministic America/New_York wall-time anchors for A16 maintenance-window proofs.
 * Used by fixtures and tests — not live market data.
 */

/** @param {number} epochMs */
export function nyWallFromEpoch(epochMs) {
  const d = new Date(epochMs);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const bag = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    weekday: weekdayMap[bag.weekday] ?? -1,
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour === '24' ? '0' : bag.hour),
    minute: Number(bag.minute),
    second: Number(bag.second),
  };
}

/**
 * Find epoch ms for a given NY local civil datetime (iterative — fixtures only, tiny search).
 * @param {{ year: number, month: number, day: number, hour: number, minute?: number, second?: number }} local
 */
export function epochMsForNyLocal(local) {
  const minute = local.minute ?? 0;
  const second = local.second ?? 0;
  let guess = Date.UTC(local.year, local.month - 1, local.day, local.hour + 5, minute, second);
  for (let i = 0; i < 8; i += 1) {
    const w = nyWallFromEpoch(guess);
    const targetMins = local.hour * 60 + minute;
    const actualMins = w.hour * 60 + w.minute;
    const dayDelta =
      Date.UTC(w.year, w.month - 1, w.day) - Date.UTC(local.year, local.month - 1, local.day);
    guess -= dayDelta + (actualMins - targetMins) * 60_000 + (w.second - second) * 1000;
    if (
      w.year === local.year &&
      w.month === local.month &&
      w.day === local.day &&
      w.hour === local.hour &&
      w.minute === minute &&
      w.second === second
    ) {
      return guess;
    }
  }
  throw new Error(`a16-tz-anchors: could not resolve NY local ${JSON.stringify(local)}`);
}

/** Winter EST sample: 2026-01-14 Wed 17:00:00 America/New_York */
export const WINTER_MAINTENANCE_OPEN_MS = epochMsForNyLocal({
  year: 2026,
  month: 1,
  day: 14,
  hour: 17,
  minute: 0,
  second: 0,
});

/** Summer EDT sample: 2026-07-15 Wed 17:00:00 America/New_York */
export const SUMMER_MAINTENANCE_OPEN_MS = epochMsForNyLocal({
  year: 2026,
  month: 7,
  day: 15,
  hour: 17,
  minute: 0,
  second: 0,
});

/** Same summer day 16:59 ET — outside maintenance window */
export const SUMMER_PRE_MAINTENANCE_OPEN_MS = epochMsForNyLocal({
  year: 2026,
  month: 7,
  day: 15,
  hour: 16,
  minute: 59,
  second: 0,
});
