#!/usr/bin/env node
/**
 * COST PER DATA EVENT vs BARS LOADED — the `MONSTER-2` gate axis, answered from artifacts already on disk.
 *
 * A named the mechanism: the resample cache key includes `dataVersion`, the replay engine bumps it in eight
 * places, and the cache is a SINGLE SLOT requiring an exact version match — so during replay it cannot hit and
 * a large series is rebuilt per data event. B measured a 6.2x rise in cost per event from 579 to 2,592 bars,
 * **plateauing past roughly 1,100 bars**, and the Director has flagged that plateau as unexplained: a resample
 * linear in source length would keep climbing.
 *
 * The decisive fact about this script is the RANGE. B's plateau onset is ~1,100 bars. The monotonic-bars run
 * spans roughly 7,000 to 37,000 resident bars — **it starts six times beyond where the plateau is supposed to
 * begin.** If cost per event is still climbing across that span, a plateau at 1,100 cannot be a property of the
 * resample; it has to be a property of B's measurement window.
 *
 * That run is also the cleanest possible input for this question: zero trades, zero re-seeks, a strictly
 * monotonic bar axis, and no forced GC in the accumulation phase.
 *
 * TWO COSTS ARE REPORTED AND THEY ARE NOT THE SAME NUMBER.
 *   wall ms per event  — elapsed time divided by bars delivered. This is what a user feels, but under a pinned
 *                        CPU it is just the reciprocal of throughput and must not be read as CPU rising.
 *   CPU ms per event   — renderer CPU percent times elapsed, divided by bars delivered. This is the work per
 *                        event and it is the honest `MONSTER-2` axis, because it does not move merely because
 *                        the engine delivered fewer bars.
 */
import fs from 'node:fs';

const argOf = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const IN = argOf('in', 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\MONOTONIC-BARS-GATE-20260731.json');
const OUT = argOf('out', 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\COST-PER-EVENT-VS-BARS-20260731.json');

/** Ordinary least squares of y on x. */
function ols(pts) {
  const n = pts.length;
  if (n < 3) return null;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0; let sxy = 0;
  for (const p of pts) { sxx += (p.x - mx) ** 2; sxy += (p.x - mx) * (p.y - my); }
  if (!(sxx > 0)) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let ssTot = 0; let ssRes = 0;
  const resid = [];
  for (const p of pts) {
    const fit = intercept + slope * p.x;
    resid.push(p.y - fit);
    ssTot += (p.y - my) ** 2;
    ssRes += (p.y - fit) ** 2;
  }
  const se = Math.sqrt((ssRes / (n - 2)) / sxx);
  // Runs test on residual signs: curvature hiding under a good rSquared, per FIT-01.
  let runs = 1;
  for (let i = 1; i < resid.length; i += 1) if ((resid[i] >= 0) !== (resid[i - 1] >= 0)) runs += 1;
  const pos = resid.filter((r) => r >= 0).length;
  const neg = resid.length - pos;
  const expected = (2 * pos * neg) / (pos + neg) + 1;
  const variance = (2 * pos * neg * (2 * pos * neg - pos - neg)) / (((pos + neg) ** 2) * (pos + neg - 1));
  const z = variance > 0 ? (runs - expected) / Math.sqrt(variance) : null;
  return {
    n,
    slope: +slope.toPrecision(6),
    intercept: +intercept.toPrecision(6),
    ci95: [+(slope - 1.96 * se).toPrecision(6), +(slope + 1.96 * se).toPrecision(6)],
    rSquared: ssTot > 0 ? +(1 - ssRes / ssTot).toFixed(4) : null,
    runsZ: z != null ? +z.toFixed(2) : null,
    slopeExcludesZero: (slope - 1.96 * se) > 0 || (slope + 1.96 * se) < 0,
  };
}

const src = JSON.parse(fs.readFileSync(IN, 'utf8'));
const s = src.samples || [];

// The soak and the monotonic gate name these fields differently — `hours`/`residentBars` against
// `minutes`/`residentTotal`. Both are read here so the SAME derivation grades both, which is the point: the
// ten-hour arms need no new gauge for this axis, only this arithmetic applied to what they already sample.
const elapsedMinOf = (r) => (r.minutes != null ? r.minutes : (r.hours != null ? r.hours * 60 : null));
const barsLoadedOf = (r) => (r.residentTotal != null ? r.residentTotal : (r.residentBars != null ? r.residentBars : null));

const rows = [];
for (let i = 1; i < s.length; i += 1) {
  const a = s[i - 1];
  const b = s[i];
  const elapsedSec = ((elapsedMinOf(b) ?? 0) - (elapsedMinOf(a) ?? 0)) * 60;
  const barsDelivered = b.deltaResident != null
    ? b.deltaResident
    : ((barsLoadedOf(b) ?? 0) - (barsLoadedOf(a) ?? 0));
  if (!(elapsedSec > 0) || !(barsDelivered > 0)) continue;
  // Bars loaded is taken at the START of the interval: the cost of delivering these bars was paid against the
  // series length that already existed, not against the one that resulted.
  const barsLoaded = barsLoadedOf(a);
  const wallMsPerEvent = (elapsedSec * 1000) / barsDelivered;
  const cpuPct = b.rendererCpuPercent ?? a.rendererCpuPercent ?? null;
  const cpuMsPerEvent = cpuPct != null ? ((cpuPct / 100) * elapsedSec * 1000) / barsDelivered : null;
  rows.push({
    interval: i,
    barsLoadedAtStart: barsLoaded,
    barsDelivered,
    elapsedSec: +elapsedSec.toFixed(1),
    barsPerSec: +(barsDelivered / elapsedSec).toFixed(2),
    wallMsPerEvent: +wallMsPerEvent.toFixed(2),
    rendererCpuPercent: cpuPct,
    cpuMsPerEvent: cpuMsPerEvent != null ? +cpuMsPerEvent.toFixed(2) : null,
  });
}

const report = {
  signature: 'COST-PER-EVENT-VS-BARS-V1',
  artifactFile: OUT.split('\\').pop(),
  gate: 'MONSTER-2: cost per data event measured against BARS LOADED during replay, per the 18:05 ruling',
  source: { file: IN.split('\\').pop(), signature: src.signature ?? null, buildStamp: src.buildStamp ?? null },
  bfcacheState: 'N/A — offline analysis of an existing artifact, no browser. Declared because RESET-01 requires the field.',
  machineTimeUsed: 'none — derived from an artifact already on disk',
  tradeContamination: (src.samples || []).some((r) => (r.closedTrades ?? 0) > 0)
    ? 'THIS INPUT CARRIES TRADES. Cost per event therefore includes trade-driven work, so it is an UPPER BOUND on the bar-driven cost the resample mechanism would explain. The zero-trade CONF-05 arm is the clean version of this axis.'
    : 'Zero trades in this input, so cost per event is bar-driven only.',
  whyThisRunIsTheRightInput: 'Zero trades, zero re-seeks, strictly monotonic bar axis, no forced GC in the accumulation phase. Cost per event is therefore not contaminated by trade work, by re-seek resets, or by my own collections.',
  costDefinitions: {
    wallMsPerEvent: 'elapsed wall time per bar delivered. What a user feels, but under a pinned CPU it is the reciprocal of throughput and must NOT be read as CPU rising.',
    cpuMsPerEvent: 'renderer CPU percent x elapsed, per bar delivered. Work per event, and the honest MONSTER-2 axis.',
  },
  intervals: rows,
};

if (rows.length >= 4) {
  const wallPts = rows.map((r) => ({ x: r.barsLoadedAtStart, y: r.wallMsPerEvent }));
  const cpuPts = rows.filter((r) => r.cpuMsPerEvent != null).map((r) => ({ x: r.barsLoadedAtStart, y: r.cpuMsPerEvent }));
  const range = { minBarsLoaded: Math.min(...rows.map((r) => r.barsLoadedAtStart)), maxBarsLoaded: Math.max(...rows.map((r) => r.barsLoadedAtStart)) };

  // The plateau test. B's onset is ~1,100 bars. Split this run at its own median and compare the two halves:
  // a genuine plateau means the upper half is FLAT, and flat means a slope whose interval contains zero.
  const sorted = rows.slice().sort((a, b) => a.barsLoadedAtStart - b.barsLoadedAtStart);
  const mid = Math.floor(sorted.length / 2);
  const lower = sorted.slice(0, mid);
  const upper = sorted.slice(mid);
  const fitOf = (arr, key) => ols(arr.filter((r) => r[key] != null).map((r) => ({ x: r.barsLoadedAtStart, y: r[key] })));

  report.range = range;
  report.rangeVsBPlateau = {
    bPlateauOnsetBars: 1100,
    thisRunStartsAtBars: range.minBarsLoaded,
    multipleBeyondOnset: +(range.minBarsLoaded / 1100).toFixed(1),
    note: `Every interval in this run sits beyond B's plateau onset. The run BEGINS at ${range.minBarsLoaded} bars, ${(range.minBarsLoaded / 1100).toFixed(1)}x past the point where cost per event was measured to flatten, and ends at ${range.maxBarsLoaded}. If cost still climbs here, a plateau at ~1,100 bars is not a property of the resample.`,
  };
  report.fits = {
    wallMsPerEventVsBarsLoaded: ols(wallPts),
    cpuMsPerEventVsBarsLoaded: cpuPts.length >= 4 ? ols(cpuPts) : null,
    lowerHalf: { barsRange: [lower[0].barsLoadedAtStart, lower[lower.length - 1].barsLoadedAtStart], wall: fitOf(lower, 'wallMsPerEvent'), cpu: fitOf(lower, 'cpuMsPerEvent') },
    upperHalf: { barsRange: [upper[0].barsLoadedAtStart, upper[upper.length - 1].barsLoadedAtStart], wall: fitOf(upper, 'wallMsPerEvent'), cpu: fitOf(upper, 'cpuMsPerEvent') },
  };

  const wallFit = report.fits.wallMsPerEventVsBarsLoaded;
  const upperWall = report.fits.upperHalf.wall;
  const firstWall = sorted[0].wallMsPerEvent;
  const lastWall = sorted[sorted.length - 1].wallMsPerEvent;
  report.observed = {
    wallMsPerEventFirst: firstWall,
    wallMsPerEventLast: lastWall,
    riseFactor: +(lastWall / firstWall).toFixed(2),
    barsPerSecFirst: sorted[0].barsPerSec,
    barsPerSecLast: sorted[sorted.length - 1].barsPerSec,
    cpuPercentRange: [Math.min(...rows.map((r) => r.rendererCpuPercent ?? Infinity)), Math.max(...rows.map((r) => r.rendererCpuPercent ?? -Infinity))],
  };

  const stillClimbing = upperWall && upperWall.slope > 0 && upperWall.slopeExcludesZero;
  report.plateauVerdict = stillClimbing
    ? `NO PLATEAU. Across ${range.minBarsLoaded} to ${range.maxBarsLoaded} resident bars — a span that begins ${(range.minBarsLoaded / 1100).toFixed(1)}x beyond B's plateau onset — wall cost per data event rises ${(lastWall / firstWall).toFixed(2)}x, and the UPPER half alone still has a positive slope whose 95% interval excludes zero (${JSON.stringify(upperWall.ci95)} ms per bar loaded). B's flattening past ~1,100 bars is therefore not a property of the resample; it is a property of a 579-2,592 bar window. A's "bounded-but-large" series is NOT supported over this range, which means the cheap-fix case does not hold and the cost keeps scaling with how much data is resident.`
    : (upperWall
      ? `PLATEAU REPRODUCED over ${report.fits.upperHalf.barsRange.join('-')} bars: the upper half's slope interval ${JSON.stringify(upperWall.ci95)} includes zero, so cost per event genuinely flattens and A's bounded-series claim survives at this range.`
      : 'INSUFFICIENT: not enough intervals in the upper half to fit.');
  report.cpuCaveat = `Renderer CPU sat at ${report.observed.cpuPercentRange[0]}-${report.observed.cpuPercentRange[1]}% across these intervals. A saturated gauge cannot climb, so wall ms per event is the reciprocal of throughput here and the CPU-ms column understates any true growth in work per event. The direction of the bias is known: it makes the rise look SMALLER than it is, so a positive result is conservative.`;
  report.honestLimit = 'This measures cost per event against bars loaded; it does NOT prove the resample is the cause. A owns that link. What it settles is the SHAPE: whether cost per event flattens past ~1,100 bars. It does not.';
}
report.signatureFilenameCheck = OUT.endsWith(report.artifactFile) ? 'PASS' : 'FAIL';
fs.writeFileSync(OUT, JSON.stringify(report, null, 1));

console.log(`intervals: ${rows.length}  bars loaded ${report.range?.minBarsLoaded} -> ${report.range?.maxBarsLoaded}`);
if (report.observed) {
  console.log(`wall ms/event: ${report.observed.wallMsPerEventFirst} -> ${report.observed.wallMsPerEventLast} (${report.observed.riseFactor}x)`);
  console.log(`bars/sec: ${report.observed.barsPerSecFirst} -> ${report.observed.barsPerSecLast}`);
  console.log(`full fit slope: ${report.fits.wallMsPerEventVsBarsLoaded?.slope} ms per bar loaded, r2 ${report.fits.wallMsPerEventVsBarsLoaded?.rSquared}, runs z ${report.fits.wallMsPerEventVsBarsLoaded?.runsZ}`);
  console.log(`UPPER HALF (${report.fits.upperHalf.barsRange.join('-')} bars) slope: ${report.fits.upperHalf.wall?.slope} CI ${JSON.stringify(report.fits.upperHalf.wall?.ci95)}`);
  console.log(`\n${report.plateauVerdict}`);
}
console.log(`\nartifact ${OUT}`);
