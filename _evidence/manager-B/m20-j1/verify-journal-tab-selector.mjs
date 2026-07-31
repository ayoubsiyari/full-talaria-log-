/**
 * D's M1 run reached the real app on b120 and still returned UNPROVEN with
 * `no-journal-image-surface-detected`. Cause found in the product source: the journal tab is
 * `#tradingJournalTab` (order-manager.js:32003, :48141) with its content at
 * `#tradingJournalContent` (:48143). D's opener tries `#journalTab`, `[data-testid="journal-tab"]`,
 * `button[aria-label*="Journal"]`, `button[title*="Journal"]` and `[data-panel="journal"]` — none of
 * which match, so the panel is never opened and there is no journal image surface to classify.
 *
 * Rather than hand D a suggested selector, this proves it: it clicks the real tab and re-runs D's own
 * surface classification, including D's journalLike ancestor list, so D can see whether a two-line
 * change turns UNPROVEN into a real verdict.
 *
 * Ownership of M1 stays D's. This only establishes which selector works.
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { login, openBacktest, JOURNAL_BEARING } from './talaria-auth-route.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const CHROME = fs.readFileSync('/root/b-tal01891/CHROME_PATH', 'utf8').trim();
const env = Object.fromEntries(
  fs.readFileSync('/root/.talaria-test-env', 'utf8').split('\n')
    .filter((l) => l.includes('=')).map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).replace(/^export\s+/, '').trim(),
        l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// D's own surface collector, verbatim in substance, plus the two selectors D is missing.
const SURFACE = (extraJournalSel) => {
  const rows = Array.from(document.images).map((img) => {
    const src = String(img.currentSrc || img.src || '');
    const rect = img.getBoundingClientRect();
    return {
      naturalWidth: img.naturalWidth || 0,
      naturalHeight: img.naturalHeight || 0,
      clientWidth: Math.round(rect.width || 0),
      clientHeight: Math.round(rect.height || 0),
      srcKind: src.startsWith('data:') ? 'data-url' : src ? 'url' : 'empty',
      srcLength: src.length,
      journalLikeD: !!(img.closest?.('[data-journal], .journal, #tradeJournal, #journalTab, .trade-list, .trade-card')),
      journalLikePlus: !!(img.closest?.(extraJournalSel)),
    };
  });
  const sum = (f) => rows.reduce((n, r) => n + f(r), 0);
  return {
    imageCount: rows.length,
    dataUrlImages: rows.filter((r) => r.srcKind === 'data-url').length,
    fullResolutionImages: rows.filter((r) => r.naturalWidth >= 1000 || r.naturalHeight >= 700).length,
    thumbnailImages: rows.filter((r) => r.naturalWidth > 0 && r.naturalHeight > 0
      && r.naturalWidth <= 320 && r.naturalHeight <= 320).length,
    journalLikeImages_Dselectors: rows.filter((r) => r.journalLikeD).length,
    journalLikeImages_withTradingJournalContent: rows.filter((r) => r.journalLikePlus).length,
    decodedPixelFloorBytes: sum((r) => Math.max(0, r.naturalWidth) * Math.max(0, r.naturalHeight) * 4),
    maxImageDecodedBytes: rows.reduce((n, r) => Math.max(n, r.naturalWidth * r.naturalHeight * 4), 0),
    dataUrlSample: rows.filter((r) => r.srcKind === 'data-url').slice(0, 3),
  };
};
const EXTRA = '[data-journal], .journal, #tradeJournal, #journalTab, .trade-list, .trade-card, #tradingJournalContent, #tradingJournalTab';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--js-flags=--expose-gc'],
  defaultViewport: { width: 1440, height: 1000, deviceScaleFactor: 1 },
});
try {
  const page = await browser.newPage();
  await login(page, { email: env.TEST_EMAIL, password: env.TEST_PASSWORD, base: BASE });
  const ready = await openBacktest(page, {
    base: BASE, sessionId: JOURNAL_BEARING.sessionId, fileId: JOURNAL_BEARING.fileId, timeoutMs: 90000,
  });
  console.log('ready: ' + JSON.stringify(ready));

  console.log('\n=== which of D\'s opener selectors exist, versus the product\'s real ones ===');
  const present = await page.evaluate(() => {
    const check = (sel) => {
      const el = document.querySelector(sel);
      return el ? { found: true, tag: el.tagName, visible: !!(el.offsetParent || el.getClientRects().length) } : { found: false };
    };
    return {
      "D: #journalTab": check('#journalTab'),
      'D: [data-testid="journal-tab"]': check('[data-testid="journal-tab"]'),
      'D: [data-panel="journal"]': check('[data-panel="journal"]'),
      'product: #tradingJournalTab': check('#tradingJournalTab'),
      'product: #tradingJournalContent': check('#tradingJournalContent'),
    };
  });
  for (const [k, v] of Object.entries(present)) console.log('  ' + k.padEnd(34) + JSON.stringify(v));

  const before = await page.evaluate(SURFACE, EXTRA);
  console.log('\n=== surface BEFORE opening the journal (this is what D measured) ===');
  console.log(JSON.stringify({ ...before, dataUrlSample: undefined }, null, 2));

  console.log('\n=== click the product\'s real journal tab ===');
  const clicked = await page.evaluate(() => {
    const el = document.querySelector('#tradingJournalTab');
    if (!el) return 'NOT_FOUND';
    el.click();
    return 'clicked';
  });
  console.log('  ' + clicked);

  // Journal rows rasterise thumbnails asynchronously; sample until the surface stops moving.
  let last = null; let stableFor = 0;
  for (let i = 0; i < 20; i++) {
    await sleep(1500);
    const s = await page.evaluate(SURFACE, EXTRA);
    const key = [s.imageCount, s.dataUrlImages, s.decodedPixelFloorBytes].join('|');
    stableFor = key === last ? stableFor + 1 : 0;
    last = key;
    if (i % 3 === 0 || stableFor === 2) {
      console.log(`  t+${((i + 1) * 1.5).toFixed(1)}s  images=${s.imageCount} dataUrl=${s.dataUrlImages} `
        + `thumbs=${s.thumbnailImages} fullRes=${s.fullResolutionImages} `
        + `journalLike(D)=${s.journalLikeImages_Dselectors} journalLike(+)=${s.journalLikeImages_withTradingJournalContent} `
        + `pixelFloor=${(s.decodedPixelFloorBytes / 1048576).toFixed(2)}MB`);
    }
    if (stableFor >= 2) break;
  }

  const after = await page.evaluate(SURFACE, EXTRA);
  console.log('\n=== surface AFTER opening the journal ===');
  console.log(JSON.stringify(after, null, 2));

  // Replay D's own classifier on the after-surface so the consequence is not left to interpretation.
  const cls = (s) => {
    if (s.imageCount === 0) return 'UNPROVEN / no-product-images';
    if (s.journalLikeImages_Dselectors === 0 && s.dataUrlImages === 0) return 'UNPROVEN / no-journal-image-surface-detected';
    if (s.fullResolutionImages > 0) return 'RED / full-resolution-images-still-resident';
    if (s.thumbnailImages > 0) return 'GREEN_CANDIDATE / thumbnail-only-image-surface-detected';
    return 'UNPROVEN / image-surface-not-classifiable';
  };
  console.log('\n=== D\'s classifyM1 applied to each surface ===');
  console.log('  before click: ' + cls(before));
  console.log('  after  click: ' + cls(after));
} catch (e) {
  console.log('ERROR ' + String(e && e.stack ? e.stack : e).slice(0, 600));
} finally {
  await browser.close();
}
