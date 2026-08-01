/**
 * N4 — storage bytes at arm start, arm end, and post-refresh.
 *
 * Free: three reads, no workload, no perturbation. It answers a question none of my memory work has
 * touched, because every gauge so far has measured PROCESS memory. Storage is the part that survives a
 * refresh, so growth here is retention the user carries between sessions rather than within one — and
 * the post-refresh reading is the only one that can tell those apart.
 *
 * Read per realm. Quota is per origin, so the host and its iframes share one budget: a panel filling a
 * cache spends the host's allowance, and a per-realm read is what shows that.
 */

export async function readStorageCensus(page) {
  const frames = page.frames();
  const realms = [];
  for (const fr of frames) {
    try {
      const r = await fr.evaluate(async () => {
        const out = { url: location.href.slice(0, 100), isHost: window.top === window };
        try {
          if (navigator.storage?.estimate) {
            const e = await navigator.storage.estimate();
            out.usageBytes = e.usage ?? null;
            out.quotaBytes = e.quota ?? null;
            // Chrome breaks usage down by backend; this is where a cache blowout becomes attributable.
            out.usageDetails = e.usageDetails ? { ...e.usageDetails } : null;
          } else out.estimateUnsupported = true;
        } catch (err) { out.estimateError = String(err).slice(0, 80); }

        const sizeOf = (store) => {
          try {
            let n = 0;
            for (let i = 0; i < store.length; i++) {
              const k = store.key(i);
              n += (k?.length || 0) + (store.getItem(k)?.length || 0);
            }
            return n * 2; // UTF-16
          } catch { return null; }
        };
        out.localStorageBytes = sizeOf(localStorage);
        out.sessionStorageBytes = sizeOf(sessionStorage);
        out.localStorageKeys = (() => { try { return localStorage.length; } catch { return null; } })();

        try {
          if (window.caches?.keys) {
            const names = await caches.keys();
            out.cacheStorageNames = names.slice(0, 12);
            out.cacheStorageCount = names.length;
          }
        } catch (err) { out.cacheError = String(err).slice(0, 80); }

        try {
          if (indexedDB?.databases) {
            const dbs = await indexedDB.databases();
            out.indexedDbNames = dbs.map((d) => d.name).filter(Boolean).slice(0, 12);
            out.indexedDbCount = dbs.length;
          }
        } catch (err) { out.idbError = String(err).slice(0, 80); }

        return out;
      });
      realms.push(r);
    } catch { /* a frame can navigate mid-read */ }
  }

  const sum = (k) => realms.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const host = realms.find((r) => r.isHost) || realms[0] || {};
  return {
    at: new Date().toISOString(),
    realmCount: realms.length,
    // Quota is per ORIGIN, so summing usage across same-origin realms would multiply-count one number.
    // The host's reading is the origin's reading; per-realm detail is kept for attribution.
    originUsageBytes: host.usageBytes ?? null,
    originUsageMB: host.usageBytes != null ? +(host.usageBytes / 1048576).toFixed(2) : null,
    originQuotaMB: host.quotaBytes != null ? +(host.quotaBytes / 1048576).toFixed(0) : null,
    originUsageDetails: host.usageDetails ?? null,
    localStorageBytesAllRealms: sum('localStorageBytes'),
    sessionStorageBytesAllRealms: sum('sessionStorageBytes'),
    cacheStorageCount: host.cacheStorageCount ?? null,
    cacheStorageNames: host.cacheStorageNames ?? null,
    indexedDbCount: host.indexedDbCount ?? null,
    indexedDbNames: host.indexedDbNames ?? null,
    perRealm: realms,
  };
}

/** Diff two censuses so growth is stated rather than left for a reader to subtract. */
export function diffStorage(a, b, { labelA = 'start', labelB = 'end' } = {}) {
  if (!a || !b) return { ok: false, why: 'need two censuses' };
  const d = (x, y) => (x != null && y != null ? +(y - x).toFixed(2) : null);
  return {
    ok: true,
    from: labelA,
    to: labelB,
    originUsageDeltaMB: d(a.originUsageMB, b.originUsageMB),
    localStorageDeltaBytes: d(a.localStorageBytesAllRealms, b.localStorageBytesAllRealms),
    sessionStorageDeltaBytes: d(a.sessionStorageBytesAllRealms, b.sessionStorageBytesAllRealms),
    cacheCountDelta: d(a.cacheStorageCount, b.cacheStorageCount),
    indexedDbCountDelta: d(a.indexedDbCount, b.indexedDbCount),
  };
}
