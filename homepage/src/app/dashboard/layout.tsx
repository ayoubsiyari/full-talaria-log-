import type { Metadata } from "next";
import DashboardShell from "./DashboardShell";
import { exo2 } from "@/lib/fonts";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Dashboard",
};

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className={`${exo2.variable} ${exo2.className}`} style={{ height: "100%" }}>
      <DashboardShell>{children}</DashboardShell>
    </div>
  );
}
