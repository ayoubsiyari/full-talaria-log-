/**
 * M19-D unit scenarios + soak focus evidence.
 *
 *   node "chart v 1.4/chart/modules/m19-d-marker-delta.green.test.mjs"
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../../..');
const require = createRequire(import.meta.url);

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, pass: !!cond, detail });
  if (!cond) process.stdout.write(`FAIL ${name}${detail ? ` — ${detail}` : ''}\n`);
  else process.stdout.write(`PASS ${name}\n`);
}

// Minimal DOM/window for OrderManager require
global.performance = performance;
global.window = {
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
  location: { href: 'http://local.test/chart?sessionId=m19-d' },
  parent: null,
  chart: null,
  postMessage() {},
  __TALARIA_DISABLE_M19_MARKER_DELTA_V1: false,
  __TALARIA_DISABLE_M19_HOTPATH_LOG_GUARD_V1: false,
};
global.document = {
  getElementById: () => ({
    style: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    removeChild() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    innerHTML: '',
    textContent: '',
    value: '',
  }),
  createElement: () => global.document.getElementById(),
  body: { appendChild() {} },
  querySelector() { return null; },
};
global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
global.sessionStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
global.HTMLElement = class {};
global.Node = class {};
global.CustomEvent = class { constructor(t, i) { this.type = t; this.detail = i?.detail; } };
global.fetch = async () => ({ ok: true, json: async () => ({}) });

const OrderManager = require('./order-manager.js');

function makeOm(overrides = {}) {
  const om = Object.create(OrderManager.prototype);
  const replay = {
    isActive: true,
    isPlaying: true,
    replayTimestamp: 1_000_000,
    currentIndex: 10,
  };
  const chart = {
    currentFileId: 'file-a',
    currentSymbol: 'EURUSD',
    currentTimeframe: '1m',
    mcLayout: 'single',
    getActiveTradingSessionId: () => 'session-1',
    candles: [],
    latestCandle: { time: 1000, t: 1_000_000 },
  };
  Object.assign(om, {
    chart,
    tradeJournal: [],
    openPositions: [],
    pendingOrders: [],
    entryMarkers: [],
    exitMarkers: [],
    partialCloseMarkers: [],
    tradeConnectors: [],
    _playbackReplaySystem: () => replay,
    _ensureChartReadyForOrderMarkers: () => true,
    _normalizeMarkerTimestamp: (t) => (t == null ? null : Number(t)),
    _isMarkerTimeVisibleInReplay: (_c, t) => Number(t) <= Number(replay.replayTimestamp),
    _positionVisibleOnAnyLayoutChart: () => true,
    _positionLikeFromJournalTrade: OrderManager.prototype._positionLikeFromJournalTrade,
    _m19JournalStructuralEpoch: 0,
    _m19CountJournalInspect: OrderManager.prototype._m19CountJournalInspect,
    _m19NoteJournalAppend: OrderManager.prototype._m19NoteJournalAppend,
    _m19NoteJournalStructuralMutation: OrderManager.prototype._m19NoteJournalStructuralMutation,
    _m19CommitJournalArray: OrderManager.prototype._m19CommitJournalArray,
    _m19AppendJournalRecord: OrderManager.prototype._m19AppendJournalRecord,
    _m19UpdateJournalRow: OrderManager.prototype._m19UpdateJournalRow,
    _m19EnsureJournalArray: OrderManager.prototype._m19EnsureJournalArray,
    _m19JournalRowFingerprint: OrderManager.prototype._m19JournalRowFingerprint,
    _m19StripClosedTradeMarkers: OrderManager.prototype._m19StripClosedTradeMarkers,
    _m19CaptureMarkerContext: OrderManager.prototype._m19CaptureMarkerContext,
    _m19CompoundMarkerKey: OrderManager.prototype._m19CompoundMarkerKey,
    _m19EnsureMarkerDeltaContext: OrderManager.prototype._m19EnsureMarkerDeltaContext,
    _invalidateM19MarkerDeltaCache: OrderManager.prototype._invalidateM19MarkerDeltaCache,
    _redrawClosedJournalTradeMarkers: OrderManager.prototype._redrawClosedJournalTradeMarkers,
    _pruneReplayFutureTradeMarkers: () => {},
    _isPositionForActiveChart: () => true,
    _renderAllLayoutCharts: () => {},
    updateOrderLines: () => {},
    drawEntryMarker(pos) {
      const id = pos?.id;
      this._drawn.push({ kind: 'entry', id });
      this.entryMarkers.push({
        orderId: id,
        marker: { remove() { this._removed = true; }, _removed: false },
      });
    },
    drawExitMarker(pos) {
      const id = pos?.id;
      this._drawn.push({ kind: 'exit', id });
      this.exitMarkers.push({
        orderId: id,
        marker: { remove() { this._removed = true; }, _removed: false },
      });
    },
    drawPartialCloseMarker(pos, pc) {
      this._drawn.push({ kind: 'partial', id: pos?.id, type: pc?.type, closeTime: pc?.closeTime });
      this.partialCloseMarkers.push({
        orderId: pos?.id,
        closeTime: pc?.closeTime,
        marker: { remove() { this._removed = true; }, _removed: false },
      });
    },
    _drawn: [],
    ...overrides,
  });
  om.chart = overrides.chart || chart;
  om._replay = replay;
  return om;
}

function markerSnapshot(om) {
  const keys = [...(om._m19DrawnClosedMarkerKeys || [])].map(String).sort();
  const entries = (om.entryMarkers || []).map((m) => String(m.orderId)).sort();
  const exits = (om.exitMarkers || []).map((m) => String(m.orderId)).sort();
  const partials = (om.partialCloseMarkers || [])
    .map((m) => `${m.orderId}:${m.closeTime}`)
    .sort();
  return JSON.stringify({ keys, entries, exits, partials });
}

function cleanFullRebuild(om) {
  const cloneJournal = om.tradeJournal;
  const playhead = om._replay.replayTimestamp;
  const fresh = makeOm();
  fresh._replay.replayTimestamp = playhead;
  fresh.openPositions = om.openPositions || [];
  fresh._m19CommitJournalArray(cloneJournal, 'clean-rebuild-seed');
  window.__TALARIA_DISABLE_M19_MARKER_DELTA_V1 = true; // full scan rebuild
  fresh._redrawClosedJournalTradeMarkers();
  window.__TALARIA_DISABLE_M19_MARKER_DELTA_V1 = false;
  return markerSnapshot(fresh);
}

function trade(id, closeTime, extra = {}) {
  return {
    tradeId: id,
    id,
    type: 'BUY',
    ticker: 'EURUSD',
    sourceFileId: 'file-a',
    openTime: closeTime - 60_000,
    openPrice: 1.1,
    closeTime,
    closePrice: 1.11,
    quantity: 1,
    ...extra,
  };
}

// 1) Compound key shape
{
  const om = makeOm();
  const t = trade(7, 900_000);
  const key = om._m19CompoundMarkerKey(t, 900_000, 'exit');
  const parts = key.split('\u001f');
  check('compound-key-parts', parts.length === 5
    && parts[0] === 'session-1'
    && parts[1] === 'EURUSD/file-a'
    && parts[2] === '7'
    && parts[3] === '900000'
    && parts[4] === 'exit', key);
}

// 2) Forward append — delta visits only the new row (no full invalidate)
{
  window.__TALARIA_DISABLE_M19_MARKER_DELTA_V1 = false;
  const om = makeOm();
  om._replay.replayTimestamp = 1_000_000;
  om._m19CommitJournalArray([trade(1, 800_000), trade(2, 900_000)], 'seed');
  om._redrawClosedJournalTradeMarkers();
  const v1 = om._m19LastJournalRowsVisited;
  const drawn1 = om._drawn.length;
  om._drawn = [];
  om._m19AppendJournalRecord(trade(3, 950_000));
  om._redrawClosedJournalTradeMarkers();
  const vAppend = om._m19LastJournalRowsVisited;
  om._drawn = [];
  om._redrawClosedJournalTradeMarkers();
  const vSteady = om._m19LastJournalRowsVisited;
  check('forward-append-first-draw', v1 === 2 && drawn1 >= 2, `v1=${v1} drawn1=${drawn1}`);
  check('forward-append-delta-only-new', vAppend === 1, `appendVisits=${vAppend}`);
  check('forward-append-steady-delta', vSteady === 0, `steadyVisits=${vSteady}`);
}

// 3) Future visibility — stop at first future close
{
  window.__TALARIA_DISABLE_M19_MARKER_DELTA_V1 = false;
  const om = makeOm();
  om._invalidateM19MarkerDeltaCache('test');
  om._replay.replayTimestamp = 850_000;
  om.tradeJournal = [trade(1, 800_000), trade(2, 900_000), trade(3, 950_000)];
  om._redrawClosedJournalTradeMarkers();
  const keys = [...(om._m19DrawnClosedMarkerKeys || [])];
  const exitIds = keys.filter((k) => String(k).endsWith('\u001fexit')).map((k) => k.split('\u001f')[2]);
  check('future-visibility-only-past', exitIds.length === 1 && exitIds[0] === '1', exitIds.join(','));
  om._replay.replayTimestamp = 960_000;
  om._drawn = [];
  om._redrawClosedJournalTradeMarkers();
  const keys2 = [...(om._m19DrawnClosedMarkerKeys || [])];
  const exits2 = keys2.filter((k) => String(k).endsWith('\u001fexit'));
  check('future-visibility-advance', exits2.length === 3, `exits=${exits2.length}`);
}

// 4) Rewind invalidates
{
  window.__TALARIA_DISABLE_M19_MARKER_DELTA_V1 = false;
  const om = makeOm();
  om._invalidateM19MarkerDeltaCache('test');
  om._replay.replayTimestamp = 1_000_000;
  om.tradeJournal = [trade(1, 800_000), trade(2, 900_000)];
  om._redrawClosedJournalTradeMarkers();
  const before = om._m19DrawnClosedMarkerKeys.size;
  om._replay.replayTimestamp = 850_000;
  om._redrawClosedJournalTradeMarkers();
  const exits = [...om._m19DrawnClosedMarkerKeys].filter((k) => String(k).endsWith('\u001fexit'));
  check('rewind-resync', before >= 2 && exits.length === 1, `before=${before} afterExits=${exits.length}`);
}

// 5) Duplicate-ID partial TPs get distinct keys / draws
{
  window.__TALARIA_DISABLE_M19_MARKER_DELTA_V1 = false;
  const om = makeOm();
  om._invalidateM19MarkerDeltaCache('test');
  om._replay.replayTimestamp = 1_000_000;
  om.tradeJournal = [trade(42, 900_000, {
    partialCloses: [
      { id: 'tp1', closeTime: 860_000, closePrice: 1.105, type: 'TP', percentage: 0.5, pnl: 10 },
      { id: 'tp2', closeTime: 880_000, closePrice: 1.108, type: 'TP', percentage: 0.5, pnl: 12 },
    ],
  })];
  om._redrawClosedJournalTradeMarkers();
  const partials = om._drawn.filter((d) => d.kind === 'partial');
  const keys = [...om._m19DrawnClosedMarkerKeys];
  const partialKeys = keys.filter((k) => String(k).includes('partial:'));
  check('duplicate-id-partial-tps', partials.length === 2 && partialKeys.length === 2,
    `partials=${partials.length} keys=${partialKeys.length}`);
}

// 6) Same trade ids across sessions → distinct compound keys
{
  const om1 = makeOm();
  om1.chart.getActiveTradingSessionId = () => 'sess-A';
  const om2 = makeOm();
  om2.chart.getActiveTradingSessionId = () => 'sess-B';
  const t = trade(9, 900_000);
  const k1 = om1._m19CompoundMarkerKey(t, 900_000, 'exit');
  const k2 = om2._m19CompoundMarkerKey(t, 900_000, 'exit');
  check('same-ids-across-sessions', k1 !== k2 && k1.startsWith('sess-A') && k2.startsWith('sess-B'), `${k1} vs ${k2}`);
}

// 7) Invalidate on symbol/file/TF/layout change
{
  window.__TALARIA_DISABLE_M19_MARKER_DELTA_V1 = false;
  const om = makeOm();
  om._invalidateM19MarkerDeltaCache('test');
  om._replay.replayTimestamp = 1_000_000;
  om.tradeJournal = [trade(1, 800_000)];
  om._redrawClosedJournalTradeMarkers();
  check('pre-symbol-change-drawn', om._m19DrawnClosedMarkerKeys.size > 0);
  om.chart.currentSymbol = 'GBPUSD';
  om._m19EnsureMarkerDeltaContext();
  check('invalidate-on-symbol-change', om._m19DrawnClosedMarkerKeys.size === 0
    && om._m19MarkerDeltaForceFull === true);

  om._redrawClosedJournalTradeMarkers();
  om.chart.currentTimeframe = '5m';
  om._m19EnsureMarkerDeltaContext();
  check('invalidate-on-tf-change', om._m19MarkerDeltaForceFull === true);

  om._redrawClosedJournalTradeMarkers();
  om.chart.mcLayout = '2x2';
  om._m19EnsureMarkerDeltaContext();
  check('invalidate-on-layout-change', om._m19MarkerDeltaForceFull === true);

  om._redrawClosedJournalTradeMarkers();
  om.chart.currentFileId = 'file-b';
  om._m19EnsureMarkerDeltaContext();
  check('invalidate-on-file-change', om._m19MarkerDeltaForceFull === true);
}

// 8) Journal truncation / reorder invalidates (mutation contract)
{
  window.__TALARIA_DISABLE_M19_MARKER_DELTA_V1 = false;
  const om = makeOm();
  om._replay.replayTimestamp = 1_000_000;
  om._m19CommitJournalArray([trade(1, 800_000), trade(2, 900_000), trade(3, 950_000)], 'seed');
  om._redrawClosedJournalTradeMarkers();
  om._m19CommitJournalArray([trade(1, 800_000)], 'truncate');
  check('invalidate-on-journal-truncate', om._m19MarkerDeltaForceFull === true);

  om._redrawClosedJournalTradeMarkers();
  om._m19CommitJournalArray(
    [trade(3, 950_000), trade(1, 800_000), trade(2, 900_000)],
    'reorder',
  );
  check('invalidate-on-journal-reorder', om._m19MarkerDeltaForceFull === true);
}

// 9) Multichart restore invalidation path
{
  const om = makeOm();
  om._m19DrawnClosedMarkerKeys = new Set(['x']);
  om._m19MarkerDeltaForceFull = false;
  OrderManager.prototype._invalidateM19MarkerDeltaCache.call(om, 'session-restore');
  check('multichart-restore-invalidate', om._m19DrawnClosedMarkerKeys.size === 0
    && om._m19MarkerDeltaForceFull === true);
}

// 10) Manager repro: 10-row journal, replace index 3 (unsampled interior)
{
  window.__TALARIA_DISABLE_M19_MARKER_DELTA_V1 = false;
  const om = makeOm();
  om._replay.replayTimestamp = 2_000_000;
  om._m19CommitJournalArray(
    Array.from({ length: 10 }, (_, i) => trade(i + 1, 800_000 + i * 10_000)),
    'seed',
  );
  om._redrawClosedJournalTradeMarkers();
  om._redrawClosedJournalTradeMarkers(); // steady
  check('mgr-repro-steady-zero', om._m19LastJournalRowsVisited === 0
    && om._m19MarkerDeltaForceFull !== true, `visits=${om._m19LastJournalRowsVisited}`);
  const replaced = om.tradeJournal.map((t, i) => (i === 3 ? trade(999, t.closeTime) : t));
  om._m19CommitJournalArray(replaced, 'interior-replace');
  check('mgr-repro-interior-replace-invalidates', om._m19MarkerDeltaForceFull === true,
    `forceFull=${om._m19MarkerDeltaForceFull}`);
  om._redrawClosedJournalTradeMarkers();
  const exitIds = (om.exitMarkers || []).map((m) => String(m.orderId));
  check('mgr-repro-stale-id-removed', !exitIds.includes('4') && exitIds.includes('999'),
    exitIds.join(','));
}

// 11) 50-row unsampled interior replace + reorder + full-rebuild parity
{
  window.__TALARIA_DISABLE_M19_MARKER_DELTA_V1 = false;
  const om = makeOm();
  om._replay.replayTimestamp = 5_000_000;
  om._m19CommitJournalArray(
    Array.from({ length: 50 }, (_, i) => trade(1000 + i, 700_000 + i * 5_000)),
    'seed',
  );
  om._redrawClosedJournalTradeMarkers();
  om._redrawClosedJournalTradeMarkers();

  const idx = 17;
  const replaced = om.tradeJournal.map((t, i) => (
    i === idx ? trade(7777, t.closeTime, {
      partialCloses: [{ id: 'tpA', closeTime: t.closeTime - 1000, closePrice: 1.104, type: 'TP', percentage: 0.5, pnl: 1 }],
    }) : t
  ));
  om._m19CommitJournalArray(replaced, '50-interior-replace');
  check('50-interior-replace-invalidates', om._m19MarkerDeltaForceFull === true);
  om._redrawClosedJournalTradeMarkers();
  const afterReplace = markerSnapshot(om);
  const rebuildReplace = cleanFullRebuild(om);
  check('50-interior-replace-parity', afterReplace === rebuildReplace,
    `delta=${afterReplace.length} full=${rebuildReplace.length}`);

  window.__TALARIA_DISABLE_M19_MARKER_DELTA_V1 = false;
  const om2 = makeOm();
  om2._replay.replayTimestamp = 5_000_000;
  om2._m19CommitJournalArray(
    Array.from({ length: 50 }, (_, i) => trade(2000 + i, 700_000 + i * 5_000)),
    'seed',
  );
  om2._redrawClosedJournalTradeMarkers();
  const j = om2.tradeJournal.slice();
  const tmp = j[11];
  j[11] = j[37];
  j[37] = tmp;
  om2._m19CommitJournalArray(j, '50-interior-reorder');
  check('50-interior-reorder-invalidates', om2._m19MarkerDeltaForceFull === true);
  om2._redrawClosedJournalTradeMarkers();
  const afterReorder = markerSnapshot(om2);
  const rebuildReorder = cleanFullRebuild(om2);
  check('50-interior-reorder-parity', afterReorder === rebuildReorder);
}

// 12) Partial-close add/change on unsampled existing row + parity (stale partials removed)
{
  window.__TALARIA_DISABLE_M19_MARKER_DELTA_V1 = false;
  const om = makeOm();
  om._replay.replayTimestamp = 5_000_000;
  om._m19CommitJournalArray(
    Array.from({ length: 50 }, (_, i) => trade(3000 + i, 700_000 + i * 5_000)),
    'seed',
  );
  om._redrawClosedJournalTradeMarkers();
  om._redrawClosedJournalTradeMarkers();
  const rowIdx = 23;
  const row = om.tradeJournal[rowIdx];
  om._m19UpdateJournalRow(rowIdx, (t) => ({
    ...t,
    partialCloses: [
      { id: 'tpNew', closeTime: row.closeTime - 500, closePrice: 1.106, type: 'TP', percentage: 0.25, pnl: 3 },
    ],
  }), 'partial-add');
  check('partial-close-unsampled-invalidates', om._m19MarkerDeltaForceFull === true);
  om._redrawClosedJournalTradeMarkers();
  const partials = (om.partialCloseMarkers || []).map((m) => `${m.orderId}:${m.closeTime}`);
  check('partial-close-drawn', partials.some((p) => p.startsWith('3023:')), partials.join('|'));
  const afterPc = markerSnapshot(om);
  const rebuildPc = cleanFullRebuild(om);
  check('partial-close-parity', afterPc === rebuildPc);

  window.__TALARIA_DISABLE_M19_MARKER_DELTA_V1 = false;
  om._m19UpdateJournalRow(rowIdx, (t) => ({
    ...t,
    partialCloses: [
      { id: 'tpNew', closeTime: row.closeTime - 500, closePrice: 1.109, type: 'TP', percentage: 0.75, pnl: 9 },
    ],
  }), 'partial-change');
  check('partial-close-change-invalidates', om._m19MarkerDeltaForceFull === true);
  om._redrawClosedJournalTradeMarkers();
  const afterChange = markerSnapshot(om);
  const rebuildChange = cleanFullRebuild(om);
  check('partial-close-change-parity', afterChange === rebuildChange);
}

/**
 * Real hydrate path (chart.js contract): same-length replacement via
 * _m19CommitJournalArray('session-state-hydrate' | 'local-backup-hydrate').
 */
function runHydrateLikeChartJs(om, nextJournal, reason) {
  // chart.js calls commit with the merged array — exercise that exact contract.
  om._m19CommitJournalArray(nextJournal, reason);
}

/**
 * Real multichart host-journal projection (panel-cmd-bridge contract):
 * filter by symbol/file then commit as 'host-journal-projection'.
 */
function runHostJournalProjection(om, hostJournal, { symbol, fileId }) {
  const sym = String(symbol || '').replace('/', '').toUpperCase();
  const fid = fileId != null ? String(fileId) : '';
  const matchRow = (row) => {
    if (!row) return false;
    const rs = String(row.symbol || row.ticker || '').replace(/\//g, '').toUpperCase();
    const rf = row.sourceFileId != null ? String(row.sourceFileId) : '';
    if (fid && rf && rf === fid) return true;
    if (sym && rs && rs === sym) return true;
    return false;
  };
  const projected = hostJournal.filter(matchRow).map((t) => ({ ...t }));
  om._m19CommitJournalArray(projected, 'host-journal-projection');
  return projected;
}

// 13) Hydrate same-length replacement — epoch++, stale removed, clean rebuild parity
{
  window.__TALARIA_DISABLE_M19_MARKER_DELTA_V1 = false;
  const om = makeOm();
  om._replay.replayTimestamp = 3_000_000;
  om._m19CommitJournalArray(
    Array.from({ length: 12 }, (_, i) => trade(4000 + i, 800_000 + i * 8_000)),
    'seed',
  );
  om._redrawClosedJournalTradeMarkers();
  const epoch0 = om._m19JournalStructuralEpoch | 0;
  const exitBefore = (om.exitMarkers || []).map((m) => String(m.orderId));
  check('hydrate-pre-has-old-id', exitBefore.includes('4003'));

  const hydrated = om.tradeJournal.map((t, i) => (
    i === 3 ? trade(8888, t.closeTime) : { ...t }
  ));
  runHydrateLikeChartJs(om, hydrated, 'session-state-hydrate');
  check('hydrate-epoch-increments', (om._m19JournalStructuralEpoch | 0) === epoch0 + 1,
    `epoch ${epoch0} → ${om._m19JournalStructuralEpoch}`);
  check('hydrate-force-full', om._m19MarkerDeltaForceFull === true);
  om._redrawClosedJournalTradeMarkers();
  const exitAfter = (om.exitMarkers || []).map((m) => String(m.orderId));
  check('hydrate-stale-removed', !exitAfter.includes('4003') && exitAfter.includes('8888'),
    exitAfter.join(','));
  const afterHydrate = markerSnapshot(om);
  const rebuildHydrate = cleanFullRebuild(om);
  check('hydrate-parity', afterHydrate === rebuildHydrate);

  // local-backup-hydrate reason path (second chart.js site)
  const epoch1 = om._m19JournalStructuralEpoch | 0;
  const hydrated2 = om.tradeJournal.map((t, i) => (
    i === 5 ? trade(7770, t.closeTime) : { ...t }
  ));
  runHydrateLikeChartJs(om, hydrated2, 'local-backup-hydrate');
  check('hydrate-backup-epoch', (om._m19JournalStructuralEpoch | 0) === epoch1 + 1);
  om._redrawClosedJournalTradeMarkers();
  check('hydrate-backup-parity', markerSnapshot(om) === cleanFullRebuild(om));
}

// 14) Multichart host-journal projection — same-length replace on peer OM
{
  window.__TALARIA_DISABLE_M19_MARKER_DELTA_V1 = false;
  const peer = makeOm();
  peer.chart.currentSymbol = 'EURUSD';
  peer.chart.currentFileId = 'file-a';
  peer._replay.replayTimestamp = 3_000_000;
  peer._m19CommitJournalArray(
    Array.from({ length: 10 }, (_, i) => trade(5000 + i, 800_000 + i * 9_000)),
    'seed',
  );
  peer._redrawClosedJournalTradeMarkers();
  const epoch0 = peer._m19JournalStructuralEpoch | 0;

  const hostJournal = peer.tradeJournal.map((t, i) => (
    i === 4
      ? trade(9991, t.closeTime, { ticker: 'EURUSD', sourceFileId: 'file-a' })
      : { ...t, ticker: 'EURUSD', sourceFileId: 'file-a' }
  ));
  // Inject a different-symbol row that must be filtered out by projection matchRow.
  hostJournal.push(trade(9992, 900_000, { ticker: 'GBPUSD', sourceFileId: 'file-gbp' }));

  runHostJournalProjection(peer, hostJournal, { symbol: 'EURUSD', fileId: 'file-a' });
  check('projection-epoch-increments', (peer._m19JournalStructuralEpoch | 0) === epoch0 + 1);
  check('projection-filtered-length', peer.tradeJournal.length === 10,
    `len=${peer.tradeJournal.length}`);
  check('projection-force-full', peer._m19MarkerDeltaForceFull === true);
  peer._redrawClosedJournalTradeMarkers();
  const exits = (peer.exitMarkers || []).map((m) => String(m.orderId));
  check('projection-stale-removed', !exits.includes('5004') && exits.includes('9991')
    && !exits.includes('9992'), exits.join(','));
  check('projection-parity', markerSnapshot(peer) === cleanFullRebuild(peer));
}

const unitFailed = results.some((r) => !r.pass);
const unitPath = path.join(ROOT, 'docs/plan3/evidence/L2-M19-D-unit.json');
fs.mkdirSync(path.dirname(unitPath), { recursive: true });
fs.writeFileSync(unitPath, JSON.stringify({
  task: 'M19-D-unit',
  pass: !unitFailed,
  results,
}, null, 2));

if (unitFailed) {
  process.stdout.write('M19-D unit FAIL — skipping gate/soak\n');
  process.exitCode = 1;
} else {
  process.stdout.write('M19-D unit PASS — running journal write gate\n');
  const gate = path.join(__dirname, 'm19-d-journal-write-gate.test.mjs');
  const g = spawnSync(process.execPath, [gate], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60_000,
  });
  process.stdout.write(g.stdout || '');
  process.stderr.write(g.stderr || '');
  if (g.status !== 0) {
    process.exitCode = g.status == null ? 1 : g.status;
  } else {
    process.stdout.write('M19-D gate PASS — running soak focus D\n');
    const soak = path.join(__dirname, 'm19-progressive-session-soak.test.mjs');
    const r = spawnSync(process.execPath, [soak], {
      cwd: ROOT,
      env: { ...process.env, M19_FOCUS: 'D' },
      encoding: 'utf8',
      timeout: 600_000,
    });
    process.stdout.write(r.stdout || '');
    process.stderr.write(r.stderr || '');
    process.exitCode = r.status == null ? 1 : r.status;
  }
}
