/**
 * CLOCK-01 — every wall-clock number carries its offset, including the ones
 * inside prose.
 *
 * Three investigations on 2026-08-03 were launched by the absence of an offset
 * rather than by any disagreement in the underlying events: D's b122 timing
 * "impossibility" at 22:26+01:00, and the PO's reading that C's cut post-dated
 * the b126 build by four minutes when it preceded it by forty-nine seconds. Each
 * was one consistent sequence read in two clocks. The cost is not the confusion,
 * it is that a bare number looks exactly like a checked one.
 *
 * Emit through these helpers so the offset is not a matter of remembering:
 *   stampUtc()   2026-08-03T12:22:31Z         machine fields, artifacts
 *   stampLocal() 2026-08-03 13:22:31+01:00    prose, logs, board entries
 *   clockOf()    13:22+01:00                  a bare time made citable
 *   both()       13:22:31+01:00 / 12:22:31Z   when two lanes read two clocks
 */

const pad = (n, w = 2) => String(Math.abs(n)).padStart(w, '0');

/** `+01:00` / `-04:00` / `Z` for the host's offset at that instant. */
export function offsetOf(date = new Date()) {
  const mins = -date.getTimezoneOffset();
  if (mins === 0) return 'Z';
  return `${mins < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(mins) / 60))}:${pad(Math.abs(mins) % 60)}`;
}

export function stampUtc(date = new Date()) {
  return `${date.toISOString().slice(0, 19)}Z`;
}

export function stampLocal(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${offsetOf(date)}`;
}

/** Time of day with its offset: the form board prose needs. */
export function clockOf(date = new Date(), { seconds = false } = {}) {
  const hhmm = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return `${seconds ? `${hhmm}:${pad(date.getSeconds())}` : hhmm}${offsetOf(date)}`;
}

/**
 * Both clocks at once. For a number that two lanes will read from two places —
 * a process start time next to an artifact's own UTC field, which is precisely
 * the pairing that produced this afternoon's four-minute phantom.
 */
export function both(date = new Date()) {
  return `${clockOf(date, { seconds: true })} / ${stampUtc(date)}`;
}

/**
 * Parse a stamp that Windows or a shell handed us as local time with no offset,
 * and return it stamped. Absent input returns null rather than "now", because a
 * missing time must not silently become the time of the report.
 */
export function localToStamped(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? both(d) : null;
}
