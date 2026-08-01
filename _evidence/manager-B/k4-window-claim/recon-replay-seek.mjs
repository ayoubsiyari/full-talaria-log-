/**
 * Can I set the replay position directly?
 *
 * It decides the design of the saturation falsifier. If bars can only grow by replaying in real time,
 * the sweep is a ~30 minute monotonic run, and on a shared host that makes bar count perfectly
 * confounded with elapsed time and therefore with whatever else drifts - exactly the b118/b120 mistake.
 * If position is settable, the sweep becomes five 30-second windows that can be run INTERLEAVED
 * (low, high, low, high), which breaks the confound by construction rather than by hoping load is flat.
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

  const api = await page.evaluate(() => {
    const c = window.chart, rs = c.replaySystem;
    const methodsOf = (o) => {
      const out = new Set();
      for (let p = o; p && p !== Object.prototype; p = Object.getPrototypeOf(p))
        for (const k of Object.getOwnPropertyNames(p))
          if (typeof o[k] === 'function') out.add(k);
      return [...out].sort();
    };
    const m = rs ? methodsOf(rs) : [];
    const interesting = m.filter((k) => /seek|goto|jump|position|index|step|skip|scrub|set|reset|start|load|advance|fast/i.test(k));
    const state = {};
    for (const k of Object.getOwnPropertyNames(rs || {}))
      if (typeof rs[k] !== 'function' && typeof rs[k] !== 'object') state[k] = rs[k];
    return {
      hasReplaySystem: !!rs,
      totalMethods: m.length,
      candidates: interesting,
      scalarState: state,
      dataLen: c.data ? c.data.length : null,
      rawLen: c.rawData ? c.rawData.length : null,
      fullRawLen: rs && rs.fullRawData ? rs.fullRawData.length : null,
    };
  });
  console.log('\n=== replaySystem surface ===');
  console.log(`methods: ${api.totalMethods}, chart.data ${api.dataLen}, rawData ${api.rawLen}, fullRawData ${api.fullRawLen}`);
  console.log('seek-like candidates:');
  for (const c of api.candidates) console.log('  ' + c);
  console.log('scalar state: ' + JSON.stringify(api.scalarState).slice(0, 700));

  // Try the most promising control: step forward in bulk without painting each bar.
  console.log('\n=== can bars be advanced in bulk? ===');
  const bulk = await page.evaluate(async () => {
    const c = window.chart, rs = c.replaySystem;
    const before = c.data.length;
    const t = performance.now();
    let used = null;
    for (const name of ['stepForward', 'step', 'nextBar', 'advance', '_advanceOneStep']) {
      if (typeof rs[name] === 'function') { used = name; break; }
    }
    if (!used) return { used: null, before, after: before };
    for (let i = 0; i < 200; i++) { try { rs[used](); } catch (e) { return { used, error: String(e).slice(0, 120), before, after: c.data.length }; } }
    await new Promise((r) => setTimeout(r, 500));
    return { used, before, after: c.data.length, ms: Math.round(performance.now() - t) };
  });
  console.log(JSON.stringify(bulk));
} catch (e) {
  console.log('ERROR ' + String(e && e.stack ? e.stack : e).slice(0, 600));
} finally {
  await browser.close();
}
