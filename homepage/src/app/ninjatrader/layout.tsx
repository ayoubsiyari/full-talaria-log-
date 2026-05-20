import type { Metadata } from "next";
import { buildBilingualPageMetadata } from "@/lib/marketingSeo";

export const metadata: Metadata = buildBilingualPageMetadata({
  titleEn: "NinjaTrader Integration",
  titleAr: "تكامل نينجاتريدر",
  descriptionEn:
    "Connect NinjaTrader with Talaria-Log for backtesting and professional trading workflows.",
  descriptionAr:
    "اربط نينجاتريدر مع تالاريا-لوج للباك تست وسير عمل التداول الاحترافي.",
  path: "/ninjatrader/",
  openGraphPath: "/ninjatrader/",
});

export default function NinjaTraderLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
