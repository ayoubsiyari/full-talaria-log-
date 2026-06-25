import { JOURNAL_API_BASE, syncJournalTokenFromSession } from "@/lib/journalApi";
import { fetchHeadersJson } from "@/app/dashboard/strategies/strategyLabV9Auth";
import {
  mergeLiveJournalTradeIntoBoot,
} from "./v16JournalMappers";
import type { ApiJournalEntry } from "./v16SourceTypes";

export type LiveJournalAddTradeSource = {
  key?: string;
  kind?: string;
  label?: string;
  liveAccountId?: number;
  profileId?: number;
  accountTypeKey?: "personal" | "prop" | string;
};

async function requireJournalAuthHeaders(): Promise<Record<string, string>> {
  const token = await syncJournalTokenFromSession();
  if (!token) {
    throw new Error("Could not authenticate with the journal API. Please refresh and try again.");
  }
  return fetchHeadersJson();
}

async function activateLiveJournalProfile(source: LiveJournalAddTradeSource): Promise<void> {
  const headers = await requireJournalAuthHeaders();

  if (source.liveAccountId != null) {
    const res = await fetch(`${JOURNAL_API_BASE}/journal/live-accounts/${source.liveAccountId}/activate`, {
      method: "POST",
      headers,
    });
    if (!res.ok) {
      let detail = `Could not activate journal account (HTTP ${res.status})`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) detail = body.error;
      } catch {
        /* ignore */
      }
      throw new Error(detail);
    }
    return;
  }

  if (source.profileId != null) {
    const res = await fetch(`${JOURNAL_API_BASE}/profile/profiles/${source.profileId}/activate`, {
      method: "POST",
      headers,
    });
    if (!res.ok) {
      let detail = `Could not activate journal profile (HTTP ${res.status})`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) detail = body.error;
      } catch {
        /* ignore */
      }
      throw new Error(detail);
    }
  }
}

function instrumentTypeFromMarket(market?: string): string {
  const m = String(market || "").toLowerCase();
  if (m.includes("forex")) return "forex";
  if (m.includes("future")) return "futures";
  if (m.includes("stock") || m.includes("equity")) return "stocks";
  if (m.includes("crypto")) return "crypto";
  if (m.includes("index")) return "indices";
  return "forex";
}

function formatJournalDateTime(isoLike?: string | null): string | undefined {
  if (!isoLike) return undefined;
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return undefined;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildVariablesFromTrade(trade: Record<string, unknown>): Record<string, string[]> {
  const structured =
    trade.tagVariables && typeof trade.tagVariables === "object" && !Array.isArray(trade.tagVariables)
      ? (trade.tagVariables as Record<string, unknown>)
      : null;
  if (structured && Object.keys(structured).length) {
    const out: Record<string, string[]> = {};
    for (const [key, val] of Object.entries(structured)) {
      if (Array.isArray(val)) out[key] = val.map(String);
      else if (val != null && val !== "") out[key] = [String(val)];
    }
    const planReviewKey = String(trade.planReviewKey ?? trade.planReview ?? "").trim();
    if (planReviewKey && !out.plan_review) out.plan_review = [planReviewKey];
    return out;
  }

  const variables: Record<string, string[]> = {};
  const planReviewKey = String(trade.planReviewKey ?? trade.planReview ?? "").trim();
  if (planReviewKey) variables.plan_review = [planReviewKey];
  const preTags = Array.isArray(trade.preTags) ? trade.preTags : [];
  const postTags = Array.isArray(trade.postTags) ? trade.postTags : [];
  if (preTags.length) variables.pre_tags = preTags.map(String);
  if (postTags.length) variables.post_tags = postTags.map(String);
  return variables;
}

const DISCIPLINE_NOTE_KEYS = new Set([
  "rules-followed",
  "rules-broken",
  "according-to-plan",
  "according_to_plan",
  "out-of-plan",
  "out_of_plan",
  "missed-trade",
  "missed_trade",
]);

function notePlainText(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(notePlainText).filter(Boolean).join(" ");
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const parts: string[] = [];
    for (const key of ["text", "note", "notes", "setup", "reason", "deviationReason"]) {
      const part = notePlainText(obj[key]);
      if (!part) continue;
      if (key === "reason" && DISCIPLINE_NOTE_KEYS.has(part.toLowerCase())) continue;
      parts.push(part);
    }
    return parts.join(" / ");
  }
  return String(value).trim();
}

function mergeNotes(trade: Record<string, unknown>): string | null {
  const parts = [
    notePlainText(trade.notes),
    notePlainText(trade.v9TradeNotes),
    notePlainText(trade.preNotes),
    notePlainText(trade.preTradeNotes),
    notePlainText(trade.postNotes),
    notePlainText(trade.postTradeNotes),
  ].filter(Boolean);
  const merged = [...new Set(parts)].join("\n\n");
  return merged || null;
}

/** Map dashboard Add Trade row → journal-backend POST /journal/add body. */
export function mapManualTradeToJournalAddPayload(
  trade: Record<string, unknown>,
  source?: LiveJournalAddTradeSource
): Record<string, unknown> {
  const side = String(trade.side || trade.direction || "Long").toLowerCase();
  const entryPrice = Number(trade.entryPrice ?? trade.entry ?? 0);
  const exitPriceRaw = trade.exitPrice ?? trade.exit;
  const statusText = String(trade.status || trade.trade_status || "").trim().toLowerCase();
  const isOpen =
    statusText.includes("open") ||
    (!trade.closeTime && !trade.exitDate && !trade.exitTime && exitPriceRaw == null);
  const exitPrice =
    !isOpen && exitPriceRaw != null && exitPriceRaw !== ""
      ? Number(exitPriceRaw)
      : null;
  const qty = Number(trade.position_size ?? trade.positionSize ?? trade.size ?? trade.quantity ?? 1);
  const openTime =
    formatJournalDateTime(trade.entryTime as string) ||
    formatJournalDateTime(
      trade.entryDate
        ? `${String(trade.entryDate).slice(0, 10)}T${String(trade.time || "00:00").slice(0, 5)}`
        : null
    ) ||
    formatJournalDateTime(trade.date as string);
  const closeTime = formatJournalDateTime(trade.closeTime as string) ||
    (trade.exitDate
      ? formatJournalDateTime(`${String(trade.exitDate).slice(0, 10)}T${String(trade.exitTime || "00:00").slice(0, 5)}`)
      : undefined);
  const setup = String(trade.setup_tag || trade.setup || trade.tag || "Discretion").trim();
  const strategyIdRaw = trade.strategy_id ?? trade.strategyId;
  const strategyId = strategyIdRaw != null && String(strategyIdRaw).trim() !== "" ? strategyIdRaw : null;
  const market = String(trade.market || trade.asset_class || trade.assetClass || "");
  const variables = buildVariablesFromTrade(trade);
  const demonCatcher =
    trade.demonCatcher && typeof trade.demonCatcher === "object"
      ? (trade.demonCatcher as Record<string, unknown>)
      : null;
  const planReviewKey = String(trade.planReviewKey ?? trade.planReview ?? "").trim() || null;
  const planOutcome =
    planReviewKey === "according_to_plan"
      ? "followed"
      : planReviewKey === "out_of_plan"
        ? "deviated"
        : planReviewKey === "missed_trade"
          ? "missed"
          : null;

  return {
    symbol: String(trade.symbol || "").toUpperCase(),
    direction: side.includes("short") || side === "sell" ? "short" : "long",
    entry_price: entryPrice,
    exit_price: exitPrice != null && Number.isFinite(exitPrice) ? exitPrice : null,
    quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
    stop_loss: trade.stopLoss ?? trade.planned_sl ?? null,
    take_profit: trade.takeProfit ?? trade.target ?? null,
    high_price: trade.highest_price ?? trade.highestPrice ?? null,
    low_price: trade.lowest_price ?? trade.lowestPrice ?? null,
    open_time: openTime,
    close_time: closeTime,
    entry_datetime: openTime,
    pnl: isOpen ? 0 : trade.pnl ?? trade.pnl_currency_net ?? null,
    rr: isOpen ? null : trade.rMultiple ?? trade.rr ?? trade.actual_rr_net ?? null,
    trade_status: isOpen ? "Open" : "Closed",
    strategy: setup,
    setup,
    strategy_id: strategyId,
    commission: trade.commission ?? trade.commission_total ?? null,
    slippage: trade.slippage ?? null,
    instrument_type: instrumentTypeFromMarket(market),
    risk_amount: trade.risk_amount ?? trade.riskAmount ?? null,
    notes: mergeNotes(trade),
    variables,
    ...(source?.profileId != null ? { profile_id: source.profileId } : {}),
    extra_data: {
      manual_dashboard: true,
      source_key: trade.sourceKey ?? trade.sourceFilterKey ?? source?.key ?? null,
      trade_id: trade.trade_id ?? trade.id ?? null,
      asset_class: market || null,
      market: market || null,
      timeframe: trade.timeframe ?? null,
      pre_tags: Array.isArray(trade.preTags) ? trade.preTags : [],
      post_tags: Array.isArray(trade.postTags) ? trade.postTags : [],
      tag_variables: variables,
      pre_tag_state: trade.preTagState ?? null,
      post_tag_state: trade.postTagState ?? null,
      plan_review: planReviewKey,
      plan_outcome: planOutcome,
      plan_behavior: trade.plan_behavior ?? trade.planBehavior ?? null,
      discipline_status: planReviewKey,
      missed_trade: !!(trade.missedTrade || planReviewKey === "missed_trade"),
      rules_followed: trade.rulesFollowed ?? (planOutcome ? planOutcome === "followed" : null),
      demons: trade.demons ?? [],
      demon_catcher: demonCatcher,
      demon_category: trade.demon_category ?? trade.demonCategory ?? null,
      screenshots: trade.screenshots ?? null,
      excursion_mode: trade.excursion_mode ?? trade.excursionMode ?? null,
      exit_reason: trade.exit_reason ?? trade.exitReason ?? null,
      trade_status: trade.status ?? null,
      strategy_type: trade.strategyTypeDescription ?? trade.strategy_type ?? null,
      custom_strategy: !!(trade.strategyTypeDescription || trade.strategy_type),
      strategy_default_discretion: !!(trade.strategyDefaultDiscretion ?? setup === "Discretion"),
      strategy_assignment: trade.strategy_assignment ?? (setup === "Discretion" ? "discretion" : null),
      planned_rr: trade.planned_rr ?? trade.plannedRR ?? null,
      plannedRR: trade.planned_rr ?? trade.plannedRR ?? null,
    },
  };
}

export async function saveManualTradeToLiveJournal(
  source: LiveJournalAddTradeSource,
  trade: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (source.liveAccountId == null && source.profileId == null) {
    throw new Error("This journal account is missing profile information. Refresh the page and try again.");
  }

  await activateLiveJournalProfile(source);

  const payload = mapManualTradeToJournalAddPayload(trade, source);
  const headers = await requireJournalAuthHeaders();
  const res = await fetch(`${JOURNAL_API_BASE}/journal/add`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as { trade?: ApiJournalEntry; error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Could not save journal trade (HTTP ${res.status})`);
  }

  const saved = data.trade;
  if (saved && typeof saved.id === "number") {
    mergeLiveJournalTradeIntoBoot(source, saved);
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("talaria-v16-reload-boot"));
  }

  return saved ?? trade;
}
