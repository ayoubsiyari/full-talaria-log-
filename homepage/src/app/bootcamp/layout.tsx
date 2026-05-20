import type { Metadata } from "next";
import BootcampAuthGate from "./BootcampAuthGate";

export const metadata: Metadata = {
  title: "Trading Bootcamp",
  description:
    "Structured trading bootcamp with live sessions, reviews, and practice — part of Talaria-Log.",
  alternates: { canonical: "/bootcamp/" },
  openGraph: {
    title: "Trading Bootcamp | Talaria-Log",
    description:
      "Structured trading bootcamp with live sessions, reviews, and practice.",
    url: "/bootcamp/",
  },
};

export default function BootcampLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <BootcampAuthGate>{children}</BootcampAuthGate>;
}
