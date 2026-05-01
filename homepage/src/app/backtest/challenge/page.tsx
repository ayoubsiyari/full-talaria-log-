"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, BarChart3, RefreshCw, ShieldCheck, AlertTriangle } from "lucide-react";
import { Syne, DM_Mono } from "next/font/google";
import "./challenge-overview.css";

const fontSyne = Syne({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-syne",
});

const fontDmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
});

const fontClass = `${fontSyne.variable} ${fontDmMono.variable}`;

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

function rulePillClass(status: "pass" | "risk" | "breach" | "neutral"): string {
  const map = {
    pass: "co-pill co-pill-pass",
    risk: "co-pill co-pill-risk",
    breach: "co-pill co-pill-breach",
    neutral: "co-pill co-pill-neutral",
  };
  return map[status];
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
      setSnapshot(
        st.state?.propfirm_challenge && Object.keys(st.state.propfirm_challenge).length > 0
          ? st.state.propfirm_challenge
          : null,
      );
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
    (config?.simulationPresetLabel as string) || snapshot?.simulationPresetLabel || "—";

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
    <div className={`co-root ${fontClass}`} dir="ltr" lang="en">
      <header className="co-header">
        <div className="co-header-left">
          <Link href="/backtest/" className="co-link-back">
            <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden />
            Sessions
          </Link>
          <div className="co-title-block">
            <h1 className="co-title">Challenge overview</h1>
            <p className="co-subtitle">{sessionName || "…"}</p>
          </div>
        </div>
        <button type="button" onClick={() => void load()} className="co-btn-ghost">
          <RefreshCw className="w-3.5 h-3.5" aria-hidden />
          Refresh
        </button>
      </header>

      <main className="co-main">
        {loading && <div className="co-loading">Loading challenge…</div>}

        {!loading && error && <div className="co-error">{error}</div>}

        {!loading && !error && (
          <div className="co-stack">
            <section className="co-card" aria-labelledby="sim-heading">
              <div className="co-card-head">
                <div className="co-icon-box">
                  <ShieldCheck className="w-5 h-5" aria-hidden />
                </div>
                <div>
                  <h2 id="sim-heading" className="co-card-title">
                    Simulation
                  </h2>
                  <p className="co-card-meta">{presetLabel}</p>
                  <p className="co-card-desc">
                    Rules below come from your session config. Live compliance updates when you trade in the chart (refreshes every
                    5s).
                  </p>
                </div>
              </div>

              <div className="co-stat-grid">
                <div className="co-stat-cell">
                  <div className="co-stat-label">Start balance</div>
                  <div className="co-stat-value">{Number.isFinite(balance) ? fmtMoney(balance) : "—"}</div>
                </div>
                <div className="co-stat-cell">
                  <div className="co-stat-label">Profit target</div>
                  <div className="co-stat-value">{Number.isFinite(profitTarget) ? `${profitTarget}%` : "—"}</div>
                </div>
                <div className="co-stat-cell">
                  <div className="co-stat-label">Max daily loss</div>
                  <div className="co-stat-value">
                    {md?.percent != null ? `${md.percent}%` : "—"}
                    {md?.dollar != null ? (
                      <span>
                        {" "}
                        · {fmtMoney(md.dollar)}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="co-stat-cell">
                  <div className="co-stat-label">Max total loss</div>
                  <div className="co-stat-value">
                    {mt?.percent != null ? `${mt.percent}%` : "—"}
                    {mt?.dollar != null ? (
                      <span>
                        {" "}
                        · {fmtMoney(mt.dollar)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              {minDays != null && <p className="co-footnote">Minimum trading days: {String(minDays)}</p>}
            </section>

            <section className="co-card" aria-labelledby="compliance-heading">
              <h3 id="compliance-heading" className="co-section-title">
                <BarChart3 className="w-4 h-4" aria-hidden />
                Compliance status
              </h3>

              {!snapshot && (
                <p className="co-muted-para">
                  No live data yet. Open the chart and place trades to record progress. This page will show pass / breach per rule.
                </p>
              )}

              {snapshot && (
                <>
                  <div className="co-status-row">
                    <span className="co-status-label">Overall:</span>
                    {overallStatus === "breached" && <span className={rulePillClass("breach")}>Breached</span>}
                    {overallStatus === "passed" && <span className={rulePillClass("pass")}>Passed</span>}
                    {overallStatus === "active" && <span className={rulePillClass("neutral")}>In progress</span>}
                    {snapshot.updatedAt && (
                      <span className="co-updated">Updated {new Date(snapshot.updatedAt).toLocaleString()}</span>
                    )}
                  </div>

                  <div className="co-metrics">
                    <div className="co-metric">
                      <span className="co-metric-label">Trading days</span>
                      <span className="co-metric-value">
                        {snapshot.summary?.tradingDays?.current ?? snapshot.tradingDaysCount ?? 0}
                        {" / "}
                        {snapshot.summary?.tradingDays?.required ?? "—"}
                      </span>
                    </div>
                    <div className="co-metric">
                      <span className="co-metric-label">Profit vs target</span>
                      <span className="co-metric-value">
                        {(snapshot.summary?.profit?.current ?? snapshot.profitPercent ?? 0).toFixed(2)}% /{" "}
                        {snapshot.summary?.profit?.target ?? profitTarget ?? "—"}%
                      </span>
                    </div>
                    <div className="co-metric">
                      <span className="co-metric-label">Daily loss (sim)</span>
                      <span className="co-metric-value">
                        {(snapshot.summary?.dailyLoss?.breached || snapshot.violations?.dailyLoss) && (
                          <AlertTriangle className="w-3.5 h-3.5 co-warn-icon" aria-hidden />
                        )}
                        {(snapshot.summary?.dailyLoss?.current ?? 0).toFixed(2)}% /{" "}
                        {snapshot.summary?.dailyLoss?.limit ?? md?.percent ?? "—"}%
                      </span>
                    </div>
                    <div className="co-metric">
                      <span className="co-metric-label">Total loss (sim)</span>
                      <span className="co-metric-value">
                        {(snapshot.summary?.totalLoss?.breached || snapshot.violations?.totalLoss) && (
                          <AlertTriangle className="w-3.5 h-3.5 co-warn-icon" aria-hidden />
                        )}
                        {(snapshot.summary?.totalLoss?.current ?? 0).toFixed(2)}% /{" "}
                        {snapshot.summary?.totalLoss?.limit ?? mt?.percent ?? "—"}%
                      </span>
                    </div>
                  </div>

                  <div className="co-balance-row">
                    <span>Balance (sim)</span>
                    <span>{fmtMoney(snapshot.currentBalance ?? snapshot.startBalance)}</span>
                  </div>
                </>
              )}
            </section>

            <a href={chartHref} className="co-btn-chart">
              <BarChart3 className="w-5 h-5 shrink-0" aria-hidden />
              Open chart
            </a>
          </div>
        )}
      </main>
    </div>
  );
}

export default function ChallengeOverviewPage() {
  return (
    <Suspense
      fallback={
        <div className={`co-fallback ${fontClass}`} dir="ltr">
          Loading…
        </div>
      }
    >
      <ChallengeOverviewInner />
    </Suspense>
  );
}
