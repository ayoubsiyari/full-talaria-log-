/**
 * A asks for one number to confirm or kill its plateau mechanism: the plot width at the time of my
 * runs. A predicts the knee at plotWidth / ZOOMED_OUT_SLOT_PX = plotWidth / 2.
 *
 * Every freeze measurement I took used setViewport({ width: 1600, height: 950 }), so this reproduces
 * that exact viewport and reads chart.w and chart.margin from the product rather than assuming the
 * {l:60, r:60} default in the source.
 *
 * Deliberately does NOT start replay. C's ten-hour soak owns this host, and a 10x replay tab drives
 * the chart container to ~85% CPU — measured by me earlier today, and the reason the Director
 * concluded two concurrent soaks are impossible here. One page load is negligible; a replay run is
 * not, so the range extension A's linear term implies has to wait for the host.
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const CHROME = fs.readFileSync('/root/b-tal01891/CHROME_PATH', 'utf8').trim();
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
  // The exact viewport every freeze run used.
  await page.setViewport({ width: 1600, height: 950 });
  await page.goto(`${BASE}/chart/dist-v9/index.html?mode=backtest&sessionId=936&fileId=677`,
    { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    if (await page.evaluate(() => !!(window.chart && window.chart.data
      && window.chart.data.length > 0)).catch(() => false)) break;
  }

  const g = await page.evaluate(() => {
    const c = window.chart;
    const m = c.margin || {};
    const P = window.ChartDataPipeline;
    const slot = 2; // ZOOMED_OUT_SLOT_PX, not exported; asserted against spacing maths below
    const plotWidth = Math.max(1, (c.w || 0) - (m.l || 0) - (m.r || 0));
    const spacing = typeof c.getCandleSpacing === 'function' ? c.getCandleSpacing() : null;
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      devicePixelRatio: window.devicePixelRatio,
      chart_w: c.w,
      chart_h: c.h,
      margin: { l: m.l, r: m.r, t: m.t, b: m.b },
      plotWidth,
      spacingPx: spacing != null ? +spacing.toFixed(3) : null,
      visibleBarsAtThisSpacing: spacing ? Math.round(plotWidth / spacing) : null,
      predictedKnee_plotWidthOver2: Math.ceil(plotWidth / slot),
      RENDER_BAR_BUDGET: P ? P.RENDER_BAR_BUDGET : null,
      pixelLodActiveNow: spacing != null ? spacing < slot : null,
      isBacktestMode: !!c.isBacktestMode,
      incrementalResamples: (c._mcDiag && c._mcDiag.incrementalResamples) != null
        ? c._mcDiag.incrementalResamples : null,
    };
  });
  console.log(JSON.stringify(g, null, 2));
  console.log('');
  console.log(`  A predicts the knee at plotWidth/2 = ${g.predictedKnee_plotWidthOver2} bars.`);
} catch (e) {
  console.log('ERROR ' + String(e && e.message ? e.message : e).slice(0, 300));
} finally {
  await browser.close();
}
