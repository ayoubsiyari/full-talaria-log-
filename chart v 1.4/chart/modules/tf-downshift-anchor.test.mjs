/**
 * TF-DOWNSHIFT-ANCHOR — right-edge TF-switch must pin period-end, not bar-start.
 *
 *   cd "chart v 1.4/chart/modules"
 *   node --test --test-reporter=tap --test-concurrency=1 tf-downshift-anchor.test.mjs
 *
 * Behavioural cells ahead of white-box checks so on-disk mutants die on behaviour.
 *
 * Kill-switch: window.__TALARIA_DISABLE_TF_DOWNSHIFT_ANCHOR_FIX_V1
 *   Absent/falsy = fix ON (period-end). Truthy = legacy bar-start.
 *
 * Single-canonical suite — do NOT mirror under homepage/public.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const SWITCH = '__TALARIA_DISABLE_TF_DOWNSHIFT_ANCHOR_FIX_V1';
const T0 = Date.UTC(2024, 0, 2, 0, 0, 0);

function findRoot(start) {
  let cursor = path.resolve(start);
  for (;;) {
    const chart = path.join(cursor, 'chart v 1.4', 'chart', 'chart.js');
    if (fs.existsSync(chart)
      && fs.existsSync(path.join(cursor, 'homepage', 'public', 'chart', 'chart.js'))) {
      return cursor;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error(`repository root not found from ${start}`);
    cursor = parent;
  }
}

const ROOT = findRoot(path.dirname(fileURLToPath(import.meta.url)));
const CHART_JS = path.join(ROOT, 'chart v 1.4', 'chart', 'chart.js');
const CHART_MIRROR = path.join(ROOT, 'homepage', 'public', 'chart', 'chart.js');
const CHART_SOURCE = fs.readFileSync(CHART_JS, 'utf8');

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function methodSource(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(
    `^    (?:async\\s+)?${escaped}\\s*\\([^]*?(?=^    (?:async\\s+)?[A-Za-z_$][\\w$]*\\s*\\(|^})`,
    'm',
  ));
  if (!match) throw new Error(`method ${name} missing from chart.js`);
  return match[0].replace(/\n+$/, '\n');
}

const METHODS = [
  '_getSpacingForCandleWidth',
  'getCandleSpacing',
  'pixelToDataIndex',
  'dataIndexToPixel',
  '_getViewportBarRange',
  '_getVisibleCenterTimestamp',
  '_estimateTimeframeStepMs',
  'estimateTimestampForDataIndex',
  '_clampRestoredCandleWidth',
  '_findClosestBarIndexForTimestamp',
  '_restorePositionToTimestamp',
  '_restorePositionAtScreenX',
  '_candleWidthForSpacing',
  '_resolveTfSwitchTargetCandleWidth',
  '_commitTfSwitchAnchorLock',
  '_reapplyTfSwitchAnchorLock',
  '_clearTfSwitchAnchorLock',
  '_syncZoomLevelIndexFromCandleWidth',
  '_getBarPeriodEndMs',
  '_resolveTfSwitchRightEdgeAnchorTs',
  '_captureTfSwitchViewport',
  '_restoreTfSwitchViewport',
];

const TF_MS = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '1d': 86_400_000,
};

function makeBars(tfMs, count, t0 = T0) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const c = 1.1 + i * 0.00001;
    out.push({ t: t0 + i * tfMs, o: c, h: c + 0.0001, l: c - 0.0001, c, v: 1 });
  }
  return out;
}

function makeChart(opts = {}) {
  const {
    source = CHART_SOURCE,
    tf = '1h',
    data = null,
    kill = undefined,
    mode = 'follow', // 'follow' | 'panned'
    panLeftIdx = 10,
  } = opts;

  const body = METHODS.map((n) => {
    try {
      return methodSource(source, n);
    } catch (err) {
      if (n === '_resolveTfSwitchRightEdgeAnchorTs') {
        // Pre-fix / mutant that deleted the helper: stub legacy bar-start.
        return `
    _resolveTfSwitchRightEdgeAnchorTs(bar, barIdx) {
        if (!bar || !Number.isFinite(bar.t)) return null;
        return bar.t;
    }
`;
      }
      throw err;
    }
  }).join('\n');

  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    Math, JSON, Object, Array, Number, String, Boolean, Error,
    Infinity, NaN, isNaN, Date, Map, Set,
  };
  sandbox.globalThis = sandbox;
  const win = {};
  if (kill !== undefined) win[SWITCH] = kill;
  sandbox.window = win;
  vm.createContext(sandbox);
  vm.runInContext(`
class ChartHarness {
  constructor() {
    this.margin = { l: 60, r: 60, t: 40, b: 40 };
    this.w = 1000;
    this.h = 600;
    this.candleWidth = 6;
    this.offsetX = 0;
    this.autoScale = true;
    this.priceZoom = 1;
    this.priceOffset = 0;
    this.manualCenterPrice = null;
    this.manualRange = null;
    this.priceScale = { locked: false, autoScale: true };
    this.zoomLevel = {
      candleWidthIndex: 8,
      allowedWidths: [0.1, 0.2, 0.35, 0.5, 0.75, 1, 2, 3, 5, 6, 8, 13, 21, 34, 55, 89],
    };
    this.currentTimeframe = ${JSON.stringify(tf)};
    this.data = null;
    this._tfSwitchViewport = null;
    this._tfSwitchAnchorLock = null;
    this._tfSwitchVisibleBarCount = null;
    this._pendingTfSwitchVisibleBarCount = null;
    this._chartViewRestored = false;
    this.replaySystem = null;
  }
  _getEffectiveMinCandleWidth(widths) { return widths[0]; }
  constrainOffset() { /* skip rubber-band so pinned X is measurable */ }
  _getVisibleFetchWindowFromPixels() { return null; }
  _captureReplayPlayheadMs() { return null; }
${body}
}
globalThis.__ChartHarness = ChartHarness;
`, sandbox);

  const chart = new sandbox.__ChartHarness();
  chart.data = data;
  chart.currentTimeframe = tf;
  const spacing = chart.getCandleSpacing();
  const plotW = chart.w - chart.margin.l - chart.margin.r;
  const lastIdx = Math.max(0, data.length - 1);

  if (mode === 'panned') {
    chart.offsetX = -panLeftIdx * spacing;
    chart.replaySystem = {
      isActive: true,
      userHasPanned: true,
      autoScrollEnabled: false,
      syncReplayViewportToPlayhead() { return false; },
      _isReplayPlayheadOnScreen() { return true; },
    };
  } else {
    // Follow right edge: last candle center ~85% across the plot.
    const targetScreenX = chart.margin.l + plotW * 0.85;
    chart.offsetX = targetScreenX - chart.margin.l - lastIdx * spacing - spacing / 2;
  }

  return { chart, window: win, sandbox };
}

function barsBehindAfterSwitch(fromTf, toTf, opts = {}) {
  const fromMs = TF_MS[fromTf];
  const toMs = TF_MS[toTf];
  assert.ok(fromMs && toMs, `unknown tf pair ${fromTf}->${toTf}`);

  // Enough old bars that the last bar is fully interior to a long series.
  const oldCount = fromMs >= toMs ? 48 : Math.ceil((48 * toMs) / fromMs);
  const oldBars = makeBars(fromMs, oldCount, T0);
  const { chart } = makeChart({
    source: opts.source,
    tf: fromTf,
    data: oldBars,
    kill: opts.kill,
    mode: opts.mode || 'follow',
    panLeftIdx: opts.panLeftIdx,
  });

  const spacingOld = chart.getCandleSpacing();
  const leftTsBefore = opts.mode === 'panned'
    ? chart.estimateTimestampForDataIndex(chart._getViewportBarRange().first)
    : null;
  const lastOldIdx = oldBars.length - 1;
  const anchorScreenXBefore = chart.dataIndexToPixel(lastOldIdx) + spacingOld / 2;

  chart._captureTfSwitchViewport();
  const vp = { ...chart._tfSwitchViewport };
  assert.ok(vp, 'capture must produce a viewport snapshot');

  // New TF covers the same wall-clock span through the exclusive end of the last old bar.
  const spanEnd = oldBars[lastOldIdx].t + fromMs;
  const newCount = Math.max(2, Math.floor((spanEnd - T0) / toMs));
  const newBars = makeBars(toMs, newCount, T0);
  chart.data = newBars;
  chart.currentTimeframe = toTf;
  chart._tfSwitchViewport = vp;
  const restored = chart._restoreTfSwitchViewport();
  assert.equal(restored, true, `${fromTf}->${toTf} restore must succeed`);

  const spacing = chart.getCandleSpacing();
  const lastIdx = newBars.length - 1;
  let pinnedIdx = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < newBars.length; i++) {
    const cx = chart.dataIndexToPixel(i) + spacing / 2;
    const d = Math.abs(cx - vp.anchorScreenX);
    if (d < bestDiff) {
      bestDiff = d;
      pinnedIdx = i;
    }
  }
  const barsBehind = lastIdx - pinnedIdx;
  const legacyExpected = Math.round(fromMs / toMs) - 1;

  let leftTsAfter = null;
  if (opts.mode === 'panned') {
    leftTsAfter = chart.estimateTimestampForDataIndex(chart._getViewportBarRange().first);
  }

  return {
    fromTf,
    toTf,
    barsBehind,
    legacyExpected,
    pinnedIdx,
    lastIdx,
    pinnedTs: newBars[pinnedIdx].t,
    lastTs: newBars[lastIdx].t,
    anchorTs: vp.anchorTs,
    anchorMode: vp.anchorMode,
    lastOldBarStart: oldBars[lastOldIdx].t,
    periodEndExclusive: spanEnd,
    anchorScreenXBefore,
    leftTsBefore,
    leftTsAfter,
    vp,
  };
}

// ─── Behavioural cells (order matters for mutant kills) ───────────────────

test('downshift 1H→1m: viewport lands at last fine bar (0 behind), not ~59', () => {
  const r = barsBehindAfterSwitch('1h', '1m');
  assert.equal(r.legacyExpected, 59, 'oracle: legacy jump is 59 new-TF bars');
  assert.equal(r.barsBehind, 0, `1H→1m must pin last candle; got ${r.barsBehind} behind`);
  assert.equal(r.anchorMode, 'playhead');
});

test('downshift 1H→5m: viewport lands at last fine bar (0 behind), not ~11', () => {
  const r = barsBehindAfterSwitch('1h', '5m');
  assert.equal(r.legacyExpected, 11);
  assert.equal(r.barsBehind, 0, `1H→5m must pin last candle; got ${r.barsBehind} behind`);
});

test('downshift 1H→15m: viewport lands at last fine bar (0 behind), not ~3', () => {
  const r = barsBehindAfterSwitch('1h', '15m');
  assert.equal(r.legacyExpected, 3);
  assert.equal(r.barsBehind, 0, `1H→15m must pin last candle; got ${r.barsBehind} behind`);
});

test('downshift 1D→1m: viewport lands at last fine bar (0 behind), not ~1439', () => {
  const r = barsBehindAfterSwitch('1d', '1m');
  assert.equal(r.legacyExpected, 1439);
  assert.equal(r.barsBehind, 0, `1D→1m must pin last candle; got ${r.barsBehind} behind`);
});

test('upshift 1m→1H: follow-latest stays at the right edge (no regression)', () => {
  const r = barsBehindAfterSwitch('1m', '1h');
  assert.ok(r.barsBehind <= 1, `1m→1H barsBehind=${r.barsBehind} must stay at edge`);
});

test('upshift 5m→1H: follow-latest stays at the right edge (no regression)', () => {
  const r = barsBehindAfterSwitch('5m', '1h');
  assert.ok(r.barsBehind <= 1, `5m→1H barsBehind=${r.barsBehind} must stay at edge`);
});

test('replay follow-latest (autoScroll) downshift 1H→1m pins last fine bar', () => {
  // Exercises the replay-isActive + !userOwnsViewport capture branch.
  const fromMs = TF_MS['1h'];
  const toMs = TF_MS['1m'];
  const oldBars = makeBars(fromMs, 48, T0);
  const { chart } = makeChart({ tf: '1h', data: oldBars, mode: 'follow' });
  chart.replaySystem = {
    isActive: true,
    userHasPanned: false,
    autoScrollEnabled: true,
    syncReplayViewportToPlayhead() { return false; },
    _isReplayPlayheadOnScreen() { return true; },
  };
  // Re-place last candle after attaching replay (same follow geometry).
  const spacingOld = chart.getCandleSpacing();
  const plotW = chart.w - chart.margin.l - chart.margin.r;
  const lastOldIdx = oldBars.length - 1;
  const targetScreenX = chart.margin.l + plotW * 0.85;
  chart.offsetX = targetScreenX - chart.margin.l - lastOldIdx * spacingOld - spacingOld / 2;

  chart._captureTfSwitchViewport();
  const vp = { ...chart._tfSwitchViewport };
  assert.equal(vp.anchorMode, 'playhead');
  const spanEnd = oldBars[lastOldIdx].t + fromMs;
  const newBars = makeBars(toMs, Math.floor((spanEnd - T0) / toMs), T0);
  chart.data = newBars;
  chart.currentTimeframe = '1m';
  chart._tfSwitchViewport = vp;
  assert.equal(chart._restoreTfSwitchViewport(), true);
  const spacing = chart.getCandleSpacing();
  let pinnedIdx = 0;
  let best = Infinity;
  for (let i = 0; i < newBars.length; i++) {
    const d = Math.abs(chart.dataIndexToPixel(i) + spacing / 2 - vp.anchorScreenX);
    if (d < best) { best = d; pinnedIdx = i; }
  }
  assert.equal(newBars.length - 1 - pinnedIdx, 0, 'replay follow path must not leave ~59 bars behind');
});

test('user-panned viewportLeft survives downshift 1H→1m (must NOT snap to latest)', () => {
  const r = barsBehindAfterSwitch('1h', '1m', { mode: 'panned', panLeftIdx: 12 });
  assert.equal(r.anchorMode, 'viewportLeft');
  assert.ok(Number.isFinite(r.leftTsBefore));
  assert.ok(Number.isFinite(r.leftTsAfter));
  // Left edge wall-clock must stay on the historical region (±1 new bar).
  const driftBars = Math.abs(r.leftTsAfter - r.leftTsBefore) / TF_MS['1m'];
  assert.ok(driftBars <= 1.5, `panned left drifted ${driftBars} new bars (must stay)`);
  // Must NOT collapse to the series end.
  assert.ok(r.barsBehind > 10, `panned view must remain in history; barsBehind=${r.barsBehind}`);
});

test('user-panned viewportLeft survives upshift 1m→1H (must NOT snap to latest)', () => {
  const r = barsBehindAfterSwitch('1m', '1h', { mode: 'panned', panLeftIdx: 120 });
  assert.equal(r.anchorMode, 'viewportLeft');
  const driftBars = Math.abs(r.leftTsAfter - r.leftTsBefore) / TF_MS['1h'];
  assert.ok(driftBars <= 1.5, `panned upshift left drifted ${driftBars} coarse bars`);
  assert.ok(r.barsBehind > 1, `panned upshift must remain in history; barsBehind=${r.barsBehind}`);
});

test('kill-switch ON reproduces legacy downshift jump exactly (1H→1m = 59 behind)', () => {
  const r = barsBehindAfterSwitch('1h', '1m', { kill: true });
  assert.equal(r.barsBehind, r.legacyExpected,
    `kill ON must match legacy ${r.legacyExpected}-bar jump; got ${r.barsBehind}`);
  assert.equal(r.anchorTs, r.lastOldBarStart,
    'kill ON must capture bar START, not period end');
});

test('kill-switch ON reproduces legacy downshift jump exactly (1D→1m = 1439 behind)', () => {
  const r = barsBehindAfterSwitch('1d', '1m', { kill: true });
  assert.equal(r.barsBehind, 1439);
  assert.equal(r.anchorTs, r.lastOldBarStart);
});

test('kill absent/falsy keeps fix ON (1H→1m = 0 behind)', () => {
  const a = barsBehindAfterSwitch('1h', '1m', { kill: undefined });
  const b = barsBehindAfterSwitch('1h', '1m', { kill: false });
  const c = barsBehindAfterSwitch('1h', '1m', { kill: 0 });
  assert.equal(a.barsBehind, 0);
  assert.equal(b.barsBehind, 0);
  assert.equal(c.barsBehind, 0);
});

// ─── White-box / provenance (after behavioural cells) ─────────────────────

test('helper + kill-switch present; both right-edge call sites wired', () => {
  assert.match(CHART_SOURCE, /__TALARIA_DISABLE_TF_DOWNSHIFT_ANCHOR_FIX_V1/);
  assert.match(CHART_SOURCE, /_resolveTfSwitchRightEdgeAnchorTs\s*\(/);
  const helper = methodSource(CHART_SOURCE, '_resolveTfSwitchRightEdgeAnchorTs');
  assert.match(helper, /endMs - 1/);
  assert.match(helper, /tfDownshiftAnchorFixOn/);
  const capture = methodSource(CHART_SOURCE, '_captureTfSwitchViewport');
  const calls = capture.match(/_resolveTfSwitchRightEdgeAnchorTs\(/g) || [];
  assert.equal(calls.length, 2, 'capture must call helper at replay-last and live-right sites');
  assert.doesNotMatch(capture, /anchorMode = 'viewportLeft'[\s\S]{0,200}_resolveTfSwitchRightEdgeAnchorTs/,
    'viewportLeft path must not use right-edge period-end helper');
});

test('mirrors: chart v 1.4 and homepage/public chart.js are byte-identical', () => {
  const a = fs.readFileSync(CHART_JS);
  const b = fs.readFileSync(CHART_MIRROR);
  assert.equal(sha256(a), sha256(b), 'homepage mirror must be byte-identical');
  assert.ok(a.equals(b));
});
