import type { Metadata } from "next";
import BootcampAuthGate from "./BootcampAuthGate";
import { buildBilingualPageMetadata } from "@/lib/marketingSeo";

export const metadata: Metadata = buildBilingualPageMetadata({
  titleEn: "Trading Bootcamp",
  titleAr: "معسكر التداول",
  descriptionEn:
    "Structured trading bootcamp with live sessions, reviews, and practice — part of Talaria-Log.",
  descriptionAr:
    "معسكر تداول منظم مع جلسات مباشرة ومراجعات وتدريب عملي — ضمن تالاريا-لوج.",
  path: "/bootcamp/",
  openGraphPath: "/bootcamp/",
});

export default function BootcampLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <BootcampAuthGate>{children}</BootcampAuthGate>;
}
