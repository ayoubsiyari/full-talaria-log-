import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NinjaTrader Integration",
  description:
    "Connect NinjaTrader with Talaria-Log for backtesting and professional trading workflows.",
  alternates: { canonical: "/ninjatrader/" },
  openGraph: {
    title: "NinjaTrader Integration | Talaria-Log",
    description: "Connect NinjaTrader with Talaria-Log for backtesting and charting.",
    url: "/ninjatrader/",
  },
};

export default function NinjaTraderLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
