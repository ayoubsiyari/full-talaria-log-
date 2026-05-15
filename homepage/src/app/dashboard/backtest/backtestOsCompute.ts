/** Pure helpers for BacktestOS-style dashboard (journal / trade series). */

export function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function sampleStd(xs: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1);
  return Math.sqrt(Math.max(0, v));
}

export function skewness(xs: number[]): number | null {
  const n = xs.length;
  if (n < 3) return null;
  const m = mean(xs);
  const m2 = xs.reduce((a, x) => a + (x - m) ** 2, 0) / n;
  const m3 = xs.reduce((a, x) => a + (x - m) ** 3, 0) / n;
  const sd = Math.sqrt(m2);
  if (sd < 1e-12) return null;
  return m3 / sd ** 3;
}

export function kurtosisExcess(xs: number[]): number | null {
  const n = xs.length;
  if (n < 4) return null;
  const m = mean(xs);
  const m2 = xs.reduce((a, x) => a + (x - m) ** 2, 0) / n;
  const m4 = xs.reduce((a, x) => a + (x - m) ** 4, 0) / n;
  const v = m2;
  if (v < 1e-12) return null;
  return m4 / (v * v) - 3;
}

export function sorted(xs: number[]): number[] {
  return [...xs].sort((a, b) => a - b);
}

export function quantile(xsSorted: number[], q: number): number | null {
  if (!xsSorted.length) return null;
  const pos = (xsSorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (xsSorted[base + 1] === undefined) return xsSorted[base];
  return xsSorted[base] + rest * (xsSorted[base + 1] - xsSorted[base]);
}

export function varCvar95(pnls: number[]): { var95: number | null; cvar95: number | null } {
  if (pnls.length < 5) return { var95: null, cvar95: null };
  const s = sorted(pnls);
  const v = quantile(s, 0.05);
  if (v === null) return { var95: null, cvar95: null };
  const tail = pnls.filter((p) => p <= v);
  const cvar = tail.length ? mean(tail) : null;
  return { var95: v, cvar95: cvar };
}

export function maxConsecutiveStreaks(isWin: boolean[]): { maxWins: number; maxLosses: number } {
  let w = 0;
  let l = 0;
  let maxW = 0;
  let maxL = 0;
  for (const win of isWin) {
    if (win) {
      w += 1;
      l = 0;
      maxW = Math.max(maxW, w);
    } else {
      l += 1;
      w = 0;
      maxL = Math.max(maxL, l);
    }
  }
  return { maxWins: maxW, maxLosses: maxL };
}

function _makeRng(seed: number): () => number {
  let s = Math.floor(Math.abs(seed)) % 2147483646 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function monteCarloPercentiles(
  pnls: number[],
  nPaths: number,
  nSteps: number,
  seed = 1337
): { p5: number[]; p25: number[]; p50: number[]; p75: number[]; p95: number[]; labels: string[] } {
  const labels = Array.from({ length: nSteps + 1 }, (_, i) => String(i));
  if (!pnls.length || nSteps < 1) {
    return {
      p5: labels.map(() => 0),
      p25: labels.map(() => 0),
      p50: labels.map(() => 0),
      p75: labels.map(() => 0),
      p95: labels.map(() => 0),
      labels,
    };
  }
  const seedNum =
    seed ^
    Math.round(pnls.reduce((a, x) => a + x * 17, 0) * 1000) ^
    (pnls.length * 7919);
  const paths: number[][] = [];
  for (let p = 0; p < nPaths; p++) {
    const rnd = _makeRng(seedNum + p * 977);
    let cum = 0;
    const row = [cum];
    for (let i = 0; i < nSteps; i++) {
      cum += pnls[Math.floor(rnd() * pnls.length)]!;
      row.push(cum);
    }
    paths.push(row);
  }
  const pctAt = (q: number) => {
    const out: number[] = [];
    for (let i = 0; i <= nSteps; i++) {
      const col = paths.map((r) => r[i]!).sort((a, b) => a - b);
      out.push(quantile(col, q) ?? 0);
    }
    return out;
  };
  return {
    p5: pctAt(0.05),
    p25: pctAt(0.25),
    p50: pctAt(0.5),
    p75: pctAt(0.75),
    p95: pctAt(0.95),
    labels,
  };
}

export function durationBucketsHours(hours: number[]): number[] {
  const bins = [0, 0, 0, 0, 0, 0];
  for (const h of hours) {
    if (h <= 24) bins[0] += 1;
    else if (h <= 72) bins[1] += 1;
    else if (h <= 168) bins[2] += 1;
    else if (h <= 336) bins[3] += 1;
    else if (h <= 720) bins[4] += 1;
    else bins[5] += 1;
  }
  return bins;
}
