#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { runForbiddenFieldsSuite } from './release-parity-forbidden-fields-v1.mjs';
import { runDestroyBytesBehaviorSuite } from '../../../scripts/release-parity-destroy-bytes-behavior.mjs';
import { runReadme63Suite } from '../../../scripts/release-parity-readme-6-3-add-remove.mjs';
import { runReadme65Suite } from '../../../scripts/release-parity-readme-6-5-pan-throttle.mjs';

/**
 * RELEASE-PARITY-NON-CONTAMINATION-V1
 *
 * Cycle 2 release gate scaffold for the single-realm multichart parity oracle.
 * The fixture is CONF-01 by construction: four panels, four different symbols,
 * four different timeframes. Same-symbol panels carry no acceptance weight.
 *
 * Non-contamination source of truth = decisions.md ten forbidden fields, ported
 * from engine-api-guards.js (filter/snapshot/diff/self-test + per-instance traps).
 * E owns indicator/drawing/overlay RED controls — referenced, not rebuilt.
 *
 * Also lifts README 6.3 (add/remove + no surviving listeners) and 6.5 (four
 * charts panned/resized 30s under 4× CPU throttle, fail=0). Every contamination
 * fixture is mismatched-timeframe only per E's roadmap read.
 */

export const RELEASE_PARITY_NON_CONTAMINATION_SIGNATURE = 'TALARIA_RELEASE_PARITY_NON_CONTAMINATION_V1';

export const CONF01_PANELS = Object.freeze([
  { id: 'A', symbol: 'XAUUSD', fileId: 677, timeframe: '1m' },
  { id: 'B', symbol: 'HOG', fileId: 673, timeframe: '5m' },
  { id: 'C', symbol: 'ETHBTC', fileId: 670, timeframe: '15m' },
  { id: 'D', symbol: 'BTCEUR', fileId: 669, timeframe: '1h' },
]);

export const NON_CONTAMINATION_OPERATIONS = Object.freeze([
  'change-symbol',
  'change-timeframe',
  'load-data',
  'draw-shape',
  'place-order',
  'seek-playhead',
  'pan-candles',
  'resize-candles',
]);

export const PARITY_SURFACES = Object.freeze([
  'drawing-tools',
  'indicators',
  'orders',
  'replay',
  'crosshair-sync',
  'range-sync',
  'keyboard',
  'context-menus',
]);

function stable(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stable);
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = stable(value[key]);
  return out;
}

function stableString(value) {
  return JSON.stringify(stable(value));
}

function symbolSeed(symbol) {
  let n = 0;
  for (const ch of String(symbol)) n = (n * 33 + ch.charCodeAt(0)) >>> 0;
  return n || 1;
}

function makeBars(symbol, fileId, timeframe, variant = 0) {
  const seed = symbolSeed(symbol) + Number(fileId || 0) + variant * 101;
  const bars = [];
  // Same length, first timestamp, last timestamp and last close across all panels.
  // That deliberately collides with `_h1Cache`'s weak key when symbol/fileId are omitted.
  for (let i = 0; i < 8; i += 1) {
    const middle = i > 0 && i < 7 ? ((seed % 997) + i * (variant + 3)) : 0;
    const c = i === 0 ? 100 : i === 7 ? 500 : middle;
    bars.push({ t: i * 3_600_000, o: c - 1, h: c + 2, l: c - 2, c, v: seed + i, tf: timeframe });
  }
  return bars;
}

function ownIndicatorValue(bars) {
  return bars.slice(1, -1).reduce((n, b) => n + Number(b.c || 0), 0);
}

function makePanel(cfg) {
  const data = makeBars(cfg.symbol, cfg.fileId, cfg.timeframe);
  return {
    id: cfg.id,
    symbol: cfg.symbol,
    fileId: cfg.fileId,
    timeframe: cfg.timeframe,
    data,
    indicators: {},
    drawings: [],
    orders: [],
    viewport: { start: 1, end: 5, offsetX: 0, zoom: 1 },
    replay: { index: 4, timestamp: data[4].t },
    crosshair: null,
    keyboardState: { lastKey: null, handledBy: null },
    contextMenu: null,
    restoreMarkers: 0,
  };
}

function makeState() {
  return {
    focusedPanelId: 'A',
    panels: Object.fromEntries(CONF01_PANELS.map((cfg) => [cfg.id, makePanel(cfg)])),
    h1Cache: { key: '', bars: null, sourcePanel: null },
    events: [],
  };
}

function snapshotPanel(panel) {
  return {
    symbol: panel.symbol,
    fileId: panel.fileId,
    timeframe: panel.timeframe,
    dataHash: stableString(panel.data),
    indicators: panel.indicators,
    drawings: panel.drawings,
    orders: panel.orders,
    viewport: panel.viewport,
    replay: panel.replay,
    crosshair: panel.crosshair,
    keyboardState: panel.keyboardState,
    contextMenu: panel.contextMenu,
    restoreMarkers: panel.restoreMarkers,
  };
}

function snapshotState(state) {
  return Object.fromEntries(
    Object.entries(state.panels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, panel]) => [id, snapshotPanel(panel)]),
  );
}

function snapshotPeers(state, targetId) {
  const out = {};
  for (const [id, panel] of Object.entries(state.panels)) {
    if (id !== targetId) out[id] = snapshotPanel(panel);
  }
  return out;
}

function h1CacheKey(panel, mode) {
  const bars = panel.data;
  const first = bars[0];
  const last = bars[bars.length - 1];
  // Broken fixture intentionally omits panel/symbol/fileId/timeframe so it can
  // contaminate mismatched-timeframe CONF-01 panels. Matched-TF collisions are
  // non-evidence per the roadmap archaeology.
  const weak = [bars.length, first?.t, last?.t, last?.c].join('|');
  if (mode === 'unscopedH1Cache') return weak;
  return [panel.id, panel.symbol, panel.fileId, panel.timeframe, weak].join('|');
}

function recalcWeeklyMap(state, panelId, mode = 'scoped') {
  const panel = state.panels[panelId];
  const key = h1CacheKey(panel, mode);
  if (state.h1Cache.key !== key || !Array.isArray(state.h1Cache.bars)) {
    state.h1Cache = { key, bars: panel.data.map((b) => ({ ...b })), sourcePanel: panel.id };
  }
  const value = ownIndicatorValue(state.h1Cache.bars);
  panel.indicators.weeklyMap = {
    value,
    expectedOwnValue: ownIndicatorValue(panel.data),
    sourcePanel: state.h1Cache.sourcePanel,
  };
}

function dispatchChartDataLoaded(state, panelId, mode = 'scoped') {
  state.events.push({ type: 'chartDataLoaded', panelId });
  const actedPanelId = mode === 'globalChartDataLoaded' ? 'A' : panelId;
  const panel = state.panels[actedPanelId];
  panel.restoreMarkers += 1;
  panel.drawings = panel.drawings.map((d) => ({ ...d, redraws: (d.redraws || 0) + 1 }));
}

function initializeIndicators(state, mode = 'scoped') {
  for (const cfg of CONF01_PANELS) recalcWeeklyMap(state, cfg.id, mode);
}

function mutateTarget(state, op, targetId, mode) {
  const panel = state.panels[targetId];
  if (op === 'change-symbol') {
    panel.symbol = `${panel.symbol}_ALT`;
    panel.fileId += 1000;
    panel.data = makeBars(panel.symbol, panel.fileId, panel.timeframe, 1);
    recalcWeeklyMap(state, targetId, mode);
    dispatchChartDataLoaded(state, targetId, mode);
  } else if (op === 'change-timeframe') {
    panel.timeframe = `${panel.timeframe}:ALT`;
    panel.data = makeBars(panel.symbol, panel.fileId, panel.timeframe, 2);
    recalcWeeklyMap(state, targetId, mode);
    dispatchChartDataLoaded(state, targetId, mode);
  } else if (op === 'load-data') {
    panel.fileId += 2000;
    panel.data = makeBars(panel.symbol, panel.fileId, panel.timeframe, 3);
    recalcWeeklyMap(state, targetId, mode);
    dispatchChartDataLoaded(state, targetId, mode);
  } else if (op === 'draw-shape') {
    panel.drawings.push({ id: `${targetId}-shape-${panel.drawings.length + 1}`, type: 'trendline', redraws: 0 });
  } else if (op === 'place-order') {
    panel.orders.push({ id: `${targetId}-order-${panel.orders.length + 1}`, symbol: panel.symbol, price: panel.data[4].c });
  } else if (op === 'seek-playhead') {
    panel.replay = { index: 6, timestamp: panel.data[6].t };
    panel.viewport = { ...panel.viewport, start: 2, end: 6, offsetX: panel.viewport.offsetX + 16 };
  } else if (op === 'pan-candles') {
    panel.viewport = {
      ...panel.viewport,
      start: panel.viewport.start + 1,
      end: panel.viewport.end + 1,
      offsetX: panel.viewport.offsetX + 32,
      route: 'pan',
    };
  } else if (op === 'resize-candles') {
    panel.viewport = {
      ...panel.viewport,
      end: panel.viewport.end + 2,
      width: 960,
      height: 540,
      route: 'resize',
    };
  } else {
    throw new Error(`unknown op: ${op}`);
  }
}

function assertConf01() {
  const symbols = new Set(CONF01_PANELS.map((p) => p.symbol));
  const tfs = new Set(CONF01_PANELS.map((p) => p.timeframe));
  return CONF01_PANELS.length === 4 && symbols.size === 4 && tfs.size === 4;
}

function mismatchedTimeframeFixtureForTarget(targetId) {
  const target = CONF01_PANELS.find((p) => p.id === targetId);
  if (!target) return false;
  return CONF01_PANELS
    .filter((p) => p.id !== targetId)
    .every((p) => p.timeframe !== target.timeframe);
}

function indicatorOwnDataFailures(state) {
  const failures = [];
  for (const [id, panel] of Object.entries(state.panels)) {
    const wm = panel.indicators.weeklyMap;
    if (!wm) {
      failures.push({ panelId: id, reason: 'missing-weeklyMap' });
    } else if (wm.sourcePanel !== id || wm.value !== wm.expectedOwnValue) {
      failures.push({
        panelId: id,
        reason: 'indicator-cross-contamination',
        sourcePanel: wm.sourcePanel,
        value: wm.value,
        expectedOwnValue: wm.expectedOwnValue,
      });
    }
  }
  return failures;
}

export function runNonContaminationSuite(opts = {}) {
  const mode = opts.mode || 'scoped';
  const failures = [];
  const cells = [];
  const conf01 = assertConf01();
  if (!conf01) failures.push({ cell: 'CONF01-SHAPE', reason: 'not-four-distinct-symbols-and-timeframes' });

  const base = makeState();
  initializeIndicators(base, mode);
  for (const failure of indicatorOwnDataFailures(base)) failures.push({ cell: 'INDICATOR-OWN-DATA', ...failure });

  const targets = ['B', 'B', 'D', 'B', 'C', 'D', 'B', 'C'];
  NON_CONTAMINATION_OPERATIONS.forEach((op, i) => {
    const targetId = targets[i];
    const mismatchedTimeframesOnly = mismatchedTimeframeFixtureForTarget(targetId);
    const state = makeState();
    initializeIndicators(state, mode);
    const beforePeers = snapshotPeers(state, targetId);
    const beforeTarget = stableString(snapshotPanel(state.panels[targetId]));
    mutateTarget(state, op, targetId, mode);
    const afterPeers = snapshotPeers(state, targetId);
    const afterTarget = stableString(snapshotPanel(state.panels[targetId]));
    const peersIdentical = stableString(beforePeers) === stableString(afterPeers);
    const targetChanged = beforeTarget !== afterTarget;
    const cell = {
      cell: `NONCONTAM-${op.toUpperCase()}`,
      targetId,
      status: peersIdentical && targetChanged && mismatchedTimeframesOnly ? 'GREEN' : 'RED',
      peersIdentical,
      targetChanged,
      mismatchedTimeframesOnly,
      targetTimeframe: CONF01_PANELS.find((p) => p.id === targetId)?.timeframe,
      peerTimeframes: CONF01_PANELS.filter((p) => p.id !== targetId).map((p) => p.timeframe),
      peerBefore: beforePeers,
      peerAfter: afterPeers,
    };
    cells.push(cell);
    if (cell.status !== 'GREEN') {
      failures.push({
        cell: cell.cell,
        targetId,
        reason: !mismatchedTimeframesOnly
          ? 'matched-timeframe-fixture-is-non-evidence'
          : (!peersIdentical ? 'peer-mutated' : 'target-did-not-change'),
      });
    }
    for (const failure of indicatorOwnDataFailures(state)) failures.push({ cell: `${cell.cell}:INDICATOR`, ...failure });
  });

  const status = failures.length ? 'RED' : 'GREEN';
  return {
    signature: RELEASE_PARITY_NON_CONTAMINATION_SIGNATURE,
    mode,
    conf01: {
      panels: CONF01_PANELS,
      fourPanels: CONF01_PANELS.length === 4,
      fourDistinctSymbols: new Set(CONF01_PANELS.map((p) => p.symbol)).size === 4,
      fourDistinctTimeframes: new Set(CONF01_PANELS.map((p) => p.timeframe)).size === 4,
      mismatchedTimeframesOnly: CONF01_PANELS.every((p) => mismatchedTimeframeFixtureForTarget(p.id)),
      acceptanceWeight: 'same-symbol or matched-timeframe contamination fixtures earn no credit',
    },
    operations: NON_CONTAMINATION_OPERATIONS,
    status,
    failures,
    cells,
  };
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

function makeParityState() {
  const state = makeState();
  initializeIndicators(state, 'scoped');
  for (const panel of Object.values(state.panels)) {
    panel.drawings.push({ id: `${panel.id}-baseline-shape`, type: 'trendline', selected: false, points: [1, 5] });
    panel.orders.push({ id: `${panel.id}-baseline-order`, symbol: panel.symbol, price: panel.data[3].c, status: 'OPEN' });
  }
  return state;
}

const LOCAL_PARITY_SURFACES = new Set([
  'drawing-tools',
  'indicators',
  'orders',
  'replay',
  'keyboard',
  'context-menus',
]);

/**
 * Apply one parity surface.
 * - realm='multi' models iframe isolation (always focused-panel scoped).
 * - realm='single' models one-document routing; mode can deliberately break it.
 * Modes: scoped | hostRoutedDrawing | hostRoutedOrders | hostRoutedReplay
 *        | hostRoutedKeyboard | hostRoutedContextMenu | hostAbsCrosshair
 */
function applyParitySurface(state, surface, targetId, opts = {}) {
  const realm = opts.realm || 'multi';
  const mode = opts.mode || 'scoped';
  const focusedId = state.focusedPanelId || 'A';
  const routeId = (() => {
    if (realm === 'multi') return targetId;
    if (surface === 'drawing-tools' && mode === 'hostRoutedDrawing') return 'A';
    if (surface === 'orders' && mode === 'hostRoutedOrders') return 'A';
    if (surface === 'replay' && mode === 'hostRoutedReplay') return 'A';
    if (surface === 'keyboard' && mode === 'hostRoutedKeyboard') return 'A';
    if (surface === 'context-menus' && mode === 'hostRoutedContextMenu') return 'A';
    return targetId;
  })();
  const panel = state.panels[routeId];
  if (!panel) throw new Error(`unknown panel: ${routeId}`);
  state.focusedPanelId = targetId;

  if (surface === 'drawing-tools') {
    panel.drawings.push({
      id: `${routeId}-parity-rectangle`,
      type: 'rectangle',
      selected: true,
      points: [2, 6],
      style: { color: '#2f80ed', width: 2 },
    });
  } else if (surface === 'indicators') {
    panel.indicators.sessionParity = {
      sourcePanel: routeId,
      value: ownIndicatorValue(panel.data) + panel.fileId,
      timeframe: panel.timeframe,
    };
    recalcWeeklyMap(state, routeId, 'scoped');
  } else if (surface === 'orders') {
    panel.orders.push({
      id: `${routeId}-parity-pending`,
      symbol: panel.symbol,
      price: panel.data[5].c,
      status: 'PENDING',
      side: 'BUY',
      qty: 1,
    });
  } else if (surface === 'replay') {
    panel.replay = { index: 6, timestamp: panel.data[6].t, speed: '60x', playing: true };
    panel.viewport = { ...panel.viewport, start: 2, end: 6 };
  } else if (surface === 'crosshair-sync') {
    const sourcePanel = state.panels[targetId];
    const source = { panelId: targetId, t: sourcePanel.data[4].t, price: sourcePanel.data[4].c };
    for (const peer of Object.values(state.panels)) {
      const localPrice = realm === 'single' && mode === 'hostAbsCrosshair'
        ? source.price
        : peer.data[4].c;
      peer.crosshair = {
        sourcePanel: targetId,
        t: source.t,
        sourcePrice: source.price,
        localPrice,
      };
    }
  } else if (surface === 'range-sync') {
    const range = { start: 2, end: 7, offsetX: 24, zoom: 1.25, sourcePanel: targetId };
    for (const peer of Object.values(state.panels)) {
      peer.viewport = { ...range, localTimeframe: peer.timeframe };
    }
  } else if (surface === 'keyboard') {
    const selected = panel.drawings[0];
    if (selected) panel.drawings = panel.drawings.filter((d) => d.id !== selected.id);
    panel.keyboardState = { lastKey: 'Delete', handledBy: routeId, focusedPanelId: focusedId };
  } else if (surface === 'context-menus') {
    panel.contextMenu = {
      open: true,
      sourcePanel: routeId,
      focusedPanelId: targetId,
      itemCount: 5,
      anchor: { x: 320, y: 180 },
    };
  } else {
    throw new Error(`unknown parity surface: ${surface}`);
  }
}

export function runParityBreadthSuite(opts = {}) {
  const singleMode = opts.singleMode || 'scoped';
  const failures = [];
  const cells = [];
  const targets = ['B', 'C', 'D', 'B', 'C', 'D', 'B', 'C'];
  const conf01 = assertConf01();
  if (!conf01) failures.push({ cell: 'CONF01-SHAPE', reason: 'not-four-distinct-symbols-and-timeframes' });

  PARITY_SURFACES.forEach((surface, i) => {
    const targetId = targets[i];
    const baseline = makeParityState();
    baseline.focusedPanelId = targetId;
    const multiRealm = cloneState(baseline);
    const singleRealm = cloneState(baseline);
    applyParitySurface(multiRealm, surface, targetId, { realm: 'multi', mode: 'scoped' });
    applyParitySurface(singleRealm, surface, targetId, { realm: 'single', mode: singleMode });
    const referenceSnapshot = snapshotState(multiRealm);
    const singleRealmSnapshot = snapshotState(singleRealm);
    const beforePeers = snapshotPeers(baseline, targetId);
    const afterPeersMulti = snapshotPeers(multiRealm, targetId);
    const afterPeersSingle = snapshotPeers(singleRealm, targetId);
    const wholeStateMatchesReference = stableString(referenceSnapshot) === stableString(singleRealmSnapshot);
    const exercised = stableString(snapshotState(baseline)) !== stableString(singleRealmSnapshot);
    const localSurface = LOCAL_PARITY_SURFACES.has(surface);
    const multiPeersOk = !localSurface || stableString(beforePeers) === stableString(afterPeersMulti);
    const singlePeersOk = !localSurface || stableString(beforePeers) === stableString(afterPeersSingle);
    const cell = {
      cell: `PARITY-${surface.toUpperCase()}`,
      surface,
      targetId,
      singleMode,
      status: wholeStateMatchesReference && exercised && multiPeersOk && singlePeersOk ? 'GREEN' : 'RED',
      wholeStateMatchesReference,
      exercised,
      multiPeersOk,
      singlePeersOk,
      referenceSnapshot,
      singleRealmSnapshot,
    };
    cells.push(cell);
    if (cell.status !== 'GREEN') {
      let reason = 'surface-not-exercised';
      if (!wholeStateMatchesReference) reason = 'single-realm-reference-mismatch';
      else if (!multiPeersOk || !singlePeersOk) reason = 'local-surface-peer-mutated';
      failures.push({ cell: cell.cell, targetId, reason, singleMode });
    }
  });

  return {
    signature: RELEASE_PARITY_NON_CONTAMINATION_SIGNATURE,
    conf01: {
      panels: CONF01_PANELS,
      fourPanels: CONF01_PANELS.length === 4,
      fourDistinctSymbols: new Set(CONF01_PANELS.map((p) => p.symbol)).size === 4,
      fourDistinctTimeframes: new Set(CONF01_PANELS.map((p) => p.timeframe)).size === 4,
      mismatchedTimeframesOnly: CONF01_PANELS.every((p) => mismatchedTimeframeFixtureForTarget(p.id)),
      acceptanceWeight: 'same-symbol or matched-timeframe contamination fixtures earn no credit',
    },
    status: failures.length ? 'RED' : 'GREEN',
    surfaces: PARITY_SURFACES,
    singleMode,
    failures,
    cells,
    limitation: 'Model breadth scaffold; final release credit requires driving these cells against the real single-realm app.',
  };
}

export function runParityBreadthRedControls() {
  const controls = [
    {
      cell: 'NC-PARITY-DRAWING-HOST-ROUTED',
      singleMode: 'hostRoutedDrawing',
      expectedFailureReason: 'single-realm-reference-mismatch',
      report: runParityBreadthSuite({ singleMode: 'hostRoutedDrawing' }),
    },
    {
      cell: 'NC-PARITY-ORDERS-HOST-ROUTED',
      singleMode: 'hostRoutedOrders',
      expectedFailureReason: 'single-realm-reference-mismatch',
      report: runParityBreadthSuite({ singleMode: 'hostRoutedOrders' }),
    },
    {
      cell: 'NC-PARITY-REPLAY-HOST-ROUTED',
      singleMode: 'hostRoutedReplay',
      expectedFailureReason: 'single-realm-reference-mismatch',
      report: runParityBreadthSuite({ singleMode: 'hostRoutedReplay' }),
    },
    {
      cell: 'NC-PARITY-KEYBOARD-HOST-ROUTED',
      singleMode: 'hostRoutedKeyboard',
      expectedFailureReason: 'single-realm-reference-mismatch',
      report: runParityBreadthSuite({ singleMode: 'hostRoutedKeyboard' }),
    },
    {
      cell: 'NC-PARITY-CONTEXT-MENU-HOST-ROUTED',
      singleMode: 'hostRoutedContextMenu',
      expectedFailureReason: 'single-realm-reference-mismatch',
      report: runParityBreadthSuite({ singleMode: 'hostRoutedContextMenu' }),
    },
    {
      cell: 'NC-PARITY-CROSSHAIR-HOST-ABS-PRICE',
      singleMode: 'hostAbsCrosshair',
      expectedFailureReason: 'single-realm-reference-mismatch',
      report: runParityBreadthSuite({ singleMode: 'hostAbsCrosshair' }),
    },
  ];
  return controls.map((c) => ({
    ...c,
    status: c.report.status === 'RED'
      && c.report.failures.some((f) => f.reason === c.expectedFailureReason)
      ? 'GREEN'
      : 'RED',
  }));
}

export function runRedControls() {
  const controls = [
    {
      cell: 'NC-UNSCOPED-H1-CACHE',
      mode: 'unscopedH1Cache',
      expectedFailureReason: 'indicator-cross-contamination',
      report: runNonContaminationSuite({ mode: 'unscopedH1Cache' }),
    },
    {
      cell: 'NC-GLOBAL-CHARTDATALOADED',
      mode: 'globalChartDataLoaded',
      expectedFailureReason: 'peer-mutated',
      report: runNonContaminationSuite({ mode: 'globalChartDataLoaded' }),
    },
  ];
  return controls.map((c) => ({
    ...c,
    status: c.report.status === 'RED'
      && c.report.failures.some((f) => f.reason === c.expectedFailureReason)
      ? 'GREEN'
      : 'RED',
  }));
}

export function runReleaseParityNonContaminationOracle() {
  const green = runNonContaminationSuite({ mode: 'scoped' });
  const parityBreadth = runParityBreadthSuite({ singleMode: 'scoped' });
  const forbiddenFields = runForbiddenFieldsSuite();
  const readme63 = runReadme63Suite();
  const readme65 = runReadme65Suite();
  const destroyBytesBehavior = runDestroyBytesBehaviorSuite();
  const redControls = runRedControls();
  const breadthRedControls = runParityBreadthRedControls();
  const redControlFailures = [
    ...redControls.filter((c) => c.status !== 'GREEN'),
    ...breadthRedControls.filter((c) => c.status !== 'GREEN'),
  ];
  const trapStop = forbiddenFields.perInstanceTraps?.status !== 'GREEN';
  const productStubBlocksRelease = forbiddenFields.releaseAuthority?.productStubBlocksRelease === true;
  const status = green.status === 'GREEN'
    && parityBreadth.status === 'GREEN'
    && forbiddenFields.status === 'GREEN'
    && readme63.status === 'GREEN'
    && readme65.status === 'GREEN'
    && destroyBytesBehavior.status === 'GREEN'
    && redControlFailures.length === 0
    && !trapStop
    ? 'GREEN'
    : 'RED';
  const destroyStop = readme63.status === 'RED' || destroyBytesBehavior.status === 'RED';
  return {
    signature: RELEASE_PARITY_NON_CONTAMINATION_SIGNATURE,
    status,
    green,
    parityBreadth,
    forbiddenFields,
    readme63,
    readme65,
    destroyBytesBehavior,
    redControls,
    breadthRedControls,
    releaseAuthority: {
      stopAuthority: true,
      destroyStop,
      trapStop,
      productStubBlocksRelease,
      statement: destroyStop
        ? 'Destroy gates are intentionally RED: Chart.destroy() is absent, detached chart listeners/bytes survive, and late work can rehydrate bytes.'
        : (trapStop
        ? 'Ported guard cannot fire per-instance in a single realm — RELEASE-01 stop.'
        : (productStubBlocksRelease
          ? 'Ported traps fire per-instance. Product installForbiddenSetterTraps remains a stub — release waits on product non-stub traps before single-realm ships.'
          : 'If this suite is insufficient to hold a final release, release waits.')),
      currentLimitation:
        'Model oracle + ported engine-api-guards; README 6.3 and destroy-bytes behavior are RED until Chart.destroy() exists. Product shell heap/CDP drives remain CONF-01 follow-ups. E owns indicator/drawing/overlay destroy correctness.',
      eCompanion: forbiddenFields.eCompanion,
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = runReleaseParityNonContaminationOracle();
  console.log(JSON.stringify(report, null, 2));
  const exitOk = report.status === 'GREEN' && !report.releaseAuthority.productStubBlocksRelease;
  process.exit(exitOk ? 0 : 1);
}
