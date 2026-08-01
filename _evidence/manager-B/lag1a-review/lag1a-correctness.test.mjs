#!/usr/bin/env node
/**
 * LAG-1a correctness review gate — money-path, so D's green timing gate is not enough.
 *
 * D's gate proves the cache is faster and that a source-reverted mutant is slower again.
 * That is necessary and not sufficient. The property that matters on a money-path row is:
 * the cached path returns the SAME INDEX as the uncached path for every input that the
 * original function handles. A cache that is 20x faster and wrong is a worse defect than
 * the one it replaces, because markers land on the wrong candle.
 *
 * This gate extracts both functions from D's tip and runs them against constructed inputs
 * that cover: exact hits, in-period containment, nearest fallback, skipNearestFallback,
 * non-monotonic data, NaN timestamps, empty arrays, and a mutated-array identity trap —
 * the last being the thing that would make a WeakMap keyed on the array return a stale
 * answer after an in-place push. If any cell disagrees, the cache is wrong.
 *
 * Discriminating: a mutant that returns the first hit from a Map that ignores length /
 * firstT / lastT identity would still pass D's timing gate (it would be even faster) and
 * fail this one.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = process.argv[2]
  || 'C:/Users/user/Desktop/talaria1/manager-d-trade';
const OM = path.join(ROOT, 'chart v 1.4/chart/modules/order-manager.js');

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { console.log(`  PASS  ${name}`); pass++; }
  else { console.log(`  FAIL  ${name}\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`); fail++; }
};

const src = fs.readFileSync(OM, 'utf8');

// Locate by symbol, never by line (standing correction).
const cacheFnStart = src.indexOf('_markerIndexCacheForData(chartData)');
const cachedFnStart = src.indexOf('_findCandleIndexForTimeCached(chartData, timestamp, opts = {})');
const origFnStart = (() => {
  // Prefer the method definition, not a call site.
  const re = /\n    _findCandleIndexForTime\(chartData, timestamp, opts = \{\}\) \{/g;
  let m, last = -1;
  while ((m = re.exec(src)) !== null) last = m.index + 1; // skip the leading \n
  return last;
})();

if (cacheFnStart < 0 || cachedFnStart < 0 || origFnStart < 0) {
  console.log('  FATAL could not locate cache helpers by symbol in order-manager.js');
  console.log(`         cache=${cacheFnStart} cached=${cachedFnStart} orig=${origFnStart}`);
  process.exit(1);
}

function extractMethod(src, startIdx) {
  // The signature can contain `opts = {}`, so the first `{` after startIdx is NOT
  // the method body. Find the `) {` / `){` that closes the parameter list.
  const sigEnd = src.slice(startIdx, startIdx + 200).search(/\)\s*\{/);
  if (sigEnd < 0) throw new Error('could not find method-body opening brace');
  const brace = startIdx + sigEnd + src.slice(startIdx + sigEnd).indexOf('{');
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(startIdx, i + 1);
    }
  }
  throw new Error('unbalanced braces extracting method');
}

const cacheBody = extractMethod(src, cacheFnStart);
const cachedBody = extractMethod(src, cachedFnStart);
const origBody = extractMethod(src, origFnStart);

// Reconstruct a minimal OrderManager-shaped object that can host the three methods.
// The switch reads window.__TALARIA_MARKER_INDEX_CACHE_V1; default ON.
globalThis.window = globalThis.window || {};
window.__TALARIA_MARKER_INDEX_CACHE_V1 = true;

// Re-declare the switch the way D does, so we exercise the same predicate.
function _markerIndexCacheV1Enabled() {
  if (typeof window === 'undefined') return true;
  const v = window.__TALARIA_MARKER_INDEX_CACHE_V1;
  if (v === undefined || v === null) return true;
  const s = String(v).trim().toLowerCase();
  return !['0', 'false', 'off', 'no'].includes(s);
}

const host = {
  _markerIndexCacheByData: null,
};
// Bind the three extracted methods onto the host.
host._markerIndexCacheForData = new Function(
  'return function ' + cacheBody
)().bind(host);
host._findCandleIndexForTime = new Function(
  'return function ' + origBody
)().bind(host);
host._findCandleIndexForTimeCached = new Function(
  '_markerIndexCacheV1Enabled',
  'return function ' + cachedBody
)(_markerIndexCacheV1Enabled).bind(host);

const START = 1_700_000_000_000;
const bars = (n, step = 60_000) => Array.from({ length: n }, (_, i) => ({
  t: START + i * step, o: 1, h: 1.1, l: 0.9, c: 1,
}));

console.log('=== exact and in-period agreement on a monotonic series ===');
{
  const data = bars(200);
  const cases = [
    ['exact first bar', data[0].t, {}],
    ['exact middle bar', data[100].t, {}],
    ['exact last bar', data[199].t, {}],
    ['inside a period (midway)', data[50].t + 30_000, {}],
    ['just before next open', data[50].t + 59_999, {}],
    ['before the series', START - 60_000, {}],
    ['after the series', data[199].t + 60_000, {}],
    ['NaN timestamp', NaN, {}],
    ['string timestamp that coerces', String(data[10].t), {}],
  ];
  for (const [name, ts, opts] of cases) {
    const a = host._findCandleIndexForTime(data, ts, opts);
    const b = host._findCandleIndexForTimeCached(data, ts, opts);
    check(`monotonic: ${name}`, b, a);
  }
}

console.log('\n=== skipNearestFallback must agree (replay path) ===');
{
  const data = bars(100);
  const cases = [
    ['exact, skipNearest', data[40].t, { skipNearestFallback: true }],
    ['inside period, skipNearest', data[40].t + 1, { skipNearestFallback: true }],
    ['before series, skipNearest (must be -1)', START - 1, { skipNearestFallback: true }],
    ['after series, skipNearest (must be -1)', data[99].t + 1, { skipNearestFallback: true }],
  ];
  for (const [name, ts, opts] of cases) {
    check(`replay: ${name}`,
      host._findCandleIndexForTimeCached(data, ts, opts),
      host._findCandleIndexForTime(data, ts, opts));
  }
}

console.log('\n=== non-monotonic data must fall back to the original (and agree) ===');
{
  const data = bars(50);
  // Break monotonicity in the middle — the cache detects this and falls back.
  data[25] = { ...data[25], t: data[20].t };
  const a = host._findCandleIndexForTime(data, data[30].t, {});
  const b = host._findCandleIndexForTimeCached(data, data[30].t, {});
  check('non-monotonic falls back and agrees', b, a);
  check('and the original still finds something non-negative', a >= 0, true);
}

console.log('\n=== WeakMap identity trap: same array mutated in place must NOT return a stale answer ===');
{
  // This is the failure mode a cache keyed only on array identity without a length/edge check
  // would produce. D's key includes length + firstT + lastT, so an in-place push that changes
  // length OR lastT must rebuild. Prove it.
  const data = bars(50);
  const firstAsk = host._findCandleIndexForTimeCached(data, data[40].t + 30_000, {});
  // In-place append — same array identity, new length and lastT.
  data.push({ t: START + 50 * 60_000, o: 1, h: 1.1, l: 0.9, c: 1 });
  const afterPush = host._findCandleIndexForTimeCached(data, data[50].t, {});
  const uncached = host._findCandleIndexForTime(data, data[50].t, {});
  check('after in-place push, cached agrees with uncached on the new last bar', afterPush, uncached);
  check('and that answer is the new last index, not a stale one', afterPush, 50);
  check('the pre-push answer was on the old series', firstAsk, 40);
}

console.log('\n=== cross-instrument / cross-array: two charts must not share a stale answer ===');
{
  const a = bars(100);
  const b = bars(100, 120_000); // different step — same length, different times
  // Warm the cache on A.
  host._findCandleIndexForTimeCached(a, a[50].t, {});
  // Asking B for a time that only exists on A must not return A's index.
  const onlyOnA = a[50].t;
  const cachedB = host._findCandleIndexForTimeCached(b, onlyOnA, { skipNearestFallback: true });
  const uncachedB = host._findCandleIndexForTime(b, onlyOnA, { skipNearestFallback: true });
  check('a time that is exact on A is not an exact hit on B', cachedB, uncachedB);
  // And an exact hit on B still works.
  check('exact hit on B still works after A was warmed',
    host._findCandleIndexForTimeCached(b, b[50].t, {}),
    host._findCandleIndexForTime(b, b[50].t, {}));
}

console.log('\n=== fingerprint gap: in-place middle-bar time change (length/firstT/lastT unchanged) ===');
{
  // D's invalidation key is (length, firstT, lastT). A middle bar whose `t` is rewritten
  // in place keeps that fingerprint and serves a stale exact Map. Whether production ever
  // does this is a separate question; the gate records the behaviour so the review is honest.
  const data = bars(30);
  const oldT = data[15].t;
  host._findCandleIndexForTimeCached(data, oldT, {}); // warm
  data[15] = { ...data[15], t: oldT + 1 };             // rewrite middle bar time in place
  const cachedOld = host._findCandleIndexForTimeCached(data, oldT, { skipNearestFallback: true });
  const uncachedOld = host._findCandleIndexForTime(data, oldT, { skipNearestFallback: true });
  const cachedNew = host._findCandleIndexForTimeCached(data, oldT + 1, { skipNearestFallback: true });
  const uncachedNew = host._findCandleIndexForTime(data, oldT + 1, { skipNearestFallback: true });
  check('after middle rewrite, asking for OLD t: cached agrees with uncached', cachedOld, uncachedOld);
  check('after middle rewrite, asking for NEW t: cached agrees with uncached', cachedNew, uncachedNew);
}
{
  const data = bars(30);
  window.__TALARIA_MARKER_INDEX_CACHE_V1 = false;
  const a = host._findCandleIndexForTime(data, data[10].t + 1, {});
  const b = host._findCandleIndexForTimeCached(data, data[10].t + 1, {});
  check('switch OFF: cached path returns the original answer', b, a);
  window.__TALARIA_MARKER_INDEX_CACHE_V1 = true;
}

console.log('\n=== discriminating mutant: a cache that ignores length would pass D\'s timing gate and fail here ===');
{
  // Identity-only WeakMap: same array object keeps its cache forever. After splice the
  // times still hit the stale exact Map at the old indices. D's timing gate would still
  // go green (the mutant is as fast as the real cache). This gate must go red.
  const broken = new WeakMap();
  function brokenCached(chartData, timestamp, opts = {}) {
    const ts = Number(timestamp);
    if (!Array.isArray(chartData) || !chartData.length || !Number.isFinite(ts)) return -1;
    let cache = broken.get(chartData);
    if (!cache) {
      const exact = new Map();
      for (let i = 0; i < chartData.length; i++) {
        const t = Number(chartData[i]?.t);
        if (Number.isFinite(t) && !exact.has(t)) exact.set(t, i);
      }
      cache = { exact };
      broken.set(chartData, cache);
    }
    const hit = cache.exact.get(ts);
    if (hit !== undefined) return hit;
    return -1;
  }
  const data = bars(20);
  const targetT = data[10].t;
  brokenCached(data, targetT, {}); // warm: exact maps targetT -> 10
  data.splice(0, 5);               // same array identity; targetT is now at index 5
  const mutantAns = brokenCached(data, targetT, {});
  const realAns = host._findCandleIndexForTimeCached(data, targetT, {});
  check('mutant (identity-only key) returns the STALE index after splice', mutantAns, 10);
  check('D\'s real cache returns the CORRECT post-splice index', realAns, 5);
  check('so this gate is discriminating — D\'s timing gate would not catch the mutant', true, true);
}

console.log('\n=== mirrors: both order-manager copies must carry the cache ===');
{
  const a = fs.readFileSync(path.join(ROOT, 'chart v 1.4/chart/modules/order-manager.js'), 'utf8');
  const bPath = path.join(ROOT, 'homepage/public/chart/modules/order-manager.js');
  const b = fs.existsSync(bPath) ? fs.readFileSync(bPath, 'utf8') : null;
  check('primary mirror carries _findCandleIndexForTimeCached',
    a.includes('_findCandleIndexForTimeCached'), true);
  check('homepage mirror exists', b !== null, true);
  check('homepage mirror carries the same helper',
    !!b && b.includes('_findCandleIndexForTimeCached'), true);
  // Byte identity — Director said three hits in each mirror for LIFE-4; for LAG-1a we want
  // the same discipline on the helpers themselves.
  const aHash = createHash('sha256').update(a).digest('hex');
  const bHash = b ? createHash('sha256').update(b).digest('hex') : null;
  check('mirrors are byte-identical (co-ownership hazard if not)', aHash, bHash);
}

console.log(`\n================ LAG-1a REVIEW: ${pass} passed, ${fail} failed ================`);
process.exit(fail ? 1 : 0);
