# Phase-5 Design — Replay-Mirror-Frame Policy Consolidation

> Status: **DESIGN ONLY — not scheduled.** Preconditions (D-037/D-038): BL-10 and
> BL-11 closed + PO-confirmed, and a real quiet period (≥1–2 weeks, no new felt
> defect in this family). This document exists so that the moment the flow stops,
> implementation can start immediately instead of spending the quiet period
> writing the design. Prepared by the manager per the D-038 ledger instruction.
> Owner at implementation time: one worker, gated end-to-end by the harness gate.

## 1. Why consolidate

Every defect in one specific family has been fixed with an individually-correct,
kill-switchable guard. As of D-038 the family has **11 cases**:

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
| 11 | BL-11 | `__TALARIA_MC_DISABLE_PANEL_PLAY_VIEWPORT_FOLLOW` *(in progress)* | **playing** panel viewport follows the playhead |

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
BL-10 — all **"missing complement"** errors: a guard handled one mode and silently
did the wrong thing in the adjacent mode.

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
}
```

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

- [ ] BL-10 PO-confirmed on live build (✅ reported on b87 — pending independent-verification pass).
- [ ] BL-11 closed (fix landed, gate green, PO-confirmed).
- [ ] Quiet period holds: ≥1–2 weeks with no new replay-mirror-frame family defect.
- [ ] Gate stable and green across the full scenario set at the start of the window.
