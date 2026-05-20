import type { Metadata } from "next";
import { Suspense } from "react";
import { MarketingFaqSection } from "@/components/seo/MarketingFaqSection";
import { buildBilingualPageMetadata } from "@/lib/marketingSeo";
import PricingClient from "./PricingClient";

export const metadata: Metadata = buildBilingualPageMetadata({
  titleEn: "Plans & Pricing",
  titleAr: "الخطط والأسعار",
  descriptionEn:
    "Compare Talaria-Log plans for backtesting, trading journal, and session analytics.",
  descriptionAr:
    "قارن خطط تالاريا-لوج للباك تست ودفتر التداول وتحليل الجلسات.",
  path: "/pricing/",
  openGraphPath: "/pricing/",
});

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
