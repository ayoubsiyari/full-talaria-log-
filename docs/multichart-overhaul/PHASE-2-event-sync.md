# Phase 2 — Event-Driven Data Sync (kill the polling + the mouse-up pop)

**Root causes fixed:** RC2 (poll-and-mutate timing bugs), RC3 (bridge mixing viewport and
data), RC4 (deferred resample pop). After this phase, data propagation is deterministic:
owner merges → one notification → each consumer re-slices once, throttled during gestures.

**Prerequisite:** Phase 1 gate passed (owner queue + always-on extend broadcast exist).

**Gate to Phase 3:** S3 fills panel B's history VISIBLY WHILE DRAGGING (not at mouse-up),
in both sync modes; no viewport jump/pop at mouse-up in S2/S3/S9; `extendsFromParent` per
host fetch is a small constant (1–3), not proportional to drag duration; S1/S11 unchanged.

---

## Task 2.1 — Throttled mid-drag repaint (smallest, highest-impact)

**Files:** `chart v 1.4/chart/chart.js` (+ mirror).

Today, when `_tryExtendReplayMasterFromParent({lite:true})` runs during a drag and the
panel is NOT viewport-mirrored with the host, it sets `_multichartPendingMasterResample = true`
and the reslice waits for gesture end (`_scheduleMultichartHostMasterSyncPoll` only
flushes when `!stillPan && !hostBusy`; `_releasePanSyncFollowBurst` flushes at release).
That is the "panel fills only after mouse-up" lag AND the mouse-up pop.

Change (inside `_scheduleMultichartHostMasterSyncPoll`'s poll loop): while
`stillPan || hostBusy`, if `_multichartPendingMasterResample` is set and at least
**180 ms** have passed since the last flush, call `_flushMultichartPendingMasterResample()`
and record the flush time; then continue polling. Keep the existing end-of-gesture flush
untouched (it becomes the final catch-all).

Why 180 ms: `checkViewportLoadMore` already documents that full reslices at ~12/s freeze
the drag; ~5/s was the proven safe cadence for the same work. Do not go below 150 ms.

Note: the offset compensation for prepended bars already happens at merge time inside
`_tryExtendReplayMasterFromParent` (search `_countReplayBackwardDisplayBarsAdded`) — the
throttled flush needs NO extra offset math. Do not add any.

**Verification (this task specifically):** screen-record S3 before/after; the gap on the
left must fill during the drag. `resamples` during a 3-second drag should be ~15–20, not
1 (all-deferred) and not 100+ (unthrottled).
**Kill-switch:** `window.__TALARIA_MC_DISABLE_MIDDRAG_FLUSH = true`.

---

## Task 2.2 — Replace the rAF host-poll with notification-driven extends

**Files:** `chart v 1.4/chart/chart.js`, `panel-cmd-bridge.js` (+ mirrors).

With Phase-1 Task 1.2, the host broadcasts `extendReplayMasterFromHost` after every merge.
The per-frame poll `_scheduleMultichartHostMasterSyncPoll` then becomes redundant 90% of
the time. Change it from "poll every frame" to "safety net":

- On `_mcRequestOwnerFetch`, the panel arms a **watchdog** (single `setTimeout`, 1500 ms)
  instead of a rAF loop. If the notification arrives first (normal case), the handler
  clears the watchdog. If the watchdog fires, it runs ONE `_tryExtendReplayMasterFromParent`
  attempt + re-arms at most twice, then gives up with a diagnostic error.
- The `extendReplayMasterFromHost` handler in `panel-cmd-bridge.js` stays the single place
  consumers apply data (it already calls `_tryExtendReplayMasterFromParent` + flush).

Do NOT delete `_scheduleMultichartHostMasterSyncPoll` in this task — leave it callable
behind the kill-switch fallback. Deletion happens in a later cleanup once stable.

**Acceptance criteria:** S3/S8: `extendsFromParent` ≈ number of host fetches (±2), not
hundreds; CPU profile during a 10 s drag shows no per-frame poll callback; behavior
identical to Task-2.1 state otherwise.
**Kill-switch:** `window.__TALARIA_MC_DISABLE_EXTEND_EVENTS = true` (reverts to rAF poll).

---

## Task 2.3 — Purify the sync-bridge (viewport channel only)

**Files:** `chart v 1.4/chart/multichart-prod/sync-bridge.js` (+ mirror).

`applyVisibleRange` currently calls `ensureHistoryForVisibleStart(chart, m)` (on non-panSync
messages), which can trigger fetch/delegation from inside a VIEWPORT handler — an RC3
cycle source (viewport msg → fetch → data change → viewport echo …).

Change `ensureHistoryForVisibleStart` to only ever:
1. try `_tryExtendReplayMasterFromParent({ lite: true })` (contiguous, local, no network), else
2. call `_mcRequestOwnerFetch({ direction:'backward', reason:'viewport-sync' })` for
   same-pair panels, or the panel's own `_scheduleReplayPanLoadLeft()` ONLY for
   independent pairs (their owner is themselves).

i.e. the viewport handler may *request* data through the one official channel but never
directly invoke loaders that mutate cursors synchronously mid-message.

**Acceptance criteria:** S2 host-led drag: follower panels never fetch and never call
loaders directly (add temp diagnostic assert while testing); no new "VISIBLE-RANGE LEAK"
console errors; drawings/crosshair sync unaffected.
**Kill-switch:** `window.__TALARIA_MC_DISABLE_PURE_SYNC_BRIDGE = true`.

---

## Task 2.4 — One TF-switch conductor (stretch, only if S6/S7 still flaky)

**Files:** `chart v 1.4/talaria-design/src/MultichartGrid.jsx`, `panel-cmd-bridge.js`.

Interval-sync TF switches are fanned out from 3 places in `MultichartGrid.jsx` (search
`__fromHostFanout`). Consolidate to ONE function `fanOutTimeframe(tf)` used by all three
triggers, which: (1) tags `__fromHostFanout:true` (preserve the existing revert-guard
contract in `panel-cmd-bridge.js` `case 'setTimeframe'`), (2) sends to panels strictly
AFTER the host's own switch commits (host data becomes the mirror source), (3) is
idempotent per tf value (drop duplicate fan-outs within 500 ms).

**Acceptance criteria:** S6: exactly one `setTimeframe` command per panel per user action
(log in panel-cmd-bridge while testing); S7 regression check still passes (panel-local TF
survives replay frames with interval sync OFF).
**Kill-switch:** `window.__TALARIA_MC_DISABLE_TF_CONDUCTOR = true`.
