"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Client-side redirect shim for retired dashboard routes.
 *
 * These paths used to be standalone pages but the dashboard is now a single app
 * at `/dashboard/`. Rather than render a blank page (the old `return null` stubs)
 * or 404, we forward the user — and any query string — to the working view.
 * Preserves existing bookmarks/links without keeping dead UI around.
 */
function RouteRedirectInner({ to }: { to: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const q = searchParams?.toString() ?? "";
    const sep = to.includes("?") ? "&" : "?";
    router.replace(q ? `${to}${sep}${q}` : to);
  }, [router, searchParams, to]);

  return (
    <div
      style={{
        padding: 24,
        fontFamily: "'Exo 2', system-ui, sans-serif",
        color: "rgba(255,255,255,0.6)",
        background: "#07080e",
        minHeight: "100vh",
      }}
    >
      Redirecting…
    </div>
  );
}

export default function RouteRedirect({ to }: { to: string }) {
  return (
    <Suspense
      fallback={
        <div
          style={{
            padding: 24,
            color: "rgba(255,255,255,0.6)",
            background: "#07080e",
            minHeight: "100vh",
          }}
        >
          Redirecting…
        </div>
      }
    >
      <RouteRedirectInner to={to} />
    </Suspense>
  );
}
