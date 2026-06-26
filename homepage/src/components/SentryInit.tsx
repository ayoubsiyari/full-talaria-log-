"use client";

import { useEffect } from "react";

/**
 * Client-side error tracking for the static-exported app.
 *
 * Fully opt-in: nothing initializes unless `NEXT_PUBLIC_SENTRY_DSN` is set at
 * build time. With no DSN this renders nothing and loads no Sentry code, so the
 * site behaves exactly as before. We lazy-import the SDK inside the effect so it
 * never lands in the initial bundle when tracking is disabled.
 */
export default function SentryInit() {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) return;

    let cancelled = false;
    void import("@sentry/react").then((Sentry) => {
      if (cancelled) return;
      const rate = Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0");
      Sentry.init({
        dsn,
        environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "production",
        tracesSampleRate: Number.isFinite(rate) ? rate : 0,
        sendDefaultPii: false,
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
