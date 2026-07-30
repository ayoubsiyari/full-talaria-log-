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
    trends,
    verdict,
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
  const dec = Object.entries(out.trends).filter(([, t]) => !t.advisory);
  console.log(`[regrade] ${inPath}: n=${out.sampleCount} span=${out.spanHours}h satisfiesDur01=${out.satisfiesDur01}`);
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
