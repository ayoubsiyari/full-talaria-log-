"use client";

import React, { useEffect, useMemo } from "react";

const TALARIA_V16_IFRAME_SRC =
  process.env.NEXT_PUBLIC_TALARIA_V16_IFRAME_SRC || "/talaria-v16-design/index.html";

function iframeSrcForEnv(base: string) {
  if (process.env.NODE_ENV !== "development") return base;
  if (/^https?:\/\//i.test(base)) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}_devcb=${Date.now()}`;
}

/** Full-screen preview of `Sources Handoff/TalariaV16.jsx` (handoff dashboard mock). */
export default function TalariaV16HandoffPreviewPage() {
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
          user?: { role?: string };
        } | null;
        if (mounted && body?.user?.role !== "admin") {
          window.location.href = "/dashboard/";
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

  const iframeSrc = useMemo(() => iframeSrcForEnv(TALARIA_V16_IFRAME_SRC), []);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#07080E] m-0 p-0" dir="ltr" lang="en">
      <iframe
        title="Talaria V16 handoff dashboard"
        src={iframeSrc}
        className="h-[100dvh] w-full flex-1 shrink-0 border-0"
      />
    </div>
  );
}
