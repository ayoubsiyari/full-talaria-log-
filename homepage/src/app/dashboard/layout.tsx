"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLanguage } from "../LanguageProvider";
import { BacktestView } from "./BacktestView";
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
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/support`);
    ws.onopen = () => {
      try {
        ws.send(JSON.stringify({ type: "subscribe_inbox" }));
      } catch {
        /* ignore */
      }
    };
    ws.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data) as { type?: string };
        if (d.type === "notification_ping") load();
      } catch {
        /* ignore */
      }
    };
    return () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    };
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

const F = "'Exo 2', sans-serif";

const VIEW_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  journal: "Journal",
  backtest: "Backtest",
  strategies: "Strategies",
  resources: "Resources",
  support: "Support",
  cot: "COT Analysis",
  admin: "Admin",
};

const EXTERNAL_VIEWS: Record<string, string> = {
  journal: "/journal/dashboard",
  strategies: "/strategies-lab/",
  resources: "/bootcamp/",
};

const INTERNAL_NAV: Record<string, string> = {
  dashboard: "/dashboard/",
  cot: "/dashboard/cot/",
  support: "/dashboard/support/",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isArabic } = useLanguage();
  const [user, setUser] = React.useState<User | null>(null);
  const [activeView, setActiveView] = React.useState<string>("dashboard");
  const [loadedViews, setLoadedViews] = React.useState<Record<string, boolean>>({});
  const pathname = usePathname() || "";
  const router = useRouter();

  React.useEffect(() => {
    fetchMe()
      .then((u) => setUser(u))
      .catch(() => {
        const target = `${window.location.pathname}${window.location.search || ""}`;
        window.location.href = `/login/?next=${encodeURIComponent(target)}`;
      });
  }, []);

  React.useEffect(() => {
    if (pathname.startsWith("/dashboard/cot")) setActiveView("cot");
    else if (pathname.startsWith("/dashboard/support")) setActiveView("support");
    else if (pathname.startsWith("/dashboard/admin")) setActiveView("admin");
    else if (pathname.startsWith("/dashboard")) setActiveView("dashboard");
  }, [pathname]);

  const handleNavClick = (id: string) => {
    setActiveView(id);
    if (EXTERNAL_VIEWS[id]) {
      setLoadedViews((prev) => ({ ...prev, [id]: true }));
    } else if (INTERNAL_NAV[id]) {
      router.push(INTERNAL_NAV[id]);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch { /* ignore */ }
    localStorage.removeItem("token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("talaria_current_user");
    localStorage.removeItem("is_admin");
    window.location.href = "/login/";
  };

  const pageTitle = VIEW_TITLES[activeView] || "Dashboard";

  const NAV_ITEMS: { id: string; label: string; icon: React.ReactNode }[] = [
    { id: "dashboard", label: "Dashboard", icon: <svg width={21} height={21} viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="13" y="3" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="3" y="13" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="13" y="13" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5"/></svg> },
    { id: "journal",   label: "Journal",   icon: <svg width={21} height={21} viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="15" height="18" rx="1" stroke="currentColor" strokeWidth="1.5"/><line x1="7" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="7" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="7" y1="16" x2="11" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
    { id: "backtest",  label: "Backtest",  icon: <svg width={21} height={21} viewBox="0 0 24 24" fill="none"><polyline points="3,20 3,4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><polyline points="3,15 8,11 12,14 18,7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><polygon points="20,10 23,13 20,16" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg> },
    { id: "strategies",label: "Strategies",icon: <svg width={21} height={21} viewBox="0 0 24 24" fill="none"><rect x="3" y="2" width="14" height="20" rx="1" stroke="currentColor" strokeWidth="1.4"/><rect x="8" y="1" width="4" height="3" rx="0.5" stroke="currentColor" strokeWidth="1.3"/><circle cx="7" cy="9" r="1.2" fill="currentColor" opacity="0.8"/><circle cx="13" cy="9" r="1.2" fill="currentColor" opacity="0.8"/><circle cx="10" cy="14" r="1.2" fill="currentColor" opacity="0.8"/><path d="M7 9c0 3 3 3 3 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M13 9c-1 2-1 3-3 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><line x1="8.5" y1="19" x2="11.5" y2="19" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg> },
    { id: "resources", label: "Resources", icon: <svg width={21} height={21} viewBox="0 0 24 24" fill="none"><rect x="2" y="16.5" width="20" height="3.5" rx="0.5" stroke="currentColor" strokeWidth="1.4"/><line x1="5.5" y1="16.5" x2="5.5" y2="20" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><rect x="3.5" y="12" width="17" height="3.5" rx="0.5" stroke="currentColor" strokeWidth="1.4"/><line x1="7" y1="12" x2="7" y2="15.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><rect x="5" y="7.5" width="14" height="3.5" rx="0.5" stroke="currentColor" strokeWidth="1.4"/><line x1="8.5" y1="7.5" x2="8.5" y2="11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> },
    { id: "support",   label: "Support",   icon: <svg width={21} height={21} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="12" cy="17" r="0.5" fill="currentColor" stroke="currentColor" strokeWidth="1"/></svg> },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "#07080E", fontFamily: F, color: "rgba(255,255,255,0.92)", display: "flex", flexDirection: "column", overflow: "hidden" }}
      dir={isArabic ? "rtl" : "ltr"}>

      {/* ── Top Header ── */}
      <header style={{ height: 64, flexShrink: 0, display: "flex", alignItems: "center", background: "#0F1119", boxShadow: "0 2px 18px rgba(0,0,0,0.5)", zIndex: 2 }}>
        {/* Logo slot */}
        <div style={{ width: 64, flexShrink: 0, height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img src="/logo-08.png" style={{ width: 36, height: 36, objectFit: "contain" }} alt="" />
        </div>
        {/* Brand + Page title */}
        <a href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none", flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: "rgba(255,255,255,0.92)", letterSpacing: "0.02em", fontFamily: F }}>Talaria-Log</span>
        </a>
        <div style={{ width: 1, height: 20, background: "rgba(140,160,255,0.18)", margin: "0 12px", flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.92)", flexShrink: 0 }}>{pageTitle}</span>
        {/* Right side */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, paddingRight: 16 }}>
          <DashboardNotificationBell isArabic={isArabic} />
          {user?.role === "admin" && (
            <a href="/dashboard/admin/" style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.50)", textDecoration: "none", padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(140,160,255,0.12)", fontFamily: F }}>
              Admin
            </a>
          )}
          {user && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.28)" }}>{user.email}</span>}
          <button type="button" onClick={handleLogout}
            style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,80,104,0.75)", background: "transparent", border: "1px solid rgba(255,80,104,0.15)", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: F }}>
            {isArabic ? "تسجيل الخروج" : "Logout"}
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Left Sidebar */}
        <nav style={{ width: 64, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 0 6px", background: "#0F1119", gap: 1, boxShadow: "4px 0 20px rgba(0,0,0,0.45)", zIndex: 1 }}>
          {NAV_ITEMS.map(({ id, label, icon }) => {
            const active = activeView === id;
            return (
              <div key={id} onClick={() => handleNavClick(id)}
                style={{ width: "100%", height: 56, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer", position: "relative", background: active ? "rgba(38,67,247,0.08)" : "transparent", color: active ? "#4A6AFF" : "rgba(255,255,255,0.55)", transition: "background 0.12s,color 0.12s" }}>
                {active && <div style={{ position: "absolute", left: 0, top: "20%", bottom: "20%", width: 2, background: "linear-gradient(180deg,transparent,#4A6AFF,transparent)", boxShadow: "0 0 6px rgba(38,67,247,0.35)" }} />}
                {icon}
                <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase" as const, fontFamily: F }}>{label}</span>
              </div>
            );
          })}
          <div style={{ flex: 1 }} />
          {/* Profile at bottom */}
          <div onClick={() => handleNavClick("support")}
            style={{ width: "100%", height: 56, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer", color: activeView === "support" ? "#4A6AFF" : "rgba(255,255,255,0.40)", transition: "color 0.12s" }}>
            <svg width={21} height={21} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase" as const, fontFamily: F }}>Profile</span>
          </div>
        </nav>

        {/* Main content area */}
        <main style={{ flex: 1, overflow: "hidden", background: "#07080E", position: "relative" }}>

          {/* Internal Next.js pages (dashboard, cot, support) */}
          <div style={{
            position: "absolute", inset: 0, overflowY: "auto",
            visibility: !EXTERNAL_VIEWS[activeView] && activeView !== "backtest" ? "visible" : "hidden",
            pointerEvents: !EXTERNAL_VIEWS[activeView] && activeView !== "backtest" ? "auto" : "none",
          }}>
            {children}
          </div>

          {/* BacktestView — mount only when tab is active to avoid N× /analytics calls on Dashboard */}
          {activeView === "backtest" ? (
            <div style={{
              position: "absolute", inset: 0,
              opacity: 1,
              pointerEvents: "auto",
              transition: "opacity 0.15s",
            }}>
              <BacktestView />
            </div>
          ) : null}

          {/* External views loaded as full-page iframes */}
          {Object.entries(EXTERNAL_VIEWS).map(([id, url]) => (
            <iframe
              key={id}
              title={id}
              src={loadedViews[id] ? url : undefined}
              style={{
                position: "absolute", inset: 0,
                width: "100%", height: "100%",
                border: "none",
                opacity: activeView === id ? 1 : 0,
                pointerEvents: activeView === id ? "auto" : "none",
                transition: "opacity 0.15s",
              }}
            />
          ))}
        </main>
      </div>
    </div>
  );
}
