/**
 * M19-C — hot session/runtime persist trim contract (revision).
 *
 * GREEN:
 *   node --test --test-concurrency=1 "chart v 1.4/chart/modules/m19-persist-trim-contract.test.mjs"
 *
 * Kill (exact B-era full hot payloads):
 *   TALARIA_DISABLE_M19_PERSIST_TRIM_V1=1 node --test --test-concurrency=1 ...
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHART_PATH = path.join(__dirname, '../chart.js');
const ENV_KILL = String(process.env.TALARIA_DISABLE_M19_PERSIST_TRIM_V1 || '').trim() === '1';

function installDom() {
  global.window = {
    __TALARIA_DISABLE_M19_PERSIST_TRIM_V1: ENV_KILL,
    __TALARIA_CHART_BUILD_ID: 'm19-fix-c-contract',
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    location: { href: 'http://local.test/chart?sessionId=m19-c' },
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

/** String/template/comment-aware brace match — extract a real Chart method from chart.js. */
function extractChartMethod(src, name) {
  const marker = `\n    ${name}(`;
  const start = src.indexOf(marker);
  if (start < 0) throw new Error(`method not found: ${name}`);
  // Skip parameter list (may contain default `{}`) before the method body.
  let paren = 0;
  let i = start + marker.length - 1; // at '('
  let inPs = null;
  let escP = false;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (inPs) {
      if (escP) { escP = false; continue; }
      if (ch === '\\') { escP = true; continue; }
      if (ch === inPs) inPs = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { inPs = ch; continue; }
    if (ch === '(') paren += 1;
    else if (ch === ')') {
      paren -= 1;
      if (paren === 0) { i += 1; break; }
    }
  }
  while (i < src.length && /\s/.test(src[i])) i += 1;
  if (src[i] !== '{') throw new Error(`no body after params: ${name}`);
  const brace = i;
  let depth = 0;
  let inS = null; // ', ", `
  let esc = false;
  let lineComment = false;
  let blockComment = false;
  let tmplExprDepth = 0; // ${ ... } nesting inside `
  for (let j = brace; j < src.length; j++) {
    const ch = src[j];
    const next = src[j + 1];

    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') { blockComment = false; j += 1; }
      continue;
    }

    if (inS === '`') {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (tmplExprDepth > 0) {
        if (ch === '{') tmplExprDepth += 1;
        else if (ch === '}') tmplExprDepth -= 1;
        continue;
      }
      if (ch === '$' && next === '{') { tmplExprDepth = 1; j += 1; continue; }
      if (ch === '`') inS = null;
      continue;
    }

    if (inS) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === inS) inS = null;
      continue;
    }

    if (ch === '/' && next === '/') { lineComment = true; j += 1; continue; }
    if (ch === '/' && next === '*') { blockComment = true; j += 1; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { inS = ch; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        const decl = src.slice(start + 1, j + 1).trim();
        // Method shorthand inside object literal avoids `function name(...)` ASI pitfalls.
        // eslint-disable-next-line no-new-func
        const bag = new Function(`return ({ ${decl} });`)();
        const fn = bag[name];
        if (typeof fn !== 'function') throw new Error(`extracted non-function: ${name}`);
        return fn;
      }
    }
  }
  throw new Error(`unclosed method: ${name}`);
}

/** Bind production local-backup / restore helpers onto a lightweight chart stub. */
function makeChartWithRealLocalBackup(om, sessionId = 'm19-c-backup') {
  const src = fs.readFileSync(CHART_PATH, 'utf8');
  const names = [
    '_tradingSessionLocalBackupKey',
    '_tradingSessionLocalBackupHotKey',
    '_tradingSessionLocalBackupDurableKey',
    '_m19LocalBackupTrimOn',
    '_m19MigrateLegacyLocalBackupIfNeeded',
    '_m19Utf8ByteLength',
    '_m19MergeLocalBackupTiers',
    '_m19MergePreferRicherRecordLists',
    '_m19KeepaliveSafeSessionPatch',
    '_readTradingSessionLocalBackup',
    '_slimJournalForLocalBackup',
    '_writeTradingSessionLocalBackup',
    '_sessionStateHasRuntimeOrderState',
    '_sessionStateHasMeaningfulAccountRuntime',
    '_applyTradingSessionFromLocalBackupOnly',
  ];
  const chart = {
    orderManager: om,
    replaySystem: null,
    currentTimeframe: '1m',
    indicators: { active: [] },
    _indicatorsClearedAt: null,
    _localBackupQuotaWarned: false,
    getActiveTradingSessionId: () => sessionId,
    _getOrderManagerForSessionPersistence: () => om,
    _normalizeBacktestTimeframe: (tf) => (tf ? String(tf).toLowerCase() : null),
    _snapshotIndicatorsForSessionBackup: () => [],
    showNotification() {},
    _scheduleOrderMarkersRedrawAfterSessionRestore() {},
    _queuePersistedIndicatorsRestore() {},
    _replaySessionPlayheadRestoreEnabled: () => true,
  };
  for (const n of names) {
    chart[n] = extractChartMethod(src, n);
  }
  return chart;
}

function cryptoHash(str) {
  return createHash('sha256').update(String(str)).digest('hex');
}

function seedOm(kill) {
  window.__TALARIA_DISABLE_M19_PERSIST_TRIM_V1 = !!kill;
  return Object.create(OrderManager.prototype);
}

function richRow(id = 7) {
  return {
    id,
    tradeId: id,
    type: 'BUY',
    entryScreenshot: 'data:image/png;base64,AAAA',
    exitScreenshot: 'data:image/png;base64,BBBB',
    bar_close_r: [0.1, 0.2, 0.3],
    bar_high_r: [0.2, 0.3, 0.4],
    bar_low_r: [0.0, 0.1, 0.2],
    bar_close_r_archive: [0.01, 0.02],
    post_exit_bar_close_r: [0.4, 0.5],
    post_exit_bar_high_r: [0.5, 0.6],
    post_exit_bar_low_r: [0.3, 0.4],
    post_checkpoints: [{ bar: 1 }],
    mfe_r: 1.25,
    mae_r: 0.5,
    bar_high_r_peak: 0.9,
    pnl: 12,
  };
}

/** Row whose heavy fields throw/count if read. */
function sentinelRichRow(id = 7) {
  const base = {
    id,
    tradeId: id,
    type: 'BUY',
    mfe_r: 1.25,
    mae_r: 0.5,
    bar_high_r_peak: 0.9,
    pnl: 12,
  };
  const reads = { count: 0, keys: [] };
  const heavy = [
    'entryScreenshot', 'exitScreenshot', 'bar_close_r', 'bar_high_r', 'bar_low_r',
    'bar_close_r_archive', 'post_exit_bar_close_r', 'post_exit_bar_high_r',
    'post_exit_bar_low_r', 'post_checkpoints', 'trail_sl_path',
  ];
  for (const k of heavy) {
    Object.defineProperty(base, k, {
      enumerable: true,
      configurable: true,
      get() {
        reads.count += 1;
        reads.keys.push(k);
        throw new Error(`HEAVY_READ:${k}`);
      },
    });
  }
  return { row: base, reads };
}

function bEraRuntimePatch(om) {
  const safeClone = (arr) => JSON.parse(JSON.stringify(Array.isArray(arr) ? arr : []));
  return {
    pending_orders: safeClone(om.pendingOrders),
    open_positions: safeClone(om.openPositions),
    account_runtime: {
      balance: om.balance,
      equity: om.equity,
      initialBalance: om.initialBalance,
      session_current_time: undefined,
    },
    order_counters: {
      orderIdCounter: om.orderIdCounter,
      tradeGroupIdCounter: om.tradeGroupIdCounter,
    },
    savedAt: 0, // filled by caller for compare sans savedAt
  };
}

test('kill-switch / enabled polarity', () => {
  const omOn = seedOm(false);
  assert.equal(omOn._m19PersistTrimV1Enabled(), true);
  const omOff = seedOm(true);
  assert.equal(omOff._m19PersistTrimV1Enabled(), false);
});

test('ON: getter-sentinel — never reads heavy screenshot/array values', { skip: ENV_KILL }, () => {
  const om = seedOm(false);
  const { row, reads } = sentinelRichRow(42);
  assert.doesNotThrow(() => {
    const slim = om._m19StripHeavyFieldsForHotPersist(row);
    assert.equal(slim.entryScreenshot, undefined);
    assert.equal(slim.bar_close_r, undefined);
    assert.equal(slim.mfe_r, 1.25);
    assert.equal(slim.pnl, 12);
    JSON.stringify(slim);
  });
  assert.equal(reads.count, 0, `heavy reads=${reads.count} keys=${reads.keys}`);
});

test('ON: runtime patch omits heavy fields, marks slim, zero heavy reads', { skip: ENV_KILL }, () => {
  const om = seedOm(false);
  const { row, reads } = sentinelRichRow(1);
  om.pendingOrders = [];
  om.openPositions = [row];
  om.balance = 10000;
  om.equity = 10000;
  om.initialBalance = 10000;
  om.orderIdCounter = 1;
  om.tradeGroupIdCounter = 1;
  om.orderService = null;
  let patch;
  assert.doesNotThrow(() => { patch = om._buildRuntimeOrderPersistPatch(); });
  assert.equal(reads.count, 0);
  assert.equal(patch.m19_hot_persist_trim_v1, true);
  assert.equal(patch.open_positions[0].bar_close_r, undefined);
  assert.equal(patch.open_positions[0].entryScreenshot, undefined);
  assert.equal(patch.open_positions[0].mfe_r, 1.25);
});

test('ON: hot journal slim; in-memory stays full', { skip: ENV_KILL }, () => {
  const om = seedOm(false);
  om.tradeJournal = [richRow()];
  const hot = om._m19CloneJournalForHotSessionPersist();
  assert.equal(hot[0].entryScreenshot, undefined);
  assert.equal(hot[0].bar_close_r, undefined);
  assert.equal(om.tradeJournal[0].entryScreenshot.startsWith('data:image'), true);
  assert.deepEqual(om.tradeJournal[0].bar_close_r, [0.1, 0.2, 0.3]);
});

test('prefer-richer only when slim-marked; unmarked uses B-era replace/clear', { skip: ENV_KILL }, () => {
  const om = seedOm(false);
  const prev = richRow();
  const clearShot = { id: 7, tradeId: 7, pnl: 1, entryScreenshot: null, bar_close_r: [] };
  // Unmarked → B-era replace (null/empty win).
  const replaced = om._m19MergePreferRicherTradeRow(prev, clearShot);
  assert.equal(replaced.entryScreenshot, null);
  assert.deepEqual(replaced.bar_close_r, []);
  // Marked slim → prefer richer.
  const slim = om._m19StripHeavyFieldsForHotPersist(prev);
  slim.pnl = 99;
  slim.m19_hot_persist_trim_v1 = true;
  const merged = om._m19MergePreferRicherTradeRow(prev, slim, { slimMarked: true });
  assert.equal(merged.pnl, 99);
  assert.equal(merged.entryScreenshot, prev.entryScreenshot);
  assert.deepEqual(merged.bar_close_r, prev.bar_close_r);
});

test('prefer-richer recursive: nested metadata/journalEntry heavy fields survive omit', { skip: ENV_KILL }, () => {
  const om = seedOm(false);
  const prev = {
    id: 11,
    tradeId: 11,
    pnl: 10,
    metadata: {
      entryScreenshot: 'data:image/png;base64,META_ENTRY',
      bar_close_r: [0.1, 0.2, 0.3],
      note: 'keep',
    },
    journalEntry: {
      exitScreenshot: 'data:image/png;base64,JRN_EXIT',
      comment: 'old',
    },
  };
  const slim = om._m19StripHeavyFieldsForHotPersist(prev);
  assert.equal(slim.metadata.entryScreenshot, undefined);
  assert.equal(slim.metadata.bar_close_r, undefined);
  assert.equal(slim.journalEntry.exitScreenshot, undefined);
  slim.pnl = 77;
  slim.metadata.note = 'hot';
  slim.journalEntry.comment = 'new';
  const merged = om._m19MergePreferRicherTradeRow(prev, slim, { slimMarked: true });
  assert.equal(merged.pnl, 77);
  assert.equal(merged.metadata.note, 'hot');
  assert.equal(merged.metadata.entryScreenshot, prev.metadata.entryScreenshot);
  assert.deepEqual(merged.metadata.bar_close_r, prev.metadata.bar_close_r);
  assert.equal(merged.journalEntry.comment, 'new');
  assert.equal(merged.journalEntry.exitScreenshot, prev.journalEntry.exitScreenshot);
});

test('kill: exact B-era runtime patch shape (full heavy fields)', { skip: !ENV_KILL }, () => {
  const om = seedOm(true);
  const src = richRow();
  om.openPositions = [src];
  om.pendingOrders = [];
  om.balance = 1;
  om.equity = 1;
  om.initialBalance = 1;
  om.orderIdCounter = 1;
  om.tradeGroupIdCounter = 1;
  om.orderService = null;
  const patch = om._buildRuntimeOrderPersistPatch();
  assert.equal(patch.m19_hot_persist_trim_v1, undefined);
  assert.equal(patch.open_positions[0].entryScreenshot, src.entryScreenshot);
  assert.deepEqual(patch.open_positions[0].bar_close_r, src.bar_close_r);
  const era = bEraRuntimePatch(om);
  const a = { ...patch, savedAt: 0, pending_orders: patch.pending_orders.map(({ build_id, schema_version, ...r }) => r), open_positions: patch.open_positions.map(({ build_id, schema_version, ...r }) => r) };
  // Stamp fields may exist; compare heavy payloads present.
  assert.deepEqual(a.open_positions[0].bar_close_r, era.open_positions[0].bar_close_r);
  assert.equal(a.open_positions[0].entryScreenshot, era.open_positions[0].entryScreenshot);
});

test('chart.js source wires dual-tier backup + keepalive + host-only critical', { skip: ENV_KILL }, () => {
  const src = fs.readFileSync(CHART_PATH, 'utf8');
  assert.match(src, /_tradingSessionLocalBackupHotKey/);
  assert.match(src, /_tradingSessionLocalBackupDurableKey/);
  assert.match(src, /_m19MergeLocalBackupTiers/);
  assert.match(src, /_m19MigrateLegacyLocalBackupIfNeeded/);
  assert.match(src, /_m19KeepaliveSafeSessionPatch/);
  assert.match(src, /_m19Utf8ByteLength/);
  assert.match(src, /removeItem\(this\._tradingSessionLocalBackupHotKey/);
  assert.match(src, /_m19TrimRecordsForHotPersist\(om\.openPositions\)/);
  assert.match(src, /_writeTradingSessionLocalBackupThrottled\(\{\s*force:\s*true,\s*slim:\s*false\s*\}\)/);
  const omSrc = fs.readFileSync(path.join(__dirname, 'order-manager.js'), 'utf8');
  assert.match(omSrc, /_buildDurableRuntimeOrderPersistPatch/);
  assert.match(omSrc, /_shouldSkipMcIframeRuntimePersist/);
  const replaySrc = fs.readFileSync(path.join(__dirname, 'replay-system.js'), 'utf8');
  assert.match(replaySrc, /_shouldSkipMcIframeRuntimePersist/);
  assert.match(replaySrc, /persistRuntimeOrderState\(\{\s*critical:\s*true\s*\}\)/);
});

test('local backup path: real writer — hot key bounded + zero heavy reads', { skip: ENV_KILL }, () => {
  const om = seedOm(false);
  const { row, reads } = sentinelRichRow(9);
  const journalSentinel = sentinelRichRow(10);
  om.tradeJournal = [journalSentinel.row];
  om.openPositions = [row];
  om.pendingOrders = [];
  om.closedPositions = [];
  om.balance = 10000;
  om.equity = 10000;
  om.initialBalance = 10000;
  om.orderIdCounter = 3;
  om.tradeGroupIdCounter = 1;
  om.orderService = null;

  const sessionId = 'm19-c-backup';
  const chart = makeChartWithRealLocalBackup(om, sessionId);
  userStorage._m.clear();

  assert.doesNotThrow(() => {
    chart._writeTradingSessionLocalBackup({ slim: true });
  });
  assert.equal(reads.count + journalSentinel.reads.count, 0, 'local backup must not read heavy getters');
  const hotKey = chart._tradingSessionLocalBackupHotKey(sessionId);
  const durableKey = chart._tradingSessionLocalBackupDurableKey(sessionId);
  const raw = userStorage.getItem(hotKey);
  assert.ok(raw, 'expected hot-tier local backup write');
  assert.equal(userStorage.getItem(durableKey), null, 'hot write must not touch durable key');
  const payload = JSON.parse(raw);
  assert.equal(payload.m19_hot_persist_trim_v1, true);
  assert.ok(raw.length < 64 * 1024, `backup too large: ${raw.length}`);
  assert.equal(payload.journal[0].entryScreenshot, undefined);
  assert.equal(payload.journal[0].bar_close_r, undefined);
  assert.equal(payload.open_positions[0].bar_close_r, undefined);
  assert.equal(payload.open_positions[0].entryScreenshot, undefined);
});

test('local-only restore: durable+hot tiers merge; hot never reads durable', { skip: ENV_KILL }, () => {
  const om = seedOm(false);
  const full = richRow(42);
  full.bar_close_r_archive = Array.from({ length: 40 }, (_, i) => i * 0.01);
  full.bar_close_r = Array.from({ length: 256 }, (_, i) => 1 + i * 0.001);
  full.metadata = {
    entryScreenshot: 'data:image/png;base64,META_ENTRY',
    bar_close_r: [9, 8, 7],
  };
  full.journalEntry = { exitScreenshot: 'data:image/png;base64,JRN_EXIT' };

  om.tradeJournal = [JSON.parse(JSON.stringify(full))];
  om.openPositions = [JSON.parse(JSON.stringify(full))];
  om.pendingOrders = [];
  om.closedPositions = [];
  om.balance = 10000;
  om.equity = 10000;
  om.initialBalance = 10000;
  om.orderIdCounter = 42;
  om.tradeGroupIdCounter = 1;
  om.orderService = null;
  om.normalizeJournalRowsInPlace = () => {};
  om.restoreIdCountersFromJournal = () => {};
  om.restoreRuntimeOrderStateFromSession = function restore(state) {
    this.openPositions = Array.isArray(state.open_positions) ? state.open_positions : [];
    this.pendingOrders = Array.isArray(state.pending_orders) ? state.pending_orders : [];
    if (state.account_runtime) {
      this.balance = state.account_runtime.balance;
      this.equity = state.account_runtime.equity;
    }
  };
  om.reconcileAccountAfterSessionRestore = () => {};
  om.updateJournalTab = () => {};
  om.updatePositionsPanel = () => {};

  const sessionId = 'm19-c-local-only';
  const chart = makeChartWithRealLocalBackup(om, sessionId);
  userStorage._m.clear();

  // 1) Seed richer durable backup (critical / full).
  chart._writeTradingSessionLocalBackup({ slim: false });
  const durableKey = chart._tradingSessionLocalBackupDurableKey(sessionId);
  const hotKey = chart._tradingSessionLocalBackupHotKey(sessionId);
  assert.ok(userStorage.getItem(durableKey));
  assert.equal(userStorage.getItem(hotKey), null);

  // 2) Hot slim save — separate key; must not read durable.
  const origGet = userStorage.getItem.bind(userStorage);
  let durableReads = 0;
  userStorage.getItem = (k) => {
    if (k === durableKey) durableReads += 1;
    return origGet(k);
  };
  chart._writeTradingSessionLocalBackup({ slim: true });
  userStorage.getItem = origGet;
  assert.equal(durableReads, 0, 'hot write must never read durable key');
  assert.ok(userStorage.getItem(hotKey));

  // 3) Restore merges durable + hot → screenshots + archive‖tail survive.
  const merged = chart._readTradingSessionLocalBackup(sessionId);
  assert.equal(merged.open_positions[0].entryScreenshot, full.entryScreenshot);
  assert.deepEqual(merged.open_positions[0].bar_close_r, full.bar_close_r);
  assert.deepEqual(merged.open_positions[0].bar_close_r_archive, full.bar_close_r_archive);
  assert.equal(merged.journal[0].journalEntry.exitScreenshot, full.journalEntry.exitScreenshot);

  om.tradeJournal = [];
  om.openPositions = [];
  const ok = chart._applyTradingSessionFromLocalBackupOnly(sessionId);
  assert.equal(ok, true);
  assert.equal(om.openPositions[0].entryScreenshot, full.entryScreenshot);
  assert.deepEqual(om.openPositions[0].bar_close_r_archive, full.bar_close_r_archive);
  assert.deepEqual(om.openPositions[0].bar_close_r, full.bar_close_r);
  assert.equal(om.tradeJournal[0].journalEntry.exitScreenshot, full.journalEntry.exitScreenshot);
});

test('I16 e2e: full restore → slim save → hydrate → export keeps screenshots + excursions', { skip: ENV_KILL }, () => {
  const om = seedOm(false);
  const full = richRow(100);
  full.bar_close_r_archive = Array.from({ length: 40 }, (_, i) => i * 0.01);
  full.bar_close_r = Array.from({ length: 256 }, (_, i) => 1 + i * 0.001);
  // 1) Old full restore into memory
  om.tradeJournal = [JSON.parse(JSON.stringify(full))];
  om.openPositions = [];
  om.pendingOrders = [];
  om.balance = 10000;
  om.equity = 10000;
  om.initialBalance = 10000;
  om.orderIdCounter = 100;
  om.tradeGroupIdCounter = 1;
  om.orderService = null;

  // 2) Slim hot save (marked)
  const hotJournal = om._m19CloneJournalForHotSessionPersist();
  const runtime = om._buildRuntimeOrderPersistPatch();
  const slimPatch = {
    journal: hotJournal,
    ...runtime,
    m19_hot_persist_trim_v1: true,
  };
  assert.equal(slimPatch.journal[0].entryScreenshot, undefined);
  assert.equal(slimPatch.journal[0].bar_close_r, undefined);

  // 3) Server-side prefer-richer into durable store (simulate SQL row)
  const durable = { ...full };
  const afterSlim = om._m19MergePreferRicherTradeRow(durable, slimPatch.journal[0], { slimMarked: true });
  afterSlim.pnl = 99; // slim may update light fields
  assert.equal(afterSlim.entryScreenshot, full.entryScreenshot);
  assert.deepEqual(afterSlim.bar_close_r, full.bar_close_r);
  assert.deepEqual(afterSlim.bar_close_r_archive, full.bar_close_r_archive);

  // 4) Refresh hydrate: server returns rich durable (unmarked) → B-era merge
  const local = { id: 100, tradeId: 100, pnl: 50 };
  const hydrated = om._m19MergePreferRicherTradeRow(local, afterSlim); // unmarked → replace
  assert.equal(hydrated.entryScreenshot, full.entryScreenshot);
  assert.deepEqual(hydrated.bar_close_r_archive, full.bar_close_r_archive);

  // 5) Export projection sees full archive‖tail
  om.tradeJournal = [hydrated];
  const projected = om._m19ProjectTradeExcursionFields(hydrated);
  assert.equal(projected.bar_close_r.length, full.bar_close_r_archive.length + full.bar_close_r.length);
  assert.deepEqual(projected.bar_close_r.slice(0, full.bar_close_r_archive.length), full.bar_close_r_archive);
  assert.equal(hydrated.entryScreenshot, full.entryScreenshot);
});

test('long-running open position: hot persist never reads growing excursion arrays', { skip: ENV_KILL }, () => {
  const om = seedOm(false);
  const { row, reads } = sentinelRichRow(55);
  // Simulate long open: many samples behind getters
  om.openPositions = [row];
  om.pendingOrders = [];
  om.tradeJournal = [];
  om.balance = 1;
  om.equity = 1;
  om.initialBalance = 1;
  om.orderIdCounter = 1;
  om.tradeGroupIdCounter = 1;
  om.orderService = null;
  for (let i = 0; i < 20; i++) {
    assert.doesNotThrow(() => om._buildRuntimeOrderPersistPatch());
  }
  assert.equal(reads.count, 0);
});

test('single + multichart host patches both mark slim when trim ON', { skip: ENV_KILL }, () => {
  for (const embed of [false, true]) {
    const om = seedOm(false);
    om._multichartIsEmbedIframe = () => embed;
    om.openPositions = [richRow(embed ? 2 : 1)];
    om.pendingOrders = [];
    om.balance = 1;
    om.equity = 1;
    om.initialBalance = 1;
    om.orderIdCounter = 1;
    om.tradeGroupIdCounter = 1;
    om.orderService = null;
    const patch = om._buildRuntimeOrderPersistPatch();
    assert.equal(patch.m19_hot_persist_trim_v1, true);
    assert.equal(patch.open_positions[0].bar_close_r, undefined);
  }
});

test('paused + playing: hot journal/runtime stay slim and marked', { skip: ENV_KILL }, () => {
  for (const playing of [false, true]) {
    const om = seedOm(false);
    om.tradeJournal = [richRow(playing ? 3 : 4)];
    om.openPositions = [richRow(playing ? 5 : 6)];
    om.pendingOrders = [];
    om.balance = 1;
    om.equity = 1;
    om.initialBalance = 1;
    om.orderIdCounter = 1;
    om.tradeGroupIdCounter = 1;
    om.orderService = null;
    om.chart = { replaySystem: { isPlaying: playing, isActive: true } };
    const hot = om._m19CloneJournalForHotSessionPersist();
    const runtime = om._buildRuntimeOrderPersistPatch();
    assert.equal(hot[0].entryScreenshot, undefined);
    assert.equal(runtime.m19_hot_persist_trim_v1, true);
    assert.equal(runtime.open_positions[0].bar_close_r, undefined);
    void playing;
  }
});

test('critical boundary: unmarked durable runtime snapshot; hot stays slim', { skip: ENV_KILL }, () => {
  const om = seedOm(false);
  const src = richRow(88);
  src.bar_close_r_archive = Array.from({ length: 20 }, (_, i) => i);
  src.bar_close_r = Array.from({ length: 256 }, (_, i) => i + 100);
  om.openPositions = [src];
  om.pendingOrders = [];
  om.tradeJournal = [];
  om.balance = 5000;
  om.equity = 5100;
  om.initialBalance = 10000;
  om.orderIdCounter = 8;
  om.tradeGroupIdCounter = 2;
  om.orderService = null;
  om._writeRuntimeOrderStateToSessionStorage = () => {};

  const hotQueued = [];
  const criticalQueued = [];
  om.chart = {
    getActiveTradingSessionId: () => 'm19-c-crit',
    scheduleSessionStateSave: (p) => hotQueued.push(p),
    queueCriticalSessionStateSave: (p) => criticalQueued.push(p),
  };

  // Regular hot — slim marked, no heavy.
  om.persistRuntimeOrderState();
  assert.equal(hotQueued.length, 1);
  assert.equal(criticalQueued.length, 0);
  assert.equal(hotQueued[0].m19_hot_persist_trim_v1, true);
  assert.equal(hotQueued[0].open_positions[0].bar_close_r, undefined);

  // Critical (pause/pagehide/close) — unmarked full durable.
  om.persistRuntimeOrderState({ critical: true });
  assert.equal(hotQueued.length, 2);
  assert.equal(criticalQueued.length, 1);
  assert.equal(hotQueued[1].m19_hot_persist_trim_v1, true);
  assert.equal(hotQueued[1].open_positions[0].bar_close_r, undefined);
  const durable = criticalQueued[0];
  assert.equal(durable.m19_hot_persist_trim_v1, undefined);
  assert.deepEqual(durable.open_positions[0].bar_close_r, src.bar_close_r);
  assert.deepEqual(durable.open_positions[0].bar_close_r_archive, src.bar_close_r_archive);
  assert.equal(durable.open_positions[0].entryScreenshot, src.entryScreenshot);
});

test('e2e long-open: restore → hot saves → offline slim → local restore → critical close/export', { skip: ENV_KILL }, () => {
  const om = seedOm(false);
  const full = richRow(200);
  full.bar_close_r_archive = Array.from({ length: 50 }, (_, i) => i * 0.02);
  full.bar_close_r = Array.from({ length: 256 }, (_, i) => 2 + i * 0.001);
  full.metadata = { entryScreenshot: 'data:image/png;base64,SRV_META', bar_close_r: [1, 2] };
  full.journalEntry = { exitScreenshot: 'data:image/png;base64,SRV_EXIT' };

  // 1) Full restore into memory (server durable).
  om.tradeJournal = [JSON.parse(JSON.stringify(full))];
  om.openPositions = [JSON.parse(JSON.stringify(full))];
  om.pendingOrders = [];
  om.closedPositions = [];
  om.balance = 10000;
  om.equity = 10000;
  om.initialBalance = 10000;
  om.orderIdCounter = 200;
  om.tradeGroupIdCounter = 1;
  om.orderService = null;
  om.normalizeJournalRowsInPlace = () => {};
  om.restoreIdCountersFromJournal = () => {};
  om.restoreRuntimeOrderStateFromSession = function restore(state) {
    this.openPositions = Array.isArray(state.open_positions)
      ? JSON.parse(JSON.stringify(state.open_positions)) : [];
    this.pendingOrders = Array.isArray(state.pending_orders)
      ? JSON.parse(JSON.stringify(state.pending_orders)) : [];
  };
  om.reconcileAccountAfterSessionRestore = () => {};
  om.updateJournalTab = () => {};
  om.updatePositionsPanel = () => {};
  om.buildPerInstrumentStats = () => ({});
  om.groupJournalByTicker = () => ({});

  const sessionId = 'm19-c-e2e';
  const chart = makeChartWithRealLocalBackup(om, sessionId);
  userStorage._m.clear();

  // Seed durable local + prove hot runtime stays slim across "long replay".
  chart._writeTradingSessionLocalBackup({ slim: false });
  for (let i = 0; i < 12; i++) {
    const hot = om._buildRuntimeOrderPersistPatch();
    assert.equal(hot.m19_hot_persist_trim_v1, true);
    assert.equal(hot.open_positions[0].bar_close_r, undefined);
    assert.ok(JSON.stringify(hot).length < 524288);
  }

  // 2) Network failure: hot slim local backup only.
  chart._writeTradingSessionLocalBackup({ slim: true });
  const offline = chart._readTradingSessionLocalBackup(sessionId);
  assert.equal(offline.open_positions[0].entryScreenshot, full.entryScreenshot);
  assert.deepEqual(offline.open_positions[0].bar_close_r_archive, full.bar_close_r_archive);
  assert.equal(offline.journal[0].metadata.entryScreenshot, full.metadata.entryScreenshot);

  // 3) Local-only refresh.
  om.tradeJournal = [];
  om.openPositions = [];
  assert.equal(chart._applyTradingSessionFromLocalBackupOnly(sessionId), true);
  assert.deepEqual(om.openPositions[0].bar_close_r, full.bar_close_r);
  assert.deepEqual(om.openPositions[0].bar_close_r_archive, full.bar_close_r_archive);

  // 4) Continue + critical close/export — durable unmarked + projection exact.
  const criticalQueued = [];
  om._writeRuntimeOrderStateToSessionStorage = () => {};
  om.chart = {
    getActiveTradingSessionId: () => sessionId,
    scheduleSessionStateSave: () => {},
    queueCriticalSessionStateSave: (p) => criticalQueued.push(p),
  };
  om.persistRuntimeOrderState({ critical: true });
  assert.equal(criticalQueued[0].m19_hot_persist_trim_v1, undefined);
  assert.deepEqual(criticalQueued[0].open_positions[0].bar_close_r_archive, full.bar_close_r_archive);

  chart._writeTradingSessionLocalBackup({ slim: false });
  const closed = chart._readTradingSessionLocalBackup(sessionId);
  assert.equal(closed.journal[0].entryScreenshot, full.entryScreenshot);
  assert.equal(closed.journal[0].journalEntry.exitScreenshot, full.journalEntry.exitScreenshot);

  const projected = om._m19ProjectTradeExcursionFields(om.openPositions[0]);
  assert.equal(
    projected.bar_close_r.length,
    full.bar_close_r_archive.length + full.bar_close_r.length
  );
  assert.deepEqual(
    projected.bar_close_r.slice(0, full.bar_close_r_archive.length),
    full.bar_close_r_archive
  );
});

test('permanent: 1.12MB durable + 100 hot writes — durable hash stable, zero durable reads, hot ≤64KB', { skip: ENV_KILL }, () => {
  const om = seedOm(false);
  // ~1.12MB-class durable payload (screenshots + excursion history).
  const fatShot = `data:image/png;base64,${'A'.repeat(18000)}`;
  const rows = [];
  for (let i = 0; i < 50; i++) {
    const r = richRow(1000 + i);
    r.entryScreenshot = fatShot;
    r.exitScreenshot = fatShot;
    r.bar_close_r_archive = Array.from({ length: 40 }, (_, j) => j * 0.01 + i);
    r.bar_close_r = Array.from({ length: 256 }, (_, j) => 1 + j * 0.001 + i * 0.01);
    r.metadata = { entryScreenshot: fatShot, bar_close_r: r.bar_close_r.slice(0, 8) };
    r.journalEntry = { exitScreenshot: fatShot };
    rows.push(r);
  }
  om.tradeJournal = JSON.parse(JSON.stringify(rows));
  om.openPositions = [JSON.parse(JSON.stringify(rows[0]))];
  om.pendingOrders = [];
  om.closedPositions = [];
  om.balance = 10000;
  om.equity = 10000;
  om.initialBalance = 10000;
  om.orderIdCounter = 2000;
  om.tradeGroupIdCounter = 1;
  om.orderService = null;
  om.buildPerInstrumentStats = () => ({});
  om.groupJournalByTicker = () => ({});
  om.normalizeJournalRowsInPlace = () => {};
  om.restoreIdCountersFromJournal = () => {};
  om.restoreRuntimeOrderStateFromSession = function restore(state) {
    this.openPositions = Array.isArray(state.open_positions)
      ? JSON.parse(JSON.stringify(state.open_positions)) : [];
    this.pendingOrders = Array.isArray(state.pending_orders)
      ? JSON.parse(JSON.stringify(state.pending_orders)) : [];
  };
  om.reconcileAccountAfterSessionRestore = () => {};
  om.updateJournalTab = () => {};
  om.updatePositionsPanel = () => {};

  const sessionId = 'm19-c-dual-tier';
  const chart = makeChartWithRealLocalBackup(om, sessionId);
  userStorage._m.clear();

  chart._writeTradingSessionLocalBackup({ slim: false });
  const durableKey = chart._tradingSessionLocalBackupDurableKey(sessionId);
  const hotKey = chart._tradingSessionLocalBackupHotKey(sessionId);
  const durableRaw0 = userStorage.getItem(durableKey);
  assert.ok(durableRaw0);
  assert.ok(durableRaw0.length > 1_000_000, `expected ~1.12MB durable, got ${durableRaw0.length}`);
  const durableHash0 = cryptoHash(durableRaw0);

  const origGet = userStorage.getItem.bind(userStorage);
  const origSet = userStorage.setItem.bind(userStorage);
  let durableReads = 0;
  let durableWrites = 0;
  userStorage.getItem = (k) => {
    if (k === durableKey) durableReads += 1;
    return origGet(k);
  };
  userStorage.setItem = (k, v) => {
    if (k === durableKey) durableWrites += 1;
    return origSet(k, v);
  };

  const hotSizes = [];
  for (let i = 0; i < 100; i++) {
    om.balance = 10000 + i;
    chart._writeTradingSessionLocalBackup({ slim: true });
    const hotRaw = origGet(hotKey);
    assert.ok(hotRaw, `hot write ${i} missing`);
    hotSizes.push(hotRaw.length);
    assert.ok(hotRaw.length <= 64 * 1024, `hot serialize ${i} too large: ${hotRaw.length}`);
  }

  userStorage.getItem = origGet;
  userStorage.setItem = origSet;

  assert.equal(durableReads, 0, 'hot writes must never read durable key');
  assert.equal(durableWrites, 0, 'hot writes must never write durable key');
  assert.equal(cryptoHash(origGet(durableKey)), durableHash0, 'durable hash must be unchanged');
  assert.ok(Math.max(...hotSizes) <= 64 * 1024);

  // Restore retains exact screenshots + archive‖tail from durable tier.
  om.tradeJournal = [];
  om.openPositions = [];
  assert.equal(chart._applyTradingSessionFromLocalBackupOnly(sessionId), true);
  assert.equal(om.openPositions[0].entryScreenshot, fatShot);
  assert.deepEqual(om.openPositions[0].bar_close_r_archive, rows[0].bar_close_r_archive);
  assert.deepEqual(om.openPositions[0].bar_close_r, rows[0].bar_close_r);
  assert.equal(om.tradeJournal[0].journalEntry.exitScreenshot, fatShot);
  const projected = om._m19ProjectTradeExcursionFields(om.openPositions[0]);
  assert.equal(
    projected.bar_close_r.length,
    rows[0].bar_close_r_archive.length + rows[0].bar_close_r.length
  );
});

test('legacy key migrates into durable tier on restore', { skip: ENV_KILL }, () => {
  const om = seedOm(false);
  const full = richRow(77);
  om.tradeJournal = [full];
  om.openPositions = [];
  om.pendingOrders = [];
  om.closedPositions = [];
  om.balance = 1;
  om.equity = 1;
  om.initialBalance = 1;
  om.orderIdCounter = 1;
  om.tradeGroupIdCounter = 1;
  om.orderService = null;
  const sessionId = 'm19-c-migrate';
  const chart = makeChartWithRealLocalBackup(om, sessionId);
  userStorage._m.clear();
  const legacyKey = chart._tradingSessionLocalBackupKey(sessionId);
  const durableKey = chart._tradingSessionLocalBackupDurableKey(sessionId);
  const legacyPayload = {
    savedAt: 1,
    journal: [full],
    open_positions: [],
    pending_orders: [],
    closed_positions: [],
    account_runtime: { balance: 1, equity: 1, initialBalance: 1 },
  };
  userStorage.setItem(legacyKey, JSON.stringify(legacyPayload));
  const merged = chart._readTradingSessionLocalBackup(sessionId);
  assert.equal(merged.journal[0].entryScreenshot, full.entryScreenshot);
  assert.ok(userStorage.getItem(durableKey), 'legacy raw must be copied to durable key');
});

test('multichart embed pause/pagehide: zero persist and zero serialization', { skip: ENV_KILL }, () => {
  const om = seedOm(false);
  om._multichartIsEmbedIframe = () => true;
  om._shouldSkipMcIframeRuntimePersist = () => true;
  om.openPositions = [richRow(9)];
  om.pendingOrders = [];
  om.balance = 1;
  om.equity = 1;
  om.initialBalance = 1;
  om.orderIdCounter = 1;
  om.tradeGroupIdCounter = 1;
  om.orderService = null;
  let builds = 0;
  const origHot = om._buildRuntimeOrderPersistPatch.bind(om);
  const origDur = om._buildDurableRuntimeOrderPersistPatch.bind(om);
  om._buildRuntimeOrderPersistPatch = (...a) => { builds += 1; return origHot(...a); };
  om._buildDurableRuntimeOrderPersistPatch = (...a) => { builds += 1; return origDur(...a); };
  const queued = [];
  om.chart = {
    getActiveTradingSessionId: () => 'mc-embed',
    scheduleSessionStateSave: (p) => queued.push(p),
    queueCriticalSessionStateSave: (p) => queued.push(p),
  };
  om._writeRuntimeOrderStateToSessionStorage = () => { builds += 1; };
  om.persistRuntimeOrderState();
  om.persistRuntimeOrderState({ critical: true });
  assert.equal(builds, 0, 'iframe must not serialize runtime patches');
  assert.equal(queued.length, 0, 'iframe must not queue hot/critical persistence');

  // Replay pause path: skipMcPersist short-circuits before flush/persist.
  const ReplaySystem = require('./replay-system.js');
  const rs = Object.create(ReplaySystem.prototype);
  rs.chart = { orderManager: om, render() {} };
  rs.isActive = true;
  rs.isPlaying = false;
  rs._cancelDeferredPlayStart = () => {};
  rs._activeTickLoop = 0;
  rs._activeCandleLoop = 0;
  rs._nextCandleTimer = null;
  rs.tickInterval = null;
  rs.playInterval = null;
  rs.tickProgress = 0;
  rs.tickElapsedMs = 0;
  rs.animatingCandle = null;
  rs.showTickProgress = () => {};
  rs.syncPlayPauseButtonVisuals = () => {};
  rs._flushReplayIndicatorRecalc = () => {};
  rs._flushReplayStateToSession = () => { builds += 1; };
  rs.pause();
  assert.equal(builds, 0, 'embed pause must not flush/persist');
});

test('keepalive network patch stays within 60 KiB UTF-8 bytes (Arabic notes/tags)', { skip: ENV_KILL }, () => {
  const om = seedOm(false);
  const fat = richRow(1);
  fat.entryScreenshot = `data:image/png;base64,${'B'.repeat(80000)}`;
  fat.bar_close_r = Array.from({ length: 256 }, (_, i) => i);
  fat.bar_close_r_archive = Array.from({ length: 40 }, (_, i) => i);
  // Multi-byte UTF-8 notes/tags — string.length under-counts vs TextEncoder bytes.
  const arabicNote = 'ملاحظة_' + 'مرحبابالعالم_تداول_اختبار_'.repeat(80);
  const arabicTag = 'وسم_' + 'عربية_'.repeat(120);
  fat.notes = arabicNote;
  fat.tags = [arabicTag, arabicTag];
  fat.metadata = { ...(fat.metadata || {}), notes: arabicNote, tags: [arabicTag] };
  om.openPositions = [fat];
  om.pendingOrders = [];
  om.tradeJournal = [fat];
  om.balance = 1;
  om.equity = 1;
  om.initialBalance = 1;
  om.orderIdCounter = 1;
  om.tradeGroupIdCounter = 1;
  om.orderService = null;
  const chart = makeChartWithRealLocalBackup(om, 'm19-c-keepalive');
  const fullPatch = om._buildDurableRuntimeOrderPersistPatch();
  fullPatch.journal = [JSON.parse(JSON.stringify(fat))];
  const fullBody = JSON.stringify(fullPatch);
  assert.ok(chart._m19Utf8ByteLength(fullBody) > 64 * 1024);
  assert.ok(arabicNote.length < chart._m19Utf8ByteLength(arabicNote), 'Arabic must be multi-byte');
  const safe = chart._m19KeepaliveSafeSessionPatch(fullPatch);
  const body = JSON.stringify(safe);
  const utf8Bytes = chart._m19Utf8ByteLength(body);
  assert.ok(utf8Bytes <= 60 * 1024, `keepalive UTF-8 bytes too large: ${utf8Bytes}`);
  assert.equal(safe.m19_hot_persist_trim_v1, true);
  assert.equal(safe.open_positions[0].entryScreenshot, undefined);
});

test('tier freshness: stale hot cannot resurrect closed; newer hot applies; equal → durable', { skip: ENV_KILL }, () => {
  const om = seedOm(false);
  om.tradeJournal = [];
  om.openPositions = [];
  om.pendingOrders = [];
  om.closedPositions = [];
  om.balance = 10000;
  om.equity = 10000;
  om.initialBalance = 10000;
  om.orderIdCounter = 1;
  om.tradeGroupIdCounter = 1;
  om.orderService = null;
  om.normalizeJournalRowsInPlace = () => {};
  om.restoreIdCountersFromJournal = () => {};
  om.restoreRuntimeOrderStateFromSession = function restore(state) {
    this.openPositions = Array.isArray(state.open_positions)
      ? JSON.parse(JSON.stringify(state.open_positions)) : [];
    this.closedPositions = Array.isArray(state.closed_positions)
      ? JSON.parse(JSON.stringify(state.closed_positions)) : [];
    this.pendingOrders = Array.isArray(state.pending_orders)
      ? JSON.parse(JSON.stringify(state.pending_orders)) : [];
  };
  om.reconcileAccountAfterSessionRestore = () => {};
  om.updateJournalTab = () => {};
  om.updatePositionsPanel = () => {};
  om.buildPerInstrumentStats = () => ({});
  om.groupJournalByTicker = () => ({});

  const sessionId = 'm19-c-freshness';
  const chart = makeChartWithRealLocalBackup(om, sessionId);
  const hotKey = chart._tradingSessionLocalBackupHotKey(sessionId);
  const durableKey = chart._tradingSessionLocalBackupDurableKey(sessionId);

  // --- A: hot(open) T1 → durable(closed) T2 → restore remains closed ---
  userStorage._m.clear();
  const openRow = richRow(501);
  openRow.status = 'open';
  const closedRow = { ...richRow(501), status: 'closed', pnl: 12, openPositions: undefined };
  om.openPositions = [openRow];
  om.closedPositions = [];
  chart._writeTradingSessionLocalBackup({ slim: true });
  // Force older hot timestamp
  const hot1 = JSON.parse(userStorage.getItem(hotKey));
  hot1.savedAt = 1000;
  userStorage.setItem(hotKey, JSON.stringify(hot1));

  om.openPositions = [];
  om.closedPositions = [closedRow];
  om.tradeJournal = [closedRow];
  chart._writeTradingSessionLocalBackup({ slim: false });
  // Durable write must clear older hot tier
  assert.equal(userStorage.getItem(hotKey), null, 'durable write clears older hot');
  // Re-seed a STALE hot (simulating race / leftover) older than durable
  const durableClosed = JSON.parse(userStorage.getItem(durableKey));
  durableClosed.savedAt = 2000;
  userStorage.setItem(durableKey, JSON.stringify(durableClosed));
  userStorage.setItem(hotKey, JSON.stringify({ ...hot1, savedAt: 1000 }));
  const restoredA = chart._readTradingSessionLocalBackup(sessionId);
  assert.equal(restoredA.open_positions.length, 0, 'stale hot must not resurrect open');
  assert.equal(restoredA.closed_positions[0].status, 'closed');
  assert.equal(restoredA.savedAt, 2000);

  // --- B: durable T1 → hot(update) T2 → update restored ---
  userStorage._m.clear();
  om.openPositions = [openRow];
  om.closedPositions = [];
  om.tradeJournal = [];
  chart._writeTradingSessionLocalBackup({ slim: false });
  let d = JSON.parse(userStorage.getItem(durableKey));
  d.savedAt = 1000;
  d.open_positions[0].pnl = 1;
  userStorage.setItem(durableKey, JSON.stringify(d));
  om.openPositions = [{ ...openRow, pnl: 99, mfe_r: 3.5 }];
  chart._writeTradingSessionLocalBackup({ slim: true });
  let h = JSON.parse(userStorage.getItem(hotKey));
  h.savedAt = 2000;
  userStorage.setItem(hotKey, JSON.stringify(h));
  const restoredB = chart._readTradingSessionLocalBackup(sessionId);
  assert.equal(restoredB.open_positions[0].pnl, 99);
  assert.equal(restoredB.open_positions[0].mfe_r, 3.5);
  assert.equal(restoredB.open_positions[0].entryScreenshot, openRow.entryScreenshot);

  // --- C: Equal timestamp → durable wins ---
  userStorage._m.clear();
  om.openPositions = [];
  om.closedPositions = [closedRow];
  om.tradeJournal = [closedRow];
  chart._writeTradingSessionLocalBackup({ slim: false });
  d = JSON.parse(userStorage.getItem(durableKey));
  d.savedAt = 5000;
  userStorage.setItem(durableKey, JSON.stringify(d));
  userStorage.setItem(hotKey, JSON.stringify({
    savedAt: 5000,
    m19_hot_persist_trim_v1: true,
    open_positions: [openRow],
    closed_positions: [],
    journal: [],
    pending_orders: [],
    account_runtime: { balance: 1, equity: 1, initialBalance: 1 },
  }));
  const restoredC = chart._readTradingSessionLocalBackup(sessionId);
  assert.equal(restoredC.open_positions.length, 0, 'equal ts → durable wins');
  assert.equal(restoredC.closed_positions[0].status, 'closed');
});

test('kill: real writer uses only legacy B-era key; dual-tier absent; byte-identical', { skip: !ENV_KILL }, () => {
  const om = seedOm(true);
  assert.equal(om._m19PersistTrimV1Enabled(), false);
  const src = richRow(7);
  om.tradeJournal = [src];
  om.openPositions = [src];
  om.pendingOrders = [];
  om.closedPositions = [];
  om.balance = 10000;
  om.equity = 10000;
  om.initialBalance = 10000;
  om.orderIdCounter = 3;
  om.tradeGroupIdCounter = 1;
  om.orderService = null;
  om.buildPerInstrumentStats = () => ({ EURUSD: { trades: 1 } });
  om.groupJournalByTicker = () => ({ EURUSD: [src] });

  const sessionId = 'm19-c-kill-bera';
  const chart = makeChartWithRealLocalBackup(om, sessionId);
  userStorage._m.clear();

  // Production writer (kill): single legacy key only.
  chart._writeTradingSessionLocalBackup({ slim: true });
  const legacyKey = chart._tradingSessionLocalBackupKey(sessionId);
  const hotKey = chart._tradingSessionLocalBackupHotKey(sessionId);
  const durableKey = chart._tradingSessionLocalBackupDurableKey(sessionId);
  assert.ok(userStorage.getItem(legacyKey), 'kill must write legacy key');
  assert.equal(userStorage.getItem(hotKey), null, 'kill must not create hot tier');
  assert.equal(userStorage.getItem(durableKey), null, 'kill must not create durable tier');

  const written = JSON.parse(userStorage.getItem(legacyKey));
  assert.equal(written.m19_hot_persist_trim_v1, undefined);
  assert.equal(written.open_positions[0].entryScreenshot, src.entryScreenshot);
  assert.deepEqual(written.open_positions[0].bar_close_r, src.bar_close_r);

  // Byte-identical B-era local payload shape (stable savedAt).
  const bEraLocal = {
    savedAt: written.savedAt,
    journal: JSON.parse(JSON.stringify(om.tradeJournal)),
    pending_orders: [],
    open_positions: JSON.parse(JSON.stringify(om.openPositions)),
    closed_positions: [],
    account_runtime: {
      balance: om.balance,
      equity: om.equity,
      initialBalance: om.initialBalance,
      session_current_time: undefined,
    },
    order_counters: {
      orderIdCounter: om.orderIdCounter,
      tradeGroupIdCounter: om.tradeGroupIdCounter,
    },
    per_instrument_stats: { EURUSD: { trades: 1 } },
    journal_by_ticker: { EURUSD: [src] },
    chartView: { timeframe: '1m' },
    indicators: [],
  };
  assert.equal(
    JSON.stringify(written),
    JSON.stringify(bEraLocal),
    'kill local backup must be byte-identical to B-era payload'
  );

  // Byte-identical B-era server/runtime patch (heavy fields present, unmarked).
  const runtime = om._buildRuntimeOrderPersistPatch();
  assert.equal(runtime.m19_hot_persist_trim_v1, undefined);
  const era = bEraRuntimePatch(om);
  const strip = (arr) => (arr || []).map(({ build_id, schema_version, ...r }) => r);
  const a = {
    pending_orders: strip(runtime.pending_orders),
    open_positions: strip(runtime.open_positions),
    account_runtime: runtime.account_runtime,
    order_counters: runtime.order_counters,
  };
  const b = {
    pending_orders: strip(era.pending_orders),
    open_positions: strip(era.open_positions),
    account_runtime: era.account_runtime,
    order_counters: era.order_counters,
  };
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'kill server runtime patch byte-identical to B-era');
});
