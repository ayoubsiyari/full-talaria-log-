# CORRECTION — the leak is not dead. The PO's pack hypothesis is confirmed. (2026-07-29 13:50)

Supersedes the headline of `FINDING-LEAK-COLLAPSED-ON-B85-20260729-1340.md`. The measurements in
that document are correct; my conclusion from them was not.

## What happened

I called the leak dead on three cycles. The PO refused the call and ran three more.

| Cycle | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| b85 heap (MB) | 75 | 80 | 72 | 90 | 96 | **141** | 155 |
| delta | — | +5 | −8 | +18 | +6 | **+45** | +14 |

Growth is flat for three cycles and then resumes hard. Total is +80 MB over six cycles, ~13 MB per
cycle, against b82's ~55. We killed roughly three quarters of the leak and I mistook a plateau for
a floor.

**My error was methodological, not arithmetic.** I treated a sign reversal at cycle 2 as proof of
noise, when it only ever proved that *one* retainer had stopped. A pack of retainers with different
fill thresholds produces exactly this curve, and I had no basis to exclude that. Three points cannot
distinguish a floor from a plateau, which I wrote down as a limit in the same document and then
argued past anyway.

## The PO's hypothesis, adopted

> "it is not one monster, it is a pack of small little monsters, you killed few of them thats why we
> got better results than yesterday"

This is now the working model, and it fits the evidence better than anything I proposed. It also
retroactively explains the four refuted hypotheses of the last two days: the bar store, the
symbol/timeframe caches, the parent-side panel state and the engine graph were each *a* retainer,
so each looked promising, and each individually failed to stop the leak. We were not wrong four
times. We were right four times about members of a set, while asserting each was the set.

Promote **LEAK-01**: when a suspect is killed and the symptom shrinks but does not stop, the
default conclusion is an additional retainer, never a failed fix. Attribution requires a bisect,
not an argument.

## Why the curve is lumpy — the leading candidate

The jump is at cycle 5, not cycle 1. Something fills before it spills. A cache with a capacity or
a threshold behaves this way; a per-panel object graph does not.

A's `LEAK-B` — dropping CSV and raw response text from the smart cache after ingest — is the
strongest match, because C's heap census named `ExternalStringData` as the top growing constructor,
which is network response bodies and script source text. **`LEAK-B` is merged on A's branch and was
not in b85.** Nor were `LEAK-A` (panel-only ownership on shared host caches) or `LEAK-D` (same-pair
`fullRawData` copies on remaining aliases).

b85 therefore graded exactly one of the four shots A has built. The next build grades three more.

## Orders

- **B ships A's tip immediately as b86** — LEAK-A, LEAK-B, LEAK-D and the remediated FIX 1. Do not
  wait for a quiet moment; the PO is measuring live.
- **PO re-runs the six-cycle test on b86.** Six cycles minimum, never three. The three-cycle test is
  retired as an instrument: it cannot distinguish a plateau from a floor.
- **A keeps hunting** rather than standing down. The pack is not empty.
- **C grades independently.** C has now been silent for ten hours while four fixes shipped and a
  fifth build is about to. The automated gate exists and is not being run.

## Status

Memory returns to **canary blocker**. It was downgraded at 13:40 on my premature call; that
downgrade is withdrawn ten minutes later. The bounded-and-quantified framing still holds — 13 MB
per cycle is survivable in a way that 55 was not — but bounded is not fixed and the PO has ruled
that canary tests a leak-proof chart.
