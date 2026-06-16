export type DatasetDateRange = { from: string | null; to: string | null };

export type OverlapResult =
  | { ok: true; from: string; to: string }
  | { ok: false; from: null; to: null; message?: string };

export function normSessionSym(t: string) {
  return String(t || "").replace(/[\/\s_.-]/g, "").toUpperCase();
}

function ymd8ToIso(raw: string): string | null {
  const s = String(raw || "").trim();
  if (!/^\d{8}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6));
  const d = Number(s.slice(6, 8));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Parse dataset span from filename patterns (Dukascopy, year ranges, etc.). */
export function parseDatasetDateRangeFromName(name: string): DatasetDateRange {
  const n = String(name || "");
  const m8 = n.match(/(?:^|[-_])(\d{8})[-_](\d{8})(?:\.|$)/);
  if (m8) {
    const from = ymd8ToIso(m8[1]);
    const to = ymd8ToIso(m8[2]);
    if (from && to) return { from, to };
  }
  const m4 = n.match(/(?:^|[-_])(\d{4})[-_](\d{4})(?:\.|$)/);
  if (m4) {
    const y1 = Number(m4[1]);
    const y2 = Number(m4[2]);
    if (y1 >= 1990 && y2 >= y1 && y2 <= 2100) {
      return { from: `${y1}-01-01`, to: `${y2}-12-31` };
    }
  }
  return { from: null, to: null };
}

export function matchApiFileForSymbol(sym: string, apiFiles: Record<string, unknown>[]) {
  const key = normSessionSym(sym);
  if (!key) return null;
  return (
    apiFiles.find((f) => {
      const ft = normSessionSym(String(f.ticker || ""));
      const fromName = normSessionSym(String(f.original_name || f.name || "").replace(/\.csv$/i, ""));
      return ft === key || fromName === key || fromName.startsWith(key) || key.startsWith(ft);
    }) || null
  );
}

export function fileDateRange(
  file: Record<string, unknown> | null,
  mockByTicker?: Record<string, { from?: string; to?: string }>,
): DatasetDateRange {
  if (!file) return { from: null, to: null };
  const fromTs = file.start_ts ?? file.data_start ?? file.first_bar_ms;
  const toTs = file.end_ts ?? file.data_end ?? file.last_bar_ms;
  if (fromTs != null && toTs != null) {
    const fromIso = epochToIso(fromTs);
    const toIso = epochToIso(toTs);
    if (fromIso && toIso) return { from: fromIso, to: toIso };
  }
  const fromName = parseDatasetDateRangeFromName(String(file.original_name || file.name || ""));
  if (fromName.from && fromName.to) return fromName;
  const ticker = normSessionSym(String(file.ticker || ""));
  const mock = ticker && mockByTicker ? mockByTicker[ticker] : null;
  if (mock?.from && mock?.to) return { from: mock.from, to: mock.to };
  return { from: null, to: null };
}

function epochToIso(v: unknown): string | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n > 1e12 ? n : n * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function computeOverlapRange(
  tickers: string[],
  apiFiles: Record<string, unknown>[],
  mockByTicker?: Record<string, { from?: string; to?: string }>,
): OverlapResult {
  const unique = [...new Set(tickers.map((t) => normSessionSym(t)).filter(Boolean))];
  if (!unique.length) {
    return { ok: false, from: null, to: null, message: "Select instruments to see available dates" };
  }
  const ranges: { sym: string; from: string; to: string }[] = [];
  const missing: string[] = [];
  unique.forEach((sym) => {
    const file = matchApiFileForSymbol(sym, apiFiles);
    const span = fileDateRange(file, mockByTicker);
    if (!span.from || !span.to) {
      missing.push(sym);
      return;
    }
    ranges.push({ sym, from: span.from, to: span.to });
  });
  if (missing.length) {
    return {
      ok: false,
      from: null,
      to: null,
      message: `No dataset dates for: ${missing.join(", ")}`,
    };
  }
  const from = ranges.reduce((max, r) => (r.from > max ? r.from : max), ranges[0].from);
  const to = ranges.reduce((min, r) => (r.to < min ? r.to : min), ranges[0].to);
  if (from > to) {
    return {
      ok: false,
      from: null,
      to: null,
      message: "Selected symbols have no overlapping date range",
    };
  }
  return { ok: true, from, to };
}

export const MON_D = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MON_SHORT = MON_D;

export function fmtD(iso: string) {
  if (!iso) return "";
  const d = new Date(String(iso).split("T")[0] + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}-${MON_D[d.getMonth()]}-${d.getFullYear()}`;
}

export function isoToday() {
  return new Date().toISOString().slice(0, 10);
}
