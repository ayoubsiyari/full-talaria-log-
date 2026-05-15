/**
 * Dashboard routes that require paid journal entitlement (`has_journal_access` or admin).
 * Default-deny under `/dashboard`: home, journal, backtest, COT, strategies, sessions, etc.
 * Exempt: profile (account), support, admin (role-gated on the page).
 *
 * **Note:** With `output: "export"` there is no Next middleware; this map drives the client
 * shell only. Paid data must still be denied by `/api/*` (chart / journal-backend) — same
 * as TradingView-style apps (polished UI gate + strict APIs).
 */
export function dashboardPathRequiresPaidJournal(path: string): boolean {
  const p = path.split("?")[0].split("#")[0];
  if (!p.startsWith("/dashboard")) return false;
  if (p.startsWith("/dashboard/profile")) return false;
  if (p.startsWith("/dashboard/support")) return false;
  if (p.startsWith("/dashboard/admin")) return false;
  return true;
}

export function userHasJournalEntitlement(user: { role?: string; has_journal_access?: boolean } | null): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  return !!user.has_journal_access;
}
