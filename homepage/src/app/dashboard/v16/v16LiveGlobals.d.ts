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
    /** Update ?sessionId= when user applies a backtest source in the library. */
    __TALARIA_V16_SYNC_SESSION_URL__?: (sessionId: string | number) => void;
    /** Open dashboard BacktestNewSessionModal from embedded V16 chrome. */
    __TALARIA_OPEN_NEW_SESSION__?: (opts?: {
      strategyId?: number;
      strategyName?: string;
    }) => void;
    /** Open dashboard session editor for an existing backtest (embedded V16). */
    __TALARIA_OPEN_EDIT_SESSION__?: (sess: Record<string, unknown>) => void;
    /** True while embedded bootstrap is fetching sessions/trades (show loading UI). */
    __TALARIA_V16_BOOT_LOADING__?: boolean;
  }
}

export {};
