/** Snapshot insight signals from filtered dashboard metrics (no external deps). */

const slug = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const linkForTitle = (title) => {
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

function edgeCandidates(metrics) {
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

function flagCandidates(metrics) {
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
  const rows = [...edgeCandidates(m), ...flagCandidates(m)];
  const seen = new Set();
  return rows
    .map((row, index) => {
      const label = String(row.title || row.detail || "Insight").replace(/:$/, "").trim();
      const id = slug(label) || `insight-${index}`;
      if (seen.has(id)) return null;
      seen.add(id);
      return {
        id,
        label,
        direction: row.tone === "strength" ? "strength" : "weakness",
        linkTarget: linkForTitle(row.title || label),
        metricValue: row.metricValue || null,
        impactUSD: row.impactUSD ?? null,
        impactR: row.impactR ?? (Number.isFinite(row.impact) ? row.impact : null),
        detail: row.detail || "",
      };
    })
    .filter(Boolean)
    .slice(0, 8);
}
