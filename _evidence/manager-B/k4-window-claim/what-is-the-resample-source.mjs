/**
 * The plateau is not the viewport — measured, 98 vs 211 visible candles changed nothing. So what
 * IS bounded?
 *
 * The pipeline source names two constants that could bound the resample source independently of both
 * the viewport and the total loaded bars:
 *
 *   REPLAY_RAW_CAP     = 5000   // cap on retained raw bars
 *   REPLAY_CONTEXT_BARS = 500   // "drop bars far behind playhead (keep context window only)"
 *
 * The trim reads: start = max(len - cap, playhead - contextBars); trimmed = fullRawData.slice(start).
 * If that path is live, the retained raw window is ~500 bars behind the playhead no matter how many
 * bars the session has been through — which would produce exactly a rise followed by a hard plateau.
 *
 * This measures the array lengths rather than reasoning about them: what the chart holds, what the
 * replay engine holds, and what the resample is actually given. Sampled repeatedly during replay so
 * a bound shows up as a length that stops growing while another keeps going.
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const CHROME = fs.readFileSync('/root/b-tal01891/CHROME_PATH', 'utf8').trim();
const SESSION_ID = process.env.SESSION_ID || '936';
const FILE_ID = process.env.FILE_ID || '677';
const SPEED = Number(process.env.SPEED || 10);
const SAMPLES = Number(process.env.SAMPLES || 8);
const EVERY_MS = Number(process.env.EVERY_MS || 8000);

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
    const r = await page.evaluate(() => {
      const c = window.chart;
      return !!(c && c.data && c.data.length > 0 && c.replaySystem);
    }).catch(() => false);
    if (r) break;
  }

  console.log('constants from the served pipeline:');
  console.log('  ' + JSON.stringify(await page.evaluate(() => {
    const P = window.ChartDataPipeline;
    return P ? {
      RENDER_BAR_BUDGET: P.RENDER_BAR_BUDGET,
      VIEWPORT_BUFFER_BARS: P.VIEWPORT_BUFFER_BARS,
      INITIAL_BACKTEST_BARS: P.INITIAL_BACKTEST_BARS,
      LARGE_SERIES_THRESHOLD: P.LARGE_SERIES_THRESHOLD,
      REPLAY_RAW_CAP: P.REPLAY_RAW_CAP,
      REPLAY_CONTEXT_BARS: P.REPLAY_CONTEXT_BARS,
    } : 'ChartDataPipeline not exposed';
  })));

  await page.evaluate((s) => {
    const rs = window.chart.replaySystem;
    if (typeof rs.setSpeed === 'function') rs.setSpeed(s);
    if (typeof rs.play === 'function') rs.play();
  }, SPEED);
  await sleep(3000);

  console.log('');
  console.log('  t     chart.data  chart.rawData  fullRawData  currentIndex  tf     dataVersion');
  for (let i = 0; i < SAMPLES; i++) {
    const s = await page.evaluate(() => {
      const c = window.chart;
      const rs = c.replaySystem || {};
      const len = (x) => (Array.isArray(x) ? x.length : (x && x.length) || null);
      return {
        data: len(c.data),
        rawData: len(c.rawData),
        fullRaw: len(rs.fullRawData),
        currentIndex: rs.currentIndex != null ? rs.currentIndex : null,
        tf: c.timeframe || c.currentTimeframe || null,
        dv: c.dataVersion != null ? c.dataVersion : null,
      };
    });
    console.log(`  ${String(i * EVERY_MS / 1000 + 's').padEnd(6)}`
      + `${String(s.data).padStart(10)}${String(s.rawData).padStart(15)}`
      + `${String(s.fullRaw).padStart(13)}${String(s.currentIndex).padStart(14)}`
      + `${String(s.tf).padStart(7)}${String(s.dv).padStart(14)}`);
    await sleep(EVERY_MS);
  }
  console.log('');
  console.log('  A length that stops growing while another keeps growing is the bound.');
} catch (e) {
  console.log('ERROR ' + String(e && e.message ? e.message : e).slice(0, 300));
} finally {
  await browser.close();
}
