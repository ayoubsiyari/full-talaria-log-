# Phase 0 — Foundational decisions

These decisions are the contract for the multi-chart rebuild. Anything outside the SHARED list MUST be architecturally incapable of crossing the boundary, not merely "we don't sync it currently."

The sandbox enforces this with **per-chart iframes** as the isolation boundary. Each chart has its own `window`, its own `window.chart`, its own canvas, its own `priceScale`. Cross-chart communication goes through `postMessage` only, and the message envelope schema acts as the allowlist (anything not in the schema cannot cross).

---

## Decision 1 — Sync allowlist

### SHARED between synced charts

| Field | Format | Notes |
|---|---|---|
| `instrument` (symbol) | string | When the user changes a chart's symbol, all peers switch. |
| `crosshair.time` | UTC Unix **seconds** (integer) | Time component only — never price. |
| `visibleRange.startTime` | UTC Unix **seconds** (integer) | Snapped per Decision 3. |
| `visibleRange.endTime` | UTC Unix **seconds** (integer) | Snapped per Decision 3. |

### NOT SHARED — each chart owns these independently

- Price-axis range (min, max)
- Price-axis auto-fit behavior (`autoScale`)
- Price-axis scale type (linear / log)
- Vertical zoom and price offset
- Timeframe selection (1m, 5m, 1h, 1d, …)
- Indicators on the chart
- Drawing tools / annotations
- Chart type (candlestick / line / bar / heikin-ashi / area)

### Enforcement

The `postMessage` envelope schema in `multichart-manager.js` and `sync-bridge.js` only declares the SHARED fields above. Any attempt to send a price-related field will be silently dropped at the bridge boundary (and logged in dev mode). See the `SYNC_MESSAGE_SCHEMAS` constant.

---

## Decision 2 — Canonical time format

**UTC Unix seconds (integer).**

Rationale:
- `chart.js` stores candle times as integers in `candle.t` already (see `TileManager._decodeBinary`: `view.getFloat64(off, true) | 0`). The `| 0` truncates to int, and the field is already in seconds at our backend.
- Some legacy paths internally use milliseconds (`normalizeTimestampMs`). All conversions to/from milliseconds happen **inside** chart.js. The sync bridge only ever exchanges seconds.

Conversion points:
- **Outbound (chart -> message)**: `sync-bridge.js` divides by 1000 if a millisecond value is detected (heuristic: `> 1e12`).
- **Inbound (message -> chart)**: `sync-bridge.js` multiplies by 1000 only when calling chart.js methods that expect milliseconds (`receiveCrosshairSync`).
- **Inside the bridge / parent / messages**: ALWAYS seconds, ALWAYS integer.

---

## Decision 3 — Snap-rounding rules

### Crosshair time

Lower TF -> Higher TF (e.g. 1m -> 1h):
- Floor to higher-TF bucket: `bucketTime = Math.floor(time / bucketSeconds) * bucketSeconds`.
- Example: 1m crosshair at `14:23:00` (UTC seconds = `..._4980`) -> 1h chart shows the `14:00` candle.

Higher TF -> Lower TF (e.g. 1h -> 1m):
- **Start of bucket** (deterministic, chosen via Phase 0 question).
- Example: 1h crosshair on the `14:00` candle -> 1m chart's crosshair lands on the `14:00:00` minute.
- We chose "start of bucket" over "last known position within bucket" because it is deterministic and side-effect-free; users who want fine-grained position will simply move the mouse on the lower TF chart.

### Visible time range

Visible range is `[startTime, endTime]` in seconds.

Lower TF -> Higher TF:
- `outStart = floor(startTime / bucketSeconds) * bucketSeconds`
- `outEnd   = ceil (endTime   / bucketSeconds) * bucketSeconds`

Higher TF -> Lower TF:
- `outStart = startTime` (no rounding — lower TF can show within the higher TF's first candle)
- `outEnd   = endTime`

Bucket sizes (seconds): `1m=60, 5m=300, 15m=900, 1h=3600, 4h=14400, 1d=86400`.

---

## Decision 4 — Sync topology

**PEER** (chosen via Phase 0 question).

- Any chart's user-initiated event syncs to **all** other peer charts.
- Programmatic updates (those that arrive over the sync bus) **do not** re-broadcast — see the loop guard in §Loop guard below.
- No designated "master" — adding/removing a chart never requires choosing a master.

### Loop guard

The bridge tags every outbound `postMessage` with:
```
{
  source: <iframe id>,           // who originated
  causationId: <uuid v4>,        // unique per user gesture
  syncTick: <int>                // monotonic counter, parent-assigned
}
```

The bridge tracks the most recent `causationId`s it has applied (LRU, last 16). When the chart fires an event whose `causationId` matches one we just applied, the bridge **drops it** before postMessage. This is identical in spirit to the "syncing" boolean flag pattern, but works across the iframe boundary where booleans are not shared.

Verification: 10 user crosshair movements on chart A must produce exactly 10 outbound messages (not 20+ from oscillation).

---

## Allowlist envelope schema (single source of truth)

```json
// crosshair sync (chart fires onCrosshair)
{
  "type": "crosshair",
  "source": "chart-A",
  "causationId": "uuid-v4",
  "syncTick": 42,
  "time": 1715252580        // UTC seconds, integer
}

// crosshair clear (mouse leaves chart)
{
  "type": "crosshair-clear",
  "source": "chart-A",
  "causationId": "uuid-v4",
  "syncTick": 43
}

// visible time range sync (chart pans/zooms)
{
  "type": "visibleRange",
  "source": "chart-A",
  "causationId": "uuid-v4",
  "syncTick": 44,
  "startTime": 1715248980,  // UTC seconds, integer
  "endTime":   1715284980   // UTC seconds, integer
}

// symbol change
{
  "type": "symbol",
  "source": "chart-A",
  "causationId": "uuid-v4",
  "syncTick": 45,
  "symbol": "AAPL"
}
```

Any `postMessage` whose `type` is not in {`crosshair`, `crosshair-clear`, `visibleRange`, `symbol`, `bridge-ready`, `bridge-config`, `chart-state`} is **dropped** by both sides and logged.

The fields `priceMin`, `priceMax`, `autoScale`, `priceZoom`, `priceOffset`, `timeframe`, `indicators`, `drawings`, `chartType`, `scaleMode` are **forbidden** in any sync message — see `FORBIDDEN_SYNC_FIELDS` in `sync-bridge.js`. Including any of them in an outbound message throws in dev mode and is silently dropped in prod.

---

## Documents to maintain

1. **This file** — the sync allowlist (Decision 1)
2. **This file** — canonical time format (Decision 2)
3. **This file** — snap-rounding rules (Decision 3)
4. **This file** — sync topology (Decision 4)
5. **`engine-api-audit.md`** — chart engine API audit (Step 1.2)
6. **`engine-api-guards.js`** — price-axis guard wrappers (Step 1.2)
