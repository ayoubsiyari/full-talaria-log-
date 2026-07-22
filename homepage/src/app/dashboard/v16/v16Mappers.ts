import {
  flattenJournalApiTrade,
  tradeRowDurationMinutes,
  tradeRowPnl,
  tradeRowRealizedR,
  tradeRowSide,
  tradeRowSymbol,
  tradeRowStatus,
  tradeRowTimestamp,
  type JournalApiTradeItem,
} from "../sessionJournalUtils";
import { sessionConfigStrategyName } from "../analytics/sessionSelection";
import {
  extractStrategyVariablesFromDefinition,
  strategyVariablesHaveItems,
} from "../strategies/strategyLabV9Mappers";

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
  const trades = kpis?.trades ?? 0;
  if (dash && typeof dash.progress_pct === "number" && Number.isFinite(dash.progress_pct)) {
    const pct = Math.min(100, Math.max(0, Math.round(dash.progress_pct)));
    if (pct > 0) return pct;
    if (trades <= 0) return 0;
    // Replay at 0% but KPIs show trades — stay at 0%; lifecycle bucket uses trades.
    return 0;
  }
  if (trades > 0) return 100;
  return 0;
}

export function sessionHasTradingActivity(
  sess: Record<string, unknown> | null | undefined
): boolean {
  if (!sess) return false;
  if (Number(sess.trades || 0) > 0) return true;
  const composite = sess.compositeTrades;
  if (Array.isArray(composite) && composite.length > 0) return true;
  const progress = Number(sess.progress || 0);
  if (progress > 0 && progress < 100) return true;
  const pnl = Number(sess.pnl);
  if (Number.isFinite(pnl) && Math.abs(pnl) >= 0.005) return true;
  return false;
}

export function resolveSessionLifecycleBucket(
  sess: Record<string, unknown> | null | undefined
): "completed" | "active" | "not-started" {
  const progress = Number(sess?.progress || 0);
  if (progress >= 100) return "completed";
  if (sessionHasTradingActivity(sess)) return "active";
  return "not-started";
}

function isoDay(ms: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function parseDurationMinutes(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(1, Math.round(raw));
  const s = String(raw).trim();
  const asNum = Number(s);
  if (Number.isFinite(asNum) && /^\d+(\.\d+)?$/.test(s)) return Math.max(1, Math.round(asNum));
  const hm = s.match(/(\d+)\s*h/i);
  const mm = s.match(/(\d+)\s*m/i);
  const h = hm ? Number(hm[1]) : 0;
  const m = mm ? Number(mm[1]) : 0;
  if (h || m) return Math.max(1, h * 60 + m);
  return null;
}

function sideLabel(side: "long" | "short" | ""): string {
  if (side === "long") return "Long";
  if (side === "short") return "Short";
  return "Long";
}

function tagListFromRow(row: Record<string, unknown>, key: string): unknown[] | null {
  const raw = row[key];
  if (Array.isArray(raw) && raw.length) return raw;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return Object.values(raw as Record<string, unknown>).flatMap((v) =>
      Array.isArray(v) ? v : v != null && v !== "" ? [v] : []
    );
  }
  return null;
}

/** Globally unique dashboard trade id; falls back to session:local when SQL row id is absent. */
export function resolveGlobalTradeId(
  row: Record<string, unknown>,
  sessionId: number | string,
  index: number
): { globalId: string; sessionLocalId: string; chartTradeId: string | number } {
  const sessionLocalId = String(
    row.client_trade_id ?? row.tradeId ?? row.trade_id ?? row.id ?? `t${index + 1}`
  );
  const chartTradeId = (row.tradeId ?? row.id ?? sessionLocalId) as string | number;
  const jid = row.journal_trade_id;
  if (jid != null && String(jid).trim() !== "") {
    return { globalId: String(jid), sessionLocalId, chartTradeId };
  }
  return { globalId: `${sessionId}:${sessionLocalId}`, sessionLocalId, chartTradeId };
}

/** Map chart API journal row → trade shape expected by TalariaV16 dashboard math. */
export function mapJournalRowToV16Trade(
  row: Record<string, unknown>,
  session: ApiSession,
  index: number
): Record<string, unknown> {
  const isOpen = tradeRowStatus(row) === "open";
  const resolvedPnl = tradeRowPnl(row);
  const pnl = isOpen ? 0 : resolvedPnl ?? 0;
  const side = sideLabel(tradeRowSide(row));
  const symbol = tradeRowSymbol(row) || session.symbol || "—";
  const ts = tradeRowTimestamp(row);
  const date = isoDay(ts) || String(row.date || row.time || "").slice(0, 10);
  const resolvedR = tradeRowRealizedR(row);
  const r = isOpen ? 0 : resolvedR ?? 0;
  const plannedRR = Number(
    row.plannedRR ?? row.planned_rr ?? row.rewardToRiskRatio ?? row.tp ?? NaN
  );
  const tag =
    String(row.tag || row.setup || row.strategy || "").trim() ||
    sessionConfigStrategyName(session) ||
    "Trade";
  const mae = Number(row.mae_r ?? row.mae ?? row.MAE ?? 0);
  const mfe = Number(row.mfe_r ?? row.mfe ?? row.MFE ?? 0);
  const markets = sessionAssetClasses(session);
  const { globalId, sessionLocalId, chartTradeId } = resolveGlobalTradeId(row, session.id, index);
  const preTags =
    tagListFromRow(row, "preTags") ||
    tagListFromRow(row, "pre_tags") ||
    tagListFromRow(row, "strategyTags") ||
    [tag];
  const postTags =
    tagListFromRow(row, "postTags") ||
    tagListFromRow(row, "post_tags") ||
    [pnl >= 0 ? "Win" : "Loss"];
  return {
    ...row,
    id: globalId,
    trade_id: globalId,
    tradeId: globalId,
    journal_trade_id: row.journal_trade_id ?? null,
    client_trade_id: sessionLocalId,
    chart_trade_id: chartTradeId,
    n: Number(row.n) || index + 1,
    date: date || row.date,
    closeTime: ts
      ? new Date(ts).toISOString()
      : String(row.closeTime || row.time || row.close_time || ""),
    symbol,
    market: String(row.market || markets[0] || ""),
    side: row.side || side,
    direction: row.direction ?? row.side ?? side,
    session: row.session || "Session",
    tag: row.tag || tag,
    rMultiple: r,
    duration: tradeRowDurationMinutes(row) ?? parseDurationMinutes(row.duration ?? row.hold_minutes ?? row.durationMinutes) ?? 0,
    pnl,
    status: isOpen ? "Open" : row.status ?? "Closed",
    mae:
      row.mae ??
      row.mae_r ??
      (Number.isFinite(mae) && mae !== 0 ? mae : isOpen ? 0 : -Math.abs(r) * 0.5),
    mfe:
      row.mfe ??
      row.mfe_r ??
      (Number.isFinite(mfe) && mfe !== 0 ? mfe : isOpen ? 0 : Math.abs(r) * 0.8),
    plannedRR: Number.isFinite(plannedRR) ? plannedRR : null,
    planned_rr: Number.isFinite(plannedRR) ? plannedRR : null,
    actualRR: isOpen ? null : row.actualRR ?? (resolvedR != null ? Math.abs(resolvedR) : null),
    rulesFollowed: row.rulesFollowed ?? true,
    preTags,
    postTags,
    sourceKey: row.sourceKey || `session:${session.id}`,
    sourceFilterKey: row.sourceFilterKey || `session:${session.id}`,
    sourceSessionId: session.id,
    sourceSessionName: session.name,
    sourceLabel: session.name,
    sourceType: row.sourceType || "backtest",
  };
}

function parseStrategyRefId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  const raw = value != null ? String(value).trim() : "";
  if (!raw) return null;
  if (raw.startsWith("strategy:")) {
    const parsed = Number.parseInt(raw.split(":")[1] || "", 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  if (/^\d+$/.test(raw)) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function hasStrategyVariableItems(items: unknown[]): boolean {
  return strategyVariablesHaveItems(items);
}

function sessionStrategyIdFromConfig(cfg: Record<string, unknown> | undefined): number | null {
  if (!cfg || typeof cfg !== "object") return null;
  const hints = [
    cfg.strategy_id,
    cfg.strategyId,
    cfg.playbook_id,
    cfg.playbookId,
    cfg.playbook,
    cfg.strategy_name,
  ];
  for (const hint of hints) {
    const id = parseStrategyRefId(hint);
    if (id != null) return id;
  }
  return null;
}

function resolveMappedSessionStrategyName(
  sessionName: string,
  ...candidates: string[]
): string {
  const normalizedSessionName = sessionName.trim().toLowerCase();
  for (const raw of candidates) {
    const value = String(raw || "").trim();
    if (!value || value.startsWith("strategy:")) continue;
    if (normalizedSessionName && value.toLowerCase() === normalizedSessionName) continue;
    return value;
  }
  return "";
}

function sessionStrategyVariables(cfg: Record<string, unknown> | undefined): unknown[] {
  if (!cfg || typeof cfg !== "object") return [];
  const direct = cfg.strategy_variables ?? cfg.strategyVariables;
  if (Array.isArray(direct) && hasStrategyVariableItems(direct)) return direct;
  const def = cfg.strategy_definition ?? cfg.strategyDefinition;
  if (def && typeof def === "object") {
    const defRec = def as Record<string, unknown>;
    if (Array.isArray(defRec.variables) && hasStrategyVariableItems(defRec.variables)) {
      return defRec.variables;
    }
    const v9 = defRec.talaria_v9 ?? defRec.talaria_v9_panel;
    if (v9 && typeof v9 === "object") {
      const v9Vars = (v9 as Record<string, unknown>).variables;
      if (Array.isArray(v9Vars) && hasStrategyVariableItems(v9Vars)) return v9Vars;
    }
  }
  const panel = cfg.talaria_v9 ?? cfg.talaria_v9_panel;
  if (panel && typeof panel === "object") {
    const panelVars = (panel as Record<string, unknown>).variables;
    if (Array.isArray(panelVars) && hasStrategyVariableItems(panelVars)) return panelVars;
  }
  return [];
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
    strategyName: resolveMappedSessionStrategyName(
      String(sess.name || ""),
      cfgString(cfg, "playbook_display", "strategyName"),
      sessionConfigStrategyName(sess),
      cfgString(cfg, "strategy_name", "strategyName"),
    ),
    strategyDesc:
      cfgString(cfg, "description", "session_description", "sessionDescription", "strategy_desc") ||
      "",
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
    elapsedDays: (() => {
      const replayDash = sess.replay_dashboard;
      if (
        replayDash &&
        typeof replayDash.elapsed_days === "number" &&
        Number.isFinite(replayDash.elapsed_days)
      ) {
        return Math.max(0, Math.round(replayDash.elapsed_days));
      }
      return null;
    })(),
    rollbackAllowed:
      tradingMode === "prop"
        ? false
        : !!(cfg?.allowBackNavigation ?? cfg?.rollback_allowed),
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
    session_type: sess.session_type,
    config: cfg && typeof cfg === "object" ? { ...cfg } : {},
    strategyId: sessionStrategyIdFromConfig(cfg),
    strategy_variables: sessionStrategyVariables(cfg),
  };
}

/** Attach strategy pre/post variables from the live bank when session config lacks a snapshot. */
export function enrichV16SessionFromStrategyBank(
  session: Record<string, unknown>,
  strategyBank: Record<string, unknown>[]
): Record<string, unknown> {
  const cfg = (session.config as Record<string, unknown> | undefined) || {};
  const existing = sessionStrategyVariables(cfg);
  if (hasStrategyVariableItems(existing)) return session;

  const strategyId =
    sessionStrategyIdFromConfig(cfg) ??
    (typeof session.strategyId === "number" ? session.strategyId : null);
  const bankRow =
    strategyId != null
      ? strategyBank.find((row) => String(row.id) === String(strategyId))
      : null;
  const bankVars = bankRow
    ? (() => {
        const fromDef = extractStrategyVariablesFromDefinition(
          bankRow.strategy_definition as Record<string, unknown> | undefined
        );
        if (hasStrategyVariableItems(fromDef)) return fromDef;
        return Array.isArray(bankRow.variables) ? (bankRow.variables as unknown[]) : [];
      })()
    : [];
  if (!hasStrategyVariableItems(bankVars)) return session;

  return {
    ...session,
    strategyId: strategyId ?? session.strategyId,
    strategy_variables: bankVars,
    config: {
      ...cfg,
      ...(strategyId != null ? { strategy_id: strategyId } : {}),
      strategy_variables: bankVars,
    },
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
