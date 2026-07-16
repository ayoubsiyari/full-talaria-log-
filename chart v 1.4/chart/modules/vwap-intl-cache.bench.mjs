/**
 * A7 fix #1 — VWAP Intl formatter cache micro-benchmark (prep only).
 * Replicates chart-indicators-full.js vwapBarPartsInTimezone (2184-2216) allocation pattern.
 *
 * Run: node "chart v 1.4/chart/modules/vwap-intl-cache.bench.mjs"
 */
'use strict';

const BAR_COUNT = 100_000;
const RUNS = 5;
const TZ = 'America/New_York';

function makeBars(n, msPerBar = 60_000) {
  const t0 = Date.UTC(2024, 0, 2, 14, 0, 0);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = t0 + i * msPerBar;
    out[i] = { t };
  }
  return out;
}

/** Production — new Intl.DateTimeFormat per bar (chart-indicators-full.js:2184-2216). */
function vwapBarPartsInTimezonePerBarAlloc(bar, tzId) {
  const t = bar && bar.t != null ? Number(bar.t) : NaN;
  if (!Number.isFinite(t)) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tzId || 'Etc/UTC',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(new Date(t));
    const get = (type) => {
      const p = parts.find((x) => x.type === type);
      return p ? parseInt(p.value, 10) : 0;
    };
    return {
      y: get('year'),
      mo: get('month') - 1,
      day: get('day'),
      dec: get('hour') + get('minute') / 60,
    };
  } catch (e) {
    const d = new Date(t);
    return {
      y: d.getUTCFullYear(),
      mo: d.getUTCMonth(),
      day: d.getUTCDate(),
      dec: d.getUTCHours() + d.getUTCMinutes() / 60,
    };
  }
}

/** Proposed fix #1 — per-timezone formatter cache (specced, not in product yet). */
const _vwapBarPartsFmtCache = Object.create(null);

function vwapCachedBarPartsFormatter(tzId) {
  const key = tzId || 'Etc/UTC';
  if (!_vwapBarPartsFmtCache[key]) {
    _vwapBarPartsFmtCache[key] = new Intl.DateTimeFormat('en-GB', {
      timeZone: key,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
  }
  return _vwapBarPartsFmtCache[key];
}

function vwapBarPartsInTimezoneCached(bar, tzId) {
  const t = bar && bar.t != null ? Number(bar.t) : NaN;
  if (!Number.isFinite(t)) return null;
  try {
    const parts = vwapCachedBarPartsFormatter(tzId).formatToParts(new Date(t));
    const get = (type) => {
      const p = parts.find((x) => x.type === type);
      return p ? parseInt(p.value, 10) : 0;
    };
    return {
      y: get('year'),
      mo: get('month') - 1,
      day: get('day'),
      dec: get('hour') + get('minute') / 60,
    };
  } catch (e) {
    const d = new Date(t);
    return {
      y: d.getUTCFullYear(),
      mo: d.getUTCMonth(),
      day: d.getUTCDate(),
      dec: d.getUTCHours() + d.getUTCMinutes() / 60,
    };
  }
}

function vwapSessionAnchorKey(bar, partsFn) {
  const rolloverDec = 17;
  const parts = partsFn(bar, TZ);
  if (!parts) return '0';
  let { y, mo, day, dec } = parts;
  if (dec >= rolloverDec) {
    const d = new Date(Date.UTC(y, mo, day));
    d.setUTCDate(d.getUTCDate() + 1);
    y = d.getUTCFullYear();
    mo = d.getUTCMonth();
    day = d.getUTCDate();
  }
  return `${y}-${mo}-${day}`;
}

function benchSessionVwapLoop(bars, partsFn) {
  const n = bars.length;
  let cumPV = 0;
  let cumVol = 0;
  let prevKey = null;
  for (let i = 0; i < n; i++) {
    const key = vwapSessionAnchorKey(bars[i], partsFn);
    if (prevKey !== null && key !== prevKey) {
      cumPV = 0;
      cumVol = 0;
    }
    prevKey = key;
    const vol = 100;
    const src = 1.08;
    cumPV += src * vol;
    cumVol += vol;
  }
  return cumVol;
}

function runTimed(label, fn) {
  const t0 = performance.now();
  const result = fn();
  const ms = performance.now() - t0;
  return { label, ms, result };
}

function summarize(label, samples) {
  const sorted = samples.slice().sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
  return {
    label,
    min: sorted[0].toFixed(1),
    max: sorted[sorted.length - 1].toFixed(1),
    avg: (sum / sorted.length).toFixed(1),
    p95: p95.toFixed(1),
    runs: sorted.length,
  };
}

const bars = makeBars(BAR_COUNT);

console.log(`A7 fix #1 VWAP Intl cache bench — ${BAR_COUNT} bars, ${RUNS} runs, tz=${TZ}\n`);

const perBarParts = [];
const cachedParts = [];
const perBarLoop = [];
const cachedLoop = [];

for (let r = 0; r < RUNS; r++) {
  perBarParts.push(
    runTimed('vwapBarPartsInTimezone (per-bar Intl alloc)', () => {
      let last = null;
      for (let i = 0; i < bars.length; i++) {
        last = vwapBarPartsInTimezonePerBarAlloc(bars[i], TZ);
      }
      return last;
    }).ms,
  );

  cachedParts.push(
    runTimed('vwapBarPartsInTimezone (cached formatter)', () => {
      let last = null;
      for (let i = 0; i < bars.length; i++) {
        last = vwapBarPartsInTimezoneCached(bars[i], TZ);
      }
      return last;
    }).ms,
  );

  perBarLoop.push(
    runTimed('session VWAP integrate loop (per-bar alloc)', () =>
      benchSessionVwapLoop(bars, vwapBarPartsInTimezonePerBarAlloc),
    ).ms,
  );

  cachedLoop.push(
    runTimed('session VWAP integrate loop (cached formatter)', () =>
      benchSessionVwapLoop(bars, vwapBarPartsInTimezoneCached),
    ).ms,
  );
}

for (const row of [
  summarize('vwapBarPartsInTimezone — per-bar Intl alloc', perBarParts),
  summarize('vwapBarPartsInTimezone — cached formatter', cachedParts),
  summarize('session VWAP loop — per-bar alloc', perBarLoop),
  summarize('session VWAP loop — cached formatter', cachedLoop),
]) {
  console.log(
    `${row.label}: min=${row.min}ms max=${row.max}ms avg=${row.avg}ms p95=${row.p95}ms (${row.runs}/${RUNS})`,
  );
}

const avgPerBar = perBarParts.reduce((a, b) => a + b, 0) / perBarParts.length;
const avgCached = cachedParts.reduce((a, b) => a + b, 0) / cachedParts.length;
const speedup = avgPerBar / avgCached;
console.log(`\nSpeedup (parts only, avg): ${speedup.toFixed(1)}× (${avgPerBar.toFixed(0)}ms → ${avgCached.toFixed(0)}ms)`);

const avgLoopPerBar = perBarLoop.reduce((a, b) => a + b, 0) / perBarLoop.length;
const avgLoopCached = cachedLoop.reduce((a, b) => a + b, 0) / cachedLoop.length;
console.log(
  `Speedup (full session loop, avg): ${(avgLoopPerBar / avgLoopCached).toFixed(1)}× (${avgLoopPerBar.toFixed(0)}ms → ${avgLoopCached.toFixed(0)}ms)`,
);

// Parity spot-check: first/last/mid bar parts match
const iMid = Math.floor(BAR_COUNT / 2);
const iLast = BAR_COUNT - 1;
for (const idx of [0, iMid, iLast]) {
  const a = vwapBarPartsInTimezonePerBarAlloc(bars[idx], TZ);
  const b = vwapBarPartsInTimezoneCached(bars[idx], TZ);
  const same =
    a.y === b.y && a.mo === b.mo && a.day === b.day && Math.abs(a.dec - b.dec) < 1e-9;
  if (!same) {
    console.error('PARITY FAIL at', idx, a, b);
    process.exit(1);
  }
}
console.log('\nParity spot-check (0, mid, last): PASS');
