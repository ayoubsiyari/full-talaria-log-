import { JOURNAL_SUBSCRIPTIONS_API } from "@/lib/subscriptionApi";

export type SessionLimitGateData = {
  count: number;
  cap: number;
  planName: string | null;
  planId: number | null;
  subscriptionStatus: string | null;
  isManualPlan: boolean;
  hasActiveSubscription: boolean;
  hasStripeCustomer?: boolean;
};

export type SessionLimitUpgradeMode = "checkout" | "portal" | "pricing";

export type SessionLimitUpgradeAction = {
  mode: SessionLimitUpgradeMode;
  label: string;
  hint: string;
  planId?: number;
  planName?: string;
  nextSessionCap?: number | null;
  href?: string;
};

export type PublicPlan = {
  id?: number;
  name?: string;
  price?: number;
  price_monthly?: number;
  max_trading_sessions?: number | null;
};

type MeUserLike = {
  role?: string;
  trading_sessions_count?: number;
  max_trading_sessions?: number;
  stripe_customer_id?: string | null;
  subscription?: {
    id?: number;
    plan_id?: number;
    plan_name?: string;
    status?: string;
    is_manual?: boolean;
  } | null;
};

export function sessionLimitFromMeUser(u: MeUserLike | null | undefined): SessionLimitGateData | null {
  if (!u || u.role === "admin") return null;
  const count = Number(u.trading_sessions_count ?? 0);
  const cap = Number(u.max_trading_sessions ?? 5);
  if (cap <= 0 || count < cap) return null;
  const sub = u.subscription;
  const status = (sub?.status || "").toLowerCase();
  const hasActiveSubscription = Boolean(sub && ["active", "trialing"].includes(status));
  return {
    count,
    cap,
    planName: sub?.plan_name?.trim() || null,
    planId: typeof sub?.plan_id === "number" ? sub.plan_id : null,
    subscriptionStatus: sub?.status || null,
    isManualPlan: Boolean(sub?.is_manual),
    hasActiveSubscription,
    hasStripeCustomer: Boolean((u.stripe_customer_id || "").trim()),
  };
}

function planPrice(p: PublicPlan): number {
  return p.price_monthly ?? p.price ?? 0;
}

function planSessionCap(p: PublicPlan): number {
  const raw = p.max_trading_sessions;
  return raw == null ? 0 : Math.max(0, Number(raw) || 0);
}

/** Cheapest active plan that allows more backtest sessions than the user's current cap. */
export function findNextUpgradePlan(
  plans: PublicPlan[],
  currentCap: number,
  currentPlanId: number | null,
  currentPlanName: string | null,
): PublicPlan | null {
  const active = plans.filter((p) => p.id != null);
  const withCaps = active.filter((p) => planSessionCap(p) > currentCap);
  if (withCaps.length) {
    return [...withCaps].sort((a, b) => planSessionCap(a) - planSessionCap(b) || planPrice(a) - planPrice(b))[0];
  }

  const sorted = [...active].sort((a, b) => planPrice(a) - planPrice(b));
  if (currentPlanId != null) {
    const idx = sorted.findIndex((p) => p.id === currentPlanId);
    if (idx >= 0 && idx < sorted.length - 1) return sorted[idx + 1];
  }
  if (currentPlanName) {
    const idx = sorted.findIndex(
      (p) => (p.name || "").toLowerCase() === currentPlanName.toLowerCase(),
    );
    if (idx >= 0 && idx < sorted.length - 1) return sorted[idx + 1];
  }
  return null;
}

export function resolveSessionLimitUpgrade(
  data: SessionLimitGateData,
  plans: PublicPlan[],
): SessionLimitUpgradeAction {
  const next = findNextUpgradePlan(plans, data.cap, data.planId, data.planName);
  const nextCap = next ? planSessionCap(next) : null;
  const capHint =
    nextCap && nextCap > data.cap
      ? `Unlock up to ${nextCap} backtest sessions.`
      : "Higher tiers include more backtest sessions.";

  if (data.isManualPlan) {
    return {
      mode: "pricing",
      label: "View plans",
      hint: "Your access is manually assigned. Compare plans or contact support for a higher session limit.",
      href: "/pricing/?browse=1",
      planId: next?.id,
      planName: next?.name,
      nextSessionCap: nextCap,
    };
  }

  if (!data.hasActiveSubscription) {
    if (next?.id) {
      return {
        mode: "checkout",
        label: next.name ? `Subscribe to ${next.name}` : "Subscribe now",
        hint: capHint,
        planId: next.id,
        planName: next.name,
        nextSessionCap: nextCap,
      };
    }
    return {
      mode: "pricing",
      label: "View plans & pricing",
      hint: "Choose a plan to unlock more backtest sessions.",
      href: "/pricing/?browse=1",
    };
  }

  if (next?.id && data.hasStripeCustomer && !data.isManualPlan) {
    return {
      mode: "portal",
      label: next.name ? `Upgrade to ${next.name}` : "Manage subscription",
      hint:
        nextCap && nextCap > data.cap
          ? `You're on ${data.planName || "your current plan"}. ${capHint} Change plan in Stripe billing.`
          : `You're on ${data.planName || "your current plan"}. Open billing to change or upgrade your plan.`,
      planId: next.id,
      planName: next.name,
      nextSessionCap: nextCap,
    };
  }

  if (next?.id) {
    return {
      mode: "checkout",
      label: next.name ? `Upgrade to ${next.name}` : "Upgrade plan",
      hint: capHint,
      planId: next.id,
      planName: next.name,
      nextSessionCap: nextCap,
    };
  }

  return {
    mode: "pricing",
    label: "View plans",
    hint: "You're on the highest listed plan. Contact support if you need a custom session limit.",
    href: "/pricing/?browse=1",
    planName: data.planName || undefined,
  };
}

export async function fetchPublicPlans(): Promise<PublicPlan[]> {
  try {
    const res = await fetch(`${JOURNAL_SUBSCRIPTIONS_API}/public/plans`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { plans?: PublicPlan[] };
    return Array.isArray(data.plans) ? data.plans : [];
  } catch {
    return [];
  }
}

export function sessionLimitSupportHref(): string {
  return "/dashboard/?view=profile&tab=support&topic=session-limit";
}

export const SESSION_LIMIT_SUPPORT_EMAIL = "support-center@talaria-log.com";

export function sessionLimitMailtoHref(): string {
  const subject = "Backtest session limit — upgrade request";
  const body =
    "Hi Talaria support,\n\nI reached my backtest session limit and would like help increasing it or upgrading my plan.\n\nThank you.";
  return `mailto:${SESSION_LIMIT_SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
