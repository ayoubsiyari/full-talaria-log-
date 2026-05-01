"use client";

import React from "react";
import { useLanguage } from "./LanguageProvider";

type ConsentValue = "accepted" | "essential";

const STORAGE_KEY = "talaria_cookie_consent";

export default function CookieConsent() {
  const { isArabic } = useLanguage();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      if (v !== "accepted" && v !== "essential") {
        setOpen(true);
      }
    } catch {
      setOpen(true);
    }
  }, []);

  const setConsent = React.useCallback((value: ConsentValue) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // ignore
    }
    setOpen(false);
  }, []);

  if (!open) return null;

  const t = isArabic
    ? {
        title: "إشعار ملفات تعريف الارتباط",
        body: "نستخدم ملفات تعريف الارتباط الضرورية لتسجيل الدخول وتشغيل الموقع. يمكنك قبول جميع ملفات تعريف الارتباط أو استخدام الضرورية فقط.",
        acceptAll: "قبول الكل",
        essentialOnly: "الضرورية فقط",
        privacy: "سياسة الخصوصية",
      }
    : {
        title: "Cookie Notice",
        body: "We use essential cookies to keep you signed in and to run the website. You can accept all cookies or use essential cookies only.",
        acceptAll: "Accept all",
        essentialOnly: "Essential only",
        privacy: "Privacy Policy",
      };

  return (
    <div className="fixed inset-x-0 bottom-0 z-[300] p-4">
      <div className="mx-auto max-w-3xl rounded-2xl border border-white/15 bg-[#0f0f23]/90 backdrop-blur-xl p-4 shadow-2xl">
        <div className={"flex flex-col gap-3 " + (isArabic ? "text-right" : "text-left")}>
          <div className="text-sm font-semibold text-white">{t.title}</div>
          <div className="text-sm text-white/80 leading-relaxed">{t.body}</div>

          <div className={"flex flex-wrap items-center gap-2 " + (isArabic ? "justify-start" : "justify-end")}>
            <a
              href="/privacy/"
              className="rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 transition"
            >
              {t.privacy}
            </a>
            <button
              type="button"
              onClick={() => setConsent("essential")}
              className="rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 transition"
            >
              {t.essentialOnly}
            </button>
            <button
              type="button"
              onClick={() => setConsent("accepted")}
              className="rounded-full border border-white/15 bg-blue-500/80 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500 transition"
            >
              {t.acceptAll}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
