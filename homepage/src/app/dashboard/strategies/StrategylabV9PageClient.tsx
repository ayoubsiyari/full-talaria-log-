"use client";

import { useOptionalStrategyLabV9OpenBuilderRegister } from "@/app/dashboard/strategies/StrategyLabV9BuilderContext";
import StrategyLabV9BankApp from "@/app/dashboard/strategies/components/strategyLabV9BankApp.jsx";

/**
 * Dashboard route client for Lab V9: wires shell context and delegates UI to `StrategyLabV9BankApp`.
 * Data fetching lives in `useStrategyLabV9Data` (Journal strategies + chart sessions).
 */
export default function StrategylabV9PageClient() {
  const registerDashboardOpenBuilder = useOptionalStrategyLabV9OpenBuilderRegister();
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 0 }}>
      <StrategyLabV9BankApp
        registerDashboardOpenBuilder={registerDashboardOpenBuilder ?? undefined}
      />
    </div>
  );
}
