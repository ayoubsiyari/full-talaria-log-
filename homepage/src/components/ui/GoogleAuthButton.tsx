"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "large" | "medium" | "small";
              text?: "signin_with" | "signup_with" | "continue_with" | "signin";
              shape?: "rectangular" | "pill" | "circle" | "square";
              width?: number;
              locale?: string;
            },
          ) => void;
        };
      };
    };
  }
}

const GSI_SCRIPT = "https://accounts.google.com/gsi/client";

type GoogleAuthButtonProps = {
  onCredential: (credential: string) => void;
  disabled?: boolean;
  mode?: "signin" | "signup";
};

export function GoogleAuthButton({ onCredential, disabled, mode = "signin" }: GoogleAuthButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [clientId, setClientId] = useState(
    () => (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "").trim(),
  );
  const [scriptReady, setScriptReady] = useState(false);
  const callbackRef = useRef(onCredential);
  callbackRef.current = onCredential;

  useEffect(() => {
    if (clientId) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/config", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { google_client_id?: string | null };
        const cid = (data.google_client_id || "").trim();
        if (alive && cid) setClientId(cid);
      } catch {
        /* optional */
      }
    })();
    return () => {
      alive = false;
    };
  }, [clientId]);

  useEffect(() => {
    if (!clientId) return;
    if (window.google?.accounts?.id) {
      setScriptReady(true);
      return;
    }
    const existing = document.querySelector(`script[src="${GSI_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener("load", () => setScriptReady(true));
      if (window.google?.accounts?.id) setScriptReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src = GSI_SCRIPT;
    script.async = true;
    script.defer = true;
    script.onload = () => setScriptReady(true);
    document.head.appendChild(script);
  }, [clientId]);

  const renderButton = useCallback(() => {
    const el = containerRef.current;
    if (!el || !clientId || !scriptReady || !window.google?.accounts?.id) return;
    el.innerHTML = "";
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response.credential) callbackRef.current(response.credential);
      },
    });
    window.google.accounts.id.renderButton(el, {
      theme: "filled_black",
      size: "large",
      text: mode === "signup" ? "signup_with" : "continue_with",
      shape: "rectangular",
      width: 320,
    });
  }, [clientId, scriptReady, mode]);

  useEffect(() => {
    renderButton();
  }, [renderButton, disabled]);

  if (!clientId) return null;

  return (
    <div
      className="w-full flex flex-col items-center gap-2"
      style={{ opacity: disabled ? 0.55 : 1, pointerEvents: disabled ? "none" : "auto" }}
    >
      <div ref={containerRef} className="flex justify-center min-h-[44px]" aria-hidden={disabled} />
    </div>
  );
}
