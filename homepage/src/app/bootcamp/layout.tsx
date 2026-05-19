"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  defaultDashboardPathForUser,
  isPathAdminOnlyWip,
  userCanAccessAdminOnlyWipPath,
  type DashboardUser,
} from "@/lib/dashboardAccess";

export default function BootcampLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = React.useState(false);

  React.useEffect(() => {
    if (!isPathAdminOnlyWip("/bootcamp/")) {
      setAllowed(true);
      return;
    }
    fetch("/api/auth/me", { credentials: "include", cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { user?: DashboardUser }) => {
        const user = data.user ?? null;
        if (userCanAccessAdminOnlyWipPath(user, "/bootcamp/")) {
          setAllowed(true);
          return;
        }
        if (user) {
          router.replace(defaultDashboardPathForUser(user));
        } else {
          router.replace("/login/?next=/bootcamp/");
        }
      })
      .catch(() => {
        router.replace("/login/?next=/bootcamp/");
      });
  }, [router]);

  if (!allowed) {
    return React.createElement("div", {
      style: { minHeight: "100vh", background: "#0a0a0f" },
      "aria-hidden": true,
    });
  }

  return <>{children}</>;
}
