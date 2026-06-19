import { Suspense } from "react";
import TalariaV16Dashboard from "./v16/TalariaV16Dashboard";

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div
          className="bt-os-dashboard"
          style={{ fontFamily: "'Exo 2', sans-serif", padding: 24, color: "rgba(255,255,255,0.6)" }}
        >
          Loading dashboard…
        </div>
      }
    >
      <TalariaV16Dashboard />
    </Suspense>
  );
}
