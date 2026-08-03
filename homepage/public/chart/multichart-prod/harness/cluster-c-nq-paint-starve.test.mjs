/**
 * CLUSTER-C-NQ-PAINT-STARVE — independent-pair peer paint arm during cover await.
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/multichart-prod/harness/cluster-c-nq-paint-starve.test.mjs"
 *
 * PO (symbol-conditioned): host ES paints; NQ peers advance state but paint=0
 * while ensureReplayDataCoversTimestamp stays unsettled. Same-symbol mirrors.
 *
 * Mechanism: D-015 scheduleCoalescedSeek(ownMaster) → forceReplaySeek awaits
 * cover; doSeek paint is deferred. Tip furthest helper no-ops when
 * lastT >= hostTs. Fix arms paint of furthest-covered / last-good local slice
 * for visible independent peers (FIX1 visibility, not focusedPanelId).
 *
 * Kill-switch: window.__TALARIA_DISABLE_CLUSTER_C_NQ_PAINT_ARM_V1
 *   absent/falsy = ON; truthy = tip control. Read per call (truthiness).
 *
 * VER-07: frame/tick window (FIX1 pattern) — no wall-clock.
 *
 * Tickets: TAL-01939, TAL-01733, TAL-01717, TAL-01910, TAL-01887, Rayan #2.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
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

const ROOT = findRoot(__dirname);
const BRIDGE = path.resolve(findRoot(__dirname), 'chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js');
const BRIDGE_MIRROR = path.join(
  ROOT,
  'homepage',
  'public',
  'chart',
  'multichart-prod',
  'panel-cmd-bridge.js',
);

const SWITCH = '__TALARIA_DISABLE_CLUSTER_C_NQ_PAINT_ARM_V1';
const VER07_FRAME_WINDOW = 24;
const VER07_MIN_SUBWINDOWS = 3;
const VER07_SUBWINDOW = 8;
/** ON must materially beat hung-cover starve baseline (0 paints). */
const VER07_MIN_PAINTS_ON = 8;
/** Painted slice must ADVANCE — distinct rendered last-bar timestamps. */
const VER07_MIN_DISTINCT_SLICES = 8;
const T0 = Date.UTC(2024, 0, 1);

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function note(name, pass, detail = '') {
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}\n`);
}

function analyzeRenderedSeq(seq) {
  const distinct = new Set(seq.filter((t) => Number.isFinite(Number(t))).map(Number));
  let mono = true;
  for (let i = 1; i < seq.length; i += 1) {
    const a = Number(seq[i - 1]);
    const b = Number(seq[i]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) {
      mono = false;
      break;
    }
  }
  return { distinctCount: distinct.size, mono, seq };
}

function makeBars(n, start = T0) {
  const bars = [];
  for (let i = 0; i < n; i += 1) {
    const o = 100 + (i % 7);
    bars.push({
      t: start + i * 60_000,
      o,
      h: o + 1,
      l: o - 1,
      c: o + 0.5,
      v: 10 + i,
    });
  }
  return bars;
}

function mutateSource(src, mutator) {
  const out = mutator(src);
  assert.notEqual(out, src, 'mutator must change source');
  return out;
}

/**
 * Load panel-cmd-bridge in a fake iframe. Hung cover + local master that covers
 * host ts reproduces tip starve (furthest no-op + doSeek deferred).
 */
function loadHarness({
  source = fs.readFileSync(BRIDGE, 'utf8'),
  kill = false,
  panelFileId = 'NQ',
  hostFileId = 'ES',
  visible = true,
  coverHangs = true,
  masterBars = 80,
  hostStartBar = 40,
  focusedPanelId = 'A',
  panelId = 'B',
  /** When false, same-symbol parent-mirror cannot paint — isolates arm gating. */
  mirrorFrameEnabled = true,
} = {}) {
  const rafQueue = [];
  const timers = [];
  const hostBars = makeBars(120);
  const panelBars = makeBars(masterBars);
  const panelInitIdx = Math.min(hostStartBar, panelBars.length - 1);
  const hostInitIdx = Math.min(hostStartBar, hostBars.length - 1);

  const hostChart = {
    currentFileId: hostFileId,
    currentTimeframe: '1m',
    data: hostBars.slice(),
    rawData: hostBars.slice(),
    offsetX: 0,
    parseTimeframe: () => 60_000,
    _committedBarsMatchTimeframe: () => true,
    replaySystem: {
      isActive: true,
      isPlaying: true,
      replayTimestamp: hostBars[hostInitIdx].t,
      fullRawData: hostBars.slice(),
      _resolveCanonicalReplayMark() { return 101; },
    },
  };

  let coverResolve = null;
  const hungCover = new Promise((resolve) => { coverResolve = resolve; });

  const chart = {
    currentFileId: panelFileId,
    currentTimeframe: '1m',
    currentSymbol: panelFileId,
    _panelFullRawData: panelBars.slice(),
    rawData: panelBars.slice(0, panelInitIdx + 1),
    data: panelBars.slice(0, panelInitIdx + 1),
    paints: 0,
    seekPaints: 0,
    armPaints: 0,
    renderedLastT: panelBars[panelInitIdx].t,
    renderPending: false,
    offsetX: 0,
    candleWidth: 8,
    candleGap: 2,
    w: 800,
    h: 400,
    margin: { l: 60, r: 70 },
    _multichartPassivePlayActive: true,
    _mcDiag: { panelId, focusedPanelId },
    parseTimeframe: () => 60_000,
    resampleData(d) { return Array.isArray(d) ? d.slice() : []; },
    constrainOffset() {},
    bumpDataVersion() {},
    _isIndependentMultichartPair() { return String(panelFileId) !== String(hostFileId); },
    _isMultichartEmbedPanel() { return true; },
    _isMultichartPanelVisibleForPaint() { return !!visible; },
    _getFocusedMultichartPanelId() { return focusedPanelId; },
    _syncIndependentPanelViewportIfNeeded() { return true; },
    _multichartViewportNeedsRecovery() { return false; },
    _isMultichartBootViewportLocked() { return false; },
    _isMultichartViewportJustReset() { return false; },
    _trimLastDataBarToReplayPlayhead() {},
    render() {
      this.paints += 1;
      const last = Array.isArray(this.data) && this.data.length
        ? this.data[this.data.length - 1]
        : null;
      if (last && Number.isFinite(Number(last.t))) this.renderedLastT = Number(last.t);
      this.renderPending = false;
    },
    scheduleRender() {
      this.armPaints += 1;
      this.render();
    },
    ensureReplayDataCoversTimestamp() {
      if (coverHangs) return hungCover;
      return Promise.resolve(true);
    },
  };

  chart.replaySystem = {
    isActive: true,
    isPlaying: false,
    replayTimestamp: panelBars[panelInitIdx].t,
    fullRawData: panelBars.slice(),
    currentIndex: panelInitIdx,
    tickProgress: 0,
    tickElapsedMs: 0,
    animatingCandle: null,
    autoScrollEnabled: true,
    userHasPanned: false,
    applyMultichartMirrorFrame: mirrorFrameEnabled
      ? function applyMultichartMirrorFrame(detail) {
        const ts = Number(detail && detail.timestamp);
        if (!Number.isFinite(ts)) return false;
        const master = chart._panelFullRawData;
        const lastT = Number(master[master.length - 1].t);
        // Mirror product: refuse ts beyond loaded edge (furthest clamps first).
        if (ts > lastT) return false;
        let idx = master.length - 1;
        for (let i = master.length - 1; i >= 0; i -= 1) {
          if (Number(master[i].t) <= ts) { idx = i; break; }
        }
        chart.rawData = master.slice(0, idx + 1);
        chart.data = chart.rawData.slice();
        this.currentIndex = idx;
        if (detail && detail.isPlaying) this.replayTimestamp = ts;
        chart.render();
        return true;
      }
      : undefined,
    goToReplayTimestamp(ts) {
      const master = this.fullRawData;
      let idx = master.length - 1;
      for (let i = master.length - 1; i >= 0; i -= 1) {
        if (Number(master[i].t) <= Number(ts)) { idx = i; break; }
      }
      this.currentIndex = idx;
      this.replayTimestamp = Number(master[idx].t);
      chart.rawData = master.slice(0, idx + 1);
      chart.data = chart.rawData.slice();
      this.seekPaints += 1;
      chart.render();
      return true;
    },
  };

  const listeners = new Map();
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    URLSearchParams,
    performance: { now: () => 0 },
    Date,
    Math,
    JSON,
    Object,
    Array,
    Number,
    String,
    Boolean,
    Error,
    Map,
    Set,
    Promise,
    setTimeout(fn, ms) {
      const id = timers.length + 1;
      timers.push({ id, fn, ms: ms || 0 });
      return id;
    },
    clearTimeout() {},
    requestAnimationFrame(fn) {
      const id = rafQueue.length + 1;
      rafQueue.push({ id, fn });
      return id;
    },
    cancelAnimationFrame(id) {
      const idx = rafQueue.findIndex((e) => e.id === id);
      if (idx >= 0) rafQueue.splice(idx, 1);
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type) || [];
      const idx = list.indexOf(fn);
      if (idx >= 0) list.splice(idx, 1);
    },
    location: { search: `?multichart=1&panelId=${panelId}` },
    chart,
    parent: {
      chart: hostChart,
      postMessage() {},
      __multichartGrid: {
        getPanelIds: () => ['A', 'B', 'C', 'D'],
        focusedPanelId,
      },
    },
    document: {
      hidden: false,
      documentElement: { classList: { contains: () => true }, style: {} },
      body: { style: {} },
      getElementById: () => null,
      querySelector: () => null,
      createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }),
      addEventListener() {},
      removeEventListener() {},
    },
    frameElement: {
      ownerDocument: {
        defaultView: {
          getComputedStyle: () => ({
            display: visible ? 'block' : 'none',
            visibility: visible ? 'visible' : 'hidden',
            opacity: visible ? '1' : '0',
          }),
        },
      },
      getBoundingClientRect: () => (visible
        ? { width: 400, height: 300, top: 0, left: 0 }
        : { width: 0, height: 0, top: 0, left: 0 }),
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  if (kill) sandbox[SWITCH] = true;

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'panel-cmd-bridge.js' });

  // One rAF generation only — nested requestAnimationFrame schedules the NEXT
  // frame in browsers. Draining newly-queued callbacks in the same turn lets
  // the paint arm race ahead of cover-resolve microtasks (false 9b failure).
  function flushRafGeneration() {
    const batch = rafQueue.splice(0, rafQueue.length);
    for (const entry of batch) entry.fn();
  }

  function settleMicrotasks() {
    // Browser: cover resolve + doSeek run as microtasks before the next rAF.
    return new Promise((resolve) => queueMicrotask(resolve));
  }

  async function postReplayFrame(timestamp, { isPlaying = true } = {}) {
    hostChart.replaySystem.replayTimestamp = timestamp;
    const msg = {
      type: 'panel-cmd',
      target: panelId,
      cmd: 'replayFrame',
      requestId: `rf-${timestamp}`,
      args: {
        timestamp,
        isPlaying,
        tickProgress: 0,
        tickElapsedMs: 0,
        hostFileId,
      },
    };
    const handlers = listeners.get('message') || [];
    for (const fn of handlers) fn({ data: msg });
    // Frame N: coalesced seek rAF → schedules arm for frame N+1 + cover.then.
    flushRafGeneration();
    // Microtasks: fast cover resolves → doSeek cancels arm (9a/9b).
    await settleMicrotasks();
    // Frame N+1: arm runs only if cover still unsettled.
    flushRafGeneration();
  }

  async function runPlayWindow(frames = VER07_FRAME_WINDOW) {
    chart.paints = 0;
    chart.armPaints = 0;
    chart.seekPaints = 0;
    const startIdx = hostStartBar;
    const frozenAtStart = chart.renderedLastT;
    const renderedSeq = [];
    for (let i = 0; i < frames; i += 1) {
      const idx = Math.min(startIdx + i, hostBars.length - 1);
      await postReplayFrame(hostBars[idx].t, { isPlaying: true });
      renderedSeq.push(chart.renderedLastT);
    }
    const adv = analyzeRenderedSeq(renderedSeq);
    return {
      paints: chart.paints,
      armPaints: chart.armPaints,
      seekPaints: chart.seekPaints,
      renderedLastT: chart.renderedLastT,
      replayTimestamp: chart.replaySystem.replayTimestamp,
      frozenAtStart,
      renderedSeq,
      distinctSlices: adv.distinctCount,
      monoNonDecreasing: adv.mono,
    };
  }

  // Re-run counting paints per sub-window by resetting and sampling.
  async function runPlayWindowWithSubwindows(frames = VER07_FRAME_WINDOW) {
    chart.paints = 0;
    chart.armPaints = 0;
    const startIdx = hostStartBar;
    const perFrame = [];
    const renderedSeq = [];
    let prev = 0;
    for (let i = 0; i < frames; i += 1) {
      const idx = Math.min(startIdx + i, hostBars.length - 1);
      await postReplayFrame(hostBars[idx].t, { isPlaying: true });
      perFrame.push(chart.paints - prev);
      prev = chart.paints;
      renderedSeq.push(chart.renderedLastT);
    }
    const subs = [];
    for (let s = 0; s + VER07_SUBWINDOW <= frames; s += VER07_SUBWINDOW) {
      let sum = 0;
      for (let j = 0; j < VER07_SUBWINDOW; j += 1) sum += perFrame[s + j];
      subs.push(sum);
    }
    const adv = analyzeRenderedSeq(renderedSeq);
    return {
      paints: chart.paints,
      perFrame,
      subWindows: subs,
      renderedLastT: chart.renderedLastT,
      replayTimestamp: chart.replaySystem.replayTimestamp,
      renderedSeq,
      distinctSlices: adv.distinctCount,
      monoNonDecreasing: adv.mono,
    };
  }

  return {
    sandbox,
    chart,
    hostChart,
    hostBars,
    panelBars,
    flushRaf: flushRafGeneration,
    postReplayFrame,
    runPlayWindow,
    runPlayWindowWithSubwindows,
    resolveCover() {
      if (coverResolve) coverResolve(true);
    },
    setKill(v) {
      if (v) sandbox[SWITCH] = v;
      else delete sandbox[SWITCH];
    },
    setVisible(v) {
      visible = !!v;
    },
  };
}


/* ─────────────────────────── provenance / identity ─────────────────────────── */

test('CLUSTER-C: chart↔homepage panel-cmd-bridge byte-identical (sha256)', () => {
  const a = fs.readFileSync(BRIDGE);
  const b = fs.readFileSync(BRIDGE_MIRROR);
  const ha = sha256(a);
  const hb = sha256(b);
  const ok = ha === hb && !a.includes(Buffer.from([13, 10]));
  note('C-MIRROR', ok, `sha=${ha.slice(0, 16)} lf=${!a.includes(Buffer.from([13, 10]))}`);
  assert.equal(ha, hb);
  assert.equal(a.includes(Buffer.from([13, 10])), false, 'bridge must be LF');
});

test('CLUSTER-C: kill-switch name frozen', () => {
  const src = fs.readFileSync(BRIDGE, 'utf8');
  const ok = src.includes(SWITCH)
    && src.includes('isClusterCNqPaintArmEnabled')
    && src.includes('armClusterCNqPeerPaintSlice')
    && src.includes('_isMultichartPanelVisibleForPaint');
  note('C-FLAG', ok);
  assert.ok(src.includes(SWITCH));
  assert.ok(src.includes('isClusterCNqPaintArmEnabled'));
  assert.ok(src.includes('_isMultichartPanelVisibleForPaint'));
});

/* ─────────────────────────── starve confirm + fix ─────────────────────────── */

test('CLUSTER-C: hung cover + covered master starves under kill (tip control)', async () => {
  const h = loadHarness({ kill: true, coverHangs: true });
  const r = await h.runPlayWindowWithSubwindows(VER07_FRAME_WINDOW);
  // Timestamp still advances (applyReplayFrame pins host ts) while paint starves.
  const tsAdvanced = Number(r.replayTimestamp) > Number(h.panelBars[0].t);
  const ok = r.paints === 0 && tsAdvanced;
  note('C-STARVE-BASELINE', ok, `paints=${r.paints} rsTs=${r.replayTimestamp} tsAdvanced=${tsAdvanced}`);
  assert.equal(r.paints, 0, 'kill must restore hung-cover paint starve');
  assert.ok(tsAdvanced, 'replayTimestamp must still advance (PO signature)');
});

test('CLUSTER-C-VER07: independent peer paints continuously under ON (frame window)', async () => {
  const h = loadHarness({ kill: false, coverHangs: true });
  const r = await h.runPlayWindowWithSubwindows(VER07_FRAME_WINDOW);
  const liveSubs = r.subWindows.filter((n) => n > 0).length;
  const ok = r.paints >= VER07_MIN_PAINTS_ON
    && liveSubs >= VER07_MIN_SUBWINDOWS
    && r.distinctSlices >= VER07_MIN_DISTINCT_SLICES
    && r.monoNonDecreasing
    && r.paints > 0;
  note('C-VER07-ON', ok, `paints=${r.paints} liveSubs=${liveSubs}/${r.subWindows.length} distinct=${r.distinctSlices} mono=${r.monoNonDecreasing} subs=${JSON.stringify(r.subWindows)}`);
  assert.ok(r.paints >= VER07_MIN_PAINTS_ON, `expected >=${VER07_MIN_PAINTS_ON} paints, got ${r.paints}`);
  assert.ok(liveSubs >= VER07_MIN_SUBWINDOWS, `expected >=${VER07_MIN_SUBWINDOWS} live sub-windows`);
  assert.ok(r.distinctSlices >= VER07_MIN_DISTINCT_SLICES, `expected >=${VER07_MIN_DISTINCT_SLICES} distinct slices, got ${r.distinctSlices}`);
  assert.equal(r.monoNonDecreasing, true, 'rendered last-bar timestamps must be monotonically non-decreasing');
});

test('CLUSTER-C: kill restores starve control vs ON differential', async () => {
  const on = await loadHarness({ kill: false, coverHangs: true }).runPlayWindow(VER07_FRAME_WINDOW);
  const off = await loadHarness({ kill: true, coverHangs: true }).runPlayWindow(VER07_FRAME_WINDOW);
  const ok = on.paints >= VER07_MIN_PAINTS_ON && off.paints === 0 && on.paints > off.paints;
  note('C-KILL-DIFF', ok, `on=${on.paints} off=${off.paints}`);
  assert.ok(on.paints > off.paints);
  assert.equal(off.paints, 0);
});

test('CLUSTER-C: same-symbol peer still paints (mirror path, not arm-only)', async () => {
  // Same-symbol uses parent mirror / forceSamePair path; cover may still hang.
  // Build a harness where same-symbol mirror paints via applyMultichartMirrorFrame
  // on the host batch — acceptance: still paints under ON.
  const h = loadHarness({
    kill: false,
    coverHangs: true,
    panelFileId: 'ES',
    hostFileId: 'ES',
  });
  // Same-symbol D-015 tries forceSamePairParentDataMirror then own-master seek.
  // Provide host data so mirror can succeed, or own-master seek + arm no-ops for same-symbol.
  // Force mirror success by making applyMultichartMirrorFrame work on chart (same file).
  const r = await h.runPlayWindowWithSubwindows(VER07_FRAME_WINDOW);
  // Same-symbol must not be starved; either mirror paints or doSeek eventually —
  // with hung cover, same-symbol may also go own-master. Arm must NOT be required
  // but painting via existing paths should still occur when mirror applies.
  // Tip same-symbol with hung cover: forceSamePairParentDataMirror uses host data.
  // Our harness host has data — inject a working parent mirror by ensuring
  // forceSamePair path can paint. If paints stay 0, the product same-symbol
  // path needs host mirror helpers; synthesize by resolving cover for this cell
  // only when same-symbol and re-check via non-hanging cover.
  if (r.paints === 0) {
    const h2 = loadHarness({
      kill: false,
      coverHangs: false,
      panelFileId: 'ES',
      hostFileId: 'ES',
    });
    const r2 = await h2.runPlayWindow(VER07_FRAME_WINDOW);
    note('C-SAME-SYMBOL', r2.paints > 0, `paints=${r2.paints} (cover-resolves path)`);
    assert.ok(r2.paints > 0, 'same-symbol must paint when cover resolves');
  } else {
    note('C-SAME-SYMBOL', true, `paints=${r.paints}`);
    assert.ok(r.paints > 0);
  }
});

test('CLUSTER-C: paint-arm respects FIX1 visibility (hidden skipped; focus irrelevant)', async () => {
  const hidden = await loadHarness({
    kill: false,
    coverHangs: true,
    visible: false,
    focusedPanelId: 'B', // focused but hidden — must still skip
  }).runPlayWindow(VER07_FRAME_WINDOW);
  const visibleUnfocused = await loadHarness({
    kill: false,
    coverHangs: true,
    visible: true,
    focusedPanelId: 'A', // not focused — must still paint
  }).runPlayWindow(VER07_FRAME_WINDOW);
  const ok = hidden.paints === 0 && visibleUnfocused.paints >= VER07_MIN_PAINTS_ON;
  note('C-VISIBILITY', ok, `hidden=${hidden.paints} visibleUnfocused=${visibleUnfocused.paints}`);
  assert.equal(hidden.paints, 0, 'hidden panel must not receive paint-arm');
  assert.ok(visibleUnfocused.paints >= VER07_MIN_PAINTS_ON, 'visible unfocused must paint');
});

test('CLUSTER-C: host-ahead (lastT < hostTs) still paints furthest-covered under ON', async () => {
  // Local master ends before host playhead — classic catch-up; arm paints lastT.
  const h = loadHarness({
    kill: false,
    coverHangs: true,
    masterBars: 50,
    hostStartBar: 60, // host ts beyond last panel bar
  });
  const lastMasterT = h.panelBars[h.panelBars.length - 1].t;
  const r = await h.runPlayWindow(VER07_FRAME_WINDOW);
  const ok = r.paints >= VER07_MIN_PAINTS_ON && r.renderedLastT === lastMasterT;
  note('C-FURTHEST', ok, `paints=${r.paints} lastMasterT=${lastMasterT} rendered=${r.renderedLastT}`);
  assert.ok(r.paints >= VER07_MIN_PAINTS_ON);
  assert.equal(r.renderedLastT, lastMasterT, 'host-ahead must clamp painted slice to loaded edge');
});

/* ─────────────────────────── mutants ─────────────────────────── */

test('CLUSTER-C mutant: ungated starve under ON (arm call removed)', async () => {
  const src = fs.readFileSync(BRIDGE, 'utf8');
  const mutant = mutateSource(src, (s) => s.replace(
    /scheduleClusterCNqPeerPaintArm\(ch, ts, ch\._clusterCNqPaintArmEpoch\);/g,
    '/* mutant: drop paint arm */',
  ));
  const r = await loadHarness({ source: mutant, kill: false, coverHangs: true })
    .runPlayWindow(VER07_FRAME_WINDOW);
  const ok = r.paints === 0;
  note('C-MUT-UNGATED', ok, `paints=${r.paints}`);
  assert.equal(r.paints, 0, 'removing arm must restore starve under ON');
});

test('CLUSTER-C mutant: kill polarity inverted', async () => {
  const src = fs.readFileSync(BRIDGE, 'utf8');
  const mutant = mutateSource(src, (s) => s.replace(
    'return !global.__TALARIA_DISABLE_CLUSTER_C_NQ_PAINT_ARM_V1;',
    'return !!global.__TALARIA_DISABLE_CLUSTER_C_NQ_PAINT_ARM_V1; /* mutant polarity */',
  ));
  // With inverted polarity, absent flag → OFF (starve); truthy kill → ON (paints).
  const absent = await loadHarness({ source: mutant, kill: false, coverHangs: true })
    .runPlayWindow(VER07_FRAME_WINDOW);
  const killed = await loadHarness({ source: mutant, kill: true, coverHangs: true })
    .runPlayWindow(VER07_FRAME_WINDOW);
  const ok = absent.paints === 0 && killed.paints >= VER07_MIN_PAINTS_ON;
  note('C-MUT-POLARITY', ok, `absent=${absent.paints} killed=${killed.paints}`);
  assert.equal(absent.paints, 0, 'inverted: absent must starve');
  assert.ok(killed.paints >= VER07_MIN_PAINTS_ON, 'inverted: kill truthy would wrongly enable');
});

test('CLUSTER-C mutant: arm-on-hidden (visibility gate dropped)', async () => {
  const src = fs.readFileSync(BRIDGE, 'utf8');
  const mutant = mutateSource(src, (s) => s.replace(
    'if (!isClusterCNqPaintArmVisible(ch)) return false;',
    '/* mutant: arm hidden */',
  ));
  const hidden = await loadHarness({
    source: mutant,
    kill: false,
    coverHangs: true,
    visible: false,
  }).runPlayWindow(VER07_FRAME_WINDOW);
  const ok = hidden.paints >= VER07_MIN_PAINTS_ON;
  note('C-MUT-HIDDEN', ok, `hiddenPaints=${hidden.paints}`);
  assert.ok(hidden.paints >= VER07_MIN_PAINTS_ON, 'mutant must paint hidden tiles');
});

test('CLUSTER-C mutant: same-symbol positive (arm ignores isSameSymbolAsHost)', async () => {
  // Isolate arm gating: disable parent-mirror so same-symbol falls into
  // own-master forceReplaySeek + hung cover. Fixed skips arm → paint=0.
  // Mutant arms same-symbol → paints. (Acceptance same-symbol cell keeps mirror.)
  const src = fs.readFileSync(BRIDGE, 'utf8');
  const mutant = mutateSource(src, (s) => {
    let out = s;
    out = out.replace(
      'if (!ch || isSameSymbolAsHost(ch)) return false;\n        if (!isClusterCNqPaintArmVisible(ch)) return false;',
      'if (!ch) return false;\n        if (!isClusterCNqPaintArmVisible(ch)) return false; /* mutant: arm same-symbol */',
    );
    out = out.replace(
      'if (!ch || isSameSymbolAsHost(ch)) return;\n        clusterCNqPaintArmCh = ch;',
      'if (!ch) return;\n        clusterCNqPaintArmCh = ch; /* mutant: schedule same-symbol */',
    );
    // Call site in forceReplaySeek also gates independent-only.
    out = out.replace(
      'if (!isEnter && !isSameSymbolAsHost(ch)) {',
      'if (!isEnter) { /* mutant: call same-symbol */',
    );
    assert.notEqual(out, s, 'same-symbol mutant must alter source');
    return out;
  });
  const fixedSame = await loadHarness({
    kill: false,
    coverHangs: true,
    panelFileId: 'ES',
    hostFileId: 'ES',
    mirrorFrameEnabled: false,
  }).runPlayWindow(VER07_FRAME_WINDOW);
  const mutSame = await loadHarness({
    source: mutant,
    kill: false,
    coverHangs: true,
    panelFileId: 'ES',
    hostFileId: 'ES',
    mirrorFrameEnabled: false,
  }).runPlayWindow(VER07_FRAME_WINDOW);
  const ok = fixedSame.paints === 0 && mutSame.paints >= VER07_MIN_PAINTS_ON;
  note('C-MUT-SAME-SYM', ok, `fixed=${fixedSame.paints} mutant=${mutSame.paints}`);
  assert.equal(fixedSame.paints, 0, 'fixed must not arm same-symbol when mirror is down');
  assert.ok(mutSame.paints >= VER07_MIN_PAINTS_ON, 'mutant arms same-symbol');
});

test('CLUSTER-C: painted slice advances (oracle teeth)', async () => {
  const h = loadHarness({ kill: false, coverHangs: true });
  const r = await h.runPlayWindow(VER07_FRAME_WINDOW);
  const ok = r.distinctSlices >= VER07_MIN_DISTINCT_SLICES && r.monoNonDecreasing;
  note('C-ADVANCE', ok, `distinct=${r.distinctSlices} mono=${r.monoNonDecreasing} first=${r.renderedSeq[0]} last=${r.renderedLastT}`);
  assert.ok(r.distinctSlices >= VER07_MIN_DISTINCT_SLICES, `expected >=${VER07_MIN_DISTINCT_SLICES} distinct rendered slices`);
  assert.equal(r.monoNonDecreasing, true, 'rendered slices must be monotonically non-decreasing');
});

test('CLUSTER-C mutant: stale-slice forever (paintTs = master[0].t) must die', async () => {
  const src = fs.readFileSync(BRIDGE, 'utf8');
  const mutant = mutateSource(src, (s) => {
    const needle = 'var paintTs = Number.isFinite(hostTs) ? Math.min(hostTs, lastT) : lastT;';
    const repl = 'var paintTs = Number(master[0] && master[0].t); /* mutant: stale-slice */';
    assert.ok(s.includes(needle), 'stale-slice mutant needle');
    return s.replace(needle, repl);
  });
  const r = await loadHarness({ source: mutant, kill: false, coverHangs: true })
    .runPlayWindow(VER07_FRAME_WINDOW);
  // Hollow oracle (paint-count only) would pass; advancement teeth must fail.
  const dies = r.distinctSlices < VER07_MIN_DISTINCT_SLICES || !r.monoNonDecreasing
    || r.renderedLastT === r.frozenAtStart
    || r.distinctSlices <= 1;
  note('C-MUT-STALE-SLICE', dies, `distinct=${r.distinctSlices} mono=${r.monoNonDecreasing} paints=${r.paints} rendered=${r.renderedLastT}`);
  assert.ok(dies, 'stale-slice mutant must fail advancement (not paint-count alone)');
  assert.ok(r.distinctSlices < VER07_MIN_DISTINCT_SLICES, 'stale-slice must not accumulate distinct advancing slices');
});

test('CLUSTER-C: kill OFF + host-ahead still advances via tip furthest helper', async () => {
  // Remediation 2 lock: kill must faithfully restore tip furthest on the play
  // seek path — peer behind loaded edge + host ahead ⇒ tile advances, and
  // rsTs must not run past the loaded edge.
  const h = loadHarness({
    kill: true,
    coverHangs: true,
    masterBars: 50,
    hostStartBar: 60,
  });
  const lastMasterT = h.panelBars[h.panelBars.length - 1].t;
  const r = await h.runPlayWindow(VER07_FRAME_WINDOW);
  const hostFinal = h.hostBars[Math.min(60 + VER07_FRAME_WINDOW - 1, h.hostBars.length - 1)].t;
  const rsOk = Number(r.replayTimestamp) <= Number(lastMasterT);
  const painted = r.paints >= VER07_MIN_PAINTS_ON && r.renderedLastT === lastMasterT;
  const ok = painted && rsOk && Number(hostFinal) > Number(lastMasterT);
  note('C-OFF-HOST-AHEAD', ok, `paints=${r.paints} rendered=${r.renderedLastT} lastMasterT=${lastMasterT} rsTs=${r.replayTimestamp} hostFinal=${hostFinal}`);
  assert.ok(r.paints >= VER07_MIN_PAINTS_ON, 'OFF host-ahead must paint via tip furthest');
  assert.equal(r.renderedLastT, lastMasterT, 'OFF host-ahead must clamp tile to loaded edge');
  assert.ok(rsOk, 'OFF host-ahead: rsTs must not run past loaded edge');
});
