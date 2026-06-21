import { JOURNAL_API_BASE, syncJournalTokenFromSession } from "@/lib/journalApi";
import { authHeaders } from "@/app/dashboard/strategies/strategyLabV9Auth";

export type LiveJournalLimitBucket = { count: number; max: number };

export type LiveJournalLimitsPayload = {
  personal: LiveJournalLimitBucket;
  prop: LiveJournalLimitBucket;
};

export type LiveJournalAccountTypeKey = "personal" | "prop";

function normalizeBucket(raw: unknown, fallbackMax: number): LiveJournalLimitBucket {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const count = Math.max(0, Number(row.count ?? 0) || 0);
  const max = Math.max(0, Number(row.max ?? fallbackMax) || fallbackMax);
  return { count, max };
}

function inferLimitsFromAccounts(
  accounts: { account_type?: string | null }[] | undefined,
  fallbackMax = 5
): LiveJournalLimitsPayload {
  const personal = accounts?.filter((a) => String(a.account_type || "").toLowerCase() === "personal").length ?? 0;
  const prop = accounts?.filter((a) => String(a.account_type || "").toLowerCase() === "prop").length ?? 0;
  return {
    personal: { count: personal, max: fallbackMax },
    prop: { count: prop, max: fallbackMax },
  };
}

/** Fetch live journal counts and caps from journal-backend. */
export async function fetchLiveJournalLimits(): Promise<LiveJournalLimitsPayload | null> {
  try {
    await syncJournalTokenFromSession();
    const res = await fetch(`${JOURNAL_API_BASE}/journal/live-accounts`, {
      headers: authHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      limits?: Partial<LiveJournalLimitsPayload>;
      accounts?: { account_type?: string | null }[];
    };
    if (data.limits && typeof data.limits === "object") {
      return {
        personal: normalizeBucket(data.limits.personal, 5),
        prop: normalizeBucket(data.limits.prop, 5),
      };
    }
    return inferLimitsFromAccounts(data.accounts);
  } catch {
    return null;
  }
}

export function liveJournalLimitLabel(type: LiveJournalAccountTypeKey): string {
  return type === "prop" ? "Prop journal" : "Personal live journal";
}

export function isLiveJournalTypeAtLimit(
  limits: LiveJournalLimitsPayload | null | undefined,
  type: LiveJournalAccountTypeKey
): boolean {
  if (!limits) return false;
  const bucket = limits[type];
  if (!bucket || bucket.max <= 0) return false;
  return bucket.count >= bucket.max;
}

export function liveJournalLimitMessage(
  limits: LiveJournalLimitsPayload,
  type: LiveJournalAccountTypeKey
): string {
  const bucket = limits[type];
  return `${liveJournalLimitLabel(type)} limit reached (${bucket.count}/${bucket.max}). Delete an existing journal to create a new one.`;
}
