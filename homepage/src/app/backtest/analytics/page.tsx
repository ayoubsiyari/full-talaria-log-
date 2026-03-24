"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Filter, BarChart3 } from "lucide-react";

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
  setup?: string;
  preTradeNotes?: { setup?: string; tags?: string };
  postTradeNotes?: { setup?: string; tags?: string };
  closeTime?: number;
  exitTime?: number;
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

export default function BacktestAnalyticsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [allTrades, setAllTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pairFilter, setPairFilter] = useState("ALL");
  const [playbookFilter, setPlaybookFilter] = useState("ALL");

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
          rr: n(t.rMultiple ?? t.rewardToRiskRatio),
          mae_r: n(t.mae_r),
          mfe_r: n(t.mfe_r),
          setup,
          closeTs: n(t.closeTime ?? t.exitTime ?? 0),
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
        return passPair && passPlaybook;
      }),
    [normalizedTrades, pairFilter, playbookFilter]
  );

  const stats = useMemo(() => {
    const total = filteredTrades.length;
    const wins = filteredTrades.filter((t) => t.pnl > 0).length;
    const losses = filteredTrades.filter((t) => t.pnl < 0).length;
    const net = filteredTrades.reduce((s, t) => s + t.pnl, 0);
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    const avgRR = total > 0 ? filteredTrades.reduce((s, t) => s + t.rr, 0) / total : 0;
    return { total, wins, losses, net, winRate, avgRR };
  }, [filteredTrades]);

  const perPair = useMemo(() => {
    const map = new Map<string, { trades: number; wins: number; pnl: number; rr: number; mae: number; mfe: number }>();
    filteredTrades.forEach((t) => {
      const key = t.ticker;
      const cur = map.get(key) || { trades: 0, wins: 0, pnl: 0, rr: 0, mae: 0, mfe: 0 };
      cur.trades += 1;
      cur.wins += t.pnl > 0 ? 1 : 0;
      cur.pnl += t.pnl;
      cur.rr += t.rr;
      cur.mae += t.mae_r;
      cur.mfe += t.mfe_r;
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
    }));
  }, [filteredTrades]);

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
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
          >
            {sessions.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name} (#{s.id})
              </option>
            ))}
          </select>
          <select
            value={pairFilter}
            onChange={(e) => setPairFilter(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
          >
            <option value="ALL">All Pairs</option>
            {pairOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            value={playbookFilter}
            onChange={(e) => setPlaybookFilter(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
          >
            <option value="ALL">All Playbooks</option>
            {playbookOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
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
              <div className="rounded-2xl border border-white/10 bg-[#0b0b16]/50 p-4"><div className="text-xs text-white/50">Win Rate</div><div className="text-2xl font-bold">{stats.winRate.toFixed(1)}%</div></div>
              <div className="rounded-2xl border border-white/10 bg-[#0b0b16]/50 p-4"><div className="text-xs text-white/50">Net PnL</div><div className={`text-2xl font-bold ${stats.net >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtMoney(stats.net)}</div></div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0b0b16]/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10 font-semibold">Per-Pair Breakdown</div>
              <table className="w-full">
                <thead>
                  <tr className="text-xs uppercase text-white/50 border-b border-white/10">
                    <th className="text-left px-4 py-2">Ticker</th>
                    <th className="text-right px-4 py-2">Trades</th>
                    <th className="text-right px-4 py-2">Win Rate</th>
                    <th className="text-right px-4 py-2">Net PnL ($)</th>
                    <th className="text-right px-4 py-2">Net PnL (R)</th>
                    <th className="text-right px-4 py-2">Avg MAE (R)</th>
                    <th className="text-right px-4 py-2">Avg MFE (R)</th>
                  </tr>
                </thead>
                <tbody>
                  {perPair.map((r) => (
                    <tr key={r.ticker} className="border-t border-white/5">
                      <td className="px-4 py-2 font-medium">{r.ticker}</td>
                      <td className="px-4 py-2 text-right">{r.trades}</td>
                      <td className="px-4 py-2 text-right">{r.winRate.toFixed(1)}%</td>
                      <td className={`px-4 py-2 text-right ${r.netPnl >= 0 ? "text-green-400" : "text-red-400"}`}>{fmtMoney(r.netPnl)}</td>
                      <td className={`px-4 py-2 text-right ${r.netRr >= 0 ? "text-green-400" : "text-red-400"}`}>{r.netRr.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right">{r.avgMae.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right">{r.avgMfe.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

