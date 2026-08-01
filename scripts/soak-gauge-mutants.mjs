#!/usr/bin/env node
/**
 * PROC-3 axis 4 applied to my own code: "the gate goes RED on known-defective input. A gate that passes
 * with the fix reverted is vacuous."
 *
 * A green self-test is not evidence until it has been shown to go red. This reverts each guard and each
 * BINDING in turn - as a real edit to the real file, not a simulated one - re-runs the self-test, and
 * requires it to FAIL. Then it restores every file and confirms green again.
 *
 * The mutants are defects I actually shipped: a guard that never stops, a slope field carrying the level,
 * a module that is present and imported by nobody, and a cap flag that is built and then dropped.
 */
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const SOAK = 'scripts/sealed-two-arm-soak.mjs';
const GAUGES = 'scripts/lib/soak-gauges.mjs';
const DETACH = 'scripts/lib/detach01.mjs';

const MUTANTS = [
  {
    name: 'M1 — the gauge guard never stops the run (ten hours of nulls that read as completed)',
    target: GAUGES,
    apply: (s) => s.replace('const stop = next.footprint >= 2 || next.blocking >= 2;', 'const stop = false;'),
    mustFail: ['two consecutive footprint failures', 'two consecutive blocking failures'],
  },
  {
    name: 'M2 — the slope field carries the LEVEL (the defect I shipped: 196 under the unit of 24)',
    target: GAUGES,
    apply: (s) => s.replace('if (dB >= 200) slope = +(((footprintTotalMB - prevSample.mb) / dB) * 1000).toFixed(2);', 'if (dB >= 200) slope = level;'),
    mustFail: ['the slope field is a SLOPE'],
  },
  {
    name: 'M3 — a slope is published over any bar delta, however trivial',
    target: GAUGES,
    apply: (s) => s.replace('if (dB >= 200)', 'if (dB >= 0)'),
    mustFail: ['a slope over a trivial bar delta'],
  },
  {
    // The exact defect the Director caught: the module present, 189 lines, imported by nobody.
    name: 'M4 — TOOL-01 present but UNBOUND: heap-cap.mjs exists and the soak never calls it',
    target: SOAK,
    apply: (s) => s.replace(
      'const heapCap = assertHeapCap({ capMB: HEAP_CAP_MB, label: `sealed-soak-${ARM}` });',
      'const heapCap = { ok: true, limitMB: null, capMB: HEAP_CAP_MB, label: `sealed-soak-${ARM}` }; // UNBOUND'),
    mustFail: ['TOOL-01 is BOUND'],
  },
  {
    name: 'M5 — PASSPORT-3 present but UNENFORCING: the SHA is read and the refusal never fires',
    target: SOAK,
    apply: (s) => s.replace('if (REQUIRE_SHA || EXPECT_SHA) {', 'if (false) { // UNENFORCING'),
    mustFail: ['PASSPORT-3 is BOUND'],
  },
  {
    name: 'M6 — the cap flag is constructed and then dropped before the detached child is launched',
    target: DETACH,
    apply: (s) => s.replace("const capFlag = heapCapMB ? `--max-old-space-size=${heapCapMB} ` : '';", "const capFlag = ''; // DROPPED"),
    mustFail: ['TOOL-01 reaches the DETACHED child'],
  },
];

const originals = new Map();
for (const f of [SOAK, GAUGES, DETACH]) originals.set(f, fs.readFileSync(f, 'utf8'));
const restoreAll = () => { for (const [f, s] of originals) fs.writeFileSync(f, s); };

const runSelfTest = () => {
  const r = spawnSync(process.execPath, ['scripts/sealed-soak-selftest.mjs'], { encoding: 'utf8', timeout: 300000 });
  const out = String(r.stdout || '') + String(r.stderr || '');
  return { out, failed: out.split('\n').filter((l) => l.startsWith('FAIL')) };
};

const report = { signature: 'SOAK-GAUGE-MUTANTS-V2', at: new Date().toISOString(), bfcacheState: 'not applicable — mutation testing, no browser.', mutants: [] };
let allGood = true;

try {
  const base = runSelfTest();
  console.log(`baseline: ${base.failed.length} failures (expect 0)`);
  if (base.failed.length !== 0) { allGood = false; console.log('  BASELINE NOT GREEN — aborting'); base.failed.forEach((f) => console.log('   ' + f)); }

  for (const m of MUTANTS) {
    const original = originals.get(m.target);
    const mutated = m.apply(original);
    if (mutated === original) {
      console.log(`SKIP    ${m.name}\n        anchor did not match in ${m.target} — mutation silently no-opped`);
      report.mutants.push({ name: m.name, target: m.target, applied: false, verdict: 'ANCHOR DID NOT MATCH — this mutant proves nothing' });
      allGood = false;
      continue;
    }
    fs.writeFileSync(m.target, mutated);
    const res = runSelfTest();
    const caught = m.mustFail.filter((needle) => res.failed.some((l) => l.includes(needle)));
    const ok = caught.length === m.mustFail.length;
    if (!ok) allGood = false;
    console.log(`${ok ? 'CAUGHT' : 'MISSED'}  ${m.name}`);
    console.log(`        ${m.target}: ${res.failed.length} failure(s); expected red ${caught.length}/${m.mustFail.length}`);
    report.mutants.push({
      name: m.name, target: m.target, applied: true, selfTestFailures: res.failed.length,
      expectedRed: m.mustFail, actuallyRed: caught,
      verdict: ok ? 'CAUGHT — the test is discriminating for this defect' : 'MISSED — the test is VACUOUS for this defect and must be strengthened',
    });
    restoreAll();
  }
} finally {
  restoreAll();
}

const restored = runSelfTest();
report.restoredGreen = restored.failed.length === 0;
console.log(`\nrestored: ${restored.failed.length} failures (expect 0)`);
if (!report.restoredGreen) allGood = false;

report.verdict = allGood
  ? `DISCRIMINATING: all ${MUTANTS.length} mutants caught, every file restored, self-test green. Three cover the gauge guards; three cover BINDING - present-but-uncalled, present-but-unenforcing, and a flag built then dropped.`
  : 'NOT FULLY DISCRIMINATING — a mutant survived or a file did not restore. Details per mutant.';
fs.writeFileSync('c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\SOAK-GAUGE-MUTANTS-20260801.json', JSON.stringify(report, null, 1));
console.log(`\n${report.verdict}`);
process.exit(allGood ? 0 : 1);
