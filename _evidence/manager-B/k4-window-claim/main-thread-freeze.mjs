/**
 * K4 — freeze in MILLISECONDS OF BLOCKED MAIN THREAD, on the live product, at 10x.
 *
 * What I reported this morning (500.5ms -> 148.7ms) was SERVER event-loop unavailability. That is
 * the cause I fixed, but it is not what a user feels. A user feels their own browser's main thread
 * stop. Those are different threads and only the second one is the freeze. This measures the
 * second one, so the number can become a standing threshold under BUDGET-01.
 *
 * Instrument, two independent witnesses on the same run:
 *
 *   longtask entries   the Long Tasks API reports every task that occupied the main thread for
 *                      >50ms, with its duration. Blocking time is the part over 50ms (the same
 *                      definition as Total Blocking Time), because a task cannot be interrupted
 *                      once started but the first 50ms is not perceptible.
 *   timer gap          a 50ms interval records how late it actually fired. A frozen thread cannot
 *                      run timers, so the gap IS the freeze in ms, measured without trusting the
 *                      Long Tasks implementation.
 *
 * Reported as a rate (blocked ms per second of wall clock) as well as totals, because a threshold
 * that is not duration-normalised silently changes meaning when the run length changes.
 *
 * Condition: the real product in backtest/replay mode on a real dataset, replay at 10x — the
 * speed whose sweep point is VOID — with a configurable number of concurrent windows, because
 * C's run died when a SECOND session appeared.
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import http from 'node:http';

const CHROME = fs.readFileSync('/root/b-tal01891/CHROME_PATH', 'utf8').trim();
const BASE = 'http://127.0.0.1:3000';
const SESSION_ID = process.env.SESSION_ID || '936';
const FILE_ID = process.env.FILE_ID || '677';
const SPEED = Number(process.env.SPEED || 10);
const WINDOWS = Number(process.env.WINDOWS || 1);
const MEASURE_MS = Number(process.env.MEASURE_MS || 30000);
const LABEL = process.env.LABEL || 'run';

const env = Object.fromEntries(
  fs.readFileSync('/root/.talaria-test-env', 'utf8').split('\n')
    .filter(l => l.includes('=')).map(l => {
      const i = l.indexOf('='); return [l.slice(0, i).replace(/^export\s+/, '').trim(),
        l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }));

const URL_ = `${BASE}/chart/dist-v9/index.html?mode=backtest&sessionId=${SESSION_ID}&fileId=${FILE_ID}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const INSTRUMENT = `
(() => {
  window.__mt = { tasks: [], gaps: [], t0: performance.now(), armed: false };
  try {
    new PerformanceObserver((list) => {
      if (!window.__mt.armed) return;
      for (const e of list.getEntries()) window.__mt.tasks.push(Math.round(e.duration));
    }).observe({ entryTypes: ['longtask'] });
    window.__mt.longtaskSupported = true;
  } catch (e) { window.__mt.longtaskSupported = false; }
  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    const gap = now - last - 50;
    if (window.__mt.armed && gap > 0) window.__mt.gaps.push(Math.round(gap));
    last = now;
  }, 50);

  // Replay-progress witness. A blocked main thread is only one way a chart freezes; if the
  // SERVER loop is the thing that stalls, this tab's thread stays free while the chart visibly
  // stops advancing. To a user both are "it froze", so both are measured, in ms.
  window.__mt.prog = { lastBars: -1, lastChangeAt: performance.now(), stalls: [] };
  setInterval(() => {
    if (!window.__mt.armed) return;
    const c = window.chart;
    const n = c && c.data ? c.data.length : -1;
    const now = performance.now();
    const p = window.__mt.prog;
    if (n !== p.lastBars) {
      if (p.lastBars !== -1) p.stalls.push(Math.round(now - p.lastChangeAt));
      p.lastBars = n;
      p.lastChangeAt = now;
    }
  }, 50);
})();
`;

const pct = (a, p) => a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : 0;

/**
 * Background gated load, stated as a number so the threshold has a named condition attached.
 * C's run did not die on one quiet tab; it died when a second heavy session appeared. LOAD is
 * that second session, expressed as concurrent requests to a window-gated endpoint.
 */
const LOAD = Number(process.env.LOAD || 0);
let loadStop = false;
function startLoad(cookie, windowId) {
  if (!LOAD) return { stop() {}, stats: { n: 0 } };
  const stats = { n: 0, codes: {} };
  const one = () => new Promise((resolve) => {
    const r = http.request({
      host: '127.0.0.1', port: 3000,
      path: `/api/file/${FILE_ID}/bars?resolution=1m&limit=200`,
      headers: { Cookie: cookie, 'X-Talaria-Chart-Window-Id': windowId },
    }, (res) => { res.resume(); res.on('end', () => { stats.n++; stats.codes[res.statusCode] = (stats.codes[res.statusCode] || 0) + 1; resolve(); }); });
    r.on('error', () => { stats.n++; resolve(); });
    r.end();
  });
  const pump = async () => { while (!loadStop) await one(); };
  for (let i = 0; i < LOAD; i++) pump();
  return { stop() { loadStop = true; }, stats };
}

function rawLogin() {
  return new Promise((resolve) => {
    const b = JSON.stringify({ email: env.TEST_EMAIL, password: env.TEST_PASSWORD });
    const r = http.request({
      host: '127.0.0.1', port: 3000, path: '/api/auth/login', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) },
    }, (res) => {
      res.resume();
      const sc = res.headers['set-cookie'];
      resolve(sc ? sc.map(c => c.split(';')[0]).join('; ') : null);
    });
    r.on('error', () => resolve(null));
    r.write(b); r.end();
  });
}

async function login(browser) {
  const p = await browser.newPage();
  await p.goto(`${BASE}/login/`, { waitUntil: 'domcontentloaded' });
  const st = await p.evaluate(async (BASE, email, password) => (await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    credentials: 'include', body: JSON.stringify({ email, password }),
  })).status, BASE, env.TEST_EMAIL, env.TEST_PASSWORD);
  await sleep(1500); await p.close();
  return st;
}

async function openChart(browser, name) {
  const p = await browser.newPage();
  await p.setViewport({ width: 1600, height: 950 });
  await p.evaluateOnNewDocument(INSTRUMENT);
  await p.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 90000 })
    .catch(e => console.log(`  ${name} nav: ${e.message.slice(0, 70)}`));

  // Wait for the engine to exist and to be holding real candles.
  let ready = null;
  for (let i = 0; i < 40; i++) {
    await sleep(2000);
    ready = await p.evaluate(() => {
      const c = window.chart;
      return {
        chart: !!c,
        bars: c && c.data ? (c.data.length || 0) : 0,
        raw: c && c.rawData ? (c.rawData.length || 0) : 0,
        replay: !!(c && c.replaySystem),
        backtest: !!(c && c.isBacktestMode),
        build: window.__TALARIA_CHART_BUILD_ID || null,
      };
    }).catch(() => ({ chart: false }));
    if (ready.chart && ready.bars > 0 && ready.replay) break;
  }
  console.log(`  ${name} ready: ${JSON.stringify(ready)}`);
  return { page: p, ready };
}

async function startReplay(page, name) {
  const r = await page.evaluate((speed) => {
    const c = window.chart;
    if (!c || !c.replaySystem) return { ok: false, why: 'no replaySystem' };
    const rs = c.replaySystem;
    try {
      if (typeof rs.setSpeed === 'function') rs.setSpeed(speed);
      const before = rs.getEffectivePlaybackSpeed ? rs.getEffectivePlaybackSpeed() : null;
      if (typeof rs.play === 'function') rs.play();
      return {
        ok: true, speedSet: speed, effective: before,
        playing: !!(rs.isPlaying ?? rs.playing ?? rs._playing),
      };
    } catch (e) { return { ok: false, why: String(e).slice(0, 120) }; }
  }, SPEED).catch(e => ({ ok: false, why: String(e).slice(0, 100) }));
  console.log(`  ${name} replay: ${JSON.stringify(r)}`);
  return r;
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  console.log(`login http ${await login(browser)}`);
  console.log(`\n=== ${LABEL}: ${WINDOWS} window(s), replay ${SPEED}x, ${MEASURE_MS / 1000}s measured ===`);

  const tabs = [];
  for (let i = 1; i <= WINDOWS; i++) tabs.push(await openChart(browser, `win${i}`));
  for (let i = 0; i < tabs.length; i++) await startReplay(tabs[i].page, `win${i + 1}`);

  // Background load stands in for the second heavy session that killed C's run.
  let loader = { stop() {}, stats: { n: 0 } };
  if (LOAD) {
    const cookie = await rawLogin();
    const wid = 'loadgen' + Date.now().toString(36);
    await new Promise((resolve) => {
      const b = JSON.stringify({ client_id: wid });
      const r = http.request({
        host: '127.0.0.1', port: 3000, path: '/api/chart/windows/claim', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b), Cookie: cookie },
      }, (res) => { res.resume(); res.on('end', resolve); });
      r.on('error', resolve); r.write(b); r.end();
    });
    loader = startLoad(cookie, wid);
    console.log(`  background gated load: ${LOAD} concurrent`);
  }

  // Arm only now, so page load and replay startup are not counted as the steady-state freeze.
  await sleep(3000);
  for (const t of tabs) await t.page.evaluate(() => {
    window.__mt.tasks = []; window.__mt.gaps = []; window.__mt.t0 = performance.now();
    // Bar count at arm time. Replay position persists across runs, so successive runs start with
    // more bars loaded and more to render each frame. Without this recorded, a rising blocked-time
    // number cannot be told apart from a build regression — which is exactly the confound that
    // invalidated my first b118-vs-b120 A/B.
    window.__mt.barsAtArm = window.chart && window.chart.data ? window.chart.data.length : -1;
    window.__mt.armed = true;
  });
  console.log(`\n  measuring for ${MEASURE_MS / 1000}s...`);
  await sleep(MEASURE_MS);
  loader.stop();
  if (LOAD) console.log(`  load generated: ${loader.stats.n} reqs ${JSON.stringify(loader.stats.codes)}`);

  console.log('');
  const all = [];
  for (let i = 0; i < tabs.length; i++) {
    const m = await tabs[i].page.evaluate(() => {
      const k = window.__mt;
      const p = k.prog || { stalls: [], lastChangeAt: k.t0 };
      // An in-flight stall is not in the array yet and is often the worst one.
      const open = Math.round(performance.now() - p.lastChangeAt);
      return {
        wallMs: Math.round(performance.now() - k.t0),
        tasks: k.tasks, gaps: k.gaps, supported: k.longtaskSupported,
        stalls: p.stalls.concat(open > 0 ? [open] : []),
        barsAtArm: k.barsAtArm,
        barsNow: window.chart && window.chart.data ? window.chart.data.length : 0,
      };
    });
    // Total Blocking Time convention: only the part of a long task beyond 50ms is "blocking".
    const blocking = m.tasks.map(d => d - 50).filter(d => d > 0);
    const totalBlockedMs = blocking.reduce((a, b) => a + b, 0);
    const longest = m.tasks.length ? Math.max(...m.tasks) : 0;
    const worstGap = m.gaps.length ? Math.max(...m.gaps) : 0;
    const perSec = totalBlockedMs / (m.wallMs / 1000);
    const row = {
      win: i + 1, wallSec: +(m.wallMs / 1000).toFixed(1),
      barsAtArm: m.barsAtArm,
      longtasks: m.tasks.length,
      totalBlockedMs, blockedMsPerSec: +perSec.toFixed(1),
      longestTaskMs: longest, p95TaskMs: pct(m.tasks, 0.95),
      worstTimerGapMs: worstGap, p95GapMs: pct(m.gaps, 0.95),
      longestChartStallMs: m.stalls.length ? Math.max(...m.stalls) : 0,
      p95ChartStallMs: pct(m.stalls, 0.95),
      barsNow: m.barsNow,
    };
    all.push(row);
    console.log(`  win${i + 1}  ${JSON.stringify(row)}`);
  }

  const tot = all.reduce((a, r) => a + r.totalBlockedMs, 0);
  const worst = Math.max(0, ...all.map(r => r.worstTimerGapMs));
  const rate = all.reduce((a, r) => a + r.blockedMsPerSec, 0) / all.length;
  console.log('');
  console.log(`  LABEL=${LABEL} WINDOWS=${WINDOWS} SPEED=${SPEED}x`);
  const worstStall = Math.max(0, ...all.map(r => r.longestChartStallMs));
  console.log(`  blocked main thread  : ${tot} ms total across windows`);
  console.log(`  blocked per second   : ${rate.toFixed(1)} ms/s (mean per window)`);
  console.log(`  longest thread freeze: ${worst} ms (worst timer gap any window)`);
  console.log(`  longest chart stall  : ${worstStall} ms (replay stopped advancing)`);

  fs.appendFileSync('/root/b-k4/freeze-results.jsonl',
    JSON.stringify({ label: LABEL, windows: WINDOWS, speed: SPEED, rows: all, ts: new Date().toISOString() }) + '\n');
} finally {
  await browser.close();
}
