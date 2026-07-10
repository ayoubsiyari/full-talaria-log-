# Phase-5 Design — Replay-Mirror-Frame Policy Consolidation

> Status: **DESIGN ONLY — not scheduled.** Preconditions (D-037/D-038): BL-10 and
> BL-11 closed + PO-confirmed, and a real quiet period (≥1–2 weeks, no new felt
> defect in this family). This document exists so that the moment the flow stops,
> implementation can start immediately instead of spending the quiet period
> writing the design. Prepared by the manager per the D-038 ledger instruction.
> Owner at implementation time: one worker, gated end-to-end by the harness gate.

## 1. Why consolidate

Every defect in one specific family has been fixed with an individually-correct,
kill-switchable guard. As of D-040 the family has **13 cases**:

| # | Case | Kill-switch | One-line behaviour it patches |
|---|---|---|---|
| 1 | B-FIX-F | `__TALARIA_MC_DISABLE_PANEL_MIRROR_UNSETTLED_HOST` | hold panel mirror while host unsettled |
| 2 | B-FIX-G | `__TALARIA_MC_DISABLE_PANEL_SETTLED_RESYNC` | host settled re-broadcast + panel dedup bypass |
| 3 | B-FIX-I | `__TALARIA_MC_DISABLE_PANEL_SETTLED_SELFHEAL` | panel self-heal after host settles |
| 4 | B-FIX-J | `__TALARIA_MC_DISABLE_PANEL_HOSTSWITCH_QUIET` | suppress viewport empty-recovery during host switch |
| 5 | BL-5 | `__TALARIA_MC_DISABLE_COARSE_PANEL_HOSTSWITCH_SEEK` | skip coalesced seek for **paused coarse** panel on host TF switch |
| 6 | BL-6 | `__TALARIA_MC_DISABLE_COARSE_PANEL_HOSTSWITCH_VIEWPORT_RECENTER` | one-shot offsetX recenter after the BL-5 skip |
| 7 | BL-8 | `__TALARIA_MC_DISABLE_PAUSED_REPLAY_ALIGNED_SEEK_GUARD` | skip same-ts paused tick during peer TF switch |
| 8 | BL-9 | `__TALARIA_MC_DISABLE_PANEL_PAN_HISTORY_CONTINUE` | continue paused pan-history load past gesture end |
| 9 | BL-9-play | (narrowed BL-9 scope) | make the BL-9 continuation **paused-only** |
| 10 | BL-10 | `__TALARIA_MC_DISABLE_COARSE_PANEL_PLAY_ADVANCE` | advance **playing coarse** panel playhead + forming candle |
| 11 | BL-11 | `__TALARIA_MC_DISABLE_PANEL_PLAY_VIEWPORT_FOLLOW` | **playing** panel viewport follows the playhead |
| 12 | BL-12 | `__TALARIA_MC_DISABLE_PLAY_FOLLOW_COST_GUARD` | **cost** of BL-11 follow: suspend during user drag, coalesce render |
| 13 | BL-13 | `__TALARIA_MC_DISABLE_PLAY_FOLLOW_COST_GUARD` *(same flag; in progress)* | **threshold unit** of BL-12 coalesce: device-pixel column, not candle-width (smoothness) |

Also adjacent (price-axis dimension of the same frame): **BL-2b**
`__TALARIA_MC_DISABLE_PANEL_PRICE_INDEPENDENCE`.

**The single root (Director D-035):** a replay-mirror frame broadcast host→panel
carries **three coupled payloads** at once —

1. **DATA** — which bars/master the panel should hold (and whose master owns it);
2. **X-VIEWPORT** — time offset / scroll (follow the playhead vs preserve window);
3. **Y-PRICE** — price scale / domain.

…and each panel must **selectively adopt or ignore** each payload depending on a
3-way context. Today that selection is implemented as scattered `if` branches
across `applyReplayFrame`, `scheduleCoalescedSeek`, `replayTick`, and their
guards. Each new combination (relationship × state × sync) that lacked a branch
produced a new BL-N. BL-6 fell out of BL-5, BL-9-play out of BL-9, BL-11 out of
BL-10, **BL-12 out of BL-11, BL-13 out of BL-12** — all **"missing complement"**
errors: a guard handled one mode and silently did the wrong thing in the adjacent
mode. In fact **BL-11 → BL-12 → BL-13 are one feature** — *panel viewport follow
during play* — being specified cell-by-cell through production reopens (D-038 →
D-039 → D-040). That is the sharpest argument for Phase-5: a single feature should
be specified once, completely, not discovered one reopen at a time. Its complete
column is written out in **§3a** so it stops leaking.

**BL-12/BL-13 add two more lessons:**
- **(D-039) cost is a first-class cell property.** BL-11 correctly made playing
  panels follow the playhead, but with an unconditional per-frame recenter+render —
  right behaviour, wrong cost, regressing drag smoothness. The D-035 rule is
  extended: **any fix that adds per-frame work must state render/work cost per
  cell, not just behaviour** → the policy table needs a **cost column** (§3).
- **(D-040) numeric thresholds carry exactly one unit.** D-039's fix direction
  said "≥1 candle-width" and "same pixel column = zero renders" in one sentence —
  two different units (a candle spans many device pixels when zoomed in). The
  coarser reading shipped and playback went chunky. Corrected to **device-pixel
  column**. Standing rule: a spec threshold gets **one unit**, and a worker handed a
  two-unit threshold **bounces it back** rather than guessing → the policy table
  needs a **threshold-unit column** (§3a).
- **(D-041) verify the data source can express the smoothness bar BEFORE tuning.**
  The device-pixel threshold turned out to be a no-op because the follow target
  (`getReplayAutoScrollState().offsetX`) is **bar-quantized** — it only moves once
  per formed candle, so no pixel-level threshold could add smoothness. Real
  smoothness required a new mechanism: a **continuous, timestamp-derived eased
  leading-edge offset**. Standing rule: when a spec sets a smoothness/precision bar,
  the diagnosis first checks the data source can *express* it (one read of the
  source would have collapsed BL-13 and the D-041 re-ruling into a single step).

Consolidation replaces the scattered branches with **one explicit policy table**
that is total over the context space — so a missing cell is impossible by
construction (every cell has an entry, even if the entry is "no-op").

## 2. The context space (three orthogonal axes)

**Axis A — panel relationship to host:**
- `SAME_TF` (same pair, same timeframe as host)
- `COARSER` (same pair, panel TF > host TF, not a finer self-owner)
- `FINER_SELFOWN` (same pair, panel TF < host TF, `_multichartFinerSamePairPanelSelfOwns()` true)
- `INDEPENDENT` (different pair — owns its own data/replay master)
- `HOST` (tile A itself — never mirrors; the source of truth)

**Axis B — replay/interaction state:**
- `IDLE` (no active replay)
- `PAUSED` (replay active, not playing, playhead stationary)
- `SCRUB` (paused, user dragging the playhead)
- `PLAYING` (replay advancing forward)
- `USER_PANNED_AWAY` (playing, but this panel was dragged off the leading edge — the drag-disengage state introduced by D-038)

**Axis C — sync flags (independent toggles):**
- data-share (`_multichartSamePairDataShareActive`)
- interval-sync (`_mcIntervalSyncOn`)
- visible-range-sync (`_multichartVisibleRangeSyncOn`)

The policy is primarily keyed on **A × B**; **C** modulates the X-VIEWPORT and DATA
columns only (never Y-PRICE — price independence is unconditional per BL-2b).

## 3. The policy table (target design)

For each `(relationship, state)` the panel resolves a **MirrorPolicy**:

```
MirrorPolicy = {
  data:   'ADOPT_HOST' | 'MIRROR_HOST_MASTER' | 'SELF_OWN' | 'HOLD',
  xView:  'FOLLOW_PLAYHEAD' | 'PRESERVE_WINDOW' | 'RECENTER_ONCE' | 'IGNORE',
  yPrice: 'INDEPENDENT',          // always — BL-2b, non-negotiable
  seek:   'COALESCED' | 'FORCE' | 'NONE',
  // COST column (D-039): every cell declares its per-frame render budget, not
  // just behaviour. A cell that adopts a payload must also say WHEN it may repaint.
  render: 'ON_MOVE_GE_1_PIXEL_COLUMN'  // coalesce: repaint only when the viewport moves into a
                                  //   new device-pixel column (sub-pixel advance = 0 renders) — D-040 unit
        | 'SUSPEND_DURING_INTERACTION'  // no per-frame work on a panel the user is dragging
        | 'EVERY_FRAME'           // legacy/host cadence — must be justified, never a default
        | 'NONE',
}
```

The `render` field is the D-039/D-040 lesson made structural: BL-11's cell was
`xView:FOLLOW_PLAYHEAD` with an implicit `render:EVERY_FRAME` (cost regression,
BL-12); BL-12's first coalesce used the wrong **unit** (candle-width → chunky,
BL-13). The settled cell is `render:ON_MOVE_GE_1_PIXEL_COLUMN` for a scrolling
panel and `SUSPEND_DURING_INTERACTION` while it is being dragged. Every cell
carries an explicit **threshold unit** (here: 1 device pixel), and cells are
verified by the gate on **deterministic render counters** — `renders ≈
pixel-columns-crossed ± constant`, `0` for sub-pixel/idle — never wall-clock
frame-time (D-039 anti-flake rule).

Draft resolution (the authoritative table is finalized at implementation time
against the then-current gate; cells marked ⟶BL cite the case that established
the behaviour):

| relationship \ state | IDLE | PAUSED | SCRUB | PLAYING | USER_PANNED_AWAY |
|---|---|---|---|---|---|
| **SAME_TF** | HOLD / IGNORE | MIRROR / PRESERVE / COALESCED | MIRROR / PRESERVE / COALESCED (⟶BL-8 skip if aligned) | MIRROR / **FOLLOW** / COALESCED (⟶BL-11) | MIRROR / **PRESERVE** / COALESCED (⟶BL-11 disengage) |
| **COARSER** | HOLD / IGNORE | MIRROR / PRESERVE / **NONE** (⟶BL-5 skip; ⟶BL-6 RECENTER_ONCE on host-switch park) | MIRROR / PRESERVE / NONE | MIRROR / **FOLLOW** / **COALESCED** (⟶BL-10 advance; ⟶BL-11 follow) | MIRROR / PRESERVE / COALESCED (⟶BL-11 disengage) |
| **FINER_SELFOWN** | SELF_OWN / IGNORE | SELF_OWN / PRESERVE / FORCE | SELF_OWN / PRESERVE / FORCE | SELF_OWN / FOLLOW / **FORCE** (unchanged catch-up) | SELF_OWN / PRESERVE / FORCE |
| **INDEPENDENT** | SELF_OWN | SELF_OWN (own master; ⟶BL-9 pan continuation paused-only) | SELF_OWN | SELF_OWN / FOLLOW (own engine) | SELF_OWN / PRESERVE |
| **HOST** | — source of truth; never resolves a mirror policy — | | | | |

Notes embedded in the table:
- **B-FIX-F/G/I/J** collapse into the DATA column transitions (HOLD → MIRROR as
  the host settles, plus the settled self-heal / quiet-recovery which become
  explicit DATA/xView entries rather than side-effect timers).
- **BL-9 / BL-9-play** become the INDEPENDENT/COARSER `PAUSED` DATA-continuation
  rule with an explicit `PLAYING ⇒ no backward continuation` cell (the complement
  that was missing).
- **Y-PRICE = INDEPENDENT everywhere** — BL-2b is lifted out of the branch logic
  into an invariant the table cannot override.

## 3a. The panel-viewport-follow column — COMPLETE (per D-040)

This is the one feature that BL-11/12/13 specified cell-by-cell. Written out fully
here — **behaviour + cost + threshold unit per cell** — so the column is closed and
never reopens for a missed cell. This is exactly the shape every Phase-5 policy
cell must eventually carry.

Feature: *how an iframe panel's TIME (X) viewport tracks the replay playhead.*
Y-price is out of scope (BL-2b = INDEPENDENT, always). Applies to same-pair panels
(SAME_TF / COARSER); FINER_SELFOWN and INDEPENDENT run their own engine follow.

| State | Behaviour | Cost (renders) | Threshold unit | Case / kill-switch |
|---|---|---|---|---|
| **IDLE (no replay)** | no follow | 0 | — | n/a |
| **PAUSED** | no follow; window preserved | 0 (no per-frame work) | — | BL-11 (play-only gate) |
| **SCRUB (paused, user scrubbing)** | no auto-follow; user owns viewport | 0 follow renders (scrub renders are the user's) | — | BL-11 / BL-8 aligned-guard |
| **PLAYING, steady (within a forming bar)** | **continuous eased leading-edge scroll**: offset = quantized − `fraction·candleSpacing`, `fraction = (replayTs − formingBarStartTs)/barDurationMs`, **derived from the shared playhead timestamp, never wall-clock**; repaint on each new device-pixel column | ≈ **pixel-columns crossed** (host-parity smooth) | **1 device pixel**; fraction in **timestamp** units | BL-13 / D-041 (continuity) |
| **PLAYING, sub-pixel / same-pixel-column advance** | eased offset updates but **no render** | **0** (coalesced) | 1 device pixel | BL-12 coalesce + BL-13 unit |
| **PLAYING, bar-boundary seam (forming bar completes → new opens)** | offset advances **monotonically** across the seam — no rewind / jitter / double-count | (continuous with steady cell) | timestamp-derived, so seam is continuous by construction | BL-13 / D-041 (monotonicity) |
| **PAUSE mid-bar** | fractional offset **frozen exactly** (no snap to bar boundary) — falls out of timestamp derivation (ts frozen ⇒ offset frozen) | 0 | timestamp | BL-13 / D-041 |
| **PLAYING, user actively dragging/panning/zooming this panel** | follow **suspended** for this panel (user has opted out until back at edge) | **0** follow renders on this panel | — (binary: interacting?) | BL-12 part (a) + BL-11 drag-disengage (D-038) |
| **PLAYING, user has panned away from leading edge (not currently dragging)** | no snap-back; follow stays disengaged until panel returns to the edge | 0 follow renders | leading-edge test | BL-11 (D-038 drag-disengage parity) |
| **COARSER panel, PLAYING** | advance playhead + forming candle (coalesced seek) THEN follow per rows above | seek: BL-10 coalesced; follow: as above | seek: coalesced rAF; follow: 1 device pixel | BL-10 advance + BL-11/12/13 follow |
| **HOST (tile A)** | source of truth; renders every frame (its own contract, copied — not modified) | host cadence | — | unchanged |

Verification contract for the whole column (all deterministic counters, never
wall-clock — D-039): `renders ≈ pixelColumnsCrossed ± small constant` while
scrolling; `renders == 0` for sub-pixel/idle/paused/suspended cells. Under Phase-5
this entire table collapses to a single resolver output `{xView:'FOLLOW_PLAYHEAD',
render:'ON_MOVE_GE_1_PIXEL_COLUMN' | 'SUSPEND_DURING_INTERACTION'}` keyed on state,
retiring BL-11/12/13's three scattered code sites and their shared flag.

## 4. Proposed shape

- One pure resolver: `_multichartResolveMirrorPolicy(ch, frame) → MirrorPolicy`,
  keyed on Axis A (relationship helpers already exist:
  `_multichartFinerSamePairPanelSelfOwns`, same-pair/TF checks) and Axis B
  (replay state + a new leading-edge/`USER_PANNED_AWAY` predicate that copies the
  host's disengage contract), modulated by Axis C.
- Three thin appliers consume the policy: `applyData(policy)`,
  `applyXViewport(policy)`, `applyYPrice()` (fixed = independent). The existing
  `applyReplayFrame` / `scheduleCoalescedSeek` / `replayTick` entry points call
  the resolver once and dispatch — no bespoke per-case branches remain.
- The scattered kill-switches are **retired** and replaced by a single master
  `__TALARIA_MC_DISABLE_MIRROR_POLICY_TABLE` (fix ON) that falls back to the
  pre-Phase-5 behaviour during the parity window, then removed once green.

## 5. Migration plan (gated, reversible)

1. Land the resolver + appliers **behind the master kill-switch OFF by default**
   (table inert) — pure addition, zero behaviour change; gate must stay 15/15.
2. Flip the master switch ON in the harness only; prove **cell-by-cell parity**:
   every existing H-S scenario (H-S2…H-S18) stays GREEN with the table driving.
   Any diff is a table bug, fixed before proceeding.
3. Flip default ON in the engine; keep the old paths one release behind the
   master switch for rollback.
4. Retire the individual guards **one per commit**, each proven no-op by the gate
   (the scenario that pinned that guard must stay GREEN with the guard deleted and
   the table in force). This is where the 11 scattered flags disappear.
5. Remove the master switch and the dead old paths once a release is confirmed.

## 6. Invariants preserved / risks

- **I11 (live-verified mechanism)** and the **gate** are the safety net: no cell
  is retired without its scenario proving parity. The gate growing to 17 scenarios
  (9→17 across this family) is exactly what makes this refactor safe.
- **BL-2b price independence** becomes an invariant, not a branch — hardest to
  regress, easiest to assert.
- **Biggest risk:** the resolver is only as correct as the table, and the table is
  only as complete as the scenarios. Mitigation: the table is **total** (every A×B
  cell has an explicit entry, including no-ops), and step 2 forces cell-by-cell
  parity before any retirement.
- **Non-goal:** no new user-facing behaviour. Phase-5 is pure consolidation; if it
  changes any felt behaviour, that is a bug in the migration, not a feature.

## 7. Preconditions checklist (do not start until all true)

- [x] BL-10 PO-confirmed on live build (b87) + independently verified.
- [x] BL-11 fix landed + gate green (b88/b89) + PO-confirmed live (b89).
- [x] BL-12 fix landed + gate green (b90). *(Superseded in part by BL-13 — the coalesce unit was wrong; see below.)*
- [ ] BL-13 closed (device-pixel-column threshold; fix landed, gate green, PO-confirmed = "panel playback scrolls as smoothly as the host's").
- [ ] Quiet period holds: ≥1–2 weeks with no new replay-mirror-frame family defect. **Clock reset at D-040 (BL-13).**
- [ ] Gate stable and green across the full scenario set at the start of the window.
