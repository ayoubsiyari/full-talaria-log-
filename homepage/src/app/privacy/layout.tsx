import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Talaria-Log privacy policy — how we collect, use, and protect your data.",
  alternates: { canonical: "/privacy/" },
};

export default function PrivacyLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
