# Talaria — Historical Data Loading & Chart Performance Architecture

**Purpose:** Fix the chart lag without buying servers, while keeping the *full* history (2010 → present) accessible for analysis at full fidelity.

**Audience:** Development team
**Status:** Proposed architecture / implementation plan

---

## 1. The problem (root cause)

The lag is **not** a server-capacity problem and will **not** be solved by adding servers or load balancing. With only a handful of users, it has been confirmed to come from two independent bugs in how data is accessed:

1. **No seek.** When a user starts a backtest in (e.g.) 2022, the system begins reading from the start of available history (2010) and works forward. It loads ~12 years of candles to display one screen.
2. **No release.** As the user keeps requesting candles, the chart holds and re-renders *every bar it has ever loaded* in the session, so it gets progressively heavier the longer the session runs.

Data size (~1GB/pair) is **not** the issue. 1GB on a properly indexed store is trivial. The issue is the *access pattern*: we read everything from the beginning, and we never let go.

---

## 2. The core principle

> **The chart should never hold more than ~500–2,000 bars for what is currently on screen — regardless of how wide the time range is. Only the *resolution* changes with zoom, not the amount of data on the wire.**

This is the single idea that makes full history feel instant (it is exactly how TradingView behaves):

- Zoomed out to see **2010 → today** → serve ~weekly bars (a few thousand points), **not** millions of 1-minute bars.
- Zoomed into **one morning in 2011** → serve 1-minute bars for just that morning.

Full 1-minute fidelity remains available *everywhere* the user drills in. Nothing is taken away from analysis — the user simply gets it faster, because the system **seeks** instead of scanning and **adapts resolution** instead of dumping everything.

---

## 3. Architecture overview

Five components, each fixing a specific part of the problem:

| # | Component | Fixes |
|---|-----------|-------|
| 1 | Time-indexed columnar storage | "No seek" — jump directly to any date |
| 2 | Pre-aggregated timeframes | Wide ranges return few bars, not millions |
| 3 | Bounded range + resolution API | Server returns only the visible window |
| 4 | Client-side sliding window | "No release" — memory stays flat while scrolling |
| 5 | Replay streaming | Smooth playback with no progressive slowdown |

---

## 4. Implementation steps

This can be rolled out **incrementally** — no big-bang rewrite. Each phase is independently testable.

### Phase 1 — Time-indexed storage

Move the 1-minute base data out of any "single file read front-to-back" format into a store that can seek directly to a timestamp.

**Options (pick based on team familiarity + ops appetite):**

| Store | Best for | Pros | Cons |
|-------|----------|------|------|
| **QuestDB** | Financial time-series specifically | Purpose-built for OHLC, fast ingest, simple SQL, low ops | Smaller ecosystem |
| **ClickHouse** | Maximum headroom | Blazing range queries, materialized views for aggregates, scales enormously | More ops/tuning |
| **TimescaleDB** | Teams already on Postgres | Familiar SQL, continuous aggregates, mature | Heavier than needed (fine at this scale) |
| **DuckDB + Parquet** | Read-heavy historical, minimal ops | Zero server to run, embeddable, excellent analytical reads, dead simple | Less suited to high-concurrency live writes |

**Recommendation:** For a small team with read-heavy historical data and occasional appends, **QuestDB** or **DuckDB + Parquet** are the lowest-friction strong choices. Choose **ClickHouse** if you want maximum long-term headroom.

**Action:**
- Load 1-minute base data, indexed/partitioned by `(symbol, timestamp)`.
- If using files (Parquet), partition by `symbol/year/month/`.
- Verify a query for an arbitrary date returns in milliseconds and scans only a small slice (not the whole table).

### Phase 2 — Pre-aggregated timeframes

Roll the 1-minute base **up once, ahead of time**, into higher timeframes and store them:

```
1m (base) → 5m → 15m → 1h → 4h → 1D → 1W
```

- ClickHouse: materialized views. Timescale: continuous aggregates. QuestDB: SAMPLE BY into stored tables. DuckDB/Parquet: precompute one Parquet set per timeframe.
- Aggregation rule per bucket: `open` = first, `high` = max, `low` = min, `close` = last, `volume` = sum.
- On new data arriving, append to the 1m base and update the higher timeframes incrementally (only the affected buckets).

### Phase 3 — Backend API (bounded range + resolution)

One endpoint that returns **only** the requested window, at a resolution that respects the bar budget.

**Request:**
```
GET /api/bars?symbol=CL&from=<unix_ms>&to=<unix_ms>&resolution=auto
```
`resolution` may be `auto` or an explicit timeframe (`1m`, `5m`, `15m`, `1h`, `4h`, `1D`, `1W`).

**Response:**
```json
{
  "symbol": "CL",
  "resolution": "1h",
  "bars": [
    { "t": 1640995200000, "o": 75.21, "h": 75.40, "l": 75.10, "c": 75.33, "v": 1820 }
  ]
}
```
When `resolution=auto`, the server picks the timeframe and **returns which one it chose**, so the client can label the axis.

**Resolution selection logic (the "bar budget"):**
```
TARGET_BARS = 800        // aim for this many on screen
MAX_BARS    = 2000       // never exceed
TIMEFRAMES_MIN = [1, 5, 15, 60, 240, 1440, 10080]   // 1m … 1W, in minutes

span_minutes = (to - from) / 60000
choose the FINEST timeframe tf where (span_minutes / tf) <= MAX_BARS
(prefer the one closest to TARGET_BARS without exceeding MAX_BARS)
```

**Worked examples:**

| Viewport | 1m bars (raw) | Chosen resolution | Bars returned |
|----------|---------------|-------------------|---------------|
| 2010 → today (~16y) | ~8.4M | 1W | ~835 |
| ~1 month | ~30–43k | 1h | ~700 |
| ~1 trading day | ~1,380 | 1m | ~1,380 |

The data on the wire stays roughly constant at every zoom level.

### Phase 4 — Client-side sliding window

This is what permanently kills the "gets heavier the longer you scroll" bug.

- Keep only the bars near the viewport **in memory and rendered** (e.g. the visible range plus a buffer of one screen on each side).
- As the user pans, fetch the adjacent range and **drop** bars that have scrolled far out of view (optionally keep them in a small LRU cache, but do **not** render them).
- Result: memory and render cost stay flat whether the user looks at one day or pans across fifteen years.
- If you use a charting library, enable its data-windowing/virtualization feature. If hand-rolled, implement viewport-based rendering.

### Phase 5 — Replay mode

Replay is the one mode that is genuinely 1-minute (the tick-simulation animation runs intra-bar).

- **Seek** to the chosen start date; load an initial buffer of 1-minute bars (e.g. 500 before the start for context + a forward buffer).
- As playback advances, **prefetch** the next chunk *before* reaching the end of the buffer (e.g. when 80% through), and **drop** bars far behind from the render.
- The tick-simulation animation runs only on the **current** bar, so its cost is negligible and constant.
- This keeps replay smooth indefinitely with no progressive slowdown.

---

## 5. Validation — how to confirm it's actually fixed

| Test | How | Pass condition |
|------|-----|----------------|
| **Seek** | Request a 2022 start | Server query scans a small slice, returns in ms — does **not** read from 2010 |
| **Zoom** | Zoom from 16y down to 1 day | Each request stays within the bar budget and returns quickly |
| **Scroll** | Pan across many years | Browser memory (DevTools → Memory) stays flat, not growing |
| **Replay** | Run a long replay session | No progressive slowdown over time |

---

## 6. What NOT to do

- ❌ **Do not add servers or load balancing for this.** It distributes *users* across machines; it does nothing for a per-user data-access problem. With this architecture, a single modest server (e.g. the 4-core / 16GB box) comfortably handles far more than 1,000 users.
- ❌ **Do not load "from the start of available data."** Every request must be bounded by a time range.
- ❌ **Do not send raw 1-minute bars for wide time ranges.** Always serve the resolution that fits the bar budget.

---

## 7. Summary

The fix is entirely in **data access**, not infrastructure:

1. Store data indexed by time so any date is instantly seekable.
2. Pre-aggregate timeframes so wide views return thousands of bars, not millions.
3. Serve only the visible window at a bar-budgeted resolution.
4. Window the client so memory stays flat.
5. Stream replay forward with prefetch + release.

This satisfies the requirement — full 2010-onward history, at full 1-minute fidelity wherever the user drills in — while making the chart fast and keeping infrastructure cost flat as the user base grows.
