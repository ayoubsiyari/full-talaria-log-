/**
 * LAG-SETINTERVAL-TICK — bound candle-mode setInterval handler.
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/lag-setinterval-tick.test.mjs"
 *
 * Hotspot (PO b85): startCandleByCandle → setInterval → sync
 * _runCandlePlaybackTick() took 55–95ms at 60x (intervalMs≈16).
 * Winner (Phase A): split compute/paint — advance in interval, paint on rAF.
 * Kill-switch: window.__TALARIA_DISABLE_LAG_SETINTERVAL_TICK_V1 = <truthy>
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Walk up to the repo root instead of counting directory levels.
 *
 * This file is mirrored to a tree at a DIFFERENT depth, so a fixed '../../..'
 * resolved to the wrong directory in one of the two locations and the gate there
 * died on load, or failed a cell on a path it built itself. A gate that cannot
 * reach its subject reports a red indistinguishable from a product defect.
 */
function findRoot(start) {
  let dir = start;
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(dir, 'chart v 1.4')) && fs.existsSync(path.join(dir, 'homepage'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error(`ANCHOR_BROKEN: repo root not found from ${start}`);
}

const ROOT = findRoot(HERE);
const REPLAY_CANONICAL = path.join(ROOT, 'chart v 1.4', 'chart', 'modules', 'replay-system.js');
const REPLAY_MIRROR = path.join(ROOT, 'homepage', 'public', 'chart', 'modules', 'replay-system.js');

const SWITCH = '__TALARIA_DISABLE_LAG_SETINTERVAL_TICK_V1';
const VIOLATION_MS = 50;
const replaySource = fs.readFileSync(REPLAY_CANONICAL, 'utf8');

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function note(name, pass, detail = '') {
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}\n`);
}

function busy(ms) {
  const end = performance.now() + ms;
  while (performance.now() < end) { /* spin */ }
}

/**
 * Realm shape, because replay runs in panels as well as on the host page:
 *   default        top-level page — window.parent === window === window.top
 *   panel: true    panel realm — one distinct host above (parent === top)
 *   panel:'nested' panel inside a container — window, parent and top all differ
 * `killIn` says WHICH realm carries the kill switch: 'self' | 'parent' | 'top'.
 * `hostileParent` makes the parent chain throw on access, as a cross-origin
 * realm does. `sourceOverride` loads mutated source, for the mutant cells.
 */
function loadReplay({
  kill = false,
  killIn = 'self',
  panel = false,
  hostileParent = false,
  sourceOverride = null,
} = {}) {
  const flagIf = (on) => (on ? true : undefined);
  const windowObj = {
    [SWITCH]: flagIf(kill && killIn === 'self'),
  };
  let hostWindow = null;
  let topWindow = null;
  if (panel) {
    hostWindow = { [SWITCH]: flagIf(kill && killIn === 'parent') };
    topWindow = panel === 'nested'
      ? { [SWITCH]: flagIf(kill && killIn === 'top') }
      : hostWindow;
    if (hostileParent) {
      const boom = () => { throw new Error('cross-origin realm'); };
      Object.defineProperty(windowObj, 'parent', { get: boom, configurable: true });
      Object.defineProperty(windowObj, 'top', { get: boom, configurable: true });
    } else {
      windowObj.parent = hostWindow;
      windowObj.top = topWindow;
    }
  } else {
    // A top-level page is its own parent and top. The pre-existing cells assume
    // this, and the climb must find nothing new here.
    windowObj.parent = windowObj;
    windowObj.top = windowObj;
  }
  const rafQueue = [];
  const context = {
    window: windowObj,
    document: {
      documentElement: { style: {} },
      body: { style: {}, appendChild() {}, removeChild() {} },
      getElementById() { return null; },
      querySelector() { return null; },
      createElement() {
        return {
          style: {},
          classList: { add() {}, remove() {}, contains() { return false; } },
          addEventListener() {},
          removeEventListener() {},
          appendChild() {},
          setAttribute() {},
          remove() {},
        };
      },
      addEventListener() {},
      removeEventListener() {},
    },
    console: { log() {}, warn() {}, error() {} },
    performance: { now: () => performance.now() },
    requestAnimationFrame: (fn) => {
      const id = rafQueue.length + 1;
      rafQueue.push({ id, fn });
      return id;
    },
    cancelAnimationFrame(id) {
      const idx = rafQueue.findIndex((e) => e.id === id);
      if (idx >= 0) rafQueue.splice(idx, 1);
    },
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout() {},
    setInterval() { return 1; },
    clearInterval() {},
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
    },
    userStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    Date, Math, JSON, Object, Array, Number, String, Boolean, Error, Map, Set,
    __rafQueue: rafQueue,
  };
  context.globalThis = context;
  vm.createContext(context);
  const script = new vm.Script(
    `${sourceOverride || replaySource}\n;globalThis.__ReplaySystem = ReplaySystem;`,
    { filename: 'replay-system.js' },
  );
  script.runInContext(context);
  return {
    context,
    ReplaySystem: context.__ReplaySystem,
    window: windowObj,
    hostWindow,
    topWindow,
    flushRaf() {
      const q = context.__rafQueue.splice(0, context.__rafQueue.length);
      for (const entry of q) entry.fn();
    },
    pendingRaf() {
      return context.__rafQueue.length;
    },
  };
}

function makeBars(n = 400) {
  const bars = [];
  const t0 = Date.UTC(2024, 0, 1);
  for (let i = 0; i < n; i++) {
    const o = 100 + (i % 7);
    bars.push({
      t: t0 + i * 60_000,
      o,
      h: o + 1,
      l: o - 1,
      c: o + 0.5,
      v: 10 + i,
    });
  }
  return bars;
}

function makeCandleInstance({ kill = false, paintCostMs = 0, speed = 60, ...realm } = {}) {
  const loaded = loadReplay({ kill, ...realm });
  const { ReplaySystem } = loaded;
  const bars = makeBars(400);
  const chart = {
    rawData: bars.slice(),
    data: bars.slice(),
    currentTimeframe: '1m',
    currentFileId: 'f1',
    renderPending: false,
    paints: 0,
    updateCalls: 0,
    render() { this.paints += 1; this.renderPending = false; },
    scheduleRender() {},
    resampleData(data) { return Array.isArray(data) ? data.slice() : []; },
    constrainOffset() {},
    indicators: { active: [{ type: 'EMA' }, { type: 'RSI' }] },
    orderManager: null,
    margin: { l: 60, r: 60 },
    w: 800,
    h: 600,
    offsetX: 0,
    getCandleSpacing() { return 8; },
    bumpDataVersion() {},
    _serverCursors: { hasMoreRight: false },
    checkViewportLoadMore() {},
  };
  const rs = new ReplaySystem(chart);
  chart.replaySystem = rs;
  rs.isActive = true;
  rs.isPlaying = true;
  rs.speed = speed;
  rs.playbackMode = 'candle';
  rs.fullRawData = bars;
  rs.currentIndex = 10;
  rs.replayTimestamp = bars[10].t;
  rs.sessionStartIndex = 0;
  rs.autoScrollEnabled = false;
  rs.userHasPanned = true;
  rs._scheduleReplayIndicatorRecalc = () => {};
  rs.updateSlider = () => {};
  rs.updateTimeDisplay = () => {};
  rs.updateSliderRange = () => {};
  rs.syncPanelCharts = () => {};
  rs._syncCompareOverlaysForReplay = () => {};
  rs._applyPlaybackViewportLock = () => {};
  rs._installPlayheadPrefix = (src, end) => src.slice(0, end);
  rs._m20Q9PrefixSliceFixEnabled = () => false;
  rs.syncPlayPauseUI = () => {};
  rs.syncPlayPauseButtonVisuals = () => {};
  rs.showTickProgress = () => {};
  rs._flushReplayIndicatorRecalc = () => {};
  rs._flushReplayStateToSession = () => {};
  rs._cancelDeferredPlayStart = () => {};
  rs._isReplayPageHidden = () => false;
  rs._getOrderExecutionCadenceMs = () => null;
  rs.updateAutoScrollIndicator = () => {};
  rs.ensureReplayFollowButton = () => {};
  rs._renderReplayChartUpdate = function _renderReplayChartUpdate() {
    chart.renderPending = true;
    chart.render();
  };
  rs._isSubBarStepMode = () => false;
  rs._shouldUseFinestTfSubStepIndexAdvance = () => false;
  rs._advanceCoarseLegacyCandleBucket = () => false;
  rs._isFinestTfCadenceSubStepActive = () => false;
  rs.calculateNextIndex = function calculateNextIndex() {
    return Math.min(this.currentIndex + 1, this.fullRawData.length - 1);
  };

  const realUpdate = rs.updateChartData.bind(rs);
  rs.updateChartData = function updateChartDataInstrumented(autoScroll, options) {
    chart.updateCalls += 1;
    if (paintCostMs > 0) busy(paintCostMs);
    return realUpdate(autoScroll, options);
  };

  return { rs, chart, ...loaded };
}

test('flag name is grep-clean and documented in replay-system.js', () => {
  assert.match(replaySource, /__TALARIA_DISABLE_LAG_SETINTERVAL_TICK_V1/);
  assert.match(replaySource, /_lagSetIntervalTickV1Enabled/);
  assert.match(replaySource, /_lagSetIntervalTickBoundEnabled/);
  assert.match(replaySource, /_scheduleCandlePlaybackPaint/);
  assert.match(replaySource, /LAG-SETINTERVAL-TICK/);
  note('flag-present', true, SWITCH);
});

test('absent flag ⇒ bound ON; truthy flag ⇒ OFF (per-call truthiness)', () => {
  const on = makeCandleInstance({ kill: false });
  assert.equal(on.rs._lagSetIntervalTickBoundEnabled(), true);

  const off = makeCandleInstance({ kill: true });
  assert.equal(off.rs._lagSetIntervalTickBoundEnabled(), false);

  const { ReplaySystem, window } = loadReplay({ kill: false });
  window[SWITCH] = '1';
  const chart = { indicators: { active: [] }, rawData: [], data: [], currentTimeframe: '1m' };
  const rs = new ReplaySystem(chart);
  assert.equal(rs._lagSetIntervalTickBoundEnabled(), false);

  window[SWITCH] = 0;
  assert.equal(rs._lagSetIntervalTickBoundEnabled(), true);
  note('flag-semantics', true);
});

/**
 * Mutate the real source, refusing to run if the anchor has moved. A mutation
 * whose target is missing silently tests nothing, which is the exact way the
 * PG-3 and r3 harnesses were found to be scoring themselves green earlier.
 */
function replaceOnce(source, needle, replacement) {
  const first = source.indexOf(needle);
  if (first < 0) {
    const err = new Error(`mutation anchor missing, re-anchor the cell: ${needle}`);
    err.mutationTargetMissing = true;
    throw err;
  }
  if (source.indexOf(needle, first + needle.length) >= 0) {
    throw new Error(`mutation anchor is not unique: ${needle}`);
  }
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

const CLIMB_PARENT = 'const parent = window.parent && window.parent !== window ? window.parent : null;';
const CLIMB_TOP = `const top = window.top && window.top !== window && window.top !== parent
            ? window.top
            : null;`;

/** Panel realm whose host carries the switch — the shape an operator creates. */
function panelWithHostKill(extra = {}) {
  return makeCandleInstance({ kill: true, killIn: 'parent', panel: true, speed: 60, ...extra });
}

test('host-side kill reaches a panel realm', () => {
  const { rs, chart, pendingRaf } = panelWithHostKill();

  assert.equal(rs._lagSetIntervalTickBoundEnabled(), false,
    'a switch set on the host must disable the fix inside the panel');

  // And the behaviour, not just the predicate: the legacy sync tick is back.
  rs._runCandlePlaybackTick();
  assert.equal(chart.updateCalls, 1, 'killed path paints synchronously in the tick');
  assert.equal(pendingRaf(), 0, 'and queues no coalesced frame');
  note('host-kill-reaches-panel', true);
});

test('kill on window.top reaches a nested panel realm', () => {
  const nested = makeCandleInstance({ kill: true, killIn: 'top', panel: 'nested', speed: 60 });
  assert.equal(nested.rs._lagSetIntervalTickBoundEnabled(), false,
    'a switch on the top window must reach a panel nested below a container');

  // Same shape, switch absent everywhere: the fix stays on. Guards against a
  // climb that reports "disabled" merely because a realm above exists.
  const clean = makeCandleInstance({ kill: false, panel: 'nested', speed: 60 });
  assert.equal(clean.rs._lagSetIntervalTickBoundEnabled(), true,
    'the presence of realms above must not by itself disable the fix');
  note('top-kill-reaches-nested-panel', true);
});

test('mutant: a self-window-only predicate leaves the fix ON inside the panel', () => {
  // The pre-W64 predicate read only its own window. Reproduce exactly that by
  // neutering both climbs, and show the host-side flip stops working.
  let mutated = replaceOnce(replaySource, CLIMB_PARENT, 'const parent = null; /* MUTANT */');
  mutated = replaceOnce(mutated, CLIMB_TOP, 'const top = null; /* MUTANT */');

  const { ReplaySystem, window } = loadReplay({
    kill: true,
    killIn: 'parent',
    panel: true,
    sourceOverride: mutated,
  });
  const rs = new ReplaySystem({ indicators: { active: [] }, rawData: [], data: [], currentTimeframe: '1m' });

  assert.equal(window[SWITCH], undefined, 'the panel window itself is clean, as in production');
  assert.equal(rs._lagSetIntervalTickBoundEnabled(), true,
    'without the climb the fix stays ON in the panel — the operator reverted nothing');
  note('mutant-no-climb-misses-panel', true);
});

test('an unreadable cross-origin parent must not disable the fix', () => {
  const { rs } = makeCandleInstance({ kill: false, panel: true, hostileParent: true, speed: 60 });
  assert.equal(rs._lagSetIntervalTickBoundEnabled(), true,
    'a realm we cannot read is not carrying an instruction for us; keep the shipped default');

  // A throwing parent must also not mask a switch set on the panel itself.
  const own = makeCandleInstance({ kill: true, killIn: 'self', panel: true, hostileParent: true, speed: 60 });
  assert.equal(own.rs._lagSetIntervalTickBoundEnabled(), false,
    'the own-window read must still stand when the parent chain throws');
  note('cross-origin-parent-fails-safe', true);
});

test('default ON keeps interval-handler work bounded (synthetic Violation oracle)', () => {
  const PAINT_MS = 70;
  const { rs, chart, flushRaf, pendingRaf } = makeCandleInstance({
    kill: false,
    paintCostMs: PAINT_MS,
    speed: 60,
  });
  const startIdx = rs.currentIndex;
  const handlerMs = [];
  for (let i = 0; i < 8; i++) {
    const t0 = performance.now();
    rs._runCandlePlaybackTick();
    handlerMs.push(performance.now() - t0);
  }
  const maxHandler = Math.max(...handlerMs);
  assert.ok(maxHandler < VIOLATION_MS, `handler max ${maxHandler}ms must be < ${VIOLATION_MS}`);
  assert.equal(chart.updateCalls, 0, 'paint deferred out of interval handler');
  assert.ok(pendingRaf() >= 1, 'rAF paint scheduled');
  assert.equal(rs.currentIndex, startIdx + 8, 'steps advanced inside handlers');
  flushRaf();
  assert.ok(chart.updateCalls >= 1, 'coalesced paint runs on rAF');
  note('bounded-handler', true, `max=${maxHandler.toFixed(2)}ms steps=${rs.currentIndex - startIdx}`);
});

// The three cells below close a hole this gate shipped with: it proved the paint
// leaves the interval handler, and never proved the paint still ARRIVES. D's
// order-lifecycle-event-ownership cell caught that by accident (it counted paints
// synchronously and saw zero) during the 07-29 reconciliation.

test('coalesced paint is deferred, not dropped — exactly one lands per tick', () => {
  const { rs, chart, flushRaf, pendingRaf } = makeCandleInstance({ kill: false, speed: 60 });
  const before = chart.updateCalls;
  rs._runCandlePlaybackTick();
  assert.equal(chart.updateCalls, before, 'bound path must not paint inside the handler');
  assert.equal(pendingRaf(), 1, 'exactly one coalesced paint queued, not one per step');
  flushRaf();
  assert.equal(chart.updateCalls, before + 1, 'the deferred paint must arrive, once');
  assert.equal(pendingRaf(), 0, 'and must not requeue itself');
  note('deferred-paint-arrives', true, `paints=${chart.updateCalls - before}`);
});

test('pause between tick and frame flushes the pending paint', () => {
  const { rs, chart, flushRaf, pendingRaf } = makeCandleInstance({ kill: false, speed: 60 });
  rs._runCandlePlaybackTick();
  const advancedIdx = rs.currentIndex;
  const painted = chart.updateCalls;
  assert.equal(pendingRaf(), 1, 'a paint is owed for the steps just advanced');

  // User hits pause in the gap between the interval handler and the frame.
  rs.isPlaying = false;
  rs._cancelCandlePlaybackPaint({ flush: true });

  assert.equal(chart.updateCalls, painted + 1,
    'the paused frame must show the playhead the tick already advanced');
  assert.equal(rs.currentIndex, advancedIdx, 'flushing must not move the playhead');
  flushRaf();
  assert.equal(chart.updateCalls, painted + 1, 'and the cancelled frame must not double-paint');
  note('pause-flushes-paint', true, `idx=${advancedIdx}`);
});

test('mutant: pausing without the flush leaves the chart a tick behind', () => {
  const { rs, chart, flushRaf } = makeCandleInstance({ kill: false, speed: 60 });
  const startIdx = rs.currentIndex;
  rs._runCandlePlaybackTick();
  const painted = chart.updateCalls;

  // Mutant = the pause path forgets _cancelCandlePlaybackPaint({ flush: true }).
  // The scheduled callback guards on isPlaying, so the owed paint is discarded and
  // the chart sits behind the playhead until some later interaction repaints it —
  // the "jitter until clicked" shape. This is why the flush call is load-bearing.
  rs.isPlaying = false;
  flushRaf();

  assert.equal(chart.updateCalls, painted, 'unflushed pause drops the owed paint');
  assert.ok(rs.currentIndex > startIdx, 'while the playhead did advance');
  note('mutant-unflushed-pause', true, `advanced=${rs.currentIndex - startIdx} painted=0`);
});

test('kill-switch restores sync full tick inside handler', () => {
  const PAINT_MS = 40;
  const { rs, chart, pendingRaf } = makeCandleInstance({
    kill: true,
    paintCostMs: PAINT_MS,
    speed: 60,
  });
  const startIdx = rs.currentIndex;
  const t0 = performance.now();
  rs._runCandlePlaybackTick();
  const handlerMs = performance.now() - t0;
  assert.equal(rs.currentIndex, startIdx + 1);
  assert.equal(chart.updateCalls, 1, 'legacy paints sync in tick');
  assert.equal(pendingRaf(), 0, 'no rAF coalesce when killed');
  assert.ok(handlerMs >= PAINT_MS * 0.8, `sync paint in handler (${handlerMs}ms)`);
  note('kill-restores-sync', true, `handler=${handlerMs.toFixed(2)}ms`);
});

test('speed semantics: steps completed match kill path across yield/batch', () => {
  const on = makeCandleInstance({ kill: false, paintCostMs: 5, speed: 60 });
  const off = makeCandleInstance({ kill: true, paintCostMs: 5, speed: 60 });
  const ticks = 12;
  for (let i = 0; i < ticks; i++) {
    on.rs._runCandlePlaybackTick();
    off.rs._runCandlePlaybackTick();
  }
  on.flushRaf();
  assert.equal(on.rs.currentIndex - 10, ticks);
  assert.equal(off.rs.currentIndex - 10, ticks);
  assert.equal(on.rs.currentIndex, off.rs.currentIndex, 'same playhead advance');
  note('speed-semantics', true, `steps=${ticks}`);
});

test('mutant that reintroduces unbounded sync paint in interval fails oracle', () => {
  const PAINT_MS = 70;
  const { rs, chart } = makeCandleInstance({ kill: false, paintCostMs: 0, speed: 60 });
  // Mutant: force sync paint inside the tick (legacy shape).
  const mutantTick = () => {
    const { stepsPerTick, orderMoneyPath } = rs.getCandlePlaybackCadence();
    const n = Math.max(1, stepsPerTick | 0);
    const evaluateSkippedMoneyPath = orderMoneyPath === true
      && rs._isOrderMoneyPathBatchEnabled();
    for (let i = 0; i < n; i++) {
      if (!rs.isPlaying || !rs.isActive) break;
      const skipChartUpdate = i < n - 1;
      rs.simpleStepForward({
        skipChartUpdate,
        evaluateOrderMoneyPath: evaluateSkippedMoneyPath,
      });
      if (!skipChartUpdate) {
        busy(PAINT_MS);
        chart.updateCalls += 1;
      }
    }
  };
  const handlerMs = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    mutantTick();
    handlerMs.push(performance.now() - t0);
  }
  const maxHandler = Math.max(...handlerMs);
  assert.ok(maxHandler >= VIOLATION_MS, `mutant must violate (max=${maxHandler})`);
  note('mutant-fails-oracle', true, `max=${maxHandler.toFixed(2)}ms`);
});

test('Phase A scorecard: opt2 wins Violation+speed; opt3 sync-fast fails oracle', () => {
  const INTERVAL_MS = 16;
  const SPEED = 60;
  const STEPS = Math.max(1, Math.round((SPEED * INTERVAL_MS) / 1000));
  const WALL_MS = 500;
  const STEP_MS = 0.4;
  const PAINT_MS = 70;
  const FAST_MS = 55;

  function summarize(name, handlers, candles, wall) {
    const max = handlers.length ? Math.max(...handlers) : 0;
    const viol = handlers.filter((h) => h >= VIOLATION_MS).length;
    return {
      name,
      maxHandlerMs: +max.toFixed(2),
      violationCount: viol,
      oraclePass: handlers.length > 0 && viol === 0 && max < VIOLATION_MS,
      candlesPerWallSec: +(candles / (wall / 1000)).toFixed(1),
      candles,
    };
  }

  /**
   * Single-thread event loop model:
   * - baseline/opt3: heavy work inside the interval callback (Violation source).
   * - opt1: cheap interval; paint drained on the turn before the next interval
   *   (oracle can pass, but cps collapses — paint still blocks advancement).
   * - opt2: cheap interval; paint on rAF. Missed intervals catch up after paint
   *   (browser queues setInterval callbacks), preserving slider candles/sec.
   */
  function run(mode) {
    const handlers = [];
    let candles = 0;
    let dirty = false;
    let rafDue = null;
    let paintDraining = false;
    const t0 = performance.now();
    let next = t0;
    while (performance.now() - t0 < WALL_MS) {
      const now = performance.now();

      if (mode === 'opt2' && dirty && rafDue != null && now >= rafDue) {
        busy(PAINT_MS);
        dirty = false;
        rafDue = null;
        continue;
      }
      if (mode === 'opt1' && paintDraining) {
        busy(PAINT_MS);
        paintDraining = false;
        continue;
      }

      if (now < next) {
        const wait = Math.min(0.2, next - now);
        if (wait > 0) busy(wait);
        else busy(0.05);
        continue;
      }

      // Catch up due interval ticks (opt2 after a long paint).
      while (performance.now() >= next && performance.now() - t0 < WALL_MS) {
        const h0 = performance.now();
        if (mode === 'baseline' || mode === 'opt3') {
          for (let i = 0; i < STEPS; i++) {
            busy(STEP_MS);
            candles += 1;
            if (i === STEPS - 1) busy(mode === 'opt3' ? FAST_MS : PAINT_MS);
          }
          handlers.push(performance.now() - h0);
          next += INTERVAL_MS;
          break; // sync heavy tick — no backlog catch-up inside one turn
        }
        for (let i = 0; i < STEPS; i++) {
          busy(STEP_MS);
          candles += 1;
        }
        handlers.push(performance.now() - h0);
        next += INTERVAL_MS;
        if (mode === 'opt1') {
          paintDraining = true;
          break; // drain paint before further interval catch-up
        }
        // opt2: mark dirty; coalesce paint
        dirty = true;
        if (rafDue == null) rafDue = performance.now() + 16;
      }
    }
    return summarize(mode, handlers, candles, performance.now() - t0);
  }

  const baseline = run('baseline');
  const opt1 = run('opt1');
  const opt2 = run('opt2');
  const opt3 = run('opt3');

  assert.equal(baseline.oraclePass, false, 'baseline violates');
  assert.equal(opt3.oraclePass, false, 'opt3 sync-fast still >=50ms');
  assert.equal(opt2.oraclePass, true, 'opt2 passes Violation oracle');
  assert.ok(
    opt2.candlesPerWallSec >= SPEED * 0.7,
    `opt2 preserves speed semantics (cps=${opt2.candlesPerWallSec})`,
  );
  assert.ok(
    opt2.candlesPerWallSec > opt1.candlesPerWallSec * 1.3,
    `opt2 beats budget on speed (opt2=${opt2.candlesPerWallSec} opt1=${opt1.candlesPerWallSec})`,
  );

  process.stdout.write(
    `SCORECARD baseline max=${baseline.maxHandlerMs} cps=${baseline.candlesPerWallSec} | `
    + `opt1 max=${opt1.maxHandlerMs} cps=${opt1.candlesPerWallSec} pass=${opt1.oraclePass} | `
    + `opt2 max=${opt2.maxHandlerMs} cps=${opt2.candlesPerWallSec} pass=${opt2.oraclePass} | `
    + `opt3 max=${opt3.maxHandlerMs} cps=${opt3.candlesPerWallSec} pass=${opt3.oraclePass}\n`,
  );
  note('phase-a-scorecard', true, 'winner=opt2 split compute/paint');
});

test('why updateChartDataFast missed candle path (static seam)', () => {
  assert.match(replaySource, /animateFastMode\([\s\S]*?this\.updateChartDataFast\(\)/);
  const tickBody = replaySource.match(
    /_runCandlePlaybackTick\(\) \{([\s\S]*?)\n    \}/,
  );
  assert.ok(tickBody, '_runCandlePlaybackTick extractable');
  assert.doesNotMatch(tickBody[1], /updateChartDataFast/);
  assert.match(replaySource, /simpleStepForward\([\s\S]*?this\.updateChartData\(/);
  note('fast-missed-path', true, 'candle→simpleStepForward→updateChartData; fast only animateFastMode');
});

test('homepage replay-system.js mirror is byte-identical (LF)', () => {
  const canon = fs.readFileSync(REPLAY_CANONICAL);
  const mirror = fs.readFileSync(REPLAY_MIRROR);
  assert.equal(canon.includes(Buffer.from([13])), false, 'canonical LF-only');
  assert.equal(mirror.includes(Buffer.from([13])), false, 'mirror LF-only');
  assert.equal(canon.equals(mirror), true, `sha=${sha256(canon)}`);
  note('mirrors-byte-identical', true);
});
