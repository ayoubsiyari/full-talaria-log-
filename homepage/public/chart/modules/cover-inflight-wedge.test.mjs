/**
 * COVER-INFLIGHT-WEDGE — Chart.ensureReplayDataCoversTimestamp permanently wedges
 * its single in-flight slot whenever the async body settles before its first await.
 *
 *   cd "chart v 1.4/chart/modules"
 *   node --test --test-concurrency=1 cover-inflight-wedge.test.mjs
 *
 * The defect. The coalescer installs its promise AFTER the body has already run:
 *
 *     this._ensureReplayDataInflight = (async () => { ... finally { ... = null } })();
 *
 * When the body reaches its first `await` the ordering is harmless. When it exits
 * BEFORE that await, the body's finally clears the slot first and the outer
 * assignment then re-installs an already-settled promise. Nothing clears it again:
 * the only writers in chart.js are this install, that finally, _beginTimeframeSwitching
 * / _evictPanelMasterData (slot = null) and the constructor/reset sites. Every later
 * cover then short-circuits on the truthy slot and hands back a stale promise that
 * resolves false, so replay data acquisition NEVER FETCHES AGAIN until the next
 * timeframe switch BEGINS. On an independent-symbol multichart panel the panel can
 * never reach the host playhead; on a host tile / single chart cover silently dies.
 *
 * Reachable pre-await exits of the body (all four wedge the slot on tip):
 *   E1  generation superseded / this._timeframeSwitching / this._pairSwitchLoading
 *       ⇒ `return false` before any await.
 *   E2  _syncReplayMasterFromParentIfCovers(ts) ⇒ `return true` before any await.
 *   E3  a synchronous throw before the first await (replay.pause(), the topology
 *       helpers, or the fetch-range argument evaluation) ⇒ COVER-RESUME-GUARD's
 *       catch turns it into `return false`.
 *   E4  the same synchronous throw with __TALARIA_DISABLE_COVER_RESUME_GUARD_V1 set
 *       ⇒ the throw propagates and the slot wedges holding a REJECTED promise.
 * _pairSwitchLoading is the worst trigger: _beginPairSwitchLoading (:25083) does not
 * null the slot on entry and _endPairSwitchLoading (:25098) does not on exit, so
 * nothing in a pair switch ever unwedges it.
 *
 * Fix: window.__TALARIA_DISABLE_COVER_INFLIGHT_WEDGE_V1 (absent ⇒ fix ON, truthy ⇒
 * tip behaviour incl. the wedge, read per call). The invariant it establishes: the
 * slot is never left holding a settled promise, and it is only ever cleared by the
 * call that installed it.
 *
 * Oracle shape. Every wedge cell asserts the OBSERVABLE consequence — that LATER
 * cover calls, after the trigger clears, actually issue fetches — and counts them.
 * Asserting the slot right after one call would pass with the wedge intact, so the
 * white-box slot checks are secondary and always run after the fetch counts. Cell
 * order is behavioural first; source anchors are the last cell in the file.
 *
 * Every cell drives the REAL ensureReplayDataCoversTimestamp source extracted from
 * chart.js together with the real parseTimeframe / _normalizeBacktestTimeframe /
 * _replayRawHasWallClockPrefix / _smartResponseHasPayload / _mergeIntoPanelFullRawData
 * / _mcIndepCoverBridgeV1Enabled and the real COVER-LOOP-SAFETY + COVER-RESUME-GUARD
 * helpers (the bounded re-dispatch chain runs for real in every cell). Only the
 * network + multichart-topology helpers are stubbed (see STUBS below).
 *
 * Single-canonical suite — do NOT mirror under homepage/public.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const SWITCH_WEDGE = '__TALARIA_DISABLE_COVER_INFLIGHT_WEDGE_V1';
const SWITCH_RESUME = '__TALARIA_DISABLE_COVER_RESUME_GUARD_V1';
const SWITCH_BOUND = '__TALARIA_DISABLE_COVER_REDISPATCH_BOUND_V1';

/** Pinned parent of this packet — the "current tip" the kill-switch must reproduce. */
const TIP_REV = '1ce28275c';

/** Bound shipped by COVER-LOOP-SAFETY: attempts the re-dispatch chain adds per call. */
const REDISPATCH_LIMIT = 6;
/** Cover calls one external call is expected to produce on a stalled fixture. */
const CALLS_PER_STALLED_COVER = 1 + REDISPATCH_LIMIT;

/** Harness bound so a runaway chain asserts on a count instead of hanging. */
const HARD_CAP = 200;

const TF_MS = 60_000;
const T0 = Date.UTC(2024, 0, 2, 14, 0, 0);
const MASTER_BARS = 10;
/** Target sits this many 1m bars past the initial master frontier. */
const TARGET_STEPS = 400;

function findRoot(start) {
  let cursor = path.resolve(start);
  for (;;) {
    const chart = path.join(cursor, 'chart v 1.4', 'chart', 'chart.js');
    const gitPath = path.join(cursor, '.git');
    if (fs.existsSync(chart) && fs.existsSync(gitPath)) return cursor;
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

function note(name, pass, detail = '') {
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}\n`);
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function methodSource(text, name, { optional = false } = {}) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(
    `^    (?:async\\s+)?${escaped}\\s*\\([^]*?(?=^    (?:async\\s+)?[A-Za-z_$][\\w$]*\\s*\\(|^})`,
    'm',
  ));
  if (!match) {
    if (optional) return '';
    throw new Error(`method ${name} missing from chart.js`);
  }
  return match[0].replace(/\n+$/, '\n');
}

function wsTolerantPattern(literal) {
  const parts = String(literal).trim().split(/\s+/).map((part) =>
    part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(parts.join('\\s+'));
}

/** Replace exactly one whitespace-tolerant occurrence of `from` inside `text`. */
function replaceOnce(text, from, to, label) {
  const re = new RegExp(wsTolerantPattern(from).source, 'g');
  const matches = [...text.matchAll(re)];
  assert.equal(matches.length, 1, `${label}: expected exactly one anchor, found ${matches.length}`);
  const m = matches[0];
  return text.slice(0, m.index) + to + text.slice(m.index + m[0].length);
}

/** Mutate one method body inside the full source (spliced back byte-for-byte elsewhere). */
function mutateMethod(source, methodName, from, to, label) {
  const original = methodSource(source, methodName);
  const mutated = replaceOnce(original, from, to, label);
  assert.notEqual(mutated, original, `${label}: mutation produced no change`);
  const out = source.replace(original, mutated);
  assert.notEqual(out, source, `${label}: splice back into chart.js failed`);
  return out;
}

let TIP_SOURCE_CACHE = null;
function loadTipChartSource() {
  if (TIP_SOURCE_CACHE) return TIP_SOURCE_CACHE;
  const out = execFileSync(
    'git',
    ['-c', 'core.autocrlf=false', 'show', `${TIP_REV}:chart v 1.4/chart/chart.js`],
    { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 },
  );
  TIP_SOURCE_CACHE = Buffer.isBuffer(out) ? out.toString('utf8') : String(out);
  return TIP_SOURCE_CACHE;
}

/** Real product methods every cell runs (never paraphrased). */
const REAL_METHODS = [
  'ensureReplayDataCoversTimestamp',
  'parseTimeframe',
  '_normalizeBacktestTimeframe',
  '_replayRawHasWallClockPrefix',
  '_smartResponseHasPayload',
  '_mergeIntoPanelFullRawData',
  '_mcIndepCoverBridgeV1Enabled',
  '_coverRedispatchBoundEnabled',
  '_coverRedispatchMaxAttempts',
  '_resetCoverRedispatchBudget',
  '_coverRedispatchShouldRearm',
  '_coverResumeGuardEnabled',
];

/*
 * The kill-switch is read INLINE inside ensureReplayDataCoversTimestamp rather than
 * through a `_coverInflightWedgeGuardEnabled()` helper on purpose: the neighbouring
 * single-canonical suites extract a FIXED list of methods from chart.js, so a new
 * sibling method called from the cover body would make every one of them throw
 * "is not a function". There is therefore no fix-only method to extract, and the
 * flag semantics are asserted end-to-end instead of by calling a helper.
 */
const FIX_METHODS = [];

const BODY_CACHE = new Map();
function classBodyFor(source) {
  if (BODY_CACHE.has(source)) return BODY_CACHE.get(source);
  const body = REAL_METHODS.map((n) => methodSource(source, n))
    .concat(FIX_METHODS.map((n) => methodSource(source, n, { optional: true })))
    .filter(Boolean)
    .join('\n');
  BODY_CACHE.set(source, body);
  return body;
}

function barAt(t) {
  return { t, o: 1.1, h: 1.2, l: 1.0, c: 1.15, v: 10 };
}

function barsFrom(firstT, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(barAt(firstT + i * TF_MS));
  return out;
}

function payloadFromBars(bars) {
  return {
    candles: bars,
    returned: bars.length,
    total: bars.length,
    first_cursor: bars.length ? bars[0].t : null,
    last_cursor: bars.length ? bars[bars.length - 1].t : null,
    has_more_left: true,
    has_more_right: true,
    source: 'test-scripted',
  };
}

/*
 * STUBS (and what they leave unverified)
 *  - _fetchIndependentReplayBridge / _fetchReplaySeekBuffer / _fetchSmartWindow:
 *    scripted per cover attempt (`plan`). The real 24-chunk walk, its cursor
 *    arithmetic and real HTTP behaviour are NOT exercised. `gateFetches` suspends
 *    them on an explicit gate so a cell can hold a cover genuinely in flight.
 *  - _ingestSmartWindowResult: installs result.candles as this.rawData. Real ingest
 *    (resample caches, indicator/paint side effects) is NOT exercised.
 *  - _isIndependentMultichartPair / _multichartSamePairAsHost / _isMultichartEmbedPanel
 *    / _isMultichartHostPanel / _multichartFinerSamePairPanelSelfOwns /
 *    _multichartReplayNeedsFineMaster / _ensureFinerPanelOwnerCoversPlayhead: fixed
 *    topology answers; real window.parent probing is NOT exercised.
 *  - _syncReplayMasterFromParentIfCovers: scripted per call index so the E2
 *    (`return true` before any await) exit can be reached from INSIDE the body only
 *    — the call at :7946 happens before the slot is installed and cannot wedge.
 *  - _independentMasterCoversReplayTimestamp: delegates to the REAL
 *    _replayRawHasWallClockPrefix over _panelFullRawData (no interior-hole /
 *    bridge-margin logic).
 *  - _independentMasterInteriorHoleNearPlayhead: always null (no hole cases).
 *  - _reseedReplayFullRawFromLoadedData / _applyIndependentPanelReplaySlice /
 *    _trimLastDataBarToReplayPlayhead / _emitMultichartHostDataCommit / resampleData
 *    / _getBacktestReplayFetchRange / _getLazyReplayMasterFetchRange /
 *    _backtestFetchLimitForTimeframe / _lazyReplayMasterSmartLimit /
 *    _captureReplayPlayheadMs: minimal stand-ins.
 *  - replaySystem: object with pause/play/updateChartData/
 *    syncCurrentIndexFromReplayTimestamp; pause/play only flip isPlaying and log an
 *    event. Real ReplaySystem timer/tick behaviour is NOT exercised.
 *  - _beginTimeframeSwitching / _endTimeframeSwitching / _beginPairSwitchLoading /
 *    _endPairSwitchLoading are NOT extracted: the cells set/clear
 *    _timeframeSwitching / _pairSwitchLoading (and, where stated, bump
 *    _ensureReplayDataGeneration + null the slot exactly as
 *    _beginTimeframeSwitching :24616-24619 does) directly. The rest of those two
 *    switch paths is NOT exercised.
 * The forceFineMaster / lazy-fine-master branch is not covered by any cell.
 */
function makeHarness(opts = {}) {
  const {
    source = CHART_SOURCE,
    killWedge = undefined,
    killResume = undefined,
    killBound = undefined,
    mode = 'independent',
    isPlaying = true,
    hardCap = HARD_CAP,
    targetSteps = TARGET_STEPS,
    masterBars = MASTER_BARS,
    plan = () => 'dry',
    timeframeSwitching = false,
    pairSwitchLoading = false,
    // Number of the harness-visible cover call whose replay.pause() throws
    // synchronously (a pre-await throw). 0 = never.
    pauseThrowsOnCall = 0,
    // Harness-visible cover calls on which the INSIDE-the-body
    // _syncReplayMasterFromParentIfCovers answers true (the E2 exit).
    parentCoversOnCall = 0,
    gateFetches = false,
  } = opts;

  const warns = [];
  const sandbox = {
    console: {
      log() {},
      error() {},
      warn(...args) {
        warns.push(args.map((a) => String(a && a.message ? a.message : a)).join(' '));
      },
    },
    Math,
    JSON,
    Object,
    Array,
    Number,
    String,
    Boolean,
    Error,
    Map,
    Set,
    Symbol,
    Promise,
    Date,
    isNaN,
    NaN,
    Infinity,
  };
  sandbox.globalThis = sandbox;
  const win = {
    [SWITCH_WEDGE]: killWedge,
    [SWITCH_RESUME]: killResume,
    [SWITCH_BOUND]: killBound,
  };
  sandbox.window = win;
  sandbox.document = { documentElement: { classList: { contains: () => false } } };

  vm.createContext(sandbox);
  vm.runInContext(`
class WedgeHarness {
    constructor() {
        this.currentTimeframe = '1m';
        this.rawData = null;
        this.data = null;
        this.loadedRanges = new Map();
        this.isBacktestMode = true;
        this.replaySystem = null;
        this._panelFullRawData = null;
        this._nativeRawFetchTf = '1m';
        this._timeframeSwitching = false;
        this._pairSwitchLoading = false;
        this._ensureReplayDataGeneration = 1;
        this._ensureReplayDataInflight = null;
        this._ensureReplayDataTargetTs = null;
        this._serverCursors = null;
    }
${classBodyFor(source)}
}
globalThis.__cover = new WedgeHarness();
`, sandbox);

  const chart = sandbox.__cover;
  const target = T0 + (masterBars - 1 + targetSteps) * TF_MS;
  const initialMaster = barsFrom(T0, masterBars);

  const world = {
    mode,
    target,
    warns,
    calls: 0,
    attempt: 0,
    hitHardCap: false,
    bridgeCalls: 0,
    seekCalls: 0,
    smartCalls: 0,
    ingestCalls: 0,
    inflightHits: 0,
    parentSyncCalls: 0,
    events: [],
    rejectedAttempts: [],
    /** Harness-visible cover call each fetch was issued from. */
    fetchAttempts: [],
    gateResolvers: [],
    stepByAttempt: new Map(),
    currentStep: { kind: 'dry' },
    fetches() {
      return this.bridgeCalls + this.seekCalls + this.smartCalls;
    },
    planFor(n) {
      if (!this.stepByAttempt.has(n)) {
        const step = plan(n);
        this.stepByAttempt.set(n, typeof step === 'string' ? { kind: step } : (step || { kind: 'dry' }));
      }
      return this.stepByAttempt.get(n);
    },
    masterLastT() {
      const m = mode === 'independent'
        ? chart._panelFullRawData
        : (chart.replaySystem && chart.replaySystem.fullRawData);
      return Array.isArray(m) && m.length ? Number(m[m.length - 1].t) : NaN;
    },
    releaseGate(i) {
      const r = this.gateResolvers[i];
      assert.ok(typeof r === 'function', `gate ${i} was never opened (have ${this.gateResolvers.length})`);
      r();
    },
    releaseAllGates() {
      for (const r of this.gateResolvers) r();
    },
  };

  chart.currentFileId = 'FILE-1';
  chart.backtestingSession = { startDate: '2024-01-02', endDate: '2024-01-03' };
  chart._timeframeSwitching = timeframeSwitching;
  chart._pairSwitchLoading = pairSwitchLoading;
  chart.rawData = initialMaster.slice();
  chart.data = initialMaster.slice();

  const replay = {
    isActive: true,
    isPlaying,
    fullRawData: initialMaster.slice(),
    fullData: null,
    currentIndex: masterBars - 1,
    playheadMs: target,
    sessionStartIndex: 0,
    tickPathCache: {},
    tickPathCacheBuilt: false,
    pause() {
      if (pauseThrowsOnCall && world.attempt === pauseThrowsOnCall) {
        world.events.push({ attempt: world.attempt, kind: 'pause-throw' });
        throw new Error('cover-pause-boom');
      }
      this.isPlaying = false;
      world.events.push({ attempt: world.attempt, kind: 'pause' });
    },
    play() {
      this.isPlaying = true;
      world.events.push({ attempt: world.attempt, kind: 'play' });
    },
    syncCurrentIndexFromReplayTimestamp() {},
    updateChartData() {},
  };
  chart.replaySystem = replay;
  chart._panelFullRawData = mode === 'independent' ? initialMaster.slice() : null;

  // ---- stubs: multichart topology -----------------------------------------
  chart._isMultichartEmbedPanel = () => mode === 'samePair';
  chart._isMultichartHostPanel = () => false;
  chart._multichartSamePairAsHost = () => mode === 'samePair';
  chart._multichartReplayNeedsFineMaster = () => false;
  chart._multichartFinerSamePairPanelSelfOwns = () => false;
  chart._ensureFinerPanelOwnerCoversPlayhead = async () => false;
  chart._syncReplayMasterFromParentIfCovers = () => {
    world.parentSyncCalls += 1;
    // The pre-install call at :7946 must answer false or no promise is ever
    // created; only the call INSIDE the body (:7991) can take the E2 exit.
    if (!parentCoversOnCall || world.attempt !== parentCoversOnCall) return false;
    return world.parentSyncInBody === true;
  };
  chart._isIndependentMultichartPair = () => mode === 'independent';
  chart._independentMasterCoversReplayTimestamp = function (ts) {
    // Faithful outcome for these fixtures: the master must actually bracket ts
    // (delegates to the REAL prefix helper, not a constant).
    return this._replayRawHasWallClockPrefix(this._panelFullRawData, Number(ts));
  };
  chart._independentMasterInteriorHoleNearPlayhead = () => null;
  chart._reseedReplayFullRawFromLoadedData = () => {
    replay.fullRawData = Array.isArray(chart._panelFullRawData)
      ? chart._panelFullRawData.slice()
      : [];
  };
  chart._applyIndependentPanelReplaySlice = () => {};
  chart._captureReplayPlayheadMs = (rs) => (rs && rs.playheadMs) || target;
  chart._emitMultichartHostDataCommit = () => {};

  // ---- stubs: network ------------------------------------------------------
  const serve = () => {
    const step = world.currentStep;
    const lastT = world.masterLastT();
    const from = Number.isFinite(lastT) ? lastT + TF_MS : T0;
    if (step.kind === 'noPayload') return null;
    if (step.kind === 'dry') {
      // The chunk returned only bars we already have (weekend/holiday hole): the
      // fetch succeeded but the master frontier does not move, so the target stays
      // uncovered and every later cover must fetch again.
      const m = mode === 'independent' ? chart._panelFullRawData : replay.fullRawData;
      return payloadFromBars(m.slice(Math.max(0, m.length - 3)));
    }
    if (step.kind === 'cover') {
      const count = Math.max(1, Math.round((target + 2 * TF_MS - from) / TF_MS) + 1);
      return payloadFromBars(barsFrom(from, count));
    }
    return payloadFromBars(barsFrom(from, step.bars || 12));
  };

  const takeGate = () => {
    let resolve;
    const p = new Promise((res) => { resolve = res; });
    world.gateResolvers.push(resolve);
    return p;
  };
  const suspend = async () => {
    if (gateFetches) await takeGate();
  };

  chart._fetchIndependentReplayBridge = async () => {
    world.bridgeCalls += 1;
    world.fetchAttempts.push(world.attempt);
    await suspend();
    return serve();
  };
  chart._fetchReplaySeekBuffer = async () => {
    world.seekCalls += 1;
    world.fetchAttempts.push(world.attempt);
    await suspend();
    return serve();
  };
  chart._fetchSmartWindow = async () => {
    world.smartCalls += 1;
    world.fetchAttempts.push(world.attempt);
    await suspend();
    return serve();
  };
  chart._getBacktestReplayFetchRange = () => ({ from: T0, to: target });
  chart._getLazyReplayMasterFetchRange = () => ({ from: T0, to: target });
  chart._backtestFetchLimitForTimeframe = () => 2000;
  chart._lazyReplayMasterSmartLimit = () => 100_000;
  chart._ingestSmartWindowResult = (result) => {
    world.ingestCalls += 1;
    chart.rawData = Array.isArray(result.candles) ? result.candles.slice() : [];
  };
  chart.resampleData = (raw) => (Array.isArray(raw) ? raw.slice() : []);
  chart._trimLastDataBarToReplayPlayhead = () => {};

  // ---- instrumentation: count every cover invocation, bound the chain ------
  const real = Object.getPrototypeOf(chart).ensureReplayDataCoversTimestamp;
  chart.ensureReplayDataCoversTimestamp = function (...args) {
    world.calls += 1;
    world.attempt = world.calls;
    world.currentStep = world.planFor(world.calls);
    // The E2 exit lives inside the body; the identical helper is also called before
    // the slot is installed. This flag flips after the pre-install call answered.
    world.parentSyncInBody = false;
    if (world.calls > hardCap) {
      world.hitHardCap = true;
      return Promise.resolve(false);
    }
    if (chart._ensureReplayDataInflight) world.inflightHits += 1;
    const attempt = world.attempt;
    const p = real.apply(this, args);
    // Tip rejects on a pre-await throw with the resume guard off; swallow on a
    // DERIVED promise only (the original still rejects for the awaiter) so an
    // unhandled rejection cannot kill the test process.
    if (p && typeof p.catch === 'function') {
      p.catch(() => { world.rejectedAttempts.push(attempt); });
    }
    return p;
  };
  // Flip parentSyncInBody once the pre-install probe has answered.
  const realSync = chart._syncReplayMasterFromParentIfCovers;
  chart._syncReplayMasterFromParentIfCovers = function (ts) {
    const out = realSync.call(this, ts);
    world.parentSyncInBody = true;
    return out;
  };

  return { chart, world, win, sandbox, replay, target };
}

/** Drain the microtask-driven re-dispatch chain; stops when the call count settles. */
async function drain(world, { rounds = 900, stableRounds = 6 } = {}) {
  let last = -1;
  let stable = 0;
  for (let i = 0; i < rounds; i++) {
    await new Promise((r) => setImmediate(r));
    if (world.calls === last) {
      stable += 1;
      if (stable >= stableRounds) return;
    } else {
      stable = 0;
      last = world.calls;
    }
  }
}

async function captureOutcome(promise) {
  try {
    return { ok: true, value: await promise };
  } catch (err) {
    return { ok: false, message: String(err && err.message ? err.message : err) };
  }
}

/** Run one cover call to completion, then drain the self-re-dispatch chain. */
async function runCover(h, ts = h.target) {
  const first = await captureOutcome(h.chart.ensureReplayDataCoversTimestamp(ts));
  await drain(h.world);
  return first;
}

/**
 * Open every gate (repeatedly — a re-dispatch may open new ones) and settle the
 * given cover promises. Without this a mutant/tip run that opens an extra fetch
 * the cell did not plan for would hang instead of failing its assertion.
 */
async function settleAll(h, promises) {
  const outcomes = promises.map(captureOutcome);
  for (let i = 0; i < 40; i++) {
    h.world.releaseAllGates();
    await new Promise((r) => setImmediate(r));
  }
  return Promise.all(outcomes);
}

// =========================================================================
// The wedge probe: enter on a pre-await exit, clear the trigger, then make
// N further cover calls and count the fetches EACH of them issues.
// =========================================================================

const TRIGGERS = {
  timeframe: {
    label: '_timeframeSwitching',
    arm: (h) => { h.chart._timeframeSwitching = true; },
    clear: (h) => { h.chart._timeframeSwitching = false; },
  },
  pair: {
    label: '_pairSwitchLoading',
    arm: (h) => { h.chart._pairSwitchLoading = true; },
    clear: (h) => { h.chart._pairSwitchLoading = false; },
  },
};

/**
 * @param {object} opts
 *  - trigger: key of TRIGGERS, or null for the synchronous-throw entry
 *  - clearWhen: 'sync' (clear before awaiting the entry promise) | 'settled' |
 *               'macrotask' — the flag TIMING production varies
 *  - laterCalls: how many further covers to make (production varies this too)
 */
async function wedgeProbe(opts = {}) {
  const {
    trigger = 'timeframe',
    clearWhen = 'settled',
    laterCalls = 3,
    mode = 'independent',
    ...rest
  } = opts;
  const t = trigger ? TRIGGERS[trigger] : null;
  const h = makeHarness({
    mode,
    isPlaying: true,
    plan: () => 'dry',
    timeframeSwitching: trigger === 'timeframe',
    pairSwitchLoading: trigger === 'pair',
    ...rest,
  });

  const entryPromise = h.chart.ensureReplayDataCoversTimestamp(h.target);
  if (t && clearWhen === 'sync') t.clear(h);
  const entry = await captureOutcome(entryPromise);
  if (t && clearWhen === 'settled') t.clear(h);
  await drain(h.world);
  if (t && clearWhen === 'macrotask') t.clear(h);
  const entryFetches = h.world.fetches();
  const entryCalls = h.world.calls;

  const later = [];
  for (let i = 0; i < laterCalls; i++) {
    const beforeFetches = h.world.fetches();
    const beforeCalls = h.world.calls;
    const out = await runCover(h);
    later.push({
      ok: out.ok,
      value: out.value,
      fetches: h.world.fetches() - beforeFetches,
      calls: h.world.calls - beforeCalls,
      inflightNullAfter: h.chart._ensureReplayDataInflight === null,
    });
  }

  return {
    h,
    entry,
    entryFetches,
    entryCalls,
    later,
    totalFetches: h.world.fetches(),
    fetchesPerLater: later.map((l) => l.fetches),
    inflightNullAfterEntry: h.chart._ensureReplayDataInflight === null,
    isPlayingAfter: h.replay.isPlaying,
    warns: h.world.warns.length,
  };
}

/** Every later cover must actually go to the network. This is the whole oracle. */
function assertLaterCoversFetch(r, label) {
  const detail = `${label}: entryFetches=${r.entryFetches} `
    + `fetchesPerLater=${JSON.stringify(r.fetchesPerLater)} `
    + `totalFetches=${r.totalFetches} laterValues=${JSON.stringify(r.later.map((l) => l.value))}`;
  r.later.forEach((l, i) => {
    assert.ok(
      l.fetches >= 1,
      `${label}: later cover #${i + 1} issued ZERO fetches — the in-flight slot is wedged `
      + `with a settled promise, so replay data acquisition is dead. ${detail}`,
    );
    assert.equal(l.ok, true, `${label}: later cover #${i + 1} must resolve, not reject. ${detail}`);
  });
  assert.ok(
    r.totalFetches >= r.later.length,
    `${label}: expected at least one fetch per later cover. ${detail}`,
  );
  return detail;
}

// =========================================================================
// GATE 1 — behavioural: the wedge, on both triggers and both panel shapes
// =========================================================================

const MODES = ['independent', 'samePair'];

for (const mode of MODES) {
  for (const key of Object.keys(TRIGGERS)) {
    test(`GATE1 [${mode}]: entering with ${TRIGGERS[key].label} truthy must not kill all later covers`, async () => {
      const r = await wedgeProbe({ trigger: key, mode, laterCalls: 3 });

      // Behavioural first: the entry declines (unchanged contract) and every later
      // cover, after the flag cleared, really fetches.
      assert.equal(r.entry.ok, true, 'the entry cover must resolve, not reject');
      assert.equal(r.entry.value, false,
        'a panel mid switch must still DECLINE to cover (the return contract is unchanged)');
      assert.equal(r.entryFetches, 0, 'and it must not fetch while the switch is in flight');
      const detail = assertLaterCoversFetch(r, `${mode}/${key}`);

      // Each later cover on this stalled fixture is one external call plus the
      // COVER-LOOP-SAFETY bounded chain, every attempt of which fetches.
      assert.deepEqual(r.fetchesPerLater, r.later.map(() => CALLS_PER_STALLED_COVER),
        `each later cover must run its full bounded chain of fetches — ${detail}`);
      assert.equal(r.h.world.hitHardCap, false, 'no runaway chain');
      note(`gate1-${mode}-${key}`, true, detail);

      // White-box, deliberately last: the slot must never retain a settled promise.
      assert.equal(r.inflightNullAfterEntry, true,
        'the in-flight slot still holds the settled early-exit promise');
      assert.ok(r.later.every((l) => l.inflightNullAfter),
        'the in-flight slot must be clear after every settled cover');
    });
  }
}

test('GATE1: flag TIMING and the number of later covers are both varied', async () => {
  // Rule: a cell must vary what production varies. A switch can clear before the
  // caller even awaits the declined promise, right after it settles, or a macrotask
  // later; and the panel may make one further cover or many.
  const rows = [];
  for (const mode of MODES) {
    for (const key of Object.keys(TRIGGERS)) {
      for (const clearWhen of ['sync', 'settled', 'macrotask']) {
        for (const laterCalls of [1, 3, 5]) {
          const r = await wedgeProbe({ trigger: key, mode, clearWhen, laterCalls });
          const label = `${mode}/${key}/clear-${clearWhen}/n=${laterCalls}`;
          assertLaterCoversFetch(r, label);
          rows.push(`${label}:${JSON.stringify(r.fetchesPerLater)}`);
        }
      }
    }
  }
  note('gate1-timing-matrix', true, `${rows.length} combinations, e.g. ${rows[0]} … ${rows[rows.length - 1]}`);
  assert.equal(rows.length, MODES.length * 2 * 3 * 3);
});

test('GATE1: E2 — a parent master that already covers ts returns true before any await', async () => {
  // The other non-throwing pre-await exit. It must keep returning true, and must
  // not wedge the slot for the covers that follow.
  for (const mode of MODES) {
    const h = makeHarness({ mode, isPlaying: true, plan: () => 'dry', parentCoversOnCall: 1 });
    const first = await runCover(h);
    assert.equal(first.ok, true, `${mode}: must resolve`);
    assert.equal(first.value, true, `${mode}: the parent-covers exit must still report true`);
    assert.equal(h.world.fetchAttempts.includes(1), false,
      `${mode}: the parent-covers exit itself must not fetch`);

    const before = h.world.fetches();
    const second = await runCover(h);
    assert.equal(second.ok, true);
    assert.ok(h.world.fetches() - before >= 1,
      `${mode}: the next cover after the parent-covers exit issued ZERO fetches `
      + `(slot wedged with a settled TRUE promise — every later caller is told the `
      + `playhead is covered when it is not)`);
    assert.equal(second.value, false, `${mode}: the next cover reports the real (stalled) outcome`);
    assert.equal(h.chart._ensureReplayDataInflight, null, `${mode}: slot clear`);
  }
  note('gate1-e2-parent-covers', true);
});

// =========================================================================
// GATE 2 — behavioural: the synchronous-throw variants (E3 / E4)
// =========================================================================

test('GATE2: a pre-await synchronous throw must not wedge the slot (resume guard ON ⇒ resolved false)', async () => {
  for (const mode of MODES) {
    // replay.pause() throws on call 1 only — before the first await, and before any
    // fetch. The COVER-RESUME-GUARD catch turns it into `return false`, which on tip
    // is exactly the silent variant: wedged, and no longer observable through the
    // bridge's .catch() handlers.
    const h = makeHarness({ mode, isPlaying: true, plan: () => 'dry', pauseThrowsOnCall: 1 });
    const first = await captureOutcome(h.chart.ensureReplayDataCoversTimestamp(h.target));
    assert.equal(first.ok, true, `${mode}: the guard converts the throw to a resolved false`);
    assert.equal(first.value, false, `${mode}: never a bogus true`);
    await drain(h.world);
    assert.equal(h.world.fetchAttempts.includes(1), false,
      `${mode}: the throw beat the fetch on the entry call`);

    const before = h.world.fetches();
    const later = [];
    for (let i = 0; i < 3; i++) {
      const f0 = h.world.fetches();
      const out = await runCover(h);
      later.push({ ok: out.ok, value: out.value, fetches: h.world.fetches() - f0 });
    }
    const detail = `${mode}: warns=${JSON.stringify(h.world.warns.slice(0, 1))} `
      + `fetchesPerLater=${JSON.stringify(later.map((l) => l.fetches))} `
      + `total=${h.world.fetches() - before}`;
    later.forEach((l, i) => {
      assert.ok(l.fetches >= 1,
        `${mode}: cover #${i + 1} after a pre-await throw issued ZERO fetches — the throw `
        + `wedged the slot with a settled false promise. ${detail}`);
      assert.equal(l.ok, true, `${mode}: later covers must resolve. ${detail}`);
    });
    assert.match(h.world.warns[0], /^ensureReplayDataCoversTimestamp: cover failed/,
      `${mode}: the throw is still diagnosed`);
    note(`gate2-throw-guarded-${mode}`, true, detail);
    assert.equal(h.chart._ensureReplayDataInflight, null, `${mode}: slot clear after the throw`);
  }
});

test('GATE2: the same throw with the resume kill-switch set must not wedge a REJECTED promise', async () => {
  for (const mode of MODES) {
    const h = makeHarness({
      mode, isPlaying: true, plan: () => 'dry', pauseThrowsOnCall: 1, killResume: true,
    });
    const first = await captureOutcome(h.chart.ensureReplayDataCoversTimestamp(h.target));
    assert.equal(first.ok, false, `${mode}: with the resume guard off the throw must propagate`);
    assert.match(first.message, /cover-pause-boom/, `${mode}: the real error survives`);
    await drain(h.world);
    assert.equal(h.world.fetchAttempts.includes(1), false,
      `${mode}: the throw beat the fetch on the entry call`);

    const later = [];
    for (let i = 0; i < 3; i++) {
      const f0 = h.world.fetches();
      const out = await runCover(h);
      later.push({ ok: out.ok, value: out.value, fetches: h.world.fetches() - f0 });
    }
    const detail = `${mode}: fetchesPerLater=${JSON.stringify(later.map((l) => l.fetches))} `
      + `laterOk=${JSON.stringify(later.map((l) => l.ok))}`;
    later.forEach((l, i) => {
      assert.ok(l.fetches >= 1,
        `${mode}: cover #${i + 1} after a rejecting pre-await throw issued ZERO fetches — the `
        + `slot is wedged holding the REJECTED promise, so every later caller inherits a `
        + `rejection it did not cause. ${detail}`);
      assert.equal(l.ok, true,
        `${mode}: a later cover must not inherit the earlier rejection. ${detail}`);
    });
    note(`gate2-throw-rejecting-${mode}`, true, detail);
    assert.equal(h.chart._ensureReplayDataInflight, null, `${mode}: slot clear`);
  }
});

// =========================================================================
// GATE 3 — the coalescing must survive: this is the anti-fetch-multiplier cell
// =========================================================================

test('GATE3: two concurrent callers during a genuine in-flight cover still share ONE fetch', async () => {
  for (const mode of MODES) {
    const h = makeHarness({ mode, isPlaying: true, plan: () => 'cover', gateFetches: true });
    const a = h.chart.ensureReplayDataCoversTimestamp(h.target);
    // The body has suspended inside the (gated) fetch, so the slot is genuinely
    // in flight — the regime the single-slot coalescer exists for.
    await new Promise((r) => setImmediate(r));
    assert.equal(h.world.fetches(), 1, `${mode}: the first caller opened exactly one fetch`);
    const b = h.chart.ensureReplayDataCoversTimestamp(h.target + TF_MS);
    const c = h.chart.ensureReplayDataCoversTimestamp(h.target + 2 * TF_MS);

    assert.equal(h.world.fetches(), 1,
      `${mode}: concurrent callers must COALESCE onto the in-flight cover, not open `
      + `their own fetches (fetches=${h.world.fetches()})`);
    const [ra, rb, rc] = await settleAll(h, [a, b, c]);
    await drain(h.world);
    const detail = `${mode}: fetches=${h.world.fetches()} calls=${h.world.calls} `
      + `values=${JSON.stringify([ra.value, rb.value, rc.value])} inflightHits=${h.world.inflightHits}`;
    assert.deepEqual([ra.ok, rb.ok, rc.ok], [true, true, true], detail);
    assert.deepEqual([ra.value, rb.value, rc.value], [true, true, true],
      `${mode}: all three callers observe the one shared cover's result. ${detail}`);
    assert.equal(h.world.fetches(), 1,
      `${mode}: the whole episode must cost exactly ONE fetch. ${detail}`);
    assert.equal(h.world.inflightHits, 2, `${mode}: two callers really re-entered. ${detail}`);
    assert.equal(h.world.calls, 3, `${mode}: three callers, one cover body. ${detail}`);
    note(`gate3-coalescing-${mode}`, true, detail);
    assert.equal(h.chart._ensureReplayDataInflight, null, `${mode}: slot released at the end`);
  }
});

test('GATE3: the forward target is still raised by coalesced callers', async () => {
  // Load-bearing for COVER-LOOP-SAFETY: a coalesced caller with a later target
  // must still move _ensureReplayDataTargetTs so the finally budgets against it.
  const h = makeHarness({ mode: 'independent', isPlaying: true, plan: () => 'dry', gateFetches: true });
  const a = h.chart.ensureReplayDataCoversTimestamp(h.target);
  await new Promise((r) => setImmediate(r));
  h.chart.ensureReplayDataCoversTimestamp(h.target + 5 * TF_MS);
  assert.equal(h.chart._ensureReplayDataTargetTs, h.target + 5 * TF_MS,
    'a coalesced later target must be recorded');
  await settleAll(h, [a]);
  await drain(h.world);
  note('gate3-target-raise', true, `calls=${h.world.calls} fetches=${h.world.fetches()}`);
  assert.equal(h.world.hitHardCap, false, 'the bounded chain still bounds');
});

test('GATE3: a slot re-armed by a later call is not orphaned by the earlier call finishing', async () => {
  // _beginTimeframeSwitching nulls the slot mid-flight (:24616-24619). The first
  // cover is still in flight; a second cover then installs a NEW promise. When the
  // first one finally lands, it must not clear the slot it does not own — otherwise
  // a third caller opens a redundant fetch instead of coalescing.
  const h = makeHarness({ mode: 'independent', isPlaying: false, plan: () => 'cover', gateFetches: true });
  const a = h.chart.ensureReplayDataCoversTimestamp(h.target);
  await new Promise((r) => setImmediate(r));
  assert.equal(h.world.fetches(), 1, 'cover A is in flight');

  // Exactly what _beginTimeframeSwitching does, then the switch ends.
  h.chart._ensureReplayDataGeneration = (h.chart._ensureReplayDataGeneration || 0) + 1;
  h.chart._ensureReplayDataInflight = null;
  h.chart._timeframeSwitching = true;
  h.chart._timeframeSwitching = false;

  const b = h.chart.ensureReplayDataCoversTimestamp(h.target);
  await new Promise((r) => setImmediate(r));
  assert.equal(h.world.fetches(), 2, 'cover B opened the post-switch fetch');

  h.world.releaseGate(0);
  await captureOutcome(a);
  await new Promise((r) => setImmediate(r));

  const c = h.chart.ensureReplayDataCoversTimestamp(h.target);
  const fetchesAfterC = h.world.fetches();
  const [, rb, rc] = await settleAll(h, [a, b, c]);
  await drain(h.world);
  const detail = `fetches=${h.world.fetches()} afterC=${fetchesAfterC} `
    + `b=${JSON.stringify(rb.value)} c=${JSON.stringify(rc.value)}`;
  assert.equal(fetchesAfterC, 2,
    `caller C must coalesce onto the live post-switch cover, not open a third fetch — ${detail}`);
  assert.deepEqual([rb.value, rc.value], [true, true], `both post-switch callers see it. ${detail}`);
  note('gate3-no-orphaned-rearm', true, detail);
  assert.equal(h.chart._ensureReplayDataInflight, null, 'slot released at the end');
});

// =========================================================================
// GATE 4 — healthy-path and kill-switch fidelity against the pinned parent
// =========================================================================

/** Full observable record of one wedge-probe run, for tip-vs-fix comparison. */
function probeRecord(r) {
  return {
    entry: r.entry,
    entryFetches: r.entryFetches,
    entryCalls: r.entryCalls,
    later: r.later,
    totalFetches: r.totalFetches,
    inflightNullAfterEntry: r.inflightNullAfterEntry,
    isPlayingAfter: r.isPlayingAfter,
    warns: r.warns,
    hitHardCap: r.h.world.hitHardCap,
    calls: r.h.world.calls,
    masterLastT: r.h.world.masterLastT(),
    events: r.h.world.events.map((e) => `${e.attempt}:${e.kind}`),
    rejected: r.h.world.rejectedAttempts.slice(),
  };
}

const FIDELITY_CASES = [];
for (const mode of MODES) {
  for (const trigger of ['timeframe', 'pair', null]) {
    for (const clearWhen of ['sync', 'settled']) {
      for (const planKind of ['dry', 'cover', 'noPayload']) {
        FIDELITY_CASES.push({ mode, trigger, clearWhen, planKind });
      }
    }
  }
}

function fidelityOpts(c, extra = {}) {
  return {
    mode: c.mode,
    trigger: c.trigger,
    clearWhen: c.clearWhen,
    laterCalls: 2,
    plan: () => c.planKind,
    pauseThrowsOnCall: c.trigger === null ? 1 : 0,
    hardCap: 40,
    ...extra,
  };
}

test('GATE4: healthy covers with no pre-await exit behave exactly as the pinned parent', async () => {
  const tip = loadTipChartSource();
  assert.equal(tip.includes('_coverInflightWedgeGuardEnabled'), false,
    `${TIP_REV} must predate this fix`);
  const divergences = [];
  let cases = 0;
  for (const mode of MODES) {
    for (const isPlaying of [true, false]) {
      for (const planKind of ['cover', 'dry', 'noPayload']) {
        cases += 1;
        const base = {
          trigger: null, mode, laterCalls: 2, isPlaying, plan: () => planKind, hardCap: 40,
        };
        const tipRun = await wedgeProbe({ ...base, source: tip });
        const fixRun = await wedgeProbe(base);
        const a = JSON.stringify(probeRecord(tipRun));
        const b = JSON.stringify(probeRecord(fixRun));
        if (a !== b) divergences.push({ mode, isPlaying, planKind, tip: a, fix: b });
      }
    }
  }
  note('gate4-healthy-parity', true, `${cases} cases, divergences=${divergences.length}`);
  assert.equal(divergences.length, 0,
    `healthy path changed vs ${TIP_REV}: ${JSON.stringify(divergences.slice(0, 1))}`);
  assert.equal(cases, 12);
});

test(`GATE4: ${SWITCH_WEDGE} set ⇒ byte-for-byte the pinned parent, wedge included`, async () => {
  const tip = loadTipChartSource();
  const divergences = [];
  const wedgedOnTip = [];
  for (const c of FIDELITY_CASES) {
    const tipRun = await wedgeProbe(fidelityOpts(c, { source: tip }));
    const offRun = await wedgeProbe(fidelityOpts(c, { killWedge: true }));
    const a = JSON.stringify(probeRecord(tipRun));
    const b = JSON.stringify(probeRecord(offRun));
    if (a !== b) divergences.push({ ...c, tip: a, off: b });
    if (tipRun.fetchesPerLater.some((n) => n === 0)) wedgedOnTip.push(c);
  }
  note('gate4-killswitch-fidelity', true,
    `${FIDELITY_CASES.length} cases, divergences=${divergences.length}, `
    + `wedgedOnTip=${wedgedOnTip.length}`);
  assert.equal(divergences.length, 0,
    `kill-switch diverges from ${TIP_REV}: ${JSON.stringify(divergences.slice(0, 2))}`);
  // The matrix is only meaningful if the parent really is wedged in it.
  assert.ok(wedgedOnTip.length >= 12,
    `the fidelity matrix must actually contain the tip wedge (wedgedOnTip=${wedgedOnTip.length})`);
});

test('GATE4: with the kill-switch set the wedge is reproduced directly', async () => {
  const r = await wedgeProbe({ trigger: 'timeframe', laterCalls: 3, killWedge: true });
  note('gate4-killswitch-symptom', true,
    `fetchesPerLater=${JSON.stringify(r.fetchesPerLater)} `
    + `laterValues=${JSON.stringify(r.later.map((l) => l.value))}`);
  assert.deepEqual(r.fetchesPerLater, [0, 0, 0],
    'the kill-switch must restore the wedge: three further covers, zero fetches');
  assert.deepEqual(r.later.map((l) => l.value), [false, false, false],
    'each wedged caller gets the stale settled false');
  assert.equal(r.inflightNullAfterEntry, false, 'and the slot keeps the settled promise');
});

test('GATE4: absent / falsy flag ⇒ fix ON; truthy ⇒ OFF — asserted end-to-end', async () => {
  // Flag semantics measured by the fetch oracle, not by calling a helper: every
  // falsy value must leave later covers fetching, every truthy value must wedge them.
  const rows = [];
  for (const falsy of [undefined, false, 0, '', null]) {
    const r = await wedgeProbe({ trigger: 'timeframe', laterCalls: 3, killWedge: falsy });
    assertLaterCoversFetch(r, `falsy ${JSON.stringify(falsy)}`);
    rows.push(`falsy:${JSON.stringify(falsy)}=${JSON.stringify(r.fetchesPerLater)}`);
  }
  for (const truthy of [true, 1, '1', 'yes', {}]) {
    const r = await wedgeProbe({ trigger: 'timeframe', laterCalls: 3, killWedge: truthy });
    assert.deepEqual(r.fetchesPerLater, [0, 0, 0],
      `truthy ${JSON.stringify(truthy)} must restore the tip wedge (not just === true)`);
    rows.push(`truthy:${JSON.stringify(truthy)}=${JSON.stringify(r.fetchesPerLater)}`);
  }
  note('gate4-flag-semantics', true, rows.join(' '));
});

test('GATE4: the flag is re-read per call, never sampled once', async () => {
  // Flip the flag between covers on ONE chart instance: the wedge must follow the
  // current value, so no init-time sample can be hiding in the fix.
  const h = makeHarness({ mode: 'independent', isPlaying: true, plan: () => 'dry' });
  const seen = [];
  for (const flag of [true, undefined, true, undefined]) {
    h.win[SWITCH_WEDGE] = flag;
    h.chart._ensureReplayDataInflight = null;
    h.chart._timeframeSwitching = true;
    await runCover(h);
    h.chart._timeframeSwitching = false;
    const before = h.world.fetches();
    await runCover(h);
    seen.push(h.world.fetches() - before);
  }
  note('gate4-flag-per-call', true, JSON.stringify(seen));
  assert.equal(seen[0], 0, 'flag set ⇒ wedged');
  assert.ok(seen[1] >= 1, 'flag cleared on the SAME instance ⇒ fix live again');
  assert.equal(seen[2], 0, 'flag set again ⇒ wedged again');
  assert.ok(seen[3] >= 1, 'and cleared again ⇒ fix live again');
});

// =========================================================================
// GATE 5 — mutants (in-memory; the on-disk run is in the packet report)
// =========================================================================

const A_PUBLISH = `if (!wedgeGuardOn || !coverSettled) {
            this._ensureReplayDataInflight = coverInflight;
        }`;
const A_FINALLY_CLEAR = `if (wedgeGuardOn) {
                    coverSettled = true;
                    if (coverInflight !== null
                        && this._ensureReplayDataInflight === coverInflight) {
                        this._ensureReplayDataInflight = null;
                    }
                } else {
                    this._ensureReplayDataInflight = null;
                }`;

function mutantFixRemoved() {
  return mutateMethod(CHART_SOURCE, 'ensureReplayDataCoversTimestamp', A_PUBLISH,
    `this._ensureReplayDataInflight = coverInflight; /* MUTANT M1: fix removed (tip install) */`,
    'M1');
}
function mutantSwitchPolarity() {
  return mutateMethod(CHART_SOURCE, 'ensureReplayDataCoversTimestamp',
    `|| !window.${SWITCH_WEDGE};`,
    `|| !!window.${SWITCH_WEDGE}; /* MUTANT M2 */`, 'M2');
}
function mutantClearUnconditionally() {
  return mutateMethod(CHART_SOURCE, 'ensureReplayDataCoversTimestamp', A_PUBLISH,
    `this._ensureReplayDataInflight = null; /* MUTANT M3: slot cleared unconditionally */`,
    'M3');
}
function mutantTimeframeTriggerOnly() {
  return mutateMethod(CHART_SOURCE, 'ensureReplayDataCoversTimestamp', A_PUBLISH,
    `if (!wedgeGuardOn || !coverSettled || !this._timeframeSwitching) {
            this._ensureReplayDataInflight = coverInflight; /* MUTANT M4: timeframe trigger only */
        }`, 'M4');
}
function mutantFinallyClearsAnySlot() {
  return mutateMethod(CHART_SOURCE, 'ensureReplayDataCoversTimestamp', A_FINALLY_CLEAR,
    `coverSettled = true;
                this._ensureReplayDataInflight = null; /* MUTANT M5: clears a slot it does not own */`,
    'M5');
}

test('M1 mutant: fix removed ⇒ the wedge is back on every trigger and both shapes', async () => {
  const source = mutantFixRemoved();
  for (const mode of MODES) {
    for (const key of Object.keys(TRIGGERS)) {
      const mut = await wedgeProbe({ trigger: key, mode, laterCalls: 3, source });
      assert.deepEqual(mut.fetchesPerLater, [0, 0, 0],
        `M1 ${mode}/${key} must wedge (got ${JSON.stringify(mut.fetchesPerLater)})`);
    }
  }
  const product = await wedgeProbe({ trigger: 'pair', laterCalls: 3 });
  assertLaterCoversFetch(product, 'M1-control');
  note('mutant-M1-fix-removed', true, `product=${JSON.stringify(product.fetchesPerLater)}`);
});

test('M2 mutant: kill-switch polarity inverted ⇒ fix defaults OFF and the wedge returns', async () => {
  const source = mutantSwitchPolarity();
  const mut = await wedgeProbe({ trigger: 'timeframe', laterCalls: 3, source });
  assert.deepEqual(mut.fetchesPerLater, [0, 0, 0], 'M2 must wedge with no flag set at all');
  note('mutant-M2-polarity', true, `${JSON.stringify(mut.fetchesPerLater)}`);
});

test('M3 mutant: slot cleared unconditionally ⇒ coalescing breaks into a fetch multiplier', async () => {
  const source = mutantClearUnconditionally();
  const h = makeHarness({ source, mode: 'independent', isPlaying: true, plan: () => 'cover', gateFetches: true });
  const a = h.chart.ensureReplayDataCoversTimestamp(h.target);
  await new Promise((r) => setImmediate(r));
  const b = h.chart.ensureReplayDataCoversTimestamp(h.target);
  const c = h.chart.ensureReplayDataCoversTimestamp(h.target);
  const fetchesWhileInflight = h.world.fetches();
  await settleAll(h, [a, b, c]);
  await drain(h.world);
  note('mutant-M3-clear-unconditionally', true,
    `concurrentFetches=${fetchesWhileInflight} total=${h.world.fetches()}`);
  assert.ok(fetchesWhileInflight > 1,
    `M3 must multiply fetches for concurrent callers (got ${fetchesWhileInflight})`);
  // And the wedge cells still pass under M3, which is exactly why the coalescing
  // cell has to exist.
  const stillFixed = await wedgeProbe({ trigger: 'timeframe', laterCalls: 3, source });
  assert.ok(stillFixed.fetchesPerLater.every((n) => n >= 1),
    'M3 does not wedge — only GATE3 can kill it');
});

test('M4 mutant: cleared only for the timeframe trigger ⇒ the pair-switch path stays wedged', async () => {
  const source = mutantTimeframeTriggerOnly();
  const tf = await wedgeProbe({ trigger: 'timeframe', laterCalls: 3, source });
  assert.ok(tf.fetchesPerLater.every((n) => n >= 1),
    `M4 fixes the timeframe trigger it names (got ${JSON.stringify(tf.fetchesPerLater)})`);
  for (const mode of MODES) {
    const pair = await wedgeProbe({ trigger: 'pair', mode, laterCalls: 3, source });
    assert.deepEqual(pair.fetchesPerLater, [0, 0, 0],
      `M4 ${mode} must leave the pair-switch path wedged (got ${JSON.stringify(pair.fetchesPerLater)})`);
    const thrown = makeHarness({ source, mode, isPlaying: true, plan: () => 'dry', pauseThrowsOnCall: 1 });
    await runCover(thrown);
    const before = thrown.world.fetches();
    await runCover(thrown);
    assert.equal(thrown.world.fetches() - before, 0,
      `M4 ${mode} must also leave the synchronous-throw path wedged`);
  }
  note('mutant-M4-timeframe-only', true, `tf=${JSON.stringify(tf.fetchesPerLater)}`);
});

test('M5 mutant: the finally clears a slot it does not own ⇒ a re-armed cover is orphaned', async () => {
  const source = mutantFinallyClearsAnySlot();
  const h = makeHarness({ source, mode: 'independent', isPlaying: false, plan: () => 'cover', gateFetches: true });
  const a = h.chart.ensureReplayDataCoversTimestamp(h.target);
  await new Promise((r) => setImmediate(r));
  h.chart._ensureReplayDataGeneration = (h.chart._ensureReplayDataGeneration || 0) + 1;
  h.chart._ensureReplayDataInflight = null;
  const b = h.chart.ensureReplayDataCoversTimestamp(h.target);
  await new Promise((r) => setImmediate(r));
  h.world.releaseGate(0);
  await captureOutcome(a);
  await new Promise((r) => setImmediate(r));
  const c = h.chart.ensureReplayDataCoversTimestamp(h.target);
  const fetchesAfterC = h.world.fetches();
  await settleAll(h, [a, b, c]);
  await drain(h.world);
  note('mutant-M5-finally-clears-any-slot', true, `afterC=${fetchesAfterC}`);
  assert.equal(fetchesAfterC, 3,
    `M5 must orphan the re-armed cover so C opens a third fetch (got ${fetchesAfterC})`);
});

// =========================================================================
// Territory + source anchors (last, by design: no mutant may die on these)
// =========================================================================

test('flag, helper and anchors present in both chart.js copies', () => {
  const mirror = fs.readFileSync(CHART_MIRROR, 'utf8');
  for (const [label, src] of [['canonical', CHART_SOURCE], ['mirror', mirror]]) {
    assert.match(src, new RegExp(SWITCH_WEDGE), `${label}: wedge flag`);
    assert.match(src, /COVER-INFLIGHT-WEDGE/, `${label}: marker`);
  }
  const cover = methodSource(CHART_SOURCE, 'ensureReplayDataCoversTimestamp');
  assert.match(cover, /coverSettled/, 'the settled latch must live in the cover method');
  assert.match(cover, /coverInflight/, 'the owned-promise handle must live in the cover method');
  // Untouched neighbours: COVER-LOOP-SAFETY's bound and resume guard stay in place.
  assert.match(cover, /_coverRedispatchShouldRearm\(captureGeneration, ahead, lastMasterT\)/);
  assert.match(cover, /catch \(coverErr\)/);
  assert.match(cover, /pausedByCover/);
  note('sites-present', true);
});

test('homepage chart.js mirror is byte-identical (LF) sha256', () => {
  const canon = fs.readFileSync(CHART_JS);
  const mirror = fs.readFileSync(CHART_MIRROR);
  assert.equal(canon.includes(Buffer.from([13])), false, 'canonical LF-only');
  assert.equal(mirror.includes(Buffer.from([13])), false, 'mirror LF-only');
  assert.equal(canon.equals(mirror), true, `sha=${sha256(canon)}`);
  note('mirrors-byte-identical', true, sha256(canon));
});
