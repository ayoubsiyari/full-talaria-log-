"use client";

import React from "react";
import { useSearchParams } from "next/navigation";

/** Legacy URL → unified performance dashboard at `/dashboard/`. */
export default function SessionAnalyticsRedirectPage() {
  const searchParams = useSearchParams();

  React.useEffect(() => {
    const id = searchParams.get("id");
    const target = id
      ? `/dashboard/?sessionId=${encodeURIComponent(id)}`
      : "/dashboard/";
    window.location.replace(target);
  }, [searchParams]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-white/50">
      Redirecting to dashboard…
    </div>
  );
}
