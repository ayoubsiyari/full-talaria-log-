import type { CotInstrumentDef } from "./cot-instruments";

const CFTC_BASE = "https://publicreporting.cftc.gov/resource/jun7-fc8e.json";

export type CftcRow = {
  cftc_contract_market_code?: string;
  report_date_as_yyyy_mm_dd?: string;
  market_and_exchange_names?: string;
  open_interest_all?: string;
  noncomm_positions_long_all?: string;
  noncomm_positions_short_all?: string;
  comm_positions_long_all?: string;
  comm_positions_short_all?: string;
  nonrept_positions_long_all?: string;
  nonrept_positions_short_all?: string;
  change_in_open_interest_all?: string;
};

export function parseIntField(s: string | undefined): number {
  if (s == null || s === "") return NaN;
  const n = parseInt(String(s).replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : NaN;
}

export function rowNetNonComm(r: CftcRow): number {
  const L = parseIntField(r.noncomm_positions_long_all);
  const S = parseIntField(r.noncomm_positions_short_all);
  if (!Number.isFinite(L) || !Number.isFinite(S)) return NaN;
  return L - S;
}

export function rowNetComm(r: CftcRow): number {
  const L = parseIntField(r.comm_positions_long_all);
  const S = parseIntField(r.comm_positions_short_all);
  if (!Number.isFinite(L) || !Number.isFinite(S)) return NaN;
  return L - S;
}

export function rowSmallSpecNet(r: CftcRow): number {
  const L = parseIntField(r.nonrept_positions_long_all);
  const S = parseIntField(r.nonrept_positions_short_all);
  if (!Number.isFinite(L) || !Number.isFinite(S)) return NaN;
  return L - S;
}

/** ASC by report date (oldest first). */
export async function fetchCotHistory(code: string, limit = 200): Promise<CftcRow[]> {
  const safe = String(code).replace(/'/g, "''");
  const where = `cftc_contract_market_code='${safe}'`;
  const url =
    `${CFTC_BASE}?$where=${encodeURIComponent(where)}` +
    `&$order=${encodeURIComponent("report_date_as_yyyy_mm_dd DESC")}` +
    `&$limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CFTC HTTP ${res.status}`);
  const rows = (await res.json()) as CftcRow[];
  if (!Array.isArray(rows)) return [];
  return rows.slice().reverse();
}

export type CotSnapshot = {
  def: CotInstrumentDef;
  marketName: string;
  reportDate: string;
  oi: number;
  noncommLong: number;
  noncommShort: number;
  commLong: number;
  commShort: number;
  netNonComm: number;
  netComm: number;
  smallNet: number;
  wkNetDelta: number;
  wkOiDeltaPct: number;
  /** last N weekly deltas of net non-comm (contracts), oldest first */
  netDeltaSeries: number[];
  /** net non-comm history for sparkline (same order as fetch, ASC) */
  netHistory: number[];
  /** full weekly net series (ASC) for range views */
  netHistoryFull: number[];
  crossedZero: boolean;
  percentile3y: number | null;
  low3y: number;
  high3y: number;
};

function percentileRank(value: number, sortedAsc: number[]): number | null {
  if (!sortedAsc.length || !Number.isFinite(value)) return null;
  let le = 0;
  for (let i = 0; i < sortedAsc.length; i++) {
    if (sortedAsc[i] <= value) le++;
  }
  return Math.round((le / sortedAsc.length) * 100);
}

export function buildSnapshot(def: CotInstrumentDef, rows: CftcRow[]): CotSnapshot | null {
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  const oi = parseIntField(last.open_interest_all);
  const ncl = parseIntField(last.noncomm_positions_long_all);
  const ncs = parseIntField(last.noncomm_positions_short_all);
  const commL = parseIntField(last.comm_positions_long_all);
  const commS = parseIntField(last.comm_positions_short_all);
  const netNonComm = rowNetNonComm(last);
  const netComm = rowNetComm(last);
  const smallNet = rowSmallSpecNet(last);
  if (!Number.isFinite(netNonComm) || !Number.isFinite(oi)) return null;

  const prev = rows.length > 1 ? rows[rows.length - 2] : null;
  const prevNet = prev ? rowNetNonComm(prev) : NaN;
  const wkNetDelta = Number.isFinite(prevNet) ? netNonComm - prevNet : 0;
  const prevNetForFlip = netNonComm - wkNetDelta;
  const crossedZero =
    Number.isFinite(prevNetForFlip) &&
    prevNetForFlip !== 0 &&
    netNonComm !== 0 &&
    (prevNetForFlip > 0) !== (netNonComm > 0);

  const prevOi = prev ? parseIntField(prev.open_interest_all) : NaN;
  let wkOiDeltaPct = 0;
  if (Number.isFinite(prevOi) && prevOi !== 0) {
    wkOiDeltaPct = ((oi - prevOi) / prevOi) * 100;
  }

  const nets = rows.map(rowNetNonComm).filter((n) => Number.isFinite(n)) as number[];
  const sorted = nets.slice().sort((a, b) => a - b);
  const low3y = sorted.length ? sorted[0] : netNonComm;
  const high3y = sorted.length ? sorted[sorted.length - 1] : netNonComm;
  const percentile3y = percentileRank(netNonComm, sorted);

  const netDeltaSeries: number[] = [];
  for (let i = Math.max(1, nets.length - 6); i < nets.length; i++) {
    netDeltaSeries.push(nets[i] - nets[i - 1]);
  }

  const reportDate = String(last.report_date_as_yyyy_mm_dd || "").slice(0, 10);
  const marketName = String(last.market_and_exchange_names || def.sym);

  return {
    def,
    marketName,
    reportDate,
    oi,
    noncommLong: ncl,
    noncommShort: ncs,
    commLong: commL,
    commShort: commS,
    netNonComm,
    netComm,
    smallNet,
    wkNetDelta,
    wkOiDeltaPct,
    netDeltaSeries,
    netHistory: nets.slice(-13),
    netHistoryFull: nets,
    crossedZero,
    percentile3y,
    low3y,
    high3y,
  };
}

export async function loadAllSnapshots(
  defs: CotInstrumentDef[],
  historyLimit = 200
): Promise<CotSnapshot[]> {
  const results = await Promise.all(
    defs.map(async (def) => {
      try {
        const rows = await fetchCotHistory(def.code, historyLimit);
        return buildSnapshot(def, rows);
      } catch {
        return null;
      }
    })
  );
  return results.filter((x): x is CotSnapshot => x != null);
}
