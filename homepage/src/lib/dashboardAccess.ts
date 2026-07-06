/**
 * Dashboard module access — must match journal-backend/dashboard_access.py keys.
 * Client gate only; APIs enforce the same modules server-side.
 */

export const DASHBOARD_MODULE_LABELS: Record<string, string> = {
  journal: "Journal",
  backtest: "Backtest & sessions",
  strategies: "Strategy lab",
  cot: "COT analysis",
  community: "Community feed",
  chart: "Chart data & drawings",
};

export const PLATFORM_SECTION_KEYS = [
  "dashboard",
  "trades",
  "sessions",
  "strategies",
  "resources",
  "support",
] as const;

export type PlatformSectionKey = (typeof PLATFORM_SECTION_KEYS)[number];

export const PLATFORM_SECTION_LABELS: Record<PlatformSectionKey, string> = {
  dashboard: "Dashboard",
  trades: "Trades",
  sessions: "Sessions",
  strategies: "Strategies",
  resources: "Resources",
  support: "Support",
};

/** Shell nav id → platform section (profile/admin exempt). */
export const NAV_ID_TO_PLATFORM_SECTION: Partial<Record<string, PlatformSectionKey>> = {
  dashboard: "dashboard",
  trades: "trades",
  backtest: "sessions",
  strategies: "strategies",
  resources: "resources",
};

/**
 * While Journal, COT, and Resources (bootcamp) are under active editing,
 * hide them from nav and block routes for everyone except admins.
 */
export const ADMIN_ONLY_WIP_SECTIONS = true;

const ADMIN_ONLY_WIP_MODULES = new Set(["journal", "cot"]);
const ADMIN_ONLY_WIP_NAV_IDS = new Set(["journal", "cot", "resources"]);

export function userIsDashboardAdmin(user: DashboardUser | null): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  return !!(user as DashboardUser & { is_admin?: boolean }).is_admin;
}

/** Primary trading app entry (sessions / backtest) — used for admin default landing. */
export function defaultAppDashboardPathForUser(
  user: DashboardUser | null,
  platform?: PlatformFeatures | null
): string {
  if (!user) return "/pricing/?browse=1";
  if (userIsDashboardAdmin(user)) return "/dashboard/?view=sessions";
  return defaultDashboardPathForUser(user, platform);
}

export function isModuleAdminOnlyWip(module: string): boolean {
  if (!ADMIN_ONLY_WIP_SECTIONS) return false;
  return ADMIN_ONLY_WIP_MODULES.has(module.trim().toLowerCase());
}

export function isNavItemAdminOnlyWip(navId: string): boolean {
  if (!ADMIN_ONLY_WIP_SECTIONS) return false;
  return ADMIN_ONLY_WIP_NAV_IDS.has(navId);
}

/** True for /dashboard/journal/*, /dashboard/cot/*, and /bootcamp/* while WIP gate is on. */
export function isPathAdminOnlyWip(path: string): boolean {
  if (!ADMIN_ONLY_WIP_SECTIONS) return false;
  const p = path.split("?")[0].split("#")[0];
  if (p === "/bootcamp" || p.startsWith("/bootcamp/")) return true;
  const mod = dashboardPathToModule(p);
  return mod !== null && isModuleAdminOnlyWip(mod);
}

export function userCanAccessAdminOnlyWipPath(
  user: DashboardUser | null,
  path: string
): boolean {
  if (!isPathAdminOnlyWip(path)) return true;
  return userIsDashboardAdmin(user);
}

export type DashboardGateVariant =
  | "subscription"
  | "subscription_ended"
  | "payment_required"
  | "access_period_ended"
  | "admin_restricted"
  | "platform_section_disabled";

export type PlatformFeatures = {
  sections?: Partial<Record<PlatformSectionKey, boolean>>;
  sections_globally_enabled?: Partial<Record<PlatformSectionKey, boolean>>;
  /** @deprecated use sections.sessions */
  backtest_sessions_enabled?: boolean;
};

function normalizePlatformSections(
  platform?: PlatformFeatures | null
): Record<PlatformSectionKey, boolean> {
  const out = {} as Record<PlatformSectionKey, boolean>;
  for (const key of PLATFORM_SECTION_KEYS) {
    const fromSections = platform?.sections?.[key];
    if (fromSections !== undefined) {
      out[key] = fromSections !== false;
    } else if (key === "sessions" && platform?.backtest_sessions_enabled !== undefined) {
      out[key] = platform.backtest_sessions_enabled !== false;
    } else {
      out[key] = true;
    }
  }
  return out;
}

export function userHasPlatformSection(
  user: DashboardUser | null,
  platform: PlatformFeatures | null | undefined,
  section: PlatformSectionKey
): boolean {
  if (!user) return false;
  if (userIsDashboardAdmin(user)) return true;
  return normalizePlatformSections(platform)[section];
}

export function v16ViewToPlatformSection(view: string | null | undefined): PlatformSectionKey | null {
  const v = String(view || "").trim().toLowerCase();
  const map: Record<string, PlatformSectionKey> = {
    dashboard: "dashboard",
    trades: "trades",
    sessions: "sessions",
    backtest: "sessions",
    stratbank: "strategies",
    strategies: "strategies",
    resources: "resources",
  };
  return map[v] ?? null;
}

/** Resolve which platform section a URL targets (null = profile/admin/hub exempt). */
export function platformSectionForPath(path: string, search = ""): PlatformSectionKey | null {
  const p = path.split("?")[0].split("#")[0];
  const raw = search || (p === path ? "" : path.split("?")[1] || "");
  const qs = raw.startsWith("?") ? raw.slice(1) : raw;
  const params = new URLSearchParams(qs);
  const view = params.get("view");
  const tab = params.get("tab");

  if (p === "/bootcamp" || p.startsWith("/bootcamp/")) return "resources";
  if (p.startsWith("/dashboard/support")) return "support";
  if (p.startsWith("/dashboard/strategies")) return "strategies";
  if (p.startsWith("/dashboard/sessions") || p.startsWith("/dashboard/backtest")) return "sessions";
  if (p.startsWith("/dashboard/trades")) return "trades";
  if (p.startsWith("/dashboard/profile") && tab === "support") return "support";
  if (p === "/dashboard" || p === "/dashboard/") {
    if (view === "profile" && tab === "support") return "support";
    if (!view || view === "profile") return view === "profile" ? null : "dashboard";
    return v16ViewToPlatformSection(view);
  }
  return null;
}

/** @deprecated use platformSectionForPath + userHasPlatformSection */
export function userHasBacktestSessionsAccess(
  user: DashboardUser | null,
  platform?: PlatformFeatures | null
): boolean {
  return userHasPlatformSection(user, platform, "sessions");
}

/** @deprecated use platformSectionForPath */
export function isBacktestSessionsPath(path: string, search = ""): boolean {
  const sec = platformSectionForPath(path, search);
  return sec === "sessions" || sec === "trades";
}

export type DashboardUser = {
  role?: string;
  has_journal_access?: boolean;
  has_active_subscription?: boolean;
  access_denial_reason?: string;
  billing_issue?: boolean;
  access_expired_at?: string;
  lapsed_subscription?: {
    plan_id?: number;
    plan_name?: string;
    status?: string;
    current_period_end?: string;
    cancel_at_period_end?: boolean;
  };
  manual_full_access?: boolean;
  has_dashboard_access?: boolean;
  dashboard_modules?: Record<string, boolean>;
  subscription?: { status?: string };
};

export function userHasPaidFullDashboard(user: DashboardUser | null): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.has_active_subscription) return true;
  const st = user.subscription?.status?.toLowerCase();
  if (st === "active" || st === "trialing") return true;
  if (user.manual_full_access) return true;
  return false;
}

export function userHasJournalEntitlement(user: DashboardUser | null): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  return !!user.has_journal_access;
}

export function userHasAnyDashboardAccess(user: DashboardUser | null): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.has_dashboard_access) return true;
  const mods = user.dashboard_modules;
  return !!(mods && Object.values(mods).some(Boolean));
}

export function userHasDashboardModule(
  user: DashboardUser | null,
  module: string
): boolean {
  if (!user) return false;
  const key = module.trim().toLowerCase();
  if (isModuleAdminOnlyWip(key)) return userIsDashboardAdmin(user);
  if (userHasPaidFullDashboard(user)) return true;
  return !!user.dashboard_modules?.[key];
}

const V16_VIEW_PATHS: Record<PlatformSectionKey, string> = {
  dashboard: "/dashboard/",
  trades: "/dashboard/?view=trades",
  sessions: "/dashboard/?view=sessions",
  strategies: "/dashboard/?view=stratbank",
  resources: "/bootcamp/",
  support: "/dashboard/?view=profile&tab=support",
};

/** First allowed V16/shell path for redirects when a section is disabled. */
export function firstAllowedPlatformDashboardPath(
  user: DashboardUser | null,
  platform?: PlatformFeatures | null
): string {
  if (!user) return "/pricing/?browse=1";
  if (userIsDashboardAdmin(user)) return "/dashboard/?view=sessions";
  const order: PlatformSectionKey[] = [
    "dashboard",
    "sessions",
    "trades",
    "strategies",
    "resources",
    "support",
  ];
  for (const sec of order) {
    if (userHasPlatformSection(user, platform, sec)) {
      return V16_VIEW_PATHS[sec];
    }
  }
  return "/dashboard/profile/";
}

/** First dashboard path the user may open (for redirects). */
export function defaultDashboardPathForUser(
  user: DashboardUser | null,
  platform?: PlatformFeatures | null
): string {
  if (!user) return "/pricing/?browse=1";
  if (userIsDashboardAdmin(user)) {
    return "/dashboard/?view=sessions";
  }
  if (userHasPaidFullDashboard(user)) {
    if (ADMIN_ONLY_WIP_SECTIONS) {
      return firstAllowedPlatformDashboardPath(user, platform);
    }
    return "/dashboard/journal/";
  }
  const order = ["journal", "backtest", "strategies", "cot", "community", "chart"] as const;
  for (const mod of order) {
    if (isModuleAdminOnlyWip(mod)) continue;
    if (user.dashboard_modules?.[mod]) {
      if (mod === "backtest") {
        if (userHasPlatformSection(user, platform, "sessions")) {
          return "/dashboard/?view=sessions";
        }
        continue;
      }
      if (mod === "strategies") {
        if (userHasPlatformSection(user, platform, "strategies")) {
          return "/dashboard/?view=stratbank";
        }
        continue;
      }
    }
  }
  return firstAllowedPlatformDashboardPath(user, platform);
}

export function dashboardPathToModule(path: string): string | null {
  const p = path.split("?")[0].split("#")[0];
  if (!p.startsWith("/dashboard")) return null;
  if (
    p.startsWith("/dashboard/profile") ||
    p.startsWith("/dashboard/support") ||
    p.startsWith("/dashboard/admin")
  ) {
    return null;
  }
  if (p === "/dashboard" || p === "/dashboard/") return null;
  if (p.startsWith("/dashboard/journal")) return "journal";
  if (p.startsWith("/dashboard/trades")) return "backtest";
  if (p.startsWith("/dashboard/backtest") || p.startsWith("/dashboard/sessions"))
    return "backtest";
  if (p.startsWith("/dashboard/strategies")) return "strategies";
  if (p.startsWith("/dashboard/cot")) return "cot";
  return "journal";
}

export function dashboardPathRequiresPaidJournal(path: string): boolean {
  return dashboardPathToModule(path) !== null;
}

export function pathRequiresPlatformOrModuleGate(path: string, search = ""): boolean {
  return dashboardPathRequiresPaidJournal(path) || platformSectionForPath(path, search) !== null;
}

export function userCanAccessDashboardPath(
  user: DashboardUser | null,
  path: string,
  platform?: PlatformFeatures | null,
  search = ""
): boolean {
  if (!userCanAccessAdminOnlyWipPath(user, path)) return false;
  const section = platformSectionForPath(path, search);
  if (section && !userHasPlatformSection(user, platform, section)) {
    return false;
  }
  const mod = dashboardPathToModule(path);
  if (mod === null) return true;
  return userHasDashboardModule(user, mod);
}

export function userHasPartialDashboardAccess(user: DashboardUser | null): boolean {
  if (!user || userHasPaidFullDashboard(user)) return false;
  return userHasAnyDashboardAccess(user);
}

export function lockedModuleGateReason(
  user: DashboardUser | null,
  module: string
): "none" | "subscription" | "admin_restricted" {
  if (!user || !module || userHasDashboardModule(user, module)) return "none";
  if (userHasPartialDashboardAccess(user)) return "admin_restricted";
  return "subscription";
}

export function resolveDashboardGateVariant(
  user: DashboardUser | null,
  path?: string,
  search = "",
  platform?: PlatformFeatures | null
): DashboardGateVariant {
  if (path) {
    const section = platformSectionForPath(path, search);
    if (section && user && !userHasPlatformSection(user, platform, section)) {
      return "platform_section_disabled";
    }
  }
  if (!user) return "subscription";
  if (userHasPartialDashboardAccess(user)) return "admin_restricted";
  const reason = user.access_denial_reason;
  if (reason === "subscription_ended") return "subscription_ended";
  if (reason === "access_period_ended") return "access_period_ended";
  if (reason === "payment_required" || user.billing_issue) return "payment_required";
  return "subscription";
}

export function lockedModuleNavTitle(
  user: DashboardUser | null,
  module: string,
  isArabic: boolean
): string | undefined {
  const reason = lockedModuleGateReason(user, module);
  if (reason === "none" || !user) return undefined;
  if (reason === "admin_restricted") {
    return isArabic
      ? "هذا القسم غير مفعّل لحسابك — تواصل مع الدعم"
      : "This section is not enabled on your account — contact support";
  }
  if (user.access_denial_reason === "subscription_ended") {
    return isArabic
      ? "انتهى اشتراكك — تجديد من صفحة الأسعار"
      : "Your subscription ended — renew on pricing";
  }
  if (user.access_denial_reason === "access_period_ended") {
    return isArabic
      ? "انتهت فترة الوصول — تجديد من صفحة الأسعار"
      : "Your access period ended — renew on pricing";
  }
  if (user.access_denial_reason === "payment_required" || user.billing_issue) {
    return isArabic
      ? "مطلوب تحديث الدفع — إعدادات الحساب أو الأسعار"
      : "Payment update required — account settings or pricing";
  }
  return isArabic
    ? "يتطلب اشتراكاً نشطاً — عرض الخطط والأسعار"
    : "Active subscription required — view plans & pricing";
}

export function navIdPlatformSection(navId: string): PlatformSectionKey | null {
  return NAV_ID_TO_PLATFORM_SECTION[navId] ?? null;
}

export function userCanUseNavId(
  user: DashboardUser | null,
  navId: string,
  platform?: PlatformFeatures | null
): boolean {
  const section = navIdPlatformSection(navId);
  if (!section) return true;
  return userHasPlatformSection(user, platform, section);
}
