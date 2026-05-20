import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create account",
  description: "Register for Talaria-Log — backtesting, journal, and session analytics.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/register/" },
};

export default function RegisterLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
