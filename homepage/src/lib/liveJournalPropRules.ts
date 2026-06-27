/** Prop challenge rules for live journal accounts (mirrors backtest prop_rules shape). */

export type LiveJournalPropStepFormat = "1-step" | "2-step" | "instant";

export type LiveJournalPropRules = {
  numPhases: 1 | 2;
  challengeType: string;
  /** Which step's limits the dashboard checker applies (for 2-step challenges). */
  currentPhase: 1 | 2;
  /** percent = Forex-style %; amount = Futures-style fixed $ */
  limitMode: "percent" | "amount";
  p1Pct: { dl: string; dd: string; pt: string };
  p2Pct: { dl: string; dd: string; pt: string };
  p1Amt: { dl: string; dd: string; pt: string };
  p2Amt: { dl: string; dd: string; pt: string };
  minTradingDaysEnabled: boolean;
  minTradingDays: string;
  consistencyEnabled: boolean;
  consistencyPct: string;
  trailingDrawdown: boolean;
  dailyLossEnabled: boolean;
  weekendHold: boolean;
};

export type LiveJournalPropConfig = {
  configured: boolean;
  profitTargetPct: number | null;
  dailyLossLimitPct: number | null;
  maxDDLimitPct: number | null;
  minDays: number | null;
  numPhases: 1 | 2;
  challengeType: string;
  currentPhase: 1 | 2;
  stepFormat: LiveJournalPropStepFormat;
  dailyLossEnabled?: boolean;
  drawdownType?: "static" | "trailing";
};

const num = (raw: unknown): number | null => {
  const n = Number(String(raw ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function liveJournalPropStepFormat(rules: LiveJournalPropRules | null | undefined): LiveJournalPropStepFormat {
  if (!rules) return "1-step";
  if (String(rules.challengeType || "").toLowerCase() === "instant") return "instant";
  return rules.numPhases === 2 ? "2-step" : "1-step";
}

export function applyLiveJournalPropStepFormat(
  rules: LiveJournalPropRules,
  format: LiveJournalPropStepFormat
): LiveJournalPropRules {
  if (format === "instant") {
    return {
      ...rules,
      numPhases: 1,
      challengeType: "Instant",
      currentPhase: 1,
      minTradingDaysEnabled: false,
    };
  }
  if (format === "2-step") {
    return {
      ...rules,
      numPhases: 2,
      challengeType: "Evaluation",
      currentPhase: rules.currentPhase === 2 ? 2 : 1,
    };
  }
  return {
    ...rules,
    numPhases: 1,
    challengeType: "Evaluation",
    currentPhase: 1,
  };
}

const futuresBalancePresets: Record<string, { dl: string; dd: string; pt: string }> = {
  "25000": { dl: "500", dd: "1000", pt: "1500" },
  "50000": { dl: "1000", dd: "2000", pt: "3000" },
  "100000": { dl: "1500", dd: "3000", pt: "6000" },
  "150000": { dl: "2250", dd: "4500", pt: "9000" },
};

export function futuresPresetForBalance(balance: number): { dl: string; dd: string; pt: string } | null {
  const key = String(Math.round(balance));
  return futuresBalancePresets[key] || null;
}

export function defaultLiveJournalPropRules(
  market = "Forex",
  balance = 50000,
  firm = "FTMO"
): LiveJournalPropRules {
  const isFutures = String(market).toLowerCase() === "futures";
  const cap = Math.max(1000, balance);
  const dlPct = firm === "Topstep" && isFutures ? "2.5" : "5";
  const ddPct = isFutures ? "6" : "10";
  const ptPct = "10";
  const dlAmt = String(Math.round(cap * (Number(dlPct) / 100)));
  const ddAmt = String(Math.round(cap * (Number(ddPct) / 100)));
  const ptAmt = String(Math.round(cap * (Number(ptPct) / 100)));
  const futPreset = isFutures ? futuresPresetForBalance(cap) : null;
  const p1Amt = futPreset || { dl: dlAmt, dd: ddAmt, pt: ptAmt };
  const p2PtAmt = String(Math.round(cap * 0.05));
  return {
    numPhases: 1,
    challengeType: "Evaluation",
    currentPhase: 1,
    limitMode: isFutures ? "amount" : "percent",
    p1Pct: { dl: dlPct, dd: ddPct, pt: ptPct },
    p2Pct: { dl: dlPct, dd: ddPct, pt: "5" },
    p1Amt,
    p2Amt: {
      dl: p1Amt.dl,
      dd: p1Amt.dd,
      pt: p2PtAmt,
    },
    minTradingDaysEnabled: true,
    minTradingDays: isFutures ? "2" : "4",
    consistencyEnabled: false,
    consistencyPct: "30",
    trailingDrawdown: !isFutures,
    dailyLossEnabled: true,
    weekendHold: false,
  };
}

export function parseLiveJournalPropRules(raw: unknown): LiveJournalPropRules | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const pct = (v: unknown, fallback: string) => {
    const block = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
    return {
      dl: String(block.dl ?? fallback),
      dd: String(block.dd ?? fallback),
      pt: String(block.pt ?? fallback),
    };
  };
  const challengeType = String(o.challengeType || "Evaluation");
  const isInstant = challengeType.toLowerCase() === "instant";
  const numPhases = isInstant ? 1 : Number(o.numPhases) === 2 ? 2 : 1;
  const currentPhase = Number(o.currentPhase) === 2 && numPhases === 2 ? 2 : 1;
  return {
    numPhases: numPhases as 1 | 2,
    challengeType,
    currentPhase: currentPhase as 1 | 2,
    limitMode: o.limitMode === "amount" ? "amount" : "percent",
    p1Pct: pct(o.p1Pct, "5"),
    p2Pct: pct(o.p2Pct, "5"),
    p1Amt: pct(o.p1Amt, "1000"),
    p2Amt: pct(o.p2Amt, "1000"),
    minTradingDaysEnabled: isInstant ? false : o.minTradingDaysEnabled !== false,
    minTradingDays: String(o.minTradingDays ?? "4"),
    consistencyEnabled: Boolean(o.consistencyEnabled),
    consistencyPct: String(o.consistencyPct ?? "30"),
    trailingDrawdown: o.trailingDrawdown !== false,
    dailyLossEnabled: o.dailyLossEnabled !== false,
    weekendHold: Boolean(o.weekendHold),
  };
}

function phaseSlice(rules: LiveJournalPropRules, phase: 1 | 2, isAmount: boolean) {
  if (phase === 2) return isAmount ? rules.p2Amt : rules.p2Pct;
  return isAmount ? rules.p1Amt : rules.p1Pct;
}

/** Flatten stored rules into dashboard propConfig (% fields for btDashPropConfig). */
export function flattenLiveJournalPropConfig(
  rules: LiveJournalPropRules | null | undefined,
  capital: number,
  market?: string
): LiveJournalPropConfig | null {
  if (!rules) return null;
  const cap = Math.max(1000, Number(capital) || 10000);
  const isAmount =
    rules.limitMode === "amount" || String(market || "").toLowerCase() === "futures";
  const activePhase =
    rules.numPhases === 2 && rules.currentPhase === 2 ? 2 : 1;
  const phase = phaseSlice(rules, activePhase, isAmount);

  const asPct = (value: string | undefined, fallback: number | null = null): number | null => {
    const n = num(value);
    if (n == null) return fallback;
    if (isAmount) return cap ? (n / cap) * 100 : fallback;
    return n < 100 ? n : cap ? (n / cap) * 100 : fallback;
  };

  const profitTargetPct = asPct(phase.pt);
  const dailyLossLimitPct = rules.dailyLossEnabled ? asPct(phase.dl) : null;
  const maxDDLimitPct = asPct(phase.dd);
  const minDays = rules.minTradingDaysEnabled ? num(rules.minTradingDays) : null;

  if (
    profitTargetPct == null &&
    dailyLossLimitPct == null &&
    maxDDLimitPct == null &&
    minDays == null
  ) {
    return null;
  }

  return {
    configured: true,
    profitTargetPct,
    dailyLossLimitPct,
    maxDDLimitPct,
    minDays: minDays != null ? Math.max(0, Math.round(minDays)) : null,
    numPhases: rules.numPhases,
    challengeType: rules.challengeType,
    currentPhase: activePhase,
    stepFormat: liveJournalPropStepFormat(rules),
    dailyLossEnabled: rules.dailyLossEnabled,
    drawdownType: rules.trailingDrawdown ? "trailing" : "static",
  };
}

export function liveJournalPropRulesToApiBody(rules: LiveJournalPropRules): Record<string, unknown> {
  return { ...rules };
}
