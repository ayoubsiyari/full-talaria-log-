"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useEffect, useLayoutEffect, useState } from "react";
import { useBacktestNewSession } from "../BacktestNewSessionContext";
import { primeV16EmbeddedShell } from "./v16EmptyBoot";
import { useV16LiveBootstrap } from "./useV16LiveBootstrap";

const TalariaV16 = dynamic(() => import("talaria-handoff/TalariaV16.jsx"), {
  ssr: false,
  loading: () => null,
});

function V16DashLoadingSpinner() {
  return (
    <>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            border: "2px solid rgba(140,160,255,0.20)",
            borderTopColor: "#6b8cff",
            borderRightColor: "rgba(0,212,161,0.75)",
            boxShadow: "0 0 18px rgba(107,140,255,0.13)",
            animation: "tlrV16DashLoadRotate 0.82s linear infinite",
          }}
        />
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#8892b0",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontFamily: "'Exo 2', sans-serif",
          }}
        >
          Loading data...
        </div>
      </div>
      <style>{`@keyframes tlrV16DashLoadRotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

export default function TalariaV16Dashboard() {
  const boot = useV16LiveBootstrap();
  const { registerOnSaved } = useBacktestNewSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [bootOverlay, setBootOverlay] = useState(
    () => typeof window !== "undefined" && !!window.__TALARIA_V16_BOOT_LOADING__
  );

  useLayoutEffect(() => {
    primeV16EmbeddedShell();
  }, []);

  useEffect(() => {
    return registerOnSaved(() => {
      window.dispatchEvent(new CustomEvent("talaria-v16-reload-boot"));
    });
  }, [registerOnSaved]);

  useEffect(() => {
    const sync = () => setBootOverlay(!!window.__TALARIA_V16_BOOT_LOADING__);
    sync();
    window.addEventListener("talaria-v16-boot-updated", sync);
    return () => window.removeEventListener("talaria-v16-boot-updated", sync);
  }, []);

  useEffect(() => {
    if (boot.status === "ready" && !window.__TALARIA_V16_BOOT_LOADING__) {
      setBootOverlay(false);
    }
  }, [boot.status]);

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
      {bootOverlay ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(7,8,14,0.72)",
            backdropFilter: "blur(2px)",
          }}
        >
          <V16DashLoadingSpinner />
        </div>
      ) : null}
      <TalariaV16 key="v16-embedded" />
    </div>
  );
}
