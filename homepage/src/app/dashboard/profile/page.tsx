"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "../../LanguageProvider";
import "./profile-page.css";

type SubscriptionInfo = {
  id: number;
  plan_name: string;
  status: string;
  is_manual: boolean;
  period_end: string | null;
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
};

function initials(name: string, email: string) {
  const n = (name || "").trim();
  if (n.length >= 2) return n.slice(0, 2).toUpperCase();
  const e = (email || "").trim();
  if (e.length >= 2) return e.slice(0, 2).toUpperCase();
  return "?";
}

export default function ProfilePage() {
  const { isArabic } = useLanguage();
  const [user, setUser] = React.useState<MeUser | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saveMsg, setSaveMsg] = React.useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [name, setName] = React.useState("");
  const [country, setCountry] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [birthDate, setBirthDate] = React.useState("");
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("not_authenticated");
      const data = (await res.json()) as { user: MeUser };
      const u = data.user;
      setUser(u);
      setName(u.name || "");
      setCountry(u.country || "");
      setPhone(u.phone || "");
      setBirthDate((u.birth_date || "").slice(0, 10));
    } catch {
      const next = `${window.location.pathname}${window.location.search || ""}`;
      window.location.href = `/login/?next=${encodeURIComponent(next)}`;
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveMsg(null);
    if (!user) return;

    if (newPassword || confirmPassword || currentPassword) {
      if (!currentPassword) {
        setSaveMsg({ type: "err", text: isArabic ? "أدخل كلمة المرور الحالية" : "Enter your current password to set a new one." });
        return;
      }
      if (newPassword.length < 8) {
        setSaveMsg({ type: "err", text: isArabic ? "كلمة المرور الجديدة قصيرة جداً" : "New password must be at least 8 characters." });
        return;
      }
      if (newPassword !== confirmPassword) {
        setSaveMsg({ type: "err", text: isArabic ? "كلمتا المرور غير متطابقتين" : "New password and confirmation do not match." });
        return;
      }
    }

    const body: Record<string, unknown> = {
      name: name.trim() || user.name,
      country: country.trim(),
      phone: phone.trim(),
      birth_date: birthDate.trim() || null,
    };
    if (newPassword.length >= 8) {
      body.password = newPassword;
      body.current_password = currentPassword;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const raw = await res.json().catch(() => ({}));
      if (!res.ok) {
        const d = (raw as { detail?: unknown }).detail;
        let detail = "";
        if (Array.isArray(d)) {
          detail = d
            .map((x: unknown) =>
              typeof x === "object" && x && "msg" in x ? String((x as { msg: string }).msg) : String(x),
            )
            .join("; ");
        } else if (typeof d === "string") {
          detail = d;
        } else {
          detail = res.statusText;
        }
        throw new Error(detail || "Save failed");
      }
      const u = (raw as { user?: MeUser }).user;
      if (u) {
        setUser(u);
        setName(u.name || "");
        setCountry(u.country || "");
        setPhone(u.phone || "");
        setBirthDate((u.birth_date || "").slice(0, 10));
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSaveMsg({
        type: "ok",
        text: isArabic ? "تم حفظ الملف الشخصي." : "Profile saved successfully.",
      });
    } catch (err) {
      setSaveMsg({
        type: "err",
        text: err instanceof Error ? err.message : "Save failed",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="prof-wrap" style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>
        {isArabic ? "جاري التحميل…" : "Loading…"}
      </div>
    );
  }

  const sub = user.subscription;

  return (
    <div className="prof-wrap">
      <Link href="/dashboard/" className="prof-back">
        ← {isArabic ? "لوحة التحكم" : "Dashboard"}
      </Link>

      <div className="prof-hero">
        <div className="prof-avatar" aria-hidden>
          {initials(user.name, user.email)}
        </div>
        <div className="prof-hero-text">
          <h1>{isArabic ? "إعدادات الحساب" : "Account settings"}</h1>
          <p>
            {isArabic
              ? "حدّث معلوماتك الشخصية وكلمة المرور. عنوان البريد الإلكتروني ثابت ولا يمكن تغييره من هنا."
              : "Update your personal details and password. Your email address is fixed and cannot be changed here — contact support if you need to move accounts."}
          </p>
        </div>
      </div>

      <form onSubmit={onSave}>
        <div className="prof-grid">
          <section className="prof-card">
            <h2>{isArabic ? "المعلومات الشخصية" : "Profile information"}</h2>
            <div className="prof-fields">
              <div className="prof-field">
                <label htmlFor="prof-name">{isArabic ? "الاسم الظاهر" : "Display name"}</label>
                <input id="prof-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
              </div>
              <div className="prof-field">
                <label htmlFor="prof-country">{isArabic ? "الدولة / المنطقة" : "Country / region"}</label>
                <input id="prof-country" value={country} onChange={(e) => setCountry(e.target.value)} autoComplete="country-name" />
              </div>
              <div className="prof-field">
                <label htmlFor="prof-phone">{isArabic ? "رقم الهاتف" : "Phone"}</label>
                <input id="prof-phone" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
              </div>
              <div className="prof-field">
                <label htmlFor="prof-dob">{isArabic ? "تاريخ الميلاد" : "Date of birth"}</label>
                <input id="prof-dob" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
                <div className="prof-hint">YYYY-MM-DD</div>
              </div>
            </div>
          </section>

          <section className="prof-card">
            <h2>{isArabic ? "الأمان" : "Security"}</h2>
            <div className="prof-fields">
              <div className="prof-field">
                <label htmlFor="prof-email">{isArabic ? "البريد الإلكتروني" : "Email"}</label>
                <input id="prof-email" value={user.email} disabled readOnly />
                <div className="prof-hint">
                  {isArabic ? "لا يمكن تغيير البريد من هذه الصفحة." : "Email cannot be changed on this page."}
                </div>
              </div>
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
                <div className="prof-hint">{isArabic ? "اتركه فارغاً للإبقاء على كلمة المرور." : "Leave blank to keep your current password."}</div>
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
          </section>

          <section className="prof-card prof-card--wide">
            <h2>{isArabic ? "تفاصيل الحساب" : "Account details"}</h2>
            <div className="prof-kv">
              <div className="prof-kv-row">
                <span className="prof-kv-k">User ID</span>
                <span className="prof-kv-v">{user.id}</span>
              </div>
              <div className="prof-kv-row">
                <span className="prof-kv-k">{isArabic ? "الدور" : "Role"}</span>
                <span className="prof-kv-v">{user.role}</span>
              </div>
              <div className="prof-kv-row">
                <span className="prof-kv-k">{isArabic ? "الحالة" : "Status"}</span>
                <span className="prof-kv-v">{user.is_active ? (isArabic ? "نشط" : "Active") : isArabic ? "غير نشط" : "Inactive"}</span>
              </div>
              <div className="prof-kv-row">
                <span className="prof-kv-k">{isArabic ? "صلاحية اليوميات" : "Journal access"}</span>
                <span className="prof-kv-v">{user.has_journal_access ? (isArabic ? "نعم" : "Yes") : isArabic ? "لا" : "No"}</span>
              </div>
              <div className="prof-kv-row">
                <span className="prof-kv-k">{isArabic ? "حد الأجهزة" : "Max devices"}</span>
                <span className="prof-kv-v">{user.max_sessions}</span>
              </div>
              <div className="prof-kv-row">
                <span className="prof-kv-k">{isArabic ? "انتهاء الوصول" : "Access expires"}</span>
                <span className="prof-kv-v">
                  {user.access_expires_at
                    ? new Date(user.access_expires_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
                    : "—"}
                </span>
              </div>
              <div className="prof-kv-row">
                <span className="prof-kv-k">Stripe customer</span>
                <span className="prof-kv-v">{user.stripe_customer_id || "—"}</span>
              </div>
              <div className="prof-kv-row">
                <span className="prof-kv-k">{isArabic ? "المنطقة الزمنية (عرض)" : "Timezone (display)"}</span>
                <span className="prof-kv-v">{user.timezone || "UTC"}</span>
              </div>
              <div className="prof-kv-row">
                <span className="prof-kv-k">{isArabic ? "العملة الأساسية (عرض)" : "Base currency (display)"}</span>
                <span className="prof-kv-v">{user.base_currency || "USD"}</span>
              </div>
              <div className="prof-kv-row">
                <span className="prof-kv-k">{isArabic ? "أنشئ في" : "Created"}</span>
                <span className="prof-kv-v">
                  {user.created_at ? new Date(user.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—"}
                </span>
              </div>
              <div className="prof-kv-row">
                <span className="prof-kv-k">{isArabic ? "الاشتراك" : "Subscription"}</span>
                <span className="prof-kv-v">
                  {sub ? (
                    <>
                      {sub.plan_name} · {sub.status}
                      {sub.period_end ? ` · ${isArabic ? "حتى" : "renews"} ${new Date(sub.period_end).toLocaleDateString()}` : ""}
                    </>
                  ) : (
                    "—"
                  )}
                </span>
              </div>
            </div>
          </section>
        </div>

        {saveMsg ? (
          <div className={`prof-msg ${saveMsg.type === "ok" ? "prof-msg--ok" : "prof-msg--err"}`} style={{ marginTop: 20 }}>
            {saveMsg.text}
          </div>
        ) : null}

        <div className="prof-actions">
          <button type="submit" className="prof-btn prof-btn--primary" disabled={saving}>
            {saving ? (isArabic ? "جاري الحفظ…" : "Saving…") : isArabic ? "حفظ التغييرات" : "Save changes"}
          </button>
          <button type="button" className="prof-btn prof-btn--ghost" onClick={() => void load()} disabled={saving}>
            {isArabic ? "إعادة التحميل" : "Reload"}
          </button>
        </div>
      </form>
    </div>
  );
}
