# WORKER PROMPT — T4 step 1 (Lane 3): Order-entry pure-function aggregate model

> Hand this whole file to the Lane 3 (orders) worker. Lane 3 is fully independent (`order-manager.js`) — no collision with other lanes.

---

## ROLE
Worker on Talaria **tickets-overhaul (Plan 2)**, task **T4 step 1**, Lane 3. Fully independent module.

## READ FIRST (binding)
- `docs/tickets-overhaul/README.md`
- `docs/tickets-overhaul/ROOT-CAUSES.md` — **RC-5** (your RC).
- `docs/tickets-overhaul/INVARIANTS.md` — binding; key ones below.
- `docs/tickets-overhaul/TRACKS.md` — **T4**.

## BINDING INVARIANTS
- **I1** — discharges **RC-5** (order-entry state model).
- **I2 RED first** — write the property tests FIRST; they must FAIL on current delta-mutated code (RED), PASS after your recompute-from-entries model (GREEN), and FAIL again with the kill-switch (RED).
- **I3 One gated change** — one mechanism (aggregates = pure function of entries), one kill-switch. The display-threshold bugs (SL/TP <10 not rendered; trailing-zero parsing) are **separate** gated fixes in a later step — do NOT bundle them here.
- **I5 State matrix** — if any change touches shared/replay-visible state, enumerate cells (single/multichart, replay playing/paused/off) and mark which change. The core aggregate recompute is math-only; if it stays out of the replay bus, say so explicitly.
- **I8 Both engine trees byte-identical** — mirror `chart v 1.4/chart/.../order-manager.js` edits to `homepage/public/chart/.../order-manager.js`; report SHA256 of the pair. Bump build id per the plan-1 procedure (`bump-dist-v9-cache.mjs`).
- **I10 Security** — no weakening; no new deps without Manager approval + registry verification. (Prefer a zero-dependency Node property-test harness; if you want a property-testing lib, request approval first.)
- **P1 No self-cert** — Manager re-runs your tests.
- **P2** — if you discover the premise is wrong (aggregates are already recomputed from entries), STOP and report; do not force a green.

## TASK (RED-first: property tests, then gated pure-function model)
RC-5 mechanism: derived values (average entry, total risk, PNL sign, order type) are mutated by **deltas** instead of recomputed from the entry list, so unanticipated add/move/delete sequences leave stale aggregates. Evidence (from RC-5): math itself is sound (`order-manager.js:18332`, `:38143`); the defect is incremental aggregate state.

1. **Locate** the multi-entry aggregate state and every site that mutates `average`, `total risk / risk split`, `PNL`, and `order type` incrementally.
2. **Write property tests (RED)** — Node-side, no browser. Over randomized add/move/delete sequences, assert the invariants that the tickets (TAL-00752) violate:
   - average entry price is always within [min entry, max entry];
   - risk split always sums to the configured total (deleting one extra entry restores 100% to the remainder → single-entry state);
   - order **type never mutates** on move (limit stays limit when dragged — TAL-00752);
   - PNL sign is correct relative to entry side (no positive PNL below a long entry).
   Confirm these FAIL on current code and capture the failing sequences.
3. **Implement** `computeAggregates(entries[])` as a **pure function**, called on every mutation (add/move/delete), replacing the delta updates. Gate behind `window.__TALARIA_DISABLE_ORDER_AGGREGATES_V2` (default unset = fix ON; set = legacy delta behavior).
4. Re-run property tests: GREEN with fix ON, RED with the kill-switch set (proves non-vacuous).

## RC / FAMILY / ROWS
- **RC:** RC-5 | **Family:** order-entry | **Registry rows:** TAL-00752 sub-bugs for averaging / risk-split / type-mutation / PNL-sign (the display-threshold + parsing rows are a later gated task, not this one).

## KILL-SWITCH
- `window.__TALARIA_DISABLE_ORDER_AGGREGATES_V2` (default ON = recompute-from-entries active).

## DELIVER (report back to the PO as a `.md`)
1. The list of aggregate-mutation sites found (file:line).
2. The property-test file + RED evidence (failing randomized sequences) before the fix.
3. The `computeAggregates` diff, GREEN evidence after, and RED-again evidence with the kill-switch set.
4. State matrix (I5): confirm whether the change touches the replay bus; if not, state it explicitly.
5. Both `order-manager.js` trees SHA256-identical; build id bumped; `node --check` + lints clean.
6. Which TAL-00752 rows this closes vs which are deferred to the display-threshold task.

## STOP CONDITIONS
Premise wrong (already pure), the mechanism belongs to another RC, or a property invariant is ambiguous → STOP and report. Do NOT fix the display-threshold/parsing bugs here (separate gated task). Do NOT add a dependency without Manager approval.
