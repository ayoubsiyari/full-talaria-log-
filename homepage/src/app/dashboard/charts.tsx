"use client";

import React from "react";
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
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

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

function cn(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

const CARD =
  "rounded-xl bg-white/[0.02] ring-1 ring-white/[0.06] hover:ring-white/[0.10] transition-all";

const tooltipStyle = {
  background: "#0f0f1a",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "8px",
  fontSize: "12px",
  color: "#fff",
};

interface EquityData {
  equity_curve: { date: string; balance: number; pnl: number }[];
  initial_balance: number;
  final_balance: number;
  max_drawdown: number;
  max_drawdown_pct: number;
}

interface Streak {
  current_streak: { type: string | null; count: number };
  max_winning_streak: number;
  max_losing_streak: number;
  avg_winning_streak: number;
  avg_losing_streak: number;
}

interface WinLossEntry {
  name: string;
  value: number;
  fill: string;
}

interface DailyPnlEntry {
  date: string;
  pnl: number;
}

export default function DashboardCharts({
  equity,
  totalReturn,
  winLossData,
  streakData,
  dailyPnl,
}: {
  equity: EquityData | null;
  totalReturn: number | null;
  winLossData: WinLossEntry[];
  streakData: Streak | null;
  dailyPnl: DailyPnlEntry[];
}) {
  return (
    <>
      {/* ── Equity + Win/Loss + Streaks ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
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
                    contentStyle={tooltipStyle}
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

        <div className="flex flex-col gap-3">
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

      {/* ── Daily P&L Bars ── */}
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
                    new Date(d).toLocaleDateString("en-US", { day: "numeric" })
                  }
                  tick={{ fill: "rgba(255,255,255,0.1)", fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={20}
                />
                <ReTooltip
                  contentStyle={tooltipStyle}
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
    </>
  );
}
