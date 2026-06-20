import { JOURNAL_SUBSCRIPTIONS_API } from "@/lib/subscriptionApi";

export type SessionLimitGateData = {
  count: number;
  cap: number;
  planName: string | null;
  planId: number | null;
  subscriptionStatus: string | null;
  isManualPlan: boolean;
  hasActiveSubscription: boolean;
};

export type SessionLimitUpgradeAction = {
  label: string;
  href: string;
  hint: string;
};

type MeUserLike = {
  role?: string;
  trading_sessions_count?: number;
  max_trading_sessions?: number;
  subscription?: {
    id?: number;
    plan_name?: string;
    status?: string;
    is_manual?: boolean;
  } | null;
};

type PublicPlan = {
  id?: number;
  name?: string;
  price?: number;
  price_monthly?: number;
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
    planId: typeof sub?.id === "number" ? sub.id : null,
    subscriptionStatus: sub?.status || null,
    isManualPlan: Boolean(sub?.is_manual),
    hasActiveSubscription,
  };
}

export function resolveSessionLimitUpgrade(
  data: SessionLimitGateData,
  plans: PublicPlan[],
): SessionLimitUpgradeAction {
  const priced = plans
    .filter((p) => p.id != null)
    .map((p) => ({
      id: p.id as number,
      name: p.name || "",
      price: p.price_monthly ?? p.price ?? 0,
    }))
    .sort((a, b) => a.price - b.price);

  const highest = priced[priced.length - 1];
  const currentByName =
    data.planName &&
    priced.find((p) => p.name.toLowerCase() === data.planName!.toLowerCase());
  const onHighest =
    !!currentByName && !!highest && currentByName.id === highest.id;

  if (!data.hasActiveSubscription || !data.planName) {
    return {
      label: "Upgrade plan",
      href: "/pricing/?browse=1",
      hint: "Subscribe to unlock more backtest sessions and pro tools.",
    };
  }

  if (data.isManualPlan || onHighest) {
    return {
      label: "View plans",
      href: "/pricing/?browse=1",
      hint: "Need more sessions? Compare plans or contact support for a higher limit.",
    };
  }

  return {
    label: "Upgrade plan",
    href: "/pricing/?browse=1",
    hint: `You're on ${data.planName}. Upgrade for more backtest sessions.`,
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
