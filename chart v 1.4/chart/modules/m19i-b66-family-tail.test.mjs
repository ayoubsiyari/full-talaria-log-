import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
function findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'chart v 1.4'))
      && fs.existsSync(path.join(dir, 'homepage'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`repository root not found from ${start}`);
}
const ROOT = findRepoRoot(HERE);
const PRODUCT = path.join(HERE, 'chart-indicators-full.js');
const PERF = path.join(HERE, 'indicator-performance.js');
const WORKER = path.join(HERE, '..', 'workers', 'indicator-worker.js');
const MANAGER = path.join(HERE, '..', 'multichart', 'multichart-manager.js');
const B63 = '0048865cf0b58a9c4bc552e56822c914089fae52';
const KILL = '__TALARIA_DISABLE_M19I_FAMILY_TAIL_OWNERSHIP_V1';
const LANE2 = Object.freeze({
  threeDay: { bars: 4320, bytes: 207360, emaP50Ms: 3.6091 },
  threeYear: { bars: 750000, bytes: 36000000, ema1P50Ms: 180.5687,
    ema3P50Ms: 220.4642, ema5P50Ms: 426.2357, sma1P50Ms: 627.8778 },
  browser: { e3Prime: 'BLOCKED_ACTUAL_PAINT', e6: 'BLOCKED_ACTUAL_SESSION' },
});

const workerSource = fs.readFileSync(WORKER, 'utf8');
const perfSource = fs.readFileSync(PERF, 'utf8');
const productSource = fs.readFileSync(PRODUCT, 'utf8');
const posts = [];

function workerCalculate(message) {
  let reply;
  const self = { onmessage: null, postMessage: (m) => { reply = m; } };
  vm.runInNewContext(workerSource, { self, console });
  self.onmessage({ data: message });
  return reply;
}

class FakeWorker {
  static hold = false;
  static held = [];
  static failNext = false;
  constructor() { this.onmessage = null; this.onerror = null; }
  postMessage(message, transfer = []) {
    posts.push({ type: message.type, bytes: message.payload?.barsPacked?.byteLength || 0,
      transfer: transfer.length, buffer: message.payload?.barsPacked?.buffer });
    const deliver = () => {
      if (FakeWorker.failNext) {
        FakeWorker.failNext = false;
        this.onmessage?.({ data: { type: 'ERROR', id: message.id, error: 'injected' } });
      } else {
        this.onmessage?.({ data: workerCalculate(message) });
      }
    };
    if (FakeWorker.hold) FakeWorker.held.push(deliver);
    else queueMicrotask(deliver);
  }
  static releaseAll() {
    const held = FakeWorker.held.splice(0);
    held.forEach((deliver) => deliver());
  }
}

function load(source = productSource, b66 = true) {
  const listeners = {};
  const adds = [], removes = [];
  const win = {
    Chart: function Chart() {},
    addEventListener(type, fn) {
      (listeners[type] ||= []).push(fn);
      adds.push({ type, fn });
    },
    removeEventListener(type, fn) {
      const list = listeners[type] || [];
      const ix = list.indexOf(fn);
      if (ix >= 0) list.splice(ix, 1);
      removes.push({ type, fn, matched: ix >= 0 });
    },
    _listeners: listeners,
    _listenerAdds: adds,
    _listenerRemoves: removes,
  };
  if (!b66) win[KILL] = true;
  new Function('window', 'Worker', perfSource)(win, FakeWorker);
  new Function('window', 'Worker', source)(win, FakeWorker);
  return win;
}

function realManagerFor(panelChart) {
  const shell = {
    MultichartGuards: { filterForbiddenFields: (v) => ({ clean: v, dropped: [] }) },
    addEventListener() {}, removeEventListener() {},
  };
  new Function('window', fs.readFileSync(MANAGER, 'utf8'))(shell);
  const manager = new shell.MultichartManager({ container: {} });
  let removed = 0;
  manager.charts.set('panel', {
    id: 'panel',
    frame: { contentWindow: { chart: panelChart }, remove() { removed++; } },
  });
  return { manager, removed: () => removed };
}

function bars(n, volatile = false) {
  let px = 100;
  return Array.from({ length: n }, (_, i) => {
    const shock = volatile && i % 137 === 0 ? (i % 274 ? 45 : -38) : 0;
    px += Math.sin(i * .071) * (volatile ? 3 : .08) + shock;
    const c = px + Math.cos(i * .19) * (volatile ? 2 : .03);
    return { t: 1700000000000 + i * 60000, o: px, h: Math.max(px, c) + 1,
      l: Math.min(px, c) - 1, c, v: 1000 + (i % 89) * (volatile ? 50 : 1) };
  });
}

function chart(win, data, active) {
  const c = Object.create(win.Chart.prototype);
  c.data = data; c.rawData = data; c.currentTimeframe = '1m'; c.dataVersion = 1;
  c.indicators = { active, data: {} }; c.replaySystem = { isActive: true, isPlaying: true };
  c.updateOHLCIndicators = () => {}; c._renders = 0;
  c.scheduleRender = () => { c._renders++; };
  c.recalculateIndicators();
  return c;
}

function numericSeries(pack) {
  if (Array.isArray(pack)) return { line: pack };
  return Object.fromEntries(Object.entries(pack || {}).filter(([, v]) => Array.isArray(v)));
}

function maxTipDelta(a, b) {
  let max = 0;
  const as = numericSeries(a), bs = numericSeries(b);
  for (const key of Object.keys(as)) {
    if (!bs[key]) continue;
    const av = as[key][as[key].length - 1], bv = bs[key][bs[key].length - 1];
    if (Number.isFinite(av) && Number.isFinite(bv)) max = Math.max(max, Math.abs(av - bv));
  }
  return max;
}

const families = [
  ['ema', { period: 20 }, 1e-8],
  ['dema', { period: 20 }, 2e-8],
  ['tema', { period: 20 }, 3e-8],
  ['macd', { fast: 12, slow: 26, signal: 9 }, 3e-8],
  ['ppo', { fast: 12, slow: 26, signal: 9 }, 3e-8],
  ['rsi', { period: 14 }, 1e-7],
  ['atr', { period: 14 }, 1e-8],
  ['keltner', { period: 20, multiplier: 2 }, 2e-8],
  ['trix', { period: 15 }, 5e-8],
];

test('immutable b63 product path RED and B66 product path GREEN painted lag', async () => {
  const b63 = execFileSync('git', ['show', `${B63}:chart v 1.4/chart/modules/chart-indicators-full.js`],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const all = bars(1020, true);
  const run = async (source, b66) => {
    const win = load(source, b66);
    const ind = { id: 'ema', type: 'ema', params: { period: 20 } };
    const c = chart(win, all.slice(0, 1000), [ind]);
    const paintedLengths = [];
    const lagBars = [];
    const fullApplyTicks = [];
    let tick = 0;
    let paintedLength = c.indicators.data.ema.line.length;
    const apply = c._applyIndicatorWorkerResults.bind(c);
    c._applyIndicatorWorkerResults = (...args) => {
      apply(...args);
      if (!args[3] && c.indicators.data.ema.line.length === c.data.length) {
        fullApplyTicks.push(tick);
      }
    };
    c._isInteractionFastRender = () => true;
    c.drawIndicators = () => { paintedLength = c.indicators.data.ema.line.length; };
    FakeWorker.hold = true;
    let releases = 0;
    for (let round = 0; round < 2; round++) {
      for (let j = 0; j < 5; j++) {
        tick++;
        c.data.push(all[1000 + round * 5 + j]);
        c.drawIndicatorsOptimized();
        paintedLengths.push(paintedLength);
        lagBars.push(c.data.length - paintedLength);
      }
      for (let guard = 0; guard < 8 && c.indicators.data.ema.line.length < c.data.length; guard++) {
        FakeWorker.releaseAll(); releases++;
        await new Promise((r) => setImmediate(r));
      }
    }
    FakeWorker.hold = false;
    FakeWorker.releaseAll();
    await new Promise((r) => setImmediate(r));
    clearTimeout(c._m19iB66ReconcileTimer);
    return { maxLagBars: Math.max(...lagBars), releases,
      appliedLength: c.indicators.data.ema.line.length, fullApplyTicks,
      frozenPaintSteps: paintedLengths.slice(1).filter((v, i) => v === paintedLengths[i]).length };
  };
  const red = await run(b63, false);
  assert.ok(red.maxLagBars >= 4, `real b63 draw path leaves EMA ${red.maxLagBars} painted bars behind`);
  assert.ok(red.releases >= 1, 'real full worker replies drive the eventual apply');
  assert.equal(red.appliedLength, 1010, 'real b63 full-pass apply eventually catches up');
  assert.deepEqual(red.fullApplyTicks, [5, 10],
    'accepted full-pass applies occur only at controlled cadence boundaries');
  assert.ok(red.frozenPaintSteps >= 6, 'painted endpoint freezes between full-pass applies');
  const green = await run(productSource, true);
  assert.ok(green.maxLagBars <= 1, 'B66 bridge keeps painted EMA within one bar');
  assert.equal(green.appliedLength, 1010);
  assert.deepEqual(green.fullApplyTicks, [], 'B66 paint correctness does not depend on full-pass cadence');
  if (FakeWorker.held.length) {
    FakeWorker.hold = false;
    FakeWorker.releaseAll();
  }
});

for (const volatile of [false, true]) {
  test(`G1/G2 family epsilon corpus (${volatile ? 'high-volatility' : 'normal'})`, () => {
    const win = load();
    const data = bars(5000, volatile);
    for (const [type, params, epsilon] of families) {
      const ind = { id: type, type, params };
      const c = chart(win, data.map((b) => ({ ...b })), [ind]);
      c.data[c.data.length - 1].c += volatile ? 17 : .25;
      c.data[c.data.length - 1].h = Math.max(c.data.at(-1).h, c.data.at(-1).c);
      const beforeVersion = c._indicatorRenderVersion || 0;
      assert.equal(c._m19iExactTailPaint(), true, `${type} publishes at paint time`);
      const freshInd = { id: `${type}-fresh`, type, params: { ...params } };
      const fresh = chart(win, c.data.map((b) => ({ ...b })), [freshInd]);
      const delta = maxTipDelta(c.indicators.data[type], fresh.indicators.data[freshInd.id]);
      assert.ok(delta <= epsilon, `${type} delta ${delta} <= ${epsilon}`);
      const range = Math.max(...c.data.slice(-300).map((b) => b.h))
        - Math.min(...c.data.slice(-300).map((b) => b.l));
      assert.ok(delta / Math.max(range, 1e-12) * 400 < .5, `${type} reconciliation is sub-pixel`);
      assert.equal(c._indicatorRenderVersion, beforeVersion + 1, `${type} apply bumps one layer version`);
    }
  });
}

test('G4 instance publication is atomic and unrelated instances are not hostage', () => {
  const win = load();
  const data = bars(5000, true);
  const active = [
    { id: 'sma', type: 'sma', params: { period: 20 } },
    { id: 'macd', type: 'macd', params: { fast: 12, slow: 26, signal: 9 } },
    { id: 'vwap', type: 'vwap', params: {}, style: {} },
    { id: 'killzone', type: 'killzones', params: {}, style: {} },
  ];
  const c = chart(win, data, active);
  const oldVwap = c.indicators.data.vwap;
  c.data.at(-1).c += 9;
  const renders = c._renders;
  assert.equal(c._m19iExactTailPaint(), true);
  assert.equal(active[0]._m19iB66PublishedVersion, 1, 'SMA publishes independently');
  assert.equal(active[1]._m19iB66PublishedVersion, 1, 'MACD publishes as one instance');
  assert.equal(c.indicators.data.vwap, oldVwap, 'cumulative VWAP remains honestly reconciler-owned');
  assert.ok(['macd', 'signal', 'histogram'].every((k) => Array.isArray(c.indicators.data.macd[k])),
    'all MACD series share the instance commit');
  assert.equal(c._renders, renders + 1, 'one coalesced render for the apply commit');
  clearTimeout(c._m19iB66ReconcileTimer);
});

test('G3 busy timer preserves newest intent and retries exactly once', async () => {
  const win = load();
  const c = chart(win, bars(2000), [{ id: 'vwap', type: 'vwap', params: {} }]);
  const realSetTimeout = global.setTimeout, realClearTimeout = global.clearTimeout;
  const realNow = Date.now;
  const timers = [];
  let now = 1000;
  global.setTimeout = (fn, ms) => {
    const token = { fn, ms, cleared: false };
    timers.push(token);
    return token;
  };
  global.clearTimeout = (token) => { if (token) token.cleared = true; };
  Date.now = () => now;
  try {
    c._m19iB66LastReconcileAt = now;
    FakeWorker.hold = true;
    c.recalculateIndicatorsAsync();
    assert.equal(c._indicatorWorkerBusy, true);
    posts.length = 0;
    for (let i = 0; i < 25; i++) c._m19iExactTailPaint();
    assert.equal(timers.filter((t) => !t.cleared).length, 1, 'one keep-newest timer');
    assert.equal(timers[0].ms, 5000, 'floor is enforced');
    timers[0].fn();
    assert.equal(c._m19iB66ReconcileWanted, true);
    assert.equal(c._m19iB66ReconcileDeferred, true, 'busy expiry retains intent');
    assert.equal(c._m19iB66ReconcileTimer, null);
    FakeWorker.releaseAll();
    await new Promise((r) => setImmediate(r));
    const retryTimers = timers.filter((t, i) => i > 0 && !t.cleared);
    assert.equal(retryTimers.length, 1, 'busy completion reschedules exactly once');
    now += 5000;
    retryTimers[0].fn();
    assert.equal(posts.filter((p) => p.type === 'CALCULATE_ALL').length, 1,
      'one full reconciliation applies newest intent');
    FakeWorker.failNext = true;
    FakeWorker.releaseAll();
    await new Promise((r) => setImmediate(r));
    assert.equal(c._indicatorWorkerBusy, false, 'failure clears busy');
    assert.equal(timers.filter((t, i) => i > 1 && !t.cleared).length, 0,
      'failure does not self-chain without a newer request');
  } finally {
    FakeWorker.hold = false; FakeWorker.failNext = false; FakeWorker.releaseAll();
    global.setTimeout = realSetTimeout; global.clearTimeout = realClearTimeout; Date.now = realNow;
  }
});

test('B66 lifecycle cancellation rejects retired and replaced timer generations', () => {
  const win = load();
  const c = chart(win, bars(1000), [{ id: 'vwap', type: 'vwap', params: {} }]);
  c._m19iExactTailPaint();
  assert.equal(win._listenerAdds.length, 2);
  assert.equal(win._listeners.pagehide.length + win._listeners.beforeunload.length, 2);
  const firstCallback = c._m19iB66LifecycleRetire;
  c._m19iExactTailPaint();
  assert.equal(win._listenerAdds.length, 2, 'repeated install is idempotent');
  const oldTimer = c._m19iB66ReconcileTimer;
  const oldGen = c._m19iB66ReconcileGeneration || 0;
  c._invalidateIndicatorAsyncWork('replacement');
  assert.equal(c._m19iB66ReconcileTimer, null);
  assert.ok(c._m19iB66ReconcileGeneration > oldGen);
  assert.equal(c._m19iB66ReconcileWanted, false);
  assert.equal(win._listenerRemoves.length, 2);
  assert.ok(win._listenerRemoves.every((r) => r.matched && r.fn === firstCallback),
    'replacement removes the exact owned callback from both events');
  assert.equal(win._listeners.pagehide.length + win._listeners.beforeunload.length, 0,
    'replacement listener census is flat');
  c._m19iExactTailPaint();
  assert.notEqual(c._m19iB66ReconcileTimer, oldTimer, 'replacement gets a new generation');
  assert.equal(win._listeners.pagehide.length, 1, 'actual page lifecycle hook installed once');
  const replacementCallback = win._listeners.pagehide[0];
  assert.notEqual(replacementCallback, firstCallback);
  replacementCallback();
  assert.equal(c._m19iB66ReconcileRetired, true);
  assert.equal(c._m19iB66ReconcileTimer, null);
  assert.equal(win._listeners.pagehide.length + win._listeners.beforeunload.length, 0,
    'page lifecycle removes both owned listeners');
  assert.equal(c._m19iB66LifecycleRetire, null, 'retired chart retains no capturing closure');
  const removeCount = win._listenerRemoves.length;
  c._m19iB66RetireIndicatorReconcile();
  assert.equal(win._listenerRemoves.length, removeCount, 'repeated teardown is idempotent');
  const postsBefore = posts.length;
  c._m19iExactTailPaint();
  assert.equal(c._m19iB66ReconcileTimer, null, 'retired chart cannot schedule');
  assert.equal(posts.length, postsBefore, 'retired chart cannot post');

  const next = chart(win, bars(1000), [{ id: 'next-vwap', type: 'vwap', params: {} }]);
  next._m19iExactTailPaint();
  assert.equal(win._listeners.pagehide.length + win._listeners.beforeunload.length, 2,
    'new chart owns exactly one fresh listener pair');
  next._m19iB66RetireIndicatorReconcile();
  assert.equal(win._listeners.pagehide.length + win._listeners.beforeunload.length, 0,
    'explicit chart teardown restores flat census');

  const toggled = chart(win, bars(1000), [{ id: 'toggle-vwap', type: 'vwap', params: {} }]);
  toggled._m19iExactTailPaint();
  win[KILL] = true;
  toggled._m19iExactTailPaint();
  assert.equal(win._listeners.pagehide.length + win._listeners.beforeunload.length, 0,
    'runtime kill transition removes owned listeners');
});

test('real multichart removeChart rejects held worker reply and stale timer', async () => {
  const win = load();
  const data = bars(1200, true);
  const ind = { id: 'ema', type: 'ema', params: { period: 20 } };
  const c = chart(win, data.slice(0, 1199), [
    ind, { id: 'vwap', type: 'vwap', params: {}, style: {} },
  ]);
  c.data = data;
  c._m19iExactTailPaint(); // owns the lifecycle pair
  posts.length = 0;
  FakeWorker.hold = true;
  c.recalculateIndicatorsIncremental(1199);
  assert.equal(c._indicatorWorkerBusy, true);
  assert.equal(FakeWorker.held.length, 1, 'actual worker tail reply is held');
  const version = c._indicatorRenderVersion || 0;
  const renders = c._renders;
  const before = JSON.stringify(c.indicators.data.ema);
  const { manager, removed } = realManagerFor(c);
  manager.removeChart('panel');
  assert.equal(removed(), 1, 'authoritative iframe teardown ran');
  assert.equal(c._m19iB66ReconcileRetired, true);
  assert.equal(win._listeners.pagehide.length + win._listeners.beforeunload.length, 0);
  assert.equal(c._m19iB66ReconcileTimer, null);
  const postCount = posts.length;
  FakeWorker.releaseAll();
  FakeWorker.hold = false;
  await new Promise((r) => setImmediate(r));
  assert.equal(JSON.stringify(c.indicators.data.ema), before, 'late tail cannot mutate data');
  assert.equal(c._indicatorRenderVersion || 0, version, 'late tail cannot bump layer version');
  assert.equal(c._renders, renders, 'late tail cannot render');
  assert.equal(posts.length, postCount, 'late completion cannot post follow-up work');
  assert.equal(c._indicatorWorkerBusy, false, 'late completion only drains busy ownership');
  manager.removeChart('panel');
  assert.equal(removed(), 1, 'repeated real teardown is idempotent');

  const timers = [];
  const realSetTimeout = global.setTimeout, realClearTimeout = global.clearTimeout;
  global.setTimeout = (fn, ms) => {
    const token = { fn, ms, cleared: false };
    timers.push(token); return token;
  };
  global.clearTimeout = (token) => { if (token) token.cleared = true; };
  try {
    const old = chart(win, bars(1000), [{ id: 'old-vwap', type: 'vwap', params: {} }]);
    old._m19iExactTailPaint();
    const stale = timers.at(-1);
    const oldOwner = realManagerFor(old);
    oldOwner.manager.removeChart('panel');
    const postsAtRetire = posts.length;
    stale.fn();
    assert.equal(posts.length, postsAtRetire, 'stale retired timer cannot post');
    assert.equal(old._m19iB66ReconcileTimer, null);
    const replacement = chart(win, bars(1000), [{ id: 'new-vwap', type: 'vwap', params: {} }]);
    replacement._m19iExactTailPaint();
    assert.equal(win._listeners.pagehide.length + win._listeners.beforeunload.length, 2,
      'replacement owns one independent listener pair');
    realManagerFor(replacement).manager.removeChart('panel');
    assert.equal(win._listeners.pagehide.length + win._listeners.beforeunload.length, 0);
  } finally {
    global.setTimeout = realSetTimeout;
    global.clearTimeout = realClearTimeout;
    FakeWorker.hold = false;
    FakeWorker.releaseAll();
  }
});

test('all mirrored manager teardown entrypoints retire before frame removal', () => {
  const paths = [
    path.join(ROOT, 'chart v 1.4', 'chart', 'multichart', 'multichart-manager.js'),
    path.join(ROOT, 'chart v 1.4', 'chart', 'multichart-prod', 'multichart-manager.js'),
    path.join(ROOT, 'homepage', 'public', 'chart', 'multichart', 'multichart-manager.js'),
    path.join(ROOT, 'homepage', 'public', 'chart', 'multichart-prod', 'multichart-manager.js'),
  ];
  for (const file of paths) {
    const source = fs.readFileSync(file, 'utf8');
    const retire = source.indexOf('panelChart._m19iB66RetireIndicatorReconcile()');
    const remove = source.indexOf('c.frame.remove()', retire);
    assert.ok(retire >= 0 && remove > retire, `${path.relative(ROOT, file)} retires before removal`);
  }
});

test('ON-to-OFF immediate real teardown rejects tail/full and stays idempotent', async () => {
  const runHeld = async (mode) => {
    const win = load();
    const data = bars(1200, true);
    const ind = { id: `ema-${mode}`, type: 'ema', params: { period: 20 } };
    const c = chart(win, data.slice(0, mode === 'tail' ? 1199 : 1200), [ind]);
    c._m19iExactTailPaint(); // acquire B66 ownership before switch transition
    posts.length = 0;
    FakeWorker.hold = true;
    if (mode === 'tail') {
      c.data = data;
      c.recalculateIndicatorsIncremental(1199);
    } else {
      c.recalculateIndicatorsAsync();
    }
    assert.equal(FakeWorker.held.length, 1, `${mode} worker reply held`);
    const before = JSON.stringify(c.indicators.data[ind.id]);
    const version = c._indicatorRenderVersion || 0;
    const renders = c._renders;
    const postCount = posts.length;
    win[KILL] = true;
    const owner = realManagerFor(c);
    owner.manager.removeChart('panel'); // no intervening paint
    const retiredSeq = c._indicatorWorkerSeq;
    assert.equal(c._m19iB66ReconcileRetired, true);
    assert.equal(win._listeners.pagehide?.length || 0, 0);
    assert.equal(win._listeners.beforeunload?.length || 0, 0);
    assert.equal(c._m19iB66ReconcileTimer, null);
    FakeWorker.releaseAll();
    FakeWorker.hold = false;
    await new Promise((r) => setImmediate(r));
    assert.equal(JSON.stringify(c.indicators.data[ind.id]), before, `${mode} late result cannot mutate`);
    assert.equal(c._indicatorRenderVersion || 0, version, `${mode} late result cannot version`);
    assert.equal(c._renders, renders, `${mode} late result cannot render`);
    assert.equal(posts.length, postCount, `${mode} late result cannot repost`);
    delete win[KILL];
    c._m19iB66RetireIndicatorReconcile();
    assert.equal(c._indicatorWorkerSeq, retiredSeq, `${mode} repeated OFF/ON teardown is idempotent`);
  };
  await runHeld('tail');
  await runHeld('full');

  const off = load(productSource, false);
  const steady = chart(off, bars(1000), [{ id: 'off-vwap', type: 'vwap', params: {} }]);
  const keysBefore = Object.keys(steady).sort();
  realManagerFor(steady).manager.removeChart('panel');
  assert.deepEqual(Object.keys(steady).sort(), keysBefore,
    'steady OFF real removal creates no B66 or sequence state');
  assert.equal(off._listenerAdds.length, 0);
});

test('750k product pack is 36MB while default B66 posts bounded tail only', async () => {
  const win = load();
  const large = bars(750000);
  const fullPacked = win.IndicatorPerf.packBarsCompact(large);
  assert.equal(fullPacked.byteLength, LANE2.threeYear.bytes,
    'real 750k product pack equals Lane 2 36MB baseline');
  const seed = large.slice(-5000);
  const c = chart(win, seed.slice(0, -1), [{ id: 'ema', type: 'ema', params: { period: 20 } }]);
  c.data = large; posts.length = 0;
  c.recalculateIndicatorsIncremental(large.length - 1);
  await new Promise((r) => setTimeout(r, 20));
  const post = posts.find((p) => p.type === 'CALCULATE_TAIL');
  assert.ok(post && post.bytes > 0);
  assert.equal(post.transfer, 1);
  assert.equal(post.bytes, 267 * 48, 'real default EMA tail is 267 packed bars');
  assert.ok(post.bytes < LANE2.threeYear.bytes * .01,
    `${post.bytes} bytes is <1% of 36MB b63 full-pass payload`);
  assert.equal(posts.filter((p) => p.type === 'CALCULATE_ALL').length, 0,
    'B66 tick sends no full-history post');
  const owned = new ArrayBuffer(64);
  structuredClone(owned, { transfer: [owned] });
  assert.equal(owned.byteLength, 0, 'transferred stores detach and cannot be reused');
});

test('B66 switch OFF preserves b63 transaction-wide behavior and state surface', () => {
  const on = load(), off = load(productSource, false);
  const data = bars(3000);
  const inds = [{ id: 'ema', type: 'ema', params: { period: 20 } }];
  const a = chart(on, data.map((b) => ({ ...b })), inds.map((i) => ({ ...i, params: { ...i.params } })));
  const b = chart(off, data.map((x) => ({ ...x })), inds.map((i) => ({ ...i, params: { ...i.params } })));
  a.data.at(-1).c += 1; b.data.at(-1).c += 1;
  assert.equal(a._m19iExactTailPaint(), true);
  assert.equal(b._m19iExactTailPaint(), false);
  assert.equal(b._m19iB66InstanceMemos, undefined, 'OFF creates no B66 state');
  assert.equal(off._listenerAdds.length, 0, 'steady OFF installs zero B66 listeners');
  assert.equal(Object.keys(off._listeners).length, 0, 'steady OFF listener census is empty');
  clearTimeout(b._m19iB66ReconcileTimer);
});

test('acceptance packet keeps browser-only E3-prime/E6 blocked', () => {
  assert.deepEqual(LANE2.browser,
    { e3Prime: 'BLOCKED_ACTUAL_PAINT', e6: 'BLOCKED_ACTUAL_SESSION' });
});
