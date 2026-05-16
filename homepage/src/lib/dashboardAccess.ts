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

export type DashboardUser = {
  role?: string;
  has_journal_access?: boolean;
  dashboard_modules?: Record<string, boolean>;
};

export function userHasJournalEntitlement(user: DashboardUser | null): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  return !!user.has_journal_access;
}

export function userHasDashboardModule(
  user: DashboardUser | null,
  module: string
): boolean {
  if (!user) return false;
  if (userHasJournalEntitlement(user)) return true;
  const key = module.trim().toLowerCase();
  return !!user.dashboard_modules?.[key];
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
  const mod = dashboardPathToModule(path);
  if (mod === null) return true;
  return userHasDashboardModule(user, mod);
}
