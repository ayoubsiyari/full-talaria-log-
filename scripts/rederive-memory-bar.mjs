#!/usr/bin/env node
/**
 * Re-derive the 1,024 MB bar at the true 10 bars/s envelope.
 *
 * The bar was set against a workload we now know was mis-characterised: our own soak recorded 1.74 bars/s
 * at a nominal 60 while the PO hand-measured 10.4 bars/s at 10x and 62.4 at 60x. A budget calibrated
 * against a session delivering a sixth of the real rate is a budget for a sixth of the real workload.
 *
 * Every coefficient below is measured and published, and the extrapolation rule is the one I imposed on
 * myself: ONLY the zero-trade monotonic slope may be projected forward. Its runs z is -0.04, genuinely
 * straight. The with-trades (24.55) and salvage (25.35) slopes agree in magnitude but run z -4.85, which
 * is the exact signature of the +513.3 MB/h chord I withdrew - they are chords across a curve and
 * projecting them would repeat the error.
 */
import fs from 'node:fs';
import path from 'node:path';

const EV = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';

const M = {
  baselineFootprintMB: 1122.1,          // CONF-01 first paint, b116; re-measured post-fix at 1,159.7 post-GC
  baselineResidentBars: 7321,           // R-1: 82.1% of them sit BEFORE session start
  mbPerThousandBars: 23.98,             // zero-trade monotonic, CI [22.75, 25.21], r2 0.981, runs z -0.04
  mbPerThousandBarsCI: [22.75, 25.21],
  poRateAt10x: 10.4,                    // PO hand-measured
  poRateAt60x: 62.4,
  soakRateObserved: 4.82,               // salvage segment 1, nominal 60
  soakRateWorstWindow: 1.74,            // 12-minute window at nominal 60
  currentBarMB: 1024,
};

const hours = 10;
const project = (barsPerSec, coef) => {
  const delivered = barsPerSec * hours * 3600;
  const growthMB = (delivered / 1000) * coef;
  return { barsPerSec, deliveredBars: Math.round(delivered), growthMB: +growthMB.toFixed(0), totalMB: +(M.baselineFootprintMB + growthMB).toFixed(0) };
};

const envelopes = [
  { label: 'the envelope the bar was set against (our soak, worst window)', rate: M.soakRateWorstWindow },
  { label: 'the envelope our soak actually delivered', rate: M.soakRateObserved },
  { label: 'THE TRUE ENVELOPE (PO hand-measured at 10x)', rate: M.poRateAt10x },
  { label: 'the 60x envelope (PO hand-measured)', rate: M.poRateAt60x },
].map((e) => ({ ...e, ...project(e.rate, M.mbPerThousandBars) }));

// How long a 1,024 MB budget survives at each envelope, measured as GROWTH above baseline - the kindest
// possible reading of the bar, since the baseline ALREADY exceeds it outright.
const timeToBreach = envelopes.map((e) => {
  const barsToBreach = (M.currentBarMB / M.mbPerThousandBars) * 1000;
  const sec = barsToBreach / e.rate;
  return { envelope: e.label, rate: e.rate, minutesToBreach: +(sec / 60).toFixed(1), barsToBreach: Math.round(barsToBreach) };
});

const baselineAlreadyOver = M.baselineFootprintMB > M.currentBarMB;

const report = {
  signature: 'MEMORY-BAR-REDERIVATION-V1',
  at: new Date().toISOString(),
  bfcacheState: 'not applicable — arithmetic over published coefficients, no browser.',
  inputs: M,
  extrapolationRule: 'ONLY the zero-trade monotonic 23.98 MB/kbar (runs z -0.04) is projected. The 24.55 and 25.35 slopes agree in magnitude but run z -4.85 — chords across a curve, and projecting them would repeat the +513.3 MB/h error I withdrew.',
  projectionsOverTenHours: envelopes,
  timeToBreachTheCurrentBar: timeToBreach,

  headline: baselineAlreadyOver
    ? `The 1,024 MB bar is breached at FIRST PAINT. CONF-01 opens at ${M.baselineFootprintMB} MB before a single bar is replayed, so at any envelope the bar is already lost at t=0.`
    : 'The baseline fits inside the bar.',

  atTheTrueEnvelope: {
    rateBarsPerSec: M.poRateAt10x,
    tenHourTotalMB: envelopes[2].totalMB,
    tenHourTotalGB: +(envelopes[2].totalMB / 1024).toFixed(2),
    overTheBarBy: `${(envelopes[2].totalMB / M.currentBarMB).toFixed(1)}x`,
    growthBudgetLastsMinutes: timeToBreach[2].minutesToBreach,
    reading: `At 10.4 bars/s a ten-hour session projects to ${envelopes[2].totalMB} MB. Even read generously — as a budget for GROWTH above baseline rather than a total — 1,024 MB is spent in ${timeToBreach[2].minutesToBreach} minutes, not ten hours.`,
  },

  whyTheOldBarLookedReachable: `The bar was calibrated on sessions delivering ${M.soakRateObserved} bars/s and, in the worst window, ${M.soakRateWorstWindow}. At ${M.soakRateWorstWindow} bars/s a ten-hour run delivers only ${project(M.soakRateWorstWindow, M.mbPerThousandBars).deliveredBars.toLocaleString()} bars and projects ${project(M.soakRateWorstWindow, M.mbPerThousandBars).totalMB} MB. The bar was not wrong about that workload. That workload was not the product.`,

  theCouplingNOBODYSHOULDMISS: {
    problem: 'Memory-per-wall-hour is GAMEABLE by degrading. A build whose delivery collapses allocates less, so it can pass a memory bar precisely BECAUSE it stopped working — and RATE-HOLD is now the headline verdict for exactly that failure.',
    consequence: 'A megabytes-per-hour bar and a RATE-HOLD verdict can be satisfied by opposite behaviours. The two must not be read independently.',
    fix: 'Judge memory per THOUSAND DELIVERED BARS, never per hour. That unit is already the one UNIT-01 forced on me and is why two MB/h headlines were withdrawn. A build cannot game it by slowing down, because the denominator slows with it.',
  },

  proposedShape: {
    verdict: 'THE NUMBER CANNOT BE SET TONIGHT, AND I WILL NOT INVENT IT.',
    why: 'The Director has moved memory onto the post-drain HOARD floor. Every megabyte figure I have published is a RUNNING total, so each contains an unknown froth fraction. Until the first pause-probe returns a measured froth fraction, converting any running figure into a hoard bar means multiplying by a number nobody has measured.',
    formula: 'hoardBarMB = (running projection at the true envelope) x (1 - measuredFrothFraction), with the froth fraction taken from the arm-end pause-probe and stated beside it.',
    whatUnblocksIt: 'The first pause-probe of the first sealed arm. One reading converts this from a formula into a number.',
    interimRecommendation: 'Judge the arms on RATE-HOLD, and report hoard floor as a measured quantity WITHOUT a pass/fail bar for one night. A bar invented tonight would be calibrated on froth, which is the exact error being corrected.',
  },
};

fs.writeFileSync(path.join(EV, 'MEMORY-BAR-REDERIVATION.json'), JSON.stringify(report, null, 1));

console.log(`\nRE-DERIVING THE 1,024 MB BAR AT THE TRUE ENVELOPE\n`);
console.log(`  ${report.headline}\n`);
console.log('  Ten-hour projections at 23.98 MB per thousand resident bars (the only extrapolable slope):');
for (const e of envelopes) {
  console.log(`    ${String(e.rate).padStart(5)} bars/s  ->  ${String(e.deliveredBars.toLocaleString()).padStart(9)} bars  ${String(e.totalMB.toLocaleString()).padStart(7)} MB   ${e.label}`);
}
console.log('\n  A 1,024 MB GROWTH budget (the kindest reading) is spent in:');
for (const t of timeToBreach) console.log(`    ${String(t.rate).padStart(5)} bars/s  ->  ${String(t.minutesToBreach).padStart(7)} min   ${t.envelope}`);
console.log(`\n  ${report.atTheTrueEnvelope.reading}`);
console.log(`\n  COUPLING: ${report.theCouplingNOBODYSHOULDMISS.problem}`);
console.log(`  FIX: ${report.theCouplingNOBODYSHOULDMISS.fix}`);
console.log(`\n  ${report.proposedShape.verdict}`);
console.log(`  ${report.proposedShape.why}`);
console.log(`  Unblocked by: ${report.proposedShape.whatUnblocksIt}\n`);
