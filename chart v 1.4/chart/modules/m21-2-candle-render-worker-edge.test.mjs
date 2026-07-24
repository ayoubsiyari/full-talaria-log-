/**
 * M21-2 — candle render worker EDGE contract gate (W3 worker-only correction lane).
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m21-2-candle-render-worker-edge.test.mjs"
 *
 * RED-first gate for the WORKER-specific blockers from independent review.
 * This lane edits ONLY workers/m21-2-candle-render-worker.js (both mirrors)
 * plus this NEW mirrored test file — bridge / scaffold test / API doc /
 * browser harness / reports stay untouched (separate R1 correction lane).
 *
 * Worker-edge contract under test (deterministic CANDLE_ERROR codes):
 *   WE1 INIT: offscreen.getContext('2d') → null must NEVER ACK ok:true.
 *       → CANDLE_ERROR { phase:'init', ok:false, error:'init-context-unavailable' }
 *       → CANDLE_ERROR { phase:'init', ok:false, error:'init-canvas-missing' } (no canvas)
 *       Worker remains non-active: frames → CANDLE_ERROR 'worker-not-active',
 *       never painted, lastApplied never advances; resize → 'worker-not-active'.
 *   WE2 Explicit empty frame (barCount=0, elementCount=0, legitimate zero-length
 *       sibling buffer) clears the ENTIRE candle layer, advances generation,
 *       replaces retained state, and stays cleared across CANDLE_RESIZE
 *       (no stale pixels). ACK: { phase:'frame', ok:true, cleared:true, barCount:0 }.
 *   WE3 generation must be a finite safe monotonic integer ≥ 1.
 *       Infinity / -Infinity / NaN / fraction / unsafe / negative / zero /
 *       non-number → CANDLE_ERROR 'frame-generation-invalid'; lastApplied
 *       unchanged; a later finite frame still applies (no poisoning).
 *       Valid stale (int ≤ lastApplied) keeps ACK dropped reason:'stale'.
 *   WE4 Malformed descriptor / missing buffer never advances lastApplied and
 *       never replaces the retained frame (resize repaints the LAST VALID frame).
 *       Missing/non-ArrayBuffer sibling → CANDLE_ERROR 'frame-buffer-missing'.
 *
 * Preserved (regression rows): classic worker + CJS dual loading, stale-drop,
 * valid frame apply, suspend drop, teardown silence, dual-tree parity.
 *
 * R6 (BLOCK-M21-2-R6 correction, status PENDING-BRIDGE-CONVERGENCE):
 * frame-outcome ↔ generation correlation. EVERY frame-specific reply
 * (success ACK, dropped ACK, CANDLE_ERROR — including descriptor/render
 * throw paths) must carry the exact validated finite-safe-integer
 * `generation` of the INPUT frame that produced it, so the bridge ledger
 * can never mis-retire a different retained generation after eviction:
 *   - success: { type:'CANDLE_ACK', phase:'frame', ok:true, generation }
 *   - drop:    { type:'CANDLE_ACK', phase:'frame', dropped:true,
 *                reason:'stale'|'suspended', generation } — drops are ONLY
 *                emitted with a valid correlated generation.
 *   - error:   { type:'CANDLE_ERROR', phase:'frame', error, generation }
 *   - invalid/missing input generation: the error shape carries the explicit
 *     non-correlatable marker { generation:null, generationInvalid:true } —
 *     the bridge must NEVER use it to retire a posted frame (no oldest-
 *     outstanding fallback), and must never see a bare generation-less
 *     frame reply from this worker again.
 * Generations are never invented, coerced, or replaced by lastApplied /
 * oldest-pending / another frame's value on any branch or exception path.
 * Descriptor validation keeps precedence over the generation gate (browser
 * harness B5 raw-posts generation:0 + bad descriptor and expects the
 * descriptor error), but the reply still carries the invalid-gen marker.
 * INIT/resize/kill/teardown outcomes stay phase-distinguishable from frames.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
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
const WORKER_REL = path.join('workers', 'm21-2-candle-render-worker.js');
const TEST_REL = path.join('modules', 'm21-2-candle-render-worker-edge.test.mjs');
const CANON_CHART = path.join(REPO_ROOT, 'chart v 1.4', 'chart');
const HOME_CHART = path.join(REPO_ROOT, 'homepage', 'public', 'chart');

const require_ = createRequire(import.meta.url);
const workerMod = require_(path.join(CHART_ROOT, WORKER_REL));
const { createCandleWorkerCore, M21_2_WORKER_MSG: MSG } = workerMod;

// ─── Fixtures: fake offscreen with a coarse "painted pixels" model ───────────
// clearRect covering the full backing store ⇒ layer cleared; fillRect/stroke ⇒
// painted. Dimension writes deliberately DO NOT reset `painted` so a cleared
// state across resize can only come from the worker's own repaint-clear
// (worst-case model: driver retains stale pixels unless explicitly cleared).
function makeOffscreen({ ctxNull = false, width = 300, height = 150 } = {}) {
  let w = width;
  let h = height;
  const ctx = {
    ops: [],
    painted: false,
    fullClears: 0,
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    clearRect(x, y, cw, ch) {
      this.ops.push(['clearRect', x, y, cw, ch]);
      if (x === 0 && y === 0 && cw >= w && ch >= h) {
        this.painted = false;
        this.fullClears += 1;
      }
    },
    fillRect() { this.ops.push(['fillRect']); this.painted = true; },
    beginPath() { this.ops.push(['beginPath']); },
    moveTo() { this.ops.push(['moveTo']); },
    lineTo() { this.ops.push(['lineTo']); },
    stroke() { this.ops.push(['stroke']); this.painted = true; },
  };
  const offscreen = {
    get width() { return w; },
    set width(v) { w = v; },
    get height() { return h; },
    set height(v) { h = v; },
    getContext(kind) {
      if (ctxNull) return null;
      return kind === '2d' ? ctx : null;
    },
  };
  return { offscreen, ctx };
}

function makeCore() {
  const outbox = [];
  const core = createCandleWorkerCore({ post: (m) => outbox.push(m) });
  return { core, outbox };
}

function descriptorFor(barCount) {
  const elementCount = barCount * 6;
  return {
    byteOffset: 0,
    byteLength: elementCount * 8,
    elementCount,
    barCount,
    stride: 6,
  };
}

function packBars(n, t0 = 1000) {
  const a = new Float64Array(n * 6);
  for (let i = 0; i < n; i += 1) {
    const o = i * 6;
    a[o] = t0 + i * 60;
    a[o + 1] = 10 + i;
    a[o + 2] = 11 + i;
    a[o + 3] = 9 + i;
    a[o + 4] = 10.5 + i;
    a[o + 5] = 100 + i;
  }
  return a;
}

function initOk(core, offscreen) {
  core.handleMessage({
    type: MSG.INIT,
    canvas: offscreen,
    dpr: 1,
    cssWidth: 300,
    cssHeight: 150,
    deviceWidth: 300,
    deviceHeight: 150,
  });
}

function sendFrame(core, generation, barCount, buffer) {
  const buf = buffer !== undefined ? buffer : packBars(barCount).buffer;
  core.handleMessage({
    type: MSG.FRAME,
    generation,
    descriptor: descriptorFor(barCount),
    buffer: buf,
  });
}

/** Send one message and assert EXACTLY ONE synchronous reply; return it. */
function replyFor(core, outbox, msg) {
  const before = outbox.length;
  core.handleMessage(msg);
  assert.equal(outbox.length, before + 1, `exactly one reply per message (type=${msg.type})`);
  return outbox[before];
}

function frameMsg(generation, barCount, buffer, descriptor) {
  return {
    type: MSG.FRAME,
    generation,
    descriptor: descriptor !== undefined ? descriptor : descriptorFor(barCount),
    buffer: buffer !== undefined ? buffer : packBars(barCount).buffer,
  };
}

/** Assert a reply carries the exact valid input generation (R6 correlation). */
function assertCorrelated(reply, generation, note) {
  assert.equal(reply.generation, generation, `${note}: reply.generation must be the input frame's generation`);
  assert.notEqual(reply.generationInvalid, true, `${note}: valid generation must not be marked invalid`);
}

/** Assert the explicit non-correlatable invalid-generation marker shape. */
function assertInvalidGenMarker(reply, note) {
  assert.ok('generation' in reply, `${note}: marker shape must carry an explicit generation field`);
  assert.equal(reply.generation, null, `${note}: invalid input generation must never be echoed/coerced`);
  assert.equal(reply.generationInvalid, true, `${note}: generationInvalid marker required`);
}

const initAckOkOf = (outbox) => outbox.filter((m) => m.type === MSG.ACK && m.phase === 'init' && m.ok === true);
const initErrorsOf = (outbox) => outbox.filter((m) => m.type === MSG.ERROR && m.phase === 'init');
const frameErrorsOf = (outbox) => outbox.filter((m) => m.type === MSG.ERROR && m.phase === 'frame');

function sha256(p) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
  catch { return null; }
}

// ─── WE1: getContext('2d') → null must fail INIT deterministically ──────────
test('WE1: INIT with null 2d context never ACKs ok:true; deterministic CANDLE_ERROR', () => {
  const { core, outbox } = makeCore();
  const { offscreen } = makeOffscreen({ ctxNull: true });
  initOk(core, offscreen);

  assert.equal(initAckOkOf(outbox).length, 0, 'ctx-null INIT must not ACK ok:true');
  const errs = initErrorsOf(outbox);
  assert.equal(errs.length, 1, 'exactly one deterministic init CANDLE_ERROR');
  assert.equal(errs[0].error, 'init-context-unavailable');
  assert.equal(errs[0].ok, false, 'failed-INIT signal must carry ok:false');
  assert.notEqual(core.state.active, true, 'worker must remain non-active');
  assert.equal(core.state.initFailed, true);
  assert.equal(core.state.ctx, null, 'no retained context');
  assert.equal(core.state.canvas, null, 'no retained canvas');
});

test('WE1: INIT with no canvas fails deterministically (init-canvas-missing)', () => {
  const { core, outbox } = makeCore();
  core.handleMessage({ type: MSG.INIT, dpr: 1, cssWidth: 300, cssHeight: 150 });
  assert.equal(initAckOkOf(outbox).length, 0);
  const errs = initErrorsOf(outbox);
  assert.equal(errs.length, 1);
  assert.equal(errs[0].error, 'init-canvas-missing');
  assert.notEqual(core.state.active, true);
});

test('WE1: after failed INIT the worker never accepts or paints frames', () => {
  const { core, outbox } = makeCore();
  const { offscreen, ctx } = makeOffscreen({ ctxNull: true });
  initOk(core, offscreen);

  sendFrame(core, 1, 3);
  sendFrame(core, 2, 3);

  const errs = frameErrorsOf(outbox);
  assert.equal(errs.length, 2, 'each frame post-failed-INIT gets a CANDLE_ERROR');
  for (const e of errs) assert.equal(e.error, 'worker-not-active');
  assert.equal(core.state.framesApplied, 0, 'no frame applied');
  assert.equal(core.state.lastAppliedGeneration, 0, 'lastApplied never advances');
  assert.equal(core.state.paints, 0, 'nothing painted');
  assert.equal(ctx.painted, false, 'no pixels touched');
  assert.ok(!outbox.some((m) => m.type === MSG.ACK && m.phase === 'frame'),
    'no frame ACK of any kind after failed INIT');

  const r = core.handleMessage({
    type: MSG.RESIZE, dpr: 2, cssWidth: 600, cssHeight: 300, deviceWidth: 1200, deviceHeight: 600,
  });
  void r;
  const resizeErrs = outbox.filter((m) => m.type === MSG.ERROR && m.phase === 'resize');
  assert.equal(resizeErrs.length, 1, 'resize on non-active worker rejected');
  assert.equal(resizeErrs[0].error, 'worker-not-active');
});

test('WE1: frames before any INIT are rejected as worker-not-active', () => {
  const { core, outbox } = makeCore();
  sendFrame(core, 1, 2);
  const errs = frameErrorsOf(outbox);
  assert.equal(errs.length, 1);
  assert.equal(errs[0].error, 'worker-not-active');
  assert.equal(core.state.lastAppliedGeneration, 0);
  assert.equal(core.state.framesApplied, 0);
});

// ─── WE2: explicit empty frame clears layer and stays cleared across resize ─
test('WE2: nonempty → empty → resize; layer cleared, no stale pixels', () => {
  const { core, outbox } = makeCore();
  const { offscreen, ctx } = makeOffscreen();
  initOk(core, offscreen);
  assert.equal(initAckOkOf(outbox).length, 1, 'healthy INIT still ACKs ok:true');

  // Nonempty frame paints.
  sendFrame(core, 1, 3);
  assert.equal(core.state.lastAppliedGeneration, 1);
  assert.equal(ctx.painted, true, 'nonempty frame paints pixels');

  // Explicit empty frame: barCount=0, elementCount=0, zero-length sibling buffer.
  sendFrame(core, 2, 0, new ArrayBuffer(0));
  const ack = outbox.find((m) => m.type === MSG.ACK && m.phase === 'frame' && m.generation === 2);
  assert.ok(ack, 'empty frame must ACK');
  assert.equal(ack.ok, true, 'legitimate empty frame is a success, not an error');
  assert.equal(ack.cleared, true, 'ACK marks the clear');
  assert.equal(ack.barCount, 0);
  assert.equal(ctx.painted, false, 'entire candle layer cleared — no stale pixels');
  assert.ok(ctx.fullClears >= 1, 'full-surface clearRect performed');
  assert.equal(core.state.lastAppliedGeneration, 2, 'generation advances on empty frame');
  assert.equal(core.state.framesApplied, 2, 'empty frame counts as applied');
  assert.ok(core.state.lastFrame && core.state.lastFrame.descriptor.barCount === 0,
    'retained state replaced by the empty frame');

  // Resize repaints the RETAINED (empty) frame: must re-clear, never repaint bars.
  const fillsBefore = ctx.ops.filter((op) => op[0] === 'fillRect').length;
  core.handleMessage({
    type: MSG.RESIZE, dpr: 2, cssWidth: 400, cssHeight: 200, deviceWidth: 800, deviceHeight: 400,
  });
  const resizeAck = outbox.find((m) => m.type === MSG.ACK && m.phase === 'resize' && m.ok === true);
  assert.ok(resizeAck, 'resize still ACKs');
  assert.equal(ctx.painted, false, 'stays cleared across resize');
  const fillsAfter = ctx.ops.filter((op) => op[0] === 'fillRect').length;
  assert.equal(fillsAfter, fillsBefore, 'no candle bodies repainted from stale state');
});

test('WE2: empty frame respects stale-drop (generation still monotonic)', () => {
  const { core, outbox } = makeCore();
  const { offscreen } = makeOffscreen();
  initOk(core, offscreen);
  sendFrame(core, 5, 2);
  sendFrame(core, 5, 0, new ArrayBuffer(0)); // stale empty — dropped, not applied
  const drop = outbox.find((m) => m.type === MSG.ACK && m.phase === 'frame' && m.dropped === true);
  assert.ok(drop && drop.reason === 'stale');
  assert.equal(core.state.lastAppliedGeneration, 5);
  assert.equal(core.state.framesApplied, 1);
});

// ─── WE3: generation hygiene — finite safe monotonic integer ────────────────
test('WE3: non-finite/unsafe/fractional/negative generations rejected; no poisoning', () => {
  const { core, outbox } = makeCore();
  const { offscreen } = makeOffscreen();
  initOk(core, offscreen);

  sendFrame(core, 1, 2);
  assert.equal(core.state.lastAppliedGeneration, 1);

  const badGenerations = [
    Infinity, -Infinity, Number.NaN, 1.5,
    Number.MAX_SAFE_INTEGER + 1, -1, 0, '7', null, undefined,
  ];
  const staleBefore = core.state.staleDropped;
  for (const g of badGenerations) {
    sendFrame(core, g, 2);
  }
  const errs = frameErrorsOf(outbox).filter((m) => m.error === 'frame-generation-invalid');
  assert.equal(errs.length, badGenerations.length,
    'every invalid generation gets deterministic frame-generation-invalid');
  assert.equal(core.state.lastAppliedGeneration, 1,
    'invalid generation must never advance lastApplied');
  assert.equal(core.state.framesApplied, 1, 'invalid generations never apply');
  assert.equal(core.state.staleDropped, staleBefore,
    'invalid generation is an ERROR, not a stale drop');

  // One bad frame (e.g. Infinity) must not poison later finite frames.
  sendFrame(core, 2, 2);
  assert.equal(core.state.lastAppliedGeneration, 2, 'later finite frame still applies');
  assert.equal(core.state.framesApplied, 2);
});

test('WE3: valid stale/out-of-order drop behavior preserved', () => {
  const { core, outbox } = makeCore();
  const { offscreen } = makeOffscreen();
  initOk(core, offscreen);
  sendFrame(core, 5, 2);
  sendFrame(core, 3, 2);
  sendFrame(core, 5, 2);
  assert.equal(core.state.framesApplied, 1);
  assert.equal(core.state.staleDropped, 2);
  assert.equal(core.state.lastAppliedGeneration, 5);
  const drops = outbox.filter((m) => m.type === MSG.ACK && m.phase === 'frame' && m.dropped === true);
  assert.equal(drops.length, 2);
  for (const d of drops) assert.equal(d.reason, 'stale');
});

// ─── WE4: malformed descriptor/frame never advances or retains ──────────────
test('WE4: malformed descriptor errors keep lastApplied and retained frame intact', () => {
  const { core, outbox } = makeCore();
  const { offscreen, ctx } = makeOffscreen();
  initOk(core, offscreen);

  sendFrame(core, 1, 3);
  const goodFrame = core.state.lastFrame;
  assert.equal(core.state.lastAppliedGeneration, 1);

  // Malformed descriptor: nonzero byteOffset.
  const badDesc = { ...descriptorFor(3), byteOffset: 8 };
  core.handleMessage({
    type: MSG.FRAME, generation: 2, descriptor: badDesc, buffer: packBars(3).buffer,
  });
  assert.ok(outbox.some((m) => m.type === MSG.ERROR
    && String(m.error).includes('descriptor-byteOffset-nonzero')),
  'descriptor validator error surfaces as CANDLE_ERROR');

  // Descriptor larger than the sibling buffer capacity.
  core.handleMessage({
    type: MSG.FRAME, generation: 2, descriptor: descriptorFor(4), buffer: packBars(3).buffer,
  });
  assert.ok(outbox.some((m) => m.type === MSG.ERROR
    && String(m.error).includes('descriptor-exceeds-capacity')));

  // Missing sibling buffer.
  core.handleMessage({ type: MSG.FRAME, generation: 2, descriptor: descriptorFor(3) });
  assert.ok(frameErrorsOf(outbox).some((m) => m.error === 'frame-buffer-missing'),
    'missing buffer gets deterministic frame-buffer-missing');

  assert.equal(core.state.lastAppliedGeneration, 1, 'no malformed frame advanced lastApplied');
  assert.equal(core.state.framesApplied, 1);
  assert.equal(core.state.lastFrame, goodFrame, 'retained frame not replaced by invalid data');

  // Resize repaints the LAST VALID frame (bars still painted, not poisoned).
  core.handleMessage({
    type: MSG.RESIZE, dpr: 1, cssWidth: 400, cssHeight: 200, deviceWidth: 400, deviceHeight: 200,
  });
  assert.equal(ctx.painted, true, 'retained valid frame repainted after resize');

  // Recovery: next valid frame applies.
  sendFrame(core, 2, 3);
  assert.equal(core.state.lastAppliedGeneration, 2);
});

// ─── Preservation rows: dual loading, suspend, teardown, parity ─────────────
test('PRESERVE: classic worker + CJS dual loading and no blob bootstrap', () => {
  const src = fs.readFileSync(path.join(CHART_ROOT, WORKER_REL), 'utf8');
  assert.ok(src.length > 0);
  assert.ok(!/^\s*import\s/m.test(src), 'no top-level module import');
  assert.ok(!/^\s*export\s/m.test(src), 'no top-level module export');
  assert.ok(src.includes('self.onmessage'), 'classic worker entrypoint');
  assert.ok(src.includes('module.exports'), 'CJS export guard');
  assert.ok(!src.includes('blob:'), 'no blob bootstrap');
  assert.equal(typeof workerMod.createCandleWorkerCore, 'function');
  assert.equal(typeof workerMod.validateFrameDescriptorWorker, 'function');
});

test('PRESERVE: valid frames, suspend drop and teardown silence unchanged', () => {
  const { core, outbox } = makeCore();
  const { offscreen, ctx } = makeOffscreen();
  initOk(core, offscreen);

  sendFrame(core, 1, 4);
  const ok = outbox.find((m) => m.type === MSG.ACK && m.phase === 'frame' && m.ok === true);
  assert.ok(ok && ok.generation === 1, 'valid frame still ACKs ok:true with generation');
  assert.equal(ctx.painted, true);

  core.handleMessage({ type: MSG.KILL_SUSPEND });
  sendFrame(core, 2, 4);
  const suspended = outbox.find((m) => m.type === MSG.ACK && m.phase === 'frame'
    && m.dropped === true && m.reason === 'suspended');
  assert.ok(suspended, 'suspended frames still ACK dropped:suspended');
  assert.equal(core.state.lastAppliedGeneration, 1);

  core.handleMessage({ type: MSG.TEARDOWN });
  const posts = outbox.length;
  sendFrame(core, 3, 4);
  assert.equal(outbox.length, posts, 'torn-down worker stays silent on frames');
  assert.equal(core.state.tornDown, true);
});

// ─── R6: frame-outcome ↔ generation correlation (BLOCK-M21-2-R6) ────────────
test('R6: success, stale drop and frame errors carry the exact input generation', () => {
  const { core, outbox } = makeCore();
  const { offscreen } = makeOffscreen();
  initOk(core, offscreen);

  const ok7 = replyFor(core, outbox, frameMsg(7, 3));
  assert.equal(ok7.type, MSG.ACK);
  assert.equal(ok7.ok, true);
  assertCorrelated(ok7, 7, 'valid success');

  const stale7 = replyFor(core, outbox, frameMsg(7, 3));
  assert.equal(stale7.dropped, true);
  assert.equal(stale7.reason, 'stale');
  assertCorrelated(stale7, 7, 'stale drop');

  const noBuf9 = replyFor(core, outbox, frameMsg(9, 3, null));
  assert.equal(noBuf9.type, MSG.ERROR);
  assert.equal(noBuf9.phase, 'frame');
  assert.equal(noBuf9.error, 'frame-buffer-missing');
  assertCorrelated(noBuf9, 9, 'buffer-missing error');

  const badDesc11 = replyFor(core, outbox,
    frameMsg(11, 3, packBars(3).buffer, { ...descriptorFor(3), stride: 7 }));
  assert.equal(badDesc11.type, MSG.ERROR);
  assert.equal(badDesc11.phase, 'frame', 'descriptor throw path must stay a FRAME outcome');
  assert.ok(String(badDesc11.error).includes('descriptor-stride-mismatch'));
  assertCorrelated(badDesc11, 11, 'descriptor-throw error');

  assert.equal(core.state.lastAppliedGeneration, 7, 'only the valid success advanced state');
});

test('R6: suspended drop carries the dropped frame generation (never generation-less)', () => {
  const { core, outbox } = makeCore();
  const { offscreen } = makeOffscreen();
  initOk(core, offscreen);
  replyFor(core, outbox, frameMsg(1, 2));
  replyFor(core, outbox, { type: MSG.KILL_SUSPEND });

  const drop5 = replyFor(core, outbox, frameMsg(5, 2));
  assert.equal(drop5.type, MSG.ACK);
  assert.equal(drop5.dropped, true);
  assert.equal(drop5.reason, 'suspended');
  assertCorrelated(drop5, 5, 'suspended drop');

  // Invalid generation while suspended: NEVER a drop reply (a non-correlatable
  // drop could retire the wrong ledger entry) — explicit error marker instead.
  const badGen = replyFor(core, outbox, frameMsg(Infinity, 2));
  assert.equal(badGen.type, MSG.ERROR);
  assert.equal(badGen.phase, 'frame');
  assert.equal(badGen.error, 'frame-generation-invalid');
  assertInvalidGenMarker(badGen, 'suspended invalid-generation');
  assert.equal(core.state.suspendedDropped, 1, 'invalid-gen frame is not a suspended drop');
});

test('R6: worker-not-active errors are correlated (valid gen) or explicitly marked (invalid gen)', () => {
  const { core, outbox } = makeCore();
  const notActive3 = replyFor(core, outbox, frameMsg(3, 2));
  assert.equal(notActive3.error, 'worker-not-active');
  assert.equal(notActive3.phase, 'frame');
  assertCorrelated(notActive3, 3, 'not-active with valid generation');

  const notActiveBad = replyFor(core, outbox, frameMsg(1.5, 2));
  assert.equal(notActiveBad.error, 'worker-not-active');
  assertInvalidGenMarker(notActiveBad, 'not-active with invalid generation');
});

test('R6: render throw carries the throwing frame generation; retained state intact', () => {
  const { core, outbox } = makeCore();
  const { offscreen, ctx } = makeOffscreen();
  initOk(core, offscreen);
  replyFor(core, outbox, frameMsg(1, 3));
  const retained = core.state.lastFrame;

  const realFillRect = ctx.fillRect.bind(ctx);
  ctx.fillRect = () => { throw new Error('simulated-render-context-failure'); };
  const boom = replyFor(core, outbox, frameMsg(2, 3));
  ctx.fillRect = realFillRect;

  assert.equal(boom.type, MSG.ERROR);
  assert.equal(boom.phase, 'frame', 'render throw is a FRAME outcome, not a generic one');
  assert.ok(String(boom.error).includes('simulated-render-context-failure'));
  assertCorrelated(boom, 2, 'render-throw error');
  assert.equal(core.state.lastAppliedGeneration, 1, 'render throw never advances lastApplied');
  assert.equal(core.state.lastFrame, retained, 'render throw never replaces the retained frame');

  const ok3 = replyFor(core, outbox, frameMsg(3, 3));
  assert.equal(ok3.ok, true);
  assertCorrelated(ok3, 3, 'recovery frame after render throw');
});

test('R6: invalid-generation protocol shape is explicit and never correlatable', () => {
  const { core, outbox } = makeCore();
  const { offscreen } = makeOffscreen();
  initOk(core, offscreen);
  replyFor(core, outbox, frameMsg(1, 2));

  for (const g of [Infinity, Number.NaN, 2.5, Number.MAX_SAFE_INTEGER + 1, -3, 0, '42', null, undefined]) {
    const r = replyFor(core, outbox, frameMsg(g, 2));
    assert.equal(r.type, MSG.ERROR);
    assert.equal(r.phase, 'frame');
    assert.equal(r.error, 'frame-generation-invalid');
    assertInvalidGenMarker(r, `invalid generation ${String(g)}`);
    assert.ok(!('ok' in r) && !('dropped' in r), 'invalid-gen shape is neither success nor drop');
  }
  assert.equal(core.state.lastAppliedGeneration, 1);

  // B5 compatibility: malformed descriptor + invalid generation (raw post shape
  // generation:0) still reports the DESCRIPTOR error — with the marker attached.
  const b5 = replyFor(core, outbox, {
    type: MSG.FRAME,
    generation: 0,
    descriptor: { byteOffset: 8, byteLength: 96, elementCount: 12, barCount: 2, stride: 6 },
    buffer: new ArrayBuffer(104),
  });
  assert.equal(b5.type, MSG.ERROR);
  assert.ok(String(b5.error).includes('descriptor-byteOffset-nonzero'),
    'descriptor validation keeps precedence over the generation gate');
  assertInvalidGenMarker(b5, 'descriptor error with invalid input generation');

  // Empty-frame outcome is correlated too.
  const empty = replyFor(core, outbox, frameMsg(2, 0, new ArrayBuffer(0)));
  assert.equal(empty.ok, true);
  assert.equal(empty.cleared, true);
  assertCorrelated(empty, 2, 'empty-frame success');
});

test('R6: 600-frame eviction-style sequence — zero mis-correlation, success exactly once', () => {
  const { core, outbox } = makeCore();
  const { offscreen } = makeOffscreen();
  initOk(core, offscreen);

  const okGenerations = [];
  for (let g = 1; g <= 600; g += 1) {
    if (g % 7 === 0) {
      // Malformed descriptor for THIS generation — must be attributed to g.
      const bad = replyFor(core, outbox,
        frameMsg(g, 2, packBars(2).buffer, { ...descriptorFor(2), byteLength: 95 }));
      assert.equal(bad.type, MSG.ERROR);
      assertCorrelated(bad, g, `malformed descriptor @${g}`);
      continue; // g intentionally never applied
    }
    const ok = replyFor(core, outbox, frameMsg(g, 2));
    assert.equal(ok.ok, true, `apply @${g}`);
    assertCorrelated(ok, g, `success @${g}`);
    okGenerations.push(ok.generation);

    if (g % 89 === 0) {
      // Late replay of generation 1 among hundreds outstanding-style outcomes:
      // its drop must say generation 1 — NEVER g (e.g. 89) or lastApplied.
      const lateStale = replyFor(core, outbox, frameMsg(1, 2));
      assert.equal(lateStale.dropped, true);
      assert.equal(lateStale.reason, 'stale');
      assertCorrelated(lateStale, 1, `late replay of gen 1 @${g}`);
      assert.notEqual(lateStale.generation, 89, 'gen-1 outcome must never be mistaken for gen 89');
      const lateNoBuf = replyFor(core, outbox, frameMsg(1, 2, null));
      assert.equal(lateNoBuf.error, 'frame-buffer-missing');
      assertCorrelated(lateNoBuf, 1, `late buffer-missing replay of gen 1 @${g}`);
    }
  }

  const applied = okGenerations.length;
  assert.equal(applied, 600 - Math.floor(600 / 7), 'all non-malformed generations applied');
  assert.equal(new Set(okGenerations).size, applied, 'each success reported exactly once');
  assert.equal(core.state.framesApplied, applied);
  assert.equal(core.state.lastAppliedGeneration, 600);
  // Every frame reply in the whole run carried an explicit correlation field.
  for (const m of outbox) {
    if (m.phase !== 'frame') continue;
    assert.ok('generation' in m, 'no generation-less frame reply may exist');
  }
});

test('R6: reordered/out-of-order outcomes correlate to their own frames only', () => {
  const { core, outbox } = makeCore();
  const { offscreen } = makeOffscreen();
  initOk(core, offscreen);

  const script = [
    [5, 'ok'], [3, 'stale'], [9, 'ok'], [2, 'stale'], [14, 'ok'], [9, 'stale'],
  ];
  const got = [];
  for (const [g] of script) {
    const r = replyFor(core, outbox, frameMsg(g, 2));
    got.push([r.generation, r.ok === true ? 'ok' : (r.dropped === true ? r.reason : 'error')]);
  }
  assert.deepEqual(got, script, 'each reply carries its OWN input generation and outcome');
  assert.equal(core.state.lastAppliedGeneration, 14);
  assert.equal(core.state.framesApplied, 3);
});

test('R6: control outcomes stay distinguishable from frame outcomes', () => {
  const { core, outbox } = makeCore();
  const { offscreen } = makeOffscreen();
  initOk(core, offscreen);
  replyFor(core, outbox, {
    type: MSG.RESIZE, dpr: 1, cssWidth: 10, cssHeight: 10, deviceWidth: 10, deviceHeight: 10,
  });
  replyFor(core, outbox, { type: MSG.KILL_SUSPEND });
  core.handleMessage({ type: MSG.TEARDOWN });

  const framePhases = new Set(['frame']);
  for (const m of outbox) {
    if (framePhases.has(m.phase)) continue;
    assert.ok(['init', 'resize', 'kill-suspend', 'teardown'].includes(m.phase),
      `control reply phase '${m.phase}' must be a control phase`);
  }
  // Control replies never carry frame correlation fields the bridge could
  // route into frame accounting.
  for (const m of outbox) {
    if (m.phase === 'frame') continue;
    assert.ok(!('generation' in m), `control reply (${m.phase}) must not carry generation`);
  }
});

test('PRESERVE: dual-tree parity for worker and this edge test (byte-identical)', () => {
  for (const rel of [WORKER_REL, TEST_REL]) {
    const canon = sha256(path.join(CANON_CHART, rel));
    const home = sha256(path.join(HOME_CHART, rel));
    assert.ok(canon != null, `${rel} missing in canon tree`);
    assert.equal(canon, home, `${rel} mirrors must be byte-identical`);
  }
});
