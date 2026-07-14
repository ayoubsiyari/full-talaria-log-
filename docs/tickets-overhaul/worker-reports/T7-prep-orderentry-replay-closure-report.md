# T7-prep (Lane 3) — order-entry + replay closure sweep

**Task:** T7-prep — disposition sweep for TAL-00752 sub-bugs, A3 replay tickets, and T4 step 3 replay-interaction rows.  
**Type:** Read-only / registry — no product edits.  
**Date:** 2026-07-14  
**RC:** Tooling/triage — no RC discharged; feeds T7 backlog sweep (P5 prep).

**Canonical live-confirm build:** `20260712b44` (current harness `serve.mjs` / `chart-embed.html`). Earlier evidence builds noted per row where the fix landed (b2–b6 for T4; b33 for A3 harness proof).

**Registry numbering note:** `PER-BUG-REGISTRY.csv` rows are numbered #1–#22 by symptom text. **Message #17** in the ticket thread (order-type label stuck as "market") maps to registry row **#18** (*Moving second entry mutates limit order to market order*). Row **#17** in the registry is a separate symptom (*SL/TP lines not rendered when value is below 10*).

---

## 1. Task + RC

| Field | Value |
|---|---|
| Task id | T7-prep — order-entry + replay closure sweep |
| Goal | Disposition every TAL-00752 sub-bug + A3 + replay-interaction row against landed T4/A3 fixes |
| RC | Diagnostic/triage only — no fix |

---

## 2. What I changed — file by file

N/A — read-only/registry task. No files touched.

---

## 3. Kill-switch (I3 + I13)

N/A — no switches introduced. Disposition table below cites existing switches from T4/A3 steps.

---

## 4. Proof — RED → GREEN

N/A — no new proof run. Evidence cited from accepted worker reports:

- T4 step 1–7 reports (`T4-lane3-order-entry-model-report.md` through `T4-step7-fix-level-referenceerror-report.md`)
- T4 step 3 (`T4-step3-replay-interaction-report.md`) — H-S36, H-S37
- A3 step 3 (`A3-step3-replay-fixes-report.md`) — H-S54–H-S57
- `MANAGER-FINDINGS.md` acceptance notes (D-005, order-type family discharged, step 3 accepted)

---

## 5. Invariants checked

| Invariant | How satisfied |
|---|---|
| P3 | Still-open rows include RC guess + one-line mechanism |
| P5 | Each closed row names switch/step + build for PO confirmation |
| P6 | Order-type rows cite D-005 source quote (message #17) |

---

## 6. What I did NOT do / limits

- Did not re-run harness, gate, or live product — disposition is registry synthesis only.
- Did not reconcile `PER-BUG-REGISTRY.csv` status columns (still `user_replied`); Manager/T7 should sync registry CSV on close.
- TAL-00752 rows without a landed T4/A3 fix are **still-open** with RC guess only — no triage beyond mechanism one-liner.
- PO live-confirm on `20260712b44` (or later Manager bump) is required before any **needs-live-confirm** row can move to **closed**.

---

## 7. Live-verification handoff

PO should confirm on build **`20260712b44`** (unregister service worker first if stale `?v=` seen).

| Family | Spot-check |
|---|---|
| Aggregates (#6, #7, #16, #2) | Multi-entry 50/50 → delete one leg → footer 100%; average tracks moves; PNL sign correct after partial TP |
| Display/parse (#12, #17) | SL/TP below 10 renders; partial decimal `0.` does not zero lot |
| Order-type (#18 + label) | Drag buy entry Limit→Market→Stop; label tracks continuously during drag; no console `ReferenceError: level` |
| Replay-interaction #3 | Replay playing: TP connector line stable across candle advance (no flicker) |
| Replay-interaction #21 | Pending limit during replay: fill anchors to touch candle, not visible-window slice |
| A3 TAL-01581/01582 | Tick mode + 4h interval: play stays tick animation; step cadence consistent; UI shows Tick + interval |

Kill-switch spot-checks (optional): set each `window.__TALARIA_*` disable flag and confirm legacy behavior returns per the originating step report.

---

## 8. Status

**DIAGNOSTIC-ONLY** — disposition table complete; no fixes applied.

---

## Disposition table

### TAL-00752 sub-bugs (#1–#22)

| Row | Symptom (registry) | Disposition | Evidence (switch / step / harness) | Live build |
|---|---|---|---|---|
| #1 | Stop order entry line shown in red with multiple orders | **still-open** | No T4 step targeted preview color / multi-order risk styling | — |
| #2 | Deleting first multi-entry leaves second entry price stuck at 0.00 | **needs-live-confirm** | T4 step 1 — `__TALARIA_DISABLE_ORDER_AGGREGATES_V2` (V2 recompute from `entries[]` on delete) | `20260712b44` |
| #3 | TP/SL connector line flickers/disappears each replay candle | **closed-by-landed-fix** | T4 step 3 — `__TALARIA_DISABLE_TP_REPLAY_FLICKER_FIX`; H-S37 RED→GREEN→RED-again | `20260712b6`+ (confirm on b44) |
| #4 | Replay + drag limit order glitches stop loss position | **still-open** | No landed fix; replay-bus + drag SL sync not addressed in T4 steps 1–7 | — |
| #5 | Keyboard chart move triggers order entry glitch during replay | **still-open** | No landed fix; keyboard pan × replay × order-entry path untouched | — |
| #6 | Average entry stuck on first entry when second moved below first | **closed-by-landed-fix** | T4 step 1 — `__TALARIA_DISABLE_ORDER_AGGREGATES_V2`; property tests GREEN | `20260712b44` (PO confirm) |
| #7 | Risk split stays 50 after deleting extra entry | **closed-by-landed-fix** | T4 step 1 — same switch; stale `splitEntries[].percentage` discharged | `20260712b44` (PO confirm) |
| #8 | Lot size glitches when changed via arrow input | **still-open** | T4 step 2 parse fix covers SL/TP scaffold only, not lot arrow/spinner path | — |
| #9 | Second entry preview appears at TP screen instead of below/above price for limit | **still-open** | No landed fix; multi-entry preview Y placement logic not in T4 scope | — |
| #10 | Closing order via X button is difficult / unreliable | **still-open** | No landed fix; close hit-target / handler reliability not addressed | — |
| #11 | Pending limit order SL cannot be above entry until after placement | **still-open** | No landed fix; pending-limit SL constraint validation not in T4 steps | — |
| #12 | Trailing zero in SL/TP parsing zeroes lot size | **closed-by-landed-fix** | T4 step 2 — `__TALARIA_DISABLE_SLTP_PARSE_FIX`; `order-sltp-display-parsing.test.mjs` GREEN | `20260712b2`+ (confirm on b44) |
| #13 | 1RR order entry displayed in red incorrectly | **still-open** | No landed fix; risk/reward color predicate separate from aggregates V2 | — |
| #14 | Cancel order leaves menu active; entry price does not track price movement | **still-open** | No landed fix; cancel/state cleanup + price tracking not in T4 scope | — |
| #15 | Cannot change SL/TP from order panel controls | **still-open** | No landed fix; panel control input handlers not addressed | — |
| #16 | PNL shows profit while price below long entry after TP1 hit | **closed-by-landed-fix** | T4 step 1 — `__TALARIA_DISABLE_ORDER_AGGREGATES_V2`; per-leg PNL from current entries | `20260712b44` (PO confirm) |
| #17 | SL/TP lines not rendered when value is below 10 | **closed-by-landed-fix** | T4 step 2 — `__TALARIA_DISABLE_SLTP_RENDER_FIX`; `order-sltp-display-parsing.test.mjs` GREEN | `20260712b2`+ (confirm on b44) |
| #18 | Moving second entry mutates limit order to market order | **closed-by-landed-fix** | T4 step 5 — `__TALARIA_DISABLE_ORDER_TYPE_RECLASSIFY_V2` (D-005); step 6 live label; step 7 crash fix | `20260712b5`+ (confirm on b44) |
| #19 | SL/TP arrow drag starts from zero instead of entry price | **still-open** | No landed fix; SL/TP drag initializer not in T4 steps | — |
| #20 | Multiple entries require repeated X clicks to close | **still-open** | No landed fix; multi-entry close handler not addressed | — |
| #21 | Replay fill occurs on wrong candle vs entry candle | **needs-live-confirm** | T4 step 3 — H-S36 PASS (corrected replay-master probe); **NO-REPRO** in harness; no fix applied | `20260712b6`+ (confirm on b44) |
| #22 | Stacked multi-entry orders get stuck when moved on top of each other | **still-open** | No landed fix; overlap/collision handler for stacked entries not in T4 scope | — |

**TAL-00752 summary:** 9 closed-by-landed-fix · 2 needs-live-confirm · 11 still-open (of 22 registry rows).

---

### A3 replay tickets

| Ticket | Symptom | Disposition | Evidence (switch / step / harness) | Live build |
|---|---|---|---|---|
| TAL-01581 | Candle + interval erratic play / step-forward | **needs-live-confirm** | A3 step 3 Fix 1 — `__TALARIA_FIX_REPLAY_INTERVAL_CADENCE`; H-S55, H-S56 GREEN; switch-OFF RED on H-S56 | `20260712b33` harness proof; confirm on **b44** |
| TAL-01582 | Tick-by-tick auto-changes to candle-by-candle | **needs-live-confirm** | A3 step 3 Fix 2 — `__TALARIA_FIX_REPLAY_MODE_PLAY_ROUTING` (D-009 ruling A); H-S54, H-S57 GREEN; switch-OFF RED on H-S54/H-S57 | `20260712b33` harness proof; confirm on **b44** |

No additional A3 siblings beyond TAL-01581/01582 in `TICKET-REGISTRY.csv` / `DAILY-INTAKE.md`.

---

### T4 step 3 replay-interaction (cross-reference)

| Row | Symptom | Disposition | Notes |
|---|---|---|---|
| TAL-00752#3 | TP flicker per candle | **closed-by-landed-fix** | See table above |
| TAL-00752#21 | Fill on wrong candle | **needs-live-confirm** | Harness NO-REPRO; PO live trace if symptom persists |

---

## T4 step coverage map

| T4 step | Switch(es) | Registry rows discharged |
|---|---|---|
| Step 1 | `__TALARIA_DISABLE_ORDER_AGGREGATES_V2` | #6, #7, #16; partial #2 (delete sync); originally froze type — superseded by step 5 for #18 |
| Step 2 | `__TALARIA_DISABLE_SLTP_RENDER_FIX`, `__TALARIA_DISABLE_SLTP_PARSE_FIX` | #17, #12 |
| Step 3 | `__TALARIA_DISABLE_TP_REPLAY_FLICKER_FIX` | #3 closed; #21 probed, no fix |
| Step 5 | `__TALARIA_DISABLE_ORDER_TYPE_RECLASSIFY_V2` | #18 (reclassify semantics, D-005) |
| Step 6 | `__TALARIA_DISABLE_ORDERTYPE_LIVE_LABEL_FIX` | #18 (label refresh during drag — message #17 quote) |
| Step 7 | (crash fix, no new switch) | Regression from step 5/6 — drag `ReferenceError` |

**Uncovered by any T4 step:** #1, #4, #5, #8, #9, #10, #11, #13, #14, #15, #19, #20, #22.

---

## Still-open list (Manager schedule)

Priority order for Lane 3 / T7 — RC guess + mechanism (P3); **no fixes in this task**.

| Row | RC | Mechanism (one line) |
|---|---|---|
| #1 | RC-5 | Multi-order preview uses single-order risk/color predicate → stop line paints red incorrectly when legs > 1 |
| #4 | RC-5 | Replay candle advance + limit-entry drag recomputes SL from stale replay price anchor, not dragged SL Y |
| #5 | RC-5 | Keyboard pan triggers chart redraw/replay-bus tick while order-entry drag state is active → preview desync |
| #8 | RC-5 | Lot arrow `input`/`change` path bypasses SL/TP parse defer helpers → transient recalc to zero/wrong value |
| #9 | RC-5 | Split-entry preview Y defaults to TP panel viewport band instead of limit-above/below market offset |
| #10 | RC-1/RC-5 | X-button hit target overlaps label/connector DOM; close handler needs mousedown not click or z-index fix |
| #11 | RC-5 | Pending-limit SL validator enforces post-fill geometry only; draft-state allows SL below entry for buys incorrectly blocked above |
| #13 | RC-5 | 1RR color predicate reads aggregate risk before V2 refresh or uses wrong RR threshold for red styling |
| #14 | RC-1/RC-5 | Cancel clears draft lines but not quick-menu / panel focus; entry price tracker not re-bound after cancel |
| #15 | RC-5 | Order panel SL/TP spinners write DOM but preview `oninput` path not wired or gated off during panel focus |
| #19 | RC-5 | SL/TP arrow-drag initializer seeds Y=0 instead of current entry or existing SL/TP price |
| #20 | RC-5 | Multi-entry close removes one DOM node per click; `entries[]` shrink not synced until full preview rebuild |
| #22 | RC-5 | Stacked entries share snap Y; drag collision handler does not offset or z-order separate legs |

**Replay-adjacent still-open (not #21):** #4, #5 overlap replay × order-entry — schedule after PO confirms #21 on live replay.

---

## Manager actions

1. **PO live-confirm batch on `20260712b44`:** aggregates (#2, #6, #7, #16), display/parse (#12, #17), order-type (#18), replay #3, replay #21, A3 TAL-01581/01582.
2. **Registry sync:** update `PER-BUG-REGISTRY.csv` disposition columns for closed rows after PO confirms (P5).
3. **Schedule T7 / Lane 3:** 11 still-open TAL-00752 rows above — group by mechanism (#8+#19 parse/drag input family; #10+#20+#22 close/hit-target family; #4+#5 replay-interaction family).
4. **Do not close TAL-01581/01582 in `TICKET-REGISTRY.csv` until PO confirms tick+interval on built product (A3 report: harness proven, NEEDS-LIVE).
