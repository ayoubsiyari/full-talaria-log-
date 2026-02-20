"use client";
import { AuthUI } from "@/components/ui/auth-fuse";
import { useLanguage } from "../LanguageProvider";

export default function LoginPage() {
  const { isArabic } = useLanguage();
  return (
    <AuthUI
      signInContent={{
        image: {
          src: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&q=80",
          alt: isArabic ? "رسوم بيانية وتحليلات للتداول" : "Trading charts and analytics"
        },
        quote: {
          text: isArabic ? "مرحباً بعودتك! رحلتك في التداول مستمرة." : "Welcome Back! Your trading journey continues.",
          author: "Talaria Log"
        }
      }}
      signUpContent={{
        image: {
          src: "https://images.unsplash.com/photo-1642790106117-e829e14a795f?w=800&q=80",
          alt: isArabic ? "نمو مالي ونجاح" : "Financial growth and success"
        },
        quote: {
          text: isArabic ? "انضم للمجتمع. ابدأ رحلتك في التداول." : "Join the community. Start your trading journey.",
          author: "Talaria Log"
        }
      }}
    />
  );
}
