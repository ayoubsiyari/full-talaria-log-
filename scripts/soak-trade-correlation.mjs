#!/usr/bin/env node
/**
 * SOAK-TRADE-CORRELATION — item 2 of the 09:15 queue. No new run: the 58 samples are on disk.
 *
 * Question: does memory STEP at trade closes, or RISE with the clock? The advisor's arithmetic puts
 * growth at ~23 MB per closed trade, which brackets a decoded 1920x1080 bitmap (8.3 MB) and the same
 * at devicePixelRatio 2 (33 MB).
 *
 * The honest hazard, and it is checked FIRST: in this soak, hours and closed trades both increased
 * together. If they are collinear, no regression can separate them and the correct answer is "this
 * dataset cannot tell", not a coefficient. That is the same error the Director's own 730 MB/h headline
 * made, so it gets tested before anything is fitted.
 *
 * The discriminating test needs no model at all: compare memory growth in intervals that contained
 * ZERO trade closes against intervals that contained one or more. If dead intervals grow just as
 * fast, memory is not per-trade, whatever a fit says.
 *
 * Reporting obeys UNIT-01 (rates in the units of their driver, per-hour only with a declared trade
 * rate and speed) and FIT-01 (residual structure published, not only rSquared).
 */
import fs from 'node:fs';
import { ols2 } from './lib/ols2.mjs';

const SOAK = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\B6-CONF01-DURATION-SOAK-20260731.json';
const OUT = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\SOAK-TRADE-CORRELATION-20260731.json';

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const r2 = (x, y) => {
  const mx = mean(x); const my = mean(y);
  let sxy = 0; let sxx = 0; let syy = 0;
  for (let i = 0; i < x.length; i += 1) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return { r: sxy / Math.sqrt(sxx * syy), r2: (sxy * sxy) / (sxx * syy), slope: sxy / sxx, intercept: my - (sxy / sxx) * mx };
};

/** Ordinary least squares with two predictors plus intercept, solved directly. */
// ols2 now lives in lib/ols2.mjs so this analysis and the soak grader share one implementation.

/**
 * FIT-01. rSquared alone hides a knee, so state the shape of what is left over.
 * Runs test on residual signs, lag-1 autocorrelation, and whether adding a quadratic term in the
 * predictor materially reduces the residual sum of squares.
 */
function residualStructure(x, y, label) {
  const lin = r2(x, y);
  const fitted = x.map((v) => lin.intercept + lin.slope * v);
  const resid = y.map((v, i) => v - fitted[i]);
  const signs = resid.map((v) => (v >= 0 ? 1 : -1));
  let runs = 1;
  for (let i = 1; i < signs.length; i += 1) if (signs[i] !== signs[i - 1]) runs += 1;
  const nPos = signs.filter((s) => s > 0).length;
  const nNeg = signs.length - nPos;
  const expectedRuns = 1 + (2 * nPos * nNeg) / signs.length;
  const sdRuns = Math.sqrt((2 * nPos * nNeg * (2 * nPos * nNeg - signs.length)) / (signs.length ** 2 * (signs.length - 1)));
  const runsZ = sdRuns > 0 ? (runs - expectedRuns) / sdRuns : null;
  let num = 0; let den = 0;
  for (let i = 1; i < resid.length; i += 1) num += resid[i] * resid[i - 1];
  for (const v of resid) den += v * v;
  const lag1 = den > 0 ? num / den : null;
  // Quadratic improvement: fit y on x and x^2 and compare residual sum of squares.
  const q = ols2(y, x, x.map((v) => v * v));
  const ssLin = resid.reduce((s, v) => s + v * v, 0);
  const ssQuad = q.degenerate ? null : q.resid.reduce((s, v) => s + v * v, 0);
  const quadGain = ssQuad != null && ssLin > 0 ? +(1 - ssQuad / ssLin).toFixed(4) : null;
  const curved = runsZ != null && runsZ < -2 && (quadGain ?? 0) > 0.1;
  // Direction matters more than magnitude: a negative quadratic term is growth that is FLATTENING
  // (good, and it means the linear chord overstates the long run), a positive one is growth that is
  // ACCELERATING (bad, and the chord understates it). In ols2(y, x, x*x) the x*x coefficient is b2.
  const quadCoefficient = q.degenerate ? null : q.perClosedTrade;
  const bend = (!curved || quadCoefficient == null) ? null
    : (quadCoefficient < 0
      ? 'CONCAVE — growth is flattening, so the linear rate OVERSTATES what a longer run would show'
      : 'CONVEX — growth is accelerating, so the linear rate UNDERSTATES what a longer run would show');
  return {
    label,
    n: x.length,
    slope: +lin.slope.toFixed(3),
    rSquared: +lin.r2.toFixed(4),
    residual: {
      runs,
      expectedRuns: +expectedRuns.toFixed(1),
      runsZ: runsZ != null ? +runsZ.toFixed(2) : null,
      lag1Autocorrelation: lag1 != null ? +lag1.toFixed(3) : null,
      maxAbsResidual: +Math.max(...resid.map(Math.abs)).toFixed(1),
      residualSd: +sd(resid).toFixed(1),
      varianceExplainedByAddingQuadratic: quadGain,
      curvaturePresent: curved,
      quadraticCoefficient: quadCoefficient,
      bend,
      // A high rSquared with too few sign changes and a strong quadratic gain is a knee hiding in a
      // clean fit, which is exactly what FIT-01 exists to surface.
      interpretation: curved
        ? 'residuals are not scattered: too few sign changes and a real quadratic gain, so the linear rate is a chord across a curve and must not be extrapolated'
        : (Math.abs(lag1 ?? 0) > 0.6
          ? 'residuals are strongly autocorrelated, so consecutive samples are not independent and the CI is optimistic'
          : 'residuals show no curvature or strong autocorrelation at this resolution'),
    },
  };
}

const soak = JSON.parse(fs.readFileSync(SOAK, 'utf8'));
const s = soak.samples;

const rows = s.map((x) => ({
  sample: x.sample,
  hours: x.hours,
  closed: x.trades?.managerClosed ?? null,
  open: x.trades?.managerOpen ?? null,
  footprintMB: x.footprint?.totalPrivateMB ?? null,
  rendererMB: x.footprint?.pageRendererPrivateMB ?? null,
  postGcHeapMB: x.collected?.jsHeapMB ?? x.collected?.heapMB ?? null,
  elements: x.elements ?? null,
  totalBars: x.state?.totalBars ?? null,
})).filter((r) => Number.isFinite(r.hours) && Number.isFinite(r.footprintMB) && Number.isFinite(r.closed));

const hours = rows.map((r) => r.hours);
const closed = rows.map((r) => r.closed);
const foot = rows.map((r) => r.footprintMB);
const rend = rows.map((r) => r.rendererMB);
const elems = rows.map((r) => r.elements);
const bars = rows.map((r) => r.totalBars);

const report = {
  signature: 'SOAK-TRADE-CORRELATION-V1',
  ruling: 'cbfdb81f4 item 2 (advisor free correlation), UNIT-01, FIT-01',
  source: SOAK,
  note: 'No new run. 58 samples already on disk.',
  n: rows.length,
  spanHours: +(hours.at(-1) - hours[0]).toFixed(2),
  closedTradesFirstToLast: [closed[0], closed.at(-1)],
  declaredConfiguration: {
    replaySpeedSelected: soak.replaySpeed,
    sampleIntervalMs: soak.intervalMs,
    tradeRateClosesPerHour: +(((closed.at(-1) - closed[0]) / (hours.at(-1) - hours[0]))).toFixed(2),
    barsFirstToLast: [bars[0], bars.at(-1)],
    caveat: 'UNIT-01: any per-hour figure below is only meaningful against this trade rate and this selected speed. The selected speed itself is under investigation as the 14x question.',
  },
};

// ---- Step 1: can this dataset even separate the two drivers? -----------------
const collin = r2(hours, closed);
report.collinearity = {
  hoursVsClosedTrades_r: +collin.r.toFixed(4),
  hoursVsClosedTrades_r2: +collin.r2.toFixed(4),
  closesPerHourBySample: (() => {
    const out = [];
    for (let i = 1; i < rows.length; i += 1) {
      const dh = rows[i].hours - rows[i - 1].hours;
      const dc = rows[i].closed - rows[i - 1].closed;
      if (dh > 0) out.push(+(dc / dh).toFixed(1));
    }
    return out;
  })(),
};
report.collinearity.closesPerHourSpread = {
  min: Math.min(...report.collinearity.closesPerHourBySample),
  max: Math.max(...report.collinearity.closesPerHourBySample),
  sd: +sd(report.collinearity.closesPerHourBySample).toFixed(1),
};
report.collinearity.separable = report.collinearity.hoursVsClosedTrades_r2 < 0.97
  || report.collinearity.closesPerHourSpread.sd > 3;

// ---- Step 2: the model-free discriminator ------------------------------------
const intervals = [];
for (let i = 1; i < rows.length; i += 1) {
  const dh = rows[i].hours - rows[i - 1].hours;
  const dc = rows[i].closed - rows[i - 1].closed;
  if (!(dh > 0)) continue;
  intervals.push({
    from: rows[i - 1].sample,
    to: rows[i].sample,
    hours: +dh.toFixed(4),
    closes: dc,
    dFootprintMB: +(rows[i].footprintMB - rows[i - 1].footprintMB).toFixed(1),
    dRendererMB: +(rows[i].rendererMB - rows[i - 1].rendererMB).toFixed(1),
    dElements: rows[i].elements - rows[i - 1].elements,
    mbPerHour: +((rows[i].footprintMB - rows[i - 1].footprintMB) / dh).toFixed(1),
  });
}
const dead = intervals.filter((v) => v.closes === 0);
const live = intervals.filter((v) => v.closes > 0);
report.stepTest = {
  question: 'Do intervals with NO trade close grow as fast as intervals with closes?',
  intervalsTotal: intervals.length,
  intervalsWithZeroCloses: dead.length,
  intervalsWithCloses: live.length,
  deadIntervalMbPerHourMean: dead.length ? +mean(dead.map((v) => v.mbPerHour)).toFixed(1) : null,
  liveIntervalMbPerHourMean: live.length ? +mean(live.map((v) => v.mbPerHour)).toFixed(1) : null,
  deadIntervalMbPerHourSd: dead.length > 1 ? +sd(dead.map((v) => v.mbPerHour)).toFixed(1) : null,
  liveIntervalMbPerHourSd: live.length > 1 ? +sd(live.map((v) => v.mbPerHour)).toFixed(1) : null,
  interpretation: null,
};
if (dead.length >= 3 && live.length >= 3) {
  const d = report.stepTest.deadIntervalMbPerHourMean;
  const l = report.stepTest.liveIntervalMbPerHourMean;
  const ratio = l !== 0 ? +(d / l).toFixed(2) : null;
  report.stepTest.deadOverLiveRatio = ratio;
  report.stepTest.interpretation = (ratio != null && ratio > 0.7)
    ? 'Intervals with no trade close grow essentially as fast as intervals with closes. Memory growth is NOT gated on trade closes, and the per-trade attribution cannot carry the headline.'
    : 'Intervals with no trade close grow materially slower. Memory growth is at least partly gated on trade closes, consistent with a per-trade allocation.';
} else {
  report.stepTest.interpretation = `Not enough of one kind of interval to compare (${dead.length} dead, ${live.length} live). The soak closed trades too steadily for this test to have leverage, which is itself the finding.`;
}

// ---- Step 3: the two-driver fit, with collinearity stated --------------------
report.twoDriverFit = {
  footprintTotal: ols2(foot, hours, closed),
  renderer: ols2(rend, hours, closed),
  elements: ols2(elems, hours, closed),
};
for (const k of Object.keys(report.twoDriverFit)) {
  const f = report.twoDriverFit[k];
  if (f && !f.degenerate) { delete f.resid; delete f.fitted; }
}

// ---- Step 4: UNIT-01 single-driver rates ------------------------------------
const perTrade = r2(closed, foot);
// A per-thousand-bars rate is only meaningful if the bar count actually accumulated. In this soak
// panels re-seeked, so totalBars is NOT monotonic and a regression on it produces a negative slope
// that means nothing. UNIT-01 asks for the rate in the driver's units; it does not ask for a number
// where the driver was not measured cleanly.
const barsMonotonic = bars.every((v, i) => i === 0 || !Number.isFinite(v) || v >= bars[i - 1]);
const perBar = (Number.isFinite(bars[0]) && barsMonotonic) ? r2(bars, foot) : null;
report.unitRates = {
  perClosedTradeMB: +perTrade.slope.toFixed(2),
  perClosedTradeRSquared: +perTrade.r2.toFixed(4),
  advisorPredictedPerTradeMB: 23,
  bitmapReference: { at1x1920x1080RgbaMB: 8.3, atDevicePixelRatio2MB: 33 },
  perThousandBarsMB: perBar ? +(perBar.slope * 1000).toFixed(2) : null,
  perThousandBarsRSquared: perBar ? +perBar.r2.toFixed(4) : null,
  perThousandBarsUnavailableBecause: perBar ? null
    : 'resident bar count is not monotonic across this soak (panels re-seeked and shed bars), so regressing memory on it yields a negative slope that is an artifact, not a rate. A per-thousand-bars memory figure needs a run whose bar count only accumulates.',
  perHourMB: +r2(hours, foot).slope.toFixed(1),
  perHourOnlyValidAgainst: report.declaredConfiguration,
};

// ---- Step 4b: did the trade rate decelerate? --------------------------------
// This is the link between the two residual structures. If closes accumulate concavely in time and
// memory is linear in closes, memory MUST look concave in time - which is exactly what was measured.
const third = Math.floor(rows.length / 3);
const rateIn = (a, b) => {
  const dh = rows[b].hours - rows[a].hours;
  return dh > 0 ? +((rows[b].closed - rows[a].closed) / dh).toFixed(1) : null;
};
report.tradeRateOverTime = {
  firstThirdClosesPerHour: rateIn(0, third),
  middleThirdClosesPerHour: rateIn(third, 2 * third),
  lastThirdClosesPerHour: rateIn(2 * third, rows.length - 1),
};
report.tradeRateOverTime.decelerating = (report.tradeRateOverTime.firstThirdClosesPerHour ?? 0)
  > (report.tradeRateOverTime.lastThirdClosesPerHour ?? 0) * 1.2;

// ---- Step 5: FIT-01 residual structure for each candidate driver -------------
report.residualStructure = {
  footprintVsHours: residualStructure(hours, foot, 'total footprint against hours'),
  footprintVsClosedTrades: residualStructure(closed, foot, 'total footprint against closed trades'),
  elementsVsClosedTrades: residualStructure(closed, elems, 'elements against closed trades'),
};
if (Number.isFinite(bars[0])) {
  report.residualStructure.footprintVsBars = residualStructure(bars, foot, 'total footprint against total resident bars');
}

// ---- Verdict ----------------------------------------------------------------
const sepOk = report.collinearity.separable;
const step = report.stepTest.deadOverLiveRatio;
const hoursCurved = report.residualStructure.footprintVsHours.residual.curvaturePresent;
const closesCurved = report.residualStructure.footprintVsClosedTrades.residual.curvaturePresent;
report.verdict = {
  separable: sepOk,
  stepTestHadLeverage: report.stepTest.intervalsWithZeroCloses >= 3,
  headline: null,
  perTradeSupported: null,
  evidenceUsed: null,
};
if (!sepOk) {
  report.verdict.headline = 'This dataset CANNOT separate wall clock from trade closes: the two are collinear at r2 '
    + `${report.collinearity.hoursVsClosedTrades_r2} and trades closed at a near-constant ${report.declaredConfiguration.tradeRateClosesPerHour}/h. `
    + 'Any per-trade or per-hour coefficient from it is an arbitrary split of the same variance. What would separate them is a run that varies trade rate at fixed speed.';
  report.verdict.perTradeSupported = 'UNDECIDABLE FROM THIS DATA';
  report.verdict.evidenceUsed = 'collinearity check only';
} else if (step != null && step > 0.7) {
  report.verdict.headline = 'Memory does not step at trade closes: intervals containing no close grow as fast as intervals containing them. The per-trade screenshot hypothesis does not carry this growth.';
  report.verdict.perTradeSupported = 'NO';
  report.verdict.evidenceUsed = 'model-free step test';
} else if (step != null) {
  report.verdict.headline = 'Memory growth concentrates in intervals containing trade closes, consistent with a per-trade allocation of the size the advisor predicted.';
  report.verdict.perTradeSupported = 'YES';
  report.verdict.evidenceUsed = 'model-free step test';
} else if (hoursCurved && !closesCurved) {
  // The step test had no leverage - every interval contained a close - so the verdict rests on
  // residual shape instead, and says so. Memory is LINEAR in closes but CURVED in time, and the
  // trade rate itself decelerated, which is precisely what "memory tracks trades" predicts.
  report.verdict.headline = 'The step test had no leverage — every one of the 57 intervals contained at least one close, '
    + 'so nothing here compares a dead interval against a live one. The verdict rests on residual shape instead: memory is '
    + `LINEAR in closed trades (adding a quadratic buys ${report.residualStructure.footprintVsClosedTrades.residual.varianceExplainedByAddingQuadratic}) `
    + `but CURVED in wall clock (adding a quadratic buys ${report.residualStructure.footprintVsHours.residual.varianceExplainedByAddingQuadratic}), `
    + `and the trade rate itself decelerated from ${report.tradeRateOverTime.firstThirdClosesPerHour}/h to ${report.tradeRateOverTime.lastThirdClosesPerHour}/h. `
    + 'A quantity that is straight in trades and bent in time, where trades themselves bend in time, is a quantity driven by trades.';
  report.verdict.perTradeSupported = 'YES, ON RESIDUAL SHAPE RATHER THAN ON A STEP TEST';
  report.verdict.evidenceUsed = 'FIT-01 residual structure comparison plus the trade-rate profile';
} else {
  report.verdict.headline = 'The step test had no leverage and the residual structures do not separate the two drivers cleanly. Reported as undecided.';
  report.verdict.perTradeSupported = 'UNDECIDED';
  report.verdict.evidenceUsed = 'none sufficient';
}
// The published per-hour figure from last night must carry this correction wherever it is quoted.
report.correctionToPublishedRate = hoursCurved ? {
  publishedLastNight: '+513.3 MB/h CI[494,532] over 3.78h',
  correction: 'That linear rate is a CHORD ACROSS A CURVE. Residuals against hours have runsZ '
    + `${report.residualStructure.footprintVsHours.residual.runsZ} and a quadratic term explains `
    + `${report.residualStructure.footprintVsHours.residual.varianceExplainedByAddingQuadratic} of the remaining variance. `
    + 'Per FIT-01 it must not be extrapolated beyond 3.78h, and the ten-hour claim cannot be made from it.',
} : null;

report.intervals = intervals;
fs.writeFileSync(OUT, JSON.stringify(report, null, 1));

console.error(`n=${report.n} span=${report.spanHours}h closes ${report.closedTradesFirstToLast.join(' -> ')} at ${report.declaredConfiguration.tradeRateClosesPerHour}/h`);
console.error(`\nCOLLINEARITY hours vs closes: r2=${report.collinearity.hoursVsClosedTrades_r2} closesPerHour sd=${report.collinearity.closesPerHourSpread.sd} (min ${report.collinearity.closesPerHourSpread.min}, max ${report.collinearity.closesPerHourSpread.max}) separable=${sepOk}`);
console.error(`\nSTEP TEST: ${report.stepTest.intervalsWithZeroCloses} dead / ${report.stepTest.intervalsWithCloses} live intervals`);
console.error(`  dead ${report.stepTest.deadIntervalMbPerHourMean} MB/h (sd ${report.stepTest.deadIntervalMbPerHourSd}) vs live ${report.stepTest.liveIntervalMbPerHourMean} MB/h (sd ${report.stepTest.liveIntervalMbPerHourSd}) ratio=${report.stepTest.deadOverLiveRatio}`);
console.error(`  ${report.stepTest.interpretation}`);
console.error(`\nTWO-DRIVER FIT footprint: perHour=${report.twoDriverFit.footprintTotal.perHour} CI${JSON.stringify(report.twoDriverFit.footprintTotal.perHourCi)} perClosedTrade=${report.twoDriverFit.footprintTotal.perClosedTrade} CI${JSON.stringify(report.twoDriverFit.footprintTotal.perClosedTradeCi)} r2=${report.twoDriverFit.footprintTotal.rSquared} VIF=${report.twoDriverFit.footprintTotal.varianceInflation}`);
console.error(`\nUNIT-01: ${report.unitRates.perClosedTradeMB} MB per closed trade (advisor predicted 23), ${report.unitRates.perThousandBarsMB} MB per 1k bars, ${report.unitRates.perHourMB} MB/h at the declared rate`);
console.error('\nFIT-01 residual structure:');
for (const [k, v] of Object.entries(report.residualStructure)) {
  console.error(`  ${k}: r2=${v.rSquared} runsZ=${v.residual.runsZ} lag1=${v.residual.lag1Autocorrelation} quadGain=${v.residual.varianceExplainedByAddingQuadratic} curved=${v.residual.curvaturePresent}`);
  console.error(`     ${v.residual.interpretation}`);
}
console.error(`\nVERDICT: ${report.verdict.headline}`);
console.error(`per-trade supported: ${report.verdict.perTradeSupported}`);
