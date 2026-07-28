# PO build attribution — one action, no DevTools archaeology

**2026-07-28 · Manager B · DISPATCH-B-ATTRIBUTION-FIRST item 1**

Authenticated `/chart/index.html` serves `dist-v9/index.html`. That shell (and the
others below) now expose the build id two ways:

## One action (pick either)

1. **Look at the bottom-left corner** of the chart page — faint text `build 2026…bN`.
2. **Console one-liner** (paste, Enter):

```js
window.__TALARIA_CHART_BUILD_ID
```

On load the page also logs `[Talaria] chart build <id>` to the console.

## Shells covered

| Shell | URL the PO may open | Attribution |
|---|---|---|
| V9 (canonical) | `/chart/index.html` → dist-v9, or `/chart/dist-v9/index.html` | badge + console + `window.__TALARIA_CHART_BUILD_ID` |
| Live source | `/chart/talaria-design/live/` | same |
| Legacy | `/chart/legacy-index.html` | same (window id added; was stamp-only before) |
| Embed | multichart iframe `chart-embed.html` | badge + console + window id |
| Stub fallback | `/chart/index.html` only if dist-v9 absent | console + window id + visible `build-id` code |

## What to write down after a PO session

Record: **URL + `window.__TALARIA_CHART_BUILD_ID` + wall-clock time**. Without the
build id, the session is not evidence about a fix.

## Before trusting a retest (cache residuals)

1. Confirm the corner badge / `window.__TALARIA_CHART_BUILD_ID` is the **new** id from the ship note.
2. If it is the old id: hard reload (Ctrl+Shift+R), or private window, or unregister the service worker for the origin — then re-check the badge.
3. If the badge is new but behaviour looks old: tell B — that is a deploy-gate / byte-identity problem, not a product judgment.
