import { chartApi } from "./chartClient";
import type { AuthUser } from "@/context/AdminDataContext";

export type AuthMeResponse = {
  user?: AuthUser & { role?: string; is_admin?: boolean };
  journal_token?: string;
};

/** `/api/auth/me` wraps the profile in `{ user }` (same as legacy admin-dashboard). */
export function isAdminUser(u: AuthMeResponse["user"]): boolean {
  if (!u) return false;
  return u.role === "admin" || Boolean(u.is_admin);
}

export async function fetchAuthMe(): Promise<AuthMeResponse> {
  return chartApi<AuthMeResponse>("/api/auth/me");
}
