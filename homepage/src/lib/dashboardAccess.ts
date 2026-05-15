/**
 * Dashboard routes that require paid journal entitlement (`has_journal_access` or admin).
 * Keeps parity with chart `api_server` backtest UI gate and journal SPA `SubscriptionGuard`.
 */
export function dashboardPathRequiresPaidJournal(path: string): boolean {
  const p = path.split("?")[0].split("#")[0];
  return p.startsWith("/dashboard/journal") || p.startsWith("/dashboard/backtest");
}

export function userHasJournalEntitlement(user: { role?: string; has_journal_access?: boolean } | null): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  return !!user.has_journal_access;
}
