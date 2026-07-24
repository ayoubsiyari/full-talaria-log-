# M21-2 — Candle-layer OffscreenCanvas API (AUTHORITATIVE, W3-owned)

**Status:** `FABLE-SIGNED-20260724` — module-level scaffold only.
**Product wiring:** LOCKED until Manager commits M21-1 (`chart.js` untouchable).
**This document supersedes all provisional W6 naming for the candle scaffold.**
W6 rebinds its harness to these symbols per `W6-M21-2-W3-API-REBIND-CHECKLIST` §1.

| Surface | File |
|---|---|
| Main-thread bridge (ESM) | `modules/m21-2-candle-offscreen-bridge.mjs` |
| Render worker (same-origin classic) | `workers/m21-2-candle-render-worker.js` |
| Gate + evidence writer | `modules/m21-2-candle-offscreen-scaffold.test.mjs` |

## Kill-switch (D1/D2)

- Name (exact): `__TALARIA_DISABLE_M21_2_CANDLE_OFFSCREEN_V1` — W6 provisional name **ACCEPTED**.
- ON ⇒ legacy main-thread candle paint; no worker construct; no canvas transfer.
- Consulted **before** the first `transferControlToOffscreen` — the transfer is
  **one-shot** and cannot be undone.
- Post-transfer flip (D2): bridge suspends (`CANDLE_KILL_SUSPEND`, frames refused
  with `kill-suspended`); the worker keeps the last painted frame. Full rollback
  after transfer requires page reload (or canvas element replacement at wiring
  level). This is the documented answer to W6 fault F11.
- **R3 (reviewer issue, CONFIRMED policy — reload-only):** the post-transfer
  suspend has **no resume path by design**. Flipping the kill switch back OFF
  after a suspend does **not** resume frames — `transferControlToOffscreen` is
  one-shot and the bridge will not pretend otherwise. The ONLY full rollback
  after transfer is a **page reload** (or canvas ELEMENT replacement at wiring
  level). Wiring must treat a post-transfer kill flip as terminal for the
  current page lifecycle.

## Ownership model (D3) — host + (N−1) iframes resolved

Phase-1 (M21-2): **only the host document** owns the single candle render worker
and transfers **only its own** candle canvas. Multichart embed iframes keep the
legacy main-thread paint path until M21-3 (single render runtime, four cameras).
Consequences, matching W6 C8/F14: for 1/2/4 views, `workerCount === 1` and
`canvasTransfers === 1` (O(1) in views).

- `resolveCandleWorkerOwnership(env)` → `{ role: 'host'|'embed', shouldOwnWorker }`
  where `env = { isMultichartEmbedPanel, parentHasMultichartGrid }`.
- A per-document ownership registry admits exactly one bridge; `destroy()`
  releases it. Second host bridge ⇒ `worker-already-owned`.

## Worker bootstrap (H2/H3/H9/H10)

- URL (exact): `/chart/workers/m21-2-candle-render-worker.js` — same-origin,
  **classic** script (product precedent), **never a blob URL** (CSP hazard H3).
- Wiring must append `?v=<build>` cache-bust (H10) — not part of the constant.
- Construct order (D5): worker construct **precedes** canvas transfer, so a
  construct failure is a clean main-thread fallback with the canvas untouched.
- Feature-detect order (R1 correction): a **callable**
  `canvas.transferControlToOffscreen` is checked **before** worker construct.
  Unsupported environments return `{ok:false, reason:'transfer-unsupported'}`
  at zero cost — no worker, no transfer, no registry state, legacy canvas
  intact. The actual transfer call is wrapped: it can never throw out of
  `transferCanvas()` and can never leak the constructed worker (see table).

## Message protocol (drift-gated between bridge and worker)

| Type | Direction | Payload |
|---|---|---|
| `CANDLE_INIT` | main→worker | `{ canvas (transferred OffscreenCanvas), dpr, cssWidth, cssHeight, deviceWidth, deviceHeight }` |
| `CANDLE_FRAME` | main→worker | `{ generation, descriptor, buffer }`, transfer `[buffer]` |
| `CANDLE_RESIZE` | main→worker | `{ dpr, cssWidth, cssHeight, deviceWidth, deviceHeight }` — all 5 required |
| `CANDLE_KILL_SUSPEND` | main→worker | `{}` |
| `CANDLE_TEARDOWN` | main→worker | `{}` |
| `CANDLE_ACK` / `CANDLE_ERROR` | worker→main | `{ phase, ok?, dropped?, reason?, generation?, cleared?, error? }` |

## Worker replies / ACK accounting (R5, R6, corrected R7 — successful-post admission, exact-only correlation)

The bridge installs `worker.onmessage` (and `onerror`/`onmessageerror`)
**before the transfer attempt** and consumes every worker reply. Applied stats
are **ACK-driven and ledger-correlated**:

- The bridge keeps an **outstanding-posted frame ledger**: a generation
  becomes ACK-eligible only **after its `CANDLE_FRAME` `postMessage` RETURNS
  successfully** (R7 successful-post admission) and leaves **exactly once** —
  consumed by an eligible success ACK, retired by an **exact-generation** drop
  or frame `CANDLE_ERROR`, evicted at the `M21_2_ACK_LEDGER_MAX` bound (oldest
  first, counted in `stats.ledgerEvictions`), or drained by fatal/destroy.
- **R7 reentrancy staging:** an exact-generation frame reply delivered
  synchronously/reentrantly **during** the `postMessage` call is staged — it
  is neither accepted early nor lost: it is consumed after the post returns
  successfully and **discarded if the post throws**. A frame-post throw
  leaves `framesPosted`/`framesApplied` unchanged, no clear/apply side
  effect, and no outstanding ledger entry; it enters the fatal machine.
  Duplicate/stale/unposted/invalid/wrong-kind replies during the post remain
  inert.
- A `CANDLE_ACK { phase:'frame', ok:true }` is **eligible** only when its
  `generation` is a finite safe integer, is **in the ledger** (actually
  posted, not yet consumed/retired/evicted), and is **strictly newer** than
  `lastAppliedGeneration`. Eligible successes are consumed exactly once:
  `framesApplied` increments, `lastAppliedGeneration` advances,
  `cleared:true` sets `layerCleared`.
- **Duplicate / invalid / unposted / already-consumed / stale** successes
  never change `framesApplied`, `lastAppliedGeneration`, `layerCleared`, the
  retained descriptor, or paint state. They are counted in
  `stats.rejectedAcks` with `stats.lastAckAnomaly` — observability only,
  **never fatal** (malformed worker replies stay recoverable).
- Control ACKs (`init` / `resize` / `kill-suspend` / `teardown`) are
  phase-routed into `stats.acks` and can **never** touch frame accounting,
  whatever `generation` field they carry.
- **R7 exact-only outcome correlation (fail-closed):** a frame drop
  (`CANDLE_ACK { phase:'frame', dropped:true, generation }` or the
  forward-compat `CANDLE_DROPPED { generation }`) or a frame-phase
  `CANDLE_ERROR { generation }` resolves an outstanding generation **only**
  when it carries a finite safe-integer generation **exactly matching** a
  committed ledger entry (drop → `framesDroppedByWorker`; error →
  `framesRetiredByWorkerError`, retired **without applying**; a late success
  for a resolved generation stays rejected). A **generation-less/unknown
  frame outcome never retires another generation** — it is counted as
  rejected observability, and the uncorrelated ledger entry ages out at the
  `M21_2_ACK_LEDGER_MAX` bound, so legitimate future progress is never
  blocked. Non-frame errors never retire frames.
- **Worker protocol contract (R7 convergence, PROVISIONAL while the
  worker-protocol lane is concurrent):** frame-specific replies carry the
  exact input generation — success `{ok:true, generation}`, drop
  `{dropped:true, reason:'stale'|'suspended', generation}` (never emitted
  without a valid correlated generation), error
  `{type:'CANDLE_ERROR', phase:'frame', error, generation}`. An
  invalid/missing input generation is reported with the explicit
  non-correlatable marker `{generation:null, generationInvalid:true}` — the
  bridge rejects it fail-closed (never retires by position). Control replies
  never carry a generation.
- Fatal and `destroy()` **drain/terminalize the ledger** — no late ACK can
  mutate state afterwards.
- `framesPosted` remains the post-side counter; `framesApplied` is the
  worker-confirmed truth; `outstandingFrames` (in `getStats()`) is the live
  ledger size. They legitimately diverge on drops/rejections.

## Fatal worker-error classification (R5, R6, R7) — `m212IsFatalWorkerError`

Fatal = the transferred canvas can never be painted by this worker again. All
fatal inputs — **including partial-transfer canvas loss** — funnel into **one
idempotent** `degraded-canvas-lost` transition: terminate the worker
**exactly once**, release the ownership registry, cancel the pending frame
(reclaimable exactly once), drain/terminalize the ACK ledger, **persist the
fatal reason** (`stats.fatalReason`), refuse **all** later
`transferCanvas`/`submitFrame`/`resize` with
`{ok:false, reason:'degraded-canvas-lost', fatalReason}` (the same permanent
reason every time), and surface `onFatalWorkerLoss` **exactly once**. A
retried `transferCanvas()` after fatal constructs **zero** additional
workers. A transferred canvas is **never** silently main-thread painted;
recovery = canvas ELEMENT replacement / reload.

**R7 — fatality is terminal for the bridge lifetime and takes precedence over
every other refusal/label:**

- Runtime kill-switch changes never relabel it:
  `applyKillSwitchPolicy()` after fatal returns
  `{mode:'fatal-degraded', fatalReason}` (OFF→ON→OFF alike) and never writes
  `pre-transfer-main-thread` / `kill-switch-main-thread` state.
- Invalid payloads never relabel it: `resize()` after fatal returns the fatal
  reason **before** payload validation (never `invalid-resize-payload`).
- `destroy()` keeps the `degraded-canvas-lost` state label (plus
  `destroyed:true`); post-destroy API calls still expose the original
  `fatalReason`.
- No reconstruction, second transfer, worker recreation, callback
  duplication, or hidden recovery — ever.

| Input | Fatal? | Timing |
|---|---|---|
| `worker.onerror` (crash / script load failure) | **yes** | scheduler tick (events are async tasks) |
| `worker.onmessageerror` (deserialization) | **yes** | scheduler tick |
| `CANDLE_ERROR { phase:'init' }` (init-canvas-missing / init-context-unavailable) | **yes** | scheduler tick |
| `CANDLE_ERROR { error:'worker-not-active' }` | **yes** | scheduler tick |
| INIT `postMessage` throw | **yes** | synchronous |
| FRAME / RESIZE / KILL_SUSPEND `postMessage` throw (post-transfer) | **yes** | synchronous |
| `CANDLE_ERROR` frame/resize validation rejection (e.g. `frame-generation-invalid`, `invalid-resize-payload`) | no — recoverable; surfaced via `onWorkerError`, never applied | n/a |

## Frame descriptor (D4) — accepted from W6, shape modified

Geometry-only descriptor; the `ArrayBuffer` travels as a **sibling** payload
field (never inside the descriptor):

```
descriptor = {
  byteOffset: 0,                  // window always head-packed
  byteLength,                     // window bytes ONLY (byteLength === elementCount*8)
  elementCount,                   // elementCount === barCount * stride
  barCount,
  stride: 6                       // Float64 [t, o, h, l, c, v]
}
```

- Validation is rule-identical in `validateFrameDescriptor` (bridge) and
  `validateFrameDescriptorWorker` (worker); the gate drift-checks both.
- Reconstruct ONLY via `viewFromFrameDescriptor(buffer, descriptor)` — a bare
  `new Float64Array(buffer)` over-reads NaN-poisoned spare capacity
  (W6 compat-audit hazard, ACCEPTED as a hard rule).
- `descriptorFromMirrorDetach(det)` adapts W6 `detachForTransfer()` output
  unchanged — W6 mirror/pool fixtures remain compatible without edits.

## Generation / coalescing / stale drop (C5, F5–F7, R5)

- `submitFrame` assigns a monotonic `generation`; bursts within one scheduler
  tick coalesce **latest-wins** into a single worker post.
- Superseded frames are never transferred; their buffers surface via
  `drainReclaimableBuffers()` for pool release (undetached).
- Worker drops `generation <= lastAppliedGeneration` (stale/out-of-order).
- **R5 generation hygiene (bridge-side, matching the worker contract):**
  `m212ValidateGeneration(gen)` — finite safe integer `>= 1` only. No
  Infinity / NaN / fraction / negative / unsafe-integer poison can be posted;
  the counter is validated before every frame.

## Buffer ownership state machine (C6, F3/F12/F13, R5)

Every submitted `ArrayBuffer` moves through exactly one path:

```
caller-owned ──submit──▶ pending ──flush──▶ posted (detached; TERMINAL)
                            │
                            ├─ coalesced-out ──▶ reclaimable ──drain──▶ caller-owned
                            └─ cancelled (kill/fatal/destroy) ─▶ reclaimable ──drain──▶ caller-owned
```

- Identity tracking (WeakSet + `ArrayBuffer.prototype.detached`), **not**
  byteLength: resubmitting a transferred/detached buffer throws
  `detached-buffer-reuse`, even a zero-length one.
- Submitting the buffer that is already **pending** throws
  `buffer-already-pending`; submitting a buffer sitting in the reclaim queue
  throws `buffer-awaiting-reclaim`.
- Coalesced-out and cancelled buffers stay **undetached** and drain via
  `drainReclaimableBuffers()` **exactly once** (queue guarded by a WeakSet);
  a drained buffer may legitimately start a new submit cycle.
- A pending frame cancelled by kill-suspend, fatal transition, or `destroy()`
  **never posts** — the flush microtask re-checks machine state before posting
  — and is returned reclaimable exactly once (`destroy()` drains pending).
- Posted/detached buffers are **never** reclaimed or retried; a FRAME post
  throw leaves the buffer terminal and enters the fatal state.

## Descriptor snapshot at submit (R5)

`submitFrame` clones and freezes the five descriptor fields **after**
validation; the worker receives the snapshot. Caller mutation of the
descriptor object between submit and flush cannot alter the validated payload.

## Explicit empty frame (R5 — matches the worker-edge contract)

A **NEW** zero-length buffer with `barCount = 0` (`elementCount = 0`,
`byteLength = 0`) is a legitimate frame, not an error:

- The bridge posts it (transfer list included) so the corrected worker clears
  the entire candle layer — **no stale pixels** — and ACKs
  `{ phase:'frame', ok:true, cleared:true, barCount:0 }` (sets `layerCleared`).
- The worker retains the empty descriptor, so the layer **stays cleared across
  `CANDLE_RESIZE`** repaints.
- Identity tracking still rejects any previously transferred buffer despite
  the matching byteLength of 0.

## Resize / DPR after transfer (H4 critical, F8)

After transfer the **worker owns the backing store**. Main thread never writes
`canvas.width/height` again; it sends `CANDLE_RESIZE` with all five fields.
The worker resizes the OffscreenCanvas and repaints the retained last frame.
There is **no re-transfer** on resize.

## Failure / fallback (F2–F4, R1)

| Failure | Bridge behavior |
|---|---|
| `transferControlToOffscreen` missing / not callable (feature-detect, BEFORE construct) | `{ok:false, reason:'transfer-unsupported'}`; **zero** workers constructed, zero transfers, registry untouched; `fallback-main-thread`; legacy canvas intact. Repeated attempts stay worker-flat. |
| Worker construct throws | `{ok:false, reason:'worker-construct-failed'}`; `fallback-main-thread`; canvas untouched (legacy paint OK) |
| `transferControlToOffscreen()` throws | constructed worker terminated **exactly once**; `{ok:false, reason:'transfer-failed'}`; **no uncaught exception**; registry untouched. Spec throws (`InvalidStateError`) precede any transfer, so the canvas is intact and legacy paint remains available (`fallback-main-thread`). Repeated attempts stay live-worker flat; `destroy()` leaves no orphans. |
| `transferControlToOffscreen()` throws AND the canvas was actually detached (probe: 2d context no longer obtainable) | **R6: enters the one fatal machine** (`enterFatal('transfer-failed-canvas-lost')`, handlers arranged before the transfer attempt) — constructed worker terminated **exactly once**, registry/pending/ledger drained, reason persisted in `stats.fatalReason`, `onFatalWorkerLoss` fires **exactly once**; returns `{ok:false, reason:'transfer-failed-canvas-lost', fatalReason}`. Every later `transferCanvas`/`submitFrame`/`resize` is refused `{ok:false, reason:'degraded-canvas-lost', fatalReason:'transfer-failed-canvas-lost'}`; a retried transfer constructs **zero** additional workers; repeated calls/`destroy()` never terminate or callback twice. The bridge never claims a legacy fallback on a lost canvas. Recovery = canvas ELEMENT replacement / page reload. |
| INIT postMessage throws (post-transfer) | fatal machine: terminate **exactly once**; `degraded-canvas-lost`; `onFatalWorkerLoss` fires once; documented recovery = canvas element replacement + legacy repaint |
| Async worker error / messageerror / fatal `CANDLE_ERROR` (post-transfer) | surfaced via `onWorkerError` **and** enters the idempotent fatal machine on the scheduler tick (see fatal classification table) — all later frames/resizes refused |
| FRAME / RESIZE / KILL_SUSPEND postMessage throws (post-transfer) | surfaced via `onWorkerError` and **synchronously** fatal; the posted buffer is never reclaimed/retried |
| Recoverable `CANDLE_ERROR` (frame/resize validation rejection) | surfaced via `onWorkerError`; never fatal; never counted applied; bridge stays `active` |

## Teardown (F9, H5)

`destroy()` posts `CANDLE_TEARDOWN`, terminates **exactly once**, is idempotent,
zeroes `workerCount`, releases the ownership registry.

**R4 (reviewer observation, documented):** `terminate()` is **authoritative**
and intentionally races the `CANDLE_TEARDOWN` ACK — the ACK frequently never
arrives because the worker is torn down first. This is expected, is **not** a
leak, and callers must not wait for a teardown ACK. Termination, not the ACK,
is the completion signal.

## Measurement rule (binding)

GPU-process share, pan/replay FPS, real pixel parity (RMSE/maxAbs), and context
loss are **NOT-MEASURABLE** from this Node-level scaffold and are forced so in
evidence. They can only go GREEN from real-browser instrumentation (W5) against
the M21-0 scorecard. `HARNESS-PASS` ≠ product GREEN.
