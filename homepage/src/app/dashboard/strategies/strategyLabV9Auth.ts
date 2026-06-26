/** Auth helpers for Strategy Lab V9. Auth rides on the httpOnly journal cookie
 *  (sent automatically same-origin); we attach the CSRF token for writes. */
import { journalCsrfToken } from "@/lib/journalApi";

/**
 * @deprecated The JWT is no longer readable from JS. Presence of the readable
 * CSRF cookie is used as an "is authenticated" signal for callers that still
 * call this as a guard.
 */
export function getToken(): string | null {
  return journalCsrfToken();
}

export function loginUrlWithNext(): string {
  return `/login/?next=${encodeURIComponent("/dashboard/?view=stratbank")}`;
}

export function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const csrf = journalCsrfToken();
  if (csrf) h["X-CSRF-TOKEN"] = csrf;
  return h;
}

/** Same as authHeaders now — kept as a separate export for call-site stability. */
export function fetchHeadersJson(): Record<string, string> {
  return authHeaders();
}
