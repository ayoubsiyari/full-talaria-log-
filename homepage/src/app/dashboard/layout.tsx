"use client";

import React from "react";
import { useLanguage } from "../LanguageProvider";

type User = {
  id: number;
  name: string;
  email: string;
  role: string;
};

async function fetchMe(): Promise<User> {
  const res = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
  if (!res.ok) {
    throw new Error("not_authenticated");
  }
  const data = (await res.json()) as { user: User };
  return data.user;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isArabic } = useLanguage();
  const [user, setUser] = React.useState<User | null>(null);

  React.useEffect(() => {
    fetchMe()
      .then((u) => setUser(u))
      .catch(() => {
        window.location.href = "/login/";
      });
  }, []);

  const nav = isArabic
    ? {
        sessions: "الجلسات",
        journal: "سجل التداول",
        backtest: "باكتيست",
        admin: "لوحة الإدارة",
        logout: "تسجيل الخروج",
      }
    : {
        sessions: "Sessions",
        journal: "Journal",
        backtest: "Backtest",
        admin: "Admin",
        logout: "Logout",
      };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.12),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(139,92,246,0.10),transparent_55%)]" />
      </div>

      <header className="sticky top-0 z-[100] border-b border-white/10 bg-[#0b0b16]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <a href="/" className="flex items-center gap-3">
            <img src="/logo-08.png" alt="Talaria Log" className="h-9 w-9" />
            <div className="leading-tight">
              <div className="text-sm font-semibold">Talaria Log</div>
              <div className="text-xs text-white/60">{user ? user.email : ""}</div>
            </div>
          </a>

          <nav className={"flex items-center gap-2 text-sm " + (isArabic ? "flex-row-reverse" : "")}> 
            <a href="/dashboard/" className="rounded-full border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10 transition">
              {nav.sessions}
            </a>
            <a href="/chart/index.html" className="rounded-full border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10 transition">
              {nav.backtest}
            </a>
            <a href="#" className="rounded-full border border-white/10 bg-white/5 px-3 py-2 opacity-60 cursor-not-allowed">
              {nav.journal}
            </a>
            {user?.role === "admin" ? (
              <a href="/dashboard/admin/users/" className="rounded-full border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10 transition">
                {nav.admin}
              </a>
            ) : null}
            <button
              type="button"
              onClick={async () => {
                try {
                  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
                } catch {}
                window.location.href = "/login/";
              }}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10 transition"
            >
              {nav.logout}
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
