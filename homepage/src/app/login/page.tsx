"use client";
import { AuthUI } from "@/components/ui/auth-fuse";
import React from "react";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "../LanguageProvider";

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
  const nextPath = next.startsWith("/") ? next : undefined;

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
    <React.Suspense fallback={<AuthUI initialMode="signin" signInContent={signInContent} signUpContent={signUpContent} />}>
      <LoginPageContent isArabic={isArabic} signInContent={signInContent} signUpContent={signUpContent} />
    </React.Suspense>
  );
}
