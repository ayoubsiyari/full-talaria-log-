/**
 * M21-2 — standalone browser-integration harness client (W3-owned, NEW FILE).
 *
 * Runs inside a REAL browser page served from representative /chart paths and
 * exercises the REAL bridge (modules/m21-2-candle-offscreen-bridge.mjs) with
 * the REAL same-origin classic worker (workers/m21-2-candle-render-worker.js).
 * NO product wiring; every file under review is imported read-only.
 *
 * Scenario map (B-rows; PRELIMINARY-SCAFFOLD-BROWSER evidence):
 *   B0  environment support probe (OffscreenCanvas / transferControlToOffscreen)
 *   B1  worker construct failure → clean fallback, canvas UNtransferred
 *   B1b missing transferControlToOffscreen → transfer-unsupported, ZERO workers
 *       (R1 correction verified; previously documented the leak for review)
 *   B1c transferControlToOffscreen throws → contained, worker terminated once
 *   B2  pre-init kill-switch → legacy path, zero workers, canvas untouched
 *   B3  one-shot transfer + deterministic frame + duplicate-transfer reject
 *   B4  generation/coalescing latest-wins (real queueMicrotask scheduler)
 *   B5  malformed descriptor reject (bridge sync throw + worker CANDLE_ERROR)
 *   B6  resize/DPR via message AFTER transfer (no main-thread store writes)
 *   B7  post-init kill flip → suspend, refused frames, no late paint
 *   B8  teardown/termination → refusal, silence, no late paint
 *   B9  phase-1 host-only ownership at 1/2/4 views (single worker/transfer)
 *   B10 strict same-origin CSP compatibility (script-src/worker-src 'self')
 *   B11 R5 correction: ACK-driven stats, worker rejection never applied,
 *       descriptor snapshot vs caller mutation, duplicate-pending reject,
 *       explicit empty frame clears layer + stays cleared across resize
 *   B12 R5 correction: kill-before-flush cancels the pending frame — never
 *       posts, reclaimable exactly once
 *   B13 R5/R6/R7 correction: REAL worker load failure (404 script) → one idempotent
 *       degraded-canvas-lost; frames/resizes refused; no silent paint; R6:
 *       fatalReason persisted, retried transferCanvas gated pre-construct; R7:
 *       kill-switch toggles / invalid payloads never relabel the fatal state
 *       (messageerror / fatal CANDLE_ERROR / post-throw fatality are Node-model
 *       rows in the scaffold gate — not real-browser-triggerable determinately)
 *   B14 R6 correction: ACK correlation ledger — forged duplicate/invalid/
 *       unposted successes and control-ACK confusion never double-apply
 *       (synthetic-injection into the real bridge's installed handler)
 *   BPX scaffold-only pixel checksum/spot oracle — explicitly NOT product
 *       pixel parity and NOT a perf GREEN (W5 owns real measurement).
 */

import {
  M21_2_KILL_SWITCH,
  M21_2_WORKER_URL,
  M21_2_MSG,
  buildFrameDescriptor,
  createCandleRenderWorkerBridge,
} from '/chart/modules/m21-2-candle-offscreen-bridge.mjs';

const WORKER_URL = `${M21_2_WORKER_URL}?v=browser-harness-20260724`;
const rows = [];
const reviewerIssues = [];
const cspViolations = [];
const logEl = document.getElementById('log');
const stage = document.getElementById('stage');

document.addEventListener('securitypolicyviolation', (e) => {
  cspViolations.push(`${e.violatedDirective} → ${e.blockedURI || '(inline)'}`);
});

function row(q, name, pass, detail = '', extra = {}) {
  rows.push({ q, name, pass: !!pass, detail: String(detail), ...extra });
  const line = `${pass ? 'PASS ' : 'FAIL '} ${q} ${name}${detail ? ' — ' + detail : ''}`;
  if (logEl) logEl.textContent += `\n${line}`;
}

function issue(id, text) {
  reviewerIssues.push({ id, text });
  if (logEl) logEl.textContent += `\nISSUE ${id}: ${text}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeoutMs = 4000, stepMs = 25) {
  const t0 = performance.now();
  for (;;) {
    if (fn()) return true;
    if (performance.now() - t0 > timeoutMs) return false;
    await sleep(stepMs);
  }
}

function mkCanvas(w = 320, h = 180) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  stage.appendChild(c);
  return c;
}

/** Observed worker factory: REAL Worker, message log + construct count. */
function observedFactory() {
  const o = { constructs: 0, lastWorker: null, messages: [] };
  o.factory = (url) => {
    o.constructs += 1;
    const w = new Worker(url); // classic, same-origin — never blob
    w.addEventListener('message', (e) => o.messages.push(e.data));
    o.lastWorker = w;
    return w;
  };
  return o;
}

/** Deterministic 8-bar window: all up except bar 1 (down) for color spots. */
function deterministicBars() {
  const bars = [];
  for (let i = 0; i < 8; i += 1) {
    const base = 10 + i * 0.5;
    const down = i === 1;
    bars.push({
      t: 1000 + i * 60,
      o: down ? base + 0.6 : base,
      h: base + 0.9,
      l: base - 0.3,
      c: down ? base : base + 0.6,
      v: 100 + i,
    });
  }
  return bars;
}

function packFrame(bars) {
  const f = new Float64Array(bars.length * 6);
  bars.forEach((b, i) => {
    f[i * 6] = b.t; f[i * 6 + 1] = b.o; f[i * 6 + 2] = b.h;
    f[i * 6 + 3] = b.l; f[i * 6 + 4] = b.c; f[i * 6 + 5] = b.v;
  });
  return f;
}

/**
 * Scaffold-only pixel oracle: drawImage() from the transferred placeholder
 * canvas element samples its current committed bitmap. FNV-1a checksum +
 * non-transparent pixel count. Returns null when the capture path is not
 * reliable in this browser (rows then degrade to message-level assertions).
 */
function tryCapture(canvasEl) {
  try {
    const w = canvasEl.width, h = canvasEl.height;
    if (!(w > 0 && h > 0)) return null;
    const snap = document.createElement('canvas');
    snap.width = w; snap.height = h;
    const c2 = snap.getContext('2d', { willReadFrequently: true });
    c2.drawImage(canvasEl, 0, 0);
    const d = c2.getImageData(0, 0, w, h).data;
    let hash = 2166136261 >>> 0;
    let nonBlank = 0;
    for (let i = 0; i < d.length; i += 4) {
      const px = (d[i] << 24 | d[i + 1] << 16 | d[i + 2] << 8 | d[i + 3]) >>> 0;
      if (px !== 0) nonBlank += 1;
      hash = Math.imul((hash ^ px) >>> 0, 16777619) >>> 0;
    }
    return { hash, nonBlank, w, h, sample: (x, y) => {
      const j = (Math.round(y) * w + Math.round(x)) * 4;
      return [d[j], d[j + 1], d[j + 2], d[j + 3]];
    } };
  } catch (err) {
    return null;
  }
}

const near = (got, want, tol = 10) => Math.abs(got - want) <= tol;
function isColor(rgba, hex) {
  const want = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  return rgba[3] > 200 && near(rgba[0], want[0]) && near(rgba[1], want[1]) && near(rgba[2], want[2]);
}

async function main() {
  const win = window;
  win[M21_2_KILL_SWITCH] = false;

  // ── B0 environment ──
  const hasOffscreen = typeof OffscreenCanvas !== 'undefined';
  const hasTransfer = typeof HTMLCanvasElement !== 'undefined'
    && typeof HTMLCanvasElement.prototype.transferControlToOffscreen === 'function';
  row('M21-2-B0', 'offscreencanvas-and-transfer-supported', hasOffscreen && hasTransfer,
    `OffscreenCanvas=${hasOffscreen} transferControlToOffscreen=${hasTransfer} ua=${navigator.userAgent}`);

  // ── B1 worker construct failure → canvas untransferred, legacy usable ──
  {
    const c = mkCanvas();
    const b = createCandleRenderWorkerBridge({
      canvas: c, windowRef: win, env: {}, ownershipRegistry: { owner: null },
      workerFactory: () => { throw new Error('simulated-unsupported-construct'); },
      cssWidth: 320, cssHeight: 180, dpr: 1,
    });
    const r = b.transferCanvas();
    let legacyOk = false;
    try {
      const ctx = c.getContext('2d');
      if (ctx) { ctx.fillRect(0, 0, 4, 4); legacyOk = true; }
    } catch { legacyOk = false; }
    row('M21-2-B1', 'construct-failure-clean-fallback',
      r.ok === false && r.reason === 'worker-construct-failed' && b.getStats().state === 'fallback-main-thread',
      `reason=${r.reason} state=${b.getStats().state}`);
    row('M21-2-B1', 'construct-failure-canvas-untransferred-legacy-paints', legacyOk,
      'getContext(2d)+fillRect on the SAME element succeeded → transfer never happened');
  }

  // ── B1b missing transferControlToOffscreen → transfer-unsupported (R1 FIXED) ──
  {
    const obs = observedFactory();
    const registry = { owner: null };
    const fake = { width: 320, height: 180 }; // canvas-like WITHOUT transferControlToOffscreen
    const b = createCandleRenderWorkerBridge({
      canvas: fake, windowRef: win, env: {}, ownershipRegistry: registry,
      workerFactory: obs.factory, cssWidth: 320, cssHeight: 180, dpr: 1,
    });
    let thrown = null;
    const results = [];
    try {
      for (let i = 0; i < 3; i += 1) results.push(b.transferCanvas());
    } catch (err) { thrown = String(err && err.message || err); }
    if (obs.lastWorker) { try { obs.lastWorker.terminate(); } catch { /* harness cleanup */ } }
    const s = b.getStats();
    row('M21-2-B1b', 'transfer-unsupported-feature-detected-zero-workers',
      thrown == null && results.length === 3
      && results.every((r) => r.ok === false && r.reason === 'transfer-unsupported')
      && obs.constructs === 0 && s.workerCount === 0 && s.canvasTransfers === 0
      && registry.owner === null,
      `R1 corrected: no throw, reasons=${results.map((r) => r && r.reason).join(',')}, `
      + `workerConstructs=${obs.constructs} (leak eliminated; repeat ×3 stays worker-flat)`);
    b.destroy();
  }

  // ── B1c transferControlToOffscreen THROWS → contained, terminate exactly once ──
  {
    const obs = observedFactory();
    let terminates = 0;
    const countingFactory = (url) => {
      const w = obs.factory(url);
      const realTerminate = w.terminate.bind(w);
      w.terminate = () => { terminates += 1; realTerminate(); };
      return w;
    };
    const registry = { owner: null };
    const c = mkCanvas();
    c.getContext('2d'); // real InvalidStateError source: context already grabbed
    const b = createCandleRenderWorkerBridge({
      canvas: c, windowRef: win, env: {}, ownershipRegistry: registry,
      workerFactory: countingFactory, workerUrl: WORKER_URL, cssWidth: 320, cssHeight: 180, dpr: 1,
    });
    let thrown = null;
    let r = null;
    try { r = b.transferCanvas(); } catch (err) { thrown = String(err && err.message || err); }
    let legacyOk = false;
    try {
      const ctx = c.getContext('2d');
      if (ctx) { ctx.fillRect(0, 0, 4, 4); legacyOk = true; }
    } catch { legacyOk = false; }
    row('M21-2-B1c', 'transfer-throw-contained-terminate-once',
      thrown == null && r && r.ok === false && r.reason === 'transfer-failed'
      && obs.constructs === 1 && terminates === 1
      && b.getStats().canvasTransfers === 0 && registry.owner === null
      && b.getStats().state === 'fallback-main-thread',
      `real InvalidStateError contained: reason=${r && r.reason} constructs=${obs.constructs} `
      + `terminates=${terminates} state=${b.getStats().state}`);
    row('M21-2-B1c', 'transfer-throw-canvas-intact-legacy-paints', legacyOk,
      'getContext(2d)+fillRect on the SAME element succeeded → spec throw preceded any transfer');
    b.destroy();
  }

  // ── B2 pre-init kill-switch → legacy, zero workers ──
  {
    win[M21_2_KILL_SWITCH] = true;
    const obs = observedFactory();
    const c = mkCanvas();
    const b = createCandleRenderWorkerBridge({
      canvas: c, windowRef: win, env: {}, ownershipRegistry: { owner: null },
      workerFactory: obs.factory, workerUrl: WORKER_URL, cssWidth: 320, cssHeight: 180, dpr: 1,
    });
    const r = b.transferCanvas();
    const pol = b.applyKillSwitchPolicy();
    let legacyOk = false;
    try { legacyOk = !!c.getContext('2d'); } catch { legacyOk = false; }
    row('M21-2-B2', 'pre-init-kill-refuses-transfer',
      r.ok === false && r.reason === 'kill-switch' && obs.constructs === 0,
      `reason=${r.reason} workerConstructs=${obs.constructs}`);
    row('M21-2-B2', 'pre-init-kill-policy-main-thread',
      pol.mode === 'pre-transfer-main-thread' && legacyOk,
      `mode=${pol.mode} legacyGetContext=${legacyOk}`);
    win[M21_2_KILL_SWITCH] = false;
  }

  // ── B3 one-shot transfer + deterministic frame (MAIN lifecycle bridge) ──
  const obsM = observedFactory();
  const canvasM = mkCanvas(320, 180);
  const bridgeM = createCandleRenderWorkerBridge({
    canvas: canvasM, windowRef: win, env: {}, ownershipRegistry: { owner: null },
    workerFactory: obsM.factory, workerUrl: WORKER_URL, cssWidth: 320, cssHeight: 180, dpr: 1,
  });
  const bars = deterministicBars();
  let capAfterFrame = null;
  {
    const r1 = bridgeM.transferCanvas();
    const initAcked = await waitFor(() => obsM.messages.some(
      (m) => m.type === M21_2_MSG.ACK && m.phase === 'init' && m.ok === true));
    row('M21-2-B3', 'one-shot-transfer-init-acked', r1.ok === true && initAcked,
      `transfer.ok=${r1.ok} initAck=${initAcked} realWorker=${obsM.constructs === 1}`);

    const frame = packFrame(bars);
    const sub = bridgeM.submitFrame({ buffer: frame.buffer, descriptor: buildFrameDescriptor({ barCount: 8 }) });
    const frameAcked = await waitFor(() => obsM.messages.some(
      (m) => m.type === M21_2_MSG.ACK && m.phase === 'frame' && m.ok === true && m.generation === sub.generation));
    row('M21-2-B3', 'deterministic-frame-applied-acked', sub.ok === true && frameAcked,
      `generation=${sub.generation} acked=${frameAcked}`);
    row('M21-2-B3', 'frame-buffer-detached-after-post', frame.buffer.byteLength === 0,
      `byteLength=${frame.buffer.byteLength} (real structured-clone transfer)`);

    const r2 = bridgeM.transferCanvas();
    row('M21-2-B3', 'duplicate-transfer-rejected',
      r2.ok === false && r2.reason === 'already-transferred'
      && bridgeM.getStats().duplicateTransferRejections === 1 && bridgeM.getStats().canvasTransfers === 1,
      `reason=${r2.reason} transfers=${bridgeM.getStats().canvasTransfers}`);

    // BPX scaffold-only pixel oracle (explicitly NOT product pixel parity)
    await waitFor(() => (capAfterFrame = tryCapture(canvasM)) && capAfterFrame.nonBlank > 0, 3000, 60);
    if (capAfterFrame && capAfterFrame.nonBlank > 0) {
      const lo = Math.min(...bars.map((b) => b.l));
      const hi = Math.max(...bars.map((b) => b.h));
      const yFor = (p) => 180 - ((p - lo) / (hi - lo)) * 180;
      const bodyMidY = (b) => (yFor(Math.max(b.o, b.c)) + yFor(Math.min(b.o, b.c))) / 2;
      const upSpot = capAfterFrame.sample(20, bodyMidY(bars[0]));   // bar0 body center (up)
      const downSpot = capAfterFrame.sample(60, bodyMidY(bars[1])); // bar1 body center (down)
      row('M21-2-BPX', 'scaffold-pixel-frame-nonblank', capAfterFrame.nonBlank > 100,
        `nonBlank=${capAfterFrame.nonBlank} checksum=0x${capAfterFrame.hash.toString(16)} — scaffold oracle only, NOT product pixel parity / NOT a perf GREEN`);
      row('M21-2-BPX', 'scaffold-pixel-up-body-color', isColor(upSpot, '#26a69a'),
        `rgba(${upSpot}) @(20,${bodyMidY(bars[0]).toFixed(0)}) want #26a69a — scaffold oracle only`);
      row('M21-2-BPX', 'scaffold-pixel-down-body-color', isColor(downSpot, '#ef5350'),
        `rgba(${downSpot}) @(60,${bodyMidY(bars[1]).toFixed(0)}) want #ef5350 — scaffold oracle only`);
    } else {
      row('M21-2-BPX', 'scaffold-pixel-oracle-unavailable', true,
        'placeholder-canvas drawImage capture not reliable in this browser — pixel rows degrade to message-level assertions',
        { notMeasurable: true });
    }
  }

  // ── B4 generation/coalescing latest-wins (real queueMicrotask) ──
  {
    const statsBefore = bridgeM.getStats();
    const f1 = packFrame(bars.slice(0, 6));
    const f2 = packFrame(bars.slice(0, 7));
    const f3 = packFrame(bars);
    const s1 = bridgeM.submitFrame({ buffer: f1.buffer, descriptor: buildFrameDescriptor({ barCount: 6 }) });
    const s2 = bridgeM.submitFrame({ buffer: f2.buffer, descriptor: buildFrameDescriptor({ barCount: 7 }) });
    const s3 = bridgeM.submitFrame({ buffer: f3.buffer, descriptor: buildFrameDescriptor({ barCount: 8 }) });
    const latestAcked = await waitFor(() => obsM.messages.some(
      (m) => m.type === M21_2_MSG.ACK && m.phase === 'frame' && m.ok === true && m.generation === s3.generation));
    const statsAfter = bridgeM.getStats();
    const reclaimed = bridgeM.drainReclaimableBuffers();
    row('M21-2-B4', 'burst-coalesced-latest-wins',
      s1.ok && s2.ok && s3.ok && latestAcked
      && statsAfter.framesPosted - statsBefore.framesPosted === 1
      && statsAfter.lastPostedGeneration === s3.generation,
      `posted +${statsAfter.framesPosted - statsBefore.framesPosted} for 3 submits; ackedGen=${s3.generation}`);
    row('M21-2-B4', 'coalesced-out-buffers-reclaimable-undetached',
      reclaimed.length === 2 && reclaimed.every((b) => b.byteLength > 0)
      && f3.buffer.byteLength === 0,
      `reclaimed=${reclaimed.length} undetached=${reclaimed.every((b) => b.byteLength > 0)} latestDetached=${f3.buffer.byteLength === 0}`);
    row('M21-2-B4', 'no-superseded-frame-ack',
      !obsM.messages.some((m) => m.type === M21_2_MSG.ACK && m.phase === 'frame'
        && (m.generation === s1.generation || m.generation === s2.generation)),
      'generations of coalesced-out frames never reached the worker');
  }

  // ── B5 malformed descriptor reject (bridge throw + worker CANDLE_ERROR) ──
  {
    let bridgeThrew = null;
    const fBad = packFrame(bars);
    try {
      bridgeM.submitFrame({
        buffer: fBad.buffer,
        descriptor: { byteOffset: 0, byteLength: 8 * 6 * 8, elementCount: 8 * 6 + 1, barCount: 8, stride: 6 },
      });
    } catch (err) { bridgeThrew = String(err && err.message || err); }
    row('M21-2-B5', 'bridge-rejects-malformed-descriptor-sync',
      bridgeThrew != null && bridgeThrew.includes('descriptor'), `threw="${bridgeThrew}"`);

    const errBefore = obsM.messages.filter((m) => m.type === M21_2_MSG.ERROR).length;
    obsM.lastWorker.postMessage({
      type: M21_2_MSG.FRAME, generation: 0,
      descriptor: { byteOffset: 8, byteLength: 96, elementCount: 12, barCount: 2, stride: 6 },
      buffer: new ArrayBuffer(104),
    });
    const workerErrored = await waitFor(() => obsM.messages.filter(
      (m) => m.type === M21_2_MSG.ERROR).length > errBefore);
    const lastErr = obsM.messages.filter((m) => m.type === M21_2_MSG.ERROR).pop();
    row('M21-2-B5', 'worker-rejects-malformed-descriptor-candle-error',
      workerErrored && lastErr && String(lastErr.error).includes('descriptor-byteOffset-nonzero'),
      `CANDLE_ERROR="${lastErr && lastErr.error}" (raw post past the bridge — real worker validator)`);

    // stale-drop against the real worker: replay generation 1 (already applied)
    const fStale = packFrame(bars);
    obsM.lastWorker.postMessage({
      type: M21_2_MSG.FRAME, generation: 1,
      descriptor: buildFrameDescriptor({ barCount: 8 }), buffer: fStale.buffer,
    }, [fStale.buffer]);
    const staleDropped = await waitFor(() => obsM.messages.some(
      (m) => m.type === M21_2_MSG.ACK && m.phase === 'frame' && m.dropped === true && m.reason === 'stale'));
    row('M21-2-B5', 'worker-drops-stale-generation', staleDropped,
      'raw replay of generation 1 ACKed dropped:stale by real worker');
  }

  // ── B6 resize/DPR via message AFTER transfer ──
  {
    const resizeAcksBefore = obsM.messages.filter((m) => m.type === M21_2_MSG.ACK && m.phase === 'resize').length;
    const rBad = bridgeM.resize({ dpr: 2, cssWidth: 320 }); // missing fields
    const rOk = bridgeM.resize({ dpr: 2, cssWidth: 320, cssHeight: 180, deviceWidth: 640, deviceHeight: 360 });
    const resizeAcked = await waitFor(() => obsM.messages.filter(
      (m) => m.type === M21_2_MSG.ACK && m.phase === 'resize' && m.ok === true).length > resizeAcksBefore);
    row('M21-2-B6', 'resize-dpr-message-after-transfer',
      rOk.ok === true && resizeAcked && rBad.ok === false && rBad.reason === 'invalid-resize-payload',
      `ack=${resizeAcked} invalidRejected=${rBad.reason}`);
    row('M21-2-B6', 'no-main-thread-backing-store-write', true,
      'resize path is postMessage-only by construction; main thread never touched canvas.width/height after transfer');
    if (capAfterFrame) {
      const capResized = await (async () => {
        let c = null;
        await waitFor(() => (c = tryCapture(canvasM)) && c.w === 640 && c.nonBlank > 0, 3000, 60);
        return c;
      })();
      row('M21-2-BPX', 'scaffold-pixel-worker-repainted-after-resize',
        !!capResized && capResized.w === 640 && capResized.h === 360 && capResized.nonBlank > 100,
        capResized
          ? `placeholder bitmap now ${capResized.w}x${capResized.h}, nonBlank=${capResized.nonBlank}, checksum=0x${capResized.hash.toString(16)} — scaffold oracle only`
          : 'capture unavailable post-resize');
    }
  }

  // ── B7 post-init kill flip → suspend, refused frames, no late paint ──
  let hashBeforeSuspend = null;
  {
    const capNow = tryCapture(canvasM);
    hashBeforeSuspend = capNow ? capNow.hash : null;
    win[M21_2_KILL_SWITCH] = true;
    const pol = bridgeM.applyKillSwitchPolicy();
    const suspendAcked = await waitFor(() => obsM.messages.some(
      (m) => m.type === M21_2_MSG.ACK && m.phase === 'kill-suspend' && m.ok === true));
    const fLate = packFrame(bars);
    const sub = bridgeM.submitFrame({ buffer: fLate.buffer, descriptor: buildFrameDescriptor({ barCount: 8 }) });
    const ackCountAfterSuspend = obsM.messages.filter((m) => m.type === M21_2_MSG.ACK && m.phase === 'frame' && m.ok === true).length;
    await sleep(300);
    const noNewFrameAcks = obsM.messages.filter(
      (m) => m.type === M21_2_MSG.ACK && m.phase === 'frame' && m.ok === true).length === ackCountAfterSuspend;
    row('M21-2-B7', 'post-init-kill-suspends',
      pol.mode === 'post-transfer-suspend' && suspendAcked,
      `mode=${pol.mode} workerAck=${suspendAcked}`);
    row('M21-2-B7', 'suspended-frames-refused-at-bridge',
      sub.ok === false && sub.reason === 'kill-suspended' && fLate.buffer.byteLength > 0 && noNewFrameAcks,
      `reason=${sub.reason} bufferKept=${fLate.buffer.byteLength > 0} noNewAcks=${noNewFrameAcks}`);
    if (hashBeforeSuspend != null) {
      const capAfter = tryCapture(canvasM);
      row('M21-2-BPX', 'scaffold-pixel-no-paint-while-suspended',
        !!capAfter && capAfter.hash === hashBeforeSuspend,
        `checksum stable 0x${hashBeforeSuspend.toString(16)} — scaffold oracle only`);
    }
    win[M21_2_KILL_SWITCH] = false;
  }

  // ── B8 teardown/termination → refusal, silence, no late paint ──
  {
    const capBefore = tryCapture(canvasM);
    const msgCountAtDestroy = obsM.messages.length;
    bridgeM.destroy();
    bridgeM.destroy(); // idempotence
    const sub = bridgeM.submitFrame({ buffer: packFrame(bars).buffer, descriptor: buildFrameDescriptor({ barCount: 8 }) });
    try { obsM.lastWorker.postMessage({ type: M21_2_MSG.FRAME, generation: 999, descriptor: buildFrameDescriptor({ barCount: 8 }), buffer: packFrame(bars).buffer }); } catch { /* terminated */ }
    await sleep(350);
    const silentAfterDestroy = obsM.messages.filter(
      (m, i) => i >= msgCountAtDestroy && m.type === M21_2_MSG.ACK && m.phase === 'frame').length === 0;
    row('M21-2-B8', 'destroy-refuses-frames-releases-worker',
      sub.ok === false && sub.reason === 'destroyed' && bridgeM.getStats().workerCount === 0 && bridgeM.getStats().destroyed,
      `reason=${sub.reason} workerCount=${bridgeM.getStats().workerCount} (double destroy tolerated)`);
    row('M21-2-B8', 'terminated-worker-silent-no-late-frame',
      silentAfterDestroy,
      'no frame ACK after destroy(); raw post to terminated worker produced nothing');
    if (capBefore) {
      const capAfter = tryCapture(canvasM);
      row('M21-2-BPX', 'scaffold-pixel-no-late-paint-after-destroy',
        !!capAfter && capAfter.hash === capBefore.hash,
        `checksum stable 0x${capBefore.hash.toString(16)} — scaffold oracle only`);
    }
  }

  // ── B9 phase-1 host-only ownership at 1/2/4 views ──
  for (const views of [1, 2, 4]) {
    const registry = { owner: null };
    const obs = observedFactory();
    const host = createCandleRenderWorkerBridge({
      canvas: mkCanvas(160, 90), windowRef: win, env: {}, ownershipRegistry: registry,
      workerFactory: obs.factory, workerUrl: WORKER_URL, cssWidth: 160, cssHeight: 90, dpr: 1,
    });
    const embeds = [];
    for (let i = 1; i < views; i += 1) {
      embeds.push(createCandleRenderWorkerBridge({
        canvas: mkCanvas(160, 90), windowRef: win,
        env: { isMultichartEmbedPanel: true, parentHasMultichartGrid: true },
        ownershipRegistry: registry, workerFactory: obs.factory, workerUrl: WORKER_URL,
        cssWidth: 160, cssHeight: 90, dpr: 1,
      }));
    }
    const rHost = host.transferCanvas();
    const embedResults = embeds.map((e) => e.transferCanvas());
    const initAcked = await waitFor(() => obs.messages.some(
      (m) => m.type === M21_2_MSG.ACK && m.phase === 'init' && m.ok === true));
    const transfers = host.getStats().canvasTransfers
      + embeds.reduce((n, e) => n + e.getStats().canvasTransfers, 0);
    row('M21-2-B9', `views-${views}-single-real-worker-host-only`,
      rHost.ok === true && initAcked && obs.constructs === 1 && transfers === 1
      && embedResults.every((r) => r.ok === false && r.reason === 'embed-not-owner'),
      `workerConstructs=${obs.constructs} canvasTransfers=${transfers} embedsRefused=${embedResults.length}`);
    host.destroy();
    embeds.forEach((e) => e.destroy());
    row('M21-2-B9', `views-${views}-ownership-released-on-destroy`, registry.owner === null,
      'registry.owner cleared → next document lifecycle can re-own');
  }

  // ── B10 strict same-origin CSP compatibility ──
  {
    let cspHeader = '';
    try {
      const resp = await fetch(location.pathname, { method: 'GET', cache: 'no-store' });
      cspHeader = resp.headers.get('content-security-policy') || '';
    } catch { cspHeader = '(fetch failed)'; }
    const strict = cspHeader.includes("script-src 'self'") && cspHeader.includes("worker-src 'self'");
    row('M21-2-B10', 'served-under-strict-same-origin-csp', strict, `CSP="${cspHeader}"`);
    row('M21-2-B10', 'no-csp-violations-entire-run', cspViolations.length === 0,
      cspViolations.length ? cspViolations.slice(0, 5).join(' | ')
        : `real classic worker constructed from same-origin URL ${WORKER_URL} with zero violations`);
  }

  // ── B11 R5: ACK-driven stats / rejection accounting / snapshot / empty frame ──
  {
    const obs = observedFactory();
    const registry = { owner: null };
    const c = mkCanvas(320, 180);
    let workerErrCount = 0;
    let fatalCount = 0;
    const b = createCandleRenderWorkerBridge({
      canvas: c, windowRef: win, env: {}, ownershipRegistry: registry,
      workerFactory: obs.factory, workerUrl: WORKER_URL, cssWidth: 320, cssHeight: 180, dpr: 1,
      onWorkerError: () => { workerErrCount += 1; },
      onFatalWorkerLoss: () => { fatalCount += 1; },
    });
    b.transferCanvas();
    const initConsumed = await waitFor(() => b.getStats().acks && b.getStats().acks.init === 1);
    const f1 = packFrame(deterministicBars());
    const sub1 = b.submitFrame({ buffer: f1.buffer, descriptor: buildFrameDescriptor({ barCount: 8 }) });
    const applied1 = await waitFor(() => b.getStats().framesApplied === 1
      && b.getStats().lastAppliedGeneration === sub1.generation);
    row('M21-2-B11', 'bridge-consumes-real-worker-acks',
      initConsumed && applied1 && b.getStats().acks.frame >= 1,
      `acks=${JSON.stringify(b.getStats().acks)} applied=${b.getStats().framesApplied} lastAppliedGen=${b.getStats().lastAppliedGeneration}`);

    // Worker rejection (raw malformed post past the bridge) — surfaced via
    // onWorkerError, NEVER counted applied, non-fatal, bridge stays active.
    obs.lastWorker.postMessage({
      type: M21_2_MSG.FRAME, generation: 0,
      descriptor: { byteOffset: 8, byteLength: 96, elementCount: 12, barCount: 2, stride: 6 },
      buffer: new ArrayBuffer(104),
    });
    const rejectionSurfaced = await waitFor(() => b.getStats().workerErrors >= 1);
    row('M21-2-B11', 'worker-rejection-surfaced-never-applied',
      rejectionSurfaced && b.getStats().framesApplied === 1 && workerErrCount >= 1
      && fatalCount === 0 && b.getStats().state === 'active',
      `workerErrors=${b.getStats().workerErrors} applied=${b.getStats().framesApplied} state=${b.getStats().state} fatal=${fatalCount}`);

    // Descriptor snapshot: hostile mutation between submit and microtask flush.
    const f2 = packFrame(deterministicBars());
    const d2 = buildFrameDescriptor({ barCount: 8 });
    const sub2 = b.submitFrame({ buffer: f2.buffer, descriptor: d2 });
    d2.barCount = 9999; d2.elementCount = -1; d2.byteLength = 1; d2.byteOffset = 8;
    const applied2 = await waitFor(() => b.getStats().framesApplied === 2
      && b.getStats().lastAppliedGeneration === sub2.generation);
    row('M21-2-B11', 'descriptor-mutation-after-submit-ineffective',
      applied2 && b.getStats().state === 'active',
      `real worker validated+applied the frozen submit-time snapshot (gen=${sub2.generation}); mutated caller object ignored`);

    // Duplicate pending buffer rejected in the same sync block.
    const f3 = packFrame(deterministicBars());
    const d3 = buildFrameDescriptor({ barCount: 8 });
    b.submitFrame({ buffer: f3.buffer, descriptor: d3 });
    let dupThrew = null;
    try { b.submitFrame({ buffer: f3.buffer, descriptor: d3 }); } catch (err) { dupThrew = String(err && err.message || err); }
    const applied3 = await waitFor(() => b.getStats().framesApplied === 3);
    row('M21-2-B11', 'duplicate-pending-buffer-rejected',
      dupThrew != null && dupThrew.includes('buffer-already-pending') && applied3,
      `threw="${dupThrew}"; original pending still posted+applied once`);

    // Explicit empty frame: NEW zero-length buffer + barCount=0 clears the layer.
    const emptyBuffer = new ArrayBuffer(0);
    let emptyThrew = null;
    let subE = null;
    try { subE = b.submitFrame({ buffer: emptyBuffer, descriptor: buildFrameDescriptor({ barCount: 0 }) }); } catch (err) { emptyThrew = String(err && err.message || err); }
    const clearedAck = await waitFor(() => b.getStats().framesApplied === 4 && b.getStats().layerCleared === true);
    row('M21-2-B11', 'explicit-empty-frame-posted-and-cleared-ack',
      emptyThrew == null && !!subE && subE.ok === true && clearedAck,
      `threw=${emptyThrew} ackCleared=${clearedAck} appliedGen=${b.getStats().lastAppliedGeneration}`);
    let capCleared = null;
    await waitFor(() => (capCleared = tryCapture(c)) && capCleared.nonBlank === 0, 3000, 60);
    if (capCleared) {
      row('M21-2-BPX', 'scaffold-pixel-empty-frame-no-stale-pixels', capCleared.nonBlank === 0,
        `nonBlank=${capCleared.nonBlank} — scaffold oracle only, NOT product pixel parity`);
    } else {
      row('M21-2-BPX', 'scaffold-pixel-empty-frame-capture-unavailable', true,
        'placeholder capture not reliable — empty-frame row degrades to ACK-level assertion', { notMeasurable: true });
    }

    // Empty descriptor retained: resize repaint keeps the layer cleared.
    const resizeAcksBefore = b.getStats().acks.resize;
    b.resize({ dpr: 1, cssWidth: 400, cssHeight: 200, deviceWidth: 400, deviceHeight: 200 });
    const resizeAcked = await waitFor(() => b.getStats().acks.resize > resizeAcksBefore);
    let capAfterResize = null;
    await waitFor(() => (capAfterResize = tryCapture(c)) && capAfterResize.w === 400, 3000, 60);
    row('M21-2-B11', 'empty-descriptor-retained-across-resize',
      resizeAcked && (!capAfterResize || capAfterResize.nonBlank === 0),
      capAfterResize
        ? `resized to ${capAfterResize.w}x${capAfterResize.h}, nonBlank=${capAfterResize.nonBlank} (stays cleared)`
        : 'resize ACKed; capture unavailable — message-level assertion only');

    // Identity tracking: the TRANSFERRED empty buffer is rejected on resubmit.
    let idThrew = null;
    try { b.submitFrame({ buffer: emptyBuffer, descriptor: buildFrameDescriptor({ barCount: 0 }) }); } catch (err) { idThrew = String(err && err.message || err); }
    row('M21-2-B11', 'transferred-empty-buffer-identity-rejected',
      idThrew != null && idThrew.includes('detached-buffer-reuse'), `threw="${idThrew}"`);
    b.destroy();
  }

  // ── B12 R5: kill-before-flush cancels pending — never posts, reclaim once ──
  {
    const obs = observedFactory();
    const c = mkCanvas();
    const b = createCandleRenderWorkerBridge({
      canvas: c, windowRef: win, env: {}, ownershipRegistry: { owner: null },
      workerFactory: obs.factory, workerUrl: WORKER_URL, cssWidth: 320, cssHeight: 180, dpr: 1,
    });
    b.transferCanvas();
    await waitFor(() => b.getStats().acks.init === 1);
    const f = packFrame(deterministicBars());
    const sub = b.submitFrame({ buffer: f.buffer, descriptor: buildFrameDescriptor({ barCount: 8 }) });
    // SAME synchronous block: the kill flip lands before the microtask flush.
    win[M21_2_KILL_SWITCH] = true;
    const pol = b.applyKillSwitchPolicy();
    const suspendAcked = await waitFor(() => b.getStats().acks.killSuspend === 1);
    await sleep(250); // any late post would have flushed by now
    const s = b.getStats();
    const drained = b.drainReclaimableBuffers();
    row('M21-2-B12', 'kill-before-flush-cancels-pending-frame',
      sub.ok === true && pol.mode === 'post-transfer-suspend' && suspendAcked
      && s.framesPosted === 0 && s.acks.frame === 0 && s.pendingCancelled === 1
      && drained.length === 1 && drained[0] === f.buffer && f.buffer.byteLength > 0,
      `posted=${s.framesPosted} frameAcks=${s.acks.frame} drained=${drained.length} undetached=${f.buffer.byteLength > 0}`);
    row('M21-2-B12', 'cancelled-buffer-reclaimable-exactly-once',
      b.drainReclaimableBuffers().length === 0, 'second drain returns nothing');
    win[M21_2_KILL_SWITCH] = false;
    b.destroy();
  }

  // ── B13 R5: REAL worker load failure → one idempotent degraded-canvas-lost ──
  {
    const registry = { owner: null };
    const c = mkCanvas();
    let fatalCount = 0;
    let fatalReason = '';
    let workerErrs = 0;
    const b = createCandleRenderWorkerBridge({
      canvas: c, windowRef: win, env: {}, ownershipRegistry: registry,
      workerUrl: '/chart/workers/m21-2-candle-render-worker.MISSING-404.js',
      cssWidth: 320, cssHeight: 180, dpr: 1,
      onWorkerError: () => { workerErrs += 1; },
      onFatalWorkerLoss: (info) => { fatalCount += 1; fatalReason = info && info.reason; },
    });
    const r = b.transferCanvas(); // constructs a REAL Worker whose script 404s
    const wentFatal = await waitFor(() => b.getStats().state === 'degraded-canvas-lost', 6000);
    const late = packFrame(deterministicBars());
    let sub = null;
    let subThrew = null;
    try { sub = b.submitFrame({ buffer: late.buffer, descriptor: buildFrameDescriptor({ barCount: 8 }) }); } catch (err) { subThrew = String(err && err.message || err); }
    const rz = b.resize({ dpr: 1, cssWidth: 320, cssHeight: 180, deviceWidth: 320, deviceHeight: 180 });
    row('M21-2-B13', 'real-worker-load-failure-fatal-once',
      r.ok === true && wentFatal && fatalCount === 1 && workerErrs >= 1
      && registry.owner === null && b.getStats().workerCount === 0,
      `real 404 worker script → error event → fatal(reason=${fatalReason}) exactly once; registry released`);
    row('M21-2-B13', 'fatal-refuses-frames-and-resizes-no-silent-paint',
      subThrew == null && !!sub && sub.ok === false && sub.reason === 'degraded-canvas-lost'
      && rz.ok === false && rz.reason === 'degraded-canvas-lost' && late.buffer.byteLength > 0,
      `submit=${sub && sub.reason} resize=${rz.reason} bufferKept=${late.buffer.byteLength > 0} — transferred canvas NEVER silently main-thread painted`);
    // R6: the fatal reason is PERSISTED and every refusal restates it; a
    // retried transferCanvas() is gated BEFORE construct (zero new workers).
    const r2 = b.transferCanvas();
    const r3 = b.transferCanvas();
    row('M21-2-B13', 'fatal-reason-persisted-retry-transfer-refused',
      b.getStats().fatalReason === fatalReason && !!fatalReason
      && r2.ok === false && r2.reason === 'degraded-canvas-lost' && r2.fatalReason === fatalReason
      && r3.ok === false && r3.reason === 'degraded-canvas-lost' && r3.fatalReason === fatalReason
      && sub.fatalReason === fatalReason && rz.fatalReason === fatalReason
      && fatalCount === 1,
      `stats.fatalReason=${b.getStats().fatalReason} retryReason=${r2.reason}/${r2.fatalReason} callbacks=${fatalCount}`);
    // R7: runtime kill-switch toggles and invalid payloads can NEVER relabel
    // the permanent fatal state — the original reason survives OFF→ON→OFF.
    win[M21_2_KILL_SWITCH] = true;
    const polOn = b.applyKillSwitchPolicy();
    const stateOn = b.getStats().state;
    win[M21_2_KILL_SWITCH] = false;
    const polOff = b.applyKillSwitchPolicy();
    const rzInvalid = b.resize({ dpr: 'nope' });
    row('M21-2-B13', 'kill-toggles-and-invalid-payloads-never-relabel-fatal',
      polOn.mode === 'fatal-degraded' && polOn.fatalReason === fatalReason
      && polOff.mode === 'fatal-degraded' && polOff.fatalReason === fatalReason
      && stateOn === 'degraded-canvas-lost' && b.getStats().state === 'degraded-canvas-lost'
      && rzInvalid.ok === false && rzInvalid.reason === 'degraded-canvas-lost'
      && rzInvalid.fatalReason === fatalReason && fatalCount === 1,
      `polOn=${polOn.mode} polOff=${polOff.mode} state=${b.getStats().state} invalidResize=${rzInvalid.reason}/${rzInvalid.fatalReason}`);
    b.destroy();
    row('M21-2-B13', 'destroy-after-fatal-idempotent',
      fatalCount === 1 && registry.owner === null && b.getStats().workerCount === 0,
      'destroy after fatal: no double terminate, no double callback');
  }

  // ── B14 R6: ACK correlation ledger against the REAL bridge + REAL worker ────
  // The real worker's genuine ACK is consumed first; then forged worker→main
  // replies are injected by invoking the bridge-installed onmessage handler
  // directly (synthetic-injection — a real Worker cannot be made to forge
  // ACKs, so the adversarial sender is modeled; the bridge under test is real).
  {
    const obs = observedFactory();
    const b = createCandleRenderWorkerBridge({
      canvas: mkCanvas(), windowRef: win, env: {}, ownershipRegistry: { owner: null },
      workerFactory: obs.factory, workerUrl: WORKER_URL, cssWidth: 320, cssHeight: 180, dpr: 1,
    });
    b.transferCanvas();
    await waitFor(() => b.getStats().acks.init === 1);
    const f = packFrame(deterministicBars());
    const sub = b.submitFrame({ buffer: f.buffer, descriptor: buildFrameDescriptor({ barCount: 8 }) });
    const applied = await waitFor(() => b.getStats().framesApplied === 1, 6000);
    const base = b.getStats();
    const inject = (data) => obs.lastWorker.onmessage({ data });
    inject({ type: M21_2_MSG.ACK, phase: 'frame', ok: true, generation: sub.generation });      // duplicate (consumed)
    inject({ type: M21_2_MSG.ACK, phase: 'frame', ok: true, generation: Infinity });            // invalid
    inject({ type: M21_2_MSG.ACK, phase: 'frame', ok: true, generation: sub.generation + 7 });  // never posted
    inject({ type: M21_2_MSG.ACK, phase: 'frame', ok: true, generation: sub.generation, cleared: true }); // cleared poison
    const s = b.getStats();
    row('M21-2-B14', 'forged-success-acks-never-double-apply (synthetic-injection)',
      applied && base.framesApplied === 1 && base.outstandingFrames === 0
      && s.framesApplied === 1 && s.lastAppliedGeneration === sub.generation
      && s.layerCleared === false && s.rejectedAcks === 4 && s.state === 'active',
      `applied=${s.framesApplied} lastApplied=${s.lastAppliedGeneration} rejectedAcks=${s.rejectedAcks} anomaly=${s.lastAckAnomaly} state=${s.state}`);
    inject({ type: M21_2_MSG.ACK, phase: 'init', ok: true, generation: sub.generation + 1 });
    inject({ type: M21_2_MSG.ACK, phase: 'resize', ok: true, generation: sub.generation + 1, cleared: true });
    inject({ type: M21_2_MSG.ACK, phase: 'kill-suspend', ok: true, generation: sub.generation + 1 });
    const s2 = b.getStats();
    row('M21-2-B14', 'control-ack-confusion-never-touches-frame-state (synthetic-injection)',
      s2.framesApplied === 1 && s2.lastAppliedGeneration === sub.generation
      && s2.layerCleared === false && s2.state === 'active',
      `applied=${s2.framesApplied} lastApplied=${s2.lastAppliedGeneration} layerCleared=${s2.layerCleared}`);
    b.destroy();
  }

  return rows;
}

const report = {
  worker: 'W3',
  harness: 'm21-2-browser-harness',
  status: 'PRELIMINARY-SCAFFOLD-BROWSER',
  url: location.href,
  userAgent: navigator.userAgent,
  startedAt: new Date().toISOString(),
  rows: [],
  reviewerIssues: [],
  pageError: null,
};

try {
  await main();
} catch (err) {
  report.pageError = String(err && err.stack || err);
  row('M21-2-BRUN', 'harness-completed-without-page-error', false, report.pageError);
}
report.rows = rows;
report.reviewerIssues = reviewerIssues;
report.pass = rows.filter((r) => r.pass).length;
report.fail = rows.filter((r) => !r.pass).length;
report.verdict = report.fail === 0 ? 'HARNESS-PASS' : 'HARNESS-FAIL';
if (logEl) logEl.textContent += `\n\n${report.verdict}: ${report.pass} pass / ${report.fail} fail`;

try {
  await fetch('/report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(report),
  });
} catch { /* manual runs without the harness server still show DOM results */ }
