/**
 * K4 — the reported reproduction, finally on an account that can reproduce it.
 *
 * "Reload the tab and open a second one." Every previous attempt ran as the QA account, which has
 * max_sessions = 2, so two tabs fit inside the limit and nothing was ever evicted: 33 claims and
 * zero 409s. 21 of the 25 real accounts are on max_sessions = 1. This runs as a cloned account
 * with max_sessions = 1, where opening the second tab necessarily displaces the first.
 *
 * "Hang" means the tab stops responding, so that is what is measured, rather than a request time:
 *
 *   main-thread lag  a timer scheduled every 100 ms reports how late it actually fired. A frozen
 *                    tab cannot run timers, so lag IS the freeze, in milliseconds.
 *   request storm    every request the page issues, so a kicked tab retrying in a loop is visible.
 *   websocket churn  opens and closes, for the same reason.
 *   overlay          whether the product's own "opened elsewhere" UI appeared, which is the
 *                    designed outcome and the thing a freeze would replace.
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = fs.readFileSync('/root/b-tal01891/CHROME_PATH', 'utf8').trim();
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const EMAIL = process.env.EMAIL || 'k4-probe@talaria-log.com';
const WATCH_MS = Number(process.env.WATCH_MS || 30000);

const env = Object.fromEntries(
  fs.readFileSync('/root/.talaria-test-env', 'utf8').split('\n')
    .filter(l => l.includes('=')).map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i).replace(/^export\s+/, '').trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const tally = { A: { req: 0, ws: 0, claim: [], gated409: 0 }, B: { req: 0, ws: 0, claim: [], gated409: 0 } };

function instrument(page, key) {
  page.on('request', () => { tally[key].req++; });
  page.on('response', async (res) => {
    try {
      const u = new URL(res.url());
      if (u.pathname === '/api/chart/windows/claim') tally[key].claim.push(res.status());
      if (res.status() === 409) tally[key].gated409++;
    } catch {}
  });
  const cdp = page.target().createCDPSession();
  cdp.then(s => s.send('Network.enable').then(() => {
    s.on('Network.webSocketCreated', () => { tally[key].ws++; });
  })).catch(() => {});
}

/** Install a main-thread lag recorder that survives until we read it. */
async function installLagMeter(page) {
  await page.evaluate(() => {
    window.__k4lag = { samples: [], worst: 0, started: performance.now() };
    let last = performance.now();
    setInterval(() => {
      const now = performance.now();
      const lag = now - last - 100;          // scheduled every 100ms
      last = now;
      if (lag > 0) {
        window.__k4lag.samples.push(Math.round(lag));
        if (lag > window.__k4lag.worst) window.__k4lag.worst = Math.round(lag);
      }
    }, 100);
  });
}

async function readLag(page) {
  try {
    return await page.evaluate(() => {
      const s = (window.__k4lag && window.__k4lag.samples) || [];
      const sorted = s.slice().sort((a, b) => a - b);
      return {
        n: s.length,
        med: sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0,
        p95: sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0,
        worst: (window.__k4lag && window.__k4lag.worst) || 0,
        over1s: s.filter(x => x >= 1000).length,
      };
    });
  } catch (e) { return { error: String(e) }; }
}

async function state(page) {
  try {
    return await page.evaluate(() => ({
      blocked: !!window.__talariaChartWindowBlocked,
      overlay: !!document.querySelector('[data-talaria-window-blocked], .talaria-window-blocked, #talaria-window-blocked')
               || /opened elsewhere/i.test(document.body ? document.body.innerText : ''),
      title: document.title,
    }));
  } catch (e) { return { error: String(e) }; }
}

try {
  // ---- login ----
  const lp = await browser.newPage();
  await lp.goto(`${BASE}/login/`, { waitUntil: 'domcontentloaded' });
  const st = await lp.evaluate(async (BASE, email, password) => {
    const r = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify({ email, password }),
    });
    return r.status;
  }, BASE, EMAIL, env.TEST_PASSWORD);
  await new Promise(r => setTimeout(r, 1200));
  await lp.close();
  console.log(`login as ${EMAIL}: http ${st}`);
  if (st !== 200) process.exit(2);

  // ---- tab A ----
  console.log('');
  console.log('tab A: opening the chart');
  const A = await browser.newPage();
  await A.setViewport({ width: 1400, height: 900 });
  instrument(A, 'A');
  await A.goto(`${BASE}/chart/dist-v9/index.html`, { waitUntil: 'networkidle2', timeout: 90000 }).catch(() => {});
  await installLagMeter(A);
  await new Promise(r => setTimeout(r, 3000));
  console.log(`  A after load      claims=${JSON.stringify(tally.A.claim)}  state=${JSON.stringify(await state(A))}`);

  // ---- reload tab A, as reported ----
  console.log('tab A: reloading');
  await A.reload({ waitUntil: 'networkidle2', timeout: 90000 }).catch(() => {});
  await installLagMeter(A);
  await new Promise(r => setTimeout(r, 3000));
  console.log(`  A after reload    claims=${JSON.stringify(tally.A.claim)}  state=${JSON.stringify(await state(A))}`);

  const reqABefore = tally.A.req;

  // ---- tab B: on a limit of 1 this displaces tab A ----
  console.log('tab B: opening the chart (this evicts tab A)');
  const B = await browser.newPage();
  await B.setViewport({ width: 1400, height: 900 });
  instrument(B, 'B');
  await B.goto(`${BASE}/chart/dist-v9/index.html`, { waitUntil: 'networkidle2', timeout: 90000 }).catch(() => {});
  await installLagMeter(B);

  // ---- watch the displaced tab ----
  console.log('');
  console.log(`watching the displaced tab A for ${WATCH_MS / 1000}s`);
  const t0 = Date.now();
  while (Date.now() - t0 < WATCH_MS) {
    await new Promise(r => setTimeout(r, 5000));
    const lag = await readLag(A);
    const s = await state(A);
    console.log(`  +${String(Math.round((Date.now() - t0) / 1000)).padStart(2)}s  A lag med ${String(lag.med).padStart(4)}ms p95 ${String(lag.p95).padStart(5)}ms worst ${String(lag.worst).padStart(5)}ms` +
                `  over1s ${lag.over1s}  reqs ${tally.A.req - reqABefore}  ws ${tally.A.ws}  blocked=${s.blocked} overlay=${s.overlay}`);
  }

  const lagA = await readLag(A);
  const lagB = await readLag(B);
  console.log('');
  console.log('=== result ===');
  console.log(`  tab A (displaced) main-thread lag: med ${lagA.med}ms  p95 ${lagA.p95}ms  worst ${lagA.worst}ms  samples over 1s: ${lagA.over1s}/${lagA.n}`);
  console.log(`  tab B (active)    main-thread lag: med ${lagB.med}ms  p95 ${lagB.p95}ms  worst ${lagB.worst}ms  samples over 1s: ${lagB.over1s}/${lagB.n}`);
  console.log(`  tab A requests after eviction: ${tally.A.req - reqABefore}   websockets opened: ${tally.A.ws}`);
  console.log(`  claims  A=${JSON.stringify(tally.A.claim)}  B=${JSON.stringify(tally.B.claim)}`);
  console.log(`  tab A final state: ${JSON.stringify(await state(A))}`);

  const froze = lagA.worst >= 1000 || lagB.worst >= 1000;
  const stormed = (tally.A.req - reqABefore) > 300;
  console.log('');
  console.log(froze ? `K4_TAB_FROZE (worst main-thread lag ${Math.max(lagA.worst, lagB.worst)}ms)` : 'K4_NO_FREEZE');
  if (stormed) console.log(`K4_REQUEST_STORM (${tally.A.req - reqABefore} requests from the displaced tab)`);

  fs.writeFileSync('/root/b-k4/two-tab-result.json', JSON.stringify({ lagA, lagB, tally, froze, stormed }, null, 2));
  await A.close(); await B.close();
} finally { await browser.close(); }
