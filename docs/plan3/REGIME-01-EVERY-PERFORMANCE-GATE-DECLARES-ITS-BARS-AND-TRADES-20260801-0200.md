# REGIME-01 — every performance gate declares its bar count and trade count

**From:** Manager B
**Date:** 2026-08-01 02:00
**For:** D, E, A, C — anyone filing a performance gate
**Helper:** `_evidence/manager-B/k4-window-claim/regime-stamp.mjs` (one import, one call)
**Related rows:** LAG-ZT (zero-trade lag), MONSTER-2

---

## The requirement

**A performance gate is not readable without the regime it was measured in. Declare bars and trades, or
the gate cannot be reproduced, compared, or trusted to have failed for the reason it says.**

The single-sentence justification: C measured `_chartIndexForCloseMarkerOnChart` at **31.8% of a freeze**
on a 43-trade session; the same function takes **zero calls** in my zero-trade session. Two honest
measurements, two different workloads. A fix aimed at either regime **reads as a null result when it is
verified in the other**, and a null result is exactly how a real fix gets reverted.

This is not hypothetical bookkeeping — it already happened twice in one evening, in both directions:

| | C's regime | B's regime |
|---|---|---|
| `_chartIndexForCloseMarkerOnChart` | 31.8% of freeze | **0 calls** |
| `_resampleDataFull` | 2.2% of freeze | 8.5% of occupancy |
| bars / trades | 65,000 / 43 | 6,767 / **0** |

Each of us could have used the other's number to close our own defect, and each of us would have been
wrong.

## The stamp

Copy this into every gate artifact. `regime-stamp.mjs` emits it from a live page so nobody has to
assemble it by hand:

```
---------------- REGIME-01 DECLARATION ----------------
regime            ZERO-TRADE (LAG-ZT)  |  TRADE-BEARING (n)
trades            <count>  (which field it came from)
bars (resident)   <chart.data.length>   raw <n>   file <n>
timeframe         <tf>
indicators        <count>
speed nominal     <setting>
speed ACHIEVED    <events/s>        <- not the same thing as nominal
long tasks        <n>/s over <n> s
repeats           <n>
build             <build id>
rasteriser        <UNMASKED_RENDERER_WEBGL>
viewport          <WxH> @ dpr <n>
heap              <MB>
-------------------------------------------------------
```

Fields it cannot determine come back as **`UNKNOWN`**, deliberately. An omitted field reads as "not
applicable"; `UNKNOWN` reads as "nobody checked". Those are different claims and the difference has cost
us a day.

## Four fields that look like padding and are not

**`trades`** — the whole point. Zero is a *value*, not a missing field, and it is what makes a gate a
LAG-ZT gate.

**`bars (resident)`** — `chart.data.length`, not the file size. The file here holds 28,859 bars while a
replay may have 600 resident. The costs that scale track resident bars.

**`speed ACHIEVED`, separately from nominal** — this is the one people will want to drop, and it is the
one that has already produced a wrong answer. A derived 62.5 events/s put a mechanism at 27% of the
budget; the measured rate in the same nominal configuration is **7.87/s**. The nominal speed is what the
scheduler is *asked* for. The achieved rate is an **output of the system under measurement**, it differs
per host and per bar count, and it cannot be carried between configurations. If your gate converts a
per-event cost into a rate, this field *is* your conversion factor.

**`rasteriser`** — read, never assumed. I asserted a SwiftShader caveat across everyone's paint
conclusions; C read the string and found an RTX 4060. The canary host is software-rasterised, C's machine
is not, and a paint number without this field cannot be compared with either.

## REGIME-01, as I understand the acceptance bar

A fix greens a freeze-cadence oracle **in both regimes** before "solved" is recorded. Practically, that
means each fix ships with two stamped runs — one zero-trade, one trade-bearing — and both are declared
even when only one moved. **A fix that moves only its own regime is not failing REGIME-01; it is passing
with a declared scope.** What fails REGIME-01 is a fix recorded as "solved" on one arm with the other arm
unmeasured, because that is the one that returns as a tester ticket.

If a fix genuinely cannot move the other regime — mine cannot touch marker resolution, since my session
calls it zero times — say so in the stamp and let the other regime's owner gate their own. Silence there
is what makes two correct fixes look like two failures.

## How to get the numbers without building anything

The authenticated route and a journal-bearing session are already proven and documented in
`HANDOFF-B-TO-D-AUTHENTICATED-ROUTE-IS-PROVEN-20260731-1830.md`:

- module `_evidence/manager-B/m20-j1/talaria-auth-route.mjs` — `login()`, `openBacktest()`
- **zero-trade regime:** session 936 / file 677 as it stands — 0 orders, confirmed by 0 calls to
  `_chartIndexForCloseMarkerOnChart` in 30 s
- **trade-bearing regime:** ask C for the 43-trade session; I have not stamped one myself and will not
  guess at its identifiers
- **bar count is settable:** `replaySystem.goToReplayTimestamp(startTs + bars*60000*1.04)` moves in both
  directions. `startReplayAtIndex()` **truncates** `rawData` and can only drive the position down — it
  silently lands short and a harness that does not assert the landing will invent its own x-axis. Mine
  did exactly that before I caught it.

## What I owe against this myself

My own filed gates are not stamped to this standard, and I am not exempting the person who wrote the
requirement. Retro-stamping mine is on my list behind the 04:00 window. Two are already known to need it:
the MONSTER-2 bar-scaling finding, and the 87 ms definition — both were measured zero-trade without
saying so, which at the time I did not know was a distinguishing fact about them.

## Confidence

- [verified] the 31.8%-versus-zero-calls contrast, from C's filed profile and my own instrumented run.
- [measured] achieved 7.87 events/s against a nominal 10x, twice.
- [verified] `startReplayAtIndex` truncates `rawData`; `goToReplayTimestamp` does not — both observed.
- [inferred] my reading of the REGIME-01 acceptance bar in the section above. If the intent is stricter —
  that a fix must *move* both arms rather than *declare* both — say so and I will correct this document,
  because D and E will build against whichever version is written down.
