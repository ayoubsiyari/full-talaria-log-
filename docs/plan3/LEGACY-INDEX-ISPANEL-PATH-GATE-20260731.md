# LEGACY-INDEX-ISPANEL-PATH-GATE

**Date:** 2026-07-31  
**Owner:** D  
**Gate:** `scripts/legacy-index-panel-path-gate.mjs`

## Verdict

`legacy-index.html` has a non-auth static control for the disclosed `isPanel` path.

The gate is **GREEN** and RED-controlled:

- `chart/index.html` links to `/chart/legacy-index.html`
- `legacy-index.html` contains the expected unauthenticated redirect marker (`/api/auth/me` → login)
- `legacy-index.html` constructs panels with `new Chart(panel.canvas, panel.svg, { panelIndex: panel.index })`
- `legacy-index.html` explicitly marks `panelChart.isPanel = true`
- `chart.js` constructor sets `this.isPanel = true` when a `canvasElement` is passed

RED controls:

- `RED-LEGACY-INDEX-LINK-REMOVED`
- `RED-LEGACY-PANEL-CONSTRUCTOR-REMOVED`
- `RED-CHART-CONSTRUCTOR-DOES-NOT-SET-ISPANEL`

## Caveat

This is a static, non-auth shell wiring control. It covers the only disclosed shell path that reaches `isPanel`, but it does **not** prove browser resize behavior. Browser reproduction remains A/product territory.

## Commands

```
npm run test:legacy-index-panel-path
npm run preflight:legacy-index-panel-path
```
