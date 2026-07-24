/**
 * M21-2 — candle-layer OffscreenCanvas bridge (main-thread side, W3-owned).
 *
 * Status: FABLE-SIGNED module-level scaffold — NOT wired into product runtime.
 * chart.js / HTML bootstrap / CSP / multichart-manager wiring is LOCKED until
 * the Manager commits M21-1; the exact wiring hunks are prose-only in
 * docs/plan3/worker-reports/W3-M21-2-CANDLE-OFFSCREEN-SCAFFOLD-20260724.md.
 *
 * Authoritative contract: modules/M21-2-CANDLE-OFFSCREEN-API.md
 * Gate: modules/m21-2-candle-offscreen-scaffold.test.mjs
 *
 * Binding design decisions (W3 rulings over W6 provisional assumptions):
 *   D1 kill-switch name ACCEPTED: __TALARIA_DISABLE_M21_2_CANDLE_OFFSCREEN_V1,
 *      consulted BEFORE the first transferControlToOffscreen (one-shot).
 *   D2 post-transfer kill flip DEFINED: transfer cannot be undone — policy is
 *      suspend (stop frames, CANDLE_KILL_SUSPEND); full rollback = page reload.
 *   D3 ownership DEFINED: phase-1, ONLY the host document owns the single
 *      render worker and transfers ONLY its own candle canvas; multichart embed
 *      iframes keep legacy main-thread paint until M21-3 (host+(N−1)-iframe
 *      reality resolved; C8 workerCount=1 / canvasTransfers=1 for 1/2/4 views).
 *   D4 descriptor ACCEPTED from W6 (byteOffset=0, byteLength=elementCount*8,
 *      elementCount=barCount*stride, stride=6 Float64) — but MODIFIED shape:
 *      the descriptor carries geometry ONLY; the ArrayBuffer travels as a
 *      sibling payload field (adapter descriptorFromMirrorDetach() consumes
 *      W6 mirror/pool detachForTransfer() output unchanged).
 *   D5 worker construct happens BEFORE canvas transfer, so a construct failure
 *      falls back to legacy main-thread paint with the canvas untouched (F2).
 *      An INIT postMessage failure AFTER transfer is fatal-degraded: worker is
 *      terminated, onFatalWorkerLoss fires; documented recovery at wiring time
 *      is canvas ELEMENT replacement + legacy repaint.
 *   R1 (correction, consumes W6 m21-2-r1-worker-leak-red-gate + harness B1b):
 *      a callable canvas.transferControlToOffscreen is feature-detected BEFORE
 *      worker construct — unsupported ⇒ {ok:false, reason:'transfer-unsupported'}
 *      with zero workers/transfers/registry state. The actual transfer call is
 *      try/caught: a throw terminates the constructed worker exactly once and
 *      returns {ok:false, reason:'transfer-failed'} (canvas intact per spec —
 *      throws precede transfer), or 'transfer-failed-canvas-lost' + fatal-loss
 *      policy if the browser detached the canvas before throwing. Repeated
 *      unsupported/throwing attempts stay live-worker flat; destroy() cannot
 *      leave orphans.
 *   R5 (correction, independent-review bridge findings 1–5):
 *      - worker.onmessage is installed BEFORE CANDLE_INIT posts; the bridge
 *        consumes INIT/frame/resize/kill/teardown ACKs and CANDLE_ERROR.
 *        Applied stats are ACK-driven: only {phase:'frame', ok:true} counts
 *        framesApplied/lastAppliedGeneration — a worker rejection or error is
 *        NEVER counted as a successful apply.
 *      - Fatal worker-error classification (m212IsFatalWorkerError): worker
 *        onerror, onmessageerror, INIT-phase CANDLE_ERROR, 'worker-not-active',
 *        and any post-transfer postMessage throw enter ONE idempotent fatal
 *        'degraded-canvas-lost' state: terminate exactly once, release the
 *        ownership registry, refuse all later frames/resizes, surface
 *        onFatalWorkerLoss exactly once. A transferred canvas is NEVER silently
 *        main-thread painted. Frame/resize validation rejections are
 *        recoverable: surfaced via onWorkerError, never fatal, never applied.
 *        Event-delivered fatality (onerror/onmessageerror/CANDLE_ERROR) applies
 *        on the injected scheduler tick — mirroring real async event delivery;
 *        postMessage throws are synchronous fatality.
 *      - Buffer ownership state machine: caller-owned → pending → posted
 *        (detached; terminal) | reclaimable → drained (back to caller).
 *        Duplicate submit of a pending buffer throws 'buffer-already-pending';
 *        resubmit of a queued-reclaimable buffer throws 'buffer-awaiting-reclaim';
 *        transferred/detached buffers throw 'detached-buffer-reuse' (identity
 *        via WeakSet + ArrayBuffer.prototype.detached). Pending frames cancelled
 *        by kill/fatal/destroy never post and drain reclaimable EXACTLY once;
 *        the flush microtask re-checks machine state before posting; posted or
 *        detached buffers are never reclaimed or retried.
 *      - Descriptor fields are snapshotted (clone+freeze) at submit — caller
 *        mutation after submit cannot alter the validated payload.
 *      - Explicit empty frame: a NEW zero-length buffer with barCount=0 is a
 *        legitimate frame (worker clears the layer and retains the empty
 *        descriptor across resize); identity tracking still rejects previously
 *        transferred buffers of any length.
 *      - Generation hygiene bridge-side matches the worker contract
 *        (m212ValidateGeneration): finite safe integer >= 1 only.
 *   R6 (correction, fresh-GPT BLOCK-M21-2-SCAFFOLD-CORRECTION):
 *      - ACK correlation / exactly-once accounting: the bridge keeps an
 *        outstanding-posted frame ledger (generation → posted, bounded at
 *        M21_2_ACK_LEDGER_MAX with counted oldest-eviction). A frame success
 *        ACK is consumed EXACTLY once and only if its generation is a finite
 *        safe integer, is in the ledger, and is strictly newer than
 *        lastAppliedGeneration. Duplicate/invalid/unposted/already-consumed/
 *        stale successes never change framesApplied, lastAppliedGeneration,
 *        layerCleared, retained descriptor, or paint state — they count as
 *        rejectedAcks/lastAckAnomaly observability and are never fatal.
 *        Correlated frame CANDLE_ERROR/drop retires that outstanding
 *        generation without applying it; late success stays rejected. Fatal
 *        and destroy drain/terminalize the ledger; control ACKs
 *        (init/resize/kill/teardown) can never touch frame accounting.
 *      - Partial-transfer canvas loss enters the ONE fatal machine
 *        (enterFatal): handlers/closure state are arranged BEFORE the
 *        transfer attempt, the constructed worker terminates exactly once,
 *        registry/pending/ledger drain, the fatal reason persists
 *        (stats.fatalReason) and every later transfer/submit/resize is
 *        refused as 'degraded-canvas-lost' with that same permanent
 *        fatalReason; a retried transferCanvas() constructs ZERO additional
 *        workers. Never claim legacy/main-thread recovery after canvas loss.
 *   R7 (correction, independent review BLOCK-M21-2-R6; worker-protocol
 *      convergence pending):
 *      - Successful-post admission: a generation becomes ACK-eligible only
 *        AFTER its FRAME postMessage returns successfully. An exact-generation
 *        frame reply delivered synchronously/reentrantly DURING the post is
 *        staged: consumed after successful return, discarded if the post
 *        throws — never accepted early, never lost. A frame-post throw leaves
 *        framesPosted=0 deltas, no apply/clear side effect, no ledger entry,
 *        and enters the fatal machine.
 *      - EXACT frame-outcome correlation, fail-closed: frame ACK/error/drop
 *        resolves an outstanding generation only on a finite safe-integer
 *        generation exactly matching a committed ledger entry (cooperates
 *        with the concurrent worker-protocol exact-generation
 *        CANDLE_ERROR/CANDLE_DROPPED replies; forward-compat CANDLE_DROPPED
 *        accepted). Generation-less/unknown frame outcomes never retire
 *        another generation — rejected observability only; uncorrelated
 *        entries age out at the ledger bound so progress is never blocked.
 *      - Permanent canvas-loss fatality precedence: fatal is terminal and
 *        idempotent for the bridge lifetime. Kill-switch toggles
 *        (applyKillSwitchPolicy → {mode:'fatal-degraded', fatalReason}),
 *        invalid payloads, enqueue/resize/flush/transfer/teardown can never
 *        relabel it (destroy() keeps the 'degraded-canvas-lost' state label);
 *        every later API result exposes the original persisted fatalReason.
 */

export const M21_2_KILL_SWITCH = '__TALARIA_DISABLE_M21_2_CANDLE_OFFSCREEN_V1';
export const M21_2_WORKER_URL = '/chart/workers/m21-2-candle-render-worker.js';
export const M21_2_FRAME_STRIDE = 6;
export const M21_2_BYTES_PER_ELEMENT = 8; // Float64

/** Message types — drift-gated against workers/m21-2-candle-render-worker.js. */
export const M21_2_MSG = {
  INIT: 'CANDLE_INIT',
  FRAME: 'CANDLE_FRAME',
  RESIZE: 'CANDLE_RESIZE',
  TEARDOWN: 'CANDLE_TEARDOWN',
  KILL_SUSPEND: 'CANDLE_KILL_SUSPEND',
  ACK: 'CANDLE_ACK',
  ERROR: 'CANDLE_ERROR',
};

export function m212CandleOffscreenFixEnabled(win = (typeof window !== 'undefined' ? window : undefined)) {
  return !win || win[M21_2_KILL_SWITCH] !== true;
}

/** Canonical frame descriptor for a head-packed [t,o,h,l,c,v]×barCount window. */
export function buildFrameDescriptor({ barCount, stride = M21_2_FRAME_STRIDE } = {}) {
  const elementCount = barCount * stride;
  return {
    byteOffset: 0,
    byteLength: elementCount * M21_2_BYTES_PER_ELEMENT,
    elementCount,
    barCount,
    stride,
  };
}

/**
 * Rule-identical with validateFrameDescriptorWorker (worker file); the scaffold
 * gate feeds both validators the same malformed vectors and fails on drift.
 */
export function validateFrameDescriptor(desc, capacityByteLength) {
  if (!desc || typeof desc !== 'object') throw new Error('descriptor-missing');
  if (desc.byteOffset !== 0) throw new Error('descriptor-byteOffset-nonzero');
  if (desc.stride !== M21_2_FRAME_STRIDE) throw new Error('descriptor-stride-mismatch');
  if (!Number.isInteger(desc.barCount) || desc.barCount < 0) throw new Error('descriptor-barCount-invalid');
  if (!Number.isInteger(desc.elementCount) || desc.elementCount < 0) throw new Error('descriptor-elementCount-invalid');
  if (!Number.isInteger(desc.byteLength) || desc.byteLength < 0) throw new Error('descriptor-byteLength-invalid');
  if (desc.elementCount !== desc.barCount * desc.stride) throw new Error('descriptor-elementCount-mismatch');
  if (desc.byteLength !== desc.elementCount * M21_2_BYTES_PER_ELEMENT) throw new Error('descriptor-byteLength-mismatch');
  if (capacityByteLength != null && desc.byteLength > capacityByteLength) throw new Error('descriptor-exceeds-capacity');
}

/**
 * R5 — generation hygiene, rule-identical with the worker contract:
 * finite safe integer >= 1 (no Infinity/NaN/fraction/unsafe/negative/zero).
 */
export function m212ValidateGeneration(gen) {
  return Number.isSafeInteger(gen) && gen >= 1;
}

/**
 * R6 — outstanding-posted frame ledger bound. A worker that never ACKs must
 * not grow the ledger without bound: past this many outstanding generations
 * the oldest entry is evicted (counted in stats.ledgerEvictions). An evicted
 * generation's late ACK is then rejected as unposted — observable, never
 * state-mutating.
 */
export const M21_2_ACK_LEDGER_MAX = 512;

/**
 * R5 — fatal worker-error classification. Fatal = the transferred canvas can
 * never be painted by this worker again:
 *   - CANDLE_ERROR phase 'init' (init-canvas-missing / init-context-unavailable)
 *   - CANDLE_ERROR 'worker-not-active' (canvas held by a non-active worker)
 * Recoverable (surfaced via onWorkerError, never fatal, never counted applied):
 * per-frame/resize validation rejections — the next valid frame still paints.
 */
export function m212IsFatalWorkerError(msg) {
  if (!msg || msg.type !== M21_2_MSG.ERROR) return false;
  if (msg.phase === 'init') return true;
  if (msg.error === 'worker-not-active') return true;
  return false;
}

/**
 * Bounded reconstruct — NEVER `new Float64Array(buffer)` bare: capacity-backed
 * buffers over-read into NaN-poisoned spare capacity (W6 compat-audit hazard).
 */
export function viewFromFrameDescriptor(buffer, desc) {
  validateFrameDescriptor(desc, buffer.byteLength);
  return new Float64Array(buffer, desc.byteOffset, desc.elementCount);
}

/**
 * Adapter for W6 mirror/pool detachForTransfer() output (accepted unchanged;
 * see D4). Returns the W3 authoritative frame payload shape.
 */
export function descriptorFromMirrorDetach(det) {
  if (!det || !det.buffer) throw new Error('mirror-detach-missing-buffer');
  const descriptor = {
    byteOffset: det.byteOffset,
    byteLength: det.byteLength,
    elementCount: det.elementCount,
    barCount: det.barCount,
    stride: det.stride,
  };
  validateFrameDescriptor(descriptor, det.buffer.byteLength);
  return { buffer: det.buffer, descriptor, transferList: [det.buffer] };
}

/**
 * D3 — host+(N−1)-iframe ownership. Phase-1: only the host document may own
 * the candle render worker; embed iframes stay on legacy main-thread paint.
 * At wiring time env is derived from document.documentElement.classList
 * 'multichart-embed' / window.parent.__multichartGrid (prose hunks in report).
 */
export function resolveCandleWorkerOwnership(env = {}) {
  const isEmbed = !!env.isMultichartEmbedPanel || !!env.parentHasMultichartGrid;
  return {
    role: isEmbed ? 'embed' : 'host',
    shouldOwnWorker: !isEmbed,
  };
}

/** Module-level default registry: one candle render worker per document. */
const DEFAULT_OWNERSHIP_REGISTRY = { owner: null };

/**
 * Main-thread bridge. All environment surfaces are injectable so the scaffold
 * gate runs headless in Node; wiring passes real canvas/Worker/window.
 *
 * opts:
 *   canvas             HTMLCanvasElement-like (transferControlToOffscreen)
 *   workerFactory(url) → Worker-like { postMessage, terminate, onerror }
 *   windowRef          kill-switch host (default: window)
 *   env                ownership env (see resolveCandleWorkerOwnership)
 *   ownershipRegistry  { owner } (default: module singleton)
 *   scheduler(cb)      frame flush scheduler (default: queueMicrotask)
 *   cssWidth/cssHeight/dpr   initial geometry for CANDLE_INIT
 *   onWorkerError(e) / onFatalWorkerLoss(info)
 */
export function createCandleRenderWorkerBridge(opts = {}) {
  const canvas = opts.canvas;
  const windowRef = 'windowRef' in opts ? opts.windowRef : (typeof window !== 'undefined' ? window : undefined);
  const registry = opts.ownershipRegistry || DEFAULT_OWNERSHIP_REGISTRY;
  const scheduler = opts.scheduler || ((cb) => queueMicrotask(cb));
  const workerFactory = opts.workerFactory
    || ((url) => new Worker(url)); // same-origin classic — never blob (H3)
  const workerUrl = opts.workerUrl || M21_2_WORKER_URL;
  const ownership = resolveCandleWorkerOwnership(opts.env || {});
  const onWorkerError = opts.onWorkerError || (() => {});
  const onFatalWorkerLoss = opts.onFatalWorkerLoss || (() => {});

  const stats = {
    state: 'idle',
    role: ownership.role,
    workerCount: 0,
    canvasTransfers: 0,
    duplicateTransferRejections: 0,
    framesPosted: 0,
    coalescedDrops: 0,
    lastPostedGeneration: 0,
    destroyed: false,
    // R5/R6 — ACK-driven accounting: a frame success ACK counts an apply only
    // when its generation is correlated against the outstanding-posted ledger
    // and consumed exactly once; rejections/errors/forgeries never do.
    framesApplied: 0,
    framesDroppedByWorker: 0,
    lastAppliedGeneration: 0,
    layerCleared: false,
    workerErrors: 0,
    pendingCancelled: 0,
    acks: { init: 0, frame: 0, resize: 0, killSuspend: 0, teardown: 0 },
    // R6 — ACK-correlation observability (never fatal, never state-mutating):
    rejectedAcks: 0,          // duplicate / invalid / unposted / stale / late successes + uncorrelated drops
    lastAckAnomaly: '',       // most recent rejection classification
    framesRetiredByWorkerError: 0, // outstanding generations retired by a correlated frame CANDLE_ERROR
    ledgerEvictions: 0,       // oldest-outstanding evictions at M21_2_ACK_LEDGER_MAX
    fatalReason: null,        // persisted permanent fatal reason (degraded-canvas-lost machine)
  };

  let worker = null;
  let transferred = false;
  let suspendedByKill = false;
  let fatal = false;
  let fatalScheduled = false;
  let generationCounter = 0;
  let pending = null;
  let flushScheduled = false;
  const postedBuffers = new WeakSet();
  const reclaimable = [];
  const reclaimQueued = new WeakSet(); // exactly-once drain guard
  // R6/R7 — outstanding-posted frame ledger: generation → true, insertion
  // order = post order. R7 successful-post admission: a generation becomes
  // ACK-eligible only AFTER its FRAME postMessage RETURNS SUCCESSFULLY, and
  // leaves exactly once (consumed by an exact-generation success ACK, retired
  // by an exact-generation drop/error, evicted at bound, or drained by
  // fatal/destroy). Only committed ledger members are eligible for
  // framesApplied.
  const postedLedger = new Map();
  let fatalReason = null;
  // R7 — the generation whose FRAME postMessage is executing right now. An
  // exact-generation frame reply delivered synchronously/reentrantly DURING
  // the post is staged: consumed only after the post returns successfully,
  // discarded if the post throws. Never accepted early, never lost.
  let postingGeneration = null;
  let stagedReply = null;

  /** Queue a never-posted buffer for exactly-once reclamation. */
  function pushReclaimable(buf) {
    if (!buf || reclaimQueued.has(buf) || postedBuffers.has(buf)) return;
    reclaimQueued.add(buf);
    reclaimable.push(buf);
  }

  /** Pending frame cancelled by kill/fatal/destroy: never posts, reclaimable once. */
  function cancelPendingToReclaimable() {
    if (!pending) return;
    pushReclaimable(pending.buffer);
    stats.pendingCancelled += 1;
    pending = null;
  }

  /**
   * R5/R6 — the ONE idempotent fatal transition (every fatal path, including
   * partial-transfer canvas loss, must route here): terminate exactly once,
   * release the ownership registry, cancel the pending frame, drain/terminalize
   * the ACK ledger, persist the fatal reason, refuse everything after with that
   * same permanent reason, surface onFatalWorkerLoss exactly once. Never
   * silently main-thread paint a transferred canvas — recovery is canvas
   * ELEMENT replacement / reload.
   */
  function enterFatal(reason, error) {
    if (fatal || stats.destroyed) return;
    fatal = true;
    fatalReason = reason;
    stats.fatalReason = reason;
    cancelPendingToReclaimable();
    postedLedger.clear(); // late ACKs for pre-fatal generations stay rejected
    if (worker) {
      try { worker.terminate(); } catch { /* ignore */ }
      worker = null;
    }
    stats.workerCount = 0;
    stats.state = 'degraded-canvas-lost';
    if (registry.owner === self) registry.owner = null;
    onFatalWorkerLoss({ reason, error });
  }

  /**
   * Event-delivered fatality (onerror / onmessageerror / fatal CANDLE_ERROR)
   * applies on the scheduler tick — worker events are async tasks in real
   * browsers, so the in-flight flush accounting stays truthful.
   */
  function scheduleFatal(reason, error) {
    if (fatal || fatalScheduled || stats.destroyed) return;
    fatalScheduled = true;
    scheduler(() => {
      fatalScheduled = false;
      enterFatal(reason, error);
    });
  }

  /** Reject an ACK as observability only — no frame/paint state may change. */
  function rejectAck(anomaly) {
    stats.rejectedAcks += 1;
    stats.lastAckAnomaly = anomaly;
  }

  /** Retire the oldest outstanding generation (post order) — never applies it. */
  function retireOldestOutstanding() {
    const it = postedLedger.keys().next();
    if (it.done) return false;
    postedLedger.delete(it.value);
    return true;
  }

  /**
   * R6 — frame success ACKs are correlated against the outstanding-posted
   * ledger and consumed EXACTLY once. Eligibility: finite safe-integer
   * generation, present in the ledger (i.e. actually posted, not yet
   * consumed/retired/evicted), and strictly newer than lastAppliedGeneration.
   * Duplicate / invalid / unposted / already-consumed / stale / late successes
   * never change framesApplied, lastAppliedGeneration, layerCleared, the
   * retained descriptor, or paint state — they are counted as rejected
   * observability and are NEVER fatal (malformed-worker replies stay
   * recoverable). Control ACKs (init/resize/kill/teardown) are phase-routed
   * and can never touch frame accounting, whatever generation they carry.
   */
  function handleFrameAck(msg) {
    if (msg.ok === true) {
      if (fatal || stats.destroyed) { rejectAck(stats.destroyed ? 'success-after-destroy' : 'success-after-fatal'); return; }
      const gen = msg.generation;
      if (!m212ValidateGeneration(gen)) { rejectAck('success-invalid-generation'); return; }
      if (!postedLedger.has(gen)) { rejectAck('success-unposted-or-already-consumed'); return; }
      if (gen <= stats.lastAppliedGeneration) {
        // Posted but out-of-order behind an already-accepted newer frame:
        // retire it so a replay cannot resurrect it; never move state backward.
        postedLedger.delete(gen);
        rejectAck('success-stale-generation');
        return;
      }
      postedLedger.delete(gen); // consume exactly once
      stats.framesApplied += 1;
      stats.lastAppliedGeneration = gen;
      stats.layerCleared = msg.cleared === true;
      return;
    }
    if (msg.dropped === true) {
      handleFrameDrop(msg);
      return;
    }
    rejectAck('malformed-frame-ack');
  }

  /**
   * R7 — EXACT frame-outcome correlation, fail-closed: a drop retires an
   * outstanding generation only when it carries a finite safe-integer
   * generation that exactly matches a committed (successfully posted,
   * unresolved) ledger entry. A generation-less/unknown drop must NEVER
   * retire another generation — it is counted as rejected observability.
   * The uncorrelated ledger entry ages out at the M21_2_ACK_LEDGER_MAX bound,
   * so legitimate future progress is never blocked. Accepts both the current
   * ACK{dropped:true} shape and the forward-compat CANDLE_DROPPED reply the
   * concurrent worker-protocol change introduces (exact generation required
   * either way).
   */
  function handleFrameDrop(msg) {
    if (fatal || stats.destroyed) { rejectAck('drop-after-terminal'); return; }
    const gen = msg.generation;
    if (!m212ValidateGeneration(gen)) { rejectAck('drop-missing-or-invalid-generation'); return; }
    if (!postedLedger.has(gen)) { rejectAck('drop-unposted-or-already-resolved'); return; }
    postedLedger.delete(gen);
    stats.framesDroppedByWorker += 1;
  }

  /** R7 — frame-outcome replies (frame ACK, frame-phase error, dropped). */
  function isFrameOutcome(msg) {
    if (msg.type === M21_2_MSG.ACK) return msg.phase === 'frame';
    if (msg.type === M21_2_MSG.ERROR) return msg.phase === 'frame' || msg.phase === M21_2_MSG.FRAME;
    if (msg.type === 'CANDLE_DROPPED') return true;
    return false;
  }

  /** R5/R6/R7 — consume worker replies; correlated ACKs drive applied stats. */
  function handleWorkerMessage(evt) {
    const msg = evt && evt.data;
    if (!msg || typeof msg.type !== 'string') return;
    // R7 — reentrancy guard: an exact-generation frame outcome arriving DURING
    // worker.postMessage for that same generation is staged (first one only);
    // it is consumed after the post returns successfully and discarded if the
    // post throws. Everything else flows through normal handling, where a
    // not-yet-committed generation is inert by construction (fail-closed).
    if (postingGeneration != null && stagedReply == null
      && isFrameOutcome(msg) && msg.generation === postingGeneration) {
      stagedReply = msg;
      return;
    }
    if (msg.type === 'CANDLE_DROPPED') {
      // Forward-compat: exact-generation frame-drop reply from the concurrent
      // worker-protocol change; same exact-only correlation as ACK{dropped}.
      handleFrameDrop(msg);
      return;
    }
    if (msg.type === M21_2_MSG.ACK) {
      if (msg.phase === 'init') stats.acks.init += 1;
      else if (msg.phase === 'frame') {
        stats.acks.frame += 1;
        handleFrameAck(msg);
      } else if (msg.phase === 'resize') stats.acks.resize += 1;
      else if (msg.phase === 'kill-suspend') stats.acks.killSuspend += 1;
      else if (msg.phase === 'teardown') stats.acks.teardown += 1;
      return;
    }
    if (msg.type === M21_2_MSG.ERROR) {
      stats.workerErrors += 1;
      // R6/R7 — EXACT correlation only: a frame error retires an outstanding
      // generation WITHOUT applying it solely when it carries a finite
      // safe-integer generation exactly matching a committed ledger entry
      // (cooperates with the concurrent worker-protocol exact-generation
      // replies). A generation-less/unknown frame error must NEVER retire
      // another generation — fail-closed rejected observability; the
      // uncorrelated entry ages out at the ledger bound so progress is never
      // blocked. A late success for a retired generation stays rejected.
      // Non-frame (init/resize/...) errors never retire frame generations.
      if (!fatal && !stats.destroyed
        && (msg.phase === 'frame' || msg.phase === M21_2_MSG.FRAME)) {
        if (m212ValidateGeneration(msg.generation) && postedLedger.has(msg.generation)) {
          postedLedger.delete(msg.generation);
          stats.framesRetiredByWorkerError += 1;
        } else {
          rejectAck('frame-error-uncorrelated');
        }
      }
      onWorkerError(msg);
      if (m212IsFatalWorkerError(msg)) {
        scheduleFatal(`worker-error-${msg.error || msg.phase || 'unknown'}`, String(msg.error || ''));
      }
    }
  }

  const self = {
    transferCanvas() {
      // R6/R7 — the fatal machine is PERMANENT and takes precedence: a retry
      // must construct zero additional workers and restate the persisted
      // reason; no runtime state (kill switch, destroy) may relabel it.
      if (fatal) return { ok: false, reason: 'degraded-canvas-lost', fatalReason };
      if (stats.destroyed) return { ok: false, reason: 'destroyed' };
      if (transferred) {
        stats.duplicateTransferRejections += 1;
        return { ok: false, reason: 'already-transferred' };
      }
      if (!ownership.shouldOwnWorker) return { ok: false, reason: 'embed-not-owner' };
      if (registry.owner != null) return { ok: false, reason: 'worker-already-owned' };
      if (!m212CandleOffscreenFixEnabled(windowRef)) {
        // D1: consulted BEFORE transfer — canvas untouched, legacy paint stays.
        stats.state = 'kill-switch-main-thread';
        return { ok: false, reason: 'kill-switch' };
      }
      // R1 correction: feature-detect BEFORE worker construct. A canvas without
      // a callable transferControlToOffscreen must cost zero workers, zero
      // transfers, zero registry state — legacy main-thread paint stays intact.
      if (!canvas || typeof canvas.transferControlToOffscreen !== 'function') {
        stats.state = 'fallback-main-thread';
        return { ok: false, reason: 'transfer-unsupported' };
      }
      // D5: construct BEFORE transfer so construct failure is a clean fallback.
      try {
        worker = workerFactory(workerUrl);
      } catch (err) {
        stats.state = 'fallback-main-thread';
        return { ok: false, reason: 'worker-construct-failed', error: String(err && err.message || err) };
      }
      const dpr = opts.dpr || 1;
      const cssWidth = opts.cssWidth || (canvas && canvas.width) || 0;
      const cssHeight = opts.cssHeight || (canvas && canvas.height) || 0;
      // R5/R6 — install ALL channel handlers BEFORE the transfer attempt so no
      // early ACK/error can be missed AND so partial-transfer canvas loss can
      // enter the one fatal machine with fully-arranged handler/closure state
      // even before INIT. Event-delivered fatality is scheduler-applied.
      worker.onmessage = handleWorkerMessage;
      worker.onerror = (e) => {
        onWorkerError(e);
        scheduleFatal('worker-onerror', String((e && (e.message || e.type)) || 'worker-error'));
      };
      worker.onmessageerror = (e) => {
        onWorkerError(e);
        scheduleFatal('worker-messageerror', String((e && e.type) || 'messageerror'));
      };
      let offscreen;
      try {
        offscreen = canvas.transferControlToOffscreen();
      } catch (err) {
        // Spec throws (InvalidStateError) happen BEFORE any transfer, so the
        // canvas is normally intact. Probe: if this browser partially
        // transferred before throwing (2d context no longer obtainable), the
        // canvas is permanently lost.
        let canvasLost = false;
        if (typeof canvas.getContext === 'function') {
          try { canvasLost = canvas.getContext('2d') == null; } catch { canvasLost = true; }
        }
        const detail = String(err && err.message || err);
        if (canvasLost) {
          // R6 correction: canvas loss enters the SAME permanent idempotent
          // fatal machine as every other loss path — terminate the constructed
          // worker exactly once, release registry/ownership, drain
          // pending/ledger, persist the reason, callback exactly once, and
          // refuse every later transfer/submit/resize. Never claim legacy /
          // main-thread recovery on a lost canvas — recovery is canvas
          // ELEMENT replacement / page reload.
          enterFatal('transfer-failed-canvas-lost', detail);
          return { ok: false, reason: 'transfer-failed-canvas-lost', error: detail, fatalReason };
        }
        // R1 correction: contain the transfer throw — canvas intact, terminate
        // the constructed worker exactly once, keep registry/owner untouched,
        // never rethrow; legacy main-thread paint remains valid.
        try { worker.terminate(); } catch { /* ignore */ }
        worker = null;
        stats.state = 'fallback-main-thread';
        return { ok: false, reason: 'transfer-failed', error: detail };
      }
      transferred = true;
      stats.canvasTransfers += 1;
      try {
        worker.postMessage({
          type: M21_2_MSG.INIT,
          canvas: offscreen,
          dpr,
          cssWidth,
          cssHeight,
          deviceWidth: Math.round(cssWidth * dpr),
          deviceHeight: Math.round(cssHeight * dpr),
        }, [offscreen]);
      } catch (err) {
        // Canvas is already gone (one-shot). INIT post failure is fatal via the
        // same idempotent machine (terminate once, callback once); documented
        // recovery at wiring time: canvas ELEMENT replacement.
        enterFatal('init-post-failed', String(err && err.message || err));
        return { ok: false, reason: 'init-post-failed-canvas-lost', fatalReason };
      }
      stats.workerCount = 1;
      stats.state = 'active';
      registry.owner = self;
      return { ok: true };
    },

    submitFrame({ buffer, descriptor } = {}) {
      // R7 — permanent canvas-loss fatality takes precedence over EVERY other
      // refusal (including destroy) so the original reason is always exposed.
      if (fatal) return { ok: false, reason: 'degraded-canvas-lost', fatalReason };
      if (stats.destroyed) return { ok: false, reason: 'destroyed' };
      if (stats.state !== 'active') return { ok: false, reason: stats.state };
      if (suspendedByKill) return { ok: false, reason: 'kill-suspended' };
      if (!buffer || typeof buffer.byteLength !== 'number') {
        throw new Error('frame-buffer-missing: submitFrame requires a sibling ArrayBuffer');
      }
      // R5 ownership machine — identity tracking, NOT byteLength: an explicit
      // empty frame legitimately carries a NEW zero-length buffer, while any
      // previously transferred (or externally detached) buffer is rejected.
      if (postedBuffers.has(buffer) || buffer.detached === true) {
        throw new Error('detached-buffer-reuse: transferred/detached ArrayBuffer must never be resubmitted');
      }
      if (pending && pending.buffer === buffer) {
        throw new Error('buffer-already-pending: the same ArrayBuffer cannot be submitted twice while pending');
      }
      if (reclaimQueued.has(buffer)) {
        throw new Error('buffer-awaiting-reclaim: drain reclaimable buffers before resubmitting this ArrayBuffer');
      }
      validateFrameDescriptor(descriptor, buffer.byteLength);
      // R5 — snapshot (clone+freeze) at submit: caller mutation after submit
      // cannot alter the validated payload the worker receives.
      const snapshot = Object.freeze({
        byteOffset: descriptor.byteOffset,
        byteLength: descriptor.byteLength,
        elementCount: descriptor.elementCount,
        barCount: descriptor.barCount,
        stride: descriptor.stride,
      });
      generationCounter += 1;
      if (!m212ValidateGeneration(generationCounter)) {
        generationCounter -= 1;
        throw new Error('frame-generation-invalid: generation counter left the safe-integer range');
      }
      if (pending) {
        // Coalesce latest-wins: superseded frame was never transferred — hand
        // its (still-owned, undetached) buffer back for pool release.
        pushReclaimable(pending.buffer);
        stats.coalescedDrops += 1;
      }
      pending = { buffer, descriptor: snapshot, generation: generationCounter };
      if (!flushScheduled) {
        flushScheduled = true;
        scheduler(() => {
          flushScheduled = false;
          if (!pending) return;
          // R5 — re-check the machine state at flush time: a pending frame
          // cancelled by kill/fatal/destroy must never post and is returned
          // reclaimable exactly once.
          if (fatal || stats.destroyed || suspendedByKill || stats.state !== 'active') {
            cancelPendingToReclaimable();
            return;
          }
          const p = pending;
          pending = null;
          postedBuffers.add(p.buffer);
          // R7 — successful-post admission: ledger eligibility commits only
          // AFTER worker.postMessage RETURNS successfully. An exact-generation
          // reply delivered synchronously/reentrantly during the call is
          // staged (see handleWorkerMessage): consumed on successful return,
          // discarded on throw — never accepted early, never lost.
          postingGeneration = p.generation;
          stagedReply = null;
          try {
            worker.postMessage({
              type: M21_2_MSG.FRAME,
              generation: p.generation,
              descriptor: p.descriptor,
              buffer: p.buffer,
            }, [p.buffer]);
          } catch (err) {
            // Post-transfer FRAME post failure is fatal (synchronous): no
            // framesPosted increment, no ledger entry, no apply/clear side
            // effect; the staged reentrant reply is discarded. The
            // posted/possibly-detached buffer is never reclaimed or retried.
            postingGeneration = null;
            stagedReply = null;
            onWorkerError(err);
            enterFatal('frame-post-failed', String(err && err.message || err));
            return;
          }
          stats.framesPosted += 1;
          stats.lastPostedGeneration = p.generation;
          if (postedLedger.size >= M21_2_ACK_LEDGER_MAX) {
            if (retireOldestOutstanding()) stats.ledgerEvictions += 1;
          }
          postedLedger.set(p.generation, true);
          postingGeneration = null;
          if (stagedReply != null) {
            const rep = stagedReply;
            stagedReply = null;
            handleWorkerMessage({ data: rep });
          }
        });
      }
      return { ok: true, generation: generationCounter };
    },

    /** Superseded/cancelled (never-transferred) buffers — drained exactly once. */
    drainReclaimableBuffers() {
      const out = reclaimable.splice(0, reclaimable.length);
      for (const buf of out) reclaimQueued.delete(buf);
      return out;
    },

    /**
     * H4/F8 — after transfer the worker owns the backing store; resize is a
     * message, never a main-thread canvas.width/height write, never a re-transfer.
     */
    resize(payload = {}) {
      // R7 — fatal precedence BEFORE payload validation: an invalid payload
      // after canvas loss must expose the original fatal reason, never
      // relabel the refusal as a validation error.
      if (fatal) return { ok: false, reason: 'degraded-canvas-lost', fatalReason };
      if (stats.destroyed) return { ok: false, reason: 'destroyed' };
      const fields = ['dpr', 'cssWidth', 'cssHeight', 'deviceWidth', 'deviceHeight'];
      const valid = fields.every((f) => typeof payload[f] === 'number' && Number.isFinite(payload[f]) && payload[f] > 0);
      if (!valid) return { ok: false, reason: 'invalid-resize-payload' };
      if (stats.state !== 'active') return { ok: false, reason: 'not-transferred' };
      try {
        worker.postMessage({ type: M21_2_MSG.RESIZE, ...payload });
      } catch (err) {
        // R5 — any post-transfer postMessage failure is fatal.
        onWorkerError(err);
        enterFatal('resize-post-failed', String(err && err.message || err));
        return { ok: false, reason: 'post-failed' };
      }
      return { ok: true };
    },

    /** D2 — post-transfer kill flip: suspend only; full rollback = reload. */
    applyKillSwitchPolicy() {
      // R7 — terminal states take precedence: a permanent canvas-loss fatal
      // (or destroy) is NEVER relabeled by a runtime kill-switch change; the
      // original fatal reason stays exposed (even post-destroy) and state is
      // untouched.
      if (fatal) return { mode: 'fatal-degraded', fatalReason };
      if (stats.destroyed) return { mode: 'destroyed' };
      if (m212CandleOffscreenFixEnabled(windowRef)) return { mode: 'fix-on' };
      if (!transferred) {
        stats.state = 'kill-switch-main-thread';
        return { mode: 'pre-transfer-main-thread' };
      }
      if (stats.state === 'active' && !suspendedByKill) {
        suspendedByKill = true;
        // R5 kill-before-flush: the pending frame must never post — cancel it
        // back to the caller (reclaimable exactly once) before suspending.
        cancelPendingToReclaimable();
        try {
          worker.postMessage({ type: M21_2_MSG.KILL_SUSPEND });
        } catch (err) {
          onWorkerError(err);
          enterFatal('kill-suspend-post-failed', String(err && err.message || err));
        }
      }
      return { mode: 'post-transfer-suspend' };
    },

    /** F9 — exactly one terminate, idempotent, releases document ownership. */
    destroy() {
      if (stats.destroyed) return;
      // R5 destroy-before-flush: drain the pending frame back to the caller.
      cancelPendingToReclaimable();
      // R6 — terminalize the ledger: no late ACK may mutate state post-destroy.
      postedLedger.clear();
      stats.destroyed = true;
      if (worker) {
        try { worker.postMessage({ type: M21_2_MSG.TEARDOWN }); } catch { /* ignore */ }
        try { worker.terminate(); } catch { /* ignore */ }
        worker = null;
      }
      stats.workerCount = 0;
      // R7 — teardown never relabels a permanent canvas-loss fatal: the fatal
      // state label and reason survive destroy() for the bridge lifetime.
      if (!fatal) stats.state = 'destroyed';
      if (registry.owner === self) registry.owner = null;
    },

    getStats() {
      return { ...stats, acks: { ...stats.acks }, outstandingFrames: postedLedger.size };
    },
  };

  return self;
}
