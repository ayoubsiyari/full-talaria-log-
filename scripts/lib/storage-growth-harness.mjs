/**
 * Hermetic storage growth sim for STORAGE-GROWTH-CENSUS-V1.
 * Simulates open → replay → N sessions without product chart.js.
 */

import {
  REPLAY_CACHE_NAME,
  SESSION_DB_NAME,
  SESSION_STORE_NAME,
  snapshotStorage,
  growthPerSession,
} from './storage-growth-census.mjs';

/**
 * In-memory IndexedDB + localStorage + Cache stand-in for Node hermetic tests.
 */
export function createHermeticStorageGlobal() {
  const lsMap = new Map();
  const idbState = {
    databases: [
      {
        name: SESSION_DB_NAME,
        stores: [{ name: SESSION_STORE_NAME, records: new Map() }],
      },
      {
        name: 'talaria_journal_snapshots',
        stores: [{ name: 'snapshots', records: new Map() }],
      },
    ],
  };
  const cacheState = new Map();

  const localStorage = {
    get length() {
      return lsMap.size;
    },
    key(i) {
      return [...lsMap.keys()][i] ?? null;
    },
    getItem(k) {
      return lsMap.has(k) ? lsMap.get(k) : null;
    },
    setItem(k, v) {
      lsMap.set(String(k), String(v));
    },
    removeItem(k) {
      lsMap.delete(k);
    },
    clear() {
      lsMap.clear();
    },
  };

  const indexedDB = {
    __talariaStorageCensusSnapshot() {
      const databases = idbState.databases.map((db) => ({
        name: db.name,
        stores: db.stores.map((store) => {
          let approxBytes = 0;
          for (const [key, val] of store.records) {
            approxBytes += String(key).length + String(val).length;
          }
          return {
            name: store.name,
            count: store.records.size,
            approxBytes,
          };
        }),
      }));
      const sessionStore = idbState.databases[0].stores[0].records;
      const ids = [...sessionStore.keys()]
        .map((k) => Number(k))
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
      return {
        databases,
        sessionRecords: { count: sessionStore.size, idsSample: ids.slice(0, 8) },
      };
    },
  };

  const caches = {
    __talariaStorageCensusSnapshot() {
      const out = [];
      for (const [name, entries] of cacheState) {
        let approxBytes = 0;
        for (const body of entries.values()) {
          approxBytes += body.length;
        }
        out.push({ name, entries: entries.size, approxBytes });
      }
      return out;
    },
    async open(name) {
      if (!cacheState.has(name)) cacheState.set(name, new Map());
      const bucket = cacheState.get(name);
      return {
        async put(_req, body) {
          const key = typeof _req === 'string' ? _req : _req.url || String(_req);
          bucket.set(key, String(body));
        },
        async keys() {
          return [...bucket.keys()].map((k) => ({ url: k }));
        },
        async match(req) {
          const key = typeof req === 'string' ? req : req.url;
          const text = bucket.get(key);
          if (text == null) return undefined;
          return {
            async clone() {
              return this;
            },
            async arrayBuffer() {
              return new TextEncoder().encode(text).buffer;
            },
          };
        },
      };
    },
    async keys() {
      return [...cacheState.keys()];
    },
  };

  return { localStorage, indexedDB, caches, __idbState: idbState, __cacheState: cacheState, __lsMap: lsMap };
}

/**
 * @param {ReturnType<typeof createHermeticStorageGlobal>} global
 * @param {number} sessionId
 * @param {{ payloadBytes?: number }} [opts]
 */
export function simulateSessionOpen(global, sessionId, opts = {}) {
  const payloadBytes = opts.payloadBytes ?? 2048;
  const sessionStore = global.__idbState.databases[0].stores[0].records;
  const payload = 'x'.repeat(payloadBytes);
  sessionStore.set(String(sessionId), JSON.stringify({ id: sessionId, payload, openedAt: Date.now() }));

  global.localStorage.setItem(`talaria.session.${sessionId}.meta`, JSON.stringify({ id: sessionId }));
  global.localStorage.setItem(
    `talaria.session.${sessionId}.prefs`,
    JSON.stringify({ theme: 'dark', payload: 'p'.repeat(Math.min(512, payloadBytes / 4)) }),
  );

  const snapStore = global.__idbState.databases[1].stores[0].records;
  snapStore.set(`session-${sessionId}-open`, payload.slice(0, 256));
}

/**
 * @param {ReturnType<typeof createHermeticStorageGlobal>} global
 * @param {number} sessionId
 */
export async function simulateReplay(global, sessionId) {
  const cache = await global.caches.open(REPLAY_CACHE_NAME);
  const chunk = 'r'.repeat(1024);
  await cache.put(
    `https://fixture/replay/${sessionId}/chunk-0`,
    chunk,
  );
  await cache.put(
    `https://fixture/replay/${sessionId}/chunk-1`,
    chunk,
  );
  global.localStorage.setItem(
    `talaria.replay.${sessionId}.cursor`,
    JSON.stringify({ barIndex: 120, sessionId }),
  );
}

/**
 * @param {number} startId
 * @param {number} count
 * @param {{ boundedRetention?: boolean, maxRetainedSessions?: number }} [options]
 */
export async function runHermeticStorageGrowthLadder(startId, count, options = {}) {
  const boundedRetention = options.boundedRetention !== false;
  const maxRetained = options.maxRetainedSessions ?? 8;
  const global = createHermeticStorageGlobal();
  const samples = [];

  samples.push({ label: 'session-open-baseline', snap: await snapshotStorage(global) });

  const firstId = startId;
  simulateSessionOpen(global, firstId);
  samples.push({ label: `after-session-open-${firstId}`, snap: await snapshotStorage(global) });

  await simulateReplay(global, firstId);
  samples.push({ label: `after-replay-${firstId}`, snap: await snapshotStorage(global) });

  for (let i = 1; i < count; i += 1) {
    const sessionId = startId + i;
    simulateSessionOpen(global, sessionId, { payloadBytes: 1800 + i * 64 });
    if (boundedRetention && global.__idbState.databases[0].stores[0].records.size > maxRetained) {
      const keys = [...global.__idbState.databases[0].stores[0].records.keys()]
        .map(Number)
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
      while (keys.length > maxRetained) {
        const evict = keys.shift();
        global.__idbState.databases[0].stores[0].records.delete(String(evict));
        global.localStorage.removeItem(`talaria.session.${evict}.meta`);
        global.localStorage.removeItem(`talaria.session.${evict}.prefs`);
        global.localStorage.removeItem(`talaria.replay.${evict}.cursor`);
      }
    }
    await simulateReplay(global, sessionId);
    samples.push({
      label: `after-session-${sessionId}`,
      snap: await snapshotStorage(global),
    });
  }

  const report = growthPerSession(samples);
  return { global, samples, report, boundedRetention };
}

/**
 * Unbounded retention mutation — never evicts; used by NC-STORAGE-UNBOUNDED-MUTATION.
 */
export async function runHermeticUnboundedStorageMutation(startId = 882, sessionCount = 12) {
  return runHermeticStorageGrowthLadder(startId, sessionCount, {
    boundedRetention: false,
    maxRetainedSessions: 999,
  });
}

export async function runHermeticBoundedStorageCycle(startId = 882, sessionCount = 5) {
  return runHermeticStorageGrowthLadder(startId, sessionCount, {
    boundedRetention: true,
    maxRetainedSessions: 8,
  });
}
