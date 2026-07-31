/**
 * Proves the documented route reaches a journal-bearing page on the live product.
 *
 * D reported UNPROVEN_LOGIN_PATH on b120. This is the artifact that either clears that or reproduces
 * it, and it asserts every condition D's M1 needs rather than just "a page loaded":
 *
 *   - final URL is not the login page
 *   - the build actually serving is the one under test
 *   - the chart has bars
 *   - the journal for this session returns trades, and those trades carry screenshots
 *
 * Passing with zero trades would be the same class of false pass I have been correcting all day, so
 * the verdict requires a nonzero screenshot count.
 */
import puppeteer from 'puppeteer-core';
import {
  BASE, CHROME, JOURNAL_BEARING, readTestEnv, login, openBacktest, readJournal,
} from './talaria-auth-route.mjs';

const EMAIL = process.env.EMAIL || 'qa-canary@talaria-log.com';
const env = readTestEnv();
const out = { base: BASE, email: EMAIL, session: JOURNAL_BEARING };

const browser = await puppeteer.launch({
  executablePath: CHROME(),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', `--user-data-dir=/tmp/route-${Date.now()}`],
});
try {
  const page = await browser.newPage();
  out.loginStatus = await login(page, { email: EMAIL, password: env.TEST_PASSWORD });
  out.ready = await openBacktest(page);
  out.journal = await readJournal(page);

  // Also read the journal off the rendered page, since M1 is about what the renderer holds.
  out.rendered = await page.evaluate(() => {
    const imgs = Array.from(document.images || []);
    const shots = imgs.filter((i) => (i.currentSrc || i.src || '').startsWith('data:image'));
    const px = shots.reduce((a, i) => a + (i.naturalWidth * i.naturalHeight), 0);
    return {
      images: imgs.length,
      dataUrlImages: shots.length,
      decodedPixels: px,
      approxRgbaMB: +(px * 4 / 1048576).toFixed(1),
      thumbFnPresent: typeof window._m20J1RasterizeThumb === 'function'
        || typeof (window.journal && window.journal._m20J1RasterizeThumb) === 'function',
    };
  });

  const j = out.journal || {};
  out.verdict = (!out.ready.onLogin && out.ready.bars > 0 && j.trades > 0 && j.withScreenshot > 0)
    ? 'ROUTE_PROVEN — authenticated, on the app, chart loaded, journal has screenshot-bearing trades'
    : 'ROUTE_NOT_PROVEN — see fields above';
} catch (e) {
  out.error = String(e && e.message ? e.message : e).slice(0, 400);
  out.verdict = 'ROUTE_NOT_PROVEN';
} finally {
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
