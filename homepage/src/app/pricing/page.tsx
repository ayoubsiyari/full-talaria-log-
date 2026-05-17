import { Suspense } from "react";
import PricingClient from "./PricingClient";

export default function PricingPage() {
  return (
    <Suspense
      fallback={
        <div
          className="flex min-h-screen items-center justify-center bg-[#07080E] text-sm text-white/50"
          style={{ fontFamily: "'Exo 2', sans-serif" }}
        >
          Loading…
        </div>
      }
    >
      <PricingClient />
    </Suspense>
  );
}
