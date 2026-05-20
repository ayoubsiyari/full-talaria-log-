import { definitionFromDraft, draftFromApi } from "@/app/dashboard/strategies/lib/defaults";

/** Stored inside `strategy_definition` JSON; backend merges unknown keys. */
export const TALARIA_V9_PANEL_KEY = "talaria_v9";

/** Align with journal-backend — max ~2 MB per image as base64 data URL. */
const MAX_IMAGE_DATA_LEN = 2_800_000;

export type StrategyImageEntry = { src: string; name?: string };

/** Resolve builder/review image entry (string data URL or `{ src, name }`) for `<img src>`. */
export function strategyImageUrl(item: unknown): string {
  if (!item) return "";
  if (typeof item === "string") return item;
  if (typeof item === "object" && item !== null && "src" in item) {
    const src = (item as { src?: unknown }).src;
    return typeof src === "string" ? src : "";
  }
  return "";
}

function sanitizeImageEntry(entry: unknown): StrategyImageEntry | null {
  const src = strategyImageUrl(entry).trim();
  if (!src.startsWith("data:image/") || src.length > MAX_IMAGE_DATA_LEN) return null;
  const name =
    typeof entry === "object" && entry !== null && "name" in entry
      ? String((entry as { name?: unknown }).name || "").trim()
      : "";
  return name ? { src, name } : { src };
}

function sanitizeImageList(images: unknown, maxItems: number): StrategyImageEntry[] {
  if (!Array.isArray(images)) return [];
  return images.map(sanitizeImageEntry).filter((x): x is StrategyImageEntry => x !== null).slice(0, maxItems);
}

/** Gallery images for bank UI — prefer `talaria_v9.images`, else legacy `cover_image`. */
function bankGalleryImages(v9Images: unknown, coverFallback: unknown): StrategyImageEntry[] {
  const fromV9 = sanitizeImageList(v9Images, 6);
  if (fromV9.length) return fromV9;
  const cover = sanitizeImageEntry(coverFallback);
  return cover ? [cover] : [];
}

function sanitizeCanvasNodesForApi(nodes: unknown): unknown[] {
  if (!Array.isArray(nodes)) return [];
  return nodes.map((node) => {
    if (!node || typeof node !== "object") return node;
    const n = node as Record<string, unknown>;
    const data = n.data;
    if (!data || typeof data !== "object") return node;
    const d = { ...(data as Record<string, unknown>) };
    if (Array.isArray(d.images)) {
      d.images = sanitizeImageList(d.images, 6);
    }
    return { ...n, data: d };
  });
}

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
    images: bankGalleryImages(v9.images, def.cover_image),
    supportInst: Array.isArray(v9.supportInst) ? v9.supportInst : [],
    tree: v9.tree,
    canvasNodes: Array.isArray(v9.canvasNodes) ? sanitizeCanvasNodesForApi(v9.canvasNodes) : [],
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
  const galleryImages = sanitizeImageList(strat.images, 6);
  const coverFromGallery = galleryImages[0]?.src || "";

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
    cover_image: coverFromGallery,
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
    images: galleryImages.length ? galleryImages : undefined,
    supportInst: strat.supportInst,
    canvasNodes: sanitizeCanvasNodesForApi(strat.canvasNodes),
    canvasEdges: Array.isArray(strat.canvasEdges) ? strat.canvasEdges : [],
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

export type CommunityPublishOptions = {
  include_description: boolean;
  include_conditions: boolean;
  include_variables: boolean;
  include_strategy_details: boolean;
  include_preview_image: boolean;
  include_backtest_stats: boolean;
  allow_clone: boolean;
};

export type BacktestSnapshotPublic = {
  session_id?: number | null;
  session_name?: string;
  win_rate?: number | null;
  pnl?: number | null;
  trades?: number | null;
  progress?: number | null;
  rollback_allowed?: boolean;
  start_date?: string;
  end_date?: string;
};

export const DEFAULT_COMMUNITY_PUBLISH_OPTIONS: CommunityPublishOptions = {
  include_description: true,
  include_conditions: true,
  include_variables: true,
  include_strategy_details: true,
  include_preview_image: true,
  include_backtest_stats: true,
  allow_clone: true,
};

/** Hero image for community feed cards — API field or first image still in definition. */
export function communityPreviewImageUrl(
  previewImage: unknown,
  definition?: Record<string, unknown> | null,
): string {
  const fromApi = strategyImageUrl(previewImage);
  if (fromApi) return fromApi;
  if (!definition || typeof definition !== "object") return "";
  const v9raw = definition[TALARIA_V9_PANEL_KEY];
  const v9 = v9raw && typeof v9raw === "object" ? (v9raw as Record<string, unknown>) : {};
  const gallery = bankGalleryImages(v9.images, definition.cover_image);
  return gallery[0] ? strategyImageUrl(gallery[0]) : "";
}

export function buildBacktestSnapshotFromSession(
  sess: Record<string, unknown> | null | undefined,
): BacktestSnapshotPublic | null {
  if (!sess || typeof sess.id !== "number") return null;
  return {
    session_id: sess.id as number,
    session_name: String(sess.name || ""),
    win_rate: sess.winRate != null ? Number(sess.winRate) : null,
    pnl: sess.pnl != null ? Number(sess.pnl) : null,
    trades: sess.trades != null ? Number(sess.trades) : null,
    progress: sess.progress != null ? Number(sess.progress) : null,
    rollback_allowed: !!sess.rollbackAllowed,
    start_date: String(sess.startDate || ""),
    end_date: String(sess.endDate || ""),
  };
}

export function pickBestBacktestSession(
  sessions: Record<string, unknown>[] | undefined,
): Record<string, unknown> | null {
  const list = Array.isArray(sessions) ? sessions : [];
  const withTrades = list.filter((s) => Number(s.trades) > 0);
  const pool = withTrades.length ? withTrades : list;
  if (!pool.length) return null;
  return [...pool].sort(
    (a, b) =>
      new Date(String(b.createdAt || b.endDate || 0)).getTime() -
      new Date(String(a.createdAt || a.endDate || 0)).getTime(),
  )[0];
}

export type ApiTemplateRecord = {
  id: number;
  title: string;
  definition?: Record<string, unknown> | null;
  template_type?: string;
  category?: string | null;
  difficulty?: string | null;
  clone_count?: number;
  likes_count?: number;
  copies_count?: number;
  liked_by_me?: boolean;
  copied_by_me?: boolean;
  is_author?: boolean;
  can_copy?: boolean;
  created_at?: string | null;
  status?: string;
  creator?: { name?: string; public_id?: string | null } | null;
  publish_settings?: Partial<CommunityPublishOptions> | null;
  allow_clone?: boolean;
  backtest_snapshot?: BacktestSnapshotPublic | null;
  preview_image?: StrategyImageEntry | { src: string; name?: string } | null;
};

/** Map published community template → Strategy Bank community row. */
export function templateToCommunityRow(t: ApiTemplateRecord): Record<string, unknown> {
  const def = (t.definition && typeof t.definition === "object" ? t.definition : {}) as Record<string, unknown>;
  const v9raw = def[TALARIA_V9_PANEL_KEY];
  const v9 = v9raw && typeof v9raw === "object" ? (v9raw as Record<string, unknown>) : {};
  const tags = Array.isArray(v9.tags)
    ? (v9.tags as string[])
    : Array.isArray(def.strategy_tags)
      ? (def.strategy_tags as string[])
      : [];
  const instruments = Array.isArray(v9.instruments) ? (v9.instruments as string[]) : [];
  const timeframes = Array.isArray(v9.timeframes)
    ? (v9.timeframes as string[])
    : def.timeframe
      ? [String(def.timeframe)]
      : [];
  const creator = t.creator || {};
  const settings = { ...DEFAULT_COMMUNITY_PUBLISH_OPTIONS, ...(t.publish_settings || {}) };
  const snap = t.backtest_snapshot || null;
  const showDesc = settings.include_description;
  const showDetails = settings.include_strategy_details;
  const backtestSessions =
    settings.include_backtest_stats && snap
      ? [
          {
            id: snap.session_id,
            name: snap.session_name || "Backtest",
            winRate: snap.win_rate,
            pnl: snap.pnl,
            trades: snap.trades,
            progress: snap.progress ?? (snap.trades ? 100 : 0),
            rollbackAllowed: !!snap.rollback_allowed,
            startDate: snap.start_date,
            endDate: snap.end_date,
          },
        ]
      : [];
  return {
    id: `tpl_${t.id}`,
    templateId: t.id,
    name: t.title,
    desc: showDesc
      ? (typeof v9.desc === "string" && v9.desc) || String(def.description || "")
      : "",
    icon: typeof v9.icon === "string" ? v9.icon : "◎",
    author: creator.name || "Community",
    authorPublicId: creator.public_id || "",
    authorBadge: "",
    style: showDetails ? String(def.style || "Trend Following") : "—",
    instruments: showDetails ? instruments : [],
    timeframes: showDetails ? timeframes : [],
    tags: showDetails ? tags : [],
    complexity: showDetails && typeof v9.complexity === "string" ? v9.complexity : "Medium",
    saves: t.clone_count ?? 0,
    likeCount: t.likes_count ?? 0,
    copyCount: t.copies_count ?? t.clone_count ?? 0,
    likedByMe: !!t.liked_by_me,
    copiedByMe: !!t.copied_by_me,
    postedAt: t.created_at || null,
    isAuthor: !!t.is_author,
    canCopy: t.can_copy !== false && t.allow_clone !== false && !t.copied_by_me,
    isMine: false,
    templatePreview: true,
    template: t,
    publishSettings: settings,
    allowClone: t.allow_clone !== false && settings.allow_clone !== false,
    backtestSnapshot: snap,
    backtestSessions,
    rollbackAllowed: !!snap?.rollback_allowed,
    showRollbackBadge: !!(settings.include_backtest_stats && snap),
    previewImage: settings.include_preview_image !== false
      ? communityPreviewImageUrl(t.preview_image, def)
      : "",
  };
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
