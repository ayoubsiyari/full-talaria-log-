# T1 step 6 multichart selection regression report

## Scope / stop disposition

This is the mandatory diagnostic-first pass for the consolidated live React multichart regressions reported on build `20260712b8`.

I stopped after Part 1. The mechanism map shows the live failures are owned by the production React multichart parent (`MultichartGrid.jsx` / real `chart-embed`) and its parent-owned focus/settings cleanup, not by the lightweight harness manager alone. A coherent fix should be an explicit React ownership change that separates:

- source-panel selection preservation;
- peer-panel deselection;
- parent V9/settings open;
- parent V9/settings close.

Patching only the engine lifecycle subscriber would leave the real React close/focus races in place and risks another harness-green/live-red result. No build/cache bump was run.

## Diagnostic - escalation-ready mechanism map

### R1 - Ctrl-select broken

Mechanism: Lane 2's iframe-local double-toggle suppression is still present and correctly scoped, but it only protects the second same-drawing Ctrl toggle inside an iframe. The live React parent can still run focus/cleanup side effects against the iframe selection during the same interaction.

Evidence:

- `drawing-tools-manager.js:2309-2337` handles panel-local Ctrl-click: it finds the hit drawing, calls `selectDrawing(ctrlBest, true)`, then arms `_suppressNextIframeCtrlSelectToggle` for the immediate duplicate same-drawing toggle.
- `drawing-tools-manager.js:9714-9727` consumes that suppression only when the same drawing is already selected in a multichart iframe and the 80 ms window is still fresh.
- `drawing-tools-manager.js:9746-9776` preserves additive selection locally and intentionally hides the toolbar when more than one drawing is selected.
- `MultichartGrid.jsx:1970-1988`, `3719-3742`, and `6308-6322` still schedule parent focus cleanup via `clearDrawingUiOnOtherPanels()` / `deselectDrawingsOnNonFocusedPanels()` from real React panel focus and cell mousedown paths.

Conclusion: the Row-2 suppression window and step-4/5 routing do conflict in live React only indirectly. The suppression prevents the old iframe-local double-toggle, but the parent focus cleanup is a separate owner that can still clear or re-route UI around the iframe selection. That parent path is not represented by `multichart-manager.js`, which is why H-S43 remains green.

### R2 - no blue selection / preview border

Mechanism: there are two "blue border" concepts in play, and they now have different owners.

- Per-tool selection chrome is engine-owned: `drawing-tools-manager.js:8960-8981` renders the drawing, calls `drawing.select()`, syncs resize-handle chrome, and notifies V9 only when toolbar sync is not suppressed.
- The actual selected-tool handles/axis chrome are applied by `drawing-tools-base.js:2280-2296`.
- The live multichart panel focus frame is React-owned: `MultichartGrid.jsx:3585-3624` computes `focusedRect`, and `MultichartGrid.jsx:6508-6522` renders `[data-multichart-focus-frame="1"]`.
- CSS explicitly strips borders/outlines/shadows from almost everything under `#chart-container`, preserving only `[data-multichart-focus-frame]` and `[data-multichart-focus-border]`: `talaria-design/live/index.html:266-301`.

The drop occurs when selection ownership is routed through parent V9/cleanup while the per-tool `select()` chrome is panel-local. `skipV9Dismiss` protects the parent quick/settings dismissal event, but it does not guarantee that the source iframe keeps its per-tool selected chrome or that the React focus frame is recomputed after the iframe selection event. This matches the live symptom: single chart is fine because it has one owner; panel selection crosses iframe-local drawing state and parent React focus state.

### R3 - settings flash open then immediately close

Mechanism: the open path and close path race in the same parent interaction.

Open path:

- iframe `editDrawing()` forwards to the parent via `requestMultichartParentDrawingSettings()`: `drawing-tools-manager.js:10158-10167`;
- the parent handles `multichart-open-drawing-settings` and calls `openDrawingSettingsForPanel()`: `MultichartGrid.jsx:5871-5882`;
- `openDrawingSettingsForPanel()` opens V9 settings through `window.__v9OpenDrawingSettings`: `MultichartGrid.jsx:4854-4867`.

Close / cleanup path racing it:

- step-5 selection routing posts `multichart-clear-drawing-ui` with `skipV9Dismiss: true`: `chart.js:2327-2332`;
- the parent receives that and calls `clearDrawingUiOnOtherPanels(sourceId, { skipV9Dismiss })`: `MultichartGrid.jsx:5832-5839`;
- `clearDrawingUiOnOtherPanels()` suppresses only `multichart-dismiss-drawing-settings`, but still unconditionally calls `closeDrawingSettingsOnAllPanels()`: `MultichartGrid.jsx:4754-4768`;
- `openDrawingSettingsForPanel()` itself also calls `closeDrawingSettingsOnAllPanels()` immediately after a successful V9 open: `MultichartGrid.jsx:4860-4867`;
- `multichart-close-drawing-settings` is also handled by calling `clearDrawingUiOnOtherPanels(sourceId)` with no skip option: `MultichartGrid.jsx:5822-5829`.

Why `skipV9Dismiss` did not prevent R3: it only skips the parent `multichart-dismiss-drawing-settings` event and `closeGlobalLegacyDrawingSettings()` branch. It does not skip the parent-wide `closeDrawingSettingsOnAllPanels()` command, so the source panel's settings can open and then be closed by the same React parent interaction.

## Fix disposition

No runtime fix was applied in this pass.

Recommended fix shape:

- Keep `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2` as the existing lifecycle kill-switch for engine lifecycle behavior, but do not treat it as sufficient for React parent ownership. ESC-006 already records that disabling it did not change the live regressions.
- Split `clearDrawingUiOnOtherPanels(sourceId, opts)` into source-preserving operations:
  - peer drawing deselect;
  - peer settings close;
  - parent global V9 dismiss;
  - source settings close only on explicit deselect/Esc/delete, not on select/open.
- Treat `multichart-close-drawing-settings` as "close settings for this source interaction" instead of "clear all drawing UI on other panels".
- Add a real React acceptance path before any patch is accepted. Harness-only H-S43/H-S44 is insufficient.

State matrix after diagnostic:

| Surface | R1 Ctrl-select | R2 selection border | R3 settings |
|---|---|---|---|
| Single chart | Unchanged / fine by PO report | Unchanged / fine by PO report | Unchanged / fine by PO report |
| Harness multichart | H-S43 passes | H-S44 passes its local toolbar proxy, not the real React border | H-S44 passes parent probe, but not the real React V9 close race |
| Real React multichart | Parent focus cleanup can still interfere beyond Row-2 suppression | Per-tool chrome and React focus-frame ownership can desync | Open path races unconditional parent-wide close |

## Evidence

Binding context read:

- `docs/tickets-overhaul/worker-reports/T1-step4-lifecycle-migration-report.md`
- `docs/tickets-overhaul/worker-reports/T1-step5-multichart-select-settings-fix-report.md`
- `docs/tickets-overhaul/worker-reports/T3-step3-row2-ctrlselect-fix-report.md`
- `docs/tickets-overhaul/INVARIANTS.md`
- `docs/tickets-overhaul/MANAGER-ESCALATIONS.md` (`ESC-006`)

Harness blind spot confirmation:

```text
npm run test -- --only=H-S43,H-S44 --runs=1
FINAL H-S43 PASS
FINAL H-S44 PASS
```

This confirms the prompt's warning: the lightweight harness remains green and cannot be used alone to declare the live React multichart regressions fixed.

Real-product verification status:

- Real-product mechanism was diagnosed in `MultichartGrid.jsx` and real iframe/parent postMessage code paths.
- I did not complete a local automated React-browser reproduction in this pass. A standing acceptance check should exercise the Vite live UI or PO environment, not `multichart-prod/harness/multichart-manager.js`.

Manual PO script for the next fix:

1. Open live React multichart (`MultichartGrid`) with two panels.
2. In panel B, place two synced drawings.
3. Ctrl-click both drawings in panel B and verify both stay selected exactly once.
4. Single-click a selected drawing in panel B and verify the blue selected/focus chrome remains visible.
5. Open settings for that panel-B drawing and verify the settings surface remains open for at least one event turn and until explicit Esc/deselect.
6. Press Esc in panel B and verify drawing deselects and parent settings close.
7. Repeat with `window.__TALARIA_DISABLE_TOOL_LIFECYCLE_V2 = true` only to prove which behavior is still outside the engine lifecycle switch.

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

`MultichartGrid.jsx` is not accepted by `node --check` because Node does not parse `.jsx` directly in this repo setup.

## SHA256 mirror evidence

| File | SHA256 | Match |
|---|---|---|
| `chart/chart.js` | `ea3eca2b48214bc8650e3a0b2bcb0f5d9b241ee803e3be58386f02000a3b6178` | yes |
| `chart/modules/drawing-tools-manager.js` | `5907bada279598f0e3bebc62bbde69faa7a6c8c44e63f0e1d1ad34216fd86d58` | yes |
| `chart/modules/tool-lifecycle-store.js` | `aceac26a51a69593393e60f91fad0fbec7f82d2effd1e58643be4094e05b7ee1` | yes |
| `chart/multichart-prod/multichart-manager.js` | `421f074f14aea0a6798c839e133e6c5f237df9e192a4e331f72e7fa1daa50863` | yes |
| `chart/multichart-prod/harness/scenarios.mjs` | `e3dbe5f175a3832261dbf18277adf229eb236a16836973e05a7ef5de95719736` | yes |
| `chart/multichart-prod/harness/interactive-helpers.mjs` | `ca92b7b2b67970f366e2d2f7b0a96591e25b19fb77fedc020986ada103cd9f8c` | yes |
| `chart/multichart-prod/harness/known-failing.json` | `f3a0835d856b48396ecdbae4ed01be7dcd60662882cfb29c5c5706ed88c2c0da` | yes |
| `chart v 1.4/talaria-design/src/MultichartGrid.jsx` | `d5e8f42a06f68cc62ad50eda0190bf56c544aa019aa9663064ee2ac6a44f8c41` | n/a |

## Build ID

No build/cache bump was run. Build-id coordination remains with the Manager.
