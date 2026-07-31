#!/usr/bin/env node
/**
 * E-TRADE-ATTRIBUTION-CORRECTNESS-V1
 *
 * Behavioral oracle for multi-panel trade journaling attribution. A trade closed
 * on panel B while focus sits on panel A must journal B's instrument and B's
 * price. Trade actions resolve through the order record, not focus.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SIGNATURE = 'TALARIA_E_TRADE_ATTRIBUTION_CORRECTNESS_V1';

const oracleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(oracleDir, '../../..');
const evidenceDir = path.join(repoRoot, 'docs/plan3/evidence/E-TRADE-ATTRIBUTION-CORRECTNESS-20260731');
const require = createRequire(import.meta.url);

const SOURCE_ORDER_MANAGER = 'chart v 1.4/chart/modules/order-manager.js';
const PUBLIC_ORDER_MANAGER = 'homepage/public/chart/modules/order-manager.js';
const ATTRIBUTION_RESOLVER = '_resolveTradeJournalAttribution';

const PANELS = Object.freeze([
  { id: 'A', symbol: 'EURUSD', fileId: 610, timeframe: '1m', candle: { t: 1710000000000, c: 1.08456, close: 1.08456 } },
  { id: 'B', symbol: 'USDJPY', fileId: 621, timeframe: '5m', candle: { t: 1710000000000, c: 156.789, close: 156.789 } },
  { id: 'C', symbol: 'GBPUSD', fileId: 632, timeframe: '15m', candle: { t: 1710000000000, c: 1.27431, close: 1.27431 } },
  { id: 'D', symbol: 'XAUUSD', fileId: 643, timeframe: '1h', candle: { t: 1710000000000, c: 2388.45, close: 2388.45 } },
]);

const EXPECTED_PANEL_ID = 'B';

function readRel(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function findLine(text, needle) {
  const index = text.indexOf(needle);
  if (index < 0) return null;
  return text.slice(0, index).split(/\r?\n/).length;
}

function stable(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stable);
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = stable(value[key]);
  return out;
}

function inspectOrderManager(relPath) {
  const text = readRel(relPath);
  return {
    path: relPath,
    hasSaveTradeToJournal: /async saveTradeToJournal\(order, closeData, postTradeNotes\)/.test(text),
    hasGetCurrentCandleCalls: /this\.getCurrentCandle\(\)/.test(text),
    resolverLine: findLine(text, `${ATTRIBUTION_RESOLVER}(order`),
    orderFirstSymbolLine: findLine(text, 'const symbol = order.ticker || order.symbol || this._getActiveTicker();'),
    closeDataExitPriceLine: findLine(text, 'exitPrice: closeData.closePrice'),
    sourceFileLine: findLine(text, 'sourceFileId: order.sourceFileId ?? order.source_file_id ?? null'),
  };
}

function inspectStaticSurface() {
  return {
    source: inspectOrderManager(SOURCE_ORDER_MANAGER),
    publicMirror: inspectOrderManager(PUBLIC_ORDER_MANAGER),
  };
}

function makeState(focusedPanelId = 'A') {
  return {
    focusedPanelId,
    panels: Object.fromEntries(PANELS.map((panel) => [panel.id, { ...panel, candle: { ...panel.candle } }])),
  };
}

function panelFor(state, panelId) {
  return state.panels[panelId];
}

function makeChart(panel) {
  const candle = { ...panel.candle, panelId: panel.id, symbol: panel.symbol, fileId: panel.fileId };
  return {
    panelId: panel.id,
    currentSymbol: panel.symbol,
    currentFileId: panel.fileId,
    currentTimeframe: panel.timeframe,
    data: [candle],
    rawData: [candle],
    replaySystem: { isActive: false },
    backtestingSession: { id: `session-${panel.id}`, startBalance: 10000 },
    getCurrentCandle: () => ({ ...candle }),
    getActiveTradingSessionId: () => `session-${panel.id}`,
  };
}

let productOrderManagerClass = null;

function loadProductOrderManagerClass() {
  if (!productOrderManagerClass) {
    productOrderManagerClass = require(path.join(repoRoot, SOURCE_ORDER_MANAGER));
  }
  return productOrderManagerClass;
}

async function withProductGlobals(state, fn) {
  const priorWindow = globalThis.window;
  const priorDocument = globalThis.document;
  const priorUserStorage = globalThis.userStorage;
  const chartA = makeChart(panelFor(state, 'A'));
  globalThis.window = {
    chart: chartA,
    screenshotManager: null,
    marketCalcEngine: null,
    getActiveChart: () => chartA,
    addEventListener: () => {},
    parent: null,
  };
  globalThis.window.parent = globalThis.window;
  globalThis.document = {
    documentElement: { classList: { contains: () => false } },
    getElementById: () => null,
    addEventListener: () => {},
  };
  globalThis.userStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
  try {
    return await fn();
  } finally {
    if (priorWindow === undefined) delete globalThis.window;
    else globalThis.window = priorWindow;
    if (priorDocument === undefined) delete globalThis.document;
    else globalThis.document = priorDocument;
    if (priorUserStorage === undefined) delete globalThis.userStorage;
    else globalThis.userStorage = priorUserStorage;
  }
}

function makeProductOrderManager(state) {
  const OrderManager = loadProductOrderManagerClass();
  const ownerChart = makeChart(panelFor(state, EXPECTED_PANEL_ID));
  const manager = Object.create(OrderManager.prototype);
  manager.chart = ownerChart;
  manager.replaySystem = ownerChart.replaySystem;
  manager.tradeJournal = [];
  manager.mfeMaeTrackingPositions = [];
  manager.scaledTrades = new Map();
  manager.splitTrades = new Map();
  manager.pipValuePerLot = 10;
  manager.pipSize = 0.01;
  manager._chartSourceFileId = () => ownerChart.currentFileId;
  manager._getSessionDefaultTradeSetup = () => 'default';
  manager._getActiveInstrumentSettings = () => ({
    spread_pips: 0,
    commission_per_lot_per_side: 0,
    pip_value_per_lot: 10,
  });
  manager._m19LiveExcursionTail = () => null;
  manager._m19EnsureJournalArray = () => {
    if (!Array.isArray(manager.tradeJournal)) manager.tradeJournal = [];
  };
  manager._m19AssignCanonicalExcursionStorage = () => {};
  manager._finalizeExcursionScalars = () => {};
  manager._signedRMultiple = (pnl, risk) => (risk > 0 ? pnl / risk : null);
  manager._computePlannedRRAtEntry = () => null;
  manager._resolvePositionOrderType = () => 'market';
  manager.persistJournal = () => {};
  manager.updateJournalTab = () => {};
  return manager;
}

function makeOrder(state, mode = 'orderRecord') {
  const ownerPanel = panelFor(state, EXPECTED_PANEL_ID);
  const focusedPanel = panelFor(state, state.focusedPanelId);
  const attributionPanel = mode === 'focusOrderOnly' || mode === 'focusOrderAndCloseData'
    ? focusedPanel
    : ownerPanel;

  return {
    id: 4207,
    ownerPanelId: ownerPanel.id,
    sourceFileId: attributionPanel.fileId,
    ticker: attributionPanel.symbol,
    symbol: attributionPanel.symbol,
    type: 'BUY',
    openPrice: attributionPanel.symbol === ownerPanel.symbol ? 156.100 : 1.080,
    openTime: ownerPanel.candle.t - 300000,
    riskAmount: 100,
    quantity: 1,
  };
}

function getCurrentCandleForTrade(state, order, mode = 'orderRecord') {
  const sourcePanelId = mode === 'focusCloseData' || mode === 'focusOrderAndCloseData'
    ? state.focusedPanelId
    : order.ownerPanelId;
  const panel = panelFor(state, sourcePanelId);
  return {
    ...panel.candle,
    panelId: panel.id,
    symbol: panel.symbol,
    fileId: panel.fileId,
  };
}

function buildCloseData(state, order, mode = 'orderRecord') {
  const candle = getCurrentCandleForTrade(state, order, mode);
  return {
    closeTime: candle.t,
    closePrice: Number(candle.c ?? candle.close),
    pnl: 42,
    type: 'MANUAL',
    closeCandlePanelId: candle.panelId,
    closeCandleSymbol: candle.symbol,
    closeCandleFileId: candle.fileId,
  };
}

function saveTradeToJournalModel(state, order, closeData) {
  const activePanel = panelFor(state, state.focusedPanelId);
  const activeTicker = activePanel.symbol;
  const symbol = order.ticker || order.symbol || activeTicker;

  return {
    tradeId: order.id,
    ownerPanelId: order.ownerPanelId,
    focusPanelId: state.focusedPanelId,
    symbol,
    ticker: symbol,
    sourceFileId: order.sourceFileId ?? order.source_file_id ?? null,
    direction: order.type,
    entryPrice: order.openPrice,
    exitPrice: closeData.closePrice,
    closePrice: closeData.closePrice,
    closeCandlePanelId: closeData.closeCandlePanelId,
    closeCandleSymbol: closeData.closeCandleSymbol,
    closeCandleFileId: closeData.closeCandleFileId,
  };
}

function normalizeProductAttribution(state, order, attribution) {
  if (!attribution || typeof attribution !== 'object') return null;
  const candle = attribution.candle || attribution.currentCandle || attribution.closeCandle || null;
  const chart = attribution.chart || attribution.panelChart || null;
  const symbol = attribution.symbol || attribution.ticker || candle?.symbol || chart?.currentSymbol || order.ticker || order.symbol;
  const sourceFileId = attribution.sourceFileId ?? attribution.source_file_id ?? candle?.fileId ?? chart?.currentFileId ?? order.sourceFileId;
  const closePrice = Number(attribution.closePrice ?? candle?.c ?? candle?.close);
  if (!Number.isFinite(closePrice)) return null;
  return {
    closeTime: attribution.closeTime ?? candle?.t ?? panelFor(state, EXPECTED_PANEL_ID).candle.t,
    closePrice,
    pnl: 42,
    type: 'MANUAL',
    closeCandlePanelId: attribution.panelId || attribution.ownerPanelId || candle?.panelId || EXPECTED_PANEL_ID,
    closeCandleSymbol: symbol,
    closeCandleFileId: sourceFileId,
  };
}

function buildCloseDataFromProduct(state, manager, order, mode = 'orderRecord') {
  if (mode === 'orderRecord' && typeof manager[ATTRIBUTION_RESOLVER] === 'function') {
    const resolved = normalizeProductAttribution(state, order, manager[ATTRIBUTION_RESOLVER](order));
    if (resolved) return { closeData: resolved, resolverUsed: ATTRIBUTION_RESOLVER };
  }

  const candle = mode === 'focusOrderOnly'
    ? getCurrentCandleForTrade(state, order, 'orderRecord')
    : manager.getCurrentCandle();
  return {
    closeData: {
      closeTime: candle?.t ?? panelFor(state, EXPECTED_PANEL_ID).candle.t,
      closePrice: Number(candle?.c ?? candle?.close),
      pnl: 42,
      type: 'MANUAL',
      closeCandlePanelId: candle?.panelId || (mode === 'focusCloseData' || mode === 'focusOrderAndCloseData' ? state.focusedPanelId : null),
      closeCandleSymbol: candle?.symbol || (mode === 'focusCloseData' || mode === 'focusOrderAndCloseData' ? panelFor(state, state.focusedPanelId).symbol : null),
      closeCandleFileId: candle?.fileId || (mode === 'focusCloseData' || mode === 'focusOrderAndCloseData' ? panelFor(state, state.focusedPanelId).fileId : null),
    },
    resolverUsed: 'legacy-getCurrentCandle',
  };
}

async function saveTradeToJournalProduct(manager, state, order, closeData) {
  await manager.saveTradeToJournal(order, closeData, null);
  const entry = manager.tradeJournal[0] || null;
  if (!entry) return null;
  return {
    tradeId: entry.tradeId,
    ownerPanelId: order.ownerPanelId,
    focusPanelId: state.focusedPanelId,
    symbol: entry.symbol,
    ticker: entry.ticker,
    sourceFileId: entry.sourceFileId,
    direction: entry.direction,
    entryPrice: entry.entryPrice,
    exitPrice: entry.exitPrice,
    closePrice: entry.closePrice,
    closeCandlePanelId: closeData.closeCandlePanelId,
    closeCandleSymbol: closeData.closeCandleSymbol,
    closeCandleFileId: closeData.closeCandleFileId,
  };
}

function expectedAttribution(state) {
  const panel = panelFor(state, EXPECTED_PANEL_ID);
  return {
    panelId: panel.id,
    symbol: panel.symbol,
    fileId: panel.fileId,
    exitPrice: Number(panel.candle.c ?? panel.candle.close),
  };
}

function attributionFailures(state, journalEntry) {
  const expected = expectedAttribution(state);
  const failures = [];
  if (journalEntry.symbol !== expected.symbol || journalEntry.ticker !== expected.symbol) {
    failures.push({
      reason: 'journal-symbol-not-order-panel',
      observedSymbol: journalEntry.symbol,
      expectedSymbol: expected.symbol,
      focusPanelId: state.focusedPanelId,
    });
  }
  if (journalEntry.sourceFileId !== expected.fileId) {
    failures.push({
      reason: 'journal-source-file-not-order-panel',
      observedSourceFileId: journalEntry.sourceFileId,
      expectedSourceFileId: expected.fileId,
    });
  }
  if (journalEntry.exitPrice !== expected.exitPrice || journalEntry.closePrice !== expected.exitPrice) {
    failures.push({
      reason: 'journal-exit-price-not-order-panel',
      observedExitPrice: journalEntry.exitPrice,
      expectedExitPrice: expected.exitPrice,
    });
  }
  if (journalEntry.closeCandlePanelId !== expected.panelId || journalEntry.closeCandleSymbol !== expected.symbol) {
    failures.push({
      reason: 'journal-close-candle-not-order-panel',
      observedPanelId: journalEntry.closeCandlePanelId,
      observedSymbol: journalEntry.closeCandleSymbol,
      expectedPanelId: expected.panelId,
      expectedSymbol: expected.symbol,
    });
  }
  return failures;
}

export async function runTradeAttributionCase(mode = 'orderRecord') {
  const state = makeState('A');
  const order = makeOrder(state, mode);
  const referenceCloseData = buildCloseData(state, order, mode);
  const referenceEntry = saveTradeToJournalModel(state, order, referenceCloseData);
  const { closeData, resolverUsed, productEntry } = await withProductGlobals(state, async () => {
    const manager = makeProductOrderManager(state);
    const productClose = buildCloseDataFromProduct(state, manager, order, mode);
    return {
      closeData: productClose.closeData,
      resolverUsed: productClose.resolverUsed,
      productEntry: await saveTradeToJournalProduct(manager, state, order, productClose.closeData),
    };
  });
  const failures = productEntry
    ? attributionFailures(state, productEntry)
    : [{ reason: 'product-journal-entry-not-written' }];
  if (mode === 'orderRecord' && resolverUsed !== ATTRIBUTION_RESOLVER) {
    failures.push({ reason: 'trade-attribution-resolver-not-found', expectedResolver: ATTRIBUTION_RESOLVER, resolverUsed });
  }
  return {
    mode,
    status: failures.length ? 'RED' : 'GREEN',
    assertion: 'four mismatched panels; trade closed on panel B while focus is panel A; journal uses B instrument and B price',
    target: 'real OrderManager.saveTradeToJournal plus attribution resolver/getCurrentCandle',
    resolverUsed,
    expected: expectedAttribution(state),
    order: stable(order),
    referenceCloseData: stable(referenceCloseData),
    referenceEntry: stable(referenceEntry),
    closeData: stable(closeData),
    productEntry: stable(productEntry),
    failures,
  };
}

function runControl(cell, report, expected = 'GREEN', expectedReason = null) {
  const status = expected === 'GREEN'
    ? (report.status === 'GREEN' ? 'GREEN' : 'RED')
    : (report.status === 'RED' && JSON.stringify(report).includes(expectedReason) ? 'GREEN' : 'RED');
  return { cell, status, expected, expectedReason, report };
}

export async function runTradeAttributionCorrectnessOracle() {
  const staticSurface = inspectStaticSurface();
  const staticFailures = [];
  for (const entry of [staticSurface.source, staticSurface.publicMirror]) {
    if (!entry.hasSaveTradeToJournal) staticFailures.push({ reason: 'saveTradeToJournal-not-found', path: entry.path });
    if (!entry.hasGetCurrentCandleCalls) staticFailures.push({ reason: 'getCurrentCandle-call-not-found', path: entry.path });
    if (!entry.resolverLine) staticFailures.push({ reason: 'trade-attribution-resolver-not-found', path: entry.path, expectedResolver: ATTRIBUTION_RESOLVER });
    if (!entry.orderFirstSymbolLine) staticFailures.push({ reason: 'order-first-symbol-line-not-found', path: entry.path });
    if (!entry.closeDataExitPriceLine) staticFailures.push({ reason: 'close-data-exit-price-line-not-found', path: entry.path });
    if (!entry.sourceFileLine) staticFailures.push({ reason: 'source-file-line-not-found', path: entry.path });
  }

  const greenControls = [
    runControl('TRADE-JOURNAL-ORDER-RECORD-ATTRIBUTION', await runTradeAttributionCase('orderRecord'), 'GREEN'),
  ];
  const redControls = [
    runControl('TRADE-JOURNAL-FOCUS-CANDLE-PRICE', await runTradeAttributionCase('focusCloseData'), 'RED', 'journal-exit-price-not-order-panel'),
    runControl('TRADE-JOURNAL-FOCUS-ORDER-SYMBOL', await runTradeAttributionCase('focusOrderOnly'), 'RED', 'journal-symbol-not-order-panel'),
    runControl('TRADE-JOURNAL-FOCUS-ORDER-AND-PRICE', await runTradeAttributionCase('focusOrderAndCloseData'), 'RED', 'journal-close-candle-not-order-panel'),
  ];

  const status = staticFailures.length === 0
    && greenControls.every((control) => control.status === 'GREEN')
    && redControls.every((control) => control.status === 'GREEN')
    ? 'GREEN'
    : 'RED';

  return {
    signature: SIGNATURE,
    status,
    staticSurface,
    staticFailures,
    greenControls,
    redControls,
    limitation: 'Node differential oracle over real OrderManager.saveTradeToJournal. It does not execute browser order close UI; A must make the named resolver import-free/Node-safe or this gate remains RED.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await runTradeAttributionCorrectnessOracle();
  fs.mkdirSync(evidenceDir, { recursive: true });
  const outPath = path.join(evidenceDir, 'trade-attribution-correctness-red.json');
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === 'GREEN' ? 0 : 1);
}
