/**
 * Journal / Flask API (strategies, feed, templates). Proxied at /journal/api on the main site.
 */
export const JOURNAL_API_BASE = "/journal/api";

/**
 * Read a non-httpOnly cookie value by name (used for the CSRF token).
 * The journal_token JWT itself is httpOnly and intentionally NOT readable here.
 */
export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp("(?:^|; )" + escaped + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

/** CSRF token set by the chart alongside the httpOnly journal_token cookie. */
export function journalCsrfToken(): string | null {
  return readCookie("csrf_access_token");
}

/**
 * Auth hardening: the journal JWT now lives in an httpOnly cookie (set by the
 * chart on /api/auth/* and refreshed on GET /api/auth/me), not in localStorage.
 * This is kept for compatibility but no longer persists anything to JS-readable
 * storage; it simply returns the token the server handed back, if any.
 */
export function applyJournalTokenFromAuthResponse(data: {
  journal_token?: unknown;
} | null | undefined): string | null {
  const t = data?.journal_token;
  return typeof t === "string" && t.trim() ? t.trim() : null;
}

/**
 * Ensure the httpOnly journal_token + readable csrf_access_token cookies are
 * present by pinging GET /api/auth/me (which re-mints them from the live chart
 * session). Returns the CSRF token (truthy) when authenticated, else null — so
 * existing callers that used the return value as an "is authed" guard still work.
 * Journal API calls are same-origin, so the httpOnly cookie is sent automatically.
 */
export async function syncJournalTokenFromSession(
  opts?: { forceRefresh?: boolean },
): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (!opts?.forceRefresh) {
    const existing = journalCsrfToken();
    if (existing) return existing;
  }
  try {
    const res = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
    if (!res.ok) return null;
    return journalCsrfToken();
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
        "Strategy API is temporarily unavailable. Please try again in a minute.",
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

/**
 * Headers for journal API calls. Auth now rides on the httpOnly cookie (sent
 * automatically same-origin); we only attach the CSRF token so Flask accepts
 * cookie-authenticated writes (POST/PUT/PATCH/DELETE). No Bearer token — the
 * JWT is no longer exposed to JavaScript.
 */
export function journalAuthHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const csrf = journalCsrfToken();
  if (csrf) h["X-CSRF-TOKEN"] = csrf;
  return h;
}
