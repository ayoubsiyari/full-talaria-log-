"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { V16DashboardViewId } from "./v16DashboardRoutes";
import { v16DashboardHref } from "./v16DashboardRoutes";

/** Legacy /dashboard/* routes → single V16 root at /dashboard/?view=… */
export function V16DashboardViewRedirect({ view }: { view: V16DashboardViewId }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const extra: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      if (key !== "view") extra[key] = value;
    });
    router.replace(v16DashboardHref(view, extra));
  }, [router, searchParams, view]);

  return null;
}
