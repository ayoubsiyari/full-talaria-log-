import { definitionFromDraft, draftFromApi } from "@/strategyLab/defaults";

/** Stored inside `strategy_definition` JSON; backend merges unknown keys. */
export const TALARIA_V9_PANEL_KEY = "talaria_v9";

export type ApiStrategyRecord = {
  id: number;
  name: string;
  description?: string | null;
  strategy_definition?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type KpisLite = {
  trades?: number;
  win_rate?: number | null;
  net_pnl?: number | null;
};

type ApiSessionRecord = {
  id: number;
  name: string;
  symbol?: string;
  session_type?: string;
  start_balance?: number;
  start_date?: string;
  end_date?: string;
  created_at?: string;
  config?: Record<string, unknown> | null;
  replay_dashboard?: { progress_pct?: number } | null;
};

/** Map journal strategy → Strategy Bank “my strategy” card + builder payload. */
export function apiStrategyToBankRow(s: ApiStrategyRecord): Record<string, unknown> {
  const def = (s.strategy_definition && typeof s.strategy_definition === "object"
    ? s.strategy_definition
    : {}) as Record<string, unknown>;
  const draft = draftFromApi({
    name: s.name,
    description: s.description || "",
    strategy_definition: def,
  }) as Record<string, unknown>;
  const v9raw = def[TALARIA_V9_PANEL_KEY];
  const v9 = v9raw && typeof v9raw === "object" ? (v9raw as Record<string, unknown>) : {};

  const tagList = Array.isArray(v9.tags)
    ? (v9.tags as string[])
    : Array.isArray(def.strategy_tags)
      ? (def.strategy_tags as string[])
      : [];
  const instruments = (v9.instruments as string[])?.length
    ? (v9.instruments as string[])
    : ((draft.instruments as string[]) || []);
  const timeframes = (v9.timeframes as string[])?.length
    ? (v9.timeframes as string[])
    : draft.timeframe
      ? [String(draft.timeframe)]
      : [];
  const markets = (v9.markets as string[])?.length
    ? (v9.markets as string[])
    : ((draft.market_categories as string[]) || []);

  return {
    id: s.id,
    name: s.name,
    desc: (typeof v9.desc === "string" && v9.desc) || String(draft.description || ""),
    icon: typeof v9.icon === "string" ? v9.icon : "",
    style: String(draft.style || "Trend Following"),
    instruments,
    timeframes,
    tags: tagList,
    complexity: typeof v9.complexity === "string" ? v9.complexity : "Medium",
    direction: String(draft.direction || "both"),
    markets,
    conditions: Array.isArray(v9.conditions) ? v9.conditions : (draft.conditions as unknown[]) || [],
    variables: Array.isArray(v9.variables) ? v9.variables : (draft.variables as unknown[]) || [{ type: "divider", id: "div0" }],
    images: Array.isArray(v9.images) ? v9.images : [],
    supportInst: Array.isArray(v9.supportInst) ? v9.supportInst : [],
    tree: v9.tree,
    canvasNodes: Array.isArray(v9.canvasNodes) ? v9.canvasNodes : [],
    canvasEdges: Array.isArray(v9.canvasEdges) ? v9.canvasEdges : [],
    createdAt: s.created_at || s.updated_at || new Date().toISOString(),
  };
}

/** Builder snapshot → POST/PUT body for `/journal/api/strategies`. */
export function bankStrategyToApiBody(strat: Record<string, unknown>): {
  name: string;
  description: string;
  strategy_definition: Record<string, unknown>;
} {
  const name = String(strat.name || "Untitled Strategy").trim() || "Untitled Strategy";
  const desc = String(strat.desc || "").trim();
  const core = definitionFromDraft({
    name,
    description: desc,
    instruments: strat.instruments,
    market_categories: strat.markets || [],
    style: strat.style,
    direction: strat.direction,
    timeframe: Array.isArray(strat.timeframes) && strat.timeframes.length ? strat.timeframes[0] : "",
    conditions: strat.conditions,
    variables: strat.variables,
    cover_image: "",
  }) as Record<string, unknown>;

  const talaria_v9 = {
    icon: strat.icon,
    tags: strat.tags,
    complexity: strat.complexity,
    desc,
    tree: strat.tree,
    instruments: strat.instruments,
    timeframes: strat.timeframes,
    markets: strat.markets,
    conditions: strat.conditions,
    variables: strat.variables,
    images: strat.images,
    supportInst: strat.supportInst,
    canvasNodes: strat.canvasNodes,
    canvasEdges: strat.canvasEdges,
  };

  return {
    name,
    description: desc,
    strategy_definition: {
      ...core,
      strategy_tags: Array.isArray(strat.tags) ? strat.tags : [],
      [TALARIA_V9_PANEL_KEY]: talaria_v9,
    },
  };
}

function firstTf(cfg: Record<string, unknown>): string {
  return String(cfg.timeframe || cfg.tf || "");
}

/** Map `/api/sessions` row (+ optional KPIs) → Strategy Bank “review session” row. */
export function mapApiSessionToReviewRow(sess: ApiSessionRecord, kpis?: KpisLite | null): Record<string, unknown> {
  const cfg = (sess.config && typeof sess.config === "object" ? sess.config : {}) as Record<string, unknown>;
  const tickers = Array.isArray(cfg.tickers)
    ? (cfg.tickers as string[])
    : sess.symbol
      ? [String(sess.symbol)]
      : [];
  const strategyName = String(cfg.strategy_name || cfg.playbook_display || sess.name || "General");
  const strategyDesc = String(cfg.description || "");
  const startDate = String(cfg.startDate || sess.start_date || "").split("T")[0] || "";
  const endDate = String(cfg.endDate || sess.end_date || "").split("T")[0] || "";
  const capital = Number(cfg.capital ?? cfg.startBalance ?? sess.start_balance ?? 0) || 0;
  const createdAt = String(sess.created_at || new Date().toISOString());
  const trades = kpis?.trades ?? 0;
  const pnl = kpis?.net_pnl != null ? Number(kpis.net_pnl) : null;
  const winRate = kpis?.win_rate != null ? Math.round(Number(kpis.win_rate)) : null;
  const progressRaw = sess.replay_dashboard?.progress_pct;
  const progress =
    typeof progressRaw === "number" && Number.isFinite(progressRaw)
      ? Math.max(0, Math.min(100, Math.round(progressRaw)))
      : trades > 0
        ? 100
        : 0;
  const tradingMode = String(cfg.trading_mode || "") === "prop" || sess.session_type === "propfirm" ? "prop" : "standard";

  return {
    id: sess.id,
    name: sess.name,
    strategyName,
    strategyDesc,
    tickers,
    timeframe: firstTf(cfg),
    startDate,
    endDate,
    capital,
    createdAt,
    trades,
    pnl,
    winRate,
    avgRR: null,
    tradingMode,
    progress,
    rollbackAllowed: !!cfg.rollback_allowed,
    assetClasses: Array.isArray(cfg.marketType) ? cfg.marketType : [],
    leverage: String(cfg.leverage || ""),
    riskVal: String(cfg.defaultRisk ?? ""),
    riskMode: String(cfg.defaultRiskType || "pct"),
    commission: String(cfg.commission || "Per Lot"),
    replayMode: String(cfg.replayMode || "Candle"),
    replaySpeed: Number(cfg.replaySpeed) || 30,
  };
}
