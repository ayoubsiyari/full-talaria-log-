/**
 * The incremental branch of getResampledSeries checks four things and NOT dataVersion:
 *     cache.sourceRef === source && cache.tf === tf && cache.sourceLen === source.length - 1 && result
 * It fired 0 times in 30 s of replay. Since it never consults dataVersion, A's named mechanism (the key
 * contains dataVersion, which bumps per event) cannot be what kills it. One of the other three fails.
 *
 * This records, per real call, which clause is false, and whether the source array is the same object
 * as last time. That distinguishes "version churn" from "the caller hands us a fresh array every call",
 * which need different fixes.
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { login, openBacktest, JOURNAL_BEARING } from './m20-j1/talaria-auth-route.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const CHROME = fs.readFileSync('/root/b-tal01891/CHROME_PATH', 'utf8').trim();
const MEASURE_MS = Number(process.env.MEASURE_MS || 20000);
const env = Object.fromEntries(
  fs.readFileSync('/root/.talaria-test-env', 'utf8').split('\n')
    .filter((l) => l.includes('=')).map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).replace(/^export\s+/, '').trim(),
        l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const lp = await browser.newPage();
  await login(lp, { email: env.TEST_EMAIL, password: env.TEST_PASSWORD, base: BASE });
  await lp.close();

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 950 });
  const ready = await openBacktest(page, {
    base: BASE, sessionId: JOURNAL_BEARING.sessionId, fileId: JOURNAL_BEARING.fileId, timeoutMs: 90000,
  });
  console.log('ready: ' + JSON.stringify(ready));

  await page.evaluate(() => {
    const c = window.chart; const p = c.dataPipeline;
    const orig = p.getResampledSeries.bind(p);
    const S = {
      n: 0, sameRefAsCache: 0, sameRefAsPrevCall: 0, tfMatch: 0, lenIsPlusOne: 0,
      lenSame: 0, hadResult: 0, dvSame: 0, wouldHit: 0, wouldIncrement: 0,
      srcIsChartData: 0, lenDeltas: {}, tfSeen: {}, samples: [],
    };
    let prevSource = null;
    window.__guard = S;
    p.getResampledSeries = function (source, timeframe, dataVersion) {
      const cache = p._resampleCache;
      const tf = String(timeframe || c.currentTimeframe || '1m').toLowerCase().trim();
      const dv = dataVersion ?? c.dataVersion ?? 0;
      const refOk = cache.sourceRef === source;
      const tfOk = cache.tf === tf;
      const plusOne = cache.sourceLen === source.length - 1;
      const same = cache.sourceLen === source.length;
      const resOk = Array.isArray(cache.result) && cache.result.length > 0;
      const dvOk = cache.dataVersion === dv;

      S.n++;
      if (refOk) S.sameRefAsCache++;
      if (source === prevSource) S.sameRefAsPrevCall++;
      if (tfOk) S.tfMatch++;
      if (plusOne) S.lenIsPlusOne++;
      if (same) S.lenSame++;
      if (resOk) S.hadResult++;
      if (dvOk) S.dvSame++;
      if (refOk && tfOk && dvOk && same && resOk) S.wouldHit++;
      if (refOk && tfOk && plusOne && resOk) S.wouldIncrement++;
      if (source === c.data) S.srcIsChartData++;
      const d = source.length - cache.sourceLen;
      S.lenDeltas[d] = (S.lenDeltas[d] || 0) + 1;
      S.tfSeen[tf] = (S.tfSeen[tf] || 0) + 1;
      if (S.samples.length < 12) {
        S.samples.push({ refOk, tfOk, dvOk, plusOne, same, resOk, cacheTf: cache.tf, tf,
          cacheLen: cache.sourceLen, srcLen: source.length, isChartData: source === c.data });
      }
      prevSource = source;
      return orig(source, timeframe, dataVersion);
    };
  });

  await page.evaluate(() => {
    const rs = window.chart && window.chart.replaySystem;
    if (rs) { if (rs.setSpeed) rs.setSpeed(10); if (rs.play) rs.play(); }
  });
  console.log(`observing ${MEASURE_MS / 1000}s of real replay calls...`);
  await sleep(MEASURE_MS);

  const S = await page.evaluate(() => window.__guard);
  const pct = (x) => `${x} (${(100 * x / Math.max(1, S.n)).toFixed(1)}%)`;
  console.log(`\n=== ${S.n} real calls to getResampledSeries ===`);
  console.log(`clause  cache.sourceRef === source   TRUE in ${pct(S.sameRefAsCache)}`);
  console.log(`clause  cache.tf === tf              TRUE in ${pct(S.tfMatch)}`);
  console.log(`clause  cache.sourceLen === len - 1  TRUE in ${pct(S.lenIsPlusOne)}`);
  console.log(`clause  cache.sourceLen === len      TRUE in ${pct(S.lenSame)}`);
  console.log(`clause  cache.result non-empty       TRUE in ${pct(S.hadResult)}`);
  console.log(`clause  cache.dataVersion === dv     TRUE in ${pct(S.dvSame)}   <- A's named mechanism`);
  console.log(`\nwould HIT (fast return):        ${pct(S.wouldHit)}`);
  console.log(`would take INCREMENTAL branch:  ${pct(S.wouldIncrement)}`);
  console.log(`\nsource is the same array as the previous call: ${pct(S.sameRefAsPrevCall)}`);
  console.log(`source === chart.data (not a copy):            ${pct(S.srcIsChartData)}`);
  console.log(`length delta (source.length - cache.sourceLen): ${JSON.stringify(S.lenDeltas)}`);
  console.log(`timeframes requested: ${JSON.stringify(S.tfSeen)}`);
  console.log(`\nfirst calls:`);
  for (const s of S.samples) console.log('  ' + JSON.stringify(s));
  fs.writeFileSync('/root/b-tal01891/guard-clause-result.json', JSON.stringify(S, null, 2));
} catch (e) {
  console.log('ERROR ' + String(e && e.stack ? e.stack : e).slice(0, 600));
} finally {
  await browser.close();
}
