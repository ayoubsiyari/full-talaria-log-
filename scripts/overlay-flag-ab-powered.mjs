#!/usr/bin/env node
/**
 * POWERED A/B on __TALARIA_DISABLE_ORDER_OVERLAY_PAN_ALWAYS_V1.
 *
 * The 00:58 attempt returned a null from a session that was never freezing: 13 trades at 13,225 bars is a
 * driving product of 171,925 against the dissected freeze's 43 x 65,000 = 2,795,000. Sixteen times too little
 * of the quantity the mechanism scales with.
 *
 * THE POWER FIX IS TRADES, NOT TIME. The cost is trades x bars, so the product can be bought on either axis.
 * Reaching 65,000 bars takes about three hours at this delivery rate; reaching the same product by loading
 * ~215 closed trades at ~13,000 bars takes minutes, because cycleTrades opens and closes in batches. That is
 * the difference between a test that fits before 04:00 and one that does not.
 *
 * AND THE REGIME IS VERIFIED, NOT ASSUMED. Trades are added until the measured freeze cadence is actually in
 * regime; if it never gets there the run VOIDS rather than producing a second underpowered null. A null is
 * only informative from a session that was freezing to begin with.
 */
import fs from 'node:fs';
import { bootConf01Session, cycleTrades } from './lib/conf01-session.mjs';
import { loadConf05Indicators } from './lib/conf05-indicators.mjs';

const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const ARM_MS = Number(argOf('armMs', '180000'));
const BATCH = Number(argOf('batch', '25'));
const MAX_TRADES = Number(argOf('maxTrades', '400'));
const TARGET_PRODUCT = Number(argOf('targetProduct', '2795000'));
const MIN_FREEZES_PER_MIN = Number(argOf('minFreezesPerMin', '6'));
const DEADLINE_MIN = Number(argOf('deadlineMin', '42'));
const OUT = argOf('out', 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\OVERLAY-FLAG-AB-POWERED-20260801.json');
const FLAG = '__TALARIA_DISABLE_ORDER_OVERLAY_PAN_ALWAYS_V1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.error(`[abp ${new Date().toISOString()}] ${m}`);
const t0 = Date.now();
const minsLeft = () => DEADLINE_MIN - (Date.now() - t0) / 60000;

const report = {
  signature: 'OVERLAY-FLAG-AB-POWERED-V1',
  artifactFile: OUT.split('\\').pop(),
  at: new Date().toISOString(),
  bfcacheState: 'default (enabled) — fresh session, no reset axis measured here.',
  flag: FLAG,
  sealStatus: { sealed: false, label: 'UNSEALED BUILD — relative before/after within one session; no absolute cadence quoted against a sealed build' },
  powerDesign: {
    drivingProduct: 'closed trades x resident bars',
    target: TARGET_PRODUCT,
    targetProvenance: '43 closed trades x ~65,000 resident bars, the condition of the 692 ms freeze whose stack put the marker lookup at 31.8%',
    boughtOn: 'the TRADE axis, because bars cost hours and trades cost seconds, and the cost model is a product',
    regimeGate: `at least ${MIN_FREEZES_PER_MIN} tasks over 500 ms per minute before the flag is touched`,
  },
  whyThisExists: 'The entire freeze diagnosis rests on one profiler session. This is the cheapest independent confirmation available.',
  loading: [],
};
const save = () => fs.writeFileSync(OUT, JSON.stringify(report, null, 1));

// The first attempt vanished mid-boot leaving NO artifact and no error: the catch never ran, so it was a hard
// death rather than a throw. An instrument that can die without saying so is one I cannot grade, so the
// artifact now exists from the first second and every exit route flushes it.
report.progress = ['launched'];
const mark = (s) => { report.progress.push(`${s} @${new Date().toISOString()}`); save(); log(s); };
save();
process.on('uncaughtException', (e) => { report.error = `uncaughtException: ${String(e && e.stack || e).slice(0, 600)}`; save(); process.exit(1); });
process.on('unhandledRejection', (e) => { report.error = `unhandledRejection: ${String(e && e.stack || e).slice(0, 600)}`; save(); process.exit(1); });
process.on('exit', () => { if (!report.verdict && !report.voided && !report.error) { report.error = `Process exited at stage "${report.progress[report.progress.length - 1]}" without a verdict, an error or a throw - killed, not failed.`; try { save(); } catch { /* nothing left to do */ } } });

async function measureFreezes(page, ms, label) {
  await page.evaluate((dur) => {
    window.__abFreeze = { entries: [], startedAt: performance.now(), plannedMs: dur };
    if (window.__abObs) { try { window.__abObs.disconnect(); } catch { /* gone */ } }
    window.__abObs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.startTime >= window.__abFreeze.startedAt) window.__abFreeze.entries.push({ start: e.startTime, dur: e.duration });
      }
    });
    window.__abObs.observe({ type: 'longtask', buffered: false });
  }, ms);
  await sleep(ms);
  const r = await page.evaluate(() => {
    const f = window.__abFreeze;
    const sec = (performance.now() - f.startedAt) / 1000;
    const e = f.entries;
    const sum = (fn) => e.reduce((s, x) => s + fn(x), 0);
    return {
      windowSec: +sec.toFixed(1),
      longTasks: e.length,
      over500: e.filter((x) => x.dur > 500).length,
      over1000: e.filter((x) => x.dur > 1000).length,
      longestMs: e.length ? +Math.max(...e.map((x) => x.dur)).toFixed(0) : 0,
      blockingMsPerSec: +(sum((x) => Math.max(0, x.dur - 50)) / sec).toFixed(1),
      taskMsPerSec: +(sum((x) => x.dur) / sec).toFixed(1),
    };
  });
  r.physicallyPossible = r.taskMsPerSec <= 1000;
  r.freezesPerMin = +((r.over500 / r.windowSec) * 60).toFixed(1);
  r.label = label;
  log(`${label}: blocking ${r.blockingMsPerSec} ms/s, ${r.over500} over 500ms (${r.freezesPerMin}/min), longest ${r.longestMs} ms`);
  return r;
}

const barsOf = async (page) => {
  let t = 0;
  for (const f of page.frames()) t += (await f.evaluate(() => (window.chart && Array.isArray(window.chart.data) ? window.chart.data.length : 0)).catch(() => 0)) || 0;
  return t;
};
const readClosed = (page) => page.evaluate(() => {
  const om = (window.chart && window.chart.orderManager) || window.orderManager;
  return om && Array.isArray(om.closedPositions) ? om.closedPositions.length : null;
}).catch(() => null);

let session = null;
try {
  const eSel = loadConf05Indicators();
  mark('indicators loaded, booting CONF-01 with trades');
  session = await bootConf01Session({ indicators: eSel.pairs, replaySpeed: 60, placeOrder: true, label: 'overlay-ab-powered' });
  mark('booted');
  const { page, conf01 } = session;
  report.badge = {
    buildStamp: conf01?.buildId ?? null,
    effectiveSpeed: await page.evaluate(() => { const rs = window.chart && window.chart.replaySystem; return rs ? (rs.speed ?? rs.playbackSpeed ?? null) : null; }).catch(() => null),
    panels: page.frames().length,
  };
  save();
  log(`badge build ${report.badge.buildStamp} speed ${report.badge.effectiveSpeed} panels ${report.badge.panels}`);

  // Load trades until the driving product is met AND the session is measurably freezing.
  let closed = 0;
  let bars = 0;
  let regime = null;
  while (minsLeft() > 12) {
    const res = await cycleTrades(page, { open: BATCH, close: BATCH, holdMs: 500 }).catch((e) => ({ error: String(e).slice(0, 80) }));
    closed = (await readClosed(page)) ?? closed;
    bars = await barsOf(page);
    const product = closed * bars;
    report.loading.push({ atMin: +((Date.now() - t0) / 60000).toFixed(1), closed, bars, product, batch: res?.closed ?? null });
    save();
    log(`loaded: ${closed} closed trades, ${bars} bars, product ${product.toLocaleString()} / ${TARGET_PRODUCT.toLocaleString()}`);
    // Product check BEFORE the trade ceiling. My first ordering broke on the ceiling first, and the two
    // thresholds met within one batch of each other - the run would have stopped at the exact moment it
    // reached power, with the regime never measured, and voided itself for want of one check.
    if (product >= TARGET_PRODUCT) {
      regime = await measureFreezes(page, 60000, 'regime check');
      report.regimeChecks = report.regimeChecks || [];
      report.regimeChecks.push(regime);
      save();
      if (regime.freezesPerMin >= MIN_FREEZES_PER_MIN) break;
      log(`product met but only ${regime.freezesPerMin} freezes/min — adding more trades`);
    }
    if (closed >= MAX_TRADES) break;
  }

  report.power = {
    closedTrades: closed,
    residentBars: bars,
    drivingProduct: closed * bars,
    targetProduct: TARGET_PRODUCT,
    productMet: closed * bars >= TARGET_PRODUCT,
    ratioToDissectedFreeze: +((closed * bars) / TARGET_PRODUCT).toFixed(2),
    freezesPerMin: regime?.freezesPerMin ?? null,
    inRegime: (regime?.freezesPerMin ?? 0) >= MIN_FREEZES_PER_MIN,
  };
  save();

  if (!report.power.inRegime) {
    report.voided = `VOID, NOT A REFUTATION: the session reached a driving product of ${(closed * bars).toLocaleString()} (${report.power.ratioToDissectedFreeze}x the dissected freeze) but only ${report.power.freezesPerMin ?? 'un-measured'} freezes/min against a gate of ${MIN_FREEZES_PER_MIN}. A null from a session that is not freezing says nothing about a switch meant to stop freezes, and this run refuses to produce a second one.`;
    log(report.voided);
  } else {
    report.barsAtArmA = await barsOf(page);
    report.armA = await measureFreezes(page, ARM_MS, 'FLAG OFF (current behaviour)');
    save();

    const setResults = [];
    for (const f of page.frames()) {
      const r = await f.evaluate((flag) => {
        try { window[flag] = true; return { readBack: window[flag] === true, isHost: window.top === window }; } catch (e) { return { readBack: false, error: String(e).slice(0, 60) }; }
      }, FLAG).catch(() => ({ readBack: false, error: 'frame gone' }));
      setResults.push(r);
    }
    report.flagSet = { frames: setResults.length, readBackTrue: setResults.filter((r) => r.readBack).length, detail: setResults };
    report.flagVerified = report.flagSet.frames > 0 && report.flagSet.readBackTrue === report.flagSet.frames;
    log(`flag read back true in ${report.flagSet.readBackTrue}/${report.flagSet.frames} realms`);
    save();
    await sleep(8000);

    report.barsAtArmB = await barsOf(page);
    report.armB = await measureFreezes(page, ARM_MS, 'FLAG ON (overlay pan sync disabled)');
    report.closedAfter = await readClosed(page);
    const a = report.armA;
    const b = report.armB;
    const pct = (x, y) => (x > 0 ? +(((x - y) / x) * 100).toFixed(1) : null);
    report.result = {
      blockingBefore: a.blockingMsPerSec, blockingAfter: b.blockingMsPerSec, blockingDropPercent: pct(a.blockingMsPerSec, b.blockingMsPerSec),
      freezesPerMinBefore: a.freezesPerMin, freezesPerMinAfter: b.freezesPerMin, freezeDropPercent: pct(a.freezesPerMin, b.freezesPerMin),
      longestBefore: a.longestMs, longestAfter: b.longestMs,
      barsArmA: report.barsAtArmA, barsArmB: report.barsAtArmB,
      barsGrewPercent: +(((report.barsAtArmB - report.barsAtArmA) / report.barsAtArmA) * 100).toFixed(1),
      tradesHeld: closed === report.closedAfter,
      confound: 'Bars accumulate between arms and cost rises with bars, so bar growth works AGAINST a measured improvement. A drop is a lower bound on the flag effect.',
    };
    report.verdict = report.result.blockingDropPercent >= 20
      ? `CONFIRMED LIVE: blocking fell ${report.result.blockingDropPercent}% (${a.blockingMsPerSec} -> ${b.blockingMsPerSec} ms/s) and freezes ${report.result.freezeDropPercent}% (${a.freezesPerMin} -> ${b.freezesPerMin}/min) on one flag, in regime, with bars growing ${report.result.barsGrewPercent}% against it.`
      : `NOT CONFIRMED, AND THIS TIME THE TEST HAD POWER: in regime at ${report.power.freezesPerMin} freezes/min and ${report.power.ratioToDissectedFreeze}x the dissected driving product, blocking moved ${report.result.blockingDropPercent}% and freezes ${report.result.freezeDropPercent}%. The switch does not remove the freeze at this build, so the 31.8% attribution belongs to a path this flag does not disable.`;
    log(report.verdict);
  }
} catch (err) {
  report.error = String(err && err.stack ? err.stack : err).slice(0, 900);
  log(`ERROR ${report.error.slice(0, 200)}`);
} finally {
  save();
  try { if (session?.browser) await session.browser.close(); } catch { /* gone */ }
  save();
}
console.log(JSON.stringify({ badge: report.badge, power: report.power, flagVerified: report.flagVerified, result: report.result, verdict: report.verdict || report.voided, error: report.error }, null, 1));
