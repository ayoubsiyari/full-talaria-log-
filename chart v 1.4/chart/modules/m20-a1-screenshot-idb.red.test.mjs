/**
 * M20-A1 / W2 — screenshots→IndexedDB baseline probe + landed-state guard.
 *
 * History: this file began as the pre-land RED probe (evidence retained at
 * docs/plan3/evidence/W2-A1-SCREENSHOT-IDB-20260724-red.json — 17.5 MB
 * retained / ~719× durable-over-slim). A1 has since LANDED in
 * order-manager.js behind __TALARIA_DISABLE_M20_A1_SCREENSHOT_IDB_V1, so this
 * probe now asserts:
 *   1. the RED problem class is still demonstrable on the fixture (pure math);
 *   2. the product wiring EXISTS in both trees (kill-switch + refs + IDB store);
 *   3. Q4 remains UNWIRED (next queued task — anchors pre-staged only).
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m20-a1-screenshot-idb.red.test.mjs"
 *
 * Behavioral GREEN + switch-OFF discrimination lives in
 * m20-a1-screenshot-idb.green.test.mjs.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  M20_A1_IDB,
  M20_A1_INVENTORY,
  M20_A1_KILL_SWITCH,
  M20_A1_SCHEMA_V1,
  M20_Q4_ANCHORS_PRESTAGE,
  isEmbeddedScreenshotDataUrl,
  makeFatScreenshotFixture,
  measureEmbeddedScreenshotBytes,
  projectA1SlimRow,
  screenshotValueBytes,
  switchOffRequiresEmbeddedBlobs,
} from './m20-a1-screenshot-idb-contract.mjs';

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
const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs', 'plan3', 'evidence');
const FIXTURE_DIR = path.join(REPO_ROOT, 'docs', 'plan3', 'fixtures');

const evidenceMode = String(process.env.M20_A1_EVIDENCE || '').toLowerCase();
const evidence = {
  status: 'LANDED-PROBE',
  label: 'W2-FABLE-SIGNED',
  date: '2026-07-24',
  worker: 'W2-fable',
  killSwitch: M20_A1_KILL_SWITCH,
  schema: M20_A1_SCHEMA_V1,
  idb: M20_A1_IDB,
  checks: [],
  retention: null,
  q4Anchors: M20_Q4_ANCHORS_PRESTAGE,
};

function note(name, pass, detail = '') {
  evidence.checks.push({ name, pass: !!pass, detail });
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} [A1-PROBE] ${name}${detail ? ` — ${detail}` : ''}\n`);
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

function searchModulesForIndexedDb() {
  const roots = [
    path.join(CHART_ROOT, 'modules'),
    path.join(HOMEPAGE_CHART, 'modules'),
  ];
  const hits = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const name of fs.readdirSync(root)) {
      if (!/\.(js|mjs|ts|tsx)$/.test(name)) continue;
      // Product modules only: A1 contract/probe files and test scaffolds may
      // legitimately mention IndexedDB in prose/assertions.
      if (name.startsWith('m20-a1-screenshot-idb')) continue;
      if (/\.test\.mjs$/.test(name)) continue;
      const full = path.join(root, name);
      const txt = fs.readFileSync(full, 'utf8');
      if (/indexedDB|IDBOpenDBRequest|IDBDatabase/i.test(txt)) {
        hits.push(path.relative(REPO_ROOT, full).replace(/\\/g, '/'));
      }
    }
  }
  return hits;
}

// ─── Inventory / anchors (content-based; line numbers drift after edits) ──

test('A1 inventory: producer/consumer/serializer anchors still resolve', () => {
  const om = readOm();
  const sm = fs.readFileSync(path.join(CHART_ROOT, 'modules/screenshot-manager.js'), 'utf8');
  const host = fs.readFileSync(path.join(CHART_ROOT, 'modules/order-host-store.mjs'), 'utf8');

  const checks = [
    ['producer captureChartSnapshot', sm, 'captureChartSnapshot'],
    ['producer market entryScreenshot', om, 'order.entryScreenshot = screenshot'],
    ['producer rail screenshots', om, 'order.railScreenshots = list'],
    ['consumer journal UI img', om, '<img src="${trade.entryScreenshot}"'],
    ['consumer preview', om, 'showScreenshotPreview('],
    ['serializer persistJournal', om, 'persistJournal()'],
    ['serializer heavy keys', om, "'entryScreenshot', 'exitScreenshot', 'entryScreenshots', 'railScreenshots'"],
    ['serializer host snapshot', host, 'buildHostOrderStoreSnapshot'],
  ];

  let ok = 0;
  for (const [name, src, needle] of checks) {
    const pass = src.includes(needle);
    note(`anchor:${name}`, pass, needle.slice(0, 48));
    if (pass) ok += 1;
    assert.equal(pass, true, `anchor drift: ${name}`);
  }
  note('inventory-count', ok === checks.length, `${ok}/${checks.length}`);
  assert.equal(M20_A1_INVENTORY.producers.length >= 5, true);
  assert.equal(M20_A1_INVENTORY.consumers.length >= 4, true);
  assert.equal(M20_A1_INVENTORY.serializers.length >= 3, true);
});

test('A1 landed: IndexedDB screenshot store lives in order-manager.js only', () => {
  const hits = searchModulesForIndexedDb();
  const expected = hits.filter((h) => h.endsWith('modules/order-manager.js'));
  const unexpected = hits.filter((h) => !h.endsWith('modules/order-manager.js'));
  note('idb-store-in-om', expected.length >= 1, expected.join(', '));
  note('no-unexpected-idb-usage', unexpected.length === 0,
    unexpected.length ? unexpected.join(', ') : 'clean');
  assert.ok(expected.length >= 1, 'A1 store must be wired in order-manager.js');
  assert.equal(unexpected.length, 0, `unexpected IndexedDB usage: ${unexpected.join(', ')}`);
});

test('A1 landed: kill-switch + additive schema wired in BOTH trees', () => {
  const om = readOm();
  const home = fs.existsSync(path.join(HOMEPAGE_CHART, 'modules/order-manager.js'))
    ? readHomeOm()
    : null;
  for (const [tree, src] of [['chart', om], ['homepage', home]]) {
    if (!src) {
      note(`kill-switch-wired:${tree}`, false, 'tree missing');
      assert.fail(`${tree} order-manager.js missing`);
    }
    const wired = src.includes(M20_A1_KILL_SWITCH)
      && src.includes(M20_A1_SCHEMA_V1.refFields.entry)
      && src.includes(M20_A1_SCHEMA_V1.refFields.exit)
      && src.includes(M20_A1_IDB.dbName)
      && src.includes('_m20A1RunRetainedSweepNow');
    note(`kill-switch-wired:${tree}`, wired, M20_A1_KILL_SWITCH);
    assert.equal(wired, true, `A1 wiring incomplete in ${tree} tree`);
  }
});

// ─── Retention / payload bytes (problem-class demonstration, pure math) ───

test('A1 baseline: fixture demonstrates multi-MB retention problem class', () => {
  const shot = makeFatScreenshotFixture('E', 60_000);
  assert.equal(isEmbeddedScreenshotDataUrl(shot), true);
  const perShot = screenshotValueBytes(shot);
  assert.ok(perShot > 50_000, `fixture too small: ${perShot}`);

  const journal = [];
  for (let i = 0; i < 50; i++) {
    journal.push({
      id: 1000 + i,
      tradeId: 1000 + i,
      entryScreenshot: shot,
      exitScreenshot: shot,
      railScreenshots: [{ dataUrl: shot, name: `rail-${i}` }],
      metadata: { entryScreenshot: shot },
      journalEntry: { exitScreenshot: shot },
    });
  }
  const openPositions = [
    { id: 9, entryScreenshot: shot, railScreenshots: [{ dataUrl: shot, name: 'open-rail' }] },
  ];
  const closedPositions = journal.slice(0, 20).map((r) => ({
    id: r.id,
    entryScreenshot: r.entryScreenshot,
    exitScreenshot: r.exitScreenshot,
  }));

  const j = measureEmbeddedScreenshotBytes(journal);
  const o = measureEmbeddedScreenshotBytes(openPositions);
  const c = measureEmbeddedScreenshotBytes(closedPositions);
  const retained = j.totalBytes + o.totalBytes + c.totalBytes;

  const MIN_RETAINED = 8_000_000;
  const pass = retained >= MIN_RETAINED && j.rowsWithShots === 50;
  note('baseline-retention-bytes', pass, `retained=${retained} journalRows=${j.rowsWithShots}`);

  const durableBytes = JSON.stringify({
    journal, open_positions: openPositions, closed_positions: closedPositions,
  }).length;
  note('baseline-durable-bytes', durableBytes >= MIN_RETAINED, `durableBytes=${durableBytes}`);

  const slimJournal = journal.map((row) => projectA1SlimRow(row, {
    entry: { refId: `sess/entry/${row.id}`, mime: 'image/jpeg', byteLength: perShot, role: 'entry' },
    exit: { refId: `sess/exit/${row.id}`, mime: 'image/jpeg', byteLength: perShot, role: 'exit' },
    rail: [{ refId: `sess/rail/${row.id}`, mime: 'image/jpeg', byteLength: perShot, role: 'rail' }],
  }));
  const slimBytes = JSON.stringify({ journal: slimJournal }).length;
  const slimMeasure = measureEmbeddedScreenshotBytes(slimJournal);
  note('projected-slim-drops-embedded', slimMeasure.totalBytes === 0, `slimEmbedded=${slimMeasure.totalBytes}`);
  note('projected-slim-vs-durable', slimBytes * 20 < durableBytes, `slim=${slimBytes} durable=${durableBytes}`);

  evidence.retention = {
    fixtureCharsPerShot: perShot,
    trades: 50,
    retainedEmbeddedBytes: retained,
    durableSerializeBytes: durableBytes,
    projectedA1SlimSerializeBytes: slimBytes,
    ratioDurableOverSlim: Number((durableBytes / Math.max(1, slimBytes)).toFixed(2)),
    minRetainedGate: MIN_RETAINED,
  };

  assert.equal(pass, true, `expected multi-MB in-memory retention, got ${retained}`);
  assert.equal(slimMeasure.totalBytes, 0);
});

test('A1 switch-OFF contract helper: kill forces embedded-blob requirement', () => {
  const off = { [M20_A1_KILL_SWITCH]: true };
  const on = {};
  assert.equal(switchOffRequiresEmbeddedBlobs(off), true);
  assert.equal(switchOffRequiresEmbeddedBlobs(on), false);
  note('switch-off-contract-helper', true, 'kill=true → require embedded blobs');
});

// ─── Q4 pre-stage (next queued; must remain UNWIRED this task) ────────────

test('Q4 anchors resolve at refreshed lines and Q4 stays unwired', () => {
  const om = readOm();
  let ok = 0;
  for (const site of M20_Q4_ANCHORS_PRESTAGE.sites) {
    const needle = site.needle || 'trail_sl_path';
    const pass = lineHas(om, site.line, needle) || om.includes(needle);
    const exact = lineHas(om, site.line, needle);
    note(`q4-anchor:L${site.line}`, pass, `${site.symbol}${exact ? '' : ' (line drifted — content present)'}`);
    if (pass) ok += 1;
    assert.equal(pass, true, `Q4 anchor missing: ${site.symbol}`);
  }
  note('q4-anchor-count', ok === M20_Q4_ANCHORS_PRESTAGE.sites.length,
    `${ok}/${M20_Q4_ANCHORS_PRESTAGE.sites.length}`);
  assert.equal(om.includes(M20_Q4_ANCHORS_PRESTAGE.killSwitchProposed), false,
    'Q4 must remain unwired until its own task');
});

test('A1 fixture file kept for byte-budget reuse', () => {
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  const fixturePath = path.join(FIXTURE_DIR, 'W2-A1-screenshot-retention-20260724.json');
  const shot = makeFatScreenshotFixture('FX', 12_000);
  const row = {
    id: 42,
    entryScreenshot: shot,
    exitScreenshot: shot,
    railScreenshots: [{ dataUrl: shot, name: 'rail' }],
  };
  const payload = {
    label: 'A1-retention-fixture',
    status: 'LANDED',
    perShotBytes: screenshotValueBytes(shot),
    sampleRowEmbeddedBytes: measureEmbeddedScreenshotBytes([row]).totalBytes,
    projectedSlimBytes: JSON.stringify(projectA1SlimRow(row, {
      entry: { refId: 'fx/entry/42', mime: 'image/jpeg', byteLength: screenshotValueBytes(shot) },
      exit: { refId: 'fx/exit/42', mime: 'image/jpeg', byteLength: screenshotValueBytes(shot) },
    })).length,
    schema: M20_A1_SCHEMA_V1,
    killSwitch: M20_A1_KILL_SWITCH,
  };
  fs.writeFileSync(fixturePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  note('fixture-written', fs.existsSync(fixturePath), fixturePath);
  assert.equal(fs.existsSync(fixturePath), true);
});

test('A1 product landed (kill-switch + refs schema present in OM)', () => {
  const om = readOm();
  const productLanded = om.includes(M20_A1_KILL_SWITCH)
    && om.includes(M20_A1_SCHEMA_V1.refFields.entry);
  note('product-landed', productLanded, productLanded ? 'A1 wired' : 'MISSING');
  assert.equal(productLanded, true);
});

test('write landed-probe evidence JSON when M20_A1_EVIDENCE=probe', () => {
  if (evidenceMode !== 'probe') {
    note('evidence-skip', true, `M20_A1_EVIDENCE=${evidenceMode || '(unset)'}`);
    return;
  }
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  // Historical pre-land RED evidence (…-red.json) is preserved untouched.
  const out = path.join(EVIDENCE_DIR, 'W2-A1-SCREENSHOT-IDB-20260724-landed-probe.json');
  fs.writeFileSync(out, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  note('evidence-written', true, out);
  assert.equal(fs.existsSync(out), true);
});
