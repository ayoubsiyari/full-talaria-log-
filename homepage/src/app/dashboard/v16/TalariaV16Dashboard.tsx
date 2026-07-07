"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useEffect, useLayoutEffect, useState } from "react";
import { useLanguage } from "@/app/LanguageProvider";
import {
  firstAllowedPlatformDashboardPath,
  platformSectionForPath,
  platformSectionsMap,
  userCanUseV16EmbeddedView,
  userHasAnyDashboardAccess,
  userHasPlatformSection,
  userIsDashboardAdmin,
  v16ViewToPlatformSection,
  type DashboardUser,
  type PlatformFeatures,
  type PlatformSectionKey,
} from "@/lib/dashboardAccess";
import { useBacktestNewSession } from "../BacktestNewSessionContext";
import { primeV16EmbeddedShell } from "./v16EmptyBoot";
import { useV16LiveBootstrap } from "./useV16LiveBootstrap";
import { normalizeV16DashboardView } from "./v16DashboardRoutes";
import { V16ProfilePortal } from "./V16ProfilePortal";
import { V16SupportChatPopover } from "./V16SupportChatPopover";
import V16DashboardLoading from "./V16DashboardLoading";

declare global {
  interface Window {
    __TALARIA_PLATFORM_SECTIONS__?: Partial<Record<PlatformSectionKey, boolean>>;
    /** Authoritative nav guard — closure over /api/auth/me platform flags (not user-tweakable globals). */
    __TALARIA_V16_CAN_USE_VIEW__?: (viewId: string) => boolean;
  }
}

const TalariaV16 = dynamic(() => import("talaria-handoff/TalariaV16.jsx"), {
  ssr: false,
  loading: () => <V16DashboardLoading />,
});

type AuthUser = {
  role?: string;
  is_admin?: boolean;
  has_dashboard_access?: boolean;
  dashboard_modules?: Record<string, boolean>;
};

async function fetchPlatformSections(): Promise<{
  user: AuthUser;
  platform: PlatformFeatures;
}> {
  const res = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
  if (!res.ok) throw new Error("auth");
  const data = (await res.json()) as { user?: AuthUser; platform?: PlatformFeatures };
  return {
    user: data.user ?? {},
    platform: data.platform ?? {},
  };
}

function currentPlatformSection(
  pathname: string,
  searchParams: URLSearchParams
): PlatformSectionKey | null {
  const search = searchParams.toString();
  const viewParam = searchParams.get("view");
  const tabParam = searchParams.get("tab");
  return (
    platformSectionForPath(pathname, search ? `?${search}` : "") ||
    (tabParam === "support" && viewParam === "profile" ? "support" : null) ||
    v16ViewToPlatformSection(viewParam)
  );
}

function TalariaV16DashboardReady({
  platform,
  authUser,
}: {
  platform: PlatformFeatures;
  authUser: AuthUser;
}) {
  const boot = useV16LiveBootstrap({
    sessionsEnabled: userHasPlatformSection(authUser, platform, "sessions"),
  });
  const { isArabic } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    window.__TALARIA_V16_SYNC_SESSION_URL__ = (sessionId) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("sessionId", String(sessionId));
      params.delete("view");
      params.delete("tab");
      params.delete("thread");
      params.delete("topic");
      const base = pathname.endsWith("/") ? pathname : `${pathname}/`;
      router.replace(`${base}?${params.toString()}`, { scroll: false });
    };
    window.__TALARIA_V16_CLEAR_SESSION_URL__ = () => {
      const params = new URLSearchParams(searchParams.toString());
      if (!params.has("sessionId")) return;
      params.delete("sessionId");
      const base = pathname.endsWith("/") ? pathname : `${pathname}/`;
      const qs = params.toString();
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    };
    window.__TALARIA_V16_CAN_USE_VIEW__ = (viewId) =>
      userCanUseV16EmbeddedView(authUser, platform, viewId);

    window.__TALARIA_V16_SYNC_VIEW_URL__ = (view) => {
      const normalized = normalizeV16DashboardView(view) || "dashboard";
      if (!userCanUseV16EmbeddedView(authUser, platform, normalized)) return;
      const params = new URLSearchParams(searchParams.toString());
      if (normalized === "dashboard") {
        params.delete("view");
        params.delete("tab");
        params.delete("thread");
        params.delete("topic");
      } else if (normalized === "profile") {
        params.set("view", "profile");
      } else {
        params.set("view", normalized);
        params.delete("tab");
        params.delete("thread");
        params.delete("topic");
      }
      const base = pathname.endsWith("/") ? pathname : `${pathname}/`;
      const qs = params.toString();
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    };
    window.__TALARIA_V16_OPEN_PROFILE__ = (tab) => {
      const tabMap: Record<string, string> = {
        account: "profile",
        billing: "subscription",
        security: "security",
        support: "support",
      };
      const raw = tab ? tabMap[tab] || tab : undefined;
      const valid = new Set(["profile", "security", "subscription", "support"]);
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", "profile");
      if (raw && valid.has(raw) && raw !== "profile") params.set("tab", raw);
      else {
        params.delete("tab");
        params.delete("thread");
        params.delete("topic");
      }
      router.replace(`/dashboard/?${params.toString()}`, { scroll: false });
    };
    return () => {
      delete window.__TALARIA_V16_SYNC_SESSION_URL__;
      delete window.__TALARIA_V16_CLEAR_SESSION_URL__;
      delete window.__TALARIA_V16_SYNC_VIEW_URL__;
      delete window.__TALARIA_V16_OPEN_PROFILE__;
      delete window.__TALARIA_V16_CAN_USE_VIEW__;
    };
  }, [authUser, platform, pathname, router, searchParams]);

  const viewParam = searchParams.get("view");
  useEffect(() => {
    const view = normalizeV16DashboardView(viewParam) || "dashboard";
    if (!userCanUseV16EmbeddedView(authUser, platform, view)) return;
    window.dispatchEvent(new CustomEvent("talaria-v16-set-view", { detail: { view } }));
  }, [viewParam, authUser, platform]);

  useEffect(() => {
    if (userIsDashboardAdmin(authUser)) return;
    const section = currentPlatformSection(pathname || "/dashboard/", searchParams);
    if (!section) return;
    if (userHasPlatformSection(authUser, platform, section)) return;
    router.replace(firstAllowedPlatformDashboardPath(authUser, platform));
  }, [authUser, platform, pathname, searchParams, router]);

  const v16View = normalizeV16DashboardView(searchParams.get("view"));
  const [localProfileActive, setLocalProfileActive] = useState(v16View === "profile");
  useEffect(() => {
    setLocalProfileActive(v16View === "profile");
  }, [v16View]);
  useEffect(() => {
    const onSetView = (event: Event) => {
      const view = normalizeV16DashboardView((event as CustomEvent<{ view?: string }>).detail?.view);
      setLocalProfileActive(view === "profile");
    };
    window.addEventListener("talaria-v16-set-view", onSetView);
    return () => window.removeEventListener("talaria-v16-set-view", onSetView);
  }, []);
  const profileActive = v16View === "profile" || localProfileActive;
  const supportEnabled =
    userIsDashboardAdmin(authUser) || userHasPlatformSection(authUser, platform, "support");

  return (
    <div
      className="talaria-v16-dashboard-embed"
      style={{
        position: "relative",
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {boot.status === "loading" ? <V16DashboardLoading isArabic={isArabic} /> : null}
      {boot.status === "error" ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            background: "rgba(7,8,14,0.92)",
            color: "#ff8a9a",
            fontFamily: "'Exo 2', sans-serif",
            fontSize: 13,
            textAlign: "center",
          }}
        >
          Could not load dashboard data: {boot.message}
        </div>
      ) : null}
      <V16ProfilePortal active={profileActive} />
      {supportEnabled ? <V16SupportChatPopover /> : null}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          visibility: boot.status === "ready" ? "visible" : "hidden",
          pointerEvents: boot.status === "ready" ? "auto" : "none",
        }}
      >
        <TalariaV16 key="v16-embedded" />
      </div>
    </div>
  );
}

export default function TalariaV16Dashboard() {
  const { registerOnSaved } = useBacktestNewSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [gateReady, setGateReady] = useState(false);
  const [platform, setPlatform] = useState<PlatformFeatures | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);

  useLayoutEffect(() => {
    primeV16EmbeddedShell();
  }, []);

  useEffect(() => {
    return registerOnSaved(() => {
      window.dispatchEvent(new CustomEvent("talaria-v16-reload-boot"));
    });
  }, [registerOnSaved]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { user, platform: pf } = await fetchPlatformSections();
        if (cancelled) return;

        // Hard paywall gate: a signed-in user with NO access at all (e.g. verified
        // but never paid, or lapsed) must be sent to pricing — never parked inside
        // the dashboard. Admins and anyone with any module/section pass through.
        if (!userIsDashboardAdmin(user) && !userHasAnyDashboardAccess(user as DashboardUser)) {
          window.location.replace("/pricing/?browse=1");
          return;
        }

        window.__TALARIA_PLATFORM_SECTIONS__ = platformSectionsMap(pf);

        const section = currentPlatformSection(pathname || "/dashboard/", searchParams);
        if (
          section &&
          !userIsDashboardAdmin(user) &&
          !userHasPlatformSection(user, pf, section)
        ) {
          window.location.replace(firstAllowedPlatformDashboardPath(user, pf));
          return;
        }

        setAuthUser(user);
        setPlatform(pf);
        setGateReady(true);
      } catch {
        if (!cancelled) {
          setAuthUser({});
          setPlatform({});
          setGateReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, searchParams]);

  if (!gateReady || !platform || !authUser) {
    return <V16DashboardLoading />;
  }

  return <TalariaV16DashboardReady platform={platform} authUser={authUser} />;
}
