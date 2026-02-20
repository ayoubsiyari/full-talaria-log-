"use client";

import React from "react";
import Link from "next/link";
import { Database, Users, ShieldCheck, ArrowRight } from "lucide-react";
import { useLanguage } from "../../LanguageProvider";

type MeResponse = {
  user?: {
    role?: string;
  };
};

export default function AdminDashboardPage() {
  const { isArabic } = useLanguage();
  const [checking, setChecking] = React.useState(true);
  const [authorized, setAuthorized] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const res = await fetch("/api/auth/me", {
          credentials: "include",
          cache: "no-store",
        });

        if (!res.ok) {
          const target = `${window.location.pathname}${window.location.search || ""}`;
          window.location.href = `/login/?next=${encodeURIComponent(target)}`;
          return;
        }

        const body = (await res.json().catch(() => null)) as MeResponse | null;
        const isAdmin = body?.user?.role === "admin";

        if (!isAdmin) {
          window.location.href = "/";
          return;
        }

        if (mounted) {
          setAuthorized(true);
        }
      } catch {
        const target = `${window.location.pathname}${window.location.search || ""}`;
        window.location.href = `/login/?next=${encodeURIComponent(target)}`;
      } finally {
        if (mounted) {
          setChecking(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  if (checking) {
    return <div className="text-sm text-white/60">Loading admin dashboard...</div>;
  }

  if (!authorized) {
    return null;
  }

  return (
    <div className={isArabic ? "text-right" : "text-left"}>
      <div className="rounded-2xl border border-white/10 bg-[#0b0b16]/50 p-6 backdrop-blur-xl">
        <div className="flex items-start gap-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <ShieldCheck className="h-6 w-6 text-blue-300" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              {isArabic ? "لوحة تحكم الإدارة" : "Admin Dashboard"}
            </h1>
            <p className="mt-2 text-sm text-white/60">
              {isArabic
                ? "اختر نوع التحكم الذي تريد إدارته."
                : "Choose which control area you want to manage."}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Link
          href="/dashboard/admin/datasets/"
          className="group rounded-2xl border border-white/10 bg-[#0b0b16]/50 p-6 backdrop-blur-xl transition hover:border-blue-300/40 hover:bg-[#101025]"
        >
          <div className="flex items-center justify-between">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <Database className="h-5 w-5 text-cyan-300" />
            </div>
            <ArrowRight className="h-5 w-5 text-white/50 transition group-hover:text-white" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">
            {isArabic ? "التحكم في الداتاسيت" : "Dataset Control"}
          </h2>
          <p className="mt-1 text-sm text-white/60">
            {isArabic
              ? "إدارة الداتا والملفات الخاصة بالمنصة."
              : "Manage datasets and chart data files."}
          </p>
        </Link>

        <Link
          href="/dashboard/admin/users/"
          className="group rounded-2xl border border-white/10 bg-[#0b0b16]/50 p-6 backdrop-blur-xl transition hover:border-blue-300/40 hover:bg-[#101025]"
        >
          <div className="flex items-center justify-between">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <Users className="h-5 w-5 text-blue-300" />
            </div>
            <ArrowRight className="h-5 w-5 text-white/50 transition group-hover:text-white" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">
            {isArabic ? "التحكم في المستخدمين" : "User Control"}
          </h2>
          <p className="mt-1 text-sm text-white/60">
            {isArabic
              ? "عرض وإدارة حسابات المستخدمين."
              : "View and manage platform users."}
          </p>
        </Link>
      </div>
    </div>
  );
}
