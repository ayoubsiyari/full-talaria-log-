/** V16 embedded app views (sessView ids in TalariaV16.jsx). */
export type V16DashboardViewId =
  | "dashboard"
  | "trades"
  | "sessions"
  | "stratbank"
  | "resources";

const V16_VIEW_ALIASES: Record<string, V16DashboardViewId> = {
  dashboard: "dashboard",
  trades: "trades",
  backtest: "sessions",
  sessions: "sessions",
  strategies: "stratbank",
  stratbank: "stratbank",
  strategy: "stratbank",
  resources: "resources",
};

/** Shell sidebar id → V16 sessView id */
export const SHELL_NAV_TO_V16_VIEW: Record<string, V16DashboardViewId> = {
  dashboard: "dashboard",
  trades: "trades",
  backtest: "sessions",
  strategies: "stratbank",
};

export function normalizeV16DashboardView(
  raw: string | null | undefined
): V16DashboardViewId | null {
  const key = String(raw || "")
    .trim()
    .toLowerCase();
  if (!key) return null;
  return V16_VIEW_ALIASES[key] ?? null;
}

export function v16DashboardHref(
  view: V16DashboardViewId = "dashboard",
  extra?: Record<string, string | null | undefined>
): string {
  const params = new URLSearchParams();
  if (view !== "dashboard") params.set("view", view);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v != null && String(v).trim()) params.set(k, String(v).trim());
    }
  }
  const qs = params.toString();
  return qs ? `/dashboard/?${qs}` : "/dashboard/";
}

export function shellNavIdUsesV16Root(id: string): boolean {
  return id in SHELL_NAV_TO_V16_VIEW;
}
