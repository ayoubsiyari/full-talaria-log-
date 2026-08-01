#!/usr/bin/env node
/**
 * PROC-3 axis 4 applied to my own new code: "the gate goes RED on known-defective input. A gate that passes
 * with the fix reverted is vacuous."
 *
 * A green self-test is not evidence until it has been shown to go red. This reverts each guard in turn - as
 * a real edit to the real file, not a simulated one - re-runs the self-test, and requires it to FAIL. Then
 * it restores the file and confirms green again.
 *
 * The mutants are the two defects I actually shipped and caught: a guard that never stops, and a slope field
 * carrying the level.
 */
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const TARGET = 'scripts/lib/soak-gauges.mjs';
const original = fs.readFileSync(TARGET, 'utf8');

const MUTANTS = [
  {
    name: 'M1 — the gauge guard never stops the run (the defect: ten hours of nulls that read as completed)',
    apply: (s) => s.replace('const stop = next.footprint >= 2 || next.blocking >= 2;', 'const stop = false;'),
    mustFail: ['two consecutive footprint failures', 'two consecutive blocking failures'],
  },
  {
    name: 'M2 — the slope field carries the LEVEL (the defect I shipped: 196 published under the unit of 24)',
    apply: (s) => s.replace('if (dB >= 200) slope = +(((footprintTotalMB - prevSample.mb) / dB) * 1000).toFixed(2);', 'if (dB >= 200) slope = level;'),
    mustFail: ['the slope field is a SLOPE'],
  },
  {
    name: 'M3 — a slope is published over any bar delta, however trivial',
    apply: (s) => s.replace('if (dB >= 200)', 'if (dB >= 0)'),
    mustFail: ['a slope over a trivial bar delta'],
  },
];

const runSelfTest = () => {
  const r = spawnSync(process.execPath, ['scripts/sealed-soak-selftest.mjs'], { encoding: 'utf8', timeout: 180000 });
  const out = String(r.stdout || '') + String(r.stderr || '');
  const failed = out.split('\n').filter((l) => l.startsWith('FAIL'));
  return { out, failed };
};

const report = { signature: 'SOAK-GAUGE-MUTANTS-V1', at: new Date().toISOString(), bfcacheState: 'not applicable — pure-function mutation testing, no browser.', mutants: [] };
let allGood = true;

try {
  const base = runSelfTest();
  console.log(`baseline: ${base.failed.length} failures (expect 0)`);
  if (base.failed.length !== 0) { allGood = false; console.log('  BASELINE NOT GREEN — aborting'); }

  for (const m of MUTANTS) {
    const mutated = m.apply(original);
    if (mutated === original) {
      console.log(`SKIP  ${m.name} — anchor did not match, mutation silently no-opped`);
      report.mutants.push({ name: m.name, applied: false, verdict: 'ANCHOR DID NOT MATCH — this mutant proves nothing' });
      allGood = false;
      continue;
    }
    fs.writeFileSync(TARGET, mutated);
    const res = runSelfTest();
    const caught = m.mustFail.filter((needle) => res.failed.some((l) => l.includes(needle)));
    const ok = caught.length === m.mustFail.length;
    if (!ok) allGood = false;
    console.log(`${ok ? 'CAUGHT' : 'MISSED'}  ${m.name}`);
    console.log(`        ${res.failed.length} failure(s); expected checks red: ${caught.length}/${m.mustFail.length}`);
    report.mutants.push({ name: m.name, applied: true, selfTestFailures: res.failed.length, expectedRed: m.mustFail, actuallyRed: caught, verdict: ok ? 'CAUGHT — the test is discriminating for this defect' : 'MISSED — the test is VACUOUS for this defect and must be strengthened' });
    fs.writeFileSync(TARGET, original);
  }
} finally {
  fs.writeFileSync(TARGET, original);
}

const restored = runSelfTest();
report.restoredGreen = restored.failed.length === 0;
console.log(`\nrestored: ${restored.failed.length} failures (expect 0)`);
if (!report.restoredGreen) allGood = false;

report.verdict = allGood
  ? `DISCRIMINATING: all ${MUTANTS.length} mutants were caught, and the file is restored green. The gauge tests fail when the guards are removed, so a green is evidence rather than decoration.`
  : 'NOT FULLY DISCRIMINATING — at least one mutant survived or the file did not restore. Details per mutant.';
fs.writeFileSync('c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\SOAK-GAUGE-MUTANTS-20260801.json', JSON.stringify(report, null, 1));
console.log(`\n${report.verdict}`);
process.exit(allGood ? 0 : 1);
