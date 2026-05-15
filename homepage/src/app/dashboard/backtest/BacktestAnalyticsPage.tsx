"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Space_Mono } from "next/font/google";
import "./sessions-dashboard.css";
import "./backtest-os-dashboard.css";
import {
  SessionAnalyticsPanel,
  fetchJson,
  readActiveTradingSessionIdFromBrowser,
  type Session,
} from "./SessionAnalyticsPanel";

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
});

/** Matches `/api/sessions/kpis` payload (see BacktestView). */
type SessionKpis = {
  trades: number;
  win_rate: number | null;
  net_pnl: number;
  expectancy_r: number | null;
  start_balance: number | null;
};

function winRateAsFrac(w: number | null | undefined): number | null {
  if (w == null || Number.isNaN(Number(w))) return null;
  return w > 1 ? w / 100 : w;
}

function fmtWinRate(w: number | null | undefined): string {
  const f = winRateAsFrac(w);
  if (f == null) return "—";
  return `${Math.round(f * 100)}%`;
}

function fmtMoney(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}$${Math.abs(n).toLocaleString()}`;
}

function fmtExpectancyR(r: number | null): string {
  if (r == null || Number.isNaN(r)) return "—";
  const sign = r >= 0 ? "+" : "";
  return `${sign}${r.toFixed(2)}R`;
}

function sessionShortLabel(sessions: Session[], id: string): string {
  const s = sessions.find((x) => String(x.id) === String(id));
  return (s?.name && s.name.trim()) || `Session ${id}`;
}

function winnerForNumber(a: number, b: number, eps = 1e-9): "a" | "b" | "tie" {
  if (Math.abs(a - b) < eps) return "tie";
  return a > b ? "a" : "b";
}

function defaultKpis(): SessionKpis {
  return {
    trades: 0,
    win_rate: null,
    net_pnl: 0,
    expectancy_r: null,
    start_balance: null,
  };
}

function parseKpisMap(raw: Record<string, SessionKpis> | undefined): Record<number, SessionKpis> {
  const map: Record<number, SessionKpis> = {};
  if (!raw || typeof raw !== "object") return map;
  Object.entries(raw).forEach(([id, k]) => {
    const n = Number(id);
    if (Number.isFinite(n) && k && typeof k === "object") map[n] = k;
  });
  return map;
}

function CompareResultStrip({
  sessions,
  leftId,
  rightId,
  kpisMap,
  loading,
  error,
}: {
  sessions: Session[];
  leftId: string;
  rightId: string;
  kpisMap: Record<number, SessionKpis>;
  loading: boolean;
  error: string | null;
}) {
  const same = Boolean(leftId && rightId && String(leftId) === String(rightId));
  const lid = Number(leftId);
  const rid = Number(rightId);
  const kL = Number.isFinite(lid) ? kpisMap[lid] : undefined;
  const kR = Number.isFinite(rid) ? kpisMap[rid] : undefined;
  const a = kL ?? defaultKpis();
  const b = kR ?? defaultKpis();

  const wrA = winRateAsFrac(a.win_rate);
  const wrB = winRateAsFrac(b.win_rate);

  const netW = winnerForNumber(a.net_pnl, b.net_pnl);
  const wrW = wrA != null && wrB != null ? winnerForNumber(wrA, wrB) : "tie";
  const expW =
    a.expectancy_r != null && b.expectancy_r != null && !Number.isNaN(a.expectancy_r) && !Number.isNaN(b.expectancy_r)
      ? winnerForNumber(a.expectancy_r, b.expectancy_r)
      : "tie";

  let scoreA = 0;
  let scoreB = 0;
  if (netW === "a") scoreA++;
  else if (netW === "b") scoreB++;
  if (wrW === "a") scoreA++;
  else if (wrW === "b") scoreB++;
  if (expW === "a") scoreA++;
  else if (expW === "b") scoreB++;

  let overall: "a" | "b" | "tie";
  if (scoreA > scoreB) overall = "a";
  else if (scoreB > scoreA) overall = "b";
  else overall = netW;

  const labelA = sessionShortLabel(sessions, leftId);
  const labelB = sessionShortLabel(sessions, rightId);

  if (same) {
    return (
      <aside className="bt-os-compare-verdict" aria-label="Compare result">
        <div className="bt-os-compare-verdict-kicker">Compare result</div>
        <p className="bt-os-compare-verdict-same">Same session in A and B. Pick a different session in one column to compare.</p>
      </aside>
    );
  }

  if (error) {
    return (
      <aside className="bt-os-compare-verdict" aria-label="Compare result">
        <div className="bt-os-compare-verdict-kicker">Compare result</div>
        <p className="bt-os-compare-verdict-error">{error}</p>
      </aside>
    );
  }

  if (loading) {
    return (
      <aside className="bt-os-compare-verdict bt-os-compare-verdict--loading" aria-label="Compare result">
        <div className="bt-os-compare-verdict-kicker">Compare result</div>
        <p className="bt-os-compare-verdict-loading">Loading KPI snapshot…</p>
      </aside>
    );
  }

  const headline =
    overall === "a"
      ? `Column A ahead (${labelA})`
      : overall === "b"
        ? `Column B ahead (${labelB})`
        : `Even on headline metrics (${labelA} vs ${labelB})`;

  return (
    <aside className="bt-os-compare-verdict" aria-live="polite" aria-label="Compare result">
      <div className="bt-os-compare-verdict-kicker">Compare result</div>
      <div className={`bt-os-compare-verdict-callout bt-os-compare-verdict-callout--${overall}`}>
        <span className="bt-os-compare-verdict-callout-main">{headline}</span>
        <span className="bt-os-compare-verdict-callout-sub">
          Scored on net P&amp;L, win rate, and R expectancy (only counts where both sides have values).
        </span>
      </div>

      <div className="bt-os-compare-verdict-colabels" aria-hidden>
        <span>A</span>
        <span>B</span>
      </div>
      <dl className="bt-os-compare-verdict-metrics">
        <div className="bt-os-compare-verdict-mrow">
          <dt>Net P&amp;L</dt>
          <dd className={netW === "a" ? "is-win" : undefined}>{fmtMoney(a.net_pnl)}</dd>
          <dd className={netW === "b" ? "is-win" : undefined}>{fmtMoney(b.net_pnl)}</dd>
        </div>
        <div className="bt-os-compare-verdict-mrow">
          <dt>Win rate</dt>
          <dd className={wrW === "a" ? "is-win" : undefined}>{fmtWinRate(a.win_rate)}</dd>
          <dd className={wrW === "b" ? "is-win" : undefined}>{fmtWinRate(b.win_rate)}</dd>
        </div>
        <div className="bt-os-compare-verdict-mrow">
          <dt>Expectancy</dt>
          <dd className={expW === "a" ? "is-win" : undefined}>{fmtExpectancyR(a.expectancy_r)}</dd>
          <dd className={expW === "b" ? "is-win" : undefined}>{fmtExpectancyR(b.expectancy_r)}</dd>
        </div>
        <div className="bt-os-compare-verdict-mrow bt-os-compare-verdict-mrow--info">
          <dt>Trades</dt>
          <dd>{a.trades}</dd>
          <dd>{b.trades}</dd>
        </div>
      </dl>
    </aside>
  );
}

export default function BacktestAnalyticsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [compareMode, setCompareMode] = useState(false);
  const [compareLeft, setCompareLeft] = useState("");
  const [compareRight, setCompareRight] = useState("");
  const [compareKpisMap, setCompareKpisMap] = useState<Record<number, SessionKpis>>({});
  const [compareKpisLoading, setCompareKpisLoading] = useState(false);
  const [compareKpisError, setCompareKpisError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const search = typeof window !== "undefined" ? window.location.search : "";
      const sid = new URLSearchParams(search).get("sessionId") || "";
      if (sid) {
        setSelectedSessionId(sid);
        return;
      }
      const active = readActiveTradingSessionIdFromBrowser();
      if (active) setSelectedSessionId(active);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await fetchJson<{ sessions: Session[] }>("/api/sessions");
        if (!mounted) return;
        const list = data.sessions ?? [];
        setSessions(list);
        setSelectedSessionId((prev) => {
          if (prev) return prev;
          try {
            const sid = new URLSearchParams(window.location.search).get("sessionId");
            if (sid) return sid;
          } catch {
            /* ignore */
          }
          const active = readActiveTradingSessionIdFromBrowser();
          if (active) {
            const match = list.find((s) => String(s.id) === String(active));
            if (match) return String(match.id);
            return String(active);
          }
          if (list.length > 0) return String(list[0].id);
          return prev;
        });
        setListError(null);
      } catch (e) {
        if (!mounted) return;
        setListError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const startCompare = useCallback(() => {
    const base = selectedSessionId || (sessions[0] ? String(sessions[0].id) : "");
    setCompareLeft(base);
    const other = sessions.find((s) => String(s.id) !== String(base));
    setCompareRight(other ? String(other.id) : base);
    setCompareMode(true);
  }, [selectedSessionId, sessions]);

  const exitCompare = useCallback(() => {
    setCompareMode(false);
    if (compareLeft) setSelectedSessionId(compareLeft);
  }, [compareLeft]);

  useEffect(() => {
    if (!compareMode || !compareLeft || !compareRight) return;
    const ac = new AbortController();
    let cancelled = false;
    (async () => {
      setCompareKpisLoading(true);
      setCompareKpisError(null);
      try {
        const data = await fetchJson<{ kpis_by_session_id?: Record<string, SessionKpis> }>("/api/sessions/kpis", {
          signal: ac.signal,
        });
        if (cancelled) return;
        setCompareKpisMap(parseKpisMap(data.kpis_by_session_id));
      } catch (e) {
        if (cancelled) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        setCompareKpisMap({});
        setCompareKpisError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setCompareKpisLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [compareMode, compareLeft, compareRight]);

  if (listError) {
    return (
      <div className={`${spaceMono.variable} bt-os-dashboard`} style={{ fontFamily: "'Exo 2', sans-serif" }}>
        <div className="bt-os-page-error">{listError}</div>
      </div>
    );
  }

  return (
    <div
      className={`${spaceMono.variable} bt-os-dashboard${compareMode ? " bt-os-dashboard--compare-shell" : ""}`}
      style={{ fontFamily: "'Exo 2', sans-serif" }}
    >
      {compareMode ? (
        <>
          <div className="bt-os-compare-chrome">
            <button type="button" className="bt-os-compare-exit" onClick={exitCompare}>
              Exit compare
            </button>
            <span className="bt-os-compare-hint">Pick any session in column A and column B.</span>
          </div>
          <div className="bt-os-compare-grid">
            <SessionAnalyticsPanel
              sessions={sessions}
              sessionId={compareLeft}
              onSessionIdChange={setCompareLeft}
              variant="compact"
              panelTitle="A"
            />
            <CompareResultStrip
              sessions={sessions}
              leftId={compareLeft}
              rightId={compareRight}
              kpisMap={compareKpisMap}
              loading={compareKpisLoading}
              error={compareKpisError}
            />
            <SessionAnalyticsPanel
              sessions={sessions}
              sessionId={compareRight}
              onSessionIdChange={setCompareRight}
              variant="compact"
              panelTitle="B"
            />
          </div>
        </>
      ) : (
        <SessionAnalyticsPanel
          sessions={sessions}
          sessionId={selectedSessionId}
          onSessionIdChange={setSelectedSessionId}
          variant="full"
          toolbarEnd={
            <button
              type="button"
              className="bt-os-compare-toggle"
              onClick={startCompare}
              disabled={sessions.length === 0}
              title={sessions.length < 2 ? "Add another session to compare side-by-side" : "Open two-column compare"}
            >
              Compare sessions
            </button>
          }
        />
      )}
    </div>
  );
}
