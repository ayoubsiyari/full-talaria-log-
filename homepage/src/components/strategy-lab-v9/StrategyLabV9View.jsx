"use client";

import dynamic from "next/dynamic";

const TalariaV8b = dynamic(() => import("../strategy-lab/strategyV8"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#07080E",
        color: "rgba(255,255,255,0.45)",
        fontFamily: "'Exo 2', system-ui, sans-serif",
        fontSize: 14,
      }}
    >
      Loading Strategy Lab V9…
    </div>
  ),
});

/**
 * Full V8 shell opened on the **Strategies** workspace. Strategy canvas / wizard UI
 * lives in `strategy-lab-v9/strategyBuilderModule.jsx` (split from `strategyV8.jsx`).
 */
export default function StrategyLabV9View() {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 0 }}>
      <TalariaV8b initialSessView="stratbank" />
    </div>
  );
}
