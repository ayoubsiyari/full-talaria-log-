# T3 Step 3 — Row 2 Ctrl-Select Fix Report

**Task:** T3 step 3, Row 2 (selection / Ctrl-select)  
**Ticket:** TAL-01498  
**RC:** RC-4 — multichart panel interaction parity  
**Mechanism fixed:** panel-local Ctrl-click double-toggle in multichart iframe tiles  
**Scope:** fix + ratcheted harness scenario; no host Ctrl-click behavior change

---

## Summary

The row 2 isolation probe showed the original suspected cross-frame mechanisms were not responsible:

- Inbound coordinate decoration was ruled out because panel B drawing geometry stayed separated before/after selection.
- Parent focus cleanup was ruled out because no `clearDrawingUiOnOtherPanels` / `deselectDrawingsOnNonFocusedPanels` ran during the failure.
- The actual failure was panel-local: Ctrl-mousedown on panel B selected a drawing through the canvas capture path, then the same interaction reached the drawing/SVG path and toggled that same drawing back out.

The fix suppresses only the immediately repeated same-drawing Ctrl toggle in **multichart iframe embeds**. Host tile A and single-chart Ctrl-click paths do not use this suppression.

---

## Files changed

Runtime:

- `chart v 1.4/chart/modules/drawing-tools-manager.js`
- `homepage/public/chart/modules/drawing-tools-manager.js`

Harness / gate:

- `chart v 1.4/chart/multichart-prod/harness/scenarios.mjs`
- `homepage/public/chart/multichart-prod/harness/scenarios.mjs`
- `chart v 1.4/chart/multichart-prod/harness/known-failing.json`
- `homepage/public/chart/multichart-prod/harness/known-failing.json`

Diagnostic retained:

- `chart v 1.4/chart/multichart-prod/harness/t3-row2-row11-probe.mjs`

---

## Implementation

Panel iframe Ctrl-mousedown now records that the canvas capture path already handled a same-drawing additive select:

```text
_suppressNextIframeCtrlSelectToggle = { id, until: performance.now() + 80 }
```

`selectDrawing(drawing, true)` then ignores the next same-drawing additive call only when all are true:

- current document is a multichart iframe embed;
- suppression id matches the drawing id;
- suppression window is still fresh;
- that drawing is already selected.

This leaves normal host Ctrl-click and single-chart Ctrl-click untouched because the guard is gated behind `isMultichartIframeEmbed()`.

---

## Gate promotion

Added **H-S43**:

```text
panel Ctrl-select selects two drawings once; no iframe double-toggle (TAL-01498)
```

Scenario:

1. Boot same-pair 2-panel harness.
2. Place two separated host trendlines; drawing sync mirrors them into panel B.
3. Ctrl-click both panel B drawings using real Puppeteer mouse events.
4. Assert panel B has exactly both drawing IDs in `selectedDrawings`.

`known-failing.json` now includes `H-S43` in `expectedTests`; it is **not** listed under `knownFailing`.

---

## Verification

Commands run from `chart v 1.4/chart/multichart-prod/harness`:

```text
node --check "..\\..\\modules\\drawing-tools-manager.js"
node --check "scenarios.mjs"
node --check "..\\..\\..\\..\\homepage\\public\\chart\\modules\\drawing-tools-manager.js"
node --check "..\\..\\..\\..\\homepage\\public\\chart\\multichart-prod\\harness\\scenarios.mjs"
node "run.mjs" --only=H-S43
node "t3-row2-row11-probe.mjs"
```

Results:

- `H-S43` PASS
- Post-fix diagnostic probe: `implicated: not-reproduced`, `localDoubleToggle: false`
- Read lints: no errors
- Scenario ID baseline matches `known-failing.json`
- Harness `scenarios.mjs` and `known-failing.json` are byte-identical between chart/homepage trees

Note: full `drawing-tools-manager.js` files are not byte-identical in this working tree due to pre-existing unrelated drift, but the row 2 fix was applied to both engine copies.

---

## Confirmation

- Host Ctrl-click path left untouched by condition (`isMultichartIframeEmbed()`).
- No mirror-frame / T8 work.
- Legacy `chart v 1.4/chart/multichart/` not touched.
