/**
 * Strategy builder instrument options — aligned with chart `INSTRUMENT_REGISTRY`
 * (chart v1.4 `market-calculations.js`): forex pairs + futures.
 */

export const FOREX_INSTRUMENTS = [
  { id: 'EURUSD', label: 'EUR/USD' },
  { id: 'GBPUSD', label: 'GBP/USD' },
  { id: 'AUDUSD', label: 'AUD/USD' },
  { id: 'NZDUSD', label: 'NZD/USD' },
  { id: 'XAUUSD', label: 'XAU/USD' },
  { id: 'XAGUSD', label: 'XAG/USD' },
  { id: 'XTIUSD', label: 'XTI/USD' },
  { id: 'XNGUSD', label: 'XNG/USD' },
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

/** Maps legacy coarse instrument ids to registry symbols. */
export const LEGACY_INSTRUMENT_MAP = {
  es: 'ES',
  nq: 'NQ',
  /** Old generic "Stocks" chip → default to a liquid pair until user re-selects. */
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
  [...FOREX_INSTRUMENTS, ...FUTURES_INSTRUMENTS].map((o) => [o.id, o.label])
);

/** Human-readable label for review / feed (falls back to raw id). */
export function formatInstrumentLabel(raw) {
  const id = normalizeInstrumentId(raw);
  if (!id) return '';
  return _INSTRUMENT_LABEL[id] || id;
}
