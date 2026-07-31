/**
 * M20-J1 on live b118 — does the journal list actually stop carrying full-resolution screenshots?
 *
 * The marker is discriminating (0 on b117, present on b118) and that still only proves the code
 * shipped. TAL-01891 is a MEMORY ticket, so the claim that matters is a byte count, and the byte
 * count that matters is not the data URL's length — it is the DECODED bitmap the renderer holds.
 * A 3331x1556 capture decodes to 20,732,144 bytes of RGBA no matter that the row paints it 60px
 * tall. That is the cost this fix is supposed to remove.
 *
 * So: take A's own _m20J1RasterizeThumb as served by b118, run it on a realistic capture, and
 * measure both numbers. Then set the kill-switch and confirm the old behaviour returns — a fix
 * whose arms agree is not a fix.
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = fs.readFileSync('/root/b-tal01891/CHROME_PATH', 'utf8').trim();
const BASE = 'http://127.0.0.1:3000';
const SHOT_W = 3331, SHOT_H = 1556;          // the real capture size from screenshot-manager
const mb = b => (b / 1048576).toFixed(2) + ' MB';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const page = await browser.newPage();
  await page.goto(`${BASE}/login/`, { waitUntil: 'domcontentloaded' });

  const src = await page.evaluate(async (BASE) => {
    const r = await fetch(`${BASE}/chart/modules/order-manager.js`, { cache: 'no-store' });
    return { ok: r.ok, status: r.status, ct: r.headers.get('content-type'), text: await r.text() };
  }, BASE);

  console.log('=== order-manager.js as served by b118 ===');
  console.log(`  http ${src.status}  ${src.ct}  ${src.text.length} bytes`);
  if (!src.ok || !/javascript/.test(src.ct || '')) { console.log('  ABORT: not JavaScript'); process.exit(2); }
  if (!src.text.includes('_m20J1RasterizeThumb')) { console.log('  ABORT: M20-J1 not in the served file'); process.exit(2); }
  console.log('  contains _m20J1RasterizeThumb: true');

  const out = await page.evaluate(async (code, SHOT_W, SHOT_H) => {
    const res = {};

    // Lift the two shipped methods out of the class body verbatim.
    const grab = (name, isAsync) => {
      const needle = `\n    ${isAsync ? 'async ' : ''}${name}(`;
      const i = code.indexOf(needle);
      if (i < 0) return null;
      let d = 0, started = false, j = i;
      for (; j < code.length; j++) {
        const c = code[j];
        if (c === '{') { d++; started = true; }
        else if (c === '}') { d--; if (started && d === 0) { j++; break; } }
      }
      return code.slice(i, j);
    };
    const raster = grab('_m20J1RasterizeThumb', true);
    const enabled = grab('_m20J1ThumbsEnabled', false);
    const cfg = grab('_m20J1Config', false);
    // _m20J1RasterizeThumb ends with `this._m20A1IsValidScreenshotDataUrl(out) ? out : null`.
    // Without that collaborator the call throws into its own catch and the method returns null —
    // which looks exactly like "the fix produced nothing". Bring the collaborator along.
    const valid = grab('_m20A1IsValidScreenshotDataUrl', false);
    res.found = { raster: !!raster, enabled: !!enabled, cfg: !!cfg, validator: !!valid };
    if (!raster || !enabled || !cfg || !valid) return res;

    const holder = new Function(
      `return { ${raster.trim()}, ${enabled.trim()}, ${cfg.trim()}, ${valid.trim()} };`)();
    res.config = holder._m20J1Config();

    // A realistic full-resolution capture, the same shape screenshot-manager produces.
    const c = document.createElement('canvas');
    c.width = SHOT_W; c.height = SHOT_H;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, SHOT_W, SHOT_H);
    g.addColorStop(0, '#0d1117'); g.addColorStop(1, '#2d6cdf');
    x.fillStyle = g; x.fillRect(0, 0, SHOT_W, SHOT_H);
    for (let i = 0; i < 400; i++) {
      x.fillStyle = `rgba(${i % 255},${(i * 7) % 255},${(i * 13) % 255},0.6)`;
      x.fillRect((i * 137) % SHOT_W, (i * 31) % SHOT_H, 36, 20);
    }
    x.fillStyle = '#fff'; x.font = '110px sans-serif'; x.fillText('EURUSD entry', 90, 260);
    const full = c.toDataURL('image/jpeg', 0.9);
    c.width = 0; c.height = 0;

    const decodedBytes = (w, h) => w * h * 4;

    // measure the natural size a src actually decodes to
    const natural = (dataUrl) => new Promise(r => {
      const im = new Image();
      im.onload = () => r({ w: im.naturalWidth, h: im.naturalHeight });
      im.onerror = () => r({ w: 0, h: 0 });
      im.src = dataUrl;
    });

    res.full = { encoded: full.length, ...(await natural(full)) };
    res.full.decoded = decodedBytes(res.full.w, res.full.h);

    // ARM 1 — thumbs enabled (the shipped default)
    delete window.__TALARIA_DISABLE_JOURNAL_SHOT_THUMBS_V1;
    res.enabledDefault = holder._m20J1ThumbsEnabled();
    const t = await holder._m20J1RasterizeThumb(full, res.config.maxDim, res.config.quality);
    res.thumb = { encoded: t ? t.length : 0, ...(await natural(t || '')) };
    res.thumb.decoded = decodedBytes(res.thumb.w, res.thumb.h);

    // ARM 2 — kill-switch set: the accessor must report disabled, so the caller keeps full source
    window.__TALARIA_DISABLE_JOURNAL_SHOT_THUMBS_V1 = true;
    res.enabledUnderKill = holder._m20J1ThumbsEnabled();
    window.__TALARIA_DISABLE_JOURNAL_SHOT_THUMBS_V1 = '0';   // truthy string
    res.enabledUnderTruthyString = holder._m20J1ThumbsEnabled();
    window.__TALARIA_DISABLE_JOURNAL_SHOT_THUMBS_V1 = 0;     // falsy
    res.enabledUnderFalsy = holder._m20J1ThumbsEnabled();
    return res;
  }, src.text, SHOT_W, SHOT_H);

  console.log('');
  console.log('=== shipped config ===');
  console.log(`  ${JSON.stringify(out.config)}`);

  if (!out.found?.raster || !out.found?.validator) {
    console.log(`  ABORT: could not isolate the shipped methods ${JSON.stringify(out.found)}`);
    process.exit(2);
  }
  // An empty thumbnail means the instrument failed, not that the fix saves infinite memory.
  // Refuse to compute a ratio against zero rather than print an absurd number.
  if (!out.thumb.decoded) {
    console.log('  ABORT: the rasterizer returned nothing — instrument failure, not a result.');
    console.log(`  thumb: ${JSON.stringify(out.thumb)}`);
    process.exit(2);
  }

  console.log('');
  console.log('=== one journal screenshot, before and after ===');
  console.log(`  full capture : ${out.full.w}x${out.full.h}  encoded ${mb(out.full.encoded)}  DECODES TO ${mb(out.full.decoded)}`);
  console.log(`  thumbnail    : ${out.thumb.w}x${out.thumb.h}  encoded ${mb(out.thumb.encoded)}  DECODES TO ${mb(out.thumb.decoded)}`);
  const ratio = out.full.decoded / Math.max(out.thumb.decoded, 1);
  console.log(`  decode reduction: ${ratio.toFixed(0)}x`);

  console.log('');
  console.log('=== what that means for the reported account ===');
  // The ticket describes a heavy account; two screenshots per closed trade.
  for (const n of [100, 301]) {
    const before = out.full.decoded * 2 * n;
    const after = out.thumb.decoded * 2 * n;
    console.log(`  ${String(n).padStart(3)} closed trades: ${mb(before).padStart(10)} -> ${mb(after).padStart(9)}   saves ${mb(before - after)}`);
  }
  console.log('  (decoded RGBA held by the renderer, two screenshots per trade, whole journal rendered)');

  console.log('');
  console.log('=== the kill-switch ===');
  const rows = [
    ['unset (shipped default)', out.enabledDefault, true],
    ['= true',                  out.enabledUnderKill, false],
    ["= '0' (truthy string)",   out.enabledUnderTruthyString, false],
    ['= 0 (falsy)',             out.enabledUnderFalsy, true],
  ];
  let bad = 0;
  for (const [label, got, want] of rows) {
    const ok = got === want;
    if (!ok) bad++;
    console.log(`  ${label.padEnd(26)} thumbs enabled = ${String(got).padEnd(5)} want ${String(want).padEnd(5)} ${ok ? 'ok' : 'WRONG'}`);
  }

  const shrinks = out.thumb.decoded > 0 && ratio >= 20;
  const switchWorks = out.enabledDefault === true && out.enabledUnderKill === false;
  console.log('');
  console.log(`  the thumbnail is genuinely smaller : ${shrinks}`);
  console.log(`  the switch genuinely switches      : ${switchWorks}`);
  console.log('');
  console.log(shrinks && switchWorks && bad === 0
    ? 'M20J1_BEHAVIOURALLY_LIVE_ON_B118'
    : 'M20J1_NOT_BEHAVIOURALLY_CONFIRMED');
  process.exit(shrinks && switchWorks && bad === 0 ? 0 : 1);
} finally {
  await browser.close();
}
