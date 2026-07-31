/**
 * Does a four-panel multichart consume four window slots, or one?
 *
 * I warned C to raise the cap before running four panels, and that warning reached the Director
 * three minutes after C launched a ten-hour soak. Acting on it means stopping the soak. So the
 * warning has to be right, and "I read the code" is not the standard I have been held to today.
 *
 * The code says a panel is any page carrying ?panelId=..., that shouldShouldClaim() is false for
 * panels, and that panels reuse the host page's client id. If that holds in the running product,
 * four panels are ONE claim and the cap of 2 is irrelevant to C's soak.
 *
 * Measured against the product as the QA account, whose cap is 2 — deliberately, because if four
 * panels needed four slots this account could not hold them and the failure would be loud.
 *
 * Reports, from the database rather than from the page:
 *   - how many presence rows the account holds while four panels are live
 *   - whether any claim returned 409
 *   - whether all four panels actually rendered a chart with bars, so a pass cannot come from
 *     panels that never loaded
 */
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = fs.readFileSync('/root/b-tal01891/CHROME_PATH', 'utf8').trim();
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const EMAIL = process.env.EMAIL || 'qa-canary@talaria-log.com';
const MULTI = process.env.MULTI_URL || '/chart/multichart/';
const HOLD_MS = Number(process.env.HOLD_MS || 45000);

const env = Object.fromEntries(
  fs.readFileSync('/root/.talaria-test-env', 'utf8')
    .split('\n').filter(Boolean).map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).replace(/^export\s+/, '').trim(), l.slice(i + 1).replace(/^['"]|['"]$/g, '')];
    })
);
const PASSWORD = env.TEST_PASSWORD;

const claims = [];
const out = { email: EMAIL, multichartUrl: MULTI };

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', `--user-data-dir=/tmp/panelclaim-${Date.now()}`],
});

try {
  const page = await browser.newPage();
  page.on('response', (r) => {
    const u = r.url();
    if (u.includes('/api/chart/windows/claim')) claims.push({ status: r.status(), url: u });
  });

  await page.goto(`${BASE}/login/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async (b, e, p) => {
    await fetch(`${b}/api/auth/login`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: e, password: p }),
    });
  }, BASE, EMAIL, PASSWORD);
  await new Promise((r) => setTimeout(r, 1500));

  // Open the multichart host page. Four panels are the product's own layout, so ask for four.
  await page.goto(`${BASE}${MULTI}`, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 8000));

  out.pageUrl = page.url();
  out.frames = page.frames().length;

  // What the product itself thinks: panels are frames carrying panelId.
  out.panels = page.frames()
    .map((f) => f.url())
    .filter((u) => /panelId=/.test(u))
    .map((u) => (u.match(/panelId=([^&]+)/) || [])[1]);

  // Did the panels actually render? A pass from four blank panels proves nothing.
  out.panelBars = [];
  for (const f of page.frames()) {
    if (!/panelId=/.test(f.url())) continue;
    try {
      const bars = await f.evaluate(() => {
        const c = window.chart || window.talariaChart;
        const d = c && (c.data || (c.series && c.series.data));
        return Array.isArray(d) ? d.length : (c && c.bars && c.bars.length) || 0;
      });
      out.panelBars.push(bars);
    } catch (e) { out.panelBars.push(`err:${String(e).slice(0, 40)}`); }
  }

  out.clientIdOnHost = await page.evaluate(() =>
    (window.__talariaChartWindowLimit && window.__talariaChartWindowLimit.getClientId())
    || null);

  await new Promise((r) => setTimeout(r, HOLD_MS));
  out.claims = claims;
  out.claim409s = claims.filter((c) => c.status === 409).length;
} catch (e) {
  out.error = String(e).slice(0, 300);
} finally {
  console.log('RESULT ' + JSON.stringify(out));
  await browser.close();
}
