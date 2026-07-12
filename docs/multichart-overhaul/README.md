# Multichart Overhaul — Director Plan

> **Audience:** the "manager" agent. Read this file first, then `INVARIANTS.md`, then the
> phase files in order. Feed workers ONE task at a time, in the order defined here.
> **Written:** 2026-07-04. **Status update:** Phase 4 is complete and the multichart overhaul was
> **RELEASED / CLOSED on `20260707b105`** (authoritative closure: Director **D-048**). Testers are no
> longer paused — the overhaul has shipped.

---

## 1. Why we are in a bug loop (root-cause analysis)

The multichart is 1 host chart (tile A, the page's own `window.chart`) plus N iframe panels,
each running the **entire** chart engine (`chart.js`), stitched together with postMessage
bridges (`sync-bridge.js`, `panel-cmd-bridge.js`, `multichart-manager.js`,
`engine-api-guards.js`). The individual bugs testers keep finding (lag, rendering glitches,
desync, one fix breaking another) are all downstream of **five structural causes**:

| # | Root cause | Concrete evidence in code |
|---|-----------|---------------------------|
| RC1 | **Distributed data ownership.** 6+ independent code paths can fetch bars for the SAME file: `checkViewportLoadMore`, `loadFileData` tiers, `_refetchBacktestTimeframeCore`, `ensureReplayDataCoversTimestamp`, `_fillVisibleWindowAfterZoomOut`, `_delegateSamePairPanLoadToHost`, plus per-panel copies of all of these. Any two racing produce duplicate fetches, seams, or desync. | `chart.js` |
| RC2 | **Poll-and-mutate synchronization.** Panels poll the host per animation frame (`_scheduleMultichartHostMasterSyncPoll`) and mutate their own arrays when they notice a change. Outcome depends on timing → bugs are non-deterministic → fixing one timing changes another → whack-a-mole. | `chart.js` |
| RC3 | **Mixed responsibilities in the bridges.** `sync-bridge.js` both mirrors viewports AND triggers data loads (`ensureHistoryForVisibleStart`). A viewport message can cause a fetch; a fetch can cause a viewport echo. Cycles like this are why closing one ticket opens another. | `sync-bridge.js` |
| RC4 | **Deferred work at gesture end.** New history arriving mid-drag is parked (`_multichartPendingMasterResample`) until mouse-up, so panels visibly lag behind the main chart, and the big deferred reslice causes the "pop" testers report as a rendering glitch. | `chart.js` |
| RC5 | **No automated regression harness.** Every fix is verified only by human testers on the live deploy. Nothing prevents a fix from silently breaking an adjacent scenario. | — |

**The root solution is NOT more spot fixes.** It is: (a) enforce a small set of architectural
invariants that make whole bug classes impossible, and (b) build an automated harness so no
change ships without proving the core scenarios still pass.

## 2. Design principles (proven, keep them)

These were validated empirically (a TradingView-style reference prototype passed 17/17
automated scenario tests with this design):

1. **One data owner per file.** For any `fileId`, exactly one chart instance talks to the
   network. Everyone else is a read-only consumer. N panels panning together = 1 fetch.
2. **Extend only from the loaded edge.** A consumer/owner only ever grows its bar array
   contiguously (prepend strictly-older, append strictly-newer, from the exact edge).
   Merging non-adjacent windows is forbidden — it corrupts cursors and creates gaps.
   (This exact mistake was made and reverted earlier; see `INVARIANTS.md` I2.)
3. **Data flows by event, not by poll.** Owner merges → emits one "extended" notification →
   consumers re-slice once. Deterministic order, same result every run.
4. **Viewport and data are separate channels.** A message mutates one or the other, never both.
5. **Repaint during the gesture, throttled.** Small frequent updates beat one big deferred one.

## 3. Phases (strict order, each gated)

| Phase | File | Goal | Gate to next phase |
|-------|------|------|--------------------|
| 0 | `PHASE-0-baseline.md` | Instrumentation + scenario matrix + baseline measurements. **No behavior changes.** | Diagnostics deployed; baseline numbers recorded for every scenario in the matrix. |
| 1 | `PHASE-1-data-ownership.md` | Single data owner per file; panels stop fetching what the host owns. | Scenario matrix: same-pair scenarios show exactly 1 fetch per user action; zero seams. |
| 2 | `PHASE-2-event-sync.md` | Replace rAF polling with the existing extend-broadcast event; mid-drag throttled repaint; remove fetch side-effects from sync-bridge. | Drag-left fills while dragging in all sync modes; no snap/pop at mouse-up. |
| 3 | `PHASE-3-render-budget.md` | Cap follower render work during interaction bursts. | No dropped-frame regression vs Phase 2 baseline; single-chart render identical. |
| 4 | `PHASE-4-regression-harness.md` | Automated headless-browser harness running the REAL engine + bridges. | Harness green on all scenarios; testers resume with the matrix as their script. |

Phases 1–3 each contain small, independently shippable worker tasks. **Never run tasks from
two phases in parallel.** Never start a phase until the previous phase's gate is confirmed
with instrumentation numbers (not feelings).

## 4. Protocol for the manager (how to feed workers)

Every worker prompt MUST contain, verbatim:

1. The full text of `INVARIANTS.md`.
2. The single task section from the phase file (goal, files, steps, acceptance criteria).
3. This instruction: *"Change ONLY what the task specifies. If the fix seems to require
   touching anything outside the listed files/functions, STOP and report back instead of
   improvising."*

Every worker report MUST contain:

- Diff summary (files + functions touched).
- Proof both engine copies are identical: `Get-FileHash` (or `md5sum`) of
  `chart v 1.4/chart/chart.js` **and** `homepage/public/chart/chart.js` — same hash.
- `node --check` output for every touched `.js` file.
- Before/after numbers from the Phase-0 diagnostics for the scenarios the task lists.
- The kill-switch flag name that disables the change at runtime.

**Manager rejection rules** — reject the work (do not merge) if the report:
- touches functions not listed in the task,
- changes single-chart behavior (any diagnostic delta in the single-chart scenarios),
- lacks the both-copies hash proof,
- lacks a kill-switch, or
- "fixes" a failure by weakening a guard, a rate limit, or the field allowlist.

## 5. What must never break (protected surface)

The following work today and are NOT to be regressed by any task. Single-chart mode is the
reference implementation — multichart changes must be gated so single-chart code paths are
byte-identical in behavior:

- Single-chart pan/zoom/backfill (`checkViewportLoadMore`, `_scheduleReplayPanLoadLeft`,
  `_fillVisibleWindowAfterZoomOut`) — untouched semantics when not a multichart panel.
- Replay playback (playhead advance, tick animation, forward prefetch).
- Drawings, indicators, orders, session save/restore.
- Independent-pair panels (deliberately different symbol per panel) — including the hybrid
  master design (native-TF backfill in front of a 1m core).
- The field allowlist in `engine-api-guards.js` (price-axis isolation) — see security rules.
- The timeframe-switch fast-path waterfall and its coverage gate.

## 6. Repository ground rules (workers must know)

- Engine files exist **twice** and must stay byte-identical:
  canonical `chart v 1.4/chart/...` and served mirror `homepage/public/chart/...`.
- `MultichartGrid.jsx` lives only in `chart v 1.4/talaria-design/src/` (vite-bundled).
- Deploys are Docker: a "1.7s" build is a cache hit shipping OLD code. Verify server HEAD.
- Line numbers in these docs drift — locate code by FUNCTION NAME, not line number.
