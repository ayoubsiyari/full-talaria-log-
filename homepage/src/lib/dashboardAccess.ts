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
  user: DashboardUser | null
): string {
  if (!user) return "/pricing/?browse=1";
  if (userIsDashboardAdmin(user)) return "/dashboard/backtest/";
  return defaultDashboardPathForUser(user);
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
  | "admin_restricted";

export type DashboardUser = {
  role?: string;
  /** Journal API / billing entitlement (subscription, extension window, manual full). */
  has_journal_access?: boolean;
  /** Active Stripe subscription (active/trialing) — always unlocks all dashboard sections. */
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
  /** Admin manual "all sections" flag (raw DB column). */
  manual_full_access?: boolean;
  /** True when full subscription/manual access OR any admin-granted section. */
  has_dashboard_access?: boolean;
  dashboard_modules?: Record<string, boolean>;
  subscription?: { status?: string };
};

/** Paying subscribers and manual full-access always get every section. */
export function userHasPaidFullDashboard(user: DashboardUser | null): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.has_active_subscription) return true;
  const st = user.subscription?.status?.toLowerCase();
  if (st === "active" || st === "trialing") return true;
  if (user.manual_full_access) return true;
  return false;
}

/** Journal API entitlement — not used for per-section dashboard nav. */
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

/** Section access — paid/full users get everything; others use admin-granted modules. */
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

/** First dashboard path the user may open (for redirects). */
export function defaultDashboardPathForUser(user: DashboardUser | null): string {
  if (!user) return "/pricing/?browse=1";
  if (userIsDashboardAdmin(user)) {
    return "/dashboard/backtest/";
  }
  if (userHasPaidFullDashboard(user)) {
    if (ADMIN_ONLY_WIP_SECTIONS) {
      return "/dashboard/backtest/";
    }
    return "/dashboard/journal/";
  }
  const order = ["journal", "backtest", "strategies", "cot", "community", "chart"] as const;
  for (const mod of order) {
    if (isModuleAdminOnlyWip(mod)) continue;
    if (user.dashboard_modules?.[mod]) {
      if (mod === "backtest") return "/dashboard/backtest/";
      if (mod === "strategies") return "/dashboard/strategies/";
    }
  }
  return "/pricing/?browse=1";
}

/** Map dashboard URL to module key; null = hub / exempt (profile, support, admin). */
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

export function userCanAccessDashboardPath(
  user: DashboardUser | null,
  path: string
): boolean {
  if (!userCanAccessAdminOnlyWipPath(user, path)) return false;
  const mod = dashboardPathToModule(path);
  if (mod === null) return true;
  return userHasDashboardModule(user, mod);
}

/** Has at least one admin-granted section but not a full paid/manual plan. */
export function userHasPartialDashboardAccess(user: DashboardUser | null): boolean {
  if (!user || userHasPaidFullDashboard(user)) return false;
  return userHasAnyDashboardAccess(user);
}

/** Why a module is locked — drives nav tooltips and gate copy (not always billing). */
export function lockedModuleGateReason(
  user: DashboardUser | null,
  module: string
): "none" | "subscription" | "admin_restricted" {
  if (!user || !module || userHasDashboardModule(user, module)) return "none";
  if (userHasPartialDashboardAccess(user)) return "admin_restricted";
  return "subscription";
}

/** Full-screen gate copy when user cannot open a paid dashboard section. */
export function resolveDashboardGateVariant(user: DashboardUser | null): DashboardGateVariant {
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
