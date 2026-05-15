"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Legacy URL: journal SPA used to live entirely under `/journal/*`.
 * Canonical marketing checkout page is now `/pricing/` on the Next app.
 */
function RedirectInner() {
  const searchParams = useSearchParams();
  useEffect(() => {
    const q = searchParams.toString();
    window.location.replace("/pricing/" + (q ? `?${q}` : ""));
  }, [searchParams]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#02040a] text-sm text-white/50">
      Redirecting…
    </div>
  );
}

export default function LegacyJournalPricingRedirect() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#02040a]" />}>
      <RedirectInner />
    </Suspense>
  );
}
