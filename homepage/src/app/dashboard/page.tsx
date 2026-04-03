"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import {
  BarChart3,
  BookOpen,
  GraduationCap,
  Play,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  TrendingDown,
  Target,
  Activity,
  Crown,
  Settings,
  CreditCard,
  User,
  Calendar,
  Flame,
  Zap,
  DollarSign,
  Percent,
  Scale,
  Trophy,
  TriangleAlert,
  ChevronRight,
  Clock,
  Layers,
  Shield,
} from "lucide-react";

/* ════════════════════════════════════════════════════════════════
   TYPES
   ════════════════════════════════════════════════════════════════ */

interface AuthUser {
  id: number;
  name: string;
  email: string;
  role?: string;
  created_at?: string;
  has_journal_access?: boolean;
}

interface Subscription {
  has_subscription: boolean;
  has_journal_access?: boolean;
  plan?: { name?: string; id?: number };
  subscription?: {
    status?: string;
    current_period_end?: string;
    cancel_at_period_end?: boolean;
  };
}

interface Session {
  id: number;
  name: string;
  symbol?: string;
  session_type: string;
  start_balance?: number;
  created_at?: string;
}

interface JournalStats {
  total_trades?: number;
  winning_trades?: number;
  losing_trades?: number;
  breakeven_trades?: number;
  win_rate?: number;
  total_pnl?: number;
  avg_pnl?: number;
  profit_factor?: number;
  avg_win?: number;
  avg_loss?: number;
  largest_win?: number;
  largest_loss?: number;
  avg_rr?: number;
  total_wins?: number;
  total_losses?: number;
  first_trade_date?: string;
  last_trade_date?: string;
}

interface EquityPoint {
  date: string;
  balance: number;
  pnl: number;
  symbol?: string;
  drawdown?: number;
  drawdown_pct?: number;
}

interface EquityData {
  equity_curve: EquityPoint[];
  initial_balance: number;
  final_balance: number;
  max_drawdown: number;
  max_drawdown_pct: number;
  total_return?: number;
}

interface Streak {
  current_streak: { type: string | null; count: number };
  max_winning_streak: number;
  max_losing_streak: number;
  avg_winning_streak: number;
  avg_losing_streak: number;
}

interface Trade {
  id: number;
  symbol: string;
  direction: string;
  pnl: number | null;
  rr: number | null;
  strategy?: string;
  date?: string;
  entry_price?: number;
  exit_price?: number;
}

interface StrategyPerf {
  strategy: string;
  total_trades: number;
  winning_trades: number;
  win_rate: number;
  total_pnl: number;
  profit_factor: number | null;
}

interface SymbolPerf {
  symbol: string;
  total_trades: number;
  winning_trades: number;
  win_rate: number;
  total_pnl: number;
  profit_factor: number | null;
}

/* ════════════════════════════════════════════════════════════════
   HELPERS
   ════════════════════════════════════════════════════════════════ */

function fmt(v: number | undefined | null, prefix = "$"): string {
  if (v == null) return "N/A";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "N/A";
  if (Math.abs(n) >= 1_000_000)
    return `${prefix}${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `${prefix}${(n / 1_000).toFixed(1)}K`;
  return `${prefix}${n.toFixed(2)}`;
}

function pct(v: number | undefined | null): string {
  if (v == null) return "N/A";
  const n = typeof v === "string" ? parseFloat(v) : v;
  return `${n.toFixed(1)}%`;
}

function fmtDate(d: string | undefined | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function cn(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

const CARD =
  "rounded-xl bg-white/[0.02] ring-1 ring-white/[0.06] hover:ring-white/[0.10] transition-all";

/* ════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════════════ */

export default function GlobalDashboard() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [stats, setStats] = useState<JournalStats | null>(null);
  const [equity, setEquity] = useState<EquityData | null>(null);
  const [streakData, setStreakData] = useState<Streak | null>(null);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [strategies, setStrategies] = useState<StrategyPerf[]>([]);
  const [symbols, setSymbols] = useState<SymbolPerf[]>([]);
  const [loading, setLoading] = useState(true);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  const todayStr = useMemo(
    () =>
      new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    []
  );

  const jwtFetch = useCallback(
    (url: string) => {
      const token = localStorage.getItem("token");
      if (!token) return Promise.reject("no token");
      return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    },
    []
  );

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const meRes = await fetch("/api/auth/me", {
          credentials: "include",
          cache: "no-store",
        });
        if (!meRes.ok) {
          window.location.replace(
            `/login/?next=${encodeURIComponent(window.location.pathname)}`
          );
          return;
        }
        const meData = (await meRes.json()) as { user: AuthUser };
        if (!mounted) return;
        if (meData.user.role === "admin") {
          window.location.replace("/dashboard/admin/");
          return;
        }
        setUser(meData.user);

        const results = await Promise.allSettled([
          fetch("/api/sessions", { credentials: "include" }),
          jwtFetch("/journal/api/subscriptions/my-subscription"),
          jwtFetch("/journal/api/journal/stats"),
          jwtFetch("/journal/api/journal/equities"),
          jwtFetch("/journal/api/journal/streaks"),
          jwtFetch("/journal/api/journal/list"),
          jwtFetch("/journal/api/journal/strategy-analysis"),
          jwtFetch("/journal/api/journal/symbol-analysis"),
        ]);

        if (!mounted) return;

        const ok = (i: number) =>
          results[i].status === "fulfilled" &&
          (results[i] as PromiseFulfilledResult<Response>).value.ok;
        const json = async (i: number) =>
          ok(i)
            ? (results[i] as PromiseFulfilledResult<Response>).value.json()
            : null;

        const [
          sessData,
          subData,
          statsData,
          eqData,
          streaksData,
          tradesData,
          stratData,
          symData,
        ] = await Promise.all([
          json(0),
          json(1),
          json(2),
          json(3),
          json(4),
          json(5),
          json(6),
          json(7),
        ]);

        if (sessData) setSessions((sessData.sessions || []).slice(0, 5));
        if (subData) setSub(subData);
        if (statsData) setStats(statsData);
        if (eqData) setEquity(eqData);
        if (streaksData) setStreakData(streaksData);
        if (tradesData) {
          const list = Array.isArray(tradesData) ? tradesData : [];
          setRecentTrades(list.slice(-10).reverse());
        }
        if (stratData) {
          const list = Array.isArray(stratData) ? stratData : [];
          setStrategies(list.sort((a: StrategyPerf, b: StrategyPerf) => b.total_pnl - a.total_pnl).slice(0, 6));
        }
        if (symData) {
          const list = Array.isArray(symData) ? symData : [];
          setSymbols(list.sort((a: SymbolPerf, b: SymbolPerf) => b.total_trades - a.total_trades).slice(0, 8));
        }
      } catch {
        window.location.replace(
          `/login/?next=${encodeURIComponent(window.location.pathname)}`
        );
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [jwtFetch]);

  /* ── loading ── */
  if (loading || !user) {
    return (
      <div className="flex items-center justify-center py-40">
        <div className="text-center">
          <div className="relative w-14 h-14 mx-auto mb-4">
            <div className="absolute inset-0 border-[3px] border-blue-500/20 rounded-full animate-pulse" />
            <div className="absolute inset-1.5 border-[3px] border-blue-500/40 border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-sm text-white/30">Loading your dashboard…</p>
        </div>
      </div>
    );
  }

  /* ── computed values ── */
  const planName = sub?.plan?.name;
  const hasSub = sub?.has_subscription || sub?.has_journal_access;
  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      })
    : null;
  const hasTrades = (stats?.total_trades ?? 0) > 0;
  const totalReturn =
    equity && equity.initial_balance > 0
      ? ((equity.final_balance - equity.initial_balance) /
          equity.initial_balance) *
        100
      : null;

  /* Daily P&L bars from equity curve */
  const dailyPnl = useMemo(() => {
    if (!equity?.equity_curve?.length) return [];
    const map = new Map<string, number>();
    for (const pt of equity.equity_curve) {
      if (!pt.date) continue;
      const d = pt.date.slice(0, 10);
      map.set(d, (map.get(d) || 0) + pt.pnl);
    }
    return Array.from(map.entries())
      .map(([date, pnl]) => ({ date, pnl: Math.round(pnl * 100) / 100 }))
      .slice(-30);
  }, [equity]);

  /* Win/Loss distribution for ring chart */
  const winLossData = useMemo(() => {
    if (!stats || !hasTrades) return [];
    return [
      { name: "Wins", value: stats.winning_trades ?? 0, fill: "#22c55e" },
      { name: "Losses", value: stats.losing_trades ?? 0, fill: "#ef4444" },
      {
        name: "Breakeven",
        value: stats.breakeven_trades ?? 0,
        fill: "#64748b",
      },
    ].filter((d) => d.value > 0);
  }, [stats, hasTrades]);

  return (
    <div className="space-y-6 pb-16">
      {/* ══════════════════ WELCOME HEADER ══════════════════ */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold text-white tracking-tight leading-tight">
            {greeting},{" "}
            <span className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
              {user.name || "Trader"}
            </span>
          </h1>
          <p className="text-[13px] text-white/25 mt-1">{todayStr}</p>
          <div className="flex items-center gap-3 mt-2">
            {planName ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400">
                <Crown className="w-3 h-3" />
                {planName}
              </span>
            ) : hasSub ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <Shield className="w-3 h-3" />
                Active
              </span>
            ) : null}
            {memberSince && (
              <span className="text-[11px] text-white/15">
                Member since {memberSince}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 self-start">
          <a
            href="/journal/settings"
            className="inline-flex items-center gap-1.5 text-[12px] text-white/30 hover:text-white/60 border border-white/[0.06] hover:border-white/[0.12] rounded-lg px-3 py-1.5 transition-all"
          >
            <Settings className="w-3.5 h-3.5" /> Settings
          </a>
          <a
            href="/journal/pricing"
            className="inline-flex items-center gap-1.5 text-[12px] text-white/30 hover:text-white/60 border border-white/[0.06] hover:border-white/[0.12] rounded-lg px-3 py-1.5 transition-all"
          >
            <CreditCard className="w-3.5 h-3.5" /> Plans
          </a>
        </div>
      </div>

      {/* ══════════════════ QUICK NAV ══════════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          {
            icon: BarChart3,
            title: "Backtesting",
            desc: "Practice strategies on historical data",
            href: "/backtest/",
            gradient: "from-blue-600 to-blue-700",
          },
          {
            icon: BookOpen,
            title: "Trade Journal",
            desc: "Log, analyze and improve your trades",
            href: "/journal/dashboard",
            gradient: "from-indigo-600 to-indigo-700",
          },
          {
            icon: GraduationCap,
            title: "Mentorship",
            desc: "Learn from professional traders",
            href: "/bootcamp/",
            gradient: "from-violet-600 to-violet-700",
          },
        ].map((item) => (
          <a
            key={item.title}
            href={item.href}
            className={cn(
              "group relative overflow-hidden rounded-xl p-4 transition-all",
              "bg-gradient-to-br",
              item.gradient,
              "hover:shadow-lg hover:shadow-blue-500/5 hover:scale-[1.01]"
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
            <div className="relative flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0 backdrop-blur-sm">
                <item.icon className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white">
                  {item.title}
                </div>
                <div className="text-[11px] text-white/50">{item.desc}</div>
              </div>
              <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-white/70 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
            </div>
          </a>
        ))}
      </div>

      {/* ══════════════════ KEY METRICS ══════════════════ */}
      {hasTrades && stats ? (
        <>
          <div>
            <h2 className="text-[13px] font-semibold text-white/30 uppercase tracking-wider mb-3">
              Performance Overview
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCard
                icon={Activity}
                label="Total Trades"
                value={String(stats.total_trades ?? 0)}
                sub={`${stats.winning_trades ?? 0}W / ${stats.losing_trades ?? 0}L`}
              />
              <MetricCard
                icon={DollarSign}
                label="Net P&L"
                value={fmt(stats.total_pnl)}
                valueColor={
                  (stats.total_pnl ?? 0) >= 0
                    ? "text-emerald-400"
                    : "text-red-400"
                }
                sub={`Avg ${fmt(stats.avg_pnl)}/trade`}
                trend={(stats.total_pnl ?? 0) >= 0 ? "up" : "down"}
              />
              <MetricCard
                icon={Target}
                label="Win Rate"
                value={pct(stats.win_rate)}
                valueColor={
                  (stats.win_rate ?? 0) >= 50
                    ? "text-emerald-400"
                    : "text-amber-400"
                }
                sub={
                  stats.breakeven_trades
                    ? `${stats.breakeven_trades} breakeven`
                    : undefined
                }
              />
              <MetricCard
                icon={Scale}
                label="Profit Factor"
                value={
                  stats.profit_factor != null
                    ? stats.profit_factor === Infinity
                      ? "∞"
                      : parseFloat(String(stats.profit_factor)).toFixed(2)
                    : "N/A"
                }
                valueColor={
                  (stats.profit_factor ?? 0) >= 1.5
                    ? "text-emerald-400"
                    : (stats.profit_factor ?? 0) >= 1
                      ? "text-amber-400"
                      : "text-red-400"
                }
                sub="Gross win / Gross loss"
              />
            </div>
          </div>

          {/* ── secondary metrics ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <MiniMetric
              icon={Trophy}
              label="Best Trade"
              value={fmt(stats.largest_win)}
              color="text-emerald-400"
            />
            <MiniMetric
              icon={TriangleAlert}
              label="Worst Trade"
              value={fmt(stats.largest_loss)}
              color="text-red-400"
            />
            <MiniMetric
              icon={TrendingUp}
              label="Avg Win"
              value={fmt(stats.avg_win)}
              color="text-emerald-400"
            />
            <MiniMetric
              icon={TrendingDown}
              label="Avg Loss"
              value={fmt(stats.avg_loss)}
              color="text-red-400"
            />
            <MiniMetric
              icon={Percent}
              label="Avg R:R"
              value={
                stats.avg_rr != null
                  ? parseFloat(String(stats.avg_rr)).toFixed(2)
                  : "N/A"
              }
              color="text-blue-400"
            />
            <MiniMetric
              icon={Flame}
              label="Streak"
              value={
                streakData?.current_streak?.type
                  ? `${streakData.current_streak.count} ${streakData.current_streak.type === "win" ? "W" : "L"}`
                  : "—"
              }
              color={
                streakData?.current_streak?.type === "win"
                  ? "text-emerald-400"
                  : "text-red-400"
              }
            />
          </div>
        </>
      ) : (
        <div className={cn(CARD, "p-8 text-center")}>
          <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Activity className="w-6 h-6 text-blue-400/60" />
          </div>
          <h3 className="text-sm font-semibold text-white/50 mb-1">
            No trades recorded yet
          </h3>
          <p className="text-[12px] text-white/20 mb-4 max-w-xs mx-auto">
            Start by importing your trades or adding them manually to see your
            full performance dashboard.
          </p>
          <div className="flex items-center justify-center gap-3">
            <a
              href="/journal/import-trades"
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-2 hover:bg-blue-500/15 transition-colors"
            >
              Import Trades <ArrowRight className="w-3 h-3" />
            </a>
            <a
              href="/journal/journal"
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-white/40 border border-white/[0.06] rounded-lg px-4 py-2 hover:border-white/[0.12] transition-colors"
            >
              Add Manually
            </a>
          </div>
        </div>
      )}

      {/* ══════════════════ EQUITY CURVE + WIN/LOSS + DAILY P&L ══════════════════ */}
      {hasTrades && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Equity curve — takes 2 cols */}
          <div className={cn(CARD, "lg:col-span-2 p-5")}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-[13px] font-semibold text-white/40 uppercase tracking-wider">
                  Equity Curve
                </h3>
                {equity && (
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-lg font-bold text-white/80">
                      {fmt(equity.final_balance)}
                    </span>
                    {totalReturn != null && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-0.5 text-[12px] font-semibold px-2 py-0.5 rounded-full",
                          totalReturn >= 0
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-red-500/10 text-red-400"
                        )}
                      >
                        {totalReturn >= 0 ? (
                          <ArrowUpRight className="w-3 h-3" />
                        ) : (
                          <ArrowDownRight className="w-3 h-3" />
                        )}
                        {Math.abs(totalReturn).toFixed(1)}%
                      </span>
                    )}
                  </div>
                )}
              </div>
              {equity && (
                <div className="text-right">
                  <div className="text-[11px] text-white/20">Max Drawdown</div>
                  <div className="text-sm font-semibold text-red-400/80">
                    {fmt(equity.max_drawdown)}{" "}
                    <span className="text-[11px] text-red-400/50">
                      ({pct(equity.max_drawdown_pct)})
                    </span>
                  </div>
                </div>
              )}
            </div>
            {equity?.equity_curve?.length ? (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={equity.equity_curve}
                    margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="eqGrad"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#3b82f6"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="#3b82f6"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d: string) =>
                        new Date(d).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      }
                      tick={{ fill: "rgba(255,255,255,0.15)", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={40}
                    />
                    <YAxis
                      tick={{ fill: "rgba(255,255,255,0.15)", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      width={50}
                      tickFormatter={(v: number) => fmt(v, "")}
                    />
                    <ReTooltip
                      contentStyle={{
                        background: "#0f0f1a",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: "8px",
                        fontSize: "12px",
                        color: "#fff",
                      }}
                      formatter={(v: unknown) => [fmt(Number(v)), "Balance"]}
                      labelFormatter={(d: unknown) =>
                        new Date(String(d)).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="balance"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fill="url(#eqGrad)"
                      dot={false}
                      activeDot={{
                        r: 4,
                        fill: "#3b82f6",
                        stroke: "#fff",
                        strokeWidth: 2,
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-white/15 text-sm">
                No equity data yet
              </div>
            )}
          </div>

          {/* Right column — win/loss ring + streaks */}
          <div className="flex flex-col gap-3">
            {/* Win/Loss ring */}
            <div className={cn(CARD, "p-5 flex-1")}>
              <h3 className="text-[13px] font-semibold text-white/40 uppercase tracking-wider mb-3">
                Win / Loss
              </h3>
              {winLossData.length > 0 ? (
                <div className="flex items-center gap-4">
                  <div className="w-[100px] h-[100px] flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={winLossData}
                          cx="50%"
                          cy="50%"
                          innerRadius={30}
                          outerRadius={45}
                          paddingAngle={3}
                          dataKey="value"
                          stroke="none"
                        >
                          {winLossData.map((d, i) => (
                            <Cell key={i} fill={d.fill} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2 flex-1">
                    {winLossData.map((d) => (
                      <div key={d.name} className="flex items-center gap-2">
                        <div
                          className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                          style={{ background: d.fill }}
                        />
                        <span className="text-[12px] text-white/40 flex-1">
                          {d.name}
                        </span>
                        <span className="text-[13px] font-semibold text-white/70">
                          {d.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-[100px] flex items-center justify-center text-white/15 text-sm">
                  No data
                </div>
              )}
            </div>

            {/* Streak info */}
            {streakData && (
              <div className={cn(CARD, "p-5")}>
                <h3 className="text-[13px] font-semibold text-white/40 uppercase tracking-wider mb-3">
                  Streaks
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[11px] text-white/20 mb-0.5">
                      Current
                    </div>
                    <div
                      className={cn(
                        "text-lg font-bold",
                        streakData.current_streak.type === "win"
                          ? "text-emerald-400"
                          : streakData.current_streak.type === "loss"
                            ? "text-red-400"
                            : "text-white/30"
                      )}
                    >
                      {streakData.current_streak.count > 0
                        ? `${streakData.current_streak.count}${streakData.current_streak.type === "win" ? "W" : "L"}`
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-white/20 mb-0.5">
                      Best Streak
                    </div>
                    <div className="text-lg font-bold text-emerald-400">
                      {streakData.max_winning_streak}W
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════ DAILY P&L BARS ══════════════════ */}
      {dailyPnl.length > 0 && (
        <div className={cn(CARD, "p-5")}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[13px] font-semibold text-white/40 uppercase tracking-wider">
              Daily P&L{" "}
              <span className="text-white/15 normal-case font-normal">
                (last 30 days)
              </span>
            </h3>
            <a
              href="/journal/analytics/calendar"
              className="text-[11px] text-white/20 hover:text-white/40 transition-colors"
            >
              Full Calendar →
            </a>
          </div>
          <div className="h-[120px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={dailyPnl}
                margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
              >
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) =>
                    new Date(d).toLocaleDateString("en-US", {
                      day: "numeric",
                    })
                  }
                  tick={{ fill: "rgba(255,255,255,0.1)", fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={20}
                />
                <ReTooltip
                  contentStyle={{
                    background: "#0f0f1a",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "8px",
                    fontSize: "12px",
                    color: "#fff",
                  }}
                  formatter={(v: unknown) => [fmt(Number(v)), "P&L"]}
                  labelFormatter={(d: unknown) =>
                    new Date(String(d)).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
                  }
                />
                <Bar dataKey="pnl" radius={[3, 3, 0, 0]} maxBarSize={18}>
                  {dailyPnl.map((d, i) => (
                    <Cell
                      key={i}
                      fill={d.pnl >= 0 ? "#22c55e" : "#ef4444"}
                      opacity={0.7}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ══════════════════ RECENT TRADES + STRATEGY ══════════════════ */}
      {hasTrades && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Recent Trades */}
          <div className={cn(CARD, "lg:col-span-2 p-5")}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[13px] font-semibold text-white/40 uppercase tracking-wider">
                Recent Trades
              </h3>
              <a
                href="/journal/trades"
                className="text-[11px] text-white/20 hover:text-white/40 transition-colors"
              >
                View all →
              </a>
            </div>
            {recentTrades.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="text-left py-2 px-2 text-white/20 font-medium">
                        Symbol
                      </th>
                      <th className="text-left py-2 px-2 text-white/20 font-medium">
                        Side
                      </th>
                      <th className="text-right py-2 px-2 text-white/20 font-medium">
                        P&L
                      </th>
                      <th className="text-right py-2 px-2 text-white/20 font-medium">
                        R:R
                      </th>
                      <th className="text-left py-2 px-2 text-white/20 font-medium hidden sm:table-cell">
                        Strategy
                      </th>
                      <th className="text-right py-2 px-2 text-white/20 font-medium">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTrades.map((t) => (
                      <tr
                        key={t.id}
                        className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="py-2.5 px-2">
                          <span className="font-semibold text-white/70">
                            {t.symbol || "—"}
                          </span>
                        </td>
                        <td className="py-2.5 px-2">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase",
                              t.direction?.toLowerCase() === "long" ||
                                t.direction?.toLowerCase() === "buy"
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-red-500/10 text-red-400"
                            )}
                          >
                            {t.direction?.toLowerCase() === "long" ||
                            t.direction?.toLowerCase() === "buy"
                              ? "Long"
                              : "Short"}
                          </span>
                        </td>
                        <td
                          className={cn(
                            "py-2.5 px-2 text-right font-semibold",
                            (t.pnl ?? 0) >= 0
                              ? "text-emerald-400"
                              : "text-red-400"
                          )}
                        >
                          {t.pnl != null ? fmt(t.pnl) : "—"}
                        </td>
                        <td className="py-2.5 px-2 text-right text-white/40">
                          {t.rr != null
                            ? parseFloat(String(t.rr)).toFixed(2)
                            : "—"}
                        </td>
                        <td className="py-2.5 px-2 text-white/30 hidden sm:table-cell truncate max-w-[120px]">
                          {t.strategy || "—"}
                        </td>
                        <td className="py-2.5 px-2 text-right text-white/25">
                          {fmtDate(t.date)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-8 text-center text-white/15 text-sm">
                No recent trades
              </div>
            )}
          </div>

          {/* Strategy Performance */}
          <div className={cn(CARD, "p-5")}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[13px] font-semibold text-white/40 uppercase tracking-wider">
                By Strategy
              </h3>
              <a
                href="/journal/analytics/performance-analysis"
                className="text-[11px] text-white/20 hover:text-white/40 transition-colors"
              >
                Details →
              </a>
            </div>
            {strategies.length > 0 ? (
              <div className="space-y-3">
                {strategies.map((s) => {
                  const maxPnl = Math.max(
                    ...strategies.map((x) => Math.abs(x.total_pnl || 1))
                  );
                  const width = Math.min(
                    (Math.abs(s.total_pnl) / maxPnl) * 100,
                    100
                  );
                  return (
                    <div key={s.strategy}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] text-white/50 truncate max-w-[140px]">
                          {s.strategy}
                        </span>
                        <span
                          className={cn(
                            "text-[12px] font-semibold",
                            s.total_pnl >= 0
                              ? "text-emerald-400"
                              : "text-red-400"
                          )}
                        >
                          {fmt(s.total_pnl)}
                        </span>
                      </div>
                      <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            s.total_pnl >= 0
                              ? "bg-emerald-500/50"
                              : "bg-red-500/50"
                          )}
                          style={{ width: `${width}%` }}
                        />
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[10px] text-white/20">
                          {s.total_trades} trades
                        </span>
                        <span className="text-[10px] text-white/20">
                          {pct(s.win_rate)} WR
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-white/15 text-sm">
                No strategies found
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════ SYMBOLS + SESSIONS ══════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Symbol Performance */}
        {symbols.length > 0 && (
          <div className={cn(CARD, "p-5")}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[13px] font-semibold text-white/40 uppercase tracking-wider">
                Top Symbols
              </h3>
              <a
                href="/journal/analytics/symbols"
                className="text-[11px] text-white/20 hover:text-white/40 transition-colors"
              >
                All symbols →
              </a>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {symbols.map((s) => (
                <div
                  key={s.symbol}
                  className="rounded-lg bg-white/[0.02] ring-1 ring-white/[0.04] p-3"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12px] font-semibold text-white/60">
                      {s.symbol}
                    </span>
                    <span
                      className={cn(
                        "text-[11px] font-bold",
                        s.total_pnl >= 0
                          ? "text-emerald-400"
                          : "text-red-400"
                      )}
                    >
                      {fmt(s.total_pnl)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-white/20">
                      {s.total_trades} trades
                    </span>
                    <span className="text-[10px] text-white/20">
                      {pct(s.win_rate)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Backtest Sessions */}
        <div className={cn(CARD, "p-5")}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[13px] font-semibold text-white/40 uppercase tracking-wider">
              Backtest Sessions
            </h3>
            {sessions.length > 0 && (
              <a
                href="/backtest/"
                className="text-[11px] text-white/20 hover:text-white/40 transition-colors"
              >
                View all →
              </a>
            )}
          </div>
          {sessions.length > 0 ? (
            <div className="space-y-2">
              {sessions.map((s) => (
                <a
                  key={s.id}
                  href={`/chart/index.html?mode=${s.session_type === "propfirm" ? "propfirm" : "backtest"}&sessionId=${s.id}`}
                  className="group flex items-center gap-3 rounded-lg bg-white/[0.02] ring-1 ring-white/[0.04] hover:ring-white/[0.10] p-3 transition-all"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <Play
                      className="w-3.5 h-3.5 text-blue-400 ml-0.5"
                      fill="currentColor"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-white/60 truncate group-hover:text-white/80 transition-colors">
                      {s.name}
                    </div>
                    <div className="text-[10px] text-white/20">
                      {s.session_type === "propfirm"
                        ? "Prop Firm"
                        : "Personal"}
                      {s.symbol ? ` · ${s.symbol}` : ""}
                      {s.start_balance
                        ? ` · ${fmt(s.start_balance)}`
                        : ""}
                    </div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-white/10 group-hover:text-white/30 transition-colors flex-shrink-0" />
                </a>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center">
              <p className="text-sm text-white/20 mb-3">No sessions yet</p>
              <a
                href="/backtest/"
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-blue-400/80 hover:text-blue-400 transition-colors"
              >
                Start your first backtest <ArrowRight className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════ ACCOUNT ══════════════════ */}
      <div className={cn(CARD, "p-5")}>
        <h3 className="text-[13px] font-semibold text-white/30 uppercase tracking-wider mb-4">
          Account
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-white/20" />
            </div>
            <div>
              <div className="text-[10px] text-white/20 uppercase tracking-wide">
                Email
              </div>
              <div className="text-[12px] text-white/50 truncate max-w-[180px]">
                {user.email}
              </div>
            </div>
          </div>
          {memberSince && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                <Calendar className="w-4 h-4 text-white/20" />
              </div>
              <div>
                <div className="text-[10px] text-white/20 uppercase tracking-wide">
                  Member Since
                </div>
                <div className="text-[12px] text-white/50">{memberSince}</div>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
              <Layers className="w-4 h-4 text-white/20" />
            </div>
            <div>
              <div className="text-[10px] text-white/20 uppercase tracking-wide">
                Plan
              </div>
              <div className="text-[12px] text-white/50">
                {planName || (hasSub ? "Active" : "No plan")}
              </div>
            </div>
          </div>
          {sub?.subscription?.status && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                <Clock className="w-4 h-4 text-white/20" />
              </div>
              <div>
                <div className="text-[10px] text-white/20 uppercase tracking-wide">
                  Status
                </div>
                <div
                  className={cn(
                    "text-[12px] capitalize",
                    sub.subscription.status === "active"
                      ? "text-emerald-400/70"
                      : sub.subscription.status === "trialing"
                        ? "text-blue-400/70"
                        : "text-amber-400/70"
                  )}
                >
                  {sub.subscription.status}
                  {sub.subscription.cancel_at_period_end && " (canceling)"}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ════════════════════════════════════════════════════════════════ */

function MetricCard({
  icon: Icon,
  label,
  value,
  valueColor,
  sub,
  trend,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  valueColor?: string;
  sub?: string;
  trend?: "up" | "down";
}) {
  return (
    <div className={cn(CARD, "p-4 relative overflow-hidden group")}>
      <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-white/[0.02] to-transparent rounded-bl-full" />
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-blue-500/10">
          <Icon className="w-3.5 h-3.5 text-blue-400/70" />
        </div>
        <span className="text-[11px] font-semibold text-white/25 uppercase tracking-wide">
          {label}
        </span>
        {trend && (
          <span className="ml-auto">
            {trend === "up" ? (
              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400/50" />
            ) : (
              <ArrowDownRight className="w-3.5 h-3.5 text-red-400/50" />
            )}
          </span>
        )}
      </div>
      <div
        className={cn("text-xl font-bold", valueColor || "text-white/80")}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[11px] text-white/15 mt-1">{sub}</div>
      )}
    </div>
  );
}

function MiniMetric({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className={cn(CARD, "p-3")}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="w-3 h-3 text-white/15" />
        <span className="text-[10px] text-white/20 uppercase tracking-wide font-medium">
          {label}
        </span>
      </div>
      <div className={cn("text-[15px] font-bold", color || "text-white/70")}>
        {value}
      </div>
    </div>
  );
}
