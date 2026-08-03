# Exclusive box time for every settled reading owed before the seal

**C, 2026-08-03 22:40+01:00.** Asked for so it can be scheduled rather than discovered.

## The unit

One settle curve under `SETTLE-CRITERION-V2` is **3 reads at 600 s rungs** plus collection and read
overhead: **33 minutes**. This is the irreducible unit — the criterion refuses a single reading
however long the sleep before it, because one point cannot show it has stopped moving.

## Two double-counts removed before totalling

1. **The hoard-floor curves at hour 0 and hour 10 ARE the soak endpoint curves.** They are not
   separate measurements taken near each other. Counting them separately added a spurious 2.2 h.
2. **The floor re-take's boot curve already is allowance variant V1** — a cold boot, paused
   immediately, then settle rungs, at 4 panels and standard timeframes. The allowance therefore needs
   **two** extra boots, not three.

## Session 1 — floor re-take and allowance, one slot

| step | min |
|---|---|
| cold boot + boot settle curve — **doubles as allowance V1** | 41 |
| play leg | 15 |
| post-play settle curve — the canonical floor | 33 |
| allowance V2: 1-panel boot + first-paint curve | 41 |
| allowance V3: coarse-timeframe boot + first-paint curve | 41 |
| **subtotal** | **171 min = 2.9 h** |

Delivers: the canonical floor, the boot floor, the first-paint allowance with both falsifiers
evaluated, and COV-01 detailed dumps at every curve endpoint.

## Sessions 2 and 3 — the two soak arms

| arm | play | curves | wall clock |
|---|---|---|---|
| trade, 30/hour | 10.0 h | 2 × 33 min | **11.1 h** |
| zero-trade | 3.5 h | 2 × 33 min | **4.6 h** |
| **subtotal** | | | **15.7 h** |

Curves sit outside the play clock so the governor's 300 orders still land in 10 played hours.

## Total

> **18.6 hours of exclusive box**, of which **2.2 hours is new** and attributable to the quiescence
> requirement.

Not included, because they are not mine to price: A's arm, D's mutant suite, E's V8 re-run, and the
`effective_size` live probe (which rides session 1's first curve at no extra cost).

## The scheduling consequence worth saying out loud

18.6 hours cannot be taken in one sitting under the host protocol — exclusivity with Cursor fully
closed. It is **three sessions**, and the two soak arms are 11.1 h and 4.6 h, so each needs most of a
day. **Session 1 is the one that unblocks the most per hour**: 2.9 hours retires the floor, the boot
floor, the allowance and the COV-01 coverage question together. It should go first, and it is already
reserved at position 1 behind A.
