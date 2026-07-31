# K4 — window-claim P0: the hang, found and stopped

**2026-07-31 · Manager B · b118 → b119 → b120**

## The bar

The Director's acceptance was **the hang stopping, not a marker appearing**. I reported this fixed
once with all four markers on the wire while the hang survived, which is why TEST-02 exists. So:
reproduce first, fix second, prove with the same probe.

## What the hang actually was

Not the claim endpoint, and not anything on the client. **Blocking database and file work running
on the event loop, on the chart's hot path.**

`auth_middleware` is `async def`. It called the window-presence gate, which opens a SQLAlchemy
session and queries — a blocking pool checkout on the loop thread. Worse, nine handlers behind
that gate were declared `async def` with bodies that never `await`:

```
get_tile_meta   get_tile        get_conversion_status   get_trading_session_state
get_file        get_file_smart  get_file_candles        get_file_bars   get_file_meta
```

Each does a pool checkout, DB queries, disk reads and — for the candle paths — CSV parsing and
resampling. FastAPI runs `async def` handlers on the event loop, so **loading a chart made the
worker unavailable to every other request**: not other tabs, not other users, not static assets.
The service runs `gunicorn -w 2`, so there are only two loops to lose. No console error, no server
log. That is the symptom exactly as C reported it, and it is why a 10x measurement was void.

The previous pass made `chart_window_claim` a sync `def` for precisely this reason, verified that
endpoint, and closed the ticket. It fixed one site and missed the rest.

## The measurement

`/api/health` touches no database. Under load it measures one thing: whether the event loop is
available. Equal-volume **ungated** load is the control, so this cannot be confused with general
load. Concurrency 60, same host, same account, same probe throughout.

| build | idle | ungated control p95 | **gated p95** | ratio | probe verdict |
|---|---|---|---|---|---|
| b118 — pre-fix | 4.8 ms | 33.9 ms | **500.5 ms** | 14.8x | `STALL_CONFIRMED` |
| b119 — gate off-loop | 4.4 ms | 46.3 ms | **341.2 ms** | 7.4x | `STALL_CONFIRMED` |
| b120 — handlers off-loop | 4.1 ms | 41.1 ms | **148.7 ms** | 3.6x | `NO_STALL` |

The gated arm was rate-limited to far fewer requests than the control (294 vs 5,381 on b120), so
the gated path was doing **less** traffic and still costing more — which makes the pre-fix reading
worse than the raw ratio suggests, not better.

**b119 is the important row.** The gate fix was real, shipped, marker on the wire — and the hang
survived. Had I stopped at "marker present" I would have filed the same false green a second time.
The probe is what caught it.

## Why the green counts

The instrument is not blind: **the same probe fired RED twice today on this host** and went green
only after the second fix. It responded monotonically to two successive changes.

The fix also carries a kill-switch, `TALARIA_DISABLE_WINDOW_GATE_THREADPOOL_V1`, which restores
the inline gate call so the defect can be put back on the same build.

## Not overclaimed

A residual **3.6x** over the ungated control remains at concurrency 60. Gated requests do real
database and CSV work, so some cost is expected, and the control is imperfect because most of its
volume is cheap 429s. The probe's threshold no longer trips and the p95 fell 3.4x, but I am not
claiming a flat line.

I also **did not** reproduce a hang through the browser two-tab path on any build — that route was
green on b118 before the fix. The hang lives in server concurrency, not in the tab.

## The product still works

Nine hot-path endpoints changed scheduling, so behaviour was verified, not assumed:

- `meta`, `bars`, `candles`, `smart`, `tile-meta`, `conversion-status` — all **HTTP 200** with real
  payloads (bars returns actual OHLC), 24–60 ms.
- The gate still gates: an unclaimed window id and a missing window id both get **409** with
  `chart_window_kicked`.
- Browser repro re-run on b120: three tabs, reload, kick — all responsive, kick fires correctly.

## Commits

| sha | what |
|---|---|
| `6480f6cf0` | window gate off the event loop (`K4-P0-WINDOW-GATE-THREADPOOL-V1`) |
| `6521c7ae2` | nine gated handlers off the event loop (`K4-P0-BARS-OFF-LOOP-V1`) |

Shipped as **b119** and **b120**; b120 is live.

## What I got wrong on the way

I spent four experiments on the client and on claim contention before finding this, and three of
them were green because they measured the wrong thing. The fix for the first half was **already
written and uncommitted in my tree** from before the editor crash — I re-derived it instead of
checking `git status` on my own working tree first. That cost most of the cycle.
