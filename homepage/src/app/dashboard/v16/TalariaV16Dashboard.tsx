"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useEffect } from "react";
import { useV16LiveBootstrap } from "./useV16LiveBootstrap";

const TalariaV16 = dynamic(() => import("talaria-handoff/TalariaV16.jsx"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "rgba(255,255,255,0.55)",
        fontFamily: "'Exo 2', sans-serif",
        fontSize: 13,
      }}
    >
      Loading dashboard…
    </div>
  ),
});

export default function TalariaV16Dashboard() {
  const boot = useV16LiveBootstrap();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    window.__TALARIA_V16_SYNC_SESSION_URL__ = (sessionId) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("sessionId", String(sessionId));
      const base = pathname.endsWith("/") ? pathname : `${pathname}/`;
      router.replace(`${base}?${params.toString()}`, { scroll: false });
    };
    return () => {
      delete window.__TALARIA_V16_SYNC_SESSION_URL__;
    };
  }, [pathname, router, searchParams]);

  if (boot.status === "loading") {
    return (
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(255,255,255,0.55)",
          fontFamily: "'Exo 2', sans-serif",
          fontSize: 13,
        }}
      >
        Loading sessions and trades…
      </div>
    );
  }

  if (boot.status === "error") {
    return (
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          color: "#ff8a9a",
          fontFamily: "'Exo 2', sans-serif",
          fontSize: 13,
          textAlign: "center",
        }}
      >
        Could not load dashboard data: {boot.message}
      </div>
    );
  }

  return (
    <div
      className="talaria-v16-dashboard-embed"
      style={{
        position: "relative",
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <TalariaV16 key={String(boot.boot.openSessionId ?? "default")} />
    </div>
  );
}
