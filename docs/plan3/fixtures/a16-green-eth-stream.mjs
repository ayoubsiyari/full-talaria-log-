/**
 * Session-faithful synthetic (ticks, bars) for A16 BAR-NO-TICKS invariant.
 * Ticks exist only where bars exist; one weekday ETH segment with 1H bars.
 *
 * Binding to live product `_resampleDataFull` output is follow-up when A lands
 * the calendar — this packet asserts invariants over (ticks, bars) pairs only.
 */

import { SUMMER_PRE_MAINTENANCE_OPEN_MS } from './a16-tz-anchors.mjs';

const HOUR_MS = 60 * 60 * 1000;

/** Bar opens at summer Wed 14:00 ET with four consecutive hourly bars. */
const BAR0_OPEN = SUMMER_PRE_MAINTENANCE_OPEN_MS - 2 * HOUR_MS;

/**
 * @returns {{ symbol: string, barDurationMs: number, ticks: { t: number, price: number }[], bars: { t: number, o: number, h: number, l: number, c: number, v: number }[] }}
 */
export function buildGreenTickBarStream() {
  const barDurationMs = HOUR_MS;
  const bars = [];
  const ticks = [];
  let price = 21000;
  for (let i = 0; i < 4; i += 1) {
    const open = BAR0_OPEN + i * barDurationMs;
    const close = open + barDurationMs - 1;
    price += 5;
    bars.push({
      t: open,
      o: price,
      h: price + 2,
      l: price - 1,
      c: price + 1,
      v: 100 + i,
    });
    ticks.push({ t: open + 15 * 60 * 1000, price: price + 0.5 });
    ticks.push({ t: close, price: price + 1 });
  }
  return {
    symbol: 'NQ',
    barDurationMs,
    ticks,
    bars,
  };
}
