/**
 * M19-I / b62 — exact painted tail: MECHANISM-CORRECTION suite (W1).
 *
 * STATUS: PENDING-FRESH-GPT-MECHANISM-REVIEW
 * (supersedes the suite blocked by BLOCK-B62-MECHANISM-CORRECTION; local
 * results are NOT accepting evidence — the fresh independent GPT review owns
 * the mechanism verdict and W5's oracle owns any painted verdict. Painted A/B
 * is NOT requested and never claimed here.)
 *
 * Corrections vs the BLOCKED handoff (reviewed bytes sha256 497ab779…):
 *  1. WHOLE-PAINT ATOMICITY — the bridge/apply transaction is the COMPLETE
 *     candidate set. Any unsupported family (e.g. massindex), missing
 *     candidate, throw, or merge failure at ANY position leaves ZERO live
 *     mutation; a commit-phase failure rolls back every earlier family
 *     byte/structure-equivalent. Publish (fp/memos/counters/pending) happens
 *     only after the full commit.
 *  2. OVER-BUDGET EVENTUAL FRESH PAINT — budget skips, unsupported-family
 *     skips and merge failures all request exactly ONE coalesced fresh
 *     worker recomputation for the current complete identity; pre-reply
 *     draws cause zero extra posts; the real apply path accepts the fresh
 *     reply and publishes; worker failure retains bounded-retryable state.
 *     No failure memo can suppress eventual freshness (render-version
 *     witnesses + pending-request lifecycle).
 *  3. FULL-STRUCTURE PARITY OR SAFE ASYNC FALLBACK — a 52-row family matrix:
 *     strictly finite-window families must match an independent full-history
 *     worker recomputation with EXACT structure (length/keys/null layout)
 *     and ≤1e-9 values; recursive/seed-dependent families are classified to
 *     the async fresh-worker fallback and are proven to publish NO
 *     approximate main-thread candidate while still converging fresh.
 *  4. KILL = EXACT B61 — with the switch OFF, invalidation/data/TF/params
 *     calls produce ZERO b62 state side effects (no generation creation, no
 *     memo clears, no counters). Steady OFF matches the immutable b61 blob's
 *     object-key/state surface; ON→OFF freezes b62 state; OFF→ON self-heals
 *     with no OFF-time writes.
 *  5. COMPLETE STRICT IDENTITY — positive safe-integer monotonic generation
 *     (no 32-bit coercion, no wrap/reuse, fail-closed at exhaustion), local
 *     data-array replacement observation (same-shape multichart swap), and
 *     a bounded window content fingerprint (in-window middle/volume
 *     mutations) on top of length + t/o/h/l/c/v + dataVersion + TF +
 *     params/active-set.
 *  6. WORKLOAD/MANIFEST TRUTH — cumulative staged-point arithmetic is
 *     recomputed exactly as the product computes it (window × Σ per-family
 *     series count); distributions are measured and recorded; correctness/
 *     cap/liveness assertions are unconditional, timing is env-qualified.
 *
 * PAINTED GREEN IS NEVER CLAIMED HERE.
 *
 * Run:
 *   node --test m19i-b62-exact-tail-red.test.mjs
 *   M19I_B62_EVIDENCE=all node --test m19i-b62-exact-tail-red.test.mjs
 *     → docs/plan3/evidence/W1-B62-EXACT-TAIL-20260724-{red,green,kill}.json
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'docs', 'plan3'))
      && fs.existsSync(path.join(dir, 'chart v 1.4'))
      && fs.existsSync(path.join(dir, 'homepage'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('repo root not found from ' + start);
}
const ROOT = findRepoRoot(__dirname);
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ─── 1) Stable baseline pins ────────────────────────────────────────────────
// b61 = the reviewed baseline at the Q6 integration commit. Git blobs are
// content-addressed: `git cat-file blob <sha1>` either returns exactly the
// pinned bytes or fails — workspace drift cannot alter them. The block's
// immutable b61 pin 62ee0911… is the sha256 of exactly these blob bytes.
const B61_PIN = {
  commit: '2f0ce7831e2aa74cf86e2263f50b5a023ecab932',
  indicatorsBlob: '719811435623e39369a3090326cf41b6342bb8d4',
  indicatorsSha256: '62ee0911dc67b8ca197c036c97fd4db4d8efb78805025873e20f8e1dd9426bef',
  workerBlob: '49abde9d71b8f248acc2ace62b7bee82a4150a73',
  perfBlob: '5d95d96c683430906c537a2cfdb0fca7bf23e155',
};
// The bytes the independent mechanism block reviewed (and that this
// correction supersedes). They were uncommitted and are not claimed here as
// executable RED; this suite binds executable RED only to immutable git blobs
// or current working-tree files hashed per run.
const BLOCKED_TREE_SHA256 = '497ab7794bbd94254a47d5374ce322e4ee4a6fc536ebfbf6ddefcab4562dcd82';
const REJECTED_R3_PIN = {
  indicatorsSha256: 'bbc17f6d9bc75c8f2dfe9574302db5abf916b788f78dee3757500c10af8ea681',
  unavailableGitObject: '9d41c2fae72a42ff02909e347deb863ea1dd267e',
  recoverySource: 'retained exact reverse hunk from the R3->R4 product edit in this session',
};
const CURRENT = {
  indicators: path.join(ROOT, 'homepage', 'public', 'chart', 'modules', 'chart-indicators-full.js'),
  indicatorsV14: path.join(ROOT, 'chart v 1.4', 'chart', 'modules', 'chart-indicators-full.js'),
  worker: path.join(ROOT, 'homepage', 'public', 'chart', 'workers', 'indicator-worker.js'),
  perf: path.join(ROOT, 'homepage', 'public', 'chart', 'modules', 'indicator-performance.js'),
};
const KILL = '__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1';

function gitBlob(blobSha1) {
  return execFileSync('git', ['cat-file', 'blob', blobSha1], {
    cwd: ROOT, maxBuffer: 128 * 1024 * 1024,
  }).toString('utf8');
}

let _b61Sources = null;
function b61Sources() {
  if (_b61Sources) return _b61Sources;
  _b61Sources = {
    label: 'b61-immutable-blob',
    indicators: gitBlob(B61_PIN.indicatorsBlob),
    worker: gitBlob(B61_PIN.workerBlob),
    perf: gitBlob(B61_PIN.perfBlob),
  };
  _b61Sources.hashes = {
    indicatorsSha256: sha256(_b61Sources.indicators),
    workerSha256: sha256(_b61Sources.worker),
    perfSha256: sha256(_b61Sources.perf),
    gitPins: B61_PIN,
  };
  return _b61Sources;
}

let _currentSources = null;
function currentSources() {
  if (_currentSources) return _currentSources;
  _currentSources = {
    label: 'b62-working-tree',
    indicators: fs.readFileSync(CURRENT.indicators, 'utf8'),
    worker: fs.readFileSync(CURRENT.worker, 'utf8'),
    perf: fs.readFileSync(CURRENT.perf, 'utf8'),
  };
  _currentSources.hashes = {
    indicatorsSha256: sha256(_currentSources.indicators),
    indicatorsV14Sha256: sha256(fs.readFileSync(CURRENT.indicatorsV14, 'utf8')),
    workerSha256: sha256(_currentSources.worker),
    perfSha256: sha256(_currentSources.perf),
  };
  return _currentSources;
}

function eolOf(src) {
  return src.includes('\r\n') ? '\r\n' : '\n';
}

function lines(src, arr) {
  return arr.join(eolOf(src)) + eolOf(src);
}

function rejectedR3IndicatorsFromCurrent(src) {
  const pendingExactFreshR4 = lines(src, [
    '            if (_m19iExactTailPaintEnabled()',
    '                && chart._m19iB62PendingFreshFp != null',
    '                && !_m19iB62SyncFamily(ind)) {',
    '                // A B62 paint-time fallback requested exact freshness for this',
    '                // identity. Keep the accepted I-f tail bridge/post path active,',
    '                // but also force the follow-up full async pass that owns exact',
    '                // endpoint publication for recursive/shape-incompatible rows.',
    '                needsFullAsync = true;',
    '            }',
  ]);
  const rejectedR3FallbackClassifier = lines(src, [
    '            if (_m19iExactTailPaintEnabled() && !_m19iB62SyncFamily(ind)) {',
    '                // B62 fallback-classified families (recursive/seed-dependent',
    '                // or shape-incompatible) must not publish a synchronous or',
    '                // windowed-tail approximation. A full CALCULATE_ALL pass owns',
    '                // their independently recomputed fresh endpoint.',
    '                needsFullAsync = true;',
    '                return;',
    '            }',
  ]);
  const keepTailMapR4 = lines(src, [
    '        if (needsFullAsync) chart._m19iCoalesceFullAsync = true;',
    '',
  ]);
  const rejectedR3TailMapDeletion = lines(src, [
    '        if (needsFullAsync) chart._m19iCoalesceFullAsync = true;',
    '        if (_m19iExactTailPaintEnabled() && needsFullAsync) {',
    '            // Whole-family fallback: do not tail-post or bridge only the',
    '            // subset that happened to be sync-classified.',
    '            Object.keys(indicators).forEach(function(id) { delete indicators[id]; });',
    '        }',
    '',
  ]);
  if (!src.includes(pendingExactFreshR4) || !src.includes(keepTailMapR4)) {
    throw new Error('R4 source does not contain the retained reverse hunks for rejected R3 recovery');
  }
  return src
    .replace(pendingExactFreshR4, rejectedR3FallbackClassifier)
    .replace(keepTailMapR4, rejectedR3TailMapDeletion);
}

let _rejectedR3Sources = null;
function rejectedR3Sources() {
  if (_rejectedR3Sources) return _rejectedR3Sources;
  const cur = currentSources();
  const indicators = rejectedR3IndicatorsFromCurrent(cur.indicators);
  const indicatorsSha256 = sha256(indicators);
  if (indicatorsSha256 !== REJECTED_R3_PIN.indicatorsSha256) {
    throw new Error('rejected R3 recovery hash mismatch: ' + indicatorsSha256);
  }
  _rejectedR3Sources = {
    label: 'rejected-r3-recovered-exact',
    indicators,
    worker: cur.worker,
    perf: cur.perf,
    hashes: {
      indicatorsSha256,
      workerSha256: cur.hashes.workerSha256,
      perfSha256: cur.hashes.perfSha256,
      recovery: REJECTED_R3_PIN,
    },
  };
  return _rejectedR3Sources;
}

// ─── 2) Real module + real in-process worker ────────────────────────────────
/**
 * FakeWorker replaces ONLY the transport: it executes the REAL
 * indicator-worker.js source in-process and lets a test hold/release replies
 * to create true delayed-worker interleavings. Compute happens at post time
 * from the posted payload (same temporal semantics as a real worker: later
 * chart.data mutation cannot affect an already-posted computation).
 */
function makeWorkerClass(workerSrc, registry) {
  return class FakeWorker {
    constructor() {
      this.posts = [];
      this.held = [];
      this.holdReplies = registry.holdByDefault === true;
      this.syncDeliver = false;
      this.onmessage = null;
      this.onerror = null;
      const selfStub = { postMessage: (m) => this._reply(m), onmessage: null };
      // eslint-disable-next-line no-new-func
      new Function('self', workerSrc)(selfStub);
      this._self = selfStub;
      registry.instances.push(this);
    }
    postMessage(msg) {
      this.posts.push(msg);
      this._self.onmessage({ data: msg });
    }
    _reply(msg) {
      if (this.holdReplies) { this.held.push(msg); return; }
      if (this.syncDeliver) {
        if (this.onmessage) this.onmessage({ data: msg });
        return;
      }
      queueMicrotask(() => { if (this.onmessage) this.onmessage({ data: msg }); });
    }
    releaseHeld() {
      const h = this.held.splice(0);
      for (const m of h) { if (this.onmessage) this.onmessage({ data: m }); }
    }
  };
}

function buildModule(sources, { killSwitch = false } = {}) {
  const registry = { instances: [], holdByDefault: false };
  const win = { Chart: function Chart() {} };
  if (killSwitch) win[KILL] = true;
  const FakeWorker = makeWorkerClass(sources.worker, registry);
  // eslint-disable-next-line no-new-func
  new Function('window', 'Worker', sources.perf)(win, FakeWorker);
  // eslint-disable-next-line no-new-func
  new Function('window', 'Worker', sources.indicators)(win, FakeWorker);
  if (win.INDICATORS_MODULE_LOADED !== true) {
    throw new Error('product module did not attach (' + sources.label + ')');
  }
  return { win, registry, FakeWorker, sources };
}

function totalPosts(module) {
  return module.registry.instances.reduce((s, w) => s + w.posts.length, 0);
}

function makeChart(module, { bars, active, realScheduler = false }) {
  const chart = Object.create(module.win.Chart.prototype);
  chart.data = bars;
  chart.currentTimeframe = '1m';
  chart.dataVersion = 1;
  chart.indicators = { active, data: {} };
  // DOM/render externals stubbed as spies (the product guards each with a
  // typeof check); everything else is the real prototype.
  chart.updateOHLCIndicators = () => {};
  chart._renders = 0;
  chart.scheduleRender = () => { chart._renders++; };
  chart._recalcRuns = [];
  if (!realScheduler) {
    chart._runIndicatorRecalc = (opts) => { chart._recalcRuns.push(opts || {}); };
  }
  return chart;
}

/** Seed full-length series through the REAL worker code (full-range tail). */
function seedIndicatorData(module, chart) {
  const w = new module.FakeWorker();
  w.syncDeliver = true;
  w.holdReplies = false;
  let seeded = null;
  w.onmessage = (e) => { seeded = e.data; };
  const map = {};
  chart.indicators.active.forEach((ind) => {
    map[ind.id] = { type: String(ind.type).toLowerCase(), params: ind.params || {} };
  });
  w.postMessage({
    type: 'CALCULATE_TAIL',
    id: -1,
    payload: {
      bars: chart.data.slice(0),
      barsPacked: null,
      tailStart: 0,
      fromIndex: 0,
      lookback: 0,
      totalLength: chart.data.length,
      indicators: map,
    },
  });
  if (!seeded || seeded.type !== 'ALL_RESULTS') throw new Error('seed failed');
  Object.keys(seeded.results).forEach((id) => {
    chart.indicators.data[id] = seeded.results[id];
  });
}

/** Independent full-history worker recomputation of the CURRENT bars. */
function fullHistoryReference(module, chart, id) {
  const ind = chart.indicators.active.find((a) => a.id === id);
  const w = new module.FakeWorker();
  w.syncDeliver = true;
  w.holdReplies = false;
  let out = null;
  w.onmessage = (e) => { out = e.data; };
  w.postMessage({
    type: 'CALCULATE_TAIL',
    id: -2,
    payload: {
      bars: chart.data.slice(0),
      barsPacked: null,
      tailStart: 0,
      fromIndex: 0,
      lookback: 0,
      totalLength: chart.data.length,
      indicators: { [id]: { type: String(ind.type).toLowerCase(), params: ind.params || {} } },
    },
  });
  if (!out || out.type !== 'ALL_RESULTS') throw new Error('reference failed');
  return out.results[id];
}

function makeBars(n) {
  const bars = new Array(n);
  let px = 100;
  for (let i = 0; i < n; i++) {
    px += Math.sin(i * 0.37) * 0.6 + Math.cos(i * 0.11) * 0.3;
    const o = px;
    const c = px + Math.sin(i * 0.53) * 0.4;
    bars[i] = {
      t: 1700000000000 + i * 60000,
      o,
      h: Math.max(o, c) + 0.2,
      l: Math.min(o, c) - 0.2,
      c,
      v: 1000 + (i % 7) * 10,
    };
  }
  return bars;
}

function lastFinite(arr) {
  if (!Array.isArray(arr)) return null;
  for (let i = arr.length - 1; i >= 0; i--) {
    const v = arr[i];
    if (v != null && Number.isFinite(v)) return { idx: i, val: v };
  }
  return null;
}

/** Generic tip extraction: arrays and object packs of arrays. */
function tipsOf(value) {
  if (Array.isArray(value)) {
    const t = lastFinite(value);
    return t ? { '': t.val } : {};
  }
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach((k) => {
      if (Array.isArray(value[k])) {
        const t = lastFinite(value[k]);
        if (t) out[k] = t.val;
      }
    });
    return out;
  }
  return {};
}

function tipsClose(a, b, eps) {
  const ka = Object.keys(a); const kb = Object.keys(b);
  if (ka.length !== kb.length || ka.length === 0) return false;
  return ka.every((k) => typeof b[k] === 'number' && Math.abs(a[k] - b[k]) <= eps);
}

/**
 * FULL-STRUCTURE comparator: exact array lengths, exact null/NaN layout,
 * exact object key sets, ≤eps numeric deltas. Returns the first mismatch
 * (path + detail) or null when structures are equivalent.
 */
function fullStructureDiff(a, b, eps, p = '$') {
  const nullish = (v) => v === null || v === undefined;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return { path: p, why: 'array/non-array' };
    if (a.length !== b.length) return { path: p, why: `length ${a.length}≠${b.length}` };
    for (let i = 0; i < a.length; i++) {
      const av = a[i]; const bv = b[i];
      if (nullish(av) && nullish(bv)) continue;
      if (typeof av === 'number' && typeof bv === 'number') {
        if (Number.isNaN(av) && Number.isNaN(bv)) continue;
        if (Number.isFinite(av) && Number.isFinite(bv)) {
          if (Math.abs(av - bv) > eps) return { path: `${p}[${i}]`, why: `|Δ|=${Math.abs(av - bv)}` };
          continue;
        }
        if (av === bv) continue;
        return { path: `${p}[${i}]`, why: `${av}≠${bv}` };
      }
      if (typeof av === 'object' && typeof bv === 'object' && av && bv) {
        const d = fullStructureDiff(av, bv, eps, `${p}[${i}]`);
        if (d) return d;
        continue;
      }
      if (av !== bv) return { path: `${p}[${i}]`, why: `${String(av)}≠${String(bv)}` };
    }
    return null;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a).sort(); const kb = Object.keys(b).sort();
    if (ka.join(',') !== kb.join(',')) return { path: p, why: `keys [${ka}]≠[${kb}]` };
    for (const k of ka) {
      const d = fullStructureDiff(a[k], b[k], eps, `${p}.${k}`);
      if (d) return d;
    }
    return null;
  }
  if (nullish(a) && nullish(b)) return null;
  if (typeof a === 'number' && typeof b === 'number'
    && Number.isFinite(a) && Number.isFinite(b)) {
    return Math.abs(a - b) <= eps ? null : { path: p, why: `|Δ|=${Math.abs(a - b)}` };
  }
  return a === b ? null : { path: p, why: `${String(a)}≠${String(b)}` };
}

const drain = () => new Promise((r) => setTimeout(r, 0));

// Sync (strictly finite-window) transaction mix used for real-integration
// cells: array family + object packs + a volume-dependent family.
const SYNC_MIX = [
  { id: 'wma1', type: 'wma', params: { period: 14 }, overlay: true },
  { id: 'mfi1', type: 'mfi', params: { period: 14 } },
  { id: 'bb1', type: 'bb', params: { period: 20, stdDev: 2 } },
];

/**
 * The core delayed-worker choreography through REAL product paths:
 *   1. owning pass posts CALCULATE_TAIL at forming state A (reply HELD),
 *   2. a forming mutation happens in place (state B),
 *   3. a backpressured pass sets ONE boolean coalesce and (for a sync-family
 *      mix) synchronously commits fresh tips via the real I-f bridge,
 *   4. optional preRelease (invalidation / replacement injection),
 *   5. the held (A-era) reply is released into the real onmessage → apply.
 */
async function delayedStaleScenario(module, {
  active,
  mutate,
  preRelease,
  prePost,
  n = 300,
} = {}) {
  const N = n;
  const bars = makeBars(N);
  const acts = (active || SYNC_MIX).map((a) => ({ ...a, params: { ...a.params } }));
  const chart = makeChart(module, { bars, active: acts });
  seedIndicatorData(module, chart);

  module.registry.holdByDefault = true;
  module.registry.instances.forEach((w) => { w.holdReplies = true; });

  if (prePost) prePost(chart, bars);
  const postsBefore = totalPosts(module);
  chart.recalculateIndicatorsIncremental(N); // REAL post path (pass 1, state A)
  const fw = module.registry.instances[module.registry.instances.length - 1];
  const postsAfterP1 = totalPosts(module);

  (mutate || ((b) => {
    const last = b[N - 1];
    last.c += 1.5;
    last.h = Math.max(last.h, last.c);
  }))(bars);

  chart.recalculateIndicatorsIncremental(N); // backpressured coherent pass (state B)
  const postsAfterP2 = totalPosts(module);

  const freshTips = {};
  chart.indicators.active.forEach((ind) => {
    freshTips[ind.id] = tipsOf(chart.indicators.data[ind.id]);
  });
  const heldReply = fw.held[fw.held.length - 1] || null;

  if (preRelease) preRelease(chart, bars);
  fw.releaseHeld();
  await drain();
  await drain();

  module.registry.holdByDefault = false;
  return {
    chart, fw, bars, N, freshTips, heldReply,
    postsP1: postsAfterP1 - postsBefore,
    postsP2: postsAfterP2 - postsAfterP1,
  };
}

/** Real drawIndicatorsOptimized cache surface (spied blit vs redraw). */
function stubDrawSurface(chart) {
  chart._isInteractionFastRender = () => false;
  chart._hasHiddenOverlayIndicator = () => false;
  chart._syncIndicatorLayerCanvasSize = () => ({ dpr: 1, physW: 800, physH: 400, cssW: 800, cssH: 400 });
  chart._indLayerCtx = { clearRect: () => {} };
  chart._indLayerCanvas = { width: 800, height: 400 };
  chart._blits = 0;
  chart._redraws = 0;
  chart.ctx = {
    imageSmoothingEnabled: false,
    drawImage: () => { chart._blits++; },
  };
  chart.drawIndicators = () => { chart._redraws++; };
  chart.w = 800; chart.h = 400;
  chart.yDomain = [90, 120];
  chart.candleWidth = 5; chart.offsetX = 0;
  chart.priceZoom = 1; chart.priceOffset = 0;
  chart.visibleStartIndex = 0; chart.visibleEndIndex = 100;
}

// ─── Evidence collection ────────────────────────────────────────────────────
const results = [];
function record(id, cell, pass, detail) {
  results.push({ id, cell, pass, detail });
}

// ═══ S0 — provenance / anti-contradiction guard ═════════════════════════════

test('S0 stable baseline: immutable b61 blob equals the block pin 62ee0911…; current tree is distinct, mirrored and hashed', () => {
  const b61 = b61Sources();
  const cur = currentSources();
  const r3 = rejectedR3Sources();
  const blobRoundTrip = execFileSync('git', ['hash-object', '--stdin'], {
    cwd: ROOT, input: b61.indicators, maxBuffer: 128 * 1024 * 1024,
  }).toString('utf8').trim();
  assert.equal(blobRoundTrip, B61_PIN.indicatorsBlob, 'b61 blob bytes match the pinned SHA-1');
  assert.equal(b61.hashes.indicatorsSha256, B61_PIN.indicatorsSha256,
    'b61 blob sha256 equals the block-cited immutable pin 62ee0911…');
  assert.ok(!b61.indicators.includes(KILL), 'b61 blob predates the b62 switch');
  assert.ok(cur.indicators.includes(KILL), 'current tree carries the b62 switch');
  assert.notEqual(b61.hashes.indicatorsSha256, cur.hashes.indicatorsSha256,
    'b61 and b62 cells run DIFFERENT products — claims cannot collapse after drift');
  assert.notEqual(cur.hashes.indicatorsSha256, BLOCKED_TREE_SHA256,
    'the corrected tree supersedes the blocked bytes 497ab779…');
  assert.equal(r3.hashes.indicatorsSha256, REJECTED_R3_PIN.indicatorsSha256,
    'rejected R3 recovered bytes match the exact expected product pin bbc17f6d…');
  assert.notEqual(r3.hashes.indicatorsSha256, cur.hashes.indicatorsSha256,
    'rejected R3 and current R4 are distinct products');
  assert.equal(cur.hashes.indicatorsSha256, cur.hashes.indicatorsV14Sha256,
    'dual trees byte-identical');
  record('S0', 'provenance', true, {
    b61: b61.hashes,
    current: cur.hashes,
    rejectedR3: r3.hashes,
    blockedTreeSha256: BLOCKED_TREE_SHA256,
    blockedTreeNote: 'not claimed executable by this suite; retained only as the superseded review hash',
  });
});

function r3PoMix() {
  return [
    { id: 'r3-sma', type: 'sma', params: { period: 20 } },
    { id: 'r3-ema', type: 'ema', params: { period: 50 } },
    { id: 'r3-wma', type: 'wma', params: { period: 30 } },
    { id: 'r3-bb', type: 'bollinger', params: { period: 20, stdDev: 2 } },
    { id: 'r3-rsi', type: 'rsi', params: { period: 14 } },
    { id: 'r3-macd', type: 'macd', params: { fast: 12, slow: 26, signal: 9 } },
    { id: 'r3-stoch', type: 'stoch', params: { period: 14, smoothK: 3, smoothD: 3 } },
  ];
}

function r3SeriesLen(type, pack) {
  if (!pack) return 0;
  if (Array.isArray(pack)) return pack.length;
  const t = String(type || '').toLowerCase();
  let arr = null;
  if (t === 'rsi') arr = pack.rsi;
  else if (t === 'macd') arr = pack.macd;
  else if (t === 'stoch' || t === 'stochastic') arr = pack.k;
  else if (t === 'bollinger' || t === 'bb') arr = pack.middle || pack.upper;
  else arr = pack.line || pack.ma || pack.upper || pack.middle;
  return Array.isArray(arr) ? arr.length : 0;
}

function r3Tip(pack) {
  const arr = Array.isArray(pack) ? pack : (pack && (pack.line || pack.ma || pack.rsi || pack.macd));
  if (!Array.isArray(arr)) return null;
  const t = lastFinite(arr);
  return t ? t.val : null;
}

function makeReplayChart(module, active, bars) {
  const chart = makeChart(module, { bars, active });
  chart.replaySystem = { isActive: true, isPlaying: true };
  return chart;
}

test('S0b rejected R3 executable RED: exact recovered bbc17f6d bytes reproduce all ten R4 blocker failures', async () => {
  const module = buildModule(rejectedR3Sources());
  const failures = [];
  const withHeldWorkers = () => {
    module.registry.holdByDefault = true;
    module.registry.instances.forEach((w) => { w.holdReplies = true; });
  };
  const resetWorkers = () => {
    module.registry.holdByDefault = false;
    module.registry.instances.forEach((w) => { w.holdReplies = false; });
  };
  const countTailPosts = () => module.registry.instances
    .reduce((s, w) => s + w.posts.filter((p) => p.type === 'CALCULATE_TAIL').length, 0);

  withHeldWorkers();
  let bars = makeBars(3000, { seed: 7, base: 5000 });
  let active = r3PoMix();
  let chart = makeReplayChart(module, active, bars.slice(0, 2999));
  chart.recalculateIndicators();
  chart.data = bars.slice(0, 3000);
  chart.scheduleReplayIndicatorRecalc(true);
  failures.push({ id: 1, name: 'coherent tick SMA length', actual: r3SeriesLen('sma', chart.indicators.data['r3-sma']), expected: 3000 });

  bars = makeBars(3000, { seed: 17, base: 5000 });
  active = r3PoMix();
  chart = makeReplayChart(module, active, bars.slice(0, 2999));
  chart.recalculateIndicators();
  chart.data = bars.slice(0, 3000);
  chart.scheduleReplayIndicatorRecalc(true);
  failures.push({ id: 2, name: 'bridge-only commit SMA length', actual: r3SeriesLen('sma', chart.indicators.data['r3-sma']), expected: 3000 });

  bars = makeBars(3010, { seed: 27, base: 5000 });
  active = r3PoMix();
  chart = makeReplayChart(module, active, bars.slice(0, 3000));
  chart.recalculateIndicators();
  chart.data = bars.slice(0, 3001);
  chart.scheduleReplayIndicatorRecalc(true);
  failures.push({ id: 3, name: 'wedged worker tick SMA length', actual: r3SeriesLen('sma', chart.indicators.data['r3-sma']), expected: 3001 });

  resetWorkers();
  const priorRaf = global.requestAnimationFrame;
  const priorCancel = global.cancelAnimationFrame;
  global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  global.cancelAnimationFrame = (h) => clearTimeout(h);
  try {
    withHeldWorkers();
    module.win.__TALARIA_DISABLE_M19I_FRAME_COHERENT_V1 = 1;
    bars = makeBars(3000, { seed: 37, base: 5000 });
    active = r3PoMix();
    chart = makeReplayChart(module, active, bars.slice(0, 2999));
    chart.recalculateIndicators();
    chart.data = bars.slice(0, 3000);
    chart.scheduleReplayIndicatorRecalc(true);
    await drain(); await drain();
    failures.push({ id: 4, name: 'I-f OFF async catch-up SMA length', actual: r3SeriesLen('sma', chart.indicators.data['r3-sma']), expected: 3000 });
    delete module.win.__TALARIA_DISABLE_M19I_FRAME_COHERENT_V1;
    resetWorkers();
  } finally {
    global.requestAnimationFrame = priorRaf;
    global.cancelAnimationFrame = priorCancel;
  }

  withHeldWorkers();
  bars = makeBars(3000, { seed: 47, base: 5000 });
  const other = makeBars(1200, { seed: 99, base: 7000 });
  active = r3PoMix();
  chart = makeReplayChart(module, active, bars.slice(0, 2999));
  chart.recalculateIndicators();
  chart.data = bars.slice(0, 3000);
  chart.scheduleReplayIndicatorRecalc(true);
  chart.currentTimeframe = '5m';
  chart.data = other;
  chart.dataVersion++;
  chart.replaySystem.isPlaying = false;
  chart.scheduleReplayIndicatorRecalc(false);
  await drain(); await drain();
  failures.push({ id: 5, name: 'TF/data replacement busy release', actual: chart._indicatorWorkerBusy, expected: false });

  bars = makeBars(3000, { seed: 77, base: 5000 });
  active = r3PoMix();
  chart = makeReplayChart(module, active, bars.slice(0, 2999));
  chart.recalculateIndicators();
  chart.data = bars.slice(0, 3000);
  chart.scheduleReplayIndicatorRecalc(true);
  failures.push({ id: 6, name: 'ordered sequence committed snapshot', actual: chart._indCalcSnapshot && chart._indCalcSnapshot.barCount, expected: 3000 });

  bars = makeBars(200, { seed: 97, base: 5000 });
  active = [
    { id: 'r3-sma', type: 'sma', params: { period: 20 } },
    { id: 'r3-ema', type: 'ema', params: { period: 20 } },
    { id: 'r3-wma', type: 'wma', params: { period: 20 } },
    { id: 'r3-dema', type: 'dema', params: { period: 20 } },
    { id: 'r3-tema', type: 'tema', params: { period: 20 } },
  ];
  chart = makeReplayChart(module, active, bars.map((b) => ({ ...b })));
  chart.recalculateIndicators();
  chart.scheduleReplayIndicatorRecalc(true);
  const beforeTip = r3Tip(chart.indicators.data['r3-sma']);
  chart.replaySystem.animatingCandle = { t: bars[bars.length - 1].t };
  chart.replaySystem.tickProgress = 12;
  const last = chart.data[chart.data.length - 1];
  last.c += 25;
  last.h = Math.max(last.h, last.c);
  chart.scheduleReplayIndicatorRecalc(true);
  failures.push({ id: 7, name: 'forming OHLC SMA tip mutation', actual: r3Tip(chart.indicators.data['r3-sma']), expected: 'not ' + beforeTip });

  bars = makeBars(2000, { seed: 87, base: 5000 });
  active = [{ id: 'r3-sma', type: 'sma', params: { period: 20 } }, { id: 'r3-obv', type: 'obv', params: {} }];
  chart = makeReplayChart(module, active, bars.slice(0, 1999));
  chart.recalculateIndicators();
  chart.data = bars.slice(0, 2000);
  chart.scheduleReplayIndicatorRecalc(true);
  failures.push({ id: 8, name: 'cumulative fallback bridged SMA length', actual: r3SeriesLen('sma', chart.indicators.data['r3-sma']), expected: 2000 });

  const beforePosts = countTailPosts();
  bars = makeBars(3000, { seed: 101, base: 5000 });
  active = [
    { id: 'r3-sma', type: 'sma', params: { period: 20 } },
    { id: 'r3-ema', type: 'ema', params: { period: 50 } },
    { id: 'r3-rsi', type: 'rsi', params: { period: 14 } },
  ];
  chart = makeChart(module, { bars: bars.slice(0, 2999), active });
  chart.recalculateIndicators();
  chart.data = bars.slice(0, 3000);
  chart.recalculateIndicatorsIncremental(2999);
  const afterPosts = countTailPosts();
  failures.push({ id: 9, name: 'incremental tail post count', actual: afterPosts - beforePosts, expected: 1 });

  bars = makeBars(3000, { seed: 121, base: 5000 });
  active = [
    { id: 'r3-st', type: 'supertrend', params: { period: 10, multiplier: 3 } },
    { id: 'r3-dema', type: 'dema', params: { period: 20 } },
    { id: 'r3-sma', type: 'sma', params: { period: 20 } },
  ];
  chart = makeChart(module, { bars: bars.slice(0, 2999), active });
  chart.recalculateIndicators();
  chart.data = bars.slice(0, 3000);
  const beforeIcPosts = countTailPosts();
  chart.recalculateIndicatorsIncremental(2999);
  const icPosts = module.registry.instances
    .flatMap((w) => w.posts)
    .slice(beforeIcPosts)
    .filter((p) => p.type === 'CALCULATE_TAIL');
  failures.push({
    id: 10,
    name: 'I-c ON tail post carries dema',
    actual: icPosts[0] && icPosts[0].payload && Object.keys(icPosts[0].payload.indicators || {}).join(','),
    expected: 'contains r3-dema',
  });

  const causalFailures = failures.filter((f) => {
    if (f.id === 7) return f.actual === beforeTip;
    if (f.id === 10) return !String(f.actual || '').includes('r3-dema');
    return f.actual !== f.expected;
  });
  record('S0b', 'rejected-r3-red', causalFailures.length === 10, {
    rejectedR3: rejectedR3Sources().hashes,
    failures,
    causalFailureCount: causalFailures.length,
  });
  assert.equal(causalFailures.length, 10,
    'exact rejected R3 bytes must reproduce all ten causal R4 blocker failures: ' + JSON.stringify(failures));
});

// ═══ S1 — REAL integration, fix ON (current product) ════════════════════════

test('S1a ON sync mix: delayed stale reply REJECTED through real apply; fresher bridged tips preserved; one coalesce; no extra posts', async () => {
  const module = buildModule(currentSources());
  const sc = await delayedStaleScenario(module);
  const { chart } = sc;
  const tipsNow = tipsOf(chart.indicators.data.wma1);
  const ok = tipsClose(tipsNow, sc.freshTips.wma1, 1e-12)
    && chart._m19iB62Stats && chart._m19iB62Stats.staleTailRejects === 1
    && chart._indicatorWorkerBusy === false
    && chart._indicatorWorkerCoalesce === false          // consumed exactly once
    && chart._recalcRuns.length === 1                    // ONE scheduler rerun
    && chart._recalcRuns[0].force === false
    && sc.postsP1 === 1 && sc.postsP2 === 0;             // no extra worker posts
  record('S1a', 'green-on', ok, {
    product: currentSources().hashes.indicatorsSha256,
    tipsNow, freshTips: sc.freshTips.wma1,
    staleTailRejects: chart._m19iB62Stats ? chart._m19iB62Stats.staleTailRejects : null,
    recalcRuns: chart._recalcRuns,
    postsP1: sc.postsP1, postsP2: sc.postsP2,
  });
  assert.ok(ok, 'real-path stale rejection with single boolean coalesce and zero extra posts');
});

test('S1b ON: fresh reply (no interleaved mutation) ACCEPTED through real apply; success published with witness', async () => {
  const module = buildModule(currentSources());
  const sc = await delayedStaleScenario(module, { mutate: () => {} });
  const { chart } = sc;
  const noRejects = chart._m19iB62Stats == null || chart._m19iB62Stats.staleTailRejects === 0;
  const tipsNow = tipsOf(chart.indicators.data.wma1);
  const accepted = tipsClose(tipsNow, sc.freshTips.wma1, 1e-9);
  const published = chart._m19iExactTailLastFp === chart._m19iExactTailPaintFp()
    && chart._m19iExactTailLastRv === (chart._indicatorRenderVersion || 0)
    && chart._m19iB62PendingFreshFp == null;
  record('S1b', 'green-on', noRejects && accepted && published, {
    tipsNow, freshTips: sc.freshTips.wma1, published,
  });
  assert.ok(noRejects && accepted && published,
    'fresh reply commits atomically and publishes the identity with its render-version witness');
});

test('S1c ON sync family: real draw cache boundary — forming change forces REDRAW with the bridged tip, never a stale blit', async () => {
  const module = buildModule(currentSources());
  const N = 300;
  const bars = makeBars(N);
  const chart = makeChart(module, {
    bars,
    active: [{ id: 'wma1', type: 'wma', params: { period: 14 }, overlay: true }],
  });
  seedIndicatorData(module, chart);
  stubDrawSurface(chart);
  chart.drawIndicatorsOptimized();               // paint 1: redraw + cache key
  chart.drawIndicatorsOptimized();               // paint 2: unchanged → blit
  const blitsAfter2 = chart._blits;
  const last = bars[N - 1];
  last.c += 2.0; last.h = Math.max(last.h, last.c); // forming change, in place
  chart.drawIndicatorsOptimized();               // paint 3: hook must invalidate
  const ref = fullHistoryReference(module, chart, 'wma1');
  const diff = fullStructureDiff(chart.indicators.data.wma1, ref, 1e-9);
  const ok = chart._redraws === 2                 // paint 1 + paint 3 redraw
    && blitsAfter2 >= 1                           // paint 2 blitted (cache worked)
    && chart._m19iB62Stats.exactTailPaints === 2  // paint 1 (first fp) + paint 3
    && chart._m19iExactTailLastFp === chart._m19iExactTailPaintFp()
    && diff == null;                              // painted tip == full-history exact
  record('S1c', 'green-on', ok, {
    redraws: chart._redraws, blits: chart._blits,
    exactTailPaints: chart._m19iB62Stats ? chart._m19iB62Stats.exactTailPaints : null,
    fullStructureVsFullHistory: diff,
  });
  assert.ok(ok, 'the same paint that moves the price redraws the layer with a full-history-exact bridged tip');
});

test('S1d ON fallback family (tema): draw-time budget/classification skip → exactly ONE real worker post; pre-reply draws add zero posts; held fresh reply applies and paints', async () => {
  const module = buildModule(currentSources());
  const N = 300;
  const bars = makeBars(N);
  const chart = makeChart(module, {
    bars,
    active: [{ id: 'tema1', type: 'tema', params: { period: 20 }, overlay: true }],
    realScheduler: true,                          // EnsureFresh drives the REAL pipeline
  });
  seedIndicatorData(module, chart);
  stubDrawSurface(chart);
  module.registry.holdByDefault = true;
  module.registry.instances.forEach((w) => { w.holdReplies = true; });

  const last = bars[N - 1];
  last.c += 2.0; last.h = Math.max(last.h, last.c);
  const posts0 = totalPosts(module);
  chart.drawIndicatorsOptimized();               // draw 1: classify-skip + ONE fresh request
  const posts1 = totalPosts(module);
  chart.drawIndicatorsOptimized();               // draws 2..4 pre-reply: no post storm
  chart.drawIndicatorsOptimized();
  chart.drawIndicatorsOptimized();
  const posts2 = totalPosts(module);
  const mutated = chart.indicators.data.tema1 !== undefined
    && lastFinite(chart.indicators.data.tema1);
  const staleTipBefore = mutated ? mutated.val : null;

  const fw = module.registry.instances[module.registry.instances.length - 1];
  fw.releaseHeld();
  await drain(); await drain();
  module.registry.holdByDefault = false;

  const freshWorker = fullHistoryReference(module, chart, 'tema1');
  const tipNow = lastFinite(chart.indicators.data.tema1);
  const tipFresh = lastFinite(freshWorker);
  // The committed tail is the worker's windowed tail (production authority);
  // vs full-history the recursive seed deviation is why this family is
  // fallback-classified — the ACCEPTANCE contract is: current-token worker
  // result committed, stale endpoint gone.
  const heldTail = fw.posts.length ? true : false;
  const ok = posts1 - posts0 === 1
    && posts2 === posts1
    && chart._m19iB62Stats.exactTailPaints === 0            // never bridged synchronously
    && chart._m19iB62Stats.freshAsyncRequests === 1
    && tipNow && Math.abs(tipNow.val - staleTipBefore) > 1e-9  // stale endpoint replaced
    && chart._m19iExactTailLastFp === chart._m19iExactTailPaintFp()
    && chart._m19iB62PendingFreshFp == null
    && chart._renders >= 1;                                  // apply scheduled a repaint
  record('S1d', 'green-on', ok, {
    posts: { draw1: posts1 - posts0, preReplyDraws: posts2 - posts1 },
    staleTipBefore, tipNow: tipNow && tipNow.val, tipFullHistory: tipFresh && tipFresh.val,
    freshAsyncRequests: chart._m19iB62Stats.freshAsyncRequests,
    heldWorkerUsed: heldTail,
  });
  assert.ok(ok, 'fallback family: one coalesced fresh recompute, zero post storm, eventual fresh paint');
});

test('S1e ON: worker/post FAILURE retains bounded-retryable state — next draw re-requests and converges fresh', async () => {
  const module = buildModule(currentSources());
  const N = 300;
  const bars = makeBars(N);
  const chart = makeChart(module, {
    bars,
    active: [{ id: 'tema1', type: 'tema', params: { period: 20 }, overlay: true }],
    realScheduler: true,
  });
  seedIndicatorData(module, chart);
  stubDrawSurface(chart);
  // Force singleton worker creation with a normal pass first.
  chart.recalculateIndicatorsIncremental(N);
  await drain(); await drain();
  const fw = module.registry.instances[module.registry.instances.length - 1];

  // Inject post failure at the REAL transport boundary (no pipeline spies —
  // the fresh request rides the real scheduler → recalculateIndicatorsAsync
  // → CALCULATE_ALL post, and THAT post throws).
  const realPost = fw.postMessage.bind(fw);
  let failedPosts = 0;
  fw.postMessage = () => { failedPosts++; throw new Error('injected worker post failure'); };

  const last = bars[N - 1];
  last.c += 2.0; last.h = Math.max(last.h, last.c);
  const postsBefore = fw.posts.length;
  chart.drawIndicatorsOptimized();               // skip + fresh request → post THROWS
  await drain(); await drain();
  const retryable = chart._m19iB62PendingFreshFp == null   // memo retired, not stuck
    && chart._indicatorWorkerBusy === false;               // no frozen busy flag

  // Heal the transport; a later draw must retry and converge.
  fw.postMessage = realPost;
  fw.holdReplies = true;
  chart.drawIndicatorsOptimized();               // re-request (bounded retry)
  await drain();
  const postedAgain = fw.held.length >= 1 || fw.posts.length > postsBefore;
  fw.releaseHeld();
  await drain(); await drain();
  const tipNow = lastFinite(chart.indicators.data.tema1);
  const converged = chart._m19iExactTailLastFp === chart._m19iExactTailPaintFp();
  const ok = failedPosts >= 1 && retryable && postedAgain && converged && tipNow != null;
  record('S1e', 'green-on', ok, { failedPosts, retryable, postedAgain, converged });
  assert.ok(ok, 'worker failure → bounded retryable state → retry → fresh convergence (never frozen, never stale-accepting)');
});

test('S1f ON: rapid identity change pre-reply — stale A rejected, B converges via the real pipeline, no post storm', async () => {
  const module = buildModule(currentSources());
  const N = 300;
  const bars = makeBars(N);
  const chart = makeChart(module, {
    bars,
    active: [{ id: 'tema1', type: 'tema', params: { period: 20 }, overlay: true }],
    realScheduler: true,
  });
  seedIndicatorData(module, chart);
  stubDrawSurface(chart);
  module.registry.holdByDefault = true;
  module.registry.instances.forEach((w) => { w.holdReplies = true; });

  const last = bars[N - 1];
  last.c += 1.0; last.h = Math.max(last.h, last.c);       // identity A
  chart.drawIndicatorsOptimized();                        // request A (held)
  last.c += 1.0; last.h = Math.max(last.h, last.c);       // identity B pre-reply
  chart.drawIndicatorsOptimized();                        // busy → coalesce only
  chart.drawIndicatorsOptimized();
  const fw = module.registry.instances[module.registry.instances.length - 1];
  const postsBeforeRelease = totalPosts(module);
  // Independent A-era reference BEFORE release: if the stale A reply were
  // accepted, the tip would land on this value instead of the B-era one.
  const aEraBars = bars.map((b) => ({ ...b }));
  aEraBars[N - 1].c -= 1.0;                               // reconstruct identity A close
  fw.releaseHeld();                                       // stale A-era reply
  await drain(); await drain();
  fw.releaseHeld();                                       // whatever the rerun posted
  await drain(); await drain();
  module.registry.holdByDefault = false;

  // Pipeline post count BEFORE reference recomputes (those spin their own
  // registry workers and must not pollute the storm bound).
  const postsAfterPipeline = totalPosts(module);
  // The fresh request rode the FULL pipeline (CALCULATE_ALL), whose pre-apply
  // token guard (dataVersion/TF/last-bar fp) rejects the A-era reply before
  // _applyIndicatorWorkerResults — so the b62 tail counter stays untouched
  // and the PROOF of rejection is the outcome: the painted tip is B-era.
  const tipNow = lastFinite(chart.indicators.data.tema1);
  const freshRef = fullHistoryReference(module, chart, 'tema1');
  const tipRef = lastFinite(freshRef);
  const staleARef = fullHistoryReference(module, { ...chart, data: aEraBars, indicators: chart.indicators }, 'tema1');
  const tipStaleA = lastFinite(staleARef);
  const staleNotPainted = tipNow && tipStaleA && Math.abs(tipNow.val - tipStaleA.val) > 1e-9;
  const publishedCurrent = chart._m19iExactTailLastFp === chart._m19iExactTailPaintFp();
  const ok = staleNotPainted
    && publishedCurrent
    && postsAfterPipeline <= postsBeforeRelease + 2       // bounded, no storm
    && tipNow && tipRef && Math.abs(tipNow.val - tipRef.val) < 1e-6; // B-era data painted
  record('S1f', 'green-on', ok, {
    posts: postsAfterPipeline, tipNow: tipNow && tipNow.val, tipRef: tipRef && tipRef.val,
    tipStaleA: tipStaleA && tipStaleA.val, staleNotPainted, publishedCurrent,
    tailRejects: chart._m19iB62Stats.staleTailRejects,
  });
  assert.ok(ok, 'rapid identity change: stale A-era endpoint never painted, fresh B identity converges and publishes, bounded posts');
});

// ═══ S2 — switch OFF (current product): exact b61 ═══════════════════════════

test('S2a OFF: delayed stale reply COMMITS and overwrites the fresher tip (b61 overwrite reproduced on real paths)', async () => {
  const module = buildModule(currentSources(), { killSwitch: true });
  const sc = await delayedStaleScenario(module, {
    active: [{ id: 'tema1', type: 'tema', params: { period: 20 }, overlay: true }],
  });
  const { chart } = sc;
  const tipsNow = tipsOf(chart.indicators.data.tema1);
  const heldTail = sc.heldReply && sc.heldReply.results ? sc.heldReply.results.tema1 : null;
  const staleTip = heldTail ? lastFinite(heldTail) : null;
  const regressed = staleTip
    && Math.abs(tipsNow[''] - staleTip.val) < 1e-12
    && !tipsClose(tipsNow, sc.freshTips.tema1, 1e-9);
  const ok = Boolean(regressed) && chart._m19iB62Stats == null;
  record('S2a', 'kill-red', ok, {
    product: currentSources().hashes.indicatorsSha256,
    tipsNow, freshTips: sc.freshTips.tema1, staleTip: staleTip && staleTip.val,
  });
  assert.ok(ok, 'kill switch restores the exact b61 stale-overwrite with zero b62 counters created');
});

test('S2b OFF: real draw cache BLITS the old layer across a forming change (b61 stale-blit reproduced)', async () => {
  const module = buildModule(currentSources(), { killSwitch: true });
  const N = 300;
  const bars = makeBars(N);
  const chart = makeChart(module, {
    bars,
    active: [{ id: 'tema1', type: 'tema', params: { period: 20 }, overlay: true }],
  });
  seedIndicatorData(module, chart);
  stubDrawSurface(chart);
  chart.drawIndicatorsOptimized();               // redraw + cache
  const last = bars[N - 1];
  last.c += 2.0; last.h = Math.max(last.h, last.c);
  chart.drawIndicatorsOptimized();               // OFF: key unchanged → STALE BLIT
  const ok = chart._redraws === 1 && chart._blits >= 2
    && chart._m19iExactTailLastFp == null;
  record('S2b', 'kill-red', ok, { redraws: chart._redraws, blits: chart._blits });
  assert.ok(ok, 'switch OFF: paint blits an endpoint older than the forming close it presents');
});

/** Shared choreography for the object-key/state diff: invalidation, data
 *  replacement, TF change, param edit, forming mutations, draws, delayed
 *  stale scenario — every call the block names. Returns the chart. */
async function killDiffChoreography(module) {
  const N = 300;
  const bars = makeBars(N);
  const chart = makeChart(module, {
    bars,
    active: [
      { id: 'tema1', type: 'tema', params: { period: 20 }, overlay: true },
      { id: 'wma1', type: 'wma', params: { period: 14 }, overlay: true },
      { id: 'mfi1', type: 'mfi', params: { period: 14 } },
    ],
  });
  seedIndicatorData(module, chart);
  stubDrawSurface(chart);
  chart._invalidateIndicatorAsyncWork();                     // invalidation call
  chart.drawIndicatorsOptimized();                           // draw
  const last = bars[N - 1];
  last.c += 1.0; last.h = Math.max(last.h, last.c);          // forming mutation
  chart.drawIndicatorsOptimized();
  chart.currentTimeframe = '5m';                             // TF change
  chart._invalidateIndicatorAsyncWork();
  chart.currentTimeframe = '1m';
  chart._invalidateIndicatorAsyncWork();
  chart.indicators.active[1].params = { period: 21 };        // param edit
  chart.data = chart.data.map((b) => ({ ...b }));            // data replacement
  chart.dataVersion = 2;
  chart._invalidateIndicatorAsyncWork();
  // Delayed stale interleaving on real paths.
  module.registry.holdByDefault = true;
  module.registry.instances.forEach((w) => { w.holdReplies = true; });
  chart.recalculateIndicatorsIncremental(N);
  const fw = module.registry.instances[module.registry.instances.length - 1];
  chart.data[N - 1].c += 1.0;
  chart.recalculateIndicatorsIncremental(N);
  fw.releaseHeld();
  await drain(); await drain();
  module.registry.holdByDefault = false;
  chart.drawIndicatorsOptimized();
  return chart;
}

test('S2c steady OFF: exact object-key/state diff vs immutable b61 across invalidation/data/TF/params calls — ZERO b62 keys', async () => {
  const offChart = await killDiffChoreography(buildModule(currentSources(), { killSwitch: true }));
  const b61Chart = await killDiffChoreography(buildModule(b61Sources()));
  const offKeys = Object.keys(offChart).sort();
  const b61Keys = Object.keys(b61Chart).sort();
  const extraKeys = offKeys.filter((k) => !b61Keys.includes(k));
  const missingKeys = b61Keys.filter((k) => !offKeys.includes(k));
  const b62StateAbsent = offChart._m19iB62DatasetGen === undefined
    && offChart._m19iB62Stats === undefined
    && offChart._m19iB62SeenData === undefined
    && offChart._m19iB62PendingFreshFp === undefined
    && offChart._m19iExactTailLastFp === undefined
    && offChart._m19iExactTailLastRv === undefined
    && offChart._m19iExactTailFailFp === undefined
    && offChart._m19iExactTailFailRv === undefined
    && offChart._m19iExactTailPaintBusy === undefined;
  const scalarParity = offChart._indicatorWorkerSeq === b61Chart._indicatorWorkerSeq
    && offChart._indicatorWorkerBusy === b61Chart._indicatorWorkerBusy
    && offChart._indicatorWorkerCoalesce === b61Chart._indicatorWorkerCoalesce;
  const ok = extraKeys.length === 0 && missingKeys.length === 0
    && b62StateAbsent && scalarParity;
  record('S2c', 'kill-red', ok, { extraKeys, missingKeys, b62StateAbsent, scalarParity });
  assert.ok(ok, `steady OFF is object-key/state identical to b61 (extra=[${extraKeys}] missing=[${missingKeys}])`);
});

test('S2d runtime ON→OFF: b62 state FREEZES (no gen bump, no memo clear, no counter change); legacy behavior exact', async () => {
  const module = buildModule(currentSources());
  const N = 300;
  const bars = makeBars(N);
  const chart = makeChart(module, {
    bars,
    active: [{ id: 'wma1', type: 'wma', params: { period: 14 }, overlay: true }],
  });
  seedIndicatorData(module, chart);
  stubDrawSurface(chart);
  chart._invalidateIndicatorAsyncWork();          // ON: creates/advances b62 state
  chart.drawIndicatorsOptimized();                // ON: bridge publishes
  const frozen = {
    gen: chart._m19iB62DatasetGen,
    lastFp: chart._m19iExactTailLastFp,
    lastRv: chart._m19iExactTailLastRv,
    failFp: chart._m19iExactTailFailFp,
    stats: JSON.stringify(chart._m19iB62Stats),
  };
  assert.ok(Number.isSafeInteger(frozen.gen) && frozen.gen >= 1, 'ON created a generation');
  module.win[KILL] = true;                        // runtime OFF
  chart._invalidateIndicatorAsyncWork();
  chart.currentTimeframe = '5m';
  chart._invalidateIndicatorAsyncWork();
  chart.currentTimeframe = '1m';
  chart.indicators.active[0].params = { period: 15 };
  chart._invalidateIndicatorAsyncWork();
  const b62Frozen = chart._m19iB62DatasetGen === frozen.gen
    && chart._m19iExactTailLastFp === frozen.lastFp
    && chart._m19iExactTailLastRv === frozen.lastRv
    && chart._m19iExactTailFailFp === frozen.failFp
    && JSON.stringify(chart._m19iB62Stats) === frozen.stats;
  // Legacy-visible behavior while OFF: the b61 stale-overwrite works.
  const sc = await (async () => {
    module.registry.holdByDefault = true;
    module.registry.instances.forEach((w) => { w.holdReplies = true; });
    chart.recalculateIndicatorsIncremental(N);
    const fw = module.registry.instances[module.registry.instances.length - 1];
    bars[N - 1].c += 2.0; bars[N - 1].h = Math.max(bars[N - 1].h, bars[N - 1].c);
    const heldReply = fw.held[fw.held.length - 1] || null;
    fw.releaseHeld();
    await drain(); await drain();
    module.registry.holdByDefault = false;
    return { heldReply };
  })();
  const heldTail = sc.heldReply && sc.heldReply.results ? sc.heldReply.results.wma1 : null;
  const staleTip = heldTail ? lastFinite(heldTail) : null;
  const tipNow = lastFinite(chart.indicators.data.wma1);
  const overwrote = staleTip && tipNow && Math.abs(tipNow.val - staleTip.val) < 1e-12;
  const ok = b62Frozen && Boolean(overwrote)
    && chart._m19iB62Stats.staleTailRejects === 0;   // counter untouched while OFF
  record('S2d', 'kill-red', ok, { b62Frozen, overwrote, frozenGen: frozen.gen });
  assert.ok(ok, 'ON→OFF: zero b62 side effects from every hook; exact legacy overwrite');
});

test('S2e OFF→ON: stale state committed while OFF self-heals after re-enable with ZERO OFF-time writes', async () => {
  const module = buildModule(currentSources(), { killSwitch: true });
  const N = 300;
  const bars = makeBars(N);
  const chart = makeChart(module, {
    bars,
    active: [{ id: 'wma1', type: 'wma', params: { period: 14 }, overlay: true }],
  });
  seedIndicatorData(module, chart);
  stubDrawSurface(chart);
  // OFF: land a b61-style stale overwrite.
  module.registry.holdByDefault = true;
  module.registry.instances.forEach((w) => { w.holdReplies = true; });
  chart.recalculateIndicatorsIncremental(N);
  const fw = module.registry.instances[module.registry.instances.length - 1];
  bars[N - 1].c += 2.0; bars[N - 1].h = Math.max(bars[N - 1].h, bars[N - 1].c);
  chart.recalculateIndicatorsIncremental(N);
  fw.releaseHeld();
  await drain(); await drain();
  module.registry.holdByDefault = false;
  const zeroOffWrites = chart._m19iB62DatasetGen === undefined
    && chart._m19iExactTailLastFp === undefined
    && chart._m19iB62Stats === undefined;
  const staleTip = lastFinite(chart.indicators.data.wma1);
  // Re-enable at runtime; the next paint must repair the endpoint.
  delete module.win[KILL];
  chart.drawIndicatorsOptimized();
  const ref = fullHistoryReference(module, chart, 'wma1');
  const diff = fullStructureDiff(chart.indicators.data.wma1, ref, 1e-9);
  const repaired = diff == null && chart._m19iB62Stats
    && chart._m19iB62Stats.exactTailPaints >= 1;
  const ok = zeroOffWrites && Boolean(repaired);
  record('S2e', 'kill-red', ok, {
    zeroOffWrites, staleTipWhileOff: staleTip && staleTip.val,
    repairedDiff: diff, exactTailPaints: chart._m19iB62Stats && chart._m19iB62Stats.exactTailPaints,
  });
  assert.ok(ok, 'OFF→ON: detection/invalidation happens only after re-enable; endpoint repaired to full-history exact');
});

// ═══ S3 — immutable b61 baseline cells (mechanism RED on pinned blob) ═══════

test('S3a b61 blob: same delayed choreography OVERWRITES the fresher tip (mechanism RED bound to pinned product)', async () => {
  const module = buildModule(b61Sources());
  const sc = await delayedStaleScenario(module, {
    active: [{ id: 'tema1', type: 'tema', params: { period: 20 }, overlay: true }],
  });
  const { chart } = sc;
  const tipsNow = tipsOf(chart.indicators.data.tema1);
  const heldTail = sc.heldReply && sc.heldReply.results ? sc.heldReply.results.tema1 : null;
  const staleTip = heldTail ? lastFinite(heldTail) : null;
  const regressed = staleTip
    && Math.abs(tipsNow[''] - staleTip.val) < 1e-12
    && !tipsClose(tipsNow, sc.freshTips.tema1, 1e-9);
  const ok = Boolean(regressed) && chart._m19iB62Stats == null;
  record('S3a', 'b61-red', ok, {
    product: b61Sources().hashes.indicatorsSha256,
    gitBlob: B61_PIN.indicatorsBlob,
    tipsNow, freshTips: sc.freshTips.tema1, staleTip: staleTip && staleTip.val,
  });
  assert.ok(ok, 'immutable b61 blob exhibits the stale-overwrite mechanism');
});

test('S3b b61 blob: draw cache blits stale layer across a forming change', async () => {
  const module = buildModule(b61Sources());
  const N = 300;
  const bars = makeBars(N);
  const chart = makeChart(module, {
    bars,
    active: [{ id: 'tema1', type: 'tema', params: { period: 20 }, overlay: true }],
  });
  seedIndicatorData(module, chart);
  stubDrawSurface(chart);
  chart.drawIndicatorsOptimized();
  const last = bars[N - 1];
  last.c += 2.0; last.h = Math.max(last.h, last.c);
  chart.drawIndicatorsOptimized();
  const ok = chart._redraws === 1 && chart._blits >= 2;
  record('S3b', 'b61-red', ok, { redraws: chart._redraws, blits: chart._blits });
  assert.ok(ok, 'b61 paint pipeline blits a stale endpoint over a moved price');
});

// ═══ S4 — complete strict identity (fix ON) ═════════════════════════════════

const GEN_CASES = [
  {
    id: 'S4a', name: 'volume-only forming mutation (v in identity)',
    mutate: (b) => { b[b.length - 1].v += 500; },
  },
  {
    id: 'S4b', name: 'same-shape dataset swap (dataVersion + dataFp)',
    mutate: () => {},
    preRelease: (chart) => {
      const swapped = makeBars(chart.data.length).map((bar) => ({ ...bar, c: bar.c + 0.37 }));
      chart.data = swapped;
      chart.dataVersion = 2;
    },
  },
  {
    id: 'S4c', name: 'param edit racing the reply (paramsHash)',
    mutate: () => {},
    preRelease: (chart) => { chart.indicators.active[0].params = { period: 21 }; },
  },
  {
    id: 'S4d', name: 'indicator ADD racing the reply (paramsHash)',
    mutate: () => {},
    preRelease: (chart) => {
      chart.indicators.active.push({ id: 'sma9', type: 'sma', params: { period: 9 }, overlay: true });
    },
  },
  {
    id: 'S4e', name: 'indicator REMOVE racing the reply (paramsHash)',
    mutate: () => {},
    preRelease: (chart) => { chart.indicators.active.pop(); },
  },
  {
    id: 'S4h', name: 'REPLACEMENT reference with byte-identical content/tail (multichart this.data = parent.data; dataVersion owner fails to bump)',
    mutate: () => {},
    preRelease: (chart) => {
      // Same length, same t/o/h/l/c/v everywhere, same dataVersion — ONLY the
      // array reference changes. The local observation must mint a new
      // monotonic generation before token comparison.
      chart.data = chart.data.map((bar) => ({ ...bar }));
    },
  },
  {
    id: 'S4i', name: 'same-reference MIDDLE mutation inside the posted window (window content fingerprint)',
    mutate: () => {},
    preRelease: (chart) => {
      const n = chart.data.length;
      chart.data[n - 10].c += 0.5;    // inside the posted window, not the last bar
    },
  },
  {
    id: 'S4k', name: 'same-reference VOLUME-only mutation inside the posted window',
    mutate: () => {},
    preRelease: (chart) => {
      const n = chart.data.length;
      chart.data[n - 10].v += 7;
    },
  },
];

for (const c of GEN_CASES) {
  test(`${c.id} ON identity: ${c.name} → stale reply rejected before merge`, async () => {
    const module = buildModule(currentSources());
    const sc = await delayedStaleScenario(module, { mutate: c.mutate, preRelease: c.preRelease });
    const rejects = sc.chart._m19iB62Stats ? sc.chart._m19iB62Stats.staleTailRejects : 0;
    const ok = rejects === 1;
    record(c.id, 'green-on', ok, { rejects, case: c.name });
    assert.ok(ok, `${c.name}: token must reject (got rejects=${rejects})`);
  });
}

test('S4j ON identity: mutation OUTSIDE the posted window does NOT invalidate the merge (documented correctness boundary)', async () => {
  const module = buildModule(currentSources());
  const sc = await delayedStaleScenario(module, {
    mutate: () => {},
    preRelease: (chart) => {
      // Bars before tailStart never entered the worker's computation; they
      // cannot invalidate the merge itself. Full-history freshness for such
      // edits is owned by dataVersion/full recalcs.
      chart.data[3].c += 0.5;
    },
  });
  const rejects = sc.chart._m19iB62Stats ? sc.chart._m19iB62Stats.staleTailRejects : 0;
  const tipsNow = tipsOf(sc.chart.indicators.data.wma1);
  const ok = rejects === 0 && tipsClose(tipsNow, sc.freshTips.wma1, 1e-9);
  record('S4j', 'green-on', ok, { rejects, tipsNow });
  assert.ok(ok, 'out-of-window mutation: tail merge remains valid and accepted');
});

test('S4f ON: generation is positive safe-integer monotonic with NO 32-bit coercion; TF invalidation precedes the token', async () => {
  const module = buildModule(currentSources());
  const sc = await delayedStaleScenario(module, {
    mutate: () => {},
    preRelease: (chart) => { chart._invalidateIndicatorAsyncWork(); },
  });
  const { chart } = sc;
  const genA = chart._m19iB62DatasetGen;
  chart._invalidateIndicatorAsyncWork();
  chart._invalidateIndicatorAsyncWork();
  const genB = chart._m19iB62DatasetGen;
  // Beyond-int32 sanity: a generation past 2^31 must keep incrementing
  // exactly (the old `| 0` coercion wrapped negative here).
  chart._m19iB62DatasetGen = 2 ** 40;
  chart._invalidateIndicatorAsyncWork();
  const genBig = chart._m19iB62DatasetGen;
  const ok = (chart._m19iB62Stats == null || chart._m19iB62Stats.staleTailRejects === 0) // seq guard fired first
    && Number.isSafeInteger(genA) && genA >= 1
    && genB === genA + 2
    && genBig === 2 ** 40 + 1
    && chart._m19iExactTailLastFp == null;       // invalidation clears the paint fp
  record('S4f', 'green-on', ok, { genA, genB, genBig });
  assert.ok(ok, 'seq rejects before token; generation increments monotonically as a safe integer');
});

test('S4l ON: generation exhaustion fails CLOSED — no wrap/reuse; tail path stops accepting; full async owns freshness', async () => {
  const module = buildModule(currentSources());
  const sc = await delayedStaleScenario(module, {
    mutate: () => {},
    prePost: (chart) => { chart._m19iB62DatasetGen = Number.MAX_SAFE_INTEGER; },
  });
  const { chart } = sc;
  const rejects = chart._m19iB62Stats ? chart._m19iB62Stats.staleTailRejects : 0;
  const genStaysMax = (() => {
    chart._invalidateIndicatorAsyncWork();
    chart._invalidateIndicatorAsyncWork();
    return chart._m19iB62DatasetGen === Number.MAX_SAFE_INTEGER;
  })();
  const nearMax = (() => {
    chart._m19iB62DatasetGen = Number.MAX_SAFE_INTEGER - 1;
    chart._invalidateIndicatorAsyncWork();
    return chart._m19iB62DatasetGen === Number.MAX_SAFE_INTEGER;   // saturates, never wraps
  })();
  const ok = rejects === 1 && genStaysMax && nearMax;
  record('S4l', 'green-on', ok, { rejects, genStaysMax, nearMax });
  assert.ok(ok, 'exhausted generation: permanently stale tail path (fail closed), saturation without wrap or collision');
});

test('S4m ON: timeframe string change racing the reply is rejected before any merge', async () => {
  const module = buildModule(currentSources());
  const sc = await delayedStaleScenario(module, {
    mutate: () => {},
    preRelease: (chart) => { chart.currentTimeframe = '5m'; },
  });
  const tipsNow = tipsOf(sc.chart.indicators.data.wma1);
  const ok = tipsClose(tipsNow, sc.freshTips.wma1, 1e-12);   // nothing merged
  record('S4m', 'green-on', ok, { tipsNow });
  assert.ok(ok, 'TF guard: reply for another timeframe never merges');
});

test('S4n ON full CALCULATE_ALL identity: held TEMA(20) reply after TEMA(50) edit stale-rejects, then current params publish', async () => {
  const module = buildModule(currentSources());
  const N = 420;
  const bars = makeBars(N);
  const chart = makeChart(module, {
    bars,
    active: [{ id: 'tema1', type: 'tema', params: { period: 20 }, overlay: true }],
  });
  seedIndicatorData(module, chart);
  const beforeJson = JSON.stringify(chart.indicators.data.tema1);
  module.registry.holdByDefault = true;
  module.registry.instances.forEach((w) => { w.holdReplies = true; });
  chart.recalculateIndicatorsAsync();                     // held TEMA(20)
  chart.indicators.active[0].params = { period: 50 };      // race the full reply without seq invalidation
  const fw = module.registry.instances[module.registry.instances.length - 1];
  fw.releaseHeld();
  await drain(); await drain();
  const staleRejected = JSON.stringify(chart.indicators.data.tema1) === beforeJson
    && chart._indicatorWorkerCoalesce === false;           // finish consumed the rerun request
  const rerun = module.registry.instances[module.registry.instances.length - 1];
  rerun.releaseHeld();
  await drain(); await drain();
  module.registry.holdByDefault = false;
  const ref = fullHistoryReference(module, chart, 'tema1');
  const diff = fullStructureDiff(chart.indicators.data.tema1, ref, 1e-9);
  const ok = staleRejected && diff == null
    && chart._m19iExactTailLastFp === chart._m19iExactTailPaintFp();
  record('S4n', 'green-on', ok, { staleRejected, diff });
  assert.ok(ok, 'held TEMA(20) full reply cannot publish after period changes to 50; rerun publishes current params');
});

test('S4o ON identity: MAX_SAFE same-shape replacement cannot memo-dedupe a result delta', () => {
  const module = buildModule(currentSources());
  const N = 320;
  const bars = makeBars(N);
  const chart = makeChart(module, {
    bars,
    active: [{ id: 'wma1', type: 'wma', params: { period: 14 }, overlay: true }],
  });
  seedIndicatorData(module, chart);
  chart._m19iB62DatasetGen = Number.MAX_SAFE_INTEGER;
  chart._m19iB62SeenData = chart.data;
  const fpBefore = chart._m19iExactTailPaintFp();
  const tipBefore = lastFinite(chart.indicators.data.wma1);
  chart.data = chart.data.map((bar, idx) => ({ ...bar, c: bar.c + (idx === N - 1 ? 1.25 : 0.25) }));
  const fpAfterReplace = chart._m19iExactTailPaintFp();
  const ret = chart._m19iExactTailPaint();
  const tipAfter = lastFinite(chart.indicators.data.wma1);
  const ref = fullHistoryReference(module, chart, 'wma1');
  const diff = fullStructureDiff(chart.indicators.data.wma1, ref, 1e-9);
  const refTip = lastFinite(ref);
  const resultDeltaExists = tipBefore && refTip && Math.abs(refTip.val - tipBefore.val) > 1e-9;
  const failClosed = ret === false && chart._m19iExactTailLastFp !== fpBefore;
  const collisionFreePublish = ret === true && diff == null
    && tipAfter && refTip && Math.abs(tipAfter.val - refTip.val) <= 1e-9;
  const ok = fpAfterReplace !== fpBefore
    && resultDeltaExists
    && (failClosed || collisionFreePublish);
  record('S4o', 'green-on', ok, {
    fpChanged: fpAfterReplace !== fpBefore,
    ret,
    tipBefore: tipBefore && tipBefore.val,
    tipAfter: tipAfter && tipAfter.val,
    tipFresh: refTip && refTip.val,
    failClosed,
    collisionFreePublish,
    diff,
  });
  assert.ok(ok, 'MAX_SAFE same-shape replacement fails closed or publishes under a distinct identity');
});

test('S4g ON: single-owner busy/coalesce keeps in-flight depth ≤ 1 (ordering cannot invert; no backlog)', async () => {
  const module = buildModule(currentSources());
  const sc = await delayedStaleScenario(module);
  const ok = sc.postsP1 === 1 && sc.postsP2 === 0 && sc.chart._recalcRuns.length === 1;
  record('S4g', 'green-on', ok, { postsP1: sc.postsP1, postsP2: sc.postsP2, reruns: sc.chart._recalcRuns.length });
  assert.ok(ok, 'worker queue depth stays ≤ 1 by construction; late replies cannot reorder commits');
});

// ═══ S5 — WHOLE-PAINT atomicity (fix ON) ════════════════════════════════════

/**
 * 12-family strictly-sync mix: arrays AND object packs, 15 staged series.
 * Cumulative budget arithmetic (item 6, recomputed): estimateTailLookback
 * floors maxPeriod at 50, so lookback = max(120, 50·4+64) = 264 and the
 * staged window at N=300 is (298−264…300) = 266 bars. 15 series × 266 =
 * 3,990 staged points ≤ 4,096 — the transaction runs synchronously.
 * (cci/aroon/donchian are NOT here: cci/aroon are fallback-classified and
 * a 19-series mix would be a budget skip, not a bridge, at 266×19 = 5,054.)
 */
function bigSyncMix() {
  return [
    { id: 'a1', type: 'wma', params: { period: 14 }, overlay: true },
    { id: 'a2', type: 'sma', params: { period: 20 }, overlay: true },
    { id: 'a3', type: 'hma', params: { period: 14 }, overlay: true },
    { id: 'a4', type: 'stoch', params: { period: 14, smoothK: 3, smoothD: 3 } },
    { id: 'a5', type: 'stddev', params: { period: 20 } },
    { id: 'a6', type: 'mom', params: { period: 10 } },
    { id: 'a7', type: 'ao', params: {} },
    { id: 'a8', type: 'mfi', params: { period: 14 } },
    { id: 'a9', type: 'cmf', params: { period: 20 } },
    { id: 'a10', type: 'roc', params: { period: 12 } },
    { id: 'a11', type: 'willr', params: { period: 14 } },
    { id: 'a12', type: 'bb', params: { period: 20, stdDev: 2 } },
  ];
}

function snapshotAll(chart) {
  const out = {};
  chart.indicators.active.forEach((ind) => {
    out[ind.id] = { ref: chart.indicators.data[ind.id], json: JSON.stringify(chart.indicators.data[ind.id]) };
  });
  return out;
}

function unchangedExcept(chart, before, exceptIds = []) {
  return chart.indicators.active.every((ind) => {
    if (exceptIds.includes(ind.id)) return true;
    const b = before[ind.id];
    return chart.indicators.data[ind.id] === b.ref
      && JSON.stringify(chart.indicators.data[ind.id]) === b.json;
  });
}

for (const pos of ['first', 'middle', 'last']) {
  test(`S5a ON whole-paint rollback: ${pos}-family failure in a 12-family transaction → ZERO partial mutation, observable rollback, no publish`, () => {
    const module = buildModule(currentSources());
    const N = 300;
    const bars = makeBars(N);
    const chart = makeChart(module, { bars, active: bigSyncMix() });
    seedIndicatorData(module, chart);
    const poisonId = pos === 'first' ? 'a1' : pos === 'middle' ? 'a6' : 'a12';
    // Poison the EXISTING series of the target family to an unmergeable
    // shape: its fresh candidate still computes; the commit fails at that
    // family; every other family must be restored byte/structure-exact.
    chart.indicators.data[poisonId] = 42;
    const before = snapshotAll(chart);
    const rvBefore = chart._indicatorRenderVersion || 0;
    const last = bars[N - 1];
    last.c += 2.0; last.h = Math.max(last.h, last.c);
    const ret = chart._m19iExactTailPaint();
    const fp = chart._m19iExactTailPaintFp();
    const ok = ret === false
      && unchangedExcept(chart, before)                    // zero partial mutation
      && chart._m19iB62Stats.atomicRollbacks === 1         // observable rollback
      && chart._m19iExactTailLastFp == null                // no success publish
      && chart._m19iExactTailFailFp === fp                 // diagnostics after rollback
      && chart._m19iB62PendingFreshFp === fp               // memo does NOT block: fresh requested
      && (chart._indicatorRenderVersion || 0) === rvBefore;
    record(`S5a-${pos}`, 'green-on', ok, {
      pos, ret,
      atomicRollbacks: chart._m19iB62Stats.atomicRollbacks,
      freshRequested: chart._m19iB62PendingFreshFp === fp,
    });
    assert.ok(ok, `${pos}-family failure: all-or-nothing with eventual-fresh request`);
  });
}

test('S5b ON: object-pack partial-merge rollback — real merge patches key 1 then fails key 2; key 1 restored', () => {
  const module = buildModule(currentSources());
  const N = 300;
  const bars = makeBars(N);
  const chart = makeChart(module, {
    bars,
    active: [{ id: 'bb1', type: 'bb', params: { period: 20, stdDev: 2 } }],
  });
  seedIndicatorData(module, chart);
  const pack = chart.indicators.data.bb1;
  assert.ok(pack && typeof pack === 'object' && !Array.isArray(pack), 'bb seeds an object pack');
  const arrayKeys = Object.keys(pack).filter((k) => Array.isArray(pack[k]));
  assert.ok(arrayKeys.length >= 2, 'pack has ≥2 series keys');
  const goodKey = arrayKeys[0];
  const badKey = arrayKeys[1];
  const goodBefore = JSON.stringify(pack[goodKey]);
  pack[badKey] = 'poisoned';
  const last = bars[N - 1];
  last.c += 2.0; last.h = Math.max(last.h, last.c);
  const ret = chart._m19iExactTailPaint();
  const ok = ret === false
    && JSON.stringify(pack[goodKey]) === goodBefore
    && pack[badKey] === 'poisoned'
    && chart._m19iB62Stats.atomicRollbacks === 1
    && chart._m19iExactTailLastFp == null;
  record('S5b', 'green-on', ok, { ret, goodKeyRestored: JSON.stringify(pack[goodKey]) === goodBefore });
  assert.ok(ok, 'partial in-place object merge is fully restored on failure');
});

test('S5c ON: EXCEPTION mid-commit (injected merge throw at family 5 of 12) → whole-set rollback, zero partial mutation', () => {
  const module = buildModule(currentSources());
  const N = 300;
  const bars = makeBars(N);
  const chart = makeChart(module, { bars, active: bigSyncMix() });
  seedIndicatorData(module, chart);
  const before = snapshotAll(chart);
  const realMerge = module.win.IndicatorPerf.mergeIndicatorTailWindow;
  let calls = 0;
  module.win.IndicatorPerf.mergeIndicatorTailWindow = function (...args) {
    calls++;
    if (calls === 5) throw new Error('injected mid-commit exception');
    return realMerge.apply(this, args);
  };
  try {
    const last = bars[N - 1];
    last.c += 2.0; last.h = Math.max(last.h, last.c);
    const ret = chart._m19iExactTailPaint();
    const ok = ret === false
      && unchangedExcept(chart, before)
      && chart._m19iB62Stats.atomicRollbacks === 1
      && chart._m19iExactTailLastFp == null;
    record('S5c', 'green-on', ok, { ret, mergeCallsBeforeThrow: calls });
    assert.ok(ok, 'a throw at any family rolls back every earlier family');
  } finally {
    module.win.IndicatorPerf.mergeIndicatorTailWindow = realMerge;
  }
});

test('S5d ON: BLOCK REPRO mixed TEMA + massindex — transaction refuses to advance TEMA while massindex stays old (zero mutation, fresh requested)', () => {
  const module = buildModule(currentSources());
  const N = 300;
  const bars = makeBars(N);
  const chart = makeChart(module, {
    bars,
    active: [
      { id: 'tema1', type: 'tema', params: { period: 20 }, overlay: true },
      { id: 'mass1', type: 'massindex', params: { emaPeriod: 9, sumPeriod: 25 } },
    ],
  });
  seedIndicatorData(module, chart);
  const before = snapshotAll(chart);
  const last = bars[N - 1];
  last.c += 2.0; last.h = Math.max(last.h, last.c);
  const ret = chart._m19iExactTailPaint();
  const fp = chart._m19iExactTailPaintFp();
  const ok = ret === false
    && unchangedExcept(chart, before)                 // TEMA did NOT mutate
    && chart._m19iB62Stats.exactTailPaints === 0
    && chart._m19iExactTailLastFp == null
    && chart._m19iB62PendingFreshFp === fp;           // eventual fresh owned by pipeline
  // Same whole-transaction discipline on the I-f pass bridge:
  const map = {
    tema1: { type: 'tema', params: { period: 20 } },
    mass1: { type: 'massindex', params: { emaPeriod: 9, sumPeriod: 25 } },
  };
  const passBefore = snapshotAll(chart);
  const bridged = (() => {
    // exercise via a real coherent pass (worker held so only the sync bridge runs)
    module.registry.holdByDefault = true;
    module.registry.instances.forEach((w) => { w.holdReplies = true; });
    chart.recalculateIndicatorsIncremental(N);
    module.registry.holdByDefault = false;
    return unchangedExcept(chart, passBefore);
  })();
  record('S5d', 'green-on', ok && bridged, {
    ret, temaUnchanged: unchangedExcept(chart, before, []),
    passBridgeZeroMutation: bridged, mapKeys: Object.keys(map),
  });
  assert.ok(ok && bridged, 'mixed TEMA+massindex can never partially advance — whole transaction goes async');
});

test('S5e ON: publish-after-commit + failure memo NEVER suppresses correctness (witness expiry re-verifies)', () => {
  const module = buildModule(currentSources());
  const N = 300;
  const bars = makeBars(N);
  const chart = makeChart(module, {
    bars,
    active: [{ id: 'wma1', type: 'wma', params: { period: 14 }, overlay: true }],
  });
  seedIndicatorData(module, chart);
  const last = bars[N - 1];
  last.c += 2.0; last.h = Math.max(last.h, last.c);
  const ret = chart._m19iExactTailPaint();
  const published = chart._m19iExactTailLastFp === chart._m19iExactTailPaintFp();
  const again = chart._m19iExactTailPaint(); // same fp + same witness → dedupe
  const passes = chart._m19ifStats ? chart._m19ifStats.bridgePasses : 0;
  // A foreign render bump (e.g. an OFF-era stale overwrite or a full recalc)
  // expires the witness: the hook must re-verify (idempotent re-bridge).
  chart.bumpIndicatorRenderVersion();
  const reverify = chart._m19iExactTailPaint();
  const ok = ret === true && published && again === false && passes === 1
    && reverify === true
    && chart._m19iB62Stats.exactTailPaints === 2
    && chart._m19iExactTailFailFp == null;
  record('S5e', 'green-on', ok, { ret, published, again, reverify, bridgePasses: passes });
  assert.ok(ok, 'fp publish-after-commit; witness expiry forces re-verification instead of trusting a memo');
});

// ═══ S6 — 52-row full-structure family matrix (fix ON) ══════════════════════

const SYNC_ROWS = [
  // default params
  { fam: 'sma', params: { period: 20 } },
  { fam: 'wma', params: { period: 14 } },
  { fam: 'hma', params: { period: 14 } },
  { fam: 'bb', params: { period: 20, stdDev: 2 } },
  { fam: 'envelope', params: { period: 20, percent: 1.5 } },
  { fam: 'stddev', params: { period: 20 } },
  { fam: 'roc', params: { period: 12 } },
  { fam: 'mom', params: { period: 10 } },
  { fam: 'willr', params: { period: 14 } },
  { fam: 'mfi', params: { period: 14 } },
  { fam: 'cmf', params: { period: 20 } },
  { fam: 'donchian', params: { period: 20, offset: 0 } },
  { fam: 'stoch', params: { period: 14, smoothK: 3, smoothD: 3 } },
  { fam: 'ao', params: { fastLength: 5, slowLength: 34 } },
  // param variants
  { fam: 'sma', params: { period: 50 }, label: 'sma-p50' },
  { fam: 'wma', params: { period: 28 }, label: 'wma-p28' },
  { fam: 'hma', params: { period: 28 }, label: 'hma-p28' },
  { fam: 'bb', params: { period: 30, stdDev: 3 }, label: 'bb-p30sd3' },
  { fam: 'envelope', params: { period: 50, percent: 2.5 }, label: 'envelope-p50' },
  { fam: 'stddev', params: { period: 50 }, label: 'stddev-p50' },
  { fam: 'roc', params: { period: 24 }, label: 'roc-p24' },
  { fam: 'mom', params: { period: 20 }, label: 'mom-p20' },
  { fam: 'willr', params: { period: 28 }, label: 'willr-p28' },
  { fam: 'mfi', params: { period: 28 }, label: 'mfi-p28' },
  { fam: 'cmf', params: { period: 50 }, label: 'cmf-p50' },
  { fam: 'stoch', params: { period: 21, smoothK: 5, smoothD: 5 }, label: 'stoch-p21' },
  { fam: 'ao', params: { fastLength: 8, slowLength: 55 }, label: 'ao-8-55' },
  // short histories (N < warmup for the family)
  { fam: 'sma', params: { period: 50 }, n: 40, label: 'sma-short' },
  { fam: 'wma', params: { period: 50 }, n: 40, label: 'wma-short' },
  { fam: 'bb', params: { period: 50, stdDev: 2 }, n: 40, label: 'bb-short' },
  { fam: 'donchian', params: { period: 50, offset: 0 }, n: 40, label: 'donchian-short' },
];

/**
 * FALLBACK class reproduces the independent probe failures: cci diverges
 * numerically (max |Δ| ≈ 30.758 observed at the tip), the main-thread aroon
 * pack emits foreign keys (up/down vs aroonUp/aroonDown), and donchian with
 * a non-zero offset misaligns the middle band — all three are now classified
 * to the safe async fresh-worker path (never an approximate/incompatible
 * synchronous candidate), alongside the recursive/seed-dependent families.
 */
const FALLBACK_ROWS = [
  { fam: 'ema', params: { period: 20 } },
  { fam: 'dema', params: { period: 20 } },
  { fam: 'tema', params: { period: 20 } },
  { fam: 'tema', params: { period: 50 }, label: 'tema-p50' },
  { fam: 'macd', params: { fast: 12, slow: 26, signal: 9 } },
  { fam: 'ppo', params: { fast: 12, slow: 26, signal: 9 } },
  { fam: 'rsi', params: { period: 14 } },
  { fam: 'atr', params: { period: 14 } },
  { fam: 'adx', params: { diLength: 14, adxSmoothing: 14 } },
  { fam: 'keltner', params: { period: 20, multiplier: 2 } },
  { fam: 'trix', params: { period: 15 } },
  { fam: 'massindex', params: { emaPeriod: 9, sumPeriod: 25 } },
  { fam: 'stochrsi', params: { rsiPeriod: 14, stochPeriod: 14, smoothK: 3, smoothD: 3 } },
  // independent-probe failure reproductions (block item 3)
  { fam: 'cci', params: { period: 20 } },
  { fam: 'cci', params: { period: 50 }, label: 'cci-p50' },
  { fam: 'cci', params: { period: 50 }, n: 40, label: 'cci-short' },
  { fam: 'aroon', params: { period: 25 } },
  { fam: 'aroon', params: { period: 50 }, label: 'aroon-p50' },
  { fam: 'aroon', params: { period: 50 }, n: 40, label: 'aroon-short' },
  { fam: 'donchian', params: { period: 20, offset: 2 }, label: 'donchian+offset' },
  { fam: 'donchian', params: { period: 50, offset: 5 }, label: 'donchian-p50off5' },
];

const matrixRows = [];

for (const row of SYNC_ROWS) {
  const label = row.label || `${row.fam}(${JSON.stringify(row.params)})`;
  test(`S6 matrix SYNC ${label}: bridged live structure == independent full-history worker recomputation (exact structure, ≤1e-9)`, () => {
    const module = buildModule(currentSources());
    const N = row.n || 400;
    const bars = makeBars(N);
    const chart = makeChart(module, {
      bars,
      active: [{ id: 'x1', type: row.fam, params: { ...row.params }, overlay: true }],
    });
    seedIndicatorData(module, chart);
    const last = bars[N - 1];
    last.c += 1.5; last.h = Math.max(last.h, last.c); last.v += 777;
    const ret = chart._m19iExactTailPaint();
    const ref = fullHistoryReference(module, chart, 'x1');
    const diff = fullStructureDiff(chart.indicators.data.x1, ref, 1e-9);
    const ok = ret === true && diff == null;
    matrixRows.push({ row: label, class: 'SYNC', pass: ok, diff });
    record(`S6:${label}`, 'parity', ok, { class: 'SYNC-EXACT', ret, diff });
    assert.ok(ok, `${label}: full-structure ≤1e-9 vs full history (diff=${JSON.stringify(diff)})`);
  });
}

for (const row of FALLBACK_ROWS) {
  const label = row.label || `${row.fam}(${JSON.stringify(row.params)})`;
  test(`S6 matrix FALLBACK ${label}: NO approximate main-thread candidate published; fresh worker path converges with no stale acceptance`, async () => {
    const module = buildModule(currentSources());
    const N = row.n || 400;
    const bars = makeBars(N);
    const chart = makeChart(module, {
      bars,
      active: [{ id: 'x1', type: row.fam, params: { ...row.params }, overlay: true }],
    });
    seedIndicatorData(module, chart);
    const beforeRef = chart.indicators.data.x1;
    const beforeJson = JSON.stringify(beforeRef);
    const last = bars[N - 1];
    last.c += 1.5; last.h = Math.max(last.h, last.c); last.v += 777;
    const ret = chart._m19iExactTailPaint();
    const noSyncMutation = ret === false
      && chart.indicators.data.x1 === beforeRef
      && JSON.stringify(chart.indicators.data.x1) === beforeJson
      && (!chart._m19iB62Stats || chart._m19iB62Stats.exactTailPaints === 0);
    // Eventual fresh: the REAL pipeline (post-mutation pass + real apply).
    chart.recalculateIndicatorsIncremental(N);
    await drain(); await drain(); await drain();
    const rejects = chart._m19iB62Stats ? chart._m19iB62Stats.staleTailRejects : 0;
    const frozen = chart._indicatorWorkerBusy === true;
    // Endpoint truth: after the pipeline, the painted tip must equal an
    // INDEPENDENT fresh full-history worker recompute of the mutated data.
    const ref = fullHistoryReference(module, chart, 'x1');
    const diff = fullStructureDiff(chart.indicators.data.x1, ref, 1e-9);
    const tipNow = tipsOf(chart.indicators.data.x1);
    const tipRef = tipsOf(ref);
    const ok = noSyncMutation && !frozen && rejects === 0 && diff == null;
    matrixRows.push({ row: label, class: 'ASYNC-FALLBACK', pass: ok });
    record(`S6:${label}`, 'parity', ok, {
      class: 'ASYNC-FALLBACK-PROVEN', noSyncMutation, fullHistoryDiff: diff,
      tipNow, tipFullHistory: tipRef, beforeChanged: JSON.stringify(chart.indicators.data.x1) !== beforeJson,
    });
    assert.ok(ok, `${label}: zero sync mutation + exact fresh full-history convergence (diff=${JSON.stringify(diff)})`);
  });
}

test('S6z matrix summary: 52 rows, every row passes its class (SYNC-EXACT or ASYNC-FALLBACK-PROVEN)', () => {
  const total = matrixRows.length;
  const passed = matrixRows.filter((r) => r.pass).length;
  const ok = total === 52 && passed === total;
  record('S6z', 'parity', ok, {
    total, passed,
    syncRows: matrixRows.filter((r) => r.class === 'SYNC').length,
    fallbackRows: matrixRows.filter((r) => r.class === 'ASYNC-FALLBACK').length,
    failures: matrixRows.filter((r) => !r.pass),
  });
  assert.ok(ok, `matrix ${passed}/${total} (expected 52/52)`);
});

// ═══ S7 — workload/manifest truth ═══════════════════════════════════════════

test('S7 workload: cumulative staged-point arithmetic recomputed exactly as the product computes it; truthful distributions; unconditional cap/liveness', async () => {
  const module = buildModule(currentSources());
  const N = 2000;
  const WARMUP = 5;
  const CHANGES = 65;
  // Per-family output series counts — MUST mirror M19I_B62_SYNC_FAMILIES
  // (cci/aroon are NOT sync families under the corrected classification).
  const SERIES_COUNT = {
    sma: 1, wma: 1, hma: 1, bb: 3, envelope: 3, stddev: 1, roc: 1, mom: 1,
    willr: 1, mfi: 1, cmf: 1, donchian: 3, stoch: 2, ao: 1,
  };
  const MIXES = {
    // Typical strictly-sync mix (arrays + packs): 11 output series.
    typicalSync: [
      { id: 't1', type: 'sma', params: { period: 20 }, overlay: true },
      { id: 't2', type: 'wma', params: { period: 20 }, overlay: true },
      { id: 't3', type: 'hma', params: { period: 20 }, overlay: true },
      { id: 't4', type: 'bb', params: { period: 20, stdDev: 2 } },
      { id: 't5', type: 'stoch', params: { period: 14, smoothK: 3, smoothD: 3 } },
      { id: 't6', type: 'donchian', params: { period: 20, offset: 0 } },
    ],
    // Heaviest supported: 8 single-series finite families at period 100 →
    // 466-bar window × 8 series = 3728 staged points, under the 4096 ceiling.
    heaviestSupported: [
      { id: 'h1', type: 'sma', params: { period: 100 }, overlay: true },
      { id: 'h2', type: 'wma', params: { period: 100 }, overlay: true },
      { id: 'h3', type: 'hma', params: { period: 100 }, overlay: true },
      { id: 'h4', type: 'mom', params: { period: 100 } },
      { id: 'h5', type: 'mfi', params: { period: 100 } },
      { id: 'h6', type: 'cmf', params: { period: 100 } },
      { id: 'h7', type: 'willr', params: { period: 100 } },
      { id: 'h8', type: 'roc', params: { period: 100 } },
    ],
    // Beyond the ceiling: add two 3-series packs → 14 series × 466 = 6524.
    beyondCeiling: [
      { id: 'b1', type: 'sma', params: { period: 100 }, overlay: true },
      { id: 'b2', type: 'wma', params: { period: 100 }, overlay: true },
      { id: 'b3', type: 'hma', params: { period: 100 }, overlay: true },
      { id: 'b4', type: 'mom', params: { period: 100 } },
      { id: 'b5', type: 'mfi', params: { period: 100 } },
      { id: 'b6', type: 'cmf', params: { period: 100 } },
      { id: 'b7', type: 'willr', params: { period: 100 } },
      { id: 'b8', type: 'roc', params: { period: 100 } },
      { id: 'b9', type: 'bb', params: { period: 100, stdDev: 2 } },
      { id: 'b10', type: 'donchian', params: { period: 100, offset: 0 } },
    ],
    // The prior manifest's "typical" (five MA + TEMA): now classified —
    // tema/ema/dema are recursive, so the WHOLE paint goes async-fallback.
    w5LegacyMix: [
      { id: 'w1', type: 'sma', params: { period: 20 }, overlay: true },
      { id: 'w2', type: 'ema', params: { period: 20 }, overlay: true },
      { id: 'w3', type: 'wma', params: { period: 20 }, overlay: true },
      { id: 'w4', type: 'dema', params: { period: 20 }, overlay: true },
      { id: 'w5', type: 'hma', params: { period: 20 }, overlay: true },
      { id: 'w6', type: 'tema', params: { period: 20 }, overlay: true },
    ],
  };

  function cumulativeStagedPoints(mix, lookback) {
    const window = Math.min(N, lookback + 2);
    const series = mix.reduce((s, ind) => s + (SERIES_COUNT[ind.type] || 1), 0);
    return { window, series, points: window * series };
  }

  function measure(mixName, views) {
    const mix = MIXES[mixName];
    const charts = [];
    for (let v = 0; v < views; v++) {
      const chart = makeChart(module, {
        bars: makeBars(N),
        active: mix.map((w) => ({ ...w, params: { ...w.params } })),
      });
      seedIndicatorData(module, chart);
      charts.push(chart);
    }
    const durationsMs = [];
    for (let i = 0; i < WARMUP + CHANGES; i++) {
      for (const chart of charts) {
        const last = chart.data[N - 1];
        last.c += Math.sin(i * 0.7) * 0.5 + 0.01;
        last.h = Math.max(last.h, last.c);
        last.v += 3;
        const t0 = process.hrtime.bigint();
        chart._m19iExactTailPaint();
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        if (i >= WARMUP) durationsMs.push(ms);
        if (i === WARMUP - 1 && chart._m19iB62Stats) {
          Object.keys(chart._m19iB62Stats).forEach((k) => { chart._m19iB62Stats[k] = 0; });
          chart._recalcRuns = [];
        }
      }
    }
    durationsMs.sort((a, b) => a - b);
    const q = (p) => durationsMs[Math.min(durationsMs.length - 1, Math.floor(p * durationsMs.length))];
    const lookback = module.win.IndicatorPerf.estimateTailLookback(mix);
    const staged = cumulativeStagedPoints(mix, lookback);
    return {
      mix: mixName,
      views,
      samples: durationsMs.length,
      lookback,
      cumulativeStagedPoints: staged,
      p50Ms: q(0.50),
      p95Ms: q(0.95),
      p99Ms: q(0.99),
      maxMs: durationsMs[durationsMs.length - 1],
      charts,
    };
  }

  const cells = [];
  for (const views of [1, 2, 4]) cells.push(measure('typicalSync', views));
  cells.push(measure('heaviestSupported', 1));
  const beyond = measure('beyondCeiling', 1);
  cells.push(beyond);
  const w5legacy = measure('w5LegacyMix', 1);
  cells.push(w5legacy);

  // ── UNCONDITIONAL correctness/cap/liveness ──
  const typicalStaged = cells[0].cumulativeStagedPoints;
  const heaviest = cells.find((c) => c.mix === 'heaviestSupported');
  const heaviestOk = heaviest.cumulativeStagedPoints.points <= 4096
    && heaviest.charts[0]._m19iB62Stats.exactTailPaints >= CHANGES;
  const beyondChart = beyond.charts[0];
  const beyondOk = beyond.cumulativeStagedPoints.points > 4096
    && beyondChart._m19iB62Stats.exactTailBudgetSkips >= CHANGES
    && beyondChart._m19iB62Stats.exactTailPaints === 0
    // Liveness: every skip requested a fresh recompute exactly once per identity
    && beyondChart._m19iB62Stats.freshAsyncRequests >= CHANGES
    && beyondChart._recalcRuns.length === beyondChart._m19iB62Stats.freshAsyncRequests;
  const w5Chart = w5legacy.charts[0];
  const w5Ok = w5Chart._m19iB62Stats.exactTailPaints === 0        // fallback-classified
    && w5Chart._m19iB62Stats.freshAsyncRequests >= CHANGES;       // eventual fresh owned
  // ── env-qualified timing ──
  const strictTiming = Boolean(process.env.M19I_B62_WORKLOAD_STRICT);
  const typicalOk = !strictTiming
    || cells.filter((c) => c.mix === 'typicalSync').every((c) => c.p95Ms < 8);
  const heaviestTimingOk = !strictTiming || heaviest.p95Ms < 16;
  const beyondTimingOk = !strictTiming || beyond.p95Ms < 2;

  const cleanCells = cells.map(({ charts: _c, ...rest }) => rest);
  const pass = heaviestOk && beyondOk && w5Ok && typicalOk && heaviestTimingOk && beyondTimingOk;
  record('S7', 'workload', pass, {
    ceilingStagedPoints: 4096,
    arithmetic: 'cumulative staged points = window(lookback+2, capped at N) × Σ per-family output series '
      + '(mirrors M19I_B62_SYNC_FAMILIES seriesCount; the prior manifest counted indicators, not series — corrected)',
    typicalSyncStagedPoints: typicalStaged,
    cells: cleanCells,
    beyond: {
      budgetSkips: beyondChart._m19iB62Stats.exactTailBudgetSkips,
      freshAsyncRequests: beyondChart._m19iB62Stats.freshAsyncRequests,
      schedulerRuns: beyondChart._recalcRuns.length,
    },
    w5LegacyMixNote: 'five MA + TEMA is FALLBACK-classified under the corrected mechanism '
      + '(recursive families never bridge synchronously); freshness is owned by the coalesced worker pipeline',
  });
  assert.ok(heaviestOk, 'heaviest supported mix fits the ceiling and bridges every change');
  assert.ok(beyondOk, 'beyond-ceiling: budget-skips + exactly-one fresh request per identity (liveness unconditional)');
  assert.ok(w5Ok, 'legacy W5 mix: fallback-classified with owned eventual freshness');
  assert.ok(typicalOk && heaviestTimingOk && beyondTimingOk,
    `timing (env-qualified): ${JSON.stringify(cleanCells.map((c) => ({ mix: c.mix, p95: c.p95Ms })))}`);
});

// ═══ S8 — W5 provenance (read-only; painted verification BLOCKED) ═══════════

test('S8 W5 provenance: frozen contract pins consumed read-only; painted verification BLOCKED-PROVENANCE; 15× contract is frequency/stale-ratio calibration', () => {
  const contractPath = path.join(ROOT, 'homepage', 'public', 'chart', 'multichart-prod',
    'harness', 'frozen', 'm21-vy-ab-baseline-v1', 'CONTRACT.json');
  assert.ok(fs.existsSync(contractPath), 'W5 frozen contract exists');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  const probePath = path.join(ROOT, 'homepage', 'public', 'chart', 'multichart-prod',
    'harness', 'm21-painted-endpoint-value-y-red-probe.mjs');
  const probeSha = sha256(fs.readFileSync(probePath));
  const pins = contract.pins || contract.contract?.pins || {};
  const pinMatch = pins.probeSha256 ? probeSha === pins.probeSha256 : null;
  // This suite defines NO painted thresholds and never claims painted GREEN.
  const self = fs.readFileSync(__filename, 'utf8');
  assert.ok(!/MAX_Y_PX\s*=\s*[0-9]|maxYPx\s*=\s*[0-9]/.test(self), 'no threshold constants here');
  record('S8', 'provenance', true, {
    paintedVerification: 'BLOCKED-PROVENANCE',
    paintedAB: 'NOT REQUESTED — forbidden until mechanism acceptance and W5 v2.2 acceptance',
    reason: 'W5 frozen baseline (m21-vy-ab-baseline-v1) is PRELIMINARY-PENDING-GPT56-BASELINE-ACCEPTANCE',
    frozenContractId: contract.contractId || contract.id || 'm21-vy-ab-baseline-v1',
    probeSha256: probeSha,
    probeMatchesFrozenPin: pinMatch,
    fifteenXContract: 'calibration cell: painted-fail FREQUENCY and stale-ratio must not exceed the frozen '
      + 'b61 baseline class 15X-ELEVATION-MIXED-PAINTED-AND-OTHER; no maxY≈0.5px envelope is asserted',
    thresholdsOwner: 'W5 probe env/defaults under the frozen pin',
  });
});

// ─── Evidence writer (hash-bound; RED / GREEN / KILL) ───────────────────────

test.after(() => {
  const mode = String(process.env.M19I_B62_EVIDENCE || '').trim().toLowerCase();
  if (!mode) return;
  const b61 = b61Sources();
  const cur = currentSources();
  const outDir = path.join(ROOT, 'docs', 'plan3', 'evidence');
  fs.mkdirSync(outDir, { recursive: true });
  const base = {
    ticket: 'W1-B62-EXACT-TAIL-MECHANISM-CORRECTION',
    stamp: 'PENDING-FRESH-GPT-MECHANISM-REVIEW',
    date: '2026-07-24',
    killSwitch: KILL,
    paintedGreenClaimed: false,
    paintedABRequested: false,
    paintedVerification: 'BLOCKED until mechanism acceptance and W5 v2.2 acceptance',
    supersedesBlockedTreeSha256: BLOCKED_TREE_SHA256,
    productPins: {
      b61: { git: B61_PIN, sha256: b61.hashes },
      rejectedR3: rejectedR3Sources().hashes,
      b62WorkingTree: cur.hashes,
    },
    suiteSha256: sha256(fs.readFileSync(__filename)),
  };
  const byCell = (cells) => results.filter((r) => cells.includes(r.cell));
  const verdictOf = (rs) => (rs.length > 0 && rs.every((r) => r.pass) ? 'CLEAN' : 'NOT-CLEAN-INVESTIGATE');
  const files = {
    red: {
      name: 'W1-B62-EXACT-TAIL-20260724-red.json',
      body: {
        ...base,
        cellGroup: 'mechanism RED — immutable b61 plus exact rejected R3 bbc17f6d executable causal failures',
        verdict: verdictOf(byCell(['b61-red', 'rejected-r3-red', 'provenance'])) === 'CLEAN'
          ? 'B61-AND-REJECTED-R3-MECHANISM-RED-REAL-PATH' : 'NOT-CLEAN-INVESTIGATE',
        results: byCell(['b61-red', 'rejected-r3-red', 'provenance']),
      },
    },
    green: {
      name: 'W1-B62-EXACT-TAIL-20260724-green.json',
      body: {
        ...base,
        cellGroup: 'b62 corrected mechanism ON (whole-paint atomicity + eventual fresh + identity + 52-row matrix + workload truth)',
        verdict: verdictOf(byCell(['green-on', 'parity', 'workload', 'provenance'])) === 'CLEAN'
          ? 'LOCAL-MECHANISM-GREEN-NOT-ACCEPTING' : 'NOT-CLEAN-INVESTIGATE',
        results: byCell(['green-on', 'parity', 'workload', 'provenance']),
      },
    },
    kill: {
      name: 'W1-B62-EXACT-TAIL-20260724-kill.json',
      body: {
        ...base,
        cellGroup: 'switch OFF — exact b61 (overwrite/blit reproduction + object-key/state diff + ON→OFF freeze + OFF→ON self-heal)',
        verdict: verdictOf(byCell(['kill-red'])) === 'CLEAN'
          ? 'KILL-DISCRIMINATOR-CLEAN' : 'NOT-CLEAN-INVESTIGATE',
        results: byCell(['kill-red']),
      },
    },
  };
  const wanted = mode === 'all' ? ['red', 'green', 'kill'] : [mode];
  for (const w of wanted) {
    if (!files[w]) continue;
    fs.writeFileSync(path.join(outDir, files[w].name),
      JSON.stringify(files[w].body, null, 2) + '\n', 'utf8');
  }
});
