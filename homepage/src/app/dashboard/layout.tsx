"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { useLanguage } from "../LanguageProvider";
import "./dashboard-shell.css";

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
        strategiesLab: "المختبر",
        cot: "COT",
        admin: "لوحة الإدارة",
        logout: "تسجيل الخروج",
      }
    : {
        sessions: "Sessions",
        journal: "Journal",
        backtest: "Backtest",
        strategiesLab: "Strategies Lab",
        cot: "COT",
        admin: "Admin",
        logout: "Logout",
      };

  const pathname = usePathname() || "";
  const navClass = "db-nav " + (isArabic ? "flex-row-reverse" : "");

  function navLinkClass(href: string): string {
    const p = pathname.replace(/\/$/, "") || "/";
    const h = href.replace(/\/$/, "");
    const active =
      p === h ||
      (h === "/journal/dashboard" && p.startsWith("/journal/dashboard")) ||
      (h === "/dashboard/cot" && p.startsWith("/dashboard/cot"));
    return "db-nav-link" + (active ? " db-nav-link--active" : "");
  }

  return (
    <div className={`db-layout min-h-screen ${isArabic ? "rtl" : "ltr"}`} dir={isArabic ? "rtl" : "ltr"}>
      <header className="db-topbar">
        <a href="/" className="db-brand">
          <div className="db-brand-mark">
            <img src="/logo-08.png" alt="" width={22} height={22} />
          </div>
          <div className="min-w-0">
            <div className="db-brand-title">Talaria Log</div>
            <div className="db-brand-email">{user ? user.email : " "}</div>
          </div>
        </a>

        <nav className={navClass}>
          {[
            { label: nav.sessions, href: "/backtest/" },
            { label: nav.backtest, href: "/chart/index.html" },
            { label: nav.strategiesLab, href: "/strategies-lab/" },
            { label: nav.cot, href: "/dashboard/cot/" },
            { label: nav.journal, href: "/journal/dashboard" },
          ].map((item) => (
            <a key={item.href} href={item.href} className={navLinkClass(item.href)}>
              {item.label}
            </a>
          ))}
          {user?.role === "admin" && (
            <a href="/dashboard/admin/" className={navLinkClass("/dashboard/admin/")}>
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
              } catch {
                /* ignore */
              }
              localStorage.removeItem("token");
              localStorage.removeItem("refresh_token");
              localStorage.removeItem("talaria_current_user");
              localStorage.removeItem("is_admin");
              window.location.href = "/login/";
            }}
            className="db-nav-link db-nav-link--logout"
          >
            {nav.logout}
          </button>
        </nav>
      </header>

      <main className="db-main-wrap">{children}</main>
    </div>
  );
}
