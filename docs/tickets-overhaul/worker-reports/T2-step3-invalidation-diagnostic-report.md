# T2 Step 3 (Lane 2) — RC-2 Invalidation Contract Diagnostic

## 1. Task + RC

- **Task:** T2 step 3 (Lane 2) — read-only invalidation-contract sweep. Inventory every repaint/invalidation call-site, map contract gaps to tickets, propose a single RC-2 contract + fix plan. **No code edits** (integration freeze on shared engine/React).
- **RC:** **RC-2** — no render-invalidation contract: state mutations do not reliably reach `scheduleRender()` / `render()`, so pixels stay stale until a later interaction (click, pan, replay tick). Symptom family: "stuck until I click" ×38 (`ROOT-CAUSES.md` §RC-2).

---

## 2. What I changed — file by file

**N/A — diagnostic only.** No product, engine, React, harness, or `known-failing.json` edits.

---

## 3. Kill-switch (I3 + I13)

**N/A — diagnostic only.** Proposed kill-switch strategy per fix group is in §4 (contract) below.

**Already landed (T2 step 1):**
- `__TALARIA_DISABLE_DRAWING_SAVE_INVALIDATION_V2` — gates `saveDrawings()` → `scheduleRender()` (`drawing-tools-manager.js:11710–11764`).
- Assertion hook: `window.__TALARIA_ASSERT_INVALIDATION` wraps `chart.scheduleRender` when enabled (`drawing-tools-manager.js:11714–11749`).

---

## 4. Proof — call-site inventory, gaps, contract, scenarios

### 4.1 Canonical render spine

| Entry point | File:function | Lines | Behavior |
|-------------|---------------|-------|----------|
| `scheduleRender()` | `chart.js:Chart.scheduleRender` | **25597–25627** | Coalesces or bypasses to sync `render()`; sets `renderPending` for deferred paint |
| `animate()` | `chart.js:Chart.animate` | **25812–25855** | rAF loop drains `renderPending` → `render()` |
| `render()` | `chart.js:Chart.render` | **25857+** | Full paint; **`_mcDiag.renders++`** at **25858** (harness probe) |
| `redrawDrawings()` | `chart.js:Chart.redrawDrawings` | **~33350–33368** | Called inside `render()` → `dm.redrawAll()` |
| `DrawingToolsManager.scheduleRenderDrawing` | `drawing-tools-manager.js` | **765–847** | rAF-batched SVG `renderDrawing`; may call `chart.scheduleRender()` at end |
| `DrawingToolsManager.redrawAll` | `drawing-tools-manager.js` | **11258–11345** | SVG teardown/rebuild only — **does not** increment `_mcDiag.renders` unless followed by `chart.render()` |

**`scheduleRender()` coalescing branches (25597–25627):**

1. Axis-zoom drag → `_scheduleAxisZoomRender()` (return)
2. Separate-panel resize → `_scheduleSeparatePanelResizeRender()` (return)
3. Replay playing **or** inertial pan → **sync `render()`** (return)
4. Pan-sync burst → `_schedulePanSyncFollowRender()` (return)
5. Wheel burst → `_scheduleWheelBurstRender()` (return)
6. Else → `renderPending = true` (deferred in `animate()`)

**Assertion / invalidation hooks (drawing layer only):**

| Hook | Lines | Scope |
|------|-------|-------|
| `_ensureInvalidationAssertionScheduleHook` | `drawing-tools-manager.js:11714–11727` | Wraps `chart.scheduleRender` when `__TALARIA_ASSERT_INVALIDATION` |
| `_assertRenderInvalidationScheduled` | `drawing-tools-manager.js:11730–11749` | 50 ms window; logs `[TALARIA ASSERT INVALIDATION]` |
| `_invalidateAfterRenderRelevantSave` | `drawing-tools-manager.js:11752–11764` | Fingerprint diff → `scheduleRender()` (V2) |
| `saveDrawings` caller | `drawing-tools-manager.js:11779–11850` | Invokes invalidation after render-relevant persist |

---

### 4.2 Subsystem inventory — mutations vs repaint

#### A. Drawings (`drawing-tools-manager.js`, tools, toolbar)

| Mutation site | Lines | Repaint called | Contract status |
|---------------|-------|----------------|-----------------|
| `toolbar.onUpdate` (style commit) | **1811–1821** | `renderDrawing` + `saveDrawings` → V2 `scheduleRender` | **FIXED** (T2 step 1); was gap — H-S38/H-S39 |
| `addDrawing` | **6878–7003** | `renderDrawing`; auto-select → `_commitSelectedDrawingVisual` | Partial — SVG only until select path |
| `selectDrawing` / `_commitSelectedDrawingVisual` | **9030–9056**, **9804–9912** | `renderDrawing` | Partial — selection chrome may lag canvas |
| `deselectAll` | **9965–10041** | per-drawing `renderDrawing` + **`redrawAll()`** (10029) | OK for local tile |
| `deleteDrawing` | **10665–10948** | `scheduleRender` (10930–10931) + `saveDrawings` | OK on owning chart |
| `scheduleRenderDrawing` (live handle patch) | **779–784** | early return — no `scheduleRender` | **Exempt** (hot path) |
| `saveDrawings` (follower, `_receivingDrawingSync`) | **11781–11783** | early return — no invalidation | **By design** — peer must repaint |
| `drawing-tools-base` axis highlights | **2784–2836** | `scheduleRender` (guarded) | OK |
| `drawing-toolbar.js` direct | **2317** | `chart.scheduleRender()` | OK |

#### B. Multichart sync / iframe (I14)

| Mutation site | Lines | Repaint called | Contract status |
|---------------|-------|----------------|-----------------|
| `sync-bridge` drawing inbound | **1859–1880** | live: `renderDrawing` only; add: rAF `redrawAll` | **GAP** — no `chart.render()` on add |
| `chart.receiveDrawingChange` add | **37525–37550** | `dm.renderDrawing` only | **GAP** — peer canvas stale |
| `chart.receiveDrawingChange` remove/delete | **37555–37563** | `splice` + `destroy()` only | **GAP** — ghost until nudge (RC-1 overlap) |
| `chart.receiveDrawingChange` update | **37564+** | `_applySyncedDrawingPayloadToExisting` → `renderDrawing` | Partial |
| `MultichartGrid.repaintAllPanelSurfaces` | **1515–1518** | `applyHostSlot` + `resizeAllIframesInContainer` | OK — each iframe `resize()` + `render()` (1509) |
| `MultichartGrid.applyHostSlotPositionOnly` | **1282–1317** | CSS only mid-drag | **Exempt** — mouseup repaints |
| `panel-cmd-bridge` commands | **2317+**, **2754–2778** | many branches call `ch.render()` | Mostly OK; replay hold windows exempt |
| `embed-bridge` mirror | **892, 1132** | `ch.render()` | OK |
| `multichart-manager._clearHostDrawingUi` | **803–818** | `dm.deselectAll` + `ch.render()` | OK |

**sync-bridge comment (1869–1870):** explicitly skips full-chart render for live preview (perf). Non-live add uses `redrawAll` without `chart.render()` — this is the **H-S50 / TAL-01484** class of stale canvas.

#### C. Indicators (`chart-indicators-full.js`)

| Mutation site | Lines | Repaint called | Contract status |
|---------------|-------|----------------|-----------------|
| `addIndicator` finish | **5499**, **6205–6208** | `scheduleRender` | OK |
| `updateIndicator` / param apply | **7372–7378** | `bumpIndicatorRenderVersion` + `scheduleRender` | OK (sync path) |
| Worker async recalc complete | **7486**, **7559–7560** | `scheduleRender` on callback | Race risk — no assertion |
| Volume visibility toggle | **8479–8496** | direct `render()` | OK |
| `indicator-ui.js` apply | **2742–2745** | `scheduleRender` / `render` | OK |

**RC-6 overlap:** indicator settings staleness shares lifecycle bugs with RC-1; param apply path generally schedules render. **H-S48** (indicator leak across panels) is RC-4 scope, not invalidation.

#### D. Order entry (`order-manager.js`)

| Mutation site | Lines | Repaint called | Contract status |
|---------------|-------|----------------|-----------------|
| Preview line drag | **18515–19305** | rAF SVG patch; `isDraggingPreviewLine` suppresses full render | **Exempt** (by design) |
| `_refreshOrderTypePreviewLabelLive` (T4 step 6) | **13156–13178** | rAF → `renderPreviewLabel` only | **Exempt** — label-local |
| Panel open/close resize | **13564–13574** | `resize` + `scheduleRender` | OK |
| Open position overlays | **37194** | repainted from `chart.render()` each frame | OK |

#### E. Replay

| Mutation site | Lines | Repaint called | Contract status |
|---------------|-------|----------------|-----------------|
| `_renderReplayChartUpdate` | `replay-system.js` **3000–3021** | sync `render()` on host | OK when playing |
| `_syncMultichartAfterManualStep` | `replay-system.js` **6763–6768** | `_multichartBroadcastReplayFrame()` | **GAP** — peer may not bump `_mcDiag.renders` |
| `scheduleRender` replay branch | `chart.js` **25606–25616** | playing → sync `render()` | OK |
| Embed passive play | `chart.js` **25837–25844** | skips 1 Hz `scheduleRender` on embed | **Exempt** (passive mirror) |
| `panel-cmd-bridge.applyReplayFrame` hold | **569–597** | drops frames during host TF switch | **Exempt** (anti-flash) |

#### F. React shell (`TalariaV8bLive.jsx`)

| Mutation site | Lines | Repaint called | Contract status |
|---------------|-------|----------------|-----------------|
| `v9ScheduleCpChartFlush` / `v9FlushCpChartNow` | **2253–2276** | coalesced rAF → `scheduleRender` on target charts | OK pattern |
| Color/style handlers (majority) | **2437, 2489, 3029, 4061, 5544, 5704**, etc. | `dm.chart.scheduleRender()` | OK |
| Inline text edit path | **5766–5767** | `dm.scheduleRenderDrawing(d)` only | **GAP (edge)** — SVG-only, no canvas |
| `flushV9MiddleLineToChart` | **21413–21456** | `tb.onUpdate` or `renderDrawing` + **`scheduleRender`** | OK |

#### G. Axis / interaction (T2 step 2 overlap — RC-2 amendment A1)

| Defect | Lines | Mechanism |
|--------|-------|-----------|
| Click shifts time label | `chart.js:31585–31606`, `31923–31927` | Click arms pan → lite tick path → label jump without stable invalidation contract |
| Half-hour tail gridlines | `chart.js:26507–26548` | Tick builder boundary — tick-math + render path |

**Not re-diagnosed here** — see `T2-step2-axis-correctness-diagnostic-report.md`. Separate fix tracks A–D with own kill-switches.

---

### 4.3 Contract gaps → tickets

| Gap ID | Mechanism | Primary file:lines | Tickets / harness | RC overlap |
|--------|-----------|-------------------|-------------------|------------|
| **G1** | Style commit via `saveDrawings` without `scheduleRender` | `drawing-tools-manager.js:1811–1821` → `saveDrawings:11779` | RC-2; **H-S38/H-S39** | — |
| **G2** | Peer drawing **add** — `renderDrawing` / `redrawAll` only | `sync-bridge.js:1874–1879`, `chart.js:37525–37550` | **TAL-01484**, **TAL-01490**; **H-S50** | RC-4 panel parity |
| **G3** | Peer drawing **remove** — no render after `destroy()` | `chart.js:37555–37563` | Ghost-after-delete family; **H-S33** (RC-1) | RC-1 + RC-2 |
| **G4** | Paused replay host step → peer repaint uncertain | `replay-system.js:6763–6768` | **TAL-01484**, **TAL-01490**; **H-S50** | RC-4 |
| **G5** | React `scheduleRenderDrawing`-only style path | `TalariaV8bLive.jsx:5766–5767` | RC-2 edge (inline text) | — |
| **G6** | `redrawAll` as sole invalidation (no `chart.render`) | `drawing-tools-manager.js:11258`, `sync-bridge.js:1874` | Panel "stuck until click" batch | RC-4 |
| **G7** | Assertion hook only on drawing save path | `drawing-tools-manager.js:11714` | 37+ tickets still open in RC-2 bucket | — |
| **G8** | Axis click/lite-paint tick rebuild | `chart.js:25908–25932`, `31585–31606` | **TAL-01565**, **TAL-01583** | T2 step 2 A1 |

**Registry rows (sample RC-2 family):**

| Ticket | Summary | Maps to |
|--------|---------|---------|
| TAL-00322 | Tool invisible / label misplaced until interaction | G1 (pre-fix), anchoring (RC-3) |
| TAL-01484 | Layout stuck until click | G2, G4, G6 |
| TAL-01490 | Layout doesn't move until chart click | G2, G4, G6 |
| TAL-01565 | Click shifts time label | G8 |
| TAL-01568 | Brush tools don't move until clicked first | RC-1 first-click (not RC-2 primary) |

---

### 4.4 Proposed RC-2 invalidation contract

**Master rule:** Any mutation of render-affecting state on chart instance `C` must call `C.scheduleRender()` (or a documented sync-`render()` hot path) before the mutating call stack returns, unless the mutation is explicitly exempt.

**Render-affecting state includes:** drawing geometry/style/visibility/selection, indicator params/visibility, order overlay structure, replay playhead/viewport, symbol/TF/data series, axis/tick layout, multichart peer-synced drawing payloads.

#### Contract by subsystem

| Subsystem | Rule: mutation X → must call Y | Exemptions | Proposed kill-switch |
|-----------|----------------------------------|------------|----------------------|
| **Drawings (persist)** | Any render-relevant change that reaches `saveDrawings()` → `scheduleRender()` | `_receivingDrawingSync` follower skip | `__TALARIA_DISABLE_DRAWING_SAVE_INVALIDATION_V2` (**landed**) |
| **Drawings (local)** | `addDrawing` / `deleteDrawing` / `selectDrawing` on owning chart → `scheduleRender()` if canvas layers touched | Live handle patch (`patchLiveHandleResize`) | `__TALARIA_DISABLE_DRAWING_LOCAL_INVALIDATION_V2` |
| **Drawings (peer sync)** | `receiveDrawingChange` add/update/remove → `scheduleRender()` on **each** affected peer | `isLive` preview in sync-bridge | `__TALARIA_DISABLE_PEER_DRAWING_SYNC_INVALIDATION_V2` |
| **Multichart commands** | Host command affecting panel state (replay step, style, TF) → `scheduleRender` on host **and** each iframe via `panel-cmd-bridge` or `repaintAllPanelSurfaces` | TF-switch hold window; passive embed play | `__TALARIA_DISABLE_PANEL_COMMAND_REPAINT_V2` |
| **Indicators** | Param/style/visibility change → `bumpIndicatorRenderVersion()` + `scheduleRender()` after recalc (sync or worker callback) | — | `__TALARIA_DISABLE_INDICATOR_INVALIDATION_V2` |
| **Order entry** | Structural change (place/cancel/fill/close) → `scheduleRender()` | Preview drag while `isDraggingPreviewLine`; `_refreshOrderTypePreviewLabelLive` | (existing T4 switches) |
| **Replay** | Paused manual step on host → peer `render()` via `_multichartBroadcastReplayFrame` + panel-cmd apply | Embed passive mirror | `__TALARIA_DISABLE_REPLAY_PEER_INVALIDATION_V2` |
| **React shell** | After `drawing.style` / `tlStyle` mutation → `chart.scheduleRender()` on all `chartsToRender`; never `scheduleRenderDrawing` alone unless SVG-only documented | Inline text live edit (must still flush canvas on commit) | `__TALARIA_DISABLE_V9_STYLE_INVALIDATION_V2` |
| **Assertion** | `__TALARIA_ASSERT_INVALIDATION` wraps **all** `scheduleRender` entry points + logs mutation site | Production off by default | `__TALARIA_DISABLE_INVALIDATION_ASSERT` |

#### Fix plan (implementation order — post-freeze)

| Step | Track | Files (both trees + React) | Harness proof | Discharges |
|------|-------|------------------------------|---------------|------------|
| **T2-3a** | Peer drawing sync invalidation | `chart.js` (`receiveDrawingChange`), `sync-bridge.js` | H-S38-B, H-S39-B (panel B), new peer-delete ghost scenario | G2, G3, G6 |
| **T2-3b** | Replay peer invalidation | `replay-system.js`, `panel-cmd-bridge.js` | **H-S50** GREEN | G4 |
| **T2-3c** | Extend assertion to chart.js + sync paths | `chart.js`, `sync-bridge.js` | Dev-only `__TALARIA_ASSERT_INVALIDATION` sweep | G7 |
| **T2-3d** | React SVG-only paths | `TalariaV8bLive.jsx` | H-R extension or H-S38 variant on built product | G5 |
| **T2-2 impl** | Axis A1 fixes (separate prompt) | `chart.js` only | TAL-01565/01583 repro | G8 |

---

### 4.5 RED-scenario candidates

| Scenario | Status | Proves | Host + iframe? |
|----------|--------|--------|----------------|
| **H-S38** | GREEN (T2 step 1) | Trendline stroke color → `_mcDiag.renders` +1 by 2 rAF, no click | Host only (`panels: 1`) |
| **H-S39** | GREEN (T2 step 1) | Horizontal line strokeWidth → same probe | Host only |
| **H-S50** | **knownFailing** | Host paused `stepForward` → panel B `replayTs` + `_mcDiag.renders` increase without B click | Host + panel B |
| **H-S44** | knownFailing (fallback-B) | Panel settings/Esc — **not RC-2** | Panel B |
| **H-S38-B** (proposed) | RED-first | Same as H-S38 on panel B after sync from host style commit | Host + B |
| **H-S39-B** (proposed) | RED-first | Width commit on panel B iframe | Host + B |
| **H-S33-peer** (proposed) | RED-first | Delete drawing on host → peer B render count increases, drawing count 0 | Host + B |
| **H-R50** (proposed react) | RED-first | Built-product dist-v9: panel B repaint after host replay step (mirror H-S50) | React 2v |

**Existing probe:** `commitDrawingStyleAndReadRender` (`scenarios.mjs:5137–5151`) — mutates `drawing.style`, `renderDrawing`, `saveDrawings`, waits 2 rAF, reads `_mcDiag.renders`.

---

### 4.6 Overlap notes (avoid double-fix)

| Area | Already fixed by | Remaining RC-2 work |
|------|------------------|---------------------|
| Drawing style stuck-until-click (single chart) | **T2 step 1** `saveDrawings` V2 | Multichart peer + React SVG-only paths |
| Settings flash / panel routing | **T1** steps 10–12, **T3** panel-B chrome | Not invalidation — I14 routing |
| Peer selection / quick menu | **T3** step 4/5 | Chrome routing, not canvas repaint |
| Replay fill / TP flicker | **T4** H-S36/H-S37 | Separate from H-S50 peer repaint |
| Order type label mid-drag | **T4 step 6** `_refreshOrderTypePreviewLabelLive` | Exempt from full invalidation by design |
| Anchoring jumps | **T5** H-S40–42 | RC-3, not RC-2 |
| Axis label click-shift | **T2 step 2** diagnostic (A1) | Engine-only `chart.js` tracks A–D |
| Layout persist / tile geometry | **T3 step 5** rows 13–14 | `repaintAllPanelSurfaces` — geometry, not mutation contract |
| Aggregates / order math | **T4** RC-5 | Not repaint |

**I14 touch:** G2, G3, G4, G6 all require postMessage / `panel-cmd-bridge` / `sync-bridge` invalidation fan-out — must not edit `chart.js` drawing engine internals from Lane 2 without Lane 1 coordination on `receiveDrawingChange`.

---

## 5. Invariants checked

| Invariant | Status |
|-----------|--------|
| I8 (mirror) | Diagnostic cites canonical `chart v 1.4/chart/**`; mirrored paths noted |
| I14 (bridge) | Multichart gaps mapped to bridge files, not engine monkey-patches |
| I5 (host tile A) | Contract preserves host-as-peer via same `scheduleRender` rules |
| I13 (kill-switch) | Proposed per-track switches; one switch already landed (T2 step 1) |
| D-010 | Harness scenarios named for built-product follow-up (H-R50 proposed) |
| Integration freeze | **No edits made** |

---

## 6. What I did NOT do / limits

- No runtime assertion sweep with `__TALARIA_ASSERT_INVALIDATION` enabled across full gate (static trace only).
- No exhaustive enumeration of all 200+ `scheduleRender()` call sites in `chart.js` — inventory focuses on **mutation → repaint** edges and known gaps.
- `chart-indicators-full.js` worker async races not reproduced in harness.
- Order-entry preview drag exempt paths not fully line-audited (rely on T4 step 6 report).
- Ticket registry RC-2 bucket (~85 rows per `T0-LANE4-REPORT`) not line-mapped 1:1 — gaps mapped to representative tickets.
- Lane 4 owns `known-failing.json` — not updated.

---

## 7. Live-verification handoff

After implementation (post-freeze), PO should verify on a named build:

1. **Single chart:** Place trendline → change color in settings → stroke updates **without** clicking chart (H-S38 class).
2. **2v multichart:** Same style change on host → panel B shows updated stroke **without** clicking B (H-S38-B class).
3. **2v replay paused:** Host step-forward → panel B playhead and canvas update **without** clicking B (H-S50 class).
4. **Delete sync:** Delete drawing on host → vanishes on panel B **without** nudge.

Enable `window.__TALARIA_ASSERT_INVALIDATION = true` in dev console to surface any remaining mutation-without-repaint warnings.

---

## 8. Status

**DIAGNOSTIC-ONLY (mechanism reported, fix not started)**

**Summary:** Canonical spine is `scheduleRender()` → `animate()` → `render()` (`_mcDiag.renders++`). T2 step 1 closed the primary single-chart hole at `saveDrawings()`. Largest remaining violations: **peer drawing sync** (`receiveDrawingChange` remove/add without `chart.render`, `sync-bridge.js:1874–1879`) and **paused replay host-step → iframe repaint** (H-S50 / TAL-01484/01490). Proposed contract + four implementation tracks (T2-3a–d) are turnkey for post-freeze Lane 1/2 work.
