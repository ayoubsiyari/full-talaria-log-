/**
 * Before handing the seeded account to anyone, confirm the API actually returns the screenshots.
 * If the endpoint strips or lazily-loads them, a real-app measurement against this account would
 * measure nothing and report a false win.
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
const SID = fs.readFileSync('/root/b-m20j1/QA_SESSION_ID', 'utf8').trim();

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  await page.goto(`${BASE}/login/`, { waitUntil: 'domcontentloaded' });
  const st = await page.evaluate(async (BASE, email, password) => {
    const r = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify({ email, password }),
    });
    return r.status;
  }, BASE, env.TEST_EMAIL, env.TEST_PASSWORD);
  console.log(`login http ${st}`);
  await new Promise(r => setTimeout(r, 2500));
  await page.goto(`${BASE}/login/`, { waitUntil: 'domcontentloaded' }).catch(() => {});

  const out = await page.evaluate(async (BASE, SID) => {
    const r = await fetch(`${BASE}/api/sessions/${SID}/journal-trades`, { credentials: 'include' });
    const txt = await r.text();
    const res = { status: r.status, bytes: txt.length };
    let j; try { j = JSON.parse(txt); } catch (e) { res.parseError = String(e); return res; }
    res.topLevelType = Array.isArray(j) ? 'array' : typeof j;
    res.topLevelKeys = Array.isArray(j) ? null : Object.keys(j).slice(0, 10);
    const arr = Array.isArray(j) ? j : (j.trades || j.data || j.journal_trades || []);
    res.count = arr.length;
    if (arr.length) {
      const first = arr[0];
      res.rowKeys = Object.keys(first).slice(0, 15);
      // the row may BE the trade, or may wrap it in payload_json
      let t = first;
      if (typeof first.payload_json === 'string') { try { t = JSON.parse(first.payload_json); } catch {} }
      else if (first.payload && typeof first.payload === 'object') t = first.payload;
      res.tradeKeysSample = Object.keys(t).filter(k => /shot|image/i.test(k));
      const shot = t.entryScreenshot || t.exitScreenshot;
      res.firstShot = typeof shot === 'string'
        ? { isDataUrl: shot.startsWith('data:image'), length: shot.length, head: shot.slice(0, 32) }
        : { type: typeof shot, value: shot === null ? 'null' : undefined };
      // count across the whole set, handling both shapes
      let withShot = 0, totalShotBytes = 0;
      for (const row of arr) {
        let p = row;
        if (typeof row.payload_json === 'string') { try { p = JSON.parse(row.payload_json); } catch { continue; } }
        for (const k of ['entryScreenshot', 'exitScreenshot']) {
          const v = p[k];
          if (typeof v === 'string' && v.startsWith('data:image')) { withShot++; totalShotBytes += v.length; }
        }
      }
      res.screenshotsFound = withShot;
      res.screenshotBytes = totalShotBytes;
      res.avgShotKB = withShot ? Math.round(totalShotBytes / withShot / 1024) : 0;
    }
    return res;
  }, BASE, SID);

  console.log(JSON.stringify(out, null, 2));
  console.log('');
  const ok = out.screenshotsFound > 0;
  console.log(ok
    ? `SEED_USABLE — ${out.screenshotsFound} real screenshots reach the client, avg ${out.avgShotKB} KB`
    : 'SEED_NOT_USABLE — the API does not return screenshots for this account');
  process.exit(ok ? 0 : 1);
} finally { await browser.close(); }
