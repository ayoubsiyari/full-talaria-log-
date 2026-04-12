/**
 * Strategy builder instruments — aligned with chart `INSTRUMENT_REGISTRY`
 * (`chart v1.4/chart/modules/market-calculations.js`).
 */

export type InstrumentOption = { id: string; label: string };

export const FOREX_INSTRUMENTS: InstrumentOption[] = [
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

export const COMMODITY_CFD_INSTRUMENTS: InstrumentOption[] = [
  { id: 'XAUUSD', label: 'XAU/USD' },
  { id: 'XAGUSD', label: 'XAG/USD' },
  { id: 'XTIUSD', label: 'XTI/USD' },
  { id: 'XNGUSD', label: 'XNG/USD' },
];

export const FUTURES_INSTRUMENTS: InstrumentOption[] = [
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

const LEGACY_INSTRUMENT_MAP: Record<string, string> = {
  es: 'ES',
  nq: 'NQ',
  stocks: 'EURUSD',
  forex: 'EURUSD',
};

export function normalizeInstrumentId(raw: unknown): string {
  if (raw == null || raw === '') return '';
  const s = String(raw);
  if (LEGACY_INSTRUMENT_MAP[s]) return LEGACY_INSTRUMENT_MAP[s];
  return s;
}

const INSTRUMENT_LABEL: Record<string, string> = Object.fromEntries(
  [...FOREX_INSTRUMENTS, ...COMMODITY_CFD_INSTRUMENTS, ...FUTURES_INSTRUMENTS].map((o) => [o.id, o.label])
);

export function formatInstrumentLabel(raw: unknown): string {
  const id = normalizeInstrumentId(raw);
  if (!id) return '';
  return INSTRUMENT_LABEL[id] || id;
}

export function normalizeInstrumentList(rawList: unknown, legacySingle: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: unknown) => {
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

export function formatInstrumentsLine(draft: { instruments?: unknown; instrument?: unknown } | null | undefined): string {
  if (!draft || typeof draft !== 'object') return '';
  const ids = normalizeInstrumentList(draft.instruments, draft.instrument);
  if (!ids.length) return '';
  return ids.map((id) => formatInstrumentLabel(id)).join(', ');
}

export function formatInstrumentsSummaryFromDef(def: Record<string, unknown> | null | undefined): string {
  if (!def || typeof def !== 'object') return '';
  const ids = normalizeInstrumentList(def.instruments, def.instrument);
  if (!ids.length) return '';
  return ids.map((id) => formatInstrumentLabel(id)).join(' · ');
}
