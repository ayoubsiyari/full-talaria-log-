import type { Metadata } from "next";
import { exo2 } from "@/lib/fonts";

export const metadata: Metadata = {
  robots: { index: true, follow: true },
};

export default function PricingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className={`${exo2.variable} ${exo2.className}`}>{children}</div>;
}
