"use client";

import React from "react";

export type AppLanguage = "en" | "ar";

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  toggleLanguage: () => void;
  isArabic: boolean;
};

const LanguageContext = React.createContext<LanguageContextValue | null>(null);

function readInitialLanguage(): AppLanguage {
  if (typeof window === "undefined") return "ar";
  try {
    const saved = window.localStorage.getItem("talaria_language");
    if (saved === "en" || saved === "ar") return saved;
  } catch {}
  return "ar";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = React.useState<AppLanguage>(readInitialLanguage);

  const setLanguage = React.useCallback((lang: AppLanguage) => {
    setLanguageState(lang);
  }, []);

  const toggleLanguage = React.useCallback(() => {
    setLanguageState(prev => (prev === "ar" ? "en" : "ar"));
  }, []);

  const isArabic = language === "ar";

  React.useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = isArabic ? "rtl" : "ltr";
    try {
      window.localStorage.setItem("talaria_language", language);
    } catch {}
  }, [language, isArabic]);

  const value = React.useMemo<LanguageContextValue>(
    () => ({ language, setLanguage, toggleLanguage, isArabic }),
    [language, setLanguage, toggleLanguage, isArabic]
  );

  return (
    <LanguageContext.Provider value={value}>
      <div className={isArabic ? "font-sans" : "font-sans"}>
        {children}
      </div>
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = React.useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return ctx;
}
