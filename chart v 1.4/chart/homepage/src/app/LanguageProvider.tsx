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
  return "ar";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = React.useState<AppLanguage>(readInitialLanguage);

  const setLanguage = React.useCallback((lang: AppLanguage) => {
    setLanguageState("ar");
  }, []);

  const toggleLanguage = React.useCallback(() => {
    setLanguageState("ar");
  }, []);

  const isArabic = language === "ar";

  React.useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = isArabic ? "rtl" : "ltr";
    try {
      window.localStorage.setItem("talaria_language", "ar");
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
