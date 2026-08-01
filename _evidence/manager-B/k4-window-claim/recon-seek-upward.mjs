/**
 * startReplayAtIndex truncates rawData, so the position can only be driven DOWN. To sweep a wide bar
 * range I need a way back up. Three candidates, tested in order, reporting which actually loads data.
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { login, openBacktest, JOURNAL_BEARING } from './m20-j1/talaria-auth-route.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const CHROME = fs.readFileSync('/root/b-tal01891/CHROME_PATH', 'utf8').trim();
const env = Object.fromEntries(
  fs.readFileSync('/root/.talaria-test-env', 'utf8').split('\n')
    .filter((l) => l.includes('=')).map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).replace(/^export\s+/, '').trim(),
        l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }));

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
  console.log('on load: ' + JSON.stringify(ready));

  const before = await page.evaluate(() => {
    const c = window.chart, rs = c.replaySystem;
    return { data: c.data.length, raw: c.rawData ? c.rawData.length : null,
             fullRaw: rs.fullRawData ? rs.fullRawData.length : null,
             tsStart: rs.replayStartTimestamp, tsNow: rs.replayTimestamp, tsEnd: rs.replayEndTimestamp,
             idx: rs.currentIndex };
  });
  console.log('state: ' + JSON.stringify(before));

  console.log('\n=== A. goToReplayTimestamp to ~6000 bars in ===');
  const a = await page.evaluate(async (st) => {
    const c = window.chart, rs = c.replaySystem;
    const target = st + 6000 * 60000;
    try { rs.goToReplayTimestamp(target); } catch (e) { return { error: String(e).slice(0, 200) }; }
    await new Promise((r) => setTimeout(r, 6000));
    return { data: c.data.length, raw: c.rawData ? c.rawData.length : null,
             idx: rs.currentIndex, ts: rs.replayTimestamp, wanted: target };
  }, before.tsStart);
  console.log(JSON.stringify(a));

  console.log('\n=== B. startReplayAtIndex upward after a fresh reload ===');
  const ready2 = await openBacktest(page, {
    base: BASE, sessionId: JOURNAL_BEARING.sessionId, fileId: JOURNAL_BEARING.fileId, timeoutMs: 90000,
  });
  const b = await page.evaluate(async () => {
    const c = window.chart, rs = c.replaySystem;
    const start = c.data.length;
    rs.startReplayAtIndex(6000);
    await new Promise((r) => setTimeout(r, 5000));
    return { start, data: c.data.length, raw: c.rawData ? c.rawData.length : null, idx: rs.currentIndex };
  });
  console.log('reload gave bars=' + ready2.bars + '  then ' + JSON.stringify(b));

  console.log('\n=== C. does a fresh browser profile reset the position? ===');
  const b2 = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--incognito'] });
  try {
    const p1 = await b2.newPage();
    await login(p1, { email: env.TEST_EMAIL, password: env.TEST_PASSWORD, base: BASE });
    await p1.close();
    const p2 = await b2.newPage();
    await p2.setViewport({ width: 1600, height: 950 });
    const r3 = await openBacktest(p2, {
      base: BASE, sessionId: JOURNAL_BEARING.sessionId, fileId: JOURNAL_BEARING.fileId, timeoutMs: 90000,
    });
    const c = await p2.evaluate(() => ({
      data: window.chart.data.length,
      raw: window.chart.rawData ? window.chart.rawData.length : null,
      idx: window.chart.replaySystem.currentIndex,
    }));
    console.log('fresh profile: ' + JSON.stringify({ ready: r3.bars, ...c }));
  } finally { await b2.close(); }
} catch (e) {
  console.log('ERROR ' + String(e && e.stack ? e.stack : e).slice(0, 800));
} finally {
  await browser.close();
}
