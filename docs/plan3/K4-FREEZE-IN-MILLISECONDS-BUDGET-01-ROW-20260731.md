# K4 — the freeze in milliseconds of blocked main thread, and the `BUDGET-01` row it supports

**2026-07-31 · Manager B · A/B on the live product, b118 vs b120**

> ## WITHDRAWN 15:55 — the 5.9x below is not established
>
> **The b118-vs-b120 comparison in this document is confounded and I am withdrawing its headline.**
> Do not put the 100 ms/s row into `BUDGET-01` on this evidence.
>
> The two arms were measured at different replay positions, and the metric moves by roughly the
> same factor with position alone **on one build**:
>
> | build | bars loaded at measurement | blocked ms/s |
> |---|---:|---:|
> | b120 | 579 | **55.0** |
> | b118 | 798 | 322.5 |
> | b120 | ~1,100–1,500 | 290–343 |
> | b120 | 1,930–2,592 | 302–339 |
>
> **b120 alone spans 55 to 343 ms/s depending only on how many bars were loaded.** My "b118 322.5
> versus b120 55.0" compared 798 bars against 579 bars and attributed the gap to the build. It
> cannot be attributed to the build without a b120 reading at ~800 bars, which I do not have.
>
> A second result points the same way. Restoring the defect **in place** on b120 with the shipped
> kill-switch, same build, same session, produced **no measurable change**: 334.8 / 343.7 / 303.8
> ms/s with the defect back, against 343.1 / 334.5 / 290.2 without it. If the gate defect drove the
> freeze, putting it back should have raised the number. It did not. (Caveat: the kill-switch
> restores only the gate half; the handler half has no switch.)
>
> Within the saturated range the metric is flat — correlation of bars against blocked ms/s is
> **−0.016** over five runs on one build — so the sensitivity is somewhere below ~1,000 bars,
> exactly where both arms sat.
>
> **What still stands** is this morning's *server* measurement, which was a controlled A/B taken
> within minutes on the same host with an equal-volume ungated control isolating the gate:
> `/api/health` p95 under gated load 500.5 ms (b118) → 341.2 ms (b119) → 148.7 ms (b120). The fix
> is real and measured. What is **not** established is how much user-visible main-thread freeze it
> removed.
>
> **To settle it** I need b120 measured at a matched replay position. Position is not persisted
> server-side (`config_json` is `{}`) and each run uses a fresh browser, so the bar count is a
> property of the dataset at the time of the run and I cannot simply reset it — that is the next
> piece of work, not a result.
>
> The sections below are left unedited as the record of what I measured and claimed.

## A correction to my own morning report first

What I reported at ~13:50 — 500.5 ms falling to 148.7 ms — was **server event-loop
unavailability**, measured as `/api/health` latency. That is the cause I fixed, but it is **not**
what a user feels. A user feels their own browser's main thread stop. Those are different threads.
The numbers below are the browser's, which is what was asked for and what belongs in a budget.

## Condition (a threshold without a named condition is not a threshold)

- the real product, backtest/replay mode, session 936, file 677, a real dataset
- **replay at 10x** — the speed whose sweep point is VOID
- **60 concurrent gated requests** in the background, standing in for the second heavy session
  that killed C's run
- 30 s measured, after load and replay startup, so startup is not counted
- server as deployed: `gunicorn -w 2`

## Instrument

Two independent witnesses on the same run, so neither has to be taken on trust:

- **Long Tasks API** — every task occupying the main thread over 50 ms, with its duration.
  Blocked time is the part beyond 50 ms, the Total Blocking Time convention.
- **Timer gap** — a 50 ms interval reporting how late it actually fired. A frozen thread cannot
  run timers, so the gap *is* the freeze, measured without trusting the Long Tasks implementation.

Replay progress is sampled too, because a chart can also stop while the thread stays free.

## The measurement

Same probe, same host, same account, same dataset, same 10x, same load. Only the build differs.
b118's image was saved at ship time, so this is the real defect, not a simulation of it.

| | **b118** (C's 10x run died here) | **b120** (live) | |
|---|---:|---:|---|
| **blocked main thread** | **322.5 ms/s** | **55.0 ms/s** | **5.9x better** |
| total blocked over 30 s | 9,701 ms | 1,651 ms | |
| share of wall clock blocked | **32.3%** | **5.5%** | |
| long tasks counted | 279 | 44 | |
| longest single freeze | 452 ms | 261 ms | |
| longest chart stall | 612 ms | 496 ms | |
| gated requests the load got through | 127 | 824 | 6.5x |

**On b118 the user's main thread was unavailable for roughly a third of every second, in bursts of
up to 452 ms.** That is the hang, in the units it should always have been reported in.

The last row is corroboration from a different direction: on b118 the background load completed
127 requests in 30 s versus 824 on b120. The server was jammed, which is what the morning's
server-side numbers said, and the browser figures above are that jam arriving at the user.

For contrast, one replay window at 10x with **no** load on b120 measures **0 ms/s blocked** with a
26 ms worst gap. The residual 55 ms/s is the cost of the load condition, not of idling.

## Proposed `BUDGET-01` row

> **Blocked main thread under the K4 condition: ≤ 100 ms/s.**
> Secondary: **longest single freeze ≤ 300 ms.**
> Condition: one chart in replay at 10x on a real dataset plus 60 concurrent gated requests,
> sampled over 30 s, `-w 2`.

Rationale, and why each part resists being gamed:

- **A rate, not a total.** Duration-normalised, so a shorter run cannot make it pass. This is the
  mistake the paints-per-bar row made — a denominator that improved when you ran the thing faster.
- **100 ms/s** sits between today's 55 and the defect's 322 with headroom in both directions. It
  is a ceiling that a regression halfway back to b118 would break.
- **The longest-freeze secondary matters independently.** A build could hold a good average while
  delivering one 2-second stall, which is worse for a user than steady small delays. 300 ms is
  above today's 261 and below b118's 452.
- **The condition is part of the row.** Without the named load and speed the number means nothing,
  which is precisely how a budget goes green on a broken build.

Per `VER-07` this must be sampled over time rather than at an instant — the probe records a
distribution, not a single reading, so "froze once badly" cannot hide behind a good mean.

## What this does not claim

- It is measured on **one** dataset and one session. A heavier dataset will move the absolute
  numbers; the ratio between builds is the durable part.
- 55 ms/s is **not zero**. There is still real blocking under load on b120.
- I still have not reproduced a browser two-tab hang on any build, including b118. The defect was
  in server concurrency arriving at the client, not in the tab on its own.

## Incident during this measurement, mine

The A/B rolls the canary to b118 for the RED arm and restores b120 on exit. **The restore failed
silently and I did not notice for several minutes**: I had sent `docker compose up` output to
`/dev/null` and wrote the `LIVE-PIN` file unconditionally, so the canary sat on b118 with the P0
defect present while the pin file claimed b120. My own follow-up check caught it, against the
running container rather than the pin.

Restored and verified: images `canary-20260731b120`, wire `20260731b120`, async gate and
`K4-P0-BARS-OFF-LOOP-V1` present in the running container, `get_file_bars` a sync `def`, health OK.

Two lessons applied to the scripts in `_evidence/manager-B/k4-window-claim/`: never suppress the
output of a command whose failure changes what is deployed, and never write a state file that
asserts something you have not verified against the thing itself.

## Files

`main-thread-freeze.mjs` (the probe) · `ab-b118-vs-b120.sh` (the A/B) ·
`force-restore-b120.sh` (the corrected restore) · `confirm-b120-live.sh` (verification)
