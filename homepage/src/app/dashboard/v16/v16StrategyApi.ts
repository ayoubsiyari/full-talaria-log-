import { JOURNAL_API_BASE, journalAuthHeaders, parseJournalJsonResponse, syncJournalTokenFromSession } from "@/lib/journalApi";
import {
  apiStrategyToBankRow,
  bankStrategyToApiBody,
  type ApiStrategyRecord,
} from "../strategies/strategyLabV9Mappers";

export function parseStrategyApiId(id: unknown): number | null {
  if (typeof id === "number" && Number.isFinite(id) && id > 0) return id;
  const raw = String(id ?? "").trim();
  if (/^\d+$/.test(raw)) {
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

async function ensureJournalAuth(): Promise<void> {
  const token = await syncJournalTokenFromSession();
  if (!token) {
    throw new Error("Sign in again to save strategies.");
  }
}

/** Create or update a strategy in journal-backend; returns Strategy Bank row. */
export async function saveStrategyToJournalApi(
  strat: Record<string, unknown>,
  existingId?: number | null
): Promise<Record<string, unknown>> {
  await ensureJournalAuth();
  const body = bankStrategyToApiBody(strat);
  const headers = journalAuthHeaders();
  const url =
    existingId != null
      ? `${JOURNAL_API_BASE}/strategies/${existingId}`
      : `${JOURNAL_API_BASE}/strategies`;
  const res = await fetch(url, {
    method: existingId != null ? "PUT" : "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await parseJournalJsonResponse<{
    success?: boolean;
    strategy?: ApiStrategyRecord;
    error?: string;
  }>(res);
  if (!res.ok || !data.strategy) {
    throw new Error(data.error || `Could not save strategy (HTTP ${res.status})`);
  }
  return apiStrategyToBankRow(data.strategy);
}

/** Delete a persisted strategy by numeric API id. */
export async function deleteStrategyFromJournalApi(strategyId: number): Promise<void> {
  await ensureJournalAuth();
  const res = await fetch(`${JOURNAL_API_BASE}/strategies/${strategyId}`, {
    method: "DELETE",
    headers: journalAuthHeaders(),
  });
  const data = await parseJournalJsonResponse<{ success?: boolean; error?: string }>(res);
  if (!res.ok) {
    throw new Error(data.error || `Could not delete strategy (HTTP ${res.status})`);
  }
}
