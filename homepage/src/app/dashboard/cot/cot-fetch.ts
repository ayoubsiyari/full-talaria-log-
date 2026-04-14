import type { CotInstrumentDef } from "./cot-instruments";
import { inferLegacyGroup } from "./cot-instruments";

const CFTC_BASE = "https://publicreporting.cftc.gov/resource/jun7-fc8e.json";

export type CftcRow = {
  cftc_contract_market_code?: string;
  report_date_as_yyyy_mm_dd?: string;
  market_and_exchange_names?: string;
  contract_market_name?: string;
  commodity_name?: string;
  commodity?: string;
  commodity_group_name?: string;
  commodity_subgroup_name?: string;
  open_interest_all?: string;
  noncomm_positions_long_all?: string;
  noncomm_positions_short_all?: string;
  comm_positions_long_all?: string;
  comm_positions_short_all?: string;
  nonrept_positions_long_all?: string;
  nonrept_positions_short_all?: string;
  change_in_open_interest_all?: string;
  change_in_noncomm_long_all?: string;
  change_in_noncomm_short_all?: string;
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

function escapeSoqlString(s: string): string {
  return String(s).replace(/'/g, "''");
}

/** Latest report timestamp as returned by the API (for $where clauses). */
export async function fetchLatestReportDateRaw(): Promise<string> {
  const url = `${CFTC_BASE}?$select=report_date_as_yyyy_mm_dd&$order=report_date_as_yyyy_mm_dd DESC&$limit=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CFTC HTTP ${res.status}`);
  const rows = (await res.json()) as { report_date_as_yyyy_mm_dd?: string }[];
  const d = rows[0]?.report_date_as_yyyy_mm_dd;
  if (!d) throw new Error("No report date from CFTC");
  return String(d);
}

/** YYYY-MM-DD for display. */
export function reportDateDisplay(raw: string): string {
  return raw.slice(0, 10);
}

/** All Legacy Combined rows for a single report (one row per contract market). */
export async function fetchRowsForReportDate(
  reportDateRaw: string
): Promise<CftcRow[]> {
  const safe = escapeSoqlString(reportDateRaw);
  const where = `report_date_as_yyyy_mm_dd='${safe}'`;
  const url =
    `${CFTC_BASE}?$where=${encodeURIComponent(where)}` +
    `&$order=${encodeURIComponent("cftc_contract_market_code ASC")}` +
    `&$limit=50000`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CFTC HTTP ${res.status}`);
  const rows = (await res.json()) as CftcRow[];
  return Array.isArray(rows) ? rows : [];
}

export function rowToDef(r: CftcRow): CotInstrumentDef | null {
  const code = String(r.cftc_contract_market_code || "").trim();
  if (!code) return null;
  const longName =
    String(r.contract_market_name || "").trim() ||
    String(r.market_and_exchange_names || "").trim() ||
    code;
  const sym =
    longName.length > 48 ? `${longName.slice(0, 46)}…` : longName;
  const cg = r.commodity_group_name ?? null;
  const cs = r.commodity_subgroup_name ?? null;
  const cn =
    r.commodity_name ?? r.commodity ?? null;
  return {
    sym,
    cftc_contract_market_code: code,
    code,
    group: inferLegacyGroup(cg, cs),
    commodityGroup: cg,
    commoditySubgroup: cs,
    commodityName: cn,
  };
}

/** ASC by report date (oldest first). */
export async function fetchCotHistory(
  code: string,
  limit = 200
): Promise<CftcRow[]> {
  const safe = escapeSoqlString(String(code));
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

async function runWithConcurrency(
  tasks: (() => Promise<void>)[],
  limit: number
): Promise<void> {
  let ix = 0;
  const runWorker = async () => {
    for (;;) {
      const i = ix++;
      if (i >= tasks.length) return;
      await tasks[i]();
    }
  };
  const n = Math.max(1, Math.min(limit, tasks.length));
  await Promise.all(Array.from({ length: n }, () => runWorker()));
}

export type LoadCotProgress = { phase: "catalog" | "history"; done: number; total: number };

/**
 * Full universe: latest report’s markets, each with weekly history for percentiles and charts.
 */
export async function loadFullUniverseSnapshots(
  historyLimit = 220,
  concurrency = 14,
  onProgress?: (p: LoadCotProgress) => void
): Promise<CotSnapshot[]> {
  onProgress?.({ phase: "catalog", done: 0, total: 1 });
  const rawDate = await fetchLatestReportDateRaw();
  const latestRows = await fetchRowsForReportDate(rawDate);
  const defs = latestRows
    .map(rowToDef)
    .filter((d): d is CotInstrumentDef => d != null);
  const total = defs.length;
  if (!total) return [];

  const snapshots: (CotSnapshot | null)[] = new Array(total);
  let done = 0;
  const tasks = defs.map((def, i) => async () => {
    try {
      const rows = await fetchCotHistory(def.code, historyLimit);
      snapshots[i] = buildSnapshot(def, rows);
    } catch {
      snapshots[i] = null;
    }
    done++;
    onProgress?.({ phase: "history", done, total });
  });

  await runWithConcurrency(tasks, concurrency);
  return snapshots.filter((x): x is CotSnapshot => x != null);
}

/** @deprecated Use loadFullUniverseSnapshots */
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
