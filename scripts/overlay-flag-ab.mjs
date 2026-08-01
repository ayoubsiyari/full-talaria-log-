#!/usr/bin/env node
/**
 * ONE-VARIABLE A/B on __TALARIA_DISABLE_ORDER_OVERLAY_PAN_ALWAYS_V1.
 *
 * The trace says `_syncOrderOverlaysDuringPan` re-resolves order markers from `render` on every replay
 * update with nobody panning, and that the marker lookup under it was 31.8% of a 692 ms freeze. The switch
 * already exists in deployed chart.js:30109 and covers the HOT call site. This confirms or refutes that
 * verdict live.
 *
 * DESIGN NOTES THAT MATTER:
 *  - TRADES ARE REQUIRED. The marker cost is trades x bars; my own zero-trade traces show the whole
 *    order-manager family absent. An A/B run with an empty book would read "no effect" for the wrong reason
 *    and would look like a refutation. The book is loaded first and the trade count is asserted non-zero.
 *  - THE FLAG IS PER REALM. Four realms share one thread and each has its own `window`, so setting it on the
 *    host alone would leave three panels untouched. It is set in every frame and READ BACK from every frame.
 *  - ONE VARIABLE. Same session, same panels, same bars accumulating; nothing else is touched between arms,
 *    and the bar count at each arm is recorded so a rising cost is not mistaken for a flag effect.
 *
 * SEAL: unsealed build (A's and E's uncommitted product changes are in the tree). Reported as a RELATIVE
 * before/after within one session, which is what the seal permits.
 */
import fs from 'node:fs';
import { bootConf01Session, cycleTrades } from './lib/conf01-session.mjs';
import { loadConf05Indicators } from './lib/conf05-indicators.mjs';

const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const WARM_MS = Number(argOf('warmMs', '600000'));
const ARM_MS = Number(argOf('armMs', '180000'));
const TRADES = Number(argOf('trades', '12'));
const OUT = argOf('out', 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\OVERLAY-FLAG-AB-20260801.json');
const FLAG = '__TALARIA_DISABLE_ORDER_OVERLAY_PAN_ALWAYS_V1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.error(`[ab ${new Date().toISOString()}] ${m}`);

const report = {
  signature: 'OVERLAY-FLAG-AB-V1',
  artifactFile: OUT.split('\\').pop(),
  at: new Date().toISOString(),
  bfcacheState: 'default (enabled) — a fresh session, no reset axis measured here.',
  flag: FLAG,
  killSwitchSite: 'deployed chart.js:30109, covering the hot call site in render (the other at 30012 sits inside a visible.length===0 branch that returns)',
  sealStatus: { sealed: false, label: 'UNSEALED BUILD — relative before/after within one session only, no absolute cadence quoted against a sealed build' },
  whyThisExists: 'Confirms or refutes the trace verdict for the cost of one console command, on the live product rather than in a profile.',
};
const save = () => fs.writeFileSync(OUT, JSON.stringify(report, null, 1));

/** Freeze cadence + blocking, measured in-page so no trace is needed. */
async function measureFreezes(page, ms, label) {
  await page.evaluate((dur) => {
    window.__abFreeze = { entries: [], startedAt: performance.now() };
    if (window.__abObs) { try { window.__abObs.disconnect(); } catch { /* gone */ } }
    window.__abObs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        // buffered:false, but Chrome can still surface an entry that began earlier; drop those explicitly.
        if (e.startTime >= window.__abFreeze.startedAt) window.__abFreeze.entries.push({ start: e.startTime, dur: e.duration });
      }
    });
    window.__abObs.observe({ type: 'longtask', buffered: false });
    window.__abFreeze.plannedMs = dur;
  }, ms);
  await sleep(ms);
  const r = await page.evaluate(() => {
    const f = window.__abFreeze;
    const sec = (performance.now() - f.startedAt) / 1000;
    const e = f.entries;
    const sum = (fn) => e.reduce((s, x) => s + fn(x), 0);
    const blocking = sum((x) => Math.max(0, x.dur - 50));
    const total = sum((x) => x.dur);
    return {
      windowSec: +sec.toFixed(1),
      longTasks: e.length,
      over500: e.filter((x) => x.dur > 500).length,
      over1000: e.filter((x) => x.dur > 1000).length,
      longestMs: e.length ? +Math.max(...e.map((x) => x.dur)).toFixed(0) : 0,
      medianMs: e.length ? +e.map((x) => x.dur).sort((a, b) => a - b)[Math.floor(e.length / 2)].toFixed(0) : 0,
      blockingMsPerSec: +(blocking / sec).toFixed(1),
      taskMsPerSec: +(total / sec).toFixed(1),
    };
  });
  // A thread cannot spend more than 1000 ms of every second inside tasks. This invariant has caught three of
  // my instruments tonight and it stays on.
  r.physicallyPossible = r.taskMsPerSec <= 1000;
  r.label = label;
  log(`${label}: blocking ${r.blockingMsPerSec} ms/s, ${r.over500} tasks>500ms, ${r.longTasks} long tasks in ${r.windowSec}s`);
  return r;
}

const barsOf = async (page) => {
  let t = 0;
  for (const f of page.frames()) t += (await f.evaluate(() => (window.chart && Array.isArray(window.chart.data) ? window.chart.data.length : 0)).catch(() => 0)) || 0;
  return t;
};
const readTrades = (page) => page.evaluate(() => {
  const om = (window.chart && window.chart.orderManager) || window.orderManager;
  return om && Array.isArray(om.closedPositions) ? om.closedPositions.length : null;
}).catch(() => null);

let session = null;
try {
  const eSel = loadConf05Indicators();
  log('booting CONF-01 WITH trades');
  session = await bootConf01Session({ indicators: eSel.pairs, replaySpeed: 60, placeOrder: true, label: 'overlay-flag-ab' });
  const { page, conf01 } = session;
  report.badge = {
    buildStamp: conf01?.buildId ?? null,
    effectiveSpeed: await page.evaluate(() => {
      const rs = window.chart && window.chart.replaySystem;
      return rs ? (rs.speed ?? rs.playbackSpeed ?? null) : null;
    }).catch(() => null),
    panels: page.frames().length,
  };
  save();
  log(`badge: build ${report.badge.buildStamp}, speed ${report.badge.effectiveSpeed}`);

  // Load the book. Without trades this A/B cannot see the mechanism it is testing.
  log(`loading the book with ${TRADES} open/close cycles`);
  for (let i = 0; i < TRADES; i += 1) {
    await cycleTrades(page, { open: 1, close: 1, holdMs: 400 }).catch(() => null);
    await sleep(300);
  }
  report.tradesBefore = await readTrades(page);
  if (!report.tradesBefore) {
    report.voided = `VOID: closed trades read ${report.tradesBefore}. The marker cost is trades x bars, so an A/B with an empty book would read "no effect" for the wrong reason and would look like a refutation of the trace.`;
    save();
    throw new Error(report.voided);
  }
  log(`book loaded: ${report.tradesBefore} closed trades`);

  log(`warming ${(WARM_MS / 60000).toFixed(0)} min to accumulate bars`);
  await sleep(WARM_MS);

  // ---- ARM A: flag OFF (current product behaviour) ----
  report.barsAtArmA = await barsOf(page);
  report.armA = await measureFreezes(page, ARM_MS, 'FLAG OFF (current behaviour)');
  save();

  // ---- flip, in EVERY realm, then read back ----
  const setResults = [];
  for (const f of page.frames()) {
    const r = await f.evaluate((flag) => {
      try { window[flag] = true; return { set: true, readBack: window[flag] === true, isHost: window.top === window }; } catch (e) { return { set: false, error: String(e).slice(0, 80) }; }
    }, FLAG).catch(() => ({ set: false, error: 'frame gone' }));
    setResults.push(r);
  }
  report.flagSet = {
    frames: setResults.length,
    readBackTrue: setResults.filter((r) => r.readBack).length,
    detail: setResults,
  };
  report.flagVerified = report.flagSet.readBackTrue === report.flagSet.frames && report.flagSet.frames > 0;
  log(`flag set and read back true in ${report.flagSet.readBackTrue}/${report.flagSet.frames} realms`);
  if (!report.flagVerified) report.flagWarning = 'The flag did not read back true in every realm. Four realms share one thread and each has its own window, so a partial set understates the effect.';
  save();

  // Let the next render pass pick it up before measuring.
  await sleep(8000);

  // ---- ARM B: flag ON ----
  report.barsAtArmB = await barsOf(page);
  report.armB = await measureFreezes(page, ARM_MS, 'FLAG ON (overlay pan sync disabled)');
  report.tradesAfter = await readTrades(page);
  save();

  const a = report.armA;
  const b = report.armB;
  const drop = (x, y) => (x > 0 ? +(((x - y) / x) * 100).toFixed(1) : null);
  report.result = {
    blockingBefore: a.blockingMsPerSec,
    blockingAfter: b.blockingMsPerSec,
    blockingDropPercent: drop(a.blockingMsPerSec, b.blockingMsPerSec),
    over500Before: a.over500,
    over500After: b.over500,
    freezeCadenceBefore: a.over500 > 0 ? +(a.windowSec / a.over500).toFixed(2) : null,
    freezeCadenceAfter: b.over500 > 0 ? +(b.windowSec / b.over500).toFixed(2) : null,
    barsArmA: report.barsAtArmA,
    barsArmB: report.barsAtArmB,
    barsGrewPercent: +(((report.barsAtArmB - report.barsAtArmA) / report.barsAtArmA) * 100).toFixed(1),
    tradesHeld: report.tradesBefore === report.tradesAfter,
    confound: 'Bars accumulate between arms and cost RISES with bars, so bar growth works AGAINST a measured improvement. A drop here is therefore a lower bound on the flag effect, not an inflation of it.',
  };
  report.verdict = report.result.blockingDropPercent != null && report.result.blockingDropPercent >= 20
    ? `TRACE VERDICT CONFIRMED LIVE: blocking fell ${report.result.blockingDropPercent}% (${a.blockingMsPerSec} -> ${b.blockingMsPerSec} ms/s) with one flag, while bars grew ${report.result.barsGrewPercent}% against it.`
    : `NOT CONFIRMED: blocking moved ${report.result.blockingDropPercent}% (${a.blockingMsPerSec} -> ${b.blockingMsPerSec} ms/s). The trace attributed 31.8% of a freeze to the path this flag disables, so either the flag does not cover the hot site at this build, or the freeze regime here differs from the one dissected.`;
  log(report.verdict);
} catch (err) {
  report.error = String(err && err.stack ? err.stack : err).slice(0, 900);
  log(`ERROR ${report.error.slice(0, 200)}`);
} finally {
  save();
  try { if (session?.browser) await session.browser.close(); } catch { /* gone */ }
  save();
}
console.log(JSON.stringify({ badge: report.badge, tradesBefore: report.tradesBefore, flagVerified: report.flagVerified, result: report.result, verdict: report.verdict, error: report.error }, null, 1));
