# RULING — the leak hunt is not finished; the Director stops declaring monsters dead (2026-07-29 17:25)

The PO, without new measurements, said the orphan-listener kill would not be the end of it and that
my eagerness to call a win is not trustworthy. Checking our own evidence: the PO is right, and I can
name what is open.

## The pattern I need to stop

Today alone: I called the leak dead on three cycles and the PO's cycles four to six refuted it. I
reported C silent for ten hours when it was working. I named the bar store as the Hoarder and
retracted it. I accepted FIX 1's remediation and it shipped frozen panels. **Four premature
conclusions in one day, every one of them corrected by the PO rather than by me.**

The common shape is not bad analysis. It is that I treat the absence of a visible symptom as
evidence of a cure, and I do it at the exact moment when confirming would be cheap.

Promote **DECL-01**: **the Director does not declare a defect dead.** An instrument does, or the PO
does. My role is to say what is measured, what is unmeasured, and what would settle it. "Fixed in
code" and "fixed in the product" are different claims and must never be collapsed.

## What is actually still open — from our own data, not speculation

### 1. `workers: +1` per cycle — never assigned, never explained
C's scheduler census shows event listeners fully attributed (53 named of 53 — that part is clean)
but also records **`workers: +1` per multichart cycle**. A Worker created per cycle and never
terminated holds its **own separate heap**, invisible to main-thread heap accounting. Nobody has
been given this. It has sat in the evidence since 14:39.

### 2. The 111% single-chart CPU at 60x — assigned three times, worked zero times
`git log` across A and C returns **no commits** matching CPU, idle, or the ceiling. I have assigned
this repeatedly today and it has never been picked up. It is the only performance number we have
that is worse than a competitor by a wide margin and it remains uncharacterised.

### 3. The idle CPU floor of ~7.79% — untraced
A's ablation showed 13.12% measured, ~6.3pp of which was the profiler itself and ~0.17% the React
pumps. **That leaves roughly 7.79% unexplained on an idle chart.** We stopped looking when the rAF
loop turned out to be small.

### 4. LEAK-E through LEAK-J have never been measured
A authored ten leak shots. The PO's last six-cycle measurement was on **b85, which contained only
LEAK-C**. Shots F, G, H, I and J — prefetch gating, bar-store caps, TileManager caps, lazy hydrate —
are merged and **entirely ungraded**. I have been reporting "four shots" to the PO. That was wrong.

### 5. `ExternalStringData` retainer path — asked for, never delivered
C's census named it the top-growing constructor. LEAK-B was aimed at it by inference. The actual
retainer path was requested and never produced, so the aim was never confirmed.

### 6. The "timer outlives its resource" class sweep — started, never reported
Ordered after the immortal WebSocket ping timer was found. B began it. No result. The WebSocket case
proved the class is populated; one instance found and no sweep completed is not a closed class.

### 7. The 1.24 GB backgrounded tab — never re-measured after FIX 3
FIX 3 pauses replay when the tab is hidden. Whether that actually fixed the PO's 1.24 GB idle
background observation was never checked.

## Orders

- **C** owns the `workers: +1` attribution and the `ExternalStringData` retainer path. Both are
  census extensions on an instrument it already has.
- **C** owns characterising the single-chart CPU ceiling and the ~7.79% idle floor. This is the
  third assignment; it is now ahead of everything except calibration.
- **A** stays on Cluster C, then takes whatever C names on CPU. A does not open new leak shots until
  the existing ten are graded — authoring faster than we can measure is how we got here.
- **B** ships, so that ten ungraded shots become gradeable.
- **PO** measurement remains the authority until C's gate agrees with it.

## What I will report differently

From now on, the leak status line reads as three separate facts, never one: how many shots are
**authored**, how many are **deployed**, how many are **graded**. Today those numbers were 10, 1 and
1 while I was describing the situation as four shots and a probable kill.
