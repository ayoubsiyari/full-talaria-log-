"use client";

import React from "react";
import { Download, X } from "lucide-react";
import { useLanguage } from "@/app/LanguageProvider";

const STORAGE_KEY = "talaria_site_pwa_install_dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    ("standalone" in window.navigator &&
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

export default function PwaInstallPrompt() {
  const { isArabic } = useLanguage();
  const [open, setOpen] = React.useState(false);
  const deferredRef = React.useRef<BeforeInstallPromptEvent | null>(null);

  React.useEffect(() => {
    if (isStandaloneDisplay()) return;

    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "1") return;
    } catch {
      // ignore
    }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      deferredRef.current = event as BeforeInstallPromptEvent;
      setOpen(true);
    };

    const onInstalled = () => {
      deferredRef.current = null;
      setOpen(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }, []);

  const dismiss = React.useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
    setOpen(false);
  }, []);

  const install = React.useCallback(async () => {
    const promptEvent = deferredRef.current;
    if (!promptEvent) return;
    await promptEvent.prompt();
    await promptEvent.userChoice;
    deferredRef.current = null;
    setOpen(false);
  }, []);

  if (!open) return null;

  const t = isArabic
    ? {
        title: "ثبّت تالاريا على سطح المكتب",
        body: "افتح التطبيق في نافذة مستقلة — مثل FX Replay — مع أيقونة على شريط المهام.",
        install: "تثبيت",
        dismiss: "لاحقاً",
      }
    : {
        title: "Install Talaria on your desktop",
        body: "Open the app in its own window with a taskbar icon — like FX Replay.",
        install: "Install",
        dismiss: "Not now",
      };

  return (
    <div className="fixed bottom-4 end-4 z-[250] max-w-sm">
      <div
        role="dialog"
        aria-label={t.title}
        className={
          "rounded-2xl border border-white/15 bg-[#0f0f23]/95 backdrop-blur-xl p-4 shadow-2xl " +
          (isArabic ? "text-right" : "text-left")
        }
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300">
            <Download className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-white">{t.title}</div>
            <p className="mt-1 text-xs leading-relaxed text-white/75">{t.body}</p>
            <div
              className={
                "mt-3 flex flex-wrap items-center gap-2 " +
                (isArabic ? "justify-start" : "justify-end")
              }
            >
              <button
                type="button"
                onClick={dismiss}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10 transition"
              >
                {t.dismiss}
              </button>
              <button
                type="button"
                onClick={install}
                className="rounded-full border border-blue-400/30 bg-blue-500/85 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 transition"
              >
                {t.install}
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t.dismiss}
            className="shrink-0 rounded-md p-1 text-white/50 hover:bg-white/10 hover:text-white transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
