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

/** Snapshot insight signals from filtered dashboard metrics. */
const insightSlug = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const insightLinkForTitle = (title) => {
  const t = String(title || "");
  if (t.startsWith("Best/worst session")) return "calendar-time";
  if (t.startsWith("Day pattern")) return "breakdowns";
  if (t.startsWith("Tag signal")) return "patterns-behavior";
  if (t.includes("Two-loss")) return "streaks-consistency-risk-adjusted-metrics";
  if (t.includes("Long-hold")) return "trade-quality-analysis-mae-mfe";
  if (t.includes("expectancy")) return "performance";
  if (t.includes("drawdown")) return "drawdown";
  if (t.includes("Profit factor")) return "performance";
  if (t.includes("sample")) return "performance";
  return "overview";
};

function insightEdgeCandidates(metrics) {
  const minN = Math.min(20, Math.max(8, Math.floor((metrics?.tradeCount || 0) * 0.08)));
  const candidates = [];
  const baseline = Number(metrics?.avgR) || 0;
  const addTop = (rows, prefix) => {
    (Array.isArray(rows) ? rows : [])
      .filter((r) => (Number(r?.trades) || 0) >= minN)
      .slice(0, 3)
      .forEach((r) => {
        const impact = (Number(r.avgR) - baseline) * Number(r.trades);
        if (Math.abs(impact) >= 2 || Math.abs(Number(r.avgR) - baseline) > 0.35) {
          candidates.push({
            title: `${prefix} ${r.label}`,
            detail: `${r.label} averaged ${Number(r.avgR) >= 0 ? "+" : ""}${Number(r.avgR).toFixed(2)}R across ${r.trades} trades.`,
            impact,
            tone: Number(r.avgR) >= baseline ? "strength" : "weakness",
            metricValue: `${Number(r.avgR) >= 0 ? "+" : ""}${Number(r.avgR).toFixed(2)}R`,
            impactR: impact,
          });
        }
      });
  };
  addTop(metrics?.bySession, "Best/worst session:");
  addTop(metrics?.byWeekday, "Day pattern:");
  addTop(metrics?.byTag, "Tag signal:");
  const trades = Array.isArray(metrics?.trades) ? metrics.trades : [];
  const afterLoss = trades.filter((t, i) => i > 1 && trades[i - 1]?.pnl < 0 && trades[i - 2]?.pnl < 0);
  if (afterLoss.length >= minN) {
    const wins = (afterLoss.filter((t) => t.pnl > 0).length / afterLoss.length) * 100;
    const impact = Math.abs(wins - (Number(metrics?.winRate) || 0));
    candidates.push({
      title: "Two-loss reset risk",
      detail: `After two losses, win rate shifts to ${wins.toFixed(0)}%.`,
      impact,
      tone: wins >= (Number(metrics?.winRate) || 0) ? "strength" : "weakness",
      metricValue: `${wins.toFixed(0)}% win`,
      impactR: null,
    });
  }
  return candidates.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
}

function insightFlagCandidates(metrics) {
  const flags = [];
  if (Number(metrics?.expectancyR) < 0) {
    flags.push({
      title: "Negative expectancy",
      detail: "The strategy loses R over the sample.",
      tone: "weakness",
      metricValue: `${Number(metrics.expectancyR).toFixed(2)}R`,
      impactR: Number(metrics.expectancyR) * Number(metrics.tradeCount || 0),
    });
  }
  if (Number(metrics?.profitFactor) < 1) {
    flags.push({
      title: "Profit factor below 1.0",
      detail: "Losses exceed wins.",
      tone: "weakness",
      metricValue: Number(metrics.profitFactor).toFixed(2),
      impactR: null,
    });
  }
  if (Number(metrics?.tradeCount) < 30) {
    flags.push({
      title: "Small sample size",
      detail: "Use caution until this has at least 30 trades.",
      tone: "weakness",
      metricValue: `${metrics.tradeCount} trades`,
      impactR: null,
    });
  }
  if (Number(metrics?.maxDDPct) > 12) {
    flags.push({
      title: "High drawdown",
      detail: "Drawdown may be too large for prop-firm constraints.",
      tone: "weakness",
      metricValue: `${Number(metrics.maxDDPct).toFixed(1)}%`,
      impactUSD: -Math.abs(Number(metrics.maxDD) || 0),
      impactR: null,
    });
  }
  if (Number(metrics?.profitFactor) >= 1.5 && Number(metrics?.expectancyR) > 0) {
    flags.push({
      title: "Positive edge",
      detail: "Expectancy and profit factor support the current sample.",
      tone: "strength",
      metricValue: `${Number(metrics.expectancyR).toFixed(2)}R`,
      impactR: Number(metrics.expectancyR) * Number(metrics.tradeCount || 0),
    });
  }
  return flags;
}

export function buildInsightSignals({ metrics }) {
  const m = metrics || {};
  const rows = [...insightEdgeCandidates(m), ...insightFlagCandidates(m)];
  const seen = new Set();
  return rows
    .map((row, index) => {
      const label = String(row.title || row.detail || "Insight").replace(/:$/, "").trim();
      const id = insightSlug(label) || `insight-${index}`;
      if (seen.has(id)) return null;
      seen.add(id);
      return {
        id,
        label,
        direction: row.tone === "strength" ? "strength" : "weakness",
        linkTarget: insightLinkForTitle(row.title || label),
        metricValue: row.metricValue || null,
        impactUSD: row.impactUSD ?? null,
        impactR: row.impactR ?? (Number.isFinite(row.impact) ? row.impact : null),
        detail: row.detail || "",
      };
    })
    .filter(Boolean)
    .slice(0, 8);
}
