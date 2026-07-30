/**
 * TF-DOWNSHIFT-ANCHOR — right-edge TF-switch + empty-viewport recovery.
 *
 *   cd "chart v 1.4/chart/modules"
 *   node --test --test-reporter=tap --test-concurrency=1 tf-downshift-anchor.test.mjs
 *
 * Behavioural cells ahead of white-box checks so on-disk mutants die on behaviour.
 *
 * Kill-switch: window.__TALARIA_DISABLE_TF_DOWNSHIFT_ANCHOR_FIX_V1
 *   Absent/falsy = fix ON. Truthy = byte-faithful legacy.
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
  '_tfDownshiftAnchorFixEnabled',
  '_resolveTfSwitchRightEdgeAnchorTs',
  '_captureTfSwitchViewport',
  '_restoreTfSwitchViewport',
  '_viewportHasLoadedBarsOnScreen',
  '_scheduleViewportEmptyRecovery',
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

function countDrawn(chart) {
  const spacing = chart.getCandleSpacing();
  const m = chart.margin;
  let drawn = 0;
  let skipped = 0;
  for (let i = 0; i < chart.data.length; i++) {
    const x = chart.dataIndexToPixel(i) + spacing / 2;
    if (x < m.l - 2 || x > chart.w + 2) {
      skipped += 1;
      continue;
    }
    drawn += 1;
  }
  return { drawn, skipped, barsOnScreen: chart._viewportHasLoadedBarsOnScreen() };
}

function makeChart(opts = {}) {
  const {
    source = CHART_SOURCE,
    tf = '1h',
    data = null,
    kill = undefined,
    mode = 'follow',
    panLeftIdx = 10,
    backtestReplay = false,
  } = opts;

  const body = METHODS.map((n) => {
    try {
      return methodSource(source, n);
    } catch (err) {
      if (n === '_resolveTfSwitchRightEdgeAnchorTs') {
        return `
    _resolveTfSwitchRightEdgeAnchorTs(bar) {
        if (!bar || !Number.isFinite(bar.t)) return null;
        return bar.t;
    }
`;
      }
      if (n === '_tfDownshiftAnchorFixEnabled') {
        return `
    _tfDownshiftAnchorFixEnabled() {
        try {
            if (typeof window !== 'undefined' && window.${SWITCH}) return false;
        } catch (_e) {}
        return true;
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
    performance: { now: () => Date.now() },
    requestAnimationFrame: (cb) => { sandbox.__rafQueue.push(cb); return sandbox.__rafQueue.length; },
  };
  sandbox.__rafQueue = [];
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
    this._viewportEmptyRecoverPending = false;
    this.isBacktestMode = ${backtestReplay ? 'true' : 'false'};
    this._jumpedToLatest = false;
    this.replaySystem = null;
  }
  _getEffectiveMinCandleWidth(widths) { return widths[0]; }
  constrainOffset() { /* skip rubber-band so pinned X is measurable */ }
  _getVisibleFetchWindowFromPixels() { return null; }
  _captureReplayPlayheadMs() { return null; }
  _isMultichartEmbedPanel() { return false; }
  _isOhlcVerticallyInPlot() { return true; }
  jumpToLatest() {
    const spacing = this.getCandleSpacing();
    const lastIdx = this.data.length - 1;
    const plotW = this.w - this.margin.l - this.margin.r;
    const targetX = this.margin.l + plotW * 0.85;
    this.offsetX = targetX - this.margin.l - lastIdx * spacing - spacing / 2;
    this._jumpedToLatest = true;
  }
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
    const targetScreenX = chart.margin.l + plotW * 0.85;
    chart.offsetX = targetScreenX - chart.margin.l - lastIdx * spacing - spacing / 2;
    if (backtestReplay) {
      chart.replaySystem = {
        isActive: true,
        userHasPanned: false,
        autoScrollEnabled: true,
        // Mirror production gate: lock + !forceRecenter => no-op.
        syncReplayViewportToPlayhead(ch, opts = {}) {
          if (opts.forceRecenter !== true && ch._tfSwitchAnchorLock) return false;
          const sp = ch.getCandleSpacing();
          const li = ch.data.length - 1;
          const pw = ch.w - ch.margin.l - ch.margin.r;
          const tx = ch.margin.l + pw * 0.85;
          ch.offsetX = tx - ch.margin.l - li * sp - sp / 2;
          return true;
        },
        _isReplayPlayheadOnScreen(ch) {
          const sp = ch.getCandleSpacing();
          const li = ch.data.length - 1;
          const x = ch.margin.l + li * sp + ch.offsetX + sp * 0.5;
          return x >= ch.margin.l - sp && x <= ch.w - ch.margin.r + sp;
        },
      };
    }
  }

  return { chart, window: win, sandbox };
}

function flushRaf(sandbox) {
  const q = sandbox.__rafQueue.splice(0);
  for (const cb of q) cb();
}

function barsBehindAfterSwitch(fromTf, toTf, opts = {}) {
  const fromMs = TF_MS[fromTf];
  const toMs = TF_MS[toTf];
  assert.ok(fromMs && toMs, `unknown tf pair ${fromTf}->${toTf}`);

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

  const leftTsBefore = opts.mode === 'panned'
    ? chart.estimateTimestampForDataIndex(chart._getViewportBarRange().first)
    : null;
  const lastOldIdx = oldBars.length - 1;

  chart._captureTfSwitchViewport();
  const vp = { ...chart._tfSwitchViewport };
  assert.ok(vp, 'capture must produce a viewport snapshot');

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
    anchorTs: vp.anchorTs,
    anchorMode: vp.anchorMode,
    lastOldBarStart: oldBars[lastOldIdx].t,
    leftTsBefore,
    leftTsAfter,
    drawn: countDrawn(chart).drawn,
    vp,
  };
}

/** Long 1H history → short 13-bar 1m tip; optional TF lock blocking recovery. */
function shortWindowFixture(opts = {}) {
  const fromMs = TF_MS['1h'];
  const toMs = TF_MS['1m'];
  const oldBars = makeBars(fromMs, 500, T0);
  const lastOld = oldBars[oldBars.length - 1].t;
  const tipStart = lastOld + fromMs - 13 * toMs;
  const shortBars = makeBars(toMs, 13, tipStart);
  const { chart, sandbox } = makeChart({
    source: opts.source,
    tf: '1h',
    data: oldBars,
    kill: opts.kill,
    mode: 'follow',
    backtestReplay: true,
  });
  const spacing = chart.getCandleSpacing();
  const plotW = chart.w - chart.margin.l - chart.margin.r;
  const lastIdx = oldBars.length - 1;
  chart.offsetX = plotW * 0.85 - lastIdx * spacing - spacing / 2;
  chart._captureTfSwitchViewport();
  const vp = { ...chart._tfSwitchViewport };
  chart.data = shortBars;
  chart.currentTimeframe = '1m';
  // Keep the long-series offset (stale) — the short tip is entirely off-plot.
  if (opts.installLock) {
    chart._tfSwitchAnchorLock = {
      anchorTs: lastOld,
      anchorScreenX: chart.margin.l + plotW * 0.85,
      visibleBarCount: 200,
      plotW,
      candleWidth: 6,
    };
  }
  return { chart, sandbox, vp, shortBars, lastOld };
}

// ─── Behavioural cells (order matters for mutant kills) ───────────────────

test('short dest (13 bars) + TF lock: drawn===0 until recovery; fix yields drawn>0', () => {
  const { chart, sandbox } = shortWindowFixture({ installLock: true });
  const before = countDrawn(chart);
  assert.equal(before.drawn, 0, 'oracle: all 13 candles outside viewport');
  assert.equal(before.skipped, 13);
  assert.equal(before.barsOnScreen, false);
  // Draw-path warning sites call this when drawn===0.
  chart._scheduleViewportEmptyRecovery();
  flushRaf(sandbox);
  const after = countDrawn(chart);
  assert.ok(after.drawn > 0, `recovery must draw candles; drawn=${after.drawn}`);
  assert.equal(after.barsOnScreen, true);
  assert.equal(chart._tfSwitchAnchorLock, null, 'follow-latest recovery must clear TF lock');
});

test('short dest (13 bars) + TF lock + kill ON: recovery stays drawn===0 (legacy)', () => {
  const { chart, sandbox } = shortWindowFixture({ installLock: true, kill: true });
  assert.equal(countDrawn(chart).drawn, 0);
  chart._scheduleViewportEmptyRecovery();
  flushRaf(sandbox);
  const after = countDrawn(chart);
  assert.equal(after.drawn, 0, 'kill ON must keep lock-blocked empty recovery');
  assert.ok(chart._tfSwitchAnchorLock, 'kill ON must leave TF lock in place');
});

test('short dest follow restore: drawn>0 (not blank chart)', () => {
  const fromMs = TF_MS['1h'];
  const toMs = TF_MS['1m'];
  const oldBars = makeBars(fromMs, 500, T0);
  const lastOld = oldBars[oldBars.length - 1].t;
  const tipStart = lastOld + fromMs - 13 * toMs;
  const shortBars = makeBars(toMs, 13, tipStart);
  const { chart } = makeChart({
    tf: '1h', data: oldBars, mode: 'follow', backtestReplay: true,
  });
  const spacing = chart.getCandleSpacing();
  const plotW = chart.w - chart.margin.l - chart.margin.r;
  chart.offsetX = plotW * 0.85 - (oldBars.length - 1) * spacing - spacing / 2;
  chart._captureTfSwitchViewport();
  const vp = { ...chart._tfSwitchViewport };
  chart.data = shortBars;
  chart.currentTimeframe = '1m';
  chart._tfSwitchViewport = vp;
  assert.equal(chart._restoreTfSwitchViewport(), true);
  const d = countDrawn(chart);
  assert.ok(d.drawn > 0, `short-window restore must draw; drawn=${d.drawn}`);
  assert.equal(d.skipped, 0);
});

test('downshift 1H→1m: viewport lands at last fine bar (0 behind), not ~59', () => {
  const r = barsBehindAfterSwitch('1h', '1m');
  assert.equal(r.legacyExpected, 59, 'oracle: legacy jump is 59 new-TF bars');
  assert.equal(r.barsBehind, 0, `1H→1m must pin last candle; got ${r.barsBehind} behind`);
  assert.equal(r.anchorMode, 'playhead');
  assert.ok(r.drawn > 0, 'drawn oracle must be non-zero after downshift');
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
  const fromMs = TF_MS['1h'];
  const toMs = TF_MS['1m'];
  const oldBars = makeBars(fromMs, 48, T0);
  const { chart } = makeChart({ tf: '1h', data: oldBars, mode: 'follow', backtestReplay: true });
  const spacingOld = chart.getCandleSpacing();
  const plotW = chart.w - chart.margin.l - chart.margin.r;
  const lastOldIdx = oldBars.length - 1;
  chart.offsetX = plotW * 0.85 - lastOldIdx * spacingOld - spacingOld / 2;

  chart._captureTfSwitchViewport();
  const vp = { ...chart._tfSwitchViewport };
  assert.equal(vp.anchorMode, 'playhead');
  const lastOldStart = oldBars[lastOldIdx].t;
  const spanEnd = lastOldStart + fromMs;
  // Capture-time oracle (before restore can heal via force-recenter):
  // period-end pin must be near the exclusive seam, not bar START.
  assert.ok(
    vp.anchorTs >= spanEnd - toMs,
    `replay capture anchorTs=${vp.anchorTs} must be near period end ${spanEnd}, not bar start ${lastOldStart}`,
  );
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
  assert.ok(countDrawn(chart).drawn > 0);
});

test('user-panned viewportLeft survives downshift 1H→1m (must NOT snap to latest)', () => {
  const r = barsBehindAfterSwitch('1h', '1m', { mode: 'panned', panLeftIdx: 12 });
  assert.equal(r.anchorMode, 'viewportLeft');
  assert.ok(Number.isFinite(r.leftTsBefore));
  assert.ok(Number.isFinite(r.leftTsAfter));
  const driftBars = Math.abs(r.leftTsAfter - r.leftTsBefore) / TF_MS['1m'];
  assert.ok(driftBars <= 1.5, `panned left drifted ${driftBars} new bars (must stay)`);
  assert.ok(r.barsBehind > 10, `panned view must remain in history; barsBehind=${r.barsBehind}`);
});

test('user-panned viewportLeft survives upshift 1m→1H (must NOT snap to latest)', () => {
  const r = barsBehindAfterSwitch('1m', '1h', { mode: 'panned', panLeftIdx: 120 });
  assert.equal(r.anchorMode, 'viewportLeft');
  const driftBars = Math.abs(r.leftTsAfter - r.leftTsBefore) / TF_MS['1h'];
  assert.ok(driftBars <= 1.5, `panned upshift left drifted ${driftBars} coarse bars`);
  assert.ok(r.barsBehind > 1, `panned upshift must remain in history; barsBehind=${r.barsBehind}`);
});

test('user-panned empty recovery must NOT clear lock / snap to latest', () => {
  const fromMs = TF_MS['1h'];
  const toMs = TF_MS['1m'];
  const oldBars = makeBars(fromMs, 80, T0);
  const { chart, sandbox } = makeChart({
    tf: '1h', data: oldBars, mode: 'panned', panLeftIdx: 12, backtestReplay: true,
  });
  // Force panned ownership (makeChart already set flags); park off a short tip.
  chart.replaySystem.userHasPanned = true;
  chart.replaySystem.autoScrollEnabled = false;
  const tip = makeBars(toMs, 13, oldBars[0].t);
  chart.data = tip;
  chart.currentTimeframe = '1m';
  chart.offsetX = -5000;
  chart._tfSwitchAnchorLock = {
    anchorTs: oldBars[12].t,
    anchorScreenX: 100,
    visibleBarCount: 40,
    plotW: 880,
    candleWidth: 6,
  };
  const lockBefore = chart._tfSwitchAnchorLock;
  chart._scheduleViewportEmptyRecovery();
  flushRaf(sandbox);
  assert.equal(chart._tfSwitchAnchorLock, lockBefore, 'panned recovery must not clear TF lock');
  assert.equal(chart._jumpedToLatest, false, 'panned recovery must not jumpToLatest');
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

test('helper + kill-switch + recovery gate present; right-edge sites wired', () => {
  assert.match(CHART_SOURCE, /__TALARIA_DISABLE_TF_DOWNSHIFT_ANCHOR_FIX_V1/);
  assert.match(CHART_SOURCE, /_tfDownshiftAnchorFixEnabled\s*\(/);
  assert.match(CHART_SOURCE, /_resolveTfSwitchRightEdgeAnchorTs\s*\(/);
  const helper = methodSource(CHART_SOURCE, '_resolveTfSwitchRightEdgeAnchorTs');
  assert.match(helper, /endMs - 1/);
  const recovery = methodSource(CHART_SOURCE, '_scheduleViewportEmptyRecovery');
  assert.match(recovery, /forceRecenter/);
  assert.match(recovery, /_clearTfSwitchAnchorLock/);
  const capture = methodSource(CHART_SOURCE, '_captureTfSwitchViewport');
  const calls = capture.match(/_resolveTfSwitchRightEdgeAnchorTs\(/g) || [];
  assert.equal(calls.length, 2, 'capture must call helper at replay-last and live-right sites');
  assert.match(CHART_SOURCE, /fitToView\(\)/);
  assert.match(CHART_SOURCE, /No candles drawn! All N candles are outside viewport/);
});

test('mirrors: chart v 1.4 and homepage/public chart.js are byte-identical', () => {
  const a = fs.readFileSync(CHART_JS);
  const b = fs.readFileSync(CHART_MIRROR);
  assert.equal(sha256(a), sha256(b), 'homepage mirror must be byte-identical');
  assert.ok(a.equals(b));
});
