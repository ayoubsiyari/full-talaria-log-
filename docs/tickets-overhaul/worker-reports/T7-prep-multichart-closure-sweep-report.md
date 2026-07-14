# T7-prep (Lane 2) — multichart + drawing-interaction closure sweep

**Task:** T7-prep Lane 2 — disposition sweep for every multichart / drawing-interaction / selection / toolbar / iframe ticket against landed T1/T3 fixes.  
**Type:** Read-only / registry — no product edits.  
**Date:** 2026-07-14  
**RC:** Tooling/triage — no RC discharged; feeds T7 backlog sweep (P5 prep).

**Canonical live-confirm build:** **`20260712b88`** (T1 step 17 Esc/Delete + T3 step 5 peer/layout/symbol on same gate run). Earlier evidence builds noted per row where the fix first landed (b17 step 14; b44 step 4 routing; b85 step 5 rows 13–15).

**Harness baseline (accepted reports + `t3-step5-gate-react.txt` on b88):** `gate:react` **PASS** — **1** tracked-red: **H-R08** (host Ctrl+drag marquee during-drag). **H-R09 GREEN** (select → dbl-click settings → Esc chain). Shell gate still tracks H-S34/35/44 (fallback-B), H-S45–H-S50 (migration-OFF RC-4 family).

**Registry note:** `known-failing.json` in the working tree may show stale DISCREPANCY reconcile strings for H-R01/04/05/06/07/09/14; disposition below follows **accepted worker reports** and the b88 gate log, not the stale reconcile text.

---

## 1. Task + RC

| Field | Value |
|---|---|
| Task id | T7-prep — multichart + drawing-interaction closure sweep |
| Goal | Disposition every multichart/drawing/selection ticket against landed T1 steps 14–17, T3 steps 4–5, T1 step 3 lifecycle, T2 step 1 invalidation, Fallback-B |
| RC | Diagnostic/triage only — no fix |

---

## 2. What I changed — file by file

N/A — read-only/registry task. No files touched.

---

## 3. Kill-switch (I3 + I13)

N/A — no switches introduced. Disposition table cites existing switches from landed steps:

| Switch | Landed step | Discharges |
|---|---|---|
| `__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2` | T1 steps 14–17 | Legacy toolbar kill, settings flash, panel-B marquee, gear routing |
| `__TALARIA_DISABLE_MULTICHART_PANEL_SELECTION_CHROME_ROUTING_V3` | T3 step 4 | H-R01, H-R04 (panel-B → parent V9 chrome) |
| `__TALARIA_DISABLE_MULTICHART_PEER_DESELECT_V1` | T3 step 5 | H-R07 peer isolation |
| `__TALARIA_DISABLE_LAYOUT_PERSIST_V2` | T3 step 5 row 13 | H-S51 / TAL-01571 |
| `__TALARIA_DISABLE_SYMBOL_SYNC_CONVERGE_V2` | T3 step 5 row 15 | H-S53 / TAL-01586 |
| `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2` | T1 step 3 | H-S32/H-S33 first-click + ghost-after-delete (single-chart ON; iframe default OFF per Fallback-B) |
| `__TALARIA_DISABLE_DRAWING_SAVE_INVALIDATION_V2` | T2 step 1 | H-S38/H-S39 style-save repaint |
| Fallback-B (migration predicates OFF) | T1 Fallback-B | Explains H-S34/35/44/45–50 still tracked-red — not regressions |

---

## 4. Proof — RED → GREEN

N/A — no new proof run. Evidence cited from accepted worker reports:

- T1 steps 14–17 (`T1-step14-iframe-legacy-toolbar-kill-report.md` through `T1-step17-panelB-esc-delete-report.md`)
- T3 steps 4–5 (`T3-step4-panelB-interaction-root-report.md`, `T3-step5-peer-isolation-rows1315-report.md`)
- T1 step 3 lifecycle (`T1-step3-lifecycle-impl-report.md`)
- T2 step 1 invalidation (`T2-step1-invalidation-assertion-sweep-report.md`)
- Fallback-B (`T1-fallbackB-disable-multichart-migration-report.md`)
- Gate artifact: `chart v 1.4/chart/multichart-prod/harness/t3-step5-gate-react.txt` (build **b88**)

---

## 5. Invariants checked

| Invariant | How satisfied |
|---|---|
| P3 | Still-open rows include RC guess + one-line mechanism + owning lane |
| P5 | Each closed/needs-live-confirm row names switch/step + harness row + build |
| P6 | Instability-window tickets explicitly mapped to steps 14–17 vs still-open |
| D-010 | Disposition labels match accepted built-product proof surfaces, not dev:live |

---

## 6. What I did NOT do / limits

- Did not re-run harness, gate, or live product — disposition is registry synthesis only.
- Did not reconcile `PER-BUG-REGISTRY.csv` or `TICKET-REGISTRY.csv` status columns; Manager/T7 should sync on PO confirm.
- Fallback-B means several H-S45–H-S50 tracked-reds are **intentional migration-OFF baselines**, not proof that the underlying PO symptom is fixed.
- Single-chart vs multichart iframe paths diverge for lifecycle V2 (Fallback-B); PO must retest instability tickets on **both** surfaces.
- Drawing-tool catalog tickets (TAL-00xxx fib/brush families) are not individually re-triaged here unless they map to a landed harness row; bulk first-click family deferred to lifecycle live-confirm.

---

## 7. Live-verification handoff

PO should confirm on build **`20260712b88`** (unregister service worker; verify build id in host **and** panel-B iframe).

| Family | Spot-check |
|---|---|
| Selection → parent chrome | 2v layout: click drawing on panel B → parent V9 quick bar appears (H-R01) |
| Settings flash | Double-click blue handles on panel B → settings stay open ≥400ms (H-R13) |
| Panel-B marquee | Ctrl+drag on panel B → blue border + multi-select (H-R14) |
| Esc / Delete chain | Select → open settings → Esc clears selection + settings (H-R05/H-R09); Delete removes drawing (H-R06) |
| Peer isolation | Draw on A and B; select A then B → only B selected (H-R07) |
| Layout persist | Set 2v, refresh → layout restores (H-S51 / TAL-01571) |
| Tile geometry | Resize grid; panel B chart must not vanish below fold (H-S52 / TAL-01574) |
| Symbol sync | Toggle sync OFF→ON with B focused → all panels converge (H-S53 / TAL-01586) |
| **Known still-open** | Host tile Ctrl+drag → marquee border should draw during drag (H-R08 — expect **FAIL** until fix lands) |
| Instability retest | Run `INTAKE-RETEST-2026-07-13.md` table on b88 before scheduling new Lane 1 work |

Kill-switch spot-checks (optional): set each `window.__TALARIA_*` disable flag per originating step report and confirm legacy RED returns.

---

## 8. Status

**DIAGNOSTIC-ONLY** — disposition table complete; no fixes applied.

---

## Disposition table

### A — Instability-window retest (`INTAKE-RETEST-2026-07-13.md`)

| Ticket | Symptom | Disposition | Evidence (switch / step / harness) | Live build |
|---|---|---|---|---|
| TAL-01568 | Brush doesn't move until clicked first | **needs-live-confirm** | T1 step 3 — `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2`; H-S32 GREEN (armed-tool first-click). **Caveat:** Fallback-B disables lifecycle V2 in iframe embeds by default — retest on single-chart AND panel B | b88 |
| TAL-01569 | Ctrl-select: chart stuck during drag; selection on Ctrl **release** | **needs-live-confirm** | Harness H-R03 GREEN (Ctrl-select keeps both, no double-toggle) on b88 — symptom may be single-chart drag-freeze or release-only commit, not covered by multichart parity rows. If reproduces on single-chart → **still-open** Lane 1 | b88 |
| TAL-01570 | Crosshair at chart center when clicking tool | **needs-live-confirm** | No dedicated harness row; adjacent to lifecycle/chrome routing (T1 step 3 + T3 step 4). No direct proof — instability-window retest first | b88 |
| TAL-01578 | Drag freeze — chart cannot be moved | **needs-live-confirm** | No landed T1/T3 fix. INTAKE routes to T8 if replay-only; **if reproduces outside replay → still-open T3/Lane 2 pan handler** | b88 |
| TAL-01579 | Chart snaps back to grab point on release | **still-open** | T8 plan-1 boot-shake/index-pin family; no T1 step 14–17 or T3 step 4/5 coverage | — |
| TAL-01584 | Crosshair returns to tool **previous** position on Ctrl-hold | **still-open** | Resurfacing TAL-00157#5/#10 (label/crosshair desync on Ctrl); Esc/H-R05 does not address crosshair anchor during Ctrl-hold | — |
| TAL-01587 | Drag past layout boundary loses control (host tile) | **still-open** | H-S49 tracked-red (TAL-01491/01587); T3 row 11 reopened — cursor-leaves-tile drag survival not in steps 14–17 | — |

**Instability summary:** 0 closed-by-landed-fix · 4 needs-live-confirm · 3 still-open.

---

### B — React parity harness (RC-1 / RC-4 selection family)

| Row | Symptom | Disposition | Evidence (switch / step / harness) | Live build |
|---|---|---|---|---|
| H-R01 | First click selects + parent V9 quick bar (host + panel B) | **closed-by-landed-fix** | T3 step 4 — `__TALARIA_DISABLE_MULTICHART_PANEL_SELECTION_CHROME_ROUTING_V3`; 10/10 on b44; PASS on b88 gate | b88 (confirm) |
| H-R02 | Selected drawing shows blue border / handles | **closed-by-landed-fix** | Collateral GREEN post routing V3 + gear-fix family; PASS b88 gate | b88 (confirm) |
| H-R03 | Ctrl-select keeps both drawings | **closed-by-landed-fix** | PASS b88 gate; does **not** automatically close TAL-01569 if single-chart drag-freeze persists | b88 (confirm) |
| H-R04 | Double-click opens settings (host + panel B) | **closed-by-landed-fix** | T3 step 4 routing + T1 step 15 postMessage-first; PASS b88 gate | b88 (confirm) |
| H-R05 | Esc clears selection + settings | **closed-by-landed-fix** | T1 step 17 — gear-fix switch gates Esc/Delete postMessage; 10/10 b88 | b88 (confirm) |
| H-R06 | Delete removes selected drawing | **closed-by-landed-fix** | T1 step 17; PASS b88 gate | b88 (confirm) |
| H-R07 | Cross-panel select: only one panel owns selection | **closed-by-landed-fix** | T3 step 5 — `__TALARIA_DISABLE_MULTICHART_PEER_DESELECT_V1`; 10/10 b85; PASS b88 gate | b88 (confirm) |
| H-R08 | Ctrl+drag marquee border during drag | **still-open** | Host path only RED (`active:false,w:0,h:0`); panel-B GREEN (T1 step 16). Only tracked-red on b88 `gate:react` | — |
| H-R09 | Select → settings → Esc full chain | **closed-by-landed-fix** | Partial T3 step 4 (select/settings); Esc leg fixed T1 step 17; **PASS b88 gate** (was RED at step 4) | b88 (confirm) |
| H-R12 | No legacy `#drawing-toolbar` in panel-B iframe; gear opens settings | **closed-by-landed-fix** | T1 step 14 — `setV9PanelEmbed` + quickbar switch; 10/10 b17 | b88 (confirm) |
| H-R13 | Settings stay open (no flash-close race) | **closed-by-landed-fix** | T1 step 15 — iframe postMessage-first; PASS b88 gate | b88 (confirm) |
| H-R14 | Panel-B Ctrl+drag marquee + multi-select | **closed-by-landed-fix** | T1 step 16 — in-iframe synthetic Ctrl+drag + bounds fallback; PASS b88 gate | b88 (confirm) |

**Harness summary:** 11 closed-by-landed-fix · 0 needs-live-confirm · 1 still-open (H-R08).

---

### C — Shell harness rows tied to registry tickets (Fallback-B context)

| Row | Ticket(s) | Symptom | Disposition | Evidence | Live build |
|---|---|---|---|---|---|
| H-S32 | TAL-01568 (family) | Armed tool first-click selects | **needs-live-confirm** | T1 step 3 lifecycle; GREEN in shell gate; iframe path OFF under Fallback-B | b88 |
| H-S33 | ghost-after-delete family | Settings delete leaves ghosts | **needs-live-confirm** | T1 step 3 `toolDeleted` subscriber; GREEN shell gate | b88 |
| H-S38/H-S39 | style-save stuck | Style commit no repaint until click | **closed-by-landed-fix** | T2 step 1 — `__TALARIA_DISABLE_DRAWING_SAVE_INVALIDATION_V2` | b2+ (confirm b88) |
| H-S45 | TAL-01495 | Drawing flashes on other symbols then vanishes | **still-open** | Tracked-red T0 step 7; migration-OFF — panel drawing target routing not restored | — |
| H-S46 | TAL-01498 | Ctrl-select groups tools wrong on non-focused layouts | **still-open** | Tracked-red; H-R03 panel-local GREEN ≠ cross-layout parity | — |
| H-S47 | TAL-01499 | Quick Menu delayed after draw in multichart | **still-open** | Tracked-red; H-R01 parent bar GREEN ≠ immediate post-draw quick menu in iframe | — |
| H-S48 | TAL-01500/01501 | Indicator state leaks across panels/layouts | **still-open** | Tracked-red T0 step 7; migration-OFF indicator ownership | — |
| H-S49 | TAL-01491/01587 | Drag dies when cursor leaves tile / primary frame clamp | **still-open** | Tracked-red; T3 row 11 — out of steps 14–17 scope | — |
| H-S50 | TAL-01484/01490 | Peer repaint stuck until click (zoom/reset/blue-arrow) | **still-open** | Tracked-red; T2 step 3 diagnostic: peer sync + paused replay repaint gaps (RC-2) | — |
| H-S51 | TAL-01571 | Layout resets to single on refresh | **needs-live-confirm** | T3 step 5 row 13 — `__TALARIA_DISABLE_LAYOUT_PERSIST_V2`; 10/10 b85 | b88 (confirm) |
| H-S52 | TAL-01574 | Chart disappears below visible area | **needs-live-confirm** | T3 step 5 row 14 — `repaintAllPanelSurfaces`; 10/10 b85 | b88 (confirm) |
| H-S53 | TAL-01586 | Symbol sync should consolidate pairs | **needs-live-confirm** | T3 step 5 row 15 — `__TALARIA_DISABLE_SYMBOL_SYNC_CONVERGE_V2`; 10/10 b85 | b88 (confirm) |
| H-S34/35/44 | migration family | Migrated multichart behaviors | **CHANGED** | Fallback-B intentional tracked-red — restore when T1 re-migration lands; not PO closure | — |

---

### D — July 4 multichart batch (`TICKET-REGISTRY.csv` open)

| Ticket | Symptom (registry) | Disposition | Evidence / mechanism | Live build |
|---|---|---|---|---|
| TAL-01480 | Re-rendering on same symbol / replay | **still-open** | RC-2/RC-3 excessive repaint on symbol-TF/replay switch; no step 14–17 fix | — |
| TAL-01484 | Zoom/reset only applies after screen tap | **still-open** | H-S50 / RC-2 peer command repaint without `scheduleRender()` — T2 step 3 diagnostic | — |
| TAL-01488 | Replay Ctrl+R glitch until click | **still-open** | RC-2 replay reset invalidation; overlaps H-S50 family | — |
| TAL-01489 | Multi-layout tap glitch on replay/switch | **still-open** | RC-2/RC-4 layout switch + replay bus stale surface | — |
| TAL-01490 | Blue-arrow restore on second chart needs click | **still-open** | H-S50 / TAL-01484 peer repaint — same RC-2 mechanism | — |
| TAL-01491 | Primary chart stops when dragged outside frame | **still-open** | H-S49 — tile bounds / host drag clamp; T3 row 11 | — |
| TAL-01494 | Double-click blue dots: settings flash then close | **closed-by-landed-fix** | T1 step 15 H-R13 + step 17 Esc chain; same RC-1 routing race | b88 (confirm) |
| TAL-01495 | Rectangle flashes on other symbols then disappears | **still-open** | H-S45 tracked-red; drawing target panel routing (migration OFF) | — |
| TAL-01496 | Data range ON → glitches / position shift on click | **still-open** | RC-2 linked zoom/range sync invalidation | — |
| TAL-01498 | Ctrl-select groups wrongly on other layouts | **still-open** | H-S46; cross-layout selection parity not restored under Fallback-B | — |
| TAL-01499 | Quick Menu not immediate after draw (multichart) | **still-open** | H-S47; post-draw quick-menu timing in iframe embed | — |
| TAL-01500 | Indicator toggle wrong on first click across layouts | **still-open** | H-S48 indicator ownership leak | — |
| TAL-01501 | Deleted indicators reappear on layout switch | **still-open** | H-S48 panel indicator store not isolated | — |
| TAL-01502 | Price differs but candle pattern matches across panels | **still-open** | RC-4 data-feed / sync semantics — H-S53 fixes converge toggle edge only, not initial price alignment | — |

**July 4 open summary:** 1 closed-by-landed-fix · 0 needs-live-confirm · 12 still-open · (TAL-01482 pending product decision — out of closure scope).

---

### E — July 13 multichart / drawing (beyond instability table)

| Ticket | Symptom | Disposition | Evidence / mechanism | Live build |
|---|---|---|---|---|
| TAL-01560 | Unexpected gaps on chart | **still-open** | RC-2 render/data gap — no landed fix | — |
| TAL-01561 | Rendering slow | **still-open** | RC-2 perf — no landed fix | — |
| TAL-01562 | Price gaps during manual replay | **still-open** | RC-8 replay data — Lane 3/A3 adjacent | — |
| TAL-01563 | Replay advances candle groups + mismatch | **still-open** | RC-8 cadence — A3 family (separate sweep) | — |
| TAL-01571 | Layout resets to single on refresh | **needs-live-confirm** | T3 step 5 row 13 / H-S51 | b88 |
| TAL-01573 | Manual rescale triggers full re-render | **still-open** | RC-2 rescale invalidation scope | — |
| TAL-01574 | Chart disappears below area | **needs-live-confirm** | T3 step 5 row 14 / H-S52 | b88 |
| TAL-01575 | Replay start shifts chart position | **still-open** | RC-3/RC-8 replay viewport pin | — |
| TAL-01576 | Add-layout menu flashes broken state | **still-open** | RC-4 React layout chrome — not in steps 14–17 | — |
| TAL-01577 | 1D/4H few candles; rescale gap; re-render | **still-open** | RC-2 data range + TF hydration | — |
| TAL-01585 | Drawing layer moves with chart during TF-switch wait | **still-open** | RC-3 anchor sync during TF transition | — |
| TAL-01586 | Symbol sync should consolidate pairs | **needs-live-confirm** | T3 step 5 row 15 / H-S53 | b88 |

---

### F — PER-BUG `multichart_layouts` rows (July 4 batch — `PER-BUG-REGISTRY.csv`)

| PER-BUG id | Ticket | Status in CSV | Disposition | Notes |
|---|---|---|---|---|
| TAL-01480#1 | TAL-01480 | open | **still-open** | See table D |
| TAL-01484#1 | TAL-01484 | open | **still-open** | H-S50 |
| TAL-01488#1 | TAL-01488 | open | **still-open** | Replay reset click-to-repaint |
| TAL-01489#1 | TAL-01489 | open | **still-open** | Layout tap glitch |
| TAL-01490#1 | TAL-01490 | open | **still-open** | H-S50 blue-arrow |
| TAL-01491#1 | TAL-01491 | open | **still-open** | H-S49 |
| TAL-01495#1 | TAL-01495 | open | **still-open** | H-S45 |
| TAL-01496#1 | TAL-01496 | open | **still-open** | Data range |
| TAL-01498#1 | TAL-01498 | open | **still-open** | H-S46 |
| TAL-01499#1 | TAL-01499 | open | **still-open** | H-S47 |
| TAL-01500#1 | TAL-01500 | open | **still-open** | H-S48 |
| TAL-01501#1 | TAL-01501 | open | **still-open** | H-S48 |
| TAL-01502#1 | TAL-01502 | open | **still-open** | Price alignment |
| TAL-01481#1–01497#1 | various | resolved/closed | **closed** (pre-July) | Outside T1/T3 window — no change |
| TAL-01482#1 | TAL-01482 | pending | **CHANGED** | Product decision (news on all charts?) — not a code closure row |
| TAL-01483#1,01485–01487,01493 | various | resolved | **closed** (pre-July) | Already resolved in registry |

---

### G — Drawing-lifecycle tickets steps 14–17 did NOT address

| Ticket / family | Symptom | Disposition | Owning lane |
|---|---|---|---|
| TAL-00157#5, #10 | Ctrl hides labels; Quick Menu stays without selection | **still-open** | Lane 1 — selection-menu desync on Ctrl-hold (RC-1) |
| TAL-00157#9, #11 | Label/crosshair stuck at old position while dragging | **still-open** | Lane 1 / T8 — label anchor vs crosshair (RC-3) |
| TAL-01584 | Crosshair snaps to tool prev position on Ctrl | **still-open** | Lane 1 (= #11 resurfacing) |
| TAL-01585 | Drawing layer drifts during TF-switch wait | **still-open** | Lane 1 RC-3 anchor sync |
| Drawing_tools `first-click-fails` catalog (TAL-00117, 00226, 00248, …) | Style/toggle needs second click | **needs-live-confirm** | Lane 1 — T1 step 3 H-S32; bulk PO retest, not per-tool harness |
| TAL-01492 | Replay + price label freezes drawn tool | **still-open** | Lane 3 replay × drawing (RC-8/RC-2); overlaps H-S50 |

---

## T1/T3 step coverage map

| Step | Switch(es) | Tickets / harness rows discharged |
|---|---|---|
| T1 step 14 | `__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2` | H-R12; iframe legacy toolbar kill |
| T1 step 15 | same | H-R13; TAL-01494 settings flash |
| T1 step 16 | same (parent-authoritative for iframe) | H-R14 panel-B; **not** H-R08 host |
| T1 step 17 | same | H-R05, H-R06; H-R09 Esc leg |
| T3 step 4 | `__TALARIA_DISABLE_MULTICHART_PANEL_SELECTION_CHROME_ROUTING_V3` | H-R01, H-R04; partial H-R09 select/settings |
| T3 step 5 | peer + layout + symbol switches | H-R07; H-S51/52/53 → TAL-01571/74/86 |
| T1 step 3 | `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2` | H-S32/33; candidate TAL-01568 |
| T2 step 1 | `__TALARIA_DISABLE_DRAWING_SAVE_INVALIDATION_V2` | H-S38/39 style-save repaint |
| Fallback-B | migration predicates OFF | H-S34/35/44 + H-S45–50 baseline — **not** PO closure |

**Uncovered by any landed step:** H-R08 host marquee; H-S45–50 migration family; instability still-open (01579, 01584, 01587); July 4 still-open batch (table D); render/replay/perf tickets 01560–01563, 01573, 01575–01577.

---

## Summary counts (multichart/drawing/selection scope)

| Bucket | closed-by-landed-fix | needs-live-confirm | still-open | CHANGED |
|---|---:|---:|---:|---:|
| Instability window (7) | 0 | 4 | 3 | 0 |
| React harness (12 rows) | 11 | 0 | 1 | 0 |
| Shell rows w/ tickets (13) | 1 (H-S38/39) | 3 | 8 | 1 (H-S34/35/44) |
| July 4 open tickets (13) | 1 | 0 | 12 | 0 |
| July 13 multichart (12) | 0 | 3 | 9 | 0 |
| **Approx. unique tickets** | **~14 harness-mapped closures** | **~10 PO retest** | **~28 need new tasks** | **1 policy (01482) + migration baseline** |

---

## Still-open list (Manager schedule — grouped by mechanism)

Priority for Lane 2 / T7; RC guess + one line (P3). **No fixes in this task.**

### Host marquee + Ctrl selection chrome (RC-1)

| Item | Mechanism |
|---|---|
| H-R08 | Host tile Ctrl+drag does not activate marquee overlay during drag (panel-B path fixed step 16; host uses parent mouse — no in-host synthetic Ctrl path) |
| TAL-01569 (if retest fails) | Single-chart Ctrl-drag may freeze pan until release — release-only selection commit not probed by H-R03 |

### Migration-OFF / panel ownership (RC-4) — restore with re-migration or targeted Fallback-B exceptions

| Item | Mechanism |
|---|---|
| TAL-01495 / H-S45 | Draw targets wrong panel briefly — peer drawing sync broadcasts before panel focus ownership resolves |
| TAL-01498 / H-S46 | Ctrl-select on non-focused layout collapses handles to one screen position |
| TAL-01499 / H-S47 | Post-draw quick menu in iframe waits for parent focus round-trip |
| TAL-01500–01501 / H-S48 | Indicator on/off state stored per-layout not per-panel — delete on B rehydrates on A switch |

### Peer repaint / stuck-until-click (RC-2)

| Item | Mechanism |
|---|---|
| TAL-01484, 01490 / H-S50 | Zoom/reset/blue-arrow posts peer command without `scheduleRender()` on passive panel |
| TAL-01488, 01489 | Replay/layout switch leaves stale canvas until pointer down forces repaint |
| TAL-01480, 01573 | Rescale or symbol switch triggers full re-render loop without coalescing |
| TAL-01496 | Data-range linked zoom applies range to unfocused panel without geometry settle |

### Tile drag / bounds (RC-3 / RC-4)

| Item | Mechanism |
|---|---|
| TAL-01491, 01587 / H-S49 | Host primary drag clamp stops pan when cursor exits tile bounds; secondary iframe unclamped |
| TAL-01579 | Release snap-back — viewport index pin fights drag delta (T8 boot-shake family) |
| TAL-01585 | TF switch wait moves drawing layer with pan instead of freezing world coords |

### Crosshair / label desync (RC-1 / RC-3)

| Item | Mechanism |
|---|---|
| TAL-01584, TAL-00157#5/#10 | Ctrl-hold restores crosshair to last tool anchor instead of pointer |
| TAL-01570 | Tool click recenters crosshair — lifecycle toolbar hide/show resets pointer origin |

### Data / layout chrome (RC-2 / RC-4)

| Item | Mechanism |
|---|---|
| TAL-01502 | Initial ticker load does not align last price across panels despite pattern match |
| TAL-01560–01561, 01577 | Gap/slow render — data hydration or excessive `scheduleRender` churn |
| TAL-01576 | Add-layout React menu flashes intermediate broken grid state |

### Replay-adjacent (RC-8 — coordinate with Lane 3)

| Item | Mechanism |
|---|---|
| TAL-01562–01563, 01575 | Replay cadence/viewport pin per layout not synchronized |
| TAL-01492 | Price-label click during replay freezes tool until chart click (invalidation) |

---

## Manager actions

1. **PO live-confirm batch on `20260712b88`:** H-R01–R07, R09, R12–R14 (closed harness family); H-S51/52/53 (TAL-01571/74/86); instability retest rows (01568–01570, 01578); TAL-01494 settings flash.
2. **Run `INTAKE-RETEST-2026-07-13.md` first** on b88 before dispatching new Lane 1 tasks for 01569/01570/01578 — several may be gone post steps 14–17.
3. **Registry sync:** update `TICKET-REGISTRY.csv` + `PER-BUG-REGISTRY.csv` after PO confirms; sync `known-failing.json` react baseline to match b88 gate (remove stale DISCREPANCY entries for greens).
4. **Schedule T7 / Lane 2 next fixes (ordered):**
   - **H-R08** host marquee (extend step 16 in-host synthetic path)
   - **H-S49 / TAL-01491+01587** tile drag survival (T3 row 11)
   - **H-S50 / TAL-01484+01490** peer repaint (T2 step 3 tracks 3a–d)
   - **Migration-OFF family H-S45–48** — either re-migration milestone or targeted Fallback-B exceptions per ticket
5. **Do not close Fallback-B tracked-red rows (H-S34/35/44/45–50) as user bugs** until migration restored or per-ticket fixes land with switches.
