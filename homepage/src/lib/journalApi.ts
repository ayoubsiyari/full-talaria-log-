/**
 * Journal / Flask API (strategies, feed, templates). Proxied at /journal/api on the main site.
 */
export const JOURNAL_API_BASE = "/journal/api";

/** Persist chart session JWT for journal API calls (Flask Bearer auth). */
export function applyJournalTokenFromAuthResponse(data: {
  journal_token?: unknown;
} | null | undefined): string | null {
  if (typeof window === "undefined") return null;
  const t = data?.journal_token;
  if (typeof t !== "string" || !t.trim()) return null;
  localStorage.setItem("token", t.trim());
  return t.trim();
}

/**
 * Dashboard uses cookie sessions; journal strategies use Bearer JWT in localStorage.
 * Mint/sync JWT from GET /api/auth/me when missing (same JWT_SECRET_KEY as journal-backend).
 */
export async function syncJournalTokenFromSession(
  opts?: { forceRefresh?: boolean },
): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (!opts?.forceRefresh) {
    const existing = localStorage.getItem("token");
    if (existing) return existing;
  } else {
    localStorage.removeItem("token");
  }
  try {
    const res = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { journal_token?: string };
    return applyJournalTokenFromAuthResponse(data);
  } catch {
    return null;
  }
}

/** Parse JSON body; return clear error when nginx serves HTML (502 maintenance page). */
export async function parseJournalJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) return {} as T;
  if (trimmed.startsWith("<")) {
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new Error(
        "Strategy API is temporarily unavailable (server maintenance). Restart journal-backend or try again in a minute.",
      );
    }
    throw new Error(
      `Strategy API returned an unexpected page instead of JSON (HTTP ${res.status}).`,
    );
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(
      `Strategy API returned invalid JSON (HTTP ${res.status}).`,
    );
  }
}

export function journalAuthHeaders(): Record<string, string> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}
