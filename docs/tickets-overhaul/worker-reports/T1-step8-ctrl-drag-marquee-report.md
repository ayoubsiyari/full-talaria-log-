# T1 Step 8 - Ctrl+Drag Marquee Diagnostic/Fix

## Summary

Implemented one gated engine fix for the Ctrl+drag marquee path in `chart.js`, mirrored byte-for-byte across both production chart trees.

Switch: `window.__TALARIA_DISABLE_CTRL_MARQUEE_FIX`

Default: ON (fix active unless the switch is set truthy).

Build id: no bump performed.

## Part 1 Diagnostic

### S1 - Blue marquee border never draws

Mechanism: the marquee start path is chart-owned and can arm `ctrlMarqueeSelect`, but the live rectangle update path was canvas-local. `tryStartCtrlMarqueeSelect` starts from document/canvas mousedown capture in `chart.js`, sets `this.drag.type = 'ctrlMarqueeSelect'`, and sets `this.ctrlMarqueeSelect.active = true`. The visible border then depended on the canvas `mousemove` branch to update `endX/endY` and schedule paint.

Evidence:

- Start predicate and state arm: `chart.js` around `tryStartCtrlMarqueeSelect`.
- Paint function: `chart.js` `drawCtrlMarqueeSelect`.
- Former update path: `chart.js` canvas `mousemove` branch only.

When the pointer target is the SVG drawing layer, a drawing overlay, or leaves the canvas during the drag, document capture can start the gesture while the canvas-local `mousemove` path does not receive the continuation. The marquee remains zero-size or stale, so no usable blue border appears. The SVG overlay layer also only had CSS sizing, not SVG viewport attributes, which made overlay visibility fragile outside the default SVG viewport.

### S2 - Ctrl+drag on/near a tool intermittently moves the shape

Mechanism: same ownership split, plus hit-test arbitration. The chart start predicate rejected marquee on any geometric drawing hit, while drawing-manager paths separately decide Ctrl-click toggle and Ctrl+drag selected-group move. Near a tool, tolerance-based `findDrawingsAtPoint` could classify an otherwise empty-space drag as a drawing hit; on selected/multi-selected drawings, `_tryStartCtrlSelectionMove` can convert the same Ctrl gesture into a move after a threshold. This is why the behavior flips between marquee/select and shape jump based on tiny target/hit-test differences.

Evidence:

- Chart-level rejection on geometric drawing hits: `chart.js` `tryStartCtrlMarqueeSelect`.
- Manager Ctrl selected-group move threshold: `drawing-tools-manager.js` `_tryStartCtrlSelectionMove`.
- Manager Ctrl-click toggle path: `drawing-tools-manager.js` canvas mousedown Ctrl branch.

### One-or-two Verdict

S1 and S2 are one proven mechanism: fragmented Ctrl+drag ownership between the chart marquee and drawing-manager drawing-hit/move paths. The fix is one gated change in the engine: make the chart marquee own document-level drag continuation once it starts, and let near-tool geometric false positives marquee when the actual DOM target is not a drawing element. Actual `.drawing` DOM hits are still left to the existing Ctrl-click / selected-move paths so H-S43 remains intact.

## Fix Diff

Files touched:

- `chart v 1.4/chart/chart.js`
- `homepage/public/chart/chart.js`
- `docs/tickets-overhaul/worker-reports/T1-step8-ctrl-drag-marquee-report.md`

Engine changes:

- Added `this._ctrlMarqueeDocumentTracking`.
- Added `Chart._isCtrlMarqueeFixEnabled()` using `window.__TALARIA_DISABLE_CTRL_MARQUEE_FIX`.
- Added document-level `mousemove` / `mouseup` tracking for an active Ctrl marquee so the rectangle updates/completes even when the event stream is owned by the SVG/drawing overlay rather than the canvas.
- Reused the same completion logic for document and canvas mouseup.
- Sized the SVG marquee overlay with `width`, `height`, and `viewBox` attributes under the switch.
- Relaxed geometric drawing-hit rejection only when the actual event target is not a `.drawing` element, preserving Ctrl-click toggles on real drawing DOM hits.

## I5 State Matrix

| Surface | Switch ON | Switch OFF |
|---|---|---|
| Main chart, Ctrl+drag empty space | Document-level marquee tracking updates and completes the blue rectangle. | Old canvas-only continuation path. |
| Main chart, Ctrl+drag near a tool but not on `.drawing` DOM | Treated as marquee, avoiding geometric hit-test false-positive move routing. | Old geometric hit rejection. |
| Main chart, Ctrl+click on a drawing | Existing drawing-manager Ctrl toggle path preserved. | Existing behavior. |
| Main chart, plain drag on a drawing | Existing drawing-manager move paths preserved. | Existing behavior. |
| Panel, Ctrl+drag empty/near-tool space | Same engine behavior inside the iframe/panel chart. | Old canvas-only/geometric-hit behavior. |
| Panel, Ctrl-click select | H-S43 remains green; Lane 2 iframe suppression untouched. | Existing behavior. |

## Single-Click Quick Menu

Single-click quick menu was verified by the existing focused harness coverage:

- H-S32 main chart: single click selects trendline and shows Quick Menu.
- H-S44 panel: single click selects panel drawing and keeps quick settings owner.

Per the PO spec quoted in the prompt, double-click opening full settings is spec-correct and was not changed.

## Verification

Syntax/lints:

```text
node --check "chart v 1.4/chart/chart.js"
node --check "homepage/public/chart/chart.js"
ReadLints: no linter errors for both chart.js files
```

Focused harness gate:

```text
npm run test -- --only=H-S32,H-S33,H-S34,H-S35,H-S43,H-S44 --runs=1
FINAL H-S32 PASS
FINAL H-S33 PASS
FINAL H-S34 PASS
FINAL H-S35 PASS
FINAL H-S43 PASS
FINAL H-S44 PASS
```

SHA256:

```text
53f60ca158fb8c45addc0beddbf8cc20ef49497d0c98a79f264d0e5541b0f0f0  chart v 1.4/chart/chart.js
53f60ca158fb8c45addc0beddbf8cc20ef49497d0c98a79f264d0e5541b0f0f0  homepage/public/chart/chart.js
```

## Real-Product Parity Rows 8-9

Rows 8-9 still require PO/manual execution on the live React multichart after a real product rebuild. I did not claim harness-only acceptance.

Local `dev:live` remains blocked for this parity path by the known Vite vendor proxy gap: `/chart/vendor/d3.min.js` is not served by the local chart plugin/proxy list, causing the chart to fail initialization. I did not edit Vite config in this RC-1 task.

Required PO/Manager check:

- Row 8, main chart and panel: Ctrl+drag marquee draws blue border and multi-selects enclosed tools.
- Row 9, main chart and panel: single-click selects + quick menu, double-click opens settings, Esc deselects and closes settings.
- Switch-off check: set `window.__TALARIA_DISABLE_CTRL_MARQUEE_FIX = true` and confirm the previous marquee behavior returns.

## Build ID / Release Notes

No build id bump was performed. Because this touches raw `chart.js` in both production trees, Manager can coordinate the single final bump/rebuild/deploy.
