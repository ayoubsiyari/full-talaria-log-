"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLanguage } from "../LanguageProvider";
import { BacktestNewSessionProvider } from "./BacktestNewSessionContext";
import "./dashboard-shell.css";
import {
  dashboardPathRequiresPaidJournal,
  dashboardPathToModule,
  defaultDashboardPathForUser,
  isNavItemAdminOnlyWip,
  isPathAdminOnlyWip,
  lockedModuleGateReason,
  lockedModuleNavTitle,
  resolveDashboardGateVariant,
  userCanAccessAdminOnlyWipPath,
  userCanAccessDashboardPath,
  userHasDashboardModule,
  userHasPartialDashboardAccess,
  userIsDashboardAdmin,
} from "@/lib/dashboardAccess";
import { applyJournalTokenFromAuthResponse } from "@/lib/journalApi";
import { isAnonymousPlaceholderUser } from "@/lib/authUser";
import SubscriptionGateOverlay from "./SubscriptionGateOverlay";
import DashboardAccessSkeleton from "./DashboardAccessSkeleton";
import { StrategyLabV9BuilderProvider } from "./strategies/StrategyLabV9BuilderContext";

type User = {
  id: number;
  name: string;
  email: string;
  role: string;
  is_admin?: boolean;
  has_journal_access?: boolean;
  has_active_subscription?: boolean;
  manual_full_access?: boolean;
  has_dashboard_access?: boolean;
  access_denial_reason?: string;
  billing_issue?: boolean;
  lapsed_subscription?: {
    plan_name?: string;
    status?: string;
    current_period_end?: string;
    cancel_at_period_end?: boolean;
  };
  dashboard_modules?: Record<string, boolean>;
  subscription?: { status?: string };
};

async function fetchMe(): Promise<User> {
  const res = await fetch("/api/auth/me", {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) throw new Error("not_authenticated");
  const data = (await res.json()) as { user: User; journal_token?: string };
  applyJournalTokenFromAuthResponse(data);
  if (isAnonymousPlaceholderUser(data.user)) throw new Error("not_authenticated");
  return data.user;
}

type NotifRow = {
  id: number;
  title: string;
  body?: string | null;
  thread_id?: number | null;
  read_at?: string | null;
};

const F = "'Exo 2', sans-serif";

/** Dark chrome tokens — parity with `talaria-design` / `TalariaV8b` `c` map. */
const DASH_C = {
  el: "#0F1119",
  bg: "#07080E",
  tx: "rgba(255,255,255,0.92)",
  ts: "rgba(255,255,255,0.55)",
  acL: "#4A6AFF",
  acD: "rgba(38,67,247,0.08)",
  acG: "rgba(38,67,247,0.12)",
  hv: "rgba(255,255,255,0.07)",
} as const;

const PROFILE_PANEL_W = 300;

function DashboardNotificationBell({
  isArabic,
  dropdownAnchorStart,
  fullWidthButton,
  openUpward,
  panelWidth,
}: {
  isArabic: boolean;
  /** When true, align dropdown to the button’s start edge (for Profile flyout). */
  dropdownAnchorStart?: boolean;
  fullWidthButton?: boolean;
  /** Profile flyout: open list above the button so it is not clipped at the viewport bottom. */
  openUpward?: boolean;
  panelWidth?: number;
}) {
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
        style={{
          position: "relative",
          ...(fullWidthButton
            ? {
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-start",
                gap: 8,
                boxSizing: "border-box" as const,
              }
            : {}),
        }}
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
            ...(openUpward
              ? { bottom: "calc(100% + 10px)", top: "auto" }
              : { top: "calc(100% + 8px)" }),
            ...(dropdownAnchorStart ? { left: 0 } : { right: 0 }),
            width: panelWidth ?? 340,
            maxHeight: openUpward ? "min(52vh, 360px)" : 380,
            overflowY: "auto",
            background: DASH_C.el,
            border: "1px solid rgba(140,160,255,0.16)",
            borderRadius: 10,
            boxShadow: "0 16px 48px rgba(0,0,0,0.55)",
            zIndex: openUpward ? 11002 : 200,
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
                href={n.thread_id ? `/dashboard/profile/?tab=support&thread=${n.thread_id}` : "#"}
                onClick={async (e) => {
                  if (n.thread_id) {
                    e.preventDefault();
                    await fetch("/api/notifications/read", {
                      method: "PATCH",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ ids: [n.id] }),
                    });
                    window.location.href = `/dashboard/profile/?tab=support&thread=${n.thread_id}`;
                  }
                }}
                style={{
                  display: "block",
                  padding: "12px 14px",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  textDecoration: "none",
                  color: "#e8e4dc",
                  fontSize: 12,
                  borderLeft: n.read_at ? undefined : `3px solid ${DASH_C.acL}`,
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

const VIEW_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  journal: "Journal",
  trades: "Trades",
  backtest: "Backtesting Sessions",
  strategies: "Strategies",
  resources: "Resources",
  cot: "COT Analysis",
  admin: "Admin",
  profile: "Account",
};

const EXTERNAL_VIEWS: Record<string, string> = {
  resources: "/bootcamp/",
};

const INTERNAL_NAV: Record<string, string> = {
  dashboard: "/dashboard/",
  journal:   "/dashboard/journal/",
  trades:    "/dashboard/trades/",
  backtest:  "/dashboard/backtest/",
  strategies: "/dashboard/strategies/",
  cot:       "/dashboard/cot/",
  admin:     "/dashboard/admin/",
};

export default function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isArabic } = useLanguage();
  const [user, setUser] = React.useState<User | null>(null);
  const [authReady, setAuthReady] = React.useState(false);
  const [activeView, setActiveView] = React.useState<string>("dashboard");
  const [loadedViews, setLoadedViews] = React.useState<Record<string, boolean>>({ journal: true });
  const [profilePanelOpen, setProfilePanelOpen] = React.useState(false);
  const [navHoverId, setNavHoverId] = React.useState<string | null>(null);
  const [profileNavHov, setProfileNavHov] = React.useState(false);
  const profileWrapRef = React.useRef<HTMLDivElement>(null);
  const pathname = usePathname() || "";
  const router = useRouter();
  const openBacktestNewSessionRef = React.useRef<(() => void) | null>(null);
  const registerBacktestOpenNewSession = React.useCallback((fn: (() => void) | null) => {
    openBacktestNewSessionRef.current = fn;
  }, []);
  const openStrategyLabV9BuilderRef = React.useRef<(() => void) | null>(null);
  const registerStrategyLabV9OpenBuilder = React.useCallback((fn: (() => void) | null) => {
    openStrategyLabV9BuilderRef.current = fn;
  }, []);

  React.useEffect(() => {
    fetchMe()
      .then((u) => {
        setUser(u);
        setAuthReady(true);
      })
      .catch(() => {
        const target = `${window.location.pathname}${window.location.search || ""}`;
        window.location.href = `/login/?next=${encodeURIComponent(target)}`;
      });
  }, []);

  const enforceAccessForPath = React.useCallback((u: User, path: string) => {
    if (isPathAdminOnlyWip(path) && !userCanAccessAdminOnlyWipPath(u, path)) {
      window.location.replace(defaultDashboardPathForUser(u));
      return;
    }
    if (!dashboardPathRequiresPaidJournal(path)) return;
    if (userCanAccessDashboardPath(u, path)) return;
    window.location.replace(defaultDashboardPathForUser(u));
  }, []);

  /** Re-sync after checkout, admin access change, tab focus, or browser back (bfcache). */
  React.useEffect(() => {
    const resync = () => {
      fetchMe()
        .then((u) => {
          setUser(u);
          setAuthReady(true);
          enforceAccessForPath(u, window.location.pathname);
        })
        .catch(() => {});
    };
    const onVis = () => {
      if (document.visibilityState !== "visible" || !authReady) return;
      resync();
    };
    const onFocus = () => {
      if (!authReady) return;
      resync();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) resync();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [authReady, enforceAccessForPath]);

  React.useEffect(() => {
    if (!authReady || !user) return;
    enforceAccessForPath(user, pathname);
  }, [authReady, user, pathname, enforceAccessForPath]);

  const gatedPath = dashboardPathRequiresPaidJournal(pathname);
  const pathAllowed = userCanAccessDashboardPath(user, pathname);
  const wipSectionBlocked =
    authReady &&
    !!user &&
    isPathAdminOnlyWip(pathname) &&
    !userCanAccessAdminOnlyWipPath(user, pathname);
  const blockedModule = gatedPath ? dashboardPathToModule(pathname) : null;
  const gateReason =
    user && blockedModule
      ? lockedModuleGateReason(user, blockedModule)
      : "none";
  const subscriptionWall =
    authReady && !!user && gatedPath && !pathAllowed && !wipSectionBlocked;
  const gateVariant = resolveDashboardGateVariant(user);
  const gatedAuthLoading = gatedPath && !authReady;

  const goPricing = React.useCallback(() => {
    router.prefetch("/pricing/");
    router.replace("/pricing/?browse=1");
  }, [router]);

  React.useEffect(() => {
    if (gatedPath) router.prefetch("/pricing/");
  }, [gatedPath, router]);

  React.useEffect(() => {
    if (
      pathname.startsWith("/dashboard/journal") &&
      userCanAccessAdminOnlyWipPath(user, pathname)
    ) {
      setActiveView("journal");
    } else if (pathname.startsWith("/dashboard/trades")) setActiveView("trades");
    else if (pathname.startsWith("/dashboard/backtest")) setActiveView("backtest");
    else if (pathname.startsWith("/dashboard/strategies"))
      setActiveView("strategies");
    else if (
      pathname.startsWith("/dashboard/cot") &&
      userCanAccessAdminOnlyWipPath(user, pathname)
    ) {
      setActiveView("cot");
    } else if (pathname.startsWith("/dashboard/support")) setActiveView("profile");
    else if (pathname.startsWith("/dashboard/admin")) setActiveView("admin");
    else if (pathname.startsWith("/dashboard/profile")) setActiveView("profile");
    else if (pathname === "/dashboard" || pathname === "/dashboard/") setActiveView("dashboard");
    else if (pathname.startsWith("/dashboard")) setActiveView("dashboard");
  }, [pathname, user]);

  React.useEffect(() => {
    if (!profilePanelOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (profileWrapRef.current && !profileWrapRef.current.contains(e.target as Node)) {
        setProfilePanelOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [profilePanelOpen]);

  const navModuleForId = (id: string): string | null => {
    if (id === "admin") return null;
    if (id === "journal") return "journal";
    if (id === "trades") return "backtest";
    if (id === "backtest") return "backtest";
    if (id === "strategies") return "strategies";
    if (id === "cot") return "cot";
    if (id === "dashboard") return null;
    return null;
  };

  const isAdminUser = userIsDashboardAdmin(user);
  const onAdminRoute = pathname.startsWith("/dashboard/admin");

  const handleNavClick = (id: string) => {
    if (isNavItemAdminOnlyWip(id) && user && !userIsDashboardAdmin(user)) {
      router.replace(defaultDashboardPathForUser(user));
      return;
    }
    const mod = navModuleForId(id);
    if (mod && user && !userHasDashboardModule(user, mod)) {
      if (userHasPartialDashboardAccess(user)) {
        router.push("/dashboard/profile/?tab=support&topic=access");
      } else {
        goPricing();
      }
      return;
    }
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

  const ALL_NAV_ITEMS: { id: string; label: string; icon: React.ReactNode }[] = [
    { id: "dashboard", label: "Dashboard", icon: <svg width={21} height={21} viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="13" y="3" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="3" y="13" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="13" y="13" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5"/></svg> },
    { id: "journal",   label: "Journal",   icon: <svg width={21} height={21} viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="15" height="18" rx="1" stroke="currentColor" strokeWidth="1.5"/><line x1="7" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="7" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="7" y1="16" x2="11" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
    { id: "trades",    label: "Trades",    icon: <svg width={21} height={21} viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="1" stroke="currentColor" strokeWidth="1.5"/><line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" strokeWidth="1.5"/><line x1="8" y1="13" x2="16" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="8" y1="17" x2="13" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
    { id: "backtest",  label: "Backtest",  icon: <svg width={21} height={21} viewBox="0 0 24 24" fill="none"><polyline points="3,20 3,4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><polyline points="3,15 8,11 12,14 18,7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><polygon points="20,10 23,13 20,16" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg> },
    { id: "cot",       label: "COT",       icon: <svg width={21} height={21} viewBox="0 0 24 24" fill="none"><rect x="3" y="12" width="3" height="8" rx="0.5" stroke="currentColor" strokeWidth="1.4"/><rect x="8" y="8" width="3" height="12" rx="0.5" stroke="currentColor" strokeWidth="1.4"/><rect x="13" y="5" width="3" height="15" rx="0.5" stroke="currentColor" strokeWidth="1.4"/><rect x="18" y="9" width="3" height="11" rx="0.5" stroke="currentColor" strokeWidth="1.4"/><line x1="3" y1="3" x2="21" y2="3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeDasharray="2 2"/></svg> },
    { id: "strategies",label: "Strategies",icon: <svg width={21} height={21} viewBox="0 0 24 24" fill="none"><rect x="3" y="2" width="14" height="20" rx="1" stroke="currentColor" strokeWidth="1.4"/><rect x="8" y="1" width="4" height="3" rx="0.5" stroke="currentColor" strokeWidth="1.3"/><circle cx="7" cy="9" r="1.2" fill="currentColor" opacity="0.8"/><circle cx="13" cy="9" r="1.2" fill="currentColor" opacity="0.8"/><circle cx="10" cy="14" r="1.2" fill="currentColor" opacity="0.8"/><path d="M7 9c0 3 3 3 3 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M13 9c-1 2-1 3-3 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><line x1="8.5" y1="19" x2="11.5" y2="19" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg> },
    { id: "resources", label: "Resources", icon: <svg width={21} height={21} viewBox="0 0 24 24" fill="none"><rect x="2" y="16.5" width="20" height="3.5" rx="0.5" stroke="currentColor" strokeWidth="1.4"/><line x1="5.5" y1="16.5" x2="5.5" y2="20" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><rect x="3.5" y="12" width="17" height="3.5" rx="0.5" stroke="currentColor" strokeWidth="1.4"/><line x1="7" y1="12" x2="7" y2="15.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><rect x="5" y="7.5" width="14" height="3.5" rx="0.5" stroke="currentColor" strokeWidth="1.4"/><line x1="8.5" y1="7.5" x2="8.5" y2="11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg> },
  ];

  const ADMIN_NAV_ITEM = React.useMemo(
    () =>
      ({
        id: "admin",
        label: "Admin",
        icon: (
          <svg width={21} height={21} viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.3L12 14.8 7.2 16.8l.9-5.3-3.9-3.8 5.4-.8L12 2z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.4" opacity="0.35" />
          </svg>
        ),
      }) as const,
    []
  );

  const NAV_ITEMS = React.useMemo(() => {
    const items = ALL_NAV_ITEMS.filter(
      (item) => !isNavItemAdminOnlyWip(item.id) || userIsDashboardAdmin(user)
    );
    if (userIsDashboardAdmin(user)) {
      return [...items, ADMIN_NAV_ITEM];
    }
    return items;
  }, [user, ADMIN_NAV_ITEM]);

  return (
    <div
      className="dashboard-shell"
      lang={isArabic ? "ar" : "en"}
      dir="ltr"
      style={{ position: "fixed", inset: 0, background: DASH_C.bg, fontFamily: F, color: DASH_C.tx, display: "flex", flexDirection: "column", overflow: "hidden" }}
    >

      {/* ── Top Header (parity with Design `SessionsView.jsx`) ── */}
      <header style={{ height: 64, flexShrink: 0, display: "flex", alignItems: "center", gap: 0, background: DASH_C.el, boxShadow: "0 2px 18px rgba(0,0,0,0.5)", zIndex: 2 }}>
        <div style={{ width: 64, flexShrink: 0, height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img src="/LOGO-07.png" style={{ width: 52, height: 52, objectFit: "contain" }} alt="" />
        </div>
        <div style={{ display: "flex", alignItems: "center", flexShrink: 0, gap: 14, paddingInlineEnd: 12 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: DASH_C.tx, letterSpacing: "0.04em", fontFamily: F }}>
            <a href="/" style={{ color: "inherit", textDecoration: "none" }}>Talaria-Log</a>
          </div>
          <div
            style={{
              width: 1.5,
              height: 36,
              flexShrink: 0,
              background: `linear-gradient(180deg,transparent,${DASH_C.acL},transparent)`,
              boxShadow: `0 0 6px ${DASH_C.acL}`,
            }}
          />
          <div style={{ fontSize: 13, fontWeight: 700, color: DASH_C.ts, letterSpacing: "0.06em", fontFamily: F, position: "relative", top: 2 }}>
            {pageTitle}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, paddingInlineEnd: 16 }}>
          {activeView === "backtest" ? (
            <button
              type="button"
              onClick={() => openBacktestNewSessionRef.current?.()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                height: 36,
                padding: "0 20px",
                background: "linear-gradient(135deg,#1e38e8,#4A6AFF)",
                border: "none",
                cursor:"default",
                fontFamily: F,
                fontSize: 13,
                fontWeight: 800,
                color: "rgba(255,255,255,0.96)",
                letterSpacing: "0.08em",
                boxShadow: "0 2px 10px rgba(38,67,247,0.35)",
                flexShrink: 0,
                transition: "filter 0.12s",
                marginInlineEnd: 20,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = "brightness(1.12)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = "brightness(1)";
              }}
              aria-label={isArabic ? "جلسة جديدة" : "New session"}
            >
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" aria-hidden>
                <line x1="12" y1="4" x2="12" y2="20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              {isArabic ? "جلسة جديدة" : "New Session"}
            </button>
          ) : null}
          {activeView === "strategies" ? (
            <button
              type="button"
              onClick={() => openStrategyLabV9BuilderRef.current?.()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                height: 36,
                padding: "0 20px",
                background: "linear-gradient(135deg,#1e38e8,#4A6AFF)",
                border: "none",
                cursor: "default",
                fontFamily: F,
                fontSize: 13,
                fontWeight: 800,
                color: "rgba(255,255,255,0.96)",
                letterSpacing: "0.08em",
                boxShadow: "0 2px 10px rgba(38,67,247,0.35)",
                flexShrink: 0,
                transition: "filter 0.12s",
                marginInlineEnd: 20,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = "brightness(1.12)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = "brightness(1)";
              }}
              aria-label={isArabic ? "استراتيجية جديدة" : "New strategy"}
            >
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" aria-hidden>
                <line x1="12" y1="4" x2="12" y2="20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              {isArabic ? "استراتيجية جديدة" : "New Strategy"}
            </button>
          ) : null}
          {isAdminUser ? (
            <>
              <a
                href="/dashboard/design/handoff/"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: DASH_C.ts,
                  textDecoration: "none",
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid rgba(140,160,255,0.12)",
                  fontFamily: F,
                }}
                title="Preview Sources Handoff/TalariaV16.jsx dashboard mock"
              >
                V16 Handoff
              </a>
              {onAdminRoute ? (
                <a
                  href="/dashboard/backtest/"
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: DASH_C.acL,
                    textDecoration: "none",
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: "1px solid rgba(74,106,255,0.35)",
                    fontFamily: F,
                  }}
                >
                  {isArabic ? "التطبيق" : "Trading app"}
                </a>
              ) : (
                <a
                  href="/dashboard/admin/"
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: DASH_C.ts,
                    textDecoration: "none",
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: "1px solid rgba(140,160,255,0.12)",
                    fontFamily: F,
                  }}
                >
                  Admin
                </a>
              )}
            </>
          ) : null}
        </div>
      </header>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Left Sidebar */}
        <nav style={{ width: 64, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 0 6px", background: DASH_C.el, gap: 1, boxShadow: "4px 0 20px rgba(0,0,0,0.45)", zIndex: 1 }}>
          {NAV_ITEMS.map(({ id, label, icon }) => {
            const active = activeView === id;
            const hovered = navHoverId === id && !active;
            const bg = active ? DASH_C.acD : hovered ? DASH_C.hv : "transparent";
            const color = active ? DASH_C.acL : hovered ? DASH_C.tx : DASH_C.ts;
            const railSide = "left";
            const navMod = navModuleForId(id);
            const navLocked =
              !!user && !!navMod && !userHasDashboardModule(user, navMod);
            return (
              <div
                key={id}
                role="button"
                tabIndex={0}
                title={
                  navLocked && navMod
                    ? lockedModuleNavTitle(user, navMod, isArabic)
                    : undefined
                }
                onClick={() => handleNavClick(id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleNavClick(id);
                  }
                }}
                onMouseEnter={() => setNavHoverId(id)}
                onMouseLeave={() => setNavHoverId((h) => (h === id ? null : h))}
                style={{
                  width: "100%",
                  height: 56,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  cursor: navLocked ? "not-allowed" : "default",
                  position: "relative",
                  background: bg,
                  color,
                  opacity: navLocked ? 0.38 : 1,
                  transition: "background 0.12s,color 0.12s,opacity 0.12s",
                }}
              >
                {active ? (
                  <div
                    style={{
                      position: "absolute",
                      [railSide]: 0,
                      top: "20%",
                      bottom: "20%",
                      width: 2,
                      background: `linear-gradient(180deg,transparent,${DASH_C.acL},transparent)`,
                      boxShadow: `0 0 6px ${DASH_C.acG}`,
                    }}
                  />
                ) : null}
                {icon}
                <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase" as const, fontFamily: F }}>{label}</span>
              </div>
            );
          })}
          <div style={{ flex: 1 }} />
          {/* Profile — flyout: Alerts, email, Logout */}
          <div ref={profileWrapRef} style={{ width: "100%", position: "relative", zIndex: profilePanelOpen ? 11000 : 1 }}>
            <div
              onClick={(e) => {
                e.stopPropagation();
                setProfilePanelOpen((o) => !o);
              }}
              onMouseEnter={() => setProfileNavHov(true)}
              onMouseLeave={() => setProfileNavHov(false)}
              style={{
                width: "100%",
                height: 56,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                cursor: "default",
                position: "relative",
                color: profilePanelOpen ? DASH_C.acL : profileNavHov ? DASH_C.tx : DASH_C.ts,
                background: profilePanelOpen ? DASH_C.acD : profileNavHov ? DASH_C.hv : "transparent",
                transition: "color 0.12s, background 0.12s",
              }}>
              {profilePanelOpen ? (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: "20%",
                    bottom: "20%",
                    width: 2,
                    background: `linear-gradient(180deg,transparent,${DASH_C.acL},transparent)`,
                    boxShadow: `0 0 6px ${DASH_C.acG}`,
                  }}
                />
              ) : null}
              <svg width={21} height={21} viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase" as const, fontFamily: F }}>Profile</span>
            </div>
            {profilePanelOpen ? (
              <div
                role="dialog"
                aria-label={isArabic ? "الحساب" : "Account"}
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: "fixed",
                  left: 72,
                  bottom: 16,
                  width: PROFILE_PANEL_W,
                  padding: 0,
                  background: DASH_C.el,
                  border: "1px solid rgba(140,160,255,0.18)",
                  borderRadius: 12,
                  boxShadow: "0 20px 56px rgba(0,0,0,0.65)",
                  fontFamily: F,
                  zIndex: 11001,
                  overflow: "visible",
                }}
              >
                <div
                  style={{
                    height: 2,
                    borderRadius: "12px 12px 0 0",
                    background: `linear-gradient(90deg,transparent,${DASH_C.acL},transparent)`,
                    opacity: 0.85,
                  }}
                />
                <div style={{ padding: "14px 14px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: DASH_C.acD,
                        border: "1px solid rgba(74,106,255,0.35)",
                        color: DASH_C.acL,
                        fontSize: 14,
                        fontWeight: 800,
                      }}
                    >
                      {(user?.name || user?.email || "?").charAt(0).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          letterSpacing: "0.08em",
                          color: DASH_C.ts,
                          textTransform: "uppercase",
                          marginBottom: 3,
                        }}
                      >
                        {isArabic ? "الحساب" : "Account"}
                      </div>
                      {user ? (
                        <>
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: DASH_C.tx,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {user.name || user.email}
                          </div>
                          <div
                            style={{
                              fontSize: 10,
                              color: DASH_C.ts,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              marginTop: 2,
                            }}
                          >
                            {user.email}
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>
                <Link
                  href="/dashboard/profile/"
                  onClick={() => setProfilePanelOpen(false)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "center" as const,
                    padding: "10px 12px",
                    marginBottom: 12,
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    color: DASH_C.acL,
                    background: DASH_C.acD,
                    border: "1px solid rgba(74,106,255,0.28)",
                    textDecoration: "none",
                    fontFamily: F,
                    boxSizing: "border-box" as const,
                  }}
                >
                  {isArabic ? "إعدادات الحساب" : "Account settings"}
                </Link>
                  <div style={{ position: "relative", marginBottom: 10 }}>
                    <DashboardNotificationBell
                      isArabic={isArabic}
                      dropdownAnchorStart
                      fullWidthButton
                      openUpward
                      panelWidth={PROFILE_PANEL_W - 28}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setProfilePanelOpen(false);
                      void handleLogout();
                    }}
                    style={{
                      width: "100%",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "rgba(255,80,104,0.9)",
                      background: "rgba(255,80,104,0.06)",
                      border: "1px solid rgba(255,80,104,0.2)",
                      borderRadius: 8,
                      padding: "10px 12px",
                      cursor: "pointer",
                      fontFamily: F,
                    }}
                  >
                    {isArabic ? "تسجيل الخروج" : "Logout"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </nav>

        {/* Main content area */}
        <main style={{ flex: 1, minHeight: 0, overflow: "hidden", background: DASH_C.bg, position: "relative", display: "flex", flexDirection: "column" }}>

          <BacktestNewSessionProvider register={registerBacktestOpenNewSession}>
            <StrategyLabV9BuilderProvider register={registerStrategyLabV9OpenBuilder}>
            {/* Internal Next.js pages (dashboard, journal, backtest, strategies, cot, support, …) */}
            <div style={{
              position: "absolute", inset: 0, overflowY: "auto",
              visibility: !EXTERNAL_VIEWS[activeView] ? "visible" : "hidden",
              pointerEvents: !EXTERNAL_VIEWS[activeView] ? "auto" : "none",
            }}>
              {gatedAuthLoading || wipSectionBlocked ? (
                <DashboardAccessSkeleton isArabic={isArabic} />
              ) : subscriptionWall ? (
                <div style={{ position: "absolute", inset: 0, background: DASH_C.bg }}>
                  <SubscriptionGateOverlay
                    active
                    variant={gateVariant}
                    isArabic={isArabic}
                    onContinueToPlans={goPricing}
                    onAccountSettings={() => {
                      router.push("/dashboard/profile/");
                    }}
                    onContactSupport={() => {
                      router.push("/dashboard/profile/?tab=support&topic=access");
                    }}
                    onGoToAllowed={() => {
                      router.replace(defaultDashboardPathForUser(user));
                    }}
                  />
                </div>
              ) : (
                children
              )}
            </div>

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
          </StrategyLabV9BuilderProvider>
          </BacktestNewSessionProvider>
        </main>
      </div>
    </div>
  );
}
