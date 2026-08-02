/**
 * COVER-LOOP-SAFETY — two defects in Chart.ensureReplayDataCoversTimestamp.
 *
 *   cd "chart v 1.4/chart/modules"
 *   node --test --test-concurrency=1 cover-loop-safety.test.mjs
 *
 * Defect 1 (fetch storm): the finally block re-dispatched the whole cover on a
 * microtask whenever the forward target was still uncovered, with no attempt
 * limit, no cooldown and no generation check. _fetchIndependentReplayBridge
 * walks the gap as <= 24 sequential /bars requests, so a large gap returns
 * short of the playhead, ahead > lastMasterT still holds, and the loop re-arms
 * forever. Measured on tip by this suite: 61 cover calls / 60 fetches from a
 * single call, stopped only by the harness cap.
 *
 * The bound has to hold while the forward target MOVES, which is the only regime
 * the production driver actually produces: panel-cmd-bridge scheduleMirrorCatchUp
 * re-calls the cover from a requestAnimationFrame callback on every host mirror
 * frame, so the host playhead bumps _ensureReplayDataTargetTs inside almost every
 * inflight cover. Refilling the budget whenever the target moved (605a5d158) left
 * the bound inert exactly there — 61 calls / 60 fetches, indistinguishable from
 * tip. See makeHarness({ targetAdvanceMs }) and mutant M14.
 *
 * Defect 2 (pause without guaranteed resume): the async body pauses a playing
 * replay before the fetch and only resumed on the single success path. No
 * payload (:7950), generation/timeframe/pair abort (:7952), empty rawData
 * (:7979) and any throw all skipped the resume — and the body was try/finally
 * with no catch, so a throw also rejected the returned promise.
 *
 * Kill-switches (absent ⇒ fix ON, truthy ⇒ tip behaviour, read per call):
 *   window.__TALARIA_DISABLE_COVER_REDISPATCH_BOUND_V1
 *   window.__TALARIA_DISABLE_COVER_RESUME_GUARD_V1
 *
 * Every cell drives the REAL ensureReplayDataCoversTimestamp source extracted
 * from chart.js, together with the real parseTimeframe /
 * _normalizeBacktestTimeframe / _replayRawHasWallClockPrefix /
 * _smartResponseHasPayload / _mergeIntoPanelFullRawData /
 * _mcIndepCoverBridgeV1Enabled and the real fix helpers. Only the network +
 * multichart-topology helpers are stubbed (see STUBS below).
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

const SWITCH_BOUND = '__TALARIA_DISABLE_COVER_REDISPATCH_BOUND_V1';
const SWITCH_RESUME = '__TALARIA_DISABLE_COVER_RESUME_GUARD_V1';

/** Pinned parent of this packet — the "current tip" the kill-switches must reproduce. */
const TIP_REV = 'f5fb81f6a';

/** Stated bound: consecutive self-re-dispatches allowed for one stalled target. */
const EXPECTED_LIMIT = 6;

/** Harness bound so a runaway chain asserts on a count instead of hanging. */
const HARD_CAP = 60;
/** Smaller cap for the fidelity matrices (identical on both sides). */
const MATRIX_CAP = 25;

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
];

/** Fix-only methods — absent on tip, so extraction is optional. */
const FIX_METHODS = [
  '_coverRedispatchBoundEnabled',
  '_coverRedispatchMaxAttempts',
  '_resetCoverRedispatchBudget',
  '_coverRedispatchShouldRearm',
  '_coverResumeGuardEnabled',
];

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

function normalizeStep(step) {
  if (typeof step === 'string') return { kind: step };
  if (step && typeof step === 'object') return step;
  return { kind: 'dry' };
}

/** Absolute 1m bar offset from T0 → wall-clock ms. */
function stepT(offset) {
  return T0 + offset * TF_MS;
}

/*
 * STUBS (and what they leave unverified)
 *  - _fetchIndependentReplayBridge / _fetchReplaySeekBuffer / _fetchSmartWindow:
 *    scripted per cover attempt. The real 24-chunk walk, its cursor arithmetic
 *    and real HTTP behaviour are NOT exercised.
 *  - _ingestSmartWindowResult: installs result.candles as this.rawData. Real
 *    ingest (resample caches, indicator/paint side effects) is NOT exercised.
 *  - _isIndependentMultichartPair / _multichartSamePairAsHost /
 *    _isMultichartEmbedPanel / _isMultichartHostPanel /
 *    _multichartFinerSamePairPanelSelfOwns / _multichartReplayNeedsFineMaster /
 *    _syncReplayMasterFromParentIfCovers / _ensureFinerPanelOwnerCoversPlayhead:
 *    fixed topology answers; real window.parent probing is NOT exercised.
 *  - _independentMasterCoversReplayTimestamp: delegates to the REAL
 *    _replayRawHasWallClockPrefix over _panelFullRawData (no interior-hole /
 *    bridge-margin logic).
 *  - _independentMasterInteriorHoleNearPlayhead: always null (no hole cases).
 *  - _reseedReplayFullRawFromLoadedData / _applyIndependentPanelReplaySlice /
 *    _trimLastDataBarToReplayPlayhead / _emitMultichartHostDataCommit /
 *    resampleData / _getBacktestReplayFetchRange / _getLazyReplayMasterFetchRange /
 *    _backtestFetchLimitForTimeframe / _lazyReplayMasterSmartLimit /
 *    _captureReplayPlayheadMs: minimal stand-ins.
 *  - replaySystem: object with pause/play/updateChartData/
 *    syncCurrentIndexFromReplayTimestamp; pause/play only flip isPlaying and log
 *    an event. Real ReplaySystem timer/tick behaviour is NOT exercised.
 *  - the host driver (targetAdvanceMs): a real external caller, but scheduled off
 *    setImmediate rather than a real animation frame, and the mirror-frame retry /
 *    circuit-breaker logic of scheduleMirrorCatchUp is NOT modelled.
 * The forceFineMaster / lazy-fine-master branch is not covered by any cell.
 */
function makeHarness(opts = {}) {
  const {
    source = CHART_SOURCE,
    killBound = undefined,
    killResume = undefined,
    mode = 'independent',
    isPlaying = true,
    hardCap = HARD_CAP,
    targetSteps = TARGET_STEPS,
    masterBars = MASTER_BARS,
    plan = () => 'dry',
    timeframeSwitching = false,
    pairSwitchLoading = false,
    targetAdvanceMs = 0,
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
  const win = { [SWITCH_BOUND]: killBound, [SWITCH_RESUME]: killResume };
  sandbox.window = win;
  sandbox.document = { documentElement: { classList: { contains: () => false } } };

  vm.createContext(sandbox);
  vm.runInContext(`
class CoverHarness {
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
globalThis.__cover = new CoverHarness();
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
    finerOwnerCalls: 0,
    parentSyncCalls: 0,
    events: [],
    rejectedAttempts: [],
    stepByAttempt: new Map(),
    currentStep: { kind: 'dry' },
    // Host-driven (external) cover calls — see hostFrameBump below.
    driverTs: target,
    externalCalls: 0,
    externalHitInflight: 0,
    externalBumpsApplied: 0,
    inExternalDriver: false,
    bumpedAttempt: 0,
    planFor(n) {
      if (!this.stepByAttempt.has(n)) this.stepByAttempt.set(n, normalizeStep(plan(n)));
      return this.stepByAttempt.get(n);
    },
    masterLastT() {
      const m = mode === 'independent'
        ? chart._panelFullRawData
        : (chart.replaySystem && chart.replaySystem.fullRawData);
      return Array.isArray(m) && m.length ? Number(m[m.length - 1].t) : NaN;
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
  chart._ensureFinerPanelOwnerCoversPlayhead = async () => {
    world.finerOwnerCalls += 1;
    return false;
  };
  chart._syncReplayMasterFromParentIfCovers = () => {
    world.parentSyncCalls += 1;
    return false;
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
    if (step.kind === 'noPayload' || step.kind === 'throwSmart') return null;
    if (step.kind === 'dry') {
      // Chunk returned only bars we already have (weekend/holiday hole): the
      // fetch succeeded but the master frontier does not move.
      const m = mode === 'independent' ? chart._panelFullRawData : replay.fullRawData;
      return payloadFromBars(m.slice(Math.max(0, m.length - 3)));
    }
    if (step.kind === 'bumpGen') {
      chart._ensureReplayDataGeneration = (chart._ensureReplayDataGeneration || 0) + 1;
      return payloadFromBars(barsFrom(from, step.bars || 3));
    }
    if (step.kind === 'window') {
      // Absolute playhead-centered window (offset in 1m bars from T0). On the
      // same-pair shape the product itself replaces replay.fullRawData with the
      // fetched window, so a window that ends earlier than the frontier the panel
      // already had moves the master frontier BACKWARDS — no poking by the harness.
      return payloadFromBars(barsFrom(stepT(step.fromStep || 0), step.bars || 12));
    }
    if (step.kind === 'cover') {
      const count = Math.max(1, Math.round((target + 2 * TF_MS - from) / TF_MS) + 1);
      return payloadFromBars(barsFrom(from, count));
    }
    return payloadFromBars(barsFrom(from, step.bars || 12));
  };

  /*
   * The production driver. panel-cmd-bridge scheduleMirrorCatchUp (:1446) calls
   * ch.ensureReplayDataCoversTimestamp(seekTs) from a requestAnimationFrame
   * callback, and every incoming host mirror frame schedules another one (:1172,
   * :1178) with the host's newer playhead. A /bars walk takes far longer than a
   * 16 ms frame, so those calls land INSIDE an inflight cover, hit the inflight
   * branch and raise _ensureReplayDataTargetTs — the finally then budgets against
   * a forward target it has never seen. For an independent-symbol panel during
   * Play the 3-strike / 2500 ms breaker that would stop this is explicitly
   * cleared (:1457-1458), so nothing else bounds the chain.
   *
   * targetAdvanceMs > 0 installs that driver. The bump is scheduled one macrotask
   * AFTER the fetch stub has suspended, never synchronously inside it: during the
   * async IIFE's synchronous prologue _ensureReplayDataInflight is not yet
   * assigned, so a synchronous injection would open a second independent cover
   * instead of exercising the real re-entry branch. externalHitInflight /
   * externalBumpsApplied pin that the call really did re-enter and really did
   * move the target.
   */
  const hostFrameBump = async () => {
    if (world.bumpedAttempt === world.attempt) return;
    world.bumpedAttempt = world.attempt;
    await new Promise((r) => setImmediate(r));
    world.driverTs += targetAdvanceMs;
    world.externalCalls += 1;
    if (chart._ensureReplayDataInflight) world.externalHitInflight += 1;
    world.inExternalDriver = true;
    try {
      chart.ensureReplayDataCoversTimestamp(world.driverTs);
    } finally {
      world.inExternalDriver = false;
    }
    if (chart._ensureReplayDataTargetTs === world.driverTs) world.externalBumpsApplied += 1;
  };

  chart._fetchIndependentReplayBridge = async () => {
    world.bridgeCalls += 1;
    if (targetAdvanceMs) await hostFrameBump();
    return serve();
  };
  chart._fetchReplaySeekBuffer = async () => {
    world.seekCalls += 1;
    if (targetAdvanceMs) await hostFrameBump();
    return serve();
  };
  chart._fetchSmartWindow = async () => {
    world.smartCalls += 1;
    if (targetAdvanceMs) await hostFrameBump();
    if (world.currentStep.kind === 'throwSmart') throw new Error('cover-smart-window-boom');
    return serve();
  };
  chart._getBacktestReplayFetchRange = () => ({ from: T0, to: target });
  chart._getLazyReplayMasterFetchRange = () => ({ from: T0, to: target });
  chart._backtestFetchLimitForTimeframe = () => 2000;
  chart._lazyReplayMasterSmartLimit = () => 100_000;
  chart._ingestSmartWindowResult = (result) => {
    world.ingestCalls += 1;
    if (world.currentStep.kind === 'throwIngest') throw new Error('cover-ingest-boom');
    if (world.currentStep.kind === 'emptyIngest') {
      chart.rawData = [];
      return;
    }
    chart.rawData = Array.isArray(result.candles) ? result.candles.slice() : [];
  };
  chart.resampleData = (raw) => (Array.isArray(raw) ? raw.slice() : []);
  chart._trimLastDataBarToReplayPlayhead = () => {};

  // ---- instrumentation: count every cover invocation, bound the chain ------
  const real = Object.getPrototypeOf(chart).ensureReplayDataCoversTimestamp;
  chart.ensureReplayDataCoversTimestamp = function (...args) {
    if (world.inExternalDriver) {
      // A host-driven call, not a self-re-dispatch: it must not consume a plan
      // step, move world.attempt or count against the chain's own budget.
      return real.apply(this, args);
    }
    world.calls += 1;
    world.attempt = world.calls;
    world.currentStep = world.planFor(world.calls);
    if (world.calls > hardCap) {
      world.hitHardCap = true;
      return Promise.resolve(false);
    }
    const attempt = world.attempt;
    const p = real.apply(this, args);
    // Tip rejects on throw; swallow on a DERIVED promise only (the original
    // still rejects for the awaiter) so a runaway chain of unhandled rejections
    // cannot kill the test process.
    if (p && typeof p.catch === 'function') {
      p.catch(() => { world.rejectedAttempts.push(attempt); });
    }
    return p;
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

/** Full observable outcome of one scenario run. */
async function collect(opts) {
  const h = makeHarness(opts);
  const settled = await runCover(h);
  return {
    h,
    out: {
      settled,
      calls: h.world.calls,
      hitHardCap: h.world.hitHardCap,
      bridgeCalls: h.world.bridgeCalls,
      seekCalls: h.world.seekCalls,
      smartCalls: h.world.smartCalls,
      ingestCalls: h.world.ingestCalls,
      parentSyncCalls: h.world.parentSyncCalls,
      finerOwnerCalls: h.world.finerOwnerCalls,
      events: h.world.events.map((e) => `${e.attempt}:${e.kind}`),
      firstAttemptEvents: h.world.events.filter((e) => e.attempt === 1).map((e) => e.kind),
      rejected: h.world.rejectedAttempts.slice(),
      isPlayingAfter: h.replay.isPlaying,
      masterLastT: h.world.masterLastT(),
      inflightNull: h.chart._ensureReplayDataInflight === null,
      targetTs: h.chart._ensureReplayDataTargetTs,
      warns: h.world.warns.length,
      loadedRangeSize: h.chart.loadedRanges.size,
    },
  };
}

/** Attempts on which the walk returns only bars we already have (weekend hole). */
const DRY_ATTEMPTS = new Set([3, 8, 9, 10, 15, 22, 23, 24, 31]);
function progressPlan(n) {
  return DRY_ATTEMPTS.has(n) ? 'dry' : { kind: 'advance', bars: 12 };
}

const SCENARIOS = {
  cover: () => 'cover',
  shortStuck: () => 'dry',
  progress: progressPlan,
  noPayload: () => 'noPayload',
  genBump: (n) => (n === 1 ? { kind: 'bumpGen', bars: 3 } : 'dry'),
  emptyIngest: () => 'emptyIngest',
  throwSmart: () => 'throwSmart',
  throwIngest: () => 'throwIngest',
};
const SCENARIO_NAMES = Object.keys(SCENARIOS);
const MODES = ['independent', 'samePair'];

/*
 * Fixtures shared by a product property cell and the mutant cell that the same
 * property kills. The property is always asserted on the product in its own cell,
 * so writing the mutant into chart.js on disk fails a BEHAVIOURAL assertion and
 * not merely the mutant cell's own source anchor.
 */

/** Four stalled attempts, then attempt 5 reaches the target (finally's else branch). */
const COMPLETED_COVER_PLAN = (n) => (n === 5 ? 'cover' : 'dry');

/**
 * Phase 1 completes a cover; the panel master is then rebuilt from an earlier
 * window (a pair / timeframe reload replaces _panelFullRawData wholesale) and
 * phase 2 stalls again on the same host target.
 */
async function runCompletedCoverThenStall(opts = {}) {
  const initial = barsFrom(T0, MASTER_BARS);
  const h = makeHarness({
    mode: 'independent', isPlaying: true, hardCap: 30, plan: COMPLETED_COVER_PLAN, ...opts,
  });
  await runCover(h);
  const phase1 = h.world.calls;
  const wastedAfter = h.chart._coverRedispatchWasted || 0;
  h.chart._panelFullRawData = initial.slice();
  h.replay.fullRawData = initial.slice();
  h.chart.rawData = initial.slice();
  await runCover(h);
  return { h, phase1, wastedAfter, phase2: h.world.calls - phase1 };
}

/**
 * Same-pair shape, where the PRODUCT itself swaps replay.fullRawData for the
 * fetched window: a far window, then a much earlier one (the master frontier
 * really moves backwards), then a genuine 12-bar-per-attempt catch-up while the
 * host target keeps advancing.
 */
const FRONTIER_REBUILD_PLAN = (n) => {
  if (n === 1) return { kind: 'window', fromStep: 200, bars: 12 };
  if (n === 2) return { kind: 'window', fromStep: 20, bars: 12 };
  return { kind: 'advance', bars: 12 };
};
async function runFrontierRebuild(opts = {}) {
  const h = makeHarness({
    mode: 'samePair',
    isPlaying: true,
    hardCap: 90,
    plan: FRONTIER_REBUILD_PLAN,
    targetAdvanceMs: TF_MS,
    ...opts,
  });
  await runCover(h);
  return h;
}

/** Frontier oscillates far / near forever without ever closing on the target. */
const THRASHING_FRONTIER_PLAN = (n) => (n % 2 === 0
  ? { kind: 'window', fromStep: 100, bars: 12 }
  : { kind: 'window', fromStep: 20, bars: 12 });
async function runThrashingFrontier(opts = {}) {
  const h = makeHarness({ mode: 'samePair', isPlaying: false, plan: THRASHING_FRONTIER_PLAN, ...opts });
  await runCover(h);
  return h;
}

/**
 * A post-ingest side effect throws: this.rawData already holds the covering
 * window, but the panel master reseed never completed.
 */
async function runPostIngestThrow(opts = {}) {
  const h = makeHarness({
    mode: 'independent', isPlaying: true, hardCap: 4, plan: () => 'cover', ...opts,
  });
  h.chart._reseedReplayFullRawFromLoadedData = () => { throw new Error('cover-reseed-boom'); };
  const first = await runCover(h);
  return { h, first };
}

// =========================================================================
// Sites + flag semantics
// =========================================================================

test('flags, helpers and anchors present in both chart.js copies', () => {
  const mirror = fs.readFileSync(CHART_MIRROR, 'utf8');
  for (const [label, src] of [['canonical', CHART_SOURCE], ['mirror', mirror]]) {
    assert.match(src, new RegExp(SWITCH_BOUND), `${label}: bound flag`);
    assert.match(src, new RegExp(SWITCH_RESUME), `${label}: resume flag`);
    assert.match(src, /COVER-REDISPATCH-BOUND/, `${label}: bound marker`);
    assert.match(src, /COVER-RESUME-GUARD/, `${label}: resume marker`);
  }
  const cover = methodSource(CHART_SOURCE, 'ensureReplayDataCoversTimestamp');
  assert.match(cover, /_coverRedispatchShouldRearm\(captureGeneration, ahead, lastMasterT\)/);
  assert.match(cover, /catch \(coverErr\)/);
  assert.match(cover, /pausedByCover/);
  // Untouched fetch path: the 24-chunk cap and the serial walk are NOT changed.
  const bridge = methodSource(CHART_SOURCE, '_fetchIndependentReplayBridge');
  assert.match(bridge, /while \(cursor < endMs && guard < 24\)/, 'guard < 24 must be untouched');
  assert.match(bridge, /payload = await this\._fetchBarsWindow\(/, 'walk must stay sequential');
  note('sites-present', true);
});

test('absent / falsy flags ⇒ both fixes ON; truthy ⇒ OFF (per-call truthiness)', () => {
  const { chart, win } = makeHarness({});
  assert.equal(chart._coverRedispatchBoundEnabled(), true);
  assert.equal(chart._coverResumeGuardEnabled(), true);
  for (const falsy of [undefined, false, 0, '', null]) {
    win[SWITCH_BOUND] = falsy;
    win[SWITCH_RESUME] = falsy;
    assert.equal(chart._coverRedispatchBoundEnabled(), true, `falsy ${JSON.stringify(falsy)}`);
    assert.equal(chart._coverResumeGuardEnabled(), true, `falsy ${JSON.stringify(falsy)}`);
  }
  for (const truthy of [true, 1, '1', 'yes', {}]) {
    win[SWITCH_BOUND] = truthy;
    win[SWITCH_RESUME] = truthy;
    assert.equal(chart._coverRedispatchBoundEnabled(), false, `truthy ${JSON.stringify(truthy)}`);
    assert.equal(chart._coverResumeGuardEnabled(), false, `truthy ${JSON.stringify(truthy)}`);
  }
  assert.equal(chart._coverRedispatchMaxAttempts(), EXPECTED_LIMIT);
  note('flag-semantics', true, `limit=${EXPECTED_LIMIT}`);
});

// =========================================================================
// GATE 1/2 — defect 1: bounded self-re-dispatch
// =========================================================================

test('defect1 [independent]: a cover that finishes short re-dispatches a bounded number of times', async () => {
  const h = makeHarness({ mode: 'independent', isPlaying: false, plan: () => 'dry' });
  const first = await runCover(h);
  assert.equal(first.ok, true);
  assert.equal(first.value, false, 'a short cover must report failure');
  note('defect1-independent', true,
    `calls=${h.world.calls} hitHardCap=${h.world.hitHardCap} fetches=${h.world.bridgeCalls}`);
  assert.equal(h.world.hitHardCap, false,
    `re-dispatch chain unbounded: reached harness cap ${HARD_CAP} (calls=${h.world.calls})`);
  assert.equal(h.world.calls, 1 + EXPECTED_LIMIT,
    `expected 1 + ${EXPECTED_LIMIT} cover calls, got ${h.world.calls}`);
  assert.equal(h.world.bridgeCalls, 1 + EXPECTED_LIMIT, 'one fetch per attempt, no more');
});

test('defect1 [samePair]: same bound on the same-pair / host-tile shape', async () => {
  const h = makeHarness({ mode: 'samePair', isPlaying: false, plan: () => 'dry' });
  await runCover(h);
  note('defect1-samepair', true,
    `calls=${h.world.calls} hitHardCap=${h.world.hitHardCap} fetches=${h.world.smartCalls}`);
  assert.equal(h.world.hitHardCap, false,
    `re-dispatch chain unbounded on same-pair shape (calls=${h.world.calls})`);
  assert.equal(h.world.calls, 1 + EXPECTED_LIMIT,
    `expected 1 + ${EXPECTED_LIMIT} cover calls, got ${h.world.calls}`);
});

test('defect1: superseded generation must not re-arm the chain (no stale-pair fetch)', async () => {
  const h = makeHarness({
    mode: 'independent',
    isPlaying: false,
    hardCap: 20,
    plan: (n) => (n === 1 ? { kind: 'bumpGen', bars: 3 } : 'dry'),
  });
  const first = await runCover(h);
  assert.equal(first.value, false, 'generation abort must report failure');
  note('defect1-generation', true, `calls=${h.world.calls} bridgeCalls=${h.world.bridgeCalls}`);
  assert.equal(h.world.calls, 1,
    `superseded generation must not re-dispatch (calls=${h.world.calls})`);
  assert.equal(h.world.bridgeCalls, 1,
    `no fetch may be issued for a superseded-generation target (bridgeCalls=${h.world.bridgeCalls})`);
});

test('defect1: timeframe switch in flight must not re-arm the chain', async () => {
  const h = makeHarness({ mode: 'independent', isPlaying: false, hardCap: 20, plan: () => 'dry' });
  // Switch starts while the first cover is in flight (the real _beginTimeframeSwitching
  // order: flag set + generation bumped). Only the flag here, so the generation
  // check alone cannot explain the stop.
  h.chart._fetchIndependentReplayBridge = async () => {
    h.world.bridgeCalls += 1;
    h.chart._timeframeSwitching = true;
    return payloadFromBars(h.chart._panelFullRawData.slice(-3));
  };
  await runCover(h);
  note('defect1-tfswitch', true, `calls=${h.world.calls}`);
  assert.equal(h.world.calls, 1, `timeframe switch must not re-dispatch (calls=${h.world.calls})`);
});

test('defect1: bounded chain leaves consistent state and does not starve a later cover', async () => {
  const h = makeHarness({
    mode: 'independent',
    isPlaying: true,
    hardCap: 30,
    plan: (n) => (n <= 1 + EXPECTED_LIMIT ? 'dry' : 'cover'),
  });
  await runCover(h);
  assert.equal(h.world.calls, 1 + EXPECTED_LIMIT, 'chain stopped at the stated bound');
  assert.equal(h.chart._ensureReplayDataInflight, null, 'no dangling inflight');
  assert.equal(h.chart._ensureReplayDataTargetTs, null, 'no dangling forward target');
  assert.equal(h.chart._coverRedispatchWasted, 0, 'budget cleared when the chain stops');
  assert.equal(h.chart._coverRedispatchTargetTs, null, 'budget target cleared');
  assert.equal(h.replay.isPlaying, true, 'replay still playing after the chain stops');

  // A later, externally driven cover for the same target must still work.
  const second = await runCover(h);
  note('defect1-state-consistency', true,
    `calls=${h.world.calls} second=${JSON.stringify(second)} masterLastT=${h.world.masterLastT()}`);
  assert.equal(second.ok, true);
  assert.equal(second.value, true, 'a later cover must not be starved by the exhausted budget');
  assert.ok(h.world.masterLastT() >= h.target, 'later cover reached the target');
  assert.equal(h.chart._ensureReplayDataInflight, null, 'no dangling inflight after success');
});

test('defect1: a cover that reached its target clears the budget for the next chain', async () => {
  const r = await runCompletedCoverThenStall();
  note('defect1-completed-cover-clears-budget', true,
    `phase1=${r.phase1} wastedAfterPhase1=${r.wastedAfter} phase2=${r.phase2}`);
  assert.equal(r.phase1, 5, 'phase 1: four stalled attempts then a completing cover');
  assert.equal(r.phase2, 1 + EXPECTED_LIMIT,
    `the later stalled chain must get the full bound, not phase 1's remainder (got ${r.phase2})`);
  assert.equal(r.wastedAfter, 0, 'a completed cover must leave no waste behind');
  assert.equal(r.h.chart._coverRedispatchTargetTs, null, 'and no stale budget target');
});

test('defect1: an oscillating master frontier is bounded (it never closes on the target)', async () => {
  const h = await runThrashingFrontier();
  note('defect1-thrashing-frontier', true,
    `calls=${h.world.calls} hitHardCap=${h.world.hitHardCap} masterLastT=${h.world.masterLastT()}`);
  assert.equal(h.world.hitHardCap, false,
    `an oscillating frontier escaped the bound (calls=${h.world.calls})`);
  // One up-swing is real progress and buys one refill; every later swing is not.
  assert.ok(h.world.calls <= 2 + EXPECTED_LIMIT,
    `only movement PAST the baseline may refill the budget (calls=${h.world.calls})`);
  assert.ok(h.world.masterLastT() < h.target, 'fixture must never reach the target');
});

// -------------------------------------------------------------------------
// The production regime: the forward target MOVES while the cover is inflight.
// Every other cell drives one external call with a fixed target, which is why
// the first shipped bound was indistinguishable from tip here.
// -------------------------------------------------------------------------

const ADVANCING_TARGETS = [
  { label: 'one bar per attempt (host playhead during Play)', advanceMs: TF_MS },
  { label: 'one millisecond per attempt (sub-bar mirror frame)', advanceMs: 1 },
];

for (const drive of ADVANCING_TARGETS) {
  test(`defect1 [independent]: stalled chain stays bounded with the target advancing ${drive.label}`, async () => {
    const h = makeHarness({
      mode: 'independent',
      isPlaying: true,
      plan: () => 'dry',
      targetAdvanceMs: drive.advanceMs,
    });
    const first = await runCover(h);
    note(`defect1-advancing-target-${drive.advanceMs}ms`, true,
      `calls=${h.world.calls} fetches=${h.world.bridgeCalls} hitHardCap=${h.world.hitHardCap} `
      + `bumps=${h.world.externalBumpsApplied}/${h.world.externalCalls} `
      + `wasted=${h.chart._coverRedispatchWasted}`);
    // Harness fidelity first: a bump that did not re-enter an assigned inflight
    // (or did not move the target) would make the whole cell vacuous.
    assert.equal(h.world.externalHitInflight, h.world.externalCalls,
      'every host bump must land while _ensureReplayDataInflight is assigned');
    assert.equal(h.world.externalBumpsApplied, h.world.externalCalls,
      'every host bump must actually raise _ensureReplayDataTargetTs');
    assert.equal(h.world.externalCalls, h.world.bridgeCalls,
      'the target must move inside every attempt that reaches a fetch, not just the first');
    assert.equal(h.world.hitHardCap, false,
      `a moving target must not refill the budget: reached harness cap ${HARD_CAP} `
      + `(calls=${h.world.calls}, fetches=${h.world.bridgeCalls})`);
    assert.equal(h.world.calls, 1 + EXPECTED_LIMIT,
      `expected 1 + ${EXPECTED_LIMIT} cover calls, got ${h.world.calls}`);
    assert.equal(h.world.bridgeCalls, 1 + EXPECTED_LIMIT, 'one fetch per attempt, no more');
    assert.equal(first.ok, true);
    assert.equal(first.value, false, 'a stalled cover must still report failure');
    assert.equal(h.replay.isPlaying, true, 'replay still playing after the chain stops');
  });
}

// =========================================================================
// GATE 1/2 — defect 2: guaranteed resume on every exit path
// =========================================================================

const UNRESUMED_PATHS = [
  { name: 'no-payload (:7950)', step: 'noPayload' },
  { name: 'generation abort (:7952)', step: { kind: 'bumpGen', bars: 3 } },
  { name: 'empty rawData (:7979)', step: 'emptyIngest' },
  { name: 'throw in fetch (no catch)', step: 'throwSmart' },
  { name: 'throw in ingest (no catch)', step: 'throwIngest' },
];

for (const mode of MODES) {
  for (const p of UNRESUMED_PATHS) {
    const label = typeof p.step === 'string' ? p.step : p.step.kind;
    test(`defect2 [${mode}]: ${p.name} resumes the replay and reports failure`, async () => {
      // hardCap 1 isolates attempt 1 (no chained attempt touches replay).
      const h = makeHarness({ mode, isPlaying: true, hardCap: 1, plan: () => p.step });
      const first = await runCover(h);
      const paused = h.world.events.filter((e) => e.kind === 'pause').length;
      const resumed = h.world.events.filter((e) => e.kind === 'play').length;
      note(`defect2-${mode}-${label}`, true,
        `pause=${paused} play=${resumed} isPlaying=${h.replay.isPlaying} settled=${JSON.stringify(first)}`);
      assert.equal(paused, 1, 'this exit path must actually pause a playing replay');
      assert.equal(h.replay.isPlaying, true,
        `wasPlaying=true must be resumed on every exit path (isPlaying=${h.replay.isPlaying})`);
      assert.equal(first.ok, true,
        `a failed cover must resolve, not reject silently (got ${JSON.stringify(first)})`);
      assert.equal(first.value, false, 'a failed cover must still report failure, never true');
    });
  }
}

test('defect2: a throw is logged like neighbouring code (console.warn, prefixed)', async () => {
  const h = makeHarness({ mode: 'independent', isPlaying: true, hardCap: 1, plan: () => 'throwSmart' });
  const first = await runCover(h);
  note('defect2-diagnostic', true, JSON.stringify(h.world.warns));
  assert.equal(first.value, false);
  assert.equal(h.world.warns.length, 1, 'exactly one diagnostic, not swallowed');
  assert.match(h.world.warns[0], /^ensureReplayDataCoversTimestamp: cover failed/);
  assert.match(h.world.warns[0], /cover-smart-window-boom/, 'the real error must survive');
});

test('defect2: a post-ingest throw resolves false even when rawData covers the target', async () => {
  // The stated invariant "resolve false — never a bogus true". rawData holds the
  // covering window by the time the reseed throws, but the panel master was left
  // mid-update, so the caller must not be told the playhead is covered.
  const r = await runPostIngestThrow();
  note('defect2-post-ingest-throw', true,
    `settled=${JSON.stringify(r.first)} isPlaying=${r.h.replay.isPlaying} `
    + `warns=${JSON.stringify(r.h.world.warns)}`);
  assert.equal(r.first.ok, true, 'must resolve, not reject');
  assert.equal(r.first.value, false,
    'a cover that threw must report failure even though this.rawData covers ts');
  assert.equal(r.h.replay.isPlaying, true, 'and the pause is still handed back');
  assert.equal(r.h.world.warns.length, 1, 'exactly one diagnostic');
  assert.match(r.h.world.warns[0], /^ensureReplayDataCoversTimestamp: cover failed/);
  assert.match(r.h.world.warns[0], /cover-reseed-boom/, 'the real error must survive');
});

test('defect2: replay that was NOT playing is never started by the guard', async () => {
  for (const mode of MODES) {
    for (const step of ['noPayload', 'emptyIngest', 'throwSmart', 'throwIngest', 'cover']) {
      const h = makeHarness({ mode, isPlaying: false, hardCap: 1, plan: () => step });
      await runCover(h);
      assert.equal(h.replay.isPlaying, false, `${mode}/${step}: must not start a paused replay`);
      assert.equal(h.world.events.length, 0, `${mode}/${step}: no pause/play at all`);
    }
  }
  note('defect2-no-spurious-play', true);
});

test('defect2: success path resumes exactly once (no double play)', async () => {
  for (const mode of MODES) {
    const h = makeHarness({ mode, isPlaying: true, hardCap: 4, plan: () => 'cover' });
    const first = await runCover(h);
    assert.equal(first.value, true, `${mode}: healthy cover must return true`);
    const kinds = h.world.events.map((e) => e.kind);
    assert.deepEqual(kinds, ['pause', 'play'], `${mode}: got ${JSON.stringify(kinds)}`);
    assert.equal(h.replay.isPlaying, true);
  }
  note('defect2-single-resume', true);
});

// =========================================================================
// GATE 3 — forward progress must not be starved
// =========================================================================

for (const mode of MODES) {
  test(`GATE3 [${mode}]: long advancing cover chain is not cut off by the limit`, async () => {
    const h = makeHarness({ mode, isPlaying: true, hardCap: 90, plan: progressPlan });
    await runCover(h);
    const lastT = h.world.masterLastT();
    note(`forward-progress-${mode}`, true,
      `calls=${h.world.calls} masterLastT=${lastT} target=${h.target} dryAttempts=${DRY_ATTEMPTS.size}`);
    assert.equal(h.world.hitHardCap, false, 'harness cap must not be reached');
    assert.ok(lastT >= h.target,
      `advancing chain was starved: master reached ${lastT}, target ${h.target} `
      + `(calls=${h.world.calls})`);
    assert.ok(h.world.calls > EXPECTED_LIMIT + 1,
      `cell is only meaningful if the chain is longer than the cap (calls=${h.world.calls})`);
    assert.equal(h.replay.isPlaying, true, 'replay playing after a completed advance');
  });
}

test('GATE3: a dry run right up to the cap still survives if progress resumes', async () => {
  // EXPECTED_LIMIT-1 consecutive dry attempts, then progress again, then cover.
  const dryRun = new Set();
  for (let i = 2; i <= EXPECTED_LIMIT; i++) dryRun.add(i);
  const h = makeHarness({
    mode: 'independent',
    isPlaying: true,
    hardCap: 40,
    plan: (n) => {
      if (dryRun.has(n)) return 'dry';
      if (n >= EXPECTED_LIMIT + 2) return 'cover';
      return { kind: 'advance', bars: 12 };
    },
  });
  await runCover(h);
  note('forward-progress-cap-edge', true,
    `calls=${h.world.calls} dryRun=${dryRun.size} masterLastT=${h.world.masterLastT()}`);
  assert.ok(h.world.masterLastT() >= h.target,
    `a ${dryRun.size}-attempt dry run must not end the chain (calls=${h.world.calls})`);
});

test('GATE3: a master frontier rebuilt lower is re-baselined, so the catch-up still completes', async () => {
  const h = await runFrontierRebuild();
  note('forward-progress-frontier-rebuild', true,
    `calls=${h.world.calls} masterLastT=${h.world.masterLastT()} target=${h.target} `
    + `driverTs=${h.world.driverTs}`);
  assert.equal(h.world.hitHardCap, false, 'harness cap must not be reached');
  assert.ok(h.world.masterLastT() >= h.target,
    'progress measured against a stale high-water frontier starved the recovery: '
    + `master reached ${h.world.masterLastT()}, target ${h.target} (calls=${h.world.calls})`);
  assert.ok(h.world.calls > 1 + EXPECTED_LIMIT,
    `cell is only meaningful past the bound (calls=${h.world.calls})`);
  assert.equal(h.replay.isPlaying, true, 'replay playing after a completed advance');
});

test('GATE3: a legitimate advance is not capped even while the target keeps advancing', async () => {
  // Both halves of the production regime at once: the master really is catching
  // up AND the host playhead keeps moving the forward target. Must stay
  // unbounded-but-completing — the bound may only bite a stalled frontier.
  const h = makeHarness({
    mode: 'independent',
    isPlaying: true,
    hardCap: 90,
    plan: progressPlan,
    targetAdvanceMs: TF_MS,
  });
  await runCover(h);
  const lastT = h.world.masterLastT();
  note('forward-progress-advancing-target', true,
    `calls=${h.world.calls} masterLastT=${lastT} driverTs=${h.world.driverTs} `
    + `bumps=${h.world.externalBumpsApplied}/${h.world.externalCalls}`);
  assert.ok(h.world.externalBumpsApplied > EXPECTED_LIMIT,
    `the target must move well past the bound (bumps=${h.world.externalBumpsApplied})`);
  assert.equal(h.world.hitHardCap, false, 'harness cap must not be reached');
  assert.ok(lastT >= h.world.driverTs,
    `advancing chain was starved: master reached ${lastT}, moving target ${h.world.driverTs} `
    + `(calls=${h.world.calls})`);
  assert.ok(h.world.calls > EXPECTED_LIMIT + 1,
    `cell is only meaningful if the chain is longer than the cap (calls=${h.world.calls})`);
  assert.equal(h.replay.isPlaying, true, 'replay playing after a completed advance');
});

// =========================================================================
// GATE 6 — healthy path byte-for-byte behavioural parity with tip
// =========================================================================

test('GATE6: healthy cover + normal advancing replay behave exactly as tip (fixes ON)', async () => {
  const tip = loadTipChartSource();
  assert.equal(tip.includes('_coverRedispatchShouldRearm'), false, 'tip must predate the fix');
  const divergences = [];
  let cases = 0;
  for (const mode of MODES) {
    for (const isPlaying of [true, false]) {
      for (const scenario of ['cover', 'progress']) {
        cases += 1;
        const opts = {
          mode,
          isPlaying,
          hardCap: 90,
          plan: SCENARIOS[scenario],
        };
        const tipRun = await collect({ ...opts, source: tip });
        const fixRun = await collect(opts);
        if (JSON.stringify(tipRun.out) !== JSON.stringify(fixRun.out)) {
          divergences.push({ mode, isPlaying, scenario, tip: tipRun.out, fix: fixRun.out });
        }
      }
    }
  }
  note('healthy-path-parity', true, `${cases} cases, divergences=${divergences.length}`);
  assert.equal(divergences.length, 0,
    `healthy path changed: ${JSON.stringify(divergences.slice(0, 1))}`);
  assert.equal(cases, 8);
});

// =========================================================================
// GATE 4 — kill-switch fidelity vs pinned tip
// =========================================================================

const FULL_DIM = (o) => o;
const REDISPATCH_DIM = (o) => ({
  calls: o.calls,
  hitHardCap: o.hitHardCap,
  bridgeCalls: o.bridgeCalls,
  seekCalls: o.seekCalls,
  smartCalls: o.smartCalls,
  ingestCalls: o.ingestCalls,
  masterLastT: o.masterLastT,
  inflightNull: o.inflightNull,
  targetTs: o.targetTs,
  loadedRangeSize: o.loadedRangeSize,
});
const RESUME_DIM = (o) => ({
  settled: o.settled,
  firstAttemptEvents: o.firstAttemptEvents,
  isPlayingAfter: o.isPlayingAfter,
  warns: o.warns,
  rejectedFirst: o.rejected.includes(1),
});

const FIDELITY_MATRICES = [
  {
    label: 'both flags set ⇒ full tip behaviour',
    flags: { killBound: true, killResume: true },
    project: FULL_DIM,
  },
  {
    label: `${SWITCH_BOUND} set ⇒ tip re-dispatch/fetch dimension`,
    flags: { killBound: true },
    project: REDISPATCH_DIM,
  },
  {
    label: `${SWITCH_RESUME} set ⇒ tip pause/resume/return dimension`,
    flags: { killResume: true },
    project: RESUME_DIM,
  },
];

for (const matrix of FIDELITY_MATRICES) {
  test(`GATE4: ${matrix.label} — zero divergence`, async () => {
    const tip = loadTipChartSource();
    const divergences = [];
    let cases = 0;
    for (const mode of MODES) {
      for (const isPlaying of [true, false]) {
        for (const scenario of SCENARIO_NAMES) {
          cases += 1;
          const base = { mode, isPlaying, hardCap: MATRIX_CAP, plan: SCENARIOS[scenario] };
          const tipRun = await collect({ ...base, source: tip });
          const offRun = await collect({ ...base, ...matrix.flags });
          const a = JSON.stringify(matrix.project(tipRun.out));
          const b = JSON.stringify(matrix.project(offRun.out));
          if (a !== b) divergences.push({ mode, isPlaying, scenario, tip: a, off: b });
        }
      }
    }
    note(`killswitch-fidelity-${Object.keys(matrix.flags).join('+')}`, true,
      `${cases} cases, divergences=${divergences.length}`);
    assert.equal(divergences.length, 0,
      `divergences: ${JSON.stringify(divergences.slice(0, 2))}`);
    assert.equal(cases, MODES.length * 2 * SCENARIO_NAMES.length);
  });
}

test('GATE4: kill-switches reproduce the two tip symptoms directly', async () => {
  const unbounded = makeHarness({
    mode: 'independent',
    isPlaying: false,
    killBound: true,
    plan: () => 'dry',
  });
  await runCover(unbounded);
  assert.equal(unbounded.world.hitHardCap, true,
    'bound kill-switch must restore the unbounded chain');

  const unresumed = makeHarness({
    mode: 'independent',
    isPlaying: true,
    hardCap: 1,
    killResume: true,
    plan: () => 'noPayload',
  });
  const first = await runCover(unresumed);
  assert.equal(unresumed.replay.isPlaying, false, 'resume kill-switch must restore the freeze');
  assert.equal(first.value, false);

  const rejecting = makeHarness({
    mode: 'independent',
    isPlaying: true,
    hardCap: 1,
    killResume: true,
    plan: () => 'throwSmart',
  });
  const thrown = await runCover(rejecting);
  assert.equal(thrown.ok, false, 'resume kill-switch must restore the rejection');
  assert.match(thrown.message, /cover-smart-window-boom/);
  assert.equal(rejecting.replay.isPlaying, false);
  note('killswitch-symptoms', true,
    `unboundedCalls=${unbounded.world.calls} rejected=${!thrown.ok}`);
});

// =========================================================================
// GATE 5 — mutants (in-memory; the on-disk run is in the packet report)
// =========================================================================

const A_LIMIT_GATE = `if ((this._coverRedispatchWasted || 0) >= this._coverRedispatchMaxAttempts()) {
            this._resetCoverRedispatchBudget();
            return false;
        }`;
const A_GEN_GATE = `if (captureGeneration !== currentGeneration
            || this._timeframeSwitching
            || this._pairSwitchLoading) {
            this._resetCoverRedispatchBudget();
            return false;
        }`;
const A_PROGRESS_RESET = `} else if (Number.isFinite(lastMasterT)
            && (!Number.isFinite(this._coverRedispatchBaselineT)
                || lastMasterT > this._coverRedispatchBaselineT)) {
            this._coverRedispatchWasted = 0;
            this._coverRedispatchBaselineT = lastMasterT;
        }`;
const A_FINALLY_RESUME = `if (this._coverResumeGuardEnabled()
                    && pausedByCover
                    && replay
                    && typeof replay.play === 'function') {
                    try { replay.play(); pausedByCover = false; } catch (_rp) { /* ignore */ }
                }`;
const A_CATCH_BODY = `console.warn('ensureReplayDataCoversTimestamp: cover failed', coverErr);
                return false;`;
const A_ELSE_RESET = `} else if (this._coverRedispatchBoundEnabled()) {
                    this._resetCoverRedispatchBudget();
                }`;
const A_SAME_TARGET = `const sameTarget = this._coverRedispatchGeneration === currentGeneration
            && this._coverRedispatchTargetTs === ahead;`;
const A_TARGET_REKEY = `if (!Number.isFinite(this._coverRedispatchBaselineT)
                || (Number.isFinite(lastMasterT)
                    && lastMasterT > this._coverRedispatchBaselineT)) {
                this._coverRedispatchWasted = 0;
            }`;

function mutantLimitRemoved() {
  return mutateMethod(CHART_SOURCE, '_coverRedispatchShouldRearm', A_LIMIT_GATE,
    '/* MUTANT M1: attempt limit removed */', 'M1');
}
function mutantLimitOne() {
  return mutateMethod(CHART_SOURCE, '_coverRedispatchMaxAttempts', 'return 6;',
    'return 1; /* MUTANT M2 */', 'M2');
}
function mutantGenerationDropped() {
  return mutateMethod(CHART_SOURCE, '_coverRedispatchShouldRearm', A_GEN_GATE,
    '/* MUTANT M3: generation check dropped */', 'M3');
}
function mutantProgressResetRemoved() {
  return mutateMethod(CHART_SOURCE, '_coverRedispatchShouldRearm', A_PROGRESS_RESET,
    '} /* MUTANT M4: progress reset removed */', 'M4');
}
function mutantResumeDroppedOnThrow() {
  return mutateMethod(CHART_SOURCE, 'ensureReplayDataCoversTimestamp', A_CATCH_BODY,
    `console.warn('ensureReplayDataCoversTimestamp: cover failed', coverErr);
                pausedByCover = false; /* MUTANT M5: resume dropped on the throw path */
                return false;`, 'M5');
}
function mutantCatchReturnsTrue() {
  return mutateMethod(CHART_SOURCE, 'ensureReplayDataCoversTimestamp', A_CATCH_BODY,
    `console.warn('ensureReplayDataCoversTimestamp: cover failed', coverErr);
                return true; /* MUTANT M6: swallow + false success */`, 'M6');
}
function mutantResumeBlockRemoved() {
  return mutateMethod(CHART_SOURCE, 'ensureReplayDataCoversTimestamp', A_FINALLY_RESUME,
    '/* MUTANT M7: guaranteed resume removed */', 'M7');
}
function mutantBoundPolarity() {
  return mutateMethod(CHART_SOURCE, '_coverRedispatchBoundEnabled',
    '|| !window.__TALARIA_DISABLE_COVER_REDISPATCH_BOUND_V1;',
    '|| !!window.__TALARIA_DISABLE_COVER_REDISPATCH_BOUND_V1; /* MUTANT M8 */', 'M8');
}
function mutantResumePolarity() {
  return mutateMethod(CHART_SOURCE, '_coverResumeGuardEnabled',
    '|| !window.__TALARIA_DISABLE_COVER_RESUME_GUARD_V1;',
    '|| !!window.__TALARIA_DISABLE_COVER_RESUME_GUARD_V1; /* MUTANT M9 */', 'M9');
}
function mutantElseResetRemoved() {
  return mutateMethod(CHART_SOURCE, 'ensureReplayDataCoversTimestamp', A_ELSE_RESET,
    '} /* MUTANT M10: budget survives a completed cover */', 'M10');
}
function mutantCatchReturnsCoverage() {
  return mutateMethod(CHART_SOURCE, 'ensureReplayDataCoversTimestamp', A_CATCH_BODY,
    `console.warn('ensureReplayDataCoversTimestamp: cover failed', coverErr);
                return hasWallClockPrefix(this.rawData); /* MUTANT M11 */`, 'M11');
}
function mutantSameTargetGenerationOnly() {
  return mutateMethod(CHART_SOURCE, '_coverRedispatchShouldRearm', A_SAME_TARGET,
    `const sameTarget = this._coverRedispatchGeneration === currentGeneration;
        /* MUTANT M12: target changes invisible */`, 'M12');
}
function mutantSameTargetNeedsBaseline() {
  return mutateMethod(CHART_SOURCE, '_coverRedispatchShouldRearm', A_SAME_TARGET,
    `const sameTarget = this._coverRedispatchGeneration === currentGeneration
            && this._coverRedispatchTargetTs === ahead
            && this._coverRedispatchBaselineT === lastMasterT; /* MUTANT M13 */`, 'M13');
}
function mutantTargetRefillsBudget() {
  return mutateMethod(CHART_SOURCE, '_coverRedispatchShouldRearm', A_TARGET_REKEY,
    'this._coverRedispatchWasted = 0; /* MUTANT M14: refill on any target move (605a5d158) */',
    'M14');
}

test('M1 mutant: attempt limit removed ⇒ stalled chain is unbounded again', async () => {
  const source = mutantLimitRemoved();
  const mut = makeHarness({ source, mode: 'independent', isPlaying: false, plan: () => 'dry' });
  await runCover(mut);
  assert.equal(mut.world.hitHardCap, true, 'M1 must escape the bound');
  const product = makeHarness({ mode: 'independent', isPlaying: false, plan: () => 'dry' });
  await runCover(product);
  assert.equal(product.world.calls, 1 + EXPECTED_LIMIT, 'product stays bounded');
  note('mutant-M1-limit-removed', true, `mutant calls=${mut.world.calls}`);
});

test('M2 mutant: limit forced to 1 ⇒ advancing chain is starved', async () => {
  const source = mutantLimitOne();
  const mut = makeHarness({ source, mode: 'independent', isPlaying: true, hardCap: 90, plan: progressPlan });
  await runCover(mut);
  assert.ok(mut.world.masterLastT() < mut.target,
    `M2 must starve the advancing chain (masterLastT=${mut.world.masterLastT()})`);
  const product = makeHarness({ mode: 'independent', isPlaying: true, hardCap: 90, plan: progressPlan });
  await runCover(product);
  assert.ok(product.world.masterLastT() >= product.target, 'product completes the advance');
  note('mutant-M2-limit-one', true,
    `mutant calls=${mut.world.calls} masterLastT=${mut.world.masterLastT()} target=${mut.target}`);
});

test('M3 mutant: generation check dropped ⇒ stale target re-arms and refetches', async () => {
  const source = mutantGenerationDropped();
  const plan = (n) => (n === 1 ? { kind: 'bumpGen', bars: 3 } : 'dry');
  const mut = makeHarness({ source, mode: 'independent', isPlaying: false, hardCap: 20, plan });
  await runCover(mut);
  assert.ok(mut.world.calls > 1, `M3 must re-arm across the generation bump (calls=${mut.world.calls})`);
  assert.ok(mut.world.bridgeCalls > 1, 'M3 must issue a fetch for the superseded target');
  const product = makeHarness({ mode: 'independent', isPlaying: false, hardCap: 20, plan });
  await runCover(product);
  assert.equal(product.world.calls, 1, 'product refuses to re-arm');
  note('mutant-M3-generation-dropped', true,
    `mutant calls=${mut.world.calls} fetches=${mut.world.bridgeCalls}`);
});

test('M4 mutant: progress reset removed ⇒ advancing chain is starved', async () => {
  const source = mutantProgressResetRemoved();
  const mut = makeHarness({ source, mode: 'independent', isPlaying: true, hardCap: 90, plan: progressPlan });
  await runCover(mut);
  assert.ok(mut.world.masterLastT() < mut.target,
    `M4 must starve the advancing chain (masterLastT=${mut.world.masterLastT()})`);
  assert.equal(mut.world.calls, 1 + EXPECTED_LIMIT, 'M4 stops at the raw cap');
  note('mutant-M4-progress-reset-removed', true,
    `mutant calls=${mut.world.calls} masterLastT=${mut.world.masterLastT()}`);
});

test('M5 mutant: resume dropped on the throw path ⇒ replay left paused', async () => {
  const source = mutantResumeDroppedOnThrow();
  for (const step of ['throwSmart', 'throwIngest']) {
    const mut = makeHarness({ source, mode: 'independent', isPlaying: true, hardCap: 1, plan: () => step });
    const first = await runCover(mut);
    assert.equal(first.value, false, `${step}: M5 still reports failure (only the resume is gone)`);
    assert.equal(mut.replay.isPlaying, false, `${step}: M5 must leave replay paused`);
  }
  const product = makeHarness({ mode: 'independent', isPlaying: true, hardCap: 1, plan: () => 'throwSmart' });
  await runCover(product);
  assert.equal(product.replay.isPlaying, true, 'product resumes on throw');
  note('mutant-M5-resume-dropped-on-throw', true);
});

test('M6 mutant: catch swallows and returns true ⇒ false success reported', async () => {
  const source = mutantCatchReturnsTrue();
  const mut = makeHarness({ source, mode: 'independent', isPlaying: true, hardCap: 1, plan: () => 'throwSmart' });
  const first = await runCover(mut);
  assert.equal(first.ok, true);
  assert.equal(first.value, true, 'M6 must report a bogus success');
  const product = makeHarness({ mode: 'independent', isPlaying: true, hardCap: 1, plan: () => 'throwSmart' });
  const good = await runCover(product);
  assert.equal(good.value, false, 'product reports failure');
  note('mutant-M6-catch-returns-true', true);
});

test('M7 mutant: guaranteed resume block removed ⇒ every silent exit freezes again', async () => {
  const source = mutantResumeBlockRemoved();
  for (const step of ['noPayload', 'emptyIngest', 'throwSmart']) {
    const mut = makeHarness({ source, mode: 'independent', isPlaying: true, hardCap: 1, plan: () => step });
    await runCover(mut);
    assert.equal(mut.replay.isPlaying, false, `${step}: M7 must leave replay paused`);
  }
  note('mutant-M7-resume-block-removed', true);
});

test('M8/M9 mutants: kill-switch polarity inverted ⇒ fixes default OFF', async () => {
  const boundFlipped = makeHarness({
    source: mutantBoundPolarity(),
    mode: 'independent',
    isPlaying: false,
    plan: () => 'dry',
  });
  assert.equal(boundFlipped.chart._coverRedispatchBoundEnabled(), false, 'M8 default OFF');
  await runCover(boundFlipped);
  assert.equal(boundFlipped.world.hitHardCap, true, 'M8 restores the unbounded chain by default');

  const resumeFlipped = makeHarness({
    source: mutantResumePolarity(),
    mode: 'independent',
    isPlaying: true,
    hardCap: 1,
    plan: () => 'noPayload',
  });
  assert.equal(resumeFlipped.chart._coverResumeGuardEnabled(), false, 'M9 default OFF');
  await runCover(resumeFlipped);
  assert.equal(resumeFlipped.replay.isPlaying, false, 'M9 restores the freeze by default');
  note('mutant-M8-M9-polarity', true);
});

test('M14 mutant: a moved target refills the budget ⇒ bound inert in the Play regime', async () => {
  // This mutant IS the shipped 605a5d158 code. It is the regression guard for the
  // blocker: with the host playhead bumping the target inside every inflight
  // cover, an unconditional refill leaves _coverRedispatchWasted pinned at 1.
  const source = mutantTargetRefillsBudget();
  const base = { mode: 'independent', isPlaying: true, plan: () => 'dry', targetAdvanceMs: TF_MS };
  const mut = makeHarness({ ...base, source });
  await runCover(mut);
  const product = makeHarness(base);
  await runCover(product);
  note('mutant-M14-target-refills-budget', true,
    `mutant calls=${mut.world.calls} hitHardCap=${mut.world.hitHardCap} `
    + `wasted=${mut.chart._coverRedispatchWasted} | product calls=${product.world.calls}`);
  assert.equal(mut.world.hitHardCap, true, 'M14 must escape the bound on a moving target');
  assert.equal(mut.chart._coverRedispatchWasted, 1, 'M14 keeps the waste count pinned at 1');
  assert.equal(product.world.calls, 1 + EXPECTED_LIMIT, 'product stays bounded');
  // Static target: mutant and product agree, which is exactly why the original
  // 37 cells could not see this.
  const staticMut = makeHarness({ ...base, source, targetAdvanceMs: 0 });
  await runCover(staticMut);
  assert.equal(staticMut.world.calls, 1 + EXPECTED_LIMIT,
    'a fixed-target cell cannot distinguish M14 — that was the blind spot');
});

/*
 * M10-M13 are the four reviewer mutants that survived the first 37 cells. Each is
 * killed by a named product cell above, run on the same fixture — so writing the
 * mutant into chart.js on disk fails a behavioural assertion, not just the source
 * anchor these cells splice.
 *   M10 ⇒ defect1: a cover that reached its target clears the budget for the next chain
 *   M11 ⇒ defect2: a post-ingest throw resolves false even when rawData covers the target
 *   M12 ⇒ GATE3: a master frontier rebuilt lower is re-baselined ...
 *   M13 ⇒ defect1: an oscillating master frontier is bounded ...
 */

test('M10 mutant (reviewer R6): else-branch reset removed ⇒ later chain starts pre-drained', async () => {
  const mut = await runCompletedCoverThenStall({ source: mutantElseResetRemoved() });
  note('mutant-M10-else-reset-removed', true,
    `mutant phase1=${mut.phase1} wasted=${mut.wastedAfter} phase2=${mut.phase2} `
    + `(product phase2=${1 + EXPECTED_LIMIT})`);
  assert.equal(mut.phase1, 5, 'phase 1 is unchanged by M10');
  assert.ok(mut.wastedAfter > 0, 'M10 leaves a stale waste count after a completed cover');
  assert.ok(mut.phase2 < 1 + EXPECTED_LIMIT,
    `M10 must start the later chain pre-drained (mutant phase2=${mut.phase2})`);
});

test('M11 mutant (reviewer R7): catch returns rawData coverage ⇒ bogus true on a throw', async () => {
  const mut = await runPostIngestThrow({ source: mutantCatchReturnsCoverage() });
  note('mutant-M11-catch-returns-coverage', true, `mutant=${JSON.stringify(mut.first)}`);
  assert.equal(mut.first.ok, true);
  assert.equal(mut.first.value, true, 'M11 must report a bogus success');
});

test('M12 mutant (reviewer R8): sameTarget on generation alone ⇒ recovery starved', async () => {
  const mut = await runFrontierRebuild({ source: mutantSameTargetGenerationOnly() });
  note('mutant-M12-sametarget-generation-only', true,
    `mutant calls=${mut.world.calls} masterLastT=${mut.world.masterLastT()} target=${mut.target}`);
  assert.ok(mut.world.calls <= 2 + EXPECTED_LIMIT,
    `M12 must stop near the raw cap (calls=${mut.world.calls})`);
  assert.ok(mut.world.masterLastT() < mut.target,
    `M12 must starve the recovery (masterLastT=${mut.world.masterLastT()})`);
});

test('M13 mutant (reviewer R9): sameTarget needing an unchanged baseline ⇒ bound never binds', async () => {
  const mut = await runThrashingFrontier({ source: mutantSameTargetNeedsBaseline() });
  note('mutant-M13-sametarget-needs-baseline', true,
    `mutant calls=${mut.world.calls} hitHardCap=${mut.world.hitHardCap}`);
  assert.equal(mut.world.hitHardCap, true, 'M13 must escape the bound');
});

// =========================================================================
// Territory
// =========================================================================

test('homepage chart.js mirror is byte-identical (LF) sha256', () => {
  const canon = fs.readFileSync(CHART_JS);
  const mirror = fs.readFileSync(CHART_MIRROR);
  assert.equal(canon.includes(Buffer.from([13])), false, 'canonical LF-only');
  assert.equal(mirror.includes(Buffer.from([13])), false, 'mirror LF-only');
  assert.equal(canon.equals(mirror), true, `sha=${sha256(canon)}`);
  note('mirrors-byte-identical', true, sha256(canon));
});
