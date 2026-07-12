# T1 step 4 lifecycle migration report

## Scope

Implemented T1 migration steps 4-7 for RC-1 selection lifecycle ownership. No build/cache bump was run.

Step 6 is kept separable with its own kill switch, `window.__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE_V2`. I did not create a git commit; the slice is isolated in code and reportable/revertible separately.

## Migrated Steps

### Step 4 - object tree subscribes to lifecycle store

- `chart v 1.4/chart/modules/object-tree.js:15-16` subscribes after init.
- `chart v 1.4/chart/modules/object-tree.js:32-39` refreshes on `toolSelected`, `toolDeselected`, `toolDeleted`, and `toolHidden`.
- `chart v 1.4/chart/modules/object-tree.js:300-304` reads selection from `ToolLifecycleStore.getSelectedDrawing()` before falling back to legacy manager state.
- `chart v 1.4/chart/modules/object-tree.js:479-486` emits `toolSelected` instead of independently calling `selectDrawing` when the store is enabled.

### Step 5 - manager selection/edit flags move into store state

- `chart v 1.4/chart/modules/tool-lifecycle-store.js:13-18` adds central selected/hover/edit state.
- `chart v 1.4/chart/modules/tool-lifecycle-store.js:52-66` exposes snapshots and selected-drawing readers.
- `chart v 1.4/chart/modules/tool-lifecycle-store.js:69-99` reduces `toolSelected`, `toolDeselected`, `toolDeleted`, `toolHovered`, `toolHoverCleared`, `toolEditStarted`, and `toolEditEnded`.
- `chart v 1.4/chart/modules/drawing-tools-manager.js:3490-3497` makes `toolSelected` request cross-panel cleanup before selecting locally.
- `chart v 1.4/chart/modules/drawing-tools-manager.js:3552-3565` adds deselect/edit subscribers.
- `chart v 1.4/chart/modules/drawing-tools-manager.js:3596-3600` emits `toolEditStarted` when settings surface binds.
- `chart v 1.4/chart/modules/drawing-tools-manager.js:9869-9871` emits `toolDeselected` for real deselects, while preserving internal selection-transition clears.

### Step 6 - legacy `Chart.selectedDrawing` / `Chart.drawings` index stack retired behind separate switch

Kill switch: `window.__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE_V2`.

Retired/gated legacy readers:

- `chart v 1.4/chart/chart.js:18949-18965` routes Escape/Delete through `DrawingToolsManager` when retirement is enabled; old `this.selectedDrawing` index delete path remains only behind the kill switch.
- `chart v 1.4/chart/chart.js:32587-32589` prevents chart-level SVG mousedown from claiming selection ownership when the manager exists.
- `chart v 1.4/chart/chart.js:32813-32815` prevents chart-level SVG click selection from claiming ownership when the manager exists.
- `chart v 1.4/chart/chart.js:33783-33787` gates rendered legacy drawing click selection.
- `chart v 1.4/chart/chart.js:33812-33816` gates rendered legacy drawing context-menu selection.

### Step 7 - per-tool chrome through lifecycle subscriber path

Per-tool geometry was not rewritten. Tool chrome remains in the existing `BaseDrawing.select()` / `deselect()` implementations, but selection ownership now enters through `toolSelected` and cross-panel cleanup subscribers before per-tool chrome is applied. This keeps geometry local to each tool class while centralizing selected/deselected/edit/delete ownership.

## Multichart Cleanup Fix

The H-S34/H-S35 failure path exposed that production React `MultichartGrid` had `clearDrawingUiOnOtherPanels`, but the lightweight production harness manager did not. Added equivalent support:

- `chart v 1.4/chart/multichart-prod/multichart-manager.js:755-781` adds `deselectDrawingsOnNonFocusedPanels()` and `clearDrawingUiOnOtherPanels()`.
- `chart v 1.4/chart/multichart-prod/multichart-manager.js:983-997` handles `multichart-clear-drawing-ui` and `multichart-drawing-selected`.

This lets lifecycle selection on panel B clear panel A selection, toolbar, settings, and axis highlights through the same ownership contract.

## RED / GREEN / Kill-Switch Evidence

RED-first baseline:

```text
npm run test -- --only=H-S34,H-S35 --runs=1
FINAL H-S34 FAIL-REAL-BUG
FINAL H-S35 FAIL-REAL-BUG
```

GREEN after migration:

```text
npm run test -- --only=H-S34,H-S35 --runs=1
FINAL H-S34 PASS
FINAL H-S35 PASS
```

Lifecycle kill-switch RED-again:

```text
npm run test -- --only=H-S34,H-S35 --runs=1 --bugswitch=__TALARIA_DISABLE_TOOL_LIFECYCLE_V2
FINAL H-S34 FAIL-REAL-BUG
FINAL H-S35 FAIL-REAL-BUG
```

Step-6 kill-switch smoke:

```text
npm run test -- --only=H-S34,H-S35 --runs=1 --bugswitch=__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE_V2
FINAL H-S34 PASS
FINAL H-S35 PASS
```

H-S34/H-S35 do not depend on step 6; they cover cross-panel lifecycle ownership. The separate step-6 switch restores chart-level legacy selection readers without regressing this pair.

## Full Gate

Command:

```text
npm run gate
```

Result:

```text
GATE H-S32 PASS
GATE H-S33 PASS
GATE H-S34 PASS
GATE H-S35 PASS
Known failing baseline: H-S38, H-S39, H-S40, H-S41, H-S42
Regressions (not in baseline but failed): (none)
[gate] PASS: no new regressions; 5 known-failing tracked.
```

H-S34/H-S35 were removed from `known-failing.json` in both trees.

## State Matrix

| Mode | Select | Hover | Edit/settings | Delete |
|---|---|---|---|---|
| Single chart | `toolSelected` reduces store selected state, manager applies chrome | Store has `toolHovered` / `toolHoverCleared` state for shared ownership | `toolEditStarted` owns active settings drawing | `toolDeleted` clears selected/edit/hover state and subscribers remove chrome |
| Multichart | `toolSelected` requests peer cleanup first, then local select | Same store state; no mirror-frame policy touched | Settings binding emits edit state, peer cleanup closes stale surfaces | `toolDeleted` clears local chrome and notifies parent selection cleared |
| Selection replace | Transitional manager `deselectAll({ forSelectionChange: true })` does not erase the store selection | Previous hover can be cleared independently | Edit state replaced by next `toolEditStarted` | Deleted drawing is filtered out of selected/edit/hover state |
| Legacy chart path | Retired by default behind `__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE_V2` | No new chart-level hover owner | Legacy context-menu selection gated | Delete routes through `DrawingToolsManager` unless step-6 switch restores legacy |

## Registry Disposition

- `TAL-00157#10` (`selection-menu-desync`): covered by H-S35; fixed for stale quick menu after cross-panel selection replacement.
- `TAL-01405#1` (`selection-menu-desync`): covered by H-S34; fixed for previous-panel selected chrome after selecting/drawing on another panel.
- `TAL-01499#1` (`quick-menu-defect`): covered by H-S35; fixed for panel-B quick menu being sole live owner after panel-B placement.

Family disposition: selection-desync (43) and stale-quick-menu (24) are GREEN for the accepted harness pair H-S34/H-S35.

## Checks

Syntax:

```text
node --check chart v 1.4/chart/modules/tool-lifecycle-store.js
node --check chart v 1.4/chart/modules/drawing-tools-manager.js
node --check chart v 1.4/chart/modules/object-tree.js
node --check chart v 1.4/chart/multichart-prod/multichart-manager.js
node --check chart v 1.4/chart/chart.js
node --check homepage/public/chart/... mirrored files
```

Result: all clean.

Cursor lints: no linter errors found.

## SHA256 Mirror Evidence

| File | SHA256 | Match |
|---|---|---|
| `chart/modules/tool-lifecycle-store.js` | `aceac26a51a69593393e60f91fad0fbec7f82d2effd1e58643be4094e05b7ee1` | yes |
| `chart/modules/drawing-tools-manager.js` | `9f1d9d224f2a3c2b84a9387cae3e272d2736f56f087c7b0dc522767edf86d3ee` | yes |
| `chart/modules/object-tree.js` | `e8e4e384dd14afed0fe0b68d242ed6e069448aade48fe79d470bb957916be4ce` | yes |
| `chart/multichart-prod/multichart-manager.js` | `7fbe796f346260cc4192c550c5f9cd77bcbce114e47d3f0674c3f96c83826101` | yes |
| `chart/chart.js` | `b4fa49423be1035f717638f46423caed27173805fdffb31907c21e8ab9572c2c` | yes |
| `chart/multichart-prod/harness/known-failing.json` | `147a3fddfd1b8e2bce9e6cefedc714926bb8d2ef2e9a37d9dbb4e95aa6788c80` | yes |

## Build ID

No build/cache bump was run. The checked-out `chart.js` build string was not changed by this task and remains byte-identical across both trees.

