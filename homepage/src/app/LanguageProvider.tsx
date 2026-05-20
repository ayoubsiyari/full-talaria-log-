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

/** Default must match server render — do not read localStorage in useState (causes React #418 hydration mismatch). */
const DEFAULT_LANGUAGE: AppLanguage = "ar";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = React.useState<AppLanguage>(DEFAULT_LANGUAGE);

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem("talaria_language");
      if (saved === "en" || saved === "ar") setLanguageState(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const setLanguage = React.useCallback((lang: AppLanguage) => {
    setLanguageState(lang);
  }, []);

  const toggleLanguage = React.useCallback(() => {
    setLanguageState(prev => (prev === "ar" ? "en" : "ar"));
  }, []);

  const isArabic = language === "ar";

  React.useEffect(() => {
    document.documentElement.lang = language;
    // Dashboard, tables, and chart chrome are LTR-only; RTL on <html> flips flex/grid and breaks layout.
    // Arabic copy still works; legal/marketing blocks may set local dir="rtl" where needed.
    document.documentElement.dir = "ltr";
    document.documentElement.dataset.talariaLang = language;
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
