/**
 * BAR-TICK-INVARIANTS-V1 (W33 / A16.3b)
 * Signature: TALARIA_BAR_TICK_INVARIANTS_V1
 *
 * Coverage: soundness (VER-01) — behaviour-covering checks on (ticks, bars) pairs.
 * Not wiring: does not assert product `_resampleDataFull` or chart module presence.
 *
 * Standing invariants:
 *   A16.3b#3 — no bar without at least one tick in [open, nextOpen) (phantom bars).
 *   A16.3 / A16.3b — NQ, ES, GC (and NQ1!, ES1!, GC1!) must not open in [17:00, 18:00)
 *   America/New_York on weekdays (DST via IANA tz data through Intl, never fixed UTC offset).
 *
 * Session-faithful synthetic fixtures live under docs/plan3/fixtures/a16-*.mjs.
 * Hanging live resampler output on this oracle is follow-up when A lands the calendar.
 */

export const BAR_TICK_INVARIANTS_SIGNATURE = 'TALARIA_BAR_TICK_INVARIANTS_V1';

/** @typedef {{ weekday: number, year: number, month: number, day: number, hour: number, minute: number, second: number }} NyWallClock */

/** @typedef {{ t: number, o?: number, h?: number, l?: number, c?: number, v?: number }} Bar */
/** @typedef {{ t: number, price?: number, v?: number }} Tick */

const FUTURES_MAINTENANCE_SYMBOLS = new Set(['NQ', 'ES', 'GC', 'NQ1!', 'ES1!', 'GC1!']);

/**
 * @param {string} symbol
 * @returns {boolean}
 */
export function isFuturesMaintenanceClassSymbol(symbol) {
  const s = String(symbol ?? '').trim().toUpperCase();
  if (s === 'XAUUSD') return false;
  return FUTURES_MAINTENANCE_SYMBOLS.has(s);
}

/**
 * @param {number} epochMs
 * @returns {NyWallClock}
 */
export function nyWallClockFromEpoch(epochMs) {
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
 * Half-open [17:00, 18:00) America/New_York on Mon–Fri.
 * @param {number} barOpenMs — bar open timestamp (epoch ms)
 */
export function barOpenInFuturesMaintenanceWindow(barOpenMs) {
  const w = nyWallClockFromEpoch(barOpenMs);
  if (w.weekday === 0 || w.weekday === 6) return false;
  const mins = w.hour * 60 + w.minute + w.second / 60;
  return mins >= 17 * 60 && mins < 18 * 60;
}

/**
 * @param {Bar} bar
 * @param {number | undefined} nextOpen
 * @param {number} barDurationMs
 */
export function barHalfOpenEnd(bar, nextOpen, barDurationMs) {
  if (nextOpen != null && Number.isFinite(nextOpen)) return nextOpen;
  return bar.t + barDurationMs;
}

/**
 * @param {Bar[]} bars
 * @param {Tick[]} ticks
 * @param {number} barDurationMs
 */
export function findBarsWithZeroTicks(bars, ticks, barDurationMs) {
  const violations = [];
  const sortedTicks = [...ticks].sort((a, b) => a.t - b.t);
  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i];
    const end = barHalfOpenEnd(bar, bars[i + 1]?.t, barDurationMs);
    let count = 0;
    for (const tick of sortedTicks) {
      if (tick.t >= bar.t && tick.t < end) count += 1;
    }
    if (count === 0) {
      violations.push({ barIndex: i, barOpen: bar.t, intervalEnd: end });
    }
  }
  return violations;
}

/**
 * @param {string} symbol
 * @param {Bar[]} bars
 */
export function findMaintenanceWindowBarViolations(symbol, bars) {
  if (!isFuturesMaintenanceClassSymbol(symbol)) return [];
  const violations = [];
  for (let i = 0; i < bars.length; i += 1) {
    if (barOpenInFuturesMaintenanceWindow(bars[i].t)) {
      violations.push({ barIndex: i, barOpen: bars[i].t, ny: nyWallClockFromEpoch(bars[i].t) });
    }
  }
  return violations;
}

/**
 * @param {{ symbol: string, bars: Bar[], ticks: Tick[], barDurationMs: number }} input
 */
export function runBarNoTicksInvariant(input) {
  const violations = findBarsWithZeroTicks(input.bars, input.ticks, input.barDurationMs);
  return {
    cell: 'BAR-NO-TICKS-INVARIANT',
    pass: violations.length === 0,
    status: violations.length === 0 ? 'GREEN' : 'RED',
    violations,
  };
}

/**
 * @param {{ symbol: string, bars: Bar[], ticks?: Tick[], barDurationMs?: number }} input
 */
export function runFuturesMaintenanceGapInvariant(input) {
  const violations = findMaintenanceWindowBarViolations(input.symbol, input.bars);
  return {
    cell: 'FUTURES-MAINTENANCE-GAP-NQ-ES-GC',
    pass: violations.length === 0,
    status: violations.length === 0 ? 'GREEN' : 'RED',
    violations,
    symbol: input.symbol,
  };
}

/**
 * @param {{ symbol: string, bars: Bar[], ticks: Tick[], barDurationMs: number }} base
 * @param {{ bar: Bar }} injection
 */
export function withInjectedBar(base, injection) {
  const bars = [...base.bars, injection.bar].sort((a, b) => a.t - b.t);
  return { ...base, bars };
}

/**
 * @param {{ symbol: string, bars: Bar[], ticks: Tick[], barDurationMs: number }} base
 * @param {{ barOpen: number, durationMs: number }} gap
 */
export function withTicklessBarInjection(base, gap) {
  const phantom = {
    t: gap.barOpen,
    o: 1,
    h: 1,
    l: 1,
    c: 1,
    v: 0,
  };
  return withInjectedBar(base, { bar: phantom });
}

/**
 * NC-BAR-NO-TICKS-MUTATION — inject tickless bar → RED; base → GREEN.
 * @param {{ symbol: string, bars: Bar[], ticks: Tick[], barDurationMs: number }} greenFixture
 * @param {number} ticklessBarOpen
 */
export function runNcBarNoTicksMutation(greenFixture, ticklessBarOpen) {
  const base = runBarNoTicksInvariant(greenFixture);
  const mutated = withTicklessBarInjection(greenFixture, {
    barOpen: ticklessBarOpen,
    durationMs: greenFixture.barDurationMs,
  });
  const injected = runBarNoTicksInvariant(mutated);
  const pass = base.status === 'GREEN' && injected.status === 'RED';
  return {
    cell: 'NC-BAR-NO-TICKS-MUTATION',
    pass,
    status: pass ? 'GREEN' : 'RED',
    baseStatus: base.status,
    injectedStatus: injected.status,
    injectedViolations: injected.violations,
  };
}

/**
 * @param {{ symbol: string, bars: Bar[], ticks: Tick[], barDurationMs: number }} futuresFixture
 * @param {{ symbol: string, bars: Bar[], ticks: Tick[], barDurationMs: number }} fxFixture
 * @param {number} maintenanceOpenMs
 */
export function runNcMaintenanceGapMutation(futuresFixture, fxFixture, maintenanceOpenMs) {
  const maintBar = {
    t: maintenanceOpenMs,
    o: 100,
    h: 101,
    l: 99,
    c: 100,
    v: 10,
  };
  const futuresMutated = withInjectedBar(futuresFixture, { bar: maintBar });
  const fxMutated = withInjectedBar(
    { ...fxFixture, symbol: 'EURUSD' },
    { bar: { ...maintBar, o: 1.09, h: 1.1, l: 1.08, c: 1.09 } },
  );
  const futuresResult = runFuturesMaintenanceGapInvariant(futuresMutated);
  const fxResult = runFuturesMaintenanceGapInvariant(fxMutated);
  const pass = futuresResult.status === 'RED' && fxResult.status === 'GREEN';
  return {
    cell: 'NC-MAINTENANCE-GAP-MUTATION',
    pass,
    status: pass ? 'GREEN' : 'RED',
    futuresStatus: futuresResult.status,
    fxStatus: fxResult.status,
    futuresViolations: futuresResult.violations,
  };
}

/**
 * @param {number} maintenanceOpenMs
 */
export function runNcXauusdNotGc(maintenanceOpenMs) {
  const bar = {
    t: maintenanceOpenMs,
    o: 2000,
    h: 2001,
    l: 1999,
    c: 2000,
    v: 5,
  };
  const stream = {
    symbol: 'XAUUSD',
    barDurationMs: 60 * 60 * 1000,
    ticks: [{ t: maintenanceOpenMs + 1000, price: 2000 }],
    bars: [bar],
  };
  const maintenance = runFuturesMaintenanceGapInvariant(stream);
  const pass = maintenance.status === 'GREEN' && !isFuturesMaintenanceClassSymbol('XAUUSD');
  return {
    cell: 'NC-XAUUSD-NOT-GC',
    pass,
    status: pass ? 'GREEN' : 'RED',
    maintenanceStatus: maintenance.status,
  };
}

/**
 * @param {object} opts
 * @param {{ symbol: string, bars: Bar[], ticks: Tick[], barDurationMs: number }} opts.greenTickBar
 * @param {{ symbol: string, bars: Bar[], ticks: Tick[], barDurationMs: number }} opts.greenFutures
 * @param {{ symbol: string, bars: Bar[], ticks: Tick[], barDurationMs: number }} opts.greenFx
 * @param {number} opts.maintenanceOpenMsWinter
 * @param {number} opts.maintenanceOpenMsSummer
 * @param {number} opts.ticklessBarOpenMs
 */
export function runAllCells(opts) {
  const barNoTicks = runBarNoTicksInvariant(opts.greenTickBar);
  const futuresMaint = runFuturesMaintenanceGapInvariant(opts.greenFutures);
  const ncBarTicks = runNcBarNoTicksMutation(opts.greenTickBar, opts.ticklessBarOpenMs);
  const ncMaintWinter = runNcMaintenanceGapMutation(
    opts.greenFutures,
    opts.greenFx,
    opts.maintenanceOpenMsWinter,
  );
  const ncMaintSummer = runNcMaintenanceGapMutation(
    opts.greenFutures,
    opts.greenFx,
    opts.maintenanceOpenMsSummer,
  );
  const ncXau = runNcXauusdNotGc(opts.maintenanceOpenMsSummer);
  const cells = [
    barNoTicks,
    futuresMaint,
    ncBarTicks,
    ncMaintWinter,
    ncMaintSummer,
    ncXau,
  ];
  const allPass = cells.every((c) => c.pass);
  return {
    signature: BAR_TICK_INVARIANTS_SIGNATURE,
    coverage: 'soundness',
    ver: 'VER-01',
    cells,
    allPass,
  };
}

/** @param {ReturnType<typeof runAllCells>} report */
export function formatReport(report) {
  const lines = [
    report.signature,
    `coverage=${report.coverage} (${report.ver})`,
    '',
  ];
  for (const c of report.cells) {
    lines.push(`${c.cell}: ${c.status}${c.pass ? '' : ' (cell failed)'}`);
  }
  lines.push('');
  lines.push(`Summary: ${report.allPass ? 'all cells pass' : 'FAIL'}`);
  return lines.join('\n');
}

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGreenTickBarStream } from '../fixtures/a16-green-eth-stream.mjs';
import {
  buildGreenFuturesMaintenanceStream,
  buildGreenFxControlStream,
} from '../fixtures/a16-futures-maintenance-stream.mjs';
import {
  WINTER_MAINTENANCE_OPEN_MS,
  SUMMER_MAINTENANCE_OPEN_MS,
} from '../fixtures/a16-tz-anchors.mjs';

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {

  const greenTickBar = buildGreenTickBarStream();
  const ticklessOpen = greenTickBar.bars[0].t + greenTickBar.barDurationMs * 2;
  const report = runAllCells({
    greenTickBar,
    greenFutures: buildGreenFuturesMaintenanceStream(),
    greenFx: buildGreenFxControlStream(),
    maintenanceOpenMsWinter: WINTER_MAINTENANCE_OPEN_MS,
    maintenanceOpenMsSummer: SUMMER_MAINTENANCE_OPEN_MS,
    ticklessBarOpenMs: ticklessOpen,
  });
  console.log(formatReport(report));
  if (!report.allPass) process.exitCode = 1;
}
