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
import vm from 'node:vm';

export const SIGNATURE = 'TALARIA_E_TRADE_ATTRIBUTION_CORRECTNESS_V1';

const oracleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(oracleDir, '../../..');
const evidenceDir = path.join(repoRoot, 'docs/plan3/evidence/E-TRADE-ATTRIBUTION-CORRECTNESS-20260731');
const require = createRequire(import.meta.url);

const SOURCE_ORDER_MANAGER = 'chart v 1.4/chart/modules/order-manager.js';
const PUBLIC_ORDER_MANAGER = 'homepage/public/chart/modules/order-manager.js';
const SOURCE_CHART_JS = 'chart v 1.4/chart/chart.js';
const PUBLIC_CHART_JS = 'homepage/public/chart/chart.js';
const ATTRIBUTION_RESOLVER = '_resolveTradeJournalAttribution';
const ATTRIBUTION_RESOLVER_COLLECTOR = '_talariaCollectChartsForAttribution';
const ATTRIBUTION_RESOLVER_DISABLE_FLAG = '__TALARIA_DISABLE_TRADE_ATTRIBUTION_RESOLVER_V1';
const RESOLVER_ABSENT_FROM_TREE = 'RESOLVER_ABSENT_FROM_TREE';
const RESOLVER_ANCHOR_BROKEN = 'RESOLVER_ANCHOR_BROKEN';
const RESOLVER_PRESENT_IN_TREE = 'RESOLVER_PRESENT_IN_TREE';
const RESOLVER_PRESENT_BUT_UNCALLED = 'RESOLVER_PRESENT_BUT_UNCALLED';
const RESOLVER_CALLED_BUT_WRONG = 'RESOLVER_CALLED_BUT_WRONG';
const RESOLVER_CALLED_AND_CORRECT = 'RESOLVER_CALLED_AND_CORRECT';
const ATTRIBUTION_RESOLVER_CONTRACT = Object.freeze({
  manager: 'A',
  commit: '59395680c',
  path: 'docs/plan3/worker-reports/A-RESOLVER-SIGNATURE-RESERVED-CONTRACT-20260731-1915.md',
  placement: `window.${ATTRIBUTION_RESOLVER}`,
  arity: 1,
  disableFlag: ATTRIBUTION_RESOLVER_DISABLE_FLAG,
});

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
    managerResolverLine: findLine(text, `${ATTRIBUTION_RESOLVER}(order`),
    orderFirstSymbolLine: findLine(text, 'const symbol = order.ticker || order.symbol || this._getActiveTicker();'),
    closeDataExitPriceLine: findLine(text, 'exitPrice: closeData.closePrice'),
    sourceFileLine: findLine(text, 'sourceFileId: order.sourceFileId ?? order.source_file_id ?? null'),
  };
}

function inspectChartResolver(relPath) {
  const text = readRel(relPath);
  const classChartLine = findLine(text, 'class Chart');
  return {
    path: relPath,
    collectorLine: findLine(text, `function ${ATTRIBUTION_RESOLVER_COLLECTOR}`),
    resolverLine: findLine(text, `function ${ATTRIBUTION_RESOLVER}(order)`),
    windowExportLine: findLine(text, `window.${ATTRIBUTION_RESOLVER} = ${ATTRIBUTION_RESOLVER}`),
    sourceFileIdLine: findLine(text, 'const wanted = order.sourceFileId;'),
    ambiguityNullLine: findLine(text, 'if (match && match !== chart) return null;'),
    classChartLine,
  };
}

function inspectStaticSurface() {
  return {
    source: inspectOrderManager(SOURCE_ORDER_MANAGER),
    publicMirror: inspectOrderManager(PUBLIC_ORDER_MANAGER),
    chartResolver: inspectChartResolver(SOURCE_CHART_JS),
    chartResolverPublicMirror: inspectChartResolver(PUBLIC_CHART_JS),
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

function classifyChartResolverTree(staticSurface) {
  const entries = [staticSurface.chartResolver, staticSurface.chartResolverPublicMirror];
  const hasAnyResolver = entries.some((entry) => entry.resolverLine || entry.windowExportLine);
  if (!hasAnyResolver) {
    return {
      state: RESOLVER_ABSENT_FROM_TREE,
      failures: entries.map((entry) => ({
        state: RESOLVER_ABSENT_FROM_TREE,
        reason: 'trade-attribution-resolver-absent-from-tree',
        path: entry.path,
        expectedResolver: ATTRIBUTION_RESOLVER,
        expectedPlacement: ATTRIBUTION_RESOLVER_CONTRACT.placement,
      })),
    };
  }

  const failures = [];
  for (const entry of entries) {
    if (!entry.collectorLine) {
      failures.push({
        state: RESOLVER_ANCHOR_BROKEN,
        reason: 'trade-attribution-chart-collector-anchor-broken',
        path: entry.path,
        expectedAnchor: `function ${ATTRIBUTION_RESOLVER_COLLECTOR}`,
      });
    }
    if (!entry.resolverLine) {
      failures.push({
        state: RESOLVER_ANCHOR_BROKEN,
        reason: 'trade-attribution-resolver-anchor-broken',
        path: entry.path,
        expectedAnchor: `function ${ATTRIBUTION_RESOLVER}(order)`,
      });
    }
    if (!entry.windowExportLine) {
      failures.push({
        state: RESOLVER_ANCHOR_BROKEN,
        reason: 'trade-attribution-window-export-anchor-broken',
        path: entry.path,
        expectedPlacement: ATTRIBUTION_RESOLVER_CONTRACT.placement,
      });
    }
    if (!entry.classChartLine) {
      failures.push({
        state: RESOLVER_ANCHOR_BROKEN,
        reason: 'trade-attribution-class-chart-anchor-broken',
        path: entry.path,
        expectedAnchor: 'class Chart',
      });
    }
    if (!entry.sourceFileIdLine) {
      failures.push({
        state: RESOLVER_ANCHOR_BROKEN,
        reason: 'trade-attribution-source-file-id-lookup-anchor-broken',
        path: entry.path,
        expectedAnchor: 'const wanted = order.sourceFileId;',
      });
    }
    if (!entry.ambiguityNullLine) {
      failures.push({
        state: RESOLVER_ANCHOR_BROKEN,
        reason: 'trade-attribution-ambiguity-null-anchor-broken',
        path: entry.path,
        expectedAnchor: 'if (match && match !== chart) return null;',
      });
    }
  }

  return {
    state: failures.length ? RESOLVER_ANCHOR_BROKEN : RESOLVER_PRESENT_IN_TREE,
    failures,
  };
}

function extractChartResolverSource(relPath = SOURCE_CHART_JS) {
  const text = readRel(relPath);
  const start = text.indexOf(`function ${ATTRIBUTION_RESOLVER_COLLECTOR}`);
  const end = text.indexOf('class Chart', start);
  const hasResolver = text.includes(`function ${ATTRIBUTION_RESOLVER}(order)`)
    || text.includes(`window.${ATTRIBUTION_RESOLVER} = ${ATTRIBUTION_RESOLVER}`);
  if (!hasResolver) {
    return {
      ok: false,
      state: RESOLVER_ABSENT_FROM_TREE,
      reason: 'trade-attribution-resolver-absent-from-tree',
      path: relPath,
    };
  }
  if (start < 0) {
    return {
      ok: false,
      state: RESOLVER_ANCHOR_BROKEN,
      reason: 'trade-attribution-chart-collector-anchor-broken',
      path: relPath,
      expectedAnchor: `function ${ATTRIBUTION_RESOLVER_COLLECTOR}`,
    };
  }
  if (end < 0) {
    return {
      ok: false,
      state: RESOLVER_ANCHOR_BROKEN,
      reason: 'trade-attribution-class-chart-anchor-broken',
      path: relPath,
      expectedAnchor: 'class Chart',
    };
  }
  return {
    ok: true,
    state: RESOLVER_PRESENT_IN_TREE,
    source: text.slice(start, end),
    path: relPath,
  };
}

function installChartResolverFromProduct() {
  if (typeof globalThis.window?.[ATTRIBUTION_RESOLVER] === 'function') {
    return { ok: true, state: RESOLVER_PRESENT_IN_TREE, installed: true, source: 'preinstalled-window-global' };
  }
  const extracted = extractChartResolverSource();
  if (!extracted.ok) return { ...extracted, installed: false };
  try {
    vm.runInNewContext(extracted.source, {
      window: globalThis.window,
      Set,
    }, { filename: SOURCE_CHART_JS });
  } catch (error) {
    return {
      ok: false,
      state: RESOLVER_ANCHOR_BROKEN,
      installed: false,
      reason: 'trade-attribution-resolver-vm-load-failed',
      path: SOURCE_CHART_JS,
      error: String(error?.message || error),
    };
  }
  const installed = typeof globalThis.window?.[ATTRIBUTION_RESOLVER] === 'function';
  return {
    ok: installed,
    state: installed ? RESOLVER_PRESENT_IN_TREE : RESOLVER_PRESENT_BUT_UNCALLED,
    installed,
    reason: installed ? null : 'trade-attribution-window-export-did-not-install',
    path: SOURCE_CHART_JS,
  };
}

async function withProductGlobals(state, fn) {
  const priorWindow = globalThis.window;
  const priorDocument = globalThis.document;
  const priorUserStorage = globalThis.userStorage;
  const chartsByPanelId = Object.fromEntries(Object.keys(state.panels).map((panelId) => [
    panelId,
    makeChart(panelFor(state, panelId)),
  ]));
  const chartA = chartsByPanelId.A;
  const frameWindows = Object.entries(chartsByPanelId)
    .filter(([panelId]) => panelId !== 'A')
    .map(([, chart]) => ({
      chart,
      mainChart: null,
      document: { querySelectorAll: () => [] },
    }));
  const document = {
    documentElement: { classList: { contains: () => false } },
    getElementById: () => null,
    addEventListener: () => {},
    querySelectorAll: (selector) => (selector === 'iframe'
      ? frameWindows.map((contentWindow) => ({ contentWindow }))
      : []),
  };
  globalThis.window = {
    chart: chartA,
    mainChart: chartA,
    chartsByPanelId,
    multiChartInstances: Object.values(chartsByPanelId),
    screenshotManager: null,
    marketCalcEngine: null,
    getActiveChart: () => chartA,
    addEventListener: () => {},
    document,
    parent: null,
    top: null,
  };
  globalThis.window.parent = globalThis.window;
  globalThis.window.top = globalThis.window;
  globalThis.document = document;
  globalThis.userStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
  const resolverLoad = installChartResolverFromProduct();
  try {
    return await fn(resolverLoad);
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
  const chart = attribution.chart
    || attribution.panelChart
    || (typeof attribution.getCurrentCandle === 'function' || attribution.currentSymbol ? attribution : null);
  const symbol = attribution.symbol || attribution.ticker || candle?.symbol || chart?.currentSymbol || order.ticker || order.symbol;
  const sourceFileId = attribution.sourceFileId ?? attribution.source_file_id ?? candle?.fileId ?? chart?.currentFileId ?? order.sourceFileId;
  const chartCandle = chart && typeof chart.getCurrentCandle === 'function' ? chart.getCurrentCandle() : null;
  const closePrice = Number(attribution.closePrice ?? candle?.c ?? candle?.close ?? chartCandle?.c ?? chartCandle?.close);
  if (!Number.isFinite(closePrice)) return null;
  return {
    closeTime: attribution.closeTime ?? candle?.t ?? chartCandle?.t ?? panelFor(state, EXPECTED_PANEL_ID).candle.t,
    closePrice,
    pnl: 42,
    type: 'MANUAL',
    closeCandlePanelId: attribution.panelId || attribution.ownerPanelId || candle?.panelId || chart?.panelId || EXPECTED_PANEL_ID,
    closeCandleSymbol: symbol,
    closeCandleFileId: sourceFileId,
  };
}

function buildCloseDataFromProduct(state, manager, order, mode = 'orderRecord') {
  const resolver = globalThis.window?.[ATTRIBUTION_RESOLVER];
  const resolverDisabled = Boolean(globalThis.window?.[ATTRIBUTION_RESOLVER_DISABLE_FLAG]);
  if (mode === 'orderRecord' && typeof resolver === 'function' && !resolverDisabled) {
    const resolved = normalizeProductAttribution(state, order, resolver(order));
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

function resultPanelId(result) {
  if (!result || typeof result !== 'object') return null;
  if (result.panelId) return result.panelId;
  if (result.ownerPanelId) return result.ownerPanelId;
  if (result.chart?.panelId) return result.chart.panelId;
  if (result.panelChart?.panelId) return result.panelChart.panelId;
  if (result.currentSymbol) {
    const match = PANELS.find((panel) => panel.symbol === result.currentSymbol);
    return match?.id || null;
  }
  return null;
}

function assertResolverNull(resolver, input) {
  try {
    return { threw: false, result: resolver(input) };
  } catch (error) {
    return { threw: true, error: String(error?.message || error) };
  }
}

export async function runResolverContractCase(mode) {
  const state = makeState('A');
  return withProductGlobals(state, async (resolverLoad) => {
    const resolver = globalThis.window?.[ATTRIBUTION_RESOLVER];
    const failures = [];
    if (typeof resolver !== 'function') {
      failures.push({
        state: resolverLoad.state,
        reason: 'trade-attribution-resolver-not-found',
        expectedPlacement: ATTRIBUTION_RESOLVER_CONTRACT.placement,
        resolverLoad,
      });
      return {
        mode,
        resolverState: resolverLoad.state,
        status: 'RED',
        contract: ATTRIBUTION_RESOLVER_CONTRACT,
        failures,
      };
    }

    if (resolver.length !== ATTRIBUTION_RESOLVER_CONTRACT.arity) {
      failures.push({
        reason: 'trade-attribution-resolver-wrong-arity',
        observedArity: resolver.length,
        expectedArity: ATTRIBUTION_RESOLVER_CONTRACT.arity,
      });
    }

    if (mode === 'focusPurity') {
      const order = makeOrder(state, 'orderRecord');
      const firstPanelId = resultPanelId(resolver(order));
      globalThis.window.chart = globalThis.window.chartsByPanelId.C;
      globalThis.window.getActiveChart = () => globalThis.window.chartsByPanelId.D;
      state.focusedPanelId = 'D';
      const secondPanelId = resultPanelId(resolver(order));
      if (firstPanelId !== secondPanelId) {
        failures.push({
          reason: 'trade-attribution-resolver-focus-dependent',
          firstPanelId,
          secondPanelId,
        });
      }
    } else if (mode === 'missingOwnerNull') {
      const result = assertResolverNull(resolver, { id: 'ownerless-record' });
      if (result.threw || result.result !== null) {
        failures.push({
          reason: result.threw ? 'trade-attribution-resolver-threw' : 'trade-attribution-resolver-guessed-owner',
          observed: stable(result),
        });
      }
    } else if (mode === 'badShapesNull') {
      for (const input of [null, undefined, {}, { ownerPanelId: 'UNKNOWN' }]) {
        const result = assertResolverNull(resolver, input);
        if (result.threw || result.result !== null) {
          failures.push({
            reason: result.threw ? 'trade-attribution-resolver-threw-on-bad-shape' : 'trade-attribution-resolver-guessed-on-bad-shape',
            input: stable(input),
            observed: stable(result),
          });
        }
      }
    } else if (mode === 'destroyedOwnerNull') {
      const order = makeOrder(state, 'orderRecord');
      globalThis.window.chartsByPanelId[EXPECTED_PANEL_ID].destroyed = true;
      const result = assertResolverNull(resolver, order);
      if (result.threw || result.result !== null) {
        failures.push({
          reason: result.threw ? 'trade-attribution-resolver-threw-on-destroyed-owner' : 'trade-attribution-resolver-returned-destroyed-owner',
          observed: stable(result),
        });
      }
    } else if (mode === 'killSwitch') {
      const order = makeOrder(state, 'orderRecord');
      globalThis.window[ATTRIBUTION_RESOLVER_DISABLE_FLAG] = 1;
      const result = assertResolverNull(resolver, order);
      if (result.threw || result.result !== null) {
        failures.push({
          reason: result.threw ? 'trade-attribution-resolver-threw-while-disabled' : 'trade-attribution-resolver-ignored-disable-flag',
          disableFlag: ATTRIBUTION_RESOLVER_DISABLE_FLAG,
          observed: stable(result),
        });
      }
    }

    return {
      mode,
      resolverState: RESOLVER_PRESENT_IN_TREE,
      resolverLoad,
      status: failures.length ? 'RED' : 'GREEN',
      contract: ATTRIBUTION_RESOLVER_CONTRACT,
      failures,
    };
  });
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
  const { closeData, resolverUsed, resolverLoad, productEntry } = await withProductGlobals(state, async (resolverLoad) => {
    const manager = makeProductOrderManager(state);
    const productClose = buildCloseDataFromProduct(state, manager, order, mode);
    return {
      closeData: productClose.closeData,
      resolverUsed: productClose.resolverUsed,
      resolverLoad,
      productEntry: await saveTradeToJournalProduct(manager, state, order, productClose.closeData),
    };
  });
  const failures = productEntry
    ? attributionFailures(state, productEntry)
    : [{ reason: 'product-journal-entry-not-written' }];
  if (mode === 'orderRecord' && resolverUsed !== ATTRIBUTION_RESOLVER) {
    failures.push({
      state: resolverLoad.state === RESOLVER_PRESENT_IN_TREE ? RESOLVER_PRESENT_BUT_UNCALLED : resolverLoad.state,
      reason: resolverLoad.state === RESOLVER_PRESENT_IN_TREE
        ? 'trade-attribution-resolver-present-but-uncalled'
        : 'trade-attribution-resolver-not-found',
      expectedResolver: ATTRIBUTION_RESOLVER,
      resolverUsed,
      resolverLoad,
    });
  }
  return {
    mode,
    resolverState: resolverLoad.state,
    status: failures.length ? 'RED' : 'GREEN',
    assertion: 'four mismatched panels; trade closed on panel B while focus is panel A; journal uses B instrument and B price',
    target: 'real OrderManager.saveTradeToJournal plus attribution resolver/getCurrentCandle',
    resolverUsed,
    resolverLoad,
    expected: expectedAttribution(state),
    order: stable(order),
    referenceCloseData: stable(referenceCloseData),
    referenceEntry: stable(referenceEntry),
    closeData: stable(closeData),
    productEntry: stable(productEntry),
    failures,
  };
}

function classifyResolverExecution({ resolverTreeState, orderRecordReport, resolverContractControls }) {
  if (resolverTreeState.state !== RESOLVER_PRESENT_IN_TREE) return resolverTreeState.state;
  if (orderRecordReport.resolverUsed !== ATTRIBUTION_RESOLVER) return RESOLVER_PRESENT_BUT_UNCALLED;
  const contractWrong = resolverContractControls.some((control) => control.status !== 'GREEN');
  if (orderRecordReport.status !== 'GREEN' || contractWrong) return RESOLVER_CALLED_BUT_WRONG;
  return RESOLVER_CALLED_AND_CORRECT;
}

function runControl(cell, report, expected = 'GREEN', expectedReason = null) {
  const status = expected === 'GREEN'
    ? (report.status === 'GREEN' ? 'GREEN' : 'RED')
    : (report.status === 'RED' && JSON.stringify(report).includes(expectedReason) ? 'GREEN' : 'RED');
  return { cell, status, expected, expectedReason, report };
}

export async function runTradeAttributionCorrectnessOracle() {
  const staticSurface = inspectStaticSurface();
  const resolverTreeState = classifyChartResolverTree(staticSurface);
  const staticFailures = [];
  for (const entry of [staticSurface.source, staticSurface.publicMirror]) {
    if (!entry.hasSaveTradeToJournal) staticFailures.push({ reason: 'saveTradeToJournal-not-found', path: entry.path });
    if (!entry.hasGetCurrentCandleCalls) staticFailures.push({ reason: 'getCurrentCandle-call-not-found', path: entry.path });
    if (entry.managerResolverLine) staticFailures.push({ reason: 'trade-attribution-resolver-defined-inside-order-manager', path: entry.path, line: entry.managerResolverLine });
    if (!entry.orderFirstSymbolLine) staticFailures.push({ reason: 'order-first-symbol-line-not-found', path: entry.path });
    if (!entry.closeDataExitPriceLine) staticFailures.push({ reason: 'close-data-exit-price-line-not-found', path: entry.path });
    if (!entry.sourceFileLine) staticFailures.push({ reason: 'source-file-line-not-found', path: entry.path });
  }
  staticFailures.push(...resolverTreeState.failures);

  const resolverContractControls = [
    runControl('TRADE-RESOLVER-GLOBAL-SIGNATURE', await runResolverContractCase('globalSignature'), 'GREEN'),
    runControl('TRADE-RESOLVER-FOCUS-PURITY', await runResolverContractCase('focusPurity'), 'GREEN'),
    runControl('TRADE-RESOLVER-MISSING-OWNER-NULL', await runResolverContractCase('missingOwnerNull'), 'GREEN'),
    runControl('TRADE-RESOLVER-BAD-SHAPES-NULL', await runResolverContractCase('badShapesNull'), 'GREEN'),
    runControl('TRADE-RESOLVER-DESTROYED-OWNER-NULL', await runResolverContractCase('destroyedOwnerNull'), 'GREEN'),
    runControl('TRADE-RESOLVER-KILL-SWITCH', await runResolverContractCase('killSwitch'), 'GREEN'),
  ];
  const greenControls = [
    runControl('TRADE-JOURNAL-ORDER-RECORD-ATTRIBUTION', await runTradeAttributionCase('orderRecord'), 'GREEN'),
  ];
  const redControls = [
    runControl('TRADE-JOURNAL-FOCUS-CANDLE-PRICE', await runTradeAttributionCase('focusCloseData'), 'RED', 'journal-exit-price-not-order-panel'),
    runControl('TRADE-JOURNAL-FOCUS-ORDER-SYMBOL', await runTradeAttributionCase('focusOrderOnly'), 'RED', 'journal-symbol-not-order-panel'),
    runControl('TRADE-JOURNAL-FOCUS-ORDER-AND-PRICE', await runTradeAttributionCase('focusOrderAndCloseData'), 'RED', 'journal-close-candle-not-order-panel'),
  ];

  const resolverExecutionState = classifyResolverExecution({
    resolverTreeState,
    orderRecordReport: greenControls[0].report,
    resolverContractControls,
  });

  const status = staticFailures.length === 0
    && resolverContractControls.every((control) => control.status === 'GREEN')
    && greenControls.every((control) => control.status === 'GREEN')
    && redControls.every((control) => control.status === 'GREEN')
    ? 'GREEN'
    : 'RED';

  return {
    signature: SIGNATURE,
    status,
    staticSurface,
    staticFailures,
    resolverTreeState,
    resolverExecutionState,
    resolverContract: ATTRIBUTION_RESOLVER_CONTRACT,
    resolverContractControls,
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
