#!/usr/bin/env node
/**
 * CONF01-DURATION-REGRADE-V1 — re-grade a completed duration run from its samples.
 *
 * The grading rules are pure arithmetic over samples that are already on disk, so
 * a defect in the rules costs a re-parse rather than another two hours of wall
 * clock. This exists because my first grader broke DUR-01 while implementing it
 * (it called RED at a 25-minute span) and the run it mis-graded was still in
 * flight; re-running would have been the expensive way to fix a division.
 *
 * It never re-measures, and it never edits the input. The output states which
 * grader version produced it so two verdicts over the same samples cannot be
 * confused for two runs.
 */

import fs from 'node:fs';
import { buildTrends, assessConf02, DUR01_MIN_SPAN_HOURS } from './conf01-duration-gate.mjs';
import { gradeDurationSeries, DURATION_TREND_SIGNATURE } from './lib/duration-trend.mjs';

export function regradeDurationRun(report, { closedTarget = 30, minSpanHours = DUR01_MIN_SPAN_HOURS } = {}) {
  const samples = report?.samples || [];
  if (!samples.length) throw new Error('no samples in run report');
  const trends = buildTrends(samples, { minSpanHours });
  const verdict = gradeDurationSeries(trends, { minSpanHours });
  const spanHours = +(samples[samples.length - 1].hours - samples[0].hours).toFixed(3);

  // STRATIFICATION, and it is a correction for a known product defect rather than
  // a convenience. Peer panels stop closing bars once their resident window is
  // exhausted (W93), so a sample taken mid-stall reads a different machine: with
  // four panels advancing this run reads ~1,950 MB footprint and ~134% renderer,
  // and while stalled ~1,060 MB and ~30%. Fitting both together measures the
  // stall pattern, not the trend. The advancing stratum is the CONF-01
  // configuration as specified, so it carries the verdict; the mixed fit is
  // reported beside it and the stalled count is stated, never dropped silently.
  const atLeast = (k) => samples.filter((s) => (s.state?.advancingPanels ?? 0) >= k);
  const advancing = atLeast(4);
  const stalled = samples.length - advancing.length;
  // Four advancing panels is the specified configuration and is preferred. If the
  // defect leaves too few such samples to fit, a three-panel stratum is still a
  // homogeneous population and is better than a fit across stalls — but it is a
  // WEAKER basis and the report says which one carried the verdict.
  const fit = (rows) => (rows.length >= 4 ? buildTrends(rows, { minSpanHours }) : null);
  const advancingTrends = fit(advancing);
  const threeTrends = advancingTrends ? null : fit(atLeast(3));
  const usedTrends = advancingTrends || threeTrends;
  const advancingVerdict = usedTrends ? gradeDurationSeries(usedTrends, { minSpanHours }) : null;
  return {
    signature: 'CONF01-DURATION-REGRADE-V1',
    graderSignature: DURATION_TREND_SIGNATURE,
    regradedAtIso: new Date().toISOString(),
    source: {
      signature: report.signature,
      startedAtIso: report.startedAtIso,
      plannedHours: report.plannedHours,
      priorVerdict: report.verdict?.status ?? null,
      priorReason: report.verdict?.reason ?? null,
    },
    sampleCount: samples.length,
    spanHours,
    minSpanHours,
    // A verdict from a span shorter than the ruling requires is not an acceptance,
    // whichever direction it points.
    satisfiesDur01: spanHours >= minSpanHours,
    conf01: report.conf01?.compliant ?? null,
    conf02: assessConf02(samples, { closedTarget }),
    strata: {
      allSamples: samples.length,
      fullyAdvancing: advancing.length,
      atLeastThreeAdvancing: atLeast(3).length,
      stalledOrPartial: stalled,
      advancingSpanHours: advancing.length
        ? +(advancing[advancing.length - 1].hours - advancing[0].hours).toFixed(3)
        : 0,
      note: 'peer panels exhaust their resident replay window (W93 product defect); samples taken mid-stall measure a different machine',
    },
    trends,
    verdictAllSamples: verdict,
    trendsFullyAdvancing: usedTrends,
    verdictFullyAdvancing: advancingVerdict,
    // The stratum that matches the specified configuration decides, when it has
    // enough samples to fit at all.
    verdict: advancingVerdict || verdict,
    verdictBasis: advancingTrends
      ? 'fullyAdvancing(4/4)'
      : (threeTrends ? 'atLeastThreeAdvancing(>=3/4, weaker basis)' : 'allSamples(mixed with stalls)'),
  };
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('conf01-duration-regrade.mjs')) {
  const inPath = process.argv[2];
  const outPath = process.argv[3] || null;
  if (!inPath) {
    console.error('usage: node scripts/conf01-duration-regrade.mjs <run.json> [out.json]');
    process.exit(2);
  }
  const report = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const out = regradeDurationRun(report);
  if (outPath) fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
  const graded = out.trendsFullyAdvancing || out.trends;
  const dec = Object.entries(graded).filter(([, t]) => !t.advisory);
  console.log(`[regrade] ${inPath}: n=${out.sampleCount} span=${out.spanHours}h satisfiesDur01=${out.satisfiesDur01}`);
  console.log(`[regrade] strata: ${out.strata.fullyAdvancing} fully advancing over ${out.strata.advancingSpanHours}h, ${out.strata.stalledOrPartial} stalled/partial; verdict from ${out.verdictBasis}`);
  console.log(`[regrade] ${out.source.priorVerdict} -> ${out.verdict.status}: ${out.verdict.reason}`);
  for (const [key, t] of dec) {
    const unit = t.xUnit && t.xUnit !== 'hour' ? `/${t.xUnit}` : '/h';
    const provisional = t.durationOk === false ? ' PROVISIONAL' : '';
    console.log(`  ${key.padEnd(32)} ${String(t.verdict).padEnd(14)} ${t.perHour ?? '-'}${unit} CI[${t.slopeCi95?.join(', ') ?? '-'}] band=${t.flatBandPerHour ?? '-'} n=${t.n}${provisional}`);
  }
  for (const [key, t] of Object.entries(out.trends).filter(([, t]) => t.advisory)) {
    console.log(`  (advisory) ${key.padEnd(21)} ${String(t.verdict).padEnd(14)} ${t.perHour ?? '-'}/h — expected to climb under CONF-02`);
  }
  console.log(`[regrade] CONF-02: ${out.conf02?.acceptanceWeight}`);
}
