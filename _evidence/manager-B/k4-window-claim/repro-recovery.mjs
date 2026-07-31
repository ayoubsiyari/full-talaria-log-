/**
 * K4, second attempt at RED. My first repro was green, but its tabs were nearly idle (6 fetches
 * each), so a green there is worth very little — that is the same shape of weak evidence that
 * made me report this fixed once while the hang survived.
 *
 * Two things this adds:
 *
 * 1. SUSTAINED OBSERVATION of the kicked tab. The kick puts the tab into a state where every
 *    gated fetch is answered with a synthetic 409 and no network. If anything in the app retries
 *    on failure, that is a spin, and a spin at replay speed is what C would experience as a hang.
 *    The first probe stopped watching immediately after the kick, so it could not have seen one.
 *
 * 2. THE RECOVERY PROMISE. The overlay tells the user "reload to take over". That is a promise
 *    the product makes at exactly the moment the user is stuck. With a cap of 2 and three
 *    windows, reload-to-take-over evicts somebody else, who is then told to reload, who evicts
 *    somebody else. If that is what happens, the user's experience is a chart that will not stay
 *    up, and no marker on the wire would ever show it.
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

const INSTRUMENT = `
(() => {
  window.__k4 = { maxGap: 0, fetches: [], ws: 0, wsClosed: 0 };
  let last = Date.now();
  setInterval(() => {
    const now = Date.now(); const gap = now - last - 100;
    if (gap > window.__k4.maxGap) window.__k4.maxGap = gap;
    last = now;
  }, 100);
  const of = window.fetch;
  window.fetch = function (input) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const rec = { url: String(url).slice(0, 70), t0: Date.now() };
    window.__k4.fetches.push(rec);
    let p; try { p = of.apply(this, arguments); } catch (e) { rec.done = 1; throw e; }
    return p.then(r => { rec.done = 1; rec.ms = Date.now() - rec.t0; rec.status = r.status; return r; },
                  e => { rec.done = 1; rec.ms = Date.now() - rec.t0; rec.err = 1; throw e; });
  };
  const OWS = window.WebSocket;
  if (OWS) {
    window.WebSocket = function (...a) {
      window.__k4.ws++;
      const s = new OWS(...a);
      s.addEventListener('close', () => { window.__k4.wsClosed++; });
      return s;
    };
    window.WebSocket.prototype = OWS.prototype;
  }
})();
`;

const snap = (page) => page.evaluate(() => ({
  maxGap: window.__k4.maxGap,
  fetchCount: window.__k4.fetches.length,
  unsettled: window.__k4.fetches.filter(f => !f.done).length,
  ws: window.__k4.ws, wsClosed: window.__k4.wsClosed,
  blocked: !!window.__talariaChartWindowBlocked,
  overlay: !!document.getElementById('talariaWindowLimitOverlay'),
})).catch(e => ({ error: String(e).slice(0, 100) }));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const log = (...a) => console.log(...a);

try {
  const boot = await browser.newPage();
  await boot.goto(`${BASE}/login/`, { waitUntil: 'domcontentloaded' });
  const st = await boot.evaluate(async (BASE, email, password) => (await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    credentials: 'include', body: JSON.stringify({ email, password }),
  })).status, BASE, env.TEST_EMAIL, env.TEST_PASSWORD);
  log(`login http ${st}`);
  await new Promise(r => setTimeout(r, 1500));
  await boot.close();

  const open = async (name) => {
    const p = await browser.newPage();
    await p.setViewport({ width: 1400, height: 900 });
    await p.evaluateOnNewDocument(INSTRUMENT);
    await p.goto(CHART_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
      .catch(e => log(`  ${name} nav: ${e.message.slice(0, 70)}`));
    await new Promise(r => setTimeout(r, 8000));
    log(`  ${name.padEnd(6)} ${JSON.stringify(await snap(p))}`);
    return p;
  };

  log('\n=== bring three windows up against a cap of 2 ===');
  const A = await open('tab A');
  const B = await open('tab B');
  const C = await open('tab C');

  log('\n=== who got kicked? ===');
  for (const [n, p] of [['A', A], ['B', B], ['C', C]]) log(`  ${n}: ${JSON.stringify(await snap(p))}`);

  log('\n=== sustained watch on the kicked tab (60s, sampled every 15s) ===');
  log('    a spin shows up as fetchCount climbing or maxGap growing while nothing should happen');
  const kicked = (await snap(A)).blocked ? A : ((await snap(B)).blocked ? B : C);
  for (let i = 1; i <= 4; i++) {
    await new Promise(r => setTimeout(r, 15000));
    log(`  t+${i * 15}s  ${JSON.stringify(await snap(kicked))}`);
  }

  log('\n=== the product promises "reload to take over" — test that promise ===');
  await kicked.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
    .catch(e => log(`  reload: ${e.message.slice(0, 70)}`));
  await new Promise(r => setTimeout(r, 10000));
  const after = await snap(kicked);
  log(`  kicked tab after reload: ${JSON.stringify(after)}`);
  const tookOver = !after.blocked && !after.overlay;
  log(`  took over: ${tookOver ? 'YES' : 'NO — the overlay told the user to do something that does not work'}`);

  log('\n=== did taking over kick somebody else? (the eviction war) ===');
  const others = [['A', A], ['B', B], ['C', C]].filter(([, p]) => p !== kicked);
  for (const [n, p] of others) {
    // A victim only learns on its next heartbeat (25s), so give it one.
    log(`  ${n}: ${JSON.stringify(await snap(p))}`);
  }
  log('  waiting 30s for one heartbeat cycle so victims can notice...');
  await new Promise(r => setTimeout(r, 30000));
  let nowBlocked = 0;
  for (const [n, p] of others) {
    const s = await snap(p);
    if (s.blocked) nowBlocked++;
    log(`  ${n}: ${JSON.stringify(s)}`);
  }

  log('\n=== verdict ===');
  const k = await snap(kicked);
  const spin = k.fetchCount > 60 || k.maxGap > 3000 || k.unsettled > 0;
  log(`  kicked tab spun while blocked : ${spin ? 'YES' : 'no'}`);
  log(`  reload-to-take-over worked    : ${tookOver ? 'yes' : 'NO'}`);
  log(`  taking over kicked others     : ${nowBlocked > 0 ? `YES (${nowBlocked})` : 'no'}`);
  const bad = spin || !tookOver;
  log('');
  log(bad ? 'K4_DEFECT_REPRODUCED' : 'K4_NO_DEFECT_OBSERVED');
} finally {
  await browser.close();
}
