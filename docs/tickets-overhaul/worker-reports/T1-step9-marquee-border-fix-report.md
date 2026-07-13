# T1 Step 9 - Ctrl+Drag Marquee Border Fix Report

## Scope

Task: T1 step 9, RC-1, `PLAN2-FOUND#1`.

Switch: `window.__TALARIA_DISABLE_CTRL_MARQUEE_FIX` (default ON, fix active unless truthy).

Build id: no bump performed.

## Part 1 Diagnostic

The step 8 mechanism was incomplete in the running chart for two reasons:

1. The live drag stream is pointer-event dominant. In the Vite fast loop, a Ctrl+drag emitted 13 `pointermove` events but only the initial `mousemove`, so the mouse-only document tracker did not update the marquee rectangle.
2. After extending the movement stream, `endX/endY` updated, but `drawCtrlMarqueeSelect()` was still not reached during live renders. The running chart recorded `scheduleRender()` calls and render counter growth, but `drawCtrlMarqueeSelect()` call count stayed `0`; therefore the overlay was never created from the canvas render path.

File/line evidence in the final code:

- `chart v 1.4/chart/chart.js:31193` updates `ctrlMarqueeSelect.endX/endY`.
- `chart v 1.4/chart/chart.js:31199` synchronizes the visible overlay directly from the live tracker while the switch is ON.
- `chart v 1.4/chart/chart.js:31233` removes both mouse and pointer document listeners.
- `chart v 1.4/chart/chart.js:31257` installs both mouse and pointer document listeners.
- `chart v 1.4/chart/chart.js:18656` still keeps the canvas draw path as a secondary paint path.

Running-chart RED evidence before the effective fix:

```text
Ctrl+drag on Vite live main chart:
active=true
dragType=ctrlMarqueeSelect
startX=372 startY=280
endX=372 endY=280
overlayExists=false
```

Intermediate diagnostic after pointer movement but before direct overlay sync:

```text
scheduleRender calls=15
render counter 24 -> 40
drawCtrlMarqueeSelect calls=0
endX=768 endY=495
overlay=false
```

Conclusion: step 8 correctly armed the marquee gesture, but the visible preview border needed to be driven by pointer events and by direct overlay synchronization, not only by `mousemove` plus the normal canvas render tail.

## Fix Diff

The final code path extends the existing gated step 8 implementation:

- `startCtrlMarqueeDocumentTracking()` listens to `pointermove`, `pointerup`, and `pointercancel` as well as mouse events.
- `stopCtrlMarqueeDocumentTracking()` removes the same pointer listeners.
- `updateCtrlMarqueeSelectFromEvent()` calls `_syncCtrlMarqueeSelectOverlay()` immediately when the switch is ON, so the blue preview border draws even when the canvas render path returns before `drawCtrlMarqueeSelect()`.

Net engine state:

```text
chart v 1.4/chart/chart.js
homepage/public/chart/chart.js
```

The two production chart trees are byte-identical. No build-id files were changed.

## RED / GREEN / RED

RED first:

```text
Main live chart Ctrl+drag:
active=true, endX=end start, overlayExists=false
```

GREEN after fix, main chart using Vite live fast loop at `http://127.0.0.1:5174/`:

```text
active=true
dragType=ctrlMarqueeSelect
startX=372 startY=280
endX=768 endY=495
overlayExists=true
computedDisplay=block
width=396 height=215
stroke=rgba(41, 98, 255, 0.9)
fill=rgba(41, 98, 255, 0.15)
layerBox={ w: "1239", h: "799", viewBox: "0 0 1239 799", z: "3" }
after release: active=false, overlayDisplay=none
```

GREEN after fix, panel iframe using production `multichart-prod` host:

```text
active=true
dragType=ctrlMarqueeSelect
startX=160 startY=315
endX=447 endY=585
overlayExists=true
computedDisplay=block
width=287 height=270
stroke=rgba(41, 98, 255, 0.9)
fill=rgba(41, 98, 255, 0.15)
layerBox={ w: "639", h: "900", viewBox: "0 0 639 900", z: "3" }
after release: active=false, overlayDisplay=none
```

GREEN selection proof:

```text
Host/tile A:
overlay during drag=true, width=231, height=302
selectedCount=2
selectedMatches=true

Panel B:
overlay during drag=true, width=254, height=302
selectedCount=2
selectedMatches=true
```

RED again with kill-switch:

```text
window.__TALARIA_DISABLE_CTRL_MARQUEE_FIX = true
active=true
startX=372
endX=372
endY=280
overlayExists=false
width=0 height=0
```

## I5 State Matrix

| Cell | Behavior |
|---|---|
| Main chart, replay off | Changed: Ctrl+drag empty-space marquee now updates from pointer events and draws the blue overlay during drag. |
| Main chart, replay paused/playing | No replay/mirror-frame path touched. H-S36/H-S37 pass. |
| Multichart panel, replay off | Changed in the same engine path inside iframe panels; blue overlay draws and release selects enclosed drawings. H-S43 remains pass. |
| Multichart panel, replay paused/playing | No replay/mirror-frame path touched; full gate pass shows no new regressions. |
| Plain drag / single-click / Ctrl-click toggle | Intended unchanged. H-S32/H-S33/H-S43 pass. |

## Verification

Syntax and lints:

```text
node --check "chart v 1.4/chart/chart.js"
node --check "homepage/public/chart/chart.js"
ReadLints: no linter errors for both chart.js files
```

Focused required gate:

```text
npm run test -- --only=H-S32,H-S33,H-S36,H-S37,H-S38,H-S39,H-S43 --runs=1
FINAL H-S32 PASS
FINAL H-S33 PASS
FINAL H-S36 PASS
FINAL H-S37 PASS
FINAL H-S38 PASS
FINAL H-S39 PASS
FINAL H-S43 PASS
```

Full gate:

```text
npm run gate
Known failing baseline: H-S34, H-S35, H-S40, H-S41, H-S42, H-S44
Known-failing still red: H-S34, H-S35, H-S40, H-S41, H-S42, H-S44
Regressions (not in baseline but failed): (none)
[gate] PASS: no new regressions; 6 known-failing tracked.
```

## SHA256

```text
AA6FD1255EC691305F48D5BA78946A988184FE7DFE4295AACD526E01228B9E57  chart v 1.4/chart/chart.js
AA6FD1255EC691305F48D5BA78946A988184FE7DFE4295AACD526E01228B9E57  homepage/public/chart/chart.js
```

## Build ID

No build id bump was performed. Manager coordinates the final bump/deploy.
