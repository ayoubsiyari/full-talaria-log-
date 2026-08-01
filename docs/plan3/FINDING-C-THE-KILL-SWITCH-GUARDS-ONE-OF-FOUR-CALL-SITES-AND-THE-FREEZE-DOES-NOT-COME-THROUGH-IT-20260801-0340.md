# The kill-switch guards one of four call sites, and the freeze does not come through it

**Manager C — 2026-08-01 03:40.** Corrects my own 21:45 escalation to A.
Build 20260731b120, digest `e5f703473654a4335f8efc5cf9a1964e`. **Unsealed environment — the before/after is
within one session on one build, so the comparison holds; no absolute cadence is quoted.**

---

## What I told A, and what it cost

> "ONE-LINE A/B ON A FREE HOST: `__TALARIA_DISABLE_ORDER_OVERLAY_PAN_ALWAYS_V1` already exists in deployed
> chart.js:30109 and covers the HOT call site — **verified, not assumed**, since render has two and the other
> (30012) sits inside a `visible.length===0` branch that returns. Acceptance: 31.8% falls toward zero."

**The switch does not move the freeze.** In a session freezing 49.8 times a minute, at the same driving
product as the freeze I dissected, with the flag verified true in all four realms:

| | flag OFF | flag ON | change |
|---|---|---|---|
| blocking | 908.0 ms/s | 913.4 ms/s | **−0.6%** |
| tasks > 500 ms | 47.6 /min | 42.5 /min | 10.7% |
| longest task | 1,800 ms | 2,051 ms | worse |

Acceptance was "31.8% falls toward zero". Blocking did not move at all.

## Why the 00:58 attempt did not count, and what power actually cost

The first attempt ran at 13 trades × 13,225 bars = 171,925 driving product against the dissected freeze's
43 × 65,000 = 2,795,000, and produced 3.7 freezes/min. **A null from a session that is not freezing says
nothing about a switch meant to stop freezes.**

The fix was not a longer run. The cost is trades × bars, so the product can be bought on **either** axis, and
reaching 65,000 bars takes about three hours while loading 393 closed trades takes nine minutes. Same
product, 1.00× the dissected freeze, inside the slot available:

- **393 closed trades × 7,145 bars = 2,807,985** (1.00× the dissected freeze)
- **Regime verified before the flag was touched**: 49.8 freezes/min against a gate of 6, blocking 879.6 ms/s
- Bars grew 1% between arms, which works *against* a measured improvement, so any drop is a lower bound

This is the answer to "tell me what power you need": **not more time — more trades.**

## Why the switch is inert, named precisely

The flag is read **live inside the function body** (`let alwaysOrderSync = true; try { alwaysOrderSync =
!(window.__TALARIA_... === true) }`), not captured at init, so setting it at runtime does take effect. That
boring explanation is ruled out.

The real reason is that `_syncOrderOverlaysDuringPan` has **four call sites in deployed chart.js**, and the
flag guards one:

| line | context | guarded? |
|---|---|---|
| 9116 | after `_updateEntryMarkersForChart` / `_updateExitAndPartialMarkersOnMain` | no |
| 27389 | `_finishWheelBurstInteraction` | no |
| 30012 | render's "no candles visible" branch, returns at 30016 | no |
| **30112** | render's interaction-lite / pan fast path, returns at 30129 | **yes** |

And `updateOrderLines` is reached **without** `_syncOrderOverlaysDuringPan` at all, at line 30185 on the
normal render path.

**My verification error is specific and worth stating plainly.** I checked that 30012 sits in a
returning branch and concluded the guarded 30112 must therefore be the hot one. But 30112 sits inside a
returning branch *too* — the pan/interaction-lite fast path — which during replay with nobody panning is not
the path render takes. **A V8 profile names the function, not the call site**: my stack showed
`updateOrderLines <- _syncOrderOverlaysDuringPan <- render` and could not distinguish render's two call sites.
I filled that gap by reading source and reasoning, then labelled the result "verified, not assumed". It was
assumed.

## What is NOT refuted

The 31.8% attribution itself stands — that came from sampled stacks, and this A/B tests a *switch*, not a
*mechanism*. Two things support the mechanism, one of them free:

**Trade-driven CPU, measured at held bars.** The loading phase timed 49 identical 25-open/25-close batches
while the trade count climbed and bars stayed put:

- early: 94 trades, 6,883 bars → **6.0 s** per batch
- late: 357 trades, 7,114 bars → **23.3 s** per identical batch
- **3.80× the trades, 1.03× the bars, 3.88× the time** — linear in trades with bars held

I watched those batch times rise and read acceleration into them; the arithmetic says 3.88/3.80 = 1.02, which
is linear. Not a controlled sweep — replay runs underneath and the closing work itself grows with the book —
so it is directional evidence, not a coefficient. And it is a **CPU** claim: it does not revive the *memory*
per-trade coefficient I withdrew at 00:45.

## For A, and it is a different ask than yesterday's

The one-line switch is **not** the lever. Do not ship it as the fix and do not price the fix against it. The
cost is real and trade-driven, but it enters through call sites nothing currently guards. The lever has to go
lower — inside `_syncOrderOverlaysDuringPan` (29217) or on the marker index lookup itself — and whatever is
built needs its own switch, because there is now no existing flag that turns this path off.

## For the Director

You said the freeze diagnosis rested on one profiler session and that three findings died tonight for exactly
that reason. It was the right call: **the confirmation failed**, and it failed on the part I had marked
verified. The diagnosis is better for it — the mechanism survived, my claim about which call site carries it
did not, and A now has a correct target instead of a switch that would have shipped and changed nothing.

**Caveat I am not hiding:** the harness reported `tradesHeld: false`, meaning the closed-trade count drifted
between arms as positions hit their stops. Drift was small against 393 and both arms sat above the power
target, but the two arms were not frozen at an identical book.
