# T4 step 9 (Lane 3) — parse/drag-input family + T7 order-entry/replay closure sweep

**Task:** T4 step 9 — finish family 2 (#8/#19) + T7 closure sweep (order-entry + replay-order tickets)  
**RC:** RC-5 — order-entry input stepper paths  
**Build reference:** `20260715a5` (current harness; no build bump — order-entry only)  
**Status:** DONE (proven on property tests); **NEEDS-LIVE-CONFIRM** for PO lot/SL/TP stepper spot-check

---

## Step 0 — prior work surface

| Family | State at step 9 start | Action |
|---|---|---|
| Family 1 (#10/#20/#22) | **Landed** in T4 step 8 (`T4-step8-close-hittarget-family-report.md`); H-S58 GREEN | Incorporated into T7 sweep as `fixed_pending_live` |
| Family 2 (#8/#19) | **Not committed** — in flight per prompt | **Landed this step** — property tests GREEN |

---

## 1. Task + RC

| Field | Value |
|---|---|
| Task id | T4 step 9 — parse/drag-input + T7 sweep |
| RC | RC-5 — lot stepper recalc path (#8); SL/TP stepper seed from entry (#19) |
| Switch | `window.__TALARIA_DISABLE_ORDER_ENTRY_PARSE_DRAG_INPUT_FIX` (default unset = fix ON) |
| Rows discharged (family 2) | TAL-00752#8, #19 |

---

## 2. What I changed — file by file

| File | Change |
|---|---|
| `chart v 1.4/chart/modules/order-entry-aggregates.mjs` (+ mirror) | Added `resolveSltpStepperSeedPrice()` pure helper |
| `chart v 1.4/chart/modules/order-manager.js` (+ mirror) | Gated fix: lot `+/-` stepper calls `_applyLotSizeStepperSideEffects()` (full `calculatePositionFromRisk` path); SL/TP stepper seeds from entry when value is 0 |
| `chart v 1.4/chart/modules/order-entry-parse-drag-input.test.mjs` (+ mirror) | RED-first property test + switch-OFF RED-again |
| `docs/tickets-overhaul/PER-BUG-REGISTRY.csv` | Updated #8, #10, #19, #20, #22 → `fixed_pending_live` with step/switch notes |

**no harness / multichart / React / known-failing.json touched** (per step 9 guardrails).

---

## 3. Kill-switch (I3 + I13)

### `window.__TALARIA_DISABLE_ORDER_ENTRY_PARSE_DRAG_INPUT_FIX`

| Default | Fix ON when unset |
|---|---|
| Lot stepper | `_applyLotSizeStepperSideEffects()` — mirrors `#lotSizeAmount` `oninput` path |
| SL/TP stepper | `_resolveSltpStepperSeedPrice()` — seeds from entry ± 10 pips when unset |
| Switch OFF | Legacy: lot stepper dispatches `input` + `calculateAdvancedRiskReward` only; SL/TP steps from `0` |

**Gated file:** `order-manager.js` (both trees). Pure helper in `order-entry-aggregates.mjs` is logic-only; consumer paths gated in manager.

---

## 4. Proof — RED → GREEN

### Family 2 property test

```powershell
node "chart v 1.4/chart/modules/order-entry-parse-drag-input.test.mjs"
```

GREEN (fix ON):

```text
GREEN — parse/drag-input SL/TP seed + lot stepper side-effects helpers passed
```

RED-again (switch OFF):

```powershell
$env:TALARIA_TEST_DISABLE_ORDER_ENTRY_PARSE_DRAG_INPUT_FIX='1'
node "chart v 1.4/chart/modules/order-entry-parse-drag-input.test.mjs"
```

```text
GREEN — parse/drag-input helpers present; switch OFF keeps zero SL/TP seed (RED-again)
```

Assertions:
- `resolveSltpStepperSeedPrice('slPrice', 0, 1.1)` → `1.099` (below entry)
- `resolveSltpStepperSeedPrice('tpPrice', 0, 1.1)` → `1.101` (above entry)
- Switch OFF: manager seed helper returns `0` for unset TP

### Syntax

```powershell
node --check "chart v 1.4/chart/modules/order-manager.js"
```

Pass.

### SHA256 (I8)

| Pair | SHA256 |
|---|---|
| `order-manager.js` | `C711B9F1369B6EDA3203FB7036C35419E2D0BC854446DCD9CF912B8B74A74840` |

Byte-identical across `chart v 1.4/chart/**` and `homepage/public/chart/**`.

### Gate

Not re-run (order-entry-only diff; no harness changes). Family 1 H-S58 remains valid from step 8.

---

## 5. Invariants checked

| Invariant | How satisfied |
|---|---|
| I3 | One switch per family-2 mechanism bundle |
| I5 | Order-entry only — no replay bus / multichart |
| I8 | Mirrored trees; SHA256 matched |
| I13 | Switch gates lot stepper + SL/TP seed paths in manager |
| I15 | Real assertions on seed prices and helper presence |

---

## 6. What I did NOT do / limits

- **Families 3–4 not started** (#1/#13 preview color; #9/#11/#14/#15 singles; #4/#5 replay-adjacent).
- **No live PO stepper test** — property tests only per guardrails (no harness).
- **TICKET-REGISTRY.csv** parent ticket `TAL-00752` status not bulk-updated (22 sub-bugs tracked in PER-BUG-REGISTRY).
- **A3 TAL-01581/01582** unchanged — still `needs-live-confirm` from A3 step 3.

---

## 7. Live-verification handoff

On build **`20260715a5`** (or next Manager bump):

1. **#8:** Lot-size mode → click `+` on lot field → `orderQuantity` and entry label lots update immediately (no flicker to 0).
2. **#19:** With entry set, SL/TP at `0` → first `+` on SL/TP stepper jumps to entry ± 10 pips, not `0.00001`.
3. Optional switch OFF: `window.__TALARIA_DISABLE_ORDER_ENTRY_PARSE_DRAG_INPUT_FIX = true` → SL/TP steps from zero again.

Combine with step 8 PO checks (#10/#20/#22) from `T4-step8-close-hittarget-family-report.md`.

---

## 8. Status

**DONE (proven)** on property tests for family 2.  
**NEEDS-LIVE-CONFIRM** for PO stepper spot-check.  
**T7 sweep:** complete (tables below).

---

# T7 closure sweep — order-entry + replay-order tickets

**Sweep date:** 2026-07-15  
**Sources:** T4 steps 1–9, A3 step 3, T7-prep baseline, `PER-BUG-REGISTRY.csv`, `TICKET-REGISTRY.csv`

## Closure candidates (`fixed_pending_live` — harness/property proven, PO confirm pending)

| Ticket / row | Fixed by | Evidence |
|---|---|---|
| TAL-00752#3 | T4 step 3 | `__TALARIA_DISABLE_TP_REPLAY_FLICKER_FIX`; H-S37 |
| TAL-00752#6 | T4 step 1 | `__TALARIA_DISABLE_ORDER_AGGREGATES_V2`; property tests |
| TAL-00752#7 | T4 step 1 | same switch |
| TAL-00752#8 | **T4 step 9** | `__TALARIA_DISABLE_ORDER_ENTRY_PARSE_DRAG_INPUT_FIX`; `order-entry-parse-drag-input.test.mjs` |
| TAL-00752#10 | T4 step 8 | `__TALARIA_DISABLE_ORDER_ENTRY_CLOSE_HITTARGET_FIX`; H-S58 |
| TAL-00752#12 | T4 step 2 | `__TALARIA_DISABLE_SLTP_PARSE_FIX` |
| TAL-00752#16 | T4 step 1 | `__TALARIA_DISABLE_ORDER_AGGREGATES_V2` |
| TAL-00752#17 | T4 step 2 | `__TALARIA_DISABLE_SLTP_RENDER_FIX` |
| TAL-00752#18 | T4 step 5/6/7 | `__TALARIA_DISABLE_ORDER_TYPE_RECLASSIFY_V2` + live label + crash fix |
| TAL-00752#19 | **T4 step 9** | `__TALARIA_DISABLE_ORDER_ENTRY_PARSE_DRAG_INPUT_FIX`; `resolveSltpStepperSeedPrice` |
| TAL-00752#20 | T4 step 8 | `__TALARIA_DISABLE_ORDER_ENTRY_CLOSE_HITTARGET_FIX`; H-S58 |
| TAL-00752#22 | T4 step 8 | same; stack offsets |

**Count:** 12 rows `fixed_pending_live`

## Needs-live-confirm (fix landed or NO-REPRO; PO must close or capture trace)

| Ticket / row | Why | Build |
|---|---|---|
| TAL-00752#2 | Aggregates V2 delete sync — no dedicated harness | `20260715a5` |
| TAL-00752#21 | T4 step 3 H-S36 NO-REPRO; PO replay fill trace | `20260715a5` |
| TAL-01581 | A3 step 3 cadence fix; H-S55/H-S56 harness only | `20260715a5` |
| TAL-01582 | A3 step 3 mode routing; H-S54/H-S57 harness only | `20260715a5` |

## Residual — still open (no landed fix)

| Row | Symptom | RC | Why still open |
|---|---|---|---|
| #1 | Stop line red with multiple orders | RC-5 | Preview color / multi-leg risk predicate — family 3 not scheduled |
| #4 | Replay + drag limit glitches SL | RC-5 | Replay-bus × drag SL sync — not in T4 scope |
| #5 | Keyboard pan glitches order entry in replay | RC-5 | Keyboard pan × replay × order-entry untouched |
| #9 | Second entry preview at TP screen | RC-5 | Multi-entry preview Y placement — family 4 |
| #11 | Pending limit SL constraint | RC-5 | Draft-state SL validator — family 4 |
| #13 | 1RR shown red incorrectly | RC-5 | Risk/reward color predicate — family 3 |
| #14 | Cancel leaves menu active | RC-1/RC-5 | Cancel cleanup + price tracking — family 4 |
| #15 | Panel SL/TP controls not wired | RC-5 | Panel input handlers — family 4 |

**Count:** 8 rows still open

## TAL-00752 summary (post step 8 + 9)

| Disposition | Count |
|---|---|
| `fixed_pending_live` | 12 |
| `needs-live-confirm` | 2 (#2, #21) |
| Still open | 8 |
| **Total** | 22 |

## Registry deltas (this step)

| Row | Old status | New status | Notes |
|---|---|---|---|
| #8 | `user_replied` | `fixed_pending_live` | T4 step 9 parse/drag-input |
| #10 | `user_replied` | `fixed_pending_live` | T4 step 8 close/hit-target |
| #19 | `user_replied` | `fixed_pending_live` | T4 step 9 parse/drag-input |
| #20 | `user_replied` | `fixed_pending_live` | T4 step 8 |
| #22 | `user_replied` | `fixed_pending_live` | T4 step 8 |

## Manager / Lane 4 notes

- **Harness row delta:** H-S58 added in step 8 — Lane 4 to register in `known-failing.json` if not already (step 9 did not touch harness per guardrails).
- **Next T4 families:** preview color (#1/#13), singles (#9/#11/#14/#15), replay-adjacent (#4/#5).

## PO batch (single session on `20260715a5`)

Aggregates (#2/#6/#7/#16), display/parse (#12/#17), order-type (#18), replay #3/#21, A3 tick+interval, step 8 multi-entry ✕/stack, **step 9 lot + SL/TP steppers**.
