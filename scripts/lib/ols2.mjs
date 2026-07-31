/**
 * Two-predictor ordinary least squares with collinearity reporting.
 *
 * Extracted from soak-trade-correlation.mjs so that the soak grader and the correlation analysis share
 * ONE implementation. A duplicated statistical routine is a defect waiting to happen: fix a bias in one
 * copy, leave it in the other, and two published numbers disagree for reasons nobody can find.
 *
 * `perHour` and `perClosedTrade` are named for the original callers, but they are simply the coefficients
 * on x1 and x2. Callers using different drivers must say so in their own output — bend-soak passes
 * thousands of resident bars as x1, and labels it.
 */
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

export function ols2(y, x1, x2) {
  const n = y.length;
  const sum = (f) => { let t = 0; for (let i = 0; i < n; i += 1) t += f(i); return t; };
  const m1 = mean(x1); const m2 = mean(x2); const my = mean(y);
  const s11 = sum((i) => (x1[i] - m1) ** 2);
  const s22 = sum((i) => (x2[i] - m2) ** 2);
  const s12 = sum((i) => (x1[i] - m1) * (x2[i] - m2));
  const s1y = sum((i) => (x1[i] - m1) * (y[i] - my));
  const s2y = sum((i) => (x2[i] - m2) * (y[i] - my));
  const det = s11 * s22 - s12 * s12;
  if (Math.abs(det) < 1e-12) return { degenerate: true, reason: 'predictors are collinear to numerical precision' };
  const b1 = (s22 * s1y - s12 * s2y) / det;
  const b2 = (s11 * s2y - s12 * s1y) / det;
  const b0 = my - b1 * m1 - b2 * m2;
  const fitted = Array.from({ length: n }, (_, i) => b0 + b1 * x1[i] + b2 * x2[i]);
  const resid = y.map((v, i) => v - fitted[i]);
  const ssRes = resid.reduce((s, v) => s + v * v, 0);
  const ssTot = y.reduce((s, v) => s + (v - my) ** 2, 0);
  const df = n - 3;
  const sigma2 = ssRes / df;
  // Standard errors from the inverse of the 2x2 cross-product matrix.
  const se1 = Math.sqrt(sigma2 * (s22 / det));
  const se2 = Math.sqrt(sigma2 * (s11 / det));
  const t = 1.96 + 2.4 / df; // adequate for df > 20
  // Collinearity: variance inflation for two predictors is 1/(1-r12^2).
  const r12 = s12 / Math.sqrt(s11 * s22);
  return {
    b0: +b0.toFixed(3),
    // `perHour`/`perClosedTrade` are the ORIGINAL caller's predictors and are kept for compatibility, but the
    // names are a hazard: this function does not know what x1 and x2 are, and a caller passing bars as x1 would
    // read a bar coefficient labelled "perHour". `perX1`/`perX2` are the honest names and new callers use them.
    perX1: +b1.toFixed(3),
    perX1Ci: [+(b1 - t * se1).toFixed(3), +(b1 + t * se1).toFixed(3)],
    perX2: +b2.toFixed(3),
    perX2Ci: [+(b2 - t * se2).toFixed(3), +(b2 + t * se2).toFixed(3)],
    perHour: +b1.toFixed(3),
    perHourCi: [+(b1 - t * se1).toFixed(3), +(b1 + t * se1).toFixed(3)],
    perClosedTrade: +b2.toFixed(3),
    perClosedTradeCi: [+(b2 - t * se2).toFixed(3), +(b2 + t * se2).toFixed(3)],
    rSquared: +(1 - ssRes / ssTot).toFixed(4),
    predictorCorrelation: +r12.toFixed(4),
    varianceInflation: +(1 / Math.max(1e-9, 1 - r12 * r12)).toFixed(1),
    resid,
    fitted,
  };
}
