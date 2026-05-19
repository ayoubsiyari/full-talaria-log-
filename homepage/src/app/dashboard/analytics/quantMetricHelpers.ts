/** Helpers for Quant KPI strip + Talaria score (0–100). */

import type { OsMetricCard } from "./backtestOsTypes";

export type QuantKpiViz = "sparkline" | "bars" | "progress" | "ring";

export type QuantKpiItem = {
  label: string;
  value: string;
  tone?: "pos" | "neg" | "warn" | "neutral";
  viz?: QuantKpiViz;
  /** Raw series for sparkline / bars (auto-normalized). */
  vizSeries?: number[];
  /** 0–100 for progress / ring. */
  progress?: number;
};

export type TalariaScoreBreakdown = {
  overall: number;
  overallLabel: string;
  profitability: number;
  risk: number;
  consistency: number;
  discipline: number;
};

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

function parseNum(s: string): number | null {
  const t = s.replace(/[^0-9.\-+%]/g, "").replace("%", "");
  if (!t || t === "—" || t === "-") return null;
  const v = Number.parseFloat(t);
  return Number.isFinite(v) ? v : null;
}

export function computeTalariaScores(input: {
  sharpe?: number | null;
  sortino?: number | null;
  winRate: number;
  profitFactor: number;
  maxDrawdownPct?: number | null;
  netReturnPct?: number | null;
  payoffRatio?: number | null;
}): TalariaScoreBreakdown {
  const wr = clamp(input.winRate <= 1 ? input.winRate * 100 : input.winRate);
  const pf = input.profitFactor;
  const profitability = clamp(wr * 0.45 + clamp((pf / 2.5) * 100, 0, 100) * 0.55);

  const mdd = input.maxDrawdownPct != null ? Math.abs(input.maxDrawdownPct) : 25;
  const sort = input.sortino ?? input.sharpe ?? 0;
  const risk = clamp(100 - mdd * 1.8 + sort * 8);

  const sh = input.sharpe ?? 0;
  const ret = input.netReturnPct ?? 0;
  const consistency = clamp(50 + sh * 18 + ret * 0.35);

  const pay = input.payoffRatio ?? 1;
  const discipline = clamp(40 + Math.min(pay, 2.5) * 22 + (wr > 45 ? 15 : 0));

  const overall = Math.round((profitability + risk + consistency + discipline) / 4);
  let overallLabel = "DEVELOPING";
  if (overall >= 80) overallLabel = "STRONG";
  else if (overall >= 65) overallLabel = "SOLID";
  else if (overall >= 50) overallLabel = "BALANCED";

  return {
    overall,
    overallLabel,
    profitability: Math.round(profitability),
    risk: Math.round(risk),
    consistency: Math.round(consistency),
    discipline: Math.round(discipline),
  };
}

export function overallLabelForScore(score: number): string {
  if (score >= 80) return "STRONG";
  if (score >= 65) return "SOLID";
  if (score >= 50) return "BALANCED";
  return "DEVELOPING";
}

/** Build ~10 KPI strip items from session metrics + chart series. */
export function buildQuantKpiStrip(input: {
  sharpe?: number | null;
  sortino?: number | null;
  winRate: number;
  profitFactor: number;
  maxDrawdownPct?: number | null;
  totalReturnPct?: string;
  expectancy?: string;
  omega?: string;
  calmar?: string;
  equitySeries?: number[];
  drawdownSeries?: number[];
  monthlyPctSeries?: number[];
}): QuantKpiItem[] {
  const eq = input.equitySeries?.filter((x) => Number.isFinite(x)) ?? [];
  const dd = input.drawdownSeries?.filter((x) => Number.isFinite(x)) ?? [];
  const mo = input.monthlyPctSeries?.filter((x) => Number.isFinite(x)) ?? [];

  const sharpeStr =
    input.sharpe != null && Number.isFinite(input.sharpe) ? input.sharpe.toFixed(2) : "—";
  const sortinoStr =
    input.sortino != null && Number.isFinite(input.sortino) ? input.sortino.toFixed(2) : "—";
  const wrPct = input.winRate <= 1 ? (input.winRate * 100).toFixed(1) + "%" : input.winRate.toFixed(1) + "%";
  const mddRaw = input.maxDrawdownPct != null && Number.isFinite(input.maxDrawdownPct) ? Math.abs(input.maxDrawdownPct) : null;
  const mddPct = mddRaw != null ? (mddRaw <= 1 ? mddRaw * 100 : mddRaw) : null;
  const mdd = mddPct != null ? mddPct.toFixed(1) + "%" : "—";

  const sharpeProg = input.sharpe != null ? clamp(input.sharpe * 33 + 50) : 0;
  const sortinoProg = input.sortino != null ? clamp(input.sortino * 33 + 50) : 0;
  const wrProg = clamp(input.winRate <= 1 ? input.winRate * 100 : input.winRate);
  const pfProg = clamp((input.profitFactor / 3) * 100);
  const mddProg = mddPct != null ? clamp(100 - mddPct) : 0;

  return [
    {
      label: "Sharpe",
      value: sharpeStr,
      tone: input.sharpe != null && input.sharpe >= 1 ? "pos" : "neutral",
      viz: "sparkline",
      vizSeries: eq.length >= 4 ? eq : mo,
      progress: sharpeProg,
    },
    {
      label: "Sortino",
      value: sortinoStr,
      tone: input.sortino != null && input.sortino >= 1 ? "pos" : "neutral",
      viz: "sparkline",
      vizSeries: eq.length >= 4 ? eq.slice(-12) : mo,
      progress: sortinoProg,
    },
    {
      label: "Win rate",
      value: wrPct,
      tone: wrProg >= 50 ? "pos" : "neg",
      viz: "progress",
      progress: wrProg,
    },
    {
      label: "Profit factor",
      value: input.profitFactor.toFixed(2),
      tone: input.profitFactor >= 1 ? "pos" : "neg",
      viz: "ring",
      progress: pfProg,
    },
    {
      label: "Max drawdown",
      value: mdd,
      tone: "neg",
      viz: "bars",
      vizSeries: dd.length ? dd : eq.map((_, i, a) => (i ? Math.min(0, a[i]! - a[i - 1]!) : 0)),
    },
    {
      label: "Calmar",
      value: input.calmar ?? "—",
      tone: parseNum(input.calmar ?? "") != null && (parseNum(input.calmar ?? "") ?? 0) >= 1 ? "pos" : "neutral",
      viz: "progress",
      progress: parseNum(input.calmar ?? "") != null ? clamp((parseNum(input.calmar ?? "") ?? 0) * 40) : 0,
    },
    {
      label: "Total return",
      value: input.totalReturnPct ?? "—",
      tone: parseNum(input.totalReturnPct ?? "") != null && (parseNum(input.totalReturnPct ?? "") ?? 0) >= 0 ? "pos" : "neg",
      viz: "sparkline",
      vizSeries: eq,
    },
    {
      label: "Expectancy",
      value: input.expectancy ?? "—",
      tone: parseNum(input.expectancy ?? "") != null && (parseNum(input.expectancy ?? "") ?? 0) >= 0 ? "pos" : "neg",
      viz: "bars",
      vizSeries: mo.length ? mo : eq.slice(-8),
    },
    {
      label: "Omega",
      value: input.omega ?? "—",
      tone: parseNum(input.omega ?? "") != null && (parseNum(input.omega ?? "") ?? 0) >= 1 ? "pos" : "neg",
      viz: "ring",
      progress: parseNum(input.omega ?? "") != null ? clamp((parseNum(input.omega ?? "") ?? 0) * 50) : 0,
    },
    {
      label: "Exposure",
      value: mddProg > 0 ? `${Math.round(100 - mddProg)}%` : "—",
      viz: "ring",
      progress: mddProg,
      tone: "warn",
    },
  ];
}

export function osMetricCardsToQuantKpi(cards: OsMetricCard[]): QuantKpiItem[] {
  return cards.map((c) => ({
    label: c.label,
    value: c.value,
    tone: c.tone ?? (c.value.startsWith("-") ? "neg" : "neutral"),
    viz: "progress" as const,
    progress: c.value === "—" ? 12 : c.tone === "pos" ? 72 : c.tone === "neg" ? 28 : 48,
  }));
}

export function normalizeSeries(data: number[]): number[] {
  if (!data.length) return [];
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  return data.map((v) => (v - min) / range);
}
