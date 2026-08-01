/**
 * MA-SCALECAP mutant runner.
 *
 * Each mutant deliberately breaks ONE behaviour on disk, in EVERY copy of
 * order-manager.js, then runs the MA-SCALECAP suite and records which NAMED
 * cell died. The files are restored afterwards and their SHA-256 verified
 * against the pre-run hash.
 *
 *   node "chart v 1.4/chart/modules/ma-scalein-entry-cap.mutants.mjs"
 *
 * A mutant whose needle does not match EXACTLY once in EVERY target file is
 * reported as NOT_APPLIED and the run fails: a silently unapplied mutant is a
 * fabricated pass. MUT-NC is a deliberate negative control whose needle does
 * not exist — it MUST report NOT_APPLIED.
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SUITE = path.join(__dirname, 'ma-scalein-entry-cap.test.mjs');

const TARGETS = [
  path.join(REPO_ROOT, 'chart v 1.4', 'chart', 'modules', 'order-manager.js'),
  path.join(REPO_ROOT, 'homepage', 'public', 'chart', 'modules', 'order-manager.js'),
].filter((p) => fs.existsSync(p));

if (TARGETS.length < 2) {
  console.error(`FAIL: expected 2 order-manager.js copies, found ${TARGETS.length}`);
  process.exit(1);
}

const WARN_LINE = '                console.warn(`   ⛔ Group #${groupId} already holds ${legCount} entry level(s) (max ${MAX_ENTRY_LEVELS}) — order #${order.id} stays a standalone position`);\n';
const FLAG_BODY = "    if (typeof window === 'undefined') return true;\n    return !window.__TALARIA_DISABLE_SCALEIN_ENTRY_CAP_V1;";
/** The refusal's tail: 16-space indent distinguishes it from the accepted-leg call. */
const REFUSE_TAIL = '                this._inheritScaleInProtection(order, existingPos);\n                return null;';

const MUTANTS = [
  {
    id: 'MUT-01',
    what: 'cap removed — the guard is short-circuited away entirely',
    find: '        if (_scaleInEntryCapV1Enabled()) {\n            const existingGroupForCap',
    replace: '        if (false) {\n            const existingGroupForCap',
    expectCells: ['SC-C1', 'SC-C3', 'SC-C4'],
  },
  {
    id: 'MUT-02',
    what: 'off-by-one in the shared cap predicate (`<` becomes `<=`, allows a 5th level)',
    find: '        return n < MAX_ENTRY_LEVELS;',
    replace: '        return n <= MAX_ENTRY_LEVELS;',
    expectCells: ['SC-C3', 'SC-C18'],
  },
  {
    id: 'MUT-03',
    what: 'off-by-one at the cap boundary in applyScaling (leg count under-reported by one)',
    find: '            if (!this._canAddMoreMultiEntryLevels(legCount)) {',
    replace: '            if (!this._canAddMoreMultiEntryLevels(legCount - 1)) {',
    expectCells: ['SC-C1', 'SC-C3'],
  },
  {
    id: 'MUT-04',
    what: 'kill-switch polarity inverted (cap active only WHEN disabled)',
    find: '    return !window.__TALARIA_DISABLE_SCALEIN_ENTRY_CAP_V1;',
    replace: '    return !!window.__TALARIA_DISABLE_SCALEIN_ENTRY_CAP_V1;',
    expectCells: ['SC-C13'],
  },
  {
    id: 'MUT-05',
    what: 'kill-switch uses `!== true` instead of truthy semantics (FLAG-02 defect)',
    find: '    return !window.__TALARIA_DISABLE_SCALEIN_ENTRY_CAP_V1;',
    replace: '    return window.__TALARIA_DISABLE_SCALEIN_ENTRY_CAP_V1 !== true;',
    expectCells: ['SC-C13'],
  },
  {
    id: 'MUT-06',
    what: 'kill-switch memoised on first call (FLAG-01 defect)',
    find: FLAG_BODY,
    replace: "    if (typeof window === 'undefined') return true;\n    if (_scaleInEntryCapV1Enabled._memo === undefined) {\n        _scaleInEntryCapV1Enabled._memo = !window.__TALARIA_DISABLE_SCALEIN_ENTRY_CAP_V1;\n    }\n    return _scaleInEntryCapV1Enabled._memo;",
    expectCells: ['SC-C16'],
  },
  {
    id: 'MUT-07',
    what: '`entries` capped but `entryScreenshots` collected from an UNBOUNDED source (desynchronisation hazard)',
    find: '            entryScreenshots: scaledInfo.entries\n                .filter(e => e.entryScreenshot)',
    replace: '            entryScreenshots: (this.openPositions || []).concat(this.closedPositions || [])\n                .filter(e => e.entryScreenshot)',
    expectCells: ['SC-C9', 'SC-C10', 'SC-C11'],
  },
  {
    id: 'MUT-08',
    what: 'refused leg is still stamped with tradeGroupId (orphan leg — its P&L never reaches the journal)',
    find: REFUSE_TAIL,
    replace: '                this._inheritScaleInProtection(order, existingPos);\n                order.tradeGroupId = groupId;\n                return null;',
    expectCells: ['SC-C4', 'SC-C5'],
  },
  {
    id: 'MUT-09',
    what: 'guard is evaluated but the refusal is not enforced (falls through and pushes anyway)',
    find: `${REFUSE_TAIL}\n`,
    replace: '                this._inheritScaleInProtection(order, existingPos);\n',
    expectCells: ['SC-C1', 'SC-C3'],
  },
  {
    id: 'MUT-10',
    what: 'cap defaults OFF when there is no `window` (fails open outside the browser)',
    find: FLAG_BODY,
    replace: "    if (typeof window === 'undefined') return false;\n    return !window.__TALARIA_DISABLE_SCALEIN_ENTRY_CAP_V1;",
    expectCells: ['SC-C17'],
  },
  {
    id: 'MUT-11',
    what: 'refusal becomes silent — no operator-visible trace that a leg was left standalone',
    find: WARN_LINE,
    replace: '',
    expectCells: ['SC-C19'],
  },
  {
    id: 'MUT-12',
    what: 'refused leg loses the SL/TP/risk inheritance (standalone AND unprotected)',
    find: '                // Standalone, but not unprotected: the user asked to add to a\n                // protected position, so the risk plumbing still comes across.\n                this._inheritScaleInProtection(order, existingPos);\n',
    replace: '',
    expectCells: ['SC-C21'],
  },
  {
    id: 'MUT-13',
    what: 'inheritance clobbers a stop the order already had',
    find: '        if (existingPos.stopLoss && !order.stopLoss) {',
    replace: '        if (existingPos.stopLoss) {',
    expectCells: ['SC-C22'],
  },
  {
    id: 'MUT-NC',
    what: 'NEGATIVE CONTROL — needle intentionally absent; MUST report NOT_APPLIED',
    find: '        if (_scaleInEntryCapThisFunctionDoesNotExist()) {',
    replace: '        if (true) {',
    expectCells: [],
    negativeControl: true,
  },
];

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function countOf(hay, needle) {
  let n = 0;
  let i = hay.indexOf(needle);
  while (i >= 0) { n += 1; i = hay.indexOf(needle, i + 1); }
  return n;
}

function runSuite() {
  const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', SUITE], {
    encoding: 'utf8',
    cwd: REPO_ROOT,
    timeout: 300_000,
  });
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  const failed = [...out.matchAll(/^✖ (SC-C\d+)/gm)].map((m) => m[1]);
  const passCount = (out.match(/^✔ /gm) || []).length;
  return { status: r.status, failed: [...new Set(failed)], passCount, out };
}

const baseline = new Map(TARGETS.map((f) => [f, sha256(f)]));
const originals = new Map(TARGETS.map((f) => [f, fs.readFileSync(f, 'utf8')]));

console.log('MA-SCALECAP mutant run');
console.log(`targets:\n${TARGETS.map((f) => `  ${path.relative(REPO_ROOT, f)}  ${baseline.get(f).slice(0, 16)}`).join('\n')}`);

const clean = runSuite();
console.log(`\nbaseline (unmutated): status=${clean.status} pass=${clean.passCount} failed=[${clean.failed.join(', ')}]`);
if (clean.status !== 0) {
  console.error('FAIL: the suite is not green before mutation — aborting.');
  console.error(clean.out.slice(-3000));
  process.exit(1);
}

const rows = [];
let hardFail = 0;

for (const m of MUTANTS) {
  // Pre-flight: the needle must match exactly once in EVERY target.
  const counts = TARGETS.map((f) => countOf(originals.get(f), m.find));
  const applicable = counts.every((c) => c === 1);
  if (!applicable) {
    const detail = TARGETS.map((f, i) => `${path.basename(path.dirname(path.dirname(f)))}=${counts[i]}`).join(' ');
    console.log(`\n${m.id} NOT_APPLIED — needle match counts: ${detail} (expected 1 in each)`);
    rows.push({ id: m.id, what: m.what, result: 'NOT_APPLIED', killedBy: '—' });
    if (!m.negativeControl) {
      console.error(`FAIL: ${m.id} was NOT applied; its "pass" would be fabricated.`);
      hardFail += 1;
    } else {
      console.log(`${m.id} negative control behaved correctly (NOT_APPLIED).`);
    }
    continue;
  }
  if (m.negativeControl) {
    console.error(`FAIL: ${m.id} is the negative control but its needle MATCHED — the control is broken.`);
    hardFail += 1;
    rows.push({ id: m.id, what: m.what, result: 'CONTROL_BROKEN', killedBy: '—' });
    continue;
  }

  for (const f of TARGETS) fs.writeFileSync(f, originals.get(f).replace(m.find, m.replace));
  const res = runSuite();
  for (const f of TARGETS) fs.writeFileSync(f, originals.get(f));

  // Restore verification before believing anything about this mutant.
  const bad = TARGETS.filter((f) => sha256(f) !== baseline.get(f));
  if (bad.length) {
    console.error(`FAIL: restore mismatch after ${m.id}: ${bad.join(', ')}`);
    process.exit(1);
  }

  const killed = res.failed.length > 0;
  const named = res.failed.join(', ');
  const expectedHit = m.expectCells.some((c) => res.failed.includes(c));
  console.log(`\n${m.id} ${killed ? 'KILLED' : 'SURVIVED'} — ${m.what}`);
  console.log(`  failing cells: ${named || '(none)'}`);
  if (!killed) {
    console.error(`FAIL: ${m.id} survived — no behavioural cell covers it.`);
    hardFail += 1;
  } else if (!expectedHit) {
    console.error(`FAIL: ${m.id} was killed by ${named}, none of the expected ${m.expectCells.join('/')}.`);
    hardFail += 1;
  }
  rows.push({
    id: m.id,
    what: m.what,
    result: killed ? 'KILLED' : 'SURVIVED',
    killedBy: named || '—',
  });
}

for (const f of TARGETS) {
  if (sha256(f) !== baseline.get(f)) {
    console.error(`FAIL: final hash mismatch for ${f}`);
    process.exit(1);
  }
}

console.log('\n─── mutant table ───');
console.log('| mutant | result | killed by (named behavioural cell) | what it breaks |');
console.log('| --- | --- | --- | --- |');
for (const r of rows) console.log(`| ${r.id} | ${r.result} | ${r.killedBy} | ${r.what} |`);
console.log('\nall targets restored and SHA-256 verified against the pre-run hash:');
for (const f of TARGETS) console.log(`  ${path.relative(REPO_ROOT, f)}  ${sha256(f)}`);

if (hardFail) {
  console.error(`\nMUTANT RUN FAIL count=${hardFail}`);
  process.exit(1);
}
console.log('MUTANT RUN GREEN');
