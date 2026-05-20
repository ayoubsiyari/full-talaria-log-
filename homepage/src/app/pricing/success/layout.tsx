import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Subscription confirmed",
  description: "Your Talaria-Log subscription checkout confirmation.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/pricing/success/" },
};

export default function PricingSuccessLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
