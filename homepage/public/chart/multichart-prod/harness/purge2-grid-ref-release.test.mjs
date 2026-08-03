/**
 * PURGE-2 — grid-held multichart panel references are released.
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/multichart-prod/harness/purge2-grid-ref-release.test.mjs"
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Walk up to the repo root instead of counting directory levels.
 *
 * This file is mirrored to a tree at a DIFFERENT depth, so a fixed '../../..'
 * resolved to the wrong directory in one of the two locations and the gate there
 * died on load, or failed a cell on a path it built itself. A gate that cannot
 * reach its subject reports a red indistinguishable from a product defect.
 */
function findRoot(start) {
  let dir = start;
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(dir, 'chart v 1.4')) && fs.existsSync(path.join(dir, 'homepage'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error(`ANCHOR_BROKEN: repo root not found from ${start}`);
}

const WORKTREE_ROOT = findRoot(__dirname);
const GRID_SRC = path.resolve(findRoot(__dirname), 'chart v 1.4/talaria-design/src/MultichartGrid.jsx');
const SWITCH = '__TALARIA_DISABLE_MC_GRID_STATE_PURGE_V1';
const HOST_BUS_SWITCH = '__TALARIA_DISABLE_MC_HOST_BUS_RETRY_TIMER_CLEANUP_V1';

const SOURCE = fs.readFileSync(GRID_SRC, 'utf8');

function note(name, pass, detail = '') {
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}\n`);
}

function matchingBrace(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error('unterminated block');
}

function extractFunction(source, name, from = 0) {
  const start = source.indexOf(`function ${name}(`, from);
  assert.notEqual(start, -1, `missing function ${name}`);
  const open = source.indexOf('{', start);
  return source.slice(start, matchingBrace(source, open) + 1);
}

function extractArrowAround(source, anchor, signature) {
  const anchorIdx = source.indexOf(anchor);
  assert.notEqual(anchorIdx, -1, `missing anchor ${anchor}`);
  const start = source.lastIndexOf(signature, anchorIdx);
  assert.notEqual(start, -1, `missing signature ${signature}`);
  const open = source.indexOf('{', start + signature.length);
  return `() => ${source.slice(open, matchingBrace(source, open) + 1)}`;
}

function extractBlockFrom(source, needle, from = 0) {
  const start = source.indexOf(needle, from);
  assert.notEqual(start, -1, `missing block ${needle}`);
  const open = source.indexOf('{', start);
  return source.slice(start, matchingBrace(source, open) + 1);
}

function replaceOnce(source, needle, replacement) {
  if (!source.includes(needle)) {
    // Tagged so expectRejectsCell cannot read a stale needle as a red cell.
    const err = new Error(`missing mutation target: ${needle}`);
    err.mutationTargetMissing = true;
    throw err;
  }
  return source.replace(needle, replacement);
}

function runVm(code, sandbox) {
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox;
}

function installGridHelpers(source, sandbox, extra = '') {
  return runVm(`
    const MC_GRID_STATE_PURGE_SWITCH = '${SWITCH}';
    const MC_HOST_BUS_RETRY_TIMER_CLEANUP_SWITCH = '${HOST_BUS_SWITCH}';
    ${extractFunction(source, 'mcGridStatePurgeV1Enabled')}
    ${extractFunction(source, 'mcHostBusRetryTimerCleanupV1Enabled')}
    ${extra}
  `, sandbox);
}

function makeInstrumentedDocument() {
  const active = new Map();
  const addCounts = Object.create(null);
  const removeCounts = Object.create(null);
  return {
    body: { style: {} },
    addCounts,
    removeCounts,
    active,
    addEventListener(type, fn) {
      addCounts[type] = (addCounts[type] || 0) + 1;
      if (!active.has(type)) active.set(type, new Set());
      active.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      removeCounts[type] = (removeCounts[type] || 0) + 1;
      const set = active.get(type);
      if (set) set.delete(fn);
    },
  };
}

function makeIframe(pointerEvents = 'auto') {
  return {
    style: {
      pointerEvents,
      position: 'absolute',
      left: '1px',
      top: '1px',
      width: '10px',
      height: '10px',
    },
    contentWindow: {
      __multichartLayoutDragging: false,
      chart: { _multichartLayoutDragging: false },
    },
  };
}

function makeContainer(iframes = [makeIframe(), makeIframe()]) {
  return {
    style: {},
    iframes,
    getBoundingClientRect: () => ({ width: 500, height: 300 }),
    querySelectorAll(selector) {
      return selector === 'iframe' ? iframes : [];
    },
  };
}

function makeSetter() {
  return (updater) => {
    if (typeof updater === 'function') updater(new Set(['B']));
  };
}

async function expectRejectsCell(name, fn) {
  let failed = false;
  try {
    await fn();
  } catch (err) {
    if (err && err.mutationTargetMissing) throw err;
    failed = true;
  }
  note(name, failed, failed ? 'red under neutered guard' : 'unexpectedly green');
  assert.equal(failed, true, `${name} must fail red when neutered`);
}

function exerciseSwitch(source = SOURCE) {
  const sandbox = { window: {} };
  installGridHelpers(source, sandbox);

  delete sandbox.window[SWITCH];
  const absent = vm.runInContext('mcGridStatePurgeV1Enabled()', sandbox);
  sandbox.window[SWITCH] = true;
  const presentTrue = vm.runInContext('mcGridStatePurgeV1Enabled()', sandbox);
  sandbox.window[SWITCH] = false;
  const presentFalse = vm.runInContext('mcGridStatePurgeV1Enabled()', sandbox);
  sandbox.window[SWITCH] = undefined;
  const presentUndefined = vm.runInContext('mcGridStatePurgeV1Enabled()', sandbox);
  delete sandbox.window[SWITCH];
  const removedAgain = vm.runInContext('mcGridStatePurgeV1Enabled()', sandbox);

  assert.equal(absent, true, 'absent property enables grid purge');
  assert.equal(presentTrue, false, 'true disables grid purge and restores legacy behavior');
  assert.equal(presentFalse, true, 'false keeps grid purge active');
  assert.equal(presentUndefined, true, 'undefined keeps grid purge active');
  assert.equal(removedAgain, true, 'deleting property re-enables grid purge without reload');
  return { absent, presentTrue, presentFalse, presentUndefined, removedAgain };
}

function exercisePg1(source = SOURCE) {
  const document = makeInstrumentedDocument();
  const iframes = [makeIframe('auto'), makeIframe('')];
  const container = makeContainer(iframes);
  const cleanupSet = new Set();
  const sandbox = {
    window: {},
    document,
    containerRef: { current: container },
    colFractions: [1, 1],
    rowFractions: [1, 1],
    MULTICHART_GRID_GAP_PX: 8,
    isDraggingRef: { current: false },
    liveDragRef: { current: null },
    activeSplitterDragCleanupRef: { current: cleanupSet },
    cellRefs: { current: { A: {} } },
    HOST_PANEL_ID: 'A',
    focusedPanelId: null,
    computeFocusedRectRef: { current: null },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    setTimeout: () => {},
    setColFractions: () => {},
    setRowFractions: () => {},
    setLayoutDragActive: (value) => { sandbox.layoutDragActive = value; },
    normalizeIframeStyles: () => {},
    settlePanelChartsAfterLayoutDrag: () => {},
    previewIframeChartsInContainer: () => {},
    liveReflowPanelsDuringDrag: () => {},
    applyHostSlotPositionOnly: () => {},
    updateFocusFrameDom: () => {},
  };

  installGridHelpers(source, sandbox, `
    ${extractFunction(source, 'freezePanelSurfaces')}
    ${extractFunction(source, 'clearIframeLayoutDragFlags')}
    ${extractFunction(source, 'thawPanelSurfaces')}
    ${extractFunction(source, 'makeSplitterDown')}
    this.makeSplitterDown = makeSplitterDown;
  `);

  const ev = {
    preventDefault() {},
    stopPropagation() {},
    currentTarget: { setPointerCapture() {} },
    pointerId: 1,
    clientX: 100,
    clientY: 100,
  };
  sandbox.makeSplitterDown('col', 0)(ev);
  sandbox.makeSplitterDown('col', 0)({ ...ev, pointerId: 2 });
  assert.equal(cleanupSet.size, 2, 'two concurrent splitter drags are both tracked');
  assert.equal(Object.values(document.addCounts).reduce((a, b) => a + b, 0), 10, 'five listeners per drag are installed');
  assert.ok(iframes.every((ifr) => ifr.style.pointerEvents === 'none'), 'iframes are frozen during drag');
  assert.ok(iframes.every((ifr) => ifr.contentWindow.__multichartLayoutDragging === true), 'iframe windows are flagged during drag');
  assert.equal(sandbox.isDraggingRef.current, true, 'drag ref is set during drag');

  Array.from(cleanupSet).reverse().forEach((cleanup) => cleanup());
  assert.equal(Object.values(document.removeCounts).reduce((a, b) => a + b, 0), 10, 'all concurrent drag listeners are removed');
  assert.equal(cleanupSet.size, 0, 'released cleanups remove themselves from the live set');
  assert.equal(sandbox.isDraggingRef.current, false, 'drag ref is reset by cleanup');
  assert.equal(iframes[0].style.pointerEvents, 'auto', 'original iframe pointerEvents is restored');
  assert.equal(iframes[1].style.pointerEvents, '', 'blank iframe pointerEvents remains blank');
  assert.ok(iframes.every((ifr) => ifr.contentWindow.__multichartLayoutDragging === false), 'iframe window flags are cleared');
  assert.ok(iframes.every((ifr) => ifr.contentWindow.chart._multichartLayoutDragging === false), 'iframe chart flags are cleared');
}

function exercisePg2(source = SOURCE) {
  const manager = { id: 'current-manager', disposed: false };
  const sandbox = {
    window: { __multichartRealData: 'new', __mcManager: manager },
    prevMultichartRealData: 'old',
    managerRef: { current: manager },
    cancelled: false,
    setManagerReady: () => {},
    setReadyPanels: () => {},
    setDataReadyPanels: () => {},
    setOverlayFallbackPanels: () => {},
    setFailedPanels: () => {},
    HOST_PANEL_ID: 'A',
  };
  installGridHelpers(source, sandbox, `
    const cleanup = ${extractArrowAround(source, 'delete window.__mcManager', 'return () =>')};
    this.cleanup = cleanup;
  `);
  sandbox.cleanup();
  assert.equal(Object.prototype.hasOwnProperty.call(sandbox.window, '__mcManager'), false, 'cleanup deletes this manager root');
  assert.equal(sandbox.window.__multichartRealData, 'old', 'cleanup restores previous real-data root');
}

function exercisePg3(source = SOURCE, switches = {}) {
  const hostBusAnchor = source.indexOf('let hostBusRetryInterval = null;');
  const retryBlock = extractBlockFrom(source, 'if (!tryInstallHostBus()) {', hostBusAnchor);
  let intervalCallback = null;
  let installedListeners = 0;
  const sandbox = {
    window: { chart: {}, removeEventListener() {} },
    document: { removeEventListener() {} },
    setInterval(fn) {
      intervalCallback = fn;
      return 99;
    },
    clearInterval(id) {
      sandbox.cleared = id;
    },
    CustomEvent: function CustomEvent() {},
    onPlaceOrderClickCapture: () => {},
    onMultichartClearPreviewHost: () => {},
    onIframeOrder: () => {},
    hostOrderStateRef: { current: { listenerInstalled: false, suppressEmitId: null } },
    broadcastOrder: () => {},
    broadcastOrderRemoval: () => {},
    broadcastClearDraftPreview: () => {},
  };
  if (switches.hostBusOff) sandbox.window[HOST_BUS_SWITCH] = true;
  if (switches.purgeOff) sandbox.window[SWITCH] = true;
  installGridHelpers(source, sandbox, `
    function startOrderMirrorRetryHarness() {
      let hostOffOpened = null;
      let hostOffPending = null;
      let hostOffPendingUpdated = null;
      let hostOffClosed = null;
      let hostOffPendingRemoved = null;
      let hostBusRetryInterval = null;
      let orderMirrorDisposed = false;
      ${extractFunction(source, 'tryInstallHostBus', hostBusAnchor)}
      ${retryBlock}
      const cleanup = ${extractArrowAround(source, 'orderMirrorDisposed = true;', 'return () =>')};
      return {
        cleanup,
        tryInstallHostBus,
        getInterval: () => hostBusRetryInterval,
      };
    }
    this.startOrderMirrorRetryHarness = startOrderMirrorRetryHarness;
  `);

  const harness = sandbox.startOrderMirrorRetryHarness();
  assert.equal(harness.getInterval(), 99, 'host bus retry interval is saved');
  harness.cleanup();
  if (switches.hostBusOff) {
    assert.equal(sandbox.cleared, undefined, 'its own kill-switch alone suppresses the clear');
    assert.equal(harness.getInterval(), 99, 'its own kill-switch alone leaves the interval in place');
    return;
  }
  assert.equal(sandbox.cleared, 99, 'cleanup clears the saved retry interval');
  assert.equal(harness.getInterval(), null, 'cleanup nulls the saved retry interval');
  // PURGE-2 off restores the legacy disposed-retry guard below, so stop here:
  // the clear above is the whole claim for that variant.
  if (switches.purgeOff) return;

  sandbox.window.chart = {
    orderManager: {
      orderService: {
        eventBus: {
          on() {
            installedListeners += 1;
            return () => {};
          },
        },
      },
    },
  };
  assert.equal(harness.tryInstallHostBus(), true, 'disposed retry exits cleanly');
  if (intervalCallback) intervalCallback();
  assert.equal(installedListeners, 0, 'disposed retry never installs host bus listeners');
}

function makeLoadSandbox(source = SOURCE) {
  let charts = Object.create(null);
  const events = [];
  const sandbox = {
    window: { chart: { currentTimeframe: '5m' } },
    HOST_PANEL_ID: 'A',
    focusedPanelIdRef: { current: 'B' },
    layoutSyncRef: { current: { symbol: false } },
    panelLoadGenerationRef: { current: Object.create(null) },
    managerRef: { current: { sendCommand: () => Promise.resolve({ ok: true }) } },
    getChartForPanelId: (pid) => charts[pid] || null,
    setCharts(next) { charts = next; },
    markUserPairLoadGuard: (pid) => events.push(['mark', pid]),
    applyHostCommand: () => Promise.resolve({ ok: true }),
    mirrorHostSessionOntoChart: () => events.push(['mirror']),
    resolveHostReplayPlayheadMs: () => 12345,
    persistPanelFileId: (pid, fid) => events.push(['persist', pid, fid]),
    scheduleFanOutHostOrdersAfterPairLoad: () => events.push(['fanout']),
    syncIframeReplayPlaybackOnce: (pid) => events.push(['syncReplay', pid]),
    dispatchFocusChanged: (pid) => events.push(['focus', pid]),
    setTimeout: (fn) => fn(),
    events,
  };
  installGridHelpers(source, sandbox, `
    ${extractFunction(source, 'bumpPanelLoadGeneration')}
    ${extractFunction(source, 'loadFileOnPanel')}
    this.bumpPanelLoadGeneration = bumpPanelLoadGeneration;
    this.loadFileOnPanel = loadFileOnPanel;
  `);
  return sandbox;
}

async function exercisePg4StaleGeneration(source = SOURCE) {
  const sandbox = makeLoadSandbox(source);
  let resolveLoad;
  const oldChart = {
    currentTimeframe: '1m',
    loadFileData: () => new Promise((resolve) => { resolveLoad = resolve; }),
  };
  const newChart = {
    currentTimeframe: '1m',
    loadFileData: () => Promise.resolve('new'),
    _finalizeMultichartPanelAfterPairLoad: () => sandbox.events.push(['finalize-new']),
  };
  sandbox.setCharts({ B: oldChart });
  const pending = sandbox.loadFileOnPanel('B', 'OLDPAIR', { force: true });
  sandbox.bumpPanelLoadGeneration('B');
  sandbox.setCharts({ B: newChart });
  resolveLoad({ ok: true });
  await pending;
  assert.deepEqual(sandbox.events.filter((event) => event[0] === 'persist'), [], 'stale load must not persist the old pair');
  assert.deepEqual(sandbox.events.filter((event) => event[0] === 'finalize-new'), [], 'stale load must not finalize the replacement chart');
  assert.deepEqual(sandbox.events.filter((event) => event[0] === 'syncReplay'), [], 'stale load must not replay-sync the replacement chart');
}

async function exerciseB3FlagOnExactness(source = SOURCE) {
  const sandbox = makeLoadSandbox(source);
  sandbox.window[SWITCH] = true;
  let resolveLoad;
  const oldChart = {
    currentTimeframe: '1m',
    loadFileData: () => new Promise((resolve) => { resolveLoad = resolve; }),
    _finalizeMultichartPanelAfterPairLoad: () => sandbox.events.push(['finalize-old']),
  };
  sandbox.setCharts({ B: oldChart });
  const pending = sandbox.loadFileOnPanel('B', 'NEWPAIR', { force: true });
  sandbox.setCharts({});
  resolveLoad({ ok: true });
  await pending;
  assert.ok(sandbox.events.some((event) => event[0] === 'finalize-old'), 'flag-on legacy path finalizes the original chart');
  assert.ok(sandbox.events.some((event) => event[0] === 'persist' && event[2] === 'NEWPAIR'), 'flag-on legacy path persists the selected pair');
  assert.ok(sandbox.events.some((event) => event[0] === 'fanout'), 'flag-on legacy path schedules host-order fanout');
  assert.ok(sandbox.events.some((event) => event[0] === 'syncReplay'), 'flag-on legacy path schedules replay sync');
  assert.ok(sandbox.events.some((event) => event[0] === 'focus'), 'flag-on legacy path dispatches focus change');
}

async function exerciseRetryRemoveReadd(source = SOURCE) {
  const sandbox = makeLoadSandbox(source);
  let resolveLoad;
  const oldChart = {
    currentTimeframe: '1m',
    loadFileData: () => new Promise((resolve) => { resolveLoad = resolve; }),
  };
  const replacementChart = {
    currentTimeframe: '1m',
    _finalizeMultichartPanelAfterPairLoad: () => sandbox.events.push(['finalize-replacement']),
  };
  sandbox.setCharts({ B: oldChart });
  const pending = sandbox.loadFileOnPanel('B', 'STALEPAIR', { force: true });

  const retrySandbox = {
    window: {},
    panelLoadGenerationRef: sandbox.panelLoadGenerationRef,
    managerRef: {
      current: {
        removeChart(id) {
          sandbox.events.push(['removeChart', id]);
          sandbox.setCharts({});
        },
        addChart(opts) {
          sandbox.events.push(['addChart', opts.id, opts.fileId]);
          sandbox.setCharts({ B: replacementChart });
        },
      },
    },
    tile: { id: 'B' },
    cellRefs: { current: { B: {} } },
    primedPanelsRef: { current: new Set(['B']) },
    orderSyncedPanelsRef: { current: new Set(['B']) },
    clonedPanelsRef: { current: new Set(['B']) },
    hostSyncedPanelsRef: { current: new Set(['B']) },
    clearPersistedPanelFileId: (id) => { sandbox.events.push(['clearPersist', id]); },
    setReadyPanels: makeSetter(),
    setDataReadyPanels: makeSetter(),
    setOverlayFallbackPanels: makeSetter(),
    setFailedPanels: (updater) => updater(new Map([['B', { reason: 'boot' }]])),
    readHostChartFileAndTf: () => ({ fileId: 'HOSTPAIR', tf: '15m' }),
    initialTimeframeRef: { current: '1m' },
    initialFileIdRef: { current: 'HOSTPAIR' },
    initialSessionIdRef: { current: 'S1' },
    initialModeRef: { current: 'replay' },
    readUrlChartMode: () => 'replay',
    resolveBootFileIdForPanel: () => 'HOSTPAIR',
  };
  installGridHelpers(source, retrySandbox, `
    ${extractFunction(source, 'bumpPanelLoadGeneration')}
    const retryClick = ${extractArrowAround(source, 'Retry must not re-apply poisoned sessionStorage fileIds.', 'onClick={() =>')};
    this.retryClick = retryClick;
  `);

  retrySandbox.retryClick();
  resolveLoad({ ok: true });
  await pending;
  assert.ok(sandbox.events.some((event) => event[0] === 'removeChart'), 'retry removes the failed panel');
  assert.ok(sandbox.events.some((event) => event[0] === 'addChart'), 'retry re-adds the same panel id');
  assert.equal(sandbox.panelLoadGenerationRef.current.B, 1, 'retry bumps the panel generation');
  assert.deepEqual(sandbox.events.filter((event) => event[0] === 'persist'), [], 'stale pre-retry load must not persist under the new panel id');
  assert.deepEqual(sandbox.events.filter((event) => event[0] === 'finalize-replacement'), [], 'stale pre-retry load must not finalize the replacement panel');
}

function exercisePg5(source = SOURCE, { killSwitch = false } = {}) {
  const removalLoop = extractBlockFrom(source, 'for (const existingId of Array.from(mgr.charts.keys())) {');
  const sandbox = {
    window: killSwitch ? { [SWITCH]: true } : {},
    desiredIframeIds: new Set(),
    mgr: {
      charts: new Map([['B', {}]]),
      removeChart: (id) => { sandbox.removed = id; },
    },
    hostSyncedPanelsRef: { current: new Set(['B']) },
    primedPanelsRef: { current: new Set(['B']) },
    orderSyncedPanelsRef: { current: new Set(['B']) },
    clonedPanelsRef: { current: new Set(['B']) },
    retiredPanelIdsRef: { current: new Set() },
    panelLoadGenerationRef: { current: Object.create(null) },
    overlayHoldTimersRef: { current: Object.create(null) },
    clearTimeout: () => {},
    setReadyPanels: makeSetter(),
    setDataReadyPanels: makeSetter(),
    setOverlayFallbackPanels: makeSetter(),
    setFailedPanels: (updater) => updater(new Map([['B', {}]])),
  };
  sandbox.clearedPersist = [];
  sandbox.clearPersistedPanelFileId = (panelId) => {
    sandbox.clearedPersist.push(panelId);
  };
  installGridHelpers(source, sandbox, `
    ${extractFunction(source, 'bumpPanelLoadGeneration')}
    function runRemovalLoop() {
      ${removalLoop}
    }
    this.runRemovalLoop = runRemovalLoop;
  `);
  sandbox.runRemovalLoop();
  assert.equal(sandbox.hostSyncedPanelsRef.current.has('B'), false, 'host sync id is purged on removal');
  assert.equal(sandbox.primedPanelsRef.current.has('B'), false, 'prime id is purged on removal');
  assert.equal(sandbox.orderSyncedPanelsRef.current.has('B'), false, 'order-sync id is purged on removal');
  assert.equal(sandbox.clonedPanelsRef.current.has('B'), false, 'clone id is purged on removal');
  assert.deepEqual(sandbox.clearedPersist, ['B'], 'persisted panel fileId cleared on removal');
  assert.equal(sandbox.retiredPanelIdsRef.current.has('B'), true, 'removed id is marked retired for recycle heal');
  // Generation bump is purge-gated; kill-switch on ⇒ still 0, but re-prime sets clear.
  if (!killSwitch) {
    assert.equal(sandbox.panelLoadGenerationRef.current.B, 1, 'removal bumps load generation');
  }
  assert.equal(sandbox.removed, 'B', 'manager chart is removed');
}

test('switch split: grid switch truthiness covers absent, true, false and undefined', () => {
  assert.ok(SOURCE.includes(SWITCH), 'grid source uses the PURGE-2 grid switch');
  assert.ok(!SOURCE.includes('__TALARIA_DISABLE_MC_PANEL_STATE_PURGE_V1'), 'grid source no longer uses the PURGE-1 panel switch');
  const result = exerciseSwitch();
  note('switch-cell-absent', result.absent === true, `purgeActive=${result.absent}`);
  note('switch-cell-true', result.presentTrue === false, `purgeActive=${result.presentTrue}`);
  note('switch-cell-false', result.presentFalse === true, `purgeActive=${result.presentFalse}`);
  note('switch-cell-undefined', result.presentUndefined === true, `purgeActive=${result.presentUndefined}`);
});

test('PG-1: active splitter drags release all listeners and locked iframes', () => {
  exercisePg1();
  note('pg1-splitter-release', true, 'behaviour releases two concurrent drags');
});

test('PG-2: page-lifetime window.__mcManager root is deleted on cleanup', () => {
  exercisePg2();
  note('pg2-mcmanager-delete', true, '__mcManager is paired with manager cleanup');
});

test('PG-3: host order bus retry interval is cleared and cannot reinstall after cleanup', () => {
  exercisePg3();
  note('pg3-host-bus-interval', true, 'retry interval no longer outlives cleanup');
});

test('PG-3 FLAG-01: the retry cleanup switch is observable without the purge switch', () => {
  exercisePg3(SOURCE, { hostBusOff: true });
  exercisePg3(SOURCE, { purgeOff: true });
  note('pg3-host-bus-switch-independent', true, 'cleanup answers to its own switch, not to PURGE-2');
});

test('PG-4: stale load continuations cannot act on replacement panels', async () => {
  await exercisePg4StaleGeneration();
  note('pg4-load-continuation', true, 'generation gate blocks stale load finish');
});

test('B3: flag-on load finish preserves HEAD side effects when chart re-resolution is null', async () => {
  await exerciseB3FlagOnExactness();
  note('b3-flag-on-exactness', true, 'legacy switch still persists and fans out');
});

test('R1: retry remove-then-readd under same id invalidates pending loads', async () => {
  await exerciseRetryRemoveReadd();
  note('r1-retry-generation-bump', true, 'retry path bumps generation before re-add');
});

test('PG-5: reconcile removal purges id-only per-panel sets for correctness', () => {
  exercisePg5();
  note('pg5-id-only-sets', true, 'id-only state purged; not a document-retainer fix');
});

test('PG-5 FLAG-03: kill-switch ON still re-primes recycled panel ids', () => {
  exercisePg5(SOURCE, { killSwitch: true });
  note('pg5-kill-switch-still-reprimes', true, 'order/clone sets cleared even when purge disabled');
});

test('neutering table: PG-1 through PG-5 and B3 go red when guards are disabled', async () => {
  await expectRejectsCell('neuter-pg1', () => exercisePg1(replaceOnce(
    SOURCE,
    'function releaseSplitterDragReferences() {\n                if (!mcGridStatePurgeV1Enabled()) return;',
    'function releaseSplitterDragReferences() {\n                if (1) return;\n                if (!mcGridStatePurgeV1Enabled()) return;',
  )));
  await expectRejectsCell('neuter-pg2', () => exercisePg2(replaceOnce(
    SOURCE,
    'if (mcGridStatePurgeV1Enabled() && window.__mcManager === managerRef.current)',
    'if (false && mcGridStatePurgeV1Enabled() && window.__mcManager === managerRef.current)',
  )));
  await expectRejectsCell('neuter-pg3', () => exercisePg3(replaceOnce(
    SOURCE,
    'if (hostBusRetryInterval && mcHostBusRetryTimerCleanupV1Enabled())',
    'if (false && hostBusRetryInterval && mcHostBusRetryTimerCleanupV1Enabled())',
  )));
  await expectRejectsCell('neuter-pg4', () => exercisePg4StaleGeneration(replaceOnce(
    SOURCE,
    'const panelLoadStillCurrent = () => !mcGridStatePurgeV1Enabled()\n                || (panelLoadGenerationRef.current[pid] || 0) === loadGeneration;',
    'const panelLoadStillCurrent = () => true || !mcGridStatePurgeV1Enabled()\n                || (panelLoadGenerationRef.current[pid] || 0) === loadGeneration;',
  )));
  await expectRejectsCell('neuter-pg5', () => exercisePg5(replaceOnce(
    SOURCE,
    'orderSyncedPanelsRef.current.delete(existingId);\n                clonedPanelsRef.current.delete(existingId);',
    '/* neutered: orderSyncedPanelsRef.current.delete(existingId);\n                clonedPanelsRef.current.delete(existingId); */',
  )));
  await expectRejectsCell('neuter-b3-legacy-null-check', () => exerciseB3FlagOnExactness(replaceOnce(
    SOURCE,
    'const currentChart = mcGridStatePurgeV1Enabled() ? getChartForPanelId(pid) : ch;\n                if (mcGridStatePurgeV1Enabled() && !currentChart) return null;',
    'const currentChart = getChartForPanelId(pid);\n                if (!currentChart) return null;',
  )));
});

test('focus-side-effect finding: guard reads entry.iframe but manager entries expose entry.frame', () => {
  assert.ok(SOURCE.includes('const iw = entry && entry.iframe && entry.iframe.contentWindow;'),
    'focus panning guard still reads entry.iframe');
  assert.ok(SOURCE.includes('const ch = entry && entry.frame && entry.frame.contentWindow'),
    'nearby manager-entry access uses entry.frame');
  note('focus-guard-entry-frame-finding', true,
    'reported separately: panning guard likely never observes iframe panels');
});
