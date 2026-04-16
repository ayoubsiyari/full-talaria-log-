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

type NotifRow = {
  id: number;
  title: string;
  body?: string | null;
  thread_id?: number | null;
  read_at?: string | null;
};

function DashboardNotificationBell({ isArabic }: { isArabic: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [count, setCount] = React.useState(0);
  const [items, setItems] = React.useState<NotifRow[]>([]);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=25", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        notifications?: NotifRow[];
        unread_count?: number;
      };
      setItems(data.notifications || []);
      setCount(data.unread_count ?? 0);
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    load();
    const t = setInterval(load, 25000);
    return () => clearInterval(t);
  }, [load]);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="db-nav-link"
        style={{ position: "relative" }}
        aria-label="Notifications"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
          load();
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 01-3.46 0" />
          </svg>
          Alerts
          {count > 0 ? (
            <span
              style={{
                minWidth: 18,
                height: 18,
                padding: "0 5px",
                borderRadius: 9,
                background: "#ef4444",
                color: "#fff",
                fontSize: 10,
                fontWeight: 700,
                lineHeight: "18px",
              }}
            >
              {count > 99 ? "99+" : count}
            </span>
          ) : null}
        </span>
      </button>
      {open ? (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            ...(isArabic ? { left: 0 } : { right: 0 }),
            width: 340,
            maxHeight: 380,
            overflowY: "auto",
            background: "#111318",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 10,
            boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
            zIndex: 200,
          }}
        >
          <div
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            <span>Notifications</span>
            <button
              type="button"
              className="db-btn-sm"
              style={{ padding: "4px 10px", fontSize: 10 }}
              onClick={async () => {
                await fetch("/api/notifications/read", {
                  method: "PATCH",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ all: true }),
                });
                load();
              }}
            >
              Mark all read
            </button>
          </div>
          {!items.length ? (
            <div style={{ padding: 16, fontSize: 12, color: "#4a4850" }}>No notifications</div>
          ) : (
            items.map((n) => (
              <a
                key={n.id}
                href={n.thread_id ? `/dashboard/support/?thread=${n.thread_id}` : "#"}
                onClick={async (e) => {
                  if (n.thread_id) {
                    e.preventDefault();
                    await fetch("/api/notifications/read", {
                      method: "PATCH",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ ids: [n.id] }),
                    });
                    window.location.href = `/dashboard/support/?thread=${n.thread_id}`;
                  }
                }}
                style={{
                  display: "block",
                  padding: "12px 14px",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  textDecoration: "none",
                  color: "#e8e4dc",
                  fontSize: 12,
                  borderLeft: n.read_at ? undefined : "3px solid #c8f060",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{n.title}</div>
                {n.body ? <div style={{ color: "#4a4850", fontSize: 11, lineHeight: 1.4 }}>{n.body}</div> : null}
              </a>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
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
        support: "الدعم",
        admin: "لوحة الإدارة",
        logout: "تسجيل الخروج",
      }
    : {
        sessions: "Sessions",
        journal: "Journal",
        backtest: "Backtest",
        strategiesLab: "Strategies Lab",
        cot: "COT",
        support: "Support",
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
      (h === "/dashboard/cot" && p.startsWith("/dashboard/cot")) ||
      (h === "/dashboard/support" && p.startsWith("/dashboard/support"));
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
            { label: nav.support, href: "/dashboard/support/" },
          ].map((item) => (
            <a key={item.href} href={item.href} className={navLinkClass(item.href)}>
              {item.label}
            </a>
          ))}
          <DashboardNotificationBell isArabic={isArabic} />
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

      <main
        className={
          pathname.startsWith("/dashboard/cot")
            ? "db-main-wrap db-main-wrap--full"
            : "db-main-wrap"
        }
      >
        {children}
      </main>
    </div>
  );
}
