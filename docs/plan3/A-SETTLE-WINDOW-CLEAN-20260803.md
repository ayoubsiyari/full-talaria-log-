# Settle window, re-taken on an exclusive host — A, 2026-08-03 15:22+01:00

Three arms, four panels, b126, one instrument (`scripts/competitor-arena-reference.mjs --self`), sequenced by `scripts/idle-transient-clean-retake.mjs` (`a703e727c`), read by `scripts/idle-window-report.mjs` (`544985d22`). 13 samples per arm out to ~654 s measured. Nothing else was measuring: each arm held RUN-LOCK-01 and no other lane's claim was live.

This replaces the guidance I gave C at 23:55+01:00 on 2026-08-02 and withdrew at 00:23+01:00 on 2026-08-03, which came entirely from contended runs.

## The protocol, in one line

**Read no earlier than 165 seconds measured after load, quote measured seconds rather than sample labels, and never quote a load-time figure.**

## Why: the sequences

| measured | dpr 1 total / GPU | dpr 2 arm A total / GPU | dpr 2 arm B total / GPU |
|---|---|---|---|
| 0 s (loaded) | 417.17 / 93.38 | **638.53 / 320.11** | **468.02 / 145.89** |
| 55 s | 447.40 / 137.80 | 439.77 / 131.06 | 446.47 / 143.69 |
| 109 s | 408.02 / 99.02 | 443.89 / 137.09 | 457.37 / 154.49 |
| 163 s | 407.64 / 99.05 | 441.73 / 137.10 | 452.12 / 151.57 |
| 327 s | 410.77 / 99.12 | 442.73 / 137.21 | 453.24 / 151.76 |
| 654 s | 408.84 / 99.18 | 442.78 / 137.27 | 455.44 / 151.87 |

All three arms are flat inside ±2.6 MB from 163 s to 654 s. Waiting longer than ~3 minutes buys nothing.

## Three findings, in order of what they cost

**1. The load-time figure is not reproducible, and the settled figure is.** At dpr 2, two runs eleven minutes apart on the same host with the same instrument read **638.53 MB and 468.02 MB at load — 170.5 MB apart** — while their settled figures agreed within **12.7 MB** (442.78 vs 455.44). A number quoted from load is not a measurement of the product; it is a measurement of where the sample landed inside a transient. Every memory figure at the seal is quoted against a floor, so this is the row that decides whether those quotes mean anything.

**2. Sample labels understate elapsed time by about 1.8×.** `idle+30s` is 55 s of wall clock, `idle+60s` is 109 s, `idle+90s` is 163 s — each sample costs a forced collection, a settle and an OS process query, and the label counts only the nominal interval. A protocol that says "wait 90 s" and is implemented from labels waits 163 s; one implemented from the clock waits 90 s and lands inside the transient. State the measured seconds.

**3. My "direction depends on dpr" caution does not survive a clean host, and the PO boarded it as a direct input to this protocol.** What I reported from contended runs was dpr 1 falling (411.59 → 396.52) and dpr 2 rising (460.33 → 489.58). Clean, dpr 1 *rises* to a GPU peak at 55 s (+44.42 MB GPU) and then decommits, while dpr 2 arm A *falls* 189.05 MB GPU immediately and arm B dips then recovers. The common structure is **a GPU transient across the first ~110 s whose sign depends on where the load sample falls inside it** — not on dpr. Withdraw the dpr-direction rule; keep the "settle is not monotonic decay" conclusion, which all three arms support.

## What this says about the 180 MB GPU question

Settled GPU for four layered panels is **99.2 MB at dpr 1** and **137.3–151.9 MB at dpr 2** (n=2, spread 14.5 MB). The 180+ MB GPU figures in earlier readings were load transients: dpr 2 arm A touched **320.11 MB** at load before decommitting to 137. A competitor comparison must use settled figures at a stated dpr, or it compares our transient against their steady state.

## Error bars to quote

- dpr 1: settled total 408.8 MB, GPU 99.2 MB (n=1).
- dpr 2: settled total 442.8 / 455.4 MB, GPU 137.3 / 151.9 MB (n=2, spreads 12.7 and 14.5 MB).
- Treat anything inside ±15 MB at dpr 2 as indistinguishable until n ≥ 3.

## What this does not establish

Idle only. No pair switching, no replay, no panel churn. A settle window for an *idle* surface does not license the same wait for a reading taken after activity, where allocators have a different history. C's soak needs its own check that the window still holds after workload, and the cheapest version is one arm of this series run after a pair-switch sequence rather than after boot.
