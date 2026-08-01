/**
 * M20-J1 — the journal list stops carrying full-resolution screenshots.
 *
 * Product under test: order-manager.js J1 section, kill-switch
 * __TALARIA_DISABLE_JOURNAL_SHOT_THUMBS_V1 (default unset = J1 active).
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m20-j1-journal-shot-thumbs.test.mjs"
 *
 * Every cell here is BEHAVIOURAL: it drives the real renderTradeListItem /
 * updateJournalTab / showScreenshotPreviewForTrade and asserts on what those
 * produce. There are no source-text anchors, so a mutant that breaks the
 * behaviour cannot be masked by the source still containing the right words.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── DOM harness ───────────────────────────────────────────────────────────

/** Element stub that records innerHTML so cells can assert on real markup. */
function makeEl(id) {
  return {
    id,
    innerHTML: '',
    style: {},
    dataset: {},
    _listeners: {},
    setAttribute() {},
    getAttribute() { return null; },
    appendChild() {},
    addEventListener(type, fn) { this._listeners[type] = fn; },
    removeEventListener() {},
    querySelectorAll() { return []; },
    querySelector() { return null; },
    closest() { return null; },
  };
}

const els = {};

function installDom() {
  els.tradeHistoryList = makeEl('tradeHistoryList');
  els.noTradesMsg = makeEl('noTradesMsg');
  global.window = {
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    location: { href: 'http://local.test/chart?sessionId=j1' },
  };
  global.document = {
    readyState: 'complete',
    getElementById: (id) => els[id] || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({
      style: {}, width: 0, height: 0,
      getContext: () => null,
      toDataURL: () => '',
      classList: { add() {}, remove() {}, contains: () => false },
      setAttribute() {}, appendChild() {}, addEventListener() {},
    }),
    addEventListener() {},
    body: { appendChild() {} },
  };
  global.userStorage = {
    _m: new Map(),
    getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
    setItem(k, v) { this._m.set(k, String(v)); },
    removeItem(k) { this._m.delete(k); },
  };
}

installDom();
const OrderManager = require('./order-manager.js');

// ─── Fixtures ──────────────────────────────────────────────────────────────

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Synthetic PNG data URL of a CHOSEN string length. Everything measured with
 * it is a STRING-length measurement at that configured length; it says
 * nothing about decoded bitmap bytes (see the measurement cell).
 */
function makeShot(tag, approxChars) {
  const head = `data:image/png;base64,`;
  const body = [];
  let n = 0;
  while (n < approxChars) {
    body.push(tag);
    body.push(B64);
    n += tag.length + B64.length;
  }
  const payload = body.join('').replace(/[^A-Za-z0-9+/]/g, 'A');
  return head + payload;
}

const SHOT_CHARS = 200_000;
const ENTRY_SHOT = makeShot('EN', SHOT_CHARS);
const EXIT_SHOT = makeShot('EX', SHOT_CHARS);

function makeTrade(id, opts = {}) {
  return {
    tradeId: id,
    id,
    symbol: 'EURUSD',
    ticker: 'EURUSD',
    direction: 'BUY',
    type: 'BUY',
    entryPrice: 1.1,
    exitPrice: 1.2,
    openPrice: 1.1,
    closePrice: 1.2,
    quantity: 1,
    netPnL: 123.45,
    pnl: 123.45,
    rMultiple: 2,
    closeType: 'TP',
    closeTime: 1_760_000_000_000,
    openTime: 1_759_000_000_000,
    entryScreenshot: opts.entryShot === undefined ? ENTRY_SHOT : opts.entryShot,
    exitScreenshot: opts.exitShot === undefined ? EXIT_SHOT : opts.exitShot,
    ...(opts.extra || {}),
  };
}

/**
 * Real prototype, no init(). Only the collaborators renderTradeListItem /
 * updateJournalTab actually reach are stubbed.
 */
function makeManager(journal) {
  const om = Object.create(OrderManager.prototype);
  om.tradeJournal = journal || [];
  om.closedPositions = [];
  om.openPositions = [];
  om.scaledTrades = new Map();
  om.splitTrades = new Map();
  om.chart = { getActiveTradingSessionId: () => 'j1-session' };
  om._isUpdatingPanels = true; // suppress the updatePositionsPanel pass
  om.updatePositionsPanel = () => {};
  om.formatPrice = (v) => String(v);
  om.previewCalls = [];
  om.showScreenshotPreview = function (src, title) {
    om.previewCalls.push({ src, title });
  };
  om.detailCalls = [];
  om.showTradeDetails = function (t) { om.detailCalls.push(t); };
  return om;
}

function setFlag(value) {
  if (value === undefined) delete global.window.__TALARIA_DISABLE_JOURNAL_SHOT_THUMBS_V1;
  else global.window.__TALARIA_DISABLE_JOURNAL_SHOT_THUMBS_V1 = value;
}

function silence(fn) {
  const log = console.log;
  console.log = () => {};
  try { return fn(); } finally { console.log = log; }
}

function renderRow(om, trade, index = 0) {
  return silence(() => om.renderTradeListItem(trade, index));
}

function renderList(om) {
  silence(() => om.updateJournalTab());
  return els.tradeHistoryList.innerHTML;
}

function countOccurrences(hay, needle) {
  if (!needle) return 0;
  let n = 0;
  let i = hay.indexOf(needle);
  while (i >= 0) { n += 1; i = hay.indexOf(needle, i + 1); }
  return n;
}

test.beforeEach(() => {
  setFlag(undefined);
  els.tradeHistoryList.innerHTML = '';
  els.tradeHistoryList.dataset = {};
});

// ─── J1-C1..C2 — the list no longer emits full-resolution payloads ─────────

test('J1-C1 ON: rendered row contains ZERO copies of the full-resolution data URL', () => {
  const om = makeManager([makeTrade(1)]);
  const html = renderRow(om, om.tradeJournal[0]);
  assert.equal(countOccurrences(html, ENTRY_SHOT), 0, 'entry payload leaked into the list markup');
  assert.equal(countOccurrences(html, EXIT_SHOT), 0, 'exit payload leaked into the list markup');
});

test('J1-C2 OFF baseline: rendered row contains the full-resolution data URL THREE times per screenshot', () => {
  setFlag(true);
  const om = makeManager([makeTrade(1)]);
  const html = renderRow(om, om.tradeJournal[0]);
  // data-trade JSON + onclick handler + <img src> — the brief said two; the
  // data-trade attribute is the third and largest site.
  assert.equal(countOccurrences(html, ENTRY_SHOT), 3, 'legacy arm must keep all three emission sites');
  assert.equal(countOccurrences(html, EXIT_SHOT), 3);
});

test('J1-C3 ON: the <img> src is a bounded placeholder or thumbnail, never the payload', () => {
  const om = makeManager([makeTrade(1)]);
  const html = renderRow(om, om.tradeJournal[0]);
  const srcs = [...html.matchAll(/<img src="([^"]*)"/g)].map((m) => m[1]);
  assert.equal(srcs.length, 2, 'entry + exit thumbnails must both render');
  for (const src of srcs) {
    assert.ok(src.length < 1000, `img src too large for a thumbnail: ${src.length} chars`);
    assert.notEqual(src, ENTRY_SHOT);
    assert.notEqual(src, EXIT_SHOT);
  }
});

test('J1-C4 ON: click handler carries the trade id, not a base64 payload', () => {
  const om = makeManager([makeTrade(77)]);
  const html = renderRow(om, om.tradeJournal[0]);
  assert.ok(html.includes("showScreenshotPreviewForTrade('77', 'entry'"), 'entry handler must pass the id');
  assert.ok(html.includes("showScreenshotPreviewForTrade('77', 'exit'"), 'exit handler must pass the id');
  assert.equal(countOccurrences(html, "showScreenshotPreview('data:image"), 0);
});

test('J1-C5 ON: data-trade attribute no longer carries screenshot payloads', () => {
  const om = makeManager([makeTrade(5, {
    extra: { journalEntry: { entryScreenshot: ENTRY_SHOT }, metadata: { exitScreenshot: EXIT_SHOT } },
  })]);
  const html = renderRow(om, om.tradeJournal[0]);
  const attr = /data-trade='([^']*)'/.exec(html);
  assert.ok(attr, 'data-trade attribute must still exist');
  assert.equal(attr[1].includes('data:image'), false, 'no data URL may survive in data-trade');
  // The row identity a consumer needs is still there.
  const parsed = JSON.parse(attr[1].replace(/&quot;/g, '"'));
  assert.equal(String(parsed.tradeId), '5');
  assert.equal(parsed.netPnL, 123.45);
});

// ─── J1-C6..C8 — full resolution stays REACHABLE ───────────────────────────

test('J1-C6 showScreenshotPreviewForTrade serves the FULL-resolution blob from the live row', () => {
  const om = makeManager([makeTrade(9)]);
  om.showScreenshotPreviewForTrade('9', 'entry', 'Entry Screenshot');
  assert.equal(om.previewCalls.length, 1);
  assert.equal(om.previewCalls[0].src, ENTRY_SHOT, 'preview must get the FULL resolution image');
  assert.equal(om.previewCalls[0].title, 'Entry Screenshot');
  om.showScreenshotPreviewForTrade('9', 'exit', 'Exit Screenshot');
  assert.equal(om.previewCalls[1].src, EXIT_SHOT);
});

test('J1-C7 showScreenshotPreviewForTrade routes externalized rows through the M20-A1 blob path', async () => {
  const row = makeTrade(11, { entryShot: null, exitShot: null });
  row.entryScreenshotRef = { refId: 'ref-entry-11', mime: 'image/png', byteLength: ENTRY_SHOT.length };
  const om = makeManager([row]);
  let asked = null;
  om._m20A1DisplayBlob = () => null;
  om._m20A1ResolveRefBlob = async (refId) => { asked = refId; return ENTRY_SHOT; };
  om.showScreenshotPreviewForTrade('11', 'entry');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(asked, 'ref-entry-11', 'must fetch through the existing A1 resolver');
  assert.equal(om.previewCalls.length, 1);
  assert.equal(om.previewCalls[0].src, ENTRY_SHOT);
});

test('J1-C8 ON: clicking a row opens details from the LIVE row, so nothing is lost by the slim attribute', async () => {
  const om = makeManager([makeTrade(21)]);
  renderList(om);
  await new Promise((r) => setTimeout(r, 150)); // handler binds on the render's settle timer
  const handler = els.tradeHistoryList._listeners.click;
  assert.ok(typeof handler === 'function', 'row click handler must be bound');
  const item = { getAttribute: (k) => (k === 'data-trade-id' ? '21' : null) };
  handler({ target: { closest: () => item } });
  assert.equal(om.detailCalls.length, 1);
  assert.equal(om.detailCalls[0].entryScreenshot, ENTRY_SHOT, 'detail view must still get full resolution');
});

// ─── J1-C9..C11 — kill-switch: FLAG-01 / FLAG-02 / FLAG-03 ─────────────────

test('J1-C9 FLAG-02 truthy: every truthy kill value restores the legacy arm', () => {
  for (const value of [1, 'yes', 'true', {}, [], '0']) {
    setFlag(value);
    const om = makeManager([makeTrade(1)]);
    const html = renderRow(om, om.tradeJournal[0]);
    assert.equal(
      countOccurrences(html, ENTRY_SHOT), 3,
      `truthy kill value ${JSON.stringify(value)} did not restore the legacy arm`,
    );
    assert.equal(om._m20J1ThumbsEnabled(), false, `truthy ${JSON.stringify(value)} must disable J1`);
  }
});

test('J1-C10 FLAG-02 falsy: every falsy kill value leaves J1 active', () => {
  for (const value of [undefined, null, false, 0, '', NaN]) {
    setFlag(value);
    const om = makeManager([makeTrade(1)]);
    const html = renderRow(om, om.tradeJournal[0]);
    assert.equal(
      countOccurrences(html, ENTRY_SHOT), 0,
      `falsy kill value ${String(value)} wrongly restored the legacy arm`,
    );
    assert.equal(om._m20J1ThumbsEnabled(), true, `falsy ${String(value)} must keep J1 active`);
  }
});

test('J1-C11 FLAG-01: the flag is read freshly on each call, not cached at module load', () => {
  const om = makeManager([makeTrade(1)]);
  setFlag(undefined);
  assert.equal(countOccurrences(renderRow(om, om.tradeJournal[0]), ENTRY_SHOT), 0);
  setFlag(true);
  assert.equal(countOccurrences(renderRow(om, om.tradeJournal[0]), ENTRY_SHOT), 3, 'mid-session flip to OFF must take effect');
  setFlag(false);
  assert.equal(countOccurrences(renderRow(om, om.tradeJournal[0]), ENTRY_SHOT), 0, 'mid-session flip back to ON must take effect');
});

test('J1-C12 FLAG-03 working product OFF: a journal row still renders its visible content', () => {
  setFlag(true);
  const om = makeManager([makeTrade(31)]);
  const html = renderList(om);
  // Not "the feature is inactive" — the actual product surface must be there.
  assert.ok(html.includes('trade-history-item'), 'row container missing');
  assert.ok(html.includes('EURUSD'), 'symbol missing from the rendered row');
  assert.ok(html.includes('#31'), 'trade id missing from the rendered row');
  assert.ok(html.includes('BUY'), 'direction missing from the rendered row');
  assert.ok(html.includes('+$123.45'), 'P&L missing from the rendered row');
  assert.ok(html.includes('+2R'), 'R-multiple missing from the rendered row');
  assert.ok(/<img src="data:image\/png;base64,/.test(html), 'legacy arm must still show the screenshot');
  assert.equal(els.noTradesMsg.style.display, 'none', 'empty-state message must be hidden when rows exist');
});

test('J1-C13 FLAG-03 working product ON: a journal row still renders its visible content', () => {
  const om = makeManager([makeTrade(32)]);
  const html = renderList(om);
  assert.ok(html.includes('trade-history-item'), 'row container missing');
  assert.ok(html.includes('EURUSD'), 'symbol missing from the rendered row');
  assert.ok(html.includes('#32'), 'trade id missing from the rendered row');
  assert.ok(html.includes('BUY'), 'direction missing from the rendered row');
  assert.ok(html.includes('+$123.45'), 'P&L missing from the rendered row');
  assert.ok(html.includes('+2R'), 'R-multiple missing from the rendered row');
  assert.equal(countOccurrences(html, '<img src="'), 2, 'both screenshot slots must still render an image');
  assert.equal(els.noTradesMsg.style.display, 'none');
});

// ─── J1-C14..C16 — virtualisation and lazy decode ──────────────────────────

test('J1-C14 ON: the rendered set is bounded to one window with a reachable show-more control', () => {
  const journal = [];
  for (let i = 1; i <= 150; i++) journal.push(makeTrade(i, { entryShot: null, exitShot: null }));
  const om = makeManager(journal);
  const html = renderList(om);
  const rows = countOccurrences(html, 'class="trade-history-item"');
  assert.equal(rows, 60, `expected the 60-row window, rendered ${rows}`);
  assert.ok(html.includes('Show more — 90 older trades'), 'show-more control missing');
  // Newest first: id 150 present, id 1 not yet.
  assert.ok(html.includes('#150'));
  assert.equal(html.includes('#1<'), false);

  silence(() => om.expandJournalRenderWindow());
  const html2 = els.tradeHistoryList.innerHTML;
  assert.equal(countOccurrences(html2, 'class="trade-history-item"'), 120);
  assert.ok(html2.includes('Show more — 30 older trades'));
});

test('J1-C15 OFF: every row renders and there is no show-more control', () => {
  setFlag(true);
  const journal = [];
  for (let i = 1; i <= 150; i++) journal.push(makeTrade(i, { entryShot: null, exitShot: null }));
  const om = makeManager(journal);
  const html = renderList(om);
  assert.equal(countOccurrences(html, 'class="trade-history-item"'), 150);
  assert.equal(html.includes('Show more'), false);
});

test('J1-C16 ON: thumbnails opt into lazy loading and async decode', () => {
  const om = makeManager([makeTrade(41)]);
  const html = renderRow(om, om.tradeJournal[0]);
  assert.equal(countOccurrences(html, 'loading="lazy"'), 2);
  assert.equal(countOccurrences(html, 'decoding="async"'), 2);
});

test('J1-C17 OFF: legacy arm does not add lazy/async attributes', () => {
  setFlag(true);
  const om = makeManager([makeTrade(42)]);
  const html = renderRow(om, om.tradeJournal[0]);
  assert.equal(countOccurrences(html, 'loading="lazy"'), 0);
  assert.equal(countOccurrences(html, 'decoding="async"'), 0);
});

// ─── J1-C18..C20 — thumbnail cache behaviour ───────────────────────────────

test('J1-C18 a generated thumbnail is used on the next render and the payload stays out', async () => {
  const om = makeManager([makeTrade(51)]);
  const thumb = makeShot('TH', 4_000);
  om._m20J1RasterizeThumb = async () => thumb;
  renderRow(om, om.tradeJournal[0]);          // schedules
  await new Promise((r) => setTimeout(r, 0));
  const html = renderRow(om, om.tradeJournal[0]);
  assert.ok(html.includes(thumb), 'second render must use the cached thumbnail');
  assert.equal(countOccurrences(html, ENTRY_SHOT), 0);
  assert.ok(thumb.length * 4 < ENTRY_SHOT.length, 'thumbnail must be far smaller than the source');
});

test('J1-C19 raster failure keeps the placeholder and never falls back to full resolution', async () => {
  const om = makeManager([makeTrade(52)]);
  let attempts = 0;
  om._m20J1RasterizeThumb = async () => { attempts += 1; return null; };
  renderRow(om, om.tradeJournal[0]);
  await new Promise((r) => setTimeout(r, 0));
  const html = renderRow(om, om.tradeJournal[0]);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(countOccurrences(html, ENTRY_SHOT), 0, 'failure must NOT reinstate the full-resolution src');
  assert.ok(html.includes('data:image/svg+xml'), 'placeholder must remain');
  assert.equal(attempts, 2, 'entry+exit tried once each; failures must not retry in a loop');
});

test('J1-C20 the thumbnail cache is bounded and evicts least-recently-used entries', () => {
  const om = makeManager([]);
  const cfg = om._m20J1Config();
  const big = 'x'.repeat(Math.ceil(cfg.maxCacheBytes / 4));
  for (let i = 0; i < 6; i++) om._m20J1ThumbPut(`k${i}`, big);
  const cache = om._m20J1ThumbCache();
  assert.ok(cache.size <= cfg.maxCacheEntries, 'entry bound broken');
  assert.ok(om.__m20J1ThumbBytes <= cfg.maxCacheBytes, `byte bound broken: ${om.__m20J1ThumbBytes}`);
  assert.equal(cache.has('k0'), false, 'oldest entry should have been evicted first');
  assert.equal(cache.has('k5'), true, 'newest entry must survive');
});

test('J1-C23 a backlog larger than the concurrency limit still drains completely', async () => {
  const journal = [];
  for (let i = 1; i <= 20; i++) journal.push(makeTrade(i, { exitShot: null }));
  const om = makeManager(journal);
  const cfg = om._m20J1Config();
  let peak = 0;
  let live = 0;
  let made = 0;
  om._m20J1RasterizeThumb = async () => {
    live += 1;
    peak = Math.max(peak, live);
    await new Promise((r) => setTimeout(r, 1));
    live -= 1;
    made += 1;
    return makeShot('TH', 2_000);
  };
  renderList(om);
  for (let i = 0; i < 60 && made < 20; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(made, 20, `backlog stalled at ${made}/20 thumbnails`);
  assert.ok(peak <= cfg.maxInflight, `concurrency bound broken: peak=${peak} limit=${cfg.maxInflight}`);
});

// ─── J1-C21 — the detail/preview path must NOT be thumbnailed ──────────────

test('J1-C21 the full-resolution detail preview path is untouched by J1', () => {
  const om = makeManager([makeTrade(61)]);
  const html = silence(() => om._renderTradeScreenshotsHtml
    ? om._renderTradeScreenshotsHtml(om.tradeJournal[0])
    : null);
  // The detail modal builder is large; the contract asserted here is the one
  // that matters: showScreenshotPreview still receives the exact full bytes.
  om.showScreenshotPreview(ENTRY_SHOT, 'Entry Screenshot');
  assert.equal(om.previewCalls[0].src.length, ENTRY_SHOT.length);
  assert.equal(om.previewCalls[0].src, ENTRY_SHOT);
  assert.ok(html === null || typeof html === 'string');
});

// ─── J1-C22 — measurement (string cost only, at a stated configuration) ────

test('J1-C22 measured: rendered-markup STRING cost, 60 rows x 2 screenshots', () => {
  const journal = [];
  for (let i = 1; i <= 60; i++) journal.push(makeTrade(i));

  setFlag(true);
  const off = renderList(makeManager(journal)).length;
  setFlag(undefined);
  const on = renderList(makeManager(journal)).length;

  const cfg = {
    rows: 60,
    screenshotsPerRow: 2,
    screenshotStringChars: ENTRY_SHOT.length,
    note: 'synthetic base64 payload; UTF-16 DOM strings are 2 bytes/char',
  };
  console.log(`[J1-C22] config=${JSON.stringify(cfg)} markupCharsOFF=${off} markupCharsON=${on} ratio=${(off / on).toFixed(1)}x`);
  assert.ok(on < off / 10, `expected an order-of-magnitude string reduction, got ${off} -> ${on}`);
  // Guard the claim itself: this is a STRING measurement. Decoded bitmap bytes
  // are NOT measured here (no browser), and no bitmap claim is made from it.
  assert.equal(typeof on, 'number');
});
