"use client";

import { useOptionalStrategyLabV9OpenBuilderRegister } from "@/app/dashboard/StrategyLabV9BuilderContext";
import StrategyLabV9BankApp from "./strategyLabV9BankApp.jsx";

/**
 * Self-contained strategy bank + builder under `strategy-lab-v9/` (no `strategyV8.jsx` shell).
 * Dashboard layout exposes **New Strategy** in the top bar via register callback.
 */
export default function StrategyLabV9View() {
  const registerDashboardOpenBuilder = useOptionalStrategyLabV9OpenBuilderRegister();
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 0 }}>
      <StrategyLabV9BankApp
        registerDashboardOpenBuilder={registerDashboardOpenBuilder ?? undefined}
      />
    </div>
  );
}
