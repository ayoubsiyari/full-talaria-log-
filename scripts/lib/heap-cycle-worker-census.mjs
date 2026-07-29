/**
 * HEAP-CYCLE worker attribution — Workers hold their own heap, invisible to
 * main-thread usedJSHeapSize. Wrap Worker construction across frames and
 * count live workers each cycle (create site + script URL).
 */

export const HEAP_CYCLE_WORKER_CENSUS_SIGNATURE = 'TALARIA_HEAP_CYCLE_WORKER_CENSUS_V1';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Install Worker wrapper in a window realm. Captures script URL + short stack.
 * Idempotent per window.
 */
export async function installWorkerCensusInFrame(frame) {
  if (!frame || typeof frame.evaluate !== 'function') return { ok: false, reason: 'no-frame' };
  return frame.evaluate(() => {
    const key = '__TALARIA_HEAP_CYCLE_WORKER_CENSUS__';
    if (window[key]?.installed) {
      return { ok: true, already: true, live: window[key].live.size };
    }
    const Original = window.Worker;
    if (typeof Original !== 'function') {
      return { ok: false, reason: 'Worker unavailable' };
    }
    const state = {
      installed: true,
      created: [],
      live: new Set(),
      terminated: 0,
    };
    function WrappedWorker(...args) {
      const scriptUrl = String(args[0] || '');
      const err = new Error('worker-create');
      const stack = String(err.stack || '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(1, 8);
      const worker = new Original(...args);
      const rec = {
        scriptUrl,
        stack,
        createdAt: Date.now(),
        terminated: false,
      };
      state.created.push(rec);
      state.live.add(worker);
      const origTerm = worker.terminate.bind(worker);
      worker.terminate = function wrappedTerminate(...tArgs) {
        if (!rec.terminated) {
          rec.terminated = true;
          state.terminated += 1;
          state.live.delete(worker);
        }
        return origTerm(...tArgs);
      };
      return worker;
    }
    WrappedWorker.prototype = Original.prototype;
    Object.defineProperty(WrappedWorker, 'name', { value: 'Worker' });
    WrappedWorker.__talariaHeapCycleWrapped = true;
    window.Worker = WrappedWorker;
    window[key] = state;
    return { ok: true, already: false, live: 0 };
  });
}

/**
 * Install on host + all same-origin iframes currently attached.
 */
export async function installWorkerCensusOnPage(page) {
  const frames = page.frames();
  const results = [];
  for (const frame of frames) {
    try {
      const row = await installWorkerCensusInFrame(frame);
      results.push({
        url: frame.url(),
        name: frame.name() || null,
        ...row,
      });
    } catch (error) {
      results.push({
        url: frame.url(),
        ok: false,
        reason: String(error?.message || error),
      });
    }
  }
  return results;
}

/**
 * Snapshot live + created workers across all frames.
 */
export async function snapshotWorkerCensus(page) {
  const frames = page.frames();
  const perFrame = [];
  let liveTotal = 0;
  let createdTotal = 0;
  let terminatedTotal = 0;
  const creations = [];
  for (const frame of frames) {
    try {
      const snap = await frame.evaluate(() => {
        const state = window.__TALARIA_HEAP_CYCLE_WORKER_CENSUS__;
        if (!state) return null;
        return {
          live: state.live.size,
          created: state.created.length,
          terminated: state.terminated,
          creations: state.created.map((c) => ({
            scriptUrl: c.scriptUrl,
            stackTop: (c.stack || [])[0] || null,
            stack: (c.stack || []).slice(0, 5),
            terminated: c.terminated === true,
            createdAt: c.createdAt,
          })),
        };
      });
      if (!snap) continue;
      liveTotal += snap.live;
      createdTotal += snap.created;
      terminatedTotal += snap.terminated;
      for (const c of snap.creations) {
        creations.push({
          frameUrl: frame.url(),
          frameName: frame.name() || null,
          ...c,
        });
      }
      perFrame.push({
        url: frame.url(),
        name: frame.name() || null,
        live: snap.live,
        created: snap.created,
        terminated: snap.terminated,
      });
    } catch (_) {
      /* detached frame */
    }
  }
  // Group by script URL for attribution.
  const byScript = new Map();
  for (const c of creations) {
    const key = c.scriptUrl || '(unknown)';
    const prev = byScript.get(key) || {
      scriptUrl: key,
      created: 0,
      live: 0,
      terminated: 0,
      stackTops: {},
    };
    prev.created += 1;
    if (c.terminated) prev.terminated += 1;
    else prev.live += 1;
    const top = c.stackTop || '(unknown)';
    prev.stackTops[top] = (prev.stackTops[top] || 0) + 1;
    byScript.set(key, prev);
  }
  return {
    signature: HEAP_CYCLE_WORKER_CENSUS_SIGNATURE,
    liveTotal,
    createdTotal,
    terminatedTotal,
    surviving: Math.max(0, createdTotal - terminatedTotal),
    perFrame,
    byScript: [...byScript.values()].sort((a, b) => b.created - a.created),
    creations: creations.slice(-40),
  };
}

/**
 * CDP worker targets (own heaps). Complements in-page wrapper.
 * Prefer a long-lived tracker from installCdpWorkerTargetTracker — iframe
 * teardown drops in-page census state and under-counts creations.
 */
export async function snapshotCdpWorkerTargets(browser, tracker = null) {
  if (tracker && typeof tracker.snapshot === 'function') {
    return tracker.snapshot();
  }
  const pages = await browser.pages();
  const targets = browser.targets ? browser.targets() : [];
  const workers = [];
  for (const t of targets) {
    const type = typeof t.type === 'function' ? t.type() : t._targetInfo?.type;
    const url = typeof t.url === 'function' ? t.url() : t._targetInfo?.url;
    if (type === 'worker' || type === 'service_worker' || /worker/i.test(String(type || ''))) {
      workers.push({ type, url: url || null });
    }
  }
  let cdpWorkers = [];
  try {
    const page = pages[0];
    if (page) {
      const client = await page.createCDPSession();
      await client.send('Target.setDiscoverTargets', { discover: true });
      const { targetInfos } = await client.send('Target.getTargets');
      cdpWorkers = (targetInfos || [])
        .filter((info) => /worker/i.test(String(info.type || '')))
        .map((info) => ({
          type: info.type,
          url: info.url || null,
          targetId: info.targetId,
        }));
      await client.detach().catch(() => {});
    }
  } catch (_) {
    /* optional */
  }
  const merged = cdpWorkers.length ? cdpWorkers : workers;
  return {
    count: merged.length,
    targets: merged,
    createdTotal: null,
    destroyedTotal: null,
  };
}

/**
 * Long-lived CDP Target discovery — survives iframe teardown so +N/cycle
 * orphan Workers are visible even when in-page wrappers disappear with the frame.
 */
export async function installCdpWorkerTargetTracker(page) {
  const client = await page.createCDPSession();
  const live = new Map();
  const created = [];
  const destroyed = [];
  await client.send('Target.setDiscoverTargets', { discover: true });
  const onCreated = ({ targetInfo }) => {
    if (!targetInfo || !/worker/i.test(String(targetInfo.type || ''))) return;
    live.set(targetInfo.targetId, {
      type: targetInfo.type,
      url: targetInfo.url || null,
      targetId: targetInfo.targetId,
      createdAt: Date.now(),
    });
    created.push({
      type: targetInfo.type,
      url: targetInfo.url || null,
      targetId: targetInfo.targetId,
      at: Date.now(),
    });
  };
  const onDestroyed = ({ targetId }) => {
    if (!live.has(targetId)) return;
    const prev = live.get(targetId);
    live.delete(targetId);
    destroyed.push({ ...prev, destroyedAt: Date.now() });
  };
  client.on('Target.targetCreated', onCreated);
  client.on('Target.targetDestroyed', onDestroyed);
  // Seed current set.
  try {
    const { targetInfos } = await client.send('Target.getTargets');
    for (const info of targetInfos || []) onCreated({ targetInfo: info });
  } catch (_) {
    /* ignore */
  }
  return {
    client,
    snapshot() {
      const targets = [...live.values()];
      const byUrl = new Map();
      for (const t of created) {
        const key = t.url || '(unknown)';
        byUrl.set(key, (byUrl.get(key) || 0) + 1);
      }
      return {
        count: targets.length,
        targets,
        createdTotal: created.length,
        destroyedTotal: destroyed.length,
        survivingNeverDestroyed: Math.max(0, created.length - destroyed.length),
        createdByUrl: [...byUrl.entries()]
          .map(([url, n]) => ({ url, created: n }))
          .sort((a, b) => b.created - a.created),
        recentCreated: created.slice(-20),
        recentDestroyed: destroyed.slice(-20),
      };
    },
    async dispose() {
      client.off('Target.targetCreated', onCreated);
      client.off('Target.targetDestroyed', onDestroyed);
      await client.detach().catch(() => {});
    },
  };
}

export function summarizeWorkerCycleDeltas(snapshots) {
  const rows = Array.isArray(snapshots) ? snapshots : [];
  const deltas = [];
  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1];
    const cur = rows[i];
    deltas.push({
      from: prev?.label || i - 1,
      to: cur?.label || i,
      liveDelta: (cur?.liveTotal ?? 0) - (prev?.liveTotal ?? 0),
      createdDelta: (cur?.createdTotal ?? 0) - (prev?.createdTotal ?? 0),
      cdpDelta: (cur?.cdpCount ?? 0) - (prev?.cdpCount ?? 0),
    });
  }
  const liveDeltas = deltas.map((d) => d.liveDelta);
  const meanLiveDelta = liveDeltas.length
    ? liveDeltas.reduce((a, b) => a + b, 0) / liveDeltas.length
    : null;
  return {
    signature: HEAP_CYCLE_WORKER_CENSUS_SIGNATURE,
    deltas,
    meanLiveDeltaPerCycle: meanLiveDelta,
    plusOnePerCycle: meanLiveDelta != null && meanLiveDelta >= 0.9,
  };
}

export { sleep };
