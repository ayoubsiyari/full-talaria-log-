import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * COV-01: this file is mirrored, and the two copies sit at DIFFERENT depths —
 * `chart v 1.4/chart/modules` is three below the root, `homepage/public/chart/
 * modules` is four. A hardcoded `../../..` is therefore correct in one copy and
 * silently wrong in the other, where it resolved to `homepage/` and the read
 * threw ENOENT before any test could register. Node reports that as one failing
 * test, which in a sweep summary is indistinguishable from a product defect.
 *
 * Walking up to the marker keeps ONE source byte-identical across both mirrors
 * and correct from either depth. Do not replace this with a fixed level count.
 */
const ROOT = (() => {
  let dir = HERE;
  for (let i = 0; i < 10; i += 1) {
    if (fs.existsSync(path.join(dir, 'chart v 1.4')) && fs.existsSync(path.join(dir, 'homepage'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error(`ROOT_UNRESOLVED: no repo root above ${HERE} (expected a dir holding both "chart v 1.4" and "homepage")`);
})();
const CHART_JS = path.join(ROOT, 'chart v 1.4', 'chart', 'chart.js');
const CHART_MIRROR = path.join(ROOT, 'homepage', 'public', 'chart', 'chart.js');
const SWITCH = '__TALARIA_DISABLE_MC_BAR_STORE_REALM_V1';
const SOURCE = fs.readFileSync(CHART_JS, 'utf8');

function note(name, pass, detail = '') {
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}\n`);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function methodSource(text, name, { optional = false } = {}) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(
    `^    ${escaped}\\s*\\([^]*?(?=^    (?:async\\s+)?[A-Za-z_$][\\w$]*\\s*\\(|^})`,
    'm',
  ));
  if (!match && optional) return '';
  if (!match) throw new Error(`method ${name} missing from CHART_JS`);
  return match[0];
}

function replaceOne(text, from, to, label) {
  const count = text.split(from).length - 1;
  assert.equal(count, 1, `${label} anchor count`);
  return text.replace(from, to);
}

/**
 * BIND-01: for a mutant whose anchor is a GENERIC code shape rather than a
 * unique one, "appears twice" is not anchor drift — it means the product grew a
 * second site the mutant never learned about, and mutating only the first
 * leaves the other intact so the oracle may pass a defect through.
 *
 * `_mcScalarCloneRawBar` was the only scalar clone when this gate was written;
 * `_createSharedBarStore` later grew its own. Mutating every site keeps the
 * mutant's meaning ("the clone walks the prototype chain") true of the whole
 * product rather than of one historical copy. A vanished anchor still fails
 * loudly, and with a state that says harness, not product.
 */
function replaceEvery(text, from, to, label) {
  const count = text.split(from).length - 1;
  assert.ok(
    count >= 1,
    `ANCHOR_BROKEN: ${label} — anchor no longer present in CHART_JS (harness drift, not a product defect)`,
  );
  return text.split(from).join(to);
}

const METHODS = [
  '_mcBarStoreRealmSwitchEnabled',
  '_makeBarStoreStatsFn',
  '_sharedBarStore',
  '_createSharedBarStore',
  '_sharedBarStoreOwnerId',
  '_retainSharedBarStoreFile',
  '_installSharedBarStoreReleaseHook',
  '_releaseSharedBarStoreFileRefs',
  '_publishMasterToSharedStore',
  '_takeSharedStoreSmartWindow',
  '_topUpMasterFromSharedStore',
  'parseTimeframe',
].join('|');

function chartMethods(text) {
  return METHODS.split('|').map((name) => methodSource(text, name, { optional: true })).join('\n');
}

const FAKE_WINDOW = `
class FakeWindow {
  constructor(name) {
    this.__name = name;
    this.__listeners = new Map();
    this.document = {};
    this.Function = Function;
  }
  addEventListener(type, fn) {
    if (!this.__listeners.has(type)) this.__listeners.set(type, []);
    this.__listeners.get(type).push(fn);
  }
  removeEventListener(type, fn) {
    const list = this.__listeners.get(type);
    if (!list) return;
    const index = list.indexOf(fn);
    if (index >= 0) list.splice(index, 1);
  }
  dispatchEvent(ev) {
    for (const fn of [...(this.__listeners.get(ev.type) || [])]) fn.call(this, ev);
  }
  count(type) { return (this.__listeners.get(type) || []).length; }
}
`;

function installChart(context, className, text, { hostOnly = false } = {}) {
  vm.runInContext(`
class ${className} {
    constructor() {
        this.currentFileId = null;
        this.currentTimeframe = '1m';
        this.totalCandles = 0;
        this._serverCursors = null;
        this._sharedBarStoreClientId = null;
        this._sharedBarStoreFileRefs = new Set();
        this._sharedBarStoreReleaseUnloadHandler = null;
        if (!${hostOnly ? 'true' : 'false'} && typeof this._installSharedBarStoreReleaseHook === 'function') {
            this._installSharedBarStoreReleaseHook();
        }
    }

${chartMethods(text)}
}
globalThis.__ChartClass = ${className};
`, context);
}

function makeEnv(text = SOURCE, { hostChart = true } = {}) {
  const host = vm.createContext({ console, Date, Math });
  host.globalThis = host;
  vm.runInContext(`${FAKE_WINDOW}
globalThis.window = new FakeWindow('host');
window.top = window;
window.parent = window;
`, host);
  installChart(host, 'HostChart', text, { hostOnly: true });
  if (hostChart) {
    vm.runInContext('window.chart = new __ChartClass();', host);
  }

  const panel = vm.createContext({ console, Date, Math });
  panel.globalThis = panel;
  panel.__host = host.window;
  vm.runInContext(`${FAKE_WINDOW}
globalThis.window = new FakeWindow('panel');
window.top = globalThis.__host;
window.parent = globalThis.__host;
`, panel);
  installChart(panel, 'PanelChart', text);
  vm.runInContext('globalThis.__chart = new __ChartClass();', panel);

  return {
    host,
    panel,
    hostWin: host.window,
    panelWin: panel.window,
    panelChart: panel.__chart,
    clearHostStore() {
      delete host.window.__talariaBarStore;
      delete host.window.__talariaBarStoreStats;
    },
    panelStore() {
      return vm.runInContext('__chart._sharedBarStore()', panel);
    },
    publishFromPanel(fileId = 'EURUSD', count = 3) {
      panel.__fileId = fileId;
      panel.__count = count;
      vm.runInContext(`
(() => {
  const bars = Array.from({ length: __count }, (_, i) => ({
    t: 1700000000000 + i * 60000,
    o: i,
    h: i + 1,
    l: i - 1,
    c: i + 0.5,
    nested: { realm: 'panel' },
  }));
  __chart.currentFileId = __fileId;
  __chart.currentTimeframe = '1m';
  __chart.totalCandles = bars.length;
  __chart._publishMasterToSharedStore(bars, { fileId: __fileId, timeframe: '1m' });
})();
`, panel);
    },
    pickInHost(fileId = 'EURUSD') {
      host.__fileId = fileId;
      return vm.runInContext('window.__talariaBarStore.pick(__fileId, "1m")', host);
    },
    hostStoreIsHostRealm() {
      return vm.runInContext('window.__talariaBarStore instanceof Object', host);
    },
    hostStoreIsPanelRealm() {
      return vm.runInContext('__host.__talariaBarStore instanceof Object', panel);
    },
    statsFnIsHostRealm() {
      return vm.runInContext('window.__talariaBarStoreStats instanceof Function', host);
    },
    statsFnIsPanelRealm() {
      return vm.runInContext('__host.__talariaBarStoreStats instanceof Function', panel);
    },
    hostPickedBarsAreHostRealm(fileId = 'EURUSD') {
      host.__fileId = fileId;
      return vm.runInContext(`
(() => {
  const picked = window.__talariaBarStore.pick(__fileId, '1m');
  return !!picked && picked.bars instanceof Array && picked.bars[0] instanceof Object;
})();
`, host);
    },
    hostPickedBarsArePanelRealm(fileId = 'EURUSD') {
      panel.__fileId = fileId;
      return vm.runInContext(`
(() => {
  const picked = __host.__talariaBarStore.pick(__fileId, '1m');
  return !!picked && picked.bars instanceof Array && picked.bars[0] instanceof Object;
})();
`, panel);
    },
  };
}

function attachToHost(env, other) {
  other.host.window = env.host.window;
  other.panel.__host = env.host.window;
  other.panel.window.top = env.host.window;
  other.panel.window.parent = env.host.window;
}

function assertHostRealmStore(text = SOURCE) {
  const env = makeEnv(text);
  assert.ok(env.panelStore(), 'panel should resolve host-created store once host chart exists');
  note('realm-store-host-object', env.hostStoreIsHostRealm(), `hostRealm=${env.hostStoreIsHostRealm()}`);
  note('realm-store-not-panel-object', !env.hostStoreIsPanelRealm(), `panelRealm=${env.hostStoreIsPanelRealm()}`);
  note('realm-stats-host-function', env.statsFnIsHostRealm(), `hostRealm=${env.statsFnIsHostRealm()}`);
  note('realm-stats-not-panel-function', !env.statsFnIsPanelRealm(), `panelRealm=${env.statsFnIsPanelRealm()}`);
  assert.equal(env.hostStoreIsHostRealm(), true);
  assert.equal(env.hostStoreIsPanelRealm(), false);
  assert.equal(env.statsFnIsHostRealm(), true);
  assert.equal(env.statsFnIsPanelRealm(), false);
}

function assertHostRealmPayloads(text = SOURCE) {
  const env = makeEnv(text);
  env.publishFromPanel('EURUSD', 200005);
  const picked = env.pickInHost('EURUSD');
  assert.ok(picked, 'published payload should be cached');
  note('payload-cap-before-clone', picked.bars.length === 200000, `bars=${picked.bars.length}`);
  note('payload-bars-host-realm', env.hostPickedBarsAreHostRealm('EURUSD'), '');
  note('payload-bars-not-panel-realm', !env.hostPickedBarsArePanelRealm('EURUSD'), '');
  note('payload-drops-object-valued-fields', !('nested' in picked.bars[0]), '');
  assert.equal(picked.bars.length, 200000);
  assert.equal(env.hostPickedBarsAreHostRealm('EURUSD'), true);
  assert.equal(env.hostPickedBarsArePanelRealm('EURUSD'), false);
  assert.equal('nested' in picked.bars[0], false);
}

function assertRefCountedRelease(text = SOURCE) {
  const env = makeEnv(text);
  env.publishFromPanel('GBPUSD', 2);
  const second = makeEnv(text);
  second.host.window = env.host.window;
  second.panel.__host = env.host.window;
  second.panel.window.top = env.host.window;
  second.panel.window.parent = env.host.window;
  second.publishFromPanel('GBPUSD', 2);

  env.panel.window.dispatchEvent({ type: 'pagehide', persisted: false });
  note('release-first-owner-keeps-file', !!env.host.window.__talariaBarStore.peek('GBPUSD'), '');
  assert.ok(env.host.window.__talariaBarStore.peek('GBPUSD'));

  second.panel.window.dispatchEvent({ type: 'pagehide', persisted: false });
  note('release-last-owner-drops-file', env.host.window.__talariaBarStore.peek('GBPUSD') === null, '');
  assert.equal(env.host.window.__talariaBarStore.peek('GBPUSD'), null);
}

function assertLruBoundsMissedRelease(text = SOURCE) {
  const env = makeEnv(text);
  for (let i = 0; i < 13; i += 1) env.publishFromPanel(`FILE-${i}`, 1);
  const stats = env.host.window.__talariaBarStore.stats();
  note('missed-release-still-lru-bounded', stats.files === 12, `files=${stats.files}`);
  note('missed-release-oldest-evicted', env.host.window.__talariaBarStore.peek('FILE-0') === null, '');
  assert.equal(stats.files, 12);
  assert.equal(env.host.window.__talariaBarStore.peek('FILE-0'), null);
}

function assertTruthyFlagRealmAndRelease(text = SOURCE, value = 1) {
  const env = makeEnv(text);
  env.panel.window[SWITCH] = value;
  assert.ok(env.panelStore(), 'truthy non-boolean flag should select legacy realm');
  note(`flag-truthy-${String(value)}-realm-legacy`, env.hostStoreIsPanelRealm(), '');
  assert.equal(env.hostStoreIsPanelRealm(), true);

  env.publishFromPanel(`FLAG-${String(value)}`, 2);
  env.panel.window.dispatchEvent({ type: 'pagehide', persisted: false });
  const retained = !!env.host.window.__talariaBarStore.peek(`FLAG-${String(value)}`);
  note(`flag-truthy-${String(value)}-release-gated`, retained, '');
  assert.equal(retained, true, 'release gating should use the same truthiness as realm selection');
}

function assertScalarCloneOwnFields(text = SOURCE) {
  const env = makeEnv(text);
  vm.runInContext(`
(() => {
  Object.prototype.panelPollutedScalar = 31337;
  class Bar {
    constructor(t) {
      this.t = t;
      this.o = 1;
      this.h = 2;
      this.l = 0;
      this.c = 1.5;
      this.v = 9;
      this.ownScalar = 42;
      this.nested = { drop: true };
    }
  }
  Object.defineProperty(Bar.prototype, 'protoScalar', {
    enumerable: true,
    get() { return 7; },
  });
  try {
    __chart.currentFileId = 'OWNFIELDS';
    __chart.currentTimeframe = '1m';
    __chart.totalCandles = 1;
    __chart._publishMasterToSharedStore([new Bar(1700000000000)], { fileId: 'OWNFIELDS', timeframe: '1m' });
  } finally {
    delete Object.prototype.panelPollutedScalar;
  }
})();
`, env.panel);
  const picked = env.pickInHost('OWNFIELDS');
  assert.ok(picked, 'own-field clone payload should be cached');
  const bar = picked.bars[0];
  note('clone-keeps-own-scalar-fields', bar.ownScalar === 42, '');
  note('clone-drops-prototype-fields', !('protoScalar' in bar), '');
  note('clone-drops-panel-prototype-pollution', !('panelPollutedScalar' in bar), '');
  note('clone-drops-object-valued-own-fields', !('nested' in bar), '');
  assert.equal(bar.ownScalar, 42);
  assert.equal('protoScalar' in bar, false);
  assert.equal('panelPollutedScalar' in bar, false);
  assert.equal('nested' in bar, false);
}

function assertPickReturnsCopy(text = SOURCE) {
  const env = makeEnv(text);
  env.publishFromPanel('COPY', 3);
  const first = env.pickInHost('COPY');
  assert.ok(first);
  first.bars.splice(0, first.bars.length);
  const second = env.pickInHost('COPY');
  note('pick-array-mutation-does-not-corrupt-store', second && second.bars.length === 3, `bars=${second && second.bars.length}`);
  assert.equal(second.bars.length, 3);
}

function assertStatsBuilderAvoidsFunctionConstructor(text = SOURCE) {
  note('stats-builder-no-function-constructor', !text.includes('HostFunction(') && !text.includes('host.Function || Function'), '');
  assert.equal(text.includes('HostFunction('), false);
  assert.equal(text.includes('host.Function || Function'), false);
}

function assertTakeSharedStoreRetainsRead(text = SOURCE) {
  const env = makeEnv(text);
  env.publishFromPanel('READSMART', 3);
  const reader = makeEnv(text);
  attachToHost(env, reader);
  reader.panel.__fileId = 'READSMART';
  const result = vm.runInContext('__chart._takeSharedStoreSmartWindow(__fileId, "1m")', reader.panel);
  assert.ok(result && result.candles.length === 3, 'reader should take smart window from shared store');

  env.panel.window.dispatchEvent({ type: 'pagehide', persisted: false });
  const keptAfterPublisherRelease = !!env.host.window.__talariaBarStore.peek('READSMART');
  note('read-smart-window-retain-keeps-file', keptAfterPublisherRelease, '');
  assert.equal(keptAfterPublisherRelease, true);

  reader.panel.window.dispatchEvent({ type: 'pagehide', persisted: false });
  note('read-smart-window-reader-release-drops-file', env.host.window.__talariaBarStore.peek('READSMART') === null, '');
  assert.equal(env.host.window.__talariaBarStore.peek('READSMART'), null);
}

function assertTopUpRetainsRead(text = SOURCE) {
  const env = makeEnv(text);
  env.publishFromPanel('READTOPUP', 4);
  const reader = makeEnv(text);
  attachToHost(env, reader);
  reader.panel.__fileId = 'READTOPUP';
  vm.runInContext(`
__chart.currentFileId = __fileId;
__chart.currentTimeframe = '1m';
__chart._nativeRawFetchTf = '1m';
__chart._panelFullRawData = [
  { t: 1700000000000, o: 1, h: 1, l: 1, c: 1 },
  { t: 1700000060000, o: 2, h: 2, l: 2, c: 2 },
];
`, reader.panel);
  const toppedUp = vm.runInContext('__chart._topUpMasterFromSharedStore("1m")', reader.panel);
  assert.equal(toppedUp, true, 'top-up should replace narrower local master');

  env.panel.window.dispatchEvent({ type: 'pagehide', persisted: false });
  const keptAfterPublisherRelease = !!env.host.window.__talariaBarStore.peek('READTOPUP');
  note('top-up-read-retain-keeps-file', keptAfterPublisherRelease, '');
  assert.equal(keptAfterPublisherRelease, true);

  reader.panel.window.dispatchEvent({ type: 'pagehide', persisted: false });
  note('top-up-reader-release-drops-file', env.host.window.__talariaBarStore.peek('READTOPUP') === null, '');
  assert.equal(env.host.window.__talariaBarStore.peek('READTOPUP'), null);
}

function assertReleaseRemovesPagehideListener(text = SOURCE) {
  const env = makeEnv(text);
  env.publishFromPanel('TEARDOWN', 2);
  assert.equal(env.panel.window.count('pagehide'), 1, 'test harness should have one installed release listener');
  env.panel.window.dispatchEvent({ type: 'pagehide', persisted: false });
  note('release-removes-pagehide-listener', env.panel.window.count('pagehide') === 0, `listeners=${env.panel.window.count('pagehide')}`);
  note('release-nulls-pagehide-handler', env.panel.__chart._sharedBarStoreReleaseUnloadHandler === null, '');
  assert.equal(env.panel.window.count('pagehide'), 0);
  assert.equal(env.panel.__chart._sharedBarStoreReleaseUnloadHandler, null);
}

test('P3 S-1: panel requests create only host-realm store and stats function', () => {
  assertHostRealmStore();
});

test('P3 S-1: legacy switch demonstrates the original panel-realm host-global defect', () => {
  const env = makeEnv();
  env.panel.window[SWITCH] = true;
  assert.ok(env.panelStore(), 'legacy path should still create a store');
  note('legacy-store-is-panel-realm', env.hostStoreIsPanelRealm(), `panelRealm=${env.hostStoreIsPanelRealm()}`);
  note('legacy-store-not-host-realm', !env.hostStoreIsHostRealm(), `hostRealm=${env.hostStoreIsHostRealm()}`);
  assert.equal(env.hostStoreIsPanelRealm(), true);
  assert.equal(env.hostStoreIsHostRealm(), false);
});

test('P3 S-1: panel with no host chart falls back instead of constructing on host', () => {
  const env = makeEnv(SOURCE, { hostChart: false });
  const store = env.panelStore();
  note('no-host-chart-panel-fallback', store === null && !('__talariaBarStore' in env.host.window), '');
  assert.equal(store, null);
  assert.equal('__talariaBarStore' in env.host.window, false);
});

test('P3 S-2: panel writes deposit capped host-realm scalar payloads', () => {
  assertHostRealmPayloads();
});

test('P3 S-3: pagehide release is reference counted by file', () => {
  assertRefCountedRelease();
});

test('P3 S-3: missed release degrades to existing LRU bound', () => {
  assertLruBoundsMissedRelease();
});

test('P3 F1: truthy non-boolean realm switch also gates release', () => {
  assertTruthyFlagRealmAndRelease(SOURCE, 1);
  assertTruthyFlagRealmAndRelease(SOURCE, 'false');
});

test('P3 F2: scalar clone copies only own scalar fields', () => {
  assertScalarCloneOwnFields();
});

test('P3 F3: stats builder avoids eval-class Function constructor', () => {
  assertStatsBuilderAvoidsFunctionConstructor();
  assertHostRealmStore();
});

test('P3 F4: store pick returns a defensive array copy', () => {
  assertPickReturnsCopy();
});

test('P3 T1: smart-window read path retains shared store ownership', () => {
  assertTakeSharedStoreRetainsRead();
});

test('P3 T1: top-up read path retains shared store ownership', () => {
  assertTopUpRetainsRead();
});

test('P3 T3: release removes and nulls the pagehide teardown listener', () => {
  assertReleaseRemovesPagehideListener();
});

test('P3 FLAG: four-state in-page switch round trip uses truthiness per call', () => {
  const env = makeEnv();
  assert.ok(env.panelStore());
  assert.equal(env.hostStoreIsHostRealm(), true, 'absent flag is default fixed path');

  env.clearHostStore();
  env.panel.window[SWITCH] = true;
  assert.ok(env.panelStore());
  assert.equal(env.hostStoreIsPanelRealm(), true, 'true restores legacy path');

  env.clearHostStore();
  env.panel.window[SWITCH] = false;
  assert.ok(env.panelStore());
  assert.equal(env.hostStoreIsHostRealm(), true, 'false is not disabled');

  env.clearHostStore();
  env.panel.window[SWITCH] = undefined;
  assert.ok(env.panelStore());
  note('flag-undefined-is-not-disabled', env.hostStoreIsHostRealm(), '');
  assert.equal(env.hostStoreIsHostRealm(), true, 'undefined property must not strand via hasOwnProperty');

  env.clearHostStore();
  delete env.panel.window[SWITCH];
  assert.ok(env.panelStore());
  assert.equal(env.hostStoreIsHostRealm(), true, 'deleted flag returns to production default');
});

test('P3 mirror: homepage chart.js is byte-identical', () => {
  const chart = fs.readFileSync(CHART_JS);
  const mirror = fs.readFileSync(CHART_MIRROR);
  note('mirror-byte-identical', chart.equals(mirror), `sha256=${sha256(chart)}`);
  assert.equal(sha256(chart), sha256(mirror));
});

test('P3 mutants: neutered guards are killed by the realm/refcount oracles', () => {
  const mutants = [
    {
      name: 'panel-constructs-host-store',
      source: replaceOne(
        SOURCE,
        'host.__talariaBarStore = host.chart._createSharedBarStore();',
        'host.__talariaBarStore = this._createSharedBarStore();',
        'panel construct mutant',
      ),
      oracle: assertHostRealmStore,
    },
    {
      name: 'truthiness-replaced-by-hasown',
      source: replaceOne(
        SOURCE,
        'return !!(typeof window !== \'undefined\' && window.__TALARIA_DISABLE_MC_BAR_STORE_REALM_V1);',
        'return !!(typeof window !== \'undefined\' && Object.prototype.hasOwnProperty.call(window, "__TALARIA_DISABLE_MC_BAR_STORE_REALM_V1"));',
        'hasOwnProperty mutant',
      ),
      oracle(mutant) {
        const env = makeEnv(mutant);
        env.panel.window[SWITCH] = undefined;
        assert.ok(env.panelStore());
        assert.equal(env.hostStoreIsHostRealm(), true);
      },
    },
    {
      name: 'truthy-release-guard-strict',
      source: replaceOne(
        SOURCE,
        'if (this._mcBarStoreRealmSwitchEnabled()) return;',
        'if (typeof window !== \'undefined\' && window.__TALARIA_DISABLE_MC_BAR_STORE_REALM_V1 === true) return;',
        'strict release flag mutant',
      ),
      oracle(mutant) {
        assertTruthyFlagRealmAndRelease(mutant, 1);
      },
    },
    {
      name: 'panel-stats-closure',
      source: replaceOne(
        SOURCE,
        'host.__talariaBarStoreStats = statsOwner._makeBarStoreStatsFn();',
        'host.__talariaBarStoreStats = function () { return host.__talariaBarStore ? host.__talariaBarStore.stats() : null; };',
        'stats closure mutant',
      ),
      oracle: assertHostRealmStore,
    },
    {
      name: 'stats-function-constructor',
      source: replaceOne(
        SOURCE,
        'host.__talariaBarStoreStats = statsOwner._makeBarStoreStatsFn();',
        'host.__talariaBarStoreStats = (host.Function || Function)(\n                        \'return function __talariaBarStoreStats() { return window.__talariaBarStore ? window.__talariaBarStore.stats() : null; };\'\n                    )();',
        'function constructor stats mutant',
      ),
      oracle: assertStatsBuilderAvoidsFunctionConstructor,
    },
    {
      name: 'no-payload-clone',
      source: replaceOne(
        SOURCE,
        'const storeBars = cloneBarsForStore(bars);',
        'const storeBars = bars.slice();',
        'payload clone mutant',
      ),
      oracle: assertHostRealmPayloads,
    },
    {
      name: 'clone-walks-prototype-chain',
      source: replaceEvery(
        SOURCE,
        'for (const k of Object.keys(value)) {',
        'for (const k in value) {',
        'prototype-walking clone mutant',
      ),
      oracle: assertScalarCloneOwnFields,
    },
    {
      name: 'clone-cap-removed',
      source: replaceOne(
        SOURCE,
        'const start = Math.max(0, bars.length - MAX_BARS_PER_TF);',
        'const start = 0;',
        'clone cap mutant',
      ),
      oracle: assertHostRealmPayloads,
    },
    {
      name: 'pick-returns-live-array',
      source: replaceOne(
        SOURCE,
        'best = { bars: e.bars.slice(), tf: tf, cursors: e.cursors };',
        'best = { bars: e.bars, tf: tf, cursors: e.cursors };',
        'live pick array mutant',
      ),
      oracle: assertPickReturnsCopy,
    },
    {
      name: 'first-release-hard-deletes',
      source: replaceOne(
        SOURCE,
        'this.releaseFile(fileId, clientId);',
        'files.delete(String(fileId || ""));',
        'refcount clear mutant',
      ),
      oracle: assertRefCountedRelease,
    },
    {
      name: 'smart-window-read-retain-neutered',
      source: replaceOne(
        SOURCE,
        'if (!picked || !Array.isArray(picked.bars) || picked.bars.length === 0) return null;\n            this._retainSharedBarStoreFile(store, fileId);\n            const bars = picked.bars;',
        'if (!picked || !Array.isArray(picked.bars) || picked.bars.length === 0) return null;\n            /* read retain neutered */\n            const bars = picked.bars;',
        'smart-window read retain mutant',
      ),
      oracle: assertTakeSharedStoreRetainsRead,
    },
    {
      name: 'top-up-read-retain-neutered',
      source: replaceOne(
        SOURCE,
        'if (!(pickSpan > localSpan)) return false;\n            this._retainSharedBarStoreFile(store, this.currentFileId);\n            this._panelFullRawData = picked.bars.slice();',
        'if (!(pickSpan > localSpan)) return false;\n            /* top-up retain neutered */\n            this._panelFullRawData = picked.bars.slice();',
        'top-up read retain mutant',
      ),
      oracle: assertTopUpRetainsRead,
    },
    {
      name: 'last-release-never-deletes',
      source: replaceOne(
        SOURCE,
        'if (f.refs.size === 0) files.delete(id);',
        'if (f.refs.size === 0) { /* neutered */ }',
        'last release mutant',
      ),
      oracle: assertRefCountedRelease,
    },
    {
      name: 'teardown-remove-listener-neutered',
      source: replaceOne(
        SOURCE,
        "window.removeEventListener('pagehide', this._sharedBarStoreReleaseUnloadHandler);",
        "/* window.removeEventListener('pagehide', this._sharedBarStoreReleaseUnloadHandler); */",
        'teardown removeEventListener mutant',
      ),
      oracle: assertReleaseRemovesPagehideListener,
    },
    {
      name: 'teardown-handler-nulling-neutered',
      source: replaceOne(
        SOURCE,
        "        } catch (_e) { /* ignore */ }\n        this._sharedBarStoreReleaseUnloadHandler = null;\n    }\n\n    /** Publish",
        "        } catch (_e) { /* ignore */ }\n        this._sharedBarStoreReleaseUnloadHandler = this._sharedBarStoreReleaseUnloadHandler;\n    }\n\n    /** Publish",
        'teardown handler nulling mutant',
      ),
      oracle: assertReleaseRemovesPagehideListener,
    },
    {
      name: 'lru-eviction-neutered',
      // BARSTORE-2 split eviction into two branches: the pre-existing statement
      // below now sits in the REFCOUNT-DISABLED path, which does not run unless
      // the kill switch is set, while the live path deletes via `victim`.
      // Neutering only the first mutates dead code — the store still evicts, the
      // LRU bound still holds, and the mutant survives while looking applied.
      // Both sites have to go for "LRU eviction is neutered" to be true.
      //
      // The live branch is neutered at victim SELECTION, not at the delete. The
      // delete sits inside `while (files.size > MAX_FILES)`, so removing it
      // spins forever rather than failing — a mutant that hangs the runner is
      // worse than one that survives. Returning no victim exits the loop by its
      // own guard and leaves the store unbounded, which is the defect the oracle
      // is there to catch.
      source: replaceOne(
        replaceOne(
          SOURCE,
          'if (oldestId != null) files.delete(oldestId);',
          'if (oldestId != null) { /* neutered */ }',
          'lru mutant (refcount-disabled branch)',
        ),
        'const victim = oldestOf(false) ?? oldestOf(true);',
        'const victim = null;',
        'lru mutant (live branch)',
      ),
      oracle: assertLruBoundsMissedRelease,
    },
  ];

  for (const mutant of mutants) {
    assert.throws(() => mutant.oracle(mutant.source), undefined, `${mutant.name} must be killed`);
    note(`mutant-killed:${mutant.name}`, true);
  }
});
