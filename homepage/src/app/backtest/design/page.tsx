"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

function LegacyBacktestDesignRedirectInner() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const q = searchParams?.toString() ?? "";
    window.location.replace(q ? `/dashboard/backtest/design/?${q}` : "/dashboard/backtest/design/");
  }, [searchParams]);

  return (
    <div
      style={{
        padding: 24,
        fontFamily: "system-ui, sans-serif",
        color: "#e5e7eb",
        background: "#07080e",
        minHeight: "100vh",
      }}
    >
      Redirecting…
    </div>
  );
}

export default function LegacyBacktestDesignRedirect() {
  return (
    <Suspense fallback={<div style={{ padding: 24, color: "#e5e7eb", background: "#07080e", minHeight: "100vh" }}>Redirecting…</div>}>
      <LegacyBacktestDesignRedirectInner />
    </Suspense>
  );
}
