#!/usr/bin/env node
/**
 * SR-02 mutant battery for RESIZE-01.
 *
 * This is what binds the harness to the shipped bytes. Each mutant is applied
 * ON DISK to BOTH mirrors, and must be killed by a NAMED behavioural cell. If a
 * mutant's needle is not found the runner reports NOT_APPLIED loudly and fails,
 * rather than letting a stale needle produce a vacuous pass. Files are restored
 * afterwards and verified by SHA-256 against the pre-mutation digest.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { runResizeSuite } from './sr02-resize-harness.mjs';

const ROOT = process.argv[2]
  || path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');

const MIRRORS = [
  path.join(ROOT, 'chart v 1.4', 'chart', 'chart.js'),
  path.join(ROOT, 'homepage', 'public', 'chart', 'chart.js'),
];

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase();

const MUTANTS = [
  {
    id: 'M1-DROP-PANEL-RESIZE-REGISTRATION',
    rationale: 'Removing the new panel registration must reproduce the original defect.',
    needle: "            window.addEventListener('resize', this._handlePanelViewportRefresh);",
    replacement: '            /* mutant M1: registration removed */',
    mustKill: ['RESIZE-PANEL-LISTENER-REGISTERED', 'RESIZE-PANEL-BACKING-STORE-REFLOWS'],
  },
  {
    id: 'M2-SWITCH-STRICT-EQUALS-TRUE',
    rationale: 'A `=== true` comparison is the defect class already found in shipped '
      + 'switches here: truthy values like 1 or \'yes\' would stop disabling the fix.',
    needle: '                        && window.__TALARIA_DISABLE_PANEL_VIEWPORT_RESIZE_V1) return;',
    replacement: '                        && window.__TALARIA_DISABLE_PANEL_VIEWPORT_RESIZE_V1 === true) return;',
    mustKill: ['KILLSWITCH-TRUTHY-DISABLES'],
  },
  {
    id: 'M3-DEFEAT-RESIZE-EARLY-RETURN',
    rationale: 'If Chart.resize() stops early-returning on a no-op, a synthetic '
      + 'same-size resize would appear to do work and every resize GREEN becomes meaningless.',
    needle: '        if (!sizeChanged && !dprChanged && !bufMismatch) {',
    replacement: '        if (false && !sizeChanged && !dprChanged && !bufMismatch) {',
    mustKill: ['RESIZE-NOOP-MEASURES-NOTHING'],
  },
  {
    id: 'M4-MOVE-REGISTRATION-UNDER-HOST-ARM',
    rationale: 'Flipping the guard to the host arm leaves the code present but '
      + 'unreachable for panels — the exact shape of the original defect.',
    needle: '        if (this.isPanel && !this._handlePanelViewportRefresh) {',
    replacement: '        if (!this.isPanel && !this._handlePanelViewportRefresh) {',
    mustKill: ['RESIZE-PANEL-LISTENER-REGISTERED', 'RESIZE-PANEL-BACKING-STORE-REFLOWS'],
  },
  {
    id: 'M5-HOIST-SWITCH-READ-OUT-OF-HANDLER',
    rationale: 'Removing the per-call switch read makes the flag unflippable '
      + 'mid-session, which FLAG-02 forbids.',
    needle: `                try {
                    if (typeof window !== 'undefined'
                        && window.__TALARIA_DISABLE_PANEL_VIEWPORT_RESIZE_V1) return;
                } catch (_) { /* ignore */ }`,
    replacement: '                /* mutant M5: per-call switch read removed */',
    mustKill: ['KILLSWITCH-TRUTHY-DISABLES', 'FLAG02-MIDSESSION-FLIP-NO-RELOAD'],
  },
];

// POSITIVE CONTROL for the NOT_APPLIED path. A safety net that has never been
// shown to fire is not a safety net. With SR02_MUTANT_STALE_CONTROL=1 a mutant
// with a deliberately absent needle is appended; the run MUST report it as
// NOT_APPLIED and fail. Never set this in a real run.
if (process.env.SR02_MUTANT_STALE_CONTROL === '1') {
  MUTANTS.push({
    id: 'M0-STALE-NEEDLE-CONTROL',
    rationale: 'Deliberately absent needle: proves NOT_APPLIED detection fires.',
    needle: 'this_text_is_deliberately_absent_from_chart_js_SR02_CONTROL',
    replacement: '/* unreachable */',
    mustKill: ['RESIZE-PANEL-LISTENER-REGISTERED'],
  });
}

// ── baseline ──
const baseline = {};
for (const m of MIRRORS) {
  if (!fs.existsSync(m)) {
    console.log(`FATAL: mirror missing: ${m}`);
    process.exit(3);
  }
  baseline[m] = { text: fs.readFileSync(m, 'utf8'), sha: sha(m) };
}
const mirrorsIdenticalBefore = baseline[MIRRORS[0]].sha === baseline[MIRRORS[1]].sha;

const pre = runResizeSuite(MIRRORS[0]);
if (pre.status !== 'GREEN') {
  console.log('FATAL: suite is not GREEN before mutation; mutant results would be meaningless.');
  console.log(JSON.stringify(pre.cells.filter((c) => c.status !== 'GREEN'), null, 2));
  process.exit(3);
}

const results = [];
let hardFail = false;

for (const mut of MUTANTS) {
  // NOT_APPLIED detection: the needle must exist in EVERY mirror.
  const presence = MIRRORS.map((m) => ({ mirror: m, found: baseline[m].text.includes(mut.needle) }));
  const missing = presence.filter((p) => !p.found);
  if (missing.length) {
    hardFail = true;
    results.push({
      id: mut.id,
      applied: 'NOT_APPLIED',
      status: 'FAIL',
      reason: 'STALE NEEDLE — the text this mutant edits is not present, so it '
        + 'proved nothing. Fix the needle before trusting any GREEN.',
      missingIn: missing.map((p) => p.mirror),
    });
    continue;
  }

  // apply to BOTH mirrors on disk
  const occurrences = {};
  for (const m of MIRRORS) {
    const text = baseline[m].text;
    occurrences[m] = text.split(mut.needle).length - 1;
    fs.writeFileSync(m, text.replace(mut.needle, mut.replacement));
  }
  const mutatedShas = MIRRORS.map((m) => sha(m));
  const mutatedIdentical = mutatedShas[0] === mutatedShas[1];

  const report = runResizeSuite(MIRRORS[0]);
  const byCell = Object.fromEntries(report.cells.map((c) => [c.cell, c.status]));
  const killed = mut.mustKill.filter((c) => byCell[c] === 'RED');
  const survived = mut.mustKill.filter((c) => byCell[c] !== 'RED');

  // restore + blob-verify
  for (const m of MIRRORS) fs.writeFileSync(m, baseline[m].text);
  const restoredOk = MIRRORS.every((m) => sha(m) === baseline[m].sha);
  if (!restoredOk) hardFail = true;

  const ok = survived.length === 0 && report.status === 'RED';
  if (!ok) hardFail = true;

  results.push({
    id: mut.id,
    rationale: mut.rationale,
    applied: 'APPLIED',
    occurrencesPerMirror: Object.fromEntries(Object.entries(occurrences).map(([k, v]) => [path.basename(path.dirname(k)), v])),
    mutatedMirrorsIdentical: mutatedIdentical,
    suiteStatusUnderMutant: report.status,
    killedBy: killed,
    survivedCells: survived,
    restoredAndBlobVerified: restoredOk,
    status: ok ? 'KILLED' : 'SURVIVED',
  });
}

const finalShas = MIRRORS.map((m) => sha(m));
const post = runResizeSuite(MIRRORS[0]);

const out = {
  signature: 'TALARIA_SR02_MUTANTS_V1',
  mirrors: MIRRORS,
  mirrorsIdenticalBefore,
  baselineSha: baseline[MIRRORS[0]].sha,
  finalShas,
  mirrorsIdenticalAfter: finalShas[0] === finalShas[1],
  allRestored: MIRRORS.every((m) => sha(m) === baseline[m].sha),
  suiteGreenBefore: pre.status,
  suiteGreenAfterRestore: post.status,
  mutants: results,
  status: (!hardFail && post.status === 'GREEN') ? 'ALL_KILLED' : 'FAIL',
};

console.log(JSON.stringify(out, null, 2));
const notApplied = results.filter((r) => r.applied === 'NOT_APPLIED');
if (notApplied.length) {
  console.log(`\n*** NOT_APPLIED: ${notApplied.length} mutant(s) had a stale needle — ${notApplied.map((r) => r.id).join(', ')} ***`);
}
const survivors = results.filter((r) => r.status === 'SURVIVED');
if (survivors.length) console.log(`\n*** SURVIVING MUTANTS: ${survivors.map((r) => r.id).join(', ')} ***`);

if (process.argv[3]) fs.writeFileSync(process.argv[3], `${JSON.stringify({ ...out, measuredAt: new Date().toISOString() }, null, 2)}\n`);
process.exit(out.status === 'ALL_KILLED' ? 0 : 1);
