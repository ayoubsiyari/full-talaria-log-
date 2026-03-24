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
        if (!selectedSessionId && list.length > 0) {
          setSelectedSessionId(String(list[0].id));
        }
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      mounted = false;
    };
  }, [selectedSessionId]);

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

  const stats = useMemo(() => {
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

  const perPair = useMemo(() => {
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

  const playbookRows = useMemo(() => {
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

  const recentTrades = useMemo(
    () => [...filteredTrades].sort((a, b) => b.closeTs - a.closeTs).slice(0, 15),
    [filteredTrades]
  );

  const maeDistribution = useMemo(
    () => buildHistogram(filteredTrades.filter((t: any) => t.hasMae).map((t) => t.mae_r), 0.5),
    [filteredTrades]
  );
  const mfeDistribution = useMemo(
    () => buildHistogram(filteredTrades.filter((t: any) => t.hasMfe).map((t) => t.mfe_r), 0.5),
    [filteredTrades]
  );

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

  const whatIfTrades = useMemo(
    () => [...filteredTrades].sort((a, b) => a.closeTs - b.closeTs),
    [filteredTrades]
  );

  const whatIfRows = useMemo(() => {
    const tp = Math.max(0.1, simTpR);
    const sl = Math.max(0.1, simSlR);
    return whatIfTrades.map((t) => {
      const mae = n((t as any).mae_r);
      const mfe = n((t as any).mfe_r);
      const actualR = n((t as any).rr);
      const spreadCost = n((t as any).spread_pips_at_entry) * n((t as any).pip_value_at_entry) * n((t as any).quantity);
      const commissionCost = n((t as any).commission_at_entry) * n((t as any).quantity) * 2;
      const totalCost = spreadCost + commissionCost;
      const riskUsd = Math.max(0, n((t as any).riskUsd));

      const hitsTp = mfe >= tp;
      const hitsSl = mae <= -sl;
      let simR = actualR;
      if (hitsTp && !hitsSl) simR = tp;
      else if (!hitsTp && hitsSl) simR = -sl;
      else if (hitsTp && hitsSl) simR = actualR >= 0 ? tp : -sl;

      const simGross = simR * riskUsd;
      const simNet = simGross - totalCost;
      return {
        ...t,
        simR,
        simNet,
        actualNet: n((t as any).pnl),
      };
    });
  }, [whatIfTrades, simTpR, simSlR]);

  const whatIfEquityCurve = useMemo(() => {
    let actual = 0;
    let simulated = 0;
    return whatIfRows.map((t, idx) => {
      actual += n((t as any).actualNet);
      simulated += n((t as any).simNet);
      return {
        idx: idx + 1,
        ticker: (t as any).ticker,
        actual,
        simulated,
      };
    });
  }, [whatIfRows]);

  const heatmapTrades = useMemo(
    () =>
      whatIfTrades.filter((t) => heatmapPair === "ALL" || (t as any).ticker === heatmapPair),
    [whatIfTrades, heatmapPair]
  );

  const heatmapData = useMemo(() => {
    const tpGrid = [0.5, 1, 1.5, 2, 2.5, 3];
    const slGrid = [0.5, 1, 1.5, 2, 2.5, 3];
    const rows: Array<{ tp: number; sl: number; expectancyUsd: number; expectancyR: number; trades: number }> = [];

    for (const tp of tpGrid) {
      for (const sl of slGrid) {
        const sims = heatmapTrades.map((t) => {
          const mae = n((t as any).mae_r);
          const mfe = n((t as any).mfe_r);
          const actualR = n((t as any).rr);
          const spreadCost = n((t as any).spread_pips_at_entry) * n((t as any).pip_value_at_entry) * n((t as any).quantity);
          const commissionCost = n((t as any).commission_at_entry) * n((t as any).quantity) * 2;
          const riskUsd = Math.max(0, n((t as any).riskUsd));

          const hitsTp = mfe >= tp;
          const hitsSl = mae <= -sl;
          let simR = actualR;
          if (hitsTp && !hitsSl) simR = tp;
          else if (!hitsTp && hitsSl) simR = -sl;
          else if (hitsTp && hitsSl) simR = actualR >= 0 ? tp : -sl;

          const simNetUsd = simR * riskUsd - (spreadCost + commissionCost);
          const costR = riskUsd > 0 ? (spreadCost + commissionCost) / riskUsd : 0;
          const simNetR = simR - costR;
          return { simNetUsd, simNetR };
        });
        const expectancyUsd =
          sims.length > 0 ? sims.reduce((s, v) => s + v.simNetUsd, 0) / sims.length : 0;
        const expectancyR =
          sims.length > 0 ? sims.reduce((s, v) => s + v.simNetR, 0) / sims.length : 0;
        rows.push({ tp, sl, expectancyUsd, expectancyR, trades: sims.length });
      }
    }
    return rows.sort((a, b) =>
      heatmapMetric === "USD"
        ? b.expectancyUsd - a.expectancyUsd
        : b.expectancyR - a.expectancyR
    );
  }, [heatmapTrades, heatmapMetric]);

  const bestHeatmap = heatmapData[0];
  const heatmapValueRange = useMemo(() => {
    if (heatmapData.length === 0) return { min: 0, max: 0, absMax: 1 };
    const vals = heatmapData.map((h) =>
      heatmapMetric === "USD" ? h.expectancyUsd : h.expectancyR
    );
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const absMax = Math.max(Math.abs(min), Math.abs(max), 1e-9);
    return { min, max, absMax };
  }, [heatmapData]);

  const heatmapTpLevels = useMemo(
    () => Array.from(new Set(heatmapData.map((h) => h.tp))).sort((a, b) => a - b),
    [heatmapData]
  );
  const heatmapSlLevels = useMemo(
    () => Array.from(new Set(heatmapData.map((h) => h.sl))).sort((a, b) => a - b),
    [heatmapData]
  );
  const heatmapLookup = useMemo(() => {
    const m = new Map<string, number>();
    heatmapData.forEach((h) =>
      m.set(`${h.sl}-${h.tp}`, heatmapMetric === "USD" ? h.expectancyUsd : h.expectancyR)
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
            {sessions.map((s) => (
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
            {pairOptions.map((p) => (
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
            {playbookOptions.map((p) => (
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
                  {sortedPerPair.map((r) => (
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
                  {pairOptions.map((p) => (
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
                    {playbookRows.map((r) => (
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
                    {recentTrades.map((t, idx) => (
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
                          {maeDistribution.map((entry, idx) => (
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
                          {mfeDistribution.map((entry, idx) => (
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
                  Scope: {pairFilter === "ALL" ? "All Instruments" : pairFilter} | Trades: {whatIfRows.length}
                </div>
              </div>

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
                      {pairOptions.map((p) => (
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
                Scope: {heatmapPair === "ALL" ? "All Instruments (blended)" : heatmapPair} | Trades: {heatmapTrades.length}
                {bestHeatmap
                  ? ` | Best: TP ${bestHeatmap.tp.toFixed(1)}R / SL ${bestHeatmap.sl.toFixed(1)}R (Expectancy ${
                      heatmapMetric === "USD"
                        ? fmtMoney(bestHeatmap.expectancyUsd)
                        : `${bestHeatmap.expectancyR.toFixed(2)}R`
                    })`
                  : ""}
              </div>

              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full min-w-[620px] border-collapse text-xs">
                  <thead>
                    <tr className="bg-white/5">
                      <th className="px-3 py-2 text-left text-white/70 border-b border-white/10">SL \\ TP</th>
                      {heatmapTpLevels.map((tp) => (
                        <th key={`tp-${tp}`} className="px-3 py-2 text-center text-white/70 border-b border-white/10">
                          {tp.toFixed(1)}R
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {heatmapSlLevels.map((sl) => (
                      <tr key={`sl-row-${sl}`} className="border-t border-white/10">
                        <td className="px-3 py-2 text-white/70 bg-white/5 font-medium">{sl.toFixed(1)}R</td>
                        {heatmapTpLevels.map((tp) => {
                          const value = heatmapLookup.get(`${sl}-${tp}`) ?? 0;
                          const isBest = bestHeatmap && bestHeatmap.tp === tp && bestHeatmap.sl === sl;
                          return (
                            <td
                              key={`cell-${sl}-${tp}`}
                              className="px-2 py-2 text-center border-l border-white/10"
                              style={{
                                background: heatColor(value),
                                boxShadow: isBest ? "inset 0 0 0 2px rgba(250,204,21,0.9)" : undefined,
                              }}
                              title={`TP ${tp.toFixed(1)}R / SL ${sl.toFixed(1)}R => ${
                                heatmapMetric === "USD" ? fmtMoney(value) : `${value.toFixed(2)}R`
                              } expectancy`}
                            >
                              <span className={value >= 0 ? "text-green-200 font-semibold" : "text-red-200 font-semibold"}>
                                {heatmapMetric === "USD" ? fmtMoney(value) : `${value.toFixed(2)}R`}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
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

