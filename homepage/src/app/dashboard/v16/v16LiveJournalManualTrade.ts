import { JOURNAL_API_BASE, syncJournalTokenFromSession } from "@/lib/journalApi";
import { authHeaders } from "@/app/dashboard/strategies/strategyLabV9Auth";

export type LiveJournalAddTradeSource = {
  key?: string;
  kind?: string;
  label?: string;
  liveAccountId?: number;
  profileId?: number;
};

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

/** Map dashboard Add Trade row → journal-backend POST /journal/add body. */
export function mapManualTradeToJournalAddPayload(trade: Record<string, unknown>): Record<string, unknown> {
  const side = String(trade.side || trade.direction || "Long").toLowerCase();
  const entryPrice = Number(trade.entryPrice ?? trade.entry ?? 0);
  const exitPriceRaw = trade.exitPrice ?? trade.exit;
  const exitPrice =
    exitPriceRaw != null && exitPriceRaw !== ""
      ? Number(exitPriceRaw)
      : entryPrice;
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
  const setup = String(trade.setup_tag || trade.setup || trade.tag || "Manual").trim();

  const variables: Record<string, string[]> = {};
  const preTags = Array.isArray(trade.preTags) ? trade.preTags : [];
  const postTags = Array.isArray(trade.postTags) ? trade.postTags : [];
  if (preTags.length) variables.pre_tags = preTags.map(String);
  if (postTags.length) variables.post_tags = postTags.map(String);

  return {
    symbol: String(trade.symbol || "").toUpperCase(),
    direction: side.includes("short") || side === "sell" ? "short" : "long",
    entry_price: entryPrice,
    exit_price: Number.isFinite(exitPrice) ? exitPrice : entryPrice,
    quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
    stop_loss: trade.stopLoss ?? trade.planned_sl ?? null,
    take_profit: trade.takeProfit ?? trade.target ?? null,
    high_price: trade.highest_price ?? trade.highestPrice ?? null,
    low_price: trade.lowest_price ?? trade.lowestPrice ?? null,
    open_time: openTime,
    close_time: closeTime,
    entry_datetime: openTime,
    pnl: trade.pnl ?? trade.pnl_currency_net ?? null,
    rr: trade.rMultiple ?? trade.rr ?? trade.actual_rr_net ?? null,
    strategy: setup,
    setup,
    commission: trade.commission ?? trade.commission_total ?? null,
    slippage: trade.slippage ?? null,
    instrument_type: instrumentTypeFromMarket(String(trade.market || trade.asset_class || "")),
    risk_amount: trade.risk_amount ?? trade.riskAmount ?? null,
    notes:
      (typeof trade.notes === "string" ? trade.notes : null) ||
      (typeof (trade.postTradeNotes as { reason?: string })?.reason === "string"
        ? (trade.postTradeNotes as { reason?: string }).reason
        : null),
    variables,
    extra_data: {
      manual_dashboard: true,
      source_key: trade.sourceKey ?? trade.sourceFilterKey ?? null,
      trade_id: trade.trade_id ?? trade.id ?? null,
    },
  };
}

export async function saveManualTradeToLiveJournal(
  source: LiveJournalAddTradeSource,
  trade: Record<string, unknown>
): Promise<Record<string, unknown>> {
  await syncJournalTokenFromSession();
  const headers = authHeaders();

  if (source.liveAccountId != null) {
    await fetch(`${JOURNAL_API_BASE}/journal/live-accounts/${source.liveAccountId}/activate`, {
      method: "POST",
      headers,
    });
  }

  const payload = mapManualTradeToJournalAddPayload(trade);
  const res = await fetch(`${JOURNAL_API_BASE}/journal/add`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as { trade?: Record<string, unknown>; error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Could not save journal trade (HTTP ${res.status})`);
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("talaria-v16-reload-boot"));
  }

  return data.trade ?? trade;
}
