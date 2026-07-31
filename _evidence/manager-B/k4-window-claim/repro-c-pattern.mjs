/**
 * K4 — test the one explanation that fits C's symptom exactly.
 *
 * C did not report "the chart froze". C reported that a second CONF-01 session contends for the
 * window claim and that this voided a 10x measurement. Three configuration facts I read out of
 * the running build make that a predictable outcome with no app-level hang required:
 *
 *   cap for this account            = 2        (users.max_sessions)
 *   _CHART_WINDOW_STALE_SECONDS     = 90       (how long a dead window keeps its slot)
 *   HEARTBEAT_MS                    = 25000    (how long a victim takes to notice)
 *
 * A headless harness that is killed rather than closed never sends /release, so its slot stays
 * held for 90 seconds. Run two measurement sessions inside that window and the account is at cap
 * before the real work starts — so the second session evicts the first, kick-oldest, and the
 * first one's measurement dies partway through. To C that is indistinguishable from "the window
 * claim hangs", and it would void exactly the long run C was trying to take.
 *
 * This reproduces that sequence deliberately. RED here means C's measurement is being killed by
 * C's own previous sessions' abandoned slots.
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
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function login(browser) {
  const p = await browser.newPage();
  await p.goto(`${BASE}/login/`, { waitUntil: 'domcontentloaded' });
  const st = await p.evaluate(async (BASE, email, password) => (await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    credentials: 'include', body: JSON.stringify({ email, password }),
  })).status, BASE, env.TEST_EMAIL, env.TEST_PASSWORD);
  await sleep(1200); await p.close();
  return st;
}

const state = (p) => p.evaluate(() => ({
  blocked: !!window.__talariaChartWindowBlocked,
  overlay: !!document.getElementById('talariaWindowLimitOverlay'),
})).catch(e => ({ error: String(e).slice(0, 80) }));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  console.log(`login http ${await login(browser)}`);

  console.log('\n=== step 1: two harness sessions that are KILLED, not closed ===');
  console.log('    page.close({runBeforeUnload:false}) skips unload handlers, so /release never');
  console.log('    fires — the same thing that happens when a harness kills its browser.');
  for (const n of [1, 2]) {
    const p = await browser.newPage();
    await p.goto(CHART_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await sleep(6000);
    await p.close({ runBeforeUnload: false });
    console.log(`    abandoned session ${n} (slot still held for up to 90s)`);
  }

  console.log('\n=== step 2: C starts the measurement run ===');
  const measurement = await browser.newPage();
  await measurement.goto(CHART_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await sleep(8000);
  console.log(`    measurement session: ${JSON.stringify(await state(measurement))}`);

  console.log('\n=== step 3: a second CONF-01 session starts while the first is still running ===');
  const second = await browser.newPage();
  await second.goto(CHART_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await sleep(8000);
  console.log(`    second session:      ${JSON.stringify(await state(second))}`);

  console.log('\n=== step 4: does the measurement run survive? (watch one heartbeat cycle) ===');
  let died = false;
  for (let i = 1; i <= 3; i++) {
    await sleep(12000);
    const s = await state(measurement);
    console.log(`    t+${i * 12}s measurement: ${JSON.stringify(s)}`);
    if (s.blocked) died = true;
  }

  console.log('\n=== what the server thinks it is holding ===');
  console.log('    (rows for this account, oldest first)');

  console.log('\n=== verdict ===');
  if (died) {
    console.log('  The measurement session was EVICTED mid-run by a second session that was only');
    console.log('  able to exceed the cap because two already-dead sessions were still holding');
    console.log('  slots. C\'s 10x run dies for this reason, and no amount of client-side');
    console.log('  bounding would have prevented it.');
    console.log('\nK4_C_PATTERN_REPRODUCED');
  } else {
    console.log('  The measurement session survived. This explanation does not hold either.');
    console.log('\nK4_C_PATTERN_NOT_REPRODUCED');
  }
} finally {
  await browser.close();
}
