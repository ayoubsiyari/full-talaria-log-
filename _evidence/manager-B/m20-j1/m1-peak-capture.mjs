/**
 * M1 peak capture — the three requirements I scoped, executed.
 *
 *  1. Sampler installed with evaluateOnNewDocument, so it runs from the chart document's start
 *     rather than after the app reports ready. D's collector waits for three identical samples and
 *     therefore cannot return until the transient has finished; this records max and the series.
 *  2. Renderer peak from /proc/<pid>/status VmHWM, a kernel-maintained high-water mark. CDP
 *     privateMemory is null on this platform, which is why D's harness reported zeros. A fresh
 *     browser per arm makes VmHWM a clean per-arm peak with no sampling race.
 *  3. The two-defect split, made falsifiable rather than argued: an A/B on M20-J1's own kill-switch.
 *
 * The A/B is the point. If the 141 MB transient is the FIX's own cost — you must decode a full-size
 * image to rasterise a thumbnail from it — then turning J1 off should remove the transient and leave
 * full-size images resident instead. If the transient is unchanged with J1 off, then J1 is not on this
 * path at all and the decode is something else. Those two outcomes point at opposite fixes.
 *
 * Ownership of M1 stays D's. This produces the measurement D's harness cannot currently reach.
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { login, openBacktest, JOURNAL_BEARING } from './talaria-auth-route.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const CHROME = fs.readFileSync('/root/b-tal01891/CHROME_PATH', 'utf8').trim();
const SETTLE_MS = Number(process.env.SETTLE_MS || 25000);
const env = Object.fromEntries(
  fs.readFileSync('/root/.talaria-test-env', 'utf8').split('\n')
    .filter((l) => l.includes('=')).map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).replace(/^export\s+/, '').trim(),
        l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MB = (b) => +(b / 1048576).toFixed(2);

/** Runs at document start, before any product script. Samples every 100 ms and keeps the maximum. */
function installSampler(disableJ1) {
  if (disableJ1) window.__TALARIA_DISABLE_JOURNAL_SHOT_THUMBS_V1 = true;
  const S = { t0: Date.now(), series: [], peak: null, j1Disabled: !!disableJ1 };
  window.__peak = S;
  const sample = () => {
    let count = 0; let dataUrl = 0; let fullRes = 0; let thumbs = 0;
    let bytes = 0; let maxOne = 0; let fullResDataUrl = 0;
    for (const img of document.images) {
      const w = img.naturalWidth || 0; const h = img.naturalHeight || 0;
      const src = String(img.currentSrc || img.src || '');
      const isData = src.startsWith('data:');
      const big = w >= 1000 || h >= 700;
      count++;
      if (isData) dataUrl++;
      if (big) { fullRes++; if (isData) fullResDataUrl++; }
      if (w > 0 && h > 0 && w <= 320 && h <= 320) thumbs++;
      const b = w * h * 4;
      bytes += b;
      if (b > maxOne) maxOne = b;
    }
    const row = { t: Date.now() - S.t0, count, dataUrl, fullRes, fullResDataUrl, thumbs, bytes, maxOne };
    S.series.push(row);
    if (!S.peak || row.bytes > S.peak.bytes) S.peak = row;
  };
  sample();
  setInterval(sample, 100);
}

function procMem(pids) {
  const out = [];
  for (const { pid, type } of pids) {
    try {
      const st = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
      const hwm = Number((st.match(/VmHWM:\s+(\d+) kB/) || [])[1] || 0);
      const rss = Number((st.match(/VmRSS:\s+(\d+) kB/) || [])[1] || 0);
      out.push({ pid, type, rssMB: +(rss / 1024).toFixed(1), peakMB: +(hwm / 1024).toFixed(1) });
    } catch (e) { /* gone */ }
  }
  return out;
}

/** D's classifyM1, applied unchanged, so the consequence is not left to interpretation. */
function classify(s) {
  if (!s || s.count === 0) return 'UNPROVEN / no-product-images';
  if (s.dataUrl === 0) return 'UNPROVEN / no-journal-image-surface-detected';
  if (s.fullRes > 0) return 'RED / full-resolution-images-still-resident';
  if (s.thumbs > 0) return 'GREEN_CANDIDATE / thumbnail-only-image-surface-detected';
  return 'UNPROVEN / image-surface-not-classifiable';
}

async function arm(label, disableJ1) {
  console.log(`\n${'='.repeat(78)}\n=== ARM ${label}  (M20-J1 ${disableJ1 ? 'DISABLED' : 'enabled (product default)'})\n${'='.repeat(78)}`);
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1440, height: 1000, deviceScaleFactor: 1 },
  });
  try {
    const lp = await browser.newPage();
    await login(lp, { email: env.TEST_EMAIL, password: env.TEST_PASSWORD, base: BASE });
    await lp.close();

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(installSampler, disableJ1);

    const ready = await openBacktest(page, {
      base: BASE, sessionId: JOURNAL_BEARING.sessionId, fileId: JOURNAL_BEARING.fileId, timeoutMs: 90000,
    });
    console.log('  ready: ' + JSON.stringify(ready));
    const flagSeen = await page.evaluate(() => ({
      flag: !!window.__TALARIA_DISABLE_JOURNAL_SHOT_THUMBS_V1,
      samplerAlive: !!window.__peak,
    }));
    console.log('  kill-switch visible in page: ' + JSON.stringify(flagSeen));
    if (flagSeen.flag !== disableJ1) console.log('  WARNING: flag state does not match the arm');

    console.log(`  sampling a further ${SETTLE_MS / 1000}s...`);
    await sleep(SETTLE_MS);

    const S = await page.evaluate(() => window.__peak);
    const session = await browser.target().createCDPSession();
    const info = await session.send('SystemInfo.getProcessInfo').catch(() => ({ processInfo: [] }));
    const pids = (info.processInfo || []).map((p) => ({ pid: Number(p.id || p.pid), type: p.type }));
    const mem = procMem(pids);
    await session.detach().catch(() => {});

    const settled = S.series[S.series.length - 1];
    console.log(`\n  samples: ${S.series.length} over ${(settled.t / 1000).toFixed(1)}s`);
    console.log(`  PEAK   t=+${(S.peak.t / 1000).toFixed(1)}s  images=${S.peak.count} dataUrl=${S.peak.dataUrl} `
      + `fullRes=${S.peak.fullRes} (dataUrl&fullRes=${S.peak.fullResDataUrl}) thumbs=${S.peak.thumbs}  `
      + `decoded=${MB(S.peak.bytes)} MB  largestImage=${MB(S.peak.maxOne)} MB`);
    console.log(`  SETTLED t=+${(settled.t / 1000).toFixed(1)}s  images=${settled.count} dataUrl=${settled.dataUrl} `
      + `fullRes=${settled.fullRes} thumbs=${settled.thumbs}  decoded=${MB(settled.bytes)} MB`);
    console.log(`  ratio peak/settled = ${(S.peak.bytes / Math.max(1, settled.bytes)).toFixed(1)}x`);
    console.log(`  D's classifyM1 at PEAK    : ${classify(S.peak)}`);
    console.log(`  D's classifyM1 at SETTLED : ${classify(settled)}`);

    console.log('\n  decode profile (only samples where the surface changed):');
    let prev = null;
    for (const r of S.series) {
      const key = `${r.count}|${r.dataUrl}|${r.fullRes}|${r.bytes}`;
      if (key === prev) continue;
      prev = key;
      console.log(`    t=+${String((r.t / 1000).toFixed(1)).padStart(5)}s  imgs=${String(r.count).padStart(3)} `
        + `dataUrl=${String(r.dataUrl).padStart(3)} fullRes=${String(r.fullRes).padStart(3)} `
        + `decoded=${String(MB(r.bytes)).padStart(8)} MB`);
    }

    console.log('\n  process peak RSS (VmHWM, kernel high-water — no sampling race):');
    for (const m of mem.filter((x) => ['browser', 'renderer', 'GPU'].includes(x.type))) {
      console.log(`    ${String(m.type).padEnd(9)} pid=${String(m.pid).padEnd(8)} now=${m.rssMB} MB  PEAK=${m.peakMB} MB`);
    }
    const rendPeak = mem.filter((m) => m.type === 'renderer').reduce((n, m) => n + m.peakMB, 0);
    const gpuPeak = mem.filter((m) => m.type === 'GPU').reduce((n, m) => n + m.peakMB, 0);
    console.log(`    renderer peak total = ${rendPeak.toFixed(1)} MB   GPU peak total = ${gpuPeak.toFixed(1)} MB`);

    return { label, disableJ1, ready, peak: S.peak, settled, rendPeak, gpuPeak, samples: S.series.length };
  } finally {
    await browser.close();
  }
}

const results = [];
results.push(await arm('A-j1-enabled', false));
await sleep(3000);
results.push(await arm('B-j1-disabled', true));

console.log(`\n${'='.repeat(78)}\n=== A/B: is the transient the FIX's own cost, or something else?\n${'='.repeat(78)}`);
const [a, b] = results;
const row = (r) => `${String(r.label).padEnd(15)} peak=${String(MB(r.peak.bytes)).padStart(8)} MB @+${(r.peak.t / 1000).toFixed(1)}s  `
  + `settled=${String(MB(r.settled.bytes)).padStart(8)} MB  fullRes peak/settled=${r.peak.fullRes}/${r.settled.fullRes}  `
  + `rendererPeak=${r.rendPeak.toFixed(0)} MB`;
console.log(row(a));
console.log(row(b));
console.log('');
console.log(`  peak    J1off/J1on = ${(b.peak.bytes / Math.max(1, a.peak.bytes)).toFixed(2)}x`);
console.log(`  settled J1off/J1on = ${(b.settled.bytes / Math.max(1, a.settled.bytes)).toFixed(2)}x`);
console.log('');
console.log('  Reading: if settled J1off >> settled J1on, M20-J1 is working on this path and the');
console.log('  steady state is its benefit. If peak J1on >> peak J1off, the transient is the cost of');
console.log('  producing thumbnails — a full-size decode per screenshot — and it is the fix\'s own bill.');
console.log('  If the two arms are indistinguishable, J1 is not on this path and neither reading holds.');

fs.writeFileSync('/root/b-tal01891/m1-peak-capture-result.json', JSON.stringify(results, null, 2));
console.log('\nwrote /root/b-tal01891/m1-peak-capture-result.json');
