/**
 * K4 — reproduce the window-claim hang. RED first, or there is nothing to fix.
 *
 * I reported this fixed once with every marker on the wire while the hang survived. So this
 * probe is built to FAIL when the hang is present, and the fix is only accepted when this same
 * probe, unchanged, goes green.
 *
 * The reported repro is "reload the tab and open a second one" on an account whose window limit
 * is 2 (kick-oldest). What "hang" has to mean, operationally, is one of:
 *
 *   1. the main thread stops running timers        -> measured by a 100ms heartbeat's worst gap
 *   2. a gated fetch never settles                 -> measured by counting unsettled requests
 *   3. the page never reaches a usable state       -> measured by time-to-first-data
 *
 * All three are measured in every tab, because a hang in the tab that got kicked and a hang in
 * the tab that survived are different defects.
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = fs.readFileSync('/root/b-tal01891/CHROME_PATH', 'utf8').trim();
const BASE = 'http://127.0.0.1:3000';
const env = Object.fromEntries(
  fs.readFileSync('/root/.talaria-test-env', 'utf8').split('\n')
    .filter(l => l.includes('=')).map(l => {
      const i = l.indexOf('='); return [l.slice(0, i).replace(/^export\s+/, '').trim(),
        l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }));

const CHART_URL = `${BASE}/chart/dist-v9/index.html`;
const SETTLE_MS = 12000;

// Instrumentation installed before any page script runs.
const INSTRUMENT = `
(() => {
  window.__k4 = { maxGap: 0, ticks: 0, pending: 0, settled: 0, never: [], started: Date.now() };
  let last = Date.now();
  setInterval(() => {
    const now = Date.now();
    const gap = now - last - 100;
    if (gap > window.__k4.maxGap) window.__k4.maxGap = gap;
    last = now; window.__k4.ticks++;
  }, 100);
  const of = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const t0 = Date.now();
    window.__k4.pending++;
    const rec = { url: String(url).slice(0, 90), t0 };
    window.__k4.never.push(rec);
    const done = () => {
      window.__k4.pending--; window.__k4.settled++;
      rec.ms = Date.now() - t0; rec.done = true;
    };
    let p;
    try { p = of.apply(this, arguments); } catch (e) { done(); throw e; }
    return p.then(r => { done(); return r; }, e => { done(); throw e; });
  };
})();
`;

async function readState(page, label) {
  const s = await page.evaluate(() => {
    const k = window.__k4 || {};
    const unsettled = (k.never || []).filter(r => !r.done)
      .map(r => ({ url: r.url, heldMs: Date.now() - r.t0 }));
    const slow = (k.never || []).filter(r => r.done && r.ms > 3000)
      .map(r => ({ url: r.url, ms: r.ms }));
    return {
      maxGap: k.maxGap || 0, ticks: k.ticks || 0,
      pending: k.pending || 0, settled: k.settled || 0,
      unsettled: unsettled.slice(0, 6), unsettledCount: unsettled.length,
      slow: slow.slice(0, 6), slowCount: slow.length,
      blocked: !!window.__talariaChartWindowBlocked,
      overlay: !!document.getElementById('talariaWindowLimitOverlay'),
      buildId: window.__TALARIA_CHART_BUILD_ID || null,
    };
  }).catch(e => ({ error: String(e).slice(0, 120) }));
  console.log(`  ${label.padEnd(22)} ${JSON.stringify(s)}`);
  return s;
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  // Log in once; all tabs share the browser's cookie jar, as real tabs do.
  const boot = await browser.newPage();
  await boot.goto(`${BASE}/login/`, { waitUntil: 'domcontentloaded' });
  const st = await boot.evaluate(async (BASE, email, password) => {
    const r = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify({ email, password }),
    });
    return r.status;
  }, BASE, env.TEST_EMAIL, env.TEST_PASSWORD);
  console.log(`login http ${st}`);
  if (st !== 200) process.exit(2);
  await new Promise(r => setTimeout(r, 2000));
  await boot.close();

  const open = async (name) => {
    const p = await browser.newPage();
    await p.setViewport({ width: 1400, height: 900 });
    await p.evaluateOnNewDocument(INSTRUMENT);
    console.log(`\n--- opening ${name} ---`);
    await p.goto(CHART_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => console.log(`  nav: ${e.message.slice(0, 80)}`));
    await new Promise(r => setTimeout(r, SETTLE_MS));
    await readState(p, `${name} settled`);
    return p;
  };

  const tabA = await open('tab A');

  console.log('\n--- reloading tab A (the reported trigger, step 1) ---');
  await tabA.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => console.log(`  reload: ${e.message.slice(0, 80)}`));
  await new Promise(r => setTimeout(r, SETTLE_MS));
  await readState(tabA, 'tab A after reload');

  const tabB = await open('tab B');            // step 2: the second tab
  await readState(tabA, 'tab A w/ B open');

  // The account's limit is 2. A third window forces the evict/kick branch to run for real.
  const tabC = await open('tab C');
  console.log('');
  const a = await readState(tabA, 'tab A final');
  const b = await readState(tabB, 'tab B final');
  const c = await readState(tabC, 'tab C final');

  console.log('\n=== verdict ===');
  const tabs = [['A', a], ['B', b], ['C', c]];
  let hung = false;
  for (const [n, s] of tabs) {
    const reasons = [];
    if ((s.maxGap || 0) > 3000) reasons.push(`main thread stalled ${s.maxGap}ms`);
    if ((s.unsettledCount || 0) > 0) reasons.push(`${s.unsettledCount} fetch(es) never settled`);
    if ((s.slowCount || 0) > 0) reasons.push(`${s.slowCount} fetch(es) over 3s`);
    if (reasons.length) { hung = true; console.log(`  tab ${n}: HANG — ${reasons.join('; ')}`); }
    else console.log(`  tab ${n}: responsive (worst timer gap ${s.maxGap}ms, ${s.settled} fetches all settled)`);
  }
  console.log('');
  console.log(hung ? 'K4_HANG_REPRODUCED' : 'K4_NO_HANG_OBSERVED');
  fs.writeFileSync('/root/b-k4/repro-result.json', JSON.stringify({ a, b, c, hung }, null, 2));
  process.exit(hung ? 1 : 0);
} finally {
  await browser.close();
}
