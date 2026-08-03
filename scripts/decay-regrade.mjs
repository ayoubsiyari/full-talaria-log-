#!/usr/bin/env node
/**
 * DECAY-REGRADE-V1 — derives per-bar cost from a REPLAY-DECAY-HUNT artifact.
 *
 * The live run could not report tickMs: `stepForward` was wrapped in all four realms
 * but never called during playback, so no per-call timing exists. Rather than report a
 * confident zero, the run recorded that gap and this regrade derives per-bar cost from
 * gauges that DID read:
 *
 *   renderer CPU-ms per bar = (cpuPercent/100 x window ms) / bars advanced in that window
 *
 * MEAS-02: this is whole-renderer CPU (all threads) divided by product-observable bar
 * advance. It sees every kind of work, attributes none of it to a function — the profile
 * diff does that. It is valid as a COST-PER-BAR series precisely because CPU was pinned
 * near 100% throughout: when the supply of CPU is fixed, falling throughput is rising
 * cost per bar, with no assumption about where the work happens.
 */
import fs from 'node:fs';

import { fitTrend } from './lib/duration-trend.mjs';

export function regradeDecay(report) {
  const s = (report.samples || []).filter((x) => !x.error
    && Number.isFinite(x.elapsedBarsAllPanels) && Number.isFinite(x.minutes));
  const windows = [];
  for (let i = 1; i < s.length; i += 1) {
    const a = s[i - 1];
    const b = s[i];
    const bars = b.elapsedBarsAllPanels - a.elapsedBarsAllPanels;
    const ms = (b.minutes - a.minutes) * 60_000;
    if (!(bars > 0) || !(ms > 0)) continue;
    const cpu = Number.isFinite(b.rendererCpuPercent) ? b.rendererCpuPercent : null;
    windows.push({
      atBars: b.elapsedBarsAllPanels,
      minutes: +b.minutes.toFixed(2),
      barsAdvanced: bars,
      windowSec: +(ms / 1000).toFixed(1),
      barsPerSec: +((bars / ms) * 1000).toFixed(2),
      cpuPercent: cpu,
      cpuMsPerBar: cpu != null ? +(((cpu / 100) * ms) / bars).toFixed(2) : null,
      longTaskMsPerBar: Number.isFinite(b.longTaskMsTotal) ? +(b.longTaskMsTotal / bars).toFixed(2) : null,
    });
  }
  // The axis is kilobars, not time. It is declared into the fit rather than pasted beside it, so
  // `spanHours` cannot be read as hours: an earlier artifact published `spanHours: 11.682` for a
  // run of 18.5 wall minutes, which is 11,682 bars wearing an hours label.
  const fit = (pick, label, band) => fitTrend(
    windows.map((w) => ({ hours: w.atBars / 1_000, value: pick(w) }))
      .filter((p) => Number.isFinite(p.hours) && Number.isFinite(p.value)),
    { label, flatBandPerHour: band, minSpanHours: 0, xUnit: 'kbars (1,000 bars played, all four panels summed)' },
  );
  const first = windows.slice(0, 5);
  const last = windows.slice(-5);
  const mean = (rows, k) => {
    const v = rows.map((r) => r[k]).filter(Number.isFinite);
    return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) : null;
  };
  return {
    signature: 'DECAY-REGRADE-V1',
    source: report.signature,
    build: report.build?.scriptVersion ?? null,
    zeroTradeControl: report.tradeControl ?? null,
    windows: windows.length,
    barSpan: windows.length ? { from: windows[0].atBars, to: windows.at(-1).atBars } : null,
    /** Recorded because every trend below is per-kbar, so nothing else in this file states how long the run was. */
    wallClockMinutes: windows.length ? +(windows.at(-1).minutes - windows[0].minutes).toFixed(2) : null,
    trends: {
      cpuMsPerBar: fit((w) => w.cpuMsPerBar, 'renderer CPU-ms per bar', 0.5),
      barsPerSec: fit((w) => w.barsPerSec, 'throughput', 0.1),
      longTaskMsPerBar: fit((w) => w.longTaskMsPerBar, 'long-task ms per bar', 0.5),
      cpuPercent: fit((w) => w.cpuPercent, 'renderer CPU percent', 1),
    },
    firstFiveWindows: {
      barsPerSec: mean(first, 'barsPerSec'),
      cpuMsPerBar: mean(first, 'cpuMsPerBar'),
      cpuPercent: mean(first, 'cpuPercent'),
    },
    lastFiveWindows: {
      barsPerSec: mean(last, 'barsPerSec'),
      cpuMsPerBar: mean(last, 'cpuMsPerBar'),
      cpuPercent: mean(last, 'cpuPercent'),
    },
    perBarCostChangePercent: (() => {
      const a = mean(first, 'cpuMsPerBar');
      const b = mean(last, 'cpuMsPerBar');
      return (a && b) ? +(((b - a) / a) * 100).toFixed(1) : null;
    })(),
    throughputChangePercent: (() => {
      const a = mean(first, 'barsPerSec');
      const b = mean(last, 'barsPerSec');
      return (a && b) ? +(((b - a) / a) * 100).toFixed(1) : null;
    })(),
    windowSeries: windows,
  };
}

const invokedDirectly = process.argv[1] && /decay-regrade\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (invokedDirectly) {
  const inPath = process.argv[2];
  const outPath = process.argv[3] || null;
  const report = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const out = regradeDecay(report);
  if (outPath) fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
  const t = out.trends;
  console.error(`[regrade] build=${out.build} windows=${out.windows} bars ${out.barSpan?.from}->${out.barSpan?.to} zeroTrades=${JSON.stringify(out.zeroTradeControl)}`);
  console.error(`[regrade] CPU-ms per bar: ${out.firstFiveWindows.cpuMsPerBar} -> ${out.lastFiveWindows.cpuMsPerBar} (${out.perBarCostChangePercent}%) slope ${t.cpuMsPerBar.perHour} CI${JSON.stringify(t.cpuMsPerBar.slopeCi95)} ${t.cpuMsPerBar.verdict}`);
  console.error(`[regrade] throughput: ${out.firstFiveWindows.barsPerSec} -> ${out.lastFiveWindows.barsPerSec} bars/s (${out.throughputChangePercent}%) slope ${t.barsPerSec.perHour} CI${JSON.stringify(t.barsPerSec.slopeCi95)} ${t.barsPerSec.verdict}`);
  console.error(`[regrade] CPU supply: ${out.firstFiveWindows.cpuPercent}% -> ${out.lastFiveWindows.cpuPercent}% ${t.cpuPercent.verdict}`);
}
