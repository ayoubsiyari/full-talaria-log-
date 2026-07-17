# A7b — Volume-profile defect cluster diagnostic (Lane 5)

## 1. Task + RC

- **Task:** A7b volume-profile DIAGNOSTIC (read-only, D-028 first assignment). Reproduce scale-vanish honestly; split engine (freeze-safe) vs multichart/re-migration roots; propose gated fix scope. **No product code changes.**
- **RC:** RC-3 follow-on (volume tools / anchoring class in `ROOT-CAUSES.md`) plus RC-2 axis-layout invalidation for scale-vanish leg. **Diagnostic only — no RC discharged.**

**Tickets in scope:** TAL-01665, TAL-01666, TAL-01667, TAL-01661, TAL-01662, TAL-01664. (TAL-01656/01657 are VWAP chrome — UI-polish batch, cited only.)

---

## 2. What I changed — file by file

**N/A — diagnostic only.** No edits to `chart v 1.4/chart/**`, `homepage/public/chart/**`, harness, or re-migration surfaces.

---

## 3. Kill-switch (I3 + I13)

**N/A — diagnostic only.** Proposed switches per root are in §8.

---

## 4. Proof — reproduction + actuation honesty (I15)

### 4.1 Reproduction recipe (PO / dev:live / frozen fallback-B)

| Step | Action |
|------|--------|
| 1 | Open multichart layout **2×2** (or 2v), same symbol on all tiles (EUR/USD 1m matches tester screenshots). Enable **drawing sync** if exposed (default in multichart). |
| 2 | Panel A (top-left): arm **Fixed Range Volume Profile** or **Anchored Volume Profile** from V9 brush menu. |
| 3 | **Cross-layout (TAL-01661):** While dragging the second anchor, observe panels B/C/D — profile preview/box should **not** appear; today it does (tester screenshot `TAL-01661/1947_18.png`). |
| 4 | **Scale-vanish (TAL-01665):** Complete placement on panel A. Inspect panel A price strip (right) and time strip (bottom). Compare to peer panels. Tester screenshot `TAL-01665/1951_21.png` shows **both axes missing** on the affected tile only. |
| 5 | **Control loss (TAL-01666/01667):** With profile placed, attempt chart pan/zoom on affected tile and peers. Click inside profile body vs on POC/boundary handles. Removal via Delete Drawings should restore axes/control (tester TAL-01667). |
| 6 | **Labels (TAL-01662/01664):** Open Fixed Range VP settings → Style → enable **Price** + **Time** labels (`TAL-01662/1948_19.png`). Select drawing; expect draggable axis highlights. Try Coordinates tab price/bar edits for reposition (`TAL-01664`). |
| 7 | **Switch-OFF sanity (future fixes):** Each proposed gate in §8 should revert behavior when set `true` (I13). |

### 4.2 What was actuated this session

| Claim | Actuation | Measurement | Status |
|-------|-----------|-------------|--------|
| Cross-layout leak during draw | **Not run** — no live multichart session | Static trace `_syncLivePreviewDrawing` → `broadcastDrawingChange` | **MECHANISM CONFIRMED**; live **NOT PROVEN** |
| Scale-vanish on placement | **Not run** — no live browser | Ticket screenshot + `chart-host.html` margin diagnostic comment | **SYMPTOM CONFIRMED** (tester); root **STATIC CONFIRMED** |
| Pan/control block on VP body | **Not run** | Code path `isVolumeProfileChartPanBlockedAtPoint` + hitbox `pointer-events` | **MECHANISM CONFIRMED** |
| Price/time labels non-functional | **Not run** | Code: `showAxisHighlights` point-count + VP price source mismatch; V9 `avStyle` bridge gap | **MECHANISM CONFIRMED** |

**Honesty:** Ranked roots below are from **static trace + tester artifacts**, not harness GREEN. Implementation requires **PO NEEDS-LIVE** on built product.

---

## 5. Invariants checked

| Invariant | How satisfied |
|-----------|---------------|
| I8 | No edits |
| I13 | §8 proposes per-fix kill-switches |
| I15 | Mechanisms named; live repro deferred |
| Lane 5 fence | No `chart.js`, `MultichartGrid.jsx`, `TalariaV8bLive.jsx`, or `panel-cmd-bridge` edits |
| No bless blocker | Diagnostic only |

---

## 6. Engine vs multichart split (binding)

| Leg | Territory | Lane 5 can implement? |
|-----|-----------|------------------------|
| **R1** Cross-layout preview leak while drawing | `_syncLivePreviewDrawing` + multichart `broadcastDrawingChange` / sync bridge | **NO** — re-migration / Phase-5 RC-4 tranche; **flag Manager** |
| **R2** Price + time **chart scales vanish** after placement | `_syncAdaptivePriceAxisMargin` + `drawAxes` in `chart.js`; iframe resize race (documented in `chart-host.html`) | **NO** — `chart.js` core frozen for Lane 5; **escalate Manager** |
| **R3** Chart pan/zoom blocked on profile body | `drawing-tools-advanced-volume.js` hitbox + `drawing-tools-manager.js` pan-block | **YES** |
| **R4** Axis price/time **labels** + coordinates reposition | `drawing-tools-base.js` `showAxisHighlights`; VP render price source; partial V9 bridge in `TalariaV8bLive.jsx` | **PARTIAL** — engine overrides **YES**; V9 bridge gaps **NO** (frozen) |
| **R5** Excess anchor control points (TAL-01656/057) | VWAP handle chrome | UI-polish batch (out of A7b core) |

---

## 7. Ranked roots (severity × confidence)

### R1 — Cross-layout volume-profile leak while drawing (TAL-01661) — **MULTICHART / NOT LANE 5**

**Symptom:** Fixed-range profile preview appears on **all** layout tiles during placement (`TAL-01661/1947_18.png`: top-left still drawing; other three show full profile box).

**Mechanism:**

1. `DrawingToolsManager.renderPreview` builds temp `VolumeProfileTool` and calls `_syncLivePreviewDrawing(tempDrawing)` on every move (`drawing-tools-manager.js:6654-6667`, `3290-3311`).
2. `_syncLivePreviewDrawing` serializes temp drawing and calls `chart.broadcastDrawingChange('add'|'update', payload)` when `_isCrossPanelDrawingSyncEnabled()` (`3274-3288`, `3603`).
3. `Chart.broadcastDrawingChange` fans out to every synced panel (`chart.js:37918-37951`); `receiveDrawingChange` upserts by id (`37957-37989`).
4. Volume profile is **not** exempt from live-sync (unlike tools that skip preview broadcast).

**Why multichart:** Sync gate checks `window.__multichartBridge`, `panelManager.syncSettings.drawings`, etc. (`3274-3287`). Correct fix is **scoped preview** (source panel only until finalize) or sync-bridge filter — touches re-migration / Phase-5 RC-4 parked tranche.

**Tickets:** TAL-01661 (primary); amplifies TAL-01666/01667 (peer tiles polluted + harder control).

**Manager handoff:** Attach this root to **Phase-5/RC-4 re-migration tranche** — do not implement in Lane 5.

---

### R2 — Price + time scale vanish on placement tile (TAL-01665/01666/01667) — **CHART.JS CORE / NOT LANE 5**

**Symptom:** After adding anchored/fixed-range VP, **price scale and time/date scale disappear** on the placement panel; chart hard to control until tool removed (`TAL-01665/1951_21.png`).

**Mechanism (static):**

1. Axes paint in `Chart.drawAxes()` (`chart.js:26566+`), which calls `_syncAdaptivePriceAxisMargin()` first (`26569`, `27930-27984`).
2. `_syncAdaptivePriceAxisMargin` early-returns when plot height `ch <= 0` (`27937-27938`) **without** enforcing a floor on `margin.r`.
3. `drawAxes` then fills price strip width `axisW = axisLeft ? m.l : m.r` (`26581-26582`). If `margin.r → 0`, candles run edge-to-edge and **no Y tick labels** render (`26643-26648`).
4. Time strip uses fixed default `margin.b = 30` (`chart.js:612`); tester reports **both** axes gone — consistent with **full axis paint failure** or **zero effective axis width** on that tile after VP finalize triggers `redrawAll` → `scheduleRender` (`drawing-tools-manager.js:11648+`, finalize path `6679+`).
5. Prior internal diagnosis in `chart v 1.4/chart/multichart/chart-host.html:964-986` documents panels with **no visible price axis** (“margin.r dropping below clamp”) and adds a **dev-only** post-`drawAxes` clamp (`PRICE_AXIS_MIN_R = 60`). **Production `chart-embed.html` has no such clamp** (grep clean).

**Trigger association:** VP finalize + heavy `VolumeProfileTool.render` (full bin pass over selected bars, `drawing-tools-advanced-volume.js:1679-1753`) coincides with multichart iframe resize/replay layout — race class matches T3 axis invalidation family (cf. TAL-01592).

**Tickets:** TAL-01665 (primary); TAL-01666/01667 (control loss includes “can’t read scales / can’t aim pan”).

**Lane 5 note:** Fix belongs in **`chart.js` axis margin contract** (enforce min `margin.r` / `margin.b`, guard `ch<=0` after VP redraw). **Escalate to Manager** — Lane 5 must not edit `chart.js`.

---

### R3 — Volume-profile body captures pointer; pan blocked (TAL-01666/01667) — **FREEZE-SAFE ENGINE**

**Symptom:** Chart feels uncontrollable after placement; pan works only outside profile or after deletion.

**Mechanism:**

1. `VolumeProfileTool.render` appends `.volume-profile-hitbox` with `pointer-events: all` for non-anchored profiles (`drawing-tools-advanced-volume.js:1459-1467`).
2. `DrawingToolsManager.isVolumeProfileChartPanBlockedAtPoint` returns true for hits inside profile body (excluding level lines, boundaries, values labels) (`drawing-tools-manager.js:15101-15107`).
3. Chart pan handler consults this (`chart.js:31978-31979`, `33293-33294`) and **aborts pan**.
4. Anchored proxy sets hitbox `pointer-events: none` (`1466`) but **fixed-range** uses full zone between anchors — large capture area.
5. **R1 leak** places synced copies on every tile → pan-block logic applies on **each** polluted panel.

**Tickets:** TAL-01666, TAL-01667 (partial — scales + leak compound severity).

---

### R4 — Price/time axis labels & coordinates reposition (TAL-01662/01664) — **SPLIT ENGINE + V9**

**Symptom:** Settings show Price/Time labels checked but axis highlights don’t work; user cannot adjust tool position via labels/coordinates (`TAL-01662`, `TAL-01664`).

**Mechanism A — engine `showAxisHighlights` wrong geometry for VP:**

1. Base implementation computes price highlight band from **`this.points[].y` only** when `points.length >= 2` (`drawing-tools-base.js:2497-2520`).
2. **Anchored** profile stores **one** point (`AnchoredVolumeProfileTool`, `requiredPoints = 1`, `drawing-tools-advanced-volume.js:2254-2257`) → price/time canvas zones **never created** (guard at 2497 / 2535).
3. **Fixed-range** profile visual top/bottom come from **candle high/low in index span** (`drawing-tools-advanced-volume.js:1380-1391`, stored `_profileTopY/_profileBottomY`), **not** from placement corner prices. If anchors share similar `y` (common horizontal range placement), `zoneHeight === 0` → no price labels.
4. Volume types are **not** in `AXIS_LABEL_DEFAULT_LINE_TYPES` (`drawing-tools-base.js:680-696`) — labels require explicit `showPriceLabel` / `showTimeLabel`.

**Mechanism B — V9 settings bridge (frozen surface, diagnostic reference only):**

1. Fixed-range: `applyVpStyleBridgeFromSnapshot` **does** map `priceLabels` → `showPriceLabel`, `timeLabels` → `showTimeLabel` (`TalariaV8bLive.jsx:23279-23283`) and calls `v9SyncDrawingAxisHighlights`.
2. Anchored: `avStyle` bridge (`23337-23383`) **omits** price/time label props entirely; `avStyle` state has **no** `priceLabels`/`timeLabels` keys (`13716-13734` vs `vpStyle` `13702-13703`). UI toggles cannot reach engine for anchored VP.
3. Engine `buildVolumeProfileStyleTab` (`drawing-tools-ui.js:13165-13609`) has **no** label toggles (V9 React owns Style UI in production).

**Mechanism C — coordinates reposition:**

1. V9 VP coord bridge applies `v9ApplyPointsFromTlStyle` only when settings open (`23306-23335`); anchored coord bridge (`23394-23414`) moves anchor but **no axis resync**.
2. Engine coordinates tab exists (`buildCoordinatesTab`, `17572+`) but V9 multichart often bypasses engine modal for VP.

**Tickets:** TAL-01662 (labels); TAL-01664 (reposition / coordinates).

**Lane 5:** Engine-side `showAxisHighlights` override for VP types using computed profile span — **YES**. V9 bridge parity — **Manager / re-migration**.

---

## 8. Proposed gated fix scope (implementation follow-on)

| Root | Proposed switch (default ON = fix active) | Freeze-safe scope | Files (both mirror trees) | Tickets discharged |
|------|---------------------------------------------|-------------------|---------------------------|-------------------|
| **R3** Pan block too aggressive | `window.__TALARIA_DISABLE_VP_BODY_PAN_BLOCK_FIX` | Narrow hitbox to bar column + boundaries; allow chart pan on zone background; optional pass-through when tool not selected | `drawing-tools-advanced-volume.js`, `drawing-tools-manager.js` | TAL-01666/01667 (partial) |
| **R4a** VP axis highlights use profile span | `window.__TALARIA_DISABLE_VP_AXIS_HIGHLIGHT_GEometry_FIX` | Override `showAxisHighlights` on `VolumeProfileTool` / `AnchoredVolumeProfileTool`: derive price/time zones from computed profile indices + `_profileTopY/_profileBottomY`; single-point anchored time range = anchor → latest bar | `drawing-tools-advanced-volume.js`, optionally `drawing-tools-base.js` hook | TAL-01662, TAL-01664 (partial) |
| **R4b** Add VP types to default-on label set (optional) | `window.__TALARIA_DISABLE_VP_AXIS_LABEL_DEFAULT_ON_FIX` | Add `fixed-range-volume-profile`, `anchored-volume-profile` to `AXIS_LABEL_DEFAULT_LINE_TYPES` **or** set defaults in tool constructors | `drawing-tools-base.js` | TAL-01662 (UX) |
| **R1** Preview sync leak | `window.__TALARIA_DISABLE_VP_LIVE_PREVIEW_CROSS_PANEL_SYNC_FIX` | Skip `_syncLivePreviewDrawing` for VP tool types **or** tag payload `preview:true` ignored by `receiveDrawingChange` on peers | **Re-migration** — `drawing-tools-manager.js` + sync bridge / `chart.js` broadcast filter | TAL-01661 |
| **R2** Scale margin floor | `window.__TALARIA_DISABLE_AXIS_MARGIN_FLOOR_AFTER_VP_FIX` | Enforce min `margin.r`/`margin.b` in `_syncAdaptivePriceAxisMargin` / `drawAxes`; invalidate layout after VP finalize | **`chart.js` — NOT Lane 5** | TAL-01665, TAL-01666/01667 |

**Discriminators (D-023):** Each row needs switch-OFF → honest RED (scales visible / no peer preview / pan works / axis labels appear).

---

## 9. Ticket → root map

| Ticket | Primary root | Secondary |
|--------|--------------|-----------|
| TAL-01661 | R1 | — |
| TAL-01665 | R2 | R3 |
| TAL-01666 | R2 | R1, R3 |
| TAL-01667 | R1 | R2, R3 |
| TAL-01662 | R4 | — |
| TAL-01664 | R4 | R3 |
| TAL-01656/01657 | R5 (VWAP chrome) | — |

---

## 10. Recommended dispatch order (post-diagnostic)

1. **Manager:** R1 + R2 (multichart sync + `chart.js` margin) — not Lane 5.
2. **Lane 5 implementation tranche 1:** R3 + R4a (freeze-safe drawing modules only), gated, with switch-OFF proofs.
3. **Re-migration tranche:** V9 `avStyle` label bridge + preview sync policy (R1/R4b UI).
4. **Retest** all six tickets on combined build; tester re-verify vs fallback-B.

---

## 11. Limits / not done

- No browser session on `build:live` this pass (no harness VP scenario exists for scale-vanish).
- Did not profile VP render time (see A7 indicator report for separate perf track).
- T5 RC-3 anchor phases (`__TALARIA_RC3_*`) are orthogonal — TF-switch anchor drift remains tracked RED (H-S40/41/42); not reopened here.
- Line refs cite canonical `chart v 1.4/chart/**`; mirror `homepage/public/chart/**` is byte-identical (I8).
