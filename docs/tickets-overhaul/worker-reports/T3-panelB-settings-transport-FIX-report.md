# T3 — panel-B settings-open transport FIX (D-026)

## 1. Task + RC

- **Task:** `T3-panelB-settings-transport-FIX-lane1-D026` — gated 3-hunk transport fix per pinpoint report + ESC-023/D-026 binding.
- **RC:** Panel-B parent Style mounts then flash-closes: duplicate dbl-click open cycles + spurious iframe `toolDeselected` → `requestMultichartParentCloseDrawingSettings` while guard active.

## 2. Switch (I3)

`window.__TALARIA_DISABLE_MULTICHART_PANELB_SETTINGS_TRANSPORT_V1` — unset = fix **ON**; set = full revert.

A-independence sub-flag (harness only, not main switch): `window.__TALARIA_DISABLE_MULTICHART_PANELB_SETTINGS_TRANSPORT_A_V1` via `--panelb-settings-transport-a-off`.

## 3. Hunks — binding classification honored

| Hunk | Load-bearing? | Trees | What |
|------|---------------|-------|------|
| **B** | **CAUSAL CURE** | `MultichartGrid.jsx`, `TalariaV8bLive.jsx`, `drawing-tools-manager.js` (I8) | Honor guard on `multichart-drawing-deselected`; swallow spurious `multichart-dismiss` while Style visible (non-intentional); suppress `requestMultichartParentCloseDrawingSettings` while parent open-guard active; Esc user-close bypass via `__v9UserCloseDrawingSettingsRequest`. |
| **C** | Dedupe | `MultichartGrid.jsx` | Coalesce duplicate `openDrawingSettingsForPanel` same source+drawingId within ~120ms when guard live **or** Style already mounted. |
| **A** | Defense-in-depth only | `TalariaV8bLive.jsx` | `v9DismissAllDrawingSettingsImmediate` preserves guard/source when in-flight panel id / source / guard still active (`multichartPanelBSettingsTransportADepthEnabled`). |

### Hunk B detail (causal)

Pinpoint trace showed `v9Open` returned `hasStyle=true` then ~75ms later **intentional** `multichart-close-drawing-settings` from iframe `store.on('toolDeselected')` → `requestMultichartParentCloseDrawingSettings`. Suppressing that close while `__v9DrawingSettingsOpenGuardUntil` is active fixes the flash-close without blocking Esc (Esc arms `__v9UserCloseDrawingSettingsRequest` first).

### Hunk C dedupe note

Second duplicate-actuation instance on this surface after H-R03 ctrl-select double-fire. Iframe dbl-click fires two `editDrawing` paths (~80ms apart); coalesce skips the second cycle when the first is in-flight or already painted.

## 4. Build

- **Build id:** `20260717b03`
- **Dist:** `chart v 1.4/chart/dist-v9` + `homepage/public/chart/dist-v9` (synced)
- **I8 mirror:** `homepage/public/chart/modules/drawing-tools-manager.js`

## 5. Proof legs (isolated, `REACT_PARITY_ISOLATE_SESSION=1`, honest `hasStyleSection`)

| Leg | Config | Result | Evidence |
|-----|--------|--------|----------|
| **1 ON — H-R04** | default (fix ON), x10 | **10/10 PASS** | `d026-hr04-on-x10-b03-r2.txt` |
| **1 ON — H-R05** | default, x10 | **10/10 PASS** | `d026-hr05-on-x10-b03-r2.txt` (console) |
| **2 OFF** | `--panelb-settings-transport-off`, H-R04+H-R05 x10 | **Honest RED** (mostly FAIL; 1/10 H-R04 pass = intermittent race without fix) | console run 2026-07-17 |
| **3 STRESS** | H-R04/H-R05 include `focusReactPanelSoft` + dom-ready (default scenarios) | **Covered by leg 1** (same harness rows) | same as leg 1 |
| **4 A-independence** | `--panelb-settings-transport-a-off`, x10 | **H-R04 10/10**, **H-R05 10/10** | A-off H-R04 r3 console; A-off H-R05 first run |

Diagnostic: panel-B-only probe **10/10** after close-suppress fix (trace showed guard-active close was root cause).

## 6. I13 switch-OFF diff

With `__TALARIA_DISABLE_MULTICHART_PANELB_SETTINGS_TRANSPORT_V1=true`:

- **`MultichartGrid.jsx`:** coalesce block, deselect guard, grace arm, intentional dismiss detail — all gated behind `multichartPanelBSettingsTransportV1Enabled()`; prior path restored when switch set.
- **`TalariaV8bLive.jsx`:** Hunk A guard preservation and Hunk B dismiss swallow gated; `onDismissMcSettings` intentional path unchanged for non-transport code.
- **`drawing-tools-manager.js`:** close-suppress + user-close arm gated; `notifyMultichartParentSelectionCleared` suppress gated.

Leg 2 OFF confirms non-vacuous regression to intermittent fail.

## 7. Registry candidate (not fixed here)

Iframe `deselectAll({ fromCanvasBackground: true })` during dbl-click on a drawing (`drawing-tools-manager.js` ~10229) — latent hit-test defect; duplicate-actuation family with H-R03. Logged for follow-up.

## 8. Commit

**Commit:** `f8f07ebf` — file-scoped D-026 transport fix (build `20260717b03`).

### Files touched

- `chart v 1.4/talaria-design/src/MultichartGrid.jsx`
- `chart v 1.4/talaria-design/src/TalariaV8bLive.jsx`
- `chart v 1.4/chart/modules/drawing-tools-manager.js`
- `homepage/public/chart/modules/drawing-tools-manager.js` (I8)
- `chart v 1.4/chart/dist-v9/**`, `homepage/public/chart/dist-v9/**`
- `chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs` (OFF + A-off boot hooks)
- `chart v 1.4/chart/multichart-prod/harness/react-run.mjs` (CLI passthrough)
