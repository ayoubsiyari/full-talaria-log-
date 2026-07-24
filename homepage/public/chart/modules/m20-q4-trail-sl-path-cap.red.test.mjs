/**
 * M20-Q4 / W2 — trail_sl_path + sl_modifications RED probe (hardened).
 *
 * Status: FABLE-Q4-RED-READY-PENDING-A1-COMMIT — problem class confirmed
 * against the CURRENT (locked) product; retention semantics v2 modeled and
 * exercised as an executable spec; NO product edits (order-manager.js is
 * LOCKED in both trees until Manager commits A1).
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m20-q4-trail-sl-path-cap.red.test.mjs"
 *
 * Evidence:
 *   M20_Q4_EVIDENCE=red node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m20-q4-trail-sl-path-cap.red.test.mjs"
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  M20_Q4_HUNK_MANIFEST,
  M20_Q4_INVENTORY,
  M20_Q4_KILL_SWITCH,
  M20_Q4_SCHEMA_V1,
  appendSlModificationUnbounded,
  appendTrailSlPathUnbounded,
  makeSlModEntry,
  measureLiveHeapProxyBytes,
  measureTrailModPayloadBytes,
  modelQ4AppendSlMod,
  modelQ4AppendTrail,
  modelQ4DisciplineScan,
  modelQ4JournalCopyFields,
  projectQ4RowForExport,
  reconstructQ4Series,
  switchOffRequiresUnboundedArrays,
} from './m20-q4-trail-sl-path-cap-contract.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHART_ROOT = path.resolve(__dirname, '..');

/** Repo root works from both trees (chart v 1.4/... and homepage/public/...). */
function findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'docs', 'plan3'))
      && fs.existsSync(path.join(dir, 'chart v 1.4'))) {
      return dir;
    }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return path.resolve(start, '../../..');
}
const REPO_ROOT = findRepoRoot(__dirname);
const HOMEPAGE_CHART = path.join(REPO_ROOT, 'homepage', 'public', 'chart');
const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs/plan3/evidence');
const FIXTURE_DIR = path.join(REPO_ROOT, 'docs/plan3/fixtures');

const evidenceMode = String(process.env.M20_Q4_EVIDENCE || '').toLowerCase();
const TRAIL_MAX = M20_Q4_SCHEMA_V1.trailSlPathTailMax;
const MOD_MAX = M20_Q4_SCHEMA_V1.slModificationsTailMax;
const ON = {};
const OFF = { [M20_Q4_KILL_SWITCH]: true };

const evidence = {
  status: 'RED',
  label: 'FABLE-Q4-RED-READY-PENDING-A1-COMMIT',
  date: '2026-07-24',
  worker: 'W2-fable',
  killSwitchProposed: M20_Q4_KILL_SWITCH,
  schema: M20_Q4_SCHEMA_V1,
  hunkManifestIds: M20_Q4_HUNK_MANIFEST.map((h) => h.id),
  checks: [],
  growth: null,
  longSession: null,
  blockers: [],
  nextQueue: [],
};

function note(name, pass, detail = '') {
  evidence.checks.push({ name, pass: !!pass, detail });
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} [Q4-RED] ${name}${detail ? ` — ${detail}` : ''}\n`);
}

function readOm() {
  return fs.readFileSync(path.join(CHART_ROOT, 'modules/order-manager.js'), 'utf8');
}

function readHomeOm() {
  return fs.readFileSync(path.join(HOMEPAGE_CHART, 'modules/order-manager.js'), 'utf8');
}

function lineHas(src, line1Based, needle) {
  const lines = src.split(/\r?\n/);
  const line = lines[line1Based - 1] || '';
  return line.includes(needle);
}

/** Drive one synthetic trailing session through the models. */
function runModelSession({ bars, scope = ON, modEvery = 12, manualAt = [], row = null }) {
  const position = row || { id: 77, type: 'BUY', trail_sl_path: [], sl_modifications: [] };
  const manualSet = new Set(manualAt);
  for (let i = 0; i < bars; i++) {
    const sl = 1.09 + i * 0.00001;
    position.stopLoss = sl;
    modelQ4AppendTrail(position, sl, { scope });
    if (i % modEvery === 0) modelQ4AppendSlMod(position, makeSlModEntry(i, 'TRAIL'), { scope });
    if (manualSet.has(i)) modelQ4AppendSlMod(position, makeSlModEntry(i, 'MANUAL'), { scope });
  }
  return position;
}

// ─── Inventory / anchors (signed post-A1; re-verify before Q4 land) ────────

test('Q4 inventory: producer/consumer/persistence anchors resolve (signed)', () => {
  const om = readOm();
  // Lines re-verified + SIGNED by W2 Fable 2026-07-24 against post-A1 OM,
  // re-shifted a THIRD time after the A1 release-gate correction land
  // (ordering/kill-transition/missing-ref/split-guard/overlay/scan-bounds/
  // validation/logout-bridge methods added — no Q4 product code touched).
  // Region shifts: +5 (< A1 section), +514 (A1..persistJournal), +569
  // (analytics), +604 (≥ trade close paths). Every line re-greped.
  const checks = [
    ['producer sl_mod push (sole)', 6192, 'sl_modifications.push'],
    ['caller AUTO_BE_RECALC', 31838, '_logSLTPModification'],
    ['caller BUY AUTO_BE', 32201, '_logSLTPModification'],
    ['caller BUY TRAIL', 32294, '_logSLTPModification'],
    ['caller SELL AUTO_BE', 32519, '_logSLTPModification'],
    ['caller SELL TRAIL', 32607, '_logSLTPModification'],
    ['caller MANUAL_OVERRIDE_TRAIL', 34855, '_logSLTPModification'],
    ['caller MANUAL', 34858, '_logSLTPModification'],
    ['producer trail BUY push', 32330, 'trail_sl_path.push'],
    ['producer trail SELL push', 32643, 'trail_sl_path.push'],
    ['seed split-entry leg', 29255, 'sl_modifications'],
    ['seed market init', 29743, 'sl_modifications'],
    ['seed pending→market', 31743, 'sl_modifications'],
    ['consumer analytics trail presence', 7631, 'trail_sl_path'],
    ['consumer analytics discipline scans', 7644, 'sl_modifications'],
    ['persist scaled aggregate flatMap', 33783, 'sl_modifications'],
    ['persist split aggregate flatMap', 33991, 'sl_modifications'],
    ['persist single close copy', 34116, 'sl_modifications'],
    ['heavy keys trail only', 3989, 'trail_sl_path'],
    ['restore copyIfMissing precedent', 6117, 'copyIfMissing'],
  ];
  let ok = 0;
  for (const [name, line, needle] of checks) {
    const pass = lineHas(om, line, needle);
    note(`anchor:${name}`, pass, `L${line} ~ ${needle}`);
    if (pass) ok += 1;
    assert.equal(pass, true, `anchor drift: ${name} @ ${line}`);
  }
  note('inventory-count', ok === checks.length, `${ok}/${checks.length}`);
  assert.ok(M20_Q4_INVENTORY.producers.length >= 13);
  assert.ok(M20_Q4_INVENTORY.consumers.length >= 8);
  assert.ok(M20_Q4_INVENTORY.persistence.length >= 6);
  assert.equal(M20_Q4_HUNK_MANIFEST.length, 8);
});

test('Q4 gap: sl_modifications absent from OM heavy keys AND server mirror', () => {
  const om = readOm();
  const start = om.indexOf('_m19HotPersistHeavyFieldKeys()');
  assert.ok(start >= 0);
  const slice = om.slice(start, start + 800);
  const hasTrail = slice.includes("'trail_sl_path'");
  const hasMods = /'sl_modifications'/.test(slice);
  note('heavy-includes-trail_sl_path', hasTrail);
  note('heavy-missing-sl_modifications', !hasMods, 'gap confirmed for H4');
  assert.equal(hasTrail, true);
  assert.equal(hasMods, false);

  // Server-side mirror (session_journal_store.py) has the SAME gap — H7.
  const py = fs.readFileSync(path.join(REPO_ROOT, 'chart v 1.4/chart/session_journal_store.py'), 'utf8');
  const pyStart = py.indexOf('_HOT_PERSIST_HEAVY_KEYS');
  assert.ok(pyStart >= 0, 'server heavy-keys tuple missing');
  const pySlice = py.slice(pyStart, pyStart + 900);
  const pyTrail = pySlice.includes('"trail_sl_path"');
  const pyMods = pySlice.includes('"sl_modifications"');
  note('server-heavy-includes-trail', pyTrail);
  note('server-heavy-missing-mods', !pyMods, 'H7 gap confirmed');
  assert.equal(pyTrail, true);
  assert.equal(pyMods, false);

  assert.deepEqual(
    [...M20_Q4_SCHEMA_V1.heavyKeysToAdd],
    ['sl_modifications', 'trail_sl_path_archive', 'sl_modifications_archive'],
  );
});

test('Q4 product kill-switch NOT wired in order-manager (LOCKED, prep only)', () => {
  const om = readOm();
  const home = readHomeOm();
  const wired = om.includes(M20_Q4_KILL_SWITCH) || home.includes(M20_Q4_KILL_SWITCH);
  note('kill-switch-unwired', !wired, M20_Q4_KILL_SWITCH);
  assert.equal(wired, false);
});

// ─── RED: current product growth class (unchanged, still the problem) ──────

test('Q4 RED: uncapped trail_sl_path + sl_modifications grow without bound', () => {
  const BARS = 5_000;
  const position = { id: 77, type: 'BUY', trail_sl_path: [], sl_modifications: [] };
  for (let i = 0; i < BARS; i++) {
    appendTrailSlPathUnbounded(position, 1.09 + i * 0.00001);
    if (i % 12 === 0) appendSlModificationUnbounded(position, makeSlModEntry(i, 'TRAIL'));
  }
  for (let i = 0; i < 20; i++) {
    appendSlModificationUnbounded(position, makeSlModEntry(10_000 + i, 'MANUAL'));
  }

  const unbounded = measureTrailModPayloadBytes(position);
  const unboundedLive = measureLiveHeapProxyBytes(position);
  note('unbounded-trail-len', unbounded.trailLiveLen === BARS, `trailLen=${unbounded.trailLiveLen}`);
  note('unbounded-mod-len', unbounded.modLiveLen >= 400, `modLen=${unbounded.modLiveLen}`);
  note('unbounded-payload-bytes', unbounded.payloadBytes > 50_000, `bytes=${unbounded.payloadBytes}`);

  // Model the same session under Q4 ON for the projected collapse.
  const capped = runModelSession({ bars: BARS, scope: ON, manualAt: [100, 2500, 4999] });
  const cappedLive = measureLiveHeapProxyBytes(capped);
  const ratio = unboundedLive / Math.max(1, cappedLive);
  note('live-heap-proxy-collapse', ratio >= 8,
    `unboundedLive=${unboundedLive} cappedLive=${cappedLive} ratio=${ratio.toFixed(2)}`);

  evidence.growth = {
    bars: BARS,
    trailLenUnbounded: unbounded.trailLiveLen,
    modLenUnbounded: unbounded.modLiveLen,
    unboundedPayloadBytes: unbounded.payloadBytes,
    unboundedLiveHeapProxyBytes: unboundedLive,
    modelCappedLiveHeapProxyBytes: cappedLive,
    liveHeapProxyRatio: Number(ratio.toFixed(2)),
    trailTailMax: TRAIL_MAX,
    modTailMax: MOD_MAX,
  };
  assert.equal(unbounded.trailLiveLen, BARS);
  assert.ok(ratio >= 8, `expected live collapse ≥8×, got ${ratio}`);
});

// ─── Model spec: long synthetic session (bounded memory, exact scalars) ────

test('Q4 model: 20k-bar session — trail bounded, archive FROZEN, extrema exact', () => {
  const BARS = 20_000;
  // Baseline for truth values.
  const truth = { trail_sl_path: [], sl_modifications: [] };
  for (let i = 0; i < BARS; i++) appendTrailSlPathUnbounded(truth, 1.09 + i * 0.00001);

  const pos = runModelSession({ bars: BARS, scope: ON });

  assert.equal(pos.trail_sl_path.length, TRAIL_MAX, 'live tail capped');
  assert.equal(pos.trail_sl_path_count, BARS, 'count = full history');
  // Fresh row (no legacy): first activation archives the pre-tip prefix once,
  // pending drains immediately (all pre-tip samples were already dropped),
  // then the archive freezes — bounded forever after.
  assert.equal(pos.trail_sl_path_legacy_pending, 0, 'pending drained');
  const archLen = pos.trail_sl_path_archive.length;
  assert.ok(archLen <= TRAIL_MAX + 1, `archive frozen small on fresh row, got ${archLen}`);

  // Extrema/latest exact vs unbounded truth.
  const nums = truth.trail_sl_path.map(Number);
  assert.equal(pos.trail_sl_last, nums[nums.length - 1], 'last exact');
  assert.equal(pos.trail_sl_min, Math.min(...nums), 'min exact');
  assert.equal(pos.trail_sl_max, Math.max(...nums), 'max exact');

  // Live tail is exactly the newest TRAIL_MAX samples in order.
  assert.deepEqual(pos.trail_sl_path, nums.slice(BARS - TRAIL_MAX), 'tail = newest suffix, ordered');

  // Mods: lossless — every event retained across live + archive, in order.
  const allMods = reconstructQ4Series(pos, 'sl_modifications');
  const expectedModCount = Math.ceil(BARS / 12);
  assert.equal(allMods.length, expectedModCount, 'no mod event lost');
  assert.equal(pos.sl_modifications_count, expectedModCount);
  assert.equal(pos.sl_modifications.length, MOD_MAX, 'mod live tail capped');
  for (let i = 1; i < allMods.length; i++) {
    assert.ok(allMods[i].bar >= allMods[i - 1].bar, 'mod order preserved');
  }
  note('long-session-bounded',
    pos.trail_sl_path.length === TRAIL_MAX && allMods.length === expectedModCount,
    `bars=${BARS} tail=${pos.trail_sl_path.length} archFrozen=${archLen} mods=${allMods.length} lossless`);

  evidence.longSession = {
    bars: BARS,
    trailLive: pos.trail_sl_path.length,
    trailArchiveFrozenAt: archLen,
    trailCount: pos.trail_sl_path_count,
    modsTotal: allMods.length,
    modsLive: pos.sl_modifications.length,
    modsArchive: pos.sl_modifications_archive.length,
    liveHeapProxyBytes: measureLiveHeapProxyBytes(pos),
  };
});

test('Q4 model: MANUAL stop-modification storm — zero audit loss, counts exact', () => {
  const pos = { id: 9, trail_sl_path: [], sl_modifications: [] };
  const N = 500;
  for (let i = 0; i < N; i++) {
    const trig = i % 7 === 0 ? 'MANUAL' : (i % 11 === 0 ? 'MANUAL_OVERRIDE_TRAIL' : 'TRAIL');
    modelQ4AppendSlMod(pos, makeSlModEntry(i, trig), { scope: ON });
  }
  const all = reconstructQ4Series(pos, 'sl_modifications');
  assert.equal(all.length, N, 'every event retained');
  assert.equal(pos.sl_modifications.length, MOD_MAX);
  assert.equal(pos.sl_modifications_archive.length, N - MOD_MAX);

  const manualTruth = all.filter((m) => m.trigger === 'MANUAL').length;
  assert.equal(pos.sl_mod_trigger_counts.MANUAL, manualTruth, 'MANUAL tally exact');
  const scan = modelQ4DisciplineScan(pos);
  assert.equal(scan.slModified, true, 'archive-aware scan still finds MANUAL');
  assert.equal(scan.trailOverridden, true, 'finds MANUAL_OVERRIDE_TRAIL');

  // Discipline results identical to legacy whole-array scan on truth.
  const legacy = {
    slModified: all.some((m) => m.trigger === 'MANUAL'),
    tpModified: all.some((m) => m.trigger === 'MANUAL' && String(m.field || '').includes('TP')),
    trailOverridden: all.some((m) => m.trigger === 'MANUAL_OVERRIDE_TRAIL'),
  };
  assert.deepEqual(scan, legacy, 'scan ≡ legacy semantics');
  note('manual-storm-lossless', true, `events=${N} manual=${manualTruth} scan≡legacy`);
});

// ─── Model spec: restore (I16) ──────────────────────────────────────────────

test('Q4 model: restored LEGACY uncapped row — first append archives, nothing lost', () => {
  const LEGACY = 4_000;
  const legacyTrail = [];
  for (let i = 0; i < LEGACY; i++) legacyTrail.push(1.2 + i * 0.00001);
  const legacyMods = [];
  for (let i = 0; i < 200; i++) legacyMods.push(makeSlModEntry(i, i === 50 ? 'MANUAL' : 'TRAIL'));
  // Restored row: raw legacy arrays, no Q4 fields (I16: restore leaves untouched).
  const pos = { id: 5, trail_sl_path: legacyTrail.slice(), sl_modifications: legacyMods.slice() };
  const beforeLen = pos.trail_sl_path.length;
  assert.equal(beforeLen, LEGACY, 'restore untouched until first new append');

  // Resume: 600 new bars.
  for (let i = 0; i < 600; i++) {
    modelQ4AppendTrail(pos, 1.25 + i * 0.00001, { scope: ON });
    if (i % 12 === 0) modelQ4AppendSlMod(pos, makeSlModEntry(LEGACY + i, 'TRAIL'), { scope: ON });
  }

  const fullTrail = reconstructQ4Series(pos, 'trail_sl_path');
  // Two-phase guarantee: every LEGACY sample survives (archive + tail); new
  // samples beyond the tail fold into scalars (M19-B semantics).
  const expectedNew = legacyTrail.concat(
    Array.from({ length: 600 }, (_, i) => 1.25 + i * 0.00001),
  );
  for (let i = 0; i < LEGACY; i++) {
    assert.equal(fullTrail[i], legacyTrail[i], `legacy sample ${i} preserved in order`);
  }
  assert.equal(pos.trail_sl_path.length, TRAIL_MAX);
  assert.equal(pos.trail_sl_path_legacy_pending, 0, 'legacy pending drained');
  assert.equal(pos.trail_sl_last, expectedNew[expectedNew.length - 1], 'last tracks resume');
  assert.equal(pos.trail_sl_max, Math.max(...expectedNew.map(Number)), 'max spans legacy+new');

  const fullMods = reconstructQ4Series(pos, 'sl_modifications');
  assert.equal(fullMods.length, 200 + 50, 'legacy + new mods all retained');
  assert.equal(modelQ4DisciplineScan(pos).slModified, true, 'legacy MANUAL still visible');
  note('restore-legacy-lossless', true,
    `legacyTrail=${LEGACY} preserved; live=${pos.trail_sl_path.length}; mods=${fullMods.length}`);
});

test('Q4 model: Q4-shaped row restores verbatim; append continues cleanly', () => {
  const pos = runModelSession({ bars: 1_000, scope: ON });
  const snapshot = JSON.parse(JSON.stringify(pos));
  // "Restore": deep clone (durable round-trip), then continue.
  const restored = JSON.parse(JSON.stringify(snapshot));
  modelQ4AppendTrail(restored, 9.99, { scope: ON });
  assert.equal(restored.trail_sl_path.length, TRAIL_MAX);
  assert.equal(restored.trail_sl_path_count, 1_001);
  assert.equal(restored.trail_sl_last, 9.99);
  assert.equal(restored.trail_sl_max, 9.99);
  note('restore-q4-shape-continues', true, 'count/scalars continue across round-trip');
});

// ─── Model spec: exit / scale-out / grouped close copies ───────────────────

test('Q4 model: close copies — single + scaled/split aggregate keep full audit', () => {
  // Three scaled legs with distinct histories (leg 2 has a MANUAL event).
  const legs = [0, 1, 2].map((n) => {
    const leg = { id: 100 + n, trail_sl_path: [], sl_modifications: [] };
    for (let i = 0; i < 300 + n * 50; i++) {
      modelQ4AppendTrail(leg, 2 + n + i * 0.0001, { scope: ON });
      if (i % 10 === 0) modelQ4AppendSlMod(leg, makeSlModEntry(i, 'TRAIL'), { scope: ON });
    }
    if (n === 1) modelQ4AppendSlMod(leg, makeSlModEntry(999, 'MANUAL'), { scope: ON });
    return leg;
  });

  // Aggregate (scaled/split) close — flatMap per-leg reconstruct in leg order.
  const agg = modelQ4JournalCopyFields(legs);
  const perLegMods = legs.map((l) => reconstructQ4Series(l, 'sl_modifications'));
  assert.equal(agg.sl_modifications.length, perLegMods.reduce((s, a) => s + a.length, 0),
    'aggregate keeps every leg event');
  assert.ok(agg.sl_modifications.some((m) => m.trigger === 'MANUAL'), 'leg-2 MANUAL survives aggregate');
  // Leg order preserved: leg 0 block precedes leg 1 block.
  assert.deepEqual(agg.sl_modifications.slice(0, perLegMods[0].length), perLegMods[0], 'leg order');

  // Single close.
  const single = modelQ4JournalCopyFields(legs[1]);
  assert.deepEqual(single.sl_modifications, perLegMods[1]);

  // Scale-out mid-life: partial close does not disturb the leg's audit log.
  const leg = legs[0];
  const before = reconstructQ4Series(leg, 'sl_modifications').length;
  leg.partialCloses = [{ qty: 0.5, pnl_net: 10 }];
  modelQ4AppendSlMod(leg, makeSlModEntry(1_000, 'AUTO_BE'), { scope: ON });
  assert.equal(reconstructQ4Series(leg, 'sl_modifications').length, before + 1,
    'scale-out then AUTO_BE — log continues lossless');
  note('close-copy-aggregate-lossless', true,
    `legs=3 aggMods=${agg.sl_modifications.length} scaleOut+1 ok`);
});

// ─── Model spec: export projection ──────────────────────────────────────────

test('Q4 model: export projection reconstructs once, idempotent, archive dropped', () => {
  const pos = runModelSession({ bars: 2_000, scope: ON, manualAt: [42] });
  const view = projectQ4RowForExport(pos);
  assert.equal(view.trail_sl_path.length,
    pos.trail_sl_path_archive.length + TRAIL_MAX, 'view = archive‖tail');
  assert.equal(view.trail_sl_path_archive, undefined, 'archive key dropped from view');
  assert.equal(view.sl_modifications_archive, undefined);
  assert.equal(view.sl_modifications.length,
    reconstructQ4Series(pos, 'sl_modifications').length, 'full mods in view');
  // Idempotent.
  const view2 = projectQ4RowForExport(view);
  assert.deepEqual(view2, view, 'P(P(row)) === P(row)');
  // Storage not mutated.
  assert.equal(pos.trail_sl_path.length, TRAIL_MAX, 'storage stays disjoint');
  assert.ok(Array.isArray(pos.trail_sl_path_archive));
  note('export-projection-idempotent', true,
    `viewTrail=${view.trail_sl_path.length} viewMods=${view.sl_modifications.length}`);
});

// ─── Switch-OFF legacy discrimination ───────────────────────────────────────

test('Q4 model: switch-OFF ≡ today byte-for-byte; archives never destroyed', () => {
  assert.equal(switchOffRequiresUnboundedArrays(OFF), true);
  assert.equal(switchOffRequiresUnboundedArrays(ON), false);

  // Kill run must be byte-identical to today's bare pushes.
  const BARS = 3_000;
  const killPos = runModelSession({ bars: BARS, scope: OFF, manualAt: [7] });
  const todayPos = { id: 77, type: 'BUY', trail_sl_path: [], sl_modifications: [] };
  for (let i = 0; i < BARS; i++) {
    const sl = 1.09 + i * 0.00001;
    todayPos.stopLoss = sl;
    appendTrailSlPathUnbounded(todayPos, sl);
    if (i % 12 === 0) appendSlModificationUnbounded(todayPos, makeSlModEntry(i, 'TRAIL'));
    if (i === 7) appendSlModificationUnbounded(todayPos, makeSlModEntry(i, 'MANUAL'));
  }
  assert.deepEqual(killPos.trail_sl_path, todayPos.trail_sl_path, 'kill trail ≡ today');
  assert.deepEqual(killPos.sl_modifications, todayPos.sl_modifications, 'kill mods ≡ today');
  assert.equal(killPos.trail_sl_path_archive, undefined, 'no Q4 fields under kill');
  assert.equal(killPos[M20_Q4_SCHEMA_V1.markKey], undefined, 'no mark under kill');
  const killBytes = JSON.stringify(killPos.trail_sl_path).length;
  const todayBytes = JSON.stringify(todayPos.trail_sl_path).length;
  assert.equal(killBytes, todayBytes, 'byte class identical');

  // Kill AFTER a Q4-shaped row exists: archive left intact, reconstruct valid.
  const shaped = runModelSession({ bars: 1_000, scope: ON });
  const archBefore = shaped.trail_sl_path_archive.slice();
  modelQ4AppendTrail(shaped, 3.33, { scope: OFF });
  assert.deepEqual(shaped.trail_sl_path_archive, archBefore, 'kill never destroys archive');
  const full = reconstructQ4Series(shaped, 'trail_sl_path');
  assert.equal(full[full.length - 1], 3.33, 'reconstruct still valid under kill');
  note('switch-off-discrimination', true,
    `killBytes=${killBytes} ≡ todayBytes=${todayBytes}; archive preserved under kill`);
});

// ─── Fixture + status + evidence ────────────────────────────────────────────

test('Q4 fixture written for byte-budget reuse', () => {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  const fixturePath = path.join(FIXTURE_DIR, 'W2-Q4-trail-sl-path-unbounded-20260724.json');
  const position = { id: 1, trail_sl_path: [], sl_modifications: [] };
  for (let i = 0; i < 512; i++) {
    appendTrailSlPathUnbounded(position, 1.1 + i * 0.0001);
    if (i % 8 === 0) appendSlModificationUnbounded(position, makeSlModEntry(i, 'TRAIL'));
  }
  const unc = measureTrailModPayloadBytes(position);
  const modeled = runModelSession({ bars: 512, scope: ON, modEvery: 8 });
  const payload = {
    label: 'Q4-RED-fixture',
    status: 'FABLE-Q4-RED-READY-PENDING-A1-COMMIT',
    sampleBars: 512,
    unbounded: unc,
    modelCapped: measureTrailModPayloadBytes(modeled),
    liveHeapProxyUnbounded: measureLiveHeapProxyBytes(position),
    liveHeapProxyModelCapped: measureLiveHeapProxyBytes(modeled),
    schema: M20_Q4_SCHEMA_V1,
    killSwitch: M20_Q4_KILL_SWITCH,
    hunkManifestIds: M20_Q4_HUNK_MANIFEST.map((h) => h.id),
  };
  fs.writeFileSync(fixturePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  note('fixture-written', fs.existsSync(fixturePath), fixturePath);
  assert.equal(fs.existsSync(fixturePath), true);
});

test('Q4 overall status: RED-READY, product land gated on A1 commit', () => {
  const om = readOm();
  const productLanded = om.includes(M20_Q4_KILL_SWITCH)
    || /_m20Q4BoundTrailSlPath|_m20Q4TrailSlPathCapV1Enabled/.test(om);
  note('product-not-landed', !productLanded, productLanded ? 'UNEXPECTED LAND' : 'RED confirmed');
  assert.equal(productLanded, false);

  evidence.blockers = [
    'order-manager.js LOCKED (both trees) — A1 under independent review, Manager commit pending',
    'Q4 bound helpers + producer wiring (H1–H5) forbidden until lock lifts',
    'Server heavy-key mirror (H7) + dashboard reconstruct (H8) queued with land',
  ];
  evidence.nextQueue = [
    'Manager commits A1 → order-manager.js released',
    'W2 re-verifies anchor lines (this file) against released OM',
    'W2 lands Q4 H1–H5 behind kill-switch (dual-tree) → flip this probe GREEN (H6)',
    'H7 server mirror + H8 dashboard reconstruct in the same wave',
  ];
  evidence.status = 'RED';
  evidence.label = 'FABLE-Q4-RED-READY-PENDING-A1-COMMIT';
});

test('write Q4 RED evidence JSON when M20_Q4_EVIDENCE=red', () => {
  if (evidenceMode !== 'red') {
    note('evidence-skip', true, `M20_Q4_EVIDENCE=${evidenceMode || '(unset)'}`);
    return;
  }
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const out = path.join(EVIDENCE_DIR, 'W2-Q4-TRAIL-SL-PATH-CAP-20260724-red.json');
  fs.writeFileSync(out, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  note('evidence-written', true, out);
  assert.equal(fs.existsSync(out), true);
});
