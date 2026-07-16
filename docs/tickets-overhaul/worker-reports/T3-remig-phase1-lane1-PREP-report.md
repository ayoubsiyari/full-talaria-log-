# T3 Re-migration Phase 1 PREP — engine selection substrate design (READ-ONLY)

**Task:** T3 remig Phase 1 Lane 1 PREP — predicate/path map, master-slice switch, honest RED→GREEN spec, `chart.js` line-region plan.  
**Type:** Read-only design — no product, harness, or React edits.  
**Date:** 2026-07-15  
**RC:** RC-1 / RC-4 Group A (engine selection store + lifecycle) — design only; fix not started.

**Ready to implement on Phase-0-frozen + snapback-committed go.**

---

## 1. Task + RC

| Field | Value |
|-------|-------|
| Task id | T3 remig Phase 1 PREP (Lane 1) |
| Goal | Design iframe-only flip of tool lifecycle V2 + legacy selection retire V2 behind one master kill-switch |
| RC | **RC-1 / RC-4 Group A** — discharges H-R02, H-R03; unblocks H-R01 store leg |
| Blockers | Lane 4 Phase 0 frozen RED matrix (D-018 #1); Lane 2 D-017 snap-back committed on `chart.js` first (serialization) |

---

## 2. What I changed — file by file

**N/A — read-only.** No files touched.

**Files planned for implementation (I8 mirrors — byte-identical pairs):**

| Path | Planned change |
|------|----------------|
| `chart v 1.4/chart/modules/tool-lifecycle-store.js` | Add master-slice helper; flip `isEnabled()` iframe branch when Phase 1 ON |
| `homepage/public/chart/modules/tool-lifecycle-store.js` | Mirror |
| `chart v 1.4/chart/modules/drawing-tools-manager.js` | Mirror `_isToolLifecycleV2Enabled()` policy; optional shared embed helper |
| `homepage/public/chart/modules/drawing-tools-manager.js` | Mirror |
| `chart v 1.4/chart/chart.js` | Flip `_isLegacySelectionRetireV2Enabled()` iframe branch under master slice |
| `homepage/public/chart/chart.js` | Mirror |

No other files touched in Phase 1 (React ownership/routing = Phase 2).

---

## 3. Kill-switch (I3 + I13)

### Master slice (mandatory per D-018)

| Switch | Default after Phase 1 lands | Meaning |
|--------|----------------------------|---------|
| `window.__TALARIA_DISABLE_MC_REMIGRATION_PHASE1_ENGINE` | **unset** (= Phase 1 ON) | One-knob revert: `true` restores full fallback-B iframe posture for both child predicates |

### Child predicates (retained — granular override still allowed)

| Switch | Role when master ON (unset) | Role when master OFF (`true`) |
|--------|----------------------------|-------------------------------|
| `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2` | unset → lifecycle **ON** in iframe; `true` → force OFF everywhere | iframe reverts to fallback-B: ON only if `=== false` |
| `__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE_V2` | unset → legacy retire **ON** in iframe; `true` → force OFF everywhere | iframe reverts to fallback-B: ON only if `=== false` |

### Single-chart invariant (unchanged)

Host panel A and standalone chart: both predicates remain **ON when unset** regardless of master switch state. Master slice only changes the **iframe embed** branch.

### React / I13

No React/JSX file reads lifecycle or legacy-retire switches today. Phase 1 does **not** edit `MultichartGrid.jsx` or `TalariaV8bLive.jsx`. Master switch gates engine iframe boot only (panel iframe `window`). Document for PO/staging: inject via panel URL query or pre-boot script if ever needed on parent shell — not required for Phase 1 mechanism.

### Proposed predicate logic (implementation contract)

```javascript
// Shared pattern — duplicate in 3 files (matches T1 fallback-B style)
function _isMcRemigrationPhase1EngineSliceActive() {
    if (typeof window === 'undefined') return true;
    return !window.__TALARIA_DISABLE_MC_REMIGRATION_PHASE1_ENGINE;
}

// TOOL_LIFECYCLE — tool-lifecycle-store.isEnabled() + drawing-tools-manager._isToolLifecycleV2Enabled()
function _iframeToolLifecycleV2Enabled() {
    if (typeof window !== 'undefined' && window.__TALARIA_DISABLE_TOOL_LIFECYCLE_V2) return false;
    if (!_isMcRemigrationPhase1EngineSliceActive()) {
        return typeof window !== 'undefined' && window.__TALARIA_DISABLE_TOOL_LIFECYCLE_V2 === false;
    }
    return true; // Phase 1 ON: iframe default ON
}

// LEGACY_SELECTION_RETIRE — chart._isLegacySelectionRetireV2Enabled()
function _iframeLegacySelectionRetireV2Enabled() {
    if (typeof window !== 'undefined' && window.__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE_V2) return false;
    if (isMultichartEmbedPanel()) { // chart.js uses _isMultichartEmbedPanel()
        if (!_isMcRemigrationPhase1EngineSliceActive()) {
            return typeof window !== 'undefined' && window.__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE_V2 === false;
        }
        return true;
    }
    return true; // host + single-chart
}
```

---

## 4. Predicate / path map — what must flip (iframe only)

### A. Embed detection (read paths — align at implement time)

| Helper | Location | Detects |
|--------|----------|---------|
| `Chart._isMultichartEmbedPanel()` | `chart.js:2147–2151` | `documentElement.classList.contains('multichart-embed')` only |
| `isMultichartIframeEmbed()` | `drawing-tools-manager.js:55–70` | parent grid, `__talariaV9PanelEmbed`, `multichart-embed` class, `?multichart=1` |
| `ToolLifecycleStore._isMultichartIframeEmbed()` | `tool-lifecycle-store.js:29–46` | chart `_isMultichartEmbedPanel()` + parent grid + class + query |

**Host panel A:** all three return **false** → single-chart ON path (no flip needed).  
**Panel B iframe:** all three return **true** → flip target.

**Implement note:** keep iframe branches consistent; prefer calling `chart._isMultichartEmbedPanel()` from store when `drawingManager.chart` exists.

### B. Tool lifecycle V2 — read sites

| File | Symbol / region | Current fallback-B iframe behavior | Phase 1 ON behavior |
|------|-----------------|--------------------------------------|---------------------|
| `tool-lifecycle-store.js` | `isEnabled()` **21–27** | OFF unless `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2 === false` | ON unless explicit `true` disable |
| `tool-lifecycle-store.js` | `emit()` **58–59** | no-op when disabled | emits `toolSelected` / `toolDeselected` / … |
| `drawing-tools-manager.js` | `_isToolLifecycleV2Enabled()` **3575–3580** | same opt-in | ON by default in iframe |
| `drawing-tools-manager.js` | `_emitToolLifecycle()` **3583–3586** | gated off | routes selection events to store |
| `drawing-tools-manager.js` | `_installToolLifecycleStoreSubscribers()` **3588–3686** | subscribers idle | `toolSelected` → `selectDrawing` + peer UI clear |
| `drawing-tools-manager.js` | `_selectExistingDrawingViaLifecycle()` **3688–3709** | returns false | armed-tool click → store select |
| `drawing-tools-manager.js` | placement complete **6625–6631**, **7014+** | direct `selectDrawing` only | lifecycle emit on new tool |
| `drawing-tools-manager.js` | `selectDrawing()` **9857+** | runs but store not fed on iframe click path | unchanged — becomes reachable when lifecycle ON |

**Selection click path (H-R02):** `handleMouseDown` **3735+** → hit test → `selectDrawing(drawing, _isMultiSelectModifier(event))` **~4411**; with legacy retire ON, `chart.js` legacy mousedown/click handlers **early-return** so `DrawingToolsManager` owns selection.

**Ctrl multi-select path (H-R03):** `_isMultiSelectModifier()` **13464–13466** (Ctrl/Shift/Meta) → `selectDrawing(drawing, true)` **4411**; iframe guard `_suppressNextIframeCtrlSelectToggle` **9871–9883** must remain (prevents double-toggle race).

### C. Legacy selection retire V2 — read sites (`chart.js`)

| Line region | Path | Effect when OFF (fallback-B iframe) | Effect when ON (Phase 1) |
|-------------|------|-----------------------------------|--------------------------|
| **2349–2357** | `_isLegacySelectionRetireV2Enabled()` | **Primary predicate — flip here** | |
| **19168–19200** | `handleKeyDown` Escape/Delete | legacy `chart.selectedDrawing` array path | `dm.deselectAll` / `dm.deleteDrawing` (Phase 4 keyboard bridge still separate) |
| **33253–33255** | canvas `mousedown` selection | legacy index selection runs | early return → DM owns |
| **33479–33482** | SVG `click` selection | legacy toggle | early return |
| **34451–34454** | per-drawing `element.on('click')` | legacy `chart.selectedDrawing` | early return |
| **34480–34483** | `contextmenu` on drawing | legacy select | early return |

### D. State matrix (post Phase 1)

| Surface | Master unset | Master `true` (revert) | Child `__TALARIA_DISABLE_* = true` |
|---------|--------------|------------------------|-------------------------------------|
| Single-chart / host A | Lifecycle ON; legacy retire ON | Same (unchanged) | Force OFF |
| Panel B iframe | Lifecycle ON; legacy retire ON | Fallback-B opt-in (`=== false`) | Force OFF |
| Panel B + `migrationOn` harness | Redundant with product default after P1 | — | — |

---

## 5. Proof — honest RED→GREEN spec (coordinate Lane 4)

### Commands (implementation step — built `dist-v9`)

```bash
# Primary acceptance
npm run gate:react -- --only=H-R02,H-R03 --runs=10

# Partial H-R01 (store leg only — V9 bar expected RED until Phase 2)
npm run gate:react -- --only=H-R01 --runs=10

# Master-switch A/B (Lane 4 to wire --phase1-off or env)
# evaluateOnNewDocument: window.__TALARIA_DISABLE_MC_REMIGRATION_PHASE1_ENGINE = true
npm run gate:react -- --only=H-R02,H-R03 --runs=10   # expect RED again
```

### Scenario actuation → measurement (I15)

| Scenario | Actuation | Measures (end-state) | Phase 1 target |
|----------|-----------|----------------------|----------------|
| **H-R02** | Real `page.mouse` single-click on seeded rectangle (host A + panel B iframe) | `readDrawingSelectedInStore` → `dm.selectedDrawings`; `readSelectionChrome.hasBlueBorder` when store-selected | **10/10 GREEN** |
| **H-R03** | Real single-click first trendline, real Ctrl+click second | Both ids in `dm.selectedDrawings` / `isDrawingSelected` | **10/10 GREEN** |
| **H-R01** | Same click path as H-R02 | `readReactParityState.selectedIds` + parent `#tl-sett` / V9 bar | **Store leg GREEN**; `toolbarVisible` / V9 may stay **RED** until Phase 2 (ownership + routing V3) |

### RED baseline today (fallback-B, build b1 posture)

From `known-failing.json` + step-17 audit:

- **H-R02:** `store selected=false` while handles visible (orphan chrome) — host + panel B
- **H-R03:** Ctrl+click does not retain both in store
- **H-R01:** click does not commit store + V9 bar

### Harness coordination (Lane 4 — not this step)

1. Add `phase1Off` / `REACT_PARITY_PHASE1_OFF` to `installBuiltProductBoot` setting master `true` (A/B revert).
2. After product default flip, **default gate boot should NOT require** `migrationOn` or per-child `= false` for H-R02/H-R03 GREEN.
3. Keep `migrationOn` temporarily for Phases 2–6 until each slice has its own master switch.
4. Phase 0 must freeze whether H-R07/H-R12 are in matrix before counting regressions.

### Determinism

Report **10/10** per scenario on built dist; no `sleep()`-gated greens — use `waitForReactSelection` / `waitForPanelSettle` existing helpers.

---

## 6. Invariants checked

| Invariant | Design satisfaction |
|-----------|---------------------|
| **I3** | Master + child switches; default fix ON = master unset |
| **I13** | Master gates every engine file in slice; React N/A (no reads) |
| **I14** | No parent globals added; selection stays in iframe store |
| **I15** | Acceptance spec names real mouse actuation + store/chrome end-states |
| **P-invariant** | Six-file mirror plan documented |
| **D-010** | H-R01 V9 bar failure after P1 ≠ Phase 1 failure |
| **D-018 #2** | Master slice mandatory, not optional |
| **Single-chart untouched** | Host/single-chart branches explicitly preserved |

**Could not satisfy yet:** Phase 0 frozen matrix; snap-back commit boundary on `chart.js`.

---

## 7. What I did NOT do / limits

- No product edits, no harness edits, no `known-failing.json` updates.
- Did not re-run `gate:react` (design-only).
- Did not implement D-017 snap-back (Lane 2 `ESC015-D017-lane2-snapback-fix.md`) — noted overlap regions below.
- Embed-detector mismatch (`_isMultichartEmbedPanel` vs `isMultichartIframeEmbed`) flagged — reconcile at implement without widening host scope.
- Phases 2–6 (ownership V3, settings transport, keyboard bridge, peer deselect, marquee) explicitly out of scope.
- `migrationOn` in `react-parity-lib.mjs` still sets child `= false` — Lane 4 should migrate to master switch semantics.

---

## 8. Live-verification handoff

After implementation + build bump:

1. Open 2-panel multichart (host A + panel B) on staging build; confirm build id inside panel B iframe.
2. Place rectangle on panel B → single-click → shape shows resize handles **and** remains selected after pan one frame.
3. Two trendlines on panel B → click first → Ctrl+click second → both highlighted.
4. **Known still broken after P1:** parent V9 quick bar may not appear on panel B select (H-R01 chrome leg) — Phase 2.
5. Revert test: set `__TALARIA_DISABLE_MC_REMIGRATION_PHASE1_ENGINE = true` in panel boot → panel B click selects visually but store empty (H-R02 RED posture).

---

## 9. Status

**DIAGNOSTIC-ONLY** — design complete; implementation blocked on Phase 0 freeze + D-017 `chart.js` commit.

**Ready to implement on Phase-0-frozen + snapback-committed go.**

---

## Appendix A — `chart.js` line-region plan (serialization vs Lane 2 D-017)

**Lane 2 D-017 snap-back (do not edit in Phase 1 — land/commit first):**

| Region | Lines (approx.) | Mechanism |
|--------|-----------------|-----------|
| `_panReleaseAnchorHoldFixDisabled` / `_userOwnsReleasedViewport` | 2456–2470 | D-017 kill-switch `__TALARIA_MC_DISABLE_PAN_RELEASE_ANCHOR_HOLD` |
| Prepend snapshot / compensation | 2472–2526, 3475, 4104 | Re-based prepend baseline |
| Index-pin suppress | 17296–17357 | `!_userOwnsReleasedViewport()` guards |
| Pan-release handler | ~32370+ (mouseup path) | Release offset preservation |

**Phase 1 touch zones (disjoint from D-017 above):**

| Region | Lines | Edit |
|--------|-------|------|
| `_isLegacySelectionRetireV2Enabled` | **2349–2357** | Master-wrapped iframe flip |
| Keyboard legacy path | 19168–19200 | Consumer only — verify no edit if predicate sufficient |
| Canvas mousedown legacy select | 33253–33255 | Consumer |
| SVG click legacy select | 33479–33482 | Consumer |
| Drawing element click/contextmenu | 34451–34483 | Consumer |

**Serialization rule:** Lane 2 commits D-017 regions first → Lane 1 Phase 1 edits **only** 2349–2357 (+ mirror) unless consumer guard audit requires one-line comment; avoid 2456–2526 and 17296–17357 entirely.

---

## Appendix B — `drawing-tools-manager.js` line-region plan

| Region | Lines | Edit |
|--------|-------|------|
| `isMultichartIframeEmbed()` | 55–70 | Read-only reference |
| `lifecycleStore` construct | 328–335 | No change |
| `_isToolLifecycleV2Enabled()` | **3575–3580** | Master-wrapped iframe flip |
| Lifecycle subscribers | 3588–3686 | No change (activated when enabled) |
| `_selectExistingDrawingViaLifecycle` | 3688–3709 | No change |
| `handleMouseDown` selection | 3735–4411 | No change (path unblocked by predicates) |
| `selectDrawing` / Ctrl multi | 9857–9956, 13464–13466 | No change |
| `_suppressNextIframeCtrlSelectToggle` | 9871–9883 | Preserve — H-R03 race guard |

---

## Appendix C — `tool-lifecycle-store.js` line-region plan

| Region | Lines | Edit |
|--------|-------|------|
| `isEnabled()` | **21–27** | Master-wrapped iframe flip |
| `_isMultichartIframeEmbed()` | 29–46 | Optional: delegate to `chart._isMultichartEmbedPanel()` |
| `emit` / `_reduce` | 58–125 | No change |

---

## Appendix D — Lane 4 deltas requested at implement

| Item | Owner |
|------|-------|
| `installBuiltProductBoot({ phase1Off: true })` for master A/B | Lane 4 |
| Phase 0 frozen RED list before dispatch | Lane 4 |
| Remove H-R02/H-R03 from `knownFailing` only after 10/10 GREEN + switch A/B | Lane 4 |
| Deprecate `migrationOn` child flips for P1 proof once product default flipped | Lane 4 |
