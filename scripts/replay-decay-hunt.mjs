#!/usr/bin/env node
/**
 * REPLAY-DECAY-HUNT-V1 — reproduce the PO's zero-trade run and answer one question:
 * is per-tick cost FLAT, or does it grow with the number of bars already played?
 *
 * CONFIGURATION IS THE POINT (CONF-03). Four panels, four different symbols, four
 * different timeframes, TWO indicators each, 60x, and ZERO trades. The zero-trade cell
 * is what separates the bar-driven defect from the trade-driven element leak, so the
 * harness is explicitly told not to place its usual order.
 *
 * MEAS-02 — what each gauge here can and cannot see, stated per gauge:
 *   - tickMs: wall time INSIDE the product's own replay advance function, per call,
 *     measured in the realm that owns the panel. It sees that function's synchronous
 *     cost only. It cannot see work the tick defers to a later task, to a worker, or
 *     to style/layout/paint that Chrome performs after the call returns.
 *   - longTasks: main-thread tasks over 50 ms, from PerformanceObserver in each realm.
 *     This is the gauge that catches deferred work tickMs misses, at task granularity
 *     rather than per function.
 *   - barsPerSec / effectiveSpeed: product-observable throughput, derived from the
 *     replay index actually advancing. It is what the PO perceives; it sees everything.
 *   - rendererCpuPercent: whole-renderer-process CPU from CDP, all threads. Blind to
 *     which function; that is what the profile diff is for.
 *   - profile self-time shares: JS only, sampled at 1 kHz, main thread of the page
 *     target. Blind to non-JS work (style, layout, paint, GC housekeeping appears as
 *     (program)/(garbage collector) pseudo-frames, which are reported, not hidden).
 *
 * GATE-01: an offline self-test plants a tick whose cost grows with bars played and a
 * control tick whose cost is constant. The instrument must report a climbing slope for
 * the first and a flat one for the second, or its verdict on the product is worthless.
 */
import fs from 'node:fs';

import { fitTrend } from './lib/duration-trend.mjs';
import { bootConf01Session, keepConf01Playing, readConf01State } from './lib/conf01-session.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Two indicators, matching the PO's run rather than the harness's usual four. */
export const PO_TWO_INDICATORS = [['sma', { period: 20 }], ['rsi', { period: 14 }]];

/**
 * Installed in every realm: wraps the product's per-bar replay advance and records a
 * rolling window of per-call durations, plus long tasks.
 *
 * The advance function is found by name from a candidate list because the product has
 * no single documented entry point; whichever names exist are wrapped and REPORTED, so
 * a run that wrapped nothing says so instead of reporting a confident zero.
 */
function tickInstrumentSource() {
  return (() => {
    if (window.__rdh) {
      return { already: true, wrapped: window.__rdh.wrapped, realm: window.__rdh.realm };
    }
    const CANDIDATES = [
      'advanceReplay', 'advanceOneBar', 'stepForward', 'nextBar', 'processNextBar',
      'tick', 'replayTick', 'onReplayTick', 'advance', 'step', 'playStep',
      'advanceToNextCandle', 'processReplayTick',
    ];
    const state = {
      realm: `${location.pathname}${location.search}`.slice(-70),
      wrapped: [],
      calls: 0,
      totalMs: 0,
      durations: [],
      maxMs: 0,
      longTasks: 0,
      longTaskMs: 0,
      longTaskMax: 0,
    };
    window.__rdh = state;

    const rs = window.chart && window.chart.replaySystem;
    if (rs) {
      const proto = Object.getPrototypeOf(rs) || rs;
      for (const name of CANDIDATES) {
        for (const holder of new Set([rs, proto])) {
          const fn = holder && holder[name];
          if (typeof fn !== 'function' || fn.__rdhWrapped) continue;
          const wrap = function rdhWrappedTick(...args) {
            const t0 = performance.now();
            try {
              return fn.apply(this, args);
            } finally {
              const dt = performance.now() - t0;
              state.calls += 1;
              state.totalMs += dt;
              if (dt > state.maxMs) state.maxMs = dt;
              // Bounded ring: the instrument must not grow with the run it measures.
              state.durations.push(dt);
              if (state.durations.length > 4_000) state.durations.splice(0, 2_000);
            }
          };
          wrap.__rdhWrapped = true;
          try {
            holder[name] = wrap;
            state.wrapped.push(name);
          } catch { /* frozen */ }
        }
      }
    }

    try {
      const obs = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          state.longTasks += 1;
          state.longTaskMs += e.duration;
          if (e.duration > state.longTaskMax) state.longTaskMax = e.duration;
        }
      });
      obs.observe({ entryTypes: ['longtask'] });
      state.longTaskObserver = true;
    } catch { state.longTaskObserver = false; }

    state.readAndReset = () => {
      const d = state.durations.slice();
      d.sort((a, b) => a - b);
      const out = {
        realm: state.realm,
        wrapped: state.wrapped,
        calls: state.calls,
        meanMs: state.calls ? +(state.totalMs / state.calls).toFixed(4) : null,
        windowSamples: d.length,
        windowMeanMs: d.length ? +(d.reduce((a, b) => a + b, 0) / d.length).toFixed(4) : null,
        windowP50Ms: d.length ? +d[Math.floor(d.length * 0.5)].toFixed(4) : null,
        windowP95Ms: d.length ? +d[Math.floor(d.length * 0.95)].toFixed(4) : null,
        maxMs: +state.maxMs.toFixed(3),
        longTasks: state.longTasks,
        longTaskMs: +state.longTaskMs.toFixed(1),
        longTaskMaxMs: +state.longTaskMax.toFixed(1),
        replayIndex: (window.chart && window.chart.replaySystem
          && window.chart.replaySystem.currentIndex) ?? null,
        bars: Array.isArray(window.chart && window.chart.data) ? window.chart.data.length : null,
        timeframe: (window.chart && window.chart.currentTimeframe) || null,
        indicators: ((window.chart && window.chart.indicators
          && window.chart.indicators.active) || []).length,
        elements: document.querySelectorAll('*').length,
      };
      // Per-window statistics reset; cumulative counters do not, so both are available.
      state.durations.length = 0;
      state.longTasks = 0;
      state.longTaskMs = 0;
      state.longTaskMax = 0;
      return out;
    };

    return { already: false, realm: state.realm, wrapped: state.wrapped, longTaskObserver: state.longTaskObserver };
  })();
}

async function installEverywhere(page, fn) {
  const out = [];
  for (const frame of page.frames()) {
    try {
      out.push({ url: frame.url().slice(-70), ...(await frame.evaluate(fn)) });
    } catch (e) {
      out.push({ url: frame.url().slice(-70), error: String(e?.message || e).slice(0, 140) });
    }
  }
  return out;
}

async function readTicksEverywhere(page) {
  const out = [];
  for (const frame of page.frames()) {
    try {
      const r = await frame.evaluate(() => (window.__rdh ? window.__rdh.readAndReset() : null));
      if (r) out.push(r);
    } catch { /* frame gone */ }
  }
  return out;
}

/** Whole-renderer CPU over a window, from CDP process metrics. */
async function rendererCpuPercent(cdp, windowMs = 4_000) {
  const read = async () => {
    const m = await cdp.send('Performance.getMetrics').catch(() => ({ metrics: [] }));
    const get = (n) => (m.metrics || []).find((x) => x.name === n)?.value ?? null;
    return { ts: Date.now(), task: get('TaskDuration'), heapMB: get('JSHeapUsedSize') != null ? +(get('JSHeapUsedSize') / 1048576).toFixed(2) : null, nodes: get('Nodes'), listeners: get('JSEventListeners') };
  };
  const a = await read();
  await sleep(windowMs);
  const b = await read();
  const pct = (a.task != null && b.task != null && b.ts > a.ts)
    ? +(((b.task - a.task) / ((b.ts - a.ts) / 1000)) * 100).toFixed(1) : null;
  return { rendererCpuPercent: pct, heapMB: b.heapMB, nodes: b.nodes, listeners: b.listeners };
}

/** A JS self-time profile of the page's main thread. */
async function takeProfile(cdp, ms) {
  await cdp.send('Profiler.enable').catch(() => {});
  await cdp.send('Profiler.setSamplingInterval', { interval: 1_000 }).catch(() => {});
  await cdp.send('Profiler.start');
  await sleep(ms);
  const { profile } = await cdp.send('Profiler.stop');
  const byId = new Map();
  for (const node of profile.nodes || []) byId.set(node.id, node);
  const selfByFn = new Map();
  let totalHits = 0;
  for (const node of profile.nodes || []) {
    const hits = node.hitCount || 0;
    if (!hits) continue;
    totalHits += hits;
    const cf = node.callFrame || {};
    const file = String(cf.url || '').split('/').pop().split('?')[0] || '(no url)';
    const key = `${cf.functionName || '(anonymous)'}@${file}:${cf.lineNumber ?? '?'}`;
    selfByFn.set(key, (selfByFn.get(key) || 0) + hits);
  }
  const rows = [...selfByFn.entries()]
    .map(([fn, hits]) => ({ fn, hits, selfPercent: totalHits ? +((hits / totalHits) * 100).toFixed(2) : 0 }))
    .sort((a, b) => b.hits - a.hits);
  return { totalHits, durationMs: ms, top: rows.slice(0, 40) };
}

/** The Director's diff: whose SHARE grows between the first and last profile. */
export function diffProfiles(first, last, { minShare = 0.5 } = {}) {
  const firstMap = new Map((first?.top || []).map((r) => [r.fn, r.selfPercent]));
  const lastMap = new Map((last?.top || []).map((r) => [r.fn, r.selfPercent]));
  const names = new Set([...firstMap.keys(), ...lastMap.keys()]);
  const rows = [];
  for (const fn of names) {
    const a = firstMap.get(fn) ?? 0;
    const b = lastMap.get(fn) ?? 0;
    if (Math.max(a, b) < minShare) continue;
    rows.push({ fn, firstPercent: a, lastPercent: b, deltaPercentPoints: +(b - a).toFixed(2) });
  }
  rows.sort((x, y) => y.deltaPercentPoints - x.deltaPercentPoints);
  return { grew: rows.slice(0, 15), shrank: rows.slice(-10).reverse() };
}

export async function runReplayDecayHunt({
  minutes = 20, intervalMs = 30_000, speed = 60, profileMs = 60_000, outPath = null,
} = {}) {
  const { browser, page, cdp, conf01 } = await bootConf01Session({
    replaySpeed: speed,
    indicators: PO_TWO_INDICATORS,
    placeOrder: false,
  });
  const report = {
    signature: 'REPLAY-DECAY-HUNT-V1',
    startedAtIso: new Date().toISOString(),
    reproduces: 'PO zero-trade run: 4 panels, 4 symbols, 4 timeframes, 2 indicators each, 60x, ZERO trades',
    plan: { minutes, intervalMs, speed, profileMs },
    conf01: { compliant: conf01?.compliant, failed: conf01?.failed, datasets: conf01?.observedDatasets },
    zeroTrades: { orderPlacedByHarness: conf01?.workload?.order?.skipped === true ? false : null },
    samples: [],
  };
  const save = () => { if (outPath) fs.writeFileSync(outPath, JSON.stringify(report, null, 1)); };
  save();

  report.liveness = { crashed: false, errors: [] };
  page.on('error', (err) => {
    report.liveness.crashed = true;
    report.liveness.errors.push(String(err?.message || err).slice(0, 200));
    console.error(`[rdh] PAGE CRASHED: ${String(err?.message || err).slice(0, 160)}`);
    save();
  });

  try {
    report.build = await page.evaluate(() => {
      const s = [...document.querySelectorAll('script[src]')]
        .map((x) => /[?&]v=([\w.\-]+)/.exec(x.getAttribute('src') || '')).find(Boolean);
      return { scriptVersion: s ? s[1] : null, href: location.href };
    }).catch(() => null);
    console.error(`[rdh] build=${JSON.stringify(report.build)} conf01=${conf01?.compliant} order=${JSON.stringify(conf01?.workload?.order?.skipped ?? 'unknown')}`);

    // Confirm the zero-trade control from PRODUCT state, not from my own intent.
    report.tradeControl = await page.evaluate(() => {
      const om = window.chart && (window.chart.orderManager || window.orderManager);
      return {
        open: (om?.openPositions || []).length,
        closed: (om?.closedPositions || []).length,
        journal: (om?.tradeJournal || []).length,
      };
    }).catch(() => null);
    console.error(`[rdh] zero-trade control: ${JSON.stringify(report.tradeControl)}`);

    report.instrumented = await installEverywhere(page, tickInstrumentSource);
    const wrappedCount = report.instrumented.filter((r) => (r.wrapped || []).length).length;
    console.error(`[rdh] instrumented realms=${report.instrumented.length} withWrappedTick=${wrappedCount} names=${JSON.stringify([...new Set(report.instrumented.flatMap((r) => r.wrapped || []))])}`);
    report.tickWrapCoverage = {
      realms: report.instrumented.length,
      realmsWithWrappedTick: wrappedCount,
      note: wrappedCount === 0
        ? 'NO tick function wrapped: tickMs is unavailable and the verdict must rest on barsPerSec and longTasks'
        : 'tickMs available in the realms listed; realms without a wrap report null rather than zero',
    };
    save();

    const startedAt = Date.now();
    report.profileFirst = await takeProfile(cdp, profileMs);
    console.error(`[rdh] first profile: ${report.profileFirst.totalHits} samples, top=${report.profileFirst.top.slice(0, 3).map((r) => `${r.fn}:${r.selfPercent}%`).join(' ')}`);
    save();

    let n = 0;
    let profiledLast = false;
    while ((Date.now() - startedAt) / 60_000 < minutes) {
      n += 1;
      const minutesNow = (Date.now() - startedAt) / 60_000;
      // Last two minutes: take the comparison profile.
      if (!profiledLast && minutes - minutesNow <= profileMs / 60_000 + 0.6) {
        report.profileLast = await takeProfile(cdp, profileMs);
        profiledLast = true;
        console.error(`[rdh] last profile: ${report.profileLast.totalHits} samples`);
        save();
        continue;
      }
      try {
        const cpu = await rendererCpuPercent(cdp, 4_000);
        const ticks = await readTicksEverywhere(page);
        const state = await readConf01State(page, { advanceWindowMs: 3_000 });
        const host = ticks[0] || null;
        const barsTotal = ticks.reduce((t, r) => t + (Number(r.replayIndex) || 0), 0);
        const tickMsWeighted = (() => {
          const withCalls = ticks.filter((r) => r.windowSamples > 0 && r.windowMeanMs != null);
          if (!withCalls.length) return null;
          const calls = withCalls.reduce((t, r) => t + r.windowSamples, 0);
          const ms = withCalls.reduce((t, r) => t + r.windowMeanMs * r.windowSamples, 0);
          return calls ? +(ms / calls).toFixed(4) : null;
        })();
        report.samples.push({
          n,
          minutes: +minutesNow.toFixed(3),
          hours: +((Date.now() - startedAt) / 3_600_000).toFixed(4),
          elapsedBarsAllPanels: barsTotal,
          hostReplayIndex: host?.replayIndex ?? null,
          tickMsWeighted,
          perPanelTick: ticks.map((r) => ({
            realm: r.realm, tf: r.timeframe, idx: r.replayIndex, calls: r.windowSamples,
            meanMs: r.windowMeanMs, p95Ms: r.windowP95Ms, maxMs: r.maxMs,
            longTasks: r.longTasks, longTaskMs: r.longTaskMs, indicators: r.indicators,
            elements: r.elements,
          })),
          longTasksTotal: ticks.reduce((t, r) => t + (r.longTasks || 0), 0),
          longTaskMsTotal: +ticks.reduce((t, r) => t + (r.longTaskMs || 0), 0).toFixed(1),
          advancingPanels: state?.advancingPanels ?? null,
          barsPerSecPerPanel: state?.perPanelAdvance ?? null,
          ...cpu,
        });
        console.error(`[rdh] #${n} ${minutesNow.toFixed(1)}min bars=${barsTotal} tickMs=${tickMsWeighted} longTasks=${report.samples.at(-1).longTasksTotal} (${report.samples.at(-1).longTaskMsTotal}ms) advancing=${state?.advancingPanels}/4 cpu=${cpu.rendererCpuPercent}% heap=${cpu.heapMB} nodes=${cpu.nodes}`);
      } catch (e) {
        report.samples.push({ n, minutes: +minutesNow.toFixed(3), error: String(e?.message || e).slice(0, 200) });
        console.error(`[rdh] #${n} FAILED: ${String(e?.message || e).slice(0, 160)}`);
        if (report.liveness.crashed) break;
      }
      save();
      // Playback must stay alive, but a re-seek resets elapsed bars, which is the very
      // x-axis of this experiment. So playback is nudged and any RE-SEEK is recorded as
      // a discontinuity rather than silently folded into the fit.
      const st = await readConf01State(page, { advanceWindowMs: 1_500 }).catch(() => null);
      if ((st?.advancingPanels ?? 0) < 4) {
        const r = await keepConf01Playing(page, speed).catch(() => null);
        if (r?.reseeks > 0) {
          report.samples.at(-1).reseekAfterThisSample = r.reseeks;
          console.error(`[rdh] #${n} RE-SEEK x${r.reseeks} — bar axis discontinuity recorded`);
        }
      }
      const spent = Date.now() - startedAt;
      if (n * intervalMs > spent) await sleep(n * intervalMs - spent);
    }
    if (!report.profileLast) report.profileLast = await takeProfile(cdp, Math.min(profileMs, 30_000));

    // THE QUESTION: does per-tick cost grow with bars already played?
    const good = report.samples.filter((s) => !s.error && Number.isFinite(s.elapsedBarsAllPanels));
    const beforeReseek = (() => {
      const idx = good.findIndex((s) => s.reseekAfterThisSample);
      return idx === -1 ? good : good.slice(0, idx + 1);
    })();
    // Slopes are fitted per THOUSAND bars, not per bar. Per-bar values are ~1e-5 and
    // the trend reporter rounds to three decimals, so a per-bar axis prints every real
    // slope as 0 — the self-test caught exactly that.
    const fitAgainstBars = (rows, pick, label, band) => ({
      xUnit: 'per 1,000 bars played',
      ...fitTrend(
        rows.map((s) => ({ hours: s.elapsedBarsAllPanels / 1_000, value: pick(s) }))
          .filter((p) => Number.isFinite(p.hours) && Number.isFinite(p.value)),
        { label, flatBandPerHour: band, minSpanHours: 0 },
      ),
    });
    report.verdictBasis = {
      samplesAll: good.length,
      samplesBeforeFirstReseek: beforeReseek.length,
      basis: beforeReseek.length >= 4 ? 'continuous bar axis before any re-seek' : 'all samples (too few before a re-seek); bar axis may contain a discontinuity',
    };
    const rows = beforeReseek.length >= 4 ? beforeReseek : good;
    report.trends = {
      tickMsVsBars: fitAgainstBars(rows, (s) => s.tickMsWeighted, 'tickMs per 1k bars played', 0.02),
      longTaskMsVsBars: fitAgainstBars(rows, (s) => s.longTaskMsTotal, 'longTaskMs per 1k bars played', 10),
      cpuVsBars: fitAgainstBars(rows, (s) => s.rendererCpuPercent, 'rendererCpu per 1k bars played', 5),
      barsPerSecVsBars: fitAgainstBars(rows, (s) => {
        const per = s.barsPerSecPerPanel;
        if (!Array.isArray(per)) return null;
        return per.reduce((t, p) => t + (Number(p?.barsPerSec) || 0), 0);
      }, 'throughput per 1k bars played', 1),
      heapVsBars: fitAgainstBars(rows, (s) => s.heapMB, 'heapMB per 1k bars played', 1),
    };
    report.profileDiff = diffProfiles(report.profileFirst, report.profileLast);

    const t = report.trends.tickMsVsBars;
    const lt = report.trends.longTaskMsVsBars;
    const thr = report.trends.barsPerSecVsBars;
    const climbs = (x) => x?.verdict === 'CLIMBS';
    report.verdict = {
      question: 'is per-tick cost flat, or does it grow with bars already played?',
      tickMsVerdict: t?.verdict ?? 'UNAVAILABLE',
      tickMsSlopePerBar: t?.perHour ?? null,
      tickMsCi: t?.slopeCi95 ?? null,
      throughputVerdict: thr?.verdict ?? 'UNAVAILABLE',
      longTaskVerdict: lt?.verdict ?? 'UNAVAILABLE',
      answer: (climbs(t) || climbs(lt) || thr?.verdict === 'FALLS')
        ? 'GROWS WITH BARS PLAYED — bar-driven cost confirmed; the profile diff names the function'
        : ((t?.verdict === 'BOUNDED' && thr?.verdict !== 'FALLS')
          ? 'FLAT — the bar-driven class hypothesis is not supported by this run'
          : 'UNRESOLVED — neither growth nor flatness established at this sample count'),
      namedCulprits: (report.profileDiff?.grew || []).slice(0, 5),
      tickCoverage: report.tickWrapCoverage,
    };
    console.error(`[rdh] ANSWER: ${report.verdict.answer}`);
    console.error(`[rdh] tickMs ${t?.perHour}/bar CI${JSON.stringify(t?.slopeCi95)} ${t?.verdict} · throughput ${thr?.perHour}/bar ${thr?.verdict} · longTaskMs ${lt?.perHour}/bar ${lt?.verdict}`);
    for (const g of (report.profileDiff?.grew || []).slice(0, 6)) {
      console.error(`[rdh]   +${g.deltaPercentPoints}pp  ${g.firstPercent}% -> ${g.lastPercent}%  ${g.fn}`);
    }
    save();
    return report;
  } finally {
    await cdp.detach().catch(() => {});
    await browser.close().catch(() => {});
    save();
  }
}

/** GATE-01 offline: a growing tick must read as CLIMBS, a constant tick as flat. */
export async function selfTestDecayHunt() {
  const { loadPuppeteer } = await import('./lib/heap-cycle-browser.mjs');
  const puppeteer = await loadPuppeteer();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const out = { signature: 'REPLAY-DECAY-HUNT-V1/self-test', arms: {} };
  try {
    for (const arm of ['growing', 'constant']) {
      const page = await browser.newPage();
      await page.setContent(`<!doctype html><body><script>
        window.chart = { data: [], currentTimeframe: '1m', indicators: { active: [1, 2] },
          replaySystem: { currentIndex: 0, isPlaying: true, isActive: true,
            advanceReplay() {
              this.currentIndex += 1;
              // "${arm}": cost per tick either scales with bars played, or does not.
              const work = ${arm === 'growing' ? 'this.currentIndex * 40' : '400'};
              let x = 0; for (let i = 0; i < work; i += 1) x += Math.sqrt(i);
              window.__sink = x;
            } } };
      </script></body>`);
      await page.evaluate(tickInstrumentSource);
      const samples = [];
      for (let s = 0; s < 6; s += 1) {
        await page.evaluate(() => {
          for (let i = 0; i < 400; i += 1) window.chart.replaySystem.advanceReplay();
        });
        const r = await page.evaluate(() => window.__rdh.readAndReset());
        samples.push({ bars: r.replayIndex, tickMs: r.windowMeanMs });
      }
      const fit = fitTrend(samples.map((s) => ({ hours: s.bars / 1_000, value: s.tickMs })),
        { label: arm, flatBandPerHour: 0.0005, minSpanHours: 0 });
      out.arms[arm] = { samples, slopePerBar: fit.perHour, ci: fit.slopeCi95, verdict: fit.verdict };
      await page.close();
    }
    out.gate01 = {
      growingReadsAsClimbing: out.arms.growing?.verdict === 'CLIMBS',
      constantReadsAsFlat: out.arms.constant?.verdict !== 'CLIMBS',
    };
    out.gate01.verdict = (out.gate01.growingReadsAsClimbing && out.gate01.constantReadsAsFlat) ? 'PASS' : 'FAIL';
    return out;
  } finally {
    await browser.close().catch(() => {});
  }
}

function parseArgs(argv) {
  const o = {};
  for (const a of argv) {
    const [k, v] = a.replace(/^--/, '').split('=');
    if (k === 'minutes') o.minutes = Number(v);
    else if (k === 'interval-ms') o.intervalMs = Number(v);
    else if (k === 'speed') o.speed = Number(v);
    else if (k === 'profile-ms') o.profileMs = Number(v);
    else if (k === 'self-test') o.selfTest = true;
    else if (k === 'out') o.outPath = v;
  }
  return o;
}

const invokedDirectly = process.argv[1] && /replay-decay-hunt\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (invokedDirectly) {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) {
    const out = await selfTestDecayHunt();
    if (args.outPath) fs.writeFileSync(args.outPath, JSON.stringify(out, null, 1));
    console.error(`[rdh/self-test] GATE-01 ${out.gate01.verdict}: ${JSON.stringify(out.gate01)}`);
    for (const [arm, v] of Object.entries(out.arms)) {
      console.error(`[rdh/self-test]   ${arm}: ${v.slopePerBar}/bar CI${JSON.stringify(v.ci)} ${v.verdict}`);
    }
  } else {
    await runReplayDecayHunt(args);
  }
}
