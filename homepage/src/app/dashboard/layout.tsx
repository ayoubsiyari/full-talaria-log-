import type { Metadata } from "next";
import DashboardShell from "./DashboardShell";
import { exo2 } from "@/lib/fonts";
import "@/styles/obsidian/chrome-tokens.css";
import "@/styles/obsidian/chrome-kit.css";
import "@/styles/obsidian/obsidian-product.css";

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
    <div
      data-v9-app="1"
      data-v9-chrome="1"
      data-chrome-theme="dark"
      data-chrome-preset="1"
      className={`${exo2.variable}`}
      style={{ height: "100%", fontFamily: "var(--font-ui)" }}
    >
      <DashboardShell>{children}</DashboardShell>
    </div>
  );
}
