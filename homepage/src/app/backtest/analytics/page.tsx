"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export default function LegacyBacktestAnalyticsRedirect() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const q = searchParams?.toString() ?? "";
    window.location.replace(q ? `/dashboard/backtest/analytics/?${q}` : "/dashboard/backtest/analytics/");
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
