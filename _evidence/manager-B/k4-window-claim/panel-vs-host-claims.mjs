/**
 * Does a page carrying ?panelId= claim a window slot, or reuse the host's?
 *
 * This is the fact my warning to C rests on, and acting on that warning means stopping a ten-hour
 * soak. Two pages, same account, same shell, one difference:
 *
 *   A: /chart/dist-v9/index.html               -> expect 1 claim  (a real chart window)
 *   B: /chart/dist-v9/index.html?panelId=p2    -> expect 0 claims (a multichart panel)
 *
 * If B claims nothing, four multichart panels consume one slot between them and the cap of 2 was
 * never the constraint on C's soak.
 */
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = fs.readFileSync('/root/b-tal01891/CHROME_PATH', 'utf8').trim();
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const EMAIL = process.env.EMAIL || 'qa-canary@talaria-log.com';
const SHELL = '/chart/dist-v9/index.html';

const env = Object.fromEntries(
  fs.readFileSync('/root/.talaria-test-env', 'utf8')
    .split('\n').filter(Boolean).map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).replace(/^export\s+/, '').trim(), l.slice(i + 1).replace(/^['"]|['"]$/g, '')];
    })
);

async function run(browser, label, path) {
  const page = await browser.newPage();
  const claims = [];
  page.on('response', (r) => {
    if (r.url().includes('/api/chart/windows/claim')) claims.push(r.status());
  });
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 9000));
  const info = await page.evaluate(() => ({
    isPanelByUrl: /panelId=/.test(location.search),
    clientId: (window.__talariaChartWindowLimit
      && window.__talariaChartWindowLimit.getClientId
      && window.__talariaChartWindowLimit.getClientId()) || null,
    blocked: !!window.__talariaChartWindowBlocked,
  })).catch((e) => ({ err: String(e).slice(0, 80) }));
  await page.close();
  return { label, path, claims, claimCount: claims.length, ...info };
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', `--user-data-dir=/tmp/panelvshost-${Date.now()}`],
});
const out = {};
try {
  const login = await browser.newPage();
  await login.goto(`${BASE}/login/`, { waitUntil: 'domcontentloaded' });
  await login.evaluate(async (b, e, p) => {
    await fetch(`${b}/api/auth/login`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: e, password: p }),
    });
  }, BASE, EMAIL, env.TEST_PASSWORD);
  await new Promise((r) => setTimeout(r, 1200));
  await login.close();

  out.host = await run(browser, 'top-level chart window', SHELL);
  out.panel = await run(browser, 'multichart panel', `${SHELL}?panelId=p2`);
  out.verdict = (out.host.claimCount >= 1 && out.panel.claimCount === 0)
    ? 'PANELS_DO_NOT_CLAIM — N panels consume ONE slot; the cap does not bound panel count'
    : 'PANELS_DO_CLAIM_OR_INCONCLUSIVE — the cap bounds panel count; raising it was necessary';
} catch (e) {
  out.error = String(e).slice(0, 300);
} finally {
  console.log('HOST   ' + JSON.stringify(out.host || null));
  console.log('PANEL  ' + JSON.stringify(out.panel || null));
  console.log('VERDICT ' + (out.verdict || out.error));
  await browser.close();
}
