#!/usr/bin/env node
/**
 * ZERO-TRADE PROFILE — does the marker cost survive without trades?
 *
 * Every freeze I dissected today carried 43 closed trades, and `_chartIndexForCloseMarkerOnChart` was 31.8% of
 * one of them. I published a falsifiable prediction: with ZERO trades that function should sit at or near zero
 * self time. If it does, the marker lookup is a trades x bars cost and tomorrow's fix covers one regime. If it
 * does NOT, my trades x bars reading is wrong and the fix has to cover both.
 *
 * This holds the condition; the existing instruments attach to it:
 *   - frame-attributed-trace.mjs discovers this session's browser and profiles it (function shares + callers)
 *   - live-trace-and-allocator-probe.mjs takes the background memory-infra dumps
 * Nothing is refactored to make this work, so nothing that already produces artifacts is put at risk.
 *
 * It also carries the arena pair: two allocator dumps ~2h45 apart on ONE session with no trades in it, which is
 * a cleaner arena question than the soak's was - bar growth with the trade term removed by construction.
 *
 * SPEED: 60, matching what the ten-hour soak ACTUALLY ran at (it was labelled 5 and ran at 60 - the option name
 * bug found at 23:33). Matching the real speed is what makes the comparison like-for-like.
 */
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { bootConf01Session, readConf01State } from './lib/conf01-session.mjs';
import { loadConf05Indicators } from './lib/conf05-indicators.mjs';
import { reapOrphanedRenderers } from './lib/find-soak-port.mjs';

const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const MINUTES = Number(argOf('minutes', '185'));
const SAMPLE_MS = Number(argOf('sampleMs', '120000'));
const SPEED = Number(argOf('speed', '60'));
const EV = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';
const OUT = argOf('out', path.join(EV, 'ZERO-TRADE-PROFILE-20260801.json'));
const SCRIPTS = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.error(`[zt ${new Date().toISOString()}] ${m}`);

const report = {
  signature: 'ZERO-TRADE-PROFILE-V1',
  artifactFile: path.basename(OUT),
  at: new Date().toISOString(),
  bfcacheState: 'default (enabled) — a fresh session, no reset axis measured here.',
  whyThisExists: 'Every freeze dissected today had 43 closed trades in it. This decides whether the marker-lookup cost is trades x bars (one regime for tomorrow\'s fix) or present without trades at all (both regimes).',
  requestedSpeed: SPEED,
  plannedMinutes: MINUTES,
  detached: 'Launched via Win32_Process.Create so its parent is WmiPrvSE, not a Cursor terminal. An editor crash cannot cascade into it. We have lost measurement time to that twice.',
  phases: [],
  samples: [],
};
const save = () => fs.writeFileSync(OUT, JSON.stringify(report, null, 1));

/** Run one of the existing instruments against this session and record where its artifact landed. */
function runProbe(script, args, label) {
  return new Promise((resolve) => {
    const started = Date.now();
    const ch = spawn(process.execPath, [path.join(SCRIPTS, script), ...args], { stdio: 'ignore' });
    const done = (code) => {
      report.phases.push({ label, script, args, exitCode: code ?? null, atMinute: +((Date.now() - t0) / 60000).toFixed(1), tookSec: Math.round((Date.now() - started) / 1000) });
      save();
      log(`${label} finished (exit ${code})`);
      resolve();
    };
    ch.on('exit', done);
    ch.on('error', () => done(null));
  });
}

let t0 = Date.now();
let session = null;
try {
  report.orphanReap = reapOrphanedRenderers();
  const eSel = loadConf05Indicators();
  report.indicatorSelection = eSel.provenance;
  log('booting zero-trade CONF-01 session');
  session = await bootConf01Session({
    indicators: eSel.pairs,
    replaySpeed: SPEED,
    placeOrder: false, // ZERO TRADES. This is the whole point of the arm.
    label: 'zero-trade-profile',
  });
  t0 = Date.now();
  const { page, cdp, browserCdp, conf01 } = session;
  report.buildStamp = conf01?.buildId ?? null;
  report.effectiveSpeed = await page.evaluate(() => {
    const rs = window.chart && window.chart.replaySystem;
    return rs ? (rs.speed != null ? Number(rs.speed) : (rs.playbackSpeed != null ? Number(rs.playbackSpeed) : null)) : null;
  }).catch(() => null);
  report.speedMismatch = report.effectiveSpeed != null && Number(report.effectiveSpeed) !== SPEED
    ? `Requested ${SPEED}, engine reports ${report.effectiveSpeed}.` : null;

  // ASSERT ZERO TRADES. An arm whose defining variable is unverified is not an arm.
  // The list lives on orderManager.orderService, not on orderManager. My first version read the wrong path and
  // returned null, which is not "zero" - an arm whose defining variable reads null is unverified, and null is
  // exactly the value that slips past a truthiness check and looks like a pass.
  const readTrades = () => page.evaluate(() => {
    const om = (window.chart && window.chart.orderManager) || window.orderManager;
    const svc = om && om.orderService;
    return {
      closedTrades: svc && Array.isArray(svc.closedTrades) ? svc.closedTrades.length : null,
      openPositions: svc && Array.isArray(svc.openPositions) ? svc.openPositions.length : null,
      orders: svc && Array.isArray(svc.orders) ? svc.orders.length : null,
    };
  }).catch(() => null);
  report.tradeCheck = await readTrades();
  if (report.tradeCheck?.closedTrades == null) {
    report.voided = 'Zero-trade arm VOID: the closed-trade count could not be READ, so zero trades is unverified. A null is not a zero.';
  } else if (report.tradeCheck.closedTrades > 0) {
    report.voided = `Zero-trade arm VOID at boot: ${report.tradeCheck.closedTrades} closed trades already present.`;
  }
  save();
  log(`booted, build ${report.buildStamp}, speed ${report.effectiveSpeed}, trades ${JSON.stringify(report.tradeCheck)}`);

  const barsOf = async () => {
    let t = 0;
    for (const f of page.frames()) t += (await f.evaluate(() => (window.chart && Array.isArray(window.chart.data) ? window.chart.data.length : 0)).catch(() => 0)) || 0;
    return t;
  };

  // Schedule, in minutes from boot. Traces early enough to publish item 2 inside the hour; the allocator pair
  // straddles the run so the arena answer comes from one session with the trade term absent by construction.
  const schedule = [
    { at: 4, run: () => runProbe('frame-attributed-trace.mjs', ['--arm=soak', '--traceMs=8000', `--out=${path.join(EV, 'ZERO-TRADE-TRACE-T05.json')}`], 'trace @5min') },
    { at: 9, run: () => runProbe('live-trace-and-allocator-probe.mjs', ['--port=auto', '--phases=memory', `--out=${path.join(EV, 'ZERO-TRADE-ALLOC-A.json')}`], 'allocator dump A') },
    { at: 22, run: () => runProbe('frame-attributed-trace.mjs', ['--arm=soak', '--traceMs=8000', `--out=${path.join(EV, 'ZERO-TRADE-TRACE-T22.json')}`], 'trace @22min') },
    { at: 42, run: () => runProbe('frame-attributed-trace.mjs', ['--arm=soak', '--traceMs=8000', `--out=${path.join(EV, 'ZERO-TRADE-TRACE-T42.json')}`], 'trace @42min') },
    { at: MINUTES - 8, run: () => runProbe('live-trace-and-allocator-probe.mjs', ['--port=auto', '--phases=memory', `--out=${path.join(EV, 'ZERO-TRADE-ALLOC-B.json')}`], 'allocator dump B') },
  ];
  let next = 0;

  while ((Date.now() - t0) / 60000 < MINUTES) {
    await sleep(SAMPLE_MS);
    const min = (Date.now() - t0) / 60000;
    const bars = await barsOf();
    let footprintMB = null;
    try {
      const m = await cdp.send('Performance.getMetrics');
      const jsHeap = (m.metrics || []).find((x) => x.name === 'JSHeapUsedSize')?.value ?? null;
      footprintMB = jsHeap != null ? +(jsHeap / 1048576).toFixed(1) : null;
    } catch { /* metrics unavailable */ }
    let osMB = null;
    try {
      const info = await browserCdp.send('SystemInfo.getProcessInfo');
      osMB = (info?.processInfo || []).length || null;
    } catch { /* not available on this platform */ }
    const state = await readConf01State(page).catch(() => null);
    report.samples.push({
      minutes: +min.toFixed(2),
      residentTotal: bars,
      jsHeapMB: footprintMB,
      processes: osMB,
      charts: state?.panels?.length ?? null,
      advancing: state?.advancingPanels ?? null,
    });
    save();
    if (next < schedule.length && min >= schedule[next].at) {
      const s = schedule[next];
      next += 1;
      log(`running ${s.at}min probe`);
      await s.run();
    }
  }
  // Any probe the loop did not reach (a short run) still fires here rather than being silently skipped.
  while (next < schedule.length) { const s = schedule[next]; next += 1; await s.run(); }

  report.finalTradeCheck = await readTrades();
  report.completed = true;
} catch (err) {
  report.error = String(err && err.stack ? err.stack : err).slice(0, 1200);
} finally {
  save();
  try { if (session?.browser) await session.browser.close(); } catch { /* already gone */ }
  save();
}
log(`done, ${report.samples.length} samples, ${report.phases.length} probes`);
