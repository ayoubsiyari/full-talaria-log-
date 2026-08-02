/**
 * FIX 1: multichart non-visible-panel render cadence (visibility predicate).
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/fix1-mc-background-render-cadence.test.mjs"
 *
 * FIX 1 is a PAINT-ONLY throttle. A non-visible panel still computes its whole
 * frame; only the drawing below the paint boundary in render() is suppressed.
 * Skip is decided by visibility (on-screen / non-zero layout / not display:none),
 * not by focusedPanelId. The harness below therefore runs the REAL render()
 * prologue — clearRect, calculateScales(), the adaptive margin sync and floor,
 * the _timeTicks rebuild and visible-bar resolution — up to and including the
 * boundary return, and only then substitutes a paint oracle.
 *
 * VER-07: cadence gates are verified over a WINDOW of frames, never an instant.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SWITCH = '__TALARIA_DISABLE_MC_BACKGROUND_RENDER_CADENCE_V1';

/** VER-07 window: many frames, require multi-paint continuity on every tile. */
const VER07_FRAME_WINDOW = 24;
const VER07_MIN_PAINTS = 8;

function findRoot(start) {
  let cursor = path.resolve(start);
  for (;;) {
    const chart = path.join(cursor, 'chart v 1.4', 'chart', 'chart.js');
    if (fs.existsSync(path.join(cursor, '.git')) && fs.existsSync(chart)) return cursor;
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error(`repository root not found from ${start}`);
    cursor = parent;
  }
}

const ROOT = findRoot(path.dirname(fileURLToPath(import.meta.url)));
const CANONICAL = path.join(ROOT, 'chart v 1.4', 'chart', 'chart.js');
const MIRROR = path.join(ROOT, 'homepage', 'public', 'chart', 'chart.js');
const SOURCE = fs.readFileSync(CANONICAL, 'utf8');
const MIRROR_SOURCE = fs.readFileSync(MIRROR, 'utf8');

function note(name, pass, detail = '') {
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}\n`);
}

function methodSource(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(
    `^    ${escaped}\\s*\\([^]*?(?=^    (?:async\\s+)?[A-Za-z_$][\\w$]*\\s*\\(|^})`,
    'm',
  ));
  if (!match) throw new Error(`method ${name} missing from chart.js`);
  return match[0];
}

function optionalMethodSource(text, name) {
  try {
    return methodSource(text, name);
  } catch (_e) {
    return '';
  }
}

function catchupFrameBudget(text) {
  const match = text.match(/const MC_BACKGROUND_RENDER_CATCHUP_FRAME_BUDGET = (\d+);/);
  assert.ok(match, 'MC_BACKGROUND_RENDER_CATCHUP_FRAME_BUDGET must be declared in chart.js');
  return Number(match[1]);
}

/**
 * Slice render() from its first line through the FIX 1 paint boundary return, then
 * append the paint oracle. Anchoring on the boundary comment and the NEXT `return;`
 * (rather than on the exact guard expression) keeps the slice stable when a mutant
 * neuters the guard in place, so the mutant is killed behaviourally instead of by a
 * harness parse error.
 */
function renderStateSliceWithPaintOracle(text) {
  const render = methodSource(text, 'render');
  const markerIdx = render.indexOf('FIX 1 PAINT BOUNDARY');
  assert.ok(markerIdx > 0, 'render() must carry the FIX 1 paint boundary marker');
  const returnIdx = render.indexOf('return;', markerIdx);
  assert.ok(returnIdx > markerIdx, 'the paint boundary must be followed by a suppression return');
  const cut = returnIdx + 'return;'.length;
  return `${render.slice(0, cut)}\n        this.__paintCurrentState();\n    }`;
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/** Old focus-as-background-for-life skip — the b88 defect mutant. */
function focusAsBackgroundForLifeMutant(source) {
  const start = source.indexOf('_shouldSkipMultichartBackgroundRender()');
  assert.ok(start > 0, 'skip method must exist to mutate');
  const brace = source.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = brace; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  assert.ok(end > brace, 'could not bound skip method for mutant');
  const replacement = `_shouldSkipMultichartBackgroundRender() {
        if (this._isMultichartBackgroundRenderCadenceDisabled()) return false;
        const ownId = this._getMultichartPanelId();
        if (!ownId) return false;
        const focusedId = this._getFocusedMultichartPanelId();
        if (!focusedId) return false;
        if (String(ownId) === String(focusedId)) return false;
        return this._isLiveMultichartPanelId(focusedId);
    }`;
  return source.slice(0, start) + replacement + source.slice(end + 1);
}

function makeChart({
  panelId = 'B',
  focusedPanelId = 'A',
  visible = true,
  ownSwitchOn = false,
  hostSwitchOn = false,
  ownSwitchValue = true,
  hostSwitchValue = true,
  probeThrows = false,
  livePanelIds = ['A', 'B', 'C', 'D'],
  source = SOURCE,
} = {}) {
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    URLSearchParams,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  const isHost = panelId === 'A';
  const body = [
    methodSource(source, '_isMultichartEmbedPanel'),
    methodSource(source, '_isMultichartHostPanel'),
    methodSource(source, '_getMultichartPanelId'),
    methodSource(source, '_isMultichartBackgroundRenderCadenceDisabled'),
    methodSource(source, '_getMultichartHostWindowForFocus'),
    methodSource(source, '_getFocusedMultichartPanelId'),
    methodSource(source, '_isMultichartPanelVisibleForPaint'),
    methodSource(source, '_shouldSkipMultichartBackgroundRender'),
    methodSource(source, '_isLiveMultichartPanelId'),
    methodSource(source, '_tickBarCloseCountdown'),
    methodSource(source, '_paintBarCloseCountdownRegion'),
    optionalMethodSource(source, '_installMultichartBackgroundRenderCatchupListener'),
    optionalMethodSource(source, '_installMultichartBackgroundRenderCatchupReleaseHook'),
    optionalMethodSource(source, '_releaseMultichartBackgroundRenderCatchupListener'),
    optionalMethodSource(source, '_requestMultichartBackgroundRenderCatchup'),
    optionalMethodSource(source, '_tickMultichartBackgroundRenderCatchup'),
    methodSource(source, 'getDisplaySeries'),
    methodSource(source, 'scheduleRender'),
    methodSource(source, 'animate'),
    renderStateSliceWithPaintOracle(source),
  ].filter(Boolean).join('\n\n');

  vm.runInContext(`
const MC_BACKGROUND_RENDER_CADENCE_DISABLE_SWITCH = '${SWITCH}';
const MC_BACKGROUND_RENDER_CATCHUP_FRAME_BUDGET = ${catchupFrameBudget(source)};

function makeListenerBag() {
    const map = Object.create(null);
    return {
        map,
        add(type, fn) { (map[type] || (map[type] = [])).push(fn); },
        remove(type, fn) {
            const list = map[type] || [];
            const idx = list.indexOf(fn);
            if (idx >= 0) list.splice(idx, 1);
        },
        count(type) { return (map[type] || []).length; },
        dispatch(type, event = {}) {
            for (const fn of (map[type] || []).slice()) fn(Object.assign({ type }, event));
        },
    };
}

class FakeWindow {
    constructor(name) {
        this.__name = name;
        this.location = { search: '' };
        this.parent = this;
        this.frameElement = null;
        this.__listeners = makeListenerBag();
    }
    addEventListener(type, fn) { this.__listeners.add(type, fn); }
    removeEventListener(type, fn) { this.__listeners.remove(type, fn); }
    getComputedStyle(el) {
        const style = (el && el.__style) || {};
        return {
            display: style.display == null ? 'block' : style.display,
            visibility: style.visibility == null ? 'visible' : style.visibility,
            opacity: style.opacity == null ? '1' : String(style.opacity),
        };
    }
}

const host = new FakeWindow('host');
host.__focus = '${focusedPanelId}';
// Mirrors MultichartGrid's window.__multichartGrid, including getPanelIds(), which
// is the only live-panel roster chart.js can read from either realm.
host.__panelIds = ${JSON.stringify(livePanelIds)};
host.__multichartGrid = {
    hostPanelId: 'A',
    getFocusedPanelId() { return host.__focus; },
    getPanelIds() { return host.__panelIds.slice(); },
};
host.__multichartManagerRef = { focusedPanelId: '${focusedPanelId}' };

const panel = new FakeWindow('panel');
panel.parent = host;
panel.location.search = '?panelId=${panelId}';

const frameEl = {
    __style: { display: 'block', visibility: 'visible', opacity: '1' },
    ownerDocument: { defaultView: host },
    getBoundingClientRect() {
        if (frameEl.__style.display === 'none') return { width: 0, height: 0 };
        const op = Number(frameEl.__style.opacity);
        if (Number.isFinite(op) && op <= 0) return { width: 800, height: 600 };
        return { width: 800, height: 600 };
    },
};
panel.frameElement = frameEl;

globalThis.__host = host;
globalThis.__panel = panel;
globalThis.__frameEl = frameEl;
globalThis.__visible = ${visible ? 'true' : 'false'};
globalThis.__probeThrows = ${probeThrows ? 'true' : 'false'};
globalThis.window = ${isHost ? 'host' : 'panel'};
if (${hostSwitchOn ? 'true' : 'false'}) host[MC_BACKGROUND_RENDER_CADENCE_DISABLE_SWITCH] = ${JSON.stringify(hostSwitchValue)};
if (${ownSwitchOn ? 'true' : 'false'}) globalThis.window[MC_BACKGROUND_RENDER_CADENCE_DISABLE_SWITCH] = ${JSON.stringify(ownSwitchValue)};

const __docBag = makeListenerBag();
globalThis.performance = { now: () => 1000 };
globalThis.requestAnimationFrame = function requestAnimationFrameStub(fn) {
    globalThis.__lastRaf = fn;
    return 1;
};
globalThis.document = {
    hidden: false,
    documentElement: {
        classList: { contains: (c) => ${isHost ? 'false' : "c === 'multichart-embed'"} },
    },
    addEventListener(type, fn) { __docBag.add(type, fn); },
    removeEventListener(type, fn) { __docBag.remove(type, fn); },
    __bag: __docBag,
};

class TestChart {
    constructor() {
        this.data = [
            { t: 1, o: 8, h: 10, l: 5, c: 'initial' },
            { t: 2, o: 8, h: 10, l: 5, c: 'initial' },
        ];
        this.dataPipeline = {
            buildDisplaySeries: ({ source }) => source.map((d) => Object.assign({}, d)),
        };
        this.scales = null;
        this.__scaleDomain = null;

        // Paint-side oracles.
        this.__paints = 0;
        this.__clears = 0;
        this.__stackBackgroundPaints = 0;
        this.__placeholderPaints = 0;
        this.__countdownPaints = 0;
        this.__renderedClose = null;
        // State-side oracles.
        this.__scaleCalcs = 0;
        this.__timeTickBuilds = 0;
        this.__visibleResolves = 0;
        this.__marginSyncs = 0;
        this.__marginFloors = 0;

        this.w = 800;
        this.h = 600;
        this.margin = { l: 60, r: 60, t: 20, b: 30 };
        this.canvas = {
            __style: { display: 'block', visibility: 'visible' },
            getBoundingClientRect() {
                if (globalThis.__probeThrows) throw new Error('visibility probe failure');
                if (!globalThis.__visible) return { width: 0, height: 0 };
                if (this.__style.display === 'none' || this.__style.visibility === 'hidden') {
                    return { width: 0, height: 0 };
                }
                return { width: 800, height: 600 };
            },
        };
        this.ctx = {
            clearRect: () => { this.__clears += 1; },
            fillRect: () => { this.__clears += 1; },
            fillText: () => { this.__clears += 1; },
            fillStyle: '',
            font: '',
            textAlign: '',
        };
        this.isLoading = false;
        this._timeframeSwitching = false;
        this._pairSwitchLoading = false;
        this.hasRenderedData = false;
        this._timeTicks = [];
        this._panTimeTickCache = null;
        this._idleTimeAxisKeyCached = null;
        this._cachedInteractionTimeTicks = null;
        this.chartSettings = {};
        this.frameCount = 0;
        this.lastFpsUpdate = 0;
        this.fpsUpdateInterval = 1000;

        this._mcDiag = {
            panelId: '${panelId}',
            renders: 0,
            backgroundPaintsSuppressed: 0,
        };
        this._mcBackgroundRenderDirty = false;
        this._mcBackgroundRenderCatchupListenerInstalled = false;
        this._mcBackgroundRenderCatchupHandler = null;
        this._mcBackgroundRenderCatchupListenerTarget = null;
        this._mcBackgroundRenderCatchupReleaseHandler = null;
        this._mcBackgroundRenderCatchupFrames = 0;
        this._mcRepaintAfterSurfaceReset = false;
        this.renderPending = false;

        // M20-Q2 bar-close countdown state. Primed so _tickBarCloseCountdown() takes
        // the direct region-paint path (unchanged badge geometry, text present before
        // and after) instead of falling back to a full scheduleRender().
        this.__countdownText = 'next';
        this._lastCountdownPaintedText = 'prev';
        this._countdownRegionPainted = true;
        this._m20Q2PriceLabelGeometry = { key: 'geo' };
        this._lastCountdownRender = 0;
        this.replaySystem = null;
        this.inertia = null;
        this._animateBound = () => {};
        if (typeof this._installMultichartBackgroundRenderCatchupListener === 'function') {
            this._installMultichartBackgroundRenderCatchupListener();
        }
        this.__applyVisibility(globalThis.__visible);
    }

    __applyVisibility(isVisible) {
        // Keep this.w/this.h non-zero so render() still reaches the paint-only
        // boundary and computes state; hide via canvas rect + iframe frame layout.
        globalThis.__visible = !!isVisible;
        if (!isVisible) {
            if (globalThis.__frameEl) {
                globalThis.__frameEl.__style.display = 'none';
            }
            if (this.canvas && this.canvas.__style) {
                this.canvas.__style.display = 'none';
            }
            if (${isHost ? 'true' : 'false'}) {
                // Host has no frameElement — document.hidden covers tab occlusion;
                // canvas display:none covers off-layout host tiles.
                globalThis.document.hidden = true;
            }
        } else {
            globalThis.document.hidden = false;
            if (globalThis.__frameEl) {
                globalThis.__frameEl.__style.display = 'block';
                globalThis.__frameEl.__style.visibility = 'visible';
                globalThis.__frameEl.__style.opacity = '1';
            }
            if (this.canvas && this.canvas.__style) {
                this.canvas.__style.display = 'block';
                this.canvas.__style.visibility = 'visible';
            }
        }
    }

${body}

    _shouldUseDisplayPipeline() { return true; }
    _isMultichartEmbedPanel() { return ${isHost ? 'false' : 'true'}; }
    _isChartViewPanning() { return false; }
    _isAxisZoomDragging() { return false; }
    _isInteractionFastRender() { return false; }
    _isSeparatePanelResizing() { return false; }
    _isWheelZoomBurst() { return false; }
    _isInteractionLightPaint() { return false; }
    _isTimeAxisZoomDragging() { return false; }
    _isPriceAxisZoomDragging() { return false; }
    _isReplayPlaybackRendering() { return false; }
    _shouldUseInteractionLitePaint() { return false; }
    _canBypassLoadingRenderFreeze() { return false; }
    _canBypassDataSwitchRenderFreeze() { return false; }
    _hideChartCenterLoadingDots() {}
    // FRAME-01 added \`this._frameGovShouldPaint(...)\` to the lifted animate loop. This gate
    // measures background-render cadence, so the stub always allows the paint and preserves
    // the pre-governor cadence its counts assume. The governor is covered by
    // frame-gov-v1.test.mjs; admitting it here would make paint counts wall-clock dependent.
    _frameGovShouldPaint() { return true; }
    _clearPanTimeTickCache() { this._panTimeTickCache = null; }
    _m20Q2CountdownIdleFixEnabled() { return true; }
    _getBarCloseCountdownText() { return this.__countdownText; }
    getVisibleData() { return this.data; }
    _computeCurrentPriceLabelGeometry() { return { key: 'geo' }; }
    drawCurrentPriceLabel() { this.__countdownPaints += 1; }
    _buildPanTimeTicks() { this.__timeTickBuilds += 1; return this.__ticksForData(); }
    _buildTimeTicks() { this.__timeTickBuilds += 1; return this.__ticksForData(); }
    _idleTimeAxisKey() { return 'k:' + this.data.length + ':' + this.data[this.data.length - 1].t; }
    // Mirrors the real method's contract: it enforces the axis margin floor on every
    // exit path. That is why render() does NOT need to hoist the floor itself.
    _syncAdaptivePriceAxisMargin() { this.__marginSyncs += 1; this._enforceAxisMarginFloor(); }
    _enforceAxisMarginFloor() { this.__marginFloors += 1; }
    _paintSeparatePanelStackBackground() { this.__stackBackgroundPaints += 1; }
    _paintEmptyChartPlaceholder() { this.__placeholderPaints += 1; }
    pixelToDataIndex(px) { return px === this.margin.l ? 0 : this.data.length; }
    _resolveVisibleBarsForPaint(startIdx, endIdx) {
        this.__visibleResolves += 1;
        return this.data.slice(Math.max(0, startIdx), Math.max(0, endIdx));
    }
    animateZoom() {}

    __ticksForData() {
        return this.data.map((d, i) => ({ x: this.margin.l + i, t: d.t }));
    }

    calculateScales() {
        this.__scaleCalcs += 1;
        const priceVisible = this.getDisplaySeries();
        let minPrice = Infinity;
        let maxPrice = -Infinity;
        for (const d of priceVisible) {
            minPrice = Math.min(minPrice, Number(d.l));
            maxPrice = Math.max(maxPrice, Number(d.h));
        }
        this.__scaleDomain = [minPrice, maxPrice];
        this.scales = {
            yScale: {
                domain: () => this.__scaleDomain.slice(),
            },
        };
    }

    __paintCurrentState() {
        this.__paints += 1;
        this.__renderedClose = this.data[this.data.length - 1].c;
    }
}

globalThis.__chart = new TestChart();
`, sandbox, { filename: 'fix1-render-harness.js' });

  const chart = sandbox.__chart;
  return {
    sandbox,
    host: sandbox.__host,
    panel: sandbox.__panel,
    chart,
    budget: catchupFrameBudget(source),
    focus(id) {
      sandbox.__host.__focus = id;
      sandbox.__host.__multichartManagerRef.focusedPanelId = id;
    },
    setVisible(isVisible) {
      chart.__applyVisibility(!!isVisible);
    },
    /** Drop panels from the grid roster WITHOUT touching focus — the R2 dangling id. */
    setLivePanelIds(ids) { sandbox.__host.__panelIds = ids.slice(); },
    snapshot() {
      return {
        paints: chart.__paints,
        clears: chart.__clears,
        stackBackgroundPaints: chart.__stackBackgroundPaints,
        placeholderPaints: chart.__placeholderPaints,
        countdownPaints: chart.__countdownPaints,
        renderedClose: chart.__renderedClose,
        scaleCalcs: chart.__scaleCalcs,
        timeTickBuilds: chart.__timeTickBuilds,
        visibleResolves: chart.__visibleResolves,
        marginSyncs: chart.__marginSyncs,
        marginFloors: chart.__marginFloors,
        hasRenderedData: chart.hasRenderedData,
        scaleDomain: chart.__scaleDomain ? chart.__scaleDomain.slice() : null,
        timeTickCount: Array.isArray(chart._timeTicks) ? chart._timeTicks.length : -1,
        dirty: chart._mcBackgroundRenderDirty,
        renders: chart._mcDiag.renders,
        suppressed: chart._mcDiag.backgroundPaintsSuppressed,
        catchupFrames: chart._mcBackgroundRenderCatchupFrames,
      };
    },
    render() {
      chart.render();
      return this.snapshot();
    },
    /**
     * Spend the FIRST-PAINT ESCAPE and zero the counters.
     *
     * A cold panel paints once before the throttle can engage (surface-reset /
     * boot escape). Steady-state cells must warm first.
     */
    warmFirstPaint() {
      chart.render();
      assert.equal(chart.__paints, 1, 'the first render of a cold panel must paint');
      chart.__paints = 0;
      chart.__clears = 0;
      chart.__stackBackgroundPaints = 0;
      chart.__placeholderPaints = 0;
      chart.__countdownPaints = 0;
      chart.__scaleCalcs = 0;
      chart.__timeTickBuilds = 0;
      chart.__visibleResolves = 0;
      chart.__marginSyncs = 0;
      chart.__marginFloors = 0;
      chart._mcDiag.renders = 0;
      chart._mcDiag.backgroundPaintsSuppressed = 0;
      return this.snapshot();
    },
    /** What resize() does to a panel just before it clears the backing store. */
    simulateCanvasSurfaceReset() { chart._mcRepaintAfterSurfaceReset = true; },
    tickCountdown(now) {
      chart._tickBarCloseCountdown(now);
      return this.snapshot();
    },
    setOwnSwitch(value) { sandbox.window[SWITCH] = value; },
    clearOwnSwitch() { delete sandbox.window[SWITCH]; },
    setHostSwitch(value) { sandbox.__host[SWITCH] = value; },
    clearHostSwitch() { delete sandbox.__host[SWITCH]; },
    pushClose(close, { h = 10, l = 5 } = {}) {
      chart.data.push({ t: chart.data.length + 1, o: 8, h, l, c: close });
    },
    replaceDataAndSchedule(data) {
      chart.data = data.map((d) => Object.assign({}, d));
      chart.scheduleRender();
    },
    runAnimationFrame(times = 1) {
      for (let i = 0; i < times; i += 1) chart.animate();
      return this.snapshot();
    },
    dispatchPanelFocusEvent(type = 'pointerdown') {
      sandbox.document.__bag.dispatch(type, { target: {} });
    },
    dispatchOwnWindowEvent(type, event = {}) {
      sandbox.window.__listeners.dispatch(type, event);
    },
    docListenerCount() {
      const bag = sandbox.document.__bag;
      return bag.count('pointerdown') + bag.count('mousedown') + bag.count('focusin');
    },
    windowListenerCount(type) { return sandbox.window.__listeners.count(type); },
  };
}

/**
 * VER-07 helper: four panels, focus stuck on A (none clicked), run M frames,
 * return per-panel paint counts. Must keep rising on every visible tile.
 */
function runNeverFocusedVisibleWindow(source = SOURCE, {
  frames = VER07_FRAME_WINDOW,
  visible = true,
} = {}) {
  const panels = ['A', 'B', 'C', 'D'].map((panelId) => makeChart({
    panelId,
    focusedPanelId: 'A',
    visible,
    source,
  }));
  for (const p of panels) p.warmFirstPaint();
  for (let i = 0; i < frames; i += 1) {
    for (const p of panels) {
      p.pushClose(`tick-${i}`);
      p.render();
    }
  }
  return panels.map((p) => ({
    panelId: p.chart._mcDiag.panelId,
    paints: p.chart.__paints,
    suppressed: p.chart._mcDiag.backgroundPaintsSuppressed,
  }));
}

test('FIX1: chart.js and homepage mirror are byte-identical', () => {
  const canonicalHash = sha256(SOURCE);
  const mirrorHash = sha256(MIRROR_SOURCE);
  const ok = canonicalHash === mirrorHash;
  note('FIX1-MIRROR', ok, `canonical=${canonicalHash} mirror=${mirrorHash}`);
  assert.equal(mirrorHash, canonicalHash);
});

test('FIX1: switch name stays __TALARIA_DISABLE_MC_BACKGROUND_RENDER_CADENCE_V1', () => {
  const declared = SOURCE.includes(`const MC_BACKGROUND_RENDER_CADENCE_DISABLE_SWITCH = '${SWITCH}'`);
  const visibleHelper = SOURCE.includes('_isMultichartPanelVisibleForPaint');
  const ok = declared && visibleHelper;
  note('FIX1-FLAG-UNCHANGED', ok, `declared=${declared} visibilityHelper=${visibleHelper}`);
  assert.ok(declared, 'kill-switch constant must keep the frozen name');
  assert.ok(visibleHelper, 'visibility helper must exist');
});

test('FIX1-VER07: four never-focused visible panels keep painting across a frame window', () => {
  // Binding acceptance (VER-07): cadence over a WINDOW. Four panels, focus stuck
  // on host A (none ever clicked), simulated multi-frame replay ticks. Every tile
  // must keep accumulating paints — not paint once then freeze.
  const results = runNeverFocusedVisibleWindow(SOURCE, { frames: VER07_FRAME_WINDOW, visible: true });
  const paints = results.map((r) => r.paints);
  const allRising = paints.every((n) => n >= VER07_MIN_PAINTS);
  const ok = results.length === 4 && allRising && VER07_MIN_PAINTS > 1 && VER07_FRAME_WINDOW > VER07_MIN_PAINTS;
  note('FIX1-VER07-VISIBLE-WINDOW', ok,
    `frames=${VER07_FRAME_WINDOW} minPaints=${VER07_MIN_PAINTS} paints=[${paints.join(',')}]`);
  assert.equal(results.length, 4);
  assert.ok(VER07_MIN_PAINTS > 1);
  assert.ok(VER07_FRAME_WINDOW > VER07_MIN_PAINTS);
  for (const r of results) {
    assert.ok(
      r.paints >= VER07_MIN_PAINTS,
      `panel ${r.panelId} must keep painting across the window (paints=${r.paints}, need >=${VER07_MIN_PAINTS})`,
    );
  }
});

test('FIX1-VER07-MUT: focus-as-background-for-life mutant dies on the window cell', () => {
  const mutant = focusAsBackgroundForLifeMutant(SOURCE);
  const results = runNeverFocusedVisibleWindow(mutant, { frames: VER07_FRAME_WINDOW, visible: true });
  const paints = results.map((r) => r.paints);
  const hostOk = results[0].paints >= VER07_MIN_PAINTS;
  const othersFrozen = results.slice(1).every((r) => r.paints <= 1);
  const mutantExhibitsDefect = hostOk && othersFrozen;
  note('FIX1-VER07-MUT-FOCUS-FOR-LIFE', mutantExhibitsDefect,
    `paints=[${paints.join(',')}] (mutant must freeze B/C/D after first-paint escape)`);
  assert.ok(hostOk, 'mutant still paints the focused host');
  assert.ok(othersFrozen, 'mutant must reintroduce paint-once-then-freeze on never-focused tiles');
  // The production source must NOT exhibit that defect.
  const fixed = runNeverFocusedVisibleWindow(SOURCE, { frames: VER07_FRAME_WINDOW, visible: true });
  for (const r of fixed) {
    assert.ok(r.paints >= VER07_MIN_PAINTS, `fixed panel ${r.panelId} keeps painting`);
  }
});

test('FIX1-C1: visible never-focused panels paint continuously (not first-then-freeze)', () => {
  // Replaces the retired cell that certified "first paint then suppress forever for
  // never-focused" as success — that encoded the b88 defect.
  const host = makeChart({ panelId: 'A', focusedPanelId: 'A', visible: true });
  const neverFocused = makeChart({ panelId: 'B', focusedPanelId: 'A', visible: true });

  host.warmFirstPaint();
  neverFocused.warmFirstPaint();
  const h1 = host.render();
  const b1 = neverFocused.render();
  const h2 = host.render();
  const b2 = neverFocused.render();
  const h3 = host.render();
  const b3 = neverFocused.render();

  const ok = h1.paints === 1 && b1.paints === 1
    && h2.paints === 2 && b2.paints === 2
    && h3.paints === 3 && b3.paints === 3;
  note('FIX1-C1-VISIBLE-CONTINUOUS', ok,
    `host=${h3.paints} neverFocused=${b3.paints}`);
  assert.equal(b1.paints, 1);
  assert.equal(b2.paints, 2);
  assert.equal(b3.paints, 3);
  assert.equal(h3.paints, 3);
});

test('FIX1-C1b: hidden panel suppresses; becoming visible restores continuous paint', () => {
  const panel = makeChart({ panelId: 'B', focusedPanelId: 'A', visible: false });
  panel.warmFirstPaint();
  const hidden1 = panel.render();
  const hidden2 = panel.render();
  panel.setVisible(true);
  const shown1 = panel.render();
  const shown2 = panel.render();
  const shown3 = panel.render();

  const ok = hidden1.paints === 0 && hidden2.paints === 0
    && shown1.paints === 1 && shown2.paints === 2 && shown3.paints === 3;
  note('FIX1-C1b-VISIBILITY-TRANSITION', ok,
    `hidden=${hidden2.paints} shown=${shown3.paints}`);
  assert.equal(hidden1.paints, 0);
  assert.equal(hidden2.paints, 0);
  assert.equal(shown1.paints, 1);
  assert.equal(shown3.paints, 3);
});

test('FIX1-C1c: resize surface-reset escape still repaints a hidden panel once', () => {
  const resizeIdx = SOURCE.indexOf('const sizeChanged = oldW !== nextW || oldH !== nextH;');
  const armIdx = SOURCE.indexOf('this._mcRepaintAfterSurfaceReset = true;');
  const surfaceIdx = SOURCE.indexOf('this.canvas.width = Math.max');
  const armedBeforeReset = resizeIdx > 0 && armIdx > resizeIdx && surfaceIdx > armIdx;

  const hidden = makeChart({ panelId: 'B', focusedPanelId: 'A', visible: false });
  hidden.warmFirstPaint();
  const frozen = hidden.render();
  hidden.simulateCanvasSurfaceReset();
  const afterResize = hidden.render();
  const frozenAgain = hidden.render();

  const ok = armedBeforeReset
    && frozen.paints === 0
    && afterResize.paints === 1
    && frozenAgain.paints === 1;
  note('FIX1-C1c-REPAINT-AFTER-SURFACE-RESET', ok,
    `armedBeforeReset=${armedBeforeReset} frozen=${frozen.paints} afterResize=${afterResize.paints} frozenAgain=${frozenAgain.paints}`);
  assert.ok(armedBeforeReset, 'resize() must arm the repaint escape before clearing the backing store');
  assert.equal(frozen.paints, 0);
  assert.equal(afterResize.paints, 1);
  assert.equal(frozenAgain.paints, 1);
});

test('FIX1-C1d: a throwing visibility probe fails open, so a probe failure never freezes a tile', () => {
  const panel = makeChart({ panelId: 'B', focusedPanelId: 'A', probeThrows: true });
  panel.warmFirstPaint();
  const first = panel.render();
  const second = panel.render();

  const ok = panel.chart._isMultichartPanelVisibleForPaint() === true
    && panel.chart._shouldSkipMultichartBackgroundRender() === false
    && first.paints === 1 && second.paints === 2;
  note('FIX1-C1d-PROBE-FAIL-OPEN', ok,
    `probeVisible=${panel.chart._isMultichartPanelVisibleForPaint()} paints=${second.paints}`);
  assert.equal(panel.chart._isMultichartPanelVisibleForPaint(), true,
    'probe must fail open on error');
  assert.equal(panel.chart._shouldSkipMultichartBackgroundRender(), false,
    'a probe failure must not classify a tile as background');
  assert.equal(first.paints, 1);
  assert.equal(second.paints, 2);
});

test('FIX1-C2: switch restores full-cadence paint for a hidden panel', () => {
  const visible = makeChart({ panelId: 'A', focusedPanelId: 'A', visible: true, ownSwitchOn: true });
  const hidden = makeChart({ panelId: 'B', focusedPanelId: 'A', visible: false, ownSwitchOn: true });

  visible.warmFirstPaint();
  hidden.warmFirstPaint();
  const visibleAfter = visible.render();
  const hiddenAfter = hidden.render();

  const ok = visibleAfter.paints === 1 && hiddenAfter.paints === 1;
  note('FIX1-C2', ok, `visiblePaints=${visibleAfter.paints} hiddenPaints=${hiddenAfter.paints}`);
  assert.equal(visibleAfter.paints, 1);
  assert.equal(hiddenAfter.paints, 1);
});

test('FIX1-C3: absent to true to delete round trip returns to absent baseline without reload', () => {
  const baseline = makeChart({ panelId: 'B', focusedPanelId: 'A', visible: false });
  const roundTrip = makeChart({ panelId: 'B', focusedPanelId: 'A', visible: false });

  baseline.warmFirstPaint();
  roundTrip.warmFirstPaint();
  const absentBaseline = baseline.render();
  const absentStart = roundTrip.render();
  roundTrip.setOwnSwitch(true);
  const enabled = roundTrip.render();
  roundTrip.clearOwnSwitch();
  const absentAgain = roundTrip.render();

  const ok = absentBaseline.paints === 0
    && absentStart.paints === 0
    && enabled.paints === 1
    && absentAgain.paints === 1;
  note('FIX1-C3', ok, `baseline=${absentBaseline.paints} absentStart=${absentStart.paints} true=${enabled.paints} delete=${absentAgain.paints}`);
  assert.equal(absentBaseline.paints, 0);
  assert.equal(absentStart.paints, absentBaseline.paints);
  assert.equal(enabled.paints, 1);
  assert.equal(absentAgain.paints, enabled.paints);
});

test('FIX1-C4: boot under switch true then delete reaches absent baseline', () => {
  const baseline = makeChart({ panelId: 'B', focusedPanelId: 'A', visible: false });
  const bootOn = makeChart({ panelId: 'B', focusedPanelId: 'A', visible: false, ownSwitchOn: true });

  baseline.warmFirstPaint();
  bootOn.warmFirstPaint();
  const absentBaseline = baseline.render();
  const firstPaint = bootOn.render();
  bootOn.clearOwnSwitch();
  const afterDelete = bootOn.render();

  const ok = absentBaseline.paints === 0 && firstPaint.paints === 1 && afterDelete.paints === 1;
  note('FIX1-C4', ok, `baseline=${absentBaseline.paints} bootTrue=${firstPaint.paints} delete=${afterDelete.paints}`);
  assert.equal(absentBaseline.paints, 0);
  assert.equal(firstPaint.paints, 1);
  assert.equal(afterDelete.paints, firstPaint.paints);
});

test('FIX1-C5: parent-realm switch reaches an iframe panel behaviorally', () => {
  const panel = makeChart({ panelId: 'B', focusedPanelId: 'A', visible: false, hostSwitchOn: true });

  panel.warmFirstPaint();
  const after = panel.render();

  const ok = after.paints === 1;
  note('FIX1-C5-PARENT-REALM', ok, `panelPaints=${after.paints}`);
  assert.equal(after.paints, 1);
});

test('FIX1-C6: becoming visible performs catch-up paint of current state', () => {
  const panel = makeChart({ panelId: 'B', focusedPanelId: 'A', visible: false });

  panel.warmFirstPaint();
  const skipped = panel.render();
  panel.pushClose('current');
  panel.setVisible(true);
  const caughtUp = panel.render();

  const ok = skipped.paints === 0
    && caughtUp.paints === 1
    && caughtUp.renderedClose === 'current'
    && caughtUp.dirty === false;
  note('FIX1-C6-VISIBLE-CATCHUP', ok, `paints=${caughtUp.paints} renderedClose=${caughtUp.renderedClose}`);
  assert.equal(skipped.paints, 0);
  assert.equal(caughtUp.paints, 1);
  assert.equal(caughtUp.renderedClose, 'current');
  assert.equal(caughtUp.dirty, false);
});

test('FIX1-C7: a focus event must not paint a panel that is still not visible', () => {
  const panel = makeChart({ panelId: 'B', focusedPanelId: 'A', visible: false });

  panel.warmFirstPaint();
  const skipped = panel.render();
  panel.pushClose('event-current');

  panel.dispatchPanelFocusEvent('pointerdown');
  const duringEvent = panel.snapshot();
  const stillHidden = panel.runAnimationFrame(3);
  panel.focus('B');
  const afterFocusStillHidden = panel.runAnimationFrame(1);

  panel.setVisible(true);
  const afterVisible = panel.render();

  const ok = skipped.paints === 0
    && duringEvent.paints === 0
    && stillHidden.paints === 0
    && afterFocusStillHidden.paints === 0
    && afterVisible.paints === 1
    && afterVisible.renderedClose === 'event-current';
  note('FIX1-C7-NO-PAINT-WHILE-HIDDEN', ok,
    `duringEvent=${duringEvent.paints} stillHidden=${stillHidden.paints} afterFocus=${afterFocusStillHidden.paints} afterVisible=${afterVisible.paints}`);
  assert.equal(skipped.paints, 0);
  assert.equal(duringEvent.paints, 0);
  assert.equal(stillHidden.paints, 0);
  assert.equal(afterFocusStillHidden.paints, 0);
  assert.equal(afterVisible.paints, 1);
  assert.equal(afterVisible.renderedClose, 'event-current');
});

test('FIX1-C8: skipped hidden frame invalidates display-series cache before external scale read', () => {
  const panel = makeChart({ panelId: 'B', focusedPanelId: 'A', visible: false });

  panel.warmFirstPaint();
  panel.chart.calculateScales();
  const beforeDomain = panel.chart.scales.yScale.domain();

  panel.replaceDataAndSchedule([{ t: 2, o: 90, h: 100, l: 90, c: 'new-scale' }]);
  panel.runAnimationFrame();
  panel.chart.calculateScales();
  const afterDomain = panel.chart.scales.yScale.domain();

  const ok = beforeDomain[0] === 5
    && beforeDomain[1] === 10
    && afterDomain[0] === 90
    && afterDomain[1] === 100;
  note('FIX1-C8-FRESH-SCALES-AFTER-SKIP', ok, `before=${beforeDomain.join(':')} after=${afterDomain.join(':')}`);
  assert.deepEqual(Array.from(beforeDomain), [5, 10]);
  assert.deepEqual(Array.from(afterDomain), [90, 100]);
});

test('FIX1-C9: a suppressed frame skips drawing but still computes the whole frame state', () => {
  const hidden = makeChart({ panelId: 'B', focusedPanelId: 'A', visible: false });
  const shown = makeChart({ panelId: 'B', focusedPanelId: 'A', visible: true });

  hidden.warmFirstPaint();
  shown.warmFirstPaint();
  hidden.pushClose('advanced');
  shown.pushClose('advanced');
  const suppressed = hidden.render();
  const painted = shown.render();

  const stateComputed = suppressed.scaleCalcs === 1
    && suppressed.timeTickBuilds === 1
    && suppressed.visibleResolves === 1
    && suppressed.marginSyncs === 1
    && suppressed.marginFloors === 1
    && suppressed.hasRenderedData === true
    && suppressed.timeTickCount === painted.timeTickCount;
  const drawingSkipped = suppressed.paints === 0
    && suppressed.clears === 0
    && suppressed.stackBackgroundPaints === 0
    && suppressed.placeholderPaints === 0;

  const ok = stateComputed && drawingSkipped && painted.paints === 1 && painted.clears === 1;
  note('FIX1-C9-PAINT-ONLY-THROTTLE', ok,
    `suppressed{scales=${suppressed.scaleCalcs} ticks=${suppressed.timeTickBuilds} paints=${suppressed.paints}} painted{paints=${painted.paints}}`);

  assert.equal(suppressed.scaleCalcs, 1);
  assert.equal(suppressed.timeTickBuilds, 1);
  assert.equal(suppressed.visibleResolves, 1);
  assert.equal(suppressed.marginSyncs, 1);
  assert.equal(suppressed.marginFloors, 1);
  assert.equal(suppressed.hasRenderedData, true);
  assert.equal(suppressed.timeTickCount, painted.timeTickCount);
  assert.equal(suppressed.paints, 0);
  assert.equal(suppressed.clears, 0);
  assert.equal(suppressed.stackBackgroundPaints, 0);
  assert.equal(suppressed.placeholderPaints, 0);
  assert.equal(painted.paints, 1);
  assert.equal(painted.clears, 1);
});

test('FIX1-C10: a hidden panel tracks new data across suppressed frames instead of going stale', () => {
  const hidden = makeChart({ panelId: 'B', focusedPanelId: 'A', visible: false });

  hidden.warmFirstPaint();
  const first = hidden.render();
  hidden.pushClose('advanced', { h: 100, l: 90 });
  const second = hidden.render();

  const ok = first.paints === 0
    && second.paints === 0
    && first.scaleDomain[1] === 10
    && second.scaleDomain[1] === 100
    && second.timeTickCount === 3
    && second.timeTickBuilds === 1;
  note('FIX1-C10-HIDDEN-STATE-COHERENT', ok,
    `firstDomain=${first.scaleDomain.join(':')} secondDomain=${second.scaleDomain.join(':')}`);
  assert.equal(second.paints, 0);
  assert.deepEqual(Array.from(first.scaleDomain), [5, 10]);
  assert.deepEqual(Array.from(second.scaleDomain), [5, 100]);
  assert.equal(second.timeTickCount, 3);
  assert.equal(second.timeTickBuilds, 1);
});

test('FIX1-C11: renders keeps counting every frame; suppressed frames get a separate counter', () => {
  const panel = makeChart({ panelId: 'B', focusedPanelId: 'A', visible: false });

  panel.warmFirstPaint();
  panel.render();
  panel.render();
  const afterSuppressed = panel.render();
  panel.setVisible(true);
  panel.render();
  const afterPainted = panel.render();

  const fieldsBlock = SOURCE.match(/const MC_DIAG_COUNTER_FIELDS = \[[^\]]*\]/);
  const registered = !!fieldsBlock
    && fieldsBlock[0].includes("'renders'")
    && fieldsBlock[0].includes("'backgroundPaintsSuppressed'");
  const initialised = /backgroundPaintsSuppressed: 0,/.test(SOURCE);

  const ok = afterSuppressed.renders === 3
    && afterSuppressed.suppressed === 3
    && afterPainted.renders === 5
    && afterPainted.suppressed === 3
    && afterPainted.paints === 2
    && registered
    && initialised;
  note('FIX1-C11-COUNTER-MEANING-STABLE', ok,
    `afterSuppressed{renders=${afterSuppressed.renders} suppressed=${afterSuppressed.suppressed}} afterPainted{renders=${afterPainted.renders} suppressed=${afterPainted.suppressed} paints=${afterPainted.paints}}`);
  assert.equal(afterSuppressed.renders, 3);
  assert.equal(afterSuppressed.suppressed, 3);
  assert.equal(afterPainted.renders, 5);
  assert.equal(afterPainted.suppressed, 3);
  assert.equal(afterPainted.paints, 2);
  assert.ok(registered);
  assert.ok(initialised);
});

test('FIX1-C12: pagehide on the panel own window releases all three capture listeners', () => {
  const panel = makeChart({ panelId: 'B', focusedPanelId: 'A', visible: false });

  const installed = panel.docListenerCount();
  const releaseHooks = panel.windowListenerCount('pagehide');

  panel.dispatchOwnWindowEvent('unload');
  const afterUnload = panel.docListenerCount();

  panel.dispatchOwnWindowEvent('pagehide', { persisted: true });
  const afterPersistedPagehide = panel.docListenerCount();

  panel.dispatchOwnWindowEvent('pagehide', { persisted: false });
  const afterPagehide = panel.docListenerCount();
  const releaseHooksAfter = panel.windowListenerCount('pagehide');

  const ok = installed === 3
    && releaseHooks === 1
    && afterUnload === 3
    && afterPersistedPagehide === 3
    && afterPagehide === 0
    && releaseHooksAfter === 0;
  note('FIX1-C12-LISTENER-RELEASE', ok,
    `installed=${installed} afterPagehide=${afterPagehide}`);
  assert.equal(installed, 3);
  assert.equal(releaseHooks, 1);
  assert.equal(afterUnload, 3);
  assert.equal(afterPersistedPagehide, 3);
  assert.equal(afterPagehide, 0);
  assert.equal(releaseHooksAfter, 0);
});

test('FIX1-C13-FLAG02: the catch-up listener installs unconditionally and only its effect is gated', () => {
  const bootOn = makeChart({ panelId: 'B', focusedPanelId: 'A', visible: false, ownSwitchOn: true });

  const installedUnderFlag = bootOn.docListenerCount();
  bootOn.warmFirstPaint();
  const paintedUnderFlag = bootOn.render();

  bootOn.clearOwnSwitch();
  const suppressedAfterDelete = bootOn.render();
  bootOn.pushClose('after-delete');
  bootOn.dispatchPanelFocusEvent('pointerdown');
  const stillHidden = bootOn.runAnimationFrame(1);
  bootOn.setVisible(true);
  const caughtUp = bootOn.render();

  const ok = installedUnderFlag === 3
    && paintedUnderFlag.paints === 1
    && suppressedAfterDelete.paints === 1
    && stillHidden.paints === 1
    && caughtUp.paints === 2
    && caughtUp.renderedClose === 'after-delete';
  note('FIX1-C13-FLAG02-UNCONDITIONAL-INSTALL', ok,
    `installedUnderFlag=${installedUnderFlag} underFlag=${paintedUnderFlag.paints} afterDelete=${suppressedAfterDelete.paints} caughtUp=${caughtUp.paints}`);
  assert.equal(installedUnderFlag, 3);
  assert.equal(paintedUnderFlag.paints, 1);
  assert.equal(suppressedAfterDelete.paints, 1, 'deleting the flag re-arms the throttle with no reload');
  assert.equal(stillHidden.paints, 1, 'catch-up must not paint while still not visible');
  assert.equal(caughtUp.paints, 2, 'becoming visible paints the deferred frame');
  assert.equal(caughtUp.renderedClose, 'after-delete');
});

test('FIX1-C14-FLAG: the switch reads truthy, not strictly true, in both realms', () => {
  const ownTruthyNumber = makeChart({ panelId: 'B', focusedPanelId: 'A', visible: false, ownSwitchOn: true, ownSwitchValue: 1 });
  const ownTruthyString = makeChart({ panelId: 'B', focusedPanelId: 'A', visible: false, ownSwitchOn: true, ownSwitchValue: 'yes' });
  const hostTruthyNumber = makeChart({ panelId: 'B', focusedPanelId: 'A', visible: false, hostSwitchOn: true, hostSwitchValue: 1 });
  const ownFalsyZero = makeChart({ panelId: 'B', focusedPanelId: 'A', visible: false, ownSwitchOn: true, ownSwitchValue: 0 });
  const ownFalsyFalse = makeChart({ panelId: 'B', focusedPanelId: 'A', visible: false, ownSwitchOn: true, ownSwitchValue: false });

  for (const p of [ownTruthyNumber, ownTruthyString, hostTruthyNumber, ownFalsyZero, ownFalsyFalse]) {
    p.warmFirstPaint();
  }
  const a = ownTruthyNumber.render();
  const b = ownTruthyString.render();
  const c = hostTruthyNumber.render();
  const d = ownFalsyZero.render();
  const e = ownFalsyFalse.render();

  const ok = a.paints === 1 && b.paints === 1 && c.paints === 1 && d.paints === 0 && e.paints === 0;
  note('FIX1-C14-FLAG-TRUTHY', ok,
    `own1=${a.paints} ownYes=${b.paints} host1=${c.paints} own0=${d.paints} ownFalse=${e.paints}`);
  assert.equal(a.paints, 1);
  assert.equal(b.paints, 1);
  assert.equal(c.paints, 1);
  assert.equal(d.paints, 0);
  assert.equal(e.paints, 0);
});

test('FIX1-C15: the catch-up frame budget is bounded and drains without painting while hidden', () => {
  const panel = makeChart({ panelId: 'B', focusedPanelId: 'A', visible: false });

  panel.warmFirstPaint();
  panel.render();
  panel.dispatchPanelFocusEvent('pointerdown');
  const armed = panel.snapshot();

  const drained = panel.runAnimationFrame(panel.budget + 2);

  const ok = armed.catchupFrames === panel.budget
    && drained.catchupFrames === 0
    && drained.paints === 0;
  note('FIX1-C15-BOUNDED-BUDGET', ok,
    `armed=${armed.catchupFrames} budget=${panel.budget} drained=${drained.catchupFrames} paints=${drained.paints}`);
  assert.equal(armed.catchupFrames, panel.budget);
  assert.equal(drained.catchupFrames, 0);
  assert.equal(drained.paints, 0);
});

test('FIX1-C16: dangling focus must not freeze visible panels', () => {
  // Under the visibility predicate, focus id is irrelevant for skip. Visible
  // survivors keep painting even when focusedPanelId points at a closed tile.
  const host = makeChart({ panelId: 'A', focusedPanelId: 'D', visible: true, livePanelIds: ['A', 'B', 'C', 'D'] });
  const survivor = makeChart({ panelId: 'B', focusedPanelId: 'D', visible: true, livePanelIds: ['A', 'B', 'C', 'D'] });

  host.warmFirstPaint();
  survivor.warmFirstPaint();

  const hostWhileD = host.render();
  const survivorWhileD = survivor.render();

  host.setLivePanelIds(['A', 'B', 'C']);
  survivor.setLivePanelIds(['A', 'B', 'C']);

  const hostAfter = host.render();
  const survivorAfter = survivor.render();
  const hostKeeps = host.render();
  const survivorKeeps = survivor.render();

  const ok = hostWhileD.paints === 1
    && survivorWhileD.paints === 1
    && hostAfter.paints === 2
    && survivorAfter.paints === 2
    && hostKeeps.paints === 3
    && survivorKeeps.paints === 3;
  note('FIX1-C16-DANGLING-FOCUS-VISIBLE-KEEPSPAINT', ok,
    `whileD{host=${hostWhileD.paints} B=${survivorWhileD.paints}} after{host=${hostKeeps.paints} B=${survivorKeeps.paints}}`);
  assert.equal(hostWhileD.paints, 1);
  assert.equal(survivorWhileD.paints, 1);
  assert.equal(hostKeeps.paints, 3);
  assert.equal(survivorKeeps.paints, 3);
});

test('FIX1-C17: a suppressed (hidden) host must not region-paint the bar-close countdown', () => {
  const suppressedHost = makeChart({ panelId: 'A', focusedPanelId: 'B', visible: false });
  const visibleHost = makeChart({ panelId: 'A', focusedPanelId: 'A', visible: true });

  suppressedHost.warmFirstPaint();
  visibleHost.warmFirstPaint();

  const frozen = suppressedHost.render();
  const suppressedTick = suppressedHost.tickCountdown(5000);
  const focusedTick = visibleHost.tickCountdown(5000);

  const ok = frozen.paints === 0
    && suppressedTick.countdownPaints === 0
    && focusedTick.countdownPaints === 1;
  note('FIX1-C17-COUNTDOWN-NOT-ON-FROZEN-CANVAS', ok,
    `frozenPaints=${frozen.paints} suppressedCountdown=${suppressedTick.countdownPaints} visibleCountdown=${focusedTick.countdownPaints}`);
  assert.equal(frozen.paints, 0);
  assert.equal(suppressedTick.countdownPaints, 0);
  assert.equal(focusedTick.countdownPaints, 1);
});

test('FIX1-C18: the render prologue does not hoist the axis margin floor', () => {
  const render = methodSource(SOURCE, 'render');
  const boundaryIdx = render.indexOf('FIX 1 PAINT BOUNDARY');
  const prologue = render.slice(0, boundaryIdx);
  const hoisted = /_enforceAxisMarginFloor\s*\(\s*\)/.test(prologue);

  const sync = methodSource(SOURCE, '_syncAdaptivePriceAxisMargin');
  const syncEnforcesFloor = (sync.match(/this\._enforceAxisMarginFloor\(\)/g) || []).length >= 2;

  const hidden = makeChart({ panelId: 'B', focusedPanelId: 'A', visible: false });
  hidden.warmFirstPaint();
  const suppressed = hidden.render();

  const ok = !hoisted && syncEnforcesFloor && suppressed.marginSyncs === 1 && suppressed.marginFloors === 1;
  note('FIX1-C18-NO-MARGIN-FLOOR-HOIST', ok,
    `hoistedInPrologue=${hoisted} syncExitPathsEnforcing=${syncEnforcesFloor}`);
  assert.equal(hoisted, false);
  assert.ok(syncEnforcesFloor);
  assert.equal(suppressed.marginSyncs, 1);
  assert.equal(suppressed.marginFloors, 1);
});

test('FIX1-C19: no-data, loading and TF-switch placeholders never paint a hidden panel', () => {
  function drivePlaceholderPaths(panel) {
    const chart = panel.chart;

    chart.isLoading = true;
    chart.data = [];
    panel.render();
    chart.isLoading = false;

    chart._timeframeSwitching = true;
    chart.data = [];
    panel.render();
    chart._timeframeSwitching = false;

    chart._pairSwitchLoading = true;
    chart.data = [];
    panel.render();
    chart._pairSwitchLoading = false;

    chart.data = [];
    return panel.render();
  }

  const hidden = makeChart({ panelId: 'B', focusedPanelId: 'A', visible: false });
  const shown = makeChart({ panelId: 'B', focusedPanelId: 'B', visible: true });
  hidden.warmFirstPaint();
  shown.warmFirstPaint();

  const suppressed = drivePlaceholderPaths(hidden);
  const painted = drivePlaceholderPaths(shown);

  const ok = suppressed.placeholderPaints === 0
    && suppressed.clears === 0
    && painted.placeholderPaints === 4;
  note('FIX1-C19-PLACEHOLDER-GUARDS-LIVE', ok,
    `hidden{placeholders=${suppressed.placeholderPaints}} shown{placeholders=${painted.placeholderPaints}}`);
  assert.equal(painted.placeholderPaints, 4);
  assert.equal(suppressed.placeholderPaints, 0);
  assert.equal(suppressed.clears, 0);
});
