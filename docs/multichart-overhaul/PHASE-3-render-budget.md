# Phase 3 — Render Budget for Followers (fight the shared main thread)

**Root cause addressed:** all same-origin iframes + the parent share ONE browser main
thread. During a drag with viewport sync ON, the leader emits a `visibleRange` `panSync`
message per frame and every follower paints per frame — with a 2×2 grid that is 4 full
chart paints per frame competing with the owner's fetch/merge work. This is the
structural "laggy" root; Phase 3 caps it without changing what users see.

**Prerequisite:** Phase 2 done (data flow is event-driven; render load is now the
dominant cost, measurable via `_mcDiag.renders`).

**Gate to Phase 4:** S2/S9 renders-per-second per FOLLOWER ≤ half of leader's, with no
visible desync (followers may lag ≤ 1 frame); replay playback (S8) frame pacing
unchanged; single chart untouched.

---

## Task 3.1 — Follower half-rate paint during pan bursts

**Files:** `chart v 1.4/chart/chart.js` (+ mirror).

`_schedulePanSyncFollowRender` already coalesces follower paints to one per frame. Add a
budget: while `_isPanSyncFollowBurst()` is true AND this chart is not the gesture leader
(`!_isMultichartLocalPanLeader()`), skip every second scheduled paint (simple counter —
paint on even ticks). The final full-quality paint at burst release
(`_releasePanSyncFollowBurst`) already exists and stays — so the settled frame is always
exact.

Bind the skip to panel count: with 2 panels total, do NOT skip (budget only matters at
3+). Read the count from `window.parent.__multichartGrid` panel registry if available,
else default to skipping (4-up is the worst case).

**Acceptance criteria:** S2 with 2×2: follower `renders` ≈ leader/2 during a 5 s drag;
crosshair/pan still visually synchronous (≤1 frame behind, screen-record to confirm);
S8 replay pacing identical (guard: never skip when `_isReplayPlaybackRendering()`).
**Kill-switch:** `window.__TALARIA_MC_DISABLE_RENDER_BUDGET = true`.

---

## Task 3.2 — No indicator recalc storms on shared-data updates

**Files:** `chart v 1.4/chart/chart.js` (+ mirror).

`_syncIndicatorsAfterMultichartDataShare` already throttles to 120 ms with a trailing
pass. Verify (and fix if false) that during a continuous drag with repeated master
extends, indicator recalc runs at most ~2×/s per panel and NEVER synchronously inside the
`extendReplayMasterFromHost` handler when `lite` is set. If violations are found, route
all recalc through `_syncIndicatorsAfterMultichartDataShare` (single throttle point) —
do not add a second throttle mechanism.

**Acceptance criteria:** with 3 indicators active on every panel, S2/S3 drag smoothness
score does not degrade vs no-indicator runs by more than 1 point; `resamples` and recalc
counts stay bounded (constant per fetch, not per frame).
**Kill-switch:** covered by the existing throttle; no new flag needed.

---

## Task 3.3 — Boot reveal without the long hold (perceived speed)

**Files:** `chart v 1.4/chart/multichart-prod/multichart-manager.js` (+ mirror).

Panels currently boot at `opacity:0` and reveal together after readiness plus a
`_markBootRevealHold(900ms)` window. Reduce perceived boot latency: reveal each panel as
soon as ITS first full paint completes, but keep a short group alignment window (≤300 ms)
so panels don't pop in one-by-one over seconds. Numbers configurable at the top of the
file; do not touch the bridge-ready timeout logic.

**Acceptance criteria:** S10 time-to-4-painted improves ≥300 ms; no blank/flashing panels
(record boot 3×); drawings still render on first paint (the ResizeObserver redraw fix in
`embed-bridge.js` must remain effective).
**Kill-switch:** `window.__TALARIA_MC_DISABLE_FAST_REVEAL = true`.
