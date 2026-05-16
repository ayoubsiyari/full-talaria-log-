/** Auth helpers for Strategy Lab V9 (same token contract as Strategies Lab). */

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export function loginUrlWithNext(): string {
  return `/login/?next=${encodeURIComponent("/dashboard/strategies/")}`;
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

/** Omit Bearer when logged out so public routes do not get `Bearer null`. */
export function fetchHeadersJson(): Record<string, string> {
  const token = getToken();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}
