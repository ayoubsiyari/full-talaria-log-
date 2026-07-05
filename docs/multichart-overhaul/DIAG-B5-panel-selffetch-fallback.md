# DIAG-B5 Panel Self-Fetch Fallback

Read-only diagnosis for same-pair panels self-fetching after the host moved to viewport-first/background master hydration.

## Pre-Task Git Status

```text
 M "chart v 1.4/talaria-design/src/TalariaV8b.jsx"
 M "chart v 1.4/talaria-design/src/TalariaV8bLive.jsx"
 M docs/multichart-overhaul/DIRECTOR-DECISIONS.md
 M docs/multichart-overhaul/MANAGER-ESCALATIONS.md
 M docs/multichart-overhaul/MANAGER-FINDINGS.md
```

## Exact Fallback Decision

Primary fallback decision:

- `chart v 1.4/chart/chart.js:21088-21118`, in `checkViewportLoadMore()`.
- The same-pair embed guard enters when `direction === 'backward'`, `_multichartSamePairDataShareActive()` is true, and `_isMultichartEmbedPanel()` is true.
- It first calls `_tryExtendReplayMasterFromParent({ lite: true })` at `chart v 1.4/chart/chart.js:21095-21097`.
- If that returns true, the panel returns immediately at `chart v 1.4/chart/chart.js:21098`.
- If it returns false, the code only blocks follower fetches when visible-range sync is on and the panel is not the local pan leader at `chart v 1.4/chart/chart.js:21101-21103`.
- If that block does not apply, and host delegation does not return true at `chart v 1.4/chart/chart.js:21112-21115`, the explicit comment at `chart v 1.4/chart/chart.js:21117` says the panel falls through to its own fetch path.

The actual network call then happens later in the same function at `chart v 1.4/chart/chart.js:21246`, via `_fetchCandlesCursor(this.currentFileId, tf, cursorNum, direction, barLimit)`.

## Coverage Test That Fails

The mirror/coverage test that returns false is inside `_tryExtendReplayMasterFromParent()`:

- `chart v 1.4/chart/chart.js:4941-4942`: if the host has no `parent.replaySystem.fullRawData`, return false.
- `chart v 1.4/chart/chart.js:4957-4963`: compute `earlier` and `later` from host master edges versus local panel master edges.
- `chart v 1.4/chart/chart.js:4963`: `if (!earlier.length && !later.length) return false;`

With viewport-first host hydration, the host can be same-pair and actively hydrating, but still not have any older/later bars beyond the panel's local master yet. In that state:

1. The panel sees same pair and tries to extend from the host.
2. The host master is absent, still display-TF, or not wider than the panel master.
3. `_tryExtendReplayMasterFromParent()` returns false.
4. `checkViewportLoadMore()` treats that false as "host has nothing useful" rather than "host hydration is not ready yet".
5. The panel can fall through to `_fetchCandlesCursor()` and self-fetch.

## Boot Wait/Retry Path

The boot/pair-load path has a wait/retry that the pan/TF fallback path bypasses:

- `_pollTakeParentNativeMasterSmartWindow()` polls for up to 8s at `chart v 1.4/chart/chart.js:3401-3414`.
- It repeatedly calls `_takeParentNativeMasterSmartWindow()` at `chart v 1.4/chart/chart.js:3405-3407`.
- `_takeParentNativeMasterSmartWindow()` already knows about host viewport-first hydration at `chart v 1.4/chart/chart.js:3370-3372`: when `parent._mcViewportFirstMasterHydrating` is true but the parent raw TF is not `1m`, it returns null.

That wait path is used in `loadMultichartPanelFromHost()` for same-pair boot/pair load at `chart v 1.4/chart/chart.js:3676-3678`. It is not used by `checkViewportLoadMore()` after a host TF/pair switch.

## Host Hydration Signal

Panels can technically read the host hydration fields because same-pair iframe code already reads `window.parent.chart`:

- `parent._mcViewportFirstMasterHydrating`
- `parent._mcViewportFirstMasterReady`
- `parent._mcViewportFirstHydrationSeq`
- `parent._mcViewportFirstHydrationMode`

Current `checkViewportLoadMore()` does not consult those fields before falling through at `chart v 1.4/chart/chart.js:21117`.

The signal B-FIX-3c likely needs is: if same-pair embed panel mirror fails, but `window.parent.chart._mcViewportFirstMasterHydrating === true` or `_mcViewportFirstMasterReady === false` for the same `currentFileId`, the panel should keep waiting/polling the host instead of self-fetching.

## Verdict

The exact fallback decision is `chart v 1.4/chart/chart.js:21117` in `checkViewportLoadMore()`, reached after `_tryExtendReplayMasterFromParent({ lite: true })` fails to find host bars that extend beyond the panel at `chart v 1.4/chart/chart.js:4963`. The missing distinction is "host hydration not ready yet" versus "host cannot provide data"; the panel currently treats both as a miss and can self-fetch.
