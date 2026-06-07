"use client";

import { useEffect } from "react";

/**
 * Unified admin: chart HeroUI SPA at /chart/admin-dashboard.html
 * (same cookie session; preserves hash routes like #users, #sec-support).
 */
export default function AdminDashboardRedirect() {
  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const target = "/chart/admin-dashboard.html" + (hash || "#overview");
    window.location.replace(target);
  }, []);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-white/50">
      Redirecting to admin dashboard…
    </div>
  );
}
