# T1 step 5 multichart select/settings regression report

## Scope

Fixed the step-4 regression where multichart panel drawing settings could be dismissed by the source panel's own lifecycle cleanup, and Esc did not explicitly close the parent settings surface. No build/cache bump was run.

Kill switch: reused `window.__TALARIA_DISABLE_TOOL_LIFECYCLE_V2`.

## Confirmed Mechanism

Symptom A: `toolSelected` cleanup used `clearDrawingUiOnOtherPanels` without preserving the selecting panel's V9/settings surface.

- `chart v 1.4/chart/modules/drawing-tools-manager.js:3513-3515` now calls `_requestMultichartClearDrawingUiOnOtherPanels({ skipV9Dismiss: true })`.
- `chart v 1.4/chart/modules/drawing-tools-manager.js:9787-9789` applies the same option for direct `selectDrawing`.
- `chart v 1.4/chart/chart.js:2328-2331` forwards `skipV9Dismiss` in iframe `multichart-clear-drawing-ui` messages.
- `chart v 1.4/talaria-design/src/MultichartGrid.jsx:5832-5838` passes that flag into React `clearDrawingUiOnOtherPanels`.
- `chart v 1.4/chart/multichart-prod/multichart-manager.js:769-779` mirrors the option in the lightweight harness manager.

Symptom B: `toolDeselected` only refreshed object tree and did not close settings.

- `chart v 1.4/chart/modules/drawing-tools-manager.js:189-204` adds `requestMultichartParentCloseDrawingSettings()`.
- `chart v 1.4/chart/modules/drawing-tools-manager.js:3570-3584` hides local settings/context/toolbar and posts `multichart-close-drawing-settings` for iframe panels.

Lane 2 Row-2 code was preserved: `_suppressNextIframeCtrlSelectToggle` / `isMultichartIframeEmbed` logic was not rewritten.

## Harness Coverage

Added H-S44:

- `chart v 1.4/chart/multichart-prod/harness/interactive-helpers.mjs:54-92` adds parent settings open/close probe.
- `chart v 1.4/chart/multichart-prod/harness/interactive-helpers.mjs:200-213` dispatches Esc into the target panel window.
- `chart v 1.4/chart/multichart-prod/harness/scenarios.mjs:5429-5483` covers panel B single-click select, settings open request, and Esc close.
- `chart v 1.4/chart/multichart-prod/harness/scenarios.mjs:5528-5529` registers H-S44.
- `known-failing.json` keeps H-S44 in `expectedTests`; it is not known-failing after the fix.

## Evidence

RED after adding H-S44, before product fix:

```text
npm run test -- --only=H-S44 --runs=1
FINAL H-S44 FAIL-REAL-BUG
Failure: Esc closes panel-B settings/quick-settings surfaces
parentProbe={"open":true,"closed":false,... "multichart-drawing-deselected"}
```

GREEN after fix:

```text
npm run test -- --only=H-S44 --runs=1
FINAL H-S44 PASS
parentProbe messages include:
multichart-open-drawing-settings
multichart-close-drawing-settings
multichart-drawing-deselected
```

Kill-switch RED:

```text
npm run test -- --only=H-S44 --runs=1 --bugswitch=__TALARIA_DISABLE_TOOL_LIFECYCLE_V2
FINAL H-S44 FAIL-REAL-BUG
```

Focused regression set:

```text
npm run test -- --only=H-S32,H-S33,H-S34,H-S35,H-S36,H-S37,H-S43,H-S44 --runs=1
FINAL H-S32 PASS
FINAL H-S33 PASS
FINAL H-S34 PASS
FINAL H-S35 PASS
FINAL H-S36 PASS
FINAL H-S37 PASS
FINAL H-S43 PASS
FINAL H-S44 PASS
```

Full gate:

```text
npm run gate
Expected tests include H-S44
GATE H-S32 PASS
GATE H-S33 PASS
GATE H-S34 PASS
GATE H-S35 PASS
GATE H-S36 PASS
GATE H-S37 PASS
GATE H-S43 PASS
GATE H-S44 PASS
Known failing baseline: H-S38, H-S39, H-S40, H-S41, H-S42
Regressions (not in baseline but failed): (none)
[gate] PASS: no new regressions; 5 known-failing tracked.
```

## State Matrix

| Cell | Select | Settings open | Esc close |
|---|---|---|---|
| Single chart | Unchanged; H-S32/H-S33 pass | Unchanged; H-S33 opens settings | Unchanged by multichart close post |
| Multichart panel | Fixed: source panel keeps selected/toolbar owner while peers clear | Fixed: selection cleanup uses `skipV9Dismiss`, settings request reaches parent | Fixed: `toolDeselected` hides local surfaces and posts parent close |
| H-S34/H-S35 cross-panel | Preserved: peer selection/quick-menu cleanup still passes | No settings path touched | No regression |
| H-S43 Ctrl-select | Preserved: Lane 2 double-toggle guard still passes | Not changed | Not changed |

## Checks

Syntax:

```text
node --check chart.js
node --check drawing-tools-manager.js
node --check multichart-manager.js
node --check harness/interactive-helpers.mjs
node --check harness/scenarios.mjs
```

Result: clean in both engine trees. `MultichartGrid.jsx` is not accepted by `node --check` because Node reports unknown `.jsx`; Cursor lints were clean.

Cursor lints: no linter errors found.

## SHA256

| File | SHA256 | Match |
|---|---|---|
| `chart/chart.js` | `ea3eca2b48214bc8650e3a0b2bcb0f5d9b241ee803e3be58386f02000a3b6178` | yes |
| `chart/modules/drawing-tools-manager.js` | `5907bada279598f0e3bebc62bbde69faa7a6c8c44e63f0e1d1ad34216fd86d58` | yes |
| `chart/multichart-prod/multichart-manager.js` | `421f074f14aea0a6798c839e133e6c5f237df9e192a4e331f72e7fa1daa50863` | yes |
| `chart/multichart-prod/harness/interactive-helpers.mjs` | `ca92b7b2b67970f366e2d2f7b0a96591e25b19fb77fedc020986ada103cd9f8c` | yes |
| `chart/multichart-prod/harness/scenarios.mjs` | `e3dbe5f175a3832261dbf18277adf229eb236a16836973e05a7ef5de95719736` | yes |
| `chart/multichart-prod/harness/known-failing.json` | `f3a0835d856b48396ecdbae4ed01be7dcd60662882cfb29c5c5706ed88c2c0da` | yes |
| `chart v 1.4/talaria-design/src/MultichartGrid.jsx` | `d5e8f42a06f68cc62ad50eda0190bf56c544aa019aa9663064ee2ac6a44f8c41` | n/a |

## Build ID

No build/cache bump was run. `CHART_ENGINE_BUILD` was not changed by this task.

