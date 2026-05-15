import { Suspense } from "react";
import PricingClient from "./PricingClient";

export default function PricingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#02040a] text-sm text-white/50">
          Loading…
        </div>
      }
    >
      <PricingClient />
    </Suspense>
  );
}
