"use client";

import React from "react";
import { createPortal } from "react-dom";
import ProfilePageClient from "../profile/ProfilePageClient";

const MOUNT_ID = "talaria-v16-profile-mount";

/** Renders the real profile/settings UI into V16's profile view mount node. */
export function V16ProfilePortal({ active }: { active: boolean }) {
  const [mount, setMount] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!active) {
      setMount(null);
      return;
    }
    const pick = () => {
      const el = document.getElementById(MOUNT_ID);
      setMount((prev) => (prev === el ? prev : el));
    };
    pick();
    const obs = new MutationObserver(pick);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [active]);

  if (!active || !mount) return null;
  return createPortal(<ProfilePageClient v16Embed />, mount);
}
