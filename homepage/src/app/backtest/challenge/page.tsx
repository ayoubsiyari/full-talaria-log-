"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, BarChart3, RefreshCw, ShieldCheck, AlertTriangle } from "lucide-react";

type SessionPayload = {
  session?: {
    id: number;
    name: string;
    session_type?: string;
    config?: Record<string, unknown>;
  };
};

type ChallengeSnapshot = {
  updatedAt?: string;
  simulationPresetId?: string | null;
  simulationPresetLabel?: string | null;
  startBalance?: number;
  currentBalance?: number;
  profitPercent?: number;
  tradingDaysCount?: number;
  violations?: { dailyLoss?: boolean; totalLoss?: boolean };
  status?: string;
  summary?: {
    tradingDays?: { current?: number; required?: number; completed?: boolean };
    profit?: { current?: number; target?: number; completed?: boolean };
    dailyLoss?: { current?: number; limit?: number; breached?: boolean };
    totalLoss?: { current?: number; limit?: number; breached?: boolean };
  };
};

async function fetchJson<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", cache: "no-store", ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

function fmtMoney(n: number | undefined): string {
  if (n === undefined || Number.isNaN(n)) return "—";
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function rulePill(status: "pass" | "risk" | "breach" | "neutral") {
  const map = {
    pass: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30",
    risk: "bg-amber-500/15 text-amber-200 border-amber-500/30",
    breach: "bg-red-500/15 text-red-200 border-red-500/30",
    neutral: "bg-white/5 text-white/50 border-white/10",
  };
  return `inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${map[status]}`;
}

function ChallengeOverviewInner() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId")?.trim() || "";

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
        if (!res.ok) {
          const target = `${window.location.pathname}${window.location.search || ""}`;
          window.location.href = `/login/?next=${encodeURIComponent(target)}`;
          return;
        }
        const body = (await res.json().catch(() => null)) as {
          user?: { role?: string; has_journal_access?: boolean };
        } | null;
        if (mounted) {
          const role = body?.user?.role;
          if (role !== "admin" && !body?.user?.has_journal_access) {
            window.location.href = "/journal/pricing";
          }
        }
      } catch {
        const target = `${window.location.pathname}${window.location.search || ""}`;
        window.location.href = `/login/?next=${encodeURIComponent(target)}`;
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionName, setSessionName] = useState("");
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [snapshot, setSnapshot] = useState<ChallengeSnapshot | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) {
      setError("Missing sessionId in URL.");
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const s = await fetchJson<SessionPayload>(`/api/sessions/${encodeURIComponent(sessionId)}`);
      const sess = s.session;
      if (!sess) throw new Error("Session not found");
      if (sess.session_type && sess.session_type !== "propfirm") {
        setError("This page is for prop simulation sessions only.");
      }
      setSessionName(sess.name || "Challenge");
      setConfig((sess.config as Record<string, unknown>) || {});

      const st = await fetchJson<{ state?: { propfirm_challenge?: ChallengeSnapshot } }>(
        `/api/sessions/${encodeURIComponent(sessionId)}/state`,
      );
      setSnapshot(st.state?.propfirm_challenge && Object.keys(st.state.propfirm_challenge).length > 0
        ? st.state.propfirm_challenge
        : null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!sessionId) return;
    const t = setInterval(() => {
      void load();
    }, 5000);
    return () => clearInterval(t);
  }, [sessionId, load]);

  const chartHref = useMemo(() => {
    if (!sessionId) return "/chart/index.html";
    const cfg = config || {};
    const fileId =
      (typeof cfg.fileId === "string" || typeof cfg.fileId === "number" ? String(cfg.fileId) : null) ||
      (Array.isArray(cfg.files) && cfg.files[0] && typeof (cfg.files[0] as { id?: string }).id !== "undefined"
        ? String((cfg.files[0] as { id: string }).id)
        : "");
    const q = new URLSearchParams({ mode: "propfirm", sessionId });
    if (fileId) q.set("fileId", fileId);
    return `/chart/index.html?${q.toString()}`;
  }, [sessionId, config]);

  const presetLabel =
    (config?.simulationPresetLabel as string) ||
    snapshot?.simulationPresetLabel ||
    "—";

  const balance = typeof config?.balance === "number" ? config.balance : Number(config?.balance);
  const profitTarget = typeof config?.profitTarget === "number" ? config.profitTarget : Number(config?.profitTarget);
  const md = config?.maxDailyLoss as { percent?: number; dollar?: number } | undefined;
  const mt = config?.maxTotalLoss as { percent?: number; dollar?: number } | undefined;
  const minDays = config?.minTradingDays;

  const overallStatus = useMemo(() => {
    if (!snapshot) return "not_started" as const;
    if (snapshot.violations?.dailyLoss || snapshot.violations?.totalLoss) return "breached" as const;
    if (snapshot.status === "passed") return "passed" as const;
    return "active" as const;
  }, [snapshot]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.12),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(245,158,11,0.08),transparent_55%)]" />
      </div>

      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0b0b16]/80 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/backtest/"
              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70 hover:bg-white/10 transition shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              Sessions
            </Link>
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-tight truncate">Challenge overview</h1>
              <p className="text-xs text-white/40 truncate">{sessionName || "…"}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {loading && (
          <div className="rounded-2xl border border-white/10 bg-[#0b0b16]/50 p-8 text-center text-white/50 text-sm">
            Loading challenge…
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-950/20 p-6 text-sm text-red-200">{error}</div>
        )}

        {!loading && !error && (
          <>
            <div className="rounded-2xl border border-white/10 bg-[#0b0b16]/50 backdrop-blur-xl p-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white/90">Simulation</h2>
                  <p className="text-sm text-white/50 mt-1">{presetLabel}</p>
                  <p className="text-xs text-white/35 mt-2">
                    Rules below come from your session config. Live compliance updates when you trade in the chart (refreshes every 5s).
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="text-white/40 uppercase tracking-wide mb-1">Start balance</div>
                  <div className="font-semibold text-white/90">{Number.isFinite(balance) ? fmtMoney(balance) : "—"}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="text-white/40 uppercase tracking-wide mb-1">Profit target</div>
                  <div className="font-semibold text-white/90">{Number.isFinite(profitTarget) ? `${profitTarget}%` : "—"}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="text-white/40 uppercase tracking-wide mb-1">Max daily loss</div>
                  <div className="font-semibold text-white/90">
                    {md?.percent != null ? `${md.percent}%` : "—"}
                    {md?.dollar != null ? <span className="text-white/45 font-normal"> · {fmtMoney(md.dollar)}</span> : null}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="text-white/40 uppercase tracking-wide mb-1">Max total loss</div>
                  <div className="font-semibold text-white/90">
                    {mt?.percent != null ? `${mt.percent}%` : "—"}
                    {mt?.dollar != null ? <span className="text-white/45 font-normal"> · {fmtMoney(mt.dollar)}</span> : null}
                  </div>
                </div>
              </div>

              {minDays != null && (
                <p className="text-xs text-white/35 mt-3">Minimum trading days: {String(minDays)}</p>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0b0b16]/50 backdrop-blur-xl p-6">
              <h3 className="text-sm font-semibold text-white/90 mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-cyan-400" />
                Compliance status
              </h3>

              {!snapshot && (
                <p className="text-sm text-white/45">
                  No live data yet. Open the chart and place trades to record progress. This page will show pass / breach per rule.
                </p>
              )}

              {snapshot && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-white/40">Overall:</span>
                    {overallStatus === "breached" && (
                      <span className={rulePill("breach")}>Breached</span>
                    )}
                    {overallStatus === "passed" && (
                      <span className={rulePill("pass")}>Passed</span>
                    )}
                    {overallStatus === "active" && (
                      <span className={rulePill("neutral")}>In progress</span>
                    )}
                    {snapshot.updatedAt && (
                      <span className="text-white/30">Updated {new Date(snapshot.updatedAt).toLocaleString()}</span>
                    )}
                  </div>

                  <div className="grid gap-2 text-xs">
                    <div className="flex justify-between items-center py-2 border-b border-white/5">
                      <span className="text-white/50">Trading days</span>
                      <span className="text-white/85">
                        {snapshot.summary?.tradingDays?.current ?? snapshot.tradingDaysCount ?? 0}
                        {" / "}
                        {snapshot.summary?.tradingDays?.required ?? "—"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-white/5">
                      <span className="text-white/50">Profit vs target</span>
                      <span className="text-white/85">
                        {(snapshot.summary?.profit?.current ?? snapshot.profitPercent ?? 0).toFixed(2)}% /{" "}
                        {snapshot.summary?.profit?.target ?? profitTarget ?? "—"}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-white/5">
                      <span className="text-white/50">Daily loss (sim)</span>
                      <span className="flex items-center gap-2">
                        {(snapshot.summary?.dailyLoss?.breached || snapshot.violations?.dailyLoss) && (
                          <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                        )}
                        <span className="text-white/85">
                          {(snapshot.summary?.dailyLoss?.current ?? 0).toFixed(2)}% /{" "}
                          {snapshot.summary?.dailyLoss?.limit ?? md?.percent ?? "—"}%
                        </span>
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-white/50">Total loss (sim)</span>
                      <span className="flex items-center gap-2">
                        {(snapshot.summary?.totalLoss?.breached || snapshot.violations?.totalLoss) && (
                          <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                        )}
                        <span className="text-white/85">
                          {(snapshot.summary?.totalLoss?.current ?? 0).toFixed(2)}% /{" "}
                          {snapshot.summary?.totalLoss?.limit ?? mt?.percent ?? "—"}%
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between text-xs text-white/35 pt-2">
                    <span>Balance (sim)</span>
                    <span>{fmtMoney(snapshot.currentBalance ?? snapshot.startBalance)}</span>
                  </div>
                </div>
              )}
            </div>

            <a
              href={chartHref}
              className="flex items-center justify-center gap-2 w-full rounded-2xl py-4 font-semibold text-sm text-white bg-gradient-to-r from-blue-500/90 to-cyan-600/90 hover:from-blue-500 hover:to-cyan-500 border border-white/10 transition shadow-lg"
            >
              <BarChart3 className="w-5 h-5" />
              Open chart
            </a>
          </>
        )}
      </main>
    </div>
  );
}

export default function ChallengeOverviewPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background text-white/50 text-sm">
          Loading…
        </div>
      }
    >
      <ChallengeOverviewInner />
    </Suspense>
  );
}
