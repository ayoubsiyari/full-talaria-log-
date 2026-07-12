# T3 Step 2 — Row 2 + Row 11 Isolation Report

**Task:** T3 step 2 (Lane 2), D-002-authorized isolation subset  
**Scope:** RED-isolation + measurement only; no fixes  
**Probe:** `chart v 1.4/chart/multichart-prod/harness/t3-row2-row11-probe.mjs`  
**Run:** `node "t3-row2-row11-probe.mjs"` from `chart v 1.4/chart/multichart-prod/harness`

---

## Executive finding

| Row | Result |
| --- | --- |
| Row 2 — Selection / Ctrl-select | RED reproduced. Exactly one mechanism implicated: **local panel Ctrl-click double-toggle** (`c-local-double-toggle`). The two D-002 candidates were ruled out by the probe evidence. |
| Row 11 — Pan drag bounds | Host vs iframe plot rects measured equal in the harness 2-panel layout. **No plot-rect geometry violation measured** in this topology. |

---

## Row 2 — Selection / Ctrl-select (TAL-01498)

### RED scenario spec

1. Boot harness with same-pair 2-panel layout: A host + B iframe, TF `1m`.
2. Install runtime-only probes:
   - Parent logs `panel-focus`, `clearDrawingUiOnOtherPanels`, `deselectDrawingsOnNonFocusedPanels`.
   - Panel B wraps `chart.receiveDrawingChange` and `drawingManager.selectDrawing`.
3. Place two separated host trendlines; default drawing sync fans them into panel B.
4. In panel B, Ctrl-click the two drawing centers using page-coordinate translated iframe positions.
5. Expected contract: panel B `selectedDrawings.length === 2`; geometry remains separated.
6. Actual RED: final panel B `selectedIds: []`.

### Discriminating evidence

**Candidate (a), inbound coordinate decoration wrong frame — ruled out.**

- Before Ctrl-click, panel B drawings are already separated:
  - Drawing 1 center: `(158.88, 456.32)`
  - Drawing 2 center: `(403.95, 664.83)`
  - Center distance before: `321.77px`
- After Ctrl-click, geometry remains separated:
  - Center distance after: `321.77px`
- `receiveDrawingChange` logs preserve distinct incoming `x` ranges:
  - Drawing 1: `x: 1920 → 1960`
  - Drawing 2: `x: 1955 → 1995`

**Candidate (b), parent focus-cleanup racing selection guard — ruled out.**

- Parent log during the probe contains only:
  - `message:panel-focus` from `B`
  - `message:panel-focus` from `B`
- No `clearDrawingUiOnOtherPanels` or `deselectDrawingsOnNonFocusedPanels` call fired during the selection failure.

**Implicated mechanism: local panel Ctrl-click double-toggle.**

The panel B frame log shows one Ctrl-click path invoking `selectDrawing` twice for the **same drawing** within the same interaction window:

1. First call selects the drawing:
   - `selectDrawing:after`
   - `selectedIds: ["295fa006-fc21-4faa-9f5a-3a4b68371a44"]`
2. Immediate second call toggles the same drawing back out:
   - `selectDrawing:before`
   - same `id`, `addToSelection: true`
   - snapshot already has that same id selected
   - following `selectDrawing:after`
   - `selectedIds: []`

The probe classifier reports:

```text
implicated: c-local-double-toggle
localDoubleToggle: true
```

### Row 2 conclusion

The RED scenario implicates **exactly one mechanism**, but it is neither original candidate (a) nor (b). The failure is local to panel B's Ctrl-click selection dispatch: the same drawing is toggled into selection and immediately toggled out again. Future fix should target ownership row 2's panel-local selection path, after Director acknowledges this updated mechanism.

---

## Row 11 — Pan drag bounds (TAL-01491)

### Measurement probe

Harness layout: same-pair 2-panel layout, A host + B iframe, TF `1m`.

The probe measured:

- Host tile A `#chartWrapper`
- Host tile A canvas
- Host tile A effective plot rect: `canvasRect + chart.margin`
- Iframe tile B frame rect
- Iframe tile B local canvas
- Iframe tile B global effective plot rect

### Measurements

| Panel | Canvas rect | Margin | Effective plot rect |
| --- | --- | --- | --- |
| Host A | `left=0 top=0 width=639 height=900` | `t=0 r=55 b=30 l=0` | `left=0 top=0 width=584 height=870` |
| Iframe B (local) | `left=0 top=0 width=639 height=900` | `t=0 r=55 b=30 l=0` | `left=0 top=0 width=584 height=870` |
| Iframe B (global) | frame `left=641 top=0 width=639 height=900` | `t=0 r=55 b=30 l=0` | `left=641 top=0 width=584 height=870` |

Delta:

```text
plot width delta:  0px
plot height delta: 0px
plot left delta:  -641px (expected: different columns)
plot top delta:    0px
```

Other observed values:

```text
host offsetX:   -13448.008
iframe offsetX: -13425
candleSpacing: 7.002 on both
```

### Row 11 conclusion

No host-vs-iframe **plot rect** geometry violation was measured in the harness topology. Host A and iframe B have identical effective plot sizes (`584×870`) and identical chart/canvas dimensions (`639×900`).

If TAL-01491 still reproduces manually, the next diagnostic should capture a live drag trace (pointerdown/move/up + `offsetX` deltas) in the PO's production layout. The current probe does **not** justify a host offset constant or a host-only geometry fix.

---

## Probe status

Added diagnostic probe:

- `chart v 1.4/chart/multichart-prod/harness/t3-row2-row11-probe.mjs`

Not added to:

- `scenarioList()`
- `known-failing.json`
- gate expected tests

I9 is intact: existing scenario assertions were not altered and no diagnostic was promoted to the ratchet gate.

---

## Confirmations

- No fixes applied.
- No engine runtime files edited.
- Only a standalone diagnostic harness probe and this report were added.
- Legacy `chart v 1.4/chart/multichart/` was not touched.
