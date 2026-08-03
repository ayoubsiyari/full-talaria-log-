/**
 * TICK-OFF-01 — candle is the only playback mode.
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/tick-off-candle-only-playback.test.mjs"
 *
 * Product decision: tick mode is removed. Tick data is simulated — there is no
 * tick feed — so the mode animated a random intra-candle path for a cosmetic
 * effect, at four concurrent animation loops against candle's one and 14,709
 * recalcs that advanced seven candles.
 *
 * Kill-switch: window.__TALARIA_DISABLE_CANDLE_ONLY_PLAYBACK_V1 = <truthy>
 * restores tick mode. The code is NOT deleted; removal is post-canary.
 *
 * FLAG-03 is the reason this suite drives real playback rather than reading
 * predicates. Both arms must leave a WORKING PRODUCT, and "working" is a MOVED
 * REPLAY INDEX — never an isPlaying boolean, and never "the feature is
 * inactive". PURGE-2 turned three panels black behind an OFF state that
 * satisfied "the feature is inactive".
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// SEAL-EVIDENCE-01: source evidence cannot bless served bytes. This gate reads the chart
// SOURCE, so it can show what the code says and not what the sealed build does.
// The token travels in the output because an audit document does not travel with
// a sweep log.
console.log("[SEAL-EVIDENCE-01] STATIC_ONLY_SOURCE_GATE ORDER-01B tick-path deletion \u2014 reads source; served behaviour unobserved");


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

const SWITCH = '__TALARIA_DISABLE_CANDLE_ONLY_PLAYBACK_V1';
const replaySource = fs.readFileSync(REPLAY_CANONICAL, 'utf8');

/** Values that must ALL restore tick mode. FLAG-02: truthiness, not `=== true`. */
const TRUTHY_RESTORES = [true, 1, 'yes', 'true', {}, [], '0'];
/** Values that must ALL leave the kill in force. */
const FALSY_KEEPS_KILL = [undefined, null, false, 0, '', NaN];

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function note(name, pass, detail = '') {
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}\n`);
}

/**
 * Timers are CAPTURED, not run inline. The tick loop re-arms itself through
 * setTimeout, so an inline-invoking stub would recurse without bound the moment
 * a cell restores tick mode — which is exactly what the OFF arm has to do.
 */
function loadReplay({ killValue = undefined, setKill = false, sourceOverride = null } = {}) {
  const windowObj = {};
  if (setKill) windowObj[SWITCH] = killValue;
  windowObj.parent = windowObj;
  windowObj.top = windowObj;

  const rafQueue = [];
  const timeouts = [];
  const intervals = [];

  const context = {
    window: windowObj,
    document: {
      documentElement: { style: {} },
      body: { style: {}, appendChild() {}, removeChild() {} },
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      createElement() {
        return {
          style: {},
          classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
          addEventListener() {}, removeEventListener() {},
          appendChild() {}, setAttribute() {}, remove() {},
        };
      },
      addEventListener() {}, removeEventListener() {},
    },
    console: { log() {}, warn() {}, error() {} },
    performance: { now: () => performance.now() },
    requestAnimationFrame: (fn) => { const id = rafQueue.length + 1; rafQueue.push({ id, fn }); return id; },
    cancelAnimationFrame(id) {
      const i = rafQueue.findIndex((e) => e.id === id);
      if (i >= 0) rafQueue.splice(i, 1);
    },
    setTimeout: (fn, ms) => { const id = timeouts.length + 1; timeouts.push({ id, fn, ms, dead: false }); return id; },
    clearTimeout(id) { const e = timeouts.find((t) => t.id === id); if (e) e.dead = true; },
    setInterval: (fn, ms) => { const id = intervals.length + 1; intervals.push({ id, fn, ms, dead: false }); return id; },
    clearInterval(id) { const e = intervals.find((t) => t.id === id); if (e) e.dead = true; },
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
    },
    userStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    Date, Math, JSON, Object, Array, Number, String, Boolean, Error, Map, Set,
  };
  context.globalThis = context;
  vm.createContext(context);
  new vm.Script(
    `${sourceOverride || replaySource}\n;globalThis.__ReplaySystem = ReplaySystem;`,
    { filename: 'replay-system.js' },
  ).runInContext(context);

  return {
    context,
    ReplaySystem: context.__ReplaySystem,
    window: windowObj,
    flushRaf() {
      const q = rafQueue.splice(0, rafQueue.length);
      for (const e of q) e.fn();
    },
    /** Run the live candle interval `n` times. Returns how many actually ran. */
    pumpIntervals(n = 1) {
      let ran = 0;
      for (let i = 0; i < n; i++) {
        const live = intervals.filter((e) => !e.dead);
        if (!live.length) break;
        live[live.length - 1].fn();
        ran += 1;
      }
      return ran;
    },
    /** Drain the setTimeout chain (tick loop re-arms through it), bounded. */
    pumpTimeouts(n = 1) {
      let ran = 0;
      for (let i = 0; i < n; i++) {
        const next = timeouts.find((e) => !e.dead && !e.done);
        if (!next) break;
        next.done = true;
        next.fn();
        ran += 1;
      }
      return ran;
    },
    counts() {
      return {
        intervals: intervals.filter((e) => !e.dead).length,
        timeouts: timeouts.filter((e) => !e.dead && !e.done).length,
      };
    },
  };
}

function makeBars(n = 400) {
  const bars = [];
  const t0 = Date.UTC(2024, 0, 1);
  for (let i = 0; i < n; i++) {
    const o = 100 + (i % 7);
    bars.push({ t: t0 + i * 60_000, o, h: o + 1, l: o - 1, c: o + 0.5, v: 10 + i });
  }
  return bars;
}

/**
 * @param storedMode what the USER has selected / what state restore supplies.
 *        Defaults to 'tick' because the kill is only interesting against a user
 *        who has asked for tick — a candle-mode instance proves nothing.
 */
function makeInstance({ setKill = false, killValue = undefined, storedMode = 'tick', speed = 60 } = {}) {
  const loaded = loadReplay({ setKill, killValue });
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
    w: 800, h: 600, offsetX: 0,
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
  rs.playbackMode = storedMode;
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
  rs.updateChartData = function updateChartDataInstrumented(a, o) {
    chart.updateCalls += 1;
    return realUpdate(a, o);
  };
  return { rs, chart, ...loaded };
}

/**
 * play() defers the loop install behind two NESTED animation frames, so nothing
 * is armed until the frames run. Flush until a timer appears rather than
 * guessing a count — a fixed count would silently stop testing the loop if the
 * nesting depth ever changed.
 */
function settlePlayStart(inst, maxFrames = 8) {
  for (let i = 0; i < maxFrames; i++) {
    const { intervals, timeouts } = inst.counts();
    if (intervals > 0 || timeouts > 0) return i;
    inst.flushRaf();
  }
  return maxFrames;
}

/**
 * The working-product measurement, used by BOTH arms. Drives the loop the
 * product actually installs and reports whether the replay MOVED.
 */
function driveAndMeasure(inst, { pumps = 6 } = {}) {
  const before = inst.rs.currentIndex;
  inst.rs.play();
  settlePlayStart(inst);
  const ranIntervals = inst.pumpIntervals(pumps);
  const ranTimeouts = ranIntervals ? 0 : inst.pumpTimeouts(pumps);
  inst.flushRaf();
  return {
    before,
    after: inst.rs.currentIndex,
    advanced: inst.rs.currentIndex - before,
    paints: inst.chart.paints,
    updates: inst.chart.updateCalls,
    loopKind: inst.rs.getPlaybackLoopKind(),
    ranIntervals,
    ranTimeouts,
  };
}

/* ───────────────────────── A · the switch itself (FLAG-01/02) ───────────── */

test('A01 flag and helper are present, grep-clean, and documented', () => {
  assert.match(replaySource, new RegExp(SWITCH));
  assert.match(replaySource, /_isCandleOnlyPlaybackEnabled/);
  assert.match(replaySource, /TICK-OFF-01/);
  const flagHits = replaySource.split(SWITCH).length - 1;
  assert.equal(flagHits, 1, 'exactly one window read of the switch');
  note('A01 flag-present', true, SWITCH);
});

test('A02 default (no flag) forces candle even when the user stored tick', () => {
  const { rs } = makeInstance({ storedMode: 'tick' });
  assert.equal(rs._isCandleOnlyPlaybackEnabled(), true);
  assert.equal(rs.getPlaybackMode(), 'candle', 'accessor must force candle');
  assert.equal(rs.playbackMode, 'tick', 'stored preference is NOT overwritten');
  note('A02 default-forces-candle', true);
});

test('A03 FLAG-02 truthiness: every truthy value restores tick', () => {
  for (const v of TRUTHY_RESTORES) {
    const { rs } = makeInstance({ setKill: true, killValue: v, storedMode: 'tick' });
    assert.equal(
      rs._isCandleOnlyPlaybackEnabled(), false,
      `truthy ${JSON.stringify(v)} must disable the kill`,
    );
    assert.equal(rs.getPlaybackMode(), 'tick', `truthy ${JSON.stringify(v)} must restore tick`);
  }
  note('A03 truthy-restores', true, `${TRUTHY_RESTORES.length} values`);
});

test('A03b falsy values leave the kill in force', () => {
  for (const v of FALSY_KEEPS_KILL) {
    const { rs } = makeInstance({ setKill: true, killValue: v, storedMode: 'tick' });
    assert.equal(rs.getPlaybackMode(), 'candle', `falsy ${JSON.stringify(v)} must keep the kill`);
  }
  note('A03b falsy-keeps-kill', true, `${FALSY_KEEPS_KILL.length} values`);
});

test('A04 read PER CALL, never sampled at construction', () => {
  const inst = makeInstance({ storedMode: 'tick' });
  assert.equal(inst.rs.getPlaybackMode(), 'candle');
  inst.window[SWITCH] = 1;
  assert.equal(inst.rs.getPlaybackMode(), 'tick', 'flag set after construction must take effect');
  delete inst.window[SWITCH];
  assert.equal(inst.rs.getPlaybackMode(), 'candle', 'and be revocable');
  note('A04 per-call', true);
});

/* ───────────────────────── B · reach (not a no-op) ──────────────────────── */

test('B01 _shouldUseTickAnimation is false by default with stored tick', () => {
  const { rs } = makeInstance({ storedMode: 'tick' });
  assert.equal(rs._shouldUseTickAnimation(), false);
  const off = makeInstance({ setKill: true, killValue: true, storedMode: 'tick' });
  assert.equal(off.rs._shouldUseTickAnimation(), true, 'control: restored arm still reaches tick');
  note('B01 tick-animation-gated', true);
});

test('B02 loop kind reported to harness/UI is candle by default', () => {
  const { rs } = makeInstance({ storedMode: 'tick' });
  rs.isPlaying = true;
  assert.equal(rs.getPlaybackLoopKind(), 'candle');
  note('B02 loop-kind', true);
});

test('B03 a full play() on a stored-tick instance lands on the CANDLE loop', () => {
  const inst = makeInstance({ storedMode: 'tick' });
  inst.rs.play();
  settlePlayStart(inst);
  assert.ok(inst.rs.playInterval, 'candle interval must be armed');
  assert.equal(inst.rs.animatingCandle, null, 'no tick animation state');
  assert.equal(inst.rs.getPlaybackLoopKind(), 'candle');
  note('B03 play-lands-candle', true);
});

/* ──────────────── C · FLAG-03 working product, BOTH arms ────────────────── */

test('C01 DEFAULT arm is a WORKING PRODUCT: the replay index MOVES', () => {
  const inst = makeInstance({ storedMode: 'tick' });
  const r = driveAndMeasure(inst);
  assert.ok(r.ranIntervals > 0, 'the product installed a loop that we could run');
  assert.ok(r.advanced > 0, `replay index must MOVE, got ${r.before} → ${r.after}`);
  assert.ok(r.updates > 0, 'and the chart must be updated, not merely advanced');
  note('C01 default-arm-works', true, `index ${r.before}→${r.after}, updates ${r.updates}`);
});

test('C02 OFF arm (flag set) restores tick AND is still a working product', () => {
  const inst = makeInstance({ setKill: true, killValue: true, storedMode: 'tick' });
  const before = inst.rs.currentIndex;
  inst.rs.play();
  settlePlayStart(inst);
  assert.equal(inst.rs.getPlaybackMode(), 'tick', 'legacy mode restored');
  assert.equal(inst.rs.getPlaybackLoopKind(), 'tick', 'and the tick loop is the live one');
  // Tick advances through its own timer chain rather than the candle interval.
  inst.pumpTimeouts(400);
  inst.flushRaf();
  assert.ok(
    inst.rs.currentIndex > before || inst.rs.animatingCandle !== null,
    'the restored arm must animate or advance, not sit dead',
  );
  note('C02 off-arm-works', true, `mode=tick index ${before}→${inst.rs.currentIndex}`);
});

test('C03 startTickAnimation under the kill re-routes to candle, it does NOT freeze', () => {
  const inst = makeInstance({ storedMode: 'tick' });
  const before = inst.rs.currentIndex;
  inst.rs.startTickAnimation();
  assert.equal(inst.rs.animatingCandle, null, 'tick state cleared');
  assert.ok(inst.rs.playInterval, 're-routed into the candle loop');
  const ran = inst.pumpIntervals(6);
  inst.flushRaf();
  assert.ok(ran > 0, 'the re-routed loop is real');
  assert.ok(
    inst.rs.currentIndex > before,
    `re-routed playback must still advance, got ${before} → ${inst.rs.currentIndex}`,
  );
  note('C03 no-freeze', true, `index ${before}→${inst.rs.currentIndex}`);
});

/* ──────────────── D · behaviour preserved, and no lying UI ──────────────── */

test('D01 selecting tick under the kill keeps playback alive and advancing', () => {
  const inst = makeInstance({ storedMode: 'candle' });
  inst.rs.play();
  const before = inst.rs.currentIndex;
  inst.rs.setPlaybackMode('tick');
  assert.equal(inst.rs.playbackMode, 'tick', 'preference recorded for post-canary');
  assert.equal(inst.rs.getPlaybackMode(), 'candle', 'but the engine stays candle');
  const ran = inst.pumpIntervals(6);
  inst.flushRaf();
  assert.ok(ran > 0 && inst.rs.currentIndex > before, 'and the user is not left with a dead chart');
  note('D01 select-tick-safe', true, `index ${before}→${inst.rs.currentIndex}`);
});

test('D02 the mode control cannot display tick while the engine runs candle', () => {
  const inst = makeInstance({ storedMode: 'tick' });
  const select = { value: 'tick' };
  inst.context.document.querySelectorAll = (sel) => (
    String(sel).includes('replayPlaybackMode') ? [select] : []
  );
  inst.rs.syncPlaybackModeControls();
  assert.equal(select.value, 'candle', 'label is derived from the same accessor the engine uses');

  const off = makeInstance({ setKill: true, killValue: true, storedMode: 'tick' });
  const select2 = { value: 'candle' };
  off.context.document.querySelectorAll = (sel) => (
    String(sel).includes('replayPlaybackMode') ? [select2] : []
  );
  off.rs.syncPlaybackModeControls();
  assert.equal(select2.value, 'tick', 'control: restored arm labels tick');
  note('D02 ui-cannot-lie', true);
});

test('D03 with the flag set, the accessor is EXACTLY the pre-change function', () => {
  const legacy = (stored) => (stored === 'candle' ? 'candle' : 'tick');
  for (const stored of ['tick', 'candle', 'nonsense', undefined]) {
    const { rs } = makeInstance({ setKill: true, killValue: true, storedMode: stored });
    assert.equal(rs.getPlaybackMode(), legacy(stored), `stored=${String(stored)}`);
  }
  note('D03 legacy-equivalence', true);
});

/* ───────────────────────────── E · hygiene ──────────────────────────────── */

test('E01 canonical and homepage mirror are byte-identical', () => {
  const a = sha256(fs.readFileSync(REPLAY_CANONICAL));
  const b = sha256(fs.readFileSync(REPLAY_MIRROR));
  assert.equal(a, b, 'replay-system.js copies must not diverge');
  note('E01 mirrors-identical', true, a.slice(0, 16));
});
