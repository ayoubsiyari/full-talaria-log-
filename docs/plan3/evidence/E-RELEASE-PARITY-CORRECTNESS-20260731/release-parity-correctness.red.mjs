#!/usr/bin/env node
/**
 * E-RELEASE-PARITY-CORRECTNESS-V1
 *
 * Model oracle for the correctness half of the single-realm parity suite.
 * It is deliberately runnable before the single-realm app exists: the value is
 * the assertion shape and the RED controls for indicator, drawing and overlay
 * cross-panel contamination.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SIGNATURE = 'TALARIA_E_RELEASE_PARITY_CORRECTNESS_V1';

export const CONF01_PANELS = Object.freeze([
  { id: 'A', symbol: 'XAUUSD', fileId: 677, timeframe: '1m' },
  { id: 'B', symbol: 'HOG', fileId: 673, timeframe: '5m' },
  { id: 'C', symbol: 'ETHBTC', fileId: 670, timeframe: '15m' },
  { id: 'D', symbol: 'BTCEUR', fileId: 669, timeframe: '1h' },
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

function seedFor(cfg) {
  let n = Number(cfg.fileId || 0);
  for (const ch of String(cfg.symbol)) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  for (const ch of String(cfg.timeframe)) n = (n * 17 + ch.charCodeAt(0)) >>> 0;
  return n || 1;
}

function makePanel(cfg) {
  const seed = seedFor(cfg);
  return {
    ...cfg,
    indicators: {
      smaTip: { ownerPanelId: cfg.id, symbol: cfg.symbol, value: seed % 1000 },
      openingRange: { ownerPanelId: cfg.id, symbol: cfg.symbol, anchor: `${cfg.symbol}:${cfg.timeframe}:or`, high: 100 + (seed % 17), low: 90 + (seed % 11) },
    },
    drawings: [
      { id: `${cfg.id}-trendline`, ownerPanelId: cfg.id, symbol: cfg.symbol, type: 'trendline', points: [{ x: 1, y: seed % 200 }, { x: 2, y: (seed % 200) + 5 }] },
    ],
    overlays: {
      legendRows: [{ ownerPanelId: cfg.id, symbol: cfg.symbol, text: `${cfg.symbol} ${cfg.timeframe} SMA` }],
      axisTags: [{ ownerPanelId: cfg.id, symbol: cfg.symbol, text: `${cfg.id}:axis` }],
      sessionLabels: [{ ownerPanelId: cfg.id, symbol: cfg.symbol, text: `${cfg.symbol}:session` }],
    },
  };
}

function makeState() {
  return {
    panels: Object.fromEntries(CONF01_PANELS.map((cfg) => [cfg.id, makePanel(cfg)])),
    globalIndicatorSlot: null,
    globalDrawingLayer: null,
    globalOverlayLayer: null,
  };
}

function snapshotPanel(panel) {
  return {
    symbol: panel.symbol,
    fileId: panel.fileId,
    timeframe: panel.timeframe,
    indicators: panel.indicators,
    drawings: panel.drawings,
    overlays: panel.overlays,
  };
}

function snapshotPeers(state, targetId) {
  const out = {};
  for (const [id, panel] of Object.entries(state.panels)) {
    if (id !== targetId) out[id] = snapshotPanel(panel);
  }
  return out;
}

function assertConf01Shape() {
  return CONF01_PANELS.length === 4
    && new Set(CONF01_PANELS.map((p) => p.symbol)).size === 4
    && new Set(CONF01_PANELS.map((p) => p.timeframe)).size === 4;
}

function ownerFailures(state) {
  const failures = [];
  for (const [id, panel] of Object.entries(state.panels)) {
    for (const [name, indicator] of Object.entries(panel.indicators || {})) {
      if (!indicator || indicator.ownerPanelId !== id || indicator.symbol !== panel.symbol) {
        failures.push({ surface: 'indicator', panelId: id, name, reason: 'indicator-cross-contamination', value: indicator });
      }
    }
    for (const drawing of panel.drawings || []) {
      if (!drawing || drawing.ownerPanelId !== id || drawing.symbol !== panel.symbol) {
        failures.push({ surface: 'drawing', panelId: id, drawingId: drawing && drawing.id, reason: 'drawing-cross-contamination', value: drawing });
      }
    }
    for (const [kind, rows] of Object.entries(panel.overlays || {})) {
      for (const row of rows || []) {
        if (!row || row.ownerPanelId !== id || row.symbol !== panel.symbol) {
          failures.push({ surface: 'overlay', panelId: id, kind, reason: 'overlay-cross-contamination', value: row });
        }
      }
    }
  }
  return failures;
}

function mutateTarget(state, targetId, surface, mode) {
  const target = state.panels[targetId];
  if (surface === 'indicator') {
    const next = { ownerPanelId: targetId, symbol: target.symbol, value: target.indicators.smaTip.value + 1 };
    if (mode === 'globalIndicatorSlot') {
      state.globalIndicatorSlot = next;
      for (const panel of Object.values(state.panels)) panel.indicators.smaTip = state.globalIndicatorSlot;
    } else {
      target.indicators.smaTip = next;
    }
  } else if (surface === 'drawing') {
    const moved = { ...target.drawings[0], points: target.drawings[0].points.map((p) => ({ ...p, y: p.y + 10 })) };
    if (mode === 'globalDrawingLayer') {
      state.globalDrawingLayer = [moved];
      for (const panel of Object.values(state.panels)) panel.drawings = state.globalDrawingLayer;
    } else {
      target.drawings = [moved];
    }
  } else if (surface === 'overlay') {
    const refreshed = {
      legendRows: [{ ownerPanelId: targetId, symbol: target.symbol, text: `${target.symbol}:refreshed` }],
      axisTags: [{ ownerPanelId: targetId, symbol: target.symbol, text: `${targetId}:axis:refreshed` }],
      sessionLabels: [{ ownerPanelId: targetId, symbol: target.symbol, text: `${target.symbol}:session:refreshed` }],
    };
    if (mode === 'globalOverlayLayer') {
      state.globalOverlayLayer = refreshed;
      for (const panel of Object.values(state.panels)) panel.overlays = state.globalOverlayLayer;
    } else {
      target.overlays = refreshed;
    }
  } else {
    throw new Error(`unknown surface: ${surface}`);
  }
}

export function runCorrectnessSuite(opts = {}) {
  const mode = opts.mode || 'scoped';
  const surfaces = ['indicator', 'drawing', 'overlay'];
  const failures = [];
  const cells = [];
  if (!assertConf01Shape()) failures.push({ cell: 'CONF01-SHAPE', reason: 'not-four-distinct-symbols-and-timeframes' });

  for (const surface of surfaces) {
    const targetId = surface === 'indicator' ? 'B' : surface === 'drawing' ? 'C' : 'D';
    const state = makeState();
    const beforePeers = snapshotPeers(state, targetId);
    const beforeTarget = stableString(snapshotPanel(state.panels[targetId]));
    mutateTarget(state, targetId, surface, mode);
    const afterPeers = snapshotPeers(state, targetId);
    const afterTarget = stableString(snapshotPanel(state.panels[targetId]));
    const peerFailures = ownerFailures(state).filter((f) => f.panelId !== targetId);
    const targetFailures = ownerFailures(state).filter((f) => f.panelId === targetId);
    const peersIdentical = stableString(beforePeers) === stableString(afterPeers);
    const targetChanged = beforeTarget !== afterTarget;
    const status = peersIdentical && targetChanged && peerFailures.length === 0 && targetFailures.length === 0 ? 'GREEN' : 'RED';
    const cell = {
      cell: `CORRECTNESS-${surface.toUpperCase()}`,
      surface,
      targetId,
      status,
      peersIdentical,
      targetChanged,
      peerFailures,
      targetFailures,
    };
    cells.push(cell);
    if (status !== 'GREEN') {
      failures.push({
        cell: cell.cell,
        targetId,
        reason: peerFailures[0]?.reason || targetFailures[0]?.reason || (!peersIdentical ? 'peer-mutated' : 'target-did-not-change'),
        peerFailures,
        targetFailures,
      });
    }
  }

  return {
    signature: SIGNATURE,
    mode,
    conf01: {
      panels: CONF01_PANELS,
      fourPanels: CONF01_PANELS.length === 4,
      fourDistinctSymbols: new Set(CONF01_PANELS.map((p) => p.symbol)).size === 4,
      fourDistinctTimeframes: new Set(CONF01_PANELS.map((p) => p.timeframe)).size === 4,
      acceptanceWeight: 'same-symbol panels earn no credit',
    },
    status: failures.length ? 'RED' : 'GREEN',
    failures,
    cells,
  };
}

export function runRedControls() {
  const controls = [
    { cell: 'RP-INDICATOR-GLOBAL-SLOT', mode: 'globalIndicatorSlot', expectedFailureReason: 'indicator-cross-contamination' },
    { cell: 'RP-DRAWING-GLOBAL-LAYER', mode: 'globalDrawingLayer', expectedFailureReason: 'drawing-cross-contamination' },
    { cell: 'RP-OVERLAY-GLOBAL-LAYER', mode: 'globalOverlayLayer', expectedFailureReason: 'overlay-cross-contamination' },
  ];
  return controls.map((control) => {
    const report = runCorrectnessSuite({ mode: control.mode });
    return {
      ...control,
      report,
      status: report.status === 'RED'
        && report.failures.some((f) => f.reason === control.expectedFailureReason)
        ? 'GREEN'
        : 'RED',
    };
  });
}

export function runReleaseParityCorrectnessOracle() {
  const green = runCorrectnessSuite({ mode: 'scoped' });
  const redControls = runRedControls();
  const status = green.status === 'GREEN' && redControls.every((c) => c.status === 'GREEN') ? 'GREEN' : 'RED';
  return {
    signature: SIGNATURE,
    status,
    green,
    redControls,
    releaseAuthority: {
      currentLimitation: 'Cycle 2 model oracle; must be wired into the real single-realm app before final release credit.',
      transplantTarget: 'D release-parity-non-contamination suite or successor real-app parity gate',
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = runReleaseParityCorrectnessOracle();
  const outDir = path.dirname(fileURLToPath(import.meta.url));
  const outPath = path.join(outDir, 'release-parity-correctness-red.json');
  fs.writeFileSync(outPath, `${JSON.stringify({ ...report, measuredAt: new Date().toISOString() }, null, 2)}\n`);
  console.log(JSON.stringify({
    outPath,
    status: report.status,
    greenStatus: report.green.status,
    redControls: report.redControls.map((c) => ({
      cell: c.cell,
      mode: c.mode,
      status: c.status,
      reportStatus: c.report.status,
      expectedFailureReason: c.expectedFailureReason,
      matched: c.report.failures.some((f) => f.reason === c.expectedFailureReason),
    })),
  }, null, 2));
  process.exit(report.status === 'GREEN' ? 0 : 1);
}
