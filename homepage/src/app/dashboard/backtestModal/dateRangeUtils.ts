export type DateRangeFile = { id: string; ticker: string; from: string; to: string };

const MIN_MARKET_YEAR = 1900;
const MAX_MARKET_YEAR = 2100;

/** Parse YYYY-MM-DD to UTC midnight ms; returns null when invalid or out of market range. */
export function isoDayToUtcMs(iso: string): number | null {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  if (!Number.isFinite(y) || y < MIN_MARKET_YEAR || y > MAX_MARKET_YEAR) return null;
  if (mo < 0 || mo > 11 || d < 1 || d > 31) return null;
  const ms = Date.UTC(y, mo, d);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo || check.getUTCDate() !== d) return null;
  return ms;
}

export function isPlausibleMarketIsoDay(iso: string): boolean {
  return isoDayToUtcMs(iso) != null;
}

export function compareIsoDays(a: string, b: string): number {
  const ams = isoDayToUtcMs(a);
  const bms = isoDayToUtcMs(b);
  if (ams == null && bms == null) return 0;
  if (ams == null) return -1;
  if (bms == null) return 1;
  return ams - bms;
}

export function isIsoInRange(iso: string, minIso: string, maxIso: string): boolean {
  if (!isPlausibleMarketIsoDay(iso)) return false;
  if (minIso && isPlausibleMarketIsoDay(minIso) && compareIsoDays(iso, minIso) < 0) return false;
  if (maxIso && isPlausibleMarketIsoDay(maxIso) && compareIsoDays(iso, maxIso) > 0) return false;
  return true;
}

/** Normalize stored candle timestamps to UTC epoch ms (seconds or ms); mirrors chart api_server. */
export function normalizeEpochMs(v: unknown): number | null {
  if (v == null || v === "") return null;
  const x = typeof v === "string" ? Number(v) : Number(v);
  if (!Number.isFinite(x)) return null;
  const xi = Math.trunc(x);
  if (xi === 0) return null;
  let ms: number;
  if (Math.abs(xi) >= 1e12) ms = xi;
  else if (Math.abs(xi) >= 1e9) ms = xi * 1000;
  else return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  if (y < MIN_MARKET_YEAR || y > MAX_MARKET_YEAR) return null;
  return ms;
}

/** Intersection of [from, to] across files (latest start, earliest end). */
export function computeOverlapRange(files: DateRangeFile[]) {
  const withRange = files.filter((f) => f.from && f.to && isPlausibleMarketIsoDay(f.from) && isPlausibleMarketIsoDay(f.to));
  if (!withRange.length) {
    return { start: "", end: "", hasOverlap: false, conflict: false };
  }
  const start = withRange.map((f) => f.from).sort(compareIsoDays).slice(-1)[0] || "";
  const end = withRange.map((f) => f.to).sort(compareIsoDays)[0] || "";
  if (!start || !end || compareIsoDays(start, end) > 0) {
    return { start: "", end: "", hasOverlap: false, conflict: true };
  }
  return { start, end, hasOverlap: true, conflict: false };
}

/** Shift a YYYY-MM-DD by whole calendar months (UTC), clamping day into the target month. */
export function shiftIsoMonths(iso: string, deltaMonths: number): string {
  const ms = isoDayToUtcMs(iso);
  if (ms == null || !Number.isFinite(deltaMonths)) return "";
  const d = new Date(ms);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + deltaMonths);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Selectable session window = last calendar month of available data
 * (dataEnd − 1 month … dataEnd), clamped to dataStart.
 */
export function lastMonthOfDataRange(dataStart: string, dataEnd: string) {
  if (!dataEnd || !isPlausibleMarketIsoDay(dataEnd)) {
    return { start: "", end: "", hasRange: false as const };
  }
  let start = shiftIsoMonths(dataEnd, -1);
  if (!start) start = dataEnd;
  if (dataStart && isPlausibleMarketIsoDay(dataStart) && compareIsoDays(start, dataStart) < 0) {
    start = dataStart;
  }
  if (compareIsoDays(start, dataEnd) > 0) start = dataEnd;
  return { start, end: dataEnd, hasRange: true as const };
}

export function isoToDisplay(iso: string, monthNames: string[]) {
  if (!iso) return "";
  const d = new Date(iso.split("T")[0] + "T00:00:00");
  return `${String(d.getDate()).padStart(2, "0")}-${monthNames[d.getMonth()]}-${d.getFullYear()}`;
}

export function clampIso(iso: string, minIso: string, maxIso: string) {
  if (!iso || !isPlausibleMarketIsoDay(iso)) return iso;
  if (minIso && isPlausibleMarketIsoDay(minIso) && compareIsoDays(iso, minIso) < 0) return minIso;
  if (maxIso && isPlausibleMarketIsoDay(maxIso) && compareIsoDays(iso, maxIso) > 0) return maxIso;
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
  const normalized = normalizeEpochMs(ms);
  if (normalized == null) return "";
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function isoDayFromApiText(s: string | null | undefined): string {
  if (!s) return "";
  const m = String(s).match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

function spanPairFromIsoText(fromRaw: string, toRaw: string): { from: string; to: string } | null {
  const from = isoDayFromApiText(fromRaw);
  const to = isoDayFromApiText(toRaw);
  if (!from || !to || !isPlausibleMarketIsoDay(from) || !isPlausibleMarketIsoDay(to)) return null;
  if (compareIsoDays(from, to) > 0) return null;
  return { from, to };
}

/** YYYY-MM-DD span from `/api/files?session_ready=1` row. */
export function spanFromApiFile(f: Record<string, unknown> | null | undefined): { from: string; to: string } | null {
  if (!f) return null;
  const fromIsoText = String(f.start_iso || "");
  const toIsoText = String(f.end_iso || "");
  const isoSpan = spanPairFromIsoText(fromIsoText, toIsoText);

  const fromMs = isoDayFromEpochMs(f.start_ts_ms as number);
  const toMs = isoDayFromEpochMs(f.end_ts_ms as number);
  if (fromMs && toMs && compareIsoDays(fromMs, toMs) <= 0) {
    if (!isoSpan || (fromMs === isoSpan.from && toMs === isoSpan.to)) return { from: fromMs, to: toMs };
    // Prefer ISO text when epoch fields disagree (corrupt seconds/ms on some datasets).
    if (isoSpan) return isoSpan;
    return { from: fromMs, to: toMs };
  }

  if (f.start_ts != null && f.end_ts != null) {
    const from = isoDayFromEpochMs(f.start_ts as number);
    const to = isoDayFromEpochMs(f.end_ts as number);
    if (from && to && compareIsoDays(from, to) <= 0) {
      if (isoSpan) return isoSpan;
      return { from, to };
    }
  }

  return isoSpan;
}
