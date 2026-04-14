"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Filter, BarChart3 } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";

type Session = {
  id: number;
  name: string;
  session_type?: string;
};

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

async function fetchJson<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", cache: "no-store", ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `Request failed: ${res.status}`);
  }
  return res.json();
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

export default function BacktestAnalyticsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [allTrades, setAllTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pairFilter, setPairFilter] = useState("ALL");
  const [playbookFilter, setPlaybookFilter] = useState("ALL");
  const [outcomeFilter, setOutcomeFilter] = useState("ALL");
  const [simTpR, setSimTpR] = useState(1.5);
  const [simSlR, setSimSlR] = useState(1.0);
  const [heatmapPair, setHeatmapPair] = useState("ALL");
  const [heatmapMetric, setHeatmapMetric] = useState<"USD" | "R">("USD");
  const [whatIfApi, setWhatIfApi] = useState<any>(null);
  const [pairSort, setPairSort] = useState<{ key: string; dir: "asc" | "desc" }>({
    key: "netPnl",
    dir: "desc",
  });

  useEffect(() => {
    try {
      const search = typeof window !== "undefined" ? window.location.search : "";
      const sid = new URLSearchParams(search).get("sessionId") || "";
      if (sid) setSelectedSessionId(sid);
    } catch {}
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await fetchJson<{ sessions: Session[] }>("/api/sessions");
        if (!mounted) return;
        const list = data.sessions ?? [];
        setSessions(list);
        // Do not overwrite ?sessionId= from URL: async completion can run with a stale
        // selectedSessionId closure and previously replaced the user's session with list[0].
        setSelectedSessionId((prev) => {
          if (prev) return prev;
          try {
            const sid = new URLSearchParams(window.location.search).get("sessionId");
            if (sid) return sid;
          } catch {
            /* ignore */
          }
          if (list.length > 0) return String(list[0].id);
          return prev;
        });
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!selectedSessionId) {
      setLoading(false);
      setAllTrades([]);
      return;
    }
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const payload = await fetchJson<{ state?: { journal?: Trade[] } }>(
          `/api/sessions/${encodeURIComponent(selectedSessionId)}/state`
        );
        if (!mounted) return;
        const journal = Array.isArray(payload?.state?.journal) ? payload.state!.journal! : [];
        setAllTrades(journal);
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : String(e));
        setAllTrades([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [selectedSessionId]);

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
          capture_ratio: n(t.mfe_r) > 0 ? n(t.rMultiple ?? t.rewardToRiskRatio) / n(t.mfe_r) : 0,
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
        return passPair && passPlaybook && passOutcome;
      }),
    [normalizedTrades, pairFilter, playbookFilter, outcomeFilter]
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

  useEffect(() => {
    let mounted = true;
    if (!selectedSessionId) {
      setWhatIfApi(null);
      return;
    }
    (async () => {
      try {
        const payload = await fetchJson<any>("/api/analytics/backtest/whatif", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: Number(selectedSessionId),
            pair_filter: pairFilter,
            playbook_filter: playbookFilter,
            outcome_filter: outcomeFilter,
            heatmap_pair: heatmapPair,
            tp_r: simTpR,
            sl_r: simSlR,
          }),
        });
        if (!mounted) return;
        setWhatIfApi(payload || null);
      } catch {
        if (!mounted) return;
        setWhatIfApi(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [selectedSessionId, pairFilter, playbookFilter, outcomeFilter, heatmapPair, simTpR, simSlR]);

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

  const bestHeatmap = heatmapData[0];
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

  const filterSelectClass =
    "rounded-lg border px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/60";
  const filterSelectStyle: React.CSSProperties = {
    backgroundColor: "rgba(15, 23, 42, 0.95)",
    borderColor: "rgba(148, 163, 184, 0.35)",
    color: "#e5e7eb",
  };
  const filterOptionStyle: React.CSSProperties = {
    backgroundColor: "#0f172a",
    color: "#e5e7eb",
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a
              href="/backtest"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Sessions
            </a>
            <h1 className="text-2xl font-bold inline-flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-blue-400" />
              Backtest Analytics
            </h1>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0b0b16]/50 backdrop-blur-xl p-4 flex flex-wrap gap-3 items-center">
          <Filter className="w-4 h-4 text-white/60" />
          <select
            value={selectedSessionId}
            onChange={(e) => setSelectedSessionId(e.target.value)}
            className={filterSelectClass}
            style={filterSelectStyle}
          >
            {sessions.map((s: any) => (
              <option key={s.id} value={String(s.id)} style={filterOptionStyle}>
                {s.name} (#{s.id})
              </option>
            ))}
          </select>
          <select
            value={pairFilter}
            onChange={(e) => setPairFilter(e.target.value)}
            className={filterSelectClass}
            style={filterSelectStyle}
          >
            <option value="ALL" style={filterOptionStyle}>All Instruments</option>
            {pairOptions.map((p: any) => (
              <option key={p} value={p} style={filterOptionStyle}>
                {p}
              </option>
            ))}
          </select>
          <select
            value={playbookFilter}
            onChange={(e) => setPlaybookFilter(e.target.value)}
            className={filterSelectClass}
            style={filterSelectStyle}
          >
            <option value="ALL" style={filterOptionStyle}>All Playbooks</option>
            {playbookOptions.map((p: any) => (
              <option key={p} value={p} style={filterOptionStyle}>
                {p}
              </option>
            ))}
          </select>
          <select
            value={outcomeFilter}
            onChange={(e) => setOutcomeFilter(e.target.value)}
            className={filterSelectClass}
            style={filterSelectStyle}
          >
            <option value="ALL" style={filterOptionStyle}>All Outcomes</option>
            <option value="WINNERS" style={filterOptionStyle}>Winners Only</option>
            <option value="LOSERS" style={filterOptionStyle}>Losers Only</option>
            <option value="BREAKEVEN" style={filterOptionStyle}>Breakeven Only</option>
          </select>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-[#0b0b16]/50 p-10 text-center text-white/60">Loading analytics...</div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-red-200">{error}</div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="rounded-2xl border border-white/10 bg-[#0b0b16]/50 p-4"><div className="text-xs text-white/50">Total Trades</div><div className="text-2xl font-bold">{stats.total}</div></div>
              <div className="rounded-2xl border border-white/10 bg-[#0b0b16]/50 p-4"><div className="text-xs text-white/50">Wins</div><div className="text-2xl font-bold text-green-400">{stats.wins}</div></div>
              <div className="rounded-2xl border border-white/10 bg-[#0b0b16]/50 p-4"><div className="text-xs text-white/50">Losses</div><div className="text-2xl font-bold text-red-400">{stats.losses}</div></div>
              <div className="rounded-2xl border border-white/10 bg-[#0b0b16]/50 p-4"><div className="text-xs text-white/50">Win Rate</div><div className="text-2xl font-bold">{fmtPct(stats.winRate)}</div></div>
              <div className="rounded-2xl border border-white/10 bg-[#0b0b16]/50 p-4"><div className="text-xs text-white/50">Net PnL</div><div className={`text-2xl font-bold ${stats.net >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtMoney(stats.net)}</div></div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-white/10 bg-[#0b0b16]/50 p-4"><div className="text-xs text-white/50">Profit Factor</div><div className="text-xl font-bold">{stats.profitFactor.toFixed(2)}</div></div>
              <div className="rounded-2xl border border-white/10 bg-[#0b0b16]/50 p-4"><div className="text-xs text-white/50">Expectancy / Trade</div><div className={`text-xl font-bold ${stats.expectancy >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtMoney(stats.expectancy)}</div></div>
              <div className="rounded-2xl border border-white/10 bg-[#0b0b16]/50 p-4"><div className="text-xs text-white/50">Avg Win / Avg Loss</div><div className="text-xl font-bold">{fmtMoney(stats.avgWin)} / {fmtMoney(stats.avgLoss)}</div></div>
              <div className="rounded-2xl border border-white/10 bg-[#0b0b16]/50 p-4"><div className="text-xs text-white/50">Avg R</div><div className="text-xl font-bold">{stats.avgRR.toFixed(2)}</div></div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-white/10 bg-[#0b0b16]/50 p-4"><div className="text-xs text-white/50">Best Trade</div><div className="text-xl font-bold text-green-400">{fmtMoney(Number.isFinite(stats.best?.pnl) ? stats.best.pnl : 0)}</div><div className="text-xs text-white/40">{stats.best?.ticker || "-"}</div></div>
              <div className="rounded-2xl border border-white/10 bg-[#0b0b16]/50 p-4"><div className="text-xs text-white/50">Worst Trade</div><div className="text-xl font-bold text-red-400">{fmtMoney(Number.isFinite(stats.worst?.pnl) ? stats.worst.pnl : 0)}</div><div className="text-xs text-white/40">{stats.worst?.ticker || "-"}</div></div>
              <div className="rounded-2xl border border-white/10 bg-[#0b0b16]/50 p-4"><div className="text-xs text-white/50">Long PnL</div><div className={`text-xl font-bold ${stats.longPnl >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtMoney(stats.longPnl)}</div></div>
              <div className="rounded-2xl border border-white/10 bg-[#0b0b16]/50 p-4"><div className="text-xs text-white/50">Short PnL</div><div className={`text-xl font-bold ${stats.shortPnl >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtMoney(stats.shortPnl)}</div></div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0b0b16]/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10 font-semibold">Per-Pair Breakdown</div>
              <table className="w-full">
                <thead>
                  <tr className="text-xs uppercase text-white/50 border-b border-white/10">
                    <th className="text-left px-4 py-2 cursor-pointer" onClick={() => onSortPair("ticker")}>Ticker</th>
                    <th className="text-right px-4 py-2 cursor-pointer" onClick={() => onSortPair("trades")}>Trades</th>
                    <th className="text-right px-4 py-2 cursor-pointer" onClick={() => onSortPair("winRate")}>Win Rate</th>
                    <th className="text-right px-4 py-2 cursor-pointer" onClick={() => onSortPair("netPnl")}>Net PnL ($)</th>
                    <th className="text-right px-4 py-2 cursor-pointer" onClick={() => onSortPair("netRr")}>Net PnL (R)</th>
                    <th className="text-right px-4 py-2 cursor-pointer" onClick={() => onSortPair("avgMae")}>Avg MAE (R)</th>
                    <th className="text-right px-4 py-2 cursor-pointer" onClick={() => onSortPair("avgMfe")}>Avg MFE (R)</th>
                    <th className="text-right px-4 py-2 cursor-pointer" onClick={() => onSortPair("captureRatio")}>Capture Ratio</th>
                    <th className="text-right px-4 py-2 cursor-pointer" onClick={() => onSortPair("commissionPaid")}>Commission Paid</th>
                    <th className="text-right px-4 py-2 cursor-pointer" onClick={() => onSortPair("spreadCost")}>Spread Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPerPair.map((r: any) => (
                    <tr key={r.ticker} className="border-t border-white/5">
                      <td className="px-4 py-2 font-medium">{r.ticker}</td>
                      <td className="px-4 py-2 text-right">{r.trades}</td>
                      <td className="px-4 py-2 text-right">{fmtPct(r.winRate)}</td>
                      <td className={`px-4 py-2 text-right ${r.netPnl >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtMoney(r.netPnl)}</td>
                      <td className={`px-4 py-2 text-right ${r.netRr >= 0 ? "text-green-400" : "text-red-400"}`}>{r.netRr.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right">{r.avgMae.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right">{r.avgMfe.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right">{r.captureRatio.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right">{fmtMoney(r.commissionPaid)}</td>
                      <td className="px-4 py-2 text-right">{fmtMoney(r.spreadCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-white/10 bg-[#0b0b16]/50 p-4">
                <div className="font-semibold mb-3">Equity Curve (Multi-Instrument)</div>
                <div className="h-72">
                  {equityCurve.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={equityCurve}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                        <XAxis dataKey="idx" tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 11 }} />
                        <YAxis tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 11 }} />
                        <Tooltip
                          formatter={(value, _name, item: any) => [
                            fmtMoney(Number(value || 0)),
                            item?.payload?.ticker ? `Equity (${item.payload.ticker})` : "Equity",
                          ]}
                          contentStyle={{ background: "#0b1220", border: "1px solid rgba(148,163,184,0.35)", color: "#e5e7eb" }}
                        />
                        <Line
                          type="monotone"
                          dataKey="equity"
                          stroke="#60a5fa"
                          strokeWidth={2.5}
                          dot={(props: any) => {
                            const { cx, cy, payload } = props;
                            if (cx == null || cy == null) return null;
                            return <circle cx={cx} cy={cy} r={3.5} fill={payload?.pointColor || "#3b82f6"} />;
                          }}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-white/40 text-sm">No equity data</div>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 mt-2 text-xs text-white/60">
                  {pairOptions.map((p: any) => (
                    <span key={p} className="inline-flex items-center gap-1.5">
                      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: tickerColor.get(p) || "#3b82f6" }} />
                      {p}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#0b0b16]/50 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 font-semibold">Playbook Breakdown</div>
                <table className="w-full">
                  <thead>
                    <tr className="text-xs uppercase text-white/50 border-b border-white/10">
                      <th className="text-left px-4 py-2">Playbook</th>
                      <th className="text-right px-4 py-2">Trades</th>
                      <th className="text-right px-4 py-2">Win Rate</th>
                      <th className="text-right px-4 py-2">Net PnL</th>
                      <th className="text-right px-4 py-2">Avg R</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playbookRows.map((r: any) => (
                      <tr key={r.setup} className="border-t border-white/5">
                        <td className="px-4 py-2">{r.setup}</td>
                        <td className="px-4 py-2 text-right">{r.trades}</td>
                        <td className="px-4 py-2 text-right">{fmtPct(r.winRate)}</td>
                        <td className={`px-4 py-2 text-right ${r.netPnl >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtMoney(r.netPnl)}</td>
                        <td className="px-4 py-2 text-right">{r.avgRr.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#0b0b16]/50 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 font-semibold">Recent Trades</div>
                <table className="w-full">
                  <thead>
                    <tr className="text-xs uppercase text-white/50 border-b border-white/10">
                      <th className="text-left px-4 py-2">Ticker</th>
                      <th className="text-left px-4 py-2">Side</th>
                      <th className="text-left px-4 py-2">Playbook</th>
                      <th className="text-right px-4 py-2">PnL</th>
                      <th className="text-right px-4 py-2">R</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTrades.map((t: any, idx: number) => (
                      <tr key={`${t.tradeId || t.id || idx}`} className="border-t border-white/5">
                        <td className="px-4 py-2">{t.ticker}</td>
                        <td className="px-4 py-2">{t.direction || "-"}</td>
                        <td className="px-4 py-2">{t.setup || "General"}</td>
                        <td className={`px-4 py-2 text-right ${t.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtMoney(t.pnl)}</td>
                        <td className={`px-4 py-2 text-right ${t.rr >= 0 ? "text-green-400" : "text-red-400"}`}>{t.rr.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-white/10 bg-[#0b0b16]/50 p-4">
                <div className="font-semibold mb-3">MAE Distribution (R)</div>
                <div className="text-xs text-white/50 mb-3">
                  Scope: {pairFilter === "ALL" ? "All Instruments" : pairFilter}
                </div>
                <div className="h-72">
                  {maeDistribution.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={maeDistribution}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                        <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 11 }} interval="preserveStartEnd" />
                        <YAxis tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 11 }} allowDecimals={false} />
                        <Tooltip
                          formatter={(value) => [value, "Trades"]}
                          contentStyle={{ background: "#0b1220", border: "1px solid rgba(148,163,184,0.35)", color: "#e5e7eb" }}
                        />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {maeDistribution.map((entry: any, idx: number) => (
                            <Cell key={`mae-${idx}`} fill={entry.from < 0 ? "#ef4444" : "#f59e0b"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-white/40 text-sm">No MAE data</div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#0b0b16]/50 p-4">
                <div className="font-semibold mb-3">MFE Distribution (R)</div>
                <div className="text-xs text-white/50 mb-3">
                  Scope: {pairFilter === "ALL" ? "All Instruments" : pairFilter}
                </div>
                <div className="h-72">
                  {mfeDistribution.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={mfeDistribution}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                        <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 11 }} interval="preserveStartEnd" />
                        <YAxis tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 11 }} allowDecimals={false} />
                        <Tooltip
                          formatter={(value) => [value, "Trades"]}
                          contentStyle={{ background: "#0b1220", border: "1px solid rgba(148,163,184,0.35)", color: "#e5e7eb" }}
                        />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {mfeDistribution.map((entry: any, idx: number) => (
                            <Cell key={`mfe-${idx}`} fill={entry.to > 0 ? "#22c55e" : "#3b82f6"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-white/40 text-sm">No MFE data</div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0b0b16]/50 p-4 space-y-4">
              <div className="font-semibold">What-If TP/SL Simulator</div>
              <div className="flex flex-wrap gap-3 items-center">
                <label className="text-sm text-white/70">
                  TP (R)
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={simTpR}
                    onChange={(e) => setSimTpR(Math.max(0.1, n(e.target.value)))}
                    className="ml-2 w-24 rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-sm"
                  />
                </label>
                <label className="text-sm text-white/70">
                  SL (R)
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={simSlR}
                    onChange={(e) => setSimSlR(Math.max(0.1, n(e.target.value)))}
                    className="ml-2 w-24 rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-sm"
                  />
                </label>
                <div className="text-xs text-white/50">
                  Scope: {pairFilter === "ALL" ? "All Instruments" : pairFilter} | Trades: {whatIfTradesCount}
                </div>
              </div>

              {equitySummary ? (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                    <div className="text-[11px] text-white/50">Actual Final</div>
                    <div className="text-sm font-semibold">{fmtMoney(n(equitySummary.actual_final))}</div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                    <div className="text-[11px] text-white/50">Simulated Final</div>
                    <div className="text-sm font-semibold">{fmtMoney(n(equitySummary.simulated_final))}</div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                    <div className="text-[11px] text-white/50">Delta</div>
                    <div className={`text-sm font-semibold ${n(equitySummary.delta_final) >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {fmtMoney(n(equitySummary.delta_final))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                    <div className="text-[11px] text-white/50">Max DD (Act/Sim)</div>
                    <div className="text-sm font-semibold">
                      {fmtMoney(n(equitySummary.actual_max_drawdown))} / {fmtMoney(n(equitySummary.simulated_max_drawdown))}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="h-72">
                {whatIfEquityCurve.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={whatIfEquityCurve}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="idx" tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 11 }} />
                      <YAxis tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 11 }} />
                      <Tooltip
                        formatter={(value, name) => [fmtMoney(Number(value || 0)), name === "simulated" ? "Simulated" : "Actual"]}
                        contentStyle={{ background: "#0b1220", border: "1px solid rgba(148,163,184,0.35)", color: "#e5e7eb" }}
                      />
                      <Line type="monotone" dataKey="actual" stroke="#94a3b8" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="simulated" stroke="#22c55e" strokeWidth={2.4} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-white/40 text-sm">No simulation data</div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0b0b16]/50 p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="font-semibold">Per-Instrument Expectancy Heatmap (TP/SL)</div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-sm text-white/70">
                    Run heatmap for:
                    <select
                      value={heatmapPair}
                      onChange={(e) => setHeatmapPair(e.target.value)}
                      className="ml-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                    >
                      <option value="ALL">All</option>
                      {pairOptions.map((p: any) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="inline-flex rounded-lg border border-white/10 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setHeatmapMetric("USD")}
                      className={`px-3 py-2 text-sm ${heatmapMetric === "USD" ? "bg-blue-600 text-white" : "bg-white/5 text-white/70 hover:bg-white/10"}`}
                    >
                      Expectancy ($)
                    </button>
                    <button
                      type="button"
                      onClick={() => setHeatmapMetric("R")}
                      className={`px-3 py-2 text-sm border-l border-white/10 ${heatmapMetric === "R" ? "bg-blue-600 text-white" : "bg-white/5 text-white/70 hover:bg-white/10"}`}
                    >
                      Expectancy (R)
                    </button>
                  </div>
                </div>
              </div>

              <div className="text-xs text-white/50">
                Scope: {heatmapPair === "ALL" ? "All Instruments (blended)" : heatmapPair} | Trades: {heatmapTradesCount}
                {bestHeatmap
                  ? ` | Best: TP ${bestHeatmapTp.toFixed(1)}R / SL ${bestHeatmapSl.toFixed(1)}R (Expectancy ${
                      heatmapMetric === "USD"
                        ? fmtMoney(bestHeatmapValue)
                        : `${bestHeatmapValue.toFixed(2)}R`
                    })`
                  : ""}
              </div>

              <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#0b1220]/40 p-3">
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
                    <svg
                      width={width}
                      height={height}
                      viewBox={`0 0 ${width} ${height}`}
                      role="img"
                      aria-label="TP/SL expectancy heatmap"
                    >
                      <text x={14} y={18} fill="rgba(255,255,255,0.65)" fontSize="11" fontWeight="600">
                        SL \ TP
                      </text>

                      {heatmapTpLevels.map((tp: any, c: number) => {
                        const x = leftPad + c * cellW + cellW / 2;
                        return (
                          <text
                            key={`tp-label-${tp}`}
                            x={x}
                            y={20}
                            textAnchor="middle"
                            fill="rgba(255,255,255,0.75)"
                            fontSize="11"
                            fontWeight="600"
                          >
                            {tp.toFixed(1)}R
                          </text>
                        );
                      })}

                      {heatmapSlLevels.map((sl: any, r: number) => {
                        const y = topPad + r * cellH + cellH / 2 + 4;
                        return (
                          <text
                            key={`sl-label-${sl}`}
                            x={leftPad - 10}
                            y={y}
                            textAnchor="end"
                            fill="rgba(255,255,255,0.75)"
                            fontSize="11"
                            fontWeight="600"
                          >
                            {sl.toFixed(1)}R
                          </text>
                        );
                      })}

                      {heatmapSlLevels.flatMap((sl: any, r: number) =>
                        heatmapTpLevels.map((tp: any, c: number) => {
                          const value = heatmapLookup.get(`${sl}-${tp}`) ?? 0;
                          const isBest = Boolean(bestHeatmap && bestHeatmapTp === tp && bestHeatmapSl === sl);
                          const x = leftPad + c * cellW;
                          const y = topPad + r * cellH;
                          const label = heatmapMetric === "USD" ? fmtMoney(value) : `${value.toFixed(2)}R`;
                          return (
                            <g key={`cell-${sl}-${tp}`}>
                              <rect
                                x={x}
                                y={y}
                                width={cellW}
                                height={cellH}
                                fill={heatColor(value)}
                                stroke="rgba(255,255,255,0.1)"
                                strokeWidth={1}
                                rx={4}
                                ry={4}
                              />
                              {isBest ? (
                                <rect
                                  x={x + 1.5}
                                  y={y + 1.5}
                                  width={cellW - 3}
                                  height={cellH - 3}
                                  fill="none"
                                  stroke="rgba(250,204,21,0.95)"
                                  strokeWidth={2}
                                  rx={4}
                                  ry={4}
                                />
                              ) : null}
                              <text
                                x={x + cellW / 2}
                                y={y + cellH / 2 + 4}
                                textAnchor="middle"
                                fill={value >= 0 ? "rgba(220,252,231,0.95)" : "rgba(254,226,226,0.95)"}
                                fontSize="11"
                                fontWeight="700"
                              >
                                {label}
                              </text>
                              <title>
                                {`TP ${tp.toFixed(1)}R / SL ${sl.toFixed(1)}R => ${label} expectancy`}
                              </title>
                            </g>
                          );
                        })
                      )}
                    </svg>
                  );
                })()}
              </div>

              <div className="flex items-center gap-3 text-xs text-white/60">
                <span>Intensity scale:</span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "rgba(239,68,68,0.6)" }} />
                  Loss
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "rgba(148,163,184,0.25)" }} />
                  Near zero
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "rgba(34,197,94,0.6)" }} />
                  Profit
                </span>
                <span className="ml-auto">
                  Range: {heatmapMetric === "USD"
                    ? `${fmtMoney(heatmapValueRange.min)} to ${fmtMoney(heatmapValueRange.max)}`
                    : `${heatmapValueRange.min.toFixed(2)}R to ${heatmapValueRange.max.toFixed(2)}R`}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

