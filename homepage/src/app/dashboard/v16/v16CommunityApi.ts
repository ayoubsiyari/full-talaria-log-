import {
  JOURNAL_API_BASE,
  journalAuthHeaders,
  parseJournalJsonResponse,
  syncJournalTokenFromSession,
} from "@/lib/journalApi";
import {
  apiStrategyToBankRow,
  buildBacktestSnapshotFromSession,
  DEFAULT_COMMUNITY_PUBLISH_OPTIONS,
  pickBestBacktestSession,
  templateToCommunityRow,
  type ApiStrategyRecord,
  type ApiTemplateRecord,
  type BacktestSnapshotPublic,
  type CommunityPublishOptions,
} from "../strategies/strategyLabV9Mappers";

async function ensureJournalAuth(): Promise<void> {
  const token = await syncJournalTokenFromSession();
  if (!token) {
    throw new Error("Sign in again to use the strategy community.");
  }
}

/** Load published community + official templates from journal-backend. */
export async function fetchCommunityTemplates(): Promise<Record<string, unknown>[]> {
  await syncJournalTokenFromSession();
  const res = await fetch(`${JOURNAL_API_BASE}/templates`, {
    headers: journalAuthHeaders(),
    cache: "no-store",
  });
  const data = await parseJournalJsonResponse<{
    success?: boolean;
    templates?: ApiTemplateRecord[];
    error?: string;
  }>(res);
  if (!res.ok) {
    throw new Error(data.error || `Could not load community strategies (HTTP ${res.status})`);
  }
  return (Array.isArray(data.templates) ? data.templates : []).map((row) =>
    templateToCommunityRow(row)
  );
}

/** Copy a published template into the user's strategy bank. */
export async function cloneCommunityTemplate(
  templateId: number,
  name?: string
): Promise<Record<string, unknown>> {
  await ensureJournalAuth();
  const res = await fetch(`${JOURNAL_API_BASE}/templates/${templateId}/clone`, {
    method: "POST",
    headers: journalAuthHeaders(),
    body: JSON.stringify(name ? { name: name.slice(0, 100) } : {}),
  });
  const data = await parseJournalJsonResponse<{
    success?: boolean;
    strategy?: ApiStrategyRecord;
    error?: string;
  }>(res);
  if (!res.ok || !data.strategy) {
    throw new Error(data.error || `Could not copy strategy (HTTP ${res.status})`);
  }
  return apiStrategyToBankRow(data.strategy);
}

/** Publish one of the user's saved strategies to the community feed. */
export async function submitStrategyToCommunity(
  strategyId: number,
  options?: {
    publishSettings?: Partial<CommunityPublishOptions>;
    backtestSnapshot?: BacktestSnapshotPublic | null;
    backtestSessions?: Record<string, unknown>[];
    category?: string | null;
    difficulty?: string | null;
  }
): Promise<number> {
  await ensureJournalAuth();
  const bestSession = pickBestBacktestSession(options?.backtestSessions);
  const snapshot =
    options?.backtestSnapshot ??
    (bestSession ? buildBacktestSnapshotFromSession(bestSession) : null);
  const settings = { ...DEFAULT_COMMUNITY_PUBLISH_OPTIONS, ...(options?.publishSettings || {}) };
  const res = await fetch(`${JOURNAL_API_BASE}/templates/submit`, {
    method: "POST",
    headers: journalAuthHeaders(),
    body: JSON.stringify({
      strategy_id: strategyId,
      ...settings,
      publish_settings: settings,
      backtest_snapshot: snapshot,
      category: options?.category ?? null,
      difficulty: options?.difficulty ?? null,
    }),
  });
  const data = await parseJournalJsonResponse<{
    success?: boolean;
    template_id?: number;
    error?: string;
  }>(res);
  if (!res.ok || typeof data.template_id !== "number") {
    throw new Error(data.error || `Could not publish strategy (HTTP ${res.status})`);
  }
  return data.template_id;
}
