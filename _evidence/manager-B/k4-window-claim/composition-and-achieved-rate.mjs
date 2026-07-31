/**
 * Three open questions, one run.
 *
 * 1. C profiled `_resampleDataFull` at 2.2% of a freeze and concluded "A's resample is not what freezes the
 *    page". I measured getResampledSeries at 33% of blocked. Both cannot be a property of the product.
 *    Hypothesis: they are different regimes. C is at 65,000 bars with 43 closed trades, where the
 *    trades x bars marker cost dominates; I am at ~6,200 bars. Wrap BOTH terms here and see the split at
 *    my bar count.
 *
 * 2. A's conversion table rests on 62.5 events/s, taken from the cadence function. That is the rate the
 *    scheduler ASKS for. If a tick costs ~98 ms the main thread cannot deliver 62.5 of them per second,
 *    so the achieved rate is bounded by the very cost being converted. Measure achieved, not nominal.
 *
 * 3. A names its own most-attackable assumption: one expensive resample per tick, because the display
 *    cache is stable within a paint. My earlier run counted 2.01 calls per event at a 0.4% hit rate.
 *    Confirm it with the paint boundary in view.
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

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const lp = await browser.newPage();
  await login(lp, { email: env.TEST_EMAIL, password: env.TEST_PASSWORD, base: BASE });
  await lp.close();

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 950 });
  const ready = await openBacktest(page, {
    base: BASE, sessionId: JOURNAL_BEARING.sessionId, fileId: JOURNAL_BEARING.fileId, timeoutMs: 90000,
  });
  console.log('ready: ' + JSON.stringify(ready));

  const setup = await page.evaluate(() => {
    const c = window.chart, p = c.dataPipeline;
    const om = window.orderManager || c.orderManager || null;
    const S = { fns: {}, tasks: [], t0: performance.now(), dv0: c.dataVersion ?? 0,
                bars0: c.data ? c.data.length : 0, wrapped: [], missed: [] };
    window.__comp = S;
    const wrap = (obj, name, label) => {
      if (!obj || typeof obj[name] !== 'function') { S.missed.push(label); return; }
      const orig = obj[name].bind(obj);
      S.fns[label] = { calls: 0, totalMs: 0, maxMs: 0 };
      obj[name] = function (...a) {
        const t = performance.now(); const r = orig(...a); const d = performance.now() - t;
        const s = S.fns[label]; s.calls++; s.totalMs += d; if (d > s.maxMs) s.maxMs = d;
        return r;
      };
    };
    // the resample side
    wrap(p, 'getResampledSeries', 'getResampledSeries');
    wrap(c, '_resampleDataFull', '_resampleDataFull');
    // C's dominant term
    wrap(c, '_syncOrderOverlaysDuringPan', '_syncOrderOverlaysDuringPan');
    if (om) {
      wrap(om, 'updateOrderLines', 'updateOrderLines');
      wrap(om, '_chartIndexForCloseMarkerOnChart', '_chartIndexForCloseMarker');
      wrap(om, '_chartIndexForExitMarkerOnChart', '_chartIndexForExitMarker');
    }
    // the frame
    wrap(c, 'render', 'render');
    S.wrapped = Object.keys(S.fns);

    // how many order markers exist here at all? C's cost is trades x bars.
    S.orderCounts = {
      orderManagerPresent: !!om,
      orders: om && om.orders ? (om.orders.length || Object.keys(om.orders).length) : null,
      closedTrades: om && om.closedTrades ? (om.closedTrades.length || Object.keys(om.closedTrades).length) : null,
      trades: om && om.trades ? (om.trades.length || Object.keys(om.trades).length) : null,
    };
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) S.tasks.push(Math.round(e.duration)); })
        .observe({ entryTypes: ['longtask'] });
    } catch (e) { /* reported below by an empty task list */ }
    return { wrapped: S.wrapped, missed: S.missed, orderCounts: S.orderCounts, bars0: S.bars0 };
  });
  console.log('wrapped:  ' + JSON.stringify(setup.wrapped));
  console.log('NOT found: ' + JSON.stringify(setup.missed));
  console.log('orders:   ' + JSON.stringify(setup.orderCounts));

  await page.evaluate((sp) => {
    const rs = window.chart && window.chart.replaySystem;
    if (rs) { if (rs.setSpeed) rs.setSpeed(sp); if (rs.play) rs.play(); }
  }, SPEED);
  console.log(`\nmeasuring ${MEASURE_MS / 1000}s at nominal ${SPEED}x...`);
  await sleep(MEASURE_MS);

  const R = await page.evaluate(() => {
    const S = window.__comp, c = window.chart;
    return { wallMs: performance.now() - S.t0, fns: S.fns, tasks: S.tasks,
             dvDelta: (c.dataVersion ?? 0) - S.dv0, bars0: S.bars0,
             bars1: c.data ? c.data.length : 0 };
  });

  const sec = R.wallMs / 1000;
  const blocked = R.tasks.map((d) => d - 50).filter((d) => d > 0).reduce((a, b) => a + b, 0);
  const occupancy = blocked + 50 * R.tasks.length;
  const barsDelivered = R.bars1 - R.bars0;

  console.log(`\n=== achieved vs nominal event rate ===`);
  console.log(`  nominal cadence at ${SPEED}x (A's table):   ${SPEED === 10 ? '10' : SPEED >= 60 ? '62.5' : SPEED} ticks/s`);
  console.log(`  ACHIEVED dataVersion bumps:              ${(R.dvDelta / sec).toFixed(2)} /s`);
  console.log(`  ACHIEVED bars delivered:                 ${(barsDelivered / sec).toFixed(2)} /s  (${barsDelivered} bars in ${sec.toFixed(1)}s)`);
  console.log(`  bars ${R.bars0} -> ${R.bars1}`);
  console.log(`  blocked ${(blocked / sec).toFixed(1)} ms/s   occupancy ${(occupancy / sec).toFixed(1)} ms/s   long tasks ${(R.tasks.length / sec).toFixed(2)}/s`);

  console.log(`\n=== composition at THIS bar count, in rate terms ===`);
  console.log(['function', 'calls/s', 'ms/call', 'ms/s', '%blocked', '%occup', 'max ms'].join('\t'));
  const rows = [];
  for (const [n, s] of Object.entries(R.fns)) {
    const mps = s.totalMs / sec;
    rows.push({ n, mps, calls: s.calls, per: s.calls ? s.totalMs / s.calls : 0, max: s.maxMs });
    console.log([n, (s.calls / sec).toFixed(2), s.calls ? (s.totalMs / s.calls).toFixed(3) : '-',
      mps.toFixed(1), (100 * mps / (blocked / sec)).toFixed(1) + '%',
      (100 * mps / (occupancy / sec)).toFixed(1) + '%', s.maxMs.toFixed(1)].join('\t'));
  }
  const get = (n) => rows.find((r) => r.n === n) || { mps: 0, calls: 0 };
  console.log(`\n=== does C's dominant term exist in my regime? ===`);
  console.log(`  C at 65,000 bars / 43 trades: _chartIndexForCloseMarkerOnChart = 31.8% of a freeze`);
  console.log(`  B at ${R.bars1} bars:      _chartIndexForCloseMarker = ${get('_chartIndexForCloseMarker').mps.toFixed(1)} ms/s`
    + ` (${(100 * get('_chartIndexForCloseMarker').mps / (occupancy / sec)).toFixed(1)}% of occupancy, ${get('_chartIndexForCloseMarker').calls} calls)`);
  console.log(`  C: _resampleDataFull = 2.2% of a freeze`);
  console.log(`  B: _resampleDataFull = ${get('_resampleDataFull').mps.toFixed(1)} ms/s`
    + ` (${(100 * get('_resampleDataFull').mps / (occupancy / sec)).toFixed(1)}% of occupancy)`);
  console.log(`  B: getResampledSeries = ${get('getResampledSeries').mps.toFixed(1)} ms/s`
    + ` (${(100 * get('getResampledSeries').mps / (occupancy / sec)).toFixed(1)}% of occupancy)`);
  console.log(`\n=== A's assumption: one expensive resample per tick ===`);
  console.log(`  getResampledSeries calls per data event: ${(get('getResampledSeries').calls / Math.max(1, R.dvDelta)).toFixed(2)}`);
  console.log(`  _resampleDataFull  calls per data event: ${(get('_resampleDataFull').calls / Math.max(1, R.dvDelta)).toFixed(2)}`);
  fs.writeFileSync('/root/b-tal01891/composition-result.json',
    JSON.stringify({ R, rows, blocked, occupancy, sec, barsDelivered, setup }, null, 2));
} catch (e) {
  console.log('ERROR ' + String(e && e.stack ? e.stack : e).slice(0, 800));
} finally {
  await browser.close();
}
