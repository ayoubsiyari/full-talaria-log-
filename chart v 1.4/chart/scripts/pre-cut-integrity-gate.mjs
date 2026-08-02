#!/usr/bin/env node
/**
 * PRE-CUT INTEGRITY GATE, command line form.
 *
 * Exit 0  the mirrors are intact and the cut may proceed.
 * Exit 1  BLOCKED. Something is truncated, unparseable or missing, and the cut must not happen.
 * Exit 2  the gate itself could not run, which is also a block - a gate that cannot run has not passed.
 *
 * Run standalone, or imported by the cut path so that it stops the cut rather than printing at it.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { checkMirrors } from './lib/mirror-integrity.mjs';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const argOf = (n, d) => { const p = process.argv.find((a) => a.startsWith(`--${n}=`)); return p ? p.split('=').slice(1).join('=') : d; };
// Default to the repo root when this lives in the chart tree, so a bare run still sees both mirrors.
const DEFAULT_REPO = fs.existsSync(path.resolve(here, '../../../homepage/public/chart')) ? path.resolve(here, '../../..') : path.resolve(here, '..');
const REPO = path.resolve(argOf('repo', DEFAULT_REPO));
const EV = argOf('evidence', 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C');
const QUIET = process.argv.includes('--quiet');

let report;
try {
  report = checkMirrors({ repoRoot: REPO, log: (m) => { if (!QUIET) console.log(`  ${m}`); } });
} catch (err) {
  console.error('PRE-CUT GATE COULD NOT RUN — treating as a block, because a gate that did not run has not passed.');
  console.error(`  ${String(err && err.stack ? err.stack : err).slice(0, 400)}`);
  process.exit(2);
}

const out = {
  signature: 'PRE-CUT-INTEGRITY-GATE-V1',
  at: new Date().toISOString(),
  bfcacheState: 'not applicable — static file inspection, no browser.',
  repoRoot: REPO,
  blocked: report.blocked,
  reasons: report.reasons,
  summary: report.summary,
  whyThisExists: 'Truncation hit two worktrees in one day and was caught by hand both times. Shipping it is the failure we cannot survive: a ten-hour arm against corrupt bytes reads as a product verdict, not a fault.',
  whyParityIsNotEnough: 'The existing layout assert compares the mirrors byte-for-byte but runs after build:live:chart, which syncs canonical onto homepage. A truncated canonical is copied over the good mirror and the two agree. Parity is relative; truncation is absolute.',
  checks: report.checks,
};
try {
  fs.mkdirSync(EV, { recursive: true });
  fs.writeFileSync(path.join(EV, 'PRE-CUT-INTEGRITY-GATE.json'), JSON.stringify(out, null, 1));
} catch { /* evidence is nice to have; the exit code is the contract */ }

const s = report.summary;
if (!QUIET) {
  console.log(`\n  ${s.totalFilesChecked} files checked across ${Object.values(s.mirrors).filter((m) => m.present).length} mirrors, baseline from ${s.baselineSource}`);
  console.log(`  parse failures ${s.parseFailures}   truncated-against-committed ${s.truncatedAgainstCommitted}   empty ${s.emptyFiles}`);
  console.log(`  mirror parity: ${s.parity.divergentFiles} of ${s.parity.comparedPairs} pairs differ (reported, not blocking)`);
}

if (report.blocked) {
  console.error(`\nCUT BLOCKED — ${report.reasons.length} reason(s):`);
  for (const r of report.reasons.slice(0, 20)) console.error(`  - ${r}`);
  if (report.reasons.length > 20) console.error(`  ... and ${report.reasons.length - 20} more`);
  console.error('\nThe tree is not fit to cut. Restore the affected files before building.\n');
  process.exit(1);
}
if (!QUIET) console.log('\nPRE-CUT GATE PASSED — mirrors parse and none has lost material size against its committed state.\n');
process.exit(0);
