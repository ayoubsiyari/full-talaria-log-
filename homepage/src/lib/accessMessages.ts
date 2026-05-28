/** User-facing copy when login or dashboard access is blocked — keep in sync with API `access_denial_reason`. */

export type AccessDenialReason =
  | "account_disabled"
  | "subscription_ended"
  | "payment_required"
  | "access_period_ended"
  | "subscription_inactive"
  | "no_plan"
  | "subscription";

export function parseAuthApiError(
  body: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  const denial = parseAuthAccessDenial(body);
  if (denial) return denial.message;
  if (!body || typeof body !== "object") return fallback;
  const record = body as Record<string, unknown>;
  const detail = record.detail ?? record.error ?? record.message;
  if (detail && typeof detail === "object" && detail !== null) {
    const msg = (detail as Record<string, unknown>).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  if (typeof detail === "string" && detail.trim()) return detail;
  if (typeof record.message === "string" && record.message.trim()) return record.message;
  return fallback;
}

const RENEWABLE_DENIAL_CODES = new Set([
  "subscription",
  "subscription_ended",
  "payment_required",
  "access_period_ended",
  "subscription_inactive",
  "no_plan",
]);

export type ParsedAccessDenial = {
  code: string;
  message: string;
  canRenew: boolean;
};

/** Structured 403 from chart login when subscription/access ended. */
export function parseAuthAccessDenial(body: unknown): ParsedAccessDenial | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const detail = record.detail;
  if (!detail || typeof detail !== "object") return null;
  const d = detail as Record<string, unknown>;
  const code = typeof d.code === "string" ? d.code : "";
  const message = typeof d.message === "string" ? d.message.trim() : "";
  if (!code || !message) return null;
  return {
    code,
    message,
    canRenew: RENEWABLE_DENIAL_CODES.has(code),
  };
}

function formatShortDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function accessDenialTitle(reason?: string | null): string {
  switch (reason) {
    case "account_disabled":
      return "Account deactivated";
    case "subscription_ended":
      return "Your subscription has ended";
    case "payment_required":
      return "Payment update required";
    case "access_period_ended":
      return "Your access period has ended";
    case "subscription_inactive":
      return "Subscription inactive";
    case "no_plan":
      return "No active plan";
    default:
      return "Subscription required";
  }
}

export function accessDenialMessage(
  reason?: string | null,
  opts?: { planName?: string | null; expiredAt?: string | null },
): string {
  const plan = opts?.planName?.trim();
  const ended = formatShortDate(opts?.expiredAt);
  switch (reason) {
    case "account_disabled":
      return "Your account has been deactivated by an administrator. Contact support if you believe this is a mistake.";
    case "subscription_ended":
      if (plan && ended) {
        return `Your ${plan} subscription ended on ${ended}. Renew below to restore journal, backtest, and pro tools.`;
      }
      if (plan) {
        return `Your ${plan} subscription has ended. Renew below to restore journal, backtest, and pro tools.`;
      }
      return "Your billing period has ended. Renew a plan below to restore journal, backtest, and pro tools.";
    case "payment_required":
      return "We could not collect your last payment. Update your card or complete checkout below to restore access.";
    case "access_period_ended":
      if (ended) {
        return `Your complimentary access ended on ${ended}. Subscribe below to continue using Talaria Log.`;
      }
      return "Your access period has ended. Subscribe below to continue using Talaria Log.";
    case "subscription_inactive":
      return "Your subscription is no longer active. Choose a plan below to sign back in to the dashboard.";
    case "no_plan":
      return "You do not have an active plan yet. Choose a plan below to unlock the dashboard.";
    default:
      return "An active subscription is required. Choose a plan below to continue.";
  }
}

export function pricingUrlForAccessDenial(reason?: string | null): string {
  const params = new URLSearchParams({ browse: "1" });
  if (reason) params.set("reason", reason);
  return `/pricing/?${params.toString()}`;
}
