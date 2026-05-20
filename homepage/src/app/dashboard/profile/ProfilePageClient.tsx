"use client";

import React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLanguage } from "../../LanguageProvider";
import { SupportInbox } from "../support/SupportInbox";
import "./profile-page.css";

type SettingsTab = "profile" | "security" | "subscription" | "support";

const VALID_TABS: SettingsTab[] = ["profile", "security", "subscription", "support"];

function parseTab(raw: string | null): SettingsTab {
  if (raw && VALID_TABS.includes(raw as SettingsTab)) return raw as SettingsTab;
  return "profile";
}

type SubscriptionInfo = {
  id: number;
  plan_name: string;
  status: string;
  is_manual: boolean;
  period_end: string | null;
  cancel_at_period_end?: boolean;
  stripe_subscription_id?: string | null;
} | null;

type MeUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  timezone?: string;
  base_currency?: string;
  is_active: boolean;
  has_journal_access: boolean;
  access_expires_at: string | null;
  max_sessions: number;
  subscription: SubscriptionInfo;
  created_at: string | null;
  updated_at: string | null;
  country?: string | null;
  phone?: string | null;
  birth_date?: string | null;
  stripe_customer_id?: string | null;
  public_id?: string | null;
};

function initials(name: string, email: string) {
  const n = (name || "").trim();
  if (n.length >= 1) return n.charAt(0).toUpperCase();
  const e = (email || "").trim();
  if (e.length >= 1) return e.charAt(0).toUpperCase();
  return "?";
}

function splitName(full: string): [string, string] {
  const t = full.trim();
  const i = t.indexOf(" ");
  if (i <= 0) return [t, ""];
  return [t.slice(0, i), t.slice(i + 1).trim()];
}

function formatLocalTime(tz?: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tz || undefined,
      timeZoneName: "short",
    }).format(new Date());
  } catch {
    return new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
}

function ProfilePageInner() {
  const { isArabic } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const threadId = searchParams.get("thread");

  const setTab = React.useCallback(
    (next: SettingsTab) => {
      const q = new URLSearchParams(searchParams.toString());
      q.set("tab", next);
      if (next !== "support") {
        q.delete("thread");
        q.delete("topic");
      }
      router.replace(`/dashboard/profile/?${q.toString()}`);
    },
    [router, searchParams],
  );
  const [user, setUser] = React.useState<MeUser | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saveMsg, setSaveMsg] = React.useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [country, setCountry] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [birthDate, setBirthDate] = React.useState("");
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [billingMsg, setBillingMsg] = React.useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [billingBusy, setBillingBusy] = React.useState<string | null>(null);

  const parseApiDetail = (raw: unknown): string => {
    const d = (raw as { detail?: unknown }).detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) {
      return d
        .map((x: unknown) =>
          typeof x === "object" && x && "msg" in x ? String((x as { msg: string }).msg) : String(x),
        )
        .join("; ");
    }
    return "";
  };

  const applyUser = React.useCallback((u: MeUser) => {
    setUser(u);
    const [fn, ln] = splitName(u.name || "");
    setFirstName(fn);
    setLastName(ln);
    setCountry(u.country || "");
    setPhone(u.phone || "");
    setBirthDate((u.birth_date || "").slice(0, 10));
  }, []);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("not_authenticated");
      const data = (await res.json()) as { user: MeUser };
      applyUser(data.user);
    } catch {
      const next = `${window.location.pathname}${window.location.search || ""}`;
      window.location.href = `/login/?next=${encodeURIComponent(next)}`;
    }
  }, [applyUser]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const openBillingPortal = async () => {
    setBillingMsg(null);
    setBillingBusy("portal");
    const returnUrl = `${window.location.origin}/dashboard/profile/`;
    try {
      const res = await fetch("/api/auth/billing-portal", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ return_url: returnUrl }),
      });
      const raw = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(parseApiDetail(raw) || res.statusText);
      const url = (raw as { url?: string }).url;
      if (!url) throw new Error("No portal URL");
      window.location.assign(url);
    } catch (e) {
      setBillingMsg({ type: "err", text: e instanceof Error ? e.message : "Portal failed" });
    } finally {
      setBillingBusy(null);
    }
  };

  const cancelRenewalAtPeriodEnd = async () => {
    const ok = window.confirm(
      isArabic
        ? "سيتوقف التجديد تلقائياً في نهاية الفترة الحالية. متابعة؟"
        : "Renewal will stop at the end of your current billing period. Continue?",
    );
    if (!ok) return;
    setBillingMsg(null);
    setBillingBusy("cancel");
    try {
      const res = await fetch("/api/auth/subscription/cancel-at-period-end", {
        method: "POST",
        credentials: "include",
      });
      const raw = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(parseApiDetail(raw) || res.statusText);
      await load();
      setBillingMsg({
        type: "ok",
        text: isArabic ? "تم جدولة إيقاف التجديد." : "Renewal scheduled to stop at period end.",
      });
    } catch (e) {
      setBillingMsg({ type: "err", text: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setBillingBusy(null);
    }
  };

  const resumeRenewal = async () => {
    setBillingMsg(null);
    setBillingBusy("resume");
    try {
      const res = await fetch("/api/auth/subscription/reactivate", {
        method: "POST",
        credentials: "include",
      });
      const raw = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(parseApiDetail(raw) || res.statusText);
      await load();
      setBillingMsg({ type: "ok", text: isArabic ? "تم استئناف التجديد." : "Renewal resumed." });
    } catch (e) {
      setBillingMsg({ type: "err", text: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setBillingBusy(null);
    }
  };

  const patchProfile = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/auth/profile", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseApiDetail(raw) || "Save failed");
    const u = (raw as { user?: MeUser }).user;
    if (u) applyUser(u);
    return raw;
  };

  const onSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveMsg(null);
    if (!user) return;
    const displayName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ") || user.name;
    setSaving(true);
    try {
      await patchProfile({
        name: displayName,
        country: country.trim(),
        phone: phone.trim(),
        birth_date: birthDate.trim() || null,
      });
      setSaveMsg({ type: "ok", text: isArabic ? "تم حفظ الملف الشخصي." : "Profile saved." });
    } catch (err) {
      setSaveMsg({ type: "err", text: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  const onSaveSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveMsg(null);
    if (!user) return;
    if (!currentPassword) {
      setSaveMsg({
        type: "err",
        text: isArabic ? "أدخل كلمة المرور الحالية" : "Enter your current password.",
      });
      return;
    }
    if (newPassword.length < 8) {
      setSaveMsg({
        type: "err",
        text: isArabic ? "كلمة المرور الجديدة قصيرة جداً" : "New password must be at least 8 characters.",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setSaveMsg({
        type: "err",
        text: isArabic ? "كلمتا المرور غير متطابقتين" : "Passwords do not match.",
      });
      return;
    }
    setSaving(true);
    try {
      await patchProfile({ password: newPassword, current_password: currentPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSaveMsg({ type: "ok", text: isArabic ? "تم تحديث كلمة المرور." : "Password updated." });
    } catch (err) {
      setSaveMsg({ type: "err", text: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="prof-settings">
        <div className="prof-loading">{isArabic ? "جاري التحميل…" : "Loading…"}</div>
      </div>
    );
  }

  const sub = user.subscription;
  const stripeCustomer = (user.stripe_customer_id || "").trim();
  const stripeSub = sub?.stripe_subscription_id && !sub.is_manual;
  const scheduledCancel = Boolean(sub?.cancel_at_period_end);
  const subActive = sub && ["active", "trialing"].includes((sub.status || "").toLowerCase());
  const locationLine = [country.trim(), user.timezone].filter(Boolean).join(" · ") || "—";

  const navItems: { id: SettingsTab; label: string }[] = [
    { id: "profile", label: isArabic ? "الملف الشخصي" : "Profile" },
    { id: "security", label: isArabic ? "الأمان" : "Security" },
    { id: "subscription", label: isArabic ? "الاشتراك" : "Subscription" },
    { id: "support", label: isArabic ? "الدعم" : "Support" },
  ];

  return (
    <div className="prof-settings">
      <div className="prof-settings__shell">
        <aside className="prof-settings__nav">
          <Link href="/dashboard/" className="prof-settings__back">
            <span aria-hidden>‹</span> {isArabic ? "الإعدادات" : "Settings"}
          </Link>

          <div className="prof-settings__nav-group">
            <div className="prof-settings__nav-label">
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5" />
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              {isArabic ? "المستخدم" : "User"}
            </div>
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`prof-settings__nav-item${tab === item.id ? " prof-settings__nav-item--active" : ""}`}
                onClick={() => {
                  setTab(item.id);
                  setSaveMsg(null);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="prof-settings__nav-group">
            <div className="prof-settings__nav-label">
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
                <path
                  d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              {isArabic ? "عام" : "General"}
            </div>
            <Link href="/pricing/?browse=1" className="prof-settings__nav-item" style={{ textDecoration: "none" }}>
              {isArabic ? "الخطط والأسعار" : "Plans & pricing"}
            </Link>
          </div>
        </aside>

        <main className="prof-settings__main">
          {tab === "profile" && (
            <>
              <h1 className="prof-settings__title">{isArabic ? "الملف الشخصي" : "Profile"}</h1>
              <p className="prof-settings__subtitle">
                {isArabic
                  ? "حدّث معلوماتك الشخصية المعروضة في التطبيق."
                  : "Update your personal information shown across the app."}
              </p>

              {saveMsg && tab === "profile" ? (
                <div className={`prof-msg prof-msg--${saveMsg.type === "ok" ? "ok" : "err"}`}>{saveMsg.text}</div>
              ) : null}

              <form onSubmit={onSaveProfile}>
                <div className="prof-profile-layout">
                  <div className="prof-card prof-avatar-card">
                    <div className="prof-avatar-ring" aria-hidden>
                      {initials(user.name, user.email)}
                    </div>
                    <h3>{[firstName, lastName].filter(Boolean).join(" ") || user.name}</h3>
                    <div className="prof-avatar-meta">
                      {locationLine}
                      <br />
                      {formatLocalTime(user.timezone)}
                    </div>
                    <button type="button" className="prof-btn--ghost-sm" disabled title={isArabic ? "قريباً" : "Coming soon"}>
                      {isArabic ? "تحديث الصورة" : "Update image"}
                    </button>
                  </div>

                  <div className="prof-card">
                    <h2 className="prof-card__title">{isArabic ? "تفاصيل الملف" : "Profile details"}</h2>
                    <div className="prof-form-grid">
                      <div className="prof-field">
                        <label htmlFor="prof-fn">{isArabic ? "الاسم الأول" : "First name"}</label>
                        <input id="prof-fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
                      </div>
                      <div className="prof-field">
                        <label htmlFor="prof-ln">{isArabic ? "اسم العائلة" : "Last name"}</label>
                        <input id="prof-ln" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
                      </div>
                      <div className="prof-field prof-field--full">
                        <label htmlFor="prof-email">{isArabic ? "البريد الإلكتروني" : "Email"}</label>
                        <input id="prof-email" value={user.email} disabled readOnly />
                        <div className="prof-hint">
                          {isArabic ? "لا يمكن تغيير البريد من هنا." : "Email cannot be changed here."}
                        </div>
                      </div>
                      {user.public_id ? (
                        <div className="prof-field prof-field--full">
                          <label htmlFor="prof-public-id">{isArabic ? "المعرّف العام" : "Public ID"}</label>
                          <input id="prof-public-id" value={user.public_id} disabled readOnly />
                          <div className="prof-hint">
                            {isArabic
                              ? "يظهر على استراتيجياتك في المجتمع ليتعرف عليك الأعضاء."
                              : "Shown on your Community strategies so other members can identify your posts."}
                          </div>
                        </div>
                      ) : null}
                      <div className="prof-field">
                        <label htmlFor="prof-country">{isArabic ? "الدولة / المنطقة" : "Country / region"}</label>
                        <input id="prof-country" value={country} onChange={(e) => setCountry(e.target.value)} autoComplete="country-name" />
                      </div>
                      <div className="prof-field">
                        <label htmlFor="prof-phone">{isArabic ? "الهاتف" : "Phone"}</label>
                        <input id="prof-phone" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
                      </div>
                      <div className="prof-field prof-field--full">
                        <label htmlFor="prof-dob">{isArabic ? "تاريخ الميلاد" : "Date of birth"}</label>
                        <input id="prof-dob" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
                      </div>
                    </div>
                    <div className="prof-actions">
                      <button type="submit" className="prof-btn prof-btn--primary" disabled={saving}>
                        {saving ? (isArabic ? "جاري الحفظ…" : "Saving…") : isArabic ? "حفظ" : "Save"}
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            </>
          )}

          {tab === "security" && (
            <>
              <h1 className="prof-settings__title">{isArabic ? "إعدادات الأمان" : "Security settings"}</h1>
              <p className="prof-settings__subtitle">
                {isArabic
                  ? "يجب إدخال كلمة المرور الحالية لتعيين كلمة مرور جديدة."
                  : "You must provide your current password in order to change passwords."}
              </p>

              {saveMsg && tab === "security" ? (
                <div className={`prof-msg prof-msg--${saveMsg.type === "ok" ? "ok" : "err"}`}>{saveMsg.text}</div>
              ) : null}

              <form onSubmit={onSaveSecurity}>
                <div className="prof-card" style={{ maxWidth: 520 }}>
                  <h2 className="prof-card__title">{isArabic ? "تغيير كلمة المرور" : "Change your password"}</h2>
                  <div className="prof-form-grid prof-form-grid--1">
                    <div className="prof-field">
                      <label htmlFor="prof-cur-pw">{isArabic ? "كلمة المرور الحالية" : "Current password"}</label>
                      <input
                        id="prof-cur-pw"
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        autoComplete="current-password"
                      />
                    </div>
                    <div className="prof-field">
                      <label htmlFor="prof-new-pw">{isArabic ? "كلمة مرور جديدة" : "New password"}</label>
                      <input
                        id="prof-new-pw"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        autoComplete="new-password"
                      />
                    </div>
                    <div className="prof-field">
                      <label htmlFor="prof-conf-pw">{isArabic ? "تأكيد كلمة المرور" : "Confirm new password"}</label>
                      <input
                        id="prof-conf-pw"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                      />
                    </div>
                  </div>
                  <div className="prof-actions">
                    <button type="submit" className="prof-btn prof-btn--primary" disabled={saving}>
                      {saving ? (isArabic ? "جاري الحفظ…" : "Saving…") : isArabic ? "حفظ" : "Save"}
                    </button>
                  </div>
                </div>
              </form>
            </>
          )}

          {tab === "subscription" && (
            <>
              <h1 className="prof-settings__title">
                {isArabic ? "نظرة على الاشتراك" : "Subscription overview"}
              </h1>
              <p className="prof-settings__subtitle">
                {isArabic
                  ? "إدارة اشتراكك وطرق الدفع."
                  : "Manage your subscription and payment methods."}
              </p>

              {billingMsg ? (
                <div className={`prof-msg prof-msg--${billingMsg.type === "ok" ? "ok" : "err"}`}>{billingMsg.text}</div>
              ) : null}

              <div className="prof-sub-layout">
                <div>
                  <div className="prof-card">
                    <div className="prof-plan-head">
                      <div>
                        <span className={`prof-plan-badge${subActive ? "" : " prof-plan-badge--warn"}`}>
                          {subActive ? (isArabic ? "نشط" : "Active") : sub?.status || (isArabic ? "لا خطة" : "No plan")}
                        </span>
                        <div className="prof-plan-name" style={{ marginTop: 10 }}>
                          {sub?.plan_name || (isArabic ? "بدون اشتراك" : "No subscription")}
                        </div>
                      </div>
                      {stripeSub && !scheduledCancel && subActive ? (
                        <button type="button" className="prof-link-danger" onClick={() => void cancelRenewalAtPeriodEnd()}>
                          {billingBusy === "cancel" ? "…" : isArabic ? "إلغاء الخطة" : "Cancel plan"}
                        </button>
                      ) : null}
                    </div>

                    {sub?.period_end ? (
                      <div className="prof-kv-grid">
                        <div className="prof-kv-mini">
                          <span className="prof-kv-mini-k">{isArabic ? "دورة الفوترة" : "Billing cycle"}</span>
                          <span className="prof-kv-mini-v">{sub.is_manual ? (isArabic ? "يدوي" : "Manual") : isArabic ? "شهري" : "Monthly"}</span>
                        </div>
                        <div className="prof-kv-mini">
                          <span className="prof-kv-mini-k">{isArabic ? "الشحنة التالية" : "Next charge"}</span>
                          <span className="prof-kv-mini-v">
                            {new Date(sub.period_end).toLocaleDateString(undefined, { dateStyle: "medium" })}
                          </span>
                        </div>
                        <div className="prof-kv-mini">
                          <span className="prof-kv-mini-k">{isArabic ? "الحالة" : "Status"}</span>
                          <span className="prof-kv-mini-v prof-kv-mini-v--ok">{sub.status}</span>
                        </div>
                      </div>
                    ) : null}

                    {scheduledCancel ? (
                      <p className="prof-hint" style={{ marginTop: 14 }}>
                        {isArabic
                          ? "التجديد متوقف عند نهاية الفترة الحالية."
                          : "Renewal stops at the end of the current period."}
                      </p>
                    ) : null}
                  </div>

                  <div className="prof-card">
                    <h2 className="prof-card__title">{isArabic ? "استخدام الحساب" : "Usage details"}</h2>
                    <div className="prof-hint">{isArabic ? "جلسات Backtest" : "Backtest sessions"}</div>
                    <div className="prof-usage-bar">
                      <span style={{ width: user.max_sessions ? "8%" : "0%" }} />
                    </div>
                    <div className="prof-hint">
                      {isArabic
                        ? `الحد: ${user.max_sessions || "—"} جلسة`
                        : `Limit: ${user.max_sessions || "—"} sessions`}
                    </div>
                    <div className="prof-kv-grid" style={{ marginTop: 16 }}>
                      <div className="prof-kv-mini">
                        <span className="prof-kv-mini-k">{isArabic ? "الوصول" : "Access"}</span>
                        <span className="prof-kv-mini-v prof-kv-mini-v--ok">
                          {user.has_journal_access ? (isArabic ? "مفعّل" : "Enabled") : (isArabic ? "محدود" : "Limited")}
                        </span>
                      </div>
                      <div className="prof-kv-mini">
                        <span className="prof-kv-mini-k">{isArabic ? "ينتهي الوصول" : "Access expires"}</span>
                        <span className="prof-kv-mini-v">
                          {user.access_expires_at
                            ? new Date(user.access_expires_at).toLocaleDateString()
                            : "—"}
                        </span>
                      </div>
                      <div className="prof-kv-mini">
                        <span className="prof-kv-mini-k">{isArabic ? "عضو منذ" : "Member since"}</span>
                        <span className="prof-kv-mini-v">
                          {user.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="prof-card">
                    <h2 className="prof-card__title">{isArabic ? "طرق الدفع" : "Payment methods"}</h2>
                    <p className="prof-card__desc">
                      {isArabic
                        ? "إدارة البطاقات والفواتير عبر بوابة Stripe الآمنة."
                        : "Manage cards and invoices in Stripe's secure billing portal."}
                    </p>
                    <div className="prof-bill-actions">
                      <button
                        type="button"
                        className="prof-btn prof-btn--primary"
                        disabled={!stripeCustomer || billingBusy !== null}
                        onClick={() => void openBillingPortal()}
                      >
                        {billingBusy === "portal"
                          ? isArabic
                            ? "جاري الفتح…"
                            : "Opening…"
                          : isArabic
                            ? "فتح بوابة الفوترة"
                            : "Open billing portal"}
                      </button>
                      {stripeSub && scheduledCancel ? (
                        <button
                          type="button"
                          className="prof-btn prof-btn--ghost"
                          disabled={billingBusy !== null}
                          onClick={() => void resumeRenewal()}
                        >
                          {billingBusy === "resume" ? "…" : isArabic ? "استئناف التجديد" : "Resume renewal"}
                        </button>
                      ) : null}
                    </div>
                    {!stripeCustomer ? (
                      <p className="prof-hint" style={{ marginTop: 12 }}>
                        <Link href="/pricing/?browse=1" style={{ color: "var(--prof-ac)" }}>
                          {isArabic ? "اشترك من صفحة الأسعار" : "Subscribe from pricing"}
                        </Link>
                      </p>
                    ) : null}
                  </div>
                </div>

                <aside>
                  <div className="prof-card">
                    <h2 className="prof-card__title">{isArabic ? "الخطط المتاحة" : "Available plans"}</h2>
                    <p className="prof-card__desc" style={{ color: "var(--prof-gn)" }}>
                      {isArabic ? "قارن الخطط وغيّر اشتراكك" : "Compare plans and change your subscription"}
                    </p>
                    <div className={`prof-plan-card${subActive ? " prof-plan-card--highlight" : ""}`}>
                      <span className="prof-plan-badge">{sub?.plan_name || "—"}</span>
                      <div className="prof-plan-price">
                        {subActive ? (isArabic ? "خطتك الحالية" : "Your plan") : "—"}
                      </div>
                      <ul className="prof-check-list">
                        <li>{isArabic ? "Journal و Backtest" : "Journal & backtest"}</li>
                        <li>{isArabic ? "تحليلات الجلسات" : "Session analytics"}</li>
                        <li>{isArabic ? "دعم الفوترة عبر Stripe" : "Stripe billing support"}</li>
                      </ul>
                      {subActive ? (
                        <button type="button" className="prof-btn prof-btn--muted" disabled>
                          {isArabic ? "الخطة الحالية" : "Current plan"}
                        </button>
                      ) : (
                        <Link href="/pricing/?browse=1" className="prof-btn prof-btn--outline" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
                          {isArabic ? "عرض الخطط" : "View plans"}
                        </Link>
                      )}
                    </div>
                  </div>
                </aside>
              </div>
            </>
          )}

          {tab === "support" && (
            <>
              <h1 className="prof-settings__title">{isArabic ? "الدعم" : "Support"}</h1>
              <p className="prof-settings__subtitle">
                {isArabic
                  ? "أبلغ عن مشكلة أو اطلب المساعدة. يمكنك إرفاق لقطة شاشة (حتى 2 ميجابايت)."
                  : "Report a bug or ask for help. You can attach a screenshot (up to 2 MB)."}
              </p>
              <SupportInbox embedded initialThreadId={threadId} />
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default function ProfilePageClient() {
  return <ProfilePageInner />;
}
