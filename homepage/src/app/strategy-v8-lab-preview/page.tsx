"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

/**
 * Loads `components/strategy-lab/strategyV8.jsx` (default export `TalariaV8b`) for local evaluation.
 * This bundle is not used by `/dashboard/strategies/` (Strategies Lab uses StrategiesLabPage + StrategyWizard).
 */
const TalariaV8bFromStrategyLab = dynamic(
  () => import("@/components/strategy-lab/strategyV8"),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#07080E",
          color: "rgba(255,255,255,0.55)",
          fontFamily: "system-ui, sans-serif",
          fontSize: 14,
        }}
      >
        Loading strategyV8 preview…
      </div>
    ),
  },
);

export default function StrategyV8LabPreviewPage() {
  return (
    <div style={{ position: "relative", minHeight: "100vh", background: "#000" }}>
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 2147483000,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "8px 14px",
          fontSize: 12,
          fontFamily: "system-ui, sans-serif",
          background: "rgba(15,17,25,0.92)",
          borderBottom: "1px solid rgba(140,160,255,0.2)",
          color: "rgba(255,255,255,0.85)",
        }}
      >
        <span>
          <strong>Preview</strong> — <code style={{ fontSize: 11 }}>strategy-lab/strategyV8.jsx</code> (TalariaV8b). Not the same as{" "}
          <Link href="/dashboard/strategies/" style={{ color: "#8aa4ff" }}>
            Strategies Lab
          </Link>
          .
        </span>
        <Link href="/dashboard/strategies/" style={{ color: "#8aa4ff", whiteSpace: "nowrap" }}>
          ← Strategies Lab
        </Link>
      </div>
      <div style={{ position: "fixed", top: 40, left: 0, right: 0, bottom: 0 }}>
        <TalariaV8bFromStrategyLab />
      </div>
    </div>
  );
}
