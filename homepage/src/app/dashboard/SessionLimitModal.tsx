"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "../LanguageProvider";
import {
  fetchPublicPlans,
  resolveSessionLimitUpgrade,
  sessionLimitSupportHref,
  type SessionLimitGateData,
  type SessionLimitUpgradeAction,
} from "./sessionLimitGate";
import { openBillingPortal, startPlanCheckout } from "./sessionLimitCheckout";

const F = "'Exo 2', sans-serif";

type Props = {
  open: boolean;
  data: SessionLimitGateData | null;
  onClose: () => void;
};

export function SessionLimitModal({ open, data, onClose }: Props) {
  const { isArabic } = useLanguage();
  const router = useRouter();
  const [upgrade, setUpgrade] = React.useState<SessionLimitUpgradeAction | null>(null);
  const [upgradeBusy, setUpgradeBusy] = React.useState(false);
  const [upgradeErr, setUpgradeErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !data) {
      setUpgrade(null);
      setUpgradeErr(null);
      setUpgradeBusy(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const plans = await fetchPublicPlans();
      if (cancelled) return;
      setUpgrade(resolveSessionLimitUpgrade(data, plans));
    })();
    return () => {
      cancelled = true;
    };
  }, [open, data]);

  if (!open || !data) return null;

  const pct = data.cap > 0 ? Math.min(100, Math.round((100 * data.count) / data.cap)) : 100;
  const planLabel =
    data.planName ||
    (isArabic ? "بدون اشتراك نشط" : "No active subscription");

  const title = isArabic ? "تم بلوغ حد جلسات الباك تست" : "Backtest session limit reached";
  const body = isArabic
    ? `لديك ${data.count} من ${data.cap} جلسة باك تست محفوظة. احذف جلسة موجودة، أو قم بالترقية، أو تواصل مع الدعم لزيادة الحد.`
    : `You have ${data.count} of ${data.cap} saved backtest sessions. Delete an existing session, upgrade your plan, or contact support for a higher limit.`;

  const upgradeLabel =
    upgrade?.label ||
    (isArabic ? "ترقية الخطة" : "Upgrade plan");
  const upgradeHint =
    upgrade?.hint ||
    (isArabic
      ? "الخطط الأعلى تتضمن المزيد من جلسات الباك تست."
      : "Higher tiers include more backtest sessions.");
  const supportLabel = isArabic ? "تواصل مع الدعم" : "Contact support";
  const closeLabel = isArabic ? "إغلاق" : "Close";
  const usageLabel = isArabic ? "الاستخدام" : "Usage";
  const planHeading = isArabic ? "خطتك الحالية" : "Current plan";
  const nextPlanLabel =
    upgrade?.planName && upgrade.nextSessionCap
      ? isArabic
        ? `الترقية المقترحة: ${upgrade.planName} (${upgrade.nextSessionCap} جلسة)`
        : `Suggested upgrade: ${upgrade.planName} (${upgrade.nextSessionCap} sessions)`
      : null;

  const goUpgrade = async () => {
    setUpgradeErr(null);
    if (!upgrade) {
      router.push("/pricing/?browse=1");
      onClose();
      return;
    }
    if (upgrade.mode === "pricing") {
      onClose();
      router.push(upgrade.href || "/pricing/?browse=1");
      return;
    }
    setUpgradeBusy(true);
    try {
      if (upgrade.mode === "checkout" && upgrade.planId) {
        const result = await startPlanCheckout(upgrade.planId);
        if (!result.ok) setUpgradeErr(result.error);
        else onClose();
        return;
      }
      if (upgrade.mode === "portal") {
        const result = await openBillingPortal();
        if (!result.ok) {
          if (upgrade.planId) {
            const fallback = await startPlanCheckout(upgrade.planId);
            if (!fallback.ok) setUpgradeErr(fallback.error);
            else onClose();
          } else {
            setUpgradeErr(result.error);
          }
        } else {
          onClose();
        }
        return;
      }
      onClose();
      router.push("/pricing/?browse=1");
    } finally {
      setUpgradeBusy(false);
    }
  };

  const goSupport = () => {
    onClose();
    router.push(sessionLimitSupportHref());
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-limit-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 600000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: F,
        background: "rgba(4,5,10,0.78)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(440px, 92vw)",
          borderRadius: 16,
          padding: "26px 24px 22px",
          background: "linear-gradient(165deg, rgba(22,24,34,0.98) 0%, rgba(12,14,22,0.98) 100%)",
          border: "1px solid rgba(140,160,255,0.14)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.35) inset",
          animation: "tlrPopIn 0.18s ease",
        }}
      >
        <div style={{ height: 2, margin: "-26px -24px 20px", borderRadius: "16px 16px 0 0", background: "linear-gradient(90deg,#2643F7,#4A6AFF,#2643F7)" }} />

        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
          <div
            aria-hidden
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(255,80,104,0.1)",
              border: "1px solid rgba(255,80,104,0.28)",
              flexShrink: 0,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF5068" strokeWidth="1.7">
              <rect x="4" y="7" width="16" height="13" rx="1.5" />
              <path d="M8 7V5.5A4 4 0 0116 5.5V7" strokeLinecap="round" />
              <path d="M12 11v4M12 17h.01" strokeLinecap="round" />
            </svg>
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2
              id="session-limit-title"
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: isArabic ? 0 : "0.02em",
                color: "rgba(255,255,255,0.94)",
                lineHeight: 1.25,
              }}
            >
              {title}
            </h2>
            <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.55, color: "rgba(255,255,255,0.58)" }}>
              {body}
            </p>
          </div>
        </div>

        <div
          style={{
            marginBottom: 16,
            padding: "12px 14px",
            borderRadius: 12,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(140,160,255,0.1)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)" }}>
              {usageLabel}
            </span>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#FF5068" }}>
              {data.count} / {data.cap}
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${pct}%`,
                borderRadius: 999,
                background: "linear-gradient(90deg,#FF5068,#ff8a9a)",
                boxShadow: "0 0 10px rgba(255,80,104,0.35)",
              }}
            />
          </div>
          <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)" }}>
              {planHeading}
            </span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "rgba(255,255,255,0.82)",
                padding: "3px 10px",
                borderRadius: 999,
                background: "rgba(74,106,255,0.12)",
                border: "1px solid rgba(74,106,255,0.28)",
              }}
            >
              {planLabel}
            </span>
          </div>
          {nextPlanLabel ? (
            <p style={{ margin: "10px 0 0", fontSize: 11, lineHeight: 1.45, color: "rgba(255,255,255,0.42)" }}>
              {nextPlanLabel}
            </p>
          ) : null}
        </div>

        <p style={{ margin: "0 0 18px", fontSize: 12, lineHeight: 1.5, color: "rgba(255,255,255,0.42)" }}>
          {upgradeHint}
        </p>

        {upgradeErr ? (
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "#ff8a9a" }}>{upgradeErr}</p>
        ) : null}

        <button
          type="button"
          disabled={upgradeBusy}
          onClick={() => void goUpgrade()}
          style={{
            width: "100%",
            padding: "14px 18px",
            borderRadius: 12,
            border: "none",
            cursor: upgradeBusy ? "wait" : "pointer",
            opacity: upgradeBusy ? 0.75 : 1,
            fontFamily: F,
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: isArabic ? 0 : "0.06em",
            textTransform: isArabic ? "none" : "uppercase",
            color: "rgba(255,255,255,0.96)",
            background: "linear-gradient(135deg, #1e38e8, #4A6AFF)",
            boxShadow: "0 4px 20px rgba(38,67,247,0.35)",
          }}
        >
          {upgradeBusy ? (isArabic ? "جاري التوجيه…" : "Redirecting…") : upgradeLabel}
        </button>

        <button
          type="button"
          onClick={goSupport}
          style={{
            width: "100%",
            marginTop: 10,
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.03)",
            cursor: "pointer",
            fontFamily: F,
            fontSize: 13,
            fontWeight: 600,
            color: "rgba(255,255,255,0.55)",
          }}
        >
          {supportLabel}
        </button>

        <button
          type="button"
          onClick={onClose}
          style={{
            width: "100%",
            marginTop: 10,
            padding: "8px 14px",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            fontFamily: F,
            fontSize: 12,
            fontWeight: 600,
            color: "rgba(255,255,255,0.32)",
          }}
        >
          {closeLabel}
        </button>
      </div>
    </div>
  );
}
