"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Syne, Space_Mono } from "next/font/google";
import { BacktestOsDashboardLayout } from "../../backtest/BacktestOsDashboardLayout";
import type { BacktestOsChartPack } from "../../backtest/BacktestOsDashboardLayout";
import { PnlCalendarHeatmap } from "../../backtest/PnlCalendarHeatmap";
import type { OsMetricCard } from "../../backtest/backtestOsTypes";
import {
  durationBucketsHours,
  kurtosisExcess,
  maxConsecutiveStreaks,
  mean,
  monteCarloPercentiles,
  sampleStd,
  skewness,
  varCvar95,
} from "../../backtest/backtestOsCompute";
import "../../backtest/sessions-dashboard.css";
import "../../backtest/backtest-os-dashboard.css";

const syne = Syne({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-syne" });
const spaceMono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-space-mono" });

function jApiUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_JOURNAL_API_ORIGIN ?? "").replace(/\/$/, "");
  return base ? `${base}${path.startsWith("/") ? path : `/${path}`}` : path;
}
function getToken(): string | null {
  try { return typeof window !== "undefined" ? localStorage.getItem("token") : null; } catch { return null; }
}
async function jFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(jApiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((init?.headers ?? {}) as Record<string, string>),
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    let detail = "";
    try { detail = (JSON.parse(txt) as { error?: string }).error ?? ""; } catch { /* ignore */ }
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

type JEntry = {
  id: number;
  symbol: string;
  direction: string;
  pnl: number;
  rr: number;
  quantity: number;
  strategy?: string;
  setup?: string;
  open_time?: string;
  close_time?: string;
  date?: string;
  risk_amount?: number;
  commission?: number;
  slippage?: number;
};

type NT = {
  id: number;
  ticker: string;
  direction: string;
  pnl: number;
  rr: number;
  quantity: number;
  setup: string;
  openTs: number;
  closeTs: number;
  riskUsd: number;
  comm: number;
};

type BalanceSection = {
  start_balance: number;
  net_pnl: number;
  equity: { x: string; y: number }[];
  drawdown_pct: { x: string; y: number }[];
  max_drawdown: number;
  max_drawdown_pct: number;
  recovery_factor: number | null;
};

type SessionAnalytics = {
  sharpe_sortino: { sharpe: number | null; sortino: number | null };
  monthly_pnl: { x: string; y: number }[];
  holding_duration: { avg_hours: number | null; avg_win_hours: number | null; avg_loss_hours: number | null };
  balance?: BalanceSection;
};

const n = (v: unknown): number => { const x = Number(v ?? 0); return Number.isFinite(x) ? x : 0; };
const isoMs = (s?: string | null): number => { if (!s) return 0; const ms = Date.parse(s); return Number.isFinite(ms) ? ms : 0; };
const fm = (v: number): string => `$${v.toFixed(2)}`;
const fp = (v: number): string => `${v.toFixed(1)}%`;
const fd = (h: number | null | undefined): string =>
  h == null || !Number.isFinite(h) || h < 0 ? "—" : `${(h / 24).toFixed(1)}d`;

function buildHistogram(pnls: number[], bkt = 25) {
  const clean = pnls.filter(Number.isFinite);
  if (!clean.length) return [];
  const mn = Math.min(...clean), mx = Math.max(...clean);
  const start = Math.floor(mn / bkt) * bkt, end = Math.ceil(mx / bkt) * bkt;
  const bins: { label: string; from: number; to: number; count: number }[] = [];
  for (let x = start; x < end; x += bkt)
    bins.push({ label: `${x.toFixed(0)}→${(x + bkt).toFixed(0)}`, from: x, to: x + bkt, count: 0 });
  clean.forEach(v => {
    const i = Math.min(Math.floor((v - start) / bkt), bins.length - 1);
    if (i >= 0 && bins[i]) bins[i].count++;
  });
  return bins;
}

function jbApprox(sk: number | null, kt: number | null, N: number): number | null {
  if (!sk || !kt || N < 4) return null;
  return (N / 6) * (sk * sk + (kt * kt) / 4);
}

function pFromT(ta: number): string {
  if (!Number.isFinite(ta) || ta < 0) return "—";
  return ta > 3.29 ? "<0.001" : ta > 2.58 ? "<0.01" : ta > 1.96 ? "<0.05" : ta > 1.65 ? "<0.10" : "≥0.10";
}

function holdH(o: number, c: number): number | null {
  if (o <= 0 || c <= 0 || c < o) return null;
  return (c - o) / 3600000;
}

const EM = "—";
const card = (label: string, value: string, sub: string, accent: string, tone?: "pos" | "neg"): OsMetricCard =>
  ({ label, value, sub, accent, tone });

export default function JournalPage() {
  const [raw, setRaw]         = useState<JEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [noToken, setNoToken] = useState(false);
  const [pairFilter, setPairFilter]       = useState("ALL");
  const [setupFilter, setSetupFilter]     = useState("ALL");
  const [outcomeFilter, setOutcomeFilter] = useState("ALL");
  const [sbInput, setSbInput]   = useState("10000");
  const [reload, setReload]     = useState(0);
  const [csvBusy, setCsvBusy]   = useState(false);
  const [csvMsg, setCsvMsg]     = useState<string | null>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const [pSortK, setPSortK] = useState("pnl");
  const [pSortD, setPSortD] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const token = getToken();
    if (!token) { setNoToken(true); setLoading(false); return; }
    setNoToken(false); setLoading(true);
    let ok = true;
    jFetch<JEntry[]>("/api/journal/list")
      .then(d => { if (ok) { setRaw(Array.isArray(d) ? d : []); setError(null); } })
      .catch(e => { if (ok) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (ok) setLoading(false); });
    return () => { ok = false; };
  }, [reload]);

  const runCsvImport = useCallback(async (file: File) => {
    const token = getToken();
    if (!token) { setCsvMsg("Not logged in. Please log in at /journal first."); return; }
    setCsvBusy(true); setCsvMsg(null);
    try {
      const fd2 = new FormData(); fd2.append("file", file);
      const res = await fetch(jApiUrl("/api/journal/import/excel"), {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd2,
      });
      const body = await res.json() as { imported?: number; errors?: string[]; error?: string };
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setCsvMsg(`✓ Imported ${body.imported ?? 0} trades${body.errors?.length ? ` (${body.errors.length} errors)` : ""}`);
      setReload(x => x + 1);
    } catch (e) { setCsvMsg(e instanceof Error ? e.message : String(e)); }
    finally    { setCsvBusy(false); }
  }, []);

  const trades = useMemo<NT[]>(() => raw.map(e => ({
    id:        e.id,
    ticker:    String(e.symbol || "UNKNOWN").replace("/", "").toUpperCase(),
    direction: String(e.direction || "").toUpperCase().startsWith("S") ? "SHORT" : "LONG",
    pnl:       n(e.pnl),
    rr:        n(e.rr),
    quantity:  n(e.quantity),
    setup:     e.strategy || e.setup || "General",
    openTs:    isoMs(e.open_time)  || isoMs(e.date),
    closeTs:   isoMs(e.close_time) || isoMs(e.date),
    riskUsd:   n(e.risk_amount),
    comm:      n(e.commission) + n(e.slippage),
  })), [raw]);

  const pairOpts  = useMemo(() => [...new Set(trades.map(t => t.ticker))].sort(), [trades]);
  const setupOpts = useMemo(() => [...new Set(trades.map(t => t.setup))].sort(), [trades]);

  const ft = useMemo<NT[]>(() => trades.filter(t => {
    const p = pairFilter   === "ALL" || t.ticker === pairFilter;
    const s = setupFilter  === "ALL" || t.setup  === setupFilter;
    const o = outcomeFilter === "ALL"
      || (outcomeFilter === "WINNERS"   && t.pnl > 0)
      || (outcomeFilter === "LOSERS"    && t.pnl < 0)
      || (outcomeFilter === "BREAKEVEN" && t.pnl === 0);
    return p && s && o;
  }), [trades, pairFilter, setupFilter, outcomeFilter]);

  const sb = useMemo(() => {
    const v = parseFloat(sbInput);
    return Number.isFinite(v) && v > 0 ? v : null;
  }, [sbInput]);

  const stats = useMemo(() => {
    const total  = ft.length;
    const wins   = ft.filter(t => t.pnl > 0).length;
    const losses = ft.filter(t => t.pnl < 0).length;
    const net    = ft.reduce((s, t) => s + t.pnl, 0);
    const gw     = ft.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
    const gl     = Math.abs(ft.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    const avgRR   = total > 0 ? ft.reduce((s, t) => s + t.rr, 0) / total : 0;
    const avgWin  = wins   > 0 ? gw / wins   : 0;
    const avgLoss = losses > 0 ? gl / losses : 0;
    const pf      = gl > 0 ? gw / gl : gw > 0 ? gw : 0;
    const exp     = total > 0 ? net / total : 0;
    const best    = ft.reduce((m, t) => t.pnl > m.pnl ? t : m, { pnl: -Infinity, ticker: "-" } as NT & { pnl: number });
    const worst   = ft.reduce((m, t) => t.pnl < m.pnl ? t : m, { pnl:  Infinity, ticker: "-" } as NT & { pnl: number });
    return { total, wins, losses, net, gw, gl, winRate, avgRR, avgWin, avgLoss, pf, exp, best, worst };
  }, [ft]);

  const pnls     = useMemo(() => ft.map(t => t.pnl), [ft]);
  const byClose  = useMemo(() => [...ft].sort((a, b) => a.closeTs - b.closeTs), [ft]);

  const perPair = useMemo(() => {
    const m = new Map<string, { cnt: number; w: number; pnl: number; rr: number; comm: number }>();
    ft.forEach(t => {
      const v = m.get(t.ticker) ?? { cnt: 0, w: 0, pnl: 0, rr: 0, comm: 0 };
      v.cnt++; if (t.pnl > 0) v.w++; v.pnl += t.pnl; v.rr += t.rr; v.comm += t.comm;
      m.set(t.ticker, v);
    });
    return [...m.entries()].map(([ticker, v]) => ({
      ticker, trades: v.cnt, winRate: v.cnt > 0 ? (v.w / v.cnt) * 100 : 0,
      pnl: v.pnl, avgRr: v.cnt > 0 ? v.rr / v.cnt : 0, comm: v.comm,
    }));
  }, [ft]);

  const sortedPair = useMemo(() => {
    return [...perPair].sort((a: Record<string, number | string>, b: Record<string, number | string>) => {
      const av = a[pSortK], bv = b[pSortK];
      if (typeof av === "string" && typeof bv === "string")
        return pSortD === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return pSortD === "asc" ? Number(av) - Number(bv) : Number(bv) - Number(av);
    }) as typeof perPair;
  }, [perPair, pSortK, pSortD]);

  const playbookRows = useMemo(() => {
    const m = new Map<string, { cnt: number; w: number; pnl: number; rr: number }>();
    ft.forEach(t => {
      const v = m.get(t.setup) ?? { cnt: 0, w: 0, pnl: 0, rr: 0 };
      v.cnt++; if (t.pnl > 0) v.w++; v.pnl += t.pnl; v.rr += t.rr;
      m.set(t.setup, v);
    });
    return [...m.entries()].map(([setup, v]) => ({
      setup, trades: v.cnt, winRate: v.cnt > 0 ? (v.w / v.cnt) * 100 : 0,
      pnl: v.pnl, avgRr: v.cnt > 0 ? v.rr / v.cnt : 0,
    })).sort((a, b) => b.pnl - a.pnl);
  }, [ft]);

  const sAna = useMemo((): SessionAnalytics | undefined => {
    if (!ft.length) return undefined;

    const moMap = new Map<string, number>();
    for (const t of byClose) {
      if (t.closeTs > 0) {
        const d = new Date(t.closeTs);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        moMap.set(k, (moMap.get(k) ?? 0) + t.pnl);
      }
    }
    const monthly_pnl = [...moMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([x, y]) => ({ x, y }));

    const mu  = mean(pnls);
    const sig = sampleStd(pnls);
    const dwn = pnls.filter(p => p < 0);
    const dsd = dwn.length > 1 ? sampleStd(dwn) : 0;
    const sharpe  = sig > 0 ? mu / sig : null;
    const sortino = dsd > 0 ? mu / dsd : null;

    const hh = byClose.map(t => holdH(t.openTs, t.closeTs)).filter((h): h is number => h != null);
    const avg_hours      = hh.length ? mean(hh) : null;
    const avg_win_hours  = (() => {
      const xs = byClose.filter(t => t.pnl > 0).map(t => holdH(t.openTs, t.closeTs)).filter((h): h is number => h != null);
      return xs.length ? mean(xs) : null;
    })();
    const avg_loss_hours = (() => {
      const xs = byClose.filter(t => t.pnl < 0).map(t => holdH(t.openTs, t.closeTs)).filter((h): h is number => h != null);
      return xs.length ? mean(xs) : null;
    })();

    let balance: BalanceSection | undefined;
    if (sb) {
      let eq = sb, pk = sb, mddA = 0, mddP = 0;
      const equity: { x: string; y: number }[] = [];
      const ddp:    { x: string; y: number }[] = [];
      for (let i = 0; i < byClose.length; i++) {
        eq += byClose[i].pnl;
        equity.push({ x: String(i + 1), y: eq });
        if (eq > pk) pk = eq;
        const dd = pk > 0 ? ((eq - pk) / pk) * 100 : 0;
        if (dd < mddP) mddP = dd;
        if (eq - pk < mddA) mddA = eq - pk;
        ddp.push({ x: String(i + 1), y: dd });
      }
      const netPnl = eq - sb;
      balance = {
        start_balance: sb, net_pnl: netPnl, equity, drawdown_pct: ddp,
        max_drawdown: mddA, max_drawdown_pct: mddP / 100,
        recovery_factor: mddA < 0 ? Math.abs(netPnl / mddA) : null,
      };
    }

    return { sharpe_sortino: { sharpe, sortino }, monthly_pnl, balance, holding_duration: { avg_hours, avg_win_hours, avg_loss_hours } };
  }, [ft, byClose, pnls, sb]);

  const eqCurve = useMemo(() => {
    let r = 0;
    return byClose.map((t, i) => ({ i: i + 1, eq: (r += t.pnl) }));
  }, [byClose]);

  const chartPack = useMemo((): BacktestOsChartPack => {
    const sbN     = sAna?.balance?.start_balance ?? null;
    const moRows  = sAna?.monthly_pnl ?? [];
    const bEq     = sAna?.balance?.equity;
    let equity: BacktestOsChartPack["equity"] = null;
    if (Array.isArray(bEq) && bEq.length) {
      equity = { labels: bEq.map((_, i) => String(i + 1)), strategy: bEq.map(r => n(r.y)), benchmark: sbN ? bEq.map(() => sbN) : null, subtitle: sbN ? `$${sbN.toLocaleString()} start` : "equity" };
    } else if (eqCurve.length) {
      equity = { labels: eqCurve.map(e => String(e.i)), strategy: eqCurve.map(e => e.eq), benchmark: null, subtitle: "cumulative $ PnL" };
    }

    const moPct = sbN && moRows.length
      ? { labels: moRows.map(r => r.x), values: moRows.map(r => (n(r.y) / sbN) * 100) }
      : null;
    const rolling = moPct && moPct.values.length >= 3
      ? { labels: moPct.labels, values: moPct.values.map((_, i) => i < 2 ? null : ((moPct.values[i] + moPct.values[i - 1] + moPct.values[i - 2]) / 3) * 12) }
      : null;

    let dist: BacktestOsChartPack["dist"] = null;
    if (pnls.length) {
      const sp  = Math.max(...pnls) - Math.min(...pnls);
      const bkt = Math.max(25, sp / 8 || 25);
      const h   = buildHistogram(pnls, bkt);
      dist = { labels: h.map(x => x.label), counts: h.map(x => x.count), colors: h.map(x => (x.from + x.to) / 2 >= 0 ? "rgba(0,255,136,0.6)" : "rgba(255,77,77,0.6)") };
    }

    const ddR = sAna?.balance?.drawdown_pct;
    const drawdown = Array.isArray(ddR) && ddR.length
      ? { labels: ddR.map((_, i) => String(i + 1)), values: ddR.map(r => n(r.y)) }
      : null;

    const sharpeN  = n(sAna?.sharpe_sortino?.sharpe  ?? 0);
    const sortinoN = n(sAna?.sharpe_sortino?.sortino ?? 0);
    const mddpN    = n(sAna?.balance?.max_drawdown_pct ?? 0);
    const calR     = mddpN > 0 && sbN ? Math.abs(stats.net / sbN) / Math.abs(mddpN) : 0;
    const omega    = stats.avgLoss > 0 ? (stats.avgWin * stats.wins) / (stats.avgLoss * Math.max(1, stats.losses)) : 0;
    const cr       = (x: number) => Math.min(2, Math.max(0, Number.isFinite(x) ? x : 0));
    const sig      = sampleStd(pnls);
    const radar = stats.total > 0 ? {
      labels: ["Sharpe", "Sortino", "Win%", "PF", "Calmar", "Omega", "Avg R", "Net/σ"],
      strategy: [cr(sharpeN / 1.2), cr(sortinoN / 1.5), cr(stats.winRate / 50), cr(stats.pf / 2.5), cr(calR), cr(omega / 2), cr((stats.avgRR + 2) / 4), cr(sig > 0 ? stats.net / pnls.length / sig : 0)],
      benchmark: [0.85, 0.9, 0.55, 0.85, 0.65, 0.9, 0.75, 0.7],
    } : null;

    let annual: BacktestOsChartPack["annual"] = null;
    if (moRows.length && sbN) {
      const by: Record<string, number> = {};
      moRows.forEach(r => { const y = String(r.x).slice(0, 4); by[y] = (by[y] ?? 0) + n(r.y); });
      const yrs = Object.keys(by).sort();
      annual = { years: yrs, strategy: yrs.map(y => (by[y] / sbN) * 100), benchmark: null };
    }

    const tradePL = byClose.length ? (() => { let c = 0; return byClose.map((t, i) => ({ x: i + 1, y: (c += t.pnl) })); })() : null;
    const winLoss = stats.total > 0 ? { wins: stats.wins, losses: stats.losses } : null;
    const hh = byClose.map(t => holdH(t.openTs, t.closeTs)).filter((h): h is number => h != null && Number.isFinite(h));
    const duration = hh.length > 0 ? { labels: ["≤1d", "2–3d", "4–7d", "8–14d", "15–30d", ">30d"], counts: durationBucketsHours(hh) } : null;
    const monteCarlo = pnls.length > 2 ? monteCarloPercentiles(pnls, 200, Math.min(80, Math.max(10, pnls.length))) : null;

    return { equity, rolling, dist, monthlyPct: moPct, drawdown, radar, annual, tradePL, winLoss, duration, monteCarlo };
  }, [sAna, eqCurve, ft, stats, pnls, byClose]);

  const bundles = useMemo(() => {
    const sbN    = sAna?.balance?.start_balance ?? null;
    const moRows = sAna?.monthly_pnl ?? [];
    const sig    = sampleStd(pnls);
    const { var95, cvar95 } = varCvar95(pnls);
    const sk = skewness(pnls), kt = kurtosisExcess(pnls);
    const neg = pnls.filter(p => p < 0), dsd = neg.length > 1 ? sampleStd(neg) : 0;
    const mddp = sAna?.balance?.max_drawdown_pct;
    const rec  = sAna?.balance?.recovery_factor;
    const ddPts = (sAna?.balance?.drawdown_pct ?? []).map(r => Math.abs(n(r.y)));
    const ulcer = ddPts.length ? Math.sqrt(mean(ddPts.map(x => x * x))) : null;
    const pain  = ddPts.length ? mean(ddPts) : null;
    const sharpeN  = sAna?.sharpe_sortino?.sharpe;
    const sortinoN = sAna?.sharpe_sortino?.sortino;
    const mddpN    = n(mddp ?? 0);
    const calA     = sbN && mddpN > 0 ? (Math.abs(stats.net / sbN) / Math.abs(mddpN)).toFixed(2) : EM;
    const strk     = maxConsecutiveStreaks(byClose.map(t => t.pnl > 0));
    const commTotal = sortedPair.reduce((s, r) => s + n(r.comm), 0);
    const pN = pnls.length, se = pN > 1 && sig > 0 ? sig / Math.sqrt(pN) : 0;
    const tStat = se > 0 ? mean(pnls) / se : null;
    const gw  = ft.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
    const glA = Math.abs(ft.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
    const omega0  = glA > 1e-9 ? (gw / glA).toFixed(2) : EM;
    const rf      = sbN ? stats.net / sbN : null;
    const martin  = rf != null && ulcer && ulcer > 1e-9 ? ((rf * 100) / ulcer).toFixed(2) : EM;
    const painR   = rf != null && pain  && pain  > 1e-9 ? ((rf * 100) / pain).toFixed(2)  : EM;
    const jb      = jbApprox(sk, kt, pN);
    const mc      = pnls.length > 2 ? monteCarloPercentiles(pnls, 200, Math.min(80, pN)) : null;
    const mc5     = mc?.p5?.length ? mc.p5[mc.p5.length - 1] : null;
    const totalRet   = sbN ? ((stats.net / sbN) * 100).toFixed(2) + "%" : EM;
    const moAvgPct   = sbN && moRows.length ? ((moRows.reduce((s, r) => s + n(r.y), 0) / moRows.length / sbN) * 100).toFixed(2) + "%" : EM;
    let bestMo = EM, worstMo = EM, bV = -Infinity, wV = Infinity;
    for (const r of moRows) {
      const v = n(r.y);
      if (v > bV) { bV = v; bestMo  = `${r.x} (${fm(v)})`; }
      if (v < wV) { wV = v; worstMo = `${r.x} (${fm(v)})`; }
    }
    const hld = sAna?.holding_duration;

    return {
      returnCards: [
        card("Net P&L",       fm(stats.net),       `${stats.total} trades`,          "#00ff88", stats.net >= 0 ? "pos" : "neg"),
        card("Total return",  totalRet,             "net PnL / start balance",         "#00ff88", stats.net >= 0 ? "pos" : "neg"),
        card("Gross profit",  fm(stats.gw),         "winners only",                    "#00ff88", "pos"),
        card("Gross loss",    fm(-stats.gl),         "losers only",                     "#00ff88", "neg"),
        card("Monthly avg %", moAvgPct,              "mean monthly / balance",          "#00ff88"),
        card("Long P&L",      fm(ft.filter(t => t.direction === "LONG").reduce((s, t) => s + t.pnl, 0)),  "long side",  "#00ff88"),
        card("Short P&L",     fm(ft.filter(t => t.direction === "SHORT").reduce((s, t) => s + t.pnl, 0)), "short side", "#00ff88"),
        card("Alpha",         EM,                   "no benchmark loaded",             "#00ff88"),
      ],
      riskCards: [
        card("Volatility (σ)", pN ? fm(sig) : EM,         "per-trade PnL std",     "#ff4d4d"),
        card("Downside dev",   dsd > 0 ? fm(dsd) : EM,    "losing trades only",    "#ff4d4d"),
        card("VaR 95%",        var95  != null ? (var95  / (sbN || 1) * 100).toFixed(2) + "%" : EM, "empirical tail",     "#ff4d4d", "neg"),
        card("CVaR 95%",       cvar95 != null ? (cvar95 / (sbN || 1) * 100).toFixed(2) + "%" : EM, "expected shortfall", "#ff4d4d", "neg"),
        card("Skewness",       sk != null ? sk.toFixed(2) : EM, "trade PnL",       "#ff4d4d", sk != null && sk > 0 ? "pos" : undefined),
        card("Kurtosis",       kt != null ? kt.toFixed(2) : EM, "excess",          "#ff4d4d"),
        card("Tail risk",      pN ? ((pnls.filter(p => p < -3 * sig).length / pN) * 100).toFixed(1) + "%" : EM, "P(PnL<−3σ)", "#ff4d4d"),
        card("Commission",     fm(-commTotal), "total comm+slippage", "#ff4d4d", "neg"),
      ],
      drawCards: [
        card("Max drawdown",    mddp != null ? (n(mddp) * 100).toFixed(2) + "%" : EM, "of peak balance",    "#a855f7", "neg"),
        card("Avg drawdown",    pain != null ? pain.toFixed(2) + "%" : EM,             "mean |underwater|",  "#a855f7"),
        card("Calmar ratio",    calA,                                                   "return / max DD%",   "#a855f7", calA !== EM ? "pos" : undefined),
        card("Recovery factor", rec != null && Number.isFinite(n(rec)) ? n(rec).toFixed(2) + "×" : EM, "net / max DD $", "#a855f7"),
        card("Ulcer index",     ulcer != null ? ulcer.toFixed(2) : EM, "RMS DD%",      "#a855f7"),
        card("Pain index",      pain  != null ? pain.toFixed(2) + "%" : EM, "mean DD depth", "#a855f7"),
      ],
      ratioCards: [
        card("Sharpe ratio",  sharpeN  != null && Number.isFinite(sharpeN)  ? sharpeN.toFixed(2)  : EM, "mean/σ trades",     "#00c4ff"),
        card("Sortino ratio", sortinoN != null && Number.isFinite(sortinoN) ? sortinoN.toFixed(2) : EM, "downside σ",        "#00c4ff"),
        card("Calmar ratio",  calA,                                                                       "return / max DD%",  "#00c4ff", calA !== EM ? "pos" : undefined),
        card("Omega ratio",   omega0,   "gains/|losses| τ=0", "#00c4ff", omega0 !== EM && Number(omega0) >= 1 ? "pos" : omega0 !== EM ? "neg" : undefined),
        card("Martin ratio",  martin,   "return% / ulcer",    "#00c4ff", martin !== EM ? "pos" : undefined),
        card("Pain ratio",    painR,    "return% / pain idx", "#00c4ff", painR  !== EM ? "pos" : undefined),
        card("t-Statistic",   tStat != null && Number.isFinite(tStat) ? tStat.toFixed(2) : EM, "mean/stderr", "#00c4ff"),
      ],
      tradeCards: [
        card("Win rate",           fp(stats.winRate),   `of ${stats.total} trades`,   "#ff6b35", "pos"),
        card("Profit factor",      stats.pf.toFixed(2), "gross win / gross loss",      "#ff6b35", stats.pf >= 1 ? "pos" : "neg"),
        card("Payoff ratio",       stats.avgLoss > 0 ? (stats.avgWin / stats.avgLoss).toFixed(2) : EM, "avg win / avg loss", "#ff6b35"),
        card("Expectancy",         fm(stats.exp),       "per trade",                   "#ff6b35", stats.exp >= 0 ? "pos" : "neg"),
        card("Total trades",       String(stats.total), "round-trips",                 "#ff6b35"),
        card("Avg duration",       fd(hld?.avg_hours),  "open→close",                  "#ff6b35"),
        card("Max consec wins",    String(strk.maxWins),   "streak",                   "#ff6b35", "pos"),
        card("Max consec losses",  String(strk.maxLosses), "streak",                   "#ff6b35", "neg"),
        card("Largest win",        fm(Number.isFinite(stats.best?.pnl)  ? stats.best.pnl  : 0), stats.best?.ticker  ?? "", "#ff6b35", "pos"),
        card("Largest loss",       fm(Number.isFinite(stats.worst?.pnl) ? stats.worst.pnl : 0), stats.worst?.ticker ?? "", "#ff6b35", "neg"),
        card("Avg winner",         fm(stats.avgWin),    "per win",                     "#ff6b35", "pos"),
        card("Avg loser",          fm(stats.avgLoss),   "per loss (abs)",              "#ff6b35", "neg"),
        card("Win hold",           fd(hld?.avg_win_hours),  "winners",                 "#ff6b35"),
        card("Loss hold",          fd(hld?.avg_loss_hours), "losers",                  "#ff6b35"),
      ],
      statCards: [
        card("t-Statistic",      tStat != null ? tStat.toFixed(2) : EM,  "mean PnL/stderr",       "#fbbf24"),
        card("p-Value",          tStat != null && Number.isFinite(tStat) ? pFromT(Math.abs(tStat)) : EM, "rough |t| thresholds", "#fbbf24"),
        card("Jarque-Bera",      jb != null ? jb.toFixed(1) : EM,        "JB approx",             "#fbbf24"),
        card("Skewness",         sk != null ? sk.toFixed(2) : EM,        "trade PnL distribution","#fbbf24"),
        card("Kurtosis",         kt != null ? kt.toFixed(2) : EM,        "fat tails",             "#fbbf24"),
        card("Monte Carlo 5th",  mc5 != null ? fm(mc5) : EM,             "bootstrap cum PnL end", "#fbbf24"),
      ],
      timeCards: [
        card("Best month",  bestMo,  "by $ PnL",       "#9ca3af", "pos"),
        card("Worst month", worstMo, "by $ PnL",        "#9ca3af", "neg"),
        card("Avg hold",    fd(hld?.avg_hours),      "open→close", "#9ca3af"),
        card("Win hold",    fd(hld?.avg_win_hours),  "winners",    "#9ca3af"),
        card("Loss hold",   fd(hld?.avg_loss_hours), "losers",     "#9ca3af"),
        card("In drawdown", ddPts.length ? ((ddPts.filter(x => x > 0.01).length / ddPts.length) * 100).toFixed(1) + "%" : EM, "DD pts > 0.01%", "#9ca3af"),
      ],
    };
  }, [sAna, stats, pnls, ft, byClose, sortedPair]);

  const recent   = useMemo(() => [...ft].sort((a, b) => b.closeTs - a.closeTs).slice(0, 15), [ft]);
  const calTrades = useMemo(() => ft.map(t => ({ closeTs: t.closeTs, pnl: t.pnl })), [ft]);
  const dr = useMemo(() => {
    const ts = byClose.map(t => t.closeTs).filter(x => x > 0);
    if (!ts.length) return { from: EM, to: EM };
    return { from: new Date(Math.min(...ts)).toISOString().slice(0, 10), to: new Date(Math.max(...ts)).toISOString().slice(0, 10) };
  }, [byClose]);

  if (noToken) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "80vh", background: "#07080E", color: "#fff" }}>
      <div style={{ textAlign: "center", padding: 32, borderRadius: 16, border: "1px solid rgba(255,255,255,0.1)", maxWidth: 420 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔑</div>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: 8 }}>Journal login required</h2>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.85rem", marginBottom: 24 }}>
          No journal token found in localStorage. Please log in at <code style={{ color: "#00c4ff" }}>/journal</code> first.
        </p>
        <a href="/journal" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 12, background: "rgba(0,196,255,0.1)", border: "1px solid rgba(0,196,255,0.3)", color: "#00c4ff", fontSize: "0.875rem", fontWeight: 500, textDecoration: "none" }}>
          Go to /journal →
        </a>
      </div>
    </div>
  );

  const thStyle: React.CSSProperties = { cursor: "pointer", userSelect: "none" };
  const sortHdr = (k: string, label: string) => (
    <th style={thStyle} onClick={() => { if (pSortK === k) setPSortD(d => d === "asc" ? "desc" : "asc"); else { setPSortK(k); setPSortD("desc"); } }}>
      {label}{pSortK === k ? (pSortD === "asc" ? " ↑" : " ↓") : ""}
    </th>
  );

  return (
    <div className={`${syne.variable} ${spaceMono.variable} bt-os-dashboard`} style={{ fontFamily: "var(--font-syne), Syne, sans-serif" }}>
      {/* ── Toolbar ── */}
      <div className="bt-os-toolbar">
        <div className="bt-os-toolbar-inner">
          <span style={{ fontSize: "0.72rem", color: "#9ca3af", fontWeight: 700, letterSpacing: "0.05em" }}>JOURNAL</span>
          <select value={pairFilter} onChange={e => setPairFilter(e.target.value)}>
            <option value="ALL">All instruments</option>
            {pairOpts.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={setupFilter} onChange={e => setSetupFilter(e.target.value)}>
            <option value="ALL">All strategies</option>
            {setupOpts.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={outcomeFilter} onChange={e => setOutcomeFilter(e.target.value)}>
            <option value="ALL">All outcomes</option>
            <option value="WINNERS">Winners</option>
            <option value="LOSERS">Losers</option>
            <option value="BREAKEVEN">Breakeven</option>
          </select>
          <span className="bt-os-toolbar-rule" aria-hidden />
          <label style={{ fontSize: "0.72rem", color: "#9ca3af", display: "flex", alignItems: "center", gap: 4 }}>
            Start $&nbsp;
            <input
              type="number" min={1} step={1000} value={sbInput}
              onChange={e => setSbInput(e.target.value)}
              style={{ width: 90, padding: "3px 6px", borderRadius: 4, border: "1px solid rgba(255,255,255,0.15)", background: "#111418", color: "#e8eaed", fontSize: "0.72rem" }}
            />
          </label>
          <span className="bt-os-toolbar-rule" aria-hidden />
          <label style={{ cursor: "pointer", fontSize: "0.72rem", color: csvBusy ? "#6b7280" : "#00ff88", display: "flex", alignItems: "center", gap: 6 }}>
            <input ref={csvRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) void runCsvImport(f); e.target.value = ""; }} />
            {csvBusy ? "Importing…" : "⬆ Import CSV / Excel"}
          </label>
          {csvMsg && (
            <span style={{ fontSize: "0.68rem", color: csvMsg.startsWith("✓") ? "#22c55e" : "#ef4444", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {csvMsg}
            </span>
          )}
        </div>
      </div>

      {error && <div className="bt-os-api-error">Journal API: {error}</div>}

      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 400, color: "#6b7280" }}>
          Loading journal trades…
        </div>
      ) : !ft.length ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 400, color: "#6b7280", gap: 16 }}>
          <div style={{ fontSize: 48 }}>📋</div>
          <div style={{ fontSize: "0.95rem" }}>
            {trades.length ? "No trades match the current filter." : "No trades found. Import a CSV or add trades in the journal app."}
          </div>
          {!trades.length && (
            <label style={{ cursor: "pointer", padding: "10px 20px", borderRadius: 10, border: "1px solid rgba(0,255,136,0.3)", background: "rgba(0,255,136,0.08)", color: "#00ff88", fontSize: "0.85rem", fontWeight: 500 }}>
              <input type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) void runCsvImport(f); e.target.value = ""; }} />
              {csvBusy ? "Importing…" : "⬆ Upload CSV to import trades"}
            </label>
          )}
          {csvMsg && <span style={{ fontSize: "0.75rem", color: csvMsg.startsWith("✓") ? "#22c55e" : "#ef4444" }}>{csvMsg}</span>}
        </div>
      ) : (
        <BacktestOsDashboardLayout
          sessionName="Trading Journal"
          strategyLine={`${stats.total} trades filtered · ${trades.length} total`}
          dateRangeLine={`${dr.from} → ${dr.to}`}
          nTrades={stats.total}
          chartPack={chartPack}
          returnCards={bundles.returnCards}
          riskCards={bundles.riskCards}
          drawCards={bundles.drawCards}
          ratioCards={bundles.ratioCards}
          tradeCards={bundles.tradeCards}
          statCards={bundles.statCards}
          timeCards={bundles.timeCards}
          calendarSection={calTrades.length ? <PnlCalendarHeatmap trades={calTrades} /> : null}
          advancedSection={
            <>
              {/* Per-instrument breakdown */}
              <div className="bt-os-chart-card" style={{ marginBottom: 12 }}>
                <div className="bt-os-chart-title">Per-instrument breakdown</div>
                <div className="bt-os-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {sortHdr("ticker", "Instrument")}
                        {sortHdr("trades", "Trades")}
                        {sortHdr("winRate", "Win%")}
                        {sortHdr("pnl", "Net P&L")}
                        {sortHdr("avgRr", "Avg R:R")}
                        {sortHdr("comm", "Commissions")}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPair.map(r => (
                        <tr key={r.ticker}>
                          <td>{r.ticker}</td>
                          <td>{r.trades}</td>
                          <td>{fp(r.winRate)}</td>
                          <td className={r.pnl >= 0 ? "bt-os-td-pos" : "bt-os-td-neg"}>{fm(r.pnl)}</td>
                          <td>{r.avgRr.toFixed(2)}</td>
                          <td style={{ color: "#ef4444" }}>{fm(-r.comm)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Strategy breakdown */}
              <div className="bt-os-chart-card" style={{ marginBottom: 12 }}>
                <div className="bt-os-chart-title">Strategy breakdown</div>
                <div className="bt-os-table-wrap">
                  <table>
                    <thead><tr><th>Strategy</th><th>Trades</th><th>Win%</th><th>Net P&L</th><th>Avg R:R</th></tr></thead>
                    <tbody>
                      {playbookRows.map(r => (
                        <tr key={r.setup}>
                          <td>{r.setup}</td>
                          <td>{r.trades}</td>
                          <td>{fp(r.winRate)}</td>
                          <td className={r.pnl >= 0 ? "bt-os-td-pos" : "bt-os-td-neg"}>{fm(r.pnl)}</td>
                          <td>{r.avgRr.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recent trades */}
              <div className="bt-os-chart-card">
                <div className="bt-os-chart-title">Recent trades (last {recent.length})</div>
                <div className="bt-os-table-wrap">
                  <table>
                    <thead>
                      <tr><th>Instrument</th><th>Direction</th><th>Strategy</th><th>P&amp;L</th><th>R:R</th><th>Closed</th></tr>
                    </thead>
                    <tbody>
                      {recent.map(t => (
                        <tr key={t.id}>
                          <td>{t.ticker}</td>
                          <td style={{ color: t.direction === "LONG" ? "#22c55e" : "#ef4444" }}>{t.direction}</td>
                          <td style={{ color: "#9ca3af" }}>{t.setup}</td>
                          <td className={t.pnl >= 0 ? "bt-os-td-pos" : "bt-os-td-neg"}>{fm(t.pnl)}</td>
                          <td>{t.rr.toFixed(2)}</td>
                          <td style={{ color: "#6b7280" }}>{t.closeTs > 0 ? new Date(t.closeTs).toISOString().slice(0, 10) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          }
        />
      )}
    </div>
  );
}
