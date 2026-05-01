"use client";

import React, { useEffect } from "react";

/**
 * Full-screen chart embed.
 *
 * `/talaria-v8b-design/` is the **minimal** Vite build (React only — no chart.js, no economic calendar).
 * For the **full V9 live** chart + Finnhub calendar + markers, the iframe must load the **`build:live`**
 * output (`chart/dist-v9/`), copied under `public/chart/dist-v9/` so this resolves to `/chart/dist-v9/index.html`.
 *
 * Override with `NEXT_PUBLIC_TALARIA_V9_IFRAME_SRC` (e.g. `https://your-api-host/chart/index.html`).
 */
const TALARIA_V9_IFRAME_SRC =
  process.env.NEXT_PUBLIC_TALARIA_V9_IFRAME_SRC || "/chart/dist-v9/index.html";

export default function BacktestDesignDemoPage() {
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
          user?: { role?: string; has_journal_access?: boolean };
        } | null;
        if (mounted) {
          const role = body?.user?.role;
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

  useEffect(() => {
    const html = document.documentElement;
    const prevHtml = html.style.overflow;
    const prevBody = document.body.style.overflow;
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#07080E] m-0 p-0" dir="ltr" lang="en">
      
      <iframe
        title="Talaria V9 live chart"
        src={TALARIA_V9_IFRAME_SRC}
        className="h-[100dvh] w-full flex-1 shrink-0 border-0"
      />
    </div>
  );
}
