"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Space_Mono } from "next/font/google";
import { ArrowLeft, Filter } from "lucide-react";
import "./sessions-dashboard.css";
import "./backtest-os-dashboard.css";
import { BacktestOsDashboardLayout } from "./BacktestOsDashboardLayout";
import type { PriceBehaviorTrade } from "./priceBehaviorUtils";
import { PnlCalendarHeatmap } from "./PnlCalendarHeatmap";
import type { BacktestOsChartPack } from "./BacktestOsCharts";
import type { OsMetricCard } from "./backtestOsTypes";
import {
  durationBucketsHours,
  kurtosisExcess,
  maxConsecutiveStreaks,
  mean,
  monteCarloPercentiles,
  sampleStd,
  skewness,
  varCvar95,
} from "./backtestOsCompute";
import { buildQuantKpiStrip, computeTalariaScores } from "./quantMetricHelpers";
import {
  resolveSessionIdForUser,
  sessionMatchesStrategyFilter,
  tradeMatchesStrategyFilter,
  type DashboardStrategy,
  type Session,
} from "./sessionSelection";

export type { Session, DashboardStrategy };
export { readActiveTradingSessionIdFromBrowser, resolveSessionIdForUser } from "./sessionSelection";

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
});

/** Use when the static site and chart API are on different origins (set at build time). */
function chartApiUrl(path: string): string {
  const base = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_CHART_API_ORIGIN?.trim() : "";
  if (base && /^https?:\/\//i.test(base)) {
    const p = path.startsWith("/") ? path : `/${path}`;
    return `${base.replace(/\/$/, "")}${p}`;
  }
  return path;
}

type Trade = {
  tradeId?: number | string;
  id?: number | string;
  symbol?: string;
  ticker?: string;
  direction?: string;
  type?: string;
  netPnL?: number | string;
  realizedPnL?: number | string;
  pnl?: number | string;
  rMultiple?: number | string;
  mae_r?: number | string;
  mfe_r?: number | string;
  capture_ratio?: number | string;
  bar_high_r?: number[];
  bar_low_r?: number[];
  bar_close_r?: number[];
  post_exit_bar_high_r?: number[];
  post_exit_bar_low_r?: number[];
  post_exit_bar_close_r?: number[];
  rewardToRiskRatio?: number | string;
  quantity?: number | string;
  spread_pips_at_entry?: number | string;
  commission_at_entry?: number | string;
  pip_value_at_entry?: number | string;
  openTime?: number;
  entryTime?: number;
  closeType?: string;
  setup?: string;
  preTradeNotes?: { setup?: string; tags?: string };
  postTradeNotes?: { setup?: string; tags?: string };
  closeTime?: number;
  exitTime?: number;
  riskAmount?: number | string;
  originalRiskAmount?: number | string;
};

export async function fetchJson<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  const resolved = chartApiUrl(url);
  const res = await fetch(resolved, { credentials: "include", cache: "no-store", ...options });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    if (!res.ok) {
      throw new Error(`Request failed: ${res.status} (${resolved}) — response was not JSON`);
    }
    throw new Error(`Invalid JSON from ${resolved}: ${text.slice(0, 160)}`);
  }
  if (!res.ok) {
    const detail = (body as { detail?: string })?.detail;
    throw new Error(detail ?? `Request failed: ${res.status} (${resolved})`);
  }
  return body as T;
}

type WhatIfJobResponse = {
  job_id?: string;
  status?: string;
  result?: Record<string, unknown>;
  error?: string;
};

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

const WHATIF_POLL_DELAYS_MS = [300, 400, 500, 650, 800, 1000, 1200, 1500, 2000];
const WHATIF_MAX_POLL_ATTEMPTS = 200;

function isRetryableWhatIfError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("timed out") ||
    m.includes("not found") ||
    m.includes("job missing") ||
    m.includes("failed to fetch") ||
    m.includes("network")
  );
}

async function pollWhatIfJob(jobId: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < WHATIF_MAX_POLL_ATTEMPTS; attempt++) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    await sleep(WHATIF_POLL_DELAYS_MS[Math.min(attempt, WHATIF_POLL_DELAYS_MS.length - 1)], signal);
    const job = await fetchJson<WhatIfJobResponse>(
      `/api/analytics/backtest/whatif/jobs/${encodeURIComponent(jobId)}`,
      { signal }
    );
    if (job.status === "done" && job.result && typeof job.result === "object") {
      return job.result;
    }
    if (job.status === "failed") {
      throw new Error(job.error || "What-if analysis failed");
    }
  }
  throw new Error(
    "What-if analysis timed out — the server is still computing or the job expired. Try Retry."
  );
}

/** POST what-if (sync, cache hit, or 202 job); polls until done when async. */
export async function fetchBacktestWhatIf(
  payload: Record<string, unknown>,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const resolved = chartApiUrl("/api/analytics/backtest/whatif");
  let lastError: Error | null = null;

  for (let postTry = 0; postTry < 2; postTry++) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    try {
      const res = await fetch(resolved, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        signal,
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        if (!res.ok) {
          throw new Error(`Request failed: ${res.status} (${resolved}) — response was not JSON`);
        }
        throw new Error(`Invalid JSON from ${resolved}: ${text.slice(0, 160)}`);
      }

      if (res.status === 202) {
        const queued = body as WhatIfJobResponse;
        const jobId = queued?.job_id;
        if (!jobId) {
          throw new Error("What-if job missing job_id");
        }
        return await pollWhatIfJob(jobId, signal);
      }

      if (!res.ok) {
        const detail = (body as { detail?: string })?.detail;
        throw new Error(detail ?? `Request failed: ${res.status} (${resolved})`);
      }
      if (body && typeof body === "object" && !Array.isArray(body)) {
        return body as Record<string, unknown>;
      }
      throw new Error("Invalid what-if response");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        throw e;
      }
      lastError = e instanceof Error ? e : new Error(String(e));
      if (postTry === 0 && isRetryableWhatIfError(lastError.message)) {
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error("What-if analysis failed");
}

function n(v: unknown): number {
  const x = Number.parseFloat(String(v ?? 0));
  return Number.isFinite(x) ? x : 0;
}

function fmtMoney(v: number): string {
  return `$${v.toFixed(2)}`;
}

function fmtPct(v: number): string {
  return `${v.toFixed(1)}%`;
}

function fmtDaysFromHours(h: number | null | undefined): string {
  if (h == null || !Number.isFinite(h) || h < 0) return "—";
  return `${(h / 24).toFixed(1)} days`;
}

function holdHoursFromTrade(t: { openTs: number; closeTs: number }): number | null {
  const o = n(t.openTs);
  const c = n(t.closeTs);
  if (o <= 0 || c <= 0 || c < o) return null;
  if (o > 1e12 && c > 1e12) return (c - o) / 3600000;
  if (o > 1e9 && c > 1e9) return (c - o) / 3600;
  return null;
}

function yearlyRollupFromMonthly(monthlyRows: Array<{ x: string; y: number }>, sb: number | null): { best: string; worst: string } {
  const em = "—";
  if (sb == null || sb <= 0 || !monthlyRows.length) return { best: em, worst: em };
  const by: Record<string, number> = {};
  for (const r of monthlyRows) {
    const y = String(r.x).slice(0, 4);
    if (y.length < 4) continue;
    by[y] = (by[y] || 0) + n(r.y);
  }
  const keys = Object.keys(by).sort();
  if (!keys.length) return { best: em, worst: em };
  let bestK = keys[0]!;
  let worstK = keys[0]!;
  let bestV = by[bestK]!;
  let worstV = by[worstK]!;
  for (const k of keys) {
    const v = by[k]!;
    if (v > bestV) {
      bestV = v;
      bestK = k;
    }
    if (v < worstV) {
      worstV = v;
      worstK = k;
    }
  }
  const fmt = (k: string, v: number) => `${k} (${((v / sb) * 100).toFixed(1)}%)`;
  return { best: fmt(bestK, bestV), worst: fmt(worstK, worstV) };
}

function jarqueBeraApprox(sk: number | null, kt: number | null, sampleN: number): number | null {
  if (sk == null || kt == null || sampleN < 4) return null;
  return (sampleN / 6) * (sk * sk + (kt * kt) / 4);
}

function pValueRoughFromT(tAbs: number): string {
  if (!Number.isFinite(tAbs) || tAbs < 0) return "—";
  if (tAbs > 3.29) return "<0.001";
  if (tAbs > 2.58) return "<0.01";
  if (tAbs > 1.96) return "<0.05";
  if (tAbs > 1.65) return "<0.10";
  return "≥0.10";
}

function buildHistogram(values: number[], bucketSize = 0.5) {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return [];
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const start = Math.floor(min / bucketSize) * bucketSize;
  const end = Math.ceil(max / bucketSize) * bucketSize;
  const bins: { label: string; from: number; to: number; count: number }[] = [];
  for (let x = start; x < end; x += bucketSize) {
    bins.push({
      label: `${x.toFixed(1)} to ${(x + bucketSize).toFixed(1)}`,
      from: x,
      to: x + bucketSize,
      count: 0,
    });
  }
  clean.forEach((v) => {
    const idx = Math.min(Math.floor((v - start) / bucketSize), bins.length - 1);
    if (idx >= 0 && bins[idx]) bins[idx].count += 1;
  });
  return bins;
}

export type SessionAnalyticsPanelProps = {
  sessions: Session[];
  sessionId: string;
  onSessionIdChange: (id: string) => void;
  strategies?: DashboardStrategy[];
  strategyFilter?: string;
  onStrategyFilterChange?: (filter: string) => void;
  variant: "full" | "compact";
  /** Bumps when route/URL refresh — clears cached journal/analytics */
  dataReloadKey?: string;
  /** Shown in compact / compare column header */
  panelTitle?: string;
  /** Extra controls on the right of the toolbar (e.g. Compare button) */
  toolbarEnd?: React.ReactNode;
};

export function SessionAnalyticsPanel({
  sessions,
  sessionId,
  onSessionIdChange,
  strategies = [],
  strategyFilter = "ALL",
  onStrategyFilterChange,
  variant,
  dataReloadKey = "",
  panelTitle,
  toolbarEnd,
}: SessionAnalyticsPanelProps) {
  const [allTrades, setAllTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [journalError, setJournalError] = useState<string | null>(null);
  const [journalFetched, setJournalFetched] = useState(false);
  const [pairFilter, setPairFilter] = useState("ALL");
  const [playbookFilter, setPlaybookFilter] = useState("ALL");
  const [outcomeFilter, setOutcomeFilter] = useState("ALL");
  const [simTpR, setSimTpR] = useState(1.5);
  const [simSlR, setSimSlR] = useState(1.0);
  const [heatmapPair, setHeatmapPair] = useState("ALL");

  useEffect(() => {
    if (!sessions.length) return;
    const valid = resolveSessionIdForUser(sessions, { preferred: sessionId, useChartStorage: false });
    if (valid && valid !== sessionId) onSessionIdChange(valid);
  }, [sessions, sessionId, onSessionIdChange]);

  useEffect(() => {
    setJournalFetched(false);
    setAllTrades([]);
    setJournalError(null);
    setWhatIfApi(null);
    setWhatIfError(null);
    setLoading(true);
  }, [dataReloadKey]);
  const [heatmapMetric, setHeatmapMetric] = useState<"USD" | "R">("USD");
  const [whatIfApi, setWhatIfApi] = useState<any>(null);
  const [whatIfError, setWhatIfError] = useState<string | null>(null);
  const [whatIfLoading, setWhatIfLoading] = useState(false);
  const whatIfAbortRef = useRef<AbortController | null>(null);
  const [journalReloadToken, setJournalReloadToken] = useState(0);
  const [csvImportMode, setCsvImportMode] = useState<"replace" | "append">("replace");
  const [importStartBalance, setImportStartBalance] = useState("100000");
  const [csvImportBusy, setCsvImportBusy] = useState(false);
  const [csvImportMsg, setCsvImportMsg] = useState<string | null>(null);
  const csvImportRef = useRef<HTMLInputElement>(null);
  const [pairSort, setPairSort] = useState<{ key: string; dir: "asc" | "desc" }>({
    key: "netPnl",
    dir: "desc",
  });

  useEffect(() => {
    let mounted = true;
    if (!sessionId) {
      setLoading(false);
      setAllTrades([]);
      setJournalFetched(false);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const payload = await fetchJson<{ state?: { journal?: Trade[] } }>(
          `/api/sessions/${encodeURIComponent(sessionId)}/state`
        );
        if (!mounted) return;
        const journal = Array.isArray(payload?.state?.journal) ? payload.state!.journal! : [];
        setAllTrades(journal);
        setJournalError(null);
        setJournalFetched(true);
      } catch (e) {
        if (!mounted) return;
        setJournalError(e instanceof Error ? e.message : String(e));
        setAllTrades([]);
        setJournalFetched(true);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [sessionId, journalReloadToken, dataReloadKey]);

  const runCsvImport = useCallback(
    async (file: File) => {
      if (!sessionId) return;
      setCsvImportBusy(true);
      setCsvImportMsg(null);
      try {
        const q = new URLSearchParams();
        q.set("mode", csvImportMode);
        const sb = importStartBalance.trim();
        if (sb && Number.isFinite(Number(sb)) && Number(sb) > 0) {
          q.set("start_balance", sb);
        }
        const url = chartApiUrl(
          `/api/sessions/${encodeURIComponent(sessionId)}/journal/import-csv?${q.toString()}`
        );
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(url, { method: "POST", credentials: "include", body: fd });
        const text = await res.text();
        let body: { imported?: number; mode?: string; warnings?: string[]; warning?: string; detail?: unknown } | null = null;
        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          body = null;
        }
        if (!res.ok) {
          const d = body?.detail;
          const msg =
            typeof d === "string"
              ? d
              : d && typeof d === "object" && "errors" in d && Array.isArray((d as { errors: string[] }).errors)
                ? (d as { errors: string[] }).errors.join("; ")
                : text.slice(0, 200);
          throw new Error(msg || `HTTP ${res.status}`);
        }
        const parts = [
          `Imported ${body?.imported ?? "?"} trades (${body?.mode ?? csvImportMode}).`,
          ...(body?.warnings ?? []),
          body?.warning,
        ].filter(Boolean);
        setCsvImportMsg(parts.join(" "));
        setJournalReloadToken((x) => x + 1);
      } catch (e) {
        setCsvImportMsg(e instanceof Error ? e.message : String(e));
      } finally {
        setCsvImportBusy(false);
      }
    },
    [sessionId, csvImportMode, importStartBalance]
  );

  const normalizedTrades = useMemo(
    () =>
      allTrades.map((t) => {
        const ticker = String(t.ticker || t.symbol || "UNKNOWN").replace("/", "").toUpperCase();
        const direction = String(t.direction || t.type || "").toUpperCase();
        const pnl = n(t.netPnL ?? t.realizedPnL ?? t.pnl);
        const setup =
          t.setup ||
          t.preTradeNotes?.setup ||
          t.postTradeNotes?.setup ||
          (t.preTradeNotes?.tags ? String(t.preTradeNotes.tags).split(",")[0].trim() : "") ||
          "General";
        return {
          ...t,
          ticker,
          direction,
          pnl,
          quantity: n(t.quantity || 0),
          rr: n(t.rMultiple ?? t.rewardToRiskRatio),
          mae_r: n(t.mae_r),
          mfe_r: n(t.mfe_r),
          spread_pips_at_entry: n(t.spread_pips_at_entry),
          commission_at_entry: n(t.commission_at_entry),
          pip_value_at_entry: n(t.pip_value_at_entry),
          capture_ratio:
            n(t.capture_ratio) > 0
              ? n(t.capture_ratio)
              : n(t.mfe_r) > 0
                ? n(t.rMultiple ?? t.rewardToRiskRatio) / n(t.mfe_r)
                : 0,
          hasMae: t.mae_r !== undefined && t.mae_r !== null && String(t.mae_r).trim() !== "",
          hasMfe: t.mfe_r !== undefined && t.mfe_r !== null && String(t.mfe_r).trim() !== "",
          setup,
          openTs: n(t.openTime ?? t.entryTime ?? 0),
          closeTs: n(t.closeTime ?? t.exitTime ?? 0),
          riskUsd:
            n((t as any).riskAmount ?? (t as any).originalRiskAmount) ||
            (Math.abs(n(t.rMultiple ?? t.rewardToRiskRatio)) > 0
              ? Math.abs(n(t.netPnL ?? t.realizedPnL ?? t.pnl) / n(t.rMultiple ?? t.rewardToRiskRatio))
              : 0),
        };
      }),
    [allTrades]
  );

  const pairOptions = useMemo(
    () => Array.from(new Set(normalizedTrades.map((t) => t.ticker))).sort(),
    [normalizedTrades]
  );
  const playbookOptions = useMemo(
    () => Array.from(new Set(normalizedTrades.map((t) => t.setup || "General"))).sort(),
    [normalizedTrades]
  );

  const activeSession = useMemo(
    () => sessions.find((s) => String(s.id) === String(sessionId)),
    [sessions, sessionId]
  );
  const sessionBoundToStrategy = useMemo(
    () => Boolean(activeSession && sessionMatchesStrategyFilter(activeSession, strategyFilter)),
    [activeSession, strategyFilter]
  );

  const filteredTrades = useMemo(
    () =>
      normalizedTrades.filter((t) => {
        const passPair = pairFilter === "ALL" || t.ticker === pairFilter;
        const passPlaybook = playbookFilter === "ALL" || (t.setup || "General") === playbookFilter;
        const passOutcome =
          outcomeFilter === "ALL" ||
          (outcomeFilter === "WINNERS" && t.pnl > 0) ||
          (outcomeFilter === "LOSERS" && t.pnl < 0) ||
          (outcomeFilter === "BREAKEVEN" && t.pnl === 0);
        const passStrategy =
          strategyFilter === "ALL" ||
          sessionBoundToStrategy ||
          tradeMatchesStrategyFilter(t, strategyFilter, strategies);
        return passPair && passPlaybook && passOutcome && passStrategy;
      }),
    [
      normalizedTrades,
      pairFilter,
      playbookFilter,
      outcomeFilter,
      strategyFilter,
      strategies,
      sessionBoundToStrategy,
    ]
  );

  const statsLocal = useMemo(() => {
    const total = filteredTrades.length;
    const wins = filteredTrades.filter((t) => t.pnl > 0).length;
    const losses = filteredTrades.filter((t) => t.pnl < 0).length;
    const net = filteredTrades.reduce((s, t) => s + t.pnl, 0);
    const grossProfit = filteredTrades.filter((t) => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
    const grossLossAbs = Math.abs(filteredTrades.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    const avgRR = total > 0 ? filteredTrades.reduce((s, t) => s + t.rr, 0) / total : 0;
    const avgWin = wins > 0 ? grossProfit / wins : 0;
    const avgLoss = losses > 0 ? grossLossAbs / losses : 0;
    const profitFactor = grossLossAbs > 0 ? grossProfit / grossLossAbs : (grossProfit > 0 ? grossProfit : 0);
    const expectancy = total > 0 ? net / total : 0;
    const best = filteredTrades.reduce((m, t) => (t.pnl > m.pnl ? t : m), { pnl: Number.NEGATIVE_INFINITY, ticker: "-" } as any);
    const worst = filteredTrades.reduce((m, t) => (t.pnl < m.pnl ? t : m), { pnl: Number.POSITIVE_INFINITY, ticker: "-" } as any);
    const longTrades = filteredTrades.filter((t) => t.direction === "BUY" || t.direction === "LONG");
    const shortTrades = filteredTrades.filter((t) => t.direction === "SELL" || t.direction === "SHORT");
    const longPnl = longTrades.reduce((s, t) => s + t.pnl, 0);
    const shortPnl = shortTrades.reduce((s, t) => s + t.pnl, 0);
    return { total, wins, losses, net, winRate, avgRR, avgWin, avgLoss, profitFactor, expectancy, best, worst, longPnl, shortPnl };
  }, [filteredTrades]);
  const stats = useMemo(() => {
    const s = whatIfApi?.stats;
    if (!s) return statsLocal;
    return {
      total: n(s.total),
      wins: n(s.wins),
      losses: n(s.losses),
      net: n(s.net),
      winRate: n(s.win_rate),
      avgRR: n(s.avg_rr),
      avgWin: n(s.avg_win),
      avgLoss: n(s.avg_loss),
      profitFactor: n(s.profit_factor),
      expectancy: n(s.expectancy),
      best: { pnl: n(s.best?.pnl), ticker: String(s.best?.ticker || "-") },
      worst: { pnl: n(s.worst?.pnl), ticker: String(s.worst?.ticker || "-") },
      longPnl: n(s.long_pnl),
      shortPnl: n(s.short_pnl),
    };
  }, [whatIfApi, statsLocal]);

  const perPairLocal = useMemo(() => {
    const map = new Map<string, { trades: number; wins: number; pnl: number; rr: number; mae: number; mfe: number; capture: number; capN: number; commission: number; spread: number }>();
    filteredTrades.forEach((t) => {
      const key = t.ticker;
      const cur = map.get(key) || { trades: 0, wins: 0, pnl: 0, rr: 0, mae: 0, mfe: 0, capture: 0, capN: 0, commission: 0, spread: 0 };
      cur.trades += 1;
      cur.wins += t.pnl > 0 ? 1 : 0;
      cur.pnl += t.pnl;
      cur.rr += t.rr;
      cur.mae += t.mae_r;
      cur.mfe += t.mfe_r;
      if (t.capture_ratio > 0 && t.pnl > 0) {
        cur.capture += t.capture_ratio;
        cur.capN += 1;
      }
      cur.commission += (t.commission_at_entry || 0) * (t.quantity || 0) * 2;
      cur.spread += (t.spread_pips_at_entry || 0) * (t.pip_value_at_entry || 0) * (t.quantity || 0);
      map.set(key, cur);
    });
    return Array.from(map.entries()).map(([ticker, v]) => ({
      ticker,
      trades: v.trades,
      winRate: v.trades > 0 ? (v.wins / v.trades) * 100 : 0,
      netPnl: v.pnl,
      netRr: v.rr,
      avgMae: v.trades > 0 ? v.mae / v.trades : 0,
      avgMfe: v.trades > 0 ? v.mfe / v.trades : 0,
      captureRatio: v.capN > 0 ? v.capture / v.capN : 0,
      commissionPaid: v.commission,
      spreadCost: v.spread,
    }));
  }, [filteredTrades]);

  const perPair = useMemo(() => {
    const apiRows = Array.isArray(whatIfApi?.per_instrument) ? whatIfApi.per_instrument : null;
    if (!apiRows) return perPairLocal;
    return apiRows.map((r: any) => ({
      ticker: String(r.ticker || "UNKNOWN"),
      trades: n(r.trades),
      winRate: n(r.win_rate),
      netPnl: n(r.net_pnl_usd),
      netRr: n(r.net_pnl_r),
      avgMae: n(r.avg_mae_r),
      avgMfe: n(r.avg_mfe_r),
      captureRatio: n(r.capture_ratio),
      commissionPaid: n(r.commission_cost_usd),
      spreadCost: n(r.spread_cost_usd),
    }));
  }, [whatIfApi, perPairLocal]);

  const sortedPerPair = useMemo(() => {
    const rows = [...perPair];
    const { key, dir } = pairSort;
    rows.sort((a: any, b: any) => {
      const av = a[key];
      const bv = b[key];
      if (typeof av === "string" || typeof bv === "string") {
        return dir === "asc"
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      }
      return dir === "asc" ? Number(av) - Number(bv) : Number(bv) - Number(av);
    });
    return rows;
  }, [perPair, pairSort]);

  const onSortPair = (key: string) => {
    setPairSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" }
    );
  };

  const playbookRowsLocal = useMemo(() => {
    const map = new Map<string, { trades: number; wins: number; pnl: number; rr: number }>();
    filteredTrades.forEach((t) => {
      const key = String(t.setup || "General");
      const cur = map.get(key) || { trades: 0, wins: 0, pnl: 0, rr: 0 };
      cur.trades += 1;
      cur.wins += t.pnl > 0 ? 1 : 0;
      cur.pnl += t.pnl;
      cur.rr += t.rr;
      map.set(key, cur);
    });
    return Array.from(map.entries()).map(([setup, v]) => ({
      setup,
      trades: v.trades,
      winRate: v.trades > 0 ? (v.wins / v.trades) * 100 : 0,
      netPnl: v.pnl,
      avgRr: v.trades > 0 ? v.rr / v.trades : 0,
    })).sort((a, b) => b.netPnl - a.netPnl);
  }, [filteredTrades]);
  const playbookRows = useMemo(() => {
    const rows = Array.isArray(whatIfApi?.playbook_breakdown) ? whatIfApi.playbook_breakdown : null;
    if (!rows) return playbookRowsLocal;
    return rows.map((r: any) => ({
      setup: String(r.setup || "General"),
      trades: n(r.trades),
      winRate: n(r.win_rate),
      netPnl: n(r.net_pnl),
      avgRr: n(r.avg_rr),
    }));
  }, [whatIfApi, playbookRowsLocal]);

  const recentTradesLocal = useMemo(
    () => [...filteredTrades].sort((a, b) => b.closeTs - a.closeTs).slice(0, 15),
    [filteredTrades]
  );
  const recentTrades = useMemo(() => {
    const rows = Array.isArray(whatIfApi?.recent_trades) ? whatIfApi.recent_trades : null;
    if (!rows) return recentTradesLocal;
    return rows.map((r: any) => ({
      tradeId: r.trade_id,
      ticker: String(r.ticker || "UNKNOWN"),
      direction: String(r.side || ""),
      setup: String(r.setup || "General"),
      pnl: n(r.pnl_net),
      rr: n(r.rr_actual),
      closeTs: n(r.close_ts),
    }));
  }, [whatIfApi, recentTradesLocal]);

  const maeDistribution = useMemo(() => {
    const apiRows = Array.isArray(whatIfApi?.mae_distribution) ? whatIfApi.mae_distribution : null;
    if (apiRows) return apiRows;
    return buildHistogram(filteredTrades.filter((t: any) => t.hasMae).map((t) => t.mae_r), 0.5);
  }, [whatIfApi, filteredTrades]);
  const mfeDistribution = useMemo(() => {
    const apiRows = Array.isArray(whatIfApi?.mfe_distribution) ? whatIfApi.mfe_distribution : null;
    if (apiRows) return apiRows;
    return buildHistogram(filteredTrades.filter((t: any) => t.hasMfe).map((t) => t.mfe_r), 0.5);
  }, [whatIfApi, filteredTrades]);

  const tickerColor = useMemo(() => {
    const palette = ["#3b82f6", "#22c55e", "#ef4444", "#f59e0b", "#8b5cf6", "#06b6d4", "#84cc16", "#ec4899", "#f97316", "#14b8a6"];
    const map = new Map<string, string>();
    pairOptions.forEach((t, i) => map.set(t, palette[i % palette.length]));
    return map;
  }, [pairOptions]);

  const equityCurve = useMemo(() => {
    const sorted = [...filteredTrades].sort((a, b) => a.closeTs - b.closeTs);
    let running = 0;
    return sorted.map((t, i) => {
      running += t.pnl;
      return {
        idx: i + 1,
        equity: running,
        ticker: t.ticker,
        pointColor: tickerColor.get(t.ticker) || "#3b82f6",
      };
    });
  }, [filteredTrades, tickerColor]);

  const runWhatIfFetch = useCallback(
    (signal: AbortSignal) => {
      if (!sessionId) {
        setWhatIfApi(null);
        setWhatIfError(null);
        setWhatIfLoading(false);
        return;
      }
      void (async () => {
        setWhatIfLoading(true);
        setWhatIfError(null);
        try {
          const payload = await fetchBacktestWhatIf(
            {
              session_id: Number(sessionId),
              pair_filter: pairFilter,
              playbook_filter: playbookFilter,
              strategy_filter: strategyFilter,
              outcome_filter: outcomeFilter,
              heatmap_pair: heatmapPair,
              tp_r: simTpR,
              sl_r: simSlR,
            },
            signal
          );
          if (signal.aborted) return;
          setWhatIfApi(payload || null);
          setWhatIfError(null);
        } catch (e) {
          if (signal.aborted) return;
          const msg = e instanceof Error ? e.message : String(e);
          setWhatIfError(msg);
        } finally {
          if (!signal.aborted) setWhatIfLoading(false);
        }
      })();
    },
    [
      sessionId,
      pairFilter,
      playbookFilter,
      strategyFilter,
      outcomeFilter,
      heatmapPair,
      simTpR,
      simSlR,
    ]
  );

  useEffect(() => {
    whatIfAbortRef.current?.abort();
    if (!sessionId) {
      setWhatIfApi(null);
      setWhatIfError(null);
      setWhatIfLoading(false);
      return;
    }
    const ac = new AbortController();
    whatIfAbortRef.current = ac;
    const timer = window.setTimeout(() => runWhatIfFetch(ac.signal), 450);
    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [
    sessionId,
    pairFilter,
    playbookFilter,
    strategyFilter,
    outcomeFilter,
    heatmapPair,
    simTpR,
    simSlR,
    journalReloadToken,
    dataReloadKey,
    runWhatIfFetch,
  ]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !sessionId || !whatIfError) return;
      whatIfAbortRef.current?.abort();
      const ac = new AbortController();
      whatIfAbortRef.current = ac;
      runWhatIfFetch(ac.signal);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [whatIfError, sessionId, runWhatIfFetch]);

  const whatIfEquityCurve = useMemo(
    () =>
      Array.isArray(whatIfApi?.equity_curve)
        ? whatIfApi.equity_curve.map((x: any) => ({
            idx: n(x.index),
            ticker: String(x.ticker || "UNKNOWN"),
            actual: n(x.actual_equity),
            simulated: n(x.simulated_equity),
          }))
        : [],
    [whatIfApi]
  );

  const heatmapData = useMemo(
    () => (Array.isArray(whatIfApi?.heatmap?.flat) ? whatIfApi.heatmap.flat : []),
    [whatIfApi]
  );

  const bestHeatmap = useMemo(() => {
    if (!heatmapData.length) return null;
    const score = (h: any) =>
      heatmapMetric === "USD" ? n(h.expectancy_usd ?? h.expectancyUsd) : n(h.expectancy_r ?? h.expectancyR);
    return heatmapData.reduce((best: any, h: any) => (score(h) > score(best) ? h : best), heatmapData[0]);
  }, [heatmapData, heatmapMetric]);
  const heatmapValueRange = useMemo(() => {
    if (heatmapData.length === 0) return { min: 0, max: 0, absMax: 1 };
    const vals = heatmapData.map((h: any) =>
      heatmapMetric === "USD" ? n(h.expectancy_usd ?? h.expectancyUsd) : n(h.expectancy_r ?? h.expectancyR)
    );
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const absMax = Math.max(Math.abs(min), Math.abs(max), 1e-9);
    return { min, max, absMax };
  }, [heatmapData]);

  const heatmapTpLevels = useMemo(
    () =>
      Array.isArray(whatIfApi?.heatmap?.tp_levels)
        ? whatIfApi.heatmap.tp_levels.map((v: any) => n(v)).sort((a: number, b: number) => a - b)
        : [],
    [whatIfApi]
  );
  const heatmapSlLevels = useMemo(
    () =>
      Array.isArray(whatIfApi?.heatmap?.sl_levels)
        ? whatIfApi.heatmap.sl_levels.map((v: any) => n(v)).sort((a: number, b: number) => a - b)
        : [],
    [whatIfApi]
  );
  const heatmapTradesCount = n(whatIfApi?.meta?.heatmap_trades_in_scope);
  const whatIfTradesCount = n(whatIfApi?.meta?.trades_in_scope);

  const equitySummary = whatIfApi?.equity_summary || null;

  const sessionAnalytics = whatIfApi?.session_analytics as
    | {
        sharpe_sortino?: { sharpe?: number | null; sortino?: number | null };
        monthly_pnl?: Array<{ x: string; y: number }>;
        weekday_winrate?: Array<{ x: string; y: number; n: number }>;
        yearly_summary?: {
          best_year?: { year: number; net_pnl: number; return_pct: number } | null;
          worst_year?: { year: number; net_pnl: number; return_pct: number } | null;
        };
        holding_duration?: {
          trades_with_duration?: number;
          avg_hours?: number | null;
          avg_win_hours?: number | null;
          avg_loss_hours?: number | null;
        };
        balance?: {
          start_balance?: number | null;
          net_pnl?: number;
          equity?: Array<{ x: string; y: number }>;
          drawdown_pct?: Array<{ x: string; y: number }>;
          max_drawdown?: number | null;
          max_drawdown_pct?: number | null;
          recovery_factor?: number | null;
        };
      }
    | undefined;

  const pnls = useMemo(() => filteredTrades.map((t) => t.pnl), [filteredTrades]);

  const sortedByCloseForStreak = useMemo(
    () => [...filteredTrades].sort((a, b) => n(a.closeTs) - n(b.closeTs)),
    [filteredTrades]
  );

  const osChartPack = useMemo((): BacktestOsChartPack => {
    const sb =
      sessionAnalytics?.balance?.start_balance != null && Number.isFinite(n(sessionAnalytics.balance.start_balance))
        ? n(sessionAnalytics.balance.start_balance)
        : null;
    const monthlyRows = Array.isArray(sessionAnalytics?.monthly_pnl) ? sessionAnalytics!.monthly_pnl! : [];

    let equity: BacktestOsChartPack["equity"] = null;
    const balEq = sessionAnalytics?.balance?.equity;
    if (Array.isArray(balEq) && balEq.length) {
      const strategy = balEq.map((r: { y: number }) => n(r.y));
      const labels = balEq.map((_: unknown, i: number) => String(i + 1));
      const benchmark = sb != null && sb > 0 ? strategy.map(() => sb) : null;
      equity = {
        labels,
        strategy,
        benchmark,
        subtitle: sb != null ? `${fmtMoney(sb)} start` : "account equity",
      };
    } else if (equityCurve.length) {
      equity = {
        labels: equityCurve.map((_: unknown, i: number) => String(i + 1)),
        strategy: equityCurve.map((e: { equity: number }) => n(e.equity)),
        benchmark: null,
        subtitle: "cumulative $ PnL",
      };
    }

    const monthlyPct =
      sb != null && sb > 0 && monthlyRows.length
        ? {
            labels: monthlyRows.map((r: { x: string }) => r.x),
            values: monthlyRows.map((r: { y: number }) => (n(r.y) / sb) * 100),
          }
        : null;

    let rolling: BacktestOsChartPack["rolling"] = null;
    if (monthlyPct && monthlyPct.values.length >= 3) {
      const vals = monthlyPct.values;
      rolling = {
        labels: monthlyPct.labels,
        values: vals.map((_, i) =>
          i < 2 ? null : (((vals[i]! + vals[i - 1]! + vals[i - 2]!) / 3) * 12)
        ),
      };
    }

    let dist: BacktestOsChartPack["dist"] = null;
    if (pnls.length) {
      const spread = Math.max(...pnls) - Math.min(...pnls);
      const hist = buildHistogram(pnls, Math.max(25, spread / 8 || 25));
      dist = {
        labels: hist.map((h) => h.label),
        counts: hist.map((h) => h.count),
        colors: hist.map((h) =>
          (h.from + h.to) / 2 >= 0 ? "rgba(0,255,136,0.6)" : "rgba(255,77,77,0.6)"
        ),
      };
    }

    let drawdown: BacktestOsChartPack["drawdown"] = null;
    const ddRows = sessionAnalytics?.balance?.drawdown_pct;
    if (Array.isArray(ddRows) && ddRows.length) {
      drawdown = {
        labels: ddRows.map((_: unknown, i: number) => String(i + 1)),
        values: ddRows.map((r: { y: number }) => n(r.y)),
      };
    }

    const sharpeN = n(sessionAnalytics?.sharpe_sortino?.sharpe ?? 0);
    const sortinoN = n(sessionAnalytics?.sharpe_sortino?.sortino ?? 0);
    const mddpN = n(sessionAnalytics?.balance?.max_drawdown_pct ?? 0);
    const calmarR =
      mddpN > 0 && sb != null && sb > 0 ? Math.abs(stats.net / sb) / mddpN : 0;
    const omega =
      stats.avgLoss > 0 ? (stats.avgWin * stats.wins) / (Math.abs(stats.avgLoss) * Math.max(1, stats.losses)) : 0;
    const clampR = (x: number) => Math.min(2, Math.max(0, Number.isFinite(x) ? x : 0));
    const radar =
      stats.total > 0
        ? {
            labels: ["Sharpe", "Sortino", "Win%", "PF", "Calmar", "Omega", "Avg R", "Net/σ"],
            strategy: [
              clampR(sharpeN / 1.2),
              clampR(sortinoN / 1.5),
              clampR(stats.winRate / 50),
              clampR(stats.profitFactor / 2.5),
              clampR(calmarR),
              clampR(omega / 2),
              clampR((stats.avgRR + 2) / 4),
              clampR(sampleStd(pnls) > 0 ? stats.net / pnls.length / sampleStd(pnls) : 0),
            ],
            benchmark: [0.85, 0.9, 0.55, 0.85, 0.65, 0.9, 0.75, 0.7],
          }
        : null;

    let annual: BacktestOsChartPack["annual"] = null;
    if (monthlyRows.length && sb != null && sb > 0) {
      const byYear: Record<string, number> = {};
      for (const row of monthlyRows) {
        const yk = String(row.x).slice(0, 4);
        byYear[yk] = (byYear[yk] || 0) + n(row.y);
      }
      const years = Object.keys(byYear).sort();
      annual = {
        years,
        strategy: years.map((y) => (byYear[y]! / sb) * 100),
        benchmark: null,
      };
    }

    const sortedByClose = [...filteredTrades].sort((a, b) => n(a.closeTs) - n(b.closeTs));
    const tradePL =
      sortedByClose.length > 0
        ? (() => {
            let cum = 0;
            return sortedByClose.map((t, i) => {
              cum += t.pnl;
              return { x: i + 1, y: cum };
            });
          })()
        : null;

    const winLoss = stats.total > 0 ? { wins: stats.wins, losses: stats.losses } : null;

    const hoursDur = sortedByClose
      .map((t) => {
        const o = n(t.openTs);
        const c = n(t.closeTs);
        if (o > 1e9 && c > 1e9) return Math.max(0, (c - o) / 3600000);
        return NaN;
      })
      .filter((h) => Number.isFinite(h));
    const duration =
      hoursDur.length > 0
        ? {
            labels: ["≤1d", "2–3d", "4–7d", "8–14d", "15–30d", ">30d"],
            counts: durationBucketsHours(hoursDur),
          }
        : null;

    const nSteps = Math.min(80, Math.max(10, sortedByClose.length));
    const monteCarlo = pnls.length > 2 ? monteCarloPercentiles(pnls, 200, nSteps) : null;

    return {
      equity,
      rolling,
      dist,
      monthlyPct,
      drawdown,
      radar,
      annual,
      tradePL,
      winLoss,
      duration,
      monteCarlo,
    };
  }, [sessionAnalytics, equityCurve, filteredTrades, stats, pnls]);

  const osMetricBundles = useMemo(() => {
    const em = "—";
    const card = (label: string, value: string, sub: string, accent: string, tone?: "pos" | "neg"): OsMetricCard => ({
      label,
      value,
      sub,
      accent,
      tone,
    });

    const sb =
      sessionAnalytics?.balance?.start_balance != null && Number.isFinite(n(sessionAnalytics.balance.start_balance))
        ? n(sessionAnalytics.balance.start_balance)
        : null;
    const totalRetPct =
      sb != null && sb > 0 ? ((stats.net / sb) * 100).toFixed(2) + "%" : em;
    const monthlyRows = Array.isArray(sessionAnalytics?.monthly_pnl) ? sessionAnalytics!.monthly_pnl! : [];
    const monthlyAvgPct =
      sb != null && sb > 0 && monthlyRows.length
        ? ((monthlyRows.reduce((s: number, r: { y: number }) => s + n(r.y), 0) / monthlyRows.length / sb) * 100).toFixed(
            2
          ) + "%"
        : em;

    const σ = sampleStd(pnls);
    const negOnly = pnls.filter((p) => p < 0);
    const dsd = negOnly.length > 1 ? sampleStd(negOnly) : 0;
    const { var95, cvar95 } = varCvar95(pnls);
    const sk = skewness(pnls);
    const kt = kurtosisExcess(pnls);
    const thr = -3 * σ;
    const tailPct = pnls.length ? ((pnls.filter((p) => p < thr).length / pnls.length) * 100).toFixed(1) + "%" : em;

    const mddp = sessionAnalytics?.balance?.max_drawdown_pct;
    const rec = sessionAnalytics?.balance?.recovery_factor;
    const ddPts = sessionAnalytics?.balance?.drawdown_pct?.map((r: { y: number }) => Math.abs(n(r.y))) ?? [];
    const ulcer = ddPts.length ? Math.sqrt(mean(ddPts.map((x) => x * x))) : null;
    const pain = ddPts.length ? mean(ddPts) : null;

    const sharpeN = sessionAnalytics?.sharpe_sortino?.sharpe;
    const sortinoN = sessionAnalytics?.sharpe_sortino?.sortino;
    const mddpN = n(mddp ?? 0);
    const calmarApprox =
      sb != null && sb > 0 && mddpN > 0 ? (Math.abs(stats.net / sb) / mddpN).toFixed(2) : em;

    const streaks2 = maxConsecutiveStreaks(sortedByCloseForStreak.map((t) => t.pnl > 0));

    const costTotal = sortedPerPair.reduce((s, r) => s + n(r.commissionPaid) + n(r.spreadCost), 0);

    const pn = pnls.length;
    const stderr = pn > 1 && σ > 0 ? σ / Math.sqrt(pn) : 0;
    const tStat = stderr > 0 ? mean(pnls) / stderr : null;

    const closeList = filteredTrades.map((t) => n(t.closeTs)).filter((x) => x > 1e11 || x > 1e9);
    let dateFrom = em;
    let dateTo = em;
    if (closeList.length) {
      const mn = Math.min(...closeList);
      const mx = Math.max(...closeList);
      const d1 = mn > 1e12 ? new Date(mn) : new Date(mn * 1000);
      const d2 = mx > 1e12 ? new Date(mx) : new Date(mx * 1000);
      dateFrom = Number.isNaN(d1.getTime()) ? em : d1.toISOString().slice(0, 10);
      dateTo = Number.isNaN(d2.getTime()) ? em : d2.toISOString().slice(0, 10);
    }

    const ys = sessionAnalytics?.yearly_summary;
    const yrRoll = yearlyRollupFromMonthly(monthlyRows, sb);
    const bestYearLabel =
      ys?.best_year && sb != null && sb > 0
        ? `${ys.best_year.year} (${n(ys.best_year.return_pct).toFixed(1)}%)`
        : yrRoll.best;
    const worstYearLabel =
      ys?.worst_year && sb != null && sb > 0
        ? `${ys.worst_year.year} (${n(ys.worst_year.return_pct).toFixed(1)}%)`
        : yrRoll.worst;

    const holdApi = sessionAnalytics?.holding_duration;
    const localHoldH = sortedByCloseForStreak
      .map((t) => holdHoursFromTrade(t))
      .filter((h): h is number => h != null && Number.isFinite(h));
    const avgHoldH =
      holdApi?.avg_hours != null && Number.isFinite(n(holdApi.avg_hours))
        ? n(holdApi.avg_hours)
        : localHoldH.length
          ? mean(localHoldH)
          : null;
    const avgWinHoldH =
      holdApi?.avg_win_hours != null && Number.isFinite(n(holdApi.avg_win_hours))
        ? n(holdApi.avg_win_hours)
        : (() => {
            const xs = sortedByCloseForStreak.filter((t) => t.pnl > 0).map((t) => holdHoursFromTrade(t)).filter((h): h is number => h != null);
            return xs.length ? mean(xs) : null;
          })();
    const avgLossHoldH =
      holdApi?.avg_loss_hours != null && Number.isFinite(n(holdApi.avg_loss_hours))
        ? n(holdApi.avg_loss_hours)
        : (() => {
            const xs = sortedByCloseForStreak.filter((t) => t.pnl < 0).map((t) => holdHoursFromTrade(t)).filter((h): h is number => h != null);
            return xs.length ? mean(xs) : null;
          })();

    const grossProfitSum = filteredTrades.filter((t) => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
    const grossLossAbs = Math.abs(filteredTrades.filter((t) => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
    const omega0 = grossLossAbs > 1e-9 ? (grossProfitSum / grossLossAbs).toFixed(2) : em;

    const retFrac = sb != null && sb > 0 ? stats.net / sb : null;
    const martinApprox =
      retFrac != null && ulcer != null && ulcer > 1e-9 ? ((retFrac * 100) / ulcer).toFixed(2) : em;
    const painRatioApprox =
      retFrac != null && pain != null && pain > 1e-9 ? ((retFrac * 100) / pain).toFixed(2) : em;

    const jb = jarqueBeraApprox(sk, kt, pn);
    const tAbs = tStat != null ? Math.abs(tStat) : NaN;
    const pRough = tStat != null && Number.isFinite(tStat) ? pValueRoughFromT(tAbs) : em;

    const nMc = Math.min(80, Math.max(10, pn));
    const mcPack = pnls.length > 2 ? monteCarloPercentiles(pnls, 200, nMc) : null;
    const mc5last = mcPack?.p5?.length ? mcPack.p5[mcPack.p5.length - 1]! : null;

    let bestMo = em;
    let worstMo = em;
    let bestV = -Infinity;
    let worstV = Infinity;
    for (const r of monthlyRows) {
      const v = n(r.y);
      if (v > bestV) {
        bestV = v;
        bestMo = `${r.x} (${fmtMoney(v)})`;
      }
      if (v < worstV) {
        worstV = v;
        worstMo = `${r.x} (${fmtMoney(v)})`;
      }
    }

    return {
      dateFrom,
      dateTo,
      returnCards: [
        card("Total return", totalRetPct, "net PnL / start balance", "#00ff88", stats.net >= 0 ? "pos" : "neg"),
        card("CAGR", em, "needs long daily equity series", "#00ff88"),
        card("Annualized return", em, "CAGR proxy unavailable", "#00ff88"),
        card("Alpha", em, "no benchmark loaded", "#00ff88"),
        card("Daily return", em, "use journal timestamps for daily bars", "#00ff88"),
        card("Monthly avg %", monthlyAvgPct, "mean monthly / balance", "#00ff88"),
        card("Benchmark return", em, "not connected", "#00ff88"),
        card("Excess return", em, "vs benchmark N/A", "#00ff88"),
      ],
      riskCards: [
        card("Volatility (σ)", pn ? fmtMoney(σ) : em, "per-trade PnL std ($)", "#ff4d4d"),
        card("Downside dev", dsd > 0 ? fmtMoney(dsd) : em, "losing trades only", "#ff4d4d"),
        card("VaR 95%", var95 != null ? (var95 / (sb || 1) * 100).toFixed(2) + "%" : em, "empirical trade tail", "#ff4d4d", "neg"),
        card("CVaR 95%", cvar95 != null ? (cvar95 / (sb || 1) * 100).toFixed(2) + "%" : em, "expected shortfall", "#ff4d4d", "neg"),
        card("Beta", em, "vs benchmark N/A", "#ff4d4d"),
        card("Correlation", em, "benchmark N/A", "#ff4d4d"),
        card("Skewness", sk != null ? sk.toFixed(2) : em, "trade PnL", "#ff4d4d", sk != null && sk > 0 ? "pos" : undefined),
        card("Kurtosis (excess)", kt != null ? kt.toFixed(2) : em, "fat tails", "#ff4d4d"),
        card("Tracking error", em, "benchmark N/A", "#ff4d4d"),
        card("Tail risk", tailPct, "P(PnL < −3σ)", "#ff4d4d"),
      ],
      drawCards: [
        card(
          "Max drawdown",
          mddp != null && Number.isFinite(n(mddp)) ? (n(mddp) * 100).toFixed(2) + "%" : em,
          "of peak balance",
          "#a855f7",
          "neg"
        ),
        card("Avg drawdown", pain != null ? pain.toFixed(2) + "%" : em, "mean |underwater|", "#a855f7"),
        card("Max DD duration", em, "needs episode parser", "#a855f7"),
        card("Avg DD duration", em, "needs episode parser", "#a855f7"),
        card("Calmar ratio", String(calmarApprox), "return / max DD%", "#a855f7", calmarApprox !== em ? "pos" : undefined),
        card("Recovery factor", rec != null && Number.isFinite(n(rec)) ? n(rec).toFixed(2) + "×" : em, "net / max DD $", "#a855f7"),
        card("Ulcer index", ulcer != null ? ulcer.toFixed(2) : em, "RMS DD%", "#a855f7"),
        card("Pain index", pain != null ? pain.toFixed(2) + "%" : em, "mean DD depth", "#a855f7"),
        card("Sterling ratio", em, "needs avg ann DD", "#a855f7"),
        card("Burke ratio", em, "needs RMS DD series", "#a855f7"),
      ],
      ratioCards: [
        card("Sharpe ratio", sharpeN != null && Number.isFinite(sharpeN) ? sharpeN.toFixed(2) : em, "mean/σ trades", "#00c4ff"),
        card("Sortino ratio", sortinoN != null && Number.isFinite(sortinoN) ? sortinoN.toFixed(2) : em, "downside σ trades", "#00c4ff"),
        card("Calmar ratio", String(calmarApprox), "same as drawdown card", "#00c4ff"),
        card("Info ratio", em, "benchmark N/A", "#00c4ff"),
        card("Treynor ratio", em, "β N/A", "#00c4ff"),
        card(
          "Omega ratio",
          omega0,
          "gains / |losses| at τ=0",
          "#00c4ff",
          omega0 !== em && Number.parseFloat(omega0) >= 1 ? "pos" : omega0 !== em ? "neg" : undefined
        ),
        card("Martin ratio", martinApprox, "return% / ulcer (proxy)", "#00c4ff", martinApprox !== em ? "pos" : undefined),
        card("Pain ratio", painRatioApprox, "return% / pain idx (proxy)", "#00c4ff", painRatioApprox !== em ? "pos" : undefined),
        card("M² (Modigliani)", em, "benchmark N/A", "#00c4ff"),
        card("Kappa 3", em, "higher moments N/A", "#00c4ff"),
        card("Deflated Sharpe", em, "track record adj N/A", "#00c4ff"),
        card("Sharpe t-stat", tStat != null && Number.isFinite(tStat) ? tStat.toFixed(2) : em, "mean / stderr", "#00c4ff"),
      ],
      tradeCards: [
        card("Win rate", fmtPct(stats.winRate), `of ${stats.total} trades`, "#ff6b35", "pos"),
        card("Profit factor", stats.profitFactor.toFixed(2), "gross win / gross loss", "#ff6b35", stats.profitFactor >= 1 ? "pos" : "neg"),
        card("Payoff ratio", stats.avgLoss > 0 ? (stats.avgWin / stats.avgLoss).toFixed(2) : em, "avg win / avg loss", "#ff6b35"),
        card("Expectancy", fmtMoney(stats.expectancy), "per trade", "#ff6b35", stats.expectancy >= 0 ? "pos" : "neg"),
        card("Total trades", String(stats.total), "round-trips", "#ff6b35"),
        card("Avg duration", fmtDaysFromHours(avgHoldH), "open→close when timestamps exist", "#ff6b35"),
        card("Max consec wins", String(streaks2.maxWins), "streak", "#ff6b35", "pos"),
        card("Max consec losses", String(streaks2.maxLosses), "streak", "#ff6b35", "neg"),
        card("Largest win", fmtMoney(Number.isFinite(stats.best?.pnl) ? stats.best.pnl : 0), stats.best?.ticker || "", "#ff6b35", "pos"),
        card("Largest loss", fmtMoney(Number.isFinite(stats.worst?.pnl) ? stats.worst.pnl : 0), stats.worst?.ticker || "", "#ff6b35", "neg"),
        card("Avg winner", fmtMoney(stats.avgWin), "per win", "#ff6b35", "pos"),
        card("Avg loser", fmtMoney(stats.avgLoss), "per loss (abs)", "#ff6b35", "neg"),
        card("Avg win duration", fmtDaysFromHours(avgWinHoldH), "winners only", "#ff6b35"),
        card("Avg loss duration", fmtDaysFromHours(avgLossHoldH), "losers only", "#ff6b35"),
        card("Trade cost total", fmtMoney(-costTotal), "commissions + spread est.", "#ff6b35", "neg"),
        card("Gross profit", fmtMoney(filteredTrades.filter((t) => t.pnl > 0).reduce((s, t) => s + t.pnl, 0)), "winners only", "#ff6b35", "pos"),
      ],
      statCards: [
        card("t-Statistic", tStat != null ? tStat.toFixed(2) : em, "mean PnL / stderr", "#fbbf24"),
        card("p-Value", pRough, "rough |t| thresholds (trade PnL)", "#fbbf24"),
        card("R² equity", em, "linear fit N/A", "#fbbf24"),
        card("K-Ratio", em, "equity slope / SE N/A", "#fbbf24"),
        card("Hurst exponent", em, "needs long log returns", "#fbbf24"),
        card("Autocorrelation", em, "lag-1 N/A", "#fbbf24"),
        card("Ljung-Box Q", em, "N/A", "#fbbf24"),
        card("Jarque-Bera", jb != null ? jb.toFixed(1) : em, "JB approx from skew & kurt", "#fbbf24"),
        card("WF efficiency", em, "OOS / IS N/A", "#fbbf24"),
        card("Monte Carlo 5th %", mc5last != null ? fmtMoney(mc5last) : em, "bootstrap cum PnL end", "#fbbf24"),
        card("Overfit bias", em, "N/A", "#fbbf24"),
      ],
      timeCards: [
        card("Time in market", em, "bar data not in journal", "#9ca3af"),
        card(
          "Time in drawdown",
          ddPts.length ? ((ddPts.filter((x) => x > 0.01).length / ddPts.length) * 100).toFixed(1) + "%" : em,
          "DD pts > 0.01%",
          "#9ca3af"
        ),
        card("Avg exposure", em, "size × price N/A", "#9ca3af"),
        card("Avg leverage", em, "N/A", "#9ca3af"),
        card("Annual turnover", em, "N/A", "#9ca3af"),
        card("Capacity est.", em, "N/A", "#9ca3af"),
        card("Best year", bestYearLabel, "sum of monthly $ / balance", "#9ca3af", "pos"),
        card("Worst year", worstYearLabel, "sum of monthly $ / balance", "#9ca3af", "neg"),
        card("Best month", bestMo, "by $ PnL", "#9ca3af", "pos"),
        card("Worst month", worstMo, "by $ PnL", "#9ca3af", "neg"),
        card("Slippage total", em, "not modeled separately", "#9ca3af"),
      ],
    };
  }, [sessionAnalytics, stats, pnls, filteredTrades, sortedPerPair, sortedByCloseForStreak]);

  const quantDashboard = useMemo(() => {
    const eq = osChartPack.equity?.strategy ?? [];
    const dd = osChartPack.drawdown?.values ?? [];
    const mo = osChartPack.monthlyPct?.values ?? [];
    const sharpe = sessionAnalytics?.sharpe_sortino?.sharpe;
    const sortino = sessionAnalytics?.sharpe_sortino?.sortino;
    const mddp = sessionAnalytics?.balance?.max_drawdown_pct;
    const sb =
      sessionAnalytics?.balance?.start_balance != null && Number.isFinite(n(sessionAnalytics.balance.start_balance))
        ? n(sessionAnalytics.balance.start_balance)
        : null;
    const totalRetPct =
      sb != null && sb > 0 ? ((stats.net / sb) * 100).toFixed(2) + "%" : undefined;
    const mddpN = mddp != null ? n(mddp) : null;
    const calmarCard = osMetricBundles.ratioCards.find((c) => c.label === "Calmar ratio");
    const omegaCard = osMetricBundles.ratioCards.find((c) => c.label === "Omega ratio");
    const expectancyCard = osMetricBundles.tradeCards.find((c) => c.label === "Expectancy");
    const payoff =
      stats.avgLoss > 0 ? stats.avgWin / stats.avgLoss : null;

    const quantKpis = buildQuantKpiStrip({
      sharpe,
      sortino,
      winRate: stats.winRate,
      profitFactor: stats.profitFactor,
      maxDrawdownPct: mddpN,
      totalReturnPct: totalRetPct,
      expectancy: expectancyCard?.value,
      omega: omegaCard?.value,
      calmar: calmarCard?.value,
      equitySeries: eq,
      drawdownSeries: dd,
      monthlyPctSeries: mo,
    });

    const netRet = sb != null && sb > 0 ? (stats.net / sb) * 100 : null;
    const talariaScore = computeTalariaScores({
      sharpe,
      sortino,
      winRate: stats.winRate,
      profitFactor: stats.profitFactor,
      maxDrawdownPct: mddpN != null ? (mddpN <= 1 ? mddpN * 100 : mddpN) : null,
      netReturnPct: netRet,
      payoffRatio: payoff,
    });

    let scoreTrend: number[] = [];
    if (eq.length >= 4) {
      const base = eq[0] || 1;
      scoreTrend = eq.slice(-30).map((v) => {
        const ret = ((v - base) / Math.abs(base)) * 100;
        return Math.max(0, Math.min(100, 50 + ret * 0.8));
      });
    } else if (mo.length >= 3) {
      scoreTrend = mo.slice(-30).map((v) => Math.max(0, Math.min(100, 50 + v * 2)));
    }

    return { quantKpis, talariaScore, scoreTrend };
  }, [osChartPack, sessionAnalytics, stats, osMetricBundles]);

  const sessionDisplayName =
    sessions.find((s) => String(s.id) === String(sessionId))?.name || `Session #${sessionId || "?"}`;

  const bestHeatmapValue = bestHeatmap
    ? (heatmapMetric === "USD"
      ? n(bestHeatmap.expectancy_usd ?? bestHeatmap.expectancyUsd)
      : n(bestHeatmap.expectancy_r ?? bestHeatmap.expectancyR))
    : 0;
  const bestHeatmapTp = bestHeatmap ? n(bestHeatmap.tp_r ?? bestHeatmap.tp) : 0;
  const bestHeatmapSl = bestHeatmap ? n(bestHeatmap.sl_r ?? bestHeatmap.sl) : 0;
  const heatmapLookup = useMemo(() => {
    const m = new Map<string, number>();
    heatmapData.forEach((h: any) =>
      m.set(
        `${n(h.sl_r ?? h.sl)}-${n(h.tp_r ?? h.tp)}`,
        heatmapMetric === "USD"
          ? n(h.expectancy_usd ?? h.expectancyUsd)
          : n(h.expectancy_r ?? h.expectancyR)
      )
    );
    return m;
  }, [heatmapData, heatmapMetric]);

  const heatColor = (value: number): string => {
    const ratio = Math.min(1, Math.abs(value) / heatmapValueRange.absMax);
    const alpha = 0.12 + ratio * 0.58;
    if (value >= 0) return `rgba(34,197,94,${alpha.toFixed(3)})`;
    return `rgba(239,68,68,${alpha.toFixed(3)})`;
  };

  const filterOptionStyle: React.CSSProperties = {
    backgroundColor: "#0f172a",
    color: "#e5e7eb",
  };

  return (
    <div
      className={`${spaceMono.variable} bt-os-dashboard${variant === "compact" ? " bt-os-dashboard--compare-col" : ""}`}
      style={{ fontFamily: "'Exo 2', sans-serif" }}
    >

      {whatIfError ? (
        <div className="bt-os-api-error" role="alert">
          <span>
            Analytics API: {whatIfError}
            {whatIfApi ? " Showing last loaded metrics." : ""}
          </span>
          <button
            type="button"
            className="bt-os-api-error-retry"
            disabled={whatIfLoading}
            onClick={() => {
              whatIfAbortRef.current?.abort();
              const ac = new AbortController();
              whatIfAbortRef.current = ac;
              runWhatIfFetch(ac.signal);
            }}
          >
            {whatIfLoading ? "Retrying…" : "Retry"}
          </button>
        </div>
      ) : null}

      <div className={`bt-os-toolbar${variant === "compact" ? " bt-os-toolbar--compact" : ""}`}>
        <div className="bt-os-toolbar-inner">
        {variant === "full" ? (
          <a href="/dashboard/backtest/" className="bt-os-back-link">
            <ArrowLeft className="w-3 h-3" />
            Sessions
          </a>
        ) : panelTitle ? (
          <span className="bt-os-compare-pill" title="Compare column">
            {panelTitle}
          </span>
        ) : null}
        <Filter className="w-3 h-3 bt-os-toolbar-icon" aria-hidden />
        <select value={sessionId} onChange={(e) => onSessionIdChange(e.target.value)}>
          {sessions.map((s: Session) => (
            <option key={s.id} value={String(s.id)}>{s.name} (#{s.id})</option>
          ))}
        </select>
        {onStrategyFilterChange ? (
          <select
            value={strategyFilter}
            onChange={(e) => onStrategyFilterChange(e.target.value)}
            title="Filter trades linked to a Strategies Lab playbook"
          >
            <option value="ALL">All strategies</option>
            {strategies.map((s) => (
              <option key={s.id} value={`strategy:${s.id}`}>
                {s.name}
              </option>
            ))}
          </select>
        ) : null}
        <select value={pairFilter} onChange={(e) => setPairFilter(e.target.value)}>
          <option value="ALL">All instruments</option>
          {pairOptions.map((p: string) => (<option key={p} value={p}>{p}</option>))}
        </select>
        <select value={playbookFilter} onChange={(e) => setPlaybookFilter(e.target.value)}>
          <option value="ALL">All playbooks</option>
          {playbookOptions.map((p: string) => (<option key={p} value={p}>{p}</option>))}
        </select>
        <select value={outcomeFilter} onChange={(e) => setOutcomeFilter(e.target.value)}>
          <option value="ALL">All outcomes</option>
          <option value="WINNERS">Winners</option>
          <option value="LOSERS">Losers</option>
          <option value="BREAKEVEN">Breakeven</option>
        </select>
        <span className="bt-os-toolbar-rule" aria-hidden />
        <label className="bt-os-toolbar-field">
          Start $
          <input
            type="text"
            inputMode="decimal"
            value={importStartBalance}
            onChange={(e) => setImportStartBalance(e.target.value)}
            placeholder="100000"
            className="bt-os-toolbar-input"
            title="Written to session config as startBalance when importing (optional)"
          />
        </label>
        <select
          value={csvImportMode}
          onChange={(e) => setCsvImportMode(e.target.value as "replace" | "append")}
          className="bt-os-filter-select"
        >
          <option value="replace">CSV → replace journal</option>
          <option value="append">CSV → append journal</option>
        </select>
        <input
          ref={csvImportRef}
          type="file"
          accept=".csv,text/csv"
          style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void runCsvImport(f);
          }}
        />
        <button
          type="button"
          className="bt-os-btn-csv"
          title="CSV columns: netPnL (or pnl), closeTime (ms, seconds, or ISO); optional openTime, ticker, rMultiple, mae_r, mfe_r, riskAmount, setup, …"
          disabled={!sessionId || csvImportBusy}
          onClick={() => csvImportRef.current?.click()}
        >
          {csvImportBusy ? "Importing…" : "Import trades CSV"}
        </button>
        <a href="/samples/analytics-demo-500-trades.csv" download className="bt-os-toolbar-auxlink">
          Demo 500
        </a>
        <a href="/samples/analytics-trades-template.csv" download className="bt-os-toolbar-auxlink bt-os-toolbar-auxlink--muted">
          Template
        </a>
        {toolbarEnd ? <div className="bt-os-toolbar-end">{toolbarEnd}</div> : null}
        </div>
      </div>

      {csvImportMsg ? (
        <div className={csvImportMsg.startsWith("Imported") ? "bt-os-csv-msg bt-os-csv-msg--ok" : "bt-os-csv-msg"}>
          {csvImportMsg}
        </div>
      ) : null}

      {journalFetched && sessionId && !loading && !journalError && allTrades.length === 0 ? (
        <div className="bt-os-inline-hint">
          No journal trades for this session yet. Import a CSV with <strong>Import trades CSV</strong> (see
          Demo 500) or record trades in the chart for this session.
        </div>
      ) : null}

      {loading ? (
        <div className="bt-os-loading">Loading…</div>
      ) : journalError ? (
        <div className="bt-os-page-error">{journalError}</div>
      ) : (
        <BacktestOsDashboardLayout
          sessionName={sessionDisplayName}
          strategyLine={sessionDisplayName}
          dateRangeLine={`${osMetricBundles.dateFrom} → ${osMetricBundles.dateTo}`}
          nTrades={stats.total}
          chartPack={osChartPack}
          returnCards={osMetricBundles.returnCards}
          riskCards={osMetricBundles.riskCards}
          drawCards={osMetricBundles.drawCards}
          ratioCards={osMetricBundles.ratioCards}
          tradeCards={osMetricBundles.tradeCards}
          statCards={osMetricBundles.statCards}
          timeCards={osMetricBundles.timeCards}
          quantKpis={quantDashboard.quantKpis}
          talariaScore={quantDashboard.talariaScore}
          scoreTrend={quantDashboard.scoreTrend}
          calendarSection={<PnlCalendarHeatmap trades={filteredTrades} />}
          priceBehaviorTrades={filteredTrades as PriceBehaviorTrade[]}
          advancedSection={(
            <>

        <div className="bt-os-chart-card">
          <div className="bt-os-chart-title">Recent trades</div>
          <div className="bt-os-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ticker</th><th>Side</th><th>Playbook</th><th>PnL</th><th>R</th>
                </tr>
              </thead>
              <tbody>
                {recentTrades.map((t: any, idx: number) => {
                  const pos = t.pnl >= 0;
                  return (
                    <tr key={`${t.tradeId || t.id || idx}`}>
                      <td>{t.ticker}</td>
                      <td>
                        <span className={`bt-os-td-badge ${String(t.direction).toUpperCase().includes("SHORT") || String(t.direction).toUpperCase() === "SELL" ? "bt-os-short" : "bt-os-long"}`}>
                          {String(t.direction || "—").slice(0, 4)}
                        </span>
                      </td>
                      <td>{t.setup || "General"}</td>
                      <td className={pos ? "bt-os-td-pos" : "bt-os-td-neg"}>{fmtMoney(t.pnl)}</td>
                      <td className={pos ? "bt-os-td-pos" : "bt-os-td-neg"}>{t.rr.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bt-os-chart-card" style={{ marginTop: "12px" }}>
          <div className="bt-os-chart-title">Per-pair breakdown</div>
          <div className="bt-os-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th onClick={() => onSortPair("trades")} style={{ cursor:"default" }}>Trades</th>
                  <th>Win%</th>
                  <th onClick={() => onSortPair("netPnl")} style={{ cursor:"default" }}>Net $</th>
                  <th>Net R</th>
                  <th>MAE</th>
                  <th>MFE</th>
                  <th>Cap</th>
                  <th>Comm</th>
                  <th>Spr</th>
                </tr>
              </thead>
              <tbody>
                {sortedPerPair.map((r: any) => (
                  <tr key={r.ticker}>
                    <td>{r.ticker}</td>
                    <td>{r.trades}</td>
                    <td>{fmtPct(r.winRate)}</td>
                    <td className={r.netPnl >= 0 ? "bt-os-td-pos" : "bt-os-td-neg"}>{fmtMoney(r.netPnl)}</td>
                    <td>{r.netRr.toFixed(2)}</td>
                    <td>{r.avgMae.toFixed(2)}</td>
                    <td>{r.avgMfe.toFixed(2)}</td>
                    <td>{r.captureRatio.toFixed(2)}</td>
                    <td>{fmtMoney(r.commissionPaid)}</td>
                    <td>{fmtMoney(r.spreadCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bt-os-chart-card" style={{ marginTop: "12px" }}>
          <div className="bt-os-chart-title">Playbook breakdown</div>
          <div className="bt-os-table-wrap">
            <table>
              <thead>
                <tr><th>Playbook</th><th>Trades</th><th>Win%</th><th>Net PnL</th><th>Avg R</th></tr>
              </thead>
              <tbody>
                {playbookRows.map((r: any) => (
                  <tr key={r.setup}>
                    <td>{r.setup}</td>
                    <td>{r.trades}</td>
                    <td>{fmtPct(r.winRate)}</td>
                    <td className={r.netPnl >= 0 ? "bt-os-td-pos" : "bt-os-td-neg"}>{fmtMoney(r.netPnl)}</td>
                    <td>{r.avgRr.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bt-os-charts-row bt-os-col2" style={{ marginTop: "12px" }}>
          <div className="bt-os-chart-card">
            <div className="bt-os-chart-title">MAE distribution (R)</div>
            <div className="bt-os-table-wrap">
              <table>
                <thead><tr><th>Bin</th><th>Count</th></tr></thead>
                <tbody>
                  {maeDistribution.slice(0, 24).map((row: any, i: number) => (
                    <tr key={i}><td>{row.label}</td><td>{row.count}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="bt-os-chart-card">
            <div className="bt-os-chart-title">MFE distribution (R)</div>
            <div className="bt-os-table-wrap">
              <table>
                <thead><tr><th>Bin</th><th>Count</th></tr></thead>
                <tbody>
                  {mfeDistribution.slice(0, 24).map((row: any, i: number) => (
                    <tr key={i}><td>{row.label}</td><td>{row.count}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="bt-os-chart-card" style={{ marginTop: "12px" }}>
          <div className="bt-os-chart-title">What-if TP/SL · Trades: {whatIfTradesCount}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "12px" }}>
            <label style={{ fontSize: "0.72rem", color: "#9ca3af" }}>
              TP (R){" "}
              <input type="number" min={0.1} step={0.1} value={simTpR} onChange={(e) => setSimTpR(Math.max(0.1, n(e.target.value)))} style={{ marginLeft: 6, width: 72, padding: 4, borderRadius: 4, border: "1px solid rgba(255,255,255,0.15)", background: "#111418", color: "#e8eaed" }} />
            </label>
            <label style={{ fontSize: "0.72rem", color: "#9ca3af" }}>
              SL (R){" "}
              <input type="number" min={0.1} step={0.1} value={simSlR} onChange={(e) => setSimSlR(Math.max(0.1, n(e.target.value)))} style={{ marginLeft: 6, width: 72, padding: 4, borderRadius: 4, border: "1px solid rgba(255,255,255,0.15)", background: "#111418", color: "#e8eaed" }} />
            </label>
          </div>
          {equitySummary ? (
            <div style={{ fontSize: "0.72rem", color: "#9ca3af", marginBottom: "8px" }}>
              Actual final {fmtMoney(n(equitySummary.actual_final))} · Sim {fmtMoney(n(equitySummary.simulated_final))} · Δ{" "}
              <span className={n(equitySummary.delta_final) >= 0 ? "bt-os-td-pos" : "bt-os-td-neg"}>{fmtMoney(n(equitySummary.delta_final))}</span>
            </div>
          ) : null}
          <div style={{ height: 200, position: "relative" }}>
            {whatIfEquityCurve.length > 0 ? (() => {
              const vals = whatIfEquityCurve.map((p: { actual: number }) => n(p.actual));
              const vals2 = whatIfEquityCurve.map((p: { simulated: number }) => n(p.simulated));
              const mn = Math.min(...vals, ...vals2);
              const mx = Math.max(...vals, ...vals2);
              const span = Math.max(mx - mn, 1e-6);
              const nPts = whatIfEquityCurve.length;
              const xa = (i: number) => 40 + (i / Math.max(1, nPts - 1)) * 520;
              const yv = (v: number) => 180 - ((v - mn) / span) * 160;
              const pa = whatIfEquityCurve.map((p: { actual: number }, i: number) => `${xa(i)},${yv(n(p.actual))}`).join(" ");
              const ps = whatIfEquityCurve.map((p: { simulated: number }, i: number) => `${xa(i)},${yv(n(p.simulated))}`).join(" ");
              return (
                <svg width="100%" height="200" viewBox="0 0 600 200" preserveAspectRatio="none" style={{ display: "block" }}>
                  <line x1="40" y1="10" x2="40" y2="180" stroke="rgba(255,255,255,0.08)" />
                  <line x1="40" y1="180" x2="580" y2="180" stroke="rgba(255,255,255,0.08)" />
                  <polyline fill="none" stroke="#94a3b8" strokeWidth={2} points={pa} />
                  <polyline fill="none" stroke="#00ff88" strokeWidth={2} points={ps} />
                </svg>
              );
            })() : (
              <div style={{ color: "#6b7280", fontSize: "0.75rem", padding: "1rem" }}>No simulation data</div>
            )}
          </div>
        </div>

        <div className="bt-os-chart-card" style={{ marginTop: "12px" }}>
          <div className="bt-os-chart-title">
            TP/SL expectancy heatmap · {heatmapPair === "ALL" ? "All" : heatmapPair} · {heatmapTradesCount} trades
            {bestHeatmap ? ` · Best TP ${bestHeatmapTp.toFixed(1)}R / SL ${bestHeatmapSl.toFixed(1)}R` : ""}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "10px", alignItems: "center" }}>
            <label style={{ fontSize: "0.72rem", color: "#9ca3af" }}>
              Pair{" "}
              <select value={heatmapPair} onChange={(e) => setHeatmapPair(e.target.value)} style={{ marginLeft: 6, padding: "4px 8px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.15)", background: "#111418", color: "#e8eaed" }}>
                <option value="ALL">All</option>
                {pairOptions.map((p: string) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
            <div style={{ display: "inline-flex", borderRadius: 4, border: "1px solid rgba(255,255,255,0.12)", overflow: "hidden" }}>
              <button type="button" onClick={() => setHeatmapMetric("USD")} style={{ padding: "4px 10px", fontSize: "0.7rem", border: "none", cursor:"default", background: heatmapMetric === "USD" ? "#2563eb" : "#111418", color: "#e8eaed" }}>$</button>
              <button type="button" onClick={() => setHeatmapMetric("R")} style={{ padding: "4px 10px", fontSize: "0.7rem", border: "none", cursor:"default", background: heatmapMetric === "R" ? "#2563eb" : "#111418", color: "#e8eaed", borderLeft: "1px solid rgba(255,255,255,0.12)" }}>R</button>
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            {(() => {
              const leftPad = 78;
              const topPad = 34;
              const rightPad = 16;
              const bottomPad = 28;
              const cellW = 92;
              const cellH = 40;
              const width = leftPad + heatmapTpLevels.length * cellW + rightPad;
              const height = topPad + heatmapSlLevels.length * cellH + bottomPad;
              return (
                <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="heatmap">
                  <text x={14} y={18} fill="rgba(255,255,255,0.65)" fontSize="11" fontWeight="600">SL \\ TP</text>
                  {heatmapTpLevels.map((tp: number, c: number) => {
                    const x = leftPad + c * cellW + cellW / 2;
                    return (
                      <text key={`tp-${tp}`} x={x} y={20} textAnchor="middle" fill="rgba(255,255,255,0.75)" fontSize="11" fontWeight="600">{tp.toFixed(1)}R</text>
                    );
                  })}
                  {heatmapSlLevels.map((sl: number, r: number) => {
                    const y = topPad + r * cellH + cellH / 2 + 4;
                    return (
                      <text key={`sl-${sl}`} x={leftPad - 10} y={y} textAnchor="end" fill="rgba(255,255,255,0.75)" fontSize="11" fontWeight="600">{sl.toFixed(1)}R</text>
                    );
                  })}
                  {heatmapSlLevels.flatMap((sl: number, r: number) =>
                    heatmapTpLevels.map((tp: number, c: number) => {
                      const value = heatmapLookup.get(`${sl}-${tp}`) ?? 0;
                      const isBest = Boolean(bestHeatmap && bestHeatmapTp === tp && bestHeatmapSl === sl);
                      const x = leftPad + c * cellW;
                      const y = topPad + r * cellH;
                      const label = heatmapMetric === "USD" ? fmtMoney(value) : `${value.toFixed(2)}R`;
                      return (
                        <g key={`c-${sl}-${tp}`}>
                          <rect x={x} y={y} width={cellW} height={cellH} fill={heatColor(value)} stroke="rgba(255,255,255,0.1)" strokeWidth={1} rx={4} ry={4} />
                          {isBest ? <rect x={x + 1.5} y={y + 1.5} width={cellW - 3} height={cellH - 3} fill="none" stroke="rgba(250,204,21,0.95)" strokeWidth={2} rx={4} ry={4} /> : null}
                          <text x={x + cellW / 2} y={y + cellH / 2 + 4} textAnchor="middle" fill={value >= 0 ? "rgba(220,252,231,0.95)" : "rgba(254,226,226,0.95)"} fontSize="11" fontWeight="700">{label}</text>
                        </g>
                      );
                    })
                  )}
                </svg>
              );
            })()}
          </div>
        </div>

            </>
          )}
        />
      )}
    </div>
  );
}
