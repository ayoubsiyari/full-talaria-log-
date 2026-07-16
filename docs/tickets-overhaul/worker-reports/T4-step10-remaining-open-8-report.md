# T4 step 10 — remaining open 8 (triage + bucket-a fixes)

**Step 0 — Family 2 commit status:** Family 2 (#8/#19) is **not committed**. Base commit remains `d457dbe1` (*phase 2*). Family 2 + step 8/10 changes are working-tree only. At session start, `order-manager.js` SHA for family 2 was `C711B9F1369B6EDA3203FB7036C35419E2D0BC854446DCD9CF912B8B74A74840` (both trees matched).

---

## 1. Task + RC

**Task:** T4 step 10 (Lane 3) — triage the 8 still-open TAL-00752 rows; fix tractable bucket (a) with RED-first property tests + kill-switches; hand back (b)/(c).

**RC:** RC-5 (order-entry state model). Tooling/diagnostic hand-backs for replay-adjacent rows.

---

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `chart v 1.4/chart/modules/order-entry-aggregates.mjs` | Added pure helpers + kill-switch gates: preview color, per-leg min-lot, second-entry offset, pending SL anchor. |
| `homepage/public/chart/modules/order-entry-aggregates.mjs` | Byte-identical mirror (I8). |
| `chart v 1.4/chart/modules/order-manager.js` | Wired 5 kill-switches; preview color, second-entry default, SL anchor, chart-cancel cleanup, SL/TP stepper side-effects. |
| `homepage/public/chart/modules/order-manager.js` | Byte-identical mirror (I8). |
| `chart v 1.4/chart/modules/order-entry-remaining-open-8.test.mjs` | Property test (RED/GREEN + switch-OFF RED-again). |
| `homepage/public/chart/modules/order-entry-remaining-open-8.test.mjs` | Mirror of test file. |
| `docs/tickets-overhaul/PER-BUG-REGISTRY.csv` | #1, #9, #11, #13, #14, #15 → `fixed_pending_live`. |

**No other files touched** (no harness, multichart, React).

---

## 3. Kill-switch (I3 + I13)

| Switch | Default | Rows | Gated files |
|--------|---------|------|-------------|
| `__TALARIA_DISABLE_ORDER_ENTRY_PREVIEW_COLOR_FIX` | ON (fix active) | #1, #13 | `order-entry-aggregates.mjs`, `order-manager.js` — `resolvePreviewEntryColor`, `_multiEntryLevelMeetsMinLot` rule 4, preview line colors |
| `__TALARIA_DISABLE_ORDER_ENTRY_SECOND_ENTRY_OFFSET_FIX` | ON | #9 | both — `_resolveDefaultSecondEntryPrice`, `setEntryMode`, `_buildDefaultTwoLevelMultiEntryFromPrimary` |
| `__TALARIA_DISABLE_ORDER_ENTRY_PENDING_SL_CLAMP_FIX` | ON | #11 | both — `_getPreviewSlEntryAnchor`, SL drag clamp |
| `__TALARIA_DISABLE_ORDER_ENTRY_CANCEL_CLEANUP_FIX` | ON | #14 | `order-manager.js` — `closeOrderRailFromChartCancel`, `_draftCancelCleanupFromChart` |
| `__TALARIA_DISABLE_ORDER_ENTRY_PANEL_SLTP_FIX` | ON | #15 | `order-manager.js` — stepper handler, `_applySltpStepperSideEffects` |

Switch OFF in each file restores legacy behavior (verified in property test RED-again paths).

---

## 4. Proof — RED → GREEN

**Commands (canonical tree):**
```bash
cd "chart v 1.4/chart/modules"
node order-entry-remaining-open-8.test.mjs
TALARIA_TEST_DISABLE_ORDER_ENTRY_PREVIEW_COLOR_FIX=1 node order-entry-remaining-open-8.test.mjs
TALARIA_TEST_DISABLE_ORDER_ENTRY_SECOND_ENTRY_OFFSET_FIX=1 node order-entry-remaining-open-8.test.mjs
```

**GREEN (fix ON):** all assertions pass — BUY stop color `#2962ff`, per-leg min-lot keeps valid stop leg, limit second entry below main, SELL pending SL anchor = highest entry, manager helpers present.

**RED-again (switch OFF):** preview-color OFF → BUY stop returns `#f23645`; min-lot cap uses total risk → overweight leg fails; second-entry OFF → second price above main (reward-side); SL-anchor OFF → average 1.21 instead of 1.22.

**I15:** Node property tests only — synthetic pure-function + prototype helper checks. **DONE (dev only) — NEEDS-LIVE** for chart-visible confirmation.

**Harness:** Not run (guardrail: order-entry only; no harness edits this step).

**SHA256 (post-change, both trees match):**
- `order-manager.js`: `BB479EE59CAF4447F401BD7F7E9B394A9EE8E4AA03D62074419CA171B4BC1F14`
- `order-entry-aggregates.mjs`: `785A6F1145280C33E71D7FA2A57DB5E4A3756975BE0C4C9ECD633447F8742801`

---

## 5. Invariants checked

| Invariant | How satisfied |
|-----------|---------------|
| I8 | Both trees byte-identical; SHA match confirmed |
| I13 | Five independent kill-switches; each gates all touched paths |
| I15 | RED-again via env flags; no proxy greens claimed as proven |
| I5/I9 | Harness not touched |

---

## 6. What I did NOT do / limits

- **#4, #5** not fixed — replay-bus / keyboard-pan cross-track (hand-back below).
- **#9** fix covers default second-entry offset in order-entry model; render-anchor / Y-scale placement in multichart iframe not validated live.
- **#14** V9 React rail close may still need React bridge sync (`__talariaV9OrderRailOpen`); order-manager cleanup only.
- **#15** Classic panel stepper path fixed; V9 React rail may use separate control wiring — needs live confirm.
- Family 2 (#8/#19) still uncommitted on `d457dbe1`.
- No `npm run gate` this step.

---

## 7. Live-verification handoff

**Build:** Next server rebuild after merge (reference `20260715a5` lineage).

**PO checklist (order-entry, single chart):**
1. Multi-entry BUY with one stop leg — stop line stays **blue**, not sell-red (#1).
2. Limit multi-entry — second entry spawns **below** main (BUY) / above (SELL), not at TP band (#9).
3. Pending SELL limit multi-entry — drag SL **above** highest entry before place (#11).
4. 1RR setup with two entries — neither entry preview faded/disabled incorrectly (#13).
5. Chart preview ✕ — rail closes, draft cleared (#14).
6. SL/TP +/- steppers — preview lines and RR readout update immediately (#15).

**Switch-off revert:** set each `__TALARIA_DISABLE_ORDER_ENTRY_*_FIX = true` in console and repeat rows 1–6; legacy bugs should return.

---

## 8. Status

**DONE (dev only) — NEEDS-LIVE** for rows #1, #9, #11, #13, #14, #15. Property tests GREEN + switch-OFF RED-again; PO live confirm required.

**DIAGNOSTIC-ONLY** hand-backs for #4, #5 (still open).

---

## 8-row triage table

| Row | Symptom → hypothesis → bucket | Disposition |
|-----|------------------------------|-------------|
| #1 | Stop entry line red with multiple orders → preview color keyed off `orderType==='stop'` + total-risk min-lot cap → **(a)** | **fixed_pending_live** — `__TALARIA_DISABLE_ORDER_ENTRY_PREVIEW_COLOR_FIX` |
| #4 | Replay + drag limit glitches SL → replay tick + `isDraggingPreviewLine` race in `_syncPreviewToReplayPrice` / drag handler → **(b)** | **still-open** — hand back Lane 3 replay + A3 |
| #5 | Keyboard pan glitches order entry in replay → keyboard pan invalidates draft while replay bus updates entry → **(b)** | **still-open** — cross-track chart pan × replay |
| #9 | Second entry at TP screen for limit → `_clampMultiEntryPriceForReward` used for limit default offset → **(a)** | **fixed_pending_live** — `__TALARIA_DISABLE_ORDER_ENTRY_SECOND_ENTRY_OFFSET_FIX` |
| #11 | Pending limit SL blocked above entry → SL clamp used avg entry not loss-side extreme → **(a)** | **fixed_pending_live** — `__TALARIA_DISABLE_ORDER_ENTRY_PENDING_SL_CLAMP_FIX` |
| #13 | 1RR entry shown red → false disabled from total-risk min-lot on valid leg → **(a)** | **fixed_pending_live** — preview-color switch (per-leg cap) |
| #14 | Cancel leaves menu active; price doesn't track → `closeOrderRailFromChartCancel` incomplete draft reset → **(a)** | **fixed_pending_live** — `__TALARIA_DISABLE_ORDER_ENTRY_CANCEL_CLEANUP_FIX` |
| #15 | Panel SL/TP controls not wired → stepper bypassed full recalc path → **(a)** | **fixed_pending_live** — `__TALARIA_DISABLE_ORDER_ENTRY_PANEL_SLTP_FIX` |

---

## Bucket (b)/(c) hand-backs

### #4 — Replay + drag limit glitches SL (b)
- **Hypothesis:** During replay, `_syncPreviewToReplayPrice` (≈16987) re-runs `_autoDetectOrderTypeFromEntry` while SL drag handler (≈18805) concurrently updates `slPrice`; race leaves SL at stale Y.
- **Likely files:** `order-manager.js` `_syncPreviewToReplayPrice`, preview SL drag end handler; possibly `replay-system.js` tick cadence.
- **Route:** Lane 3 replay × order-entry diagnostic (A3 adjacency).

### #5 — Keyboard chart move glitches order entry in replay (b)
- **Hypothesis:** Keyboard pan triggers chart scroll without closing draft; `updateOrderPanelPrice` skipped for limit/stop (≈16955) but preview SVG coords desync from scale shift.
- **Likely files:** chart pan/keyboard handler (drawing-tools or chart core), `order-manager.js` `updatePreviewLines` scale refresh.
- **Route:** Lane 2 pan + Lane 3 replay interaction.

### #9 residual (c note)
- Default offset fixed in RC-5 model; if preview still appears at wrong **screen Y** after fix, suspect render anchor (`_getPreviewTpSlBadgeAnchorPrice`, multichart iframe draft mirror) — Lane 4 multichart parity.

---

## Registry deltas

| Row | Before | After |
|-----|--------|-------|
| TAL-00752#1 | user_replied | fixed_pending_live |
| TAL-00752#4 | user_replied | user_replied (unchanged) |
| TAL-00752#5 | user_replied | user_replied (unchanged) |
| TAL-00752#9 | user_replied | fixed_pending_live |
| TAL-00752#11 | user_replied | fixed_pending_live |
| TAL-00752#13 | user_replied | fixed_pending_live |
| TAL-00752#14 | user_replied | fixed_pending_live |
| TAL-00752#15 | user_replied | fixed_pending_live |

**T7 closure after step 10:** 18 `fixed_pending_live`, 4 `needs-live-confirm` (#2, #21, TAL-01581, TAL-01582), **2 still-open** (#4, #5).
