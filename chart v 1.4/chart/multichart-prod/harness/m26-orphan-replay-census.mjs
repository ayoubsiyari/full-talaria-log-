#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { bootLayout, launchBrowser, sleep } from './harness-lib.mjs';
import { startServer } from './serve.mjs';

const settleMs = Number(process.env.M26_SETTLE_MS || 1500);
const headful = process.env.HEADFUL === '1';

function makePreDocument({ killSwitch }) {
  return {
    fn: (disabled) => {
      if (disabled) window.__TALARIA_DISABLE_M26_PANEL_REPLAY_DESTROY_V1 = true;

      const root = window.top || window;
      if (!root.__m26ReplayCensus) {
        Object.defineProperty(root, '__m26ReplayCensus', {
          configurable: true,
          value: {
            constructed: 0,
            wrappedAssignments: 0,
            refs: [],
          },
        });
      }
      const state = root.__m26ReplayCensus;

      function wrapReplaySystem(Original) {
        if (typeof Original !== 'function') return Original;
        if (Original.__m26ReplayWrapped) return Original;
        function M26ReplaySystemWrapper(...args) {
          const instance = Reflect.construct(Original, args, new.target || M26ReplaySystemWrapper);
          state.constructed += 1;
          state.refs.push(new WeakRef(instance));
          return instance;
        }
        try { Object.setPrototypeOf(M26ReplaySystemWrapper, Original); } catch (_) {}
        M26ReplaySystemWrapper.prototype = Original.prototype;
        try {
          Object.defineProperty(M26ReplaySystemWrapper, '__m26ReplayWrapped', { value: true });
        } catch (_) {}
        state.wrappedAssignments += 1;
        return M26ReplaySystemWrapper;
      }

      let currentReplaySystem;
      try {
        Object.defineProperty(window, 'ReplaySystem', {
          configurable: true,
          get() { return currentReplaySystem; },
          set(value) { currentReplaySystem = wrapReplaySystem(value); },
        });
      } catch (_) {}
    },
    args: [killSwitch],
  };
}

async function collectGarbage(cdp) {
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  await sleep(settleMs);
}

async function countDetachedDivs(cdp, label) {
  const file = path.join(os.tmpdir(), `talaria-m26-${process.pid}-${label}.heapsnapshot`);
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

  let detachedDivs = null;
  try {
    const heap = JSON.parse(fs.readFileSync(file, 'utf8'));
    const fields = heap.snapshot?.meta?.node_fields || [];
    const typeTable = heap.snapshot?.meta?.node_types?.[0] || [];
    const nodes = heap.nodes || [];
    const strings = heap.strings || [];
    const step = fields.length;
    const typeOffset = fields.indexOf('type');
    const nameOffset = fields.indexOf('name');
    let count = 0;
    for (let i = 0; i < nodes.length; i += step) {
      const typeName = typeTable[nodes[i + typeOffset]];
      if (typeName !== 'object' && typeName !== 'native') continue;
      const name = strings[nodes[i + nameOffset]] || '';
      if (/Detached/i.test(name) && /(HTMLDivElement|<div>| div\b|\bdiv\b)/i.test(name)) count += 1;
    }
    detachedDivs = count;
  } finally {
    fs.rmSync(file, { force: true });
  }
  return { detachedDivs, heapBytes: bytes, heapSha256: hash.digest('hex'), heapDeleted: true };
}

async function sample(page, cdp, label) {
  await collectGarbage(cdp);
  const runtime = await page.evaluate((sampleLabel) => {
    const state = window.__m26ReplayCensus || { refs: [], constructed: 0, wrappedAssignments: 0 };
    const liveReplaySystems = state.refs.filter((ref) => {
      try { return !!ref.deref(); } catch (_) { return false; }
    }).length;
    const mgr = window.__harnessManager;
    const chartIds = mgr && mgr.charts ? [...mgr.charts.keys()] : [];
    return {
      label: sampleLabel,
      timestamp: new Date().toISOString(),
      visibilityState: document.visibilityState,
      chartIds,
      constructedReplaySystems: state.constructed,
      liveReplaySystems,
      wrappedAssignments: state.wrappedAssignments,
      connectedDivs: document.querySelectorAll('div').length,
      connectedIframes: document.querySelectorAll('iframe').length,
    };
  }, label);
  return { ...runtime, ...(await countDetachedDivs(cdp, label)) };
}

async function closeToSingleChart(page) {
  await page.evaluate(() => {
    const mgr = window.__harnessManager;
    if (!mgr || !mgr.charts) throw new Error('missing harness manager');
    for (const id of [...mgr.charts.keys()]) {
      if (id !== 'A') mgr.removeChart(id);
    }
  });
  await sleep(settleMs);
}

async function runArm(browser, srv, { name, killSwitch }) {
  const run = await bootLayout(browser, srv, {
    panels: 4,
    pair: 'same',
    tf: '1m',
    preDocument: makePreDocument({ killSwitch }),
  });
  const cdp = await run.page.target().createCDPSession();
  await cdp.send('HeapProfiler.enable');
  try {
    const open = await sample(run.page, cdp, `${name}-open`);
    await closeToSingleChart(run.page);
    const closed = await sample(run.page, cdp, `${name}-closed-single`);
    const detachedDivDelta = closed.detachedDivs - open.detachedDivs;
    return {
      arm: name,
      killSwitch,
      ok: !killSwitch && closed.liveReplaySystems === 1 && detachedDivDelta <= 0,
      samples: { open, closed },
      delta: { detachedDivs: detachedDivDelta },
      consoleErrors: run.consoleErrors,
      pageErrors: run.pageErrors,
    };
  } finally {
    await cdp.detach().catch(() => {});
    await run.close();
  }
}

async function main() {
  const srv = await startServer(0);
  const browser = await launchBrowser({ headful });
  const result = {
    timestamp: new Date().toISOString(),
    headful,
    settleMs,
    server: { deployedMode: srv.deployedMode, url: srv.url },
    note: 'Detached-div totals include any pre-existing browser population; acceptance is per-cycle growth.',
    arms: [],
  };
  try {
    result.arms.push(await runArm(browser, srv, { name: 'fix-on', killSwitch: false }));
    result.arms.push(await runArm(browser, srv, { name: 'switch-off', killSwitch: true }));
  } finally {
    await browser.close().catch(() => {});
    await srv.close().catch(() => {});
  }

  const fix = result.arms.find((arm) => arm.arm === 'fix-on');
  result.ok = !!(fix && fix.ok);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err && err.stack || err);
  process.exitCode = 1;
});
