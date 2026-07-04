/**
 * Automated multichart-prototype test (headless Chrome via puppeteer).
 *
 * Verifies against the stub API server:
 *   1. Initial load       — bars appear, exactly ONE /bars fetch for 2 panels
 *   2. Pan-left history   — one shared fetch extends BOTH panels, data stays
 *                           contiguous (no gaps / duplicates)
 *   3. Movement sync      — panel B's viewport mirrors panel A and vice versa
 *   4. TF switch          — 5m loads once; switching back to 1m is 0 fetches
 *   5. Repeated pan-left  — 3 more pages, still 1 fetch each, still contiguous
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import puppeteer from 'puppeteer';

const PORT = 8971;
const URL = `http://localhost:${PORT}/chart/multichart-prod/lwc-proto.html?fileId=25&panels=2`;

let pass = 0;
let fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}

async function waitFor(page, fn, timeoutMs = 15000, label = 'condition') {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await page.evaluate(fn)) return true;
    await sleep(120);
  }
  throw new Error(`timeout waiting for ${label}`);
}

const server = spawn(process.execPath, ['serve.mjs'], { stdio: ['ignore', 'pipe', 'pipe'] });
server.stdout.on('data', (d) => process.stdout.write('[stub] ' + d));
server.stderr.on('data', (d) => process.stderr.write('[stub-err] ' + d));

try {
  await sleep(700); // let the stub bind

  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 800 });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push(msg.text());
  });

  console.log('\n== 1. Initial load ==');
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await waitFor(page, () => window.__lwcProto && window.__lwcProto.bars() > 0, 15000, 'initial bars');
  let s = await page.evaluate(() => ({
    bars: window.__lwcProto.bars(),
    fetches: window.__lwcProto.fetchCount(),
    panels: window.__lwcProto.panels.length,
  }));
  check('2 panels created', s.panels === 2);
  check(`bars loaded (${s.bars})`, s.bars > 1500);
  check(`exactly 1 /bars fetch for 2 panels (got ${s.fetches})`, s.fetches === 1);

  console.log('\n== 2. Pan left on panel A → shared history fetch ==');
  const barsBefore = s.bars;
  await page.evaluate(() => {
    // simulate dragging panel A far into unloaded history
    window.__lwcProto.panels[0].chart.timeScale().setVisibleLogicalRange({ from: -40, to: 160 });
  });
  await waitFor(page, `window.__lwcProto.bars() > ${barsBefore}`, 15000, 'history extend');
  // small settle for the second panel's setData
  await sleep(300);
  s = await page.evaluate(() => ({
    bars: window.__lwcProto.bars(),
    fetches: window.__lwcProto.fetchCount(),
    ranges: window.__lwcProto.ranges(),
    contiguous: (function () {
      const b = window.__lwcProto.services[window.__lwcProto.tf()].bars;
      for (let i = 1; i < b.length; i++) {
        if (b[i].time <= b[i - 1].time) return false; // dup or out of order
      }
      return true;
    })(),
    panelBarCounts: window.__lwcProto.panels.map((p) => p.series.data().length),
  }));
  check(`history grew (${barsBefore} → ${s.bars})`, s.bars > barsBefore);
  check(`still only 2 total fetches (got ${s.fetches})`, s.fetches === 2);
  check('bars strictly ordered, no duplicates', s.contiguous);
  check('BOTH panels received the widened data',
    s.panelBarCounts[0] === s.bars && s.panelBarCounts[1] === s.bars,
    JSON.stringify(s.panelBarCounts));

  console.log('\n== 3. Movement sync (pan panel B, panel A follows) ==');
  await page.evaluate(() => {
    window.__lwcProto.panels[1].chart.timeScale().setVisibleLogicalRange({ from: 500, to: 800 });
  });
  await sleep(250);
  s = await page.evaluate(() => window.__lwcProto.ranges());
  const dFrom = Math.abs(s[0].from - s[1].from);
  const dTo = Math.abs(s[0].to - s[1].to);
  check(`panel A mirrors panel B (Δfrom=${dFrom.toFixed(2)}, Δto=${dTo.toFixed(2)})`, dFrom < 1 && dTo < 1);

  console.log('\n== 4. Timeframe switch 1m → 5m → 1m ==');
  const fetchesBeforeTf = await page.evaluate(() => window.__lwcProto.fetchCount());
  await page.evaluate(() => {
    [...document.querySelectorAll('#tfGroup button')].find((b) => b.textContent === '5m').click();
  });
  await waitFor(page, () => window.__lwcProto.tf() === '5m' && window.__lwcProto.bars() > 0, 15000, '5m bars');
  s = await page.evaluate(() => ({ bars: window.__lwcProto.bars(), fetches: window.__lwcProto.fetchCount() }));
  check(`5m loaded (${s.bars} bars)`, s.bars > 1500);
  check(`5m cost exactly 1 fetch (got ${s.fetches - fetchesBeforeTf})`, s.fetches - fetchesBeforeTf === 1);

  await page.evaluate(() => {
    [...document.querySelectorAll('#tfGroup button')].find((b) => b.textContent === '1m').click();
  });
  await waitFor(page, () => window.__lwcProto.tf() === '1m' && window.__lwcProto.bars() > 0, 15000, 'back to 1m');
  const s2 = await page.evaluate(() => ({ bars: window.__lwcProto.bars(), fetches: window.__lwcProto.fetchCount() }));
  check(`back to 1m from CACHE — 0 new fetches (got ${s2.fetches - s.fetches})`, s2.fetches === s.fetches);
  check(`1m bars preserved (${s2.bars})`, s2.bars >= barsBefore);

  console.log('\n== 5. Repeated pan-left (3 pages) ==');
  for (let i = 0; i < 3; i++) {
    const before = await page.evaluate(() => ({ bars: window.__lwcProto.bars(), f: window.__lwcProto.fetchCount() }));
    await page.evaluate(() => {
      window.__lwcProto.panels[0].chart.timeScale().setVisibleLogicalRange({ from: -40, to: 160 });
    });
    await waitFor(page, `window.__lwcProto.bars() > ${before.bars}`, 15000, `page ${i + 1}`);
    const after = await page.evaluate(() => ({ bars: window.__lwcProto.bars(), f: window.__lwcProto.fetchCount() }));
    check(`page ${i + 1}: +${after.bars - before.bars} bars in ${after.f - before.f} fetch(es)`,
      after.bars > before.bars && after.f - before.f === 1);
  }
  const finalCheck = await page.evaluate(() => {
    const b = window.__lwcProto.services['1m'].bars;
    let gaps = 0;
    for (let i = 1; i < b.length; i++) {
      if (b[i].time - b[i - 1].time !== 60) gaps++;
    }
    return { total: b.length, gaps };
  });
  check(`final 1m series: ${finalCheck.total} bars, 0 seams (got ${finalCheck.gaps} gaps)`, finalCheck.gaps === 0);

  check('no page errors during entire run', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  await browser.close();
} catch (e) {
  fail++;
  console.error('\nTEST RUN ERROR:', e.message);
} finally {
  server.kill();
}

console.log(`\n========== ${pass} passed, ${fail} failed ==========`);
process.exit(fail ? 1 : 0);
