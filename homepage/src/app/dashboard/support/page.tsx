"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";

function SupportRedirectInner() {
  const router = useRouter();
  const sp = useSearchParams();
  React.useEffect(() => {
    const q = new URLSearchParams({ tab: "support" });
    const thread = sp.get("thread");
    const topic = sp.get("topic");
    if (thread) q.set("thread", thread);
    if (topic) q.set("topic", topic);
    router.replace(`/dashboard/profile/?${q.toString()}`);
  }, [router, sp]);
  return (
    <div style={{ padding: 24, color: "rgba(255,255,255,0.45)", fontSize: 13 }}>Redirecting…</div>
  );
}

/** Legacy route — support lives under Settings → Support. */
export default function SupportRedirectPage() {
  return (
    <React.Suspense
      fallback={
        <div style={{ padding: 24, color: "rgba(255,255,255,0.45)", fontSize: 13 }}>Redirecting…</div>
      }
    >
      <SupportRedirectInner />
    </React.Suspense>
  );
}
