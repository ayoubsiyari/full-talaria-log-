/**
 * M20-A1 / W2 — REAL-BROWSER / REAL-INDEXEDDB durability + lifecycle probe.
 *
 * PHASE 2026-07-24b: A1 CORRECTION VERIFICATION. The first run of this
 * harness recorded four RED findings (A1-F1 cross-account readability,
 * A1-F2 no retention/logout clean, A1-F3 versionchange wedge, A1-F4
 * premature put-success) against the quarantined A1 land. W2 has now fixed
 * all four inside the A1 section of order-manager.js; the F1–F4 scenarios
 * below VERIFY the fixes against real Chromium/IndexedDB and re-emit RED
 * findings only on regression. Verdict is GREEN only when every check
 * passes AND no RED finding is recorded.
 *
 * DOCUMENTED STUBS (minimal, page-side, never touch product files):
 *   - `Object.create(OrderManager.prototype)` — real methods, constructor
 *     skipped (constructor needs a full chart; A1 methods only read the
 *     instance fields stubbed below).
 *   - `om.chart = { getActiveTradingSessionId: () => <sessionId> }` — refId
 *     session scope.
 *   - `om.tradeJournal = []`, `om.closedPositions = []` — retained sets the
 *     sweep scans.
 *   - `om.scaledTrades = new Map()` — OPEN/CLOSED group gate.
 *   Everything else (`__m20A1*` caches, timers, DB promise) self-initializes
 *   inside the real methods.
 *
 * Run (from this harness directory, puppeteer 24.x installed here):
 *   node m20-a1-idb-real-browser-probe.mjs
 * Env:
 *   M20_A1_IDB_OUT   optional evidence JSON path override
 *   M20_A1_HEADFUL=1 headful Chromium
 *
 * Findings policy: every observed privacy/isolation or lifecycle gap is
 * recorded as a RED/BLOCK finding for the independent reviewer — the harness
 * does NOT patch product. Quota behavior is attempted via CDP
 * Storage.overrideQuotaForOrigin and marked NOT-MEASURABLE if uncontrollable.
 * Memory numbers are real browser heap (CDP GC + page.metrics) but remain
 * PRELIMINARY; serialize-byte numbers are proxies.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Repo root works from both trees. */
function findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'docs', 'plan3'))
      && fs.existsSync(path.join(dir, 'chart v 1.4'))) {
      return dir;
    }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error('repo root not found');
}
const REPO_ROOT = findRepoRoot(__dirname);
const OM_PATH = path.join(REPO_ROOT, 'chart v 1.4', 'chart', 'modules', 'order-manager.js');
const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs', 'plan3', 'evidence');
const OUT_PATH = process.env.M20_A1_IDB_OUT
  || path.join(EVIDENCE_DIR, 'W2-A1-IDB-REAL-BROWSER-20260724.PRELIMINARY.json');

const STATUS_MARK = 'A1-CORRECTION-RELEASE-GATES-PENDING-INDEPENDENT-REVIEW';
const KILL_SWITCH = '__TALARIA_DISABLE_M20_A1_SCREENSHOT_IDB_V1';
const DB_NAME = 'talaria_m20_a1_screenshots_v1';

const evidence = {
  status: STATUS_MARK,
  label: 'W2-FABLE-SIGNED',
  date: '2026-07-24',
  worker: 'W2-fable',
  killSwitch: KILL_SWITCH,
  dbName: DB_NAME,
  tooling: {},
  checks: [],
  findings: [],
  heap: null,
  quota: null,
};

let failures = 0;
function note(name, pass, detail = '') {
  evidence.checks.push({ name, pass: !!pass, detail: String(detail) });
  if (!pass) failures += 1;
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} [A1-IDB-BROWSER] ${name}${detail ? ` — ${detail}` : ''}\n`);
}

function finding(id, severity, summary, detail = '') {
  evidence.findings.push({ id, severity, summary, detail: String(detail) });
  process.stdout.write(`${severity} [A1-FINDING] ${id} — ${summary}\n`);
}

// ─── Tiny static server: host page + the REAL locked order-manager.js ──────

const HOST_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>A1 IDB probe host</title></head>
<body>
<script>
  window.__A1_REJECTIONS = [];
  window.addEventListener('unhandledrejection', (e) => {
    window.__A1_REJECTIONS.push(String((e && e.reason) || 'unknown'));
  });
  window.__A1_PAGE_ERRORS = [];
  window.addEventListener('error', (e) => {
    window.__A1_PAGE_ERRORS.push(String((e && e.message) || 'unknown'));
  });
</script>
<script src="/modules/order-manager.js"></script>
<script>
  // Harness bootstrap — DOCUMENTED STUBS ONLY (see probe header).
  // A1-F1 owner source: in production window.__talariaUserId is set by the
  // dist index auth bootstrap from the authenticated /api/auth/me response.
  window.__talariaUserId = '9001';
  window.__A1H = {
    omClassLoaded: typeof OrderManager === 'function',
    setOwner(id) { window.__talariaUserId = id == null ? undefined : String(id); },
    makeOm(sessionId) {
      const om = Object.create(OrderManager.prototype);
      const captured = { hot: [], critical: [] };
      om.__captured = captured;
      // Mutable session id so the ordering scenarios can switch mid-flight.
      om.chart = {
        __sessionId: sessionId,
        getActiveTradingSessionId() { return this.__sessionId; },
        scheduleSessionStateSave: (patch) => captured.hot.push(patch),
        queueCriticalSessionStateSave: (patch) => captured.critical.push(patch),
      };
      om.tradeJournal = [];
      om.closedPositions = [];
      om.scaledTrades = new Map();
      om.splitTrades = new Map();
      // Documented stubs for persistJournal peripherals (stats content is
      // irrelevant to the A1 assertions; journal routing is what's probed).
      om.buildPerInstrumentStats = () => ({});
      om.groupJournalByTicker = () => ({});
      return om;
    },
    // Deterministic per-row fixture: identity = (char, length).
    makeShot(i, base) {
      const ch = String.fromCharCode(65 + (i % 26));
      const len = (base || 60000) + i * 13;
      return 'data:image/jpeg;base64,' + ch.repeat(len);
    },
    shotSpec(s) {
      if (typeof s !== 'string' || !s.startsWith('data:image/')) return null;
      const body = s.slice('data:image/jpeg;base64,'.length);
      return { ch: body.charAt(0), len: body.length, total: s.length };
    },
    seedRow(i, base) {
      return {
        id: 1000 + i,
        tradeId: 1000 + i,
        ticker: 'EURUSD',
        netPnL: 12.5,
        entryScreenshot: this.makeShot(i, base),
        exitScreenshot: this.makeShot(i + 100, base),
        railScreenshots: [{ dataUrl: this.makeShot(i + 200, base), name: 'rail-' + i }],
        metadata: { entryScreenshot: this.makeShot(i + 300, base) },
        journalEntry: { exitScreenshot: this.makeShot(i + 400, base) },
      };
    },
    async sweepUntilDone(om, cap) {
      let last = null;
      for (let n = 0; n < (cap || 50); n++) {
        last = await om._m20A1RunRetainedSweepNow(16);
        if (!last || !last.pendingMore) break;
      }
      return last;
    },
    countNeeding(om) {
      let n = 0;
      for (const list of [om.tradeJournal, om.closedPositions]) {
        for (const row of list) if (om._m20A1RowNeedsExternalize(row)) n += 1;
      }
      return n;
    },
    rawGetAll(dbName, storeName) {
      return new Promise((resolve) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = () => {
          const db = req.result;
          try {
            const tx = db.transaction([storeName], 'readonly');
            const rq = tx.objectStore(storeName).getAll();
            rq.onsuccess = () => { const r = rq.result || []; db.close(); resolve(r); };
            rq.onerror = () => { db.close(); resolve([]); };
          } catch (_) { db.close(); resolve([]); }
        };
        req.onerror = () => resolve([]);
      });
    },
    // Raw delete bypassing product APIs (simulates browser eviction).
    rawDelete(dbName, storeName, key) {
      return new Promise((resolve) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = () => {
          const db = req.result;
          try {
            const tx = db.transaction([storeName], 'readwrite');
            tx.objectStore(storeName).delete(key);
            tx.oncomplete = () => { db.close(); resolve(true); };
            tx.onabort = () => { db.close(); resolve(false); };
          } catch (_) { db.close(); resolve(false); }
        };
        req.onerror = () => resolve(false);
      });
    },
    // Raw store write bypassing product APIs (seeds legacy v1 / foreign rows).
    rawPut(dbName, storeName, rec) {
      return new Promise((resolve) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = () => {
          const db = req.result;
          try {
            const tx = db.transaction([storeName], 'readwrite');
            tx.objectStore(storeName).put(rec);
            tx.oncomplete = () => { db.close(); resolve(true); };
            tx.onabort = () => { db.close(); resolve(false); };
          } catch (_) { db.close(); resolve(false); }
        };
        req.onerror = () => resolve(false);
      });
    },
  };
</script>
</body></html>`;

function startServer() {
  const omSource = fs.readFileSync(OM_PATH);
  const server = http.createServer((req, res) => {
    const url = String(req.url || '').split('?')[0];
    if (url === '/' || url === '/a1-host.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(HOST_HTML);
      return;
    }
    if (url === '/modules/order-manager.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(omSource);
      return;
    }
    res.writeHead(404); res.end('not found');
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

async function newProbePage(browserContext, srvUrl, { kill = false } = {}) {
  const page = await browserContext.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e && e.message)));
  if (kill) {
    await page.evaluateOnNewDocument((flag) => { window[flag] = true; }, KILL_SWITCH);
  }
  await page.goto(`${srvUrl}/a1-host.html`, { waitUntil: 'load' });
  const loaded = await page.evaluate(() => window.__A1H && window.__A1H.omClassLoaded === true);
  if (!loaded) throw new Error(`OrderManager failed to load standalone; pageErrors=${pageErrors.join(' | ')}`);
  return { page, pageErrors };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const srv = await startServer();
  const browser = await puppeteer.launch({
    headless: !process.env.M20_A1_HEADFUL,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--js-flags=--expose-gc'],
    defaultViewport: { width: 1100, height: 800 },
  });
  evidence.tooling = {
    browser: await browser.version(),
    puppeteer: '24.43.1',
    node: process.version,
    origin: srv.url,
  };
  process.stdout.write(`[A1-IDB-BROWSER] ${evidence.tooling.browser} via puppeteer ${evidence.tooling.puppeteer} on node ${evidence.tooling.node}\n`);

  try {
    // ════════ Context A — main battery (one real origin/profile) ════════
    const ctxA = await browser.createBrowserContext();
    const { page, pageErrors } = await newProbePage(ctxA, srv.url);
    const cdp = await page.createCDPSession();

    // A-1 first open / upgrade.
    const firstOpen = await page.evaluate(async () => {
      const om = window.__A1H.makeOm('sessA');
      window.__omMain = om;
      const db = await om._m20A1OpenIdb();
      const dbs = (await indexedDB.databases()).map((d) => `${d.name}@v${d.version}`);
      return db ? {
        ok: true,
        name: db.name,
        version: db.version,
        stores: Array.from(db.objectStoreNames),
        keyPath: db.transaction(['screenshots']).objectStore('screenshots').keyPath,
        databases: dbs,
      } : { ok: false, databases: dbs };
    });
    note('first-open-upgrade',
      firstOpen.ok && firstOpen.name === DB_NAME && firstOpen.version === 1
      && firstOpen.stores.length === 1 && firstOpen.stores[0] === 'screenshots'
      && firstOpen.keyPath === 'refId',
      `${firstOpen.name}@v${firstOpen.version} stores=[${firstOpen.stores}] keyPath=${firstOpen.keyPath}`);

    // A-2 put/get exact bytes (real store round-trip + raw read-back).
    const putGet = await page.evaluate(async () => {
      const om = window.__omMain;
      const blob = window.__A1H.makeShot(7, 300000);
      const ok = await om._m20A1IdbPut({
        refId: 'a1:probe:pg:entry', sessionId: 'sessA', tradeId: 'pg', role: 'entry',
        mime: 'image/jpeg', byteLength: blob.length, createdAt: Date.now(), blob,
      });
      const rec = await om._m20A1IdbGet('a1:probe:pg:entry');
      const raw = await window.__A1H.rawGetAll('talaria_m20_a1_screenshots_v1', 'screenshots');
      const rawRec = raw.find((r) => r.refId === 'a1:probe:pg:entry');
      return {
        ok,
        exact: !!rec && rec.blob === blob,
        rawExact: !!rawRec && rawRec.blob === blob,
        bytes: blob.length,
        miss: (await om._m20A1IdbGet('a1:probe:missing')) === null,
      };
    });
    note('put-get-exact-bytes', putGet.ok && putGet.exact && putGet.rawExact && putGet.miss,
      `bytes=${putGet.bytes} omGet=exact rawIDB=exact miss→null`);

    // A-3 heap baseline → seed → sweep (REAL browser heap via CDP GC).
    const gc = async () => { try { await cdp.send('HeapProfiler.collectGarbage'); } catch (_) {} };
    await gc();
    const heap0 = (await page.metrics()).JSHeapUsedSize;
    const seeded = await page.evaluate(() => {
      const om = window.__omMain;
      for (let i = 0; i < 30; i++) om.tradeJournal.push(window.__A1H.seedRow(i, 60000));
      for (let i = 30; i < 40; i++) om.closedPositions.push(window.__A1H.seedRow(i, 60000));
      return { needing: window.__A1H.countNeeding(om) };
    });
    await gc();
    const heapSeeded = (await page.metrics()).JSHeapUsedSize;
    const sweep1 = await page.evaluate(async () => {
      const om = window.__omMain;
      const last = await window.__A1H.sweepUntilDone(om);
      const stillNeeding = window.__A1H.countNeeding(om);
      const marked = om.tradeJournal.filter((r) => r.m20_a1_screenshot_idb_v1 === true).length
        + om.closedPositions.filter((r) => r.m20_a1_screenshot_idb_v1 === true).length;
      const raw = await window.__A1H.rawGetAll('talaria_m20_a1_screenshots_v1', 'screenshots');
      // Drop the bounded cache so the heap delta shows the retained-row win.
      om.__m20A1BlobCache = null; om.__m20A1BlobCacheBytes = 0;
      return { last, stillNeeding, marked, idbRecords: raw.length, needingBefore: 40 };
    });
    await gc();
    const heapAfter = (await page.metrics()).JSHeapUsedSize;
    note('sweep-externalizes-all',
      seeded.needing === 40 && sweep1.stillNeeding === 0 && sweep1.marked === 40
      && sweep1.idbRecords >= 40 * 5,
      `needing 40→0, marked=${sweep1.marked}, idbRecords=${sweep1.idbRecords}`);
    // Proportional gate: post-sweep heap must return most of the seeded delta
    // (absolute MB varies with V8 string representation; the *shape* is the claim).
    const seededDelta = Math.max(1, heapSeeded - heap0);
    const dropFrac = (heapSeeded - heapAfter) / seededDelta;
    note('real-heap-drop-after-sweep', heapAfter < heapSeeded && dropFrac >= 0.6,
      `heap ${(heap0 / 1048576).toFixed(1)}MB → seeded ${(heapSeeded / 1048576).toFixed(1)}MB → post-sweep ${(heapAfter / 1048576).toFixed(1)}MB (returned ${(dropFrac * 100).toFixed(0)}% of seeded delta, real browser heap)`);
    evidence.heap = {
      baselineBytes: heap0, seededBytes: heapSeeded, postSweepBytes: heapAfter,
      dropBytes: heapSeeded - heapAfter, measured: 'CDP HeapProfiler.collectGarbage + page.metrics',
    };

    // A-4 grouped OPEN→CLOSED gate.
    const grouped = await page.evaluate(async () => {
      const om = window.__omMain;
      const row = window.__A1H.seedRow(500, 30000);
      row.tradeGroupId = 'G1';
      om.tradeJournal.push(row);
      om.scaledTrades.set('G1', { status: 'OPEN' });
      await window.__A1H.sweepUntilDone(om);
      const skippedWhileOpen = om._m20A1RowNeedsExternalize(row);
      om.scaledTrades.set('G1', { status: 'CLOSED' });
      await window.__A1H.sweepUntilDone(om);
      const externalizedAfterClose = !om._m20A1RowNeedsExternalize(row) && !!row.entryScreenshotRef;
      return { skippedWhileOpen, externalizedAfterClose };
    });
    note('grouped-open-to-closed', grouped.skippedWhileOpen && grouped.externalizedAfterClose,
      'OPEN skipped, CLOSED externalized');

    // A-5 mixed legacy + ref rows.
    const mixed = await page.evaluate(async () => {
      const om = window.__omMain;
      const legacy = { id: 9001, tradeId: 9001, ticker: 'EURUSD', entryScreenshot: window.__A1H.makeShot(90, 40000) };
      const legacyBytes = legacy.entryScreenshot.length;
      // Display path BEFORE sweep: legacy row passes through identity (no refs).
      const passThrough = om._m20A1TradeForDisplay(legacy, null) === legacy;
      // Persist-side detector sees mixed lists correctly.
      const refRow = om.tradeJournal[0];
      const mixedHasRefs = om._m20A1RowsHaveScreenshotRefs([legacy, refRow]);
      const legacyOnlyHasRefs = om._m20A1RowsHaveScreenshotRefs([legacy]);
      // Rehydrate on a legacy row is a no-op (blob kept byte-identical).
      const clone = JSON.parse(JSON.stringify(legacy));
      await om._m20A1RehydrateRowForDurablePersist(clone);
      const legacyUntouched = clone.entryScreenshot.length === legacyBytes;
      return { passThrough, mixedHasRefs, legacyOnlyHasRefs, legacyUntouched };
    });
    note('mixed-legacy-and-ref-rows',
      mixed.passThrough && mixed.mixedHasRefs && !mixed.legacyOnlyHasRefs && mixed.legacyUntouched,
      'legacy identity pass-through; detector exact; rehydrate no-op on legacy');

    // A-6 persist/export/server re-embed (byte-exact vs deterministic fixture).
    const reembed = await page.evaluate(async () => {
      const om = window.__omMain;
      const clones = JSON.parse(JSON.stringify(om.tradeJournal.slice(0, 10)));
      await om._m20A1RehydrateRowsForDurablePersist(clones);
      let exact = 0; let total = 0; let embeddedBytes = 0;
      for (let i = 0; i < clones.length; i++) {
        const row = clones[i];
        const checks = [
          [row.entryScreenshot, window.__A1H.shotSpec(window.__A1H.makeShot(i, 60000))],
          [row.exitScreenshot, window.__A1H.shotSpec(window.__A1H.makeShot(i + 100, 60000))],
          [row.railScreenshots && row.railScreenshots[0] && row.railScreenshots[0].dataUrl,
            window.__A1H.shotSpec(window.__A1H.makeShot(i + 200, 60000))],
          [row.metadata && row.metadata.entryScreenshot, window.__A1H.shotSpec(window.__A1H.makeShot(i + 300, 60000))],
          [row.journalEntry && row.journalEntry.exitScreenshot, window.__A1H.shotSpec(window.__A1H.makeShot(i + 400, 60000))],
        ];
        for (const [blob, want] of checks) {
          total += 1;
          const got = window.__A1H.shotSpec(blob);
          if (got && want && got.ch === want.ch && got.len === want.len) exact += 1;
          if (got) embeddedBytes += got.total;
        }
      }
      const serialized = JSON.stringify(clones).length;
      return { exact, total, embeddedBytes, serialized };
    });
    note('durable-reembed-byte-exact', reembed.exact === reembed.total && reembed.total === 50,
      `${reembed.exact}/${reembed.total} blobs byte-exact (incl. nested je/meta); durableBytes=${reembed.serialized}`);

    // A-7 manager/page RELOAD rehydrate (real navigation, fresh OM, same DB).
    const refRowsJson = await page.evaluate(() => JSON.stringify(
      window.__omMain.tradeJournal.slice(0, 6),
    ));
    await page.reload({ waitUntil: 'load' });
    const reload = await page.evaluate(async (json) => {
      const om = window.__A1H.makeOm('sessA'); // fresh instance, fresh memoized promise
      const rows = JSON.parse(json);
      await om._m20A1RehydrateRowsForDurablePersist(rows);
      let exact = 0; let total = 0;
      for (let i = 0; i < rows.length; i++) {
        total += 1;
        const got = window.__A1H.shotSpec(rows[i].entryScreenshot);
        const want = window.__A1H.shotSpec(window.__A1H.makeShot(i, 60000));
        if (got && want && got.ch === want.ch && got.len === want.len) exact += 1;
      }
      window.__omMain = om;
      return { exact, total };
    }, refRowsJson);
    note('page-reload-rehydrate', reload.exact === reload.total && reload.total === 6,
      `${reload.exact}/${reload.total} entry blobs byte-exact after real page reload`);

    // A-8 concurrent sweep + rehydrate + busy short-circuit.
    const concurrent = await page.evaluate(async (json) => {
      const om = window.__omMain;
      for (let i = 600; i < 620; i++) om.tradeJournal.push(window.__A1H.seedRow(i, 30000));
      const refRows = JSON.parse(json);
      const p1 = om._m20A1RunRetainedSweepNow(999);
      const p2 = om._m20A1RunRetainedSweepNow(999); // must short-circuit busy
      const p3 = om._m20A1RehydrateRowsForDurablePersist(refRows);
      const [r1, r2, rows] = await Promise.all([p1, p2, p3]);
      await window.__A1H.sweepUntilDone(om);
      return {
        firstExternalized: r1.externalized,
        busyShortCircuit: r2.busy === true && r2.externalized === 0,
        rehydrated: rows.every((r) => typeof r.entryScreenshot === 'string' && r.entryScreenshot.length > 80),
        allDone: window.__A1H.countNeeding(om) === 0,
        rejections: window.__A1_REJECTIONS.length,
      };
    }, refRowsJson);
    note('concurrent-sweep-rehydrate',
      concurrent.busyShortCircuit && concurrent.rehydrated && concurrent.allDone
      && concurrent.rejections === 0,
      `busy-flag honored; rehydrate-during-sweep exact; needing=0; rejections=${concurrent.rejections}`);

    // A-9 stale selection / rerender race.
    const race = await page.evaluate(async () => {
      const om = window.__A1H.makeOm('sessA'); // fresh cache — refs uncached
      const rowsRaw = await window.__A1H.rawGetAll('talaria_m20_a1_screenshots_v1', 'screenshots');
      const refA = rowsRaw.find((r) => r.refId.includes(':1000:entry'));
      const refB = rowsRaw.find((r) => r.refId.includes(':1001:entry'));
      const tradeA = { id: 1, entryScreenshotRef: { refId: refA.refId } };
      const tradeB = { id: 2, entryScreenshotRef: { refId: refB.refId } };
      window.__rr = 0;
      const rerender = { key: 'modal', fn: () => { window.__rr += 1; } };
      const viewA1 = om._m20A1TradeForDisplay(tradeA, rerender);
      // User switches selection immediately (stale A prefetch in flight).
      const viewB1 = om._m20A1TradeForDisplay(tradeB, rerender);
      await new Promise((r) => setTimeout(r, 700)); // debounce 120ms + IDB
      const viewB2 = om._m20A1TradeForDisplay(tradeB, rerender);
      const viewA2 = om._m20A1TradeForDisplay(tradeA, rerender);
      return {
        neitherEarly: !viewA1.entryScreenshot && !viewB1.entryScreenshot,
        bGotB: viewB2.entryScreenshot === refB.blob,
        aGotA: viewA2.entryScreenshot === refA.blob,
        noCrossContamination: viewB2.entryScreenshot !== refA.blob,
        rerenders: window.__rr,
        budgetHeld: window.__rr >= 1 && window.__rr <= 3,
        rejections: window.__A1_REJECTIONS.length,
      };
    });
    note('stale-selection-rerender-race',
      race.neitherEarly && race.bGotB && race.aGotA && race.noCrossContamination
      && race.budgetHeld && race.rejections === 0,
      `B shows B's exact bytes (never A's); rerenders=${race.rerenders} (≤3 budget); rejections=0`);

    // A-10 cache eviction / bounds against the real DB.
    const cache = await page.evaluate(async () => {
      const om = window.__A1H.makeOm('sessA');
      const raw = await window.__A1H.rawGetAll('talaria_m20_a1_screenshots_v1', 'screenshots');
      const ids = raw.slice(0, 40).map((r) => r.refId);
      for (const id of ids) await om._m20A1ResolveRefBlob(id, { cache: true });
      const c = om._m20A1Cache();
      const lim = om._m20A1CacheLimits();
      const oldestEvicted = !c.has(ids[0]);
      const newestKept = c.has(ids[ids.length - 1]);
      // Evicted ref still resolves from the REAL store.
      const again = await om._m20A1ResolveRefBlob(ids[0], { cache: false });
      return {
        size: c.size, bytes: om.__m20A1BlobCacheBytes, maxEntries: lim.maxEntries,
        maxBytes: lim.maxBytes, oldestEvicted, newestKept, evictedStillInIdb: !!again,
      };
    });
    note('cache-eviction-bounds',
      cache.size <= cache.maxEntries && cache.bytes <= cache.maxBytes
      && cache.oldestEvicted && cache.newestKept && cache.evictedStillInIdb,
      `entries=${cache.size}/${cache.maxEntries} bytes=${cache.bytes}; LRU evicts oldest; evicted refetches from real IDB`);

    // A-11 fail-soft: forced put throw, then REAL aborted transaction.
    const failSoft = await page.evaluate(async () => {
      const om = window.__omMain;
      const row = window.__A1H.seedRow(700, 30000);
      om.tradeJournal.push(row);
      const orig = IDBObjectStore.prototype.put;
      // Phase 1: synchronous throw inside put.
      IDBObjectStore.prototype.put = function () { throw new DOMException('harness-forced', 'AbortError'); };
      const r1 = await om._m20A1RunRetainedSweepNow(999);
      const keptBlobAfterThrow = om._m20A1RowNeedsExternalize(row) && !row.entryScreenshotRef;
      // Phase 2: REAL transaction abort (request issued, tx aborted mid-flight).
      IDBObjectStore.prototype.put = function (...args) {
        const rq = orig.apply(this, args);
        const tx = this.transaction;
        Promise.resolve().then(() => { try { tx.abort(); } catch (_) {} });
        return rq;
      };
      const r2 = await om._m20A1RunRetainedSweepNow(999);
      const keptBlobAfterAbort = om._m20A1RowNeedsExternalize(row) && !row.entryScreenshotRef;
      // Phase 3: restore — retry externalizes (capture bytes never lost).
      IDBObjectStore.prototype.put = orig;
      await window.__A1H.sweepUntilDone(om);
      const recoveredAfterRestore = !om._m20A1RowNeedsExternalize(row) && !!row.entryScreenshotRef;
      return {
        aborted1: r1.aborted === true,
        keptBlobAfterThrow,
        aborted2: r2.aborted === true,
        keptBlobAfterAbort,
        recoveredAfterRestore,
        rejections: window.__A1_REJECTIONS.length,
      };
    });
    note('fail-soft-put-throw-and-real-tx-abort',
      failSoft.aborted1 && failSoft.keptBlobAfterThrow && failSoft.aborted2
      && failSoft.keptBlobAfterAbort && failSoft.recoveredAfterRestore && failSoft.rejections === 0,
      'sync throw + REAL tx.abort both fail-soft (blobs retained); retry after recovery externalizes');

    // A-11b F4 FIX VERIFY — REAL abort AFTER request-success (the
    // quota-at-commit window). The corrected _m20A1IdbPut resolves only on
    // tx.oncomplete: an abort between request-success and commit must return
    // false, keep the in-row blob, write no ref — and a retry must succeed.
    const commitWindow = await page.evaluate(async () => {
      const om = window.__omMain;
      const row = window.__A1H.seedRow(800, 30000);
      const expected = window.__A1H.shotSpec(row.entryScreenshot);
      om.tradeJournal.push(row);
      const orig = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        const rq = orig.apply(this, args);
        const tx = this.transaction;
        // Fires alongside any request-success listener, then aborts pre-commit.
        rq.addEventListener('success', () => { try { tx.abort(); } catch (_) {} });
        return rq;
      };
      const run = await om._m20A1RunRetainedSweepNow(999);
      const refSetDuringAbort = !!row.entryScreenshotRef;
      const blobKeptDuringAbort = typeof row.entryScreenshot === 'string'
        && row.entryScreenshot.length === expected.total;
      IDBObjectStore.prototype.put = orig;
      // Retry after the abort condition clears (quota freed / IO recovered).
      await window.__A1H.sweepUntilDone(om);
      const externalizedOnRetry = !om._m20A1RowNeedsExternalize(row) && !!row.entryScreenshotRef;
      let durable = null;
      if (row.entryScreenshotRef) durable = await om._m20A1IdbGet(row.entryScreenshotRef.refId);
      const retryDurable = !!(durable && durable.blob && durable.blob.length === expected.total);
      om.tradeJournal.pop();
      return {
        abortedRun: run.aborted === true,
        refSetDuringAbort,
        blobKeptDuringAbort,
        externalizedOnRetry,
        retryDurable,
        rejections: window.__A1_REJECTIONS.length,
        expectedBytes: expected.total,
      };
    });
    const f4Fixed = commitWindow.abortedRun && !commitWindow.refSetDuringAbort
      && commitWindow.blobKeptDuringAbort && commitWindow.externalizedOnRetry
      && commitWindow.retryDurable && commitWindow.rejections === 0;
    note('f4-commit-abort-after-success-fail-soft', f4Fixed,
      f4Fixed
        ? `FIXED: pre-commit abort → put=false, blob retained (${commitWindow.expectedBytes} bytes), no ref; retry externalized durably; rejections=0`
        : `REGRESSION: abortedRun=${commitWindow.abortedRun} refSet=${commitWindow.refSetDuringAbort} blobKept=${commitWindow.blobKeptDuringAbort} retry=${commitWindow.externalizedOnRetry}/${commitWindow.retryDurable} rejections=${commitWindow.rejections}`);
    if (!f4Fixed) {
      finding('A1-F4', 'RED',
        'Commit-window durability regression: put succeeded / row mutated before transaction oncomplete',
        `Real-tx demonstration failed the fixed contract: ${JSON.stringify(commitWindow)}`);
    }

    // A-12 F1 FIX VERIFY — account change on the shared same-origin profile:
    // a different authenticated account must not read another account's
    // records through product APIs (owner-validated get/resolve).
    const residue = await page.evaluate(async () => {
      const raw = await window.__A1H.rawGetAll('talaria_m20_a1_screenshots_v1', 'screenshots');
      const userARecord = raw.find((r) => r.owner === '9001' && r.blob && r.blob.length > 1000);
      const ownersPresent = Array.from(new Set(raw.map((r) => String(r.owner)))).slice(0, 5);
      // Account change: the auth bootstrap now reports a different user id.
      window.__A1H.setOwner('7777');
      const omUserB = window.__A1H.makeOm('sessB-otherUser');
      const readByB = userARecord ? await omUserB._m20A1IdbGet(userARecord.refId) : null;
      const blobByB = userARecord ? await omUserB._m20A1ResolveRefBlob(userARecord.refId) : null;
      window.__A1H.setOwner('9001'); // restore for later scenarios
      const readBack = userARecord ? await window.__omMain._m20A1IdbGet(userARecord.refId) : null;
      return {
        totalRecordsVisible: raw.length,
        ownersPresent,
        allOwnerStamped: raw.every((r) => r.owner != null),
        haveUserARecord: !!userARecord,
        userARecordReadableByB: !!(readByB && readByB.blob === userARecord.blob),
        blobReadableByB: !!blobByB,
        ownerStillReads: !!(readBack && readBack.blob === userARecord.blob),
      };
    });
    const f1Fixed = residue.haveUserARecord && residue.allOwnerStamped
      && !residue.userARecordReadableByB && !residue.blobReadableByB && residue.ownerStillReads;
    note('f1-cross-account-read-blocked', f1Fixed,
      f1Fixed
        ? `FIXED: ${residue.totalRecordsVisible} records all owner-stamped (owners=${residue.ownersPresent.join(',')}); foreign get/resolve→null; owner still byte-exact`
        : `REGRESSION: ${JSON.stringify(residue)}`);
    if (!f1Fixed) {
      finding('A1-F1', 'RED',
        'Cross-account isolation regression: foreign account read another account\'s record or records not owner-stamped',
        JSON.stringify(residue));
    }

    // A-12b F1 FIX VERIFY — legacy ownerless v1 records: adopt only when
    // referenced by the current account's loaded journal; else quarantine.
    const adoption = await page.evaluate(async () => {
      const shot = window.__A1H.makeShot(31, 20000);
      await window.__A1H.rawPut('talaria_m20_a1_screenshots_v1', 'screenshots', {
        refId: 'a1:sessLegacy:70:entry', sessionId: 'sessLegacy', tradeId: 70, role: 'entry',
        mime: 'image/jpeg', byteLength: shot.length, createdAt: Date.now(), blob: shot,
      });
      await window.__A1H.rawPut('talaria_m20_a1_screenshots_v1', 'screenshots', {
        refId: 'a1:sessLegacy:71:entry', sessionId: 'sessLegacy', tradeId: 71, role: 'entry',
        mime: 'image/jpeg', byteLength: shot.length, createdAt: Date.now(), blob: shot,
      });
      const om = window.__A1H.makeOm('sessLegacy');
      // Only :70: is referenced by the current account's loaded journal.
      om.tradeJournal.push({
        id: 70, tradeId: 70, ticker: 'EURUSD', entryScreenshot: null,
        entryScreenshotRef: { refId: 'a1:sessLegacy:70:entry' },
        m20_a1_screenshot_idb_v1: true,
      });
      const reachable = await om._m20A1IdbGet('a1:sessLegacy:70:entry');
      const orphan = await om._m20A1IdbGet('a1:sessLegacy:71:entry');
      await new Promise((r) => setTimeout(r, 400)); // async durable adoption
      const raw = await window.__A1H.rawGetAll('talaria_m20_a1_screenshots_v1', 'screenshots');
      const adopted = raw.find((r) => r.refId === 'a1:sessLegacy:70:entry');
      const quarantined = raw.find((r) => r.refId === 'a1:sessLegacy:71:entry');
      return {
        reachableReadable: !!(reachable && reachable.blob === shot),
        orphanBlocked: orphan === null,
        adoptedOwner: adopted && adopted.owner,
        quarantinedOwner: quarantined ? String(quarantined.owner) : 'absent',
        rejections: window.__A1_REJECTIONS.length,
      };
    });
    const adoptionOk = adoption.reachableReadable && adoption.orphanBlocked
      && adoption.adoptedOwner === '9001'
      && (adoption.quarantinedOwner === 'null' || adoption.quarantinedOwner === 'undefined')
      && adoption.rejections === 0;
    note('f1-legacy-adopt-if-reachable-else-quarantine', adoptionOk,
      adoptionOk
        ? 'FIXED: referenced v1 record readable + durably adopted (owner=9001); orphan quarantined (get→null, never claimed)'
        : `REGRESSION: ${JSON.stringify(adoption)}`);
    if (!adoptionOk) {
      finding('A1-F1', 'RED', 'Legacy v1 migration regression (adopt/quarantine contract broken)',
        JSON.stringify(adoption));
    }

    // A-12c F2 FIX VERIFY — retention mark/sweep + logout privacy clean
    // against the REAL store.
    const retention = await page.evaluate(async () => {
      const om = window.__omMain;
      const shot = window.__A1H.makeShot(51, 20000);
      const OLD = Date.now() - 40 * 24 * 60 * 60 * 1000;
      await window.__A1H.rawPut('talaria_m20_a1_screenshots_v1', 'screenshots', {
        refId: 'ret:mine:aged', owner: '9001', sessionId: 'sessGone', tradeId: 1, role: 'entry',
        mime: 'image/jpeg', byteLength: shot.length, createdAt: OLD, blob: shot,
      });
      await window.__A1H.rawPut('talaria_m20_a1_screenshots_v1', 'screenshots', {
        refId: 'ret:legacy:aged', sessionId: 'sessGone', tradeId: 2, role: 'entry',
        mime: 'image/jpeg', byteLength: shot.length, createdAt: OLD, blob: shot,
      });
      await window.__A1H.rawPut('talaria_m20_a1_screenshots_v1', 'screenshots', {
        refId: 'ret:foreign:aged', owner: '7777', sessionId: 'sessGone', tradeId: 3, role: 'entry',
        mime: 'image/jpeg', byteLength: shot.length, createdAt: OLD, blob: shot,
      });
      // Age a REACHABLE record too — reachability must outrank age.
      const reachableRef = om.tradeJournal.find((r) => r.entryScreenshotRef)?.entryScreenshotRef.refId || null;
      if (reachableRef) {
        const raw0 = await window.__A1H.rawGetAll('talaria_m20_a1_screenshots_v1', 'screenshots');
        const rec = raw0.find((r) => r.refId === reachableRef);
        rec.createdAt = OLD;
        await window.__A1H.rawPut('talaria_m20_a1_screenshots_v1', 'screenshots', rec);
      }
      const res = await om._m20A1RunRetentionSweepNow();
      const raw = await window.__A1H.rawGetAll('talaria_m20_a1_screenshots_v1', 'screenshots');
      const has = (id) => raw.some((r) => r.refId === id);
      return {
        result: res,
        reachableKept: reachableRef ? has(reachableRef) : false,
        mineAgedDeleted: !has('ret:mine:aged'),
        legacyAgedDeleted: !has('ret:legacy:aged'),
        foreignKept: has('ret:foreign:aged'),
        rejections: window.__A1_REJECTIONS.length,
      };
    });
    const retentionOk = retention.reachableKept && retention.mineAgedDeleted
      && retention.legacyAgedDeleted && retention.foreignKept && retention.rejections === 0;
    note('f2-retention-mark-sweep-real-idb', retentionOk,
      retentionOk
        ? `FIXED: aged own orphan + aged v1 quarantine expired; reachable kept (even aged); foreign untouched (scanned=${retention.result.scanned} deleted=${retention.result.deleted})`
        : `REGRESSION: ${JSON.stringify(retention)}`);
    if (!retentionOk) {
      finding('A1-F2', 'RED', 'Retention mark/sweep regression on real IndexedDB',
        JSON.stringify(retention));
    }

    const logoutClean = await page.evaluate(async () => {
      const om = window.__omMain;
      const rawBefore = await window.__A1H.rawGetAll('talaria_m20_a1_screenshots_v1', 'screenshots');
      const mineBefore = rawBefore.filter((r) => r.owner === '9001').length;
      // Default (no durable confirmation, e.g. offline): must NOT bulk-delete.
      const safe = await om._m20A1PrivacyCleanOnLogout();
      const rawMid = await window.__A1H.rawGetAll('talaria_m20_a1_screenshots_v1', 'screenshots');
      const reachableSurvived = rawMid.filter((r) => r.owner === '9001').length > 0;
      // Confirmed durable persist → own records wiped; foreign records stay.
      const om2 = window.__A1H.makeOm('sessA');
      const wipe = await om2._m20A1PrivacyCleanOnLogout({ confirmDurable: true });
      const rawAfter = await window.__A1H.rawGetAll('talaria_m20_a1_screenshots_v1', 'screenshots');
      window.__omMain = window.__A1H.makeOm('sessA'); // fresh OM for later scenarios
      return {
        mineBefore,
        safeTornDown: safe.tornDown === true,
        reachableSurvived,
        mineAfterWipe: rawAfter.filter((r) => r.owner === '9001').length,
        foreignAfterWipe: rawAfter.filter((r) => r.owner === '7777').length,
        wipeDeleted: wipe.deleted,
        connectionReleased: om2.__m20A1DbPromise === null,
        rejections: window.__A1_REJECTIONS.length,
      };
    });
    const logoutOk = logoutClean.mineBefore > 0 && logoutClean.safeTornDown
      && logoutClean.reachableSurvived && logoutClean.mineAfterWipe === 0
      && logoutClean.foreignAfterWipe > 0 && logoutClean.connectionReleased
      && logoutClean.rejections === 0;
    note('f2-logout-privacy-clean', logoutOk,
      logoutOk
        ? `FIXED: default logout keeps reachable records (no unsafe delete before durable re-embed); confirmDurable wiped ${logoutClean.wipeDeleted} own records, foreign kept, connection released`
        : `REGRESSION: ${JSON.stringify(logoutClean)}`);
    if (!logoutOk) {
      finding('A1-F2', 'RED', 'Logout privacy-clean regression', JSON.stringify(logoutClean));
    }

    // A-13 cleanup APIs present + owner validation in the A1 section (source audit).
    const omSrc = fs.readFileSync(OM_PATH, 'utf8');
    const a1Start = omSrc.indexOf('M20-A1 — retained screenshots');
    const a1End = omSrc.indexOf('_m19ExcursionSampleCount');
    const a1Slice = omSrc.slice(a1Start, a1End > a1Start ? a1End : a1Start + 80_000);
    const hasCleanupApis = /_m20A1CloseIdb/.test(a1Slice)
      && /_m20A1Teardown/.test(a1Slice)
      && /_m20A1IdbDelete/.test(a1Slice)
      && /_m20A1RunRetentionSweepNow/.test(a1Slice)
      && /_m20A1PrivacyCleanOnLogout/.test(a1Slice)
      && /onversionchange/.test(a1Slice)
      && /_m20A1OwnerKey/.test(a1Slice);
    note('cleanup-and-owner-apis-present-in-A1-section', hasCleanupApis,
      hasCleanupApis
        ? 'close/teardown/delete/retention/logout/versionchange/owner APIs all present (F1–F3 remedies in source)'
        : 'MISSING one or more of the F1–F3 remedy APIs in the A1 section');

    // A-14 F3 FIX VERIFY — versionchange / upgrade / delete lifecycle: with
    // A1's connection held, a v2 open and a deleteDatabase must BOTH succeed
    // (onversionchange closes the held connection + clears the cached
    // promise); teardown is idempotent; A1 reopens cleanly afterwards.
    const lifecycle = await page.evaluate(async () => {
      const om = window.__omMain;
      const db = await om._m20A1OpenIdb(); // A1's live held connection
      const hasVersionChangeHandler = !!db && typeof db.onversionchange === 'function';
      const tryOpenV2 = await new Promise((resolve) => {
        let blocked = false;
        const req = indexedDB.open('talaria_m20_a1_screenshots_v1', 2);
        req.onblocked = () => { blocked = true; };
        req.onupgradeneeded = () => {};
        req.onsuccess = () => { try { req.result.close(); } catch (_) {} resolve({ blocked, upgraded: true }); };
        req.onerror = () => resolve({ blocked, upgraded: false, error: true });
        setTimeout(() => resolve({ blocked, upgraded: false, timedOut: true }), 1500);
      });
      const promiseCleared = om.__m20A1DbPromise === null;
      const tryDelete = await new Promise((resolve) => {
        let blocked = false;
        const req = indexedDB.deleteDatabase('talaria_m20_a1_screenshots_v1');
        req.onblocked = () => { blocked = true; };
        req.onsuccess = () => resolve({ blocked, deleted: true });
        req.onerror = () => resolve({ blocked, deleted: false, error: true });
        setTimeout(() => resolve({ blocked, deleted: false, timedOut: true }), 1500);
      });
      // Idempotent teardown + clean reopen (recreates v1 after the delete).
      om._m20A1Teardown();
      om._m20A1Teardown();
      const reopened = await om._m20A1OpenIdb();
      const reopenOk = !!reopened && reopened.version === 1;
      return { hasVersionChangeHandler, tryOpenV2, promiseCleared, tryDelete, reopenOk };
    });
    const f3Fixed = lifecycle.hasVersionChangeHandler && lifecycle.tryOpenV2.upgraded === true
      && lifecycle.promiseCleared && lifecycle.tryDelete.deleted === true && lifecycle.reopenOk;
    note('f3-upgrade-delete-unwedged', f3Fixed,
      f3Fixed
        ? `FIXED: onversionchange installed; open(v2) upgraded=${lifecycle.tryOpenV2.upgraded}; cached promise cleared; deleteDatabase deleted=${lifecycle.tryDelete.deleted}; idempotent teardown + clean v1 reopen`
        : `REGRESSION: ${JSON.stringify(lifecycle)}`);
    if (!f3Fixed) {
      finding('A1-F3', 'RED',
        'Lifecycle regression: held connection wedges upgrade/delete or teardown broken',
        JSON.stringify(lifecycle));
    }

    // A-15 timer / rejection hygiene after full battery.
    await sleep(1600); // let any scheduled sweep debounce (1200ms) fire + settle
    const hygiene = await page.evaluate(async () => {
      const om = window.__omMain;
      om._m20A1ScheduleRetainedSweep('hygiene'); // schedule + let it run
      await new Promise((r) => setTimeout(r, 1700));
      return {
        sweepTimerNull: om.__m20A1SweepTimer == null,
        sweepActive: om.__m20A1SweepActive === true,
        rerenderTimers: om.__m20A1RerenderTimers ? om.__m20A1RerenderTimers.size : 0,
        prefetchInflight: om.__m20A1PrefetchState ? om.__m20A1PrefetchState.inflight.size : 0,
        rejections: window.__A1_REJECTIONS.length,
        pageErrors: window.__A1_PAGE_ERRORS.length,
      };
    });
    note('no-timer-leaks-no-unhandled-rejections',
      hygiene.sweepTimerNull && !hygiene.sweepActive && hygiene.rerenderTimers === 0
      && hygiene.prefetchInflight === 0 && hygiene.rejections === 0 && pageErrors.length === 0,
      `sweepTimer=null rerenderTimers=${hygiene.rerenderTimers} inflight=${hygiene.prefetchInflight} rejections=${hygiene.rejections} pageErrors=${pageErrors.length}`);

    await ctxA.close();

    // ════════ Context B — switch-OFF: no IDB at all (fresh profile) ════════
    const ctxB = await browser.createBrowserContext();
    const killed = await newProbePage(ctxB, srv.url, { kill: true });
    const killRun = await killed.page.evaluate(async () => {
      const om = window.__A1H.makeOm('sessKill');
      for (let i = 0; i < 5; i++) om.tradeJournal.push(window.__A1H.seedRow(i, 30000));
      const enabled = om._m20A1ScreenshotIdbV1Enabled();
      om._m20A1ScheduleRetainedSweep('kill');
      const timerAfterSchedule = om.__m20A1SweepTimer != null;
      const run = await om._m20A1RunRetainedSweepNow(999);
      const displayIdentity = om._m20A1TradeForDisplay(om.tradeJournal[0], null) === om.tradeJournal[0];
      const blobsIntact = window.__A1H.countNeeding(om) === 5;
      await new Promise((r) => setTimeout(r, 300));
      const dbs = (await indexedDB.databases()).map((d) => d.name);
      return { enabled, timerAfterSchedule, run, displayIdentity, blobsIntact, dbs };
    });
    note('switch-off-no-idb',
      killRun.enabled === false && killRun.timerAfterSchedule === false
      && killRun.run.enabled === false && killRun.displayIdentity && killRun.blobsIntact
      && !killRun.dbs.includes(DB_NAME),
      `enabled=false; no sweep timer; rows keep blobs; databases()=[${killRun.dbs.join(',') || 'empty'}] — no ${DB_NAME} created`);
    await ctxB.close();

    // ════════ Context C — quota pressure via CDP override (or NOT-MEASURABLE) ════════
    const ctxC = await browser.createBrowserContext();
    const quotaPage = await newProbePage(ctxC, srv.url);
    let quotaResult = { measurable: false, reason: 'CDP Storage.overrideQuotaForOrigin unavailable' };
    try {
      const qcdp = await quotaPage.page.createCDPSession();
      await qcdp.send('Storage.overrideQuotaForOrigin', { origin: srv.url, quotaSize: 150 * 1024 });
      quotaResult = await quotaPage.page.evaluate(async () => {
        const est = await navigator.storage.estimate();
        const om = window.__A1H.makeOm('sessQuota');
        const row = window.__A1H.seedRow(1, 400000); // ~2MB of blobs vs 150KB quota
        om.tradeJournal.push(row);
        const run = await om._m20A1RunRetainedSweepNow(999);
        const refSet = !!row.entryScreenshotRef;
        const blobKept = om._m20A1RowNeedsExternalize(row) && !refSet;
        // Persistence read-back: did "successful" puts actually become durable?
        let durable = null;
        if (refSet) durable = await om._m20A1IdbGet(row.entryScreenshotRef.refId);
        return {
          measurable: true,
          quotaReported: est.quota,
          quotaApplied: est.quota <= 200 * 1024,
          aborted: run.aborted === true,
          blobKept,
          refSet,
          durableAfterSuccess: !!durable,
          rejections: window.__A1_REJECTIONS.length,
        };
      });
    } catch (err) {
      quotaResult = { measurable: false, reason: `override failed: ${err && err.message}` };
    }
    if (!quotaResult.measurable) {
      note('quota-exceeded-fail-soft', true, `NOT-MEASURABLE — ${quotaResult.reason}`);
    } else if (!quotaResult.quotaApplied) {
      quotaResult.measurable = false;
      quotaResult.reason = `override did not take effect (estimate.quota=${quotaResult.quotaReported})`;
      note('quota-exceeded-fail-soft', true, `NOT-MEASURABLE — ${quotaResult.reason}`);
    } else if (quotaResult.aborted && quotaResult.blobKept) {
      note('quota-exceeded-fail-soft', quotaResult.rejections === 0,
        `CDP quota=150KB enforced at request: put fails, sweep aborts, blobs retained, rejections=${quotaResult.rejections}`);
    } else {
      // Quota not enforced at request time — the A1-F4 commit window applies.
      const durable = quotaResult.durableAfterSuccess;
      note('quota-exceeded-fail-soft', quotaResult.rejections === 0,
        `quota=150KB applied but write ${durable ? 'still became durable (enforcement lazy/deferred in this Chromium)' : 'reported success yet is NOT durable — commit-time loss (see A1-F4)'}; rejections=${quotaResult.rejections}`);
      if (quotaResult.refSet && !durable) {
        finding('A1-F5', 'RED',
          'Quota-constrained put reported success but record is not durable — real quota hit loses bytes through the A1-F4 window',
          `With CDP Storage.overrideQuotaForOrigin=150KB (estimate.quota=${quotaResult.quotaReported}), the sweep externalized a ~2MB row: _m20A1IdbPut resolved true, the in-row blob was nulled, and the read-back of the ref returned null.`);
      } else {
        finding('A1-F5', 'YELLOW',
          'Quota enforcement in this Chromium is not request-synchronous — quota pressure could not force a put failure',
          `estimate.quota=${quotaResult.quotaReported} was applied, yet a ~2MB row externalized with durable read-back=${durable}. Real quota exhaustion behavior (commit-time abort) is covered by the deterministic A1-F4 demonstration; treat live-quota behavior as NOT-FULLY-MEASURABLE via CDP override alone.`);
      }
    }
    evidence.quota = quotaResult;
    await ctxC.close();

    // ════════ Context D — release-gate battery (2026-07-24 second correction) ════════
    const ctxD = await browser.createBrowserContext();
    const gatesPage = await newProbePage(ctxD, srv.url);
    const gp = gatesPage.page;

    // D-1 (Gate 1) persist ordering / session routing on REAL async IDB.
    const d1 = await gp.evaluate(async () => {
      const om = window.__A1H.makeOm('sessD1');
      for (let i = 0; i < 2; i++) om.tradeJournal.push(window.__A1H.seedRow(i, 30000));
      await window.__A1H.sweepUntilDone(om);
      // Session switch mid-flight: rehydrate is genuinely async against real IDB.
      const p1 = om.persistJournal();
      om.chart.__sessionId = 'sessD1-NEW';
      const r1 = await p1;
      const criticalAfterSwitch = om.__captured.critical.length;
      om.chart.__sessionId = 'sessD1';
      const r2 = await om.persistJournal();
      // Completion inversion: snapshot A (2 rows) vs newest snapshot B (1 row).
      const p3 = om.persistJournal();
      om.tradeJournal.pop();
      const p4 = om.persistJournal();
      const [r3, r4] = await Promise.all([p3, p4]);
      const durables = om.__captured.critical;
      return {
        r1reason: r1.reason, r1q: r1.durableQueued, criticalAfterSwitch,
        r2q: r2.durableQueued === true,
        r3reason: r3.reason, r3q: r3.durableQueued, r4q: r4.durableQueued === true,
        totalDurables: durables.length,
        lastJournalLen: durables.length ? durables[durables.length - 1].journal.length : -1,
      };
    });
    const d1ok = d1.r1q === false && d1.r1reason === 'session-switched-mid-flight'
      && d1.criticalAfterSwitch === 0 && d1.r2q
      && d1.r3q === false && d1.r3reason === 'superseded-by-newer-persist'
      && d1.r4q && d1.totalDurables === 2 && d1.lastJournalLen === 1;
    note('g1-persist-ordering-session-routing', d1ok,
      d1ok
        ? 'mid-flight switch dropped (never rerouted); stale 2-row completion superseded; newest 1-row queued'
        : JSON.stringify(d1));
    if (!d1ok) {
      finding('A1-G1', 'RED', 'Persist ordering/session routing regression in real browser', JSON.stringify(d1));
    }

    // D-2 (Gate 2) runtime kill AFTER externalization → one-time recovery → steady legacy.
    const d2 = await gp.evaluate(async (KILL) => {
      const om = window.__A1H.makeOm('sessD2');
      for (let i = 0; i < 3; i++) om.tradeJournal.push(window.__A1H.seedRow(50 + i, 30000));
      await window.__A1H.sweepUntilDone(om);
      const externalized = window.__A1H.countNeeding(om) === 0 && !!om.tradeJournal[0].entryScreenshotRef;
      window[KILL] = true; // runtime flip AFTER externalization
      try {
        const identity = om._m20A1TradeForDisplay(om.tradeJournal[0], null) === om.tradeJournal[0];
        const scheduled = om.__m20A1KillTransitionTimer != null || om.__m20A1KillTransitionRunning === true;
        const failClosed = await om.persistJournal();
        const criticalBefore = om.__captured.critical.length;
        const t = await om._m20A1RunKillTransitionNow();
        const row = om.tradeJournal[0];
        const byteExact = row.entryScreenshot === window.__A1H.makeShot(50, 30000);
        const reembedded = byteExact && row.entryScreenshotRef === undefined
          && row.m20_a1_screenshot_idb_v1 === undefined;
        const flushed = om.__captured.critical.length === criticalBefore + 1;
        const flushedEmbedded = flushed
          && !!om.__captured.critical[criticalBefore].journal[0].entryScreenshot;
        const steady = await om.persistJournal(); // exact legacy sync now
        const rerun = await om._m20A1RunKillTransitionNow(); // must be a done no-op
        return {
          externalized, identity, scheduled,
          failReason: failClosed.reason, failQ: failClosed.durableQueued,
          recovered: t.recovered, unresolved: t.unresolved,
          reembedded, flushed, flushedEmbedded,
          steadyQ: steady.durableQueued === true,
          dbClosed: om.__m20A1DbPromise === null,
          rerunDone: rerun.done === true,
        };
      } finally { window[KILL] = false; }
    }, KILL_SWITCH);
    const d2ok = d2.externalized && d2.identity && d2.scheduled
      && d2.failQ === false && d2.failReason === 'kill-transition-pending'
      && d2.recovered > 0 && d2.unresolved === 0 && d2.reembedded
      && d2.flushed && d2.flushedEmbedded && d2.steadyQ && d2.dbClosed && d2.rerunDone;
    note('g2-runtime-kill-after-externalization', d2ok,
      d2ok
        ? `fail-closed while refs pending; one-time transition recovered=${d2.recovered} unresolved=0 byte-exact; legacy flush + steady sync persist; connection closed; rerun=done`
        : JSON.stringify(d2));
    if (!d2ok) {
      finding('A1-G2', 'RED', 'Runtime kill-after-externalization regression in real browser', JSON.stringify(d2));
    }

    // D-3 (Gate 3) missing/corrupt/evicted ref — durable persist fails CLOSED.
    const d3 = await gp.evaluate(async () => {
      const DB = 'talaria_m20_a1_screenshots_v1';
      const om = window.__A1H.makeOm('sessD3');
      for (let i = 0; i < 2; i++) om.tradeJournal.push(window.__A1H.seedRow(80 + i, 30000));
      await window.__A1H.sweepUntilDone(om);
      om._m20A1Teardown(); // cold cache — resolves must hit real IDB
      const refId = om.tradeJournal[0].entryScreenshotRef.refId;
      await window.__A1H.rawDelete(DB, 'screenshots', refId); // browser eviction
      const r1 = await om.persistJournal();
      const critical1 = om.__captured.critical.length;
      const refKept = !!om.tradeJournal[0].entryScreenshotRef;
      // Corrupt/tampered record → validation rejects → still fail closed.
      const rows = await window.__A1H.rawGetAll(DB, 'screenshots');
      const victim = rows.find((r) => r.refId !== refId && r.owner === '9001');
      const victimOriginalBlob = victim.blob;
      victim.blob = "data:image/png;base64,AAAA' onerror='alert(1)";
      await window.__A1H.rawPut(DB, 'screenshots', victim);
      om._m20A1Teardown();
      const r2 = await om.persistJournal();
      // Records restored intact → persist recovers truthfully.
      victim.blob = victimOriginalBlob;
      await window.__A1H.rawPut(DB, 'screenshots', victim);
      await window.__A1H.rawPut(DB, 'screenshots', {
        refId, owner: '9001', sessionId: 'sessD3', role: 'entry',
        mime: 'image/jpeg', byteLength: window.__A1H.makeShot(80, 30000).length,
        createdAt: Date.now(), blob: window.__A1H.makeShot(80, 30000),
      });
      om._m20A1Teardown();
      const r3 = await om.persistJournal();
      return {
        r1q: r1.durableQueued, r1reason: r1.reason, r1unresolved: r1.unresolved,
        critical1, refKept,
        r2q: r2.durableQueued, r2reason: r2.reason,
        r3q: r3.durableQueued === true,
        criticalFinal: om.__captured.critical.length,
      };
    });
    const d3ok = d3.r1q === false && d3.r1reason === 'refs-unresolved' && d3.r1unresolved >= 1
      && d3.critical1 === 0 && d3.refKept
      && d3.r2q === false && d3.r2reason === 'refs-unresolved'
      && d3.r3q && d3.criticalFinal === 1;
    note('g3-missing-corrupt-ref-fail-closed', d3ok,
      d3ok
        ? `evicted→deferred (unresolved=${d3.r1unresolved}, ref preserved); tampered→deferred; restored→queued truthfully`
        : JSON.stringify(d3));
    if (!d3ok) {
      finding('A1-G3', 'RED', 'Missing/corrupt ref durability regression in real browser', JSON.stringify(d3));
    }

    // D-4 (Gate 4) open splitGroupId protection + aggregate byte propagation.
    const d4 = await gp.evaluate(async () => {
      const om = window.__A1H.makeOm('sessD4');
      const leg = window.__A1H.seedRow(120, 30000);
      leg.splitGroupId = 'sg1';
      leg.isSplitEntry = true;
      om.tradeJournal.push(leg);
      om.tradeJournal.push(window.__A1H.seedRow(121, 30000));
      om.splitTrades.set('sg1', { status: 'OPEN', entries: [leg] });
      await window.__A1H.sweepUntilDone(om);
      const legProtected = typeof leg.entryScreenshot === 'string' && !leg.entryScreenshotRef;
      const otherDone = om.tradeJournal[1].entryScreenshot === null;
      om.splitTrades.get('sg1').status = 'CLOSED';
      await window.__A1H.sweepUntilDone(om);
      const legAfterClose = leg.entryScreenshot === null && !!leg.entryScreenshotRef;
      // Aggregate propagation: a restored-session leg carrying a ref contributes BYTES.
      const cold = {
        id: 9, entryScreenshot: null,
        entryScreenshotRef: leg.entryScreenshotRef, m20_a1_screenshot_idb_v1: true,
      };
      om._m20A1Teardown();
      const restored = await om._m20A1RestoreLegBlobs([cold]);
      const byteExact = cold.entryScreenshot === window.__A1H.makeShot(120, 30000);
      return { legProtected, otherDone, legAfterClose, restored, byteExact, refCleared: cold.entryScreenshotRef === undefined };
    });
    const d4ok = d4.legProtected && d4.otherDone && d4.legAfterClose
      && d4.restored === 1 && d4.byteExact && d4.refCleared;
    note('g4-split-group-protection', d4ok,
      d4ok
        ? 'open split leg protected; externalized after close; leg ref restored byte-exact for aggregate'
        : JSON.stringify(d4));
    if (!d4ok) {
      finding('A1-G4', 'RED', 'Open splitGroupId protection regression in real browser', JSON.stringify(d4));
    }

    // D-5 (Gate 5) rehydrate fan-out + >32-shot group via bounded overlay.
    const d5 = await gp.evaluate(async () => {
      const om = window.__A1H.makeOm('sessD5');
      const row = window.__A1H.seedRow(150, 30000);
      om.tradeJournal.push(row);
      const big = { id: 200, tradeId: 200, ticker: 'EURUSD', entryScreenshots: [] };
      for (let i = 0; i < 40; i++) {
        big.entryScreenshots.push({ screenshot: window.__A1H.makeShot(300 + i, 20000), openPrice: 1 + i });
      }
      om.tradeJournal.push(big);
      await window.__A1H.sweepUntilDone(om);
      const bigExternalized = big.entryScreenshots === null
        && Array.isArray(big.entryScreenshotRefs) && big.entryScreenshotRefs.length === 40;
      om.__m20A1BlobCache = null; // cold start (fresh tab restore)
      let first = 0; let second = 0; let bigR = 0;
      om._m20A1TradeForDisplay(row, { key: 'first', fn: () => { first += 1; } });
      om._m20A1TradeForDisplay(row, { key: 'second', fn: () => { second += 1; } }); // joins in-flight
      om._m20A1TradeForDisplay(big, { key: 'big', fn: () => { bigR += 1; } });
      await new Promise((r) => setTimeout(r, 900));
      const v = om._m20A1TradeForDisplay(big, { key: 'big', fn: () => { bigR += 1; } });
      const complete = Array.isArray(v.entryScreenshots) && v.entryScreenshots.length === 40
        && v.entryScreenshots.every((e, i) => e.screenshot === window.__A1H.makeShot(300 + i, 20000));
      const ovLim = om._m20A1OverlayLimits();
      const cLim = om._m20A1CacheLimits();
      return {
        bigExternalized, first, second, bigR, complete,
        cacheEntries: om._m20A1Cache().size, cacheMax: cLim.maxEntries,
        overlayBounded: om.__m20A1DisplayOverlay.size <= ovLim.maxEntries
          && om.__m20A1DisplayOverlayBytes <= ovLim.maxBytes,
      };
    });
    const d5ok = d5.bigExternalized && d5.first === 1 && d5.second === 1 && d5.bigR >= 1
      && d5.complete && d5.cacheEntries <= d5.cacheMax && d5.overlayBounded;
    note('g5-fanout-and-big-group-overlay', d5ok,
      d5ok
        ? `both joined callers re-rendered; 40/40 byte-exact through overlay; cache ${d5.cacheEntries}≤${d5.cacheMax}; overlay bounded`
        : JSON.stringify(d5));
    if (!d5ok) {
      finding('A1-G5', 'RED', 'Rehydrate fan-out / big-group cache regression in real browser', JSON.stringify(d5));
    }

    // D-6 (Gate 6) sweep scan bounds across a 20k-row journal.
    const d6 = await gp.evaluate(async () => {
      const om = window.__A1H.makeOm('sessD6');
      for (let i = 0; i < 20000; i++) {
        om.tradeJournal.push({ id: i, tradeId: i, ticker: 'EURUSD', entryScreenshot: null });
      }
      om.tradeJournal[77].entryScreenshot = window.__A1H.makeShot(500, 20000); // dirty row near the FRONT
      let total = 0; let ext = 0; let passes = 0; let maxSeen = 0;
      for (; passes < 12; passes++) {
        const r = await om._m20A1RunRetainedSweepNow(16, 4000);
        total += r.scanned; ext += r.externalized; maxSeen = Math.max(maxSeen, r.scanned);
        if (!r.pendingMore) break;
      }
      return { total, ext, passes: passes + 1, maxSeen };
    });
    const d6ok = d6.ext === 1 && d6.maxSeen <= 4000 && d6.total <= 20100 && d6.passes >= 5;
    note('g6-scan-bounded-sweep', d6ok,
      d6ok
        ? `20k rows walked in ${d6.passes} bounded passes (max ${d6.maxSeen}/pass, total ${d6.total}); dirty row externalized`
        : JSON.stringify(d6));
    if (!d6ok) {
      finding('A1-G6', 'RED', 'Sweep scan-bound regression in real browser', JSON.stringify(d6));
    }

    // D-7 (Gate 7) strict image data-URL validation at the externalize + resolve chokes.
    const d7 = await gp.evaluate(async () => {
      const om = window.__A1H.makeOm('sessD7');
      const svg = 'data:image/svg+xml,<svg onload=alert(1)>' + 'x'.repeat(120);
      const bad = { id: 5, tradeId: 5, ticker: 'EURUSD', entryScreenshot: svg };
      om.tradeJournal.push(bad);
      om.tradeJournal.push(window.__A1H.seedRow(700, 20000));
      await window.__A1H.sweepUntilDone(om);
      const svgKeptInRow = bad.entryScreenshot === svg && bad.entryScreenshotRef === undefined;
      const refId = om.tradeJournal[1].entryScreenshotRef.refId;
      const rows = await window.__A1H.rawGetAll('talaria_m20_a1_screenshots_v1', 'screenshots');
      const rec = rows.find((r) => r.refId === refId);
      rec.blob = "data:image/png;base64,AAAA' onerror='alert(1)";
      await window.__A1H.rawPut('talaria_m20_a1_screenshots_v1', 'screenshots', rec);
      om._m20A1Teardown();
      const tamperedResolvesNull = (await om._m20A1ResolveRefBlob(refId)) === null;
      return {
        svgKeptInRow, tamperedResolvesNull,
        validReal: om._m20A1IsValidScreenshotDataUrl(window.__A1H.makeShot(1, 20000)) === true,
        invalidEmpty: om._m20A1IsValidScreenshotDataUrl('data:image/png;base64,') === false,
        invalidHtml: om._m20A1IsValidScreenshotDataUrl('data:text/html;base64,' + 'A'.repeat(200)) === false,
      };
    });
    const d7ok = d7.svgKeptInRow && d7.tamperedResolvesNull && d7.validReal && d7.invalidEmpty && d7.invalidHtml;
    note('g7-strict-dataurl-validation', d7ok,
      d7ok
        ? 'non-contract payload never externalized; tampered IDB value resolves null before any src/persist use'
        : JSON.stringify(d7));
    if (!d7ok) {
      finding('A1-G7', 'RED', 'Screenshot payload validation regression in real browser', JSON.stringify(d7));
    }
    // Node-side source checks: export object-URL revocation wired at all 3 exports.
    const omSrcForChecks = fs.readFileSync(OM_PATH, 'utf8');
    const revokeCount = (omSrcForChecks.match(/revokeObjectURL/g) || []).length;
    note('g7-export-objecturl-revoked', revokeCount >= 3,
      `revokeObjectURL sites in order-manager.js: ${revokeCount} (JSON + trades CSV + analytics CSV)`);

    // D-9 (Gate 9) logout bridge — REAL BroadcastChannel transport end-to-end.
    const d9 = await gp.evaluate(async () => {
      const DB = 'talaria_m20_a1_screenshots_v1';
      const om = window.__A1H.makeOm('sessD9');
      om.tradeJournal.push(window.__A1H.seedRow(600, 20000));
      await window.__A1H.sweepUntilDone(om);
      om._m20A1InstallLogoutBridge();
      const types = om._m20A1LogoutBridgeMessageTypes();
      const before = (await window.__A1H.rawGetAll(DB, 'screenshots')).filter((r) => r.owner === '9001').length;
      // 1) BroadcastChannel end-to-end — the REAL dashboard-shell transport.
      const shell = new BroadcastChannel(types.channel);
      const bc = await new Promise((resolve) => {
        const requestId = 'probe-bc-1';
        const to = setTimeout(() => resolve({ timedOut: true }), 3000);
        shell.onmessage = (e) => {
          if (e.data && e.data.type === types.result && e.data.requestId === requestId) {
            clearTimeout(to); resolve(e.data);
          }
        };
        shell.postMessage({ type: types.request, requestId, owner: '9001' });
      });
      shell.close();
      const after = (await window.__A1H.rawGetAll(DB, 'screenshots')).filter((r) => r.owner === '9001').length;
      // 2) owner mismatch refused; 3) foreign origin silently ignored.
      const replies = [];
      const mk = (origin, data) => ({ origin, data, source: { postMessage: (m, t) => replies.push({ m, t }) } });
      om._m20A1HandleLogoutBridgeMessage(mk(location.origin, { type: types.request, owner: '7777', requestId: 'wm-owner' }));
      om._m20A1HandleLogoutBridgeMessage(mk('https://evil.example', { type: types.request, owner: '9001', requestId: 'wm-evil' }));
      await new Promise((r) => setTimeout(r, 400));
      const denied = replies.find((r) => r.m.requestId === 'wm-owner');
      const evilAnswered = replies.some((r) => r.m.requestId === 'wm-evil');
      return {
        bcOk: bc.ok === true, bcConfirmDurable: bc.confirmDurable, bcReason: bc.reason,
        before, after,
        deniedOk: !!denied && denied.m.ok === false && denied.m.reason === 'owner-mismatch',
        deniedTarget: denied ? denied.t : null,
        evilAnswered,
        tornDown: om.__m20A1DbPromise === null,
      };
    });
    const d9ok = d9.bcOk && d9.bcConfirmDurable === false && d9.before > 0 && d9.after === d9.before
      && d9.deniedOk && d9.deniedTarget === srv.url && d9.evilAnswered === false && d9.tornDown;
    note('g9-logout-bridge-real-transport', d9ok,
      d9ok
        ? `BroadcastChannel round-trip ok (reason=${d9.bcReason}); NO unverified bulk deletion (${d9.before}→${d9.after}); owner-mismatch refused with explicit-target reply; foreign origin ignored`
        : JSON.stringify(d9));
    if (!d9ok) {
      finding('A1-G9', 'RED', 'Logout bridge security/behavior regression in real browser', JSON.stringify(d9));
    }

    // D-hygiene: no unhandled rejections / page errors across the gate battery.
    const dHygiene = await gp.evaluate(() => ({
      rejections: window.__A1_REJECTIONS.length,
      pageErrors: window.__A1_PAGE_ERRORS.length,
    }));
    note('gates-no-rejections-no-errors',
      dHygiene.rejections === 0 && dHygiene.pageErrors === 0 && gatesPage.pageErrors.length === 0,
      `rejections=${dHygiene.rejections} pageErrors=${dHygiene.pageErrors + gatesPage.pageErrors.length}`);
    await ctxD.close();
  } finally {
    await browser.close();
    await srv.close();
  }

  // ─── Verdict + evidence ───────────────────────────────────────────────────
  const redFindings = evidence.findings.filter((f) => f.severity === 'RED');
  evidence.summary = {
    checksTotal: evidence.checks.length,
    checksFailed: failures,
    findings: evidence.findings.map((f) => `${f.severity}:${f.id}`),
    verdict: failures === 0 && redFindings.length === 0
      ? `GREEN — A1 F1–F4 + release-gate corrections verified in real Chromium (${STATUS_MARK})`
      : `RED — ${failures} check(s) failed, ${redFindings.length} RED finding(s) (${STATUS_MARK})`,
  };
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  process.stdout.write(`\n[A1-IDB-BROWSER] evidence → ${OUT_PATH}\n`);
  process.stdout.write(`[A1-IDB-BROWSER] ${evidence.summary.verdict}\n`);
  process.exitCode = failures === 0 && redFindings.length === 0 ? 0 : 1;
}

main().catch((err) => {
  process.stderr.write(`[A1-IDB-BROWSER] HARNESS-FAIL: ${err && err.stack || err}\n`);
  process.exitCode = 2;
});
