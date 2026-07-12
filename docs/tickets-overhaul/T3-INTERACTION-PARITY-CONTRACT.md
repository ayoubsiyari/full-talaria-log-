# T3 Interaction-Parity Contract (RC-4) — DRAFT for Director approval

**Task:** T3 step 1 (Lane 2). **Design only — no code changes.**

**Purpose:** Mirror Plan 1's data-ownership contract, but for **interaction** surfaces inside multichart panels. Each row names today's owner + transport (with file:line evidence), the failure symptom, and the **target** owner + transport. Fixes in T3 steps 2–3 are one gated `__TALARIA_*` per surviving contract row, RED-first against this table.

**Production tree:** `chart v 1.4/chart/multichart-prod/` (+ live `MultichartGrid.jsx`). Legacy `chart v 1.4/chart/multichart/` is **out of scope** (L2).

**Binding:** I11 — this contract covers **interaction ownership only**. Rows whose mechanism is replay mirror-frame application (adopt data / X / Y) are **DEFER-T8** and must not appear here as T3 fix targets.

---

## Contract table

| # | Surface | Today: owner + transport (evidence) | Failure symptom (ticket) | Target owner | Target transport | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **Panel focus** (which tile receives topbar commands) | **Split.** Iframe clicks post `panel-focus` → parent (`panel-cmd-bridge.js:3652-3700` → `multichart-manager.js:910-935` → `MultichartGrid` `onPanelFocus`). Topbar bus routes by `focusedPanelId` (`MultichartGrid.jsx:3905-3913`). Host tile A is in-process `window.chart`; B/C/D via `manager.sendCommand` → `panel-cmd-bridge`. | Focus stuck on A after clicking B (implicit in many July-4 tickets) | **Parent shell** owns `focusedPanelId`; **each panel** owns local pointer hit-testing | `postMessage` `panel-focus` (iframe→parent); direct ref (host) | Deferred `setTimeout(0)` on focus post (`panel-cmd-bridge.js:3671-3693`) races with draw/select — document as known timing constraint; do not add mirror-frame guards to paper over it. |
| 2 | **Selection** (click-to-select, Ctrl/Cmd multi-select) | **Panel-local** `drawingManager` per iframe/host chart (`drawing-tools-manager.js:9501-9555`, Ctrl toggle `2288-2308`). Multichart: iframe selection posts `multichart-drawing-selected` to parent (`drawing-tools-manager.js:93-126`); parent arms `__v9DrawingSelectionGuardUntil` (`MultichartGrid.jsx:5847-5866`). Focus change clears other panels via `clearDrawingUiOnOtherPanels` (`MultichartGrid.jsx:3737-3742`, `4754-4768`). | TAL-01498 — Ctrl-select on 2nd chart groups tools at one point | **Panel-local** selection store per tile; parent only mirrors **focus + V9 chrome**, not geometry | Local hit-test + `selectDrawing`; `postMessage` for parent quick-bar sync only | **Open question (Director):** Is Ctrl-collapse caused by `decorateDrawingPointsWithLocalIndices` on inbound drawing sync (`sync-bridge.js:1784-1838`) reusing wrong frame, or by parent focus cleanup racing selection guard? T3 step 2 must RED-isolate before fix. |
| 3 | **Quick Menu** (floating toolbar / V9 quick bar after draw) | **Split / duplicated.** Per-panel legacy `drawing-toolbar.js` toolbar.show on host path (`drawing-tools-manager.js:6710-6718`). Iframe tiles suppress local settings modal (`embed-bridge.js:217-231`) but toolbar still instantiates per iframe. Parent V9 quick bar listens for `talaria:v9-selected-drawing` (`drawing-tools-manager.js:127-130`, `MultichartGrid.jsx:5847-5865`). Focus-change cleanup can hide bar before iframe selection lands (`MultichartGrid.jsx:4760-4762`). | TAL-01499 — Quick Menu missing on multichart panels | **Parent V9 quick bar** is sole Quick Menu for all tiles; panel-local `drawing-toolbar` hidden in embed | `postMessage` `multichart-drawing-selected` + `CustomEvent` `talaria:v9-selected-drawing`; parent positions bar using union plot bounds (`MultichartGrid.jsx:5201` area) | Align with single-chart UX: menu appears within 1s of mouse-up on any focused tile. |
| 4 | **Settings dialog** (shape / drawing settings) | **Host-forwarded.** Iframe `settingsPanel.show` proxied to parent (`embed-bridge.js:182-254`); local modal CSS-suppressed (`embed-bridge.js:217-231`). Parent opens via `openDrawingSettingsForPanel` (`MultichartGrid.jsx:4775-4841`) or `multichart-open-drawing-settings` postMessage (`embed-bridge.js:204-212`, `MultichartGrid.jsx:5869-5879`). | (No open July-4 row; RC-4 class: stale/wrong-panel settings) | **Parent shell** owns one global settings surface; **panel** owns which drawing is being edited | `postMessage` + parent `getChartForPanelId` resolve | Target already largely implemented; T3 verifies panel-id resolution never falls back to host A when B is focused. |
| 5 | **Keyboard shortcuts** (replay + drawing) | **Split.** Replay hotkeys in iframe intercepted and forwarded (`panel-cmd-bridge.js:3702-3753` → parent `MultichartGrid.jsx:3015-3026`); parent `replaySystem` broadcasts to all tiles. Non-replay drawing shortcuts (Escape, etc.) partially forwarded (`panel-cmd-bridge.js:3765-3850`). Drawing Ctrl+C/V handled panel-locally (`drawing-tools-manager.js:5338-5369`). | Space/step keys ran replay on one panel only (fixed path exists; retest) | **Parent** owns replay transport; **panel-local** owns draw/edit shortcuts that do not change replay state | `postMessage` `replay-keyboard` for replay; local capture for tool shortcuts | Replay row largely landed; contract row = regression lock for harness. |
| 6 | **Order-entry rail + place-order focus** | **Host React shell** owns visible V9 order rail (`order-manager.js:13374-13430`, `MultichartGrid.jsx:5897-5914`). `window.getActiveChart` overridden to focused tile (`MultichartGrid.jsx:5013-5015`, `5272-5276`). Iframe suppresses duplicate trade journal modal (`order-manager.js:7750-7756`). Place-order click capture routes to focused iframe (`MultichartGrid.jsx:5905-5914`). | Orders preview on wrong panel when B focused (implicit) | **Parent rail UI**; **focused panel's chart** owns preview SVG + ticker context via `getActiveChart()` | `getActiveChart()` + `runCommand` for iframe place-order | ROOT-CAUSES cited `order-manager.js:16626-16643` is **stale** (now TP-render HTML). Evidence updated to lines above. |
| 7 | **Drawing target** (which panel receives new/edited drawings) | **Ambiguous / leaky.** Draw originates in focused panel's `drawingManager`. Outbound fan-out: monkey-patched `broadcastDrawingChange` → `postMessage` drawing-* (`sync-bridge.js:1544-1600`); manager fans to peers when `syncMode.drawings` true (`multichart-manager.js:1064-1066`, default **on** at `101`). Inbound applies via `receiveDrawingChange` + `decorateDrawingPointsWithLocalIndices` (`sync-bridge.js:1840-1862`). | TAL-01495 — rectangle flashes on other symbols then disappears | **Focused panel-local** owns new drawings when symbol sync OFF; sync ON may fan-out intentionally | Direct local draw; `postMessage` fan-out **only when** user-enabled drawings sync | T3 fix likely: respect `syncMode.drawings` + suppress cross-symbol ghost apply; not a mirror-frame guard. |
| 8 | **Indicator enable-state** (per-layout list + on-chart truth) | **Split.** Per-panel `ch.indicators.active` mutated via `panel-cmd-bridge` `addIndicator`/`removeIndicator` (`panel-cmd-bridge.js:2527-2599`). One-time host→panel clone on boot (`MultichartGrid.jsx:3480-3527`). Topbar chips driven by `dispatchFocusChanged` / `getIndicators` on focus (`MultichartGrid.jsx:3700-3716`, `4075-4089`). | TAL-01500, TAL-01501 — toggle UI wrong; deleted indicators reappear on layout switch | **Panel-local** indicator state per tile; **parent topbar** is read-only mirror of **focused** panel only | `runCommand` + `getIndicators`; no cross-panel indicator write on focus change | Delete on B must not restore from host clone snapshot; focus mirror must query live panel state, not cached host list. |
| 9 | **Compare Symbol** | **Routed via topbar bus** — `runCommand("addCompareSymbol")` on focused panel (`MultichartGrid.jsx:4049-4060`, `panel-cmd-bridge.js:2573-2587`). Failure = command applied to host fallback when iframe popup path breaks. | TAL-01426 — compare applies to main chart; Close dead | **Focused panel** owns compare overlay | `runCommand` → iframe `compareOverlay.addSymbolWithMode` | Feature parity row; survivor from retest checklist. |
| 10 | **Context menu** (right-click chart menu) | **Host-unified.** Iframe `contextmenu` captured and forwarded (`panel-cmd-bridge.js:3860+`); parent shows host `showChartContextMenu`. Local iframe menus suppressed. | Stacked / wrong-panel menus (class symptom) | **Parent** one menu; **panel** forwards hit position + panel id | `postMessage` context-menu forward | Supporting row for interaction parity; no open July-4 ticket. |
| 11 | **Pan drag bounds** (canvas pan within tile) | **Panel-local** `chart._constrainOffsetDuringDrag` (`chart.js:24993-25025`). Host tile A: canvas sized to `#chartWrapper` slot overlay (`MultichartGrid.jsx:905-919`). Iframe tiles: full iframe document canvas. Unified focus frame is `pointer-events: none` (`MultichartGrid.jsx:6517`). | TAL-01491 — host pan stops at inner frame box; iframe pans freely | **Each tile** owns pan bounds for **its own** canvas geometry | Local pan handler only | **Open question:** Is host clip from `#chartWrapper` slot sizing vs grid cell mismatch? Measure host vs iframe effective plot rect before fix. |
| 12 | **Crosshair / top-left market label mirror** | **Parent mirror on focus.** `dispatchFocusChanged` publishes symbol/tf/fileId (`MultichartGrid.jsx:3700-3716`). Sync-bridge owns crosshair/range **sync** transport (`sync-bridge.js` crosshair + visibleRange handlers). | TAL-01487 (closed), TAL-01485 (closed) — label/crosshair stuck | **Focused panel** owns truth; **parent chrome** mirrors on focus event | `CustomEvent` `multichartFocusChanged`; optional sync-bridge for synced crosshair | Crosshair **sync policy** when replay+data-range ON may touch DEFER-T8; interaction half (label follows focus) stays T3. |

---

## Explicitly OUT OF CONTRACT (DEFER-T8 or other RC)

| Mechanism | Tickets | Reason |
| --- | --- | --- |
| Replay mirror-frame (adopt data / X / Y) | TAL-01480, 01488, 01489, 01496, 01497 | Policy-by-accumulation path; fixed by T8 policy table, never guard #21 (I11) |
| Viewport re-sync on focus during replay | (related to 01489, 01496) | `MultichartGrid.jsx:3745-3767` `dispatchScrollSync` on focus — adopt-X, not interaction surface |
| Repaint without click | TAL-01484, 01490 | RC-2 invalidation contract (T2), not interaction ownership — retest may close on b105 |
| First-boot price mismatch | TAL-01502 | RC-4 boot-settle / data path; retest-first `LIKELY-FIXED-b105` |
| News-on-every-panel product rule | TAL-01482 | OUT-OF-SCOPE-FEATURE |
| Strategies page design | TAL-01536 | OUT-OF-SCOPE-RC4 |

---

## Per-surface recommendations (summary)

| Surface | Target owner | Transport | T3 fix if retest fails? |
| --- | --- | --- | --- |
| Panel focus | Parent `focusedPanelId` | `panel-focus` postMessage | Only if focus routing bug reproduces |
| Selection | Panel-local | Local + selection-sync postMessage | **Yes** — TAL-01498 |
| Quick Menu | Parent V9 bar | `multichart-drawing-selected` | **Yes** — TAL-01499 |
| Settings | Parent global modal | postMessage + resolve panel chart | Verify only |
| Keyboard (replay) | Parent replaySystem | `replay-keyboard` | Harness regression |
| Order rail | Parent UI + focused chart context | `getActiveChart` | Verify on retest |
| Drawing target | Focused panel (sync-gated fan-out) | Local draw + gated drawing-* sync | **Yes** — TAL-01495 |
| Indicator state | Panel-local; parent mirror read-only | `runCommand` / `getIndicators` | **Yes** — TAL-01500, 01501 |
| Compare Symbol | Focused panel | `runCommand` | **Yes** — TAL-01426 |
| Context menu | Parent unified | postMessage forward | Low priority |
| Pan bounds | Per-tile local | Local pan | **Yes** — TAL-01491 |
| Chrome mirror | Focused panel truth | `multichartFocusChanged` | If retest reopens 01485/01487 |

---

## Director checkpoint (P4)

**Requested ruling:**

1. Approve **parent-owned V9 Quick Menu + settings** with **panel-local selection/draw/indicator state** as the canonical split.
2. Confirm **drawing sync default ON** (`multichart-manager.js:101`) is intentional; T3 may gate cross-symbol apply without changing default UX.
3. Resolve **open questions** on rows 2 and 11 before step-2 RED scenarios are written.

**After approval:** T3 step 2 writes harness scenarios per **surviving** retest row × contract row intersection. Step 3: one gated fix per row.

---

## Worker confirmation

- **No files edited.** No engine, bridge, or `multichart-prod/` runtime changes.
- **Legacy `multichart/` dev-shell not touched** (L2).
- **Docs only:** this contract + worker report.
