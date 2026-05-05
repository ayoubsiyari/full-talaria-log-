"use client";

import React, { useState, useEffect, useCallback } from "react";

/* ── Design system tokens (dark mode) ── */
const c = {
  ac: "#2643F7", acL: "#4A6AFF", acD: "rgba(38,67,247,0.08)", acB: "rgba(38,67,247,0.22)",
  gold: "#C9A84C",
  bg: "#07080E", sf: "#0A0C14", el: "#0F1119",
  br: "rgba(140,160,255,0.05)", brH: "rgba(140,160,255,0.12)",
  tx: "rgba(255,255,255,0.92)", ts: "rgba(255,255,255,0.70)", tm: "rgba(255,255,255,0.50)",
  gn: "#00D4A1", rd: "#FF5068",
};
const F = "'Exo 2', sans-serif";

/* ── Types ── */
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

interface Kpis {
  trades: number;
  win_rate: number | null;
  net_pnl: number;
  expectancy_r: number | null;
  start_balance: number | null;
}

type SessFilter = "all" | "not-started" | "active" | "completed" | "standard" | "prop";
type LayoutMode = "rows" | "cards";

/* ── Helpers ── */
async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<T>;
}

function fmtShortDate(d?: string): string {
  if (!d) return "—";
  const [, mo, day] = d.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[+mo - 1]} ${Number(day)}`;
}

function fmtFullDate(d?: string): string {
  if (!d) return "—";
  const [y, mo, day] = d.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[+mo - 1]} ${Number(day)}, ${y}`;
}

function getProgress(sess: Session, k?: Kpis): number {
  if (!k || k.trades === 0) return 0;
  if (!sess.end_date) return 50;
  const now = Date.now();
  const end = new Date(sess.end_date).getTime();
  if (now >= end) return 100;
  if (!sess.start_date) return 50;
  const start = new Date(sess.start_date).getTime();
  const total = end - start;
  const elapsed = now - start;
  return Math.min(99, Math.max(1, Math.round((elapsed / total) * 100)));
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toLocaleString()}`;
}

/* ── Main component ── */
export function BacktestView() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [kpis, setKpis] = useState<Record<number, Kpis>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<SessFilter>("all");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("rows");
  const [searchQ, setSearchQ] = useState("");
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [hov, setHov] = useState<string | null>(null);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson<{ sessions: Session[] }>("/api/sessions");
      const list = data.sessions ?? [];
      setSessions(list);
      const results = await Promise.allSettled(
        list.map(s => fetchJson<{ analytics: { kpis: Kpis } }>(`/api/sessions/${s.id}/analytics`))
      );
      const map: Record<number, Kpis> = {};
      results.forEach((r, i) => {
        if (r.status === "fulfilled") map[list[i].id] = r.value.analytics.kpis;
      });
      setKpis(map);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  useEffect(() => {
    const w = window as Window & { closeBacktestingIframe?: () => void; closePropFirmIframe?: () => void };
    w.closeBacktestingIframe = () => { setIframeUrl(null); loadSessions(); };
    w.closePropFirmIframe = () => { setIframeUrl(null); loadSessions(); };
    return () => { delete w.closeBacktestingIframe; delete w.closePropFirmIframe; };
  }, [loadSessions]);

  /* ── Derived stats ── */
  const propSess = sessions.filter(s => s.session_type === "propfirm");
  const stdSess  = sessions.filter(s => s.session_type !== "propfirm");

  const propCompleted = propSess.filter(s => getProgress(s, kpis[s.id]) === 100).length;
  const propActive    = propSess.filter(s => { const p = getProgress(s, kpis[s.id]); return p > 0 && p < 100; }).length;
  const stdCompleted  = stdSess.filter(s => getProgress(s, kpis[s.id]) === 100).length;
  const stdActive     = stdSess.filter(s => { const p = getProgress(s, kpis[s.id]); return p > 0 && p < 100; }).length;

  const totalTrades = Object.values(kpis).reduce((a, k) => a + (k.trades || 0), 0);

  const withPnl = sessions.filter(s => kpis[s.id]?.net_pnl != null);
  const profSess = withPnl.filter(s => (kpis[s.id]?.net_pnl ?? 0) > 0).length;
  const profPct  = withPnl.length ? Math.round((profSess / withPnl.length) * 100) : 0;

  const totalDays = sessions.reduce((a, s) => {
    if (!s.start_date || !s.end_date) return a;
    return a + Math.max(0, Math.round((new Date(s.end_date).getTime() - new Date(s.start_date).getTime()) / 86400000));
  }, 0);

  const tickerFreq: Record<string, number> = {};
  sessions.forEach(s => { if (s.symbol) tickerFreq[s.symbol] = (tickerFreq[s.symbol] || 0) + 1; });
  const topTickers = Object.entries(tickerFreq).sort((a, b) => b[1] - a[1]).slice(0, 7);
  const tkMax = topTickers[0]?.[1] || 1;

  /* ── Filter + sort ── */
  const getCount = (v: string) =>
    v === "all" ? sessions.length :
    sessions.filter(s => {
      const p = getProgress(s, kpis[s.id]);
      if (v === "not-started") return p === 0;
      if (v === "active")      return p > 0 && p < 100;
      if (v === "completed")   return p === 100;
      if (v === "standard")    return s.session_type !== "propfirm";
      if (v === "prop")        return s.session_type === "propfirm";
      return true;
    }).length;

  const filteredSessions = [...sessions]
    .filter(s => {
      if (searchQ) {
        const q = searchQ.toLowerCase();
        const cfg = s.config as Record<string, string> | undefined;
        if (!s.name.toLowerCase().includes(q) && !(s.symbol || "").toLowerCase().includes(q) && !(cfg?.strategy_name || "").toLowerCase().includes(q)) return false;
      }
      const p = getProgress(s, kpis[s.id]);
      if (filter === "not-started") return p === 0;
      if (filter === "active")      return p > 0 && p < 100;
      if (filter === "completed")   return p === 100;
      if (filter === "standard")    return s.session_type !== "propfirm";
      if (filter === "prop")        return s.session_type === "propfirm";
      return true;
    })
    .sort((a, b) => {
      if (!sortBy) return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      const dir = sortDir === "asc" ? 1 : -1;
      let cmp = 0;
      if (sortBy === "name")    cmp = a.name.localeCompare(b.name);
      if (sortBy === "mode")    cmp = a.session_type.localeCompare(b.session_type);
      if (sortBy === "capital") cmp = (a.start_balance || 0) - (b.start_balance || 0);
      if (sortBy === "date")    cmp = new Date(a.start_date || 0).getTime() - new Date(b.start_date || 0).getTime();
      if (sortBy === "pnl")     cmp = (kpis[a.id]?.net_pnl ?? -Infinity) - (kpis[b.id]?.net_pnl ?? -Infinity);
      if (sortBy === "winRate") cmp = (kpis[a.id]?.win_rate ?? -1) - (kpis[b.id]?.win_rate ?? -1);
      if (sortBy === "trades")  cmp = (kpis[a.id]?.trades || 0) - (kpis[b.id]?.trades || 0);
      if (sortBy === "progress")cmp = getProgress(a, kpis[a.id]) - getProgress(b, kpis[b.id]);
      return cmp * dir;
    });

  /* ── Actions ── */
  const goNew = () => {
    const origin = encodeURIComponent(window.location.origin);
    setIframeUrl(`/chart/backtesting.html?parentOrigin=${origin}&v=${Date.now()}`);
  };

  const openSession = (s: Session) => {
    try {
      if (s.config) {
        const cfg = { ...s.config, type: s.session_type === "propfirm" ? "propfirm" : "standard" };
        localStorage.setItem("backtestingSession", JSON.stringify(cfg));
      }
      const uid = localStorage.getItem("_uid");
      if (uid) localStorage.setItem(`u${uid}_active_trading_session_id`, String(s.id));
      localStorage.setItem("active_trading_session_id", String(s.id));
    } catch { /* ignore */ }
    const mode = s.session_type === "propfirm" ? "propfirm" : "backtest";
    window.location.href = `/chart/index.html?mode=${mode}&sessionId=${encodeURIComponent(String(s.id))}`;
  };

  const openAnalytics = (s: Session) => {
    window.location.href = `/backtest/analytics?sessionId=${encodeURIComponent(String(s.id))}`;
  };

  const toggleSort = (key: string) => {
    if (sortBy === key) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortBy(null); setSortDir("asc"); }
    } else {
      setSortBy(key); setSortDir("asc");
    }
  };

  /* ── Arc gauge ── */
  const PR = 46, PC = 2 * Math.PI * PR;
  const profLen = (profPct / 100) * PC;

  /* ── Trades bar chart ── */
  const trBars = [...sessions].sort((a, b) => (kpis[b.id]?.trades || 0) - (kpis[a.id]?.trades || 0));
  const trMax = (kpis[trBars[0]?.id]?.trades) || 1;

  /* ── Dot grid ── */
  const dotsN = Math.min(Math.ceil(totalDays / 30), 56);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", background: c.bg, fontFamily: F }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 32, height: 32, border: `2px solid ${c.acL}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
          <div style={{ fontSize: 12, color: c.tm }}>Loading sessions…</div>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: c.bg, fontFamily: F, overflow: "hidden" }}>

      {/* ── Sub-header: title + New Session button ── */}
      <div style={{ height: 48, flexShrink: 0, display: "flex", alignItems: "center", padding: "0 32px", borderBottom: `1px solid ${c.brH}`, background: c.el }}>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", color: c.ts }}>BACKTESTING SESSIONS</span>
        <div style={{ flex: 1 }} />
        <div onClick={goNew}
          onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.filter = "brightness(1.15)"}
          onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.filter = "brightness(1)"}
          style={{ display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 16px", background: "linear-gradient(135deg,#1e38e8,#4A6AFF)", cursor: "pointer", fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.96)", letterSpacing: "0.07em", boxShadow: "0 2px 10px rgba(38,67,247,0.35)", userSelect: "none" }}>
          <svg width={11} height={11} viewBox="0 0 24 24" fill="none"><line x1="12" y1="4" x2="12" y2="20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /><line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
          New Session
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflowY: "auto" }}>

        {/* ── 5 Stats Tiles ── */}
        <div style={{ padding: "16px 32px 12px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "260px 1fr 185px 165px 200px", gap: 8, alignItems: "stretch" }}>

            {/* Tile 1: Sessions & Mode */}
            <div style={{ background: c.sf, border: `1px solid ${c.brH}`, position: "relative", padding: "10px 12px", display: "flex", flexDirection: "column" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,${c.acL},${c.gold})`, opacity: 0.6 }} />
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.08em", color: c.tm, textTransform: "uppercase" as const }}>Sessions & Mode</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: c.tx, fontVariantNumeric: "tabular-nums" }}>{sessions.length}</span>
                  <span style={{ fontSize: 8, color: c.tm }}>total</span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, justifyContent: "center" }}>
                {[
                  { label: "Standard", count: stdSess.length, done: stdCompleted, act: stdActive, col: c.acL },
                  { label: "Prop Firm", count: propSess.length, done: propCompleted, act: propActive, col: c.gold },
                ].map(({ label, count, done, act, col }) => {
                  const pending = count - done - act;
                  const pct = (n: number) => count ? `${(n / count) * 100}%` : "0%";
                  return (
                    <div key={label}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <div style={{ width: 5, height: 5, background: col, flexShrink: 0, transform: "rotate(45deg)" }} />
                        <span style={{ fontSize: 9, fontWeight: 700, color: c.ts, flex: 1 }}>{label}</span>
                        <span style={{ fontSize: 16, fontWeight: 800, color: col, fontVariantNumeric: "tabular-nums" }}>{count}</span>
                      </div>
                      <div style={{ height: 6, display: "flex", gap: 1, overflow: "hidden" }}>
                        <div style={{ width: pct(done), background: c.gn, flexShrink: 0 }} />
                        <div style={{ width: pct(act), background: c.acL, flexShrink: 0 }} />
                        <div style={{ width: pct(pending), background: "rgba(255,255,255,0.09)", flexShrink: 0 }} />
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 3 }}>
                        <span style={{ fontSize: 8, fontWeight: 600, color: c.gn, fontVariantNumeric: "tabular-nums" }}>{done} done</span>
                        <span style={{ fontSize: 8, fontWeight: 600, color: c.acL, fontVariantNumeric: "tabular-nums" }}>{act} active</span>
                        <span style={{ fontSize: 8, color: c.tm, fontVariantNumeric: "tabular-nums" }}>{pending} pending</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tile 2: Total Trades bar chart */}
            <div style={{ background: c.sf, border: `1px solid ${c.brH}`, position: "relative", padding: "10px 12px", display: "flex", flexDirection: "column" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${c.acL},transparent)` }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.08em", color: c.tm, textTransform: "uppercase" as const }}>Total Trades</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: c.tx, fontVariantNumeric: "tabular-nums" }}>{totalTrades.toLocaleString()}</div>
              </div>
              <div style={{ flex: 1 }} />
              {(() => {
                const svgW = 422, maxH = 96, barGap = 2;
                const barsN = trBars.length || 1;
                const barW = Math.max(2, Math.floor((svgW - barGap * (barsN - 1)) / barsN));
                const usedW = barsN * barW + barGap * (barsN - 1);
                const ox = Math.floor((svgW - usedW) / 2);
                return (
                  <svg width={svgW} height={maxH} style={{ display: "block", flex: "none", marginBottom: 2 }}>
                    {trBars.map((s, i) => {
                      const t = kpis[s.id]?.trades || 0;
                      const h = t ? Math.max(3, Math.round((t / trMax) * maxH)) : 2;
                      const col = s.session_type === "propfirm" ? c.gold : c.acL;
                      const isH = hov === `tr_${s.id}`;
                      return (
                        <rect key={s.id} x={ox + i * (barW + barGap)} y={maxH - h} width={barW} height={h}
                          fill={col} opacity={isH ? 1 : 0.82}
                          style={{ cursor: "default", filter: isH ? "brightness(1.6)" : "none" }}
                          onMouseEnter={() => setHov(`tr_${s.id}`)}
                          onMouseLeave={() => setHov(null)} />
                      );
                    })}
                  </svg>
                );
              })()}
              <div style={{ display: "flex", gap: 12, marginTop: 5 }}>
                {[{ l: "Standard", col: c.acL }, { l: "Prop Firm", col: c.gold }].map(({ l, col }) => (
                  <div key={l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 8, height: 2, background: col }} />
                    <span style={{ fontSize: 8, color: c.tm }}>{l}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tile 3: Profitable sessions arc */}
            <div style={{ background: c.sf, border: `1px solid ${c.brH}`, position: "relative", padding: "10px 12px", display: "flex", flexDirection: "column" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${profPct >= 50 ? c.gn : c.rd},transparent)` }} />
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.08em", color: c.tm, textTransform: "uppercase" as const, marginBottom: 6 }}>Profitable Sessions</div>
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width={90} height={90} viewBox="0 0 120 120">
                  {withPnl.length === 0 && <circle cx={60} cy={60} r={PR} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={10} />}
                  {withPnl.length > 0 && <circle cx={60} cy={60} r={PR} fill="none" stroke={c.rd} strokeWidth={10} strokeDasharray={`${PC - profLen} ${PC}`} transform={`rotate(${-90 + profPct / 100 * 360},60,60)`} />}
                  {withPnl.length > 0 && <circle cx={60} cy={60} r={PR} fill="none" stroke={c.gn} strokeWidth={10} strokeDasharray={`${profLen} ${PC}`} transform="rotate(-90,60,60)" />}
                  <text x={60} y={55} textAnchor="middle" style={{ fontSize: 22, fontWeight: 800, fill: profPct >= 50 ? c.gn : c.rd, fontFamily: F, fontVariantNumeric: "tabular-nums" } as React.CSSProperties}>{profPct}%</text>
                  <text x={60} y={70} textAnchor="middle" style={{ fontSize: 8, fontWeight: 600, fill: c.tm, fontFamily: F, letterSpacing: "0.06em" } as React.CSSProperties}>PROFITABLE</text>
                </svg>
              </div>
              <div style={{ display: "flex", gap: 14, marginTop: 2, justifyContent: "center" }}>
                {[{ n: profSess, col: c.gn, lbl: "profitable" }, { n: withPnl.length - profSess, col: c.rd, lbl: "unprofitable" }].map(({ n, col, lbl }) => (
                  <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 6, height: 6, background: col, transform: "rotate(45deg)" }} />
                    <span style={{ fontSize: 9, fontWeight: 700, color: col, fontVariantNumeric: "tabular-nums" }}>{n}</span>
                    <span style={{ fontSize: 8, color: col }}>{lbl}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tile 4: Days Tested dots */}
            <div style={{ background: c.sf, border: `1px solid ${c.brH}`, position: "relative", padding: "10px 12px", display: "flex", flexDirection: "column" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${c.acL},transparent)` }} />
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.08em", color: c.tm, textTransform: "uppercase" as const }}>Days Tested</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: c.tx, fontVariantNumeric: "tabular-nums" }}>{totalDays.toLocaleString()}</div>
              </div>
              <div style={{ fontSize: 8, color: c.tm }}>{(totalDays / 365).toFixed(1)} yrs equivalent</div>
              <div style={{ flex: 1 }} />
              {(() => {
                const dcols = 20, ds = 5, dg = 2, step = ds + dg;
                const rows = Math.ceil(dotsN / dcols) || 1;
                const svgW = dcols * step - dg, svgH = rows * step - dg;
                return (
                  <svg width={svgW} height={svgH} style={{ display: "block", margin: "0 auto 8px" }}>
                    {Array.from({ length: dotsN }).map((_, i) => (
                      <rect key={i} x={(i % dcols) * step} y={Math.floor(i / dcols) * step} width={ds} height={ds} fill={c.acL} opacity={0.75} />
                    ))}
                  </svg>
                );
              })()}
              <div style={{ fontSize: 8, color: c.tm, marginTop: 4 }}>each square ≈ 1 month</div>
            </div>

            {/* Tile 5: Tickers Tested */}
            <div style={{ background: c.sf, border: `1px solid ${c.brH}`, position: "relative", padding: "10px 12px", display: "flex", flexDirection: "column" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${c.acL},transparent)` }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.08em", color: c.tm, textTransform: "uppercase" as const }}>Tickers Tested</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: c.tx, fontVariantNumeric: "tabular-nums" }}>{Object.keys(tickerFreq).length}</div>
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3, justifyContent: "center" }}>
                {topTickers.map(([ticker, count]) => (
                  <div key={ticker} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 8, fontWeight: 700, color: c.ts, width: 52, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{ticker}</span>
                    <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.07)", position: "relative", overflow: "hidden" }}>
                      <div style={{ position: "absolute", inset: 0, right: `${100 - (count / tkMax) * 100}%`, background: `linear-gradient(90deg,${c.acL}88,${c.acL})` }} />
                    </div>
                    <span style={{ fontSize: 8, color: c.tm, width: 16, textAlign: "right" as const, fontVariantNumeric: "tabular-nums" }}>{count}</span>
                  </div>
                ))}
                {topTickers.length === 0 && <span style={{ fontSize: 9, color: c.tm }}>No symbols yet</span>}
              </div>
              <div style={{ fontSize: 8, color: c.tm, marginTop: 4 }}>top {topTickers.length} by sessions used in</div>
            </div>

          </div>
        </div>

        {/* ── Filter tabs + Layout toggle + Search ── */}
        <div style={{ position: "sticky", top: 0, zIndex: 5, background: c.bg, padding: "0 32px", display: "flex", alignItems: "flex-end", height: 40, gap: 5, borderBottom: `1px solid ${c.brH}` }}>
          {([["all","All"],["not-started","Not Started"],["active","Active"],["completed","Completed"],["standard","Standard"],["prop","Prop Firm"]] as [SessFilter, string][]).map(([v, l]) => {
            const isA = filter === v;
            const isProp = v === "prop";
            const tabCol = isA ? (isProp ? c.gold : c.acL) : c.ts;
            const tabBg  = isA ? (isProp ? "rgba(201,168,76,0.10)" : c.acD) : "transparent";
            return (
              <div key={v} onClick={() => setFilter(v)}
                onMouseEnter={e => { if (!isA) { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.06)"; } }}
                onMouseLeave={e => { if (!isA) { (e.currentTarget as HTMLDivElement).style.background = "transparent"; } }}
                style={{ position: "relative", height: 26, display: "flex", alignItems: "center", gap: 5, padding: "0 12px", cursor: "pointer", color: tabCol, background: tabBg, fontSize: 9, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase" as const, flexShrink: 0, userSelect: "none" }}>
                {l}
                <span style={{ fontSize: 8, fontWeight: 700, background: isA ? (isProp ? "rgba(201,168,76,0.18)" : "rgba(74,106,255,0.2)") : "rgba(255,255,255,0.07)", color: tabCol, padding: "1px 5px" }}>{getCount(v)}</span>
                {isA && <div style={{ position: "absolute", bottom: 0, left: "10%", right: "10%", height: 1.5, background: `linear-gradient(90deg,transparent,${isProp ? c.gold : c.acL},transparent)` }} />}
              </div>
            );
          })}

          {/* Right controls */}
          <div style={{ marginLeft: "auto", alignSelf: "center", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {/* Layout toggle */}
            <div style={{ display: "flex", gap: 4 }}>
              {([
                { mode: "cards" as LayoutMode, icon: <svg width={13} height={13} viewBox="0 0 14 14" fill="none"><rect x="0" y="0" width="6" height="6" rx="0.5" fill="currentColor"/><rect x="8" y="0" width="6" height="6" rx="0.5" fill="currentColor"/><rect x="0" y="8" width="6" height="6" rx="0.5" fill="currentColor"/><rect x="8" y="8" width="6" height="6" rx="0.5" fill="currentColor"/></svg> },
                { mode: "rows" as LayoutMode,  icon: <svg width={13} height={13} viewBox="0 0 14 14" fill="none"><rect x="0" y="0" width="14" height="3" rx="0.5" fill="currentColor"/><rect x="0" y="5" width="14" height="3" rx="0.5" fill="currentColor"/><rect x="0" y="10" width="14" height="3" rx="0.5" fill="currentColor"/></svg> },
              ]).map(({ mode, icon }) => {
                const isA = layoutMode === mode;
                return (
                  <div key={mode} onClick={() => setLayoutMode(mode)}
                    style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", cursor: "pointer", background: isA ? "rgba(74,106,255,0.08)" : "transparent", color: isA ? c.acL : c.ts, transition: "background 0.12s,color 0.12s" }}>
                    {icon}
                    {isA && <div style={{ position: "absolute", bottom: 0, left: "15%", right: "15%", height: 1.5, background: `linear-gradient(90deg,transparent,${c.acL},transparent)` }} />}
                  </div>
                );
              })}
            </div>
            {/* Search */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: c.el, border: `1px solid ${c.brH}`, padding: "0 10px", width: 200, height: 26, boxSizing: "border-box" as const }}>
              <svg width={11} height={11} viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke={c.tm} strokeWidth="2"/><line x1="21" y1="21" x2="16.65" y2="16.65" stroke={c.tm} strokeWidth="2" strokeLinecap="round"/></svg>
              <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
                onKeyDown={e => { if (e.key === "Escape") setSearchQ(""); }}
                placeholder="Search…"
                style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: c.tx, fontSize: 10, fontWeight: 600, fontFamily: F, padding: 0 }} />
              {searchQ && <div onClick={() => setSearchQ("")} style={{ cursor: "pointer", fontSize: 14, color: c.tm, lineHeight: 1 }}>×</div>}
            </div>
          </div>
        </div>

        {/* ── Column headers (rows mode) ── */}
        {filteredSessions.length > 0 && layoutMode === "rows" && (
          <div style={{ background: c.bg, padding: "0 32px", display: "flex", alignItems: "center", height: 26, borderBottom: `1px solid ${c.brH}` }}>
            <div style={{ width: 96, flexShrink: 0 }} />
            {([
              ["Session", 110, "name"],["Strategy", 100, null],["Mode", 74, "mode"],["Asset", 90, null],
              ["Symbols", 120, null],["Date Range", 134, "date"],["Options", 102, null],
              ["Starting Bal.", 88, "capital"],["Net P&L", 80, "pnl"],["Win %", 60, "winRate"],
              ["Avg R:R", 62, null],["Trades", 56, "trades"],["Progress", 66, "progress"],["", 50, null],
            ] as [string, number, string | null][]).map(([label, w, sk]) => {
              const isActive = sk && sortBy === sk;
              return (
                <div key={label || "_act"} onClick={sk ? () => toggleSort(sk) : undefined}
                  style={{ width: w, flexShrink: 0, fontSize: 8, fontWeight: 800, color: isActive ? c.acL : c.tm, textTransform: "uppercase" as const, letterSpacing: "0.08em", whiteSpace: "nowrap" as const, fontFamily: F, textAlign: "center" as const, cursor: sk ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", gap: 3, userSelect: "none" as const }}>
                  {label}
                  {sk && isActive && (
                    sortDir === "asc"
                      ? <svg width={7} height={7} viewBox="0 0 7 7"><polygon points="3.5,0 7,7 0,7" fill="currentColor" /></svg>
                      : <svg width={7} height={7} viewBox="0 0 7 7"><polygon points="3.5,7 7,0 0,0" fill="currentColor" /></svg>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Session list ── */}
        <div style={{ padding: "0 32px 24px" }}>
          {sessions.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "50vh", textAlign: "center" }}>
              <svg width={56} height={56} viewBox="0 0 24 24" fill="none" style={{ marginBottom: 18, color: c.tm, opacity: 0.5 }}><rect x="3" y="3" width="18" height="18" rx="1.5" stroke="currentColor" strokeWidth="1.2" /><line x1="7" y1="8" x2="17" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /><line x1="7" y1="12" x2="13" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
              <div style={{ fontSize: 16, fontWeight: 700, color: c.ts, marginBottom: 8 }}>No sessions yet</div>
              <div style={{ fontSize: 13, color: c.tm, marginBottom: 24 }}>Create your first backtesting session to get started</div>
              <div onClick={goNew} style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 38, padding: "0 22px", background: "linear-gradient(135deg,#1e38e8,#4A6AFF)", cursor: "pointer", fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.96)", letterSpacing: "0.08em", boxShadow: "0 4px 18px rgba(38,67,247,0.4)" }}>
                + Create New Session
              </div>
            </div>
          ) : layoutMode === "cards" ? (
            /* ── Cards layout ── */
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 10, paddingTop: 12 }}>
              {filteredSessions.map(sess => {
                const isProp = sess.session_type === "propfirm";
                const k = kpis[sess.id];
                const progress = getProgress(sess, k);
                const hasPnl = k?.net_pnl != null;
                const pnlPos = hasPnl && (k?.net_pnl ?? 0) >= 0;
                const stripeCol = isProp ? c.gold : c.acL;
                const pnlCol = hasPnl ? (pnlPos ? c.gn : c.rd) : c.tm;
                const isH = sessHov === sess.id;
                const createdStr = sess.created_at ? new Date(sess.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
                const cfg = sess.config as Record<string, string> | undefined;
                return (
                  <div key={sess.id}
                    onMouseEnter={() => setHov(`card_${sess.id}`)} onMouseLeave={() => setHov(null)}
                    style={{ borderTop: `3px solid ${stripeCol}`, border: `1px solid ${isH ? (isProp ? "rgba(201,168,76,0.35)" : c.acB) : c.brH}`, background: c.sf, cursor: "default", boxShadow: isH ? `0 0 0 1px ${isProp ? "rgba(201,168,76,0.2)" : c.acB},0 4px 24px rgba(0,0,0,0.6)` : "0 3px 12px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 0, padding: "10px 10px 8px", borderBottom: `1px solid ${c.brH}` }}>
                      <div onClick={e => { e.stopPropagation(); openSession(sess); }} style={{ width: 26, height: 26, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#1e38e8,#4A6AFF)", cursor: "pointer" }}>
                        <svg width={9} height={9} viewBox="0 0 12 12"><polygon points="2,1 11,6 2,11" fill="rgba(255,255,255,0.95)" /></svg>
                      </div>
                      <div onClick={e => { e.stopPropagation(); openAnalytics(sess); }} style={{ width: 26, height: 26, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.07)", border: `1px solid ${c.br}`, cursor: "pointer", marginLeft: 5 }}>
                        <svg width={11} height={11} viewBox="0 0 20 20" fill="none"><rect x="1" y="1" width="8" height="8" fill={c.ts} /><rect x="11" y="1" width="8" height="8" fill={c.ts} /><rect x="1" y="11" width="8" height="8" fill={c.ts} /><rect x="11" y="11" width="8" height="8" fill={c.ts} /></svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0, padding: "0 8px", display: "flex", flexDirection: "column", gap: 2 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: c.ts, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sess.name || "—"}</div>
                        <div style={{ fontSize: 8, color: c.tm }}>{createdStr}</div>
                      </div>
                    </div>
                    <div style={{ padding: "6px 10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 8px" }}>
                      {[
                        ["Mode", isProp ? "Prop Firm" : "Standard", isProp ? c.gold : c.acL],
                        ["Strategy", cfg?.strategy_name || "—", c.ts],
                        ["Balance", sess.start_balance ? `$${sess.start_balance.toLocaleString()}` : "—", c.ts],
                        ["Net P&L", k ? fmtMoney(k.net_pnl) : "—", pnlCol],
                        ["Win %", k?.win_rate != null ? `${(k.win_rate * 100).toFixed(1)}%` : "—", c.ts],
                        ["Trades", k?.trades != null ? String(k.trades) : "—", c.ts],
                      ].map(([label, val, valCol]) => (
                        <div key={label as string} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                          <span style={{ fontSize: 7, color: c.tm, letterSpacing: "0.04em", textTransform: "uppercase" as const }}>{label}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: valCol as string, fontVariantNumeric: "tabular-nums" }}>{val}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ padding: "4px 10px 8px", display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 2, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(progress, 100)}%`, height: "100%", background: progress >= 100 ? c.gn : c.acL }} />
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 800, color: progress >= 100 ? c.gn : progress > 0 ? c.acL : c.tm, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                        {progress >= 100 ? "Done" : progress > 0 ? `${progress}%` : "0%"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── Rows layout ── */
            <div style={{ display: "flex", flexDirection: "column", paddingTop: 4 }}>
              {filteredSessions.map(sess => {
                const isProp = sess.session_type === "propfirm";
                const k = kpis[sess.id];
                const progress = getProgress(sess, k);
                const hasPnl = k?.net_pnl != null;
                const pnlPos = hasPnl && (k?.net_pnl ?? 0) >= 0;
                const stripeCol = isProp ? c.gold : c.acL;
                const pnlCol = hasPnl ? (pnlPos ? c.gn : c.rd) : c.tm;
                const isH = hov === `row_${sess.id}`;
                const createdStr = sess.created_at ? new Date(sess.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
                const cfg = sess.config as Record<string, string> | undefined;
                const colCell = (val: string, w: number, valCol: string = c.ts) => (
                  <div style={{ width: w, flexShrink: 0, padding: "0 10px", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: valCol, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis", fontVariantNumeric: "tabular-nums", textAlign: "center" as const }}>{val}</div>
                  </div>
                );
                return (
                  <div key={sess.id}
                    onMouseEnter={() => setHov(`row_${sess.id}`)} onMouseLeave={() => setHov(null)}
                    style={{ borderTop: `1px solid ${isH ? (isProp ? "rgba(201,168,76,0.35)" : c.acB) : c.brH}`, borderRight: `1px solid ${isH ? (isProp ? "rgba(201,168,76,0.35)" : c.acB) : c.brH}`, borderBottom: `1px solid ${isH ? (isProp ? "rgba(201,168,76,0.35)" : c.acB) : c.brH}`, borderLeft: `3px solid ${stripeCol}`, background: c.sf, cursor: "default", boxShadow: isH ? `0 0 0 1px ${isProp ? "rgba(201,168,76,0.2)" : c.acB},0 4px 24px rgba(0,0,0,0.6)` : "0 3px 12px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", minHeight: 80, overflow: "hidden", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "stretch", flex: 1 }}>
                      {/* Action buttons */}
                      <div style={{ width: 96, flexShrink: 0, display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: "0 10px" }}>
                        <div onClick={() => openSession(sess)}
                          onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.filter = "brightness(1.2)"}
                          onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.filter = "brightness(1)"}
                          style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#1e38e8,#4A6AFF)", cursor: "pointer", boxShadow: "0 2px 8px rgba(38,67,247,0.35)", flexShrink: 0 }}>
                          <svg width={10} height={10} viewBox="0 0 12 12"><polygon points="2,1 11,6 2,11" fill="rgba(255,255,255,0.95)" /></svg>
                        </div>
                        <div onClick={() => openAnalytics(sess)}
                          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.12)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.07)"; }}
                          style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.07)", border: `1px solid ${c.br}`, cursor: "pointer", flexShrink: 0 }}>
                          <svg width={12} height={12} viewBox="0 0 20 20" fill="none"><rect x="1" y="1" width="8" height="8" fill={c.ts} /><rect x="11" y="1" width="8" height="8" fill={c.ts} /><rect x="1" y="11" width="8" height="8" fill={c.ts} /><rect x="11" y="11" width="8" height="8" fill={c.ts} /></svg>
                        </div>
                      </div>
                      {/* Session name + date */}
                      <div style={{ width: 110, flexShrink: 0, padding: "0 10px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 4 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: c.ts, wordBreak: "break-word" as const, lineHeight: 1.3 }}>{sess.name || "—"}</div>
                        <div style={{ fontSize: 7, color: c.tm }}>{createdStr}</div>
                      </div>
                      {/* Strategy */}
                      {colCell(cfg?.strategy_name || "—", 100)}
                      {/* Mode */}
                      {colCell(isProp ? "Prop Firm" : "Standard", 74, isProp ? c.gold : c.acL)}
                      {/* Asset */}
                      {colCell(cfg?.asset_class || "—", 90)}
                      {/* Symbols */}
                      <div style={{ width: 120, flexShrink: 0, padding: "0 10px", display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap" as const, gap: 2 }}>
                        {sess.symbol ? (
                          <span style={{ fontSize: 8, fontWeight: 700, color: c.ts, background: "rgba(255,255,255,0.07)", padding: "2px 5px", border: `1px solid ${c.br}` }}>{sess.symbol}</span>
                        ) : <span style={{ fontSize: 10, color: c.tm }}>—</span>}
                      </div>
                      {/* Date Range */}
                      <div style={{ width: 134, flexShrink: 0, padding: "0 10px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3 }}>
                        {sess.start_date ? (
                          <>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 9, fontWeight: 700, color: c.tx }}>{fmtShortDate(sess.start_date)}</span>
                              <div style={{ width: 28, height: 1.5, background: `linear-gradient(90deg,${c.acL},${c.acL}44)`, position: "relative" }}>
                                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translateY(-50%)", fontSize: 7, color: c.acL, fontWeight: 700 }} />
                              </div>
                              <span style={{ fontSize: 9, fontWeight: 700, color: c.tx }}>{fmtShortDate(sess.end_date)}</span>
                            </div>
                            {sess.start_date && sess.end_date && (
                              <span style={{ fontSize: 7, color: c.tm, fontVariantNumeric: "tabular-nums" }}>
                                {Math.round((new Date(sess.end_date).getTime() - new Date(sess.start_date).getTime()) / (86400000 * 30))}mo
                              </span>
                            )}
                          </>
                        ) : <span style={{ fontSize: 10, color: c.tm }}>—</span>}
                      </div>
                      {/* Options */}
                      <div style={{ width: 102, flexShrink: 0, padding: "0 8px", display: "flex", flexDirection: "column", gap: 3, justifyContent: "center" }}>
                        {[
                          { label: "Rollback", on: !!(cfg?.rollback_allowed) },
                          { label: "Costs", on: !!(cfg?.commission && cfg.commission !== "None") },
                        ].map(({ label, on }) => (
                          <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <div style={{ width: 4, height: 4, background: on ? c.gn : c.rd, transform: "rotate(45deg)", flexShrink: 0 }} />
                            <span style={{ fontSize: 8, fontWeight: 600, color: on ? c.gn : c.rd }}>{label}</span>
                          </div>
                        ))}
                      </div>
                      {/* Starting Bal. */}
                      {colCell(sess.start_balance ? `$${sess.start_balance.toLocaleString()}` : "—", 88)}
                      {/* Net P&L */}
                      {colCell(k ? fmtMoney(k.net_pnl) : "—", 80, pnlCol)}
                      {/* Win % */}
                      {colCell(k?.win_rate != null ? `${(k.win_rate * 100).toFixed(0)}%` : "—", 60, k?.win_rate != null ? (k.win_rate >= 0.5 ? c.gn : c.rd) : c.tm)}
                      {/* Avg R:R */}
                      {colCell(k?.expectancy_r != null ? `1:${k.expectancy_r.toFixed(1)}` : "—", 62)}
                      {/* Trades */}
                      {colCell(k?.trades != null ? String(k.trades) : "—", 56)}
                      {/* Progress */}
                      <div style={{ width: 66, flexShrink: 0, padding: "0 10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: progress >= 100 ? c.gn : progress > 0 ? c.acL : c.tm, fontVariantNumeric: "tabular-nums" }}>
                          {progress >= 100 ? "Done" : progress > 0 ? `${progress}%` : "0%"}
                        </span>
                      </div>
                      {/* More */}
                      <div style={{ width: 50, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: c.ts }}
                          onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.color = c.tx}
                          onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.color = c.ts}>
                          <svg width={16} height={16} viewBox="0 0 24 24" fill="none"><circle cx="5" cy="12" r="2.2" fill="currentColor" /><circle cx="12" cy="12" r="2.2" fill="currentColor" /><circle cx="19" cy="12" r="2.2" fill="currentColor" /></svg>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {filteredSessions.length === 0 && sessions.length > 0 && (
                <div style={{ textAlign: "center", padding: "48px 0", color: c.tm, fontSize: 12 }}>No sessions match your filter</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── New session iframe overlay ── */}
      {iframeUrl && (
        <div style={{ position: "fixed", inset: 0, zIndex: 99999 }}>
          <iframe title="New Session" src={iframeUrl} style={{ width: "100%", height: "100%", border: "none" }} />
        </div>
      )}
    </div>
  );
}
