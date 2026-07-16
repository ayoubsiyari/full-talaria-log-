# T3 Lane 1 — Objects-Tree × lifecycle-store multi-select diagnostic (READ-ONLY)

**Task:** `T3-remig-lane1-objecttree-lifecycle-multiselect-diagnostic-READONLY.md`  
**Type:** Read-only diagnostic — no product/React/harness/registry edits, no commit  
**Date:** 2026-07-16  
**RC:** RC-4 peer sync (PLAN2-FOUND#3 context) + RC-1 selection substrate (lifecycle store split)

---

## 1. Task + RC

| Field | Value |
|-------|-------|
| Task id | Objects-Tree × ToolLifecycleStore multi-select diagnostic |
| Question | Does Objects-Tree under-report multi-select because `toolSelected` collapses to single-select while Ctrl/marquee writes only `dm.selectedDrawings`? |
| RC | **RC-1** (selection store) + **RC-4** (multichart Objects-Tree enumeration) |
| Related | PLAN2-FOUND#3 (duplication), integration contract §A.4 |

---

## 2. What I changed — file by file

| Path | Change |
|------|--------|
| `docs/tickets-overhaul/worker-reports/T3-remig-lane1-objecttree-lifecycle-diagnostic-report.md` | **Created** — this report |

**No product, React, harness, registry, or git operations performed.**

---

## 3. Kill-switch (I3 + I13) — existing + proposed

| Switch | Scope today | Relation to this diagnostic |
|--------|-------------|----------------------------|
| `__TALARIA_DISABLE_OBJECTS_TREE_MULTICHART_DEDUPE_V1` | `TalariaV8bLive.jsx` `rebuildNow` id-first dedupe (step 19) | **PLAN2-FOUND#3 only** — list cardinality, not selection highlight |
| `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2` | Disables lifecycle bus | Legacy tree highlight prefers store when enabled |
| `__TALARIA_DISABLE_MC_REMIGRATION_PHASE1_ENGINE` | Iframe lifecycle ON | Does not fix tree highlight by itself |

**Proposed fix switch (if implemented later):** `__TALARIA_DISABLE_OBJECTS_TREE_MULTISELECT_HIGHLIGHT_V1` — gates **highlight read path only** in `object-tree.js` + V9 layers row styling; default OFF (= multi-highlight ON). Independent of dedupe switch.

---

## 4. Proof — RED → GREEN

**N/A — read-only diagnostic.** Proposed RED spec in §7 if fix is authorized.

---

## 5. Objects-Tree selection read paths (two surfaces)

Multichart product exposes **two** object-tree implementations. PO PLAN2-FOUND#3 refers to the **V9 right-panel Layers tree** (`rightPanel === 'layers'`). The integration-contract lifecycle concern applies most directly to **legacy `ObjectTreeManager`**, which is still mounted on host `chart.js` but is not the primary multichart UI.

### 5.1 Legacy `ObjectTreeManager` (`chart/modules/object-tree.js`)

| Concern | Source | Lines |
|---------|--------|-------|
| **List body** | `this.drawingManager.drawings` | `refresh()` ~209–238 |
| **Row highlight** | `lifecycleStore.getSelectedDrawing()` **first**, else `dm.selectedDrawing` | `createObjectItem()` ~299–306 |
| **Does NOT read** | `dm.selectedDrawings[]`, `d.selected`, `getSelectedDrawings()` | — |
| **Refresh triggers** | `show()`; `selectDrawing()` on row click; lifecycle `toolSelected` / `toolDeselected` / `toolDeleted` / `toolHidden` | ~36–40, 477–492 |
| **Row click write** | Emits `toolSelected` → store `_reduce` collapses to **one** drawing → subscriber calls `selectDrawing(d, false)` | ~477–486, store ~103–105 |

Highlight logic (authoritative):

```299:306:chart v 1.4/chart/modules/object-tree.js
        const storeSelected = this.drawingManager.lifecycleStore
            && typeof this.drawingManager.lifecycleStore.getSelectedDrawing === 'function'
            ? this.drawingManager.lifecycleStore.getSelectedDrawing()
            : null;
        if ((storeSelected && storeSelected === drawing) || (!storeSelected && this.drawingManager.selectedDrawing === drawing)) {
            item.classList.add('selected');
        }
```

**Lifecycle store collapse** (`tool-lifecycle-store.js` ~103–105): `toolSelected` always sets `state.selectedDrawings = drawing ? [drawing] : []` — single entry only. `getSelectedDrawings()` exists but **legacy tree never calls it**.

**Canvas Ctrl+click / marquee** call `dm.selectDrawing(d, true)` without `_emitToolLifecycle('toolSelected')`. `selectDrawing` ends with `objectTreeManager.refresh()` (~9967–9968), so the list rebuilds, but highlight still uses singular store/primary paths above.

### 5.2 V9 Layers / Objects Tree (`TalariaV8bLive.jsx`)

| Concern | Source | Lines |
|---------|--------|-------|
| **List body** | `enumerateV9DrawingManagersFromWindow()` → each `dm.drawings`, with id/`__syncId` dedupe | `rebuildNow` ~19075–19174 |
| **Row highlight** | **None** — rows only have hover (`swHov`), not selection styling | ~36690–36749 |
| **Row click** | `dm.selectDrawing(d)` single-select | ~36724–36726 |
| **Rebuild triggers** | `drawingsChanged`, `drawingStyleChanged`, `chartDataLoaded`, `timeframeChanged`, `panelSelected` — **not selection change** | ~19205–19228 |
| **Selection helpers (elsewhere)** | `v9DrawingIsPrimarySelection` reads **`dm.selectedDrawings[]`** correctly | ~3905–3932 |
| | `getSelectedDrawingAcrossCharts` returns **`selectedDrawings[0]` only** for toolbar | ~3807–3809 |

V9 row render has no `isSelected` / `v9DrawingIsPrimarySelection` check in the layers list — selection state is invisible in the tree UI even when `dm.selectedDrawings` has 2+ entries.

---

## 6. Multi-select verdict

### Question: Ctrl+click or marquee (2+ shapes) — what does the tree show?

| Surface | List rows correct? | Multi-select highlight | Root cause class |
|---------|-------------------|------------------------|------------------|
| **Legacy `object-tree.js`** | Yes (one row per local drawing) | **Under-reports** — at most **one** `.selected` row; often **wrong** row if lifecycle store is stale | Reads `getSelectedDrawing()` / `selectedDrawing` only; store not updated on multi-select path |
| **V9 Layers (PO multichart)** | Duplication bug when dedupe OFF (PLAN2-FOUND#3) | **No row selection styling at all** | UI gap — not lifecycle collapse; helpers already read `dm.selectedDrawings` elsewhere |

### Legacy tree — step-by-step failure (2 trendlines, Ctrl+multi-select)

1. User selects trendline A via canvas → `selectDrawing(A)` → `dm.selectedDrawings = [A]`; no `toolSelected` emit.
2. User Ctrl+clicks trendline B → `selectDrawing(B, true)` → `dm.selectedDrawings = [A, B]`; `selectedDrawing = B`; still no `toolSelected` emit.
3. `objectTreeManager.refresh()` runs → list shows both shapes.
4. **Highlight:** `getSelectedDrawing()` returns stale `state.selectedDrawing` if a prior `toolSelected` fired (e.g. row click), else null. Fallback `selectedDrawing === drawing` matches **only B**.
5. **Result:** One row highlighted (B only), or stale row (prior lifecycle single) — **never both A and B**.

### Marquee (P6 path)

Same as step 2–5: `completeCtrlMarqueeFromChart` → repeated `selectDrawing(d, true)` → `dm.selectedDrawings` populated correctly; legacy tree highlight still singular.

### V9 Layers

Multi-select on chart does not change row appearance; user cannot see which 2+ objects are selected in the tree panel. Toolbar/quick-bar code uses `dm.selectedDrawings` (partially — first entry only in `getSelectedDrawingAcrossCharts`).

**Answer to prompt question:** **Yes for legacy tree highlight; different gap for V9 Layers.** The lifecycle single-select collapse **contributes** to legacy under-reporting when combined with singular read path. V9 PO tree under-reporting is primarily **missing selection styling + rebuild not tied to selection**, not the store `_reduce` shape.

---

## 7. PLAN2-FOUND#3 cross-check — independent root

| Dimension | PLAN2-FOUND#3 (duplication) | Multi-select highlight (this diagnostic) |
|-----------|----------------------------|------------------------------------------|
| **Symptom** | Same shape listed **N times** (N panels) | Wrong count of **highlighted** rows (0 or 1 vs 2+) |
| **Mechanism** | `rebuildNow` iterates **all** panel `dm.drawings`; pre-fix dedupe keyed on panel-local `points.x:y` | Highlight reads **singular** lifecycle/`selectedDrawing`; V9 has no highlight |
| **Data plane** | **Inventory** (how many rows) | **Selection chrome** (which rows look selected) |
| **Fix staged (b105)** | `__TALARIA_DISABLE_OBJECTS_TREE_MULTICHART_DEDUPE_V1` — id/`__syncId` first | Not addressed by dedupe switch |
| **Store split** | Unrelated — duplicates exist even when zero shapes selected | Stale `getSelectedDrawing()` can add **wrong** highlight on top of duplicates |

**Verdict:** PLAN2-FOUND#3 and lifecycle multi-select collapse are **fully independent** defects on the same UI surface. Fixing id-dedupe does **not** fix multi-select highlight. Fixing highlight does **not** fix duplication.

Evidence (dedupe vs selection):

```19096:19158:chart v 1.4/talaria-design/src/TalariaV8bLive.jsx
        // Multichart: every panel's drawingManager holds a synced copy ...
        const seenDrawingKeys = new Set();
        const drawingDedupeKey = (d) => {
          // id / __syncId first when multichartDedupeEnabled
          ...
        };
        for (const dm of managers) {
          ...
          for (const d of valid) {
            const dedupeKey = drawingDedupeKey(d);
            if (dedupeKey !== null) {
              if (seenDrawingKeys.has(dedupeKey)) continue;
```

No reference to `lifecycleStore`, `toolSelected`, or `selectedDrawings` in inventory build.

---

## 8. Real defect? Fix boundary + RED spec (not implemented)

### Defect status

| Item | Real defect? | Severity |
|------|--------------|----------|
| Legacy tree multi-highlight | **Yes** — under-reports 2+ selection | Medium (legacy sidebar; multichart PO uses V9) |
| V9 Layers multi-highlight | **Yes** — no selection row styling | Medium–High (PO-visible) |
| PLAN2-FOUND#3 duplication | **Yes** — separate thread | High (inventory) |
| Lifecycle `_reduce` single collapse | **Contributes** to legacy stale/wrong highlight; **not** root of V9 missing styling | Design debt |

### Recommended fix boundary (when authorized — post P1, not Phase-1 commit scope)

| File | Change | Out of scope |
|------|--------|--------------|
| `chart/modules/object-tree.js` (+ homepage mirror) | `createObjectItem`: highlight if `dm.selectedDrawings.includes(drawing)` OR id match; deprecate `getSelectedDrawing()` as primary; optional `d.selected` on focused panel only | Do not change list inventory / dedupe |
| `TalariaV8bLive.jsx` | Layers row: `isSelected = v9DrawingIsPrimarySelection(item._ownerDm, item._drawing)`; subtle row bg + left accent; `useEffect` rebuild on selection change (custom event or poll `dm.selectedDrawings` sig when layers open) | Do not merge with dedupe logic |
| `tool-lifecycle-store.js` | **Optional Phase 2+** — `toolMultiSelected` event or `_reduce` merge for multi-select | Not required if trees read `dm` directly (integration contract recommendation) |

**Kill-switch:** `__TALARIA_DISABLE_OBJECTS_TREE_MULTISELECT_HIGHLIGHT_V1` gates both surfaces; OFF = revert to current singular / no-highlight behavior.

### Proposed RED spec (harness or PO — not implemented)

| ID | Setup | Actuation | End-state |
|----|-------|-----------|-----------|
| **OT-MS-01** | 2v multichart; two trendlines on panel B | Real Ctrl+click second after first selected | V9 Layers: **both** rows show selected styling; legacy tree (if opened): **both** `.selected` |
| **OT-MS-02** | Same | Real Ctrl+drag marquee enclosing both | Same — both rows highlighted |
| **OT-MS-03** | 4-panel; dedupe ON | Place one rectangle | Layers list shows **one** row (PLAN2-FOUND#3 regression fence) |
| **OT-MS-OFF** | Switch ON | Repeat OT-MS-01 | At most one highlight (legacy) / none (V9) — revert proven |

Not a reactParity H-R row today — register as **OT-MS** family or fold into parity checklist after Lane 4 harness owner approves.

---

## 9. Invariants checked

| Invariant | Status |
|-----------|--------|
| Read-only guardrails | No code edits |
| I14 | V9 tree inventory uses parent `enumerateDrawingManagers` — separate from selection read |
| Integration contract alignment | Confirms `dm.selectedDrawings` authoritative; lifecycle snapshot secondary for tree |

---

## 10. What I did NOT do / limits

- No live PO repro or harness run.
- Did not verify whether legacy `#objectTreePanel` is visible in multichart embed (likely superseded by V9 Layers).
- Did not implement lifecycle `toolMultiSelected` — fix boundary recommends dm-first read as minimal path.
- PLAN2-FOUND#3 prototype (id-dedupe) assumed present in tree; live confirm still pending per step 19.

---

## 11. Live-verification handoff

PO / staging check (build with step-19 dedupe + P1 engine):

1. Open 2v multichart → Layers panel.
2. Place two trendlines on panel B → Ctrl+click to multi-select → **expect today:** no multi-row highlight in V9 Layers (defect confirmed if so).
3. 4-panel → one shape → **expect with dedupe ON:** one row per shape (PLAN2-FOUND#3); **independent** of step 2.

---

## 12. Status

**DIAGNOSTIC-ONLY — real defects identified; threads separated**

| Thread | Verdict |
|--------|---------|
| Lifecycle collapse → legacy tree under-report | **Confirmed** — singular read path + stale store |
| V9 Layers multi-select visibility | **Confirmed gap** — no row selection styling (orthogonal to dedupe) |
| PLAN2-FOUND#3 duplication | **Independent** — inventory dedupe; close duplication on id-fix + OT-MS-03; do **not** merge with highlight fix |

**PLAN2-FOUND#3 duplication thread:** remains open on **inventory**; not caused by lifecycle store split. **Multi-select highlight thread:** open — fix boundary in §8; not part of Phase-1 commit manifest.
