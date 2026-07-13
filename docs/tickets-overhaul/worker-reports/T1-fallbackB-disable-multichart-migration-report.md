# T1 Fallback B - Disable Multichart Migration By Default

## Summary

Implemented D-006 fallback (b): T1 multichart-panel migration defaults OFF, while single-chart keeps the migration ON.

No T1 migration code was deleted. The fallback is predicate-only and reversible. No build id bump was performed.

Note: this report lists fallback-specific edits. The working tree already contained other local changes before this task; those were not reverted or folded into this rollback.

## Default-Flip Diff

### Tool lifecycle V2

Files:

- `chart v 1.4/chart/modules/tool-lifecycle-store.js`
- `homepage/public/chart/modules/tool-lifecycle-store.js`
- `chart v 1.4/chart/modules/drawing-tools-manager.js`
- `homepage/public/chart/modules/drawing-tools-manager.js`

Fallback behavior:

- Single chart: `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2` unset means lifecycle V2 is ON, unchanged.
- Multichart iframe embed: `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2` unset means lifecycle V2 is OFF.
- Multichart iframe embed re-enable: set `window.__TALARIA_DISABLE_TOOL_LIFECYCLE_V2 = false` before boot.
- Explicit disable everywhere: set `window.__TALARIA_DISABLE_TOOL_LIFECYCLE_V2 = true`.

Implementation points:

- `ToolLifecycleStore.isEnabled()` now checks iframe/embed context and requires explicit `false` to re-enable lifecycle V2 inside iframe embeds.
- `DrawingToolsManager._isToolLifecycleV2Enabled()` mirrors the same policy so lifecycle-only selection/settings hooks do not run in panels by default.

### Legacy selection retirement V2

Files:

- `chart v 1.4/chart/chart.js`
- `homepage/public/chart/chart.js`

Fallback behavior:

- Single chart: `__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE_V2` unset means legacy-selection retirement is ON, unchanged.
- Multichart iframe embed: `__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE_V2` unset means legacy-selection retirement is OFF, restoring pre-migration legacy selection paths.
- Multichart iframe embed re-enable: set `window.__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE_V2 = false` before boot.
- Explicit disable everywhere: set `window.__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE_V2 = true`.

Implementation points:

- Added `Chart._isLegacySelectionRetireV2Enabled()`.
- Replaced direct `window.__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE_V2` checks in keyboard, SVG mousedown/click, and drawing element click/contextmenu paths with the central predicate.

### React multichart ownership V2

File:

- `chart v 1.4/talaria-design/src/MultichartGrid.jsx`

Fallback behavior:

- Multichart shell: `__TALARIA_DISABLE_MULTICHART_OWNERSHIP_V2` unset means ownership V2 is OFF.
- Future re-enable: set `window.__TALARIA_DISABLE_MULTICHART_OWNERSHIP_V2 = false`.
- Explicit disable remains OFF: set `window.__TALARIA_DISABLE_MULTICHART_OWNERSHIP_V2 = true`.

Implementation point:

- `multichartOwnershipV2Enabled()` now returns true only for explicit `false`; unset defaults to false.

## State Matrix

| Surface | No flags after fallback | Explicit re-enable |
|---|---|---|
| Single chart | ToolLifecycleStore ON; legacy-selection retirement ON; single-chart T1 gains preserved. | Same as default unless explicitly disabled. |
| Multichart iframe panel | ToolLifecycleStore OFF by default; legacy-selection retirement OFF by default; pre-T1 panel selection/settings behavior restored. | Set `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2 = false` and/or `__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE_V2 = false` before panel boot. |
| React multichart shell | Ownership V2 OFF by default; broad pre-step-7 cleanup/settings behavior restored. | Set `__TALARIA_DISABLE_MULTICHART_OWNERSHIP_V2 = false` before React shell boot. |

## Harness Impact

Focused migration gate run:

```text
npm run test -- --only=H-S32,H-S33,H-S34,H-S35,H-S43,H-S44 --runs=1
FINAL H-S32 PASS
FINAL H-S33 PASS
FINAL H-S34 FAIL-REAL-BUG
FINAL H-S35 FAIL-REAL-BUG
FINAL H-S43 PASS
FINAL H-S44 FAIL-REAL-BUG
```

Scenarios to reclassify during the rollback window:

- `H-S34` asserts migrated cross-panel single-selection ownership.
- `H-S35` asserts migrated single quick-menu owner across panels.
- `H-S44` asserts migrated panel settings/Esc parent-close flow.

Unaffected rollback subset:

```text
npm run test -- --only=H-S32,H-S33,H-S36,H-S37,H-S43 --runs=1
FINAL H-S32 PASS
FINAL H-S33 PASS
FINAL H-S36 PASS
FINAL H-S37 PASS
FINAL H-S43 PASS
```

## Syntax / Lints

```text
node --check "chart v 1.4/chart/chart.js"
node --check "homepage/public/chart/chart.js"
node --check "chart v 1.4/chart/modules/drawing-tools-manager.js"
node --check "homepage/public/chart/modules/drawing-tools-manager.js"
node --check "chart v 1.4/chart/modules/tool-lifecycle-store.js"
node --check "homepage/public/chart/modules/tool-lifecycle-store.js"
ReadLints: no linter errors for touched files
```

## SHA256

```text
de742bcad213dbce9663e918e0f9b4b2e3a79276ad106adf0360805d9a250799  chart v 1.4/chart/chart.js
de742bcad213dbce9663e918e0f9b4b2e3a79276ad106adf0360805d9a250799  homepage/public/chart/chart.js
194f8989e35f39858fb38801db9fbfdcd2241a70ca2ed161c37855193527d242  chart v 1.4/chart/modules/drawing-tools-manager.js
194f8989e35f39858fb38801db9fbfdcd2241a70ca2ed161c37855193527d242  homepage/public/chart/modules/drawing-tools-manager.js
90df0c9ba929b5862efa30001cc2d8e335b365a268bcb2a377f7d0bc6ae736d5  chart v 1.4/chart/modules/tool-lifecycle-store.js
90df0c9ba929b5862efa30001cc2d8e335b365a268bcb2a377f7d0bc6ae736d5  homepage/public/chart/modules/tool-lifecycle-store.js
340dacd05e7c8be12239b2470340d7265aa700fadff553e31424375d38dc4413  chart v 1.4/talaria-design/src/MultichartGrid.jsx
```

## Build ID

No build id bump was performed. No build-id/cache files were intentionally changed for this fallback; Manager coordinates the single deploy bump.
