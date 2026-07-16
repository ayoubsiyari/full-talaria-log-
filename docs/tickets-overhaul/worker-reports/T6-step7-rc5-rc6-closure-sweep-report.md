# T6 step 7 — Part A: M5 commit confirm · Part B: RC-5/RC-6 closure sweep (READ-ONLY)

## 1. Task + RC

- **Task:** T6 step 7 (Lane 3) — file-scoped M5 commit confirm + read-only RC-5/RC-6 closure sweep for combined-build unfreeze (D-018 #4).
- **RC:** **RC-6** (indicator lifecycle M1–M6 map) + **RC-5** (order-entry disposition). Tooling/closure — no new product fixes.
- **Part B goal:** Verification map for PO live-confirm at combined-build unfreeze.

---

## 2. What I changed — file by file

### Part A — commits

| Item | Detail |
|------|--------|
| **M5 product commit** | **Already landed** at `40be56dd` before this step — no duplicate product commit required. |
| **M4 diagnostic commit** | `0d95b05d` — `docs/tickets-overhaul/worker-reports/T6-step6-M4-replay-recalc-diagnostic-report.md` only. |
| **This report** | `docs/tickets-overhaul/worker-reports/T6-step7-rc5-rc6-closure-sweep-report.md` (uncommitted until Manager intake). |

**M5 commit `40be56dd` — exact path list:**

| Path |
|------|
| `chart v 1.4/chart/modules/indicator-persist-rehydrate.js` |
| `chart v 1.4/chart/modules/indicator-persist-rehydrate.test.mjs` |
| `chart v 1.4/chart/modules/chart-indicators-full.js` |
| `chart v 1.4/chart/legacy-index.html` |
| `chart v 1.4/chart/dist-v9/index.html` |
| `chart v 1.4/chart/multichart-prod/chart-embed.html` |
| `chart v 1.4/chart/multichart-prod/harness/serve.mjs` |
| `chart v 1.4/chart/scripts/build-chart-client-bundle.mjs` |
| `chart v 1.4/talaria-design/live/index.html` |
| `homepage/public/chart/modules/indicator-persist-rehydrate.js` |
| `homepage/public/chart/modules/indicator-persist-rehydrate.test.mjs` |
| `homepage/public/chart/modules/chart-indicators-full.js` |
| `homepage/public/chart/legacy-index.html` |
| `homepage/public/chart/dist-v9/index.html` |
| `homepage/public/chart/multichart-prod/chart-embed.html` |
| `homepage/public/chart/multichart-prod/harness/serve.mjs` |
| `homepage/public/chart/scripts/build-chart-client-bundle.mjs` |
| `homepage/public/chart/talaria-design/live/index.html` |
| `docs/tickets-overhaul/worker-reports/T6-step5-phase5-persist-race-report.md` |

**I8 SHA256 post-commit (verified this step):**

| Pair | Result |
|------|--------|
| `indicator-persist-rehydrate.js` (v1.4 ↔ homepage) | **MATCH** |
| `indicator-persist-rehydrate.test.mjs` (v1.4 ↔ homepage) | **MATCH** |
| `chart-indicators-full.js` (v1.4 ↔ homepage) | **MATCH** |

**Not staged / not touched:** `chart.js`, `replay-system.js`, `panel-cmd-bridge.js`, order-entry, harness, `known-failing.json`, `PER-BUG-REGISTRY.csv`, Lane 1/2/4 files.

---

## 3. Kill-switch (I3 + I13)

### RC-6 (landed — summary for closure)

| Mechanism | Switch | Default | Gated files |
|-----------|--------|---------|-------------|
| M1 store | `__TALARIA_RC6_INDICATOR_LIFECYCLE_STORE` | ON | `indicator-lifecycle-store.js`, `chart-indicators-full.js` |
| M2 visibility | `__TALARIA_RC6_INDICATOR_VISIBILITY_V2` | ON | `indicator-visibility.js`, `chart-indicators-full.js`, `indicator-ui.js` |
| M3 settings | `__TALARIA_RC6_INDICATOR_SETTINGS_APPLY_V2` | ON | `indicator-settings-apply.js`, `chart-indicators-full.js`, `indicator-ui.js` |
| M4 replay UI | `__TALARIA_RC6_INDICATOR_REPLAY_UI_SYNC_V2` | **Not implemented** | Spec only — `chart-indicators-full.js`, `indicator-ui.js`, `replay-system.js` |
| M5 persist | `__TALARIA_RC6_INDICATOR_PERSIST_REHYDRATE_V2` | ON | `indicator-persist-rehydrate.js`, `chart-indicators-full.js` |
| M6 panel/MC | `__TALARIA_RC6_INDICATOR_PANEL_LAYOUT_V2` / `__TALARIA_RC6_INDICATOR_MC_ISOLATION_V2` | **Parked** | `chart-indicators-full.js`, multichart (coord. Lane 4) |

### RC-5 (landed in `baf2ab12` — summary for closure)

| Switch | Rows | Gated files |
|--------|------|-------------|
| `__TALARIA_DISABLE_ORDER_ENTRY_CLOSE_HITTARGET_FIX` | #10, #20, #22 | `order-manager.js` |
| `__TALARIA_DISABLE_ORDER_ENTRY_PARSE_DRAG_INPUT_FIX` | #8, #19 | `order-manager.js`, `order-entry-aggregates.mjs` |
| `__TALARIA_DISABLE_ORDER_ENTRY_PREVIEW_COLOR_FIX` | #1, #13 | `order-manager.js`, `order-entry-aggregates.mjs` |
| `__TALARIA_DISABLE_ORDER_ENTRY_SECOND_ENTRY_OFFSET_FIX` | #9 | same |
| `__TALARIA_DISABLE_ORDER_ENTRY_PENDING_SL_CLAMP_FIX` | #11 | same |
| `__TALARIA_DISABLE_ORDER_ENTRY_CANCEL_CLEANUP_FIX` | #14 | `order-manager.js` |
| `__TALARIA_DISABLE_ORDER_ENTRY_PANEL_SLTP_FIX` | #15 | `order-manager.js` |
| `__TALARIA_DISABLE_ORDER_TYPE_RECLASSIFY_V2` | #18 | `order-manager.js` (prior T4 steps) |

**N/A for Part B:** No new switches introduced this step.

---

## 4. Proof — RED → GREEN

**Part A:** M5 property test GREEN at `40be56dd` (see `T6-step5-phase5-persist-race-report.md`). Re-verified I8 SHA256 this step — no re-run of tests.

**Part B:** Read-only registry/worker-report synthesis — no new RED/GREEN runs.

**Registry note:** `PER-BUG-REGISTRY.csv` `fixed_pending_live` updates from T4 steps 8–10 exist in **working tree only** (not in committed HEAD). Disposition tables below use **code-landed + worker-report authority** for `fixed_pending_live`; committed registry at HEAD still shows `user_replied` for those rows until Manager commits registry delta.

---

## 5. Invariants checked

| Invariant | How satisfied |
|-----------|---------------|
| I8 | M5 mirror SHA256 MATCH re-confirmed |
| File-scoped commit | Only `T6-step6` report committed (`0d95b05d`); no `git add -A` |
| Read-only Part B | No product/harness/registry edits |
| I15 | All `fixed_pending_live` rows flagged synthetic/proxy where applicable |
| Lane isolation | No Lane 1/2/4 files touched |

---

## 6. What I did NOT do / limits

- **Did not re-commit M5** — already at `40be56dd`.
- **Did not commit** `PER-BUG-REGISTRY.csv` working-tree `fixed_pending_live` deltas (Lane 4 / Manager scope).
- **Did not run** combined build, harness gate, or PO live confirm.
- **RC-6 rows** have no `fixed_pending_live` registry status — all landed phases are dev-property GREEN only.
- **M4 implement** still gated (D-017 + `replay-system.js` + b1).
- **M6** parked with re-migration.
- **#4/#5** explicitly held — not dispositioned as fixed.

---

## 7. Live-verification handoff

See **Appendix C — Combined-build PO live-confirm checklist** (RC-5 `fixed_pending_live` + RC-6 landed mechanisms).

**Build lineage for combined unfreeze:** serve `build:live` after Lane 2 snap-back + re-migration Phase 0 freeze; confirm build id inside panel iframe.

---

## 8. Status

**Part A:** **DONE (proven)** — M5 at `40be56dd`, I8 verified; step6 report at `0d95b05d`.

**Part B:** **DIAGNOSTIC-ONLY** — closure map complete; no implementation.

---

# Part B — Closure sweep

## Appendix A — RC-6 mechanism table (M1–M6)

| Mech | Phase | Switch | Commit | Tickets discharged (primary) | Status | PO live-check (one line) |
|------|-------|--------|--------|------------------------------|--------|--------------------------|
| **M1** | Lifecycle store | `__TALARIA_RC6_INDICATOR_LIFECYCLE_STORE` | `3502177c` | TAL-00454#1 (partial), TAL-01286-class | **Landed — NEEDS-LIVE** | Add indicator → `chart._indicatorLifecycleStore.getSnapshot().count` increments; hide emits store event |
| **M2** | Visibility contract | `__TALARIA_RC6_INDICATOR_VISIBILITY_V2` | `314fbb3d` | TAL-00454#1, TAL-00350#6, TAL-00350#11 (partial) | **Landed — NEEDS-LIVE** | Hide volume via eye → bars gone; show again → name/value return without divider drag |
| **M3** | Settings apply | `__TALARIA_RC6_INDICATOR_SETTINGS_APPLY_V2` | `db82aed4` | TAL-00488#1, TAL-01263#1, TAL-00350#7 (partial) | **Landed — NEEDS-LIVE** | Change RSI period → legend + plot update immediately after save |
| **M4** | Replay UI sync | `__TALARIA_RC6_INDICATOR_REPLAY_UI_SYNC_V2` | — | TAL-00350#2, TAL-00350#7, TAL-00157#16 (partial) | **M4-GATED** (diagnostic `0d95b05d`) | Replay play 10 bars → legend value tracks playhead without chart click |
| **M5** | Persist/rehydrate | `__TALARIA_RC6_INDICATOR_PERSIST_REHYDRATE_V2` | `40be56dd` | Session restore dup/loss class, TAL-00350#2 (partial), TF-disappear foundation | **Landed — NEEDS-LIVE** | Add 2 indicators → reload → exactly 2 in legend, no dup ids in store |
| **M6** | Panel layout + MC isolation | `__TALARIA_RC6_INDICATOR_PANEL_LAYOUT_V2` / `__TALARIA_RC6_INDICATOR_MC_ISOLATION_V2` | — | TAL-00157#12/#13, TAL-00350#4/#9/#10, H-S48 | **M6-PARKED** (re-migration) | Pane divider drag does not collapse main chart; per-panel indicator isolation |

### RC-6 open `user_replied` rows — disposition (not yet fixed_pending_live)

| Bug ref | Symptom | Mechanism owner | Status |
|---------|---------|-----------------|--------|
| TAL-00350#1 | Name label remains after delete | M1/M2 + legend rebuild | still-open / partial M1 |
| TAL-00350#2 | Price label stale until replay icon | **M4** | M4-gated |
| TAL-00350#3 | Time labels unwanted | M6 / UX | still-open |
| TAL-00350#4 | Drawings above indicator pane | M6 | M6-parked |
| TAL-00350#5 | Hide cursor affects whole screen | TF scope / UX | still-open |
| TAL-00350#7 | Value stale on hover without click | **M4** (+ M3 partial) | M4-gated |
| TAL-00350#8 | News menu hover defect | unrelated quick-menu | still-open |
| TAL-00350#9 | Divider drag stuck | M6 | M6-parked |
| TAL-00350#10 | Remove indicator magnet | M6 | M6-parked |
| TAL-00350#11 | Disappear on zoom + click | M2 partial + M6 | NEEDS-LIVE partial |
| TAL-00157#12 | Pane shifts with stacked indicators | M6 | M6-parked |
| TAL-00157#13 | Drag price label collapses pane | M6 | M6-parked |
| TAL-00454#1 | Hide then tap doesn't reappear | M2 | NEEDS-LIVE |
| TAL-00488#1 | RSI level change no effect | M3 | NEEDS-LIVE |
| TAL-01263#1 | Thickness dropdown opens upward | M3/UI chrome | NEEDS-LIVE |

**I15 flag (RC-6):** All M1–M3/M5 greens are **Node/vm property tests** — synthetic actuation, store-count/DOM-token proxies. **Every landed RC-6 row requires real built-product live-check** before `resolved`. No RC-6 row may be labeled DONE (proven) from dev loop alone.

---

## Appendix B — RC-5 disposition table (as-committed HEAD + code reality)

**Code landed:** `baf2ab12` (`order-manager.js` + aggregates + property tests).  
**Registry at HEAD:** all TAL-00752 rows still `user_replied` (no `fixed_pending_live` committed).  
**Working-tree registry (uncommitted):** 11 rows marked `fixed_pending_live` per T4 steps 8–10.

### B.1 — `fixed_pending_live` (code GREEN, PO confirm pending)

| Bug ref | Symptom | Switch / proof | I15 actuation | I15 measure |
|---------|---------|----------------|---------------|-------------|
| TAL-00752#1 | Stop entry line red with multi-entry | `__TALARIA_DISABLE_ORDER_ENTRY_PREVIEW_COLOR_FIX`; `order-entry-remaining-open-8.test.mjs` | **Synthetic** Node pure fn | Preview color hex + per-leg min-lot boolean |
| TAL-00752#8 | Lot arrow glitches | `__TALARIA_DISABLE_ORDER_ENTRY_PARSE_DRAG_INPUT_FIX`; `order-entry-parse-drag-input.test.mjs` | **Synthetic** | Helper called; lot recalc path flag |
| TAL-00752#9 | Second entry at TP screen for limit | `__TALARIA_DISABLE_ORDER_ENTRY_SECOND_ENTRY_OFFSET_FIX` | **Synthetic** | Second price below main (numeric) |
| TAL-00752#10 | X button hard to close | `__TALARIA_DISABLE_ORDER_ENTRY_CLOSE_HITTARGET_FIX`; H-S58 harness | **Harness** pointerdown at coords | Hit-pad expanded — **needs real mouse PO** |
| TAL-00752#11 | Pending limit SL blocked above entry | `__TALARIA_DISABLE_ORDER_ENTRY_PENDING_SL_CLAMP_FIX` | **Synthetic** | SL anchor price numeric |
| TAL-00752#13 | 1RR entry shown red | preview-color + per-leg cap | **Synthetic** | Validity boolean per leg |
| TAL-00752#14 | Cancel leaves menu active | `__TALARIA_DISABLE_ORDER_ENTRY_CANCEL_CLEANUP_FIX` | **Synthetic** | `_draftCancelCleanupFromChart` exists |
| TAL-00752#15 | Panel SL/TP controls dead | `__TALARIA_DISABLE_ORDER_ENTRY_PANEL_SLTP_FIX` | **Synthetic** | Stepper side-effects helper |
| TAL-00752#19 | SL/TP stepper from zero | `__TALARIA_DISABLE_ORDER_ENTRY_PARSE_DRAG_INPUT_FIX` | **Synthetic** | Seed price ≠ 0 |
| TAL-00752#20 | Repeated X to close multi-entry | close-hittarget family | **Harness** H-S58 | **needs real mouse PO** |
| TAL-00752#22 | Stacked entries stuck | close-hittarget + stack offsets | **Harness** H-S58 | **needs real mouse PO** |

**Also code-fixed (worker reports; registry HEAD still `user_replied`):**

| Bug ref | Switch | Notes |
|---------|--------|-------|
| TAL-00752#18 | `__TALARIA_DISABLE_ORDER_TYPE_RECLASSIFY_V2` | Limit→market reclass on move; prior T4 steps — **needs-live-confirm** |

### B.2 — `still-open` / held

| Bug ref | Symptom | Disposition | Hold reason |
|---------|---------|-------------|-------------|
| **TAL-00752#4** | Replay + drag limit glitches SL | **still-open — HELD** | Replay×drag cross-track; post-b1 order-manager slot |
| **TAL-00752#5** | Keyboard pan glitches order in replay | **still-open — HELD** | Replay×keyboard-pan cross-track pair with #4 |
| TAL-00752#2 | Delete first entry → second stuck 0.00 | user_replied | Not in T4 step 10 bucket |
| TAL-00752#3 | TP/SL flicker each replay candle | user_replied | RC-5 visual; separate `__TALARIA_DISABLE_TP_REPLAY_FLICKER_FIX` |
| TAL-00752#6 | Average entry stuck | user_replied | Not fixed |
| TAL-00752#7 | Risk split stays 50 | user_replied | Not fixed |
| TAL-00752#12 | Trailing zero zeroes lot | user_replied | Not fixed |
| TAL-00752#16 | PNL wrong after TP1 | user_replied | Not fixed |
| TAL-00752#17 | SL/TP lines missing below 10 | user_replied | Not fixed |
| TAL-00752#21 | Replay fill wrong candle | user_replied | needs-live-confirm (A3) |
| TAL-01361#1 | Limit cancel shows TP/SL | **open** | Not fixed |
| TAL-01001#1, TAL-01021#1, TAL-01035#1 | Misc order-entry | user_replied | Not fixed |
| TAL-00704#1, TAL-00749#1, TAL-00774#1, TAL-00998#1 | Misc | user_replied | Not fixed |

### B.3 — #4/#5 cross-track hold (explicit)

| Pair | Interaction | Unblock |
|------|-------------|---------|
| **#4** | `ReplaySystem` tick → `order-manager._syncPreviewToReplayPrice` races SL drag handler | Lane 2 b1/cadence stable + dedicated order-manager replay-drag slot |
| **#5** | Keyboard pan shifts scale while replay draft preview coords stale | Lane 2 pan policy committed (D-017) + order-manager scale refresh on pan |

**Do not implement #4/#5 during M4 or combined-build unfreeze without Manager dispatch** — collision with active `replay-system.js` (+110 lines uncommitted) and D-017 `chart.js` zones.

---

## Appendix C — Combined-build PO live-confirm checklist

Run on **real built product** (`build:live` served, build id confirmed inside panel iframe). Toggle switches OFF to repro legacy bugs where noted.

### RC-5 — fixed_pending_live (11 rows)

| # | Steps | Pass criterion |
|---|-------|----------------|
| **#1** | Multi-entry BUY, one stop leg | Stop preview line **blue** (#2962ff), not sell-red |
| **#8** | Lot-size mode → click lot `+` | `orderQuantity` updates immediately, no flicker to 0 |
| **#9** | Limit multi-entry → add 2nd entry | 2nd spawns **below** main (BUY) / above (SELL), not at TP band |
| **#10** | Draft order → click chart ✕ | Closes on **first** click (expanded hit-pad) |
| **#11** | Pending SELL limit multi-entry → drag SL | SL can sit **above** highest entry before place |
| **#13** | 1RR two-entry setup | Neither entry preview incorrectly faded/red |
| **#14** | Chart preview ✕ during draft | Rail closes, draft cleared, menu inactive |
| **#15** | Classic panel SL/TP `+/-` steppers | Preview lines + RR readout update immediately |
| **#19** | Entry set, SL/TP at 0 → first `+` | Jumps to entry ± 10 pips, not 0.00001 |
| **#20** | Two multi-entry levels → remove one via ✕ | Single click removes level; splitEntries syncs |
| **#22** | Stack two entries same price → drag | Legs remain separable, not stuck on top |

**Switch-off repro:** set each `__TALARIA_DISABLE_ORDER_ENTRY_*_FIX = true` in console; repeat failing row.

### RC-6 — landed mechanisms (M1–M3, M5)

| Mech | Steps | Pass criterion |
|------|-------|----------------|
| **M1** | Add RSI | Store count === 1; remove → count 0 |
| **M2** | Hide/show volume via legend eye | Bars toggle; show restores values without divider drag |
| **M3** | Open RSI settings → change period → save | Plot + legend length match bar count immediately |
| **M5** | Add RSI + EMA → full page reload | Exactly 2 indicators, no duplicates in legend/store |

**M4 (gated):** Replay play + legend sync — run only after M4 implement lands.

**M6 (parked):** Pane divider / multichart isolation — defer to re-migration track.

### I15 — rows requiring extra real-actuation (not harness/property alone)

| Row / area | Why flagged |
|------------|-------------|
| TAL-00752#10, #20, #22 | H-S58 harness uses synthetic pointerdown — **PO real mouse required** |
| TAL-00752#14 | V9 React rail may bypass manager cleanup — confirm host + iframe |
| TAL-00752#15 | V9 React rail separate wiring — confirm classic + V9 paths |
| TAL-00752#9 | Screen Y placement in multichart iframe not property-tested |
| **All RC-6 M1–M5** | Node/vm store tests only — **built-product required** |
| TAL-00752#4, #5 | **Still-open** — no green claim; live repro capture only |

---

## Appendix D — Combined-build unfreeze prerequisites (D-018 #4)

Before PO runs Appendix C on a single combined build:

1. Lane 2 D-017 snap-back committed on `chart.js`.
2. Lane 2 `replay-system.js` stable (no concurrent +110-line conflict).
3. T8 b1 / finest-TF cadence clear or isolated.
4. Re-migration Phase 0 frozen (Lane 4).
5. `PER-BUG-REGISTRY.csv` `fixed_pending_live` deltas committed (Manager).
6. M4 implement dispatch (optional for RC-6 replay rows — can partial-unfreeze M1–M3/M5 first).

---

## Appendix E — HEAD commit chain (Lane 3 RC-6)

```text
3502177c  T6: RC-6 Phase 1 IndicatorLifecycleStore (M1)
314fbb3d  T6: RC-6 Phase 2 unified indicator visibility (M2)
db82aed4  T6: RC-6 Phase 3 settings-apply invalidation (M3)
40be56dd  T6: RC-6 Phase 5 persist/rehydrate race fix (M5)
0d95b05d  T6: M4 replay-recalc diagnostic report (read-only)
```

**RC-5 order-entry:** `baf2ab12` (families #8/#19 + remaining-open-8 bucket).
