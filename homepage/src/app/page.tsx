import type { Metadata } from "next";
import { MarketingFaqSection } from "@/components/seo/MarketingFaqSection";
import { buildBilingualPageMetadata } from "@/lib/marketingSeo";
import HomePageClient from "./HomePageClient";

export const metadata: Metadata = buildBilingualPageMetadata({
  titleEn: "Advanced Backtesting & Trading Journal",
  titleAr: "باك تست متقدم ودفتر تداول",
  descriptionEn:
    "Replay historical sessions, run backtests, and analyze performance with Talaria-Log.",
  descriptionAr:
    "أعد تشغيل الجلسات تاريخياً، نفّذ باك تست، وحلّل أداءك مع تالاريا-لوج.",
  path: "/",
});

export default function HomePage() {
  return <HomePageClient seoAppendix={<MarketingFaqSection variant="home" />} />;
}
