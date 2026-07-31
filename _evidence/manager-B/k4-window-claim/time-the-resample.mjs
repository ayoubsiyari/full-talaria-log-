/**
 * Is the resample actually the cost?
 *
 * A's mechanism is verified in source and I have now confirmed it behaviourally: dataVersion bumps
 * 7.25 times per second against 7.2 bars per second, so the single-slot cache is invalidated once
 * per bar exactly as A said.
 *
 * But the cost does not behave like a resample. Measured on b120:
 *   - blocked main thread is FLAT from 1,930 to 5,039 bars loaded (2.6x source length, no change)
 *   - p95 task duration is flat at 94-105 ms across that whole range
 *   - the chart is on the 1m timeframe, so the resample is identity-length, and chart.data grows
 *     past REPLAY_RAW_CAP = 5000 without the trim firing
 *   - visible candles 98 vs 211 changed nothing, so it is not the viewport either
 *
 * A cost that is linear in source length cannot be flat across a 2.6x change in source length. So
 * either the resample short-circuits at 1m and the ~90 ms per event is spent elsewhere, or the
 * measurement is wrong. This times the calls directly to find out, because if the resample is not
 * the cost then fixing the cache key will not move the number — and that is a fix going green
 * without touching the defect.
 *
 * Times three things per sample, over many iterations, at a known source length:
 *   getResampledSeries  — the call whose cache never hits
 *   getDisplaySeries    — the render-path consumer
 *   a forced miss vs a forced hit, by passing the same vs a bumped dataVersion
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const CHROME = fs.readFileSync('/root/b-tal01891/CHROME_PATH', 'utf8').trim();
const SESSION_ID = process.env.SESSION_ID || '936';
const FILE_ID = process.env.FILE_ID || '677';
const SPEED = Number(process.env.SPEED || 10);
const SAMPLES = Number(process.env.SAMPLES || 5);
const EVERY_MS = Number(process.env.EVERY_MS || 20000);
const ITERS = Number(process.env.ITERS || 30);

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
  await lp.goto(`${BASE}/login/`, { waitUntil: 'domcontentloaded' });
  await lp.evaluate(async (b, e, p) => {
    await fetch(`${b}/api/auth/login`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: e, password: p }),
    });
  }, BASE, env.TEST_EMAIL, env.TEST_PASSWORD);
  await sleep(1500); await lp.close();

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 950 });
  await page.goto(
    `${BASE}/chart/dist-v9/index.html?mode=backtest&sessionId=${SESSION_ID}&fileId=${FILE_ID}`,
    { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 40; i++) {
    await sleep(2000);
    if (await page.evaluate(() => !!(window.chart && window.chart.data
      && window.chart.data.length > 0 && window.chart.replaySystem)).catch(() => false)) break;
  }

  console.log('  what is reachable for timing:');
  console.log('  ' + JSON.stringify(await page.evaluate(() => {
    const c = window.chart;
    return {
      getDisplaySeries: typeof c.getDisplaySeries,
      pipeline: !!(c._dataPipeline || c.dataPipeline),
      pipelineGetResampled: typeof ((c._dataPipeline || c.dataPipeline || {}).getResampledSeries),
      buildDisplaySeries: typeof ((c._dataPipeline || c.dataPipeline || {}).buildDisplaySeries),
      timeframe: c.timeframe || c.currentTimeframe,
    };
  })));

  await page.evaluate((s) => {
    const rs = window.chart.replaySystem;
    if (typeof rs.setSpeed === 'function') rs.setSpeed(s);
    if (typeof rs.play === 'function') rs.play();
  }, SPEED);
  await sleep(3000);

  console.log('');
  console.log('  bars   resample_miss  resample_hit  getDisplaySeries   (median ms of '
    + ITERS + ' iters)');
  for (let i = 0; i < SAMPLES; i++) {
    const r = await page.evaluate((iters) => {
      const c = window.chart;
      const pipe = c._dataPipeline || c.dataPipeline;
      const src = c.data;
      const tf = c.timeframe || c.currentTimeframe || '1m';
      const med = (a) => {
        if (!a.length) return null;
        const s = a.slice().sort((x, y) => x - y);
        return +s[Math.floor(s.length / 2)].toFixed(3);
      };
      const out = { bars: src ? src.length : -1 };

      if (pipe && typeof pipe.getResampledSeries === 'function') {
        // Forced MISS: a fresh dataVersion each call, which is what replay does per bar.
        const miss = [];
        let dv = 10 ** 7;
        for (let k = 0; k < iters; k += 1) {
          const t = performance.now();
          pipe.getResampledSeries(src, tf, dv + k);
          miss.push(performance.now() - t);
        }
        out.resampleMiss = med(miss);
        // Forced HIT: same dataVersion repeatedly, so the single slot matches.
        pipe.getResampledSeries(src, tf, 42);
        const hit = [];
        for (let k = 0; k < iters; k += 1) {
          const t = performance.now();
          pipe.getResampledSeries(src, tf, 42);
          hit.push(performance.now() - t);
        }
        out.resampleHit = med(hit);
      }
      if (typeof c.getDisplaySeries === 'function') {
        const ds = [];
        for (let k = 0; k < iters; k += 1) {
          const t = performance.now();
          try { c.getDisplaySeries(); } catch (e) { /* record time anyway */ }
          ds.push(performance.now() - t);
        }
        out.getDisplaySeries = med(ds);
      }
      return out;
    }, ITERS);
    console.log(`  ${String(r.bars).padStart(5)}${String(r.resampleMiss).padStart(15)}`
      + `${String(r.resampleHit).padStart(14)}${String(r.getDisplaySeries).padStart(18)}`);
    await sleep(EVERY_MS);
  }
  console.log('');
  console.log('  If resample_miss is a small fraction of the ~90 ms per-event cost, and if it does');
  console.log('  not grow with bars, then the cache key is not what makes replay slow and fixing it');
  console.log('  will not move blocked main thread.');
} catch (e) {
  console.log('ERROR ' + String(e && e.message ? e.message : e).slice(0, 300));
} finally {
  await browser.close();
}
