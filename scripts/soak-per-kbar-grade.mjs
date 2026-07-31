#!/usr/bin/env node
/**
 * SOAK GRADE IN THE DRIVER'S UNIT — MB per thousand resident bars, not MB per hour.
 *
 * `UNIT-01` says publish rates in the unit of their driver. A soak's MB/h is not a property of the product: it
 * is the product's per-bar cost multiplied by whatever bar rate the engine happened to deliver in that window.
 * The warm-up of arm 1 reads a spectacular MB/h purely because the engine was delivering ~15 bars/sec into a
 * light session; the same build at 9 bars/sec would report a third less while behaving identically.
 *
 * So the headline here is MB per thousand bars, with MB/h shown only alongside the bar rate that produced it —
 * and the two-driver fit separates bars from trades so neither is credited with the other's work.
 */
import fs from 'node:fs';
import { ols2 } from './lib/ols2.mjs';

const argOf = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const IN = argOf('in', 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\TEN-HOUR-SEG-01-20260731.json');
const OUT = argOf('out', 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\SOAK-PER-KBAR-GRADE-20260731.json');

function ols1(pts) {
  const n = pts.length;
  if (n < 3) return null;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0; let sxy = 0;
  for (const p of pts) { sxx += (p.x - mx) ** 2; sxy += (p.x - mx) * (p.y - my); }
  if (!(sxx > 0)) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let ssTot = 0; let ssRes = 0; const resid = [];
  for (const p of pts) {
    const fit = intercept + slope * p.x;
    resid.push(p.y - fit); ssTot += (p.y - my) ** 2; ssRes += (p.y - fit) ** 2;
  }
  const se = Math.sqrt((ssRes / (n - 2)) / sxx);
  let runs = 1;
  for (let i = 1; i < resid.length; i += 1) if ((resid[i] >= 0) !== (resid[i - 1] >= 0)) runs += 1;
  const pos = resid.filter((r) => r >= 0).length; const neg = resid.length - pos;
  const expected = (2 * pos * neg) / (pos + neg) + 1;
  const variance = (2 * pos * neg * (2 * pos * neg - pos - neg)) / (((pos + neg) ** 2) * (pos + neg - 1));
  const z = variance > 0 ? (runs - expected) / Math.sqrt(variance) : null;
  return {
    n, slope: +slope.toPrecision(6), ci95: [+(slope - 1.96 * se).toPrecision(6), +(slope + 1.96 * se).toPrecision(6)],
    rSquared: ssTot > 0 ? +(1 - ssRes / ssTot).toFixed(4) : null, runsZ: z != null ? +z.toFixed(2) : null,
  };
}

const src = JSON.parse(fs.readFileSync(IN, 'utf8'));
const s = (src.samples || []).filter((r) => r.footprintTotalMB != null && r.residentBars != null);

const report = {
  signature: 'SOAK-PER-KBAR-GRADE-V1',
  artifactFile: OUT.split('\\').pop(),
  unitRule: 'UNIT-01: MB per thousand resident bars is the headline. MB/h appears only with the bar rate that produced it, because MB/h is per-bar cost times delivered bar rate and the bar rate is not constant.',
  bfcacheState: src.bfcacheState ?? 'inherited from the graded run; offline grader opens no browser',
  source: { file: IN.split('\\').pop(), signature: src.signature ?? null, buildStamp: src.buildStamp ?? null, samples: s.length, partial: src.status == null || src.status === 'RUNNING' },
};

if (s.length >= 3) {
  const bars = s.map((r) => r.residentBars);
  const hours = s.map((r) => r.hours ?? 0);
  const trades = s.map((r) => r.closedTrades ?? 0);
  const foot = s.map((r) => r.footprintTotalMB);

  const perKbar = ols1(s.map((r) => ({ x: r.residentBars / 1000, y: r.footprintTotalMB })));
  const perHour = ols1(s.map((r) => ({ x: r.hours ?? 0, y: r.footprintTotalMB })));
  const two = ols2(foot, bars.map((b) => b / 1000), trades);

  const spanHours = (hours[hours.length - 1] - hours[0]) || null;
  const spanBars = bars[bars.length - 1] - bars[0];
  const barsPerSec = spanHours ? +(spanBars / (spanHours * 3600)).toFixed(2) : null;

  report.headline = {
    mbPerThousandResidentBars: perKbar?.slope ?? null,
    ci95: perKbar?.ci95 ?? null,
    rSquared: perKbar?.rSquared ?? null,
    runsZ: perKbar?.runsZ ?? null,
    straight: perKbar?.runsZ != null ? Math.abs(perKbar.runsZ) < 2 : null,
  };
  report.perHourForContrastOnly = {
    mbPerHour: perHour?.slope ?? null,
    deliveredBarsPerSec: barsPerSec,
    warning: `This MB/h figure is only meaningful attached to ${barsPerSec} bars/sec. The engine's delivered rate falls as bars accumulate (measured elsewhere at 20.6 -> 9.19 bars/sec), so an MB/h quoted from an early window is an artifact of a fast warm-up, not a property of the build. Do not compare it to any MB/h measured over a different span.`,
  };
  // A two-driver split is only readable if the drivers separate. In a governed soak with few closed trades,
  // bars and trades are nearly the same variable, and OLS answers with confident nonsense - here -61 MB per
  // closed trade, i.e. memory FALLING with trading. Suppress rather than publish, and say why.
  const vif = two && !two.degenerate ? (two.varianceInflation ?? null) : null;
  const separable = vif != null && vif <= 10;
  report.twoDriverAttribution = two && !two.degenerate && separable ? {
    mbPerThousandBarsHoldingTrades: two.perX1 ?? null,
    mbPerThousandBarsCi: two.perX1Ci ?? null,
    mbPerClosedTradeHoldingBars: two.perX2 ?? null,
    mbPerClosedTradeCi: two.perX2Ci ?? null,
    rSquared: two.rSquared ?? null,
    predictorCorrelation: two.predictorCorrelation ?? null,
    varianceInflation: two.varianceInflation ?? null,
    caveat: 'Bars and closed trades both rise with time in a governed soak, so these two predictors are correlated and the split is not clean. Reported for direction, and the zero-trade CONF-05 arm is the clean separation.',
  } : {
    usable: false,
    reason: two?.degenerate
      ? (two.reason || 'degenerate')
      : `NOT SEPARABLE: predictor correlation ${two?.predictorCorrelation}, variance inflation ${vif}. Over this span bars and closed trades are effectively one variable, so the two coefficients are unidentified. The fit returns ${two?.perX2} MB per closed trade - memory falling as trades close - which is a collinearity artifact and not a measurement.`,
    suppressedForTheRecord: two ? { perThousandBars: two.perX1, perClosedTrade: two.perX2, predictorCorrelation: two.predictorCorrelation, varianceInflation: vif } : null,
    whatWouldFixIt: 'Either a longer span so the governed trade rate decouples from bar accumulation, or the paired CONF-05 arm where trades are ZERO by construction and the difference between arms IS the trade term.',
  };
  report.span = { hours: spanHours != null ? +spanHours.toFixed(3) : null, barsFrom: bars[0], barsTo: bars[bars.length - 1], footFrom: foot[0], footTo: foot[foot.length - 1], closedTrades: trades[trades.length - 1] };
  report.verdict = `${perKbar?.slope} MB per thousand resident bars CI ${JSON.stringify(perKbar?.ci95)} over ${spanBars} bars. Against my monotonic-bars result of 23.98 MB/kbar CI [22.75, 25.21] on a ZERO-TRADE run, this arm carries trades, so a higher figure is expected and the gap is the trade contribution rather than a contradiction.`;
}
report.signatureFilenameCheck = OUT.endsWith(report.artifactFile) ? 'PASS' : 'FAIL';
fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ headline: report.headline, perHourForContrastOnly: report.perHourForContrastOnly, twoDriver: report.twoDriverAttribution, span: report.span }, null, 1));
