import { Suspense } from "react";
import { V16DashboardViewRedirect } from "../v16/V16DashboardViewRedirect";

export default function DashboardTradesPage() {
  return (
    <Suspense fallback={null}>
      <V16DashboardViewRedirect view="trades" />
    </Suspense>
  );
}
