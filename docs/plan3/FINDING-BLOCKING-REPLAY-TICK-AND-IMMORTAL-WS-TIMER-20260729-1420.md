# FINDING — the lag is a 95ms synchronous replay tick; plus an immortal WebSocket ping timer (2026-07-29 14:20)

Source: PO console capture on b85, single chart, 2 indicators, 60x replay, heap sampled every
10–20s. This one test produced more mechanism evidence than the last two days of heap snapshots.

## 1. THE LAG — `setInterval` handler taking 55–95ms (high confidence, actionable now)

Browser-reported, three times in one short session:

```
[Violation] 'setInterval' handler took 55ms   replay-system.js
[Violation] 'setInterval' handler took 95ms   replay-system.js
[Violation] 'setInterval' handler took 82ms   replay-system.js
```

Mechanism, read from source at `replay-system.js:4548`:

```js
this.playInterval = setInterval(() => {
    ...
    this._runCandlePlaybackTick();     // fully synchronous
}, interval);
```

`_runCandlePlaybackTick()` runs to completion synchronously inside the timer callback. At 60x the
scheduled interval is a few milliseconds; the handler is taking 55–95ms. **Each tick overruns the
next by an order of magnitude.** The main thread is saturated by design, the event loop never
drains, and rendering, input and everything else queue behind it.

This is the lag. It is also the obvious candidate for the unexplained single-chart 111% CPU at 60x,
which has been unowned for a day.

### Why this reframes two earlier conclusions

- **FIX 2 (allocation reuse) was correctly cancelled.** A measured GC overhead at 0.258%. The PO's
  heap sawtooth here (140→254→176→224) confirms it: replay churns hard but memory is returned. The
  lag was never GC pressure.
- **FIX 1 (background-panel render cadence) does not address this.** FIX 1 reduces paints in
  *non-focused multichart panels*. This measurement is a **single chart**, focused. FIX 1 remains
  worth shipping and is not the fix for this.

### The shape of the correct fix

Do not simply lower the tick rate — that changes replay semantics. The tick must stop being an
unbounded synchronous unit of work. Options for A to evaluate and choose between, with the
measurement deciding, not preference:

1. Budget the tick: process candles until a wall-clock budget (e.g. 8ms) is spent, yield, continue
   on the next frame. Preserves throughput, bounds blocking.
2. Split compute from paint: advance state per tick, paint on rAF at display cadence. Painting at
   60x is wasted work no human perceives.
3. Batch at high speed: above some multiplier, advance N candles per tick and paint once. A fast
   path of this shape already exists (`updateChartDataFast`); determine why it is not covering this.

Whichever is chosen must sit behind a kill-switch and be graded by the same
`[Violation]` disappearing from the console under identical conditions — a cheap, direct oracle we
did not have before.

## 2. THE IMMORTAL TIMER — support WebSocket ping (confirmed defect, small)

PO observation: `WebSocket is already in CLOSING or CLOSED state` repeats, "usually appear when we
keep the chart browser as a background for a while, and then it appeared again while we were
testing."

Source, `TalariaV8bLive.jsx`:

```js
// 15102 — created on open, no readyState guard
supportPingTimerRef.current = setInterval(() => { try { ws.send(JSON.stringify({type:"ping"})); } catch {} }, 30000);

// 15142 — close handler nulls the ref but never clears the timer
ws.onclose = () => { if (supportWsRef.current === ws) supportWsRef.current = null; };
```

`supportDisconnectWs()` (15087) does clear the timer, but it is only called from two places
(15093, 15274) — neither is `onclose`. When the browser closes the socket on its own, which is
routine for a backgrounded tab:

- the interval **keeps firing every 30s forever**,
- its closure **permanently retains the dead WebSocket**, which can never be collected,
- and each fire throws, producing the console error the PO sees.

### Magnitude — do not oversell this

A timer firing twice a minute **cannot** account for the 18.8% idle CPU measured on a backgrounded
tab. This is not that monster. It is a genuine permanent leak of one socket plus one timer, and a
confirmed source of the console spam. Its real value is that it names a **class**: a timer that
outlives the resource it services. Given the pack model, that class deserves a sweep — every
`setInterval` and `setTimeout` chain must be checked for an owner that dies before it does.

### Fix

Three lines, behind a switch: guard the send on `ws.readyState === WebSocket.OPEN`, clear the
interval when it is not, and call `supportDisconnectWs()` from `onclose`.

## 3. Heap behaviour — churn, not leak, on single chart

140 → 167 → 213 → 227 → 254 → 200 → 176 → 224 → 216 MB.

Peak-to-trough ~80 MB, recovering repeatedly. Single-chart replay is allocation-heavy but does not
accumulate. **This is a different phenomenon from the multichart cycle leak** (13 MB/cycle on b85,
six-cycle PO run) and must not be conflated with it. No action; recorded so the next person does
not re-investigate it.

## Orders

- **A:** the blocking tick is now the top performance item, above remaining leak shots. It has a
  direct oracle (the `[Violation]` line) and explains both the felt lag and the CPU ceiling.
- **Owner of `TalariaV8bLive.jsx`:** the WebSocket timer fix, then a sweep of the timer-outlives-
  owner class.
- **C:** when it resumes, add a hot-path gate asserting no `setInterval` handler exceeds a budget
  during replay. Browser violations are free evidence we have been ignoring.
