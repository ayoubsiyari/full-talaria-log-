"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useBacktestNewSession } from "./BacktestNewSessionContext";
import {
  sessionJournalLocalKey,
  flattenJournalApiTrade,
  buildSessionJournalColumns,
  buildSessionJournalCsvText,
  downloadUtf8Csv,
  generateSessionJournalPlaceholders,
  formatJournalCellForDisplay,
  formatJournalCellRawTitle,
  type JournalApiTradeItem,
} from "./sessionJournalUtils";
import {
  JOURNAL_API_BASE,
  journalAuthHeaders,
  syncJournalTokenFromSession,
} from "@/lib/journalApi";

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
/** Persisted from chart replay (`replay.dashboard` in session state) — actual bars reached vs configured dates. */
interface ReplayDashboard {
  furthest_replay_ts?: number;
  configured_start_ts?: number;
  configured_end_ts?: number;
  progress_pct?: number;
  elapsed_days?: number;
  updated_at?: string;
}

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
  replay_dashboard?: ReplayDashboard | null;
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

/** Cap rows/cards rendering; filter badges still use full counts. */
const SESSION_LIST_DISPLAY_MAX = 30;

/* ── Helpers ── */
async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<T>;
}

/** One DB round-trip instead of N parallel GET …/sessions/:id/analytics (reduces 503 under load). */
async function fetchSessionsKpisBatch(): Promise<Record<number, Kpis>> {
  const res = await fetch("/api/sessions/kpis", { credentials: "include" });
  if (!res.ok) throw new Error(String(res.status));
  const data = (await res.json()) as { kpis_by_session_id?: Record<string, Kpis> };
  const raw = data.kpis_by_session_id || {};
  const map: Record<number, Kpis> = {};
  Object.entries(raw).forEach(([id, k]) => {
    const n = Number(id);
    if (Number.isFinite(n) && k && typeof k === "object") map[n] = k;
  });
  return map;
}

/** Every session gets KPI row so 0-trade sessions still render (batch/legacy may omit keys). */
function ensureKpisForSessions(list: Session[], map: Record<number, Kpis>): Record<number, Kpis> {
  const out: Record<number, Kpis> = { ...map };
  const base: Kpis = {
    trades: 0,
    win_rate: null,
    net_pnl: 0,
    expectancy_r: null,
    start_balance: null,
  };
  for (const s of list) {
    if (!out[s.id]) {
      out[s.id] = { ...base, start_balance: s.start_balance ?? null };
    }
  }
  return out;
}

async function fetchKpisLegacyParallel(list: Session[]): Promise<Record<number, Kpis>> {
  const concurrency = 4;
  const map: Record<number, Kpis> = {};
  let i = 0;
  async function worker() {
    while (i < list.length) {
      const idx = i++;
      const s = list[idx];
      try {
        const r = await fetch(`/api/sessions/${s.id}/analytics`, { credentials: "include" });
        if (!r.ok) continue;
        const j = (await r.json()) as { analytics?: { kpis?: Kpis } };
        const k = j.analytics?.kpis;
        if (k) map[s.id] = k;
      } catch { /* ignore */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) || 1 }, () => worker()));
  return map;
}

function fmtShortDate(d?: string): string {
  const p = parseYmdParts(d);
  if (!p) return "—";
  return `${p.mo} ${p.day}`;
}

function fmtFullDate(d?: string): string {
  const p = parseYmdParts(d);
  if (!p) return "—";
  return `${p.mo} ${p.day}, ${p.y}`;
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

/** Prefer replay-derived progress when the chart saved `replay_dashboard` (works even with 0 trades). */
function getSessionProgressDisplayed(sess: Session, k?: Kpis): number {
  const dash = sess.replay_dashboard;
  if (dash && typeof dash.progress_pct === "number" && Number.isFinite(dash.progress_pct)) {
    return Math.min(100, Math.max(0, Math.round(dash.progress_pct)));
  }
  return getProgress(sess, k);
}

/**
 * Simulated calendar days actually replayed (chart coverage vs configured session window).
 * Sum across sessions for the aggregate tile — no wall-clock or “configured span” guessing.
 */
function replayElapsedDaysFromDashboard(sess: Session): number {
  const dash = sess.replay_dashboard;
  if (!dash || typeof dash !== "object") return 0;

  if (typeof dash.elapsed_days === "number" && Number.isFinite(dash.elapsed_days) && dash.elapsed_days >= 0) {
    return Math.round(dash.elapsed_days);
  }

  const furthest = Number(dash.furthest_replay_ts);
  const cfgStart = Number(dash.configured_start_ts);
  if (Number.isFinite(furthest) && Number.isFinite(cfgStart) && furthest >= cfgStart) {
    return Math.max(0, Math.round((furthest - cfgStart) / 86400000));
  }

  return 0;
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toLocaleString()}`;
}

/** Backend sends win_rate as 0–1; tolerate legacy 0–100. */
function fmtWinRate(w: number | null | undefined): string | null {
  const f = winRateAsFrac(w);
  if (f == null) return null;
  return `${Math.round(f * 100)}%`;
}

function winRateAsFrac(w: number | null | undefined): number | null {
  if (w == null || Number.isNaN(Number(w))) return null;
  return w > 1 ? w / 100 : w;
}

function isAggregateSymbolLabel(s?: string): boolean {
  return !!s && /^\d+\s*symbols?$/i.test(String(s).trim());
}

/** Tickers + per-symbol asset hints from saved session config (real API payload). */
function sessionTickerRows(sess: Session): { sym: string; asset?: string }[] {
  const cfg = sess.config as Record<string, unknown> | undefined;
  const assetFallback =
    cfg && typeof cfg.asset_class === "string" ? cfg.asset_class : undefined;
  const instruments =
    cfg?.instruments && typeof cfg.instruments === "object" && !Array.isArray(cfg.instruments)
      ? (cfg.instruments as Record<string, Record<string, unknown>>)
      : undefined;

  const tickers = cfg?.tickers;
  if (Array.isArray(tickers) && tickers.length > 0) {
    return tickers
      .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
      .map(sym => {
        const row = instruments?.[sym];
        const ac = row?.asset_class ?? row?.assetClass;
        return {
          sym,
          asset: typeof ac === "string" ? ac : assetFallback,
        };
      });
  }

  if (instruments && Object.keys(instruments).length > 0) {
    return Object.keys(instruments).map(sym => {
      const row = instruments[sym];
      const ac = row?.asset_class ?? row?.assetClass;
      return {
        sym,
        asset: typeof ac === "string" ? ac : assetFallback,
      };
    });
  }

  if (sess.symbol && !isAggregateSymbolLabel(sess.symbol)) {
    return [{ sym: sess.symbol, asset: assetFallback }];
  }
  return [];
}

const EMPTY_SESSION_DESC =
  "No session notes. Add notes in the new-session form (Description) or when editing a session.";
const EMPTY_STRATEGY_DESC =
  "No strategy description. Add one in Strategy lab, or pick a linked strategy when creating the session.";

function strategyIdFromConfig(cfg: Record<string, unknown> | undefined): number | null {
  if (!cfg) return null;
  const raw = cfg.strategy_id;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) return parseInt(raw.trim(), 10);
  const pb = cfg.playbook;
  if (typeof pb === "string" && pb.startsWith("strategy:")) {
    const n = parseInt(pb.split(":")[1] || "", 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

function sessionDescription(sess: Session): string | undefined {
  const cfg = sess.config as Record<string, unknown> | undefined;
  if (!cfg) return undefined;
  const d = cfg.description ?? cfg.session_description ?? cfg.sessionDescription;
  if (typeof d !== "string") return undefined;
  const t = d.trim();
  return t || undefined;
}

function sessionDescriptionText(sess: Session): string {
  return sessionDescription(sess) ?? EMPTY_SESSION_DESC;
}

/** Strategy playbook text — not the session notes field (`config.description`). */
function strategyDescription(
  sess: Session,
  strategyDescById?: Record<number, string>,
): string | undefined {
  const cfg = sess.config as Record<string, unknown> | undefined;
  if (!cfg) return undefined;
  const sn = typeof cfg.strategy_name === "string" ? cfg.strategy_name.trim() : "";

  const candidates: unknown[] = [
    cfg.strategy_description,
    cfg.strategyDescription,
  ];
  if (typeof cfg.playbook === "string" && !cfg.playbook.startsWith("strategy:")) {
    candidates.push(cfg.playbook);
  }
  const def = cfg.strategy_definition;
  if (def && typeof def === "object" && !Array.isArray(def)) {
    const rec = def as Record<string, unknown>;
    const v9 = rec.talaria_v9 ?? rec.talaria_v9_panel;
    if (v9 && typeof v9 === "object") {
      candidates.push((v9 as Record<string, unknown>).desc);
    }
    candidates.push(rec.description);
  }

  for (const raw of candidates) {
    if (typeof raw !== "string") continue;
    const t = raw.trim();
    if (!t) continue;
    if (sn && t === sn) continue;
    return t;
  }

  const sid = strategyIdFromConfig(cfg);
  if (sid && strategyDescById?.[sid]) {
    const t = strategyDescById[sid].trim();
    if (t && (!sn || t !== sn)) return t;
  }
  return undefined;
}

function strategyDescriptionText(
  sess: Session,
  strategyDescById?: Record<number, string>,
): string {
  return strategyDescription(sess, strategyDescById) ?? EMPTY_STRATEGY_DESC;
}

function SessionInfoButton({
  active,
  onEnter,
  onLeave,
  label,
}: {
  active: boolean;
  onEnter: (e: React.MouseEvent<HTMLDivElement>) => void;
  onLeave: () => void;
  label: string;
}) {
  return (
    <div
      onClick={e => e.stopPropagation()}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      role="button"
      tabIndex={0}
      aria-label={label}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") e.stopPropagation();
      }}
      style={{
        width: 14,
        height: 14,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "default",
        color: active ? c.acL : c.ts,
        transition: "color 0.12s",
      }}
    >
      <svg width={12} height={12} viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
        <line x1="8" y1="7" x2="8" y2="11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="8" cy="5" r="0.8" fill="currentColor" />
      </svg>
    </div>
  );
}

function parseYmdParts(d?: string): { y: string; mo: string; day: number } | null {
  if (!d || typeof d !== "string") return null;
  const s = d.trim();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
    const y = m[1];
    const mi = Number(m[2]) - 1;
    const day = Number(m[3]);
    if (mi >= 0 && mi <= 11 && Number.isFinite(day) && day >= 1 && day <= 31) return { y, mo: months[mi], day };
  }
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return null;
  return { y: String(dt.getFullYear()), mo: months[dt.getMonth()], day: dt.getDate() };
}

function durationLabelMonths(start?: string, end?: string): string | null {
  if (!start || !end) return null;
  const t0 = new Date(start).getTime();
  const t1 = new Date(end).getTime();
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return null;
  const durMo = Math.round((t1 - t0) / 1000 / 60 / 60 / 24 / 30.44);
  if (!Number.isFinite(durMo) || durMo < 0) return null;
  if (durMo >= 12) return `${Math.round(durMo / 12)}y`;
  return `${durMo}mo`;
}

/* ── Main component ── */
export function BacktestView() {
  const { registerOnSaved } = useBacktestNewSession();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [kpis, setKpis] = useState<Record<number, Kpis>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<SessFilter>("all");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("rows");
  const [searchQ, setSearchQ] = useState("");
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [hov, setHov] = useState<string | null>(null);
  const [cardSortOpen, setCardSortOpen] = useState(false);
  const cardSortRef = useRef<HTMLDivElement>(null);
  type TradeTip = { sess: Session; bx: number; by: number; col: string };
  const [tradeTip, setTradeTip] = useState<TradeTip | null>(null);
  type ActMenu = { id: number; x: number; y: number };
  const [actMenu, setActMenu] = useState<ActMenu | null>(null);
  const [journalSession, setJournalSession] = useState<Session | null>(null);
  const [journalRows, setJournalRows] = useState<Record<string, unknown>[]>([]);
  const [journalLoading, setJournalLoading] = useState(false);
  type DescPop = { key: string; x: number; y: number; title: string; kind: string; desc: string };
  const [descPop, setDescPop] = useState<DescPop | null>(null);
  const [strategyDescById, setStrategyDescById] = useState<Record<number, string>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await syncJournalTokenFromSession();
      try {
        const res = await fetch(`${JOURNAL_API_BASE}/strategies`, {
          credentials: "include",
          headers: journalAuthHeaders(),
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          strategies?: { id?: number; description?: string }[];
        };
        const map: Record<number, string> = {};
        for (const s of data.strategies || []) {
          if (typeof s.id !== "number" || !s.description) continue;
          const t = String(s.description).trim();
          if (t) map[s.id] = t;
        }
        if (!cancelled) setStrategyDescById(map);
      } catch {
        /* journal optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const showDescPop = (
    e: React.MouseEvent<HTMLDivElement>,
    key: string,
    kind: string,
    title: string,
    desc: string,
  ) => {
    const r = e.currentTarget.getBoundingClientRect();
    setDescPop({ key, x: r.right + 6, y: r.top, title, kind, desc });
  };
  const contentFrameStyle: React.CSSProperties = { width: "fit-content", minWidth: 1350, margin: "0 auto" };

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson<{ sessions: Session[] }>("/api/sessions");
      const list = data.sessions ?? [];
      setSessions(list);
      let map: Record<number, Kpis> = {};
      try {
        map = await fetchSessionsKpisBatch();
      } catch {
        map = await fetchKpisLegacyParallel(list);
      }
      setKpis(ensureKpisForSessions(list, map));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  useEffect(() => {
    if (!cardSortOpen) return;
    const close = (e: MouseEvent) => {
      if (cardSortRef.current?.contains(e.target as Node)) return;
      setCardSortOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [cardSortOpen]);

  useEffect(() => {
    return registerOnSaved(() => {
      void loadSessions();
    });
  }, [registerOnSaved, loadSessions]);

  useEffect(() => {
    if (!journalSession) {
      setJournalRows([]);
      setJournalLoading(false);
      return undefined;
    }
    let cancelled = false;
    const sess = journalSession;
    setJournalRows([]);
    setJournalLoading(true);

    (async () => {
      try {
        const r = await fetch(`/api/sessions/${encodeURIComponent(String(sess.id))}/journal-trades`, {
          credentials: "include",
        });
        if (r.ok) {
          const data = (await r.json()) as { trades?: JournalApiTradeItem[] };
          const items = Array.isArray(data?.trades) ? data.trades : [];
          if (cancelled) return;
          if (items.length > 0) {
            setJournalRows(items.map(flattenJournalApiTrade));
            setJournalLoading(false);
            return;
          }
        }
      } catch { /* fall through */ }

      if (cancelled) return;
      let local: unknown[] = [];
      try {
        const raw = localStorage.getItem(sessionJournalLocalKey(sess.id));
        local = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(local)) local = [];
      } catch {
        local = [];
      }
      const normalized = local.map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {}));
      if (normalized.length > 0) {
        setJournalRows(normalized);
        setJournalLoading(false);
        return;
      }

      const tradeCount = kpis[sess.id]?.trades || 0;
      const tickerSyms = sessionTickerRows(sess).map((t) => t.sym);
      const pseudo = {
        id: sess.id,
        trades: tradeCount,
        tickers: tickerSyms.length ? tickerSyms : undefined,
        symbol: sess.symbol,
      };
      setJournalRows(tradeCount > 0 ? generateSessionJournalPlaceholders(pseudo) : []);
      setJournalLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [journalSession, kpis]);

  /* ── Derived stats ── */
  const propSess = sessions.filter(s => s.session_type === "propfirm");
  const stdSess  = sessions.filter(s => s.session_type !== "propfirm");

  const propCompleted = propSess.filter(s => getSessionProgressDisplayed(s, kpis[s.id]) === 100).length;
  const propActive    = propSess.filter(s => { const p = getSessionProgressDisplayed(s, kpis[s.id]); return p > 0 && p < 100; }).length;
  const stdCompleted  = stdSess.filter(s => getSessionProgressDisplayed(s, kpis[s.id]) === 100).length;
  const stdActive     = stdSess.filter(s => { const p = getSessionProgressDisplayed(s, kpis[s.id]); return p > 0 && p < 100; }).length;

  const totalTrades = sessions.reduce((a, s) => a + (kpis[s.id]?.trades || 0), 0);

  const withPnl = sessions.filter(s => kpis[s.id]?.net_pnl != null);
  const profSess = withPnl.filter(s => (kpis[s.id]?.net_pnl ?? 0) > 0).length;
  const profPct  = withPnl.length ? Math.round((profSess / withPnl.length) * 100) : 0;

  const totalDays = sessions.reduce((a, s) => a + replayElapsedDaysFromDashboard(s), 0);

  const tickerFreq: Record<string, number> = {};
  sessions.forEach(s => {
    const rows = sessionTickerRows(s);
    if (rows.length > 0) {
      const uniq = [...new Set(rows.map(r => r.sym))];
      uniq.forEach(t => { tickerFreq[t] = (tickerFreq[t] || 0) + 1; });
    } else if (s.symbol && !isAggregateSymbolLabel(s.symbol)) {
      tickerFreq[s.symbol] = (tickerFreq[s.symbol] || 0) + 1;
    }
  });
  const topTickers = Object.entries(tickerFreq).sort((a, b) => b[1] - a[1]).slice(0, 7);
  const tkMax = topTickers[0]?.[1] || 1;

  /* ── Filter + sort ── */
  const getCount = (v: string) =>
    v === "all" ? sessions.length :
    sessions.filter(s => {
      const p = getSessionProgressDisplayed(s, kpis[s.id]);
      if (v === "not-started") return p === 0;
      if (v === "active")      return p > 0 && p < 100;
      if (v === "completed")   return p === 100;
      if (v === "standard")    return s.session_type !== "propfirm";
      if (v === "prop")        return s.session_type === "propfirm";
      return true;
    }).length;

  const filteredSessionsAll = [...sessions]
    .filter(s => {
      if (searchQ) {
        const q = searchQ.toLowerCase();
        const cfg = s.config as Record<string, string> | undefined;
        const tickStr = sessionTickerRows(s).map(t => t.sym).join(" ").toLowerCase();
        if (
          !s.name.toLowerCase().includes(q)
          && !(s.symbol || "").toLowerCase().includes(q)
          && !(cfg?.strategy_name || "").toLowerCase().includes(q)
          && !tickStr.includes(q)
        ) return false;
      }
      const p = getSessionProgressDisplayed(s, kpis[s.id]);
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
      const cfgA = a.config as Record<string, string> | undefined;
      const cfgB = b.config as Record<string, string> | undefined;
      const symA = sessionTickerRows(a)[0]?.sym || "";
      const symB = sessionTickerRows(b)[0]?.sym || "";
      if (sortBy === "name")     cmp = a.name.localeCompare(b.name);
      if (sortBy === "strategy") cmp = (cfgA?.strategy_name || "").localeCompare(cfgB?.strategy_name || "");
      if (sortBy === "mode")     cmp = a.session_type.localeCompare(b.session_type);
      if (sortBy === "asset")    cmp = (cfgA?.asset_class || "").localeCompare(cfgB?.asset_class || "");
      if (sortBy === "symbol")   cmp = symA.localeCompare(symB);
      if (sortBy === "capital")  cmp = (a.start_balance || 0) - (b.start_balance || 0);
      if (sortBy === "date")     cmp = new Date(a.start_date || 0).getTime() - new Date(b.start_date || 0).getTime();
      if (sortBy === "pnl")      cmp = (kpis[a.id]?.net_pnl ?? -Infinity) - (kpis[b.id]?.net_pnl ?? -Infinity);
      if (sortBy === "winRate")  cmp = (kpis[a.id]?.win_rate ?? -1) - (kpis[b.id]?.win_rate ?? -1);
      if (sortBy === "avgRR")   cmp = (kpis[a.id]?.expectancy_r ?? -1) - (kpis[b.id]?.expectancy_r ?? -1);
      if (sortBy === "trades")   cmp = (kpis[a.id]?.trades || 0) - (kpis[b.id]?.trades || 0);
      if (sortBy === "progress") cmp = getSessionProgressDisplayed(a, kpis[a.id]) - getSessionProgressDisplayed(b, kpis[b.id]);
      return cmp * dir;
    });

  const filteredSessions = filteredSessionsAll.slice(0, SESSION_LIST_DISPLAY_MAX);
  const sessionListTruncated = filteredSessionsAll.length > SESSION_LIST_DISPLAY_MAX;

  /* ── Actions ── */
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
    window.location.href = `/dashboard/?sessionId=${encodeURIComponent(String(s.id))}`;
  };

  const deleteSession = async (s: Session) => {
    if (!globalThis.confirm(`Delete session “${s.name || s.id}”? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(String(s.id))}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(String(res.status));
      setActMenu(null);
      setJournalSession(js => (js && js.id === s.id ? null : js));
      await loadSessions();
    } catch { /* ignore */ }
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

  /* ── Trades bar chart: one bar per session (sorted by trades desc); cap matches session table — header is sum of trades across all sessions */
  const trBars = [...sessions]
    .sort((a, b) => (kpis[b.id]?.trades || 0) - (kpis[a.id]?.trades || 0))
    .slice(0, SESSION_LIST_DISPLAY_MAX);
  const trMax = Math.max(1, ...trBars.map(s => kpis[s.id]?.trades || 0));

  /* ── Dot grid (Days Tested tile) ── */
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
    <>
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: c.bg, fontFamily: F, overflow: "hidden" }}>

      {/* ── Scrollable body ── */}
      <div className="tlr-scroll" style={{ flex: 1, overflowY: "auto" }}>

        {/* ── 5 Stats Tiles ── */}
        <div style={contentFrameStyle}>
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
              {tradeTip && (
                <div style={{
                  position: "fixed",
                  left: tradeTip.bx,
                  top: tradeTip.by + 6,
                  transform: "translateX(-50%)",
                  zIndex: 99999,
                  pointerEvents: "none",
                  background: c.el,
                  border: `1px solid ${c.brH}`,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
                  overflow: "hidden",
                  minWidth: 200,
                }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2, background: tradeTip.col }} />
                  <div style={{ padding: "8px 12px 8px 16px" }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: c.tx, marginBottom: 6, maxWidth: 188, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tradeTip.sess.name}</div>
                    <div style={{ height: 1, background: c.brH, marginBottom: 6 }} />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 16px" }}>
                      {[
                        ["Trades", String(kpis[tradeTip.sess.id]?.trades ?? 0)],
                        ["Mode", tradeTip.sess.session_type === "propfirm" ? "Prop Firm" : "Standard"],
                        ["Strategy", (tradeTip.sess.config as Record<string, string> | undefined)?.strategy_name || "—"],
                        ["Progress", `${getSessionProgressDisplayed(tradeTip.sess, kpis[tradeTip.sess.id])}%`],
                        ["Starting Balance", tradeTip.sess.start_balance != null ? `$${tradeTip.sess.start_balance.toLocaleString()}` : "—"],
                        ["Net P&L", kpis[tradeTip.sess.id]?.net_pnl != null ? fmtMoney(kpis[tradeTip.sess.id]!.net_pnl) : "—"],
                        ["Win Rate", fmtWinRate(kpis[tradeTip.sess.id]?.win_rate) ?? "—"],
                        ["Avg R:R", kpis[tradeTip.sess.id]?.expectancy_r != null ? `1:${kpis[tradeTip.sess.id]!.expectancy_r!.toFixed(1)}` : "—"],
                      ].map(([label, val]) => (
                        <div key={label} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                          <span style={{ fontSize: 7, color: c.tm, letterSpacing: "0.04em" }}>{label}</span>
                          <span style={{ fontSize: 9, fontWeight: 700, color: c.tx, fontVariantNumeric: "tabular-nums" }}>{val}</span>
                        </div>
                      ))}
                    </div>
                    {(tradeTip.sess.start_date || tradeTip.sess.end_date) && (
                      <div style={{ marginTop: 6, paddingTop: 5, borderTop: `1px solid ${c.brH}`, fontSize: 7.5, color: c.tm }}>
                        {tradeTip.sess.start_date} → {tradeTip.sess.end_date}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {(() => {
                const vbW = 420;
                const chartH = 72;
                const barsN = Math.max(1, trBars.length);
                const gap = barsN <= 6 ? 6 : barsN <= 12 ? 4 : 2;
                const barW = Math.max(4, Math.floor((vbW - gap * (barsN - 1)) / barsN));
                const usedW = barsN * barW + gap * (barsN - 1);
                const ox = Math.floor((vbW - usedW) / 2);
                const baselineY = chartH - 4;
                const plotH = chartH - 6;
                return (
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", width: "100%", minHeight: 76 }}>
                    <svg
                      width="100%"
                      height={chartH}
                      viewBox={`0 0 ${vbW} ${chartH}`}
                      preserveAspectRatio="xMidYMax meet"
                      style={{ display: "block", flexShrink: 0 }}
                    >
                      <line x1={12} y1={baselineY} x2={vbW - 12} y2={baselineY} stroke="rgba(140,160,255,0.12)" strokeWidth={1} />
                      {trBars.map((s, i) => {
                        const t = kpis[s.id]?.trades || 0;
                        const h = t ? Math.max(4, Math.round((t / trMax) * plotH)) : 3;
                        const col = s.session_type === "propfirm" ? c.gold : c.acL;
                        const isH = tradeTip?.sess.id === s.id;
                        const x = ox + i * (barW + gap);
                        const y = baselineY - h;
                        return (
                          <rect
                            key={s.id}
                            x={x}
                            y={y}
                            width={barW}
                            height={h}
                            fill={col}
                            opacity={isH ? 1 : 0.88}
                            style={{ cursor: "default", filter: isH ? "brightness(1.55)" : "none" }}
                            onMouseEnter={e => {
                              const r = e.currentTarget.getBoundingClientRect();
                              setTradeTip({ sess: s, bx: r.left + r.width / 2, by: r.bottom, col });
                            }}
                            onMouseLeave={() => setTradeTip(null)}
                          />
                        );
                      })}
                    </svg>
                  </div>
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
                  {withPnl.length > 0 && <circle cx={60} cy={60} r={PR} fill="none" stroke={c.rd} strokeWidth={10} strokeDasharray={`${PC - profLen} ${PC}`} strokeLinecap="butt" transform={`rotate(${-90 + profPct / 100 * 360},60,60)`} />}
                  {withPnl.length > 0 && <circle cx={60} cy={60} r={PR} fill="none" stroke={c.gn} strokeWidth={10} strokeDasharray={`${profLen} ${PC}`} strokeLinecap="butt" transform="rotate(-90,60,60)" />}
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

            {/* Tile 4: Total Days Tested dot grid */}
            <div style={{ background: c.sf, border: `1px solid ${c.brH}`, overflow: "hidden", position: "relative", padding: "10px 12px", display: "flex", flexDirection: "column" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${c.acL},transparent)`, pointerEvents: "none" }} />
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.08em", color: c.tm, fontFamily: F, textTransform: "uppercase" as const }}>Days Tested</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: c.tx, fontFamily: F, fontVariantNumeric: "tabular-nums" }}>{totalDays.toLocaleString()}</div>
              </div>
              <div style={{ fontSize: 8, color: c.tm, fontFamily: F }}>{(totalDays / 365).toFixed(1)} yrs equivalent</div>
              <div style={{ flex: 1 }} />
              {(() => {
                const dcols = 20, ds = 5, dg = 2, step = ds + dg;
                const rows = Math.ceil(dotsN / dcols) || 1;
                const svgW = dcols * step - dg;
                const svgH = rows * step - dg;
                return (
                  <svg width={svgW} height={svgH} style={{ display: "block", margin: "0 auto 64px" }}>
                    {Array.from({ length: dotsN }).map((_, i) => (
                      <rect key={i} x={(i % dcols) * step} y={Math.floor(i / dcols) * step} width={ds} height={ds} fill={c.acL} opacity={0.75} />
                    ))}
                  </svg>
                );
              })()}
              <div style={{ fontSize: 8, color: c.tm, fontFamily: F, marginTop: 4 }}>each square ≈ 1 month of replay elapsed (summed sessions)</div>
            </div>

            {/* Tile 5: Tickers Tested */}
            <div style={{ background: c.sf, border: `1px solid ${c.brH}`, overflow: "hidden", position: "relative", padding: "10px 12px", display: "flex", flexDirection: "column" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${c.acL},transparent)`, pointerEvents: "none" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.08em", color: c.tm, fontFamily: F, textTransform: "uppercase" as const }}>Tickers Tested</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: c.tx, fontFamily: F, fontVariantNumeric: "tabular-nums" }}>{Object.keys(tickerFreq).length}</div>
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3, justifyContent: "center" }}>
                {topTickers.map(([ticker, count]) => (
                  <div key={ticker} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 8, fontWeight: 700, color: c.ts, fontFamily: F, width: 52, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{ticker}</span>
                    <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.07)", position: "relative", overflow: "hidden" }}>
                      <div style={{ position: "absolute", inset: 0, right: `${100 - (count / tkMax) * 100}%`, background: `linear-gradient(90deg,${c.acL}88,${c.acL})`, transition: "right 0.3s ease" }} />
                    </div>
                    <span style={{ fontSize: 8, color: c.tm, fontFamily: F, width: 16, textAlign: "right" as const, fontVariantNumeric: "tabular-nums" }}>{count}</span>
                  </div>
                ))}
                {topTickers.length === 0 && <span style={{ fontSize: 9, color: c.tm, fontFamily: F }}>No symbols yet</span>}
              </div>
              <div style={{ fontSize: 8, color: c.tm, fontFamily: F, marginTop: 4 }}>top {topTickers.length} by sessions used in</div>
            </div>

            </div>
          </div>
        </div>

        {/* ── Filter tabs + Layout toggle + Search ── */}
        <div style={{ position: "sticky", top: 0, zIndex: 5, background: c.bg }}>
          <div style={{ ...contentFrameStyle, display: "flex", alignItems: "flex-end", height: 40, gap: 5, padding: "0 32px", borderBottom: `1px solid ${c.brH}`, direction: "ltr" }}>
          {([["all","All"],["not-started","Not Started"],["active","Active"],["completed","Completed"],["standard","Standard"],["prop","Prop Firm"]] as [SessFilter, string][]).map(([v, l]) => {
            const isA = filter === v;
            const isProp = v === "prop";
            const tabCol = isA ? (isProp ? c.gold : c.acL) : c.ts;
            const tabBg  = isA ? (isProp ? "rgba(201,168,76,0.10)" : c.acD) : "transparent";
            return (
              <div key={v} onClick={() => { setFilter(v); setCardSortOpen(false); }}
                onMouseEnter={e => { if (!isA) { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLDivElement).style.color = c.tx; } }}
                onMouseLeave={e => { if (!isA) { (e.currentTarget as HTMLDivElement).style.background = "transparent"; (e.currentTarget as HTMLDivElement).style.color = tabCol; } }}
                style={{
                  height: 26,
                  display: "flex",
                  alignItems: "flex-end",
                  padding: "0 12px",
                  cursor:"default",
                  color: tabCol,
                  background: tabBg,
                  flexShrink: 0,
                  userSelect: "none",
                }}>
                {/* `inline-flex` + border-block-end: underline width === label + badge only (no absolute positioning / glow bleed). */}
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: "0.07em",
                    textTransform: "uppercase" as const,
                    paddingBottom: 4,
                    borderBottom: isA ? `3px solid ${isProp ? c.gold : c.acL}` : "3px solid transparent",
                    boxSizing: "border-box" as const,
                  }}>
                  {l}
                  <span style={{ fontSize: 8, fontWeight: 700, background: isA ? (isProp ? "rgba(201,168,76,0.18)" : "rgba(74,106,255,0.2)") : "rgba(255,255,255,0.07)", color: isA ? (isProp ? "rgba(255,255,255,0.9)" : c.ts) : tabCol, padding: "2px 6px", minWidth: 18, textAlign: "center" as const, fontVariantNumeric: "tabular-nums" }}>{getCount(v)}</span>
                </div>
              </div>
            );
          })}

          {/* Right controls */}
          <div style={{ marginLeft: "auto", alignSelf: "center", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {layoutMode === "cards" && (
              <div ref={cardSortRef} style={{ position: "relative" }} onMouseDown={e => e.stopPropagation()}>
                {(() => {
                  const sortOpts = [["name", "Name"], ["strategy", "Strategy"], ["date", "Date Range"], ["capital", "Balance"], ["pnl", "Net P&L"], ["winRate", "Win Rate"], ["avgRR", "Avg R:R"], ["trades", "Trades"], ["progress", "Progress"]] as [string, string][];
                  const activeLabel = sortBy ? (sortOpts.find(([k]) => k === sortBy)?.[1] ?? "Recent") : "Recent";
                  const isBH = hov === "cardSortBtn";
                  return (
                    <>
                      <div onClick={() => setCardSortOpen(v => !v)}
                        onMouseEnter={() => setHov("cardSortBtn")}
                        onMouseLeave={() => setHov(null)}
                        style={{
                          height: 28, padding: "0 8px", display: "flex", alignItems: "center", gap: 5, position: "relative", cursor:"default",
                          background: cardSortOpen ? "rgba(74,106,255,0.08)" : isBH ? "rgba(255,255,255,0.05)" : "transparent",
                          color: cardSortOpen ? c.acL : isBH ? c.tx : c.ts,
                          fontSize: 9, fontWeight: 700, transition: "background 0.12s,color 0.12s", whiteSpace: "nowrap",
                        }}>
                        <svg width={9} height={9} viewBox="0 0 12 12" fill="none"><line x1="1" y1="3" x2="11" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><line x1="3" y1="6" x2="9" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><line x1="5" y1="9" x2="7" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                        {activeLabel}
                        <svg width={6} height={6} viewBox="0 0 8 8" style={{ opacity: 0.55, flexShrink: 0 }}><polygon points={cardSortOpen ? "4,1 7,6 1,6" : "4,7 7,2 1,2"} fill="currentColor" /></svg>
                        {cardSortOpen && <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "70%", height: 2, background: `linear-gradient(90deg,transparent,${c.acL},transparent)`, boxShadow: `0 0 6px ${c.acL}`, pointerEvents: "none" }} />}
                      </div>
                      {cardSortOpen && (
                        <div style={{ position: "absolute", top: "calc(100% + 5px)", left: 0, background: c.sf, border: "1px solid rgba(140,160,255,0.22)", boxShadow: "0 4px 16px rgba(0,0,0,0.5)", zIndex: 300, minWidth: 148, overflow: "hidden" }}>
                          <div style={{ height: 2, background: `linear-gradient(90deg,${c.ac},${c.acL},${c.ac})` }} />
                          {sortOpts.map(([key, label]) => {
                            const isAct = sortBy === key;
                            const isIH = hov === `csort_${key}`;
                            return (
                              <div key={key}
                                onMouseEnter={() => setHov(`csort_${key}`)}
                                onMouseLeave={() => setHov(null)}
                                onClick={() => {
                                  if (sortBy === key) setSortDir(d => d === "asc" ? "desc" : "asc");
                                  else { setSortBy(key); setSortDir("asc"); }
                                  setCardSortOpen(false);
                                }}
                                style={{
                                  display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 12px", cursor:"default", position: "relative",
                                  background: isAct ? c.acD : isIH ? "rgba(255,255,255,0.03)" : "transparent",
                                  transition: "background 0.1s",
                                }}>
                                {isAct && <div style={{ position: "absolute", left: 0, top: "15%", bottom: "15%", width: 2, background: `linear-gradient(180deg,transparent,${c.acL},transparent)`, boxShadow: `0 0 6px ${c.acL}` }} />}
                                <span style={{ fontSize: 9, fontWeight: isAct ? 700 : 500, color: isAct ? c.acL : isIH ? c.tx : c.ts }}>{label}</span>
                                {isAct && (sortDir === "asc"
                                  ? <svg width={7} height={7} viewBox="0 0 7 7"><polygon points="3.5,0 7,7 0,7" fill={c.acL} /></svg>
                                  : <svg width={7} height={7} viewBox="0 0 7 7"><polygon points="3.5,7 7,0 0,0" fill={c.acL} /></svg>)}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
            {/* Layout toggle */}
            <div style={{ display: "flex", gap: 4 }}>
              {([
                { mode: "cards" as LayoutMode, icon: <svg width={13} height={13} viewBox="0 0 14 14" fill="none"><rect x="0" y="0" width="6" height="6" rx="0.5" fill="currentColor"/><rect x="8" y="0" width="6" height="6" rx="0.5" fill="currentColor"/><rect x="0" y="8" width="6" height="6" rx="0.5" fill="currentColor"/><rect x="8" y="8" width="6" height="6" rx="0.5" fill="currentColor"/></svg> },
                { mode: "rows" as LayoutMode,  icon: <svg width={13} height={13} viewBox="0 0 14 14" fill="none"><rect x="0" y="0" width="14" height="3" rx="0.5" fill="currentColor"/><rect x="0" y="5" width="14" height="3" rx="0.5" fill="currentColor"/><rect x="0" y="10" width="14" height="3" rx="0.5" fill="currentColor"/></svg> },
              ]).map(({ mode, icon }) => {
                const isA = layoutMode === mode;
                const isLm = hov === `lm_${mode}`;
                return (
                  <div key={mode} onClick={() => { setLayoutMode(mode); setCardSortOpen(false); }}
                    onMouseEnter={() => setHov(`lm_${mode}`)}
                    onMouseLeave={() => setHov(null)}
                    style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", cursor:"default", background: isA ? "rgba(74,106,255,0.08)" : isLm ? "rgba(255,255,255,0.05)" : "transparent", color: isA ? c.acL : isLm ? c.tx : c.ts, transition: "background 0.12s,color 0.12s" }}>
                    {icon}
                    {isA && <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "70%", height: 2, background: `linear-gradient(90deg,transparent,${c.acL},transparent)`, boxShadow: `0 0 6px ${c.acL}`, pointerEvents: "none" }} />}
                    {!isA && isLm && <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "50%", height: 1, background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.15),transparent)", pointerEvents: "none" }} />}
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
              {searchQ && <div onClick={() => setSearchQ("")} style={{ cursor:"default", fontSize: 14, color: c.tm, lineHeight: 1 }}>×</div>}
            </div>
          </div>
          </div>
        </div>

        {/* ── Column headers (rows mode, sticky below filter) ── */}
        {filteredSessionsAll.length > 0 && layoutMode === "rows" && (
          <div style={{ position: "sticky", top: 40, zIndex: 4, background: c.bg }}>
            <div style={{ ...contentFrameStyle, display: "flex", alignItems: "center", height: 26, padding: "0 32px", position: "relative" }}>
            <div style={{ position: "absolute", bottom: 0, left: 32, right: 32, height: 1, background: c.brH, pointerEvents: "none" }} />
            <div style={{ width: 96, flexShrink: 0 }} />
            {([
              ["Session", 172, "name"], ["Strategy", 100, "strategy"], ["Mode", 74, "mode"], ["Asset", 90, "asset"],
              ["Symbols", 120, "symbol"], ["Date Range", 134, "date"], ["Options", 102, null],
              ["Starting Bal.", 88, "capital"], ["Net P&L", 80, "pnl"], ["Win %", 60, "winRate"],
              ["Avg R:R", 62, "avgRR"], ["Trades", 56, "trades"], ["Progress", 66, "progress"], ["", 50, null],
            ] as [string, number, string | null][]).map(([label, w, sk]) => {
              const isActive = !!(sk && sortBy === sk);
              const isHov = sk && hov === `ch_${label}`;
              return (
                <div key={label || "_act"}
                  onClick={sk ? () => toggleSort(sk) : undefined}
                  onMouseEnter={() => { if (sk) setHov(`ch_${label}`); }}
                  onMouseLeave={() => { if (sk) setHov(null); }}
                  style={{
                    width: w, flexShrink: 0, fontSize: 8, fontWeight: 800,
                    color: isActive ? c.acL : isHov ? c.ts : c.tm,
                    textTransform: "uppercase" as const, letterSpacing: "0.08em", whiteSpace: "nowrap" as const, fontFamily: F,
                    textAlign: "center" as const, cursor: sk ? "pointer" : "default",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 3, userSelect: "none" as const,
                    transition: "color 0.12s", background: isHov && !isActive ? "rgba(255,255,255,0.04)" : "transparent",
                  }}>
                  {label}
                  {sk && (isActive ? (
                    sortDir === "asc"
                      ? <svg width={7} height={7} viewBox="0 0 7 7"><polygon points="3.5,0 7,7 0,7" fill="currentColor" /></svg>
                      : <svg width={7} height={7} viewBox="0 0 7 7"><polygon points="3.5,7 7,0 0,0" fill="currentColor" /></svg>
                  ) : (
                    isHov && <svg width={7} height={10} viewBox="0 0 7 10"><polygon points="3.5,0 7,4 0,4" fill="currentColor" opacity={0.7} /><polygon points="3.5,10 7,6 0,6" fill="currentColor" opacity={0.7} /></svg>
                  ))}
                </div>
              );
            })}
            </div>
          </div>
        )}

        {/* ── Session list ── */}
        <div style={contentFrameStyle}>
          <div style={{ padding: "0 32px 24px" }}>
          {sessions.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "50vh", textAlign: "center" }}>
              <svg width={56} height={56} viewBox="0 0 24 24" fill="none" style={{ marginBottom: 18, color: c.tm, opacity: 0.5 }}><rect x="3" y="3" width="18" height="18" rx="1.5" stroke="currentColor" strokeWidth="1.2" /><line x1="7" y1="8" x2="17" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /><line x1="7" y1="12" x2="13" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
              <div style={{ fontSize: 16, fontWeight: 700, color: c.ts, marginBottom: 8 }}>No saved sessions yet</div>
              <div style={{ fontSize: 13, color: c.tm, marginBottom: 24 }}>Create your first backtesting session to get started</div>
            </div>
          ) : layoutMode === "cards" ? (
            /* ── Cards layout ── */
            <div style={{ width: "min(1288px, 100%)", margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, padding: "4px 0 24px" }}>
              {filteredSessions.map(sess => {
                const isProp = sess.session_type === "propfirm";
                const k = kpis[sess.id];
                const progress = getSessionProgressDisplayed(sess, k);
                const hasPnl = k?.net_pnl != null;
                const pnlPos = hasPnl && (k?.net_pnl ?? 0) >= 0;
                const stripeCol = isProp ? c.gold : c.acL;
                const pnlCol = hasPnl ? (pnlPos ? c.gn : c.rd) : c.tm;
                const pnlVal = k ? fmtMoney(k.net_pnl) : "—";
                const isH = hov === `card_${sess.id}` || hov === `crs_${sess.id}` || hov === `cdb_${sess.id}`;
                const createdStr = sess.created_at ? new Date(sess.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
                const cfg = sess.config as Record<string, unknown> | undefined;
                const cfgS = sess.config as Record<string, string> | undefined;
                const stratDesc = strategyDescriptionText(sess, strategyDescById);
                const sessDesc = sessionDescriptionText(sess);
                const tickerRows = sessionTickerRows(sess);
                const costsOn = !!(cfgS?.commission && cfgS.commission !== "None")
                  || (cfg?.trading_costs != null && cfg.trading_costs !== "");
                const rb = cfg?.rollback_allowed ?? cfg?.allowBackNavigation;
                const rollbackOn = rb === true || rb === "true" || rb === 1;
                const wf = winRateAsFrac(k?.win_rate);
                const winPctStr = fmtWinRate(k?.win_rate) ?? "—";
                const stratName = cfgS?.strategy_name || "—";
                const nm = sess.name || "";
                const sn = stratName || "";
                const stratPopKey = `s${sess.id}-strategy`;
                const sessPopKey = `s${sess.id}-session`;
                const brSide = isH ? (isProp ? "rgba(201,168,76,0.35)" : c.acB) : c.brH;
                const progBarFill = progress >= 100 ? (isProp ? (hasPnl ? (pnlPos ? c.gn : c.rd) : c.acL) : c.gn) : c.acL;
                const progLblCol = progress >= 100 ? (isProp ? (hasPnl ? (pnlPos ? c.gn : c.rd) : c.tm) : c.gn) : progress > 0 ? c.acL : c.tm;
                const progLabel = progress >= 100
                  ? (isProp ? (hasPnl ? (pnlPos ? "Passed" : "Lost") : "Done") : "Done")
                  : `${progress}%`;

                return (
                  <div key={sess.id}
                    onMouseEnter={() => setHov(`card_${sess.id}`)} onMouseLeave={() => setHov(null)}
                    style={{
                      borderTop: `3px solid ${stripeCol}`,
                      borderRight: `1px solid ${brSide}`,
                      borderBottom: `1px solid ${brSide}`,
                      borderLeft: `1px solid ${brSide}`,
                      background: c.sf,
                      cursor: "default",
                      transition: "box-shadow 0.15s, border-color 0.15s",
                      boxShadow: isH
                        ? (isProp
                          ? "0 0 0 1px rgba(201,168,76,0.2), 0 4px 24px rgba(0,0,0,0.6), 0 0 18px rgba(201,168,76,0.12)"
                          : `0 0 0 1px ${c.acB}, 0 4px 24px rgba(0,0,0,0.6), 0 0 18px rgba(38,67,247,0.15)`)
                        : "0 3px 12px rgba(0,0,0,0.5)",
                      display: "flex",
                      flexDirection: "column",
                      overflow: "hidden",
                    }}>

                    {/* Row 1: Resume + Dashboard | name + date | ⋯ */}
                    <div style={{ display: "flex", alignItems: "center", gap: 0, padding: "10px 10px 0", borderBottom: `1px solid ${c.brH}`, paddingBottom: 8 }}>
                      <div
                        onClick={e => { e.stopPropagation(); openSession(sess); }}
                        onMouseEnter={() => setHov(`crs_${sess.id}`)}
                        onMouseLeave={() => setHov(null)}
                        style={{
                          width: 26, height: 26, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                          background: "linear-gradient(135deg,#1e38e8,#4A6AFF)", cursor:"default", transition: "filter 0.12s",
                          filter: hov === `crs_${sess.id}` ? "brightness(1.2)" : "brightness(1)",
                          boxShadow: "0 2px 8px rgba(38,67,247,0.35)",
                        }}>
                        <svg width={9} height={9} viewBox="0 0 12 12"><polygon points="2,1 11,6 2,11" fill="rgba(255,255,255,0.95)" /></svg>
                      </div>
                      <div
                        onClick={e => { e.stopPropagation(); openAnalytics(sess); }}
                        onMouseEnter={() => setHov(`cdb_${sess.id}`)}
                        onMouseLeave={() => setHov(null)}
                        style={{
                          width: 26, height: 26, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                          background: hov === `cdb_${sess.id}` ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.07)",
                          border: `1px solid ${hov === `cdb_${sess.id}` ? c.brH : c.br}`,
                          cursor:"default", transition: "background 0.12s, border-color 0.12s", marginLeft: 5,
                        }}>
                        <svg width={11} height={11} viewBox="0 0 20 20" fill="none">
                          <rect x="1" y="1" width="8" height="8" fill={hov === `cdb_${sess.id}` ? c.tx : c.ts} />
                          <rect x="11" y="1" width="8" height="8" fill={hov === `cdb_${sess.id}` ? c.tx : c.ts} />
                          <rect x="1" y="11" width="8" height="8" fill={hov === `cdb_${sess.id}` ? c.tx : c.ts} />
                          <rect x="11" y="11" width="8" height="8" fill={hov === `cdb_${sess.id}` ? c.tx : c.ts} />
                        </svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0, padding: "0 8px", display: "flex", alignItems: "center", gap: 6, overflow: "hidden", fontFamily: F }}>
                        <div style={{
                          fontSize: nm.length > 20 ? 9 : nm.length > 15 ? 10 : 11,
                          fontWeight: 600, color: c.ts, lineHeight: 1.35,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          flex: 1, minWidth: 0,
                        }}>{sess.name || "—"}</div>
                        <div style={{ fontSize: 9, fontWeight: 500, color: c.tm, lineHeight: 1.35, whiteSpace: "nowrap", flexShrink: 0 }}>{createdStr}</div>
                        <SessionInfoButton
                          active={descPop?.key === sessPopKey}
                          label="Session description"
                          onEnter={e => showDescPop(e, sessPopKey, "Session", sess.name || "Session", sessDesc)}
                          onLeave={() => setDescPop(null)}
                        />
                      </div>
                      <div
                        className="sess-act-btn"
                        onClick={e => {
                          e.stopPropagation();
                          const r = e.currentTarget.getBoundingClientRect();
                          setActMenu(actMenu?.id === sess.id ? null : { id: sess.id, x: (r.left + r.right) / 2, y: r.bottom });
                        }}
                        style={{
                          width: 28, height: 28, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                          cursor:"default", color: actMenu?.id === sess.id ? c.acL : c.ts,
                          background: actMenu?.id === sess.id ? "rgba(255,255,255,0.08)" : "transparent", transition: "all 0.12s",
                        }}>
                        <svg width={16} height={16} viewBox="0 0 24 24" fill="none"><circle cx="5" cy="12" r="2.2" fill="currentColor" /><circle cx="12" cy="12" r="2.2" fill="currentColor" /><circle cx="19" cy="12" r="2.2" fill="currentColor" /></svg>
                      </div>
                    </div>

                    {/* Row 2: Strategy + info */}
                    <div style={{ padding: "7px 10px", display: "flex", alignItems: "center", gap: 5, borderBottom: `1px solid ${c.brH}` }}>
                      <div style={{
                        fontSize: sn.length > 22 ? 10 : sn.length > 15 ? 11 : 12,
                        fontWeight: 600, color: c.ts, lineHeight: 1.3, fontFamily: F, flex: 1,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>{stratName}</div>
                      <SessionInfoButton
                        active={descPop?.key === stratPopKey}
                        label="Strategy description"
                        onEnter={e => showDescPop(e, stratPopKey, "Strategy", stratName, stratDesc)}
                        onLeave={() => setDescPop(null)}
                      />
                    </div>

                    {/* Row 3: Mode | Asset | Symbols (symbols top-aligned, full text — not centered) */}
                    <div style={{ padding: "7px 10px", display: "flex", alignItems: "flex-start", gap: 8, borderBottom: `1px solid ${c.brH}` }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: isProp ? c.gold : c.acL, fontFamily: F, flexShrink: 0, paddingTop: 1 }}>
                        {isProp ? "Prop Firm" : "Standard"}
                      </div>
                      <div style={{ width: 1, height: 12, background: c.brH, flexShrink: 0, marginTop: 3 }} />
                      <div style={{ fontSize: 10, fontWeight: 600, color: c.ts, fontFamily: F, flexShrink: 0, paddingTop: 1 }}>{cfgS?.asset_class || "—"}</div>
                      <div style={{ width: 1, height: 12, background: c.brH, flexShrink: 0, marginTop: 3 }} />
                      <div style={{ flex: 1, overflow: "hidden", minWidth: 0, display: "flex", alignItems: "flex-start", justifyContent: "flex-start", paddingTop: 1 }}>
                        {tickerRows.length === 0 ? (
                          sess.symbol ? (
                            <span style={{ fontSize: 9, fontWeight: 600, color: c.ts, fontFamily: F, maxWidth: "100%", overflowWrap: "anywhere", lineHeight: 1.35 }}>{sess.symbol}</span>
                          ) : (
                            <span style={{ fontSize: 9, color: c.tm, fontFamily: F }}>—</span>
                          )
                        ) : (
                          <div style={{
                            display: "flex",
                            flexWrap: "wrap",
                            justifyContent: "flex-start",
                            alignContent: "flex-start",
                            alignItems: "flex-start",
                            gap: "4px 10px",
                            width: "100%",
                            maxWidth: "100%",
                          }}>
                            {tickerRows.map(r => (
                              <span
                                key={r.sym}
                                style={{
                                  fontSize: 9,
                                  fontWeight: 600,
                                  color: c.ts,
                                  letterSpacing: "0.02em",
                                  fontFamily: F,
                                  fontVariantNumeric: "tabular-nums",
                                  lineHeight: 1.35,
                                  overflowWrap: "anywhere",
                                }}>
                                {r.sym}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Row 4: Date timeline */}
                    <div style={{ padding: "7px 10px", borderBottom: `1px solid ${c.brH}` }}>
                      {sess.start_date && sess.end_date ? (() => {
                        const sd = parseYmdParts(sess.start_date);
                        const ed = parseYmdParts(sess.end_date);
                        const durLabel = durationLabelMonths(sess.start_date, sess.end_date) || "";
                        if (!sd || !ed) return <span style={{ fontSize: 9, color: c.tm, fontFamily: F }}>—</span>;
                        return (
                          <div style={{ display: "flex", flexDirection: "column", gap: 3, fontFamily: F, fontVariantNumeric: "tabular-nums" }}>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: c.ts }}>{sd.mo} {sd.day}</span>
                              <span style={{ fontSize: 10, fontWeight: 700, color: c.ts }}>{ed.mo} {ed.day}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <span style={{ fontSize: 9, fontWeight: 600, color: c.tm }}>{sd.y}</span>
                              <div style={{ flex: 1, position: "relative", height: 1, background: `linear-gradient(90deg,${c.tm},${c.acL},${c.tm})` }}>
                                <div style={{
                                  position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                                  background: c.bg, padding: "0 4px", fontSize: 12, fontWeight: 800, color: c.acL,
                                  letterSpacing: "0.04em", lineHeight: 1.2, whiteSpace: "nowrap",
                                }}>{durLabel}</div>
                              </div>
                              <span style={{ fontSize: 9, fontWeight: 600, color: c.tm }}>{ed.y}</span>
                            </div>
                          </div>
                        );
                      })() : (
                        <span style={{ fontSize: 9, color: c.tm, fontFamily: F }}>—</span>
                      )}
                    </div>

                    {/* Row 5: Options */}
                    <div style={{ padding: "6px 10px", display: "flex", alignItems: "center", gap: 14, borderBottom: `1px solid ${c.brH}` }}>
                      {[{ label: "Rollback", on: rollbackOn }, { label: "Costs", on: costsOn }].map(({ label, on }) => (
                        <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: F }}>
                          <div style={{
                            width: 5, height: 5, borderRadius: "50%", background: on ? c.gn : c.rd, flexShrink: 0,
                            boxShadow: on ? `0 0 4px ${c.gn}88` : `0 0 4px ${c.rd}88`,
                          }} />
                          <div style={{ fontSize: 10, fontWeight: 600, color: on ? c.gn : c.rd, whiteSpace: "nowrap" }}>{label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Row 6: Stats row */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", borderBottom: `1px solid ${c.brH}` }}>
                      {[
                        ["Bal.", sess.start_balance != null ? `$${sess.start_balance.toLocaleString()}` : "—", c.ts],
                        ["P&L", pnlVal, pnlCol],
                        ["Win%", winPctStr, wf != null ? (wf >= 0.5 ? c.gn : c.rd) : c.tm],
                        ["R:R", k?.expectancy_r != null ? `1:${k.expectancy_r.toFixed(1)}` : "—", c.ts],
                        ["Trades", k?.trades != null ? String(k.trades) : "—", c.ts],
                      ].map(([lab, val, valCol], i) => (
                        <div key={lab as string} style={{
                          padding: "6px 6px", display: "flex", flexDirection: "column", gap: 2,
                          borderRight: i < 4 ? `1px solid ${c.brH}` : "none", alignItems: "center",
                        }}>
                          <div style={{ fontSize: 7, fontWeight: 700, color: c.tm, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: F }}>{lab}</div>
                          <div style={{
                            fontSize: 10, fontWeight: 800, color: valCol as string, fontVariantNumeric: "tabular-nums",
                            fontFamily: F, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%",
                          }}>{val}</div>
                        </div>
                      ))}
                    </div>

                    {/* Row 7: Progress */}
                    <div style={{ padding: "6px 10px 8px", display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 2, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
                        <div style={{
                          width: `${Math.min(progress, 100)}%`, height: "100%", background: progBarFill, transition: "width 0.3s ease",
                        }} />
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 800, color: progLblCol, fontVariantNumeric: "tabular-nums", fontFamily: F, flexShrink: 0 }}>
                        {progLabel}
                      </span>
                    </div>
                  </div>
                );
              })}
              {filteredSessionsAll.length === 0 && sessions.length > 0 && (
                <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "48px 0", color: c.tm, fontSize: 12 }}>No sessions match your filter</div>
              )}
              {sessionListTruncated && filteredSessionsAll.length > 0 && (
                <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "8px 0 0", color: c.tm, fontSize: 11, fontFamily: F }}>
                  Showing {SESSION_LIST_DISPLAY_MAX} of {filteredSessionsAll.length} sessions — refine search or filters to narrow the list
                </div>
              )}
            </div>
          ) : (
            /* ── Rows layout ── */
            <div style={{ display: "flex", flexDirection: "column", paddingTop: 4 }}>
              {filteredSessions.map(sess => {
                const isProp = sess.session_type === "propfirm";
                const k = kpis[sess.id];
                const progress = getSessionProgressDisplayed(sess, k);
                const hasPnl = k?.net_pnl != null;
                const pnlPos = hasPnl && (k?.net_pnl ?? 0) >= 0;
                const stripeCol = isProp ? c.gold : c.acL;
                const pnlCol = hasPnl ? (pnlPos ? c.gn : c.rd) : c.tm;
                const isH = hov === `row_${sess.id}`;
                const createdStr = sess.created_at ? new Date(sess.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
                const cfg = sess.config as Record<string, unknown> | undefined;
                const cfgS = sess.config as Record<string, string> | undefined;
                const stratDesc = strategyDescriptionText(sess, strategyDescById);
                const sessDesc = sessionDescriptionText(sess);
                const stratPopKey = `s${sess.id}-strategy`;
                const sessPopKey = `s${sess.id}-session`;
                const tickerRows = sessionTickerRows(sess);
                const costsOn = !!(cfgS?.commission && cfgS.commission !== "None")
                  || (cfg?.trading_costs != null && cfg.trading_costs !== "");
                const rb = cfg?.rollback_allowed ?? cfg?.allowBackNavigation;
                const rollbackOn = rb === true || rb === "true" || rb === 1;
                const wf = winRateAsFrac(k?.win_rate);
                const winPctStr = fmtWinRate(k?.win_rate);
                const progDoneCol = progress >= 100 ? (isProp ? (hasPnl ? (pnlPos ? c.gn : c.rd) : c.tm) : c.gn) : progress > 0 ? c.acL : c.tm;
                const progBarBg = progress >= 100 ? (isProp ? (hasPnl ? (pnlPos ? c.gn : c.rd) : c.acL) : c.gn) : c.acL;
                const progLabel = progress >= 100
                  ? (isProp ? (hasPnl ? (pnlPos ? "Passed" : "Lost") : "Done") : "Done")
                  : `${progress}%`;

                const colCell = (val: string, w: number, valCol: string = c.ts) => (
                  <div style={{ width: w, flexShrink: 0, padding: "0 10px", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: valCol, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis", fontVariantNumeric: "tabular-nums", textAlign: "center" as const }}>{val}</div>
                  </div>
                );
                return (
                  <div key={sess.id}
                    onMouseEnter={() => setHov(`row_${sess.id}`)} onMouseLeave={() => setHov(null)}
                    style={{ borderTop: `1px solid ${isH ? (isProp ? "rgba(201,168,76,0.35)" : c.acB) : c.brH}`, borderRight: `1px solid ${isH ? (isProp ? "rgba(201,168,76,0.35)" : c.acB) : c.brH}`, borderBottom: `1px solid ${isH ? (isProp ? "rgba(201,168,76,0.35)" : c.acB) : c.brH}`, borderLeft: `3px solid ${stripeCol}`, background: c.sf, cursor: "default", boxShadow: isH ? `0 0 0 1px ${isProp ? "rgba(201,168,76,0.2)" : c.acB},0 4px 24px rgba(0,0,0,0.6)` : "0 3px 12px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", minHeight: 80, overflow: "hidden", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", flex: 1, minHeight: 80 }}>
                      {/* Action buttons */}
                      <div style={{ width: 96, flexShrink: 0, display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: "0 10px" }}>
                        <div onClick={e => { e.stopPropagation(); openSession(sess); }}
                          onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.filter = "brightness(1.2)"}
                          onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.filter = "brightness(1)"}
                          style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#1e38e8,#4A6AFF)", cursor:"default", boxShadow: "0 2px 8px rgba(38,67,247,0.35)", flexShrink: 0 }}>
                          <svg width={10} height={10} viewBox="0 0 12 12"><polygon points="2,1 11,6 2,11" fill="rgba(255,255,255,0.95)" /></svg>
                        </div>
                        <div onClick={e => { e.stopPropagation(); openAnalytics(sess); }}
                          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.12)"; (e.currentTarget as HTMLDivElement).style.borderColor = c.brH; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.07)"; (e.currentTarget as HTMLDivElement).style.borderColor = c.br; }}
                          style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.07)", border: `1px solid ${c.br}`, cursor:"default", flexShrink: 0 }}>
                          <svg width={12} height={12} viewBox="0 0 20 20" fill="none"><rect x="1" y="1" width="8" height="8" fill={c.ts} /><rect x="11" y="1" width="8" height="8" fill={c.ts} /><rect x="1" y="11" width="8" height="8" fill={c.ts} /><rect x="11" y="11" width="8" height="8" fill={c.ts} /></svg>
                        </div>
                      </div>
                      {/* Session name + date */}
                      <div style={{ width: 172, flexShrink: 0, padding: "0 10px", display: "flex", alignItems: "center", gap: 6, overflow: "hidden", fontFamily: F }}>
                        <div style={{
                          fontSize: (sess.name || "").length > 20 ? 9 : (sess.name || "").length > 13 ? 10 : 11,
                          fontWeight: 600, color: c.ts, lineHeight: 1.35, flex: 1, minWidth: 0,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>{sess.name || "—"}</div>
                        <div style={{ fontSize: 9, fontWeight: 500, color: c.tm, lineHeight: 1.35, whiteSpace: "nowrap", flexShrink: 0 }}>{createdStr}</div>
                        <SessionInfoButton
                          active={descPop?.key === sessPopKey}
                          label="Session description"
                          onEnter={e => showDescPop(e, sessPopKey, "Session", sess.name || "Session", sessDesc)}
                          onLeave={() => setDescPop(null)}
                        />
                      </div>
                      {/* Strategy + info */}
                      <div style={{ width: 100, flexShrink: 0, padding: "0 8px 0 10px", display: "flex", alignItems: "center", gap: 4, overflow: "hidden", fontFamily: F }}>
                        <div style={{ fontSize: (cfgS?.strategy_name || "").length > 20 ? 9 : (cfgS?.strategy_name || "").length > 13 ? 10 : 11, fontWeight: 600, color: c.ts, lineHeight: 1.35, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cfgS?.strategy_name || "—"}</div>
                        <SessionInfoButton
                          active={descPop?.key === stratPopKey}
                          label="Strategy description"
                          onEnter={e => showDescPop(e, stratPopKey, "Strategy", cfgS?.strategy_name || "Strategy", stratDesc)}
                          onLeave={() => setDescPop(null)}
                        />
                      </div>
                      {/* Mode */}
                      {colCell(isProp ? "Prop Firm" : "Standard", 74, isProp ? c.gold : c.acL)}
                      {/* Asset — prominent label (Design / market column parity) */}
                      <div style={{
                        width: 90,
                        flexShrink: 0,
                        padding: "0 10px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-start",
                        overflow: "hidden",
                      }}>
                        <span style={{
                          fontSize: (cfgS?.asset_class || "").length > 14 ? 10 : 11,
                          fontWeight: 800,
                          color: c.tx,
                          fontFamily: F,
                          lineHeight: 1.25,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap" as const,
                          textTransform: "capitalize" as const,
                        }}>
                          {cfgS?.asset_class || "—"}
                        </span>
                      </div>
                      {/* Symbols — 2-column grid (`SessionsView.jsx` rows layout) */}
                      <div style={{
                        width: 120,
                        flexShrink: 0,
                        padding: "0 8px",
                        boxSizing: "border-box",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                      }}>
                        {tickerRows.length === 0 ? (
                          sess.symbol ? (
                            <span style={{
                              fontSize: 9,
                              fontWeight: 600,
                              color: c.ts,
                              fontFamily: F,
                              letterSpacing: "0.04em",
                              whiteSpace: "nowrap" as const,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              textAlign: "center" as const,
                              width: "100%",
                            }}>{sess.symbol}</span>
                          ) : (
                            <span style={{ fontSize: 10, color: c.tm, fontFamily: F }}>—</span>
                          )
                        ) : (
                          <div style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "1px 4px",
                            width: "100%",
                          }}>
                            {tickerRows.map(r => (
                              <span
                                key={r.sym}
                                style={{
                                  fontSize: 8,
                                  fontWeight: 600,
                                  color: c.ts,
                                  letterSpacing: "0.04em",
                                  whiteSpace: "nowrap" as const,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  fontFamily: F,
                                  lineHeight: 1.55,
                                  textAlign: "center" as const,
                                  fontVariantNumeric: "tabular-nums",
                                }}>
                                {r.sym}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Date Range — timeline */}
                      <div style={{ width: 134, flexShrink: 0, padding: "0 10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {sess.start_date && sess.end_date ? (() => {
                          const s = parseYmdParts(sess.start_date);
                          const e = parseYmdParts(sess.end_date);
                          const durLabel = durationLabelMonths(sess.start_date, sess.end_date) || "";
                          if (!s || !e) return <span style={{ fontSize: 9, color: c.tm }}>—</span>;
                          return (
                            <div style={{ display: "flex", flexDirection: "column", gap: 3, width: "100%", fontFamily: F, fontVariantNumeric: "tabular-nums" }}>
                              <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ fontSize: 9, fontWeight: 700, color: c.ts }}>{s.mo} {s.day}</span>
                                <span style={{ fontSize: 9, fontWeight: 700, color: c.ts }}>{e.mo} {e.day}</span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <span style={{ fontSize: 8, fontWeight: 600, color: c.tm }}>{s.y}</span>
                                <div style={{ flex: 1, position: "relative", height: 1, background: `linear-gradient(90deg,${c.tm},${c.acL},${c.tm})` }}>
                                  <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: c.sf, padding: "0 3px", fontSize: 10, fontWeight: 800, color: "#3B82F6", letterSpacing: "0.04em", lineHeight: 1.2, whiteSpace: "nowrap", fontFamily: F }}>{durLabel}</div>
                                </div>
                                <span style={{ fontSize: 8, fontWeight: 600, color: c.tm }}>{e.y}</span>
                              </div>
                            </div>
                          );
                        })() : <span style={{ fontSize: 10, color: c.tm }}>—</span>}
                      </div>
                      {/* Options */}
                      <div style={{ width: 102, flexShrink: 0, padding: "0 12px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        {[
                          { label: "Rollback", on: rollbackOn },
                          { label: "Costs", on: costsOn },
                        ].map(({ label, on }) => (
                          <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: F }}>
                            <div style={{ width: 5, height: 5, borderRadius: "50%", background: on ? c.gn : c.rd, flexShrink: 0, boxShadow: on ? `0 0 4px ${c.gn}88` : `0 0 4px ${c.rd}88` }} />
                            <div style={{ fontSize: 10, fontWeight: 600, color: on ? c.gn : c.rd, whiteSpace: "nowrap" }}>{label}</div>
                          </div>
                        ))}
                      </div>
                      {/* Starting Bal. */}
                      {colCell(sess.start_balance ? `$${sess.start_balance.toLocaleString()}` : "—", 88)}
                      {/* Net P&L */}
                      {colCell(k ? fmtMoney(k.net_pnl) : "—", 80, pnlCol)}
                      {/* Win % */}
                      {colCell(winPctStr ?? "—", 60, wf != null ? (wf >= 0.5 ? c.gn : c.rd) : c.tm)}
                      {/* Avg R:R */}
                      {colCell(k?.expectancy_r != null ? `1:${k.expectancy_r.toFixed(1)}` : "—", 62)}
                      {/* Trades */}
                      {colCell(k?.trades != null ? String(k.trades) : "—", 56)}
                      {/* Progress */}
                      <div style={{ width: 66, flexShrink: 0, padding: "0 8px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: progDoneCol, fontVariantNumeric: "tabular-nums", fontFamily: F }}>{progLabel}</span>
                        <div style={{ width: "100%", height: 2, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
                          <div style={{ width: `${Math.min(progress, 100)}%`, height: "100%", background: progBarBg, transition: "width 0.3s ease" }} />
                        </div>
                      </div>
                      {/* More */}
                      <div style={{ width: 50, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div
                          className="sess-act-btn"
                          onClick={e => {
                            e.stopPropagation();
                            const r = e.currentTarget.getBoundingClientRect();
                            setActMenu(actMenu?.id === sess.id ? null : { id: sess.id, x: (r.left + r.right) / 2, y: r.bottom });
                          }}
                          style={{
                            width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor:"default",
                            color: actMenu?.id === sess.id ? c.acL : c.ts,
                            background: actMenu?.id === sess.id ? "rgba(255,255,255,0.08)" : "transparent",
                            transition: "all 0.12s",
                          }}>
                          <svg width={18} height={18} viewBox="0 0 24 24" fill="none"><circle cx="5" cy="12" r="2.2" fill="currentColor" /><circle cx="12" cy="12" r="2.2" fill="currentColor" /><circle cx="19" cy="12" r="2.2" fill="currentColor" /></svg>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {filteredSessionsAll.length === 0 && sessions.length > 0 && (
                <div style={{ textAlign: "center", padding: "48px 0", color: c.tm, fontSize: 12 }}>No sessions match your filter</div>
              )}
              {sessionListTruncated && filteredSessionsAll.length > 0 && (
                <div style={{ textAlign: "center", padding: "12px 0 0", color: c.tm, fontSize: 11, fontFamily: F }}>
                  Showing {SESSION_LIST_DISPLAY_MAX} of {filteredSessionsAll.length} sessions — refine search or filters to narrow the list
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      </div>

      {descPop && (
        <div
          style={{
            position: "fixed",
            left: descPop.x,
            top: descPop.y,
            zIndex: 99999,
            maxWidth: 280,
            padding: "10px 12px",
            background: c.sf,
            border: `1px solid ${c.brH}`,
            boxShadow: "0 8px 28px rgba(0,0,0,0.75)",
            pointerEvents: "none",
            fontFamily: F,
          }}>
          <div style={{ fontSize: 8, fontWeight: 700, color: c.tm, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{descPop.kind}</div>
          <div style={{ fontSize: 10, fontWeight: 800, color: c.tx, marginBottom: 6 }}>{descPop.title}</div>
          <div style={{ fontSize: 9, color: c.ts, lineHeight: 1.45 }}>{descPop.desc}</div>
        </div>
      )}

      {actMenu && (() => {
        const ms = sessions.find(s => s.id === actMenu.id);
        if (!ms) return null;
        const progressAct = getSessionProgressDisplayed(ms, kpis[ms.id]);
        type MenRow =
          | { type: "item"; label: string; col: string; fn: () => void; danger?: boolean;
              icon: React.ReactNode }
          | { type: "div" };
        const rows: MenRow[] = [
          {
            type: "item",
            label: progressAct === 0 ? "Start" : "Resume",
            col: c.acL,
            fn: () => { openSession(ms); setActMenu(null); },
            icon: <svg width={14} height={14} viewBox="0 0 12 12"><polygon points="2,1 11,6 2,11" fill="currentColor" /></svg>,
          },
          {
            type: "item",
            label: "Dashboard",
            col: c.ts,
            fn: () => { openAnalytics(ms); setActMenu(null); },
            icon: <svg width={14} height={14} viewBox="0 0 20 20" fill="none"><rect x="1" y="1" width="8" height="8" fill="currentColor" /><rect x="11" y="1" width="8" height="8" fill="currentColor" /><rect x="1" y="11" width="8" height="8" fill="currentColor" /><rect x="11" y="11" width="8" height="8" fill="currentColor" /></svg>,
          },
          {
            type: "item",
            label: "Journal",
            col: c.ts,
            fn: () => { setJournalSession(ms); setActMenu(null); },
            icon: (
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="15" height="18" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <line x1="7" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="7" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="7" y1="16" x2="11" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            ),
          },
          { type: "div" },
          {
            type: "item",
            label: "Delete",
            col: c.rd,
            danger: true,
            fn: () => { void deleteSession(ms); },
            icon: <svg width={14} height={14} viewBox="0 0 24 24" fill="none"><polyline points="3,6 5,6 21,6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /><path d="M19,6l-1,14H6L5,6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /><path d="M10,11v6M14,11v6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /><path d="M9,6V4h6v2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>,
          },
        ];
        return (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 99997 }} onClick={() => setActMenu(null)} />
            <div
              onClick={e => e.stopPropagation()}
              style={{
                position: "fixed",
                top: actMenu.y + 6,
                left: Math.max(8, actMenu.x - 80),
                zIndex: 99998,
                width: 160,
                background: c.sf,
                border: `1px solid ${c.brH}`,
                boxShadow: "0 12px 40px rgba(0,0,0,0.8)",
                fontFamily: F,
              }}>
              <div style={{ height: 2, background: `linear-gradient(90deg,${c.ac},${c.acL},${c.ac})` }} />
              {rows.map((row, i) => {
                if (row.type === "div") return <div key={`d_${i}`} style={{ height: 1, background: c.br, margin: "2px 0" }} />;
                const { label, col, fn, danger, icon } = row;
                return (
                  <div key={label}
                    onClick={() => fn()}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 12px",
                      cursor:"default",
                      color: col,
                      fontSize: 11,
                      fontWeight: 700,
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = danger ? "rgba(255,80,104,0.12)" : "rgba(255,255,255,0.06)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}>
                    <span style={{ display: "flex", opacity: 0.9 }}>{icon}</span>
                    {label}
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

    </div>

    {journalSession && (() => {
      const isPropJ = journalSession.session_type === "propfirm";
      const stripeJ = isPropJ ? c.gold : c.acL;
      const cols = buildSessionJournalColumns(journalRows);
      const safeName = String(journalSession.name || "session").replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").slice(0, 80) || "session";
      const exportCsv = () => {
        const csv = buildSessionJournalCsvText(cols, journalRows);
        downloadUtf8Csv(`journal-${safeName}-${journalSession.id}.csv`, csv);
      };
      return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100000,
            background: c.bg,
            fontFamily: F,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ height: 56, flexShrink: 0, display: "flex", alignItems: "center", gap: 0, background: c.el, boxShadow: "0 2px 18px rgba(0,0,0,0.5)", zIndex: 2, paddingRight: 16 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: stripeJ, boxShadow: `0 0 8px ${stripeJ}`, flexShrink: 0, marginLeft: 20 }} />
            <div style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: c.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{journalSession.name}</div>
              <div style={{ fontSize: 9, fontWeight: 600, color: c.tm, marginTop: 2 }}>Trades only — session journal</div>
            </div>
            <div style={{ fontSize: 9, fontWeight: 800, color: stripeJ, letterSpacing: "0.1em", border: `1px solid ${stripeJ}44`, padding: "3px 10px", flexShrink: 0, marginRight: 10 }}>
              {isPropJ ? "PROP FIRM" : "STANDARD"}
            </div>
            <div
              onClick={exportCsv}
              style={{
                height: 34,
                padding: "0 18px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: c.sf,
                border: `1px solid ${c.brH}`,
                cursor: "default",
                fontSize: 10,
                fontWeight: 800,
                color: c.ts,
                letterSpacing: "0.06em",
                marginRight: 10,
                position: "relative",
                flexShrink: 0,
              }}
            >
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,${c.acL},${c.gold})`, opacity: 0.55, pointerEvents: "none" }} />
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none"><path d="M12 3v12M8 11l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M5 21h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
              Export CSV
            </div>
            <div
              onClick={() => setJournalSession(null)}
              style={{
                height: 34,
                padding: "0 16px",
                display: "flex",
                alignItems: "center",
                border: `1px solid ${c.brH}`,
                background: c.sf,
                cursor: "default",
                fontSize: 10,
                fontWeight: 700,
                color: c.ts,
                flexShrink: 0,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.color = c.tx; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.color = c.ts; }}
            >
              Back
            </div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: "20px 28px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: c.tm, marginBottom: 12 }}>
              {journalLoading ? "Loading trades…" : `${journalRows.length} trade${journalRows.length === 1 ? "" : "s"}`}
            </div>
            <div style={{ flex: 1, minHeight: 0, background: c.sf, border: `1px solid ${c.brH}`, position: "relative", display: "flex", flexDirection: "column" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,${c.acL},${c.gold})`, opacity: 0.55, pointerEvents: "none" }} />
              {!journalLoading && journalRows.length === 0 && (
                <div style={{ padding: 48, textAlign: "center", color: c.tm, fontSize: 12 }}>No trades recorded for this session yet.</div>
              )}
              {(journalLoading || journalRows.length > 0) && (
                <div className="tlr-scroll" style={{ flex: 1, overflow: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                    <thead>
                      <tr style={{ position: "sticky", top: 0, zIndex: 1, background: c.el, boxShadow: `0 1px 0 ${c.brH}` }}>
                        {cols.map(col => (
                          <th
                            key={col}
                            style={{
                              textAlign: "left",
                              padding: "10px 12px",
                              fontWeight: 800,
                              color: c.tm,
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                              whiteSpace: "nowrap",
                              borderBottom: `1px solid ${c.brH}`,
                            }}
                          >
                            {col.replace(/_/g, " ")}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {journalRows.map((row, ri) => (
                        <tr key={ri} style={{ borderBottom: `1px solid ${c.br}` }}>
                          {cols.map(col => {
                            const raw = row[col];
                            const display = formatJournalCellForDisplay(raw, col);
                            const show = display !== "";
                            return (
                              <td
                                key={col}
                                style={{
                                  padding: "8px 12px",
                                  color: c.ts,
                                  maxWidth: 220,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                                title={raw != null && raw !== "" ? formatJournalCellRawTitle(raw, col) : ""}
                              >
                                {show ? display : "—"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    })()}
    </>
  );
}
