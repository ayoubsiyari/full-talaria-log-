"use client";

import { useEffect } from "react";

/**
 * Legacy journal SPA paywall URL (`/journal/subscription-status`).
 * Canonical flow on the Next app is `/pricing/?browse=1` (plans + checkout).
 */
export default function LegacyJournalSubscriptionStatusRedirect() {
  useEffect(() => {
    window.location.replace("/pricing/?browse=1");
  }, []);
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#02040a] text-sm text-white/50">
      Redirecting…
    </div>
  );
}
