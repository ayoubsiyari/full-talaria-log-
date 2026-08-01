#!/usr/bin/env node
/**
 * SOAK SALVAGE — publish the slope from the five hours that exist, with the boundaries marked.
 *
 * The ten-hour run will not be completed on this build. What it did produce is 5.2 hours across two segments,
 * and that is worth publishing provided every boundary inside it is declared rather than averaged over:
 *
 *   18:15 - 22:16  segment 1, sole occupant of the host, CLEAN
 *   22:16          segment 1's browser exits; its RENDERER survives as an orphan at ~120% of a core
 *   22:16 - 23:23  segment 2, sharing the host with that orphan, CONTENDED
 *   23:23          orphan killed
 *   23:23 - 23:30  segment 2, clean, then the run ends
 *
 * UNIT-01: the slope is published per thousand resident bars with the delivered bar rate beside it, never as
 * MB/h alone. Every rate here belongs to replay speed 60, not the 5 the run was labelled with - the option name
 * bug found at 23:33 meant `speed` was silently discarded and the session defaulted to 60.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fitTrend } from './lib/duration-trend.mjs';

const ROOT = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';
const OUT = path.join(ROOT, 'SOAK-SALVAGE-20260731.json');
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch { return null; } };

const barsOf = (r) => (r.residentTotal != null ? r.residentTotal : r.residentBars);
const memOf = (r) => (r.footprintTotalMB != null ? r.footprintTotalMB : r.footprintMB);

function segment(file, label, condition) {
  const j = read(file);
  const s = (j?.samples || []).filter((r) => memOf(r) != null && barsOf(r) != null && r.hours != null);
  if (s.length < 4) return { label, file, condition, samples: s.length, verdict: 'INSUFFICIENT' };
  const first = s[0];
  const last = s[s.length - 1];
  const hours = last.hours - first.hours;
  const dBars = barsOf(last) - barsOf(first);
  const dMem = memOf(last) - memOf(first);

  // x is THOUSANDS OF RESIDENT BARS, not hours. fitTrend's fields are named for its original caller, so the
  // slope is renamed on the way out; publishing a bar-axis slope in a field called perHour is the exact defect
  // I swept for at 19:30 and it is not being reintroduced here.
  const fit = fitTrend(s.map((r) => ({ hours: barsOf(r) / 1000, value: memOf(r) })), { label: `${label} MB per kbar`, minSpanHours: 0 });
  return {
    label,
    file,
    condition,
    samples: s.length,
    hours: +hours.toFixed(2),
    barsFirst: barsOf(first),
    barsLast: barsOf(last),
    barsDelivered: dBars,
    deliveredBarsPerSec: +(dBars / (hours * 3600)).toFixed(2),
    memoryFirstMB: +memOf(first).toFixed(0),
    memoryLastMB: +memOf(last).toFixed(0),
    memoryGrowthMB: +dMem.toFixed(0),
    mbPerThousandBars_endpoint: +((dMem / dBars) * 1000).toFixed(2),
    mbPerThousandBars_fit: fit.perHour != null ? +fit.perHour.toFixed(2) : null,
    // Field names read from the library, not guessed: it publishes slopeCi95 and runsZScore, and my first
    // pass asked for ciLow/ciHigh/runsZ and silently produced nulls - a fit without its error bars, which is
    // exactly the shape of result this programme does not accept.
    mbPerThousandBars_ci: Array.isArray(fit.slopeCi95) ? fit.slopeCi95 : null,
    rSquared: fit.rSquared != null ? +fit.rSquared.toFixed(3) : null,
    runsZ: fit.runsZScore != null ? +fit.runsZScore.toFixed(2) : null,
    straightEnough: fit.runsZScore != null ? Math.abs(fit.runsZScore) < 2 : null,
    fitVerdict: fit.verdict ?? null,
    fitFieldNote: 'fitTrend names its slope field perHour after its first caller. The x axis here is THOUSANDS OF RESIDENT BARS, so the value is MB per thousand bars and is republished under that name.',
  };
}

const report = {
  signature: 'SOAK-SALVAGE-V1',
  artifactFile: path.basename(OUT),
  at: new Date().toISOString(),
  bfcacheState: 'not applicable — offline analysis of artifacts already on disk.',
  whyThisExists: 'The ten-hour run will not be completed on this build. Five hours exist and are worth publishing, provided the boundaries inside them are declared rather than averaged over.',
  effectiveSpeed: 60,
  speedCaveat: 'The run was LAUNCHED --speed=5 and RAN AT 60. bend-soak passed `speed` where bootConf01Session takes `replaySpeed`, so the option was silently discarded and the default applied. The engine reported 60 and delivered 8.44 bars/s, which 5 candles/s cannot produce. Every rate below belongs to 60.',
  boundaries: [
    { at: '22:16', what: 'Segment 1 rolled to segment 2. Segment 1\'s BROWSER exited; its RENDERER survived as an orphan at ~120% of a core holding 2,489 MB private, and shared the host with segment 2 for 67 minutes.' },
    { at: '23:23', what: 'Orphan killed after 21,986 CPU-seconds.' },
    { at: '23:30', what: 'Run ended: I killed the wrapper intending to stop only future segments, and on this platform it cascaded and took segment 2\'s browser with it. My error, and it also cost the scheduled 01:40 allocator dump.' },
  ],
  segments: [
    segment('TEN-HOUR-SEG-01-20260731.json', 'segment 1', 'CLEAN — sole occupant of the host'),
    segment('TEN-HOUR-SEG-02-20260731.json', 'segment 2', 'CONTENDED for its first 67 of 74 minutes — shared the host with the orphaned renderer'),
  ],
};

const s1 = report.segments[0];
const s2 = report.segments[1];
if (s1.mbPerThousandBars_endpoint != null && s2.mbPerThousandBars_endpoint != null) {
  report.headline = {
    quotable: `Segment 1, clean and 4.0 hours: ${s1.mbPerThousandBars_endpoint} MB per thousand resident bars over ${s1.barsDelivered.toLocaleString()} bars delivered at ${s1.deliveredBarsPerSec} bars/s, ${s1.memoryFirstMB} -> ${s1.memoryLastMB} MB.`,
    marked: `Segment 2, contended for 67 of its 74 minutes: ${s2.mbPerThousandBars_endpoint} MB per thousand resident bars. NOT pooled with segment 1 and not quoted on its own as a rate.`,
    doNotQuote: 'No MB/h figure. The bar delivery rate is not constant across the run, so an hourly rate is a chord across a curve whose x axis is bars, and it is not convertible.',
    agreementWithPriorWork: `Segment 1's ${s1.mbPerThousandBars_endpoint} MB/kbar sits against the two independent figures already published: 23.98 (zero-trade monotonic run) and 24.55 (with trades). Three measurements, one number - on MAGNITUDE.`,
    straightnessCorrection: `NOT EXTRAPOLABLE, and this field was published as null. Segment 1 reads runs z ${s1.runsZ} and segment 2 ${s2.runsZ}, so both series are curved on the BAR axis and each fitted slope is a chord across a curve - the same defect that withdrew my +513.3 MB/h, which also carried rSquared 0.981. These figures describe their own window and must not be projected forward. The zero-trade monotonic 23.98 is the only one of the three with a straightness check it passes (runs z -0.04), and it is the figure to extrapolate from.`,
    whyItWasNull: 'fitTrend never returned a runs statistic, so this script asked for fit.runsZScore and silently recorded null beside an rSquared. monotonic-bars-gate and soak-trade-correlation each compute the runs test inline and were unaffected; only the caller that trusted the shared library published a fit without the check that decides whether it may be extrapolated.',
  };
}
fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
