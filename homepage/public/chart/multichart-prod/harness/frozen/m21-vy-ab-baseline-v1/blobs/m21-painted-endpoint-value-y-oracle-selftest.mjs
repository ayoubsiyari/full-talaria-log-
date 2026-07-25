/**
 * M21 VALUE/Y oracle — perturbation / self-test (no browser, no product edits).
 *
 * STATUS: PRELIMINARY-PENDING-GPT56-INDEPENDENT-VERIFY
 * Does NOT accept RED. Does NOT claim GREEN. Pure math + pairing honesty checks.
 *
 * Cases:
 *   1) zero-perturb → pairing clean (‖ΔY‖≈0)
 *   2) known Y shift → sortY pairing detects stale above maxYPx
 *   3) nearest-to-expected pairing can hide lag (anti-pattern documented)
 *   4) TEMA + five-MA tip recomputation sanity on synthetic bars
 *
 * Usage:
 *   node m21-painted-endpoint-value-y-oracle-selftest.mjs
 *   M21_VY_SELFTEST_OUT=docs/plan3/evidence/W5-M21-VY-ORACLE-SELFTEST.PRELIMINARY.json \
 *     node m21-painted-endpoint-value-y-oracle-selftest.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATUS = 'PRELIMINARY-PENDING-GPT56/AUTH';
const MAX_Y_PX = 2.5;
const PRIMARY_TYPES = ['sma', 'ema', 'wma', 'dema', 'tema'];
const PRIMARY_TYPE = (() => {
  const raw = String(process.env.M21_VY_PRIMARY_TYPE || 'tema').trim().toLowerCase();
  if (!PRIMARY_TYPES.includes(raw)) {
    throw new Error(`M21_VY_PRIMARY_TYPE must be one of ${PRIMARY_TYPES.join(',')}`);
  }
  return raw;
})();

function computeExpectedTips(bars, formingClose, period = 20) {
  const n = bars.length;
  if (n < period) return null;
  const closes = new Array(n);
  for (let i = 0; i < n; i++) {
    let c = Number(bars[i]?.c);
    if (i === n - 1 && Number.isFinite(formingClose)) c = formingClose;
    closes[i] = Number.isFinite(c) ? c : null;
  }
  const sma = new Array(n).fill(null);
  let sum = 0;
  let valid = 0;
  for (let i = 0; i < n; i++) {
    const v = closes[i];
    if (v != null) { sum += v; valid += 1; }
    if (i >= period) {
      const old = closes[i - period];
      if (old != null) { sum -= old; valid -= 1; }
    }
    if (i >= period - 1 && valid === period) sma[i] = sum / period;
  }
  const emaSeries = (src) => {
    const out = new Array(n).fill(null);
    const k = 2 / (period + 1);
    let prev = null;
    let seedSum = 0;
    let seedCount = 0;
    for (let i = 0; i < n; i++) {
      const v = src[i];
      if (v == null || !Number.isFinite(v)) continue;
      if (prev == null) {
        seedSum += v;
        seedCount += 1;
        if (seedCount === period) {
          prev = seedSum / period;
          out[i] = prev;
        }
      } else {
        prev = (v - prev) * k + prev;
        out[i] = prev;
      }
    }
    return out;
  };
  const ema1 = emaSeries(closes);
  const wma = new Array(n).fill(null);
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < n; i++) {
    let wsum = 0;
    let ok = true;
    for (let j = 0; j < period; j++) {
      const v = closes[i - j];
      if (v == null) { ok = false; break; }
      wsum += v * (period - j);
    }
    if (ok) wma[i] = wsum / denom;
  }
  const pseudoFrom = (series) => series.map((v, i) => (
    (v != null && Number.isFinite(v)) ? v : closes[i]
  ));
  const ema2 = emaSeries(pseudoFrom(ema1));
  const dema = ema1.map((e1, i) => {
    const e2 = ema2[i];
    if (e1 == null || e2 == null) return null;
    return 2 * e1 - e2;
  });
  const ema3 = emaSeries(pseudoFrom(ema2));
  const tema = ema1.map((a, i) => {
    const b = ema2[i];
    const c = ema3[i];
    if (a == null || b == null || c == null) return null;
    return 3 * a - 3 * b + c;
  });
  const tipOf = (arr) => {
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i] != null && Number.isFinite(arr[i])) return { idx: i, val: arr[i] };
    }
    return { idx: -1, val: null };
  };
  return {
    sma: tipOf(sma),
    ema: tipOf(ema1),
    wma: tipOf(wma),
    dema: tipOf(dema),
    tema: tipOf(tema),
  };
}

/** Linear yScale stand-in: y = offset - value * scale */
function makeYScale(offset, scale) {
  const fn = (v) => offset - Number(v) * scale;
  fn.invert = (y) => (offset - Number(y)) / scale;
  return fn;
}

function pairSortY(strokes, expectedList) {
  const near = strokes.slice().sort((a, b) => a.y - b.y);
  const exp = expectedList.slice().sort((a, b) => a.expY - b.expY);
  const out = {};
  const n = Math.min(near.length, exp.length);
  for (let i = 0; i < exp.length; i++) {
    const { t, tip, expY } = exp[i];
    const best = i < n ? near[i] : null;
    const absYPx = best ? Math.abs(best.y - expY) : null;
    out[t] = {
      drawnY: best?.y ?? null,
      expectedY: expY,
      expectedVal: tip.val,
      absYPx,
      valueStale: absYPx != null && absYPx > MAX_Y_PX,
    };
  }
  return out;
}

function pairNearestExpected(strokes, expectedList) {
  const out = {};
  for (const { t, tip, expY } of expectedList) {
    let best = null;
    let bestD = Infinity;
    for (const s of strokes) {
      const d = Math.abs(s.y - expY);
      if (d < bestD) { bestD = d; best = s; }
    }
    const absYPx = best ? Math.abs(best.y - expY) : null;
    out[t] = {
      drawnY: best?.y ?? null,
      expectedY: expY,
      expectedVal: tip.val,
      absYPx,
      valueStale: absYPx != null && absYPx > MAX_Y_PX,
    };
  }
  return out;
}

function synthBars(n = 80, base = 100) {
  const bars = [];
  let c = base;
  for (let i = 0; i < n; i++) {
    c += Math.sin(i / 7) * 0.4 + (i % 5 === 0 ? 0.15 : -0.05);
    bars.push({ t: i * 60_000, o: c - 0.1, h: c + 0.2, l: c - 0.2, c });
  }
  return bars;
}

function buildExpectedList(tips, yScale) {
  const list = [];
  for (const t of ['sma', 'ema', 'wma', 'dema', 'tema']) {
    const tip = tips[t];
    if (!tip || tip.val == null) continue;
    list.push({ t, tip, expY: yScale(tip.val) });
  }
  return list;
}

function strokesFromExpected(expectedList, yShift = 0) {
  return expectedList.map(({ expY }) => ({
    x: 400,
    y: expY + yShift,
  }));
}

const cases = [];
function record(id, pass, detail) {
  cases.push({ id, pass: !!pass, ...detail });
}

// --- Case 1: tip recomputation sanity ---
{
  const bars = synthBars(80, 120);
  const forming = bars[bars.length - 1].c + 0.5;
  const tips = computeExpectedTips(bars, forming, 20);
  const typesOk = ['sma', 'ema', 'wma', 'dema', 'tema']
    .every((t) => tips && tips[t]?.val != null && tips[t].idx >= 0);
  const temaMoves = tips.tema.val !== computeExpectedTips(bars, bars[bars.length - 1].c, 20).tema.val;
  record('five-ma-tips-present', typesOk, {
    tips: Object.fromEntries(
      ['sma', 'ema', 'wma', 'dema', 'tema'].map((t) => [t, tips?.[t]?.val ?? null]),
    ),
    formingClosePerturbsTema: temaMoves,
  });
}

// --- Case 2: zero perturb → clean under sortY ---
{
  const bars = synthBars(90, 110);
  const tips = computeExpectedTips(bars, bars[bars.length - 1].c, 20);
  const yScale = makeYScale(500, 2);
  const expectedList = buildExpectedList(tips, yScale);
  const strokes = strokesFromExpected(expectedList, 0);
  const paired = pairSortY(strokes, expectedList);
  const maxY = Math.max(...Object.values(paired).map((p) => p.absYPx ?? 0));
  const anyStale = Object.values(paired).some((p) => p.valueStale);
  record('zero-perturb-sortY-clean', maxY <= 1e-9 && !anyStale, {
    maxAbsYPx: maxY,
    perType: paired,
  });
}

// --- Case 3: +6px uniform lag → sortY detects RED ---
{
  const bars = synthBars(90, 110);
  const tips = computeExpectedTips(bars, bars[bars.length - 1].c + 0.3, 20);
  const yScale = makeYScale(500, 2);
  const expectedList = buildExpectedList(tips, yScale);
  const SHIFT = 6.0;
  const strokes = strokesFromExpected(expectedList, SHIFT);
  const paired = pairSortY(strokes, expectedList);
  const temaStale = paired.tema?.valueStale === true;
  const maxY = Math.max(...Object.values(paired).map((p) => p.absYPx ?? 0));
  record('uniform-lag-6px-sortY-detects', temaStale && maxY >= SHIFT - 1e-9, {
    shiftPx: SHIFT,
    maxAbsYPx: maxY,
    tema: paired.tema,
    threshold: MAX_Y_PX,
  });
}

// --- Case 4: nearest-to-expected can hide cross-type lag ---
{
  // TEMA stroke lagged +8px; decoy sits exactly on expected TEMA Y.
  // sortY pairs ordered tips → TEMA keeps the +8 stale stroke.
  // nearest-to-expected prefers the decoy → false clean.
  const bars = synthBars(90, 105);
  const tips = computeExpectedTips(bars, bars[bars.length - 1].c, 20);
  const yScale = makeYScale(500, 2);
  const expectedList = buildExpectedList(tips, yScale);
  const sortedExp = expectedList.slice().sort((a, b) => a.expY - b.expY);
  const temaExp = expectedList.find((e) => e.t === 'tema');
  const strokesB = sortedExp.map((e) => ({
    x: 400,
    y: e.t === 'tema' ? e.expY + 8 : e.expY,
  }));
  const sortB = pairSortY(strokesB, expectedList);
  const nearB = pairNearestExpected(
    [...strokesB, { x: 400, y: temaExp.expY }],
    expectedList,
  );
  const sortDetects = sortB.tema?.valueStale === true;
  const nearestHides = nearB.tema?.valueStale === false && (nearB.tema?.absYPx ?? 99) <= MAX_Y_PX;
  record('nearest-to-expected-can-hide-tema-lag', sortDetects && nearestHides, {
    sortY: sortB.tema,
    nearestWithDecoy: nearB.tema,
    note: 'Decoy at expected TEMA Y lets nearest-match report clean; sortY keeps +8 stale.',
  });
}

// --- Case 5: formingClose must move TEMA tip vs closed bar ---
{
  const bars = synthBars(60, 99);
  const closed = bars[bars.length - 1].c;
  const a = computeExpectedTips(bars, closed, 20);
  const b = computeExpectedTips(bars, closed + 2.5, 20);
  record('formingClose-moves-tema', a.tema.val !== b.tema.val, {
    closedTema: a.tema.val,
    formingTema: b.tema.val,
    delta: (b.tema.val ?? 0) - (a.tema.val ?? 0),
  });
}

// --- Case 6: configurable primary target (PO override) ---
{
  const bars = synthBars(80, 101);
  const tips = computeExpectedTips(bars, bars[bars.length - 1].c + 0.4, 20);
  const yScale = makeYScale(400, 3);
  const expectedList = buildExpectedList(tips, yScale);
  const SHIFT = 7;
  const strokes = strokesFromExpected(expectedList, SHIFT);
  const paired = pairSortY(strokes, expectedList);
  const primaryStale = paired[PRIMARY_TYPE]?.valueStale === true;
  const allTypesPresent = PRIMARY_TYPES.every((t) => tips[t]?.val != null);
  record('configurable-primary-detects-uniform-lag', primaryStale && allTypesPresent, {
    primaryType: PRIMARY_TYPE,
    primary: paired[PRIMARY_TYPE],
    note: 'Default provisional primary=tema; override via M21_VY_PRIMARY_TYPE.',
  });
}

// --- Case 7: density class separates scheduling jitter from match failure ---
{
  const classify = (diag) => {
    const attempted = diag.attemptedCount || 0;
    const matched = diag.matchedCount || 0;
    const coverage = attempted > 0 ? matched / attempted : 0;
    const minEvaluated = 60;
    if (matched >= minEvaluated && coverage >= 0.5) return 'DENSITY-OK';
    if (coverage >= 0.85 && matched < minEvaluated && attempted >= 42) {
      return 'PROBE-SCHEDULING-CAPTURE-JITTER';
    }
    if (coverage < 0.5) return 'ORACLE-MATCH-REJECTION';
    return 'OTHER';
  };
  // Prior matrix 60x-run3 shape: ~56 matched with high coverage ⇒ jitter, not match fail.
  const priorShort = classify({ attemptedCount: 62, matchedCount: 56 });
  const matchFail = classify({ attemptedCount: 80, matchedCount: 20 });
  const ok = classify({ attemptedCount: 84, matchedCount: 84 });
  record('density-class-separates-jitter-from-match-fail',
    priorShort === 'PROBE-SCHEDULING-CAPTURE-JITTER'
    && matchFail === 'ORACLE-MATCH-REJECTION'
    && ok === 'DENSITY-OK', {
      priorMatrix60run3Shape: priorShort,
      lowCoverageShape: matchFail,
      healthyShape: ok,
    });
}

const passCount = cases.filter((c) => c.pass).length;
const result = {
  ticket: 'M21-PAINTED-ENDPOINT-VALUE-Y-ORACLE-SELFTEST',
  status: STATUS,
  phase: 'PREPARATION-SELFTEST',
  noGreenClaim: true,
  noAcceptedRedClaim: true,
  noProductEdits: true,
  primaryType: PRIMARY_TYPE,
  maxYPx: MAX_Y_PX,
  cases,
  passCount,
  caseCount: cases.length,
  allPass: passCount === cases.length,
  verdict: passCount === cases.length
    ? 'M21-VY-ORACLE-SELFTEST-PASS-PRELIMINARY'
    : 'M21-VY-ORACLE-SELFTEST-FAIL-PRELIMINARY',
  pass: false, // never acceptance GREEN
  note: 'Self-test honesty only. Does not accept product RED or authorize b62. PENDING-GPT56/AUTH.',
  signature: 'W5 — PRELIMINARY-PENDING-GPT56/AUTH',
};

const outPath = process.env.M21_VY_SELFTEST_OUT
  ? path.resolve(process.env.M21_VY_SELFTEST_OUT)
  : path.resolve(__dirname, '../../../../docs/plan3/evidence/W5-M21-VY-ORACLE-SELFTEST.PRELIMINARY.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exitCode = result.allPass ? 0 : 1;
