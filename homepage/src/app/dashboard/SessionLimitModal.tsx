"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "../LanguageProvider";
import {
  fetchPublicPlans,
  resolveSessionLimitUpgrade,
  sessionLimitMailtoHref,
  sessionLimitSupportHref,
  SESSION_LIMIT_SUPPORT_EMAIL,
  type SessionLimitGateData,
  type SessionLimitUpgradeAction,
} from "./sessionLimitGate";
import { openBillingPortal, startPlanCheckout } from "./sessionLimitCheckout";

const F = "'Exo 2', sans-serif";

const c = {
  ac: "#2643F7",
  acL: "#4A6AFF",
  acD: "rgba(38,67,247,0.08)",
  acB: "rgba(38,67,247,0.22)",
  acG: "rgba(74,106,255,0.35)",
  gold: "#C9A84C",
  bg: "#07080E",
  sf: "#0A0C14",
  el: "#0F1119",
  br: "rgba(140,160,255,0.05)",
  brH: "rgba(140,160,255,0.12)",
  tx: "rgba(255,255,255,0.92)",
  ts: "rgba(255,255,255,0.70)",
  tm: "rgba(255,255,255,0.50)",
  gn: "#00D4A1",
  rd: "#FF5068",
};

type Props = {
  open: boolean;
  data: SessionLimitGateData | null;
  onClose: () => void;
};

function secH(label: string) {
  return (
    <div
      style={{
        fontSize: 9,
        fontWeight: 800,
        color: c.tm,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        marginBottom: 8,
        fontFamily: F,
      }}
    >
      {label}
    </div>
  );
}

export function SessionLimitModal({ open, data, onClose }: Props) {
  const { isArabic } = useLanguage();
  const router = useRouter();
  const [upgrade, setUpgrade] = React.useState<SessionLimitUpgradeAction | null>(null);
  const [upgradeBusy, setUpgradeBusy] = React.useState(false);
  const [upgradeErr, setUpgradeErr] = React.useState<string | null>(null);
  const [supportOpen, setSupportOpen] = React.useState(false);
  const [supportHov, setSupportHov] = React.useState<string | null>(null);
  const [closeHov, setCloseHov] = React.useState(false);
  const [liveChatNotice, setLiveChatNotice] = React.useState(false);

  React.useEffect(() => {
    if (!open || !data) {
      setUpgrade(null);
      setUpgradeErr(null);
      setUpgradeBusy(false);
      setSupportOpen(false);
      setSupportHov(null);
      setLiveChatNotice(false);
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
    data.planName || (isArabic ? "بدون اشتراك نشط" : "No active subscription");

  const title = isArabic ? "حد جلسات الباك تست" : "Session limit reached";
  const body = isArabic
    ? `لديك ${data.count} من ${data.cap} جلسة. احذف جلسة أو قم بالترقية أو تواصل مع الدعم.`
    : `You have ${data.count} of ${data.cap} saved sessions. Delete one, upgrade, or contact support.`;

  const upgradeLabel = upgrade?.label || (isArabic ? "ترقية الخطة" : "Upgrade plan");
  const upgradeHint =
    upgrade?.hint ||
    (isArabic ? "الخطط الأعلى تتضمن المزيد من الجلسات." : "Higher tiers include more backtest sessions.");
  const supportLabel = isArabic ? "تواصل مع الدعم" : "Contact support";
  const supportBackLabel = isArabic ? "رجوع" : "Back";
  const closeLabel = isArabic ? "إغلاق" : "Close";
  const usageLabel = isArabic ? "الاستخدام" : "Usage";
  const planHeading = isArabic ? "الخطة الحالية" : "Current plan";
  const supportChooseLabel = isArabic ? "اختر طريقة التواصل" : "Choose how to reach us";
  const nextPlanLabel =
    upgrade?.planName && upgrade.nextSessionCap
      ? isArabic
        ? `مقترح: ${upgrade.planName} — ${upgrade.nextSessionCap} جلسة`
        : `Suggested: ${upgrade.planName} — ${upgrade.nextSessionCap} sessions`
      : null;

  const supportOptions = [
    {
      id: "mail",
      title: isArabic ? "البريد الإلكتروني" : "Email",
      desc: SESSION_LIMIT_SUPPORT_EMAIL,
      enabled: true,
    },
    {
      id: "ticket",
      title: isArabic ? "تذكرة دعم" : "Support ticket",
      desc: isArabic ? "افتح تذكرة داخل التطبيق" : "Open an in-app support ticket",
      enabled: true,
    },
    {
      id: "chat",
      title: isArabic ? "دردشة مباشرة" : "Live chat",
      desc: isArabic ? "قريباً" : "Coming soon",
      enabled: false,
    },
  ];

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

  const onSupportChoice = (id: string) => {
    if (id === "mail") {
      window.location.href = sessionLimitMailtoHref();
      return;
    }
    if (id === "ticket") {
      onClose();
      router.push(sessionLimitSupportHref());
      return;
    }
    if (id === "chat") {
      setLiveChatNotice(true);
    }
  };

  const choiceRowSx = (id: string, enabled: boolean): React.CSSProperties => {
    const hov = supportHov === id;
    return {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "10px 12px",
      border: `1px solid ${hov && enabled ? c.acB : c.brH}`,
      background: hov && enabled ? c.acD : c.el,
      cursor: enabled ? "pointer" : "default",
      opacity: enabled ? 1 : 0.72,
      transition: "background 0.12s, border-color 0.12s",
      fontFamily: F,
    };
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
        visibility: "visible",
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(4,5,10,0.72)",
          backdropFilter: "blur(3px)",
        }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "min(460px, 92vw)",
          maxHeight: "min(88vh, 640px)",
          background: c.sf,
          border: `1px solid ${c.brH}`,
          display: "flex",
          flexDirection: "column",
          animation: "tlrPopIn 0.18s ease",
          boxShadow: "0 24px 72px rgba(0,0,0,0.9)",
          fontFamily: F,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: 2,
            flexShrink: 0,
            background: `linear-gradient(90deg,${c.ac},${c.acL},${c.ac})`,
          }}
        />

        <div
          style={{
            height: 44,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            borderBottom: `1px solid ${c.br}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <img src="/LOGO-07.png" style={{ width: 22, height: 22, objectFit: "contain" }} alt="" />
            <div
              id="session-limit-title"
              style={{ fontSize: 12, fontWeight: 700, color: c.tx, letterSpacing: "0.04em", fontFamily: F }}
            >
              {title}
            </div>
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={onClose}
            onMouseEnter={() => setCloseHov(true)}
            onMouseLeave={() => setCloseHov(false)}
            style={{
              width: 30,
              height: 30,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "default",
              background: closeHov ? "rgba(255,80,80,0.07)" : "transparent",
              transition: "background 0.12s",
            }}
          >
            <svg width={18} height={18} viewBox="0 -960 960 960" fill={closeHov ? c.rd : c.ts}>
              <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z" />
            </svg>
          </div>
        </div>

        <div className="tlr-scroll" style={{ flex: 1, overflowY: "auto", padding: "16px 18px 18px" }}>
          <p style={{ margin: "0 0 14px", fontSize: 11, lineHeight: 1.55, color: c.ts }}>{body}</p>

          <div style={{ border: `1px solid ${c.brH}`, padding: "12px 14px", marginBottom: 14, background: c.el }}>
            {secH(usageLabel)}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: c.tm }}>{isArabic ? "جلسات محفوظة" : "Saved sessions"}</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: c.rd }}>
                {data.count} / {data.cap}
              </span>
            </div>
            <div style={{ height: 4, background: c.br, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: `linear-gradient(90deg,${c.rd},#ff8a9a)`,
                  boxShadow: `0 0 8px rgba(255,80,104,0.35)`,
                }}
              />
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: c.tm, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
                {planHeading}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: c.acL,
                  padding: "3px 10px",
                  background: c.acD,
                  border: `1px solid ${c.acB}`,
                }}
              >
                {planLabel}
              </span>
              </div>
            </div>
            {nextPlanLabel ? (
              <p style={{ margin: "10px 0 0", fontSize: 10, lineHeight: 1.45, color: c.tm }}>{nextPlanLabel}</p>
            ) : null}
          </div>

          <p style={{ margin: "0 0 12px", fontSize: 10, lineHeight: 1.5, color: c.tm }}>{upgradeHint}</p>

          {upgradeErr ? (
            <p style={{ margin: "0 0 10px", fontSize: 11, color: c.rd }}>{upgradeErr}</p>
          ) : null}

          {!supportOpen ? (
            <>
              <button
                type="button"
                disabled={upgradeBusy}
                onClick={() => void goUpgrade()}
                style={{
                  width: "100%",
                  height: 36,
                  padding: "0 20px",
                  border: "none",
                  cursor: upgradeBusy ? "wait" : "default",
                  opacity: upgradeBusy ? 0.75 : 1,
                  fontFamily: F,
                  fontSize: 13,
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.96)",
                  background: "linear-gradient(135deg,#1e38e8,#4A6AFF)",
                  boxShadow: "0 2px 10px rgba(38,67,247,0.35)",
                }}
              >
                {upgradeBusy ? (isArabic ? "جاري التوجيه…" : "Redirecting…") : upgradeLabel}
              </button>

              <button
                type="button"
                onClick={() => setSupportOpen(true)}
                style={{
                  width: "100%",
                  marginTop: 8,
                  height: 34,
                  padding: "0 14px",
                  border: `1px solid ${c.brH}`,
                  background: c.el,
                  cursor: "default",
                  fontFamily: F,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  color: c.ts,
                }}
              >
                {supportLabel}
              </button>
            </>
          ) : (
            <div style={{ border: `1px solid ${c.brH}`, padding: "12px 12px 10px", background: c.el }}>
              {secH(supportChooseLabel)}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {supportOptions.map((opt) => (
                  <div
                    key={opt.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSupportChoice(opt.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSupportChoice(opt.id);
                      }
                    }}
                    onMouseEnter={() => setSupportHov(opt.id)}
                    onMouseLeave={() => setSupportHov(null)}
                    style={choiceRowSx(opt.id, opt.enabled)}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: opt.id === "chat" ? "rgba(201,168,76,0.1)" : c.acD,
                        border: `1px solid ${opt.id === "chat" ? "rgba(201,168,76,0.28)" : c.acB}`,
                      }}
                    >
                      {opt.id === "mail" && (
                        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={c.acL} strokeWidth="1.6">
                          <rect x="3" y="5" width="18" height="14" rx="1" />
                          <path d="M3 7l9 6 9-6" strokeLinecap="round" />
                        </svg>
                      )}
                      {opt.id === "ticket" && (
                        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={c.acL} strokeWidth="1.6">
                          <path d="M4 8h16v3a2 2 0 010 4v3H4v-3a2 2 0 010-4V8z" strokeLinejoin="round" />
                          <path d="M9 8v8M15 11v2" strokeLinecap="round" />
                        </svg>
                      )}
                      {opt.id === "chat" && (
                        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={c.gold} strokeWidth="1.6">
                          <path d="M4 5h16v10H8l-4 4V5z" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: c.tx }}>{opt.title}</div>
                      <div
                        style={{
                          fontSize: 10,
                          color: opt.id === "chat" ? c.gold : c.tm,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {opt.desc}
                      </div>
                    </div>
                    {opt.id === "chat" ? (
                      <span
                        style={{
                          fontSize: 8,
                          fontWeight: 800,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          color: c.gold,
                          padding: "2px 6px",
                          border: `1px solid rgba(201,168,76,0.35)`,
                          background: "rgba(201,168,76,0.08)",
                        }}
                      >
                        {isArabic ? "قريباً" : "Soon"}
                      </span>
                    ) : (
                      <svg width={8} height={8} viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
                        <polyline points="2,1 8,5 2,9" stroke={c.tm} strokeWidth="1.4" strokeLinecap="round" />
                      </svg>
                    )}
                  </div>
                ))}
              </div>
              {liveChatNotice ? (
                <p
                  style={{
                    margin: "10px 0 0",
                    padding: "8px 10px",
                    fontSize: 10,
                    lineHeight: 1.45,
                    color: c.gold,
                    background: "rgba(201,168,76,0.08)",
                    border: `1px solid rgba(201,168,76,0.22)`,
                  }}
                >
                  {isArabic
                    ? "الدردشة المباشرة قيد التطوير — استخدم البريد أو تذكرة الدعم في الوقت الحالي."
                    : "Live chat is coming soon — please use email or a support ticket for now."}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setSupportOpen(false);
                  setLiveChatNotice(false);
                }}
                style={{
                  width: "100%",
                  marginTop: 10,
                  height: 30,
                  border: `1px solid ${c.brH}`,
                  background: "transparent",
                  cursor: "default",
                  fontFamily: F,
                  fontSize: 11,
                  fontWeight: 600,
                  color: c.tm,
                }}
              >
                {supportBackLabel}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            style={{
              width: "100%",
              marginTop: 10,
              padding: "6px 14px",
              border: "none",
              background: "transparent",
              cursor: "default",
              fontFamily: F,
              fontSize: 11,
              fontWeight: 600,
              color: c.tm,
            }}
          >
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
