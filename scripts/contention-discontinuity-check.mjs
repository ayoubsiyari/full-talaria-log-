#!/usr/bin/env node
/**
 * CONTENTION DISCONTINUITY CHECK — did the series bend at the segment boundary?
 *
 * At 22:16 the ten-hour run rolled from segment 1 to segment 2. Segment 1's BROWSER process exited but its
 * renderer did not: pid 30588 survived as an orphan, still executing at ~120% of a core and holding 2,488 MB
 * private. From 22:16 onward segment 2 has therefore been sharing the host with a second heavy chart session
 * that nothing was measuring.
 *
 * The question this answers is not "is contention bad" - it obviously is - but whether it BENT THE SERIES, and
 * which samples must carry a mark. Two axes:
 *   throughput  bars delivered per minute at a matched resident-bar count. Contention steals CPU, so if the
 *               orphan matters, segment 2 delivers fewer bars per minute than segment 1 did at the same size.
 *   slope       MB per thousand bars. This is the published unit. If it is unchanged, the memory finding
 *               survives the contention even though the timing figures do not.
 * Matching on RESIDENT BARS rather than on elapsed time is the whole point: both quantities depend on how much
 * data is loaded, so comparing hour 1 of one segment with hour 1 of another would confound size with sharing.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';
const OUT = path.join(ROOT, 'CONTENTION-DISCONTINUITY-20260731.json');
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')); } catch { return null; } };

const elapsedMin = (r) => (r.minutes != null ? r.minutes : (r.hours != null ? r.hours * 60 : null));
const barsOf = (r) => (r.residentTotal != null ? r.residentTotal : (r.residentBars != null ? r.residentBars : null));
const memOf = (r) => (r.footprintTotalMB != null ? r.footprintTotalMB : (r.footprintMB != null ? r.footprintMB : null));

function series(file, label) {
  const j = read(file);
  const s = (j?.samples || []).filter((r) => memOf(r) != null && barsOf(r) != null && elapsedMin(r) != null);
  const pts = [];
  for (let i = 1; i < s.length; i += 1) {
    const dMin = elapsedMin(s[i]) - elapsedMin(s[i - 1]);
    const dBars = barsOf(s[i]) - barsOf(s[i - 1]);
    const dMem = memOf(s[i]) - memOf(s[i - 1]);
    if (dMin <= 0) continue;
    pts.push({
      atMin: +elapsedMin(s[i]).toFixed(1),
      bars: barsOf(s[i]),
      barsPerMin: +(dBars / dMin).toFixed(0),
      mbPerKbar: dBars > 0 ? +((dMem / dBars) * 1000).toFixed(2) : null,
      footprintMB: +memOf(s[i]).toFixed(0),
    });
  }
  return { label, file, samples: s.length, points: pts };
}

/** Average a metric over the points whose resident-bar count falls in [lo, hi). */
function inBand(points, lo, hi, key) {
  const v = points.filter((p) => p.bars >= lo && p.bars < hi && p[key] != null).map((p) => p[key]);
  if (!v.length) return null;
  return { n: v.length, mean: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) };
}

/**
 * Band slope from the ENDPOINTS of the band, not from the mean of per-interval ratios.
 *
 * The first version of this check averaged consecutive-sample MB/kbar values inside each band. That estimator
 * divides a small memory delta by a small bar delta once per sample, so a single sample where a collection
 * landed produces a wild ratio, and averaging wild ratios produced adjacent bands reading 3.1x and 0.34x -
 * opposite directions - which I then averaged into a single "155%" and nearly published as a bend. The
 * endpoint slope divides one large delta by one large delta and is stable.
 */
function bandSlope(points, lo, hi) {
  const inb = points.filter((p) => p.bars >= lo && p.bars < hi).sort((a, b) => a.bars - b.bars);
  if (inb.length < 3) return null;
  const a = inb[0];
  const b = inb[inb.length - 1];
  const dBars = b.bars - a.bars;
  if (dBars <= 0) return null;
  return { n: inb.length, mbPerKbar: +(((b.footprintMB - a.footprintMB) / dBars) * 1000).toFixed(2), barsSpanned: dBars };
}

const seg1 = series('TEN-HOUR-SEG-01-20260731.json', 'segment 1 (18:15-22:16, sole occupant)');
const seg2 = series('TEN-HOUR-SEG-02-20260731.json', 'segment 2 (from 22:16, sharing with the orphan)');

const report = {
  signature: 'CONTENTION-DISCONTINUITY-V1',
  artifactFile: path.basename(OUT),
  at: new Date().toISOString(),
  bfcacheState: 'not applicable - offline analysis of artifacts already on disk',
  whatHappened: 'At 22:16 the run rolled to segment 2. Segment 1\'s browser process exited but its renderer (pid 30588) did NOT, surviving as an orphan at ~120% of a core and 2,488 MB private. Segment 2 has shared the host with it ever since. The orphan is my own teardown defect, not a product behaviour.',
  seg1: { samples: seg1.samples },
  seg2: { samples: seg2.samples },
};

// Compare only where the two segments overlap in resident bars, in bands.
const bands = [[10_000, 20_000], [20_000, 30_000], [30_000, 45_000]];
report.matchedBands = bands.map(([lo, hi]) => ({
  residentBars: `${lo}-${hi}`,
  seg1BarsPerMin: inBand(seg1.points, lo, hi, 'barsPerMin'),
  seg2BarsPerMin: inBand(seg2.points, lo, hi, 'barsPerMin'),
  seg1MbPerKbar: bandSlope(seg1.points, lo, hi),
  seg2MbPerKbar: bandSlope(seg2.points, lo, hi),
})).filter((b) => b.seg1BarsPerMin && b.seg2BarsPerMin);

const thr = report.matchedBands.filter((b) => b.seg1BarsPerMin && b.seg2BarsPerMin);
if (thr.length) {
  const ratios = thr.map((b) => b.seg2BarsPerMin.mean / b.seg1BarsPerMin.mean);
  const meanRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  const slopeBands = thr.filter((b) => b.seg1MbPerKbar && b.seg2MbPerKbar);
  const slopeRatios = slopeBands.map((b) => b.seg2MbPerKbar.mbPerKbar / b.seg1MbPerKbar.mbPerKbar);
  const meanSlopeRatio = slopeRatios.length ? slopeRatios.reduce((a, b) => a + b, 0) / slopeRatios.length : null;
  // Bands that disagree in DIRECTION mean the estimator, not the system, is talking.
  const consistent = slopeRatios.length >= 2
    ? (slopeRatios.every((r) => r > 1.15) || slopeRatios.every((r) => r < 0.87) || slopeRatios.every((r) => r >= 0.87 && r <= 1.15))
    : null;
  report.verdict = {
    throughputRatioSeg2OverSeg1: +meanRatio.toFixed(3),
    throughputBent: Math.abs(1 - meanRatio) > 0.15,
    slopeRatioByBand: slopeRatios.map((r) => +r.toFixed(2)),
    slopeRatioSeg2OverSeg1: meanSlopeRatio != null ? +meanSlopeRatio.toFixed(3) : null,
    bandsAgreeInDirection: consistent,
    slopeBent: consistent === true && meanSlopeRatio != null ? Math.abs(1 - meanSlopeRatio) > 0.15 : null,
  };
  const thrText = Math.abs(1 - meanRatio) > 0.15
    ? 'THROUGHPUT BENT: every timing figure from segment 2 is contended and not comparable with segment 1 or with anything measured before 22:16.'
    : `Throughput did NOT bend materially (${(meanRatio * 100).toFixed(0)}% of segment 1 at matched size). The soak runs at 5 candles/s and is not delivery-bound, so stealing a core cost it little.`;
  const slopeText = consistent === false
    ? `THE SLOPE COMPARISON IS INCONCLUSIVE AND MUST NOT BE QUOTED: the bands disagree in direction (${slopeRatios.map((r) => r.toFixed(2)).join(', ')}). Two things differ between the segments besides contention - segment 2 is warming (it reaches a given bar count far younger than segment 1 did) and it starts from a fresh browser - so a matched-bar comparison across segments is not a clean contrast for memory even after the estimator is fixed.`
    : (meanSlopeRatio != null && Math.abs(1 - meanSlopeRatio) <= 0.15
      ? 'The MEMORY SLOPE per bar did NOT bend, which is the unit the memory findings are published in - contention steals CPU, not bytes per bar.'
      : 'The memory slope moved consistently across bands, so segment 2 must not be pooled with segment 1.');
  report.verdict.reading = `${thrText} ${slopeText}`;
} else {
  report.verdict = { reading: 'Segment 2 has not yet reached a resident-bar band that overlaps segment 1, so no matched comparison is possible yet. Recorded rather than guessed.' };
}

report.orphanKilled = {
  at: '23:23',
  cpuSecondsBurned: 21_986,
  privateMB: 2489,
  workingSetMB: 1354,
  note: 'The 1,141 MB gap between the orphan\'s private bytes (2,489) and its working set (1,354) is Windows trimming pages under pressure, not memory being returned. An OS working-set reading of ~1,358 MB therefore belonged to the ORPHAN being trimmed, not to the soak releasing anything - the soak renderer read 1,762 MB working set against 1,945 MB private at the same moment.',
  createsItsOwnDiscontinuity: 'Killing it at 23:23 is a SECOND boundary inside segment 2. Samples before 23:23 are contended; samples after are not. The allocator diff was re-baselined at 23:26 so it sits entirely on the clean side.',
};

report.affectedSamples = {
  rule: 'Every segment 2 sample before 23:23 carries the mark: the orphan appeared at 22:16:13 and segment 2 started at 22:16:13, so there is no clean prefix inside segment 2 - only a clean suffix after the kill.',
  alsoAffected: [
    'LOAF-LIVE-20260731.json (22:30-22:39)',
    'FRAME-TRACE-SOAK-20260731.json (22:52, 23:00, 23:05)',
    'FRAME-TRACE-IDLE-VS-REPLAY-20260731.json (22:57-23:01, and it added a THIRD browser of its own for ~4 minutes)',
    'LIVE-ALLOCATOR-DUMP-SEG2-A-20260731.json (22:29:57) - WITHDRAWN as a baseline and replaced by A2 at 23:26 on the clean host, so the 01:40 diff cannot inherit the contention silently',
  ],
  unaffected: 'Everything published up to 21:45 was measured inside segment 1 when it was the sole occupant.',
};

fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
