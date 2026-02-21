"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Play, Trash2, BarChart3, Trophy, X } from "lucide-react";
import { LanguageToggle } from "@/components/LanguageToggle";

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

function relativeDate(dateStr?: string): string {
  if (!dateStr) return "-";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return `${diff} days ago`;
}

export default function BacktestSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [filter, setFilter] = useState<"all" | "personal" | "propfirm">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Auth check via chart session cookie
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
        const body = (await res.json().catch(() => null)) as { user?: { role?: string } } | null;
        if (mounted) {
          setIsAdmin(body?.user?.role === "admin");
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

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const stats = useMemo(() => ({
    total: sessions.length,
    personal: sessions.filter((s) => s.session_type === "personal").length,
    propfirm: sessions.filter((s) => s.session_type === "propfirm").length,
    lastCreated: sessions.length > 0 ? relativeDate(sessions[0]?.created_at) : "-",
  }), [sessions]);

  const filtered = useMemo(
    () => filter === "all" ? sessions : sessions.filter((s) => s.session_type === filter),
    [sessions, filter],
  );

  const activeSessionId = typeof window !== "undefined" ? localStorage.getItem("active_trading_session_id") : null;

  function openSession(session: Session) {
    try {
      if (session.config) localStorage.setItem("backtestingSession", JSON.stringify(session.config));
      localStorage.setItem("active_trading_session_id", String(session.id));
    } catch {}
    const mode = session.session_type === "propfirm" ? "propfirm" : "backtest";
    window.location.href = `/chart/index.html?mode=${mode}&sessionId=${encodeURIComponent(String(session.id))}`;
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
    const id = localStorage.getItem("active_trading_session_id");
    if (id) {
      window.location.href = `/chart/index.html?mode=backtest&sessionId=${encodeURIComponent(id)}`;
    } else {
      window.location.href = "/chart/index.html?mode=backtest";
    }
  }

  function goToBacktest(type: "personal" | "propfirm") {
    setModalOpen(false);
    const url = type === "personal"
      ? `/chart/backtesting.html?v=${Date.now()}`
      : `/chart/propfirm-backtest.html?v=${Date.now()}`;
    setIframeUrl(url);
  }

  function closeIframe() {
    setIframeUrl(null);
    loadSessions();
  }

  const tabs: { key: "all" | "personal" | "propfirm"; label: string }[] = [
    { key: "all", label: "All" },
    { key: "personal", label: "Personal" },
    { key: "propfirm", label: "Prop Firm" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Background gradient overlay (same as dashboard) */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.12),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(139,92,246,0.10),transparent_55%)]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0b0b16]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-3">
              <img src="/logo-08.png" alt="Talaria Log" className="h-9 w-9" />
            </a>
            <h1 className="text-xl font-bold tracking-tight">Sessions Dashboard</h1>
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            {isAdmin ? (
              <a
                href="/dashboard/admin/"
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold hover:bg-white/10 transition-all"
              >
                Admin
              </a>
            ) : null}
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-sm text-white bg-blue-500/80 hover:bg-blue-500 border border-white/10 transition-all"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              Create Session
            </button>
          </div>
        </div>
      </header>

      {/* Continue Banner */}
      {activeSessionId && (
        <div className="border-b border-white/10 bg-blue-500/10 px-4 py-3">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center text-base">📊</div>
              <span className="text-sm font-medium text-white/80">Continue your backtesting session</span>
            </div>
            <button
              onClick={continueSession}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold hover:bg-white/10 transition"
            >
              Continue session
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Sessions", value: stats.total },
            { label: "Personal Backtests", value: stats.personal },
            { label: "Prop Firm Backtests", value: stats.propfirm },
            { label: "Last Created", value: stats.lastCreated, small: true },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-white/10 bg-[#0b0b16]/50 backdrop-blur-xl p-5 hover:border-white/20 transition-all"
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-2">{s.label}</div>
              <div className={`font-bold text-white ${s.small ? "text-base" : "text-3xl"}`}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold border transition ${
                filter === t.key
                  ? "border-white/20 bg-white/10"
                  : "border-white/10 bg-white/5 hover:bg-white/10"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-white/10 bg-[#0b0b16]/50 backdrop-blur-xl overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-white/10">
                {["Name", "Symbol", "Type", "Start Balance", "Date Range", "Created", "Actions"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase text-white/40">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-white/40">Loading sessions...</td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="text-center py-16">
                    <div className="text-4xl mb-3">⚠️</div>
                    <h3 className="font-semibold text-white/80 mb-1">Failed to load sessions</h3>
                    <p className="text-sm text-red-300/80">{error}</p>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16">
                    <div className="text-4xl mb-3">📊</div>
                    <h3 className="font-semibold text-white/80 mb-1">No Sessions Yet</h3>
                    <p className="text-sm text-white/40">Create your first backtest session to get started</p>
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr key={s.id} className="border-t border-white/5 hover:bg-white/[0.03] transition">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => openSession(s)}
                          title="Open session"
                          className="w-9 h-9 rounded-full bg-blue-500/80 text-white flex items-center justify-center hover:bg-blue-500 hover:scale-105 transition"
                        >
                          <Play className="w-3.5 h-3.5 ml-0.5" fill="white" />
                        </button>
                        <div>
                          <div className="font-semibold text-white/90">{s.name}</div>
                          <div className="text-xs text-white/40">
                            {s.created_at ? new Date(s.created_at).toLocaleString() : ""}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium">
                        {s.symbol || "N/A"}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                          s.session_type === "propfirm"
                            ? "border-pink-500/30 bg-pink-500/10 text-pink-300"
                            : "border-blue-500/30 bg-blue-500/10 text-blue-300"
                        }`}
                      >
                        {s.session_type === "propfirm" ? "Prop Firm" : "Personal"}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-white/70">${Number(s.start_balance ?? 0).toLocaleString()}</td>
                    <td className="px-4 py-4 text-xs text-white/50">
                      {s.start_date ? new Date(s.start_date).toLocaleDateString() : "-"} –{" "}
                      {s.end_date ? new Date(s.end_date).toLocaleDateString() : "-"}
                    </td>
                    <td className="px-4 py-4 text-xs text-white/50">
                      {s.created_at ? new Date(s.created_at).toLocaleDateString() : "-"}
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={() => deleteSession(s.id)}
                        className="flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/20 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* Create Session Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="rounded-2xl border border-white/10 bg-[#0b0b16]/95 backdrop-blur-xl p-10 max-w-[650px] w-full shadow-2xl">
            <h2 className="text-2xl font-semibold text-white mb-2">
              Choose Session Type
            </h2>
            <p className="text-white/50 text-sm mb-6">Select the type of backtesting session you want to create</p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => goToBacktest("personal")}
                className="rounded-2xl border-2 border-white/10 bg-white/[0.03] p-8 text-center hover:border-blue-500/40 hover:bg-blue-500/[0.06] hover:-translate-y-1 transition-all group"
              >
                <BarChart3 className="w-12 h-12 mx-auto mb-3 text-blue-400 group-hover:text-blue-300 transition" />
                <div className="font-semibold text-white/90 mb-1">Standard Backtesting</div>
                <div className="text-xs text-white/40">Test your personal trading strategies and analyze performance</div>
              </button>
              <button
                onClick={() => goToBacktest("propfirm")}
                className="rounded-2xl border-2 border-white/10 bg-white/[0.03] p-8 text-center hover:border-amber-500/40 hover:bg-amber-500/[0.06] hover:-translate-y-1 transition-all group"
              >
                <Trophy className="w-12 h-12 mx-auto mb-3 text-amber-400 group-hover:text-amber-300 transition" />
                <div className="font-semibold text-white/90 mb-1">Prop Firm Mode</div>
                <div className="text-xs text-white/40">Practice with industry-standard prop firm challenge rules</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chart Iframe Modal */}
      {iframeUrl && (
        <div
          className="fixed inset-0 z-[3000] bg-black/75 flex items-center justify-center p-5"
          onClick={(e) => e.target === e.currentTarget && closeIframe()}
          onKeyDown={(e) => e.key === "Escape" && closeIframe()}
        >
          <div className="relative w-[90vw] h-[90vh] max-w-[1200px] bg-[#030014] rounded-2xl overflow-hidden shadow-2xl border border-white/10">
            <button
              onClick={closeIframe}
              className="absolute top-3 right-3 z-[10000] w-10 h-10 rounded-full bg-white/10 border border-white/20 text-white flex items-center justify-center shadow-lg hover:bg-white/20 hover:scale-110 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
            <iframe src={iframeUrl} className="w-full h-full border-none rounded-2xl" />
          </div>
        </div>
      )}
    </div>
  );
}
