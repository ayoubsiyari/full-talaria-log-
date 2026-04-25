"use client";

import React from "react";
import { useLanguage } from "../../../LanguageProvider";

type User = {
  id: number;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at?: string | null;
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...(init || {}), credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => null) as any;
    throw new Error(body?.detail ? String(body.detail) : `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export default function AdminUsersPage() {
  const { isArabic } = useLanguage();
  const [users, setUsers] = React.useState<User[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetchJson<{ users: User[] }>("/api/admin/users")
      .then((d) => setUsers(d.users || []))
      .catch((e: any) => setError(String(e?.message || e)))
      .finally(() => setLoading(false));
  }, []);

  const title = isArabic ? "المستخدمون" : "Users";

  return (
    <div className={isArabic ? "text-right" : "text-left"}>
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{title}</h1>
      <p className="text-sm text-white/60 mt-1">/api/admin/users</p>

      <div className="mt-6 rounded-2xl border border-white/10 bg-[#0b0b16]/50 backdrop-blur-xl overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-white/60">Loading...</div>
        ) : error ? (
          <div className="p-6 text-sm text-red-300">{error}</div>
        ) : (
          <div>
            <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs font-semibold text-white/60 border-b border-white/10">
              <div className="col-span-4">Email</div>
              <div className="col-span-3">Name</div>
              <div className="col-span-2">Role</div>
              <div className="col-span-2">Active</div>
              <div className="col-span-1">Id</div>
            </div>
            {users.map((u) => (
              <div key={u.id} className="grid grid-cols-12 gap-2 px-4 py-4 border-t border-white/5 items-center">
                <div className="col-span-4 font-medium">{u.email}</div>
                <div className="col-span-3 text-white/80">{u.name}</div>
                <div className="col-span-2">
                  <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs">
                    {u.role}
                  </span>
                </div>
                <div className="col-span-2 text-white/80">{u.is_active ? "yes" : "no"}</div>
                <div className="col-span-1 text-white/50">{u.id}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
