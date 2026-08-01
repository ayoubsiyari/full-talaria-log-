#!/usr/bin/env node
/**
 * RELIEF-01 would-fire analysis — a post-hoc query over data the soak already collects.
 *
 * Costs no machine time: the sealed soak samples cross-frame footprint every three minutes and records it
 * per sample, so this is arithmetic over an artifact, run after the fact.
 *
 * THE DIRECTOR'S CORRECTION, and it is the whole design:
 *
 *   Firing at 85% of budget INSTANTANEOUSLY contradicts "zero firings" as the pass condition. 85% of
 *   1,024 MB is 870 MB, and a build that exactly meets the bar crosses 870 at hour 8.5 - so zero firings
 *   would demand a 45% cut against the 32% that passes. Fire on PROJECTED BREACH instead: a build tracking
 *   to 1,020 MB never projects a breach and never fires; a build tracking to 1,500 MB fires in the first
 *   hour or two, which is when relief is cheap.
 *
 * THE CONSEQUENCE I HAVE TO HANDLE, because I have already withdrawn two headlines for it:
 *
 *   Growth in TIME is concave. My +513.3 MB/h had rSquared 0.981 and runs z -6.57, and a quadratic bought
 *   76% more - it was a CHORD ACROSS A CURVE. The bar rate decays (delivered bars/sec fell 20.6 -> 9.19
 *   within one run), so a whole-run linear fit systematically OVER-projects, and over-projection in a
 *   pressure valve means firing on builds that would have passed. Projecting a would-fire decision off a
 *   chord would repeat, inside a gate, the exact error I retracted a headline for.
 *
 *   So the firing statistic is the SETTLED TRAILING SLOPE, not the run chord: fit the last window of
 *   samples and project the REMAINING hours from where the run currently stands. On a concave series the
 *   trailing slope is the honest forward estimate; on a straight one the two agree, and the artifact
 *   reports both so the difference is visible rather than assumed.
 *
 *   Growth per RESIDENT BAR is straight on the ZERO-TRADE monotonic run (r2 0.981, runs z -0.04) but NOT
 *   universally: both salvaged soak segments read runs z -4.85 and -3.04 on the bar axis once trades and
 *   contention are present, so the bar axis is straighter than time, not automatically straight. Where a
 *   per-bar route is also computed, because that is the axis the physics lives on. Where it does not - B6
 *   carries a ROLLING window that falls and a fullRawBars pinned at 9,999 - it is reported as unavailable
 *   rather than silently projected off a window count.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fitTrend } from './lib/duration-trend.mjs';

const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const IN = argOf('in', '');
const BUDGET_MB = Number(argOf('budgetMB', '1024'));
const HORIZON_H = Number(argOf('horizonHours', '10'));
const TRAIL_H = Number(argOf('trailingHours', '0.75'));  // window for the settled slope
const MIN_SAMPLES = Number(argOf('minSamples', '10'));   // warm-up guard
// Two trailing windows, because stability cannot be established from one. Setting this below 2x
// trailingHours leaves the stability guard with no prior window and it silently permits every fire.
const MIN_HOURS = Number(argOf('minHours', String(2 * TRAIL_H)));
const CONSECUTIVE = Number(argOf('consecutive', '2'));   // hysteresis: k samples in a row
const STABILITY = Number(argOf('stability', '0.85'));    // trailing slope must retain this fraction window-on-window
const OVERWHELM = Number(argOf('overwhelmMultiple', '4'));// projection this far past budget fires regardless of stability
// A build sitting ON its bar is inside measurement noise of it, and must not be failed by a coin flip.
const MARGIN = Number(argOf('margin', '1.05'));
const EV = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';

if (!IN) { console.error('usage: relief01-would-fire.mjs --in=<soak artifact .jsonl or .json> [--budgetMB=1024] [--horizonHours=10]'); process.exit(2); }

/**
 * Two schemas exist and they disagree on every field name that matters. Reading one and hoping is how
 * `fit.ciLow` and `svc.closedTrades` produced silent nulls, so both are named and the one that answered is
 * recorded in the artifact.
 */
function loadSeries(file) {
  const raw = fs.readFileSync(file, 'utf8');
  let rows = [];
  let schema = null;
  if (file.endsWith('.jsonl')) {
    const lines = raw.trim().split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    rows = lines.filter((r) => r.n != null && !r.__meta && !r.__final && !r.__segmentBoundary && !r.__void && !r.__warning)
      .map((r) => ({ hours: r.hours, mb: r.footprintTotalMB, bars: r.residentBars, closed: r.closedTrades, segment: r.segment ?? 1 }));
    schema = 'SEALED-TWO-ARM-SOAK (footprintTotalMB / residentBars)';
  } else {
    const j = JSON.parse(raw);
    const arr = j.samples || j.buckets || j.series || [];
    rows = arr.map((s) => ({
      hours: s.hours,
      mb: s.footprintTotalMB ?? s.footprint?.footprintTotalMB ?? s.footprint?.totalPrivateMB ?? null,
      // NOT state.totalBars: that is a ROLLING WINDOW in this schema and it falls during the run.
      bars: s.residentBars ?? s.state?.residentBars ?? null,
      closed: s.closedTrades ?? s.trades?.managerClosed ?? s.trades?.serviceClosed ?? null,
      segment: s.segment ?? 1,
    }));
    schema = 'bend-soak / B6 (footprint.totalPrivateMB; no cumulative bar axis)';
  }
  return { rows: rows.filter((r) => Number.isFinite(r.hours) && Number.isFinite(r.mb)), schema };
}

const { rows, schema } = loadSeries(IN);
if (rows.length < 4) { console.error(`Only ${rows.length} usable samples in ${IN}. A would-fire query needs a series.`); process.exit(2); }

// Growth is measured from the run's own first sample: the budget is on GROWTH over the horizon, which is
// what makes "exactly meets the bar" mean 1,024 MB at hour 10 and 870 MB at hour 8.5.
const baseline = rows[0].mb;
const g = rows.map((r) => ({ ...r, growth: +(r.mb - baseline).toFixed(1) }));

// fitTrend consumes {hours, value}. Passing {x, y} returns perHour undefined and every downstream
// projection becomes null - and the first version of this file then printed "WOULD NOT FIRE" off those
// nulls for a build that grew 2,154 MB in 3.78 h. A valve that cannot compute must VOID, never pass.
const slopeOver = (subset) => {
  if (subset.length < 4) return null;
  const f = fitTrend(subset.map((r) => ({ hours: r.hours, value: r.growth })), { label: 'growth', minSpanHours: 0 });
  if (f.perHour == null) return null;
  return {
    perHour: f.perHour, ci: f.slopeCi95 ?? null, rSquared: f.rSquared ?? null,
    runsZ: f.runsZScore ?? null, quadGain: f.quadraticGain ?? null, extrapolable: f.extrapolable ?? null,
    n: subset.length,
  };
};

const evaluations = [];
let consecutive = 0;
let firedAt = null;

for (let i = 0; i < g.length; i += 1) {
  const so_far = g.slice(0, i + 1);
  const now = g[i];
  const trailing = so_far.filter((r) => r.hours >= now.hours - TRAIL_H);

  const chord = slopeOver(so_far);           // the whole-run fit — reported, NOT used to fire
  const settled = slopeOver(trailing.length >= 4 ? trailing : so_far);

  const remaining = Math.max(0, HORIZON_H - now.hours);
  const projected = settled ? +(now.growth + settled.perHour * remaining).toFixed(0) : null;
  const projectedChord = chord ? +(chord.perHour * HORIZON_H).toFixed(0) : null;
  // Fire only when the LOWER confidence bound also breaches, so noise in one window cannot fire the valve.
  const projectedLow = settled?.ci ? +(now.growth + settled.ci[0] * remaining).toFixed(0) : null;

  // SLOPE STABILITY. A linear forward projection off a slope that is ITSELF still decaying is an upper
  // bound, not an estimate: a concave build landing at 1,000 MB projects ~2,024 MB at hour 2 on its own
  // trailing slope. Firing there is a false alarm on a build that passes - the failure the Director's
  // correction is designed to avoid, reappearing one level down. So while the slope is still falling
  // materially window-on-window, HOLD and say so. The exception is a projection so far past budget that no
  // plausible continued decay rescues it; B6 projects 8x and should not wait for a settling curve.
  const prior = so_far.filter((r) => r.hours < now.hours - TRAIL_H && r.hours >= now.hours - 2 * TRAIL_H);
  const priorSlope = slopeOver(prior);
  const decayRatio = (priorSlope && settled && priorSlope.perHour > 0) ? +(settled.perHour / priorSlope.perHour).toFixed(3) : null;
  const slopeStable = decayRatio == null ? null : decayRatio >= STABILITY;

  const warmedUp = (i + 1) >= MIN_SAMPLES && now.hours >= MIN_HOURS;
  const breaches = projected != null && projected > BUDGET_MB * MARGIN;
  const confident = projectedLow != null && projectedLow > BUDGET_MB * MARGIN;
  const overwhelming = projected != null && projected >= OVERWHELM * BUDGET_MB;
  // "Cannot establish stability" is NOT stability. Treating null as trustworthy made the guard
  // inoperative at exactly the first sample that could fire, and a concave passing build fired at h=1.55.
  const trustworthy = slopeStable === true || overwhelming;
  const wouldFireNow = warmedUp && breaches && confident && trustworthy;
  const heldReason = (warmedUp && breaches && confident && !trustworthy)
    ? (slopeStable === false
      ? `HELD — trailing slope still decaying (retains ${decayRatio} of the prior window, below ${STABILITY}); a linear projection off a falling slope over-states, and this build does not breach by the ${OVERWHELM}x margin that would justify firing anyway`
      : 'HELD — stability not yet establishable (no prior trailing window)')
    : null;

  consecutive = wouldFireNow ? consecutive + 1 : 0;
  if (firedAt == null && consecutive >= CONSECUTIVE) firedAt = { ...now, projected, projectedLow, settledPerHour: settled.perHour, atSample: i + 1 };

  evaluations.push({
    sample: i + 1, hours: +now.hours.toFixed(3), growthMB: now.growth,
    settledSlopeMbPerHour: settled ? +settled.perHour.toFixed(1) : null,
    chordSlopeMbPerHour: chord ? +chord.perHour.toFixed(1) : null,
    projectedGrowthAtHorizonMB: projected,
    projectedLowerBoundMB: projectedLow,
    chordProjectionMB: projectedChord,
    decayRatio, slopeStable, overwhelming,
    warmedUp, breaches, confident, wouldFireNow, heldReason,
  });
}

const last = g[g.length - 1];
const finalSettled = slopeOver(g.filter((r) => r.hours >= last.hours - TRAIL_H));
const finalChord = slopeOver(g);

const report = {
  signature: 'RELIEF01-WOULD-FIRE-V1',
  at: new Date().toISOString(),
  bfcacheState: 'not applicable — post-hoc query over a recorded series, no browser.',
  input: path.basename(IN),
  schema,
  design: {
    rule: 'Fire when the SETTLED trailing slope projects growth past the budget at the horizon, confirmed on the lower confidence bound and sustained for consecutive samples.',
    whyNotInstantaneous: `An 85%-of-budget instantaneous trigger contradicts a zero-firings pass condition: 85% of ${BUDGET_MB} MB is ${Math.round(BUDGET_MB * 0.85)} MB, which a build that exactly meets the bar reaches at hour ${(HORIZON_H * 0.85).toFixed(1)} of ${HORIZON_H}. Every passing build would fire.`,
    whyNotTheChord: 'Growth in time is concave (my own +513.3 MB/h had runs z -6.57 and a quadratic bought 76% more; delivered bar rate fell 20.6 -> 9.19 within one run). A whole-run linear fit over-projects, and over-projection in a pressure valve fires on builds that pass. The chord is reported beside the settled slope so the gap is visible, never used to fire.',
    budgetMB: BUDGET_MB, horizonHours: HORIZON_H, trailingWindowHours: TRAIL_H,
    warmUpGuard: `no firing before ${MIN_SAMPLES} samples and ${MIN_HOURS} h`,
    hysteresis: `${CONSECUTIVE} consecutive breaching samples`,
    firesOn: 'projected growth AND its lower 95% bound both above budget',
  },
  series: { samples: g.length, spanHours: +last.hours.toFixed(2), baselineMB: baseline, finalGrowthMB: last.growth },
  finalSlopes: {
    settledMbPerHour: finalSettled ? +finalSettled.perHour.toFixed(1) : null,
    settledCi: finalSettled?.ci ?? null,
    chordMbPerHour: finalChord ? +finalChord.perHour.toFixed(1) : null,
    chordRSquared: finalChord?.rSquared ?? null,
    chordRunsZ: finalChord?.runsZ ?? null,
    chordQuadraticGain: finalChord?.quadGain ?? null,
    chordExtrapolable: finalChord?.extrapolable ?? null,
    concavityWarning: finalChord?.runsZ != null && Math.abs(finalChord.runsZ) >= 2
      ? `Runs z ${finalChord.runsZ}, quadratic buys ${finalChord.quadGain == null ? 'n/a' : `${(finalChord.quadGain * 100).toFixed(0)}%`} — the series is NOT straight in time, so the chord is a chord across a curve and the settled trailing slope is the defensible forward estimate. This is the FIT-01 condition that withdrew my +513.3 MB/h headline, which also read rSquared 0.981.`
      : null,
  },
  projectionAtEndOfRun: finalSettled ? +(last.growth + finalSettled.perHour * Math.max(0, HORIZON_H - last.hours)).toFixed(0) : null,
  wouldFire: firedAt != null,
  firedAt: firedAt ? {
    sample: firedAt.atSample, hours: +firedAt.hours.toFixed(2), growthAtFireMB: firedAt.growth,
    settledSlopeMbPerHour: +firedAt.settledPerHour.toFixed(1),
    projectedGrowthAtHorizonMB: firedAt.projected,
    projectedLowerBoundMB: firedAt.projectedLow,
    headroomUsedPercent: +((firedAt.growth / BUDGET_MB) * 100).toFixed(1),
  } : null,
  evaluations,
};

const proj = report.projectionAtEndOfRun;

// A no-fire is only meaningful if the projection was actually COMPUTED. If the slope is null the query
// has measured nothing, and "would not fire" would be a silent pass - the failure mode a pressure valve
// must never have. Voiding is the only honest output.
const computed = evaluations.filter((e) => e.projectedGrowthAtHorizonMB != null).length;
const judgeable = evaluations.filter((e) => e.warmedUp && e.projectedGrowthAtHorizonMB != null).length;
report.evaluableSamples = computed;
report.judgeableSamples = judgeable;
if (computed === 0 || proj == null) {
  report.wouldFire = null;
  report.verdict = `VOID — no projection could be computed on any of ${g.length} samples (settled slope null). This is NOT a pass. A would-fire query that cannot fit its own series has measured nothing, and reporting it as "would not fire" would make the valve fail open.`;
} else if (judgeable === 0) {
  // The series fits but never clears the warm-up guard. Silence here is absence of evidence, not evidence
  // of absence, and calling it "would not fire" is the same silent pass one level up.
  report.wouldFire = null;
  report.verdict = `VOID (INSUFFICIENT) — the series fits but no sample ever cleared the warm-up guard (${MIN_SAMPLES} samples and ${MIN_HOURS} h; this run reached ${g.length} samples and ${last.hours.toFixed(2)} h). The valve was never in a position to judge, which is not the same as judging it safe.`;
} else {
  report.verdict = firedAt
    ? `WOULD FIRE at hour ${firedAt.hours.toFixed(2)} (sample ${firedAt.atSample}), with only ${((firedAt.growth / BUDGET_MB) * 100).toFixed(0)}% of the ${BUDGET_MB} MB budget consumed — projecting ${firedAt.projected} MB at ${HORIZON_H} h, lower bound ${firedAt.projectedLow} MB. Relief is called while there is still headroom, which is the point of firing on the projection rather than the level.`
    : `WOULD NOT FIRE across ${g.length} samples and ${last.hours.toFixed(2)} h (${computed} evaluable). Settled slope projects ${proj} MB at ${HORIZON_H} h against a ${BUDGET_MB} MB budget${proj <= BUDGET_MB ? ' — tracking under the bar, so silence is the correct output' : ' — projection is ABOVE budget but the warm-up guard or the lower-bound condition was never satisfied, which is a different statement from tracking under the bar'}.`;
}

fs.mkdirSync(EV, { recursive: true });
const out = path.join(EV, `RELIEF01-WOULD-FIRE-${path.basename(IN).replace(/\.(jsonl|json)$/, '')}.json`);
fs.writeFileSync(out, JSON.stringify(report, null, 1));

console.log(`input:    ${report.input}`);
console.log(`schema:   ${schema}`);
console.log(`samples:  ${g.length} over ${last.hours.toFixed(2)} h; baseline ${baseline} MB, growth ${last.growth} MB`);
console.log(`settled:  ${report.finalSlopes.settledMbPerHour} MB/h   chord: ${report.finalSlopes.chordMbPerHour} MB/h   runs z ${report.finalSlopes.chordRunsZ}`);
if (report.finalSlopes.concavityWarning) console.log(`concave:  ${report.finalSlopes.concavityWarning.slice(0, 150)}`);
console.log(`projects: ${proj} MB at ${HORIZON_H} h against a ${BUDGET_MB} MB budget`);
console.log(`\n${report.verdict}`);
console.log(`\nartifact: ${out}`);
process.exitCode = 0;
