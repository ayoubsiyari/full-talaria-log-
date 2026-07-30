/**
 * DURATION-TREND-V1 — DUR-01 arithmetic: a performance acceptance is a slope over a
 * duration, with its confidence, not a reading at an instant.
 *
 * The verdict deliberately has four values, not two. A slope whose confidence
 * interval straddles the flat band cannot be called flat OR climbing: the honest
 * answer is that the series is too short or too noisy to tell, and that is the
 * exact failure this campaign kept making by reading endpoints. INDETERMINATE is
 * not a GREEN.
 */

export const DURATION_TREND_SIGNATURE = 'DURATION-TREND-V1';

// Two-sided 95% t critical values by degrees of freedom; normal limit beyond.
const T95 = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306,
  9: 2.262, 10: 2.228, 11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131,
  16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086, 25: 2.060, 30: 2.042,
  40: 2.021, 60: 2.000, 120: 1.980,
};

export function tCritical95(df) {
  if (!Number.isFinite(df) || df < 1) return NaN;
  if (T95[df]) return T95[df];
  const keys = Object.keys(T95).map(Number).sort((a, b) => a - b);
  for (const k of keys) if (df < k) return T95[k];
  return 1.96;
}

/**
 * Least-squares fit of value against hours, with a 95% CI on the slope.
 *
 * @param {Array<{hours:number, value:number}>} points
 * @param {{label?:string, flatBandPerHour?:number, minSpanHours?:number}} opts
 *   flatBandPerHour — the largest per-hour drift that still counts as flat. Must
 *   come from a measured noise floor, never from taste.
 */
export function fitTrend(points, { label = '', flatBandPerHour = 0, minSpanHours = 2 } = {}) {
  const rows = (points || [])
    .filter((p) => Number.isFinite(p?.hours) && Number.isFinite(p?.value))
    .slice()
    .sort((a, b) => a.hours - b.hours);
  const band = Math.abs(flatBandPerHour) || 0;
  if (rows.length < 4) {
    return {
      label, n: rows.length, verdict: 'INSUFFICIENT', reason: 'fewer than 4 samples',
      flatBandPerHour: band, durationOk: false,
    };
  }
  const n = rows.length;
  const meanX = rows.reduce((s, p) => s + p.hours, 0) / n;
  const meanY = rows.reduce((s, p) => s + p.value, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const p of rows) {
    sxy += (p.hours - meanX) * (p.value - meanY);
    sxx += (p.hours - meanX) ** 2;
  }
  if (!(sxx > 0)) {
    return { label, n, verdict: 'INSUFFICIENT', reason: 'zero span in x', flatBandPerHour: band, durationOk: false };
  }
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  let ssRes = 0;
  let ssTot = 0;
  for (const p of rows) {
    ssRes += (p.value - (intercept + slope * p.hours)) ** 2;
    ssTot += (p.value - meanY) ** 2;
  }
  const df = n - 2;
  const residualVar = df > 0 ? ssRes / df : NaN;
  const slopeSe = Number.isFinite(residualVar) ? Math.sqrt(residualVar / sxx) : NaN;
  const t = tCritical95(df);
  const halfWidth = Number.isFinite(slopeSe) ? t * slopeSe : NaN;
  const ciLow = slope - halfWidth;
  const ciHigh = slope + halfWidth;
  const values = rows.map((p) => p.value);
  const spanHours = rows[n - 1].hours - rows[0].hours;

  let verdict;
  if (!Number.isFinite(halfWidth)) verdict = 'INSUFFICIENT';
  else if (ciLow > band) verdict = 'CLIMBS';
  else if (ciHigh < -band) verdict = 'FALLS';
  else if (ciLow >= -band && ciHigh <= band) verdict = 'BOUNDED';
  // The interval covers both "flat" and "growing": more duration, not a verdict.
  else verdict = 'INDETERMINATE';

  return {
    label,
    n,
    spanHours: +spanHours.toFixed(3),
    durationOk: spanHours >= minSpanHours,
    first: +values[0].toFixed(2),
    last: +values[n - 1].toFixed(2),
    min: +Math.min(...values).toFixed(2),
    max: +Math.max(...values).toFixed(2),
    perHour: +slope.toFixed(3),
    slopeCi95: [+ciLow.toFixed(3), +ciHigh.toFixed(3)],
    slopeSe: Number.isFinite(slopeSe) ? +slopeSe.toFixed(3) : null,
    rSquared: ssTot > 0 ? +(1 - ssRes / ssTot).toFixed(3) : null,
    flatBandPerHour: +band.toFixed(3),
    projectedPerHourAt8h: +(slope * 8).toFixed(1),
    verdict,
  };
}

/**
 * Grade a set of fitted trends. Any CLIMBS is RED; anything not resolved to
 * BOUNDED/FALLS with sufficient duration cannot be GREEN.
 */
export function gradeDurationSeries(trends, { minSpanHours = 2 } = {}) {
  const rows = Object.entries(trends || {}).map(([key, t]) => ({ key, ...t }));
  const climbing = rows.filter((r) => r.verdict === 'CLIMBS');
  const unresolved = rows.filter((r) => r.verdict === 'INDETERMINATE' || r.verdict === 'INSUFFICIENT');
  const shortRuns = rows.filter((r) => r.durationOk === false);
  let status;
  let reason;
  if (climbing.length) {
    status = 'RED';
    reason = `climbing: ${climbing.map((r) => `${r.key} +${r.perHour}/h CI[${r.slopeCi95?.join(',')}]`).join('; ')}`;
  } else if (unresolved.length || shortRuns.length) {
    status = 'UNRESOLVED';
    reason = `not enough duration or precision to call flat: ${[...new Set([
      ...unresolved.map((r) => r.key), ...shortRuns.map((r) => r.key),
    ])].join(', ')} (DUR-01 needs >= ${minSpanHours}h and a CI inside the flat band)`;
  } else {
    status = 'GREEN';
    reason = `all series bounded within their flat bands over >= ${minSpanHours}h`;
  }
  return {
    signature: DURATION_TREND_SIGNATURE,
    status,
    reason,
    climbing: climbing.map((r) => r.key),
    unresolved: unresolved.map((r) => r.key),
  };
}
