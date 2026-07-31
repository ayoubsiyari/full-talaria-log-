#!/usr/bin/env node
/**
 * MONOTONIC-BARS-GATE — the missing half of `UNIT-01`.
 *
 * We hold a memory rate per closed trade and NO rate per thousand bars, because the soak that produced
 * the per-trade figure had a bar count that went DOWN as well as up: the re-arm helper re-seeked
 * whenever a panel reached the end of its data, and panels shed bars. Regressing memory on that
 * produced -2,639 MB per thousand bars, which I refused to publish because it is an artifact of a
 * non-monotonic x-axis rather than a rate.
 *
 * This run exists to make the x-axis monotonic and nothing else:
 *
 *   - NO re-seeks. The re-arm helper is not used. If playback stops, the run ENDS and reports the span
 *     it achieved; it does not rescue itself by moving the playhead backwards.
 *   - ZERO trades. The per-trade term is already measured; including it here would put both drivers back
 *     in one run, which is the exact error that made the 730 MB/h headline uninterpretable.
 *   - A speed BELOW the knee. S1 showed the engine tracks intent to 5x and saturates above it, and a
 *     saturated engine delivers a bar rate set by the machine rather than by the setting. 5x keeps the
 *     bar axis honest and CPU off the ceiling.
 *   - Deep history at load so there is somewhere to advance to for the whole run.
 *
 * Every sample records the resident bar count, and any sample where it FELL is excluded from the fit
 * with its reason, so a single shed cannot quietly bend the slope. `FIT-01` applies: residual structure
 * is published, not just rSquared.
 */
import fs from 'node:fs';

import { bootConf01Session, readConf01State } from './lib/conf01-session.mjs';
import { readSweepGauges, SWEEP_GAUGE_SCOPE_NOTE } from './lib/sweep-gauges.mjs';
import { fitTrend } from './lib/duration-trend.mjs';
import { readOsFootprints } from './process-memory-census.mjs';
import { PO_TWO_INDICATORS } from './replay-decay-hunt.mjs';

const OUT = process.env.C_OUT
  || 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\MONOTONIC-BARS-GATE-20260731.json';
const MINUTES = Number(process.env.C_MINUTES || 40);
const SPEED = Number(process.env.C_SPEED || 5);
const SAMPLE_MS = Number(process.env.C_SAMPLE_MS || 60_000);
const FETCH_LIMIT = Number(process.env.C_FETCH_LIMIT || 32_000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const report = {
  signature: 'MONOTONIC-BARS-GATE-V1',
  ruling: 'cbfdb81f4 — the per-bar half of UNIT-01, added from my own 10:10 finding',
  why: 'We hold a per-closed-trade memory rate and no per-thousand-bars rate, because the soak that produced the former had a bar count that fell as well as rose. This run makes the bar axis monotonic so the per-bar rate can be fitted at all.',
  design: {
    reSeeks: 'DISABLED — no re-arm helper. If playback stops, the run ends and reports the span achieved.',
    trades: 0,
    speed: SPEED,
    speedRationale: 'Below the knee S1 located: the engine tracks intended cadence to 5x and saturates above it, and a saturated engine sets its own bar rate.',
    initialFetchLimit: FETCH_LIMIT,
    plannedMinutes: MINUTES,
    sampleIntervalMs: SAMPLE_MS,
  },
  gaugeScope: SWEEP_GAUGE_SCOPE_NOTE,
  startedAtIso: new Date().toISOString(),
  samples: [],
};
const save = () => fs.writeFileSync(OUT, JSON.stringify(report, null, 1));

/** Total resident bars across every realm, plus the playhead, read in one pass. */
async function readBarAxis(page) {
  const rows = [];
  for (const [i, f] of page.frames().entries()) {
    try {
      const r = await f.evaluate(() => {
        const ch = window.chart;
        if (!ch) return null;
        const rs = ch.replaySystem;
        return {
          timeframe: ch.currentTimeframe ? String(ch.currentTimeframe) : null,
          resident: Array.isArray(ch.data) ? ch.data.length : null,
          raw: Array.isArray(ch.rawData) ? ch.rawData.length : null,
          master: Array.isArray(ch._panelFullRawData) ? ch._panelFullRawData.length : null,
          playhead: rs && Number.isFinite(rs.currentIndex) ? rs.currentIndex : null,
          playing: !!(rs && rs.isPlaying),
        };
      });
      if (r && r.resident != null) rows.push({ frameIndex: i, ...r });
    } catch { /* frame gone */ }
  }
  const sum = (k) => rows.reduce((t, r) => t + (r[k] || 0), 0);
  return {
    realms: rows.length,
    residentTotal: sum('resident'),
    rawTotal: sum('raw'),
    masterTotal: sum('master'),
    playheadTotal: sum('playhead'),
    playingRealms: rows.filter((r) => r.playing).length,
    perRealm: rows,
  };
}

(async () => {
  let session = null;
  try {
    session = await bootConf01Session({
      indicators: PO_TWO_INDICATORS,
      speed: SPEED,
      placeOrder: false,
      label: 'monotonic-bars',
      // Deep history so the playhead has somewhere to go for the whole run without ever needing a
      // re-seek. This is the same knob S5 swept.
      preloadScript: `window.CHART_BACKTEST_SMART_INITIAL_LIMIT = ${FETCH_LIMIT};`,
    });
    const { page, cdp, browserCdp, conf01 } = session;
    report.buildStamp = conf01?.buildId ?? null;

    const gaugeOpts = { cpuWindowMs: 6_000, readOsFootprints };
    const t0 = Date.now();
    const deadline = t0 + MINUTES * 60_000;
    let n = 0;
    let lastResident = null;

    while (Date.now() < deadline) {
      n += 1;
      const axis = await readBarAxis(page);
      // Collect on EVERY sample, not just the first. The post-collection heap is the cleanest JS-side
      // axis in the run and reading it once leaves the heap-per-bar fit with a single point.
      const g = await readSweepGauges(page, cdp, browserCdp, { ...gaugeOpts, forceGc: true });
      const state = await readConf01State(page).catch(() => null);
      const fell = lastResident != null && axis.residentTotal < lastResident;
      const row = {
        sample: n,
        minutes: +((Date.now() - t0) / 60_000).toFixed(2),
        residentTotal: axis.residentTotal,
        residentFellSinceLastSample: fell,
        deltaResident: lastResident != null ? axis.residentTotal - lastResident : null,
        playheadTotal: axis.playheadTotal,
        playingRealms: axis.playingRealms,
        advancingPanels: state?.advancingPanels ?? null,
        footprintTotalMB: g.footprint?.totalPrivateMB ?? null,
        rendererMB: g.footprint?.pageRendererPrivateMB ?? null,
        gpuMB: g.footprint?.gpuProcessPrivateMB ?? null,
        heapPostGcMB: g.counters?.collected?.jsHeapMB ?? null,
        heapLiveMB: g.counters?.live?.jsHeapMB ?? null,
        nodes: g.counters?.live?.nodes ?? null,
        listeners: g.counters?.live?.listeners ?? null,
        rendererCpuPercent: g.cpu?.rendererCpuPercent ?? null,
        perRealmResident: axis.perRealm.map((r) => r.resident),
      };
      report.samples.push(row);
      lastResident = axis.residentTotal;
      save();
      console.error(`[mono] #${n} ${row.minutes}min resident=${row.residentTotal} (${row.deltaResident >= 0 ? '+' : ''}${row.deltaResident ?? '-'}) playing=${row.playingRealms}/${axis.realms} foot=${row.footprintTotalMB}MB heap=${row.heapPostGcMB}MB cpu=${row.rendererCpuPercent}%`);

      // The one rule of this run: no rescue. If nothing is advancing, stop and report the honest span.
      if (n >= 3 && (row.advancingPanels ?? 0) < 1 && row.playingRealms === 0) {
        report.endedEarly = `no realm was advancing at sample ${n}; the run ENDED rather than re-seeking, because a re-seek is what broke the per-bar axis in the first place`;
        break;
      }
      await sleep(SAMPLE_MS);
    }
    report.status = 'OK';
  } catch (err) {
    report.status = 'VOID';
    report.void = String(err?.message || err).slice(0, 300);
  } finally {
    save();
    try { await session?.browser?.close?.(); } catch { /* gone */ }
  }

  // ---- Grade: was the axis actually monotonic, and what is the per-bar rate? --
  const s = report.samples;
  if (s.length >= 4) {
    const fell = s.filter((r) => r.residentFellSinceLastSample);
    const usable = s.filter((r) => !r.residentFellSinceLastSample);
    const barsSpan = s[s.length - 1].residentTotal - s[0].residentTotal;
    report.axis = {
      samples: s.length,
      samplesWhereResidentFell: fell.length,
      fellAtSamples: fell.map((r) => r.sample),
      monotonic: fell.length === 0,
      residentFirst: s[0].residentTotal,
      residentLast: s[s.length - 1].residentTotal,
      barsAccumulated: barsSpan,
      minutesObserved: s[s.length - 1].minutes,
      barsPerMinute: s[s.length - 1].minutes > 0 ? +(barsSpan / s[s.length - 1].minutes).toFixed(1) : null,
      usableForPerBarFit: fell.length === 0 && barsSpan > 1000,
      whyNotUsable: fell.length > 0
        ? `resident bar count fell at ${fell.length} sample(s) (${fell.map((r) => r.sample).join(', ')}), so the axis is not monotonic and a per-bar rate fitted on it would carry the same artifact as the soak`
        : (barsSpan <= 1000 ? `only ${barsSpan} bars accumulated, too few to fit a per-thousand-bars rate against` : null),
    };

    // Per UNIT-01 the rate is published in the driver's units: per thousand bars.
    // fitTrend takes {hours, value} points and returns perHour + slopeCi95. The x axis here is
    // THOUSANDS OF RESIDENT BARS, not hours — the field name is the library's, the unit is mine, and
    // that substitution is the entire purpose of this run. minSpanHours is zeroed because the span is
    // measured in bars.
    const fitOn = (xKey, yKey, xScale = 1) => {
      const pts = usable.filter((r) => Number.isFinite(r[xKey]) && Number.isFinite(r[yKey]))
        .map((r) => ({ hours: r[xKey] * xScale, value: r[yKey] }));
      if (pts.length < 4) return { verdict: 'INSUFFICIENT', n: pts.length };
      const t = fitTrend(pts, { label: `${yKey} per 1000 bars`, minSpanHours: 0 });
      if (!Number.isFinite(t.perHour)) return { verdict: t.verdict, n: t.n, reason: t.reason ?? null };
      // Residual structure, FIT-01. Recover the intercept from the fitted endpoints.
      const xs = pts.map((p) => p.hours);
      const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
      const meanY = pts.reduce((a, p) => a + p.value, 0) / pts.length;
      const intercept = meanY - t.perHour * meanX;
      const resid = pts.map((p) => p.value - (intercept + t.perHour * p.hours));
      const signs = resid.map((v) => (v >= 0 ? 1 : -1));
      let runs = 1;
      for (let i = 1; i < signs.length; i += 1) if (signs[i] !== signs[i - 1]) runs += 1;
      const nPos = signs.filter((v) => v > 0).length;
      const nNeg = signs.length - nPos;
      const expRuns = 1 + (2 * nPos * nNeg) / signs.length;
      const sdRuns = Math.sqrt((2 * nPos * nNeg * (2 * nPos * nNeg - signs.length))
        / (signs.length ** 2 * (signs.length - 1)));
      let num = 0;
      let den = 0;
      for (let i = 1; i < resid.length; i += 1) num += resid[i] * resid[i - 1];
      for (const v of resid) den += v * v;
      return {
        n: pts.length,
        slope: t.perHour,
        ci: t.slopeCi95,
        rSquared: t.rSquared,
        verdict: t.verdict,
        residual: {
          runs,
          expectedRuns: +expRuns.toFixed(1),
          runsZ: sdRuns > 0 ? +((runs - expRuns) / sdRuns).toFixed(2) : null,
          lag1Autocorrelation: den > 0 ? +(num / den).toFixed(3) : null,
          maxAbsResidual: +Math.max(...resid.map(Math.abs)).toFixed(2),
        },
      };
    };

    if (report.axis.usableForPerBarFit) {
      // x is scaled to thousands of bars up front, so the returned slope IS already per thousand bars.
      const PER_K = 1 / 1000;
      const perBarFoot = fitOn('residentTotal', 'footprintTotalMB', PER_K);
      const perBarHeap = fitOn('residentTotal', 'heapPostGcMB', PER_K);
      const perBarNodes = fitOn('residentTotal', 'nodes', PER_K);
      const scale = (f) => (Number.isFinite(f?.slope) ? {
        perThousandBars: +f.slope.toFixed(2),
        ciPerThousandBars: Array.isArray(f.ci) ? [+f.ci[0].toFixed(2), +f.ci[1].toFixed(2)] : null,
        rSquared: f.rSquared,
        verdict: f.verdict,
        residual: f.residual,
        n: f.n,
      } : f);
      report.unit01PerBarRates = {
        footprintMBPerThousandBars: scale(perBarFoot),
        heapPostGcMBPerThousandBars: scale(perBarHeap),
        domNodesPerThousandBars: scale(perBarNodes),
        declaredConfiguration: {
          speed: SPEED,
          trades: 0,
          panels: 4,
          indicatorsPerChart: 2,
          note: 'UNIT-01 guardrail: this is a replay-heavy, zero-trade profile chosen to isolate the bar driver, NOT a gentler configuration chosen for a kinder headline. The per-closed-trade rate remains the memory headline; this is the other axis.',
        },
      };
      const f = report.unit01PerBarRates.footprintMBPerThousandBars;
      report.verdict = Number.isFinite(f?.perThousandBars)
        ? `PER-BAR RATE ESTABLISHED on a monotonic axis: ${f.perThousandBars} MB per thousand resident bars, CI[${f.ciPerThousandBars?.join(', ')}], over ${report.axis.barsAccumulated} bars accumulated in ${report.axis.minutesObserved} minutes with zero trades and zero re-seeks.`
        : 'The axis was monotonic but the fit did not return a slope; see unit01PerBarRates.';
    } else {
      report.verdict = `NO PER-BAR RATE PUBLISHED: ${report.axis.whyNotUsable}. Reporting the axis honestly rather than fitting through it is the whole point of this run.`;
    }
  } else {
    report.verdict = `Too few samples (${s.length}) to fit anything. ${report.endedEarly || report.void || ''}`;
  }
  save();

  console.error(`\n=== MONOTONIC BARS GATE ${report.status} build=${report.buildStamp} ===`);
  if (report.axis) {
    console.error(`axis: ${report.axis.residentFirst} -> ${report.axis.residentLast} bars (+${report.axis.barsAccumulated}) over ${report.axis.minutesObserved}min at ${report.axis.barsPerMinute} bars/min`);
    console.error(`monotonic: ${report.axis.monotonic}${report.axis.samplesWhereResidentFell ? ` (fell at ${report.axis.fellAtSamples.join(', ')})` : ''}`);
  }
  if (report.unit01PerBarRates) console.error(JSON.stringify(report.unit01PerBarRates, null, 1));
  console.error(`\n${report.verdict}`);
  console.error(`artifact ${OUT}`);
  process.exit(0);
})();
