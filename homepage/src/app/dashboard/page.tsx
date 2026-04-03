"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  BarChart3,
  BookOpen,
  GraduationCap,
  Play,
  ArrowRight,
  TrendingUp,
  Target,
  Activity,
  Crown,
  Settings,
  CreditCard,
  User,
  Calendar,
} from "lucide-react";

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
  total_pnl?: number;
  win_rate?: number;
  profit_factor?: number;
}

const fmt = (v: number | undefined | null): string => {
  if (v == null) return "N/A";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
};

export default function GlobalDashboard() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [stats, setStats] = useState<JournalStats | null>(null);
  const [loading, setLoading] = useState(true);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }, []);

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

        const token = localStorage.getItem("token");

        const [sessRes, subRes, statsRes] = await Promise.allSettled([
          fetch("/api/sessions", { credentials: "include" }),
          token
            ? fetch("/journal/api/subscriptions/my-subscription", {
                headers: { Authorization: `Bearer ${token}` },
              })
            : Promise.reject("no token"),
          token
            ? fetch("/journal/api/journal/stats", {
                headers: { Authorization: `Bearer ${token}` },
              })
            : Promise.reject("no token"),
        ]);

        if (!mounted) return;

        if (sessRes.status === "fulfilled" && sessRes.value.ok) {
          const d = await sessRes.value.json();
          setSessions((d.sessions || []).slice(0, 3));
        }
        if (subRes.status === "fulfilled" && subRes.value.ok) {
          setSub(await subRes.value.json());
        }
        if (statsRes.status === "fulfilled" && statsRes.value.ok) {
          setStats(await statsRes.value.json());
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
  }, []);

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center">
          <div className="relative w-14 h-14 mx-auto mb-4">
            <div className="absolute inset-0 border-[3px] border-blue-500/20 rounded-full animate-pulse" />
            <div className="absolute inset-1.5 border-[3px] border-blue-500/40 border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-sm text-white/30">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const planName = sub?.plan?.name;
  const hasSub = sub?.has_subscription || sub?.has_journal_access;
  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <div className="space-y-6 pb-12">
      {/* ── Welcome Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {greeting},{" "}
            <span className="text-white/70">{user.name || "Trader"}</span>
          </h1>
          <div className="flex items-center gap-3 mt-1.5">
            {planName ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400">
                <Crown className="w-3 h-3" />
                {planName}
              </span>
            ) : hasSub ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                Active
              </span>
            ) : null}
            {memberSince && (
              <span className="text-[11px] text-white/20">
                Member since {memberSince}
              </span>
            )}
          </div>
        </div>
        <a
          href="/journal/settings"
          className="text-[12px] text-white/25 hover:text-white/50 border border-white/[0.06] rounded-lg px-3 py-1.5 transition-colors self-start"
        >
          Manage Subscription
        </a>
      </div>

      {/* ── Quick Navigation ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          {
            icon: BarChart3,
            title: "Backtesting",
            desc: "Practice strategies on historical data",
            href: "/backtest/",
            color: "bg-blue-600/80",
          },
          {
            icon: BookOpen,
            title: "Trade Journal",
            desc: "Log, analyze, and improve your trades",
            href: "/journal/dashboard",
            color: "bg-indigo-600/80",
          },
          {
            icon: GraduationCap,
            title: "Mentorship",
            desc: "Learn from professional traders",
            href: "/bootcamp/",
            color: "bg-violet-600/80",
          },
        ].map((item) => (
          <a
            key={item.title}
            href={item.href}
            className="group flex items-center gap-4 rounded-xl bg-white/[0.02] ring-1 ring-white/[0.06] hover:ring-white/[0.12] hover:bg-white/[0.04] transition-all p-4"
          >
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${item.color}`}
            >
              <item.icon className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white/80 group-hover:text-white transition-colors">
                {item.title}
              </div>
              <div className="text-[12px] text-white/25">{item.desc}</div>
            </div>
            <ArrowRight className="w-4 h-4 text-white/10 group-hover:text-white/40 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
          </a>
        ))}
      </div>

      {/* ── Journal Stats Overview ── */}
      <div>
        <h2 className="text-[13px] font-semibold text-white/30 uppercase tracking-wider mb-3">
          Trading Overview
        </h2>
        {stats && (stats.total_trades ?? 0) > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              icon={Activity}
              label="Total Trades"
              value={String(stats.total_trades ?? 0)}
            />
            <StatCard
              icon={TrendingUp}
              label="Net P&L"
              value={fmt(stats.total_pnl)}
              color={
                (stats.total_pnl ?? 0) >= 0
                  ? "text-emerald-400"
                  : "text-red-400"
              }
            />
            <StatCard
              icon={Target}
              label="Win Rate"
              value={
                stats.win_rate != null
                  ? `${parseFloat(String(stats.win_rate)).toFixed(1)}%`
                  : "N/A"
              }
            />
            <StatCard
              icon={BarChart3}
              label="Profit Factor"
              value={
                stats.profit_factor != null
                  ? stats.profit_factor === Infinity
                    ? "\u221E"
                    : parseFloat(String(stats.profit_factor)).toFixed(2)
                  : "N/A"
              }
              color={
                (stats.profit_factor ?? 0) >= 1.5
                  ? "text-emerald-400"
                  : "text-red-400"
              }
            />
          </div>
        ) : (
          <div className="rounded-xl bg-white/[0.02] ring-1 ring-white/[0.06] p-6 text-center">
            <p className="text-sm text-white/25 mb-3">
              No trades recorded yet
            </p>
            <a
              href="/journal/import-trades"
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-blue-400/80 hover:text-blue-400 transition-colors"
            >
              Import your first trades <ArrowRight className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>

      {/* ── Backtest Sessions Preview ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[13px] font-semibold text-white/30 uppercase tracking-wider">
            Backtest Sessions
          </h2>
          {sessions.length > 0 && (
            <a
              href="/backtest/"
              className="text-[12px] text-blue-400/60 hover:text-blue-400 transition-colors"
            >
              View all &rarr;
            </a>
          )}
        </div>
        {sessions.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {sessions.map((s) => (
              <a
                key={s.id}
                href={`/chart/index.html?mode=${s.session_type === "propfirm" ? "propfirm" : "backtest"}&sessionId=${s.id}`}
                className="group flex items-center gap-3 rounded-xl bg-white/[0.02] ring-1 ring-white/[0.06] hover:ring-white/[0.12] p-3.5 transition-all"
              >
                <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                  <Play
                    className="w-3.5 h-3.5 text-blue-400 ml-0.5"
                    fill="currentColor"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-white/70 truncate group-hover:text-white transition-colors">
                    {s.name}
                  </div>
                  <div className="text-[11px] text-white/20">
                    {s.session_type === "propfirm" ? "Prop Firm" : "Personal"}
                    {s.symbol ? ` \u00B7 ${s.symbol}` : ""}
                  </div>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="rounded-xl bg-white/[0.02] ring-1 ring-white/[0.06] p-6 text-center">
            <p className="text-sm text-white/25 mb-3">No sessions yet</p>
            <a
              href="/backtest/"
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-blue-400/80 hover:text-blue-400 transition-colors"
            >
              Start your first backtest <ArrowRight className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>

      {/* ── Account Info ── */}
      <div className="rounded-xl bg-white/[0.02] ring-1 ring-white/[0.06] p-5">
        <h2 className="text-[13px] font-semibold text-white/30 uppercase tracking-wider mb-4">
          Account
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div className="flex items-center gap-3">
            <User className="w-4 h-4 text-white/15 flex-shrink-0" />
            <div>
              <div className="text-[11px] text-white/20">Email</div>
              <div className="text-[13px] text-white/60">{user.email}</div>
            </div>
          </div>
          {memberSince && (
            <div className="flex items-center gap-3">
              <Calendar className="w-4 h-4 text-white/15 flex-shrink-0" />
              <div>
                <div className="text-[11px] text-white/20">Member since</div>
                <div className="text-[13px] text-white/60">{memberSince}</div>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <CreditCard className="w-4 h-4 text-white/15 flex-shrink-0" />
            <div>
              <div className="text-[11px] text-white/20">Plan</div>
              <div className="text-[13px] text-white/60">
                {planName || (hasSub ? "Active" : "No plan")}
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <a
            href="/journal/settings"
            className="inline-flex items-center gap-1.5 text-[12px] text-white/25 hover:text-white/50 border border-white/[0.06] rounded-lg px-3 py-1.5 transition-colors"
          >
            <Settings className="w-3 h-3" /> Settings
          </a>
          {!hasSub && (
            <a
              href="/journal/pricing"
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-1.5 hover:bg-blue-500/15 transition-colors"
            >
              <CreditCard className="w-3 h-3" /> View Plans
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
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
    <div className="rounded-xl bg-white/[0.02] ring-1 ring-white/[0.06] p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded bg-blue-500/10">
          <Icon className="w-3.5 h-3.5 text-blue-400/70" />
        </div>
        <span className="text-[11px] font-semibold text-white/25 uppercase tracking-wide">
          {label}
        </span>
      </div>
      <div className={`text-xl font-bold ${color || "text-white/80"}`}>
        {value}
      </div>
    </div>
  );
}
