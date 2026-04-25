"use client";

import React from "react";

export default function RedirectClient({ id }: { id: string }) {
  React.useEffect(() => {
    const target = `/dashboard/sessions/analytics/?id=${encodeURIComponent(id)}`;
    window.location.replace(target);
  }, [id]);

  return <div className="text-sm text-white/60">Redirecting...</div>;
}
