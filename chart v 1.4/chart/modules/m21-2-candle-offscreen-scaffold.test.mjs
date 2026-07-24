/**
 * M21-2 — candle-layer OffscreenCanvas scaffold gate (W3-owned, module-level ONLY).
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m21-2-candle-offscreen-scaffold.test.mjs"
 *
 * Evidence modes (env):
 *   M21_2_EVIDENCE=red|green|kill → docs/plan3/evidence/W3-M21-2-SCAFFOLD-20260724-<mode>.json
 *
 * Status: FABLE-AUTHORED RED-first gate. Product wiring (chart.js, HTML/bootstrap,
 * CSP, multichart-manager) is LOCKED until the Manager commits M21-1 — this file
 * exercises NEW module/worker files only:
 *   modules/m21-2-candle-offscreen-bridge.mjs   (main-thread side)
 *   workers/m21-2-candle-render-worker.js       (same-origin classic worker)
 *   modules/M21-2-CANDLE-OFFSCREEN-API.md       (authoritative contract)
 *
 * Kill-switch (provisional name ACCEPTED from W6 harness contract):
 *   __TALARIA_DISABLE_M21_2_CANDLE_OFFSCREEN_V1
 *
 * Scope rule: module-scaffold rows only. GPU / FPS / real-pixel parity / context
 * loss are forced NOT-MEASURABLE here and can NEVER go GREEN from this harness
 * (real-browser evidence required — W5 instrumentation).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHART_ROOT = path.resolve(__dirname, '..');

function findRepoRoot(fromDir) {
  let d = fromDir;
  for (let i = 0; i < 8; i += 1) {
    if (fs.existsSync(path.join(d, 'docs', 'plan3'))
      && fs.existsSync(path.join(d, 'homepage'))) return d;
    d = path.dirname(d);
  }
  throw new Error('repo root not found from ' + fromDir);
}
const REPO_ROOT = findRepoRoot(__dirname);
const CANON_CHART = path.join(REPO_ROOT, 'chart v 1.4', 'chart');
const HOME_CHART = path.join(REPO_ROOT, 'homepage', 'public', 'chart');
const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs', 'plan3', 'evidence');

const KS = '__TALARIA_DISABLE_M21_2_CANDLE_OFFSCREEN_V1';
const BRIDGE_REL = path.join('modules', 'm21-2-candle-offscreen-bridge.mjs');
const WORKER_REL = path.join('workers', 'm21-2-candle-render-worker.js');
const APIDOC_REL = path.join('modules', 'M21-2-CANDLE-OFFSCREEN-API.md');
const TEST_REL = path.join('modules', 'm21-2-candle-offscreen-scaffold.test.mjs');

const evidenceMode = String(process.env.M21_2_EVIDENCE || '').toLowerCase();
const evidenceRows = [];

function note(fixId, name, pass, detail = '') {
  evidenceRows.push({ q: fixId, name, pass: !!pass, detail });
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} [${fixId}] ${name}${detail ? ` — ${detail}` : ''}\n`);
}

function sha256(p) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
  catch { return null; }
}

// ─── Load scaffold (missing files ⇒ RED rows, not a harness crash) ──────────
let bridge = null;
let bridgeLoadErr = '';
try {
  bridge = await import(pathToFileURL(path.join(CHART_ROOT, BRIDGE_REL)).href);
} catch (e) { bridgeLoadErr = String(e && e.message || e); }

let workerMod = null;
let workerLoadErr = '';
try {
  const req = createRequire(import.meta.url);
  workerMod = req(path.join(CHART_ROOT, WORKER_REL));
} catch (e) { workerLoadErr = String(e && e.message || e); }

// ─── Fakes (dependency-injected; no DOM, no product code) ───────────────────
function makeFakeCanvas() {
  const rec = {
    transferCalls: 0,
    widthWrites: 0,
    heightWrites: 0,
    ctx2d: { ops: [], clearRect() { this.ops.push('clearRect'); }, fillRect() { this.ops.push('fillRect'); }, beginPath() {}, moveTo() {}, lineTo() {}, stroke() { this.ops.push('stroke'); }, set fillStyle(_v) {}, set strokeStyle(_v) {}, set lineWidth(_v) {} },
  };
  let w = 300; let h = 150;
  const offscreen = {
    get width() { return w; },
    set width(v) { w = v; },
    get height() { return h; },
    set height(v) { h = v; },
    getContext(kind) { return kind === '2d' ? rec.ctx2d : null; },
  };
  const canvas = {
    rec,
    get width() { return w; },
    set width(v) { rec.widthWrites += 1; w = v; },
    get height() { return h; },
    set height(v) { rec.heightWrites += 1; h = v; },
    transferControlToOffscreen() {
      rec.transferCalls += 1;
      if (rec.transferCalls > 1) throw new Error('InvalidStateError: canvas already transferred');
      return offscreen;
    },
  };
  return canvas;
}

/**
 * Fake same-origin worker wired to the REAL worker core (when present).
 * CANDLE_FRAME messages go through structuredClone({transfer}) so ArrayBuffer
 * detach is genuine; INIT/RESIZE/etc pass by reference (fake canvas has methods).
 */
function makeFakeWorkerChannel(coreDeps = {}) {
  const outbox = [];
  /** @type {any} */
  let workerRef = null;
  const core = workerMod
    ? workerMod.createCandleWorkerCore({
      post: (m) => {
        outbox.push(m);
        // Mirror the real worker channel: replies reach worker.onmessage so the
        // bridge can consume ACK/CANDLE_ERROR (review correction — ACK-driven stats).
        if (workerRef && typeof workerRef.onmessage === 'function') {
          workerRef.onmessage({ data: m });
        }
      },
      ...coreDeps,
    })
    : null;
  const worker = {
    terminated: 0,
    postErrors: [],
    onerror: null,
    onmessageerror: null,
    onmessage: null,
    postMessage(msg, transfer) {
      if (!core) throw new Error('worker core missing');
      if (msg && msg.type === 'CANDLE_FRAME') {
        const cloned = structuredClone(msg, { transfer: (transfer || []).filter((t) => t instanceof ArrayBuffer) });
        core.handleMessage(cloned);
      } else {
        core.handleMessage(msg);
      }
    },
    terminate() { this.terminated += 1; },
  };
  workerRef = worker;
  return { worker, core, outbox };
}

/**
 * Manual worker: records posts, NEVER acks on its own — the test injects
 * worker→main replies by calling the bridge-installed onmessage directly.
 * Gives full adversarial control over ACK ordering/forgery (R6 ledger gate).
 */
function makeManualWorker() {
  return {
    posted: [],
    terminated: 0,
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage(msg) { this.posted.push(msg); },
    terminate() { this.terminated += 1; },
  };
}

function makeBars(n, t0 = 1000) {
  const bars = [];
  for (let i = 0; i < n; i += 1) {
    bars.push({ t: t0 + i * 60, o: 10 + i, h: 11 + i, l: 9 + i, c: 10.5 + i, v: 100 + i });
  }
  return bars;
}

function packBars(bars) {
  const a = new Float64Array(bars.length * 6);
  bars.forEach((b, i) => {
    const o = i * 6;
    a[o] = b.t; a[o + 1] = b.o; a[o + 2] = b.h; a[o + 3] = b.l; a[o + 4] = b.c; a[o + 5] = b.v;
  });
  return a;
}

function makeBridge(opts = {}) {
  const canvas = opts.canvas || makeFakeCanvas();
  const channel = opts.channel === null ? null : (opts.channel || makeFakeWorkerChannel());
  const flushQueue = [];
  const b = bridge.createCandleRenderWorkerBridge({
    canvas,
    windowRef: opts.windowRef || {},
    env: opts.env || {},
    ownershipRegistry: 'ownershipRegistry' in opts ? opts.ownershipRegistry : { owner: null },
    workerFactory: opts.workerFactory || (() => channel.worker),
    scheduler: opts.scheduler || ((cb) => flushQueue.push(cb)),
    cssWidth: 800,
    cssHeight: 600,
    dpr: 1,
    ...opts.extra,
  });
  return { b, canvas, channel, flush: () => { while (flushQueue.length) flushQueue.shift()(); } };
}

// ─── M21-2-WORKER: same-origin external classic worker, no blob ─────────────
test('M21-2-WORKER: same-origin classic worker file, no blob, drift-gated constants', () => {
  const canonWorker = path.join(CANON_CHART, WORKER_REL);
  const homeWorker = path.join(HOME_CHART, WORKER_REL);
  const existsBoth = fs.existsSync(canonWorker) && fs.existsSync(homeWorker);
  note('M21-2-WORKER', 'worker-file-exists-dual-tree', existsBoth,
    existsBoth ? WORKER_REL : `missing (canon=${fs.existsSync(canonWorker)} home=${fs.existsSync(homeWorker)})`);

  let src = '';
  try { src = fs.readFileSync(path.join(CHART_ROOT, WORKER_REL), 'utf8'); } catch { /* red */ }
  const classic = src.length > 0
    && !/^\s*import\s/m.test(src)
    && !/^\s*export\s/m.test(src)
    && src.includes('self.onmessage')
    && src.includes('module.exports');
  note('M21-2-WORKER', 'worker-classic-cjs-dual-loadable', classic);
  note('M21-2-WORKER', 'worker-no-blob-bootstrap', src.length > 0 && !src.includes('blob:')
    && !!bridge && !JSON.stringify(bridge.M21_2_WORKER_URL || '').includes('blob'),
    'H3: same-origin URL only');
  const urlOk = !!bridge && bridge.M21_2_WORKER_URL === '/chart/workers/m21-2-candle-render-worker.js';
  note('M21-2-WORKER', 'worker-url-same-origin-contract', urlOk,
    bridge ? String(bridge.M21_2_WORKER_URL) : `bridge missing: ${bridgeLoadErr}`);
  const constantsMatch = !!bridge && !!workerMod
    && JSON.stringify(bridge.M21_2_MSG) === JSON.stringify(workerMod.M21_2_WORKER_MSG);
  note('M21-2-WORKER', 'message-constants-drift-gate', constantsMatch,
    constantsMatch ? 'bridge M21_2_MSG === worker M21_2_WORKER_MSG' : `bridge=${!!bridge} worker=${!!workerMod} ${workerLoadErr}`);

  assert.equal(existsBoth, true, 'worker file missing (dual-tree)');
  assert.equal(classic, true, 'worker must be classic + CJS-exportable');
  assert.equal(urlOk, true, 'worker URL contract');
  assert.equal(constantsMatch, true, 'message constant drift');
});

// ─── M21-2-KS: kill-switch consulted BEFORE first transfer ──────────────────
test('M21-2-KS: kill-switch name, pre-transfer consult, post-transfer policy', () => {
  const nameOk = !!bridge && bridge.M21_2_KILL_SWITCH === KS;
  note('M21-2-KS', 'kill-switch-exact-name', nameOk, KS);

  let preOk = false; let preDetail = '';
  let postOk = false; let postDetail = '';
  let fixOnOk = false;
  if (bridge && workerMod) {
    // Switch ON before any transfer → no worker construct, no canvas transfer.
    const win = { [KS]: true };
    let constructed = 0;
    const { b, canvas } = makeBridge({ windowRef: win, workerFactory: () => { constructed += 1; return makeFakeWorkerChannel().worker; } });
    const r = b.transferCanvas();
    preOk = r.ok === false && r.reason === 'kill-switch'
      && constructed === 0 && canvas.rec.transferCalls === 0
      && b.getStats().workerCount === 0 && b.getStats().state === 'kill-switch-main-thread';
    preDetail = JSON.stringify({ reason: r.reason, constructed, transfers: canvas.rec.transferCalls });

    // Fix ON (flag absent) → transfer proceeds.
    const on = makeBridge({});
    fixOnOk = on.b.transferCanvas().ok === true && on.b.getStats().workerCount === 1;

    // Post-transfer flip: one-shot transfer cannot be undone — documented policy
    // is suspend (stop frames, KILL_SUSPEND posted); full rollback = page reload.
    const win2 = {};
    const ch = makeFakeWorkerChannel();
    const post = makeBridge({ windowRef: win2, channel: ch });
    post.b.transferCanvas();
    win2[KS] = true;
    const pol = post.b.applyKillSwitchPolicy();
    const frame = packBars(makeBars(3));
    const sub = post.b.submitFrame({ buffer: frame.buffer, descriptor: bridge.buildFrameDescriptor({ barCount: 3 }) });
    postOk = pol.mode === 'post-transfer-suspend'
      && ch.outbox.some((m) => m.type === 'CANDLE_KILL_SUSPEND' || m.type === 'CANDLE_ACK' && m.phase === 'kill-suspend')
      && sub.ok === false && sub.reason === 'kill-suspended';
    postDetail = JSON.stringify({ mode: pol.mode, sub });
  } else {
    preDetail = postDetail = `module missing: ${bridgeLoadErr || workerLoadErr}`;
  }
  note('M21-2-KS', 'kill-switch-consulted-before-transfer', preOk, preDetail);
  note('M21-2-KS', 'fix-on-default-transfers', fixOnOk);
  note('M21-2-KS', 'post-transfer-flip-suspend-policy', postOk, postDetail);
  // Kill-mode discrimination rows (same semantics, explicit naming convention).
  note('M21-2-KS', 'switch-off-no-worker-no-transfer-RED', preOk, 'OFF ⇒ legacy main-thread paint path');
  note('M21-2-KS', 'switch-off-post-transfer-suspend-RED', postOk);

  assert.equal(nameOk, true, 'kill-switch name');
  assert.equal(preOk, true, 'kill-switch must gate BEFORE transferControlToOffscreen');
  assert.equal(fixOnOk, true);
  assert.equal(postOk, true, 'post-transfer kill policy');
});

// ─── M21-2-TRANSFER: one-shot + construct-before-transfer ordering ──────────
test('M21-2-TRANSFER: one-shot transfer; duplicate rejected; ordering protects fallback', () => {
  let oneShotOk = false; let orderingOk = false; let detail = '';
  if (bridge && workerMod) {
    const { b, canvas } = makeBridge({});
    const r1 = b.transferCanvas();
    const r2 = b.transferCanvas();
    const s = b.getStats();
    oneShotOk = r1.ok === true && r2.ok === false && r2.reason === 'already-transferred'
      && canvas.rec.transferCalls === 1 && s.canvasTransfers === 1
      && s.duplicateTransferRejections === 1 && s.workerCount === 1;
    detail = JSON.stringify({ r2: r2.reason, transfers: canvas.rec.transferCalls });

    // Worker is constructed BEFORE the canvas transfer: construct failure must
    // leave the canvas untouched so legacy main-thread paint still works (F2).
    const { b: b2, canvas: c2 } = makeBridge({ workerFactory: () => { throw new Error('boom'); } });
    const rf = b2.transferCanvas();
    orderingOk = rf.ok === false && rf.reason === 'worker-construct-failed'
      && c2.rec.transferCalls === 0 && b2.getStats().state === 'fallback-main-thread';
  } else detail = 'module missing';
  note('M21-2-TRANSFER', 'one-shot-duplicate-rejected', oneShotOk, detail);
  note('M21-2-TRANSFER', 'construct-before-transfer-ordering', orderingOk,
    'construct fail ⇒ canvas NOT transferred ⇒ clean main-thread fallback');
  assert.equal(oneShotOk, true);
  assert.equal(orderingOk, true);
});

// ─── M21-2-R1: transfer feature-detect + throw containment (W3 correction) ──
// Consumes W6 RED gate m21-2-r1-worker-leak-red-gate (FIX-A1/A2/A3) and the
// W3 browser-harness B1b reviewer issue: transferCanvas() must never construct
// a worker it cannot pair with a transferable canvas, and must never let the
// transfer call throw out of the bridge.
test('M21-2-R1: unsupported/throwing transferControlToOffscreen leaks no worker, escapes no exception', () => {
  let unsupportedOk = false; let unsupportedDetail = '';
  let repeatFlatOk = false; let repeatDetail = '';
  let throwOk = false; let throwDetail = '';
  let throwRepeatOk = false; let throwRepeatDetail = '';
  let lostOk = false; let lostDetail = '';
  if (bridge && workerMod) {
    // FIX-A1 — canvas WITHOUT transferControlToOffscreen: feature-detect BEFORE
    // construct ⇒ zero workers, zero transfers, registry untouched, no throw,
    // legacy canvas intact (fallback-main-thread).
    {
      const reg = { owner: null };
      let constructed = 0;
      const fake = { width: 320, height: 180 }; // intentionally no transferControlToOffscreen
      const { b } = makeBridge({
        canvas: fake,
        ownershipRegistry: reg,
        workerFactory: () => { constructed += 1; return makeFakeWorkerChannel().worker; },
      });
      let thrown = null; let r = null;
      try { r = b.transferCanvas(); } catch (e) { thrown = String(e && e.message || e); }
      const s = b.getStats();
      unsupportedOk = thrown == null && !!r && r.ok === false && r.reason === 'transfer-unsupported'
        && constructed === 0 && s.workerCount === 0 && s.canvasTransfers === 0
        && reg.owner === null && s.state === 'fallback-main-thread';
      unsupportedDetail = JSON.stringify({ thrown, reason: r && r.reason, constructed, state: s.state });
      b.destroy();
    }
    // FIX-A3 — repeated unsupported attempts stay worker-flat (no amplification;
    // pre-correction each attempt orphaned one live worker).
    {
      const reg = { owner: null };
      let constructed = 0;
      const fake = { width: 320, height: 180 };
      const { b } = makeBridge({
        canvas: fake,
        ownershipRegistry: reg,
        workerFactory: () => { constructed += 1; return makeFakeWorkerChannel().worker; },
      });
      const reasons = [];
      for (let i = 0; i < 3; i += 1) {
        try { reasons.push(b.transferCanvas().reason); } catch (e) { reasons.push(`THREW:${e.message}`); }
      }
      b.destroy();
      repeatFlatOk = constructed === 0 && reasons.every((x) => x === 'transfer-unsupported');
      repeatDetail = `constructed=${constructed} reasons=${reasons.join(',')}`;
    }
    // FIX-A2 — transferControlToOffscreen THROWS: worker terminated exactly
    // once, no uncaught exception, no transfer counted, registry untouched,
    // explicit transfer-failed (spec throws precede any transfer ⇒ canvas intact).
    {
      const reg = { owner: null };
      const workers = [];
      const factory = () => {
        const w = makeFakeWorkerChannel().worker;
        workers.push(w);
        return w;
      };
      const throwingCanvas = {
        width: 320,
        height: 180,
        transferControlToOffscreen() { throw new Error('InvalidStateError: simulated transfer throw'); },
        getContext() { return {}; }, // still usable ⇒ legacy paint intact
      };
      const { b } = makeBridge({ canvas: throwingCanvas, ownershipRegistry: reg, workerFactory: factory });
      let thrown = null; let r = null;
      try { r = b.transferCanvas(); } catch (e) { thrown = String(e && e.message || e); }
      const s = b.getStats();
      throwOk = thrown == null && !!r && r.ok === false && r.reason === 'transfer-failed'
        && workers.length === 1 && workers[0].terminated === 1
        && s.workerCount === 0 && s.canvasTransfers === 0
        && reg.owner === null && s.state === 'fallback-main-thread';
      throwDetail = JSON.stringify({ thrown, reason: r && r.reason, constructed: workers.length, terminated: workers.map((w) => w.terminated) });

      // Repeated throw attempts stay LIVE-worker flat (each constructed worker
      // terminated in the same call) and destroy leaves zero orphans.
      let r2 = null; let r3 = null;
      try { r2 = b.transferCanvas(); r3 = b.transferCanvas(); } catch (e) { thrown = String(e && e.message || e); }
      const liveBeforeDestroy = workers.filter((w) => w.terminated === 0).length;
      b.destroy();
      const liveAfterDestroy = workers.filter((w) => w.terminated === 0).length;
      const terminatedOnce = workers.every((w) => w.terminated === 1);
      throwRepeatOk = thrown == null && r2 && r2.reason === 'transfer-failed' && r3 && r3.reason === 'transfer-failed'
        && workers.length === 3 && liveBeforeDestroy === 0 && liveAfterDestroy === 0 && terminatedOnce;
      throwRepeatDetail = `constructed=${workers.length} liveBefore=${liveBeforeDestroy} liveAfterDestroy=${liveAfterDestroy} terminateCounts=${workers.map((w) => w.terminated).join(',')}`;
    }
    // Partial-transfer policy — if the browser detached the canvas BEFORE the
    // throw (probe: getContext throws too), the bridge must report fatal canvas
    // loss explicitly instead of claiming an intact legacy fallback.
    {
      const reg = { owner: null };
      let fatal = 0; let fatalReason = '';
      const w = makeFakeWorkerChannel().worker;
      const lostCanvas = {
        width: 320,
        height: 180,
        transferControlToOffscreen() { throw new Error('InvalidStateError: partial transfer'); },
        getContext() { throw new Error('InvalidStateError: canvas already transferred'); },
      };
      const { b } = makeBridge({
        canvas: lostCanvas,
        ownershipRegistry: reg,
        workerFactory: () => w,
        extra: { onFatalWorkerLoss: (info) => { fatal += 1; fatalReason = info && info.reason; } },
      });
      let thrown = null; let r = null;
      try { r = b.transferCanvas(); } catch (e) { thrown = String(e && e.message || e); }
      const s = b.getStats();
      lostOk = thrown == null && !!r && r.ok === false && r.reason === 'transfer-failed-canvas-lost'
        && w.terminated === 1 && s.state === 'degraded-canvas-lost'
        && fatal === 1 && fatalReason === 'transfer-failed-canvas-lost' && reg.owner === null;
      lostDetail = JSON.stringify({ thrown, reason: r && r.reason, state: s.state, fatal, fatalReason });
      b.destroy();
    }
  } else {
    unsupportedDetail = repeatDetail = throwDetail = throwRepeatDetail = lostDetail = 'module missing';
  }
  note('M21-2-R1', 'transfer-unsupported-feature-detect-before-construct', unsupportedOk, unsupportedDetail);
  note('M21-2-R1', 'repeat-unsupported-worker-flat', repeatFlatOk, repeatDetail);
  note('M21-2-R1', 'transfer-throw-contained-terminate-exactly-once', throwOk, throwDetail);
  note('M21-2-R1', 'repeat-throw-live-worker-flat-destroy-no-orphans', throwRepeatOk, throwRepeatDetail);
  note('M21-2-R1', 'partial-transfer-canvas-loss-reported-explicitly', lostOk, lostDetail);
  assert.equal(unsupportedOk, true, `FIX-A1: ${unsupportedDetail}`);
  assert.equal(repeatFlatOk, true, `FIX-A3: ${repeatDetail}`);
  assert.equal(throwOk, true, `FIX-A2: ${throwDetail}`);
  assert.equal(throwRepeatOk, true, throwRepeatDetail);
  assert.equal(lostOk, true, lostDetail);
});

// ═══ Independent-review bridge corrections (RED-first, findings 1–5) ═════════
// The review BLOCKED the scaffold on: no ACK consumption, no fatal worker-error
// machine, buffer-ownership gaps, mutable descriptors, no explicit empty frame,
// no bridge-side generation hygiene. Node-model rows below are clearly labeled;
// real-browser twins live in the W3 browser harness (B11–B14).

// ─── M21-2-ACK: bridge consumes worker replies; applied stats are ACK-driven ─
test('M21-2-ACK: onmessage consumes init/frame/resize/kill ACKs; worker rejection never counts applied', () => {
  let ackOk = false; let ackDetail = '';
  let rejectOk = false; let rejectDetail = '';
  if (bridge && workerMod) {
    const win = {};
    const ch = makeFakeWorkerChannel();
    const { b, flush } = makeBridge({ channel: ch, windowRef: win });
    b.transferCanvas();
    const s0 = b.getStats();
    const initAcked = !!(s0.acks && s0.acks.init === 1);
    const f = packBars(makeBars(3));
    const sub = b.submitFrame({ buffer: f.buffer, descriptor: bridge.buildFrameDescriptor({ barCount: 3 }) });
    flush();
    const s1 = b.getStats();
    const r = b.resize({ dpr: 1, cssWidth: 800, cssHeight: 600, deviceWidth: 800, deviceHeight: 600 });
    win[KS] = true;
    b.applyKillSwitchPolicy();
    const s2 = b.getStats();
    ackOk = initAcked && r.ok === true
      && s1.framesApplied === 1 && s1.lastAppliedGeneration === sub.generation
      && !!s1.acks && s1.acks.frame >= 1
      && !!s2.acks && s2.acks.resize === 1 && s2.acks.killSuspend === 1;
    ackDetail = JSON.stringify({ initAcked, applied: s1.framesApplied, lastApplied: s1.lastAppliedGeneration, acks: s2.acks });
    b.destroy();

    // Worker rejection (CANDLE_ERROR) — surfaced once, never counted applied,
    // non-fatal for recoverable frame validation codes (model-delivered).
    const ch2 = makeFakeWorkerChannel();
    let surfaced = 0;
    const { b: b2, flush: flush2 } = makeBridge({ channel: ch2, extra: { onWorkerError: () => { surfaced += 1; } } });
    b2.transferCanvas();
    const surfacedBefore = surfaced; // init ACK is not an error
    if (typeof ch2.worker.onmessage === 'function') {
      ch2.worker.onmessage({ data: { type: 'CANDLE_ERROR', phase: 'frame', error: 'frame-generation-invalid' } });
    }
    flush2(); // recoverable rejection must NOT have scheduled a fatal transition
    const s3 = b2.getStats();
    rejectOk = s3.framesApplied === 0 && s3.workerErrors === 1
      && surfaced === surfacedBefore + 1 && s3.state === 'active' && s3.workerCount === 1;
    rejectDetail = JSON.stringify({ applied: s3.framesApplied, workerErrors: s3.workerErrors, surfaced, state: s3.state });
    b2.destroy();
  } else { ackDetail = rejectDetail = 'module missing'; }
  note('M21-2-ACK', 'onmessage-installed-acks-consumed', ackOk, ackDetail);
  note('M21-2-ACK', 'worker-rejection-never-counted-applied', rejectOk, rejectDetail);
  assert.equal(ackOk, true, ackDetail);
  assert.equal(rejectOk, true, rejectDetail);
});

// ─── M21-2-FATAL: one idempotent degraded-canvas-lost machine ────────────────
test('M21-2-FATAL: onerror/messageerror/fatal CANDLE_ERROR/post-throw enter one idempotent fatal state', () => {
  let crashOk = false; let crashDetail = '';
  let msgErrOk = false; let msgErrDetail = '';
  let fatalErrOk = false; let fatalErrDetail = '';
  let postThrowOk = false; let postThrowDetail = '';
  let classifierOk = false; let classifierDetail = '';
  if (bridge && workerMod) {
    const runEventFatal = (fireEvent) => {
      const reg = { owner: null };
      const ch = makeFakeWorkerChannel();
      let fatal = 0; let surfaced = 0;
      const { b, flush } = makeBridge({
        channel: ch,
        ownershipRegistry: reg,
        extra: {
          onFatalWorkerLoss: () => { fatal += 1; },
          onWorkerError: () => { surfaced += 1; },
        },
      });
      b.transferCanvas();
      const f = packBars(makeBars(2));
      b.submitFrame({ buffer: f.buffer, descriptor: bridge.buildFrameDescriptor({ barCount: 2 }) });
      flush(); // one frame genuinely applied first
      fireEvent(ch);
      flush(); // event-delivered fatality applies on the scheduler tick (async in real browsers)
      const afterFatal = b.getStats();
      // crash-then-submit: everything refused after fatal
      const late = packBars(makeBars(2));
      const sub = b.submitFrame({ buffer: late.buffer, descriptor: bridge.buildFrameDescriptor({ barCount: 2 }) });
      const rz = b.resize({ dpr: 1, cssWidth: 8, cssHeight: 8, deviceWidth: 8, deviceHeight: 8 });
      // idempotence: second event must not double-terminate or double-callback
      fireEvent(ch);
      flush();
      const postsBefore = b.getStats().framesPosted;
      flush(); // no late posts ever
      return {
        ok: afterFatal.state === 'degraded-canvas-lost'
          && ch.worker.terminated === 1 && afterFatal.workerCount === 0
          && reg.owner === null && fatal === 1 && surfaced >= 1
          && sub.ok === false && sub.reason === 'degraded-canvas-lost'
          && rz.ok === false && rz.reason === 'degraded-canvas-lost'
          && ch.worker.terminated === 1 && b.getStats().framesPosted === postsBefore
          && late.buffer.byteLength > 0, // refused frame never detached
        detail: JSON.stringify({ state: afterFatal.state, terminated: ch.worker.terminated, fatal, sub: sub.reason, rz: rz.reason }),
        destroy: () => b.destroy(),
      };
    };

    const crash = runEventFatal((ch) => ch.worker.onerror({ type: 'error', message: 'simulated worker crash' }));
    crashOk = crash.ok; crashDetail = crash.detail; crash.destroy();

    const msgErr = runEventFatal((ch) => ch.worker.onmessageerror({ type: 'messageerror' }));
    msgErrOk = msgErr.ok; msgErrDetail = msgErr.detail; msgErr.destroy();

    const fatalErr = runEventFatal((ch) => {
      if (typeof ch.worker.onmessage === 'function') {
        ch.worker.onmessage({
          data: { type: 'CANDLE_ERROR', phase: 'init', error: 'init-context-unavailable', ok: false },
        });
      }
    });
    fatalErrOk = fatalErr.ok; fatalErrDetail = fatalErr.detail; fatalErr.destroy();

    // Post-transfer FRAME postMessage throw — synchronous fatality, no escape,
    // posted buffer never reclaimed or retried.
    {
      const reg = { owner: null };
      let fatal = 0;
      const throwing = {
        terminated: 0,
        postMessage(msg) { if (msg && msg.type === 'CANDLE_FRAME') throw new Error('DataCloneError: frame post fail'); },
        terminate() { this.terminated += 1; },
      };
      const { b, flush } = makeBridge({
        ownershipRegistry: reg,
        workerFactory: () => throwing,
        extra: { onFatalWorkerLoss: () => { fatal += 1; } },
      });
      b.transferCanvas();
      const f = packBars(makeBars(2));
      b.submitFrame({ buffer: f.buffer, descriptor: bridge.buildFrameDescriptor({ barCount: 2 }) });
      let escaped = null;
      try { flush(); } catch (e) { escaped = String(e && e.message || e); }
      const s = b.getStats();
      const reclaimed = b.drainReclaimableBuffers();
      postThrowOk = escaped == null && s.state === 'degraded-canvas-lost'
        && throwing.terminated === 1 && fatal === 1 && reg.owner === null
        && reclaimed.length === 0; // posted/possibly-detached buffer never reclaimed
      postThrowDetail = JSON.stringify({ escaped, state: s.state, terminated: throwing.terminated, fatal, reclaimed: reclaimed.length });
      b.destroy();
    }

    // Exported fatality classifier — defines WHICH worker errors are fatal.
    classifierOk = typeof bridge.m212IsFatalWorkerError === 'function'
      && bridge.m212IsFatalWorkerError({ type: 'CANDLE_ERROR', phase: 'init', error: 'init-canvas-missing' }) === true
      && bridge.m212IsFatalWorkerError({ type: 'CANDLE_ERROR', phase: 'frame', error: 'worker-not-active' }) === true
      && bridge.m212IsFatalWorkerError({ type: 'CANDLE_ERROR', phase: 'frame', error: 'frame-generation-invalid' }) === false
      && bridge.m212IsFatalWorkerError({ type: 'CANDLE_ERROR', phase: 'resize', error: 'invalid-resize-payload' }) === false
      && bridge.m212IsFatalWorkerError({ type: 'CANDLE_ACK', phase: 'frame', ok: true }) === false;
    classifierDetail = 'fatal: init-phase errors + worker-not-active; recoverable: frame/resize validation rejects';
  } else {
    crashDetail = msgErrDetail = fatalErrDetail = postThrowDetail = classifierDetail = 'module missing';
  }
  note('M21-2-FATAL', 'worker-onerror-crash-then-submit-refused', crashOk, crashDetail);
  note('M21-2-FATAL', 'worker-messageerror-fatal-idempotent', msgErrOk, msgErrDetail);
  note('M21-2-FATAL', 'fatal-candle-error-init-phase', fatalErrOk, fatalErrDetail);
  note('M21-2-FATAL', 'frame-post-throw-sync-fatal-no-reclaim', postThrowOk, postThrowDetail);
  note('M21-2-FATAL', 'fatal-error-classification-exported', classifierOk, classifierDetail);
  assert.equal(crashOk, true, crashDetail);
  assert.equal(msgErrOk, true, msgErrDetail);
  assert.equal(fatalErrOk, true, fatalErrDetail);
  assert.equal(postThrowOk, true, postThrowDetail);
  assert.equal(classifierOk, true, classifierDetail);
});

// ─── M21-2-BSM: buffer ownership state machine ───────────────────────────────
test('M21-2-BSM: duplicate pending rejected; kill/destroy cancel pending reclaimable exactly once', () => {
  let dupOk = false; let dupDetail = '';
  let killCancelOk = false; let killDetail = '';
  let destroyCancelOk = false; let destroyDetail = '';
  let coalesceOnceOk = false; let coalesceDetail = '';
  let awaitingOk = false; let awaitingDetail = '';
  if (bridge && workerMod) {
    const d2 = bridge.buildFrameDescriptor({ barCount: 2 });
    // Duplicate pending buffer throws (ownership violation).
    {
      const ch = makeFakeWorkerChannel();
      const { b } = makeBridge({ channel: ch });
      b.transferCanvas();
      const f = packBars(makeBars(2));
      b.submitFrame({ buffer: f.buffer, descriptor: d2 });
      let threw = null;
      try { b.submitFrame({ buffer: f.buffer, descriptor: d2 }); } catch (e) { threw = String(e && e.message || e); }
      dupOk = threw != null && /buffer-already-pending/.test(threw);
      dupDetail = `threw=${threw}`;
      b.destroy();
    }
    // Kill-before-flush: pending cancelled, never posted, reclaimable exactly once.
    {
      const win = {};
      const ch = makeFakeWorkerChannel();
      const { b, flush } = makeBridge({ channel: ch, windowRef: win });
      b.transferCanvas();
      const f = packBars(makeBars(2));
      b.submitFrame({ buffer: f.buffer, descriptor: d2 });
      win[KS] = true;
      const pol = b.applyKillSwitchPolicy();
      flush();
      const posts = b.getStats().framesPosted;
      const drained = b.drainReclaimableBuffers();
      const drainedAgain = b.drainReclaimableBuffers();
      killCancelOk = pol.mode === 'post-transfer-suspend' && posts === 0
        && drained.length === 1 && drained[0] === f.buffer && f.buffer.byteLength > 0
        && drainedAgain.length === 0
        && !ch.outbox.some((m) => m.type === 'CANDLE_ACK' && m.phase === 'frame');
      killDetail = JSON.stringify({ posts, drained: drained.length, undetached: f.buffer.byteLength > 0 });
      b.destroy();
    }
    // Destroy-before-flush: destroy drains pending, no post, reclaim exactly once.
    {
      const ch = makeFakeWorkerChannel();
      const { b, flush } = makeBridge({ channel: ch });
      b.transferCanvas();
      const f = packBars(makeBars(2));
      b.submitFrame({ buffer: f.buffer, descriptor: d2 });
      b.destroy();
      flush();
      const drained = b.drainReclaimableBuffers();
      destroyCancelOk = b.getStats().framesPosted === 0
        && drained.length === 1 && drained[0] === f.buffer && f.buffer.byteLength > 0
        && b.drainReclaimableBuffers().length === 0;
      destroyDetail = JSON.stringify({ posts: b.getStats().framesPosted, drained: drained.length });
    }
    // Coalesced-out buffer drains exactly once; posted buffer never reclaimed;
    // drained buffer may start a new ownership cycle.
    {
      const ch = makeFakeWorkerChannel();
      const { b, flush } = makeBridge({ channel: ch });
      b.transferCanvas();
      const a1 = packBars(makeBars(2));
      const a2 = packBars(makeBars(2));
      b.submitFrame({ buffer: a1.buffer, descriptor: d2 });
      b.submitFrame({ buffer: a2.buffer, descriptor: d2 }); // a1 coalesced out
      flush();
      const drained = b.drainReclaimableBuffers();
      const again = b.drainReclaimableBuffers();
      const resub = b.submitFrame({ buffer: a1.buffer, descriptor: d2 }); // new cycle allowed
      flush();
      coalesceOnceOk = drained.length === 1 && drained[0] === a1.buffer && again.length === 0
        && !drained.includes(a2.buffer) && a2.buffer.byteLength === 0 // posted+detached, never reclaimed
        && resub.ok === true && a1.buffer.byteLength === 0; // second cycle genuinely posted
      coalesceDetail = JSON.stringify({ drained: drained.length, again: again.length, resubOk: resub.ok });
      b.destroy();
    }
    // Buffer sitting in the reclaim queue cannot be resubmitted before drain.
    {
      const ch = makeFakeWorkerChannel();
      const { b } = makeBridge({ channel: ch });
      b.transferCanvas();
      const b1 = packBars(makeBars(2));
      const b2 = packBars(makeBars(2));
      b.submitFrame({ buffer: b1.buffer, descriptor: d2 });
      b.submitFrame({ buffer: b2.buffer, descriptor: d2 }); // b1 → reclaim queue
      let threw = null;
      try { b.submitFrame({ buffer: b1.buffer, descriptor: d2 }); } catch (e) { threw = String(e && e.message || e); }
      awaitingOk = threw != null && /buffer-awaiting-reclaim/.test(threw);
      awaitingDetail = `threw=${threw}`;
      b.destroy();
    }
  } else {
    dupDetail = killDetail = destroyDetail = coalesceDetail = awaitingDetail = 'module missing';
  }
  note('M21-2-BSM', 'duplicate-pending-buffer-rejected', dupOk, dupDetail);
  note('M21-2-BSM', 'switch-off-pending-frame-cancelled-reclaimable-once', killCancelOk, killDetail);
  note('M21-2-BSM', 'destroy-before-flush-drains-pending-once', destroyCancelOk, destroyDetail);
  note('M21-2-BSM', 'coalesced-reclaim-exactly-once-posted-never-reclaimed', coalesceOnceOk, coalesceDetail);
  note('M21-2-BSM', 'reclaim-queued-buffer-resubmit-rejected', awaitingOk, awaitingDetail);
  assert.equal(dupOk, true, dupDetail);
  assert.equal(killCancelOk, true, killDetail);
  assert.equal(destroyCancelOk, true, destroyDetail);
  assert.equal(coalesceOnceOk, true, coalesceDetail);
  assert.equal(awaitingOk, true, awaitingDetail);
});

// ─── M21-2-SNAP: descriptor snapshot at submit ───────────────────────────────
test('M21-2-SNAP: caller mutation after submit cannot alter the validated payload', () => {
  let snapOk = false; let detail = '';
  if (bridge && workerMod) {
    const ch = makeFakeWorkerChannel();
    const { b, flush } = makeBridge({ channel: ch });
    b.transferCanvas();
    const f = packBars(makeBars(3));
    const d = bridge.buildFrameDescriptor({ barCount: 3 });
    const sub = b.submitFrame({ buffer: f.buffer, descriptor: d });
    // Hostile mutation between submit and flush.
    d.barCount = 9999;
    d.elementCount = -1;
    d.byteLength = 1;
    d.byteOffset = 8;
    flush();
    const s = b.getStats();
    const applied = ch.core.state.lastFrame;
    snapOk = s.framesApplied === 1 && s.lastAppliedGeneration === sub.generation
      && !!applied && applied.descriptor.barCount === 3 && applied.descriptor.elementCount === 18
      && ch.core.state.invalidFrames === 0;
    detail = JSON.stringify({ applied: s.framesApplied, workerBarCount: applied && applied.descriptor.barCount, invalid: ch.core.state.invalidFrames });
    b.destroy();
  } else detail = 'module missing';
  note('M21-2-SNAP', 'descriptor-snapshot-frozen-at-submit', snapOk, detail);
  assert.equal(snapOk, true, detail);
});

// ─── M21-2-EMPTY: explicit empty frame clears the layer ──────────────────────
test('M21-2-EMPTY: new zero-length buffer with barCount=0 posts and clears; identity still rejects transferred buffers', () => {
  let emptyOk = false; let emptyDetail = '';
  let resizeOk = false; let resizeDetail = '';
  let identityOk = false; let identityDetail = '';
  if (bridge && workerMod) {
    const ch = makeFakeWorkerChannel();
    const { b, flush } = makeBridge({ channel: ch });
    b.transferCanvas();
    // Paint 3 bars, then explicitly clear with an empty frame.
    const f = packBars(makeBars(3));
    b.submitFrame({ buffer: f.buffer, descriptor: bridge.buildFrameDescriptor({ barCount: 3 }) });
    flush();
    const emptyBuffer = new ArrayBuffer(0);
    const d0 = bridge.buildFrameDescriptor({ barCount: 0 });
    let threw = null; let sub = null;
    try { sub = b.submitFrame({ buffer: emptyBuffer, descriptor: d0 }); } catch (e) { threw = String(e && e.message || e); }
    flush();
    const s = b.getStats();
    emptyOk = threw == null && !!sub && sub.ok === true
      && ch.core.state.clears === 1 && ch.core.state.framesApplied === 2
      && ch.core.state.lastAppliedGeneration === sub.generation
      && s.framesApplied === 2 && s.layerCleared === true;
    emptyDetail = JSON.stringify({ threw, clears: ch.core.state.clears, applied: s.framesApplied, layerCleared: s.layerCleared });

    // Empty descriptor retained across resize — repaint keeps the layer cleared.
    const rz = b.resize({ dpr: 1, cssWidth: 640, cssHeight: 360, deviceWidth: 640, deviceHeight: 360 });
    resizeOk = rz.ok === true && ch.core.state.clears === 2
      && ch.core.state.lastFrame && ch.core.state.lastFrame.descriptor.barCount === 0;
    resizeDetail = JSON.stringify({ clears: ch.core.state.clears, retainedBarCount: ch.core.state.lastFrame && ch.core.state.lastFrame.descriptor.barCount });

    // Identity tracking: the previously TRANSFERRED zero-length buffer is rejected
    // even though its byteLength (0) matches the empty descriptor.
    let threw2 = null;
    try { b.submitFrame({ buffer: emptyBuffer, descriptor: d0 }); } catch (e) { threw2 = String(e && e.message || e); }
    identityOk = threw2 != null && /detached-buffer-reuse/.test(threw2);
    identityDetail = `threw=${threw2}`;
    b.destroy();
  } else { emptyDetail = resizeDetail = identityDetail = 'module missing'; }
  note('M21-2-EMPTY', 'explicit-empty-frame-posts-and-clears', emptyOk, emptyDetail);
  note('M21-2-EMPTY', 'empty-descriptor-retained-across-resize', resizeOk, resizeDetail);
  note('M21-2-EMPTY', 'transferred-empty-buffer-identity-rejected', identityOk, identityDetail);
  assert.equal(emptyOk, true, emptyDetail);
  assert.equal(resizeOk, true, resizeDetail);
  assert.equal(identityOk, true, identityDetail);
});

// ─── M21-2-GENV: bridge-side generation hygiene (matches worker contract) ────
test('M21-2-GENV: generation is a finite safe integer >= 1 on the bridge side', () => {
  let exportOk = false; let exportDetail = '';
  let monotonicOk = false; let monotonicDetail = '';
  if (bridge && workerMod) {
    const v = bridge.m212ValidateGeneration;
    exportOk = typeof v === 'function'
      && v(1) === true && v(2) === true && v(Number.MAX_SAFE_INTEGER) === true
      && v(0) === false && v(-1) === false && v(1.5) === false
      && v(Infinity) === false && v(Number.NaN) === false
      && v('1') === false && v(2 ** 53) === false;
    exportDetail = 'no Infinity/fraction/negative/unsafe/zero/non-number poison';

    const ch = makeFakeWorkerChannel();
    const { b, flush } = makeBridge({ channel: ch });
    b.transferCanvas();
    const gens = [];
    for (let i = 0; i < 3; i += 1) {
      const f = packBars(makeBars(2));
      gens.push(b.submitFrame({ buffer: f.buffer, descriptor: bridge.buildFrameDescriptor({ barCount: 2 }) }).generation);
      flush();
    }
    monotonicOk = gens.every((g) => v && v(g)) && gens[0] < gens[1] && gens[1] < gens[2]
      && ch.core.state.invalidFrames === 0 && ch.core.state.framesApplied === 3;
    monotonicDetail = JSON.stringify({ gens, invalid: ch.core.state.invalidFrames });
    b.destroy();
  } else { exportDetail = monotonicDetail = 'module missing'; }
  note('M21-2-GENV', 'generation-validator-exported-safe-integer', exportOk, exportDetail);
  note('M21-2-GENV', 'generations-monotonic-safe-worker-accepts-all', monotonicOk, monotonicDetail);
  assert.equal(exportOk, true, exportDetail);
  assert.equal(monotonicOk, true, monotonicDetail);
});

// ═══ R6 — fresh-GPT BLOCK corrections (RED-first) ═══════════════════════════
// Defect 1: frame success ACKs were uncorrelated — any {ok:true} incremented
// framesApplied. The bridge must keep an outstanding-posted-generation ledger
// and consume each success exactly once. Defect 2: transfer-failed-canvas-lost
// bypassed the fatal machine (state assigned + return), letting a second
// transferCanvas() construct a fresh worker after canvas loss.

/** Inject a forged worker→main message into the bridge-installed handler. */
function injectToBridge(mw, data) {
  if (typeof mw.onmessage === 'function') mw.onmessage({ data });
}

// ─── M21-2-ACKL: ACK correlation ledger / exactly-once accounting ────────────
test('M21-2-ACKL: adversarial success ACKs (duplicate/invalid/unposted/stale) never double-apply', () => {
  let advOk = false; let advDetail = '';
  let oooOk = false; let oooDetail = '';
  let errLateOk = false; let errLateDetail = '';
  let fatalLateOk = false; let fatalLateDetail = '';
  let destroyLateOk = false; let destroyLateDetail = '';
  let controlOk = false; let controlDetail = '';
  let boundsOk = false; let boundsDetail = '';
  if (bridge && workerMod) {
    const d2 = bridge.buildFrameDescriptor({ barCount: 2 });

    // GPT exact adversarial sequence: ONE posted+consumed frame, then forged
    // duplicate / invalid / unposted / stale successes → framesApplied stays 1,
    // lastAppliedGeneration stable, layerCleared untouched, all surfaced as
    // rejected observability, NOTHING fatal.
    {
      const mw = makeManualWorker();
      const { b, flush } = makeBridge({ workerFactory: () => mw });
      b.transferCanvas();
      const f1 = packBars(makeBars(2));
      const sub = b.submitFrame({ buffer: f1.buffer, descriptor: d2 });
      flush();
      const outstandingAfterPost = b.getStats().outstandingFrames;
      injectToBridge(mw, { type: 'CANDLE_ACK', phase: 'frame', ok: true, generation: sub.generation });
      const s1 = b.getStats();
      const forged = [
        { type: 'CANDLE_ACK', phase: 'frame', ok: true, generation: sub.generation }, // duplicate (consumed)
        { type: 'CANDLE_ACK', phase: 'frame', ok: true, generation: Infinity },       // invalid
        { type: 'CANDLE_ACK', phase: 'frame', ok: true, generation: 1.5 },            // invalid
        { type: 'CANDLE_ACK', phase: 'frame', ok: true, generation: -1 },             // invalid
        { type: 'CANDLE_ACK', phase: 'frame', ok: true, generation: '1' },            // invalid
        { type: 'CANDLE_ACK', phase: 'frame', ok: true, generation: sub.generation + 41 }, // never posted
        { type: 'CANDLE_ACK', phase: 'frame', ok: true, generation: sub.generation, cleared: true }, // duplicate w/ cleared poison
      ];
      for (const msg of forged) injectToBridge(mw, msg);
      flush(); // nothing fatal may have been scheduled by forged ACKs
      const s2 = b.getStats();
      advOk = outstandingAfterPost === 1 && s1.framesApplied === 1 && s1.outstandingFrames === 0
        && s2.framesApplied === 1 && s2.lastAppliedGeneration === sub.generation
        && s2.layerCleared === false && s2.rejectedAcks === forged.length
        && s2.state === 'active' && mw.terminated === 0;
      advDetail = JSON.stringify({
        outstandingAfterPost, applied: s2.framesApplied, lastApplied: s2.lastAppliedGeneration,
        layerCleared: s2.layerCleared, rejectedAcks: s2.rejectedAcks, state: s2.state,
      });
      b.destroy();
    }

    // Out-of-order two-post: success for the NEWER posted generation consumes;
    // the older (still-posted) success is retired as stale without moving
    // lastAppliedGeneration backward.
    {
      const mw = makeManualWorker();
      const { b, flush } = makeBridge({ workerFactory: () => mw });
      b.transferCanvas();
      const f1 = packBars(makeBars(2));
      const f2 = packBars(makeBars(2));
      const g1 = b.submitFrame({ buffer: f1.buffer, descriptor: d2 }).generation;
      flush();
      const g2 = b.submitFrame({ buffer: f2.buffer, descriptor: d2 }).generation;
      flush();
      const outstanding2 = b.getStats().outstandingFrames;
      injectToBridge(mw, { type: 'CANDLE_ACK', phase: 'frame', ok: true, generation: g2 });
      const mid = b.getStats();
      injectToBridge(mw, { type: 'CANDLE_ACK', phase: 'frame', ok: true, generation: g1 }); // stale success
      const s = b.getStats();
      oooOk = outstanding2 === 2 && mid.framesApplied === 1 && mid.lastAppliedGeneration === g2
        && s.framesApplied === 1 && s.lastAppliedGeneration === g2
        && s.outstandingFrames === 0 && s.rejectedAcks === 1;
      oooDetail = JSON.stringify({ g1, g2, applied: s.framesApplied, lastApplied: s.lastAppliedGeneration, outstanding: s.outstandingFrames, rejected: s.rejectedAcks });
      b.destroy();
    }

    // R7 — EXACT correlation only: a generation-less frame error is fail-closed
    // inert (never retires another generation); an exact-generation frame error
    // retires that generation without applying it; a LATE success for the
    // retired generation stays rejected. Recoverable errors stay non-fatal.
    {
      const mw = makeManualWorker();
      let surfaced = 0;
      const { b, flush } = makeBridge({ workerFactory: () => mw, extra: { onWorkerError: () => { surfaced += 1; } } });
      b.transferCanvas();
      const f1 = packBars(makeBars(2));
      const g1 = b.submitFrame({ buffer: f1.buffer, descriptor: d2 }).generation;
      flush();
      injectToBridge(mw, { type: 'CANDLE_ERROR', phase: 'frame', error: 'frame-generation-invalid' }); // generation-less
      flush(); // recoverable — must NOT have scheduled fatal
      const afterVague = b.getStats();
      injectToBridge(mw, { type: 'CANDLE_ERROR', phase: 'frame', error: 'frame-render-failed', generation: g1 }); // exact
      flush();
      const afterErr = b.getStats();
      injectToBridge(mw, { type: 'CANDLE_ACK', phase: 'frame', ok: true, generation: g1 });
      const s = b.getStats();
      errLateOk = afterVague.workerErrors === 1 && afterVague.outstandingFrames === 1
        && afterVague.framesRetiredByWorkerError === 0 && afterVague.rejectedAcks === 1
        && afterErr.workerErrors === 2 && afterErr.outstandingFrames === 0
        && afterErr.framesRetiredByWorkerError === 1 && afterErr.state === 'active'
        && surfaced === 2 && s.framesApplied === 0 && s.lastAppliedGeneration === 0
        && s.rejectedAcks === 2;
      errLateDetail = JSON.stringify({ vagueOutstanding: afterVague.outstandingFrames, retired: afterErr.framesRetiredByWorkerError, applied: s.framesApplied, rejected: s.rejectedAcks, state: s.state });
      b.destroy();
    }

    // Fatal drains/terminalizes the ledger: a late success for a generation
    // posted before the crash mutates nothing.
    {
      const mw = makeManualWorker();
      const { b, flush } = makeBridge({ workerFactory: () => mw });
      b.transferCanvas();
      const f1 = packBars(makeBars(2));
      const g1 = b.submitFrame({ buffer: f1.buffer, descriptor: d2 }).generation;
      flush();
      const outstandingBefore = b.getStats().outstandingFrames;
      mw.onerror({ type: 'error', message: 'crash' });
      flush(); // fatal applies on scheduler tick
      const afterFatal = b.getStats();
      injectToBridge(mw, { type: 'CANDLE_ACK', phase: 'frame', ok: true, generation: g1 });
      const s = b.getStats();
      fatalLateOk = outstandingBefore === 1 && afterFatal.state === 'degraded-canvas-lost'
        && afterFatal.outstandingFrames === 0
        && s.framesApplied === 0 && s.lastAppliedGeneration === 0 && s.layerCleared === false;
      fatalLateDetail = JSON.stringify({ outstandingBefore, state: afterFatal.state, drained: afterFatal.outstandingFrames, applied: s.framesApplied });
      b.destroy();
    }

    // Destroy-then-late-success: no mutation after destroy.
    {
      const mw = makeManualWorker();
      const { b, flush } = makeBridge({ workerFactory: () => mw });
      b.transferCanvas();
      const f1 = packBars(makeBars(2));
      const g1 = b.submitFrame({ buffer: f1.buffer, descriptor: d2 }).generation;
      flush(); // posted, outstanding
      b.destroy();
      injectToBridge(mw, { type: 'CANDLE_ACK', phase: 'frame', ok: true, generation: g1 });
      const s = b.getStats();
      destroyLateOk = s.framesApplied === 0 && s.lastAppliedGeneration === 0
        && s.layerCleared === false && s.outstandingFrames === 0;
      destroyLateDetail = JSON.stringify({ applied: s.framesApplied, lastApplied: s.lastAppliedGeneration, outstanding: s.outstandingFrames });
    }

    // Control-ACK confusion: init/resize/kill/teardown ACKs carrying forged
    // generations never touch frame accounting; a resize-phase CANDLE_ERROR
    // never retires an outstanding FRAME generation.
    {
      const mw = makeManualWorker();
      const { b, flush } = makeBridge({ workerFactory: () => mw });
      b.transferCanvas();
      const f1 = packBars(makeBars(2));
      const g1 = b.submitFrame({ buffer: f1.buffer, descriptor: d2 }).generation;
      flush();
      injectToBridge(mw, { type: 'CANDLE_ACK', phase: 'frame', ok: true, generation: g1 });
      const base = b.getStats();
      for (const phase of ['init', 'resize', 'kill-suspend', 'teardown', 'bogus-phase']) {
        injectToBridge(mw, { type: 'CANDLE_ACK', phase, ok: true, generation: g1 + 1, cleared: true });
      }
      const afterControl = b.getStats();
      const f2 = packBars(makeBars(2));
      const g2 = b.submitFrame({ buffer: f2.buffer, descriptor: d2 }).generation;
      flush();
      injectToBridge(mw, { type: 'CANDLE_ERROR', phase: 'resize', error: 'invalid-resize-payload' });
      const afterResizeErr = b.getStats();
      injectToBridge(mw, { type: 'CANDLE_ACK', phase: 'frame', ok: true, generation: g2 });
      const s = b.getStats();
      controlOk = base.framesApplied === 1
        && afterControl.framesApplied === 1 && afterControl.lastAppliedGeneration === g1
        && afterControl.layerCleared === false
        && afterResizeErr.outstandingFrames === 1 // resize error must NOT retire the frame
        && afterResizeErr.workerErrors === 1
        && s.framesApplied === 2 && s.lastAppliedGeneration === g2;
      controlDetail = JSON.stringify({ afterControlApplied: afterControl.framesApplied, outstandingAfterResizeErr: afterResizeErr.outstandingFrames, finalApplied: s.framesApplied });
      b.destroy();
    }

    // Ledger bounds: a worker that never ACKs cannot grow the ledger without
    // bound — oldest entries are evicted (counted) at M21_2_ACK_LEDGER_MAX.
    {
      const cap = bridge.M21_2_ACK_LEDGER_MAX;
      const mw = makeManualWorker();
      const { b, flush } = makeBridge({ workerFactory: () => mw });
      b.transferCanvas();
      const total = (cap || 0) + 88;
      const d1 = bridge.buildFrameDescriptor({ barCount: 1 });
      for (let i = 0; i < total; i += 1) {
        const f = packBars(makeBars(1));
        b.submitFrame({ buffer: f.buffer, descriptor: d1 });
        flush();
      }
      const s = b.getStats();
      boundsOk = Number.isSafeInteger(cap) && cap > 0 && cap <= 4096
        && s.framesPosted === total && s.outstandingFrames === cap
        && s.ledgerEvictions === total - cap;
      boundsDetail = JSON.stringify({ cap, posted: s.framesPosted, outstanding: s.outstandingFrames, evictions: s.ledgerEvictions });
      b.destroy();
    }
  } else {
    advDetail = oooDetail = errLateDetail = fatalLateDetail = destroyLateDetail = controlDetail = boundsDetail = 'module missing';
  }
  note('M21-2-ACKL', 'gpt-adversarial-sequence-exactly-once', advOk, advDetail);
  note('M21-2-ACKL', 'out-of-order-two-post-stale-retired-no-backward', oooOk, oooDetail);
  note('M21-2-ACKL', 'frame-error-exact-only-retires-late-success-rejected', errLateOk, errLateDetail);
  note('M21-2-ACKL', 'fatal-drains-ledger-late-success-no-mutation', fatalLateOk, fatalLateDetail);
  note('M21-2-ACKL', 'destroy-then-late-success-no-mutation', destroyLateOk, destroyLateDetail);
  note('M21-2-ACKL', 'control-ack-confusion-never-touches-frame-state', controlOk, controlDetail);
  note('M21-2-ACKL', 'ledger-bounded-oldest-evicted-counted', boundsOk, boundsDetail);
  assert.equal(advOk, true, advDetail);
  assert.equal(oooOk, true, oooDetail);
  assert.equal(errLateOk, true, errLateDetail);
  assert.equal(fatalLateOk, true, fatalLateDetail);
  assert.equal(destroyLateOk, true, destroyLateDetail);
  assert.equal(controlOk, true, controlDetail);
  assert.equal(boundsOk, true, boundsDetail);
});

// ─── M21-2-FATAL2: canvas loss uses the ONE fatal machine ────────────────────
test('M21-2-FATAL2: transfer-failed-canvas-lost enters the idempotent fatal machine permanently', () => {
  let machineOk = false; let machineDetail = '';
  let retransferOk = false; let retransferDetail = '';
  let refusalOk = false; let refusalDetail = '';
  let censusOk = false; let censusDetail = '';
  if (bridge && workerMod) {
    const reg = { owner: null };
    let constructs = 0;
    let fatal = 0;
    let fatalReasons = [];
    const workers = [];
    const factory = () => {
      constructs += 1;
      const mw = makeManualWorker();
      workers.push(mw);
      return mw;
    };
    const lostCanvas = {
      width: 320,
      height: 180,
      transferControlToOffscreen() { throw new Error('InvalidStateError: partial transfer'); },
      getContext() { throw new Error('InvalidStateError: canvas already transferred'); },
    };
    const { b, flush } = makeBridge({
      canvas: lostCanvas,
      ownershipRegistry: reg,
      workerFactory: factory,
      extra: { onFatalWorkerLoss: (info) => { fatal += 1; fatalReasons.push(info && info.reason); } },
    });
    const r1 = b.transferCanvas();
    const s1 = b.getStats();
    machineOk = r1.ok === false && r1.reason === 'transfer-failed-canvas-lost'
      && r1.fatalReason === 'transfer-failed-canvas-lost'
      && s1.state === 'degraded-canvas-lost' && s1.fatalReason === 'transfer-failed-canvas-lost'
      && constructs === 1 && workers[0].terminated === 1
      && fatal === 1 && fatalReasons[0] === 'transfer-failed-canvas-lost'
      && reg.owner === null && s1.workerCount === 0 && s1.outstandingFrames === 0;
    machineDetail = JSON.stringify({ reason: r1.reason, fatalReason: s1.fatalReason, state: s1.state, constructs, terminated: workers[0] && workers[0].terminated, fatal });

    // Second/third transferCanvas: ZERO additional workers, same permanent reason.
    const r2 = b.transferCanvas();
    const r3 = b.transferCanvas();
    retransferOk = r2.ok === false && r2.reason === 'degraded-canvas-lost'
      && r2.fatalReason === 'transfer-failed-canvas-lost'
      && r3.ok === false && r3.reason === 'degraded-canvas-lost'
      && r3.fatalReason === 'transfer-failed-canvas-lost'
      && constructs === 1 && fatal === 1
      && b.getStats().canvasTransfers === 0;
    retransferDetail = JSON.stringify({ r2: { reason: r2.reason, fatalReason: r2.fatalReason }, constructs, fatal, transfers: b.getStats().canvasTransfers });

    // Submit/resize refused permanently with the persisted fatal reason; buffer
    // stays caller-owned; never a claim of legacy/main-thread recovery.
    const late = packBars(makeBars(2));
    const sub = b.submitFrame({ buffer: late.buffer, descriptor: bridge.buildFrameDescriptor({ barCount: 2 }) });
    const rz = b.resize({ dpr: 1, cssWidth: 8, cssHeight: 8, deviceWidth: 8, deviceHeight: 8 });
    // Forged late worker message into the pre-transfer-installed handler: no mutation.
    injectToBridge(workers[0], { type: 'CANDLE_ACK', phase: 'frame', ok: true, generation: 1 });
    const s2 = b.getStats();
    refusalOk = sub.ok === false && sub.reason === 'degraded-canvas-lost'
      && sub.fatalReason === 'transfer-failed-canvas-lost'
      && rz.ok === false && rz.reason === 'degraded-canvas-lost'
      && rz.fatalReason === 'transfer-failed-canvas-lost'
      && late.buffer.byteLength > 0
      && s2.framesApplied === 0 && s2.state === 'degraded-canvas-lost';
    refusalDetail = JSON.stringify({ sub: { reason: sub.reason, fatalReason: sub.fatalReason }, rz: { reason: rz.reason, fatalReason: rz.fatalReason }, applied: s2.framesApplied });

    // Destroy census: no double terminate, no double callback, registry stable.
    b.destroy();
    b.destroy();
    flush(); // any stray scheduled work must be inert
    censusOk = constructs === 1 && workers[0].terminated === 1 && fatal === 1
      && reg.owner === null && b.getStats().workerCount === 0
      && b.getStats().fatalReason === 'transfer-failed-canvas-lost';
    censusDetail = `constructs=${constructs} terminates=${workers[0] && workers[0].terminated} fatalCallbacks=${fatal} owner=${reg.owner}`;
  } else {
    machineDetail = retransferDetail = refusalDetail = censusDetail = 'module missing';
  }
  note('M21-2-FATAL2', 'canvas-lost-enters-single-fatal-machine', machineOk, machineDetail);
  note('M21-2-FATAL2', 'canvas-lost-second-transfer-zero-constructs', retransferOk, retransferDetail);
  note('M21-2-FATAL2', 'canvas-lost-permanent-refusals-with-fatal-reason', refusalOk, refusalDetail);
  note('M21-2-FATAL2', 'canvas-lost-destroy-census-terminate-callback-once', censusOk, censusDetail);
  assert.equal(machineOk, true, machineDetail);
  assert.equal(retransferOk, true, retransferDetail);
  assert.equal(refusalOk, true, refusalDetail);
  assert.equal(censusOk, true, censusDetail);
});

// ═══ R7 — independent review BLOCK-M21-2-R6 corrections (RED-first) ══════════
// Defect 1: ledger admission happened BEFORE worker.postMessage returned — a
// hostile synchronous/reentrant ACK during the post call was accepted early,
// and a reentrant ACK followed by a post throw left applied/cleared side
// effects behind. Defect 2: generation-less frame outcomes retired the OLDEST
// outstanding generation (after eviction, an outcome for evicted gen 1 could
// retire survivor gen 89). Defect 3: runtime kill-switch changes / invalid
// payloads / destroy could relabel the permanent canvas-loss fatal state.

// ─── M21-2-ACKL2: successful-post admission + exact outcome correlation ─────
test('M21-2-ACKL2: reentrant ACKs stage until post success; exact-only outcome correlation', () => {
  let reentrantOk = false; let reentrantDetail = '';
  let throwOk = false; let throwDetail = '';
  let evictOk = false; let evictDetail = '';
  if (bridge && workerMod) {
    const d2 = bridge.buildFrameDescriptor({ barCount: 2 });

    // Reentrant ACK → post SUCCESS: staged during the call (never accepted
    // early), committed and consumed exactly once after the post returns.
    // A duplicate reentrant success and a wrong-kind control ACK during the
    // same post stay inert for frame accounting.
    {
      let bRef = null;
      let insideSnap = null;
      const mw = {
        posted: [],
        terminated: 0,
        onmessage: null,
        onerror: null,
        onmessageerror: null,
        postMessage(msg) {
          this.posted.push(msg);
          if (msg && msg.type === 'CANDLE_FRAME' && typeof this.onmessage === 'function') {
            this.onmessage({ data: { type: 'CANDLE_ACK', phase: 'frame', ok: true, generation: msg.generation } });
            insideSnap = bRef.getStats(); // must NOT show early acceptance
            this.onmessage({ data: { type: 'CANDLE_ACK', phase: 'frame', ok: true, generation: msg.generation } }); // duplicate during post
            this.onmessage({ data: { type: 'CANDLE_ACK', phase: 'init', ok: true, generation: msg.generation } }); // wrong kind during post
          }
        },
        terminate() { this.terminated += 1; },
      };
      const { b, flush } = makeBridge({ workerFactory: () => mw });
      bRef = b;
      b.transferCanvas();
      const f1 = packBars(makeBars(2));
      const sub = b.submitFrame({ buffer: f1.buffer, descriptor: d2 });
      flush();
      const s = b.getStats();
      reentrantOk = !!insideSnap
        && insideSnap.framesApplied === 0 && insideSnap.outstandingFrames === 0
        && insideSnap.framesPosted === 0 && insideSnap.layerCleared === false
        && s.framesPosted === 1 && s.framesApplied === 1
        && s.lastAppliedGeneration === sub.generation && s.outstandingFrames === 0
        && s.rejectedAcks === 1 // the duplicate reentrant success
        && s.acks.init === 1 // wrong-kind control ACK phase-routed, frame state untouched
        && s.state === 'active';
      reentrantDetail = JSON.stringify({
        inside: insideSnap && { applied: insideSnap.framesApplied, outstanding: insideSnap.outstandingFrames, posted: insideSnap.framesPosted },
        final: { applied: s.framesApplied, posted: s.framesPosted, rejected: s.rejectedAcks, state: s.state },
      });
      b.destroy();
    }

    // Reentrant ACK → post THROW: the staged reply is DISCARDED. No
    // framesPosted/framesApplied/clear side effect, no outstanding ledger
    // entry; the fatal machine fires exactly once; a late replay stays inert.
    {
      let fatalCount = 0;
      let fatalReasonSeen = '';
      const mw = {
        posted: [],
        terminated: 0,
        onmessage: null,
        onerror: null,
        onmessageerror: null,
        postMessage(msg) {
          if (msg && msg.type === 'CANDLE_FRAME') {
            if (typeof this.onmessage === 'function') {
              this.onmessage({ data: { type: 'CANDLE_ACK', phase: 'frame', ok: true, generation: msg.generation, cleared: true } });
            }
            throw new Error('simulated-frame-post-failure');
          }
          this.posted.push(msg);
        },
        terminate() { this.terminated += 1; },
      };
      const { b, flush } = makeBridge({
        workerFactory: () => mw,
        extra: { onFatalWorkerLoss: (info) => { fatalCount += 1; fatalReasonSeen = info && info.reason; } },
      });
      b.transferCanvas();
      const f1 = packBars(makeBars(2));
      const sub = b.submitFrame({ buffer: f1.buffer, descriptor: d2 });
      flush();
      const s1 = b.getStats();
      injectToBridge(mw, { type: 'CANDLE_ACK', phase: 'frame', ok: true, generation: sub.generation }); // late replay
      const s2 = b.getStats();
      throwOk = s1.framesPosted === 0 && s1.framesApplied === 0
        && s1.lastAppliedGeneration === 0 && s1.layerCleared === false
        && s1.outstandingFrames === 0 && s1.state === 'degraded-canvas-lost'
        && s1.fatalReason === 'frame-post-failed'
        && fatalCount === 1 && fatalReasonSeen === 'frame-post-failed'
        && mw.terminated === 1
        && s2.framesApplied === 0 && s2.layerCleared === false;
      throwDetail = JSON.stringify({ posted: s1.framesPosted, applied: s2.framesApplied, cleared: s2.layerCleared, state: s1.state, fatalReason: s1.fatalReason, fatalCount });
      b.destroy();
    }

    // >bound posts with eviction: an outcome for EVICTED generation 1 (exact
    // or generation-less) can never retire survivor generation 89, whose own
    // ACK remains accepted. Forward-compat CANDLE_DROPPED with an exact
    // generation retires exactly that generation.
    {
      const cap = bridge.M21_2_ACK_LEDGER_MAX;
      const mw = makeManualWorker();
      const { b, flush } = makeBridge({ workerFactory: () => mw });
      b.transferCanvas();
      const total = (cap || 0) + 88; // survivors = gens 89..600 at cap 512
      const d1 = bridge.buildFrameDescriptor({ barCount: 1 });
      for (let i = 0; i < total; i += 1) {
        const f = packBars(makeBars(1));
        b.submitFrame({ buffer: f.buffer, descriptor: d1 });
        flush();
      }
      const before = b.getStats();
      injectToBridge(mw, { type: 'CANDLE_ERROR', phase: 'frame', error: 'frame-render-failed', generation: 1 }); // evicted gen
      injectToBridge(mw, { type: 'CANDLE_ERROR', phase: 'frame', error: 'frame-render-failed' });               // generation-less
      injectToBridge(mw, { type: 'CANDLE_ACK', phase: 'frame', dropped: true, reason: 'suspended' });           // generation-less drop
      const mid = b.getStats();
      injectToBridge(mw, { type: 'CANDLE_ACK', phase: 'frame', ok: true, generation: 89 }); // survivor's own ACK
      injectToBridge(mw, { type: 'CANDLE_DROPPED', generation: 90 }); // forward-compat exact drop
      const s = b.getStats();
      evictOk = Number.isSafeInteger(cap) && cap > 0
        && before.outstandingFrames === cap && before.ledgerEvictions === total - cap
        && mid.outstandingFrames === cap // NOTHING retired by uncorrelated outcomes
        && mid.framesRetiredByWorkerError === 0 && mid.framesDroppedByWorker === 0
        && mid.rejectedAcks === 3
        && s.framesApplied === 1 && s.lastAppliedGeneration === 89
        && s.framesDroppedByWorker === 1
        && s.outstandingFrames === cap - 2;
      evictDetail = JSON.stringify({ cap, midOutstanding: mid.outstandingFrames, midRejected: mid.rejectedAcks, applied: s.framesApplied, lastApplied: s.lastAppliedGeneration, dropped: s.framesDroppedByWorker, outstanding: s.outstandingFrames });
      b.destroy();
    }
  } else {
    reentrantDetail = throwDetail = evictDetail = 'module missing';
  }
  note('M21-2-ACKL2', 'reentrant-ack-staged-consumed-only-after-post-success', reentrantOk, reentrantDetail);
  note('M21-2-ACKL2', 'reentrant-ack-then-post-throw-discarded-no-side-effect', throwOk, throwDetail);
  note('M21-2-ACKL2', 'evicted-generation-outcome-never-retires-survivor', evictOk, evictDetail);
  assert.equal(reentrantOk, true, reentrantDetail);
  assert.equal(throwOk, true, throwDetail);
  assert.equal(evictOk, true, evictDetail);
});

// ─── M21-2-FATAL3: canvas-loss fatality is permanent across kill toggles/APIs ─
test('M21-2-FATAL3: kill-switch toggles and every public API preserve the canvas-loss fatal state', () => {
  let toggleOk = false; let toggleDetail = '';
  let apiOk = false; let apiDetail = '';
  if (bridge && workerMod) {
    const mkLost = () => ({
      width: 320,
      height: 180,
      transferControlToOffscreen() { throw new Error('InvalidStateError: partial transfer'); },
      getContext() { throw new Error('InvalidStateError: canvas already transferred'); },
    });
    const R = 'transfer-failed-canvas-lost';

    // Runtime kill-switch OFF→ON→OFF toggles must never relabel the fatal
    // state as pre-transfer-main-thread / kill-switch-main-thread.
    {
      const win = {};
      let constructs = 0;
      let fatal = 0;
      const mw = makeManualWorker();
      const { b } = makeBridge({
        canvas: mkLost(),
        windowRef: win,
        workerFactory: () => { constructs += 1; return mw; },
        extra: { onFatalWorkerLoss: () => { fatal += 1; } },
      });
      b.transferCanvas(); // enters fatal
      win[KS] = true;
      const p1 = b.applyKillSwitchPolicy();
      const s1 = b.getStats();
      win[KS] = false;
      const p2 = b.applyKillSwitchPolicy();
      const s2 = b.getStats();
      toggleOk = p1.mode === 'fatal-degraded' && p1.fatalReason === R
        && p2.mode === 'fatal-degraded' && p2.fatalReason === R
        && s1.state === 'degraded-canvas-lost' && s2.state === 'degraded-canvas-lost'
        && s2.fatalReason === R && fatal === 1 && constructs === 1;
      toggleDetail = JSON.stringify({ p1, p2, s1state: s1.state, s2state: s2.state, fatal, constructs });
      b.destroy();
    }

    // Every public API after fatal exposes the ORIGINAL fatal reason — invalid
    // payloads never relabel, destroy() keeps the fatal state label, and the
    // construct/terminate/callback census stays at exactly one.
    {
      const win = {};
      const reg = { owner: null };
      let constructs = 0;
      let fatal = 0;
      const workers = [];
      const { b, flush } = makeBridge({
        canvas: mkLost(),
        windowRef: win,
        ownershipRegistry: reg,
        workerFactory: () => { constructs += 1; const mw = makeManualWorker(); workers.push(mw); return mw; },
        extra: { onFatalWorkerLoss: () => { fatal += 1; } },
      });
      b.transferCanvas(); // enters fatal
      const t = b.transferCanvas();
      const f = packBars(makeBars(2));
      const sub = b.submitFrame({ buffer: f.buffer, descriptor: bridge.buildFrameDescriptor({ barCount: 2 }) });
      const rzBad = b.resize({ dpr: 'nope' }); // invalid payload after fatal
      const rzGood = b.resize({ dpr: 1, cssWidth: 8, cssHeight: 8, deviceWidth: 8, deviceHeight: 8 });
      const drained = b.drainReclaimableBuffers();
      const sMid = b.getStats();
      b.destroy();
      b.destroy();
      flush();
      const sub2 = b.submitFrame({ buffer: f.buffer, descriptor: bridge.buildFrameDescriptor({ barCount: 2 }) });
      const t2 = b.transferCanvas();
      const polD = b.applyKillSwitchPolicy();
      const sEnd = b.getStats();
      apiOk = t.reason === 'degraded-canvas-lost' && t.fatalReason === R
        && sub.reason === 'degraded-canvas-lost' && sub.fatalReason === R
        && rzBad.reason === 'degraded-canvas-lost' && rzBad.fatalReason === R
        && rzGood.reason === 'degraded-canvas-lost' && rzGood.fatalReason === R
        && Array.isArray(drained)
        && sMid.state === 'degraded-canvas-lost' && sMid.fatalReason === R
        && sEnd.state === 'degraded-canvas-lost' && sEnd.destroyed === true && sEnd.fatalReason === R
        && sub2.reason === 'degraded-canvas-lost' && sub2.fatalReason === R
        && t2.reason === 'degraded-canvas-lost' && t2.fatalReason === R
        && polD.mode === 'fatal-degraded' && polD.fatalReason === R
        && constructs === 1 && workers[0].terminated === 1 && fatal === 1
        && reg.owner === null;
      apiDetail = JSON.stringify({
        rzBad: { reason: rzBad.reason, fatalReason: rzBad.fatalReason },
        endState: sEnd.state, endFatalReason: sEnd.fatalReason,
        afterDestroy: { sub2: sub2.reason, t2: t2.reason, pol: polD.mode },
        census: { constructs, terminates: workers[0] && workers[0].terminated, fatal },
      });
    }
  } else {
    toggleDetail = apiDetail = 'module missing';
  }
  note('M21-2-FATAL3', 'kill-toggles-never-relabel-canvas-loss-fatal', toggleOk, toggleDetail);
  note('M21-2-FATAL3', 'every-api-preserves-original-fatal-reason', apiOk, apiDetail);
  assert.equal(toggleOk, true, toggleDetail);
  assert.equal(apiOk, true, apiDetail);
});

// ─── M21-2-OWNERSHIP: host+(N−1)-iframe reality; one worker total ───────────
test('M21-2-OWNERSHIP: host-only owner; embeds refuse; 1/2/4 views ⇒ workerCount=1, transfers=1', () => {
  let roleOk = false; let viewsOk = ''; let singletonOk = false;
  if (bridge && workerMod) {
    const host = bridge.resolveCandleWorkerOwnership({ isMultichartEmbedPanel: false, parentHasMultichartGrid: false });
    const embed = bridge.resolveCandleWorkerOwnership({ isMultichartEmbedPanel: true, parentHasMultichartGrid: true });
    const solo = bridge.resolveCandleWorkerOwnership({});
    roleOk = host.role === 'host' && host.shouldOwnWorker === true
      && embed.role === 'embed' && embed.shouldOwnWorker === false
      && solo.role === 'host' && solo.shouldOwnWorker === true;

    for (const views of [1, 2, 4]) {
      const registry = { owner: null };
      let workers = 0; let transfers = 0;
      for (let v = 0; v < views; v += 1) {
        const env = v === 0 ? {} : { isMultichartEmbedPanel: true, parentHasMultichartGrid: true };
        const { b, canvas } = makeBridge({ env, ownershipRegistry: registry });
        const r = b.transferCanvas();
        if (v === 0) assert.equal(r.ok, true, `host transfer views=${views}`);
        else assert.equal(r.reason, 'embed-not-owner', `embed refuse views=${views}`);
        workers += b.getStats().workerCount;
        transfers += canvas.rec.transferCalls;
      }
      viewsOk += `${views}:${workers}w/${transfers}t `;
      assert.equal(workers, 1, `workerCount views=${views}`);
      assert.equal(transfers, 1, `canvasTransfers views=${views}`);
    }

    // Same-document double-init: registry admits exactly one owner.
    const reg = { owner: null };
    const a = makeBridge({ ownershipRegistry: reg });
    const c = makeBridge({ ownershipRegistry: reg });
    const ra = a.b.transferCanvas();
    const rc = c.b.transferCanvas();
    singletonOk = ra.ok === true && rc.ok === false && rc.reason === 'worker-already-owned';
    a.b.destroy();
    const rd = makeBridge({ ownershipRegistry: reg }).b.transferCanvas();
    singletonOk = singletonOk && rd.ok === true; // destroy releases ownership
  }
  note('M21-2-OWNERSHIP', 'host-embed-role-resolution', roleOk,
    'phase-1: ONLY host document owns worker; embed iframes stay legacy paint until M21-3');
  note('M21-2-OWNERSHIP', 'views-1-2-4-single-worker-single-transfer', viewsOk.trim() === '1:1w/1t 2:1w/1t 4:1w/1t', viewsOk.trim());
  note('M21-2-OWNERSHIP', 'registry-single-owner-release-on-destroy', singletonOk);
  assert.equal(roleOk, true);
  assert.equal(singletonOk, true);
});

// ─── M21-2-DESCRIPTOR: compact visible-window typed descriptor ──────────────
test('M21-2-DESCRIPTOR: byteOffset/byteLength/elementCount/barCount/stride contract', async () => {
  let buildOk = false; let rejectOk = ''; let boundedOk = false; let driftOk = false; let w6Ok = false; let w6Detail = '';
  if (bridge && workerMod) {
    const d = bridge.buildFrameDescriptor({ barCount: 4 });
    buildOk = d.byteOffset === 0 && d.stride === 6 && d.elementCount === 24
      && d.byteLength === 24 * 8 && d.barCount === 4;

    const bad = [
      ['byteOffset', { ...d, byteOffset: 8 }],
      ['stride', { ...d, stride: 7, elementCount: 28, byteLength: 28 * 8 }],
      ['elementCount', { ...d, elementCount: 23 }],
      ['byteLength', { ...d, byteLength: d.byteLength - 8 }],
      ['negative', { ...d, barCount: -1, elementCount: -6, byteLength: -48 }],
    ];
    driftOk = true;
    for (const [tag, v] of bad) {
      let bridgeRej = false; let workerRej = false;
      try { bridge.validateFrameDescriptor(v, 4096); } catch { bridgeRej = true; }
      try { workerMod.validateFrameDescriptorWorker(v, 4096); } catch { workerRej = true; }
      if (bridgeRej && workerRej) rejectOk += `${tag}✓ `;
      if (bridgeRej !== workerRej) { driftOk = false; rejectOk += `${tag}DRIFT `; }
    }
    // window ≤ capacity: descriptor larger than buffer must reject.
    let capRej = false;
    try { bridge.validateFrameDescriptor(d, d.byteLength - 8); } catch { capRej = true; }
    rejectOk += capRej ? 'capacity✓' : 'capacityMISS';

    // Capacity-backed buffer: view honors byteLength; NaN poison tail never exposed.
    const capacity = new ArrayBuffer(64 * 8);
    const root = new Float64Array(capacity);
    root.fill(Number.NaN);
    const bars = makeBars(4);
    packBars(bars).forEach((v, i) => { root[i] = v; });
    const view = bridge.viewFromFrameDescriptor(capacity, d);
    boundedOk = view.length === 24 && !Array.from(view).some(Number.isNaN)
      && view[0] === bars[0].t && view[23] === bars[3].v;

    // W6 mirror detachForTransfer compatibility (read-only fixture import).
    try {
      const mirrorMod = await await_import_w6();
      const mirror = mirrorMod.createVisibleWindowMirror();
      mirror.syncFromBars(bars, 0, 4);
      const det = mirror.detachForTransfer();
      const adapted = bridge.descriptorFromMirrorDetach(det);
      bridge.validateFrameDescriptor(adapted.descriptor, det.buffer.byteLength);
      const v2 = bridge.viewFromFrameDescriptor(adapted.buffer, adapted.descriptor);
      w6Ok = v2.length === 24 && v2[0] === bars[0].t && Array.isArray(adapted.transferList)
        && adapted.transferList[0] === adapted.buffer;
      w6Detail = 'W6 detachForTransfer → W3 descriptor adapter byte-compatible';
    } catch (e) { w6Detail = `w6-fixture: ${String(e && e.message || e)}`; }
  }
  note('M21-2-DESCRIPTOR', 'build-canonical-descriptor', buildOk);
  note('M21-2-DESCRIPTOR', 'reject-malformed-and-overcapacity', /✓ .*✓ .*✓ .*✓ .*✓ capacity✓/.test(rejectOk), rejectOk.trim());
  note('M21-2-DESCRIPTOR', 'bridge-worker-validator-drift-gate', driftOk);
  note('M21-2-DESCRIPTOR', 'capacity-poison-tail-never-exposed', boundedOk, 'never bare new Float64Array(buffer)');
  note('M21-2-DESCRIPTOR', 'w6-mirror-detach-compatibility', w6Ok, w6Detail);
  assert.equal(buildOk, true);
  assert.equal(driftOk, true);
  assert.equal(boundedOk, true);
  assert.equal(w6Ok, true, w6Detail);
});

async function await_import_w6() {
  return import(pathToFileURL(path.join(CHART_ROOT, 'modules', 'm21-w6-fixtures', 'visible-window-mirror.mjs')).href);
}

// ─── M21-2-GEN: generation, coalescing, stale drop ──────────────────────────
test('M21-2-GEN: burst coalesces to one post latest-wins; worker drops stale generations', () => {
  let coalesceOk = false; let staleOk = false; let detail = '';
  if (bridge && workerMod) {
    const ch = makeFakeWorkerChannel();
    const { b, flush } = makeBridge({ channel: ch });
    b.transferCanvas();
    const bufs = [packBars(makeBars(2)), packBars(makeBars(3)), packBars(makeBars(4))];
    const d = (n) => bridge.buildFrameDescriptor({ barCount: n });
    b.submitFrame({ buffer: bufs[0].buffer, descriptor: d(2) });
    b.submitFrame({ buffer: bufs[1].buffer, descriptor: d(3) });
    const r3 = b.submitFrame({ buffer: bufs[2].buffer, descriptor: d(4) });
    flush();
    const s = b.getStats();
    coalesceOk = ch.core.state.framesApplied === 1
      && ch.core.state.lastAppliedGeneration === r3.generation
      && s.framesPosted === 1 && s.coalescedDrops === 2
      && bufs[0].buffer.byteLength > 0 && bufs[1].buffer.byteLength > 0 // not transferred
      && bufs[2].buffer.byteLength === 0; // genuinely transferred/detached
    detail = JSON.stringify({ posted: s.framesPosted, coalesced: s.coalescedDrops, applied: ch.core.state.framesApplied });

    // Worker-side stale/out-of-order drop: gen <= lastApplied is dropped.
    const ch2 = makeFakeWorkerChannel();
    ch2.core.handleMessage({ type: 'CANDLE_INIT', canvas: makeFakeCanvas().transferControlToOffscreen(), dpr: 1, cssWidth: 800, cssHeight: 600, deviceWidth: 800, deviceHeight: 600 });
    const f5 = packBars(makeBars(2)); const f3 = packBars(makeBars(2)); const f5b = packBars(makeBars(2));
    ch2.core.handleMessage({ type: 'CANDLE_FRAME', generation: 5, descriptor: d(2), buffer: f5.buffer });
    ch2.core.handleMessage({ type: 'CANDLE_FRAME', generation: 3, descriptor: d(2), buffer: f3.buffer });
    ch2.core.handleMessage({ type: 'CANDLE_FRAME', generation: 5, descriptor: d(2), buffer: f5b.buffer });
    staleOk = ch2.core.state.framesApplied === 1 && ch2.core.state.staleDropped === 2
      && ch2.core.state.lastAppliedGeneration === 5;
  } else detail = 'module missing';
  note('M21-2-GEN', 'burst-coalesce-latest-wins-single-post', coalesceOk, detail);
  note('M21-2-GEN', 'worker-stale-out-of-order-drop', staleOk, 'drop rule: generation <= lastApplied');
  assert.equal(coalesceOk, true);
  assert.equal(staleOk, true);
});

// ─── M21-2-BUFFER: transferred-buffer ownership; no detached reuse ──────────
test('M21-2-BUFFER: transferred buffers never reused; coalesced-out buffers reclaimable', () => {
  let reuseOk = false; let reclaimOk = false; let detail = '';
  if (bridge && workerMod) {
    const ch = makeFakeWorkerChannel();
    const { b, flush } = makeBridge({ channel: ch });
    b.transferCanvas();
    const f = packBars(makeBars(2));
    const d = bridge.buildFrameDescriptor({ barCount: 2 });
    b.submitFrame({ buffer: f.buffer, descriptor: d });
    flush();
    let threw = null;
    try { b.submitFrame({ buffer: f.buffer, descriptor: d }); } catch (e) { threw = String(e.message || e); }
    reuseOk = f.buffer.byteLength === 0 && threw != null && /detached-buffer-reuse/.test(threw);
    detail = `post-transfer byteLength=${f.buffer.byteLength} threw=${threw}`;

    // Coalesced-out (never posted) buffers stay owned by main and are surfaced
    // for pool release — they must NOT be detached.
    const ch2 = makeFakeWorkerChannel();
    const { b: b2, flush: flush2 } = makeBridge({ channel: ch2 });
    b2.transferCanvas();
    const a1 = packBars(makeBars(2)); const a2 = packBars(makeBars(2));
    b2.submitFrame({ buffer: a1.buffer, descriptor: d });
    b2.submitFrame({ buffer: a2.buffer, descriptor: d });
    flush2();
    const reclaimed = b2.drainReclaimableBuffers();
    reclaimOk = reclaimed.length === 1 && reclaimed[0] === a1.buffer && a1.buffer.byteLength > 0;
  } else detail = 'module missing';
  note('M21-2-BUFFER', 'no-detached-buffer-reuse', reuseOk, detail);
  note('M21-2-BUFFER', 'coalesced-out-buffers-reclaimable-undetached', reclaimOk);
  assert.equal(reuseOk, true);
  assert.equal(reclaimOk, true);
});

// ─── M21-2-RESIZE: resize/DPR message protocol after transfer ───────────────
test('M21-2-RESIZE: post-transfer resize is a message; no main-side backing-store writes; no re-transfer', () => {
  let protoOk = false; let mainOk = false; let repaintOk = false; let detail = '';
  if (bridge && workerMod) {
    const ch = makeFakeWorkerChannel();
    const { b, canvas, flush } = makeBridge({ channel: ch });
    b.transferCanvas();
    b.submitFrame({ buffer: packBars(makeBars(3)).buffer, descriptor: bridge.buildFrameDescriptor({ barCount: 3 }) });
    flush();
    const paintsBefore = ch.core.state.paints;
    const widthWritesBefore = canvas.rec.widthWrites;
    const r = b.resize({ dpr: 2, cssWidth: 900, cssHeight: 700, deviceWidth: 1800, deviceHeight: 1400 });
    protoOk = r.ok === true
      && ch.core.state.dpr === 2
      && ch.core.state.canvas.width === 1800 && ch.core.state.canvas.height === 1400
      && ch.core.state.resizes === 1;
    mainOk = canvas.rec.widthWrites === widthWritesBefore && canvas.rec.transferCalls === 1;
    repaintOk = ch.core.state.paints === paintsBefore + 1; // retained last frame repainted
    detail = JSON.stringify({ dpr: ch.core.state.dpr, dev: [ch.core.state.canvas.width, ch.core.state.canvas.height] });

    // Missing fields rejected (payload contract: dpr/cssWidth/cssHeight/deviceWidth/deviceHeight).
    const bad = b.resize({ dpr: 2, cssWidth: 900 });
    protoOk = protoOk && bad.ok === false && bad.reason === 'invalid-resize-payload';
  } else detail = 'module missing';
  note('M21-2-RESIZE', 'resize-message-protocol-5-fields', protoOk, detail);
  note('M21-2-RESIZE', 'no-main-thread-backing-store-writes-after-transfer', mainOk, 'H4 critical resolved at scaffold level');
  note('M21-2-RESIZE', 'worker-repaints-retained-frame-on-resize', repaintOk);
  assert.equal(protoOk, true);
  assert.equal(mainOk, true);
  assert.equal(repaintOk, true);
});

// ─── M21-2-FAULT: worker failure → main-thread fallback ─────────────────────
test('M21-2-FAULT: construct fail clean fallback; INIT post fail fatal-loss policy; error surface', () => {
  let constructOk = false; let initFailOk = false; let errorOk = false;
  if (bridge && workerMod) {
    const { b, canvas } = makeBridge({ workerFactory: () => { throw new Error('construct denied'); } });
    const r = b.transferCanvas();
    constructOk = r.ok === false && r.reason === 'worker-construct-failed'
      && canvas.rec.transferCalls === 0
      && b.getStats().state === 'fallback-main-thread' && b.getStats().workerCount === 0;

    // INIT postMessage throws AFTER transfer: canvas is gone (one-shot) — bridge
    // must terminate the worker, flag fatal loss, and fire the recovery hook
    // (documented policy: canvas ELEMENT replacement at wiring time).
    let fatal = 0;
    const badWorker = { terminated: 0, postMessage() { throw new Error('post failed'); }, terminate() { this.terminated += 1; } };
    const { b: b2, canvas: c2 } = makeBridge({ workerFactory: () => badWorker, extra: { onFatalWorkerLoss: () => { fatal += 1; } } });
    const r2 = b2.transferCanvas();
    initFailOk = r2.ok === false && r2.reason === 'init-post-failed-canvas-lost'
      && c2.rec.transferCalls === 1 && badWorker.terminated === 1
      && b2.getStats().state === 'degraded-canvas-lost' && fatal === 1;

    // Async worker error surfaces through the bridge callback.
    let surfaced = 0;
    const ch = makeFakeWorkerChannel();
    const { b: b3 } = makeBridge({ channel: ch, extra: { onWorkerError: () => { surfaced += 1; } } });
    b3.transferCanvas();
    ch.worker.onerror(new Error('worker crashed'));
    errorOk = surfaced === 1;
  }
  note('M21-2-FAULT', 'construct-fail-clean-main-thread-fallback', constructOk, 'F2: canvas untouched, legacy paint available');
  note('M21-2-FAULT', 'init-post-fail-fatal-loss-policy', initFailOk,
    'F3/F4: terminate + onFatalWorkerLoss; recovery = canvas element replacement (documented)');
  note('M21-2-FAULT', 'worker-error-surfaces', errorOk);
  assert.equal(constructOk, true);
  assert.equal(initFailOk, true);
  assert.equal(errorOk, true);
});

// ─── M21-2-TEARDOWN ─────────────────────────────────────────────────────────
test('M21-2-TEARDOWN: destroy terminates exactly once, idempotent, releases ownership', () => {
  let ok = false; let detail = '';
  if (bridge && workerMod) {
    const ch = makeFakeWorkerChannel();
    const reg = { owner: null };
    const { b } = makeBridge({ channel: ch, ownershipRegistry: reg });
    b.transferCanvas();
    b.destroy();
    b.destroy();
    const s = b.getStats();
    ok = ch.worker.terminated === 1 && s.workerCount === 0 && s.destroyed === true
      && reg.owner === null
      && b.submitFrame({ buffer: new ArrayBuffer(96), descriptor: bridge.buildFrameDescriptor({ barCount: 2 }) }).ok === false;
    detail = `terminated=${ch.worker.terminated}`;
    // Destroy before transfer is a no-op on workers but still safe.
    const pre = makeBridge({ ownershipRegistry: { owner: null } });
    pre.b.destroy();
    ok = ok && pre.b.getStats().destroyed === true;
  }
  note('M21-2-TEARDOWN', 'destroy-exactly-once-idempotent', ok, detail);
  assert.equal(ok, true);
});

// ─── M21-2-API: authoritative contract doc + dual-tree parity ───────────────
test('M21-2-API: contract doc present with binding rules; dual-tree mirrors byte-identical', () => {
  let docOk = false; let docDetail = '';
  try {
    const doc = fs.readFileSync(path.join(CHART_ROOT, APIDOC_REL), 'utf8');
    docOk = doc.includes(KS) && doc.includes('byteOffset') && doc.includes('one-shot')
      && doc.includes('host') && doc.includes('CANDLE_FRAME') && doc.includes('NOT-MEASURABLE');
    docDetail = 'authoritative rules present';
  } catch (e) { docDetail = String(e.message || e); }
  note('M21-2-API', 'authoritative-contract-doc', docOk, docDetail);

  let parityOk = true; let parityDetail = '';
  for (const rel of [BRIDGE_REL, WORKER_REL, APIDOC_REL, TEST_REL]) {
    const a = sha256(path.join(CANON_CHART, rel));
    const bb = sha256(path.join(HOME_CHART, rel));
    const same = a != null && a === bb;
    if (!same) parityOk = false;
    parityDetail += `${path.basename(rel)}:${same ? 'OK' : 'DIFF'} `;
  }
  note('M21-2-API', 'dual-tree-parity', parityOk, parityDetail.trim());
  assert.equal(docOk, true, docDetail);
  assert.equal(parityOk, true, parityDetail);
});

// ─── Forced NOT-MEASURABLE (never GREEN from this harness) ──────────────────
test('M21-2-NM: browser-only metrics forced NOT-MEASURABLE', () => {
  for (const metric of ['gpu-process-share', 'pan-replay-fps', 'pixel-parity-rmse', 'context-loss-recovery']) {
    note('M21-2-NM', `${metric}-not-measurable`, true, 'NOT-MEASURABLE — requires real-browser instrumentation (W5); NEVER GREEN here');
  }
  assert.ok(true);
});

// ─── Evidence writer ─────────────────────────────────────────────────────────
test('evidence writer', { skip: !evidenceMode }, () => {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const stamp = '20260724';
  const out = path.join(EVIDENCE_DIR, `W3-M21-2-SCAFFOLD-${stamp}-${evidenceMode}.json`);
  const failed = evidenceRows.filter((r) => !r.pass);
  let verdict = failed.length ? 'RED' : 'GREEN';
  if (evidenceMode === 'red') {
    verdict = failed.length ? 'RED' : 'UNEXPECTED-GREEN';
  }
  if (evidenceMode === 'kill') {
    const disc = evidenceRows.filter((r) => String(r.name).startsWith('switch-off'));
    verdict = disc.length > 0 && disc.every((r) => r.pass) ? 'RED' : 'FAIL-DISCRIMINATION';
  }
  const payload = {
    worker: 'W3',
    mode: evidenceMode,
    stamp,
    status: 'FABLE-SIGNED-20260724',
    scope: 'module-scaffold-only',
    productWiring: 'BLOCKED-UNTIL-MANAGER-COMMITS-M21-1 (chart.js LOCKED)',
    browserEvidence: 'NOT-MEASURABLE (gpu/fps/pixel/context-loss pending W5 real-browser instrumentation)',
    killSwitch: KS,
    // R7 — immutable provenance: exact sha256 of every source input this run
    // executed against, per tree, so RED evidence is replayable byte-for-byte.
    inputs: {
      node: process.version,
      bridge: { canonical: sha256(path.join(CANON_CHART, BRIDGE_REL)), homepage: sha256(path.join(HOME_CHART, BRIDGE_REL)) },
      worker: { canonical: sha256(path.join(CANON_CHART, WORKER_REL)), homepage: sha256(path.join(HOME_CHART, WORKER_REL)) },
      test: { canonical: sha256(path.join(CANON_CHART, TEST_REL)), homepage: sha256(path.join(HOME_CHART, TEST_REL)) },
      apiDoc: { canonical: sha256(path.join(CANON_CHART, APIDOC_REL)), homepage: sha256(path.join(HOME_CHART, APIDOC_REL)) },
    },
    rows: evidenceRows,
    summary: { total: evidenceRows.length, pass: evidenceRows.length - failed.length, fail: failed.length },
    verdict,
  };
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  process.stdout.write(`Wrote evidence ${out} verdict=${verdict}\n`);
});
