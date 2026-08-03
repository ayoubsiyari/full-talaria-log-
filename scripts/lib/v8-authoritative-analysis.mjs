const MB = 1024 * 1024;

export const V8_AUTHORITATIVE_ANALYSIS_SIGNATURE = 'V8_AUTHORITATIVE_ANALYSIS_V1';

export function mb(bytes) {
  return +(Number(bytes || 0) / MB).toFixed(3);
}

function mean(xs) {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const ix = (sorted.length - 1) * p;
  const lo = Math.floor(ix);
  const hi = Math.ceil(ix);
  if (lo === hi) return sorted[lo];
  const t = ix - lo;
  return sorted[lo] * (1 - t) + sorted[hi] * t;
}

export function ordinaryLeastSquares(rows, {
  xKey = 'elapsedMin',
  yKey = 'jsHeapUsedMB',
} = {}) {
  const points = (rows || [])
    .map((row) => ({ x: Number(row?.[xKey]), y: Number(row?.[yKey]) }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (points.length < 3) {
    return { ok: false, state: 'INSUFFICIENT_POINTS', points: points.length };
  }
  const xBar = mean(points.map((p) => p.x));
  const yBar = mean(points.map((p) => p.y));
  const sxx = points.reduce((s, p) => s + (p.x - xBar) ** 2, 0);
  if (sxx === 0) return { ok: false, state: 'ZERO_X_VARIANCE', points: points.length };
  const sxy = points.reduce((s, p) => s + (p.x - xBar) * (p.y - yBar), 0);
  const slopePerMin = sxy / sxx;
  const interceptMB = yBar - slopePerMin * xBar;
  const residuals = points.map((p) => p.y - (interceptMB + slopePerMin * p.x));
  const rss = residuals.reduce((s, r) => s + r ** 2, 0);
  const residualStdMB = Math.sqrt(rss / Math.max(1, points.length - 2));
  const slopeStdErrPerMin = residualStdMB / Math.sqrt(sxx);
  // t=2 is the deliberate CI approximation for this operational gate: n~25 tail samples,
  // and the verdict should be conservative rather than over-fitted to a distribution table.
  const ci95HalfWidthMBPerHour = 2 * slopeStdErrPerMin * 60;
  return {
    ok: true,
    state: 'FIT_OK',
    points: points.length,
    slopeMBPerHour: +(slopePerMin * 60).toFixed(3),
    slopeCi95MBPerHour: [
      +((slopePerMin * 60) - ci95HalfWidthMBPerHour).toFixed(3),
      +((slopePerMin * 60) + ci95HalfWidthMBPerHour).toFixed(3),
    ],
    interceptMB: +interceptMB.toFixed(3),
    residualStdMB: +residualStdMB.toFixed(3),
    residualP95AbsMB: +percentile(residuals.map((r) => Math.abs(r)).sort((a, b) => a - b), 0.95).toFixed(3),
  };
}

export function consecutiveNoiseBandMB(rows, {
  yKey = 'jsHeapUsedMB',
  minBandMB = 0.5,
} = {}) {
  const ys = (rows || []).map((row) => Number(row?.[yKey])).filter(Number.isFinite);
  if (ys.length < 3) return minBandMB;
  const deltas = [];
  for (let i = 1; i < ys.length; i += 1) deltas.push(Math.abs(ys[i] - ys[i - 1]));
  deltas.sort((a, b) => a - b);
  return +Math.max(minBandMB, percentile(deltas, 0.95) || 0).toFixed(3);
}

export function evaluateValidityChecklist({
  identityLockHeld,
  allPhasesCompleted,
  sidecarsClean,
  cov01CoveragePct,
  gate01,
} = {}) {
  const checks = {
    identityLockHeld: { ok: identityLockHeld === true, state: identityLockHeld === true ? 'HELD' : 'MISSING_OR_WRONG' },
    allPhasesCompleted: { ok: allPhasesCompleted === true, state: allPhasesCompleted === true ? 'COMPLETE' : 'INCOMPLETE' },
    sidecarsClean: { ok: sidecarsClean === true, state: sidecarsClean === true ? 'CLEAN' : 'FAILED_OR_MISSING' },
    cov01Coverage: {
      ok: Number(cov01CoveragePct) >= 95,
      state: Number.isFinite(Number(cov01CoveragePct)) ? `${Number(cov01CoveragePct).toFixed(1)}%` : 'ABSENT',
      thresholdPct: 95,
    },
    gate01CapabilityProof: { ok: gate01?.ok === true, state: gate01?.state || 'ABSENT' },
  };
  return {
    ok: Object.values(checks).every((c) => c.ok),
    checks,
  };
}

export function analyzeAuthoritativeV8Read({
  samples = [],
  floors = [],
  warmupMin = 15,
  yKey = 'jsHeapUsedMB',
  validityInputs = {},
} = {}) {
  const tail = samples.filter((row) => Number(row.elapsedMin) >= warmupMin);
  const fit = ordinaryLeastSquares(tail, { xKey: 'elapsedMin', yKey });
  const noiseBandMB = consecutiveNoiseBandMB(tail, { yKey });
  const floorByLabel = new Map(floors.map((f) => [f.label, f]));
  const b = floorByLabel.get('B');
  const c = floorByLabel.get('C');
  const floorDeltaMB = Number.isFinite(Number(b?.[yKey])) && Number.isFinite(Number(c?.[yKey]))
    ? +(Number(c[yKey]) - Number(b[yKey])).toFixed(3)
    : null;
  const floorDeltaState = floorDeltaMB == null
    ? 'MISSING_B_OR_C'
    : Math.abs(floorDeltaMB) <= noiseBandMB
      ? 'INSIDE_NOISE_BAND'
      : 'OUTSIDE_NOISE_BAND';
  const validity = evaluateValidityChecklist(validityInputs);
  const shape = !fit.ok || floorDeltaMB == null
    ? 'UNQUOTABLE'
    : floorDeltaState === 'INSIDE_NOISE_BAND'
      ? 'PLATEAU'
      : 'SLOPE';
  return {
    signature: V8_AUTHORITATIVE_ANALYSIS_SIGNATURE,
    warmup: { warmupMin, excludedSamples: samples.length - tail.length, tailSamples: tail.length },
    fit,
    noiseBandMB,
    floorDeltaBCMB: floorDeltaMB,
    floorDeltaState,
    validity,
    shape,
    quotable: validity.ok && fit.ok && floorDeltaMB != null,
    verdictLine: buildVerdictLine({ shape, fit, floorDeltaMB, floorDeltaState, noiseBandMB, validity }),
  };
}

export function buildVerdictLine({
  shape,
  fit,
  floorDeltaMB,
  floorDeltaState,
  noiseBandMB,
  validity,
}) {
  const quote = validity?.ok ? 'QUOTABLE' : 'NOT_QUOTABLE';
  if (!fit?.ok || floorDeltaMB == null) {
    return `V8-AUTHORITATIVE-READ ${quote}: insufficient settled tail or B/C floors; validity=${validity?.ok ? 'PASS' : 'FAIL'}`;
  }
  if (shape === 'PLATEAU') {
    return `V8-AUTHORITATIVE-READ ${quote}: plateau; B-C floor delta ${floorDeltaMB} MB is ${floorDeltaState} (noise band ±${noiseBandMB} MB); tail slope ${fit.slopeMBPerHour} MB/h CI95 [${fit.slopeCi95MBPerHour.join(', ')}]`;
  }
  return `V8-AUTHORITATIVE-READ ${quote}: slope ${fit.slopeMBPerHour} MB/h CI95 [${fit.slopeCi95MBPerHour.join(', ')}]; B-C floor delta ${floorDeltaMB} MB is ${floorDeltaState} (noise band ±${noiseBandMB} MB)`;
}

export function runGate01CapabilityProof() {
  const plateauSamples = Array.from({ length: 30 }, (_, i) => ({
    elapsedMin: i * 3,
    jsHeapUsedMB: i < 5 ? 50 + i : 55 + ((i % 3) - 1) * 0.15,
  }));
  const slopeSamples = Array.from({ length: 30 }, (_, i) => ({
    elapsedMin: i * 3,
    jsHeapUsedMB: 40 + i * 0.8,
  }));
  const valid = {
    identityLockHeld: true,
    allPhasesCompleted: true,
    sidecarsClean: true,
    cov01CoveragePct: 97,
    gate01: { ok: true, state: 'SELF' },
  };
  const plateau = analyzeAuthoritativeV8Read({
    samples: plateauSamples,
    floors: [{ label: 'A', jsHeapUsedMB: 50 }, { label: 'B', jsHeapUsedMB: 55.1 }, { label: 'C', jsHeapUsedMB: 55.2 }],
    validityInputs: valid,
  });
  const slope = analyzeAuthoritativeV8Read({
    samples: slopeSamples,
    floors: [{ label: 'A', jsHeapUsedMB: 40 }, { label: 'B', jsHeapUsedMB: 52 }, { label: 'C', jsHeapUsedMB: 64 }],
    validityInputs: valid,
  });
  const dirty = analyzeAuthoritativeV8Read({
    samples: slopeSamples,
    floors: [{ label: 'A', jsHeapUsedMB: 40 }, { label: 'B', jsHeapUsedMB: 52 }, { label: 'C', jsHeapUsedMB: 64 }],
    validityInputs: { ...valid, cov01CoveragePct: 80 },
  });
  const ok = plateau.shape === 'PLATEAU'
    && slope.shape === 'SLOPE'
    && slope.quotable === true
    && dirty.quotable === false;
  return {
    signature: 'V8_AUTHORITATIVE_GATE_01_V1',
    ok,
    state: ok ? 'GREEN' : 'RED',
    cells: {
      plateau: { shape: plateau.shape, quotable: plateau.quotable },
      slope: { shape: slope.shape, quotable: slope.quotable, slopeMBPerHour: slope.fit.slopeMBPerHour },
      dirty: { shape: dirty.shape, quotable: dirty.quotable, validity: dirty.validity },
    },
  };
}
