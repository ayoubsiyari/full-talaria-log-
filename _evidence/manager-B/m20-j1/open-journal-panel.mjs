/**
 * The route is proven and the journal API returns 182 trades with 395 screenshots. But the DOM held
 * zero data-url images, and what M1 measures is what the RENDERER holds — so a proven route that
 * never opens the journal panel still leaves D unable to measure.
 *
 * This finds the product's own journal control and clicks it, then reports decoded pixels held.
 * Reporting the control it clicked matters: if it clicks the wrong thing and the count stays zero,
 * that has to be distinguishable from "the fix works and nothing is held".
 */
import puppeteer from 'puppeteer-core';
import { BASE, CHROME, readTestEnv, login, openBacktest } from './talaria-auth-route.mjs';

const EMAIL = process.env.EMAIL || 'qa-canary@talaria-log.com';
const env = readTestEnv();
const out = {};

const measure = () => ({
  images: (document.images || []).length,
  dataUrlImages: Array.from(document.images || [])
    .filter((i) => (i.currentSrc || i.src || '').startsWith('data:image')).length,
  decodedPixels: Array.from(document.images || [])
    .filter((i) => (i.currentSrc || i.src || '').startsWith('data:image'))
    .reduce((a, i) => a + i.naturalWidth * i.naturalHeight, 0),
});

const browser = await puppeteer.launch({
  executablePath: CHROME(),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', `--user-data-dir=/tmp/journalpanel-${Date.now()}`],
});
try {
  const page = await browser.newPage();
  await login(page, { email: EMAIL, password: env.TEST_PASSWORD });
  out.ready = await openBacktest(page);
  out.before = await page.evaluate(measure);

  // Every plausible journal control the product exposes, described so a failure is legible.
  out.candidates = await page.evaluate(() => {
    const hits = [];
    const all = Array.from(document.querySelectorAll('button, [role="tab"], [role="button"], a, .tab, [data-tab], [data-panel]'));
    for (const el of all) {
      const label = [
        el.textContent, el.getAttribute('title'), el.getAttribute('aria-label'),
        el.getAttribute('data-tab'), el.getAttribute('data-panel'), el.id, el.className,
      ].filter(Boolean).join(' ');
      if (/journal|trades|trade\s*log/i.test(label)) {
        hits.push({
          tag: el.tagName,
          text: (el.textContent || '').trim().slice(0, 40),
          id: el.id || null,
          cls: (typeof el.className === 'string' ? el.className : '').slice(0, 60),
          visible: !!(el.offsetParent || el.getClientRects().length),
        });
      }
    }
    return hits.slice(0, 15);
  });

  out.clicked = [];
  for (let i = 0; i < out.candidates.length; i += 1) {
    if (!out.candidates[i].visible) continue;
    const desc = out.candidates[i];
    const ok = await page.evaluate((idx) => {
      const all = Array.from(document.querySelectorAll('button, [role="tab"], [role="button"], a, .tab, [data-tab], [data-panel]'));
      const matches = all.filter((el) => {
        const label = [
          el.textContent, el.getAttribute('title'), el.getAttribute('aria-label'),
          el.getAttribute('data-tab'), el.getAttribute('data-panel'), el.id, el.className,
        ].filter(Boolean).join(' ');
        return /journal|trades|trade\s*log/i.test(label)
          && !!(el.offsetParent || el.getClientRects().length);
      });
      const el = matches[idx];
      if (!el) return false;
      el.click();
      return true;
    }, out.clicked.length).catch(() => false);
    if (!ok) continue;
    await new Promise((r) => setTimeout(r, 4000));
    const m = await page.evaluate(measure);
    out.clicked.push({ ...desc, afterClick: m });
    if (m.dataUrlImages > 0) break;
  }

  out.after = await page.evaluate(measure);
  out.after.approxRgbaMB = +(out.after.decodedPixels * 4 / 1048576).toFixed(1);
  out.verdict = out.after.dataUrlImages > 0
    ? `JOURNAL_RENDERED — ${out.after.dataUrlImages} screenshot images decoded, ~${out.after.approxRgbaMB} MB RGBA held`
    : 'JOURNAL_NOT_RENDERED — no data-url image reached the DOM; see candidates/clicked to tell a '
      + 'wrong-control miss from a genuine zero';
} catch (e) {
  out.error = String(e && e.message ? e.message : e).slice(0, 300);
  out.verdict = 'FAILED';
} finally {
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
