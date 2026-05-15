"use client";

import { useEffect } from "react";

export default function StrategiesLabLegacyRedirect() {
  useEffect(() => {
    window.location.replace("/dashboard/strategies/");
  }, []);

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
