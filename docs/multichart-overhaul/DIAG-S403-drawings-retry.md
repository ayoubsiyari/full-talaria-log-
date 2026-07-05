# DIAG-S403 - Drawings 403 retry during multichart replay

## Scope

Task S-403-1 is read-only diagnosis. No server-side permission check was inspected as a fix target and no source code was changed. The 403 response can remain correct; the client problem is repeated cloud-save attempts from chart iframes during replay-related drawing refreshes.

## Findings

### 1. The 403 gate is not shared across iframe panels

The gate in `chart v 1.4/chart/modules/drawing-tools-manager.js` is implemented as static fields on the `DrawingToolsManager` class:

- `DrawingToolsManager._drawingsCloudSubscriptionBlocked`
- `DrawingToolsManager._drawingsSubscriptionNoticeShown`
- `DrawingToolsManager._drawingsCloudAuthLastToken`

That is shared only among `DrawingToolsManager` instances inside the same JavaScript realm. In multichart, every iframe loads its own chart runtime, so every iframe has its own class object and its own static fields. A 403 learned by panel B does not set the flag in panels C/D or the host. The canonical and homepage copies are byte-identical for this module, so this is not a mirror-drift issue.

Within one iframe, `_canUseDrawingsCloudApi()` does honor the local gate:

- no token -> no cloud call
- token changed -> clear the local 403 gate
- `_drawingsCloudSubscriptionBlocked` -> return false

The scope bug is therefore cross-frame: the code comment says "this session", but the actual flag is "this iframe realm".

### 2. The replay-adjacent re-issuer is the drawing refresh save path

The POST at `drawing-tools-manager.js:11462` is the normal debounced API save path:

`saveDrawings()` -> `scheduleSaveToAPI()` -> `saveDrawingsToAPI()` -> `_saveDrawingsToAPIOnce()` -> `fetch('/api/chart/drawings/{symbol}', { method: 'POST' })`

That path does handle `response.status === 403` by calling `_onDrawingsApiSubscriptionBlocked()`.

The function and condition that can re-issue it during replay/data-refresh work is:

`DrawingToolsManager.scheduleRefreshAfterTimeframe()`, after it refreshes/redraws drawings, under:

`if (this.drawings.length > 0) { this.saveDrawings(); }`

Replay and replay-pan data paths can call this refresh path when candles are reloaded or extended, for example `Chart.checkViewportLoadMore()` calls it after a backward replay data extension under:

`direction === 'backward' && isReplay && this.drawingManager && typeof this.drawingManager.scheduleRefreshAfterTimeframe === 'function'`

This is not a user drawing edit. It is a render/data re-anchor operation that rewrites the same drawings and then runs the full save pipeline. In multichart iframes, that means each panel can schedule its own cloud save for replay-maintenance work.

### 3. The bridge drawing-sync loop is not the direct POST source

`sync-bridge.js` applies inbound drawing messages through `applyDrawingChange()`, setting `chart._receivingDrawingSync = true` while calling `chart.receiveDrawingChange(...)`.

`DrawingToolsManager.saveDrawings()` exits early when `this.chart._receivingDrawingSync` is true. The native `receiveDrawingChange()` paths also do not directly run the chart drawings API POST for normal add/update sync. Therefore the observed cloud POST is not coming from the postMessage drawing-sync fan-out loop.

### 4. The keepalive POST is a secondary gap, not the replay tick loop

`_saveDrawingsToAPIKeepalive()` sends the POST at `drawing-tools-manager.js:1614`. It checks `_canUseDrawingsCloudApi()` before sending, so it will respect a gate that is already set in the same iframe.

However, it never observes the response status:

`fetch(..., { keepalive: true }).catch(() => {})`

So if the first forbidden cloud save in a given iframe is the keepalive path, that iframe will log a 403 network error but will not call `_onDrawingsApiSubscriptionBlocked()`. Static analysis does not show this as the replay per-tick source; it is an unload/pagehide flush path. It should still be included in the eventual guard because it can bypass learning from its own 403 response.

## Why debounce/gate does not suppress the flood

The debounce only coalesces saves inside one `DrawingToolsManager` instance. It does not coordinate across iframes.

The 403 gate only suppresses future cloud calls after that same iframe has seen a 403 through the status-aware API path. It does not:

- share the entitlement result with sibling iframes;
- distinguish user edits from replay/data refresh redraws;
- prevent multichart replay panels from scheduling cloud saves at all;
- learn from the keepalive POST response.

So the server check can be correct, while the client still produces noisy repeated attempts because replay-maintenance saves are treated like real drawing edits in each iframe.

## Minimal fix sketch

Keep the server-side 403 unchanged.

Client-side, add a kill-switchable guard around cloud drawing saves, not local persistence:

- Kill-switch name: `window.__TALARIA_MC_DISABLE_DRAWINGS_403_RETRY_GUARD`.
- In the remote-save scheduling path (`saveDrawings()` before `scheduleSaveToAPI()`, or `scheduleSaveToAPI()` before arming `_apiSaveTimer`), if this is a multichart iframe replay panel and the kill-switch is not set, skip the cloud POST but still write localStorage/cache metadata.
- Make the 403 gate session-wide across same-origin iframes, for example by setting a small `sessionStorage`/`localStorage` marker in `_onDrawingsApiSubscriptionBlocked()` and consulting it in `_canUseDrawingsCloudApi()`. This lets one panel's 403 stop sibling panels from retrying.
- Ensure `_saveDrawingsToAPIKeepalive()` also consults that same guard before sending; do not weaken or bypass the server permission check.

Acceptance should verify that replay still renders drawings locally, the host/panels no longer emit repeated `POST /api/chart/drawings/{symbol} 403`, and setting `window.__TALARIA_MC_DISABLE_DRAWINGS_403_RETRY_GUARD = true` restores the old retry behavior for diagnosis.
