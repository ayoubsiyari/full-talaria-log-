import { Suspense } from "react";
import TalariaV16Dashboard from "./v16/TalariaV16Dashboard";
import V16DashboardLoading from "./v16/V16DashboardLoading";

export default function DashboardPage() {
  return (
    <Suspense fallback={<V16DashboardLoading />}>
      <TalariaV16Dashboard />
    </Suspense>
  );
}
