"use client";
import { AuthUI, getPostAuthRedirectUrl } from "@/components/ui/auth-fuse";
import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "../LanguageProvider";
import { LanguageToggle } from "@/components/LanguageToggle";

function LoginPageContent({
  isArabic,
  signInContent,
  signUpContent,
}: {
  isArabic: boolean;
  signInContent: {
    image: { src: string; alt: string };
    quote: { text: string; author: string };
  };
  signUpContent: {
    image: { src: string; alt: string };
    quote: { text: string; author: string };
  };
}) {
  const searchParams = useSearchParams();
  const mode = (searchParams.get("mode") || "").toLowerCase();
  const initialMode = mode === "signup" ? "signup" : "signin";

  const next = searchParams.get("next") || "";
  const nextPath = next.startsWith("/") && !next.startsWith("//") ? next : undefined;

  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
        if (!res.ok) {
          if (alive) setSessionChecked(true);
          return;
        }
        const data = (await res.json().catch(() => null)) as { user?: { role?: string; has_journal_access?: boolean } } | null;
        const user = data?.user;
        if (!user) {
          if (alive) setSessionChecked(true);
          return;
        }
        const url = getPostAuthRedirectUrl({ user, nextPath: nextPath ?? null });
        window.location.replace(url);
      } catch {
        if (alive) setSessionChecked(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [nextPath]);

  if (!sessionChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground" aria-live="polite">
        Loading…
      </div>
    );
  }

  return <AuthUI initialMode={initialMode} nextPath={nextPath} signInContent={signInContent} signUpContent={signUpContent} />;
}

export default function LoginPage() {
  const { isArabic } = useLanguage();

  const signInContent = {
    image: {
      src: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&q=80",
      alt: isArabic ? "رسوم بيانية وتحليلات للتداول" : "Trading charts and analytics",
    },
    quote: {
      text: isArabic ? "مرحباً بعودتك! رحلتك في التداول مستمرة" : "Welcome Back! Your trading journey continues.",
      author: "Talaria Log",
    },
  };

  const signUpContent = {
    image: {
      src: "https://images.unsplash.com/photo-1642790106117-e829e14a795f?w=800&q=80",
      alt: isArabic ? "نمو مالي وتداول" : "Financial growth and trading",
    },
    quote: {
      text: isArabic ? "أنشئ حساباً. فصل جديد ينتظرك." : "Create an account. A new chapter awaits.",
      author: "Talaria Log",
    },
  };

  return (
    <>
      <div className="fixed top-4 right-4 z-[9999]">
        <LanguageToggle />
      </div>
      <React.Suspense fallback={<AuthUI initialMode="signin" signInContent={signInContent} signUpContent={signUpContent} />}>
        <LoginPageContent isArabic={isArabic} signInContent={signInContent} signUpContent={signUpContent} />
      </React.Suspense>
    </>
  );
}
