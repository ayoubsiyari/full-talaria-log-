#!/usr/bin/env node
/**
 * INDICATOR-FP-PROBE-V1 — measures the suspect named by the decay hunt's first
 * profile: `_m19iB62WindowFp`, reached from `_m19iExactTailPaintFp` and from
 * `_indicatorAsyncDataToken`, both of which pass tailStart = 0 and therefore hash the
 * WHOLE replayed history on every call.
 *
 * Three arms, in increasing cost:
 *
 *  1. DOSE-RESPONSE (seconds, deterministic). Calls the product's own
 *     `Chart.prototype._m19iExactTailPaintFp` against a detached object holding N bars,
 *     for a ladder of N. If cost is linear in N, the class hypothesis is proven on the
 *     mechanism itself rather than inferred from a noisy throughput curve. The live
 *     chart is never mutated: the function only reads `this.data` and friends, so it is
 *     invoked on `Object.create(Chart.prototype)`.
 *     GATE-01 lives here: a fixed-size control arm must read as flat while the ladder
 *     reads as linear.
 *
 *  2. CALL-RATE (one minute). Wraps the same method in every realm during live replay
 *     and reports calls per bar advanced and ms per bar, so the per-call cost from arm 1
 *     can be multiplied into a per-tick cost.
 *
 *  3. KILL-SWITCH A/B (a few minutes). `__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1`
 *     already exists and gates both full-history call sites. Measures throughput with
 *     the path live, then with it disabled, giving KILL-03 its predicted effect on the
 *     curve before anything is cut.
 *
 * MEAS-02 per gauge:
 *   - dose-response ms/call: wall time inside the product function, main thread, host
 *     realm. Sees that function only. Blind to how often it is called.
 *   - calls per bar: product-observable call count against replay index advance. Sees
 *     frequency only, not cost.
 *   - barsPerSec: end-to-end throughput; sees everything, attributes nothing.
 */
import fs from 'node:fs';

import { fitTrend } from './lib/duration-trend.mjs';
import { bootConf01Session, keepConf01Playing, readConf01State } from './lib/conf01-session.mjs';
import { PO_TWO_INDICATORS } from './replay-decay-hunt.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Arm 1: cost of the product's paint fingerprint against a ladder of bar counts. */
function doseResponseSource(ladder) {
  const chart = window.chart;
  const Ctor = chart && chart.constructor;
  const proto = Ctor && Ctor.prototype;
  const fn = proto && proto._m19iExactTailPaintFp;
  if (typeof fn !== 'function') {
    return { available: false, reason: 'no Chart.prototype._m19iExactTailPaintFp in this realm' };
  }
  const src = Array.isArray(chart.data) ? chart.data : [];
  if (src.length < 200) return { available: false, reason: `only ${src.length} bars resident` };

  const callOn = (bars) => {
    // Detached receiver: the product function reads this.data / this.dataVersion /
    // this.currentTimeframe / this._indicatorParamsHash, all satisfied by the prototype
    // plus these three own properties. The live chart is untouched.
    const fake = Object.create(proto);
    fake.data = bars;
    fake.dataVersion = chart.dataVersion;
    fake.currentTimeframe = chart.currentTimeframe;
    const t0 = performance.now();
    let out = null;
    try { out = fn.call(fake); } catch (e) { return { error: String(e?.message || e).slice(0, 120) }; }
    return { ms: performance.now() - t0, fpChars: String(out == null ? '' : out).length };
  };

  const rungs = [];
  for (const n of ladder) {
    if (n > src.length) continue;
    const bars = src.slice(0, n);
    const times = [];
    let err = null;
    // One warm call, then five measured.
    const w = callOn(bars);
    if (w.error) err = w.error;
    for (let i = 0; i < 5 && !err; i += 1) {
      const r = callOn(bars);
      if (r.error) { err = r.error; break; }
      times.push(r.ms);
    }
    times.sort((a, b) => a - b);
    rungs.push({
      bars: n,
      error: err,
      medianMs: times.length ? +times[Math.floor(times.length / 2)].toFixed(3) : null,
      minMs: times.length ? +times[0].toFixed(3) : null,
      maxMs: times.length ? +times[times.length - 1].toFixed(3) : null,
      usPerBar: times.length ? +((times[Math.floor(times.length / 2)] * 1000) / n).toFixed(3) : null,
    });
  }

  // GATE-01 control: the SAME function at a FIXED size, repeated as many times as the
  // ladder had rungs. A linear reading here would mean the gauge drifts with time
  // rather than with bar count, and the ladder result could not be trusted.
  const controlBars = src.slice(0, 250);
  const control = [];
  for (let i = 0; i < rungs.length; i += 1) {
    const r = callOn(controlBars);
    control.push({ rep: i + 1, bars: 250, medianMs: r.ms != null ? +r.ms.toFixed(3) : null, error: r.error || null });
  }

  return {
    available: true,
    residentBars: src.length,
    timeframe: chart.currentTimeframe || null,
    rungs,
    control,
  };
}

/** Arm 2: wrap the method and count calls against bars advanced. */
function callRateSource() {
  if (window.__ifp) return { already: true };
  const chart = window.chart;
  const proto = chart && chart.constructor && chart.constructor.prototype;
  const state = {
    realm: `${location.pathname}${location.search}`.slice(-60),
    wrapped: [],
    calls: 0, totalMs: 0, maxMs: 0,
    startIndex: (chart && chart.replaySystem && chart.replaySystem.currentIndex) ?? null,
  };
  window.__ifp = state;
  for (const name of ['_m19iExactTailPaintFp', '_indicatorParamsHash']) {
    const fn = proto && proto[name];
    if (typeof fn !== 'function' || fn.__ifpWrapped) continue;
    const wrap = function ifpWrapped(...args) {
      const t0 = performance.now();
      try { return fn.apply(this, args); } finally {
        const dt = performance.now() - t0;
        if (name === '_m19iExactTailPaintFp') {
          state.calls += 1; state.totalMs += dt;
          if (dt > state.maxMs) state.maxMs = dt;
        }
      }
    };
    wrap.__ifpWrapped = true;
    try { proto[name] = wrap; state.wrapped.push(name); } catch { /* frozen */ }
  }
  state.read = () => ({
    realm: state.realm,
    wrapped: state.wrapped,
    calls: state.calls,
    totalMs: +state.totalMs.toFixed(1),
    meanMs: state.calls ? +(state.totalMs / state.calls).toFixed(3) : null,
    maxMs: +state.maxMs.toFixed(3),
    startIndex: state.startIndex,
    nowIndex: (window.chart && window.chart.replaySystem && window.chart.replaySystem.currentIndex) ?? null,
    residentBars: Array.isArray(window.chart && window.chart.data) ? window.chart.data.length : null,
  });
  return { already: false, realm: state.realm, wrapped: state.wrapped };
}

async function everyRealm(page, fn, arg) {
  const rows = [];
  for (const frame of page.frames()) {
    try {
      const r = arg === undefined ? await frame.evaluate(fn) : await frame.evaluate(fn, arg);
      rows.push({ url: frame.url().slice(-60), ...(r || {}) });
    } catch (e) {
      rows.push({ url: frame.url().slice(-60), error: String(e?.message || e).slice(0, 140) });
    }
  }
  return rows;
}

/** Throughput over a window: bars advanced per second, summed across panels. */
async function throughput(page, windowMs) {
  const read = async () => {
    const st = await readConf01State(page, { advanceWindowMs: 1_200 }).catch(() => null);
    return {
      ts: Date.now(),
      perPanel: (st?.perPanel || []).map((p) => ({ tf: p.timeframe, idx: p.replayIndex })),
      sum: (st?.perPanel || []).reduce((t, p) => t + (Number(p.replayIndex) || 0), 0),
      advancing: st?.advancingPanels ?? null,
    };
  };
  const a = await read();
  await sleep(windowMs);
  const b = await read();
  const secs = (b.ts - a.ts) / 1000;
  return {
    windowSec: +secs.toFixed(1),
    barsAdvanced: b.sum - a.sum,
    barsPerSec: secs > 0 ? +((b.sum - a.sum) / secs).toFixed(2) : null,
    advancing: b.advancing,
    startSum: a.sum,
    endSum: b.sum,
  };
}

export async function runIndicatorFpProbe({
  speed = 60, abMinutes = 3, outPath = null,
} = {}) {
  const { browser, page, cdp, conf01 } = await bootConf01Session({
    replaySpeed: speed,
    indicators: PO_TWO_INDICATORS,
    placeOrder: false,
  });
  const report = {
    signature: 'INDICATOR-FP-PROBE-V1',
    startedAtIso: new Date().toISOString(),
    suspect: '_m19iB62WindowFp via _m19iExactTailPaintFp / _indicatorAsyncDataToken, both called with tailStart=0',
    killSwitch: '__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1',
    conf01: { compliant: conf01?.compliant, failed: conf01?.failed },
    zeroTrades: conf01?.workload?.order?.skipped === true,
  };
  const save = () => { if (outPath) fs.writeFileSync(outPath, JSON.stringify(report, null, 1)); };
  save();
  try {
    report.build = await page.evaluate(() => {
      const s = [...document.querySelectorAll('script[src]')]
        .map((x) => /[?&]v=([\w.\-]+)/.exec(x.getAttribute('src') || '')).find(Boolean);
      return { scriptVersion: s ? s[1] : null };
    }).catch(() => null);
    console.error(`[ifp] build=${JSON.stringify(report.build)} zeroTrades=${report.zeroTrades}`);

    // ARM 1 — dose response.
    const ladder = [250, 500, 1_000, 2_000, 3_000, 4_000];
    report.doseResponse = await everyRealm(page, doseResponseSource, ladder);
    const host = report.doseResponse.find((r) => r.available) || null;
    if (host) {
      const pts = host.rungs.filter((r) => r.medianMs != null).map((r) => ({ hours: r.bars / 1_000, value: r.medianMs }));
      const ctl = host.control.filter((r) => r.medianMs != null).map((r, i) => ({ hours: i, value: r.medianMs }));
      report.doseFit = {
        xUnit: 'ms per 1,000 bars hashed',
        ...fitTrend(pts, { label: 'paintFp cost vs bars', flatBandPerHour: 0.05, minSpanHours: 0 }),
      };
      report.controlFit = {
        xUnit: 'ms per repetition at a FIXED 250 bars',
        ...fitTrend(ctl, { label: 'fixed-size control', flatBandPerHour: 0.05, minSpanHours: 0 }),
      };
      report.gate01 = {
        ladderReadsLinear: report.doseFit.verdict === 'CLIMBS',
        fixedSizeControlReadsFlat: report.controlFit.verdict !== 'CLIMBS',
      };
      report.gate01.verdict = (report.gate01.ladderReadsLinear && report.gate01.fixedSizeControlReadsFlat) ? 'PASS' : 'FAIL';
      console.error(`[ifp] ARM1 rungs=${JSON.stringify(host.rungs.map((r) => `${r.bars}b:${r.medianMs}ms`))}`);
      console.error(`[ifp] ARM1 slope=${report.doseFit.perHour} ms per 1k bars CI${JSON.stringify(report.doseFit.slopeCi95)} ${report.doseFit.verdict}; control ${report.controlFit.perHour} ${report.controlFit.verdict}; GATE-01 ${report.gate01.verdict}`);
    } else {
      console.error(`[ifp] ARM1 unavailable: ${JSON.stringify(report.doseResponse.map((r) => r.reason || r.error))}`);
    }
    save();

    // ARM 2 — call rate during live replay.
    report.callRateInstall = await everyRealm(page, callRateSource);
    const before = await throughput(page, 60_000);
    report.callRate = await everyRealm(page, () => (window.__ifp ? window.__ifp.read() : null));
    const totalCalls = report.callRate.reduce((t, r) => t + (Number(r.calls) || 0), 0);
    const totalMs = report.callRate.reduce((t, r) => t + (Number(r.totalMs) || 0), 0);
    report.callRateSummary = {
      windowSec: before.windowSec,
      barsAdvanced: before.barsAdvanced,
      calls: totalCalls,
      callsPerBar: before.barsAdvanced ? +(totalCalls / before.barsAdvanced).toFixed(2) : null,
      msInFingerprint: +totalMs.toFixed(1),
      msPerBar: before.barsAdvanced ? +(totalMs / before.barsAdvanced).toFixed(3) : null,
      shareOfWallClock: before.windowSec ? +((totalMs / (before.windowSec * 1_000)) * 100).toFixed(1) : null,
      note: 'shareOfWallClock is against ONE thread-second per second; four realms share one main thread, so 100% means the fingerprint alone saturates it',
    };
    console.error(`[ifp] ARM2 ${totalCalls} calls over ${before.barsAdvanced} bars = ${report.callRateSummary.callsPerBar}/bar, ${report.callRateSummary.msPerBar} ms/bar, ${report.callRateSummary.shareOfWallClock}% of wall clock`);
    save();

    // ARM 3 — kill-switch A/B.
    report.ab = { predicted: 'if the fingerprint is the choke, throughput rises when the flag is set', on: before };
    const flagged = await everyRealm(page, () => {
      window.__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1 = true;
      return { set: window.__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1 === true };
    });
    report.ab.flagSetInRealms = flagged.filter((r) => r.set).length;
    await keepConf01Playing(page, speed).catch(() => {});
    await sleep(15_000);
    report.ab.off = await throughput(page, abMinutes * 60_000);
    report.ab.result = {
      barsPerSecWithPathLive: report.ab.on.barsPerSec,
      barsPerSecWithPathDisabled: report.ab.off.barsPerSec,
      changePercent: (report.ab.on.barsPerSec && report.ab.off.barsPerSec)
        ? +((((report.ab.off.barsPerSec - report.ab.on.barsPerSec) / report.ab.on.barsPerSec) * 100)).toFixed(1)
        : null,
      caveat: 'n=1 window per arm, and the disabled arm runs LATER in the session, so more bars are resident: a same-direction bias against the flag, which makes any improvement a lower bound',
    };
    console.error(`[ifp] ARM3 A/B ${report.ab.on.barsPerSec} -> ${report.ab.off.barsPerSec} bars/s (${report.ab.result.changePercent}%) flagSetIn=${report.ab.flagSetInRealms} realms`);
    save();
    return report;
  } finally {
    await cdp.detach().catch(() => {});
    await browser.close().catch(() => {});
    save();
  }
}

function parseArgs(argv) {
  const o = {};
  for (const a of argv) {
    const [k, v] = a.replace(/^--/, '').split('=');
    if (k === 'speed') o.speed = Number(v);
    else if (k === 'ab-minutes') o.abMinutes = Number(v);
    else if (k === 'out') o.outPath = v;
  }
  return o;
}

const invokedDirectly = process.argv[1] && /indicator-fp-probe\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (invokedDirectly) await runIndicatorFpProbe(parseArgs(process.argv.slice(2)));
