/**
 * Is the plateau bounded by the VIEWPORT, or by something else?
 *
 * A named MONSTER-2's mechanism: getDisplaySeries keys its single-slot resample cache on
 * dataVersion, replay bumps dataVersion on every event, so the cache never hits and the series is
 * rebuilt per bar. The Director's open objection is that a resample linear in source length would
 * keep climbing, and I measured a PLATEAU flat from 1,930 to 4,193 bars. "Bounded-but-large" is
 * asserted, not shown.
 *
 * My finding stated the falsifiable prediction, so this runs it: if the bounded set is the viewport,
 * the plateau height must track candles VISIBLE, not candles LOADED. Zoom in and blocking should
 * fall; zoom out and it should rise; load more bars at fixed zoom and it should not move.
 *
 * Design note. Bar count climbs throughout a run and is exactly the confound that invalidated my
 * first A/B, so zoom levels ALTERNATE rather than run in order. If blocking tracked bars rather than
 * zoom, an alternating sequence shows a monotone trend across segments and no zoom correlation. If
 * it tracks zoom, the values zig-zag with the zoom and ignore the bar trend. The two are only
 * separable this way, so the ordering is the experiment rather than a detail of it.
 *
 * Zoom is driven through the product's own wheel handler rather than by writing internals, so what
 * is measured is a zoom a user could perform.
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const CHROME = fs.readFileSync('/root/b-tal01891/CHROME_PATH', 'utf8').trim();
const SESSION_ID = process.env.SESSION_ID || '936';
const FILE_ID = process.env.FILE_ID || '677';
const SPEED = Number(process.env.SPEED || 10);
const SEG_MS = Number(process.env.SEG_MS || 15000);
const WHEELS = Number(process.env.WHEELS || 10);

const env = Object.fromEntries(
  fs.readFileSync('/root/.talaria-test-env', 'utf8').split('\n')
    .filter((l) => l.includes('=')).map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).replace(/^export\s+/, '').trim(),
        l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const URL_ = `${BASE}/chart/dist-v9/index.html?mode=backtest&sessionId=${SESSION_ID}&fileId=${FILE_ID}`;

const INSTRUMENT = `
(() => {
  window.__mt = { tasks: [], gaps: [], t0: performance.now(), armed: false };
  try {
    new PerformanceObserver((list) => {
      if (!window.__mt.armed) return;
      for (const e of list.getEntries()) window.__mt.tasks.push(Math.round(e.duration));
    }).observe({ entryTypes: ['longtask'] });
  } catch (e) {}
  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    const gap = now - last - 50;
    if (window.__mt.armed && gap > 0) window.__mt.gaps.push(Math.round(gap));
    last = now;
  }, 50);
})();
`;

const pct = (a, p) => (a.length
  ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : 0);

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const rows = [];
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
  await page.evaluateOnNewDocument(INSTRUMENT);
  await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 90000 });

  let ready = null;
  for (let i = 0; i < 40; i++) {
    await sleep(2000);
    ready = await page.evaluate(() => {
      const c = window.chart;
      return {
        chart: !!c,
        bars: c && c.data ? c.data.length : 0,
        replay: !!(c && c.replaySystem),
        build: window.__TALARIA_CHART_BUILD_ID || null,
        spacing: c && typeof c.getCandleSpacing === 'function' ? +c.getCandleSpacing().toFixed(3) : null,
        budget: (window.ChartDataPipeline && window.ChartDataPipeline.RENDER_BAR_BUDGET) || null,
        replayRawCap: (window.ChartDataPipeline && window.ChartDataPipeline.REPLAY_RAW_CAP) || null,
      };
    }).catch(() => ({ chart: false }));
    if (ready.chart && ready.bars > 0 && ready.replay) break;
  }
  console.log('ready ' + JSON.stringify(ready));

  await page.evaluate((s) => {
    const rs = window.chart.replaySystem;
    if (typeof rs.setSpeed === 'function') rs.setSpeed(s);
    if (typeof rs.play === 'function') rs.play();
  }, SPEED);
  await sleep(4000);

  // Zoom through the product's own wheel path. Negative deltaY is zoom in on this chart.
  const wheel = async (steps, dir) => {
    await page.evaluate((n, d) => {
      const cv = document.querySelector('canvas');
      if (!cv) return;
      const r = cv.getBoundingClientRect();
      for (let i = 0; i < n; i += 1) {
        cv.dispatchEvent(new WheelEvent('wheel', {
          deltaY: d * 100, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
          bubbles: true, cancelable: true,
        }));
      }
    }, steps, dir);
    await sleep(2500);
  };

  // Alternating so the bar-count trend cannot masquerade as a zoom effect.
  const plan = [
    { label: 'zoomed-IN', dir: -1 },
    { label: 'zoomed-OUT', dir: +1 },
    { label: 'zoomed-IN', dir: -1 },
    { label: 'zoomed-OUT', dir: +1 },
    { label: 'zoomed-IN', dir: -1 },
    { label: 'zoomed-OUT', dir: +1 },
  ];

  for (const seg of plan) {
    await wheel(WHEELS, seg.dir);
    const pre = await page.evaluate(() => {
      const c = window.chart;
      const spacing = typeof c.getCandleSpacing === 'function' ? c.getCandleSpacing() : null;
      const m = c.margin || { l: 60, r: 60 };
      const plotWidth = Math.max(1, (c.w || 1600) - m.l - m.r);
      const disp = (c._displaySeries || c.displaySeries || null);
      window.__mt.tasks = []; window.__mt.gaps = [];
      window.__mt.t0 = performance.now(); window.__mt.armed = true;
      return {
        barsAtArm: c.data ? c.data.length : -1,
        spacing: spacing != null ? +spacing.toFixed(3) : null,
        visibleBarsApprox: spacing ? Math.round(plotWidth / spacing) : null,
        displayLen: Array.isArray(disp) ? disp.length : null,
        dataVersion: c.dataVersion != null ? c.dataVersion : null,
      };
    });
    await sleep(SEG_MS);
    const post = await page.evaluate(() => {
      const k = window.__mt;
      const c = window.chart;
      return {
        wallMs: Math.round(performance.now() - k.t0),
        tasks: k.tasks, gaps: k.gaps,
        barsNow: c.data ? c.data.length : -1,
        dataVersion: c.dataVersion != null ? c.dataVersion : null,
      };
    });
    const blocking = post.tasks.map((d) => d - 50).filter((d) => d > 0);
    const totalBlockedMs = blocking.reduce((a, b) => a + b, 0);
    const row = {
      seg: seg.label,
      spacingPx: pre.spacing,
      visibleBarsApprox: pre.visibleBarsApprox,
      displayLen: pre.displayLen,
      barsAtArm: pre.barsAtArm,
      barsNow: post.barsNow,
      dvPerSec: pre.dataVersion != null && post.dataVersion != null
        ? +((post.dataVersion - pre.dataVersion) / (post.wallMs / 1000)).toFixed(1) : null,
      longtasks: post.tasks.length,
      blockedMsPerSec: +(totalBlockedMs / (post.wallMs / 1000)).toFixed(1),
      p95TaskMs: pct(post.tasks, 0.95),
      p95GapMs: pct(post.gaps, 0.95),
    };
    rows.push(row);
    console.log('SEG ' + JSON.stringify(row));
  }
} catch (e) {
  console.log('ERROR ' + String(e && e.message ? e.message : e).slice(0, 300));
} finally {
  console.log('\n=== zoom vs blocking ===');
  console.log('  seg          spacing  visible  bars   blocked  p95task  dv/s');
  for (const r of rows) {
    console.log(`  ${String(r.seg).padEnd(12)} ${String(r.spacingPx).padStart(7)} `
      + `${String(r.visibleBarsApprox).padStart(8)} ${String(r.barsAtArm).padStart(6)} `
      + `${String(r.blockedMsPerSec).padStart(8)} ${String(r.p95TaskMs).padStart(8)} `
      + `${String(r.dvPerSec).padStart(5)}`);
  }
  const inn = rows.filter((r) => r.seg === 'zoomed-IN').map((r) => r.blockedMsPerSec);
  const out = rows.filter((r) => r.seg === 'zoomed-OUT').map((r) => r.blockedMsPerSec);
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  console.log(`\n  zoomed-IN  mean blocked: ${mean(inn).toFixed(1)} ms/s  (n=${inn.length})`);
  console.log(`  zoomed-OUT mean blocked: ${mean(out).toFixed(1)} ms/s  (n=${out.length})`);
  console.log(`  bars climbed ${rows.length ? rows[0].barsAtArm : '?'} -> ${rows.length ? rows[rows.length - 1].barsAtArm : '?'} across segments`);
  console.log('\n  If IN and OUT differ while bars climb monotonically, the bounded set is the');
  console.log('  viewport, and the bounded-but-large claim is shown. If they match, it is not.');
  await browser.close();
}
