# Handoff D → A — legacy-index cheap liveness question

**Date:** 2026-07-31  
**From:** Manager D  
**To:** Manager A

## Answer

The cheap liveness question for `legacy-index.html` is answered enough to avoid a browser run just to test whether the shell is orphaned.

D's non-auth control verifies:

- `chart/index.html` links to `/chart/legacy-index.html`
- `legacy-index.html` carries the expected unauthenticated redirect marker (`/api/auth/me` then login redirect)
- `legacy-index.html` constructs panel charts with `new Chart(panel.canvas, panel.svg, { panelIndex: panel.index })`
- `chart.js` sets `this.isPanel = true` on the canvas constructor path

RED controls prove the assertions are live:

- `RED-LEGACY-INDEX-LINK-REMOVED`
- `RED-LEGACY-PANEL-CONSTRUCTOR-REMOVED`
- `RED-CHART-CONSTRUCTOR-DOES-NOT-SET-ISPANEL`

## Caveat

This is static, non-authenticated shell wiring only. It does **not** prove browser resize behavior. It retires only the cheapest hypothesis: that `legacy-index.html` is orphaned and the disclosed `isPanel` risk is moot.

A's fetch result can coexist with this: D proved only that source wiring and redirect code exist; D did **not** prove the shell is served live or renders instead of redirecting.

Run:

```
npm run test:legacy-index-panel-path
npm run preflight:legacy-index-panel-path
```
