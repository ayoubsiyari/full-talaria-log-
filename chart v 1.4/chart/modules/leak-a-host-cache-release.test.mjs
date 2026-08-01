/**
 * Leak shot (a): multichart panel teardown releases host data-cache ownership.
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/leak-a-host-cache-release.test.mjs"
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const CHART_JS = path.join(ROOT, 'chart v 1.4', 'chart', 'chart.js');
const CHART_MIRROR = path.join(ROOT, 'homepage', 'public', 'chart', 'chart.js');
const SWITCH = '__TALARIA_DISABLE_MC_HOST_CACHE_RELEASE_V1';
const SOURCE = fs.readFileSync(CHART_JS, 'utf8');

function note(name, pass, detail = '') {
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` ? ${detail}` : ''}\n`);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
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

function replaceOne(text, from, to, label) {
  const count = text.split(from).length - 1;
  assert.equal(count, 1, `${label} anchor count`);
  return text.replace(from, to);
}

const METHOD_NAMES = [
  '_mcHostCacheReleaseEnabled',
  '_mcHostCacheOwnerId',
  '_installMcHostCacheReleaseHook',
  '_retainMcHostCacheFile',
  '_mcHostCacheSharedWriteOwner',
  '_forgetMcHostCacheFileRefSet',
  '_smartPrefetchCacheHasFileId',
  '_dropMcHostCacheFileRef',
  '_releaseMcHostCacheFileRefs',
  '_trimFileIdCacheLru',
  '_trimSmartPrefetchCache',
  '_rawResponseTextDropEnabled',
  '_dropRawResponseTextRetainers',
  '_setSmartPrefetchCacheEntry',
  '_setSmartCachedPayload',
  '_saveTfDataCache',
];

function chartMethods(text) {
  return METHOD_NAMES.map((name) => methodSource(text, name)).join('\n');
}

const FAKE_WINDOW = `
class FakeWindow {
  constructor(name) {
    this.__name = name;
    this.__listeners = new Map();
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

function makeRuntime(text = SOURCE, { install = true, hostChart = null } = {}) {
  const sandbox = { console, Date, Math };
  sandbox.globalThis = sandbox;
  sandbox.__hostChart = hostChart;
  const context = vm.createContext(sandbox);
  vm.runInContext(`${FAKE_WINDOW}
globalThis.window = new FakeWindow('panel');
`, context);
  vm.runInContext(`
class TestChart {
    constructor(installRelease = true) {
        this._tfDataCache = new Map();
        this._btTfDataCache = new Map();
        this._smartPrefetchCache = new Map();
        this._maxCachedFileIds = 2;
        this._smartCacheMaxEntries = 2;
        this._tfDataCacheMaxPerFile = 2;
        this._mcHostCacheClientId = null;
        this._mcHostCacheFileRefs = new Map();
        this._mcHostCacheReleaseUnloadHandler = null;
        if (installRelease) this._installMcHostCacheReleaseHook();
    }

    _smartCacheKeyFromParams(fileId, params) {
        return String(fileId) + '|' + String((params && params.timeframe) || 'smart');
    }

    resampleData(rawData) {
        return Array.isArray(rawData) ? rawData.slice() : [];
    }

${chartMethods(text)}
}
globalThis.__ChartClass = TestChart;
globalThis.__chart = new TestChart(${install ? 'true' : 'false'});
`, context);
  context.__chart._isMultichartEmbedPanel = () => !!hostChart;
  context.__chart._multichartGetHostChart = () => hostChart;
  return {
    context,
    window: context.window,
    chart: context.__chart,
    ChartClass: context.__ChartClass,
    hostChart,
  };
}

function makeHostAndPanels(text = SOURCE, count = 2) {
  const host = makeRuntime(text, { install: false });
  const panels = Array.from({ length: count }, () => makeRuntime(text, {
    install: true,
    hostChart: host.chart,
  }));
  return { host, panels };
}

function seedHostFile(hostChart, fileId = 'EURUSD') {
  const fid = String(fileId);
  hostChart._tfDataCache.set(fid, new Map([['1m', { rawData: [{ t: 1 }], data: [{ t: 1 }] }]]));
  hostChart._btTfDataCache.set(fid, new Map([['1m', { rawData: [{ t: 1 }], anchorKey: 'a' }]]));
  hostChart._smartPrefetchCache.set(`${fid}|smart`, {
    at: Date.now(),
    fileId: fid,
    payload: { data: [{ t: 1 }] },
  });
}

function retainAll(panelChart, hostChart, fileId = 'EURUSD') {
  panelChart._retainMcHostCacheFile(hostChart, 'tf', fileId);
  panelChart._retainMcHostCacheFile(hostChart, 'bt', fileId);
  panelChart._retainMcHostCacheFile(hostChart, 'smart', fileId);
}

function hostHasAll(hostChart, fileId = 'EURUSD') {
  const fid = String(fileId);
  return hostChart._tfDataCache.has(fid)
    && hostChart._btTfDataCache.has(fid)
    && [...hostChart._smartPrefetchCache.values()].some((entry) => String(entry.fileId) === fid);
}

function hostHasAny(hostChart, fileId = 'EURUSD') {
  const fid = String(fileId);
  return hostChart._tfDataCache.has(fid)
    || hostChart._btTfDataCache.has(fid)
    || [...hostChart._smartPrefetchCache.values()].some((entry) => String(entry.fileId) === fid);
}

function hostHasTfSmart(hostChart, fileId = 'EURUSD') {
  const fid = String(fileId);
  return hostChart._tfDataCache.has(fid)
    && [...hostChart._smartPrefetchCache.values()].some((entry) => String(entry.fileId) === fid);
}

function hostHasTfSmartAny(hostChart, fileId = 'EURUSD') {
  const fid = String(fileId);
  return hostChart._tfDataCache.has(fid)
    || [...hostChart._smartPrefetchCache.values()].some((entry) => String(entry.fileId) === fid);
}

function dispatchPagehide(panel, persisted = false) {
  panel.window.dispatchEvent({ type: 'pagehide', persisted });
}

function setWritableBars(chart, fileId, seed = 1) {
  chart.currentFileId = String(fileId);
  chart.currentTimeframe = '1m';
  chart.rawData = [
    { t: seed, o: seed, h: seed + 1, l: seed - 1, c: seed },
    { t: seed + 60000, o: seed + 1, h: seed + 2, l: seed, c: seed + 1 },
  ];
  chart.data = chart.rawData.slice();
  chart.totalCandles = chart.rawData.length;
}

function writeTfAndSmart(chart, fileId, seed = 1) {
  setWritableBars(chart, fileId, seed);
  chart._saveTfDataCache(fileId, '1m');
  chart._setSmartCachedPayload(fileId, { timeframe: '1m' }, {
    data: chart.data.slice(),
    total: chart.totalCandles,
  });
}

function shareHostWriteCaches(panelChart, hostChart) {
  panelChart._tfDataCache = hostChart._tfDataCache;
  panelChart._smartPrefetchCache = hostChart._smartPrefetchCache;
}

function hostOwnsTfOrSmart(hostChart, fileId) {
  const fid = String(fileId);
  const ownerId = hostChart._mcHostCacheClientId;
  if (!ownerId || !hostChart._mcHostCacheFileRefOwners) return false;
  const tfOwners = hostChart._mcHostCacheFileRefOwners.get(`tf|${fid}`);
  const smartOwners = hostChart._mcHostCacheFileRefOwners.get(`smart|${fid}`);
  return !!((tfOwners && tfOwners.has(ownerId)) || (smartOwners && smartOwners.has(ownerId)));
}

function assertProductionWriteRelease(text = SOURCE) {
  const { host, panels } = makeHostAndPanels(text, 2);
  const fid = 'WRITE';

  writeTfAndSmart(host.chart, fid, 10);
  const hostNonOwning = !hostOwnsTfOrSmart(host.chart, fid);
  note('production-write-host-is-non-owning', hostNonOwning, '');
  assert.equal(hostNonOwning, true);

  for (let i = 0; i < panels.length; i++) {
    shareHostWriteCaches(panels[i].chart, host.chart);
    writeTfAndSmart(panels[i].chart, fid, 20 + i);
  }

  dispatchPagehide(panels[0]);
  note('production-write-first-panel-keeps-host-cache', hostHasTfSmart(host.chart, fid), '');
  assert.equal(hostHasTfSmart(host.chart, fid), true);

  dispatchPagehide(panels[1]);
  note('production-write-last-panel-drops-host-cache', !hostHasTfSmartAny(host.chart, fid), '');
  assert.equal(hostHasTfSmartAny(host.chart, fid), false);
}

function assertRefCountedRelease(text = SOURCE) {
  const { host, panels } = makeHostAndPanels(text, 2);
  seedHostFile(host.chart, 'EURUSD');
  retainAll(panels[0].chart, host.chart, 'EURUSD');
  retainAll(panels[1].chart, host.chart, 'EURUSD');

  dispatchPagehide(panels[0]);
  note('first-panel-release-keeps-host-cache', hostHasAll(host.chart, 'EURUSD'), '');
  assert.equal(hostHasAll(host.chart, 'EURUSD'), true);

  dispatchPagehide(panels[1]);
  note('last-panel-release-drops-host-cache', !hostHasAny(host.chart, 'EURUSD'), '');
  assert.equal(hostHasAny(host.chart, 'EURUSD'), false);
}

function assertBfcacheKeepsOwnership(text = SOURCE) {
  const { host, panels } = makeHostAndPanels(text, 1);
  seedHostFile(host.chart, 'BF');
  retainAll(panels[0].chart, host.chart, 'BF');
  dispatchPagehide(panels[0], true);
  note('persisted-pagehide-keeps-host-cache', hostHasAll(host.chart, 'BF'), '');
  assert.equal(hostHasAll(host.chart, 'BF'), true);
  assert.equal(panels[0].window.count('pagehide'), 1);
}

function assertMissedReleaseLruBound(text = SOURCE) {
  const { host, panels } = makeHostAndPanels(text, 1);
  for (const fid of ['A', 'B', 'C']) {
    seedHostFile(host.chart, fid);
    retainAll(panels[0].chart, host.chart, fid);
  }

  host.chart._trimFileIdCacheLru(host.chart._tfDataCache);
  host.chart._trimFileIdCacheLru(host.chart._btTfDataCache);
  host.chart._trimSmartPrefetchCache();

  const tfBounded = !host.chart._tfDataCache.has('A') && host.chart._tfDataCache.size === 2;
  const btBounded = !host.chart._btTfDataCache.has('A') && host.chart._btTfDataCache.size === 2;
  const smartBounded = !host.chart._smartPrefetchCacheHasFileId('A')
    && host.chart._smartPrefetchCache.size === 2;
  const refsPruned = !host.chart._mcHostCacheFileRefOwners.has('tf|A')
    && !host.chart._mcHostCacheFileRefOwners.has('bt|A')
    && !host.chart._mcHostCacheFileRefOwners.has('smart|A');

  note('missed-release-tf-lru-bounded', tfBounded, `files=${host.chart._tfDataCache.size}`);
  note('missed-release-bt-lru-bounded', btBounded, `files=${host.chart._btTfDataCache.size}`);
  note('missed-release-smart-lru-bounded', smartBounded, `entries=${host.chart._smartPrefetchCache.size}`);
  note('missed-release-refsets-pruned', refsPruned, '');
  assert.equal(tfBounded && btBounded && smartBounded && refsPruned, true);
}

function releaseUnderFlag(value, { define = true, text = SOURCE } = {}) {
  const { host, panels } = makeHostAndPanels(text, 1);
  seedHostFile(host.chart, 'FLAG');
  retainAll(panels[0].chart, host.chart, 'FLAG');
  if (define) panels[0].window[SWITCH] = value;
  dispatchPagehide(panels[0]);
  return hostHasAll(host.chart, 'FLAG');
}

function assertFlagRoundTrip(text = SOURCE) {
  note('flag-absent-default-releases', releaseUnderFlag(undefined, { define: false, text }) === false, '');
  assert.equal(releaseUnderFlag(undefined, { define: false, text }), false);

  note('flag-true-disables-release', releaseUnderFlag(true, { text }) === true, '');
  assert.equal(releaseUnderFlag(true, { text }), true);

  note('flag-false-enables-release', releaseUnderFlag(false, { text }) === false, '');
  assert.equal(releaseUnderFlag(false, { text }), false);

  note('flag-undefined-property-enables-release', releaseUnderFlag(undefined, { text }) === false, '');
  assert.equal(releaseUnderFlag(undefined, { text }), false);
}

function assertPagehideListenerRemoved(text = SOURCE) {
  const { host, panels } = makeHostAndPanels(text, 1);
  seedHostFile(host.chart, 'LISTENER');
  retainAll(panels[0].chart, host.chart, 'LISTENER');
  assert.equal(panels[0].window.count('pagehide'), 1);
  dispatchPagehide(panels[0]);
  note('release-removes-pagehide-listener', panels[0].window.count('pagehide') === 0, `listeners=${panels[0].window.count('pagehide')}`);
  assert.equal(panels[0].window.count('pagehide'), 0);
  assert.equal(panels[0].chart._mcHostCacheReleaseUnloadHandler, null);
}

test('Leak A: pagehide release is reference-counted by host cache fileId', () => {
  assertRefCountedRelease();
});

test('Leak A: production writes are panel-owned on shared host caches', () => {
  assertProductionWriteRelease();
});

test('Leak A: bfcache pagehide does not release live panel ownership', () => {
  assertBfcacheKeepsOwnership();
});

test('Leak A: missed release degrades to existing LRU bounds', () => {
  assertMissedReleaseLruBound();
});

test('Leak A FLAG: four-state in-page switch round trip uses truthiness per call', () => {
  assertFlagRoundTrip();
});

test('Leak A: release removes its pagehide hook after teardown', () => {
  assertPagehideListenerRemoved();
});

test('Leak A mirror: homepage chart.js is byte-identical', () => {
  const chart = fs.readFileSync(CHART_JS);
  const mirror = fs.readFileSync(CHART_MIRROR);
  note('mirror-byte-identical', chart.equals(mirror), `sha256=${sha256(chart)}`);
  assert.equal(sha256(chart), sha256(mirror));
});

test('Leak A mutants: neutered release, flag, and LRU guards go red', () => {
  const hostSelfRetain = replaceOne(
    SOURCE,
    '            ...extra,\n        });\n        const mcCacheOwner = this._mcHostCacheSharedWriteOwner(\'tf\');\n        if (mcCacheOwner) this._retainMcHostCacheFile(mcCacheOwner, \'tf\', fid);',
    '            ...extra,\n        });\n        this._retainMcHostCacheFile(this, \'tf\', fid);',
    'legacy host self-retain write-path mutant',
  );
  assert.throws(() => assertProductionWriteRelease(hostSelfRetain));
  note('mutant-killed:production-host-self-retain', true);

  const productionRetainNoop = replaceOne(
    SOURCE,
    '            ...extra,\n        });\n        const mcCacheOwner = this._mcHostCacheSharedWriteOwner(\'tf\');\n        if (mcCacheOwner) this._retainMcHostCacheFile(mcCacheOwner, \'tf\', fid);',
    '            ...extra,\n        });\n        const mcCacheOwner = this._mcHostCacheSharedWriteOwner(\'tf\');\n        /* if (mcCacheOwner) this._retainMcHostCacheFile(mcCacheOwner, \'tf\', fid); */',
    'production tf write retain mutant',
  );
  assert.throws(() => assertProductionWriteRelease(productionRetainNoop));
  note('mutant-killed:production-tf-write-retain-neutered', true);

  const retainNoop = replaceOne(
    SOURCE,
    'this._mcHostCacheFileRefs.set(refKey, { cacheOwner: owner, kind: cacheKind, fileId: id });',
    '/* this._mcHostCacheFileRefs.set(refKey, { cacheOwner: owner, kind: cacheKind, fileId: id }); */',
    'retain local ref mutant',
  );
  assert.throws(() => assertRefCountedRelease(retainNoop));
  note('mutant-killed:retain-local-ref-neutered', true);

  const tfDeleteNoop = replaceOne(
    SOURCE,
    'this._tfDataCache.delete(id);',
    '/* this._tfDataCache.delete(id); */',
    'tf delete mutant',
  );
  assert.throws(() => assertRefCountedRelease(tfDeleteNoop));
  note('mutant-killed:tf-delete-neutered', true);

  const hasOwnFlag = replaceOne(
    SOURCE,
    'return !(typeof window !== \'undefined\' && window.__TALARIA_DISABLE_MC_HOST_CACHE_RELEASE_V1);',
    'return !(typeof window !== \'undefined\' && Object.prototype.hasOwnProperty.call(window, "__TALARIA_DISABLE_MC_HOST_CACHE_RELEASE_V1"));',
    'hasOwnProperty flag mutant',
  );
  assert.throws(() => assertFlagRoundTrip(hasOwnFlag));
  note('mutant-killed:flag-hasown', true);

  const tfLruNoop = replaceOne(
    SOURCE,
    'cache.delete(oldest);\n            this._forgetMcHostCacheFileRefSet(cache === this._btTfDataCache ? \'bt\' : \'tf\', oldest);',
    'cache.delete(oldest);\n            /* this._forgetMcHostCacheFileRefSet(cache === this._btTfDataCache ? \'bt\' : \'tf\', oldest); */',
    'tf/bt lru ref-prune mutant',
  );
  assert.throws(() => assertMissedReleaseLruBound(tfLruNoop));
  note('mutant-killed:file-lru-ref-prune-neutered', true);

  const smartLruNoop = replaceOne(
    SOURCE,
    'this._smartPrefetchCache.delete(first);\n            if (fid && !this._smartPrefetchCacheHasFileId(fid)) {',
    'this._smartPrefetchCache.delete(first);\n            if (false && fid && !this._smartPrefetchCacheHasFileId(fid)) {',
    'smart lru ref-prune mutant',
  );
  assert.throws(() => assertMissedReleaseLruBound(smartLruNoop));
  note('mutant-killed:smart-lru-ref-prune-neutered', true);
});
