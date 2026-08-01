#!/usr/bin/env node
/**
 * SAMPLING INNOCENCE CHECK — is the observer manufacturing the leak?
 *
 * The control asked for is: run one arm at a much lower sampling frequency; identical slope means the
 * instrument is innocent, a lower slope means part of the leak is us.
 *
 * Before spending an arm on it, this asks whether the experiment has ALREADY been run by accident. Different
 * gates of mine sample at different cadences against the same mechanism, and if their per-bar slopes agree
 * across a wide cadence ratio, that IS the control - retrospectively, and for free.
 *
 * It also computes the two things that decide whether the hypothesis is even coherent:
 *   - growth per SAMPLE (if the instrument is the cause, cost lands per sample, not per bar)
 *   - growth per BAR (if the product is the cause, cost lands per bar regardless of sampling)
 * An instrument-caused leak must scale with samples taken. A product leak must scale with bars delivered.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';
const OUT = path.join(ROOT, 'SAMPLING-INNOCENCE-20260731.json');

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch { return null; } };

/** Both artifact shapes: monotonic uses minutes/residentTotal, the soak uses hours/residentBars. */
const elapsedMin = (r) => (r.minutes != null ? r.minutes : (r.hours != null ? r.hours * 60 : null));
const barsOf = (r) => (r.residentTotal != null ? r.residentTotal : (r.residentBars != null ? r.residentBars : null));
const memOf = (r) => (r.footprintTotalMB != null ? r.footprintTotalMB : (r.footprintMB != null ? r.footprintMB : null));

function arm(file, label) {
  const j = readJson(file);
  if (!j) return { label, file, missing: true };
  const s = (j.samples || []).filter((r) => memOf(r) != null && barsOf(r) != null && elapsedMin(r) != null);
  if (s.length < 4) return { label, file, tooFewSamples: s.length };
  const first = s[0];
  const last = s[s.length - 1];
  const spanMin = elapsedMin(last) - elapsedMin(first);
  const dBars = barsOf(last) - barsOf(first);
  const dMem = memOf(last) - memOf(first);
  const intervals = [];
  for (let i = 1; i < s.length; i += 1) intervals.push((elapsedMin(s[i]) - elapsedMin(s[i - 1])) * 60);
  intervals.sort((a, b) => a - b);
  return {
    label,
    file,
    samples: s.length,
    spanMinutes: +spanMin.toFixed(1),
    medianSampleIntervalSec: +intervals[Math.floor(intervals.length / 2)].toFixed(1),
    barsDelivered: dBars,
    memoryGrowthMB: +dMem.toFixed(1),
    mbPerThousandBars: dBars > 0 ? +((dMem / dBars) * 1000).toFixed(2) : null,
    // If the harness were the cause, THIS is the number that would be constant across arms, not the per-bar one.
    mbPerSample: +(dMem / s.length).toFixed(2),
    barsPerSample: dBars > 0 ? +(dBars / s.length).toFixed(0) : null,
  };
}

const arms = [
  arm('MONOTONIC-BARS-GATE-20260731.json', 'monotonic bars gate (zero trades)'),
  arm('TEN-HOUR-SEG-01-20260731.json', 'ten-hour soak arm 1 (governed trades)'),
].filter((a) => !a.missing && !a.tooFewSamples);

const report = {
  signature: 'SAMPLING-INNOCENCE-V1',
  artifactFile: path.basename(OUT),
  at: new Date().toISOString(),
  bfcacheState: 'not applicable - offline analysis of artifacts already on disk, no browser involved',
  question: 'Is the harness manufacturing retained memory by pinning objects it samples?',
  handleAudit: {
    evaluateHandleCallSites: 0,
    runtimeQueryObjectsCallSites: 0,
    rawRuntimeEvaluateCallSites: 0,
    networkDomainEnabled: false,
    consoleListeners: 0,
    pageEvaluateCallSites: 214,
    reading: 'The named mechanism is absent by construction. puppeteer `page.evaluate` returns BY VALUE and releases its remote object; handles are only retained by `evaluateHandle`, `Runtime.queryObjects` or a raw `Runtime.evaluate` left unreleased, and my harness contains none of the three. `Network.enable` is never called, so no response bodies are buffered, and there are no console listeners, so puppeteer holds no ConsoleMessage JSHandles. The only `Runtime.enable` sits inside a release routine that immediately discards console entries and releases the console object group. Caveat: `Debugger.enable` IS used by baseline-census (which pins parsed scripts) but NOT by the soak.',
  },
  arms,
};

if (arms.length >= 2) {
  const ratio = Math.max(...arms.map((a) => a.medianSampleIntervalSec)) / Math.min(...arms.map((a) => a.medianSampleIntervalSec));
  const slopes = arms.map((a) => a.mbPerThousandBars).filter((x) => x != null);
  const spread = slopes.length >= 2 ? (Math.max(...slopes) - Math.min(...slopes)) / Math.min(...slopes) : null;
  const perSample = arms.map((a) => a.mbPerSample);
  const perSampleSpread = (Math.max(...perSample) - Math.min(...perSample)) / Math.min(...perSample);
  // THE DISCRIMINATING RATIO IS BARS PER SAMPLE, NOT CADENCE. Two arms can differ 2.6x in seconds between
  // samples and still take a sample every ~900 bars, because bar delivery rate differs too. When bars-per-
  // sample is the same, "MB per bar" and "MB per sample" are the same number wearing two labels and the
  // contrast cannot tell the product from the observer. Grading on the cadence ratio would have declared a
  // degenerate comparison an exoneration.
  const bps = arms.map((a) => a.barsPerSample).filter((x) => x != null);
  const bpsRatio = bps.length >= 2 ? Math.max(...bps) / Math.min(...bps) : null;
  const separable = bpsRatio != null && bpsRatio >= 3;
  report.retrospectiveControl = {
    samplingIntervalRatio: +ratio.toFixed(2),
    barsPerSampleByArm: Object.fromEntries(arms.map((a) => [a.label, a.barsPerSample])),
    barsPerSampleRatio: bpsRatio != null ? +bpsRatio.toFixed(2) : null,
    mbPerThousandBarsByArm: Object.fromEntries(arms.map((a) => [a.label, a.mbPerThousandBars])),
    perBarSlopeSpreadPercent: spread != null ? +(spread * 100).toFixed(1) : null,
    mbPerSampleByArm: Object.fromEntries(arms.map((a) => [a.label, a.mbPerSample])),
    perSampleSpreadPercent: +(perSampleSpread * 100).toFixed(1),
    separable,
    verdict: separable
      ? `USABLE CONTRAST: bars per sample differ ${bpsRatio.toFixed(1)}x, so per-bar and per-sample are distinguishable, and the per-bar slope holds to ${(spread * 100).toFixed(1)}%.`
      : `NOT A CONTROL, AND I NEARLY PUBLISHED IT AS ONE. The two arms differ ${ratio.toFixed(1)}x in sampling CADENCE but only ${bpsRatio?.toFixed(2)}x in BARS PER SAMPLE (${bps.join(' vs ')}), because the slower-sampling arm also delivered bars faster. With bars-per-sample effectively constant, "MB per thousand bars" and "MB per sample" are the same quantity relabelled - they agree to ${(spread * 100).toFixed(1)}% and ${(perSampleSpread * 100).toFixed(1)}% respectively, which is arithmetic, not evidence. This comparison CANNOT distinguish a product leak from an observer leak, and the purpose-built arm is genuinely required.`,
  };
  report.stillRequired = {
    design: `Two arms on the SAME configuration and the SAME replay speed, so bar delivery rate is held constant and only cadence moves: one at ${arms[0].medianSampleIntervalSec.toFixed(0)}s and one at ${(arms[0].medianSampleIntervalSec * 10).toFixed(0)}s. That gives a 10x separation in BARS PER SAMPLE, which is the ratio that actually discriminates - the thing the retrospective pair failed to provide.`,
    acceptance: 'MB per thousand bars inside the CI of the normal-cadence arm. A LOWER slope at the lower cadence means part of the growth is mine, and every memory number in the programme takes a caveat.',
    when: 'Once the host is free after arm 1 (~04:15). It cannot run concurrently - a second CONF-01 session on this host contends for CPU and would change the bar rate, reintroducing the exact confound above.',
  };
}

fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
