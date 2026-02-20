"use client";
import { useEffect } from "react";

export default function DashboardRedirect() {
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me", {
          credentials: "include",
          cache: "no-store",
        });

        if (!res.ok) {
          const target = `${window.location.pathname}${window.location.search || ""}`;
          window.location.replace(`/login/?next=${encodeURIComponent(target)}`);
          return;
        }

        const body = (await res.json().catch(() => null)) as { user?: { role?: string } } | null;
        const isAdmin = body?.user?.role === "admin";
        window.location.replace(isAdmin ? "/dashboard/admin/" : "/backtest/");
      } catch {
        const target = `${window.location.pathname}${window.location.search || ""}`;
        window.location.replace(`/login/?next=${encodeURIComponent(target)}`);
      }
    })();
  }, []);

  return null;
}
