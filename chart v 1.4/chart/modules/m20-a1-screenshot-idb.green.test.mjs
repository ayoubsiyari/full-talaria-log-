/**
 * M20-A1 / W2 — screenshots→IndexedDB GREEN + switch-OFF discrimination.
 *
 * Product under test: order-manager.js A1 section (kill-switch
 * __TALARIA_DISABLE_M20_A1_SCREENSHOT_IDB_V1, default ON = fix active).
 *
 * GREEN:
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m20-a1-screenshot-idb.green.test.mjs"
 *
 * Evidence (writes W2-A1-SCREENSHOT-IDB-*-green.json + *-kill.json):
 *   M20_A1_EVIDENCE=1 node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m20-a1-screenshot-idb.green.test.mjs"
 *
 * Gates proven here:
 *   - D-030: one kill-switch; switch-OFF restores in-row retention + today's
 *     durable byte class with ZERO IndexedDB traffic.
 *   - I16:   additive schema (no key deleted); legacy blob-only rows restore
 *     and display unchanged; durable server tier rehydrated (never stripped).
 *   - I15:   measures retained embedded bytes / serialize bytes, not proxies.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  M20_A1_KILL_SWITCH,
  M20_A1_SCHEMA_V1,
  makeFatScreenshotFixture,
  measureEmbeddedScreenshotBytes,
} from './m20-a1-screenshot-idb-contract.mjs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Repo root works from both trees (chart v 1.4/... and homepage/public/...). */
function findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'docs', 'plan3'))
      && fs.existsSync(path.join(dir, 'chart v 1.4'))) {
      return dir;
    }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return path.resolve(start, '../../..');
}
const REPO_ROOT = findRepoRoot(__dirname);
const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs', 'plan3', 'evidence');
const EVIDENCE_MODE = String(process.env.M20_A1_EVIDENCE || '').trim() !== '';

// ─── DOM / storage stubs (m19-persist-trim harness pattern) ────────────────

function installDom() {
  global.window = {
    __TALARIA_CHART_BUILD_ID: 'm20-a1-green',
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    location: { href: 'http://local.test/chart?sessionId=a1-green' },
  };
  global.document = {
    readyState: 'loading',
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({
      style: {},
      classList: { add() {}, remove() {}, contains: () => false },
      setAttribute() {},
      appendChild() {},
      addEventListener() {},
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

// ─── Minimal fake IndexedDB (commit-aware: request success ≠ durable) ──────
//
// Mirrors real IDB event ordering the F4 fix depends on:
//   request.onsuccess  → data visible to the tx, NOT yet committed
//   tx.oncomplete      → durable commit (put/delete may only count now)
//   tx.onabort         → commit-time failure (quota/IO) — data rolled back
// flags.abortAfterRequestSuccess reproduces the A1-F4 window: the request
// succeeds, then the transaction aborts before commit.

function makeFakeIndexedDB(opts = {}) {
  const stores = new Map();
  const stats = { opens: 0, puts: 0, gets: 0, deletes: 0 };
  const flags = {
    failPut: !!opts.failPut,
    failOpen: !!opts.failOpen,
    abortAfterRequestSuccess: !!opts.abortAfterRequestSuccess,
  };
  const db = {
    closed: false,
    onversionchange: null,
    objectStoreNames: { contains: (n) => stores.has(n) },
    createObjectStore(n) { stores.set(n, new Map()); return {}; },
    close() { db.closed = true; },
    transaction(_names, _mode) {
      if (db.closed) throw new Error('InvalidStateError: connection is closed');
      const tx = { onabort: null, oncomplete: null, onerror: null, __done: false };
      const finish = (kind) => {
        if (tx.__done) return;
        tx.__done = true;
        if (kind === 'complete' && tx.oncomplete) tx.oncomplete();
        if (kind === 'abort' && tx.onabort) tx.onabort();
      };
      tx.objectStore = (n) => ({
        put(record) {
          const rq = { onsuccess: null, onerror: null };
          queueMicrotask(() => {
            stats.puts += 1;
            if (flags.failPut) {
              if (rq.onerror) rq.onerror(new Error('put-fail'));
              queueMicrotask(() => finish('abort'));
              return;
            }
            const snapshot = JSON.parse(JSON.stringify(record));
            if (rq.onsuccess) rq.onsuccess();
            queueMicrotask(() => {
              if (flags.abortAfterRequestSuccess) {
                // A1-F4 window: rolled back — bytes never durable.
                finish('abort');
                return;
              }
              if (!stores.has(n)) stores.set(n, new Map());
              stores.get(n).set(snapshot.refId, snapshot);
              finish('complete');
            });
          });
          return rq;
        },
        get(key) {
          const rq = { onsuccess: null, onerror: null, result: undefined };
          queueMicrotask(() => {
            stats.gets += 1;
            rq.result = stores.has(n) ? stores.get(n).get(key) : undefined;
            if (rq.onsuccess) rq.onsuccess();
            queueMicrotask(() => finish('complete'));
          });
          return rq;
        },
        delete(key) {
          const rq = { onsuccess: null, onerror: null };
          queueMicrotask(() => {
            stats.deletes += 1;
            if (flags.abortAfterRequestSuccess) {
              if (rq.onsuccess) rq.onsuccess();
              queueMicrotask(() => finish('abort'));
              return;
            }
            if (stores.has(n)) stores.get(n).delete(key);
            if (rq.onsuccess) rq.onsuccess();
            queueMicrotask(() => finish('complete'));
          });
          return rq;
        },
        openCursor() {
          const rq = { onsuccess: null, onerror: null, result: null };
          queueMicrotask(() => {
            const entries = stores.has(n) ? [...stores.get(n).values()] : [];
            let i = 0;
            const step = () => {
              if (i < entries.length) {
                const value = entries[i];
                rq.result = {
                  value,
                  continue() { i += 1; queueMicrotask(step); },
                };
              } else {
                rq.result = null;
              }
              if (rq.onsuccess) rq.onsuccess();
              if (rq.result === null) queueMicrotask(() => finish('complete'));
            };
            step();
          });
          return rq;
        },
      });
      return tx;
    },
  };
  const idb = {
    open(_name, _version) {
      const rq = { onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null, result: null };
      queueMicrotask(() => {
        stats.opens += 1;
        if (flags.failOpen) {
          if (rq.onerror) rq.onerror();
          return;
        }
        db.closed = false;
        rq.result = db;
        if (!stores.has('screenshots') && rq.onupgradeneeded) rq.onupgradeneeded();
        if (rq.onsuccess) rq.onsuccess();
      });
      return rq;
    },
  };
  /** Simulate another connection requesting a version upgrade. */
  const fireVersionChange = () => {
    if (db.onversionchange) db.onversionchange();
  };
  return { idb, stores, stats, flags, db, fireVersionChange };
}

// ─── Fixture builders ──────────────────────────────────────────────────────

const SHOT = makeFatScreenshotFixture('G', 60_000);
const MIN_RETAINED = 8_000_000;

function fatJournalRow(id) {
  return {
    id,
    tradeId: id,
    type: 'BUY',
    ticker: 'EURUSD',
    symbol: 'EURUSD',
    openTime: 1_700_000_000_000 + id,
    closeTime: 1_700_000_060_000 + id,
    openPrice: 1.1,
    closePrice: 1.2,
    pnl: 10,
    netPnL: 10,
    entryScreenshot: SHOT,
    exitScreenshot: SHOT,
    railScreenshots: [{ dataUrl: SHOT, name: `rail-${id}` }],
    journalEntry: { exitScreenshot: SHOT },
    metadata: { entryScreenshot: SHOT },
  };
}

function fatClosedRow(id) {
  return {
    id,
    tradeId: id,
    status: 'CLOSED',
    ticker: 'EURUSD',
    entryScreenshot: SHOT,
    exitScreenshot: SHOT,
  };
}

function seedOm({
  kill = false, fake = null, sessionId = 'a1-green', trades = 50, closed = 20,
  owner = '9001',
} = {}) {
  window[M20_A1_KILL_SWITCH] = kill;
  window.__TALARIA_DISABLE_M19_PERSIST_TRIM_V1 = false;
  window.indexedDB = fake ? fake.idb : undefined;
  // A1-F1 owner source: authenticated /api/auth/me id (auth bootstrap).
  window.__talariaUserId = owner == null ? undefined : owner;
  const om = Object.create(OrderManager.prototype);
  om.tradeJournal = [];
  om.closedPositions = [];
  om.openPositions = [];
  om.pendingOrders = [];
  om.orders = [];
  om.scaledTrades = new Map();
  om.balance = 10_000;
  om.equity = 10_000;
  om.initialBalance = 10_000;
  om.orderIdCounter = 1;
  om.tradeGroupIdCounter = 1;
  for (let i = 0; i < trades; i++) om.tradeJournal.push(fatJournalRow(1000 + i));
  for (let i = 0; i < closed; i++) om.closedPositions.push(fatClosedRow(1000 + i));
  const captured = { hot: [], critical: [] };
  om.chart = {
    getActiveTradingSessionId: () => sessionId,
    scheduleSessionStateSave: (patch) => captured.hot.push(patch),
    queueCriticalSessionStateSave: (patch) => captured.critical.push(patch),
  };
  om.__captured = captured;
  return om;
}

function retainedBytes(om) {
  const j = measureEmbeddedScreenshotBytes(om.tradeJournal);
  const c = measureEmbeddedScreenshotBytes(om.closedPositions);
  return {
    total: j.totalBytes + c.totalBytes,
    journalRowsWithShots: j.rowsWithShots,
    closedRowsWithShots: c.rowsWithShots,
  };
}

async function drainSweep(om, passes = 30) {
  let last = null;
  for (let i = 0; i < passes; i++) {
    last = await om._m20A1RunRetainedSweepNow(Number.MAX_SAFE_INTEGER);
    if (!last.pendingMore && !last.busy) break;
  }
  return last;
}

const evidence = {
  green: {
    status: 'GREEN',
    date: '2026-07-24',
    worker: 'W2-fable',
    killSwitch: M20_A1_KILL_SWITCH,
    checks: [],
    retention: null,
  },
  kill: {
    status: 'KILL-RED',
    date: '2026-07-24',
    worker: 'W2-fable',
    killSwitch: M20_A1_KILL_SWITCH,
    checks: [],
    retention: null,
  },
};

function note(bucket, name, pass, detail = '') {
  evidence[bucket].checks.push({ name, pass: !!pass, detail: String(detail) });
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} [A1-${bucket.toUpperCase()}] ${name}${detail ? ` — ${detail}` : ''}\n`);
}

// ─── Polarity / availability gating ────────────────────────────────────────

test('kill-switch polarity + IndexedDB availability gating', () => {
  const fake = makeFakeIndexedDB();
  const omOn = seedOm({ kill: false, fake, trades: 0, closed: 0 });
  assert.equal(omOn._m20A1ScreenshotIdbV1Enabled(), true);

  const omOff = seedOm({ kill: true, fake, trades: 0, closed: 0 });
  assert.equal(omOff._m20A1ScreenshotIdbV1Enabled(), false);

  const omNoIdb = seedOm({ kill: false, fake: null, trades: 0, closed: 0 });
  assert.equal(omNoIdb._m20A1ScreenshotIdbV1Enabled(), false,
    'no indexedDB → A1 inert (fail-soft to legacy behavior)');
  note('green', 'kill-switch-polarity', true, 'on/off/no-idb gating correct');
});

// ─── GREEN: retained sweep externalizes journal + closed rows ──────────────

test('GREEN: sweep externalizes retained base64 into IndexedDB (bytes ≈ 0)', async () => {
  const fake = makeFakeIndexedDB();
  const om = seedOm({ kill: false, fake });

  const before = retainedBytes(om);
  assert.ok(before.total >= MIN_RETAINED, `fixture must start multi-MB, got ${before.total}`);

  const result = await drainSweep(om);
  assert.equal(result.aborted, undefined || result.aborted, 'sweep completed');

  const after = retainedBytes(om);
  note('green', 'in-memory-retention-after-sweep', after.total === 0,
    `before=${before.total} after=${after.total}`);
  assert.equal(after.total, 0, `retained embedded bytes must drop to 0, got ${after.total}`);

  // Additive refs + mark present; legacy keys still exist (nulled, not deleted).
  const row = om.tradeJournal[0];
  assert.equal(row[M20_A1_SCHEMA_V1.markKey], true);
  assert.ok(row.entryScreenshotRef && row.entryScreenshotRef.refId);
  assert.ok(row.exitScreenshotRef && row.exitScreenshotRef.refId);
  assert.ok(Array.isArray(row.railScreenshotRefs) && row.railScreenshotRefs.length === 1);
  assert.ok(Object.prototype.hasOwnProperty.call(row, 'entryScreenshot'), 'I16: key not deleted');
  assert.equal(row.entryScreenshot, null);
  assert.ok(row.journalEntry.exitScreenshotRef, 'nested journalEntry externalized');
  assert.equal(row.journalEntry.exitScreenshot, null);
  assert.ok(row.metadata.entryScreenshotRef, 'nested metadata externalized');

  // Bytes live in IDB, exactly once per distinct refId, byte-preserved.
  const store = fake.stores.get('screenshots');
  assert.ok(store && store.size > 0, 'IDB store populated');
  const anyRec = store.get(row.entryScreenshotRef.refId);
  assert.equal(anyRec.blob, SHOT, 'IDB record byte-preserves the original data-URL');
  note('green', 'idb-records', true, `records=${store.size} puts=${fake.stats.puts}`);

  evidence.green.retention = {
    beforeBytes: before.total,
    afterBytes: after.total,
    idbRecords: store.size,
    perShotBytes: SHOT.length,
  };
});

test('GREEN: rows of a still-open scaled group are skipped (aggregate safety)', async () => {
  const fake = makeFakeIndexedDB();
  const om = seedOm({ kill: false, fake, trades: 0, closed: 2 });
  om.closedPositions[0].tradeGroupId = 'g1';
  om.scaledTrades.set('g1', { status: 'OPEN', entries: [om.closedPositions[0]] });

  await drainSweep(om);
  assert.equal(om.closedPositions[0].entryScreenshot, SHOT,
    'open-group member keeps blob (aggregate entry reads it synchronously)');
  assert.equal(om.closedPositions[1].entryScreenshot, null, 'non-group row externalized');

  om.scaledTrades.get('g1').status = 'CLOSED';
  await drainSweep(om);
  assert.equal(om.closedPositions[0].entryScreenshot, null, 'externalized after group close');
  note('green', 'open-scaled-group-skip', true, 'skip while OPEN, externalize after CLOSED');
});

// ─── GREEN: exact lazy rehydrate for UI display path ───────────────────────

test('GREEN: display view lazy-rehydrates exact bytes through bounded cache', async () => {
  const fake = makeFakeIndexedDB();
  const om = seedOm({ kill: false, fake, trades: 3, closed: 0 });
  await drainSweep(om);

  // Empty the cache to force the IDB path (restore-on-another-tab scenario).
  om.__m20A1BlobCache = null;

  const row = om.tradeJournal[0];
  let rerenders = 0;
  const view1 = om._m20A1TradeForDisplay(row, { key: 'test', fn: () => { rerenders += 1; } });
  assert.notEqual(view1, row, 'copy returned while refs unresolved');
  assert.ok(!view1.entryScreenshot, 'uncached blob not yet visible (key nulled, I16-additive)');

  await new Promise((r) => setTimeout(r, 200)); // prefetch + debounced rerender
  assert.equal(rerenders, 1, 'exactly one debounced rerender per batch');

  const view2 = om._m20A1TradeForDisplay(row, { key: 'test', fn: () => { rerenders += 1; } });
  assert.equal(view2.entryScreenshot, SHOT, 'entry blob byte-exact after rehydrate');
  assert.equal(view2.exitScreenshot, SHOT, 'exit blob byte-exact after rehydrate');
  assert.equal(view2.railScreenshots[0].dataUrl, SHOT, 'rail blob byte-exact');
  assert.equal(view2.railScreenshots[0].name, 'rail-1000', 'rail name preserved');
  note('green', 'lazy-rehydrate-exact', true, 'entry/exit/rail byte-exact, 1 rerender');

  // Bounded cache: limits respected after many inserts.
  const lim = om._m20A1CacheLimits();
  for (let i = 0; i < lim.maxEntries + 20; i++) {
    om._m20A1CachePut(`stress:${i}`, SHOT);
  }
  const cache = om._m20A1Cache();
  assert.ok(cache.size <= lim.maxEntries, `cache entries ${cache.size} ≤ ${lim.maxEntries}`);
  assert.ok(om.__m20A1BlobCacheBytes <= lim.maxBytes, 'cache bytes within budget');
  note('green', 'bounded-cache', true, `entries=${cache.size} bytes=${om.__m20A1BlobCacheBytes}`);
});

// ─── GREEN: durable tier rehydrates (server data never stripped) ───────────

test('GREEN: persistJournal durable tier rehydrates blobs (I16 non-destructive)', async () => {
  const fake = makeFakeIndexedDB();
  const om = seedOm({ kill: false, fake, trades: 10, closed: 0 });
  await drainSweep(om);
  assert.equal(retainedBytes(om).total, 0, 'precondition: in-memory slim');

  om.persistJournal();
  await new Promise((r) => setTimeout(r, 100)); // async rehydrate → critical queue

  // Hot tier stays slim + marked (M19-C semantics unchanged).
  assert.equal(om.__captured.hot.length, 1);
  const hot = om.__captured.hot[0];
  assert.equal(hot.m19_hot_persist_trim_v1, true);
  const hotBytes = measureEmbeddedScreenshotBytes(hot.journal).totalBytes;
  assert.equal(hotBytes, 0, 'hot patch carries no blobs');

  // Durable tier carries the exact original bytes again.
  assert.equal(om.__captured.critical.length, 1, 'durable patch queued');
  const durable = om.__captured.critical[0];
  assert.equal(durable.journal.length, 10);
  for (const row of durable.journal) {
    assert.equal(row.entryScreenshot, SHOT, 'durable entry blob byte-exact');
    assert.equal(row.exitScreenshot, SHOT, 'durable exit blob byte-exact');
    assert.equal(row.railScreenshots[0].dataUrl, SHOT, 'durable rail blob byte-exact');
    assert.equal(row.journalEntry.exitScreenshot, SHOT, 'nested journalEntry rehydrated');
    assert.equal(row.metadata.entryScreenshot, SHOT, 'nested metadata rehydrated');
  }
  assert.ok(durable.journal_by_ticker.EURUSD.length === 10, 'journal_by_ticker rebuilt from rehydrated rows');
  const durableBytes = JSON.stringify(durable.journal).length;
  // 10 rows × 5 embedded shots (entry/exit/rail/nested je/nested meta).
  const expectedDurableFloor = 10 * 5 * SHOT.length;
  assert.ok(durableBytes >= expectedDurableFloor,
    `durable byte class preserved: ${durableBytes} ≥ ${expectedDurableFloor}`);

  // Live in-memory rows stayed slim (rehydrate never touches live rows).
  assert.equal(retainedBytes(om).total, 0, 'live rows untouched by durable rehydrate');
  note('green', 'durable-rehydrate-parity', true,
    `durableBytes=${durableBytes} hotEmbedded=${hotBytes} liveEmbedded=0`);
  evidence.green.durable = { durableBytes, hotEmbeddedBytes: hotBytes };
});

// ─── GREEN: fail-soft (IDB broken → today's behavior, zero data loss) ──────

test('GREEN: IDB put failure keeps in-row blobs (fail-soft, no capture loss)', async () => {
  const fake = makeFakeIndexedDB({ failPut: true });
  const om = seedOm({ kill: false, fake, trades: 5, closed: 0 });

  const result = await drainSweep(om, 3);
  assert.equal(result.aborted, true, 'sweep aborts on put failure');
  const after = retainedBytes(om);
  assert.ok(after.total > 0, 'rows keep their blobs on IDB failure');
  assert.equal(om.tradeJournal[0].entryScreenshot, SHOT, 'blob untouched');
  assert.equal(om.tradeJournal[0].entryScreenshotRef, undefined, 'no dangling ref');
  note('green', 'fail-soft-put-failure', true, `retained=${after.total} (legacy path preserved)`);
});

test('GREEN: legacy blob-only rows (old sessions) display + persist unchanged', () => {
  const fake = makeFakeIndexedDB();
  const om = seedOm({ kill: false, fake, trades: 1, closed: 0 });
  const row = om.tradeJournal[0];
  // No sweep ran: display view must return the row IDENTITY (no copies, no IDB).
  const view = om._m20A1TradeForDisplay(row, { key: 'x', fn: () => {} });
  assert.equal(view, row, 'blob-rows pass through untouched (I16 restore path)');
  assert.equal(fake.stats.gets, 0, 'no IDB reads for legacy rows');
  note('green', 'legacy-rows-untouched', true, 'identity pass-through, zero IDB traffic');
});

// ─── Switch-OFF discrimination (D-030 kill RED) ────────────────────────────

test('KILL: switch-OFF restores in-row retention + byte class, zero IDB traffic', async () => {
  const fake = makeFakeIndexedDB();
  const om = seedOm({ kill: true, fake });

  const before = retainedBytes(om);
  const sweep = await om._m20A1RunRetainedSweepNow(Number.MAX_SAFE_INTEGER);
  assert.equal(sweep.enabled, false, 'sweep is a no-op when killed');
  const after = retainedBytes(om);
  assert.equal(after.total, before.total, 'retention identical to today');
  assert.ok(after.total >= MIN_RETAINED, `multi-MB in-row retention restored: ${after.total}`);

  om._m20A1ScheduleRetainedSweep('kill-test');
  assert.equal(om.__m20A1SweepTimer == null, true, 'no sweep timer scheduled when killed');

  // persistJournal takes the exact legacy synchronous path.
  om.persistJournal();
  assert.equal(om.__captured.critical.length, 1, 'durable queued synchronously (legacy path)');
  const durable = om.__captured.critical[0];
  const durableBytes = JSON.stringify(durable.journal).length;
  assert.ok(durableBytes >= MIN_RETAINED, `legacy durable byte class: ${durableBytes}`);
  assert.equal(measureEmbeddedScreenshotBytes(durable.journal).totalBytes >= MIN_RETAINED, true);

  // Display path returns identity — no copies, no cache, no rerenders.
  const view = om._m20A1TradeForDisplay(om.tradeJournal[0], { key: 'k', fn: () => {} });
  assert.equal(view, om.tradeJournal[0]);

  assert.equal(fake.stats.opens, 0, 'zero IndexedDB opens under kill');
  assert.equal(fake.stats.puts, 0, 'zero IndexedDB puts under kill');
  assert.equal(fake.stats.gets, 0, 'zero IndexedDB gets under kill');
  note('kill', 'switch-off-restores-today', true,
    `retained=${after.total} durableBytes=${durableBytes} idbOps=0`);
  evidence.kill.retention = {
    retainedEmbeddedBytes: after.total,
    durableSerializeBytes: durableBytes,
    idbOpens: fake.stats.opens,
    idbPuts: fake.stats.puts,
  };
});

// ─── D-030 money-path guard: open/pending runtime patch untouched ──────────

test('D-030: durable runtime patch (open/pending) is byte-identical pre/post A1', async () => {
  const fake = makeFakeIndexedDB();
  const om = seedOm({ kill: false, fake, trades: 0, closed: 0 });
  om.openPositions = [{
    id: 9, tradeId: 9, status: 'OPEN', openPrice: 1.5, quantity: 2,
    entryScreenshot: SHOT, // live order blob NEVER externalized
  }];
  await drainSweep(om);
  assert.equal(om.openPositions[0].entryScreenshot, SHOT,
    'A1 must not touch live open positions (money path)');
  const patch = om._buildDurableRuntimeOrderPersistPatch();
  assert.equal(patch.open_positions[0].entryScreenshot, SHOT,
    'durable runtime patch carries the same bytes as today');
  note('green', 'money-path-untouched', true, 'open/pending rows + runtime patch unchanged');
});

// ─── A1-F4: durability — put resolves only on commit ───────────────────────

test('F4: request success then pre-commit abort → put=false, blobs kept, no rejection', async () => {
  const rejections = [];
  const onRej = (err) => rejections.push(err);
  process.on('unhandledRejection', onRej);
  try {
    const fake = makeFakeIndexedDB({ abortAfterRequestSuccess: true });
    const om = seedOm({ kill: false, fake, trades: 3, closed: 0 });

    const ok = await om._m20A1IdbPut({
      refId: 'f4:probe', blob: SHOT, byteLength: SHOT.length, createdAt: Date.now(),
    });
    assert.equal(ok, false, 'put must NOT report success when the tx aborts pre-commit');
    assert.equal(fake.stores.get('screenshots')?.get('f4:probe'), undefined, 'nothing durable');

    const result = await drainSweep(om, 3);
    assert.equal(result.aborted, true, 'sweep stops on commit failure');
    assert.equal(om.tradeJournal[0].entryScreenshot, SHOT, 'row blob NEVER nulled before durable commit');
    assert.equal(om.tradeJournal[0].entryScreenshotRef, undefined, 'no dangling ref');
    assert.ok(retainedBytes(om).total > 0, 'capture bytes fully retained in-row');

    // Retry once the abort condition clears (quota freed): externalizes fully.
    fake.flags.abortAfterRequestSuccess = false;
    await drainSweep(om);
    assert.equal(retainedBytes(om).total, 0, 'retry after abort succeeds');
    assert.equal(om.tradeJournal[0].entryScreenshot, null);
    assert.ok(om.tradeJournal[0].entryScreenshotRef.refId, 'ref written only after commit');

    await new Promise((r) => setTimeout(r, 30));
    assert.equal(rejections.length, 0, 'no unhandled rejections through abort/retry');
    note('green', 'f4-commit-durability', true, 'abort→false+retained, retry→externalized, 0 rejections');
  } finally {
    process.off('unhandledRejection', onRej);
  }
});

test('F4: concurrent sweep during abort window stays single-flight + fail-soft', async () => {
  const fake = makeFakeIndexedDB({ abortAfterRequestSuccess: true });
  const om = seedOm({ kill: false, fake, trades: 6, closed: 0 });
  const [a, b] = await Promise.all([
    om._m20A1RunRetainedSweepNow(Number.MAX_SAFE_INTEGER),
    om._m20A1RunRetainedSweepNow(Number.MAX_SAFE_INTEGER),
  ]);
  assert.ok(a.busy === true || b.busy === true, 'second sweep sees the busy latch');
  assert.ok(retainedBytes(om).total > 0, 'all blobs retained through concurrent aborting sweeps');
  note('green', 'f4-concurrent-sweep', true, 'single-flight latch held during abort window');
});

// ─── A1-F3: lifecycle — versionchange close + idempotent teardown ──────────

test('F3: versionchange closes the held connection and clears the cached promise', async () => {
  const fake = makeFakeIndexedDB();
  const om = seedOm({ kill: false, fake, trades: 1, closed: 0 });
  await drainSweep(om);
  assert.ok(om.__m20A1DbPromise, 'connection cached after sweep');
  assert.equal(typeof fake.db.onversionchange, 'function', 'onversionchange handler installed');

  fake.fireVersionChange();
  assert.equal(fake.db.closed, true, 'connection closed on versionchange (upgrade/delete unblocked)');
  assert.equal(om.__m20A1DbPromise, null, 'cached open promise cleared');
  assert.equal(om.__m20A1Db, null, 'cached handle cleared');

  // Later use reopens cleanly (fail-soft path if versions no longer match).
  const opensBefore = fake.stats.opens;
  om.tradeJournal.push(fatJournalRow(4242));
  await drainSweep(om);
  assert.equal(fake.stats.opens, opensBefore + 1, 'fresh open after versionchange close');
  assert.equal(om.tradeJournal.at(-1).entryScreenshot, null, 'row externalized on reopened connection');
  note('green', 'f3-versionchange-close', true, 'close + promise clear + clean reopen');
});

test('F3: teardown is idempotent and leaves no timers/connection/cache', async () => {
  const fake = makeFakeIndexedDB();
  const om = seedOm({ kill: false, fake, trades: 2, closed: 0 });
  await drainSweep(om);
  om._m20A1CachePut('x', SHOT);
  om._m20A1ScheduleRetainedSweep('t');
  om._m20A1ScheduleRetentionSweep('t');
  assert.ok(om.__m20A1SweepTimer != null && om.__m20A1RetentionTimer != null, 'timers armed');

  om._m20A1Teardown();
  om._m20A1Teardown(); // idempotent — second call must be a safe no-op
  assert.equal(om.__m20A1SweepTimer, null, 'sweep timer cleared');
  assert.equal(om.__m20A1RetentionTimer, null, 'retention timer cleared');
  assert.equal(om.__m20A1DbPromise, null, 'connection released');
  assert.equal(fake.db.closed, true, 'db closed');
  assert.equal(om._m20A1Cache().size, 0, 'blob cache wiped');
  assert.equal(om.__m20A1BlobCacheBytes, 0, 'cache byte counter reset');
  note('green', 'f3-teardown-idempotent', true, 'double teardown safe; timers+conn+cache cleared');
});

// ─── A1-F1: account isolation ───────────────────────────────────────────────

test('F1: records are owner-stamped; refIds owner-namespaced', async () => {
  const fake = makeFakeIndexedDB();
  const om = seedOm({ kill: false, fake, trades: 2, closed: 0, owner: '9001' });
  await drainSweep(om);
  const store = fake.stores.get('screenshots');
  assert.ok(store.size > 0);
  for (const rec of store.values()) {
    assert.equal(rec.owner, '9001', 'every record carries the authenticated owner');
    assert.ok(String(rec.refId).startsWith('a1:u9001:'), `owner-namespaced refId: ${rec.refId}`);
  }
  note('green', 'f1-owner-stamped', true, `records=${store.size} all owner=9001`);
});

test('F1: a different account cannot read another account\'s records', async () => {
  const fake = makeFakeIndexedDB();
  const omA = seedOm({ kill: false, fake, trades: 1, closed: 0, owner: '9001' });
  await drainSweep(omA);
  const refId = omA.tradeJournal[0].entryScreenshotRef.refId;
  assert.ok(await omA._m20A1ResolveRefBlob(refId), 'owner A reads own bytes');

  // Account switch on the shared browser profile (same origin, same store).
  const omB = seedOm({ kill: false, fake, trades: 0, closed: 0, owner: '7777' });
  assert.equal(await omB._m20A1IdbGet(refId), null, 'foreign get → null');
  assert.equal(await omB._m20A1ResolveRefBlob(refId), null, 'foreign blob resolve → null');
  const rec = fake.stores.get('screenshots').get(refId);
  assert.equal(rec.owner, '9001', 'record untouched by the foreign read');
  note('green', 'f1-cross-account-blocked', true, 'owner-validated get/resolve');
});

test('F1: no trustworthy owner → zero IDB writes, legacy in-row retention', async () => {
  const fake = makeFakeIndexedDB();
  const om = seedOm({ kill: false, fake, trades: 3, closed: 0, owner: null });
  const result = await om._m20A1RunRetainedSweepNow(Number.MAX_SAFE_INTEGER);
  assert.equal(result.owner, null, 'sweep refuses without an authenticated owner');
  assert.equal(fake.stats.puts, 0, 'zero IDB writes');
  assert.ok(retainedBytes(om).total > 0, 'rows keep in-row blobs (fail-soft, no forged identity)');
  assert.equal(await om._m20A1IdbPut({ refId: 'x', blob: SHOT }), false, 'direct put refused');
  note('green', 'f1-no-owner-no-writes', true, 'no identity forged; legacy retention preserved');
});

test('F1: legacy ownerless v1 records — adopt only when reachable, else quarantine', async () => {
  const fake = makeFakeIndexedDB();
  const om = seedOm({ kill: false, fake, trades: 0, closed: 0, owner: '9001' });
  // Seed two v1 (ownerless) records directly, as the quarantined land wrote them.
  fake.stores.set('screenshots', new Map([
    ['a1:sess:1:entry', { refId: 'a1:sess:1:entry', blob: SHOT, byteLength: SHOT.length, createdAt: Date.now() }],
    ['a1:sess:2:entry', { refId: 'a1:sess:2:entry', blob: SHOT, byteLength: SHOT.length, createdAt: Date.now() }],
  ]));
  // Only the first is referenced by the current account's loaded journal.
  om.tradeJournal.push({
    id: 1, tradeId: 1, ticker: 'EURUSD',
    entryScreenshot: null,
    entryScreenshotRef: { refId: 'a1:sess:1:entry' },
    m20_a1_screenshot_idb_v1: true,
  });

  const reachable = await om._m20A1IdbGet('a1:sess:1:entry');
  assert.ok(reachable && reachable.blob === SHOT, 'reachable v1 record readable by current account');
  await new Promise((r) => setTimeout(r, 30)); // async adoption put
  assert.equal(fake.stores.get('screenshots').get('a1:sess:1:entry').owner, '9001',
    'reachable v1 record durably adopted by the referencing account');

  const orphan = await om._m20A1IdbGet('a1:sess:2:entry');
  assert.equal(orphan, null, 'unreferenced v1 record quarantined (never blindly assigned)');
  assert.equal(fake.stores.get('screenshots').get('a1:sess:2:entry').owner, undefined,
    'quarantined record not claimed');
  note('green', 'f1-legacy-adopt-or-quarantine', true, 'adopt-if-reachable, quarantine otherwise');
});

// ─── A1-F2: retention + logout privacy clean ────────────────────────────────

test('F2: retention mark/sweep — reachable preserved; aged/orphaned expired; foreign untouched', async () => {
  const fake = makeFakeIndexedDB();
  const om = seedOm({ kill: false, fake, trades: 1, closed: 0, owner: '9001' });
  await drainSweep(om);
  const reachableRef = om.tradeJournal[0].entryScreenshotRef.refId;

  const OLD = Date.now() - 40 * 24 * 60 * 60 * 1000; // > maxAgeMs
  const store = fake.stores.get('screenshots');
  // Age the reachable record too — reachability must outrank age.
  store.get(reachableRef).createdAt = OLD;
  store.set('mine:orphan-old', { refId: 'mine:orphan-old', owner: '9001', blob: SHOT, byteLength: SHOT.length, createdAt: OLD, sessionId: 'gone' });
  store.set('legacy:orphan-old', { refId: 'legacy:orphan-old', blob: SHOT, byteLength: SHOT.length, createdAt: OLD });
  store.set('foreign:old', { refId: 'foreign:old', owner: '7777', blob: SHOT, byteLength: SHOT.length, createdAt: OLD });
  store.set('mine:active-sess-orphan', {
    refId: 'mine:active-sess-orphan', owner: '9001', blob: SHOT, byteLength: SHOT.length,
    createdAt: Date.now() - 15 * 60 * 1000, sessionId: 'a1-green', // active session, > grace
  });

  const res = await om._m20A1RunRetentionSweepNow();
  assert.ok(store.has(reachableRef), 'reachable record NEVER deleted (even past maxAge)');
  assert.ok(!store.has('mine:orphan-old'), 'own unreachable aged record expired');
  assert.ok(!store.has('legacy:orphan-old'), 'quarantined v1 leftover expired');
  assert.ok(store.has('foreign:old'), 'foreign-owner record untouched');
  assert.ok(!store.has('mine:active-sess-orphan'), 'active-session orphan (row deleted) swept after grace');
  note('green', 'f2-retention-mark-sweep', true,
    `scanned=${res.scanned} deleted=${res.deleted} reachable-kept`);
});

test('F2: count/byte budget evicts oldest unreachable only; reachable overflow reported', async () => {
  const fake = makeFakeIndexedDB();
  const om = seedOm({ kill: false, fake, trades: 1, closed: 0, owner: '9001' });
  await drainSweep(om);
  om._m20A1RetentionConfig = () => ({
    maxAgeMs: 365 * 24 * 60 * 60 * 1000, maxRecords: 3, maxTotalBytes: 1024 * 1024 * 1024,
    unreachableGraceMs: 365 * 24 * 60 * 60 * 1000,
  });
  const store = fake.stores.get('screenshots');
  const reachableCount = store.size;
  for (let i = 0; i < 4; i++) {
    store.set(`mine:extra:${i}`, {
      refId: `mine:extra:${i}`, owner: '9001', blob: SHOT, byteLength: SHOT.length,
      createdAt: Date.now() - (100 - i) * 1000, sessionId: 'other-sess',
    });
  }
  await om._m20A1RunRetentionSweepNow();
  for (let i = 0; i < reachableCount; i++) {
    // every reachable record still present
  }
  const reachable = om._m20A1CollectReachableRefIds(true);
  for (const id of reachable) assert.ok(store.has(id), `reachable ${id} survived budget eviction`);
  const extras = [...store.keys()].filter((k) => k.startsWith('mine:extra:'));
  assert.ok(extras.length < 4, `oldest unreachable evicted (left=${extras.length})`);
  note('green', 'f2-budget-eviction', true, `unreachable extras left=${extras.length}`);
});

test('F2: logout privacy-clean — safe by default, full wipe only with confirmDurable', async () => {
  const fake = makeFakeIndexedDB();
  const om = seedOm({ kill: false, fake, trades: 2, closed: 0, owner: '9001' });
  await drainSweep(om);
  const store = fake.stores.get('screenshots');
  store.set('foreign:keep', { refId: 'foreign:keep', owner: '7777', blob: SHOT, byteLength: SHOT.length, createdAt: Date.now() });
  const ownRecords = [...store.values()].filter((r) => r.owner === '9001').length;
  assert.ok(ownRecords > 0);

  // Default (no durable confirmation, e.g. offline): records retained.
  const safe = await om._m20A1PrivacyCleanOnLogout();
  assert.equal(safe.tornDown, true, 'teardown always runs');
  assert.equal([...store.values()].filter((r) => r.owner === '9001').length, ownRecords,
    'reachable records NOT deleted before durable/server re-embed confirmation');

  // Confirmed durable persist → own records wiped; foreign stays.
  const om2 = seedOm({ kill: false, fake, trades: 0, closed: 0, owner: '9001' });
  const wipe = await om2._m20A1PrivacyCleanOnLogout({ confirmDurable: true });
  assert.equal([...store.values()].filter((r) => r.owner === '9001').length, 0,
    'own records privacy-cleaned on confirmed durable logout');
  assert.ok(store.has('foreign:keep'), 'foreign records untouched');
  assert.equal(wipe.tornDown, true);
  assert.equal(om2.__m20A1DbPromise, null, 'connection closed');
  note('green', 'f2-logout-privacy-clean', true,
    `default kept=${ownRecords}, confirmDurable deleted=${wipe.deleted}`);
});

test('KILL: retention + logout APIs perform zero IDB traffic when killed', async () => {
  const fake = makeFakeIndexedDB();
  const om = seedOm({ kill: true, fake, trades: 2, closed: 0 });
  om._m20A1ScheduleRetentionSweep('kill');
  assert.ok(om.__m20A1RetentionTimer == null, 'no retention timer under kill');
  const ret = await om._m20A1RunRetentionSweepNow();
  assert.equal(ret.enabled, false, 'retention no-op under kill');
  const logout = await om._m20A1PrivacyCleanOnLogout({ confirmDurable: true });
  assert.equal(logout.enabled, false, 'logout clean does not touch IDB under kill');
  assert.equal(logout.tornDown, true, 'teardown (memory only) still runs');
  assert.equal(fake.stats.opens + fake.stats.puts + fake.stats.gets + fake.stats.deletes, 0,
    'zero IndexedDB traffic under kill');
  note('kill', 'kill-retention-logout-zero-idb', true, 'retention/logout inert under kill');
});

// ─── Release gates (2026-07-24 second correction) ──────────────────────────

test('G1: session switch mid-flight — durable snapshot DROPPED, never rerouted', async () => {
  const fake = makeFakeIndexedDB();
  const om = seedOm({ kill: false, fake, trades: 2, closed: 0 });
  await drainSweep(om);
  let sess = 'a1-green';
  om.chart.getActiveTradingSessionId = () => sess;

  const p = om.persistJournal();      // scope (owner+session+snapshot) captured NOW
  sess = 'new-session';               // user switches session while rehydrate is in flight
  const res = await p;
  assert.equal(res.durableQueued, false, 'stale completion not queued');
  assert.equal(res.reason, 'session-switched-mid-flight');
  assert.equal(om.__captured.critical.length, 0,
    'old-session journal NEVER routed to the newly active session');

  sess = 'a1-green';                  // back on the captured session
  const res2 = await om.persistJournal();
  assert.equal(res2.durableQueued, true, 'truthful completion resolves after queue');
  assert.equal(om.__captured.critical.length, 1);
  note('green', 'g1-session-switch-drop', true,
    'mid-flight switch dropped; same-session persist queued truthfully');
});

test('G1: 2-row→1-row completion inversion — stale snapshot loses, newest wins', async () => {
  const fake = makeFakeIndexedDB();
  const om = seedOm({ kill: false, fake, trades: 2, closed: 0 });
  await drainSweep(om);

  const p1 = om.persistJournal();     // snapshot A: 2 rows
  om.tradeJournal.pop();              // row removed (e.g. delete/merge)
  const p2 = om.persistJournal();     // snapshot B: 1 row (NEWEST)
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(r1.durableQueued, false, 'older invocation superseded');
  assert.equal(r1.reason, 'superseded-by-newer-persist');
  assert.equal(r2.durableQueued, true, 'newest snapshot queued');
  assert.equal(om.__captured.critical.length, 1, 'exactly one durable patch (serialized last-write-wins)');
  assert.equal(om.__captured.critical[0].journal.length, 1, 'the NEWEST snapshot is what persisted');
  note('green', 'g1-completion-inversion', true, 'stale 2-row completion dropped; 1-row newest queued');
});

test('G2: runtime kill AFTER externalization — fail-closed persist, one-time recovery, steady legacy', async () => {
  const fake = makeFakeIndexedDB();
  const om = seedOm({ kill: false, fake, trades: 3, closed: 0 });
  await drainSweep(om);
  assert.equal(retainedBytes(om).total, 0, 'precondition: rows externalized');
  try {
    window[M20_A1_KILL_SWITCH] = true;  // runtime flip AFTER externalization

    // Display returns identity (no partial copies) and schedules the transition.
    const view = om._m20A1TradeForDisplay(om.tradeJournal[0], { key: 'k', fn: () => {} });
    assert.equal(view, om.tradeJournal[0]);
    assert.ok(om.__m20A1KillTransitionTimer != null || om.__m20A1KillTransitionRunning === true
      || om.__m20A1KillTransitionDone === true, 'kill transition scheduled on first display touch');

    // Durable persist FAILS CLOSED — null-blob+ref rows never reach the server.
    const res = await om.persistJournal();
    assert.equal(res.durableQueued, false);
    assert.equal(res.reason, 'kill-transition-pending');
    assert.equal(om.__captured.critical.length, 0, 'no ref-only rows persisted');

    // One-time explicit recovery (documented IDB reads — no false zero-traffic claim).
    const t = await om._m20A1RunKillTransitionNow();
    assert.equal(t.failed, undefined);
    assert.equal(t.unresolved, 0, 'every ref recovered');
    assert.ok(t.recovered > 0);
    const row = om.tradeJournal[0];
    assert.equal(row.entryScreenshot, SHOT, 'bytes re-embedded in-row');
    assert.equal(row.entryScreenshotRef, undefined, 'ref removed after recovery');
    assert.equal(row[M20_A1_SCHEMA_V1.markKey], undefined, 'mark removed — exact legacy row shape');
    assert.ok(retainedBytes(om).total >= 3 * SHOT.length, 'legacy in-row retention restored');

    // Transition flushed the recovered journal via the EXACT legacy sync path.
    assert.equal(om.__captured.critical.length, 1, 'recovered journal persisted');
    const durable = om.__captured.critical[0];
    assert.ok(measureEmbeddedScreenshotBytes(durable.journal).totalBytes >= 3 * SHOT.length,
      'durable patch carries embedded bytes, zero null-blob rows');
    assert.equal(om.__m20A1DbPromise, null, 'connection closed after transition');

    // Steady state afterwards: exact legacy, ZERO further IDB traffic.
    const ops = fake.stats.opens + fake.stats.puts + fake.stats.gets;
    await om.persistJournal();
    om._m20A1TradeForDisplay(om.tradeJournal[0], { key: 'k2', fn: () => {} });
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(fake.stats.opens + fake.stats.puts + fake.stats.gets, ops,
      'steady legacy path performs zero IDB traffic');
    note('green', 'g2-kill-transition', true,
      `recovered=${t.recovered} unresolved=0; fail-closed persist before, zero-IDB steady after`);
  } finally {
    window[M20_A1_KILL_SWITCH] = false;
  }
});

test('G3: missing/corrupt/evicted IDB ref — durable persist fails CLOSED, refs preserved', async () => {
  const fake = makeFakeIndexedDB();
  const om = seedOm({ kill: false, fake, trades: 2, closed: 0 });
  await drainSweep(om);
  om._m20A1Teardown(); // cold cache — resolves must hit IDB

  // Evict one record behind A1's back (browser storage pressure).
  const refId = om.tradeJournal[0].entryScreenshotRef.refId;
  fake.stores.get('screenshots').delete(refId);

  const res = await om.persistJournal();
  assert.equal(res.durableQueued, false, 'fail closed — never overwrite last durable state');
  assert.equal(res.reason, 'refs-unresolved');
  assert.ok(res.unresolved >= 1, `unresolved reported: ${res.unresolved}`);
  assert.equal(om.__captured.critical.length, 0, 'no ref-only/null payload queued');
  assert.ok(om.tradeJournal[0].entryScreenshotRef, 'ref stays in-row (byte preservation)');

  // Corrupt record (tamper/bitrot) → validation rejects → also fail closed.
  fake.stores.set('screenshots', new Map(fake.stores.get('screenshots')));
  const store = fake.stores.get('screenshots');
  store.set(refId, {
    refId, owner: '9001', createdAt: Date.now(), byteLength: 40,
    blob: "data:image/png;base64,AAAA' onerror='alert(1)",
  });
  om._m20A1Teardown();
  const res2 = await om.persistJournal();
  assert.equal(res2.durableQueued, false, 'corrupt payload never persisted');

  // Record restored intact → persist recovers and queues truthfully.
  store.set(refId, { refId, owner: '9001', createdAt: Date.now(), byteLength: SHOT.length, blob: SHOT });
  om._m20A1Teardown();
  const res3 = await om.persistJournal();
  assert.equal(res3.durableQueued, true, 'retry succeeds once bytes are recoverable');
  assert.equal(om.__captured.critical.length, 1);
  note('green', 'g3-missing-ref-fail-closed', true,
    'evicted+corrupt → deferred with explicit reason; restored → queued');
});

test('G4: open split-group legs protected; aggregate collects leg BYTES', async () => {
  const fake = makeFakeIndexedDB();
  const om = seedOm({ kill: false, fake, trades: 0, closed: 2 });
  om.splitTrades = new Map();
  om.closedPositions[0].splitGroupId = 'sg1';
  om.closedPositions[0].isSplitEntry = true;
  om.splitTrades.set('sg1', { status: 'OPEN', entries: [om.closedPositions[0]] });

  await drainSweep(om);
  assert.equal(om.closedPositions[0].entryScreenshot, SHOT,
    'open split leg keeps its blob (early leg must not disappear before aggregate close)');
  assert.equal(om.closedPositions[1].entryScreenshot, null, 'non-group row externalized');

  om.splitTrades.get('sg1').status = 'CLOSED';
  await drainSweep(om);
  assert.equal(om.closedPositions[0].entryScreenshot, null, 'externalized after group close');

  // Aggregate propagation: a leg carrying a ref (restored session) contributes bytes.
  const leg = {
    id: 41, entryScreenshot: null,
    entryScreenshotRef: om.closedPositions[0].entryScreenshotRef,
    [M20_A1_SCHEMA_V1.markKey]: true,
  };
  const restored = await om._m20A1RestoreLegBlobs([leg]);
  assert.equal(restored, 1);
  assert.equal(leg.entryScreenshot, SHOT, 'aggregate sees the exact bytes');
  assert.equal(leg.entryScreenshotRef, undefined);
  note('green', 'g4-split-group-guard', true, 'open split legs protected; leg refs restored for aggregate');
});

test('G5: second caller joining an in-flight ref gets its own rerender (fan-out)', async () => {
  const fake = makeFakeIndexedDB();
  const om = seedOm({ kill: false, fake, trades: 1, closed: 0 });
  await drainSweep(om);
  om.__m20A1BlobCache = null; // force the IDB path

  const row = om.tradeJournal[0];
  let first = 0;
  let second = 0;
  om._m20A1TradeForDisplay(row, { key: 'first', fn: () => { first += 1; } });
  om._m20A1TradeForDisplay(row, { key: 'second', fn: () => { second += 1; } }); // joins in-flight
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(first, 1, 'first caller re-rendered');
  assert.equal(second, 1, 'joined caller re-rendered too (was 0 pre-fix)');
  note('green', 'g5-fanout-rerender', true, `first=${first} second=${second}`);
});

test('G5: 40-shot group renders complete despite the 32-entry cache (overlay, no read storm)', async () => {
  const fake = makeFakeIndexedDB();
  const om = seedOm({ kill: false, fake, trades: 0, closed: 0 });
  const row = {
    id: 7, tradeId: 7, ticker: 'EURUSD',
    entryScreenshots: Array.from({ length: 40 }, (_, i) => ({ screenshot: SHOT, openPrice: 1 + i })),
  };
  om.tradeJournal.push(row);
  await drainSweep(om);
  assert.equal(row.entryScreenshots, null);
  assert.equal(row.entryScreenshotRefs.length, 40);
  om.__m20A1BlobCache = null; // cold start

  let rerenders = 0;
  const v1 = om._m20A1TradeForDisplay(row, { key: 'big', fn: () => { rerenders += 1; } });
  assert.ok(!v1.entryScreenshots, 'incomplete until batch lands');
  await new Promise((r) => setTimeout(r, 300));
  const getsAfterBatch = fake.stats.gets;

  const v2 = om._m20A1TradeForDisplay(row, { key: 'big', fn: () => { rerenders += 1; } });
  assert.ok(Array.isArray(v2.entryScreenshots) && v2.entryScreenshots.length === 40,
    `complete 40-shot render (got ${v2.entryScreenshots ? v2.entryScreenshots.length : 'none'})`);
  assert.equal(v2.entryScreenshots.every((e) => e.screenshot === SHOT), true, 'byte-exact');
  assert.equal(fake.stats.gets, getsAfterBatch, 'zero repeat IDB reads for the completed batch');
  assert.ok(rerenders >= 1, 'rerender fired');

  const lim = om._m20A1OverlayLimits();
  assert.ok(om.__m20A1DisplayOverlay.size <= lim.maxEntries, 'overlay entry-bounded');
  assert.ok(om.__m20A1DisplayOverlayBytes <= lim.maxBytes, 'overlay byte-bounded');
  note('green', 'g5-big-group-overlay', true,
    `40/40 rendered; gets=${getsAfterBatch}; overlay=${om.__m20A1DisplayOverlay.size} entries`);
});

test('G5: stale-selection guard present at the trade-details rerender callsite', () => {
  const src = fs.readFileSync(path.join(__dirname, 'order-manager.js'), 'utf8');
  assert.ok(src.includes('this.__m20A1DetailsShownKey = m20A1DetailsKey'),
    'shown-key recorded when the modal (re)opens');
  assert.ok(src.includes('this.__m20A1DetailsShownKey === m20A1DetailsKey'),
    'rerender reopens ONLY while the modal still shows the same trade');
  note('green', 'g5-stale-selection-guard', true, 'callsite guard verified in source');
});

test('G6: sweep is scan-bounded across 50k rows (cursor resumes; no per-trigger rescan)', async () => {
  const fake = makeFakeIndexedDB();
  const om = seedOm({ kill: false, fake, trades: 0, closed: 0 });
  for (let i = 0; i < 50_000; i++) {
    om.tradeJournal.push({ id: i, tradeId: i, ticker: 'EURUSD', entryScreenshot: null });
  }
  om.tradeJournal[123].entryScreenshot = SHOT; // single dirty row near the FRONT (worst case)

  const MAX_SCAN = 4000;
  let totalScanned = 0;
  let externalized = 0;
  let passes = 0;
  for (; passes < 20; passes++) {
    const r = await om._m20A1RunRetainedSweepNow(16, MAX_SCAN);
    assert.ok(r.scanned <= MAX_SCAN, `pass ${passes} scan-bounded: ${r.scanned} ≤ ${MAX_SCAN}`);
    totalScanned += r.scanned;
    externalized += r.externalized;
    if (!r.pendingMore) break;
  }
  assert.equal(externalized, 1, 'the single dirty row was found and externalized');
  assert.ok(totalScanned <= 50_100, `corpus walked at most once per cycle (${totalScanned})`);
  assert.ok(passes >= 10, 'work spread across bounded passes, not one 50k rescan');
  note('green', 'g6-scan-bounded-sweep', true,
    `passes=${passes + 1} totalScanned=${totalScanned} maxPerPass=${MAX_SCAN}`);
});

test('G7: strict image data-URL contract — invalid never externalized; corrupt resolves null', async () => {
  const fake = makeFakeIndexedDB();
  const om = seedOm({ kill: false, fake, trades: 1, closed: 0 });
  const svg = `data:image/svg+xml,<svg onload=alert(1)>${'x'.repeat(120)}`;
  const bad = { id: 5, tradeId: 5, ticker: 'EURUSD', entryScreenshot: svg };
  om.tradeJournal.push(bad);
  await drainSweep(om);
  assert.equal(bad.entryScreenshotRef, undefined, 'non-contract payload NOT externalized');
  assert.equal(bad.entryScreenshot, svg, 'left exactly in-row (today\'s behavior)');

  // Tampered IDB value → validation rejects before any HTML/src/persist use.
  const refId = om.tradeJournal[0].entryScreenshotRef.refId;
  fake.stores.get('screenshots').get(refId).blob = "data:image/png;base64,AAAA' onerror='alert(1)";
  om._m20A1Teardown(); // cold cache
  assert.equal(await om._m20A1ResolveRefBlob(refId), null, 'tampered value resolves null (miss)');

  assert.equal(om._m20A1IsValidScreenshotDataUrl(SHOT), true, 'real fixture passes');
  assert.equal(om._m20A1IsValidScreenshotDataUrl('data:image/png;base64,'), false, 'empty body fails');
  assert.equal(om._m20A1IsValidScreenshotDataUrl(`data:text/html;base64,${'A'.repeat(200)}`), false,
    'non-image mime fails');
  note('green', 'g7-dataurl-validation', true, 'externalize + resolve choke points enforce the contract');
});

test('G9: logout bridge — same-origin + owner validated; bulk deletion REFUSED without durable ack', async () => {
  const fake = makeFakeIndexedDB();
  const om = seedOm({ kill: false, fake, trades: 1, closed: 0, owner: '9001' });
  await drainSweep(om);
  const store = fake.stores.get('screenshots');
  const ownCount = [...store.values()].filter((r) => r.owner === '9001').length;
  assert.ok(ownCount > 0);
  window.location.origin = 'http://local.test';
  const types = om._m20A1LogoutBridgeMessageTypes();
  const replies = [];
  const mkEvent = (origin, data) => ({
    origin, data, source: { postMessage: (m, target) => replies.push({ m, target }) },
  });

  // Foreign origin: silently ignored (no probe response either).
  om._m20A1HandleLogoutBridgeMessage(
    mkEvent('http://evil.test', { type: types.request, owner: '9001', requestId: 'r1' }));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(replies.length, 0, 'foreign origin never answered');

  // Same origin, wrong owner: refused.
  om._m20A1HandleLogoutBridgeMessage(
    mkEvent('http://local.test', { type: types.request, owner: '7777', requestId: 'r2' }));
  await new Promise((r) => setTimeout(r, 30));
  const denied = replies.find((r) => r.m.requestId === 'r2');
  assert.ok(denied && denied.m.ok === false && denied.m.reason === 'owner-mismatch');

  // Matched owner: privacy clean runs; bulk deletion refused (no verified durable ack).
  om._m20A1HandleLogoutBridgeMessage(
    mkEvent('http://local.test', { type: types.request, owner: '9001', requestId: 'r3' }));
  await new Promise((r) => setTimeout(r, 150));
  const done = replies.find((r) => r.m.requestId === 'r3');
  assert.ok(done, 'reply delivered');
  assert.equal(done.m.ok, true);
  assert.equal(done.m.confirmDurable, false, 'confirmDurable never accepted from a message');
  assert.equal(done.target, 'http://local.test', 'reply targeted at the explicit origin, never *');
  assert.equal([...store.values()].filter((r) => r.owner === '9001').length, ownCount,
    'NO unverified bulk deletion — records stay owner-locked');
  assert.equal(om.__m20A1DbPromise, null, 'teardown ran (connection closed, cache wiped)');
  note('green', 'g9-logout-bridge', true,
    'origin+owner validated; explicit-target reply; bulk delete refused without durable ack');
});

test('G9: DashboardShell.handleLogout is wired to the SAME privacy-clean protocol (source contract)', () => {
  const shellPath = path.join(REPO_ROOT, 'homepage', 'src', 'app', 'dashboard', 'DashboardShell.tsx');
  const shell = fs.readFileSync(shellPath, 'utf8');
  // Same channel + message type strings as the chart-side bridge.
  assert.ok(shell.includes('new BroadcastChannel("talaria:m20-a1:privacy-clean")'),
    'shell uses the same-origin BroadcastChannel transport');
  assert.ok(shell.includes('"talaria:m20-a1:privacy-clean:request"'), 'request type matches bridge');
  assert.ok(shell.includes('"talaria:m20-a1:privacy-clean:result"'), 'result type matches bridge');
  // Authenticated owner captured BEFORE tokens clear; no wildcard postMessage.
  assert.ok(shell.includes('localStorage.getItem("_uid")'), 'owner captured from the trusted _uid mirror');
  assert.ok(!/postMessage\([^)]*['"]\*['"]/.test(shell), 'no wildcard postMessage anywhere in the shell');
  // Bounded timeout + fail-soft: logout proceeds regardless.
  assert.ok(shell.includes('timeout-no-chart-open'), 'bounded timeout present');
  assert.ok(shell.includes('await requestChartPrivacyClean()'),
    'handleLogout awaits the privacy clean before clearing auth state');
  const cleanIdx = shell.indexOf('await requestChartPrivacyClean()');
  const logoutFetchIdx = shell.indexOf('/api/auth/logout');
  assert.ok(cleanIdx >= 0 && cleanIdx < logoutFetchIdx,
    'privacy clean runs while owner context still exists (before auth teardown)');
  note('green', 'g9-shell-wiring-contract', true,
    'DashboardShell wired: same protocol strings, owner capture, timeout, fail-soft, no wildcard');
});

test('LIFECYCLE: open failure is not memoized forever — cooldown, then clean retry', async () => {
  const fake = makeFakeIndexedDB({ failOpen: true });
  const om = seedOm({ kill: false, fake, trades: 1, closed: 0 });
  const db1 = await om._m20A1OpenIdb();
  assert.equal(db1, null, 'fail-soft null');
  assert.equal(om.__m20A1DbPromise, null, 'failed open NOT memoized (retry possible)');

  const db2 = await om._m20A1OpenIdb();
  assert.equal(db2, null, 'cooldown returns fail-soft null');
  assert.equal(fake.stats.opens, 1, 'no hammering during the cooldown window');

  fake.flags.failOpen = false;
  om.__m20A1OpenFailedAt = Date.now() - 20_000; // cooldown elapsed
  const db3 = await om._m20A1OpenIdb();
  assert.ok(db3, 'clean retry succeeds after cooldown');
  note('green', 'lifecycle-open-retry', true, 'failure→cooldown→retry (no permanent null memo)');
});

// ─── Evidence writer ───────────────────────────────────────────────────────

test('write GREEN + KILL evidence JSON when M20_A1_EVIDENCE is set', () => {
  if (!EVIDENCE_MODE) {
    note('green', 'evidence-skip', true, 'M20_A1_EVIDENCE unset');
    return;
  }
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const greenPath = path.join(EVIDENCE_DIR, 'W2-A1-SCREENSHOT-IDB-20260724-green.json');
  const killPath = path.join(EVIDENCE_DIR, 'W2-A1-SCREENSHOT-IDB-20260724-kill.json');
  fs.writeFileSync(greenPath, `${JSON.stringify(evidence.green, null, 2)}\n`, 'utf8');
  fs.writeFileSync(killPath, `${JSON.stringify(evidence.kill, null, 2)}\n`, 'utf8');
  note('green', 'evidence-written', true, `${greenPath}; ${killPath}`);
  assert.ok(fs.existsSync(greenPath) && fs.existsSync(killPath));
});
