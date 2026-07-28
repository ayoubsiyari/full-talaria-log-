/**
 * M21-1 Render quick wins — correction harness (runtime probes on REAL product code).
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m21-1-render-quick-wins.test.mjs"
 *
 * Evidence modes (env):
 *   M21_1_EVIDENCE=red|green|kill   → write JSON under docs/plan3/evidence/
 *   M21_1_BROWSER=1                 → also run the two-panel puppeteer oracle
 *                                     (writes W3-M21-1-<stamp>-browser-oracle.json)
 *
 * Status: FABLE-CORRECTION-20260724 — response to independent review BLOCK:
 *   D1 follower pan: snapshot baseline was taken AFTER the sync-bridge offset
 *      mutation and bursts could expire without any authoritative release →
 *      drawings 18–28 px detached with a persistent transform.
 *   D2 pan→pinch handoff performed two authoritative redraws.
 *   D3 deferred crosshair resize fired after an intervening authoritative
 *      resize and on detached/replaced canvas.
 *   D4 switch-OFF evidence was synthetic (stub functions, not product code).
 *
 * Every rt-* row below compiles the ACTUAL method source out of chart.js and
 * executes it against an instrumented fake chart/DOM environment — no
 * behavioral stubs. Switch-OFF rows toggle the real window flags through the
 * real product decision paths.
 *
 * Kill-switches (default fix ON when unset/false):
 *   __TALARIA_DISABLE_M21_1_CSS_PAN_TRANSFORM_V1
 *   __TALARIA_DISABLE_M21_1_DESYNCHRONIZED_MAIN_CANVAS_V1
 *   __TALARIA_DISABLE_M21_1_CROSSHAIR_RESIZE_CHURN_V1
 *
 * W6 ownership: this harness + M21-1 chart.js hunks are W3-owned.
 * W6 must not edit these contracts / kill-switch names / hunk IDs.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Walk up from this file until the repo root (docs/plan3 present). */
function findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 10; i += 1) {
    if (fs.existsSync(path.join(dir, 'docs', 'plan3'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error('repo root (docs/plan3) not found above ' + start);
}

const REPO_ROOT = findRepoRoot(__dirname);
const CHART_ROOT = path.join(REPO_ROOT, 'chart v 1.4', 'chart');
const HOMEPAGE_CHART = path.join(REPO_ROOT, 'homepage', 'public', 'chart');
const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs', 'plan3', 'evidence');

const KS_CSS = '__TALARIA_DISABLE_M21_1_CSS_PAN_TRANSFORM_V1';
const KS_DESYNC = '__TALARIA_DISABLE_M21_1_DESYNCHRONIZED_MAIN_CANVAS_V1';
const KS_RESIZE = '__TALARIA_DISABLE_M21_1_CROSSHAIR_RESIZE_CHURN_V1';

const evidenceMode = String(process.env.M21_1_EVIDENCE || '').toLowerCase();
const browserMode = process.env.M21_1_BROWSER === '1';
const evidenceRows = [];

function note(fixId, name, pass, detail = '') {
  evidenceRows.push({ q: fixId, name, pass: !!pass, detail });
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} [${fixId}] ${name}${detail ? ` — ${detail}` : ''}\n`);
}

function read(relFromChart) {
  return fs.readFileSync(path.join(CHART_ROOT, relFromChart), 'utf8');
}

function readHome(rel) {
  return fs.readFileSync(path.join(HOMEPAGE_CHART, rel), 'utf8');
}

function sha256(absPath) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(absPath)).digest('hex');
  } catch {
    return null;
  }
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let n = 0;
  let i = 0;
  while ((i = haystack.indexOf(needle, i)) !== -1) {
    n += 1;
    i += needle.length;
  }
  return n;
}

// ─── source extraction engine (real product code, no stubs) ────────────────

/**
 * Return the index just past the brace that closes the block opened by the
 * first '{' at/after startIdx. String/template/comment aware (no regex
 * literals in the extracted methods; compile failures surface as row FAILs).
 */
function scanBalanced(src, startIdx) {
  const open = src.indexOf('{', startIdx);
  if (open < 0) return -1;
  const stack = []; // 'brace' | 'tpl'
  let i = open;
  let mode = null; // null | "'" | '"' | '`' | '//' | '/*'
  while (i < src.length) {
    const c = src[i];
    const c2 = src.slice(i, i + 2);
    if (mode === null) {
      if (c === '{') stack.push('brace');
      else if (c === '}') {
        const top = stack.pop();
        if (top === 'tpl') mode = '`';
        else if (stack.length === 0) return i + 1;
      } else if (c === "'" || c === '"' || c === '`') mode = c;
      else if (c2 === '//') { mode = '//'; i += 1; }
      else if (c2 === '/*') { mode = '/*'; i += 1; }
    } else if (mode === "'" || mode === '"') {
      if (c === '\\') i += 1;
      else if (c === mode || c === '\n') mode = null;
    } else if (mode === '`') {
      if (c === '\\') i += 1;
      else if (c2 === '${') { stack.push('tpl'); mode = null; i += 1; }
      else if (c === '`') mode = null;
    } else if (mode === '//') {
      if (c === '\n') mode = null;
    } else if (mode === '/*') {
      if (c2 === '*/') { mode = null; i += 1; }
    }
    i += 1;
  }
  return -1;
}

/** Extract `name(args) { body }` for a class method (definition, not call site). */
function extractMethod(src, name) {
  const re = new RegExp(`(^|\\n)[ \\t]*${name}\\s*\\(([^)]*)\\)\\s*\\{`);
  const m = src.match(re);
  if (!m || m.index == null) return null;
  const defStart = m.index + m[1].length;
  const end = scanBalanced(src, src.indexOf('{', defStart));
  if (end < 0) return null;
  return src.slice(defStart, end);
}

const INJECTION_KEYS = ['window', 'performance', 'requestAnimationFrame',
  'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'document', 'd3'];

/** Compile an extracted method into a callable function bound at call time. */
function compileMethod(src, name, env) {
  const code = extractMethod(src, name);
  if (!code) return null;
  try {
    const factory = new Function(...INJECTION_KEYS, `return function ${code};`);
    return factory(...INJECTION_KEYS.map((k) => env[k]));
  } catch (e) {
    return null;
  }
}

/** Compile a raw statement snippet as a function body with extra params. */
function compileSnippet(snippet, env, params = []) {
  try {
    const factory = new Function(...INJECTION_KEYS,
      `return function (${params.join(', ')}) {\n${snippet}\n};`);
    return factory(...INJECTION_KEYS.map((k) => env[k]));
  } catch (e) {
    return null;
  }
}

// ─── deterministic fake environment ─────────────────────────────────────────

function makeEnv(flags = {}) {
  let now = 10_000;
  const rafQueue = new Map();
  let rafSeq = 0;
  const timers = new Map();
  let timerSeq = 0;
  const env = {
    window: { ...flags },
    performance: { now: () => now },
    requestAnimationFrame: (cb) => { rafSeq += 1; rafQueue.set(rafSeq, cb); return rafSeq; },
    cancelAnimationFrame: (id) => { rafQueue.delete(id); },
    setTimeout: (cb, ms) => { timerSeq += 1; timers.set(timerSeq, { cb, at: now + (Number(ms) || 0) }); return timerSeq; },
    clearTimeout: (id) => { timers.delete(id); },
    document: undefined,
    d3: undefined,
    nowMs: () => now,
    /** Advance fake time, firing due timers in order. */
    advance(ms) {
      const target = now + ms;
      for (;;) {
        let nextId = null;
        let nextAt = Infinity;
        for (const [id, t] of timers) {
          if (t.at <= target && t.at < nextAt) { nextAt = t.at; nextId = id; }
        }
        if (nextId == null) break;
        const t = timers.get(nextId);
        timers.delete(nextId);
        now = Math.max(now, t.at);
        t.cb();
      }
      now = target;
    },
    flushRaf() {
      const q = [...rafQueue.entries()];
      rafQueue.clear();
      for (const [, cb] of q) cb(now);
      return q.length;
    },
    pendingRaf: () => rafQueue.size,
    pendingTimers: () => timers.size,
  };
  return env;
}

function makeSelection() {
  const s = {
    _t: undefined,
    empty: () => false,
    attr(nameArg, v) {
      if (arguments.length === 1) return s._t;
      if (nameArg === 'transform') s._t = v;
      return s;
    },
  };
  return s;
}

const CHART_METHODS = [
  '_armPanSyncFollowBurst',
  '_armPanSyncFollowBurstExpiryGuard',
  '_releasePanSyncFollowBurst',
  '_isPanSyncFollowBurst',
  '_isChartViewPanning',
  '_m211CssPanTransformFixEnabled',
  '_m211DesynchronizedMainCanvasFixEnabled',
  '_m211CrosshairResizeChurnFixEnabled',
  '_m211CssPanTransformApplicable',
  '_panSnapDataWindowStable',
  '_applyPanDrawingsLayerTransform',
  '_clearPanDrawingsLayerTransform',
  '_finishPanDrawingRedraw',
  'redrawDrawings',
  '_cancelOneFingerForPinch',
  '_scheduleDeferredLayoutResize',
  '_invalidateDeferredLayoutResize',
];

/** Fake chart wired with the REAL compiled product methods. */
function makeFakeChart(src, env) {
  const counters = {
    redrawAll: 0, forceFull: 0, finalize: 0, resize: 0,
    paintedAtOffsetX: null, paintedAtPriceOffset: null,
  };
  const panLayer = makeSelection();
  const dm = {
    drawingsPanLayer: panLayer,
    drawingsGroup: makeSelection(),
    labelsGroup: makeSelection(),
    tempGroup: makeSelection(),
    drawings: [],
    _ensureDrawingsPanLayer() {},
    _clearDrawingGroupPanTransforms() {},
    setDrawingsClipDuringChartPan() {},
    patchDrawingsDuringChartPan() {},
    prepareDrawingsForChartPan() {},
    finalizeDrawingsAfterChartPan() { counters.finalize += 1; },
    _releaseTouchGestureOwnership() {},
    redrawAll(opts) {
      counters.redrawAll += 1;
      if (opts && opts.forceFull) counters.forceFull += 1;
      counters.paintedAtOffsetX = chart.offsetX;
      counters.paintedAtPriceOffset = chart.priceOffset;
    },
  };
  const yScale = (v) => v;
  yScale.domain = () => [0, 100];
  const chart = {
    counters,
    panLayer,
    offsetX: 0,
    priceOffset: 0,
    priceZoom: 1,
    candleWidth: 10,
    data: [{ t: 1000 }, { t: 2000 }, { t: 3000 }],
    h: 400,
    w: 800,
    margin: { t: 10, b: 20, l: 0, r: 0 },
    yScale,
    xScale: (v) => v,
    drawingManager: dm,
    drag: null,
    movement: {},
    inertia: null,
    replaySystem: null,
    dataPipeline: null,
    compareOverlay: null,
    _pinchActive: false,
    _touchGesture: null,
    _wheelBurstUntil: 0,
    _clearTouchLongPress() {},
    _cancelChartPanFrame() {},
    _stopChartPanRenderLoop() {},
    _removeDragEndGuard() {},
    _releaseDragPointerCapture() {},
    _releaseDragCursor() {},
    _clearAxisHighlightPanTransform() {},
    _applyAxisHighlightPanTransform() {},
    _setChartPanDomOverflow() {},
    _clearPanTimeTickCache() {},
    _seedPanTimeTickCache() {},
    _flushMultichartPendingMasterResample() {},
    _syncIndicatorsAfterMultichartDataShare() {},
    _isReplayPlaybackRendering: () => false,
    _isAxisZoomDragging: () => false,
    _m19hTimeframeCoalesceEnabled: () => false,
    _multichartPendingMasterResample: false,
  };
  const missing = [];
  for (const name of CHART_METHODS) {
    const fn = compileMethod(src, name, env);
    if (fn) chart[name] = fn;
    else missing.push(name);
  }
  chart.__missingMethods = missing;
  return chart;
}

function parseTranslateX(t) {
  if (t == null) return null;
  const m = /translate\(\s*(-?[\d.]+)/.exec(String(t));
  return m ? Number(m[1]) : null;
}

const chartSrc = read('chart.js');
const homeSrc = readHome('chart.js');

// ─── static contracts (kept from the signed scaffold — still binding) ──────

function mainCanvasGetContextIsPlain(src) {
  return /this\.ctx\s*=\s*this\.canvas\.getContext\(\s*['"]2d['"]\s*\)\s*;/.test(src);
}

function mainCanvasGetContextHasDesync(src) {
  const idx = src.search(/this\.ctx\s*=\s*this\.canvas\.getContext\s*\(/);
  if (idx < 0) return false;
  return /desynchronized\s*:\s*true/.test(src.slice(idx, idx + 320));
}

function cssTransformCallSites(src) {
  const total = countOccurrences(src, '_applyPanDrawingsLayerTransform(');
  const defOnly = /_applyPanDrawingsLayerTransform\s*\(\s*\)\s*\{/.test(src) ? 1 : 0;
  return { total, defOnly, calls: Math.max(0, total - defOnly) };
}

function interactionFastClearsThenRedraws(src) {
  const i = src.indexOf('// Fast path while panning, wheel-zooming, or axis-dragging');
  const block = i >= 0 ? src.slice(i, i + 4500) : '';
  return {
    clears: block.includes('_clearPanDrawingsLayerTransform(false)'),
    redraws: /this\.redrawDrawings\s*\(/.test(block),
    applies: /_applyPanDrawingsLayerTransform\s*\(/.test(block),
  };
}

test('M21-1a: CSS pan-transform wiring + kill-switch fallback retained (static)', () => {
  const hasKill = chartSrc.includes(KS_CSS) && homeSrc.includes(KS_CSS);
  const hasHelper = /_m211CssPanTransformFixEnabled\s*\(/.test(chartSrc)
    && /_m211CssPanTransformFixEnabled\s*\(/.test(homeSrc);
  const sites = cssTransformCallSites(chartSrc);
  const fast = interactionFastClearsThenRedraws(chartSrc);
  const wired = sites.calls >= 1 && fast.applies === true;
  const killFallbackRetained = wired && fast.clears && fast.redraws;

  note('M21-1a', 'kill-switch-present', hasKill, KS_CSS);
  note('M21-1a', 'enable-helper-present', hasHelper);
  note('M21-1a', 'transform-invoked-from-pan-path', wired,
    `calls=${sites.calls} appliesInFast=${fast.applies}`);
  note('M21-1a', 'legacy-redrawAll-every-pan-frame', killFallbackRetained,
    killFallbackRetained ? 'fix wired; kill-switch clear+redraw fallback retained'
      : 'legacy clear+redraw fallback missing');
  note('M21-1a', 'homepage-mirror-parity',
    sha256(path.join(CHART_ROOT, 'chart.js')) === sha256(path.join(HOMEPAGE_CHART, 'chart.js')),
    'byte-identical trees');

  assert.equal(hasKill, true);
  assert.equal(hasHelper, true);
  assert.equal(wired, true);
  assert.equal(killFallbackRetained, true);
});

test('M21-1 correction: static shape of the three reviewed defect fixes', () => {
  const arm = extractMethod(chartSrc, '_armPanSyncFollowBurst') || '';
  const release = extractMethod(chartSrc, '_releasePanSyncFollowBurst') || '';
  const pinch = extractMethod(chartSrc, '_cancelOneFingerForPinch') || '';
  const sched = extractMethod(chartSrc, '_scheduleDeferredLayoutResize') || '';
  const resizeBody = extractMethod(chartSrc, 'resize') || '';

  // D1: follower snapshot must come from the pre-mutation glue baseline and the
  // burst must arm an authoritative expiry release.
  const armUsesGlueBaseline = arm.includes('_drawingsGlueOffsetX');
  const armSchedulesExpiry = arm.includes('_armPanSyncFollowBurstExpiryGuard(');
  const releaseClearsGuard = release.includes('_panSyncBurstExpiryTimer');
  // D2: exactly one authoritative redraw in the pan→pinch handoff.
  const pinchRedraws = countOccurrences(pinch, '_finishPanDrawingRedraw(');
  // D3: deferred resize must be generation-invalidated by authoritative resize
  // and skip on detach/teardown.
  const schedHasGen = sched.includes('_deferredLayoutResizeGen');
  const schedChecksDetach = sched.includes('isConnected') && sched.includes('parentElement');
  const resizeInvalidates = resizeBody.includes('_invalidateDeferredLayoutResize(');

  note('M21-1a', 'follower-arm-uses-pre-mutation-glue-baseline', armUsesGlueBaseline);
  note('M21-1a', 'follower-arm-schedules-expiry-guard', armSchedulesExpiry);
  note('M21-1a', 'follower-release-clears-expiry-guard', releaseClearsGuard);
  note('M21-1a', 'pinch-handoff-single-authoritative-redraw-shape', pinchRedraws === 1,
    `finishPanDrawingRedraw occurrences=${pinchRedraws} (must be exactly 1)`);
  note('M21-1c', 'deferred-resize-generation-guard', schedHasGen);
  note('M21-1c', 'deferred-resize-detach-guard', schedChecksDetach);
  note('M21-1c', 'authoritative-resize-invalidates-deferred', resizeInvalidates);

  assert.equal(armUsesGlueBaseline, true, 'D1: arm snapshots post-mutation offsetX');
  assert.equal(armSchedulesExpiry, true, 'D1: no authoritative burst-expiry release');
  assert.equal(releaseClearsGuard, true, 'D1: release leaks expiry guard timer');
  assert.equal(pinchRedraws, 1, 'D2: pan→pinch must redraw exactly once');
  assert.equal(schedHasGen, true, 'D3: deferred resize not stale-safe');
  assert.equal(schedChecksDetach, true, 'D3: deferred resize not detach-safe');
  assert.equal(resizeInvalidates, true, 'D3: resize() must invalidate queued deferred resize');
});

// ─── D1 runtime probes: follower pan (real product methods) ────────────────

test('M21-1a runtime: follower burst baseline + expiry release (D1)', () => {
  const env = makeEnv();
  const chart = makeFakeChart(chartSrc, env);
  note('M21-1a', 'rt-methods-compiled',
    chart.__missingMethods.filter((m) => !['_armPanSyncFollowBurstExpiryGuard', '_invalidateDeferredLayoutResize'].includes(m)).length === 0,
    chart.__missingMethods.length ? `missing: ${chart.__missingMethods.join(',')}` : 'all compiled');

  // Idle paint: drawings glued at offsetX = 500.
  chart.offsetX = 500;
  chart.redrawDrawings();
  assert.equal(chart.counters.paintedAtOffsetX, 500);

  // Sync-bridge follower message order (the real product order): offsetX is
  // mutated FIRST, then the burst is armed, then a follow render runs.
  chart.offsetX = 524; // +24 px leader delta (review measured 18–28 px detach)
  chart._armPanSyncFollowBurst();
  const applicable = chart._m211CssPanTransformApplicable(true, false, false, false);
  if (applicable) chart._applyPanDrawingsLayerTransform();
  const tx1 = parseTranslateX(chart.panLayer._t);
  const expectedDx1 = chart.offsetX - chart.counters.paintedAtOffsetX;
  const detach1 = tx1 == null ? Math.abs(expectedDx1) : Math.abs(expectedDx1 - tx1);

  // Second message in the same burst.
  chart.offsetX = 548;
  chart._armPanSyncFollowBurst();
  if (chart._m211CssPanTransformApplicable(true, false, false, false)) {
    chart._applyPanDrawingsLayerTransform();
  }
  const tx2 = parseTranslateX(chart.panLayer._t);
  const expectedDx2 = chart.offsetX - chart.counters.paintedAtOffsetX;
  const detach2 = tx2 == null ? Math.abs(expectedDx2) : Math.abs(expectedDx2 - tx2);

  note('M21-1a', 'rt-tal01585-follower-pan-cell',
    applicable && detach1 <= 1 && detach2 <= 1,
    `detach msg1=${detach1}px msg2=${detach2}px (limit 1px; blocked build detaches by first-message delta)`);

  // Burst expiry with NO further messages and NO settle release from the
  // bridge: the transform must be authoritatively cleared with exactly one
  // full-quality redraw, and the snap dropped.
  const forceFullBefore = chart.counters.forceFull;
  env.advance(400); // burst window is 140 ms; expiry guard must have fired
  const expiredTransform = chart.panLayer._t;
  const releasedOnce = (chart.counters.forceFull - forceFullBefore) === 1;
  const flagCleared = !chart._panDrawingsXformApplied;
  const snapDropped = chart._panSnapOffsetX == null;
  note('M21-1a', 'rt-tal01585-follower-expiry-cell',
    (expiredTransform == null) && releasedOnce && flagCleared && snapDropped,
    `transformAfter=${JSON.stringify(expiredTransform)} redraws=${chart.counters.forceFull - forceFullBefore} `
    + `xformFlag=${!!chart._panDrawingsXformApplied} snapDropped=${snapDropped}`);

  // Release must be idempotent: a late bridge settle release adds no redraw.
  const forceFullAfter = chart.counters.forceFull;
  chart._releasePanSyncFollowBurst();
  note('M21-1a', 'rt-follower-release-idempotent-single-redraw',
    chart.counters.forceFull === forceFullAfter,
    `extraRedraws=${chart.counters.forceFull - forceFullAfter}`);

  assert.equal(applicable, true, 'transform path must engage for pure follower pan');
  assert.ok(detach1 <= 1 && detach2 <= 1,
    `D1 RED: follower drawings detached ${detach1}px/${detach2}px (baseline snapshotted after mutation)`);
  assert.equal(expiredTransform == null, true, 'D1 RED: transform persisted after burst expiry');
  assert.equal(releasedOnce, true, 'D1: expiry must perform exactly one authoritative redraw');
  assert.equal(flagCleared, true);
  assert.equal(chart.counters.forceFull, forceFullAfter, 'release must be idempotent');
});

test('M21-1a runtime: local pan, history-prepend and spinner cells (TAL-01585)', () => {
  const env = makeEnv();
  const chart = makeFakeChart(chartSrc, env);

  // Local pan cell: snapshot at pan start (pre-move), transform tracks dx 1:1,
  // pan end clears with one authoritative redraw.
  chart.offsetX = 300;
  chart.redrawDrawings();
  chart._panSnapOffsetX = chart.offsetX; // local pan-start snapshot (mousedown, pre-move)
  chart._panSnapPriceOffset = chart.priceOffset;
  chart._panSnapPriceZoom = chart.priceZoom;
  chart._panSnapFirstBarT = chart.data[0].t;
  chart._panSnapCandleWidth = chart.candleWidth;
  chart.offsetX = 340; // drag +40
  const localApplicable = chart._m211CssPanTransformApplicable(true, false, false, false);
  if (localApplicable) chart._applyPanDrawingsLayerTransform();
  const localTx = parseTranslateX(chart.panLayer._t);
  const localDetach = localTx == null ? 40 : Math.abs(40 - localTx);
  const ffBefore = chart.counters.forceFull;
  chart._clearPanDrawingsLayerTransform(false); // pan-end prologue
  chart._finishPanDrawingRedraw();
  const localEndOk = chart.panLayer._t == null && !chart._panDrawingsXformApplied
    && (chart.counters.forceFull - ffBefore) === 1;
  note('M21-1a', 'rt-tal01585-local-pan-cell', localApplicable && localDetach <= 1 && localEndOk,
    `detach=${localDetach}px endRedraws=${chart.counters.forceFull - ffBefore}`);

  // History-prepend cell: shifted data window must force the legacy fallback.
  chart._panSnapOffsetX = chart.offsetX;
  chart._panSnapFirstBarT = chart.data[0].t;
  chart.data.unshift({ t: 500 }); // lazy history prepend mid-pan
  const prependApplicable = chart._m211CssPanTransformApplicable(true, false, false, false);
  note('M21-1a', 'rt-tal01585-history-prepend-fallback-cell', prependApplicable === false,
    `applicableAfterPrepend=${prependApplicable} (must fall back to clear+redraw)`);

  // Spinner/TF-commit cell: a live translate across TF commit must clear with
  // exactly one authoritative redraw (the H3 prologue executed on real methods).
  chart.data.shift();
  chart._panSnapOffsetX = 340;
  chart._panSnapFirstBarT = chart.data[0].t;
  chart._panSnapCandleWidth = chart.candleWidth;
  chart.offsetX = 380;
  if (chart._m211CssPanTransformApplicable(true, false, false, false)) {
    chart._applyPanDrawingsLayerTransform();
  }
  const hadPanXform = !!chart._panDrawingsXformApplied;
  const ff2 = chart.counters.forceFull;
  chart._clearPanDrawingsLayerTransform(); // TF-commit prologue (clearSnap=true)
  if (hadPanXform) chart._finishPanDrawingRedraw();
  const spinnerOk = hadPanXform && chart.panLayer._t == null
    && !chart._panDrawingsXformApplied && (chart.counters.forceFull - ff2) === 1
    && chart._panSnapOffsetX == null;
  note('M21-1a', 'rt-tal01585-spinner-tf-commit-cell', spinnerOk,
    `hadXform=${hadPanXform} redraws=${chart.counters.forceFull - ff2}`);

  assert.equal(localApplicable && localDetach <= 1 && localEndOk, true);
  assert.equal(prependApplicable, false);
  assert.equal(spinnerOk, true);
});

// ─── D2 runtime probe: pan→pinch handoff (real product method) ─────────────

test('M21-1a runtime: pan→pinch handoff performs exactly one redraw (D2)', () => {
  const env = makeEnv();
  const chart = makeFakeChart(chartSrc, env);

  chart.offsetX = 200;
  chart.redrawDrawings();
  chart.drag = { active: true, type: 'pan', panCommitted: true, lastX: 0, lastY: 0 };
  chart._touchGesture = { mode: 'pan', pointerIds: [] };
  chart._panSnapOffsetX = 200;
  chart._panSnapFirstBarT = chart.data[0].t;
  chart._panSnapCandleWidth = chart.candleWidth;
  chart.offsetX = 236;
  chart._applyPanDrawingsLayerTransform(); // live translate mid-pan
  assert.equal(chart._panDrawingsXformApplied, true);

  const before = chart.counters.forceFull;
  chart._cancelOneFingerForPinch(); // real product handoff
  const redraws = chart.counters.forceFull - before;
  const cleared = chart.panLayer._t == null && !chart._panDrawingsXformApplied;

  note('M21-1a', 'rt-tal01585-pinch-handoff-cell', redraws === 1 && cleared,
    `authoritativeRedraws=${redraws} (must be exactly 1) transformCleared=${cleared}`);

  assert.equal(cleared, true, 'pinch handoff must clear the live translate');
  assert.equal(redraws, 1,
    `D2 RED: pan→pinch performed ${redraws} authoritative redraws (must be exactly 1)`);
});

// ─── D3 runtime probes: deferred crosshair resize (real product methods) ───

function makeResizeProbeChart(env) {
  const chart = {
    counters: { resize: 0 },
    _lastResizeDpr: 1,
  };
  const container = { isConnected: true };
  const canvas = { parentElement: container, isConnected: true };
  chart.canvas = canvas;
  chart.resize = function resizeFake() {
    chart.counters.resize += 1;
    // Mirror the product commit path: an authoritative resize invalidates any
    // queued deferred callback (chart.js resize() calls this hook — static row
    // `authoritative-resize-invalidates-deferred` binds that).
    if (typeof chart._invalidateDeferredLayoutResize === 'function') {
      chart._invalidateDeferredLayoutResize();
    }
  };
  const sched = compileMethod(chartSrc, '_scheduleDeferredLayoutResize', env);
  const inval = compileMethod(chartSrc, '_invalidateDeferredLayoutResize', env);
  if (sched) chart._scheduleDeferredLayoutResize = sched;
  if (inval) chart._invalidateDeferredLayoutResize = inval;
  return { chart, canvas, container };
}

test('M21-1c runtime: deferred resize is coalesced, stale-safe, detach-safe (D3)', () => {
  const results = {};

  // Cell 1 — coalescing (≤1 per rAF) still holds.
  {
    const env = makeEnv();
    const { chart } = makeResizeProbeChart(env);
    chart._scheduleDeferredLayoutResize();
    chart._scheduleDeferredLayoutResize();
    chart._scheduleDeferredLayoutResize();
    const rafs = env.pendingRaf();
    env.flushRaf();
    results.coalesced = rafs === 1 && chart.counters.resize === 1;
    note('M21-1c', 'rt-deferred-resize-coalesced', results.coalesced,
      `queued=${rafs} resizes=${chart.counters.resize}`);
  }

  // Cell 2 — an intervening authoritative resize() must invalidate the queued
  // callback: total resizes 1, never 2.
  {
    const env = makeEnv();
    const { chart } = makeResizeProbeChart(env);
    chart._scheduleDeferredLayoutResize();
    chart.resize(); // authoritative resize (e.g. ResizeObserver) lands first
    env.flushRaf(); // stale deferred callback must be a no-op now
    results.staleInvalidated = chart.counters.resize === 1;
    note('M21-1c', 'rt-deferred-resize-stale-invalidated', results.staleInvalidated,
      `resizes=${chart.counters.resize} (blocked build double-resizes)`);
  }

  // Cell 3 — canvas detached from the DOM before the callback: skip.
  {
    const env = makeEnv();
    const { chart, canvas } = makeResizeProbeChart(env);
    chart._scheduleDeferredLayoutResize();
    canvas.isConnected = false;
    canvas.parentElement = null;
    env.flushRaf();
    results.detachSkipped = chart.counters.resize === 0;
    note('M21-1c', 'rt-deferred-resize-detached-canvas-skipped', results.detachSkipped,
      `resizes=${chart.counters.resize}`);
  }

  // Cell 4 — canvas replaced (panel re-bind) before the callback: skip.
  {
    const env = makeEnv();
    const { chart } = makeResizeProbeChart(env);
    chart._scheduleDeferredLayoutResize();
    chart.canvas = { parentElement: { isConnected: true }, isConnected: true }; // different node
    env.flushRaf();
    results.replacedSkipped = chart.counters.resize === 0;
    note('M21-1c', 'rt-deferred-resize-replaced-canvas-skipped', results.replacedSkipped,
      `resizes=${chart.counters.resize}`);
  }

  // Cell 5 — container swapped under the same canvas: skip.
  {
    const env = makeEnv();
    const { chart, canvas } = makeResizeProbeChart(env);
    chart._scheduleDeferredLayoutResize();
    canvas.parentElement = { isConnected: true }; // moved to another container
    env.flushRaf();
    results.containerSkipped = chart.counters.resize === 0;
    note('M21-1c', 'rt-deferred-resize-changed-container-skipped', results.containerSkipped,
      `resizes=${chart.counters.resize}`);
  }

  // Cell 6 — explicit lifecycle teardown flag: skip.
  {
    const env = makeEnv();
    const { chart } = makeResizeProbeChart(env);
    chart._scheduleDeferredLayoutResize();
    chart._m211LayoutResizeTeardown = true;
    env.flushRaf();
    results.teardownSkipped = chart.counters.resize === 0;
    note('M21-1c', 'rt-deferred-resize-teardown-skipped', results.teardownSkipped,
      `resizes=${chart.counters.resize}`);
  }

  assert.equal(results.coalesced, true, 'D3: deferred resize must stay ≤1 per rAF');
  assert.equal(results.staleInvalidated, true,
    'D3 RED: deferred resize fired after an intervening authoritative resize');
  assert.equal(results.detachSkipped, true, 'D3 RED: deferred resize ran on detached canvas');
  assert.equal(results.replacedSkipped, true, 'D3 RED: deferred resize ran on replaced canvas');
  assert.equal(results.containerSkipped, true, 'D3 RED: deferred resize ran after container change');
  assert.equal(results.teardownSkipped, true, 'D3 RED: deferred resize ran after lifecycle teardown');
});

// ─── M21-1b static + M21-1c static (unchanged binding contracts) ────────────

test('M21-1b: main candle canvas requests desynchronized context (static)', () => {
  const ind = read('modules/chart-indicators-full.js');
  const hasKill = chartSrc.includes(KS_DESYNC) && homeSrc.includes(KS_DESYNC);
  const hasHelper = /_m211DesynchronizedMainCanvasFixEnabled\s*\(/.test(chartSrc);
  const desyncMain = mainCanvasGetContextHasDesync(chartSrc) && mainCanvasGetContextHasDesync(homeSrc);
  const plainFallback = /this\.ctx\s*=\s*this\.canvas\.getContext\(\s*['"]2d['"]\s*\)\s*;/.test(chartSrc);
  const indLayerDesync = /desynchronized\s*:\s*true/.test(ind);

  note('M21-1b', 'kill-switch-present', hasKill, KS_DESYNC);
  note('M21-1b', 'enable-helper-present', hasHelper);
  note('M21-1b', 'main-canvas-desynchronized-true', desyncMain);
  note('M21-1b', 'plain-getContext-kill-fallback-retained', plainFallback);
  note('M21-1b', 'indicator-layer-desync-precedent', indLayerDesync);

  assert.equal(hasKill, true);
  assert.equal(desyncMain, true);
  assert.equal(plainFallback, true, 'kill-switch OFF path must keep plain getContext');
  assert.equal(indLayerDesync, true);
});

test('M21-1c: updateCrosshair does not resize inline when fix ON (static)', () => {
  const hasKill = chartSrc.includes(KS_RESIZE) && homeSrc.includes(KS_RESIZE);
  const hasHelper = /_m211CrosshairResizeChurnFixEnabled\s*\(/.test(chartSrc)
    && /_m211CrosshairResizeChurnFixEnabled\s*\(/.test(homeSrc);
  const marker = chartSrc.indexOf('// Auto-fix stale dimensions:');
  const block = marker >= 0 ? chartSrc.slice(marker, marker + 1400) : '';
  const gated = block.includes('_m211CrosshairResizeChurnFixEnabled')
    && block.includes('_scheduleDeferredLayoutResize');
  const inlineFallbackRetained = block.includes('this.resize()');

  note('M21-1c', 'kill-switch-present', hasKill, KS_RESIZE);
  note('M21-1c', 'enable-helper-present', hasHelper);
  note('M21-1c', 'resize-churn-gated', gated);
  note('M21-1c', 'inline-resize-kill-fallback-retained', inlineFallbackRetained);

  assert.equal(hasKill, true);
  assert.equal(gated, true);
  assert.equal(inlineFallbackRetained, true);
});

// ─── D4: REAL switch discrimination (product code, both flag states) ───────

/** Extract the interactionFast transform-decision block out of render(). */
function extractFastPathDecisionSnippet(src) {
  const marker = src.indexOf('const cssPanXform = this._m211CssPanTransformApplicable(');
  if (marker < 0) return null;
  const lineStart = src.lastIndexOf('\n', marker) + 1;
  const elseIf = src.indexOf('} else if (syncDrawingsNow) {', marker);
  if (elseIf < 0) return null;
  const end = scanBalanced(src, src.indexOf('{', elseIf + 1));
  if (end < 0) return null;
  return `${src.slice(lineStart, end)}\nreturn cssPanXform;`;
}

/** Extract the constructor ctx if/else (M21-1b product site). */
function extractCtxSnippet(src) {
  const marker = src.indexOf('if (this._m211DesynchronizedMainCanvasFixEnabled())');
  if (marker < 0) return null;
  const ifEnd = scanBalanced(src, marker);
  if (ifEnd < 0) return null;
  const elseIdx = src.indexOf('else', ifEnd);
  if (elseIdx < 0 || elseIdx - ifEnd > 8) return src.slice(marker, ifEnd);
  const end = scanBalanced(src, elseIdx);
  return end < 0 ? null : src.slice(marker, end);
}

/** Extract the updateCrosshair auto-resize block (M21-1c product site). */
function extractCrosshairResizeSnippet(src) {
  const marker = src.indexOf('// Auto-fix stale dimensions:');
  if (marker < 0) return null;
  const declIdx = src.indexOf('const _ctrEl', marker);
  if (declIdx < 0) return null;
  const ifIdx = src.indexOf('if (_ctrEl)', declIdx);
  const end = scanBalanced(src, src.indexOf('{', ifIdx));
  if (end < 0) return null;
  return src.slice(declIdx, end);
}

function runFastPathDecision(flagOff) {
  const env = makeEnv(flagOff ? { [KS_CSS]: true } : {});
  const chart = makeFakeChart(chartSrc, env);
  chart.offsetX = 100;
  chart.redrawDrawings();
  const paintBase = chart.counters.redrawAll;
  chart._panSnapOffsetX = 100;
  chart._panSnapFirstBarT = chart.data[0].t;
  chart._panSnapCandleWidth = chart.candleWidth;
  chart.offsetX = 130;
  // Make the real _isChartViewPanning() true via a committed drag (legacy
  // redrawDrawings takes the panFast branch through the real method).
  chart.drag = { active: true, type: 'pan', panCommitted: true };
  const snippet = extractFastPathDecisionSnippet(chartSrc);
  const fn = snippet ? compileSnippet(snippet, env,
    ['chartViewPanning', 'wheelBurstLight', 'axisZoomDragging', 'replayPlayback', 'syncDrawingsNow', 'interactionLite']) : null;
  if (!fn) return { ok: false, reason: 'fast-path snippet extraction failed' };
  const cssPanXform = fn.call(chart, true, false, false, false, true, true);
  return {
    ok: true,
    cssPanXform: !!cssPanXform,
    transform: chart.panLayer._t,
    redraws: chart.counters.redrawAll - paintBase,
    xformFlag: !!chart._panDrawingsXformApplied,
  };
}

function runCtxSnippet(flagOff) {
  const env = makeEnv(flagOff ? { [KS_DESYNC]: true } : {});
  const calls = [];
  const chart = {
    canvas: { getContext: (...args) => { calls.push(args); return {}; } },
  };
  chart._m211DesynchronizedMainCanvasFixEnabled = compileMethod(chartSrc, '_m211DesynchronizedMainCanvasFixEnabled', env);
  const snippet = extractCtxSnippet(chartSrc);
  const fn = snippet ? compileSnippet(snippet, env) : null;
  if (!fn || !chart._m211DesynchronizedMainCanvasFixEnabled) return { ok: false, reason: 'ctx snippet extraction failed' };
  fn.call(chart);
  const args = calls[0] || [];
  return { ok: true, type: args[0], opts: args[1] || null, calls: calls.length };
}

function runCrosshairSnippet(flagOff) {
  const env = makeEnv(flagOff ? { [KS_RESIZE]: true } : {});
  const container = {
    isConnected: true,
    getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0, right: 800, bottom: 600 }),
  };
  const chart = {
    counters: { resize: 0 },
    w: 400, h: 300, // stale vs container → mismatch > 4px triggers the block
    _lastResizeDpr: 1,
    canvas: { parentElement: container, isConnected: true },
    _layoutSizeFromRect: (r) => ({ w: r.width, h: r.height }),
  };
  chart.resize = function resizeFake() {
    chart.counters.resize += 1;
    if (typeof chart._invalidateDeferredLayoutResize === 'function') chart._invalidateDeferredLayoutResize();
  };
  chart._m211CrosshairResizeChurnFixEnabled = compileMethod(chartSrc, '_m211CrosshairResizeChurnFixEnabled', env);
  const sched = compileMethod(chartSrc, '_scheduleDeferredLayoutResize', env);
  const inval = compileMethod(chartSrc, '_invalidateDeferredLayoutResize', env);
  if (sched) chart._scheduleDeferredLayoutResize = sched;
  if (inval) chart._invalidateDeferredLayoutResize = inval;
  const snippet = extractCrosshairResizeSnippet(chartSrc);
  const fn = snippet ? compileSnippet(snippet, env) : null;
  if (!fn || !chart._m211CrosshairResizeChurnFixEnabled) return { ok: false, reason: 'crosshair snippet extraction failed' };
  fn.call(chart); // one synthetic mousemove with stale dimensions
  fn.call(chart); // second mousemove same frame
  const inlineResizes = chart.counters.resize;
  const queued = env.pendingRaf();
  env.flushRaf();
  return { ok: true, inlineResizes, queued, totalResizes: chart.counters.resize };
}

test('M21-1 switch discrimination through REAL product paths (D4)', () => {
  // M21-1a — fix ON: transform engages, no per-frame redraw.
  const aOn = runFastPathDecision(false);
  // M21-1a — switch OFF: legacy clear+redraw every pan frame, no transform.
  const aOff = runFastPathDecision(true);
  const aOnOk = aOn.ok && aOn.cssPanXform === true && parseTranslateX(aOn.transform) === 30
    && aOn.redraws === 0 && aOn.xformFlag === true;
  const aOffOk = aOff.ok && aOff.cssPanXform === false && aOff.transform == null
    && aOff.redraws === 1 && aOff.xformFlag === false;
  note('M21-1a', 'product-fix-on-css-transform', aOnOk,
    aOn.ok ? `tx=${parseTranslateX(aOn.transform)} redraws=${aOn.redraws}` : aOn.reason);
  note('M21-1a', 'switch-off-product-RED', aOffOk,
    aOff.ok ? `path=legacy redraws=${aOff.redraws} transform=${JSON.stringify(aOff.transform)}` : aOff.reason);

  // M21-1b — real constructor site with both flag states.
  const bOn = runCtxSnippet(false);
  const bOff = runCtxSnippet(true);
  const bOnOk = bOn.ok && bOn.type === '2d' && !!bOn.opts && bOn.opts.desynchronized === true;
  const bOffOk = bOff.ok && bOff.type === '2d' && bOff.opts == null;
  note('M21-1b', 'product-fix-on-desync-option', bOnOk,
    bOn.ok ? `opts=${JSON.stringify(bOn.opts)}` : bOn.reason);
  note('M21-1b', 'switch-off-product-RED', bOffOk,
    bOff.ok ? `opts=${JSON.stringify(bOff.opts)} (plain 2d restored)` : bOff.reason);

  // M21-1c — real updateCrosshair block with both flag states.
  const cOn = runCrosshairSnippet(false);
  const cOff = runCrosshairSnippet(true);
  const cOnOk = cOn.ok && cOn.inlineResizes === 0 && cOn.queued === 1 && cOn.totalResizes === 1;
  const cOffOk = cOff.ok && cOff.inlineResizes === 2 && cOff.queued === 0;
  note('M21-1c', 'product-fix-on-deferred-resize', cOnOk,
    cOn.ok ? `inline=${cOn.inlineResizes} queued=${cOn.queued} total=${cOn.totalResizes}` : cOn.reason);
  note('M21-1c', 'switch-off-product-RED', cOffOk,
    cOff.ok ? `inline=${cOff.inlineResizes} per 2 mousemoves (churn restored)` : cOff.reason);

  assert.equal(aOnOk, true, 'M21-1a fix-ON product path broken');
  assert.equal(aOffOk, true, 'M21-1a switch-OFF must restore legacy clear+redraw (real path)');
  assert.equal(bOnOk, true, 'M21-1b fix-ON product path broken');
  assert.equal(bOffOk, true, 'M21-1b switch-OFF must restore plain getContext (real path)');
  assert.equal(cOnOk, true, 'M21-1c fix-ON product path broken');
  assert.equal(cOffOk, true, 'M21-1c switch-OFF must restore inline resize churn (real path)');
});

// ─── permanent two-panel browser/runtime oracle (M21_1_BROWSER=1) ──────────

test('M21-1a browser oracle: two-panel follower pan ≤1px + settle clears transform', { skip: !browserMode, timeout: 420_000 }, async () => {
  const harnessDir = path.join(CHART_ROOT, 'multichart-prod', 'harness');
  const { startServer } = await import(pathToFileURL(path.join(harnessDir, 'serve.mjs')).href);
  const lib = await import(pathToFileURL(path.join(harnessDir, 'harness-lib.mjs')).href);
  const ih = await import(pathToFileURL(path.join(harnessDir, 'interactive-helpers.mjs')).href);
  const srv = await startServer(0);
  const browser = await lib.launchBrowser({});
  const browserEvidence = { cells: {} };

  async function followerPanCell(cellName, preDocument) {
    const boot = await lib.bootLayout(browser, srv, { pair: 'same', panels: 2, tf: '1m', preDocument });
    const { page } = boot;
    try {
      // Pan/visible-range sync must be ON for the leader pan to drive the
      // follower burst (the mechanism under test).
      const syncOn = await lib.setSync(page, true);
      assert.equal(syncOn, true, `${cellName}: enabling pan sync failed`);
      await lib.sleep(400);
      const pts = await ih.defaultTrendlinePoints(page, 'B');
      const placed = await ih.placeTool(page, 'B', 'trendline', pts);
      assert.ok(placed && placed.id, `${cellName}: trendline placement on follower failed`);
      await lib.sleep(600); // let the scheduled render paint the drawing
      const frames = lib.panelFrameMap(page);
      const bFrame = frames.B;
      assert.ok(bFrame, `${cellName}: panel B frame missing`);

      await bFrame.evaluate((drawId, anchorIdx) => {
        const c = window.chart;
        const dm = c.drawingManager;
        // Re-query per sample: the legacy clear+redraw path RECREATES the SVG
        // nodes every frame (a stale captured node reads rect.x=0), while the
        // transform path keeps them alive. Both must measure fairly.
        const queryEl = () => document.querySelector(`[data-id="${drawId}"]`);
        const el = queryEl();
        if (!el) { window.__m211OracleErr = 'drawing element not found'; return; }
        const spacing = () => ((typeof c.getCandleSpacing === 'function') ? c.getCandleSpacing() : c.candleWidth);
        // Probe-only render wrapper: capture the viewport state each frame was
        // actually PAINTED with. Sampling against live offsetX would misread
        // the window between a bridge message (offset mutated) and that
        // frame's follow render (canvas + SVG updated together).
        const painted = () => ({
          offsetX: c.offsetX,
          spacing: spacing(),
          marginL: c.margin ? c.margin.l : 0,
        });
        window.__m211Painted = painted();
        const origRender = c.render.bind(c);
        c.render = function m211ProbeRender(...args) {
          const out = origRender(...args);
          window.__m211Painted = painted();
          return out;
        };
        const rect0 = el.getBoundingClientRect();
        window.__m211Samples = [];
        window.__m211Base = {
          rectX: rect0.x,
          painted: { ...window.__m211Painted },
          xScaleX: (typeof c.xScale === 'function') ? c.xScale(anchorIdx) : null,
        };
        const sample = () => {
          try {
            const liveEl = queryEl();
            if (!liveEl) {
              window.__m211Samples.push({ detach: null, missing: true, burst: false, xform: false, transform: null });
              if (window.__m211Samples.length < 900) requestAnimationFrame(sample);
              return;
            }
            const r = liveEl.getBoundingClientRect();
            const base = window.__m211Base;
            const p = window.__m211Painted;
            // Candle-plane movement of the anchored bar since baseline, from
            // the painted state (exact during pure pan; spacing/margin terms
            // cover the settle wall-clock fit).
            const expectedDx = (p.offsetX - base.painted.offsetX)
              + (anchorIdx + 0.5) * (p.spacing - base.painted.spacing)
              + (p.marginL - base.painted.marginL);
            const dDraw = r.x - base.rectX;
            const layer = dm.drawingsPanLayer;
            window.__m211Samples.push({
              detach: Math.abs(dDraw - expectedDx),
              burst: typeof c._panSyncBurstUntil === 'number' && performance.now() < c._panSyncBurstUntil,
              xform: !!c._panDrawingsXformApplied,
              transform: layer && !layer.empty() ? (layer.attr('transform') || null) : null,
            });
          } catch (e) { window.__m211OracleErr = String(e); }
          if (window.__m211Samples.length < 900) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }, placed.id, pts[0].x);

      // Drive a leader (host tile A) pan drag — this arms the follower burst in B.
      const start = await ih.chartCanvasPagePoint(page, 'A', 0.65, 0.4);
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      for (let i = 1; i <= 40; i += 1) {
        await page.mouse.move(start.x - i * 6, start.y, { steps: 1 });
        await lib.sleep(16);
      }
      await page.mouse.up();
      await lib.sleep(1500); // settle: burst must expire + release

      const result = await bFrame.evaluate((drawId, anchorIdx) => {
        const c = window.chart;
        const dm = c.drawingManager;
        const layer = dm.drawingsPanLayer;
        const samples = (window.__m211Samples || []).filter((s) => s.detach != null);
        const missingSamples = (window.__m211Samples || []).length - samples.length;
        const burstSamples = samples.filter((s) => s.burst);
        // Settle check is exact: at idle both baseline and settle have freshly
        // recalculated scales, so xScale(anchor) is the candle-plane truth.
        const el = document.querySelector(`[data-id="${drawId}"]`);
        const base = window.__m211Base || {};
        let settleDetach = null;
        if (el && base.xScaleX != null && typeof c.xScale === 'function') {
          const r = el.getBoundingClientRect();
          settleDetach = Math.abs((r.x - base.rectX) - (c.xScale(anchorIdx) - base.xScaleX));
        }
        return {
          err: window.__m211OracleErr || null,
          totalSamples: samples.length,
          missingSamples,
          burstSamples: burstSamples.length,
          maxDetachDuringBurst: burstSamples.length ? Math.max(...burstSamples.map((s) => s.detach)) : null,
          burstUsedTransform: burstSamples.some((s) => s.transform != null),
          settleDetach,
          settleTransform: layer && !layer.empty() ? (layer.attr('transform') || null) : null,
          settleXformFlag: !!c._panDrawingsXformApplied,
          settleSnap: c._panSnapOffsetX == null ? null : c._panSnapOffsetX,
          ctxAttributes: (c.ctx && typeof c.ctx.getContextAttributes === 'function')
            ? c.ctx.getContextAttributes() : null,
        };
      }, placed.id, pts[0].x);
      browserEvidence.cells[cellName] = result;
      return result;
    } finally {
      await boot.close();
    }
  }

  try {
    // Cell 1 — fix ON (default flags).
    const on = await followerPanCell('follower-pan-fix-on', null);
    const onExercised = on.burstSamples > 0 && on.burstUsedTransform === true;
    const onDetachOk = onExercised && on.maxDetachDuringBurst <= 1 && on.settleDetach <= 1;
    const onSettleOk = on.settleTransform == null && on.settleXformFlag === false && on.settleSnap == null;
    note('M21-1a', 'browser-follower-pan-detach-1px', !on.err && onDetachOk,
      on.err || `burstFrames=${on.burstSamples} usedTransform=${on.burstUsedTransform} `
        + `maxDetachBurst=${on.maxDetachDuringBurst} settleDetach=${on.settleDetach}`);
    note('M21-1a', 'browser-follower-settle-no-transform-no-flag', !on.err && onSettleOk,
      on.err || `transform=${JSON.stringify(on.settleTransform)} flag=${on.settleXformFlag} snap=${JSON.stringify(on.settleSnap)}`);
    note('M21-1b', 'browser-ctx-attributes-measured', on.ctxAttributes != null,
      `desynchronized=${on.ctxAttributes ? on.ctxAttributes.desynchronized : 'n/a'} (hint; grant is platform-dependent)`);

    // Cell 2 — M21-1a switch OFF in a real browser: legacy path, still glued,
    // and the transform mechanism must NOT engage (discrimination).
    const off = await followerPanCell('follower-pan-switch-off', {
      fn: (flag) => { window[flag] = true; },
      args: [KS_CSS],
    });
    const offNoTransform = off.burstSamples > 0 && off.burstUsedTransform === false
      && off.maxDetachDuringBurst <= 1 && off.settleDetach <= 1
      && off.settleTransform == null && off.settleXformFlag === false;
    note('M21-1a', 'browser-switch-off-no-transform-mechanism', !off.err && offNoTransform,
      off.err || `burstFrames=${off.burstSamples} usedTransform=${off.burstUsedTransform} `
        + `maxDetachBurst=${off.maxDetachDuringBurst} settleDetach=${off.settleDetach} (legacy clear+redraw stays glued)`);

    // Cell 3 — HiDPI 4-panel spot check (M21-1b risk note from the manifest).
    const boot4 = await lib.bootLayout(browser, srv, { pair: 'same', panels: 4, tf: '1m' });
    try {
      await boot4.page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 2 });
      await lib.sleep(2500);
      const hidpi = await (async () => {
        const cells = [];
        const hostOk = await boot4.page.evaluate(() => {
          const c = window.chart;
          if (!c || !c.canvas) return null;
          const dpr = window.devicePixelRatio;
          const r = c.canvas.getBoundingClientRect();
          return {
            dpr,
            ok: Math.abs(c.canvas.width - Math.floor(r.width * dpr)) <= 2,
            attrs: (c.ctx && c.ctx.getContextAttributes) ? c.ctx.getContextAttributes() : null,
          };
        });
        cells.push({ id: 'A', ...hostOk });
        for (const [id, f] of Object.entries(lib.panelFrameMap(boot4.page))) {
          const r = await f.evaluate(() => {
            const c = window.chart;
            if (!c || !c.canvas) return null;
            const dpr = window.devicePixelRatio;
            const rect = c.canvas.getBoundingClientRect();
            return {
              dpr,
              ok: Math.abs(c.canvas.width - Math.floor(rect.width * dpr)) <= 2,
              attrs: (c.ctx && c.ctx.getContextAttributes) ? c.ctx.getContextAttributes() : null,
            };
          }).catch(() => null);
          cells.push({ id, ...(r || { ok: false }) });
        }
        return cells;
      })();
      browserEvidence.cells['hidpi-4panel'] = { cells: hidpi, pageErrors: boot4.pageErrors.slice(0, 5) };
      const hidpiOk = hidpi.every((c) => c && c.ok) && boot4.pageErrors.length === 0;
      note('M21-1b', 'browser-hidpi-4panel-backing-store', hidpiOk,
        hidpi.map((c) => `${c.id}:${c.ok ? 'ok' : 'FAIL'}@dpr${c.dpr}`).join(' ')
        + (boot4.pageErrors.length ? ` pageErrors=${boot4.pageErrors.length}` : ''));
      assert.equal(hidpiOk, true, 'HiDPI 4-panel backing store mismatch or page errors');
    } finally {
      await boot4.close();
    }

    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    const out = path.join(EVIDENCE_DIR, 'W3-M21-1-20260724-browser-oracle.json');
    fs.writeFileSync(out, JSON.stringify({
      worker: 'W3',
      oracle: 'M21-1a permanent two-panel follower pan oracle + HiDPI 4-panel spot check',
      status: 'FABLE-CORRECTION-20260724',
      chartJsSha256: {
        'chart v 1.4': sha256(path.join(CHART_ROOT, 'chart.js')),
        homepage: sha256(path.join(HOMEPAGE_CHART, 'chart.js')),
      },
      ...browserEvidence,
    }, null, 2));
    process.stdout.write(`Wrote browser oracle evidence ${out}\n`);

    assert.equal(on.err, null);
    assert.ok(onExercised, 'oracle vacuous: follower burst never engaged');
    assert.ok(onDetachOk, `follower drawings detached >1px (burst max=${on.maxDetachDuringBurst}px settle=${on.settleDetach}px)`);
    assert.ok(onSettleOk, 'transform/flag/snap persisted after settle');
    assert.ok(offNoTransform, 'switch-OFF cell: transform mechanism engaged despite kill-switch');
  } finally {
    await browser.close().catch(() => {});
    await srv.close().catch(() => {});
  }
});

// ─── evidence writer ────────────────────────────────────────────────────────

test('evidence writer', { skip: !evidenceMode }, () => {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const stamp = '20260724';
  const out = path.join(EVIDENCE_DIR, `W3-M21-1-${stamp}-${evidenceMode}.json`);
  const failed = evidenceRows.filter((r) => !r.pass);
  let verdict = failed.length ? 'RED' : 'GREEN';
  if (evidenceMode === 'kill') {
    // Kill evidence binds on the REAL switch-OFF product rows: OFF must
    // restore the legacy behavior through the actual code paths.
    const disc = evidenceRows.filter((r) => String(r.name).includes('switch-off-product')
      || String(r.name).includes('switch-off-no-transform'));
    const discOk = disc.length >= 3 && disc.every((r) => r.pass);
    verdict = discOk ? 'RED' : 'FAIL-DISCRIMINATION';
  }
  if (evidenceMode === 'red') {
    // Correction RED: the reviewed-defect probes must fail on the blocked land.
    const targets = evidenceRows.filter((r) => String(r.name).startsWith('rt-')
      || String(r.name).startsWith('follower-arm-')
      || String(r.name).startsWith('follower-release-')
      || String(r.name).includes('pinch-handoff')
      || String(r.name).includes('deferred-resize')
      || String(r.name).includes('invalidates-deferred'));
    const targetFails = targets.filter((r) => !r.pass);
    verdict = targetFails.length ? 'RED' : 'UNEXPECTED-GREEN';
  }
  const payload = {
    worker: 'W3',
    mode: evidenceMode,
    stamp,
    status: 'FABLE-CORRECTION-20260724',
    reviewBlock: 'independent M21-1 BLOCK (follower pan detach; pan→pinch double redraw; deferred resize stale/detach; synthetic kill evidence; manifest scope contradiction)',
    killSwitches: { 'M21-1a': KS_CSS, 'M21-1b': KS_DESYNC, 'M21-1c': KS_RESIZE },
    hashBind: {
      'chart v 1.4/chart/chart.js': sha256(path.join(CHART_ROOT, 'chart.js')),
      'homepage/public/chart/chart.js': sha256(path.join(HOMEPAGE_CHART, 'chart.js')),
      'chart v 1.4/chart/modules/m21-1-render-quick-wins.test.mjs':
        sha256(path.join(CHART_ROOT, 'modules', 'm21-1-render-quick-wins.test.mjs')),
      'homepage/public/chart/modules/m21-1-render-quick-wins.test.mjs':
        sha256(path.join(HOMEPAGE_CHART, 'modules', 'm21-1-render-quick-wins.test.mjs')),
    },
    rows: evidenceRows,
    summary: {
      total: evidenceRows.length,
      pass: evidenceRows.length - failed.length,
      fail: failed.length,
    },
    verdict,
  };
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  process.stdout.write(`Wrote evidence ${out} verdict=${payload.verdict}\n`);
});
