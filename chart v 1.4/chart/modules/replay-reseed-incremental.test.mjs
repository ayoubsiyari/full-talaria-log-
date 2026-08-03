/**
 * Behavioural coverage for the incremental replay-reseed copy path.
 *
 *   node --test "chart v 1.4/chart/modules/replay-reseed-incremental.test.mjs"
 *
 * Every cell observes BEHAVIOUR (array contents, array identity, element-copy
 * counts, collaborator call counts). Nothing here asserts on source text: the
 * real _reseedReplayFullRawFromLoadedData and its collaborators are extracted
 * from chart.js and executed in a vm sandbox, so a mutant on disk is a mutant
 * in the cell.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
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
const CHART_JS = path.join(ROOT, 'chart v 1.4', 'chart', 'chart.js');
const CHART_MIRROR = path.join(ROOT, 'homepage', 'public', 'chart', 'chart.js');
const SOURCE = fs.readFileSync(CHART_JS, 'utf8');
const MIRROR_SOURCE = fs.readFileSync(CHART_MIRROR, 'utf8');
const SWITCH = '__TALARIA_DISABLE_REPLAY_RESEED_INCREMENTAL_V1';

const METHOD_NAMES = [
  '_replayReseedIncrementalDisabled',
  '_replayReseedCopyCacheSlot',
  '_replayReseedCopyCache',
  '_replayReseedBoundaryTimestamp',
  '_cacheReplayReseedCopy',
  '_replayReseedIncrementalCopy',
  '_reseedReplayCopyArray',
  '_reseedReplayFullRawFromLoadedData',
];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

const BASELINE_HASH = sha256(SOURCE);
const MIRROR_BASELINE_HASH = sha256(MIRROR_SOURCE);

function note(name, pass, detail = '') {
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}\n`);
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

function chartMethods(text) {
  return METHOD_NAMES.map((name) => methodSource(text, name)).join('\n');
}

/**
 * Counts element copies OUT OF a seed source. `[...seedSource]` reads every
 * index; a tail append reads only the new indices. The boundary-timestamp guard
 * reads one index per call. Reading through a Proxy is the only way to observe
 * "how many elements did you actually copy" without trusting the implementation.
 */
function countingArray(bars) {
  const target = bars.slice();
  let reads = 0;
  const proxy = new Proxy(target, {
    get(t, prop, receiver) {
      if (typeof prop === 'string' && /^(?:0|[1-9]\d*)$/.test(prop)) reads += 1;
      return Reflect.get(t, prop, receiver);
    },
  });
  return {
    proxy,
    target,
    reads: () => reads,
    reset: () => { reads = 0; },
    append(count) {
      for (let i = 0; i < count; i += 1) {
        const n = target.length;
        target.push({ t: target[n - 1].t + 60_000, o: n, h: n + 1, l: n - 1, c: n + 0.5 });
      }
    },
  };
}

function makeBars(count, start = 1_700_000_000_000) {
  return Array.from({ length: count }, (_, i) => ({
    t: start + i * 60_000,
    o: i,
    h: i + 1,
    l: i - 1,
    c: i + 0.5,
  }));
}

function makeReplay(overrides = {}) {
  const calls = { syncCurrentIndexFromReplayTimestamp: [] };
  const replay = {
    isActive: true,
    replayTimestamp: 1_700_000_060_000,
    fullRawData: null,
    fullData: null,
    animatingCandle: { t: 1 },
    tickProgress: 0.75,
    tickElapsedMs: 123,
    rawTimeframe: '5m',
    _fullRawDataMatchesTF: true,
    tickPathCache: { stale: [1, 2, 3] },
    tickPathCacheBuilt: true,
    currentIndex: 999_999,
    syncCurrentIndexFromReplayTimestamp(ts) { calls.syncCurrentIndexFromReplayTimestamp.push(ts); },
    ...overrides,
  };
  return { replay, calls };
}

function makeChart(text = SOURCE, { flags = {}, windowMode = 'object' } = {}) {
  const context = vm.createContext({ console, Map, Number, Array, Object, String });
  context.globalThis = context;
  context.__flags = flags;
  context.__windowMode = windowMode;
  vm.runInContext(`
class ChartHarness {
    constructor() {
        this._replayReseedIncrementalCopyCache = null;
        this.replaySystem = null;
        this.rawData = [];
        this.data = null;
        this._panelFullRawData = null;
        this._nativeRawFetchTf = '1m';
        this.currentTimeframe = '1m';
    }

${chartMethods(text)}
}
if (globalThis.__windowMode === 'absent') {
    // leave window undefined
} else if (globalThis.__windowMode === 'throwing') {
    Object.defineProperty(globalThis, 'window', {
        get() { throw new Error('window access denied'); },
    });
} else {
    globalThis.window = Object.assign({}, globalThis.__flags);
}
globalThis.__chart = new ChartHarness();
`, context);
  return { chart: context.__chart, context };
}

/** Rebuild vm-realm arrays in THIS realm; foreign prototypes fail strict deepEqual. */
function timestamps(arr) {
  return Array.from(arr, (bar) => bar.t);
}

function assertSameSeries(actual, expectedBars, label) {
  assert.equal(actual.length, expectedBars.length, `${label}: length`);
  assert.deepEqual(timestamps(actual), timestamps(expectedBars), `${label}: element order and contents`);
  for (let i = 0; i < expectedBars.length; i += 1) {
    assert.equal(actual[i], expectedBars[i], `${label}: element ${i} must be the same bar object (shallow copy)`);
  }
}

const cells = {
  // Steady growth: same seed array grows in place, destination untouched by
  // anyone else. Only the new tail may be copied and the destination array
  // identity must be retained.
  'steady-growth-appends-only-tail': (text = SOURCE) => {
    const { chart } = makeChart(text);
    const counter = countingArray(makeBars(500));
    chart._panelFullRawData = counter.proxy;
    const { replay } = makeReplay();
    chart.replaySystem = replay;

    assert.equal(chart._reseedReplayFullRawFromLoadedData(), true);
    const first = replay.fullRawData;
    assertSameSeries(first, counter.target, 'initial reseed');
    assert.notEqual(first, counter.proxy, 'the copy must not alias the seed source');
    assert.equal(counter.reads(), 501, 'initial reseed reads all 500 elements plus one boundary probe');

    let previous = first;
    for (let round = 0; round < 20; round += 1) {
      counter.reset();
      counter.append(3);
      assert.equal(chart._reseedReplayFullRawFromLoadedData(), true);
      assert.equal(replay.fullRawData, previous, `round ${round}: destination array identity must be retained`);
      assertSameSeries(replay.fullRawData, counter.target, `round ${round}`);
      assert.equal(counter.reads(), 5, `round ${round}: 3 appended elements plus two boundary probes only`);
      previous = replay.fullRawData;
    }
  },

  // replay-system.js:2723 / :3449 do `this.fullRawData = [...this.chart.rawData]`.
  // Handing back the retained array without checking the destination would
  // silently resurrect that stale array over the newer one.
  'destination-replaced-externally-forces-full-copy': (text = SOURCE) => {
    const { chart } = makeChart(text);
    const counter = countingArray(makeBars(40));
    chart._panelFullRawData = counter.proxy;
    const { replay } = makeReplay();
    chart.replaySystem = replay;

    chart._reseedReplayFullRawFromLoadedData();
    const ours = replay.fullRawData;

    // External replacement, exactly as replay-system.js does it, with a NEWER series.
    const external = makeBars(41, 1_800_000_000_000);
    replay.fullRawData = external.slice();
    const externalArray = replay.fullRawData;

    counter.reset();
    counter.append(1);
    chart._reseedReplayFullRawFromLoadedData();

    assert.notEqual(replay.fullRawData, ours, 'must not resurrect the previously retained array');
    assert.notEqual(replay.fullRawData, externalArray, 'must not mutate the externally installed array');
    assertSameSeries(replay.fullRawData, counter.target, 'post-external-replacement reseed');
    assert.equal(counter.reads(), 42, 'destination mismatch must cost a full 41-element copy plus one boundary probe');

    // And the cache must be re-seeded, so the NEXT call can append again.
    counter.reset();
    counter.append(2);
    const afterRecovery = replay.fullRawData;
    chart._reseedReplayFullRawFromLoadedData();
    assert.equal(replay.fullRawData, afterRecovery, 'cache must be re-seeded after a forced full copy');
    assert.equal(counter.reads(), 4, 'recovered fast path copies the 2-element tail only');
  },

  // seedSource is _panelFullRawData when non-empty, else rawData, so the source
  // can legitimately change identity between calls.
  'source-identity-switch-falls-back': (text = SOURCE) => {
    const { chart } = makeChart(text);
    const panel = countingArray(makeBars(30));
    const raw = countingArray(makeBars(12, 1_900_000_000_000));
    chart._panelFullRawData = panel.proxy;
    chart.rawData = raw.proxy;
    const { replay } = makeReplay();
    chart.replaySystem = replay;

    chart._reseedReplayFullRawFromLoadedData();
    const fromPanel = replay.fullRawData;
    assertSameSeries(fromPanel, panel.target, 'panel-sourced reseed');

    // _evictPanelMasterData() nulls the panel master; seedSource becomes rawData.
    chart._panelFullRawData = null;
    raw.reset();
    chart._reseedReplayFullRawFromLoadedData();
    assert.notEqual(replay.fullRawData, fromPanel, 'source switch must not append onto the old array');
    assertSameSeries(replay.fullRawData, raw.target, 'rawData-sourced reseed');
    assert.equal(raw.reads(), 13, 'source switch costs a full 12-element copy plus one boundary probe');

    // Switch back: still correct, still no cross-contamination.
    const fromRaw = replay.fullRawData;
    chart._panelFullRawData = panel.proxy;
    chart._reseedReplayFullRawFromLoadedData();
    assert.notEqual(replay.fullRawData, fromRaw, 'switching back must not append onto the rawData copy');
    assertSameSeries(replay.fullRawData, panel.target, 'switched-back reseed');

    // The hard case: a DIFFERENT array whose prefix carries the SAME timestamps,
    // so the boundary probe agrees and only the identity check can reject it.
    // _mergeIntoPanelFullRawData() builds exactly this — a fresh array that
    // re-uses the existing bars and adds more.
    const env = makeChart(text);
    const original = makeBars(10, 2_000_000_000_000);
    env.chart._panelFullRawData = original;
    const local = makeReplay();
    env.chart.replaySystem = local.replay;
    env.chart._reseedReplayFullRawFromLoadedData();
    const beforeMerge = local.replay.fullRawData;

    const merged = original.concat(makeBars(4, 2_000_000_600_000));
    assert.equal(merged[9].t, original[9].t, 'precondition: the boundary timestamp is unchanged by the merge');
    env.chart._panelFullRawData = merged;
    env.chart._reseedReplayFullRawFromLoadedData();
    assert.notEqual(local.replay.fullRawData, beforeMerge,
      'a fresh array with a matching boundary must still be rejected on identity');
    assertSameSeries(local.replay.fullRawData, merged, 'merged-array reseed');
  },

  'source-shrink-falls-back': (text = SOURCE) => {
    const { chart } = makeChart(text);
    const counter = countingArray(makeBars(20));
    chart._panelFullRawData = counter.proxy;
    const { replay } = makeReplay();
    chart.replaySystem = replay;

    chart._reseedReplayFullRawFromLoadedData();
    const first = replay.fullRawData;

    counter.target.length = 15;
    counter.reset();
    chart._reseedReplayFullRawFromLoadedData();
    assert.notEqual(replay.fullRawData, first, 'a shrunk source must not reuse the longer retained array');
    assert.equal(replay.fullRawData.length, 15, 'copy must be exactly as long as the shrunk source');
    assertSameSeries(replay.fullRawData, counter.target, 'shrink fallback');

    // The case only the length check can catch: when the retained boundary
    // timestamp is null (a trailing bar with no usable `t`), the boundary probe
    // on a shrunk source is ALSO null, so the two agree and a length-blind guard
    // would hand back a longer stale array than the source now holds.
    const env = makeChart(text);
    const ragged = makeBars(12, 2_100_000_000_000);
    ragged[11] = { t: undefined, o: 1, h: 2, l: 0, c: 1.5 };
    env.chart._panelFullRawData = ragged;
    const local = makeReplay();
    env.chart.replaySystem = local.replay;
    env.chart._reseedReplayFullRawFromLoadedData();
    assert.equal(local.replay.fullRawData.length, 12, 'precondition: ragged tail is copied verbatim');

    ragged.length = 6;
    env.chart._reseedReplayFullRawFromLoadedData();
    assert.equal(local.replay.fullRawData.length, 6,
      'a shrunk source must never leave the destination longer than the source');
    assertSameSeries(local.replay.fullRawData, ragged, 'ragged shrink fallback');
  },

  // The cache-slot normaliser: one array per destination slot, and a missing
  // slot key must never cache at all.
  'cache-slots-are-per-destination-and-nullable': (text = SOURCE) => {
    const { chart } = makeChart(text);
    const counter = countingArray(makeBars(12));

    const a1 = chart._reseedReplayCopyArray(counter.proxy, 'slot-a', null);
    const b1 = chart._reseedReplayCopyArray(counter.proxy, 'slot-b', null);
    assert.notEqual(a1, b1, 'two destination slots must get independent arrays');
    assertSameSeries(a1, counter.target, 'slot-a initial');
    assertSameSeries(b1, counter.target, 'slot-b initial');

    counter.append(2);
    const a2 = chart._reseedReplayCopyArray(counter.proxy, 'slot-a', a1);
    const b2 = chart._reseedReplayCopyArray(counter.proxy, 'slot-b', b1);
    assert.equal(a2, a1, 'slot-a must retain its own array');
    assert.equal(b2, b1, 'slot-b must retain its own array');
    assertSameSeries(a2, counter.target, 'slot-a grown');
    assertSameSeries(b2, counter.target, 'slot-b grown');

    const n1 = chart._reseedReplayCopyArray(counter.proxy, null, null);
    const n2 = chart._reseedReplayCopyArray(counter.proxy, null, n1);
    assert.notEqual(n2, n1, 'a null slot key must never be cached');
    assertSameSeries(n2, counter.target, 'null-slot copy');

    // Non-array input is passed straight through, exactly as the legacy guard did.
    assert.equal(chart._reseedReplayCopyArray(null, 'slot-a', null), null);
  },

  // A prepend, or any replacement of the bar sitting on the retained boundary,
  // moves the timestamp at the old length.
  'boundary-timestamp-mismatch-falls-back': (text = SOURCE) => {
    const { chart } = makeChart(text);
    const counter = countingArray(makeBars(10));
    chart._panelFullRawData = counter.proxy;
    const { replay } = makeReplay();
    chart.replaySystem = replay;

    chart._reseedReplayFullRawFromLoadedData();
    const first = replay.fullRawData;

    // Replace the boundary bar in place, then grow.
    counter.target[9] = { t: 1_650_000_000_000, o: 0, h: 1, l: -1, c: 0.5 };
    counter.append(2);
    chart._reseedReplayFullRawFromLoadedData();
    assert.notEqual(replay.fullRawData, first, 'boundary mismatch must full-copy into a fresh array');
    assertSameSeries(replay.fullRawData, counter.target, 'boundary fallback');
    assert.equal(replay.fullRawData[9].t, 1_650_000_000_000, 'boundary fallback must not retain a stale prefix');
  },

  'prepend-falls-back': (text = SOURCE) => {
    const { chart } = makeChart(text);
    const counter = countingArray(makeBars(8));
    chart._panelFullRawData = counter.proxy;
    const { replay } = makeReplay();
    chart.replaySystem = replay;

    chart._reseedReplayFullRawFromLoadedData();
    const first = replay.fullRawData;

    counter.target.unshift(
      { t: 1_699_999_880_000, o: -2, h: -1, l: -3, c: -1.5 },
      { t: 1_699_999_940_000, o: -1, h: 0, l: -2, c: -0.5 },
    );
    chart._reseedReplayFullRawFromLoadedData();
    assert.notEqual(replay.fullRawData, first, 'prepend must abandon the retained array');
    assertSameSeries(replay.fullRawData, counter.target, 'prepend fallback');
    assert.equal(replay.fullRawData[0].t, 1_699_999_880_000, 'prepended head must be present');
  },

  // TRUTHY semantics, read per call, byte-for-byte legacy behaviour when set.
  'kill-switch-truthy-forces-legacy': (text = SOURCE) => {
    for (const flagValue of [true, 1, 'yes', 'false', {}, [], -1, Infinity]) {
      const { chart } = makeChart(text, { flags: { [SWITCH]: flagValue } });
      const counter = countingArray(makeBars(25));
      chart._panelFullRawData = counter.proxy;
      const { replay } = makeReplay();
      chart.replaySystem = replay;

      chart._reseedReplayFullRawFromLoadedData();
      const first = replay.fullRawData;
      counter.reset();
      counter.append(1);
      chart._reseedReplayFullRawFromLoadedData();

      const label = `flag=${typeof flagValue === 'object' ? JSON.stringify(flagValue) : String(flagValue)}`;
      assert.notEqual(replay.fullRawData, first, `${label}: must allocate a fresh array every call`);
      assertSameSeries(replay.fullRawData, counter.target, `${label}: legacy full spread`);
      assert.equal(counter.reads(), 26, `${label}: legacy path copies all 26 elements, no boundary probes`);
    }

    // Falsy values must NOT disable, and the flag is re-read on every call.
    for (const flagValue of [false, 0, '', null, undefined, NaN]) {
      const { chart } = makeChart(text, { flags: { [SWITCH]: flagValue } });
      const counter = countingArray(makeBars(25));
      chart._panelFullRawData = counter.proxy;
      const { replay } = makeReplay();
      chart.replaySystem = replay;
      chart._reseedReplayFullRawFromLoadedData();
      const first = replay.fullRawData;
      counter.reset();
      counter.append(1);
      chart._reseedReplayFullRawFromLoadedData();
      assert.equal(replay.fullRawData, first, `falsy ${String(flagValue)} must keep the incremental path`);
      assert.equal(counter.reads(), 3, `falsy ${String(flagValue)} copies the 1-element tail only`);
    }
  },

  'kill-switch-is-per-call-and-cannot-throw': (text = SOURCE) => {
    const { chart, context } = makeChart(text);
    const counter = countingArray(makeBars(16));
    chart._panelFullRawData = counter.proxy;
    const { replay } = makeReplay();
    chart.replaySystem = replay;

    chart._reseedReplayFullRawFromLoadedData();
    const incremental = replay.fullRawData;

    context.window[SWITCH] = 'on';
    counter.reset();
    counter.append(1);
    chart._reseedReplayFullRawFromLoadedData();
    assert.notEqual(replay.fullRawData, incremental, 'flipping the flag mid-session must take effect on the next call');
    assert.equal(counter.reads(), 17, 'legacy path after mid-session flip');

    context.window[SWITCH] = 0;
    counter.reset();
    counter.append(1);
    const beforeReenable = replay.fullRawData;
    chart._reseedReplayFullRawFromLoadedData();
    assert.notEqual(replay.fullRawData, beforeReenable,
      'first call after re-enabling still full-copies because the cache was not seeded while disabled');
    assertSameSeries(replay.fullRawData, counter.target, 'post-re-enable reseed');
    const reseeded = replay.fullRawData;
    counter.reset();
    counter.append(1);
    chart._reseedReplayFullRawFromLoadedData();
    assert.equal(replay.fullRawData, reseeded, 'incremental path resumes once the cache is seeded again');

    // A throwing `window` getter and an absent `window` must both be survivable.
    for (const windowMode of ['throwing', 'absent']) {
      const env = makeChart(text, { windowMode });
      const bars = countingArray(makeBars(6));
      env.chart._panelFullRawData = bars.proxy;
      const local = makeReplay();
      env.chart.replaySystem = local.replay;
      assert.equal(env.chart._reseedReplayFullRawFromLoadedData(), true, `${windowMode} window must not throw`);
      assertSameSeries(local.replay.fullRawData, bars.target, `${windowMode} window reseed`);
    }
  },

  // Only the array copy is optimised. Everything else must still be reset on
  // BOTH the incremental and the full-copy path.
  'non-array-state-resets-on-both-paths': (text = SOURCE) => {
    const run = (flagValue, expectIncremental) => {
      const flags = flagValue === undefined ? {} : { [SWITCH]: flagValue };
      const { chart } = makeChart(text, { flags });
      const counter = countingArray(makeBars(50));
      chart._panelFullRawData = counter.proxy;
      chart.data = makeBars(9, 1_500_000_000_000);
      chart._nativeRawFetchTf = '1m';
      const { replay, calls } = makeReplay();
      chart.replaySystem = replay;

      chart._reseedReplayFullRawFromLoadedData();
      const first = replay.fullRawData;

      // Dirty every piece of state again, then reseed a second time so the
      // assertions cover the path under test rather than only the first call.
      replay.animatingCandle = { t: 42 };
      replay.tickProgress = 0.9;
      replay.tickElapsedMs = 456;
      replay.rawTimeframe = '15m';
      replay._fullRawDataMatchesTF = true;
      replay.tickPathCache = { stale: true };
      replay.tickPathCacheBuilt = true;
      const dirtyCache = replay.tickPathCache;
      calls.syncCurrentIndexFromReplayTimestamp.length = 0;
      counter.append(1);

      assert.equal(chart._reseedReplayFullRawFromLoadedData(), true);
      const label = expectIncremental ? 'incremental path' : 'legacy path';
      assert.equal(replay.fullRawData === first, expectIncremental, `${label}: array path selection`);

      assert.equal(replay.animatingCandle, null, `${label}: animatingCandle reset`);
      assert.equal(replay.tickProgress, 0, `${label}: tickProgress reset`);
      assert.equal(replay.tickElapsedMs, 0, `${label}: tickElapsedMs reset`);
      assert.equal(replay.rawTimeframe, '1m', `${label}: rawTimeframe reset from _nativeRawFetchTf`);
      assert.equal(replay._fullRawDataMatchesTF, false, `${label}: _fullRawDataMatchesTF reset`);
      assert.notEqual(replay.tickPathCache, dirtyCache, `${label}: tickPathCache replaced`);
      assert.deepEqual(Object.keys(replay.tickPathCache), [], `${label}: tickPathCache emptied`);
      assert.equal(replay.tickPathCacheBuilt, false, `${label}: tickPathCacheBuilt reset`);
      assert.deepEqual(calls.syncCurrentIndexFromReplayTimestamp, [1_700_000_060_000],
        `${label}: syncCurrentIndexFromReplayTimestamp must run with the kept timestamp`);

      // fullData must still be rebuilt from the display series on both paths.
      assert.notEqual(replay.fullData, chart.data, `${label}: fullData must be a copy`);
      assert.deepEqual(timestamps(replay.fullData), timestamps(chart.data), `${label}: fullData contents`);
      chart.data = null;
      chart._reseedReplayFullRawFromLoadedData();
      assert.equal(replay.fullData, null, `${label}: fullData is null when this.data is not an array`);
    };

    run(undefined, true);
    run('legacy', false);
  },

  // The stale-currentIndex clamp: a stale index snaps the next seek to the
  // wrong date, so it must still run when there is no usable keepTs.
  'stale-current-index-is-clamped-on-both-paths': (text = SOURCE) => {
    const run = (flagValue, expectIncremental) => {
      const flags = flagValue === undefined ? {} : { [SWITCH]: flagValue };
      const { chart } = makeChart(text, { flags });
      const counter = countingArray(makeBars(30));
      chart._panelFullRawData = counter.proxy;
      const { replay, calls } = makeReplay({ replayTimestamp: NaN, currentIndex: 999 });
      chart.replaySystem = replay;

      chart._reseedReplayFullRawFromLoadedData();
      const first = replay.fullRawData;
      assert.equal(replay.currentIndex, 29, 'stale index must be clamped to the last element');
      assert.deepEqual(calls.syncCurrentIndexFromReplayTimestamp, [],
        'a non-finite keepTs must not call the sync helper');

      replay.currentIndex = 5_000;
      counter.append(4);
      chart._reseedReplayFullRawFromLoadedData();
      assert.equal(replay.fullRawData === first, expectIncremental, 'array path selection');
      assert.equal(replay.currentIndex, 33, 'clamp must use the CURRENT length after the reseed');

      // An in-range index must be left alone.
      replay.currentIndex = 7;
      counter.append(1);
      chart._reseedReplayFullRawFromLoadedData();
      assert.equal(replay.currentIndex, 7, 'an in-range index must not be clamped');
    };

    run(undefined, true);
    run(1, false);
  },

  'inactive-or-empty-inputs-are-refused': (text = SOURCE) => {
    const { chart } = makeChart(text);
    assert.equal(chart._reseedReplayFullRawFromLoadedData(), false, 'no replay system');

    const { replay } = makeReplay({ isActive: false });
    chart.replaySystem = replay;
    chart._panelFullRawData = makeBars(5);
    assert.equal(chart._reseedReplayFullRawFromLoadedData(), false, 'inactive replay');
    assert.equal(replay.fullRawData, null, 'inactive replay must not be touched');

    replay.isActive = true;
    chart._panelFullRawData = [];
    chart.rawData = [];
    assert.equal(chart._reseedReplayFullRawFromLoadedData(), false, 'empty seed source');
    assert.equal(replay.fullRawData, null, 'empty seed source must not be copied');

    chart.rawData = null;
    assert.equal(chart._reseedReplayFullRawFromLoadedData(), false, 'non-array seed source');
  },

  // Hazard 3 from the brief, measured rather than asserted by adjective:
  // this.data is the display series, rebuilt by resampleData() every tick, so
  // the same guard can never hit on it. This cell records the hit rate.
  'display-series-cannot-pay': (text = SOURCE) => {
    const { chart } = makeChart(text);
    const master = countingArray(makeBars(200));
    chart._panelFullRawData = master.proxy;
    const { replay } = makeReplay();
    chart.replaySystem = replay;

    let displayHits = 0;
    let masterHits = 0;
    let displayElementCopies = 0;
    const TICKS = 60;
    for (let tick = 0; tick < TICKS; tick += 1) {
      // resampleData() returns a FRESH array on every tick (replay-system.js
      // assigns chart.data = chart.resampleData(...) each updateChartData).
      chart.data = makeBars(150 + tick, 1_500_000_000_000);
      const previousFullData = replay.fullData;
      const previousFullRaw = replay.fullRawData;
      master.append(1);
      chart._reseedReplayFullRawFromLoadedData();
      if (replay.fullData === previousFullData) displayHits += 1;
      if (previousFullRaw !== null && replay.fullRawData === previousFullRaw) masterHits += 1;
      displayElementCopies += chart.data.length;
    }

    assert.equal(displayHits, 0,
      'the display series can never be retained: identity churns every tick');
    assert.equal(masterHits, TICKS - 1,
      'the raw master, by contrast, is retained on every call after the first');
    note('display-series-cannot-pay', true,
      `fullData retained ${displayHits}/${TICKS} calls (${displayElementCopies} element copies unavoidable); `
      + `fullRawData retained ${masterHits}/${TICKS}`);
  },

  // THE NUMBER. Legacy vs incremental element copies over a 30s playback on the
  // ~70,989-bar master, measured by counting reads out of the seed source.
  'playback-copy-budget': (text = SOURCE) => {
    const MASTER_BARS = 70_989;
    const RESEEDS = 30;

    const measure = (flagValue) => {
      const flags = flagValue === undefined ? {} : { [SWITCH]: flagValue };
      const { chart } = makeChart(text, { flags });
      const counter = countingArray(makeBars(MASTER_BARS - RESEEDS));
      chart._panelFullRawData = counter.proxy;
      const { replay } = makeReplay();
      chart.replaySystem = replay;
      chart.data = null;

      counter.reset();
      for (let i = 0; i < RESEEDS; i += 1) {
        // Worst case for the incremental path: one new 1m bar before EVERY call.
        counter.append(1);
        chart._reseedReplayFullRawFromLoadedData();
      }
      assertSameSeries(replay.fullRawData, counter.target, `budget flag=${String(flagValue)}`);
      return counter.reads();
    };

    const legacy = measure('legacy');
    const incremental = measure(undefined);

    // One mid-playback fetch replaces the master array (_mergeIntoPanelFullRawData
    // always assigns a NEW array), so charge the incremental path a full re-copy.
    const withOneRefetch = incremental + MASTER_BARS + 1;

    assert.ok(legacy > 2_000_000, `legacy budget should be millions of copies, got ${legacy}`);
    assert.ok(incremental < legacy / 25,
      `incremental budget must be at least 25x smaller: legacy=${legacy} incremental=${incremental}`);
    assert.ok(withOneRefetch < legacy / 12,
      `even charging a full mid-playback re-copy must beat legacy 12x: ${withOneRefetch} vs ${legacy}`);
    note('playback-copy-budget', true,
      `master=${MASTER_BARS} reseeds=${RESEEDS} legacy=${legacy} incremental=${incremental} `
      + `(${(legacy / incremental).toFixed(1)}x fewer) incremental+1refetch=${withOneRefetch} `
      + `(${(legacy / withOneRefetch).toFixed(1)}x fewer)`);
  },
};

test('steady growth appends only the tail and retains the destination', () => {
  cells['steady-growth-appends-only-tail']();
  note('steady-growth-appends-only-tail', true);
});

test('destination replaced externally forces a full copy', () => {
  cells['destination-replaced-externally-forces-full-copy']();
  note('destination-replaced-externally-forces-full-copy', true);
});

test('seed source identity switch falls back cleanly', () => {
  cells['source-identity-switch-falls-back']();
  note('source-identity-switch-falls-back', true);
});

test('seed source shrink falls back', () => {
  cells['source-shrink-falls-back']();
  note('source-shrink-falls-back', true);
});

test('cache slots are per destination and a null slot never caches', () => {
  cells['cache-slots-are-per-destination-and-nullable']();
  note('cache-slots-are-per-destination-and-nullable', true);
});

test('boundary timestamp mismatch falls back', () => {
  cells['boundary-timestamp-mismatch-falls-back']();
  note('boundary-timestamp-mismatch-falls-back', true);
});

test('prepend falls back to a full copy', () => {
  cells['prepend-falls-back']();
  note('prepend-falls-back', true);
});

test('kill-switch truthy values force the legacy full spread', () => {
  cells['kill-switch-truthy-forces-legacy']();
  note('kill-switch-truthy-forces-legacy', true);
});

test('kill-switch is read per call and cannot throw', () => {
  cells['kill-switch-is-per-call-and-cannot-throw']();
  note('kill-switch-is-per-call-and-cannot-throw', true);
});

test('non-array replay state is reset on both paths', () => {
  cells['non-array-state-resets-on-both-paths']();
  note('non-array-state-resets-on-both-paths', true);
});

test('stale currentIndex is clamped on both paths', () => {
  cells['stale-current-index-is-clamped-on-both-paths']();
  note('stale-current-index-is-clamped-on-both-paths', true);
});

test('inactive replay and empty seed sources are refused', () => {
  cells['inactive-or-empty-inputs-are-refused']();
  note('inactive-or-empty-inputs-are-refused', true);
});

test('display series cannot pay for an incremental copy', () => {
  cells['display-series-cannot-pay']();
});

test('30s playback copy budget', () => {
  cells['playback-copy-budget']();
});

const mutants = [
  {
    name: 'drop-destination-identity-check',
    killedBy: 'destination-replaced-externally-forces-full-copy',
    needle: '            && cache.copy === destination',
    replacement: '            && true',
  },
  {
    name: 'drop-seed-source-identity-check',
    killedBy: 'source-identity-switch-falls-back',
    needle: '            && cache.seedSource === seedSource',
    replacement: '            && true',
  },
  {
    name: 'drop-shrink-check',
    killedBy: 'source-shrink-falls-back',
    needle: '            && seedSource.length >= prevLen',
    replacement: '            && true',
  },
  {
    name: 'drop-boundary-timestamp-check',
    killedBy: 'boundary-timestamp-mismatch-falls-back',
    needle: '            && (prevLen === 0 || this._replayReseedBoundaryTimestamp(seedSource, prevLen) === cache.lastTimestamp);',
    replacement: '            && true;',
  },
  {
    name: 'boundary-probe-at-new-length-misses-prepend',
    killedBy: 'prepend-falls-back',
    needle: '            && (prevLen === 0 || this._replayReseedBoundaryTimestamp(seedSource, prevLen) === cache.lastTimestamp);',
    replacement: '            && (prevLen === 0 || this._replayReseedBoundaryTimestamp(seedSource, seedSource.length) === cache.lastTimestamp);',
  },
  {
    name: 'off-by-one-tail-start',
    killedBy: 'steady-growth-appends-only-tail',
    needle: '        for (let i = prevLen; i < seedSource.length; i += 1) {',
    replacement: '        for (let i = prevLen + 1; i < seedSource.length; i += 1) {',
  },
  {
    name: 'do-not-advance-cached-length',
    killedBy: 'steady-growth-appends-only-tail',
    needle: '        cache.seedLength = seedSource.length;',
    replacement: '        cache.seedLength = prevLen;',
  },
  {
    name: 'do-not-advance-cached-boundary',
    killedBy: 'steady-growth-appends-only-tail',
    needle: '        cache.lastTimestamp = this._replayReseedBoundaryTimestamp(seedSource, seedSource.length);\n        return out;',
    replacement: '        return out;',
  },
  {
    name: 'narrow-kill-switch-to-strict-true',
    killedBy: 'kill-switch-truthy-forces-legacy',
    needle: "            return !!(typeof window !== 'undefined' && window.__TALARIA_DISABLE_REPLAY_RESEED_INCREMENTAL_V1);",
    replacement: "            return (typeof window !== 'undefined' && window.__TALARIA_DISABLE_REPLAY_RESEED_INCREMENTAL_V1 === true);",
  },
  {
    name: 'invert-kill-switch-polarity',
    killedBy: 'kill-switch-truthy-forces-legacy',
    needle: '        if (this._replayReseedIncrementalDisabled()) return [...seedSource];',
    replacement: '        if (!this._replayReseedIncrementalDisabled()) return [...seedSource];',
  },
  {
    name: 'kill-switch-throws-instead-of-defaulting',
    killedBy: 'kill-switch-is-per-call-and-cannot-throw',
    needle: `    _replayReseedIncrementalDisabled() {
        try {
            return !!(typeof window !== 'undefined' && window.__TALARIA_DISABLE_REPLAY_RESEED_INCREMENTAL_V1);
        } catch (_e) {
            return false;
        }
    }`,
    replacement: `    _replayReseedIncrementalDisabled() {
        return !!window.__TALARIA_DISABLE_REPLAY_RESEED_INCREMENTAL_V1;
    }`,
  },
  {
    name: 'share-one-cache-slot-for-every-destination',
    killedBy: 'cache-slots-are-per-destination-and-nullable',
    needle: '        if (slotKey == null) return null;\n        return String(slotKey);',
    replacement: "        if (slotKey == null) return null;\n        return '__one_reseed_slot__';",
  },
  {
    name: 'cache-under-a-default-key-when-the-slot-is-missing',
    killedBy: 'cache-slots-are-per-destination-and-nullable',
    needle: '        if (!cacheKey) return [...seedSource];',
    replacement: "        if (!cacheKey) return this._replayReseedIncrementalCopy(seedSource, '__default__', destination);",
  },
  {
    name: 'alias-the-seed-source-instead-of-copying',
    killedBy: 'steady-growth-appends-only-tail',
    needle: '            return this._cacheReplayReseedCopy(cacheKey, seedSource, [...seedSource]);',
    replacement: '            return this._cacheReplayReseedCopy(cacheKey, seedSource, seedSource);',
  },
  {
    name: 'skip-animating-candle-and-tick-resets',
    killedBy: 'non-array-state-resets-on-both-paths',
    needle: `        replay.animatingCandle = null;
        replay.tickProgress = 0;
        replay.tickElapsedMs = 0;
        replay.fullRawData = this._reseedReplayCopyArray(seedSource, 'replay.fullRawData', replay.fullRawData);`,
    replacement: "        replay.fullRawData = this._reseedReplayCopyArray(seedSource, 'replay.fullRawData', replay.fullRawData);",
  },
  {
    name: 'skip-tick-path-cache-reset',
    killedBy: 'non-array-state-resets-on-both-paths',
    needle: `        replay.rawTimeframe = this._nativeRawFetchTf || this.currentTimeframe;
        replay._fullRawDataMatchesTF = false;
        replay.tickPathCache = {};
        replay.tickPathCacheBuilt = false;`,
    replacement: `        replay.rawTimeframe = this._nativeRawFetchTf || this.currentTimeframe;
        replay._fullRawDataMatchesTF = false;`,
  },
  {
    name: 'skip-raw-timeframe-and-tf-match-reset',
    killedBy: 'non-array-state-resets-on-both-paths',
    needle: '        replay.rawTimeframe = this._nativeRawFetchTf || this.currentTimeframe;\n        replay._fullRawDataMatchesTF = false;',
    replacement: '        replay._fullRawDataMatchesTF = true;',
  },
  {
    name: 'skip-stale-current-index-clamp',
    killedBy: 'stale-current-index-is-clamped-on-both-paths',
    needle: `        } else if (replay.currentIndex >= replay.fullRawData.length) {
            replay.currentIndex = Math.max(0, replay.fullRawData.length - 1);
        }`,
    replacement: '        }',
  },
  {
    name: 'skip-full-data-rebuild',
    killedBy: 'non-array-state-resets-on-both-paths',
    needle: `        // display-series-cannot-pay cell for the measured hit rate.
        replay.fullData = Array.isArray(this.data) ? [...this.data] : null;`,
    replacement: `        // display-series-cannot-pay cell for the measured hit rate.
        replay.fullData = replay.fullData || null;`,
  },
  {
    name: 'alias-the-display-series-into-full-data',
    killedBy: 'non-array-state-resets-on-both-paths',
    needle: `        // display-series-cannot-pay cell for the measured hit rate.
        replay.fullData = Array.isArray(this.data) ? [...this.data] : null;`,
    replacement: `        // display-series-cannot-pay cell for the measured hit rate.
        replay.fullData = Array.isArray(this.data) ? this.data : null;`,
  },
  {
    name: 'NEGATIVE-CONTROL-needle-does-not-exist',
    killedBy: 'steady-growth-appends-only-tail',
    needle: '        replay.fullRawData = this._reseedReplayCopyArrayThatWasNeverWritten(seedSource);',
    replacement: '        replay.fullRawData = null;',
    expectNotApplied: true,
  },
];

function countNeedle(text, needle) {
  return text.split(needle).length - 1;
}

function restoreMirrors() {
  fs.writeFileSync(CHART_JS, SOURCE);
  fs.writeFileSync(CHART_MIRROR, MIRROR_SOURCE);
}

test('mutant table is applied on disk to both mirrors and every mutant is killed', () => {
  const survived = [];
  const unexpectedlyNotApplied = [];
  const negativeControlsReported = [];

  try {
    for (const mutant of mutants) {
      const primaryCount = countNeedle(SOURCE, mutant.needle);
      const mirrorCount = countNeedle(MIRROR_SOURCE, mutant.needle);

      if (primaryCount !== 1 || mirrorCount !== 1) {
        process.stdout.write(`NOT_APPLIED ${mutant.name} primary=${primaryCount} mirror=${mirrorCount}\n`);
        if (mutant.expectNotApplied) {
          negativeControlsReported.push(mutant.name);
        } else {
          unexpectedlyNotApplied.push(`${mutant.name} primary=${primaryCount} mirror=${mirrorCount}`);
        }
        continue;
      }
      assert.equal(mutant.expectNotApplied, undefined,
        `${mutant.name} is a negative control but its needle EXISTS — the control is broken`);

      fs.writeFileSync(CHART_JS, SOURCE.replace(mutant.needle, mutant.replacement));
      fs.writeFileSync(CHART_MIRROR, MIRROR_SOURCE.replace(mutant.needle, mutant.replacement));
      const mutatedOnDisk = fs.readFileSync(CHART_JS, 'utf8');
      assert.notEqual(sha256(mutatedOnDisk), BASELINE_HASH, `${mutant.name} must actually change the file on disk`);
      assert.equal(
        sha256(mutatedOnDisk),
        sha256(fs.readFileSync(CHART_MIRROR, 'utf8')),
        `${mutant.name} must be applied identically to both mirrors`,
      );

      let killed = false;
      try {
        cells[mutant.killedBy](mutatedOnDisk);
      } catch (error) {
        killed = true;
        process.stdout.write(`MUTANT ${mutant.name} KILLED_BY ${mutant.killedBy}: ${error.message.split('\n')[0]}\n`);
      } finally {
        restoreMirrors();
      }

      assert.equal(sha256(fs.readFileSync(CHART_JS, 'utf8')), BASELINE_HASH, `${mutant.name}: primary restored`);
      assert.equal(sha256(fs.readFileSync(CHART_MIRROR, 'utf8')), MIRROR_BASELINE_HASH, `${mutant.name}: mirror restored`);

      if (!killed) {
        process.stdout.write(`SURVIVED ${mutant.name} expected=${mutant.killedBy}\n`);
        survived.push(mutant.name);
      }
    }
  } finally {
    restoreMirrors();
  }

  assert.deepEqual(unexpectedlyNotApplied, [], 'every real mutant must apply exactly once to BOTH mirrors');
  assert.deepEqual(survived, [], 'every real mutant must be killed by its named behavioural cell');
  assert.deepEqual(negativeControlsReported, ['NEGATIVE-CONTROL-needle-does-not-exist'],
    'the negative control must report NOT_APPLIED');
  note('mutant-table', true,
    `${mutants.length - 1} real mutants killed, 0 survived, 1 negative control reported NOT_APPLIED`);
});

test('homepage chart.js mirror is byte-identical', () => {
  const primary = fs.readFileSync(CHART_JS);
  const mirror = fs.readFileSync(CHART_MIRROR);
  note('mirror-byte-identity', primary.equals(mirror), `sha256=${sha256(primary)}`);
  assert.equal(sha256(primary), sha256(mirror));
});
