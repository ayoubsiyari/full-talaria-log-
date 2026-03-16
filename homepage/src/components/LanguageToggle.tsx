"use client";
import React from "react";
import { useLanguage } from "@/app/LanguageProvider";

interface Props {
  className?: string;
}

export function LanguageToggle({ className = "" }: Props) {
  const { isArabic, toggleLanguage } = useLanguage();
  return (
    <button
      onClick={toggleLanguage}
      className={`rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10 text-xs sm:text-sm px-3 py-1.5 font-semibold transition-colors ${className}`}
      aria-label="Toggle language"
    >
      {isArabic ? "EN" : "AR"}
    </button>
  );
}
