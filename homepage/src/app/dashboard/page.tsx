"use client";

import React from "react";
import { useLanguage } from "../LanguageProvider";

type TradingSession = {
  id: number;
  name: string;
  session_type: "personal" | "propfirm";
  created_at?: string | null;
  start_balance?: number | string | null;
  start_date?: string | null;
  end_date?: string | null;
  symbol?: string | null;
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...(init || {}), credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => null) as any;
    throw new Error(body?.detail ? String(body.detail) : `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export default function DashboardSessionsPage() {
  const { isArabic } = useLanguage();
  const [sessions, setSessions] = React.useState<TradingSession[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<"all" | "personal" | "propfirm">("all");

  const t = isArabic
    ? {
        title: "جلساتك",
        subtitle: "كل جلسة لها إعداداتها وبياناتها الخاصة.",
        newBacktest: "جلسة باكتيست",
        newProp: "جلسة بروب",
        continue: "متابعة",
        analytics: "تحليلات",
        delete: "حذف",
        empty: "لا توجد جلسات بعد",
        all: "الكل",
        personal: "شخصي",
        propfirm: "بروب",
      }
    : {
        title: "Your sessions",
        subtitle: "Each session has its own settings and chart data.",
        newBacktest: "New backtest",
        newProp: "New prop firm",
        continue: "Open",
        analytics: "Analytics",
        delete: "Delete",
        empty: "No sessions yet",
        all: "All",
        personal: "Personal",
        propfirm: "Prop Firm",
      };

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{ sessions: TradingSession[] }>("/api/sessions");
      setSessions(data.sessions || []);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const filtered = sessions.filter((s) => (filter === "all" ? true : s.session_type === filter));

  return (
    <div className={isArabic ? "text-right" : "text-left"}>
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t.title}</h1>
          <p className="text-sm text-white/60 mt-1">{t.subtitle}</p>
        </div>

        <div className={"flex flex-wrap gap-2 " + (isArabic ? "justify-start" : "justify-end")}>
          <a
            href="/chart/backtesting.html"
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 transition"
          >
            {t.newBacktest}
          </a>
          <a
            href="/chart/propfirm-backtest.html"
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10 transition"
          >
            {t.newProp}
          </a>
        </div>
      </div>

      <div className="mt-6 flex gap-2">
        {(["all", "personal", "propfirm"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={
              "rounded-full px-4 py-2 text-sm font-semibold border transition " +
              (filter === k
                ? "border-white/20 bg-white/10"
                : "border-white/10 bg-white/5 hover:bg-white/10")
            }
          >
            {k === "all" ? t.all : k === "personal" ? t.personal : t.propfirm}
          </button>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-[#0b0b16]/50 backdrop-blur-xl overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs font-semibold text-white/60 border-b border-white/10">
          <div className="col-span-5">Name</div>
          <div className="col-span-3">Symbol</div>
          <div className="col-span-2">Type</div>
          <div className="col-span-2"></div>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-white/60">Loading...</div>
        ) : error ? (
          <div className="p-6 text-sm text-red-300">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-white/60">{t.empty}</div>
        ) : (
          <div>
            {filtered.map((s) => (
              <div key={s.id} className="grid grid-cols-12 gap-2 px-4 py-4 border-t border-white/5 items-center">
                <div className="col-span-5">
                  <div className="font-semibold">{s.name}</div>
                  <div className="text-xs text-white/50">
                    {s.created_at ? new Date(s.created_at).toLocaleString() : ""}
                  </div>
                </div>
                <div className="col-span-3">
                  <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs">
                    {s.symbol || "—"}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs">
                    {s.session_type === "propfirm" ? "Prop" : "Personal"}
                  </span>
                </div>
                <div className={"col-span-2 flex gap-2 " + (isArabic ? "justify-start" : "justify-end")}>
                  <button
                    type="button"
                    onClick={() => {
                      const mode = s.session_type === "propfirm" ? "propfirm" : "backtest";
                      window.location.href = `/chart/index.html?mode=${mode}&sessionId=${encodeURIComponent(String(s.id))}`;
                    }}
                    className="rounded-full border border-white/10 bg-blue-500/80 px-3 py-2 text-xs font-semibold hover:bg-blue-500 transition"
                  >
                    {t.continue}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = `/dashboard/sessions/analytics/?id=${encodeURIComponent(String(s.id))}`;
                    }}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold hover:bg-white/10 transition"
                  >
                    {t.analytics}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm("Delete this session?")) return;
                      await fetchJson(`/api/sessions/${s.id}`, { method: "DELETE" });
                      await load();
                    }}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold hover:bg-white/10 transition"
                  >
                    {t.delete}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
