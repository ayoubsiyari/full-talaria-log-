import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Disclaimer",
  description: "Risk disclaimer and limitations for Talaria-Log trading tools and data.",
  alternates: { canonical: "/disclaimer/" },
};

export default function DisclaimerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
