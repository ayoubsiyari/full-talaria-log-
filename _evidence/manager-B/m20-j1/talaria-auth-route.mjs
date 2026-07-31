/**
 * The authenticated route into the live product, as a reusable module.
 *
 * Written because D's bounded b120 M1 run returned UNPROVEN_LOGIN_PATH: the build was confirmed but
 * the harness ended on a login redirect, so it never reached a page carrying trades and screenshots.
 * That is the second manager to lose time on this, so it is documented once here rather than solved
 * again per manager.
 *
 * Five things make the difference between landing on the app and landing back on /login/. Each one
 * cost me a run at some point today:
 *
 *   1. You must be ON an origin page before posting the login. A bare fetch from about:blank has no
 *      origin the cookie can attach to.
 *   2. After the login POST, WAIT before navigating. The app redirects on its own; navigating into
 *      that redirect destroys the execution context and the error surfaces as an unrelated
 *      "Execution context was destroyed" or as a login URL at the end.
 *   3. Do not use waitUntil:'networkidle*' on the chart. It holds a websocket and streams, so
 *      networkidle never arrives and the timeout looks like a login failure.
 *   4. Assert the final URL is not the login page. This is exactly D's UNPROVEN_LOGIN_PATH, and
 *      asserting it turns a silent wrong-page into a loud failure.
 *   5. Poll for a readiness fact from the app itself — bars on the chart — not a fixed sleep. A
 *      fixed sleep passes on a blank page.
 *
 * Credentials are read from /root/.talaria-test-env on the host and never inlined, logged, or
 * echoed. Nothing here prints a password.
 */
import fs from 'node:fs';

export const BASE = process.env.BASE || 'http://127.0.0.1:3000';
export const CHROME = () => fs.readFileSync('/root/b-tal01891/CHROME_PATH', 'utf8').trim();

/** A session that actually carries journal trades with screenshots. */
export const JOURNAL_BEARING = {
  sessionId: '936',
  fileId: '677',
  // Measured 2026-07-31: 182 journal trades, all 182 carrying a data:image screenshot, 49 MB of
  // payload_json. The heaviest by an order of magnitude, which is what M1 wants.
  trades: 182,
  tradesWithScreenshot: 182,
};

export function readTestEnv(path = '/root/.talaria-test-env') {
  return Object.fromEntries(
    fs.readFileSync(path, 'utf8')
      .split('\n').filter(Boolean).map((l) => {
        const i = l.indexOf('=');
        return [
          l.slice(0, i).replace(/^export\s+/, '').trim(),
          l.slice(i + 1).replace(/^['"]|['"]$/g, ''),
        ];
      })
  );
}

/**
 * Log in. Returns the login response status so a caller can fail loudly instead of drifting on to a
 * page it cannot read.
 */
export async function login(page, { email, password, base = BASE } = {}) {
  // (1) be on an origin page first
  await page.goto(`${base}/login/`, { waitUntil: 'domcontentloaded' });
  const status = await page.evaluate(async (b, e, p) => {
    const r = await fetch(`${b}/api/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: e, password: p }),
    });
    return r.status;
  }, base, email, password);
  if (status !== 200) throw new Error(`login failed with HTTP ${status}`);
  // (2) let the app's own redirect settle before navigating
  await new Promise((r) => setTimeout(r, 1800));
  return status;
}

/**
 * Open a backtest session and wait for the app to actually be there.
 * Throws with a specific message if the final URL is the login page.
 */
export async function openBacktest(page, {
  sessionId = JOURNAL_BEARING.sessionId,
  fileId = JOURNAL_BEARING.fileId,
  base = BASE,
  timeoutMs = 90000,
} = {}) {
  const url = `${base}/chart/dist-v9/index.html?mode=backtest&sessionId=${sessionId}&fileId=${fileId}`;
  // (3) domcontentloaded, never networkidle
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

  // (5) poll for a fact the app itself reports
  const deadline = Date.now() + timeoutMs;
  let ready = null;
  while (Date.now() < deadline) {
    ready = await page.evaluate(() => {
      const c = window.chart || window.talariaChart;
      const d = c && (c.data || (c.series && c.series.data));
      return {
        href: location.href,
        onLogin: /\/login\/?($|\?)/.test(location.pathname),
        chart: !!c,
        bars: Array.isArray(d) ? d.length : 0,
        build: window.__TALARIA_CHART_BUILD_ID || null,
      };
    }).catch(() => null);
    if (ready && ready.onLogin) {
      // (4) fail loudly, and say which of the five it is
      throw new Error('UNPROVEN_LOGIN_PATH: landed on the login page. The login POST returned 200 '
        + 'but the session did not stick — usually step 1 (not on an origin page) or step 2 '
        + '(navigated into the redirect).');
    }
    if (ready && ready.chart && ready.bars > 0) return ready;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`chart never became ready: ${JSON.stringify(ready)}`);
}

/**
 * Read the journal the way the product does, so a caller can assert it is really journal-bearing
 * rather than assume it from the session id.
 */
export async function readJournal(page, { sessionId = JOURNAL_BEARING.sessionId } = {}) {
  return page.evaluate(async (sid) => {
    // Two endpoints serve this. The per-session one is the canonical read; both are gated by
    // _require_paid_journal_user, so a 402/403 here means the ACCOUNT lacks journal access rather
    // than the route being wrong — a distinction worth keeping, because they look identical from a
    // harness that only checks for a page.
    const tried = [];
    for (const path of [
      `/api/sessions/${sid}/journal-trades`,
      `/api/journal-trades?session_id=${sid}`,
    ]) {
      const res = await fetch(path, { credentials: 'include', cache: 'no-store' }).catch(() => null);
      if (!res) { tried.push({ path, error: 'fetch failed' }); continue; }
      if (!res.ok) { tried.push({ path, status: res.status }); continue; }
      const data = await res.json().catch(() => null);
      const list = Array.isArray(data) ? data : (data && (data.trades || data.items)) || [];
      const text = JSON.stringify(list);
      return {
        path,
        status: res.status,
        trades: list.length,
        withScreenshot: (text.match(/data:image/g) || []).length,
        payloadBytes: text.length,
        tried,
      };
    }
    return { error: 'no journal endpoint answered', tried };
  }, sessionId);
}
