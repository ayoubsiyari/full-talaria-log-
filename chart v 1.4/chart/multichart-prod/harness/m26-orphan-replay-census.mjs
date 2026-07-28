#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { bootLayout, embedFrames, launchBrowser, sleep } from './harness-lib.mjs';
import { startServer } from './serve.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const evidencePath = path.join(__dirname, 'evidence', 'm26-orphan-replay-census-20260728.json');

const settleMs = Number(process.env.M26_SETTLE_MS || 1500);
const runsPerArm = Number(process.env.M26_RUNS_PER_ARM || 3);
const livenessObserveMs = Number(process.env.M26_LIVENESS_OBSERVE_MS || 3000);
const headful = process.env.HEADFUL === '1';
const panelIds = ['B', 'C', 'D'];

function git(args, cwd = repoRoot) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function makePreDocument({ killSwitch, instrumentLiveness = false }) {
  return {
    fn: (disabled, enableLiveness) => {
      if (disabled) window.__TALARIA_DISABLE_M26_PANEL_REPLAY_DESTROY_V1 = true;
      if (!enableLiveness) return;

      const root = window.top || window;
      if (!root.__m26Liveness) {
        Object.defineProperty(root, '__m26Liveness', {
          configurable: true,
          value: {
            nextInstanceId: 1,
            constructed: [],
            registrations: [],
            executions: [],
            removedAtByPanel: {},
            notes: [],
          },
        });
      }
      const shared = root.__m26Liveness;
      const instanceIds = new WeakMap();
      let currentReplayInstance = null;
      let currentReplayMethod = null;
      let currentReplayCtor = null;

      function nowIso() {
        try { return new Date().toISOString(); } catch (_) { return String(Date.now()); }
      }

      function panelId() {
        try {
          const u = new URL(location.href);
          return u.searchParams.get('panelId') || u.searchParams.get('id') || (window === root ? 'A' : 'unknown');
        } catch (_) {
          return window === root ? 'A' : 'unknown';
        }
      }

      function replayId(instance) {
        if (!instance || (typeof instance !== 'object' && typeof instance !== 'function')) return null;
        let id = instanceIds.get(instance);
        if (!id) {
          id = shared.nextInstanceId++;
          instanceIds.set(instance, id);
          try {
            Object.defineProperty(instance, '__m26ReplayInstanceId', { configurable: true, value: id });
          } catch (_) {}
          shared.constructed.push({
            id,
            panelId: panelId(),
            timestamp: nowIso(),
            ctorName: currentReplayCtor || (instance.constructor && instance.constructor.name) || null,
          });
        }
        return id;
      }

      function recordRegistration(kind, detail) {
        const instance = currentReplayInstance;
        const id = replayId(instance);
        if (!id) return null;
        const entry = {
          id,
          kind,
          panelId: panelId(),
          method: currentReplayMethod,
          targetName: detail && detail.targetName || null,
          eventType: detail && detail.eventType || null,
          timerDelay: detail && detail.timerDelay || null,
          registeredAt: nowIso(),
          clearedAt: null,
          executions: 0,
          afterRemovedExecutions: 0,
          lastExecutionAt: null,
        };
        shared.registrations.push(entry);
        return entry;
      }

      function markExecution(entry) {
        if (!entry) return;
        entry.executions += 1;
        entry.lastExecutionAt = nowIso();
        const removedAt = shared.removedAtByPanel[entry.panelId];
        if (removedAt && Date.now() >= removedAt) {
          entry.afterRemovedExecutions += 1;
          shared.executions.push({
            id: entry.id,
            kind: entry.kind,
            panelId: entry.panelId,
            method: entry.method,
            eventType: entry.eventType,
            timestamp: entry.lastExecutionAt,
          });
        }
      }

      function wrapPrototype(Ctor) {
        if (!Ctor || !Ctor.prototype || Ctor.prototype.__m26LivenessWrapped) return Ctor;
        currentReplayCtor = Ctor.name || null;
        for (const name of Object.getOwnPropertyNames(Ctor.prototype)) {
          if (name === 'constructor') continue;
          const desc = Object.getOwnPropertyDescriptor(Ctor.prototype, name);
          if (!desc || typeof desc.value !== 'function') continue;
          const original = desc.value;
          if (original.__m26LivenessWrapped) continue;
          const wrapped = function m26ReplayMethodWrapper(...args) {
            const prevInstance = currentReplayInstance;
            const prevMethod = currentReplayMethod;
            currentReplayInstance = this;
            currentReplayMethod = name;
            replayId(this);
            try {
              return original.apply(this, args);
            } finally {
              currentReplayInstance = prevInstance;
              currentReplayMethod = prevMethod;
            }
          };
          try { Object.defineProperty(wrapped, '__m26LivenessWrapped', { value: true }); } catch (_) {}
          Object.defineProperty(Ctor.prototype, name, { ...desc, value: wrapped });
        }
        try { Object.defineProperty(Ctor.prototype, '__m26LivenessWrapped', { configurable: true, value: true }); } catch (_) {}
        return Ctor;
      }

      try {
        const originalAdd = EventTarget.prototype.addEventListener;
        const originalRemove = EventTarget.prototype.removeEventListener;
        const listenerMap = new WeakMap();
        EventTarget.prototype.addEventListener = function m26AddEventListener(type, listener, options) {
          if (!currentReplayInstance || typeof listener !== 'function') {
            return originalAdd.call(this, type, listener, options);
          }
          const targetName = (this && this.constructor && this.constructor.name) || null;
          const entry = recordRegistration('event', { targetName, eventType: String(type) });
          const wrappedListener = function m26ReplayListenerWrapper(...args) {
            markExecution(entry);
            return listener.apply(this, args);
          };
          listenerMap.set(listener, wrappedListener);
          return originalAdd.call(this, type, wrappedListener, options);
        };
        EventTarget.prototype.removeEventListener = function m26RemoveEventListener(type, listener, options) {
          const wrapped = listenerMap.get(listener);
          return originalRemove.call(this, type, wrapped || listener, options);
        };
      } catch (error) {
        shared.notes.push({ timestamp: nowIso(), scope: 'event-patch', error: String(error && error.message || error) });
      }

      try {
        const originalSetTimeout = window.setTimeout.bind(window);
        const originalClearTimeout = window.clearTimeout.bind(window);
        const timeoutEntries = new Map();
        window.setTimeout = function m26SetTimeout(callback, delay, ...args) {
          if (!currentReplayInstance || typeof callback !== 'function') {
            return originalSetTimeout(callback, delay, ...args);
          }
          const entry = recordRegistration('timeout', { timerDelay: Number(delay) || 0 });
          const wrapped = (...cbArgs) => {
            markExecution(entry);
            if (entry && !entry.clearedAt) entry.clearedAt = nowIso();
            return callback(...cbArgs);
          };
          const handle = originalSetTimeout(wrapped, delay, ...args);
          timeoutEntries.set(handle, entry);
          return handle;
        };
        window.clearTimeout = function m26ClearTimeout(handle) {
          const entry = timeoutEntries.get(handle);
          if (entry && !entry.clearedAt) entry.clearedAt = nowIso();
          return originalClearTimeout(handle);
        };
      } catch (error) {
        shared.notes.push({ timestamp: nowIso(), scope: 'timeout-patch', error: String(error && error.message || error) });
      }

      try {
        const originalSetInterval = window.setInterval.bind(window);
        const originalClearInterval = window.clearInterval.bind(window);
        const intervalEntries = new Map();
        window.setInterval = function m26SetInterval(callback, delay, ...args) {
          if (!currentReplayInstance || typeof callback !== 'function') {
            return originalSetInterval(callback, delay, ...args);
          }
          const entry = recordRegistration('interval', { timerDelay: Number(delay) || 0 });
          const wrapped = (...cbArgs) => {
            markExecution(entry);
            return callback(...cbArgs);
          };
          const handle = originalSetInterval(wrapped, delay, ...args);
          intervalEntries.set(handle, entry);
          return handle;
        };
        window.clearInterval = function m26ClearInterval(handle) {
          const entry = intervalEntries.get(handle);
          if (entry && !entry.clearedAt) entry.clearedAt = nowIso();
          return originalClearInterval(handle);
        };
      } catch (error) {
        shared.notes.push({ timestamp: nowIso(), scope: 'interval-patch', error: String(error && error.message || error) });
      }

      try {
        const originalRaf = window.requestAnimationFrame && window.requestAnimationFrame.bind(window);
        if (originalRaf) {
          window.requestAnimationFrame = function m26RequestAnimationFrame(callback) {
            if (!currentReplayInstance || typeof callback !== 'function') return originalRaf(callback);
            const entry = recordRegistration('raf', {});
            return originalRaf((ts) => {
              markExecution(entry);
              if (entry && !entry.clearedAt) entry.clearedAt = nowIso();
              return callback(ts);
            });
          };
        }
      } catch (error) {
        shared.notes.push({ timestamp: nowIso(), scope: 'raf-patch', error: String(error && error.message || error) });
      }

      let currentReplaySystem;
      try {
        Object.defineProperty(window, 'ReplaySystem', {
          configurable: true,
          get() { return currentReplaySystem; },
          set(value) {
            currentReplaySystem = wrapPrototype(value);
          },
        });
      } catch (error) {
        shared.notes.push({ timestamp: nowIso(), scope: 'ReplaySystem-setter', error: String(error && error.message || error) });
      }
    },
    args: [killSwitch, instrumentLiveness],
  };
}

async function collectGarbage(cdp) {
  for (let i = 0; i < 2; i++) {
    await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
    await cdp.send('Runtime.collectGarbage').catch(() => {});
    await sleep(250);
  }
  await sleep(settleMs);
}

function increment(map, key) {
  map[key] = (map[key] || 0) + 1;
}

async function takeHeapCounts(cdp, label) {
  const file = path.join(os.tmpdir(), `talaria-m26-${process.pid}-${Date.now()}-${label}.heapsnapshot`);
  const stream = fs.createWriteStream(file);
  const hash = createHash('sha256');
  let bytes = 0;
  const onChunk = ({ chunk }) => {
    bytes += Buffer.byteLength(chunk);
    hash.update(chunk);
    stream.write(chunk);
  };
  cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
  try {
    await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  } finally {
    cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
    await new Promise((resolve, reject) => stream.end((err) => err ? reject(err) : resolve()));
  }

  const counts = {
    m20Q6ReplaySystem: 0,
    detachedDivs: 0,
    detachedDocuments: 0,
    matchingDocumentNames: {},
    matchingDetachedDivNames: {},
    matchingReplayNames: {},
  };
  try {
    const heap = JSON.parse(fs.readFileSync(file, 'utf8'));
    const fields = heap.snapshot?.meta?.node_fields || [];
    const typeTable = heap.snapshot?.meta?.node_types?.[0] || [];
    const nodes = heap.nodes || [];
    const strings = heap.strings || [];
    const step = fields.length;
    const typeOffset = fields.indexOf('type');
    const nameOffset = fields.indexOf('name');
    for (let i = 0; i < nodes.length; i += step) {
      const typeName = typeTable[nodes[i + typeOffset]];
      if (typeName !== 'object' && typeName !== 'native') continue;
      const name = strings[nodes[i + nameOffset]] || '';
      if (name === 'M20Q6ReplaySystem') {
        counts.m20Q6ReplaySystem += 1;
        increment(counts.matchingReplayNames, name);
      } else if (/ReplaySystem/.test(name)) {
        increment(counts.matchingReplayNames, name);
      }
      if (/Detached/i.test(name) && /HTMLDivElement/i.test(name)) {
        counts.detachedDivs += 1;
        increment(counts.matchingDetachedDivNames, name);
      }
      if (/Detached/i.test(name) && /(HTMLDocument|Document)/i.test(name)) {
        counts.detachedDocuments += 1;
        increment(counts.matchingDocumentNames, name);
      }
    }
  } finally {
    fs.rmSync(file, { force: true });
  }
  return { ...counts, heapBytes: bytes, heapSha256: hash.digest('hex'), heapDeleted: true };
}

async function sample(page, cdp, label) {
  await collectGarbage(cdp);
  const runtime = await page.evaluate((sampleLabel) => {
    const mgr = window.__harnessManager;
    const chartIds = mgr && mgr.charts ? [...mgr.charts.keys()] : [];
    return {
      label: sampleLabel,
      timestamp: new Date().toISOString(),
      wallClockMs: Date.now(),
      visibilityState: document.visibilityState,
      chartIds,
      connectedDivs: document.querySelectorAll('div').length,
      connectedIframes: document.querySelectorAll('iframe').length,
      liveness: window.__m26Liveness ? {
        constructed: window.__m26Liveness.constructed.length,
        registrations: window.__m26Liveness.registrations.length,
        executionsAfterRemoval: window.__m26Liveness.executions.length,
      } : null,
    };
  }, label);
  return { ...runtime, ...(await takeHeapCounts(cdp, label)) };
}

async function waitForFramesPainted(page, expectedIds) {
  const deadline = Date.now() + 90_000;
  const painted = new Set();
  while (Date.now() < deadline) {
    for (const frame of embedFrames(page)) {
      const state = await frame.evaluate(() => ({
        panelId: new URL(location.href).searchParams.get('panelId') || new URL(location.href).searchParams.get('id'),
        painted: !!(window.chart && Array.isArray(window.chart.data) && window.chart.data.length > 0
          && window.chart._mcDiag && window.chart._mcDiag.renders > 0),
      })).catch(() => null);
      if (state && state.painted && expectedIds.includes(state.panelId)) painted.add(state.panelId);
    }
    if (expectedIds.every((id) => painted.has(id))) return;
    await sleep(250);
  }
  throw new Error(`open multichart timeout: painted ${[...painted].join(',') || '(none)'}/${expectedIds.join(',')}`);
}

async function openMultichart(page) {
  await page.evaluate((ids) => {
    const mgr = window.__harnessManager;
    const grid = document.getElementById('grid');
    const cfg = window.__harnessConfig || {};
    const tf = cfg.tf || '1m';
    if (!mgr || !grid) throw new Error('missing harness manager/grid');
    grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
    grid.style.gridTemplateRows = 'repeat(2, 1fr)';
    window.__harnessCells = window.__harnessCells || {};
    for (const id of ids) {
      if (!window.__harnessCells[id]) {
        const d = document.createElement('div');
        d.className = 'cell';
        d.setAttribute('data-cell', id);
        grid.appendChild(d);
        window.__harnessCells[id] = d;
      }
      if (!mgr.charts.has(id)) {
        const fid = cfg.fileIds && cfg.fileIds[id] != null ? cfg.fileIds[id] : cfg.hostFileId || 25;
        mgr.addChart({ id, tf, fileId: fid }, window.__harnessCells[id]);
      }
    }
    window.__harnessPanelIds = ids.slice();
  }, panelIds);
  await waitForFramesPainted(page, panelIds);
  await sleep(settleMs);
}

async function closeToSingleChart(page) {
  await page.evaluate((ids) => {
    const mgr = window.__harnessManager;
    if (!mgr || !mgr.charts) throw new Error('missing harness manager');
    if (window.__m26Liveness) {
      for (const id of ids) window.__m26Liveness.removedAtByPanel[id] = Date.now();
    }
    for (const id of ids) {
      if (mgr.charts.has(id)) mgr.removeChart(id);
    }
  }, panelIds);
  await sleep(settleMs);
}

async function readLiveness(page) {
  return page.evaluate(() => {
    const state = window.__m26Liveness || {
      constructed: [],
      registrations: [],
      executions: [],
      removedAtByPanel: {},
      notes: [],
    };
    const byKind = {};
    const afterRemovalByKind = {};
    let pendingTimers = 0;
    let pendingRegistrations = 0;
    for (const reg of state.registrations) {
      byKind[reg.kind] = (byKind[reg.kind] || 0) + 1;
      if (reg.afterRemovedExecutions > 0) {
        afterRemovalByKind[reg.kind] = (afterRemovalByKind[reg.kind] || 0) + reg.afterRemovedExecutions;
      }
      if (!reg.clearedAt) {
        pendingRegistrations += 1;
        if (reg.kind === 'timeout' || reg.kind === 'interval' || reg.kind === 'raf') pendingTimers += 1;
      }
    }
    return {
      constructed: state.constructed,
      registrationsTotal: state.registrations.length,
      registrationsByKind: byKind,
      pendingRegistrations,
      pendingTimersOrRafs: pendingTimers,
      executionsAfterRemoval: state.executions.length,
      executionsAfterRemovalByKind: afterRemovalByKind,
      executionSamples: state.executions.slice(0, 20),
      removedAtByPanel: state.removedAtByPanel,
      notes: state.notes,
    };
  });
}

async function runArm(browser, srv, { name, killSwitch, runIndex, collectLiveness }) {
  const run = await bootLayout(browser, srv, {
    panels: 1,
    pair: 'same',
    tf: '1m',
    preDocument: makePreDocument({ killSwitch, instrumentLiveness: collectLiveness }),
  });
  const cdp = await run.page.target().createCDPSession();
  await cdp.send('HeapProfiler.enable');
  await cdp.send('Runtime.enable').catch(() => {});
  try {
    const beforeOpen = await sample(run.page, cdp, `${name}-r${runIndex}-before-open`);
    await openMultichart(run.page);
    await closeToSingleChart(run.page);
    if (collectLiveness) await sleep(livenessObserveMs);
    const afterReturn = await sample(run.page, cdp, `${name}-r${runIndex}-after-return`);
    const liveness = collectLiveness ? await readLiveness(run.page) : null;
    return {
      arm: name,
      runIndex,
      killSwitch,
      collectLiveness,
      samples: { beforeOpen, afterReturn },
      delta: {
        m20Q6ReplaySystem: afterReturn.m20Q6ReplaySystem - beforeOpen.m20Q6ReplaySystem,
        detachedDivs: afterReturn.detachedDivs - beforeOpen.detachedDivs,
        detachedDocuments: afterReturn.detachedDocuments - beforeOpen.detachedDocuments,
      },
      liveness,
      inFlightDataRequestsAtEnd: typeof run.getInFlightDataRequests === 'function'
        ? run.getInFlightDataRequests()
        : null,
      consoleErrors: run.consoleErrors,
      pageErrors: run.pageErrors,
    };
  } finally {
    await cdp.detach().catch(() => {});
    await run.close();
  }
}

function range(values) {
  const nums = values.filter((v) => Number.isFinite(v));
  if (!nums.length) return null;
  return { min: Math.min(...nums), max: Math.max(...nums), values: nums };
}

function summarizeArm(runs) {
  return {
    runs: runs.length,
    beforeReplaySystemRange: range(runs.map((r) => r.samples.beforeOpen.m20Q6ReplaySystem)),
    afterReplaySystemRange: range(runs.map((r) => r.samples.afterReturn.m20Q6ReplaySystem)),
    replaySystemDeltaRange: range(runs.map((r) => r.delta.m20Q6ReplaySystem)),
    beforeDetachedDivRange: range(runs.map((r) => r.samples.beforeOpen.detachedDivs)),
    afterDetachedDivRange: range(runs.map((r) => r.samples.afterReturn.detachedDivs)),
    detachedDivDeltaRange: range(runs.map((r) => r.delta.detachedDivs)),
    beforeDetachedDocumentRange: range(runs.map((r) => r.samples.beforeOpen.detachedDocuments)),
    afterDetachedDocumentRange: range(runs.map((r) => r.samples.afterReturn.detachedDocuments)),
    detachedDocumentDeltaRange: range(runs.map((r) => r.delta.detachedDocuments)),
    visibilityStates: [...new Set(runs.flatMap((r) => [
      r.samples.beforeOpen.visibilityState,
      r.samples.afterReturn.visibilityState,
    ]))],
  };
}

function buildAcceptance(summary) {
  const enabled = summary.byArm.enabled;
  const replayValues = enabled?.afterReplaySystemRange?.values || [];
  const divDeltas = enabled?.detachedDivDeltaRange?.values || [];
  return {
    criterion1: {
      text: 'M20Q6ReplaySystem instance count after return must be exactly 1.',
      values: replayValues,
      passed: replayValues.length >= runsPerArm && replayValues.every((v) => v === 1),
    },
    criterion2: {
      text: 'Detached <div> count must not grow across the multichart open/close cycle.',
      values: divDeltas,
      passed: divDeltas.length >= runsPerArm && divDeltas.every((v) => v <= 0),
    },
  };
}

async function main() {
  const branch = git(['branch', '--show-current']);
  const head = git(['rev-parse', 'HEAD']);
  const srv = await startServer(0);
  const browser = await launchBrowser({ headful });
  const result = {
    protocol: 'M-6 orphan replay destroy census',
    timestamp: new Date().toISOString(),
    branch,
    head,
    headful,
    settleMs,
    runsPerArm,
    livenessObserveMs,
    server: { deployedMode: srv.deployedMode, url: srv.url },
    baselineCaveat: '19,852 detached divs existed before any multichart was opened on the PO machine. This packet measures per-cycle growth on top of any pre-existing population; a flat per-cycle delta is not a claim that the baseline leak was fixed.',
    method: {
      instanceCount: 'Forced GC, then CDP HeapProfiler full heap snapshot filtered by class name M20Q6ReplaySystem.',
      detachedDivCount: 'Forced GC, then full heap snapshot filtered for Detached HTMLDivElement class names.',
      detachedDocumentCount: 'Forced GC, then full heap snapshot filtered for Detached *Document class names.',
      liveness: 'Pre-document instrumentation wraps ReplaySystem prototype methods, EventTarget listener registration, timers, intervals, and RAFs to record registrations and callback executions after panel removal.',
    },
    runOrder: [],
    runs: [],
  };

  try {
    for (let i = 1; i <= runsPerArm; i++) {
      const disabled = await runArm(browser, srv, {
        name: 'disabled',
        killSwitch: true,
        runIndex: i,
        collectLiveness: false,
      });
      result.runOrder.push(`disabled-${i}`);
      result.runs.push(disabled);

      const enabled = await runArm(browser, srv, {
        name: 'enabled',
        killSwitch: false,
        runIndex: i,
        collectLiveness: false,
      });
      result.runOrder.push(`enabled-${i}`);
      result.runs.push(enabled);
    }
    result.livenessProbe = await runArm(browser, srv, {
      name: 'disabled-liveness',
      killSwitch: true,
      runIndex: 1,
      collectLiveness: true,
    });
  } finally {
    await browser.close().catch(() => {});
    await srv.close().catch(() => {});
  }

  result.byArm = {
    disabled: summarizeArm(result.runs.filter((r) => r.arm === 'disabled')),
    enabled: summarizeArm(result.runs.filter((r) => r.arm === 'enabled')),
  };
  result.acceptance = buildAcceptance(result);
  result.ok = result.acceptance.criterion1.passed && result.acceptance.criterion2.passed;

  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  fs.writeFileSync(evidencePath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({
    evidencePath,
    branch,
    head,
    ok: result.ok,
    runOrder: result.runOrder,
    byArm: result.byArm,
    acceptance: result.acceptance,
    disabledLiveness: result.livenessProbe?.liveness || null,
  }, null, 2));
}

main().catch((err) => {
  console.error(err && err.stack || err);
  process.exitCode = 1;
});
