/**
 * Strategy builder instruments — aligned with chart `INSTRUMENT_REGISTRY`
 * (`chart v1.4/chart/modules/market-calculations.js`).
 *
 * Forex row: **currency pairs only** (what the dataset/registry treats as FX crosses).
 * Commodities: metals & energy symbols that are stored as forex-type specs in the registry.
 * Futures: CME/CBOT/COMEX/NYMEX from the same registry.
 */

/** Currency pairs only (registry forex block, excluding XAU/XAG/XTI/XNG). */
export const FOREX_INSTRUMENTS = [
  { id: 'EURUSD', label: 'EUR/USD' },
  { id: 'GBPUSD', label: 'GBP/USD' },
  { id: 'AUDUSD', label: 'AUD/USD' },
  { id: 'NZDUSD', label: 'NZD/USD' },
  { id: 'USDJPY', label: 'USD/JPY' },
  { id: 'USDCAD', label: 'USD/CAD' },
  { id: 'USDCHF', label: 'USD/CHF' },
  { id: 'USDCNH', label: 'USD/CNH' },
  { id: 'USDHKD', label: 'USD/HKD' },
  { id: 'EURJPY', label: 'EUR/JPY' },
  { id: 'GBPJPY', label: 'GBP/JPY' },
  { id: 'AUDJPY', label: 'AUD/JPY' },
  { id: 'NZDJPY', label: 'NZD/JPY' },
  { id: 'CADJPY', label: 'CAD/JPY' },
  { id: 'CHFJPY', label: 'CHF/JPY' },
  { id: 'EURGBP', label: 'EUR/GBP' },
  { id: 'EURCHF', label: 'EUR/CHF' },
  { id: 'EURCAD', label: 'EUR/CAD' },
  { id: 'EURAUD', label: 'EUR/AUD' },
  { id: 'GBPCHF', label: 'GBP/CHF' },
  { id: 'GBPCAD', label: 'GBP/CAD' },
  { id: 'GBPAUD', label: 'GBP/AUD' },
  { id: 'AUDCAD', label: 'AUD/CAD' },
  { id: 'AUDCHF', label: 'AUD/CHF' },
  { id: 'AUDNZD', label: 'AUD/NZD' },
  { id: 'CADCHF', label: 'CAD/CHF' },
  { id: 'NZDCAD', label: 'NZD/CAD' },
  { id: 'NZDCHF', label: 'NZD/CHF' },
];

/** Metals & energy in registry (forex-type specs; not currency pairs). */
export const COMMODITY_CFD_INSTRUMENTS = [
  { id: 'XAUUSD', label: 'XAU/USD' },
  { id: 'XAGUSD', label: 'XAG/USD' },
  { id: 'XTIUSD', label: 'XTI/USD' },
  { id: 'XNGUSD', label: 'XNG/USD' },
];

/** CME / CBOT / COMEX / NYMEX futures from registry (compact ticker labels). */
export const FUTURES_INSTRUMENTS = [
  { id: 'ES', label: 'ES' },
  { id: 'MES', label: 'MES' },
  { id: 'NQ', label: 'NQ' },
  { id: 'MNQ', label: 'MNQ' },
  { id: 'YM', label: 'YM' },
  { id: 'MYM', label: 'MYM' },
  { id: 'RTY', label: 'RTY' },
  { id: 'M2K', label: 'M2K' },
  { id: '6E', label: '6E' },
  { id: '6B', label: '6B' },
  { id: '6J', label: '6J' },
  { id: '6A', label: '6A' },
  { id: '6C', label: '6C' },
  { id: '6S', label: '6S' },
  { id: 'CL', label: 'CL' },
  { id: 'MCL', label: 'MCL' },
  { id: 'RB', label: 'RB' },
  { id: 'NG', label: 'NG' },
  { id: 'GC', label: 'GC' },
  { id: 'MGC', label: 'MGC' },
  { id: 'SI', label: 'SI' },
  { id: 'HG', label: 'HG' },
  { id: 'PL', label: 'PL' },
  { id: 'ZB', label: 'ZB' },
  { id: 'ZN', label: 'ZN' },
  { id: 'ZF', label: 'ZF' },
  { id: 'ZT', label: 'ZT' },
  { id: 'ZC', label: 'ZC' },
  { id: 'ZW', label: 'ZW' },
  { id: 'ZS', label: 'ZS' },
];

/** Crypto (registry `type: crypto`) — linear USDT, spot USD, inverse. */
export const CRYPTO_INSTRUMENTS = [
  { id: 'BTCUSDT', label: 'BTC/USDT' },
  { id: 'ETHUSDT', label: 'ETH/USDT' },
  { id: 'SOLUSDT', label: 'SOL/USDT' },
  { id: 'BNBUSDT', label: 'BNB/USDT' },
  { id: 'XRPUSDT', label: 'XRP/USDT' },
  { id: 'ADAUSDT', label: 'ADA/USDT' },
  { id: 'DOGEUSDT', label: 'DOGE/USDT' },
  { id: 'LTCUSDT', label: 'LTC/USDT' },
  { id: 'LINKUSDT', label: 'LINK/USDT' },
  { id: 'DOTUSDT', label: 'DOT/USDT' },
  { id: 'AVAXUSDT', label: 'AVAX/USDT' },
  { id: 'MATICUSDT', label: 'MATIC/USDT' },
  { id: 'BTCUSD', label: 'BTC/USD' },
  { id: 'ETHUSD', label: 'ETH/USD' },
  { id: 'SOLUSD', label: 'SOL/USD' },
  { id: 'XBTUSD', label: 'XBT/USD' },
  { id: 'ETHUSD_I', label: 'ETH/USD (inv.)' },
];

/** High-level market buckets (General Info). */
export const MARKET_CATEGORY_OPTIONS = [
  { id: 'forex', label: 'Forex' },
  { id: 'futures', label: 'Futures' },
  { id: 'crypto', label: 'Crypto' },
];

const VALID_MARKET_CATEGORY = new Set(['forex', 'futures', 'crypto']);

export function normalizeMarketCategories(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const x of raw) {
    const id = String(x).toLowerCase();
    if (!VALID_MARKET_CATEGORY.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function formatMarketCategoriesLine(cats) {
  const n = normalizeMarketCategories(cats);
  if (!n.length) return '';
  const labels = { forex: 'Forex', futures: 'Futures', crypto: 'Crypto' };
  return n.map((id) => labels[id] || id).join(', ');
}

/** Maps legacy coarse instrument ids to registry symbols. */
export const LEGACY_INSTRUMENT_MAP = {
  es: 'ES',
  nq: 'NQ',
  stocks: 'EURUSD',
  forex: 'EURUSD',
};

export function normalizeInstrumentId(raw) {
  if (raw == null || raw === '') return '';
  const s = String(raw);
  if (LEGACY_INSTRUMENT_MAP[s]) return LEGACY_INSTRUMENT_MAP[s];
  return s;
}

const _INSTRUMENT_LABEL = Object.fromEntries(
  [...FOREX_INSTRUMENTS, ...COMMODITY_CFD_INSTRUMENTS, ...FUTURES_INSTRUMENTS, ...CRYPTO_INSTRUMENTS].map((o) => [
    o.id,
    o.label,
  ])
);

/** Human-readable label for review / feed (falls back to raw id). */
export function formatInstrumentLabel(raw) {
  const id = normalizeInstrumentId(raw);
  if (!id) return '';
  return _INSTRUMENT_LABEL[id] || id;
}

/**
 * Build a deduped list of registry ids from `instruments[]` and optional legacy `instrument` string.
 */
export function normalizeInstrumentList(rawList, legacySingle) {
  const out = [];
  const seen = new Set();
  const push = (raw) => {
    const n = normalizeInstrumentId(raw);
    if (!n || seen.has(n)) return;
    seen.add(n);
    out.push(n);
  };
  if (Array.isArray(rawList)) {
    rawList.forEach(push);
  }
  if (legacySingle != null && legacySingle !== '') {
    push(legacySingle);
  }
  return out;
}

/** Comma-separated labels from draft (`instruments` + legacy `instrument`). */
export function formatInstrumentsLine(draft) {
  if (!draft || typeof draft !== 'object') return '';
  const ids = normalizeInstrumentList(draft.instruments, draft.instrument);
  if (!ids.length) return '';
  return ids.map((id) => formatInstrumentLabel(id)).join(', ');
}

/** Strategy definition blob (API): instruments array + legacy instrument field. */
export function formatInstrumentsSummaryFromDef(def) {
  if (!def || typeof def !== 'object') return '';
  const ids = normalizeInstrumentList(def.instruments, def.instrument);
  if (!ids.length) return '';
  return ids.map((id) => formatInstrumentLabel(id)).join(' · ');
}

/** Markets (forex/futures/crypto) + optional specific symbols for feed / list subtitles. */
export function formatMarketsAndInstrumentsSummary(def) {
  if (!def || typeof def !== 'object') return '';
  const parts = [];
  const mc = formatMarketCategoriesLine(def.market_categories);
  if (mc) parts.push(mc);
  const syms = formatInstrumentsSummaryFromDef(def);
  if (syms) parts.push(syms);
  return parts.join(' · ');
}
