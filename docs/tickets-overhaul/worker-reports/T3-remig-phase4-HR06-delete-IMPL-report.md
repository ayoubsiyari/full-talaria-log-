# T3 Re-migration Phase 4 — H-R06 Delete IMPLEMENT (D-021 reduced scope)

**Task:** `T3-remig-phase4-lane1-HR06-delete-IMPL-D021.md`  
**Date:** 2026-07-16  
**RC:** RC-1 / RC-4 **Group D (I14)** — H-R06 Delete leg only (Esc deferred verify-only per D-021)

---

## 1. Task + RC

| Field | Value |
|-------|-------|
| Task id | T3 Phase 4 Lane 1 — H-R06 Delete-in-panel IMPLEMENT |
| Goal | Wire Delete keyboard bridge behind new `__TALARIA_DISABLE_MULTICHART_PANEL_KEYBOARD_V1`; honest 10/10 H-R06 + switch-OFF A/B |
| RC | **RC-1 / RC-4 Group D** — discharges frozen-matrix **H-R06** |
| Phase-1 land | `6dc552a875c011771f35684d35aee0f892343815` (build `20260716b1`) — prerequisite satisfied |

---

## 2. What I changed — file by file

| Path | Change |
|------|--------|
| `chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js` | Added `multichartPanelKeyboardV1EnabledInEmbed()`; gated `onDeleteDrawingKey` + `deleteSelectedDrawings` cmd on new switch. **Esc paths unchanged** (still `multichartKeyboardTransportFixEnabled`). Delete set reads `dm.selectedDrawings.slice()` + `selectedDrawing` fallback. |
| `homepage/public/chart/multichart-prod/panel-cmd-bridge.js` | I8 mirror (SHA256 match). |
| `chart v 1.4/talaria-design/src/MultichartGrid.jsx` | Added `multichartPanelKeyboardV1Enabled()`; gated `onParentDeleteDrawingKey` + host `deleteSelectedDrawings` runCommand. **Esc forwarder unchanged** (`multichartSettingsFlashFixEnabled`). |
| `chart v 1.4/chart/modules/drawing-tools-manager.js` | Added `multichartPanelKeyboardV1Enabled()`; iframe Delete/Backspace `handleKeyDown` gated on new switch (was quickbar switch). Multi-delete still reads `this.selectedDrawings` first. |
| `homepage/public/chart/modules/drawing-tools-manager.js` | I8 mirror (SHA256 match). |
| `chart v 1.4/chart/modules/keyboard-shortcuts.js` | Added `multichartPanelKeyboardV1Enabled()` + `isMultichartHostShell()`; `deleteSelected()` early-return when multichart host + switch OFF. |
| `homepage/public/chart/modules/keyboard-shortcuts.js` | I8 mirror (SHA256 match). |
| `chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs` | `deleteSelectedViaKeyboard` uses `focusReactPanelSoft` (preserves selection before Delete — I15 honest actuation fix). `panelKeyboardOff` boot hook already present; confirmed wired. |
| `homepage/public/chart/multichart-prod/harness/react-parity-lib.mjs` | Mirror. |
| Build artifacts (`dist-v9`, `live/index.html`, SW, `serve.mjs`, `chart-embed.html`, homepage mirrors) | `npm run build:live` with **`BUILD_ID=20260716b2`**. |

**No other product files touched.** `known-failing.json` **not** edited (Lane 4 owns registry). `chart.js` Esc/Delete legacy block untouched.

### Region-map disjoint confirmation (STEP 0)

| Zone | Lines | Overlap? |
|------|-------|----------|
| P4 Delete — `panel-cmd-bridge.js` | 2642–2657, 4049–4079, new helper ~4010–4020 | **Disjoint** from T8 replay regions (550–712, 1252–1290, 3244+, 3866–3927) |
| P4 Delete — `MultichartGrid.jsx` | 4327–4341, 5901–5920 | **Disjoint** from Lane 2 H-R07 peer-routing (~5221, peer deselect handlers) and P3 settings (~5074–5213) |
| Esc paths | 4031–4047, 5872–5898 | **Not modified** this PR |

---

## 3. Kill-switch (I3 + I13)

| Switch | Default | Meaning |
|--------|---------|---------|
| `window.__TALARIA_DISABLE_MULTICHART_PANEL_KEYBOARD_V1` | **unset** (= ON) | Delete bridge active on all gated paths |

| File | Gated path(s) | OFF behavior |
|------|---------------|--------------|
| `panel-cmd-bridge.js` | `onDeleteDrawingKey`, `deleteSelectedDrawings` cmd | No iframe capture delete; cmd no-op |
| `MultichartGrid.jsx` | `onParentDeleteDrawingKey`, `deleteSelectedDrawings` runCommand | Parent shell does not forward Delete |
| `drawing-tools-manager.js` | iframe `handleKeyDown` Delete/Backspace | Early return in embed |
| `keyboard-shortcuts.js` | `deleteSelected()` on multichart host | Early return |

**Decoupled from** `__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2` per D-018 #2. Esc still uses quickbar/flash switches — intentional (D-021 Esc verify-only).

Harness A/B: `REACT_PARITY_PANEL_KEYBOARD_OFF=1` or `react-run --panel-keyboard-off`.

---

## 4. Proof — RED → GREEN

### Prerequisites

- Phase-1 substrate ON (`migration-on` boot).
- Built product `dist-v9` **20260716b2**.

### RED (before fix)

```text
node react-run.mjs --only=H-R06 --runs=1 --migration-on
H-R06 CORE (host): placed drawing removed from store — stillExists=true
H-R06 CORE (panelB): placed drawing removed from store — stillExists=true
FINAL H-R06 FAIL-REAL-BUG
```

**Mechanism:** `deleteSelectedViaKeyboard` called `focusReactPanel` (canvas click), which deselected via `fromCanvasBackground` before `page.keyboard.press('Delete')`. Delete handlers correctly no-op’d on empty `dm.selectedDrawings`. Product delete paths were largely functional once selection was preserved.

### GREEN (after fix)

```powershell
cd "chart v 1.4/chart/multichart-prod/harness"
node react-run.mjs --only=H-R06 --runs=10 --migration-on
# FINAL H-R06 PASS (10/10)

$env:REACT_PARITY_PANEL_KEYBOARD_OFF = "1"
node react-run.mjs --only=H-R06 --runs=10 --migration-on --panel-keyboard-off
# FINAL H-R06 FAIL-REAL-BUG (10/10) — host + panelB stillExists=true
```

### I15 actuation + measurement

| Step | Actuation | End-state |
|------|-----------|-----------|
| Select | `singleClickDrawing` (real mouse at hit coords) | `waitForReactSelection` → `dm.selectedDrawings` ids |
| Delete | `focusReactPanelSoft` + `page.keyboard.press('Delete')` | `drawingExists=false`, render delta, `assertNoGhostAfterDelete` |

No `handleKeyDown` injection. Multi-delete contract: all paths slice `dm.selectedDrawings` before `deleteDrawing` (not lifecycle store).

### gate:react

All 14 scenarios **PASS** on build `20260716b2`. Exit code 1 only because `known-failing.json` still lists H-R06/H-R07 — **Lane 4 must remove** (guardrail: this worker did not edit registry).

```text
REACT-GATE H-R06 PASS (known-failing)
REACT-GATE H-R07 PASS (known-failing)
[react-gate] FAIL: baseline stale; remove fixed test(s): H-R06, H-R07
```

### I8 SHA256 (post-build)

| Pair | SHA256 |
|------|--------|
| `panel-cmd-bridge.js` | `5CF451DB9A8EDB89DFFAF0A10B034F11A3C4B4765E72865840D620F0D69CA45D` |
| `drawing-tools-manager.js` | `A4CE2839896F96E778F4C7216729FC1401E77114505E6F214361421F5CF50FD9` |
| `keyboard-shortcuts.js` | `74A8C3F37E68B66ACC3667BF0C3BDFD31FD6D1C9FBC17D92D5BE5350F06352B7` |

---

## 5. Invariants checked

| Invariant | How satisfied |
|-----------|---------------|
| I3 | One new master switch `PANEL_KEYBOARD_V1` |
| I13 | Delete decoupled from quickbar-settings switch; per-file gate table above |
| I14 | No parent globals into iframe; postMessage/cmd bus unchanged |
| I15 | Real keyboard + store end-state; soft-focus fix documented |
| I8 | Three engine pairs + bridge mirror SHA256-verified |
| D-011 | Switch-OFF 10/10 FAIL-REAL-BUG host + panel B |
| D-018 #2 | New switch; quickbar switch not extended for Delete |

---

## 6. What I did NOT do / limits

- **Esc paths** not modified (D-021 reduced scope).
- **`known-failing.json`** not updated — gate clean exit blocked until Lane 4 registry pass.
- **`chart.js` ~19193 Delete** not gated — host delete on multichart flows through `keyboard-shortcuts` / parent forwarder in harness; direct chart keydown path not exercised in H-R06 proof.
- **Commit not created** — awaiting Manager combined-build coordination / user request.
- H-R07 green in gate run is incidental (peer isolation); **not claimed** as this task’s deliverable.

---

## 7. Live-verification handoff (NEEDS-LIVE PO steps 4–5)

Build **`20260716b2`** in host + panel-B iframe console (`window.__TALARIA_CHART_BUILD_ID`).

1. Open multichart 2-up (host A + panel B).
2. Panel B: draw rectangle → single-click select → **Delete** → shape gone, no ghost handles.
3. Repeat on host A.
4. Console: `window.__TALARIA_DISABLE_MULTICHART_PANEL_KEYBOARD_V1 = true` → Delete on panel B no longer removes drawing (witness RED).

Parity row: **H-R06**.

---

## 8. Status

**DONE (proven)** — built `dist-v9` **20260716b2**; H-R06 **10/10 PASS** honest actuation; switch-OFF **10/10 FAIL-REAL-BUG** A/B; `gate:react` all rows green (registry stale exit only).

**Lane 4 follow-up:** remove H-R06 from `known-failing.json`; confirm `focusReactPanelSoft` in `deleteSelectedViaKeyboard` is canonical.
