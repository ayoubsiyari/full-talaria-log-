/**
 * FALSIFIER for the saturation mechanism I proposed at 22:45.
 *
 * Claim: past the knee the main thread is saturated, so as bars accumulate the cost per event rises and
 * the ACHIEVED event rate falls in proportion, leaving occupancy roughly flat. That is what produces the
 * plateau I could not otherwise explain.
 *
 *   saturation predicts:   events/s falls ~ 1/bars      occupancy flat       cost/event rises ~ bars
 *   I am WRONG if:         events/s stays flat          occupancy climbs
 *
 * DESIGN NOTE, and it is the point of this harness. Bars only grow with elapsed time during ordinary
 * replay, so a monotonic sweep confounds bar count with everything else that drifts - host load above
 * all, on a box currently running C's soak at 345% CPU. startReplayAtIndex() lets me set the position
 * directly, so the sweep is run INTERLEAVED: each bar count is visited twice, early and late, in an
 * order that is not monotonic in bars. If load drift were driving the result, the two visits to the same
 * bar count would disagree and the early/late split would show it. Host loadavg is recorded per window
 * so that check is arithmetic rather than assertion.
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { login, openBacktest, JOURNAL_BEARING } from './m20-j1/talaria-auth-route.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const CHROME = fs.readFileSync('/root/b-tal01891/CHROME_PATH', 'utf8').trim();
const SPEED = Number(process.env.SPEED || 10);
const WINDOW_MS = Number(process.env.WINDOW_MS || 25000);
// visited twice each, deliberately not monotonic in bars
const PLAN = (process.env.PLAN || '1500,20000,4000,10000,10000,4000,20000,1500').split(',').map(Number);

const env = Object.fromEntries(
  fs.readFileSync('/root/.talaria-test-env', 'utf8').split('\n')
    .filter((l) => l.includes('=')).map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).replace(/^export\s+/, '').trim(),
        l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const loadavg = () => Number(fs.readFileSync('/proc/loadavg', 'utf8').split(' ')[0]);

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const results = [];
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

  const cap = await page.evaluate(() => ({
    fullRaw: window.chart.replaySystem.fullRawData ? window.chart.replaySystem.fullRawData.length : 0,
    hasSeek: typeof window.chart.replaySystem.startReplayAtIndex === 'function',
  }));
  console.log(`fullRawData ${cap.fullRaw} bars, startReplayAtIndex ${cap.hasSeek ? 'available' : 'MISSING'}`);
  if (!cap.hasSeek) throw new Error('no seek: sweep would be monotonic and confounded, refusing');

  // one persistent observer; counters reset per window
  await page.evaluate(() => {
    const S = { tasks: [], dv: 0 };
    window.__sw = S;
    const c = window.chart;
    let last = c.dataVersion ?? 0;
    setInterval(() => { const n = c.dataVersion ?? 0; if (n !== last) { S.dv += 1; last = n; } }, 4);
    new PerformanceObserver((l) => { for (const e of l.getEntries()) S.tasks.push(Math.round(e.duration)); })
      .observe({ entryTypes: ['longtask'] });
  });

  for (let i = 0; i < PLAN.length; i++) {
    const target = PLAN[i];
    const la0 = loadavg();
    // startReplayAtIndex TRUNCATES rawData, so it only drives the position down and the sweep could
    // never come back up. goToReplayTimestamp loads in both directions, which is what makes the
    // interleaved order possible at all.
    const seeked = await page.evaluate(async (bars) => {
      const c = window.chart, rs = c.replaySystem;
      try { if (rs.pause) rs.pause(); } catch (e) { /* not fatal */ }
      // ~1 bar per minute, minus market gaps; the x-axis is the bar count actually reached, not this.
      rs.goToReplayTimestamp(rs.replayStartTimestamp + Math.round(bars * 60000 * 1.04));
      await new Promise((r) => setTimeout(r, 6000));
      return { bars: c.data.length, idx: rs.currentIndex,
               rawLen: c.rawData ? c.rawData.length : null };
    }, target);

    // The pilot seeked to 20,000, silently landed on 1,661 because rawData only held ~6,700, and
    // recorded the window as if it were a 20,000-bar point. A sweep that accepts a failed seek is a
    // sweep that invents its own x-axis. Refuse the window instead.
    const off = Math.abs(seeked.bars - target) / target;
    if (off > 0.20) {
      console.log(`visit ${i + 1}  target ${target}: SEEK DID NOT LAND (got ${seeked.bars} bars, `
        + `rawData ${seeked.rawLen}) - window SKIPPED, not recorded`);
      continue;
    }

    await page.evaluate((sp) => {
      const S = window.__sw; S.tasks.length = 0; S.dv = 0;
      const rs = window.chart.replaySystem;
      if (rs.setSpeed) rs.setSpeed(sp);
      if (rs.play) rs.play();
      S.t0 = performance.now();
    }, SPEED);

    await sleep(WINDOW_MS);

    const w = await page.evaluate(() => {
      const S = window.__sw, c = window.chart;
      try { if (c.replaySystem.pause) c.replaySystem.pause(); } catch (e) { /* not fatal */ }
      return { ms: performance.now() - S.t0, dv: S.dv, tasks: S.tasks.slice(), bars: c.data.length };
    });
    const la1 = loadavg();

    const sec = w.ms / 1000;
    const blocked = w.tasks.map((d) => d - 50).filter((d) => d > 0).reduce((a, b) => a + b, 0);
    const occupancy = blocked + 50 * w.tasks.length;
    const evPerSec = w.dv / sec;
    const barsDelivered = w.bars - seeked.bars;
    const row = {
      visit: i + 1, targetBars: target, barsAtStart: seeked.bars, barsAtEnd: w.bars,
      barsDelivered, sec: +sec.toFixed(1),
      eventsPerSec: +evPerSec.toFixed(2),
      barsPerSec: +(barsDelivered / sec).toFixed(2),
      blockedMsPerSec: +(blocked / sec).toFixed(1),
      occupancyMsPerSec: +(occupancy / sec).toFixed(1),
      msPerEvent: evPerSec > 0 ? +(occupancy / w.dv).toFixed(1) : null,
      longTasks: w.tasks.length,
      loadavgBefore: la0, loadavgAfter: la1,
    };
    results.push(row);
    console.log(`visit ${row.visit}  target ${String(target).padStart(6)}  actual ${String(row.barsAtStart).padStart(6)}`
      + `  events/s ${String(row.eventsPerSec).padStart(6)}  occupancy ${String(row.occupancyMsPerSec).padStart(6)} ms/s`
      + `  ms/event ${String(row.msPerEvent).padStart(6)}  load ${la0}->${la1}`);
  }

  console.log('\n================ SATURATION FALSIFIER ================');
  console.log('bars    events/s   occupancy   ms/event   blocked   load');
  for (const r of results.slice().sort((a, b) => a.barsAtStart - b.barsAtStart)) {
    console.log(`${String(r.barsAtStart).padStart(6)}  ${String(r.eventsPerSec).padStart(8)}   `
      + `${String(r.occupancyMsPerSec).padStart(9)}   ${String(r.msPerEvent).padStart(8)}   `
      + `${String(r.blockedMsPerSec).padStart(7)}   ${r.loadavgBefore}`);
  }

  const lo = results.filter((r) => r.targetBars === Math.min(...PLAN));
  const hi = results.filter((r) => r.targetBars === Math.max(...PLAN));
  const avg = (a, k) => a.reduce((s, r) => s + r[k], 0) / a.length;
  const barRatio = avg(hi, 'barsAtStart') / avg(lo, 'barsAtStart');
  const evRatio = avg(lo, 'eventsPerSec') / Math.max(0.001, avg(hi, 'eventsPerSec'));
  const occRatio = avg(hi, 'occupancyMsPerSec') / Math.max(0.001, avg(lo, 'occupancyMsPerSec'));
  const cpeRatio = avg(hi, 'msPerEvent') / Math.max(0.001, avg(lo, 'msPerEvent'));

  console.log('\n=== the prediction, tested ===');
  console.log(`bar count ratio high/low:        ${barRatio.toFixed(2)}x`);
  console.log(`events/s   ratio low/high:       ${evRatio.toFixed(2)}x   (saturation predicts ~${barRatio.toFixed(2)}x, i.e. events/s ~ 1/bars)`);
  console.log(`occupancy  ratio high/low:       ${occRatio.toFixed(2)}x   (saturation predicts ~1.0x, i.e. flat)`);
  console.log(`ms/event   ratio high/low:       ${cpeRatio.toFixed(2)}x   (saturation predicts ~${barRatio.toFixed(2)}x)`);
  console.log('\n=== interleaving check: same bar count, early vs late visit ===');
  for (const t of [...new Set(PLAN)]) {
    const v = results.filter((r) => r.targetBars === t);
    if (v.length > 1) {
      console.log(`  ${String(t).padStart(6)} bars: events/s ${v.map((x) => x.eventsPerSec).join(' vs ')}`
        + `   occupancy ${v.map((x) => x.occupancyMsPerSec).join(' vs ')}`
        + `   load ${v.map((x) => x.loadavgBefore).join(' vs ')}`);
    }
  }
  const verdict = (evRatio > 1.5 && occRatio < 1.5) ? 'CONSISTENT WITH SATURATION'
    : (evRatio < 1.2 && occRatio > 1.5) ? 'REFUTES SATURATION - events/s flat while occupancy climbs'
    : 'NEITHER CLEANLY - report as inconclusive, do not pick a side';
  console.log(`\nVERDICT: ${verdict}`);
  fs.writeFileSync('/root/b-tal01891/saturation-falsifier.json',
    JSON.stringify({ results, barRatio, evRatio, occRatio, cpeRatio, verdict }, null, 2));
} catch (e) {
  console.log('ERROR ' + String(e && e.stack ? e.stack : e).slice(0, 800));
} finally {
  await browser.close();
}
