"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Loader2,
  Check,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  Tag,
  X,
} from "lucide-react";
import { JOURNAL_SUBSCRIPTIONS_API } from "@/lib/subscriptionApi";
import { accessDenialMessage, accessDenialTitle } from "@/lib/accessMessages";

const F = "'Exo 2', sans-serif";
const C = {
  bg: "#07080E",
  el: "#0F1119",
  card: "#111318",
  border: "rgba(140,160,255,0.12)",
  borderHi: "rgba(74,106,255,0.35)",
  tx: "rgba(255,255,255,0.92)",
  ts: "rgba(255,255,255,0.55)",
  tm: "rgba(255,255,255,0.38)",
  ac: "#4A6AFF",
  acGlow: "rgba(38,67,247,0.22)",
} as const;

function parseFeatures(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

type PlanRow = {
  id: number;
  name: string;
  description?: string | null;
  price?: number;
  price_monthly?: number;
  price_yearly?: number;
  trial_days?: number;
  is_popular?: boolean;
  features?: unknown;
  max_trading_sessions?: number | null;
  max_tickers_per_session?: number | null;
  max_supporting_tickers_per_session?: number | null;
  tier_rank?: number;
};

function planEntitlementLines(plan: PlanRow): string[] {
  const lines: string[] = [];
  const ms = plan.max_trading_sessions;
  if (ms != null) {
    if (ms === 0) lines.push("Unlimited backtest sessions");
    else if (ms > 0) lines.push(`${ms} backtest session${ms === 1 ? "" : "s"}`);
  }
  const mt = plan.max_tickers_per_session;
  if (mt != null) {
    if (mt === 0) lines.push("Unlimited trading tickers per session");
    else if (mt > 0) lines.push(`${mt} trading ticker${mt === 1 ? "" : "s"} per session`);
  }
  const mst = plan.max_supporting_tickers_per_session;
  if (mst != null) {
    if (mst === 0) lines.push("Unlimited supporting tickers per session");
    else if (mst > 0) {
      lines.push(`${mst} supporting ticker${mst === 1 ? "" : "s"} per session`);
    }
  }
  return lines;
}

const ENTITLEMENT_FEATURE_RES = [
  /^\d+\s+backtest\s+sessions?$/i,
  /^\d+\s+trading\s+tickers?\s+per\s+session$/i,
  /^\d+\s+supporting\s+tickers?\s+per\s+session$/i,
  /^unlimited\s+backtest\s+sessions?$/i,
  /^unlimited\s+(trading\s+)?tickers?\s+per\s+session$/i,
  /^unlimited\s+supporting\s+tickers?\s+per\s+session$/i,
];

function isEntitlementFeatureLine(line: string): boolean {
  const text = line.trim();
  if (!text) return false;
  return ENTITLEMENT_FEATURE_RES.some((re) => re.test(text));
}

/** Caps from plan fields first, then marketing bullets — strips duplicate cap lines from DB. */
function buildPlanFeatureList(plan: PlanRow): string[] {
  const caps = planEntitlementLines(plan);
  const stored = Array.isArray(plan.features) ? (plan.features as string[]) : parseFeatures(plan.features);
  const extras = stored
    .map((f) => String(f).trim())
    .filter(Boolean)
    .filter((line) => !isEntitlementFeatureLine(line));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of [...caps, ...extras]) {
    const key = line.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

type SubscriptionPayload = {
  has_subscription?: boolean;
  has_journal_access?: boolean;
  billing_issue?: boolean;
  access_denial_reason?: string;
  access_expired_at?: string;
  plan?: { id?: number; name?: string };
  subscription?: {
    status?: string;
    current_period_end?: string;
    cancel_at_period_end?: boolean;
  };
  lapsed_subscription?: {
    plan_id?: number;
    plan_name?: string;
    status?: string;
    current_period_end?: string;
  };
};

export default function PricingClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const browseMode = searchParams.get("browse") === "1";
  const urlReason = searchParams.get("reason");

  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<number | null>(null);
  const [currentSubscription, setCurrentSubscription] = useState<SubscriptionPayload | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  /** After `/my-subscription` (or admin short-circuit); avoids showing Dashboard before we know entitlement. */
  const [accessNavReady, setAccessNavReady] = useState(false);
  const [userIsAdmin, setUserIsAdmin] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponValidating, setCouponValidating] = useState(false);
  const [couponResult, setCouponResult] = useState<{
    valid: boolean;
    error?: string;
    remaining?: number;
    discount?: { code: string; label: string };
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      if (!token) {
        setAccessNavReady(true);
        await fetchPlans();
        if (!cancelled) setLoading(false);
        return;
      }
      setIsLoggedIn(true);
      let isAdmin = false;
      try {
        const payload = JSON.parse(atob(token.split(".")[1] || ""));
        isAdmin = payload.is_admin === true || payload.role === "admin";
      } catch {
        /* ignore */
      }
      if (!cancelled) setUserIsAdmin(isAdmin);
      if (isAdmin) {
        if (!cancelled) setAccessNavReady(true);
        await fetchPlans();
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const redirected = await checkAuthAndMaybeRedirectSubscriptionPage(token, browseMode);
        if (cancelled || redirected) return;
      } finally {
        if (!cancelled) setAccessNavReady(true);
      }
      await fetchPlans();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [browseMode]);

  const checkAuthAndMaybeRedirectSubscriptionPage = async (
    token: string,
    allowPricingBrowse: boolean,
  ): Promise<boolean> => {
    try {
      const res = await fetch(`${JOURNAL_SUBSCRIPTIONS_API}/my-subscription`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return false;
      const data = (await res.json()) as SubscriptionPayload;
      setCurrentSubscription(data);

      const entitled =
        (data.has_subscription && ["active", "trialing"].includes(data.subscription?.status || "")) ||
        data.has_journal_access === true;
      if (!entitled && !allowPricingBrowse) {
        const reason = data.access_denial_reason || "subscription";
        window.location.href = `/pricing/?browse=1&reason=${encodeURIComponent(reason)}`;
        return true;
      }
    } catch {
      /* show pricing */
    }
    return false;
  };

  const fetchPlans = async () => {
    setPlansError(null);
    try {
      const res = await fetch(`${JOURNAL_SUBSCRIPTIONS_API}/public/plans`, {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        plans?: PlanRow[];
        error?: string;
        success?: boolean;
      };
      if (!res.ok) {
        setPlansError(data.error || `Could not load plans (HTTP ${res.status}). Is journal-backend running?`);
        return;
      }
      if (data.plans?.length) {
        setPlans(data.plans.map((p) => ({ ...p, features: parseFeatures(p.features) })));
      } else {
        setPlansError("No active plans in the database. Add plans in admin or seed subscription_plans.");
      }
    } catch (e) {
      setPlansError(
        e instanceof Error
          ? `Cannot reach billing API: ${e.message}`
          : "Cannot reach billing API. Check journal-backend and /journal/api/subscriptions/public/plans"
      );
    }
  };

  const handleValidateCoupon = async () => {
    const code = couponCode.trim();
    if (!code) return;
    if (!isLoggedIn) {
      setCouponResult({ valid: false, error: "Please log in first" });
      return;
    }
    setCouponValidating(true);
    setCouponResult(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${JOURNAL_SUBSCRIPTIONS_API}/validate-coupon`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code }),
      });
      if (res.status === 429) {
        setCouponResult({ valid: false, error: "Too many attempts. Try again later." });
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data.valid) {
        setCouponResult({ valid: true, discount: data.discount });
      } else {
        setCouponResult({
          valid: false,
          error: data.error || "Invalid coupon",
          remaining: data.remaining_attempts,
        });
      }
    } catch {
      setCouponResult({ valid: false, error: "Could not validate coupon" });
    } finally {
      setCouponValidating(false);
    }
  };

  const handleRemoveCoupon = () => {
    setCouponCode("");
    setCouponResult(null);
  };

  const handleSubscribe = async (planId: number) => {
    if (!isLoggedIn) {
      const next = `${window.location.pathname}${window.location.search || ""}`;
      window.location.href = "/login/?next=" + encodeURIComponent(next || "/pricing/");
      return;
    }
    if (
      currentSubscription?.has_subscription &&
      ["active", "trialing"].includes(currentSubscription?.subscription?.status || "")
    ) {
      router.push("/dashboard/");
      return;
    }
    setCheckoutLoading(planId);
    try {
      const token = localStorage.getItem("token");
      const origin = window.location.origin;
      const cancelQs = browseMode ? "?browse=1" : "";
      const body: Record<string, unknown> = {
        plan_id: planId,
        billing_interval: billingCycle === "yearly" ? "year" : "month",
        success_url: `${origin}/pricing/success/`,
        cancel_url: `${origin}/pricing/${cancelQs}`,
      };
      if (couponResult?.valid && couponResult.discount?.code) {
        body.coupon_code = couponResult.discount.code;
      }
      const res = await fetch(`${JOURNAL_SUBSCRIPTIONS_API}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      } else {
        window.alert(data.error || "Failed to start checkout");
      }
    } catch {
      window.alert("Failed to start checkout. Please try again.");
    } finally {
      setCheckoutLoading(null);
    }
  };

  const getPrice = (plan: PlanRow) => {
    if (billingCycle === "yearly") {
      const yearly = plan.price_yearly || (plan.price_monthly || plan.price || 0) * 10;
      return Math.round(yearly / 12);
    }
    return plan.price_monthly ?? plan.price ?? 0;
  };

  const getTotalPrice = (plan: PlanRow) =>
    billingCycle === "yearly"
      ? plan.price_yearly || (plan.price_monthly || plan.price || 0) * 10
      : plan.price_monthly ?? plan.price ?? 0;

  const getSavings = (plan: PlanRow) => {
    const monthly = plan.price_monthly || plan.price || 0;
    const yearly = plan.price_yearly || (plan.price_monthly || plan.price || 0) * 10;
    if (monthly <= 0) return 0;
    return Math.round(((monthly * 12 - yearly) / (monthly * 12)) * 100);
  };

  const hasActivePaidPlan =
    !!currentSubscription?.has_subscription &&
    ["active", "trialing"].includes(currentSubscription?.subscription?.status ?? "");
  const showDashboardNav =
    accessNavReady &&
    (userIsAdmin || hasActivePaidPlan || currentSubscription?.has_journal_access === true);
  const lapsedInfo = currentSubscription?.lapsed_subscription;
  const denialReason =
    currentSubscription?.access_denial_reason || urlReason || null;
  const accessNotice = denialReason
    ? accessDenialMessage(denialReason, {
        planName: lapsedInfo?.plan_name,
        expiredAt:
          currentSubscription?.access_expired_at ||
          (lapsedInfo as SubscriptionPayload["lapsed_subscription"] | undefined)?.current_period_end,
      })
    : null;
  const showResumeBanner =
    isLoggedIn &&
    accessNavReady &&
    !hasActivePaidPlan &&
    !!accessNotice;

  const faqs = [
    {
      q: "Can I change my plan at any time?",
      a: "Yes. Upgrade or downgrade whenever you like. Changes are prorated and take effect immediately.",
    },
    {
      q: "Is there a free trial?",
      a: "Paid plans include a trial when configured on the plan. Card may be required depending on your region.",
    },
    {
      q: "What payment methods do you accept?",
      a: "Major credit and debit cards through Stripe.",
    },
    {
      q: "Can I cancel anytime?",
      a: "Yes. Cancel from billing; you keep access until the end of the paid period.",
    },
    {
      q: "What happens to my data if I cancel?",
      a: "Your data stays with your account. Resubscribe anytime to pick up where you left off.",
    },
  ];

  return (
    <div className="relative min-h-screen antialiased" style={{ fontFamily: F, background: C.bg, color: C.tx }}>
      <div className="pointer-events-none fixed inset-0 z-0">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(rgba(140,160,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(140,160,255,0.035) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />
        <div
          className="absolute left-1/2 top-[-18%] h-[min(520px,58vh)] w-[min(1100px,96vw)] -translate-x-1/2 rounded-full blur-[130px]"
          style={{ background: "rgba(38,67,247,0.16)" }}
        />
      </div>

      <nav
        className="sticky top-0 z-50 border-b backdrop-blur-xl"
        style={{ borderColor: C.border, background: "rgba(7,8,14,0.9)" }}
      >
        <div className="mx-auto flex h-[60px] max-w-[1280px] items-center justify-between px-5 sm:px-8 lg:px-10">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/logo-04.png"
              alt="Talaria"
              width={36}
              height={36}
              className="h-9 w-9 shrink-0"
              priority
            />
            <span className="text-[17px] font-extrabold tracking-tight">Talaria-Log</span>
          </Link>
          {isLoggedIn ? (
            showDashboardNav ? (
              <Link
                href="/dashboard/"
                className="flex items-center gap-1.5 text-[13px] text-white/45 transition-colors hover:text-white/75"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                Dashboard
              </Link>
            ) : accessNavReady ? null : (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-white/35" aria-label="Loading" />
            )
          ) : (
            <div className="flex items-center gap-3">
              <Link href="/login/" className="text-[13px] text-white/45 transition-colors hover:text-white/75">
                Log in
              </Link>
              <Link
                href="/login/?mode=signup"
                className="rounded-lg px-4 py-2 text-[13px] font-bold transition hover:brightness-110"
                style={{
                  background: `linear-gradient(135deg, #1e38e8, ${C.ac})`,
                  color: "rgba(255,255,255,0.96)",
                  boxShadow: "0 4px 16px rgba(38,67,247,0.35)",
                }}
              >
                Sign up
              </Link>
            </div>
          )}
        </div>
      </nav>

      {showResumeBanner && accessNotice && (
        <div className="relative z-10 mx-auto mt-6 max-w-[1280px] rounded-xl border border-amber-500/35 bg-amber-500/[0.07] px-5 py-3.5 text-left sm:px-8 lg:px-10">
          <p className="text-[14px] font-semibold text-white">{accessDenialTitle(denialReason)}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-amber-100/95">{accessNotice}</p>
        </div>
      )}

      <main className="relative z-10 mx-auto max-w-[1280px] px-5 pb-16 pt-10 sm:px-8 sm:pt-14 lg:px-10">
        <div className="mb-10 flex flex-col gap-8 lg:mb-12 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl text-left">
            <p className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.22em]" style={{ color: C.ac }}>
              Pricing
            </p>
            <h1 className="mb-4 text-[32px] font-extrabold leading-[1.08] tracking-tight sm:text-[40px] lg:text-[46px]">
              Simple plans,
              <br />
              powerful tools
            </h1>
            <p className="max-w-lg text-[15px] leading-relaxed" style={{ color: C.ts }}>
              Everything you need to analyze, journal, and backtest your trades. No hidden fees.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:max-w-md lg:max-w-[380px] lg:shrink-0">
            <div
              className="inline-flex w-full items-center rounded-xl border p-1"
              style={{ borderColor: C.border, background: C.el }}
            >
            {(["monthly", "yearly"] as const).map((cycle) => (
              <button
                key={cycle}
                type="button"
                onClick={() => setBillingCycle(cycle)}
                className={`flex-1 rounded-lg px-5 py-2 text-[13px] font-bold transition-all sm:flex-none ${
                  billingCycle === cycle ? "text-white shadow-sm" : ""
                }`}
                style={
                  billingCycle === cycle
                    ? { background: C.acGlow, color: C.tx, boxShadow: `0 0 0 1px ${C.borderHi}` }
                    : { color: C.tm }
                }
              >
                {cycle === "monthly" ? "Monthly" : "Yearly"}
                {cycle === "yearly" && (
                  <span className="ml-1.5 text-[10px] font-semibold text-emerald-400">−25%</span>
                )}
              </button>
            ))}
            </div>

        {couponResult?.valid ? (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3.5 py-2.5">
            <Tag className="h-3.5 w-3.5 flex-shrink-0 text-emerald-400" aria-hidden />
            <div className="min-w-0 flex-1">
              <span className="text-[13px] font-medium text-emerald-400">{couponResult.discount?.code}</span>
              <span className="ml-2 text-[11px] text-emerald-400/55">{couponResult.discount?.label}</span>
            </div>
            <button
              type="button"
              onClick={handleRemoveCoupon}
              className="text-white/25 transition-colors hover:text-white/50"
              aria-label="Remove coupon"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="w-full">
            <label
              htmlFor="pricing-coupon"
              className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em]"
              style={{ color: C.ts }}
            >
              <Tag className="h-3.5 w-3.5" style={{ color: C.ac }} aria-hidden />
              Coupon code
            </label>
            <div className="flex gap-2">
              <input
                id="pricing-coupon"
                type="text"
                value={couponCode}
                onChange={(e) => {
                  setCouponCode(e.target.value.toUpperCase());
                  if (couponResult) setCouponResult(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && handleValidateCoupon()}
                placeholder="Enter code"
                maxLength={50}
                className="min-h-[44px] w-full rounded-xl border px-4 py-2.5 text-[14px] font-semibold placeholder:text-white/45 focus:outline-none focus:ring-2 focus:ring-[rgba(74,106,255,0.35)]"
                style={{
                  borderColor: "rgba(140,160,255,0.32)",
                  background: "rgba(255,255,255,0.07)",
                  color: C.tx,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
                }}
              />
              <button
                type="button"
                onClick={handleValidateCoupon}
                disabled={!couponCode.trim() || couponValidating}
                className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border px-4 py-2.5 text-[13px] font-bold transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  borderColor: C.borderHi,
                  background: `linear-gradient(135deg, #1e38e8, ${C.ac})`,
                  color: "rgba(255,255,255,0.96)",
                }}
              >
                {couponValidating && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                Apply
              </button>
            </div>
          </div>
        )}
        {couponResult && !couponResult.valid && (
          <p className="-mt-1 text-[11px] text-red-400/70">
            {couponResult.error}
            {couponResult.remaining != null && couponResult.remaining > 0 && (
              <span className="ml-1 text-white/25">({couponResult.remaining} left)</span>
            )}
          </p>
        )}
          </div>
        </div>

        <section className="pb-12 sm:pb-16">
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-white/25" aria-hidden />
            </div>
          ) : plans.length === 0 ? (
            <div className="py-20 text-center px-4">
              <p className="text-sm text-white/50">
                {plansError || "No plans available yet. Check back soon."}
              </p>
            </div>
          ) : (
            <div
              className={`grid w-full gap-5 ${
                plans.length === 1
                  ? ""
                  : plans.length === 2
                    ? "sm:grid-cols-2"
                    : "sm:grid-cols-2 lg:grid-cols-3"
              }`}
            >
              {plans.map((plan, index) => {
                const isCurrentPlan = hasActivePaidPlan && currentSubscription?.plan?.id === plan.id;
                const isYourLapsedPlan =
                  !hasActivePaidPlan &&
                  !!lapsedInfo &&
                  ((lapsedInfo.plan_id && plan.id === lapsedInfo.plan_id) ||
                    (lapsedInfo.plan_name &&
                      plan.name &&
                      String(lapsedInfo.plan_name).toLowerCase() === String(plan.name).toLowerCase()));
                const isPro = plan.is_popular || plan.name?.toLowerCase().includes("pro");
                const price = getPrice(plan);
                const savings = getSavings(plan);
                const features = buildPlanFeatureList(plan);

                const isSingle = plans.length === 1;
                return (
                  <div
                    key={plan.id ?? index}
                    className={`relative flex flex-col overflow-hidden rounded-2xl border transition-all duration-300 ${
                      isSingle ? "lg:flex-row lg:items-stretch" : ""
                    }`}
                    style={{
                      background: C.card,
                      borderColor: isYourLapsedPlan
                        ? "rgba(245,158,11,0.45)"
                        : isPro
                          ? C.borderHi
                          : C.border,
                      boxShadow: isPro
                        ? "0 0 48px -16px rgba(38,67,247,0.35)"
                        : "0 12px 40px rgba(0,0,0,0.35)",
                    }}
                  >
                    {isPro && (
                      <div
                        className="absolute left-8 right-8 top-0 h-px"
                        style={{
                          background: `linear-gradient(90deg, transparent, ${C.ac}, transparent)`,
                        }}
                      />
                    )}

                    <div
                      className={`flex flex-col p-6 sm:p-8 ${isSingle ? "lg:max-w-[400px] lg:shrink-0 lg:border-r" : "flex-1"}`}
                      style={isSingle ? { borderColor: C.border } : undefined}
                    >
                      <div className="mb-5 flex items-center justify-between">
                        <span
                          className="text-[12px] font-extrabold uppercase tracking-[0.14em]"
                          style={{ color: isPro ? C.ac : C.tm }}
                        >
                          {plan.name}
                        </span>
                        <div className="flex flex-col items-end gap-1">
                          {isYourLapsedPlan && (
                            <span className="rounded border border-amber-500/35 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200">
                              Your plan
                            </span>
                          )}
                          {isPro && !isYourLapsedPlan && (
                            <span
                              className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                              style={{ background: C.acGlow, color: C.ac }}
                            >
                              Popular
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mb-1">
                        <span className="text-5xl font-extrabold tabular-nums tracking-tight sm:text-[52px]">
                          {price === 0 ? "Free" : `$${price}`}
                        </span>
                        {price > 0 && (
                          <span className="ml-1 text-base font-semibold" style={{ color: C.tm }}>
                            /mo
                          </span>
                        )}
                      </div>
                      {billingCycle === "yearly" && price > 0 ? (
                        <p className="mb-6 text-[12px] text-white/25">
                          ${getTotalPrice(plan)}/yr
                          {savings > 0 && (
                            <span className="ml-1 text-emerald-400/85">save {savings}%</span>
                          )}
                        </p>
                      ) : (
                        <p className="mb-6 text-[12px] text-white/25">{plan.description || "Billed monthly"}</p>
                      )}

                      {isCurrentPlan ? (
                        <button
                          type="button"
                          disabled
                          className="mb-6 w-full cursor-default rounded-xl border border-emerald-500/20 bg-emerald-500/10 py-2.5 text-[13px] font-medium text-emerald-300/80"
                        >
                          Current plan
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSubscribe(plan.id)}
                          disabled={checkoutLoading === plan.id}
                          className="mb-6 flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-[13px] font-bold transition-all disabled:opacity-40"
                          style={
                            isYourLapsedPlan || isPro || isSingle
                              ? {
                                  background: `linear-gradient(135deg, #1e38e8, ${C.ac})`,
                                  color: "rgba(255,255,255,0.96)",
                                  boxShadow: "0 6px 24px rgba(38,67,247,0.35)",
                                }
                              : {
                                  background: "rgba(255,255,255,0.06)",
                                  color: C.ts,
                                  border: `1px solid ${C.border}`,
                                }
                          }
                        >
                          {checkoutLoading === plan.id ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                              Processing…
                            </>
                          ) : (
                            <>
                              {isYourLapsedPlan
                                ? "Renew this plan"
                                : plan.trial_days && plan.trial_days > 0
                                  ? "Start free trial"
                                  : "Get started"}{" "}
                              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                            </>
                          )}
                        </button>
                      )}

                      {!!plan.trial_days && plan.trial_days > 0 && (
                        <p className="-mt-4 mb-5 text-center text-[11px] text-white/25">
                          {plan.trial_days}-day free trial
                        </p>
                      )}

                    </div>

                    <div className={`flex flex-1 flex-col p-6 sm:p-8 ${isSingle ? "lg:justify-center" : "border-t"}`} style={{ borderColor: C.border }}>
                      <p className="mb-4 text-[11px] font-extrabold uppercase tracking-[0.14em]" style={{ color: C.tm }}>
                        What&apos;s included
                      </p>
                      <ul className={`space-y-3 ${isSingle ? "sm:grid sm:grid-cols-2 sm:gap-x-6 sm:gap-y-3 sm:space-y-0" : ""}`}>
                        {features.map((feature, idx) => (
                          <li key={idx} className="flex items-start gap-2.5">
                            <Check className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: C.ac }} aria-hidden />
                            <span className="text-[14px] leading-snug" style={{ color: C.ts }}>
                              {feature}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {currentSubscription?.has_subscription && (
            <div className="mx-auto mt-8 flex max-w-lg flex-wrap items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/12">
                  <Check className="h-4 w-4 text-emerald-400" aria-hidden />
                </div>
                <div>
                  <p className="text-[13px] font-medium text-white/85">{currentSubscription.plan?.name}</p>
                  <p className="text-[11px] text-white/30">
                    {currentSubscription.subscription?.cancel_at_period_end
                      ? `Cancels ${new Date(currentSubscription.subscription.current_period_end || "").toLocaleDateString()}`
                      : `Renews ${new Date(currentSubscription.subscription?.current_period_end || "").toLocaleDateString()}`}
                  </p>
                </div>
              </div>
              <Link
                href="/dashboard/profile/"
                className="rounded-lg border border-white/[0.08] px-3 py-1.5 text-[12px] text-white/40 transition hover:border-cyan-500/25 hover:text-white/70"
              >
                Manage billing
              </Link>
            </div>
          )}
        </section>

        <section className="border-t pt-12 sm:pt-16" style={{ borderColor: C.border }}>
          <div className="mb-8 max-w-xl">
            <h2 className="mb-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Questions</h2>
            <p className="text-[14px]" style={{ color: C.tm }}>
              Everything you need to know before subscribing.
            </p>
          </div>
          <div className="grid gap-2 lg:grid-cols-2">
            {faqs.map((faq, index) => (
              <button
                key={faq.q}
                type="button"
                onClick={() => setOpenFaq(openFaq === index ? null : index)}
                className="group w-full rounded-xl border px-4 py-3.5 text-left transition hover:bg-white/[0.03]"
                style={{ borderColor: C.border, background: C.el }}
              >
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-[13px] font-medium text-white/55 transition group-hover:text-white/80">
                    {faq.q}
                  </h3>
                  <ChevronDown
                    className={`h-3.5 w-3.5 flex-shrink-0 text-white/20 transition-transform ${openFaq === index ? "rotate-180" : ""}`}
                    aria-hidden
                  />
                </div>
                {openFaq === index && (
                  <p className="mt-2.5 pr-8 text-[13px] leading-relaxed text-white/35">{faq.a}</p>
                )}
              </button>
            ))}
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t px-5 py-8 sm:px-8 lg:px-10" style={{ borderColor: C.border }}>
        <div className="mx-auto flex max-w-[1280px] items-center justify-between">
          <span className="flex items-center gap-2 text-[11px]" style={{ color: C.tm }}>
            <Image src="/logo-04.png" alt="" width={18} height={18} className="h-[18px] w-[18px] opacity-70" />
            Talaria-Log
          </span>
          <div className="flex items-center gap-4">
            <Link href="/terms/" className="text-[11px] text-white/25 transition hover:text-white/45">
              Terms
            </Link>
            <Link href="/privacy-policy/" className="text-[11px] text-white/25 transition hover:text-white/45">
              Privacy
            </Link>
            <Link href="/refund-policy/" className="text-[11px] text-white/25 transition hover:text-white/45">
              Refunds
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
