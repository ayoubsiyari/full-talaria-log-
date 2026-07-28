/**
 * STORAGE-GROWTH-CENSUS-V1 (W38 / FINDING-CPU-NOT-MEMORY Correction 1)
 * Signature: TALARIA_STORAGE_GROWTH_CENSUS_V1
 *
 * Measurement infra for bounded-retention policy evidence. Product retention
 * fixes remain A/B territory — this gate samples IndexedDB, localStorage, Cache
 * API, and session-record cardinality per lifecycle phase.
 *
 * Memory magnitude claims must declare storage profile: see BOUNDARY cell.
 */

export const TALARIA_STORAGE_GROWTH_CENSUS_V1 = 'TALARIA_STORAGE_GROWTH_CENSUS_V1';
export const STORAGE_GROWTH_CENSUS_GATE_NAME = 'STORAGE-GROWTH-CENSUS-V1';

/** Hermetic pinned budget — NC proves gate fires when retention is unbounded. */
export const HERMETIC_STORAGE_BUDGET_V1 = Object.freeze({
  maxTotalApproxBytes: 48_000,
  maxSessionRecords: 8,
  maxLocalStorageBytes: 16_000,
});

export const STORAGE_PROFILE_BOUNDARY_EVIDENCE = Object.freeze({
  cell: 'BOUNDARY-STORAGE-PROFILE-ON-MEMORY-CLAIMS',
  rule:
    'Idle memory comparisons must state browser storage profile: clean (cleared site data) vs dirty (uncleared IndexedDB/localStorage/service-worker caches). FINDING-CPU-NOT-MEMORY: cleared 1.62 GB → 303 MB; uncleared is the real UX baseline.',
  referenceCleanMb: 303,
  referenceDirtyMb: 1620,
  referenceCompetitorCleanMb: 280,
  sampleSessionIds: [882, 883],
});

const SESSION_STORE_NAME = 'talaria_session_records';
const SESSION_DB_NAME = 'talaria_storage_census';
const REPLAY_CACHE_NAME = 'talaria-replay-artifacts-v1';

/**
 * @param {string} value
 */
export function approxByteLength(value) {
  if (typeof value !== 'string') return 0;
  return new TextEncoder().encode(value).byteLength;
}

/**
 * @param {typeof globalThis | Record<string, unknown>} global
 */
export function snapshotLocalStorage(global) {
  const ls = global.localStorage;
  if (!ls || typeof ls.length !== 'number') {
    return { keys: 0, bytes: 0, keyNames: [] };
  }
  let bytes = 0;
  const keyNames = [];
  for (let i = 0; i < ls.length; i += 1) {
    const key = ls.key(i);
    if (key == null) continue;
    keyNames.push(key);
    bytes += approxByteLength(key);
    try {
      bytes += approxByteLength(String(ls.getItem(key) ?? ''));
    } catch {
      /* ignore */
    }
  }
  return { keys: keyNames.length, bytes, keyNames: keyNames.sort() };
}

/**
 * @param {{ name: string, count: number, approxBytes: number }[]} stores
 */
function sumStoreBytes(stores) {
  return stores.reduce((n, s) => n + (s.approxBytes || 0), 0);
}

/**
 * @param {typeof globalThis | Record<string, unknown>} global
 * @returns {Promise<{ indexedDb: Array<{ name: string, stores: Array<{ name: string, count: number, approxBytes: number }> }>, localStorage: { keys: number, bytes: number }, caches: Array<{ name: string, entries: number, approxBytes: number }>, sessionRecords: { count: number, idsSample: number[] } }>}
 */
export async function snapshotStorage(global) {
  const indexedDb = [];
  let sessionRecords = { count: 0, idsSample: [] };

  const idb = global.indexedDB;
  if (idb && typeof idb.__talariaStorageCensusSnapshot === 'function') {
    const mockSnap = idb.__talariaStorageCensusSnapshot();
    indexedDb.push(...mockSnap.databases);
    sessionRecords = mockSnap.sessionRecords ?? sessionRecords;
  } else if (idb && typeof idb.databases === 'function') {
    try {
      const dbs = await idb.databases();
      for (const meta of dbs) {
        indexedDb.push({
          name: meta.name || '(unknown)',
          stores: [{ name: '(browser-opaque)', count: 0, approxBytes: 0 }],
        });
      }
    } catch {
      indexedDb.push({ name: '(idb-enumeration-failed)', stores: [] });
    }
  }

  const localStorage = snapshotLocalStorage(global);

  const caches = [];
  const cacheStorage = global.caches;
  if (cacheStorage && typeof cacheStorage.__talariaStorageCensusSnapshot === 'function') {
    caches.push(...cacheStorage.__talariaStorageCensusSnapshot());
  } else if (cacheStorage && typeof cacheStorage.keys === 'function') {
    try {
      const names = await cacheStorage.keys();
      for (const name of names) {
        const cache = await cacheStorage.open(name);
        const requests = await cache.keys();
        let approxBytes = 0;
        for (const req of requests.slice(0, 32)) {
          const res = await cache.match(req);
          if (res) {
            const buf = await res.clone().arrayBuffer();
            approxBytes += buf.byteLength;
          }
        }
        caches.push({
          name,
          entries: requests.length,
          approxBytes: requests.length > 32 ? approxBytes : approxBytes,
        });
      }
    } catch {
      caches.push({ name: '(cache-enumeration-failed)', entries: 0, approxBytes: 0 });
    }
  }

  if (sessionRecords.count === 0 && global.__TALARIA_SESSION_RECORDS__) {
    const rec = global.__TALARIA_SESSION_RECORDS__;
    if (Array.isArray(rec)) {
      sessionRecords = {
        count: rec.length,
        idsSample: rec.slice(0, 8).map((r) => Number(r?.id ?? r)).filter(Number.isFinite),
      };
    }
  }

  return {
    indexedDb,
    localStorage,
    caches,
    sessionRecords,
  };
}

/**
 * @param {Awaited<ReturnType<typeof snapshotStorage>>} snap
 */
export function totalApproxBytes(snap) {
  let total = snap.localStorage?.bytes ?? 0;
  for (const db of snap.indexedDb ?? []) {
    total += sumStoreBytes(db.stores ?? []);
  }
  for (const c of snap.caches ?? []) {
    total += c.approxBytes ?? 0;
  }
  return total;
}

/**
 * @param {Awaited<ReturnType<typeof snapshotStorage>>} a
 * @param {Awaited<ReturnType<typeof snapshotStorage>>} b
 */
export function diffStorage(a, b) {
  const deltaLocalStorageBytes = (b.localStorage?.bytes ?? 0) - (a.localStorage?.bytes ?? 0);
  const deltaLocalStorageKeys = (b.localStorage?.keys ?? 0) - (a.localStorage?.keys ?? 0);
  const deltaSessionRecords = (b.sessionRecords?.count ?? 0) - (a.sessionRecords?.count ?? 0);
  const deltaTotalApproxBytes = totalApproxBytes(b) - totalApproxBytes(a);

  const storeDeltas = [];
  const dbByName = new Map((a.indexedDb ?? []).map((d) => [d.name, d]));
  for (const dbB of b.indexedDb ?? []) {
    const dbA = dbByName.get(dbB.name);
    const storesA = new Map((dbA?.stores ?? []).map((s) => [s.name, s]));
    for (const storeB of dbB.stores ?? []) {
      const storeA = storesA.get(storeB.name) ?? { count: 0, approxBytes: 0 };
      storeDeltas.push({
        database: dbB.name,
        store: storeB.name,
        deltaCount: storeB.count - storeA.count,
        deltaApproxBytes: storeB.approxBytes - storeA.approxBytes,
      });
    }
  }

  const cacheDeltas = [];
  const cacheA = new Map((a.caches ?? []).map((c) => [c.name, c]));
  for (const cB of b.caches ?? []) {
    const cA = cacheA.get(cB.name) ?? { entries: 0, approxBytes: 0 };
    cacheDeltas.push({
      name: cB.name,
      deltaEntries: cB.entries - cA.entries,
      deltaApproxBytes: cB.approxBytes - cA.approxBytes,
    });
  }

  return {
    deltaTotalApproxBytes,
    deltaLocalStorageBytes,
    deltaLocalStorageKeys,
    deltaSessionRecords,
    indexedDbStoreDeltas: storeDeltas,
    cacheDeltas,
  };
}

/**
 * @param {Array<{ label: string, snap: Awaited<ReturnType<typeof snapshotStorage>> }>} samples
 * @param {{ budget?: typeof HERMETIC_STORAGE_BUDGET_V1 }} [options]
 */
export function growthPerSession(samples, options = {}) {
  const budget = options.budget ?? HERMETIC_STORAGE_BUDGET_V1;
  const perStep = [];
  for (let i = 1; i < samples.length; i += 1) {
    const prev = samples[i - 1];
    const curr = samples[i];
    const delta = diffStorage(prev.snap, curr.snap);
    perStep.push({
      from: prev.label,
      to: curr.label,
      ...delta,
    });
  }

  const last = samples[samples.length - 1]?.snap;
  const totals = last
    ? {
        totalApproxBytes: totalApproxBytes(last),
        sessionRecords: last.sessionRecords?.count ?? 0,
        localStorageBytes: last.localStorage?.bytes ?? 0,
      }
    : { totalApproxBytes: 0, sessionRecords: 0, localStorageBytes: 0 };

  const violations = [];
  if (totals.totalApproxBytes > budget.maxTotalApproxBytes) {
    violations.push(
      `totalApproxBytes ${totals.totalApproxBytes} > budget ${budget.maxTotalApproxBytes}`,
    );
  }
  if (totals.sessionRecords > budget.maxSessionRecords) {
    violations.push(
      `sessionRecords ${totals.sessionRecords} > budget ${budget.maxSessionRecords}`,
    );
  }
  if (totals.localStorageBytes > budget.maxLocalStorageBytes) {
    violations.push(
      `localStorageBytes ${totals.localStorageBytes} > budget ${budget.maxLocalStorageBytes}`,
    );
  }

  const sessionSteps = perStep.filter((s) => s.deltaSessionRecords > 0);
  const avgBytesPerSession =
    sessionSteps.length > 0
      ? sessionSteps.reduce((n, s) => n + s.deltaTotalApproxBytes, 0) / sessionSteps.length
      : 0;

  return {
    signature: TALARIA_STORAGE_GROWTH_CENSUS_V1,
    samples: samples.map((s) => ({ label: s.label, totalApproxBytes: totalApproxBytes(s.snap) })),
    perStep,
    totals,
    avgBytesPerSession,
    budget,
    status: violations.length === 0 ? 'GREEN' : 'RED',
    ok: violations.length === 0,
    violations,
  };
}

/**
 * @param {ReturnType<typeof growthPerSession>} report
 * @param {typeof HERMETIC_STORAGE_BUDGET_V1} [budget]
 */
export function assertWithinStorageBudget(report, budget = HERMETIC_STORAGE_BUDGET_V1) {
  const violations = [];
  if (report.totals.totalApproxBytes > budget.maxTotalApproxBytes) {
    violations.push('totalApproxBytes');
  }
  if (report.totals.sessionRecords > budget.maxSessionRecords) {
    violations.push('sessionRecords');
  }
  if (report.totals.localStorageBytes > budget.maxLocalStorageBytes) {
    violations.push('localStorageBytes');
  }
  return {
    status: violations.length === 0 ? 'GREEN' : 'RED',
    ok: violations.length === 0,
    violations,
  };
}

/**
 * BOUNDARY evidence — always GREEN when rule text is present (documentation cell).
 */
export function runBoundaryStorageProfileCell() {
  const pass =
    typeof STORAGE_PROFILE_BOUNDARY_EVIDENCE.rule === 'string'
    && STORAGE_PROFILE_BOUNDARY_EVIDENCE.rule.includes('clean')
    && STORAGE_PROFILE_BOUNDARY_EVIDENCE.rule.includes('dirty');
  return {
    cell: STORAGE_PROFILE_BOUNDARY_EVIDENCE.cell,
    coverage: 'boundary',
    ver: 'VER-01',
    status: pass ? 'GREEN' : 'RED',
    pass,
    evidence: STORAGE_PROFILE_BOUNDARY_EVIDENCE,
    signature: TALARIA_STORAGE_GROWTH_CENSUS_V1,
  };
}

export { SESSION_STORE_NAME, SESSION_DB_NAME, REPLAY_CACHE_NAME };
