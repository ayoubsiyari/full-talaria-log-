/**
 * K4 — a hang test that can FAIL, and proof that it can.
 *
 * A first pass ran the user's reproduction against b118 and saw no hang: 24 gated fetches, worst
 * 780 ms. That result is worth nothing on its own, and it is the exact shape of the false green I
 * already published once on this ticket — "I looked, it seemed fine". Two things have to be true
 * before "no hang" is evidence:
 *
 *   1. the reproduction must actually ENTER the defect's path. The deadlock needs a 409 with a
 *      kicked detail on the FIRST claim. If no claim ever returned 409, nothing was tested, and a
 *      green is vacuous however many iterations it ran.
 *
 *   2. the instrument must be ABLE to see the hang. If this harness cannot detect the defect even
 *      on code that certainly has it, then it cannot certify code that does not.
 *
 * Both are checkable, because the fix shipped a climbing kill-switch:
 * `__TALARIA_DISABLE_CLAIM_RETRY_DEADLOCK_FIX_V1` restores the self-referential retry — the
 * original bug — on the same build. So:
 *
 *   BROKEN arm  flag set    -> the deadlock is back. The harness MUST hang here, or the harness
 *                              is blind and its green arm is meaningless.
 *   FIXED  arm  flag unset  -> shipped behaviour. Must not hang.
 *
 * Same build, same account, same scenario, one flag apart. Claim responses are counted in both so
 * the 409 path is shown to have been entered rather than assumed.
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = fs.readFileSync('/root/b-tal01891/CHROME_PATH', 'utf8').trim();
const BASE = 'http://127.0.0.1:3000';
const ITER = Number(process.env.ITER || 5);
const HANG_MS = Number(process.env.HANG_MS || 3000);
const CAP_MS = Number(process.env.CAP_MS || 25000);

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

/** Open a chart tab, optionally with the deadlock restored before any module runs. */
async function openChart(browser, restoreDeadlock, claimLog) {
  const p = await browser.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  if (restoreDeadlock) {
    await p.evaluateOnNewDocument(() => {
      window.__TALARIA_DISABLE_CLAIM_RETRY_DEADLOCK_FIX_V1 = true;
    });
  }
  // Count every claim POST and its status: this is how we prove the 409 path was entered.
  p.on('response', async (res) => {
    try {
      const u = new URL(res.url());
      if (u.pathname === '/api/chart/windows/claim') {
        let code = '';
        try { const j = await res.json(); code = (j && j.detail && j.detail.code) || ''; } catch {}
        claimLog.push({ status: res.status(), code });
      }
    } catch {}
  });
  await p.goto(`${BASE}/chart/dist-v9/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  return p;
}

async function timeGate(page, fileId) {
  return page.evaluate(async (BASE, fileId, CAP_MS) => {
    const t = () => performance.now();
    const withCap = (p) => Promise.race([
      p.then(r => ({ ok: true, status: r.status })).catch(e => ({ ok: false, err: String(e) })),
      new Promise(res => setTimeout(() => res({ ok: false, timedOut: true }), CAP_MS)),
    ]);
    const g0 = t();
    const gated = await withCap(
      fetch(`${BASE}/api/file/${fileId}/bars?resolution=1m&limit=10`, { credentials: 'include' }));
    const gatedMs = t() - g0;
    const u0 = t();
    const ungated = await withCap(fetch(`${BASE}/api/auth/me`, { credentials: 'include' }));
    const ungatedMs = t() - u0;
    return { gatedMs: Math.round(gatedMs), gated, ungatedMs: Math.round(ungatedMs), ungated,
             flagSet: !!window.__TALARIA_DISABLE_CLAIM_RETRY_DEADLOCK_FIX_V1 };
  }, BASE, fileId, CAP_MS);
}

/** One arm: the user's reproduction — a claimed tab, reloaded, then a second tab. */
async function runArm(label, restoreDeadlock, fileId) {
  const rows = [];
  const claims = [];
  const browser = await launch();
  try {
    const st = await login(browser);
    if (st !== 200) throw new Error(`login ${st}`);
    for (let i = 1; i <= ITER; i++) {
      const p1 = await openChart(browser, restoreDeadlock, claims);
      await new Promise(r => setTimeout(r, 900));
      await p1.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
      rows.push({ i, where: 'reload', ...(await timeGate(p1, fileId)) });

      const p2 = await openChart(browser, restoreDeadlock, claims);   // second window: forces 409
      rows.push({ i, where: 'second tab', ...(await timeGate(p2, fileId)) });
      rows.push({ i, where: 'first after', ...(await timeGate(p1, fileId)) });

      await p2.close(); await p1.close();
    }
  } finally { await browser.close(); }

  const g = rows.map(r => r.gatedMs).sort((a, b) => a - b);
  const over = rows.filter(r => r.gatedMs >= HANG_MS);
  const never = rows.filter(r => r.gated && r.gated.timedOut);
  const kicked = claims.filter(c => c.status === 409).length;
  return {
    label, rows, claims,
    med: g[Math.floor(g.length / 2)], max: g[g.length - 1],
    over: over.length, never: never.length, total: rows.length,
    claimTotal: claims.length, claim409: kicked,
    statuses: claims.reduce((a, c) => { a[c.status] = (a[c.status] || 0) + 1; return a; }, {}),
  };
}

const b0 = await launch();
const stLogin = await login(b0);
const fileId = await pickFileId(b0);
await b0.close();
console.log(`login http ${stLogin}   fileId ${fileId}`);
if (stLogin !== 200 || !fileId) { console.log('ABORT: cannot set up'); process.exit(2); }
console.log(`${ITER} iterations per arm; a gated fetch at or over ${HANG_MS}ms is a hang`);
console.log('');

console.log('=== arm BROKEN — deadlock restored via the climbing kill-switch ===');
console.log('    (this arm MUST hang; if it does not, the harness cannot see the defect)');
const broken = await runArm('BROKEN', true, fileId);
console.log(`  claims: ${broken.claimTotal} (${JSON.stringify(broken.statuses)})  409s: ${broken.claim409}`);
console.log(`  gated median ${broken.med}ms  max ${broken.max}ms  over ${HANG_MS}ms: ${broken.over}/${broken.total}  never answered: ${broken.never}`);

console.log('');
console.log('=== arm FIXED — shipped b118 behaviour ===');
const fixed = await runArm('FIXED', false, fileId);
console.log(`  claims: ${fixed.claimTotal} (${JSON.stringify(fixed.statuses)})  409s: ${fixed.claim409}`);
console.log(`  gated median ${fixed.med}ms  max ${fixed.max}ms  over ${HANG_MS}ms: ${fixed.over}/${fixed.total}  never answered: ${fixed.never}`);

console.log('');
console.log('=== verdict ===');
const enteredPath = broken.claim409 > 0 && fixed.claim409 > 0;
const harnessCanSee = broken.over > 0 || broken.never > 0;
const fixedIsClean  = fixed.over === 0 && fixed.never === 0;

console.log(`  the 409-kicked path was actually entered in both arms : ${enteredPath}  (broken ${broken.claim409}, fixed ${fixed.claim409})`);
console.log(`  the harness CAN detect the hang (broken arm hangs)    : ${harnessCanSee}`);
console.log(`  the shipped build does not hang                       : ${fixedIsClean}`);
console.log('');

if (!enteredPath) {
  console.log('K4_INCONCLUSIVE — no 409 on claim, so the defect path was never exercised.');
  console.log('  Do not cite this run. The scenario needs to produce a kicked first claim.');
  process.exit(3);
}
if (!harnessCanSee) {
  console.log('K4_INCONCLUSIVE — the broken arm did not hang, so this harness is blind.');
  console.log('  A green from a blind instrument is exactly the false green already published once.');
  process.exit(3);
}
console.log(fixedIsClean
  ? 'K4_HANG_STOPPED — the harness demonstrably catches the hang, and the shipped build does not hang.'
  : 'K4_STILL_HANGS — the shipped build hangs. The P0 is not fixed.');

fs.writeFileSync('/root/b-k4/discriminating-result.json',
  JSON.stringify({ ITER, HANG_MS, broken, fixed }, null, 2));
process.exit(fixedIsClean ? 0 : 1);
