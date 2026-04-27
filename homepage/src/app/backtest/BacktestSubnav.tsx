"use client";

import React, { useEffect, useState } from "react";

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

export type BacktestSubnavActive = "sessions" | "analytics" | "design";

export function BacktestSubnav({
  active,
  sessionId,
}: {
  active: BacktestSubnavActive;
  /** When set (e.g. on Analytics page), Analytics link keeps this session in the URL. */
  sessionId?: string;
}) {
  const [suffix, setSuffix] = useState(() =>
    sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""
  );

  useEffect(() => {
    if (sessionId) {
      setSuffix(`?sessionId=${encodeURIComponent(sessionId)}`);
      return;
    }
    try {
      const sid = new URLSearchParams(window.location.search).get("sessionId");
      if (sid) {
        setSuffix(`?sessionId=${encodeURIComponent(sid)}`);
        return;
      }
    } catch {
      /* ignore */
    }
    const a = readActiveTradingSessionIdFromBrowser();
    setSuffix(a ? `?sessionId=${encodeURIComponent(a)}` : "");
  }, [sessionId]);

  const analyticsHref = `/backtest/analytics${suffix}`;

  return (
    <nav className="sd-subnav" aria-label="Backtest sections">
      <a
        href="/backtest"
        className={`sd-subnav-link ${active === "sessions" ? "sd-subnav-link--active" : ""}`}
      >
        Sessions
      </a>
      <a
        href={analyticsHref}
        className={`sd-subnav-link ${active === "analytics" ? "sd-subnav-link--active" : ""}`}
      >
        Analytics
      </a>
      <a
        href="/backtest/design/"
        className={`sd-subnav-link ${active === "design" ? "sd-subnav-link--active" : ""}`}
      >
        UI design (V8b)
      </a>
    </nav>
  );
}
