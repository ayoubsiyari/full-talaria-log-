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
  const res = await fetch("/api/auth/me", {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) throw new Error("not_authenticated");
  const data = (await res.json()) as { user: User };
  return data.user;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isArabic } = useLanguage();
  const [user, setUser] = React.useState<User | null>(null);

  React.useEffect(() => {
    fetchMe()
      .then((u) => setUser(u))
      .catch(() => {
        const target = `${window.location.pathname}${window.location.search || ""}`;
        window.location.href = `/login/?next=${encodeURIComponent(target)}`;
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
    <div className="min-h-screen bg-[#060611] text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.06),transparent_50%)]" />
      </div>

      <header className="sticky top-0 z-[100] border-b border-white/[0.06] bg-[#060611]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <a href="/" className="flex items-center gap-3">
            <img src="/logo-08.png" alt="Talaria Log" className="h-8 w-8" />
            <div className="leading-tight">
              <div className="text-sm font-semibold text-white/80">
                Talaria Log
              </div>
              <div className="text-[11px] text-white/25">
                {user ? user.email : ""}
              </div>
            </div>
          </a>

          <nav
            className={
              "flex items-center gap-1.5 text-[12px] " +
              (isArabic ? "flex-row-reverse" : "")
            }
          >
            {[
              { label: nav.sessions, href: "/backtest/" },
              {
                label: nav.backtest,
                href: "/chart/index.html",
              },
              { label: nav.journal, href: "/journal/dashboard" },
            ].map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-white/40 hover:text-white/70 hover:bg-white/[0.05] hover:border-white/[0.10] transition-all"
              >
                {item.label}
              </a>
            ))}
            {user?.role === "admin" && (
              <a
                href="/dashboard/admin/"
                className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-white/40 hover:text-white/70 hover:bg-white/[0.05] hover:border-white/[0.10] transition-all"
              >
                {nav.admin}
              </a>
            )}
            <button
              type="button"
              onClick={async () => {
                try {
                  await fetch("/api/auth/logout", {
                    method: "POST",
                    credentials: "include",
                  });
                } catch {}
                localStorage.removeItem("token");
                localStorage.removeItem("refresh_token");
                localStorage.removeItem("talaria_current_user");
                localStorage.removeItem("is_admin");
                window.location.href = "/login/";
              }}
              className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-red-400/50 hover:text-red-400 hover:bg-red-500/5 hover:border-red-500/10 transition-all"
            >
              {nav.logout}
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}
