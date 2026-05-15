"use client";

import { useEffect, useState } from "react";
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
};

type SubscriptionPayload = {
  has_subscription?: boolean;
  has_journal_access?: boolean;
  billing_issue?: boolean;
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
  };
};

export default function PricingClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const browseMode = searchParams.get("browse") === "1";

  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<number | null>(null);
  const [currentSubscription, setCurrentSubscription] = useState<SubscriptionPayload | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
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
      if (token) {
        setIsLoggedIn(true);
        const redirected = await checkAuthAndMaybeRedirectSubscriptionPage(token, browseMode);
        if (cancelled || redirected) return;
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

      let isAdmin = false;
      try {
        const payload = JSON.parse(atob(token.split(".")[1] || ""));
        isAdmin = payload.is_admin === true || payload.role === "admin";
      } catch {
        /* ignore */
      }
      if (isAdmin) return false;

      const entitled =
        (data.has_subscription && ["active", "trialing"].includes(data.subscription?.status || "")) ||
        data.has_journal_access === true;
      if (!entitled && !allowPricingBrowse) {
        window.location.href = "/pricing/?browse=1";
        return true;
      }
    } catch {
      /* show pricing */
    }
    return false;
  };

  const fetchPlans = async () => {
    try {
      const res = await fetch(`${JOURNAL_SUBSCRIPTIONS_API}/public/plans`);
      if (res.ok) {
        const data = (await res.json()) as { plans?: PlanRow[] };
        if (data.plans?.length) {
          setPlans(data.plans.map((p) => ({ ...p, features: parseFeatures(p.features) })));
        }
      }
    } catch {
      /* silent */
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
  const lapsedInfo = currentSubscription?.lapsed_subscription;
  const showResumeBanner =
    isLoggedIn &&
    currentSubscription &&
    !hasActivePaidPlan &&
    !!(lapsedInfo?.plan_name || lapsedInfo?.status || currentSubscription?.billing_issue);

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
    <div className="relative min-h-screen bg-[#02040a] text-white antialiased">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute left-1/2 top-0 h-[min(480px,55vh)] w-[min(880px,100vw)] -translate-x-1/2 rounded-full bg-cyan-500/[0.09] blur-[120px]" />
        <div className="absolute bottom-[-10%] right-0 h-[40vh] w-[55vw] max-w-xl rounded-full bg-violet-600/[0.06] blur-[100px]" />
      </div>

      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#02040a]/75 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="text-[15px] font-semibold tracking-tight text-white">
            Talaria
          </Link>
          {isLoggedIn ? (
            <Link
              href="/dashboard/"
              className="flex items-center gap-1.5 text-[13px] text-white/45 transition-colors hover:text-white/75"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Dashboard
            </Link>
          ) : (
            <div className="flex items-center gap-3">
              <Link href="/login/" className="text-[13px] text-white/45 transition-colors hover:text-white/75">
                Log in
              </Link>
              <Link
                href="/login/?mode=signup"
                className="rounded-lg border border-cyan-500/25 bg-cyan-500/[0.08] px-3.5 py-1.5 text-[13px] font-medium text-cyan-100 transition hover:bg-cyan-500/[0.12]"
              >
                Sign up
              </Link>
            </div>
          )}
        </div>
      </nav>

      {showResumeBanner && (
        <div className="relative z-10 mx-auto mt-6 max-w-2xl rounded-xl border border-amber-500/35 bg-amber-500/[0.07] px-4 py-3.5 text-left">
          <p className="text-[13px] leading-relaxed text-amber-100/95">
            <span className="font-semibold text-white">Your plan</span>
            {lapsedInfo?.plan_name ? (
              <>
                : <span className="font-medium text-white">{lapsedInfo.plan_name}</span>
              </>
            ) : (
              <span className="text-white/80"> (previous subscription)</span>
            )}
            {currentSubscription?.billing_issue && (
              <span className="mt-1.5 block text-[12px] text-amber-200/75">
                Payment required to restore access. Complete checkout below or update your card from profile
                billing.
              </span>
            )}
          </p>
        </div>
      )}

      <div className="relative z-10 px-5 pb-10 pt-14 text-center sm:pt-20">
        <p className="mb-4 text-[12px] font-semibold uppercase tracking-[0.2em] text-cyan-300/85">Pricing</p>
        <h1 className="mx-auto mb-4 max-w-xl text-3xl font-bold leading-[1.12] tracking-tight text-white sm:text-4xl md:text-[44px]">
          Simple plans,
          <br className="hidden sm:block" /> powerful tools
        </h1>
        <p className="mx-auto max-w-md text-[15px] leading-relaxed text-white/40">
          Everything you need to analyze, journal, and backtest your trades. No hidden fees.
        </p>
      </div>

      <div className="relative z-10 mx-auto mb-10 max-w-sm space-y-4 px-5">
        <div className="flex items-center justify-center">
          <div className="inline-flex items-center rounded-xl border border-white/[0.07] bg-white/[0.03] p-0.5">
            {(["monthly", "yearly"] as const).map((cycle) => (
              <button
                key={cycle}
                type="button"
                onClick={() => setBillingCycle(cycle)}
                className={`rounded-lg px-4 py-1.5 text-[13px] font-medium transition-all ${
                  billingCycle === cycle
                    ? "bg-white/[0.08] text-white shadow-sm"
                    : "text-white/35 hover:text-white/55"
                }`}
              >
                {cycle === "monthly" ? "Monthly" : "Yearly"}
                {cycle === "yearly" && (
                  <span className="ml-1.5 text-[10px] font-semibold text-emerald-400">−25%</span>
                )}
              </button>
            ))}
          </div>
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
          <div className="flex gap-1.5">
            <input
              type="text"
              value={couponCode}
              onChange={(e) => {
                setCouponCode(e.target.value.toUpperCase());
                if (couponResult) setCouponResult(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleValidateCoupon()}
              placeholder="Coupon code"
              maxLength={50}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2 text-[13px] text-white placeholder:text-white/20 focus:border-cyan-500/35 focus:outline-none focus:ring-1 focus:ring-cyan-500/20"
            />
            <button
              type="button"
              onClick={handleValidateCoupon}
              disabled={!couponCode.trim() || couponValidating}
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2 text-[12px] font-medium text-white/50 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-25"
            >
              {couponValidating && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
              Apply
            </button>
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

      <section className="relative z-10 px-5 pb-20 sm:pb-28">
        <div className="mx-auto max-w-4xl">
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-white/25" aria-hidden />
            </div>
          ) : plans.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-sm text-white/35">No plans available yet. Check back soon.</p>
            </div>
          ) : (
            <div
              className={`grid gap-4 ${
                plans.length === 1
                  ? "mx-auto max-w-sm"
                  : plans.length === 2
                    ? "mx-auto max-w-2xl sm:grid-cols-2"
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
                const features = Array.isArray(plan.features) ? (plan.features as string[]) : [];

                return (
                  <div
                    key={plan.id ?? index}
                    className={`relative flex flex-col rounded-2xl transition-all duration-300 ${
                      isYourLapsedPlan
                        ? "bg-[#0a1020] shadow-[0_0_36px_-10px_rgba(245,158,11,0.22)] ring-2 ring-amber-500/40"
                        : isPro
                          ? "bg-[#0a1020] shadow-[0_0_40px_-12px_rgba(34,211,238,0.12)] ring-1 ring-cyan-500/25"
                          : "bg-white/[0.02] ring-1 ring-white/[0.07] hover:ring-cyan-500/15"
                    }`}
                  >
                    {isPro && (
                      <div className="absolute -top-px left-8 right-8 h-px bg-gradient-to-r from-transparent via-cyan-400/45 to-transparent" />
                    )}

                    <div className="flex flex-1 flex-col p-6 sm:p-7">
                      <div className="mb-5 flex items-center justify-between">
                        <span
                          className={`text-[13px] font-semibold uppercase tracking-wide ${isPro ? "text-cyan-200/90" : "text-white/35"}`}
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
                            <span className="rounded bg-cyan-500/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-200">
                              Popular
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mb-1">
                        <span className="text-4xl font-bold tabular-nums tracking-tight text-white">
                          {price === 0 ? "Free" : `$${price}`}
                        </span>
                        {price > 0 && <span className="ml-1 text-sm text-white/25">/mo</span>}
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
                          className={`mb-6 flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-[13px] font-medium transition-all disabled:opacity-40 ${
                            isYourLapsedPlan || isPro
                              ? "bg-gradient-to-r from-cyan-500 to-cyan-600 text-[#041018] shadow-lg shadow-cyan-500/15 hover:brightness-110"
                              : "bg-white/[0.06] text-white/75 hover:bg-white/[0.1] hover:text-white"
                          }`}
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

                      <div className="border-t border-white/[0.06] pt-5">
                        <ul className="space-y-2.5">
                          {features.map((feature, idx) => (
                            <li key={idx} className="flex items-start gap-2.5">
                              <Check
                                className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 ${isPro ? "text-cyan-300/70" : "text-white/22"}`}
                                aria-hidden
                              />
                              <span className="text-[13px] leading-snug text-white/45">{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
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
        </div>
      </section>

      <section className="relative z-10 px-5 pb-20 sm:pb-28">
        <div className="mx-auto max-w-xl">
          <div className="mb-10 text-center">
            <h2 className="mb-2 text-xl font-bold tracking-tight text-white sm:text-2xl">Questions</h2>
            <p className="text-[13px] text-white/30">Everything you need to know before subscribing.</p>
          </div>
          <div className="space-y-1">
            {faqs.map((faq, index) => (
              <button
                key={faq.q}
                type="button"
                onClick={() => setOpenFaq(openFaq === index ? null : index)}
                className="group w-full rounded-xl px-4 py-3.5 text-left transition hover:bg-white/[0.03]"
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
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/[0.06] px-5 py-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <span className="text-[11px] text-white/25">Talaria</span>
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
