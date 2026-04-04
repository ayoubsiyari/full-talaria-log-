"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
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

/* ═══════════ TYPES ═══════════ */

interface AuthUser {
  id: number;
  name: string;
  email: string;
  role?: string;
  created_at?: string;
}

interface Subscription {
  has_subscription: boolean;
  has_journal_access?: boolean;
  plan?: { name?: string };
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
}

interface EquityPoint {
  date: string;
  balance: number;
  pnl: number;
}

interface EquityData {
  equity_curve: EquityPoint[];
  initial_balance: number;
  final_balance: number;
  max_drawdown: number;
  max_drawdown_pct: number;
}

interface StreakData {
  current_streak: { type: string | null; count: number };
  max_winning_streak: number;
  max_losing_streak: number;
}

interface Trade {
  id: number;
  symbol: string;
  direction: string;
  pnl: number | null;
  rr: number | null;
  strategy?: string;
  date?: string;
}

interface StrategyPerf {
  strategy: string;
  total_trades: number;
  win_rate: number;
  total_pnl: number;
}

interface SymbolPerf {
  symbol: string;
  total_trades: number;
  win_rate: number;
  total_pnl: number;
}

/* ═══════════ HELPERS ═══════════ */

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
  return `${(typeof v === "string" ? parseFloat(v) : v).toFixed(1)}%`;
}

function fmtDate(d: string | undefined | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function cn(...c: (string | false | undefined | null)[]): string {
  return c.filter(Boolean).join(" ");
}

/** Neon cyan accent — improves contrast on dark UI without full gradients */
const CARD =
  "rounded-lg border border-cyan-400/20 bg-cyan-950/30 shadow-[inset_0_1px_0_0_rgba(34,211,238,0.06)] hover:border-cyan-400/45 hover:shadow-[0_0_28px_-8px_rgba(34,211,238,0.22)] transition-all";

const SECTION =
  "text-[11px] font-medium text-cyan-400/95 uppercase tracking-[0.12em]";

const LINK_MUTED =
  "text-[11px] text-cyan-400/80 hover:text-cyan-300 transition-colors";

/* ═══════════ MAIN ═══════════ */

export default function GlobalDashboard() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [stats, setStats] = useState<JournalStats | null>(null);
  const [equity, setEquity] = useState<EquityData | null>(null);
  const [streakData, setStreakData] = useState<StreakData | null>(null);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [strategies, setStrategies] = useState<StrategyPerf[]>([]);
  const [symbols, setSymbols] = useState<SymbolPerf[]>([]);
  const [loading, setLoading] = useState(true);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
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

  const jwtFetch = useCallback((url: string) => {
    const token = localStorage.getItem("token");
    if (!token) return Promise.reject("no token");
    return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
        if (!me.ok) { window.location.replace(`/login/?next=${encodeURIComponent(window.location.pathname)}`); return; }
        const meData = (await me.json()) as { user: AuthUser };
        if (!alive) return;
        if (meData.user.role === "admin") { window.location.replace("/dashboard/admin/"); return; }
        setUser(meData.user);

        const r = await Promise.allSettled([
          fetch("/api/sessions", { credentials: "include" }),
          jwtFetch("/journal/api/subscriptions/my-subscription"),
          jwtFetch("/journal/api/journal/stats"),
          jwtFetch("/journal/api/journal/equities"),
          jwtFetch("/journal/api/journal/streaks"),
          jwtFetch("/journal/api/journal/list"),
          jwtFetch("/journal/api/journal/strategy-analysis"),
          jwtFetch("/journal/api/journal/symbol-analysis"),
        ]);
        if (!alive) return;

        const val = (i: number) =>
          r[i].status === "fulfilled" && (r[i] as PromiseFulfilledResult<Response>).value.ok
            ? (r[i] as PromiseFulfilledResult<Response>).value.json()
            : Promise.resolve(null);

        const [d0, d1, d2, d3, d4, d5, d6, d7] = await Promise.all(
          [0, 1, 2, 3, 4, 5, 6, 7].map(val)
        );

        if (d0) setSessions((d0.sessions || []).slice(0, 5));
        if (d1) setSub(d1);
        if (d2) setStats(d2);
        if (d3) setEquity(d3);
        if (d4) setStreakData(d4);
        if (d5) setRecentTrades((Array.isArray(d5) ? d5 : []).slice(-10).reverse());
        if (d6) setStrategies((Array.isArray(d6) ? d6 : []).sort((a: StrategyPerf, b: StrategyPerf) => b.total_pnl - a.total_pnl).slice(0, 6));
        if (d7) setSymbols((Array.isArray(d7) ? d7 : []).sort((a: SymbolPerf, b: SymbolPerf) => b.total_trades - a.total_trades).slice(0, 8));
      } catch {
        window.location.replace(`/login/?next=${encodeURIComponent(window.location.pathname)}`);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [jwtFetch]);

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

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center py-40">
        <div className="text-center">
          <div className="relative w-12 h-12 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-400 animate-spin shadow-[0_0_12px_rgba(34,211,238,0.35)]" />
          </div>
          <p className="text-[13px] text-cyan-100/50 tracking-tight">Loading your dashboard…</p>
        </div>
      </div>
    );
  }

  const planName = sub?.plan?.name;
  const hasSub = sub?.has_subscription || sub?.has_journal_access;
  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : null;
  const hasTrades = (stats?.total_trades ?? 0) > 0;
  const totalReturn =
    equity && equity.initial_balance > 0
      ? ((equity.final_balance - equity.initial_balance) / equity.initial_balance) * 100
      : null;

  const winCount = stats?.winning_trades ?? 0;
  const lossCount = stats?.losing_trades ?? 0;
  const totalWL = winCount + lossCount || 1;
  const winPct = (winCount / totalWL) * 100;

  return (
    <div className="relative space-y-8 pb-16">
      <div
        className="pointer-events-none absolute left-1/2 top-[-5rem] h-[min(22rem,55vh)] w-[min(56rem,140%)] -translate-x-1/2 bg-[radial-gradient(ellipse_at_top,rgba(34,211,238,0.16),transparent_68%)]"
        aria-hidden
      />

      {/* ═══ HEADER ═══ */}
      <div className="relative flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6 border-b border-cyan-500/20 pb-8">
        <div>
          <h1 className="text-2xl sm:text-[26px] font-semibold text-slate-100 tracking-tight leading-snug">
            {greeting},{" "}
            <span className="text-cyan-300 drop-shadow-[0_0_20px_rgba(34,211,238,0.35)]">
              {user.name || "Trader"}
            </span>
          </h1>
          <p className="text-[13px] text-cyan-100/45 mt-1.5 font-normal">{todayStr}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-3">
            {planName ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded border border-cyan-400/35 bg-cyan-500/10 text-cyan-100/90">
                <Crown className="w-3 h-3 text-cyan-400/80" /> {planName}
              </span>
            ) : hasSub ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded border border-cyan-400/35 bg-cyan-500/10 text-cyan-100/90">
                <Shield className="w-3 h-3 text-cyan-400/80" /> Active
              </span>
            ) : null}
            {memberSince && (
              <span className="text-[11px] text-cyan-200/40">Member since {memberSince}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 self-start">
          <a
            href="/journal/settings"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-cyan-200/80 hover:text-cyan-100 border border-cyan-500/30 rounded-md px-3 py-1.5 bg-cyan-950/20 hover:bg-cyan-500/10 hover:border-cyan-400/45 transition-colors"
          >
            <Settings className="w-3.5 h-3.5 text-cyan-400/70" /> Settings
          </a>
          <a
            href="/journal/pricing"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-cyan-200/80 hover:text-cyan-100 border border-cyan-500/30 rounded-md px-3 py-1.5 bg-cyan-950/20 hover:bg-cyan-500/10 hover:border-cyan-400/45 transition-colors"
          >
            <CreditCard className="w-3.5 h-3.5 text-cyan-400/70" /> Plans
          </a>
        </div>
      </div>

      {/* ═══ QUICK NAV ═══ */}
      <div className="relative">
        <h2 className={cn(SECTION, "mb-3")}>Shortcuts</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { icon: BarChart3, title: "Backtesting", desc: "Historical strategy practice", href: "/backtest/" },
            { icon: BookOpen, title: "Trade Journal", desc: "Log and review trades", href: "/journal/dashboard" },
            { icon: GraduationCap, title: "Mentorship", desc: "Learn from professionals", href: "/bootcamp/" },
          ].map((item) => (
            <a
              key={item.title}
              href={item.href}
              className={cn(
                CARD,
                "group flex items-start gap-3.5 border-l-[3px] border-l-cyan-400/70 p-4 pl-[0.85rem] no-underline"
              )}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-cyan-400/25 bg-cyan-500/10 shadow-[0_0_12px_-4px_rgba(34,211,238,0.25)]">
                <item.icon className="h-[18px] w-[18px] text-cyan-300 group-hover:text-cyan-200 transition-colors" />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-slate-100 group-hover:text-cyan-50 transition-colors">
                    {item.title}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-cyan-500/50 group-hover:text-cyan-300 group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-[11px] text-cyan-100/40 mt-0.5 leading-relaxed">{item.desc}</p>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* ═══ METRICS ═══ */}
      {hasTrades && stats ? (
        <>
          <div>
            <h2 className={cn(SECTION, "mb-3")}>Performance overview</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCard icon={Activity} label="Total Trades" value={String(stats.total_trades ?? 0)} sub={`${stats.winning_trades ?? 0}W / ${stats.losing_trades ?? 0}L`} />
              <MetricCard icon={DollarSign} label="Net P&L" value={fmt(stats.total_pnl)} valueColor={(stats.total_pnl ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"} sub={`Avg ${fmt(stats.avg_pnl)}/trade`} trend={(stats.total_pnl ?? 0) >= 0 ? "up" : "down"} />
              <MetricCard icon={Target} label="Win Rate" value={pct(stats.win_rate)} valueColor={(stats.win_rate ?? 0) >= 50 ? "text-emerald-400" : "text-amber-400"} sub={stats.breakeven_trades ? `${stats.breakeven_trades} breakeven` : undefined} />
              <MetricCard icon={Scale} label="Profit Factor" value={stats.profit_factor != null ? (stats.profit_factor === Infinity ? "∞" : parseFloat(String(stats.profit_factor)).toFixed(2)) : "N/A"} valueColor={(stats.profit_factor ?? 0) >= 1.5 ? "text-emerald-400" : (stats.profit_factor ?? 0) >= 1 ? "text-amber-400" : "text-red-400"} sub="Gross win / Gross loss" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <MiniMetric icon={Trophy} label="Best Trade" value={fmt(stats.largest_win)} color="text-emerald-400" />
            <MiniMetric icon={TriangleAlert} label="Worst Trade" value={fmt(stats.largest_loss)} color="text-red-400" />
            <MiniMetric icon={TrendingUp} label="Avg Win" value={fmt(stats.avg_win)} color="text-emerald-400" />
            <MiniMetric icon={TrendingDown} label="Avg Loss" value={fmt(stats.avg_loss)} color="text-red-400" />
            <MiniMetric icon={Percent} label="Avg R:R" value={stats.avg_rr != null ? parseFloat(String(stats.avg_rr)).toFixed(2) : "N/A"} color="text-cyan-400" />
            <MiniMetric icon={Flame} label="Streak" value={streakData?.current_streak?.type ? `${streakData.current_streak.count} ${streakData.current_streak.type === "win" ? "W" : "L"}` : "—"} color={streakData?.current_streak?.type === "win" ? "text-emerald-400" : "text-red-400"} />
          </div>
        </>
      ) : (
        <div className={cn(CARD, "p-10 text-center border-cyan-400/25")}>
          <div className="w-11 h-11 mx-auto mb-4 rounded-md border border-cyan-400/35 bg-cyan-500/10 flex items-center justify-center shadow-[0_0_20px_-6px_rgba(34,211,238,0.35)]">
            <Activity className="w-5 h-5 text-cyan-400" />
          </div>
          <h3 className="text-[15px] font-medium text-slate-100 mb-1.5 tracking-tight">No trades yet</h3>
          <p className="text-[12px] text-cyan-100/45 mb-6 max-w-sm mx-auto leading-relaxed">
            Import trades or add them manually to unlock performance metrics and charts.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <a
              href="/journal/import-trades"
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-cyan-950 bg-cyan-400 border border-cyan-300 rounded-md px-4 py-2 hover:bg-cyan-300 hover:border-cyan-200 shadow-[0_0_20px_-4px_rgba(34,211,238,0.45)] transition-colors"
            >
              Import trades <ArrowRight className="w-3 h-3 opacity-70" />
            </a>
            <a
              href="/journal/journal"
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-cyan-200/85 border border-cyan-500/35 rounded-md px-4 py-2 bg-cyan-950/30 hover:bg-cyan-500/15 hover:border-cyan-400/50 transition-colors"
            >
              Add manually
            </a>
          </div>
        </div>
      )}

      {/* ═══ EQUITY + WIN/LOSS + STREAKS (CSS only) ═══ */}
      {hasTrades && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Equity sparkline */}
          <div className={cn(CARD, "lg:col-span-2 p-5")}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className={SECTION}>Equity curve</h3>
                {equity && (
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-lg font-bold text-slate-100">{fmt(equity.final_balance)}</span>
                    {totalReturn != null && (
                      <span className={cn("inline-flex items-center gap-0.5 text-[12px] font-semibold px-2 py-0.5 rounded-full", totalReturn >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400")}>
                        {totalReturn >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {Math.abs(totalReturn).toFixed(1)}%
                      </span>
                    )}
                  </div>
                )}
              </div>
              {equity && (
                <div className="text-right">
                  <div className="text-[11px] text-cyan-200/40">Max Drawdown</div>
                  <div className="text-sm font-semibold text-red-400/80">
                    {fmt(equity.max_drawdown)} <span className="text-[11px] text-red-400/50">({pct(equity.max_drawdown_pct)})</span>
                  </div>
                </div>
              )}
            </div>
            {equity?.equity_curve?.length ? (
              <SVGSparkline data={equity.equity_curve.map((p) => p.balance)} height={180} />
            ) : (
              <div className="h-[180px] flex items-center justify-center text-cyan-200/35 text-sm">No equity data yet</div>
            )}
          </div>

          {/* Win/Loss + Streaks */}
          <div className="flex flex-col gap-3">
            <div className={cn(CARD, "p-5 flex-1")}>
              <h3 className={cn(SECTION, "mb-3")}>Win / loss</h3>
              <div className="flex items-center gap-4">
                {/* CSS donut */}
                <div className="relative w-[90px] h-[90px] flex-shrink-0">
                  <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                    <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(34,211,238,0.1)" strokeWidth="5" />
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#22c55e" strokeWidth="5" strokeDasharray={`${winPct * 0.88} ${88 - winPct * 0.88}`} strokeLinecap="round" />
                    <circle cx="18" cy="18" r="14" fill="none" stroke="#ef4444" strokeWidth="5" strokeDasharray={`${(100 - winPct) * 0.88} ${88 - (100 - winPct) * 0.88}`} strokeDashoffset={`-${winPct * 0.88}`} strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[13px] font-bold text-cyan-100/70">{pct(stats?.win_rate)}</span>
                  </div>
                </div>
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500 flex-shrink-0" />
                    <span className="text-[12px] text-cyan-100/45 flex-1">Wins</span>
                    <span className="text-[13px] font-semibold text-slate-200">{winCount}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm bg-red-500 flex-shrink-0" />
                    <span className="text-[12px] text-cyan-100/45 flex-1">Losses</span>
                    <span className="text-[13px] font-semibold text-slate-200">{lossCount}</span>
                  </div>
                  {(stats?.breakeven_trades ?? 0) > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-sm bg-slate-500 flex-shrink-0" />
                      <span className="text-[12px] text-cyan-100/45 flex-1">Breakeven</span>
                      <span className="text-[13px] font-semibold text-slate-200">{stats?.breakeven_trades}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {streakData && (
              <div className={cn(CARD, "p-5")}>
                <h3 className={cn(SECTION, "mb-3")}>Streaks</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[11px] text-cyan-200/40 mb-0.5">Current</div>
                    <div className={cn("text-lg font-bold", streakData.current_streak.type === "win" ? "text-emerald-400" : streakData.current_streak.type === "loss" ? "text-red-400" : "text-cyan-200/35")}>
                      {streakData.current_streak.count > 0 ? `${streakData.current_streak.count}${streakData.current_streak.type === "win" ? "W" : "L"}` : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-cyan-200/40 mb-0.5">Best Streak</div>
                    <div className="text-lg font-bold text-emerald-400">{streakData.max_winning_streak}W</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ DAILY P&L (CSS bars) ═══ */}
      {dailyPnl.length > 0 && (
        <div className={cn(CARD, "p-5")}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={SECTION}>
              Daily P&amp;L{" "}
              <span className="text-cyan-200/45 normal-case font-normal tracking-normal">· last 30 days</span>
            </h3>
            <a href="/journal/analytics/calendar" className={LINK_MUTED}>
              Calendar →
            </a>
          </div>
          <CSSBarChart data={dailyPnl} />
        </div>
      )}

      {/* ═══ RECENT TRADES + STRATEGY ═══ */}
      {hasTrades && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className={cn(CARD, "lg:col-span-2 p-5")}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={SECTION}>Recent trades</h3>
              <a href="/journal/trades" className={LINK_MUTED}>
                View all →
              </a>
            </div>
            {recentTrades.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-cyan-500/15">
                      <th className="text-left py-2 px-2 text-cyan-400/70 font-medium">Symbol</th>
                      <th className="text-left py-2 px-2 text-cyan-400/70 font-medium">Side</th>
                      <th className="text-right py-2 px-2 text-cyan-400/70 font-medium">P&L</th>
                      <th className="text-right py-2 px-2 text-cyan-400/70 font-medium">R:R</th>
                      <th className="text-left py-2 px-2 text-cyan-400/70 font-medium hidden sm:table-cell">Strategy</th>
                      <th className="text-right py-2 px-2 text-cyan-400/70 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTrades.map((t) => (
                      <tr key={t.id} className="border-b border-cyan-500/10 hover:bg-cyan-500/[0.06] transition-colors">
                        <td className="py-2.5 px-2 font-semibold text-slate-200">{t.symbol || "—"}</td>
                        <td className="py-2.5 px-2">
                          <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase", t.direction?.toLowerCase() === "long" || t.direction?.toLowerCase() === "buy" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400")}>
                            {t.direction?.toLowerCase() === "long" || t.direction?.toLowerCase() === "buy" ? "Long" : "Short"}
                          </span>
                        </td>
                        <td className={cn("py-2.5 px-2 text-right font-semibold", (t.pnl ?? 0) >= 0 ? "text-emerald-400" : "text-red-400")}>{t.pnl != null ? fmt(t.pnl) : "—"}</td>
                        <td className="py-2.5 px-2 text-right text-cyan-100/55">{t.rr != null ? parseFloat(String(t.rr)).toFixed(2) : "—"}</td>
                        <td className="py-2.5 px-2 text-cyan-100/40 hidden sm:table-cell truncate max-w-[120px]">{t.strategy || "—"}</td>
                        <td className="py-2.5 px-2 text-right text-cyan-200/45">{fmtDate(t.date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-8 text-center text-cyan-200/35 text-sm">No recent trades</div>
            )}
          </div>

          {/* Strategy */}
          <div className={cn(CARD, "p-5")}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={SECTION}>By strategy</h3>
              <a href="/journal/analytics/performance-analysis" className={LINK_MUTED}>
                Details →
              </a>
            </div>
            {strategies.length > 0 ? (
              <div className="space-y-3">
                {strategies.map((s) => {
                  const maxPnl = Math.max(...strategies.map((x) => Math.abs(x.total_pnl || 1)));
                  const w = Math.min((Math.abs(s.total_pnl) / maxPnl) * 100, 100);
                  return (
                    <div key={s.strategy}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] text-cyan-100/55 truncate max-w-[140px]">{s.strategy}</span>
                        <span className={cn("text-[12px] font-semibold", s.total_pnl >= 0 ? "text-emerald-400" : "text-red-400")}>{fmt(s.total_pnl)}</span>
                      </div>
                      <div className="h-1.5 bg-cyan-950/50 rounded-full overflow-hidden ring-1 ring-cyan-500/10">
                        <div className={cn("h-full rounded-full", s.total_pnl >= 0 ? "bg-emerald-500/50" : "bg-red-500/50")} style={{ width: `${w}%` }} />
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[10px] text-cyan-200/40">{s.total_trades} trades</span>
                        <span className="text-[10px] text-cyan-200/40">{pct(s.win_rate)} WR</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-cyan-200/35 text-sm">No strategies found</div>
            )}
          </div>
        </div>
      )}

      {/* ═══ SYMBOLS + SESSIONS ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {symbols.length > 0 && (
          <div className={cn(CARD, "p-5")}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={SECTION}>Top symbols</h3>
              <a href="/journal/analytics/symbols" className={LINK_MUTED}>
                All symbols →
              </a>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {symbols.map((s) => (
                <div key={s.symbol} className="rounded-md border border-cyan-500/15 bg-cyan-950/20 p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12px] font-semibold text-cyan-100/75">{s.symbol}</span>
                    <span className={cn("text-[11px] font-bold", s.total_pnl >= 0 ? "text-emerald-400" : "text-red-400")}>{fmt(s.total_pnl)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-cyan-200/40">{s.total_trades} trades</span>
                    <span className="text-[10px] text-cyan-200/40">{pct(s.win_rate)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className={cn(CARD, "p-5")}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={SECTION}>Backtest sessions</h3>
            {sessions.length > 0 && (
              <a href="/backtest/" className={LINK_MUTED}>
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
                  className="group flex items-center gap-3 rounded-md border border-cyan-500/15 bg-cyan-950/25 hover:border-cyan-400/40 hover:bg-cyan-500/10 p-3 transition-colors"
                >
                  <div className="w-8 h-8 rounded-md border border-cyan-400/25 bg-cyan-500/10 flex items-center justify-center flex-shrink-0 shadow-[0_0_12px_-4px_rgba(34,211,238,0.2)]">
                    <Play className="w-3.5 h-3.5 text-cyan-400 ml-0.5 group-hover:text-cyan-300 transition-colors" fill="currentColor" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-slate-200 truncate group-hover:text-cyan-50 transition-colors">{s.name}</div>
                    <div className="text-[10px] text-cyan-200/40">
                      {s.session_type === "propfirm" ? "Prop Firm" : "Personal"}
                      {s.symbol ? ` · ${s.symbol}` : ""}
                      {s.start_balance ? ` · ${fmt(s.start_balance)}` : ""}
                    </div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-cyan-500/30 group-hover:text-cyan-400/80 transition-colors flex-shrink-0" />
                </a>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center">
              <p className="text-sm text-cyan-200/40 mb-3">No sessions yet</p>
              <a href="/backtest/" className="inline-flex items-center gap-1.5 text-[12px] font-medium text-cyan-400 hover:text-cyan-300 transition-colors">
                Start your first backtest <ArrowRight className="w-3 h-3 opacity-70" />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* ═══ ACCOUNT ═══ */}
      <div className={cn(CARD, "p-5")}>
        <h3 className={cn(SECTION, "mb-4")}>Account</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <AccountField icon={User} label="Email" value={user.email} />
          {memberSince && <AccountField icon={Calendar} label="Member Since" value={memberSince} />}
          <AccountField icon={Layers} label="Plan" value={planName || (hasSub ? "Active" : "No plan")} />
          {sub?.subscription?.status && (
            <AccountField icon={Clock} label="Status" value={`${sub.subscription.status}${sub.subscription.cancel_at_period_end ? " (canceling)" : ""}`} valueColor={sub.subscription.status === "active" ? "text-emerald-400/80" : sub.subscription.status === "trialing" ? "text-cyan-400/90" : "text-amber-400/80"} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════ SUB-COMPONENTS ═══════════ */

function MetricCard({ icon: Icon, label, value, valueColor, sub, trend }: { icon: React.ElementType; label: string; value: string; valueColor?: string; sub?: string; trend?: "up" | "down" }) {
  return (
    <div className={cn(CARD, "p-4")}>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-md border border-cyan-400/25 bg-cyan-500/10">
          <Icon className="w-3.5 h-3.5 text-cyan-400/80" />
        </div>
        <span className="text-[10px] font-medium text-cyan-400/75 uppercase tracking-[0.08em]">{label}</span>
        {trend && <span className="ml-auto">{trend === "up" ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400/60" /> : <ArrowDownRight className="w-3.5 h-3.5 text-red-400/60" />}</span>}
      </div>
      <div className={cn("text-lg font-semibold tracking-tight", valueColor || "text-slate-100")}>{value}</div>
      {sub && <div className="text-[11px] text-cyan-100/40 mt-1">{sub}</div>}
    </div>
  );
}

function MiniMetric({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string; color?: string }) {
  return (
    <div className={cn(CARD, "p-3")}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="w-3 h-3 text-cyan-500/45" />
        <span className="text-[10px] text-cyan-400/70 uppercase tracking-[0.06em] font-medium">{label}</span>
      </div>
      <div className={cn("text-[15px] font-semibold tracking-tight", color || "text-slate-200")}>{value}</div>
    </div>
  );
}

function AccountField({ icon: Icon, label, value, valueColor }: { icon: React.ElementType; label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-md border border-cyan-400/20 bg-cyan-500/5 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-cyan-400/65" />
      </div>
      <div>
        <div className="text-[10px] text-cyan-400/65 uppercase tracking-[0.06em] font-medium">{label}</div>
        <div className={cn("text-[12px] truncate max-w-[180px] font-medium", valueColor || "text-cyan-100/70")}>{value}</div>
      </div>
    </div>
  );
}

/* Pure SVG sparkline — no external library */
function SVGSparkline({ data, height = 160 }: { data: number[]; height?: number }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 800;
  const pad = 4;
  const h = height;
  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - 2 * pad);
    const y = pad + (1 - (v - min) / range) * (h - 2 * pad);
    return `${x},${y}`;
  });
  const line = points.join(" ");
  const areaPath = `M${points[0]} L${line} L${w - pad},${h} L${pad},${h} Z`;
  const isUp = data[data.length - 1] >= data[0];
  const stroke = isUp ? "#22d3ee" : "#f87171";
  const fill = isUp ? "rgba(34, 211, 238, 0.14)" : "rgba(248, 113, 113, 0.1)";

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <path d={areaPath} fill={fill} />
      <polyline points={line} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* Pure CSS bar chart */
function CSSBarChart({ data }: { data: { date: string; pnl: number }[] }) {
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.pnl)), 1);
  return (
    <div className="flex items-end gap-[3px] h-[120px]">
      {data.map((d, i) => {
        const pct = (Math.abs(d.pnl) / maxAbs) * 100;
        const isPos = d.pnl >= 0;
        return (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
            <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 px-2 py-1 rounded-md bg-slate-950 border border-cyan-500/25 text-[10px] text-cyan-100/90 whitespace-nowrap shadow-[0_0_16px_-4px_rgba(34,211,238,0.25)]">
              {new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}: {fmt(d.pnl)}
            </div>
            <div
              className={cn("w-full min-w-[4px] rounded-t transition-all", isPos ? "bg-emerald-500/60" : "bg-red-500/60")}
              style={{ height: `${Math.max(pct, 3)}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}
