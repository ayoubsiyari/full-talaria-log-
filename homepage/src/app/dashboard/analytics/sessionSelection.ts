export type Session = {
  id: number;
  name: string;
  session_type?: string;
  config?: Record<string, unknown>;
};

export type DashboardStrategy = {
  id: number;
  name: string;
};

/** Normalize `?strategy=` to `ALL` or `strategy:{id}` or a display name. */
export function parseStrategyFilterParam(raw: string | null | undefined): string {
  const s = raw != null ? String(raw).trim() : "";
  if (!s || s.toUpperCase() === "ALL") return "ALL";
  if (s.startsWith("strategy:")) return s;
  if (/^\d+$/.test(s)) return `strategy:${s}`;
  return s;
}

export function strategyFilterId(filter: string): number | null {
  if (!filter || filter === "ALL" || !filter.startsWith("strategy:")) return null;
  const n = Number.parseInt(filter.split(":")[1] || "", 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function sessionConfigStrategyId(session: Session): number | null {
  const cfg = session.config;
  if (!cfg || typeof cfg !== "object") return null;
  const raw = (cfg as Record<string, unknown>).strategy_id ?? (cfg as Record<string, unknown>).strategyId;
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function sessionConfigStrategyName(session: Session): string {
  const cfg = session.config;
  if (!cfg || typeof cfg !== "object") return "";
  const c = cfg as Record<string, unknown>;
  const name = c.strategy_name ?? c.playbook_display ?? c.playbook;
  return name != null ? String(name).trim() : "";
}

export function strategyLabel(
  filter: string,
  strategies: DashboardStrategy[]
): string {
  if (!filter || filter === "ALL") return "All strategies";
  const id = strategyFilterId(filter);
  if (id != null) {
    const hit = strategies.find((s) => s.id === id);
    if (hit) return hit.name;
  }
  return filter.startsWith("strategy:") ? `Strategy #${filter.split(":")[1]}` : filter;
}

export function tradeMatchesStrategyFilter(
  trade: { setup?: string; strategy_id?: number; strategyId?: number; preTradeNotes?: { tags?: string; setup?: string } },
  strategyFilter: string,
  strategies: DashboardStrategy[]
): boolean {
  if (!strategyFilter || strategyFilter === "ALL") return true;
  const fid = strategyFilterId(strategyFilter);
  const strat = fid != null ? strategies.find((s) => s.id === fid) : null;
  const targetName = (strat?.name || (fid == null ? strategyFilter : "")).trim().toLowerCase();
  const rawSid = trade.strategy_id ?? trade.strategyId;
  const tid = typeof rawSid === "number" ? rawSid : Number.parseInt(String(rawSid ?? ""), 10);
  if (fid != null && Number.isFinite(tid) && tid === fid) return true;
  const setup = String(trade.setup || trade.preTradeNotes?.setup || "").trim().toLowerCase();
  if (targetName && setup === targetName) return true;
  const tags = String(trade.preTradeNotes?.tags || "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (targetName && tags.some((t) => t === targetName || t.includes(targetName))) return true;
  return false;
}

export function sessionMatchesStrategyFilter(session: Session, strategyFilter: string): boolean {
  if (!strategyFilter || strategyFilter === "ALL") return true;
  const fid = strategyFilterId(strategyFilter);
  const sid = sessionConfigStrategyId(session);
  if (fid != null && sid != null && fid === sid) return true;
  const sname = sessionConfigStrategyName(session).toLowerCase();
  if (!sname) return false;
  if (fid == null && strategyFilter.toLowerCase() === sname) return true;
  return false;
}

/**
 * Chart stores `active_trading_session_id` for replay — not used on `/dashboard/` analytics
 * (avoids 403s when the stored id is stale or belongs to another context).
 */
export function readActiveTradingSessionIdFromBrowser(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const uid = localStorage.getItem("_uid");
    if (uid) {
      const scoped = localStorage.getItem(`u${uid}_active_trading_session_id`);
      if (scoped) return scoped;
    }
  } catch {
    /* ignore */
  }
  try {
    return localStorage.getItem("active_trading_session_id");
  } catch {
    return null;
  }
}

export type SessionKpisLite = { trades?: number };

/** Server-backed session ids only (skip chart/local ephemeral negative ids). */
export function isUsableDashboardSessionId(id: string | number | null | undefined): boolean {
  if (id == null) return false;
  const n = typeof id === "number" ? id : Number.parseInt(String(id).trim(), 10);
  return Number.isFinite(n) && n > 0;
}

export type ResolveSessionOptions = {
  /** `?sessionId=` — explicit deep link (e.g. from Backtest “Dashboard” on a session). */
  urlSessionId?: string | null;
  /** `?strategy=` — prefer a backtest session linked to this strategy. */
  urlStrategyFilter?: string | null;
  /** Kept only when still in the user's session list. */
  preferred?: string | null;
  /** Default false on dashboard analytics. */
  useChartStorage?: boolean;
  /** Prefer a session that already has journal trades when no explicit link applies. */
  kpisBySessionId?: Record<string, SessionKpisLite>;
};

function pickSessionWithTrades(
  sessions: Session[],
  kpisBySessionId?: Record<string, SessionKpisLite>
): string {
  if (!sessions.length || !kpisBySessionId) return "";
  let best = "";
  let bestTrades = -1;
  for (const s of sessions) {
    if (!isUsableDashboardSessionId(s.id)) continue;
    const id = String(s.id);
    const trades = Number(kpisBySessionId[id]?.trades ?? 0);
    if (trades > bestTrades) {
      bestTrades = trades;
      best = id;
    }
  }
  return bestTrades > 0 ? best : "";
}

/** Pick a session id that exists in `sessions` (never returns a foreign/stale id). */
export function resolveSessionIdForUser(
  sessions: Session[],
  options: ResolveSessionOptions = {}
): string {
  if (!sessions.length) return "";
  const allowed = new Set(sessions.map((s) => String(s.id)));
  const pick = (id: string | null | undefined) => {
    const key = id != null ? String(id).trim() : "";
    if (!key || !isUsableDashboardSessionId(key) || !allowed.has(key)) return "";
    return key;
  };

  const fromUrl = pick(options.urlSessionId);
  if (fromUrl) return fromUrl;

  const strategyFilter = parseStrategyFilterParam(options.urlStrategyFilter);
  if (strategyFilter !== "ALL") {
    const match = sessions.find((s) => sessionMatchesStrategyFilter(s, strategyFilter));
    if (match && isUsableDashboardSessionId(match.id)) return String(match.id);
  }

  const fromPreferred = pick(options.preferred);
  if (fromPreferred) return fromPreferred;

  if (options.useChartStorage) {
    const fromChart = pick(readActiveTradingSessionIdFromBrowser());
    if (fromChart) return fromChart;
  }

  const withTrades = pickSessionWithTrades(sessions, options.kpisBySessionId);
  if (withTrades) return withTrades;

  const firstPositive = sessions.find((s) => isUsableDashboardSessionId(s.id));
  return firstPositive ? String(firstPositive.id) : String(sessions[0].id);
}
