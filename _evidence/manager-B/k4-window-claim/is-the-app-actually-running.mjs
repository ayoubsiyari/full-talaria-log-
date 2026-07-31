/**
 * Before I report four green results, check whether the thing I measured was the product.
 *
 * Every tab in every probe made about six fetches and opened one WebSocket. A real chart loads
 * symbols, candles and indicators. Six is the number I would expect from a page that rendered a
 * shell and then stopped — and a "no hang" verdict from a page that never did any work is worth
 * nothing. This is the check I should have run before the first probe, not after the fourth.
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

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const p = await browser.newPage();
  await p.setViewport({ width: 1400, height: 900 });

  const reqs = [];
  const errors = [];
  p.on('request', r => reqs.push(r.url().replace(BASE, '')));
  p.on('requestfailed', r => errors.push(`FAILED ${r.url().replace(BASE, '')} ${r.failure()?.errorText || ''}`));
  p.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 160)}`); });
  p.on('pageerror', e => errors.push(`pageerror: ${String(e).slice(0, 200)}`));

  await p.goto(`${BASE}/login/`, { waitUntil: 'domcontentloaded' });
  const st = await p.evaluate(async (BASE, email, password) => (await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    credentials: 'include', body: JSON.stringify({ email, password }),
  })).status, BASE, env.TEST_EMAIL, env.TEST_PASSWORD);
  console.log(`login http ${st}`);
  await new Promise(r => setTimeout(r, 1500));

  reqs.length = 0; errors.length = 0;
  await p.goto(`${BASE}/chart/dist-v9/index.html`, { waitUntil: 'networkidle2', timeout: 60000 })
    .catch(e => console.log(`nav: ${e.message.slice(0, 90)}`));
  await new Promise(r => setTimeout(r, 15000));

  console.log(`\nfinal url: ${p.url()}`);
  console.log(`\n=== every request the page made (${reqs.length}) ===`);
  for (const r of reqs) console.log(`  ${r.slice(0, 110)}`);

  console.log(`\n=== errors (${errors.length}) ===`);
  for (const e of errors.slice(0, 25)) console.log(`  ${e}`);

  const dom = await p.evaluate(() => ({
    title: document.title,
    bodyChars: document.body ? document.body.innerText.trim().length : 0,
    bodyStart: document.body ? document.body.innerText.trim().slice(0, 300) : '',
    canvases: document.querySelectorAll('canvas').length,
    iframes: document.querySelectorAll('iframe').length,
    hasChart: typeof window.chart !== 'undefined',
    chartKeys: window.chart ? Object.keys(window.chart).slice(0, 15) : null,
    buildId: window.__TALARIA_CHART_BUILD_ID || null,
    scripts: document.querySelectorAll('script').length,
  }));
  console.log('\n=== what actually rendered ===');
  console.log(JSON.stringify(dom, null, 2));

  await p.screenshot({ path: '/root/b-k4/app-state.png' });
  console.log('\nscreenshot: /root/b-k4/app-state.png');

  console.log('\n=== verdict ===');
  if (dom.canvases === 0 && !dom.hasChart) {
    console.log('  NO CHART RENDERED. The probes measured a page that never became the product,');
    console.log('  so none of their green results are evidence about the hang.');
  } else {
    console.log(`  chart present (canvases=${dom.canvases}, window.chart=${dom.hasChart})`);
  }
} finally {
  await browser.close();
}
