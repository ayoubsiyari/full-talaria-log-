/**
 * Two loose ends from the source-map sweep:
 *
 * 1. Requests for .map files return HTTP 200 although no .map exists anywhere on disk. Either something
 *    generates them, or there is a catch-all returning 200 for missing assets. The second is worth
 *    knowing about on its own: a 200-for-everything fallback turns every future missing-asset bug into a
 *    silent one, and it is the same trap as reading empty output as success.
 *
 * 2. If there are no maps, what IS the script weight the page retains? The Director's concern was tens of
 *    megabytes of retained string. Answering "no maps" is only half of it; the other half is the number.
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { login, openBacktest, JOURNAL_BEARING } from './m20-j1/talaria-auth-route.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const CHROME = fs.readFileSync('/root/b-tal01891/CHROME_PATH', 'utf8').trim();
const env = Object.fromEntries(
  fs.readFileSync('/root/.talaria-test-env', 'utf8').split('\n')
    .filter((l) => l.includes('=')).map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).replace(/^export\s+/, '').trim(),
        l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const lp = await browser.newPage();
  await login(lp, { email: env.TEST_EMAIL, password: env.TEST_PASSWORD, base: BASE });

  console.log('=== what do the .map 200s actually return? ===');
  for (const u of ['/chart/chart.js.map', '/chart/modules/order-manager.js.map',
                   '/chart/definitely-not-a-real-file-xyz.js']) {
    const r = await lp.evaluate(async (url) => {
      const res = await fetch(url);
      const t = await res.text();
      return { status: res.status, ct: res.headers.get('content-type'), len: t.length,
               head: t.slice(0, 60).replace(/\s+/g, ' ') };
    }, u);
    console.log(`  ${r.status}  ${String(r.ct).slice(0, 40).padEnd(40)} ${String(r.len).padStart(8)} bytes  ${u}`);
    console.log(`        starts: ${r.head}`);
  }
  await lp.close();

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 950 });
  const ready = await openBacktest(page, {
    base: BASE, sessionId: JOURNAL_BEARING.sessionId, fileId: JOURNAL_BEARING.fileId, timeoutMs: 90000,
  });
  console.log('\nready: ' + JSON.stringify(ready));

  const R = await page.evaluate(() => {
    const res = performance.getEntriesByType('resource');
    const scripts = res.filter((r) => r.initiatorType === 'script' || /\.js(\?|$)/.test(r.name));
    const css = res.filter((r) => /\.css(\?|$)/.test(r.name));
    const sum = (a, k) => a.reduce((s, r) => s + (r[k] || 0), 0);
    const top = scripts.slice().sort((a, b) => (b.decodedBodySize || 0) - (a.decodedBodySize || 0))
      .slice(0, 8).map((r) => ({ n: r.name.split('/').pop().split('?')[0],
                                 kb: Math.round((r.decodedBodySize || 0) / 1024) }));
    return {
      scriptCount: scripts.length,
      scriptDecodedMB: +(sum(scripts, 'decodedBodySize') / 1048576).toFixed(2),
      scriptTransferMB: +(sum(scripts, 'transferSize') / 1048576).toFixed(2),
      cssCount: css.length,
      cssDecodedMB: +(sum(css, 'decodedBodySize') / 1048576).toFixed(2),
      anyMapRequested: res.filter((r) => /\.map(\?|$)/.test(r.name)).map((r) => r.name),
      totalResources: res.length,
      top,
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
      heapLimitMB: performance.memory ? +(performance.memory.jsHeapSizeLimit / 1048576).toFixed(0) : null,
    };
  });

  console.log('\n=== script weight actually pulled by the real page ===');
  console.log(`  scripts:      ${R.scriptCount} files, ${R.scriptDecodedMB} MB decoded, ${R.scriptTransferMB} MB transferred`);
  console.log(`  css:          ${R.cssCount} files, ${R.cssDecodedMB} MB decoded`);
  console.log(`  resources:    ${R.totalResources} total`);
  console.log(`  JS heap:      ${R.heapMB} MB used of ${R.heapLimitMB} MB limit`);
  console.log(`  .map requested by the page: ${R.anyMapRequested.length ? R.anyMapRequested.join(', ') : 'none'}`);
  console.log('\n  heaviest scripts:');
  for (const s of R.top || []) console.log(`    ${String(s.kb).padStart(6)} KB  ${s.n}`);
} catch (e) {
  console.log('ERROR ' + String(e && e.stack ? e.stack : e).slice(0, 600));
} finally {
  await browser.close();
}
