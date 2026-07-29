/**
 * FIX 1 phase 2: multichart background-panel render cadence.
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/fix1-mc-background-render-cadence.test.mjs"
 *
 * FIX 1 is a PAINT-ONLY throttle. A background panel still computes its whole
 * frame; only the drawing below the paint boundary in render() is suppressed.
 * The harness below therefore runs the REAL render() prologue — clearRect,
 * calculateScales(), the adaptive margin sync and floor, the _timeTicks rebuild
 * and visible-bar resolution — up to and including the boundary return, and only
 * then substitutes a paint oracle. A cell that asserted on a re-implementation of
 * the prologue instead of the real one would certify nothing.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SWITCH = '__TALARIA_DISABLE_MC_BACKGROUND_RENDER_CADENCE_V1';

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

function makeChart({
  panelId = 'B',
  focusedPanelId = 'A',
  ownSwitchOn = false,
  hostSwitchOn = false,
  ownSwitchValue = true,
  hostSwitchValue = true,
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
        this.__listeners = makeListenerBag();
    }
    addEventListener(type, fn) { this.__listeners.add(type, fn); }
    removeEventListener(type, fn) { this.__listeners.remove(type, fn); }
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

globalThis.__host = host;
globalThis.__panel = panel;
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
     * Spend the FIRST-PAINT ESCAPE (R1) and zero the counters.
     *
     * Every panel — focused or not — paints once before the throttle can engage, so a
     * cell about steady-state suppression must first put the panel through that boot
     * paint, exactly as a live tile does on its first frame with data.
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

test('FIX1: chart.js and homepage mirror are byte-identical', () => {
  const canonicalHash = sha256(SOURCE);
  const mirrorHash = sha256(MIRROR_SOURCE);
  const ok = canonicalHash === mirrorHash;
  note('FIX1-MIRROR', ok, `canonical=${canonicalHash} mirror=${mirrorHash}`);
  assert.equal(mirrorHash, canonicalHash);
});

test('FIX1-C1-R1: a cold never-focused panel paints its first frame, then suppresses', () => {
  // The bug this cell exists for: `focusedPanelId` starts on the host tile and is
  // only written by a pointerdown, so B/C/D are background panels from birth. If the
  // first paint is suppressed with the rest, a 4-panel boot leaves three blank tiles
  // until the user clicks each one. THE FIRST RENDER OF A COLD PANEL MUST PAINT.
  const focused = makeChart({ panelId: 'A', focusedPanelId: 'A' });
  const background = makeChart({ panelId: 'B', focusedPanelId: 'A' });
  const hostUnfocused = makeChart({ panelId: 'A', focusedPanelId: 'B' });

  const focusedFirst = focused.render();
  const backgroundFirst = background.render();
  const hostUnfocusedFirst = hostUnfocused.render();

  const backgroundSecond = background.render();
  const backgroundThird = background.render();
  const hostUnfocusedSecond = hostUnfocused.render();

  const ok = focusedFirst.paints === 1
    && backgroundFirst.paints === 1
    && hostUnfocusedFirst.paints === 1
    && backgroundSecond.paints === 1
    && backgroundThird.paints === 1
    && backgroundThird.dirty === true
    && hostUnfocusedSecond.paints === 1
    && hostUnfocusedSecond.dirty === true;
  note('FIX1-C1-R1-FIRST-PAINT-ESCAPE', ok,
    `focusedFirst=${focusedFirst.paints} backgroundFirst=${backgroundFirst.paints} hostUnfocusedFirst=${hostUnfocusedFirst.paints} backgroundAfter3=${backgroundThird.paints} hostUnfocusedAfter2=${hostUnfocusedSecond.paints}`);
  assert.equal(focusedFirst.paints, 1, 'the focused panel paints');
  assert.equal(backgroundFirst.paints, 1, 'a cold background panel MUST paint its first frame');
  assert.equal(hostUnfocusedFirst.paints, 1, 'a cold unfocused host MUST paint its first frame');
  assert.equal(backgroundSecond.paints, 1, 'the second background frame is suppressed');
  assert.equal(backgroundThird.paints, 1, 'and every one after it');
  assert.equal(backgroundThird.dirty, true);
  assert.equal(hostUnfocusedSecond.paints, 1, 'the unfocused host suppresses after its first paint');
  assert.equal(hostUnfocusedSecond.dirty, true);
});

test('FIX1-C1b-R1: resize clears the backing store, so the next background frame repaints', () => {
  // resize() assigns canvas.width/height, which CLEARS the bitmap. A suppressed panel
  // would be left blank by exactly the same mechanism as the cold-boot bug, so the
  // escape must re-arm — and re-arm BEFORE the surface is reset, not after.
  // resize() is tab-indented, so anchor on three strings that only occur inside it.
  const resizeIdx = SOURCE.indexOf('const sizeChanged = oldW !== nextW || oldH !== nextH;');
  const armIdx = SOURCE.indexOf('this._mcRepaintAfterSurfaceReset = true;');
  const surfaceIdx = SOURCE.indexOf('this.canvas.width = Math.max');
  const armedBeforeReset = resizeIdx > 0 && armIdx > resizeIdx && surfaceIdx > armIdx;

  const background = makeChart({ panelId: 'B', focusedPanelId: 'A' });
  background.warmFirstPaint();
  const frozen = background.render();
  background.simulateCanvasSurfaceReset();
  const afterResize = background.render();
  const frozenAgain = background.render();

  const ok = armedBeforeReset
    && frozen.paints === 0
    && afterResize.paints === 1
    && frozenAgain.paints === 1;
  note('FIX1-C1b-R1-REPAINT-AFTER-SURFACE-RESET', ok,
    `armedBeforeReset=${armedBeforeReset} frozen=${frozen.paints} afterResize=${afterResize.paints} frozenAgain=${frozenAgain.paints}`);
  assert.ok(armedBeforeReset, 'resize() must arm the repaint escape before clearing the backing store');
  assert.equal(frozen.paints, 0, 'a warmed background panel is frozen');
  assert.equal(afterResize.paints, 1, 'the frame after a surface reset must repaint');
  assert.equal(frozenAgain.paints, 1, 'and exactly one frame — the escape is spent');
});

test('FIX1-C2: switch restores full-cadence paint for every panel', () => {
  const focused = makeChart({ panelId: 'A', focusedPanelId: 'A', ownSwitchOn: true });
  const background = makeChart({ panelId: 'B', focusedPanelId: 'A', ownSwitchOn: true });

  focused.warmFirstPaint();
  background.warmFirstPaint();
  const focusedAfter = focused.render();
  const backgroundAfter = background.render();

  const ok = focusedAfter.paints === 1 && backgroundAfter.paints === 1;
  note('FIX1-C2', ok, `focusedPaints=${focusedAfter.paints} backgroundPaints=${backgroundAfter.paints}`);
  assert.equal(focusedAfter.paints, 1);
  assert.equal(backgroundAfter.paints, 1);
});

test('FIX1-C3: absent to true to delete round trip returns to absent baseline without reload', () => {
  const baseline = makeChart({ panelId: 'B', focusedPanelId: 'A' });
  const roundTrip = makeChart({ panelId: 'B', focusedPanelId: 'A' });

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
  const baseline = makeChart({ panelId: 'B', focusedPanelId: 'A' });
  const bootOn = makeChart({ panelId: 'B', focusedPanelId: 'A', ownSwitchOn: true });

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
  const panel = makeChart({ panelId: 'B', focusedPanelId: 'A', hostSwitchOn: true });

  panel.warmFirstPaint();
  const after = panel.render();

  const ok = after.paints === 1;
  note('FIX1-C5-PARENT-REALM', ok, `panelPaints=${after.paints}`);
  assert.equal(after.paints, 1);
});

test('FIX1-C6: focus return performs catch-up paint of current state', () => {
  const panel = makeChart({ panelId: 'B', focusedPanelId: 'A' });

  panel.warmFirstPaint();
  const skipped = panel.render();
  panel.pushClose('current');
  panel.focus('B');
  const caughtUp = panel.render();

  const ok = skipped.paints === 0
    && caughtUp.paints === 1
    && caughtUp.renderedClose === 'current'
    && caughtUp.dirty === false;
  note('FIX1-C6-CATCHUP', ok, `paints=${caughtUp.paints} renderedClose=${caughtUp.renderedClose}`);
  assert.equal(skipped.paints, 0);
  assert.equal(caughtUp.paints, 1);
  assert.equal(caughtUp.renderedClose, 'current');
  assert.equal(caughtUp.dirty, false);
});

test('FIX1-C7-B2: a focus event must not paint a panel that is still in the background', () => {
  const panel = makeChart({ panelId: 'B', focusedPanelId: 'A' });

  panel.warmFirstPaint();
  const skipped = panel.render();
  panel.pushClose('event-current');

  // panel-cmd-bridge.js posts `panel-focus` on setTimeout(0), so during this
  // capture-phase event the parent STILL reports panel A as focused.
  panel.dispatchPanelFocusEvent('pointerdown');
  const duringEvent = panel.snapshot();

  // Frames elapse while the postMessage round trip is still in flight.
  const stillUnfocused = panel.runAnimationFrame(3);

  // Focus finally lands, and only now may the panel repaint.
  panel.focus('B');
  const afterFocusLands = panel.runAnimationFrame(1);

  const ok = skipped.paints === 0
    && duringEvent.paints === 0
    && stillUnfocused.paints === 0
    && afterFocusLands.paints === 1
    && afterFocusLands.renderedClose === 'event-current';
  note('FIX1-C7-B2-NO-PAINT-WHILE-UNFOCUSED', ok, `duringEvent=${duringEvent.paints} stillUnfocused=${stillUnfocused.paints} afterFocusLands=${afterFocusLands.paints} renderedClose=${afterFocusLands.renderedClose}`);
  assert.equal(skipped.paints, 0);
  assert.equal(duringEvent.paints, 0);
  assert.equal(stillUnfocused.paints, 0);
  assert.equal(afterFocusLands.paints, 1);
  assert.equal(afterFocusLands.renderedClose, 'event-current');
});

test('FIX1-C8: skipped background frame invalidates display-series cache before external scale read', () => {
  const panel = makeChart({ panelId: 'B', focusedPanelId: 'A' });

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

test('FIX1-C9-B1: a suppressed frame skips drawing but still computes the whole frame state', () => {
  const background = makeChart({ panelId: 'B', focusedPanelId: 'A' });
  const focused = makeChart({ panelId: 'B', focusedPanelId: 'B' });

  background.warmFirstPaint();
  focused.warmFirstPaint();
  // Advance the data on both arms so the measured frame has real work to do: the
  // idle tick cache is only rebuilt when the time-axis key moves.
  background.pushClose('advanced');
  focused.pushClose('advanced');
  const suppressed = background.render();
  const painted = focused.render();

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
  note('FIX1-C9-B1-PAINT-ONLY-THROTTLE', ok,
    `suppressed{scales=${suppressed.scaleCalcs} ticks=${suppressed.timeTickBuilds} visible=${suppressed.visibleResolves} marginSync=${suppressed.marginSyncs} marginFloor=${suppressed.marginFloors} hasRenderedData=${suppressed.hasRenderedData} tickCount=${suppressed.timeTickCount} paints=${suppressed.paints} clears=${suppressed.clears} stackBg=${suppressed.stackBackgroundPaints}} painted{paints=${painted.paints} clears=${painted.clears} tickCount=${painted.timeTickCount}}`);

  assert.equal(suppressed.scaleCalcs, 1, 'calculateScales() must still run');
  assert.equal(suppressed.timeTickBuilds, 1, '_timeTicks must still be rebuilt');
  assert.equal(suppressed.visibleResolves, 1, 'visible bars must still be resolved');
  assert.equal(suppressed.marginSyncs, 1, 'adaptive price-axis margin must still sync');
  assert.equal(suppressed.marginFloors, 1, 'axis margin floor must still be enforced');
  assert.equal(suppressed.hasRenderedData, true, 'hasRenderedData must still be set');
  assert.equal(suppressed.timeTickCount, painted.timeTickCount, 'tick state must match a painted frame');
  assert.equal(suppressed.paints, 0, 'drawing must be suppressed');
  assert.equal(suppressed.clears, 0, 'the canvas must not be cleared and left blank');
  assert.equal(suppressed.stackBackgroundPaints, 0, 'separate-panel stack background must be suppressed');
  assert.equal(suppressed.placeholderPaints, 0);
  assert.equal(painted.paints, 1);
  assert.equal(painted.clears, 1);
});

test('FIX1-C10-B1: a background panel tracks new data across suppressed frames instead of going stale', () => {
  const background = makeChart({ panelId: 'B', focusedPanelId: 'A' });

  background.warmFirstPaint();
  const first = background.render();
  background.pushClose('advanced', { h: 100, l: 90 });
  const second = background.render();

  const ok = first.paints === 0
    && second.paints === 0
    && first.scaleDomain[1] === 10
    && second.scaleDomain[1] === 100
    && second.timeTickCount === 3
    && second.timeTickBuilds === 1;
  note('FIX1-C10-B1-BACKGROUND-STATE-COHERENT', ok,
    `firstDomain=${first.scaleDomain.join(':')} secondDomain=${second.scaleDomain.join(':')} tickCount=${second.timeTickCount} tickBuilds=${second.timeTickBuilds}`);
  assert.equal(second.paints, 0, 'still no drawing');
  assert.deepEqual(Array.from(first.scaleDomain), [5, 10]);
  assert.deepEqual(Array.from(second.scaleDomain), [5, 100], 'scale domain must follow the new bar');
  assert.equal(second.timeTickCount, 3, 'time axis must advance with the data');
  assert.equal(second.timeTickBuilds, 1, 'the tick rebuild must not be skipped on the suppressed frame that saw the new bar');
});

test('FIX1-C11-B4: renders keeps counting every frame; suppressed frames get a separate counter', () => {
  const panel = makeChart({ panelId: 'B', focusedPanelId: 'A' });

  panel.warmFirstPaint();
  panel.render();
  panel.render();
  const afterSuppressed = panel.render();
  panel.focus('B');
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
  note('FIX1-C11-B4-COUNTER-MEANING-STABLE', ok,
    `afterSuppressed{renders=${afterSuppressed.renders} suppressed=${afterSuppressed.suppressed}} afterPainted{renders=${afterPainted.renders} suppressed=${afterPainted.suppressed} paints=${afterPainted.paints}} registered=${registered} initialised=${initialised}`);
  assert.equal(afterSuppressed.renders, 3, 'renders must count suppressed frames too');
  assert.equal(afterSuppressed.suppressed, 3);
  assert.equal(afterPainted.renders, 5, 'renders must keep counting every render() entry');
  assert.equal(afterPainted.suppressed, 3, 'suppressed counter must not move on painted frames');
  assert.equal(afterPainted.paints, 2);
  assert.ok(registered, 'both counters must be registered in MC_DIAG_COUNTER_FIELDS');
  assert.ok(initialised, 'backgroundPaintsSuppressed must be initialised in _ensureMcDiag');
});

test('FIX1-C12-B3: pagehide on the panel own window releases all three capture listeners', () => {
  const panel = makeChart({ panelId: 'B', focusedPanelId: 'A' });

  const installed = panel.docListenerCount();
  const releaseHooks = panel.windowListenerCount('pagehide');

  // `unload` does not fire when an iframe is removed from the DOM, so it must not
  // be the release event — if it were wired here it would never run in production.
  panel.dispatchOwnWindowEvent('unload');
  const afterUnload = panel.docListenerCount();

  // A bfcache-persisted pagehide must not tear the panel down either.
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
  note('FIX1-C12-B3-LISTENER-RELEASE', ok,
    `installed=${installed} releaseHook=${releaseHooks} afterUnload=${afterUnload} afterPersisted=${afterPersistedPagehide} afterPagehide=${afterPagehide} releaseHookAfter=${releaseHooksAfter}`);
  assert.equal(installed, 3, 'three capture listeners are installed from the constructor');
  assert.equal(releaseHooks, 1, 'a pagehide release hook must be registered on the own window');
  assert.equal(afterUnload, 3, 'unload must not be the release event');
  assert.equal(afterPersistedPagehide, 3, 'a bfcache pagehide must not release');
  assert.equal(afterPagehide, 0, 'pagehide must remove every capture listener');
  assert.equal(releaseHooksAfter, 0, 'the release hook must remove itself');
});

test('FIX1-C13-FLAG02: the catch-up listener installs unconditionally and only its effect is gated', () => {
  const bootOn = makeChart({ panelId: 'B', focusedPanelId: 'A', ownSwitchOn: true });

  const installedUnderFlag = bootOn.docListenerCount();
  bootOn.warmFirstPaint();
  const paintedUnderFlag = bootOn.render();

  bootOn.clearOwnSwitch();
  const suppressedAfterDelete = bootOn.render();
  bootOn.pushClose('after-delete');
  bootOn.dispatchPanelFocusEvent('pointerdown');
  const stillBackground = bootOn.runAnimationFrame(1);
  bootOn.focus('B');
  const caughtUp = bootOn.runAnimationFrame(1);

  const ok = installedUnderFlag === 3
    && paintedUnderFlag.paints === 1
    && suppressedAfterDelete.paints === 1
    && stillBackground.paints === 1
    && caughtUp.paints === 2
    && caughtUp.renderedClose === 'after-delete';
  note('FIX1-C13-FLAG02-UNCONDITIONAL-INSTALL', ok,
    `installedUnderFlag=${installedUnderFlag} underFlagPaints=${paintedUnderFlag.paints} afterDeletePaints=${suppressedAfterDelete.paints} stillBackground=${stillBackground.paints} caughtUp=${caughtUp.paints}`);
  assert.equal(installedUnderFlag, 3, 'listeners must install even when the kill switch is on at boot');
  assert.equal(paintedUnderFlag.paints, 1, 'the flag disables the throttle, so the panel paints');
  assert.equal(suppressedAfterDelete.paints, 1, 'deleting the flag re-arms the throttle with no reload');
  assert.equal(stillBackground.paints, 1, 'the armed catch-up must not paint while unfocused');
  assert.equal(caughtUp.paints, 2, 'the catch-up paints once focus lands');
  assert.equal(caughtUp.renderedClose, 'after-delete');
});

test('FIX1-C14-FLAG: the switch reads truthy, not strictly true, in both realms', () => {
  const ownTruthyNumber = makeChart({ panelId: 'B', focusedPanelId: 'A', ownSwitchOn: true, ownSwitchValue: 1 });
  const ownTruthyString = makeChart({ panelId: 'B', focusedPanelId: 'A', ownSwitchOn: true, ownSwitchValue: 'yes' });
  const hostTruthyNumber = makeChart({ panelId: 'B', focusedPanelId: 'A', hostSwitchOn: true, hostSwitchValue: 1 });
  const ownFalsyZero = makeChart({ panelId: 'B', focusedPanelId: 'A', ownSwitchOn: true, ownSwitchValue: 0 });
  const ownFalsyFalse = makeChart({ panelId: 'B', focusedPanelId: 'A', ownSwitchOn: true, ownSwitchValue: false });

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
  assert.equal(a.paints, 1, 'own-realm 1 must disable the throttle');
  assert.equal(b.paints, 1, "own-realm 'yes' must disable the throttle");
  assert.equal(c.paints, 1, 'parent-realm 1 must disable the throttle');
  assert.equal(d.paints, 0, 'falsy 0 must leave the throttle on');
  assert.equal(e.paints, 0, 'falsy false must leave the throttle on');
});

test('FIX1-C15-B2: the catch-up frame budget is bounded and drains without painting', () => {
  const panel = makeChart({ panelId: 'B', focusedPanelId: 'A' });

  panel.warmFirstPaint();
  panel.render();
  panel.dispatchPanelFocusEvent('pointerdown');
  const armed = panel.snapshot();

  const drained = panel.runAnimationFrame(panel.budget + 2);

  const ok = armed.catchupFrames === panel.budget
    && drained.catchupFrames === 0
    && drained.paints === 0;
  note('FIX1-C15-B2-BOUNDED-BUDGET', ok,
    `armed=${armed.catchupFrames} budget=${panel.budget} drained=${drained.catchupFrames} paints=${drained.paints}`);
  assert.equal(armed.catchupFrames, panel.budget, 'the focus event arms a bounded budget');
  assert.equal(drained.catchupFrames, 0, 'the budget must drain to zero, not spin forever');
  assert.equal(drained.paints, 0, 'a panel that never gains focus must never catch up');
});

test('FIX1-C16-R2: a focus id matching no live panel must not freeze the whole grid', () => {
  // Nothing resets focusedPanelId when the focused tile disappears (layout shrink,
  // tile close). Every surviving tile — the host included — then sees
  // ownId !== focusedId and suppresses forever, and a host-document pointerdown only
  // arms a budget that can never fire because the host is suppressed too. Recovery
  // would need a click on a tile body. A dangling focus is not a focus.
  const host = makeChart({ panelId: 'A', focusedPanelId: 'D', livePanelIds: ['A', 'B', 'C', 'D'] });
  const survivor = makeChart({ panelId: 'B', focusedPanelId: 'D', livePanelIds: ['A', 'B', 'C', 'D'] });

  host.warmFirstPaint();
  survivor.warmFirstPaint();

  const hostFrozen = host.render();
  const survivorFrozen = survivor.render();

  // Tile D closes. focusedPanelId is left pointing at it.
  host.setLivePanelIds(['A', 'B', 'C']);
  survivor.setLivePanelIds(['A', 'B', 'C']);

  const hostAfter = host.render();
  const survivorAfter = survivor.render();
  const hostKeepsPainting = host.render();
  const survivorKeepsPainting = survivor.render();

  const ok = hostFrozen.paints === 0
    && survivorFrozen.paints === 0
    && hostAfter.paints === 1
    && survivorAfter.paints === 1
    && hostKeepsPainting.paints === 2
    && survivorKeepsPainting.paints === 2;
  note('FIX1-C16-R2-DANGLING-FOCUS-UNFREEZES', ok,
    `whileDLives{host=${hostFrozen.paints} survivor=${survivorFrozen.paints}} afterDClosed{host=${hostAfter.paints} survivor=${survivorAfter.paints} hostNext=${hostKeepsPainting.paints} survivorNext=${survivorKeepsPainting.paints}}`);
  assert.equal(hostFrozen.paints, 0, 'with D alive and focused, the host is a background panel');
  assert.equal(survivorFrozen.paints, 0, 'and so is B');
  assert.equal(hostAfter.paints, 1, 'once D is gone the host must paint again');
  assert.equal(survivorAfter.paints, 1, 'and so must every surviving tile');
  assert.equal(hostKeepsPainting.paints, 2, 'and keep painting — this is not a one-frame escape');
  assert.equal(survivorKeepsPainting.paints, 2);
});

test('FIX1-C16b-R2: an unknown roster must never invent suppression', () => {
  // getPanelIds() is the only roster chart.js can read. When it is missing or empty
  // the liveness check must fall back to "live", so it can only ever UNDO suppression.
  const panel = makeChart({ panelId: 'B', focusedPanelId: 'A' });
  panel.warmFirstPaint();

  const withRoster = panel.render();
  panel.setLivePanelIds([]);
  const emptyRoster = panel.render();
  delete panel.host.__multichartGrid.getPanelIds;
  const noRoster = panel.render();

  const ok = withRoster.paints === 0 && emptyRoster.paints === 0 && noRoster.paints === 0;
  note('FIX1-C16b-R2-UNKNOWN-ROSTER-STAYS-SUPPRESSED', ok,
    `withRoster=${withRoster.paints} emptyRoster=${emptyRoster.paints} noRoster=${noRoster.paints}`);
  assert.equal(withRoster.paints, 0);
  assert.equal(emptyRoster.paints, 0, 'an empty roster is unknown, not "focus is dead"');
  assert.equal(noRoster.paints, 0, 'a grid without getPanelIds keeps the pre-R2 behaviour');
});

test('FIX1-C17-R3: a suppressed host must not region-paint the bar-close countdown', () => {
  // _tickBarCloseCountdown() early-returns for embed panels, but the HOST is not an
  // embed panel. With focus on B its render() paint is suppressed while the countdown
  // would keep driving drawCurrentPriceLabel() onto the frozen canvas.
  const suppressedHost = makeChart({ panelId: 'A', focusedPanelId: 'B' });
  const focusedHost = makeChart({ panelId: 'A', focusedPanelId: 'A' });

  suppressedHost.warmFirstPaint();
  focusedHost.warmFirstPaint();

  const frozen = suppressedHost.render();
  const suppressedTick = suppressedHost.tickCountdown(5000);
  const focusedTick = focusedHost.tickCountdown(5000);

  const ok = frozen.paints === 0
    && suppressedTick.countdownPaints === 0
    && focusedTick.countdownPaints === 1;
  note('FIX1-C17-R3-COUNTDOWN-NOT-ON-FROZEN-CANVAS', ok,
    `frozenPaints=${frozen.paints} suppressedCountdownPaints=${suppressedTick.countdownPaints} focusedCountdownPaints=${focusedTick.countdownPaints}`);
  assert.equal(frozen.paints, 0, 'the host is suppressed with focus on B');
  assert.equal(suppressedTick.countdownPaints, 0, 'the countdown must not paint onto a frozen canvas');
  assert.equal(focusedTick.countdownPaints, 1, 'a focused host still paints its countdown');
});

test('FIX1-C18-R4: the render prologue does not hoist the axis margin floor', () => {
  // _syncAdaptivePriceAxisMargin() already enforces the floor on both exit paths, so
  // an unconditional hoist is a no-op in the suppressed case and a real behaviour
  // change under skipHeavyChrome, where pre-FIX-1 single-chart never ran it. Flag-on
  // must be exactly pre-FIX-1.
  const render = methodSource(SOURCE, 'render');
  const boundaryIdx = render.indexOf('FIX 1 PAINT BOUNDARY');
  const prologue = render.slice(0, boundaryIdx);
  const hoisted = /_enforceAxisMarginFloor\s*\(\s*\)/.test(prologue);

  const sync = methodSource(SOURCE, '_syncAdaptivePriceAxisMargin');
  const syncEnforcesFloor = (sync.match(/this\._enforceAxisMarginFloor\(\)/g) || []).length >= 2;

  const background = makeChart({ panelId: 'B', focusedPanelId: 'A' });
  background.warmFirstPaint();
  const suppressed = background.render();

  const ok = !hoisted && syncEnforcesFloor && suppressed.marginSyncs === 1 && suppressed.marginFloors === 1;
  note('FIX1-C18-R4-NO-MARGIN-FLOOR-HOIST', ok,
    `hoistedInPrologue=${hoisted} syncExitPathsEnforcing=${syncEnforcesFloor} suppressed{marginSyncs=${suppressed.marginSyncs} marginFloors=${suppressed.marginFloors}}`);
  assert.equal(hoisted, false, 'render() must not call _enforceAxisMarginFloor() itself');
  assert.ok(syncEnforcesFloor, 'the floor must still be enforced on every _syncAdaptivePriceAxisMargin() exit');
  assert.equal(suppressed.marginSyncs, 1, 'a suppressed frame still syncs the adaptive margin');
  assert.equal(suppressed.marginFloors, 1, 'and still gets the floor, through the sync');
});

test('FIX1-C19-R5: no-data, loading and TF-switch placeholders never paint a background panel', () => {
  // The reviewer removed the no-data placeholder guard and nothing failed, because
  // the harness chart always had bars: `placeholderPaints === 0` was vacuous. These
  // arms actually drive each placeholder path with an empty dataset.
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

  const background = makeChart({ panelId: 'B', focusedPanelId: 'A' });
  const focused = makeChart({ panelId: 'B', focusedPanelId: 'B' });
  background.warmFirstPaint();
  focused.warmFirstPaint();

  const suppressed = drivePlaceholderPaths(background);
  const painted = drivePlaceholderPaths(focused);

  const ok = suppressed.placeholderPaints === 0
    && suppressed.clears === 0
    && painted.placeholderPaints === 4;
  note('FIX1-C19-R5-PLACEHOLDER-GUARDS-LIVE', ok,
    `background{placeholders=${suppressed.placeholderPaints} clears=${suppressed.clears}} focused{placeholders=${painted.placeholderPaints}}`);
  assert.equal(painted.placeholderPaints, 4, 'the control arm must actually reach all four placeholder paints');
  assert.equal(suppressed.placeholderPaints, 0, 'a background panel must paint no placeholder');
  assert.equal(suppressed.clears, 0, 'and must not clear its canvas on the way');
});
