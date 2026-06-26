/** Domain shapes passed to TalariaV16 via __TALARIA_V16_BOOT__ (live embed only). */

export type V16AccountTypeKey = "personal" | "prop";

export type V16JournalAccountInfo = {
  key: string;
  accountNumber: string;
  connection: string;
  connectionId: string;
  accountIndex: number;
  type: string;
  accountTypeKey: V16AccountTypeKey;
  market: string;
};

export type V16JournalAccountRow = {
  id: string;
  name: string;
  accountNumber: string;
  connection: string;
  connectionId: string;
  accountIndex: number;
  type: string;
  accountTypeKey: V16AccountTypeKey;
  accountTypeLabel: string;
  market: string;
  trades: number;
  pnl: number;
  pnlPct: number | null;
  pnlPctTotal: number;
  hasEditedTrades: boolean;
  createdAt: string;
  created: string;
  lastSync: string;
  color?: string;
  totalTrades: number;
  primarySession: Record<string, unknown> | null;
  sessions: Record<string, unknown>[];
  strategyIds: number[];
  strategyNames: string[];
  profileId?: number;
  liveAccountId?: number;
  isLiveJournalAccount?: boolean;
  startingBalance?: number | null;
  currency?: string;
  propFirm?: string | null;
  propRules?: Record<string, unknown> | null;
  propConfig?: {
    profitTargetPct: number | null;
    dailyLossLimitPct: number | null;
    maxDDLimitPct: number | null;
    minDays: number | null;
    numPhases?: 1 | 2;
    challengeType?: string;
    currentPhase?: 1 | 2;
    stepFormat?: "1-step" | "2-step" | "instant";
  } | null;
  notes?: string | null;
};

export type V16LibraryConnection = {
  id: string;
  label: string;
  color: string;
  count: number;
  entryCount: number;
  custom?: boolean;
  connection?: Record<string, unknown>;
  accountTypeKey?: V16AccountTypeKey;
  baseConnectionId?: string;
  match: (trade: Record<string, unknown>) => boolean;
};

export type V16StrategyGroup = {
  id: string;
  label: string;
  color: string;
  count: number;
  sessionCount: number;
  journalCount: number;
  strategyApiId?: number;
};

export type V16AppliedSource = {
  kind: "session" | "strategy" | "journalAccount" | "journalEntry" | "strategyJournal";
  id: string | number;
  sessionId?: string | number;
  label: string;
  rollbackAllowed?: boolean;
};

export type V16JournalBoot = {
  libraryTrades: Record<string, unknown>[];
  accounts: V16JournalAccountRow[];
  accountByKey: Record<string, V16JournalAccountInfo>;
  tradeToAccountKey: Record<string, string>;
  connections: V16LibraryConnection[];
  connectionOptions: string[];
  defaultAccount: V16JournalAccountInfo;
};

export type ApiJournalEntry = {
  id: number;
  profile_id?: number;
  symbol: string;
  direction: string;
  entry_price?: number;
  exit_price?: number;
  stop_loss?: number | null;
  take_profit?: number | null;
  high_price?: number | null;
  low_price?: number | null;
  open_time?: string | null;
  close_time?: string | null;
  quantity?: number;
  instrument_type?: string;
  risk_amount?: number;
  pnl: number;
  rr?: number;
  notes?: string;
  strategy?: string | null;
  strategy_id?: number | null;
  setup?: string | null;
  commission?: number | null;
  slippage?: number | null;
  date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  trade_status?: string | null;
  extra_data?: Record<string, unknown>;
};

export type ApiBrokerConnection = {
  id: number;
  broker: string;
  label: string;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
  last_trade_count: number;
  created_at: string;
};

export type ApiJournalProfile = {
  id: number;
  name: string;
  mode: "backtest" | "journal" | "journal_live" | string;
  is_active?: boolean;
};

export type ApiLiveJournalAccount = {
  id: number;
  profile_id: number;
  name: string;
  account_number: string;
  platform: string;
  market: string;
  account_type: V16AccountTypeKey;
  account_subtype: string;
  starting_balance?: number | null;
  currency?: string;
  prop_firm?: string | null;
  prop_rules?: Record<string, unknown> | null;
  notes?: string | null;
  status: string;
  trade_count?: number;
  created_at?: string | null;
  updated_at?: string | null;
};
