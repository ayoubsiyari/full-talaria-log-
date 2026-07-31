#!/usr/bin/env node
/**
 * INDICATOR-DECAY-AB-V1 — test 4 of the tick-animation branch (ruling 606defe033):
 * the PO's exact run twice, once with two indicators per chart and once with ZERO,
 * everything else identical. If the decay disappears at zero indicators, Monster 2 is
 * the per-frame recalc path.
 *
 * Two things this instrument must not get wrong:
 *
 *  1. ZERO MUST MEAN ZERO. The arming path retains pre-existing indicators, so the
 *     zero arm actively removes every active indicator in every realm and then VERIFIES
 *     the count is 0 per realm. An arm that silently ran with three indicators would
 *     invert the conclusion.
 *  2. THE MODE MUST BE RECORDED, NOT ASSUMED (`CONF-04`). Both arms read
 *     getPlaybackMode() and getPlaybackLoopKind() from every running instance at start
 *     and end, and both arms set the same mode explicitly.
 *
 * MEAS-02: the decay gauge is renderer CPU-ms per bar advanced (whole renderer process,
 * all threads, divided by product-observable bar advance) plus throughput. It sees all
 * work and attributes none; that is deliberate, because the question here is whether the
 * curve exists at all in each arm, not which function owns it.
 */
import fs from 'node:fs';

import { fitTrend } from './lib/duration-trend.mjs';
import { bootConf01Session, keepConf01Playing, readConf01State } from './lib/conf01-session.mjs';
import { PO_TWO_INDICATORS } from './replay-decay-hunt.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function stripIndicatorsSource() {
  const chart = window.chart;
  if (!chart) return { ok: false, reason: 'no chart' };
  const before = ((chart.indicators && chart.indicators.active) || []).length;
  try {
    const active = [...((chart.indicators && chart.indicators.active) || [])];
    if (typeof chart.removeIndicator === 'function') {
      for (const ind of active) { try { chart.removeIndicator(ind.id || ind); } catch (_) {} }
    }
    const still = (chart.indicators && chart.indicators.active) || [];
    if (still.length && Array.isArray(chart.indicators.active)) chart.indicators.active.length = 0;
  } catch (e) {
    return { ok: false, before, error: String(e?.message || e).slice(0, 120) };
  }
  const after = ((chart.indicators && chart.indicators.active) || []).length;
  return { ok: after === 0, before, after };
}

function modeSource(setTo) {
  const rs = window.chart && window.chart.replaySystem;
  if (!rs) return null;
  if (setTo && typeof rs.setPlaybackMode === 'function') {
    try { rs.setPlaybackMode(setTo, { restartPlayback: true }); } catch (_) {}
  }
  return {
    mode: typeof rs.getPlaybackMode === 'function' ? rs.getPlaybackMode() : null,
    loopKind: typeof rs.getPlaybackLoopKind === 'function' ? rs.getPlaybackLoopKind() : null,
    rawMode: String(rs.playbackMode),
    indicators: ((window.chart.indicators && window.chart.indicators.active) || []).length,
    replayIndex: rs.currentIndex ?? null,
    residentBars: Array.isArray(window.chart.data) ? window.chart.data.length : null,
    timeframe: window.chart.currentTimeframe || null,
  };
}

async function everyRealm(page, fn, arg) {
  const rows = [];
  for (const frame of page.frames()) {
    try {
      const r = arg === undefined ? await frame.evaluate(fn) : await frame.evaluate(fn, arg);
      if (r) rows.push({ url: frame.url().slice(-60), ...r });
    } catch (e) {
      rows.push({ url: frame.url().slice(-60), error: String(e?.message || e).slice(0, 140) });
    }
  }
  return rows;
}

async function cpuAndBars(cdp, page, windowMs) {
  const read = async () => {
    const m = await cdp.send('Performance.getMetrics').catch(() => ({ metrics: [] }));
    const task = (m.metrics || []).find((x) => x.name === 'TaskDuration')?.value ?? null;
    const heap = (m.metrics || []).find((x) => x.name === 'JSHeapUsedSize')?.value ?? null;
    // Peers are seeked by TIMESTAMP, not stepped by index, so currentIndex stays frozen
    // for them while they genuinely advance. Both are recorded: the index sum is the
    // host's bar axis, and the simulated-time sum shows which realms are really moving.
    let bars = 0;
    const perRealm = [];
    for (const frame of page.frames()) {
      try {
        const r = await frame.evaluate(() => {
          const rs = window.chart && window.chart.replaySystem;
          if (!rs) return null;
          return {
            idx: Number.isFinite(rs.currentIndex) ? rs.currentIndex : 0,
            simMs: Number.isFinite(Number(rs.replayTimestamp)) ? Number(rs.replayTimestamp) : null,
            residentBars: Array.isArray(window.chart.data) ? window.chart.data.length : null,
            tf: window.chart.currentTimeframe || null,
          };
        });
        if (r) { bars += r.idx; perRealm.push(r); }
      } catch { /* frame gone */ }
    }
    return { ts: Date.now(), task, bars, perRealm, heapMB: heap != null ? +(heap / 1048576).toFixed(2) : null };
  };
  const a = await read();
  await sleep(windowMs);
  const b = await read();
  const secs = (b.ts - a.ts) / 1000;
  const barsAdvanced = b.bars - a.bars;
  const cpuPercent = (a.task != null && b.task != null && secs > 0)
    ? +(((b.task - a.task) / secs) * 100).toFixed(1) : null;
  const realmAdvance = (b.perRealm || []).map((r, i) => {
    const was = (a.perRealm || [])[i] || {};
    return {
      tf: r.tf,
      indexAdvance: (r.idx ?? 0) - (was.idx ?? 0),
      simMsAdvance: (r.simMs != null && was.simMs != null) ? r.simMs - was.simMs : null,
      residentBarsAdvance: (r.residentBars != null && was.residentBars != null)
        ? r.residentBars - was.residentBars : null,
    };
  });
  return {
    windowSec: +secs.toFixed(1),
    barsAdvanced,
    barsPerSec: secs > 0 ? +(barsAdvanced / secs).toFixed(2) : null,
    cpuPercent,
    cpuMsPerBar: (cpuPercent != null && barsAdvanced > 0)
      ? +(((cpuPercent / 100) * secs * 1000) / barsAdvanced).toFixed(2) : null,
    atBars: b.bars,
    heapMB: b.heapMB,
    realmAdvance,
    realmsAdvancingByIndex: realmAdvance.filter((r) => r.indexAdvance > 0).length,
    realmsAdvancingBySimTime: realmAdvance.filter((r) => (r.simMsAdvance ?? 0) > 0).length,
  };
}

export async function runArm({
  indicators, minutes, speed, mode, outPath, report,
}) {
  const arm = {
    indicators, minutes, speed, modeRequested: mode, samples: [],
  };
  const { browser, page, cdp, conf01 } = await bootConf01Session({
    replaySpeed: speed,
    indicators: indicators === 0 ? [] : PO_TWO_INDICATORS,
    placeOrder: false,
  });
  const save = () => { if (outPath) fs.writeFileSync(outPath, JSON.stringify(report, null, 1)); };
  try {
    arm.build = await page.evaluate(() => {
      const s = [...document.querySelectorAll('script[src]')]
        .map((x) => /[?&]v=([\w.\-]+)/.exec(x.getAttribute('src') || '')).find(Boolean);
      return { scriptVersion: s ? s[1] : null };
    }).catch(() => null);
    arm.conf01 = { compliant: conf01?.compliant, failed: conf01?.failed };

    if (indicators === 0) {
      arm.strip = await everyRealm(page, stripIndicatorsSource);
      arm.zeroVerified = arm.strip.filter((r) => r.after === 0).length;
      arm.zeroFailedIn = arm.strip.filter((r) => r.after > 0).map((r) => ({ realm: r.url, after: r.after }));
      console.error(`[ab] arm=0ind strip: ${JSON.stringify(arm.strip.map((r) => `${r.before}->${r.after}`))} zeroVerifiedIn=${arm.zeroVerified} realms`);
    }

    arm.modeAtStart = await everyRealm(page, modeSource, mode);
    console.error(`[ab] arm=${indicators}ind build=${arm.build?.scriptVersion} mode=${JSON.stringify(arm.modeAtStart.map((r) => `${r.mode}/${r.loopKind}`))} ind=${JSON.stringify(arm.modeAtStart.map((r) => r.indicators))}`);
    await keepConf01Playing(page, speed).catch(() => {});
    await sleep(5_000);
    save();

    const startedAt = Date.now();
    let n = 0;
    while ((Date.now() - startedAt) / 60_000 < minutes) {
      n += 1;
      const w = await cpuAndBars(cdp, page, 20_000);
      const st = await readConf01State(page, { advanceWindowMs: 2_000 }).catch(() => null);
      arm.samples.push({
        n, minutes: +((Date.now() - startedAt) / 60_000).toFixed(2),
        advancingPanels: st?.advancingPanels ?? null, ...w,
      });
      console.error(`[ab] arm=${indicators}ind #${n} ${arm.samples.at(-1).minutes}min bars=${w.atBars} ${w.barsPerSec} bars/s cpu=${w.cpuPercent}% cpuMsPerBar=${w.cpuMsPerBar} byIndex=${w.realmsAdvancingByIndex}/4 bySimTime=${w.realmsAdvancingBySimTime}/4`);
      save();
      if ((st?.advancingPanels ?? 0) < 4) await keepConf01Playing(page, speed).catch(() => {});
      await sleep(10_000);
    }
    arm.modeAtEnd = await everyRealm(page, modeSource, null);

    const good = arm.samples.filter((s) => Number.isFinite(s.cpuMsPerBar) && Number.isFinite(s.atBars));
    const fit = (pick, label, band) => ({
      xUnit: 'per 1,000 bars played',
      ...fitTrend(good.map((s) => ({ hours: s.atBars / 1_000, value: pick(s) }))
        .filter((p) => Number.isFinite(p.value)), { label, flatBandPerHour: band, minSpanHours: 0 }),
    });
    const mean = (rows, k) => (rows.length
      ? +(rows.reduce((t, r) => t + r[k], 0) / rows.length).toFixed(2) : null);
    const firstThird = good.slice(0, Math.max(1, Math.floor(good.length / 3)));
    const lastThird = good.slice(-Math.max(1, Math.floor(good.length / 3)));
    arm.result = {
      samples: good.length,
      barSpan: good.length ? { from: good[0].atBars, to: good.at(-1).atBars } : null,
      cpuMsPerBarFirstThird: mean(firstThird, 'cpuMsPerBar'),
      cpuMsPerBarLastThird: mean(lastThird, 'cpuMsPerBar'),
      cpuMsPerBarChangePercent: (mean(firstThird, 'cpuMsPerBar') && mean(lastThird, 'cpuMsPerBar'))
        ? +(((mean(lastThird, 'cpuMsPerBar') - mean(firstThird, 'cpuMsPerBar')) / mean(firstThird, 'cpuMsPerBar')) * 100).toFixed(1) : null,
      barsPerSecFirstThird: mean(firstThird, 'barsPerSec'),
      barsPerSecLastThird: mean(lastThird, 'barsPerSec'),
      cpuPercentMean: mean(good, 'cpuPercent'),
      trends: {
        cpuMsPerBar: fit((s) => s.cpuMsPerBar, `cpuMsPerBar @${indicators}ind`, 0.5),
        barsPerSec: fit((s) => s.barsPerSec, `barsPerSec @${indicators}ind`, 0.1),
      },
      modeAtStart: arm.modeAtStart.map((r) => r.mode),
      modeAtEnd: (arm.modeAtEnd || []).map((r) => r.mode),
      loopKindAtEnd: (arm.modeAtEnd || []).map((r) => r.loopKind),
      indicatorsAtEnd: (arm.modeAtEnd || []).map((r) => r.indicators),
    };
    console.error(`[ab] arm=${indicators}ind RESULT cpuMsPerBar ${arm.result.cpuMsPerBarFirstThird} -> ${arm.result.cpuMsPerBarLastThird} (${arm.result.cpuMsPerBarChangePercent}%) slope ${arm.result.trends.cpuMsPerBar.perHour} CI${JSON.stringify(arm.result.trends.cpuMsPerBar.slopeCi95)} ${arm.result.trends.cpuMsPerBar.verdict}`);
    return arm;
  } finally {
    await cdp.detach().catch(() => {});
    await browser.close().catch(() => {});
  }
}

export async function runIndicatorDecayAb({
  minutes = 15, speed = 60, mode = 'candle', outPath = null,
} = {}) {
  const report = {
    signature: 'INDICATOR-DECAY-AB-V1',
    startedAtIso: new Date().toISOString(),
    ruling: '606defe033 test 4',
    question: 'does the decay disappear at zero indicators?',
    plan: { minutes, speed, mode },
    arms: {},
  };
  const save = () => { if (outPath) fs.writeFileSync(outPath, JSON.stringify(report, null, 1)); };
  save();
  // Two indicators first, so the zero arm cannot be credited to a machine that has been
  // running longer; if anything that ordering biases AGAINST the hypothesis.
  report.arms.twoIndicators = await runArm({ indicators: 2, minutes, speed, mode, outPath, report });
  save();
  report.arms.zeroIndicators = await runArm({ indicators: 0, minutes, speed, mode, outPath, report });
  save();

  const a = report.arms.twoIndicators?.result;
  const b = report.arms.zeroIndicators?.result;
  const decays = (r) => r?.trends?.cpuMsPerBar?.verdict === 'CLIMBS';
  report.verdict = {
    twoIndicators: {
      cpuMsPerBarChangePercent: a?.cpuMsPerBarChangePercent ?? null,
      slope: a?.trends?.cpuMsPerBar?.perHour ?? null,
      ci: a?.trends?.cpuMsPerBar?.slopeCi95 ?? null,
      verdict: a?.trends?.cpuMsPerBar?.verdict ?? null,
    },
    zeroIndicators: {
      cpuMsPerBarChangePercent: b?.cpuMsPerBarChangePercent ?? null,
      slope: b?.trends?.cpuMsPerBar?.perHour ?? null,
      ci: b?.trends?.cpuMsPerBar?.slopeCi95 ?? null,
      verdict: b?.trends?.cpuMsPerBar?.verdict ?? null,
    },
    zeroArmVerifiedAtZeroIndicators: report.arms.zeroIndicators?.zeroVerified ?? null,
    zeroArmFailedIn: report.arms.zeroIndicators?.zeroFailedIn ?? null,
    modeRecorded: { two: a?.modeAtEnd ?? null, zero: b?.modeAtEnd ?? null },
    answer: (decays(a) && !decays(b))
      ? 'THE DECAY IS INDICATOR-DEPENDENT — it climbs with two indicators and does not at zero; Monster 2 is the recalc path'
      : ((decays(a) && decays(b))
        ? 'THE DECAY SURVIVES ZERO INDICATORS — the recalc path is not the whole of Monster 2'
        : (!decays(a)
          ? 'INCONCLUSIVE — the two-indicator arm did not reproduce a climbing curve, so the A/B has no signal to remove'
          : 'INCONCLUSIVE')),
  };
  console.error(`[ab] ANSWER: ${report.verdict.answer}`);
  save();
  return report;
}

function parseArgs(argv) {
  const o = {};
  for (const a of argv) {
    const [k, v] = a.replace(/^--/, '').split('=');
    if (k === 'minutes') o.minutes = Number(v);
    else if (k === 'speed') o.speed = Number(v);
    else if (k === 'mode') o.mode = v;
    else if (k === 'out') o.outPath = v;
  }
  return o;
}

const invokedDirectly = process.argv[1] && /indicator-decay-ab\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (invokedDirectly) await runIndicatorDecayAb(parseArgs(process.argv.slice(2)));
