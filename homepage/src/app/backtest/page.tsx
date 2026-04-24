"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Trash2, BarChart3, Trophy, X, Shield } from "lucide-react";
import { LanguageToggle } from "@/components/LanguageToggle";
import { BacktestSubnav } from "./BacktestSubnav";
import "./sessions-dashboard.css";

interface Session {
  id: number;
  name: string;
  symbol?: string;
  session_type: string;
  start_balance?: number;
  start_date?: string;
  end_date?: string;
  created_at?: string;
  config?: Record<string, unknown>;
}

async function fetchJson<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

/** Match chart `userStorage` scoped key so the active session is consistent across chart and analytics. */
function setActiveTradingSessionIdInBrowser(sessionId: string) {
  try {
    localStorage.setItem("active_trading_session_id", sessionId);
  } catch {
    /* ignore */
  }
  try {
    const uid = localStorage.getItem("_uid");
    if (uid) {
      localStorage.setItem(`u${uid}_active_trading_session_id`, sessionId);
    }
  } catch {
    /* ignore */
  }
}

function readActiveTradingSessionIdFromBrowser(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const uid = localStorage.getItem("_uid");
    if (uid) {
      const scoped = localStorage.getItem(`u${uid}_active_trading_session_id`);
      if (scoped) return scoped;
    }
  } catch {
    /* ignore */
  }
  try {
    return localStorage.getItem("active_trading_session_id");
  } catch {
    return null;
  }
}

function relativeDate(dateStr?: string): string {
  if (!dateStr) return "-";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return `${diff} days ago`;
}

function initialsFromUser(name?: string, email?: string): string {
  const src = (name || email || "").trim();
  if (!src) return "?";
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return src.slice(0, 2).toUpperCase();
}

export default function BacktestSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [filter, setFilter] = useState<"all" | "personal" | "propfirm">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userInitials, setUserInitials] = useState("?");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) {
          const target = `${window.location.pathname}${window.location.search || ""}`;
          window.location.href = `/login/?next=${encodeURIComponent(target)}`;
          return;
        }
        const body = (await res.json().catch(() => null)) as {
          user?: { role?: string; has_journal_access?: boolean; name?: string; email?: string };
        } | null;
        if (mounted) {
          const role = body?.user?.role;
          setIsAdmin(role === "admin");
          setUserInitials(initialsFromUser(body?.user?.name, body?.user?.email));
          if (role !== "admin" && !body?.user?.has_journal_access) {
            window.location.href = "/journal/pricing";
            return;
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

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{ sessions: Session[] }>("/api/sessions");
      setSessions(data.sessions ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const stats = useMemo(
    () => ({
      total: sessions.length,
      personal: sessions.filter((s) => s.session_type === "personal").length,
      propfirm: sessions.filter((s) => s.session_type === "propfirm").length,
      lastCreated: sessions.length > 0 ? relativeDate(sessions[0]?.created_at) : "-",
    }),
    [sessions],
  );

  const lastCreatedSub = useMemo(() => {
    if (!sessions[0]?.created_at) return "—";
    return new Date(sessions[0].created_at).toLocaleDateString();
  }, [sessions]);

  const personalPct = stats.total > 0 ? Math.round((stats.personal / stats.total) * 100) : 0;
  const propPct = stats.total > 0 ? Math.round((stats.propfirm / stats.total) * 100) : 0;

  const filtered = useMemo(
    () => (filter === "all" ? sessions : sessions.filter((s) => s.session_type === filter)),
    [sessions, filter],
  );

  const activeSessionId = typeof window !== "undefined" ? readActiveTradingSessionIdFromBrowser() : null;

  function openSession(session: Session) {
    try {
      if (session.config) {
        const cfg = {
          ...session.config,
          type: session.session_type === "propfirm" ? "propfirm" : "standard",
        };
        localStorage.setItem("backtestingSession", JSON.stringify(cfg));
      }
      setActiveTradingSessionIdInBrowser(String(session.id));
    } catch {
      /* ignore */
    }
    const mode = session.session_type === "propfirm" ? "propfirm" : "backtest";
    window.location.href = `/chart/index.html?mode=${mode}&sessionId=${encodeURIComponent(String(session.id))}`;
  }

  function openSessionAnalytics(session: Session) {
    window.location.href = `/backtest/analytics?sessionId=${encodeURIComponent(String(session.id))}`;
  }

  function openChallengeOverview(session: Session) {
    window.location.href = `/backtest/challenge?sessionId=${encodeURIComponent(String(session.id))}`;
  }

  async function deleteSession(id: number) {
    if (!confirm("Are you sure you want to delete this session? This action cannot be undone.")) return;
    try {
      await fetchJson(`/api/sessions/${id}`, { method: "DELETE" });
      loadSessions();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  function continueSession() {
    const id = readActiveTradingSessionIdFromBrowser();
    if (id) {
      window.location.href = `/chart/index.html?mode=backtest&sessionId=${encodeURIComponent(id)}`;
    } else {
      window.location.href = "/chart/index.html?mode=backtest";
    }
  }

  const closeIframe = useCallback(() => {
    setIframeUrl(null);
    loadSessions();
  }, [loadSessions]);

  function goToBacktest(type: "personal" | "propfirm") {
    setModalOpen(false);
    const parentOrigin =
      typeof window !== "undefined" ? encodeURIComponent(window.location.origin) : "";
    const url =
      type === "personal"
        ? `/chart/backtesting.html?parentOrigin=${parentOrigin}&v=${Date.now()}`
        : `/chart/propfirm-backtest.html?parentOrigin=${parentOrigin}&v=${Date.now()}`;
    setIframeUrl(url);
  }

  useEffect(() => {
    const w = window as Window & { closePropFirmIframe?: () => void; closeBacktestingIframe?: () => void };
    w.closePropFirmIframe = closeIframe;
    w.closeBacktestingIframe = closeIframe;
    return () => {
      delete w.closePropFirmIframe;
      delete w.closeBacktestingIframe;
    };
  }, [closeIframe]);

  /**
   * Iframe runs on the chart app origin; the parent may be another port/host (static Next export).
   * Child sends an absolute URL (chart or app) — relative /chart/... would resolve on the wrong origin.
   */
  useEffect(() => {
    function isAllowedTalariaNavUrl(url: string): boolean {
      if (typeof url !== "string" || url.trim().startsWith("//")) return false;
      // Relative or absolute — iframe sends absolute chart origin + /chart/index.html?...
      if (url.includes("/chart/index.html")) return true;
      if (url.includes("/backtest/challenge")) return true;
      try {
        const u = new URL(url);
        const path = u.pathname.replace(/\/$/, "") || "/";
        if (path.endsWith("/chart/index.html")) return true;
        if (path === "/backtest/challenge" || path.startsWith("/backtest/challenge/")) return true;
        return false;
      } catch {
        return url.startsWith("/chart/") || url.startsWith("/backtest/challenge");
      }
    }
    function onMessage(ev: MessageEvent) {
      const d = ev.data as { type?: string; url?: string } | null;
      if (!d || d.type !== "talaria-open-chart" || typeof d.url !== "string") return;
      if (!isAllowedTalariaNavUrl(d.url)) return;
      window.location.replace(d.url);
    }
    window.addEventListener("message", onMessage, false);
    return () => window.removeEventListener("message", onMessage, false);
  }, []);

  useEffect(() => {
    if (!iframeUrl) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [iframeUrl]);

  const tabs: { key: "all" | "personal" | "propfirm"; label: string }[] = [
    { key: "all", label: "All" },
    { key: "personal", label: "Personal" },
    { key: "propfirm", label: "Prop Firm" },
  ];

  return (
    <div className="sd-root min-h-screen" dir="ltr" lang="en">
      <header className="sd-topbar">
        <div className="sd-logo-area">
          <a href="/" className="sd-logo-mark shrink-0" aria-label="Home">
            <img src="/logo-08.png" alt="" width={22} height={22} />
          </a>
          <div className="sd-brand-wrap">
            <span className="sd-brand">Sessions</span>
            <span className="sd-brand-sub">Dashboard</span>
          </div>
        </div>
        <div className="sd-topbar-right">
          <LanguageToggle />
          {isAdmin ? (
            <a href="/dashboard/admin/" className="sd-link-admin">
              Admin
            </a>
          ) : null}
          <div className="sd-avatar" aria-hidden title="Account">
            {userInitials}
          </div>
          <button type="button" onClick={() => setModalOpen(true)} className="sd-btn-primary">
            <Plus className="w-3 h-3 stroke-[3]" aria-hidden />
            Create Session
          </button>
        </div>
      </header>

      <BacktestSubnav active="sessions" />

      {activeSessionId ? (
        <div className="sd-banner">
          <div className="sd-banner-left">
            <span className="sd-banner-dot" />
            Continue your backtesting session
          </div>
          <button type="button" onClick={continueSession} className="sd-btn-ghost">
            Resume →
          </button>
        </div>
      ) : null}

      <main className="sd-main">
        <div className="sd-stats-grid sd-stats-grid--stack">
          <div className="sd-stat-card">
            <div className="sd-stat-label">Total Sessions</div>
            <div className="sd-stat-value">{stats.total}</div>
            <div className="sd-stat-sub">All time</div>
          </div>
          <div className="sd-stat-card">
            <div className="sd-stat-label">Personal Backtests</div>
            <div className="sd-stat-value">{stats.personal}</div>
            <div className="sd-stat-sub">{stats.total === 0 ? "—" : `${personalPct}% of total`}</div>
          </div>
          <div className="sd-stat-card">
            <div className="sd-stat-label">Prop Firm Backtests</div>
            <div className="sd-stat-value">{stats.propfirm}</div>
            <div className="sd-stat-sub">{stats.total === 0 ? "—" : `${propPct}% of total`}</div>
          </div>
          <div className="sd-stat-card sd-stat-accent">
            <div className="sd-stat-label">Last Created</div>
            <div className={`sd-stat-value ${stats.lastCreated.length > 12 ? "sd-stat-value-sm" : ""}`}>
              {stats.lastCreated}
            </div>
            <div className="sd-stat-sub">{lastCreatedSub}</div>
          </div>
        </div>

        <div className="sd-filters">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilter(t.key)}
              className={`sd-filter-btn ${filter === t.key ? "sd-active" : ""}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="sd-table-wrap">
          <div className="sd-table-head">
            <div className="sd-th">Session</div>
            <div className="sd-th">Symbol</div>
            <div className="sd-th">Strategy</div>
            <div className="sd-th">Type</div>
            <div className="sd-th">Balance</div>
            <div className="sd-th">Date Range</div>
            <div className="sd-th">Created</div>
            <div className="sd-th sd-th-actions">Actions</div>
          </div>

          {loading ? (
            <div className="sd-table-message">Loading sessions…</div>
          ) : error ? (
            <div className="sd-table-message">
              <div className="text-2xl mb-1" aria-hidden>
                ⚠️
              </div>
              <h3>Failed to load sessions</h3>
              <p className="sd-text-error">{error}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="sd-table-message">
              <div className="text-2xl mb-1" aria-hidden>
                📊
              </div>
              <h3>No sessions yet</h3>
              <p>Create your first backtest session to get started.</p>
            </div>
          ) : (
            filtered.map((s) => {
              const playbook =
                (s.config as { playbook_display?: string } | undefined)?.playbook_display?.trim() ||
                (s.config as { playbook?: string } | undefined)?.playbook ||
                "";
              return (
                <div key={s.id} className="sd-table-row">
                  <div>
                    <span className="sd-mob-label">Session</span>
                    <div className="sd-row-name-wrap">
                      <button
                        type="button"
                        onClick={() => openSession(s)}
                        title="Open session"
                        className="sd-play-btn"
                      >
                        <svg viewBox="0 0 10 10" width={12} height={12} aria-hidden className="shrink-0 ml-px">
                          <path d="M3 2l5 3-5 3V2z" fill="#60a5fa" />
                        </svg>
                      </button>
                      <div>
                        <div className="sd-row-name">{s.name}</div>
                        <div className="sd-row-date">
                          {s.created_at ? new Date(s.created_at).toLocaleString() : ""}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <span className="sd-mob-label">Symbol</span>
                    <span className="sd-symbol-pill" title={s.symbol || "N/A"}>
                      {s.symbol || "N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="sd-mob-label">Strategy</span>
                    <span className="sd-strategy-cell" title={playbook || undefined}>
                      {playbook || "—"}
                    </span>
                  </div>
                  <div>
                    <span className="sd-mob-label">Type</span>
                    <span
                      className={`sd-type-badge ${s.session_type === "personal" ? "sd-type-personal" : ""}`}
                    >
                      {s.session_type === "propfirm" ? "Prop Firm" : "Personal"}
                    </span>
                  </div>
                  <div>
                    <span className="sd-mob-label">Balance</span>
                    <span className="sd-balance">${Number(s.start_balance ?? 0).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="sd-mob-label">Date range</span>
                    <div className="sd-date-range">
                      {s.start_date ? new Date(s.start_date).toLocaleDateString() : "—"}
                      <br />
                      {s.end_date ? new Date(s.end_date).toLocaleDateString() : "—"}
                    </div>
                  </div>
                  <div>
                    <span className="sd-mob-label">Created</span>
                    <div className="sd-created-cell">
                      {s.created_at ? new Date(s.created_at).toLocaleDateString() : "—"}
                    </div>
                  </div>
                  <div>
                    <span className="sd-mob-label">Actions</span>
                    <div className="sd-actions-cell">
                      {s.session_type === "propfirm" ? (
                        <button
                          type="button"
                          onClick={() => openChallengeOverview(s)}
                          className="sd-act-btn sd-challenge"
                          title="Challenge rules and compliance"
                        >
                          <Shield className="w-3 h-3" />
                          Challenge
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => openSessionAnalytics(s)}
                        className="sd-act-btn"
                        title="Open analytics for this session"
                      >
                        <BarChart3 className="w-3 h-3" />
                        Analytics
                      </button>
                      <button type="button" onClick={() => deleteSession(s.id)} className="sd-act-btn sd-danger" title="Delete session">
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>

      {modalOpen ? (
        <div
          className="sd-modal-backdrop"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}
        >
          <div className="sd-modal-panel">
            <h2>Choose session type</h2>
            <p>Personal backtests, or prop-style simulations with preset rule packs and a compliance overview.</p>
            <div className="sd-modal-grid">
              <button type="button" onClick={() => goToBacktest("personal")} className="sd-modal-choice sd-modal-choice-alt">
                <BarChart3 className="w-10 h-10" strokeWidth={1.25} />
                <div className="sd-modal-choice-title">Standard Backtesting</div>
                <div className="sd-modal-choice-desc">Test your personal trading strategies and analyze performance.</div>
              </button>
              <button type="button" onClick={() => goToBacktest("propfirm")} className="sd-modal-choice">
                <Trophy className="w-10 h-10" strokeWidth={1.25} />
                <div className="sd-modal-choice-title">Prop simulations</div>
                <div className="sd-modal-choice-desc">Pick a preset rule set, then review compliance on the challenge dashboard.</div>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {iframeUrl ? (
        <div className="fixed inset-0 z-[3000] bg-black/75 flex items-center justify-center p-5 overscroll-none" role="presentation">
          <div className="sd-iframe-shell">
            <button type="button" onClick={closeIframe} className="sd-iframe-close" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
            <iframe src={iframeUrl} title="Backtest setup" className="sd-iframe" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
