/**
 * M21-2 — candle-layer OffscreenCanvas render worker (W3-owned scaffold).
 *
 * SAME-ORIGIN CLASSIC WORKER. Binding rules (see modules/M21-2-CANDLE-OFFSCREEN-API.md):
 *   - Never bootstrap via a blob URL (CSP hazard H3; custom-indicator precedent).
 *   - URL contract: /chart/workers/m21-2-candle-render-worker.js?v=<build>
 *     (?v= cache-bust added at wiring time — hazard H10).
 *   - Classic script, no top-level module syntax (product precedent H9);
 *     dual-loadable in Node via the CommonJS export guard at the bottom.
 *   - Kill-switch lives on the MAIN thread and is consulted BEFORE the first
 *     transferControlToOffscreen: window.__TALARIA_DISABLE_M21_2_CANDLE_OFFSCREEN_V1
 *
 * Status: FABLE-SIGNED module-level scaffold — NOT wired into product runtime.
 * chart.js / bootstrap / CSP wiring is LOCKED until the Manager commits M21-1.
 *
 * Frame data contract (authoritative, W3):
 *   descriptor = { byteOffset: 0, byteLength, elementCount, barCount, stride: 6 }
 *   payload    = { type: 'CANDLE_FRAME', generation, descriptor, buffer }
 *   transfer   = [buffer]
 *   Layout: Float64 [t, o, h, l, c, v] × barCount (matches W1 B2 / W6 mirror).
 *   Reconstruct ONLY via (buffer, byteOffset, elementCount) — a bare
 *   `new Float64Array(buffer)` over-reads spare capacity (NaN poison hazard).
 *   Stale drop: generation <= lastAppliedGeneration is discarded.
 *
 * Worker-edge contract (independent-review correction, W3 worker-only lane):
 *   - INIT failure is deterministic and NEVER ACKs ok:true:
 *       CANDLE_ERROR { phase:'init', ok:false, error:'init-canvas-missing' }
 *       CANDLE_ERROR { phase:'init', ok:false, error:'init-context-unavailable' }
 *     A failed-INIT worker stays non-active: FRAME/RESIZE are rejected with
 *     CANDLE_ERROR error:'worker-not-active' and never paint or advance state.
 *   - generation must be a finite safe integer >= 1 (Number.isSafeInteger);
 *     Infinity/NaN/fraction/unsafe/negative/zero/non-number frames are rejected
 *     with CANDLE_ERROR error:'frame-generation-invalid' WITHOUT advancing
 *     lastAppliedGeneration (one bad frame cannot poison later finite frames).
 *   - The sibling buffer must be present (byteLength readable); otherwise
 *     CANDLE_ERROR error:'frame-buffer-missing'. Malformed descriptor/frame
 *     errors never advance lastApplied and never replace the retained frame.
 *   - Explicit empty frame (barCount=0, elementCount=0, legitimate zero-length
 *     sibling buffer) is a SUCCESS: it clears the entire candle layer, advances
 *     generation, replaces the retained frame, and stays cleared across
 *     CANDLE_RESIZE. ACK { phase:'frame', ok:true, cleared:true, barCount:0 }.
 *
 * R6 — frame-outcome ↔ generation correlation (BLOCK-M21-2-R6 correction,
 * status PENDING-BRIDGE-CONVERGENCE). Response schemas, phase:'frame' only:
 *   success: { type:'CANDLE_ACK',   phase:'frame', ok:true, generation
 *              [, cleared:true, barCount:0] }
 *   drop:    { type:'CANDLE_ACK',   phase:'frame', dropped:true,
 *              reason:'stale'|'suspended', generation }
 *   error:   { type:'CANDLE_ERROR', phase:'frame', error, generation }
 *            (worker-not-active / frame-buffer-missing / descriptor-* throw /
 *             render throw / any exception path — all carry the INPUT frame's
 *             validated finite safe-integer generation, extracted BEFORE any
 *             deeper validation and never replaced by lastApplied or another
 *             frame's value)
 *   invalid/missing input generation → the ERROR shape carries the explicit
 *   non-correlatable marker { generation:null, generationInvalid:true }; a
 *   generation is NEVER invented or coerced, drops are NEVER emitted without
 *   a valid correlated generation, and the bridge must NEVER use the marker
 *   (nor any oldest-outstanding fallback) to retire a posted frame.
 *   Ordering: descriptor validation keeps precedence over the generation
 *   gate (harness B5 raw-post contract); control replies (phase 'init' /
 *   'resize' / 'kill-suspend' / 'teardown') never carry a generation field.
 */

/* eslint-disable no-restricted-globals */

var M21_2_WORKER_MSG = {
    INIT: 'CANDLE_INIT',
    FRAME: 'CANDLE_FRAME',
    RESIZE: 'CANDLE_RESIZE',
    TEARDOWN: 'CANDLE_TEARDOWN',
    KILL_SUSPEND: 'CANDLE_KILL_SUSPEND',
    ACK: 'CANDLE_ACK',
    ERROR: 'CANDLE_ERROR'
};

var M21_2_WORKER_STRIDE = 6;
var M21_2_WORKER_BYTES_PER_ELEMENT = 8; // Float64

/** R5/R6 — generation hygiene, rule-identical with the bridge validator. */
function m212WorkerGenerationValid(gen) {
    return Number.isSafeInteger(gen) && gen >= 1;
}

/**
 * R6 — attach the frame-outcome correlation fields to a reply IN PLACE.
 * A valid input generation is echoed exactly; an invalid/missing one becomes
 * the explicit non-correlatable marker { generation:null, generationInvalid:
 * true }. A generation is never invented, coerced, or borrowed from another
 * frame / lastApplied / oldest-pending.
 */
function m212AttachFrameCorrelation(msg, genValid, generation) {
    if (genValid) {
        msg.generation = generation;
    } else {
        msg.generation = null;
        msg.generationInvalid = true;
    }
    return msg;
}

/**
 * Descriptor validation — MUST stay rule-identical with the bridge validator
 * (modules/m21-2-candle-offscreen-bridge.mjs). The scaffold gate runs the same
 * malformed vectors through both and fails on any drift.
 */
function validateFrameDescriptorWorker(desc, capacityByteLength) {
    if (!desc || typeof desc !== 'object') throw new Error('descriptor-missing');
    if (desc.byteOffset !== 0) throw new Error('descriptor-byteOffset-nonzero');
    if (desc.stride !== M21_2_WORKER_STRIDE) throw new Error('descriptor-stride-mismatch');
    if (!Number.isInteger(desc.barCount) || desc.barCount < 0) throw new Error('descriptor-barCount-invalid');
    if (!Number.isInteger(desc.elementCount) || desc.elementCount < 0) throw new Error('descriptor-elementCount-invalid');
    if (!Number.isInteger(desc.byteLength) || desc.byteLength < 0) throw new Error('descriptor-byteLength-invalid');
    if (desc.elementCount !== desc.barCount * desc.stride) throw new Error('descriptor-elementCount-mismatch');
    if (desc.byteLength !== desc.elementCount * M21_2_WORKER_BYTES_PER_ELEMENT) throw new Error('descriptor-byteLength-mismatch');
    if (capacityByteLength != null && desc.byteLength > capacityByteLength) throw new Error('descriptor-exceeds-capacity');
}

function createCandleWorkerCore(deps) {
    deps = deps || {};
    var state = {
        canvas: null,
        ctx: null,
        dpr: 1,
        cssWidth: 0,
        cssHeight: 0,
        lastAppliedGeneration: 0,
        framesApplied: 0,
        staleDropped: 0,
        suspendedDropped: 0,
        invalidFrames: 0,
        clears: 0,
        resizes: 0,
        paints: 0,
        active: false,
        initFailed: false,
        suspended: false,
        tornDown: false,
        lastFrame: null,
        lastError: null
    };

    function post(msg) {
        if (typeof deps.post === 'function') { deps.post(msg); return; }
        if (typeof self !== 'undefined' && typeof self.postMessage === 'function') self.postMessage(msg);
    }

    /** Deterministic rejection: records lastError, posts CANDLE_ERROR, no state advance. */
    function reject(phase, code, extra) {
        state.lastError = code;
        var msg = { type: M21_2_WORKER_MSG.ERROR, phase: phase, error: code };
        if (extra) {
            for (var k in extra) {
                if (Object.prototype.hasOwnProperty.call(extra, k)) msg[k] = extra[k];
            }
        }
        post(msg);
    }

    /**
     * Scaffold candle painter — layout-correct wicks+bodies so real-browser
     * pixel-parity instrumentation (W5) has something deterministic to measure.
     * Pixel parity itself remains NOT-MEASURABLE from Node.
     */
    function paint(view, desc) {
        state.paints += 1;
        var ctx = state.ctx;
        var canvas = state.canvas;
        if (!ctx || !canvas || !desc) return;
        var w = canvas.width || 0;
        var h = canvas.height || 0;
        // Full-surface clear happens for EVERY applied frame — including the
        // explicit empty frame (barCount=0), which must wipe stale candles and
        // stay wiped when the retained frame is repainted after a resize.
        ctx.clearRect(0, 0, w, h);
        if (desc.barCount <= 0) {
            state.clears += 1;
            return;
        }
        var lo = Infinity;
        var hi = -Infinity;
        var i;
        for (i = 0; i < desc.barCount; i += 1) {
            var hh = view[i * 6 + 2];
            var ll = view[i * 6 + 3];
            if (hh > hi) hi = hh;
            if (ll < lo) lo = ll;
        }
        if (!(hi > lo)) { hi = lo + 1; }
        var slot = w / desc.barCount;
        var bodyW = Math.max(1, slot * 0.6);
        function yFor(price) { return h - ((price - lo) / (hi - lo)) * h; }
        for (i = 0; i < desc.barCount; i += 1) {
            var o = view[i * 6 + 1];
            var c = view[i * 6 + 4];
            var up = c >= o;
            var xMid = slot * i + slot / 2;
            ctx.strokeStyle = up ? '#26a69a' : '#ef5350';
            ctx.fillStyle = up ? '#26a69a' : '#ef5350';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(xMid, yFor(view[i * 6 + 2]));
            ctx.lineTo(xMid, yFor(view[i * 6 + 3]));
            ctx.stroke();
            var yTop = yFor(Math.max(o, c));
            var yBot = yFor(Math.min(o, c));
            ctx.fillRect(xMid - bodyW / 2, yTop, bodyW, Math.max(1, yBot - yTop));
        }
    }

    function handleMessage(data) {
        if (!data || typeof data.type !== 'string') return;
        // R6 — extract-and-validate the input generation BEFORE any deeper
        // validation so every frame-scoped reply (including exception paths)
        // carries the exact generation of the frame that produced it.
        var isFrameMsg = data.type === M21_2_WORKER_MSG.FRAME;
        var frameGenValid = isFrameMsg && m212WorkerGenerationValid(data.generation);
        try {
            switch (data.type) {
                case M21_2_WORKER_MSG.INIT: {
                    var initCanvas = data.canvas || null;
                    if (!initCanvas || typeof initCanvas.getContext !== 'function') {
                        state.canvas = null;
                        state.ctx = null;
                        state.active = false;
                        state.initFailed = true;
                        reject('init', 'init-canvas-missing', { ok: false });
                        return;
                    }
                    // Match M21-1b main-canvas context options (desynchronized precedent).
                    var initCtx = initCanvas.getContext('2d', {
                        alpha: true,
                        desynchronized: true,
                        willReadFrequently: false
                    }) || initCanvas.getContext('2d');
                    if (!initCtx) {
                        // getContext('2d') returned null — INIT must FAIL deterministically,
                        // never ACK ok:true, and the worker must stay non-active.
                        state.canvas = null;
                        state.ctx = null;
                        state.active = false;
                        state.initFailed = true;
                        reject('init', 'init-context-unavailable', { ok: false });
                        return;
                    }
                    state.canvas = initCanvas;
                    state.ctx = initCtx;
                    state.dpr = data.dpr || 1;
                    state.cssWidth = data.cssWidth || 0;
                    state.cssHeight = data.cssHeight || 0;
                    if (data.deviceWidth) state.canvas.width = data.deviceWidth;
                    if (data.deviceHeight) state.canvas.height = data.deviceHeight;
                    state.active = true;
                    state.initFailed = false;
                    post({ type: M21_2_WORKER_MSG.ACK, phase: 'init', ok: true });
                    break;
                }
                case M21_2_WORKER_MSG.FRAME: {
                    if (state.tornDown) return;
                    if (!state.active) {
                        // Failed/absent INIT: never accept or paint frames.
                        state.invalidFrames += 1;
                        reject('frame', 'worker-not-active',
                            m212AttachFrameCorrelation({}, frameGenValid, data.generation));
                        return;
                    }
                    if (state.suspended) {
                        if (!frameGenValid) {
                            // R6 — a drop reply is ONLY ever emitted with a valid
                            // correlated generation; a non-correlatable drop could
                            // retire the wrong ledger entry bridge-side.
                            state.invalidFrames += 1;
                            reject('frame', 'frame-generation-invalid',
                                m212AttachFrameCorrelation({}, false, null));
                            return;
                        }
                        state.suspendedDropped += 1;
                        post({ type: M21_2_WORKER_MSG.ACK, phase: 'frame', dropped: true, reason: 'suspended', generation: data.generation });
                        return;
                    }
                    if (!data.buffer || typeof data.buffer.byteLength !== 'number') {
                        state.invalidFrames += 1;
                        reject('frame', 'frame-buffer-missing',
                            m212AttachFrameCorrelation({}, frameGenValid, data.generation));
                        return;
                    }
                    // Descriptor validation keeps precedence over the generation
                    // gate (harness B5 raw-post contract); a throw here reaches the
                    // catch below, which still attaches the frame correlation.
                    validateFrameDescriptorWorker(data.descriptor, data.buffer.byteLength);
                    // generation hygiene: finite safe integer >= 1 only. A single bad
                    // value (Infinity/NaN/fraction/unsafe/negative) must not become
                    // lastAppliedGeneration and poison every later finite frame.
                    if (!frameGenValid) {
                        state.invalidFrames += 1;
                        reject('frame', 'frame-generation-invalid',
                            m212AttachFrameCorrelation({}, false, null));
                        return;
                    }
                    if (data.generation <= state.lastAppliedGeneration) {
                        state.staleDropped += 1;
                        post({ type: M21_2_WORKER_MSG.ACK, phase: 'frame', dropped: true, reason: 'stale', generation: data.generation });
                        return;
                    }
                    var view = new Float64Array(data.buffer, data.descriptor.byteOffset, data.descriptor.elementCount);
                    paint(view, data.descriptor);
                    state.lastFrame = { view: view, descriptor: data.descriptor };
                    state.lastAppliedGeneration = data.generation;
                    state.framesApplied += 1;
                    var frameAck = { type: M21_2_WORKER_MSG.ACK, phase: 'frame', ok: true, generation: data.generation };
                    if (data.descriptor.barCount === 0) {
                        frameAck.cleared = true;
                        frameAck.barCount = 0;
                    }
                    post(frameAck);
                    break;
                }
                case M21_2_WORKER_MSG.RESIZE: {
                    if (state.tornDown) return;
                    if (!state.active) {
                        reject('resize', 'worker-not-active');
                        return;
                    }
                    if (![data.dpr, data.cssWidth, data.cssHeight, data.deviceWidth, data.deviceHeight]
                        .every(function (v) { return typeof v === 'number' && isFinite(v) && v > 0; })) {
                        post({ type: M21_2_WORKER_MSG.ERROR, phase: 'resize', error: 'invalid-resize-payload' });
                        return;
                    }
                    state.dpr = data.dpr;
                    state.cssWidth = data.cssWidth;
                    state.cssHeight = data.cssHeight;
                    if (state.canvas) {
                        // Worker owns the backing store after transfer (hazard H4):
                        // the main thread must never write canvas.width/height again.
                        state.canvas.width = data.deviceWidth;
                        state.canvas.height = data.deviceHeight;
                    }
                    state.resizes += 1;
                    if (state.lastFrame) paint(state.lastFrame.view, state.lastFrame.descriptor);
                    post({ type: M21_2_WORKER_MSG.ACK, phase: 'resize', ok: true });
                    break;
                }
                case M21_2_WORKER_MSG.KILL_SUSPEND: {
                    state.suspended = true;
                    post({ type: M21_2_WORKER_MSG.ACK, phase: 'kill-suspend', ok: true });
                    break;
                }
                case M21_2_WORKER_MSG.TEARDOWN: {
                    state.tornDown = true;
                    state.active = false;
                    state.canvas = null;
                    state.ctx = null;
                    state.lastFrame = null;
                    post({ type: M21_2_WORKER_MSG.ACK, phase: 'teardown', ok: true });
                    break;
                }
                default:
                    break;
            }
        } catch (err) {
            state.lastError = String(err && err.message ? err.message : err);
            // R6 — exception paths (descriptor throw, render/context throw, view
            // construction) stay FRAME outcomes with the exact input correlation;
            // non-frame exceptions keep their raw message type as phase so
            // control outcomes remain distinguishable.
            var errReply = {
                type: M21_2_WORKER_MSG.ERROR,
                error: state.lastError,
                phase: isFrameMsg ? 'frame' : data.type
            };
            if (isFrameMsg) m212AttachFrameCorrelation(errReply, frameGenValid, data.generation);
            post(errReply);
        }
    }

    return { state: state, handleMessage: handleMessage };
}

// Real worker context: classic script entrypoint.
if (typeof self !== 'undefined' && typeof importScripts === 'function') {
    var __m212Core = createCandleWorkerCore();
    self.onmessage = function (e) { __m212Core.handleMessage(e.data); };
}

// Node test context: CommonJS export guard (classic script stays classic).
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        M21_2_WORKER_MSG: M21_2_WORKER_MSG,
        M21_2_WORKER_STRIDE: M21_2_WORKER_STRIDE,
        validateFrameDescriptorWorker: validateFrameDescriptorWorker,
        m212WorkerGenerationValid: m212WorkerGenerationValid,
        m212AttachFrameCorrelation: m212AttachFrameCorrelation,
        createCandleWorkerCore: createCandleWorkerCore
    };
}
