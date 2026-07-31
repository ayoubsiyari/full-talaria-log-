/**
 * A forced resample miss costs ~0.5 ms at 1m against a ~90 ms per-event cost. Before concluding that
 * A's cache fix cannot move blocked main thread, check the timeframes where the resample actually
 * does work.
 *
 * At 1m the resample is plausibly identity — one source bar per bucket, nothing to aggregate — so
 * 0.5 ms may say nothing about 15m or 1h, where every bucket aggregates many source bars. If the miss
 * cost climbs steeply with timeframe, A's fix matters on the timeframes users sit on and my "under
 * 1%" figure is a 1m-only artifact. That distinction changes the advice completely, so it is worth
 * one more run.
 *
 * Times a forced miss at each timeframe against the SAME source, so timeframe is the only variable.
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const CHROME = fs.readFileSync('/root/b-tal01891/CHROME_PATH', 'utf8').trim();
const SESSION_ID = process.env.SESSION_ID || '936';
const FILE_ID = process.env.FILE_ID || '677';
const ITERS = Number(process.env.ITERS || 25);

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
      && window.chart.data.length > 0)).catch(() => false)) break;
  }

  const res = await page.evaluate((iters) => {
    const c = window.chart;
    const pipe = c._dataPipeline || c.dataPipeline;
    const src = c.data;
    const med = (a) => {
      const s = a.slice().sort((x, y) => x - y);
      return +s[Math.floor(s.length / 2)].toFixed(3);
    };
    const out = { bars: src.length, rows: [] };
    for (const tf of ['1m', '5m', '15m', '1h', '4h', '1d']) {
      let buckets = null;
      const miss = [];
      let dv = 2 * 10 ** 7;
      for (let k = 0; k < iters; k += 1) {
        const t = performance.now();
        const r = pipe.getResampledSeries(src, tf, dv + k);
        miss.push(performance.now() - t);
        if (buckets === null) buckets = Array.isArray(r) ? r.length : null;
      }
      out.rows.push({ tf, buckets, missMs: med(miss) });
    }
    return out;
  }, ITERS);

  console.log(`  source bars: ${res.bars}   (one source array, timeframe is the only variable)`);
  console.log('');
  console.log('  timeframe   buckets   forced-miss ms   per-bar cost at 7 bars/s');
  for (const r of res.rows) {
    const perSec = r.missMs != null ? (r.missMs * 7).toFixed(1) : '?';
    console.log(`  ${String(r.tf).padEnd(11)}${String(r.buckets).padStart(8)}`
      + `${String(r.missMs).padStart(16)}${String(perSec + ' ms/s').padStart(26)}`);
  }
  console.log('');
  console.log('  Compare the ms/s column against the ~320 ms/s of blocked main thread actually');
  console.log('  measured during replay. That ratio is how much of the defect A\u2019s cache fix can');
  console.log('  remove on each timeframe.');
} catch (e) {
  console.log('ERROR ' + String(e && e.message ? e.message : e).slice(0, 300));
} finally {
  await browser.close();
}
