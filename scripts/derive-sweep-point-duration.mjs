#!/usr/bin/env node
/**
 * DERIVE-SWEEP-POINT-DURATION — the prerequisite SWEEP-01 names: "derive the minimum viable
 * duration from B1's data and use it everywhere".
 *
 * Method: take B1's two 15-minute arms, truncate each to the first N windows, refit the
 * CPU-ms-per-bar slope, and ask at what N the fit is still usable. "Usable" is defined up front,
 * not chosen to suit the answer:
 *
 *   1. the slope CI must exclude zero — otherwise the point cannot say the level even moved;
 *   2. the truncated slope must land inside the FULL run's CI — otherwise a short point would
 *      have reported a different mechanism than the long one;
 *   3. the CI half-width must be under 50% of the slope — a point whose error bar is bigger than
 *      its estimate cannot be a point on a curve.
 *
 * Both arms must pass at the chosen N, because a sweep runs its points at every dose including
 * the shallow ones where the signal is weakest.
 */
import fs from 'node:fs';

import { fitTrend } from './lib/duration-trend.mjs';

const EVIDENCE = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';

/** CPU-ms/bar against bars played, in thousands of bars, matching the A/B's own x-axis. */
function fitArm(samples, upToN) {
  const pts = samples.slice(0, upToN)
    .filter((s) => Number.isFinite(s.cpuMsPerBar) && Number.isFinite(s.atBars))
    .map((s) => ({ hours: s.atBars / 1000, value: s.cpuMsPerBar }));
  if (pts.length < 4) return null;
  const fit = fitTrend(pts, { label: `first ${upToN} windows`, minSpanHours: 0 });
  const minutes = samples[Math.min(upToN, samples.length) - 1].minutes;
  return {
    windows: upToN,
    minutes: +minutes.toFixed(2),
    slope: fit.perHour ?? fit.slope ?? null,
    ci: fit.slopeCi95 ?? null,
    verdict: fit.verdict,
  };
}

function judge(row, fullCi) {
  if (!row || !row.ci) return { usable: false, why: 'no fit' };
  const [lo, hi] = row.ci;
  const excludesZero = (lo > 0 && hi > 0) || (lo < 0 && hi < 0);
  const half = (hi - lo) / 2;
  const halfWidthRatio = Math.abs(row.slope) > 0 ? half / Math.abs(row.slope) : Infinity;
  const insideFull = fullCi ? (row.slope >= fullCi[0] && row.slope <= fullCi[1]) : null;
  const usable = excludesZero && insideFull === true && halfWidthRatio < 0.5;
  return {
    usable,
    excludesZero,
    slopeInsideFullRunCi: insideFull,
    ciHalfWidthAsFractionOfSlope: +halfWidthRatio.toFixed(3),
    why: usable ? null : [
      !excludesZero ? 'CI includes zero' : null,
      insideFull === false ? 'slope outside the full-run CI' : null,
      halfWidthRatio >= 0.5 ? 'CI half-width >= 50% of the slope' : null,
    ].filter(Boolean).join('; '),
  };
}

const arms = [
  { name: 'two indicators', file: `${EVIDENCE}\\B1-INDICATOR-AB-SAMEBUILD-ARM2-20260731.json`, key: 'twoIndicators' },
  { name: 'zero indicators', file: `${EVIDENCE}\\B1-INDICATOR-AB-SAMEBUILD-ARM0-20260731.json`, key: 'zeroIndicators' },
];

const report = {
  signature: 'DERIVE-SWEEP-POINT-DURATION-V1',
  ruling: '3df92902c SWEEP-01',
  generatedAt: new Date().toISOString(),
  criteria: {
    ciExcludesZero: true,
    slopeInsideFullRunCi: true,
    ciHalfWidthUnderFractionOfSlope: 0.5,
    note: 'Criteria fixed before looking at the answer. Both arms must pass at the chosen N.',
  },
  arms: [],
};

for (const arm of arms) {
  const art = JSON.parse(fs.readFileSync(arm.file, 'utf8'));
  const samples = art.arms[arm.key].samples || [];
  const full = fitArm(samples, samples.length);
  const rows = [];
  for (const n of [4, 6, 8, 10, 12, 16, 20, 24, samples.length]) {
    if (n > samples.length) continue;
    const row = fitArm(samples, n);
    if (row) rows.push({ ...row, ...judge(row, full.ci) });
  }
  report.arms.push({ arm: arm.name, totalWindows: samples.length, fullRun: full, truncations: rows });
  console.error(`\n=== ${arm.name} (full: slope ${full.slope} CI[${full.ci}] over ${full.minutes} min) ===`);
  for (const r of rows) {
    console.error(`  ${String(r.windows).padStart(2)} windows / ${String(r.minutes).padStart(5)} min: slope ${String(r.slope).padStart(7)} CI[${r.ci}] halfWidth/slope=${r.ciHalfWidthAsFractionOfSlope} ${r.usable ? 'USABLE' : `no — ${r.why}`}`);
  }
}

// The chosen duration is the smallest N usable in BOTH arms.
const usableSets = report.arms.map((a) => new Set(a.truncations.filter((r) => r.usable).map((r) => r.windows)));
const bothUsable = [...usableSets[0]].filter((n) => usableSets.every((s) => s.has(n))).sort((a, b) => a - b);
const chosenWindows = bothUsable[0] ?? null;
const minutesAt = (n) => Math.max(...report.arms.map((a) => a.truncations.find((r) => r.windows === n)?.minutes ?? 0));

report.chosen = chosenWindows ? {
  windows: chosenWindows,
  minutesObserved: minutesAt(chosenWindows),
  // Round up to a whole minute and add a window's slack, since a sweep point boots into a
  // slightly different state each time and must not land one window short of usable.
  pointMinutes: Math.ceil(minutesAt(chosenWindows)) + 1,
  usableInBothArms: true,
} : { windows: null, pointMinutes: 15, usableInBothArms: false, fallbackReason: 'no truncation passed in both arms; fall back to B1 length' };

console.error(`\nCHOSEN: ${report.chosen.windows} windows = ${report.chosen.minutesObserved} min observed -> point duration ${report.chosen.pointMinutes} min per sweep point`);
fs.writeFileSync(`${EVIDENCE}\\SWEEP-POINT-DURATION-20260731.json`, JSON.stringify(report, null, 1));
