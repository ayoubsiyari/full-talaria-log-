/**
 * M20-A — timezone-manager.js listener subscribe/unsubscribe API gate
 * (Fable correction of GPT-blocked Composer land BLOCK-TIMEZONE-API).
 *
 * STATUS: PENDING-FRESH-GPT-REVIEW — no self-accept.
 * Caller lifecycle: RED-PENDING-SHARED-FILE-UNLOCK (chart.js / replay-system /
 * economic-news remain locked; their leak stays RED here by design).
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m20-a-timezone-listener-api.red.test.mjs"
 *
 * Evidence (no-write by default; explicit opt-in only, atomic tmp+rename):
 *   M20_A_TZ_EVIDENCE=red|green|kill
 *   → docs/plan3/evidence/W4-M20-A-TIMEZONE-API-20260724-<mode>.json
 *
 * Honesty rules enforced by this suite:
 * - RED rows execute the immutable committed HEAD blob
 *   (git show HEAD:"chart v 1.4/chart/modules/timezone-manager.js",
 *   sha256-pinned) in a fresh Node VM — never post-land product rows
 *   relabeled as pre-fix RED.
 * - GREEN rows execute the current corrected product in a fresh Node VM.
 * - kill rows execute the current product with the real kill switch and are
 *   compared against the executed HEAD blob for exact-legacy discrimination.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  M20_A_TZ_CALLER_MANIFEST,
  M20_A_TZ_CALLER_PHASE,
  M20_A_TZ_COMPOSER_HUNKS,
  M20_A_TZ_EVIDENCE_ENV,
  M20_A_TZ_EVIDENCE_RELS,
  M20_A_TZ_HASH_BIND_PATHS,
  M20_A_TZ_KILL_SWITCH as KS,
  M20_A_TZ_MANIFEST_REL,
  M20_A_TZ_NOTIFY_PASS_BUDGET as PASS_BUDGET,
  M20_A_TZ_PROVENANCE,
  M20_A_TZ_SEAL_REL,
  M20_A_TZ_STATUS,
  m20ATzListenerUnsubEnabled,
} from './m20-a-timezone-listener-api-contract.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Canonical-root markers (ALL required; docs/plan3 alone is ambiguous). */
const ROOT_MARKERS = [
  '.git',
  path.join('docs', 'plan3', 'PLAN3-BOARD.md'),
  path.join('chart v 1.4', 'chart'),
  path.join('homepage', 'public', 'chart'),
];

function assertCanonicalRoot(root) {
  const missing = ROOT_MARKERS.filter((m) => !fs.existsSync(path.join(root, m)));
  if (missing.length) {
    throw new Error(`refusing non-canonical root ${root}; missing markers: ${missing.join(', ')}`);
  }
  return root;
}

/**
 * Resolve the canonical repo root by marker-walking up from this module's
 * directory (cwd-independent; identical for the canonical and homepage
 * entrypoint copies). Fail closed: exactly one ancestor may match.
 */
function resolveRepoRootStrict(start) {
  const matches = [];
  let dir = start;
  for (let i = 0; i < 16; i += 1) {
    if (ROOT_MARKERS.every((m) => fs.existsSync(path.join(dir, m)))) matches.push(dir);
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  if (matches.length !== 1) {
    throw new Error(`canonical repo root ambiguous or missing above ${start}: ${matches.length} matches`);
  }
  return matches[0];
}

const REPO_ROOT = resolveRepoRootStrict(__dirname);
// Tree roots derive from the validated canonical root, NOT from which copy of
// this file is executing — both entrypoints read identical sources.
const CHART_ROOT = path.join(REPO_ROOT, 'chart v 1.4', 'chart');
const HOMEPAGE_CHART = path.join(REPO_ROOT, 'homepage', 'public', 'chart');
const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs', 'plan3', 'evidence');
const TZ_REL = 'chart v 1.4/chart/modules/timezone-manager.js';

const evidenceMode = String(process.env[M20_A_TZ_EVIDENCE_ENV] || '').toLowerCase();
const evidenceRows = [];

function note(phase, name, pass, detail = '') {
  evidenceRows.push({ phase, name, pass: !!pass, detail: String(detail) });
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} [${phase}] ${name}${detail ? ` — ${detail}` : ''}\n`);
}

function read(rel) {
  return fs.readFileSync(path.join(CHART_ROOT, rel), 'utf8');
}

function readHome(rel) {
  return fs.readFileSync(path.join(HOMEPAGE_CHART, rel), 'utf8');
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function hashRel(relFromRepo) {
  const abs = path.join(REPO_ROOT, relFromRepo);
  return fs.existsSync(abs) ? sha256(fs.readFileSync(abs)) : null;
}

// ─── Real-VM product loaders ───────────────────────────────────────────────

const PRODUCT_SRC = fs.readFileSync(path.join(CHART_ROOT, 'modules/timezone-manager.js'), 'utf8');

let headBlobCache = null;
function headBlob() {
  if (!headBlobCache) {
    headBlobCache = execFileSync('git', ['show', `HEAD:${TZ_REL}`], {
      cwd: REPO_ROOT,
      maxBuffer: 8 * 1024 * 1024,
    });
  }
  return headBlobCache;
}

/**
 * Execute a timezone-manager source blob in a fresh Node VM realm.
 * Returns the manager plus instrumentation (storage writes, warn lines).
 */
function loadTm(source, { kill = false } = {}) {
  const store = new Map();
  const saves = [];
  const warns = [];
  const sandbox = {
    userStorage: {
      getItem(k) { return store.has(k) ? store.get(k) : null; },
      setItem(k, v) { store.set(k, v); saves.push(`${k}=${v}`); },
      removeItem(k) { store.delete(k); },
    },
    console: {
      log() {},
      warn(...a) { warns.push(a.map(String).join(' ')); },
    },
  };
  sandbox.window = { [KS]: kill === true };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(String(source), sandbox, { filename: 'timezone-manager.vm.js' });
  return { tm: sandbox.window.timezoneManager, saves, warns, sandbox };
}

function listenerCount(tm) {
  if (tm && typeof tm._m20ATimezoneListenerCensus === 'function') {
    return tm._m20ATimezoneListenerCensus();
  }
  return tm.listeners.length;
}

function countAddListenerSites(src) {
  return (src.match(/timezoneManager\.addListener\s*\(/g) || []).length;
}

function countRemoveListenerCallSites(src) {
  return (src.match(/timezoneManager\.removeListener\s*\(/g) || []).length;
}

// ─── Provenance & hash binding ─────────────────────────────────────────────

test('M20-A TZ: provenance — corrected product bound; HEAD blob recoverable; pre-land claim verified', () => {
  const current = hashRel(TZ_REL);
  const currentHome = hashRel('homepage/public/chart/modules/timezone-manager.js');
  note('provenance', 'corrected-sha-bound', current === M20_A_TZ_PROVENANCE.correctedSha256,
    `live=${current}`);
  note('provenance', 'corrected-sha-bound-homepage', currentHome === M20_A_TZ_PROVENANCE.correctedSha256,
    `live=${currentHome}`);

  const head = headBlob();
  const headSha = sha256(head);
  note('provenance', 'head-blob-recoverable-and-pinned',
    headSha === M20_A_TZ_PROVENANCE.headBlobSha256, `git-show=${headSha}`);

  const claimed = M20_A_TZ_PROVENANCE.composerClaimedPreLandSha256;
  note('provenance', 'composer-pre-land-claim-verified-against-head-blob',
    M20_A_TZ_PROVENANCE.composerClaimedPreLandRecoverable === true
      && claimed === headSha && claimed !== current,
    `claimed=${claimed}`);

  note('provenance', 'status-pending-fresh-gpt-review', M20_A_TZ_STATUS === 'PENDING-FRESH-GPT-REVIEW');
  note('provenance', 'caller-phase-red-pending-shared-file-unlock',
    M20_A_TZ_CALLER_PHASE === 'RED-PENDING-SHARED-FILE-UNLOCK');
  note('provenance', 'composer-hunk-inventory-complete',
    M20_A_TZ_COMPOSER_HUNKS.length === 8
      && M20_A_TZ_COMPOSER_HUNKS.every((h) => ['RETAINED', 'REWRITTEN', 'DISCARDED', 'NEW-IN-CORRECTION'].includes(h.disposition)),
    M20_A_TZ_COMPOSER_HUNKS.map((h) => `${h.id}:${h.disposition}`).join(' '));

  assert.equal(current, M20_A_TZ_PROVENANCE.correctedSha256);
  assert.equal(currentHome, M20_A_TZ_PROVENANCE.correctedSha256);
  assert.equal(headSha, M20_A_TZ_PROVENANCE.headBlobSha256);
  assert.equal(claimed, headSha);
  assert.notEqual(claimed, current);
});

test('M20-A TZ: dual-tree byte parity for all mirrored API artifacts', () => {
  const pairs = [
    'modules/timezone-manager.js',
    'modules/m20-a-timezone-listener-api-contract.mjs',
    'modules/m20-a-timezone-listener-api.red.test.mjs',
    'modules/m20-a-timezone-browser-gate.mjs',
  ];
  for (const rel of pairs) {
    const same = read(rel) === readHome(rel);
    note('provenance', `dual-tree-parity-${path.basename(rel)}`, same);
    assert.ok(same, `dual-tree mismatch: ${rel}`);
  }
});

// ─── RED — executed committed HEAD blob (pre-API product) ──────────────────

test('M20-A TZ: RED(head-blob) — no subscribe; addListener census leaks; anonymous remove no-op', () => {
  const { tm } = loadTm(headBlob());
  note('head-red', 'head-subscribe-absent', typeof tm.subscribe === 'undefined');

  const base = listenerCount(tm);
  const simulateChartInit = () => tm.addListener(() => {});
  simulateChartInit();               // Chart.init
  tm.addListener(() => {});          // Go-To
  tm.addListener(() => {});          // ReplaySystem.setup
  for (let i = 0; i < 3; i += 1) simulateChartInit(); // 3 panels
  const afterBoot = listenerCount(tm);
  note('head-red', 'head-census-boot-main+goto+replay+3panels', afterBoot === base + 6, `len=${afterBoot}`);

  for (let i = 0; i < 4; i += 1) simulateChartInit(); // relayout w/o destroy
  const afterRelayout = listenerCount(tm);
  note('head-red', 'head-census-grows-on-relayout', afterRelayout > afterBoot,
    `boot=${afterBoot} relayout=${afterRelayout}`);

  tm.removeListener(() => {});
  note('head-red', 'head-anonymous-remove-no-op', listenerCount(tm) === afterRelayout,
    `len=${listenerCount(tm)}`);

  const desiredHolds = listenerCount(tm) <= base + 1;
  note('head-red', 'head-desired-flat-RED', desiredHolds === false, `len=${listenerCount(tm)}`);

  assert.equal(typeof tm.subscribe, 'undefined');
  assert.equal(afterBoot, base + 6);
  assert.ok(afterRelayout > afterBoot);
  assert.equal(desiredHolds, false);
});

test('M20-A TZ: RED(head-blob) — same-timezone reentrancy recurses unboundedly; corrected product does not', () => {
  const CAP = 400; // safety cap so the test itself cannot overflow

  const head = loadTm(headBlob());
  head.tm.setTimezone('Europe/Paris');
  let headDepth = 0;
  head.tm.addListener(() => {
    headDepth += 1;
    if (headDepth < CAP) head.tm.setTimezone('Europe/Paris'); // same id
  });
  const headSavesBefore = head.saves.length;
  head.tm.setTimezone('Europe/Paris'); // HEAD saves+notifies even for same id → recursion
  note('head-red', 'head-same-tz-recursion-reaches-cap', headDepth >= CAP, `depth=${headDepth}`);
  note('head-red', 'head-same-tz-unbounded-writes', head.saves.length - headSavesBefore >= CAP,
    `writes=${head.saves.length - headSavesBefore}`);

  // Contrast rows below execute the CURRENT corrected product and are
  // classified 'green' — they must never appear in the head-red RED array.
  const cur = loadTm(PRODUCT_SRC);
  cur.tm.setTimezone('Europe/Paris');
  let curDepth = 0;
  cur.tm.addListener(() => {
    curDepth += 1;
    cur.tm.setTimezone(cur.tm.getTimezone().id); // unconditional same-tz hammer
  });
  const curSavesBefore = cur.saves.length;
  cur.tm.setTimezone('Asia/Tokyo'); // real change; callback then hammers same-tz
  note('green', 'corrected-same-tz-single-pass', curDepth === 1, `depth=${curDepth}`);
  note('green', 'corrected-same-tz-single-write', cur.saves.length - curSavesBefore === 1,
    `writes=${cur.saves.length - curSavesBefore}`);

  assert.ok(headDepth >= CAP);
  assert.equal(curDepth, 1);
  assert.equal(cur.saves.length - curSavesBefore, 1);
});

// ─── GREEN — corrected product: subscribe / AbortSignal / idempotence ──────

test('M20-A TZ: GREEN — subscribe unsubscribe flat census', () => {
  const { tm } = loadTm(PRODUCT_SRC);
  const base = listenerCount(tm);
  let hits = 0;
  const unsub = tm.subscribe(() => { hits += 1; });
  note('green', 'subscribe-registers-one', listenerCount(tm) === base + 1);
  tm.setTimezone('Europe/Paris');
  note('green', 'subscribe-notifies', hits === 1, `hits=${hits}`);
  unsub();
  note('green', 'unsubscribe-flat', listenerCount(tm) === base);
  unsub();
  note('green', 'unsubscribe-idempotent', listenerCount(tm) === base);
  assert.equal(listenerCount(tm), base);
  assert.equal(hits, 1);
});

test('M20-A TZ: GREEN R4 — private-store insertion resists public/prototype dispatch and fails closed on genuine store insertion errors', () => {
  // Replaced public push must not dispatch, but insertion still succeeds.
  {
    const { tm } = loadTm(PRODUCT_SRC);
    const base = listenerCount(tm);
    let pushDispatched = false;
    let hits = 0;
    tm.listeners.push = () => { pushDispatched = true; throw new Error('public-push-dispatched'); };
    const unsub = tm.subscribe(() => { hits += 1; });
    tm.setTimezone('Europe/Paris');
    note('signal', 'r4-replaced-public-push-no-dispatch-inserts',
      !pushDispatched && hits === 1 && listenerCount(tm) === base + 1,
      `pushDispatched=${pushDispatched} hits=${hits} len=${listenerCount(tm)}`);
    unsub();
    assert.equal(pushDispatched, false);
    assert.equal(listenerCount(tm), base);
  }

  // Whole property replacement must not redirect internal add/remove/notify/census.
  {
    const { tm } = loadTm(PRODUCT_SRC);
    const base = listenerCount(tm);
    let replacementDispatch = 0;
    let hits = 0;
    tm.listeners = { length: 999, push() { replacementDispatch += 1; } };
    const unsub = tm.subscribe(() => { hits += 1; });
    tm.setTimezone('Asia/Tokyo');
    note('signal', 'r4-whole-listeners-property-replacement-ignored',
      replacementDispatch === 0 && hits === 1 && listenerCount(tm) === base + 1,
      `replacementDispatch=${replacementDispatch} hits=${hits} len=${listenerCount(tm)}`);
    unsub();
    assert.equal(listenerCount(tm), base);
  }

  // Replaced Array.prototype.push after module load must not dispatch.
  {
    const { tm, sandbox } = loadTm(PRODUCT_SRC);
    const base = listenerCount(tm);
    let protoDispatch = false;
    const realmArray = vm.runInContext('Array', sandbox);
    const originalPush = realmArray.prototype.push;
    let hits = 0;
    realmArray.prototype.push = function hostilePush() {
      protoDispatch = true;
      throw new Error('prototype-push-dispatched');
    };
    let unsub;
    try {
      unsub = tm.subscribe(() => { hits += 1; });
    } finally {
      realmArray.prototype.push = originalPush;
    }
    tm.setTimezone('Europe/Paris');
    note('signal', 'r4-replaced-array-prototype-push-no-dispatch',
      !protoDispatch && hits === 1 && listenerCount(tm) === base + 1,
      `protoDispatch=${protoDispatch} hits=${hits} len=${listenerCount(tm)}`);
    unsub();
    assert.equal(protoDispatch, false);
    assert.equal(listenerCount(tm), base);
  }

  // Frozen genuine store: captured insertion throws the original error,
  // settles inactive, removes the abort handler once, and never notifies.
  {
    const { tm } = loadTm(PRODUCT_SRC);
    const base = listenerCount(tm);
    let hits = 0;
    let removeCalls = 0;
    let retained = null;
    Object.freeze(tm.listeners);
    const sig = {
      aborted: false,
      addEventListener(type, handler) { retained = handler; },
      removeEventListener() { removeCalls += 1; },
    };
    let thrown = null;
    try {
      tm.subscribe(() => { hits += 1; }, { signal: sig });
    } catch (err) {
      thrown = err;
    }
    assert.doesNotThrow(() => { if (retained) retained(); });
    tm.setTimezone('Europe/Paris');
    note('signal', 'r4-frozen-genuine-store-rethrows-and-detaches-once',
      thrown && thrown.name === 'TypeError' && hits === 0 && listenerCount(tm) === base && removeCalls === 1,
      `thrown=${thrown && thrown.name} hits=${hits} len=${listenerCount(tm)} removeCalls=${removeCalls}`);
    assert.equal(thrown && thrown.name, 'TypeError');
  }

  // Nonwritable Array length is a second genuine insertion failure mode.
  {
    const { tm } = loadTm(PRODUCT_SRC);
    const base = listenerCount(tm);
    let hits = 0;
    let removeCalls = 0;
    Object.defineProperty(tm.listeners, 'length', { writable: false });
    const sig = {
      aborted: false,
      addEventListener() {},
      removeEventListener() { removeCalls += 1; },
    };
    let thrown = null;
    try {
      tm.subscribe(() => { hits += 1; }, { signal: sig });
    } catch (err) {
      thrown = err;
    }
    tm.setTimezone('Asia/Tokyo');
    note('signal', 'r4-nonwritable-genuine-store-rethrows-and-stays-inert',
      thrown && thrown.name === 'TypeError' && hits === 0 && listenerCount(tm) === base && removeCalls === 1,
      `thrown=${thrown && thrown.name} hits=${hits} len=${listenerCount(tm)} removeCalls=${removeCalls}`);
    assert.equal(thrown && thrown.name, 'TypeError');
  }
});

test('M20-A TZ: GREEN — AbortSignal pre/post abort; duplicate handles independent', () => {
  const { tm } = loadTm(PRODUCT_SRC);
  const base = listenerCount(tm);

  const pre = new AbortController();
  pre.abort();
  tm.subscribe(() => {}, { signal: pre.signal });
  note('green', 'pre-aborted-no-register', listenerCount(tm) === base);

  let a = 0;
  const cb = () => { a += 1; };
  const unsubA = tm.subscribe(cb);
  const unsubB = tm.subscribe(cb);
  note('green', 'duplicate-callback-two-handles', listenerCount(tm) === base + 2);
  unsubA();
  note('green', 'duplicate-unsub-one-leaves-one', listenerCount(tm) === base + 1);
  unsubB();
  note('green', 'duplicate-unsub-both-flat', listenerCount(tm) === base);

  const ac = new AbortController();
  let b = 0;
  const acSub = tm.subscribe(() => { b += 1; }, { signal: ac.signal });
  tm.setTimezone('Asia/Tokyo');
  ac.abort();
  note('green', 'abort-removes-once', listenerCount(tm) === base, `b=${b}`);
  ac.abort(); // repeated abort — must stay flat, no throw
  note('green', 'repeated-abort-no-effect', listenerCount(tm) === base);
  acSub();
  note('green', 'post-abort-unsub-no-op', listenerCount(tm) === base);

  assert.equal(listenerCount(tm), base);
  assert.equal(b, 1);
  assert.ok(a >= 0);
});

test('M20-A TZ: GREEN — non-function rejected; mutation/throw/unsub-during-notify tolerance', () => {
  const { tm } = loadTm(PRODUCT_SRC);
  const base = listenerCount(tm);

  const noop = tm.subscribe(null);
  noop();
  note('green', 'non-function-no-register', listenerCount(tm) === base);

  const unsubThrow = tm.subscribe(() => { throw new Error('tz-cb-throw'); });
  let after = 0;
  const unsubAfter = tm.subscribe(() => { after += 1; });
  assert.doesNotThrow(() => tm.setTimezone('Europe/Paris'));
  note('green', 'callback-throw-contained-others-run', after === 1, `after=${after}`);
  unsubThrow();
  unsubAfter();

  let notified = 0;
  const u1 = tm.subscribe(() => { notified += 1; });
  const u2 = tm.subscribe(() => {
    u1();
    notified += 1;
  });
  tm.setTimezone('Asia/Tokyo');
  u2();
  note('green', 'unsubscribe-during-notify', notified >= 2 && listenerCount(tm) === base,
    `notified=${notified} len=${listenerCount(tm)}`);

  assert.equal(listenerCount(tm), base);
});

// ─── GREEN — malformed / hostile signal suite (fail-closed, atomic) ────────

test('M20-A TZ: GREEN — malformed signal suite: throwing getters/methods, partial objects', () => {
  const { tm } = loadTm(PRODUCT_SRC);
  const base = listenerCount(tm);

  // throwing options.signal getter
  assert.doesNotThrow(() => {
    const u = tm.subscribe(() => {}, { get signal() { throw new Error('hostile-options'); } });
    u();
  });
  note('signal', 'throwing-options-signal-getter-fail-closed', listenerCount(tm) === base);

  // throwing signal.aborted getter
  assert.doesNotThrow(() => {
    const u = tm.subscribe(() => {}, {
      signal: {
        get aborted() { throw new Error('hostile-aborted'); },
        addEventListener() {},
        removeEventListener() {},
      },
    });
    u();
  });
  note('signal', 'throwing-aborted-getter-fail-closed', listenerCount(tm) === base);

  // partial objects / malformed methods
  for (const [label, sig] of [
    ['empty-object', {}],
    ['aborted-only', { aborted: false }],
    ['no-removeEventListener', { aborted: false, addEventListener() {} }],
    ['no-addEventListener', { aborted: false, removeEventListener() {} }],
    ['non-function-methods', { aborted: false, addEventListener: 1, removeEventListener: 1 }],
    ['number-signal', 7],
    ['string-signal', 'abort'],
  ]) {
    assert.doesNotThrow(() => { tm.subscribe(() => {}, { signal: sig })(); });
    note('signal', `partial-${label}-fail-closed`, listenerCount(tm) === base);
  }

  // null/undefined signal → normal registration (not fail-closed)
  const u1 = tm.subscribe(() => {}, { signal: null });
  const u2 = tm.subscribe(() => {}, { signal: undefined });
  const u3 = tm.subscribe(() => {});
  note('signal', 'null-undefined-signal-registers', listenerCount(tm) === base + 3);
  u1(); u2(); u3();
  note('signal', 'null-undefined-signal-cleans', listenerCount(tm) === base);

  assert.equal(listenerCount(tm), base);
});

test('M20-A TZ: GREEN — hostile attach: throwing addEventListener rolls back; sync abort during attach leaves no leak', () => {
  const { tm } = loadTm(PRODUCT_SRC);
  const base = listenerCount(tm);

  // throwing addEventListener → rollback, nothing thrown outward
  let removeCalls = 0;
  assert.doesNotThrow(() => {
    const u = tm.subscribe(() => {}, {
      signal: {
        aborted: false,
        addEventListener() { throw new Error('hostile-attach'); },
        removeEventListener() { removeCalls += 1; },
      },
    });
    u(); u();
  });
  note('signal', 'throwing-addEventListener-rollback-flat', listenerCount(tm) === base,
    `len=${listenerCount(tm)}`);

  // synchronous malicious abort dispatched from inside addEventListener
  let retained = null;
  let hits = 0;
  const syncAbort = {
    aborted: false,
    addEventListener(type, handler) {
      retained = handler;
      handler(); // synchronous dispatch during attach
    },
    removeEventListener() {},
  };
  let unsub;
  assert.doesNotThrow(() => { unsub = tm.subscribe(() => { hits += 1; }, { signal: syncAbort }); });
  note('signal', 'sync-abort-during-attach-flat', listenerCount(tm) === base, `len=${listenerCount(tm)}`);
  tm.setTimezone('Europe/Paris');
  note('signal', 'sync-abort-no-delivery', hits === 0, `hits=${hits}`);
  // externally retained handler stays inert forever
  assert.doesNotThrow(() => { retained(); retained(); });
  unsub();
  note('signal', 'retained-handler-inert-after-settle', listenerCount(tm) === base && hits === 0);

  assert.equal(listenerCount(tm), base);
});

test('M20-A TZ: GREEN — check→attach abort race closed; detach exactly once; throwing removeEventListener contained', () => {
  const { tm } = loadTm(PRODUCT_SRC);
  const base = listenerCount(tm);

  // race: aborted=false at first read, true right after attach; real signals
  // never fire listeners added post-abort, so subscribe must self-rollback.
  let reads = 0;
  let removeCalls = 0;
  const racySignal = {
    get aborted() { reads += 1; return reads > 1; },
    addEventListener() { /* records but never dispatches */ },
    removeEventListener() { removeCalls += 1; },
  };
  const u = tm.subscribe(() => {}, { signal: racySignal });
  note('signal', 'post-attach-abort-race-rolled-back', listenerCount(tm) === base,
    `len=${listenerCount(tm)}`);
  note('signal', 'race-detach-exactly-once', removeCalls === 1, `removeCalls=${removeCalls}`);
  u(); u();
  note('signal', 'race-detach-still-once-after-unsub', removeCalls === 1, `removeCalls=${removeCalls}`);

  // normal signal: detach exactly once across unsubscribe + abort + repeats
  let normRemove = 0;
  let normRetained = null;
  const normSignal = {
    aborted: false,
    addEventListener(type, handler) { normRetained = handler; },
    removeEventListener() { normRemove += 1; },
  };
  const nu = tm.subscribe(() => {}, { signal: normSignal });
  note('signal', 'normal-fake-signal-registers', listenerCount(tm) === base + 1);
  nu();
  normRetained(); // simulated late abort after manual unsubscribe → inert
  nu();
  note('signal', 'manual-unsub-detach-exactly-once', normRemove === 1 && listenerCount(tm) === base,
    `removeCalls=${normRemove}`);

  // throwing removeEventListener: unsubscribe never throws; wrapper still removed first
  let hostileRetained = null;
  const hostileRemove = {
    aborted: false,
    addEventListener(type, handler) { hostileRetained = handler; },
    removeEventListener() { throw new Error('hostile-remove'); },
  };
  let hits = 0;
  const hu = tm.subscribe(() => { hits += 1; }, { signal: hostileRemove });
  assert.doesNotThrow(() => { hu(); hu(); });
  note('signal', 'throwing-removeEventListener-contained-flat', listenerCount(tm) === base,
    `len=${listenerCount(tm)}`);
  tm.setTimezone('Asia/Tokyo');
  assert.doesNotThrow(() => { hostileRetained(); });
  note('signal', 'hostile-remove-retained-handler-inert', hits === 0, `hits=${hits}`);

  assert.equal(listenerCount(tm), base);
  assert.equal(removeCalls, 1);
  assert.equal(normRemove, 1);
});

test('M20-A TZ: GREEN — two-phase opacity: subscription invisible during hostile attach; no callback before return', () => {
  // (a) successful hostile-but-valid attach: snooping addEventListener that
  // inspects census and forces a notify DURING attach.
  {
    const { tm } = loadTm(PRODUCT_SRC);
    const base = listenerCount(tm);
    let hits = 0;
    let censusDuringAttach = -1;
    let hitsDuringAttach = -1;
    let retained = null;
    let removeCalls = 0;
    const snoop = {
      aborted: false,
      addEventListener(type, handler) {
        censusDuringAttach = listenerCount(tm);
        tm.setTimezone('Asia/Tokyo'); // hostile notify while attaching
        hitsDuringAttach = hits;
        retained = handler;
      },
      removeEventListener() { removeCalls += 1; },
    };
    let unsub;
    assert.doesNotThrow(() => { unsub = tm.subscribe(() => { hits += 1; }, { signal: snoop }); });
    note('signal', 'opaque-success-census-0-during-attach', censusDuringAttach === base,
      `censusDelta=${censusDuringAttach - base}`);
    note('signal', 'opaque-success-no-callback-before-return', hitsDuringAttach === 0 && hits === 0,
      `hitsDuringAttach=${hitsDuringAttach} hitsAtReturn=${hits}`);
    note('signal', 'opaque-success-commits-after-return', listenerCount(tm) === base + 1,
      `len=${listenerCount(tm)}`);
    tm.setTimezone('Europe/Paris');
    note('signal', 'opaque-success-notifies-after-commit', hits === 1, `hits=${hits}`);
    retained(); // abort after commit → unsubscribes exactly once
    note('signal', 'opaque-success-abort-after-commit-flat',
      listenerCount(tm) === base && removeCalls === 1, `len=${listenerCount(tm)} removeCalls=${removeCalls}`);
    unsub(); // idempotent post-abort
    note('signal', 'opaque-success-post-abort-unsub-noop',
      listenerCount(tm) === base && removeCalls === 1);
    assert.equal(hits, 1);
  }

  // (b) synchronous abort dispatched during attach: pending/inert, never committed.
  {
    const { tm } = loadTm(PRODUCT_SRC);
    const base = listenerCount(tm);
    let hits = 0;
    let censusDuringAttach = -1;
    let retained = null;
    const snoop = {
      aborted: false,
      addEventListener(type, handler) {
        censusDuringAttach = listenerCount(tm);
        retained = handler;
        handler();                    // synchronous abort while uncommitted
        tm.setTimezone('Asia/Tokyo'); // hostile notify after the sync abort
      },
      removeEventListener() {},
    };
    assert.doesNotThrow(() => { tm.subscribe(() => { hits += 1; }, { signal: snoop }); });
    note('signal', 'opaque-syncabort-census-0-during-attach', censusDuringAttach === base,
      `censusDelta=${censusDuringAttach - base}`);
    tm.setTimezone('Europe/Paris');
    note('signal', 'opaque-syncabort-callback-never-fires', hits === 0, `hits=${hits}`);
    note('signal', 'opaque-syncabort-final-census-0', listenerCount(tm) === base,
      `len=${listenerCount(tm)}`);
    assert.doesNotThrow(() => { retained(); retained(); });
    note('signal', 'opaque-syncabort-retained-handler-inert',
      hits === 0 && listenerCount(tm) === base);
    assert.equal(hits, 0);
  }

  // (c) throwing attach: fail-soft detach attempted; nothing ever visible.
  {
    const { tm } = loadTm(PRODUCT_SRC);
    const base = listenerCount(tm);
    let hits = 0;
    let censusDuringAttach = -1;
    let removeCalls = 0;
    const snoop = {
      aborted: false,
      addEventListener() {
        censusDuringAttach = listenerCount(tm);
        tm.setTimezone('Asia/Tokyo');
        throw new Error('hostile-attach');
      },
      removeEventListener() { removeCalls += 1; },
    };
    assert.doesNotThrow(() => { tm.subscribe(() => { hits += 1; }, { signal: snoop })(); });
    note('signal', 'opaque-throwattach-census-0-during-attach', censusDuringAttach === base,
      `censusDelta=${censusDuringAttach - base}`);
    note('signal', 'opaque-throwattach-failsoft-detach', removeCalls === 1, `removeCalls=${removeCalls}`);
    tm.setTimezone('Europe/Paris');
    note('signal', 'opaque-throwattach-no-callback-final-census-0',
      hits === 0 && listenerCount(tm) === base, `hits=${hits} len=${listenerCount(tm)}`);
    assert.equal(hits, 0);
  }

  // (d) racy post-attach recheck: invisible for the entire attach window.
  {
    const { tm } = loadTm(PRODUCT_SRC);
    const base = listenerCount(tm);
    let hits = 0;
    let reads = 0;
    let censusDuringAttach = -1;
    let removeCalls = 0;
    const snoop = {
      get aborted() { reads += 1; return reads > 1; },
      addEventListener() { censusDuringAttach = listenerCount(tm); tm.setTimezone('Asia/Tokyo'); },
      removeEventListener() { removeCalls += 1; },
    };
    assert.doesNotThrow(() => { tm.subscribe(() => { hits += 1; }, { signal: snoop }); });
    note('signal', 'opaque-recheck-census-0-during-attach', censusDuringAttach === base,
      `censusDelta=${censusDuringAttach - base}`);
    note('signal', 'opaque-recheck-final-census-0-detach-once',
      listenerCount(tm) === base && removeCalls === 1 && hits === 0,
      `len=${listenerCount(tm)} removeCalls=${removeCalls}`);
    assert.equal(hits, 0);
  }

  // (e) snooping METHOD GETTERS: accessor reads must observe zero census and
  // trigger zero callbacks before subscribe returns; commit still succeeds.
  {
    const { tm } = loadTm(PRODUCT_SRC);
    const base = listenerCount(tm);
    let hits = 0;
    const censusReads = [];
    const addFn = (type, handler) => { censusReads.push(listenerCount(tm)); void handler; };
    const removeFn = () => {};
    const snoop = {
      get aborted() { censusReads.push(listenerCount(tm)); tm.setTimezone('Asia/Tokyo'); return false; },
      get addEventListener() { censusReads.push(listenerCount(tm)); return addFn; },
      get removeEventListener() { censusReads.push(listenerCount(tm)); return removeFn; },
    };
    let unsub;
    assert.doesNotThrow(() => { unsub = tm.subscribe(() => { hits += 1; }, { signal: snoop }); });
    note('signal', 'opaque-getters-census-0-during-all-reads',
      censusReads.length >= 3 && censusReads.every((c) => c === base),
      `reads=${censusReads.length} values=${censusReads.join(',')}`);
    note('signal', 'opaque-getters-no-callback-before-return', hits === 0, `hits=${hits}`);
    note('signal', 'opaque-getters-commit-succeeds', listenerCount(tm) === base + 1,
      `len=${listenerCount(tm)}`);
    tm.setTimezone('Europe/Paris');
    note('signal', 'opaque-getters-notifies-after-commit', hits === 1, `hits=${hits}`);
    unsub();
    note('signal', 'opaque-getters-unsub-flat', listenerCount(tm) === base);
    assert.equal(listenerCount(tm), base);
  }
});

test('M20-A TZ: GREEN — sticky abort-seen: pre-commit abort dispatch is never lost (round-3 regression)', () => {
  // (1) ROUND-3 BLOCKER regression: the SECOND `aborted` getter read (the
  // post-attach recheck) synchronously invokes the retained abort handler,
  // then returns false. A sticky abort-seen flag plus a final pre-commit
  // gate must prevent commit: afterReturn census 0, hits 0 forever.
  {
    const { tm } = loadTm(PRODUCT_SRC);
    const base = listenerCount(tm);
    let hits = 0;
    let reads = 0;
    let retained = null;
    let removeCalls = 0;
    const sig = {
      get aborted() {
        reads += 1;
        if (reads >= 2 && retained) retained(); // dispatch during recheck…
        return false;                           // …then lie: "not aborted"
      },
      addEventListener(type, handler) { retained = handler; },
      removeEventListener() { removeCalls += 1; },
    };
    let unsub;
    assert.doesNotThrow(() => { unsub = tm.subscribe(() => { hits += 1; }, { signal: sig }); });
    const censusAfterReturn = listenerCount(tm) - base;
    tm.setTimezone('Europe/Paris'); // later notify
    const hitsAfterNotify = hits;
    note('signal', 'sticky-abort-post-attach-getter-dispatch-return-false',
      censusAfterReturn === 0 && hitsAfterNotify === 0
        && listenerCount(tm) === base && removeCalls === 1,
      `afterReturnCensus=${censusAfterReturn} hitsAfterNotify=${hitsAfterNotify} `
      + `removeCalls=${removeCalls} getterReads=${reads}`);
    assert.doesNotThrow(() => { unsub(); unsub(); });
    assert.doesNotThrow(() => { retained(); retained(); });
    tm.setTimezone('Asia/Tokyo');
    note('signal', 'sticky-abort-retained-handler-inert-forever',
      hits === 0 && listenerCount(tm) === base && removeCalls === 1,
      `hits=${hits} len=${listenerCount(tm)} removeCalls=${removeCalls}`);
    assert.equal(censusAfterReturn, 0,
      `LOST ABORT: wrapper committed after recheck-dispatch (census=${censusAfterReturn})`);
    assert.equal(hits, 0, `LOST ABORT: callback fired ${hits}× after recheck-dispatch abort`);
  }

  // (2) recheck getter dispatches then returns TRUE: same inert outcome.
  {
    const { tm } = loadTm(PRODUCT_SRC);
    const base = listenerCount(tm);
    let hits = 0;
    let reads = 0;
    let retained = null;
    let removeCalls = 0;
    const sig = {
      get aborted() { reads += 1; if (reads >= 2 && retained) retained(); return reads >= 2; },
      addEventListener(type, handler) { retained = handler; },
      removeEventListener() { removeCalls += 1; },
    };
    assert.doesNotThrow(() => { tm.subscribe(() => { hits += 1; }, { signal: sig }); });
    tm.setTimezone('Europe/Paris');
    note('signal', 'sticky-abort-recheck-dispatch-return-true',
      hits === 0 && listenerCount(tm) === base && removeCalls === 1,
      `hits=${hits} len=${listenerCount(tm)} removeCalls=${removeCalls}`);
    assert.equal(hits, 0);
  }

  // (3) recheck getter dispatches then THROWS: contained, inert.
  {
    const { tm } = loadTm(PRODUCT_SRC);
    const base = listenerCount(tm);
    let hits = 0;
    let reads = 0;
    let retained = null;
    let removeCalls = 0;
    const sig = {
      get aborted() {
        reads += 1;
        if (reads >= 2) { if (retained) retained(); throw new Error('hostile-recheck'); }
        return false;
      },
      addEventListener(type, handler) { retained = handler; },
      removeEventListener() { removeCalls += 1; },
    };
    assert.doesNotThrow(() => { tm.subscribe(() => { hits += 1; }, { signal: sig }); });
    tm.setTimezone('Europe/Paris');
    note('signal', 'sticky-abort-recheck-dispatch-then-throw',
      hits === 0 && listenerCount(tm) === base && removeCalls === 1,
      `hits=${hits} len=${listenerCount(tm)} removeCalls=${removeCalls}`);
    assert.equal(hits, 0);
  }

  // (4) REPEATED dispatch across attach + recheck: sticky flag latches once.
  {
    const { tm } = loadTm(PRODUCT_SRC);
    const base = listenerCount(tm);
    let hits = 0;
    let retained = null;
    let removeCalls = 0;
    const sig = {
      get aborted() { if (retained) { retained(); retained(); } return false; },
      addEventListener(type, handler) { retained = handler; handler(); handler(); },
      removeEventListener() { removeCalls += 1; },
    };
    assert.doesNotThrow(() => { tm.subscribe(() => { hits += 1; }, { signal: sig }); });
    tm.setTimezone('Europe/Paris');
    assert.doesNotThrow(() => { retained(); });
    note('signal', 'sticky-abort-repeated-dispatch-latches-once',
      hits === 0 && listenerCount(tm) === base && removeCalls === 1,
      `hits=${hits} len=${listenerCount(tm)} removeCalls=${removeCalls}`);
    assert.equal(hits, 0);
  }

  // (5) METHOD GETTER dispatch: `removeEventListener` accessor fires the
  // retained handler during the fail-path detach — must be inert (settled).
  {
    const { tm } = loadTm(PRODUCT_SRC);
    const base = listenerCount(tm);
    let hits = 0;
    let reads = 0;
    let retained = null;
    let removeCalls = 0;
    const removeFn = () => { removeCalls += 1; };
    const sig = {
      get aborted() { reads += 1; if (reads >= 2 && retained) retained(); return false; },
      addEventListener(type, handler) { retained = handler; },
      get removeEventListener() {
        if (retained && removeCalls === 0) retained(); // dispatch during detach lookup
        return removeFn;
      },
    };
    assert.doesNotThrow(() => { tm.subscribe(() => { hits += 1; }, { signal: sig }); });
    tm.setTimezone('Europe/Paris');
    note('signal', 'sticky-abort-method-getter-dispatch-inert',
      hits === 0 && listenerCount(tm) === base && removeCalls === 1,
      `hits=${hits} len=${listenerCount(tm)} removeCalls=${removeCalls}`);
    assert.equal(hits, 0);
  }

  // (6) addEventListener dispatch (sync abort during attach) under sticky
  // naming: never committed, never delivered.
  {
    const { tm } = loadTm(PRODUCT_SRC);
    const base = listenerCount(tm);
    let hits = 0;
    let retained = null;
    let removeCalls = 0;
    const sig = {
      aborted: false,
      addEventListener(type, handler) { retained = handler; handler(); },
      removeEventListener() { removeCalls += 1; },
    };
    assert.doesNotThrow(() => { tm.subscribe(() => { hits += 1; }, { signal: sig }); });
    tm.setTimezone('Europe/Paris');
    note('signal', 'sticky-abort-addEventListener-dispatch',
      hits === 0 && listenerCount(tm) === base && removeCalls === 1,
      `hits=${hits} len=${listenerCount(tm)} removeCalls=${removeCalls}`);
    assert.equal(hits, 0);
  }

  // (7) DETACH THROW on the abort-seen fail path: contained, still inert.
  {
    const { tm } = loadTm(PRODUCT_SRC);
    const base = listenerCount(tm);
    let hits = 0;
    let reads = 0;
    let retained = null;
    const sig = {
      get aborted() { reads += 1; if (reads >= 2 && retained) retained(); return false; },
      addEventListener(type, handler) { retained = handler; },
      removeEventListener() { throw new Error('hostile-detach'); },
    };
    assert.doesNotThrow(() => { tm.subscribe(() => { hits += 1; }, { signal: sig }); });
    tm.setTimezone('Europe/Paris');
    assert.doesNotThrow(() => { retained(); });
    note('signal', 'sticky-abort-detach-throw-contained',
      hits === 0 && listenerCount(tm) === base,
      `hits=${hits} len=${listenerCount(tm)}`);
    assert.equal(hits, 0);
  }

  // (8) reentrant FORCED NOTIFY during every hostile phase (validation read,
  // attach, recheck) combined with a recheck dispatch: census/hits stay 0
  // during hostile code and forever after.
  {
    const { tm } = loadTm(PRODUCT_SRC);
    const base = listenerCount(tm);
    let hits = 0;
    let reads = 0;
    let retained = null;
    let removeCalls = 0;
    const censusProbes = [];
    const probe = () => { censusProbes.push([listenerCount(tm) - base, hits]); };
    const sig = {
      get aborted() {
        reads += 1;
        tm.setTimezone(reads % 2 ? 'Asia/Tokyo' : 'Europe/Paris'); // forced notify
        probe();
        if (reads >= 2 && retained) { retained(); tm.setTimezone('UTC'); probe(); }
        return false;
      },
      addEventListener(type, handler) {
        retained = handler;
        tm.setTimezone('America/New_York'); // forced notify while attaching
        probe();
      },
      removeEventListener() { removeCalls += 1; tm.setTimezone('Europe/London'); probe(); },
    };
    assert.doesNotThrow(() => { tm.subscribe(() => { hits += 1; }, { signal: sig }); });
    tm.setTimezone('Australia/Sydney');
    const allQuiet = censusProbes.every(([c, h]) => c === 0 && h === 0);
    note('signal', 'sticky-abort-reentrant-notify-every-phase-quiet',
      allQuiet && hits === 0 && listenerCount(tm) === base && removeCalls === 1,
      `probes=${censusProbes.length} allQuiet=${allQuiet} hits=${hits} removeCalls=${removeCalls}`);
    assert.equal(hits, 0);
    assert.ok(censusProbes.length >= 4);
  }

  // (9) CONTROL — successful attach with a non-dispatching recheck getter:
  // commits, delivers exactly once per change, aborts exactly once.
  {
    const { tm } = loadTm(PRODUCT_SRC);
    const base = listenerCount(tm);
    let hits = 0;
    let retained = null;
    let removeCalls = 0;
    const sig = {
      get aborted() { return false; },
      addEventListener(type, handler) { retained = handler; },
      removeEventListener() { removeCalls += 1; },
    };
    let unsub;
    assert.doesNotThrow(() => { unsub = tm.subscribe(() => { hits += 1; }, { signal: sig }); });
    note('signal', 'sticky-abort-control-commits', listenerCount(tm) === base + 1,
      `len=${listenerCount(tm)}`);
    tm.setTimezone('Europe/Paris');
    retained(); // real abort after commit
    tm.setTimezone('Asia/Tokyo');
    unsub();
    note('signal', 'sticky-abort-control-exactly-once',
      hits === 1 && listenerCount(tm) === base && removeCalls === 1,
      `hits=${hits} len=${listenerCount(tm)} removeCalls=${removeCalls}`);
    assert.equal(hits, 1);
  }
});

// ─── GREEN — bounded reentrancy / idempotence ──────────────────────────────

test('M20-A TZ: GREEN — same-timezone set idempotent: no duplicate save, no notify', () => {
  const { tm, saves } = loadTm(PRODUCT_SRC);
  tm.setTimezone('Europe/Paris');
  let hits = 0;
  const unsub = tm.subscribe(() => { hits += 1; });

  const savesBefore = saves.length;
  const r = tm.setTimezone('Europe/Paris');
  note('green', 'same-tz-returns-true', r === true);
  note('green', 'same-tz-no-duplicate-save', saves.length === savesBefore, `saves=${saves.length - savesBefore}`);
  note('green', 'same-tz-no-notify', hits === 0, `hits=${hits}`);
  unsub();

  assert.equal(r, true);
  assert.equal(saves.length, savesBefore);
  assert.equal(hits, 0);
});

test('M20-A TZ: GREEN — unconditional alternating reentrant callback is bounded and deterministic', () => {
  const { tm, saves, warns } = loadTm(PRODUCT_SRC);
  tm.setTimezone('UTC');

  let flips = 0;
  let rejectedReturn = null;
  const lastSeen = { flipper: null, observer: null };
  const unsubFlip = tm.subscribe((tz) => {
    lastSeen.flipper = tz.id;
    flips += 1;
    const next = tz.id === 'Europe/Paris' ? 'Asia/Tokyo' : 'Europe/Paris';
    const r = tm.setTimezone(next); // unconditional — no cap
    if (r === false) rejectedReturn = r;
  });
  const unsubObs = tm.subscribe((tz) => { lastSeen.observer = tz.id; });

  const savesBefore = saves.length;
  tm.setTimezone('Europe/Paris'); // externally initiated generation

  note('green', 'alternating-bounded-passes', flips <= PASS_BUDGET, `passes=${flips} budget=${PASS_BUDGET}`);
  note('green', 'alternating-bounded-writes', saves.length - savesBefore <= PASS_BUDGET,
    `writes=${saves.length - savesBefore}`);
  note('green', 'alternating-rejection-not-silent',
    rejectedReturn === false && warns.some((w) => w.includes('reentrant notify pass budget exhausted')),
    `warns=${warns.length}`);
  note('green', 'alternating-final-delivery-deterministic',
    lastSeen.flipper === tm.getTimezone().id && lastSeen.observer === tm.getTimezone().id,
    `final=${tm.getTimezone().id} flipper=${lastSeen.flipper} observer=${lastSeen.observer}`);

  const flipsAtBudget = flips;
  const writesAtBudget = saves.length - savesBefore;
  unsubFlip();
  unsubObs();

  // fresh external generation after budget exhaustion is always accepted
  const fresh = tm.setTimezone('America/New_York');
  note('green', 'external-change-after-budget-accepted', fresh === true && tm.getTimezone().id === 'America/New_York');

  assert.ok(flipsAtBudget <= PASS_BUDGET);
  assert.ok(writesAtBudget <= PASS_BUDGET);
  assert.equal(rejectedReturn, false);
  assert.equal(fresh, true);
});

test('M20-A TZ: GREEN — at-most-once per pass; add/remove during notify; direct reentrant notify coalesces', () => {
  const { tm } = loadTm(PRODUCT_SRC);
  tm.setTimezone('UTC');

  // at-most-once per pass, uniform across listeners
  const counts = [0, 0, 0];
  const unsubs = counts.map((_, i) => tm.subscribe(() => { counts[i] += 1; }));
  tm.setTimezone('Europe/Paris');
  note('green', 'at-most-once-per-pass-uniform',
    counts[0] === 1 && counts[1] === 1 && counts[2] === 1, counts.join(','));
  unsubs.forEach((u) => u());

  // listener added during notify: not in current snapshot pass
  let addedHits = 0;
  let lateUnsub = null;
  const adder = tm.subscribe(() => {
    if (!lateUnsub) lateUnsub = tm.subscribe(() => { addedHits += 1; });
  });
  tm.setTimezone('Asia/Tokyo');
  const addedDuringFirst = addedHits;
  tm.setTimezone('Europe/Paris');
  note('green', 'added-during-notify-skips-current-pass-fires-next',
    addedDuringFirst === 0 && addedHits === 1, `first=${addedDuringFirst} next=${addedHits}`);
  adder();
  lateUnsub();

  // direct reentrant notifyListeners() call coalesces without recursion
  let direct = 0;
  let directDone = false;
  const dUnsub = tm.subscribe(() => {
    direct += 1;
    if (!directDone) {
      directDone = true;
      tm.notifyListeners(); // direct reentrant request
    }
  });
  tm.setTimezone('UTC');
  note('green', 'direct-reentrant-notify-coalesces', direct === 2, `deliveries=${direct}`);
  dUnsub();

  assert.equal(direct, 2);
});

// ─── GREEN — census 1,000 / 10,000 cycles ──────────────────────────────────

test('M20-A TZ: GREEN — 1,000-cycle and 10,000-cycle subscribe/unsubscribe census stays flat', () => {
  const { tm } = loadTm(PRODUCT_SRC);
  const base = listenerCount(tm);

  for (let i = 0; i < 1000; i += 1) {
    if (i % 2 === 0) {
      tm.subscribe(() => {})();
    } else {
      const ac = new AbortController();
      tm.subscribe(() => {}, { signal: ac.signal });
      ac.abort();
    }
  }
  const after1k = listenerCount(tm);
  note('green', 'census-1000-cycles-flat', after1k === base, `len=${after1k}`);

  for (let i = 0; i < 10000; i += 1) {
    const unsub = tm.subscribe(() => {});
    unsub();
  }
  const after10k = listenerCount(tm);
  note('green', 'census-10000-cycles-flat', after10k === base, `len=${after10k}`);

  assert.equal(after1k, base);
  assert.equal(after10k, base);
});

test('M20-A TZ: GREEN — 4-panel modeled callers via subscribe stay flat on teardown', () => {
  const { tm } = loadTm(PRODUCT_SRC);
  const base = listenerCount(tm);
  const cleanups = [];

  const simulateChartInit = () => cleanups.push(tm.subscribe(() => {}));
  simulateChartInit();                                  // main
  cleanups.push(tm.subscribe(() => {}));                // Go-To
  cleanups.push(tm.subscribe(() => {}));                // replay
  for (let i = 0; i < 3; i += 1) simulateChartInit();   // 3 panels
  note('green', 'subscribe-4panel-boot-count', listenerCount(tm) === base + 6, `len=${listenerCount(tm)}`);

  for (let i = 0; i < 4; i += 1) simulateChartInit();   // relayout
  note('green', 'subscribe-relayout-stacks-without-destroy', listenerCount(tm) === base + 10,
    `len=${listenerCount(tm)}`);

  while (cleanups.length) cleanups.pop()();
  note('green', 'subscribe-teardown-flat', listenerCount(tm) === base, `len=${listenerCount(tm)}`);

  assert.equal(listenerCount(tm), base);
});

// ─── GREEN — DST / formatting parity vs executed HEAD blob (186+) ──────────

test('M20-A TZ: GREEN — DST/formatting parity vs HEAD blob (186+ comparisons)', () => {
  const head = loadTm(headBlob());
  const cur = loadTm(PRODUCT_SRC);

  const stamps = [
    Date.UTC(2024, 0, 15, 12, 0, 0),   // deep winter
    Date.UTC(2024, 6, 15, 12, 0, 0),   // deep summer
    Date.UTC(2024, 2, 10, 7, 30, 0),   // US spring-forward window
    Date.UTC(2024, 10, 3, 6, 30, 0),   // US fall-back window
  ];
  const formats = ['time', 'timeFull', 'date', 'datetime', 'full'];

  let comparisons = 0;
  let mismatches = 0;
  for (const tz of cur.tm.getTimezones()) {
    head.tm.setTimezone(tz.id);
    cur.tm.setTimezone(tz.id);
    for (const ts of stamps) {
      for (const f of formats) {
        comparisons += 1;
        if (head.tm.formatTime(ts, f) !== cur.tm.formatTime(ts, f)) mismatches += 1;
      }
      comparisons += 1;
      if (head.tm.convertToTimezone(ts).getTime() !== cur.tm.convertToTimezone(ts).getTime()) mismatches += 1;
    }
  }

  // DST-edge wallClock round-trips on representative zones (Intl scan is slow;
  // keep the expensive path narrow but real)
  for (const zone of ['America/New_York', 'Europe/Paris', 'UTC']) {
    for (const [y, m, d, h, mi] of [[2024, 3, 10, 2, 30], [2024, 11, 3, 1, 30]]) {
      comparisons += 1;
      const a = head.tm.wallClockToUtcMillis(y, m, d, h, mi, 0, zone);
      const b = cur.tm.wallClockToUtcMillis(y, m, d, h, mi, 0, zone);
      if (a !== b) mismatches += 1;
    }
  }

  note('green', 'dst-formatting-comparison-count', comparisons >= 186, `comparisons=${comparisons}`);
  note('green', 'dst-formatting-parity-vs-head', mismatches === 0, `mismatches=${mismatches}`);
  evidenceRows.push({ phase: 'meta', name: 'dst-comparisons', pass: true, detail: String(comparisons) });

  assert.ok(comparisons >= 186);
  assert.equal(mismatches, 0);
});

// ─── Kill-switch discrimination (exact legacy vs executed HEAD blob) ───────

test('M20-A TZ: kill — subscribe delegates to exact legacy addListener; census parity with HEAD blob', () => {
  const kill = loadTm(PRODUCT_SRC, { kill: true });
  const head = loadTm(headBlob());

  const killTrace = [];
  const headTrace = [];
  const script = (tm, trace, useSubscribe) => {
    const base = listenerCount(tm);
    const unsubs = [];
    for (let i = 0; i < 6; i += 1) {
      if (useSubscribe) unsubs.push(tm.subscribe(() => {}));
      else tm.addListener(() => {});
    }
    trace.push(listenerCount(tm) - base);
    unsubs.forEach((u) => u());          // kill cleanup is intentional no-op
    tm.removeListener(() => {});         // anonymous remove no-op in both
    trace.push(listenerCount(tm) - base);
  };
  script(kill.tm, killTrace, true);
  script(head.tm, headTrace, false);
  note('kill', 'kill-census-parity-with-head-legacy',
    JSON.stringify(killTrace) === JSON.stringify(headTrace),
    `kill=${killTrace.join(',')} head=${headTrace.join(',')}`);

  let hits = 0;
  const unsub = kill.tm.subscribe(() => { hits += 1; });
  const lenBefore = listenerCount(kill.tm);
  kill.tm.setTimezone('Europe/Paris');
  note('kill', 'kill-still-notifies', hits === 1, `hits=${hits}`);
  unsub();
  note('kill', 'kill-unsub-no-op', listenerCount(kill.tm) === lenBefore, `len=${listenerCount(kill.tm)}`);

  assert.deepEqual(killTrace, headTrace);
  assert.equal(hits, 1);
});

test('M20-A TZ: kill ON→OFF→ON — fix handles remain cleanable across switch changes; no stranded abort handlers', () => {
  const { tm, sandbox } = loadTm(PRODUCT_SRC, { kill: false });
  const base = listenerCount(tm);

  const ac = new AbortController();
  const unsubFix = tm.subscribe(() => {}, { signal: ac.signal });

  sandbox.window[KS] = true;
  const unsubKill = tm.subscribe(() => {});
  note('kill', 'transition-kill-adds-legacy', listenerCount(tm) === base + 2);

  sandbox.window[KS] = false;
  unsubFix();
  note('kill', 'transition-fix-unsub-cleans', listenerCount(tm) === base + 1);
  unsubKill();
  note('kill', 'transition-kill-unsub-no-op', listenerCount(tm) === base + 1);

  ac.abort();
  note('kill', 'transition-no-stranded-abort', listenerCount(tm) === base + 1);

  // kill-mode subscribe still fail-closed on malformed / pre-aborted signals
  sandbox.window[KS] = true;
  const lenKill = listenerCount(tm);
  const pre = new AbortController();
  pre.abort();
  tm.subscribe(() => {}, { signal: pre.signal });
  assert.doesNotThrow(() => tm.subscribe(() => {}, { signal: { get aborted() { throw new Error('x'); }, addEventListener() {}, removeEventListener() {} } }));
  note('kill', 'kill-mode-signal-fail-closed', listenerCount(tm) === lenKill, `len=${listenerCount(tm)}`);

  assert.equal(listenerCount(tm), lenKill);
});

// ─── Child-process timeout / livelock gates ────────────────────────────────

test('M20-A TZ: gate — corrected product survives hostile reentrancy in a child process within timeout', () => {
  const childCode = `
    const fs = require('fs');
    const vm = require('vm');
    const src = fs.readFileSync(process.env.M20A_PRODUCT, 'utf8');
    let saves = 0;
    const store = new Map();
    const sandbox = {
      userStorage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, v); saves += 1; },
        removeItem: (k) => store.delete(k),
      },
      console: { log() {}, warn() {} },
    };
    sandbox.window = {};
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);
    const tm = sandbox.window.timezoneManager;
    let flipperHits = 0;
    tm.subscribe(() => {
      flipperHits += 1;
      tm.setTimezone(tm.getTimezone().id === 'Europe/Paris' ? 'Asia/Tokyo' : 'Europe/Paris');
    });
    tm.subscribe(() => { tm.setTimezone(tm.getTimezone().id); });
    for (let i = 0; i < 200; i += 1) tm.addListener(() => {});
    let maxPasses = 0;
    for (let i = 0; i < 50; i += 1) {
      const before = flipperHits;
      tm.setTimezone(i % 2 ? 'Europe/Paris' : 'Asia/Tokyo');
      maxPasses = Math.max(maxPasses, flipperHits - before);
    }
    process.stdout.write(JSON.stringify({ ok: true, maxPasses, saves }));
  `;
  const out = execFileSync(process.execPath, ['-e', childCode], {
    timeout: 30000,
    env: { ...process.env, M20A_PRODUCT: path.join(CHART_ROOT, 'modules/timezone-manager.js') },
    encoding: 'utf8',
  });
  const report = JSON.parse(out);
  note('gate', 'child-hostile-reentrancy-terminates', report.ok === true,
    `maxPasses=${report.maxPasses} saves=${report.saves}`);
  note('gate', 'child-passes-within-budget', report.maxPasses <= PASS_BUDGET,
    `maxPasses=${report.maxPasses} budget=${PASS_BUDGET}`);
  assert.equal(report.ok, true);
  assert.ok(report.maxPasses <= PASS_BUDGET);
});

test('M20-A TZ: gate — fault injection: quarantined Composer do-while loop livelocks and is killed by timeout', () => {
  // Forensic fixture: the EXACT trailing-loop shape from the blocked Composer
  // land (unbounded do-while on _pendingNotify). Proves this gate has teeth.
  const faultCode = `
    class LivelockFixture {
      constructor() { this.listeners = []; this.currentTimezone = { id: 'UTC' }; }
      addListener(cb) { this.listeners.push(cb); }
      setTimezone(id) { this.currentTimezone = { id }; this.notifyListeners(); return true; }
      notifyListeners() {
        if (this._notifyDepth > 0) { this._pendingNotify = true; return; }
        this._notifyDepth = 1;
        try {
          do {
            this._pendingNotify = false;
            const snapshot = this.listeners.slice();
            for (let i = 0; i < snapshot.length; i++) {
              try { snapshot[i](this.currentTimezone); } catch (e) {}
            }
          } while (this._pendingNotify);
        } finally { this._notifyDepth = 0; }
      }
    }
    const f = new LivelockFixture();
    f.addListener(() => { f.setTimezone(f.currentTimezone.id === 'A' ? 'B' : 'A'); });
    f.setTimezone('A');
    process.stdout.write('UNEXPECTED-TERMINATION');
  `;
  let killed = false;
  let stdout = '';
  try {
    stdout = execFileSync(process.execPath, ['-e', faultCode], { timeout: 4000, encoding: 'utf8' });
  } catch (err) {
    killed = err.killed === true || err.signal != null || String(err.code) === 'ETIMEDOUT';
    stdout = String(err.stdout || '');
  }
  note('gate', 'fault-injection-livelock-detected-by-timeout',
    killed && !stdout.includes('UNEXPECTED-TERMINATION'), `killed=${killed}`);
  assert.equal(killed, true);
  assert.ok(!stdout.includes('UNEXPECTED-TERMINATION'));
});

test('M20-A TZ: gate — canonical root resolution from repo and arbitrary temp cwd (both entrypoints)', () => {
  assertCanonicalRoot(REPO_ROOT);
  note('gate', 'canonical-root-markers-validated', true, REPO_ROOT);

  const entrypoints = [
    { tree: 'canonical', abs: path.join(CHART_ROOT, 'modules/m20-a-timezone-browser-gate.mjs') },
    { tree: 'homepage', abs: path.join(HOMEPAGE_CHART, 'modules/m20-a-timezone-browser-gate.mjs') },
  ];
  const tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'm20a-cwd-'));
  const cwds = [
    { label: 'repo-root', dir: REPO_ROOT },
    { label: 'temp-cwd', dir: tempCwd },
  ];
  try {
    for (const ep of entrypoints) {
      for (const c of cwds) {
        const out = execFileSync(process.execPath, [ep.abs, '--print-root'], {
          cwd: c.dir,
          encoding: 'utf8',
          timeout: 30000,
        });
        const parsed = JSON.parse(out);
        const sameRoot = path.relative(REPO_ROOT, parsed.repoRoot) === '';
        const treesOk = Array.isArray(parsed.trees) && parsed.trees.length === 2
          && parsed.trees.every((t) => t.exists === true);
        note('gate', `root-${ep.tree}-entrypoint-from-${c.label}`, sameRoot && treesOk,
          `root=${parsed.repoRoot}`);
        assert.ok(sameRoot && treesOk, `${ep.tree} from ${c.label}: ${out}`);
      }
    }
  } finally {
    fs.rmSync(tempCwd, { recursive: true, force: true });
  }
});

// ─── Caller lifecycle — stays RED (locked shared files, read-only) ─────────

test('M20-A TZ: caller-RED — callers still anonymous; removeListener unused; inventory parity', () => {
  const chart = read('chart.js');
  const homeChart = readHome('chart.js');
  const replay = read('modules/replay-system.js');
  const homeReplay = readHome('modules/replay-system.js');
  const news = read('modules/economic-news-sidebar.js');
  const homeNews = readHome('modules/economic-news-sidebar.js');

  const chartSites = countAddListenerSites(chart);
  const replaySites = countAddListenerSites(replay);
  const newsSites = countAddListenerSites(news);
  note('caller-red', 'chart-addListener-sites', chartSites === 2, `count=${chartSites}`);
  note('caller-red', 'replay-addListener-sites', replaySites === 1, `count=${replaySites}`);
  note('caller-red', 'economic-news-addListener-sites', newsSites === 1, `count=${newsSites}`);
  note('caller-red', 'homepage-mirror-site-parity',
    chartSites === countAddListenerSites(homeChart)
      && replaySites === countAddListenerSites(homeReplay)
      && newsSites === countAddListenerSites(homeNews));

  const callerRemove = countRemoveListenerCallSites(chart)
    + countRemoveListenerCallSites(replay)
    + countRemoveListenerCallSites(news);
  note('caller-red', 'callers-never-removeListener', callerRemove === 0, `removeCallSites=${callerRemove}`);
  note('caller-red', 'chart-anonymous-arrow', /timezoneManager\.addListener\(\s*\(\)\s*=>/.test(chart));
  note('caller-red', 'replay-anonymous-arrow', /timezoneManager\.addListener\(\s*\(\)\s*=>/.test(replay));
  note('caller-red', 'economic-news-once-guard', news.includes('__economicNewsTzBound'));

  const owners = Object.keys(M20_A_TZ_CALLER_MANIFEST);
  note('caller-red', 'caller-manifest-four-owners', owners.length === 4, owners.join(','));
  for (const key of owners) {
    assert.equal(M20_A_TZ_CALLER_MANIFEST[key].locked, true);
  }

  assert.equal(callerRemove, 0);
  assert.equal(chartSites, 2);
  assert.equal(replaySites, 1);
  assert.equal(newsSites, 1);
});

// ─── Static API surface ────────────────────────────────────────────────────

test('M20-A TZ: static — subscribe/AbortSignal/kill + legacy compat + bounded notify markers', () => {
  const src = read('modules/timezone-manager.js');
  note('provenance', 'static-subscribe-present', /\bsubscribe\s*\(\s*callback/.test(src));
  note('provenance', 'static-kill-switch', src.includes(KS));
  note('provenance', 'static-addListener-compat', /addListener\s*\(\s*callback/.test(src));
  note('provenance', 'static-removeListener-compat', /removeListener\s*\(\s*callback/.test(src));
  note('provenance', 'static-pass-budget-bound', src.includes('NOTIFY_PASS_BUDGET = 8'));
  note('provenance', 'static-r4-captured-primordial-push',
    src.includes('M20_A_TZ_ARRAY_PUSH = Array.prototype.push'));
  note('provenance', 'static-r4-no-this-listeners-dispatch',
    !/this\.listeners\.(push|slice|splice|indexOf)\s*\(/.test(src));
  note('provenance', 'static-r4-private-weakmap-store',
    src.includes('new WeakMap()') && src.includes('m20ATzListenerStore'));
  note('provenance', 'contract-enabled-helper',
    typeof m20ATzListenerUnsubEnabled === 'function' && m20ATzListenerUnsubEnabled({ [KS]: true }) === false);
  assert.match(src, /\bsubscribe\s*\(/);
  assert.ok(src.includes('NOTIFY_PASS_BUDGET = 8'));
  assert.ok(src.includes('M20_A_TZ_ARRAY_PUSH = Array.prototype.push'));
  assert.ok(!/this\.listeners\.(push|slice|splice|indexOf)\s*\(/.test(src));
});

// ─── Evidence (explicit opt-in only; atomic unique write) ──────────────────

/**
 * Per-mode row selection: each evidence file contains ONLY the rows generated
 * from its own source (no mixed-source arrays, no identical mislabeled row
 * sets across red/green/kill). Caller-phase rows travel separately, clearly
 * labeled, and never contribute to any mode verdict or summary count.
 */
const MODE_PHASES = Object.freeze({
  red: Object.freeze(['head-red']),
  green: Object.freeze(['provenance', 'green', 'signal', 'gate']),
  kill: Object.freeze(['kill']),
});

test('evidence writer', { skip: !evidenceMode }, () => {
  // Canonical-root validation: refuse to write anywhere but the one true
  // docs/plan3/evidence under the marker-validated repo root (no shadow path).
  assertCanonicalRoot(REPO_ROOT);
  assert.equal(path.relative(path.join(REPO_ROOT, 'docs', 'plan3', 'evidence'), EVIDENCE_DIR), '');

  const stamp = '20260724';
  const rel = `docs/plan3/evidence/W4-M20-A-TIMEZONE-API-${stamp}-${evidenceMode}.json`;
  assert.ok(M20_A_TZ_EVIDENCE_RELS.includes(rel), `undeclared evidence rel: ${rel}`);
  const phases = MODE_PHASES[evidenceMode];
  assert.ok(phases, `unknown evidence mode: ${evidenceMode}`);

  const rows = evidenceRows.filter((r) => phases.includes(r.phase));
  assert.ok(rows.length > 0, `no rows generated for mode ${evidenceMode}`);
  const callerRedRows = evidenceRows.filter((r) => r.phase === 'caller-red');
  const failed = rows.filter((r) => !r.pass);

  let verdict;
  if (evidenceMode === 'red') {
    // RED verdict is earned ONLY by rows executed against the committed HEAD blob.
    verdict = failed.length === 0 ? 'RED' : 'INVALID-RED';
  } else if (evidenceMode === 'green') {
    verdict = failed.length === 0 ? 'GREEN' : 'FAIL-GREEN';
  } else {
    verdict = failed.length === 0 ? 'RED' : 'FAIL-DISCRIMINATION';
  }

  const sourceHashes = {};
  for (const relPath of M20_A_TZ_HASH_BIND_PATHS) {
    sourceHashes[relPath] = hashRel(relPath);
  }

  const dstRow = evidenceRows.find((r) => r.phase === 'meta' && r.name === 'dst-comparisons');
  const payload = {
    worker: 'W4',
    fix: 'M20-A-TIMEZONE-LISTENER-API',
    correction: 'FABLE-CORRECTION-OF-GPT-BLOCKED-COMPOSER-LAND (BLOCK-TIMEZONE-API, round 2)',
    mode: evidenceMode,
    stamp,
    status: M20_A_TZ_STATUS,
    callerPhase: M20_A_TZ_CALLER_PHASE,
    killSwitch: KS,
    notifyPassBudget: PASS_BUDGET,
    runtime: {
      node: process.version,
      v8: process.versions.v8,
      platform: process.platform,
      osRelease: os.release(),
      arch: process.arch,
    },
    rowSource: evidenceMode === 'red'
      ? 'executed committed HEAD blob (git show, sha-pinned) in fresh Node VM'
      : evidenceMode === 'kill'
        ? 'current corrected product with real kill switch, discriminated against executed HEAD blob'
        : 'current corrected product in fresh Node VM + child-process/root gates',
    rowPhasesIncluded: phases,
    provenance: M20_A_TZ_PROVENANCE,
    composerHunks: M20_A_TZ_COMPOSER_HUNKS,
    callerManifest: M20_A_TZ_CALLER_MANIFEST,
    manifestRel: M20_A_TZ_MANIFEST_REL,
    sealRel: M20_A_TZ_SEAL_REL,
    boardAnchor: 'PLAN3-BOARD M20-A timezoneManager subscribe API (caller phase pending)',
    sourceHashes,
    censusCycles: [1000, 10000],
    dstComparisons: dstRow ? Number(dstRow.detail) : null,
    rows,
    summary: {
      total: rows.length,
      pass: rows.length - failed.length,
      fail: failed.length,
    },
    callerRedRows,
    callerRedNote: 'caller-phase rows recorded separately; RED-PENDING-SHARED-FILE-UNLOCK; '
      + 'excluded from mode rows/summary/verdict by design.',
    verdict,
    note: 'Rows are single-source per mode (rowSource above); counts are computed '
      + 'over exactly the rows array of this file.',
  };

  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const out = path.join(EVIDENCE_DIR, `W4-M20-A-TIMEZONE-API-${stamp}-${evidenceMode}.json`);
  assert.equal(path.dirname(out), EVIDENCE_DIR);
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  const tmp = path.join(EVIDENCE_DIR, `.W4-M20-A-TIMEZONE-API-${stamp}-${evidenceMode}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, body, 'utf8');
  fs.renameSync(tmp, out);
  process.stdout.write(`Wrote evidence ${out} verdict=${verdict} rows=${rows.length}\n`);
});
