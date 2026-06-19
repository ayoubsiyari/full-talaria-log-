/** Score engine for TalariaV16 handoff preview (imported by TalariaV16.jsx). */

export const DIM_KEYS = [
  "profitability",
  "edge",
  "risk",
  "consistency",
  "frequency",
  "discipline",
];

export const SCORE_CONFIG = {
  minSampleForScore: 20,
  minSampleForVariance: 30,
  edgeReproveN: 30,
  tiers: [
    [60, "DEVELOPING"],
    [70, "SOLID"],
    [80, "STRONG"],
    [90, "ELITE"],
  ],
  weights: {
    profitability: { strat: 0.22, exec: 0.15 },
    edge: { strat: 0.18, exec: 0.2 },
    risk: { strat: 0.18, exec: 0.18 },
    consistency: { strat: 0.15, exec: 0.12 },
    frequency: { strat: 0.1, exec: 0.15 },
    discipline: { strat: 0.17, exec: 0.2 },
  },
};

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

function dimProfitability(ctx) {
  if (ctx.tradingMode === "prop" && ctx.propTargetPct != null) {
    return clamp(((ctx.returnPct || 0) / Math.max(1, ctx.propTargetPct)) * 100);
  }
  const pf = Math.min(3, Math.max(0, Number(ctx.profitFactor) || 0));
  const ret = Number(ctx.returnPct) || 0;
  return clamp((pf / 3) * 55 + clamp(((ret + 8) / 28) * 45));
}

function dimEdge(ctx) {
  const pf = clamp((Math.min(2.5, Math.max(0, Number(ctx.profitFactor) || 0)) / 2.5) * 50);
  const exp = clamp((((Number(ctx.expectancyR) || 0) + 0.5) / 2) * 50);
  return clamp(pf * 0.55 + exp * 0.45);
}

function dimRisk(ctx) {
  const mdd = Math.abs(Number(ctx.maxDrawdownPct) || 0);
  const sort = Number(ctx.sortino) || 0;
  return clamp(100 - mdd * 4 + sort * 6);
}

function dimConsistency(ctx) {
  if ((ctx.n || 0) < SCORE_CONFIG.minSampleForVariance) return null;
  const r2 = (Number(ctx.equityR2) || 0) * 100;
  const dayWr = Number(ctx.dayWinRate ?? ctx.winRate) || 50;
  const cv =
    ctx.dailyReturnCV != null ? clamp(100 - Math.abs(Number(ctx.dailyReturnCV)) * 20) : 50;
  return clamp(r2 * 0.4 + dayWr * 0.35 + cv * 0.25);
}

function dimFrequency(ctx) {
  if (ctx.mode === "live") {
    const ratio =
      (Number(ctx.actualTradesPerWeek) || 0) /
      Math.max(1, Number(ctx.expectedTradesPerWeek) || 1);
    return clamp(100 - Math.abs(ratio - 1) * 40);
  }
  return clamp(((ctx.n || 0) / SCORE_CONFIG.minSampleForScore) * 100);
}

function dimDiscipline(ctx) {
  if (ctx.mode === "backtest" && !ctx.replayTracksRules) return null;
  const rule = ctx.ruleAdherencePct;
  const exec = ctx.executionEfficiency;
  if (rule == null && exec == null) return null;
  return clamp((Number(rule ?? 50)) * 0.55 + (Number(exec ?? 0.5)) * 100 * 0.45);
}

function weightedComposite(dims, dimStates, weights, profile) {
  let sum = 0;
  let wSum = 0;
  for (const key of DIM_KEYS) {
    if (dimStates[key] === "unavailable" || dims[key] == null) continue;
    const w = weights[key]?.[profile] || 0;
    sum += dims[key] * w;
    wSum += w;
  }
  return wSum > 0 ? sum / wSum : null;
}

function buildDims(ctx) {
  return {
    profitability: dimProfitability(ctx),
    edge: dimEdge(ctx),
    risk: dimRisk(ctx),
    consistency: dimConsistency(ctx),
    frequency: dimFrequency(ctx),
    discipline: dimDiscipline(ctx),
  };
}

function buildDimStates(ctx, dims) {
  const n = ctx.n || 0;
  const isLive = ctx.mode === "live";
  const states = {};
  for (const key of DIM_KEYS) {
    if (n < SCORE_CONFIG.minSampleForScore) states[key] = "unavailable";
    else if (isLive && key === "edge" && (ctx.liveSampleN || 0) < SCORE_CONFIG.edgeReproveN) {
      states[key] = "inherited";
    } else if (dims[key] == null) states[key] = "unavailable";
    else states[key] = "active";
  }
  return states;
}

export function computeTalariaScore(ctx) {
  const n = ctx.n || 0;
  const isLive = ctx.mode === "live";
  const dims = buildDims(ctx);
  const dimStates = buildDimStates(ctx, dims);

  let strat = weightedComposite(dims, dimStates, SCORE_CONFIG.weights, "strat");
  let exec = isLive ? weightedComposite(dims, dimStates, SCORE_CONFIG.weights, "exec") : null;

  if (isLive && ctx.inheritedStratScore != null) {
    strat = Number(ctx.inheritedStratScore);
  }

  const stratState =
    n < SCORE_CONFIG.minSampleForScore
      ? "unavailable"
      : isLive && ctx.inheritedStratScore != null
        ? "inherited"
        : "active";
  const execState = !isLive ? "unavailable" : n < SCORE_CONFIG.minSampleForScore ? "unavailable" : "active";
  const primary = isLive ? "exec" : "strat";

  const deltas = { dims: {}, strat: null, exec: null };
  if (ctx.prior) {
    const prior = computeTalariaScore({ ...ctx, prior: null, inheritedStratScore: null });
    for (const key of DIM_KEYS) {
      if (dims[key] != null && prior.dims?.[key] != null) {
        deltas.dims[key] = dims[key] - prior.dims[key];
      }
    }
    if (strat != null && prior.strat != null) deltas.strat = strat - prior.strat;
    if (exec != null && prior.exec != null) deltas.exec = exec - prior.exec;
  }

  return { strat, exec, stratState, execState, primary, dims, dimStates, deltas };
}

export function computeTrend(trades, ctx, points = 30) {
  const rows = Array.isArray(trades) ? trades : [];
  if (rows.length < SCORE_CONFIG.minSampleForScore) return [];

  const out = [];
  const minWindow = SCORE_CONFIG.minSampleForScore;
  const step = Math.max(1, Math.floor((rows.length - minWindow) / Math.max(1, points - 1)));

  for (let end = minWindow; end <= rows.length; end += step) {
    const partial = { ...ctx, n: end };
    const score = computeTalariaScore(partial);
    const headline = partial.mode === "live" ? score.exec : score.strat;
    out.push({ score: headline, index: end });
  }

  if (!out.length) {
    const score = computeTalariaScore(ctx);
    out.push({ score: ctx.mode === "live" ? score.exec : score.strat, index: rows.length });
  }

  return out;
}
