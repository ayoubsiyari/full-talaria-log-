/**
 * Reconnaissance before the real-app measurement: log in as QA, load the chart, and find out
 * how the journal tab is actually driven — which globals exist, whether the seeded trades
 * arrive, and what triggers updateJournalTab(). Measuring the wrong surface would be worse
 * than not measuring.
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = fs.readFileSync('/root/b-tal01891/CHROME_PATH', 'utf8').trim();
const BASE = 'http://127.0.0.1:3000';
const env = Object.fromEntries(
  fs.readFileSync('/root/.talaria-test-env', 'utf8').split('\n')
    .filter(l => l.includes('=')).map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i).replace(/^export\s+/, '').trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }));
const SESSION_ID = fs.readFileSync('/root/b-m20j1/QA_SESSION_ID', 'utf8').trim();

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  page.on('console', m => { const t = m.text(); if (/error|fail/i.test(t)) console.log('  [console]', t.slice(0, 160)); });

  console.log('=== log in as the QA account ===');
  await page.goto(`${BASE}/login/`, { waitUntil: 'domcontentloaded' });
  const login = await page.evaluate(async (BASE, email, password) => {
    const r = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify({ email, password }),
    });
    return { status: r.status, body: (await r.text()).slice(0, 200) };
  }, BASE, env.TEST_EMAIL, env.TEST_PASSWORD);
  console.log(`  login http ${login.status}`);
  if (login.status !== 200) { console.log(`  ABORT: ${login.body}`); process.exit(2); }

  // The login page redirects itself once the cookie lands, which destroys the execution context
  // mid-evaluate. Settle on a stable page before asking anything else.
  await new Promise(r => setTimeout(r, 2500));
  await page.goto(`${BASE}/login/`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await new Promise(r => setTimeout(r, 1000));

  const me = await page.evaluate(async (BASE) => {
    const r = await fetch(`${BASE}/api/auth/me`, { credentials: 'include' });
    return { status: r.status, body: (await r.text()).slice(0, 160) };
  }, BASE);
  console.log(`  /api/auth/me http ${me.status}  ${me.body}`);

  console.log('');
  console.log('=== do the seeded trades come back from the API? ===');
  const trades = await page.evaluate(async (BASE, sid) => {
    const r = await fetch(`${BASE}/api/sessions/${sid}/journal-trades`, { credentials: 'include' });
    const txt = await r.text();
    let n = 0, withShot = 0, sample = null;
    try {
      const j = JSON.parse(txt);
      const arr = Array.isArray(j) ? j : (j.trades || j.data || []);
      n = arr.length;
      for (const t of arr) {
        const p = t.payload_json ? JSON.parse(t.payload_json) : t;
        if (typeof p.entryScreenshot === 'string' && p.entryScreenshot.startsWith('data:image')) {
          withShot++;
          if (!sample) sample = { len: p.entryScreenshot.length, head: p.entryScreenshot.slice(0, 40) };
        }
      }
    } catch (e) { return { status: r.status, err: String(e), head: txt.slice(0, 200) }; }
    return { status: r.status, bytes: txt.length, n, withShot, sample };
  }, BASE, SESSION_ID);
  console.log(`  /api/sessions/${SESSION_ID}/journal-trades -> ${JSON.stringify(trades).slice(0, 400)}`);

  console.log('');
  console.log('=== load the chart shell and see what globals exist ===');
  await page.goto(`${BASE}/chart/dist-v9/index.html`, { waitUntil: 'networkidle2', timeout: 90000 }).catch(e => console.log('  nav:', e.message));
  await new Promise(r => setTimeout(r, 6000));
  const globals = await page.evaluate(() => {
    const keys = Object.keys(window).filter(k =>
      /order|journal|manager|chart|replay/i.test(k) && typeof window[k] === 'object' && window[k]);
    const om = window.orderManager || window.OrderManager || null;
    return {
      buildId: window.__TALARIA_CHART_BUILD_ID || null,
      interesting: keys.slice(0, 20),
      hasOrderManager: !!om,
      omMethods: om ? Object.getOwnPropertyNames(Object.getPrototypeOf(om))
        .filter(m => /journal|m20j1|thumb/i.test(m)).slice(0, 20) : [],
      journalTabInDom: !!document.querySelector('[id*="journal" i], [class*="journal" i]'),
      tradeHistoryItems: document.querySelectorAll('.trade-history-item').length,
      imgCount: document.images.length,
    };
  });
  console.log(`  ${JSON.stringify(globals, null, 2).split('\n').join('\n  ')}`);
} finally {
  await browser.close();
}
