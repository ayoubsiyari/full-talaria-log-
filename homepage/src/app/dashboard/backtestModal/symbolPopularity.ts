/** Normalized symbol key (no slashes/spaces). */
export function normSymbolKey(sym: string): string {
  return String(sym || "").replace(/[\/\s_.-]/g, "").toUpperCase();
}

/**
 * Broad popularity order: majors → liquid crosses → exotics → futures → crypto → stocks.
 * Unknown symbols sort after known ones, then A–Z.
 */
const POPULAR_SYMBOL_ORDER: string[] = [
  // Forex majors
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD",
  // Metals (often traded like FX)
  "XAUUSD", "XAGUSD",
  // Liquid G10 crosses
  "EURGBP", "EURJPY", "GBPJPY", "AUDJPY", "EURAUD", "EURCHF", "EURNZD",
  "GBPAUD", "GBPCAD", "GBPCHF", "GBPNZD", "AUDCAD", "AUDCHF", "AUDNZD",
  "NZDJPY", "NZDCAD", "NZDCHF", "CADJPY", "CADCHF", "CHFJPY",
  // USD exotics & EM
  "USDSEK", "USDNOK", "USDDKK", "USDMXN", "USDZAR", "USDTRY", "USDPLN",
  "USDHUF", "USDCZK", "USDSGD", "USDHKD", "USDILS", "USDTHB", "USDCNH",
  "USDINR", "USDKRW", "USDPHP", "USDMYR", "USDIDR", "USDBRL", "USDCLP",
  // Other crosses
  "EURSEK", "EURNOK", "EURPLN", "EURTRY", "EURHUF", "GBPSEK", "GBPNOK",
  "EURMXN", "GBPMXN", "AUDSGD", "NZDSGD",
  // Index / energy / metal futures
  "ES", "NQ", "YM", "RTY", "CL", "GC", "SI", "NG", "MNQ", "MES", "MYM",
  "M2K", "MGC", "MCL", "ZB", "ZN",
  // Crypto
  "BTCUSD", "BTCUSDT", "ETHUSD", "ETHUSDT", "BNBUSD", "SOLUSD", "XRPUSD",
  "ADAUSD", "DOGEUSD", "AVAXUSD", "DOTUSD", "LINKUSD",
  // Large-cap stocks
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOG", "GOOGL", "META", "TSLA",
  "BRK.B", "JPM", "V", "UNH", "XOM", "LLY",
];

const POPULAR_RANK = new Map(POPULAR_SYMBOL_ORDER.map((sym, i) => [sym, i]));

export function symbolPopularityRank(sym: string): number {
  return POPULAR_RANK.get(normSymbolKey(sym)) ?? 9999;
}

export function compareSymbolsByPopularity(
  a: { sym: string },
  b: { sym: string },
): number {
  const diff = symbolPopularityRank(a.sym) - symbolPopularityRank(b.sym);
  if (diff !== 0) return diff;
  return a.sym.localeCompare(b.sym);
}
