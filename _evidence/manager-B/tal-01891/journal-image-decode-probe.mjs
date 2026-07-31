/**
 * TAL-01891 — is the multi-GB term decoded screenshot bitmaps in the journal list?
 *
 * The reported mechanism was "one retained decoded bitmap per closed trade". Source says that
 * is not what happens: screenshots are held as base64 data-URL strings and this repo contains
 * no createImageBitmap at all. But updateJournalTab() renders EVERY journal row with
 *
 *     <img src="${trade.entryScreenshot}" style="width:100%; height:60px; object-fit:cover">
 *
 * and CSS display size does not bound decode cost. A 3331x1556 source decodes to 20,732,144
 * bytes of RGBA regardless of being painted 60 px tall. Two per trade, every trade in
 * tradeJournal, no pagination and no virtualisation.
 *
 * So the arithmetic may be right while the mechanism is wrong — and that matters, because the
 * bytes land in the renderer's image cache, NOT the JS heap. Anything grading this on
 * JSHeapUsedSize reads GREEN while the machine swaps.
 *
 * Runs on a blank page. Touches neither the canary nor the frozen build.
 *
 * MEASUREMENT DISCIPLINE
 * A first version of this probe measured generation and decode together in one browser, and
 * the control came out at 1.6 GB — because both arms built full-size 3331x1556 canvases to
 * produce their sources, and the second arm inherited the first arm's unreleased memory. The
 * control has to differ from the treatment in exactly one thing. So now:
 *
 *   - sources are generated ONCE, in a separate throwaway browser, before any measurement
 *   - each arm gets its OWN browser process and its own baseline
 *   - the measured window contains only: inject data URLs -> build DOM -> decode
 *
 * ARMS (identical DOM, identical image count, differing only in source pixel dimensions)
 *   full  — src is the full 3331x1556 capture, as shipped today
 *   thumb — src downscaled to the 160x75 box actually painted
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = fs.readFileSync('/root/b-tal01891/CHROME_PATH', 'utf8').trim();
const N = Number(process.env.N_TRADES || 30);
const SHOT_W = 3331, SHOT_H = 1556;
const THUMB_W = 160, THUMB_H = 75;
const BYTES_PER_DECODED = SHOT_W * SHOT_H * 4;
const SRC_CACHE = '/tmp/tal01891-sources.json';

const log = (...a) => console.log(...a);
const mb = b => (b / 1048576).toFixed(1) + ' MB';

function rssOf(pid) {
  try {
    const kb = Number(fs.readFileSync(`/proc/${pid}/status`, 'utf8')
      .split('\n').find(l => l.startsWith('VmRSS:')).replace(/\D/g, ''));
    return kb * 1024;
  } catch { return null; }
}

function totalTreeRss(rootPid) {
  const seen = new Set(); const stack = [rootPid]; let total = 0;
  while (stack.length) {
    const pid = stack.pop();
    if (seen.has(pid)) continue;
    seen.add(pid);
    const r = rssOf(pid); if (r) total += r;
    try {
      const kids = fs.readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8').trim();
      if (kids) for (const k of kids.split(/\s+/)) stack.push(Number(k));
    } catch { /* gone */ }
  }
  return total;
}

const launch = () => puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

/** Phase 1 — build the sources in a throwaway browser so generation is never measured. */
async function generateSources() {
  if (fs.existsSync(SRC_CACHE)) {
    const cached = JSON.parse(fs.readFileSync(SRC_CACHE, 'utf8'));
    if (cached.full?.length === N * 2) { log(`  reusing cached sources (${N * 2} images)`); return cached; }
  }
  log(`  generating ${N * 2} unique ${SHOT_W}x${SHOT_H} captures (throwaway browser)...`);
  const b = await launch();
  const p = await b.newPage();
  await p.goto('about:blank');
  const out = await p.evaluate(async (N, SHOT_W, SHOT_H, THUMB_W, THUMB_H) => {
    function makeShot(seed) {
      const c = document.createElement('canvas');
      c.width = SHOT_W; c.height = SHOT_H;
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, SHOT_W, SHOT_H);
      g.addColorStop(0, `hsl(${(seed * 37) % 360},60%,18%)`);
      g.addColorStop(1, `hsl(${(seed * 91) % 360},60%,42%)`);
      x.fillStyle = g; x.fillRect(0, 0, SHOT_W, SHOT_H);
      for (let i = 0; i < 300; i++) {
        x.fillStyle = `rgba(${(seed * i) % 255},${(i * 7) % 255},${(seed + i) % 255},0.5)`;
        x.fillRect((seed * i * 13) % SHOT_W, (i * 29) % SHOT_H, 40, 24);
      }
      x.fillStyle = '#fff'; x.font = '120px sans-serif';
      x.fillText('trade ' + seed, 80, 300);
      const url = c.toDataURL('image/jpeg', 0.7);
      c.width = 0; c.height = 0;           // release the generation canvas immediately
      return url;
    }
    const shrink = (dataUrl) => new Promise(res => {
      const im = new Image();
      im.onload = () => {
        const c = document.createElement('canvas');
        c.width = THUMB_W; c.height = THUMB_H;
        c.getContext('2d').drawImage(im, 0, 0, THUMB_W, THUMB_H);
        const u = c.toDataURL('image/jpeg', 0.7);
        c.width = 0; c.height = 0; im.src = '';
        res(u);
      };
      im.src = dataUrl;
    });
    const full = [], thumb = [];
    for (let i = 0; i < N * 2; i++) {
      const f = makeShot(i + 1);
      full.push(f);
      thumb.push(await shrink(f));
    }
    return { full, thumb };
  }, N, SHOT_W, SHOT_H, THUMB_W, THUMB_H);
  await b.close();
  fs.writeFileSync(SRC_CACHE, JSON.stringify(out));
  return out;
}

/** Phase 2 — one fresh browser per arm; the measured window is inject -> build -> decode. */
async function measureArm(arm, sources) {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    await page.goto('about:blank');
    const client = await page.target().createCDPSession();
    await client.send('Performance.enable');
    await new Promise(r => setTimeout(r, 1500));

    const baseRss = totalTreeRss(browser.process().pid);
    const baseHeap = (await client.send('Performance.getMetrics'))
      .metrics.find(m => m.name === 'JSHeapUsedSize').value;

    const srcs = sources[arm];
    const built = await page.evaluate(async (srcs) => {
      const rows = [];
      for (let i = 0; i < srcs.length; i += 2) {
        // The markup order-manager.js emits: painted 60 px tall, full-size source.
        rows.push(
          `<div class="trade-history-item" style="display:grid;grid-template-columns:1fr 1fr;gap:6px">` +
          `<img src="${srcs[i]}" style="width:100%;height:60px;object-fit:cover;display:block" alt="Entry">` +
          `<img src="${srcs[i + 1]}" style="width:100%;height:60px;object-fit:cover;display:block" alt="Exit">` +
          `</div>`);
      }
      document.body.innerHTML = rows.join('');
      document.body.getBoundingClientRect();
      const imgs = [...document.images];
      await Promise.all(imgs.map(i => (i.decode ? i.decode().catch(() => {}) : Promise.resolve())));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      let encoded = 0; for (const s of srcs) encoded += s.length;
      return { imgCount: imgs.length, encoded, natural: imgs[0]?.naturalWidth + 'x' + imgs[0]?.naturalHeight };
    }, srcs);

    await new Promise(r => setTimeout(r, 2500));

    const afterRss = totalTreeRss(browser.process().pid);
    const m = await client.send('Performance.getMetrics');
    const afterHeap = m.metrics.find(x => x.name === 'JSHeapUsedSize').value;

    return {
      arm, imgCount: built.imgCount, natural: built.natural, encodedBytes: built.encoded,
      heapDelta: afterHeap - baseHeap, rssDelta: afterRss - baseRss,
      nodes: m.metrics.find(x => x.name === 'Nodes')?.value,
    };
  } finally {
    await browser.close();
  }
}

(async () => {
  log('TAL-01891 journal image decode probe');
  log(`  rows=${N}  images=${N * 2}  source=${SHOT_W}x${SHOT_H}`);
  log(`  one decoded RGBA bitmap = ${BYTES_PER_DECODED.toLocaleString()} bytes`);
  log(`  predicted full-arm decode if the mechanism is real = ${mb(N * 2 * BYTES_PER_DECODED)}`);
  log('');

  log('=== phase 1: generate sources (not measured) ===');
  const sources = await generateSources();
  log(`  full sources : ${sources.full.length}, ${mb(sources.full.join('').length)} encoded`);
  log(`  thumb sources: ${sources.thumb.length}, ${mb(sources.thumb.join('').length)} encoded`);
  log('');

  const results = [];
  for (const arm of ['full', 'thumb']) {
    log(`=== phase 2: arm "${arm}" (fresh browser) ===`);
    const r = await measureArm(arm, sources);
    results.push(r);
    log(`  images rendered   : ${r.imgCount}  (natural size ${r.natural})`);
    log(`  encoded src bytes : ${mb(r.encodedBytes)}   <- what a string-based audit sees`);
    log(`  JS heap delta     : ${mb(r.heapDelta)}   <- what a heap snapshot sees`);
    log(`  process RSS delta : ${mb(r.rssDelta)}   <- what the user's machine feels`);
    log(`  DOM nodes         : ${r.nodes}`);
    log('');
  }

  const full = results.find(r => r.arm === 'full');
  const thumb = results.find(r => r.arm === 'thumb');
  const perTrade = full.rssDelta / N;
  const ratio = full.rssDelta / Math.max(thumb.rssDelta, 1);

  log('=== verdict ===');
  log(`  full arm  : ${mb(full.rssDelta)} RSS for ${N} trades`);
  log(`  thumb arm : ${mb(thumb.rssDelta)} RSS for the same ${N} trades, same DOM, same img count`);
  log(`  the ONLY difference between the arms is source pixel dimensions.`);
  log(`  ratio full/thumb = ${ratio.toFixed(1)}x`);
  log(`  per closed trade = ${mb(perTrade)}  (2 screenshots)`);
  log(`  extrapolated to 301 closed trades = ${mb(perTrade * 301)}`);
  log('');
  log(`  instrument trap: JS heap moved ${mb(full.heapDelta)} while RSS moved ${mb(full.rssDelta)}.`);
  log(`  A grader reading JSHeapUsedSize would call this GREEN.`);
  log('');

  // Both teeth must bite: a large absolute cost AND a control that stays small.
  const confirmed = ratio >= 3 && perTrade > 8 * 1048576 && thumb.rssDelta < 200 * 1048576;
  log(confirmed ? 'TAL01891_MECHANISM_CONFIRMED' : 'TAL01891_MECHANISM_NOT_CONFIRMED');
  if (!confirmed) {
    log('  (control did not stay small, or the effect was not large — do not cite this run)');
  }
  fs.writeFileSync('/tmp/tal01891-result.json',
    JSON.stringify({ N, SHOT_W, SHOT_H, results, perTrade, ratio, confirmed }, null, 2));
  process.exit(confirmed ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
