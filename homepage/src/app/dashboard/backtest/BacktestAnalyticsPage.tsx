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

export default function BacktestAnalyticsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [compareMode, setCompareMode] = useState(false);
  const [compareLeft, setCompareLeft] = useState("");
  const [compareRight, setCompareRight] = useState("");

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
