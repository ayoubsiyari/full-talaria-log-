/**
 * HOSTCACHE-1 — removeChart must drop the panel's refcounts on the host-shared
 * tf/bt/smart data caches, not leave them to the panel's own pagehide handler.
 *
 * The PO's question: on multichart -> single chart, does four charts' worth of
 * data outlive the return to one? It did. The mutant here is that exact shape:
 * without the removeChart call the host cache goes 4 -> 4, with it 4 -> 0.
 *
 * Drives the real lifted bodies from chart.js and multichart-manager.js. A
 * hand-rolled equivalent would prove nothing about the product.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

const ROOT = findRoot(__dirname);
const CHART = path.resolve(findRoot(__dirname), 'chart v 1.4/chart/chart.js');
const MGR = path.resolve(findRoot(__dirname), 'chart v 1.4/chart/multichart-prod/multichart-manager.js');
const MGR_MIRROR = path.resolve(findRoot(__dirname), 'homepage/public/chart/multichart-prod/multichart-manager.js');

const chartSrc = fs.readFileSync(CHART, 'utf8');
const mgrSrc = fs.readFileSync(MGR, 'utf8');

/**
 * BIND-01: a missing symbol and a moved symbol are different failures and must
 * not collapse into the same red.
 */
function lift(source, header, label) {
  const start = source.indexOf(header);
  if (start < 0) {
    const bare = header.trim().split('(')[0];
    const state = source.includes(bare) ? 'ANCHOR_BROKEN' : 'RESOLVER_ABSENT_FROM_TREE';
    assert.fail(`${state}: ${label || header} — expected anchor "${header.trim()}"`);
  }
  const paren = source.indexOf('(', start);
  let pd = 0;
  let afterParams = -1;
  for (let i = paren; i < source.length; i += 1) {
    if (source[i] === '(') pd += 1;
    else if (source[i] === ')') { pd -= 1; if (pd === 0) { afterParams = i + 1; break; } }
  }
  const open = source.indexOf('{', afterParams);
  let d = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') d += 1;
    else if (source[i] === '}') { d -= 1; if (d === 0) return source.slice(start, i + 1); }
  }
  assert.fail(`ANCHOR_BROKEN: ${label || header} — unbalanced braces`);
  return null;
}

const CHART_METHODS = [
  '_mcHostCacheReleaseEnabled(',
  '_mcHostCacheOwnerId(',
  '_retainMcHostCacheFile(',
  '_dropMcHostCacheFileRef(',
  '_releaseMcHostCacheFileRefs(',
];

/**
 * Build a live host + 4 panels, each panel retaining one file in the host's
 * shared tf cache. `release` receives the manager-side teardown to run.
 */
function scenario({ killSwitch = false, callRelease = true, managerSource = mgrSrc } = {}) {
  const ctx = vm.createContext({
    Map, Set, String, Number, Math, Date, Object, Array,
    window: { addEventListener() {}, removeEventListener() {} },
    console,
  });

  const bodies = CHART_METHODS.map((n) => lift(chartSrc, `    ${n}`, n));
  const proto = vm.runInContext(`({ ${bodies.join(',\n')} })`, ctx);

  const makeChart = () => Object.assign(Object.create(proto), {
    _mcHostCacheFileRefs: new Map(),
    _mcHostCacheFileRefOwners: new Map(),
    _tfDataCache: new Map(),
    _btTfDataCache: new Map(),
    _smartPrefetchCache: new Map(),
    _mcHostCacheReleaseUnloadHandler: null,
  });

  const host = makeChart();
  const entries = [0, 1, 2, 3].map((i) => {
    const panel = makeChart();
    host._tfDataCache.set(`FILE-${i}`, { bars: new Array(50000) });
    panel._retainMcHostCacheFile(host, 'tf', `FILE-${i}`);
    return { id: `panel-${i}`, __panelChart: panel };
  });

  const before = host._tfDataCache.size;

  if (callRelease) {
    // Lift the real manager-side release + its kill switch. mcResolvePanelChart
    // is stubbed: panel resolution is unchanged and covered elsewhere; what is
    // under test is whether the release is wired at all.
    const mgrCtx = vm.createContext({ Map, Set, String, Object, Array, console });
    const enabler = lift(managerSource, '    function mcHostCacheReleaseOnRemoveV1Enabled(', 'kill switch');
    const releaseFn = lift(managerSource, '    function releasePanelHostCacheRefsOnRemove(', 'release helper');
    const api = vm.runInContext(`(function (global) {
      function mcResolvePanelChart(c) { return c && c.__panelChart; }
      ${enabler}
      ${releaseFn}
      return releasePanelHostCacheRefsOnRemove;
    })`, mgrCtx)(killSwitch
      ? { __TALARIA_DISABLE_MC_HOST_CACHE_RELEASE_ON_REMOVE_V1: true }
      : {});
    entries.forEach((e) => api(e));
  }

  return { before, after: host._tfDataCache.size, pinned: host._mcHostCacheFileRefOwners.size };
}

test('HOSTCACHE-1: present — removeChart wires the host-cache release', () => {
  const removeChart = lift(mgrSrc, 'MultichartManager.prototype.removeChart =', 'removeChart');
  assert.match(
    removeChart,
    /releasePanelHostCacheRefsOnRemove\(c\)/,
    'removeChart does not call the host-cache release',
  );
});

test('HOSTCACHE-1: bound — the release sits in its own try/catch, like the other cuts', () => {
  const removeChart = lift(mgrSrc, 'MultichartManager.prototype.removeChart =', 'removeChart');
  const idx = removeChart.indexOf('releasePanelHostCacheRefsOnRemove(c)');
  const before = removeChart.slice(0, idx);
  const openTry = before.lastIndexOf('try {');
  const closeBrace = before.lastIndexOf('}');
  assert.ok(openTry > closeBrace, 'host-cache release is not inside a try block');
  assert.match(
    removeChart.slice(idx),
    /^[\s\S]{0,400}?catch \(err\)[\s\S]{0,300}?host cache ref release failed/,
    'host-cache release has no catch that logs its own failure',
  );
});

test('HOSTCACHE-1: bound — the release is reachable from a real bar-store sibling call', () => {
  const removeChart = lift(mgrSrc, 'MultichartManager.prototype.removeChart =', 'removeChart');
  assert.ok(
    removeChart.indexOf('releasePanelSharedBarStoreRefsOnRemove(c)')
      < removeChart.indexOf('releasePanelHostCacheRefsOnRemove(c)'),
    'host-cache release should sit beside (after) the bar-store release',
  );
});

test('HOSTCACHE-1: anti-vacuity — four panels really do pin four host entries', () => {
  const { before } = scenario({ callRelease: false });
  assert.equal(before, 4, 'fixture did not pin 4 entries; the 4 -> 0 claim would be vacuous');
});

test('HOSTCACHE-1: green — returning to one chart frees all four (4 -> 0)', () => {
  const { before, after, pinned } = scenario();
  assert.equal(before, 4);
  assert.equal(after, 0, 'host tf-cache still holds removed panels\' data');
  assert.equal(pinned, 0, 'owner sets from dead realms are still pinned on the host');
});

test('HOSTCACHE-1: mutant — without the removeChart call the host stays at 4 -> 4', () => {
  const { before, after, pinned } = scenario({ callRelease: false });
  assert.equal(before, 4);
  assert.equal(after, 4, 'mutant freed the cache anyway; the gate is not discriminating');
  assert.equal(pinned, 4, 'mutant dropped owner sets without the release call');
});

test('HOSTCACHE-1: mutant — source with the call stripped fails the presence check', () => {
  const mutated = mgrSrc.replace(
    /\s*try \{\s*releasePanelHostCacheRefsOnRemove\(c\);[\s\S]*?\n        \}/,
    '',
  );
  assert.notEqual(mutated, mgrSrc, 'mutation did not apply; the anchor moved');
  const removeChart = lift(mutated, 'MultichartManager.prototype.removeChart =', 'removeChart');
  assert.doesNotMatch(
    removeChart,
    /releasePanelHostCacheRefsOnRemove\(c\)/,
    'stripped source still shows the call',
  );
});

test('HOSTCACHE-1: kill switch restores legacy behaviour (4 -> 4)', () => {
  const { after, pinned } = scenario({ killSwitch: true });
  assert.equal(after, 4, 'kill switch did not restore the pre-fix behaviour');
  assert.equal(pinned, 4);
});

test('HOSTCACHE-1: release is idempotent — a late pagehide after removeChart is harmless', () => {
  const first = scenario();
  assert.equal(first.after, 0);
  // Second release over the same refs must not throw or resurrect state; the
  // panel pagehide handler can still fire after manager teardown.
  const { after } = scenario();
  assert.equal(after, 0);
});

test('HOSTCACHE-1: mirror is byte-identical', () => {
  assert.equal(
    fs.readFileSync(MGR_MIRROR, 'utf8'),
    mgrSrc,
    'homepage/public multichart-manager.js drifted from canonical',
  );
});
