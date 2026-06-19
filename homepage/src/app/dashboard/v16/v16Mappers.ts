import {
  flattenJournalApiTrade,
  tradeRowPnl,
  tradeRowSide,
  tradeRowSymbol,
  tradeRowTimestamp,
  type JournalApiTradeItem,
} from "../sessionJournalUtils";
import { sessionConfigStrategyName } from "../analytics/sessionSelection";

type ApiSession = {
  id: number;
  name: string;
  symbol?: string;
  session_type?: string;
  start_balance?: number;
  start_date?: string;
  end_date?: string;
  created_at?: string;
  config?: Record<string, unknown>;
  replay_dashboard?: {
    progress_pct?: number;
    elapsed_days?: number;
  } | null;
};

export type SessionKpis = {
  trades: number;
  win_rate: number | null;
  net_pnl: number;
  expectancy_r: number | null;
  start_balance: number | null;
};

function cfgString(cfg: Record<string, unknown> | undefined, ...keys: string[]): string {
  if (!cfg) return "";
  for (const key of keys) {
    const v = cfg[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function cfgArray(cfg: Record<string, unknown> | undefined, key: string): string[] {
  const v = cfg?.[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

function sessionTickers(sess: ApiSession): string[] {
  const cfg = sess.config;
  const fromCfg = cfgArray(cfg, "tickers");
  if (fromCfg.length) return fromCfg;
  const instruments = cfg?.instruments;
  if (instruments && typeof instruments === "object" && !Array.isArray(instruments)) {
    return Object.keys(instruments as Record<string, unknown>);
  }
  if (sess.symbol && !/^\d+\s*symbols?$/i.test(sess.symbol)) return [sess.symbol];
  return [];
}

function sessionAssetClasses(sess: ApiSession): string[] {
  const cfg = sess.config;
  const ac = cfgString(cfg, "asset_class", "assetClass");
  const list = cfgArray(cfg, "asset_classes");
  if (list.length) return list;
  return ac ? [ac] : [];
}

function winRatePct(kpis: SessionKpis | undefined): number | null {
  const w = kpis?.win_rate;
  if (w == null || Number.isNaN(Number(w))) return null;
  const n = Number(w);
  return n <= 1 ? Math.round(n * 100) : Math.round(n);
}

function sessionProgress(sess: ApiSession, kpis: SessionKpis | undefined): number {
  const dash = sess.replay_dashboard;
  if (dash && typeof dash.progress_pct === "number" && Number.isFinite(dash.progress_pct)) {
    return Math.min(100, Math.max(0, Math.round(dash.progress_pct)));
  }
  const trades = kpis?.trades ?? 0;
  if (trades > 0) return 100;
  return 0;
}

function isoDay(ms: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function parseDurationMinutes(raw: unknown): number {
  if (raw == null || raw === "") return 30;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(1, Math.round(raw));
  const s = String(raw).trim();
  const asNum = Number(s);
  if (Number.isFinite(asNum) && /^\d+(\.\d+)?$/.test(s)) return Math.max(1, Math.round(asNum));
  const hm = s.match(/(\d+)\s*h/i);
  const mm = s.match(/(\d+)\s*m/i);
  const h = hm ? Number(hm[1]) : 0;
  const m = mm ? Number(mm[1]) : 0;
  if (h || m) return Math.max(1, h * 60 + m);
  return 30;
}

function sideLabel(side: "long" | "short" | ""): string {
  if (side === "long") return "Long";
  if (side === "short") return "Short";
  return "Long";
}

/** Map chart API journal row → trade shape expected by TalariaV16 dashboard math. */
export function mapJournalRowToV16Trade(
  row: Record<string, unknown>,
  session: ApiSession,
  index: number
): Record<string, unknown> {
  const pnl = tradeRowPnl(row) ?? 0;
  const side = sideLabel(tradeRowSide(row));
  const symbol = tradeRowSymbol(row) || session.symbol || "—";
  const ts = tradeRowTimestamp(row);
  const date = isoDay(ts) || String(row.date || row.time || "").slice(0, 10);
  const rRaw =
    row.rMultiple ??
    row.r_multiple ??
    row.rr ??
    row.R ??
    row.rewardToRiskRatio ??
    row.actual_rr_net ??
    0;
  const rMultiple = Number(rRaw);
  const r = Number.isFinite(rMultiple) ? rMultiple : 0;
  const tag =
    String(row.tag || row.setup || row.strategy || "").trim() ||
    sessionConfigStrategyName(session) ||
    "Trade";
  const mae = Number(row.mae_r ?? row.mae ?? row.MAE ?? 0);
  const mfe = Number(row.mfe_r ?? row.mfe ?? row.MFE ?? 0);
  const markets = sessionAssetClasses(session);
  return {
    id: String(row.client_trade_id || row.id || row.trade_id || `${session.id}-t${index + 1}`),
    n: index + 1,
    date,
    closeTime: ts ? new Date(ts).toISOString() : String(row.time || row.close_time || ""),
    symbol,
    market: markets[0] || "",
    side,
    session: "Session",
    tag,
    rMultiple: r,
    duration: parseDurationMinutes(row.duration ?? row.hold_minutes),
    pnl: Math.round(pnl),
    mae: Number.isFinite(mae) ? mae : -Math.abs(r) * 0.5,
    mfe: Number.isFinite(mfe) ? mfe : Math.abs(r) * 0.8,
    plannedRR: Number(row.plannedRR ?? row.planned_rr ?? row.tp ?? 2) || 2,
    actualRR: Math.abs(r),
    rulesFollowed: true,
    preTags: [tag],
    postTags: [pnl >= 0 ? "Win" : "Loss"],
    sourceKey: `session:${session.id}`,
    sourceFilterKey: `session:${session.id}`,
    sourceSessionId: session.id,
    sourceSessionName: session.name,
    sourceLabel: session.name,
    sourceType: "backtest",
  };
}

export function mapApiSessionToV16(
  sess: ApiSession,
  kpis: SessionKpis | undefined,
  compositeTrades: Record<string, unknown>[] | null,
  options?: { tradesLoaded?: boolean }
): Record<string, unknown> {
  const cfg = sess.config;
  const tickers = sessionTickers(sess);
  const assetClasses = sessionAssetClasses(sess);
  const capital = Number(
    kpis?.start_balance ?? sess.start_balance ?? cfg?.capital ?? cfg?.start_balance ?? 10000
  );
  const loaded = options?.tradesLoaded ?? compositeTrades != null;
  const tradesArr = compositeTrades ?? [];
  const trades = kpis?.trades ?? (loaded ? tradesArr.length : 0);
  const netPnl =
    kpis?.net_pnl ?? (loaded ? tradesArr.reduce((s, t) => s + (Number(t.pnl) || 0), 0) : 0);
  const wr = winRatePct(kpis);
  const avgRR =
    kpis?.expectancy_r != null && Number.isFinite(Number(kpis.expectancy_r))
      ? Number(kpis.expectancy_r)
      : loaded && tradesArr.length > 0
        ? tradesArr.reduce((s, t) => s + (Number(t.rMultiple) || 0), 0) / tradesArr.length
        : null;
  const tradingMode =
    cfgString(cfg, "trading_mode", "tradingMode").toLowerCase() === "prop" ||
    String(sess.session_type || "").toLowerCase().includes("prop")
      ? "prop"
      : "standard";

  return {
    id: sess.id,
    name: sess.name,
    strategyName:
      cfgString(cfg, "strategy_name", "strategyName", "playbook_display", "playbook") ||
      sessionConfigStrategyName(sess) ||
      sess.name,
    strategyDesc:
      cfgString(cfg, "description", "session_description", "sessionDescription", "strategy_desc") ||
      "Backtest session",
    tickers: tickers.length ? tickers : sess.symbol ? [sess.symbol] : [],
    timeframe: cfgString(cfg, "timeframe", "tf") || "1H",
    startDate: (sess.start_date || "").slice(0, 10),
    endDate: (sess.end_date || "").slice(0, 10),
    capital,
    createdAt: sess.created_at || new Date().toISOString(),
    trades,
    pnl: netPnl,
    winRate: wr,
    avgRR,
    tradingMode,
    progress: sessionProgress(sess, kpis),
    rollbackAllowed: true,
    assetClasses: assetClasses.length ? assetClasses : ["Futures"],
    leverage: cfgString(cfg, "leverage") || "1:10",
    riskVal: cfgString(cfg, "risk_val", "riskVal") || "1",
    riskMode: cfgString(cfg, "risk_mode", "riskMode") || "pct",
    commission: cfgString(cfg, "commission") || "Per Lot",
    replayMode: cfgString(cfg, "replay_mode", "replayMode") || "Candle",
    replaySpeed: Number(cfg?.replay_speed ?? cfg?.replaySpeed ?? 30) || 30,
    compositeTrades: loaded ? tradesArr : undefined,
    compositeTradesLoaded: loaded,
    sessionType: sess.session_type || "standard",
    config: cfg && typeof cfg === "object" ? { ...cfg } : {},
  };
}

export async function fetchJournalTradesForSession(
  sessionId: number | string
): Promise<Record<string, unknown>[]> {
  try {
    const stateRes = await fetch(`/api/sessions/${encodeURIComponent(String(sessionId))}/state`, {
      credentials: "include",
      cache: "no-store",
    });
    if (stateRes.ok) {
      const payload = (await stateRes.json()) as { state?: { journal?: Record<string, unknown>[] } };
      const journal = Array.isArray(payload?.state?.journal) ? payload.state!.journal! : [];
      if (journal.length) return journal;
    }
  } catch {
    /* fall through */
  }

  try {
    const res = await fetch(`/api/sessions/${encodeURIComponent(String(sessionId))}/journal-trades`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { trades?: JournalApiTradeItem[] };
    const items = Array.isArray(data?.trades) ? data.trades : [];
    return items.map(flattenJournalApiTrade);
  } catch {
    return [];
  }
}

export async function fetchAndMapTradesForSession(
  sess: ApiSession
): Promise<Record<string, unknown>[]> {
  const rawRows = await fetchJournalTradesForSession(sess.id);
  return rawRows.map((row, i) => mapJournalRowToV16Trade(row, sess, i));
}
