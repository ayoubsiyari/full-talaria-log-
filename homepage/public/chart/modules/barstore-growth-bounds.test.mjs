/**
 * BARSTORE-1 / BARSTORE-2 — bound the shared bar store's growth.
 *
 * Measured ceiling before this: MAX_FILES(12) x *unlimited* timeframes per file
 * x MAX_BARS_PER_TF(200000), with a floor that rose on every timeframe the user
 * visited and never fell while the file stayed in the LRU window. That is the
 * soak shape — one long session, not re-entry.
 *
 * BARSTORE-1 caps timeframes per file.
 * BARSTORE-2 stops eviction from dropping a *retained* file. That one is a
 * correctness bug, not just a memory one: the evicted entry took its refs Set
 * with it, so the live owner's later releaseFile() found nothing and became a
 * silent no-op.
 *
 * Drives the real lifted _createSharedBarStore() body from chart.js.
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
const CHART_MIRROR = path.resolve(findRoot(__dirname), 'homepage/public/chart/chart.js');

const chartSrc = fs.readFileSync(CHART, 'utf8');

/** BIND-01: a missing symbol and a moved symbol must not collapse into one red. */
function lift(source, header, label) {
  const start = source.indexOf(header);
  if (start < 0) {
    const bare = header.trim().split('(')[0];
    const state = source.includes(bare) ? 'ANCHOR_BROKEN' : 'RESOLVER_ABSENT_FROM_TREE';
    assert.fail(`${state}: ${label || header}`);
  }
  const open = source.indexOf('{', source.indexOf('(', start));
  let d = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') d += 1;
    else if (source[i] === '}') { d -= 1; if (d === 0) return source.slice(start, i + 1); }
  }
  assert.fail(`ANCHOR_BROKEN: ${label || header} — unbalanced braces`);
  return null;
}

const STORE_BODY = lift(chartSrc, '    _createSharedBarStore()', '_createSharedBarStore');

/**
 * Read the cap from the product rather than restating it. A gate that hardcodes
 * the number it is checking goes red on a legitimate retune and tells you
 * nothing about whether the cap still WORKS. The policy — what the number has
 * to clear and why — is asserted separately below, so a retune that breaks the
 * reasoning still fails.
 */
const capMatch = STORE_BODY.match(/const\s+MAX_TFS_PER_FILE\s*=\s*(\d+)\s*;/);
assert.ok(capMatch, 'RESOLVER_ABSENT_FROM_TREE: MAX_TFS_PER_FILE');
const CAP = Number(capMatch[1]);

function makeStore(flags = {}) {
  const ctx = vm.createContext({
    Map, Set, String, Number, Math, Date, Object, Array, console,
    window: { ...flags },
  });
  return vm.runInContext(`({ ${STORE_BODY} })`, ctx)._createSharedBarStore();
}

const MULT = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
const tfMs = (tf) => {
  const m = String(tf).match(/^(\d+)(w|d|h|m|s)$/);
  return parseInt(m[1], 10) * MULT[m[2]];
};

const TFS = ['1m', '2m', '3m', '5m', '10m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '1w'];
const BASE = 1700000000000;

/**
 * Bars whose step matches the timeframe, so span grows strictly with tf
 * coarseness. pick() maximises span/wantedMs over entries at or below the
 * wanted resolution, so under this fixture it returns exactly `tf` when `tf` is
 * present — which makes presence testable through the public surface alone.
 */
const barsFor = (tf, n = 1000, base = BASE) => {
  const step = tfMs(tf);
  return Array.from({ length: n }, (_, i) => ({ t: base + i * step, o: 1, h: 2, l: 0, c: 1.5, v: 10 }));
};

const present = (store, fileId, tf) => {
  const p = store.pick(fileId, tf);
  return !!p && p.tf === tf;
};
const tfCount = (store, fileId) => TFS.filter((tf) => present(store, fileId, tf)).length;

test('BARSTORE-1: fixture is exact — a single stored timeframe reads back as itself', () => {
  const store = makeStore();
  store.put('F', '5m', barsFor('5m'));
  assert.ok(present(store, 'F', '5m'), 'fixture cannot identify an exact timeframe');
  assert.equal(tfCount(store, 'F'), 1, 'fixture over-counts timeframes');
});

test('BARSTORE-1: anti-vacuity — with the cap killed, every timeframe is retained', () => {
  const store = makeStore({ __TALARIA_DISABLE_BARSTORE_TF_CAP_V1: true });
  TFS.forEach((tf) => store.put('F', tf, barsFor(tf)));
  assert.equal(tfCount(store, 'F'), TFS.length, 'kill switch did not restore uncapped growth');
});

test(`BARSTORE-1: green — timeframes per file are capped at ${CAP}`, () => {
  assert.ok(TFS.length > CAP, `fixture cannot exercise a cap of ${CAP} with only ${TFS.length} timeframes`);
  const store = makeStore();
  TFS.forEach((tf) => store.put('F', tf, barsFor(tf)));
  const n = tfCount(store, 'F');
  assert.equal(n, CAP, `expected the cap to hold at ${CAP}, saw ${n}`);
});

test('BARSTORE-1: the cap is LRU — the least recently written timeframe is the victim', () => {
  const store = makeStore();
  const filled = TFS.slice(0, CAP);
  const overflow = TFS[CAP];
  filled.forEach((tf) => store.put('F', tf, barsFor(tf)));
  store.put('F', overflow, barsFor(overflow));
  assert.equal(present(store, 'F', filled[0]), false, `${filled[0]} survived while a newer timeframe was evicted`);
  assert.ok(present(store, 'F', overflow), 'the newest timeframe was evicted');
  assert.equal(tfCount(store, 'F'), CAP);
});

/**
 * The ruling was a reason, not a number: the cap must sit ABOVE realistic usage,
 * because LRU eviction at the usage boundary buys no memory and costs a refetch
 * on a common action. The binding number is the multichart panel maximum — eight
 * tiles can show one file at eight timeframes with nothing leaking — so this
 * reads that maximum out of the shell and holds the cap to it.
 */
test('BARSTORE-1: policy — the cap clears the most timeframes one file can legitimately hold', () => {
  const gridSrc = fs.readFileSync(path.resolve(findRoot(__dirname), 'chart v 1.4/talaria-design/src/MultichartGrid.jsx'), 'utf8');
  const templates = gridSrc.match(/const\s+LAYOUT_TEMPLATES\s*=\s*\{[\s\S]*?\n\};/);
  assert.ok(templates, 'ANCHOR_BROKEN: LAYOUT_TEMPLATES');

  const maxPanels = Math.max(
    ...[...templates[0].matchAll(/tiles:\s*\[([\s\S]*?)\]/g)]
      .map((m) => (m[1].match(/id:\s*"/g) || []).length),
  );
  assert.ok(maxPanels >= 8, `expected the layout to reach 8 panels, saw ${maxPanels}`);
  assert.ok(
    CAP >= maxPanels,
    `MAX_TFS_PER_FILE=${CAP} is below the ${maxPanels}-panel layout maximum: opening that layout on one `
    + 'symbol would evict a visible panel\'s data and refetch it on the next redraw. Raise the cap or '
    + 'change the reasoning recorded beside the constant.',
  );
});

test('BARSTORE-1: a served timeframe is not the next victim', () => {
  const store = makeStore();
  const filled = TFS.slice(0, CAP);
  const overflow = TFS[CAP];
  filled.forEach((tf) => store.put('F', tf, barsFor(tf)));
  store.pick('F', filled[0]); // the oldest write becomes most recently used
  store.put('F', overflow, barsFor(overflow));
  assert.ok(present(store, 'F', filled[0]), 'an actively served timeframe was evicted');
  assert.equal(present(store, 'F', filled[1]), false, 'the true LRU victim survived');
});

test('BARSTORE-2: mutant — with refcount eviction killed, a retained file is dropped', () => {
  const store = makeStore({ __TALARIA_DISABLE_BARSTORE_REFCOUNT_EVICT_V1: true });
  store.put('HELD', '1m', barsFor('1m', 500));
  store.retainFile('HELD', 'live-owner');
  for (let i = 0; i < 20; i += 1) store.put(`FILL-${i}`, '1m', barsFor('1m', 10));
  assert.equal(
    present(store, 'HELD', '1m'),
    false,
    'mutant kept the retained file; the gate is not discriminating',
  );
});

test('BARSTORE-2: green — a retained file survives crossing the file cap', () => {
  const store = makeStore();
  store.put('HELD', '1m', barsFor('1m', 500));
  store.retainFile('HELD', 'live-owner');
  for (let i = 0; i < 20; i += 1) store.put(`FILL-${i}`, '1m', barsFor('1m', 10));
  const served = store.pick('HELD', '1m');
  assert.ok(served, 'eviction pulled bars out from under a live reader');
  assert.equal(served.bars.length, 500, 'retained file survived but lost bars');
});

test('BARSTORE-2: the owner\'s release still works after the cap was crossed', () => {
  const store = makeStore();
  store.put('HELD', '1m', barsFor('1m', 500));
  store.retainFile('HELD', 'live-owner');
  for (let i = 0; i < 20; i += 1) store.put(`FILL-${i}`, '1m', barsFor('1m', 10));
  store.releaseFile('HELD', 'live-owner');
  assert.equal(
    present(store, 'HELD', '1m'),
    false,
    'releaseFile became a no-op — the refs Set had been lost to eviction',
  );
});

test('BARSTORE-2: unreferenced files are still evicted — the fix is not a leak', () => {
  const store = makeStore();
  for (let i = 0; i < 20; i += 1) store.put(`FILL-${i}`, '1m', barsFor('1m', 10));
  const alive = Array.from({ length: 20 }, (_, i) => present(store, `FILL-${i}`, '1m')).filter(Boolean);
  assert.ok(alive.length <= 12, `file cap breached: ${alive.length} files retained`);
  assert.ok(alive.length > 0, 'eviction emptied the store');
});

test('BARSTORE-2: a freshly written file is never its own eviction victim', () => {
  // Retain 12 files, then write a 13th. The new file is the only unreferenced
  // entry, so a naive "evict the oldest unreferenced" discards the fetch that
  // just completed and the store never advances past the retained set.
  const store = makeStore();
  for (let i = 0; i < 12; i += 1) {
    store.put(`HELD-${i}`, '1m', barsFor('1m', 10));
    store.retainFile(`HELD-${i}`, `owner-${i}`);
  }
  store.put('FRESH', '1m', barsFor('1m', 42));
  const served = store.pick('FRESH', '1m');
  assert.ok(served, 'the just-written file evicted itself');
  assert.equal(served.bars.length, 42);
});

test('BARSTORE-2: retained files are victims only as a last resort', () => {
  // A retained file must outlive any unreferenced one. Here every file but the
  // fills is held, so the fills must go first and the held file must survive.
  const store = makeStore();
  store.put('HELD', '1m', barsFor('1m', 500));
  store.retainFile('HELD', 'live-owner');
  for (let i = 0; i < 30; i += 1) store.put(`FILL-${i}`, '1m', barsFor('1m', 10));
  assert.ok(present(store, 'HELD', '1m'), 'a retained file lost to an unreferenced one');
});

test('BARSTORE-2: a leaked ref stays LRU-bounded (P3 S-3 invariant preserved)', () => {
  // The opposing requirement. If retained files were never evictable, an owner
  // that never releases would pin memory forever — which during a soak is the
  // hoard we are trying to kill. When *nothing* is unreferenced the LRU still
  // applies, so the damage from a missed release stays bounded at the cap.
  const store = makeStore();
  for (let i = 0; i < 20; i += 1) {
    store.put(`LEAKED-${i}`, '1m', barsFor('1m', 10));
    store.retainFile(`LEAKED-${i}`, `owner-${i}`);
  }
  const alive = Array.from({ length: 20 }, (_, i) => present(store, `LEAKED-${i}`, '1m')).filter(Boolean);
  assert.ok(alive.length <= 12, `leaked refs grew past the cap: ${alive.length} files`);
  // ...and the survivors are the most recent, not an arbitrary subset.
  assert.ok(present(store, 'LEAKED-19', '1m'), 'the newest retained file was evicted');
  assert.equal(present(store, 'LEAKED-0', '1m'), false, 'the oldest retained file survived');
});

test('BARSTORE: put() still unions rather than replaces (unchanged)', () => {
  const store = makeStore();
  store.put('F', '1m', barsFor('1m', 1000));
  store.put('F', '1m', barsFor('1m', 1000, BASE + 1000 * tfMs('1m')));
  assert.equal(store.pick('F', '1m').bars.length, 2000, 'union semantics changed');
});

test('BARSTORE: mirror is byte-identical', () => {
  assert.equal(
    fs.readFileSync(CHART_MIRROR, 'utf8'),
    chartSrc,
    'homepage/public chart.js drifted from canonical',
  );
});
