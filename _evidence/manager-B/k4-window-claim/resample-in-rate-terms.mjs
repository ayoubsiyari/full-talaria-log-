/**
 * A's challenge, and it is a fair one: I converted a per-CALL cost into a share of a TASK, and never
 * measured the call RATE. 1.8 ms per forced miss only becomes a cost per second once multiplied by
 * calls per second, and I assumed one call per data event (~7.25/s) without checking. If the real path
 * calls it once per frame, or once per panel, or several times per event, the conclusion inverts.
 *
 * This measures it in situ instead of inferring it: wrap the real functions on the live pipeline during
 * real replay, accumulate calls and elapsed time, and — critically — collect the long-task blocking in
 * THE SAME 30-second window, so the share is computed within one run rather than across two.
 *
 * My earlier comparison put a timing from one run against a blocking figure from a different run. That
 * is the same class of error as the bar-count confound, and it is why this run measures both at once.
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { login, openBacktest, JOURNAL_BEARING } from './m20-j1/talaria-auth-route.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const CHROME = fs.readFileSync('/root/b-tal01891/CHROME_PATH', 'utf8').trim();
const SPEED = Number(process.env.SPEED || 10);
const MEASURE_MS = Number(process.env.MEASURE_MS || 30000);
const env = Object.fromEntries(
  fs.readFileSync('/root/.talaria-test-env', 'utf8').split('\n')
    .filter((l) => l.includes('=')).map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).replace(/^export\s+/, '').trim(),
        l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wrap the real functions and start the long-task observer in the same instant. */
function instrument() {
  const c = window.chart;
  const p = c && c.dataPipeline;
  const W = {
    started: performance.now(),
    fns: {},
    tasks: [],
    dvStart: c ? (c.dataVersion ?? 0) : 0,
    barsStart: c && c.data ? c.data.length : 0,
    diagStart: (c && c._mcDiag && c._mcDiag.incrementalResamples) || 0,
    wrapped: [],
    overheadProbeMs: 0,
  };
  window.__rate = W;

  const wrap = (obj, name, label) => {
    if (!obj || typeof obj[name] !== 'function') return false;
    const orig = obj[name].bind(obj);
    W.fns[label] = { calls: 0, totalMs: 0, maxMs: 0, subMicro: 0 };
    obj[name] = function wrapped(...args) {
      const t = performance.now();
      const out = orig(...args);
      const d = performance.now() - t;
      const s = W.fns[label];
      s.calls++; s.totalMs += d;
      if (d > s.maxMs) s.maxMs = d;
      if (d < 0.05) s.subMicro++;      // effectively a cache hit
      return out;
    };
    W.wrapped.push(label);
    return true;
  };

  wrap(p, 'getResampledSeries', 'getResampledSeries');
  wrap(p, 'buildDisplaySeries', 'buildDisplaySeries');
  wrap(p, '_tryIncrementalResample', '_tryIncrementalResample');
  wrap(p, '_pixelSlotAggregateFromRange', '_pixelSlotAggregate');
  wrap(c, 'getDisplaySeries', 'getDisplaySeries');
  wrap(c, 'draw', 'chart.draw');
  wrap(c, 'render', 'chart.render');

  // Cost of the instrument itself, so it can be subtracted rather than argued about.
  const t0 = performance.now();
  for (let i = 0; i < 20000; i++) { performance.now(); }
  W.overheadProbeMs = (performance.now() - t0) / 20000; // per performance.now() call

  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) W.tasks.push(Math.round(e.duration));
    }).observe({ entryTypes: ['longtask'] });
    W.longtaskOk = true;
  } catch (e) { W.longtaskOk = false; }
  return { wrapped: W.wrapped, barsStart: W.barsStart };
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const lp = await browser.newPage();
  await login(lp, { email: env.TEST_EMAIL, password: env.TEST_PASSWORD, base: BASE });
  await lp.close();

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 950 });   // the viewport all my freeze runs used
  const ready = await openBacktest(page, {
    base: BASE, sessionId: JOURNAL_BEARING.sessionId, fileId: JOURNAL_BEARING.fileId, timeoutMs: 90000,
  });
  console.log('ready: ' + JSON.stringify(ready));

  const inst = await page.evaluate(instrument);
  console.log('wrapped: ' + JSON.stringify(inst));

  await page.evaluate((speed) => {
    const rs = window.chart && window.chart.replaySystem;
    if (rs) { if (rs.setSpeed) rs.setSpeed(speed); if (rs.play) rs.play(); }
  }, SPEED);
  console.log(`measuring ${MEASURE_MS / 1000}s at ${SPEED}x...`);
  await sleep(MEASURE_MS);

  const R = await page.evaluate(() => {
    const W = window.__rate; const c = window.chart;
    return {
      wallMs: performance.now() - W.started,
      fns: W.fns,
      tasks: W.tasks,
      dvDelta: (c.dataVersion ?? 0) - W.dvStart,
      barsStart: W.barsStart,
      barsEnd: c && c.data ? c.data.length : 0,
      diagDelta: ((c && c._mcDiag && c._mcDiag.incrementalResamples) || 0) - W.diagStart,
      overheadProbeMs: W.overheadProbeMs,
      longtaskOk: W.longtaskOk,
    };
  });

  const sec = R.wallMs / 1000;
  const blocking = R.tasks.map((d) => d - 50).filter((d) => d > 0);
  const blockedMs = blocking.reduce((a, b) => a + b, 0);
  const occupancyMs = blockedMs + 50 * R.tasks.length;

  console.log(`\n=== window: ${sec.toFixed(1)}s, bars ${R.barsStart} -> ${R.barsEnd} ===`);
  console.log(`dataVersion bumps      ${R.dvDelta}   = ${(R.dvDelta / sec).toFixed(2)} /s`);
  console.log(`incrementalResamples   ${R.diagDelta}   = ${(R.diagDelta / sec).toFixed(2)} /s  (product's own counter)`);
  console.log(`long tasks             ${R.tasks.length}   = ${(R.tasks.length / sec).toFixed(2)} /s`);
  console.log(`blocked (TBT convention) ${blockedMs.toFixed(0)} ms = ${(blockedMs / sec).toFixed(1)} ms/s`);
  console.log(`occupancy (>=)           ${occupancyMs.toFixed(0)} ms = ${(occupancyMs / sec).toFixed(1)} ms/s`);
  console.log(`instrument overhead per performance.now(): ${(R.overheadProbeMs * 1000).toFixed(3)} us`);

  console.log('\n=== measured IN RATE TERMS: calls/s x ms/call = ms/s ===');
  const hdr = ['function', 'calls', 'calls/s', 'totalMs', 'ms/s', 'ms/call', 'max ms', 'hits(<0.05ms)'];
  console.log(hdr.join('\t'));
  const rows = [];
  for (const [name, s] of Object.entries(R.fns)) {
    const overhead = (s.calls * 2 * R.overheadProbeMs);
    const net = Math.max(0, s.totalMs - overhead);
    rows.push({ name, ...s, msPerSec: net / sec, netMs: net });
    console.log([
      name, s.calls, (s.calls / sec).toFixed(2), s.totalMs.toFixed(1),
      (net / sec).toFixed(1), s.calls ? (net / s.calls).toFixed(3) : '-',
      s.maxMs.toFixed(1), s.subMicro,
    ].join('\t'));
  }

  const rs = rows.find((r) => r.name === 'getResampledSeries');
  if (rs) {
    console.log('\n=== the answer to A, in rate terms and from ONE run ===');
    console.log(`getResampledSeries costs ${rs.msPerSec.toFixed(1)} ms/s`);
    console.log(`  as a share of blocked   (${(blockedMs / sec).toFixed(1)} ms/s): `
      + `${(100 * rs.msPerSec / (blockedMs / sec)).toFixed(1)}%`);
    console.log(`  as a share of occupancy (${(occupancyMs / sec).toFixed(1)} ms/s): `
      + `${(100 * rs.msPerSec / (occupancyMs / sec)).toFixed(1)}%`);
    console.log(`  call rate ${(rs.calls / sec).toFixed(2)}/s against ${(R.dvDelta / sec).toFixed(2)} data events/s `
      + `= ${(rs.calls / Math.max(1, R.dvDelta)).toFixed(2)} calls per event`);
    console.log(`  cache hits (<0.05ms): ${rs.subMicro} of ${rs.calls} = ${(100 * rs.subMicro / Math.max(1, rs.calls)).toFixed(1)}%`);
  }
  fs.writeFileSync('/root/b-tal01891/resample-rate-result.json', JSON.stringify({ R, rows, blockedMs, occupancyMs, sec }, null, 2));
  console.log('\nwrote /root/b-tal01891/resample-rate-result.json');
} catch (e) {
  console.log('ERROR ' + String(e && e.stack ? e.stack : e).slice(0, 600));
} finally {
  await browser.close();
}
