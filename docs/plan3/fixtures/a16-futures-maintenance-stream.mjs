/**
 * Synthetic NQ stream: ticks/bars only outside 17:00–18:00 ET on weekdays;
 * includes winter + summer weekday samples with no maintenance-hour bars.
 */

import {
  SUMMER_MAINTENANCE_OPEN_MS,
  SUMMER_PRE_MAINTENANCE_OPEN_MS,
  WINTER_MAINTENANCE_OPEN_MS,
} from './a16-tz-anchors.mjs';

const HOUR_MS = 60 * 60 * 1000;

/**
 * @param {number} barOpenMs
 * @param {number} price
 */
function barAt(barOpenMs, price) {
  return {
    t: barOpenMs,
    o: price,
    h: price + 1,
    l: price - 1,
    c: price,
    v: 50,
  };
}

/**
 * @returns {{ symbol: string, barDurationMs: number, ticks: { t: number, price: number }[], bars: { t: number, o: number, h: number, l: number, c: number, v: number }[] }}
 */
export function buildGreenFuturesMaintenanceStream() {
  const barDurationMs = HOUR_MS;
  const winterBarOpen = WINTER_MAINTENANCE_OPEN_MS - HOUR_MS;
  const summerBarOpen = SUMMER_PRE_MAINTENANCE_OPEN_MS;
  const bars = [barAt(winterBarOpen, 18000), barAt(summerBarOpen, 22000)];
  const ticks = bars.flatMap((b) => [{ t: b.t + 5 * 60 * 1000, price: b.o + 0.25 }]);
  return {
    symbol: 'NQ1!',
    barDurationMs,
    ticks,
    bars,
  };
}

/** @returns {typeof buildGreenFuturesMaintenanceStream extends () => infer R ? R : never} */
export function buildGreenFxControlStream() {
  const barDurationMs = HOUR_MS;
  const open = SUMMER_MAINTENANCE_OPEN_MS;
  const bars = [barAt(open, 1.08)];
  const ticks = [{ t: open + 60_000, price: 1.0801 }];
  return {
    symbol: 'EURUSD',
    barDurationMs,
    ticks,
    bars,
  };
}
