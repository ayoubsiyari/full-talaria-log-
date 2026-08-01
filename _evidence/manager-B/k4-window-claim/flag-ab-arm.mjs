/**
 * One arm of a flag A/B: N independent measurement windows, each a fresh page, reported as an array so
 * the oracle can take a mean and a spread rather than a single number.
 *
 * Each window is 25 s of measurement, which is the length the published cv of 7.3% was measured at.
 * Changing it invalidates the noise floor the pass/fail bar is built on, so it is pinned here rather
 * than exposed as a knob.
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { login, openBacktest } from './m20-j1/talaria-auth-route.mjs';

const REPEATS = Number(process.env.REPEATS || 5);
const SESSION = Number(process.env.SESSION || 936);
const FILEID = Number(process.env.FILEID || 677);
const OUT_JSON = process.env.OUT_JSON || 'flag-ab-arm.json';
const WINDOW_MS = 25000;   // pinned: the cv the bar relies on was measured at this length
const SPEED = 10;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function oneWindow(browser, i) {
  const page = await browser.newPage();
  try {
    await login(page);
    await openBacktest(page, SESSION, FILEID);

    const armed = await page.evaluate((speed) => {
      const c = window.chart, rs = c && c.replaySystem;
      if (!rs) return { ok: false, why: 'no replaySystem' };
      try { rs.setSpeed ? rs.setSpeed(speed) : (rs.speed = speed); } catch (e) { /* speed setter varies */ }
      if (!rs.playing && rs.play) rs.play();
      window.__ab = { longTasks: [], startedAt: performance.now() };
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__ab.longTasks.push({ d: e.duration, s: e.startTime });
      }).observe({ entryTypes: ['longtask'] });
      return { ok: true, bars: (c.data || []).length, speed: rs.speed };
    }, SPEED);
    if (!armed.ok) throw new Error(`arm failed: ${armed.why}`);

    await sleep(WINDOW_MS);

    const m = await page.evaluate(() => {
      const a = window.__ab;
      const elapsed = (performance.now() - a.startedAt) / 1000;
      const blocked = a.longTasks.reduce((s, t) => s + Math.max(0, t.d - 50), 0);
      const occupancy = a.longTasks.reduce((s, t) => s + t.d, 0);
      return {
        elapsedS: elapsed,
        blockedMsPerSec: blocked / elapsed,
        occupancyMsPerSec: occupancy / elapsed,
        longTasks: a.longTasks.length,
        longestMs: a.longTasks.reduce((m2, t) => Math.max(m2, t.d), 0),
        bars: (window.chart?.data || []).length,
      };
    });
    console.log(`    window ${i + 1}/${REPEATS}: blocked ${m.blockedMsPerSec.toFixed(1)} ms/s  `
      + `occupancy ${m.occupancyMsPerSec.toFixed(1)}  longest ${m.longestMs.toFixed(0)} ms  bars ${m.bars}`);
    return m;
  } finally {
    await page.close().catch(() => {});
  }
}

const browser = await puppeteer.launch({
  executablePath: fs.readFileSync('/root/b-tal01891/CHROME_PATH', 'utf8').trim(),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const rows = [];
try {
  for (let i = 0; i < REPEATS; i++) rows.push(await oneWindow(browser, i));
} finally {
  await browser.close().catch(() => {});
}

const pick = (k) => rows.map((r) => r[k]);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const out = {
  repeats: rows.length,
  windowMs: WINDOW_MS,
  session: SESSION, file: FILEID, speed: SPEED,
  regime: 'ZERO-TRADE (LAG-ZT) - unverified for this session; stamp before quoting',
  blockedMsPerSec: pick('blockedMsPerSec'),
  occupancyMsPerSec: pick('occupancyMsPerSec'),
  bars: pick('bars'),
  meanBlocked: mean(pick('blockedMsPerSec')),
  rows,
};
fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));
console.log(`    arm mean blocked: ${out.meanBlocked.toFixed(1)} ms/s over ${rows.length} windows`);
