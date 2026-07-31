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

---

## Added 17:25 — two instrumentation notes for CONF-05, and drop the load condition

Separate finding published at `docs/plan3/FINDING-LAG-SCALES-WITH-BARS-LOADED-20260731-1720.md`.
Two things in it change what you should instrument tonight.

**1. You do not need my 60-request load.** I filled the missing cell. Many bars with *no* artificial
load reads 312.6 / 318.4 / 322.7 ms/s at 2,761 / 2,981 / 3,197 bars — indistinguishable from the
302-343 I measured *with* 60 concurrent requests. The load contributes nothing once bars have
accumulated. Your four-panel zero-trade soak is already the right condition; don't add traffic.

**2. Do not gauge this on total blocking time alone.** Blocked ms/s moves 5.8x between my low-bar
and high-bar regimes, but blocking contributed *per task* is flat (35.8-37.5 ms) and p95 task
duration actually *falls* (187 -> ~100 ms). The rise is entirely in long-task **frequency**, 1.5/s
to 8.6/s, roughly one per bar. The witness with no 50 ms threshold — timer lateness — moves only
**1.5x** at p95. So record long-task count and timer lateness separately. A soak reporting only
total blocking time will overstate the severity by about 4x, and that number would be the one a
BUDGET-01 row got built on.

**The prediction, so tonight is falsifiable rather than open-ended:** blocked main thread rises with
bars loaded and plateaus around a third of wall clock, no artificial load required. Plot against
**bars loaded**, not only wall clock — the missing bars axis is exactly why I misattributed this to
a build. If it does not rise, the relationship belongs to my setup and you have shown that cheaply.

If you can vary zoom, one extra cell kills or confirms the mechanism: the plateau should scale with
candles **visible**, not candles **loaded**.

**3. Your four panels will not fit inside the QA account.** `qa-canary@talaria-log.com` has
`max_sessions = 2`. A four-panel run evicts two panels by design and their charts stop dead, which
looks exactly like a freeze — it cost me a full run before I recognised it was the cap working
correctly. Raise the cap before the soak and put it back after. If you use my
`run-freeze-arm.sh` it now does that itself on any exit path, including being killed.

**4. Plateau confirmed wider and on a quiet host.** Flat across 1,930-4,193 bars, n=11: mean
319.2 ms/s, sd 10.9 (3.4% of mean), correlation of bars against blocked ms/s 0.018, fitted slope
0.00025 ms/s per bar — 0.6 ms/s across the whole 2,263-bar span. I also re-ran the no-load cell
after killing an orphaned probe of mine and letting loadavg fall from 12.13 to 1.23: 310.2 / 318.9 /
327.9 ms/s, unchanged. Host load is not the driver.

One number from the same runs that bears on your capacity work rather than mine: **a single replay
tab at 10x drives the chart container to ~85% CPU** on an otherwise quiet host.
