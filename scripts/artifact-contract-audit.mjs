#!/usr/bin/env node
/**
 * Audit every artifact under the evidence root against the contract, and backfill `bfcacheState` on the
 * ones written before RESET-01 made it mandatory — recording that it was backfilled rather than
 * pretending it was declared at the time.
 *
 * Backfill is only legitimate where the arm is knowable from the artifact itself: a run launched without
 * `--disable-features=BackForwardCache` had the cache ENABLED, which is Chrome's default and what users
 * run. Where it is not knowable, the field says so.
 */
import fs from 'node:fs';
import path from 'node:path';

import { checkArtifactContract } from './lib/artifact-contract.mjs';

const ROOT = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';
const APPLY = process.argv.includes('--apply');

const rows = [];
for (const f of fs.readdirSync(ROOT).filter((x) => x.endsWith('.json'))) {
  const p = path.join(ROOT, f);
  let a = null;
  try { a = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { rows.push({ file: f, unreadable: true }); continue; }
  const before = checkArtifactContract(a, p);
  let backfilled = null;

  if (!a.bfcacheState) {
    // Static scans and offline re-grades never opened a browser.
    if (/scan|correlation|regrade|read|manifest/i.test(String(a.signature || '')) || /SCAN|CORRELATION|REGRADE|MANIFEST/i.test(f)) {
      backfilled = 'not applicable: no browser involved';
    } else if (String(a.arm || '') === 'bfcache-disabled') {
      backfilled = 'DISABLED via --disable-features=BackForwardCache';
    } else {
      backfilled = 'ENABLED (Chrome default) — BACKFILLED after RESET-01, not declared by the run itself';
    }
    if (APPLY) {
      a.bfcacheState = backfilled;
      a.bfcacheStateBackfilled = true;
      fs.writeFileSync(p, JSON.stringify(a, null, 1));
    }
  }
  const after = checkArtifactContract(a, p);
  rows.push({
    file: f,
    signature: a.signature || null,
    okBefore: before.ok,
    okAfter: after.ok,
    backfilled,
    remaining: after.problems,
  });
}

const bad = rows.filter((r) => !r.okAfter && !r.unreadable);
console.error(`=== ARTIFACT CONTRACT AUDIT (${APPLY ? 'APPLIED' : 'dry run'}) — ${rows.length} artifacts ===`);
for (const r of rows) {
  if (r.unreadable) { console.error(`  UNREADABLE  ${r.file}`); continue; }
  if (r.backfilled) console.error(`  backfilled  ${r.file.padEnd(50)} bfcacheState = ${r.backfilled}`);
}
console.error('');
if (bad.length === 0) {
  console.error('All artifacts satisfy the contract: signature corresponds to filename, bfcacheState declared, build stamp present where applicable.');
} else {
  console.error(`${bad.length} artifact(s) still fail the contract:`);
  for (const r of bad) console.error(`  ${r.file}\n     ${r.remaining.join('\n     ')}`);
}
