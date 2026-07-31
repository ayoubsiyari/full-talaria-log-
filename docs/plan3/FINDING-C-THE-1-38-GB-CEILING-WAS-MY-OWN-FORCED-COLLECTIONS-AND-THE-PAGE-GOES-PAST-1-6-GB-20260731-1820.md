# FINDING C — The 1.38 GB "ceiling" was not a ceiling. With forced collection removed the page sails past it to 1.6 GB, and my P0 is withdrawn.

**2026-07-31 18:20** · Manager C · build **b120** · four independent runs since 17:40
**bfcache: ENABLED (Chrome default), not under test. Declared per `RESET-01`.**
**Supersedes my own escalation `browser-death-1400mb`, which was live for four hours and which A and B were asked to treat as a P0.**

## What I escalated

I reported that the browser exits code 1, no signal, at **~1.38 GB total footprint**, that it had done so three
times, and that it therefore **capped every long run at about ten minutes**. That escalation was aimed at A and
B. It was wrong in its most important respect — not that the deaths happened, but that **1.38 GB was a
property of the product rather than of my instrument.**

## The measurements that killed it

`bend-soak` was sampling with `forceGc: true`, forcing a collection every three minutes for ten hours. I
removed it as the "clean arm" and the ceiling stopped existing:

| run | purpose | peak footprint | outcome |
| --- | --- | ---: | --- |
| Clean-arm check, 17:40 | prove the soak still samples with no forced GC | **1,526.1 MB** | survived, still climbing when stopped |
| Panel-integrity confirm, 17:52 | prove four panels advance | **1,605.1 MB** | survived |
| E-indicator verify, 18:10 | prove `ema` + `vwap` load | **1,559.7 MB** | survived |
| Reload arm, earlier today | `RESET-01` return axis | 1,395.8 MB | survived |

**Four runs above the number I called a hard ceiling, three of them above 1.5 GB, none of them dead.** The
highest reading is **1,605.1 MB — 227 MB above the "ceiling" — and it was still rising.**

## Why my own forced collections produced a fake ceiling

Two mechanisms, and I can only separate them partly.

**Forcing GC every twelve seconds in the return probe, and every three minutes in the soak, held the page at an
artificially low footprint.** That is the same confound that made the page "refuse to get heavy" and that made
29 closed trades look like 0.4 MB each. The live-versus-collected gap measured on the baseline gate is
**183.2 MB**, so the perturbation was large relative to the distance between my readings.

**And a forced collection is not free.** `HeapProfiler.collectGarbage` is a stop-the-world major GC; issuing
them repeatedly against a renderer already pinned at 120–140% CPU is a different load profile from the one a
user generates. **The deaths clustered where I was collecting hardest.** I cannot prove the collections caused
them, and I am not claiming that — what I can say is that the threshold moved the moment I stopped, which is
not the behaviour of a memory ceiling.

## The honest statement, replacing the escalation

**The browser has died three times between 1.38 and 1.40 GB and has also survived 1.53, 1.56 and 1.61 GB.** So:

- **There is no fixed ceiling at 1.38 GB.** Runs are not capped at ten minutes. The previous ten-hour attempt
  died of something load-dependent, not of a wall.
- **The deaths were real and remain unexplained.** Three exit-code-1 terminations with clean stderr is not
  nothing, and I am not closing that. It is now *"the renderer sometimes dies under heavy load, threshold
  unknown and above 1.6 GB at times"*, which is a different and much lower-priority statement.
- **A and B should not spend a cycle hunting a 1.38 GB ceiling.** That is the operative correction, and it is
  why this is published separately rather than left in a paragraph of the baseline finding.
- **The PO's 1.5 GB sessions are no longer evidence that we die below the PO's reality.** We reach 1.6 GB.

## What this cost and what it bought

It cost the wrong shape of a whole afternoon: I designed a safety ceiling (`MAX_FOOTPRINT_MB` at 1,300) into
the return probe to stop short of a wall that was not there, and declared the `RESET-01` heavy target of "a
gigabyte above first paint" unreachable **when it was reachable all along**. The heavy arms were run at a
self-imposed cap.

It bought the correction cheaply, and only because removing the confound was on the list for an unrelated
reason. **The general lesson is the uncomfortable one: I built an instrument that perturbed the system, then
measured the perturbation and escalated it as a product defect.** The gauge that finally caught it was not a
new gauge — it was the same soak with one boolean flipped.

## Consequence for the heavy `RESET-01` arms

The return-axis runs stopped the heavy phase at 1,300 MB and reported the shortfall against the 1 GB-above-
baseline target honestly. **That shortfall was self-inflicted.** Those arms should be re-run without the cap
once the paired soak is off the machine, because the return axis is supposed to be tested from a genuinely
heavy document and mine were held below the level the page can actually reach.

I am not re-running them tonight: the ten-hour paired soak owns the host, and B measured a single replay tab at
10x driving the container to ~85% CPU, so nothing else heavy can run beside it.
