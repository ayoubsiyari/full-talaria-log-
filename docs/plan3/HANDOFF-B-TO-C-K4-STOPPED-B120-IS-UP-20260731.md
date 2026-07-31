# Handoff B → C: the window-claim hang is stopped, b120 is live, your 10x run is unblocked

**2026-07-31 ~13:50Z · Manager B**

## Short version

You were right and I was wrong twice. The path did hang, and my first fix did not stop it. It is
stopped now on **b120**, which is live. **Re-run the 10x measurement.**

## What was actually wrong

Not the claim endpoint, not the client. Blocking database and file work on the **event loop**, on
the chart's hot path.

`auth_middleware` is `async def` and called the window-presence gate, which opens a SQLAlchemy
session and queries. Behind that gate, nine handlers were declared `async def` with bodies that
never `await` — `get_tile`, `get_tile_meta`, `get_file_candles`, `get_file_smart`, `get_file_bars`,
`get_file_meta`, `get_file`, `get_conversion_status`, `get_trading_session_state`. Each does a pool
checkout, DB queries, disk reads, and CSV parsing and resampling.

FastAPI runs `async def` handlers on the event loop. So one chart load made the worker unavailable
to **every** other request — not other tabs, not other users, not static assets. `gunicorn -w 2`
means there were two loops to lose. No console error and no server log, which matches your "cause
unknown; I'd rather say that than invent one" exactly. Your second CONF-01 session was not
contending for a lock, it was queueing behind a blocked loop.

## The numbers

`/api/health` touches no database, so under load it measures only whether the loop is available.
Equal-volume **ungated** load is the control. Concurrency 60, same probe, same host:

| build | gated p95 | vs ungated control | |
|---|---|---|---|
| b118 | 500.5 ms | 14.8x | the build your run died on |
| b119 | 341.2 ms | 7.4x | gate fixed — **still hung** |
| b120 | 148.7 ms | 3.6x | **live now** |

Note the gated arm carried far *less* traffic than the control (294 requests vs 5,381 on b120,
the rest rate-limited), so the pre-fix cost is understated by the ratio, not overstated.

## What you should know before you trust it

- **A residual 3.6x over the control remains** at concurrency 60. Gated requests do real DB and CSV
  work so some cost is expected, and the control is imperfect because most of its volume is cheap
  429s. If your 10x run is still disturbed, say so — I have not claimed a flat line.
- **I never reproduced a hang through the browser two-tab path**, on any build including pre-fix.
  If your symptom was in the tab rather than in server concurrency, then I have fixed a real defect
  that was not your defect, and I need to hear that.
- Kill-switch `TALARIA_DISABLE_WINDOW_GATE_THREADPOOL_V1` restores the gate half of the defect on
  the same build, if you want to see the difference yourself rather than take my table for it.

## Product checks, so you are not measuring a broken build

Nine hot-path endpoints changed scheduling, so I verified rather than assumed: `meta`, `bars`,
`candles`, `smart`, `tile-meta`, `conversion-status` all return **200** with real payloads in
24–60 ms; the gate still returns **409 `chart_window_kicked`** for an unclaimed and for a missing
window id; the three-tab reload/kick browser repro is clean on b120.

## Probes are yours if useful

`_evidence/manager-B/k4-window-claim/` — `prove-event-loop-stall.mjs` is the one that decided it
(gated vs ungated control, `/api/health` as the loop witness). `FINDINGS.md` has the full arc
including the three experiments that were green because they measured the wrong thing.

## Added 15:55 — WITHDRAWN: the browser table below is confounded, do not use it

C: the **server** table further up stands. The **browser** table immediately below does not, and I
am withdrawing it before you build anything on it.

The two arms were measured at different replay positions and the metric moves by the same factor
with position alone. On b120 by itself: **55.0 ms/s at 579 bars, 290–343 ms/s at 1,100–2,600 bars.**
My b118 arm sat at 798 bars and b120 at 579, so the gap is not attributable to the build. Restoring
the defect in place with the kill-switch also produced no measurable change.

This matters for your sweep directly: **if you use blocked-main-thread ms as a gauge, control for
how many bars are loaded, or the gauge will tell you about your dataset rather than your build.**
Bar count is not resettable server-side — `config_json` is `{}` and each run gets a fresh browser.

The `b120` build is still correct and live, and your 10x re-run is still unblocked.

## Added 14:45 — the freeze in milliseconds, measured at your speed

The table above is server-side. Since your run is what died, here is the same A/B measured as
**blocked main thread in the browser**, at **10x**, with 60 concurrent gated requests standing in
for the second session:

| | b118 | b120 |
|---|---:|---:|
| blocked main thread | **322.5 ms/s** | **55.0 ms/s** |
| share of wall clock blocked | 32.3% | 5.5% |
| longest single freeze | 452 ms | 261 ms |
| your load's requests completed in 30 s | 127 | 824 |

On b118 the main thread was gone for about a third of every second. That is what voided the 10x
point, and it is why the point sat exactly where the sweep needed it.

Probe is `_evidence/manager-B/k4-window-claim/main-thread-freeze.mjs` — parameterised by
`SPEED`, `WINDOWS`, `LOAD` and `MEASURE_MS`, so you can run your own speeds with it if you want
the freeze number alongside your paints/sec gauge.

**One caution for your re-run.** Two browser windows pointed at the *same* backtest session fight
over `/api/sessions/{id}/state` and only one advances — I hit this and it is not the K4 defect. Use
distinct sessions per window, or one window plus generated load, as I did.

## Commits

`6480f6cf0` gate off-loop · `6521c7ae2` handlers off-loop. Shipped as b119 and b120.
