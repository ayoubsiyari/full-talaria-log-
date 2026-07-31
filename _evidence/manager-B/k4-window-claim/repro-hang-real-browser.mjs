/**
 * K4 — reproduce the window-claim hang the way a USER reproduces it.
 *
 * My last verification measured the claim endpoint under a held row lock, found it answered 503
 * in 3.03 s, and called the P0 fixed. The markers were all on the wire and the hang survived,
 * because I measured the server while the defect lives in the browser: `window.fetch` is patched
 * so that every `/api/file/*` and `/api/sessions/N/state` waits on the claim gate. If that gate
 * does not open, the chart has no data, there is no console error and there is no server log.
 * A bounded server tells you nothing about it.
 *
 * So this measures the only thing that counts: from inside the page, how long does a GATED fetch
 * take to answer, in the three situations the user described.
 *
 *   S1 fresh tab                  — control; the gate should be a no-op
 *   S2 reload of a claimed tab    — the reload race
 *   S3 second tab while tab 1 holds the claim
 *
 * The defect needs a 409-with-kicked-detail on the FIRST claim, which a reload or a second window
 * only produces before the previous window's release has landed. So it fires on some loads and
 * not others, and one clean run proves nothing. Each scenario is repeated.
 *
 * An UNGATED fetch is timed in the same page at the same moment as a positive control: if both
 * are slow the network is slow, and only the gated one being slow implicates the gate.
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = fs.readFileSync('/root/b-tal01891/CHROME_PATH', 'utf8').trim();
const BASE = 'http://127.0.0.1:3000';
const ITER = Number(process.env.ITER || 6);
const HANG_MS = Number(process.env.HANG_MS || 3000);   // what a user would call a hang

const env = Object.fromEntries(
  fs.readFileSync('/root/.talaria-test-env', 'utf8').split('\n')
    .filter(l => l.includes('=')).map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i).replace(/^export\s+/, '').trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }));

const launch = () => puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

/** Log in once in this browser so every tab shares the cookie jar, as real tabs do. */
async function login(browser) {
  const p = await browser.newPage();
  await p.goto(`${BASE}/login/`, { waitUntil: 'domcontentloaded' });
  const st = await p.evaluate(async (BASE, email, password) => {
    const r = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify({ email, password }),
    });
    return r.status;
  }, BASE, env.TEST_EMAIL, env.TEST_PASSWORD);
  await new Promise(r => setTimeout(r, 1500));
  await p.close();
  return st;
}

async function pickFileId(browser) {
  const p = await browser.newPage();
  await p.goto(`${BASE}/chart/dist-v9/index.html`, { waitUntil: 'domcontentloaded' });
  const id = await p.evaluate(async (BASE) => {
    const r = await fetch(`${BASE}/api/files`, { credentials: 'include' });
    if (!r.ok) return null;
    const j = await r.json();
    const arr = Array.isArray(j) ? j : (j.files || j.data || []);
    return arr.length ? (arr[0].id ?? arr[0].file_id ?? null) : null;
  }, BASE);
  await p.close();
  return id;
}

/**
 * Time a gated fetch and an ungated fetch from inside the page.
 * Deliberately uses the page's patched window.fetch — that patch is the thing under test.
 */
async function timeGate(page, fileId) {
  return page.evaluate(async (BASE, fileId) => {
    const t = () => performance.now();
    const cap = 30000;                 // never wait forever; an unresolved gate is the finding
    const withCap = (p, label) => Promise.race([
      p.then(r => ({ ok: true, status: r.status })).catch(e => ({ ok: false, err: String(e) })),
      new Promise(res => setTimeout(() => res({ ok: false, timedOut: true, label }), cap)),
    ]);

    // gated: /api/file/<id>/bars goes through the claim gate
    const g0 = t();
    const gated = await withCap(
      fetch(`${BASE}/api/file/${fileId}/bars?resolution=1m&limit=10`, { credentials: 'include' }), 'gated');
    const gatedMs = t() - g0;

    // ungated control, same page, same moment
    const u0 = t();
    const ungated = await withCap(
      fetch(`${BASE}/api/auth/me`, { credentials: 'include' }), 'ungated');
    const ungatedMs = t() - u0;

    return {
      gatedMs: Math.round(gatedMs), gated,
      ungatedMs: Math.round(ungatedMs), ungated,
      blocked: !!window.__talariaChartWindowBlocked,
    };
  }, BASE, fileId);
}

async function openChart(browser) {
  const p = await browser.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  await p.goto(`${BASE}/chart/dist-v9/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  return p;
}

const results = [];
const browser = await launch();
try {
  const st = await login(browser);
  console.log(`login http ${st}`);
  if (st !== 200) process.exit(2);

  const fileId = await pickFileId(browser);
  console.log(`using fileId ${fileId}`);
  if (!fileId) { console.log('ABORT: no accessible file to gate a fetch on'); process.exit(2); }

  console.log('');
  console.log(`running ${ITER} iterations of each scenario; a gated fetch over ${HANG_MS}ms is a hang`);
  console.log('');

  for (let i = 1; i <= ITER; i++) {
    // ---- S1 fresh tab (control) ----
    let p1 = await openChart(browser);
    await new Promise(r => setTimeout(r, 1200));
    let m = await timeGate(p1, fileId);
    results.push({ scenario: 'S1 fresh tab', i, ...m });

    // ---- S2 reload the claimed tab ----
    await p1.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    m = await timeGate(p1, fileId);
    results.push({ scenario: 'S2 reload', i, ...m });

    // ---- S3 second tab while the first still holds the claim ----
    const p2 = await openChart(browser);
    m = await timeGate(p2, fileId);
    results.push({ scenario: 'S3 second tab', i, ...m });

    // and the first tab immediately after being kicked
    m = await timeGate(p1, fileId);
    results.push({ scenario: 'S3 first tab after', i, ...m });

    await p2.close(); await p1.close();
    process.stdout.write(`  iteration ${i} done\n`);
  }
} finally { await browser.close(); }

console.log('');
console.log('=== per-scenario gated latency (ms) ===');
const scen = [...new Set(results.map(r => r.scenario))];
let hangs = 0, stuck = 0;
for (const s of scen) {
  const rows = results.filter(r => r.scenario === s);
  const g = rows.map(r => r.gatedMs).sort((a, b) => a - b);
  const u = rows.map(r => r.ungatedMs).sort((a, b) => a - b);
  const over = rows.filter(r => r.gatedMs >= HANG_MS).length;
  const to = rows.filter(r => r.gated && r.gated.timedOut).length;
  hangs += over; stuck += to;
  console.log(`  ${s.padEnd(22)} gated med ${String(g[Math.floor(g.length / 2)]).padStart(6)}  max ${String(g[g.length - 1]).padStart(6)}` +
              `   | ungated med ${String(u[Math.floor(u.length / 2)]).padStart(5)}  max ${String(u[u.length - 1]).padStart(5)}` +
              `   | over ${HANG_MS}ms: ${over}/${rows.length}  never answered: ${to}`);
}

console.log('');
console.log('=== every gated fetch that took over the hang threshold ===');
const bad = results.filter(r => r.gatedMs >= HANG_MS);
if (!bad.length) console.log('  none');
for (const r of bad.slice(0, 20)) {
  console.log(`  iter ${r.i} ${r.scenario.padEnd(22)} gated ${String(r.gatedMs).padStart(6)}ms  ungated ${String(r.ungatedMs).padStart(5)}ms` +
              `  status ${r.gated.status ?? (r.gated.timedOut ? 'NEVER ANSWERED' : r.gated.err)}  blocked=${r.blocked}`);
}

fs.writeFileSync('/root/b-k4/repro-result.json', JSON.stringify({ ITER, HANG_MS, results }, null, 2));
console.log('');
console.log(hangs === 0 && stuck === 0
  ? 'K4_NO_HANG_OBSERVED'
  : `K4_HANG_REPRODUCED  (${hangs} gated fetches over ${HANG_MS}ms, ${stuck} never answered)`);
process.exit(hangs === 0 && stuck === 0 ? 0 : 1);
