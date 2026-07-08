import { JOURNAL_API_BASE, journalAuthHeaders, parseJournalJsonResponse, syncJournalTokenFromSession } from "@/lib/journalApi";
import {
  apiStrategyToBankRow,
  bankStrategyToApiBody,
  type ApiStrategyRecord,
} from "../strategies/strategyLabV9Mappers";

type StrategyImageEntry = { src: string; name?: string };

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

function isDataImageUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("data:image/") && value.includes(",");
}

function imageEntrySrc(entry: unknown): string {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object" && "src" in entry) {
    const src = (entry as { src?: unknown }).src;
    return typeof src === "string" ? src : "";
  }
  return "";
}

async function uploadStrategyImage(entry: unknown): Promise<StrategyImageEntry | null> {
  const src = imageEntrySrc(entry);
  if (!src) return null;
  if (!isDataImageUrl(src)) {
    const name =
      entry && typeof entry === "object" && "name" in entry
        ? String((entry as { name?: unknown }).name || "").trim()
        : "";
    return name ? { src, name } : { src };
  }

  const res = await fetch(`${JOURNAL_API_BASE}/strategy-images`, {
    method: "POST",
    headers: journalAuthHeaders(),
    body: JSON.stringify({ data_url: src }),
  });
  const data = await parseJournalJsonResponse<{
    success?: boolean;
    url?: string;
    path?: string;
    error?: string;
  }>(res);
  if (!res.ok || !(data.url || data.path)) {
    throw new Error(data.error || `Could not upload strategy image (HTTP ${res.status})`);
  }
  const name =
    entry && typeof entry === "object" && "name" in entry
      ? String((entry as { name?: unknown }).name || "").trim()
      : "";
  const url = String(data.url || data.path);
  return name ? { src: url, name } : { src: url };
}

async function uploadStrategyImageList(images: unknown): Promise<StrategyImageEntry[]> {
  if (!Array.isArray(images)) return [];
  const out: StrategyImageEntry[] = [];
  for (const image of images) {
    const uploaded = await uploadStrategyImage(image);
    if (uploaded) out.push(uploaded);
  }
  return out;
}

async function uploadStrategyImagesInDefinition(definition: Record<string, unknown>): Promise<void> {
  const cover = definition.cover_image;
  if (isDataImageUrl(cover)) {
    const uploaded = await uploadStrategyImage(cover);
    definition.cover_image = uploaded?.src || "";
  }

  const v9 = definition.talaria_v9;
  if (!v9 || typeof v9 !== "object") return;
  const v9rec = v9 as Record<string, unknown>;

  if (Array.isArray(v9rec.images)) {
    v9rec.images = await uploadStrategyImageList(v9rec.images);
  }

  if (Array.isArray(v9rec.canvasNodes)) {
    for (const node of v9rec.canvasNodes) {
      if (!node || typeof node !== "object") continue;
      const data = (node as Record<string, unknown>).data;
      if (!data || typeof data !== "object") continue;
      const d = data as Record<string, unknown>;
      if (Array.isArray(d.images)) {
        d.images = await uploadStrategyImageList(d.images);
      }
    }
  }
}

/** Create or update a strategy in journal-backend; returns Strategy Bank row. */
export async function saveStrategyToJournalApi(
  strat: Record<string, unknown>,
  existingId?: number | null
): Promise<Record<string, unknown>> {
  await ensureJournalAuth();
  const body = bankStrategyToApiBody(strat);
  await uploadStrategyImagesInDefinition(body.strategy_definition);
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
  if (res.status === 413) {
    throw new Error(
      "This strategy is too large to save. Remove a few uploaded images or use smaller screenshots, then try again."
    );
  }
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
