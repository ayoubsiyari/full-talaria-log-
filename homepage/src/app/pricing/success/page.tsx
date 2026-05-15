"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle, Loader2, ArrowRight } from "lucide-react";
import { JOURNAL_SUBSCRIPTIONS_API } from "@/lib/subscriptionApi";

function SubscriptionSuccessInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [loading, setLoading] = useState(true);
  const [verified, setVerified] = useState(false);
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
        if (!token) {
          if (!cancelled) setLoading(false);
          return;
        }
        const res = await fetch(`${JOURNAL_SUBSCRIPTIONS_API}/verify-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ session_id: sessionId }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.success) {
          try {
            const stored = JSON.parse(localStorage.getItem("talaria_current_user") || "{}");
            stored.has_journal_access = true;
            localStorage.setItem("talaria_current_user", JSON.stringify(stored));
          } catch {
            /* ignore */
          }
          if (!cancelled) setVerified(true);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!verified) return;
    const t = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(t);
          router.replace("/dashboard/");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [verified, router]);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#02040a] px-6 text-white">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute left-1/2 top-0 h-[min(520px,70vh)] w-[min(900px,120vw)] -translate-x-1/2 rounded-full bg-cyan-500/[0.07] blur-[100px]" />
        <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-violet-600/[0.06] blur-[80px]" />
      </div>
      <div className="relative z-10 w-full max-w-md text-center">
        {loading ? (
          <div className="space-y-6">
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-cyan-300/90" aria-hidden />
            <div>
              <h1 className="mb-2 text-xl font-semibold text-white">Confirming your subscription…</h1>
              <p className="text-sm text-white/40">This usually takes a few seconds.</p>
            </div>
          </div>
        ) : verified ? (
          <div className="space-y-8">
            <div className="relative mx-auto inline-block">
              <div className="absolute inset-0 scale-150 rounded-full bg-emerald-500/20 blur-3xl" />
              <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-[0_0_40px_rgba(16,185,129,0.25)]">
                <CheckCircle className="h-10 w-10 text-white" strokeWidth={2} />
              </div>
            </div>
            <div>
              <h1 className="mb-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">You&apos;re in</h1>
              <p className="text-base leading-relaxed text-white/45">
                Subscription active. Redirecting to your dashboard in {countdown}s…
              </p>
            </div>
            <Link
              href="/dashboard/"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 px-6 py-3 text-sm font-semibold text-[#041018] shadow-lg shadow-cyan-500/20 transition hover:brightness-110"
            >
              Go to dashboard <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-white/70">We couldn&apos;t confirm this checkout session.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href="/pricing/"
                className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-white/80 hover:bg-white/[0.07]"
              >
                Back to pricing
              </Link>
              <Link
                href="/dashboard/"
                className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-5 py-2.5 text-sm font-medium text-cyan-200 hover:bg-cyan-500/15"
              >
                Dashboard
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PricingSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#02040a] text-sm text-white/50">
          Loading…
        </div>
      }
    >
      <SubscriptionSuccessInner />
    </Suspense>
  );
}
