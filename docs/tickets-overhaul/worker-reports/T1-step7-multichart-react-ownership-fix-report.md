# T1 step 7 multichart React ownership fix report

## Scope

Implemented the D-006 recovery as a React-scoped re-land for the T1 step 4/5 multichart selection/settings behavior. No build/cache bump was run.

New kill switch: `window.__TALARIA_DISABLE_MULTICHART_OWNERSHIP_V2`.

Default behavior: switch unset = fix active. Switch set truthy = React ownership fix disabled and the touched React paths fall back to the pre-step-7 / step-5 behavior.

Runtime diff is limited to:

- `chart v 1.4/talaria-design/src/MultichartGrid.jsx`

No engine runtime files were changed in this step.

## Part 1 - gating audit

| file:line | what the edit does | which kill-switch gates it | revertible by that switch? |
|---|---|---|---|
| `chart/modules/tool-lifecycle-store.js:13-99` | Adds lifecycle store selected/hover/edit state and reducers from T1 step 4. | `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2` for callers/emits. | Y for behavior; store code remains loaded. |
| `chart/modules/drawing-tools-manager.js:3508-3523` | `toolSelected` subscriber requests multichart peer cleanup then selects locally. | `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2` via `_emitToolLifecycle()` / subscriber entry. | Y. |
| `chart/modules/drawing-tools-manager.js:3570-3588` | `toolDeselected` hides settings/context/toolbar and posts parent close for iframe panels. | `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2` via lifecycle event emission. | Y. |
| `chart/modules/drawing-tools-manager.js:9787-9789` | Direct `selectDrawing()` requests parent clear with `skipV9Dismiss`. | Not directly gated; invoked by active manager selection path. | N before step 7; remains engine-side and not changed here. |
| `chart/chart.js:2327-2332` | Forwards `skipV9Dismiss` on `multichart-clear-drawing-ui` postMessage. | Not directly gated; option only matters if React honors it. | N before step 7. |
| `chart/modules/object-tree.js:15-486` | Object tree subscribes to lifecycle store and emits `toolSelected`. | `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2` around emit path / store read fallback. | Y for behavior. |
| `chart/chart.js:18949-33816` | Retires legacy `Chart.selectedDrawing` selection/delete paths. | `__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE_V2`. | Y. |
| `chart/multichart-prod/multichart-manager.js:755-997` | Harness manager gains peer cleanup / selection message support. | None; harness-only acceptance surface. | N, but not production React. |
| `chart v 1.4/talaria-design/src/MultichartGrid.jsx:4754-4768` | React `clearDrawingUiOnOtherPanels()` honors `skipV9Dismiss` and controls source-vs-peer settings close. | Was ungated before step 7; now gated by `__TALARIA_DISABLE_MULTICHART_OWNERSHIP_V2`. | Y after step 7. |
| `chart v 1.4/talaria-design/src/MultichartGrid.jsx:4860-4901` | React `openDrawingSettingsForPanel()` no longer closes the source settings surface immediately after opening. | Was ungated before step 7; now gated by `__TALARIA_DISABLE_MULTICHART_OWNERSHIP_V2`. | Y after step 7. |
| `chart v 1.4/talaria-design/src/MultichartGrid.jsx:5822-5838` | React iframe message handlers route close/clear requests. | Was ungated before step 7; now close semantics and skip handling are gated by `__TALARIA_DISABLE_MULTICHART_OWNERSHIP_V2`. | Y after step 7. |
| `chart v 1.4/talaria-design/src/MultichartGrid.jsx:5849-5868` | React parent arms selection guard and V9 selected-drawing event for iframe selections. | Was ungated before step 7; focus-frame recompute addition is gated by `__TALARIA_DISABLE_MULTICHART_OWNERSHIP_V2`. | Y for the new step-7 behavior. |

I13 ledger: the production React edits from T1 steps 4/5 were the non-compliant pieces because they lived outside `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2`. Step 7 re-lands the React behavior behind `__TALARIA_DISABLE_MULTICHART_OWNERSHIP_V2`.

## Part 2 - A/B revert result

Decisive code-level A/B:

- Switch OFF path (`window.__TALARIA_DISABLE_MULTICHART_OWNERSHIP_V2 = true`) deliberately falls back to the pre-step-7 behavior:
  - `clearDrawingUiOnOtherPanels()` ignores `skipV9Dismiss` and closes settings on all panels.
  - `openDrawingSettingsForPanel()` closes settings on all panels after opening.
  - `multichart-close-drawing-settings` routes through the old broad `clearDrawingUiOnOtherPanels()` path.
- Switch ON path (default) preserves source-panel settings/chrome on select/open and closes source settings only on explicit close.

Real-product local execution status:

- Vite live React app loaded and compiled at `http://127.0.0.1:5173/` and `http://127.0.0.1:5174/`.
- Full local real-product chart initialization was blocked because Vite dev does not route `/chart/vendor/d3.min.js`; chart init repeatedly reported `d3 load failed`, leaving `window.chart=false`.
- I did not claim a completed live React parity pass from this local environment. The report keeps the required PO/manual checklist explicit below.

Chosen path: **3A - re-land properly gated**. The code-level A/B and D-006 audit show the React edits were not switch-covered; this patch re-lands them behind the React switch instead of redesigning unrelated ownership.

## Fix diff

`MultichartGrid.jsx` changes:

- Adds `multichartOwnershipV2Enabled()` for `window.__TALARIA_DISABLE_MULTICHART_OWNERSHIP_V2`.
- Restores switch-revertible behavior for React cleanup:
  - switch disabled: close/dismiss all panels as before;
  - switch enabled: preserve the source panel during select/open cleanup.
- Splits settings close ownership:
  - `closeDrawingSettingsOnOtherPanels(sourceId)` closes peer settings only when the React switch is active;
  - `closeDrawingSettingsForPanel(sourceId)` handles explicit Esc/deselect close for the source panel.
- Prevents `openDrawingSettingsForPanel()` from immediately undoing its own V9 open by calling all-panel close on the source.
- Refocuses/recomputes the React focus frame when an iframe posts `multichart-drawing-selected`, so panel selection chrome has a parent-owned focus update in the same interaction.

R1/R2/R3 mapping:

| Regression | Step-7 change |
|---|---|
| R1 Ctrl-select broken | Parent cleanup no longer closes source UI on selection cleanup under the React switch; iframe selection also refreshes parent focus state without touching Lane 2 `_suppressNextIframeCtrlSelectToggle`. |
| R2 no blue selection/preview border | `multichart-drawing-selected` focuses the source panel and recomputes the React focus frame under the React switch. |
| R3 settings flash | V9 open now closes peer settings only; source settings are not immediately closed by `closeDrawingSettingsOnAllPanels()` in the same interaction. |

## Parity checklist

Local status against `docs/tickets-overhaul/MULTICHART-PARITY-CHECKLIST.md`:

| # | Check | Result |
|---|---|---|
| Preconditions | Live React multichart open; build id confirmed on host and frames; two panels with drawings. | BLOCKED locally: Vite loaded build `20260712b5`, but chart init failed before multichart because `/chart/vendor/d3.min.js` was not routed by dev server. |
| 1 | Single-click select in panel. | Requires PO/live product run. |
| 2 | Blue selection/preview border visible. | Requires PO/live product run. |
| 3 | Ctrl-click second tool keeps both selected exactly once. | Requires PO/live product run. |
| 4 | Settings opens and stays open. | Requires PO/live product run. |
| 5 | Esc deselects and closes settings. | Requires PO/live product run. |
| 6 | Delete leaves no ghost artifact. | Requires PO/live product run. |
| 7 | Peer isolation. | Requires PO/live product run. |
| 8 | Single-chart checks 1-6 unchanged. | Harness H-S32/H-S33 pass; live PO run still required. |
| 9 | Fix switch OFF reverts fixed behaviors. | Code-level switch path verified; live PO run still required. |

Acceptance note: per D-006, this should not be accepted on harness evidence alone. The Manager/PO should run the checklist on the live build after the coordinated bump.

## Harness evidence

Focused regression set:

```text
npm run test -- --only=H-S32,H-S33,H-S34,H-S35,H-S43,H-S44 --runs=1
FINAL H-S32 PASS
FINAL H-S33 PASS
FINAL H-S34 PASS
FINAL H-S35 PASS
FINAL H-S43 PASS
FINAL H-S44 PASS
```

This confirms the existing engine/harness gate remains intact. It is not claimed as the production React acceptance proof.

## State matrix

| Cell | Expected behavior after step 7 |
|---|---|
| Single chart | Unchanged; no `MultichartGrid` ownership path is mounted in layout 1. |
| Multichart panel, switch ON | Source panel keeps selection/settings during select/open; peers are cleaned; explicit Esc/deselect closes source settings. |
| Multichart panel, switch OFF | React ownership fix disabled; touched paths fall back to broad all-panel close behavior for A/B/revert. |
| H-S34/H-S35 cross-panel cleanup | Preserved; peer deselect/cleanup still runs. |
| H-S43 Ctrl-select | Preserved; Lane 2 `_suppressNextIframeCtrlSelectToggle` / `isMultichartIframeEmbed` code untouched. |
| H-S44 settings/Esc harness | Preserved; harness remains green. |

## Checks

Syntax:

```text
node --check chart v 1.4/chart/chart.js
node --check chart v 1.4/chart/modules/drawing-tools-manager.js
node --check chart v 1.4/chart/multichart-prod/multichart-manager.js
node --check homepage/public/chart/chart.js
node --check homepage/public/chart/modules/drawing-tools-manager.js
node --check homepage/public/chart/multichart-prod/multichart-manager.js
```

Result: clean.

React lint: `ReadLints` on `chart v 1.4/talaria-design/src/MultichartGrid.jsx` returned no linter errors.

Diff whitespace:

```text
git diff --check -- chart v 1.4/talaria-design/src/MultichartGrid.jsx
```

Result: clean aside from the existing LF-to-CRLF Git warning.

## SHA256

| File | SHA256 | Match |
|---|---|---|
| `chart/chart.js` | `ea3eca2b48214bc8650e3a0b2bcb0f5d9b241ee803e3be58386f02000a3b6178` | yes |
| `chart/modules/drawing-tools-manager.js` | `5907bada279598f0e3bebc62bbde69faa7a6c8c44e63f0e1d1ad34216fd86d58` | yes |
| `chart/modules/tool-lifecycle-store.js` | `aceac26a51a69593393e60f91fad0fbec7f82d2effd1e58643be4094e05b7ee1` | yes |
| `chart/multichart-prod/multichart-manager.js` | `421f074f14aea0a6798c839e133e6c5f237df9e192a4e331f72e7fa1daa50863` | yes |
| `chart/multichart-prod/harness/scenarios.mjs` | `e3dbe5f175a3832261dbf18277adf229eb236a16836973e05a7ef5de95719736` | yes |
| `chart/multichart-prod/harness/interactive-helpers.mjs` | `ca92b7b2b67970f366e2d2f7b0a96591e25b19fb77fedc020986ada103cd9f8c` | yes |
| `chart/multichart-prod/harness/known-failing.json` | `f3a0835d856b48396ecdbae4ed01be7dcd60662882cfb29c5c5706ed88c2c0da` | yes |
| `chart v 1.4/talaria-design/src/MultichartGrid.jsx` | `3271f8c7addb8de805e3e3996ac033140c7b04c49d1b13ed6e64956096960bfe` | n/a |

## Build ID

No build/cache bump was run. Build-id coordination remains with the Manager.
