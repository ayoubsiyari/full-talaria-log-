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

export type DateRangePreset = { l: string; months?: number; years?: number };

export const SESSION_DATE_PRESETS: DateRangePreset[] = [
  { l: "1M", months: 1 },
  { l: "3M", months: 3 },
  { l: "6M", months: 6 },
  { l: "1Y", years: 1 },
  { l: "2Y", years: 2 },
  { l: "3Y", years: 3 },
  { l: "5Y", years: 5 },
  { l: "10Y", years: 10 },
];

/** Inclusive day span between ISO dates (matches random-range logic in session modal). */
export function overlapSpanDays(startIso: string, endIso: string): number {
  if (!startIso || !endIso) return 0;
  const earliest = new Date(`${startIso}T00:00:00`);
  const latest = new Date(`${endIso}T00:00:00`);
  if (Number.isNaN(earliest.getTime()) || Number.isNaN(latest.getTime())) return 0;
  return Math.max(1, Math.round((latest.getTime() - earliest.getTime()) / 86400000));
}

export function presetSpanDays(preset: DateRangePreset): number {
  if (preset.months) return Math.round(preset.months * 30.4375);
  if (preset.years) return Math.round(preset.years * 365.25);
  return 0;
}

export function filterPresetsForSpanDays(presets: DateRangePreset[], spanDays: number): DateRangePreset[] {
  if (spanDays <= 0) return [];
  return presets.filter((preset) => presetSpanDays(preset) <= spanDays);
}

const RAND_RANGE_UNIT_CAPS = { D: 3650, M: 120, Y: 10 } as const;

/** Max random window per unit for the selected dataset span (0 = unit unavailable). */
export function randomRangeUnitMax(spanDays: number): Record<keyof typeof RAND_RANGE_UNIT_CAPS, number> {
  if (spanDays <= 0) return { ...RAND_RANGE_UNIT_CAPS };
  return {
    D: Math.max(1, Math.min(RAND_RANGE_UNIT_CAPS.D, spanDays)),
    M: Math.max(0, Math.min(RAND_RANGE_UNIT_CAPS.M, Math.floor(spanDays / 30.4375))),
    Y: Math.max(0, Math.min(RAND_RANGE_UNIT_CAPS.Y, Math.floor(spanDays / 365.25))),
  };
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
