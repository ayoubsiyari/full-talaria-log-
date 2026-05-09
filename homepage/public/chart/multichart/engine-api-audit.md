# Engine API audit (Step 1.2)

This document catalogs the parts of `chart v 1.4/chart/chart.js` (`class Chart`) that the multi-chart sync layer interacts with — events emitted, methods called inbound, and **forbidden** price-axis methods/properties that the sync layer must never touch.

The audit is the source of truth for what `sync-bridge.js` is allowed to do. If chart.js gains a new event or method that affects sync, update this file first, then the bridge.

---

## 1. Events emitted by the chart (parent-window scope)

The chart dispatches events on `window` (its own iframe's `window`). The bridge listens on `window` inside each iframe, then re-emits a sanitized `postMessage` to the parent.

### `chartScrolled`

| Field | When | Format | Notes |
|---|---|---|---|
| **emit site** | `chart.js` line ~8609 (`dispatchScrollSync`) | `CustomEvent('chartScrolled', { detail })` | Fires on pan, zoom, fitToView, jumpTo. Throttled to ~1/frame during active drag (see `_scrollSyncRaf`). |
| `detail.chart` | always | `Chart` instance | Source chart. |
| `detail.startTimestamp` | always | number, **milliseconds** (chart's internal `t` field — already int seconds normalized via `normalizeTimestampMs` for sync) | Visible window start. |
| `detail.endTimestamp` | always | number, **milliseconds** | Exclusive end of visible window (`= data[endIndex].t + barMs`). |
| `detail.rightEdgeBarIndex` | always | int | Bar index at right pixel edge (used by old time-sync; bridge ignores). |
| `detail.timeSyncEndTimestamp` | always | number | Fractional right-edge time. **Bridge uses this** for precise endTime. |
| `detail.startIndex`, `detail.endIndex` | always | int | Bar indices. Bridge ignores (indices don't survive cross-TF sync). |
| `detail.offsetX`, `detail.candleWidth` | always | number | Pixel-space state. **Forbidden** to forward — chart-local presentation. |

> **Time format note**: chart.js stores `candle.t` as integers but the units depend on the data feed. The bridge calls `normalize` (heuristic: divide by 1000 if `> 1e12`) before emitting `postMessage`, so all messages on the wire are **UTC seconds (integer)** per Decision 2.

### `chartDataLoaded`

| Field | When | Format | Notes |
|---|---|---|---|
| **emit site** | line ~1540, ~9317, ~11535 | `CustomEvent('chartDataLoaded', { detail })` | Fires after data ingestion. |
| `detail.symbol` | always | string | |
| `detail.timeframe` | always | string | e.g. `"1m"`, `"1h"` |

The bridge re-emits this as `chart-state` to the parent so the manager can update the per-chart label.

### `timeframeChanged`

| Field | When | Format | Notes |
|---|---|---|---|
| **emit site** | line ~11549 (`_emitTimeframeChanged`) | `CustomEvent('timeframeChanged', { detail })` | Fires when `setTimeframe` succeeds. |
| `detail.timeframe` | always | string | |
| `detail.chart` | always | `Chart` instance | |

The bridge re-emits as `chart-state` (NOT as a sync event — timeframe is **not on the allowlist**).

### Crosshair (no native event — direct callback hook)

`chart.js` does **not** emit a `crosshairMoved` window event. It calls `this.broadcastCrosshairSync(timestamp, price)` directly from `updateCrosshair` (line ~18277) when `_crosshairPanelSyncAllowed()` returns true.

> **Bridge integration**: the bridge **monkey-patches** `chart.broadcastCrosshairSync` to forward to `postMessage` and stub the legacy `panelManager`-dependent path. See `sync-bridge.js → installCrosshairBridge`.

`chart.js` already drops `price` for cross-pair scenarios (line ~20518: `samePair ? candleData : null`) — perfect for our allowlist.

The `hideCrosshair` (line ~18359) path is similarly hooked; it sends `crosshair-clear`.

---

## 2. Methods the bridge calls (inbound, applying parent sync)

These are the ONLY chart methods the bridge is allowed to call from outside.

### `chart.receiveCrosshairSync(timestampMs, priceOrNull, sourceCandleOrNull)`
- **Where**: line ~20530.
- **What**: positions chart's crosshair at the bar whose open time is `<= timestampMs`. Does **not** touch price axis. Hides crosshair if `timestampMs === null`.
- **Bridge usage**: pass `time * 1000` (ms), `price = null`, `sourceCandle = null` (we never share OHLC across charts).
- **Verified**: source code does not assign to `this.priceScale.*`, `this.priceZoom`, `this.priceOffset`, `this.manualRange`, or `this.autoScale` along this path (read-only crosshair geometry).

### `chart.setTimeframe(tf)`
- **Where**: line ~11246.
- **What**: changes the chart's timeframe. **NOT a sync event** — only triggered by per-chart user action. Each chart owns its timeframe per Decision 1.
- **Bridge usage**: only called in response to a per-chart UI control, never from a peer's sync message.

### `chart.jumpToTimestamp(timestampMs, opts)`
- **Where**: line ~11083.
- **What**: jumps the visible window so that `timestampMs` is centered (or close to it).
- **Bridge usage**: used to position visible-range center; `opts = { skipWindowFetch: true, showLoadingOverlay: false }`.

### `chart.scheduleRender()` / `chart.render()`
- **Where**: line ~12242 / ~12401.
- **What**: triggers an internal redraw. Recomputes everything from current state including the price axis (when `autoScale === true`, which is the default).
- **Bridge usage**: called after applying inbound visible-range to ensure price axis recomputes from chart's own visible candles.

### Visible range — synthesized helper

`chart.js` does not expose a `setVisibleTimeRange(start, end)` method. The sandbox bridge synthesizes one in `sync-bridge.js`:

```js
function setVisibleTimeRange(chart, startSec, endSec) {
    // 1. Center the chart on midpoint (uses jumpToTimestamp; respects existing API)
    // 2. Adjust candleWidth so (end - start) seconds span the visible canvas width
    // 3. Force autoScale true so price axis recomputes from the now-visible candles
    // 4. scheduleRender()
    // EXPLICITLY does not touch priceScale.min/max, priceOffset, priceZoom, manualRange.
}
```

Implementation lives in `sync-bridge.js` and is the **only** path that adjusts time-axis presentation from outside.

---

## 3. Forbidden price-axis methods / properties (Step 1.2 guards)

The sync layer **must never** read from a peer's chart and call any of the following on a recipient. These are price-axis-mutating from-outside; doing so would re-introduce the original bug class.

| Property / method | Location | Why forbidden |
|---|---|---|
| `chart.priceScale.min`, `chart.priceScale.max` | line ~236-245 | Direct price-axis range. Each chart computes from its own visible candles. |
| `chart.priceScale.autoScale` | line ~241 | Sync must never disable autoScale on a peer. |
| `chart.priceScale.mode` ('linear' / 'log') | line ~239 | Per-chart user choice. |
| `chart.priceZoom`, `chart.priceOffset` | line ~182-184 | Vertical zoom and pan — chart-local. |
| `chart.manualCenterPrice`, `chart.manualRange` | line ~188-189 | Manual-mode price range. |
| `chart.autoScale` | line ~186 | Top-level autoScale flag. |
| Direct DOM mutation of `chartCanvas` width or vertical scroll | — | Causes `fitToView` to use stale dimensions; price-axis inherits stale state. |

### Runtime guards (`engine-api-guards.js`)

The bridge installs runtime guards in dev mode. Strategies:

1. **Snapshot-and-assert wrapper** around inbound sync application. Before applying, snapshot:
   ```js
   const snap = {
     priceMin: chart.priceScale.min,
     priceMax: chart.priceScale.max,
     autoScale: chart.priceScale.autoScale,
     priceZoom: chart.priceZoom,
     priceOffset: chart.priceOffset,
     manualCenterPrice: chart.manualCenterPrice,
     manualRange: chart.manualRange
   };
   ```
   The visible-range sync may legitimately change `priceMin`/`priceMax` because the chart auto-fits to its own NEW visible candles. The crosshair sync **must not** change any of them. The guard asserts the right invariant per sync type.

2. **postMessage envelope filter**: `FORBIDDEN_SYNC_FIELDS = ['priceMin', 'priceMax', 'autoScale', 'priceZoom', 'priceOffset', 'manualCenterPrice', 'manualRange', 'mode', 'scaleType']`. Any outbound message whose flat field set intersects this list is dropped (and throws in dev).

3. **No proxy on `chart.priceScale`**: chart.js writes to `this.priceScale.min/.max` constantly during render (legitimate), so a Proxy that fires on every write would either be a no-op or break the chart. The guard relies on the snapshot-assert pattern instead.

### Verifying the guards work

`engine-api-guards.js` exports `runGuardSelfTest(chart)` which:
- Tries to call `chart.receiveCrosshairSync(time, fakePrice = 99999)` and asserts `chart.priceScale.min` is unchanged.
- Tries to send a forbidden field via the bridge and asserts it's dropped + logged.
- Returns a pass/fail report.

The `multichart-shell.html` "Run guard self-test" button invokes this in every iframe and reports the aggregate.

---

## 4. State the bridge maintains

```js
// per iframe
const bridgeState = {
    chartId: 'chart-A',                  // assigned by parent at bridge-config time
    appliedCausationIds: new RingBuffer(16),   // loop guard
    syncTickCounter: 0,
    lastSnapshot: null,                  // for assert-after-apply
};
```

The `appliedCausationIds` ring buffer is the loop-guard primitive. When the bridge is about to forward an outbound event, it checks: was this caused by a sync we just applied? If yes, drop. If no, forward with a fresh `causationId` and add to the buffer.

---

## 5. Quick reference — allowed surface

| Direction | Allowed |
|---|---|
| **Read from chart** | `chart.currentTimeframe`, `chart.currentSymbol`, `chart.data[].t`, `chart.priceScale.min/max` (read-only — for assertions only). The visible time range from `chartScrolled.detail.startTimestamp / timeSyncEndTimestamp`. |
| **Write to chart** | `chart.receiveCrosshairSync(time, null, null)`, `chart.setTimeframe(tf)` (per-chart UI only), `chart.jumpToTimestamp(time, opts)`, `chart.scheduleRender()`. The synthesized `setVisibleTimeRange(chart, start, end)` helper. |
| **Forbidden** | All entries in §3. |
