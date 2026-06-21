/** Prop challenge rules for live journal accounts (mirrors backtest prop_rules shape). */

export type LiveJournalPropRules = {
  numPhases: 1 | 2;
  challengeType: string;
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
  profitTargetPct: number | null;
  dailyLossLimitPct: number | null;
  maxDDLimitPct: number | null;
  minDays: number | null;
};

const num = (raw: unknown): number | null => {
  const n = Number(String(raw ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
};

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
  return {
    numPhases: 1,
    challengeType: "Evaluation",
    limitMode: isFutures ? "amount" : "percent",
    p1Pct: { dl: dlPct, dd: ddPct, pt: ptPct },
    p2Pct: { dl: dlPct, dd: ddPct, pt: "5" },
    p1Amt: { dl: dlAmt, dd: ddAmt, pt: ptAmt },
    p2Amt: {
      dl: dlAmt,
      dd: ddAmt,
      pt: String(Math.round(cap * 0.05)),
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
  return {
    numPhases: Number(o.numPhases) === 2 ? 2 : 1,
    challengeType: String(o.challengeType || "Evaluation"),
    limitMode: o.limitMode === "amount" ? "amount" : "percent",
    p1Pct: pct(o.p1Pct, "5"),
    p2Pct: pct(o.p2Pct, "5"),
    p1Amt: pct(o.p1Amt, "1000"),
    p2Amt: pct(o.p2Amt, "1000"),
    minTradingDaysEnabled: o.minTradingDaysEnabled !== false,
    minTradingDays: String(o.minTradingDays ?? "4"),
    consistencyEnabled: Boolean(o.consistencyEnabled),
    consistencyPct: String(o.consistencyPct ?? "30"),
    trailingDrawdown: o.trailingDrawdown !== false,
    dailyLossEnabled: o.dailyLossEnabled !== false,
    weekendHold: Boolean(o.weekendHold),
  };
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
  const phase = rules.p1Pct;
  const phaseAmt = rules.p1Amt;

  const asPct = (value: string | undefined, fallback: number | null = null): number | null => {
    const n = num(value);
    if (n == null) return fallback;
    if (isAmount) return cap ? (n / cap) * 100 : fallback;
    return n < 100 ? n : cap ? (n / cap) * 100 : fallback;
  };

  const profitTargetPct = asPct(isAmount ? phaseAmt.pt : phase.pt);
  const dailyLossLimitPct = rules.dailyLossEnabled
    ? asPct(isAmount ? phaseAmt.dl : phase.dl)
    : null;
  const maxDDLimitPct = asPct(isAmount ? phaseAmt.dd : phase.dd);
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
    profitTargetPct,
    dailyLossLimitPct,
    maxDDLimitPct,
    minDays: minDays != null ? Math.max(0, Math.round(minDays)) : null,
  };
}

export function liveJournalPropRulesToApiBody(rules: LiveJournalPropRules): Record<string, unknown> {
  return { ...rules };
}
