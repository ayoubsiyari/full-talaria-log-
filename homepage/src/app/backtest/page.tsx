"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export default function LegacyBacktestIndexRedirect() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const q = searchParams?.toString() ?? "";
    window.location.replace(q ? `/dashboard/backtest/?${q}` : "/dashboard/backtest/");
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
