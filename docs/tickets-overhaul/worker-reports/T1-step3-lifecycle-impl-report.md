# T1 Step 3 Lifecycle Implementation Report

## Scope

Implemented Director decision D-001, migration steps 1-3 only, behind `window.__TALARIA_DISABLE_TOOL_LIFECYCLE_V2`.

Steps 4-7 were not touched: no object-tree migration, no manager-flags-to-store collapse, no legacy `Chart.selectedDrawing` retirement, and no per-tool class migration. RC-2 and RC-3 were not touched.

## Store Module And API

Store path:

- `chart v 1.4/chart/modules/tool-lifecycle-store.js`
- `homepage/public/chart/modules/tool-lifecycle-store.js`

API:

- `new ToolLifecycleStore(drawingManager)`
- `store.on(eventName, handler)` returns an unsubscribe callback.
- `store.emit(eventName, detail)` dispatches to subscribers and returns `false` when the kill-switch is enabled.
- Kill-switch: `window.__TALARIA_DISABLE_TOOL_LIFECYCLE_V2`; unset means fix ON, set means legacy RED behavior.

Events used in this step:

- `toolSelected`
- `toolDeleted`

## Emitters And Subscribers

Store load order:

- `chart v 1.4/chart/dist-v9/index.html:1548`
- `chart v 1.4/chart/legacy-index.html:44033`
- `chart v 1.4/chart/multichart-prod/chart-embed.html:332`
- `chart v 1.4/chart/multichart-prod/harness/serve.mjs:436`
- Matching homepage files are SHA256-identical for the paired runtime/harness files listed below.

Manager construction and subscribers:

- `chart v 1.4/chart/modules/drawing-tools-manager.js:230` instantiates `ToolLifecycleStore`.
- `chart v 1.4/chart/modules/drawing-tools-manager.js:237` installs subscribers.
- `chart v 1.4/chart/modules/drawing-tools-manager.js:3479` subscribes to `toolSelected` and `toolDeleted`.

`toolSelected` emitters:

- `chart v 1.4/chart/modules/drawing-tools-manager.js:3556` selects existing drawing while a draw tool is armed, clearing the active tool through the store. This is the H-S32 first-click path.
- `chart v 1.4/chart/modules/drawing-tools-manager.js:6441` emits after `finalizeDrawing` placement complete.
- `chart v 1.4/chart/modules/drawing-tools-manager.js:6829` emits after `addDrawing` placement complete.

`toolDeleted` emitter:

- `chart v 1.4/chart/modules/drawing-tools-manager.js:10693` emits from `deleteDrawing` after the live drawing is removed from selection state.

Settings/context menu binding:

- `chart v 1.4/chart/modules/drawing-tools-manager.js:3568` binds delegated V9/multichart settings surfaces to the current live drawing only when the lifecycle store is enabled.
- `chart v 1.4/chart/modules/drawing-tools-manager.js:10093`, `10105`, and `10135` bind the grid/V9 settings paths before they return away from the legacy `settingsPanel.show()` path.

Subscriber coverage for steps 1-3:

- Step 1: toolbar hide/show and V9/multichart selection clear are driven by the `toolSelected` and `toolDeleted` subscribers.
- Step 2: axis highlights and `.drawings-labels` nodes are removed by the `toolDeleted` subscriber.
- Step 3: settings dialog and context menu are torn down by the `toolDeleted` subscriber.

## State Matrix

Changed cells are marked `changed`; unchanged cells keep legacy behavior.

| Environment | Action | Settings state | Result |
|---|---|---|---|
| Single chart | Placement complete | Settings closed | changed: `toolSelected` runs same-interaction subscriber chain |
| Single chart | Placement complete | Settings open | changed: selected drawing/toolbar/V9 sync run through store |
| Single chart | Select existing | Settings closed | changed for armed tool first-click; normal unarmed select unchanged |
| Single chart | Select existing | Settings open | changed for armed tool first-click; settings remains owned by selected drawing |
| Single chart | Delete via settings | Settings open | changed: `toolDeleted` clears settings, context menu, toolbar, V9 sync, labels |
| Single chart | Delete via settings | Settings closed | changed: `toolDeleted` clears stale subscribers if present |
| Single chart | Delete via keyboard | Settings open | changed: `deleteDrawing` emits `toolDeleted` and subscribers tear down ghosts |
| Single chart | Delete via keyboard | Settings closed | changed: labels/V9/toolbar subscribers still run |
| Multichart panel | Placement complete | Settings closed | changed: panel selection emits through store and syncs V9 parent |
| Multichart panel | Placement complete | Settings open | changed: delegated settings target is rebound to live drawing |
| Multichart panel | Select existing | Settings closed | changed for armed tool first-click; parent sync runs through store |
| Multichart panel | Select existing | Settings open | changed for armed tool first-click; delegated settings binding preserved |
| Multichart panel | Delete via settings | Settings open | changed: delegated settings callback resolves live drawing, then `toolDeleted` tears down ghosts |
| Multichart panel | Delete via settings | Settings closed | changed: store subscriber handles stale toolbar/V9/label refs |
| Multichart panel | Delete via keyboard | Settings open | changed: `deleteDrawing` emits `toolDeleted` and tears down delegated surface refs |
| Multichart panel | Delete via keyboard | Settings closed | changed: labels/V9/toolbar subscribers still run |

## Verification Evidence

RED baseline before implementation:

- `node run.mjs --only=H-S32,H-S33`
- H-S32: `FAIL-REAL-BUG`; first click left `selected=[]`, `toolbarVisible=false`.
- H-S33: `FAIL-REAL-BUG`; settings delete left ghost settings/current drawing.

GREEN after implementation:

- `node run.mjs --only=H-S32,H-S33 --runs=3`
- `FINAL H-S32 PASS`
- `FINAL H-S33 PASS`
- Runs: `PASS,PASS,PASS` for both.

Kill-switch RED proof:

- `node run.mjs --only=H-S32,H-S33 --runs=3 --bugswitch=__TALARIA_DISABLE_TOOL_LIFECYCLE_V2`
- `FINAL H-S32 FAIL-REAL-BUG`
- `FINAL H-S33 FAIL-REAL-BUG`
- Runs: `FAIL,FAIL,FAIL` for both.

Gate:

- `npm run gate`
- 31 scenarios passed.
- Known failing baseline: `(none)`.
- Regressions: `(none)`.
- `GATE H-S32 PASS`
- `GATE H-S33 PASS`
- `[gate] PASS: no new regressions; 0 known-failing tracked.`

Syntax and lint:

- `node --check` passed for both `tool-lifecycle-store.js` files, both `drawing-tools-manager.js` files, both touched `harness-lib.mjs` files, and both touched `serve.mjs` files.
- Cursor lints reported no errors for the touched JS/MJS files.

Build id:

- Current base build observed in the tree is `20260712b2`.
- No additional cache-bump script run is required from this worker handoff; final build-bump coordination remains outside this diff.
- Runtime loader entries include `tool-lifecycle-store.js` before `drawing-tools-manager.js` on the current `20260712b2` base.

Engine tree SHA256 checks:

- `chart.js`: `MATCH` - `0c1deb4ed26340bec747c51a33cea98f33aff0187b75642654b06bf1eacefb99`
- `dist-v9/index.html`: `MATCH` - `1ee95fe247b0f25a84510db24789fe7caaa2aee8388c8d2b8580596bda528ada`
- `dist-v9/sw.js`: `MATCH` - `1157890b00a3da1888afd75e44ef70891ff8cd7964828d7e9ca7b1786fa3884a`
- `legacy-index.html`: `MATCH` - `678c8994026cba8ade93d9b55f1936689673a28892bd7d44e5a9edb6a3112bb6`
- `sw.js`: `MATCH` - `1157890b00a3da1888afd75e44ef70891ff8cd7964828d7e9ca7b1786fa3884a`
- `tool-lifecycle-store.js`: `MATCH` - `4b6251cf804fdbcfaa867b20f09fbc68ebc7998f89da61f1b4a54ed9ff3ed77f`
- `drawing-tools-manager.js`: `MATCH` - `3f0c12d8829f0a28823d963e9d7c6a52a177e09d14d14b27813de4f7c634ce0b`
- `multichart-prod/chart-embed.html`: `MATCH` - `e66efc18aa374758f662a779f2724c6df2a0de442caf17999c9b5cf12a68c7ea`
- `multichart-prod/harness/harness-lib.mjs`: `MATCH` - `eaddeb61ae96930e57b8dfde980141ce68eff9b01e824f866b057992f69ea077`
- `multichart-prod/harness/known-failing.json`: `MATCH` - `b3172ac7d535dfcb8425bfdfaf5e35300e388401310a2a8f71bc836bced07a3d`
- `multichart-prod/harness/serve.mjs`: `MATCH` - `63082fc2fcf1639a7bfcdb4b2d63a44c8804835cca1e997f3b973a3526887a45`

## Notes

The harness now clears only drawing-storage keys at scenario boot. This prevents H-S32's saved trendline from contaminating H-S33 while preserving the real drawing persistence path inside each scenario.
