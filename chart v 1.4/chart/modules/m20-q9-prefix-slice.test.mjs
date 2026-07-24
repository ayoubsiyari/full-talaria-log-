/**
 * M20 QUICK-KILL Q9 — playhead prefix-slice churn (RED-first scaffold, hardened).
 *
 * Status: FABLE-W1-Q9-CORRECTION-LANDED-PENDING-MANAGER-INTEGRATION (2026-07-24)
 * Stage-1 product fix landed behind __TALARIA_DISABLE_M20_PREFIX_SLICE_V1:
 * shared _installPlayheadPrefix grow buffer on H1/H2/H3/H4/H5. Independent
 * review BLOCK (2026-07-24) required two corrections, both covered below:
 *   1. Reused prefix identity must not activate ChartDataPipeline's
 *      same-sourceRef incremental resample branch over a playhead-trimmed
 *      cached result — every fix-ON install now drops the consumer chart's
 *      resample cache (legacy fresh-slice full-resample semantics restored).
 *      End-to-end oracle: real installer → real ChartDataPipeline → trim.
 *   2. No runtime/import dependency on untracked W6 fixtures — the stride-6
 *      cross-check is self-contained here; the full W6 fixture comparison is
 *      report-only (see W1 Q9 report correction addendum).
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m20-q9-prefix-slice.test.mjs"
 *
 * Evidence:
 *   M20_Q9_EVIDENCE=red|green|kill|correction-red
 *     → docs/plan3/evidence/W1-Q9-20260724-<mode>.json
 *
 * Kill-switch (landed, default ON; dual-tree):
 *   __TALARIA_DISABLE_M20_PREFIX_SLICE_V1 = true → legacy slice churn
 *
 * b62 exact-tail product edit remains FORBIDDEN until independent GPT accepts
 * the W5 b61 value/Y painted-endpoint RED.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    // Require BOTH trees: homepage/docs/plan3 exists and must not be mistaken
    // for the repo root when this mirror runs from the homepage tree.
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

const REPO_ROOT = findRepoRoot(__dirname);
const CHART_V14 = path.join(REPO_ROOT, 'chart v 1.4', 'chart');
const HOMEPAGE_CHART = path.join(REPO_ROOT, 'homepage', 'public', 'chart');
const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs', 'plan3', 'evidence');

const KS_Q9 = '__TALARIA_DISABLE_M20_PREFIX_SLICE_V1';
const evidenceMode = String(process.env.M20_Q9_EVIDENCE || '').toLowerCase();
const evidenceRows = [];

function note(fixId, name, pass, detail = '') {
  evidenceRows.push({ q: fixId, name, pass: !!pass, detail });
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} [${fixId}] ${name}${detail ? ` — ${detail}` : ''}\n`);
}

function readV14(relFromChart) {
  return fs.readFileSync(path.join(CHART_V14, relFromChart), 'utf8');
}

function readHome(relFromChart) {
  return fs.readFileSync(path.join(HOMEPAGE_CHART, relFromChart), 'utf8');
}

function writeEvidence(mode, extra = {}) {
  if (!mode) return;
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const out = path.join(EVIDENCE_DIR, `W1-Q9-20260724-${mode}.json`);
  const body = {
    stamp: 'FABLE-W1-Q9-CORRECTION-LANDED-PENDING-MANAGER-INTEGRATION',
    mode,
    killSwitch: KS_Q9,
    generatedAt: new Date().toISOString(),
    rows: evidenceRows,
    ...extra,
  };
  fs.writeFileSync(out, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  process.stdout.write(`EVIDENCE → ${out}\n`);
}

function countNeedle(src, needle) {
  let n = 0;
  let from = 0;
  while (true) {
    const i = src.indexOf(needle, from);
    if (i < 0) return n;
    n += 1;
    from = i + needle.length;
  }
}

function methodContains(src, methodSig, needle, maxSpan = 8000) {
  const start = src.indexOf(methodSig);
  if (start < 0) return false;
  return src.slice(start, start + maxSpan).includes(needle);
}

function makeMaster(n = 500) {
  const master = [];
  for (let i = 0; i < n; i++) {
    master.push({
      t: i * 60_000,
      o: 100 + i * 0.01,
      h: 101 + i * 0.01,
      l: 99 + i * 0.01,
      c: 100.5 + i * 0.01,
      v: 10 + i,
    });
  }
  return master;
}

/** Stage-1 reference install (spec only — not product). */
function desiredInstall(state, master, sliceEnd) {
  if (!state.buf || state.master !== master) {
    state.buf = master.slice(0, sliceEnd);
    state.master = master;
    return state.buf;
  }
  if (sliceEnd < state.buf.length) {
    state.buf.length = sliceEnd;
    return state.buf;
  }
  for (let i = state.buf.length; i < sliceEnd; i++) state.buf.push(master[i]);
  return state.buf;
}

function legacyInstall(master, sliceEnd) {
  return master.slice(0, sliceEnd);
}

/**
 * Kill-switch discriminator model:
 *   killDisableFix=true  → legacy slice every call (switch OFF / fix disabled)
 *   killDisableFix=false → growing owned prefix (fix ON)
 */
function installWithKillModel(state, master, sliceEnd, killDisableFix) {
  if (killDisableFix) return legacyInstall(master, sliceEnd);
  return desiredInstall(state, master, sliceEnd);
}

function productHelperPresent(src) {
  return src.includes('_installPlayheadPrefix')
    || src.includes('_m20Q9PrefixSliceFixEnabled')
    || src.includes(KS_Q9);
}

const HOT_CHECKS = [
  { id: 'H1', fn: 'updateChartData', methodSig: 'updateChartData(autoScroll', needle: 'this.fullRawData.slice(0, sliceEnd)' },
  { id: 'H2', fn: 'updateChartDataFast', methodSig: 'updateChartDataFast()', needle: 'this.fullRawData.slice(0, sliceEnd)' },
  { id: 'H3', fn: 'syncPanelCharts', methodSig: 'syncPanelCharts(mainAlreadyAligned', needle: 'this.fullRawData.slice(0, sliceEnd)' },
  { id: 'H4', fn: 'mirror-static', methodSig: 'applyMultichartMirrorFrame(detail) {', needle: 'frd.slice(0, sliceEnd)', maxSpan: 13000 },
  { id: 'H5', fn: 'panel-own-prefix', methodSig: null, needle: '_panelFullRawData.slice(0, idx + 1)', minCount: 2 },
];

const MUTATION_CHECKS = [
  { id: 'M1', methodSig: 'updateChartWithAnimatedCandleForTimeframeChange()', needle: 'slicedRaw.push(animatedCandle)' },
  { id: 'M2', methodSig: null, needle: 'sliced.push(indep.candle)', minCount: 1 },
  { id: 'M3', methodSig: null, needle: 'sliced.push(animatedCandle)', minCount: 1 },
];

// ─── Inventory (documents current defect surface; must stay green) ─────────

test('Q9 inventory: hot-path prefix slices exist (dual-tree)', () => {
  const src = readV14('modules/replay-system.js');
  const home = readHome('modules/replay-system.js');
  assert.equal(src.length > 0, true);
  assert.equal(home.length > 0, true);

  for (const site of HOT_CHECKS) {
    let a;
    let b;
    if (site.methodSig) {
      const span = site.maxSpan || 8000;
      a = methodContains(src, site.methodSig, site.needle, span);
      b = methodContains(home, site.methodSig, site.needle, span);
    } else {
      const need = site.minCount || 1;
      a = countNeedle(src, site.needle) >= need;
      b = countNeedle(home, site.needle) >= need;
    }
    note('Q9', `inventory-${site.id}`, a && b, site.fn);
    assert.equal(a && b, true, `missing hot slice ${site.id} (${site.fn})`);
  }

  for (const site of MUTATION_CHECKS) {
    let a;
    let b;
    if (site.methodSig) {
      a = methodContains(src, site.methodSig, site.needle, 1200);
      b = methodContains(home, site.methodSig, site.needle, 1200);
    } else {
      const need = site.minCount || 1;
      a = countNeedle(src, site.needle) >= need;
      b = countNeedle(home, site.needle) >= need;
    }
    note('Q9', `mutation-${site.id}`, a && b, 'owned-array push required');
    assert.equal(a && b, true, `missing mutation site ${site.id}`);
  }

  const panelShare =
    src.includes('pc.rawData = slicedRawData')
    && home.includes('pc.rawData = slicedRawData');
  note('Q9', 'syncPanelCharts-already-shares-prefix-ref', panelShare);
  assert.equal(panelShare, true, 'expected syncPanelCharts same-dataset ref share');
});

// ─── Spec contracts (green today; encode stage-1 boundaries) ───────────────

test('Q9 spec: owned-prefix mutation safety (shell vs master)', () => {
  const master = makeMaster(200);
  const masterLen = master.length;
  const state = { buf: null, master: null };
  const prefix = desiredInstall(state, master, 50);

  // Array-shell push on owned prefix must not change master length.
  const forming = { t: 999, o: 1, h: 2, l: 0.5, c: 1.5, v: 1 };
  prefix.push(forming);
  const shellSafe = master.length === masterLen && master[master.length - 1] !== forming;
  note('Q9', 'owned-prefix-push-does-not-grow-master', shellSafe,
    `masterLen=${master.length}`);

  // Truncate owned prefix back; master unchanged.
  prefix.length = 50;
  const truncateSafe = master.length === masterLen && prefix.length === 50;
  note('Q9', 'owned-prefix-truncate-leaves-master', truncateSafe);

  // NO-GO demonstration: aliasing master itself then truncating destroys history.
  const alias = master;
  const before = master.length;
  alias.length = 10; // destructive
  const aliasDestroys = master.length === 10 && before === 200;
  // restore for process hygiene
  // (master already truncated — rebuild for clarity in subsequent tests via makeMaster)
  note('Q9', 'zero-copy-alias-truncate-is-destructive-NO-GO', aliasDestroys,
    'stage-1 must never assign master as mutable playhead shell');

  assert.equal(shellSafe, true);
  assert.equal(truncateSafe, true);
  assert.equal(aliasDestroys, true);
});

test('Q9 spec: seek/backward reset drops future bars from owned prefix', () => {
  const master = makeMaster(300);
  const state = { buf: null, master: null };
  let prefix = desiredInstall(state, master, 180);
  assert.equal(prefix.length, 180);
  const idForward = prefix;

  // Seek backward.
  prefix = desiredInstall(state, master, 40);
  const sameId = prefix === idForward;
  const lenOk = prefix.length === 40;
  const noLeak = prefix[39] === master[39]
    && !prefix.some((b, i) => i < prefix.length && b !== master[i]);
  // Future master bars must not remain reachable via prefix indices.
  const futureGone = prefix.length === 40 && prefix[40] === undefined;

  note('Q9', 'seek-back-reuses-identity', sameId);
  note('Q9', 'seek-back-truncates-length', lenOk);
  note('Q9', 'seek-back-no-future-leak', noLeak && futureGone);

  assert.equal(sameId, true);
  assert.equal(lenOk, true);
  assert.equal(noLeak && futureGone, true);
});

test('Q9 spec: forming-candle push isolation from master', () => {
  const master = makeMaster(80);
  const masterLen = master.length;
  // Product forming path: materialize prefix then push a NEW object.
  const sliced = master.slice(0, 40);
  const animated = {
    t: master[40]?.t ?? 40 * 60_000,
    o: 1, h: 3, l: 0.5, c: 2, v: 9,
  };
  sliced.push(animated);

  const masterUntouched = master.length === masterLen;
  const lastIsNewObject = sliced[sliced.length - 1] === animated
    && sliced[sliced.length - 1] !== master[40];
  // Zero-copy into master then push would corrupt — forbidden.
  const corruptDemoMaster = makeMaster(20);
  const before = corruptDemoMaster.length;
  // If stage-1 mistakenly exposed master as the shell:
  const unsafeShell = corruptDemoMaster;
  unsafeShell.push(animated);
  const wouldCorrupt = corruptDemoMaster.length === before + 1;

  note('Q9', 'forming-slice-push-leaves-master-length', masterUntouched);
  note('Q9', 'forming-last-bar-is-new-object', lastIsNewObject);
  note('Q9', 'forming-push-on-master-shell-corrupts-NO-GO', wouldCorrupt);

  const src = readV14('modules/replay-system.js');
  const pushesRetained = MUTATION_CHECKS.every((site) => {
    if (site.methodSig) return methodContains(src, site.methodSig, site.needle, 1200);
    return countNeedle(src, site.needle) >= (site.minCount || 1);
  });
  note('Q9', 'forming-push-sites-retained', pushesRetained);

  assert.equal(masterUntouched, true);
  assert.equal(lastIsNewObject, true);
  assert.equal(wouldCorrupt, true);
  assert.equal(pushesRetained, true);
});

test('Q9 spec: kill-switch legacy allocation discriminator model', () => {
  const master = makeMaster(200);
  const onState = { buf: null, master: null };
  const offIds = new Set();
  const onIds = new Set();
  let end = 50;
  for (let i = 0; i < 25; i++) {
    end += 1;
    offIds.add(installWithKillModel(null, master, end, true));
    onIds.add(installWithKillModel(onState, master, end, false));
  }
  const offChurns = offIds.size === 25;
  const onReuses = onIds.size === 1;
  note('Q9', 'kill-OFF-legacy-churns-identity', offChurns, `distinct=${offIds.size}`);
  note('Q9', 'kill-ON-fix-reuses-identity', onReuses, `distinct=${onIds.size}`);

  // Seek under fix-ON then kill-OFF must again churn.
  desiredInstall(onState, master, 30);
  const afterSeekId = onState.buf;
  const killed = installWithKillModel(onState, master, 31, true);
  const killBreaksReuse = killed !== afterSeekId;
  note('Q9', 'kill-OFF-after-seek-breaks-reuse', killBreaksReuse);

  assert.equal(offChurns, true);
  assert.equal(onReuses, true);
  assert.equal(killBreaksReuse, true);
});

// ─── Desired product contracts (RED today until stage-1 lands) ─────────────

test('Q9 desired: playhead prefix array identity reused across advances', () => {
  const master = makeMaster(500);
  const src = readV14('modules/replay-system.js');
  const helperPresent = productHelperPresent(src);

  const legacyIds = new Set();
  let end = 100;
  for (let step = 0; step < 40; step++) {
    end += 1;
    legacyIds.add(legacyInstall(master, end));
  }
  const legacyChurn = legacyIds.size === 40;
  note('Q9', 'legacy-slice-churn-reproduced', legacyChurn, `distinct=${legacyIds.size}`);

  const state = { buf: null, master: null };
  const desiredIds = new Set();
  end = 100;
  let first = null;
  for (let step = 0; step < 40; step++) {
    end += 1;
    const arr = desiredInstall(state, master, end);
    if (!first) first = arr;
    desiredIds.add(arr);
  }
  const desiredStable = desiredIds.size === 1 && first.length === 140;
  note('Q9', 'desired-grow-buffer-stable', desiredStable,
    `distinct=${desiredIds.size} len=${first && first.length}`);

  note('Q9', 'product-helper-or-kill-present', helperPresent, KS_Q9);
  note('Q9', 'desired-product-reuse-contract', helperPresent,
    helperPresent
      ? 'helper present — re-run behavioral product probe'
      : 'RED: helper/kill absent on b61 surface');

  assert.equal(legacyChurn, true, 'sanity: legacy slice must churn');
  assert.equal(desiredStable, true, 'sanity: grow-buffer spec must be stable');
  assert.equal(helperPresent, true,
    'Q9 RED: product growing-prefix helper / kill-switch not landed yet');
});

test('Q9 desired: fast/normal path share one reuse helper', () => {
  const src = readV14('modules/replay-system.js');
  const home = readHome('modules/replay-system.js');

  // Today both paths independently slice (defect surface).
  const bothSliceToday =
    methodContains(src, 'updateChartData(autoScroll', 'this.fullRawData.slice(0, sliceEnd)')
    && methodContains(src, 'updateChartDataFast()', 'this.fullRawData.slice(0, sliceEnd)')
    && methodContains(home, 'updateChartData(autoScroll', 'this.fullRawData.slice(0, sliceEnd)')
    && methodContains(home, 'updateChartDataFast()', 'this.fullRawData.slice(0, sliceEnd)');
  note('Q9', 'fast-and-normal-both-slice-today', bothSliceToday);

  // Desired after land: both call the shared installer (or kill-gated helper).
  const sharedHelper =
    (src.includes('_installPlayheadPrefix') && home.includes('_installPlayheadPrefix'))
    || (src.includes('_m20Q9PrefixSliceFixEnabled') && home.includes('_m20Q9PrefixSliceFixEnabled'));
  const normalUsesHelper = sharedHelper
    && methodContains(src, 'updateChartData(autoScroll', '_installPlayheadPrefix', 9000);
  const fastUsesHelper = sharedHelper
    && methodContains(src, 'updateChartDataFast()', '_installPlayheadPrefix', 2000);
  const unified = !!(normalUsesHelper && fastUsesHelper);
  note('Q9', 'fast-normal-shared-helper-product', unified,
    unified ? 'unified' : 'RED: H1/H2 not yet routed through _installPlayheadPrefix');

  assert.equal(bothSliceToday, true);
  assert.equal(unified, true,
    'Q9 RED: normal+fast paths must share _installPlayheadPrefix after stage-1 land');
});

test('Q9 kill-switch scaffold: name reserved; OFF must restore slice churn after land', () => {
  const src = readV14('modules/replay-system.js');
  const home = readHome('modules/replay-system.js');
  const present = src.includes(KS_Q9) && home.includes(KS_Q9);
  note('Q9', 'kill-switch-dual-tree', present, KS_Q9);

  if (evidenceMode === 'green' || evidenceMode === 'kill') {
    assert.equal(present, true, 'kill-switch must exist for green/kill evidence modes');
  } else {
    assert.equal(typeof KS_Q9, 'string');
  }
});

// ─── Product behavioral probes (real ReplaySystem installer) ───────────────

function loadReplaySystem() {
  // Module tail assigns window.ReplaySystem — provide a stub during require only.
  const g = globalThis;
  const hadWindow = Object.prototype.hasOwnProperty.call(g, 'window');
  const prevWindow = g.window;
  if (!hadWindow) g.window = {};
  try {
    const resolved = require.resolve('./replay-system.js');
    delete require.cache[resolved];
    return require('./replay-system.js');
  } finally {
    if (hadWindow) g.window = prevWindow;
    else delete g.window;
  }
}

function freshRs(ReplaySystem) {
  // Prototype-only instance: _installPlayheadPrefix touches no constructor state.
  return Object.create(ReplaySystem.prototype);
}

function withKillSwitch(value, fn) {
  const g = globalThis;
  const hadWindow = Object.prototype.hasOwnProperty.call(g, 'window');
  const prevWindow = g.window;
  g.window = { [KS_Q9]: value };
  try {
    return fn();
  } finally {
    if (hadWindow) g.window = prevWindow;
    else delete g.window;
  }
}

test('Q9 product: fix ON — one owned identity across forward advances (allocation discriminator)', () => {
  const ReplaySystem = loadReplaySystem();
  assert.equal(typeof ReplaySystem.prototype._installPlayheadPrefix, 'function');
  const rs = freshRs(ReplaySystem);
  const master = makeMaster(500);

  const ids = new Set();
  let arr = null;
  let end = 100;
  for (let step = 0; step < 40; step++) {
    end += 1;
    arr = rs._installPlayheadPrefix(master, end);
    ids.add(arr);
  }
  const singleIdentity = ids.size === 1;
  const lengthTracks = arr.length === 140;
  const contentOk = arr[0] === master[0] && arr[139] === master[139] && arr[140] === undefined;
  const notMasterAlias = arr !== master;
  note('Q9', 'product-fixON-single-identity-40-advances', singleIdentity, `distinct=${ids.size}`);
  note('Q9', 'product-fixON-length-tracks-playhead', lengthTracks, `len=${arr.length}`);
  note('Q9', 'product-fixON-content-matches-master-prefix', contentOk);
  note('Q9', 'product-fixON-prefix-not-master-alias', notMasterAlias);

  assert.equal(singleIdentity, true, 'fix ON must reuse one grow buffer across advances');
  assert.equal(lengthTracks, true);
  assert.equal(contentOk, true);
  assert.equal(notMasterAlias, true);

  // Full-length install still returns an owned copy, never the master shell.
  const full = rs._installPlayheadPrefix(master, master.length);
  const fullOwned = full !== master && full.length === master.length;
  note('Q9', 'product-fixON-full-length-still-owned-copy', fullOwned);
  assert.equal(fullOwned, true, 'end === master.length must not alias master');
});

test('Q9 product: fix ON — backward seek/reset truncates owned shell, no future leak', () => {
  const ReplaySystem = loadReplaySystem();
  const rs = freshRs(ReplaySystem);
  const master = makeMaster(300);

  const fwd = rs._installPlayheadPrefix(master, 180);
  assert.equal(fwd.length, 180);
  const back = rs._installPlayheadPrefix(master, 40);
  const sameId = back === fwd;
  const lenOk = back.length === 40;
  const futureGone = back[40] === undefined && !(40 in back);
  const contentOk = back[39] === master[39];
  note('Q9', 'product-seek-back-reuses-identity', sameId);
  note('Q9', 'product-seek-back-truncates-length', lenOk);
  note('Q9', 'product-seek-back-no-future-leak', futureGone && contentOk);
  assert.equal(sameId, true);
  assert.equal(lenOk, true);
  assert.equal(futureGone && contentOk, true);

  // Re-advance after seek grows the same shell again with correct bars.
  const again = rs._installPlayheadPrefix(master, 60);
  const regrow = again === fwd && again.length === 60 && again[59] === master[59];
  note('Q9', 'product-seek-then-advance-regrows-same-shell', regrow);
  assert.equal(regrow, true);
});

test('Q9 product: master replacement (dataset/TF/pair swap, replay cut) rebuilds prefix', () => {
  const ReplaySystem = loadReplaySystem();
  const rs = freshRs(ReplaySystem);
  const masterA = makeMaster(200);
  // Simulates every product swap path: a NEW array is installed as master
  // (startReplay [...rawData], applyMultichartReplayCut truncated.slice(), TF swap).
  const masterB = makeMaster(120).map((b) => ({ ...b, o: b.o + 1000 }));

  const bufA = rs._installPlayheadPrefix(masterA, 90);
  const bufB = rs._installPlayheadPrefix(masterB, 30);
  const rebuilt = bufB !== bufA && bufB.length === 30 && bufB[0] === masterB[0];
  note('Q9', 'product-master-swap-rebuilds-owned-prefix', rebuilt);
  assert.equal(rebuilt, true, 'new master identity must produce a fresh owned prefix');

  // Per-master isolation: panel masters keep their own buffers concurrently.
  const bufA2 = rs._installPlayheadPrefix(masterA, 91);
  const isolated = bufA2 === bufA && bufA2.length === 91 && bufB.length === 30;
  note('Q9', 'product-per-master-buffers-isolated', isolated);
  assert.equal(isolated, true, 'per-master (per-panel) buffers must not interfere');

  // Exit hygiene: invalidation drops reuse; next install rebuilds.
  rs._invalidatePlayheadPrefixes();
  const bufA3 = rs._installPlayheadPrefix(masterA, 91);
  const invalidated = bufA3 !== bufA2 && bufA3.length === 91;
  note('Q9', 'product-invalidate-drops-reuse', invalidated);
  assert.equal(invalidated, true);
});

test('Q9 product: forming-candle scratch stays isolated from grow buffer', () => {
  const ReplaySystem = loadReplaySystem();
  const rs = freshRs(ReplaySystem);
  const master = makeMaster(100);
  const buf = rs._installPlayheadPrefix(master, 50);

  // Product forming paths (M1–M3) slice+push their OWN scratch — never the grow buffer.
  const scratch = master.slice(0, 50);
  scratch.push({ t: 999, o: 1, h: 2, l: 0.5, c: 1.5, v: 1 });
  const isolated = buf.length === 50 && master.length === 100 && scratch.length === 51;
  note('Q9', 'product-forming-scratch-isolated-from-grow-buffer', isolated);
  assert.equal(isolated, true);
});

test('Q9 product: switch OFF restores legacy per-call slice churn (kill discriminator)', () => {
  const ReplaySystem = loadReplaySystem();
  const rs = freshRs(ReplaySystem);
  const master = makeMaster(400);

  // Prime fix-ON state, then flip the product kill-switch.
  const onBuf = rs._installPlayheadPrefix(master, 100);
  const offIds = new Set();
  withKillSwitch(true, () => {
    let end = 100;
    for (let step = 0; step < 25; step++) {
      end += 1;
      offIds.add(rs._installPlayheadPrefix(master, end));
    }
  });
  const offChurns = offIds.size === 25 && !offIds.has(onBuf);
  note('Q9', 'product-killOFF-restores-slice-churn', offChurns, `distinct=${offIds.size}`);
  assert.equal(offChurns, true, 'switch OFF must allocate a fresh legacy slice per install');

  // Switch back ON (unset) → reuse resumes.
  const resumed = rs._installPlayheadPrefix(master, 130);
  const reuseResumes = resumed === onBuf && resumed.length === 130;
  note('Q9', 'product-killON-again-resumes-reuse', reuseResumes);
  assert.equal(reuseResumes, true);

  // Explicit false (switch present but not engaged) keeps the fix ON.
  const withFalse = withKillSwitch(false, () => rs._installPlayheadPrefix(master, 131));
  const falseKeepsFix = withFalse === onBuf && withFalse.length === 131;
  note('Q9', 'product-kill-false-keeps-fix-on', falseKeepsFix);
  assert.equal(falseKeepsFix, true);
});

test('Q9 product: dual-tree behavioral parity (chart v 1.4 mirror)', () => {
  const a = readV14('modules/replay-system.js');
  const b = readHome('modules/replay-system.js');
  const identical = a === b;
  note('Q9', 'product-dual-tree-source-identical', identical,
    `v14=${a.length}B home=${b.length}B`);
  assert.equal(identical, true, 'replay-system.js must be byte-identical across trees');
});

// ─── Correction (review finding 1): ChartDataPipeline staleness oracle ─────
//
// Legacy fresh-slice installs changed chart.rawData identity every tick, so
// ChartDataPipeline.getResampledSeries could never match cache.sourceRef and
// always FULL-resampled after an install. The reused Q9 shell keeps one
// identity, which would activate the pipeline's same-sourceRef len+1
// incremental branch over its cached result — and chart.js
// _trimLastDataBarToReplayPlayhead() mutates that cached result's last bar in
// place (playhead trim), so the finalized prior bucket would keep stale
// trimmed OHLC. The oracle below drives the REAL installer through the REAL
// pipeline with the production trim mechanism and demands byte/value
// equivalence with a legacy fresh-slice full resample at every advance.

const RAW_STEP_MS = 20 * 60_000; // fine raw: 20m bars
const DISPLAY_TF_MS = 60 * 60_000; // coarse display: 1h buckets (3 raw per bucket)

function loadChartDataPipeline() {
  const resolved = require.resolve('./chart-data-pipeline.js');
  delete require.cache[resolved];
  return require('./chart-data-pipeline.js');
}

/** Fine raw bars with non-monotonic H/L so stale bucket aggregation is visible. */
function makeFineMaster(n = 30) {
  const master = [];
  for (let i = 0; i < n; i++) {
    master.push({
      t: i * RAW_STEP_MS,
      o: 100 + i,
      h: 120 + ((i * 37) % 50),
      l: 80 - ((i * 53) % 40),
      c: 105 + ((i * 11) % 23),
      v: 1000 + i * 10,
    });
  }
  return master;
}

/** Reference OHLCV bucketization (contract of chart._resampleDataFull). */
function bucketResample(src, tfMs) {
  const out = [];
  for (const bar of src) {
    const bt = Math.floor(bar.t / tfMs) * tfMs;
    const last = out[out.length - 1];
    if (last && last.t === bt) {
      if (bar.h > last.h) last.h = bar.h;
      if (bar.l < last.l) last.l = bar.l;
      last.c = bar.c;
      last.v += bar.v;
    } else {
      out.push({ t: bt, o: bar.o, h: bar.h, l: bar.l, c: bar.c, v: bar.v });
    }
  }
  return out;
}

function makePipelineChart(Pipeline) {
  const chart = {
    currentTimeframe: '1h',
    dataVersion: 0,
    data: [],
    rawData: null,
    parseTimeframe: () => DISPLAY_TF_MS,
    _resampleDataFull: (src) => bucketResample(src, DISPLAY_TF_MS),
    bumpDataVersion() { this.dataVersion += 1; },
  };
  chart.dataPipeline = new Pipeline(chart);
  chart.resampleData = (data, tf) => chart.dataPipeline.getResampledSeries(data, tf, chart.dataVersion);
  return chart;
}

/**
 * chart.js _trimLastDataBarToReplayPlayhead mechanism: replaces the last
 * display bar IN chart.data — which is the pipeline's cache.result identity —
 * with a playhead-trimmed copy (Object.assign({}, bar, partial)). Simulated
 * here as the maximal mid-bar trim (only the open has printed).
 */
function simulatePlayheadTrim(chart) {
  const lastIdx = chart.data.length - 1;
  if (lastIdx < 0) return;
  const bar = chart.data[lastIdx];
  chart.data[lastIdx] = Object.assign({}, bar, {
    h: bar.o,
    l: bar.o,
    c: bar.o,
    v: 0,
  });
}

function ohlcvRows(series) {
  return series.map((b) => [b.t, b.o, b.h, b.l, b.c, b.v].join(','));
}

test('Q9 correction oracle: reused prefix→pipeline→trim ≡ legacy fresh-slice full resample', () => {
  const ReplaySystem = loadReplaySystem();
  const Pipeline = loadChartDataPipeline();
  const rs = freshRs(ReplaySystem);
  const master = makeFineMaster(30);

  const fixedChart = makePipelineChart(Pipeline); // consumes the reused prefix
  const legacyChart = makePipelineChart(Pipeline); // legacy fresh slice per tick

  let staleTicks = 0;
  let firstStale = '';
  const prefixIds = new Set();
  for (let end = 1; end <= master.length; end++) {
    const prefix = rs._installPlayheadPrefix(master, end, fixedChart);
    prefixIds.add(prefix);
    fixedChart.rawData = prefix;
    fixedChart.data = fixedChart.resampleData(prefix, '1h');

    const legacySlice = master.slice(0, end); // legacy identity churn
    legacyChart.rawData = legacySlice;
    legacyChart.data = legacyChart.resampleData(legacySlice, '1h');

    const got = JSON.stringify(ohlcvRows(fixedChart.data));
    const want = JSON.stringify(ohlcvRows(legacyChart.data));
    if (got !== want) {
      staleTicks += 1;
      if (!firstStale) firstStale = `end=${end}`;
    }

    // Production replay then trims the last display bar to the playhead —
    // mutating the pipeline's cached result in place (chart.js).
    simulatePlayheadTrim(fixedChart);
    simulatePlayheadTrim(legacyChart);
    fixedChart.bumpDataVersion();
    legacyChart.bumpDataVersion();
  }

  const equivalent = staleTicks === 0;
  const allocWin = prefixIds.size === 1;
  note('Q9', 'correction-oracle-pipeline-trim-value-equivalent', equivalent,
    equivalent ? `30/30 advances equivalent` : `staleTicks=${staleTicks}/30 first=${firstStale}`);
  note('Q9', 'correction-oracle-stable-prefix-alloc-win-retained', allocWin,
    `distinct=${prefixIds.size}`);

  assert.equal(equivalent, true,
    'Q9 correction RED: reused prefix let ChartDataPipeline finalize a playhead-trimmed stale prior bucket');
  assert.equal(allocWin, true,
    'correction must not sacrifice the stable-prefix allocation benefit');
});

test('Q9 correction: zero/one/full/over-length installs stay pipeline-equivalent', () => {
  const ReplaySystem = loadReplaySystem();
  const Pipeline = loadChartDataPipeline();
  const rs = freshRs(ReplaySystem);
  const master = makeFineMaster(12);
  const chart = makePipelineChart(Pipeline);

  // zero → one → full → over-length (clamped) → truncate to one → regrow full.
  const seq = [0, 1, master.length, master.length + 25, 1, master.length];
  const failures = [];
  for (const rawEnd of seq) {
    const prefix = rs._installPlayheadPrefix(master, rawEnd, chart);
    const clamped = Math.max(0, Math.min(rawEnd, master.length));
    const contentOk = prefix.length === clamped
      && prefix !== master
      && prefix.every((b, i) => b === master[i]);
    if (!contentOk) {
      failures.push(`content@end=${rawEnd}`);
      continue;
    }
    chart.rawData = prefix;
    chart.data = chart.resampleData(prefix, '1h');
    const want = bucketResample(master.slice(0, clamped), DISPLAY_TF_MS);
    if (JSON.stringify(ohlcvRows(chart.data)) !== JSON.stringify(ohlcvRows(want))) {
      failures.push(`pipeline@end=${rawEnd}`);
    }
    simulatePlayheadTrim(chart);
    chart.bumpDataVersion();
  }
  const edgesOk = failures.length === 0;
  note('Q9', 'correction-edge-zero-one-full-over-length', edgesOk,
    edgesOk ? `seq=${seq.join('/')}` : `failed=${failures.join(',')}`);
  assert.equal(edgesOk, true, `edge installs diverged: ${failures.join(',')}`);
});

test('Q9 correction: same-master same-identity slot replacement rebuilds the shell', () => {
  const ReplaySystem = loadReplaySystem();
  const Pipeline = loadChartDataPipeline();
  const rs = freshRs(ReplaySystem);
  const master = makeFineMaster(12);
  const chart = makePipelineChart(Pipeline);

  const before = rs._installPlayheadPrefix(master, 6, chart);
  assert.equal(before[5], master[5]);

  // Retained-tail boundary slot replacement (same master identity).
  master[5] = { ...master[5], h: 9999 };
  const afterTail = rs._installPlayheadPrefix(master, 6, chart);
  const tailDetected = afterTail[5] === master[5]
    && afterTail.length === 6
    && afterTail.every((b, i) => b === master[i]);
  note('Q9', 'correction-slot-replacement-tail-detected', tailDetected,
    tailDetected ? 'fresh shell mirrors replaced slot' : 'RED: stale shell served old slot object');

  // Head slot replacement (same master identity), across a grow install.
  master[0] = { ...master[0], l: -9999 };
  const afterHead = rs._installPlayheadPrefix(master, 8, chart);
  const headDetected = afterHead[0] === master[0]
    && afterHead.length === 8
    && afterHead.every((b, i) => b === master[i]);
  note('Q9', 'correction-slot-replacement-head-detected', headDetected);

  // Explicit invalidation hook remains the contract for interior replacement
  // (no production path replaces master slots in place — audit M-table).
  rs._invalidatePlayheadPrefixes();
  const afterExplicit = rs._installPlayheadPrefix(master, 8, chart);
  const explicitRebuilds = afterExplicit !== afterHead
    && afterExplicit.every((b, i) => b === master[i]);
  note('Q9', 'correction-explicit-invalidate-rebuilds', explicitRebuilds);

  assert.equal(tailDetected, true,
    'Q9 correction RED: same-identity tail slot replacement must rebuild the owned shell');
  assert.equal(headDetected, true);
  assert.equal(explicitRebuilds, true);
});

test('Q9 correction: switch OFF stays legacy-correct (churn + value equivalence)', () => {
  const ReplaySystem = loadReplaySystem();
  const Pipeline = loadChartDataPipeline();
  const rs = freshRs(ReplaySystem);
  const master = makeFineMaster(18);

  const result = withKillSwitch(true, () => {
    const chart = makePipelineChart(Pipeline);
    const ids = new Set();
    let stale = 0;
    for (let end = 1; end <= master.length; end++) {
      const installed = rs._installPlayheadPrefix(master, end, chart);
      ids.add(installed);
      chart.rawData = installed;
      chart.data = chart.resampleData(installed, '1h');
      const want = bucketResample(master.slice(0, end), DISPLAY_TF_MS);
      if (JSON.stringify(ohlcvRows(chart.data)) !== JSON.stringify(ohlcvRows(want))) stale += 1;
      simulatePlayheadTrim(chart);
      chart.bumpDataVersion();
    }
    return { distinct: ids.size, stale };
  });

  const churns = result.distinct === master.length;
  const correct = result.stale === 0;
  note('Q9', 'correction-killOFF-legacy-churn-and-correct', churns && correct,
    `distinct=${result.distinct}/18 stale=${result.stale}`);
  assert.equal(churns, true, 'switch OFF must restore literal per-install legacy slice churn');
  assert.equal(correct, true, 'switch OFF must remain value-equivalent to legacy full resample');
});

// ─── Stride-6 boundary (self-contained; W6 fixture cross-check is report-only) ─
//
// Review finding 2: the previous version imported untracked W6 fixtures
// (m21-w6-fixtures/visible-window-mirror.mjs), so Q9 could not run from a
// clean scoped checkout. The layout contract is asserted self-contained here
// against the TRACKED production packer; the W6 fixture comparison moved to
// the report (report-only, verified in the prior cycle's evidence).

const STRIDE6 = 6; // [t, o, h, l, c, v] — documented M21/W6 pack layout

function packStride6Local(bars, start, end) {
  const out = new Float64Array(Math.max(0, end - start) * STRIDE6);
  let w = 0;
  for (let i = start; i < end; i++) {
    const b = bars[i];
    out[w++] = Number(b.t);
    out[w++] = Number(b.o);
    out[w++] = Number(b.h);
    out[w++] = Number(b.l);
    out[w++] = Number(b.c);
    out[w++] = Number(b.v);
  }
  return out;
}

test('Q9 boundary: object prefix layout matches packBarsRangeCompact stride-6 (self-contained)', () => {
  // Load IndicatorPerf (tracked product module). IIFE binds to window|self.
  const g = globalThis;
  const prevWindow = g.window;
  const prevSelf = g.self;
  const prevPerf = g.window?.IndicatorPerf ?? g.IndicatorPerf;
  if (!g.window) g.window = {};
  if (typeof g.self === 'undefined') g.self = g;
  require(path.join(CHART_V14, 'modules', 'indicator-performance.js'));
  const perf = g.window.IndicatorPerf || g.IndicatorPerf;
  assert.equal(typeof perf?.packBarsRangeCompact, 'function');

  const bars = makeMaster(12);
  const start = 2;
  const end = 7;
  const packed = perf.packBarsRangeCompact(bars, start, end);
  const local = packStride6Local(bars, start, end);
  assert.equal(packed.length, (end - start) * STRIDE6);
  assert.equal(local.length, packed.length);

  let layoutMatch = true;
  for (let i = 0; i < packed.length; i++) {
    if (Number(packed[i]) !== Number(local[i])) {
      layoutMatch = false;
      break;
    }
  }
  note('Q9', 'stride6-selfcontained-matches-packBarsRangeCompact', layoutMatch,
    `elems=${packed.length} stride=${STRIDE6}`);

  // Conceptual boundary: Q9 owned object-array prefix ≠ typed packed window.
  // Stage-1 must not silently replace chart.rawData with a Float64Array.
  const q9IsObjectPrefix = Array.isArray(bars) && typeof bars[0] === 'object';
  const packedIsTyped = local instanceof Float64Array;
  note('Q9', 'q9-object-prefix-vs-typed-window-boundary', q9IsObjectPrefix && packedIsTyped,
    'compatible pack layout; distinct runtime shells');

  if (prevWindow === undefined) delete g.window;
  else g.window = prevWindow;
  if (prevSelf === undefined) delete g.self;
  else g.self = prevSelf;
  if (prevPerf !== undefined && g.window) g.window.IndicatorPerf = prevPerf;

  assert.equal(layoutMatch, true);
  assert.equal(q9IsObjectPrefix && packedIsTyped, true);
});

test.after(() => {
  const failed = evidenceRows.filter((r) => !r.pass);
  const hardRedNames = new Set([
    'desired-product-reuse-contract',
    'fast-normal-shared-helper-product',
    'product-helper-or-kill-present',
    'kill-switch-dual-tree',
    'correction-oracle-pipeline-trim-value-equivalent',
    'correction-slot-replacement-tail-detected',
  ]);
  const hardRed = failed.some((r) => hardRedNames.has(r.name));
  const productLanded = evidenceRows.some(
    (r) => r.name === 'product-fixON-single-identity-40-advances' && r.pass,
  );
  const summary = {
    verdict: hardRed ? 'RED' : (failed.length ? 'MIXED' : (productLanded ? 'GREEN' : 'PENDING')),
    failed: failed.map((r) => r.name),
    stamp: 'FABLE-W1-Q9-CORRECTION-LANDED-PENDING-MANAGER-INTEGRATION',
    b62ProductEdit: 'FORBIDDEN-UNTIL-INDEPENDENT-GPT-ACCEPTS-W5-B61-VALUE-Y-RED',
    stage1: 'CORRECTED-INSTALL-DROPS-CONSUMER-RESAMPLE-CACHE',
  };
  const validModes = new Set(['red', 'green', 'kill', 'correction-red']);
  if (validModes.has(evidenceMode)) {
    writeEvidence(evidenceMode, { summary });
  } else {
    process.stdout.write(`Q9 scaffold summary: ${JSON.stringify(summary)}\n`);
  }
});
