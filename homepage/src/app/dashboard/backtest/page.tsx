import { Suspense } from "react";
import { V16DashboardViewRedirect } from "../v16/V16DashboardViewRedirect";

export default function DashboardBacktestPage() {
  return (
    <Suspense fallback={null}>
      <V16DashboardViewRedirect view="sessions" />
    </Suspense>
  );
}
