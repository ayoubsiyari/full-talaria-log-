/** Placeholder returned by chart API when AUTH_ENABLED=false (dev/worker misconfig). */
export function isAnonymousPlaceholderUser(
  user: { id?: number; email?: string } | null | undefined,
): boolean {
  if (!user) return false;
  return user.id === 0 && user.email === "anonymous@local";
}

/** Treat the dev placeholder as signed-out in marketing/dashboard UI. */
export function normalizeAuthUser<T extends { id?: number; email?: string }>(
  user: T | null | undefined,
): T | null {
  if (!user || isAnonymousPlaceholderUser(user)) return null;
  return user;
}
