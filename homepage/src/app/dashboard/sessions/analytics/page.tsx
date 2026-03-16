"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import {
  Activity,
  DollarSign,
  Target,
  TrendingDown,
  TrendingUp,
  BarChart3,
} from "lucide-react";

type AnalyticsResponse = {
  analytics: {
    session: { id: number; name: string; session_type: string };
    kpis: {
      trades: number;
      wins: number;
      losses: number;
      breakeven: number;
      net_pnl: number;
      gross_profit: number;
      gross_loss: number;
      profit_factor: number | null;
      win_rate: number | null;
      avg_pnl: number | null;
      avg_win: number | null;
      avg_loss: number | null;
      expectancy_r: number | null;
      sharpe: number | null;
      sortino: number | null;
      max_drawdown: number | null;
      max_drawdown_pct: number | null;
      recovery_factor: number | null;
      start_balance: number | null;
    };
    series: {
      equity: Array<{ x: string; y: number }>;
      drawdown: Array<{ x: string; y: number }>;
      monthly_pnl: Array<{ x: string; y: number }>;
      weekday_winrate: Array<{ x: string; y: number; n: number }>;
    };
    recent_trades: Array<{
      trade_id: string | null;
      date: string | null;
      symbol: string | null;
      side: string | null;
      entry: number | string | null;
      exit: number | string | null;
      pnl: number;
      status: "win" | "loss" | "breakeven";
      stop_loss?: number | string | null;
      take_profit?: number | string | null;
      risk_amount?: number | string | null;
      rr_planned?: number | null;
      rr_actual?: number | null;
      r_multiple?: number | string | null;
      price_move_pips?: number | null;
      quantity?: number | string | null;
      close_type?: string | null;
      holding_time_hours?: number | string | null;
      entry_time?: string | null;
      exit_time?: string | null;
      day_of_week?: string | null;
      month?: number | string | null;
      year?: number | string | null;
      hour_of_entry?: number | string | null;
      hour_of_exit?: number | string | null;
      mfe?: number | string | null;
      mae?: number | string | null;
      highest_price?: number | string | null;
      lowest_price?: number | string | null;
      pre_trade_notes?: string | null;
      post_trade_notes?: string | null;
      has_entry_screenshot?: boolean;
      has_exit_screenshot?: boolean;
    }>;
  };
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...(init || {}), credentials: "include" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as any;
    throw new Error(body?.detail ? String(body.detail) : `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const sign = v >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(2)}%`;
}

function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (!Number.isFinite(v)) return "∞";
  return v.toFixed(digits);
}

function fmtText(v: any): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string" && v.trim() === "") return "—";
  return String(v);
}

function fmtDateTime(v: any): string {
  if (v === null || v === undefined) return "—";
  try {
    const d = new Date(String(v));
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString();
  } catch {
    return "—";
  }
}

function fmtMaybeNum(v: any, digits = 2): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "—";
    return v.toFixed(digits);
  }
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return "—";
    const n = Number(s);
    if (!Number.isNaN(n) && Number.isFinite(n)) return n.toFixed(digits);
    return s;
  }
  return String(v);
}

async function fetchTradeScreenshot(params: {
  sessionId: string;
  tradeId: string;
  kind: "entry" | "exit";
}): Promise<string | null> {
  const q = new URLSearchParams({ kind: params.kind });
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(params.sessionId)}/trades/${encodeURIComponent(
      params.tradeId
    )}/screenshot?${q.toString()}`,
    { credentials: "include" }
  );
  if (res.status === 204) {
    return null;
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as any;
    throw new Error(body?.detail ? String(body.detail) : `Request failed: ${res.status}`);
  }

  const contentType = (res.headers.get("content-type") || "").toLowerCase();

  // Backward compatibility: older API returned JSON { image: "data:image/..." }
  if (contentType.includes("application/json")) {
    const body = (await res.json().catch(() => null)) as any;
    const img = body?.image ?? null;
    if (!img) return null;
    if (typeof img === "string") {
      const s = img.trim();
      if (!s) return null;
      // data URL / remote URL are usable directly
      if (s.startsWith("data:image/") || s.startsWith("http://") || s.startsWith("https://")) {
        return s;
      }
      // raw base64 fallback
      return `data:image/png;base64,${s}`;
    }
    return null;
  }

  // Raw image bytes (preferred)
  const blob = await res.blob();
  if (!blob || blob.size === 0) return null;
  return URL.createObjectURL(blob);
}

function Card({
  title,
  value,
  sub,
  icon,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/5">
          {icon}
        </div>
      </div>
      <div className="mt-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-white/60">{title}</div>
        <div className="mt-2 text-3xl font-bold tracking-tight text-white">{value}</div>
        {sub ? <div className="mt-1 text-xs text-white/50">{sub}</div> : null}
      </div>
    </div>
  );
}

export default function SessionAnalyticsPage() {
  return (
    <React.Suspense fallback={<div className="text-sm text-white/60">Loading...</div>}>
      <SessionAnalyticsInner />
    </React.Suspense>
  );
}

function SessionAnalyticsInner() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("id") || "";

  const [data, setData] = React.useState<AnalyticsResponse["analytics"] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const [expandedTradeKey, setExpandedTradeKey] = React.useState<string | null>(null);
  const [tradeScreenshots, setTradeScreenshots] = React.useState<
    Record<string, { entry?: string | null; exit?: string | null }>
  >({});
  const [tradeScreenshotLoading, setTradeScreenshotLoading] = React.useState<
    Record<string, { entry?: boolean; exit?: boolean }>
  >({});
  const [tradeScreenshotError, setTradeScreenshotError] = React.useState<Record<string, string | null>>(
    {}
  );

  const equityRef = React.useRef<HTMLCanvasElement | null>(null);
  const winLossRef = React.useRef<HTMLCanvasElement | null>(null);
  const monthlyRef = React.useRef<HTMLCanvasElement | null>(null);
  const drawdownRef = React.useRef<HTMLCanvasElement | null>(null);

  const chartsRef = React.useRef<any[]>([]);

  const loadScreenshot = React.useCallback(
    async (params: { tradeKey: string; tradeId: string; kind: "entry" | "exit" }) => {
      setTradeScreenshotError((prev) => ({ ...prev, [params.tradeKey]: null }));
      setTradeScreenshotLoading((prev) => ({
        ...prev,
        [params.tradeKey]: { ...(prev[params.tradeKey] || {}), [params.kind]: true },
      }));
      try {
        const img = await fetchTradeScreenshot({
          sessionId,
          tradeId: params.tradeId,
          kind: params.kind,
        });
        setTradeScreenshots((prev) => {
          const existing = prev[params.tradeKey]?.[params.kind];
          if (typeof existing === "string" && existing.startsWith("blob:")) {
            try {
              URL.revokeObjectURL(existing);
            } catch {}
          }
          return {
            ...prev,
            [params.tradeKey]: { ...(prev[params.tradeKey] || {}), [params.kind]: img },
          };
        });
      } catch (e: any) {
        setTradeScreenshotError((prev) => ({
          ...prev,
          [params.tradeKey]: String(e?.message || e),
        }));
      } finally {
        setTradeScreenshotLoading((prev) => ({
          ...prev,
          [params.tradeKey]: { ...(prev[params.tradeKey] || {}), [params.kind]: false },
        }));
      }
    },
    [sessionId]
  );

  React.useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      setError("Missing session id");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchJson<AnalyticsResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/analytics`)
      .then((r) => {
        if (cancelled) return;
        setData(r.analytics);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(String(e?.message || e));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  React.useEffect(() => {
    if (!data) return;

    (async () => {
      const mod = await import("chart.js");
      const Chart = mod.Chart;
      Chart.register(...mod.registerables);

      chartsRef.current.forEach((c) => {
        try {
          c.destroy();
        } catch {}
      });
      chartsRef.current = [];

      const equity = data.series.equity;
      const drawdown = data.series.drawdown;
      const monthly = data.series.monthly_pnl;

      if (equityRef.current) {
        const ctx = equityRef.current.getContext("2d");
        if (ctx) {
          chartsRef.current.push(
            new Chart(ctx, {
              type: "line",
              data: {
                labels: equity.map((p) => p.x),
                datasets: [
                  {
                    data: equity.map((p) => p.y),
                    borderColor: "#3b82f6",
                    backgroundColor: "rgba(59,130,246,0.12)",
                    borderWidth: 2,
                    fill: true,
                    tension: 0.35,
                  },
                ],
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  x: { grid: { display: false } },
                  y: { grid: { color: "rgba(255,255,255,0.06)" } },
                },
              },
            })
          );
        }
      }

      if (winLossRef.current) {
        const ctx = winLossRef.current.getContext("2d");
        if (ctx) {
          chartsRef.current.push(
            new Chart(ctx, {
              type: "doughnut",
              data: {
                labels: ["Wins", "Losses"],
                datasets: [
                  {
                    data: [data.kpis.wins, data.kpis.losses],
                    backgroundColor: ["#22c55e", "#ef4444"],
                    borderWidth: 0,
                  },
                ],
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                cutout: "70%",
              },
            })
          );
        }
      }

      if (monthlyRef.current) {
        const ctx = monthlyRef.current.getContext("2d");
        if (ctx) {
          chartsRef.current.push(
            new Chart(ctx, {
              type: "bar",
              data: {
                labels: monthly.map((p) => p.x),
                datasets: [
                  {
                    data: monthly.map((p) => p.y),
                    backgroundColor: (context: any) =>
                      (context.raw ?? 0) >= 0 ? "#22c55e" : "#ef4444",
                    borderRadius: 6,
                  },
                ],
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  x: { grid: { display: false } },
                  y: { grid: { color: "rgba(255,255,255,0.06)" } },
                },
              },
            })
          );
        }
      }

      if (drawdownRef.current) {
        const ctx = drawdownRef.current.getContext("2d");
        if (ctx) {
          chartsRef.current.push(
            new Chart(ctx, {
              type: "line",
              data: {
                labels: drawdown.map((p) => p.x),
                datasets: [
                  {
                    data: drawdown.map((p) => p.y),
                    borderColor: "#ef4444",
                    backgroundColor: "rgba(239,68,68,0.12)",
                    borderWidth: 2,
                    fill: true,
                    tension: 0.35,
                  },
                ],
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  x: { grid: { display: false } },
                  y: { grid: { color: "rgba(255,255,255,0.06)" } },
                },
              },
            })
          );
        }
      }
    })();

    return () => {
      chartsRef.current.forEach((c) => {
        try {
          c.destroy();
        } catch {}
      });
      chartsRef.current = [];
    };
  }, [data]);

  if (loading) {
    return <div className="text-sm text-white/60">Loading...</div>;
  }

  if (error) {
    return <div className="text-sm text-red-300">{error}</div>;
  }

  if (!data) {
    return <div className="text-sm text-white/60">No analytics found.</div>;
  }

  const k = data.kpis;

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-xs text-white/60">Session</div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">{data.session.name}</h1>
          <div className="mt-1 text-xs text-white/50">
            #{data.session.id} • {data.session.session_type}
          </div>
        </div>
        <div className="flex gap-2">
          <a
            href="/dashboard/"
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold hover:bg-white/10 transition"
          >
            Back
          </a>
          <button
            type="button"
            onClick={() => {
              const mode = data.session.session_type === "propfirm" ? "propfirm" : "backtest";
              window.location.href = `/chart/index.html?mode=${mode}&sessionId=${encodeURIComponent(
                String(data.session.id)
              )}`;
            }}
            className="rounded-full border border-white/10 bg-blue-500/80 px-4 py-2 text-xs font-semibold hover:bg-blue-500 transition"
          >
            Open chart
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          title="Total P&L"
          value={fmtMoney(k.net_pnl)}
          sub={k.trades ? `${k.trades} trades` : "No trades"}
          icon={<DollarSign className="h-5 w-5 text-blue-400" />}
        />
        <Card
          title="Win Rate"
          value={fmtPct(k.win_rate)}
          sub={`${k.wins} wins / ${k.trades} trades`}
          icon={<Target className="h-5 w-5 text-green-400" />}
        />
        <Card
          title="Sharpe"
          value={fmtNum(k.sharpe, 2)}
          sub="Risk-adjusted"
          icon={<Activity className="h-5 w-5 text-purple-400" />}
        />
        <Card
          title="Max Drawdown"
          value={k.max_drawdown_pct === null ? "—" : `-${(k.max_drawdown_pct * 100).toFixed(2)}%`}
          sub={k.max_drawdown === null ? "" : `-$${k.max_drawdown.toFixed(2)}`}
          icon={<TrendingDown className="h-5 w-5 text-red-400" />}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-bold text-white">Equity Curve</div>
              <div className="text-xs text-white/50">Session equity over trades</div>
            </div>
            <TrendingUp className="h-5 w-5 text-blue-300" />
          </div>
          <div className="mt-4 h-[280px]">
            <canvas ref={equityRef} />
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <div className="text-lg font-bold text-white">Trade Distribution</div>
          <div className="text-xs text-white/50">Win vs Loss</div>
          <div className="mt-4 h-[200px]">
            <canvas ref={winLossRef} />
          </div>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-white/70">Winning Trades</span>
              <span className="font-semibold text-white">{k.wins}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/70">Losing Trades</span>
              <span className="font-semibold text-white">{k.losses}</span>
            </div>
            <div className="pt-2 border-t border-white/10 flex items-center justify-between">
              <span className="text-white/60">Avg Win</span>
              <span className="font-semibold text-green-300">
                {k.avg_win == null ? "—" : `$${k.avg_win.toFixed(2)}`}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/60">Avg Loss</span>
              <span className="font-semibold text-red-300">
                {k.avg_loss == null ? "—" : `-$${Math.abs(k.avg_loss).toFixed(2)}`}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-bold text-white">Monthly P&L</div>
              <div className="text-xs text-white/50">Aggregated by month</div>
            </div>
            <BarChart3 className="h-5 w-5 text-green-300" />
          </div>
          <div className="mt-4 h-[260px]">
            <canvas ref={monthlyRef} />
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-bold text-white">Drawdown</div>
              <div className="text-xs text-white/50">Peak-to-trough (%)</div>
            </div>
            <TrendingDown className="h-5 w-5 text-red-300" />
          </div>
          <div className="mt-4 h-[260px]">
            <canvas ref={drawdownRef} />
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl overflow-hidden">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-bold text-white">Recent Trades</div>
            <div className="text-xs text-white/50">Latest 20 trades</div>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-white/60">
                <th className="py-3 text-left">Date</th>
                <th className="py-3 text-left">Symbol</th>
                <th className="py-3 text-left">Side</th>
                <th className="py-3 text-left">Entry</th>
                <th className="py-3 text-left">Exit</th>
                <th className="py-3 text-left">P&L</th>
                <th className="py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_trades.map((t, idx) => {
                const tradeKey = t.trade_id ? `id:${t.trade_id}` : `idx:${idx}`;
                const isOpen = expandedTradeKey === tradeKey;
                const shot = tradeScreenshots[tradeKey] || {};
                const shotLoading = tradeScreenshotLoading[tradeKey] || {};
                const shotErr = tradeScreenshotError[tradeKey] || null;
                const d = t.date ? new Date(t.date).toLocaleString() : "—";
                const pnl = t.pnl;
                const pnlCls = pnl >= 0 ? "text-green-300" : "text-red-300";
                return (
                  <React.Fragment key={tradeKey}>
                    <tr
                      className={
                        "border-b border-white/5 cursor-pointer hover:bg-white/5 transition " +
                        (isOpen ? "bg-white/5" : "")
                      }
                      onClick={() => setExpandedTradeKey((prev) => (prev === tradeKey ? null : tradeKey))}
                    >
                      <td className="py-3 text-white/70">{d}</td>
                      <td className="py-3 text-white">{t.symbol || "—"}</td>
                      <td className="py-3 text-white/70">{t.side || "—"}</td>
                      <td className="py-3 text-white/70">{t.entry ?? "—"}</td>
                      <td className="py-3 text-white/70">{t.exit ?? "—"}</td>
                      <td className={`py-3 font-semibold ${pnlCls}`}>{fmtMoney(pnl)}</td>
                      <td className="py-3">
                        <span
                          className={
                            "rounded-full border px-2 py-1 text-xs font-semibold " +
                            (t.status === "win"
                              ? "border-green-500/30 bg-green-500/10 text-green-300"
                              : t.status === "loss"
                              ? "border-red-500/30 bg-red-500/10 text-red-300"
                              : "border-white/10 bg-white/5 text-white/70")
                          }
                        >
                          {t.status}
                        </span>
                      </td>
                    </tr>

                    {isOpen ? (
                      <tr className="border-b border-white/5">
                        <td colSpan={7} className="pb-5">
                          <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <div className="text-sm font-semibold text-white">Trade details</div>
                                <div className="mt-1 text-xs text-white/50">
                                  {t.trade_id ? `ID: ${t.trade_id}` : ""}
                                </div>
                              </div>
                              <div className="text-xs text-white/40">Click row to collapse</div>
                            </div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                                <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
                                  Plan
                                </div>
                                <div className="mt-3 space-y-2">
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-white/60">Stop Loss</span>
                                    <span className="text-white">{fmtMaybeNum(t.stop_loss, 5)}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-white/60">Take Profit</span>
                                    <span className="text-white">{fmtMaybeNum(t.take_profit, 5)}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-white/60">Risk Amount</span>
                                    <span className="text-white">{fmtMaybeNum(t.risk_amount, 2)}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-white/60">RR planned</span>
                                    <span className="text-white">
                                      {t.rr_planned == null ? "—" : fmtNum(t.rr_planned, 2)}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                                <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
                                  Result
                                </div>
                                <div className="mt-3 space-y-2">
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-white/60">RR actual</span>
                                    <span className="text-white">
                                      {t.rr_actual == null ? "—" : fmtNum(t.rr_actual, 2)}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-white/60">R multiple</span>
                                    <span className="text-white">{fmtMaybeNum(t.r_multiple, 2)}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-white/60">MFE</span>
                                    <span className="text-white">{fmtText(t.mfe)}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-white/60">MAE</span>
                                    <span className="text-white">{fmtText(t.mae)}</span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                                <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
                                  Execution
                                </div>
                                <div className="mt-3 space-y-2">
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-white/60">Quantity</span>
                                    <span className="text-white">{fmtText(t.quantity)}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-white/60">Close type</span>
                                    <span className="text-white">{fmtText(t.close_type)}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-white/60">Holding (hours)</span>
                                    <span className="text-white">{fmtText(t.holding_time_hours)}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-white/60">Price move (pips)</span>
                                    <span className="text-white">
                                      {t.price_move_pips == null ? "—" : fmtNum(t.price_move_pips, 1)}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                                <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
                                  Timing
                                </div>
                                <div className="mt-3 space-y-2">
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-white/60">Entry time</span>
                                    <span className="text-white">{fmtDateTime(t.entry_time)}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-white/60">Exit time</span>
                                    <span className="text-white">{fmtDateTime(t.exit_time)}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-white/60">Day</span>
                                    <span className="text-white">{fmtText(t.day_of_week)}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-white/60">Month / Year</span>
                                    <span className="text-white">
                                      {fmtText(t.month)} / {fmtText(t.year)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                                <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
                                  Notes (pre)
                                </div>
                                <div className="mt-3 whitespace-pre-wrap text-white/80">
                                  {fmtText(t.pre_trade_notes)}
                                </div>
                              </div>
                              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                                <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
                                  Notes (post)
                                </div>
                                <div className="mt-3 whitespace-pre-wrap text-white/80">
                                  {fmtText(t.post_trade_notes)}
                                </div>
                              </div>
                            </div>

                            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm">
                              <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
                                Screenshots
                              </div>
                              {shotErr ? <div className="mt-2 text-xs text-red-300">{shotErr}</div> : null}

                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold hover:bg-white/10 transition disabled:opacity-50"
                                  disabled={
                                    !t.trade_id ||
                                    t.has_entry_screenshot === false ||
                                    shotLoading.entry === true
                                  }
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!t.trade_id) return;
                                    loadScreenshot({ tradeKey, tradeId: t.trade_id, kind: "entry" });
                                  }}
                                >
                                  {shotLoading.entry ? "Loading entry..." : "Load entry screenshot"}
                                </button>

                                <button
                                  type="button"
                                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold hover:bg-white/10 transition disabled:opacity-50"
                                  disabled={
                                    !t.trade_id ||
                                    t.has_exit_screenshot === false ||
                                    shotLoading.exit === true
                                  }
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!t.trade_id) return;
                                    loadScreenshot({ tradeKey, tradeId: t.trade_id, kind: "exit" });
                                  }}
                                >
                                  {shotLoading.exit ? "Loading exit..." : "Load exit screenshot"}
                                </button>
                              </div>

                              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                {shot.entry ? (
                                  <div className="rounded-lg border border-white/10 overflow-hidden">
                                    <div className="px-3 py-2 text-xs text-white/60 border-b border-white/10">
                                      Entry
                                    </div>
                                    <img src={shot.entry} className="w-full h-auto" alt="Entry screenshot" />
                                  </div>
                                ) : null}
                                {shot.exit ? (
                                  <div className="rounded-lg border border-white/10 overflow-hidden">
                                    <div className="px-3 py-2 text-xs text-white/60 border-b border-white/10">
                                      Exit
                                    </div>
                                    <img src={shot.exit} className="w-full h-auto" alt="Exit screenshot" />
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
