import type {
  V16AppliedSource,
  V16JournalBoot,
  V16StrategyGroup,
} from "./v16SourceTypes";

export type V16LiveBoot = {
  sessions: Record<string, unknown>[];
  tradesBySessionId: Record<string, Record<string, unknown>[]>;
  openSessionId: string | number | null;
  journal: V16JournalBoot;
  strategies: V16StrategyGroup[];
  /** Full strategy lab rows (includes `variables` for Add Trade tag defs). */
  strategyBank?: Record<string, unknown>[];
  /** Published community / official strategy templates. */
  communityStrategies?: Record<string, unknown>[];
  appliedSource: V16AppliedSource | null;
};

declare global {
  interface Window {
    __TALARIA_V16_LIVE__?: boolean;
    __TALARIA_V16_EMBEDDED__?: boolean;
    __TALARIA_V16_BOOT__?: V16LiveBoot;
    __TALARIA_V16_TRADES__?: Record<string, Record<string, unknown>[]>;
    /** Lazy-load journal trades when user switches dashboard source (embedded live only). */
    __TALARIA_V16_FETCH_TRADES_FOR_SESSION__?: (
      sessionId: string | number
    ) => Promise<Record<string, unknown>[]>;
    /** Persist manual dashboard trade to session journal SQL (embedded live only). */
    __TALARIA_V16_SAVE_MANUAL_TRADE__?: (
      sessionId: string | number,
      trade: Record<string, unknown>
    ) => Promise<Record<string, unknown>>;
    /** Persist manual dashboard trade to live journal profile (embedded live only). */
    __TALARIA_V16_SAVE_MANUAL_JOURNAL_TRADE__?: (
      source: {
        key?: string;
        kind?: string;
        label?: string;
        liveAccountId?: number;
        profileId?: number;
      },
      trade: Record<string, unknown>
    ) => Promise<Record<string, unknown>>;
    /** Update ?sessionId= when user applies a backtest source in the library. */
    __TALARIA_V16_SYNC_SESSION_URL__?: (sessionId: string | number) => void;
    /** Clear ?sessionId= when user switches to a live journal source. */
    __TALARIA_V16_CLEAR_SESSION_URL__?: () => void;
    /** Update ?view= when user switches Dashboard / Trades / Backtest / Strategies in V16 nav. */
    __TALARIA_V16_SYNC_VIEW_URL__?: (view: string) => void;
    /** Open dashboard BacktestNewSessionModal from embedded V16 chrome. */
    __TALARIA_OPEN_NEW_SESSION__?: (opts?: {
      strategyId?: number;
      strategyName?: string;
      tradingMode?: "standard" | "prop";
    }) => void;
    /** Open dashboard live journal creator from embedded V16 Source modal. */
    __TALARIA_OPEN_NEW_LIVE_JOURNAL__?: (opts?: {
      accountTypeKey?: "personal" | "prop";
      lockAccountType?: boolean;
      goToTradesAfterCreate?: boolean;
      goToCsvImportAfterCreate?: boolean;
      editAccount?: import("./v16SourceTypes").ApiLiveJournalAccount | null;
    }) => void;
    /** Edit a persisted live journal account. */
    __TALARIA_EDIT_LIVE_JOURNAL__?: (opts?: {
      accountId?: number;
      account?: import("./v16SourceTypes").ApiLiveJournalAccount | null;
    }) => void;
    /** Archive/delete a persisted live journal account. */
    __TALARIA_DELETE_LIVE_JOURNAL__?: (accountId: number) => Promise<boolean>;
    /** Activate a persisted live journal profile before import/manual add. */
    __TALARIA_ACTIVATE_LIVE_JOURNAL__?: (accountId: number) => void | Promise<void>;
    /** Open dashboard session editor for an existing backtest (embedded V16). */
    __TALARIA_OPEN_EDIT_SESSION__?: (sess: Record<string, unknown>) => void;
    /** True while embedded bootstrap is fetching sessions/trades (show loading UI). */
    __TALARIA_V16_BOOT_LOADING__?: boolean;
    /** Reload journal strategies and refresh boot.strategyBank (Add Trade tags). */
    __TALARIA_V16_REFRESH_STRATEGY_BANK__?: () => Promise<Record<string, unknown>[]>;
    /** Persist Strategy Builder row to journal-backend. */
    __TALARIA_V16_SAVE_STRATEGY__?: (
      strat: Record<string, unknown>,
      existingId?: number | null
    ) => Promise<Record<string, unknown>>;
    /** Delete a persisted strategy from journal-backend. */
    __TALARIA_V16_DELETE_STRATEGY__?: (strategyId: number) => Promise<void>;
    /** Reload published community strategies. */
    __TALARIA_V16_REFRESH_COMMUNITY__?: () => Promise<Record<string, unknown>[]>;
    /** Copy a community template into My Strategies. */
    __TALARIA_V16_CLONE_COMMUNITY_TEMPLATE__?: (
      templateId: number,
      name?: string
    ) => Promise<Record<string, unknown>>;
    /** Publish a saved strategy to the community feed. */
    __TALARIA_V16_SUBMIT_COMMUNITY_STRATEGY__?: (
      strategyId: number,
      options?: Record<string, unknown>
    ) => Promise<number>;
    /** Navigate to Strategy Lab and open the new-strategy builder. */
    __TALARIA_OPEN_STRATEGY_BUILDER__?: () => void;
    /** Open dashboard profile/settings from embedded V16 chrome. */
    __TALARIA_V16_OPEN_PROFILE__?: (tab?: string) => void;
    /** Toggle chart-style support ticket dropdown (V16 shell or chart). */
    __TALARIA_TOGGLE_SUPPORT__?: () => void;
    /** Chart-mounted support toggle (same UI as top-bar chat button). */
    __TALARIA_CHART_TOGGLE_SUPPORT__?: () => void;
    /** Left nav Support button anchor for popover positioning. */
    __TALARIA_SUPPORT_NAV_ANCHOR__?: HTMLElement;
  }
}

export {};
