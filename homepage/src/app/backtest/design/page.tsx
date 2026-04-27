"use client";

import React, { useEffect, useState } from "react";
import { LanguageToggle } from "@/components/LanguageToggle";
import { BacktestSubnav } from "../BacktestSubnav";
import "../sessions-dashboard.css";

function initialsFromUser(name?: string, email?: string): string {
  const src = (name || email || "").trim();
  if (!src) return "?";
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return src.slice(0, 2).toUpperCase();
}

/** Full-viewport iframe: static bundle from `chart v 1.4/talaria-design` → `public/talaria-v8b-design/`. */
export default function BacktestDesignDemoPage() {
  const [userInitials, setUserInitials] = useState("?");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) {
          const target = `${window.location.pathname}${window.location.search || ""}`;
          window.location.href = `/login/?next=${encodeURIComponent(target)}`;
          return;
        }
        const body = (await res.json().catch(() => null)) as {
          user?: { role?: string; has_journal_access?: boolean; name?: string; email?: string };
        } | null;
        if (mounted) {
          const role = body?.user?.role;
          setIsAdmin(role === "admin");
          setUserInitials(initialsFromUser(body?.user?.name, body?.user?.email));
          if (role !== "admin" && !body?.user?.has_journal_access) {
            window.location.href = "/journal/pricing";
            return;
          }
        }
      } catch {
        const target = `${window.location.pathname}${window.location.search || ""}`;
        window.location.href = `/login/?next=${encodeURIComponent(target)}`;
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="sd-root min-h-screen flex flex-col" dir="ltr" lang="en">
      <header className="sd-topbar shrink-0">
        <div className="sd-logo-area">
          <a href="/" className="sd-logo-mark shrink-0" aria-label="Home">
            <img src="/logo-08.png" alt="" width={22} height={22} />
          </a>
          <div className="sd-brand-wrap">
            <span className="sd-brand">Sessions</span>
            <span className="sd-brand-sub">UI design preview</span>
          </div>
        </div>
        <div className="sd-topbar-right">
          <LanguageToggle />
          {isAdmin ? (
            <a href="/dashboard/admin/" className="sd-link-admin">
              Admin
            </a>
          ) : null}
          <div className="sd-avatar" aria-hidden title="Account">
            {userInitials}
          </div>
        </div>
      </header>

      <BacktestSubnav active="design" />

      <main className="flex-1 flex flex-col min-h-0 bg-black">
        <iframe
          title="Talaria V8b UI mock"
          src="/talaria-v8b-design/"
          className="w-full flex-1 border-0 min-h-[70vh]"
        />
      </main>
    </div>
  );
}
