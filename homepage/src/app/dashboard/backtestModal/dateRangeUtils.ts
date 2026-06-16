export type DateRangeFile = { id: string; ticker: string; from: string; to: string };

/** Intersection of [from, to] across files (latest start, earliest end). */
export function computeOverlapRange(files: DateRangeFile[]) {
  const withRange = files.filter(f => f.from && f.to);
  if (!withRange.length) {
    return { start: "", end: "", hasOverlap: false, conflict: false };
  }
  const start = withRange.map(f => f.from).sort().slice(-1)[0] || "";
  const end = withRange.map(f => f.to).sort()[0] || "";
  if (!start || !end || start > end) {
    return { start: "", end: "", hasOverlap: false, conflict: true };
  }
  return { start, end, hasOverlap: true, conflict: false };
}

export function isoToDisplay(iso: string, monthNames: string[]) {
  if (!iso) return "";
  const d = new Date(iso.split("T")[0] + "T00:00:00");
  return `${String(d.getDate()).padStart(2, "0")}-${monthNames[d.getMonth()]}-${d.getFullYear()}`;
}

export function clampIso(iso: string, minIso: string, maxIso: string) {
  if (!iso) return iso;
  if (minIso && iso < minIso) return minIso;
  if (maxIso && iso > maxIso) return maxIso;
  return iso;
}

export function isoDayFromEpochMs(ms: number | string | null | undefined): string {
  if (ms == null || ms === "") return "";
  const n = typeof ms === "string" ? Number(ms) : ms;
  if (!Number.isFinite(n) || n <= 0) return "";
  const d = new Date(n);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function isoDayFromApiText(s: string | null | undefined): string {
  if (!s) return "";
  const m = String(s).match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

/** YYYY-MM-DD span from `/api/files?session_ready=1` row. */
export function spanFromApiFile(f: Record<string, unknown> | null | undefined): { from: string; to: string } | null {
  if (!f) return null;
  const fromMs = isoDayFromEpochMs(f.start_ts_ms as number);
  const toMs = isoDayFromEpochMs(f.end_ts_ms as number);
  if (fromMs && toMs) return { from: fromMs, to: toMs };
  if (f.start_ts != null && f.end_ts != null) {
    const from = isoDayFromEpochMs(f.start_ts as number);
    const to = isoDayFromEpochMs(f.end_ts as number);
    if (from && to) return { from, to };
  }
  const fromIso = isoDayFromApiText(String(f.start_iso || ""));
  const toIso = isoDayFromApiText(String(f.end_iso || ""));
  if (fromIso && toIso) return { from: fromIso, to: toIso };
  return null;
}
