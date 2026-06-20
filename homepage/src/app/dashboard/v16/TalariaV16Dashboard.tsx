"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useEffect, useLayoutEffect } from "react";
import { useBacktestNewSession } from "../BacktestNewSessionContext";
import { primeV16EmbeddedShell } from "./v16EmptyBoot";
import { useV16LiveBootstrap } from "./useV16LiveBootstrap";
import { normalizeV16DashboardView } from "./v16DashboardRoutes";
import { V16ProfilePortal } from "./V16ProfilePortal";

const TalariaV16 = dynamic(() => import("talaria-handoff/TalariaV16.jsx"), {
  ssr: false,
  loading: () => null,
});

export default function TalariaV16Dashboard() {
  const boot = useV16LiveBootstrap();
  const { registerOnSaved } = useBacktestNewSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useLayoutEffect(() => {
    primeV16EmbeddedShell();
  }, []);

  useEffect(() => {
    return registerOnSaved(() => {
      window.dispatchEvent(new CustomEvent("talaria-v16-reload-boot"));
    });
  }, [registerOnSaved]);

  useEffect(() => {
    window.__TALARIA_V16_SYNC_SESSION_URL__ = (sessionId) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("sessionId", String(sessionId));
      const base = pathname.endsWith("/") ? pathname : `${pathname}/`;
      router.replace(`${base}?${params.toString()}`, { scroll: false });
    };
    window.__TALARIA_V16_SYNC_VIEW_URL__ = (view) => {
      const normalized = normalizeV16DashboardView(view) || "dashboard";
      const params = new URLSearchParams(searchParams.toString());
      if (normalized === "dashboard") {
        params.delete("view");
        params.delete("tab");
        params.delete("thread");
        params.delete("topic");
      } else if (normalized === "profile") {
        params.set("view", "profile");
      } else {
        params.set("view", normalized);
        params.delete("tab");
        params.delete("thread");
        params.delete("topic");
      }
      const base = pathname.endsWith("/") ? pathname : `${pathname}/`;
      const qs = params.toString();
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    };
    window.__TALARIA_V16_OPEN_PROFILE__ = (tab) => {
      const tabMap: Record<string, string> = {
        account: "profile",
        billing: "subscription",
        security: "security",
        support: "support",
      };
      const raw = tab ? tabMap[tab] || tab : undefined;
      const valid = new Set(["profile", "security", "subscription", "support"]);
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", "profile");
      if (raw && valid.has(raw) && raw !== "profile") params.set("tab", raw);
      else {
        params.delete("tab");
        params.delete("thread");
        params.delete("topic");
      }
      router.replace(`/dashboard/?${params.toString()}`, { scroll: false });
    };
    return () => {
      delete window.__TALARIA_V16_SYNC_SESSION_URL__;
      delete window.__TALARIA_V16_SYNC_VIEW_URL__;
      delete window.__TALARIA_V16_OPEN_PROFILE__;
    };
  }, [pathname, router, searchParams]);

  useEffect(() => {
    const view = normalizeV16DashboardView(searchParams.get("view"));
    if (!view) return;
    window.dispatchEvent(new CustomEvent("talaria-v16-set-view", { detail: { view } }));
  }, [searchParams]);

  const v16View = normalizeV16DashboardView(searchParams.get("view"));
  const profileActive = v16View === "profile";

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
      {boot.status === "error" ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            background: "rgba(7,8,14,0.92)",
            color: "#ff8a9a",
            fontFamily: "'Exo 2', sans-serif",
            fontSize: 13,
            textAlign: "center",
          }}
        >
          Could not load dashboard data: {boot.message}
        </div>
      ) : null}
      <V16ProfilePortal active={profileActive} />
      <TalariaV16 key="v16-embedded" />
    </div>
  );
}
