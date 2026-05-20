import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Refund Policy",
  description: "Refund and cancellation policy for Talaria-Log subscriptions.",
  alternates: { canonical: "/refunds/" },
};

export default function RefundsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
