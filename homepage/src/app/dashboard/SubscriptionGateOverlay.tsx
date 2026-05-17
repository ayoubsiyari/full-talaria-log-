"use client";

import React from "react";

const F = "'Exo 2', sans-serif";

export type GateVariant = "subscription" | "admin_restricted";

type Props = {
  isArabic: boolean;
  variant?: GateVariant;
  active: boolean;
  onContinueToPlans: () => void;
  onAccountSettings: () => void;
  onContactSupport: () => void;
  onGoToAllowed: () => void;
};

/**
 * Full-viewport gate inside the dashboard shell (sidebar stays usable).
 */
export default function SubscriptionGateOverlay({
  isArabic,
  variant = "subscription",
  onContinueToPlans,
  onAccountSettings,
  onContactSupport,
  onGoToAllowed,
  active,
}: Props) {
  const isAdminRestricted = variant === "admin_restricted";
  const [seconds, setSeconds] = React.useState(8);
  const redirectedRef = React.useRef(false);
  const intervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const goPlans = React.useCallback(() => {
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    onContinueToPlans();
  }, [onContinueToPlans]);

  React.useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (!active) {
      setSeconds(8);
      redirectedRef.current = false;
      return;
    }
    if (isAdminRestricted) {
      setSeconds(0);
      redirectedRef.current = false;
      return;
    }
    setSeconds(8);
    redirectedRef.current = false;
    let remaining = 8;
    intervalRef.current = setInterval(() => {
      remaining -= 1;
      setSeconds(Math.max(0, remaining));
      if (remaining <= 0 && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        if (!redirectedRef.current) {
          redirectedRef.current = true;
          onContinueToPlans();
        }
      }
    }, 1000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [active, isAdminRestricted, onContinueToPlans]);

  if (!active) return null;

  const title = isAdminRestricted
    ? isArabic
      ? "هذا القسم غير متاح"
      : "This section is not available"
    : isArabic
      ? "يتطلب اشتراكاً نشطاً"
      : "Subscription required";

  const body = isAdminRestricted
    ? isArabic
      ? "تم تقييد وصولك إلى هذا القسم من قبل الإدارة. إذا كنت تعتقد أن هذا خطأ، تواصل مع الدعم."
      : "Your access to this area was limited by an administrator. Contact support if you believe this is a mistake or need it enabled."
    : isArabic
      ? "جلسة التداول والتحليلات والأدوات المتقدمة متاحة مع الخطة المدفوعة. اختر خطةً للمتابعة."
      : "Journal, analytics, backtesting, and pro tools are included with an active plan. Choose a plan to continue.";

  const primaryCta = isAdminRestricted
    ? isArabic
      ? "تواصل مع الدعم"
      : "Contact support"
    : isArabic
      ? "عرض الخطط والأسعار"
      : "View plans & pricing";

  const secondaryCta = isAdminRestricted
    ? isArabic
      ? "العودة إلى أقسامي"
      : "Back to my sections"
    : isArabic
      ? "إعدادات الحساب"
      : "Account settings";

  const countdownLabel =
    !isAdminRestricted && seconds > 0
      ? isArabic
        ? `سيتم فتح صفحة الخطط خلال ${seconds} ث…`
        : `Opening plans in ${seconds}s…`
      : !isAdminRestricted
        ? isArabic
          ? "جارٍ التوجيه…"
          : "Redirecting…"
        : null;

  const onPrimary = isAdminRestricted ? onContactSupport : goPlans;
  const onSecondary = isAdminRestricted ? onGoToAllowed : onAccountSettings;

  const footerNote = isAdminRestricted
    ? isArabic
      ? "لا يلزم الاشتراك لهذا القسم — يجب تفعيله من الإدارة."
      : "A subscription is not required for this section — an admin must enable it for your account."
    : isArabic
      ? "لن يُفرض عليك دفع حتى تختار خطة وتُكمل الدفع."
      : "You are not charged until you pick a plan and complete checkout.";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="db-sub-gate-title"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: F,
        background: "rgba(7,8,14,0.72)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
    >
      <GateDialogCard
        isArabic={isArabic}
        title={title}
        body={body}
        primaryCta={primaryCta}
        secondaryCta={secondaryCta}
        countdownLabel={countdownLabel}
        onPrimary={onPrimary}
        onSecondary={onSecondary}
        footerNote={footerNote}
        lockIcon={isAdminRestricted}
      />
    </div>
  );
}

function GateIcon({ adminRestricted }: { adminRestricted: boolean }) {
  if (adminRestricted) {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8aa4ff" strokeWidth="1.8">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8aa4ff" strokeWidth="1.8">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" strokeLinecap="round" />
    </svg>
  );
}

function GateDialogCard({
  isArabic,
  title,
  body,
  primaryCta,
  secondaryCta,
  countdownLabel,
  onPrimary,
  onSecondary,
  footerNote,
  lockIcon,
}: {
  isArabic: boolean;
  title: string;
  body: string;
  primaryCta: string;
  secondaryCta: string;
  countdownLabel: string | null;
  onPrimary: () => void;
  onSecondary: () => void;
  footerNote: string;
  lockIcon: boolean;
}) {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: 420,
        borderRadius: 16,
        padding: "28px 26px 24px",
        background:
          "linear-gradient(165deg, rgba(22,24,34,0.98) 0%, rgba(12,14,22,0.98) 100%)",
        border: "1px solid rgba(140,160,255,0.14)",
        boxShadow: "0 24px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.35) inset",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(74,106,255,0.12)",
            border: "1px solid rgba(74,106,255,0.28)",
            flexShrink: 0,
          }}
          aria-hidden
        >
          <GateIcon adminRestricted={lockIcon} />
        </div>
        <div style={{ minWidth: 0 }}>
          <p
            id="db-sub-gate-title"
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
          </p>
          {countdownLabel ? (
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 12,
                fontWeight: 600,
                color: "rgba(255,255,255,0.38)",
              }}
            >
              {countdownLabel}
            </p>
          ) : null}
        </div>
      </div>
      <p style={{ margin: "0 0 22px", fontSize: 13, lineHeight: 1.55, color: "rgba(255,255,255,0.58)" }}>
        {body}
      </p>
      <button
        type="button"
        onClick={onPrimary}
        style={{
          width: "100%",
          padding: "14px 18px",
          borderRadius: 12,
          border: "none",
          cursor: "pointer",
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
        {primaryCta}
      </button>
      <button
        type="button"
        onClick={onSecondary}
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
        {secondaryCta}
      </button>
      <p
        style={{
          margin: "16px 0 0",
          fontSize: 11,
          lineHeight: 1.45,
          color: "rgba(255,255,255,0.28)",
          textAlign: "center",
        }}
      >
        {footerNote}
      </p>
    </div>
  );
}
