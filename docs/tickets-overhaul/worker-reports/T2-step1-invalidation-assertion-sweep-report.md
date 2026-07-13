# T2 Step 1 - Invalidation Assertion Sweep Report

## Scope

RC-2: render-relevant drawing mutations that persist through the shared drawing save path did not schedule a repaint, leaving style commits visually stuck until a later click/mouse event.

The prompt names H-S36/H-S37, but the accepted T0 step 3 report corrected the RC-2 tracked-red IDs to H-S38/H-S39. H-S36/H-S37 are T4 replay scenarios and were kept green as gate coverage.

## Assertion Mode

Implemented `window.__TALARIA_ASSERT_INVALIDATION` in the shared drawing persistence layer:

- `chart v 1.4/chart/modules/drawing-tools-manager.js:11596` adds `__TALARIA_DISABLE_DRAWING_SAVE_INVALIDATION_V2` as the fix kill-switch.
- `chart v 1.4/chart/modules/drawing-tools-manager.js:11600` wraps `chart.scheduleRender()` while assertion mode is enabled and increments an internal schedule sequence.
- `chart v 1.4/chart/modules/drawing-tools-manager.js:11616` logs `[TALARIA ASSERT INVALIDATION]` when a render-relevant mutation is not followed by `scheduleRender()` within `50 ms`.
- `chart v 1.4/chart/modules/drawing-tools-manager.js:11638` compares drawing-save signatures and routes changed render-relevant state to the invalidation path.

Assertion hits from the RED scenarios:

| Scenario | file:line | setter | trigger |
|---|---:|---|---|
| H-S38 | `chart v 1.4/chart/modules/drawing-tools-manager.js:11736` | `DrawingToolsManager.saveDrawings` | Trendline `drawing.style.stroke = '#ff00ff'`, then `dm.saveDrawings()` |
| H-S39 | `chart v 1.4/chart/modules/drawing-tools-manager.js:11736` | `DrawingToolsManager.saveDrawings` | Horizontal line `drawing.style.strokeWidth = 5`, then `dm.saveDrawings()` |

No DEFER-T8 items were found. The hit is outside mirror-frame/replay frame application paths.

## Fix Diff

Mechanism: `saveDrawings()` now fingerprints serialized drawing state. If the fingerprint changed after initialization, it treats the save as render-relevant and schedules `chart.scheduleRender()` through the shared layer. This covers direct settings/tool style commits without touching individual drawing tool files.

Kill-switch: `window.__TALARIA_DISABLE_DRAWING_SAVE_INVALIDATION_V2`.

Harness bookkeeping:

- Removed H-S38 and H-S39 from `known-failing.json` in both production harness trees.
- Preserved known-failing fallback/anchoring entries: H-S34, H-S35, H-S40, H-S41, H-S42, H-S44.

Diff stat:

```text
chart v 1.4/chart/modules/drawing-tools-manager.js | 62 ++++++++++++++++++++++
chart v 1.4/chart/multichart-prod/harness/known-failing.json | 7 +--
homepage/public/chart/modules/drawing-tools-manager.js | 62 ++++++++++++++++++++++
homepage/public/chart/multichart-prod/harness/known-failing.json | 7 +--
4 files changed, 132 insertions(+), 6 deletions(-)
```

## Evidence

RED first:

```powershell
npm run test -- --only=H-S38,H-S39 --runs=1
```

Result: H-S38 and H-S39 both `FAIL-REAL-BUG`, with `renders before=11 after=11`.

GREEN after fix:

```powershell
npm run test -- --only=H-S38,H-S39 --runs=1
```

Result: H-S38 and H-S39 both `PASS`, with `renders before=11 after=12`.

RED again with kill-switch:

```powershell
npm run test -- --only=H-S38,H-S39 --runs=1 --bugswitch=__TALARIA_DISABLE_DRAWING_SAVE_INVALIDATION_V2
```

Result: H-S38 and H-S39 both `FAIL-REAL-BUG`, with `renders before=11 after=11`.

Focused gate:

```powershell
npm run test -- --only=H-S32,H-S33,H-S36,H-S37,H-S38,H-S39,H-S43 --runs=1
```

Result: H-S32, H-S33, H-S36, H-S37, H-S38, H-S39, H-S43 all `PASS`.

Full gate:

```powershell
npm run gate
```

Result: `[gate] PASS: no new regressions; 6 known-failing tracked.`

Tracked known-failing after this step: H-S34, H-S35, H-S40, H-S41, H-S42, H-S44.

## I5 State Matrix

| Cell | Change |
|---|---|
| Single chart, replay off | Changed: drawing save mutations now schedule repaint. H-S38/H-S39 cover this cell. |
| Single chart, replay paused/playing | Intended unchanged except drawing-save invalidation if a drawing mutation is saved. H-S36/H-S37 pass. |
| Multichart panel, replay off | Shared engine path receives the same save-time invalidation when active; no React ownership migration was touched. H-S43 pass, H-S34/H-S35/H-S44 remain tracked fallback-window reds. |
| Multichart panel, replay paused/playing | No mirror-frame path touched. Full gate pass confirms no replay/panel regressions outside tracked reds. |

## SHA256 / Checks

`node --check` clean:

- `chart v 1.4/chart/modules/drawing-tools-manager.js`
- `homepage/public/chart/modules/drawing-tools-manager.js`

JSON parse clean:

- `chart v 1.4/chart/multichart-prod/harness/known-failing.json`
- `homepage/public/chart/multichart-prod/harness/known-failing.json`

Lints: no linter errors for edited files.

Byte-identical SHA256:

- `drawing-tools-manager.js`: `7716A3BA8D5E297BB78BA7BC40610DC53B9CAAE533E219A69897C10D28F658A6` in both trees.
- `known-failing.json`: `98CF39EBC092BB9E45D4A0F9FC2B2C5078CF171703729218427AC71F57782125` in both trees.

Build ID: no build-id files changed; no bump performed.

## Registry Rows

No registry CSV rows were edited in this implementation. The harness rows touched are the T0 step 3 RC-2 stuck-until-click scenarios:

- H-S38: style color commit repaints by next frame.
- H-S39: style width commit repaints by next frame.
