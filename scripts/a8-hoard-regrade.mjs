/**
 * Re-grades a hoard-slope artifact through the CORRECTED grader and writes the result beside it.
 *
 * The first real run passed a stall gate it should have failed: the gate asked whether the playhead
 * moved between the drains, it had moved 2,870 bars, and the eight dead minutes in the middle were
 * invisible to it. The measurement itself is fine — the floors are floors — but the verdict attached
 * to it was graded by a gate that could not see the stall, so it is regraded rather than reinterpreted
 * by hand.
 */

import fs from 'fs';
import { gradeHoardSlope } from './a8-hoard-slope.mjs';

const file = process.argv[2];
if (!file) { console.error('usage: node a8-hoard-regrade.mjs <artifact.json>'); process.exit(2); }

const a = JSON.parse(fs.readFileSync(file, 'utf8'));
const legSamples = a.playLeg?.samples || [];
const regraded = gradeHoardSlope({ probeA: a.probes.A, probeB: a.probes.B, advance: a.playLeg?.advance, legSamples });

const out = {
  ...a,
  regradedAt: new Date().toISOString(),
  regradeReason: 'the original verdict was produced by a stall gate that checked endpoint advance only and passed a leg that was dead for its last eight minutes.',
  originalVerdict: a.verdict,
  originalResult: a.result,
  ...regraded,
};
const dest = file.replace(/\.json$/, '-REGRADED.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 2));

const r = regraded.result || {};
console.log(`verdict ${regraded.verdict}${regraded.caveat ? ' (with caveat)' : ''}`);
console.log(`  leg integrity: ${regraded.gates.legIntegrity.deliveringSamples}/${regraded.gates.legIntegrity.samples} samples delivering (${(regraded.gates.legIntegrity.deliveringFraction * 100).toFixed(1)}%), stalled=${regraded.gates.legIntegrity.stalledMidLeg}`);
console.log(`  hoard ${r.hoardA_MB} -> ${r.hoardB_MB} MB (+${r.deltaHoardMB}) over ${r.hoursBetweenFloors} h`);
console.log(`  per wall hour      ${r.hoardSlopeMBPerHour} MB/h  ${regraded.caveat ? '(LOWER BOUND — stall in leg)' : ''}`);
console.log(`  per resident kbar  ${r.hoardMBPerThousandResidentBars} MB/kbar  (bars ${r.residentBarsAtFloorA} -> ${r.residentBarsAtFloorB})`);
console.log(`  froth ${r.frothPercentA}% -> ${r.frothPercentB}%   retained share: ${r.retainedPercentOfRunningClimb ?? 'suppressed'}`);
console.log(`  -> ${dest}`);
