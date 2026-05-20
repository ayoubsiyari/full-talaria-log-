import type { Metadata } from "next";
import { Suspense } from "react";
import { MarketingFaqSection } from "@/components/seo/MarketingFaqSection";
import PricingClient from "./PricingClient";

export const metadata: Metadata = {
  title: "Plans & Pricing",
  description:
    "Compare Talaria-Log plans for advanced backtesting, trading journal, and session analytics.",
  alternates: { canonical: "/pricing/" },
  openGraph: {
    title: "Plans & Pricing | Talaria-Log",
    description:
      "Compare plans for backtesting, journal, and professional charting.",
    url: "/pricing/",
  },
};

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
      <MarketingFaqSection variant="pricing" />
    </Suspense>
  );
}
