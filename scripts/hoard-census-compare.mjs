/**
 * Compare two HOARD-CENSUS arms that differ in ONE variable: the indicator pair.
 *
 * `vwap` is in WHOLE_HISTORY_INDICATOR_TYPES, so E's CONF-05 pair stands both residency trims down. The
 * rolling arm (ema + rsi) leaves them armed. If the drained floors match, price retention is not what the
 * trims were going to recover and the hoard is elsewhere; if they diverge, the earlier numbers were taken
 * with price eviction off and have to be re-read.
 *
 * The comparison is only meaningful if the trims could actually have FIRED in the rolling arm, so the
 * gating thresholds are printed beside the floors rather than assumed.
 */

import fs from 'fs';

const load = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const A = load(process.argv[2] || '_evidence/manager-C/hoard-census-run3.json');
const B = load(process.argv[3] || '_evidence/manager-C/hoard-census-rolling.json');

const fp = (a, k) => a.moments?.[k]?.footprint?.footprintTotalMB ?? null;
const arm = (a) => (a.condition?.indicatorPairs ? a.condition.indicatorPairs.map((p) => p[0]).join('+') : (a.condition?.indicatorArm ?? 'conf05 (pre-field)'));

console.log('arm        indicators     M1 playing   M2 paused+GC   M3 single+GC');
for (const [n, a] of [['conf05', A], ['rolling', B]]) {
  console.log(n.padEnd(11) + arm(a).padEnd(15) + String(fp(a, 'm1_playing')).padStart(10) + String(fp(a, 'm2_paused_collected')).padStart(14) + String(fp(a, 'm3_single_collected')).padStart(15));
}
const d = (k) => (fp(B, k) != null && fp(A, k) != null ? (fp(B, k) - fp(A, k)).toFixed(1) : 'n/a');
console.log(`\ndelta (rolling - conf05):  M1 ${d('m1_playing')}   M2 ${d('m2_paused_collected')}   M3 ${d('m3_single_collected')} MB`);

for (const [n, a] of [['rolling', B], ['conf05', A]]) {
  console.log(`\n--- eviction state at M1, ${n} arm ---`);
  for (const r of a.moments?.m1_playing?.census?.realms || []) {
    const c = r.context || {};
    console.log(`  ${String(r.realm).padEnd(7)} tf=${String(c.tf).padEnd(4)} types=${JSON.stringify(c.activeIndicatorTypes ?? 'not recorded')}`
      + ` wholeHistoryIndicator=${c.hasWholeHistoryIndicator ?? 'not recorded'}`
      + ` sessionStart=${c.sessionStartIndex ?? 'not recorded'}`
      + ` preSessionEvicted=${c.preSessionEvictedBars ?? 'not recorded'}`
      + ` evict03CanFire=${c.evict03CanFire ?? 'n/a'}`
      + ` preSessionTrimCanFire=${c.preSessionTrimCanFire ?? 'n/a'}`
      + ` resident=${c.residentBars} playhead=${c.playheadIndex}`);
  }
}

// The whole point: did the trims have a chance to act?
const rr = (B.moments?.m1_playing?.census?.realms || []).map((r) => r.context || {});
const anyPreSessionCould = rr.some((c) => c.preSessionTrimCanFire === true);
const anyEvict03Could = rr.some((c) => c.evict03CanFire === true);
const anyWhole = rr.some((c) => c.hasWholeHistoryIndicator === true);
console.log('\nVERDICT');
console.log(`  rolling arm still reports a whole-history indicator: ${anyWhole}`);
console.log(`  pre-session trim could fire in any realm (sessionStart > 1000): ${anyPreSessionCould}`);
console.log(`  EVICT-03 could fire in any realm (playhead >= 7048):            ${anyEvict03Could}`);
if (!anyPreSessionCould && !anyEvict03Could) {
  console.log('  => NEITHER TRIM COULD FIRE REGARDLESS OF INDICATORS. The two arms are the same condition');
  console.log('     under two labels, so this pair CANNOT separate price retention from indicator retention.');
} else {
  console.log('  => at least one trim was armed in the rolling arm, so the floor delta above is interpretable.');
}
