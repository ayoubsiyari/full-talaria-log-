# T7 step 2 — multichart + replay closure sweep (READ-ONLY)

## 1. Task + RC

- **Task:** `T7-step2-lane2-multichart-replay-closure-sweep-READONLY.md` — interim accounting: RC-8 replay + RC-4 multichart tickets vs landed/queued fixes; map RC-4 to re-migration phases P1–P6; I15-gap flags.
- **RC:** Tooling/triage — no RC discharged. Feeds T7 backlog + post-ESC-016 execution readiness.
- **Authoritative harness baseline:** T0 step 17 honest actuation on **20260715b1** — `reactParity` **13 expected / 12 known-failing** (only H-R12A green). Supersedes T7-prep b88 “11 closed” counts for **acceptance** (D-012 retraction).

---

## 2. What I changed — file by file

**No product, harness, or registry edits.**

| File | Change |
|------|--------|
| `docs/tickets-overhaul/worker-reports/T7-step2-multichart-replay-closure-sweep-READONLY-report.md` | This report (deliverable). |

**Registry row proposals** — text for Lane 4 combined commit (§9); not written to CSV.

---

## 3. Kill-switch (I3 + I13)

N/A — read-only. Closure table cites landed switches:

| Switch | Landed step | Discharges |
|--------|-------------|------------|
| `__TALARIA_MC_DISABLE_PLAY_EDGE_PARK_ADVANCE` | T8 step 5 (a4) | TAL-01590 / mixed-TF edge-park (D-015) |
| `__TALARIA_REPLAY_SESSION_PLAYHEAD_RESTORE` | T8 step 7 (a4) | PLAN2-FOUND#5 refresh persistence |
| `__TALARIA_MC_DISABLE_BOOT_HOST_REANCHOR` | T8 step 7 Track B | H-S28 boot reanchor |
| `__TALARIA_MC_PANEL_TF_LABEL_SYNC` | T8 step 9 (a5) | PLAN2-FOUND#6 TF label |
| `__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE` | T8 step 13 (b1) | ESC-014 cadence / TAL-01563 |
| `__TALARIA_DISABLE_MULTICHART_PANEL_SELECTION_CHROME_ROUTING_V3` | T3 step 4 | Routing (re-migration P2) |
| `__TALARIA_DISABLE_MULTICHART_PEER_DESELECT_V1` | T3 step 5 | Peer isolation (P5) |
| Fallback-B predicates | T1 Fallback-B | Explains H-S34/35/44 + honest 12 RED |

---

## 4. Proof — RED → GREEN

**No new runs.** Evidence from accepted worker reports + `known-failing.json` (step 17).

| Surface | Build | Honest harness? |
|---------|-------|-----------------|
| Replay landed fixes | a4 / a5 / b1 | H-S59b, H-S79, H-S80, H-S83 — host harness, real end-state where noted |
| Interaction “landed” T1/T3 | b44 / b88 | **Retracted** on b1 honest reactParity (12 RED) — not current closure |
| Post-b1 queue | — | H-S25, #4/#5 plans only; H-S30 isolated 13/13 PASS (step 16 peer-fetch not reproduced) |

---

## 5. Invariants checked

| Invariant | How |
|-----------|-----|
| **I15** | Each row names actuation + measured end-state; I15-gap flags explicit |
| **D-012** | b1 honest baseline preferred over pre-retraction b88 greens |
| **D-010** | PO-confirmed items labeled separately from harness-only |
| **Deploy freeze** | Replay fixes noted as staging; interaction deferred-to-remigration |

---

## 6. What I did NOT do / limits

- No `TICKET-REGISTRY.csv` / `PER-BUG-REGISTRY.csv` writes.
- Did not re-run `gate:react` or full gate on b1.
- **TAL-01590** not present in `TICKET-REGISTRY.csv` — disposition from MANAGER-FINDINGS / T8 reports only (registry gap).
- T7-prep (~28 still-open) not re-enumerated ticket-by-ticket; this sweep **updates** landed/queued RC-8 + RC-4 against current baseline.
- RC-2 tickets (TAL-01484, 01488, H-S50 repaint) listed but **out of remigration P1–P6** — T2 track.

---

## 7. Live-verification handoff

| Family | PO action | Build |
|--------|-----------|-------|
| Replay freeze (01590) | Confirm none stuck, mixed TF | **a4** (PO-confirmed per Manager) |
| Refresh persistence | Reload → same playhead, one step | **a4** |
| TF label after refresh | Panel B 15m → reload → topbar 15m | **a5** (PO-confirmed) |
| Finest-TF cadence | 4h panel sub-candle feel vs coarse jumps | **b1** (awaiting A/B) |
| Interaction | **Do not close** until re-migration P1–6 + parity checklist | post-unfreeze build |

---

## 8. Status

**DIAGNOSTIC-ONLY** — closure table + phase map ready for post-ESC-016 execution.

---

## 9. Closure table — RC-8 replay (landed + queued + open)

| Ticket / item | Symptom | Fixed-by | Evidence | Status | I15 |
|---------------|---------|----------|----------|--------|-----|
| **TAL-01590** (intake; **not in registry CSV**) | Independent-symbol panels freeze during replay play | T8 step 3 + **step 5** unified edge-park (`__TALARIA_MC_DISABLE_PLAY_EDGE_PARK_ADVANCE`) | H-S59b PASS (a1+); PO **none stuck** on **a4** (Manager) | **PO-confirmed** (staging) | Harness stub can mask switch A/B — PO is authoritative |
| **Edge-park unified** (D-015 / ESC-013) | Same-symbol mixed-TF panel stuck until TF change | T8 step 5 `panel-cmd-bridge.js` unified PLAY block | H-S59b-sameTF / coarse dev GREEN-SYNTHETIC; PO a4 confirm | **PO-confirmed** (with 01590) | Same-TF cells weaker harness proof |
| **PLAN2-FOUND#5** refresh persistence | Playhead jumps on refresh; viewport hide (H-S28) | T8 step 7 — `__TALARIA_REPLAY_SESSION_PLAYHEAD_RESTORE` + boot reanchor | H-S79 PASS; H-S28 PASS (a4) | **fixed_pending_live** | Honest host harness |
| **PLAN2-FOUND#6** TF label (#6) | Parent topbar stuck 1m after panel refresh | T8 step 9 — `__TALARIA_MC_PANEL_TF_LABEL_SYNC` | H-S80 PASS (a5); PO-confirmed per Manager | **PO-confirmed** | Built-V9 + shell harness |
| **ESC-014 / finest-TF cadence** | Coarse panel cadence / TAL-01563 chunkiness | T8 step 13 — `__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE` | H-S83 PASS; cost probe WITHIN_BUDGET (b1) | **needs-live** (PO A/B on **b1**) | Harness GREEN; PO feel-check pending |
| **TAL-01582** | Tick mode falls back to candle loop | Lane 3 A3 — `__TALARIA_FIX_REPLAY_MODE_PLAY_ROUTING` | Registry `fixed_pending_live` | **fixed_pending_live** | A3 property tests — not multichart iframe |
| **TAL-01581** | Interval replay broken | — | No landed fix in sweep scope | **still-open** | No honest multichart scenario |
| **TAL-01563** | Group advance + mismatch | Ruled documented-intentional; cadence fix may address feel | T8 step 13 + Director note | **needs-live** (retest post-b1) | Reopen only if PO flags after cadence A/B |
| **TAL-01562** | Price gaps during manual replay | — | RC-8 data path | **still-open** | No dedicated honest row |
| **TAL-01575** | Replay start shifts viewport | — | Overlaps H-S28 family partially | **still-open** | H-S28 green ≠ this symptom proven |
| **TAL-01579** | Snap-back on release | T8 step 11 diagnostic; H-S73 ≠ TAL-01579 | H-S82 proposed pin | **queued-post-b1** | Diagnostic only |
| **TAL-01578** | Drag freeze during replay | BL-16 / H-S78 micro-pan | T8 step 1 coverage | **still-open** | H-S78 A9 partial |
| **TAL-01492** | Replay + price label freezes tool | — | RC-8 × drawing | **still-open** | No honest row |
| **H-S25** seam | Same-TF eased follow bar leap | T8 step 14 plan (Fix A2) | 0/3 FAIL-REAL-BUG; cadence A/B flat | **queued-post-b1** | Honest harness |
| **TAL-00752 #4** | Replay × drag limit → SL glitch | T8 step 15 plan | No harness scenario | **queued-post-b1** | **I15 gap** |
| **TAL-00752 #5** | Keyboard pan × order entry in replay | T8 step 15 plan | No harness scenario | **queued-post-b1** | **I15 gap** |
| **H-S30** | Host step-spam / peer B fetch | Step-spam guard landed; peer fetch intermittent | Isolated **13/13 PASS** (step 14); step 16 **0/3** peerB=2 | **needs-live** / promote? | Honest when RED; current green |
| **H-S73** | B-FIX-C prepend compensation | — | 0/3 FAIL-REAL-BUG tracked | **queued-post-b1** | Honest harness |

---

## 10. Closure table — RC-4 multichart interaction (registry `open` + harness)

### A — Honest reactParity rows (b1 baseline — **deferred-to-remigration**)

Prior T1/T3 steps landed fixes that were **GREEN on b88**; step 17 **retracted** them on honest actuation. Status below is **execution readiness**, not PO closure.

| Row | Symptom | Prior fix (code exists) | b1 honest harness | Re-migration phase | Status |
|-----|---------|-------------------------|-------------------|-------------------|--------|
| H-R01 | Select + parent V9 bar | T3 step 4 routing V3 | RED | **P2** | **deferred-to-remigration** |
| H-R02 | Blue border / store select | T1 step 3 lifecycle (iframe OFF) | RED | **P1** | **deferred-to-remigration** |
| H-R03 | Ctrl multi-select | Lifecycle + routing | RED | **P1** | **deferred-to-remigration** |
| H-R04 | Dbl-click → settings | T3 step 4 + T1 step 15 | RED | **P2 + P3** | **deferred-to-remigration** |
| H-R05 | Esc deselect + close | T1 step 17 | RED | **P4** | **deferred-to-remigration** |
| H-R06 | Delete removes drawing | T1 step 17 | RED | **P4** | **deferred-to-remigration** |
| H-R07 | Peer single-owner | T3 step 5 peer V1 | RED (step 17); green in later reconcile | **P5** | **deferred-to-remigration** |
| H-R08 | Ctrl+drag marquee | T1 step 16 panel only | RED host+panel store | **P6** | **deferred-to-remigration** |
| H-R09 | Full select chain | Steps 4+17 composite | RED | **P2+P3+P4** | **deferred-to-remigration** |
| H-R12 | Gear → settings | T1 step 14 | Not in knownFailing (may green) | **P2+P3** | **needs-reverify** on unfreeze |
| H-R13 | Settings flash persist | T1 step 15 | RED | **P3** | **deferred-to-remigration** |
| H-R14 | Panel-B marquee | T1 step 16 | RED | **P6** | **deferred-to-remigration** |

### B — Registry tickets → phase + status

| Ticket | Symptom | Harness / fix link | Phase | Status |
|--------|---------|---------------------|-------|--------|
| TAL-01494 | Settings flash close | H-R13 / step 15 | **P3** | **deferred-to-remigration** |
| TAL-01495 | Drawing flashes wrong symbol | H-S45 | **P7** (ownership) + **P5** | **still-open** |
| TAL-01498 | Ctrl-select wrong on other layouts | H-S46 | **P1 + P5** | **still-open** |
| TAL-01499 | Quick menu delayed after draw | H-S47 | **P2** | **still-open** |
| TAL-01500 / 01501 | Indicator leak across panels | H-S48 | **P7** | **still-open** |
| TAL-01568 | Brush won't move until clicked | H-S32; lifecycle iframe OFF | **P1** | **deferred-to-remigration** |
| TAL-01569 | Ctrl-drag stuck / release select | H-R03 partial | **P1 + P6** | **needs-live-confirm** |
| TAL-01571 | Layout resets on refresh | H-S51 / step 5 | **P5** (layout persist) | **needs-live-confirm** (code landed b85) |
| TAL-01574 | Chart below fold | H-S52 / step 5 | **P5** | **needs-live-confirm** |
| TAL-01576 | Add-layout menu flash | — | **P2** (React chrome) | **still-open** |
| TAL-01586 | Symbol sync converge | H-S53 / step 5 | **P5** | **needs-live-confirm** |
| TAL-01587 | Drag past tile boundary | H-S49 | **P6** adjacency | **still-open** |
| TAL-01578 | Drag freeze | H-S78 / BL-16 | — (replay) | **still-open** |
| TAL-01579 | Snap-back grab point | H-S82 pin (T8) | — (replay) | **queued-post-b1** |
| TAL-01484 / 01490 | Stuck until click zoom/reset | H-S50 | — (**RC-2**) | **still-open** |
| TAL-01489 / 01488 | Layout/replay tap glitch | — | — (**RC-2**) | **still-open** |
| TAL-01502 | Price mismatch across panels | H-S53 partial | **P5** + data | **still-open** |
| TAL-01560 / 01561 | Gaps / slow render | — | — (**RC-2**) | **still-open** |
| H-S34 / 35 / 44 | Migration scenarios | Fallback-B OFF | **P5** | **deferred-to-remigration** |
| H-S45–H-S50 | RC-4 contract family | T0 step 7 | **P7** | **still-open** (migration OFF) |
| PLAN2-FOUND#3 | Objects Tree duplication | — | **P5** + sync-bridge | **still-open** (no harness) |

---

## 11. Ticket → re-migration phase map (RC-4 execution readiness)

| Phase | Discharges (harness) | Registry tickets folded in | Primary files | Blocked by |
|-------|---------------------|---------------------------|---------------|------------|
| **P1** Engine selection | H-R02, H-R03 | TAL-01568, 01569 (partial), 01584 adjacency | `tool-lifecycle-store.js`, `drawing-tools-manager.js`, `chart.js` | ESC-016; Lane 1 |
| **P2** Chrome routing | H-R01, H-R12 | TAL-01499, 01576 (partial) | `MultichartGrid.jsx`, `TalariaV8bLive.jsx` | P1 |
| **P3** Settings transport | H-R04, H-R13, H-R09 leg | TAL-01494 | `MultichartGrid.jsx`, `drawing-tools-ui.js` | P2 |
| **P4** Keyboard I14 | H-R05, H-R06, H-R09 Esc | — (TAL-00752 #5 adjacent) | `MultichartGrid.jsx`, `panel-cmd-bridge.js`, `keyboard-shortcuts.js` | P3; **avoid T8 replay bus collision** |
| **P5** Peer / ownership | H-R07, H-S34/35/44 | TAL-01498, 01502 (partial), 01571/74/86, Objects Tree | `MultichartGrid.jsx`, `multichart-manager.js` | P2–4 |
| **P6** Iframe marquee | H-R08, H-R14 | TAL-01569 (if retest fails), 01587 | `chart.js`, `drawing-tools-manager.js` | P1 |
| **P7** RC-3 parity (post-unfreeze) | H-S45–50, H-S40 panel-B | TAL-01495, 01500/01 | `sync-bridge.js`, engine draw | Interaction P1–6 + unfreeze |

**Replay tickets (RC-8) do not map to P1–P6** except **collision avoidance** on `panel-cmd-bridge.js` (P4 vs queued H-S25 / #4/#5).

---

## 12. I15-gap flags (no honest test backing a green claim)

| Item | Claimed green? | Gap |
|------|----------------|-----|
| **TAL-01590 / a4 edge-park** | PO-confirmed | H-S59b switch A/B unreliable in harness stub; **PO live on a4** is acceptance |
| **T8 step 5 same-TF/coarse cells** | Dev evidence | **GREEN-SYNTHETIC** — not proven for PO surface |
| **TAL-01582** | fixed_pending_live | A3 unit/harness — not built multichart iframe |
| **TAL-01571 / 74 / 86** | needs-live-confirm | H-S51–53 GREEN on **b85**; not re-run on **b1** honest reactParity |
| **T1/T3 H-R01–14 “closed” on b88** | Retracted | **12/12 RED on b1** — no honest green until P1–6 |
| **TAL-00752 #4 / #5** | queued | **No H-S84/H-S85** — plan only (step 15) |
| **H-S30 peer B fetch** | Inconsistent | step 16 0/3 FAIL vs step 14 13/13 PASS — classify before promote |
| **PLAN2-FOUND#3 Objects Tree** | still-open | No harness row |
| **TAL-01581 interval replay** | still-open | No honest scenario |
| **H-S83 / b1 cadence** | Harness PASS | **NEEDS-LIVE** PO A/B — not DONE (proven) |

---

## 13. Queued post-b1 (replay path — not remigration)

| Item | Owner | Depends on | Harness |
|------|-------|------------|---------|
| H-S25 seam continuity | T8 Lane 2 | PO b1 cadence A/B | H-S25 honest RED |
| TAL-00752 #4 replay×drag | T8 + order-entry | b1 + P4 keyboard slice | **None — I15 gap** |
| TAL-00752 #5 keyboard×replay | T8 + T3 | b1 + P4 | **None — I15 gap** |
| H-S30 peer fetch | T8 / baseline | Full gate re-run | H-S30 |
| H-S73 prepend | T8 RC-3 | Separate from 01579 | H-S73 |

---

## 14. Registry proposals (Lane 4 — hand text only)

```csv
TAL-01590,replay,multichart_layouts,replay-freeze,RC-8,resolved_pending_prod,"Independent-symbol replay play freeze",T8 step 3+5 edge-park D-015; PO-confirmed a4; H-S59b; registry row missing — add
T8-HS25#1,,chart_core_ui,eased-follow-seam,RC-8,queued_post_b1,"Same-TF eased follow bar seam",T8 step 14 diagnostic; H-S25 0/3; not cadence beneficiary
T8-HS30#1,,chart_core_ui,replay-step-spam,RC-8,needs_verify,"Host step-spam peer isolation",§6cs guard landed; peerB fetch intermittent — reconcile before promote
TAL-00752#4,TAL-00752,orders,replay-interaction,RC-8,queued_post_b1,"Replay drag limit SL glitch",T8 step 15 plan; no harness — I15 gap
TAL-00752#5,TAL-00752,orders,replay-interaction,RC-8,queued_post_b1,"Keyboard pan order glitch in replay",T8 step 15 plan; no harness — I15 gap
T3-REMIGRATION,meta,multichart_layouts,interaction-parity,RC-4,deferred,"12 honest reactParity REDs",T3-REMIGRATION-PLAN P1-P6; await ESC-016
```

---

## 15. Summary counts (this sweep)

| Bucket | PO-confirmed | fixed_pending_live | needs-live | queued-post-b1 | deferred-to-remigration | still-open |
|--------|-------------|-------------------|------------|----------------|-------------------------|------------|
| **RC-8 landed/queued** | 3 (01590, edge-park, TF label) | 2 (refresh, 01582) | 2 (cadence b1, H-S30) | 4 (H-S25, #4, #5, H-S73) | 0 | 6+ |
| **RC-4 interaction** | 0 | 0 | 3 (layout rows) | 0 | **12 H-R*** + H-S34/35/44 | ~20 registry |

**Critical path:** ESC-016 → execute **P1→P6** per [`T3-REMIGRATION-PLAN.md`](../T3-REMIGRATION-PLAN.md) → empty `reactParity.knownFailing` → lift deploy freeze. Replay staging (a4/a5/b1) can ship independently of interaction unfreeze per D-012.
