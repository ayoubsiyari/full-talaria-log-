#!/usr/bin/env node
/**
 * SWEEP-RUNNER-V1 — SWEEP-01 (ruling 3df92902c) in one instrument.
 *
 * Varies ONE knob across its values, holds everything else fixed, takes the full gauge set at
 * every point, and fits the relationship across points.
 *
 * The three things SWEEP-01 requires, enforced in code rather than in intent:
 *
 *  1. PREDICTIONS ARE DECLARED BEFORE THE RUN. Each sweep carries a `predicts` map from candidate
 *     mechanism to the curve shape it implies, written into the artifact BEFORE the first point
 *     boots. The shape then decides between mechanisms; the operator does not.
 *  2. EVERY SWEEP HAS A NEGATIVE CONTROL — a point where we predict nothing happens. If the
 *     control degrades too, the sweep is VOID because the instrument is lying.
 *  3. POINT DURATION IS DERIVED, NOT CHOSEN. 12 minutes, from
 *     `SWEEP-POINT-DURATION-20260731.json`: at 5 minutes a point the fitted slope lands OUTSIDE
 *     the full run's CI in both B1 arms, and in opposite directions, which would bend a
 *     dose-response curve exactly where it matters.
 *
 * A point that dies is recorded VOID with its reason and the sweep continues to the next point,
 * per NIGHT-01. A sweep with fewer than 3 usable points reports NO FIT rather than a line through
 * two dots.
 */
import fs from 'node:fs';

import { bootConf01Session, keepConf01Playing, readConf01State, CONF01_PANEL_IDS } from './lib/conf01-session.mjs';
import { HEAP_CYCLE_DISTINCT_TIMEFRAMES } from './lib/heap-cycle-dataset-config.mjs';
import { HEAP_CYCLE_PO_INDICATORS } from './lib/heap-cycle-po-workload.mjs';
import { fitTrend } from './lib/duration-trend.mjs';
import { installSweepCounters, readSweepGauges, SWEEP_GAUGE_SCOPE_NOTE } from './lib/sweep-gauges.mjs';
import { readOsFootprints } from './process-memory-census.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EVIDENCE = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';
/** Derived in DERIVE-SWEEP-POINT-DURATION-V1. Do not shorten without re-deriving. */
export const POINT_MINUTES = 12;

export const SWEEPS = {
  S3: {
    id: 'S3',
    knob: 'indicatorsPerChart',
    values: [0, 1, 2, 4],
    negativeControl: 0,
    question: 'Does degradation scale with indicator count? Dose-response on the recalc hypothesis.',
    predicts: {
      'recalc path is the driver': 'slope rises monotonically and roughly linearly with indicator count, and is ~0 at zero indicators',
      'recalc path is one of two drivers': 'slope rises with count but has a clearly non-zero intercept at zero indicators',
      'recalc path is irrelevant': 'slope is flat across 0/1/2/4 — indicator count does not move it',
    },
    controlPrediction: 'At 0 indicators the recalc path early-returns, so if the recalc hypothesis were the whole story the zero point would show no decay. A non-zero slope at zero indicators does NOT void the sweep — it falsifies the hypothesis. The sweep is void only if the zero point is also the WORST point, which no mechanism predicts.',
  },
  S1: {
    id: 'S1',
    knob: 'replaySpeed',
    values: [1, 5, 10, 30, 60],
    negativeControl: 1,
    question: 'Does degradation track bars played or wall time? The class question for the whole plan.',
    predicts: {
      'per-bar work': 'degradation per MINUTE rises with speed, because faster play means more bars per minute; degradation per BAR is roughly constant across speeds',
      'timer or animation loop (wall-time work)': 'degradation per MINUTE is flat across speeds; degradation per BAR falls as speed rises, because the same per-second work is divided over more bars',
    },
    controlPrediction: 'At 1x almost no bars advance per minute, so a per-bar mechanism must show near-zero degradation per minute there. If 1x degrades as fast per minute as 60x, per-bar work is dead and it is a clock.',
  },
  S5: {
    id: 'S5',
    knob: 'initialFetchLimit',
    values: [2000, 8000, 32000],
    negativeControl: 2000,
    question: 'Does resident memory at first paint scale with how much history is fetched, or with the visible window?',
    predicts: {
      'chart hydrates everything it can reach': 'resident bars and heap at first paint rise with the requested limit, roughly proportionally',
      'chart windows to the viewport': 'resident bars at first paint are pinned near the default regardless of the requested limit',
    },
    controlPrediction: 'The 2000 point is the shipped default and must reproduce the ~2,011 resident bars already measured at first paint. If it does not, the knob is not doing what I think and the sweep is void.',
    noPlayback: true,
  },
  S2: {
    id: 'S2',
    knob: 'panelCount',
    values: [1, 2, 4],
    negativeControl: 1,
    question: 'Are panels independent, or is there cross-panel coupling?',
    predicts: {
      'panels are independent': 'cost per panel is constant — total rises linearly with panel count',
      'cross-panel coupling (broadcast fan-out, sync chatter, shared contention)': 'cost per panel RISES with panel count — total is superlinear',
    },
    controlPrediction: 'One panel has nobody to couple with, so it must be the cheapest per panel. If per-panel cost at 1 panel is not the minimum, the workload is not being held fixed across points and the sweep is void.',
  },
  S4: {
    id: 'S4',
    knob: 'symbolConfig',
    values: ['same-pair', 'distinct-pair'],
    negativeControl: 'same-pair',
    question: 'Do the twenty _multichartSamePairAsHost guards buy anything measurable?',
    predicts: {
      'the guards are the story': 'distinct-pair is dramatically worse than same-pair on memory and per-bar cost',
      'the guards were never worth much': 'same-pair and distinct-pair are close, and CONF-03 loses its teeth',
    },
    controlPrediction: 'Same-pair takes every optimised path, so it is the floor by construction. If distinct-pair came out BETTER, the comparison is inverted and void.',
    isComparisonNotCurve: true,
  },
};

function indicatorsFor(n) {
  return n === 0 ? [] : HEAP_CYCLE_PO_INDICATORS.slice(0, n);
}

/** Runs one point of a sweep. Returns a point record; never throws. */
async function runPoint(sweep, value, { pointMinutes, outPath, report }) {
  const point = {
    knob: sweep.knob,
    value,
    isNegativeControl: value === sweep.negativeControl,
    startedAt: new Date().toISOString(),
    plannedMinutes: sweep.noPlayback ? 0 : pointMinutes,
    status: 'RUNNING',
    samples: [],
  };
  report.points.push(point);
  const save = () => { if (outPath) fs.writeFileSync(outPath, JSON.stringify(report, null, 1)); };
  save();

  let session = null;
  try {
    const bootOpts = {
      replaySpeed: sweep.knob === 'replaySpeed' ? value : 60,
      indicators: indicatorsFor(sweep.knob === 'indicatorsPerChart' ? value : 2),
      placeOrder: false,
    };
    if (sweep.knob === 'panelCount') {
      bootOpts.panelIds = CONF01_PANEL_IDS.slice(0, value);
      // Timeframes must be sliced with the panels or a 1-panel point silently keeps four
      // timeframes in its plan and the point stops being one panel's worth of work.
      bootOpts.timeframes = HEAP_CYCLE_DISTINCT_TIMEFRAMES.slice(0, value);
    }
    if (sweep.knob === 'symbolConfig') {
      // identical = one fileId and one timeframe across all four panels, which is exactly the
      // condition every _multichartSamePairAsHost guard tests for.
      bootOpts.datasetMode = value === 'same-pair' ? 'identical' : 'distinct';
    }
    if (sweep.knob === 'initialFetchLimit') {
      bootOpts.onSingleReady = async (page) => {
        // Read the cold chart at first paint. This is the whole of S5: no playback, no layout
        // change, just what one chart holds when it has painted once.
        const cold = await page.evaluate(() => {
          const ch = window.chart;
          return {
            timeframe: ch && ch.currentTimeframe ? String(ch.currentTimeframe) : null,
            residentBars: Array.isArray(ch && ch.data) ? ch.data.length : null,
            rawBars: Array.isArray(ch && ch.rawData) ? ch.rawData.length : null,
            heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(2) : null,
            elements: document.querySelectorAll('*').length,
            requestedLimit: window.CHART_BACKTEST_SMART_INITIAL_LIMIT ?? null,
          };
        }).catch((e) => ({ error: String(e?.message || e).slice(0, 120) }));
        point.coldRead = cold;
        console.error(`[sweep] ${sweep.id} limit=${value} COLD READ ${JSON.stringify(cold)}`);
        save();
      };
      // The knob is the per-call override read at chart.js:7965, installed before navigation so
      // it is in place for the chart's very first fetch.
      bootOpts.preloadScript = `window.CHART_BACKTEST_SMART_INITIAL_LIMIT = ${value};`;
    }

    session = await bootConf01Session(bootOpts);
    const { page, cdp, browserCdp, conf01 } = session;
    point.build = await page.evaluate(() => {
      const s = [...document.querySelectorAll('script[src]')]
        .map((x) => /[?&]v=([\w.\-]+)/.exec(x.getAttribute('src') || '')).find(Boolean);
      return s ? s[1] : null;
    }).catch(() => null);
    point.conf01 = { compliant: conf01?.compliant, failed: conf01?.failed };
    await installSweepCounters(page);

    const gaugeOpts = { cpuWindowMs: 6_000, readOsFootprints };
    if (sweep.noPlayback) {
      point.samples.push(await readSweepGauges(page, cdp, browserCdp, gaugeOpts));
      point.status = 'OK';
      save();
      return point;
    }

    const startedAt = Date.now();
    let prev = null;
    let n = 0;
    while ((Date.now() - startedAt) / 60_000 < pointMinutes) {
      n += 1;
      const g = await readSweepGauges(page, cdp, browserCdp, { ...gaugeOpts, forceGc: n === 1 });
      const state = await readConf01State(page, { advanceWindowMs: 3_000 }).catch(() => null);
      const hostIdx = g.realms[0]?.replayIndex ?? null;
      const paints = g.summed.paints ?? null;
      if (prev) {
        const secs = (Date.parse(g.atIso) - Date.parse(prev.atIso)) / 1000;
        const barsAdvanced = (hostIdx != null && prev.hostIdx != null) ? hostIdx - prev.hostIdx : null;
        const cpuPct = g.cpu.rendererCpuPercent ?? null;
        g.derived = {
          windowSec: +secs.toFixed(1),
          barsAdvanced,
          barsPerSec: (barsAdvanced != null && secs > 0) ? +(barsAdvanced / secs).toFixed(2) : null,
          cpuMsPerBar: (barsAdvanced > 0 && cpuPct != null && secs > 0)
            ? +(((cpuPct / 100) * secs * 1000) / barsAdvanced).toFixed(2) : null,
          paintsAdvanced: (paints != null && prev.paints != null) ? paints - prev.paints : null,
          paintsPerSec: (paints != null && prev.paints != null && secs > 0)
            ? +((paints - prev.paints) / secs).toFixed(2) : null,
          paintsPerBar: (paints != null && prev.paints != null && barsAdvanced > 0)
            ? +((paints - prev.paints) / barsAdvanced).toFixed(2) : null,
        };
      }
      g.atMinutes = +((Date.now() - startedAt) / 60_000).toFixed(2);
      g.advancingPanels = state?.advancingPanels ?? null;
      point.samples.push(g);
      prev = { atIso: g.atIso, hostIdx, paints };
      console.error(`[sweep] ${sweep.id} ${sweep.knob}=${value} #${n} ${g.atMinutes}min cpu=${g.cpu.rendererCpuPercent}% msPerBar=${g.derived?.cpuMsPerBar ?? '-'} bars/s=${g.derived?.barsPerSec ?? '-'} paints/s=${g.derived?.paintsPerSec ?? '-'} resident=${g.summed.residentBars} copies=${g.summed.copiesPerResidentBar} heap=${g.summed.heapMB} footprint=${g.footprint.pageRendererPrivateMB} elements=${g.summed.elements} adv=${g.advancingPanels}/4`);
      save();
      if ((state?.advancingPanels ?? 0) < 1) await keepConf01Playing(page, bootOpts.replaySpeed).catch(() => {});
    }
    point.status = 'OK';
  } catch (e) {
    point.status = 'VOID';
    point.reason = String(e?.message || e).slice(0, 240);
    console.error(`[sweep] ${sweep.id} ${sweep.knob}=${value} VOID — ${point.reason}`);
  } finally {
    point.endedAt = new Date().toISOString();
    if (session) {
      await session.cdp?.detach?.().catch(() => {});
      await session.browser?.close?.().catch(() => {});
    }
    save();
  }
  return point;
}

/** Per-point summary statistics, then the across-point fit. */
export function summarisePoint(point) {
  const withDerived = point.samples.filter((s) => s.derived?.cpuMsPerBar != null);
  const fitPts = withDerived.map((s) => ({
    hours: (s.realms[0]?.replayIndex ?? 0) / 1000,
    value: s.derived.cpuMsPerBar,
  })).filter((p) => Number.isFinite(p.hours) && Number.isFinite(p.value));
  const slope = fitPts.length >= 4 ? fitTrend(fitPts, { label: 'cpuMsPerBar vs kbars', minSpanHours: 0 }) : null;
  const mean = (arr) => (arr.length ? +(arr.reduce((t, v) => t + v, 0) / arr.length).toFixed(2) : null);
  const last = point.samples.at(-1);
  const first = point.samples[0];
  const mins = last && first ? (last.atMinutes ?? 0) - (first.atMinutes ?? 0) : 0;
  return {
    value: point.value,
    isNegativeControl: point.isNegativeControl,
    status: point.status,
    samples: point.samples.length,
    build: point.build ?? null,
    modes: last?.summed?.modes ?? null,
    indicatorsActive: last?.summed?.indicatorsActive ?? null,
    // Level gauges
    cpuMsPerBarMean: mean(withDerived.map((s) => s.derived.cpuMsPerBar)),
    barsPerSecMean: mean(withDerived.map((s) => s.derived.barsPerSec)),
    paintsPerSecMean: mean(withDerived.map((s) => s.derived.paintsPerSec).filter((v) => v != null)),
    paintsPerBarMean: mean(withDerived.map((s) => s.derived.paintsPerBar).filter((v) => v != null)),
    rendererCpuPercentMean: mean(point.samples.map((s) => s.cpu?.rendererCpuPercent).filter((v) => v != null)),
    gpuProcessMBMean: mean(point.samples.map((s) => s.footprint?.gpuProcessPrivateMB).filter((v) => v != null)),
    // Growth gauges, per minute so points of equal length compare directly
    cpuMsPerBarSlopePerKbar: slope?.perHour ?? null,
    cpuMsPerBarSlopeCi: slope?.slopeCi95 ?? null,
    cpuMsPerBarSlopeVerdict: slope?.verdict ?? 'INSUFFICIENT',
    footprintMBPerMin: (last && first && mins > 0 && last.footprint?.pageRendererPrivateMB != null && first.footprint?.pageRendererPrivateMB != null)
      ? +(((last.footprint.pageRendererPrivateMB - first.footprint.pageRendererPrivateMB) / mins)).toFixed(2) : null,
    heapMBPerMin: (last && first && mins > 0)
      ? +(((last.summed.heapMB - first.summed.heapMB) / mins)).toFixed(2) : null,
    elementsPerMin: (last && first && mins > 0)
      ? +(((last.summed.elements - first.summed.elements) / mins)).toFixed(2) : null,
    residentBarsPerMin: (last && first && mins > 0)
      ? +(((last.summed.residentBars - first.summed.residentBars) / mins)).toFixed(1) : null,
    copiesPerResidentBarEnd: last?.summed?.copiesPerResidentBar ?? null,
    // Cold read for the no-playback sweeps
    coldRead: point.coldRead ?? null,
    // Standing gauges
    workers: last?.workers?.workers ?? null,
    documents: last?.counters?.live?.documents ?? null,
    listeners: last?.counters?.live?.listeners ?? null,
    storage: last?.storage ?? null,
    minutes: +mins.toFixed(2),
  };
}

/**
 * Shape of a series across knob values, usable at three points where a least-squares fit with a CI
 * is not. This exists because "the fit returned INSUFFICIENT" and "the curve is flat" are
 * completely different statements, and conflating them reports a live hypothesis as a dead one.
 */
export function shapeAcross(points, key) {
  const rows = points
    .filter((p) => Number.isFinite(Number(p.value)) && Number.isFinite(p[key]))
    .map((p) => ({ x: Number(p.value), y: p[key] }))
    .sort((a, b) => a.x - b.x);
  if (rows.length < 2) return { shape: 'UNMEASURED', n: rows.length, reason: 'fewer than two points' };
  const ys = rows.map((r) => r.y);
  const first = ys[0];
  const last = ys[ys.length - 1];
  const monotonicUp = ys.every((v, i) => i === 0 || v >= ys[i - 1]);
  const monotonicDown = ys.every((v, i) => i === 0 || v <= ys[i - 1]);
  const ratio = (Math.abs(first) > 1e-9) ? last / first : null;
  const span = Math.max(...ys.map(Math.abs));
  const spread = span > 0 ? (Math.max(...ys) - Math.min(...ys)) / span : 0;
  let shape;
  if (spread < 0.2) shape = 'FLAT';
  else if (monotonicUp) shape = 'RISES';
  else if (monotonicDown) shape = 'FALLS';
  else shape = 'NON-MONOTONIC';
  // Per-unit change tells linear from superlinear without needing a CI.
  const perUnit = rows.length >= 2 ? (last - first) / (rows[rows.length - 1].x - rows[0].x) : null;
  const increments = rows.slice(1).map((r, i) => +((r.y - rows[i].y) / Math.max(1e-9, r.x - rows[i].x)).toFixed(3));
  return {
    shape,
    n: rows.length,
    values: rows.map((r) => ({ knob: r.x, value: +r.y.toFixed(3) })),
    firstToLastRatio: ratio != null ? +ratio.toFixed(2) : null,
    perUnitKnob: perUnit != null ? +perUnit.toFixed(3) : null,
    incrementsPerUnit: increments,
    superlinear: increments.length >= 2 ? increments[increments.length - 1] > increments[0] * 1.25 : null,
  };
}

export function gradeSweep(sweep, pointSummaries) {
  const ok = pointSummaries.filter((p) => p.status === 'OK');
  const control = ok.find((p) => p.isNegativeControl);
  const others = ok.filter((p) => !p.isNegativeControl);
  const numericKnob = ok.every((p) => Number.isFinite(Number(p.value)));

  const fitAcross = (key) => {
    if (!numericKnob) return null;
    const pts = ok.filter((p) => Number.isFinite(p[key]))
      .map((p) => ({ hours: Number(p.value), value: p[key] }));
    if (pts.length < 3) return null;
    const f = fitTrend(pts, { label: `${key} vs ${sweep.knob}`, minSpanHours: 0 });
    return { slopePerUnitKnob: f.perHour ?? null, ci: f.slopeCi95 ?? null, verdict: f.verdict, n: pts.length };
  };

  const curves = {};
  const shapes = {};
  for (const key of ['cpuMsPerBarMean', 'cpuMsPerBarSlopePerKbar', 'barsPerSecMean', 'paintsPerSecMean',
    'paintsPerBarMean', 'footprintMBPerMin', 'heapMBPerMin', 'elementsPerMin', 'residentBarsPerMin',
    'rendererCpuPercentMean']) {
    const f = fitAcross(key);
    if (f) curves[key] = f;
    // Always computed, even when a CI is unavailable, so a three-point sweep still states a shape.
    shapes[key] = shapeAcross(ok, key);
  }

  // Linearity check for S2-style questions: is cost PER UNIT flat or rising?
  const perUnit = numericKnob ? ok.filter((p) => Number(p.value) > 0 && p.cpuMsPerBarMean != null)
    .map((p) => ({ value: Number(p.value), perUnit: +(p.cpuMsPerBarMean / Number(p.value)).toFixed(2) })) : [];

  const controlDegraded = control ? (control.cpuMsPerBarSlopeVerdict === 'CLIMBS') : null;
  const controlIsWorst = (control && others.length)
    ? (control.cpuMsPerBarMean != null && others.every((p) => p.cpuMsPerBarMean != null && control.cpuMsPerBarMean >= p.cpuMsPerBarMean))
    : null;

  return {
    knob: sweep.knob,
    usablePoints: ok.length,
    voidPoints: pointSummaries.filter((p) => p.status !== 'OK').map((p) => ({ value: p.value, reason: p.reason })),
    enoughForACurve: ok.length >= 3 || !!sweep.isComparisonNotCurve,
    curves,
    shapes,
    perUnitCost: perUnit,
    negativeControl: control ? {
      value: control.value,
      cpuMsPerBarMean: control.cpuMsPerBarMean,
      slopeVerdict: control.cpuMsPerBarSlopeVerdict,
      degraded: controlDegraded,
      isTheWorstPoint: controlIsWorst,
      prediction: sweep.controlPrediction,
    } : null,
    // A control that is the WORST point means the knob is inverted or the workload was not held
    // fixed. That voids the sweep. A control that merely degrades may be a falsified hypothesis,
    // which is a result and not a fault — S3 says so explicitly.
    sweepVoid: controlIsWorst === true,
  };
}

export async function runSweep(sweepId, { pointMinutes = POINT_MINUTES, outPath = null } = {}) {
  const sweep = SWEEPS[sweepId];
  if (!sweep) throw new Error(`unknown sweep ${sweepId}`);
  const report = {
    signature: `SWEEP-${sweep.id}-V1`,
    ruling: '3df92902c SWEEP-01',
    startedAtIso: new Date().toISOString(),
    sweep: {
      id: sweep.id,
      knob: sweep.knob,
      values: sweep.values,
      question: sweep.question,
      negativeControl: sweep.negativeControl,
      controlPrediction: sweep.controlPrediction,
      // Declared BEFORE any point runs, so the shape decides between mechanisms.
      predictionsDeclaredBeforeRun: sweep.predicts,
    },
    pointMinutes,
    pointDurationProvenance: 'Derived in DERIVE-SWEEP-POINT-DURATION-V1 from B1: at 5 min/point the fitted slope falls outside the full-run CI in BOTH arms and in opposite directions. 20 windows (~11 min) is the smallest truncation usable in both, rounded to 12.',
    gaugeScope: SWEEP_GAUGE_SCOPE_NOTE,
    points: [],
  };
  const save = () => { if (outPath) fs.writeFileSync(outPath, JSON.stringify(report, null, 1)); };
  save();
  console.error(`[sweep] ${sweep.id} START knob=${sweep.knob} values=${JSON.stringify(sweep.values)} control=${sweep.negativeControl} ${pointMinutes}min/point`);
  console.error(`[sweep] ${sweep.id} PREDICTIONS: ${JSON.stringify(sweep.predicts)}`);

  for (const value of sweep.values) {
    // eslint-disable-next-line no-await-in-loop -- serial by NIGHT-01
    await runPoint(sweep, value, { pointMinutes, outPath, report });
    // Grade after EVERY point, not once at the end. A sweep killed on its last point still has to
    // carry the verdict its completed points earned; the alternative is three good doses thrown
    // away because the fourth session hung in boot, which is what happened on S3.
    report.pointSummaries = report.points.filter((p) => p.status === 'OK').map(summarisePoint);
    report.grade = gradeSweep(sweep, report.pointSummaries);
    report.gradedAfterPoint = value;
    save();
  }
  report.pointSummaries = report.points.filter((p) => p.status !== 'RUNNING').map(summarisePoint);
  report.grade = gradeSweep(sweep, report.pointSummaries);
  save();
  console.error(`[sweep] ${sweep.id} POINTS:`);
  for (const p of report.pointSummaries) {
    console.error(`  ${sweep.knob}=${String(p.value).padEnd(12)} ${p.status} msPerBar=${p.cpuMsPerBarMean} slope=${p.cpuMsPerBarSlopePerKbar} CI[${p.cpuMsPerBarSlopeCi}] bars/s=${p.barsPerSecMean} paints/s=${p.paintsPerSecMean} paints/bar=${p.paintsPerBarMean} footprint=${p.footprintMBPerMin}MB/min heap=${p.heapMBPerMin}MB/min elements=${p.elementsPerMin}/min ind=${p.indicatorsActive}`);
  }
  console.error(`[sweep] ${sweep.id} CURVES: ${JSON.stringify(report.grade.curves)}`);
  console.error(`[sweep] ${sweep.id} CONTROL: ${JSON.stringify(report.grade.negativeControl)}`);
  return report;
}

function parseArgs(argv) {
  const o = {};
  for (const a of argv) {
    const [k, v] = a.replace(/^--/, '').split('=');
    if (k === 'sweep') o.sweep = v;
    else if (k === 'point-minutes') o.pointMinutes = Number(v);
    else if (k === 'out') o.outPath = v;
  }
  return o;
}

const invokedDirectly = process.argv[1] && /sweep-runner\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (invokedDirectly) {
  const a = parseArgs(process.argv.slice(2));
  const id = a.sweep || 'S3';
  await runSweep(id, {
    pointMinutes: a.pointMinutes ?? POINT_MINUTES,
    outPath: a.outPath || `${EVIDENCE}\\SWEEP-${id}-20260731.json`,
  });
}
