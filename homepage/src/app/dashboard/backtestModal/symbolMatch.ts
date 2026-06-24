/** Normalized symbol key (no slashes/spaces). */
export function normSymbolKey(sym: string): string {
  return String(sym || "").replace(/[\/\s_.-]/g, "").toUpperCase();
}

const FILENAME_META = new Set([
  "FULL", "DAY", "WEEK", "MONTH", "YEAR", "HOUR", "MIN", "CONTIN", "UNADJ", "ADJ",
  "RATIO", "ABSOLUTE", "FIRSTRATE", "CONTINUOUS", "1MIN", "5MIN", "30MIN", "60MIN",
]);

/** Mirror server `_firstrate_extract_ticker_from_filename` (best-effort). */
export function extractTickerStemFromDatasetName(raw: string): string {
  let name = String(raw || "").replace(/^.*[\\/]/, "").replace(/\.csv$/i, "");
  name = name.replace(/^\d{8}_\d{6}_/, "");
  name = name.replace(/^b\d{2}_\d{4}_firstrate_/i, "");
  name = name.replace(/^firstrate_/i, "");
  const parts = name.split(/[_\s-]+/).filter(Boolean);
  if (!parts.length) return "";
  const seg =
    parts.find((p) => !FILENAME_META.has(p.toUpperCase()) && !/^\d+$/.test(p)) || parts[0];
  const compact = normSymbolKey(seg);
  const m = compact.match(/^([A-Z]{2,5})-([A-Z]{2,5})$/);
  if (m) return m[1] + m[2];
  return compact;
}

/** ES ↔ ES1 style aliases for continuous futures roots (not prefix fuzzy match). */
export function datasetSymbolAliases(requested: string): Set<string> {
  const key = normSymbolKey(requested);
  const out = new Set<string>([key]);
  if (/^[A-Z0-9]{1,5}\d$/.test(key)) out.add(key.slice(0, -1));
  else if (/^[A-Z0-9]{1,5}$/.test(key)) out.add(key + "1");
  return out;
}

/** True when `segment` is the same futures root as `token` (never ES → ESG). */
export function futuresSegmentMatchesToken(token: string, segment: string): boolean {
  const tok = normSymbolKey(token);
  const seg = normSymbolKey(segment);
  if (!tok || !seg) return false;
  if (seg === tok) return true;
  const aliases = datasetSymbolAliases(tok);
  if (aliases.has(seg)) return true;
  // CME month code + optional year digits (ESM24, CLH5) — not a bare extra letter (ESG).
  const monthRest = seg.slice(tok.length);
  if (seg.startsWith(tok) && /^[FGHJKMNQUVXZ]\d{0,4}$/i.test(monthRest)) return true;
  return false;
}

export function fileMatchesRequestedSymbol(
  requested: string,
  f: Record<string, unknown> | null | undefined,
): boolean {
  if (!f) return false;
  const key = normSymbolKey(requested);
  const aliases = datasetSymbolAliases(key);
  const ft = normSymbolKey(String(f.ticker || ""));
  if (aliases.has(ft)) return true;
  const stem = extractTickerStemFromDatasetName(String(f.original_name || f.name || ""));
  if (stem && aliases.has(stem)) return true;
  if (stem && futuresSegmentMatchesToken(key, stem)) return true;
  if (ft && futuresSegmentMatchesToken(key, ft)) return true;
  return false;
}

export function findDatasetFileForSymbol(
  sym: string,
  apiFiles: Record<string, unknown>[],
): Record<string, unknown> | null {
  const key = normSymbolKey(sym);
  if (!key || !apiFiles?.length) return null;

  const exact = apiFiles.filter((f) => fileMatchesRequestedSymbol(key, f));
  if (!exact.length) return null;

  // Prefer exact ticker stem match over ES1 when user asked for ES.
  const rank = (f: Record<string, unknown>) => {
    const ft = normSymbolKey(String(f.ticker || ""));
    const stem = extractTickerStemFromDatasetName(String(f.original_name || f.name || ""));
    if (ft === key || stem === key) return 0;
    if (ft === key + "1" || stem === key + "1") return 1;
    return 2;
  };
  exact.sort((a, b) => rank(a) - rank(b));
  return exact[0];
}

/** Chart/session display: ES1 → ES for known futures roots. */
const FUTURES_DISPLAY_ROOTS = new Set([
  "ES", "NQ", "YM", "RTY", "CL", "GC", "SI", "NG", "HG", "PL", "RB", "HO",
  "MNQ", "MES", "MYM", "M2K", "MGC", "MCL", "6E", "6B", "6J", "6A",
]);

export function displaySessionSymbol(sym: string): string {
  const k = normSymbolKey(sym);
  if (/^[A-Z0-9]{1,5}\d$/.test(k)) {
    const root = k.slice(0, -1);
    if (FUTURES_DISPLAY_ROOTS.has(root)) return root;
  }
  return k;
}
